/**
 * Smoke-check the Codex install: hooks.json exists + parses + references
 * live hook scripts, and hive-mind-cli answers a `--help` probe. Plus two
 * codex-specific surfacings (spec §5.1 / §6.2):
 *   - the one-time `/hooks` trust step is required for non-managed Codex
 *     hooks to execute (surfaced as an advisory check, not a hard fail);
 *   - admin lockdown `allow_managed_hooks_only = true` in
 *     `~/.codex/requirements.toml` SUPPRESSES user hooks, so install would
 *     silently no-op — surfaced as a failing check.
 *
 * Probe priority for `cli_path`:
 *   1. Explicit `opts.cliPath` (caller override)
 *   2. `cli_path` recorded in `~/.codex/hive-mind-install.json`
 *   3. Bare `'hive-mind-cli'` on PATH
 */

import { readFile, access } from 'node:fs/promises';
import { constants, existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { createLogger, type Logger } from '@waggle/hive-mind-shim-core';
import { hasHiveEntries } from '@waggle/hive-mind-hooks-core';
import { resolvePaths, allHookBasenames, type ResolvePathsOptions } from './paths.js';
import { codexRegisterSpec } from './adapter.js';

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
  const log = opts.logger ?? createLogger({ name: 'codex-hooks/verify' });
  const paths = resolvePaths({
    ...(opts.home !== undefined ? { home: opts.home } : {}),
    ...(opts.hooksDir !== undefined ? { hooksDir: opts.hooksDir } : { moduleUrl: import.meta.url }),
  });
  const checks: VerifyCheck[] = [];

  // 1. hooks.json exists and parses.
  if (!existsSync(paths.configPath)) {
    checks.push({ name: 'hooks.json exists', ok: false, detail: paths.configPath });
    return { ok: false, checks };
  }
  checks.push({ name: 'hooks.json exists', ok: true, detail: paths.configPath });

  let parsed: Record<string, unknown>;
  try {
    const raw: unknown = JSON.parse(await readFile(paths.configPath, 'utf-8'));
    parsed = raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
    checks.push({ name: 'hooks.json parses as JSON', ok: true });
  } catch (err) {
    checks.push({
      name: 'hooks.json parses as JSON',
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, checks };
  }

  // 2. hive-mind entries present.
  checks.push({
    name: 'hooks.json contains hive-mind entries',
    ok: hasHiveEntries(parsed, codexRegisterSpec),
  });

  // 3. each hive hook entry points at an existing dist file.
  for (const basename of allHookBasenames()) {
    const scriptPath = join(paths.hooksDir, `${basename}.js`);
    const ok = await fileReadable(scriptPath);
    checks.push({ name: `${basename}.js readable on disk`, ok, detail: scriptPath });
  }

  // 4. admin lockdown: allow_managed_hooks_only suppresses user hooks.
  const requirementsPath = join(paths.codexDir, 'requirements.toml');
  if (existsSync(requirementsPath)) {
    try {
      const toml = await readFile(requirementsPath, 'utf-8');
      const locked = /allow_managed_hooks_only\s*=\s*true/.test(toml);
      checks.push({
        name: 'allow_managed_hooks_only lockdown',
        ok: !locked,
        detail: locked
          ? 'requirements.toml sets allow_managed_hooks_only = true — user hooks are suppressed; install will silently no-op.'
          : 'not locked',
      });
    } catch { /* unreadable — skip */ }
  }

  // 5. /hooks trust step advisory (informational — non-managed Codex hooks
  //    require a one-time `/hooks` trust before they execute).
  checks.push({
    name: '/hooks trust step (run once in Codex)',
    ok: true,
    detail: 'Run `/hooks` in Codex once to trust the hive-mind hooks.',
  });

  // 6. hive-mind-cli responds to --help (prefer install-pinned --cli-path).
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
