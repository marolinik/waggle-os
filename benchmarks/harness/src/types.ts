/**
 * Four-cell ablation harness — shared types.
 *
 * The four cells isolate causal contributions to end-to-end quality:
 *   Cell 1 — raw:          LLM only, stateless per turn.
 *   Cell 2 — memory-only:  LLM + memory retrieval, no prompt evolution.
 *   Cell 3 — evolve-only:  LLM + prompt evolution, no memory retrieval.
 *   Cell 4 — full-stack:   LLM + memory + prompt evolution.
 *
 * Same dataset, same seed, same model across all four. Difference at report
 * time between a baseline cell and a treatment cell isolates the causal
 * contribution of the ablated component.
 *
 * Controls (not cells) sit alongside for sanity checking:
 *   verbose-fixed:  fixed-prompt-with-verbose-instructions. Day 1 check that
 *                   the harness is not broken (should underperform raw).
 *
 * Out-of-scope (Week 2+): naive-RAG, oracle-memory ceiling, Llama-3.1-8B,
 * Opus 4.6, Gemma 2 9B probe, full τ-bench + LongMemEval loaders.
 */

export type CellName = 'raw' | 'memory-only' | 'evolve-only' | 'full-stack';
export type ControlName = 'verbose-fixed';
export type RunKind = { kind: 'cell'; name: CellName } | { kind: 'control'; name: ControlName };

export interface DatasetInstance {
  /** Stable id used in the JSONL record for cross-cell joining. */
  instance_id: string;
  /** Question or task statement shown to the model. */
  question: string;
  /** Dataset-supplied context that raw / evolve-only cells receive verbatim
   *  and memory cells may ignore in favor of their retrieval layer. */
  context: string;
  /** Canonical reference answer(s) for automated scoring. */
  expected: string[];
}

export interface DatasetSpec {
  id: 'locomo' | 'longmemeval' | 'synthetic';
  displayName: string;
  /** Where the loader looks for the data. Relative to `benchmarks/data/`. */
  dataPath: string;
  /** `synthetic` dataset has instances hard-coded in the harness so scaffold
   *  smoke tests don't need external downloads. */
  source: 'synthetic' | 'external';
}

export interface ModelSpec {
  id: string;
  displayName: string;
  provider: 'alibaba' | 'anthropic' | 'ollama' | 'litellm-proxy' | 'local';
  /** Route string the LiteLLM proxy recognizes. */
  litellmModel: string;
  /** USD per 1M input tokens. */
  pricePerMillionInput: number;
  /** USD per 1M output tokens. */
  pricePerMillionOutput: number;
  /** Context window in tokens (for truncation decisions). */
  contextWindow: number;
  /**
   * Sprint 11 Task B1 (2026-04-22): Stage 2 LOCKED config (thinking=on,
   * max_tokens=64000) per decisions/2026-04-22-stage-2-primary-config-locked.md.
   *
   * When present, C2/C3 harness runs apply these overrides to every LLM call
   * explicitly (not inherited from request defaults). Absent = harness uses
   * the legacy max_tokens=600 default and no reasoning flag.
   */
  stage2Config?: {
    /** Request `reasoning: { enabled: true }` (OpenRouter unified shape). */
    thinking: boolean;
    /** Override `max_tokens` in the request body (Stage 2 LOCK: 64000). */
    maxTokens: number;
    /**
     * Response-side parser hint. OpenRouter unified returns
     * `message.reasoning`; DashScope native returns `message.reasoning_content`.
     * Parser accepts either shape regardless; this is an annotation for
     * routing expectations.
     */
    reasoningShape: 'openrouter-unified' | 'dashscope-native';
  };
}

