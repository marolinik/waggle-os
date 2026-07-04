/**
 * F1 — TrialExpiredModal auto-open gate regression.
 *
 * Pins the pure decision (never over/under the wizard, once per session, the
 * post-onboarding quiet window, the weekly snooze) and the localStorage
 * accessors' NaN/garbage guards.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  shouldAutoOpenTrialModal,
  readTrialModalLastAutoOpenedAt,
  writeTrialModalLastAutoOpenedAt,
  readOnboardingCompletionSnapshot,
  TRIAL_MODAL_LAST_AUTO_OPENED_AT_KEY,
  ONBOARDING_STORAGE_KEY,
  type TrialModalGateInput,
} from './trial-expired-gate';

const NOW = new Date('2026-07-04T12:00:00.000Z').getTime();
const MIN = 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;

/** A baseline input that DOES auto-open; each case overrides one field. */
function base(overrides: Partial<TrialModalGateInput> = {}): TrialModalGateInput {
  return {
    trialExpired: true,
    onboardingCompleted: true,
    briefingOpen: false,
    lastAutoOpenedAt: null,
    onboardingCompletedAt: null,
    shownThisSession: false,
    now: NOW,
    ...overrides,
  };
}

describe('shouldAutoOpenTrialModal', () => {
  it('opens when trial expired, onboarding done, and no snooze/quiet/session guard trips', () => {
    expect(shouldAutoOpenTrialModal(base())).toBe(true);
  });

  it('never opens when the trial is not expired', () => {
    expect(shouldAutoOpenTrialModal(base({ trialExpired: false }))).toBe(false);
  });

  it('never opens before onboarding is completed', () => {
    expect(shouldAutoOpenTrialModal(base({ onboardingCompleted: false }))).toBe(false);
  });

  it('never opens twice in one page-load session', () => {
    expect(shouldAutoOpenTrialModal(base({ shownThisSession: true }))).toBe(false);
  });

  it('defers while the login briefing is showing (no stack)', () => {
    expect(shouldAutoOpenTrialModal(base({ briefingOpen: true }))).toBe(false);
  });

  it('suppresses during the post-onboarding quiet window (9 min ago)', () => {
    expect(shouldAutoOpenTrialModal(base({ onboardingCompletedAt: NOW - 9 * MIN }))).toBe(false);
  });

  it('allows after the post-onboarding quiet window (11 min ago)', () => {
    expect(shouldAutoOpenTrialModal(base({ onboardingCompletedAt: NOW - 11 * MIN }))).toBe(true);
  });

  it('suppresses within the weekly snooze (6 days ago)', () => {
    expect(shouldAutoOpenTrialModal(base({ lastAutoOpenedAt: NOW - 6 * DAY }))).toBe(false);
  });

  it('allows after the weekly snooze lapses (8 days ago)', () => {
    expect(shouldAutoOpenTrialModal(base({ lastAutoOpenedAt: NOW - 8 * DAY }))).toBe(true);
  });

  it('legacy profile (both timestamps null) opens — no quiet period, no snooze', () => {
    expect(shouldAutoOpenTrialModal(base({ onboardingCompletedAt: null, lastAutoOpenedAt: null }))).toBe(true);
  });
});

describe('readTrialModalLastAutoOpenedAt / writeTrialModalLastAutoOpenedAt', () => {
  beforeEach(() => {
    window.localStorage.removeItem(TRIAL_MODAL_LAST_AUTO_OPENED_AT_KEY);
  });

  it('returns null when never written', () => {
    expect(readTrialModalLastAutoOpenedAt()).toBe(null);
  });

  it('round-trips an epoch-ms timestamp', () => {
    writeTrialModalLastAutoOpenedAt(NOW);
    expect(readTrialModalLastAutoOpenedAt()).toBe(NOW);
  });

  it('returns null for a corrupt (non-numeric) stored value', () => {
    window.localStorage.setItem(TRIAL_MODAL_LAST_AUTO_OPENED_AT_KEY, 'not-a-number');
    expect(readTrialModalLastAutoOpenedAt()).toBe(null);
  });
});

describe('readOnboardingCompletionSnapshot', () => {
  beforeEach(() => {
    window.localStorage.removeItem(ONBOARDING_STORAGE_KEY);
  });

  it('returns not-completed when nothing is stored', () => {
    expect(readOnboardingCompletionSnapshot()).toEqual({ completed: false, completedAt: null });
  });

  it('reads completed + completedAt from the onboarding blob', () => {
    window.localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify({ completed: true, completedAt: NOW }));
    expect(readOnboardingCompletionSnapshot()).toEqual({ completed: true, completedAt: NOW });
  });

  it('completed:true without completedAt reads completedAt=null (legacy/E2E)', () => {
    window.localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify({ completed: true }));
    expect(readOnboardingCompletionSnapshot()).toEqual({ completed: true, completedAt: null });
  });

  it('returns not-completed on garbage JSON', () => {
    window.localStorage.setItem(ONBOARDING_STORAGE_KEY, '{not json');
    expect(readOnboardingCompletionSnapshot()).toEqual({ completed: false, completedAt: null });
  });

  it('ignores a non-finite completedAt', () => {
    window.localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify({ completed: true, completedAt: 'soon' }));
    expect(readOnboardingCompletionSnapshot()).toEqual({ completed: true, completedAt: null });
  });
});
