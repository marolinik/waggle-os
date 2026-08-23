import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VaultStore } from '@waggle/core';
import {
  buildLiteLLMRuntimeConfig,
  ensureManagedLiteLLMModel,
  prepareLiteLLMRuntimeConfig,
  refreshManagedLiteLLM,
} from '../../src/local/litellm-runtime-config.js';
import { clearProviderModelCache, type DiscoveredProviderModel } from '../../src/local/provider-model-catalog.js';
import { startLiteLLM, stopLiteLLM } from '../../src/local/lifecycle.js';
import { PROVIDER_ENV_NAMES } from '../../src/local/provider-env.js';
import type { FastifyInstance } from 'fastify';

vi.mock('../../src/local/lifecycle.js', () => ({
  startLiteLLM: vi.fn(async (port: number) => ({ status: 'started', port })),
  stopLiteLLM: vi.fn(async () => undefined),
}));

const tempDirs: string[] = [];
const originalProviderEnv = new Map<string, string | undefined>();

function model(id: string): DiscoveredProviderModel {
  return { id, name: id, cost: '$$', speed: 'medium', source: 'provider-api' };
}

beforeEach(() => {
  clearProviderModelCache();
  vi.clearAllMocks();
  for (const envName of new Set(Object.values(PROVIDER_ENV_NAMES).flat())) {
    originalProviderEnv.set(envName, process.env[envName]);
    delete process.env[envName];
  }
});
afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
  for (const [envName, value] of originalProviderEnv) {
    if (value === undefined) delete process.env[envName];
    else process.env[envName] = value;
  }
  originalProviderEnv.clear();
});

