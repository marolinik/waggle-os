import { describe, it, expect } from 'vitest';
import { LoopGuard } from '../src/loop-guard.js';

describe('LoopGuard', () => {
  it('allows unique tool calls', () => {
    const guard = new LoopGuard({ maxRepeats: 3 });
    expect(guard.check('bash', { command: 'echo 1' })).toBe(true);
    expect(guard.check('bash', { command: 'echo 2' })).toBe(true);
    expect(guard.check('read_file', { path: 'foo.ts' })).toBe(true);
  });

  it('detects repeated identical tool calls', () => {
    const guard = new LoopGuard({ maxRepeats: 3 });
    expect(guard.check('bash', { command: 'echo 1' })).toBe(true);
    expect(guard.check('bash', { command: 'echo 1' })).toBe(true);
    expect(guard.check('bash', { command: 'echo 1' })).toBe(true);
    // 4th identical call — blocked
    expect(guard.check('bash', { command: 'echo 1' })).toBe(false);
  });

  it('resets on different call', () => {
    const guard = new LoopGuard({ maxRepeats: 2 });
    expect(guard.check('bash', { command: 'echo 1' })).toBe(true);
    expect(guard.check('bash', { command: 'echo 1' })).toBe(true);
    // Different call resets streak
    expect(guard.check('bash', { command: 'echo 2' })).toBe(true);
    expect(guard.check('bash', { command: 'echo 1' })).toBe(true);
  });

  it('tracks consecutive repeats, not total', () => {
    const guard = new LoopGuard({ maxRepeats: 2 });
    guard.check('bash', { command: 'echo 1' });
    guard.check('read_file', { path: 'a.ts' }); // break streak
    guard.check('bash', { command: 'echo 1' });
    guard.check('bash', { command: 'echo 1' });
    expect(guard.check('bash', { command: 'echo 1' })).toBe(false);
  });
});

describe('LoopGuard graduated tiers (steal #9)', () => {
  const args = { command: 'echo 1' };

  function recordFailures(guard: LoopGuard, tool: string, n: number, mkArgs: (i: number) => Record<string, unknown>) {
    for (let i = 0; i < n; i++) guard.record(tool, mkArgs(i), false);
  }

  it('allows when there is no failure history', () => {
    const guard = new LoopGuard();
    expect(guard.checkTiered('bash', args)).toEqual({ action: 'allow' });
  });

  it('T3 aborts at exactly 8 same-tool consecutive failures', () => {
    const guard = new LoopGuard();
    recordFailures(guard, 'bash', 7, (i) => ({ command: `c${i}` }));
    expect(guard.checkTiered('bash', { command: 'c7' }).action).not.toBe('abort');
    guard.record('bash', { command: 'c7' }, false); // 8th failure
    const v = guard.checkTiered('bash', { command: 'c8' });
    expect(v.action).toBe('abort');
    if (v.action === 'abort') expect(v.tier).toBe('T3');
  });

  it('T3 wins over T4 when the streak crosses both thresholds', () => {
    const guard = new LoopGuard();
    recordFailures(guard, 'bash', 8, (i) => ({ command: `c${i}` }));
    // 8 same-tool failures satisfies both T4 (>=6) and T3 (>=8) — T3 first.
    const v = guard.checkTiered('bash', args);
    expect(v.action).toBe('abort');
  });

  it('T1 blocks at exactly 5 identical calls (any outcome)', () => {
    const guard = new LoopGuard();
    for (let i = 0; i < 4; i++) guard.record('bash', args, true); // successes, identical
    expect(guard.checkTiered('bash', args).action).toBe('allow');
    guard.record('bash', args, true); // 5th identical
    const v = guard.checkTiered('bash', args);
    expect(v.action).toBe('block');
    if (v.action === 'block') expect(v.tier).toBe('T1');
  });

  it('T2 blocks at exactly 3 identical consecutive failures', () => {
    const guard = new LoopGuard();
    guard.record('bash', args, false);
    guard.record('bash', args, false);
    expect(guard.checkTiered('bash', args).action).toBe('allow');
    guard.record('bash', args, false); // 3rd identical failure
    const v = guard.checkTiered('bash', args);
    expect(v.action).toBe('block');
    if (v.action === 'block') expect(v.tier).toBe('T2');
  });

  it('T4 blocks at 6 same-tool failures with varying args', () => {
    const guard = new LoopGuard();
    recordFailures(guard, 'bash', 6, (i) => ({ command: `c${i}` }));
    const v = guard.checkTiered('bash', { command: 'c6' });
    expect(v.action).toBe('block');
    if (v.action === 'block') expect(v.tier).toBe('T4');
  });

  it('a success resets the T2 identical-failure streak', () => {
    const guard = new LoopGuard();
    guard.record('bash', args, false);
    guard.record('bash', args, false);
    guard.record('bash', args, true); // success breaks the streak
    guard.record('bash', args, false);
    expect(guard.checkTiered('bash', args).action).toBe('allow');
  });

  it('a success resets the T4 same-tool-failure streak', () => {
    const guard = new LoopGuard();
    recordFailures(guard, 'bash', 5, (i) => ({ command: `c${i}` }));
    guard.record('bash', { command: 'ok' }, true); // success breaks the streak
    recordFailures(guard, 'bash', 2, (i) => ({ command: `d${i}` }));
    expect(guard.checkTiered('bash', { command: 'd2' }).action).toBe('allow');
  });

  it('switching tools resets the T1 identical-call streak', () => {
    const guard = new LoopGuard();
    for (let i = 0; i < 5; i++) guard.record('bash', args, true);
    // Same args but a different tool — the tail entry differs, streak resets.
    expect(guard.checkTiered('read_file', args).action).toBe('allow');
  });

  it('switching tools resets the T3/T4 same-tool-failure streak', () => {
    const guard = new LoopGuard();
    recordFailures(guard, 'bash', 8, (i) => ({ command: `c${i}` }));
    expect(guard.checkTiered('read_file', { path: 'a.ts' }).action).toBe('allow');
  });

  it('caps the outcome history at 50 records', () => {
    const guard = new LoopGuard();
    for (let i = 0; i < 60; i++) guard.record('bash', { command: `c${i}` }, false);
    expect(guard.historySize).toBe(50);
  });

  it('reset() clears the tiered history', () => {
    const guard = new LoopGuard();
    recordFailures(guard, 'bash', 8, (i) => ({ command: `c${i}` }));
    guard.reset();
    expect(guard.historySize).toBe(0);
    expect(guard.checkTiered('bash', args).action).toBe('allow');
  });
});
