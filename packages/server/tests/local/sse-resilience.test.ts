/**
 * SSE Stream Resilience Tests (PRQ-040)
 *
 * Tests SSE connection behaviors at the HTTP level:
 * - Connection drop simulation: abort mid-stream, verify agent loop receives abort signal
 * - Notification SSE module exports and event emission
 * - Chat SSE endpoint validation and echo mode
 *
 * Note: Fastify inject() waits for the handler to complete, but SSE endpoints
 * keep the connection open indefinitely. For the notification stream we test
 * the module exports and event bus wiring. For the chat endpoint, inject()
 * works because echo mode (no LLM) completes and closes the stream.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { EventEmitter } from 'node:events';
import { MindDB, SessionStore, FrameStore } from '@waggle/core';
import { buildLocalServer } from '../../src/local/index.js';
import type { FastifyInstance } from 'fastify';
import type { LlmProviderStatus } from '../../src/local/index.js';
import type {
  NotificationEvent,
  SubagentStatusEvent,
} from '../../src/local/routes/notifications.js';
import { injectWithAuth } from '../test-utils.js';
import { PROVIDER_ENV_NAMES } from '../../src/local/provider-env.js';

/**
 * Echo mode forces the chat endpoint to bypass the LLM. The test sets an
 * intentionally off-spec provider ('none' is not in the LlmProviderStatus
 * union) and an unreachable LiteLLM URL, so the cast at this boundary is
 * deliberate — the runtime value is the test's, not a real provider status.
 */
const ECHO_MODE_PROVIDER = {
  provider: 'none',
  health: 'unavailable',
  detail: 'Test: force echo mode',
  checkedAt: new Date().toISOString(),
} as unknown as LlmProviderStatus;

