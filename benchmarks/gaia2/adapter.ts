#!/usr/bin/env tsx
/**
 * Sesija C Phase 3b — Gaia2 ARE narrow-proxy adapter (IMPLEMENTATION).
 *
 * Wraps a Gaia2 task (HuggingFace dataset record) for execution against
 * `runRetrievalAgentLoop` from `@waggle/agent`. Selects a prompt shape per
 * config (`claude-gen1-v1`, `qwen-thinking-gen1-v1`, baselines).
 * Captures per-run telemetry to JSONL.
 *
 * Phase 3a was types-only (commit b93db4c). Phase 3b adds real function
 * bodies. See Phase 3a SCOPE NOTE below for narrow-proxy intent — this
 * adapter is NOT a full Gaia2 evaluation; it is cost-projection
 * ground-truth + GEPA-variant smoke + type-fit verification.
 *
 * ─── Reference anchors (unchanged from Phase 3a) ─────────────────────
 *
 * - Brief: briefs/2026-04-30-cc-sesija-C-gaia2-setup-dry-verification.md §2.2
 * - HF dataset: huggingface.co/datasets/meta-agents-research-environments/gaia2 (CC-BY-4.0)
 * - ARE pinned SHA: 0330191f (MIT, 2026-04-20)
 * - Phase 2 smoke: benchmarks/gaia2/smoke-evidence.md §3+§4
 * - GEPA shapes: packages/agent/src/prompt-shapes/gepa-evolved/
 * - Retrieval loop: packages/agent/src/retrieval-agent-loop.ts::runRetrievalAgentLoop (line 516)
 * - PM ratifications: 1B (branch base), γ (probe), A (narrow-proxy scope)
 * - Faza 1 LlmCallFn pattern: benchmarks/gepa/scripts/faza-1/run-gen-1.ts:230
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  runRetrievalAgentLoop,
  type AgentRunResult,
  type LlmCallFn,
  type RetrievalSearchFn,
  type MultiStepAgentRunConfig,
} from '../../packages/agent/src/retrieval-agent-loop.js';
import {
  registerShape,
  REGISTRY,
} from '../../packages/agent/src/prompt-shapes/index.js';
import type { PromptShape } from '../../packages/agent/src/prompt-shapes/types.js';

// ─── Gaia2 dataset record types (HuggingFace schema) ──────────────────

export interface Gaia2HfTask {
  readonly id: string;
  readonly scenario_id: string;
  readonly split: string;
  /**
   * HF top-level `category` field (mini/standard/agent2agent/noise/...
   * routing tag — observed at first probe dump 2026-04-30, NOT
   * documented in HF dataset card sample). Treat as informational; not
   * consumed by the narrow-proxy adapter.
   */
  readonly category?: string;
  /**
   * NOTE: HF stores `data` on disk as a SERIALIZED JSON STRING (not a
   * nested object — HF dataset card sample shows the post-parse form).
   * dump-tasks.py parses the string at dump time so on-disk JSONL we
   * load here has data as the structured object.
   *
   * SCHEMA NOTES (verified against first probe dump 2026-04-30,
   * `mini/validation/0741_*`):
   *   - `apps` is an ARRAY of `{app_state, class_name, name}` objects
   *     (12 apps for `mini` config; HF dataset card showed it as a
   *     dict for documentation simplicity).
   *   - `events` is an ARRAY of `{action, class_name, dependencies,
   *     event_id, event_relative_time, event_time, event_type,
   *     metadata}` objects. `event_type` ∈ {'USER', 'AGENT', 'ENV', ...}.
   *     The user instruction lives in events with `event_type==='USER'`,
   *     `action.function==='send_message_to_agent'`, with the message
   *     text in `action.args[].value` where `args[].name==='content'`.
   *   - `metadata.definition` carries scenario-level metadata
   *     (`duration`, `hints`, `scenario_id`, `start_time`, `tags`) but
   *     NOT the user-facing instruction. Description extraction routes
   *     through events. See `extractTaskDescription` impl.
   *   - `data` may also carry `augmentation` and `version` siblings,
   *     not consumed by the narrow-proxy adapter.
   */
  readonly data: {
    readonly metadata: {
      readonly definition: Record<string, unknown>;
    };
    /** Array per real schema; HF card showed dict for doc simplicity. */
    readonly apps: readonly Record<string, unknown>[] | Record<string, unknown>;
    readonly events: readonly Record<string, unknown>[];
  };
}

