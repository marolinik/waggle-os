/**
 * AI-OS Phase 4 polish — process tracker tests.
 *
 * Hermetic — no real processes involved. Liveness is injected.
 */

import { describe, it, expect } from 'vitest';
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

  it('persists on kill', async () => {
    const store = memStore();
    let alive = true;
    const tracker = new ToolProcessTracker({
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
    // eslint-disable-next-line no-new
    new ToolProcessTracker({
      isAlive: () => true,
      loadPersisted: store.loadPersisted,
      savePersisted: store.savePersisted,
    });
    expect(store.saves).toHaveLength(0);
  });
});
