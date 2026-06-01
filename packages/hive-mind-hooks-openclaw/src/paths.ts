/**
 * Filesystem path helpers for the OpenClaw hive-mind hook install lifecycle.
 *
 * OpenClaw differs structurally from the stdin-JSON tools (codex / cursor /
 * hermes): its hooks are IN-PROCESS TypeScript. A hook is a DIRECTORY
 * `~/.openclaw/hooks/<name>/{HOOK.md, handler.js}` that the gateway discovers
 * and dynamically `import()`s. Config (`~/.openclaw/openclaw.json`, JSON5)
 * only flips the internal-hooks subsystem on and references the dir.
 *
 * So this module resolves THREE roots the JSON tools don't have:
 *   - the managed hook DIRECTORY we write (`~/.openclaw/hooks/hive-mind/`),
 *   - the compiled `handler.js` we COPY into that dir at install time,
 *   - the `HOOK.md` we write alongside it.
 *
 * The Windows-safe backup path + `--cli-path` quoting are reused verbatim
 * from `@waggle/hive-mind-hooks-core` so openclaw reads like the reference.
 */

import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { backupPathFor, hookCommandFor } from '@waggle/hive-mind-hooks-core';

/** Name of the managed hook directory we create under `~/.openclaw/hooks/`. */
export const HIVE_HOOK_DIR_NAME = 'hive-mind';

/** Logical hook entry key under `hooks.internal.entries`. */
export const HIVE_HOOK_ENTRY_KEY = 'hive-mind';

export interface OpenclawPaths {
  /** OpenClaw config root (`~/.openclaw/`). */
  openclawDir: string;
  /** `~/.openclaw/openclaw.json` — the JSON5 config (internal-hooks subsystem). */
  configPath: string;
  /** `~/.openclaw/hive-mind-install.json` — pointer to the active backup + created dir. */
  pointerPath: string;
  /** `~/.openclaw/hooks/` — OpenClaw's hook-discovery root. */
  hooksRoot: string;
  /** `~/.openclaw/hooks/hive-mind/` — the managed hook dir WE write. */
  hiveHookDir: string;
  /** `~/.openclaw/hooks/hive-mind/HOOK.md` — frontmatter declaring our events. */
  hookMdPath: string;
  /** `~/.openclaw/hooks/hive-mind/handler.js` — the compiled handler we copy in. */
  installedHandlerPath: string;
  /** Source of the compiled handler in THIS package's `dist/` (copied on install). */
  handlerSourcePath: string;
}

export interface ResolvePathsOptions {
  /** Override $HOME for tests. */
  home?: string;
  /** Override the URL used to locate dist/ (defaults to import.meta.url at runtime). */
  moduleUrl?: string;
  /** Override the compiled-handler source path directly (wins over moduleUrl). */
  handlerSourcePath?: string;
}

/**
 * OpenClaw's four internal lifecycle hooks. Unlike the stdin tools these are
 * NOT separate compiled scripts — one `handler.js` default-export dispatches
 * all four by `(type, action)`. The basenames here name the LIFECYCLE for
 * pointer bookkeeping + verify, not separate files on disk.
 */
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

/**
 * Resolve the compiled `handler.js` shipped in this package's `dist/`.
 * The compiled install module lives at `<pkg>/dist/<file>.js`; dirname gives
 * `<pkg>/dist/`, so `handler.js` is a sibling.
 */
function handlerSourceFromModuleUrl(moduleUrl: string): string {
  const dir = dirname(fileURLToPath(moduleUrl));
  return resolve(dir, 'handler.js');
}

export function resolvePaths(opts: ResolvePathsOptions = {}): OpenclawPaths {
  const home = opts.home ?? homedir();
  const openclawDir = join(home, '.openclaw');
  const configPath = join(openclawDir, 'openclaw.json');
  const pointerPath = join(openclawDir, 'hive-mind-install.json');
  const hooksRoot = join(openclawDir, 'hooks');
  const hiveHookDir = join(hooksRoot, HIVE_HOOK_DIR_NAME);
  const hookMdPath = join(hiveHookDir, 'HOOK.md');
  const installedHandlerPath = join(hiveHookDir, 'handler.js');

  let handlerSourcePath: string;
  if (opts.handlerSourcePath) {
    handlerSourcePath = resolve(opts.handlerSourcePath);
  } else if (opts.moduleUrl) {
    handlerSourcePath = handlerSourceFromModuleUrl(opts.moduleUrl);
  } else {
    // Fallback for ad-hoc test use — install.ts always passes moduleUrl.
    handlerSourcePath = resolve(process.cwd(), 'dist', 'handler.js');
  }

  return {
    openclawDir,
    configPath,
    pointerPath,
    hooksRoot,
    hiveHookDir,
    hookMdPath,
    installedHandlerPath,
    handlerSourcePath,
  };
}

/** Re-export the shared Windows-safe helpers so openclaw modules read like CC. */
export { backupPathFor, hookCommandFor };