export interface Gaia2TaskDefinition {
  readonly description: string;
  readonly capability_tags?: readonly string[];
}

export interface Gaia2AppSnapshot {
  readonly class_name: string;
  readonly state?: Record<string, unknown>;
}

// ─── Shape selection types ────────────────────────────────────────────

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

export const BRIEF_DRY_RUN_SHAPES: readonly ShapeAlias[] = [
  'claude',
  'claude-gen1-v1',
  'qwen-thinking',
  'qwen-thinking-gen1-v1',
] as const;

// ─── Failure-mode taxonomy ────────────────────────────────────────────

export type FailureMode =
  | 'loop_exhausted'
  | 'timeout'
  | 'parse_fail'
  | 'judge_failure'
  | 'cost_halt'
  | 'llm_error';

// ─── Adapter run record (one row per JSONL output) ────────────────────

export interface Gaia2RunRecord {
  readonly task_id: string;
  readonly scenario_id: string;
  readonly shape: ShapeAlias;
  readonly run_number: number;
  readonly started_at: string;
  readonly ended_at: string;
  readonly raw_response: string;
  readonly normalized_response: string;
  readonly prompt_shape_name: string;
  readonly total_tokens_in: number;
  readonly total_tokens_out: number;
  readonly total_cost_usd: number;
  readonly total_latency_ms: number;
  readonly steps_taken: number;
  readonly retrieval_calls: number;
  readonly loop_exhausted: boolean;
  readonly pass: boolean | null;
  readonly failure_mode: FailureMode | null;
  readonly errors: readonly string[];
  readonly narrow_proxy_run: boolean;
}

// ─── Adapter config ───────────────────────────────────────────────────

export interface Gaia2AdapterConfig {
  readonly task_count_dry_run: number;
  readonly shapes: readonly ShapeAlias[];
  readonly baseline_shape: ShapeAlias;
  readonly judge_methodology:
    | 'self-judge-dry-run'
    | 'trio-strict'
    | 'write-action-verifier'
    | 'narrow-proxy-no-judge';
  readonly cost_cap_usd: number;
  readonly halt_trigger_usd: number;
  readonly per_call_halt_usd: number;
  readonly probe_invocation_count: number;
  readonly output_dir_root: string;
  readonly hf_dataset: string;
  readonly hf_config: string;
  readonly hf_split: string;
}

// ─── Shape → model mapping ────────────────────────────────────────────
// gen1-v1 variants run on the SAME model as their baseline (the prompt
// shape is the manipulated variable, not the model). Aligns with Faza 1
// methodology where shape-evolution effect is measured on a fixed model.

const SHAPE_TO_MODEL: Record<ShapeAlias, string> = {
  claude: 'claude-opus-4-7',
  'claude-gen1-v1': 'claude-opus-4-7',
  'claude-gen1-v2': 'claude-opus-4-7',
  'qwen-thinking': 'qwen3.6-35b-a3b',
  'qwen-thinking-gen1-v1': 'qwen3.6-35b-a3b',
  'qwen-thinking-gen1-v2': 'qwen3.6-35b-a3b',
  'qwen-non-thinking': 'qwen3.6-35b-a3b',
  'qwen-non-thinking-gen1-v1': 'qwen3.6-35b-a3b',
  'qwen-non-thinking-gen1-v2': 'qwen3.6-35b-a3b',
  gpt: 'gpt-5.4',
  'gpt-gen1-v1': 'gpt-5.4',
  'gpt-gen1-v2': 'gpt-5.4',
  'generic-simple': 'claude-haiku-4-5',
  'generic-simple-gen1-v1': 'claude-haiku-4-5',
  'generic-simple-gen1-v2': 'claude-haiku-4-5',
};

// ─── GEPA-evolved shape registration (lazy, idempotent) ───────────────
// Same pattern as benchmarks/gepa/scripts/faza-1/run-gen-1.ts:405-409.
// Shape `name` field is the REGISTRY key (hyphen format). Keep the set
// minimal — we register only the shapes referenced in BRIEF_DRY_RUN_SHAPES.

