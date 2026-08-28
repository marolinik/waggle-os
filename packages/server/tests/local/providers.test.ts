/**
 * Provider API Tests — GET /api/providers
 *
 * Tests the single source of truth endpoint for LLM providers,
 * models, and search tools with vault key status.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import type { AddressInfo } from 'node:net';
import { MindDB, SessionStore, FrameStore } from '@waggle/core';
import { buildLocalServer } from '../../src/local/index.js';
import type { FastifyInstance } from 'fastify';
import { injectWithAuth } from '../test-utils.js';
import { PROVIDER_ENV_NAMES } from '../../src/local/provider-env.js';

/** Shape of a model entry in the GET /api/providers response (test-asserted fields). */
interface ProviderModelResponse {
  id: string;
  name: string;
  cost: string;
  speed: string;
  source?: string;
}

/** Shape of a provider entry in the GET /api/providers response (test-asserted fields). */
interface ProviderResponse {
  id: string;
  name: string;
  hasKey: boolean;
  requiresKey: boolean;
  badge: string | null;
  models: ProviderModelResponse[];
  modelsSource?: string;
  baseUrl?: string;
}

function mockProviderCatalogFetch() {
  const realFetch = globalThis.fetch;
  return vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const url = String(input);
    if (url.includes('/api/tags')) return realFetch(input, init);
    if (url.includes('/models')) {
      return Promise.resolve(new Response(JSON.stringify({
        data: [{ id: 'provider-model-added-at-runtime', name: 'Provider Model Added At Runtime' }],
      }), { status: 200, headers: { 'content-type': 'application/json' } }));
    }
    return realFetch(input, init);
  });
}

/** Shape of a search-provider entry in the GET /api/providers response (test-asserted fields). */
interface SearchProviderResponse {
  id: string;
  hasKey: boolean;
  requiresKey: boolean;
  priority: number;
}

