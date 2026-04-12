import path from 'node:path';
import { FsStorageProvider } from './fs-provider.js';
import { S3StorageProvider } from './s3-provider.js';
import type { StorageProvider } from './types.js';
import type { S3Config } from '@waggle/core';

export type { StorageProvider, FileEntry } from './types.js';
export { STANDARD_DIRS, MAX_UPLOAD_SIZE } from './types.js';
export { FsStorageProvider } from './fs-provider.js';
export { S3StorageProvider } from './s3-provider.js';
export { safePath, toRelativePath } from './security.js';

interface WorkspaceLike {
  id: string;
  storageType?: 'virtual' | 'local' | 'team';
  storagePath?: string;
  storageConfig?: Record<string, unknown>;
}

/**
 * Resolve the correct StorageProvider for a workspace.
 *
 * - virtual: files in ~/.waggle/workspaces/{id}/files/ (app-managed)
 * - local:   user-specified directory on their machine (like Claude Code)
 * - team:    MinIO/S3 bucket shared across team members
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
      const cfg = workspace.storageConfig;
      // If S3 config is provided (team server sets this), use S3
      if (cfg?.endpoint && cfg?.bucket && cfg?.accessKey && cfg?.secretKey) {
        const s3Config: S3Config = {
          endpoint: cfg.endpoint as string,
          bucket: cfg.bucket as string,
          accessKey: cfg.accessKey as string,
          secretKey: cfg.secretKey as string,
          prefix: cfg.prefix as string ?? `teams/${workspace.id}/`,
          region: cfg.region as string | undefined,
        };
        return new S3StorageProvider(s3Config);
      }
      // Fallback: env-based MinIO config (dev docker-compose)
      const env = process.env;
      if (env.MINIO_ENDPOINT && env.MINIO_BUCKET) {
        const s3Config: S3Config = {
          endpoint: env.MINIO_ENDPOINT,
          bucket: env.MINIO_BUCKET,
          accessKey: env.MINIO_ACCESS_KEY ?? 'waggle',
          secretKey: env.MINIO_SECRET_KEY ?? 'waggle_s3_dev',
          prefix: `teams/${workspace.id}/`,
        };
        return new S3StorageProvider(s3Config);
      }
      // No S3 config — fall back to virtual
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