export interface RunConfig {
  run: RunKind;
  dataset: DatasetSpec;
  model: ModelSpec;
  /** Limit the number of instances to run. `Infinity` = full dataset. */
  limit: number;
  /** Reproducibility seed. Same seed → same instance order + same prompts. */
  seed: number;
  /** Hard USD cap — run stops when cumulative cost exceeds. `Infinity` disables. */
  budgetUsd: number;
  /** Absolute path to the JSONL output file. */
  outputPath: string;
  /** When true, the LLM client returns a deterministic stub response instead
   *  of calling LiteLLM. Smoke tests + offline scaffolding. */
  dryRun: boolean;
  /** LiteLLM proxy URL. Only used when dryRun is false. */
  litellmUrl: string;
  /** LiteLLM bearer key. Only used when dryRun is false. */
  litellmApiKey: string;
  /** Optional path to a committed sample-lock JSON. When set, bypasses the
   *  dataset adapter and loads instances directly from the lock file. Runtime
   *  asserts the distribution required for the Stage 2 preflight gate. */
  sampleLockPath?: string;
  /** Sprint 9 Task 2. When set, runner invokes `failure-mode-judge` after
   *  each cell call with this config. Single-judge or ensemble depending
   *  on the shape; undefined means judging is disabled. The runner keeps
   *  its own budget ledger for judge spend separate from cell spend so
   *  the brief's "$5 alarm per run" can be respected independently. */
  judgeConfig?: import('./judge-runner.js').JudgeConfig;
  /** Optional sink for per-call judge cost entries. Typically the caller
   *  collects into an array to summarise in the run output. */
  onJudgeCall?: (entry: import('./judge-client.js').JudgeClientCostEntry) => void;
}

/** Judge failure-mode taxonomy codes. Must match the enum the judge module
 *  returns — see `packages/server/src/benchmarks/judge/failure-mode-judge.ts`. */
export type FailureMode = 'F1' | 'F2' | 'F3' | 'F4' | 'F5';

/** Single-judge verdict payload embedded in a JsonlRecord. Shape matches
 *  taxonomy spec §9 (binary `verdict` + separate `failure_mode` slot) —
 *  not the brief Task-1 6-value combined enum. The binary shape is what
 *  the failure-mode-judge module already returns, so keeping them aligned
 *  avoids a lossy conversion at the wiring step. If downstream wants the
 *  6-value form ("correct" / "F1_abstain" / … / "F5_offtopic"), the
 *  aggregator (Task 3) computes it from `judge_verdict` + `failure_mode`
 *  at report time. */
export type JudgeVerdict = 'correct' | 'incorrect';

export interface JudgeEnsembleEntry {
  model: string;
  verdict: JudgeVerdict;
  failure_mode: FailureMode | null;
  rationale?: string;
  /** Per-judge wall-clock latency in ms. Aggregated into Task 3's cost
   *  summary "median ms per judge call". */
  latency_ms?: number;
}

/** One entry in the per-instance JSONL output. Shape intentionally flat so
 *  downstream analysis (pandas, jq, DuckDB) stays trivial.
 *
 *  Judge fields are all **optional** so pre-judge JSONL files (any output
 *  produced before Sprint 9 Task 2 lands) still parse. Consumers treat
 *  `judge_verdict === undefined` as "not judged yet". */