const GEPA_EVOLVED_FILES: Readonly<Record<ShapeAlias, string>> = Object.freeze({
  'claude-gen1-v1': '../../packages/agent/src/prompt-shapes/gepa-evolved/claude-gen1-v1.js',
  'claude-gen1-v2': '../../packages/agent/src/prompt-shapes/gepa-evolved/claude-gen1-v2.js',
  'qwen-thinking-gen1-v1': '../../packages/agent/src/prompt-shapes/gepa-evolved/qwen-thinking-gen1-v1.js',
  'qwen-thinking-gen1-v2': '../../packages/agent/src/prompt-shapes/gepa-evolved/qwen-thinking-gen1-v2.js',
  'gpt-gen1-v1': '../../packages/agent/src/prompt-shapes/gepa-evolved/gpt-gen1-v1.js',
  'gpt-gen1-v2': '../../packages/agent/src/prompt-shapes/gepa-evolved/gpt-gen1-v2.js',
  'qwen-non-thinking-gen1-v1': '../../packages/agent/src/prompt-shapes/gepa-evolved/qwen-non-thinking-gen1-v1.js',
  'qwen-non-thinking-gen1-v2': '../../packages/agent/src/prompt-shapes/gepa-evolved/qwen-non-thinking-gen1-v2.js',
  'generic-simple-gen1-v1': '../../packages/agent/src/prompt-shapes/gepa-evolved/generic-simple-gen1-v1.js',
  'generic-simple-gen1-v2': '../../packages/agent/src/prompt-shapes/gepa-evolved/generic-simple-gen1-v2.js',
  // Baselines are pre-registered via prompt-shapes/index.ts; map to empty path.
  claude: '',
  'qwen-thinking': '',
  'qwen-non-thinking': '',
  gpt: '',
  'generic-simple': '',
});

const registeredShapes = new Set<ShapeAlias>();

