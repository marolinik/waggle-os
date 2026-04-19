/**
 * M-19 / UX-4 — progressive dock label visibility rule.
 * Pure function; deterministic `now` injection keeps tests stable.
 */
import { describe, it, expect } from 'vitest';
import {
  shouldShowDockLabels,
  DOCK_LABELS_AGE_THRESHOLD_MS,
  DOCK_LABELS_SESSION_THRESHOLD,
} from './dock-labels';

const NOW = 1_700_000_000_000; // arbitrary fixed instant
const JUST_NOW = NOW - 60_000;
const SIX_DAYS_AGO = NOW - 6 * 24 * 60 * 60 * 1000;
const EIGHT_DAYS_AGO = NOW - 8 * 24 * 60 * 60 * 1000;

describe('shouldShowDockLabels — override modes', () => {
  it("always returns true regardless of usage", () => {
    expect(shouldShowDockLabels({
      sessionCount: 999,
      firstLaunchAt: EIGHT_DAYS_AGO,
      now: NOW,
      mode: 'always',
    })).toBe(true);
  });

  it('never returns false regardless of usage', () => {
    expect(shouldShowDockLabels({
      sessionCount: 0,
      firstLaunchAt: JUST_NOW,
      now: NOW,
      mode: 'never',
    })).toBe(false);
  });
});

describe('shouldShowDockLabels — auto heuristic', () => {
  it('shows labels when sessionCount is below the threshold (even if install is old)', () => {
    expect(shouldShowDockLabels({
      sessionCount: DOCK_LABELS_SESSION_THRESHOLD - 1,
      firstLaunchAt: EIGHT_DAYS_AGO,
      now: NOW,
      mode: 'auto',
    })).toBe(true);
  });

  it('shows labels when install age is below the threshold (even with many sessions)', () => {
    expect(shouldShowDockLabels({
      sessionCount: DOCK_LABELS_SESSION_THRESHOLD * 5,
      firstLaunchAt: SIX_DAYS_AGO,
      now: NOW,
      mode: 'auto',
    })).toBe(true);
  });

  it('hides labels when both thresholds are exceeded', () => {
    expect(shouldShowDockLabels({
      sessionCount: DOCK_LABELS_SESSION_THRESHOLD,
      firstLaunchAt: EIGHT_DAYS_AGO,
      now: NOW,
      mode: 'auto',
    })).toBe(false);
  });

  it('shows labels on a fresh install with no first-launch timestamp recorded', () => {
    expect(shouldShowDockLabels({
      sessionCount: 0,
      firstLaunchAt: null,
      now: NOW,
      mode: 'auto',
    })).toBe(true);
  });

  it('hides labels when sessionCount is at threshold and install age is unknown but sessions are already past', () => {
    // Without a first-launch timestamp we can't gate on age, so the
    // session counter alone decides. At/above threshold → hidden.
    expect(shouldShowDockLabels({
      sessionCount: DOCK_LABELS_SESSION_THRESHOLD,
      firstLaunchAt: null,
      now: NOW,
      mode: 'auto',
    })).toBe(false);
  });

  it('threshold constants are the documented 20 sessions / 7 days', () => {
    expect(DOCK_LABELS_SESSION_THRESHOLD).toBe(20);
    expect(DOCK_LABELS_AGE_THRESHOLD_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });
});

describe('shouldShowDockLabels — boundary behaviour', () => {
  it('exactly at the session threshold is treated as "no longer new"', () => {
    expect(shouldShowDockLabels({
      sessionCount: DOCK_LABELS_SESSION_THRESHOLD,
      firstLaunchAt: EIGHT_DAYS_AGO,
      now: NOW,
      mode: 'auto',
    })).toBe(false);
  });

  it('exactly at the age threshold is treated as "no longer new"', () => {
    expect(shouldShowDockLabels({
      sessionCount: DOCK_LABELS_SESSION_THRESHOLD,
      firstLaunchAt: NOW - DOCK_LABELS_AGE_THRESHOLD_MS,
      now: NOW,
      mode: 'auto',
    })).toBe(false);
  });
});
