/**
 * S3StorageProvider — adapts the core S3FileStore to the StorageProvider interface.
 * Used for team workspace files backed by MinIO/S3.
 */

import { S3FileStore, type S3Config, type FileEntry as CoreFileEntry } from '@waggle/core';
import type { StorageProvider, FileEntry } from './types.js';

function coreToProvider(f: CoreFileEntry): FileEntry {
  return {
    name: f.name,
    path: f.path,
    type: f.isDirectory ? 'directory' : 'file',
    size: f.size,
    modifiedAt: f.modified,
  };
}

export class S3StorageProvider implements StorageProvider {
  private store: S3FileStore;

  constructor(config: S3Config) {
    this.store = new S3FileStore(config);
  }

  async list(dirPath: string): Promise<FileEntry[]> {
    const files = await this.store.listFiles(dirPath);
    return files.map(coreToProvider);
  }

  async read(filePath: string): Promise<Buffer> {
    return this.store.readFile(filePath);
  }

  async write(filePath: string, data: Buffer): Promise<FileEntry> {
    await this.store.writeFile(filePath, data);
    return { name: filePath.split('/').pop() ?? filePath, path: filePath, type: 'file', size: data.length };
  }

  async delete(targetPath: string): Promise<void> {
    await this.store.deleteFile(targetPath);
  }

  async move(from: string, to: string): Promise<FileEntry> {
    await this.store.moveFile(from, to);
    return { name: to.split('/').pop() ?? to, path: to, type: 'file' };
  }

  async copy(from: string, to: string): Promise<FileEntry> {
    // S3 copy: read + write (S3FileStore doesn't have native copy)
    const data = await this.store.readFile(from);
    await this.store.writeFile(to, data);
    return { name: to.split('/').pop() ?? to, path: to, type: 'file', size: data.length };
  }

  async mkdir(dirPath: string): Promise<FileEntry> {
    // S3 doesn't have real directories — write a zero-byte marker
    await this.store.writeFile(dirPath + '/.keep', Buffer.alloc(0));
    return { name: dirPath.split('/').pop() ?? dirPath, path: dirPath, type: 'directory' };
  }

  async exists(targetPath: string): Promise<boolean> {
    try {
      await this.store.readFile(targetPath);
      return true;
    } catch {
      return false;
    }
  }
}
