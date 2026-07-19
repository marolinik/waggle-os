/**
 * Backup & Restore Routes — encrypted ZIP-style archive of ~/.waggle/ for machine migration.
 *
 * Endpoints:
 *   POST /api/backup          — create and stream an encrypted backup archive
 *   POST /api/restore         — accept an encrypted backup and restore to dataDir
 *   GET  /api/backup/metadata — get last backup info
 *
 * Archive format: AES-256-GCM encrypted payload wrapping a JSON-encoded file map.
 * Extension: .waggle-backup
 */

import fs from 'node:fs';
import path from 'node:path';
import * as crypto from 'node:crypto';
import * as zlib from 'node:zlib';
import type { FastifyPluginAsync } from 'fastify';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const MAGIC_HEADER = 'WAGGLE-BACKUP-V1';

/** Maximum total backup size in bytes (500 MB) */
const MAX_BACKUP_SIZE = 500 * 1024 * 1024;

/** Number of files to read per batch to limit memory pressure */
const BATCH_SIZE = 10;

/** Files/dirs to exclude from backup */
const EXCLUDE_PATTERNS = [
  'node_modules',
  '.git',
  // In-process embedding model cache (<dataDir>/models): re-downloadable
  // @huggingface/transformers ONNX weights (~90MB+), not user data. Excluding
  // keeps portable backups small and under MAX_BACKUP_SIZE.
  'models',
  'marketplace.db',
  'marketplace.db-journal',
  'marketplace.db-wal',
  'marketplace.db-shm',
];

const EXCLUDE_EXTENSIONS = ['.tmp', '.lock'];

interface BackupMetadata {
  lastBackupAt: string;
  sizeBytes: number;
  fileCount: number;
}

interface FileEntry {
  relativePath: string;
  content: string; // base64 encoded
  sizeBytes: number;
}

interface BackupManifest {
  version: 1;
  createdAt: string;
  fileCount: number;
  files: FileEntry[];
}

/** Lightweight file descriptor — path + size, no content loaded yet */
interface FileMeta {
  relativePath: string;
  fullPath: string;
  sizeBytes: number;
}

interface RestoreRoot {
  lexical: string;
  real: string;
}

function isWithinRoot(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function pathExistsByLstat(candidate: string): boolean {
  try {
    fs.lstatSync(candidate);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ENOTDIR') return false;
    throw error;
  }
}

/** Find the nearest existing path without following a dangling final link. */
function deepestExisting(candidate: string): string {
  let current = candidate;
  while (!pathExistsByLstat(current)) {
    const parent = path.dirname(current);
    if (parent === current) return current;
    current = parent;
  }
  return current;
}

function createRestoreRoot(dataDir: string): RestoreRoot {
  const lexical = path.resolve(dataDir);
  return { lexical, real: fs.realpathSync(lexical) };
}

/**
 * Resolve an archive path under dataDir using both lexical and filesystem-aware
 * containment. Both slash styles are separators because archives are portable
 * and may be restored on Windows even when authored elsewhere.
 */
function resolveRestorePath(root: RestoreRoot, relativePath: unknown): string {
  if (typeof relativePath !== 'string' || relativePath.length === 0 || relativePath.includes('\0')) {
    throw new Error('Invalid backup path');
  }

  if (path.posix.isAbsolute(relativePath) || path.win32.isAbsolute(relativePath) || /^[A-Za-z]:/.test(relativePath)) {
    throw new Error('Invalid backup path');
  }

  const segments = relativePath.split(/[\\/]+/);
  if (segments.some(segment => segment === '' || segment === '.' || segment === '..')) {
    throw new Error('Invalid backup path');
  }

  const resolved = path.resolve(root.lexical, ...segments);
  if (!isWithinRoot(root.lexical, resolved)) {
    throw new Error('Invalid backup path');
  }

  // realpath the deepest existing ancestor so a not-yet-created child under a
  // symlink or Windows junction cannot escape through a lexically in-root path.
  const realExisting = fs.realpathSync(deepestExisting(resolved));
  if (!isWithinRoot(root.real, realExisting)) {
    throw new Error('Invalid backup path');
  }

  return resolved;
}

function writeRestoreFile(root: RestoreRoot, relativePath: string, content: Buffer): void {
  const resolved = resolveRestorePath(root, relativePath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });

  // Revalidate after directory creation and immediately before opening. New
  // files use O_EXCL; existing files are opened without truncation, revalidated,
  // and only then truncated. O_NOFOLLOW closes the final-link race on platforms
  // that expose it (Windows junction ancestors remain covered by realpath).
  const confirmed = resolveRestorePath(root, relativePath);
  if (confirmed !== resolved) throw new Error('Invalid backup path');

  const exists = pathExistsByLstat(confirmed);
  const noFollow = fs.constants.O_NOFOLLOW ?? 0;
  const flags = fs.constants.O_WRONLY
    | noFollow
    | (exists ? 0 : fs.constants.O_CREAT | fs.constants.O_EXCL);
  const fd = fs.openSync(confirmed, flags, 0o666);
  try {
    if (resolveRestorePath(root, relativePath) !== confirmed) {
      throw new Error('Invalid backup path');
    }
    fs.ftruncateSync(fd, 0);
    fs.writeFileSync(fd, content);
  } finally {
    fs.closeSync(fd);
  }

}

