/**
 * Home Cockpit routes (UX-Refactor Phase 1, gap card S01).
 *
 * Cross-workspace, personal-only daily briefing + overnight summary. This is a
 * pure server-side aggregation layer: it promotes the N+1 client fan-out that
 * `LoginBriefing.tsx` used to do into the sidecar (PRD §20.4 — do not duplicate
 * backend state calculation in the frontend) and reuses the existing
 * per-workspace builders below. NO new store, NO schema migration.
 *
 * Substrate functions reused (grounded paths):
 *  - `buildWorkspaceState()` — `packages/server/src/local/workspace-state.ts:234`
 *    (typed WorkspaceState with `nextActions`, pending/blocked/recentDecisions).
 *  - `buildTimeAwareGreeting()` / `buildUpcomingSchedules()` —
 *    `packages/server/src/local/routes/workspace-context.ts:119,169`.
 *  - `IdentityLayer` — `@waggle/core` (mind/identity.ts), read off the personal
 *    mind for the user's name (B8: Home greets by name via existing identity).
 *  - `server.workspaceManager` (list/get/getMindPath) + `server.agentState`
 *    (activateWorkspaceMind) + `server.cronStore` (list/getExecutionHistory) +
 *    `server.multiMind.personal` + `getAuditDb()` (events.ts) — sidecar decorators.
 *
 * Founder decisions honored: A2 (Home Cockpit personal-only v1 — team/shared
 * workspaces are excluded from the cross-workspace fan-out; team-overnight rows
 * gate elsewhere). Response shapes match `docs/ux-refactor/_phase1-contract.md`
 * §2 (HomeBriefing / OvernightSummary — bare objects, no envelope).
 */

import type { FastifyPluginAsync } from 'fastify';
import { FrameStore, IdentityLayer } from '@waggle/core';
import { normalizeToMemory } from './memory-center.js';
import { buildWorkspaceState } from '../workspace-state.js';
import {
  buildTimeAwareGreeting,
  buildUpcomingSchedules,
  type CronScheduleLike,
} from './workspace-context.js';
import { getAuditDb } from './events.js';
import { createLogger } from '../logger.js';

const log = createLogger('home');

// ── Response view-models (mirror `_phase1-contract.md` §2) ──────────────

export interface RecentWorkspaceCard {
  id: string;
  name: string;
  group: string;
  summary?: string;
  lastActive: string;
  pendingCount: number;
  continueSessionId?: string;
}

interface SuggestedAction {
  label: string;
  workspaceId: string;
  sessionId?: string;
  kind: string;
}

interface UpNextItem {
  id: string;
  label: string;
  workspaceId?: string;
  at?: string;
  kind: 'event' | 'task' | 'schedule';
}

interface HomeBriefing {
  greeting: string;
  userName?: string;
  date: string;
  recentWorkspaces: RecentWorkspaceCard[];
  suggestedActions: SuggestedAction[];
  upNext: UpNextItem[];
  activeModels?: string[];
  isFirstRun: boolean;
  /** J08 (D6): personal-mind memories with status 'unreviewed' (C33 imports). */
  needsReviewCount: number;
}

interface OvernightFailure {
  id: string;
  label: string;
  automationId?: string;
  error: string;
  at: string;
}

interface OvernightSummary {
  consolidated: number;
  artifactsCreated: number;
  automationsCompleted: number;
  failures: OvernightFailure[];
  window?: { from: string; to: string };
}

// ── Tuning constants ────────────────────────────────────────────────────

/** Max workspaces to fan `buildWorkspaceState()` over per briefing (cost guard). */
const MAX_RANKED_WORKSPACES = 8;
/** Max ranked workspace cards returned. */
const MAX_RECENT_CARDS = 6;
/** Max aggregated suggested actions returned. */
const MAX_SUGGESTED_ACTIONS = 6;
/** Suggested actions only come from workspaces touched within this window.
 *  Stale workspaces resurface month-old raw prompts ("Resume: Reply with the
 *  literal string PHASE_B_OK…") as today's recommendations — one junk
 *  suggestion poisons trust in all of them. */
const SUGGESTION_MAX_IDLE_DAYS = 30;
/** Max aggregated up-next items returned. */
const MAX_UP_NEXT = 8;
/** Default overnight window in hours when `?since` is absent. */
const OVERNIGHT_DEFAULT_HOURS = 24;
/** Per-schedule cron-history rows to scan for the overnight window. */
const CRON_HISTORY_SCAN = 50;
/** J08 needs-review scan bound — matches the 200-frame window the Memory
 *  Center list itself fetches (MemoryCenterTab limit=200), so the Home count
 *  always agrees with what the deep-linked "Needs review" view shows. */
