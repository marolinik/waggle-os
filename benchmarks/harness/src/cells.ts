/**
 * Four cell implementations — the causal isolation grid.
 *
 * Each cell is a pure function from (instance, model, llm-client, turnId) to
 * an LLM call result. Cells differ only in HOW they assemble the prompt:
 *
 *   raw:          no memory injection, no prompt evolution.
 *   memory-only:  inject the instance's own context as "retrieved memory"
 *                 (scaffold proxy — Week 1 swaps in real HybridSearch).
 *   evolve-only:  raw prompt wrapped in an evolved scaffold — proxy for
 *                 GEPA prompt evolution until the real evolution config
 *                 ships (currently applies a lightweight v5-style
 *                 compression scaffold inline).
 *   full-stack:   memory + evolve (both treatments).
 *
 * Controls live in `controls.ts`.
 */

import type { DatasetInstance, ModelSpec, CellName, ControlName } from './types.js';
import type { LlmClient, LlmCallResult } from './llm.js';

const SYSTEM_BASELINE =
  'You are answering a short factoid question. Give the shortest possible answer; no preamble.';

const SYSTEM_EVOLVED =
  'You are answering a short factoid question. Extract the answer from the supplied context. ' +
  'Respond with ONLY the answer span — no sentences, no punctuation, no hedging. ' +
  'If the context does not contain the answer, reply with "unknown".';

export interface CellInput {
  instance: DatasetInstance;
  model: ModelSpec;
  llm: LlmClient;
  turnId: string;
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

export const cells: Record<CellName, CellFn> = {
  raw: async ({ instance, model, llm, turnId: _turnId }: CellInput) => {
    return llm.call({
      model,
      systemPrompt: SYSTEM_BASELINE,
      userPrompt: buildUserPromptRaw(instance),
    });
  },

  'memory-only': async ({ instance, model, llm, turnId: _turnId }: CellInput) => {
    return llm.call({
      model,
      systemPrompt: SYSTEM_BASELINE,
      userPrompt: buildUserPromptMemory(instance),
    });
  },

  'evolve-only': async ({ instance, model, llm, turnId: _turnId }: CellInput) => {
    return llm.call({
      model,
      systemPrompt: SYSTEM_EVOLVED,
      userPrompt: buildUserPromptRaw(instance),
    });
  },

  'full-stack': async ({ instance, model, llm, turnId: _turnId }: CellInput) => {
    return llm.call({
      model,
      systemPrompt: SYSTEM_EVOLVED,
      userPrompt: buildUserPromptMemory(instance),
    });
  },
};

/** Type-narrowing helper for the runner's cell-or-control dispatch. */
export function isCellName(name: string): name is CellName {
  return name === 'raw' || name === 'memory-only' || name === 'evolve-only' || name === 'full-stack';
}

export function isControlName(name: string): name is ControlName {
  return name === 'verbose-fixed';
}
