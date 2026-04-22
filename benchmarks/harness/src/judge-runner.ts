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
  /**
   * Sprint 11 B2 fold-in (2026-04-22): path the ensemble resolver took.
   *   - `undefined` on single-judge runs or when the tie-break module
   *      was never consulted (e.g. 3-0 consensus, 2-1 majority — handled
   *      by legacy `computeMajority` inside `judgeEnsemble`).
   *   - `'none'` / `'majority'` when resolveTieBreak short-circuited.
   *   - `'quadri-vendor'` when 1-1-1 was escalated to the fourth vendor
   *      and resolved.
   *   - `'pm-escalation'` when the four votes produced 1-1-1-1 → runtime
   *      surfaces this as `judge_error: 'PM_ESCALATION'` so the aggregator
   *      treats the instance as skipped (no silent coin-flip verdict).
   */
  tie_break_path?: 'none' | 'majority' | 'quadri-vendor' | 'pm-escalation';
  /** Model slug that cast the fourth vote when `tie_break_path === 'quadri-vendor'`
   *  or `'pm-escalation'`. e.g. `'xai/grok-4.20'`. */
  tie_break_fourth_vendor?: string;
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
  /**
   * Sprint 11 B2 fold-in (2026-04-22) per decisions/2026-04-22-tie-break-policy-locked.md:
   * when provided AND a 1-1-1 three-way split emerges from the primary
   * ensemble (only meaningful when `models.length === 3`), judge-runner
   * calls `resolveTieBreak` with this client as the fourth vendor.
   * Absent → keep the legacy `computeMajority` behavior (tie-breaker =
   * first model in `models` list).
   */
  tieBreakerModel?: string;
  tieBreakerClient?: LlmClient;
}

export type JudgeConfig = SingleJudgeConfig | EnsembleJudgeConfig;

/** Module shape mirror for resolveTieBreak — same dynamic-import pattern
 *  as loadJudgeModule to keep tsc happy under `rootDir: "src"`. */
interface TieBreakModule {
  resolveTieBreak(
    votes: Array<{ verdict: JudgeVerdict; failure_mode: FailureMode | null; rationale: string; judge_model: string }>,
    options: {
      callFourthVendor?: (payload: { primaryVotes: Array<{ verdict: JudgeVerdict; failure_mode: FailureMode | null; rationale: string; judge_model: string }>; model: string }) => Promise<{ verdict: JudgeVerdict; failure_mode: FailureMode | null; rationale: string; judge_model: string }>;
      fourthVendorModel?: string;
      logger?: { info(event: string, fields: Record<string, unknown>): void; warn?(event: string, fields: Record<string, unknown>): void };
    },
  ): Promise<{
    verdict: string;
    path: 'none' | 'majority' | 'quadri-vendor' | 'pm-escalation';
    votes: Array<{ verdict: JudgeVerdict; failure_mode: FailureMode | null; rationale: string; judge_model: string }>;
    fourthVendorVote?: { verdict: JudgeVerdict; failure_mode: FailureMode | null; rationale: string; judge_model: string };
    fourthVendorSlug?: string;
  }>;
  PM_ESCALATION_VERDICT: string;
  DEFAULT_FOURTH_VENDOR: string;
}

let cachedTieBreakModule: TieBreakModule | null = null;

