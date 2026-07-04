/**
 * TrialExpiredModal auto-open gating (F1).
 *
 * The paywall modal used to auto-open on EVERY successful getTier() that
 * reported `trialExpired`, and refreshTier runs on every provider mount (full
 * page load), after both startTrial() paths (including immediately after the
 * onboarding wizard finishes), and on focus/visibility/online/connect-settled
 * revalidation — with dismissal never persisted. The result: the modal
 * re-popped seconds after onboarding and on every navigation/refocus.
 *
 * This module mirrors login-briefing.ts: a pure decision function plus
 * try/catch localStorage accessors. The gate collapses the auto-open to at
 * most once per page-load session, suppresses it for a quiet window right after
 * onboarding, and snoozes it for a week after it was last shown. Manual opens
 * (StatusBar pill) intentionally bypass this gate.
 */

export const TRIAL_MODAL_LAST_AUTO_OPENED_AT_KEY = 'waggle:trial-expired-last-shown-at';
export const ONBOARDING_STORAGE_KEY = 'waggle:onboarding';

/** Snooze the auto-open for a week after it last fired. */
export const TRIAL_MODAL_SNOOZE_DAYS = 7;
/** Don't pop the paywall in the first minutes after the wizard completes. */
export const TRIAL_MODAL_POST_ONBOARDING_QUIET_MINUTES = 10;

const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

export interface TrialModalGateInput {
  /** Server says the trial has expired. */
  trialExpired: boolean;
  /** The onboarding wizard has been completed. */
  onboardingCompleted: boolean;
  /** Epoch ms the modal was last auto-opened; null = never. */
  lastAutoOpenedAt: number | null;
  /** Epoch ms the wizard was completed; null = unknown/legacy. */
  onboardingCompletedAt: number | null;
  /** Modal already auto-opened in this page-load session. */
  shownThisSession: boolean;
  /** Current epoch ms. */
  now: number;
}

/**
 * Decide whether the trial-expired modal may auto-open now. Pure — all reads
 * and writes are the caller's responsibility.
 */
export function shouldAutoOpenTrialModal(input: TrialModalGateInput): boolean {
  if (!input.trialExpired) return false;
  // Never overlay the paywall on top of / under the onboarding wizard.
  if (!input.onboardingCompleted) return false;
  // Once per page-load session — covers post-dismissal re-fires from
  // focus/visibility/online/connect-settled revalidation.
  if (input.shownThisSession) return false;
  // Quiet window right after finishing the wizard.
  if (
    input.onboardingCompletedAt != null &&
    input.now - input.onboardingCompletedAt < TRIAL_MODAL_POST_ONBOARDING_QUIET_MINUTES * MINUTE_MS
  ) {
    return false;
  }
  // Weekly snooze after the last auto-open.
  if (
    input.lastAutoOpenedAt != null &&
    input.now - input.lastAutoOpenedAt < TRIAL_MODAL_SNOOZE_DAYS * DAY_MS
  ) {
    return false;
  }
  return true;
}

/** Epoch ms the modal was last auto-opened, or null if never / unreadable. */
export function readTrialModalLastAutoOpenedAt(): number | null {
  try {
    const raw = window.localStorage.getItem(TRIAL_MODAL_LAST_AUTO_OPENED_AT_KEY);
    if (!raw) return null;
    const ts = Number(raw);
    if (!Number.isFinite(ts)) return null;
    return ts;
  } catch {
    return null;
  }
}

/** Record "the modal auto-opened just now" for the weekly snooze. */
export function writeTrialModalLastAutoOpenedAt(now: number = Date.now()): void {
  try {
    window.localStorage.setItem(TRIAL_MODAL_LAST_AUTO_OPENED_AT_KEY, String(now));
  } catch {
    // no-op — storage disabled
  }
}

/**
 * Snapshot the onboarding completion flags straight from localStorage, so the
 * []-dep refreshTier callback never closes over a stale onboarding state
 * object. Returns `{ completed:false, completedAt:null }` on any read/parse
 * failure (fail-closed: no auto-open).
 */
export function readOnboardingCompletionSnapshot(): { completed: boolean; completedAt: number | null } {
  try {
    const raw = window.localStorage.getItem(ONBOARDING_STORAGE_KEY);
    if (!raw) return { completed: false, completedAt: null };
    const parsed = JSON.parse(raw) as { completed?: unknown; completedAt?: unknown };
    const completed = parsed.completed === true;
    const ts = typeof parsed.completedAt === 'number' && Number.isFinite(parsed.completedAt)
      ? parsed.completedAt
      : null;
    return { completed, completedAt: ts };
  } catch {
    return { completed: false, completedAt: null };
  }
}
