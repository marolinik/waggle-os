/**
 * Dock unlock nudge decision (M-24 / ENG-3).
 *
 * Fires a one-time toast when the user's session counter reaches each
 * milestone in DOCK_NUDGE_MILESTONES. The nudge points the user at
 * dock zones they may not have explored yet — at 10 sessions we point
 * at the Ops zone, at 50 we point at Memory.
 *
 * Persistent storage contract:
 *   - waggle:session-count         (owned by useDockLabels; incremented per mount)
 *   - waggle:dock-nudge-dismissed  (JSON array of milestone numbers this helper owns)
 */

export const DOCK_NUDGE_MILESTONES = [10, 50] as const;

export interface DockNudgeCopy {
  readonly title: string;
  readonly description: string;
}

/** Toast copy keyed by milestone. Missing entries fall back to a generic string. */
export const DOCK_NUDGE_COPY: Record<number, DockNudgeCopy> = {
  10: {
    title: "You've logged 10 sessions",
    description: 'Open the Ops zone in the dock to see workflows, timelines, and scheduled jobs.',
  },
  50: {
    title: '50 sessions in — nicely done',
    description: 'If you haven\u2019t yet, try the Memory app. It\u2019s where Waggle keeps track of what matters to you.',
  },
};

/**
 * Return the next milestone that has been reached but not yet
 * dismissed, or `null` when nothing is pending. The user sees the
 * lowest pending milestone first; later milestones surface after the
 * earlier ones are dismissed.
 */
export function findPendingMilestone(
  sessionCount: number,
  dismissed: readonly number[],
): number | null {
  if (!Number.isFinite(sessionCount) || sessionCount < 0) return null;
  const dismissedSet = new Set(dismissed);
  for (const milestone of DOCK_NUDGE_MILESTONES) {
    if (sessionCount >= milestone && !dismissedSet.has(milestone)) {
      return milestone;
    }
  }
  return null;
}

/**
 * Copy for a milestone, with a defensive fallback when the milestone
 * set gains a new entry but the copy map hasn't been updated.
 */
export function copyForMilestone(milestone: number): DockNudgeCopy {
  return (
    DOCK_NUDGE_COPY[milestone] ?? {
      title: `${milestone} sessions — explore the dock`,
      description: 'New zones and apps are available — check the dock for what\u2019s there.',
    }
  );
}
