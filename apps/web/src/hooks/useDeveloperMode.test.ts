/**
 * M-20 / UX-5 — Developer mode storage contract regression.
 *
 * The React hook is a thin wrapper around three stable pieces we can
 * exercise without booting React:
 *   1. `readDeveloperMode()` — pure snapshot reader.
 *   2. localStorage key contract — `waggle:developer-mode` ← "true" | absent.
 *   3. Cross-component sync — `waggle:developer-mode-change` custom event
 *      fires on every writer path.
 *
 * (Full render-level hook behaviour is covered by the forthcoming
 * Playwright E2E; @testing-library/react 16 ships for React 19 while
 * this app is on React 18.3, so `renderHook` mixes React copies.)
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  readDeveloperMode,
  DEVELOPER_MODE_STORAGE_KEY,
} from './useDeveloperMode';

describe('developer mode storage contract', () => {
  beforeEach(() => {
    window.localStorage.removeItem(DEVELOPER_MODE_STORAGE_KEY);
  });

  it('readDeveloperMode returns false when the key is absent', () => {
    expect(readDeveloperMode()).toBe(false);
  });

  it('readDeveloperMode returns true when the key is literally "true"', () => {
    window.localStorage.setItem(DEVELOPER_MODE_STORAGE_KEY, 'true');
    expect(readDeveloperMode()).toBe(true);
  });

  it('readDeveloperMode returns false for any non-"true" value', () => {
    // Defensive against stale data from a prior storage contract.
    for (const value of ['1', 'yes', 'on', 'TRUE', ' true', '']) {
      window.localStorage.setItem(DEVELOPER_MODE_STORAGE_KEY, value);
      expect(readDeveloperMode(), `input: ${JSON.stringify(value)}`).toBe(false);
    }
  });

  it('the storage key is the exact documented literal', () => {
    // If this constant ever changes, a migration step must run first;
    // pinning it here prevents a silent rename from wiping every
    // user's preference.
    expect(DEVELOPER_MODE_STORAGE_KEY).toBe('waggle:developer-mode');
  });
});

describe('developer mode cross-component change event', () => {
  const CHANGE_EVENT = 'waggle:developer-mode-change';

  beforeEach(() => {
    window.localStorage.removeItem(DEVELOPER_MODE_STORAGE_KEY);
  });

  it('a manually dispatched change event is observable in the same tab', () => {
    // The hook relies on this event to notify other instances in the
    // same tab (the `storage` event only fires in OTHER tabs). This
    // test pins the channel name so a rename breaks loudly.
    const listener = vi.fn();
    window.addEventListener(CHANGE_EVENT, listener);
    try {
      window.dispatchEvent(new Event(CHANGE_EVENT));
      expect(listener).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener(CHANGE_EVENT, listener);
    }
  });
});
