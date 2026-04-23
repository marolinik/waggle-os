/**
 * Four + two cell implementations — the causal isolation grid.
 *
 * Each cell is a pure(-ish) function from a `CellInput` to an `LlmCallResult`.
 * Cells differ only in HOW they assemble the model's context:
 *
 *   raw:           no memory injection, no prompt evolution.
 *   filtered:      inject the instance's own context as "retrieved memory"
 *                  (Sprint 9 scaffold proxy — retained for back-compat; new
 *                  `retrieval` cell below is the real-substrate replacement).
 *   compressed:    raw prompt wrapped in an evolved scaffold (Sprint 9 GEPA
 *                  prompt-evolution proxy — retained for back-compat).
 *   full-context:  memory + evolve (both Sprint 9 treatments).
 *   retrieval:     real `@waggle/core::HybridSearch` recall → top-K turn
 *                  frames → "# Recalled Memories" block → baseline system
 *                  prompt. Sprint 12 Task 2.5 Stage 1.
 *   agentic:       `@waggle/agent::agent-loop` with a `search_memory` tool
 *                  allowlist + 3-turn cap. The agent decides for itself when
 *                  to search, how to query, and when to stop. Sprint 12
 *                  Task 2.5 Stage 1.
 *
 * Controls live in `controls.ts`.
 */

import type { DatasetInstance, ModelSpec, CellName, ControlName } from './types.js';
import type { LlmClient, LlmCallResult } from './llm.js';
import type { Substrate } from './substrate.js';
import type { SearchResult } from '@waggle/core';
import {
  runAgentLoop,
  type AgentLoopConfig,
  type ToolDefinition,
} from '@waggle/agent';

const SYSTEM_BASELINE =
  'You are answering a short factoid question. Give the shortest possible answer; no preamble.';

const SYSTEM_EVOLVED =
  'You are answering a short factoid question. Extract the answer from the supplied context. ' +
  'Respond with ONLY the answer span — no sentences, no punctuation, no hedging. ' +
  'If the context does not contain the answer, reply with "unknown".';

/**
 * SYSTEM_AGENTIC — DRAFT, Sprint 12 Task 2.5 Stage 1 (2026-04-23).
 *
 * PM review pending. Do NOT ship to N=20 validation or N=400 retry until PM
 * ratifies this prompt verbatim.
 *
 * Brief requirements (Stage 1 §agentic-cell-shape):
 *   (a) explicit instruction to invoke search_memory before answering
 *   (b) ground the answer in retrieved content, not prior knowledge
 *   (c) a stop condition that triggers before the 3-turn cap
 *
 * All three are covered: (a) §1, (b) §6 + closing line, (c) §4–§5 budget.
 */
export const SYSTEM_AGENTIC = [
  'You are a memory-grounded answering agent. Your job: answer a short',
  'factoid question using ONLY the content returned by the search_memory',
  'tool.',
  '',
  'Protocol (you MUST follow):',
  '1. First turn: call search_memory with a focused query derived from the',
  '   question. Do NOT answer from prior knowledge.',
  '2. After the tool returns, read the retrieved memories carefully.',
  '3. If the retrieved memories directly contain the answer, respond with',
  '   the shortest possible answer span — no sentences, no hedging, no',
  '   preamble.',
  '4. If the retrieved memories are ambiguous or incomplete, you MAY call',
  '   search_memory ONE more time with a refined query (different wording,',
  '   different entity, different time window). Then answer.',
  '5. You have a hard cap of 3 total turns. You SHOULD finish in 2: one',
  '   tool call, then a direct answer. Use the third turn only if genuinely',
  '   needed; never repeat an identical query.',
  '6. If the retrieved memories do not contain the answer, reply with',
  '   exactly: unknown',
  '',
  'Output format: plain answer span only. No JSON, no markdown, no',
  'explanation. Your knowledge is frozen — memory is the source of truth.',
  'Never invent facts. Never extrapolate. Ground every claim in a retrieved',
  'turn.',
].join('\n');

export interface CellInput {
  instance: DatasetInstance;
  model: ModelSpec;
  llm: LlmClient;
  turnId: string;
  /** Memory substrate — required by `retrieval` + `agentic` cells, ignored
   *  by the other four. A clear error is thrown when a substrate-requiring
   *  cell fires without one so the misconfiguration is loud. */
  substrate?: Substrate;
  /** LiteLLM routing used by the agentic cell's inner agent-loop. Ignored by
   *  every other cell (they route through `llm: LlmClient`). */
  litellm?: { url: string; apiKey: string };
  /** Retrieval top-K. Default 10 per Stage 1 GATE-S0 decision. */
  retrievalTopK?: number;
  /** Agentic hard turn cap. Default 3 per Stage 1 GATE-S0 decision. */
  agenticMaxTurns?: number;
  /** Agentic AbortController timeout in ms. Default 180_000 (matches the
   *  LiteLLM client's thinking=on timeout). */
  agenticTimeoutMs?: number;
  /** Testability hook — injects a mock `runAgentLoop` impl. Unit tests pass
   *  an in-memory stub; production runs leave undefined and use the real
   *  `@waggle/agent::runAgentLoop`. */
  runAgentLoopFn?: typeof runAgentLoop;
}

