/**
 * Programmatic uninstall entry point for the Hermes hive-mind hooks.
 *
 * Round-trip guarantee:
 *   - `created_by_us=false` (config.yaml pre-existed): restore the LITERAL
 *     byte-identical backup the installer wrote; refuse to delete the backup
 *     unless the in-place readback matches. (YAML re-serialization is lossy,
 *     so we restore the original BYTES — comments and key ordering are
 *     preserved exactly because we never touch the re-serialized merge on
 *     this path.)
 *   - `created_by_us=true` (we created config.yaml): delete the file we
 *     created — never orphan it, never leave a backup behind.
 *
 * Both branches are handled by the shared `restoreFromBackup` primitive.
 */

import { unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createLogger, type Logger } from '@waggle/hive-mind-shim-core';
import {
  readPointer,
  restoreFromBackup,
} from '@waggle/hive-mind-hooks-core';
import { resolvePaths, type HermesPaths, type ResolvePathsOptions } from './paths.js';

export interface UninstallResult {
  paths: HermesPaths;
  /** Backup restored from, or null when we deleted a file we created. */
  restoredFrom: string | null;
  /** True when created_by_us=true and we removed the config we created. */
  createdRemoved: boolean;
  pointerRemoved: boolean;
  backupRemoved: boolean;
}

export interface UninstallOptions extends ResolvePathsOptions {
  logger?: Logger;
  /** If false, leaves the backup file in place after restore. Default true. */
  cleanupBackup?: boolean;
}

export async function uninstall(opts: UninstallOptions = {}): Promise<UninstallResult> {
  const log = opts.logger ?? createLogger({ name: 'hermes-hooks/uninstall' });
  const paths = resolvePaths({
    ...(opts.home !== undefined ? { home: opts.home } : {}),
    ...(opts.hooksDir !== undefined ? { hooksDir: opts.hooksDir } : { moduleUrl: import.meta.url }),
  });
  const cleanup = opts.cleanupBackup ?? true;

  if (!existsSync(paths.pointerPath)) {
    throw new Error(
      `no install pointer found at ${paths.pointerPath}. ` +
      `Was @waggle/hive-mind-hooks-hermes ever installed for this user?`,
    );
  }

  const pointer = await readPointer(paths.pointerPath);
  const restore = await restoreFromBackup({
    configPath: paths.configPath,
    pointer,
    cleanupBackup: cleanup,
  });

  if (restore.createdRemoved) {
    log.info('hermes config.yaml removed (created by us)', { config: paths.configPath });
  } else {
    log.info('hermes config.yaml restored byte-identical', { config: paths.configPath });
  }

  await unlink(paths.pointerPath);

  return {
    paths,
    restoredFrom: restore.restoredFrom,
    createdRemoved: restore.createdRemoved,
    pointerRemoved: true,
    backupRemoved: restore.backupRemoved,
  };
}
