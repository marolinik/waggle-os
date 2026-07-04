/**
 * Coach-marks (OnboardingTooltips) first-run deferral gate (F5).
 *
 * The tooltip carousel used to fire the instant the shell first landed —
 * stacking on top of the trial-paywall dismissal and any other first-launch
 * overlay. This gate defers the FIRST post-completion showing: it suppresses
 * the carousel while the user just finished the wizard (same session) or within
 * 24h of completion, so the very first landing stays calm and the tour shows on
 * the next eligible visit. "Dismiss all" (tooltipsDismissed) and the Settings
 * "Replay tour" force path are honored unchanged.
 *
 * Mirrors login-briefing.ts: a pure decision function plus try/catch storage
 * accessors. Session/force flags live in sessionStorage (per page load);
 * completedAt lives in the onboarding localStorage blob (useOnboarding).
 */

/** Defer the first post-completion showing for a day. */
export const COACH_MARKS_DEFER_MS = 24 * 60 * 60 * 1000;

/** sessionStorage: set once the wizard completes in THIS page-load session. */
export const ONBOARDED_THIS_SESSION_KEY = 'waggle:onboarded_this_session';
/** sessionStorage: set by replayTour() to bypass the deferral immediately. */
export const COACH_MARKS_FORCE_KEY = 'waggle:coachmarks_force';

export interface CoachMarksGateInput {
  /** Onboarding wizard completed. */
  completed: boolean;
  /** User clicked "Dismiss all" (permanent). */
  tooltipsDismissed: boolean;
  /** Epoch ms the wizard was completed; null = legacy/returning (past first-run). */
  completedAt: number | null;
  /** Wizard was completed in this page-load session. */
  completedThisSession: boolean;
  /** Settings "Replay tour" requested an immediate show. */
  forceTour: boolean;
  /** Current epoch ms. */
  now?: number;
}

/**
 * Decide whether the coach-mark carousel may show now. Pure — reads/writes are
 * the caller's responsibility.
 */
export function shouldShowCoachMarks(input: CoachMarksGateInput): boolean {
  if (!input.completed) return false;
  if (input.tooltipsDismissed) return false;
  // Explicit user replay wins over the deferral (replayTour already flipped
  // tooltipsDismissed back to false).
  if (input.forceTour) return true;
  if (input.completedThisSession) return false;
  const now = input.now ?? Date.now();
  if (input.completedAt != null && now - input.completedAt < COACH_MARKS_DEFER_MS) {
    return false;
  }
  // Legacy states without completedAt fall through to true — they're past
  // first-run, so there's nothing to defer.
  return true;
}

/** sessionStorage snapshot: did the wizard complete in this session? */
export function readOnboardedThisSession(): boolean {
  try {
    return window.sessionStorage.getItem(ONBOARDED_THIS_SESSION_KEY) === '1';
  } catch {
    return false;
  }
}

/** sessionStorage snapshot: has Settings requested an immediate tour replay? */
export function readForceTour(): boolean {
  try {
    return window.sessionStorage.getItem(COACH_MARKS_FORCE_KEY) === '1';
  } catch {
    return false;
  }
}

/** Clear the replay-force flag once consumed (on carousel dismiss). */
export function clearForceTour(): void {
  try {
    window.sessionStorage.removeItem(COACH_MARKS_FORCE_KEY);
  } catch {
    // no-op — storage disabled
  }
}
