/**
 * Programmatic uninstall entry point.
 *
 * Round-trip guarantee: after uninstall, `~/.claude/settings.json` is
 * byte-identical to the pre-install state. We achieve this by reading
 * the backup the installer wrote and copying it back. Uninstall refuses
 * to delete the backup unless the in-place readback matches the backup
 * content.
 */

import { readFile, writeFile, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createLogger, type Logger } from '@waggle/hive-mind-shim-core';
import { resolvePaths, type ResolvePathsOptions, type ShimPaths } from './paths.js';

export interface UninstallResult {
  paths: ShimPaths;
  restoredFrom: string;
  pointerRemoved: boolean;
  backupRemoved: boolean;
}

export interface UninstallOptions extends ResolvePathsOptions {
  logger?: Logger;
  /** If false, leaves the backup file in place after restore. Default true. */
  cleanupBackup?: boolean;
}

interface InstallPointer {
  version: string;
  installed_at: string;
  settings_backup: string;
  hooks_dir: string;
  installed_hooks: readonly string[];
}

function isPointer(value: unknown): value is InstallPointer {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v['settings_backup'] === 'string';
}

export async function uninstall(opts: UninstallOptions = {}): Promise<UninstallResult> {
  const log = opts.logger ?? createLogger({ name: 'claude-code-hooks/uninstall' });
  const paths = resolvePaths({
    ...(opts.home !== undefined ? { home: opts.home } : {}),
    ...(opts.hooksDir !== undefined ? { hooksDir: opts.hooksDir } : { moduleUrl: import.meta.url }),
  });
  const cleanup = opts.cleanupBackup ?? true;

  if (!existsSync(paths.pointerPath)) {
    throw new Error(
      `no install pointer found at ${paths.pointerPath}. ` +
      `Was @hive-mind/claude-code-hooks ever installed for this user?`,
    );
  }

  const pointerRaw = await readFile(paths.pointerPath, 'utf-8');
  const pointerJson: unknown = JSON.parse(pointerRaw);
  if (!isPointer(pointerJson)) {
    throw new Error(`install pointer at ${paths.pointerPath} is malformed`);
  }
  const pointer = pointerJson;

  if (!existsSync(pointer.settings_backup)) {
    throw new Error(
      `backup file referenced by ${paths.pointerPath} is missing: ${pointer.settings_backup}`,
    );
  }

  const backupContent = await readFile(pointer.settings_backup, 'utf-8');
  await writeFile(paths.settingsPath, backupContent, 'utf-8');

  // Round-trip verification: read what we just wrote and compare bytes.
  const verify = await readFile(paths.settingsPath, 'utf-8');
  if (verify !== backupContent) {
    throw new Error(
      `uninstall verification failed: ${paths.settingsPath} content differs ` +
      `from backup ${pointer.settings_backup}. Backup was NOT removed; ` +
      `restore manually if needed.`,
    );
  }
  log.info('settings restored byte-identical', { settings: paths.settingsPath });

  let backupRemoved = false;
  if (cleanup) {
    await unlink(pointer.settings_backup);
    backupRemoved = true;
  }
  await unlink(paths.pointerPath);

  return {
    paths,
    restoredFrom: pointer.settings_backup,
    pointerRemoved: true,
    backupRemoved,
  };
}
