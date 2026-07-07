/**
 * Lane H item 4 — away-days computation for the "double catch-up collapse".
 *
 * The full "Catching you up" modal fires only on a ≥7-day absence; the everyday
 * catch-up is the home hero recall strip. computeAwayDays derives the absence
 * from the SAME workspace lastActive stream the hero greeting reads, and returns
 * 0 for a no-activity account so a brand-new user never trips the modal.
 */
import { describe, it, expect } from 'vitest';
import { computeAwayDays, BRIEFING_ABSENCE_DAYS } from '@/lib/briefing-source';

const NOW = Date.parse('2026-07-07T12:00:00.000Z');
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString();

describe('computeAwayDays (Lane H item 4)', () => {
  it('is 0 for a no-activity / empty account (modal never trips)', () => {
    expect(computeAwayDays([], NOW)).toBe(0);
    expect(computeAwayDays([{ lastActive: '' }, {}], NOW)).toBe(0);
  });

  it('uses the MOST-RECENT workspace lastActive, not the oldest', () => {
    const away = computeAwayDays(
      [{ lastActive: daysAgo(30) }, { lastActive: daysAgo(2) }, { lastActive: daysAgo(15) }],
      NOW,
    );
    expect(Math.round(away)).toBe(2);
  });

  it('a recent user (<7d) is below the modal threshold', () => {
    expect(computeAwayDays([{ lastActive: daysAgo(3) }], NOW)).toBeLessThan(BRIEFING_ABSENCE_DAYS);
  });

  it('a long-absent user (≥7d) is at/above the modal threshold', () => {
    expect(computeAwayDays([{ lastActive: daysAgo(10) }], NOW)).toBeGreaterThanOrEqual(BRIEFING_ABSENCE_DAYS);
  });

  it('ignores unparseable timestamps', () => {
    expect(computeAwayDays([{ lastActive: 'not-a-date' }], NOW)).toBe(0);
  });

  it('clamps a future timestamp to 0 (never negative away days)', () => {
    expect(computeAwayDays([{ lastActive: daysAgo(-5) }], NOW)).toBe(0);
  });

  it('N=7 is the founder-decided absence threshold', () => {
    expect(BRIEFING_ABSENCE_DAYS).toBe(7);
  });
});
