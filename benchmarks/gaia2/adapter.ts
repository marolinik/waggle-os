#!/usr/bin/env tsx
/**
 * Sesija C Phase 3a — Gaia2 ARE adapter (TYPES + DESIGN ONLY).
 *
 * Wraps a Gaia2 task (HuggingFace dataset record) for execution against
 * `runRetrievalAgentLoop` from `@waggle/agent`. Selects a prompt shape per
 * config (`claude::gen1-v1`, `qwen-thinking::gen1-v1`, baselines).
 * Captures per-run telemetry to JSONL.
 *
 * Phase 3b will add: implementation of `runGaia2TaskWithShape`,
 * `loadGaia2TasksFromHf`, `flattenAppStateToCorpus`, the JSONL logger,
 * `config.yaml` parser. Phase 4 (Docker) will add ARE write-action
 * verifier integration; until then `Gaia2RunRecord.pass` stays nullable.
 *
 * ─── SCOPE NOTE — narrow proxy, not full Gaia2 ─────────────────────────
 *
 * Gaia2 is a multi-app tool-use simulation: 12 simulated apps, 101 tools,
 * dynamic event timeline, write-action verifier per scenario. Our
 * `runRetrievalAgentLoop` is a multi-step search-then-finalize agent
 * (HybridSearch retrieval + multi-turn answer synthesis). Semantically
 * these don't naturally compose.
 *
 * Phase 3 adapter implements a NARROW PROXY:
 *   1. Extract the user-facing question from `task.data.metadata.definition`
 *      (Gaia2 task definition includes a description string per HF dataset
 *      card sample structure).
 *   2. Flatten `task.data.apps` initial state into a searchable text corpus
 *      (concatenated app states act as the "world snapshot" the agent can
 *      retrieve from).
 *   3. Run `runRetrievalAgentLoop` with selected shape + question + corpus
 *      search function.
 *   4. Capture raw response + token usage + cost + failure modes.
 *
 * What this adapter is NOT:
 *   - Not a full Gaia2 evaluation (skips event timeline, dynamic state
 *     evolution, multi-app tool calls, write-action state changes).
 *   - Not directly comparable to ARE-native runs (different evaluation
 *     surface; lower bound on what GEPA-evolved variants can achieve).
 *   - Not the path to MemAgents Workshop submission (post-launch Phase 3
 *     sprint Week 4-8 will use ARE-native runtime via Docker — see
 *     `decisions/2026-04-30-pre-launch-sprint-consolidation-LOCKED.md` §5).
 *
 * What this adapter IS:
 *   - Cost-projection ground-truth: real LLM calls on Gaia2-shaped input
 *     give us per-task cost numbers more accurate than paper estimates
 *     (closes Phase 2 §0.3 paper-estimate gap with empirical data).
 *   - Type-fit verification: confirms Gaia2 HF schema parses cleanly
 *     into our retrieval-agent-loop input contract.
 *   - GEPA-variant smoke: detects gross regressions of GEPA-evolved
 *     shapes vs baselines on Gaia2-shaped questions. Positive signal
 *     here is necessary-but-not-sufficient for post-launch Phase 3
 *     sprint Week 6 full-run kickoff.
 *
 * ─── Reference anchors ─────────────────────────────────────────────────
 *
 * - Brief: `briefs/2026-04-30-cc-sesija-C-gaia2-setup-dry-verification.md`
 *   §2.2 Task C3+C4.
 * - HuggingFace dataset card schema verified 2026-04-30 (CC-BY-4.0,
 *   800 scenarios across 6 configs of 200 each):
 *   https://huggingface.co/datasets/meta-agents-research-environments/gaia2
 * - ARE platform pinned SHA: `0330191f` (MIT, 2026-04-20),
 *   `external/meta-agents-research-environments/`.
 * - Phase 2 smoke evidence (output format reference):
 *   `benchmarks/gaia2/smoke-evidence.md` §3+§4.
 * - GEPA-evolved shapes (Faza 1 closure 2026-04-29):
 *   `packages/agent/src/prompt-shapes/gepa-evolved/claude-gen1-v1.ts`
 *   `packages/agent/src/prompt-shapes/gepa-evolved/qwen-thinking-gen1-v1.ts`
 * - Retrieval agent loop entry (line 516 of file):
 *   `packages/agent/src/retrieval-agent-loop.ts::runRetrievalAgentLoop`
 */