export type CellFn = (input: CellInput) => Promise<LlmCallResult>;

function buildUserPromptRaw(instance: DatasetInstance): string {
  return `Context: ${instance.context}\n\nQuestion: ${instance.question}`;
}

function buildUserPromptMemory(instance: DatasetInstance): string {
  // Scaffold proxy: treat the instance's own context block as if it had been
  // retrieved by HybridSearch + formatted by combined-retrieval.ts. Header
  // mimics the "Recalled Memories" block the real orchestrator emits.
  return (
    '# Recalled Memories\n' +
    `- [memory:synth] ${instance.context}\n\n` +
    `Question: ${instance.question}`
  );
}

/** Format a `HybridSearch.search()` result list into the "# Recalled
 *  Memories" block the real Waggle orchestrator emits. The retrieval cell's
 *  causal contract is: "this is what HybridSearch would return at inference
 *  time, in the shape the agent would see." */
function formatRecalledMemories(results: readonly SearchResult[]): string {
  if (results.length === 0) {
    return '# Recalled Memories\n(none)';
  }
  const lines = results.map((r, idx) => {
    const score = r.finalScore.toFixed(3);
    const source = r.frame.source ?? 'user_stated';
    return `- [memory:${r.frame.gop_id}:${r.frame.id} score=${score} src=${source}] ${r.frame.content}`;
  });
  return `# Recalled Memories\n${lines.join('\n')}`;
}

/** Build a `search_memory`-only `ToolDefinition` bound to the substrate's
 *  HybridSearch instance. The tool returns a plain-text memory block the
 *  LLM can parse inline — matches the shape the real Waggle orchestrator
 *  emits for `search_memory` calls. */
export function makeSearchMemoryTool(substrate: Substrate, defaultLimit: number = 10): ToolDefinition {
  return {
    name: 'search_memory',
    description:
      'Search the conversation memory corpus for turns relevant to a query. ' +
      'Call this BEFORE answering so you can ground your answer in retrieved content. ' +
      'Results are ranked turn frames with speaker, text, and relevance score.',
    offlineCapable: true,
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Natural-language search query. Focus on entities + topic.',
        },
        limit: {
          type: 'number',
          description: `Max results to return. Default ${defaultLimit}. Cap 20.`,
        },
      },
      required: ['query'],
    },
    execute: async (args: Record<string, unknown>): Promise<string> => {
      const query = typeof args.query === 'string' ? args.query.trim() : '';
      if (!query) return 'ERROR: query is required and must be a non-empty string.';
      const limitRaw = typeof args.limit === 'number' ? args.limit : defaultLimit;
      const limit = Math.max(1, Math.min(20, Math.floor(limitRaw)));
      const results = await substrate.search.search(query, { limit });
      if (results.length === 0) return '(no memories found)';
      return results.map((r, idx) => {
        const score = r.finalScore.toFixed(3);
        return `[${idx + 1}] (${r.frame.gop_id}:${r.frame.id} score ${score}) ${r.frame.content}`;
      }).join('\n');
    },
  };
}

function assertSubstrate(cellName: string, substrate: Substrate | undefined): asserts substrate is Substrate {
  if (!substrate) {
    throw new Error(
      `cells.${cellName} requires a Substrate dependency. Construct it via ` +
      `createSubstrate({embedder}) and pass it in CellInput.substrate. See ` +
      `benchmarks/harness/src/substrate.ts.`,
    );
  }
}

function assertLitellm(
  cellName: string,
  litellm: CellInput['litellm'],
): asserts litellm is { url: string; apiKey: string } {
  if (!litellm?.url || !litellm?.apiKey) {
    throw new Error(
      `cells.${cellName} requires litellm={url, apiKey} in CellInput ` +
      `(agent-loop talks to LiteLLM directly, not via the cell's LlmClient).`,
    );
  }
}

