/**
 * FileStore — workspace file storage abstraction.
 *
 * Provides a clean interface for reading/writing workspace files that abstracts
 * over the underlying storage backend. Two implementations:
 *
 * - LocalFileStore: manages files in ~/.waggle/workspaces/{id}/files/ (virtual storage)
 * - LinkedDirStore: reads/writes to workspace.directory (linked to external folder)
 * - S3FileStore: MinIO/S3-backed storage for team/cloud deployments (lazy SDK import)
 *
 * All operations enforce path traversal protection — files cannot escape
 * the workspace boundary.
 */

import fs from 'node:fs';
import path from 'node:path';
import { glob } from 'glob';
// Type-only import: erased at compile time, so it does not force @aws-sdk/client-s3
// (a devDependency) into the runtime bundle for local-only users.
import type { S3Client } from '@aws-sdk/client-s3';

// ── Interface ───────────────────────────────────────────────────────

export interface FileEntry {
  name: string;
  path: string;         // relative to workspace root
  size: number;
  modified: string;     // ISO timestamp
  isDirectory: boolean;
}

export interface StorageInfo {
  usedBytes: number;
  fileCount: number;
  storageType: 'virtual' | 'linked';
}

export interface FileStore {
  // Read
  readFile(relativePath: string): Promise<Buffer>;
  listFiles(directory?: string): Promise<FileEntry[]>;
  searchFiles(pattern: string): Promise<FileEntry[]>;

  // Write
  writeFile(relativePath: string, content: Buffer | string): Promise<void>;
  deleteFile(relativePath: string): Promise<void>;
  moveFile(from: string, to: string): Promise<void>;

  // Meta
  getStorageInfo(): Promise<StorageInfo>;
  getRootPath(): string;
  getStorageType(): 'virtual' | 'linked';
}

// ── Path safety ─────────────────────────────────────────────────────

/**
 * Directory segments that, anywhere in a path, almost always hold secrets.
 * Matched (normalized, case-insensitive) against each path segment.
 */
const SENSITIVE_DIR_SEGMENTS = new Set([
  '.ssh', '.aws', '.gnupg', '.gpg', '.docker', '.kube', '.azure', '.terraform', '.terraform.d',
]);

/** Exact basenames (normalized) that are secret material. */
const SENSITIVE_BASENAMES = new Set([
  'id_rsa', 'id_dsa', 'id_ecdsa', 'id_ed25519', 'authorized_keys', 'known_hosts',
  '.netrc', '.pgpass', '.npmrc', '.pypirc', '.git-credentials',
  'credentials', 'credentials.json', 'service-account.json',
  'terraform.tfstate', 'terraform.tfstate.backup',
]);

/** Extensions that are (almost always) private-key material. */
const SENSITIVE_EXTENSIONS = new Set(['.pem']);

/** Backup/copy suffixes — strip and re-test the base (id_rsa.bak → id_rsa). */
const BACKUP_SUFFIX_RE = /\.(bak|old|backup|orig|copy|save|swp)$/i;

/** `.env` files are secrets — but the documented, checked-in templates are not. */
const ENV_TEMPLATE_ALLOW = new Set(['.env.example', '.env.sample', '.env.template', '.env.dist', '.env.defaults']);

/**
 * Normalize one path segment to the name the OS will actually open: lower-case
 * (case-insensitive FS), strip a Windows NTFS alternate-data-stream suffix
 * (`id_rsa::$DATA` → `id_rsa`) and any trailing dots/spaces (`id_rsa.`, `.env `
 * → the base) which Windows silently removes when opening.
 */
function normalizeSegment(seg: string): string {
  return seg.toLowerCase().replace(/::.*$/, '').replace(/[. ]+$/, '');
}

function isSensitiveBase(base: string): boolean {
  if (SENSITIVE_BASENAMES.has(base)) return true;
  const dot = base.lastIndexOf('.');
  if (dot > 0 && SENSITIVE_EXTENSIONS.has(base.slice(dot))) return true;
  if (base === '.env' || base.startsWith('.env.')) return !ENV_TEMPLATE_ALLOW.has(base);
  return false;
}

/**
 * True when a path points at well-known secret material (SSH/GPG keys, cloud
 * credentials, dotenv files, terraform state, …). Used to deny reads/writes
 * inside LINKED external folders so an agent given a project directory cannot
 * exfiltrate or clobber the user's secrets.
 *
 * It is a BLOCKLIST (defense-in-depth), not a sandbox: it raises the bar against
 * obvious secrets but cannot enumerate every secret a home dir holds. Conservative
 * on extensions (only *.pem) to avoid denying legitimate files. Path-separator
 * agnostic; segments are normalized for case + Windows ADS/trailing-char tricks.
 */
