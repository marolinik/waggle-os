/**
 * Task 2.5 Stage 1 — retrieval + agentic cell behavior tests.
 *
 * These are the substrate-dependent cells. Tests use:
 *   - a real ephemeral MindDB + HybridSearch (via substrate factory) for
 *     retrieval, so we exercise the actual RRF fusion path end-to-end.
 *   - a mock `runAgentLoopFn` for agentic, so we verify the cell wires the
 *     tool allowlist + maxTurns + AbortSignal correctly without standing up
 *     a live LiteLLM proxy.
 */

import { describe, expect, it, vi } from 'vitest';
import type { Embedder } from '@waggle/core';
import type { AgentLoopConfig, AgentResponse } from '@waggle/agent';
import type { LlmCallInput, LlmCallResult, LlmClient } from '../src/llm.js';
import type { DatasetInstance, ModelSpec } from '../src/types.js';
import { cells, makeSearchMemoryTool, SYSTEM_AGENTIC } from '../src/cells.js';
import { createSubstrate } from '../src/substrate.js';

const VEC_DIMS = 1024;

function createFakeEmbedder(dims: number = VEC_DIMS): Embedder {
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
    const v = new Float32Array(dims);
    for (let i = 0; i < dims; i++) {
      state ^= state << 13; state >>>= 0;
      state ^= state >>> 17;
      state ^= state << 5; state >>>= 0;
      v[i] = ((state >>> 0) / 0x100000000) * 2 - 1;
    }
    let mag = 0;
    for (let i = 0; i < dims; i++) mag += v[i] * v[i];
    mag = Math.sqrt(mag);
    if (mag > 0) for (let i = 0; i < dims; i++) v[i] /= mag;
    return v;
  };
  return {
    dimensions: dims,
    async embed(text) { return embedOne(text); },
    async embedBatch(texts) { return texts.map(embedOne); },
  };
}

const MODEL: ModelSpec = {
  id: 'qwen3.6-35b-a3b-via-dashscope-direct',
  displayName: 'Qwen3.6-35B-A3B (DashScope direct)',
  provider: 'alibaba',
  litellmModel: 'dashscope-direct/qwen3.6-35b-a3b',
  pricePerMillionInput: 0.2,
  pricePerMillionOutput: 0.8,
  contextWindow: 262144,
};

const INSTANCE: DatasetInstance = {
  instance_id: 'locomo_conv-01_q000',
  question: 'When did Caroline paint a sunrise?',
  context: 'full conversation context would be here in reality',
  expected: ['2022'],
  conversation_id: 'conv-01',
};

/** Build an LlmClient that captures every call argument for assertion. */
function createCapturingLlm(response: Partial<LlmCallResult> = {}): {
  client: LlmClient;
  calls: LlmCallInput[];
} {
  const calls: LlmCallInput[] = [];
  const client: LlmClient = {
    async call(input: LlmCallInput): Promise<LlmCallResult> {
      calls.push(input);
      return {
        text: response.text ?? 'test-answer',
        inputTokens: response.inputTokens ?? 100,
        outputTokens: response.outputTokens ?? 10,
        latencyMs: response.latencyMs ?? 42,
        costUsd: response.costUsd ?? 0.0001,
        failureMode: response.failureMode ?? null,
      };
    },
  };
  return { client, calls };
}

describe('no-context cell — Stage 2-Retry §1.1 true zero-memory baseline', () => {
  it('sends question-only user prompt, no instance.context, no memory injection', async () => {
    const { client, calls } = createCapturingLlm();
    const result = await cells['no-context']({
      instance: INSTANCE, model: MODEL, llm: client, turnId: 't',
    });
    expect(result.text).toBe('test-answer');
    expect(calls).toHaveLength(1);
    expect(calls[0].userPrompt).toBe(`Question: ${INSTANCE.question}`);
    expect(calls[0].userPrompt).not.toContain(INSTANCE.context);
    expect(calls[0].userPrompt).not.toContain('# Recalled Memories');
    expect(calls[0].userPrompt).not.toContain('Context:');
  });

  it('uses SYSTEM_BASELINE (not EVOLVED) for format consistency with raw/retrieval', async () => {
    const { client, calls } = createCapturingLlm();
    await cells['no-context']({
      instance: INSTANCE, model: MODEL, llm: client, turnId: 't',
    });
    expect(calls[0].systemPrompt).toContain('shortest possible answer');
    expect(calls[0].systemPrompt).not.toContain('Extract the answer from the supplied context');
  });

  it('does NOT require substrate or litellm (no dependencies beyond LlmClient)', async () => {
    const { client } = createCapturingLlm();
    // No substrate, no litellm — pure LLM call. Must not throw.
    const result = await cells['no-context']({
      instance: INSTANCE, model: MODEL, llm: client, turnId: 't',
    });
    expect(result.failureMode).toBeNull();
    expect(result.text).toBeTruthy();
  });
});

