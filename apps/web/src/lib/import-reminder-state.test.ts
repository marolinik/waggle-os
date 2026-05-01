/**
 * Phase 1 #7 — import-reminder-state unit tests.
 *
 * Pins the eligibility ladder and the 7-day re-show cadence so the banner
 * doesn't accidentally start spamming users on a future refactor. localStorage
 * helpers are exercised separately so the gate logic remains pure.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  shouldShowImportReminder,
  readDismissedAt,
  writeDismissedAt,
  readRetired,
  writeRetired,
  IMPORT_REMINDER_DISMISSED_KEY,
  IMPORT_REMINDER_RETIRED_KEY,
  DEFAULT_RESHOW_WINDOW_MS,
} from './import-reminder-state';

const NOW = Date.parse('2026-05-01T00:00:00Z');

describe('shouldShowImportReminder', () => {
  it('suppresses when onboarding incomplete (wizard owns this surface)', () => {
    expect(
      shouldShowImportReminder({
        onboardingCompleted: false,
        harvestEventCount: 0,
        permanentlyRetired: false,
        lastDismissedIso: null,
        now: NOW,
      })
    ).toBe(false);
  });

  it('suppresses when retired flag set (post-import, never returns)', () => {
    expect(
      shouldShowImportReminder({
        onboardingCompleted: true,
        harvestEventCount: 0,
        permanentlyRetired: true,
        lastDismissedIso: null,
        now: NOW,
      })
    ).toBe(false);
  });

  it('suppresses when frame count > 0 (proxy for has-imported)', () => {
    expect(
      shouldShowImportReminder({
        onboardingCompleted: true,
        harvestEventCount: 5,
        permanentlyRetired: false,
        lastDismissedIso: null,
        now: NOW,
      })
    ).toBe(false);
  });

  it('suppresses when dismissed within the 7-day re-show window', () => {
    const dismissedAt = new Date(NOW - 3 * 86_400_000).toISOString(); // 3d ago
    expect(
      shouldShowImportReminder({
        onboardingCompleted: true,
        harvestEventCount: 0,
        permanentlyRetired: false,
        lastDismissedIso: dismissedAt,
        now: NOW,
      })
    ).toBe(false);
  });

  it('shows after the 7-day window elapses', () => {
    const dismissedAt = new Date(NOW - 8 * 86_400_000).toISOString(); // 8d ago
    expect(
      shouldShowImportReminder({
        onboardingCompleted: true,
        harvestEventCount: 0,
        permanentlyRetired: false,
        lastDismissedIso: dismissedAt,
        now: NOW,
      })
    ).toBe(true);
  });

  it('shows on first eligible mount (onboarded + zero frames + no dismiss)', () => {
    expect(
      shouldShowImportReminder({
        onboardingCompleted: true,
        harvestEventCount: 0,
        permanentlyRetired: false,
        lastDismissedIso: null,
        now: NOW,
      })
    ).toBe(true);
  });

  it('treats malformed lastDismissedIso as no-dismiss (defensive)', () => {
    expect(
      shouldShowImportReminder({
        onboardingCompleted: true,
        harvestEventCount: 0,
        permanentlyRetired: false,
        lastDismissedIso: 'not-a-date',
        now: NOW,
      })
    ).toBe(true);
  });

  it('honours an override re-show window for shorter cadence tests', () => {
    const dismissedAt = new Date(NOW - 2 * 86_400_000).toISOString(); // 2d ago
    expect(
      shouldShowImportReminder({
        onboardingCompleted: true,
        harvestEventCount: 0,
        permanentlyRetired: false,
        lastDismissedIso: dismissedAt,
        now: NOW,
        reshowWindowMs: 86_400_000, // 1 day
      })
    ).toBe(true);
  });
});

describe('localStorage helpers', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('readDismissedAt returns null when unset', () => {
    expect(readDismissedAt()).toBeNull();
  });

  it('writeDismissedAt + readDismissedAt round-trip an ISO timestamp', () => {
    const iso = '2026-05-01T12:00:00.000Z';
    writeDismissedAt(iso);
    expect(readDismissedAt()).toBe(iso);
    expect(window.localStorage.getItem(IMPORT_REMINDER_DISMISSED_KEY)).toBe(iso);
  });

  it('readRetired returns false when unset', () => {
    expect(readRetired()).toBe(false);
  });

  it('writeRetired persists the literal string "true"', () => {
    writeRetired();
    expect(readRetired()).toBe(true);
    expect(window.localStorage.getItem(IMPORT_REMINDER_RETIRED_KEY)).toBe('true');
  });
});

describe('default re-show window', () => {
  it('is 7 days', () => {
    expect(DEFAULT_RESHOW_WINDOW_MS).toBe(7 * 86_400_000);
  });
});