export function isSensitiveFilePath(relativePath: string): boolean {
  const segments = relativePath.replace(/\\/g, '/').split('/').map(normalizeSegment).filter(Boolean);
  if (segments.length === 0) return false;
  for (const seg of segments) {
    if (SENSITIVE_DIR_SEGMENTS.has(seg)) return true;
  }
  const base = segments[segments.length - 1];
  if (isSensitiveBase(base)) return true;
  if (BACKUP_SUFFIX_RE.test(base) && isSensitiveBase(base.replace(BACKUP_SUFFIX_RE, ''))) return true;
  return false;
}

interface ResolveSafeOptions {
  /** Reject paths flagged by isSensitiveFilePath (linked external dirs only). */
  denySensitive?: boolean;
}

/** realpathSync, falling back to the input if it can't be resolved (e.g. not created yet). */
function safeRealpath(p: string): string {
  try { return fs.realpathSync(p); } catch { return p; }
}

/** Walk up to the deepest ancestor of `p` that exists on disk. */
function deepestExisting(p: string): string {
  let cur = p;
  while (cur !== path.dirname(cur) && !fs.existsSync(cur)) cur = path.dirname(cur);
  return cur;
}

/**
 * Resolve `relativePath` under `root` and assert it cannot escape the boundary.
 *
 * Two layers:
 *  1. LEXICAL segment-boundary containment — the resolved path is the root or
 *     sits under `root + sep` (a bare `startsWith(root)` wrongly admits a sibling
 *     like `${root}-evil/secret`).
 *  2. SYMLINK-aware containment — `path.resolve` is lexical but `fs.*` follows
 *     symlinks, so we realpath the deepest EXISTING ancestor of the target and
 *     re-check it is still under the realpath'd root. This blocks a benign-named
 *     symlink that points outside the boundary, while still permitting in-root
 *     symlinks (e.g. monorepo package links). The sensitive-file deny then runs
 *     on BOTH the lexical and the real in-root path, so an in-root symlink to a
 *     secret (`alias → ./.env`) cannot launder it past a benign basename.
 */
function resolveSafe(root: string, relativePath: string, opts: ResolveSafeOptions = {}): string {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, relativePath);
  if (resolved !== resolvedRoot && !resolved.startsWith(resolvedRoot + path.sep)) {
    throw new Error(`Path traversal denied: ${relativePath}`);
  }

  // Symlink-aware containment only applies once the root exists on disk — if it
  // doesn't, nothing inside it exists to be a symlink, and walking the deepest
  // existing ancestor above the (not-yet-created) root would compare against an
  // unrelated real dir (e.g. an OS temp-dir symlink). Lexical containment holds.
  const realRoot = safeRealpath(resolvedRoot);
  let realTarget = realRoot;
  if (fs.existsSync(resolvedRoot)) {
    realTarget = safeRealpath(deepestExisting(resolved));
    if (realTarget !== realRoot && !realTarget.startsWith(realRoot + path.sep)) {
      throw new Error(`Path traversal denied (symlink): ${relativePath}`);
    }
  }

  if (opts.denySensitive) {
    const lexicalRel = path.relative(resolvedRoot, resolved);
    const realRel = path.relative(realRoot, realTarget);
    if (isSensitiveFilePath(lexicalRel) || isSensitiveFilePath(realRel)) {
      throw new Error(`Access to sensitive file denied: ${relativePath}`);
    }
  }
  return resolved;
}

/** Keep only glob matches that resolve back inside `root` (glob `../` patterns can escape cwd). */
function containGlobMatches(root: string, matches: string[]): string[] {
  const resolvedRoot = path.resolve(root);
  return matches.filter(m => {
    const abs = path.resolve(resolvedRoot, m);
    return abs === resolvedRoot || abs.startsWith(resolvedRoot + path.sep);
  });
}

function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

// ── LocalFileStore (virtual workspace storage) ──────────────────────

export class LocalFileStore implements FileStore {
  private readonly root: string;

  constructor(dataDir: string, workspaceId: string) {
    this.root = path.join(dataDir, 'workspaces', workspaceId, 'files');
  }

  getRootPath(): string { return this.root; }
  getStorageType(): 'virtual' { return 'virtual'; }

