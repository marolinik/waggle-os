/**
 * Tool-agnostic reversible-install primitives.
 *
 * Generalizes the frozen Wave 1 claude-code install/uninstall logic with
 * a CREATE-IF-MISSING mode the CC reference lacks: CC assumes the config
 * file must pre-exist and throws if absent (install.ts:85-90). Codex /
 * cursor / hermes / openclaw config files are optional and may not exist
 * on a fresh machine, so install must be able to create a minimal
 * skeleton and uninstall must DELETE-IF-WE-CREATED-IT vs
 * RESTORE-BACKUP-IF-IT-EXISTED.
 *
 * Immutability contract: helpers here never mutate their inputs; the
 * pointer object passed to `writePointer` is serialized as-is, and
 * `restoreFromBackup` reads the pointer and acts on it without mutation.
 */

import { readFile, writeFile, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { backupPathFor } from './paths-core.js';

/**
 * Pointer file recording what an install did, so uninstall is exact.
 * Superset of the CC pointer: adds `created_by_us` (true when the config
 * file did not pre-exist) so uninstall can delete vs restore.
 */
export interface InstallPointer {
  version: string;
  installed_at: string;
  config_path: string;
  /** null ⇔ created_by_us=true (no backup written — nothing to restore). */
  settings_backup: string | null;
  /** true if the config file did NOT pre-exist and we created it. */
  created_by_us: boolean;
  /** null for in-process tools (openclaw) that ship no hook-script dir. */
  hooks_dir: string | null;
  installed_hooks: readonly string[];
  cli_path: string | null;
  /** per-tool: e.g. openclaw hook dir names, hermes registered event keys. */
  extra?: Record<string, unknown>;
}

export interface BackupResult {
  /** Path the byte-identical backup was written to, or null if absent. */
  backupPath: string | null;
  /** Whether the config file existed at backup time. */
  preExisted: boolean;
}

/**
 * Write a byte-identical timestamped backup of an existing config file.
 *
 *   preExisted=false → no backup written; caller records
 *                      created_by_us=true in the pointer.
 *   preExisted=true  → backup written with the EXACT original bytes
 *                      (CC install.ts:104-106 idiom), so uninstall can
 *                      restore the true pre-install state byte-for-byte
 *                      even when the config codec round-trip is lossy
 *                      (hermes YAML, openclaw JSON5).
 */
export async function backupByteIdentical(
  configPath: string,
  isoTimestamp: string,
): Promise<BackupResult> {
  if (!existsSync(configPath)) {
    return { backupPath: null, preExisted: false };
  }
  const originalBytes = await readFile(configPath);
  const backupPath = backupPathFor(configPath, isoTimestamp);
  await writeFile(backupPath, originalBytes);
  return { backupPath, preExisted: true };
}

export async function writePointer(pointerPath: string, pointer: InstallPointer): Promise<void> {
  await writeFile(pointerPath, JSON.stringify(pointer, null, 2) + '\n', 'utf-8');
}

function isInstallPointer(value: unknown): value is InstallPointer {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v['config_path'] === 'string' &&
    typeof v['created_by_us'] === 'boolean' &&
    (v['settings_backup'] === null || typeof v['settings_backup'] === 'string') &&
    Array.isArray(v['installed_hooks'])
  );
}

/** Read + validate an install pointer. Throws if absent or malformed. */
export async function readPointer(pointerPath: string): Promise<InstallPointer> {
  if (!existsSync(pointerPath)) {
    throw new Error(`no install pointer found at ${pointerPath}.`);
  }
  const raw = await readFile(pointerPath, 'utf-8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `install pointer at ${pointerPath} is malformed: ` +
      (err instanceof Error ? err.message : String(err)),
    );
  }
  if (!isInstallPointer(parsed)) {
    throw new Error(`install pointer at ${pointerPath} is malformed`);
  }
  return parsed;
}

export interface RestoreResult {
  /** The backup we restored from, or null when we deleted a file we created. */
  restoredFrom: string | null;
  /** True when created_by_us=true and we removed the config file we created. */
  createdRemoved: boolean;
  /** True when the backup file was cleaned up after a successful restore. */
  backupRemoved: boolean;
}

/**
 * Round-trip-verified restore. Mirrors CC uninstall.ts:71-89.
 *
 *   created_by_us=false → restore the backup byte-identically: write the
 *                         backup bytes over configPath, re-read, assert
 *                         byte equality, and REFUSE to delete the backup
 *                         unless the readback matches.
 *   created_by_us=true  → DELETE the config file we created (never orphan
 *                         it); restoredFrom=null.
 *
 * Never mutates the pointer.
 */
export async function restoreFromBackup(args: {
  configPath: string;
  pointer: InstallPointer;
  /** Clean up the backup file after a verified restore. Default true. */
  cleanupBackup?: boolean;
  /**
   * Test seam: override fs read/write to exercise the round-trip
   * verification-failure branch (a write→read mismatch is otherwise
   * impossible to provoke on a real filesystem). Defaults to node:fs/promises.
   */
  io?: {
    readFile?: (p: string) => Promise<Buffer>;
    writeFile?: (p: string, data: Buffer) => Promise<void>;
  };
}): Promise<RestoreResult> {
  const { configPath, pointer } = args;
  const cleanup = args.cleanupBackup ?? true;
  const rf = args.io?.readFile ?? ((p: string): Promise<Buffer> => readFile(p));
  const wf = args.io?.writeFile ?? ((p: string, data: Buffer): Promise<void> => writeFile(p, data));

  // Branch A: we created the config file — delete it, never orphan it.
  if (pointer.created_by_us) {
    if (existsSync(configPath)) {
      await unlink(configPath);
    }
    return { restoredFrom: null, createdRemoved: true, backupRemoved: false };
  }

  // Branch B: config pre-existed — restore the byte-identical backup.
  if (pointer.settings_backup === null) {
    throw new Error(
      `pointer for ${configPath} has created_by_us=false but no settings_backup; ` +
      `cannot restore.`,
    );
  }
  if (!existsSync(pointer.settings_backup)) {
    throw new Error(
      `backup file referenced by the pointer is missing: ${pointer.settings_backup}`,
    );
  }

  const backupBytes = await rf(pointer.settings_backup);
  await wf(configPath, backupBytes);

  // Round-trip verification: read what we just wrote and compare bytes.
  const verifyBytes = await rf(configPath);
  if (!backupBytes.equals(verifyBytes)) {
    throw new Error(
      `uninstall verification failed: ${configPath} content differs from backup ` +
      `${pointer.settings_backup}. Backup was NOT removed; restore manually if needed.`,
    );
  }

  let backupRemoved = false;
  if (cleanup) {
    await unlink(pointer.settings_backup);
    backupRemoved = true;
  }

  return { restoredFrom: pointer.settings_backup, createdRemoved: false, backupRemoved };
}