import type {
  AgentRunResult,
  LlmCallFn,
  RetrievalSearchFn,
  MultiStepAgentRunConfig,
} from '../../packages/agent/src/retrieval-agent-loop.js';

// ─── Gaia2 dataset record types (HuggingFace schema) ──────────────────

/**
 * One Gaia2 task as loaded from
 * `meta-agents-research-environments/gaia2` HuggingFace dataset.
 *
 * Per HF dataset card sample structure (verified 2026-04-30):
 *   - `id`: stable scenario instance id
 *     (e.g. `0000_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`).
 *   - `scenario_id`: scenario template/family id
 *     (e.g. `scenario_universe_00_id`).
 *   - `split`: dataset split label (`validation`, `test`, `train`).
 *   - `data`: serialized ARE Scenario dataclass (large JSON,
 *     2.44–2.67M chars per scenario per HF card byte-size estimate).
 *
 * `data` is intentionally typed as a record-of-unknown — it is the raw
 * deserialized ARE Scenario JSON. The adapter reads only specific
 * sub-fields (see `Gaia2TaskDefinition`, `Gaia2AppSnapshot`) and never
 * mutates the input record. Casting to richer types is done at the
 * extraction-helper boundary (Phase 3b).
 */
export interface Gaia2HfTask {
  readonly id: string;
  readonly scenario_id: string;
  readonly split: string;
  readonly data: {
    readonly metadata: {
      readonly definition: Record<string, unknown>;
    };
    readonly apps: Record<string, unknown>;
    readonly events: readonly unknown[];
  };
}

/**
 * Subset of `data.metadata.definition` we read. The full ARE Scenario
 * dataclass has dozens of fields; we only care about the user-facing
 * question/instruction text for the narrow-proxy adapter.
 *
 * Phase 3b implementation will runtime-validate via Zod (per
 * common/coding-style.md "validate at system boundaries").
 */
export interface Gaia2TaskDefinition {
  /**
   * The user-visible task description / instruction. Source of truth
   * for the question the agent answers. Field name in ARE source is
   * `description` (see `external/meta-agents-research-environments/are/simulation/scenarios/scenario.py`
   * dataclass field discovery, Phase 3b).
   */
  readonly description: string;
  /**
   * Optional capability tags from ARE `CapabilityTag` enum. Used to
   * tag JSONL records for downstream stratified analysis.
   */
  readonly capability_tags?: readonly string[];
}

/**
 * One simulated-app snapshot from `data.apps`. Adapter flattens these
 * into a search corpus (Phase 3b `flattenAppStateToCorpus`). Schema is
 * app-class-dependent (Email/Calendar/FileSystem/etc. each have
 * different state); adapter treats them as opaque key-value blobs.
 */
export interface Gaia2AppSnapshot {
  readonly class_name: string;
  readonly state?: Record<string, unknown>;
}

// ─── Shape selection types ────────────────────────────────────────────

/**
 * Shape alias passed to `selectShape`. GEPA-evolved variants (gen1-v1)
 * are the Phase 5 deployment-authorized claude + qwen-thinking shapes
 * (per `decisions/2026-04-29-gepa-faza1-results.md` §B). Baseline shapes
 * are controls. Generic-simple + qwen-non-thinking + gpt are present for
 * completeness; not used in the brief's 4-shape sweep.
 */
export type ShapeAlias =
  | 'claude'
  | 'claude-gen1-v1'
  | 'claude-gen1-v2'
  | 'qwen-thinking'
  | 'qwen-thinking-gen1-v1'
  | 'qwen-thinking-gen1-v2'
  | 'gpt'
  | 'gpt-gen1-v1'
  | 'gpt-gen1-v2'
  | 'qwen-non-thinking'
  | 'qwen-non-thinking-gen1-v1'
  | 'qwen-non-thinking-gen1-v2'
  | 'generic-simple'
  | 'generic-simple-gen1-v1'
  | 'generic-simple-gen1-v2';

