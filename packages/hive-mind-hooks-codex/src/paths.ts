/**
 * Filesystem path helpers for the Codex hive-mind hook install lifecycle.
 *
 * Mirrors the frozen Wave 1 claude-code `paths.ts` shape, but targets
 * Codex's standalone `~/.codex/hooks.json` (NOT `~/.codex/config.toml` —
 * we stay out of the user's TOML and away from protected
 * `notify`/`profile`/`model_providers` keys). The Windows-safe backup
 * path + `--cli-path` quoting + hooks-dir resolution are reused verbatim
 * from `@waggle/hive-mind-hooks-core` so codex reads like the reference.
 */

import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  backupPathFor,
  hookCommandFor,
  hooksDirFromModuleUrl,
} from '@waggle/hive-mind-hooks-core';

export interface CodexPaths {
  /** Codex config root (`~/.codex/`). */
  codexDir: string;
  /** `~/.codex/hooks.json` — the standalone hooks config (NOT config.toml). */
  configPath: string;
  /** `~/.codex/hive-mind-install.json` — pointer to the active backup. */
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

export function resolvePaths(opts: ResolvePathsOptions = {}): CodexPaths {
  const home = opts.home ?? homedir();
  const codexDir = join(home, '.codex');
  const configPath = join(codexDir, 'hooks.json');
  const pointerPath = join(codexDir, 'hive-mind-install.json');

  let hooksDir: string;
  if (opts.hooksDir) {
    hooksDir = resolve(opts.hooksDir);
  } else if (opts.moduleUrl) {
    hooksDir = hooksDirFromModuleUrl(opts.moduleUrl);
  } else {
    // Fallback for ad-hoc test use — install.ts always passes moduleUrl.
    hooksDir = resolve(process.cwd(), 'dist', 'hooks');
  }

  return { codexDir, configPath, pointerPath, hooksDir };
}

/** Re-export the shared Windows-safe helpers so codex modules read like CC. */
export { backupPathFor, hookCommandFor };
