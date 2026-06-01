/**
 * Smoke-check the Hermes install: config.yaml exists + parses + carries
 * hive-mind entries that reference live hook scripts, and hive-mind-cli
 * answers a `--help` probe. Plus the hermes-specific consent advisory
 * (spec §5.4 / §6.2): under headless / non-TTY launches the hooks register
 * only if `hooks_auto_accept: true` (or `HERMES_ACCEPT_HOOKS=1`) is set,
 * otherwise Hermes's first-use consent allow-list silently never registers
 * them.
 *
 * Probe priority for `cli_path`:
 *   1. Explicit `opts.cliPath` (caller override)
 *   2. `cli_path` recorded in `~/.hermes/hive-mind-install.json`
 *   3. Bare `'hive-mind-cli'` on PATH
 */

import { readFile, access } from 'node:fs/promises';
import { constants, existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { createLogger, type Logger } from '@waggle/hive-mind-shim-core';
import { resolvePaths, allHookBasenames, type ResolvePathsOptions } from './paths.js';
import { parseConfig, hasHiveEntries } from './yaml-merger.js';

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
  const log = opts.logger ?? createLogger({ name: 'hermes-hooks/verify' });
  const paths = resolvePaths({
    ...(opts.home !== undefined ? { home: opts.home } : {}),
    ...(opts.hooksDir !== undefined ? { hooksDir: opts.hooksDir } : { moduleUrl: import.meta.url }),
  });
  const checks: VerifyCheck[] = [];

  // 1. config.yaml exists and parses.
  if (!existsSync(paths.configPath)) {
    checks.push({ name: 'config.yaml exists', ok: false, detail: paths.configPath });
    return { ok: false, checks };
  }
  checks.push({ name: 'config.yaml exists', ok: true, detail: paths.configPath });

  let parsed: Record<string, unknown>;
  try {
    parsed = parseConfig(await readFile(paths.configPath, 'utf-8'));
    checks.push({ name: 'config.yaml parses as YAML', ok: true });
  } catch (err) {
    checks.push({
      name: 'config.yaml parses as YAML',
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, checks };
  }

  // 2. hive-mind entries present in the hooks: block.
  checks.push({
    name: 'config.yaml contains hive-mind hook entries',
    ok: hasHiveEntries(parsed),
  });

  // 3. each hive hook script exists on disk (3 scripts — no pre-compact).
  for (const basename of allHookBasenames()) {
    const scriptPath = join(paths.hooksDir, `${basename}.js`);
    const ok = await fileReadable(scriptPath);
    checks.push({ name: `${basename}.js readable on disk`, ok, detail: scriptPath });
  }

  // 4. consent advisory — headless launches need auto-accept or env.
  const autoAccept = parsed['hooks_auto_accept'] === true;
  checks.push({
    name: 'headless consent configured',
    ok: autoAccept,
    detail: autoAccept
      ? 'hooks_auto_accept: true is set — hooks register under headless launch.'
      : 'set hooks_auto_accept: true (or HERMES_ACCEPT_HOOKS=1) or hooks silently never register under headless / non-TTY launch.',
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
