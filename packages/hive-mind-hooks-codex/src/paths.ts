/**
 * Filesystem path helpers for the Codex hive-mind hook install lifecycle.
 *
 * Mirrors the frozen Wave 1 claude-code `paths.ts` shape, but targets
 * Codex's standalone `~/.codex/hooks.json` (NOT `~/.codex/config.toml` —
 * we stay out of the user's TOML and away from protected
 * `notify`/`profile`/`model_providers` keys). The Windows-safe backup
 * path + hooks-dir resolution reuse `@waggle/hive-mind-hooks-core`. Codex
 * needs its own Windows command encoder because its Rust runtime passes the
 * whole handler string as one `cmd.exe /C` argument; nested double quotes
 * otherwise arrive at Node as literal filename characters.
 */

import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  backupPathFor,
  hookCommandFor as sharedHookCommandFor,
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

export interface HookCommandOptions {
  /** Explicit seam for cross-platform command-shape tests. */
  platform?: NodeJS.Platform;
  /** Explicit Windows runtime seam; production normally uses the launcher env override. */
  nodePath?: string;
}

function powershellLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function windowsHookCommand(nodePath: string, scriptPath: string, cliPath?: string): string {
  const args = [nodePath, scriptPath];
  if (cliPath && cliPath.length > 0) args.push('--cli-path', cliPath);

  const script = [
    `& ${args.map(powershellLiteral).join(' ')}`,
    'exit $LASTEXITCODE',
  ].join('\r\n');
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  return `%SystemRoot%\\System32\\WindowsPowerShell\\v1.0\\powershell.exe -NoLogo -NoProfile -NonInteractive -EncodedCommand ${encoded}`;
}

/**
 * Build a Codex command that survives the host's exact shell dispatch.
 * POSIX keeps the shared `node "script" --cli-path "cli"` contract. On
 * Windows the trusted invocation is UTF-16LE encoded inside PowerShell so
 * the outer `cmd.exe /C` argument contains no nested double quotes. The
 * system PowerShell path is explicit so an untrusted workspace cannot win
 * command lookup with a repo-local `powershell.exe`.
 */
export function hookCommandFor(
  scriptPath: string,
  cliPath?: string,
  opts: HookCommandOptions = {},
): string {
  if ((opts.platform ?? process.platform) !== 'win32') {
    return sharedHookCommandFor(scriptPath, cliPath);
  }

  const nodePath = opts.nodePath?.trim()
    || process.env.WAGGLE_HOOK_NODE_PATH?.trim()
    || process.execPath;
  return windowsHookCommand(nodePath, scriptPath, cliPath);
}

export { backupPathFor };
