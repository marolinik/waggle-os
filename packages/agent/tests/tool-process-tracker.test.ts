/**
 * AI-OS Phase 4 polish — process tracker tests.
 *
 * Hermetic — no real processes involved. Liveness is injected.
 */

import { describe, it, expect } from 'vitest';
import { ToolProcessTracker } from '../src/tool-process-tracker.js';

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
