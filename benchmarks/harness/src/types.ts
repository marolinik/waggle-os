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
}

/** One entry in the per-instance JSONL output. Shape intentionally flat so
 *  downstream analysis (pandas, jq, DuckDB) stays trivial. */
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
  failure_mode: string | null;
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
}