export async function ensureShapeRegistered(shape: ShapeAlias): Promise<void> {
  if (registeredShapes.has(shape)) return;
  if (REGISTRY[shape] !== undefined) {
    registeredShapes.add(shape);
    return;
  }
  const filePath = GEPA_EVOLVED_FILES[shape];
  if (!filePath) {
    throw new Error(
      `ensureShapeRegistered: shape "${shape}" not in REGISTRY and not a GEPA-evolved file (baseline shapes are pre-registered via prompt-shapes/index.ts).`,
    );
  }
  // Resolve relative path to absolute file:// URL for ESM dynamic import on Windows.
  const adapterDir = path.dirname(new URL(import.meta.url).pathname.replace(/^\//, ''));
  const absPath = path.resolve(adapterDir, filePath.replace(/\.js$/, '.ts'));
  const mod: Record<string, unknown> = await import(pathToFileURL(absPath).href);
  // Find the exported PromptShape (single export per file convention,
  // mirrors run-gen-1.ts:215).
  const promptShape = Object.values(mod).find(
    (v): v is PromptShape =>
      typeof v === 'object' &&
      v !== null &&
      'name' in v &&
      'systemPrompt' in v &&
      'soloUserPrompt' in v,
  );
  if (!promptShape) {
    throw new Error(`ensureShapeRegistered: no PromptShape export in ${absPath}`);
  }
  registerShape(promptShape.name, promptShape);
  registeredShapes.add(shape);
}

// ─── Loaders ──────────────────────────────────────────────────────────

export function loadGaia2TasksFromJsonl(
  filepath: string,
  limit: number,
): readonly Gaia2HfTask[] {
  if (!fs.existsSync(filepath)) {
    throw new Error(
      `loadGaia2TasksFromJsonl: file not found: ${filepath}\n` +
        `Run benchmarks/gaia2/scripts/dump-tasks.py first to produce this file.`,
    );
  }
  const raw = fs.readFileSync(filepath, 'utf-8');
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const tasks: Gaia2HfTask[] = [];
  for (let i = 0; i < Math.min(limit, lines.length); i++) {
    try {
      tasks.push(JSON.parse(lines[i]) as Gaia2HfTask);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`loadGaia2TasksFromJsonl: parse error on line ${i + 1}: ${msg}`);
    }
  }
  return tasks;
}

// ─── Task → corpus + question extraction ──────────────────────────────

export function flattenAppStateToCorpus(
  task: Gaia2HfTask,
): readonly { id: string; content: string }[] {
  const docs: { id: string; content: string }[] = [];

  // `apps` is an ARRAY of {app_state, class_name, name} per real schema
  // (HF card sample showed dict — doc simplification). Handle both for
  // forward-compat.
  const appsList: readonly Record<string, unknown>[] = Array.isArray(task.data.apps)
    ? (task.data.apps as readonly Record<string, unknown>[])
    : (Object.values(task.data.apps) as readonly Record<string, unknown>[]);

  for (const app of appsList) {
    const className = typeof app.class_name === 'string' ? app.class_name : 'UnknownApp';
    const name = typeof app.name === 'string' ? app.name : className;
    // Real format uses `app_state` key for the app's initial-state JSON;
    // HF card sample showed `state`. Try both.
    const state = app.app_state ?? app.state ?? app;
    let stateJson: string;
    try {
      stateJson = JSON.stringify(state, null, 2);
    } catch {
      stateJson = '(unserializable app state)';
    }
    docs.push({
      id: `app:${name}`,
      content: `[${className}] ${name}\n${stateJson}`,
    });
  }

  // Task definition itself goes into the corpus so the agent can
  // retrieve task-related metadata (tags, hints, duration).
  let defJson: string;
  try {
    defJson = JSON.stringify(task.data.metadata.definition, null, 2);
  } catch {
    defJson = '(unserializable task definition)';
  }
  docs.push({
    id: 'task:definition',
    content: `[Task Definition]\n${defJson}`,
  });

  return docs;
}

/**
 * Extracts the user instruction from a Gaia2 task.
 *
 * Real schema: instruction lives in events with `event_type === 'USER'`,
 * `action.function === 'send_message_to_agent'`, with the text in
 * `action.args[]` where `args[i].name === 'content'`. A scenario can have
 * multiple USER events injected over time (multi-turn). For the narrow
 * proxy we concatenate them into one prompt block — the agent doesn't
 * see the time evolution but does see the cumulative ask.
 *
 * Falls back through:
 *   1. definition.description (HF card schema; not present in mini/validation
 *      first probe but may be present in other configs)
 *   2. definition.instruction / definition.task (defensive)
 *   3. concatenated user-message events (real schema, primary path)
 *   4. stringified definition + tags (last-resort, never empty question)
 */
export function extractTaskDescription(task: Gaia2HfTask): string {
  const def = task.data.metadata.definition as Record<string, unknown>;

  // Strategy 1: HF card sample fields (defensive).
  if (typeof def.description === 'string' && def.description.trim().length > 0) {
    return def.description;
  }
  if (typeof def.instruction === 'string' && def.instruction.trim().length > 0) {
    return def.instruction;
  }
  if (typeof def.task === 'string' && def.task.trim().length > 0) {
    return def.task;
  }

  // Strategy 2: extract from USER events (primary path for real schema).
  const events = task.data.events;
  const userMessages: string[] = [];
  for (const ev of events) {
    if (ev.event_type !== 'USER') continue;
    const action = ev.action as Record<string, unknown> | undefined;
    if (!action) continue;
    const args = action.args;
    if (Array.isArray(args)) {
      for (const arg of args) {
        const argObj = arg as Record<string, unknown>;
        const name = argObj.name;
        const value = argObj.value;
        if (
          typeof value === 'string' &&
          (name === 'content' || name === 'message' || name === 'text')
        ) {
          userMessages.push(value);
        }
      }
    } else if (typeof args === 'object' && args !== null) {
      const argsObj = args as Record<string, unknown>;
      const candidate = argsObj.content ?? argsObj.message ?? argsObj.text;
      if (typeof candidate === 'string' && candidate.trim().length > 0) {
        userMessages.push(candidate);
      }
    }
  }
  if (userMessages.length > 0) {
    return userMessages.length === 1
      ? userMessages[0]
      : userMessages
          .map((m, i) => `--- User message ${i + 1}/${userMessages.length} ---\n${m}`)
          .join('\n\n');
  }

  // Strategy 3: fallback (never empty question).
  const tags = Array.isArray(def.tags) ? (def.tags as readonly string[]).join(', ') : '';
  return `Gaia2 scenario ${task.id} (tags: ${tags || 'none'}). Definition: ${JSON.stringify(def).slice(0, 500)}`;
}

// ─── Simple in-memory FTS RetrievalSearchFn ──────────────────────────
// Substring-match scoring is intentionally minimal — the narrow-proxy
// adapter is NOT trying to optimize retrieval quality. It's verifying
// the adapter contract end-to-end. Phase 4 Docker run uses ARE-native
// app interactions, no synthetic search.

export function buildSimpleSearch(
  corpus: readonly { id: string; content: string }[],
): RetrievalSearchFn {
  const lowercased = corpus.map((doc) => ({
    id: doc.id,
    content: doc.content,
    lower: doc.content.toLowerCase(),
  }));

  return async (input) => {
    const tokens = input.query
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 2);

    const scored = lowercased.map((doc) => {
      let score = 0;
      for (const tok of tokens) {
        if (doc.lower.includes(tok)) score += 1;
      }
      return { id: doc.id, content: doc.content, score };
    });

    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, input.limit).filter((d) => d.score > 0);

    if (top.length === 0) {
      return { formattedResults: '(no results matched the query in the available app state)', resultCount: 0 };
    }

    const formatted = top.map((d) => `## ${d.id}\n${d.content}`).join('\n\n---\n\n');
    return { formattedResults: formatted, resultCount: top.length };
  };
}