describe('dynamic LiteLLM runtime config', () => {
  it('routes provider-discovered ids without maintaining a model inventory', () => {
    const config = buildLiteLLMRuntimeConfig(new Map([
      ['google', [model('google/gemini-model-released-tomorrow')]],
      ['alibaba', [model('alibaba/qwen-model-released-tomorrow')]],
    ]));

    expect(config.model_list).toEqual([
      {
        model_name: 'google/gemini-model-released-tomorrow',
        litellm_params: {
          model: 'gemini/gemini-model-released-tomorrow',
          api_key: 'os.environ/GEMINI_API_KEY',
        },
      },
      {
        model_name: 'alibaba/qwen-model-released-tomorrow',
        litellm_params: {
          model: 'openai/qwen-model-released-tomorrow',
          api_key: 'os.environ/DASHSCOPE_API_KEY',
          api_base: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
        },
      },
    ]);
  });

  it('writes every model returned by the provider and never writes the API secret', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-litellm-config-'));
    tempDirs.push(dataDir);
    const vault = new VaultStore(dataDir);
    vault.set('openai', 'super-secret-provider-key');
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
      data: [
        { id: 'existing-model' },
        { id: 'brand-new-unseen-model' },
      ],
    }), { status: 200 }));

    const result = await prepareLiteLLMRuntimeConfig(dataDir, vault, { fetchImpl });

    expect(result.modelIds).toEqual([
      'openai/existing-model',
      'openai/brand-new-unseen-model',
    ]);
    expect(result.configPath).toBe(path.join(dataDir, 'litellm.runtime.json'));
    const raw = fs.readFileSync(result.configPath!, 'utf8');
    expect(raw).toContain('openai/brand-new-unseen-model');
    expect(raw).toContain('os.environ/OPENAI_API_KEY');
    expect(raw).not.toContain('super-secret-provider-key');
  });

  it('discovers with a working Google alias when the first Gemini alias is stale', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-litellm-google-alias-'));
    tempDirs.push(dataDir);
    const vault = new VaultStore(dataDir);
    process.env.GEMINI_API_KEY = 'stale-gemini-key';
    process.env.GOOGLE_API_KEY = 'working-google-key';
    const fetchImpl = vi.fn<typeof fetch>(async (_url, init) => {
      const key = (init?.headers as Record<string, string>)['x-goog-api-key'];
      if (key === 'stale-gemini-key') {
        return new Response(JSON.stringify({ error: 'invalid key' }), { status: 400 });
      }
      return new Response(JSON.stringify({
        models: [{ name: 'models/gemini-2.5-flash' }],
      }), { status: 200 });
    });

    const result = await prepareLiteLLMRuntimeConfig(dataDir, vault, { fetchImpl });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(result.modelIds).toEqual(['google/gemini-2.5-flash']);
    expect(process.env.GEMINI_API_KEY).toBe('working-google-key');
    expect(process.env.GOOGLE_API_KEY).toBe('working-google-key');
  });

  it('restarts the managed router with a newly discovered model and switches runtime routing', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-litellm-refresh-'));
    tempDirs.push(dataDir);
    const vault = new VaultStore(dataDir);
    vault.set('openai', 'runtime-refresh-key');
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
      data: [{ id: 'model-that-did-not-exist-at-build-time' }],
    }), { status: 200 }));
    const server = {
      localConfig: {
        dataDir,
        port: 3333,
        host: '127.0.0.1',
        litellmUrl: 'http://127.0.0.1:3333/v1',
        manageLiteLLM: true,
        managedLiteLLMPort: 4567,
      },
      vault,
      agentState: {
        litellmApiKey: 'fallback-key',
        llmProvider: {
          provider: 'anthropic-proxy',
          health: 'degraded',
          detail: 'fallback',
          checkedAt: new Date(0).toISOString(),
        },
      },
    } as unknown as FastifyInstance;

    try {
      const result = await refreshManagedLiteLLM(server);

      expect(result).toMatchObject({
        managed: true,
        ready: true,
        port: 4567,
        models: ['openai/model-that-did-not-exist-at-build-time'],
      });
      expect(stopLiteLLM).toHaveBeenCalled();
      expect(startLiteLLM).toHaveBeenCalledWith(4567, path.join(dataDir, 'litellm.runtime.json'));
      expect(server.localConfig.litellmUrl).toBe('http://localhost:4567');
      expect(server.agentState.llmProvider.provider).toBe('litellm');
      expect(server.agentState.llmProvider.health).toBe('healthy');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('hot-loads a model released after startup and does not restart for an existing model', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-litellm-hot-model-'));
    tempDirs.push(dataDir);
    const vault = new VaultStore(dataDir);
    vault.set('openai', 'hot-model-key');
    let released = false;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
      data: [
        { id: 'existing-model' },
        ...(released ? [{ id: 'model-released-while-waggle-is-open' }] : []),
      ],
    }), { status: 200 }));
    const server = {
      localConfig: {
        dataDir,
        port: 3333,
        host: '127.0.0.1',
        litellmUrl: 'http://localhost:4567',
        manageLiteLLM: true,
        managedLiteLLMPort: 4567,
      },
      vault,
      agentState: {
        litellmApiKey: 'router-key',
        llmProvider: {
          provider: 'litellm',
          health: 'healthy',
          detail: 'ready',
          checkedAt: new Date().toISOString(),
        },
      },
    } as unknown as FastifyInstance;

    try {
      await prepareLiteLLMRuntimeConfig(dataDir, vault);
      expect(await ensureManagedLiteLLMModel(server, 'openai/existing-model')).toBe(true);
      expect(stopLiteLLM).not.toHaveBeenCalled();
      expect(startLiteLLM).not.toHaveBeenCalled();

      released = true;
      expect(await ensureManagedLiteLLMModel(
        server,
        'openai/model-released-while-waggle-is-open',
      )).toBe(true);
      expect(stopLiteLLM).toHaveBeenCalledTimes(1);
      expect(startLiteLLM).toHaveBeenCalledWith(4567, path.join(dataDir, 'litellm.runtime.json'));
      expect(fs.readFileSync(path.join(dataDir, 'litellm.runtime.json'), 'utf8'))
        .toContain('openai/model-released-while-waggle-is-open');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
