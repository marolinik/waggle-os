/**
 * Programmatic install entry point for the Cursor hive-mind hooks.
 *
 * Steps:
 *   1. Read existing `~/.cursor/hooks.json` IF it exists (create-if-missing
 *      — cursor's hooks.json is OPTIONAL on a fresh install). It is a
 *      SEPARATE file from Cursor's `settings.json`; we never touch editor
 *      preferences.
 *   2. If it pre-existed, write a byte-identical backup; if absent, skip
 *      the backup and record `created_by_us=true`.
 *   3. Additively merge the four hive-mind hook groups (flat
 *      `{ command, type, timeout }` shape) into `hooks.<event>` arrays via
 *      `jsonRegister`. A fresh config is seeded `{ version: 1, hooks: {} }`
 *      by the spec's `ensureSkeleton`. Existing entries preserved verbatim.
 *   4. Write the merged JSON back over `hooks.json`.
 *   5. Drop a pointer file at `~/.cursor/hive-mind-install.json` so a future
 *      `uninstall` knows whether to restore the backup or delete the file
 *      we created.
 *
 * Round-trip guarantee (pre-existed case): the pre-install hooks.json
 * content equals the byte-identical backup; `uninstall` restores it.
 * Created case: `uninstall` deletes the file we created (no orphan).
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { createLogger, type Logger } from '@waggle/hive-mind-shim-core';
import {
  backupByteIdentical,
  hookCommandFor,
  hookScriptPath,
  jsonRegister,
  normalizeCliPath,
  writePointer,
  type InstallPointer,
  type JsonRegisterEntry,
  type Lifecycle,
} from '@waggle/hive-mind-hooks-core';
import { resolvePaths, allHookBasenames, type CursorPaths, type ResolvePathsOptions } from './paths.js';
import { cursorRegisterSpec } from './adapter.js';

export interface InstallResult {
  paths: CursorPaths;
  /** The byte-identical backup written when hooks.json pre-existed, else null. */
  backupPath: string | null;
  pointerPath: string;
  installedHooks: readonly string[];
  /** True when hooks.json did NOT pre-exist and we created it. */
  createdByUs: boolean;
  /** The cli_path embedded in hook commands (undefined = default lookup at runtime). */
  cliPath?: string;
}

export interface InstallOptions extends ResolvePathsOptions {
  /** Per-hook timeout, seconds. Default 5. */
  hookTimeoutSeconds?: number;
  /** Override clock for deterministic tests. */
  now?: () => Date;
  /** Logger override. */
  logger?: Logger;
  /**
   * Absolute path to the hive-mind-cli binary or its compiled JS entry.
   * Required on Windows (npm bin shim is `.cmd` and can't be exec'd
   * without a shell). Threaded into every hook command as
   * `--cli-path "<path>"`.
   */
  cliPath?: string;
}

const DEFAULT_HOOK_TIMEOUT_S = 5;
const POINTER_VERSION = '0.1.0';

/** Canonical lifecycle for each hook basename (basenames mirror lifecycle ids). */
const LIFECYCLE_BY_BASENAME: Record<string, Lifecycle> = {
  'session-start': 'session-start',
  'user-prompt-submit': 'user-prompt-submit',
  'stop': 'stop',
  'pre-compact': 'pre-compact',
};

async function ensureDir(p: string): Promise<void> {
  if (!existsSync(p)) await mkdir(p, { recursive: true });
}

export async function install(opts: InstallOptions = {}): Promise<InstallResult> {
  const log = opts.logger ?? createLogger({ name: 'cursor-hooks/install' });
  const paths = resolvePaths({
    ...(opts.home !== undefined ? { home: opts.home } : {}),
    ...(opts.hooksDir !== undefined ? { hooksDir: opts.hooksDir } : { moduleUrl: import.meta.url }),
  });
  const now = opts.now ?? ((): Date => new Date());

  log.info('install starting', { config: paths.configPath, hooksDir: paths.hooksDir });

  // Read the existing config if present; create-if-missing otherwise.
  let existingConfig: Record<string, unknown> | undefined;
  const preExisted = existsSync(paths.configPath);
  if (preExisted) {
    const originalContent = await readFile(paths.configPath, 'utf-8');
    try {
      const parsed: unknown = JSON.parse(originalContent);
      existingConfig = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    } catch (err) {
      throw new Error(
        `failed to parse existing ${paths.configPath} as JSON: ` +
        (err instanceof Error ? err.message : String(err)),
      );
    }
  }

  await ensureDir(dirname(paths.pointerPath));

  // Byte-identical backup of the original config (no-op when absent).
  const { backupPath, preExisted: backedUp } = await backupByteIdentical(
    paths.configPath,
    now().toISOString(),
  );
  if (backedUp) log.info('hooks.json backed up', { backupPath });

  const cliPath = normalizeCliPath(opts.cliPath);
  const timeout = opts.hookTimeoutSeconds ?? DEFAULT_HOOK_TIMEOUT_S;
  const basenames = allHookBasenames();
  const entries: JsonRegisterEntry[] = basenames.map((basename) => ({
    lifecycle: LIFECYCLE_BY_BASENAME[basename],
    command: hookCommandFor(hookScriptPath(paths.hooksDir, basename), cliPath),
    timeout,
  }));

  const merged = jsonRegister(existingConfig, entries, cursorRegisterSpec);
  const mergedJson = JSON.stringify(merged, null, 2) + '\n';
  await writeFile(paths.configPath, mergedJson, 'utf-8');

  const createdByUs = !preExisted;
  const pointer: InstallPointer = {
    version: POINTER_VERSION,
    installed_at: now().toISOString(),
    config_path: paths.configPath,
    settings_backup: backupPath,
    created_by_us: createdByUs,
    hooks_dir: paths.hooksDir,
    installed_hooks: basenames,
    cli_path: cliPath ?? null,
  };
  await writePointer(paths.pointerPath, pointer);

  log.info('install complete', {
    added: entries.length,
    createdByUs,
    cliPath: cliPath ?? '(PATH lookup)',
  });

  const result: InstallResult = {
    paths,
    backupPath,
    pointerPath: paths.pointerPath,
    installedHooks: basenames,
    createdByUs,
  };
  if (cliPath !== undefined) result.cliPath = cliPath;
  return result;
}
