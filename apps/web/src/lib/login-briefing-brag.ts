/**
 * L-22 — richer LoginBriefing "memory bragging" copy.
 *
 * Pure helpers that turn memory stats + workspace summaries into the
 * one-line brag rendered in the briefing header. Kept out of the React
 * component so the formatting rules are testable without mounting the
 * overlay.
 *
 * Stats come from `adapter.getMemoryStats()` — frames / entities /
 * relations across personal + workspace minds — and the workspace
 * summaries already computed by the briefing's `loadBriefing()`.
 */

export interface BriefingStats {
  frames: number;
  entities: number;
  relations: number;
}

export interface BriefingWorkspaceSummary {
  lastActive?: string | null;
  pendingTasks?: readonly unknown[] | null;
}

export interface BragSummary {
  totalFrames: number;
  totalEntities: number;
  totalRelations: number;
  workspaceCount: number;
  pendingCount: number;
  /** ISO timestamp of the most recent cross-workspace activity, or null. */
  lastActiveIso: string | null;
  /** Human-readable "yesterday", "3d ago", "", etc. — empty when unknown. */
  lastActiveLabel: string;
}

/** Minimum content length the briefing considers "real" memory. */
export const MIN_BRAG_FRAME_COUNT = 0;

/**
 * Build the brag summary from adapter stats + workspace summaries.
 *
 * Uses `stats.total` when present (server-side aggregate across personal
 * + workspace), else falls back to summing personal + workspace manually
 * to stay correct when the server returns only the per-scope pieces.
 */
export function computeBragSummary(
  stats: {
    personal?: BriefingStats | null;
    workspace?: BriefingStats | null;
    total?: BriefingStats | null;
  } | null | undefined,
  summaries: readonly BriefingWorkspaceSummary[] = [],
  now: number = Date.now(),
): BragSummary {
  const personal = stats?.personal ?? { frames: 0, entities: 0, relations: 0 };
  const workspace = stats?.workspace ?? { frames: 0, entities: 0, relations: 0 };
  const total = stats?.total ?? {
    frames: personal.frames + workspace.frames,
    entities: personal.entities + workspace.entities,
    relations: personal.relations + workspace.relations,
  };

  const lastActiveIso = pickGlobalLastActive(summaries);
  const pendingCount = summaries.reduce(
    (acc, s) => acc + (Array.isArray(s.pendingTasks) ? s.pendingTasks.length : 0),
    0,
  );

  return {
    totalFrames: total.frames,
    totalEntities: total.entities,
    totalRelations: total.relations,
    workspaceCount: summaries.length,
    pendingCount,
    lastActiveIso,
    lastActiveLabel: lastActiveIso ? timeAgo(lastActiveIso, now) : '',
  };
}

/**
 * Find the most recent ISO timestamp across workspace summaries.
 * Returns null when none have a valid lastActive string.
 */
export function pickGlobalLastActive(
  summaries: readonly BriefingWorkspaceSummary[],
): string | null {
  let best: { iso: string; time: number } | null = null;
  for (const s of summaries) {
    const iso = typeof s.lastActive === 'string' ? s.lastActive.trim() : '';
    if (!iso) continue;
    const time = Date.parse(iso);
    if (!Number.isFinite(time)) continue;
    if (!best || time > best.time) {
      best = { iso, time };
    }
  }
  return best?.iso ?? null;
}

/**
 * Relative time formatter matching the rest of the briefing (matches
 * the existing in-component `timeAgo` helper so the header + per-frame
 * labels stay consistent). Pure — accepts a `now` override for tests.
 */
export function timeAgo(iso: string, now: number = Date.now()): string {
  if (!iso) return '';
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return '';
  const diffMs = now - parsed;
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  return `${weeks}w ago`;
}

/**
 * Render the single brag line that replaces the terse
 * "N memories across N workspaces" header. Example outputs:
 *
 *   "1,487 memories · 234 entities · 892 relations across 5 workspaces · active 3h ago"
 *   "42 memories across 1 workspace"  (low counts — entities hidden)
 *   "No memories yet — create a workspace to start building yours"
 */
export function formatBragLine(summary: BragSummary): string {
  if (summary.totalFrames === 0 && summary.workspaceCount === 0) {
    return 'No memories yet — create a workspace to start building yours';
  }

  const parts: string[] = [];
  parts.push(`${summary.totalFrames.toLocaleString('en-US')} ${plural('memory', summary.totalFrames)}`);

  // Hide entity/relation chips until the substrate has enough to brag
  // about — avoids "0 entities · 0 relations" cluttering a first-run header.
  if (summary.totalEntities > 0) {
    parts.push(`${summary.totalEntities.toLocaleString('en-US')} ${plural('entity', summary.totalEntities)}`);
  }
  if (summary.totalRelations > 0) {
    parts.push(`${summary.totalRelations.toLocaleString('en-US')} ${plural('relation', summary.totalRelations)}`);
  }

  let line = parts.join(' · ');
  line += ` across ${summary.workspaceCount} ${plural('workspace', summary.workspaceCount)}`;
  // FR #24/#26: suppress the "active Xago" suffix on a fresh-state user
  // (totalFrames === 0). The lastActive timestamp on a brand-new workspace
  // tracks creation time, not activity, so labels like "active 2h ago" or
  // "active 1w ago" mislead — they imply work happened that hasn't.
  if (summary.lastActiveLabel && summary.totalFrames > 0) {
    line += ` · active ${summary.lastActiveLabel}`;
  }
  return line;
}

function plural(word: string, count: number): string {
  if (count === 1) return word;
  if (word === 'memory') return 'memories';
  if (word === 'entity') return 'entities';
  return `${word}s`;
}
