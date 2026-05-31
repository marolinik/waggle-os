/**
 * LLM-call retry policy for the agent loop.
 *
 * Extracted from agent-loop.ts (PR-E, 2026-05-27) — was ~30L of inline
 * if-429 / if-5xx ladders sharing implicit MAX_RETRIES + wait-cap magic
 * numbers. Lifting to a single decision function makes the protocol
 * explicit: 429 → Retry-After-scaled wait (capped 60s), 5xx (502/503/504)
 * → exponential backoff (capped 30s), other → fatal.
 *
 * Counters are tracked separately for the two paths because:
 *   - 429s honour server-provided Retry-After; capping prevents pathological
 *     advice that would block the loop for minutes.
 *   - 5xx use exponential backoff because the server has no information to
 *     give us — back off ourselves.
 *
 * Both counters reset on a successful response (caller's responsibility).
 */

const MAX_RETRIES = 3;
const MAX_RATE_LIMIT_WAIT_MS = 60_000;
const MAX_SERVER_ERROR_WAIT_MS = 30_000;
const RATE_LIMIT_RETRY_AFTER_DEFAULT_SECONDS = 5;

export interface RetryState {
  rateLimitRetries: number;
  serverErrorRetries: number;
  /** Network-level failures: the fetch promise rejected (no HTTP response). */
  networkErrorRetries: number;
}

export function initialRetryState(): RetryState {
  return { rateLimitRetries: 0, serverErrorRetries: 0, networkErrorRetries: 0 };
}

export type RetryAction =
  | {
      kind: 'retry';
      /** Milliseconds to sleep before retrying */
      waitMs: number;
      /** Human-readable notice (forwarded to onToken so users see the pause) */
      notice: string;
      /** New retry state with the counter incremented for the path taken */
      state: RetryState;
    }
  | {
      kind: 'fatal';
      /** Terminating error (cap exceeded OR non-retryable status) */
      error: Error;
    };

/**
 * Resolve the Retry-After header to a sane number of seconds.
 *
 * RFC 7231 §7.1.3 allows two forms: delta-seconds ("120") OR an HTTP-date
 * ("Wed, 21 Oct 2025 07:28:00 GMT"). `parseInt` on the date form yields NaN,
 * which would propagate through `NaN * 1000` → `Math.min(NaN, cap)` → NaN and
 * make the loop retry immediately (setTimeout(NaN) fires on the next tick),
 * hammering the endpoint. Guard against that:
 *   - delta-seconds → the parsed value (clamped to non-negative)
 *   - HTTP-date     → seconds until that date (clamped to non-negative)
 *   - anything else → the default backoff
 */
function parseRetryAfterSeconds(headerValue: string | null): number {
  if (headerValue === null) return RATE_LIMIT_RETRY_AFTER_DEFAULT_SECONDS;

  const asSeconds = parseInt(headerValue, 10);
  if (Number.isFinite(asSeconds)) return Math.max(0, asSeconds);

  const asDateMs = Date.parse(headerValue);
  if (Number.isFinite(asDateMs)) {
    return Math.max(0, Math.round((asDateMs - Date.now()) / 1000));
  }

  return RATE_LIMIT_RETRY_AFTER_DEFAULT_SECONDS;
}

/**
 * Decide what to do with a non-OK LLM response.
 *
 * 429 (rate limit): honour Retry-After header (default 5s), cap at 60s.
 *   Throws when MAX_RETRIES consecutive 429s reached.
 * 5xx (502/503/504): exponential backoff (1s, 2s, 4s, …), cap at 30s.
 *   Throws when MAX_RETRIES consecutive 5xx reached.
 * Any other non-OK status: throws unconditionally with the response body.
 */
export async function handleNonOkResponse(
  response: Response,
  state: RetryState,
): Promise<RetryAction> {
  if (response.status === 429) {
    const next = state.rateLimitRetries + 1;
    if (next >= MAX_RETRIES) {
      return {
        kind: 'fatal',
        error: new Error(
          `Rate limit retry cap exceeded (${MAX_RETRIES} consecutive 429 responses). Try again later.`,
        ),
      };
    }
    const retryAfterSec = parseRetryAfterSeconds(response.headers.get('retry-after'));
    const waitMs = Math.min(retryAfterSec * 1000, MAX_RATE_LIMIT_WAIT_MS);
    return {
      kind: 'retry',
      waitMs,
      notice: `\n[Rate limited — waiting ${retryAfterSec}s (retry ${next}/${MAX_RETRIES})...]\n`,
      state: { ...state, rateLimitRetries: next },
    };
  }

  // Read the error body once — both retry-path notice + fatal error use it.
  const errorBody = await response.text().catch(() => 'Unknown error');

  if (response.status === 502 || response.status === 503 || response.status === 504) {
    const next = state.serverErrorRetries + 1;
    if (next >= MAX_RETRIES) {
      return {
        kind: 'fatal',
        error: new Error(
          `Server error retry cap exceeded (${MAX_RETRIES} consecutive ${response.status} errors): ${errorBody}`,
        ),
      };
    }
    const waitMs = Math.min(1000 * Math.pow(2, next), MAX_SERVER_ERROR_WAIT_MS);
    return {
      kind: 'retry',
      waitMs,
      notice: `\n[Server error ${response.status} — retrying in ${waitMs / 1000}s (retry ${next}/${MAX_RETRIES})...]\n`,
      state: { ...state, serverErrorRetries: next },
    };
  }

  return {
    kind: 'fatal',
    error: new Error(`LLM error (${response.status}): ${errorBody}`),
  };
}

/**
 * Decide what to do with a network-level failure: the `fetch` promise itself
 * rejected, so we never saw an HTTP response. Causes include "fetch failed" /
 * ECONNREFUSED / socket hang-up (endpoint down or restarting) and an
 * AbortSignal.timeout firing (hung connection). The peer gave us no
 * information, so — like a 5xx — back off ourselves: exponential delay
 * (capped 30s), retry cap 3. Beyond the cap, a clean user-facing fatal error.
 *
 * NOTE: the caller must distinguish a genuine client-disconnect abort (which
 * should NOT retry) before calling this — see agent-loop's fetch try/catch.
 */
export function handleNetworkError(err: unknown, state: RetryState): RetryAction {
  const next = state.networkErrorRetries + 1;
  const detail = err instanceof Error ? err.message : String(err);
  if (next >= MAX_RETRIES) {
    return {
      kind: 'fatal',
      error: new Error(
        `Could not reach the model endpoint after ${MAX_RETRIES} attempts (${detail}). ` +
          `It may be down or restarting — try again in a moment.`,
      ),
    };
  }
  const waitMs = Math.min(1000 * Math.pow(2, next), MAX_SERVER_ERROR_WAIT_MS);
  return {
    kind: 'retry',
    waitMs,
    notice: `\n[Connection to the model failed — retrying in ${waitMs / 1000}s (retry ${next}/${MAX_RETRIES})...]\n`,
    state: { ...state, networkErrorRetries: next },
  };
}
