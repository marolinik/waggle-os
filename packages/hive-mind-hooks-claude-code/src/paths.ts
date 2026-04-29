/**
 * Filesystem path helpers for Claude Code shim install/uninstall.
 *
 * Centralized so tests can mock the home directory and dist directory
 * without poking process.env or import.meta.url internals.
 */

import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

export interface ShimPaths {
  /** Claude Code config root (`~/.claude/`). */
  claudeDir: string;
  /** `~/.claude/settings.json`. */
  settingsPath: string;
  /** `~/.claude/hive-mind-install.json` — pointer to the active backup. */
  pointerPath: string;
  /** Directory where compiled hook scripts live (dist/hooks/). */
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

function defaultHooksDirFromUrl(moduleUrl: string): string {
  // Compiled location: <pkg>/dist/<somefile>.js — caller passes its own
  // import.meta.url, dirname gives <pkg>/dist/, join gives <pkg>/dist/hooks.
  // We resolve once more so the path is absolute and platform-normalized.
  const dir = dirname(fileURLToPath(moduleUrl));
  return resolve(dir, 'hooks');
}

export function resolvePaths(opts: ResolvePathsOptions = {}): ShimPaths {
  const home = opts.home ?? homedir();
  const claudeDir = join(home, '.claude');
  const settingsPath = join(claudeDir, 'settings.json');
  const pointerPath = join(claudeDir, 'hive-mind-install.json');

  let hooksDir: string;
  if (opts.hooksDir) {
    hooksDir = resolve(opts.hooksDir);
  } else if (opts.moduleUrl) {
    hooksDir = defaultHooksDirFromUrl(opts.moduleUrl);
  } else {
    // Fallback: the consumer didn't pass moduleUrl — best we can do is
    // assume CWD/dist/hooks. install.ts always passes moduleUrl so this
    // only kicks in for ad-hoc test use.
    hooksDir = resolve(process.cwd(), 'dist', 'hooks');
  }

  return { claudeDir, settingsPath, pointerPath, hooksDir };
}

export function hookCommandFor(
  hooksDir: string,
  basename: HookBasename,
  cliPath?: string,
): string {
  const scriptPath = join(hooksDir, `${basename}.js`);
  // Quote paths so spaces in user home dir (Windows: "C:\Users\Marko Markovic\")
  // don't fragment the command. Claude Code parses this string with shell rules.
  const cliFlag = cliPath && cliPath.length > 0 ? ` --cli-path "${cliPath}"` : '';
  return `node "${scriptPath}"${cliFlag}`;
}

export function backupPathFor(settingsPath: string, isoTimestamp: string): string {
  // Replace ":" and "." with "-" so timestamp is filesystem-safe on Windows.
  const stamp = isoTimestamp.replace(/[:.]/g, '-');
  return `${settingsPath}.hive-mind-backup.${stamp}`;
}
