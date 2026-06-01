/**
 * Filesystem path helpers for the Cursor hive-mind hook install lifecycle.
 *
 * Mirrors the Codex `paths.ts` shape, but targets Cursor's standalone
 * `~/.cursor/hooks.json` (JSON) — a SEPARATE file from Cursor's
 * `settings.json` (editor prefs); we never touch editor preferences. The
 * Windows-safe backup path + `--cli-path` quoting + hooks-dir resolution
 * are reused verbatim from `@waggle/hive-mind-hooks-core` so cursor reads
 * like the reference.
 */

import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  backupPathFor,
  hookCommandFor,
  hooksDirFromModuleUrl,
} from '@waggle/hive-mind-hooks-core';

export interface CursorPaths {
  /** Cursor config root (`~/.cursor/`). */
  cursorDir: string;
  /** `~/.cursor/hooks.json` — the standalone hooks config (NOT settings.json). */
  configPath: string;
  /** `~/.cursor/hive-mind-install.json` — pointer to the active backup. */
  pointerPath: string;
  /** Directory where compiled hook scripts live (`dist/hooks/`). */
  hooksDir: string;
}

export interface ResolvePathsOptions {
  /** Override $HOME for tests. */
  home?: string;
  /** Override the URL used to locate dist/hooks (defaults to import.meta.url at runtime). */
  moduleUrl?: string;
  /** Override hooks directory directly (wins over moduleUrl). */
  hooksDir?: string;
}

const HOOK_BASENAMES = [
  'session-start',
  'user-prompt-submit',
  'stop',
  'pre-compact',
] as const;

export type HookBasename = typeof HOOK_BASENAMES[number];

export function allHookBasenames(): readonly HookBasename[] {
  return HOOK_BASENAMES;
}

export function resolvePaths(opts: ResolvePathsOptions = {}): CursorPaths {
  const home = opts.home ?? homedir();
  const cursorDir = join(home, '.cursor');
  const configPath = join(cursorDir, 'hooks.json');
  const pointerPath = join(cursorDir, 'hive-mind-install.json');

  let hooksDir: string;
  if (opts.hooksDir) {
    hooksDir = resolve(opts.hooksDir);
  } else if (opts.moduleUrl) {
    hooksDir = hooksDirFromModuleUrl(opts.moduleUrl);
  } else {
    // Fallback for ad-hoc test use — install.ts always passes moduleUrl.
    hooksDir = resolve(process.cwd(), 'dist', 'hooks');
  }

  return { cursorDir, configPath, pointerPath, hooksDir };
}

/** Re-export the shared Windows-safe helpers so cursor modules read like CC. */
export { backupPathFor, hookCommandFor };