  async readFile(relativePath: string): Promise<Buffer> {
    const fullPath = resolveSafe(this.root, relativePath);
    return fs.readFileSync(fullPath);
  }

  async listFiles(directory?: string): Promise<FileEntry[]> {
    const dir = directory ? resolveSafe(this.root, directory) : this.root;
    if (!fs.existsSync(dir)) return [];

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    return entries.map(entry => {
      const fullPath = path.join(dir, entry.name);
      const stat = fs.statSync(fullPath);
      return {
        name: entry.name,
        path: path.relative(this.root, fullPath).replace(/\\/g, '/'),
        size: stat.size,
        modified: stat.mtime.toISOString(),
        isDirectory: entry.isDirectory(),
      };
    });
  }

  async searchFiles(pattern: string): Promise<FileEntry[]> {
    if (!fs.existsSync(this.root)) return [];
    const matches = await glob(pattern, {
      cwd: this.root,
      nodir: true,
      ignore: ['node_modules/**', '.git/**'],
    });
    // A glob pattern with `../` can escape cwd — keep only matches inside root.
    return containGlobMatches(this.root, matches).slice(0, 200).map(match => {
      const fullPath = path.join(this.root, match);
      try {
        const stat = fs.statSync(fullPath);
        return {
          name: path.basename(match),
          path: match.replace(/\\/g, '/'),
          size: stat.size,
          modified: stat.mtime.toISOString(),
          isDirectory: false,
        };
      } catch {
        return { name: path.basename(match), path: match, size: 0, modified: '', isDirectory: false };
      }
    });
  }

  async writeFile(relativePath: string, content: Buffer | string): Promise<void> {
    const fullPath = resolveSafe(this.root, relativePath);
    // Lazy directory creation
    ensureDir(path.dirname(fullPath));
    fs.writeFileSync(fullPath, content);
  }

  async deleteFile(relativePath: string): Promise<void> {
    const fullPath = resolveSafe(this.root, relativePath);
    if (fs.existsSync(fullPath)) {
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        fs.rmSync(fullPath, { recursive: true });
      } else {
        fs.unlinkSync(fullPath);
      }
    }
  }

  async moveFile(from: string, to: string): Promise<void> {
    const fromPath = resolveSafe(this.root, from);
    const toPath = resolveSafe(this.root, to);
    ensureDir(path.dirname(toPath));
    fs.renameSync(fromPath, toPath);
  }

  async getStorageInfo(): Promise<StorageInfo> {
    if (!fs.existsSync(this.root)) {
      return { usedBytes: 0, fileCount: 0, storageType: 'virtual' };
    }
    let usedBytes = 0;
    let fileCount = 0;
    const walk = (dir: string) => {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            walk(fullPath);
          } else {
            try {
              usedBytes += fs.statSync(fullPath).size;
              fileCount++;
            } catch { /* skip unreadable */ }
          }
        }
      } catch { /* skip unreadable dirs */ }
    };
    walk(this.root);
    return { usedBytes, fileCount, storageType: 'virtual' };
  }
}

// ── LinkedDirStore (linked to external directory) ───────────────────

export class LinkedDirStore implements FileStore {
  private readonly root: string;

  constructor(directory: string) {
    this.root = directory;
  }

  getRootPath(): string { return this.root; }
  getStorageType(): 'linked' { return 'linked'; }

  // Linked stores point at a REAL external folder (a code project, even the home
  // dir), so every path op denies well-known secret files — the agent cannot
  // read or clobber ~/.ssh, .env, cloud credentials, etc. (LocalFileStore is a
  // sandboxed virtual dir and needs no such deny.)
  private static readonly DENY = { denySensitive: true } as const;

  async readFile(relativePath: string): Promise<Buffer> {
    const fullPath = resolveSafe(this.root, relativePath, LinkedDirStore.DENY);
    return fs.readFileSync(fullPath);
  }

  async listFiles(directory?: string): Promise<FileEntry[]> {
    const dir = directory ? resolveSafe(this.root, directory, LinkedDirStore.DENY) : this.root;
    if (!fs.existsSync(dir)) return [];

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    return entries
      .filter(e => !e.name.startsWith('.') && e.name !== 'node_modules')
      // Don't disclose the existence/size/mtime of non-dot secrets (credentials.json,
      // id_rsa, known_hosts, …) — symmetric with searchFiles + the read deny.
      .filter(e => !isSensitiveFilePath(e.name))
      .map(entry => {
        const fullPath = path.join(dir, entry.name);
        try {
          const stat = fs.statSync(fullPath);
          return {
            name: entry.name,
            path: path.relative(this.root, fullPath).replace(/\\/g, '/'),
            size: stat.size,
            modified: stat.mtime.toISOString(),
            isDirectory: entry.isDirectory(),
          };
        } catch {
          return { name: entry.name, path: entry.name, size: 0, modified: '', isDirectory: false };
        }
      });
  }

