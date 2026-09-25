import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
/**
 * Pass-through spy on the real agent loop (TD-CHAT-16 ruling 2). It throws a
 * scripted error only for the two pins whose failure no provider reply can
 * produce: an unclassified message, which the route maps to its generic
 * sentence. Every other turn runs the real loop against the fake provider.
 */
const loopSpy = vi.hoisted(() => ({
  failWith: null as Error | null,
}));

vi.mock('@waggle/agent', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@waggle/agent')>();
  return {
    ...actual,
    runAgentLoop: async (config: AgentLoopConfig) => {
      if (loopSpy.failWith) throw loopSpy.failWith;
      return actual.runAgentLoop(config);
    },
  };
});

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { MindDB, FrameStore, SessionStore, WaggleConfig } from '@waggle/core';
import { buildLocalServer } from '../src/local/index.js';
import type { FastifyInstance } from 'fastify';
import { getPersona, runAgentLoop, type AgentLoopConfig } from '@waggle/agent';
import { applyPersonaToolFilter } from '../src/local/persona-tool-filter.js';
import {
  applyContextWindow,
  filterGatedToolsForConversationalTurn,
  filterPluginToolsForConversationalTurn,
  isExplicitExternalResearchRequest,
  isExplicitGatedToolRequest,
  isExplicitMemoryRecallRequest,
  isExplicitMemorySaveRequest,
  shouldRequireCapabilityAcquisitionTools,
  MAX_CONTEXT_MESSAGES,
} from '../src/local/routes/chat.js';
import {
  chatHistoryDataDir,
  chatSessionStateKey,
  isolateLegacyDefaultChatSessions,
  loadSessionMessages,
  persistMessage,
  resolveChatHistoryTarget,
} from '../src/local/routes/chat-persistence.js';
import { GENERATION_FAILED_PREFIX } from '@waggle/shared';
import { getAuthToken, injectWithAuth, resetRateLimiter, parseSSE } from './test-utils.js';
import { installFakeLlmProvider, type FakeLlmProvider, type FakeLlmReply } from './helpers/fake-llm-provider.js';