const NEEDS_REVIEW_SCAN = 200;
/** Priority boost: each pending/blocked item ranks a workspace as if touched
 *  this much more recently (PRD §12.1 "ranked by recency AND priority"). */
const PENDING_BOOST_MS = 3_600_000; // 1 hour per pending item
/** Cap on the pending-item boost so attention debt breaks near-ties without
 *  letting a stale workspace leapfrog genuinely active ones. */
const PENDING_BOOST_CAP = 5;

// ── Helpers ──────────────────────────────────────────────────────────────

interface RankableWorkspace {
  id: string;
  name: string;
  group: string;
  rankTs: number;
  lastActiveIso: string;
}

/**
 * Resolve the recency timestamp used to rank a workspace. Prefers the persisted
 * `lastActiveAt` (Phase-0 write-stamp), then `updatedAt`, then `created`.
 */
function resolveRankTimestamp(ws: {
  lastActiveAt?: string;
  updatedAt?: string;
  created?: string;
}): { ts: number; iso: string } {
  const iso = ws.lastActiveAt ?? ws.updatedAt ?? ws.created ?? '';
  const parsed = iso ? Date.parse(iso) : NaN;
  return { ts: Number.isFinite(parsed) ? parsed : 0, iso };
}

/**
 * Inject the user's name into the first clause of a greeting (B8 / PRD §12.1
 * "greeting with user name"). The greeting strings are fixed sentences like
 * "Good morning. Here's your day:" or "Welcome — anything you discuss here
 * will be remembered." — the name splices in before the first sentence break:
 * "Good morning, Marko. Here's your day:". Unknown shapes pass through.
 * Exported for unit tests.
 */
export function personalizeGreeting(greeting: string, name?: string): string {
  if (!name) return greeting;
  const m = greeting.match(/^([^.!—]+?)([.!]| —)/);
  if (!m) return greeting;
  return `${m[1]}, ${name}${m[2]}${greeting.slice(m[0].length)}`;
}

/**
 * PRD §12.1 "ranked by recency AND priority": order cards by recency with a
 * bounded pending-item boost — each pending/blocked item buys up to
 * PENDING_BOOST_CAP hours of effective recency, so attention debt breaks
 * near-ties without letting a stale workspace leapfrog genuinely active ones.
 * Exported for unit tests.
 */
export function applyPriorityRanking(
  rankedCards: ReadonlyArray<{ card: RecentWorkspaceCard; rankTs: number }>,
): RecentWorkspaceCard[] {
  const boostedTs = (r: { card: RecentWorkspaceCard; rankTs: number }): number =>
    r.rankTs + Math.min(r.card.pendingCount, PENDING_BOOST_CAP) * PENDING_BOOST_MS;
  return [...rankedCards]
    .sort((a, b) => boostedTs(b) - boostedTs(a))
    .slice(0, MAX_RECENT_CARDS)
    .map((r) => r.card);
}

/**
 * Aggregate consolidation + artifact counts from the audit-event store over a
 * time window. `memory_write` events proxy "memories consolidated"; file-write
 * `tool_call` events proxy "artifacts created". Degrades to zero if the audit DB
 * is unavailable rather than failing the whole summary.
 */
function readAuditCounts(
  dataDir: string,
  fromIso: string,
  toIso: string,
): { consolidated: number; artifactsCreated: number } {
  try {
    const db = getAuditDb(dataDir);
    const consolidated = (
      db
        .prepare(
          `SELECT COUNT(*) AS cnt FROM audit_events
           WHERE event_type = 'memory_write' AND timestamp >= ? AND timestamp <= ?`,
        )
        .get(fromIso, toIso) as { cnt: number }
    ).cnt;
    // Agent tool calls record the raw tool name into `tool_name` (chat.ts:1150);
    // the file-producing set is write_file / edit_file / generate_docx
    // (chat.ts:1181-1185 fileTools map). The manual workspace write endpoint
    // additionally stamps 'file_write' (workspaces.ts:1087). Cover them all.
    const artifactsCreated = (
      db
        .prepare(
          `SELECT COUNT(*) AS cnt FROM audit_events
           WHERE event_type = 'tool_call'
             AND tool_name IN ('write_file', 'edit_file', 'generate_docx', 'file_write')
             AND timestamp >= ? AND timestamp <= ?`,
        )
        .get(fromIso, toIso) as { cnt: number }
    ).cnt;
    return { consolidated, artifactsCreated };
  } catch (err) {
    log.warn('overnight: audit-event read failed', (err as Error).message);
    return { consolidated: 0, artifactsCreated: 0 };
  }
}

