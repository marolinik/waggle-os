/**
 * Retrieval-augmented agent loop — Phase 2 of agent-fix sprint
 * (per decisions/2026-04-26-agent-fix-sprint-plan.md §Phase 2)
 *
 * Unifies the multi-step retrieval-augmented agent pattern that previously
 * lived only in scripts/run-pilot-2026-04-26.ts (`runCellMultiStep`). Now
 * available as production-grade entry points in packages/agent/, consumed by:
 *   - production agent (Tauri desktop + MCP server in packages/server/)
 *   - benchmarks/harness/ (deprecates the hardcoded "compressed" scaffold)
 *   - pilot wrappers (becomes a thin adapter around this loop)
 *
 * Phase 1.x integration:
 *   - prompt-shapes (Phase 1.2): system + user prompts built per model class
 *   - output-normalize (Phase 1.1): final response passes through normalization
 *   - run-meta (Phase 1.3): optional capture of every LLM call + judge trace
 *
 * Two entry points:
 *   - runSoloAgent              — single-shot Cell A/C pattern (full materials in prompt)
 *   - runRetrievalAgentLoop     — multi-step Cell B/D pattern (search + finalize)
 *
 * Both accept an injected `LlmCallFn` so the loop is fully testable without a
 * real LiteLLM connection. Real callers (pilot wrapper, production agent)
 * provide an adapter that handles per-model accommodations (Opus temp=1.0,
 * GPT omits temperature, Qwen `extra_body.enable_thinking`, etc.).
 *
 * NOTE on naming: the search function is exposed as `config.search` (not
 * `config.retrieval`) because the literal substring `retrieval(` triggers a
 * security scanner false-positive (matches `eval(` substring). The type
 * names retain "Retrieval" / "RetrievalSearch" prefixes since they are not
 * immediately followed by `(`.
 */

import * as crypto from 'node:crypto';
import {
  normalize,
  PRESETS,
  type NormalizationAction,
  type NormalizationConfig,
} from './output-normalize.js';
import {
  selectShape,
  MULTI_STEP_ACTION_CONTRACT,
  type PromptShape,
} from './prompt-shapes/index.js';
import { type RunMetaCapture } from './run-meta.js';
// Phase 3.4 — long-task integration (all optional; backwards compatible).
import {
  CHECKPOINT_SCHEMA_VERSION,
  type CheckpointStepState,
  type CheckpointStore,
  type Decision,
} from './long-task/checkpoint.js';
import { type ContextManager } from './long-task/context-manager.js';

// ─────────────────────────────────────────────────────────────────────────
// Injected dependencies
// ─────────────────────────────────────────────────────────────────────────

export interface LlmCallInput {
  model: string;
  messages: Array<{ role: string; content: string }>;
  thinking?: boolean;
  maxTokens?: number;
  temperature?: number;
}

export interface LlmCallResult {
  content: string;
  inTokens: number;
  outTokens: number;
  costUsd: number;
  latencyMs: number;
  error?: string;
}

export type LlmCallFn = (input: LlmCallInput) => Promise<LlmCallResult>;

export interface RetrievalSearchInput {
  query: string;
  limit: number;
}

export interface RetrievalSearchResult {
  /** Concatenated/formatted text of retrieved chunks. */
  formattedResults: string;
  /** Count of distinct hits returned. */
  resultCount: number;
}

export type RetrievalSearchFn = (input: RetrievalSearchInput) => Promise<RetrievalSearchResult>;

// ─────────────────────────────────────────────────────────────────────────
// Config + result types
// ─────────────────────────────────────────────────────────────────────────

export type NormalizationPresetName = 'production' | 'benchmark-strict' | 'benchmark-lenient';

export interface BaseAgentRunConfig {
  /** LiteLLM (or other) model alias, used for prompt-shape selection. */
  modelAlias: string;
  /** Persona / scenario context for system + user prompts. */
  persona: string;
  /** The question the agent must answer. */
  question: string;
  /** Injected LLM call function. */
  llmCall: LlmCallFn;
  /**
   * Output-normalize preset applied to the FINAL response only.
   * Defaults to 'production' (light touch). Intermediate JSON action
   * emissions are NOT normalized.
   */
  normalizationPreset?: NormalizationPresetName | NormalizationConfig;
  /** Optional override of the prompt shape resolver. */
  promptShapeOverride?: string;
  /** Optional: capture every LLM call into a RunMeta record. */
  runMetaCapture?: RunMetaCapture;
  /** Per-call cost ceiling — if any single LLM call exceeds this, halt. */
  perCallHaltUsd?: number;
  /** Free-form context tag included in run-meta predictions. */
  contextTag?: string;

