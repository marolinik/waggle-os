/**
 * F5 — coach-marks first-run deferral gate regression.
 *
 * Pins the deferral ladder (never before completion, honors dismiss, force
 * replay wins, same-session + 24h defer) and the sessionStorage accessors.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  shouldShowCoachMarks,
  readOnboardedThisSession,
  readForceTour,
  clearForceTour,
  ONBOARDED_THIS_SESSION_KEY,
  COACH_MARKS_FORCE_KEY,
  COACH_MARKS_DEFER_MS,
  type CoachMarksGateInput,
} from './coach-marks-gate';

const NOW = Date.parse('2026-07-04T12:00:00Z');

/** Baseline that SHOWS the carousel; each case overrides one field. */
function base(overrides: Partial<CoachMarksGateInput> = {}): CoachMarksGateInput {
  return {
    completed: true,
    tooltipsDismissed: false,
    completedAt: null,
    completedThisSession: false,
    forceTour: false,
    now: NOW,
    ...overrides,
  };
}

describe('shouldShowCoachMarks', () => {
  it('shows when completed, not dismissed, and no deferral trips (legacy: no completedAt)', () => {
    expect(shouldShowCoachMarks(base())).toBe(true);
  });

  it('never shows before onboarding completes', () => {
    expect(shouldShowCoachMarks(base({ completed: false }))).toBe(false);
  });

  it('never shows once dismissed permanently', () => {
    expect(shouldShowCoachMarks(base({ tooltipsDismissed: true }))).toBe(false);
  });

  it('force replay overrides same-session + defer', () => {
    expect(shouldShowCoachMarks(base({ forceTour: true, completedThisSession: true, completedAt: NOW }))).toBe(true);
  });

  it('defers within the same session the wizard completed', () => {
    expect(shouldShowCoachMarks(base({ completedThisSession: true }))).toBe(false);
  });

  it('defers within 24h of completion (12h ago)', () => {
    expect(shouldShowCoachMarks(base({ completedAt: NOW - 12 * 60 * 60_000 }))).toBe(false);
  });

  it('shows once past the 24h deferral', () => {
    expect(shouldShowCoachMarks(base({ completedAt: NOW - COACH_MARKS_DEFER_MS - 1 }))).toBe(true);
  });
});

describe('sessionStorage accessors', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it('readOnboardedThisSession is false until the flag is set', () => {
    expect(readOnboardedThisSession()).toBe(false);
    window.sessionStorage.setItem(ONBOARDED_THIS_SESSION_KEY, '1');
    expect(readOnboardedThisSession()).toBe(true);
  });

  it('readForceTour reflects the force flag, clearForceTour removes it', () => {
    expect(readForceTour()).toBe(false);
    window.sessionStorage.setItem(COACH_MARKS_FORCE_KEY, '1');
    expect(readForceTour()).toBe(true);
    clearForceTour();
    expect(readForceTour()).toBe(false);
  });
});
