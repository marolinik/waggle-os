import { describe, it, expect } from 'vitest';
import { LoopGuard } from '../src/loop-guard.js';

describe('LoopGuard Rolling Window Detection (11B-7)', () => {
  it('detects A/B oscillation pattern after 8 calls (4 of each)', () => {
    // windowSize=10, windowThreshold=4 (defaults)
    const guard = new LoopGuard({ maxRepeats: 10 }); // high maxRepeats so consecutive check doesn't trigger

    const argA = { command: 'echo A' };
    const argB = { command: 'echo B' };

    // A, B, A, B, A, B — 3 of each, still allowed
    expect(guard.check('bash', argA)).toBe(true); // window: [A]
    expect(guard.check('bash', argB)).toBe(true); // window: [A, B]
    expect(guard.check('bash', argA)).toBe(true); // window: [A, B, A]
    expect(guard.check('bash', argB)).toBe(true); // window: [A, B, A, B]
    expect(guard.check('bash', argA)).toBe(true); // window: [A, B, A, B, A] — A=3
    expect(guard.check('bash', argB)).toBe(true); // window: [A, B, A, B, A, B] — B=3

    // 7th call: A again — A count = 4 in window => blocked
    expect(guard.check('bash', argA)).toBe(false);
  });

  it('alternating A, B, A, B, A, B, A, B — detects loop after 8th call', () => {
    const guard = new LoopGuard({ maxRepeats: 10, windowSize: 10, windowThreshold: 4 });

    const results: boolean[] = [];
    for (let i = 0; i < 8; i++) {
      const args = i % 2 === 0 ? { cmd: 'A' } : { cmd: 'B' };
      results.push(guard.check('tool', args));
    }

    // First 6 should be true (3 of each), 7th triggers A=4
    // Call 1: A(1) -> true
    // Call 2: B(1) -> true
    // Call 3: A(2) -> true
    // Call 4: B(2) -> true
    // Call 5: A(3) -> true
    // Call 6: B(3) -> true
    // Call 7: A(4) -> false (4 A's in window)
    // Call 8: B(4) -> would also be false but we already stopped at 7

    // The 7th call (index 6) should be false
    expect(results.slice(0, 6).every(r => r)).toBe(true);
    expect(results[6]).toBe(false);
  });

  it('does not false-positive with diverse calls in the window', () => {
    const guard = new LoopGuard({ maxRepeats: 10, windowSize: 10, windowThreshold: 4 });

    // 10 different calls
    for (let i = 0; i < 10; i++) {
      expect(guard.check('tool', { idx: i })).toBe(true);
    }
  });

  it('window slides — old entries drop out', () => {
    const guard = new LoopGuard({ maxRepeats: 10, windowSize: 5, windowThreshold: 3 });

    // Fill window: A, A, B, C, D — A count is 2
    expect(guard.check('t', { v: 'A' })).toBe(true);
    expect(guard.check('t', { v: 'A' })).toBe(true);
    expect(guard.check('t', { v: 'B' })).toBe(true);
    expect(guard.check('t', { v: 'C' })).toBe(true);
    expect(guard.check('t', { v: 'D' })).toBe(true);

    // Window is now [A, A, B, C, D] — if we add A, window becomes [A, B, C, D, A]
    // A count = 2 (within threshold of 3)
    expect(guard.check('t', { v: 'A' })).toBe(true);

    // Now add E to push out old A: window [B, C, D, A, E]
    expect(guard.check('t', { v: 'E' })).toBe(true);

    // Add A again: window [C, D, A, E, A] — A count = 2
    expect(guard.check('t', { v: 'A' })).toBe(true);
  });

  it('respects custom windowSize and windowThreshold', () => {
    const guard = new LoopGuard({ maxRepeats: 10, windowSize: 4, windowThreshold: 2 });

    // With threshold=2 in window of 4:
    expect(guard.check('t', { v: 'X' })).toBe(true);  // window: [X], count=1
    expect(guard.check('t', { v: 'Y' })).toBe(true);  // window: [X, Y]
    expect(guard.check('t', { v: 'X' })).toBe(false);  // window: [X, Y, X], X count=2 => blocked
  });

  it('reset clears window state', () => {
    const guard = new LoopGuard({ maxRepeats: 10, windowSize: 5, windowThreshold: 3 });

    // Build up some history
    guard.check('t', { v: 'A' });
    guard.check('t', { v: 'A' });

    guard.reset();

    // After reset, A count should be fresh
    expect(guard.check('t', { v: 'A' })).toBe(true); // A=1 in fresh window
    expect(guard.check('t', { v: 'A' })).toBe(true); // A=2
  });

  it('consecutive detection still works alongside window detection', () => {
    const guard = new LoopGuard({ maxRepeats: 3 }); // consecutive limit

    // 3 consecutive identical calls — the 4th is blocked by consecutive check
    expect(guard.check('bash', { cmd: 'x' })).toBe(true);
    expect(guard.check('bash', { cmd: 'x' })).toBe(true);
    expect(guard.check('bash', { cmd: 'x' })).toBe(true);
    expect(guard.check('bash', { cmd: 'x' })).toBe(false); // consecutive > 3
  });

  it('three-way oscillation A, B, C detected when threshold met', () => {
    const guard = new LoopGuard({ maxRepeats: 20, windowSize: 12, windowThreshold: 4 });

    // A, B, C, A, B, C, A, B, C — 3 of each, still fine
    for (let cycle = 0; cycle < 3; cycle++) {
      expect(guard.check('t', { v: 'A' })).toBe(true);
      expect(guard.check('t', { v: 'B' })).toBe(true);
      expect(guard.check('t', { v: 'C' })).toBe(true);
    }
    // 10th call: A — A count becomes 4 in window => blocked
    expect(guard.check('t', { v: 'A' })).toBe(false);
  });
});
