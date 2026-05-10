import { describe, expect, it, vi } from 'vitest';
import { computeBackoff, withRetry } from '../src/retry-bridge.js';

describe('computeBackoff', () => {
  it('exponentially increases with attempt count', () => {
    const fixedRandom = (): number => 0.5; // jitter = 0
    expect(computeBackoff(0, 100, 5000, 0, fixedRandom)).toBe(100);
    expect(computeBackoff(1, 100, 5000, 0, fixedRandom)).toBe(200);
    expect(computeBackoff(2, 100, 5000, 0, fixedRandom)).toBe(400);
    expect(computeBackoff(3, 100, 5000, 0, fixedRandom)).toBe(800);
  });

  it('is clamped to maxBackoffMs', () => {
    const fixedRandom = (): number => 0.5;
    expect(computeBackoff(20, 100, 1000, 0, fixedRandom)).toBe(1000);
  });

  it('jitter is bounded by jitterFactor on either side', () => {
    // random=0 -> -1 multiplier; random=1 -> +1 multiplier
    const lower = computeBackoff(2, 100, 5000, 0.25, () => 0);
    const upper = computeBackoff(2, 100, 5000, 0.25, () => 0.999999);
    expect(lower).toBeGreaterThanOrEqual(Math.round(400 * 0.75));
    expect(upper).toBeLessThanOrEqual(Math.round(400 * 1.25) + 1);
  });

  it('returns >= 0', () => {
    expect(computeBackoff(0, 100, 5000, 5.0, () => 0)).toBeGreaterThanOrEqual(0);
  });
});

describe('withRetry', () => {
  it('returns the value on first-attempt success', async () => {
    const fn = vi.fn(async () => 42);
    const result = await withRetry(fn, { maxRetries: 3, delay: async () => undefined });
    expect(result).toBe(42);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries until success', async () => {
    let calls = 0;
    const fn = vi.fn(async () => {
      calls += 1;
      if (calls < 3) throw new Error('flaky');
      return 'ok';
    });
    const result = await withRetry(fn, {
      maxRetries: 5,
      delay: async () => undefined,
      random: () => 0.5,
    });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('throws the last error after exhausting retries', async () => {
    const fn = vi.fn(async () => { throw new Error('persistent'); });
    await expect(withRetry(fn, { maxRetries: 2, delay: async () => undefined })).rejects.toThrow('persistent');
    expect(fn).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });

  it('per-attempt timeout fires when fn never resolves', async () => {
    const fn = vi.fn(() => new Promise<never>(() => { /* hang */ }));
    await expect(withRetry(fn, {
      maxRetries: 1,
      timeoutMs: 20,
      delay: async () => undefined,
    })).rejects.toThrow(/timed out/);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('passes the configured delay through (test hook)', async () => {
    const delays: number[] = [];
    const fn = vi.fn(async () => { throw new Error('x'); });
    await expect(withRetry(fn, {
      maxRetries: 2,
      baseBackoffMs: 100,
      jitterFactor: 0,
      delay: async (ms) => { delays.push(ms); },
      random: () => 0.5,
    })).rejects.toThrow();
    expect(delays).toEqual([100, 200]);
  });

  it('wraps non-Error rejections', async () => {
    const fn = vi.fn(async () => { throw 'plain string'; });
    await expect(withRetry(fn, {
      maxRetries: 0,
      delay: async () => undefined,
    })).rejects.toThrow('plain string');
  });
});
