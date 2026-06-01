/**
 * Smoke-check the OpenClaw install: openclaw.json exists + parses (JSON/JSON5)
 * + carries the hive-mind internal-hooks entry with the subsystem enabled, the
 * managed hook dir + HOOK.md + handler.js exist on disk, and hive-mind-cli
 * answers a `--help` probe. Plus the openclaw-specific activation advisory
 * (spec §5.5 / §6.2): hooks are OFF until `hooks.internal.enabled=true`.
 *
 * Probe priority for `cli_path`:
 *   1. Explicit `opts.cliPath` (caller override)
 *   2. `cli_path` recorded in `~/.openclaw/hive-mind-install.json`
 *   3. Bare `'hive-mind-cli'` on PATH
 */

import { readFile, access } from 'node:fs/promises';
import { constants, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createLogger, type Logger } from '@waggle/hive-mind-shim-core';
import { resolvePaths, type ResolvePathsOptions } from './paths.js';
import { parseConfig, hasHiveEntries, HOOKS_KEY } from './json5-merger.js';

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

function isJsPath(p: string): boolean {
  return p.endsWith('.js') || p.endsWith('.mjs') || p.endsWith('.cjs');
}

function internalEnabled(config: Record<string, unknown>): boolean {
  const hooks = config[HOOKS_KEY];
  if (!hooks || typeof hooks !== 'object') return false;
  const internal = (hooks as Record<string, unknown>)['internal'];
  if (!internal || typeof internal !== 'object') return false;
  return (internal as Record<string, unknown>)['enabled'] === true;
}

function probeCliVersion(
  cliPath: string,
  spawnImpl: typeof spawn,
  timeoutMs: number,
): Promise<{ ok: boolean; output: string }> {
  return new Promise((resolve) => {
    let settled = false;
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
  const log = opts.logger ?? createLogger({ name: 'openclaw-hooks/verify' });
  const paths = resolvePaths({
    ...(opts.home !== undefined ? { home: opts.home } : {}),
    ...(opts.handlerSourcePath !== undefined
      ? { handlerSourcePath: opts.handlerSourcePath }
      : { moduleUrl: import.meta.url }),
  });
  const checks: VerifyCheck[] = [];

  // 1. openclaw.json exists and parses.
  if (!existsSync(paths.configPath)) {
    checks.push({ name: 'openclaw.json exists', ok: false, detail: paths.configPath });
    return { ok: false, checks };
  }
  checks.push({ name: 'openclaw.json exists', ok: true, detail: paths.configPath });

  let parsed: Record<string, unknown>;
  try {
    parsed = parseConfig(await readFile(paths.configPath, 'utf-8'));
    checks.push({ name: 'openclaw.json parses as JSON/JSON5', ok: true });
  } catch (err) {
    checks.push({
      name: 'openclaw.json parses as JSON/JSON5',
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, checks };
  }

  // 2. hive-mind internal-hooks entry present.
  checks.push({
    name: 'openclaw.json contains the hive-mind internal-hooks entry',
    ok: hasHiveEntries(parsed),
  });

  // 3. internal hooks subsystem enabled (hooks are OFF otherwise).
  const enabled = internalEnabled(parsed);
  checks.push({
    name: 'internal hooks subsystem enabled',
    ok: enabled,
    detail: enabled
      ? 'hooks.internal.enabled: true — the hive-mind hook is active.'
      : 'set hooks.internal.enabled: true (or run `openclaw hooks enable hive-mind`) — hooks are OFF until opted in.',
  });

  // 4. managed hook dir + HOOK.md + compiled handler exist on disk.
  checks.push({
    name: 'managed hook dir exists',
    ok: existsSync(paths.hiveHookDir),
    detail: paths.hiveHookDir,
  });
  checks.push({
    name: 'HOOK.md readable on disk',
    ok: await fileReadable(paths.hookMdPath),
    detail: paths.hookMdPath,
  });
  checks.push({
    name: 'handler.js readable on disk',
    ok: await fileReadable(paths.installedHandlerPath),
    detail: paths.installedHandlerPath,
  });

  // 5. hive-mind-cli responds to --help (prefer install-pinned --cli-path).
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
