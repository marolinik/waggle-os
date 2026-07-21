import fs from 'node:fs';
import path from 'node:path';
import { lookup } from '../utils/mime.js';
import { safePath, toRelativePath, type SafePathOptions } from './security.js';
import type { StorageProvider, FileEntry } from './types.js';
import { STANDARD_DIRS } from './types.js';

/**
 * Filesystem-backed StorageProvider.
 * Used by both "virtual" storage (data in ~/.waggle/workspaces/{id}/files/)
 * and "local" storage (data at a user-specified path).
 */
export class FsStorageProvider implements StorageProvider {
  private readonly pathOptions: SafePathOptions;

  constructor(private readonly root: string, options: SafePathOptions = {}) {
    this.pathOptions = { denySensitive: options.denySensitive === true };
  }

  private resolve(userPath: string): string {
    return safePath(this.root, userPath, this.pathOptions);
  }

  /** Validate every descendant before a recursive filesystem operation. */
  private assertTreeSafe(start: string): void {
    const pending = [start];
    const visited = new Set<string>();

    while (pending.length > 0) {
      const current = pending.pop()!;
      const realCurrent = fs.realpathSync(current);
      if (visited.has(realCurrent)) continue;
      visited.add(realCurrent);

      if (!fs.statSync(current).isDirectory()) continue;
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const child = path.join(current, entry.name);
        const resolvedChild = this.resolve(path.relative(this.root, child));
        if (fs.statSync(resolvedChild).isDirectory()) pending.push(resolvedChild);
      }
    }
  }

  /** Ensure the root and standard directories exist */
  ensureStructure(): void {
    fs.mkdirSync(this.root, { recursive: true });
    for (const dir of STANDARD_DIRS) {
      fs.mkdirSync(path.join(this.root, dir), { recursive: true });
    }
  }

  async list(dirPath: string): Promise<FileEntry[]> {
    const resolved = this.resolve(dirPath === '/' || dirPath === '' ? '' : dirPath);

    if (!fs.existsSync(resolved)) return [];

    const entries = fs.readdirSync(resolved, { withFileTypes: true });
    const result: FileEntry[] = [];

    for (const entry of entries) {
      try {
        const relativePath = path.relative(this.root, path.join(resolved, entry.name));
        const fullPath = this.resolve(relativePath);
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
    const resolved = this.resolve(filePath);
    if (!fs.existsSync(resolved)) throw new Error(`File not found: ${filePath}`);
    return fs.readFileSync(resolved);
  }

  async write(filePath: string, data: Buffer, _mime?: string): Promise<FileEntry> {
    const resolved = this.resolve(filePath);
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
    const resolved = this.resolve(targetPath);
    if (!fs.existsSync(resolved)) return;
    if (this.pathOptions.denySensitive && fs.statSync(resolved).isDirectory()) {
      this.assertTreeSafe(resolved);
    }
    fs.rmSync(resolved, { recursive: true, force: true });
  }

  async move(from: string, to: string): Promise<FileEntry> {
    const resolvedFrom = this.resolve(from);
    const resolvedTo = this.resolve(to);

    if (!fs.existsSync(resolvedFrom)) throw new Error(`Source not found: ${from}`);
    if (this.pathOptions.denySensitive && fs.statSync(resolvedFrom).isDirectory()) {
      this.assertTreeSafe(resolvedFrom);
    }

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
    const resolvedFrom = this.resolve(from);
    const resolvedTo = this.resolve(to);

    if (!fs.existsSync(resolvedFrom)) throw new Error(`Source not found: ${from}`);
    this.assertTreeSafe(resolvedFrom);
    if (fs.existsSync(resolvedTo)) this.assertTreeSafe(resolvedTo);

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
    const resolved = this.resolve(dirPath);
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
      const resolved = this.resolve(targetPath);
      return fs.existsSync(resolved);
    } catch {
      return false;
    }
  }
}
