/**
 * surface-cache (Pillar 2.6) — the typed, keyed, session-scoped cache that backs
 * the Marketplace + Agents route-cache. The distinguishing contract vs. a plain
 * Map is `hasResolved`: "never fetched" and "fetched, genuinely empty" must be
 * separable so a return to an empty surface resolves without a skeleton flash.
 */
import { describe, it, expect } from 'vitest';
import { createSurfaceCache, surfaceCacheKey } from '@/lib/surface-cache';

describe('surface-cache', () => {
  it('read returns undefined before a write and the exact value after', () => {
    const cache = createSurfaceCache<number[]>();
    expect(cache.read('k')).toBeUndefined();
    const value = [1, 2, 3];
    cache.write('k', value);
    expect(cache.read('k')).toBe(value); // identity preserved (seeds React state directly)
  });

  it('hasResolved distinguishes never-fetched from fetched-then-empty', () => {
    const cache = createSurfaceCache<string[]>();
    // Never fetched → not resolved (a mount here must skeleton).
    expect(cache.hasResolved('k')).toBe(false);
    // Resolved to a genuinely-empty payload → resolved (a mount here must show
    // the empty-state, not a skeleton).
    cache.write('k', []);
    expect(cache.hasResolved('k')).toBe(true);
    expect(cache.read('k')).toEqual([]);
  });

  it('keys are independent — a write to one leaves the other untouched', () => {
    const cache = createSurfaceCache<number>();
    cache.write('a', 1);
    expect(cache.read('a')).toBe(1);
    expect(cache.read('b')).toBeUndefined();
    expect(cache.hasResolved('b')).toBe(false);
  });

  it('resetForTests drops both the values and the resolved marks', () => {
    const cache = createSurfaceCache<number[]>();
    cache.write('k', [9]);
    cache.resetForTests();
    expect(cache.read('k')).toBeUndefined();
    expect(cache.hasResolved('k')).toBe(false);
  });

  it('separate instances do not share state (one cache per surface)', () => {
    const a = createSurfaceCache<number>();
    const b = createSurfaceCache<number>();
    a.write('k', 1);
    expect(b.read('k')).toBeUndefined();
  });
});

describe('surfaceCacheKey', () => {
  it('joins parts stably and maps undefined to an empty segment', () => {
    expect(surfaceCacheKey(['skill', ''])).toBe('skill|');
    expect(surfaceCacheKey(['skill', undefined])).toBe('skill|');
    expect(surfaceCacheKey(['all', 'note', 3, true])).toBe('all|note|3|true');
  });

  it('distinct dimension tuples produce distinct keys', () => {
    expect(surfaceCacheKey(['skill', 'q'])).not.toBe(surfaceCacheKey(['connector', 'q']));
    expect(surfaceCacheKey(['all', ''])).not.toBe(surfaceCacheKey(['all', 'q']));
  });
});