/**
 * Brief 4-shape sweep (Task C5). The actual config.yaml in Phase 3b
 * will list these exactly.
 */
export const BRIEF_DRY_RUN_SHAPES: readonly ShapeAlias[] = [
  'claude',                  // baseline control 1
  'claude-gen1-v1',          // GEPA-evolved variant 1 (AUTHORIZED Faza 1 §B)
  'qwen-thinking',           // baseline control 2
  'qwen-thinking-gen1-v1',   // GEPA-evolved variant 2 (AUTHORIZED Faza 1 §B)
] as const;

// ─── Failure-mode taxonomy (matches Phase 5 monitoring emitter naming) ──

/**
 * Failure-mode taxonomy aligned with `phase-5-monitoring.ts` emitter
 * naming (per `gepa-phase-5/manifest.yaml` §3). Adapter records ONE
 * primary failure mode per run; multiple causes are folded under a
 * priority cascade (Phase 3b).
 */
export type FailureMode =
  | 'loop_exhausted'    // ran out of steps before finalizing
  | 'timeout'           // exceeded scenario_timeout (ARE-derived; Windows-blocked pre-Docker)
  | 'parse_fail'        // model output couldn't be normalized
  | 'judge_failure'     // self-judge or trio-strict judge errored
  | 'cost_halt'         // perCallHaltUsd or perCellHaltUsd tripped
  | 'llm_error';        // upstream LLM call returned an error

// ─── Adapter run record (one row per JSONL output) ────────────────────

/**
 * One per-task per-shape run record. Written to
 * `benchmarks/gaia2/runs/<ISO_date>/<shape>.jsonl`, one line per record.
 *
 * Schema is intentionally a superset of `output.jsonl` from
 * `are-benchmark run` (smoke-evidence.md §4). The shared fields
 * `task_id`, `scenario_id`, `score` enable cross-comparison if Phase 4
 * Docker run produces ARE-native output for the same task ids.
 */
export interface Gaia2RunRecord {
  // ─── Identity (matches ARE output.jsonl shape) ──────────────────────
  readonly task_id: string;             // Gaia2HfTask.id
  readonly scenario_id: string;         // Gaia2HfTask.scenario_id

  // ─── Adapter-specific ──────────────────────────────────────────────
  readonly shape: ShapeAlias;
  readonly run_number: number;          // 1-indexed, supports Pass@k via re-runs
  readonly started_at: string;          // ISO 8601
  readonly ended_at: string;            // ISO 8601

  // ─── Response capture ──────────────────────────────────────────────
  readonly raw_response: string;
  readonly normalized_response: string;
  readonly prompt_shape_name: string;   // mirror of AgentRunResult.promptShapeName for audit

  // ─── Telemetry ─────────────────────────────────────────────────────
  readonly total_tokens_in: number;
  readonly total_tokens_out: number;
  readonly total_cost_usd: number;
  readonly total_latency_ms: number;
  readonly steps_taken: number;
  readonly retrieval_calls: number;
  readonly loop_exhausted: boolean;

  // ─── Outcome ───────────────────────────────────────────────────────
  /**
   * Pass / fail when verifier is wired. Phase 3 narrow-proxy + Phase 4
   * pre-Docker: stays `null` (not measured). Phase 4 with Docker + ARE
   * write-action verifier: `boolean`. Phase 3 sprint full run with
   * trio-strict judge: `boolean`.
   */
  readonly pass: boolean | null;

  /**
   * Primary failure mode if not `null`. `null` on success or when
   * pass-status is not yet measured.
   */
  readonly failure_mode: FailureMode | null;

  /**
   * Errors collected from `AgentRunResult.errors`. Always an array; may
   * be empty.
   */
  readonly errors: readonly string[];

  // ─── Adapter scope flag ────────────────────────────────────────────
  /**
   * True when this record was produced by the narrow-proxy adapter
   * (Phase 3 / pre-Docker Phase 4). Phase 4 Docker runs flip this to
   * false. Downstream comparison code uses this flag to gate
   * apples-to-apples claims.
   */
  readonly narrow_proxy_run: boolean;
}

