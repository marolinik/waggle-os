/**
 * Task 2.5 Stage 2-Retry §1.4 — agent-loop tool-exhaustion fallback tests.
 *
 * Stage 2 N=20 showed 2/20 agentic instances reached maxTurns=3 with every
 * turn spent on a search_memory call, leaving `resp.content` empty; the
 * judge scored those as incorrect. Stage 2-Retry §1.4 adds a runtime-side
 * forced-answer fallback in the agentic cell wrapper: on empty-content +
 * non-empty toolsUsed, the cell makes ONE additional direct LLM call
 * (no tools, SYSTEM_AGENTIC_FORCED_FALLBACK) with the accumulated search
 * context and returns that answer.
 *
 * Test matrix per brief:
 *   (a) normal 1-call-1-answer           → fallback NOT fired
 *   (b) 2-call-1-answer                   → fallback NOT fired
 *   (c) 3-call-1-answer                   → fallback NOT fired
 *   (d) 3 tools + empty content           → fallback FIRED, returns forced answer
 * Plus:
 *   (e) fallback preserves accumulated tool context in the user prompt
 *   (f) fallback counts its tokens into returned cost (no cost-leak)
 */

import { describe, expect, it } from 'vitest';
import type { AgentLoopConfig, AgentResponse } from '@waggle/agent';
import type { LlmCallInput, LlmCallResult, LlmClient } from '../src/llm.js';
import type { DatasetInstance, ModelSpec } from '../src/types.js';
import {
  cells,
  SYSTEM_AGENTIC,
  SYSTEM_AGENTIC_FORCED_FALLBACK,
} from '../src/cells.js';
import { createSubstrate } from '../src/substrate.js';
import type { Embedder } from '@waggle/core';

const VEC_DIMS = 1024;
function createFakeEmbedder(): Embedder {
  // Deterministic hash-seeded 1024-dim embedder — same pattern as other tests.
  const fnv1a = (s: string): number => {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h || 1;
  };
  const embedOne = (text: string): Float32Array => {
    let state = fnv1a(text);
    const v = new Float32Array(VEC_DIMS);
    for (let i = 0; i < VEC_DIMS; i++) {
      state ^= state << 13; state >>>= 0;
      state ^= state >>> 17;
      state ^= state << 5; state >>>= 0;
      v[i] = ((state >>> 0) / 0x100000000) * 2 - 1;
    }
    let mag = 0;
    for (let i = 0; i < VEC_DIMS; i++) mag += v[i] * v[i];
    mag = Math.sqrt(mag);
    if (mag > 0) for (let i = 0; i < VEC_DIMS; i++) v[i] /= mag;
    return v;
  };
  return {
    dimensions: VEC_DIMS,
    async embed(t) { return embedOne(t); },
    async embedBatch(ts) { return ts.map(embedOne); },
  };
}

const MODEL: ModelSpec = {
  id: 'test-subject',
  displayName: 'Test',
  provider: 'alibaba',
  litellmModel: 'test/model',
  pricePerMillionInput: 0.1,
  pricePerMillionOutput: 0.4,
  contextWindow: 32_000,
};
const INSTANCE: DatasetInstance = {
  instance_id: 'test_q001',
  question: 'When did the event happen?',
  context: 'irrelevant for this test',
  expected: ['2023'],
  conversation_id: 'conv-test',
};

/** Programmable mock runAgentLoop that simulates different tool-use and
 *  content patterns per-test. Also exercises the onToolResult callback so
 *  the cell wrapper's context capture is tested end-to-end. */
function makeScriptedAgentLoop(script: {
  toolCallResults: string[];   // results the agent-loop would return to the agent
  finalContent: string;        // final resp.content
  usageInput?: number;
  usageOutput?: number;
}): (config: AgentLoopConfig) => Promise<AgentResponse> {
  return async (config: AgentLoopConfig): Promise<AgentResponse> => {
    // Fire onToolResult for each simulated tool call in order. Triggers the
    // cell wrapper's capturedToolResults accumulator.
    for (let i = 0; i < script.toolCallResults.length; i++) {
      config.onToolResult?.('search_memory', { query: `simulated-${i}` }, script.toolCallResults[i]);
    }
    return {
      content: script.finalContent,
      toolsUsed: script.toolCallResults.map(() => 'search_memory'),
      usage: {
        inputTokens: script.usageInput ?? 200,
        outputTokens: script.usageOutput ?? 10,
      },
    };
  };
}

