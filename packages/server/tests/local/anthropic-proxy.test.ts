/**
 * Anthropic Proxy Route Tests (PRQ-043)
 *
 * Tests the built-in OpenAI-to-Anthropic translation proxy:
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

function createTestServer(options: {
  vaultApiKey?: string;
  envApiKey?: string;
  configApiKey?: string;
  dataDir?: string;
} = {}) {
  const server = Fastify({ logger: false });

  // Mock vault
  if (options.vaultApiKey) {
    server.decorate('vault', {
      get: (name: string) => name === 'anthropic' ? { value: options.vaultApiKey } : null,
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
      })) as any;

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
      const fetchCall = (globalThis.fetch as any).mock.calls[0];
      expect(fetchCall[0]).toBe('https://api.anthropic.com/v1/messages');
      const requestBody = JSON.parse(fetchCall[1].body);
      expect(requestBody.model).toBe('claude-sonnet-4-20250514');
      expect(requestBody.system).toContain('You are a helpful assistant');
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
      })) as any;

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
      const fetchCall = (globalThis.fetch as any).mock.calls[0];
      expect(fetchCall[1].headers['x-api-key']).toBe('vault-key-abc');
    });

    it('forwards Anthropic API errors to client', async () => {
      process.env.ANTHROPIC_API_KEY = 'test-key';
      server = createTestServer();

      globalThis.fetch = vi.fn(async () => ({
        ok: false,
        status: 401,
        text: async () => 'Invalid API key',
      })) as any;

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
      })) as any;

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
});
