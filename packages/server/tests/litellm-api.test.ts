import { describe, it, expect, beforeAll, afterAll, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { FastifyInstance } from 'fastify';
import { WaggleConfig } from '@waggle/core';

// Mock the lifecycle module before importing anything that uses it
vi.mock('../src/local/lifecycle.js', () => ({
  getLiteLLMStatus: vi.fn(),
  startLiteLLM: vi.fn(),
  stopLiteLLM: vi.fn(),
}));

import { buildLocalServer } from '../src/local/index.js';
import { getLiteLLMStatus, startLiteLLM, stopLiteLLM } from '../src/local/lifecycle.js';
import {
  listOllamaChatModelIds,
  resolveExplicitRoutableModel,
  resolveUsableModel,
} from '../src/local/model-availability.js';
import { PROVIDER_ENV_NAMES } from '../src/local/provider-env.js';
import { startService } from '../src/local/service.js';
import { injectWithAuth } from './test-utils.js';

const mockGetStatus = getLiteLLMStatus as ReturnType<typeof vi.fn>;
const mockStart = startLiteLLM as ReturnType<typeof vi.fn>;
const mockStop = stopLiteLLM as ReturnType<typeof vi.fn>;

describe('LiteLLM Management API', () => {
  let server: FastifyInstance;
  let dataDir: string;
  const originalProviderEnv = new Map<string, string | undefined>();

  beforeAll(async () => {
    for (const envName of new Set(Object.values(PROVIDER_ENV_NAMES).flat())) {
      originalProviderEnv.set(envName, process.env[envName]);
      delete process.env[envName];
    }
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-litellm-api-'));

    // Write minimal config.json
    fs.writeFileSync(
      path.join(dataDir, 'config.json'),
      JSON.stringify({ defaultModel: 'test/model', providers: {} }),
      'utf-8'
    );

    server = await buildLocalServer({
      dataDir,
      port: 0,
      manageLiteLLM: true,
      managedLiteLLMPort: 4000,
    });
  });

  afterAll(async () => {
    await server.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
    for (const [envName, value] of originalProviderEnv) {
      if (value === undefined) delete process.env[envName];
      else process.env[envName] = value;
    }
  });

  beforeEach(() => {
    vi.clearAllMocks();
    for (const envName of originalProviderEnv.keys()) delete process.env[envName];
  });

  afterEach(() => {
    vi.restoreAllMocks();
    server.vault.delete('openai');
    server.vault.delete('google');
    server.vault.delete('openrouter');
  });

  // --- GET /api/litellm/status ---

  it('GET /api/litellm/status returns running status', async () => {
    mockGetStatus.mockResolvedValue({ status: 'running', port: 4000 });

    const res = await injectWithAuth(server, {
      method: 'GET',
      url: '/api/litellm/status',
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.running).toBe(true);
    expect(body.port).toBe(4000);
  });

  it('GET /api/litellm/status returns not running when error', async () => {
    mockGetStatus.mockResolvedValue({
      status: 'error',
      port: 4000,
      error: 'LiteLLM is not running',
    });

    const res = await injectWithAuth(server, {
      method: 'GET',
      url: '/api/litellm/status',
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.running).toBe(false);
    expect(body.port).toBe(4000);
  });

  // --- POST /api/litellm/restart ---

  function configureDynamicCatalog(model = 'provider-model-added-today'): void {
    server.vault.set('openai', 'openai-router-test-key');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      data: [{ id: model }],
    }), { status: 200 }));
  }

  it('POST /api/litellm/restart calls stop then start, returns new status', async () => {
    configureDynamicCatalog();
    mockStop.mockResolvedValue(undefined);
    mockStart.mockResolvedValue({ status: 'started', port: 4000 });

    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/litellm/restart',
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.running).toBe(true);
    expect(body.port).toBe(4000);
    expect(body.models).toEqual(['openai/provider-model-added-today']);

    // Verify stop was called before start
    expect(mockStop).toHaveBeenCalledTimes(1);
    expect(mockStart).toHaveBeenCalledTimes(1);
    const stopOrder = mockStop.mock.invocationCallOrder[0];
    const startOrder = mockStart.mock.invocationCallOrder[0];
    expect(stopOrder).toBeLessThan(startOrder);
    expect(mockStart).toHaveBeenCalledWith(4000, path.join(dataDir, 'litellm.runtime.json'));
    server.vault.delete('openai');
  });

  it('POST /api/litellm/restart returns error on start failure', async () => {
    configureDynamicCatalog();
    mockStop.mockResolvedValue(undefined);
    mockStart.mockResolvedValue({
      status: 'error',
      port: 4000,
      error: 'Failed to spawn LiteLLM',
    });

    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/litellm/restart',
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.running).toBe(false);
    expect(body.error).toBe('Failed to spawn LiteLLM');
    server.vault.delete('openai');
  });

  it('POST /api/litellm/restart proceeds to start even if stop throws', async () => {
    configureDynamicCatalog();
    mockStop.mockRejectedValue(new Error('kill ESRCH'));
    mockStart.mockResolvedValue({ status: 'started', port: 4000 });

    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/litellm/restart',
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.running).toBe(true);
    expect(body.port).toBe(4000);
    expect(mockStart).toHaveBeenCalledTimes(1);
    server.vault.delete('openai');
  });

  it('POST /api/litellm/restart returns fallback error on timeout status', async () => {
    configureDynamicCatalog();
    mockStop.mockResolvedValue(undefined);
    mockStart.mockResolvedValue({ status: 'timeout', port: 4000 });

    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/litellm/restart',
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.running).toBe(false);
    expect(body.error).toBe('LiteLLM did not start in time');
    server.vault.delete('openai');
  });

  it('GET /api/litellm/pricing uses router metadata instead of a static model list', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      data: [{
        model_name: 'openai/model-added-after-release',
        model_info: { input_cost_per_token: 0.000002, output_cost_per_token: 0.000006 },
      }],
    }), { status: 200 }));

    const res = await injectWithAuth(server, { method: 'GET', url: '/api/litellm/pricing' });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual([{
      model: 'openai/model-added-after-release',
      inputPer1k: 0.002,
      outputPer1k: 0.006,
      provider: 'openai',
    }]);
  });

  // --- GET /api/litellm/models ---

  it('GET /api/litellm/models returns model list', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { id: 'gpt-4o' },
          { id: 'claude-sonnet-4-20250514' },
          { id: 'gemini-pro' },
        ],
      }),
    } as Response);

    const res = await injectWithAuth(server, {
      method: 'GET',
      url: '/api/litellm/models',
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.models).toEqual(['gpt-4o', 'claude-sonnet-4-20250514', 'gemini-pro']);
  });

  it('GET /api/litellm/models merges newly discovered models from configured providers', async () => {
    server.vault!.set('openai', 'openai-catalog-key');
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url === 'https://api.openai.com/v1/models') {
        return new Response(JSON.stringify({ data: [{ id: 'new-model-v9' }] }), { status: 200 });
      }
      if (url.endsWith('/api/tags')) return { ok: false, status: 503 } as Response;
      if (url.endsWith('/models')) return new Response(JSON.stringify({ data: [] }), { status: 200 });
      throw new Error(`unexpected fetch ${url}`);
    });

    try {
      const res = await injectWithAuth(server, {
        method: 'GET',
        url: '/api/litellm/models',
      });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).models).toContain('openai/new-model-v9');
    } finally {
      server.vault!.delete('openai');
    }
  });

  it('GET /api/litellm/models merges a persisted OpenAI-compatible model with router results', async () => {
    const configPath = path.join(dataDir, 'config.json');
    const priorConfig = fs.readFileSync(configPath, 'utf8');
    const config = new WaggleConfig(dataDir);
    config.setProvider('openai-compatible', {
      apiKey: '',
      models: ['qwen3.8-flash-next', 'openai-compatible/qwen3.8-flash-next'],
      baseUrl: 'http://127.0.0.1:4000/v1',
    });
    config.save();
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/api/tags')) {
        return new Response(JSON.stringify({ models: [] }), { status: 200 });
      }
      if (url.endsWith('/models')) {
        return new Response(JSON.stringify({ data: [{ id: 'openrouter/unrelated-model' }] }), {
          status: 200,
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    });

    try {
      const res = await injectWithAuth(server, {
        method: 'GET',
        url: '/api/litellm/models',
      });

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).models).toEqual([
        'openrouter/unrelated-model',
        'openai-compatible/qwen3.8-flash-next',
      ]);
    } finally {
      fs.writeFileSync(configPath, priorConfig, 'utf8');
    }
  });

  it('GET /api/litellm/models prefers current Vault metadata over stale compatible config', async () => {
    const configPath = path.join(dataDir, 'config.json');
    const priorConfig = fs.readFileSync(configPath, 'utf8');
    const config = new WaggleConfig(dataDir);
    config.setProvider('openai-compatible', {
      apiKey: '',
      models: ['stale-qwen'],
      baseUrl: 'http://127.0.0.1:4777/v1',
    });
    config.save();
    server.vault!.set('openai-compatible', 'compatible-catalog-key', {
      models: ['vault-qwen', 'openai-compatible/vault-qwen'],
      baseUrl: 'http://127.0.0.1:4778/v1',
    });
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/api/tags')) {
        return new Response(JSON.stringify({ models: [] }), { status: 200 });
      }
      if (url.endsWith('/models')) return new Response('', { status: 503 });
      throw new Error(`unexpected fetch ${url}`);
    });

    try {
      const res = await injectWithAuth(server, {
        method: 'GET',
        url: '/api/litellm/models',
      });

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).models).toEqual(['openai-compatible/vault-qwen']);
    } finally {
      server.vault!.delete('openai-compatible');
      fs.writeFileSync(configPath, priorConfig, 'utf8');
    }
  });

  it('GET /api/litellm/models returns empty array on fetch failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Connection refused'));

    const res = await injectWithAuth(server, {
      method: 'GET',
      url: '/api/litellm/models',
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.models).toEqual([]);
  });

  it('GET /api/litellm/models returns empty array when LiteLLM returns non-ok response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 503,
    } as Response);

    const res = await injectWithAuth(server, {
      method: 'GET',
      url: '/api/litellm/models',
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.models).toEqual([]);
  });

  it('GET /api/litellm/models falls back to local Ollama chat models', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/models')) {
        return { ok: false, status: 503 } as Response;
      }
      if (url.endsWith('/api/tags')) {
        return {
          ok: true,
          json: async () => ({
            models: [
              { name: 'nomic-embed-text:latest', size: 262_000_000 },
              { name: 'llama3.2:latest', size: 2_000_000_000 },
            ],
          }),
        } as Response;
      }
      throw new Error(`unexpected fetch ${url}`);
    });

    const res = await injectWithAuth(server, {
      method: 'GET',
      url: '/api/litellm/models',
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.models).toEqual(['ollama/llama3.2:latest']);
  });

  it('GET /api/litellm/models bounds a stalled LiteLLM body and returns local fallbacks', async () => {
    const timeoutController = new AbortController();
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(timeoutController.signal);
    let modelsSignal: AbortSignal | null | undefined;
    let markBodyStarted: (() => void) | undefined;
    let releaseSlowBody: (() => void) | undefined;
    const bodyStarted = new Promise<void>((resolve) => {
      markBodyStarted = resolve;
    });
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/api/tags')) {
        return new Response(JSON.stringify({ models: [{ name: 'llama3.2:latest' }] }), {
          status: 200,
        });
      }
      if (url.endsWith('/models')) {
        modelsSignal = init?.signal;
        return {
          ok: true,
          json: () => new Promise((resolve, reject) => {
            markBodyStarted?.();
            modelsSignal?.addEventListener('abort', () => {
              reject(modelsSignal?.reason ?? new Error('request aborted'));
            }, { once: true });
            releaseSlowBody = () => {
              if (!modelsSignal) {
                resolve({ data: [{ id: 'router/responded-too-late' }] });
              }
            };
          }),
        } as Response;
      }
      throw new Error(`unexpected fetch ${url}`);
    });

    const response = injectWithAuth(server, {
      method: 'GET',
      url: '/api/litellm/models',
    });
    await bodyStarted;
    timeoutController.abort();
    releaseSlowBody?.();
    const res = await response;

    expect(timeoutSpy).toHaveBeenCalledWith(3_000);
    expect(modelsSignal).toBe(timeoutController.signal);
    expect(modelsSignal?.aborted).toBe(true);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).models).toEqual(['ollama/llama3.2:latest']);
  });

  it('local inference status separates remote aliases from installed models', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/api/tags')) {
        return new Response(JSON.stringify({
          models: [
            { name: 'minimax-m2.7:cloud', remote_host: 'https://ollama.com:443' },
            { name: 'gemma4:31b' },
          ],
        }), { status: 200 });
      }
      if (url.endsWith('/api/version')) {
        return new Response(JSON.stringify({ version: '0.12.0' }), { status: 200 });
      }
      return new Response('', { status: 503 });
    });

    const res = await injectWithAuth(server, { method: 'GET', url: '/api/local-inference/status' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.offlineReady).toBe(true);
    expect(body.setupRequired).toBe(false);
    expect(body.totalLocalModels).toBe(1);
    expect(body.primaryServer.models).toEqual(['gemma4:31b']);
    expect(body.primaryServer.cloudModels).toEqual(['minimax-m2.7:cloud']);
  });

  it('local inference status reports setup required for cloud-only Ollama', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/api/tags')) {
        return new Response(JSON.stringify({ models: [{ name: 'minimax-m2.7:cloud' }] }), {
          status: 200,
        });
      }
      if (url.endsWith('/api/version')) {
        return new Response(JSON.stringify({ version: '0.12.0' }), { status: 200 });
      }
      return new Response('', { status: 503 });
    });

    const res = await injectWithAuth(server, { method: 'GET', url: '/api/local-inference/status' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ollamaInstalled).toBe(true);
    expect(body.offlineReady).toBe(false);
    expect(body.setupRequired).toBe(true);
    expect(body.totalLocalModels).toBe(0);
    expect(body.primaryServer).toBeNull();
    expect(body.servers[0].cloudModels).toEqual(['minimax-m2.7:cloud']);
    expect(body.setupMessage).toMatch(/install|pull/i);
  });

  it('desktop startup stays degraded when Ollama exposes only a cloud alias', async () => {
    const soloDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-cloud-only-startup-'));
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/api/tags')) {
        return new Response(JSON.stringify({
          models: [{
            name: 'minimax-m2.7:cloud',
            remote_host: 'https://ollama.com:443',
          }],
        }), { status: 200 });
      }
      return new Response('', { status: 503 });
    });

    const { server: soloServer } = await startService({
      dataDir: soloDir,
      port: 0,
      litellmPort: 49_999,
      skipLiteLLM: true,
    });
    try {
      const body = (await soloServer.inject({ method: 'GET', url: '/health' })).json();
      expect(body.status).toBe('degraded');
      expect(body.llm).toMatchObject({ provider: 'anthropic-proxy', health: 'degraded' });
      expect(soloServer.agentState.llmProvider.detail).toContain('no API key');
      expect(soloServer.agentState.currentModel).not.toBe('ollama/minimax-m2.7:cloud');
    } finally {
      await soloServer.close();
      fs.rmSync(soloDir, { recursive: true, force: true });
    }
  });

  it('GET /api/agent/model resolves a cloud default to a local chat model when no provider key exists', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/api/tags')) {
        return {
          ok: true,
          json: async () => ({
            models: [
              { name: 'nomic-embed-text:latest', size: 262_000_000 },
              { name: 'llama3.2:latest', size: 2_000_000_000 },
            ],
          }),
        } as Response;
      }
      return { ok: false, status: 503 } as Response;
    });
    await injectWithAuth(server, {
      method: 'PUT',
      url: '/api/agent/model',
      payload: { model: 'claude-sonnet-4-6' },
    });

    const res = await injectWithAuth(server, {
      method: 'GET',
      url: '/api/agent/model',
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.model).toBe('ollama/llama3.2:latest');
  });

  it('prefers a deterministic credentialed cloud fallback over an unrelated host Ollama model', async () => {
    const runtimePath = path.join(dataDir, 'litellm.runtime.json');
    const priorRuntime = fs.existsSync(runtimePath) ? fs.readFileSync(runtimePath, 'utf-8') : null;
    const priorCurrentModel = server.agentState.currentModel;
    server.agentState.currentModel = 'claude-sonnet-4-6';
    server.vault.set('google', 'google-cloud-fallback-test-key');
    server.vault.set('openrouter', 'openrouter-cloud-fallback-test-key');
    fs.writeFileSync(runtimePath, JSON.stringify({
      model_list: [
        { model_name: 'google/gemini-2.5-flash' },
        { model_name: 'openrouter/openai/gpt-5.3-codex' },
      ],
    }), 'utf-8');

    const discoveredProviders: string[] = [];
    let ollamaRequests = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.startsWith('https://generativelanguage.googleapis.com/')) {
        discoveredProviders.push('google');
        return new Response(JSON.stringify({
          models: [
            { name: 'models/text-embedding-004' },
            { name: 'models/gemini-2.5-flash' },
          ],
        }), { status: 200 });
      }
      if (url.startsWith('https://openrouter.ai/')) {
        discoveredProviders.push('openrouter');
        return new Response(JSON.stringify({
          data: [{ id: 'openai/gpt-5.3-codex' }],
        }), { status: 200 });
      }
      if (url.endsWith('/api/tags')) {
        ollamaRequests += 1;
        return new Response(JSON.stringify({
          models: [{ name: 'minicpm5-fable:1b' }],
        }), { status: 200 });
      }
      return new Response('', { status: 503 });
    });

    try {
      await expect(resolveUsableModel(server, 'claude-sonnet-4-6'))
        .resolves.toBe('google/gemini-2.5-flash');
      expect(discoveredProviders.sort()).toEqual(['google', 'openrouter']);
      expect(ollamaRequests).toBe(0);
    } finally {
      server.agentState.currentModel = priorCurrentModel;
      if (priorRuntime === null) fs.rmSync(runtimePath, { force: true });
      else fs.writeFileSync(runtimePath, priorRuntime, 'utf-8');
    }
  });

  it('quality-ranks an OpenRouter fallback instead of selecting the first catalog item', async () => {
    const priorCurrentModel = server.agentState.currentModel;
    const priorProvider = { ...server.agentState.llmProvider };
    server.agentState.currentModel = 'claude-sonnet-4-6';
    server.agentState.llmProvider = {
      provider: 'anthropic-proxy',
      health: 'degraded',
      detail: 'Built-in provider proxy (verification pending)',
      checkedAt: new Date().toISOString(),
    };
    server.vault.set('openrouter', 'openrouter-quality-fallback-test-key');

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.startsWith('https://openrouter.ai/')) {
        return new Response(JSON.stringify({
          data: [
            { id: 'thinkingmachines/inkling' },
            { id: 'anthropic/claude-sonnet-5' },
            { id: 'openai/gpt-5.6-sol' },
          ],
        }), { status: 200 });
      }
      if (url.endsWith('/api/tags')) {
        return new Response(JSON.stringify({ models: [] }), { status: 200 });
      }
      return new Response('', { status: 503 });
    });

    try {
      await expect(resolveUsableModel(server, 'claude-sonnet-4-6'))
        .resolves.toBe('openrouter/anthropic/claude-sonnet-5');
    } finally {
      server.agentState.currentModel = priorCurrentModel;
      server.agentState.llmProvider = priorProvider;
    }
  });

  it('routes a preferred Claude alias through the built-in OpenRouter proxy without catalog discovery', async () => {
    const priorCurrentModel = server.agentState.currentModel;
    const priorProvider = { ...server.agentState.llmProvider };
    server.agentState.currentModel = 'claude-sonnet-4-6';
    server.agentState.llmProvider = {
      provider: 'anthropic-proxy',
      health: 'degraded',
      detail: 'Built-in provider proxy (verification pending)',
      checkedAt: new Date().toISOString(),
    };
    server.vault.set('openrouter', 'openrouter-direct-fallback-test-key');
    let catalogRequests = 0;

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.startsWith('https://')) catalogRequests += 1;
      if (url.endsWith('/api/tags')) {
        return new Response(JSON.stringify({ models: [{ name: 'minicpm5-fable:1b' }] }), { status: 200 });
      }
      return new Response('', { status: 503 });
    });

    try {
      await expect(resolveUsableModel(server, 'claude-sonnet-4-6'))
        .resolves.toBe('openrouter/anthropic/claude-sonnet-5');
      expect(catalogRequests).toBe(0);
    } finally {
      server.agentState.currentModel = priorCurrentModel;
      server.agentState.llmProvider = priorProvider;
    }
  });

  it('keeps an explicit built-in proxy model exact when managed LiteLLM catalog state is stale', async () => {
    const requestedModel = 'openrouter/openai/gpt-5.3-codex';
    const fallbackModel = 'google/gemini-2.5-flash';
    const runtimePath = path.join(dataDir, 'litellm.runtime.json');
    const priorRuntime = fs.existsSync(runtimePath) ? fs.readFileSync(runtimePath, 'utf-8') : null;
    const priorCurrentModel = server.agentState.currentModel;
    const priorProvider = { ...server.agentState.llmProvider };
    server.agentState.currentModel = fallbackModel;
    server.agentState.llmProvider = {
      provider: 'anthropic-proxy',
      health: 'degraded',
      detail: 'Built-in provider proxy (verification pending)',
      checkedAt: new Date().toISOString(),
    };
    server.vault.set('google', 'google-model-lock-test-key');
    server.vault.set('openrouter', 'openrouter-model-lock-test-key');
    fs.writeFileSync(runtimePath, JSON.stringify({
      model_list: [{ model_name: fallbackModel }],
    }), 'utf-8');

    const probedModels: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes('/v1/chat/completions')) {
        const body = JSON.parse(String(init?.body)) as { model: string };
        probedModels.push(body.model);
        return new Response(JSON.stringify({
          choices: [{
            message: { role: 'assistant', content: 'probe ok' },
            finish_reason: 'stop',
          }],
          usage: { prompt_tokens: 1, completion_tokens: 1 },
        }), { status: 200 });
      }
      if (url.startsWith('https://generativelanguage.googleapis.com/')) {
        return new Response(JSON.stringify({
          models: [{ name: 'models/gemini-2.5-flash' }],
        }), { status: 200 });
      }
      if (url.startsWith('https://openrouter.ai/')) {
        return new Response('', { status: 503 });
      }
      if (url.endsWith('/api/tags')) {
        return new Response(JSON.stringify({ models: [] }), { status: 200 });
      }
      return new Response('', { status: 503 });
    });

    try {
      await expect(resolveUsableModel(server, requestedModel)).resolves.toBe(requestedModel);
      await expect(resolveExplicitRoutableModel(server, requestedModel)).resolves.toBe(requestedModel);

      const response = await injectWithAuth(server, {
        method: 'POST',
        url: '/api/settings/probe-model',
        payload: { model: requestedModel },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        model: requestedModel,
        configured: true,
        verified: true,
      });
      expect(probedModels).toEqual([requestedModel]);
    } finally {
      server.agentState.currentModel = priorCurrentModel;
      server.agentState.llmProvider = priorProvider;
      if (priorRuntime === null) fs.rmSync(runtimePath, { force: true });
      else fs.writeFileSync(runtimePath, priorRuntime, 'utf-8');
    }
  });

  it('keeps an explicit keyless OpenAI-compatible model exact when another provider is available', async () => {
    const requestedModel = 'openai-compatible/acme/local-qwen:Q4_K_M';
    const configPath = path.join(dataDir, 'config.json');
    const priorConfig = fs.readFileSync(configPath, 'utf8');
    const priorCurrentModel = server.agentState.currentModel;
    const priorProvider = { ...server.agentState.llmProvider };
    server.agentState.currentModel = 'google/gemini-2.5-flash';
    server.agentState.llmProvider = {
      provider: 'anthropic-proxy',
      health: 'healthy',
      detail: 'Built-in provider proxy',
      checkedAt: new Date().toISOString(),
    };
    server.vault.set('google', 'google-fallback-key');
    fs.writeFileSync(configPath, JSON.stringify({
      defaultModel: requestedModel,
      providers: {
        'openai-compatible': {
          apiKey: '',
          models: ['acme/local-qwen:Q4_K_M'],
          baseUrl: 'http://127.0.0.1:4000/v1',
        },
      },
    }), 'utf8');

    try {
      await expect(resolveUsableModel(server, requestedModel)).resolves.toBe(requestedModel);
      await expect(resolveExplicitRoutableModel(server, requestedModel)).resolves.toBe(requestedModel);
    } finally {
      fs.writeFileSync(configPath, priorConfig, 'utf8');
      server.vault.delete('google');
      server.agentState.currentModel = priorCurrentModel;
      server.agentState.llmProvider = priorProvider;
    }
  });

  it('never exposes or selects a remote Ollama cloud alias as a local model', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/api/tags')) {
        return {
          ok: true,
          json: async () => ({
            models: [
              { name: 'nomic-embed-text:latest' },
              { name: 'minimax-m2.7:cloud', remote_host: 'https://ollama.com:443' },
              { name: 'gemma4:31b' },
            ],
          }),
        } as Response;
      }
      return { ok: false, status: 503 } as Response;
    });

    await expect(listOllamaChatModelIds()).resolves.toEqual(['ollama/gemma4:31b']);
    const selected = await injectWithAuth(server, {
      method: 'PUT',
      url: '/api/agent/model',
      payload: { model: 'ollama/minimax-m2.7:cloud' },
    });

    expect(selected.statusCode).toBe(409);
    expect(selected.json()).toMatchObject({ code: 'OLLAMA_MODEL_NOT_LOCAL' });
    await expect(resolveUsableModel(server, 'ollama/minimax-m2.7:cloud'))
      .rejects.toMatchObject({ code: 'OLLAMA_MODEL_NOT_LOCAL', statusCode: 409 });
  });

  it('rejects an exact Ollama tag that is not installed instead of choosing another tag', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      if (String(input).endsWith('/api/tags')) {
        return {
          ok: true,
          json: async () => ({ models: [{ name: 'gemma4:31b' }] }),
        } as Response;
      }
      return { ok: false, status: 503 } as Response;
    });

    await expect(resolveUsableModel(server, 'ollama/llama3.2:latest'))
      .rejects.toMatchObject({ code: 'OLLAMA_MODEL_NOT_LOCAL', statusCode: 409 });
  });
});
