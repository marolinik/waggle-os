/**
 * briefing-source — the ONE briefing truth (Path-to-9 Pillar 2.3 / Lane H item 3).
 *
 * The "catch you up" data (recall highlights + workspace summaries + brag counts)
 * used to live ONLY inside LoginBriefing, so the home hero and the modal derived
 * their catch-up facts independently — the number-drift bug class ("2 workspaces"
 * in the modal vs "6 workspaces waiting" in the hero). This module is the single
 * fetch + shaping + count formula BOTH surfaces consume, so they can never state
 * two truths about one store.
 *
 * The fetch/shape/prefetch logic is the exact code the LoginBriefing component
 * used to own inline (moved, not changed) — see the git history of
 * overlays/LoginBriefing.tsx. HomeCockpit (hero recall strip) and LoginBriefing
 * (the ≥7-day modal) both import from here.
 */
import { adapter } from '@/lib/adapter';
import type { Workspace } from '@/lib/types';
import { selectBriefingHighlights } from '@/lib/briefing-highlights';
import { isDevNoiseWorkspace, workspaceCounts } from '@/lib/workspace-counts';
import {
  computeBragSummary,
  type BragSummary,
} from '@/lib/login-briefing-brag';

export interface WorkspaceSummary {
  id: string;
  name: string;
  group: string;
  memoryCount: number;
  sessionCount: number;
  lastActive: string;
  summary?: string;
  pendingTasks?: string[];
}

export interface MemoryHighlight {
  content: string;
  workspace?: string;
  timestamp: string;
}

export interface BriefingData {
  highlights: MemoryHighlight[];
  summaries: WorkspaceSummary[];
  brag: BragSummary | null;
}

/**
 * The modal (full "Catching you up" overlay) is reserved for long absences —
 * the everyday catch-up is the home hero's recall strip (Lane H item 4, the
 * "double catch-up collapse"). N=7, founder-decided (path-to-9 v3 §Pillar 2.3c).
 */
export const BRIEFING_ABSENCE_DAYS = 7;

