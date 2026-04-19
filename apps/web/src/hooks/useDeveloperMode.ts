/**
 * M-20 / UX-5 — Developer mode hook. Persisted in localStorage,
 * cross-tab reactive via the `storage` event, and cross-component
 * reactive within one tab via a custom event. Default off.
 *
 * When enabled, UI surfaces that would otherwise hide developer-only
 * signal (token counts, cost, debug chips) can render. The canonical
 * read site is `useDeveloperMode()` — no prop plumbing needed.
 */
import { useEffect, useState } from 'react';

export const DEVELOPER_MODE_STORAGE_KEY = 'waggle:developer-mode';
const CHANGE_EVENT = 'waggle:developer-mode-change';

/** Non-hook snapshot — safe to call from module scope. */
export function readDeveloperMode(): boolean {
  try {
    return window.localStorage.getItem(DEVELOPER_MODE_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function writeDeveloperMode(value: boolean): void {
  try {
    window.localStorage.setItem(DEVELOPER_MODE_STORAGE_KEY, String(value));
  } catch {
    // no-op — storage disabled / private mode
  }
  // Notify in-tab subscribers (the `storage` event only fires in OTHER
  // tabs, not the one that made the write).
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function useDeveloperMode(): readonly [boolean, (value: boolean) => void] {
  const [enabled, setEnabledState] = useState<boolean>(() => readDeveloperMode());

  useEffect(() => {
    const sync = () => setEnabledState(readDeveloperMode());
    window.addEventListener('storage', sync);
    window.addEventListener(CHANGE_EVENT, sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener(CHANGE_EVENT, sync);
    };
  }, []);

  const set = (value: boolean) => {
    writeDeveloperMode(value);
    setEnabledState(value);
  };

  return [enabled, set] as const;
}