describe('Provider API', () => {
  let server: FastifyInstance;
  let tmpDir: string;
  let prevOllamaHost: string | undefined;
  const originalProviderEnv = new Map<string, string | undefined>();

  beforeAll(async () => {
    for (const envName of new Set(Object.values(PROVIDER_ENV_NAMES).flat())) {
      originalProviderEnv.set(envName, process.env[envName]);
      delete process.env[envName];
    }
    // Pin Ollama to a dead port so reachability is deterministic everywhere:
    // Windows dev boxes often run a local daemon (:11434 → reachable), CI does
    // not. The route reports hasKey = live reachability for ollama.
    prevOllamaHost = process.env.OLLAMA_HOST;
    process.env.OLLAMA_HOST = 'http://127.0.0.1:1';
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-providers-'));
    const personalPath = path.join(tmpDir, 'personal.mind');
    const mind = new MindDB(personalPath);
    const sessions = new SessionStore(mind);
    const frames = new FrameStore(mind);
    const s1 = sessions.create('providers-test');
    frames.createIFrame(s1.gop_id, 'Provider test', 'normal');
    mind.close();
    server = await buildLocalServer({ dataDir: tmpDir });
  });

  afterAll(async () => {
    await server.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
    if (prevOllamaHost === undefined) delete process.env.OLLAMA_HOST;
    else process.env.OLLAMA_HOST = prevOllamaHost;
    for (const [envName, value] of originalProviderEnv) {
      if (value === undefined) delete process.env[envName];
      else process.env[envName] = value;
    }
  });

  describe('GET /api/providers', () => {
    it('returns providers array', async () => {
      const res = await injectWithAuth(server, { method: 'GET', url: '/api/providers' });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.providers).toBeDefined();
      expect(Array.isArray(body.providers)).toBe(true);
      expect(body.providers.length).toBeGreaterThanOrEqual(10);
    });

    it('each provider has required fields', async () => {
      const res = await injectWithAuth(server, { method: 'GET', url: '/api/providers' });
      const { providers } = res.json();

      for (const p of providers) {
        expect(p.id).toBeDefined();
        expect(p.name).toBeDefined();
        expect(typeof p.hasKey).toBe('boolean');
        expect(typeof p.requiresKey).toBe('boolean');
        expect(Array.isArray(p.models)).toBe(true);
      }
    });

    it('includes all expected providers', async () => {
      const res = await injectWithAuth(server, { method: 'GET', url: '/api/providers' });
      const { providers } = res.json();
      const ids = providers.map((p: ProviderResponse) => p.id);

      expect(ids).toContain('anthropic');
      expect(ids).toContain('openai');
      expect(ids).toContain('openai-compatible');
      expect(ids).toContain('google');
      expect(ids).toContain('deepseek');
      expect(ids).toContain('xai');
      expect(ids).toContain('mistral');
      expect(ids).toContain('alibaba');
      expect(ids).toContain('minimax');
      expect(ids).toContain('zhipu');
      expect(ids).toContain('moonshot');
      expect(ids).toContain('perplexity');
      expect(ids).toContain('openrouter');
      expect(ids).toContain('ollama');
    });

    it('ollama does not require a key', async () => {
      const res = await injectWithAuth(server, { method: 'GET', url: '/api/providers' });
      const { providers } = res.json();
      const ollama = providers.find((p: ProviderResponse) => p.id === 'ollama');
      expect(ollama.requiresKey).toBe(false);
      // hasKey mirrors live daemon reachability for ollama; pinned to a dead
      // port in beforeAll → deterministically false on every platform/CI.
      expect(ollama.hasKey).toBe(false);
    });

    it('providers without vault keys show hasKey=false', async () => {
      const res = await injectWithAuth(server, { method: 'GET', url: '/api/providers' });
      const { providers } = res.json();
      // Fresh vault — no keys configured
      const openai = providers.find((p: ProviderResponse) => p.id === 'openai');
      expect(openai.hasKey).toBe(false);
    });

    it('providers with vault keys show hasKey=true', async () => {
      // Add a key to vault
      server.vault!.set('anthropic', 'sk-ant-test-key');
      const fetchSpy = mockProviderCatalogFetch();

      try {
        const res = await injectWithAuth(server, { method: 'GET', url: '/api/providers' });
        const { providers } = res.json();
        const anthropic = providers.find((p: ProviderResponse) => p.id === 'anthropic');
        expect(anthropic.hasKey).toBe(true);
      } finally {
        fetchSpy.mockRestore();
        server.vault!.delete('anthropic');
      }
    });

    it('environment-configured providers expose the same live catalog as Vault keys', async () => {
      process.env.OPENAI_API_KEY = 'openai-env-catalog-key';
      const fetchSpy = mockProviderCatalogFetch();

      try {
        const res = await injectWithAuth(server, { method: 'GET', url: '/api/providers' });
        const { providers } = res.json();
        const openai = providers.find((provider: ProviderResponse) => provider.id === 'openai');

        expect(openai.hasKey).toBe(true);
        expect(openai.modelsSource).toBe('provider-api');
        expect(openai.models.map((model) => model.id)).toContain('openai/provider-model-added-at-runtime');
      } finally {
        fetchSpy.mockRestore();
        delete process.env.OPENAI_API_KEY;
      }
    });

    it('returns live provider models with id, name, cost, and speed metadata', async () => {
      server.vault!.set('anthropic', 'sk-ant-catalog-test-key');
      const fetchSpy = mockProviderCatalogFetch();

      try {
      const res = await injectWithAuth(server, { method: 'GET', url: '/api/providers' });
      const { providers } = res.json();
      const anthropic = providers.find((p: ProviderResponse) => p.id === 'anthropic');

      expect(anthropic.modelsSource).toBe('provider-api');
      expect(anthropic.models.length).toBeGreaterThan(0);
      expect(anthropic.models.map((model) => model.id)).toContain('anthropic/provider-model-added-at-runtime');
      for (const m of anthropic.models) {
        expect(m.id).toBeDefined();
        expect(m.name).toBeDefined();
        expect(['$', '$$', '$$$']).toContain(m.cost);
        expect(['fast', 'medium', 'slow']).toContain(m.speed);
      }
      } finally {
        fetchSpy.mockRestore();
        server.vault!.delete('anthropic');
      }
    });

    it('does not require a code change when an Alibaba model appears in its API catalog', async () => {
      server.vault!.set('alibaba', 'alibaba-catalog-test-key');
      const fetchSpy = mockProviderCatalogFetch();

      try {
        const res = await injectWithAuth(server, { method: 'GET', url: '/api/providers' });
        const { providers } = res.json();
        const alibaba = providers.find((p: ProviderResponse) => p.id === 'alibaba');

        expect(alibaba.modelsSource).toBe('provider-api');
        expect(alibaba.models.map((model) => model.id)).toContain('alibaba/provider-model-added-at-runtime');
      } finally {
        fetchSpy.mockRestore();
        server.vault!.delete('alibaba');
      }
    });

    it('returns search providers with priority', async () => {
      const res = await injectWithAuth(server, { method: 'GET', url: '/api/providers' });
      const { search, activeSearch } = res.json();

      expect(Array.isArray(search)).toBe(true);
      expect(search.length).toBeGreaterThanOrEqual(4);

      const ids = search.map((s: SearchProviderResponse) => s.id);
      expect(ids).toContain('perplexity');
      expect(ids).toContain('tavily');
      expect(ids).toContain('brave');
      expect(ids).toContain('duckduckgo');

      // DuckDuckGo should always have hasKey=true (free)
      const ddg = search.find((s: SearchProviderResponse) => s.id === 'duckduckgo');
      expect(ddg.hasKey).toBe(true);
      expect(ddg.requiresKey).toBe(false);

      // activeSearch should be defined
      expect(activeSearch).toBeDefined();
    });

    it('activeSearch reflects vault key status', async () => {
      // No premium keys → DuckDuckGo should be active
      let res = await injectWithAuth(server, { method: 'GET', url: '/api/providers' });
      expect(res.json().activeSearch).toBe('duckduckgo');

      // Add Tavily key → Tavily should be active
      server.vault!.set('TAVILY_API_KEY', 'tvly-test');
      res = await injectWithAuth(server, { method: 'GET', url: '/api/providers' });
      expect(res.json().activeSearch).toBe('tavily');

      // Add Perplexity key → Perplexity should be active (higher priority)
      server.vault!.set('perplexity', 'pplx-test');
      res = await injectWithAuth(server, { method: 'GET', url: '/api/providers' });
      expect(res.json().activeSearch).toBe('perplexity');

      // Cleanup
      server.vault!.delete('TAVILY_API_KEY');
      server.vault!.delete('perplexity');
    });

    it('search priorities are in correct order', async () => {
      const res = await injectWithAuth(server, { method: 'GET', url: '/api/providers' });
      const { search } = res.json();

      const sorted = [...search].sort((a: SearchProviderResponse, b: SearchProviderResponse) => a.priority - b.priority);
      expect(sorted[0].id).toBe('perplexity');
      expect(sorted[1].id).toBe('tavily');
      expect(sorted[2].id).toBe('brave');
      expect(sorted[3].id).toBe('duckduckgo');
    });

    it('perplexity has badge "Search + LLM"', async () => {
      const res = await injectWithAuth(server, { method: 'GET', url: '/api/providers' });
      const { providers } = res.json();
      const perplexity = providers.find((p: ProviderResponse) => p.id === 'perplexity');
      expect(perplexity.badge).toBe('Search + LLM');
    });

    it('openrouter identifies its live provider catalog', async () => {
      const res = await injectWithAuth(server, { method: 'GET', url: '/api/providers' });
      const { providers } = res.json();
      const openrouter = providers.find((p: ProviderResponse) => p.id === 'openrouter');
      expect(openrouter.badge).toBe('Provider catalog');
    });

    it('persists a normalized keyless OpenAI-compatible endpoint and retains it on key-only updates', async () => {
      const authorizationHeaders: Array<string | undefined> = [];
      const catalogServer = http.createServer((request, response) => {
        authorizationHeaders.push(request.headers.authorization);
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ data: [{ id: 'local-qwen', name: 'Local Qwen' }] }));
      });
      await new Promise<void>((resolve) => catalogServer.listen(0, '127.0.0.1', resolve));
      const { port } = catalogServer.address() as AddressInfo;
      const normalizedBaseUrl = `http://127.0.0.1:${port}/v1`;

      try {
        const configured = await injectWithAuth(server, {
          method: 'PUT',
          url: '/api/settings',
          payload: {
            providers: {
              'openai-compatible': { baseUrl: `  ${normalizedBaseUrl}///  ` },
            },
          },
        });
        expect(configured.statusCode).toBe(200);
        expect(configured.json().providers['openai-compatible']).toMatchObject({
          apiKey: '****',
          baseUrl: normalizedBaseUrl,
        });

        const discovered = await injectWithAuth(server, { method: 'GET', url: '/api/providers' });
        const compatible = discovered.json().providers.find(
          (provider: ProviderResponse) => provider.id === 'openai-compatible',
        );
        expect(compatible).toMatchObject({
          requiresKey: false,
          hasKey: false,
          baseUrl: normalizedBaseUrl,
          modelsSource: 'provider-api',
        });
        expect(compatible.models).toContainEqual(expect.objectContaining({
          id: 'openai-compatible/local-qwen',
          name: 'Local Qwen',
        }));
        expect(authorizationHeaders).toEqual([undefined]);

        const keyOnlyUpdate = await injectWithAuth(server, {
          method: 'PUT',
          url: '/api/settings',
          payload: {
            providers: {
              'openai-compatible': { apiKey: 'optional-local-secret' },
            },
          },
        });
        expect(keyOnlyUpdate.statusCode).toBe(200);
        expect(keyOnlyUpdate.json().providers['openai-compatible'].baseUrl).toBe(normalizedBaseUrl);

        const persisted = JSON.parse(fs.readFileSync(path.join(tmpDir, 'config.json'), 'utf8')) as {
          providers?: Record<string, { baseUrl?: string }>;
        };
        expect(persisted.providers?.['openai-compatible']?.baseUrl).toBe(normalizedBaseUrl);
        expect(server.vault?.get('openai-compatible')?.metadata?.baseUrl).toBe(normalizedBaseUrl);
      } finally {
        await new Promise<void>((resolve, reject) => catalogServer.close((error) => error ? reject(error) : resolve()));
        server.vault?.delete('openai-compatible');
        const configPath = path.join(tmpDir, 'config.json');
        const persisted = JSON.parse(fs.readFileSync(configPath, 'utf8')) as {
          providers?: Record<string, unknown>;
        };
        delete persisted.providers?.['openai-compatible'];
        fs.writeFileSync(configPath, JSON.stringify(persisted, null, 2), 'utf8');
      }
    });

    it('rejects non-http OpenAI-compatible endpoint URLs', async () => {
      const res = await injectWithAuth(server, {
        method: 'PUT',
        url: '/api/settings',
        payload: {
          providers: {
            'openai-compatible': { baseUrl: 'file:///C:/secrets' },
          },
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error).toMatch(/http/i);
    });

    it('discovers and verifies a keyless compatible model without persisting the candidate endpoint', async () => {
      const requests: Array<{ url: string; authorization?: string; body?: unknown }> = [];
      const candidateServer = http.createServer((request, response) => {
        const chunks: Buffer[] = [];
        request.on('data', (chunk: Buffer) => chunks.push(chunk));
        request.on('end', () => {
          const rawBody = Buffer.concat(chunks).toString('utf8');
          requests.push({
            url: request.url ?? '',
            authorization: request.headers.authorization,
            ...(rawBody ? { body: JSON.parse(rawBody) } : {}),
          });
          response.writeHead(200, { 'content-type': 'application/json' });
          if (request.url?.endsWith('/models')) {
            response.end(JSON.stringify({ data: [
              { id: 'qwen3.8-flash-next', name: 'Qwen 3.8 Flash Next' },
              { id: 'silent-model', name: 'Silent model' },
            ] }));
            return;
          }
          const model = (JSON.parse(rawBody) as { model?: string }).model;
          response.end(JSON.stringify({
            choices: [{ message: { role: 'assistant', content: model === 'silent-model' ? '' : 'WAGGLE_OK' } }],
          }));
        });
      });
      await new Promise<void>((resolve) => candidateServer.listen(0, '127.0.0.1', resolve));
      const { port } = candidateServer.address() as AddressInfo;
      const baseUrl = `http://127.0.0.1:${port}/v1`;
      const configPath = path.join(tmpDir, 'config.json');
      const configBefore = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf8') : null;
      const nativeFetch = globalThis.fetch;
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => nativeFetch(input, init));

      try {
        const discovery = await injectWithAuth(server, {
          method: 'POST',
          url: '/api/settings/test-compatible',
          payload: { baseUrl: ` ${baseUrl}/// ` },
        });
        expect(discovery.statusCode).toBe(200);
        expect(discovery.json()).toMatchObject({
          valid: true,
          verified: false,
          baseUrl,
          modelsSource: 'provider-api',
        });
        expect(discovery.json().models).toContainEqual(expect.objectContaining({
          id: 'openai-compatible/qwen3.8-flash-next',
          name: 'Qwen 3.8 Flash Next',
        }));

        const verification = await injectWithAuth(server, {
          method: 'POST',
          url: '/api/settings/test-compatible',
          payload: {
            baseUrl,
            model: 'openai-compatible/qwen3.8-flash-next',
          },
        });
        expect(verification.statusCode).toBe(200);
        expect(verification.json()).toMatchObject({
          valid: true,
          verified: true,
          model: 'openai-compatible/qwen3.8-flash-next',
        });

        const emptyCompletion = await injectWithAuth(server, {
          method: 'POST',
          url: '/api/settings/test-compatible',
          payload: {
            baseUrl,
            model: 'openai-compatible/silent-model',
          },
        });
        expect(emptyCompletion.json()).toMatchObject({
          valid: false,
          verified: false,
          model: 'openai-compatible/silent-model',
          error: expect.stringMatching(/no assistant response/i),
        });

        const keyedVerification = await injectWithAuth(server, {
          method: 'POST',
          url: '/api/settings/test-compatible',
          payload: {
            baseUrl,
            apiKey: 'private-local-key',
            model: 'openai-compatible/qwen3.8-flash-next',
          },
        });
        expect(keyedVerification.json()).toMatchObject({ valid: true, verified: true });
        expect(keyedVerification.body).not.toContain('private-local-key');

        expect(requests.filter((request) => request.url === '/v1/models')).toHaveLength(4);
        expect(requests.slice(0, 5).every((request) => request.authorization === undefined)).toBe(true);
        expect(requests.slice(5).every((request) => request.authorization === 'Bearer private-local-key')).toBe(true);
        const candidateFetches = fetchSpy.mock.calls.filter(([input]) => String(input).startsWith(baseUrl));
        expect(candidateFetches).toHaveLength(7);
        expect(candidateFetches.every(([, init]) => init?.redirect === 'error')).toBe(true);
      expect(requests).toContainEqual(expect.objectContaining({
        url: '/v1/chat/completions',
        body: expect.objectContaining({
          model: 'qwen3.8-flash-next',
          max_tokens: 512,
          chat_template_kwargs: { enable_thinking: false },
        }),
      }));
      const silentRequest = requests.find((candidate) => (
        candidate.url === '/v1/chat/completions'
        && (candidate.body as { model?: string } | undefined)?.model === 'silent-model'
      ));
      expect(silentRequest?.body).not.toHaveProperty('chat_template_kwargs');
        expect(fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf8') : null).toBe(configBefore);
        expect(server.vault?.get('openai-compatible')).toBeNull();
      } finally {
        fetchSpy.mockRestore();
        await new Promise<void>((resolve, reject) => candidateServer.close((error) => error ? reject(error) : resolve()));
      }
    });

    it('rejects an unsafe compatible probe URL without issuing a request or changing settings', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      const configPath = path.join(tmpDir, 'config.json');
      const configBefore = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf8') : null;

      try {
        const res = await injectWithAuth(server, {
          method: 'POST',
          url: '/api/settings/test-compatible',
          payload: { baseUrl: 'file:///C:/secrets' },
        });

        expect(res.statusCode).toBe(400);
        expect(fetchSpy).not.toHaveBeenCalled();
        expect(fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf8') : null).toBe(configBefore);
      } finally {
        fetchSpy.mockRestore();
      }
    });
  });
});

