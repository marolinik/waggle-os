/**
 * UX Refactor v2.1 P1b (D3 plus-clause) — revalidate an ERRORED surface when
 * the user comes back or the connection recovers.
 *
 * Mirrors the useOfflineStatus triple-listener (window 'online' +
 * document 'visibilitychange'→visible + window 'focus' — focus is needed
 * because visibilitychange misses window-level refocus while the tab stays
 * visible) and adds the P1b 'waggle:connect-settled' bus event dispatched by
 * ServiceProvider on every connect settlement — the only trigger that fires
 * on the default desktop launch path, where the window already has focus and
 * none of the DOM events ever arrive.
 *
 * Keyed to `errored`: healthy surfaces never refetch on focus. The callback
 * is kept in a ref so callers can pass a fresh closure each render without
 * tearing down the listeners.
 */
import { useEffect, useRef } from 'react';

export const CONNECT_SETTLED_EVENT = 'waggle:connect-settled';

export function useRevalidateOnError(errored: boolean, revalidate: () => void): void {
  const fnRef = useRef(revalidate);
  fnRef.current = revalidate;

  useEffect(() => {
    if (!errored) return;

    const fire = () => fnRef.current();
    const onVisible = () => { if (document.visibilityState === 'visible') fire(); };

    window.addEventListener('online', fire);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', fire);
    window.addEventListener(CONNECT_SETTLED_EVENT, fire);

    return () => {
      window.removeEventListener('online', fire);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', fire);
      window.removeEventListener(CONNECT_SETTLED_EVENT, fire);
    };
  }, [errored]);
}
