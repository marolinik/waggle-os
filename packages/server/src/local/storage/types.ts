/** File entry returned by all storage operations */
export interface FileEntry {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  mimeType?: string;
  modifiedAt?: string;
  createdAt?: string;
}

/** Abstract storage backend — implemented by Virtual, Local, and Team providers */
export interface StorageProvider {
  list(dirPath: string): Promise<FileEntry[]>;
  read(filePath: string): Promise<Buffer>;
  write(filePath: string, data: Buffer, mime?: string): Promise<FileEntry>;
  delete(targetPath: string): Promise<void>;
  move(from: string, to: string): Promise<FileEntry>;
  copy(from: string, to: string): Promise<FileEntry>;
  mkdir(dirPath: string): Promise<FileEntry>;
  exists(targetPath: string): Promise<boolean>;
}

/** Standard directories auto-created in every workspace */
export const STANDARD_DIRS = ['attachments', 'exports', 'notes'];

/** Max upload size in bytes (100 MB) */
export const MAX_UPLOAD_SIZE = 100 * 1024 * 1024;
