/**
 * Shell-env resolver — AI-OS / router-arc P0-C (RECON §2).
 *
 * Problem: when the Tauri sidecar is launched from a macOS/Linux GUI (Finder,
 * Dock, .app bundle) it inherits a *bare* PATH — the login shell's profile
 * (`~/.zprofile`, `~/.bash_profile`, nvm/homebrew/asdf shims, …) is never
 * sourced. Tool detection (`which claude`) and the external-tool runner then
 * fail to find CLIs the user installed via those shims.
 *
 * Fix: resolve the *login-interactive* shell environment once per process by
 * spawning `${SHELL} -l -i -c 'env -0'`, parse the null-separated dump, and
 * expose the resolved PATH to callers. Windows is unaffected (PATH comes from
 * the registry / system env, inherited correctly) so we short-circuit to
 * `process.env` there.
 *
 * Contract:
 *   - Never throws — every failure path resolves to the `process` fallback.
 *   - Never logs secrets (no logging of env values at all).
 *   - Process-lifetime cache + single-flight: concurrent callers share one
 *     spawn; a successful login-shell result is cached forever.
 *   - On failure a 60s cooldown gates re-spawn attempts.
 */

import { spawn } from 'node:child_process';

export interface ShellEnvResult {
  env: Record<string, string>;
  source: 'login-shell' | 'process';
}

export interface ResolveShellEnvOptions {
  /** Login-shell spawn timeout before SIGTERM (default 12_000ms). */
  timeoutMs?: number;
  /** Test seam: platform override (defaults to process.platform). */
  platform?: NodeJS.Platform;
  /** Test seam: spawn override (defaults to child_process.spawn). */
  spawnFn?: typeof spawn;
}

const DEFAULT_TIMEOUT_MS = 12_000;
const SIGKILL_GRACE_MS = 2_000;
const FAILURE_COOLDOWN_MS = 60_000;

// ── Process-lifetime module state ───────────────────────────────────
let cached: ShellEnvResult | null = null;
let inflight: Promise<ShellEnvResult> | null = null;
let cooldownUntil = 0;

function currentPlatform(opts?: ResolveShellEnvOptions): NodeJS.Platform {
  return opts?.platform ?? process.platform;
}

function filterStringEnv(src: NodeJS.ProcessEnv): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(src)) {
    if (typeof value === 'string') out[key] = value;
  }
  return out;
}

function processFallback(): ShellEnvResult {
  return { env: filterStringEnv(process.env), source: 'process' };
}

function parseEnv0(payload: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const entry of payload.split('\0')) {
    if (!entry) continue;
    const eq = entry.indexOf('=');
    if (eq <= 0) continue;
    out[entry.slice(0, eq)] = entry.slice(eq + 1);
  }
  return out;
}

/**
 * Spawn the shell once with the given args, collect stdout, and parse an
 * `env -0` dump. Resolves `null` on any non-clean outcome (spawn error,
 * non-zero exit, timeout, empty/garbled output) so the caller can fall back.
 */
function spawnShellEnv(
  args: string[],
  timeoutMs: number,
  spawnFn: typeof spawn,
): Promise<Record<string, string> | null> {
  return new Promise((resolve) => {
    const shell = process.env.SHELL || '/bin/sh';
    let child: ReturnType<typeof spawn>;
    try {
      child = spawnFn(shell, args, { stdio: ['ignore', 'pipe', 'ignore'] });
    } catch {
      resolve(null);
      return;
    }
    let out = '';
    let settled = false;
    const settle = (value: Record<string, string> | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(sigtermTimer);
      clearTimeout(sigkillTimer);
      resolve(value);
    };
    const sigtermTimer = setTimeout(() => {
      try { child.kill('SIGTERM'); } catch { /* already gone */ }
    }, timeoutMs);
    const sigkillTimer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch { /* already gone */ }
      settle(null);
    }, timeoutMs + SIGKILL_GRACE_MS);
    child.stdout?.on('data', (chunk: Buffer | string) => { out += chunk.toString(); });
    child.once('error', () => settle(null));
    child.once('exit', (code) => {
      settle(code === 0 && out.includes('=') ? parseEnv0(out) : null);
    });
  });
}

async function doResolve(opts: ResolveShellEnvOptions): Promise<ShellEnvResult> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const spawnFn = opts.spawnFn ?? spawn;
  try {
    // Prefer login + interactive (sources both profile and rc files).
    const interactive = await spawnShellEnv(['-l', '-i', '-c', 'env -0'], timeoutMs, spawnFn);
    if (interactive && interactive.PATH) {
      return { env: interactive, source: 'login-shell' };
    }
    // Fall back to login-only (some shells reject `-i` without a tty).
    const loginOnly = await spawnShellEnv(['-l', '-c', 'env -0'], timeoutMs, spawnFn);
    if (loginOnly && loginOnly.PATH) {
      return { env: loginOnly, source: 'login-shell' };
    }
  } catch {
    // fall through to process fallback
  }
  return processFallback();
}

/**
 * Resolve the login-shell environment (async). Cached + single-flight. Always
 * resolves — never rejects. Windows short-circuits to the process env.
 */
export async function resolveShellEnv(
  opts: ResolveShellEnvOptions = {},
): Promise<ShellEnvResult> {
  if (cached) return cached;
  if (currentPlatform(opts) === 'win32') {
    cached = processFallback();
    return cached;
  }
  if (inflight) return inflight;
  if (Date.now() < cooldownUntil) return processFallback();

  inflight = doResolve(opts)
    .then((result) => {
      if (result.source === 'login-shell') {
        cached = result;
      } else {
        cooldownUntil = Date.now() + FAILURE_COOLDOWN_MS;
      }
      return result;
    })
    .catch(() => {
      // doResolve never throws, but guard the contract regardless.
      cooldownUntil = Date.now() + FAILURE_COOLDOWN_MS;
      return processFallback();
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/**
 * Synchronous best-effort accessor for hot paths (tool detection, runner env).
 * Returns the cached login-shell result if available, otherwise the process env
 * immediately while kicking off a background resolve for the next caller.
 */
export function resolveShellEnvBestEffort(): ShellEnvResult {
  if (cached) return cached;
  if (currentPlatform() === 'win32') {
    cached = processFallback();
    return cached;
  }
  if (!inflight && Date.now() >= cooldownUntil) {
    void resolveShellEnv();
  }
  return processFallback();
}

/**
 * The resolved login-shell PATH, or null when unavailable (Windows, not yet
 * resolved, or resolution failed). Callers merge this into their lookup/runner
 * env; null means "keep existing behavior".
 */
export function resolvedShellPath(): string | null {
  const result = resolveShellEnvBestEffort();
  return result.source === 'login-shell' ? (result.env.PATH ?? null) : null;
}

/**
 * Union two POSIX PATH strings, shell PATH entries first, de-duplicated, so the
 * login-shell shims win without dropping anything already present in `base`.
 */
export function mergePathValue(shellPath: string, basePath: string | undefined): string {
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const segment of `${shellPath}:${basePath ?? ''}`.split(':')) {
    if (segment && !seen.has(segment)) {
      seen.add(segment);
      parts.push(segment);
    }
  }
  return parts.join(':');
}

/** Test-only: reset process-lifetime cache/cooldown/single-flight state. */
export function __resetShellEnvStateForTests(): void {
  cached = null;
  inflight = null;
  cooldownUntil = 0;
}
