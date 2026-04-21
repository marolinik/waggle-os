/**
 * Sprint 11 Task B1 — Stage 2 config threading tests.
 *
 * Acceptance per brief §3 Track B B1:
 *   "Verifikuj da C2 i C3 harness koristi taj config eksplicitno,
 *    ne nasleđeno iz drugog lokala."
 *
 * These tests assert the LOCKED Stage 2 config (thinking=on, max_tokens=64000,
 * route=qwen3.6-35b-a3b-via-openrouter per decision doc 2026-04-22) flows
 * from models.json → ModelSpec.stage2Config → LlmCallInput → request body,
 * and reasoning is parsed back from the response.
 *
 * No real API calls — fetch is mocked. Live end-to-end smoke lives in
 * `scripts/sprint-11-b1-smoke.mjs` and runs independently.
 */

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createLlmClient } from '../src/llm.js';
import type { ModelSpec } from '../src/types.js';

const HERE = url.fileURLToPath(import.meta.url);
const HARNESS_ROOT = path.resolve(path.dirname(HERE), '..');
const MODELS_JSON = path.join(HARNESS_ROOT, 'config', 'models.json');

// Typed helper — models.json contains optional stage2Config so inline type.
type ModelsRegistry = Record<string, ModelSpec>;

function loadModels(): ModelsRegistry {
  return JSON.parse(fs.readFileSync(MODELS_JSON, 'utf-8')) as ModelsRegistry;
}

describe('Sprint 11 B1 — models.json Stage 2 entry', () => {
  it('exposes qwen3.6-35b-a3b-stage2 with the LOCKED config', () => {
    const models = loadModels();
    const stage2 = models['qwen3.6-35b-a3b-stage2'];
    expect(stage2).toBeDefined();
    expect(stage2.litellmModel).toBe('qwen3.6-35b-a3b-via-openrouter');
    expect(stage2.stage2Config).toBeDefined();
    expect(stage2.stage2Config?.thinking).toBe(true);
    expect(stage2.stage2Config?.maxTokens).toBe(64000);
    expect(stage2.stage2Config?.reasoningShape).toBe('openrouter-unified');
  });

  it('leaves the baseline qwen3.6-35b-a3b entry without stage2Config (no side-effect on non-Stage-2 harness runs)', () => {
    const models = loadModels();
    const baseline = models['qwen3.6-35b-a3b'];
    expect(baseline).toBeDefined();
    expect(baseline.stage2Config).toBeUndefined();
  });
});

describe('Sprint 11 B1 — LiteLlmClient threads stage2Config into request body', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  const stage2Model: ModelSpec = {
    id: 'qwen3.6-35b-a3b-stage2',
    displayName: 'Stage 2 LOCKED',
    provider: 'alibaba',
    litellmModel: 'qwen3.6-35b-a3b-via-openrouter',
    pricePerMillionInput: 0.2,
    pricePerMillionOutput: 0.8,
    contextWindow: 262144,
    stage2Config: {
      thinking: true,
      maxTokens: 64000,
      reasoningShape: 'openrouter-unified',
    },
  };

  it('sends max_tokens=64000 and reasoning:{enabled:true} when stage2Config is present', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: '4', reasoning: '2 + 2 = 4' } }],
          usage: { prompt_tokens: 20, completion_tokens: 1 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const llm = createLlmClient({
      dryRun: false,
      litellmUrl: 'http://localhost:4000',
      litellmApiKey: 'sk-test',
    });
    await llm.call({
      model: stage2Model,
      systemPrompt: 'sys',
      userPrompt: 'q',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    const payload = JSON.parse((init as RequestInit).body as string);
    expect(payload.model).toBe('qwen3.6-35b-a3b-via-openrouter');
    expect(payload.max_tokens).toBe(64000);
    expect(payload.reasoning).toEqual({ enabled: true });
  });

  it('captures reasoning from OpenRouter unified response shape', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: '4', reasoning: 'thought chain here' } }],
          usage: { prompt_tokens: 20, completion_tokens: 1 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const llm = createLlmClient({
      dryRun: false,
      litellmUrl: 'http://localhost:4000',
      litellmApiKey: 'sk-test',
    });
    const result = await llm.call({ model: stage2Model, systemPrompt: 'sys', userPrompt: 'q' });
    expect(result.text).toBe('4');
    expect(result.reasoningContent).toBe('thought chain here');
  });

  it('captures reasoning from DashScope native response shape', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: '4', reasoning_content: 'dashscope chain' } }],
          usage: { prompt_tokens: 20, completion_tokens: 1 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const llm = createLlmClient({
      dryRun: false,
      litellmUrl: 'http://localhost:4000',
      litellmApiKey: 'sk-test',
    });
    const result = await llm.call({ model: stage2Model, systemPrompt: 'sys', userPrompt: 'q' });
    expect(result.reasoningContent).toBe('dashscope chain');
  });

  it('omits reasoningContent when provider did not emit it (back-compat for non-thinking routes)', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: 'hi' } }],
          usage: { prompt_tokens: 5, completion_tokens: 1 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const baseline: ModelSpec = { ...stage2Model, stage2Config: undefined };
    const llm = createLlmClient({
      dryRun: false,
      litellmUrl: 'http://localhost:4000',
      litellmApiKey: 'sk-test',
    });
    const result = await llm.call({ model: baseline, systemPrompt: 'sys', userPrompt: 'q' });
    expect(result.reasoningContent).toBeUndefined();
  });

  it('per-call override (input.thinking / maxTokensOverride) wins over model.stage2Config', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: 'hi' } }],
          usage: { prompt_tokens: 5, completion_tokens: 1 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const llm = createLlmClient({
      dryRun: false,
      litellmUrl: 'http://localhost:4000',
      litellmApiKey: 'sk-test',
    });
    await llm.call({
      model: stage2Model,  // has thinking=true, 64000
      systemPrompt: 'sys',
      userPrompt: 'q',
      thinking: false,
      maxTokensOverride: 256,
    });
    const [, init] = fetchMock.mock.calls[0];
    const payload = JSON.parse((init as RequestInit).body as string);
    expect(payload.max_tokens).toBe(256);
    expect(payload.reasoning).toBeUndefined();
  });

  it('back-compat: models without stage2Config still send legacy max_tokens=600 and no reasoning', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: 'hi' } }],
          usage: { prompt_tokens: 5, completion_tokens: 1 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const legacy: ModelSpec = { ...stage2Model, stage2Config: undefined };
    const llm = createLlmClient({
      dryRun: false,
      litellmUrl: 'http://localhost:4000',
      litellmApiKey: 'sk-test',
    });
    await llm.call({ model: legacy, systemPrompt: 'sys', userPrompt: 'q' });
    const [, init] = fetchMock.mock.calls[0];
    const payload = JSON.parse((init as RequestInit).body as string);
    expect(payload.max_tokens).toBe(600);
    expect(payload.reasoning).toBeUndefined();
  });
});
