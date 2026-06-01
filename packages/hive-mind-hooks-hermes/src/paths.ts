/**
 * Filesystem path helpers for the Hermes hive-mind hook install lifecycle.
 *
 * Mirrors the Codex/Cursor `paths.ts` shape, but targets Hermes's
 * `~/.hermes/config.yaml` (the path `hermes_cli/config.py get_config_path`
 * resolves to). We touch ONLY the top-level `hooks:` block (the SHELL-HOOKS
 * system) — never the gateway dir-hooks (`~/.hermes/hooks/<name>/`) nor the
 * in-process plugin hooks. Hermes ships only THREE lifecycle hooks (there is
 * no PreCompact event), so the basename set omits `pre-compact`.
 *
 * The Windows-safe backup path + `--cli-path` quoting + hooks-dir resolution
 * are reused verbatim from `@waggle/hive-mind-hooks-core` so hermes reads
 * like the reference.
 */

import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  backupPathFor,
  hookCommandFor,
  hooksDirFromModuleUrl,
} from '@waggle/hive-mind-hooks-core';

export interface HermesPaths {
  /** Hermes config root (`~/.hermes/`). */
  hermesDir: string;
  /** `~/.hermes/config.yaml` — the shell-hooks config (top-level `hooks:`). */
  configPath: string;
  /** `~/.hermes/hive-mind-install.json` — pointer to the active backup. */
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

/**
 * Hermes ships THREE lifecycle hooks only — there is genuinely no
 * compaction hook to bind (confirmed absent in `VALID_HOOKS`), so
 * `pre-compact` is intentionally omitted.
 */
const HOOK_BASENAMES = [
  'session-start',
  'user-prompt-submit',
  'stop',
] as const;

export type HookBasename = typeof HOOK_BASENAMES[number];

export function allHookBasenames(): readonly HookBasename[] {
  return HOOK_BASENAMES;
}

export function resolvePaths(opts: ResolvePathsOptions = {}): HermesPaths {
  const home = opts.home ?? homedir();
  const hermesDir = join(home, '.hermes');
  const configPath = join(hermesDir, 'config.yaml');
  const pointerPath = join(hermesDir, 'hive-mind-install.json');

  let hooksDir: string;
  if (opts.hooksDir) {
    hooksDir = resolve(opts.hooksDir);
  } else if (opts.moduleUrl) {
    hooksDir = hooksDirFromModuleUrl(opts.moduleUrl);
  } else {
    // Fallback for ad-hoc test use — install.ts always passes moduleUrl.
    hooksDir = resolve(process.cwd(), 'dist', 'hooks');
  }

  return { hermesDir, configPath, pointerPath, hooksDir };
}

/** Re-export the shared Windows-safe helpers so hermes modules read like CC. */
export { backupPathFor, hookCommandFor };