// Split out of chat-api.test.ts by area so the suites run on parallel
// workers (TD-CHAT-16 ruling 12). Each part repeats the shared setup of
// describe('Chat Streaming API'); the tests are moved unchanged.
describe('Chat Streaming API', () => {
  let server: FastifyInstance;
  let tmpDir: string;
  /** Suite-wide model (TD-CHAT-16): answers every turn that runs the real loop. */
  let provider: FakeLlmProvider;
  const DEFAULT_REPLY: FakeLlmReply = {
    type: 'text',
    content: 'Hello world',
    chunks: ['Hello ', 'world'],
    usage: { inputTokens: 10, outputTokens: 5 },
  };
  /** A provider failure the route classifies by its HTTP status; 4xx never trips the circuit breaker. */
  const PROVIDER_400: FakeLlmReply = { type: 'http_error', status: 400, message: 'invalid tool call arguments' };

  // The /api/chat limiter keeps state across tests. Reset it before every one,
  // rather than in the 31 tests that happened to need it (TD-TEST-4).
  beforeEach(() => {
    resetRateLimiter(server);
  });

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-chat-test-'));

    server = await buildLocalServer({ dataDir: tmpDir });
    // No default runner: every turn runs the real agent loop against the fake
    // provider below unless a test injects its own (TD-CHAT-16).
    // Healthy built-in proxy WITHOUT a vault key: a key would enable the GEPA
    // optimizer, whose direct Anthropic calls hang behind the per-test fetch
    // stubs that answer 503 to unknown hosts (TD-CHAT-16 §6h).
    server.agentState.llmProvider = {
      provider: 'anthropic-proxy', health: 'healthy', detail: 'fake LLM provider', checkedAt: new Date().toISOString(),
    };
    server.llmRetryBackoffMs = () => 0;
    provider = installFakeLlmProvider({
      respond: DEFAULT_REPLY,
      // Several tests call this server over real HTTP with `fetch`; only model
      // calls (and the direct Anthropic API) belong to the fake.
      otherRequest: 'previous',
    });
  });

  afterAll(async () => {
    provider.restore();
    await server.close();
    // Small delay to release file locks on Windows
    await new Promise(r => setTimeout(r, 100));
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors on Windows (EBUSY)
    }
  });

  it('sends done event with full response', async () => {
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/chat',
      payload: { message: 'Hello' },
    });
    const events = parseSSE(res.body);
    const doneEvents = events.filter(e => e.event === 'done');
    expect(doneEvents.length).toBe(1);
    const doneData = JSON.parse(doneEvents[0].data);
    expect(doneData.content).toBe('Hello world');
    expect(doneData.usage).toEqual({ inputTokens: 10, outputTokens: 5 });
    expect(doneData.toolsUsed).toEqual([]);
    expect(Object.keys(doneData.contextMetrics).sort()).toEqual([
      'agentLatencyMs',
      'estimatedSystemPromptTokens',
      'estimatedToolSchemaTokens',
      'finalSystemPromptChars',
      'packageMode',
      'providerInputTokens',
      'providerOutputTokens',
      'selectorLatencyMs',
      'timeToFirstTokenMs',
      'toolCatalogCount',
      'toolEligibleCount',
      'toolOmittedCount',
      'toolSelectedCount',
      'totalServerLatencyMs',
      'transmittedToolSchemaChars',
    ].sort());
    // Re-pinned on the production path (TD-CHAT-16 ruling 3): the metrics now
    // describe the prompt package the real loop sent, not the injected runner's
    // 'custom' stub. A conversational 'Hello' is packaged compact and transmits
    // no tools from the full catalog.
    const sent = provider.requests.at(-1)!;
    expect(sent.toolNames).toEqual([]);
    expect(doneData.contextMetrics.toolCatalogCount).toBeGreaterThan(0);
    expect(doneData.contextMetrics).toMatchObject({
      toolEligibleCount: 0,
      toolSelectedCount: 0,
      toolOmittedCount: 0,
      transmittedToolSchemaChars: 0,
      estimatedToolSchemaTokens: 0,
      finalSystemPromptChars: sent.systemPrompt.length,
      estimatedSystemPromptTokens: Math.ceil(sent.systemPrompt.length / 4),
      packageMode: 'compact',
      providerInputTokens: 10,
      providerOutputTokens: 5,
    });
    expect(Number.isFinite(doneData.contextMetrics.selectorLatencyMs)).toBe(true);
    expect(Number.isFinite(doneData.contextMetrics.timeToFirstTokenMs)).toBe(true);
    expect(Number.isFinite(doneData.contextMetrics.agentLatencyMs)).toBe(true);
    expect(Number.isFinite(doneData.contextMetrics.totalServerLatencyMs)).toBe(true);
    expect(doneData.contextMetrics.totalServerLatencyMs).toBeGreaterThanOrEqual(
      doneData.contextMetrics.timeToFirstTokenMs,
    );
    expect(doneData.contextMetrics.totalServerLatencyMs).toBeGreaterThanOrEqual(
      doneData.contextMetrics.agentLatencyMs,
    );
  });

  it('allows a configured linked workspace directory outside managed storage', async () => {
    const linkedDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-linked-chat-'));
    const workspace = server.workspaceManager.create({
      name: `Linked chat ${Date.now()}`,
      group: 'test',
      directory: linkedDirectory,
    });
    const requestsBefore = provider.requests.length;

    try {
      const res = await injectWithAuth(server, {
        method: 'POST',
        url: '/api/chat',
        payload: {
          message: 'Inspect the linked workspace.',
          workspaceId: workspace.id,
          workspacePath: path.join(os.tmpdir(), 'request-path-must-not-override-config'),
        },
      });

      expect(res.statusCode).toBe(200);
      expect(parseSSE(res.body).some(event => event.event === 'done')).toBe(true);
      expect(provider.requests.length).toBeGreaterThan(requestsBefore);
    } finally {
      // The real turn opens a workspace session; the tier caps live ones.
      server.sessionManager.close(workspace.id);
      fs.rmSync(linkedDirectory, { recursive: true, force: true });
    }
  });

  it('denies sensitive system-tool reads for persisted directory and legacy storagePath links', async () => {
    const linkedDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-linked-secret-'));
    fs.writeFileSync(path.join(linkedDirectory, '.env'), 'LINKED_SECRET');
    fs.writeFileSync(path.join(linkedDirectory, 'README.md'), 'linked readme');
    const directoryWorkspace = server.workspaceManager.create({
      name: `Directory secret policy ${Date.now()}`,
      group: 'test',
      directory: linkedDirectory,
    });
    const storageWorkspace = server.workspaceManager.create({
      name: `StoragePath secret policy ${Date.now()}`,
      group: 'test',
    });
    server.workspaceManager.update(storageWorkspace.id, {
      storageType: 'local',
      storagePath: linkedDirectory,
    });

    try {
      for (const workspaceId of [directoryWorkspace.id, storageWorkspace.id]) {
        const workspaceTools = server.agentState.buildToolsForWorkspace(
          linkedDirectory,
          undefined,
          workspaceId,
        );
        const readFile = workspaceTools.find(tool => tool.name === 'read_file');
        expect(readFile).toBeDefined();
        expect(await readFile!.execute({ path: '.env' }), workspaceId)
          .toBe('Error: Access to sensitive file denied');
        expect(await readFile!.execute({ path: 'README.md' }), workspaceId)
          .toBe('linked readme');
      }
    } finally {
      fs.rmSync(linkedDirectory, { recursive: true, force: true });
    }
  });

  it('keeps connector discovery in the effective named-workspace persona pools', () => {
    const workspace = server.workspaceManager.create({
      name: `Connector discovery ${Date.now()}`,
      group: 'test',
    });
    const workspaceRoot = path.join(tmpDir, 'workspaces', workspace.id, 'files');
    const workspaceTools = server.agentState
      .buildToolsForWorkspace(workspaceRoot, undefined, workspace.id);

    for (const personaId of ['general-purpose', 'planner']) {
      const activePersona = getPersona(personaId);
      expect(activePersona).not.toBeNull();
      const names = applyPersonaToolFilter(workspaceTools, activePersona!).map(tool => tool.name);
      expect(names, personaId).toContain('find_connector');
      expect(names, personaId).toContain('list_connector_categories');
    }
  });

  it('keeps sensitive-name reads available in managed workspace storage', async () => {
    const workspace = server.workspaceManager.create({
      name: `Managed secret-name control ${Date.now()}`,
      group: 'test',
    });
    const managedRoot = path.join(tmpDir, 'workspaces', workspace.id, 'files');
    fs.mkdirSync(managedRoot, { recursive: true });
    fs.writeFileSync(path.join(managedRoot, '.env'), 'MANAGED_FIXTURE');

    const workspaceTools = server.agentState.buildToolsForWorkspace(
      managedRoot,
      undefined,
      workspace.id,
    );
    const readFile = workspaceTools.find(tool => tool.name === 'read_file');
    expect(readFile).toBeDefined();
    expect(await readFile!.execute({ path: '.env' })).toBe('MANAGED_FIXTURE');
  });

  it('protects the initial home-directory system-tool pool', async () => {
    const readFile = server.agentState.allTools.find(tool => tool.name === 'read_file');
    expect(readFile).toBeDefined();

    // This probe need not exist: the policy must reject it before touching disk.
    const result = await readFile!.execute({ path: `.env.waggle-policy-probe-${process.pid}` });
    expect(result).toBe('Error: Access to sensitive file denied');
  });

  it('fails closed when a configured linked workspace directory is unavailable', async () => {
    const missingDirectory = path.join(os.tmpdir(), `waggle-missing-linked-${Date.now()}`);
    const workspace = server.workspaceManager.create({
      name: `Missing linked chat ${Date.now()}`,
      group: 'test',
      directory: missingDirectory,
    });

    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/chat',
      payload: { message: 'Inspect the linked workspace.', workspaceId: workspace.id },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ code: 'WORKSPACE_ROOT_UNAVAILABLE' });
  });

  it('handles agent errors gracefully', async () => {
    // An unclassified message: no provider reply produces one (ruling 2).
    loopSpy.failWith = new Error('LiteLLM is not available');
    try {
      const res = await injectWithAuth(server, {
        method: 'POST',
        url: '/api/chat',
        payload: { message: 'Hello' },
      });

      const events = parseSSE(res.body);
      const errorEvents = events.filter(e => e.event === 'error');
      expect(errorEvents.length).toBe(1);
      const errorData = JSON.parse(errorEvents[0].data);
      expect(errorData.message).toBe('Something went wrong. Try sending your message again.');
    } finally {
      loopSpy.failWith = null;
    }
  });

  it.each([
    [
      'direct connection refusal',
      { type: 'network_error', message: 'connect ECONNREFUSED 10.33.0.153:4000' },
    ],
    [
      'proxied transport failure',
      { type: 'http_error', status: 502, message: 'openai-compatible API request failed: fetch failed' },
    ],
  ] as const)('maps %s to one actionable endpoint outage without raw transport or API-key advice', async (
    _case,
    failure,
  ) => {
    // The provider fails every retry, and each failure counts against the
    // server-lifetime circuit breaker, so each case gets its own server
    // (TD-CHAT-16 §5): the shared one must not open its breaker for later pins.
    const outageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-chat-outage-'));
    const outageServer = await buildLocalServer({ dataDir: outageDir });
    outageServer.agentState.llmProvider = {
      provider: 'anthropic-proxy', health: 'healthy', detail: 'fake LLM provider', checkedAt: new Date().toISOString(),
    };
    outageServer.llmRetryBackoffMs = () => 0;
    const workspaceId = outageServer.workspaceManager.create({
      name: `Endpoint outage ${_case} ${Date.now()}`,
      group: 'test',
    }).id;
    const sessionId = `endpoint-outage-${Date.now()}`;
    const requestsBefore = provider.requests.length;
    provider.respondWith(failure);

    try {
      const res = await injectWithAuth(outageServer, {
        method: 'POST',
        url: '/api/chat',
        payload: {
          message: 'Continue after the model endpoint recovers.',
          workspace: workspaceId,
          session: sessionId,
        },
      });

      const errorEvents = parseSSE(res.body).filter(event => event.event === 'error');
      expect(errorEvents).toHaveLength(1);
      const errorMessage = JSON.parse(errorEvents[0].data).message as string;
      expect(errorMessage).toBe(
        'The model endpoint is not responding. It may be down or restarting. Check Settings > Models, then try again.',
      );
      expect(errorMessage).not.toMatch(/api key|ECONNREFUSED|fetch failed|retry cap|502/i);
      expect(provider.requests.length).toBeGreaterThan(requestsBefore);

      const inMemory = outageServer.agentState.sessionHistories.get(
        chatSessionStateKey(workspaceId, sessionId),
      ) ?? [];
      expect(inMemory).toHaveLength(2);
      expect(inMemory[1]).toEqual({
        role: 'assistant',
        content: `${GENERATION_FAILED_PREFIX}${errorMessage}`,
      });
      expect(loadSessionMessages(outageDir, workspaceId, sessionId)).toEqual(inMemory);
    } finally {
      provider.respondWith(DEFAULT_REPLY);
      await outageServer.close();
      await new Promise(resolve => setTimeout(resolve, 100));
      fs.rmSync(outageDir, { recursive: true, force: true });
    }
  });

  // Re-pinned on the real path (TD-CHAT-16 ruling 13): the loop rejects a
  // blank no-tool answer itself, with its own message.
  it.each(['', ' \n\t'])('rejects a blank successful agent response %j', async (blankContent) => {
    const blankTag = blankContent.length === 0 ? 'empty' : 'whitespace';
    const workspaceId = server.workspaceManager.create({
      name: `Blank ${blankTag} ${Date.now()}`,
      group: 'test',
    }).id;
    const sessionId = `blank-session-${blankTag}-${Date.now()}`;
    const requestsBefore = provider.requests.length;
    provider.respondWith({
      type: 'text',
      content: blankContent,
      chunks: blankContent ? [blankContent] : [],
      usage: { inputTokens: 1, outputTokens: 1 },
    });

    try {
      const res = await injectWithAuth(server, {
        method: 'POST',
        url: '/api/chat',
        payload: {
          message: 'Return a substantive response.',
          workspace: workspaceId,
          session: sessionId,
        },
      });

      expect(res.statusCode).toBe(200);
      const events = parseSSE(res.body);
      expect(events.filter(event => event.event === 'done')).toHaveLength(0);
      expect(events.filter(event => event.event === 'token')).toHaveLength(0);
      const errorEvents = events.filter(event => event.event === 'error');
      expect(errorEvents).toHaveLength(1);
      expect(JSON.parse(errorEvents[0].data).message)
        .toBe('LLM returned an empty assistant response with no tool calls');
      expect(provider.requests.length).toBeGreaterThan(requestsBefore);

      const inMemory = server.agentState.sessionHistories.get(
        chatSessionStateKey(workspaceId, sessionId),
      ) ?? [];
      expect(inMemory).toHaveLength(2);
      expect(inMemory[0]).toMatchObject({
        role: 'user',
        content: 'Return a substantive response.',
      });
      expect(inMemory[1]).toMatchObject({ role: 'assistant' });
      expect(inMemory[1].content)
        .toBe(`${GENERATION_FAILED_PREFIX}LLM returned an empty assistant response with no tool calls`);
      expect(inMemory.some(message => message.role === 'assistant' && !message.content.trim())).toBe(false);

      const onDisk = loadSessionMessages(tmpDir, workspaceId, sessionId);
      expect(onDisk).toEqual(inMemory);
    } finally {
      provider.respondWith(DEFAULT_REPLY);
      server.sessionManager.close(workspaceId);
    }
  });

  it('persists an assistant error turn when generation fails', async () => {
    const workspaceId = server.workspaceManager.create({
      name: `Error response ${Date.now()}`,
      group: 'test',
    }).id;
    const sessionId = `error-session-${Date.now()}`;
    provider.respondWith(PROVIDER_400);

    try {
      const res = await injectWithAuth(server, {
        method: 'POST',
        url: '/api/chat',
        payload: {
          message: 'Please remember that this turn failed visibly.',
          workspace: workspaceId,
          session: sessionId,
        },
      });

      const errorEvents = parseSSE(res.body).filter(e => e.event === 'error');
      expect(errorEvents.length).toBe(1);

      const inMemory = server.agentState.sessionHistories.get(
        chatSessionStateKey(workspaceId, sessionId),
      ) ?? [];
      expect(inMemory).toHaveLength(2);
      expect(inMemory[0]).toMatchObject({
        role: 'user',
        content: 'Please remember that this turn failed visibly.',
      });
      expect(inMemory[1].role).toBe('assistant');
      expect(inMemory[1].content).toBe('Generation failed: The model provider returned an error (HTTP 400). Try again or switch model.');

      const onDisk = loadSessionMessages(tmpDir, workspaceId, sessionId);
      expect(onDisk).toEqual(inMemory);
    } finally {
      provider.respondWith(DEFAULT_REPLY);
      server.sessionManager.close(workspaceId);
    }
  });

  it('atomically replaces the exact assistant retry pair and calls the model once', async () => {
    const workspaceId = server.workspaceManager.create({
      name: `Structured retry success ${Date.now()}`,
      group: 'test',
    }).id;
    const sessionId = `structured-retry-success-${Date.now()}`;
    const message = 'Retry this exact turn.';
    const failedAssistant = `${GENERATION_FAILED_PREFIX}temporary failure`;
    persistMessage(tmpDir, workspaceId, sessionId, { role: 'user', content: message });
    persistMessage(tmpDir, workspaceId, sessionId, { role: 'assistant', content: failedAssistant });
    const seeded = loadSessionMessages(tmpDir, workspaceId, sessionId);
    server.agentState.sessionHistories.set(chatSessionStateKey(workspaceId, sessionId), [...seeded]);
    const requestsBefore = provider.requests.length;
    provider.respondWith(request => ({
      type: 'text',
      content: `replacement:${request.messages.filter(m => m.role !== 'system').at(-1)?.content ?? ''}`,
      usage: { inputTokens: 1, outputTokens: 1 },
    }));

    try {
      const response = await injectWithAuth(server, {
        method: 'POST',
        url: '/api/chat',
        payload: {
          message,
          workspace: workspaceId,
          session: sessionId,
          retry: true,
          retryTarget: {
            kind: 'assistant-pair',
            expectedMessageCount: 2,
            expectedAssistantContent: failedAssistant,
          },
        },
      });

      expect(response.statusCode).toBe(200);
      expect(provider.requests.length - requestsBefore).toBe(1);
      const expected = [
        expect.objectContaining({ role: 'user', content: message }),
        expect.objectContaining({ role: 'assistant', content: `replacement:${message}` }),
      ];
      expect(loadSessionMessages(tmpDir, workspaceId, sessionId)).toEqual(expected);
      expect(server.agentState.sessionHistories.get(
        chatSessionStateKey(workspaceId, sessionId),
      )).toEqual(expected);
    } finally {
      provider.respondWith(DEFAULT_REPLY);
      server.sessionManager.close(workspaceId);
      server.agentState.sessionHistories.delete(chatSessionStateKey(workspaceId, sessionId));
    }
  });

  it.each([
    ['count', 4, `${GENERATION_FAILED_PREFIX}temporary failure`],
    ['content', 2, `${GENERATION_FAILED_PREFIX}different failure`],
  ])('fails closed when structured retry %s is stale', async (_case, expectedMessageCount, expectedAssistantContent) => {
    const workspaceId = server.workspaceManager.create({
      name: `Structured retry stale ${_case} ${Date.now()}`,
      group: 'test',
    }).id;
    const sessionId = `structured-retry-stale-${_case}-${Date.now()}`;
    const message = 'Keep this original turn.';
    const failedAssistant = `${GENERATION_FAILED_PREFIX}temporary failure`;
    persistMessage(tmpDir, workspaceId, sessionId, { role: 'user', content: message });
    persistMessage(tmpDir, workspaceId, sessionId, { role: 'assistant', content: failedAssistant });
    const sessionFile = path.join(
      tmpDir, 'workspaces', workspaceId, 'sessions', `${sessionId}.jsonl`,
    );
    const diskBefore = fs.readFileSync(sessionFile);
    const memoryBefore = loadSessionMessages(tmpDir, workspaceId, sessionId);
    server.agentState.sessionHistories.set(
      chatSessionStateKey(workspaceId, sessionId),
      memoryBefore.map(entry => ({ ...entry })),
    );
    const requestsBefore = provider.requests.length;

    try {
      const response = await injectWithAuth(server, {
        method: 'POST',
        url: '/api/chat',
        payload: {
          message,
          workspace: workspaceId,
          session: sessionId,
          retry: true,
          retryTarget: {
            kind: 'assistant-pair',
            expectedMessageCount,
            expectedAssistantContent,
          },
        },
      });

      expect(response.statusCode).toBe(200);
      const errors = parseSSE(response.body).filter(event => event.event === 'error');
      expect(errors).toHaveLength(1);
      expect(JSON.parse(errors[0]!.data)).toMatchObject({ code: 'RETRY_TARGET_STALE' });
      expect(provider.requests.length).toBe(requestsBefore);
      expect(fs.readFileSync(sessionFile)).toEqual(diskBefore);
      expect(server.agentState.sessionHistories.get(
        chatSessionStateKey(workspaceId, sessionId),
      )).toEqual(memoryBefore);
    } finally {
      server.sessionManager.close(workspaceId);
      server.agentState.sessionHistories.delete(chatSessionStateKey(workspaceId, sessionId));
    }
  });

  it('does not replace a prior failed pair for a legacy retry with a different message', async () => {
    const workspaceId = server.workspaceManager.create({
      name: `Legacy retry preservation ${Date.now()}`,
      group: 'test',
    }).id;
    const sessionId = `legacy-retry-preservation-${Date.now()}`;
    const originalMessage = 'Original failed request.';
    const retryMessage = 'A different retry request.';
    const failedAssistant = `${GENERATION_FAILED_PREFIX}original failure`;
    persistMessage(tmpDir, workspaceId, sessionId, { role: 'user', content: originalMessage });
    persistMessage(tmpDir, workspaceId, sessionId, { role: 'assistant', content: failedAssistant });
    server.agentState.sessionHistories.delete(chatSessionStateKey(workspaceId, sessionId));
    provider.respondWith({
      type: 'text', content: 'different retry answer', usage: { inputTokens: 1, outputTokens: 1 },
    });

    try {
      const response = await injectWithAuth(server, {
        method: 'POST', url: '/api/chat',
        payload: { message: retryMessage, workspace: workspaceId, session: sessionId, retry: true },
      });
      expect(response.statusCode).toBe(200);
      expect(loadSessionMessages(tmpDir, workspaceId, sessionId).map(({ role, content }) => ({ role, content })))
        .toEqual([
          { role: 'user', content: originalMessage },
          { role: 'assistant', content: failedAssistant },
          { role: 'user', content: retryMessage },
          { role: 'assistant', content: 'different retry answer' },
        ]);
    } finally {
      provider.respondWith(DEFAULT_REPLY);
      server.sessionManager.close(workspaceId);
      server.agentState.sessionHistories.delete(chatSessionStateKey(workspaceId, sessionId));
    }
  });

  it('runs a structured retry without reading or rewriting durable history when history is denied', async () => {
    const workspaceId = server.workspaceManager.create({
      name: `Denied structured retry ${Date.now()}`,
      group: 'test',
    }).id;
    const sessionId = `denied-structured-retry-${Date.now()}`;
    const priorMessage = 'Sensitive prior failed request.';
    const failedAssistant = `${GENERATION_FAILED_PREFIX}sensitive failure`;
    persistMessage(tmpDir, workspaceId, sessionId, { role: 'user', content: priorMessage });
    persistMessage(tmpDir, workspaceId, sessionId, { role: 'assistant', content: failedAssistant });
    const sessionFile = path.join(
      tmpDir, 'workspaces', workspaceId, 'sessions', `${sessionId}.jsonl`,
    );
    const diskBefore = fs.readFileSync(sessionFile);
    server.agentState.sessionHistories.delete(chatSessionStateKey(workspaceId, sessionId));
    const requestsBefore = provider.requests.length;
    provider.respondWith(request => ({
      type: 'text',
      content: `private:${request.messages.filter(m => m.role !== 'system').at(-1)?.content ?? ''}`,
      usage: { inputTokens: 1, outputTokens: 1 },
    }));
    const message = '/research BERYL do not use saved history. Answer from scratch. Do not write files or execute code.';

    try {
      const response = await injectWithAuth(server, {
        method: 'POST', url: '/api/chat',
        payload: {
          message, workspace: workspaceId, session: sessionId, retry: true,
          retryTarget: {
            kind: 'assistant-pair',
            expectedMessageCount: 999,
            expectedAssistantContent: 'intentionally stale',
          },
        },
      });

      expect(response.statusCode).toBe(200);
      expect(parseSSE(response.body).some(event => event.event === 'done')).toBe(true);
      expect(parseSSE(response.body).some(event => event.event === 'error')).toBe(false);
      expect(provider.requests.length - requestsBefore).toBe(1);
      expect(JSON.stringify(
        provider.requests.at(-1)!.messages.filter(m => m.role !== 'system'),
      )).not.toContain(priorMessage);
      expect(fs.readFileSync(sessionFile)).toEqual(diskBefore);
      expect(server.agentState.sessionHistories.has(
        chatSessionStateKey(workspaceId, sessionId),
      )).toBe(false);
    } finally {
      provider.respondWith(DEFAULT_REPLY);
      server.sessionManager.close(workspaceId);
      server.agentState.sessionHistories.delete(chatSessionStateKey(workspaceId, sessionId));
    }
  });

  // #3 launch-blocker: memory capture must NOT depend on generation success.
  // When the model call throws, the happy-path write-back never runs — so the
  // route persists the raw user turn directly, else "remembers everything" breaks.
  it('persists a failed raw turn in the authorized active workspace, never personal memory (#3)', async () => {
    const activeWorkspaceId = server.agentState.activeWorkspaceId;
    expect(activeWorkspaceId).toBeTruthy();
    provider.respondWith(PROVIDER_400);

    const seed = `Launch-blocker seed ${Date.now()}: my horse is named Comet and I live in Belgrade.`;
    try {
      const res = await injectWithAuth(server, {
        method: 'POST',
        url: '/api/chat',
        payload: { message: seed },
      });

      expect(parseSSE(res.body).filter(e => e.event === 'error')).toHaveLength(1);
      const activeMind = server.agentState.getWorkspaceMindDb(activeWorkspaceId!);
      expect(activeMind).not.toBeNull();
      const persisted = new FrameStore(activeMind!).findDuplicate(seed);
      expect(persisted).not.toBeNull();
      expect(persisted!.content).toContain('my horse is named Comet');
      expect(server.agentState.orchestrator.getFrames().findDuplicate(seed)).toBeNull();
    } finally {
      provider.respondWith(DEFAULT_REPLY);
    }
  });

  it('persists a failed raw turn in personal memory when no workspace is active', async () => {
    const personalDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-chat-failed-personal-'));
    const personalServer = await buildLocalServer({ dataDir: personalDir });
    const initiallyActiveWorkspace = personalServer.agentState.activeWorkspaceId;
    expect(initiallyActiveWorkspace).toBeTruthy();
    const retirement = await personalServer.agentState.closeWorkspaceMind(initiallyActiveWorkspace!);
    retirement.release();
    expect(personalServer.agentState.activeWorkspaceId).toBeNull();
    personalServer.agentState.llmProvider = {
      provider: 'anthropic-proxy', health: 'healthy', detail: 'fake LLM provider', checkedAt: new Date().toISOString(),
    };
    provider.respondWith(PROVIDER_400);
    const requestsBefore = provider.requests.length;
    const seed = `Personal failed-turn marker ${Date.now()}`;

    try {
      const response = await injectWithAuth(personalServer, {
        method: 'POST',
        url: '/api/chat',
        payload: { message: seed },
      });

      expect(parseSSE(response.body).filter(event => event.event === 'error')).toHaveLength(1);
      expect(personalServer.agentState.orchestrator.getFrames().findDuplicate(seed)).not.toBeNull();
      expect(provider.requests.length).toBeGreaterThan(requestsBefore);
    } finally {
      provider.respondWith(DEFAULT_REPLY);
      await personalServer.close();
      fs.rmSync(personalDir, { recursive: true, force: true });
    }
  });

  it('binds failed-turn memory to the authorized workspace instead of mutable active state', async () => {
    const originalWorkspaceId = server.agentState.activeWorkspaceId;
    const nonce = Date.now();
    const workspaceA = server.workspaceManager.create({
      name: `Failed-turn memory A ${nonce}`,
      group: 'test',
    });
    const workspaceB = server.workspaceManager.create({
      name: `Failed-turn memory B ${nonce}`,
      group: 'test',
    });
    const seed = `Workspace B private failed-turn marker ${nonce}`;
    provider.respondWith(PROVIDER_400);

    try {
      expect(server.agentState.activateWorkspaceMind(workspaceA.id)).toBe(true);
      const workspaceAMind = server.agentState.getWorkspaceMindDb(workspaceA.id);
      const workspaceBMind = server.agentState.getWorkspaceMindDb(workspaceB.id);
      expect(workspaceAMind).not.toBeNull();
      expect(workspaceBMind).not.toBeNull();
      const personalSessionsBefore = server.agentState.orchestrator.getSessions()
        .getActive().map(item => item.gop_id);
      const response = await injectWithAuth(server, {
        method: 'POST',
        url: '/api/chat',
        payload: {
          message: seed,
          workspace: workspaceB.id,
          session: `failed-turn-memory-${nonce}`,
        },
      });

      expect(parseSSE(response.body).filter(event => event.event === 'error')).toHaveLength(1);
      expect(server.agentState.orchestrator.getFrames().findDuplicate(seed)).toBeNull();
      expect(new FrameStore(workspaceAMind!).findDuplicate(seed)).toBeNull();
      const workspaceBFrame = new FrameStore(workspaceBMind!).findDuplicate(seed);
      expect(workspaceBFrame).not.toBeNull();
      expect(new SessionStore(workspaceAMind!).getActive()).toHaveLength(0);
      const workspaceBSessions = new SessionStore(workspaceBMind!);
      expect(workspaceBSessions.getActive()).toHaveLength(1);
      expect(workspaceBSessions.getByGopId(workspaceBFrame!.gop_id)).toBeDefined();
      expect(server.agentState.orchestrator.getSessions()
        .getActive().map(item => item.gop_id)).toEqual(personalSessionsBefore);
    } finally {
      provider.respondWith(DEFAULT_REPLY);
      const restored = originalWorkspaceId
        ? server.agentState.activateWorkspaceMind(originalWorkspaceId)
        : false;
      server.sessionManager.close(workspaceA.id);
      server.sessionManager.close(workspaceB.id);
      server.mindCache.close(workspaceA.id);
      server.mindCache.close(workspaceB.id);
      if (server.workspaceManager.get(workspaceA.id)) server.workspaceManager.delete(workspaceA.id);
      if (server.workspaceManager.get(workspaceB.id)) server.workspaceManager.delete(workspaceB.id);
      if (originalWorkspaceId) expect(restored).toBe(true);
    }
  });

  it('keeps an implicit failed turn bound when the global active workspace changes mid-request', async () => {
    const originalWorkspaceId = server.agentState.activeWorkspaceId;
    const nonce = Date.now();
    const workspaceA = server.workspaceManager.create({
      name: `Implicit failed-turn A ${nonce}`,
      group: 'test',
    });
    const workspaceB = server.workspaceManager.create({
      name: `Implicit failed-turn B ${nonce}`,
      group: 'test',
    });
    const seed = `Implicit workspace A failed-turn marker ${nonce}`;
    let releaseRunner!: () => void;
    let markRunnerEntered!: () => void;
    const runnerGate = new Promise<void>(resolve => { releaseRunner = resolve; });
    const runnerEntered = new Promise<void>(resolve => { markRunnerEntered = resolve; });
    let responsePromise: ReturnType<typeof injectWithAuth> | undefined;
    // The provider holds the real loop's model call open, then fails it.
    provider.respondWith(async () => {
      markRunnerEntered();
      await runnerGate;
      return PROVIDER_400;
    });

    try {
      expect(server.agentState.activateWorkspaceMind(workspaceA.id)).toBe(true);
      const workspaceAMind = server.agentState.getWorkspaceMindDb(workspaceA.id);
      const workspaceBMind = server.agentState.getWorkspaceMindDb(workspaceB.id);
      expect(workspaceAMind).not.toBeNull();
      expect(workspaceBMind).not.toBeNull();
      const personalSessionsBefore = server.agentState.orchestrator.getSessions()
        .getActive().map(item => item.gop_id);

      responsePromise = injectWithAuth(server, {
        method: 'POST',
        url: '/api/chat',
        payload: {
          message: seed,
          session: `implicit-failed-turn-${nonce}`,
        },
      });
      await runnerEntered;
      expect(server.agentState.activateWorkspaceMind(workspaceB.id)).toBe(true);
      releaseRunner();
      const response = await responsePromise;

      expect(parseSSE(response.body).filter(event => event.event === 'error')).toHaveLength(1);
      expect(server.agentState.orchestrator.getFrames().findDuplicate(seed)).toBeNull();
      const workspaceAFrame = new FrameStore(workspaceAMind!).findDuplicate(seed);
      expect(workspaceAFrame).not.toBeNull();
      expect(new FrameStore(workspaceBMind!).findDuplicate(seed)).toBeNull();
      const workspaceASessions = new SessionStore(workspaceAMind!);
      expect(workspaceASessions.getByGopId(workspaceAFrame!.gop_id)).toBeDefined();
      expect(new SessionStore(workspaceBMind!).getActive()).toHaveLength(0);
      expect(server.agentState.orchestrator.getSessions()
        .getActive().map(item => item.gop_id)).toEqual(personalSessionsBefore);
    } finally {
      releaseRunner();
      await responsePromise?.catch(() => undefined);
      provider.respondWith(DEFAULT_REPLY);
      const restored = originalWorkspaceId
        ? server.agentState.activateWorkspaceMind(originalWorkspaceId)
        : false;
      server.sessionManager.close(workspaceA.id);
      server.sessionManager.close(workspaceB.id);
      server.mindCache.close(workspaceA.id);
      server.mindCache.close(workspaceB.id);
      if (server.workspaceManager.get(workspaceA.id)) server.workspaceManager.delete(workspaceA.id);
      if (server.workspaceManager.get(workspaceB.id)) server.workspaceManager.delete(workspaceB.id);
      if (originalWorkspaceId) expect(restored).toBe(true);
    }
  });

  it('keeps a failed broad no-change request in chat history without writing it to memory', async () => {
    const sessionId = `no-mutation-failure-${Date.now()}`;
    const seed = `Analyze this release plan (${Date.now()}). Do not create or edit anything.`;
    const authorizedWorkspace = server.agentState.activeWorkspaceId;
    expect(authorizedWorkspace).toBeTruthy();
    // An unclassified message: no provider reply produces one (ruling 2).
    loopSpy.failWith = new Error('LiteLLM is not available');

    try {
      const res = await injectWithAuth(server, {
        method: 'POST',
        url: '/api/chat',
        payload: { message: seed, workspace: 'default', session: sessionId },
      });

      expect(parseSSE(res.body).filter(event => event.event === 'error')).toHaveLength(1);
      expect(server.agentState.orchestrator.getFrames().findDuplicate(seed)).toBeNull();
      const transcript = loadSessionMessages(
        tmpDir,
        authorizedWorkspace!,
        sessionId,
      );
      expect(transcript[0]).toEqual({ role: 'user', content: seed });
      expect(transcript[1].role).toBe('assistant');
      expect(transcript[1].content).toBe('Generation failed: Something went wrong. Try sending your message again.');
    } finally {
      loopSpy.failWith = null;
    }
  });

  // #4: a locally-selected Ollama model must route to Ollama's OpenAI-compatible
  // endpoint (graceful degradation / sovereignty), NOT LiteLLM which doesn't have
  // it — and the 'ollama/' routing prefix must be stripped to the bare tag.
  it('routes an Ollama-selected model to the local Ollama endpoint, not LiteLLM (#4)', async () => {
    // Model calls still reach the suite's fake, which records the real loop's
    // wire request (TD-CHAT-16).
    const fakeFetch = globalThis.fetch;
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      if (String(input).endsWith('/api/tags')) {
        return new Response(JSON.stringify({ models: [{ name: 'llama3.2:latest' }] }), {
          status: 200,
        });
      }
      if (String(input).endsWith('/chat/completions')) return fakeFetch(input, init);
      return new Response('', { status: 503 });
    });
    const requestsBefore = provider.requests.length;

    try {
      await injectWithAuth(server, {
        method: 'POST',
        url: '/api/chat',
        payload: { message: 'hi', model: 'ollama/llama3.2:latest' },
      });

      expect(provider.requests.length).toBeGreaterThan(requestsBefore);
      const sent = provider.requests.at(-1)!;
      expect(sent.url).toMatch(/:11434\/v1\/chat\/completions$/); // routed to Ollama, not LiteLLM
      expect(sent.model).toBe('llama3.2:latest');  // 'ollama/' prefix stripped
    } finally {
      fetchSpy.mockRestore();
    }
  });

  // H-07 G4 · agent errors must finalize the execution trace with
  // outcome='abandoned'. Without this, the trace row stays 'pending' and
  // the evolution dataset builder skips it, starving the loop of the
  // counterexamples it needs to learn from.
  it('finalizes execution trace with outcome=abandoned on agent error', async () => {
    if (!server.traceStore) {
      // Trace store is optional; skip if the decorator didn't mount.
      return;
    }
    const beforeCounts = server.traceStore.outcomeCounts();
    provider.respondWith(PROVIDER_400);
    try {
      await injectWithAuth(server, {
        method: 'POST',
        url: '/api/chat',
        payload: { message: 'trigger-abandoned-trace' },
      });

      const afterCounts = server.traceStore.outcomeCounts();
      expect(afterCounts.abandoned).toBeGreaterThan(beforeCounts.abandoned);
      // Sanity: we didn't accidentally mark it 'success' or leave it 'pending'.
      expect(afterCounts.success).toBe(beforeCounts.success);
      expect(afterCounts.pending).toBe(beforeCounts.pending);
    } finally {
      provider.respondWith(DEFAULT_REPLY);
    }
  });

  it('finalizes execution trace with outcome=success on happy path', async () => {
    if (!server.traceStore) return;
    const beforeCounts = server.traceStore.outcomeCounts();

    await injectWithAuth(server, {
      method: 'POST',
      url: '/api/chat',
      payload: { message: 'happy-path-trace' },
    });

    const afterCounts = server.traceStore.outcomeCounts();
    expect(afterCounts.success).toBeGreaterThan(beforeCounts.success);
    expect(afterCounts.pending).toBe(beforeCounts.pending);
  });

  // Re-pinned on the real path (TD-CHAT-16 ruling 14): the model makes a real
  // scripted web_search call, and the route's auto-recall streams its own
  // tool event first. The search host is answered here, keeping the turn off
  // the network.
  it('streams tool use events', async () => {
    const fakeFetch = globalThis.fetch;
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      if (String(input).startsWith('https://html.duckduckgo.com/')) {
        return new Response('<html></html>', { status: 200 });
      }
      return fakeFetch(input, init);
    });
    provider.respondWith([
      { type: 'tool_calls', calls: [{ name: 'web_search', args: { query: 'waggle bees' } }] },
      { type: 'text', content: 'Search results: ...', usage: { inputTokens: 20, outputTokens: 15 } },
    ]);
    try {
      const res = await injectWithAuth(server, {
        method: 'POST',
        url: '/api/chat',
        payload: { message: 'Search the web for waggle bees' },
      });

      const events = parseSSE(res.body);
      const tokenEvents = events.filter(e => e.event === 'token');
      expect(tokenEvents.length).toBe(1);
      expect(JSON.parse(tokenEvents[0].data).content).toBe('Search results: ...');

      const toolEvents = events.filter(e => e.event === 'tool');
      expect(toolEvents.map(event => JSON.parse(event.data).name)).toEqual(['auto_recall', 'web_search']);
      const toolData = JSON.parse(toolEvents[1].data);
      expect(toolData.name).toBe('web_search');
      expect(toolData.input).toEqual({ query: 'waggle bees' });

      const doneEvents = events.filter(e => e.event === 'done');
      const doneData = JSON.parse(doneEvents[0].data);
      expect(doneData.toolsUsed).toEqual(['web_search']);
    } finally {
      provider.respondWith(DEFAULT_REPLY);
      fetchSpy.mockRestore();
    }
  });

  it.each(['workspace', 'workspaceId'] as const)(
    'rejects unknown %s before running or persisting chat',
    async (workspaceField) => {
      const workspaceId = `unknown-${workspaceField.toLowerCase()}-${Date.now()}`;
      const sessionId = `unknown-session-${Date.now()}`;
      const requestsBefore = provider.requests.length;

      const res = await injectWithAuth(server, {
        method: 'POST',
        url: '/api/chat',
        payload: {
          message: 'This must not create orphan history.',
          [workspaceField]: workspaceId,
          session: sessionId,
        },
      });

      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({
        error: 'Workspace not found',
        code: 'WORKSPACE_NOT_FOUND',
      });
      expect(provider.requests.length).toBe(requestsBefore);
      expect(server.workspaceManager.get(workspaceId)).toBeNull();
      expect(server.agentState.sessionHistories.has(
        chatSessionStateKey(workspaceId, sessionId),
      )).toBe(false);
      expect(loadSessionMessages(tmpDir, workspaceId, sessionId)).toEqual([]);
      expect(fs.existsSync(path.join(tmpDir, 'workspaces', workspaceId))).toBe(false);
    },
  );

  it('accepts optional workspace parameter for an existing workspace', async () => {
    const workspace = server.workspaceManager.create({
      name: `Optional chat ${Date.now()}`,
      group: 'test',
    });
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/chat',
      payload: { message: 'Hello', workspace: workspace.id },
    });
    const events = parseSSE(res.body);
    const doneEvents = events.filter(e => e.event === 'done');
    expect(res.statusCode).toBe(200);
    expect(doneEvents.length).toBe(1);
  });
});
