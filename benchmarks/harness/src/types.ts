/**
 * Four-cell ablation harness — shared types.
 *
 * The four cells isolate causal contributions to end-to-end quality:
 *   Cell 1 — raw:           LLM only, stateless per turn.
 *   Cell 2 — filtered:      LLM + memory retrieval, no prompt evolution.
 *   Cell 3 — compressed:    LLM + prompt evolution, no memory retrieval.
 *   Cell 4 — full-context:  LLM + memory + prompt evolution.
 *
 * Sprint 12 Task 1 Blocker #2 (2026-04-22) renamed cell keys from the
 * Sprint 10 technical labels to the A3 LOCK publication-ready labels.
 * Architecture unchanged — only key strings. Migration script
 * (benchmarks/scripts/migrate-cell-names.ts) rewrites any legacy JSONL
 * artefacts with the old keys.
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

// ── Sprint 12 Task 2 / §2.1 A3 namespace split (LOCKED 2026-04-23) ──────
// A3 LOCK § 6 failure taxonomy + its aggregate distribution are surfaced
// here as type-only re-exports so any downstream consumer (harness reader,
// exit-ping generator, external audit tooling) gets a single import
// entry point for the canonical A3 taxonomy column types.
export type { FailureCode } from './failure-taxonomy/codes.js';
export type { FailureDistribution } from './failure-taxonomy/aggregate.js';
import type { FailureCode } from './failure-taxonomy/codes.js';
import type { FailureDistribution } from './failure-taxonomy/aggregate.js';
// Sprint 12 Task 2.5 Stage 1 (2026-04-23): Substrate is imported type-only so
// types.ts has zero runtime dependency on substrate.ts / @waggle/core. The
// field threads through RunConfig → runOne → CellInput for the retrieval +
// agentic cells.
import type { Substrate } from './substrate.js';

/**
 * Cell names. Sprint 9 / Sprint 12 Task 1 Blocker #2 shipped the first four
 * (`raw`, `filtered`, `compressed`, `full-context`). Sprint 12 Task 2.5
 * Stage 1 (2026-04-23) added `retrieval` and `agentic` — backed by real
 * `@waggle/core::HybridSearch` and `@waggle/agent::agent-loop` respectively.
 *
 * Sprint 12 Task 2.5 Stage 2-Retry (2026-04-24) added `no-context` — a
 * true zero-memory baseline (question-only prompt, no `instance.context`,
 * no retrieval). The Stage 2 N=20 FAIL exit revealed that Sprint 9 `raw`
 * is NOT a zero-context baseline on LoCoMo (its prompt embeds the
 * oracle-selected `instance.context`); `no-context` is the honest
 * comparator for the retrieval memory-lift criterion.
 *
 * The v3 PM-facing vocabulary for Stage 2-Retry is
 * `[no-context, oracle-context, full-context, retrieval, agentic]`; mapping
 * to harness internal ids via `scripts/run-mini-locomo.ts::V3_TO_V1_CELLS`:
 *   no-context     → no-context      (NEW; true zero-memory baseline)
 *   oracle-context → raw             (alias — oracle-fed diagnostic; harness `raw` kept for back-compat)
 *   full-context   → full-context    (unchanged)
 *   retrieval      → retrieval       (now conv-scope top-K=20)
 *   agentic        → agentic         (now conv-scope + softened SYSTEM_AGENTIC + fallback)
 */
export type CellName =
  | 'raw'
  | 'filtered'
  | 'compressed'
  | 'full-context'
  | 'retrieval'
  | 'agentic'
  | 'no-context';
export type ControlName = 'verbose-fixed';
export type RunKind = { kind: 'cell'; name: CellName } | { kind: 'control'; name: ControlName };

