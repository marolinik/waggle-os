/**
 * Dock unlock nudge driver (M-24 / ENG-3).
 *
 * Reads the session counter written by useDockLabels, plus a
 * persisted list of dismissed milestones, and fires the user-supplied
 * `onNudge` callback exactly once per page load with the pending
 * milestone. Guards against StrictMode double-effects via a ref.
 */
import { useEffect, useRef } from 'react';
import {
  copyForMilestone,
  findPendingMilestone,
  type DockNudgeCopy,
} from '@/lib/dock-nudge';
import { SESSION_COUNT_KEY } from './useDockLabels';

export const DOCK_NUDGE_DISMISSED_KEY = 'waggle:dock-nudge-dismissed';

function readSessionCount(): number {
  try {
    const raw = window.localStorage.getItem(SESSION_COUNT_KEY);
    const n = raw ? parseInt(raw, 10) : 0;
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}

export function readDismissedMilestones(): number[] {
  try {
    const raw = window.localStorage.getItem(DOCK_NUDGE_DISMISSED_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((n: unknown): n is number => typeof n === 'number' && Number.isFinite(n));
  } catch {
    return [];
  }
}

function writeDismissedMilestones(milestones: readonly number[]): void {
  try {
    window.localStorage.setItem(DOCK_NUDGE_DISMISSED_KEY, JSON.stringify([...milestones]));
  } catch {
    // no-op
  }
}

export interface UseDockNudgeOptions {
  /**
   * Called when a pending milestone is found. Receives the milestone
   * number and the copy to render. The callback is expected to show a
   * toast (or similar) and return a function that marks the milestone
   * as dismissed when the user closes the toast. If no teardown is
   * needed, the milestone is marked dismissed immediately after the
   * callback returns (so the nudge doesn't re-fire on next mount).
   */
  onNudge: (milestone: number, copy: DockNudgeCopy) => void;
}

export function useDockNudge({ onNudge }: UseDockNudgeOptions): void {
  const firedRef = useRef(false);
  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;

    const sessionCount = readSessionCount();
    const dismissed = readDismissedMilestones();
    const milestone = findPendingMilestone(sessionCount, dismissed);
    if (milestone == null) return;

    onNudge(milestone, copyForMilestone(milestone));

    // Mark dismissed immediately — we don't want the same milestone to
    // reappear across page reloads. If we later want "dismiss on user
    // action" semantics instead, gate on a user-supplied callback.
    if (!dismissed.includes(milestone)) {
      writeDismissedMilestones([...dismissed, milestone]);
    }
  }, [onNudge]);
}