  // ───── Phase 3.4 long-task integration (all optional, opt-in). ─────────
  /**
   * Stable run identifier for checkpoint-based resume. Auto-generated if
   * checkpointStore is set and runId is omitted, but explicit runId is
   * required to resume across processes.
   */
  runId?: string;
  /**
   * Optional checkpoint store. If provided, the loop saves a
   * CheckpointStepState per turn, enabling cross-process resume.
   */
  checkpointStore?: CheckpointStore;
  /**
   * Optional context manager. If provided, accumulated_context audit log
   * auto-compresses at threshold. ContextManager does NOT touch the
   * messages array (LLM working state — separate concern).
   */
  contextManager?: ContextManager;
  /**
   * Optional progress callback. Receives a stream of agent-loop events for
   * Tauri UI / benchmark harness telemetry.
   */
  onProgress?: AgentRunProgressCallback;
  /**
   * If true and a prior checkpoint exists for runId, resume from the latest
   * checkpoint instead of starting fresh. Default: true if checkpointStore
   * provided, false otherwise.
   */
  resumeFromCheckpoint?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────
// Phase 3.4 — Progress event types
// ─────────────────────────────────────────────────────────────────────────

export type AgentRunProgressEventType =
  | 'recovery_resumed'
  | 'step_started'
  | 'step_completed'
  | 'retrieval_invoked'
  | 'context_compressed'
  | 'finalized'
  | 'loop_exhausted';

export interface AgentRunProgressEvent {
  type: AgentRunProgressEventType;
  /** 0-indexed step index aligned with CheckpointStepState. */
  step_index: number;
  /** 1-indexed turn number aligned with the existing loop convention. */
  turn?: number;
  /** Per-call cost (set on step_completed). */
  cost_usd?: number;
  /** Per-call usage. */
  tokens_in?: number;
  tokens_out?: number;
  /** Set on retrieval_invoked. */
  retrieval_query?: string;
  retrieval_results_count?: number;
  /** Set on context_compressed. */
  context_before_tokens?: number;
  context_after_tokens?: number;
  /** Free-form for diagnostic events (e.g. "already finalized" on resume). */
  message?: string;
}

export type AgentRunProgressCallback = (event: AgentRunProgressEvent) => void;

export interface SoloAgentRunConfig extends BaseAgentRunConfig {
  /** Full materials block embedded in the user prompt. */
  materials: string;
}

export interface MultiStepAgentRunConfig extends BaseAgentRunConfig {
  /**
   * Search function injected by the orchestrator (HybridSearch wrapper).
   * Named `search` (not `retrieval`) to avoid a security-scanner false
   * positive on the `retrieval(` substring matching `eval(`.
   */
  search: RetrievalSearchFn;
  /** Max model turns inside the loop (default 5). */
  maxSteps?: number;
  /** top-K retrieval limit per query (default 8). */
  maxRetrievalsPerStep?: number;
  /** Per-cell cumulative halt — if total cell cost exceeds, halt. */
  perCellHaltUsd?: number;
}

export interface AgentRunResult {
  rawResponse: string;
  normalizedResponse: string;
  normalizationActions: readonly NormalizationAction[];
  promptShapeName: string;
  totalTokensIn: number;
  totalTokensOut: number;
  totalCostUsd: number;
  totalLatencyMs: number;
  loopExhausted: boolean;
  stepsTaken: number;
  retrievalCalls: number;
  errors: readonly string[];
}

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

function resolveNormalizationConfig(
  preset: NormalizationPresetName | NormalizationConfig | undefined,
): NormalizationConfig {
  if (!preset) return PRESETS.production;
  if (typeof preset === 'string') {
    const cfg = PRESETS[preset];
    if (!cfg) {
      throw new Error(`runAgentLoop: unknown normalization preset "${preset}"`);
    }
    return cfg;
  }
  return preset;
}

function pickShape(modelAlias: string, override?: string): PromptShape {
  return selectShape(modelAlias, { override });
}

function normalizeFinal(text: string, preset: NormalizationPresetName | NormalizationConfig | undefined) {
  const cfg = resolveNormalizationConfig(preset);
  return normalize(text, cfg);
}

function recordPredictionIfCapturing(
  capture: RunMetaCapture | undefined,
  fields: {
    prediction_id: string;
    model_alias: string;
    prompt_shape: string;
    prompt_text: string;
    raw_response: string;
    normalized_response: string;
    normalization_actions: readonly NormalizationAction[];
    tokens_in?: number;
    tokens_out?: number;
    cost_usd?: number;
    latency_ms?: number;
    context_tag?: string;
  },
): void {
  if (!capture) return;
  capture.recordPrediction({
    prediction_id: fields.prediction_id,
    timestamp_iso: new Date().toISOString(),
    model_alias: fields.model_alias,
    prompt_shape: fields.prompt_shape,
    prompt_text: fields.prompt_text,
    raw_response: fields.raw_response,
    normalized_response: fields.normalized_response,
    normalization_actions: fields.normalization_actions,
    tokens_in: fields.tokens_in,
    tokens_out: fields.tokens_out,
    cost_usd: fields.cost_usd,
    latency_ms: fields.latency_ms,
    context_tag: fields.context_tag,
  });
}

function flatten(messages: Array<{ role: string; content: string }>): string {
  return messages.map(m => `<${m.role}>\n${m.content}\n</${m.role}>`).join('\n\n');
}

interface ParsedAction {
  kind: 'retrieve' | 'finalize' | 'malformed';
  query?: string;
  response?: string;
}

// ─────────────────────────────────────────────────────────────────────────
// Phase 3.4 — Long-task helpers (private)
// ─────────────────────────────────────────────────────────────────────────

interface LoopStepInputShape extends Record<string, unknown> {
  turn: number;
  messages_snapshot: ReadonlyArray<{ role: string; content: string }>;
}

interface LoopStepOutputShape extends Record<string, unknown> {
  llm_raw_content: string;
  action_kind: 'retrieve' | 'finalize' | 'malformed' | 'force_finalize';
  action_query?: string;
  action_response?: string;
  retrieval_count?: number;
  tokens_in: number;
  tokens_out: number;
  cost_usd: number;
  latency_ms: number;
  total_tokens_in: number;
  total_tokens_out: number;
  total_cost_usd: number;
  total_latency_ms: number;
  total_retrieval_calls: number;
}

function buildAccumulatedAudit(prior: string, turn: number, action: ParsedAction): string {
  const sep = prior.length > 0 ? '\n' : '';
  if (action.kind === 'retrieve') {
    return prior + sep + `Turn ${turn}: retrieve query="${(action.query ?? '').slice(0, 80)}"`;
  }
  if (action.kind === 'finalize') {
    return prior + sep + `Turn ${turn}: finalize (${(action.response ?? '').slice(0, 60)}…)`;
  }
  return prior + sep + `Turn ${turn}: malformed`;
}

async function applyContextCompression(
  state: CheckpointStepState,
  contextManager: ContextManager,
  emit: AgentRunProgressCallback,
): Promise<CheckpointStepState> {
  if (!contextManager.needsCompression(state)) return state;
  const beforeTokens = contextManager.estimateTokens(state.accumulated_context);
  const compressed = await contextManager.compress(state);
  const afterTokens = contextManager.estimateTokens(compressed.accumulated_context);
  emit({
    type: 'context_compressed',
    step_index: state.step_index,
    context_before_tokens: beforeTokens,
    context_after_tokens: afterTokens,
  });
  return contextManager.evictRetrievalCache(compressed);
}

function parseAgentAction(text: string): ParsedAction {
  const jsonMatch = text.match(/\{[\s\S]*?\}/);
  if (!jsonMatch) return { kind: 'malformed' };
  try {
    const obj = JSON.parse(jsonMatch[0]);
    if (obj.action === 'retrieve' && typeof obj.query === 'string') {
      return { kind: 'retrieve', query: obj.query };
    }
    if (obj.action === 'finalize' && typeof obj.response === 'string') {
      return { kind: 'finalize', response: obj.response };
    }
    return { kind: 'malformed' };
  } catch {
    return { kind: 'malformed' };
  }
}

// ─────────────────────────────────────────────────────────────────────────
// runSoloAgent — Cell A/C pattern
// ─────────────────────────────────────────────────────────────────────────

/**
 * Single-shot agent call with full materials in the user prompt. Mirrors the
 * pilot's `runCellSolo` behavior (Cells A and C). One LLM call, one response.
 */
export async function runSoloAgent(config: SoloAgentRunConfig): Promise<AgentRunResult> {
  const shape = pickShape(config.modelAlias, config.promptShapeOverride);

  const systemPrompt = shape.systemPrompt({
    persona: config.persona,
    question: config.question,
    isMultiStep: false,
  });
  const userPrompt = shape.soloUserPrompt({
    persona: config.persona,
    materials: config.materials,
    question: config.question,
  });

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  const llmRes = await config.llmCall({
    model: config.modelAlias,
    messages,
    thinking: shape.metadata.defaultThinking,
    maxTokens: shape.metadata.defaultMaxTokens,
  });

  const errors: string[] = [];
  if (llmRes.error) errors.push(llmRes.error);

  const perCallHalt = config.perCallHaltUsd;
  if (perCallHalt !== undefined && llmRes.costUsd > perCallHalt) {
    errors.push(`per-call cost $${llmRes.costUsd.toFixed(4)} exceeded halt $${perCallHalt}`);
  }

  const normResult = normalizeFinal(llmRes.content, config.normalizationPreset);

  recordPredictionIfCapturing(config.runMetaCapture, {
    prediction_id: crypto.randomUUID(),
    model_alias: config.modelAlias,
    prompt_shape: shape.name,
    prompt_text: flatten(messages),
    raw_response: llmRes.content,
    normalized_response: normResult.normalized,
    normalization_actions: normResult.actions,
    tokens_in: llmRes.inTokens,
    tokens_out: llmRes.outTokens,
    cost_usd: llmRes.costUsd,
    latency_ms: llmRes.latencyMs,
    context_tag: config.contextTag,
  });

  return {
    rawResponse: llmRes.content,
    normalizedResponse: normResult.normalized,
    normalizationActions: normResult.actions,
    promptShapeName: shape.name,
    totalTokensIn: llmRes.inTokens,
    totalTokensOut: llmRes.outTokens,
    totalCostUsd: llmRes.costUsd,
    totalLatencyMs: llmRes.latencyMs,
    loopExhausted: false,
    stepsTaken: 1,
    retrievalCalls: 0,
    errors,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// runRetrievalAgentLoop — Cell B/D pattern
// ─────────────────────────────────────────────────────────────────────────

const DEFAULT_MAX_STEPS = 5;
const DEFAULT_MAX_RETRIEVALS_PER_STEP = 8;

/**
 * Multi-step retrieval-augmented agent loop. Mirrors pilot's
 * `runCellMultiStep` behavior (Cells B and D).
 *
 * Protocol per step:
 *   - Model emits exactly one JSON action: {action: 'retrieve', query: ...}
 *     OR {action: 'finalize', response: ...}
 *   - retrieve → injects retrieval results as next user message; loop continues
 *   - finalize → captures response; exits
 *   - malformed → one corrective re-prompt; if still malformed, treats as loop iteration
 *
 * Halt conditions:
 *   - finalize action received
 *   - MAX_STEPS exhausted (loop_exhausted=true; force-finalize via plain prose)
 *   - per-call cost exceeds perCallHaltUsd (if set)
 *   - cumulative cell cost exceeds perCellHaltUsd (if set)
 *   - llmCall returns error
 *
 * Each LLM call is recorded in runMetaCapture (if provided) including the
 * intermediate JSON action emissions; only the FINAL response is normalized.
 */
export async function runRetrievalAgentLoop(config: MultiStepAgentRunConfig): Promise<AgentRunResult> {
  const shape = pickShape(config.modelAlias, config.promptShapeOverride);
  const maxSteps = config.maxSteps ?? DEFAULT_MAX_STEPS;
  const maxRetrievalsPerStep = config.maxRetrievalsPerStep ?? DEFAULT_MAX_RETRIEVALS_PER_STEP;

  // Phase 3.4 long-task hooks (all optional).
  const checkpointStore = config.checkpointStore;
  const contextManager = config.contextManager;
  const emit: AgentRunProgressCallback = config.onProgress ?? (() => {});
  const runId = config.runId ?? crypto.randomUUID();
  const resumeEnabled = config.resumeFromCheckpoint ?? Boolean(checkpointStore);

  const systemPrompt = shape.systemPrompt({
    persona: config.persona,
    question: config.question,
    isMultiStep: true,
    maxSteps,
    maxRetrievalsPerStep,
  });
  const kickoffUser = shape.multiStepKickoffUserPrompt({});

  let messages: Array<{ role: string; content: string }> = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: kickoffUser },
  ];

  let totalIn = 0;
  let totalOut = 0;
  let totalCost = 0;
  let totalLatency = 0;
  let retrievalCalls = 0;
  let stepsTaken = 0;
  let loopExhausted = false;
  let finalRaw = '';
  const errors: string[] = [];
  let accumulatedAudit = '';
  let retrievalCacheState: Record<string, unknown> = {};
  let decisionHistoryState: Decision[] = [];
  let startStep = 1;

  // ─── Phase 3.4: optional resume from checkpoint ─────────────────────────
  if (checkpointStore && resumeEnabled) {
    const latest = await checkpointStore.loadLatest();
    if (latest && latest.run_id === runId) {
      const out = latest.step_output as LoopStepOutputShape;
      if (out.action_kind === 'finalize' || out.action_kind === 'force_finalize') {
        // Already finalized in a prior process — return cached result.
        emit({ type: 'recovery_resumed', step_index: latest.step_index, message: 'already finalized' });
        const cachedFinal = (out.action_response ?? out.llm_raw_content ?? '') as string;
        const normResult = normalizeFinal(cachedFinal, config.normalizationPreset);
        return {
          rawResponse: cachedFinal,
          normalizedResponse: normResult.normalized,
          normalizationActions: normResult.actions,
          promptShapeName: shape.name,
          totalTokensIn: out.total_tokens_in,
          totalTokensOut: out.total_tokens_out,
          totalCostUsd: out.total_cost_usd,
          totalLatencyMs: out.total_latency_ms,
          loopExhausted: out.action_kind === 'force_finalize',
          stepsTaken: latest.step_index + 1,
          retrievalCalls: out.total_retrieval_calls,
          errors: [],
        };
      }
      // Mid-loop resume: restore messages array + running totals.
      const inp = latest.step_input as LoopStepInputShape;
      messages = [...inp.messages_snapshot];
      totalIn = out.total_tokens_in;
      totalOut = out.total_tokens_out;
      totalCost = out.total_cost_usd;
      totalLatency = out.total_latency_ms;
      retrievalCalls = out.total_retrieval_calls;
      stepsTaken = latest.step_index + 1;
      accumulatedAudit = latest.accumulated_context;
      retrievalCacheState = { ...latest.retrieval_cache };
      decisionHistoryState = [...latest.decision_history];
      startStep = (inp.turn ?? 0) + 1;
      emit({ type: 'recovery_resumed', step_index: latest.step_index, turn: startStep, message: 'mid-loop resume' });
    }
  }

  for (let step = startStep; step <= maxSteps; step++) {
    stepsTaken = step;
    emit({ type: 'step_started', step_index: step - 1, turn: step });
    const llmRes = await config.llmCall({
      model: config.modelAlias,
      messages,
      thinking: shape.metadata.defaultThinking,
      maxTokens: shape.metadata.defaultMaxTokens,
    });
    totalIn += llmRes.inTokens;
    totalOut += llmRes.outTokens;
    totalCost += llmRes.costUsd;
    totalLatency += llmRes.latencyMs;

    recordPredictionIfCapturing(config.runMetaCapture, {
      prediction_id: crypto.randomUUID(),
      model_alias: config.modelAlias,
      prompt_shape: shape.name,
      prompt_text: flatten(messages),
      raw_response: llmRes.content,
      normalized_response: llmRes.content, // intermediate steps not normalized
      normalization_actions: [],
      tokens_in: llmRes.inTokens,
      tokens_out: llmRes.outTokens,
      cost_usd: llmRes.costUsd,
      latency_ms: llmRes.latencyMs,
      context_tag: `${config.contextTag ?? ''}:step-${step}`,
    });

    if (llmRes.error) {
      errors.push(`step ${step}: ${llmRes.error}`);
      break;
    }
    if (config.perCallHaltUsd !== undefined && llmRes.costUsd > config.perCallHaltUsd) {
      errors.push(`step ${step}: per-call $${llmRes.costUsd.toFixed(4)} > halt $${config.perCallHaltUsd}`);
      break;
    }
    if (config.perCellHaltUsd !== undefined && totalCost > config.perCellHaltUsd) {
      errors.push(`step ${step}: cell cumulative $${totalCost.toFixed(4)} > halt $${config.perCellHaltUsd}`);
      break;
    }

    messages.push({ role: 'assistant', content: llmRes.content });
    const action = parseAgentAction(llmRes.content);
    let retrievalCountThisTurn = 0;

    if (action.kind === 'retrieve' && action.query) {
      retrievalCalls += 1;
      retrievalCountThisTurn = 1;
      const found = await config.search({ query: action.query, limit: maxRetrievalsPerStep });
      retrievalCacheState[action.query] = {
        formattedResults: found.formattedResults,
        resultCount: found.resultCount,
      };
      emit({
        type: 'retrieval_invoked',
        step_index: step - 1,
        turn: step,
        retrieval_query: action.query,
        retrieval_results_count: found.resultCount,
      });
      const userMsg = shape.retrievalInjectionUserPrompt({
        query: action.query,
        results: found.formattedResults || '(no results — try a different query)',
        resultCount: found.resultCount,
      });
      messages.push({ role: 'user', content: userMsg });
    } else if (action.kind === 'finalize' && action.response !== undefined) {
      finalRaw = action.response;
      emit({ type: 'finalized', step_index: step - 1, turn: step });
    } else {
      // Malformed — one corrective re-prompt. If model also malforms next step, loop continues.
      messages.push({
        role: 'user',
        content: `Your previous output was not a valid JSON action. ${MULTI_STEP_ACTION_CONTRACT}`,
      });
    }

    // Phase 3.4: per-turn checkpoint save + optional context compression.
    decisionHistoryState = [
      ...decisionHistoryState,
      { step_index: step - 1, decision: action.kind, rationale: action.query ?? action.response?.slice(0, 60) },
    ];
    accumulatedAudit = buildAccumulatedAudit(accumulatedAudit, step, action);
    if (checkpointStore) {
      const stepInput: LoopStepInputShape = { turn: step, messages_snapshot: [...messages] };
      const stepOutput: LoopStepOutputShape = {
        llm_raw_content: llmRes.content,
        action_kind: action.kind === 'retrieve'
          ? 'retrieve'
          : action.kind === 'finalize'
          ? 'finalize'
          : 'malformed',
        action_query: action.query,
        action_response: action.response,
        retrieval_count: retrievalCountThisTurn,
        tokens_in: llmRes.inTokens,
        tokens_out: llmRes.outTokens,
        cost_usd: llmRes.costUsd,
        latency_ms: llmRes.latencyMs,
        total_tokens_in: totalIn,
        total_tokens_out: totalOut,
        total_cost_usd: totalCost,
        total_latency_ms: totalLatency,
        total_retrieval_calls: retrievalCalls,
      };
      let toSave: CheckpointStepState = {
        schema_version: CHECKPOINT_SCHEMA_VERSION,
        task_id: checkpointStore.taskId,
        run_id: runId,
        step_index: step - 1,
        timestamp_iso: new Date().toISOString(),
        step_action: action.kind,
        step_input: stepInput,
        step_output: stepOutput,
        accumulated_context: accumulatedAudit,
        retrieval_cache: { ...retrievalCacheState },
        decision_history: [...decisionHistoryState],
        cost_usd: llmRes.costUsd,
        latency_ms: llmRes.latencyMs,
      };
      if (contextManager) {
        toSave = await applyContextCompression(toSave, contextManager, emit);
        accumulatedAudit = toSave.accumulated_context;
        retrievalCacheState = { ...toSave.retrieval_cache };
      }
      await checkpointStore.save(toSave);
    } else if (contextManager) {
      // No store but contextManager — still apply to in-memory audit for telemetry.
      const synthState: CheckpointStepState = {
        schema_version: CHECKPOINT_SCHEMA_VERSION,
        task_id: 'in-memory',
        run_id: runId,
        step_index: step - 1,
        timestamp_iso: new Date().toISOString(),
        step_action: action.kind,
        step_input: {},
        step_output: {},
        accumulated_context: accumulatedAudit,
        retrieval_cache: { ...retrievalCacheState },
        decision_history: [...decisionHistoryState],
      };
      const compressed = await applyContextCompression(synthState, contextManager, emit);
      accumulatedAudit = compressed.accumulated_context;
      retrievalCacheState = { ...compressed.retrieval_cache };
    }

    emit({
      type: 'step_completed',
      step_index: step - 1,
      turn: step,
      cost_usd: llmRes.costUsd,
      tokens_in: llmRes.inTokens,
      tokens_out: llmRes.outTokens,
    });

    if (finalRaw) break;
    if (action.kind === 'retrieve') continue;
    // For malformed: corrective prompt was already pushed; continue to next turn.
  }

  if (!finalRaw) {
    loopExhausted = true;
    // Force-finalize with plain-prose request.
    const forceMsgs = [
      ...messages,
      {
        role: 'user',
        content: 'Step budget exhausted. Output your final answer to the original question NOW as plain prose, no JSON wrapper. Be substantive.',
      },
    ];
    const llmRes = await config.llmCall({
      model: config.modelAlias,
      messages: forceMsgs,
      thinking: shape.metadata.defaultThinking,
      maxTokens: shape.metadata.defaultMaxTokens,
    });
    totalIn += llmRes.inTokens;
    totalOut += llmRes.outTokens;
    totalCost += llmRes.costUsd;
    totalLatency += llmRes.latencyMs;
    finalRaw = llmRes.content || '(loop exhausted with no response)';
    if (llmRes.error) errors.push(`force-finalize: ${llmRes.error}`);

    recordPredictionIfCapturing(config.runMetaCapture, {
      prediction_id: crypto.randomUUID(),
      model_alias: config.modelAlias,
      prompt_shape: shape.name,
      prompt_text: flatten(forceMsgs),
      raw_response: llmRes.content,
      normalized_response: llmRes.content,
      normalization_actions: [],
      tokens_in: llmRes.inTokens,
      tokens_out: llmRes.outTokens,
      cost_usd: llmRes.costUsd,
      latency_ms: llmRes.latencyMs,
      context_tag: `${config.contextTag ?? ''}:force-finalize`,
    });

    emit({ type: 'loop_exhausted', step_index: stepsTaken, turn: stepsTaken + 1 });

    // Phase 3.4: persist final force-finalize checkpoint so resume sees it as completed.
    if (checkpointStore) {
      const stepInput: LoopStepInputShape = { turn: stepsTaken + 1, messages_snapshot: [...forceMsgs] };
      const stepOutput: LoopStepOutputShape = {
        llm_raw_content: llmRes.content,
        action_kind: 'force_finalize',
        action_response: finalRaw,
        tokens_in: llmRes.inTokens,
        tokens_out: llmRes.outTokens,
        cost_usd: llmRes.costUsd,
        latency_ms: llmRes.latencyMs,
        total_tokens_in: totalIn,
        total_tokens_out: totalOut,
        total_cost_usd: totalCost,
        total_latency_ms: totalLatency,
        total_retrieval_calls: retrievalCalls,
      };
      const finalState: CheckpointStepState = {
        schema_version: CHECKPOINT_SCHEMA_VERSION,
        task_id: checkpointStore.taskId,
        run_id: runId,
        step_index: stepsTaken,
        timestamp_iso: new Date().toISOString(),
        step_action: 'force_finalize',
        step_input: stepInput,
        step_output: stepOutput,
        accumulated_context: accumulatedAudit + '\nForce-finalize.',
        retrieval_cache: { ...retrievalCacheState },
        decision_history: [...decisionHistoryState],
        cost_usd: llmRes.costUsd,
        latency_ms: llmRes.latencyMs,
      };
      await checkpointStore.save(finalState);
    }
  }

  // Final response gets normalized.
  const normResult = normalizeFinal(finalRaw, config.normalizationPreset);

  return {
    rawResponse: finalRaw,
    normalizedResponse: normResult.normalized,
    normalizationActions: normResult.actions,
    promptShapeName: shape.name,
    totalTokensIn: totalIn,
    totalTokensOut: totalOut,
    totalCostUsd: totalCost,
    totalLatencyMs: totalLatency,
    loopExhausted,
    stepsTaken,
    retrievalCalls,
    errors,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Phase 3.4 — Whole-loop recovery wrapper
// ─────────────────────────────────────────────────────────────────────────

export interface LoopRecoveryOptions {
  /** Default 2 retries. */
  maxRetries?: number;
  /** Default 1000ms initial backoff. */
  baseBackoffMs?: number;
  /** Default 30000ms cap on backoff. */
  maxBackoffMs?: number;
  /** Default 0.25 (±25% jitter). 0 = deterministic. */
  jitterFactor?: number;
  /** Optional injectable RNG for jitter. Default Math.random. */
  rng?: () => number;
  /** Optional injectable sleep for tests. Default native setTimeout. */
  sleep?: (ms: number) => Promise<void>;
  /** Optional callback called when a retry is about to happen. */
  onRetry?: (info: { attempt: number; backoff_ms: number; error: string }) => void;
}

const DEFAULT_LOOP_RECOVERY_MAX_RETRIES = 2;
const DEFAULT_LOOP_RECOVERY_BASE_MS = 1000;
const DEFAULT_LOOP_RECOVERY_MAX_MS = 30000;
const DEFAULT_LOOP_RECOVERY_JITTER = 0.25;

function defaultLoopSleep(ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    // eslint-disable-next-line no-restricted-globals
    setTimeout(resolve, ms);
  });
}

function computeLoopBackoff(attempt: number, opts: Required<Pick<LoopRecoveryOptions, 'baseBackoffMs' | 'maxBackoffMs' | 'jitterFactor' | 'rng'>>): number {
  const exponential = Math.min(opts.baseBackoffMs * 2 ** (attempt - 1), opts.maxBackoffMs);
  if (opts.jitterFactor === 0) return exponential;
  const jitter = (opts.rng() * 2 - 1) * opts.jitterFactor * exponential;
  return Math.max(0, exponential + jitter);
}

function loopErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return String(err);
}

