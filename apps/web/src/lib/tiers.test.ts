/**
 * Trial countdown + tier resolution tests for @waggle/shared/tiers.
 *
 * Tests the helpers that drive: StatusBar countdown badge (Desktop.tsx:413),
 * TrialExpiredModal trigger (Desktop.tsx:137), and server tier resolution
 * (settings.ts:315 + assert-tier.ts:28).
 *
 * Infrastructure was discovered fully wired during 0507_s2:
 *   - tiers.ts:191 isTrialExpired      — test
 *   - tiers.ts:201 getEffectiveTier    — test
 *   - tiers.ts:207 trialDaysRemaining  — test
 *   - tiers.ts:198 TRIAL_DURATION_DAYS — pin to 15
 *
 * These guard against future drift (e.g. someone bumping TRIAL_DURATION_DAYS
 * without intent, or breaking TRIAL→FREE downgrade).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isTrialExpired,
  getEffectiveTier,
  trialDaysRemaining,
  TRIAL_DURATION_DAYS,
} from '@waggle/shared';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
// Fixed reference time so we don't rely on Date.now() drift mid-test
const NOW_ISO = '2026-05-07T16:00:00.000Z';
const NOW_MS = new Date(NOW_ISO).getTime();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW_ISO));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('TRIAL_DURATION_DAYS', () => {
  it('is exactly 15 days (pricing canon — packages/shared/src/tiers.ts:23)', () => {
    expect(TRIAL_DURATION_DAYS).toBe(15);
  });
});

describe('isTrialExpired', () => {
  it('returns true for null / undefined / empty input', () => {
    expect(isTrialExpired(null)).toBe(true);
    expect(isTrialExpired(undefined)).toBe(true);
    expect(isTrialExpired('')).toBe(true);
  });

  it('returns true for unparseable timestamps', () => {
    expect(isTrialExpired('not-a-date')).toBe(true);
    expect(isTrialExpired('2026-13-99')).toBe(true);
  });

  it('returns false for trial that started today', () => {
    expect(isTrialExpired(NOW_ISO)).toBe(false);
  });

  it('returns false at day 14 (still within 15-day window)', () => {
    const fourteenDaysAgo = new Date(NOW_MS - 14 * ONE_DAY_MS).toISOString();
    expect(isTrialExpired(fourteenDaysAgo)).toBe(false);
  });

  it('returns false at day 15 boundary (still within window)', () => {
    // Exactly 15 days: elapsed === 15*ONE_DAY, which is NOT > 15*ONE_DAY → false
    const fifteenDaysAgo = new Date(NOW_MS - 15 * ONE_DAY_MS).toISOString();
    expect(isTrialExpired(fifteenDaysAgo)).toBe(false);
  });

  it('returns true at day 15 + 1ms (just over the boundary)', () => {
    const justOver = new Date(NOW_MS - (15 * ONE_DAY_MS + 1)).toISOString();
    expect(isTrialExpired(justOver)).toBe(true);
  });

  it('returns true after 30 days', () => {
    const thirtyDaysAgo = new Date(NOW_MS - 30 * ONE_DAY_MS).toISOString();
    expect(isTrialExpired(thirtyDaysAgo)).toBe(true);
  });
});

describe('getEffectiveTier', () => {
  it('passes FREE through unchanged regardless of trialStartedAt', () => {
    expect(getEffectiveTier('FREE', null)).toBe('FREE');
    expect(getEffectiveTier('FREE', NOW_ISO)).toBe('FREE');
  });

  it('passes PRO through unchanged regardless of trialStartedAt', () => {
    expect(getEffectiveTier('PRO', null)).toBe('PRO');
    const longAgo = new Date(NOW_MS - 100 * ONE_DAY_MS).toISOString();
    expect(getEffectiveTier('PRO', longAgo)).toBe('PRO');
  });

  it('passes TEAMS through unchanged', () => {
    expect(getEffectiveTier('TEAMS', null)).toBe('TEAMS');
  });

  it('passes ENTERPRISE through unchanged', () => {
    expect(getEffectiveTier('ENTERPRISE', null)).toBe('ENTERPRISE');
  });

  it('keeps TRIAL active when started today', () => {
    expect(getEffectiveTier('TRIAL', NOW_ISO)).toBe('TRIAL');
  });

  it('keeps TRIAL active at day 14 (still within window)', () => {
    const fourteenDaysAgo = new Date(NOW_MS - 14 * ONE_DAY_MS).toISOString();
    expect(getEffectiveTier('TRIAL', fourteenDaysAgo)).toBe('TRIAL');
  });

  it('downgrades TRIAL → FREE when expired', () => {
    const sixteenDaysAgo = new Date(NOW_MS - 16 * ONE_DAY_MS).toISOString();
    expect(getEffectiveTier('TRIAL', sixteenDaysAgo)).toBe('FREE');
  });

  it('downgrades TRIAL → FREE when trialStartedAt is null (never started but stuck on TRIAL)', () => {
    expect(getEffectiveTier('TRIAL', null)).toBe('FREE');
  });

  it('downgrades TRIAL → FREE when trialStartedAt is undefined', () => {
    expect(getEffectiveTier('TRIAL', undefined)).toBe('FREE');
  });
});

describe('trialDaysRemaining', () => {
  it('returns 0 for null / undefined input', () => {
    expect(trialDaysRemaining(null)).toBe(0);
    expect(trialDaysRemaining(undefined)).toBe(0);
  });

  it('returns 0 for unparseable timestamps', () => {
    expect(trialDaysRemaining('not-a-date')).toBe(0);
  });

  it('returns 15 for trial that started today (day 0)', () => {
    // 15 - 0 = 15. Math.ceil(15) = 15.
    expect(trialDaysRemaining(NOW_ISO)).toBe(15);
  });

  it('returns 14 for trial that started 1 day ago (using ceil)', () => {
    // elapsed = 1 day → remaining = 15 - 1 = 14 → ceil(14) = 14
    const oneDayAgo = new Date(NOW_MS - ONE_DAY_MS).toISOString();
    expect(trialDaysRemaining(oneDayAgo)).toBe(14);
  });

  it('returns 1 at day 14 (final day showing as "1d left")', () => {
    // elapsed = 14 days → remaining = 1.0 → ceil(1) = 1
    const fourteenDaysAgo = new Date(NOW_MS - 14 * ONE_DAY_MS).toISOString();
    expect(trialDaysRemaining(fourteenDaysAgo)).toBe(1);
  });

  it('returns 0 once expired', () => {
    const sixteenDaysAgo = new Date(NOW_MS - 16 * ONE_DAY_MS).toISOString();
    expect(trialDaysRemaining(sixteenDaysAgo)).toBe(0);
  });

  it('returns 0 (not negative) for arbitrarily-old trials', () => {
    const longAgo = new Date(NOW_MS - 365 * ONE_DAY_MS).toISOString();
    expect(trialDaysRemaining(longAgo)).toBe(0);
  });

  it('rounds UP via Math.ceil (mid-day reads as the higher number — friendlier UX)', () => {
    // 12.5 hours into trial → elapsed = 0.52 days → remaining = 14.48 → ceil = 15
    const halfDayAgo = new Date(NOW_MS - 12.5 * 60 * 60 * 1000).toISOString();
    expect(trialDaysRemaining(halfDayAgo)).toBe(15);
  });
});

describe('integration — StatusBar badge color thresholds (UX contract)', () => {
  it('day 4 trial → countdown shows in primary (>3 days, "still safe" feel)', () => {
    // StatusBar.tsx:88 — trialDays > 3 ? primary : destructive
    const elevenDaysAgo = new Date(NOW_MS - 11 * ONE_DAY_MS).toISOString();
    const days = trialDaysRemaining(elevenDaysAgo);
    expect(days).toBe(4);
    expect(days > 3).toBe(true); // primary color path
  });

  it('day 3 trial → countdown shows in destructive ("act soon" red)', () => {
    const twelveDaysAgo = new Date(NOW_MS - 12 * ONE_DAY_MS).toISOString();
    const days = trialDaysRemaining(twelveDaysAgo);
    expect(days).toBe(3);
    expect(days <= 3).toBe(true); // destructive color path
  });

  it('day 1 trial → countdown shows in destructive (final day urgency)', () => {
    const fourteenDaysAgo = new Date(NOW_MS - 14 * ONE_DAY_MS).toISOString();
    const days = trialDaysRemaining(fourteenDaysAgo);
    expect(days).toBe(1);
    expect(days <= 3).toBe(true);
  });

  it('expired trial → countdown badge hidden (days === 0), expired badge shown instead', () => {
    // StatusBar.tsx:87 — `trialDays > 0` gates the countdown badge
    const sixteenDaysAgo = new Date(NOW_MS - 16 * ONE_DAY_MS).toISOString();
    expect(trialDaysRemaining(sixteenDaysAgo)).toBe(0);
    expect(isTrialExpired(sixteenDaysAgo)).toBe(true);
  });
});
