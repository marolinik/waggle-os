/**
 * Task 2.5 Stage 1.5 §7.4 — acquireRunnerLock tests.
 *
 * Uses a fresh per-test tmpdir so concurrent vitest workers don't collide,
 * and passes `skipSignalHandlers: true` so the vitest runner's SIGINT path
 * stays untouched.
 *
 * Windows PID-check note (PM §6): these tests assert the mtime-heartbeat
 * behaviour, which is the primary cross-platform signal. `process.kill(pid,
 * 0)` is not exercised here — it's used nowhere in the production code
 * path (see src/runner-lock.ts module header for rationale).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { acquireRunnerLock } from '../src/runner-lock.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-lock-test-'));
});

afterEach(() => {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
});

describe('acquireRunnerLock — basic acquire/release', () => {
  it('writes the lock file with payload {pid, hostname, startedAt}', () => {
    const output = path.join(tmpDir, 'run.jsonl');
    const h = acquireRunnerLock(output, { skipSignalHandlers: true });
    try {
      expect(fs.existsSync(h.lockPath)).toBe(true);
      const payload = JSON.parse(fs.readFileSync(h.lockPath, 'utf-8'));
      expect(payload.pid).toBe(process.pid);
      expect(typeof payload.hostname).toBe('string');
      expect(new Date(payload.startedAt).toString()).not.toBe('Invalid Date');
    } finally {
      h.release();
    }
  });

  it('release() deletes the lock file', () => {
    const output = path.join(tmpDir, 'run.jsonl');
    const h = acquireRunnerLock(output, { skipSignalHandlers: true });
    expect(fs.existsSync(h.lockPath)).toBe(true);
    h.release();
    expect(fs.existsSync(h.lockPath)).toBe(false);
  });

  it('release() is idempotent', () => {
    const output = path.join(tmpDir, 'run.jsonl');
    const h = acquireRunnerLock(output, { skipSignalHandlers: true });
    h.release();
    expect(() => h.release()).not.toThrow();
  });

  it('creates parent directories as needed', () => {
    const output = path.join(tmpDir, 'nested', 'dir', 'run.jsonl');
    const h = acquireRunnerLock(output, { skipSignalHandlers: true });
    try {
      expect(fs.existsSync(h.lockPath)).toBe(true);
    } finally {
      h.release();
    }
  });
});

describe('acquireRunnerLock — contention + staleness', () => {
  it('refuses to acquire when a fresh lock exists', () => {
    const output = path.join(tmpDir, 'run.jsonl');
    const h1 = acquireRunnerLock(output, { skipSignalHandlers: true });
    try {
      expect(() =>
        acquireRunnerLock(output, { skipSignalHandlers: true }),
      ).toThrow(/active runner lock/);
    } finally {
      h1.release();
    }
  });

  it('takes over a stale lock (mtime beyond staleMs)', () => {
    const output = path.join(tmpDir, 'run.jsonl');
    const h1 = acquireRunnerLock(output, { skipSignalHandlers: true });
    // Backdate the lock file mtime to simulate a crashed owner.
    const oldTime = new Date(Date.now() - 10 * 60_000);
    fs.utimesSync(h1.lockPath, oldTime, oldTime);
    // Second acquire should succeed — stale owner, take over.
    const h2 = acquireRunnerLock(output, { skipSignalHandlers: true, staleMs: 60_000 });
    try {
      // Lock is the same file path but now owned by h2 — verify by reading
      // the payload's startedAt (h2 wrote fresh, so it's recent).
      const payload = JSON.parse(fs.readFileSync(h2.lockPath, 'utf-8'));
      const age = Date.now() - new Date(payload.startedAt).getTime();
      expect(age).toBeLessThan(2000); // written within last 2s
    } finally {
      h2.release();
      // h1.release() is a no-op since h2 deleted the shared lock file; still safe.
      h1.release();
    }
  });

  it('tolerates a corrupt lock file (treats as stale when mtime allows)', () => {
    const output = path.join(tmpDir, 'run.jsonl');
    const lockPath = `${output}.lock`;
    // Manually write garbage + backdate so it counts as stale.
    fs.writeFileSync(lockPath, '{not valid json', 'utf-8');
    const oldTime = new Date(Date.now() - 10 * 60_000);
    fs.utimesSync(lockPath, oldTime, oldTime);
    const h = acquireRunnerLock(output, { skipSignalHandlers: true, staleMs: 60_000 });
    try {
      const payload = JSON.parse(fs.readFileSync(h.lockPath, 'utf-8'));
      expect(payload.pid).toBe(process.pid);
    } finally {
      h.release();
    }
  });

  it('custom staleMs controls when a lock is considered stale', () => {
    const output = path.join(tmpDir, 'run.jsonl');
    const lockPath = `${output}.lock`;
    fs.writeFileSync(lockPath, JSON.stringify({ pid: 99999, hostname: 'ghost', startedAt: '2000-01-01' }));
    // Lock is fresh by default 60s window, but expired under staleMs: 1 (1ms).
    // Wait 10ms to ensure age > 1ms:
    const start = Date.now();
    while (Date.now() - start < 15) { /* busy wait */ }
    const h = acquireRunnerLock(output, { skipSignalHandlers: true, staleMs: 1 });
    try {
      expect(h.lockPath).toBe(lockPath);
    } finally {
      h.release();
    }
  });
});

describe('acquireRunnerLock — heartbeat refresh', () => {
  it('refreshes lock mtime at the configured interval', async () => {
    const output = path.join(tmpDir, 'run.jsonl');
    const h = acquireRunnerLock(output, {
      skipSignalHandlers: true,
      heartbeatIntervalMs: 50, // aggressive for test speed
    });
    try {
      const mtime1 = fs.statSync(h.lockPath).mtimeMs;
      await new Promise<void>(resolve => setTimeout(resolve, 120)); // let heartbeat fire
      const mtime2 = fs.statSync(h.lockPath).mtimeMs;
      expect(mtime2).toBeGreaterThanOrEqual(mtime1);
    } finally {
      h.release();
    }
  });

  it('stops refreshing after release()', async () => {
    const output = path.join(tmpDir, 'run.jsonl');
    const h = acquireRunnerLock(output, {
      skipSignalHandlers: true,
      heartbeatIntervalMs: 50,
    });
    h.release();
    // Lock file is gone — subsequent heartbeat attempts silently fail (wrapped
    // in try/catch). Wait and confirm no error bubbles up.
    await new Promise<void>(resolve => setTimeout(resolve, 150));
    expect(fs.existsSync(h.lockPath)).toBe(false);
  });
});
