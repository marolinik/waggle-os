/**
 * Phase 1 #7 — Pending Imports Reminder banner state.
 *
 * Tracks when the import-reminder banner was last dismissed and whether it
 * has been permanently retired (after the user has imported anything). Pure
 * helpers — all side effects are the caller's responsibility.
 *
 * Cadence: re-show 7 days after the last dismiss. Once retired (first
 * successful import), the banner never returns regardless of dismissal
 * state.
 */

export const IMPORT_REMINDER_DISMISSED_KEY = 'waggle:import-banner-dismissed-at';
export const IMPORT_REMINDER_RETIRED_KEY = 'waggle:import-banner-retired';
export const IMPORT_REMINDER_CC_SIGNATURE_KEY = 'waggle:import-banner-cc-signature';

/** Default re-show window. 7 days = 7 × 86_400_000 ms. */
export const DEFAULT_RESHOW_WINDOW_MS = 7 * 86_400_000;

export interface ImportReminderInput {
  /** Has the user completed the onboarding wizard? */
  onboardingCompleted: boolean;
  /** Count of harvest events committed to memory. 0 = never imported. */
  harvestEventCount: number;
  /** Persistent retired flag. Set to true once the user imports anything. */
  permanentlyRetired: boolean;
  /** ISO timestamp of last dismiss (or null). */
  lastDismissedIso: string | null;
  /** Current time, override for tests. */
  now?: number;
  /** Re-show window in ms. Defaults to 7 days. */
  reshowWindowMs?: number;
}

/**
 * Decide whether the reminder banner should render this mount.
 *
 * Rules:
 *   1. Suppress if not onboarded (the wizard is the right surface, not this banner).
 *   2. Suppress if user has already imported (retired flag OR harvestEventCount > 0).
 *   3. Suppress if dismissed within the re-show window.
 *   4. Otherwise show.
 */
export function shouldShowImportReminder(input: ImportReminderInput): boolean {
  if (!input.onboardingCompleted) return false;
  if (input.permanentlyRetired) return false;
  if (input.harvestEventCount > 0) return false;

  if (input.lastDismissedIso) {
    const parsed = Date.parse(input.lastDismissedIso);
    if (Number.isFinite(parsed)) {
      const now = input.now ?? Date.now();
      const window = input.reshowWindowMs ?? DEFAULT_RESHOW_WINDOW_MS;
      if (now - parsed < window) return false;
    }
  }

  return true;
}

/** Read the persistent dismissed-at flag. Returns null when storage disabled or unset. */
export function readDismissedAt(): string | null {
  try {
    return window.localStorage.getItem(IMPORT_REMINDER_DISMISSED_KEY);
  } catch {
    return null;
  }
}

/** Persist the dismissed-at timestamp. */
export function writeDismissedAt(iso: string): void {
  try {
    window.localStorage.setItem(IMPORT_REMINDER_DISMISSED_KEY, iso);
  } catch {
    /* storage disabled — no-op */
  }
}

/** Read the retired flag — true once the user has imported anything. */
export function readRetired(): boolean {
  try {
    return window.localStorage.getItem(IMPORT_REMINDER_RETIRED_KEY) === 'true';
  } catch {
    return false;
  }
}

/** Mark the banner permanently retired. Called when user imports anything. */
export function writeRetired(): void {
  try {
    window.localStorage.setItem(IMPORT_REMINDER_RETIRED_KEY, 'true');
  } catch {
    /* storage disabled — no-op */
  }
}

/**
 * Track the auto-detect signature so dismissing the banner doesn't keep
 * re-firing it on every Memory app mount when Claude Code is detected with
 * the same item count. Writing a fresh signature on detection-change clears
 * the dismissal so the user sees the new state.
 */
export function readCCSignature(): string | null {
  try {
    return window.localStorage.getItem(IMPORT_REMINDER_CC_SIGNATURE_KEY);
  } catch {
    return null;
  }
}

export function writeCCSignature(signature: string): void {
  try {
    window.localStorage.setItem(IMPORT_REMINDER_CC_SIGNATURE_KEY, signature);
  } catch {
    /* storage disabled — no-op */
  }
}