export function truncateHighlight(content: string): string {
  // Plain text only — highlights render as text nodes, so markdown tokens
  // (**bold**, # headings, `code`) would show literally.
  const firstLine = content.split('\n')[0].trim()
    .replace(/^#{1,3}\s+/, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/`(.+?)`/g, '$1');
  return firstLine.length > 120 ? firstLine.slice(0, 117) + '...' : firstLine;
}

// Workspace names matching dev/test-artefact patterns leaked into the user's
// real store and should not surface in the briefing. Filtered at the UI layer
// (defensive), not deleted — W2B consolidated predicate.
const isTestWorkspace = isDevNoiseWorkspace;

// The server emits a brochure default summary ("Everything you discuss in
// {name} stays in context …") whenever a workspace has no real generated
// summary yet. That is template copy, not the user's data — it must never
// render as a summary. Matched on the name-invariant tail.
export const CANNED_SUMMARY_TAIL =
  'stays in context — decisions, research, and progress are remembered across sessions';

export function isCannedWorkspaceSummary(summary?: string): boolean {
  return typeof summary === 'string' && summary.includes(CANNED_SUMMARY_TAIL);
}

/**
 * The full briefing fetch + shaping. Throws only on a hard failure
 * (getWorkspaces reject) so the caller renders its error/degraded surface; the
 * soft sources (memory search / stats) already degrade to []/null inline.
 * Byte-for-byte the logic LoginBriefing used to run inline.
 */
export async function fetchBriefingData(): Promise<BriefingData> {
  const [workspaces, frames, stats] = await Promise.all([
    adapter.getWorkspaces(),
    adapter.searchMemory('important decision project plan', 'global').catch(() => []),
    adapter.getMemoryStats().catch(() => null),
  ]);

  // L-22: rank by importance desc, break ties by recency. Concrete content only
  // (≥20 chars), living frames only — deprecated/archived and extraction echoes
  // are filtered inside the ranker.
  const ranked = selectBriefingHighlights(
    (frames as Array<{ content?: string; importance?: number; timestamp?: string; metadata?: Record<string, unknown> }>).map((f) => ({
      content: f.content,
      importance: f.importance,
      timestamp: f.timestamp,
      status: typeof f.metadata?.status === 'string' ? f.metadata.status : undefined,
    })),
  );
  const highlights: MemoryHighlight[] = ranked.map((f) => ({
    content: truncateHighlight(f.content ?? ''),
    timestamp: (typeof f.timestamp === 'string' ? f.timestamp : '') ?? '',
  }));

  // Workspace summaries — show all, not just ones with content. Drop E2E/test
  // workspaces that leaked into the real store so the briefing surfaces only
  // user work.
  const sorted = workspaces
    .filter((ws: Workspace) => !isTestWorkspace(ws.name))
    .slice(0, 5);

  const contextPromises = sorted.map(async (ws: Workspace): Promise<WorkspaceSummary> => {
    try {
      const ctx = await adapter.getWorkspaceContext(ws.id);
      return {
        id: ws.id,
        name: ws.name,
        group: ws.group ?? 'Personal',
        memoryCount: ctx.stats?.memoryCount ?? ctx.memoryCount ?? 0,
        sessionCount: ctx.stats?.sessionCount ?? ctx.sessionCount ?? 0,
        // USER activity from the workspace store — machine cron writes are not
        // "active" (ws.lastActive, not ctx.lastActive).
        lastActive: ws.lastActive ?? '',
        summary: ctx.summary,
        pendingTasks: ctx.pendingTasks,
      };
    } catch {
      return {
        id: ws.id,
        name: ws.name,
        group: ws.group ?? 'Personal',
        memoryCount: 0,
        sessionCount: 0,
        lastActive: '',
      };
    }
  });

  const summaries = await Promise.all(contextPromises);
  // Most recent first — a two-month-stale workspace above yesterday's work
  // contradicted the Home grid's recency ordering.
  summaries.sort((a, b) => Date.parse(b.lastActive || '0') - Date.parse(a.lastActive || '0'));

  // Numbers reconciliation (Wave U Lane B item 2): the header's workspace count
  // must equal Home's hero ("N workspaces waiting"). Both read the SAME canonical
  // visible count (non-archived, non-dev-noise) from workspaceCounts(), so the
  // modal and the hero it overlays can never state two totals for one store.
  const brag = computeBragSummary(stats, summaries);
  return {
    highlights,
    summaries,
    brag: { ...brag, workspaceCount: workspaceCounts(workspaces).visible },
  };
}

// Prefetch cache: a single in-flight/settled briefing promise the BootScreen
// warms via prefetchBriefing(). takeBriefingData() consumes it ONCE, then falls
// back to a fresh fetch — so retries/revalidation always re-fetch, and a direct
// consumer with no prefetch (unit tests) is unaffected. A failed prefetch is
// dropped so the consumer's own load fetches fresh. Consume-once (not a shared
// promise) keeps every consumer independent, so no cross-consumer/cross-test
// state can leak.
interface PrefetchedBriefing {
  profileId?: string;
  promise: Promise<BriefingData>;
}

let prefetchedBriefing: PrefetchedBriefing | null = null;

export function prefetchBriefing(profileId?: string): void {
  // An unbound prefetch cannot be proven to belong to the profile that later
  // consumes it. Fail closed until the caller can supply the server identity.
  if (!profileId) return;
  if (prefetchedBriefing && prefetchedBriefing.profileId === profileId) return;
  const entry: PrefetchedBriefing = {
    profileId,
    promise: fetchBriefingData(),
  };
  prefetchedBriefing = entry;
  entry.promise.catch(() => {
    if (prefetchedBriefing === entry) prefetchedBriefing = null;
  });
}

export function takeBriefingData(profileId?: string): Promise<BriefingData> {
  if (!profileId) {
    prefetchedBriefing = null;
    return fetchBriefingData();
  }
  if (prefetchedBriefing) {
    const entry = prefetchedBriefing;
    prefetchedBriefing = null;
    if (entry.profileId === profileId) return entry.promise;
  }
  return fetchBriefingData();
}

/** Test-only: drop the prefetch so module state can't leak across tests. */
export function resetBriefingSource(): void {
  prefetchedBriefing = null;
}

/**
 * Days since the user was last active, computed from the SAME workspace
 * `lastActive` stream the hero greeting and briefing summaries read (user
 * activity, not machine cron writes). Returns 0 when no valid activity exists
 * (a brand-new / no-activity account is never treated as a long absence — the
 * hero owns first-run, the modal stays closed). Pure; `now` overridable.
 */
export function computeAwayDays(
  workspaces: ReadonlyArray<{ lastActive?: string }>,
  now: number = Date.now(),
): number {
  let mostRecent = -Infinity;
  for (const ws of workspaces) {
    const raw = ws.lastActive;
    if (!raw) continue;
    const ms = Date.parse(raw);
    if (Number.isFinite(ms) && ms > mostRecent) mostRecent = ms;
  }
  if (!Number.isFinite(mostRecent)) return 0;
  const days = (now - mostRecent) / 86_400_000;
  return days > 0 ? days : 0;
}
