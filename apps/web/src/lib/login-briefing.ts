/**
 * LoginBriefing visibility contract (M-25 / ENG-4).
 *
 * The briefing shows on every fresh session by default. A user who
 * clicks "Don't show again" sets a persistent localStorage flag that
 * hides it permanently across sessions. The per-session behaviour is
 * implicit — React state naturally resets on each full page load, so
 * all we need to gate is the permanent dismiss.
 *
 * Extra knobs:
 *   - `?skipBriefing=true` URL param: short-circuits for E2E runs.
 *   - Settings toggle: lets a user who changed their mind re-enable
 *     the briefing via `writeLoginBriefingDismissed(false)`.
 */

export const LOGIN_BRIEFING_DISMISSED_KEY = 'waggle:login-briefing-dismissed';
export const LOGIN_BRIEFING_LAST_DISMISSED_AT_KEY = 'waggle:login-briefing-last-dismissed-at';

/**
 * Re-show cooldown after a dismiss. A reload minutes after dismissing must
 * NOT re-greet "you've been away N days" — repeating the welcome to someone
 * who was just here breaks the "it knows me" promise the briefing exists for.
 */
export const LOGIN_BRIEFING_COOLDOWN_MINUTES = 30;

export interface LoginBriefingVisibilityInput {
  /** URL `?skipBriefing=true` — E2E escape hatch. */
  skipBriefing: boolean;
  /** Persistent "Don't show again" flag from localStorage. */
  permanentlyDismissed: boolean;
  /** Minutes since the user last dismissed the briefing; null = never. */
  minutesSinceLastDismiss?: number | null;
}

/**
 * Decide whether to render the LoginBriefing at the start of a session.
 * Pure function — all side effects are the caller's responsibility.
 */
export function shouldShowLoginBriefing(input: LoginBriefingVisibilityInput): boolean {
  if (input.skipBriefing) return false;
  if (input.permanentlyDismissed) return false;
  if (
    input.minutesSinceLastDismiss != null &&
    input.minutesSinceLastDismiss < LOGIN_BRIEFING_COOLDOWN_MINUTES
  ) {
    return false;
  }
  return true;
}

/** Non-hook snapshot of the persistent dismiss flag. */
export function readLoginBriefingDismissed(): boolean {
  try {
    return window.localStorage.getItem(LOGIN_BRIEFING_DISMISSED_KEY) === 'true';
  } catch {
    return false;
  }
}

/** Persist the dismiss flag. Writes the literal string "true" / "false". */
export function writeLoginBriefingDismissed(value: boolean): void {
  try {
    window.localStorage.setItem(LOGIN_BRIEFING_DISMISSED_KEY, String(value));
  } catch {
    // no-op — storage disabled
  }
}

/** Record "the user dismissed the briefing just now" for the cooldown gate. */
export function writeLoginBriefingLastDismissedAt(now: number = Date.now()): void {
  try {
    window.localStorage.setItem(LOGIN_BRIEFING_LAST_DISMISSED_AT_KEY, String(now));
  } catch {
    // no-op — storage disabled
  }
}

/** Minutes since the last dismiss, or null if never dismissed / unreadable. */
export function readMinutesSinceLastDismiss(now: number = Date.now()): number | null {
  try {
    const raw = window.localStorage.getItem(LOGIN_BRIEFING_LAST_DISMISSED_AT_KEY);
    if (!raw) return null;
    const ts = Number(raw);
    if (!Number.isFinite(ts)) return null;
    return (now - ts) / 60_000;
  } catch {
    return null;
  }
}

/** Read the `?skipBriefing=true` URL param; safe to call in SSR contexts. */
export function readSkipBriefingParam(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get('skipBriefing') === 'true';
  } catch {
    return false;
  }
}
