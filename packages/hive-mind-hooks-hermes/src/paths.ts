/**
 * Filesystem path helpers for the Hermes hive-mind hook install lifecycle.
 *
 * Mirrors the Codex/Cursor `paths.ts` shape, but targets Hermes's platform
 * config root (`HERMES_HOME`, `%LOCALAPPDATA%/hermes`, or `~/.hermes`). We
 * touch ONLY the top-level `hooks:` block in `config.yaml` (the SHELL-HOOKS
 * system) — never the gateway dir-hooks (`~/.hermes/hooks/<name>/`) nor the
 * in-process plugin hooks. Hermes ships only THREE lifecycle hooks (there is
 * no PreCompact event), so the basename set omits `pre-compact`.
 *
 * The Windows-safe backup path + `--cli-path` quoting + hooks-dir resolution
 * are reused verbatim from `@waggle/hive-mind-hooks-core` so hermes reads
 * like the reference.
 */

import { homedir } from 'node:os';
import { posix, resolve, win32 } from 'node:path';
import {
  backupPathFor,
  hookCommandFor,
  hooksDirFromModuleUrl,
} from '@waggle/hive-mind-hooks-core';

export interface HermesPaths {
  /** Hermes config root for the active platform and environment. */
  hermesDir: string;
  /** Hermes shell-hooks config (`config.yaml`, top-level `hooks:`). */
  configPath: string;
  /** Pointer to the active backup (`hive-mind-install.json`). */
  pointerPath: string;
  /** Directory where compiled hook scripts live (`dist/hooks/`). */
  hooksDir: string;
}

export interface ResolvePathsOptions {
  /** Override $HOME for tests. */
  home?: string;
  /** Override the host platform for deterministic path tests. */
  platform?: NodeJS.Platform;
  /** Override environment lookup for deterministic path tests. */
  env?: NodeJS.ProcessEnv;
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

export interface ResolveHermesHomeOptions {
  platform?: NodeJS.Platform;
  home?: string;
  env?: NodeJS.ProcessEnv;
}

/** Match Hermes's own config-root precedence on every supported platform. */
export function resolveHermesHome(opts: ResolveHermesHomeOptions = {}): string {
  const platform = opts.platform ?? process.platform;
  const pathApi = platform === 'win32' ? win32 : posix;
  const env = opts.env ?? process.env;
  const configuredHome = env.HERMES_HOME?.trim();
  if (configuredHome) return pathApi.normalize(configuredHome);

  const home = opts.home ?? homedir();
  if (platform === 'win32') {
    const localAppData = env.LOCALAPPDATA?.trim();
    return localAppData
      ? pathApi.join(localAppData, 'hermes')
      : pathApi.join(home, 'AppData', 'Local', 'hermes');
  }
  return pathApi.join(home, '.hermes');
}

export function resolvePaths(opts: ResolvePathsOptions = {}): HermesPaths {
  const platform = opts.platform ?? process.platform;
  const pathApi = platform === 'win32' ? win32 : posix;
  const hermesDir = opts.home === undefined
    ? resolveHermesHome({ platform, env: opts.env })
    : pathApi.join(opts.home, '.hermes');
  const configPath = pathApi.join(hermesDir, 'config.yaml');
  const pointerPath = pathApi.join(hermesDir, 'hive-mind-install.json');

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
