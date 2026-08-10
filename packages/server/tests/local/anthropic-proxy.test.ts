/**
 * Built-in Provider Proxy Route Tests (PRQ-043)
 *
 * Tests Anthropic translation and direct OpenAI-compatible provider routing:
 *   GET  /v1/health/liveliness           — health check
 *   POST /v1/chat/completions            — translate OpenAI format to Anthropic (non-streaming)
 *
 * Uses a lightweight Fastify server with just the proxy routes registered,
 * mocking the external Anthropic API call via globalThis.fetch.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AgentRunRegistry } from '../../src/local/agent-run-registry.js';
import { anthropicProxyRoutes } from '../../src/local/routes/anthropic-proxy.js';
import { PROVIDER_ENV_NAMES } from '../../src/local/provider-env.js';

function createTestServer(options: {
  vaultApiKey?: string;
  vaultProviders?: Record<string, { value: string; metadata?: Record<string, unknown> }>;
  envApiKey?: string;
  configApiKey?: string;
  dataDir?: string;
} = {}) {
  const server = Fastify({ logger: false });

  // Mock vault
  if (options.vaultApiKey || options.vaultProviders) {
    server.decorate('vault', {
      get: (name: string) => {
        if (name === 'anthropic' && options.vaultApiKey) return { value: options.vaultApiKey };
        return options.vaultProviders?.[name] ?? null;
      },
    });
  } else {
    server.decorate('vault', null);
  }

  // Mock localConfig (needed by getAnthropicKey for config.json fallback)
  server.decorate('localConfig', {
    dataDir: options.dataDir ?? '/tmp/nonexistent-waggle-test',
  });

  server.register(anthropicProxyRoutes);
  return server;
}

describe('Anthropic Proxy Routes', () => {
  let server: FastifyInstance;
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.ANTHROPIC_API_KEY;

  beforeEach(() => {
    // Clear env var by default
    delete process.env.ANTHROPIC_API_KEY;
  });

  afterEach(async () => {
    if (server) await server.close();
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    // Restore env var
    if (originalApiKey !== undefined) {
      process.env.ANTHROPIC_API_KEY = originalApiKey;
    } else {
      delete process.env.ANTHROPIC_API_KEY;
    }
  });

  // ── Health check ──────────────────────────────────────────────

  describe('GET /v1/health/liveliness', () => {
    it('returns healthy status', async () => {
      server = createTestServer();
      const res = await server.inject({
        method: 'GET',
        url: '/v1/health/liveliness',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.status).toBe('healthy');
    });
  });

  describe('GET /v1/health/readiness', () => {
    it('reports unavailable when the proxy has no provider credential', async () => {
      for (const envName of new Set(Object.values(PROVIDER_ENV_NAMES).flat())) {
        vi.stubEnv(envName, '');
      }
      server = createTestServer();
      const unavailableFetch = vi.fn(async () => new Response(null, { status: 503 }));
      globalThis.fetch = unavailableFetch as unknown as typeof globalThis.fetch;
      const res = await server.inject({
        method: 'GET',
        url: '/v1/health/readiness',
      });

      expect(res.statusCode).toBe(503);
      expect(res.json()).toMatchObject({ status: 'unavailable' });
    });

    it('reports ready when at least one provider credential is configured', async () => {
      server = createTestServer({ vaultApiKey: 'test-key' });
      const res = await server.inject({
        method: 'GET',
        url: '/v1/health/readiness',
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ status: 'ready' });
    });

    it('reports ready when a loopback Ollama runtime has a local model', async () => {
      for (const envName of new Set(Object.values(PROVIDER_ENV_NAMES).flat())) {
        vi.stubEnv(envName, '');
      }
      vi.stubEnv('OLLAMA_HOST', 'http://127.0.0.1:11455');
      server = createTestServer();
      const localFetch = vi.fn(async (url: string | URL | Request) => {
        const payload = String(url).endsWith('/api/tags')
          ? {
              models: [
                { name: '' },
                { name: '' },
                { name: '' },
                { name: '' },
                { name: 'qwen3:1.7b' },
              ],
            }
          : { capabilities: ['completion', 'tools'] };
        return new Response(JSON.stringify(payload), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      });
      globalThis.fetch = localFetch as unknown as typeof globalThis.fetch;

      const res = await server.inject({
        method: 'GET',
        url: '/v1/health/readiness',
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ status: 'ready' });
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'http://127.0.0.1:11455/api/tags',
        expect.objectContaining({ redirect: 'error' }),
      );
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'http://127.0.0.1:11455/api/show',
        expect.objectContaining({
          body: JSON.stringify({ model: 'qwen3:1.7b' }),
          redirect: 'error',
        }),
      );
    });

    it('does not report ready for embedding-only or Ollama cloud aliases', async () => {
      for (const envName of new Set(Object.values(PROVIDER_ENV_NAMES).flat())) {
        vi.stubEnv(envName, '');
      }
      vi.stubEnv('OLLAMA_HOST', 'http://127.0.0.1:11455');
      server = createTestServer();
      const shownModels: string[] = [];
      const localFetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
        const payload = String(url).endsWith('/api/tags')
          ? {
              models: [
                { name: 'all-minilm:latest' },
                { name: 'bge-m3:latest' },
                { name: 'qwen3:cloud' },
                { name: 'llama3.2:3b', remote_host: 'https://ollama.com' },
              ],
            }
          : (() => {
              shownModels.push(JSON.parse(String(init?.body)).model);
              return { capabilities: ['embedding'] };
            })();
        return new Response(JSON.stringify(payload), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      });
      globalThis.fetch = localFetch as unknown as typeof globalThis.fetch;

      const res = await server.inject({
        method: 'GET',
        url: '/v1/health/readiness',
      });

      expect(res.statusCode).toBe(503);
      expect(res.json()).toMatchObject({ status: 'unavailable' });
      expect(shownModels).toEqual(['all-minilm:latest', 'bge-m3:latest']);
    });

    it('coalesces concurrent Ollama readiness probes and bounds capability checks', async () => {
      for (const envName of new Set(Object.values(PROVIDER_ENV_NAMES).flat())) {
        vi.stubEnv(envName, '');
      }
      vi.stubEnv('OLLAMA_HOST', 'http://127.0.0.1:11456');
      server = createTestServer();
      let tagsCalls = 0;
      let showCalls = 0;
      let activeShowCalls = 0;
      let peakShowCalls = 0;
      const models = Array.from({ length: 12 }, (_, index) => ({ name: `model-${index}` }));
      const localFetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
        if (String(url).endsWith('/api/tags')) {
          tagsCalls += 1;
          return new Response(JSON.stringify({ models }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        showCalls += 1;
        activeShowCalls += 1;
        peakShowCalls = Math.max(peakShowCalls, activeShowCalls);
        await new Promise((resolve) => setTimeout(resolve, 10));
        activeShowCalls -= 1;
        const shownModel = JSON.parse(String(init?.body)).model;
        const capabilities = shownModel === 'model-11' ? ['completion'] : ['embedding'];
        return new Response(JSON.stringify({ capabilities }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      });
      globalThis.fetch = localFetch as unknown as typeof globalThis.fetch;

      const responses = await Promise.all(Array.from({ length: 8 }, () => server!.inject({
        method: 'GET',
        url: '/v1/health/readiness',
      })));
      const cachedResponse = await server.inject({
        method: 'GET',
        url: '/v1/health/readiness',
      });

      expect(responses.every((response) => response.statusCode === 200)).toBe(true);
      expect(cachedResponse.statusCode).toBe(200);
      expect(tagsCalls).toBe(1);
      expect(showCalls).toBe(models.length);
      expect(peakShowCalls).toBeLessThanOrEqual(4);
    });

    it('gives later queued Ollama models a full capability timeout window', async () => {
      for (const envName of new Set(Object.values(PROVIDER_ENV_NAMES).flat())) {
        vi.stubEnv(envName, '');
      }
      vi.stubEnv('OLLAMA_HOST', 'http://127.0.0.1:11458');
      server = createTestServer();
      const models = Array.from({ length: 8 }, (_, index) => ({ name: `slow-model-${index}` }));
      const localFetch = vi.fn(async (
        url: string | URL | Request,
        init?: RequestInit,
      ) => {
        if (String(url).endsWith('/api/tags')) {
          return new Response(JSON.stringify({ models }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        const signal = init?.signal;
        await new Promise<void>((resolve, reject) => {
          const onAbort = () => {
            clearTimeout(timer);
            reject(signal?.reason ?? new Error('capability probe aborted'));
          };
          const timer = setTimeout(() => {
            signal?.removeEventListener('abort', onAbort);
            resolve();
          }, 1_100);
          if (signal?.aborted) onAbort();
          else signal?.addEventListener('abort', onAbort, { once: true });
        });
        const shownModel = JSON.parse(String(init?.body)).model;
        const capabilities = shownModel === 'slow-model-7' ? ['completion'] : ['embedding'];
        return new Response(JSON.stringify({ capabilities }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      });
      globalThis.fetch = localFetch as unknown as typeof globalThis.fetch;

      const response = await server.inject({
        method: 'GET',
        url: '/v1/health/readiness',
      });

      expect(response.statusCode).toBe(200);
    });

    it('bounds readiness latency when many Ollama capability probes stall', async () => {
      for (const envName of new Set(Object.values(PROVIDER_ENV_NAMES).flat())) {
        vi.stubEnv(envName, '');
      }
      vi.stubEnv('OLLAMA_HOST', 'http://127.0.0.1:11459');
      server = createTestServer();
      const models = Array.from({ length: 64 }, (_, index) => ({ name: `stalled-${index}` }));
      let showCalls = 0;
      let activeShowCalls = 0;
      let peakShowCalls = 0;
      const localFetch = vi.fn(async (
        url: string | URL | Request,
        init?: RequestInit,
      ) => {
        if (String(url).endsWith('/api/tags')) {
          return new Response(JSON.stringify({ models }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        showCalls += 1;
        activeShowCalls += 1;
        peakShowCalls = Math.max(peakShowCalls, activeShowCalls);
        const signal = init?.signal;
        try {
          await new Promise<void>((resolve, reject) => {
            const onAbort = () => {
              clearTimeout(timer);
              reject(signal?.reason ?? new Error('capability probe aborted'));
            };
            const timer = setTimeout(() => {
              signal?.removeEventListener('abort', onAbort);
              resolve();
            }, 300);
            if (signal?.aborted) onAbort();
            else signal?.addEventListener('abort', onAbort, { once: true });
          });
        } finally {
          activeShowCalls -= 1;
        }
        return new Response(JSON.stringify({ capabilities: ['embedding'] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      });
      globalThis.fetch = localFetch as unknown as typeof globalThis.fetch;

      const startedAt = performance.now();
      const response = await server.inject({
        method: 'GET',
        url: '/v1/health/readiness',
      });
      const elapsedMs = performance.now() - startedAt;

      expect(response.statusCode).toBe(503);
      expect(elapsedMs).toBeLessThan(4_000);
      expect(showCalls).toBeLessThan(models.length);
      expect(activeShowCalls).toBe(0);
      expect(peakShowCalls).toBeLessThanOrEqual(4);
    });

    it('refreshes cached Ollama readiness after the short TTL expires', async () => {
      for (const envName of new Set(Object.values(PROVIDER_ENV_NAMES).flat())) {
        vi.stubEnv(envName, '');
      }
      vi.stubEnv('OLLAMA_HOST', 'http://127.0.0.1:11457');
      let now = 10_000;
      let ready = false;
      let tagsCalls = 0;
      vi.spyOn(Date, 'now').mockImplementation(() => now);
      server = createTestServer();
      const localFetch = vi.fn(async (url: string | URL | Request) => {
        if (String(url).endsWith('/api/tags')) {
          tagsCalls += 1;
          return new Response(JSON.stringify({ models: [{ name: 'qwen3:1.7b' }] }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        return new Response(JSON.stringify({
          capabilities: ready ? ['completion'] : ['embedding'],
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      });
      globalThis.fetch = localFetch as unknown as typeof globalThis.fetch;

      const unavailable = await server.inject({
        method: 'GET',
        url: '/v1/health/readiness',
      });
      const cachedUnavailable = await server.inject({
        method: 'GET',
        url: '/v1/health/readiness',
      });
      ready = true;
      now += 2_001;
      const refreshed = await server.inject({
        method: 'GET',
        url: '/v1/health/readiness',
      });

      expect(unavailable.statusCode).toBe(503);
      expect(cachedUnavailable.statusCode).toBe(503);
      expect(refreshed.statusCode).toBe(200);
      expect(tagsCalls).toBe(2);
    });
  });

  // ── POST /v1/chat/completions ─────────────────────────────────

  describe('POST /v1/chat/completions (non-streaming)', () => {
    it('rejects a run token completion when the requested model is outside the assigned run model', async () => {
      const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-run-token-model-scope-'));
      const registry = new AgentRunRegistry(path.join(dataDir, 'agent-runs.json'));
      const room = registry.createRoom({
        workspaceIds: ['workspace-1'],
        source: 'external_tool',
        title: 'OpenClaw room',
        task: 'Use the assigned model only',
      });
      const run = registry.createWorker({
        parentRunId: room.id,
        workspaceId: 'workspace-1',
        source: 'external_tool',
        executor: { kind: 'external_tool', toolId: 'openclaw', model: 'anthropic/claude-sonnet-4-6' },
        title: 'OpenClaw',
        task: room.task,
      });
      const runToken = registry.issueCredential(run.id);
      server = createTestServer({
        vaultApiKey: 'anthropic-key',
        vaultProviders: { openai: { value: 'openai-key' } },
      });
      server.decorate('agentRunRegistry', registry);
      globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({
        content: [{ type: 'text', text: 'assigned model response' }],
        model: 'claude-sonnet-4-6',
        stop_reason: 'end_turn',
        usage: { input_tokens: 1, output_tokens: 2 },
      }), { status: 200, headers: { 'content-type': 'application/json' } })) as unknown as typeof globalThis.fetch;

      try {
        const response = await server.inject({
          method: 'POST',
          url: '/v1/chat/completions',
          headers: { authorization: `Bearer ${runToken}` },
          payload: {
            model: 'openai/gpt-4.1',
            messages: [{ role: 'user', content: 'Use a different provider' }],
            stream: false,
          },
        });

        expect(response.statusCode).toBe(403);
        expect(response.json().error.message).toContain('outside the assigned run model');
        expect(globalThis.fetch).not.toHaveBeenCalled();

        const assigned = await server.inject({
          method: 'POST',
          url: '/v1/chat/completions',
          headers: { authorization: `Bearer ${runToken}` },
          payload: {
            model: 'claude-sonnet-4.6',
            messages: [{ role: 'user', content: 'Use the assigned provider' }],
            stream: false,
          },
        });

        expect(assigned.statusCode).toBe(200);
        expect(assigned.json().choices[0].message.content).toBe('assigned model response');
        expect(vi.mocked(globalThis.fetch).mock.calls[0][0]).toBe('https://api.anthropic.com/v1/messages');
      } finally {
        registry.close();
        fs.rmSync(dataDir, { recursive: true, force: true });
      }
    });

    it('returns 500 when no API key is configured', async () => {
      // No vault key, no env key, no config key
      server = createTestServer();

      const res = await server.inject({
        method: 'POST',
        url: '/v1/chat/completions',
        payload: {
          model: 'claude-sonnet-4-6',
          messages: [{ role: 'user', content: 'Hello' }],
          stream: false,
        },
      });

      expect(res.statusCode).toBe(500);
      const body = res.json();
      expect(body.error.message).toContain('No Anthropic API key');
    });

    it('translates OpenAI format to Anthropic format and returns response', async () => {
      process.env.ANTHROPIC_API_KEY = 'test-key-12345';
      server = createTestServer();

      // Mock the Anthropic API response
      globalThis.fetch = vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          content: [
            { type: 'text', text: 'Hello! How can I help you?' },
          ],
          model: 'claude-sonnet-4-20250514',
          stop_reason: 'end_turn',
          usage: { input_tokens: 12, output_tokens: 8 },
        }),
      })) as unknown as typeof globalThis.fetch;

      const res = await server.inject({
        method: 'POST',
        url: '/v1/chat/completions',
        payload: {
          model: 'claude-sonnet-4-6',
          messages: [
            { role: 'system', content: 'You are a helpful assistant.' },
            { role: 'user', content: 'Hello' },
          ],
          stream: false,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();

      // Verify OpenAI response format
      expect(body.choices).toHaveLength(1);
      expect(body.choices[0].message.role).toBe('assistant');
      expect(body.choices[0].message.content).toBe('Hello! How can I help you?');
      expect(body.choices[0].finish_reason).toBe('stop');
      expect(body.usage.prompt_tokens).toBe(12);
      expect(body.usage.completion_tokens).toBe(8);
      expect(body.usage.total_tokens).toBe(20);

      // Verify the Anthropic API was called with correct parameters
      const fetchCall = vi.mocked(globalThis.fetch).mock.calls[0];
      expect(fetchCall[0]).toBe('https://api.anthropic.com/v1/messages');
      const requestBody = JSON.parse(String(fetchCall[1]?.body ?? ''));
      // B3 cleanup (2026-04-22) — proxy now passes floating alias through
      // unchanged per decisions/2026-04-22-model-route-naming-locked.md §3.
      // Previous behavior rewrote to invalid -20250514 snapshot.
      expect(requestBody.model).toBe('claude-sonnet-4-6');
      // system is either a string or an Anthropic cache-control block array —
      // extract the text in either case.
      const systemText = Array.isArray(requestBody.system)
        ? requestBody.system.map((b: { text?: string }) => b.text ?? '').join('\n')
        : String(requestBody.system ?? '');
      expect(systemText).toContain('You are a helpful assistant');
      expect(requestBody.stream).toBe(false);
    });

    it('counts and preserves Anthropic cache tokens in response usage', async () => {
      process.env.ANTHROPIC_API_KEY = 'test-key-cache-usage';
      server = createTestServer();

      globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({
        content: [{ type: 'text', text: 'Cached response' }],
        model: 'claude-sonnet-4-6',
        stop_reason: 'end_turn',
        usage: {
          input_tokens: 100,
          cache_creation_input_tokens: 2_000,
          cache_read_input_tokens: 5_000,
          output_tokens: 20,
        },
      }), { status: 200, headers: { 'content-type': 'application/json' } })) as unknown as typeof globalThis.fetch;

      const res = await server.inject({
        method: 'POST',
        url: '/v1/chat/completions',
        payload: {
          model: 'anthropic/claude-sonnet-4-6',
          messages: [{ role: 'user', content: 'Use the cached context' }],
          stream: false,
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().usage).toEqual({
        prompt_tokens: 7_100,
        completion_tokens: 20,
        total_tokens: 7_120,
        prompt_tokens_details: { cached_tokens: 5_000 },
        cache_creation_input_tokens: 2_000,
        cache_read_input_tokens: 5_000,
      });
    });

    it('uses API key from vault when available', async () => {
      server = createTestServer({ vaultApiKey: 'vault-key-abc' });

      globalThis.fetch = vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          content: [{ type: 'text', text: 'Response' }],
          model: 'claude-sonnet-4-20250514',
          stop_reason: 'end_turn',
          usage: { input_tokens: 5, output_tokens: 3 },
        }),
      })) as unknown as typeof globalThis.fetch;

      const res = await server.inject({
        method: 'POST',
        url: '/v1/chat/completions',
        payload: {
          model: 'claude-sonnet-4-6',
          messages: [{ role: 'user', content: 'Hi' }],
          stream: false,
        },
      });

      expect(res.statusCode).toBe(200);

      // Verify vault key was used in the request
      const fetchCall = vi.mocked(globalThis.fetch).mock.calls[0];
      const headers = fetchCall[1]?.headers as Record<string, string> | undefined;
      expect(headers?.['x-api-key']).toBe('vault-key-abc');
    });

    it('forwards Anthropic API errors to client', async () => {
      process.env.ANTHROPIC_API_KEY = 'test-key';
      server = createTestServer();

      globalThis.fetch = vi.fn(async () => ({
        ok: false,
        status: 401,
        text: async () => 'Invalid API key',
      })) as unknown as typeof globalThis.fetch;

      const res = await server.inject({
        method: 'POST',
        url: '/v1/chat/completions',
        payload: {
          model: 'claude-sonnet-4-6',
          messages: [{ role: 'user', content: 'Hi' }],
          stream: false,
        },
      });

      expect(res.statusCode).toBe(401);
      const body = res.json();
      expect(body.error.message).toContain('Anthropic API error');
      expect(body.error.message).toContain('Invalid API key');
    });

    it('translates tool_use response to OpenAI format', async () => {
      process.env.ANTHROPIC_API_KEY = 'test-key';
      server = createTestServer();

      globalThis.fetch = vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          content: [
            { type: 'text', text: 'Let me search for that.' },
            {
              type: 'tool_use',
              id: 'toolu_123',
              name: 'web_search',
              input: { query: 'Waggle AI agent' },
            },
          ],
          model: 'claude-sonnet-4-20250514',
          stop_reason: 'tool_use',
          usage: { input_tokens: 20, output_tokens: 15 },
        }),
      })) as unknown as typeof globalThis.fetch;

      const res = await server.inject({
        method: 'POST',
        url: '/v1/chat/completions',
        payload: {
          model: 'claude-sonnet-4-6',
          messages: [{ role: 'user', content: 'Search for Waggle' }],
          tools: [
            {
              type: 'function',
              function: {
                name: 'web_search',
                description: 'Search the web',
                parameters: {
                  type: 'object',
                  properties: { query: { type: 'string' } },
                },
              },
            },
          ],
          stream: false,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.choices[0].finish_reason).toBe('tool_calls');
      expect(body.choices[0].message.content).toBe('Let me search for that.');
      expect(body.choices[0].message.tool_calls).toHaveLength(1);
      expect(body.choices[0].message.tool_calls[0].id).toBe('toolu_123');
      expect(body.choices[0].message.tool_calls[0].type).toBe('function');
      expect(body.choices[0].message.tool_calls[0].function.name).toBe('web_search');
      expect(JSON.parse(body.choices[0].message.tool_calls[0].function.arguments)).toEqual({ query: 'Waggle AI agent' });
    });

    it('preserves Anthropic max_tokens as an incomplete OpenAI length reason', async () => {
      process.env.ANTHROPIC_API_KEY = 'test-key-max-tokens';
      server = createTestServer();
      globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({
        content: [{ type: 'text', text: 'Partial answer' }],
        model: 'claude-sonnet-4-6',
        stop_reason: 'max_tokens',
        usage: { input_tokens: 100, output_tokens: 50 },
      }), { status: 200, headers: { 'content-type': 'application/json' } })) as unknown as typeof globalThis.fetch;

      const res = await server.inject({
        method: 'POST',
        url: '/v1/chat/completions',
        payload: {
          model: 'anthropic/claude-sonnet-4-6',
          messages: [{ role: 'user', content: 'Answer fully' }],
          stream: false,
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().choices[0].finish_reason).toBe('length');
    });

    it.each([
      [undefined, 'anthropic_missing_stop_reason'],
      [null, 'anthropic_missing_stop_reason'],
      ['refusal', 'refusal'],
      ['pause_turn', 'pause_turn'],
      ['tool_use', 'anthropic_inconsistent_tool_use'],
    ])('fails closed for non-stream stop reason %s', async (anthropicReason, openAiReason) => {
      process.env.ANTHROPIC_API_KEY = 'test-key-nonstream-stop-reason';
      server = createTestServer();
      globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({
        content: [{ type: 'text', text: 'Unaccepted partial answer' }],
        model: 'claude-sonnet-4-6',
        stop_reason: anthropicReason,
        usage: { input_tokens: 100, output_tokens: 50 },
      }), { status: 200, headers: { 'content-type': 'application/json' } })) as unknown as typeof globalThis.fetch;

      const res = await server.inject({
        method: 'POST',
        url: '/v1/chat/completions',
        payload: {
          model: 'anthropic/claude-sonnet-4-6',
          messages: [{ role: 'user', content: 'Answer fully' }],
          stream: false,
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().choices[0].finish_reason).toBe(openAiReason);
    });
  });

  describe('POST /v1/chat/completions (streaming)', () => {
    it('counts and preserves Anthropic cache tokens in the final usage chunk', async () => {
      process.env.ANTHROPIC_API_KEY = 'test-key-stream-cache-usage';
      server = createTestServer();
      const anthropicStream = [
        'data: {"type":"message_start","message":{"usage":{"input_tokens":100,"cache_creation_input_tokens":2000,"cache_read_input_tokens":5000}}}',
        'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":20}}',
        'data: {"type":"message_stop"}',
      ].join('\n\n') + '\n\n';
      globalThis.fetch = vi.fn(async () => new Response(anthropicStream, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      })) as unknown as typeof globalThis.fetch;

      const res = await server.inject({
        method: 'POST',
        url: '/v1/chat/completions',
        payload: {
          model: 'anthropic/claude-sonnet-4-6',
          messages: [{ role: 'user', content: 'Stream cached context' }],
          stream: true,
          stream_options: { include_usage: true },
        },
      });

      expect(res.statusCode).toBe(200);
      const usageChunk = res.body
        .split('\n')
        .filter(line => line.startsWith('data: {'))
        .map(line => JSON.parse(line.slice(6)))
        .find(chunk => chunk.usage);
      expect(usageChunk?.usage).toEqual({
        prompt_tokens: 7_100,
        completion_tokens: 20,
        total_tokens: 7_120,
        prompt_tokens_details: { cached_tokens: 5_000 },
        cache_creation_input_tokens: 2_000,
        cache_read_input_tokens: 5_000,
      });
    });

    it.each([
      ['end_turn', 'stop', false],
      ['stop_sequence', 'stop', false],
      ['tool_use', 'tool_calls', true],
      ['tool_use', 'anthropic_inconsistent_tool_use', false],
      ['max_tokens', 'length', false],
      ['pause_turn', 'pause_turn', false],
      ['refusal', 'refusal', false],
    ])('translates streaming stop reason %s to %s before DONE', async (anthropicReason, openAiReason, withToolCall) => {
      process.env.ANTHROPIC_API_KEY = 'test-key-stream-stop-reason';
      server = createTestServer();
      const anthropicStream = [
        'data: {"type":"message_start","message":{"usage":{"input_tokens":100}}}',
        ...(withToolCall
          ? ['data: {"type":"content_block_start","content_block":{"type":"tool_use","id":"toolu_1","name":"web_search"}}']
          : []),
        `data: ${JSON.stringify({
          type: 'message_delta',
          delta: { stop_reason: anthropicReason },
          usage: { output_tokens: 20 },
        })}`,
        'data: {"type":"message_stop"}',
      ].join('\n\n') + '\n\n';
      globalThis.fetch = vi.fn(async () => new Response(anthropicStream, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      })) as unknown as typeof globalThis.fetch;

      const res = await server.inject({
        method: 'POST',
        url: '/v1/chat/completions',
        payload: {
          model: 'anthropic/claude-sonnet-4-6',
          messages: [{ role: 'user', content: 'Stream the answer' }],
          stream: true,
          stream_options: { include_usage: true },
        },
      });

      expect(res.statusCode).toBe(200);
      const dataLines = res.body.split('\n').filter(line => line.startsWith('data: '));
      const terminal = dataLines
        .filter(line => line !== 'data: [DONE]')
        .map(line => JSON.parse(line.slice(6)))
        .find(chunk => chunk.choices?.[0]?.finish_reason);
      expect(terminal?.choices[0].finish_reason).toBe(openAiReason);
      expect(dataLines.at(-1)).toBe('data: [DONE]');
    });

    it('does not synthesize DONE when the upstream stream ends before message_stop', async () => {
      process.env.ANTHROPIC_API_KEY = 'test-key-stream-premature-eof';
      server = createTestServer();
      const anthropicStream = [
        'data: {"type":"message_start","message":{"usage":{"input_tokens":100}}}',
        'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Partial answer"}}',
        'data: {"type":"message_delta","delta":{"stop_reason":"max_tokens"},"usage":{"output_tokens":20}}',
      ].join('\n\n') + '\n\n';
      globalThis.fetch = vi.fn(async () => new Response(anthropicStream, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      })) as unknown as typeof globalThis.fetch;

      const res = await server.inject({
        method: 'POST',
        url: '/v1/chat/completions',
        payload: {
          model: 'anthropic/claude-sonnet-4-6',
          messages: [{ role: 'user', content: 'Stream the answer' }],
          stream: true,
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.body).toContain('Partial answer');
      expect(res.body).not.toContain('finish_reason');
      expect(res.body).not.toContain('data: [DONE]');
    });

    it('fails closed when message_stop arrives without a stop reason', async () => {
      process.env.ANTHROPIC_API_KEY = 'test-key-stream-missing-stop-reason';
      server = createTestServer();
      const anthropicStream = [
        'data: {"type":"message_start","message":{"usage":{"input_tokens":100}}}',
        'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Partial answer"}}',
        'data: {"type":"message_stop"}',
      ].join('\n\n') + '\n\n';
      globalThis.fetch = vi.fn(async () => new Response(anthropicStream, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      })) as unknown as typeof globalThis.fetch;

      const res = await server.inject({
        method: 'POST',
        url: '/v1/chat/completions',
        payload: {
          model: 'anthropic/claude-sonnet-4-6',
          messages: [{ role: 'user', content: 'Stream the answer' }],
          stream: true,
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.body).toContain('"finish_reason":"anthropic_missing_stop_reason"');
      expect(res.body.trimEnd()).toMatch(/data: \[DONE\]$/);
    });

    it('cancels the upstream reader immediately after message_stop', async () => {
      process.env.ANTHROPIC_API_KEY = 'test-key-stream-terminal-cancel';
      server = createTestServer();
      const cancel = vi.fn();
      let delivered = false;
      const hangingAfterTerminal = new ReadableStream<Uint8Array>({
        pull(controller) {
          if (!delivered) {
            delivered = true;
            controller.enqueue(new TextEncoder().encode([
              'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"}}',
              'data: {"type":"message_stop"}',
            ].join('\n\n') + '\n\n'));
            return;
          }
          return new Promise(() => undefined);
        },
        cancel,
      });
      globalThis.fetch = vi.fn(async () => new Response(hangingAfterTerminal, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      })) as unknown as typeof globalThis.fetch;

      const res = await server.inject({
        method: 'POST',
        url: '/v1/chat/completions',
        payload: {
          model: 'anthropic/claude-sonnet-4-6',
          messages: [{ role: 'user', content: 'Stream the answer' }],
          stream: true,
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.body.trimEnd()).toMatch(/data: \[DONE\]$/);
      expect(cancel).toHaveBeenCalledOnce();
    }, 2_000);

    it('does not synthesize DONE when the upstream stream reader fails', async () => {
      process.env.ANTHROPIC_API_KEY = 'test-key-stream-read-failure';
      server = createTestServer();
      const encoder = new TextEncoder();
      let pullCount = 0;
      const failingStream = new ReadableStream<Uint8Array>({
        pull(controller) {
          if (pullCount++ === 0) {
            controller.enqueue(encoder.encode(
              'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Partial answer"}}\n\n',
            ));
          } else {
            controller.error(new Error('upstream socket closed'));
          }
        },
      });
      globalThis.fetch = vi.fn(async () => new Response(failingStream, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      })) as unknown as typeof globalThis.fetch;

      const res = await server.inject({
        method: 'POST',
        url: '/v1/chat/completions',
        payload: {
          model: 'anthropic/claude-sonnet-4-6',
          messages: [{ role: 'user', content: 'Stream the answer' }],
          stream: true,
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.body).toContain('Partial answer');
      expect(res.body).not.toContain('data: [DONE]');
    });
  });

  describe('POST /v1/chat/completions (streaming)', () => {
    it('counts and preserves Anthropic cache tokens in the final usage chunk', async () => {
      process.env.ANTHROPIC_API_KEY = 'test-key-stream-cache-usage';
      server = createTestServer();
      const anthropicStream = [
        'data: {"type":"message_start","message":{"usage":{"input_tokens":100,"cache_creation_input_tokens":2000,"cache_read_input_tokens":5000}}}',
        'data: {"type":"message_delta","usage":{"output_tokens":20}}',
        'data: {"type":"message_stop"}',
      ].join('\n\n') + '\n\n';
      globalThis.fetch = vi.fn(async () => new Response(anthropicStream, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      })) as unknown as typeof globalThis.fetch;

      const res = await server.inject({
        method: 'POST',
        url: '/v1/chat/completions',
        payload: {
          model: 'anthropic/claude-sonnet-4-6',
          messages: [{ role: 'user', content: 'Stream cached context' }],
          stream: true,
          stream_options: { include_usage: true },
        },
      });

      expect(res.statusCode).toBe(200);
      const usageChunk = res.body
        .split('\n')
        .filter(line => line.startsWith('data: {'))
        .map(line => JSON.parse(line.slice(6)))
        .find(chunk => chunk.usage);
      expect(usageChunk?.usage).toEqual({
        prompt_tokens: 7_100,
        completion_tokens: 20,
        total_tokens: 7_120,
        prompt_tokens_details: { cached_tokens: 5_000 },
        cache_creation_input_tokens: 2_000,
        cache_read_input_tokens: 5_000,
      });
    });
  });

  // B3 cleanup regression guard per decisions/2026-04-22-model-route-naming-locked.md §4
  describe('invalid snapshot regression guard (B3 cleanup 2026-04-22)', () => {
    it('does NOT inject -20250514 snapshot for any Claude 4.6 family floating alias', async () => {
      process.env.ANTHROPIC_API_KEY = 'test-key-snapshot-guard';
      server = createTestServer();

      const captures: Array<{ model: string }> = [];
      globalThis.fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        captures.push({ model: body.model });
        return {
          ok: true,
          status: 200,
          json: async () => ({
            content: [{ type: 'text', text: 'ok' }],
            model: body.model,
            stop_reason: 'end_turn',
            usage: { input_tokens: 1, output_tokens: 1 },
          }),
        };
      }) as unknown as typeof globalThis.fetch;

      const floatingAliases = ['claude-sonnet-4-6', 'claude-opus-4-6', 'anthropic/claude-sonnet-4.6', 'anthropic/claude-opus-4.6'];
      for (const alias of floatingAliases) {
        await server.inject({
          method: 'POST',
          url: '/v1/chat/completions',
          payload: {
            model: alias,
            messages: [{ role: 'user', content: 'test' }],
            stream: false,
          },
        });
      }

      // Every outbound model must NOT be the invalid -20250514 snapshot.
      for (const cap of captures) {
        expect(cap.model).not.toMatch(/-20250514$/);
        // Positive assertion: floating alias passes through as the canonical
        // dash-form (mapModel normalizes dots to dashes).
        expect(cap.model).toMatch(/^claude-(sonnet|opus)-4-6$/);
      }
      expect(captures).toHaveLength(floatingAliases.length);
    });
  });

  describe('max token forwarding', () => {
    it.each([
      {
        label: 'Anthropic',
        model: 'anthropic/claude-sonnet-4-6',
        providerId: 'anthropic',
        response: {
          content: [{ type: 'text', text: 'ok' }],
          model: 'claude-sonnet-4-6',
          stop_reason: 'end_turn',
          usage: { input_tokens: 1, output_tokens: 1 },
        },
      },
      {
        label: 'OpenRouter',
        model: 'openrouter/openai/gpt-5.4',
        providerId: 'openrouter',
        response: {
          choices: [{ message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }],
        },
      },
      {
        label: 'Gemini',
        model: 'google/gemini-3.5-flash',
        providerId: 'google',
        response: {
          choices: [{ message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }],
        },
      },
      {
        label: 'non-reasoning direct OpenAI',
        model: 'openai/gpt-4.1',
        providerId: 'openai',
        response: {
          choices: [{ message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }],
        },
      },
    ])('keeps max_tokens for $label requests', async ({ model, providerId, response }) => {
      server = createTestServer({
        vaultProviders: { [providerId]: { value: `${providerId}-vault-key` } },
      });
      globalThis.fetch = vi.fn(async () => new Response(JSON.stringify(response), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })) as unknown as typeof globalThis.fetch;

      const res = await server.inject({
        method: 'POST',
        url: '/v1/chat/completions',
        payload: {
          model,
          messages: [{ role: 'user', content: 'test' }],
          max_tokens: 321,
          stream: false,
        },
      });

      expect(res.statusCode).toBe(200);
      const outbound = JSON.parse(String(vi.mocked(globalThis.fetch).mock.calls[0][1]?.body));
      expect(outbound.max_tokens).toBe(321);
      expect(outbound).not.toHaveProperty('max_completion_tokens');
    });

    it.each(['gpt-5.4', 'openai/o3-mini', 'openai/codex-mini-latest'])(
      'translates max_tokens for direct OpenAI reasoning model %s',
      async (model) => {
        server = createTestServer({
          vaultProviders: { openai: { value: 'openai-vault-key' } },
        });
        globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({
          choices: [{ message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }],
        }), { status: 200, headers: { 'content-type': 'application/json' } })) as unknown as typeof globalThis.fetch;

        const res = await server.inject({
          method: 'POST',
          url: '/v1/chat/completions',
          payload: {
            model,
            messages: [{ role: 'user', content: 'test' }],
            max_tokens: 321,
            stream: false,
          },
        });

        expect(res.statusCode).toBe(200);
        const outbound = JSON.parse(String(vi.mocked(globalThis.fetch).mock.calls[0][1]?.body));
        expect(outbound.max_completion_tokens).toBe(321);
        expect(outbound).not.toHaveProperty('max_tokens');
      },
    );
  });

  describe('Docker-independent provider routing', () => {
    it('forwards Ollama models to the loopback runtime without cloud credentials', async () => {
      vi.stubEnv('OLLAMA_HOST', 'http://127.0.0.1:11455');
      server = createTestServer();
      globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({
        choices: [{ message: { role: 'assistant', content: 'Local route works.' }, finish_reason: 'stop' }],
        model: 'qwen3:1.7b',
      }), { status: 200, headers: { 'content-type': 'application/json' } })) as unknown as typeof globalThis.fetch;

      const res = await server.inject({
        method: 'POST',
        url: '/v1/chat/completions',
        payload: {
          model: 'ollama/qwen3:1.7b',
          messages: [{ role: 'user', content: 'test' }],
          tools: [{
            type: 'function',
            function: { name: 'read_file', description: 'Read', parameters: { type: 'object' } },
          }],
          stream: false,
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().choices[0].message.content).toBe('Local route works.');
      const [url, init] = vi.mocked(globalThis.fetch).mock.calls[0];
      expect(String(url)).toBe('http://127.0.0.1:11455/v1/chat/completions');
      expect(init?.method).toBe('POST');
      expect((init?.headers as Record<string, string>).Authorization).toBeUndefined();
      expect((init?.headers as Record<string, string>)['Content-Type']).toBe('application/json');
      expect(init?.redirect).toBe('error');
      const outbound = JSON.parse(String(init?.body));
      expect(outbound.model).toBe('qwen3:1.7b');
      expect(outbound.tools[0].function.name).toBe('read_file');
    });

    it('passes through Ollama SSE without buffering it into JSON', async () => {
      vi.stubEnv('OLLAMA_HOST', 'http://localhost:11455');
      server = createTestServer();
      const upstream = 'data: {"choices":[{"delta":{"content":"Hi"}}]}\n\ndata: [DONE]\n\n';
      globalThis.fetch = vi.fn(async () => new Response(upstream, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      })) as unknown as typeof globalThis.fetch;

      const res = await server.inject({
        method: 'POST',
        url: '/v1/chat/completions',
        payload: {
          model: 'ollama/qwen3:1.7b',
          messages: [{ role: 'user', content: 'test' }],
          stream: true,
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('text/event-stream');
      expect(res.body).toBe(upstream);
      expect(String(vi.mocked(globalThis.fetch).mock.calls[0][0]))
        .toBe('http://localhost:11455/v1/chat/completions');
    });

    it('aborts the Ollama generation when the client disconnects', async () => {
      vi.stubEnv('OLLAMA_HOST', 'http://127.0.0.1:11455');
      server = createTestServer();
      let upstreamSignal: AbortSignal | undefined;
      globalThis.fetch = vi.fn(async (_url, init) => {
        upstreamSignal = init?.signal as AbortSignal | undefined;
        return new Response(new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(
              'data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n',
            ));
            const fallback = setTimeout(() => controller.close(), 500);
            upstreamSignal?.addEventListener('abort', () => {
              clearTimeout(fallback);
              controller.close();
            }, { once: true });
          },
        }), {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        });
      }) as unknown as typeof globalThis.fetch;

      await server.listen({ host: '127.0.0.1', port: 0 });
      const address = server.server.address();
      if (!address || typeof address === 'string') throw new Error('Test server did not bind TCP');
      const clientAbort = new AbortController();
      const clientResponse = await originalFetch(
        `http://127.0.0.1:${address.port}/v1/chat/completions`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'ollama/qwen3:1.7b',
            messages: [{ role: 'user', content: 'test' }],
            stream: true,
          }),
          signal: clientAbort.signal,
        },
      );
      const clientReader = clientResponse.body?.getReader();
      expect(clientReader).toBeDefined();
      await clientReader!.read();
      clientAbort.abort();

      await vi.waitFor(() => {
        expect(upstreamSignal?.aborted).toBe(true);
      }, { timeout: 1_000 });
    });

    it.each([
      {
        label: 'OpenAI-compatible',
        model: 'openai/gpt-5.4',
        options: { vaultProviders: { openai: { value: 'openai-vault-key' } } },
      },
      {
        label: 'native Anthropic',
        model: 'anthropic/claude-sonnet-4-6',
        options: { vaultApiKey: 'anthropic-vault-key' },
      },
    ])('bounds a stalled $label cloud request with a 504', async ({ model, options }) => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      try {
        server = createTestServer(options);
        let upstreamSignal: AbortSignal | undefined;
        let markFetchStarted!: () => void;
        const fetchStarted = new Promise<void>((resolve) => { markFetchStarted = resolve; });
        globalThis.fetch = vi.fn((_url, init) => new Promise<Response>((_resolve, reject) => {
          upstreamSignal = init?.signal as AbortSignal | undefined;
          markFetchStarted();
          const fallback = setTimeout(
            () => reject(new Error('unbounded cloud request')),
            120_001,
          );
          upstreamSignal?.addEventListener('abort', () => {
            clearTimeout(fallback);
            reject(upstreamSignal?.reason ?? new Error('cloud request aborted'));
          }, { once: true });
        })) as unknown as typeof globalThis.fetch;

        const responsePromise = server.inject({
          method: 'POST',
          url: '/v1/chat/completions',
          payload: {
            model,
            messages: [{ role: 'user', content: 'test' }],
            stream: false,
          },
        });
        await fetchStarted;
        await vi.advanceTimersByTimeAsync(120_001);
        const response = await responsePromise;

        expect(upstreamSignal?.aborted).toBe(true);
        expect(response.statusCode).toBe(504);
        expect(response.json().error.message).toContain('timed out after 120000ms');
      } finally {
        vi.useRealTimers();
      }
    });

    it.each([
      {
        label: 'OpenAI-compatible',
        model: 'openai/gpt-5.4',
        options: { vaultProviders: { openai: { value: 'openai-vault-key' } } },
        response: {
          choices: [{ message: { role: 'assistant', content: 'done' }, finish_reason: 'stop' }],
        },
      },
      {
        label: 'native Anthropic',
        model: 'anthropic/claude-sonnet-4-6',
        options: { vaultApiKey: 'anthropic-vault-key' },
        response: {
          content: [{ type: 'text', text: 'done' }],
          stop_reason: 'end_turn',
          usage: { input_tokens: 1, output_tokens: 1 },
        },
      },
    ])('clears the $label timeout after a completed response', async ({
      model,
      options,
      response,
    }) => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      try {
        server = createTestServer(options);
        let upstreamSignal: AbortSignal | undefined;
        globalThis.fetch = vi.fn(async (_url, init) => {
          upstreamSignal = init?.signal as AbortSignal | undefined;
          return new Response(JSON.stringify(response), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }) as unknown as typeof globalThis.fetch;

        const result = await server.inject({
          method: 'POST',
          url: '/v1/chat/completions',
          payload: {
            model,
            messages: [{ role: 'user', content: 'test' }],
            stream: false,
          },
        });
        expect(result.statusCode).toBe(200);
        await vi.advanceTimersByTimeAsync(120_001);
        expect(upstreamSignal?.aborted).toBe(false);
      } finally {
        vi.useRealTimers();
      }
    });

    it.each([
      {
        label: 'OpenAI-compatible',
        model: 'openai/gpt-5.4',
        options: { vaultProviders: { openai: { value: 'openai-vault-key' } } },
        firstChunk: 'data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n',
      },
      {
        label: 'native Anthropic',
        model: 'anthropic/claude-sonnet-4-6',
        options: { vaultApiKey: 'anthropic-vault-key' },
        firstChunk: 'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hi"}}\n\n',
      },
    ])('aborts the $label cloud stream when the client disconnects', async ({
      model,
      options,
      firstChunk,
    }) => {
      server = createTestServer(options);
      let upstreamSignal: AbortSignal | undefined;
      globalThis.fetch = vi.fn(async (_url, init) => {
        upstreamSignal = init?.signal as AbortSignal | undefined;
        return new Response(new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(firstChunk));
            const fallback = setTimeout(() => controller.close(), 500);
            upstreamSignal?.addEventListener('abort', () => {
              clearTimeout(fallback);
              controller.close();
            }, { once: true });
          },
        }), {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        });
      }) as unknown as typeof globalThis.fetch;

      await server.listen({ host: '127.0.0.1', port: 0 });
      const address = server.server.address();
      if (!address || typeof address === 'string') throw new Error('Test server did not bind TCP');
      const clientAbort = new AbortController();
      const clientResponse = await originalFetch(
        `http://127.0.0.1:${address.port}/v1/chat/completions`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: 'test' }],
            stream: true,
          }),
          signal: clientAbort.signal,
        },
      );
      const clientReader = clientResponse.body?.getReader();
      expect(clientReader).toBeDefined();
      await clientReader!.read();
      clientAbort.abort();

      await vi.waitFor(() => {
        expect(upstreamSignal?.aborted).toBe(true);
      }, { timeout: 1_000 });
    });

    it('rejects a non-loopback Ollama endpoint before making an outbound request', async () => {
      vi.stubEnv('OLLAMA_HOST', 'http://ollama.example.test');
      server = createTestServer();
      globalThis.fetch = vi.fn();

      const res = await server.inject({
        method: 'POST',
        url: '/v1/chat/completions',
        payload: {
          model: 'ollama/qwen3:1.7b',
          messages: [{ role: 'user', content: 'test' }],
          stream: false,
        },
      });

      expect(res.statusCode).toBe(503);
      expect(res.json().error.message).toContain('HTTP loopback');
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it('forwards OpenAI-compatible models directly without LiteLLM', async () => {
      server = createTestServer({
        vaultProviders: { openai: { value: 'openai-vault-key' } },
      });

      globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({
        choices: [{ message: { role: 'assistant', content: 'Direct route works.' }, finish_reason: 'stop' }],
        usage: {
          prompt_tokens: 7_100,
          completion_tokens: 20,
          total_tokens: 7_120,
          prompt_tokens_details: { cached_tokens: 5_000 },
        },
        model: 'gpt-5.4',
      }), { status: 200, headers: { 'content-type': 'application/json' } })) as unknown as typeof globalThis.fetch;

      const res = await server.inject({
        method: 'POST',
        url: '/v1/chat/completions',
        payload: {
          model: 'openai/gpt-5.4',
          messages: [{ role: 'user', content: 'test' }],
          tools: [{
            type: 'function',
            function: { name: 'read_file', description: 'Read', parameters: { type: 'object' } },
          }],
          stream: false,
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().choices[0].message.content).toBe('Direct route works.');
      expect(res.json().usage).toEqual({
        prompt_tokens: 7_100,
        completion_tokens: 20,
        total_tokens: 7_120,
        prompt_tokens_details: { cached_tokens: 5_000 },
      });
      const [url, init] = vi.mocked(globalThis.fetch).mock.calls[0];
      expect(String(url)).toBe('https://api.openai.com/v1/chat/completions');
      expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer openai-vault-key');
      const outbound = JSON.parse(String(init?.body));
      expect(outbound.model).toBe('gpt-5.4');
      expect(outbound.tools[0].function.name).toBe('read_file');
    });

    it('preserves nested OpenRouter model ids and honors a configured compatible base URL', async () => {
      server = createTestServer({
        vaultProviders: {
          openrouter: {
            value: 'openrouter-vault-key',
            metadata: { baseUrl: 'https://router.example.test/api/v1' },
          },
        },
      });
      globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({
        choices: [{ message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }],
      }), { status: 200, headers: { 'content-type': 'application/json' } })) as unknown as typeof globalThis.fetch;

      const res = await server.inject({
        method: 'POST',
        url: '/v1/chat/completions',
        payload: {
          model: 'openrouter/anthropic/claude-opus-4.8',
          messages: [{ role: 'user', content: 'test' }],
          stream: false,
        },
      });

      expect(res.statusCode).toBe(200);
      const [url, init] = vi.mocked(globalThis.fetch).mock.calls[0];
      expect(String(url)).toBe('https://router.example.test/api/v1/chat/completions');
      expect(JSON.parse(String(init?.body)).model).toBe('anthropic/claude-opus-4.8');
    });

    it('uses the Gemini OpenAI-compatibility endpoint with bearer auth', async () => {
      server = createTestServer({
        vaultProviders: { google: { value: 'gemini-vault-key' } },
      });
      globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({
        choices: [{ message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }],
      }), { status: 200, headers: { 'content-type': 'application/json' } })) as unknown as typeof globalThis.fetch;

      const res = await server.inject({
        method: 'POST',
        url: '/v1/chat/completions',
        payload: {
          model: 'google/gemini-3.5-flash',
          messages: [{ role: 'user', content: 'test' }],
          stream: false,
        },
      });

      expect(res.statusCode).toBe(200);
      const [url, init] = vi.mocked(globalThis.fetch).mock.calls[0];
      expect(String(url)).toBe(
        'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
      );
      expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer gemini-vault-key');
      expect(JSON.parse(String(init?.body)).model).toBe('gemini-3.5-flash');
    });

    it('falls back from a stale Gemini alias to a working Google alias', async () => {
      const priorGemini = process.env.GEMINI_API_KEY;
      const priorGoogle = process.env.GOOGLE_API_KEY;
      process.env.GEMINI_API_KEY = 'stale-gemini-key';
      process.env.GOOGLE_API_KEY = 'working-google-key';
      try {
        server = createTestServer({ vaultProviders: {} });
        globalThis.fetch = vi.fn(async (_url, init) => {
          const authorization = (init?.headers as Record<string, string>).Authorization;
          if (authorization === 'Bearer stale-gemini-key') {
            return new Response(JSON.stringify({
              error: { message: 'Please pass a valid API key.' },
            }), { status: 400, headers: { 'content-type': 'application/json' } });
          }
          return new Response(JSON.stringify({
            choices: [{ message: { role: 'assistant', content: 'fallback works' }, finish_reason: 'stop' }],
          }), { status: 200, headers: { 'content-type': 'application/json' } });
        }) as unknown as typeof globalThis.fetch;

        const res = await server.inject({
          method: 'POST',
          url: '/v1/chat/completions',
          payload: {
            model: 'google/gemini-2.5-flash',
            messages: [{ role: 'user', content: 'test' }],
            stream: false,
          },
        });

        expect(res.statusCode).toBe(200);
        expect(res.json().choices[0].message.content).toBe('fallback works');
        expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledTimes(2);
        expect(process.env.GEMINI_API_KEY).toBe('working-google-key');
        expect(process.env.GOOGLE_API_KEY).toBe('working-google-key');
      } finally {
        if (priorGemini === undefined) delete process.env.GEMINI_API_KEY;
        else process.env.GEMINI_API_KEY = priorGemini;
        if (priorGoogle === undefined) delete process.env.GOOGLE_API_KEY;
        else process.env.GOOGLE_API_KEY = priorGoogle;
      }
    });

    it('passes through provider SSE without buffering it into JSON', async () => {
      server = createTestServer({
        vaultProviders: { deepseek: { value: 'deepseek-vault-key' } },
      });
      const upstream = 'data: {"choices":[{"delta":{"content":"Hi"}}]}\n\ndata: [DONE]\n\n';
      globalThis.fetch = vi.fn(async () => new Response(upstream, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      })) as unknown as typeof globalThis.fetch;

      const res = await server.inject({
        method: 'POST',
        url: '/v1/chat/completions',
        payload: {
          model: 'deepseek/deepseek-chat',
          messages: [{ role: 'user', content: 'test' }],
          stream: true,
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('text/event-stream');
      expect(res.body).toBe(upstream);
    });

    it('rejects unknown providers before making an outbound request', async () => {
      server = createTestServer();
      globalThis.fetch = vi.fn();

      const res = await server.inject({
        method: 'POST',
        url: '/v1/chat/completions',
        payload: {
          model: 'unknown-provider/new-model',
          messages: [{ role: 'user', content: 'test' }],
          stream: false,
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error.message).toContain('unknown-provider/new-model');
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it('still forwards Claude models (with and without provider prefix)', async () => {
      process.env.ANTHROPIC_API_KEY = 'test-key-model-guard-pass';
      server = createTestServer();

      const captures: string[] = [];
      globalThis.fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        captures.push(body.model);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            content: [{ type: 'text', text: 'ok' }],
            model: body.model,
            stop_reason: 'end_turn',
            usage: { input_tokens: 1, output_tokens: 1 },
          }),
        };
      }) as unknown as typeof globalThis.fetch;

      for (const model of ['claude-fable-5', 'anthropic/claude-sonnet-5']) {
        const res = await server.inject({
          method: 'POST',
          url: '/v1/chat/completions',
          payload: {
            model,
            messages: [{ role: 'user', content: 'test' }],
            stream: false,
          },
        });
        expect(res.statusCode).toBe(200);
      }

      expect(captures).toEqual(['claude-fable-5', 'claude-sonnet-5']);
    });
  });
});