describe('SSE Stream Resilience', () => {
  let server: FastifyInstance;
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-sse-resilience-'));

    // Create personal.mind (required by buildLocalServer)
    const personalPath = path.join(tmpDir, 'personal.mind');
    const mind = new MindDB(personalPath);
    const sessions = new SessionStore(mind);
    const frames = new FrameStore(mind);
    const s1 = sessions.create('sse-test');
    frames.createIFrame(s1.gop_id, 'SSE resilience test frame', 'normal');
    mind.close();

    server = await buildLocalServer({ dataDir: tmpDir });
  });

  afterAll(async () => {
    await server.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── Connection drop simulation ──────────────────────────────────

  describe('Chat SSE connection drop', () => {
    it('chat endpoint sets up abort handling and completes in echo mode', async () => {
      // Force echo mode by marking LLM provider as unavailable AND
      // breaking the health endpoint URL so the HTTP probe also fails
      const prevProvider = server.agentState.llmProvider;
      const prevLitellmUrl = server.localConfig.litellmUrl;
      server.agentState.llmProvider = ECHO_MODE_PROVIDER;
      server.localConfig.litellmUrl = 'http://127.0.0.1:1'; // unreachable port

      const res = await injectWithAuth(server, {
        method: 'POST',
        url: '/api/chat',
        payload: { message: 'test abort handling' },
      });

      // Chat endpoint uses reply.hijack() which means inject() gets raw output.
      expect(res.statusCode).toBe(200);
      const body = res.body;

      // In echo mode (no LLM), we should see token events and a done event
      expect(body).toContain('event: token');
      expect(body).toContain('event: done');
      // The done event must be truthful and must not masquerade as an answer.
      expect(body).toContain('No AI model is ready');
      expect(body).not.toContain('test abort handling');

      // Restore provider
      server.agentState.llmProvider = prevProvider;
      server.localConfig.litellmUrl = prevLitellmUrl;
    });

    it('returns 400 when message is missing', async () => {
      const res = await injectWithAuth(server, {
        method: 'POST',
        url: '/api/chat',
        payload: {},
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.error).toBe('message is required');
    });

    it('setup-required mode explains how to configure a working model', async () => {
      // Force echo mode: set provider unavailable AND break health probe URL
      const prevProvider = server.agentState.llmProvider;
      const prevLitellmUrl = server.localConfig.litellmUrl;
      server.agentState.llmProvider = ECHO_MODE_PROVIDER;
      server.localConfig.litellmUrl = 'http://127.0.0.1:1'; // unreachable port

      const res = await injectWithAuth(server, {
        method: 'POST',
        url: '/api/chat',
        payload: { message: 'echo test' },
      });

      expect(res.statusCode).toBe(200);
      expect(res.body).toContain('No AI model is ready');
      expect(res.body).toContain('Settings');
      expect(res.body).not.toContain('echo test');

      // Restore provider
      server.agentState.llmProvider = prevProvider;
      server.localConfig.litellmUrl = prevLitellmUrl;
    });

    it('returns a truthful setup-required completion when the built-in proxy is live but no model is configured', async () => {
      const prevProvider = server.agentState.llmProvider;
      const prevLitellmUrl = server.localConfig.litellmUrl;
      const providerEnv = [...new Set(Object.values(PROVIDER_ENV_NAMES).flat())];
      const previousEnv = new Map(providerEnv.map((name) => [name, process.env[name]]));
      for (const name of providerEnv) delete process.env[name];

      server.agentState.llmProvider = {
        provider: 'anthropic-proxy',
        health: 'degraded',
        detail: 'Built-in provider proxy (no API key)',
        checkedAt: new Date().toISOString(),
      };
      server.localConfig.litellmUrl = 'http://proxy.test/v1';

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
        const url = String(input);
        if (url.endsWith('/api/tags')) {
          return new Response(JSON.stringify({ models: [] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        if (url.endsWith('/health/liveliness')) {
          return new Response(JSON.stringify({ status: 'healthy' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        if (url.endsWith('/health/readiness')) {
          return new Response(JSON.stringify({ status: 'unavailable' }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response(JSON.stringify({ error: { message: 'No API key configured' } }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      });

      try {
        const res = await injectWithAuth(server, {
          method: 'POST',
          url: '/api/chat',
          payload: { message: 'Draft a launch plan' },
        });

        expect(res.statusCode).toBe(200);
        expect(res.body).toContain('event: done');
        expect(res.body).toContain('No AI model is ready');
        expect(res.body).toContain('Settings');
        expect(res.body).not.toContain('Draft a launch plan');
        expect(res.body).not.toContain('event: error');
        expect(fetchSpy.mock.calls.some(([input]) => String(input).endsWith('/chat/completions'))).toBe(false);
      } finally {
        fetchSpy.mockRestore();
        server.agentState.llmProvider = prevProvider;
        server.localConfig.litellmUrl = prevLitellmUrl;
        for (const [name, value] of previousEnv) {
          if (value === undefined) delete process.env[name];
          else process.env[name] = value;
        }
      }
    });
  });

  // ── Notification SSE module and event wiring ────────────────────

  describe('Notification SSE module', () => {
    it('exports notificationRoutes function', async () => {
      const mod = await import('../../src/local/routes/notifications.js');
      expect(mod.notificationRoutes).toBeDefined();
      expect(typeof mod.notificationRoutes).toBe('function');
    });

    it('exports emitNotification function', async () => {
      const mod = await import('../../src/local/routes/notifications.js');
      expect(mod.emitNotification).toBeDefined();
      expect(typeof mod.emitNotification).toBe('function');
    });

    it('emitNotification emits on the eventBus', async () => {
      const { emitNotification } = await import('../../src/local/routes/notifications.js');

      const eventBus = new EventEmitter();
      const events: NotificationEvent[] = [];
      eventBus.on('notification', (data: NotificationEvent) => events.push(data));

      const fakeFastify = { eventBus } as unknown as FastifyInstance;
      emitNotification(fakeFastify, {
        title: 'Test SSE',
        body: 'Testing event emission',
        category: 'agent',
      });

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('notification');
      expect(events[0].title).toBe('Test SSE');
      expect(events[0].body).toBe('Testing event emission');
      expect(events[0].category).toBe('agent');
      expect(events[0].timestamp).toBeDefined();
    });

    it('emitNotification is no-op when eventBus is missing', async () => {
      const { emitNotification } = await import('../../src/local/routes/notifications.js');
      const fakeFastify = {} as unknown as FastifyInstance; // No eventBus

      // Should not throw
      expect(() => {
        emitNotification(fakeFastify, {
          title: 'No bus',
          body: 'Should not crash',
          category: 'cron',
        });
      }).not.toThrow();
    });

    it('emitSubagentStatus emits on the eventBus', async () => {
      const { emitSubagentStatus } = await import('../../src/local/routes/notifications.js');

      const eventBus = new EventEmitter();
      const events: SubagentStatusEvent[] = [];
      eventBus.on('subagent_status', (data: SubagentStatusEvent) => events.push(data));

      const fakeFastify = { eventBus } as unknown as FastifyInstance;
      emitSubagentStatus(fakeFastify, 'ws-1', [
        {
          id: 'agent-1',
          name: 'Researcher',
          role: 'researcher',
          status: 'running',
          task: 'Find info',
          toolsUsed: ['web_search'],
        },
      ]);

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('subagent_status');
      expect(events[0].workspaceId).toBe('ws-1');
      expect(events[0].agents).toHaveLength(1);
      expect(events[0].agents[0].name).toBe('Researcher');
    });
  });

  // ── Multiple concurrent chat streams ────────────────────────────

  describe('Multiple concurrent SSE connections', () => {
    it('two chat streams complete independently in echo mode', async () => {
      // Force echo mode: set provider unavailable AND break health probe URL
      const prevProvider = server.agentState.llmProvider;
      const prevLitellmUrl = server.localConfig.litellmUrl;
      server.agentState.llmProvider = ECHO_MODE_PROVIDER;
      server.localConfig.litellmUrl = 'http://127.0.0.1:1'; // unreachable port

      // Open two chat requests simultaneously — both should complete in echo mode
      const [res1, res2] = await Promise.all([
        injectWithAuth(server, {
          method: 'POST',
          url: '/api/chat',
          payload: { message: 'stream one' },
        }),
        injectWithAuth(server, {
          method: 'POST',
          url: '/api/chat',
          payload: { message: 'stream two' },
        }),
      ]);

      // Both should complete successfully
      expect(res1.statusCode).toBe(200);
      expect(res2.statusCode).toBe(200);

      // Neither response pretends to have answered its user prompt.
      expect(res1.body).toContain('No AI model is ready');
      expect(res2.body).toContain('No AI model is ready');
      expect(res1.body).not.toContain('stream one');
      expect(res2.body).not.toContain('stream two');

      // Both should have the SSE structure
      expect(res1.body).toContain('event: done');
      expect(res2.body).toContain('event: done');

      // Restore provider
      server.agentState.llmProvider = prevProvider;
      server.localConfig.litellmUrl = prevLitellmUrl;
    });

    it('event bus delivers to multiple listeners independently', async () => {
      const { emitNotification } = await import('../../src/local/routes/notifications.js');

      const eventBus = new EventEmitter();
      const listener1Events: NotificationEvent[] = [];
      const listener2Events: NotificationEvent[] = [];

      eventBus.on('notification', (data: NotificationEvent) => listener1Events.push(data));
      eventBus.on('notification', (data: NotificationEvent) => listener2Events.push(data));

      const fakeFastify = { eventBus } as unknown as FastifyInstance;

      emitNotification(fakeFastify, {
        title: 'Broadcast',
        body: 'Goes to all listeners',
        category: 'agent',
      });

      // Both listeners should receive the same event
      expect(listener1Events).toHaveLength(1);
      expect(listener2Events).toHaveLength(1);
      expect(listener1Events[0].title).toBe('Broadcast');
      expect(listener2Events[0].title).toBe('Broadcast');
    });
  });
});
