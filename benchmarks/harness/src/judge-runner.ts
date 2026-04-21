/**
 * Judge runner adapter — wraps the failure-mode-judge module for use
 * inside the benchmark runner loop.
 *
 * Sprint 9 Task 2. The cells produce raw LLM answers; this module takes
 * (question, ground_truth, context_excerpt, model_answer) from each
 * instance + cell result and returns a JSONL-ready verdict payload.
 *
 * Single-judge path is the production default. `judgeEnsemble` path is
 * exposed for the calibration Task 5 (Fleiss' kappa probe) and for
 * future Week-1 ensemble runs per taxonomy §6.
 *
 * Parse failures are already handled inside the judge module (one
 * reminder-retry, then JudgeParseError). Transport failures are handled
 * inside the JudgeLlmClient (two retries with exponential backoff).
 * Both failure surfaces are caught here and converted into an
 * `unjudged` result so the run continues — losing one judge call never
 * aborts a whole Stage-2 batch.
 */

import type { LlmClient } from './judge-types.js';
import type { FailureMode, JudgeEnsembleEntry, JudgeVerdict } from './types.js';

// The judge module lives in a sibling workspace; tsc's `rootDir: "src"`
// refuses a direct typed import (TS6059). We resolve the runtime
// module at call time via dynamic import + ambient shape typing, which
// keeps the compile-time contract local to the harness (see
// judge-types.ts) while the real implementation ships from server/.
//
// This is deliberately narrow — only the symbols the runner consumes
// are typed here, mirroring the canonical declarations in the server
// judge module. Any shape drift between the two will surface as a
// runtime TypeError at the first call site, not a silent downgrade.
interface JudgeModule {
  judgeAnswer(params: {
    question: string;
    groundTruth: string;
    contextExcerpt: string;
    modelAnswer: string;
    judgeModel: string;
    llmClient: LlmClient;
  }): Promise<{
    verdict: JudgeVerdict;
    failure_mode: null | FailureMode;
    rationale: string;
    judge_model: string;
  }>;
  judgeEnsemble(params: {
    question: string;
    groundTruth: string;
    contextExcerpt: string;
    modelAnswer: string;
    judgeModels: string[];
    llmClients: Map<string, LlmClient>;
  }): Promise<{
    ensemble: Array<{
      verdict: JudgeVerdict;
      failure_mode: null | FailureMode;
      rationale: string;
      judge_model: string;
    }>;
    majority: {
      verdict: JudgeVerdict;
      failure_mode: null | FailureMode;
      rationale: string;
      judge_model: string;
    };
    fleissKappa: number;
  }>;
  JudgeParseError: new (...args: unknown[]) => Error;
}

let cachedModule: JudgeModule | null = null;

/** Compute the runtime path to the judge module from the harness dist/src
 *  location at call time. Building the string from `import.meta.url` keeps
 *  tsc from chasing it during rootDir resolution (TS6059) and defers the
 *  path to vite-node / tsx / runtime ESM loader. */
async function loadJudgeModule(): Promise<JudgeModule> {
  if (cachedModule) return cachedModule;
  const { fileURLToPath, pathToFileURL } = await import('node:url');
  const nodePath = await import('node:path');
  const here = fileURLToPath(import.meta.url);
  // `harness/src/judge-runner.ts` OR `harness/dist/judge-runner.js` → up to repo root.
  const repoRoot = nodePath.resolve(nodePath.dirname(here), '..', '..', '..');
  // Prefer src (for tsx/vitest) and fall back to compiled dist (for `node`).
  const candidates = [
    nodePath.resolve(repoRoot, 'packages/server/src/benchmarks/judge/failure-mode-judge.ts'),
    nodePath.resolve(repoRoot, 'packages/server/src/benchmarks/judge/failure-mode-judge.js'),
    nodePath.resolve(repoRoot, 'packages/server/dist/benchmarks/judge/failure-mode-judge.js'),
  ];
  const fs = await import('node:fs');
  const target = candidates.find(p => fs.existsSync(p));
  if (!target) {
    throw new Error(
      `judge module not found — looked in:\n  ${candidates.join('\n  ')}`,
    );
  }
  cachedModule = (await import(pathToFileURL(target).href)) as JudgeModule;
  return cachedModule;
}

