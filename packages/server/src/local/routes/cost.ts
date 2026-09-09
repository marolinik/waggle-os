/**
 * Cost Dashboard REST API Routes — token usage, cost estimates, budget alerts.
 *
 * Endpoints:
 *   GET /api/cost/summary      — total tokens, estimated cost, daily/weekly breakdown
 *   GET /api/cost/by-workspace — per-workspace token usage breakdown
 *
 * Data source: in-memory CostTracker (populated by chat route on each agent turn).
 * All cost values are estimates based on published model pricing.
 *
 * Part of PM-4 — Agent Cost Dashboard.
 */

import type { FastifyPluginAsync } from 'fastify';
import { requireTier } from '../../middleware/assert-tier.js';

// ── Types (inline to avoid cross-package resolution issues in worktrees) ──

interface UsageEntryLike {
  model: string;
  input: number;
  output: number;
  timestamp: string;
  workspaceId?: string;
  billingClass?: 'priced' | 'free';
  fixedCostUsd?: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────

/** Get the start of a given day (midnight UTC). */
function startOfDayUTC(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Get all dates for the last N days (inclusive of today), as ISO date strings. */
function lastNDays(n: number): string[] {
  const days: string[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    days.push(startOfDayUTC(d));
  }
  return days;
}

/** Filter entries to those within the last N days. */
function filterByDays(entries: UsageEntryLike[], days: number): UsageEntryLike[] {
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - days);
  cutoff.setUTCHours(0, 0, 0, 0);
  return entries.filter(e => new Date(e.timestamp) >= cutoff);
}

// ── Route Plugin ─────────────────────────────────────────────────────────

export const costRoutes: FastifyPluginAsync = async (server) => {
  const { costTracker } = server.agentState;
  let persistedTraceBoundaryId = 0;
  try {
    persistedTraceBoundaryId = server.traceStore?.getLatestId() ?? 0;
  } catch (error) {
    server.log.warn({ err: error }, 'Persisted cost boundary unavailable');
  }

  /**
   * Get usage entries from the cost tracker.
   * Uses getUsageEntries() if available (enhanced CostTracker),
   * otherwise returns empty array (base CostTracker has no entry access).
   */
  function getEntries(): UsageEntryLike[] {
    if (typeof costTracker.getUsageEntries === 'function') {
      return [...costTracker.getUsageEntries()];
    }
    return [];
  }

  /** Calculate cost with the same billing policy used by the spend ledger. */
  function calcCost(entry: UsageEntryLike): number {
    return costTracker.calculateUsageCost(entry);
  }

  // GET /api/cost/summary — total tokens, estimated cost, daily breakdown.
  // Intentionally FREE for all tiers (P22): it powers the personal Telemetry
  // dev-mode cost/budget view. The TEAM cost-visibility surface is the separate
  // /api/cost/by-workspace + /api/costs alias (both requireTier('TEAMS')).
  server.get<{
    Querystring: { days?: string };
  }>('/api/cost/summary', async (request) => {
    const entries = getEntries();
    const stats = costTracker.getStats();
    const daysParam = Math.min(parseInt(request.query.days ?? '7', 10) || 7, 90);

    // Today's usage
    const todayStr = startOfDayUTC(new Date());
    const todayEntries = entries.filter(e => e.timestamp.startsWith(todayStr));
    let todayInput = 0, todayOutput = 0, todayCost = 0;
    for (const e of todayEntries) {
      todayInput += e.input;
      todayOutput += e.output;
      todayCost += calcCost(e);
    }
    if (!costTracker.hasDailyCarryover(todayStr)) {
      try {
        const persisted = server.traceStore?.getTotalCostSince(
          `${todayStr}T00:00:00.000Z`,
          persistedTraceBoundaryId,
        ) ?? 0;
        costTracker.initializeDailyCarryover(todayStr, persisted);
      } catch (error) {
        server.log.warn({ err: error }, 'Persisted daily cost unavailable');
      }
    }
    const trackedTodayCost = costTracker.getDailyTotal();

    // Daily breakdown for the last N days
    const dayKeys = lastNDays(daysParam);
    const daily: Array<{ date: string; inputTokens: number; outputTokens: number; cost: number; turns: number }> = [];
    const recentEntries = filterByDays(entries, daysParam);

    // Group by day
    const byDay = new Map<string, { input: number; output: number; cost: number; turns: number }>();
    for (const key of dayKeys) {
      byDay.set(key, { input: 0, output: 0, cost: 0, turns: 0 });
    }
    for (const e of recentEntries) {
      const day = e.timestamp.slice(0, 10);
      const bucket = byDay.get(day);
      if (bucket) {
        bucket.input += e.input;
        bucket.output += e.output;
        bucket.cost += calcCost(e);
        bucket.turns += 1;
      }
    }
    for (const [date, data] of byDay) {
      daily.push({
        date,
        inputTokens: data.input,
        outputTokens: data.output,
        cost: Math.round(data.cost * 10000) / 10000,
        turns: data.turns,
      });
    }

    // Weekly total (last 7 days)
    const weekEntries = filterByDays(entries, 7);
    let weekInput = 0, weekOutput = 0, weekCost = 0;
    for (const e of weekEntries) {
      weekInput += e.input;
      weekOutput += e.output;
      weekCost += calcCost(e);
    }

    // Budget alert (read from settings if available)
    let dailyBudget: number | null = null;
    let budgetStatus: 'ok' | 'warning' | 'exceeded' = 'ok';
    let budgetPercent = 0;
    try {
      const settingsRes = await server.inject({ method: 'GET', url: '/api/settings' });
      if (settingsRes.statusCode === 200) {
        const settings = JSON.parse(settingsRes.body);
        dailyBudget = settings.dailyBudget ?? null;
      }
    } catch {
      // Settings not available — no budget
    }

    if (dailyBudget !== null && dailyBudget > 0) {
      budgetPercent = Math.round((trackedTodayCost / dailyBudget) * 100);
      if (trackedTodayCost >= dailyBudget) {
        budgetStatus = 'exceeded';
      } else if (trackedTodayCost >= dailyBudget * 0.8) {
        budgetStatus = 'warning';
      }
    }

    return {
      today: {
        inputTokens: todayInput,
        outputTokens: todayOutput,
        estimatedCost: Math.round(todayCost * 10000) / 10000,
        turns: todayEntries.length,
      },
      allTime: {
        inputTokens: stats.totalInputTokens,
        outputTokens: stats.totalOutputTokens,
        estimatedCost: Math.round(stats.estimatedCost * 10000) / 10000,
        turns: stats.turns,
        byModel: stats.byModel,
      },
      week: {
        inputTokens: weekInput,
        outputTokens: weekOutput,
        estimatedCost: Math.round(weekCost * 10000) / 10000,
        turns: weekEntries.length,
      },
      daily,
      budget: {
        dailyBudget,
        todayCost: Math.round(trackedTodayCost * 10000) / 10000,
        budgetStatus,
        budgetPercent,
      },
    };
  });

  // GET /api/cost/by-workspace — per-workspace token usage breakdown
  server.get('/api/cost/by-workspace', { preHandler: [requireTier('TEAMS')] }, async () => {
    const entries = getEntries();
    const workspaces = server.workspaceManager.list();

    // Build a name lookup: id -> name
    const nameMap = new Map<string, string>();
    for (const ws of workspaces) {
      nameMap.set(ws.id, ws.name);
    }
    nameMap.set('default', 'Default');

    // Aggregate by workspace
    const byWorkspace = new Map<string, { input: number; output: number; cost: number; turns: number }>();
    for (const e of entries) {
      const wsId = e.workspaceId ?? 'default';
      if (!byWorkspace.has(wsId)) {
        byWorkspace.set(wsId, { input: 0, output: 0, cost: 0, turns: 0 });
      }
      const bucket = byWorkspace.get(wsId)!;
      bucket.input += e.input;
      bucket.output += e.output;
      bucket.cost += calcCost(e);
      bucket.turns += 1;
    }

    // Calculate total for percentage
    let totalCost = 0;
    for (const [, data] of byWorkspace) {
      totalCost += data.cost;
    }

    const result: Array<{
      workspaceId: string;
      workspaceName: string;
      inputTokens: number;
      outputTokens: number;
      estimatedCost: number;
      turns: number;
      percentOfTotal: number;
    }> = [];

    for (const [wsId, data] of byWorkspace) {
      result.push({
        workspaceId: wsId,
        workspaceName: nameMap.get(wsId) ?? wsId,
        inputTokens: data.input,
        outputTokens: data.output,
        estimatedCost: Math.round(data.cost * 10000) / 10000,
        turns: data.turns,
        percentOfTotal: totalCost > 0 ? Math.round((data.cost / totalCost) * 100) : 0,
      });
    }

    // Sort by cost descending
    result.sort((a, b) => b.estimatedCost - a.estimatedCost);

    return { workspaces: result, totalCost: Math.round(totalCost * 10000) / 10000 };
  });

  // D2: Alias /api/costs → /api/cost/summary for API discoverability
  // Use internal routing instead of 302 redirect so clients get a direct 200 response
  // Cost visibility is a Team feature — gated identically to /api/cost/by-workspace.
  server.get('/api/costs', { preHandler: [requireTier('TEAMS')] }, async (request, reply) => {
    const days = (request.query as Record<string, string>)?.days;
    const url = days ? `/api/cost/summary?days=${days}` : '/api/cost/summary';
    const response = await server.inject({ method: 'GET', url, headers: request.headers });
    reply.status(response.statusCode).headers(response.headers).send(response.payload);
  });
};