export const cells: Record<CellName, CellFn> = {
  raw: async ({ instance, model, llm, turnId: _turnId }: CellInput) => {
    return llm.call({
      model,
      systemPrompt: SYSTEM_BASELINE,
      userPrompt: buildUserPromptRaw(instance),
    });
  },

  filtered: async ({ instance, model, llm, turnId: _turnId }: CellInput) => {
    return llm.call({
      model,
      systemPrompt: SYSTEM_BASELINE,
      userPrompt: buildUserPromptMemory(instance),
    });
  },

  compressed: async ({ instance, model, llm, turnId: _turnId }: CellInput) => {
    return llm.call({
      model,
      systemPrompt: SYSTEM_EVOLVED,
      userPrompt: buildUserPromptRaw(instance),
    });
  },

  'full-context': async ({ instance, model, llm, turnId: _turnId }: CellInput) => {
    return llm.call({
      model,
      systemPrompt: SYSTEM_EVOLVED,
      userPrompt: buildUserPromptMemory(instance),
    });
  },

  /**
   * retrieval — Sprint 12 Task 2.5 Stage 1 (2026-04-23).
   *
   * Real `@waggle/core::HybridSearch` RRF-fused FTS5 + vec0 recall over the
   * pre-ingested LoCoMo corpus. Top-K turn frames formatted into the "#
   * Recalled Memories" block and handed to the model under SYSTEM_BASELINE.
   *
   * This is the substrate-real replacement for the Sprint 9 `filtered` cell,
   * which used the instance's own ground-truth context as a scaffold proxy.
   */
  retrieval: async ({ instance, model, llm, turnId: _turnId, substrate, retrievalTopK }: CellInput) => {
    assertSubstrate('retrieval', substrate);
    const limit = retrievalTopK ?? 10;
    const results = await substrate.search.search(instance.question, { limit });
    const memoryBlock = formatRecalledMemories(results);
    const userPrompt = `${memoryBlock}\n\nQuestion: ${instance.question}`;
    return llm.call({
      model,
      systemPrompt: SYSTEM_BASELINE,
      userPrompt,
    });
  },

  /**
   * agentic — Sprint 12 Task 2.5 Stage 1 (2026-04-23).
   *
   * Inner `runAgentLoop` call with:
   *   - tools: [search_memory] — single-tool allowlist per GATE-S0 decision.
   *   - maxTurns: 3 — hard cap per GATE-S0 decision.
   *   - signal: AbortController → setTimeout(timeoutMs).
   *
   * Returns an `LlmCallResult` whose `text` is the agent's final answer,
   * `usage` tokens come from the agent loop's aggregate, and `costUsd` is
   * computed from model pricing × tokens. `failureMode` is set when the
   * agent aborts or throws; null on clean completion.
   *
   * The agent loop talks to LiteLLM directly — it does NOT go through the
   * cell's `LlmClient`. Callers must supply `litellm={url, apiKey}` in
   * CellInput. (The cell's `llm: LlmClient` is kept in the signature for
   * interface symmetry but is not used by this cell.)
   */
  agentic: async ({ instance, model, turnId, substrate, litellm, agenticMaxTurns, agenticTimeoutMs, runAgentLoopFn }: CellInput) => {
    assertSubstrate('agentic', substrate);
    assertLitellm('agentic', litellm);
    const maxTurns = agenticMaxTurns ?? 3;
    const timeoutMs = agenticTimeoutMs ?? 180_000;
    const runFn = runAgentLoopFn ?? runAgentLoop;

    const searchMemoryTool = makeSearchMemoryTool(substrate, 10);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const started = Date.now();

    const cfg: AgentLoopConfig = {
      litellmUrl: litellm.url,
      litellmApiKey: litellm.apiKey,
      model: model.litellmModel,
      systemPrompt: SYSTEM_AGENTIC,
      tools: [searchMemoryTool],
      messages: [{ role: 'user', content: instance.question }],
      maxTurns,
      signal: controller.signal,
      turnId,
    };

    try {
      const resp = await runFn(cfg);
      const latencyMs = Date.now() - started;
      const inputTokens = resp.usage.inputTokens;
      const outputTokens = resp.usage.outputTokens;
      const costUsd =
        (inputTokens / 1_000_000) * model.pricePerMillionInput +
        (outputTokens / 1_000_000) * model.pricePerMillionOutput;
      return {
        text: resp.content,
        inputTokens,
        outputTokens,
        latencyMs,
        costUsd,
        failureMode: null,
      };
    } catch (err: unknown) {
      const latencyMs = Date.now() - started;
      const name = err instanceof Error ? err.name : 'unknown';
      const failureMode = name === 'AbortError' ? 'timeout' : `agentic_error_${name}`;
      return {
        text: '',
        inputTokens: 0,
        outputTokens: 0,
        latencyMs,
        costUsd: 0,
        failureMode,
      };
    } finally {
      clearTimeout(timer);
    }
  },
};

/** Type-narrowing helper for the runner's cell-or-control dispatch. */
export function isCellName(name: string): name is CellName {
  return (
    name === 'raw' ||
    name === 'filtered' ||
    name === 'compressed' ||
    name === 'full-context' ||
    name === 'retrieval' ||
    name === 'agentic'
  );
}

export function isControlName(name: string): name is ControlName {
  return name === 'verbose-fixed';
}