  async searchFiles(pattern: string): Promise<FileEntry[]> {
    const matches = await glob(pattern, {
      cwd: this.root,
      nodir: true,
      ignore: ['node_modules/**', '.git/**', 'dist/**', 'build/**', '**/.ssh/**', '**/.aws/**', '**/.gnupg/**'],
    });
    // Contain `../`-escaping globs to the root, then drop any secret a creative
    // pattern still matched — search never discloses the existence/path of secrets.
    return containGlobMatches(this.root, matches).filter(m => !isSensitiveFilePath(m)).slice(0, 200).map(match => {
      const fullPath = path.join(this.root, match);
      try {
        const stat = fs.statSync(fullPath);
        return {
          name: path.basename(match),
          path: match.replace(/\\/g, '/'),
          size: stat.size,
          modified: stat.mtime.toISOString(),
          isDirectory: false,
        };
      } catch {
        return { name: path.basename(match), path: match, size: 0, modified: '', isDirectory: false };
      }
    });
  }

  async writeFile(relativePath: string, content: Buffer | string): Promise<void> {
    const fullPath = resolveSafe(this.root, relativePath, LinkedDirStore.DENY);
    ensureDir(path.dirname(fullPath));
    fs.writeFileSync(fullPath, content);
  }

  async deleteFile(relativePath: string): Promise<void> {
    const fullPath = resolveSafe(this.root, relativePath, LinkedDirStore.DENY);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }
  }

  async moveFile(from: string, to: string): Promise<void> {
    const fromPath = resolveSafe(this.root, from, LinkedDirStore.DENY);
    const toPath = resolveSafe(this.root, to, LinkedDirStore.DENY);
    ensureDir(path.dirname(toPath));
    fs.renameSync(fromPath, toPath);
  }

  async getStorageInfo(): Promise<StorageInfo> {
    if (!fs.existsSync(this.root)) {
      return { usedBytes: 0, fileCount: 0, storageType: 'linked' };
    }
    let usedBytes = 0;
    let fileCount = 0;
    const walk = (dir: string, depth = 0) => {
      if (depth > 5) return; // Don't walk too deep in linked dirs
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name === 'node_modules' || entry.name === '.git') continue;
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            walk(fullPath, depth + 1);
          } else {
            try {
              usedBytes += fs.statSync(fullPath).size;
              fileCount++;
            } catch { /* skip */ }
          }
        }
      } catch { /* skip */ }
    };
    walk(this.root);
    return { usedBytes, fileCount, storageType: 'linked' };
  }
}

// ── S3FileStore (MinIO/S3 for team workspace storage) ───────────────

export interface S3Config {
  endpoint: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
  prefix: string; // e.g., "workspaces/{id}/"
  region?: string;
}

export class S3FileStore implements FileStore {
  private config: S3Config;
  // Lazily constructed S3 client; the SDK is imported on first use to avoid
  // bundling it for local-only users.
  private client: S3Client | undefined;

  constructor(config: S3Config) {
    this.config = config;
  }

  private async getClient(): Promise<S3Client> {
    if (this.client) return this.client;
    const { S3Client } = await import('@aws-sdk/client-s3');
    this.client = new S3Client({
      endpoint: `http://${this.config.endpoint}`,
      region: this.config.region ?? 'us-east-1',
      credentials: {
        accessKeyId: this.config.accessKey,
        secretAccessKey: this.config.secretKey,
      },
      forcePathStyle: true, // Required for MinIO
    });
    return this.client;
  }

  getRootPath(): string { return `s3://${this.config.bucket}/${this.config.prefix}`; }
  getStorageType(): 'virtual' | 'linked' { return 'virtual'; }

