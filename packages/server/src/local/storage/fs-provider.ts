import fs from 'node:fs';
import path from 'node:path';
import { lookup } from '../utils/mime.js';
import { safePath, toRelativePath } from './security.js';
import type { StorageProvider, FileEntry } from './types.js';
import { STANDARD_DIRS } from './types.js';

/**
 * Filesystem-backed StorageProvider.
 * Used by both "virtual" storage (data in ~/.waggle/workspaces/{id}/files/)
 * and "local" storage (data at a user-specified path).
 */
export class FsStorageProvider implements StorageProvider {
  constructor(private readonly root: string) {}

  /** Ensure the root and standard directories exist */
  ensureStructure(): void {
    fs.mkdirSync(this.root, { recursive: true });
    for (const dir of STANDARD_DIRS) {
      fs.mkdirSync(path.join(this.root, dir), { recursive: true });
    }
  }

  async list(dirPath: string): Promise<FileEntry[]> {
    const resolved = dirPath === '/' || dirPath === '' ? this.root : safePath(this.root, dirPath);

    if (!fs.existsSync(resolved)) return [];

    const entries = fs.readdirSync(resolved, { withFileTypes: true });
    const result: FileEntry[] = [];

    for (const entry of entries) {
      const fullPath = path.join(resolved, entry.name);
      try {
        const stat = fs.statSync(fullPath);
        const relPath = toRelativePath(this.root, fullPath);

        if (entry.isDirectory()) {
          result.push({
            name: entry.name,
            path: relPath,
            type: 'directory',
            modifiedAt: stat.mtime.toISOString(),
          });
        } else if (entry.isFile()) {
          result.push({
            name: entry.name,
            path: relPath,
            type: 'file',
            size: stat.size,
            mimeType: lookup(entry.name),
            modifiedAt: stat.mtime.toISOString(),
            createdAt: stat.birthtime.toISOString(),
          });
        }
      } catch {
        // Skip inaccessible entries
      }
    }

    // Sort: directories first, then alphabetical
    result.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    return result;
  }

  async read(filePath: string): Promise<Buffer> {
    const resolved = safePath(this.root, filePath);
    if (!fs.existsSync(resolved)) throw new Error(`File not found: ${filePath}`);
    return fs.readFileSync(resolved);
  }

  async write(filePath: string, data: Buffer, _mime?: string): Promise<FileEntry> {
    const resolved = safePath(this.root, filePath);
    const dir = path.dirname(resolved);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(resolved, data);

    const stat = fs.statSync(resolved);
    const name = path.basename(resolved);
    return {
      name,
      path: toRelativePath(this.root, resolved),
      type: 'file',
      size: stat.size,
      mimeType: lookup(name),
      modifiedAt: stat.mtime.toISOString(),
      createdAt: stat.birthtime.toISOString(),
    };
  }

  async delete(targetPath: string): Promise<void> {
    const resolved = safePath(this.root, targetPath);
    if (!fs.existsSync(resolved)) return;
    fs.rmSync(resolved, { recursive: true, force: true });
  }

  async move(from: string, to: string): Promise<FileEntry> {
    const resolvedFrom = safePath(this.root, from);
    const resolvedTo = safePath(this.root, to);

    if (!fs.existsSync(resolvedFrom)) throw new Error(`Source not found: ${from}`);

    fs.mkdirSync(path.dirname(resolvedTo), { recursive: true });
    fs.renameSync(resolvedFrom, resolvedTo);

    const stat = fs.statSync(resolvedTo);
    const name = path.basename(resolvedTo);
    return {
      name,
      path: toRelativePath(this.root, resolvedTo),
      type: stat.isDirectory() ? 'directory' : 'file',
      size: stat.isFile() ? stat.size : undefined,
      mimeType: stat.isFile() ? lookup(name) : undefined,
      modifiedAt: stat.mtime.toISOString(),
      createdAt: stat.birthtime.toISOString(),
    };
  }

  async copy(from: string, to: string): Promise<FileEntry> {
    const resolvedFrom = safePath(this.root, from);
    const resolvedTo = safePath(this.root, to);

    if (!fs.existsSync(resolvedFrom)) throw new Error(`Source not found: ${from}`);

    fs.mkdirSync(path.dirname(resolvedTo), { recursive: true });
    fs.cpSync(resolvedFrom, resolvedTo, { recursive: true });

    const stat = fs.statSync(resolvedTo);
    const name = path.basename(resolvedTo);
    return {
      name,
      path: toRelativePath(this.root, resolvedTo),
      type: stat.isDirectory() ? 'directory' : 'file',
      size: stat.isFile() ? stat.size : undefined,
      mimeType: stat.isFile() ? lookup(name) : undefined,
      modifiedAt: stat.mtime.toISOString(),
      createdAt: stat.birthtime.toISOString(),
    };
  }

  async mkdir(dirPath: string): Promise<FileEntry> {
    const resolved = safePath(this.root, dirPath);
    fs.mkdirSync(resolved, { recursive: true });
    const stat = fs.statSync(resolved);
    return {
      name: path.basename(resolved),
      path: toRelativePath(this.root, resolved),
      type: 'directory',
      modifiedAt: stat.mtime.toISOString(),
    };
  }

  async exists(targetPath: string): Promise<boolean> {
    try {
      const resolved = safePath(this.root, targetPath);
      return fs.existsSync(resolved);
    } catch {
      return false;
    }
  }
}