/**
 * Recursively enumerate files in a directory, collecting paths and sizes
 * without reading content into memory. Respects exclusion rules.
 */
function enumerateFiles(baseDir: string, currentDir: string = baseDir): FileMeta[] {
  const entries: FileMeta[] = [];

  let items: fs.Dirent[];
  try {
    items = fs.readdirSync(currentDir, { withFileTypes: true });
  } catch {
    return entries;
  }

  for (const item of items) {
    const fullPath = path.join(currentDir, item.name);
    const relativePath = path.relative(baseDir, fullPath).replace(/\\/g, '/');

    // Check exclusions
    if (EXCLUDE_PATTERNS.includes(item.name)) continue;
    if (EXCLUDE_EXTENSIONS.some(ext => item.name.endsWith(ext))) continue;

    if (item.isDirectory()) {
      entries.push(...enumerateFiles(baseDir, fullPath));
    } else if (item.isFile()) {
      try {
        const stat = fs.statSync(fullPath);
        entries.push({ relativePath, fullPath, sizeBytes: stat.size });
      } catch {
        // Skip files we can't stat (locked, permission denied)
      }
    }
  }

  return entries;
}

/**
 * Read file content for a batch of FileMeta entries, returning FileEntry[].
 * Only loads `batchSize` files into memory at a time.
 */
function readFileBatch(metas: FileMeta[]): FileEntry[] {
  const entries: FileEntry[] = [];
  for (const meta of metas) {
    try {
      const content = fs.readFileSync(meta.fullPath);
      entries.push({
        relativePath: meta.relativePath,
        content: content.toString('base64'),
        sizeBytes: content.length,
      });
    } catch {
      // Skip files we can't read (locked, permission denied)
    }
  }
  return entries;
}

/**
 * Legacy helper kept for backward compatibility with tests and internal callers.
 * Collects all files in one pass (loads content into memory).
 */
function collectFiles(baseDir: string, currentDir: string = baseDir): FileEntry[] {
  const metas = enumerateFiles(baseDir, currentDir);
  return readFileBatch(metas);
}

/**
 * Encrypt a buffer using AES-256-GCM with the given key.
 * Returns: MAGIC_HEADER + iv(16) + authTag(16) + ciphertext
 */
function encryptArchive(data: Buffer, key: Buffer): Buffer {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
  const authTag = cipher.getAuthTag();

  const header = Buffer.from(MAGIC_HEADER, 'utf-8');
  return Buffer.concat([header, iv, authTag, encrypted]);
}

/**
 * Decrypt an archive buffer using AES-256-GCM.
 * Expects: MAGIC_HEADER + iv(16) + authTag(16) + ciphertext
 */