// ─── Adapter config (loaded from benchmarks/gaia2/config.yaml in 3b) ─

/**
 * Adapter configuration. Phase 3b parses `config.yaml` into this type
 * via Zod. Field names mirror the brief §2.2 Task C4 spec.
 */
export interface Gaia2AdapterConfig {
  readonly task_count_dry_run: number;          // 5 or 10 per shape (PM ratification γ)
  readonly shapes: readonly ShapeAlias[];       // 4-shape sweep typical
  readonly baseline_shape: ShapeAlias;          // control for relative measurement
  readonly judge_methodology:
    | 'self-judge-dry-run'
    | 'trio-strict'
    | 'write-action-verifier'
    | 'narrow-proxy-no-judge';                  // Phase 3 adapter default (pass=null)
  readonly cost_cap_usd: number;                // hard cap (brief: 10)
  readonly halt_trigger_usd: number;            // soft halt (brief: 8 — γ probe)
  readonly per_call_halt_usd: number;           // per-LLM-call ceiling
  readonly probe_invocation_count: number;      // first-batch-as-probe size (PM ratification γ)
  readonly output_dir_root: string;             // e.g. "benchmarks/gaia2/runs"
  readonly hf_dataset: string;                  // "meta-agents-research-environments/gaia2"
  readonly hf_config: string;                   // "mini" | "search" | etc.
  readonly hf_split: string;                    // "validation"
}

// ─── Phase 3b primary entry points (signatures only) ──────────────────

/**
 * Phase 3b will implement. Loads N tasks from HF dataset (via
 * `huggingface-hub` Python helper called as subprocess OR via direct
 * HTTP from Node — TBD in Phase 3b based on credential availability),
 * caches locally for reproducibility.
 */
export declare function loadGaia2TasksFromHf(
  config: Gaia2AdapterConfig,
  count: number,
): Promise<readonly Gaia2HfTask[]>;

/**
 * Phase 3b will implement. Flattens `task.data.apps` initial-state
 * snapshot into a searchable text corpus suitable for
 * `runRetrievalAgentLoop`'s injected `RetrievalSearchFn`. One "doc" per
 * app, with class_name as identifier and JSON-stringified state as
 * content.
 */
export declare function flattenAppStateToCorpus(
  task: Gaia2HfTask,
): readonly { id: string; content: string }[];

/**
 * Phase 3b will implement. Runs ONE Gaia2 task with ONE shape against
 * `runRetrievalAgentLoop`. Writes one `Gaia2RunRecord` to JSONL.
 * Halts (returns record with `failure_mode: 'cost_halt'`) if any
 * per-call or cumulative threshold tripped.
 */
export declare function runGaia2TaskWithShape(
  task: Gaia2HfTask,
  shape: ShapeAlias,
  config: Gaia2AdapterConfig,
  llmCall: LlmCallFn,
  // search is computed inside via flattenAppStateToCorpus + simple FTS
  runNumber?: number,
): Promise<Gaia2RunRecord>;

/**
 * Phase 3b will implement. Driver for the full dry-run sweep
 * (4 shapes × N tasks). Implements PM ratification γ:
 *   1. Run first `probe_invocation_count` invocations as the probe.
 *   2. Project total cost from probe.
 *   3. Halt-and-PM if projection > halt_trigger_usd.
 *   4. Else continue to full sweep.
 */
export declare function runDryRunSweep(
  config: Gaia2AdapterConfig,
  llmCall: LlmCallFn,
): Promise<{
  readonly probe_records: readonly Gaia2RunRecord[];
  readonly probe_cost_usd: number;
  readonly projected_total_usd: number;
  readonly halt_triggered: boolean;
  readonly full_sweep_records: readonly Gaia2RunRecord[];
  readonly final_total_cost_usd: number;
}>;

// ─── Re-exports for downstream tools ──────────────────────────────────

export type { AgentRunResult, LlmCallFn, RetrievalSearchFn, MultiStepAgentRunConfig };
