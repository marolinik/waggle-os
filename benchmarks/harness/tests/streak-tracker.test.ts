/**
 * Task 2.5 Stage 1.5 §7.2 — StreakTracker tests.
 *
 * Verifies the consecutive-fetch-transport-failure counter, reset semantics,
 * and observability surface (getRecentWindow, summary).
 */

import { describe, expect, it } from 'vitest';
import { StreakTracker, isFetchTransportFailure } from '../src/streak-tracker.js';

describe('isFetchTransportFailure', () => {
  it('matches fetch_error_* patterns', () => {
    expect(isFetchTransportFailure('fetch_error_TypeError')).toBe(true);
    expect(isFetchTransportFailure('fetch_error_RangeError')).toBe(true);
    expect(isFetchTransportFailure('fetch_error_SyntaxError')).toBe(true);
  });

  it('does NOT match non-fetch patterns', () => {
    expect(isFetchTransportFailure(null)).toBe(false);
    expect(isFetchTransportFailure(undefined)).toBe(false);
    expect(isFetchTransportFailure('timeout')).toBe(false);
    expect(isFetchTransportFailure('http_500')).toBe(false);
    expect(isFetchTransportFailure('http_404')).toBe(false);
    expect(isFetchTransportFailure('')).toBe(false);
    expect(isFetchTransportFailure('FETCH_ERROR_TypeError')).toBe(false); // case-sensitive
  });
});

describe('StreakTracker — halt trigger', () => {
  it('does not halt on 4 consecutive fetch_error_TypeError', () => {
    const t = new StreakTracker();
    for (let i = 0; i < 4; i++) {
      expect(t.record('fetch_error_TypeError')).toBe(false);
    }
    expect(t.getConsecutiveFailures()).toBe(4);
  });

  it('halts on the 5th consecutive fetch_error_TypeError', () => {
    const t = new StreakTracker();
    for (let i = 0; i < 4; i++) t.record('fetch_error_TypeError');
    expect(t.record('fetch_error_TypeError')).toBe(true);
    expect(t.getConsecutiveFailures()).toBe(5);
  });

  it('resets counter on a successful call (null failureMode)', () => {
    const t = new StreakTracker();
    for (let i = 0; i < 4; i++) t.record('fetch_error_TypeError');
    t.record(null);
    expect(t.getConsecutiveFailures()).toBe(0);
    for (let i = 0; i < 4; i++) {
      expect(t.record('fetch_error_TypeError')).toBe(false);
    }
  });

  it('resets counter on timeout (AbortError)', () => {
    const t = new StreakTracker();
    t.record('fetch_error_TypeError');
    t.record('fetch_error_TypeError');
    t.record('timeout');
    expect(t.getConsecutiveFailures()).toBe(0);
  });

  it('resets counter on http_5xx', () => {
    const t = new StreakTracker();
    t.record('fetch_error_TypeError');
    t.record('fetch_error_TypeError');
    t.record('http_502');
    expect(t.getConsecutiveFailures()).toBe(0);
  });

  it('mixes fetch_error_* subtypes and counts them all', () => {
    const t = new StreakTracker();
    t.record('fetch_error_TypeError');
    t.record('fetch_error_RangeError');
    t.record('fetch_error_TypeError');
    t.record('fetch_error_SyntaxError');
    expect(t.record('fetch_error_TypeError')).toBe(true); // 5th consecutive
  });
});

describe('StreakTracker — configuration', () => {
  it('honours a custom threshold', () => {
    const t = new StreakTracker({ threshold: 3 });
    t.record('fetch_error_TypeError');
    t.record('fetch_error_TypeError');
    expect(t.record('fetch_error_TypeError')).toBe(true);
  });

  it('clamps threshold to minimum of 1', () => {
    const t = new StreakTracker({ threshold: 0 });
    expect(t.record('fetch_error_TypeError')).toBe(true); // threshold clamped to 1
  });

  it('honours a custom window size', () => {
    const t = new StreakTracker({ windowSize: 3 });
    t.record('fetch_error_TypeError');
    t.record(null);
    t.record('fetch_error_TypeError');
    t.record(null); // oldest entry slides out
    const w = t.getRecentWindow();
    expect(w).toHaveLength(3);
  });
});

describe('StreakTracker — observability', () => {
  it('getRecentWindow returns snapshot of last N outcomes', () => {
    const t = new StreakTracker({ windowSize: 5 });
    t.record('fetch_error_TypeError');
    t.record(null);
    t.record('fetch_error_TypeError');
    t.record('timeout');
    t.record('fetch_error_TypeError');
    expect(t.getRecentWindow()).toEqual([true, false, true, false, true]);
  });

  it('caps window at windowSize', () => {
    const t = new StreakTracker({ windowSize: 3 });
    for (let i = 0; i < 7; i++) {
      t.record(i % 2 === 0 ? 'fetch_error_TypeError' : null);
    }
    expect(t.getRecentWindow()).toHaveLength(3);
  });

  it('summary() returns a human-readable status line', () => {
    const t = new StreakTracker({ threshold: 5, windowSize: 5 });
    t.record('fetch_error_TypeError');
    t.record('fetch_error_TypeError');
    t.record(null);
    const s = t.summary();
    expect(s).toContain('consecutive=0');
    expect(s).toContain('threshold=5');
    expect(s).toContain('[XX.]');
  });
});

describe('StreakTracker — reset', () => {
  it('reset clears both counter and window', () => {
    const t = new StreakTracker();
    t.record('fetch_error_TypeError');
    t.record('fetch_error_TypeError');
    t.reset();
    expect(t.getConsecutiveFailures()).toBe(0);
    expect(t.getRecentWindow()).toEqual([]);
  });
});