function decryptArchive(data: Buffer, key: Buffer): Buffer {
  const headerLen = Buffer.from(MAGIC_HEADER, 'utf-8').length;
  const header = data.subarray(0, headerLen).toString('utf-8');

  if (header !== MAGIC_HEADER) {
    throw new Error('Invalid backup file: missing magic header');
  }

  const iv = data.subarray(headerLen, headerLen + IV_LENGTH);
  const authTag = data.subarray(headerLen + IV_LENGTH, headerLen + IV_LENGTH + 16);
  const ciphertext = data.subarray(headerLen + IV_LENGTH + 16);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

/**
 * Get or create the backup encryption key from the vault key file.
 * If no vault key exists, returns null (unencrypted backup).
 */
function getEncryptionKey(dataDir: string): Buffer | null {
  const keyPath = path.join(dataDir, '.vault-key');
  try {
    if (fs.existsSync(keyPath)) {
      return Buffer.from(fs.readFileSync(keyPath, 'utf-8').trim(), 'hex');
    }
  } catch {
    // Key file unreadable
  }
  return null;
}

export const backupRoutes: FastifyPluginAsync = async (server) => {
  // POST /api/backup — create and return an encrypted backup
  server.post('/api/backup', async (_request, reply) => {
    const dataDir = server.localConfig.dataDir;

    if (!dataDir || !fs.existsSync(dataDir)) {
      return reply.status(500).send({ error: 'Data directory not found' });
    }

    // Phase 1: Enumerate files (paths + sizes only — no content in memory)
    const fileMetas = enumerateFiles(dataDir);

    if (fileMetas.length === 0) {
      return reply.status(400).send({ error: 'No files found to backup' });
    }

    // Phase 2: Check size cap before reading any content
    const totalSize = fileMetas.reduce((sum, m) => sum + m.sizeBytes, 0);
    if (totalSize > MAX_BACKUP_SIZE) {
      const sizeMB = Math.round(totalSize / (1024 * 1024));
      return reply.status(413).send({
        error: `Backup would be ${sizeMB} MB which exceeds the 500 MB limit. Remove large files from your data directory or contact support.`,
      });
    }

    // Phase 3: Read files in batches to limit peak memory usage
    const allFiles: FileEntry[] = [];
    for (let i = 0; i < fileMetas.length; i += BATCH_SIZE) {
      const batch = fileMetas.slice(i, i + BATCH_SIZE);
      const entries = readFileBatch(batch);
      allFiles.push(...entries);
    }

    // Build manifest
    const manifest: BackupManifest = {
      version: 1,
      createdAt: new Date().toISOString(),
      fileCount: allFiles.length,
      files: allFiles,
    };

    // Serialize and compress
    const jsonData = Buffer.from(JSON.stringify(manifest), 'utf-8');
    const compressed = zlib.gzipSync(jsonData);

    // Encrypt if vault key exists
    const encryptionKey = getEncryptionKey(dataDir);
    let archiveData: Buffer;
    let encrypted = false;

    if (encryptionKey) {
      archiveData = encryptArchive(compressed, encryptionKey);
      encrypted = true;
    } else {
      // Unencrypted: just prepend the magic header so we can detect format
      const header = Buffer.from(MAGIC_HEADER, 'utf-8');
      // Mark unencrypted with a zero-IV sentinel (all zeros = unencrypted)
      const zeroIv = Buffer.alloc(IV_LENGTH, 0);
      const zeroTag = Buffer.alloc(16, 0);
      archiveData = Buffer.concat([header, zeroIv, zeroTag, compressed]);
    }

    // Save backup metadata
    const metadataPath = path.join(dataDir, 'backup-metadata.json');
    const metadata: BackupMetadata = {
      lastBackupAt: manifest.createdAt,
      sizeBytes: archiveData.length,
      fileCount: allFiles.length,
    };
    try {
      fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');
    } catch {
      // Non-blocking — metadata write failure should not prevent backup
    }

    // Stream the backup file
    const date = new Date().toISOString().slice(0, 10);
    reply.header('Content-Type', 'application/octet-stream');
    reply.header('Content-Disposition', `attachment; filename="waggle-backup-${date}.waggle-backup"`);
    reply.header('X-Waggle-Backup-Encrypted', encrypted ? 'true' : 'false');
    reply.header('X-Waggle-Backup-Files', String(allFiles.length));
    return reply.send(archiveData);
  });

  // POST /api/restore — accept a backup file and restore to dataDir
  server.post('/api/restore', {
    config: {
      rawBody: true,
    },
  }, async (request, reply) => {
    const dataDir = server.localConfig.dataDir;
    const body = request.body as { backup?: string; preview?: boolean } | undefined;

    if (!body?.backup) {
      return reply.status(400).send({ error: 'backup field (base64-encoded archive) is required' });
    }

    const archiveBuffer = Buffer.from(body.backup, 'base64');

    // Validate magic header
    const headerLen = Buffer.from(MAGIC_HEADER, 'utf-8').length;
    if (archiveBuffer.length < headerLen + IV_LENGTH + 16) {
      return reply.status(400).send({ error: 'Invalid backup file: too small' });
    }

    const header = archiveBuffer.subarray(0, headerLen).toString('utf-8');
    if (header !== MAGIC_HEADER) {
      return reply.status(400).send({ error: 'Invalid backup file: not a Waggle backup' });
    }

    // Check if encrypted (non-zero IV means encrypted)
    const iv = archiveBuffer.subarray(headerLen, headerLen + IV_LENGTH);
    const isEncrypted = !iv.every(b => b === 0);

    let compressed: Buffer;

    if (isEncrypted) {
      const encryptionKey = getEncryptionKey(dataDir);
      if (!encryptionKey) {
        return reply.status(400).send({
          error: 'Backup is encrypted but no vault key found. Cannot decrypt.',
        });
      }

      try {
        compressed = decryptArchive(archiveBuffer, encryptionKey);
      } catch (err) {
        return reply.status(400).send({
          error: `Decryption failed: ${err instanceof Error ? err.message : 'wrong key or corrupted file'}`,
        });
      }
    } else {
      // Unencrypted: skip header + zero IV + zero tag
      compressed = archiveBuffer.subarray(headerLen + IV_LENGTH + 16);
    }

    // Decompress
    let manifestJson: string;
    try {
      const decompressed = zlib.gunzipSync(compressed);
      manifestJson = decompressed.toString('utf-8');
    } catch {
      return reply.status(400).send({ error: 'Backup file is corrupted: decompression failed' });
    }

    // Parse manifest
    let manifest: BackupManifest;
    try {
      manifest = JSON.parse(manifestJson);
      if (manifest.version !== 1 || !Array.isArray(manifest.files)) {
        throw new Error('Invalid manifest structure');
      }
    } catch {
      return reply.status(400).send({ error: 'Backup file is corrupted: invalid manifest' });
    }

    const restoreRoot = createRestoreRoot(dataDir);

    // Preview mode: return what will be restored without applying
    if (body.preview) {
      const existingFiles: string[] = [];
      const newFiles: string[] = [];

      for (const file of manifest.files) {
        let targetPath: string;
        try {
          targetPath = resolveRestorePath(restoreRoot, file.relativePath);
        } catch {
          return reply.status(400).send({ error: `Invalid backup path: ${String(file.relativePath)}` });
        }
        if (fs.existsSync(targetPath)) {
          existingFiles.push(file.relativePath);
        } else {
          newFiles.push(file.relativePath);
        }
      }

      return {
        preview: true,
        backupCreatedAt: manifest.createdAt,
        totalFiles: manifest.fileCount,
        existingFiles,
        newFiles,
        conflicts: existingFiles,
      };
    }

    // Apply restore
    let filesRestored = 0;
    const conflicts: string[] = [];
    const errors: string[] = [];

    for (const file of manifest.files) {
      // Skip marketplace.db — it re-syncs on startup
      if (file.relativePath === 'marketplace.db') continue;

      let resolved: string;
      try {
        resolved = resolveRestorePath(restoreRoot, file.relativePath);
      } catch {
        errors.push(`Skipped ${file.relativePath}: path traversal detected`);
        continue;
      }

      // Track conflicts — use the confirmed in-root path, never a raw join.
      if (fs.existsSync(resolved)) {
        conflicts.push(file.relativePath);
      }

      try {
        const content = Buffer.from(file.content, 'base64');
        writeRestoreFile(restoreRoot, file.relativePath, content);
        filesRestored++;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'unknown error';
        if (message === 'Invalid backup path') {
          errors.push(`Skipped ${file.relativePath}: path traversal detected`);
        } else {
          errors.push(`Failed to restore ${file.relativePath}: ${message}`);
        }
      }
    }

    return {
      restored: true,
      filesRestored,
      totalFiles: manifest.fileCount,
      conflicts,
      errors: errors.length > 0 ? errors : undefined,
      backupCreatedAt: manifest.createdAt,
    };
  });

  // GET /api/backup/metadata — get last backup info
  server.get('/api/backup/metadata', async (_request, reply) => {
    const dataDir = server.localConfig.dataDir;
    const metadataPath = path.join(dataDir, 'backup-metadata.json');

    try {
      if (fs.existsSync(metadataPath)) {
        const raw = fs.readFileSync(metadataPath, 'utf-8');
        return JSON.parse(raw);
      }
    } catch {
      // Corrupted metadata — return empty
    }

    return reply.status(404).send({ error: 'No backup metadata found' });
  });
};

/** Exported for testing */
export { MAX_BACKUP_SIZE, BATCH_SIZE, enumerateFiles };
