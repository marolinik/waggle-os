import { useState, useEffect, useRef } from 'react';
import { adapter } from '@/lib/adapter';

/**
 * Tracks whether the backend health endpoint is reachable.
 *
 * FR #17 hardening:
 * - Tolerance: requires 2 consecutive failures before flipping `offline = true`,
 *   so a single transient timeout (heavy operation, momentary network blip)
 *   does not surface the Offline pill.
 * - Cap max backoff at 60s (was 5min) so recovery is detected within a minute
 *   instead of leaving the pill stale long after the backend is healthy again.
 * - Event-driven re-checks: a fresh probe runs on `window.online` and on tab
 *   `visibilitychange` → 'visible'. After reconnecting WiFi or refocusing the
 *   tab, the pill clears within one HTTP roundtrip rather than waiting for the
 *   next scheduled tick.
 */
const FAILURE_TOLERANCE = 2;
const BASE_INTERVAL_MS = 15_000;
const MAX_INTERVAL_MS = 60_000;

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
      // Exponential backoff capped at MAX_INTERVAL_MS so recovery is detected
      // within the cap rather than the original 5-min ceiling.
      const interval = Math.min(BASE_INTERVAL_MS * Math.pow(2, failCount.current), MAX_INTERVAL_MS);
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

    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return offline;
};
