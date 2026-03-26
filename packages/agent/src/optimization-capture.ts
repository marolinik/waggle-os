/**
 * Optimization Capture — captures agent interactions for GEPA/Ax prompt optimization.
 *
 * Provides functions to log successful agent interactions into the optimization_log
 * table in a workspace's .mind file, and to query those logs for background
 * optimization analysis.
 *
 * This module is a thin adapter between the agent loop post-response hook and
 * the OptimizationLogStore in @waggle/core.
 */

import type { OptimizationLogStore, CreateOptimizationLogInput, OptimizationLogEntry } from '@waggle/core';
import type { AgentResponse } from './agent-loop.js';

// ── Public interface ───────────────────────────────────────────────────

export interface CaptureInteractionInput {
  sessionId: string;
  workspaceId: string;
  systemPrompt: string;
  response: AgentResponse;
  turnCount: number;
  wasCorrection: boolean;
}

/**
 * Capture an agent interaction for GEPA optimization analysis.
 *
 * Call this after every successful agent loop completion. The data is
 * stored in the workspace's .mind file and read later by the background
 * prompt_optimization cron job.
 */
export function captureInteraction(
  store: OptimizationLogStore,
  input: CaptureInteractionInput,
): OptimizationLogEntry {
  const logInput: CreateOptimizationLogInput = {
    sessionId: input.sessionId,
    workspaceId: input.workspaceId,
    systemPrompt: input.systemPrompt,
    toolsUsed: input.response.toolsUsed ?? [],
    turnCount: input.turnCount,
    wasCorrection: input.wasCorrection,
    inputTokens: input.response.usage?.inputTokens ?? 0,
    outputTokens: input.response.usage?.outputTokens ?? 0,
  };
  return store.insert(logInput);
}

/**
 * Query recent optimization logs for background analysis.
 *
 * Returns the most recent entries from the optimization log,
 * ordered by timestamp descending.
 */
export function getRecentLogs(
  store: OptimizationLogStore,
  limit: number = 50,
): OptimizationLogEntry[] {
  return store.getRecent(limit);
}

/**
 * Get optimization logs for a specific workspace.
 */
export function getWorkspaceLogs(
  store: OptimizationLogStore,
  workspaceId: string,
  limit: number = 50,
): OptimizationLogEntry[] {
  return store.getByWorkspace(workspaceId, limit);
}

/**
 * Check whether the daily optimization budget has been exceeded.
 *
 * Reads the optimization log entries from today and sums up their token costs.
 * Returns true if under budget, false if over.
 *
 * @param budgetCents Daily budget in cents (e.g. 100 = $1/day)
 * @param costPerInputToken Cost per input token in dollars (default: Sonnet pricing ~$3/M)
 * @param costPerOutputToken Cost per output token in dollars (default: Sonnet pricing ~$15/M)
 */
export function isWithinBudget(
  store: OptimizationLogStore,
  budgetCents: number,
  costPerInputToken: number = 3 / 1_000_000,
  costPerOutputToken: number = 15 / 1_000_000,
): boolean {
  const stats = store.getStats();
  const totalCostDollars =
    stats.totalInputTokens * costPerInputToken +
    stats.totalOutputTokens * costPerOutputToken;
  const totalCostCents = totalCostDollars * 100;
  return totalCostCents <= budgetCents;
}
