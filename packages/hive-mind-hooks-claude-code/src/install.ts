/**
 * Programmatic install entry point.
 *
 * Steps:
 *   1. Read existing `~/.claude/settings.json` (must exist + be valid JSON).
 *   2. Write a byte-identical backup at
 *      `~/.claude/settings.json.hive-mind-backup.<timestamp>`.
 *   3. Compute the four hive-mind hook command strings (absolute paths
 *      to compiled `dist/hooks/*.js`).
 *   4. Additively merge the four hook groups into the settings object
 *      (existing entries preserved verbatim).
 *   5. Write the merged JSON back over `settings.json`.
 *   6. Drop a pointer file at `~/.claude/hive-mind-install.json` so a
 *      future `uninstall` knows which backup to restore.
 *
 * Round-trip guarantee: the pre-install settings.json content equals
 * the byte-identical content written to the backup. `uninstall` simply
 * copies the backup over.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { createLogger, type Logger } from '@waggle/hive-mind-shim-core';
import {
  defaultHookEntries,
  mergeHiveHooks,
  type ClaudeCodeSettings,
} from './settings-merger.js';
import {
  backupPathFor,
  hookCommandFor,
  resolvePaths,
  type ResolvePathsOptions,
  type ShimPaths,
} from './paths.js';

export interface InstallResult {
  paths: ShimPaths;
  backupPath: string;
  pointerPath: string;
  installedHooks: readonly string[];
  alreadyInstalled: boolean;
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
   * without a shell). Recommended for any production install where
   * `hive-mind-cli` may not be on PATH at hook invocation time.
   * Threaded into every hook command as `--cli-path "<path>"`.
   */
  cliPath?: string;
}

const DEFAULT_HOOK_TIMEOUT_S = 5;

async function ensureDir(p: string): Promise<void> {
  if (!existsSync(p)) await mkdir(p, { recursive: true });
}

export async function install(opts: InstallOptions = {}): Promise<InstallResult> {
  const log = opts.logger ?? createLogger({ name: 'claude-code-hooks/install' });
  // Use install.ts's own URL for hooks-dir derivation so that callers
  // (e.g. the bin script in `src/bin/`) don't accidentally point us at
  // `dist/bin/hooks/` instead of `dist/hooks/`. opts.hooksDir always
  // wins when explicitly supplied.
  const paths = resolvePaths({
    ...(opts.home !== undefined ? { home: opts.home } : {}),
    ...(opts.hooksDir !== undefined ? { hooksDir: opts.hooksDir } : { moduleUrl: import.meta.url }),
  });
  const now = opts.now ?? ((): Date => new Date());

  log.info('install starting', { settings: paths.settingsPath, hooksDir: paths.hooksDir });

  if (!existsSync(paths.settingsPath)) {
    throw new Error(
      `expected Claude Code settings at ${paths.settingsPath}, file not found. ` +
      `Run Claude Code at least once before installing this shim.`,
    );
  }

  const originalContent = await readFile(paths.settingsPath, 'utf-8');
  let parsed: ClaudeCodeSettings;
  try {
    parsed = JSON.parse(originalContent) as ClaudeCodeSettings;
  } catch (err) {
    throw new Error(
      `failed to parse existing ${paths.settingsPath} as JSON: ` +
      (err instanceof Error ? err.message : String(err)),
    );
  }

  await ensureDir(dirname(paths.pointerPath));
  const backupPath = backupPathFor(paths.settingsPath, now().toISOString());
  await writeFile(backupPath, originalContent, 'utf-8');
  log.info('settings backed up', { backupPath });

  const cliPath = normalizeCliPath(opts.cliPath);
  const entries = defaultHookEntries(
    paths.hooksDir,
    opts.hookTimeoutSeconds ?? DEFAULT_HOOK_TIMEOUT_S,
    hookCommandFor,
    cliPath,
  );
  const merged = mergeHiveHooks(parsed, entries);
  const mergedJson = JSON.stringify(merged, null, 2) + '\n';
  await writeFile(paths.settingsPath, mergedJson, 'utf-8');

  const pointer: Record<string, unknown> = {
    version: '0.1.0',
    installed_at: now().toISOString(),
    settings_backup: backupPath,
    hooks_dir: paths.hooksDir,
    installed_hooks: entries.map((e) => e.basename),
    cli_path: cliPath ?? null,
  };
  await writeFile(paths.pointerPath, JSON.stringify(pointer, null, 2) + '\n', 'utf-8');

  log.info('install complete', { added: entries.length, cliPath: cliPath ?? '(PATH lookup)' });

  const result: InstallResult = {
    paths,
    backupPath,
    pointerPath: paths.pointerPath,
    installedHooks: entries.map((e) => e.basename),
    alreadyInstalled: false,
  };
  if (cliPath !== undefined) result.cliPath = cliPath;
  return result;
}

function normalizeCliPath(input: string | undefined): string | undefined {
  if (input === undefined) return undefined;
  const trimmed = input.trim();
  if (trimmed.length === 0) return undefined;
  // Reject embedded double-quotes — they would break the
  // `--cli-path "<value>"` quoting in the generated hook command.
  if (trimmed.includes('"')) {
    throw new Error(
      `--cli-path value must not contain double-quote characters; got: ${trimmed.slice(0, 80)}`,
    );
  }
  return trimmed;
}
