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
  });

  // ── POST /v1/chat/completions ─────────────────────────────────

  describe('POST /v1/chat/completions (non-streaming)', () => {
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
    it('forwards OpenAI-compatible models directly without LiteLLM', async () => {
      server = createTestServer({
        vaultProviders: { openai: { value: 'openai-vault-key' } },
      });

      globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({
        choices: [{ message: { role: 'assistant', content: 'Direct route works.' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 3, completion_tokens: 4, total_tokens: 7 },
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
