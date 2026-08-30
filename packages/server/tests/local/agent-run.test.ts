// CC Sesija A §2.5 Task A15 — agent-run sidecar route smoke + logic tests.
//
// Brief: briefs/2026-04-30-cc-sesija-A-waggle-apps-web-integration.md §2.5 Task A15
//
// Scope (per PM "Coverage target >70% za critical paths"):
// - Module loads + exports a Fastify plugin function (smoke).
// - Faza 1 GEPA-evolved shapes register on import (A3.2 effect).
// - listShapes() includes the LOCKED Phase 5 scope after import.
//
// Full Fastify .inject() integration tests (mocking multiMind +
// embeddingProvider + LiteLLM) are deferred to Phase 5 e2e validation —
// current critical-path coverage is module + side-effect validation.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import { describe, it, expect, vi } from 'vitest';

describe('agent-run.ts route module', () => {
  it('exports agentRunRoutes plugin function', async () => {
    const mod = await import('../../src/local/routes/agent-run.js');
    expect(mod.agentRunRoutes).toBeDefined();
    expect(typeof mod.agentRunRoutes).toBe('function');
  });

  it('registers Faza 1 GEPA-evolved shapes on module import (A3.2)', async () => {
    // Module-import side effect: registerShape() runs at top-level for
    // claude-gen1-v1 + qwen-thinking-gen1-v1. After this import the names
    // must be present in REGISTRY (visible via listShapes()).
    await import('../../src/local/routes/agent-run.js');
    const { listShapes } = await import('@waggle/agent');

    const shapes = listShapes();
    expect(shapes).toContain('claude-gen1-v1');
    expect(shapes).toContain('qwen-thinking-gen1-v1');
  });

  it('does not register Faza 2 OVERFIT variants (Phase 5 LOCKED scope)', async () => {
    // Phase 5 scope LOCK: only gen1-v1 shapes ship. gen1-v2 variants are
    // intentionally absent from REGISTRY (Faza 2 OVERFIT exposed in
    // Checkpoint C — decisions/2026-04-29-gepa-faza1-results.md).
    await import('../../src/local/routes/agent-run.js');
    const { listShapes } = await import('@waggle/agent');

    const shapes = listShapes();
    expect(shapes).not.toContain('claude-gen1-v2');
    expect(shapes).not.toContain('qwen-thinking-gen1-v2');
    expect(shapes).not.toContain('gpt-gen1-v2');
  });

  it('Faza 1 shapes have valid PromptShape interface (name + metadata + builders)', async () => {
    const { claudeGen1V1Shape, qwenThinkingGen1V1Shape } = await import('@waggle/agent');

    for (const shape of [claudeGen1V1Shape, qwenThinkingGen1V1Shape]) {
      expect(shape.name).toBeTruthy();
      expect(typeof shape.name).toBe('string');
      expect(shape.metadata).toBeTruthy();
      expect(shape.metadata.modelClass).toBeTruthy();
      expect(shape.metadata.evidence_link).toBeTruthy();
      expect(typeof shape.systemPrompt).toBe('function');
    }
  });

  it('shape names match the canonical hyphen format used in tauri-bindings', () => {
    // shape-selection.ts AVAILABLE_SHAPES IDs must match shape.name fields
    // exactly so the sidecar registry lookup succeeds end-to-end. Drift here
    // would silently fall back to model-default (warn-log path). Locking the
    // names by test prevents accidental rename.
    const expectedNames = ['claude-gen1-v1', 'qwen-thinking-gen1-v1'];
    expect(expectedNames.every((n) => n.includes('-gen1-v1'))).toBe(true);
    expect(expectedNames.every((n) => !n.includes('::'))).toBe(true);
  });

  it('accepts only complete text responses and preserves usage on failure', async () => {
    const { parseAgentRunCompletion } = await import('../../src/local/routes/agent-run.js');
    const usage = { prompt_tokens: 21, completion_tokens: 8, total_cost: 0.018 };

    expect(parseAgentRunCompletion({
      choices: [{ finish_reason: 'stop', message: { content: 'Final answer.' } }],
      usage,
    }, 17)).toEqual({
      content: 'Final answer.',
      inTokens: 21,
      outTokens: 8,
      costUsd: 0.018,
      latencyMs: 17,
    });

    for (const choice of [
      { message: { content: 'Missing terminal reason.' } },
      { finish_reason: 'length', message: { content: 'Truncated answer.' } },
      {
        finish_reason: 'stop',
        message: { content: 'Unsafe mismatch.', tool_calls: [{ id: 'call_1' }] },
      },
    ]) {
      expect(() => parseAgentRunCompletion({ choices: [choice], usage }, 19)).toThrowError(
        expect.objectContaining({
          code: 'INCOMPLETE_COMPLETION',
          usage: { inputTokens: 21, outputTokens: 8, totalCostUsd: 0.018 },
          message: expect.stringMatching(/partial content was rejected/i),
        }),
      );
    }

    expect(() => parseAgentRunCompletion(null, 19)).toThrowError(
      expect.objectContaining({ code: 'INCOMPLETE_COMPLETION' }),
    );
  });

  it('does not replay a malformed HTTP-200 completion and reports done.ok=false', async () => {
    const fetchImpl = vi.fn(async () => new Response('{', { status: 200 }));
    vi.stubGlobal('fetch', fetchImpl);
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-agent-run-model-'));
    fs.writeFileSync(path.join(dataDir, 'config.json'), JSON.stringify({
      defaultModel: 'openai-compatible/qwen3.8-flash-next',
    }));
    const server = Fastify({ logger: false });
    server.decorate('multiMind', { personal: {} } as never);
    server.decorate('embeddingProvider', { dimensions: 3 } as never);
    server.decorate('agentState', { litellmApiKey: 'test-key' } as never);
    server.decorate('localConfig', { dataDir, litellmUrl: 'http://127.0.0.1:43123/v1' } as never);

    try {
      const { agentRunRoutes } = await import('../../src/local/routes/agent-run.js');
      await server.register(agentRunRoutes);
      const response = await server.inject({
        method: 'POST',
        url: '/api/agent/run',
        payload: {
          question: 'Give me a complete answer.',
          shape: 'qwen-thinking-gen1-v1',
        },
      });

      expect(fetchImpl).toHaveBeenCalledOnce();
      expect(response.body).toContain(
        'event: started\ndata: {"shape":"qwen-thinking-gen1-v1","shapeRequested":"qwen-thinking-gen1-v1","shapeRecognized":true,"model":"openai-compatible/qwen3.8-flash-next"}',
      );
      const outbound = JSON.parse(String(vi.mocked(globalThis.fetch).mock.calls[0]?.[1]?.body));
      expect(outbound).toMatchObject({
        model: 'openai-compatible/qwen3.8-flash-next',
        chat_template_kwargs: { enable_thinking: true },
      });
      expect(outbound).not.toHaveProperty('extra_body');
      expect(response.body).toContain('event: error');
      expect(response.body).toContain('INCOMPLETE_COMPLETION');
      expect(response.body).toContain('data: {"ok":false}');
      expect(response.body).not.toContain('event: finalized');

      fetchImpl.mockClear();
      const explicitResponse = await server.inject({
        method: 'POST',
        url: '/api/agent/run',
        payload: {
          question: 'Use the explicitly requested model.',
          model: 'openai/gpt-5.4',
        },
      });

      expect(fetchImpl).toHaveBeenCalledOnce();
      expect(explicitResponse.body).toContain(
        'event: started\ndata: {"shape":"(model-default)","shapeRequested":null,"shapeRecognized":true,"model":"openai/gpt-5.4"}',
      );
      const explicitOutbound = JSON.parse(String(
        vi.mocked(globalThis.fetch).mock.calls[0]?.[1]?.body,
      ));
      expect(explicitOutbound.model).toBe('openai/gpt-5.4');
      expect(explicitOutbound).not.toHaveProperty('chat_template_kwargs');
      expect(explicitOutbound).not.toHaveProperty('extra_body');

      fetchImpl.mockClear();
      await server.inject({
        method: 'POST',
        url: '/api/agent/run',
        payload: {
          question: 'Use the external Qwen transport.',
          model: 'openrouter/qwen/qwen3.8-flash-next',
          shape: 'qwen-thinking-gen1-v1',
        },
      });
      const externalQwenOutbound = JSON.parse(String(
        vi.mocked(globalThis.fetch).mock.calls[0]?.[1]?.body,
      ));
      expect(externalQwenOutbound).toMatchObject({
        model: 'openrouter/qwen/qwen3.8-flash-next',
        extra_body: { enable_thinking: true },
      });
      expect(externalQwenOutbound).not.toHaveProperty('chat_template_kwargs');

      fetchImpl.mockClear();
      await server.inject({
        method: 'POST',
        url: '/api/agent/run',
        payload: {
          question: 'Preserve a mixed-case compatible Qwen model ID.',
          model: 'openai-compatible/Qwen/Qwen3.8-Flash-Next',
          shape: 'qwen-thinking-gen1-v1',
        },
      });
      const mixedCaseQwenOutbound = JSON.parse(String(
        vi.mocked(globalThis.fetch).mock.calls[0]?.[1]?.body,
      ));
      expect(mixedCaseQwenOutbound).toMatchObject({
        model: 'openai-compatible/Qwen/Qwen3.8-Flash-Next',
        chat_template_kwargs: { enable_thinking: true },
      });
      expect(mixedCaseQwenOutbound).not.toHaveProperty('extra_body');
    } finally {
      vi.unstubAllGlobals();
      await server.close();
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });
});