// ─── Failure-mode classifier (post-hoc, from AgentRunResult) ─────────

function classifyFailure(
  result: AgentRunResult | null,
  errMessage: string | null,
): FailureMode | null {
  if (!result && !errMessage) return null;
  if (errMessage) {
    const lower = errMessage.toLowerCase();
    if (lower.includes('cost') || lower.includes('halt')) return 'cost_halt';
    if (lower.includes('parse')) return 'parse_fail';
    if (lower.includes('judge')) return 'judge_failure';
    if (lower.includes('timeout')) return 'timeout';
    return 'llm_error';
  }
  if (result?.loopExhausted) return 'loop_exhausted';
  return null;
}

// ─── Main: run one task with one shape ────────────────────────────────

export async function runGaia2TaskWithShape(
  task: Gaia2HfTask,
  shape: ShapeAlias,
  config: Gaia2AdapterConfig,
  llmCall: LlmCallFn,
  runNumber: number = 1,
): Promise<Gaia2RunRecord> {
  await ensureShapeRegistered(shape);

  const startedAt = new Date().toISOString();
  const startMs = Date.now();

  const question = extractTaskDescription(task);
  const corpus = flattenAppStateToCorpus(task);
  const search = buildSimpleSearch(corpus);
  const model = SHAPE_TO_MODEL[shape];

  let result: AgentRunResult | null = null;
  let errMessage: string | null = null;

  const runConfig: MultiStepAgentRunConfig = {
    modelAlias: model,
    persona:
      'You are an AI agent operating within a simulated environment with multiple applications. ' +
      'Use the search tool to retrieve relevant app state, then answer the user task. ' +
      'Be concise and decisive.',
    question,
    llmCall,
    search,
    promptShapeOverride: shape,
    perCallHaltUsd: config.per_call_halt_usd,
    perCellHaltUsd: config.per_call_halt_usd * 5,
    maxSteps: 5,
    maxRetrievalsPerStep: 8,
    contextTag: `gaia2-narrow-proxy:${task.id}:${shape}:run${runNumber}`,
  };

  try {
    result = await runRetrievalAgentLoop(runConfig);
  } catch (err: unknown) {
    errMessage = err instanceof Error ? err.message : String(err);
  }

  const endedAt = new Date().toISOString();
  const errors: string[] = [];
  if (errMessage) errors.push(errMessage);
  if (result?.errors) errors.push(...result.errors);

  return {
    task_id: task.id,
    scenario_id: task.scenario_id,
    shape,
    run_number: runNumber,
    started_at: startedAt,
    ended_at: endedAt,
    raw_response: result?.rawResponse ?? '',
    normalized_response: result?.normalizedResponse ?? '',
    prompt_shape_name: result?.promptShapeName ?? shape,
    total_tokens_in: result?.totalTokensIn ?? 0,
    total_tokens_out: result?.totalTokensOut ?? 0,
    total_cost_usd: result?.totalCostUsd ?? 0,
    total_latency_ms: result?.totalLatencyMs ?? Date.now() - startMs,
    steps_taken: result?.stepsTaken ?? 0,
    retrieval_calls: result?.retrievalCalls ?? 0,
    loop_exhausted: result?.loopExhausted ?? false,
    pass: null, // Phase 4 Docker + ARE write-action verifier wires this.
    failure_mode: classifyFailure(result, errMessage),
    errors,
    narrow_proxy_run: true,
  };
}

