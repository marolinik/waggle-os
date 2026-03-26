import { describe, it, expect } from 'vitest';
import { SearchCache, RateLimiter } from '../src/web-search-utils.js';

describe('SearchCache', () => {
  it('caches results with TTL', () => {
    const cache = new SearchCache(5000);
    cache.set('test query', 'result data');
    expect(cache.get('test query')).toBe('result data');
  });

  it('is case-insensitive', () => {
    const cache = new SearchCache(5000);
    cache.set('Test Query', 'result data');
    expect(cache.get('test query')).toBe('result data');
  });

  it('returns null for missing entries', () => {
    const cache = new SearchCache(5000);
    expect(cache.get('nonexistent')).toBeNull();
  });

  it('returns null for expired entries', async () => {
    const cache = new SearchCache(10); // 10ms TTL
    cache.set('test', 'data');
    await new Promise(r => setTimeout(r, 20));
    expect(cache.get('test')).toBeNull();
  });
});

describe('RateLimiter', () => {
  it('allows calls within limit', () => {
    const limiter = new RateLimiter(5, 1000);
    for (let i = 0; i < 5; i++) {
      expect(limiter.canProceed()).toBe(true);
    }
  });

  it('blocks calls over limit', () => {
    const limiter = new RateLimiter(2, 1000);
    limiter.canProceed();
    limiter.canProceed();
    expect(limiter.canProceed()).toBe(false);
  });

  it('allows calls again after window expires', async () => {
    const limiter = new RateLimiter(1, 20); // 20ms window
    expect(limiter.canProceed()).toBe(true);
    expect(limiter.canProceed()).toBe(false);
    await new Promise(r => setTimeout(r, 30));
    expect(limiter.canProceed()).toBe(true);
  });
});