describe('Perplexity Search Tool', () => {
  it('perplexity_search tool exists in createSearchTools output', async () => {
    const { createSearchTools } = await import('../../src/../../../packages/agent/src/search-tools.js');
    const tools = createSearchTools(async () => null);
    const names = tools.map((t) => t.name);
    expect(names).toContain('perplexity_search');
    expect(names).toContain('tavily_search');
    expect(names).toContain('brave_search');
  });

  it('perplexity_search returns "not configured" when no key', async () => {
    const { createSearchTools } = await import('../../src/../../../packages/agent/src/search-tools.js');
    const tools = createSearchTools(async () => null);
    const perplexity = tools.find((t) => t.name === 'perplexity_search');
    expect(perplexity).toBeDefined();
    const result = await perplexity!.execute({ query: 'test' });
    expect(result).toContain('not configured');
  });
});

describe('Legacy provider key migration', () => {
  it('moves legacy plaintext keys into Vault and scrubs config.json', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-key-migration-'));
    const key = 'sk-ant-legacy-key-1234567890';
    fs.writeFileSync(
      path.join(dataDir, 'config.json'),
      JSON.stringify({ defaultModel: 'test/model', providers: { anthropic: { apiKey: key, models: ['claude-sonnet-4-6'] } } }),
      'utf-8',
    );

    const migratedServer = await buildLocalServer({ dataDir, port: 0 });
    try {
      const config = JSON.parse(fs.readFileSync(path.join(dataDir, 'config.json'), 'utf-8')) as {
        providers?: Record<string, { apiKey?: string; models?: string[] }>;
      };
      expect(config.providers?.anthropic).toMatchObject({ apiKey: '', models: ['claude-sonnet-4-6'] });
      expect(migratedServer.vault?.get('anthropic')?.value).toBe(key);
    } finally {
      await migratedServer.close();
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });
});