export const homeRoutes: FastifyPluginAsync = async (server) => {
  /**
   * Personal-only (A2) ranked list of the user's own workspaces. Team/shared
   * workspaces (those carrying a `teamId`) and archived workspaces are excluded
   * from the cross-workspace fan-out — Home is the personal landing surface.
   */
  function rankPersonalWorkspaces(): RankableWorkspace[] {
    let workspaces: ReturnType<typeof server.workspaceManager.list>;
    try {
      workspaces = server.workspaceManager.list();
    } catch (err) {
      log.warn('briefing: workspace list failed', (err as Error).message);
      return [];
    }

    return workspaces
      .filter((ws) => !ws.teamId && ws.status !== 'archived')
      .map((ws) => {
        const { ts, iso } = resolveRankTimestamp(ws);
        return {
          id: ws.id,
          name: ws.name,
          group: ws.group,
          rankTs: ts,
          lastActiveIso: iso,
        };
      })
      .sort((a, b) => b.rankTs - a.rankTs);
  }

  // GET /api/home/briefing — cross-workspace ranked daily briefing (PRD §12.1)
  server.get('/api/home/briefing', async () => {
    const now = new Date();

    // ── Greeting + identity name (B8) ─────────────────────────────
    let userName: string | undefined;
    try {
      const layer = new IdentityLayer(server.multiMind.personal);
      if (layer.exists()) {
        const name = layer.get().name?.trim();
        if (name) userName = name;
      }
    } catch (err) {
      log.warn('briefing: identity read failed', (err as Error).message);
    }

    const ranked = rankPersonalWorkspaces();

    // ── Per-workspace state for the top-ranked workspaces ─────────
    // Cards are collected with their recency timestamp and re-ranked after the
    // loop (recency + bounded pending-item boost — PRD §12.1 "recency AND
    // priority"), so a workspace carrying blocked work can outrank a fresher
    // empty one within the boost window.
    const rankedCards: Array<{ card: RecentWorkspaceCard; rankTs: number }> = [];
    const suggestedActions: SuggestedAction[] = [];
    const upNext: UpNextItem[] = [];
    // Global schedules pass buildUpcomingSchedules' filter for EVERY workspace,
    // so dedup on label across the whole aggregation — the same system job must
    // surface once, not once per workspace.
    const seenUpNextLabels = new Set<string>();
    let anyMemory = false;

    // Cron schedules drive the schedule-flavored up-next items.
    let cronSchedules: CronScheduleLike[] = [];
    try {
      cronSchedules = server.cronStore.list();
    } catch (err) {
      log.warn('briefing: cron list failed', (err as Error).message);
    }

    for (const ws of ranked.slice(0, MAX_RANKED_WORKSPACES)) {
      let pendingCount = 0;
      let nextActions: string[] = [];
      let summary: string | undefined;

      try {
        const state = buildWorkspaceState({
          dataDir: server.localConfig.dataDir,
          workspaceId: ws.id,
          wsManager: server.workspaceManager,
          activateWorkspaceMind: server.agentState.activateWorkspaceMind,
        });
        if (state) {
          anyMemory = true;
          pendingCount = state.pending.length + state.blocked.length;
          nextActions = state.nextActions;
          if (state.recentDecisions.length > 0) {
            summary = state.recentDecisions[0].content;
          }
        }
      } catch (err) {
        // Non-blocking — a single unreadable workspace must not fail the briefing.
        log.warn(`briefing: state build failed for ${ws.id}`, (err as Error).message);
      }

      rankedCards.push({
        rankTs: ws.rankTs,
        card: {
          id: ws.id,
          name: ws.name,
          group: ws.group,
          ...(summary ? { summary } : {}),
          lastActive: ws.lastActiveIso || now.toISOString(),
          pendingCount,
        },
      });

      // Aggregate next-actions into cross-workspace suggested actions —
      // recent workspaces only (see SUGGESTION_MAX_IDLE_DAYS).
      const idleMs = ws.lastActiveIso ? now.getTime() - Date.parse(ws.lastActiveIso) : Infinity;
      const isRecent = idleMs <= SUGGESTION_MAX_IDLE_DAYS * 86_400_000;
      if (isRecent) {
        for (const action of nextActions) {
          if (suggestedActions.length >= MAX_SUGGESTED_ACTIONS) break;
          suggestedActions.push({
            label: action,
            workspaceId: ws.id,
            kind: 'next-action',
          });
        }
      }

      // Upcoming cron schedules scoped to this workspace become up-next items.
      const schedules = buildUpcomingSchedules(cronSchedules, ws.id);
      for (const label of schedules) {
        if (upNext.length >= MAX_UP_NEXT) break;
        if (seenUpNextLabels.has(label)) continue;
        upNext.push({
          id: `schedule:${ws.id}:${label}`,
          label,
          workspaceId: ws.id,
          kind: 'schedule',
        });
        seenUpNextLabels.add(label);
      }
    }

    // Global (workspace-agnostic) schedules fill any remaining up-next slots.
    // A global schedule can surface both as schedule:<wsId>:<label> (above) and
    // schedule:global:<label> (here) — de-dup on label so it appears once.
    if (upNext.length < MAX_UP_NEXT) {
      for (const label of buildUpcomingSchedules(cronSchedules)) {
        if (upNext.length >= MAX_UP_NEXT) break;
        if (seenUpNextLabels.has(label)) continue;
        upNext.push({ id: `schedule:global:${label}`, label, kind: 'schedule' });
        seenUpNextLabels.add(label);
      }
    }

    // ── J08 (D6): personal-mind memories awaiting review ───────────
    // Personal-only by design: harvest (C33) stamps status:'unreviewed' on
    // personal-mind imports, and the deep-linked Memory Center "Needs review"
    // view is personal-mind-only — a cross-mind count would not match it.
    let needsReviewCount = 0;
    try {
      for (const f of new FrameStore(server.multiMind.personal).getRecent(NEEDS_REVIEW_SCAN)) {
        if (normalizeToMemory(f, 'personal').status === 'unreviewed') needsReviewCount++;
      }
    } catch (err) {
      log.warn('briefing: needs-review scan failed', (err as Error).message);
    }

    const recentWorkspaces = applyPriorityRanking(rankedCards);

    const greeting = personalizeGreeting(
      buildTimeAwareGreeting(
        ranked[0]?.lastActiveIso ?? null,
        { frameCount: anyMemory ? 1 : 0 },
      ),
      userName,
    );

    const briefing: HomeBriefing = {
      greeting,
      ...(userName ? { userName } : {}),
      date: now.toISOString(),
      recentWorkspaces,
      suggestedActions,
      upNext,
      // True first-run = no workspaces at all, distinct from has-workspaces-but-
      // no-memory (the greeting heuristic above already keys off anyMemory).
      isFirstRun: ranked.length === 0,
      needsReviewCount,
    };

    return briefing;
  });

  // GET /api/home/overnight — since-last-login summary (PRD §12.1)
  server.get<{ Querystring: { since?: string } }>(
    '/api/home/overnight',
    async (request) => {
      const now = new Date();
      const sinceRaw = request.query.since;
      const sinceParsed = sinceRaw ? Date.parse(sinceRaw) : NaN;
      const from = Number.isFinite(sinceParsed)
        ? new Date(sinceParsed)
        : new Date(now.getTime() - OVERNIGHT_DEFAULT_HOURS * 3600 * 1000);
      const fromIso = from.toISOString();
      const toIso = now.toISOString();

      // ── Consolidation + artifact counts from the audit store ─────
      const { consolidated, artifactsCreated } = readAuditCounts(
        server.localConfig.dataDir,
        fromIso,
        toIso,
      );

      // ── Automation runs + failures from cron execution history ───
      let automationsCompleted = 0;
      const failures: OvernightFailure[] = [];
      try {
        const schedules = server.cronStore.list();
        for (const schedule of schedules) {
          let history;
          try {
            history = server.cronStore.getExecutionHistory(
              schedule.id,
              CRON_HISTORY_SCAN,
            );
          } catch (err) {
            log.warn(
              `overnight: history read failed for schedule ${schedule.id}`,
              (err as Error).message,
            );
            continue;
          }
          for (const row of history) {
            // `executed_at` is SQLite datetime('now') format ("2026-06-09
            // 14:23:00", space-separated UTC, no 'Z'), NOT a Date.toISOString().
            // Lexicographic comparison against fromIso/toIso would be wrong, so
            // normalize to epoch millis before the window check.
            const execMs = new Date(
              row.executed_at.replace(' ', 'T') + 'Z',
            ).getTime();
            // History is newest-first; once we pass the window we can stop.
            if (Number.isFinite(execMs) && execMs < from.getTime()) break;
            if (Number.isFinite(execMs) && execMs > now.getTime()) continue;
            if (row.success === 1) {
              automationsCompleted += 1;
            } else {
              failures.push({
                id: `cron-exec:${row.id}`,
                label: row.schedule_name,
                automationId: String(schedule.id),
                error: row.error ?? 'Automation failed',
                at: row.executed_at,
              });
            }
          }
        }
      } catch (err) {
        // Degrade gracefully — cron store absent or unreadable.
        log.warn('overnight: cron store unavailable', (err as Error).message);
      }

      const summary: OvernightSummary = {
        consolidated,
        artifactsCreated,
        automationsCompleted,
        failures,
        window: { from: fromIso, to: toIso },
      };

      return summary;
    },
  );
};
