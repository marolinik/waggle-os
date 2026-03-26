import path from 'node:path';
import { FsStorageProvider } from './fs-provider.js';
import type { StorageProvider } from './types.js';

export type { StorageProvider, FileEntry } from './types.js';
export { STANDARD_DIRS, MAX_UPLOAD_SIZE } from './types.js';
export { FsStorageProvider } from './fs-provider.js';
export { safePath, toRelativePath } from './security.js';

interface WorkspaceLike {
  id: string;
  storageType?: 'virtual' | 'local' | 'team';
  storagePath?: string;
  storageConfig?: Record<string, unknown>;
}

/**
 * Resolve the correct StorageProvider for a workspace.
 * @param workspace  Workspace object with storage config
 * @param dataDir    Server data directory (e.g., ~/.waggle)
 */
export function getStorageProvider(workspace: WorkspaceLike, dataDir: string): StorageProvider {
  switch (workspace.storageType) {
    case 'local': {
      if (!workspace.storagePath) {
        throw new Error(`Workspace "${workspace.id}" has storageType=local but no storagePath`);
      }
      return new FsStorageProvider(workspace.storagePath);
    }

    case 'team': {
      // Team storage (S3/MinIO) — stub for now, falls back to virtual
      // TODO: implement TeamStorageProvider with @aws-sdk/client-s3
      const virtualRoot = path.join(dataDir, 'workspaces', workspace.id, 'files');
      return new FsStorageProvider(virtualRoot);
    }

    case 'virtual':
    default: {
      const virtualRoot = path.join(dataDir, 'workspaces', workspace.id, 'files');
      return new FsStorageProvider(virtualRoot);
    }
  }
}
