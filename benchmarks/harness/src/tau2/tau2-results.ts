/**
 * τ²-bench results parser — the TASK-COMPLETION ORACLE surface.
 *
 * τ² computes success via a STATE/ACTION oracle: RewardInfo.reward is the
 * PRODUCT over the components named in reward_basis — DB hash match (DB),
 * required-action matching (ACTION), required-info substring in the agent's
 * messages (COMMUNICATE), and env-assertion checks (ENV_ASSERTION). We consume
 * `reward` directly; we NEVER re-score the final answer with our own substring
 * matcher (that would defeat the point — see 01-DESIGN-SPEC §6).
 *
 * From per-trial pass/fail we compute:
 *   pass^1 = mean trial pass rate per task.
 *   pass^k = ALL k trials pass (τ²'s native reliability metric; 02 §8).
 * Plus per-task efficiency (tokens/turns/tool-calls/$ averaged over trials)
 * and inter-trial trajectory diversity (distinct final answers / k) — the
 * B5 variance-collapse guard so "reliability" is not won by recall-pinning.
 */

import fs from 'node:fs';
import type {
  Tau2Results,
  Tau2SimulationRun,
  Tau2Message,
  Tau2RewardType,
} from './tau2-types.js';

/** A simulation counts as a pass when its oracle reward meets this floor.
 *  τ² uses reward=1.0 for full task success; partial-credit bases can yield a
 *  fraction, which is NOT a pass. */
export const REWARD_PASS = 1.0;

export interface Tau2TaskOutcome {
  task_id: string;
  /** Number of trials observed for this task (= k for pass^k). */
  k: number;
  /** Per-trial pass/fail in trial order, by the oracle reward. */
  trialPasses: boolean[];
  /** Mean trial pass rate. */
  pass1: number;
  /** True iff EVERY trial passed (τ² reliability metric). */
  passK: boolean;
  /** The reward_basis components τ² used (from the first trial that has one). */
  rewardBasis: Tau2RewardType[];
  /** Mean total tokens (prompt+completion) per trial. */
  meanTokens: number;
  /** Mean assistant turns per trial. */
  meanTurns: number;
  /** Mean tool calls per trial. */
  meanToolCalls: number;
  /** Mean agent $ per trial (τ² LiteLLM cost; E7 — the cost denominator). */
  meanCostUsd: number;
  /** Mean wall-clock duration seconds per trial (descriptive — B3). */
  meanDurationSec: number;
  /** Distinct final-answer strings / k ∈ [0,1] — inter-trial diversity.
   *  A single distinct answer across all trials is full variance-collapse and
   *  reports 0; otherwise distinct/k. */
  trajectoryDiversity: number;
}

/** Validate + normalize a raw τ² Results object. Throws on a missing
 *  simulations array or a sim without a task_id. */
export function parseTau2Results(raw: Tau2Results): Tau2Results {
  if (!raw || !Array.isArray(raw.simulations)) {
    throw new Error('τ² Results must carry a `simulations` array');
  }
  for (const sim of raw.simulations) {
    if (!sim || typeof sim.task_id !== 'string' || sim.task_id.length === 0) {
      throw new Error(`τ² simulation is missing a string task_id: ${JSON.stringify(sim).slice(0, 120)}`);
    }
  }
  return raw;
}

function trialPass(sim: Tau2SimulationRun): boolean {
  const reward = sim.reward_info?.reward;
  if (typeof reward !== 'number' || !Number.isFinite(reward)) return false;
  return reward >= REWARD_PASS;
}

function countAssistantTurns(messages: Tau2Message[] | null | undefined): number {
  if (!messages) return 0;
  return messages.filter(m => m.role === 'assistant').length;
}

function countToolCalls(messages: Tau2Message[] | null | undefined): number {
  if (!messages) return 0;
  let n = 0;
  for (const m of messages) {
    if (m.role === 'assistant' && Array.isArray(m.tool_calls)) n += m.tool_calls.length;
  }
  return n;
}

function sumTokens(messages: Tau2Message[] | null | undefined): number {
  if (!messages) return 0;
  let n = 0;
  for (const m of messages) {
    const u = m.usage;
    if (u) n += (u.prompt_tokens ?? 0) + (u.completion_tokens ?? 0);
  }
  return n;
}

/** Final-answer string for a trial = the last assistant message content. */
function finalAnswer(messages: Tau2Message[] | null | undefined): string {
  if (!messages) return '';
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'assistant') return (messages[i].content ?? '').trim();
  }
  return '';
}

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

/** Group simulations by task_id, then derive the oracle + efficiency outcome. */
export function computeTaskOutcomes(results: Tau2Results): Tau2TaskOutcome[] {
  const byTask = new Map<string, Tau2SimulationRun[]>();
  for (const sim of results.simulations) {
    const bucket = byTask.get(sim.task_id);
    if (bucket) bucket.push(sim);
    else byTask.set(sim.task_id, [sim]);
  }

  const outcomes: Tau2TaskOutcome[] = [];
  for (const [task_id, sims] of byTask) {
    // Stable trial order: by `trial` when present, else insertion order.
    const ordered = [...sims].sort((a, b) => {
      const ta = a.trial ?? 0;
      const tb = b.trial ?? 0;
      return ta - tb;
    });
    const trialPasses = ordered.map(trialPass);
    const k = ordered.length;
    const pass1 = k === 0 ? 0 : trialPasses.filter(Boolean).length / k;
    const passK = k > 0 && trialPasses.every(Boolean);

    const basisSim = ordered.find(s => Array.isArray(s.reward_info?.reward_basis));
    const rewardBasis = (basisSim?.reward_info?.reward_basis ?? []) as Tau2RewardType[];

    const meanTokens = mean(ordered.map(s => sumTokens(s.messages)));
    const meanTurns = mean(ordered.map(s => countAssistantTurns(s.messages)));
    const meanToolCalls = mean(ordered.map(s => countToolCalls(s.messages)));
    const meanCostUsd = mean(ordered.map(s => s.agent_cost ?? 0));
    const meanDurationSec = mean(ordered.map(s => s.duration ?? 0));

    const finals = ordered.map(s => finalAnswer(s.messages));
    const distinct = new Set(finals).size;
    // Variance-collapse guard: a single distinct trajectory across all trials is
    // full collapse → 0. Otherwise the distinct-ratio over k.
    const trajectoryDiversity = k === 0 || distinct <= 1 ? 0 : distinct / k;

    outcomes.push({
      task_id, k, trialPasses, pass1, passK, rewardBasis,
      meanTokens, meanTurns, meanToolCalls, meanCostUsd, meanDurationSec,
      trajectoryDiversity,
    });
  }
  // Deterministic order for downstream JSONL.
  outcomes.sort((a, b) => (a.task_id < b.task_id ? -1 : a.task_id > b.task_id ? 1 : 0));
  return outcomes;
}

/** Load + parse a τ² results.json file from disk (dir or file path). */
export function loadTau2ResultsFile(filePath: string): Tau2Results {
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Tau2Results;
  return parseTau2Results(raw);
}