describe('retrieval cell — real HybridSearch, Task 2.5 Stage 1', () => {
  it('calls substrate search with the instance question and top-K', async () => {
    const substrate = createSubstrate({ embedder: createFakeEmbedder() });
    try {
      // memory_frames.gop_id FKs to sessions.gop_id — ensure sessions first.
      substrate.sessions.ensure('conv-01');
      substrate.sessions.ensure('conv-02');
      const f1 = substrate.frames.createIFrame('conv-01', 'Caroline: I painted a sunrise in 2022', 'normal', 'import');
      const f2 = substrate.frames.createIFrame('conv-01', 'Melanie: Nice painting', 'normal', 'import');
      const f3 = substrate.frames.createIFrame('conv-02', 'Dan: unrelated turn', 'normal', 'import');
      await substrate.search.indexFramesBatch([
        { id: f1.id, content: f1.content },
        { id: f2.id, content: f2.content },
        { id: f3.id, content: f3.content },
      ]);

      const { client, calls } = createCapturingLlm();
      const result = await cells.retrieval({
        instance: INSTANCE,
        model: MODEL,
        llm: client,
        turnId: 'turn-1',
        substrate,
        retrievalTopK: 5,
      });

      expect(result.text).toBe('test-answer');
      expect(calls).toHaveLength(1);
      const userPrompt = calls[0].userPrompt;
      expect(userPrompt).toContain('# Recalled Memories');
      expect(userPrompt).toContain('Caroline');
      expect(userPrompt).toContain(INSTANCE.question);
    } finally {
      substrate.close();
    }
  });

  it('uses baseline system prompt (not evolved)', async () => {
    const substrate = createSubstrate({ embedder: createFakeEmbedder() });
    try {
      substrate.sessions.ensure('c');
      const f = substrate.frames.createIFrame('c', 'Alice: hello', 'normal', 'import');
      await substrate.search.indexFramesBatch([{ id: f.id, content: f.content }]);
      const { client, calls } = createCapturingLlm();
      await cells.retrieval({
        instance: INSTANCE, model: MODEL, llm: client, turnId: 't', substrate,
      });
      expect(calls[0].systemPrompt).toContain('shortest possible answer');
      expect(calls[0].systemPrompt).not.toContain('Extract the answer from the supplied context');
    } finally {
      substrate.close();
    }
  });

  it('defaults retrievalTopK to 20 when unspecified (Stage 2-Retry §1.2)', async () => {
    const substrate = createSubstrate({ embedder: createFakeEmbedder() });
    try {
      const spy = vi.spyOn(substrate.search, 'search');
      const { client } = createCapturingLlm();
      const instanceNoConv: DatasetInstance = { ...INSTANCE };
      delete instanceNoConv.conversation_id;
      await cells.retrieval({
        instance: instanceNoConv, model: MODEL, llm: client, turnId: 't', substrate,
      });
      expect(spy).toHaveBeenCalledWith(instanceNoConv.question, { limit: 20 });
      spy.mockRestore();
    } finally {
      substrate.close();
    }
  });

  it('passes gopId filter when conversation_id is set on the instance (Stage 2-Retry §1.2)', async () => {
    const substrate = createSubstrate({ embedder: createFakeEmbedder() });
    try {
      const spy = vi.spyOn(substrate.search, 'search').mockResolvedValue([]);
      const { client } = createCapturingLlm();
      const instanceWithConv: DatasetInstance = { ...INSTANCE, conversation_id: 'conv-26' };
      await cells.retrieval({
        instance: instanceWithConv, model: MODEL, llm: client, turnId: 't', substrate,
      });
      expect(spy).toHaveBeenCalledWith(instanceWithConv.question, { limit: 20, gopId: 'conv-26' });
      spy.mockRestore();
    } finally {
      substrate.close();
    }
  });

  it('omits gopId when conversation_id is absent (backward compat)', async () => {
    const substrate = createSubstrate({ embedder: createFakeEmbedder() });
    try {
      const spy = vi.spyOn(substrate.search, 'search').mockResolvedValue([]);
      const { client } = createCapturingLlm();
      const instanceNoConv: DatasetInstance = { ...INSTANCE };
      delete instanceNoConv.conversation_id;
      await cells.retrieval({
        instance: instanceNoConv, model: MODEL, llm: client, turnId: 't', substrate,
        retrievalTopK: 7,
      });
      // When no conversation_id, no gopId in call; only limit.
      expect(spy).toHaveBeenCalledWith(instanceNoConv.question, { limit: 7 });
      spy.mockRestore();
    } finally {
      substrate.close();
    }
  });

  it('emits (none) marker when no memories are retrieved', async () => {
    const substrate = createSubstrate({ embedder: createFakeEmbedder() });
    try {
      const { client, calls } = createCapturingLlm();
      await cells.retrieval({
        instance: INSTANCE, model: MODEL, llm: client, turnId: 't', substrate,
      });
      expect(calls[0].userPrompt).toContain('(none)');
    } finally {
      substrate.close();
    }
  });

  it('throws a clear error when substrate is missing', async () => {
    const { client } = createCapturingLlm();
    await expect(
      cells.retrieval({
        instance: INSTANCE, model: MODEL, llm: client, turnId: 't',
      }),
    ).rejects.toThrow(/requires a Substrate/);
  });
});

