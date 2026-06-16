/**
 * τ² outcome → harness JSONL emitter. One flat record per task, carrying the
 * arm context (domain, agent model, PINNED user-sim model, arm, memory state,
 * seed, k), the oracle (pass^1, pass^k, reward_basis), and the efficiency axes
 * (tokens/turns/tool-calls/$ per task + trajectory diversity). Flat by design
 * so jq/DuckDB/the equivalence-tost stats consume it directly.
 *
 * cluster_id defaults to task_id; a pre-registered clusterMap (procedure-family
 * / recurring-user, 03 B2) overrides it for cluster-bootstrap analysis.
 */

import fs from 'node:fs';
import type { Tau2TaskOutcome } from './tau2-results.js';
import type { Tau2RewardType } from './tau2-types.js';

export interface Tau2EmitContext {
  /** τ² domain this run targeted. */
  domain: string;
  /** Agent (system-under-test) model id. */
  agentModelId: string;
  /** USER SIMULATOR model id — recorded so the confound is auditable per row. */
  userSimModelId: string;
  /** PRNG seed used. */
  seed: number;
  /** Experimental arm label (A/B/C/D/E per 01 §3.1). */
  arm: string;
  /** Memory state for this arm. */
  memory: 'on' | 'off';
  /** SHA-256 of the pre-registration manifest (audit anchor). */
  manifestHash: string;
  /** Optional pre-registered task_id → cluster_id map (procedure-family etc). */
  clusterMap?: Record<string, string>;
}

export interface Tau2JsonlRecord {
  /** Constant 'tau2' so multi-substrate JSONL can be filtered. */
  substrate: 'tau2';
  domain: string;
  task_id: string;
  cluster_id: string;
  model: string;
  user_sim_model: string;
  arm: string;
  memory: 'on' | 'off';
  seed: number;
  /** Trials per task = pass^k's k. */
  k: number;
  /** Mean trial pass rate (oracle). */
  pass1: number;
  /** All-k-trials-pass reliability metric. */
  passK: boolean;
  /** Which τ² reward components drove the oracle. */
  reward_basis: Tau2RewardType[];
  tokens_per_task: number;
  turns_per_task: number;
  tool_calls_per_task: number;
  usd_per_task: number;
  /** Wall-clock seconds per task (descriptive — infra-dependent, B3). */
  duration_sec_per_task: number;
  /** Distinct final answers / k ∈ [0,1] — B5 variance-collapse guard. */
  trajectory_diversity: number;
  manifest_hash: string;
}

function validateContext(ctx: Tau2EmitContext): void {
  if (!ctx.domain) throw new Error('Tau2EmitContext requires a non-empty domain');
  if (!ctx.agentModelId) throw new Error('Tau2EmitContext requires a non-empty agentModelId');
  if (!ctx.userSimModelId) {
    throw new Error('Tau2EmitContext requires a non-empty userSimModelId — the user simulator MUST be pinned + recorded');
  }
  if (!Number.isInteger(ctx.seed)) throw new Error(`Tau2EmitContext requires an integer seed; got ${ctx.seed}`);
  if (ctx.memory !== 'on' && ctx.memory !== 'off') {
    throw new Error(`Tau2EmitContext.memory must be 'on' | 'off'; got ${ctx.memory}`);
  }
  if (!/^[0-9a-f]{64}$/i.test(ctx.manifestHash)) {
    throw new Error(`Tau2EmitContext.manifestHash must be 64-char hex; got ${ctx.manifestHash}`);
  }
}

export function toTau2JsonlRecords(
  outcomes: readonly Tau2TaskOutcome[],
  ctx: Tau2EmitContext,
): Tau2JsonlRecord[] {
  validateContext(ctx);
  return outcomes.map((o): Tau2JsonlRecord => ({
    substrate: 'tau2',
    domain: ctx.domain,
    task_id: o.task_id,
    cluster_id: ctx.clusterMap?.[o.task_id] ?? o.task_id,
    model: ctx.agentModelId,
    user_sim_model: ctx.userSimModelId,
    arm: ctx.arm,
    memory: ctx.memory,
    seed: ctx.seed,
    k: o.k,
    pass1: o.pass1,
    passK: o.passK,
    reward_basis: o.rewardBasis,
    tokens_per_task: o.meanTokens,
    turns_per_task: o.meanTurns,
    tool_calls_per_task: o.meanToolCalls,
    usd_per_task: o.meanCostUsd,
    duration_sec_per_task: o.meanDurationSec,
    trajectory_diversity: o.trajectoryDiversity,
    manifest_hash: ctx.manifestHash,
  }));
}

/** Write outcomes to a JSONL file (one object per line). Returns count written. */
export function writeTau2Jsonl(
  outcomes: readonly Tau2TaskOutcome[],
  ctx: Tau2EmitContext,
  outputPath: string,
): number {
  const records = toTau2JsonlRecords(outcomes, ctx);
  const body = records.map(r => JSON.stringify(r)).join('\n') + (records.length > 0 ? '\n' : '');
  fs.writeFileSync(outputPath, body, 'utf-8');
  return records.length;
}
