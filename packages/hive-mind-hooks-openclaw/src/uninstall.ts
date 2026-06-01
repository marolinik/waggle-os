/**
 * Programmatic uninstall entry point for the OpenClaw hive-mind hooks.
 *
 * Removes EXACTLY what install added:
 *   1. Delete the managed hook DIRECTORY `~/.openclaw/hooks/hive-mind/`
 *      (HOOK.md + handler.js) recorded in the pointer.
 *   2. Restore `~/.openclaw/openclaw.json`:
 *      - `created_by_us=false` (config pre-existed): restore the LITERAL
 *        byte-identical backup the installer wrote; refuse to delete the
 *        backup unless the in-place readback matches. (JSON5 re-serialization
 *        is lossy, so we restore the original BYTES — comments and trailing
 *        commas are preserved exactly because we never touch the re-serialized
 *        merge on this path.)
 *      - `created_by_us=true` (we created openclaw.json): delete the file we
 *        created — never orphan it, never leave a backup behind.
 *   3. Remove the pointer.
 *
 * The config restore/delete is handled by the shared `restoreFromBackup`
 * primitive; the hook-dir removal is openclaw-specific.
 */

import { unlink, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createLogger, type Logger } from '@waggle/hive-mind-shim-core';
import { readPointer, restoreFromBackup } from '@waggle/hive-mind-hooks-core';
import { resolvePaths, type OpenclawPaths, type ResolvePathsOptions } from './paths.js';

export interface UninstallResult {
  paths: OpenclawPaths;
  /** Backup restored from, or null when we deleted a file we created. */
  restoredFrom: string | null;
  /** True when created_by_us=true and we removed the config we created. */
  createdRemoved: boolean;
  /** True when the managed hook dir was removed. */
  hookDirRemoved: boolean;
  pointerRemoved: boolean;
  backupRemoved: boolean;
}

export interface UninstallOptions extends ResolvePathsOptions {
  logger?: Logger;
  /** If false, leaves the backup file in place after restore. Default true. */
  cleanupBackup?: boolean;
}

export async function uninstall(opts: UninstallOptions = {}): Promise<UninstallResult> {
  const log = opts.logger ?? createLogger({ name: 'openclaw-hooks/uninstall' });
  const paths = resolvePaths({
    ...(opts.home !== undefined ? { home: opts.home } : {}),
    ...(opts.handlerSourcePath !== undefined
      ? { handlerSourcePath: opts.handlerSourcePath }
      : { moduleUrl: import.meta.url }),
  });
  const cleanup = opts.cleanupBackup ?? true;

  if (!existsSync(paths.pointerPath)) {
    throw new Error(
      `no install pointer found at ${paths.pointerPath}. ` +
      `Was @waggle/hive-mind-hooks-openclaw ever installed for this user?`,
    );
  }

  const pointer = await readPointer(paths.pointerPath);

  // 1. Remove the managed hook dir we created. Prefer the pointer's recorded
  // hooks_dir; fall back to the resolved path.
  const hookDir = pointer.hooks_dir ?? paths.hiveHookDir;
  let hookDirRemoved = false;
  if (existsSync(hookDir)) {
    await rm(hookDir, { recursive: true, force: true });
    hookDirRemoved = true;
    log.info('managed hook dir removed', { hookDir });
  }

  // 2. Restore / delete openclaw.json via the shared primitive.
  const restore = await restoreFromBackup({
    configPath: paths.configPath,
    pointer,
    cleanupBackup: cleanup,
  });
  if (restore.createdRemoved) {
    log.info('openclaw.json removed (created by us)', { config: paths.configPath });
  } else {
    log.info('openclaw.json restored byte-identical', { config: paths.configPath });
  }

  // 3. Remove the pointer.
  await unlink(paths.pointerPath);

  return {
    paths,
    restoredFrom: restore.restoredFrom,
    createdRemoved: restore.createdRemoved,
    hookDirRemoved,
    pointerRemoved: true,
    backupRemoved: restore.backupRemoved,
  };
}
