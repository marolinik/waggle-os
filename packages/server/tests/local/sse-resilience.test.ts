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
import type { ToolDefinition } from '@waggle/agent';
import { buildLocalServer } from '../../src/local/index.js';
import type { FastifyInstance } from 'fastify';
import type { LlmProviderStatus } from '../../src/local/index.js';
import type {
  NotificationEvent,
  SubagentStatusEvent,
} from '../../src/local/routes/notifications.js';
import { injectWithAuth } from '../test-utils.js';
import { PROVIDER_ENV_NAMES } from '../../src/local/provider-env.js';
import { chatSessionStateKey } from '../../src/local/routes/chat-persistence.js';

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

    it('scopes concurrent pathless chat turns to the shared home root', async () => {
      const prevProvider = server.agentState.llmProvider;
      const prevLitellmUrl = server.localConfig.litellmUrl;
      const createScopeSpy = vi.spyOn(
        server.agentState.workspaceTurnCoordinator,
        'createScope',
      );
      server.agentState.llmProvider = ECHO_MODE_PROVIDER;
      server.localConfig.litellmUrl = 'http://127.0.0.1:1';

      try {
        const responses = await Promise.all([
          injectWithAuth(server, {
            method: 'POST',
            url: '/api/chat',
            payload: { message: 'pathless one', session: 'pathless-home-one' },
          }),
          injectWithAuth(server, {
            method: 'POST',
            url: '/api/chat',
            payload: { message: 'pathless two', session: 'pathless-home-two' },
          }),
        ]);

        expect(responses.map(response => response.statusCode)).toEqual([200, 200]);
        expect(createScopeSpy).toHaveBeenCalledTimes(2);
        expect(createScopeSpy.mock.calls.map(([root]) => root)).toEqual([
          os.homedir(),
          os.homedir(),
        ]);
      } finally {
        createScopeSpy.mockRestore();
        server.agentState.llmProvider = prevProvider;
        server.localConfig.litellmUrl = prevLitellmUrl;
      }
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

    it('uses a newly verified local Ollama model even while startup provider status is stale', async () => {
      const prevProvider = server.agentState.llmProvider;
      const prevCurrentModel = server.agentState.currentModel;
      const prevLitellmUrl = server.localConfig.litellmUrl;
      const prevOllamaHost = process.env.OLLAMA_HOST;
      const providerEnv = [...new Set(Object.values(PROVIDER_ENV_NAMES).flat())];
      const previousEnv = new Map(providerEnv.map((name) => [name, process.env[name]]));
      for (const name of providerEnv) delete process.env[name];

      server.agentState.llmProvider = {
        provider: 'anthropic-proxy',
        health: 'degraded',
        detail: 'Built-in provider proxy (no API key)',
        checkedAt: new Date().toISOString(),
      };
      server.agentState.currentModel = 'ollama/local-test';
      server.localConfig.litellmUrl = 'http://proxy.test/v1';
      process.env.OLLAMA_HOST = 'http://ollama.test';

      const completionUrls: string[] = [];
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
        const url = String(input);
        if (url.endsWith('/api/tags')) {
          return new Response(JSON.stringify({ models: [{ name: 'local-test' }] }), {
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
        if (url.endsWith('/chat/completions')) {
          completionUrls.push(url);
          const stream = 'data: {"choices":[{"delta":{"content":"Local model ready"}}]}\n\ndata: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n';
          return new Response(stream, {
            status: 200,
            headers: { 'Content-Type': 'text/event-stream' },
          });
        }
        return new Response('', { status: 503 });
      });

      try {
        const res = await injectWithAuth(server, {
          method: 'POST',
          url: '/api/chat',
          payload: { message: 'Use the newly installed model', model: 'ollama/local-test' },
        });

        expect(res.statusCode).toBe(200);
        expect(res.body).toContain('event: done');
        expect(res.body).toContain('Local model ready');
        expect(res.body).not.toContain('No AI model is ready');
        expect(completionUrls).toEqual(['http://ollama.test/v1/chat/completions']);
      } finally {
        fetchSpy.mockRestore();
        server.agentState.llmProvider = prevProvider;
        server.agentState.currentModel = prevCurrentModel;
        server.localConfig.litellmUrl = prevLitellmUrl;
        if (prevOllamaHost === undefined) delete process.env.OLLAMA_HOST;
        else process.env.OLLAMA_HOST = prevOllamaHost;
        for (const [name, value] of previousEnv) {
          if (value === undefined) delete process.env[name];
          else process.env[name] = value;
        }
      }
    });

    it('sends only global and active-workspace MCP tools to the model', async () => {
      const prevProvider = server.agentState.llmProvider;
      const prevCurrentModel = server.agentState.currentModel;
      const prevLitellmUrl = server.localConfig.litellmUrl;
      const prevMcpRuntime = server.agentState.mcpRuntime;
      const prevOllamaHost = process.env.OLLAMA_HOST;
      const makeTool = (name: string): ToolDefinition => ({
        name,
        description: name,
        parameters: { type: 'object', properties: {} },
        execute: async () => 'ok',
      });
      const globalTool = makeTool('mcp_global_search');
      const activeTool = makeTool('mcp_default_write');
      const foreignTool = makeTool('mcp_other_workspace_admin');
      const getAllTools = vi.fn(() => [globalTool, activeTool, foreignTool]);
      const getToolsForWorkspace = vi.fn((workspaceId: string) =>
        workspaceId === 'default' ? [globalTool, activeTool] : [globalTool, foreignTool]);
      server.agentState.mcpRuntime = {
        getAllTools,
        getToolsForWorkspace,
        getServerStates: () => ({}),
      } as unknown as typeof server.agentState.mcpRuntime;
      server.agentState.llmProvider = {
        provider: 'anthropic-proxy',
        health: 'degraded',
        detail: 'Built-in provider proxy (no API key)',
        checkedAt: new Date().toISOString(),
      };
      server.agentState.currentModel = 'ollama/local-test';
      server.localConfig.litellmUrl = 'http://proxy.test/v1';
      process.env.OLLAMA_HOST = 'http://ollama.test';

      let transmittedToolNames: string[] = [];
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
        const url = String(input);
        if (url.endsWith('/api/tags')) {
          return new Response(JSON.stringify({ models: [{ name: 'local-test' }] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        if (url.endsWith('/chat/completions')) {
          const body = JSON.parse(String(init?.body ?? '{}')) as {
            tools?: Array<{ function?: { name?: string } }>;
          };
          transmittedToolNames = body.tools?.flatMap(tool => tool.function?.name ?? []) ?? [];
          const stream = 'data: {"choices":[{"delta":{"content":"Workspace tools ready"}}]}\n\ndata: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n';
          return new Response(stream, {
            status: 200,
            headers: { 'Content-Type': 'text/event-stream' },
          });
        }
        return new Response('', { status: 503 });
      });

      try {
        const res = await injectWithAuth(server, {
          method: 'POST',
          url: '/api/chat',
          payload: {
            message: 'Execute the mcp_global_search tool and the mcp_default_write tool',
            model: 'ollama/local-test',
          },
        });

        expect(res.statusCode).toBe(200);
        expect(transmittedToolNames).toContain(globalTool.name);
        expect(transmittedToolNames).toContain(activeTool.name);
        expect(transmittedToolNames).not.toContain(foreignTool.name);
        expect(getToolsForWorkspace).toHaveBeenCalledWith('default');
        expect(getAllTools).not.toHaveBeenCalled();
      } finally {
        fetchSpy.mockRestore();
        server.agentState.llmProvider = prevProvider;
        server.agentState.currentModel = prevCurrentModel;
        server.agentState.mcpRuntime = prevMcpRuntime;
        server.localConfig.litellmUrl = prevLitellmUrl;
        if (prevOllamaHost === undefined) delete process.env.OLLAMA_HOST;
        else process.env.OLLAMA_HOST = prevOllamaHost;
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
    it('isolates production agent runtimes for two sessions in the same workspace', async () => {
      const workspaceResponse = await injectWithAuth(server, {
        method: 'POST',
        url: '/api/workspaces',
        payload: { name: 'Concurrent Runtime Test', group: 'Test' },
      });
      expect(workspaceResponse.statusCode).toBe(201);
      const workspaceId = (workspaceResponse.json() as { id: string }).id;

      const previousProvider = server.agentState.llmProvider;
      const previousCurrentModel = server.agentState.currentModel;
      const previousLitellmUrl = server.localConfig.litellmUrl;
      const previousOllamaHost = process.env.OLLAMA_HOST;
      const previousReranker = process.env.WAGGLE_RERANKER;

      server.agentState.llmProvider = {
        provider: 'ollama',
        health: 'healthy',
        detail: 'Test Ollama provider',
        checkedAt: new Date().toISOString(),
      };
      server.agentState.currentModel = 'ollama/local-a';
      server.localConfig.litellmUrl = 'http://proxy.test/v1';
      process.env.OLLAMA_HOST = 'http://ollama.test';
      process.env.WAGGLE_RERANKER = '0';

      const deferred = () => {
        let resolve!: () => void;
        const promise = new Promise<void>((done) => { resolve = done; });
        return { promise, resolve };
      };
      const aSecondArrived = deferred();
      const bSecondArrived = deferred();
      const aThirdArrived = deferred();
      const bRequestCompleted = deferred();
      const providerBodies = new Map<'A' | 'B', Array<{
        model?: string;
        messages?: Array<{ role?: string; content?: string }>;
        tools?: Array<{ function?: { name?: string } }>;
      }>>([['A', []], ['B', []]]);

      const streamResponse = (chunks: unknown[]) => new Response(
        `${chunks.map(chunk => `data: ${JSON.stringify(chunk)}\n\n`).join('')}data: [DONE]\n\n`,
        { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
      );
      const toolResponse = (id: string, name: string, args: Record<string, unknown>) => streamResponse([
        {
          choices: [{
            delta: {
              tool_calls: [{
                index: 0,
                id,
                type: 'function',
                function: { name, arguments: JSON.stringify(args) },
              }],
            },
          }],
        },
        {
          choices: [{ delta: {}, finish_reason: 'tool_calls' }],
          usage: { prompt_tokens: 10, completion_tokens: 2 },
        },
      ]);
      const finalResponse = (content: string) => streamResponse([
        { choices: [{ delta: { content } }] },
        {
          choices: [{ delta: {}, finish_reason: 'stop' }],
          usage: { prompt_tokens: 10, completion_tokens: 2 },
        },
      ]);

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
        const url = String(input);
        if (url.endsWith('/api/tags')) {
          return new Response(JSON.stringify({ models: [{ name: 'local-a' }, { name: 'local-b' }] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        if (!url.endsWith('/chat/completions')) return new Response('', { status: 503 });

        const body = JSON.parse(String(init?.body ?? '{}')) as {
          model?: string;
          messages?: Array<{ role?: string; content?: string }>;
          tools?: Array<{ function?: { name?: string } }>;
        };
        const contents = (body.messages ?? []).map(message => message.content ?? '').join('\n');
        const session = contents.includes('SESSION_A') ? 'A' : contents.includes('SESSION_B') ? 'B' : null;
        if (!session) throw new Error('Provider request did not contain a session marker');
        const bodies = providerBodies.get(session)!;
        bodies.push(body);
        const call = bodies.length;

        if (session === 'A' && call === 1) {
          return toolResponse('call-a-create', 'create_plan', { title: 'Plan A' });
        }
        if (session === 'A' && call === 2) {
          aSecondArrived.resolve();
          await bSecondArrived.promise;
          return toolResponse('call-a-add', 'add_plan_step', { title: 'A_ONLY' });
        }
        if (session === 'A' && call === 3) {
          aThirdArrived.resolve();
          await bRequestCompleted.promise;
          return finalResponse('SESSION_A complete');
        }
        if (session === 'B' && call === 1) {
          await aSecondArrived.promise;
          return toolResponse('call-b-create', 'create_plan', { title: 'Plan B' });
        }
        if (session === 'B' && call === 2) {
          bSecondArrived.resolve();
          await aThirdArrived.promise;
          return toolResponse('call-b-show', 'show_plan', {});
        }
        if (session === 'B' && call === 3) {
          return finalResponse('SESSION_B complete');
        }
        throw new Error(`Unexpected provider call ${session}#${call}`);
      });

      const completionOrder: string[] = [];
      const requestA = injectWithAuth(server, {
        method: 'POST',
        url: '/api/chat',
        payload: {
          workspace: workspaceId,
          session: 'concurrent-a',
          persona: 'project-manager',
          model: 'ollama/local-a',
          autonomy: { level: 'yolo' },
          message: 'SESSION_A: use create_plan, then add_plan_step with A_ONLY.',
        },
      }).then(response => {
        completionOrder.push('A');
        return response;
      });
      const requestB = injectWithAuth(server, {
        method: 'POST',
        url: '/api/chat',
        payload: {
          workspace: workspaceId,
          session: 'concurrent-b',
          persona: 'project-manager',
          model: 'ollama/local-b',
          autonomy: { level: 'yolo' },
          message: 'SESSION_B: execute create_plan for Plan B, then execute show_plan immediately.',
        },
      }).then(response => {
        completionOrder.push('B');
        bRequestCompleted.resolve();
        return response;
      });
      let overlapTimeout: ReturnType<typeof setTimeout> | undefined;

      try {
        const [responseA, responseB] = await Promise.race([
          Promise.all([requestA, requestB]),
          new Promise<never>((_, reject) => {
            overlapTimeout = setTimeout(
              () => reject(new Error('Concurrent production-runtime barriers did not complete')),
              10_000,
            );
          }),
        ]);

        expect(responseA.statusCode).toBe(200);
        expect(responseB.statusCode).toBe(200);
        expect(completionOrder).toEqual(['B', 'A']);
        expect(responseA.body).toContain('SESSION_A complete');
        expect(responseB.body).toContain('SESSION_B complete');

        const bCreateResult = providerBodies.get('B')![1]?.messages
          ?.filter(message => message.role === 'tool')
          .at(-1)?.content;
        const bShowResult = providerBodies.get('B')![2]?.messages
          ?.filter(message => message.role === 'tool')
          .at(-1)?.content;
        expect(bCreateResult).toContain('Plan created: Plan B');
        expect(bShowResult).toContain('Plan has no steps.');
        expect(bShowResult).not.toContain('A_ONLY');

        const firstSystemPromptA = providerBodies.get('A')![0]?.messages?.[0]?.content;
        const firstSystemPromptB = providerBodies.get('B')![0]?.messages?.[0]?.content;
        const firstToolNamesA = providerBodies.get('A')![0]?.tools?.map(tool => tool.function?.name);
        const firstToolNamesB = providerBodies.get('B')![0]?.tools?.map(tool => tool.function?.name);
        expect(firstToolNamesA).toEqual(expect.arrayContaining(['create_plan', 'add_plan_step']));
        expect(firstToolNamesB).toEqual(expect.arrayContaining(['create_plan', 'show_plan']));
        expect(firstSystemPromptA).toContain('Model: ollama/local-a');
        expect(firstSystemPromptB).toContain('Model: ollama/local-b');
        expect(firstSystemPromptA).not.toContain('Model: ollama/local-b');
        expect(firstSystemPromptB).not.toContain('Model: ollama/local-a');
        expect(firstSystemPromptA).not.toContain('Model: unknown');
        expect(firstSystemPromptB).not.toContain('Model: unknown');
      } finally {
        if (overlapTimeout) clearTimeout(overlapTimeout);
        aSecondArrived.resolve();
        bSecondArrived.resolve();
        aThirdArrived.resolve();
        bRequestCompleted.resolve();
        await Promise.allSettled([requestA, requestB]);
        fetchSpy.mockRestore();
        server.agentState.llmProvider = previousProvider;
        server.agentState.currentModel = previousCurrentModel;
        server.localConfig.litellmUrl = previousLitellmUrl;
        if (previousOllamaHost === undefined) delete process.env.OLLAMA_HOST;
        else process.env.OLLAMA_HOST = previousOllamaHost;
        if (previousReranker === undefined) delete process.env.WAGGLE_RERANKER;
        else process.env.WAGGLE_RERANKER = previousReranker;
        await injectWithAuth(server, { method: 'DELETE', url: `/api/workspaces/${workspaceId}` });
      }
    }, 30_000);

    it('queues checkout mutations across sessions while knowledge-only chat stays concurrent', async () => {
      const workspaceRoot = path.join(tmpDir, 'shared-coder-workspace');
      fs.mkdirSync(workspaceRoot, { recursive: true });
      const sharedFile = path.join(workspaceRoot, 'shared.txt');
      fs.writeFileSync(sharedFile, 'v0', 'utf-8');

      const workspaceResponse = await injectWithAuth(server, {
        method: 'POST',
        url: '/api/workspaces',
        payload: {
          name: 'Shared Coder Queue Test',
          group: 'Test',
          directory: workspaceRoot,
          storageType: 'local',
          storagePath: workspaceRoot,
        },
      });
      expect(workspaceResponse.statusCode).toBe(201);
      const workspaceId = (workspaceResponse.json() as { id: string }).id;

      const previousProvider = server.agentState.llmProvider;
      const previousCurrentModel = server.agentState.currentModel;
      const previousLitellmUrl = server.localConfig.litellmUrl;
      const previousOllamaHost = process.env.OLLAMA_HOST;
      const previousReranker = process.env.WAGGLE_RERANKER;

      server.agentState.llmProvider = {
        provider: 'ollama',
        health: 'healthy',
        detail: 'Test Ollama provider',
        checkedAt: new Date().toISOString(),
      };
      server.agentState.currentModel = 'ollama/local-queue';
      server.localConfig.litellmUrl = 'http://proxy.test/v1';
      process.env.OLLAMA_HOST = 'http://ollama.test';
      process.env.WAGGLE_RERANKER = '0';

      const deferred = () => {
        let resolve!: () => void;
        const promise = new Promise<void>((done) => { resolve = done; });
        return { promise, resolve };
      };
      const aHeldAfterEdit = deferred();
      const releaseA = deferred();
      const bProviderEntered = deferred();
      const calls = new Map<'A' | 'B' | 'C', number>([['A', 0], ['B', 0], ['C', 0]]);
      let bReadResult = '';
      let cMemoryResult = '';

      const streamResponse = (chunks: unknown[]) => new Response(
        `${chunks.map(chunk => `data: ${JSON.stringify(chunk)}\n\n`).join('')}data: [DONE]\n\n`,
        { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
      );
      const toolResponse = (id: string, name: string, args: Record<string, unknown>) => streamResponse([
        {
          choices: [{
            delta: {
              tool_calls: [{
                index: 0,
                id,
                type: 'function',
                function: { name, arguments: JSON.stringify(args) },
              }],
            },
          }],
        },
        {
          choices: [{ delta: {}, finish_reason: 'tool_calls' }],
          usage: { prompt_tokens: 10, completion_tokens: 2 },
        },
      ]);
      const finalResponse = (content: string) => streamResponse([
        { choices: [{ delta: { content } }] },
        {
          choices: [{ delta: {}, finish_reason: 'stop' }],
          usage: { prompt_tokens: 10, completion_tokens: 2 },
        },
      ]);

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
        const url = String(input);
        if (url.endsWith('/api/tags')) {
          return new Response(JSON.stringify({ models: [{ name: 'local-queue' }] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        if (!url.endsWith('/chat/completions')) return new Response('', { status: 503 });

        const body = JSON.parse(String(init?.body ?? '{}')) as {
          messages?: Array<{ role?: string; content?: string }>;
        };
        const contents = (body.messages ?? []).map(entry => entry.content ?? '').join('\n');
        const session = contents.includes('QUEUE_SESSION_A')
          ? 'A'
          : contents.includes('QUEUE_SESSION_B')
            ? 'B'
            : contents.includes('QUEUE_SESSION_C') ? 'C' : null;
        if (!session) throw new Error('Provider request did not contain a queue-test marker');
        const call = (calls.get(session) ?? 0) + 1;
        calls.set(session, call);

        if (session === 'A' && call === 1) {
          return toolResponse('queue-a-read', 'read_file', { path: 'shared.txt' });
        }
        if (session === 'A' && call === 2) {
          return toolResponse('queue-a-edit', 'edit_file', {
            path: 'shared.txt', old_string: 'v0', new_string: 'v1',
          });
        }
        if (session === 'A' && call === 3) {
          aHeldAfterEdit.resolve();
          await releaseA.promise;
          return finalResponse('QUEUE_SESSION_A complete');
        }
        if (session === 'B' && call === 1) {
          bProviderEntered.resolve();
          return toolResponse('queue-b-read', 'read_file', { path: 'shared.txt' });
        }
        if (session === 'B' && call === 2) {
          bReadResult = body.messages
            ?.filter(entry => entry.role === 'tool')
            .at(-1)?.content ?? '';
          return toolResponse('queue-b-edit', 'edit_file', {
            path: 'shared.txt', old_string: 'v1', new_string: 'v2',
          });
        }
        if (session === 'B' && call === 3) {
          return finalResponse('QUEUE_SESSION_B complete');
        }
        if (session === 'C' && call === 1) {
          await Promise.race([
            bProviderEntered.promise,
            new Promise<void>(resolve => setTimeout(resolve, 250)),
          ]);
          return toolResponse('queue-c-memory', 'search_memory', {
            query: 'SSE resilience frame',
          });
        }
        if (session === 'C' && call === 2) {
          cMemoryResult = body.messages
            ?.filter(entry => entry.role === 'tool')
            .at(-1)?.content ?? '';
          return finalResponse('QUEUE_SESSION_C complete');
        }
        throw new Error(`Unexpected queue-test provider call ${session}#${call}`);
      });

      const requestA = injectWithAuth(server, {
        method: 'POST',
        url: '/api/chat',
        payload: {
          workspace: workspaceId,
          session: 'queue-session-a',
          persona: 'coder',
          model: 'ollama/local-queue',
          autonomy: { level: 'yolo' },
          message: 'QUEUE_SESSION_A: read shared.txt, then edit_file from v0 to v1.',
        },
      });
      let requestB: ReturnType<typeof injectWithAuth> | undefined;
      let requestC: ReturnType<typeof injectWithAuth> | undefined;

      try {
        await Promise.race([
          aHeldAfterEdit.promise,
          new Promise<never>((_, reject) => setTimeout(
            () => reject(new Error('First coder session did not reach its held completion')),
            5_000,
          )),
        ]);
        expect(fs.readFileSync(sharedFile, 'utf-8')).toBe('v1');

        requestB = injectWithAuth(server, {
          method: 'POST',
          url: '/api/chat',
          payload: {
            workspace: workspaceId,
            session: 'queue-session-b',
            persona: 'coder',
            model: 'ollama/local-queue',
            autonomy: { level: 'yolo' },
            message: 'QUEUE_SESSION_B: read shared.txt, then edit_file from v1 to v2.',
          },
        });
        requestC = injectWithAuth(server, {
          method: 'POST',
          url: '/api/chat',
          payload: {
            workspace: workspaceId,
            session: 'queue-session-c',
            model: 'ollama/local-queue',
            message: 'QUEUE_SESSION_C: search my memory for SSE resilience frame, then summarize it.',
          },
        });

        const responseC = await Promise.race([
          requestC,
          new Promise<never>((_, reject) => setTimeout(
            () => reject(new Error('Knowledge-only session was blocked by the coder lease')),
            5_000,
          )),
        ]);
        expect(responseC.body).toContain('QUEUE_SESSION_C complete');
        expect(cMemoryResult).toContain('SSE resilience test frame');
        expect(calls.get('B')).toBe(0);

        releaseA.resolve();
        const [responseA, responseB] = await Promise.all([requestA, requestB]);
        expect(responseA.body).toContain('QUEUE_SESSION_A complete');
        expect(responseB.body).toContain('QUEUE_SESSION_B complete');
        expect(responseB.body).toContain('Waiting for another agent to finish editing this workspace');
        expect(bReadResult).toContain('v1');
        expect(fs.readFileSync(sharedFile, 'utf-8')).toBe('v2');
      } finally {
        releaseA.resolve();
        await Promise.allSettled([requestA, requestB, requestC].filter(Boolean) as Promise<unknown>[]);
        fetchSpy.mockRestore();
        server.agentState.llmProvider = previousProvider;
        server.agentState.currentModel = previousCurrentModel;
        server.localConfig.litellmUrl = previousLitellmUrl;
        if (previousOllamaHost === undefined) delete process.env.OLLAMA_HOST;
        else process.env.OLLAMA_HOST = previousOllamaHost;
        if (previousReranker === undefined) delete process.env.WAGGLE_RERANKER;
        else process.env.WAGGLE_RERANKER = previousReranker;
        await injectWithAuth(server, { method: 'DELETE', url: `/api/workspaces/${workspaceId}` });
      }
    }, 30_000);

    it('serializes default-alias and path-only chat turns over the same checkout', async () => {
      const workspaceRoot = path.join(tmpDir, 'legacy-shared-coder-workspace');
      fs.mkdirSync(workspaceRoot, { recursive: true });
      const sharedFile = path.join(workspaceRoot, 'shared.txt');
      fs.writeFileSync(sharedFile, 'v0', 'utf-8');

      const previousProvider = server.agentState.llmProvider;
      const previousCurrentModel = server.agentState.currentModel;
      const previousLitellmUrl = server.localConfig.litellmUrl;
      const previousOllamaHost = process.env.OLLAMA_HOST;
      const previousReranker = process.env.WAGGLE_RERANKER;

      server.agentState.llmProvider = {
        provider: 'ollama',
        health: 'healthy',
        detail: 'Test Ollama provider',
        checkedAt: new Date().toISOString(),
      };
      server.agentState.currentModel = 'ollama/local-legacy-queue';
      server.localConfig.litellmUrl = 'http://proxy.test/v1';
      process.env.OLLAMA_HOST = 'http://ollama.test';
      process.env.WAGGLE_RERANKER = '0';

      const deferred = () => {
        let resolve!: () => void;
        const promise = new Promise<void>((done) => { resolve = done; });
        return { promise, resolve };
      };
      const aReadObserved = deferred();
      const releaseAEdit = deferred();
      const bReadObserved = deferred();
      const releaseBEdit = deferred();
      const secondAcquireRequested = deferred();
      const calls = new Map<'A' | 'B', number>([['A', 0], ['B', 0]]);
      let aReadResult = '';
      let bReadResult = '';
      let acquireCount = 0;

      const coordinator = server.agentState.workspaceTurnCoordinator;
      const originalCreateScope = coordinator.createScope.bind(coordinator);
      const createScopeSpy = vi.spyOn(coordinator, 'createScope').mockImplementation(
        (workspacePath, signal) => {
          const scope = originalCreateScope(workspacePath, signal);
          const originalAcquire = scope.acquire.bind(scope);
          scope.acquire = async (access, onQueued) => {
            acquireCount += 1;
            if (acquireCount === 2) secondAcquireRequested.resolve();
            return originalAcquire(access, onQueued);
          };
          return scope;
        },
      );

      const streamResponse = (chunks: unknown[]) => new Response(
        `${chunks.map(chunk => `data: ${JSON.stringify(chunk)}\n\n`).join('')}data: [DONE]\n\n`,
        { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
      );
      const toolResponse = (id: string, name: string, args: Record<string, unknown>) => streamResponse([
        {
          choices: [{
            delta: {
              tool_calls: [{
                index: 0,
                id,
                type: 'function',
                function: { name, arguments: JSON.stringify(args) },
              }],
            },
          }],
        },
        {
          choices: [{ delta: {}, finish_reason: 'tool_calls' }],
          usage: { prompt_tokens: 10, completion_tokens: 2 },
        },
      ]);
      const finalResponse = (content: string) => streamResponse([
        { choices: [{ delta: { content } }] },
        {
          choices: [{ delta: {}, finish_reason: 'stop' }],
          usage: { prompt_tokens: 10, completion_tokens: 2 },
        },
      ]);

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
        const url = String(input);
        if (url.endsWith('/api/tags')) {
          return new Response(JSON.stringify({ models: [{ name: 'local-legacy-queue' }] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        if (!url.endsWith('/chat/completions')) return new Response('', { status: 503 });

        const body = JSON.parse(String(init?.body ?? '{}')) as {
          messages?: Array<{ role?: string; content?: string }>;
        };
        const contents = (body.messages ?? []).map(entry => entry.content ?? '').join('\n');
        const session = contents.includes('LEGACY_ALIAS_SESSION_A')
          ? 'A'
          : contents.includes('LEGACY_PATH_SESSION_B') ? 'B' : null;
        if (!session) throw new Error('Provider request did not contain a legacy queue-test marker');
        const call = (calls.get(session) ?? 0) + 1;
        calls.set(session, call);

        if (session === 'A' && call === 1) {
          return toolResponse('legacy-a-read', 'read_file', { path: 'shared.txt' });
        }
        if (session === 'A' && call === 2) {
          aReadResult = body.messages
            ?.filter(entry => entry.role === 'tool')
            .at(-1)?.content ?? '';
          aReadObserved.resolve();
          await releaseAEdit.promise;
          return toolResponse('legacy-a-edit', 'edit_file', {
            path: 'shared.txt', old_string: 'v0', new_string: 'v1',
          });
        }
        if (session === 'A' && call === 3) {
          return finalResponse('LEGACY_ALIAS_SESSION_A complete');
        }
        if (session === 'B' && call === 1) {
          return toolResponse('legacy-b-read', 'read_file', { path: 'shared.txt' });
        }
        if (session === 'B' && call === 2) {
          bReadResult = body.messages
            ?.filter(entry => entry.role === 'tool')
            .at(-1)?.content ?? '';
          bReadObserved.resolve();
          await releaseBEdit.promise;
          return toolResponse('legacy-b-edit', 'edit_file', {
            path: 'shared.txt', old_string: 'v1', new_string: 'v2',
          });
        }
        if (session === 'B' && call === 3) {
          return finalResponse('LEGACY_PATH_SESSION_B complete');
        }
        throw new Error(`Unexpected legacy queue-test provider call ${session}#${call}`);
      });

      const requestA = injectWithAuth(server, {
        method: 'POST',
        url: '/api/chat',
        payload: {
          workspace: 'default',
          workspacePath: workspaceRoot,
          session: 'legacy-default-alias-a',
          persona: 'coder',
          model: 'ollama/local-legacy-queue',
          autonomy: { level: 'yolo' },
          message: 'LEGACY_ALIAS_SESSION_A: read shared.txt, then edit_file from v0 to v1.',
        },
      });
      let requestB: ReturnType<typeof injectWithAuth> | undefined;

      try {
        await Promise.race([
          aReadObserved.promise,
          new Promise<never>((_, reject) => setTimeout(
            () => reject(new Error('Default-alias chat did not reach its held stale-read boundary')),
            5_000,
          )),
        ]);
        expect(aReadResult).toContain('v0');

        requestB = injectWithAuth(server, {
          method: 'POST',
          url: '/api/chat',
          payload: {
            workspacePath: workspaceRoot,
            session: 'legacy-path-only-b',
            persona: 'coder',
            model: 'ollama/local-legacy-queue',
            autonomy: { level: 'yolo' },
            message: 'LEGACY_PATH_SESSION_B: read shared.txt, then edit_file from v1 to v2.',
          },
        });

        const isolationOutcome = await Promise.race([
          secondAcquireRequested.promise.then(() => 'queued' as const),
          bReadObserved.promise.then(() => 'stale-read' as const),
          new Promise<never>((_, reject) => setTimeout(
            () => reject(new Error('Path-only chat neither queued nor reached the provider')),
            5_000,
          )),
        ]);
        expect({ isolationOutcome, bReadResult }).toEqual({
          isolationOutcome: 'queued',
          bReadResult: '',
        });

        releaseAEdit.resolve();
        const responseA = await requestA;
        expect(responseA.body).toContain('LEGACY_ALIAS_SESSION_A complete');

        releaseBEdit.resolve();
        const responseB = await requestB;
        expect(responseB.body).toContain('LEGACY_PATH_SESSION_B complete');
        expect(responseB.body).toContain('Waiting for another agent to finish editing this workspace');
        expect(bReadResult).toContain('v1');
        expect(fs.readFileSync(sharedFile, 'utf-8')).toBe('v2');
      } finally {
        releaseAEdit.resolve();
        releaseBEdit.resolve();
        await Promise.allSettled([requestA, requestB].filter(Boolean) as Promise<unknown>[]);
        fetchSpy.mockRestore();
        createScopeSpy.mockRestore();
        server.agentState.llmProvider = previousProvider;
        server.agentState.currentModel = previousCurrentModel;
        server.localConfig.litellmUrl = previousLitellmUrl;
        if (previousOllamaHost === undefined) delete process.env.OLLAMA_HOST;
        else process.env.OLLAMA_HOST = previousOllamaHost;
        if (previousReranker === undefined) delete process.env.WAGGLE_RERANKER;
        else process.env.WAGGLE_RERANKER = previousReranker;
      }
    }, 30_000);

    it('rejects an overlapping turn for the same workspace session before it mutates history', async () => {
      const workspaceResponse = await injectWithAuth(server, {
        method: 'POST',
        url: '/api/workspaces',
        payload: { name: 'Same Session Lease Test', group: 'Test' },
      });
      expect(workspaceResponse.statusCode).toBe(201);
      const workspaceId = (workspaceResponse.json() as { id: string }).id;
      const sessionId = 'same-session-overlap';

      const previousProvider = server.agentState.llmProvider;
      const previousCurrentModel = server.agentState.currentModel;
      const previousLitellmUrl = server.localConfig.litellmUrl;
      const previousOllamaHost = process.env.OLLAMA_HOST;
      const previousReranker = process.env.WAGGLE_RERANKER;

      server.agentState.llmProvider = {
        provider: 'ollama',
        health: 'healthy',
        detail: 'Test Ollama provider',
        checkedAt: new Date().toISOString(),
      };
      server.agentState.currentModel = 'ollama/local-same';
      server.localConfig.litellmUrl = 'http://proxy.test/v1';
      process.env.OLLAMA_HOST = 'http://ollama.test';
      process.env.WAGGLE_RERANKER = '0';

      const deferred = () => {
        let resolve!: () => void;
        const promise = new Promise<void>((done) => { resolve = done; });
        return { promise, resolve };
      };
      const providerEntered = deferred();
      const releaseFirst = deferred();
      let completionCalls = 0;
      const finalResponse = (content: string) => new Response(
        `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`
        + `data: ${JSON.stringify({
          choices: [{ delta: {}, finish_reason: 'stop' }],
          usage: { prompt_tokens: 10, completion_tokens: 2 },
        })}\n\ndata: [DONE]\n\n`,
        { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
      );

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
        const url = String(input);
        if (url.endsWith('/api/tags')) {
          return new Response(JSON.stringify({ models: [{ name: 'local-same' }] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        if (!url.endsWith('/chat/completions')) return new Response('', { status: 503 });
        completionCalls += 1;
        if (completionCalls === 1) {
          providerEntered.resolve();
          await releaseFirst.promise;
          return finalResponse('FIRST_COMPLETE');
        }
        return finalResponse('AFTER_COMPLETE');
      });

      const firstRequest = injectWithAuth(server, {
        method: 'POST',
        url: '/api/chat',
        payload: {
          workspace: workspaceId,
          session: sessionId,
          model: 'ollama/local-same',
          message: 'LEASE_FIRST',
        },
      });
      let secondRequest: ReturnType<typeof injectWithAuth> | undefined;

      try {
        await Promise.race([
          providerEntered.promise,
          new Promise<never>((_, reject) => setTimeout(
            () => reject(new Error('First same-session turn did not reach the provider')),
            5_000,
          )),
        ]);
        secondRequest = injectWithAuth(server, {
          method: 'POST',
          url: '/api/chat',
          payload: {
            workspace: workspaceId,
            session: sessionId,
            model: 'ollama/local-same',
            message: 'LEASE_SECOND',
          },
        });
        const secondResponse = await Promise.race([
          secondRequest,
          new Promise<never>((_, reject) => setTimeout(
            () => reject(new Error('Overlapping same-session turn was not rejected promptly')),
            5_000,
          )),
        ]);

        expect(secondResponse.statusCode).toBe(200);
        expect(secondResponse.body).toContain('event: error');
        expect(secondResponse.body).toContain('"code":"SESSION_TURN_IN_PROGRESS"');
        expect(secondResponse.body).not.toContain('event: done');
        expect(secondResponse.body).not.toContain('AFTER_COMPLETE');

        releaseFirst.resolve();
        const firstResponse = await firstRequest;
        expect(firstResponse.statusCode).toBe(200);
        expect(firstResponse.body).toContain('event: done');
        expect(firstResponse.body).toContain('FIRST_COMPLETE');
        expect(completionCalls).toBe(1);

        const historyResponse = await injectWithAuth(server, {
          method: 'GET',
          url: `/api/history?workspace=${workspaceId}&session=${sessionId}`,
        });
        expect(historyResponse.statusCode).toBe(200);
        expect(historyResponse.json().messages).toEqual([
          expect.objectContaining({ role: 'user', content: 'LEASE_FIRST' }),
          expect.objectContaining({ role: 'assistant', content: 'FIRST_COMPLETE' }),
        ]);

        const followUpResponse = await injectWithAuth(server, {
          method: 'POST',
          url: '/api/chat',
          payload: {
            workspace: workspaceId,
            session: sessionId,
            model: 'ollama/local-same',
            message: 'LEASE_AFTER_COMPLETE',
          },
        });
        expect(followUpResponse.statusCode).toBe(200);
        expect(followUpResponse.body).toContain('event: done');
        expect(followUpResponse.body).toContain('AFTER_COMPLETE');
        expect(completionCalls).toBe(2);
      } finally {
        releaseFirst.resolve();
        await Promise.allSettled([firstRequest, ...(secondRequest ? [secondRequest] : [])]);
        fetchSpy.mockRestore();
        server.agentState.llmProvider = previousProvider;
        server.agentState.currentModel = previousCurrentModel;
        server.localConfig.litellmUrl = previousLitellmUrl;
        if (previousOllamaHost === undefined) delete process.env.OLLAMA_HOST;
        else process.env.OLLAMA_HOST = previousOllamaHost;
        if (previousReranker === undefined) delete process.env.WAGGLE_RERANKER;
        else process.env.WAGGLE_RERANKER = previousReranker;
        await injectWithAuth(server, { method: 'DELETE', url: `/api/workspaces/${workspaceId}` });
      }
    }, 30_000);

    it('aborts an in-flight chat when its workspace session is paused', async () => {
      const workspaceResponse = await injectWithAuth(server, {
        method: 'POST',
        url: '/api/workspaces',
        payload: { name: 'Pause In Flight Test', group: 'Test' },
      });
      expect(workspaceResponse.statusCode).toBe(201);
      const workspaceId = (workspaceResponse.json() as { id: string }).id;
      const sessionId = 'pause-in-flight';

      const previousProvider = server.agentState.llmProvider;
      const previousCurrentModel = server.agentState.currentModel;
      const previousLitellmUrl = server.localConfig.litellmUrl;
      const previousOllamaHost = process.env.OLLAMA_HOST;
      const previousReranker = process.env.WAGGLE_RERANKER;

      server.agentState.llmProvider = {
        provider: 'ollama',
        health: 'healthy',
        detail: 'Test Ollama provider',
        checkedAt: new Date().toISOString(),
      };
      server.agentState.currentModel = 'ollama/local-pause';
      server.localConfig.litellmUrl = 'http://proxy.test/v1';
      process.env.OLLAMA_HOST = 'http://ollama.test';
      process.env.WAGGLE_RERANKER = '0';

      const deferred = () => {
        let resolve!: () => void;
        const promise = new Promise<void>((done) => { resolve = done; });
        return { promise, resolve };
      };
      const providerEntered = deferred();
      const providerAborted = deferred();
      const releaseProvider = deferred();
      let completionCalls = 0;
      let abortObserved = false;

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
        const url = String(input);
        if (url.endsWith('/api/tags')) {
          return new Response(JSON.stringify({ models: [{ name: 'local-pause' }] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        if (!url.endsWith('/chat/completions')) return new Response('', { status: 503 });
        completionCalls += 1;
        providerEntered.resolve();
        const signal = init?.signal;
        return await new Promise<Response>((resolve, reject) => {
          const onAbort = () => {
            abortObserved = true;
            providerAborted.resolve();
            reject(signal?.reason ?? new DOMException('Aborted', 'AbortError'));
          };
          if (signal?.aborted) {
            onAbort();
            return;
          }
          signal?.addEventListener('abort', onAbort, { once: true });
          void releaseProvider.promise.then(() => {
            signal?.removeEventListener('abort', onAbort);
            resolve(new Response(
              `data: ${JSON.stringify({ choices: [{ delta: { content: 'SHOULD_NOT_COMPLETE' } }] })}\n\n`
              + 'data: [DONE]\n\n',
              { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
            ));
          });
        });
      });

      const chatRequest = injectWithAuth(server, {
        method: 'POST',
        url: '/api/chat',
        payload: {
          workspace: workspaceId,
          session: sessionId,
          model: 'ollama/local-pause',
          message: 'PAUSE_ACTIVE_TURN',
        },
      });

      try {
        await Promise.race([
          providerEntered.promise,
          new Promise<never>((_, reject) => setTimeout(
            () => reject(new Error('Pause test turn did not reach the provider')),
            5_000,
          )),
        ]);
        const pauseResponse = await injectWithAuth(server, {
          method: 'POST',
          url: `/api/fleet/${workspaceId}/pause`,
        });
        expect(pauseResponse.statusCode).toBe(200);
        expect(pauseResponse.json()).toEqual({ paused: true, workspaceId });

        const abortWon = await Promise.race([
          providerAborted.promise.then(() => true),
          new Promise<false>((resolve) => setTimeout(() => resolve(false), 3_000)),
        ]);
        if (!abortWon) releaseProvider.resolve();
        const chatResponse = await Promise.race([
          chatRequest,
          new Promise<never>((_, reject) => setTimeout(
            () => reject(new Error('Paused chat did not finish promptly')),
            5_000,
          )),
        ]);

        expect(abortWon).toBe(true);
        expect(abortObserved).toBe(true);
        expect(completionCalls).toBe(1);
        expect(chatResponse.statusCode).toBe(200);
        expect(chatResponse.body).not.toContain('event: error');
        expect(chatResponse.body).not.toContain('event: done');
        expect(chatResponse.body).not.toContain('Generation failed:');
        expect(chatResponse.body).not.toContain('SHOULD_NOT_COMPLETE');

        const stateKey = chatSessionStateKey(workspaceId, sessionId);
        expect(server.agentState.sessionHistories.get(stateKey)).toEqual([
          { role: 'user', content: 'PAUSE_ACTIVE_TURN' },
        ]);
        server.agentState.sessionHistories.delete(stateKey);
        const coldHistory = await injectWithAuth(server, {
          method: 'GET',
          url: `/api/history?workspace=${workspaceId}&session=${sessionId}`,
        });
        expect(coldHistory.statusCode).toBe(200);
        expect(coldHistory.json().messages).toEqual([
          expect.objectContaining({ role: 'user', content: 'PAUSE_ACTIVE_TURN' }),
        ]);
      } finally {
        releaseProvider.resolve();
        await Promise.allSettled([chatRequest]);
        fetchSpy.mockRestore();
        server.agentState.llmProvider = previousProvider;
        server.agentState.currentModel = previousCurrentModel;
        server.localConfig.litellmUrl = previousLitellmUrl;
        if (previousOllamaHost === undefined) delete process.env.OLLAMA_HOST;
        else process.env.OLLAMA_HOST = previousOllamaHost;
        if (previousReranker === undefined) delete process.env.WAGGLE_RERANKER;
        else process.env.WAGGLE_RERANKER = previousReranker;
        await injectWithAuth(server, { method: 'DELETE', url: `/api/workspaces/${workspaceId}` });
      }
    }, 30_000);

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
          payload: { message: 'stream one', session: 'echo-concurrent-one' },
        }),
        injectWithAuth(server, {
          method: 'POST',
          url: '/api/chat',
          payload: { message: 'stream two', session: 'echo-concurrent-two' },
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
