/**
 * Programmatic uninstall entry point.
 *
 * Round-trip guarantee: after uninstall, pre-existing settings are
 * byte-identical to their pre-install state, while a settings file created by
 * this installer is removed. Ownership is recorded in the install pointer.
 */

import { readFile, writeFile, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createLogger, type Logger } from '@waggle/hive-mind-shim-core';
import { resolvePaths, type ResolvePathsOptions, type ShimPaths } from './paths.js';

export interface UninstallResult {
  paths: ShimPaths;
  restoredFrom: string;
  settingsRemoved: boolean;
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
  config_path?: string;
  settings_backup: string;
  created_by_us?: boolean;
  hooks_dir: string;
  installed_hooks: readonly string[];
}

function isPointer(value: unknown): value is InstallPointer {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  const createdByUs = v['created_by_us'];
  return typeof v['settings_backup'] === 'string'
    && (createdByUs === undefined || typeof createdByUs === 'boolean');
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
  const settingsRemoved = pointer.created_by_us === true;
  if (settingsRemoved) {
    if (existsSync(paths.settingsPath)) await unlink(paths.settingsPath);
    if (existsSync(paths.settingsPath)) {
      throw new Error(
        `uninstall verification failed: installer-created ${paths.settingsPath} still exists. ` +
        `Backup was NOT removed; clean up manually if needed.`,
      );
    }
    log.info('installer-created settings removed', { settings: paths.settingsPath });
  } else {
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
  }

  let backupRemoved = false;
  if (cleanup) {
    await unlink(pointer.settings_backup);
    backupRemoved = true;
  }
  await unlink(paths.pointerPath);

  return {
    paths,
    restoredFrom: pointer.settings_backup,
    settingsRemoved,
    pointerRemoved: true,
    backupRemoved,
  };
}