export interface DatasetInstance {
  /** Stable id used in the JSONL record for cross-cell joining. */
  instance_id: string;
  /** Question or task statement shown to the model. */
  question: string;
  /** Dataset-supplied context that raw / compressed cells receive verbatim
   *  and memory cells may ignore in favor of their retrieval layer. */
  context: string;
  /** Canonical reference answer(s) for automated scoring. */
  expected: string[];
  /** Sprint 12 Task 2.5 Stage 2-Retry (2026-04-24): identifier of the
   *  conversation this QA pair was authored within. For LoCoMo this is the
   *  `conversation_id` / `sample_id` carried by the canonical archive (e.g.
   *  `conv-26`). Retrieval + agentic cells use this as a `gopId` filter so
   *  HybridSearch scopes to the instance's conversation only, matching the
   *  QA-pair locality LoCoMo was authored for. Undefined for synthetic runs
   *  and pre-Stage-2-Retry JSONL artefacts. */
  conversation_id?: string;
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

/**
 * Pinning surface enum per B3 LOCK addendum § 4. Tags every model entry
 * (targets + judges) with the audit guarantee it offers:
 *
 *   anthropic_immutable  — Anthropic-direct routes, dated snapshot pinned
 *                          upstream. H-AUDIT-2 spot-check re-runs will hit
 *                          the exact same model bytes.
 *   floating_alias       — provider rotates underlying model silently;
 *                          replication tolerates semantic equivalence only,
 *                          not byte-level match. Requires non-null
 *                          pinning_surface_carve_out_reason.
 *   revision_hash_pinned — provider exposes a revision hash we capture into
 *                          the JSONL row; replication binds to that hash.
 */
export type PinningSurface = 'anthropic_immutable' | 'floating_alias' | 'revision_hash_pinned';

/**
 * Judge ensemble role classification.
 *
 * Sprint 12 Task 1 judge-role remap (2026-04-22, brief
 * `briefs/2026-04-22-cc-sprint-12-task1-judge-role-remap.md`):
 * B2 LOCK § 1 treats Opus 4.7 + GPT-5.4 + Gemini 3.1 as a 3-vendor
 * primary ensemble (all `primary`); Grok 4.20 is the tie-break `reserve`.
 * `secondary` / `tertiary` are retained in the enum for backward
 * compatibility — future models may populate them, but no current entry
 * in models.json uses them after this remap.
 */
export type JudgeRole = 'primary' | 'secondary' | 'tertiary' | 'reserve';

export type ModelProvider =
  | 'alibaba'
  | 'anthropic'
  | 'ollama'
  | 'litellm-proxy'
  | 'local'
  | 'openai_via_openrouter'
  | 'google_via_openrouter'
  | 'xai_via_openrouter';

export interface ModelSpec {
  id: string;
  displayName: string;
  provider: ModelProvider;
  /** Route string the LiteLLM proxy recognizes. */
  litellmModel: string;
  /** USD per 1M input tokens. */
  pricePerMillionInput: number;
  /** USD per 1M output tokens. */
  pricePerMillionOutput: number;
  /** Context window in tokens (for truncation decisions). */
  contextWindow: number;
  // ── Sprint 12 Task 1 Blocker #4 / B3 addendum § 4 fields ─────────────────
  /** Pinning surface classification per B3 LOCK addendum § 4. Absence is
   *  tolerated for pre-Sprint-12 entries but Blocker #4 seeds every entry
   *  explicitly so the models-config test covers the registry. */
  pinning_surface?: PinningSurface;
  /** Human-readable rationale for floating_alias / revision_hash_pinned
   *  entries. MUST be null for anthropic_immutable. MUST be non-null for
   *  the other two surfaces (enforced in models-config.test.ts). */
  pinning_surface_carve_out_reason?: string | null;
  /** Role classification for judge-ensemble entries. Targets (systems under
   *  test) leave this undefined. Primary judges are the 3-vendor ensemble
   *  (Sprint 10 Task 2.2 ratified trio); secondary / tertiary are reserve /
   *  tie-break roles per A3 LOCK § 4. */
  judge_role?: JudgeRole;
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
  // ── Sprint 12 Task 1 Blocker #3 — pre-registration inputs ────────────────
  /** Pre-computed SHA-256 of the bench-spec manifest YAML. When undefined,
   *  the runner resolves the YAML path (env → sibling PM-Waggle-OS → throw)
   *  and computes the hash at run start. */
  manifestHash?: string;
  /** Suppress the `bench.preregistration.manifest_hash` pino-style event
   *  when `false`. Defaults to emitting (true). Tests pass `false` to keep
   *  log noise down. */
  emitPreregistrationEvent?: boolean;
  /** Invocation-level cell list — the full scope of cells this benchmark
   *  invocation spans. Each `runOne` call receives the same list so its
   *  emitted pre-registration event reports the full scope (not the
   *  single-cell subset it runs). Derived from CLI `--per-cell` or
   *  `--all-cells` / `--cell` expansion. */
  perCellList?: string[];
  /** Judge tie-break strategy surfaced into the pre-registration payload. */
  judgeTiebreak?: string;
  /**
   * Resolved judge model roster with per-model pinning fields, already
   * looked up against `config/models.json`. Main() materializes this list
   * once from CLI `--judge-ensemble` args so runOne doesn't re-read the
   * model registry on every cell iteration. Undefined when judging is
   * disabled — pre-registration payload emits an empty array in that case.
   */
  judgeModelsResolved?: import('./preregistration.js').JudgeModelManifestEntry[];
  // ── Sprint 12 Task 2.5 Stage 1 (2026-04-23) — substrate deps for retrieval + agentic cells ─
  /**
   * Ephemeral MindDB + HybridSearch pair built by main() via
   * `createSubstrate({embedder})` and pre-populated via
   * `ingestLoCoMoCorpus(...)` BEFORE any cell fires. Required only when the
   * run roster includes `retrieval` or `agentic`; the other four cells ignore
   * it. Lifecycle is owned by main() — `close()` is called in its `finally`.
   */
  substrate?: Substrate;
  /**
   * LiteLLM URL + API key surfaced to CellInput so the `agentic` cell's
   * inner `runAgentLoop` can talk to the proxy directly (agent-loop does
   * not route through the cell's `LlmClient`). Other cells ignore.
   */
  litellm?: { url: string; apiKey: string };
  /** Retrieval cell top-K override. Default 10 (GATE-S0 lock). */
  retrievalTopK?: number;
  /** Agentic cell turn cap override. Default 3 (GATE-S0 lock). */
  agenticMaxTurns?: number;
  /** Agentic cell AbortController timeout override. Default 180_000 ms. */
  agenticTimeoutMs?: number;
}

/** Judge failure-mode taxonomy codes. Must match the enum the judge module
 *  returns — see `packages/server/src/benchmarks/judge/failure-mode-judge.ts`.
 *
 *  Sprint 9 5-value space. Retained as a legacy read-only surface per the
 *  2026-04-23 `decisions/2026-04-23-jsonl-record-taxonomy-split-locked.md`
 *  namespace-split LOCK — C2 stage 1 and pre-A3 JSONL archives continue to
 *  parse against this shape. A3 LOCK § 6 callers use `FailureCode` (8-value)
 *  from `./failure-taxonomy/codes.js` via the `a3_failure_code` / `a3_rationale`
 *  columns on `JsonlRecord` below. */
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
  // ── Sprint 12 Task 1 Blocker #1 — dataset version (2026-04-22) ────────────
  /**
   * SHA-256 of the canonical dataset archive (or the static
   * `synthetic-scaffold-v1` string for synthetic runs). Populated by the
   * runner from `getDatasetVersion(dataset, dataRoot)` and attached per-row
   * so any downstream replication check can resolve the exact input set
   * from a single JSONL line.
   */
  dataset_version?: string;
  // ── Sprint 12 Task 1 Blocker #3 / B3 addendum § 4 piggy-back ─────────────
  /**
   * Pinning surface classification for the target model that produced this
   * row. Populated by the runner from `config.model.pinning_surface`. A row
   * without this field belongs to a pre-Sprint-12 artefact (backward-compat
   * tolerated via optional).
   */
  model_pinning_surface?: PinningSurface;
  /**
   * Non-null rationale when `model_pinning_surface === 'floating_alias'` or
   * `revision_hash_pinned`. Null for `anthropic_immutable`. The exact text
   * is copied verbatim from `config/models.json` so a grep across JSONL
   * artefacts recovers the full carve-out set per B3 addendum § 5.
   */
  model_pinning_carve_out_reason?: string | null;
  /**
   * Provider-exposed revision hash (e.g., OpenRouter `revision_id`, vLLM
   * `model_hash`) when available. Null when the provider does not surface
   * one — floating-alias runs set this to null. Future hook: Session 3+
   * wires provider-specific extraction where applicable.
   */
  model_revision_hash?: string | null;
  // ── Sprint 12 Task 2 §2.1 A3 namespace split (LOCKED 2026-04-23) ─────────
  /**
   * A3 LOCK § 6 failure taxonomy code (8-value: null | F1..F6 | F_other)
   * per `decisions/2026-04-23-jsonl-record-taxonomy-split-locked.md`.
   *
   * On A3 pipeline writes this column is populated for every judged row
   * (default `null` for correct verdicts). Pre-Sprint-12 JSONL artefacts
   * (C2 stage 1, B1/B2/B3 smoke) do NOT carry this field — consumers that
   * handle both arcs treat `undefined` as "pre-A3 row, use Sprint 9
   * `judge_failure_mode` instead".
   *
   * Authoritative column for all A3 exit criteria (Task 2 brief §6
   * criterion +12) and downstream grep (`jq '.a3_failure_code'`). Sprint 9
   * `judge_failure_mode` above is retained as a read-only legacy surface.
   */
  a3_failure_code?: FailureCode;
  /**
   * A3 rationale. MUST be a non-empty ≥10-token string when
   * `a3_failure_code === 'F_other'` (enforced by
   * `failure-taxonomy/validator.ts`). `null` for correct verdicts and
   * F1..F6 codes where rationale is optional.
   */
  a3_rationale?: string | null;
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
  /**
   * Sprint 12 Task 2 §2.1 (LOCKED 2026-04-23): A3 LOCK § 6 failure
   * distribution computed from the `a3_failure_code` + `a3_rationale`
   * columns of every judged row. `undefined` when the run contained zero
   * A3-namespace rows (pre-Sprint-12 run or judge disabled).
   *
   * Authoritative source for Task 2 brief §6 exit criterion +12 grep
   * (`jq '.a3_failure_code' *.jsonl | sort | uniq -c` ↔ `counts`) and for
   * A3 LOCK § 6 F_other ≥10% review-flag tripwire.
   */
  failure_distribution?: FailureDistribution;
}
