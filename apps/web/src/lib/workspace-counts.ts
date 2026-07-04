/**
 * W2B — one truth for workspace counts + the dev-noise predicate.
 *
 * The live store accumulates dev/test artefacts (ai-os-audit-*, ai-os-flow-*,
 * StressTest-*, E2E-Audit-*) alongside real user workspaces. Different surfaces
 * counted different subsets ("All 55" grid vs "4 waiting" home vs "~14" switcher
 * vs "54 workspaces" notification), so the numbers visibly disagreed.
 *
 * This module centralises the name-based noise filter (previously duplicated in
 * WorkspaceSwitcher + LoginBriefing) and the count selector. Name-based
 * filtering is UI-layer defense only — the grid stays the unfiltered "full
 * shelf"; switcher/home use the visible count.
 */

/** Workspace-name patterns that identify dev/test artefacts, not user work. */
export const DEV_NOISE_WORKSPACE_PATTERNS: ReadonlyArray<RegExp> = [
  /^E2E-Audit-\d+$/,
  /^test-/i,
  /^smoke-/i,
  /^audit-/i,
  /^ai-os-(audit|flow)-/i,
  /^StressTest-/i,
];

export function isDevNoiseWorkspace(name: string): boolean {
  return DEV_NOISE_WORKSPACE_PATTERNS.some(p => p.test(name));
}

interface CountableWorkspace {
  name: string;
  status?: 'active' | 'paused' | 'archived';
}

export interface WorkspaceCounts {
  /** Every workspace on the shelf (the grid's honest total). */
  total: number;
  /** Non-archived, non-noise — what "N workspaces waiting" should mean. */
  visible: number;
  /** Archived workspaces (regardless of noise). */
  archived: number;
}

/** Recency timestamp (ms) for ordering; missing/invalid → -Infinity (sorts last). */
export function workspaceRecencyMs(ws: { lastActive?: string; updatedAt?: string }): number {
  const raw = ws.lastActive ?? ws.updatedAt;
  if (!raw) return -Infinity;
  const t = Date.parse(raw);
  return Number.isNaN(t) ? -Infinity : t;
}

/** Descending recency comparator; equal (incl. both-missing) preserves order. */
export function compareWorkspaceRecency(
  a: { lastActive?: string; updatedAt?: string },
  b: { lastActive?: string; updatedAt?: string },
): number {
  const ra = workspaceRecencyMs(a);
  const rb = workspaceRecencyMs(b);
  return ra === rb ? 0 : rb - ra;
}

export function workspaceCounts(workspaces: readonly CountableWorkspace[]): WorkspaceCounts {
  let visible = 0;
  let archived = 0;
  for (const w of workspaces) {
    if (w.status === 'archived') {
      archived += 1;
      continue;
    }
    if (!isDevNoiseWorkspace(w.name)) visible += 1;
  }
  return { total: workspaces.length, visible, archived };
}
