/**
 * Dock-label visibility hook (M-19 / UX-4). Owns the localStorage
 * plumbing around the pure `shouldShowDockLabels` rule.
 *
 * Storage keys:
 *   - waggle:session-count   — integer, incremented on each page load
 *   - waggle:first-launch-at — unix ms, first write wins
 *   - waggle:dock-labels     — override: 'auto' | 'always' | 'never'
 *
 * The session counter increments exactly once per page load (mount of
 * the hook). useRef guards against StrictMode double-effects in dev.
 */
import { useEffect, useRef, useState } from 'react';
import {
  shouldShowDockLabels,
  type DockLabelsMode,
} from '@/lib/dock-labels';

export const SESSION_COUNT_KEY = 'waggle:session-count';
export const FIRST_LAUNCH_KEY = 'waggle:first-launch-at';
export const DOCK_LABELS_MODE_KEY = 'waggle:dock-labels';
const MODE_CHANGE_EVENT = 'waggle:dock-labels-change';

function readSessionCount(): number {
  try {
    const raw = window.localStorage.getItem(SESSION_COUNT_KEY);
    const n = raw ? parseInt(raw, 10) : 0;
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}

function readFirstLaunch(): number | null {
  try {
    const raw = window.localStorage.getItem(FIRST_LAUNCH_KEY);
    if (!raw) return null;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export function readDockLabelsMode(): DockLabelsMode {
  try {
    const raw = window.localStorage.getItem(DOCK_LABELS_MODE_KEY);
    if (raw === 'always' || raw === 'never' || raw === 'auto') return raw;
    return 'auto';
  } catch {
    return 'auto';
  }
}

function writeDockLabelsMode(mode: DockLabelsMode): void {
  try {
    window.localStorage.setItem(DOCK_LABELS_MODE_KEY, mode);
  } catch {
    // no-op
  }
  window.dispatchEvent(new Event(MODE_CHANGE_EVENT));
}

/**
 * Increments session counter + seeds first-launch timestamp exactly
 * once per mount. Separated from the visibility read so tests can
 * exercise each side independently.
 */
function useBumpSessionCount(): void {
  const bumpedRef = useRef(false);
  useEffect(() => {
    if (bumpedRef.current) return;
    bumpedRef.current = true;
    try {
      const next = readSessionCount() + 1;
      window.localStorage.setItem(SESSION_COUNT_KEY, String(next));
      if (window.localStorage.getItem(FIRST_LAUNCH_KEY) === null) {
        window.localStorage.setItem(FIRST_LAUNCH_KEY, String(Date.now()));
      }
    } catch {
      // no-op
    }
  }, []);
}

export function useDockLabels(): {
  visible: boolean;
  mode: DockLabelsMode;
  setMode: (mode: DockLabelsMode) => void;
} {
  useBumpSessionCount();
  const [mode, setModeState] = useState<DockLabelsMode>(() => readDockLabelsMode());

  useEffect(() => {
    const sync = () => setModeState(readDockLabelsMode());
    window.addEventListener('storage', sync);
    window.addEventListener(MODE_CHANGE_EVENT, sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener(MODE_CHANGE_EVENT, sync);
    };
  }, []);

  const visible = shouldShowDockLabels({
    sessionCount: readSessionCount(),
    firstLaunchAt: readFirstLaunch(),
    now: Date.now(),
    mode,
  });

  const setMode = (next: DockLabelsMode) => {
    writeDockLabelsMode(next);
    setModeState(next);
  };

  return { visible, mode, setMode };
}