describe('Model Validation', () => {
  let server: FastifyInstance;
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-model-val-'));
    const personalPath = path.join(tmpDir, 'personal.mind');
    const mind = new MindDB(personalPath);
    const sessions = new SessionStore(mind);
    const frames = new FrameStore(mind);
    const s1 = sessions.create('model-val-test');
    frames.createIFrame(s1.gop_id, 'Model validation test', 'normal');
    mind.close();
    // Set TRIAL tier so we're not capped at the FREE limit (5 workspaces).
    // Without this, ensureDefault() + 4 test workspaces = 5, making the next
    // POST hit the tier limit (403) before reaching model validation (400).
    fs.writeFileSync(path.join(tmpDir, 'config.json'), JSON.stringify({ tier: 'TRIAL' }));
    server = await buildLocalServer({ dataDir: tmpDir });
  });

  afterAll(async () => {
    await server.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('accepts any valid model name when creating workspace', async () => {
    // Standard model
    let res = await injectWithAuth(server, {
      method: 'POST', url: '/api/workspaces',
      payload: { name: 'Test WS 1', group: 'Test', model: 'claude-sonnet-4-6' },
    });
    expect([200, 201]).toContain(res.statusCode);

    // Provider-prefixed model
    res = await injectWithAuth(server, {
      method: 'POST', url: '/api/workspaces',
      payload: { name: 'Test WS 2', group: 'Test', model: 'anthropic/claude-sonnet-4.6' },
    });
    expect([200, 201]).toContain(res.statusCode);

    // Newer model not in old hardcoded list
    res = await injectWithAuth(server, {
      method: 'POST', url: '/api/workspaces',
      payload: { name: 'Test WS 3', group: 'Test', model: 'qwen-max' },
    });
    expect([200, 201]).toContain(res.statusCode);

    // Custom model
    res = await injectWithAuth(server, {
      method: 'POST', url: '/api/workspaces',
      payload: { name: 'Test WS 4', group: 'Test', model: 'my-custom-ollama-model' },
    });
    expect([200, 201]).toContain(res.statusCode);
  });

  it('rejects invalid model names', async () => {
    const res = await injectWithAuth(server, {
      method: 'POST', url: '/api/workspaces',
      payload: { name: 'Test WS Bad', group: 'Test', model: 'x' }, // too short
    });
    expect(res.statusCode).toBe(400);
  });
});