  async readFile(relativePath: string): Promise<Buffer> {
    const client = await this.getClient();
    const { GetObjectCommand } = await import('@aws-sdk/client-s3');
    const key = this.config.prefix + relativePath;
    const response = await client.send(new GetObjectCommand({
      Bucket: this.config.bucket,
      Key: key,
    }));
    const body = response.Body;
    if (!body) throw new Error(`S3 object has no body: ${key}`);
    const chunks: Uint8Array[] = [];
    // In Node.js the S3 streaming body is an async-iterable readable stream.
    for await (const chunk of body as AsyncIterable<Uint8Array>) chunks.push(chunk);
    return Buffer.concat(chunks);
  }

  async writeFile(relativePath: string, content: Buffer | string): Promise<void> {
    const client = await this.getClient();
    const { PutObjectCommand } = await import('@aws-sdk/client-s3');
    const key = this.config.prefix + relativePath;
    await client.send(new PutObjectCommand({
      Bucket: this.config.bucket,
      Key: key,
      Body: typeof content === 'string' ? Buffer.from(content) : content,
    }));
  }

  async deleteFile(relativePath: string): Promise<void> {
    const client = await this.getClient();
    const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
    const key = this.config.prefix + relativePath;
    await client.send(new DeleteObjectCommand({
      Bucket: this.config.bucket,
      Key: key,
    }));
  }

  async listFiles(directory?: string): Promise<FileEntry[]> {
    const client = await this.getClient();
    const { ListObjectsV2Command } = await import('@aws-sdk/client-s3');
    const pfx = this.config.prefix + (directory ? directory + '/' : '');
    const response = await client.send(new ListObjectsV2Command({
      Bucket: this.config.bucket,
      Prefix: pfx,
      Delimiter: '/',
    }));
    const entries: FileEntry[] = [];
    for (const obj of response.Contents ?? []) {
      if (!obj.Key) continue;
      const relPath = obj.Key.slice(this.config.prefix.length);
      entries.push({
        name: relPath.split('/').pop() ?? relPath,
        path: relPath,
        size: obj.Size ?? 0,
        modified: obj.LastModified?.toISOString() ?? '',
        isDirectory: false,
      });
    }
    for (const cpfx of response.CommonPrefixes ?? []) {
      if (!cpfx.Prefix) continue;
      const relPath = cpfx.Prefix.slice(this.config.prefix.length).replace(/\/$/, '');
      entries.push({
        name: relPath.split('/').pop() ?? relPath,
        path: relPath,
        size: 0,
        modified: '',
        isDirectory: true,
      });
    }
    return entries;
  }

  async searchFiles(pattern: string): Promise<FileEntry[]> {
    const all = await this.listFiles();
    const regex = new RegExp(pattern.replace(/\*/g, '.*').replace(/\?/g, '.'), 'i');
    return all.filter(f => regex.test(f.path) || regex.test(f.name));
  }

  async moveFile(from: string, to: string): Promise<void> {
    const client = await this.getClient();
    const { CopyObjectCommand, DeleteObjectCommand } = await import('@aws-sdk/client-s3');
    const fromKey = this.config.prefix + from;
    const toKey = this.config.prefix + to;
    await client.send(new CopyObjectCommand({
      Bucket: this.config.bucket,
      CopySource: `${this.config.bucket}/${fromKey}`,
      Key: toKey,
    }));
    await client.send(new DeleteObjectCommand({
      Bucket: this.config.bucket,
      Key: fromKey,
    }));
  }

  async getStorageInfo(): Promise<StorageInfo> {
    const client = await this.getClient();
    const { ListObjectsV2Command } = await import('@aws-sdk/client-s3');
    const response = await client.send(new ListObjectsV2Command({
      Bucket: this.config.bucket,
      Prefix: this.config.prefix,
    }));
    let usedBytes = 0;
    let fileCount = 0;
    for (const obj of response.Contents ?? []) {
      usedBytes += obj.Size ?? 0;
      fileCount++;
    }
    return { usedBytes, fileCount, storageType: 'virtual' };
  }
}

// ── Factory ─────────────────────────────────────────────────────────

/**
 * Create the appropriate FileStore for a workspace.
 * If s3Config is provided, use S3FileStore (team/cloud deployment).
 * If the workspace has a linked directory, use LinkedDirStore.
 * Otherwise, use LocalFileStore (virtual managed storage).
 */
export function createFileStore(
  dataDir: string,
  workspaceId: string,
  linkedDirectory?: string,
  s3Config?: S3Config,
): FileStore {
  if (s3Config) return new S3FileStore(s3Config);
  if (linkedDirectory && fs.existsSync(linkedDirectory)) {
    return new LinkedDirStore(linkedDirectory);
  }
  return new LocalFileStore(dataDir, workspaceId);
}
