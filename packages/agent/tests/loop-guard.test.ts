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
