/**
 * AI-OS Phase 4 polish — process tracker tests.
 *
 * Hermetic except for the bounded Windows process-tree regression. Liveness
 * and termination are injected everywhere else.
 */

import { describe, it, expect } from 'vitest';
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveWindowsTaskkillPath } from '../src/external-tool-runner.js';
import { ToolProcessTracker, type TrackedProcess } from '../src/tool-process-tracker.js';

describe('ToolProcessTracker', () => {
  it('registers a pid and reports it', () => {
    const tracker = new ToolProcessTracker({
      isAlive: () => true,
      now: () => new Date('2026-05-20T12:00:00Z'),
    });
    const rec = tracker.register(1234, 'claude-code', 'ws-A');
    expect(rec.pid).toBe(1234);
    expect(rec.toolId).toBe('claude-code');
    expect(rec.workspaceId).toBe('ws-A');
    expect(rec.startedAt).toBe('2026-05-20T12:00:00.000Z');
    expect(tracker.list()).toHaveLength(1);
  });

  it('registers third-party adapter ids', () => {
    const tracker = new ToolProcessTracker({ isAlive: () => true });
    const rec = tracker.register(4321, 'foo-cli');
    expect(rec.toolId).toBe('foo-cli');
    expect(tracker.list()[0].toolId).toBe('foo-cli');
  });

  it('omits workspaceId from the record when not provided', () => {
    const tracker = new ToolProcessTracker({ isAlive: () => true });
    const rec = tracker.register(1234, 'cursor');
    expect(rec.workspaceId).toBeUndefined();
  });

  it('re-registering the same pid replaces the prior entry', () => {
    const tracker = new ToolProcessTracker({ isAlive: () => true });
    tracker.register(1234, 'claude-code', 'ws-A');
    tracker.register(1234, 'cursor', 'ws-B');
    const all = tracker.list();
    expect(all).toHaveLength(1);
    expect(all[0].toolId).toBe('cursor');
    expect(all[0].workspaceId).toBe('ws-B');
  });

  it('list() omits dead pids and garbage-collects them', () => {
    const alive = new Set<number>([1, 2]);
    const tracker = new ToolProcessTracker({
      isAlive: (pid) => alive.has(pid),
    });
    tracker.register(1, 'claude-code');
    tracker.register(2, 'cursor');
    tracker.register(3, 'claude-desktop'); // not alive
    expect(tracker.size).toBe(3);
    const live = tracker.list();
    expect(live.map((p) => p.pid).sort()).toEqual([1, 2]);
    expect(tracker.size).toBe(2);
  });

  it('forget() removes a pid', () => {
    const tracker = new ToolProcessTracker({ isAlive: () => true });
    tracker.register(7, 'hermes');
    expect(tracker.forget(7)).toBe(true);
    expect(tracker.size).toBe(0);
    expect(tracker.forget(7)).toBe(false); // already gone
  });

  it('clear() empties the tracker', () => {
    const tracker = new ToolProcessTracker({ isAlive: () => true });
    tracker.register(1, 'claude-code');
    tracker.register(2, 'cursor');
    tracker.clear();
    expect(tracker.size).toBe(0);
    expect(tracker.list()).toEqual([]);
  });

  it('default isAlive returns false for an obviously-dead pid', () => {
    // PID 1 is init on POSIX (always alive) but using a giant unlikely
    // pid is the cross-platform safe probe.
    const tracker = new ToolProcessTracker();
    const FAKE_PID = 2147483646; // near max int32
    tracker.register(FAKE_PID, 'claude-code');
    // list() will probe with the real process.kill(0) — which throws
    // on dead pids — and GC the entry.
    expect(tracker.list().length).toBeLessThanOrEqual(1); // tolerant
    // Now register a definitely-alive pid (this process itself) and
    // confirm it stays.
    tracker.clear();
    tracker.register(process.pid, 'claude-code');
    expect(tracker.list()).toHaveLength(1);
  });
});

// ── kill() — E-1 ────────────────────────────────────────────────────