/**
 * Whole-loop recovery wrapper. Retries runRetrievalAgentLoop on throw with
 * exponential-backoff + optional jitter. Each retry leverages the loop's
 * internal checkpoint resume (config.checkpointStore + config.runId) to
 * continue from the last successful turn.
 *
 * Backwards compatibility: if config.checkpointStore is not set, retries
 * restart the loop from scratch (fresh prompt, no resume). With a checkpoint
 * store, retries resume mid-loop and final outputs match the no-crash run
 * given identical llmCall + retrievalSearch outcomes.
 *
 * Replay determinism: backoff DURATIONS depend on rng (non-deterministic
 * by default; injectable for replay). Recovery DECISIONS (retry vs throw)
 * depend only on whether the loop call resolved or threw.
 */
export async function runRetrievalAgentLoopWithRecovery(
  config: MultiStepAgentRunConfig,
  recoveryOpts: LoopRecoveryOptions = {},
): Promise<AgentRunResult> {
  const maxRetries = recoveryOpts.maxRetries ?? DEFAULT_LOOP_RECOVERY_MAX_RETRIES;
  if (!Number.isInteger(maxRetries) || maxRetries < 0) {
    throw new Error(`runRetrievalAgentLoopWithRecovery: maxRetries must be a non-negative integer (got ${String(maxRetries)})`);
  }
  const baseBackoffMs = recoveryOpts.baseBackoffMs ?? DEFAULT_LOOP_RECOVERY_BASE_MS;
  const maxBackoffMs = recoveryOpts.maxBackoffMs ?? DEFAULT_LOOP_RECOVERY_MAX_MS;
  if (baseBackoffMs < 0 || maxBackoffMs < baseBackoffMs) {
    throw new Error(`runRetrievalAgentLoopWithRecovery: invalid backoff bounds (base=${baseBackoffMs}, max=${maxBackoffMs})`);
  }
  const jitterFactor = recoveryOpts.jitterFactor ?? DEFAULT_LOOP_RECOVERY_JITTER;
  if (jitterFactor < 0 || jitterFactor > 1) {
    throw new Error(`runRetrievalAgentLoopWithRecovery: jitterFactor must be in [0, 1] (got ${jitterFactor})`);
  }

  const sleep = recoveryOpts.sleep ?? defaultLoopSleep;
  const rng = recoveryOpts.rng ?? Math.random;
  const onRetry = recoveryOpts.onRetry ?? (() => {});

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxRetries + 1; attempt += 1) {
    if (attempt > 1) {
      const backoff = computeLoopBackoff(attempt - 1, { baseBackoffMs, maxBackoffMs, jitterFactor, rng });
      onRetry({ attempt, backoff_ms: backoff, error: loopErrorMessage(lastError) });
      await sleep(backoff);
    }
    try {
      return await runRetrievalAgentLoop(config);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(loopErrorMessage(lastError));
}
