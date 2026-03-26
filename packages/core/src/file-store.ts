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

function resolveSafe(root: string, relativePath: string): string {
  const resolved = path.resolve(root, relativePath);
  if (!resolved.startsWith(path.resolve(root))) {
    throw new Error(`Path traversal denied: ${relativePath}`);
  }
  return resolved;
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
    return matches.slice(0, 200).map(match => {
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

  async readFile(relativePath: string): Promise<Buffer> {
    const fullPath = resolveSafe(this.root, relativePath);
    return fs.readFileSync(fullPath);
  }

  async listFiles(directory?: string): Promise<FileEntry[]> {
    const dir = directory ? resolveSafe(this.root, directory) : this.root;
    if (!fs.existsSync(dir)) return [];

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    return entries
      .filter(e => !e.name.startsWith('.') && e.name !== 'node_modules')
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
      ignore: ['node_modules/**', '.git/**', 'dist/**', 'build/**'],
    });
    return matches.slice(0, 200).map(match => {
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
    ensureDir(path.dirname(fullPath));
    fs.writeFileSync(fullPath, content);
  }

  async deleteFile(relativePath: string): Promise<void> {
    const fullPath = resolveSafe(this.root, relativePath);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
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
  private client: any; // S3Client — lazy import to avoid bundling for local-only users

  constructor(config: S3Config) {
    this.config = config;
  }

  private async getClient() {
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
    const chunks: Uint8Array[] = [];
    for await (const chunk of response.Body as any) chunks.push(chunk);
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