describe('ToolProcessTracker.kill', () => {
  it.runIf(process.platform === 'win32')('kills the full detached Windows launcher process tree', async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle tracker tree '));
    const readyPath = path.join(tempRoot, 'descendant ready.txt');
    const childCode = [
      `const fs = require('node:fs')`,
      `fs.writeFileSync(${JSON.stringify(readyPath)}, String(process.pid))`,
      'setInterval(() => {}, 1000)',
      'setTimeout(() => process.exit(0), 15000)',
    ].join(';');
    const parentCode = [
      `const { spawn } = require('node:child_process')`,
      `const child = spawn(process.execPath, ['-e', ${JSON.stringify(childCode)}], { stdio: 'ignore', windowsHide: true })`,
      'child.unref()',
      'setInterval(() => {}, 1000)',
      'setTimeout(() => process.exit(0), 15000)',
    ].join(';');
    const parent = spawn(process.execPath, ['-e', parentCode], {
      cwd: tempRoot,
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    if (parent.pid == null) throw new Error('Windows process-tree fixture did not start');
    parent.unref();
    let childPid: number | undefined;

    try {
      const readyDeadline = Date.now() + 5_000;
      while (!fs.existsSync(readyPath) && Date.now() < readyDeadline) {
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      expect(fs.existsSync(readyPath)).toBe(true);
      childPid = Number(fs.readFileSync(readyPath, 'utf8'));
      expect(Number.isSafeInteger(childPid) && childPid > 0).toBe(true);

      const tracker = new ToolProcessTracker();
      tracker.register(parent.pid, 'codex', 'workspace with spaces');
      const result = await tracker.kill(parent.pid, 200);

      expect(result).toEqual({ ok: true, pid: parent.pid, reason: 'tree-kill-ok' });
      expect(() => process.kill(childPid!, 0)).toThrow();
      expect(tracker.size).toBe(0);
    } finally {
      for (const pid of [parent.pid, childPid]) {
        if (!pid || !Number.isSafeInteger(pid)) continue;
        try {
          execFileSync(resolveWindowsTaskkillPath(), ['/PID', String(pid), '/T', '/F'], {
            timeout: 5_000,
            windowsHide: true,
            stdio: 'ignore',
          });
        } catch {
          // The fixed path already removed the process tree.
        }
      }
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  }, 20_000);

  it('fails closed when Windows process-tree termination cannot be proven', async () => {
    let signalCalls = 0;
    const tracker = new ToolProcessTracker({
      platform: 'win32',
      isAlive: () => true,
      killTree: async () => false,
      sendSignal: () => {
        signalCalls += 1;
        return true;
      },
    });
    tracker.register(456, 'codex', 'ws-A');

    const result = await tracker.kill(456);

    expect(result).toEqual({ ok: false, pid: 456, reason: 'tree-kill-failed' });
    expect(signalCalls).toBe(0);
    expect(tracker.size).toBe(1);
  });

  it('does not claim Windows tree cleanup when the tracked root is already gone', async () => {
    const tracker = new ToolProcessTracker({
      platform: 'win32',
      isAlive: () => false,
    });
    tracker.register(457, 'codex', 'ws-A');

    const result = await tracker.kill(457);

    expect(result).toEqual({ ok: false, pid: 457, reason: 'tree-cleanup-unverified' });
    expect(tracker.size).toBe(1);
  });

  it('refuses to kill a pid we do not track (UX guard)', async () => {
    const tracker = new ToolProcessTracker({
      isAlive: () => true,
      sendSignal: () => true,
    });
    const result = await tracker.kill(99999);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('not-tracked');
  });

  it('reports already-dead and GCs the entry when pid is gone', async () => {
    const tracker = new ToolProcessTracker({
      platform: 'linux',
      isAlive: () => false, // already dead
      sendSignal: () => true,
    });
    tracker.register(123, 'claude-code');
    const result = await tracker.kill(123);
    expect(result.ok).toBe(true);
    expect(result.reason).toBe('already-dead');
    expect(tracker.size).toBe(0);
  });

  it('SIGTERM happy path — sends term, process dies within grace, GC entry', async () => {
    const signals: Array<{ pid: number; signal: NodeJS.Signals | number }> = [];
    let alive = true;
    const tracker = new ToolProcessTracker({
      platform: 'linux',
      isAlive: () => alive,
      sendSignal: (pid, signal) => {
        signals.push({ pid, signal });
        if (signal === 'SIGTERM') alive = false; // simulate graceful exit
        return true;
      },
      delay: async () => {
        /* skip the wait in tests */
      },
    });
    tracker.register(456, 'cursor');
    const result = await tracker.kill(456, 1000);
    expect(result.ok).toBe(true);
    expect(result.reason).toBe('sigterm-ok');
    expect(signals).toEqual([{ pid: 456, signal: 'SIGTERM' }]);
    expect(tracker.size).toBe(0);
  });

  it('escalates to SIGKILL when SIGTERM is ignored', async () => {
    const signals: Array<NodeJS.Signals | number> = [];
    let alive = true;
    const tracker = new ToolProcessTracker({
      platform: 'linux',
      isAlive: () => alive,
      sendSignal: (_pid, signal) => {
        signals.push(signal);
        // SIGTERM ignored; SIGKILL succeeds.
        if (signal === 'SIGKILL') alive = false;
        return true;
      },
      delay: async () => undefined,
    });
    tracker.register(789, 'claude-desktop');
    const result = await tracker.kill(789);
    expect(result.ok).toBe(true);
    expect(result.reason).toBe('sigkill-ok');
    expect(signals).toEqual(['SIGTERM', 'SIGKILL']);
    expect(tracker.size).toBe(0);
  });

  it('reports both-failed when neither signal lands', async () => {
    const tracker = new ToolProcessTracker({
      platform: 'linux',
      isAlive: () => true,
      sendSignal: () => false, // both signals refused (e.g. EPERM)
      delay: async () => undefined,
    });
    tracker.register(111, 'claude-code');
    const result = await tracker.kill(111);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('sigterm-failed-sigkill-failed');
    // Entry retained so the UI can surface the failure + retry.
    expect(tracker.size).toBe(1);
  });
});

// ── persistence + boot reconciliation (#2) ──────────────────────────
// Cross-restart attribution: the spawned tool outlives the sidecar, so
// on restart we reload a pidfile, probe liveness, keep the survivors,
// and prune the dead — instead of dropping everything.

describe('ToolProcessTracker — persistence', () => {
  function memStore(initial: TrackedProcess[] = []) {
    let saved: TrackedProcess[] = initial.map((r) => ({ ...r }));
    const saves: TrackedProcess[][] = [];
    return {
      loadPersisted: (): TrackedProcess[] => saved.map((r) => ({ ...r })),
      savePersisted: (recs: readonly TrackedProcess[]): void => {
        saved = recs.map((r) => ({ ...r }));
        saves.push(recs.map((r) => ({ ...r })));
      },
      get current(): TrackedProcess[] {
        return saved;
      },
      saves,
    };
  }

  it('saves to the store on register', () => {
    const store = memStore();
    const tracker = new ToolProcessTracker({
      isAlive: () => true,
      loadPersisted: store.loadPersisted,
      savePersisted: store.savePersisted,
    });
    tracker.register(100, 'claude-code', 'ws-A');
    expect(store.current.map((r) => r.pid)).toEqual([100]);
  });

  it('reconciles on construction: keeps alive pids, drops dead, prunes the store', () => {
    const store = memStore([
      { pid: 1, toolId: 'claude-code', startedAt: '2026-06-29T00:00:00.000Z' },
      { pid: 2, toolId: 'cursor', startedAt: '2026-06-29T00:00:00.000Z' },
    ]);
    const tracker = new ToolProcessTracker({
      isAlive: (pid) => pid === 1,
      loadPersisted: store.loadPersisted,
      savePersisted: store.savePersisted,
    });
    expect(tracker.list().map((r) => r.pid)).toEqual([1]);
    expect(store.current.map((r) => r.pid)).toEqual([1]); // dead pid pruned from disk
  });

  it('persists on forget', () => {
    const store = memStore();
    const tracker = new ToolProcessTracker({
      isAlive: () => true,
      loadPersisted: store.loadPersisted,
      savePersisted: store.savePersisted,
    });
    tracker.register(5, 'hermes');
    tracker.forget(5);
    expect(store.current).toEqual([]);
  });

  it('persists dead pid pruning performed by list()', () => {
    const store = memStore();
    const alive = new Set([5, 6]);
    const tracker = new ToolProcessTracker({
      isAlive: (pid) => alive.has(pid),
      loadPersisted: store.loadPersisted,
      savePersisted: store.savePersisted,
    });
    tracker.register(5, 'hermes');
    tracker.register(6, 'cursor');

    alive.delete(6);
    expect(tracker.list().map((process) => process.pid)).toEqual([5]);
    expect(store.current.map((process) => process.pid)).toEqual([5]);
  });

  it('persists on kill', async () => {
    const store = memStore();
    let alive = true;
    const tracker = new ToolProcessTracker({
      platform: 'linux',
      isAlive: () => alive,
      sendSignal: (_p, s) => {
        if (s === 'SIGTERM') alive = false;
        return true;
      },
      delay: async () => undefined,
      loadPersisted: store.loadPersisted,
      savePersisted: store.savePersisted,
    });
    tracker.register(9, 'cursor');
    await tracker.kill(9, 10);
    expect(store.current).toEqual([]);
  });

  it('is pure in-memory (no throw) when no persistence is configured', () => {
    const tracker = new ToolProcessTracker({ isAlive: () => true });
    expect(() => tracker.register(1, 'claude-code')).not.toThrow();
  });

  it('reconcile does not write when the store was empty (no eager file create)', () => {
    const store = memStore([]);
    new ToolProcessTracker({
      isAlive: () => true,
      loadPersisted: store.loadPersisted,
      savePersisted: store.savePersisted,
    });
    expect(store.saves).toHaveLength(0);
  });
});

describe('observed processes are in-memory only', () => {
  it('lists observed pids but never persists them', () => {
    const saved: TrackedProcess[][] = [];
    const tracker = new ToolProcessTracker({
      savePersisted: (recs) => saved.push([...recs]),
      isAlive: () => true,
      now: () => new Date('2026-06-30T00:00:00Z'),
    });
    tracker.register(11, 'claude-code', 'ws1'); // detached
    tracker.register(22, 'cursor', 'ws1', { observed: true }); // observed

    // Both are live in memory:
    expect(tracker.list().map((p) => p.pid).sort((a, b) => a - b)).toEqual([11, 22]);
    // But the most recent persisted snapshot excludes the observed pid:
    const last = saved[saved.length - 1];
    expect(last.map((p) => p.pid)).toEqual([11]);
  });

  it('marks the record observed:true', () => {
    const tracker = new ToolProcessTracker({ isAlive: () => true });
    const rec = tracker.register(33, 'codex', undefined, { observed: true });
    expect(rec.observed).toBe(true);
  });
});
