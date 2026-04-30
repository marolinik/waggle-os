import { useState, useEffect, useRef } from 'react';
import { adapter } from '@/lib/adapter';

/**
 * Tracks whether the backend health endpoint is reachable.
 *
 * FR #17 hardening (initial):
 * - Tolerance: requires 2 consecutive failures before flipping `offline = true`,
 *   so a single transient timeout (heavy operation, momentary network blip)
 *   does not surface the Offline pill.
 * - Cap max backoff at 60s (was 5min) so recovery is detected within a minute
 *   instead of leaving the pill stale long after the backend is healthy again.
 * - Event-driven re-checks: a fresh probe runs on `window.online` and on tab
 *   `visibilitychange` → 'visible'. After reconnecting WiFi or refocusing the
 *   tab, the pill clears within one HTTP roundtrip rather than waiting for the
 *   next scheduled tick.
 *
 * FR #17 follow-up (this iteration):
 * - Drop exponential after the flip. Once we're in the offline state, poll
 *   every RECOVERY_INTERVAL_MS (15s) regardless of how many consecutive misses
 *   came before. The exponential ramp made sense BEFORE the pill flipped (avoid
 *   spamming a server we just hit), but AFTER it flipped we want fast recovery
 *   detection — sustained outage means a cheap idempotent /health hit every
 *   15s, well under any rate limit.
 * - Add a `window.focus` listener as a third re-check trigger. `visibilitychange`
 *   only fires when the tab itself was hidden; `focus` fires whenever the
 *   browser window/tab regains focus (e.g., user clicks back from a different
 *   app). Caught the case PM hit where the tab stayed visible the whole time
 *   and recovery was delayed.
 */
const FAILURE_TOLERANCE = 2;
const BASE_INTERVAL_MS = 15_000;
const MAX_INTERVAL_MS = 60_000;
const RECOVERY_INTERVAL_MS = 15_000;

export const useOfflineStatus = () => {
  const [offline, setOffline] = useState(false);
  const failCount = useRef(0);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const check = async () => {
      try {
        await adapter.getSystemHealth();
        if (cancelled) return;
        setOffline(false);
        failCount.current = 0;
      } catch (err) {
        if (cancelled) return;
        console.error('[useOfflineStatus] health check failed:', err);
        failCount.current++;
        if (failCount.current >= FAILURE_TOLERANCE) {
          setOffline(true);
        }
      }
    };

    const schedule = () => {
      // Once flipped offline, poll fast for recovery (15s). Pre-flip we still
      // ramp exponentially so a single bad blip doesn't pummel the server.
      const interval = failCount.current >= FAILURE_TOLERANCE
        ? RECOVERY_INTERVAL_MS
        : Math.min(BASE_INTERVAL_MS * Math.pow(2, failCount.current), MAX_INTERVAL_MS);
      timer = setTimeout(async () => {
        await check();
        if (!cancelled) schedule();
      }, interval);
    };

    // Kick an immediate probe so the recovery side of any event-triggered
    // re-check observes the result quickly. Used by both initial mount and
    // event handlers.
    const probeNow = () => {
      if (timer) clearTimeout(timer);
      void check().then(() => { if (!cancelled) schedule(); });
    };

    probeNow();

    const onOnline = () => probeNow();
    const onVisible = () => { if (document.visibilityState === 'visible') probeNow(); };
    const onFocus = () => probeNow();

    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onFocus);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  return offline;
};
