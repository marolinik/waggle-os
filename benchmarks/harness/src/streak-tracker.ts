/**
 * Sprint 12 Task 2.5 Stage 1.5 §7.2 — consecutive fetch-transport failure halt.
 *
 * The v2 full-context cell exhibited a cascade of fetch_error_TypeError
 * after concurrent runner processes saturated the OpenRouter bridge (see
 * sessions/2026-04-23-task25-s0-v2-fullcontext-forensic.md §4). Once
 * saturation kicked in, every subsequent instance failed identically.
 * Without a structural halt, the runner burned its full 100-instance budget
 * on dead calls before terminating.
 *
 * StreakTracker counts CONSECUTIVE `fetch_error_*` results. On the Nth
 * consecutive failure (default N=5), `record()` returns `true` and the
 * caller should throw a hard abort. Success resets the counter. Non-fetch
 * failures (timeout, http_5xx, other classes) reset the counter — those
 * aren't bridge-saturation symptoms.
 *
 * The `recent[]` rolling window (size 10) is kept for observability only —
 * it's surfaced in the halt error message so operators can see the
 * immediate-history context.
 */

const DEFAULT_THRESHOLD = 5;
const DEFAULT_WINDOW_SIZE = 10;

/** Pattern match for bridge/network transport failures. Excludes `timeout`
 *  (per-call AbortError) and `http_5xx` (server-side error) — only counts
 *  errors from the client-side fetch() throwing before/during I/O. */
export function isFetchTransportFailure(failureMode: string | null | undefined): boolean {
  return failureMode !== null && failureMode !== undefined && /^fetch_error_/.test(failureMode);
}

export interface StreakTrackerOptions {
  /** Consecutive-failure count that triggers halt. Default 5. */
  threshold?: number;
  /** Rolling-window size kept for observability in the halt error message.
   *  Default 10. Does NOT affect the halt decision — the counter resets on
   *  any non-fetch result regardless of window state. */
  windowSize?: number;
}

export class StreakTracker {
  private consecutive = 0;
  private readonly recent: boolean[] = [];
  private readonly threshold: number;
  private readonly windowSize: number;

  constructor(options: StreakTrackerOptions = {}) {
    this.threshold = Math.max(1, options.threshold ?? DEFAULT_THRESHOLD);
    this.windowSize = Math.max(1, options.windowSize ?? DEFAULT_WINDOW_SIZE);
  }

  /**
   * Record one evaluation outcome. Returns `true` when the consecutive
   * fetch-transport failure count has reached the halt threshold. Caller
   * should throw a clear abort error on `true` and stop the cell loop.
   *
   * Idempotent — calling `record(null)` multiple times resets the counter
   * to zero each time; subsequent non-null fetch_error_* calls count up
   * from zero again.
   */
  record(failureMode: string | null | undefined): boolean {
    const transportFailure = isFetchTransportFailure(failureMode);
    this.consecutive = transportFailure ? this.consecutive + 1 : 0;
    this.recent.push(transportFailure);
    if (this.recent.length > this.windowSize) this.recent.shift();
    return this.consecutive >= this.threshold;
  }

  /** Current consecutive-failure count. */
  getConsecutiveFailures(): number {
    return this.consecutive;
  }

  /** Snapshot of the last `windowSize` outcomes (true=transport-failure). */
  getRecentWindow(): readonly boolean[] {
    return [...this.recent];
  }

  /** Human-readable summary for halt error messages / logs. */
  summary(): string {
    const windowStr = this.recent.map(b => (b ? 'X' : '.')).join('');
    return `consecutive=${this.consecutive} window_last${this.windowSize}=[${windowStr}] threshold=${this.threshold}`;
  }

  /** Reset all state. For reuse across cells if desired. */
  reset(): void {
    this.consecutive = 0;
    this.recent.length = 0;
  }
}
