/**
 * Lane H item 1 — disk-persisted cache-first Home payload.
 *
 * Pins the persistence discipline: versioned key, schema-guarded parse (a
 * malformed / partial / stale-version / first-run blob is a MISS, never a
 * half-rendered hero), and the size cap.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  readHomeCache,
  writeHomeCache,
  homeCacheExists,
  clearHomeCache,
} from '@/lib/home-cache';
import type { HomeBriefing } from '@/lib/types';

const CACHE_KEY = 'waggle:home-cache:v1';

function briefing(over: Partial<HomeBriefing> = {}): HomeBriefing {
  return {
    greeting: 'Welcome back, Marko',
    date: '2026-07-07T08:00:00.000Z',
    recentWorkspaces: [
      { id: 'w1', name: 'Alpha', group: 'Personal', lastActive: '2026-07-06T09:00:00.000Z', pendingCount: 0 },
    ],
    suggestedActions: [],
    upNext: [],
    isFirstRun: false,
    ...over,
  };
}

beforeEach(() => {
  clearHomeCache();
  window.localStorage.clear();
});

describe('home-cache (Lane H item 1)', () => {
  it('round-trips a written payload', () => {
    writeHomeCache({
      briefing: briefing(),
      overnight: null,
      highlights: [{ content: 'We decided to ship on Friday.', timestamp: '2026-07-06T09:00:00.000Z' }],
    });
    const got = readHomeCache();
    expect(got).not.toBeNull();
    expect(got!.briefing.greeting).toBe('Welcome back, Marko');
    expect(got!.highlights).toHaveLength(1);
    expect(got!.overnight).toBeNull();
    expect(typeof got!.savedAt).toBe('number');
    expect(homeCacheExists()).toBe(true);
  });

  it('returns null when nothing is cached', () => {
    expect(readHomeCache()).toBeNull();
    expect(homeCacheExists()).toBe(false);
  });

  it('NEVER caches a first-run payload (day-0 keeps the skeleton path)', () => {
    writeHomeCache({ briefing: briefing({ isFirstRun: true }), overnight: null, highlights: [] });
    expect(readHomeCache()).toBeNull();
  });

  it('rejects a stale cache version', () => {
    window.localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ version: 999, savedAt: Date.now(), briefing: briefing(), overnight: null, highlights: [] }),
    );
    expect(readHomeCache()).toBeNull();
  });

  it('rejects a malformed blob (not JSON)', () => {
    window.localStorage.setItem(CACHE_KEY, '{ not json');
    expect(readHomeCache()).toBeNull();
  });

  it('rejects a structurally-invalid briefing (missing required field)', () => {
    window.localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({
        version: 1,
        savedAt: Date.now(),
        briefing: { greeting: 'hi' }, // no date/recentWorkspaces/... → guard fails
        overnight: null,
        highlights: [],
      }),
    );
    expect(readHomeCache()).toBeNull();
  });

  it('drops an over-cap payload rather than storing a quota-buster', () => {
    const huge = 'x'.repeat(200_000);
    writeHomeCache({
      briefing: briefing(),
      overnight: null,
      highlights: [{ content: huge, timestamp: '2026-07-06T09:00:00.000Z' }],
    });
    expect(readHomeCache()).toBeNull(); // never stored
  });

  it('clearHomeCache removes the cached payload', () => {
    writeHomeCache({ briefing: briefing(), overnight: null, highlights: [] });
    expect(homeCacheExists()).toBe(true);
    clearHomeCache();
    expect(readHomeCache()).toBeNull();
  });
});
