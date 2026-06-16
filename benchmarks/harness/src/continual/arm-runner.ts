/**
 * Continual-protocol arm runner (02 §3.3, §7, §8; 03 B5).
 *
 * Evaluates ONE Phase-B task under one arm:
 *   - memory-ON: recall the FROZEN mind via HybridSearch.search → a
 *     "# Recalled Memories" block (the production cell shape, cells.ts), then
 *     run the answer model with that block.
 *   - memory-OFF: an EMPTY recall block; the model must re-derive (or fail).
 *
 * pass^k (02 §8): the mind is read-only and IDENTICAL across the k trials
 * (freeze-per-task), and trials are independent (the answer model is expected
 * to run at a pre-registered T>0 / varied seed — 03 B5 — so pass^k is not inert).
 * passK = (# passing trials)/k.
 *
 * Efficiency (02 §7.2): turns, tool-calls, input/output tokens are captured per
 * trial and averaged. Tokens are TOTAL (recall-block length feeds the input
 * count via the model's own accounting — the memory tax counts against itself,
 * 03 B3).
 *
 * The answer model + scorer are INJECTED so this module is substrate-coupled
 * only through HybridSearch (the recall path), not through any LLM. Production
 * wiring passes a LiteLLM-backed AnswerFn (a thin wrapper over runAgentLoop or
 * a single call); tests pass a deterministic stub.
 */

import { HybridSearch, type Embedder, type MindDB, type SearchResult } from '@waggle/core';

/** Minimal Phase-B task view the runner needs. */
export interface ArmTask {
  task_id: string;
  goal: string;
  gold: string;
}

/** One answer-model trial result. The model accounts its own usage. */
export interface AnswerResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  turns: number;
  toolCalls: number;
}

/** The injected answer model. `recalledBlock` is '' for memory-OFF. */
export type AnswerFn = (args: {
  goal: string;
  recalledBlock: string;
  trialIndex: number;
}) => Promise<AnswerResult>;

/** Injected scorer: 1 = pass, 0 = fail. (Plan 07 supplies the τ² oracle.) */
export type ScorerFn = (text: string, gold: string) => 0 | 1;

export interface ArmTaskInput {
  task: ArmTask;
  /** Frozen mind for memory-ON; null for memory-OFF. */
  mind: MindDB | null;
  /** Embedder for recall (matches the frozen mind's dimension). */
  embedder: Embedder;
  answer: AnswerFn;
  scorer: ScorerFn;
  /** Whether to recall the mind. */
  memoryOn: boolean;
  /** pass^k trial count. Pre-registered. */
  k: number;
  /** Recall top-K. Default 10 (matches orchestrator recallMemory default). */
  recallLimit?: number;
}

export interface ArmTrial {
  trialIndex: number;
  pass: 0 | 1;
  inputTokens: number;
  outputTokens: number;
  turns: number;
  toolCalls: number;
}

export interface ArmTaskResult {
  task_id: string;
  memoryOn: boolean;
  /** # frames recalled into the block (0 for memory-OFF). */
  recalledCount: number;
  /** (# passing trials)/k. */
  passK: number;
  /** True iff ≥1 trial passed. */
  passAtLeastOne: boolean;
  meanInputTokens: number;
  meanOutputTokens: number;
  meanTurns: number;
  meanToolCalls: number;
  trials: ArmTrial[];
}

/** Render recalled frames into the production "# Recalled Memories" shape
 *  (cells.ts formatRecalledMemories). */
function formatRecalled(results: readonly SearchResult[]): string {
  if (results.length === 0) return '# Recalled Memories\n(none)';
  const lines = results.map(r => {
    const score = r.finalScore.toFixed(3);
    const source = r.frame.source ?? 'user_stated';
    return `- [memory:${r.frame.gop_id}:${r.frame.id} score=${score} src=${source}] ${r.frame.content}`;
  });
  return `# Recalled Memories\n${lines.join('\n')}`;
}

export async function runArmTask(input: ArmTaskInput): Promise<ArmTaskResult> {
  const { task, mind, embedder, answer, scorer, memoryOn, k, recallLimit = 10 } = input;
  if (!Number.isInteger(k) || k < 1) {
    throw new Error(`runArmTask requires k ≥ 1 (integer); got ${k}`);
  }
  if (memoryOn && !mind) {
    throw new Error('runArmTask: memory-ON requires a mind (got null)');
  }

  // Recall ONCE (freeze-per-task): the same block feeds every trial.
  let recalledBlock = '# Recalled Memories\n(none)';
  let recalledCount = 0;
  if (memoryOn && mind) {
    const search = new HybridSearch(mind, embedder);
    const results = await search.search(task.goal, { limit: recallLimit, profile: 'balanced' });
    recalledBlock = formatRecalled(results);
    recalledCount = results.length;
  }

  const trials: ArmTrial[] = [];
  for (let i = 0; i < k; i++) {
    const a = await answer({ goal: task.goal, recalledBlock, trialIndex: i });
    trials.push({
      trialIndex: i,
      pass: scorer(a.text, task.gold),
      inputTokens: a.inputTokens,
      outputTokens: a.outputTokens,
      turns: a.turns,
      toolCalls: a.toolCalls,
    });
  }

  const passes = trials.reduce((s, t) => s + t.pass, 0);
  const avg = (sel: (t: ArmTrial) => number): number =>
    trials.reduce((s, t) => s + sel(t), 0) / trials.length;

  return {
    task_id: task.task_id,
    memoryOn,
    recalledCount,
    passK: passes / k,
    passAtLeastOne: passes > 0,
    meanInputTokens: avg(t => t.inputTokens),
    meanOutputTokens: avg(t => t.outputTokens),
    meanTurns: avg(t => t.turns),
    meanToolCalls: avg(t => t.toolCalls),
    trials,
  };
}
