/**
 * Scoring substrate tests — ported from hive-mind/packages/core/src/mind/scoring.test.ts.
 *
 * Memory Sync Repair Step 2. Source: hive-mind file at HEAD c363257.
 *
 * Verbatim port — only the import path is adjusted from `./scoring.js`
 * to `../../src/mind/scoring.js` to match waggle-os's `tests/mind/`
 * placement convention. SCORING_PROFILES + 4 compute helpers + the
 * computeRelevance combinator are byte-identical between the two
 * repos at this HEAD pair, so the suite exercises the same algebra
 * either way.
 */
import { describe, it, expect } from 'vitest';
import {
  SCORING_PROFILES,
  computeTemporalScore,
  computePopularityScore,
  computeContextualScore,
  computeImportanceScore,
  computeRelevance,
} from '../../src/mind/scoring.js';

describe('scoring (hive-mind port)', () => {
  describe('computeTemporalScore', () => {
    it('returns 1.0 for timestamps within the 7-day recency window', () => {
      const now = new Date();
      expect(computeTemporalScore(now.toISOString())).toBe(1.0);

      const fiveDaysAgo = new Date(now.getTime() - 5 * 86400_000);
      expect(computeTemporalScore(fiveDaysAgo.toISOString())).toBe(1.0);
    });

    it('decays exponentially past the recency window (half-life = 30 days)', () => {
      const now = Date.now();
      const thirtyDaysAgo = new Date(now - 30 * 86400_000);
      const score = computeTemporalScore(thirtyDaysAgo.toISOString());
      expect(score).toBeGreaterThan(0.48);
      expect(score).toBeLessThan(0.52);
    });

    it('approaches zero for very old timestamps', () => {
      const twoYearsAgo = new Date(Date.now() - 2 * 365 * 86400_000);
      expect(computeTemporalScore(twoYearsAgo.toISOString())).toBeLessThan(0.01);
    });
  });

  describe('computePopularityScore', () => {
    it('returns 1.0 for zero accesses (log10(1) = 0)', () => {
      expect(computePopularityScore(0)).toBe(1.0);
    });

    it('grows sub-linearly with access count', () => {
      const nine = computePopularityScore(9);
      const ninetyNine = computePopularityScore(99);
      expect(nine).toBeCloseTo(1.1, 5);
      expect(ninetyNine).toBeCloseTo(1.2, 5);
    });
  });

  describe('computeContextualScore', () => {
    it('returns 0 when no graph context is provided', () => {
      expect(computeContextualScore(42, undefined)).toBe(0);
    });

    it('returns 0 for frames missing from the distance map', () => {
      const distances = new Map<number, number>([[1, 0]]);
      expect(computeContextualScore(42, distances)).toBe(0);
    });

    it('decreases with graph distance in the documented steps', () => {
      const distances = new Map<number, number>([
        [1, 0],
        [2, 1],
        [3, 2],
        [4, 3],
        [5, 4],
      ]);
      expect(computeContextualScore(1, distances)).toBe(1.0);
      expect(computeContextualScore(2, distances)).toBe(0.7);
      expect(computeContextualScore(3, distances)).toBe(0.4);
      expect(computeContextualScore(4, distances)).toBe(0.2);
      expect(computeContextualScore(5, distances)).toBe(0);
    });
  });

  describe('computeImportanceScore', () => {
    it('maps each importance tier to the documented multiplier', () => {
      expect(computeImportanceScore('critical')).toBe(2.0);
      expect(computeImportanceScore('important')).toBe(1.5);
      expect(computeImportanceScore('normal')).toBe(1.0);
      expect(computeImportanceScore('temporary')).toBe(0.7);
      expect(computeImportanceScore('deprecated')).toBe(0.3);
    });
  });

  describe('computeRelevance', () => {
    it('combines the four feature scores by their weights', () => {
      const now = new Date().toISOString();
      const weights = SCORING_PROFILES.balanced;
      const score = computeRelevance(
        { id: 1, last_accessed: now, access_count: 0, importance: 'normal' },
        weights,
      );
      expect(score).toBeCloseTo(0.8, 5);
    });

    it('rewards higher importance under the `important` profile', () => {
      const now = new Date().toISOString();
      const balanced = computeRelevance(
        { id: 1, last_accessed: now, access_count: 0, importance: 'critical' },
        SCORING_PROFILES.balanced,
      );
      const important = computeRelevance(
        { id: 1, last_accessed: now, access_count: 0, importance: 'critical' },
        SCORING_PROFILES.important,
      );
      expect(important).toBeGreaterThan(balanced);
    });

    it('boosts graph-adjacent frames under the `connected` profile', () => {
      const oneYearAgo = new Date(Date.now() - 365 * 86400_000).toISOString();
      const distances = new Map<number, number>([[1, 0]]);
      const balanced = computeRelevance(
        { id: 1, last_accessed: oneYearAgo, access_count: 0, importance: 'normal' },
        SCORING_PROFILES.balanced,
        { graphDistances: distances },
      );
      const connected = computeRelevance(
        { id: 1, last_accessed: oneYearAgo, access_count: 0, importance: 'normal' },
        SCORING_PROFILES.connected,
        { graphDistances: distances },
      );
      expect(connected).toBeGreaterThan(balanced);
    });
  });
});