export interface JsonlRecord {
  turnId: string;
  cell: CellName | ControlName;
  instance_id: string;
  model: string;
  seed: number;
  accuracy: number;
  p50_latency_ms: number;
  p95_latency_ms: number;
  usd_per_query: number;
  /** Existing since Sprint 7 — retained as-is. Populated from the cell's
   *  own LLM call failure-mode signal (transport errors, quota, etc.),
   *  NOT from the judge. For the judge's taxonomy code, use the separate
   *  `judge_failure_mode` field below. */
  failure_mode: string | null;
  // ── Judge extension (taxonomy §9 / Sprint 9 Task 1) ──────────────
  /** Verbatim answer the model under test produced for this instance.
   *  Stored so the judge + aggregator + any later re-judge pass can
   *  operate on the same string without re-running the model. */
  model_answer?: string;
  /** Binary judge verdict from `judgeAnswer` / `judgeEnsemble` majority.
   *  "correct" implies `judge_failure_mode === null`; "incorrect"
   *  implies it's one of F1..F5. This invariant is enforced by the
   *  judge module's Zod schema and must hold here too. */
  judge_verdict?: JudgeVerdict;
  /** Failure-mode taxonomy code when `judge_verdict === "incorrect"`.
   *  `null` when verdict is "correct" or when judging is skipped. */
  judge_failure_mode?: FailureMode | null;
  /** One-sentence rationale string the judge returned alongside the
   *  verdict. Not parsed — preserved for human spot-check + downstream
   *  disagreement analysis in Task 3. */
  judge_rationale?: string;
  /** Model id used for the judge call (e.g. `claude-sonnet-4-6`). For
   *  ensemble mode this is `ensemble_majority`; per-judge ids live in
   *  `judge_ensemble[]`. */
  judge_model?: string;
  /** ISO-8601 timestamp of the judge call. Traceability for EU-AI-Act
   *  Art. 14 audit surface. */
  judge_timestamp?: string;
  /** 0.0–1.0 confidence the judge expressed in its verdict. Optional at
   *  the schema level because not every judge prompt variant includes
   *  it; the current §4 prompt does not elicit a confidence number so
   *  this field is reserved for future calibration work. */
  judge_confidence?: number;
  /** When the run used `judgeEnsemble`, the per-judge verdicts with
   *  their own rationales + failure_modes. `judge_verdict` above still
   *  holds the majority. A single-judge run leaves this `undefined`. */
  judge_ensemble?: JudgeEnsembleEntry[];
  // ── H-AUDIT-1 reasoning_content extension (Sprint 11 Task A2, 2026-04-22) ──
  /**
   * Captured chain-of-thought when thinking=on. Per design doc §2.2 +
   * ratification §Q4: persisted in the SAME JSONL row under the same
   * `turnId`, so reconstruction from a single turnId yields the full
   * turn graph including reasoning. Populated by the runner from
   * `LlmCallResult.reasoningContent`.
   *
   * HARD EXCLUSION rules (design doc §2.4): NEVER passed to judges, NEVER
   * written to frames/memory/KG/UI payloads, NEVER exported in summary
   * briefs. Visibility is JSONL-read-only; use `readJsonl(path, {
   * includeReasoning: false })` to prune on the consumer side.
   */
  reasoning_content?: string;
  /**
   * Character count of `reasoning_content`. The canonical observability
   * field for aggregation — `metrics.ts` computes sum / p50 / p95 here,
   * NOT on the content itself. Ratification §Q4 affirms this as
   * non-redundant (separate aggregation surface from the content storage).
   */
  reasoning_content_chars?: number;
  /**
   * Which response-shape yielded the reasoning_content. Ratification §Q3
   * parser precedence: `message.reasoning_content` (DashScope native),
   * `message.reasoning` (OpenRouter unified), `body.reasoning_content`
   * (legacy fallback), or `unknown` when thinking=on was requested but no
   * field was present. `undefined` when thinking was off.
   */
  reasoning_shape?: 'message.reasoning_content' | 'message.reasoning' | 'body.reasoning_content' | 'unknown';
  // ── B2 fold-in (Sprint 11 Task B2, 2026-04-22) ────────────────────────────
  /**
   * Path the tie-break resolver took. `undefined` on single-judge runs and
   * on 3-primary ensembles that reached majority without escalation.
   * `'quadri-vendor'` when 1-1-1 was escalated to `xai/grok-4.20` and
   * resolved. `'pm-escalation'` when even the fourth vote produced 1-1-1-1
   * — accompanied by `judge_error: 'PM_ESCALATION'` so the aggregator
   * treats the row as a skipped judge instance.
   */
  tie_break_path?: 'none' | 'majority' | 'quadri-vendor' | 'pm-escalation';
  /** Fourth-vendor slug when tie_break_path ∈ {quadri-vendor, pm-escalation}. */
  tie_break_fourth_vendor?: string;
}

/** Summary shape emitted at the end of a run — written alongside the JSONL. */
export interface AggregateSummary {
  run: {
    kind: 'cell' | 'control';
    name: string;
    dataset: string;
    model: string;
    seed: number;
    startedAt: string;
    finishedAt: string;
  };
  counts: {
    total: number;
    completed: number;
    failed: number;
    budgetStoppedAt: number | null;
  };
  metrics: {
    meanAccuracy: number;
    p50LatencyMs: number;
    p95LatencyMs: number;
    totalUsd: number;
    meanUsdPerQuery: number;
  };
  failureModes: Record<string, number>;
  /**
   * Sprint 11 Task A2 (2026-04-22): reasoning_content aggregates when at
   * least one record in the run carried a populated `reasoning_content`.
   * Always character counts only — the content itself lives in JSONL only
   * per design doc §2.4 exclusion rule.
   * `undefined` when no records in the run had reasoning (thinking=off
   * runs), so consumers can easily distinguish "no data" from "zero chars".
   */
  reasoningContent?: {
    count: number;        // records with non-empty reasoning_content
    sumChars: number;
    p50Chars: number;
    p95Chars: number;
    shapeDistribution: Record<string, number>;  // e.g. { 'message.reasoning': 200, 'unknown': 2 }
  };
}
