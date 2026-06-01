/**
 * Hermes opportunistic, time-gated compact-on-Stop (OQ-4).
 *
 * Hermes ships no PreCompact lifecycle event, so the `cleanup_frames`
 * maintenance pass every other built hook binds to PreCompact never runs.
 * This module approximates "occasional before-compaction maintenance" by
 * running `bridge.cleanupFrames()` opportunistically from the per-turn Stop
 * hook — OPT-IN, DEFAULT OFF (`WAGGLE_HERMES_COMPACT_ON_STOP`), so OSS
 * consumers see zero behavior change unless they ask for it.
 *
 * Statelessness bridge: Hermes' Stop is delivered to a fresh Node subprocess
 * every turn, so an "every N turns" counter is impossible without persistence.
 * We compact at most once per time window, tracking the last-compact instant
 * in a small file under `~/.hermes/`. Turns are sequential subprocesses
 * (process N exits before N+1 starts) → no read/write race.
 *
 * Fail-open is sacred: `maybeCompactOnStop` NEVER throws and NEVER rejects;
 * every IO path is wrapped + swallowed. The timestamp is written ON SUCCESS
 * ONLY — a failed compact stays eligible to retry next turn rather than being
 * locked out for a whole window.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { HookContext } from '@waggle/hive-mind-hooks-core';
import { resolvePaths } from './paths.js';

/** Default compact window: at most once per 10 minutes. */
export const DEFAULT_WINDOW_MS = 600_000;

const STATE_BASENAME = '.hive-mind-last-compact';

/**
 * Absolute path to the last-compact timestamp file, under the hermes config
 * root (`~/.hermes/.hive-mind-last-compact`). `home` overrides $HOME for tests.
 */
export function compactStatePath(home?: string): string {
  return join(resolvePaths({ home }).hermesDir, STATE_BASENAME);
}

/**
 * Whether opt-in compact-on-Stop is enabled. Parsed exactly like
 * `WAGGLE_SIGNAL_EMIT` in `runStopBody`: truthy unless unset / empty / '0' /
 * 'false' (case-insensitive).
 */
export function isCompactEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const flag = env['WAGGLE_HERMES_COMPACT_ON_STOP'];
  return flag != null && flag !== '' && flag !== '0' && flag.toLowerCase() !== 'false';
}

/**
 * Resolve the compact window in ms. A test `overrideMs` wins; else
 * `WAGGLE_HERMES_COMPACT_WINDOW_MIN` minutes when finite and > 0; else the
 * 10-minute default.
 */
export function resolveWindowMs(
  env: NodeJS.ProcessEnv = process.env,
  overrideMs?: number,
): number {
  if (overrideMs !== undefined) return overrideMs;
  const raw = env['WAGGLE_HERMES_COMPACT_WINDOW_MIN'];
  if (raw != null && raw !== '') {
    const minutes = Number.parseFloat(raw);
    if (Number.isFinite(minutes) && minutes > 0) return minutes * 60_000;
  }
  return DEFAULT_WINDOW_MS;
}

/**
 * Read the persisted last-compact timestamp. Missing file / garbage / NaN →
 * undefined ("never"). Fail-open: any error resolves to undefined.
 */
export async function readLastCompactTs(path: string): Promise<number | undefined> {
  try {
    const raw = await readFile(path, 'utf-8');
    const ts = Number.parseInt(raw.trim(), 10);
    return Number.isFinite(ts) ? ts : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Persist the last-compact timestamp. mkdir-recursive the parent first (a bare
 * writeFile would ENOENT every turn on a host where `~/.hermes/` doesn't exist
 * yet, silently degrading the throttle to every-turn; mkdir-recursive is
 * idempotent + cheap, and in a real install the dir already exists). The
 * caller catches + swallows errors.
 */
export async function writeLastCompactTs(path: string, ts: number): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, String(ts));
}

export interface MaybeCompactOptions {
  /** Injectable clock for tests; falls back to the system clock. */
  now?: () => number;
  /** $HOME override for the state file (tests). */
  home?: string;
  /** Compact window override in ms (tests); wins over the env var. */
  windowMs?: number;
}

/**
 * Opportunistically run the `cleanup_frames` maintenance pass, gated by the
 * opt-in flag + a persisted time window. NEVER throws, NEVER rejects.
 */
export async function maybeCompactOnStop(
  ctx: HookContext,
  opts: MaybeCompactOptions = {},
): Promise<void> {
  try {
    if (!isCompactEnabled()) return;
    const now = opts.now?.() ?? Date.now();
    const path = compactStatePath(opts.home);
    const last = await readLastCompactTs(path);
    const windowMs = resolveWindowMs(process.env, opts.windowMs);
    if (last !== undefined && now - last < windowMs) return;
    await ctx.bridge.cleanupFrames();
    await writeLastCompactTs(path, now);
  } catch (err) {
    ctx.logger.warn('compact-on-stop failed open', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
