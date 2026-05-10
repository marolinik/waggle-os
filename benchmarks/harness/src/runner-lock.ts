/**
 * Sprint 12 Task 2.5 Stage 1.5 §7.4 — single-runner PID + heartbeat lock.
 *
 * Encodes `concurrent_runners: FORBIDDEN` at the process level. The v2 full-
 * context 100%-fail incident had concurrent benchmark processes saturating
 * the OpenRouter bridge (see §0.4 forensic). Manifest v4 will declare the
 * policy in Field 7; this module is the enforcement.
 *
 * Cross-platform strategy: mtime-heartbeat is PRIMARY; `process.kill(pid, 0)`
 * is secondary/audit-only because Windows reports success even for dead
 * PIDs that were recently in use (per PM §6 note). Lock ownership is
 * determined by whether the lock file's mtime is within the heartbeat-
 * staleness window — the running process `utimesSync`s the lock every
 * `heartbeatIntervalMs` (default 15 s), so a stale mtime (> 60 s) means
 * no live owner regardless of platform-specific PID check quirks.
 *
 * Failure modes:
 *   - Lock exists, mtime fresh          → refuse with clear error (owner alive)
 *   - Lock exists, mtime stale          → take over (warn), previous owner is dead
 *   - Lock exists, content corrupt      → treat as stale, take over
 *   - Lock dir doesn't exist            → mkdir -p then write
 *   - Fs write fails                    → propagate error up
 *
 * On clean exit / SIGINT / SIGTERM the lock is deleted. On hard crash
 * (kill -9, OOM) the lock persists until its heartbeat expires + the next
 * runner takes over.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** How long without a heartbeat update before a lock is considered stale. */
const DEFAULT_STALE_MS = 60_000;
/** How often the holder refreshes the lock file's mtime. */
const DEFAULT_HEARTBEAT_INTERVAL_MS = 15_000;

export interface LockPayload {
  pid: number;
  hostname: string;
  startedAt: string;
}

export interface LockHandle {
  readonly lockPath: string;
  /** Release the lock, stop the heartbeat, and remove signal handlers.
   *  Safe to call multiple times. */
  release(): void;
}

export interface AcquireOptions {
  /** Override staleness window (ms). Default 60_000. */
  staleMs?: number;
  /** Override heartbeat refresh interval (ms). Default 15_000. */
  heartbeatIntervalMs?: number;
  /** Injectable clock for deterministic tests. */
  nowFn?: () => number;
  /** Skip signal-handler registration (tests that don't want to hook the
   *  test runner's SIGINT). Default false — register handlers in production. */
  skipSignalHandlers?: boolean;
}

/** Read the existing lock file if it exists; returns null on any error. */
function readExistingLock(lockPath: string): { payload: LockPayload | null; ageMs: number | null } {
  if (!fs.existsSync(lockPath)) return { payload: null, ageMs: null };
  let payload: LockPayload | null = null;
  try {
    payload = JSON.parse(fs.readFileSync(lockPath, 'utf-8')) as LockPayload;
  } catch {
    // Corrupt content — treat as payload null; caller still computes ageMs
    // from stat mtime below.
  }
  const stat = fs.statSync(lockPath);
  return { payload, ageMs: Date.now() - stat.mtimeMs };
}

export function acquireRunnerLock(outputPath: string, opts: AcquireOptions = {}): LockHandle {
  const lockPath = `${outputPath}.lock`;
  const staleMs = opts.staleMs ?? DEFAULT_STALE_MS;
  const heartbeatMs = opts.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS;
  const nowFn = opts.nowFn ?? Date.now;

  // 1. Check for existing lock.
  const existing = readExistingLock(lockPath);
  if (existing.ageMs !== null && existing.ageMs < staleMs) {
    // Fresh heartbeat → active owner. Refuse.
    const pidStr = existing.payload?.pid ?? '?';
    const hostStr = existing.payload?.hostname ?? '?';
    throw new Error(
      `[bench:lock] active runner lock at ${lockPath} ` +
      `(pid=${pidStr}, host=${hostStr}, age_ms=${Math.round(existing.ageMs)}). ` +
      `Another waggle-bench process is running against this output path. ` +
      `Wait for it to finish, or if you're certain it's dead, delete the lock file manually.`,
    );
  }
  if (existing.ageMs !== null) {
    // Stale lock — note and take over.
    console.warn(
      `[bench:lock] taking stale lock at ${lockPath} ` +
      `(pid=${existing.payload?.pid ?? '?'}, age_ms=${Math.round(existing.ageMs)}, ` +
      `staleMs=${staleMs}). Previous owner is dead.`,
    );
  }

  // 2. Write our lock.
  const payload: LockPayload = {
    pid: process.pid,
    hostname: os.hostname(),
    startedAt: new Date(nowFn()).toISOString(),
  };
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  fs.writeFileSync(lockPath, JSON.stringify(payload, null, 2), 'utf-8');

  // 3. Start heartbeat. .unref() so a forgotten release() doesn't block
  // node's event loop from exiting normally.
  const heartbeat = setInterval(() => {
    try {
      const now = new Date();
      fs.utimesSync(lockPath, now, now);
    } catch {
      // Disk full, lock deleted, etc. Continue best-effort — the lock may
      // be stolen by another runner, but we can't do much about it.
    }
  }, heartbeatMs);
  heartbeat.unref();

  // 4. Signal handlers for clean release on Ctrl+C / kill <PID>.
  const signalHandler = (): void => {
    clearInterval(heartbeat);
    try { fs.unlinkSync(lockPath); } catch { /* already gone */ }
    process.exit(130);
  };
  if (!opts.skipSignalHandlers) {
    process.once('SIGINT', signalHandler);
    process.once('SIGTERM', signalHandler);
  }

  let released = false;
  return {
    lockPath,
    release(): void {
      if (released) return;
      released = true;
      clearInterval(heartbeat);
      if (!opts.skipSignalHandlers) {
        process.removeListener('SIGINT', signalHandler);
        process.removeListener('SIGTERM', signalHandler);
      }
      try { fs.unlinkSync(lockPath); } catch { /* already gone */ }
    },
  };
}
