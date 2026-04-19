/**
 * Progressive disclosure for dock icon text labels (M-19 / UX-4).
 *
 * New users need the text to learn the icon vocabulary; experienced
 * users find it noisy. We show labels while the user is still "new",
 * defined as either condition holding:
 *   - fewer than 20 sessions logged on this install, OR
 *   - install age under 7 days
 *
 * The user can override via Settings:
 *   - 'always': labels stay pinned (accessibility / preference)
 *   - 'never':  labels hidden regardless of novice heuristic
 *   - 'auto':   the heuristic above (default)
 */

export type DockLabelsMode = 'auto' | 'always' | 'never';

export const DOCK_LABELS_SESSION_THRESHOLD = 20;
export const DOCK_LABELS_AGE_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;

export interface DockLabelsInput {
  /** Running count of page loads for this install. */
  sessionCount: number;
  /** Unix-ms timestamp of the first launch, or null if unknown. */
  firstLaunchAt: number | null;
  /** Current time for age comparison — injected so tests stay deterministic. */
  now: number;
  /** User-chosen override from Settings. */
  mode: DockLabelsMode;
}

/**
 * Decide whether dock icon labels should render.
 * Pure function: no side effects, injectable `now` for deterministic tests.
 */
export function shouldShowDockLabels(input: DockLabelsInput): boolean {
  switch (input.mode) {
    case 'always':
      return true;
    case 'never':
      return false;
    case 'auto': {
      if (input.sessionCount < DOCK_LABELS_SESSION_THRESHOLD) return true;
      if (input.firstLaunchAt !== null) {
        const ageMs = input.now - input.firstLaunchAt;
        if (ageMs < DOCK_LABELS_AGE_THRESHOLD_MS) return true;
      }
      return false;
    }
  }
}
