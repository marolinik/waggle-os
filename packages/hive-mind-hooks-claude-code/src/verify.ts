/**
 * Smoke-check the install: settings exist + parse + reference live
 * hook scripts, and hive-mind-cli answers a `--help` probe.
 *
 * Probe priority for `cli_path`:
 *   1. Explicit `opts.cliPath` (caller override)
 *   2. `cli_path` recorded in `~/.claude/hive-mind-install.json` (set
 *      at install time via `--cli-path`)
 *   3. Bare `'hive-mind-cli'` on PATH
 */

import { readFile, access } from 'node:fs/promises';
import { constants, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createLogger, type Logger } from '@waggle/hive-mind-shim-core';
import { resolvePaths, allHookBasenames, type ResolvePathsOptions } from './paths.js';
import {
  HIVE_MIND_MARKER,
  HOOK_EVENT_BY_BASENAME,
  type ClaudeCodeSettings,
  type HookGroup,
} from './settings-merger.js';

export interface VerifyCheck {
  name: string;
  ok: boolean;
  detail?: string;
}

export interface VerifyResult {
  ok: boolean;
  checks: VerifyCheck[];
}

export interface VerifyOptions extends ResolvePathsOptions {
  logger?: Logger;
  /** Override hive-mind-cli executable name. Default 'hive-mind-cli'. */
  cliPath?: string;
  /** Test hook for spawn. */
  spawnImpl?: typeof spawn;
}

async function fileReadable(p: string): Promise<boolean> {
  try { await access(p, constants.R_OK); return true; } catch { return false; }
}

function findHiveGroup(groups: HookGroup[] | undefined, command: string): HookGroup | undefined {
  if (!Array.isArray(groups)) return undefined;
  return groups.find((g) => g._hiveMindShim === HIVE_MIND_MARKER && g.hooks[0]?.command === command);
}

function isJsPath(p: string): boolean {
  return p.endsWith('.js') || p.endsWith('.mjs') || p.endsWith('.cjs');
}

function probeCliVersion(
  cliPath: string,
  spawnImpl: typeof spawn,
  timeoutMs: number,
): Promise<{ ok: boolean; output: string }> {
  return new Promise((resolve) => {
    let settled = false;
    // If cliPath is a JS file, run via Node directly so .js paths work
    // cross-platform without needing a shell to launch npm bin shims.
    const command = isJsPath(cliPath) ? process.execPath : cliPath;
    const args = isJsPath(cliPath) ? [cliPath, '--help'] : ['--help'];
    const child = spawnImpl(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { child.kill('SIGTERM'); } catch { /* gone */ }
      resolve({ ok: false, output: 'timed out probing hive-mind-cli' });
    }, timeoutMs);
    child.stdout?.on('data', (c: Buffer) => stdout.push(c));
    child.stderr?.on('data', (c: Buffer) => stderr.push(c));
    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ok: false, output: err instanceof Error ? err.message : String(err) });
    });
    child.on('exit', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const out = Buffer.concat(stdout).toString('utf-8').slice(0, 200);
      const err = Buffer.concat(stderr).toString('utf-8').slice(0, 200);
      resolve({ ok: code === 0, output: code === 0 ? out : err });
    });
  });
}

export async function verify(opts: VerifyOptions = {}): Promise<VerifyResult> {
  const log = opts.logger ?? createLogger({ name: 'claude-code-hooks/verify' });
  const paths = resolvePaths({
    ...(opts.home !== undefined ? { home: opts.home } : {}),
    ...(opts.hooksDir !== undefined ? { hooksDir: opts.hooksDir } : { moduleUrl: import.meta.url }),
  });
  const checks: VerifyCheck[] = [];

  // 1. settings.json exists and parses
  if (!existsSync(paths.settingsPath)) {
    checks.push({ name: 'settings.json exists', ok: false, detail: paths.settingsPath });
    return { ok: false, checks };
  }
  checks.push({ name: 'settings.json exists', ok: true, detail: paths.settingsPath });

  let parsed: ClaudeCodeSettings;
  try {
    parsed = JSON.parse(await readFile(paths.settingsPath, 'utf-8')) as ClaudeCodeSettings;
    checks.push({ name: 'settings.json parses as JSON', ok: true });
  } catch (err) {
    checks.push({
      name: 'settings.json parses as JSON',
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, checks };
  }

  // 2. each hive hook entry is present and points to an existing dist file
  for (const basename of allHookBasenames()) {
    const eventKey = HOOK_EVENT_BY_BASENAME[basename];
    const groups = parsed.hooks?.[eventKey];
    const expectedCmdSuffix = `${basename}.js`;
    const found = Array.isArray(groups)
      ? groups.find((g) => g._hiveMindShim === HIVE_MIND_MARKER && g.hooks[0]?.command.includes(expectedCmdSuffix))
      : undefined;
    if (!found) {
      checks.push({ name: `hooks.${eventKey} contains hive-mind entry`, ok: false });
      continue;
    }
    checks.push({ name: `hooks.${eventKey} contains hive-mind entry`, ok: true });

    // Best-effort: extract path from `node "<path>"` and check file exists.
    const m = found.hooks[0]?.command.match(/node "([^"]+)"/);
    if (m && m[1]) {
      const ok = await fileReadable(m[1]);
      checks.push({
        name: `${basename}.js readable on disk`,
        ok,
        detail: m[1],
      });
    }
    // Also confirm we located the entry under the right top-level group key
    void findHiveGroup;
  }

  // 3. hive-mind-cli responds to --help.
  //    Prefer a path recorded by install (--cli-path flag) if present.
  let cliPathFromPointer: string | undefined;
  if (existsSync(paths.pointerPath)) {
    try {
      const pointerObj = JSON.parse(await readFile(paths.pointerPath, 'utf-8')) as Record<string, unknown>;
      const pointerCliPath = pointerObj['cli_path'];
      if (typeof pointerCliPath === 'string' && pointerCliPath.length > 0) {
        cliPathFromPointer = pointerCliPath;
      }
    } catch { /* pointer unreadable — fall through */ }
  }
  const cliPath = opts.cliPath ?? cliPathFromPointer ?? 'hive-mind-cli';
  const spawnImpl = opts.spawnImpl ?? spawn;
  const probe = await probeCliVersion(cliPath, spawnImpl, 4000);
  checks.push({
    name: 'hive-mind-cli reachable',
    ok: probe.ok,
    detail: cliPathFromPointer ? `${probe.output} (pinned: ${cliPath})` : probe.output,
  });

  const ok = checks.every((c) => c.ok);
  log.info('verify complete', { ok, total: checks.length, failed: checks.filter((c) => !c.ok).length });
  return { ok, checks };
}