describe('agentic cell — agent-loop plus search_memory, Task 2.5 Stage 1', () => {
  function createMockRunAgentLoop(response: Partial<AgentResponse> = {}): {
    fn: (config: AgentLoopConfig) => Promise<AgentResponse>;
    configs: AgentLoopConfig[];
  } {
    const configs: AgentLoopConfig[] = [];
    const fn = async (config: AgentLoopConfig): Promise<AgentResponse> => {
      configs.push(config);
      return {
        content: response.content ?? '2022',
        toolsUsed: response.toolsUsed ?? ['search_memory'],
        usage: response.usage ?? { inputTokens: 250, outputTokens: 5 },
      };
    };
    return { fn, configs };
  }

  it('invokes runAgentLoop with the search_memory tool only', async () => {
    const substrate = createSubstrate({ embedder: createFakeEmbedder() });
    try {
      const { fn, configs } = createMockRunAgentLoop();
      const { client } = createCapturingLlm();
      await cells.agentic({
        instance: INSTANCE, model: MODEL, llm: client, turnId: 'turn-1',
        substrate,
        litellm: { url: 'http://localhost:4000', apiKey: 'sk-test' },
        runAgentLoopFn: fn,
      });
      expect(configs).toHaveLength(1);
      expect(configs[0].tools.map(t => t.name)).toEqual(['search_memory']);
    } finally {
      substrate.close();
    }
  });

  it('passes maxTurns=3 by default (GATE-S0 lock)', async () => {
    const substrate = createSubstrate({ embedder: createFakeEmbedder() });
    try {
      const { fn, configs } = createMockRunAgentLoop();
      const { client } = createCapturingLlm();
      await cells.agentic({
        instance: INSTANCE, model: MODEL, llm: client, turnId: 't',
        substrate, litellm: { url: 'u', apiKey: 'k' }, runAgentLoopFn: fn,
      });
      expect(configs[0].maxTurns).toBe(3);
    } finally {
      substrate.close();
    }
  });

  it('honours an agenticMaxTurns override', async () => {
    const substrate = createSubstrate({ embedder: createFakeEmbedder() });
    try {
      const { fn, configs } = createMockRunAgentLoop();
      const { client } = createCapturingLlm();
      await cells.agentic({
        instance: INSTANCE, model: MODEL, llm: client, turnId: 't',
        substrate, litellm: { url: 'u', apiKey: 'k' }, runAgentLoopFn: fn,
        agenticMaxTurns: 5,
      });
      expect(configs[0].maxTurns).toBe(5);
    } finally {
      substrate.close();
    }
  });

  it('threads an AbortSignal that can cancel after the timeout', async () => {
    const substrate = createSubstrate({ embedder: createFakeEmbedder() });
    try {
      const { fn, configs } = createMockRunAgentLoop();
      const { client } = createCapturingLlm();
      await cells.agentic({
        instance: INSTANCE, model: MODEL, llm: client, turnId: 't',
        substrate, litellm: { url: 'u', apiKey: 'k' }, runAgentLoopFn: fn,
        agenticTimeoutMs: 50,
      });
      expect(configs[0].signal).toBeInstanceOf(AbortSignal);
    } finally {
      substrate.close();
    }
  });

  it('uses SYSTEM_AGENTIC prompt verbatim', async () => {
    const substrate = createSubstrate({ embedder: createFakeEmbedder() });
    try {
      const { fn, configs } = createMockRunAgentLoop();
      const { client } = createCapturingLlm();
      await cells.agentic({
        instance: INSTANCE, model: MODEL, llm: client, turnId: 't',
        substrate, litellm: { url: 'u', apiKey: 'k' }, runAgentLoopFn: fn,
      });
      expect(configs[0].systemPrompt).toBe(SYSTEM_AGENTIC);
    } finally {
      substrate.close();
    }
  });

  it('passes the question as the single user message', async () => {
    const substrate = createSubstrate({ embedder: createFakeEmbedder() });
    try {
      const { fn, configs } = createMockRunAgentLoop();
      const { client } = createCapturingLlm();
      await cells.agentic({
        instance: INSTANCE, model: MODEL, llm: client, turnId: 't',
        substrate, litellm: { url: 'u', apiKey: 'k' }, runAgentLoopFn: fn,
      });
      expect(configs[0].messages).toEqual([{ role: 'user', content: INSTANCE.question }]);
    } finally {
      substrate.close();
    }
  });

  it('returns LlmCallResult shape with cost from model pricing and token usage', async () => {
    const substrate = createSubstrate({ embedder: createFakeEmbedder() });
    try {
      const { fn } = createMockRunAgentLoop({
        content: 'final answer',
        usage: { inputTokens: 1_000_000, outputTokens: 500_000 },
      });
      const { client } = createCapturingLlm();
      const result = await cells.agentic({
        instance: INSTANCE, model: MODEL, llm: client, turnId: 't',
        substrate, litellm: { url: 'u', apiKey: 'k' }, runAgentLoopFn: fn,
      });
      expect(result.text).toBe('final answer');
      expect(result.inputTokens).toBe(1_000_000);
      expect(result.outputTokens).toBe(500_000);
      // 1M input tokens x $0.2 + 500K output tokens x $0.8/M = 0.2 + 0.4 = 0.6
      expect(result.costUsd).toBeCloseTo(0.6, 5);
      expect(result.failureMode).toBeNull();
    } finally {
      substrate.close();
    }
  });

  it('reports agentic_error_* failureMode on throw', async () => {
    const substrate = createSubstrate({ embedder: createFakeEmbedder() });
    try {
      const throwingFn = async (): Promise<AgentResponse> => {
        const e = new Error('transport blew up');
        e.name = 'TypeError';
        throw e;
      };
      const { client } = createCapturingLlm();
      const result = await cells.agentic({
        instance: INSTANCE, model: MODEL, llm: client, turnId: 't',
        substrate, litellm: { url: 'u', apiKey: 'k' }, runAgentLoopFn: throwingFn,
      });
      expect(result.failureMode).toBe('agentic_error_TypeError');
      expect(result.text).toBe('');
      expect(result.costUsd).toBe(0);
    } finally {
      substrate.close();
    }
  });

  it('reports timeout failureMode on AbortError', async () => {
    const substrate = createSubstrate({ embedder: createFakeEmbedder() });
    try {
      const abortFn = async (): Promise<AgentResponse> => {
        const e = new Error('aborted');
        e.name = 'AbortError';
        throw e;
      };
      const { client } = createCapturingLlm();
      const result = await cells.agentic({
        instance: INSTANCE, model: MODEL, llm: client, turnId: 't',
        substrate, litellm: { url: 'u', apiKey: 'k' }, runAgentLoopFn: abortFn,
      });
      expect(result.failureMode).toBe('timeout');
    } finally {
      substrate.close();
    }
  });

  it('throws clear error when substrate missing', async () => {
    const { client } = createCapturingLlm();
    await expect(
      cells.agentic({
        instance: INSTANCE, model: MODEL, llm: client, turnId: 't',
        litellm: { url: 'u', apiKey: 'k' },
      }),
    ).rejects.toThrow(/requires a Substrate/);
  });

  it('throws clear error when litellm config missing', async () => {
    const substrate = createSubstrate({ embedder: createFakeEmbedder() });
    try {
      const { client } = createCapturingLlm();
      await expect(
        cells.agentic({
          instance: INSTANCE, model: MODEL, llm: client, turnId: 't', substrate,
        }),
      ).rejects.toThrow(/requires litellm/);
    } finally {
      substrate.close();
    }
  });
});