/** Capturing LlmClient — records every direct llm.call made by the cell
 *  wrapper. The forced-fallback pass hits this (not the mock agent-loop). */
function makeCapturingLlm(response: Partial<LlmCallResult> = {}): {
  client: LlmClient;
  calls: LlmCallInput[];
} {
  const calls: LlmCallInput[] = [];
  const client: LlmClient = {
    async call(input) {
      calls.push(input);
      return {
        text: response.text ?? 'FORCED_ANSWER',
        inputTokens: response.inputTokens ?? 500,
        outputTokens: response.outputTokens ?? 3,
        latencyMs: response.latencyMs ?? 50,
        costUsd: response.costUsd ?? 0.0002,
        failureMode: response.failureMode ?? null,
      };
    },
  };
  return { client, calls };
}

describe('agent-loop tool-exhaustion fallback — Stage 2-Retry §1.4', () => {
  it('case (a): 1 tool call + answer → fallback NOT fired', async () => {
    const substrate = createSubstrate({ embedder: createFakeEmbedder() });
    try {
      const runFn = makeScriptedAgentLoop({
        toolCallResults: ['[1] Caroline: painted in 2023'],
        finalContent: '2023',
      });
      const { client, calls } = makeCapturingLlm();
      const result = await cells.agentic({
        instance: INSTANCE, model: MODEL, llm: client, turnId: 't',
        substrate, litellm: { url: 'u', apiKey: 'k' }, runAgentLoopFn: runFn,
      });
      expect(result.text).toBe('2023');
      expect(result.failureMode).toBeNull();
      // No fallback call.
      expect(calls).toHaveLength(0);
    } finally {
      substrate.close();
    }
  });

  it('case (b): 2 tool calls + answer → fallback NOT fired', async () => {
    const substrate = createSubstrate({ embedder: createFakeEmbedder() });
    try {
      const runFn = makeScriptedAgentLoop({
        toolCallResults: [
          '[1] some result',
          '[2] refined result',
        ],
        finalContent: '2023',
      });
      const { client, calls } = makeCapturingLlm();
      const result = await cells.agentic({
        instance: INSTANCE, model: MODEL, llm: client, turnId: 't',
        substrate, litellm: { url: 'u', apiKey: 'k' }, runAgentLoopFn: runFn,
      });
      expect(result.text).toBe('2023');
      expect(calls).toHaveLength(0);
    } finally {
      substrate.close();
    }
  });

  it('case (c): 3 tool calls + answer (all turns used, but content present) → fallback NOT fired', async () => {
    const substrate = createSubstrate({ embedder: createFakeEmbedder() });
    try {
      const runFn = makeScriptedAgentLoop({
        toolCallResults: ['r1', 'r2', 'r3'],
        finalContent: 'best-effort-answer',
      });
      const { client, calls } = makeCapturingLlm();
      const result = await cells.agentic({
        instance: INSTANCE, model: MODEL, llm: client, turnId: 't',
        substrate, litellm: { url: 'u', apiKey: 'k' }, runAgentLoopFn: runFn,
      });
      expect(result.text).toBe('best-effort-answer');
      expect(calls).toHaveLength(0);
    } finally {
      substrate.close();
    }
  });

  it('case (d): 3 tool calls + EMPTY content → fallback FIRED, forced answer returned', async () => {
    const substrate = createSubstrate({ embedder: createFakeEmbedder() });
    try {
      const runFn = makeScriptedAgentLoop({
        toolCallResults: ['r1', 'r2', 'r3'],
        finalContent: '', // agent exhausted turns, no answer
      });
      const { client, calls } = makeCapturingLlm({ text: 'FALLBACK-2023' });
      const result = await cells.agentic({
        instance: INSTANCE, model: MODEL, llm: client, turnId: 't',
        substrate, litellm: { url: 'u', apiKey: 'k' }, runAgentLoopFn: runFn,
      });
      expect(result.text).toBe('FALLBACK-2023');
      expect(result.failureMode).toBeNull();
      // Exactly one fallback call.
      expect(calls).toHaveLength(1);
      expect(calls[0].systemPrompt).toBe(SYSTEM_AGENTIC_FORCED_FALLBACK);
    } finally {
      substrate.close();
    }
  });

  it('case (e): fallback user prompt includes question + every captured tool result', async () => {
    const substrate = createSubstrate({ embedder: createFakeEmbedder() });
    try {
      const runFn = makeScriptedAgentLoop({
        toolCallResults: [
          'search_memory hit A',
          'search_memory hit B',
          'search_memory hit C',
        ],
        finalContent: '',
      });
      const { client, calls } = makeCapturingLlm({ text: 'forced' });
      await cells.agentic({
        instance: INSTANCE, model: MODEL, llm: client, turnId: 't',
        substrate, litellm: { url: 'u', apiKey: 'k' }, runAgentLoopFn: runFn,
      });
      const user = calls[0].userPrompt;
      expect(user).toContain(INSTANCE.question);
      expect(user).toContain('search_memory hit A');
      expect(user).toContain('search_memory hit B');
      expect(user).toContain('search_memory hit C');
      // Each call result labelled with its call number.
      expect(user).toContain('## search_memory call 1');
      expect(user).toContain('## search_memory call 2');
      expect(user).toContain('## search_memory call 3');
    } finally {
      substrate.close();
    }
  });

  it('case (f): fallback token counts fold into the returned LlmCallResult cost', async () => {
    const substrate = createSubstrate({ embedder: createFakeEmbedder() });
    try {
      const runFn = makeScriptedAgentLoop({
        toolCallResults: ['r1', 'r2', 'r3'],
        finalContent: '',
        usageInput: 1_000_000,
        usageOutput: 100_000,
      });
      // Fallback call accounts for another 500_000 input + 50_000 output.
      const { client, calls } = makeCapturingLlm({
        text: 'forced-final',
        inputTokens: 500_000,
        outputTokens: 50_000,
      });
      const result = await cells.agentic({
        instance: INSTANCE, model: MODEL, llm: client, turnId: 't',
        substrate, litellm: { url: 'u', apiKey: 'k' }, runAgentLoopFn: runFn,
      });
      // Token sums: 1_500_000 input, 150_000 output.
      expect(result.inputTokens).toBe(1_500_000);
      expect(result.outputTokens).toBe(150_000);
      // Cost = (1.5 × $0.1/M input) + (0.15 × $0.4/M output) = $0.15 + $0.06 = $0.21
      expect(result.costUsd).toBeCloseTo(0.21, 5);
      // And one fallback llm.call happened.
      expect(calls).toHaveLength(1);
    } finally {
      substrate.close();
    }
  });

  it('case (g): empty content + ZERO tool calls → fallback does NOT fire (honest abstain)', async () => {
    const substrate = createSubstrate({ embedder: createFakeEmbedder() });
    try {
      // Agent answered directly without searching — and its content was empty.
      // This is an honest abstain case, not tool-exhaustion; no fallback.
      const runFn = makeScriptedAgentLoop({
        toolCallResults: [],
        finalContent: '',
      });
      const { client, calls } = makeCapturingLlm();
      const result = await cells.agentic({
        instance: INSTANCE, model: MODEL, llm: client, turnId: 't',
        substrate, litellm: { url: 'u', apiKey: 'k' }, runAgentLoopFn: runFn,
      });
      expect(result.text).toBe('');
      expect(calls).toHaveLength(0);
    } finally {
      substrate.close();
    }
  });

  it('SYSTEM_AGENTIC_FORCED_FALLBACK is exported and non-empty', () => {
    expect(SYSTEM_AGENTIC_FORCED_FALLBACK.length).toBeGreaterThan(50);
    expect(SYSTEM_AGENTIC_FORCED_FALLBACK).toContain('commit to your best');
    expect(SYSTEM_AGENTIC_FORCED_FALLBACK).toContain('Do not call tools');
  });

  it('SYSTEM_AGENTIC (softened Stage 2-Retry) is still the prompt agentic uses', async () => {
    const substrate = createSubstrate({ embedder: createFakeEmbedder() });
    try {
      let capturedSystem = '';
      const runFn = async (config: AgentLoopConfig): Promise<AgentResponse> => {
        capturedSystem = config.systemPrompt;
        return { content: 'x', toolsUsed: [], usage: { inputTokens: 0, outputTokens: 0 } };
      };
      const { client } = makeCapturingLlm();
      await cells.agentic({
        instance: INSTANCE, model: MODEL, llm: client, turnId: 't',
        substrate, litellm: { url: 'u', apiKey: 'k' }, runAgentLoopFn: runFn,
      });
      expect(capturedSystem).toBe(SYSTEM_AGENTIC);
      // Sanity check on the softened surface language that diverges from Stage 1.
      expect(capturedSystem).toContain('Protocol (you SHOULD follow)');
      expect(capturedSystem).not.toContain('Protocol (you MUST follow)');
      expect(capturedSystem).toContain('general knowledge');
    } finally {
      substrate.close();
    }
  });
});