// ─── Driver: γ probe-first sweep ──────────────────────────────────────

export interface DryRunSweepResult {
  readonly probe_records: readonly Gaia2RunRecord[];
  readonly probe_cost_usd: number;
  readonly projected_total_usd: number;
  readonly halt_triggered: boolean;
  readonly full_sweep_records: readonly Gaia2RunRecord[];
  readonly final_total_cost_usd: number;
}

export async function runDryRunSweep(
  config: Gaia2AdapterConfig,
  llmCall: LlmCallFn,
  options: {
    tasksFile: string;
    /** If true, halt after probe regardless of projection (for Phase 3b sample). */
    haltAfterProbe?: boolean;
  },
): Promise<DryRunSweepResult> {
  const tasks = loadGaia2TasksFromJsonl(options.tasksFile, config.task_count_dry_run);

  if (tasks.length === 0) {
    throw new Error(`runDryRunSweep: no tasks loaded from ${options.tasksFile}`);
  }

  // Probe: round-robin invocations across (task, shape) pairs until
  // probe_invocation_count is reached.
  const probe_records: Gaia2RunRecord[] = [];
  let probe_cost_usd = 0;
  let invocationsRun = 0;

  outer: for (const task of tasks) {
    for (const shape of config.shapes) {
      if (invocationsRun >= config.probe_invocation_count) break outer;
      const rec = await runGaia2TaskWithShape(task, shape, config, llmCall, 1);
      probe_records.push(rec);
      probe_cost_usd += rec.total_cost_usd;
      invocationsRun++;
    }
  }

  // Project full sweep cost from probe.
  const totalInvocations = config.shapes.length * config.task_count_dry_run;
  const avgCostPerInvocation =
    probe_records.length > 0 ? probe_cost_usd / probe_records.length : 0;
  const projected_total_usd = avgCostPerInvocation * totalInvocations;
  const halt_triggered =
    options.haltAfterProbe === true || projected_total_usd > config.halt_trigger_usd;

  if (halt_triggered) {
    return {
      probe_records,
      probe_cost_usd,
      projected_total_usd,
      halt_triggered: true,
      full_sweep_records: probe_records,
      final_total_cost_usd: probe_cost_usd,
    };
  }

  // Continue full sweep. Skip the (task, shape) pairs already covered
  // by the probe.
  const fullRecords: Gaia2RunRecord[] = [...probe_records];
  let totalCost = probe_cost_usd;
  const probeKeys = new Set(probe_records.map((r) => `${r.task_id}::${r.shape}`));

  for (const task of tasks) {
    for (const shape of config.shapes) {
      const key = `${task.id}::${shape}`;
      if (probeKeys.has(key)) continue;
      // Cost-cap check before each invocation (defensive — per-call halt
      // also enforced via runConfig).
      if (totalCost >= config.cost_cap_usd) {
        return {
          probe_records,
          probe_cost_usd,
          projected_total_usd,
          halt_triggered: true,
          full_sweep_records: fullRecords,
          final_total_cost_usd: totalCost,
        };
      }
      const rec = await runGaia2TaskWithShape(task, shape, config, llmCall, 1);
      fullRecords.push(rec);
      totalCost += rec.total_cost_usd;
    }
  }

  return {
    probe_records,
    probe_cost_usd,
    projected_total_usd,
    halt_triggered: false,
    full_sweep_records: fullRecords,
    final_total_cost_usd: totalCost,
  };
}

// ─── JSONL writer ─────────────────────────────────────────────────────

export function writeRecordsToJsonl(
  records: readonly Gaia2RunRecord[],
  outputPath: string,
): void {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const lines = records.map((r) => JSON.stringify(r)).join('\n');
  fs.writeFileSync(outputPath, lines + (lines.length > 0 ? '\n' : ''), 'utf-8');
}

// ─── Re-exports ───────────────────────────────────────────────────────

export type { AgentRunResult, LlmCallFn, RetrievalSearchFn, MultiStepAgentRunConfig };