describe('makeSearchMemoryTool', () => {
  it('returns a ToolDefinition with name=search_memory and a query param', () => {
    const substrate = createSubstrate({ embedder: createFakeEmbedder() });
    try {
      const tool = makeSearchMemoryTool(substrate);
      expect(tool.name).toBe('search_memory');
      expect(tool.offlineCapable).toBe(true);
      const params = tool.parameters as { required?: string[]; properties: Record<string, unknown> };
      expect(params.required).toEqual(['query']);
      expect(params.properties.query).toBeDefined();
      expect(params.properties.limit).toBeDefined();
    } finally {
      substrate.close();
    }
  });

  it('executes against substrate search and formats results', async () => {
    const substrate = createSubstrate({ embedder: createFakeEmbedder() });
    try {
      substrate.sessions.ensure('c');
      const f = substrate.frames.createIFrame('c', 'Caroline: painted sunrise 2022', 'normal', 'import');
      await substrate.search.indexFramesBatch([{ id: f.id, content: f.content }]);
      const tool = makeSearchMemoryTool(substrate, 5);
      const out = await tool.execute({ query: 'sunrise', limit: 3 });
      expect(out).toContain('Caroline');
      expect(out).toContain('sunrise');
    } finally {
      substrate.close();
    }
  });

  it('returns a clear message on empty query', async () => {
    const substrate = createSubstrate({ embedder: createFakeEmbedder() });
    try {
      const tool = makeSearchMemoryTool(substrate);
      const out = await tool.execute({ query: '   ' });
      expect(out).toMatch(/query is required/);
    } finally {
      substrate.close();
    }
  });

  it('returns no-memories marker on empty corpus', async () => {
    const substrate = createSubstrate({ embedder: createFakeEmbedder() });
    try {
      const tool = makeSearchMemoryTool(substrate);
      const out = await tool.execute({ query: 'whatever' });
      expect(out).toBe('(no memories found)');
    } finally {
      substrate.close();
    }
  });

  it('clamps limit to 1..50 (Stage 2-Retry §1.2 upper bound relaxed 20→50)', async () => {
    const substrate = createSubstrate({ embedder: createFakeEmbedder() });
    try {
      const spy = vi.spyOn(substrate.search, 'search').mockResolvedValue([]);
      const tool = makeSearchMemoryTool(substrate, 20);
      await tool.execute({ query: 'x', limit: 999 });
      expect(spy).toHaveBeenLastCalledWith('x', { limit: 50 });
      await tool.execute({ query: 'x', limit: -5 });
      expect(spy).toHaveBeenLastCalledWith('x', { limit: 1 });
      spy.mockRestore();
    } finally {
      substrate.close();
    }
  });

  it('default limit is 20 (Stage 2-Retry §1.2 bump 10→20)', async () => {
    const substrate = createSubstrate({ embedder: createFakeEmbedder() });
    try {
      const spy = vi.spyOn(substrate.search, 'search').mockResolvedValue([]);
      const tool = makeSearchMemoryTool(substrate); // no explicit default
      await tool.execute({ query: 'x' });
      expect(spy).toHaveBeenLastCalledWith('x', { limit: 20 });
      spy.mockRestore();
    } finally {
      substrate.close();
    }
  });

  it('when boundToGopId is set, scopes every call to that gopId (Stage 2-Retry §1.2)', async () => {
    const substrate = createSubstrate({ embedder: createFakeEmbedder() });
    try {
      const spy = vi.spyOn(substrate.search, 'search').mockResolvedValue([]);
      const tool = makeSearchMemoryTool(substrate, 20, 'conv-42');
      await tool.execute({ query: 'anything' });
      expect(spy).toHaveBeenLastCalledWith('anything', { limit: 20, gopId: 'conv-42' });
      // Agent-side args.gopId must NOT override the bound scope (not part of
      // the tool schema either way — silent drop).
      await tool.execute({ query: 'still-scoped', gopId: 'conv-other' } as Record<string, unknown>);
      expect(spy).toHaveBeenLastCalledWith('still-scoped', { limit: 20, gopId: 'conv-42' });
      spy.mockRestore();
    } finally {
      substrate.close();
    }
  });

  it('when boundToGopId is NOT set, call has no gopId field (backward compat)', async () => {
    const substrate = createSubstrate({ embedder: createFakeEmbedder() });
    try {
      const spy = vi.spyOn(substrate.search, 'search').mockResolvedValue([]);
      const tool = makeSearchMemoryTool(substrate, 20);
      await tool.execute({ query: 'x' });
      expect(spy).toHaveBeenLastCalledWith('x', { limit: 20 });
      spy.mockRestore();
    } finally {
      substrate.close();
    }
  });

  it('description mentions auto-scope when bound to gopId', () => {
    const substrate = createSubstrate({ embedder: createFakeEmbedder() });
    try {
      const bound = makeSearchMemoryTool(substrate, 20, 'conv-xyz');
      const unbound = makeSearchMemoryTool(substrate, 20);
      expect(bound.description).toContain('auto-restricted to the current conversation');
      expect(unbound.description).not.toContain('auto-restricted');
    } finally {
      substrate.close();
    }
  });
});