export interface JudgeTriple {
  question: string;
  groundTruth: string;
  contextExcerpt: string;
  modelAnswer: string;
}

/** Subset of JsonlRecord fields the runner copies from this payload.
 *  Fields are `undefined` when judging was skipped, disabled, or failed
 *  irrecoverably — the runner writes only the fields this payload
 *  supplied (consumers treat `undefined` as "not judged yet"). */
export interface JudgePayload {
  model_answer: string;
  judge_verdict?: JudgeVerdict;
  judge_failure_mode?: FailureMode | null;
  judge_rationale?: string;
  judge_model?: string;
  judge_timestamp?: string;
  judge_ensemble?: JudgeEnsembleEntry[];
  /** Non-null when the judge call failed after all retries. The runner
   *  logs this but does NOT surface it as a cell-level failure_mode —
   *  the cell succeeded, only the post-hoc grading failed. */
  judge_error?: string;
}

export interface SingleJudgeConfig {
  kind: 'single';
  model: string;
  client: LlmClient;
}

export interface EnsembleJudgeConfig {
  kind: 'ensemble';
  /** Ordered list — index 0 is the tie-breaker (Sonnet by convention
   *  per taxonomy §6). */
  models: string[];
  clients: Map<string, LlmClient>;
}

export type JudgeConfig = SingleJudgeConfig | EnsembleJudgeConfig;

export async function runJudge(
  triple: JudgeTriple,
  config: JudgeConfig,
): Promise<JudgePayload> {
  const base: JudgePayload = { model_answer: triple.modelAnswer };
  const mod = await loadJudgeModule();
  try {
    if (config.kind === 'single') {
      const result = await mod.judgeAnswer({
        question: triple.question,
        groundTruth: triple.groundTruth,
        contextExcerpt: triple.contextExcerpt,
        modelAnswer: triple.modelAnswer,
        judgeModel: config.model,
        llmClient: config.client,
      });
      return {
        ...base,
        judge_verdict: result.verdict,
        judge_failure_mode: result.failure_mode,
        judge_rationale: result.rationale,
        judge_model: result.judge_model,
        judge_timestamp: new Date().toISOString(),
      };
    }

    const result = await mod.judgeEnsemble({
      question: triple.question,
      groundTruth: triple.groundTruth,
      contextExcerpt: triple.contextExcerpt,
      modelAnswer: triple.modelAnswer,
      judgeModels: config.models,
      llmClients: config.clients,
    });
    return {
      ...base,
      judge_verdict: result.majority.verdict,
      judge_failure_mode: result.majority.failure_mode,
      judge_rationale: result.majority.rationale,
      judge_model: result.majority.judge_model,
      judge_timestamp: new Date().toISOString(),
      judge_ensemble: result.ensemble.map(r => ({
        model: r.judge_model,
        verdict: r.verdict,
        failure_mode: r.failure_mode,
        rationale: r.rationale,
      })),
    };
  } catch (err) {
    // Two failure classes both land here:
    //   - JudgeParseError: judge LLM returned garbage twice in a row
    //   - Transport / HTTP / timeout after all JudgeLlmClient retries
    // Either way, we keep the run going. A Stage-2 batch that loses one
    // judge call out of 200 should not abort; the aggregator treats
    // `judge_verdict === undefined` as a skipped-judge instance and
    // downgrades confidence in the per-cell rollup accordingly.
    const message = err instanceof Error ? err.message : String(err);
    const kind = err instanceof mod.JudgeParseError ? 'parse' : 'transport';
    console.warn(
      `[judge-runner] ${kind} failure — instance left unjudged (${message.slice(0, 200)})`,
    );
    return { ...base, judge_error: `${kind}: ${message.slice(0, 200)}` };
  }
}