async function loadTieBreakModule(): Promise<TieBreakModule> {
  if (cachedTieBreakModule) return cachedTieBreakModule;
  const { fileURLToPath, pathToFileURL } = await import('node:url');
  const nodePath = await import('node:path');
  const here = fileURLToPath(import.meta.url);
  const repoRoot = nodePath.resolve(nodePath.dirname(here), '..', '..', '..');
  const candidates = [
    nodePath.resolve(repoRoot, 'packages/server/src/benchmarks/judge/ensemble-tiebreak.ts'),
    nodePath.resolve(repoRoot, 'packages/server/src/benchmarks/judge/ensemble-tiebreak.js'),
    nodePath.resolve(repoRoot, 'packages/server/dist/benchmarks/judge/ensemble-tiebreak.js'),
  ];
  const fs = await import('node:fs');
  const target = candidates.find(p => fs.existsSync(p));
  if (!target) {
    throw new Error(
      `ensemble-tiebreak module not found — looked in:\n  ${candidates.join('\n  ')}`,
    );
  }
  cachedTieBreakModule = (await import(pathToFileURL(target).href)) as TieBreakModule;
  return cachedTieBreakModule;
}

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

    // Sprint 11 B2 fold-in (2026-04-22): 3-primary ensemble + tie-break
    // client supplied + 1-1-1 three-way split observed → escalate via
    // resolveTieBreak. Preserves judgeEnsemble's internal contract (it
    // still returns its computeMajority-derived `majority` field);
    // judge-runner post-processes to override the majority when the
    // escalation triggers.
    const isThreePrimary = config.models.length === 3;
    const hasTieBreaker = Boolean(config.tieBreakerClient);
    if (isThreePrimary && hasTieBreaker) {
      const distinctVoteKeys = new Set(
        result.ensemble.map(r => `${r.verdict}|${r.failure_mode ?? 'NA'}`),
      );
      if (distinctVoteKeys.size === 3) {
        // 1-1-1 split confirmed. Dispatch to resolveTieBreak.
        const tb = await loadTieBreakModule();
        const fourthVendorModel = config.tieBreakerModel ?? tb.DEFAULT_FOURTH_VENDOR;
        const tbResult = await tb.resolveTieBreak(result.ensemble, {
          fourthVendorModel,
          callFourthVendor: async ({ model: tbModel }) => {
            const grokJudge = await mod.judgeAnswer({
              question: triple.question,
              groundTruth: triple.groundTruth,
              contextExcerpt: triple.contextExcerpt,
              modelAnswer: triple.modelAnswer,
              judgeModel: tbModel,
              llmClient: config.tieBreakerClient!,
            });
            return {
              verdict: grokJudge.verdict,
              failure_mode: grokJudge.failure_mode,
              rationale: grokJudge.rationale,
              judge_model: grokJudge.judge_model,
            };
          },
        });

        const ensembleVotes = tbResult.votes.map(r => ({
          model: r.judge_model,
          verdict: r.verdict,
          failure_mode: r.failure_mode,
          rationale: r.rationale,
        }));

        if (tbResult.path === 'pm-escalation') {
          // 1-1-1-1 four-way — surface as judge_error so aggregator treats
          // it as skipped (no silent coin-flip verdict). Preserves the
          // Fleiss' κ=0.8784 methodology lock by NEVER fabricating a
          // verdict when the ensemble + tie-break cannot reach plurality.
          return {
            ...base,
            judge_timestamp: new Date().toISOString(),
            judge_ensemble: ensembleVotes,
            judge_error: 'PM_ESCALATION',
            tie_break_path: 'pm-escalation',
            tie_break_fourth_vendor: tbResult.fourthVendorSlug,
          };
        }

        // path === 'quadri-vendor' — decode back to structured verdict.
        const [verdictStr, failureModeRaw] = tbResult.verdict.split('|');
        const resolvedVerdict = (verdictStr as JudgeVerdict);
        const resolvedFailureMode: FailureMode | null =
          failureModeRaw === 'NA' ? null : (failureModeRaw as FailureMode);
        return {
          ...base,
          judge_verdict: resolvedVerdict,
          judge_failure_mode: resolvedFailureMode,
          judge_rationale: `tie-break path=${tbResult.path} via ${tbResult.fourthVendorSlug ?? 'unknown'}`,
          judge_model: 'ensemble_with_tiebreak',
          judge_timestamp: new Date().toISOString(),
          judge_ensemble: ensembleVotes,
          tie_break_path: tbResult.path,
          tie_break_fourth_vendor: tbResult.fourthVendorSlug,
        };
      }
      // Not a 1-1-1 split — fall through to legacy majority below.
    }

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
