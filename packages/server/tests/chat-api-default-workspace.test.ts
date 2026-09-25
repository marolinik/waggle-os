import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { MindDB, FrameStore, SessionStore, WaggleConfig } from '@waggle/core';
import { buildLocalServer } from '../src/local/index.js';
import type { FastifyInstance } from 'fastify';
import { getPersona, runAgentLoop } from '@waggle/agent';
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

function openAiSseResponse(content: string): Response {
  return new Response(
    `data: ${JSON.stringify({ choices: [{ delta: { content }, finish_reason: null }] })}\n\n`
      + `data: ${JSON.stringify({
        choices: [{ delta: {}, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 2 },
      })}\n\ndata: [DONE]\n\n`,
    { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
  );
}

function openAiJsonResponse(content: string): Response {
  return new Response(JSON.stringify({
    choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 10, completion_tokens: 2 },
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function openAiToolJsonResponse(name: string, args: Record<string, unknown> = {}): Response {
  return new Response(JSON.stringify({
    choices: [{
      message: {
        role: 'assistant',
        content: null,
        tool_calls: [{
          id: `call-${name}`,
          type: 'function',
          function: { name, arguments: JSON.stringify(args) },
        }],
      },
      finish_reason: 'tool_calls',
    }],
    usage: { prompt_tokens: 10, completion_tokens: 2 },
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function openAiToolSseResponse(name: string): Response {
  return new Response(
    `data: ${JSON.stringify({
      choices: [{
        delta: {
          tool_calls: [{
            index: 0,
            id: `call-${name}`,
            type: 'function',
            function: { name, arguments: '{}' },
          }],
        },
        finish_reason: null,
      }],
    })}\n\n`
      + `data: ${JSON.stringify({
        choices: [{ delta: {}, finish_reason: 'tool_calls' }],
        usage: { prompt_tokens: 10, completion_tokens: 2 },
      })}\n\ndata: [DONE]\n\n`,
    { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
  );
}

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

  it('keeps an authorized personal chat independent from a managed workspace named default', async () => {
    const personalDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'waggle-chat-personal-default-'),
    );
    const personalModel = 'ollama/personal-policy-model:latest';
    const managedModel = 'ollama/managed-default-policy-model:latest';
    const config = new WaggleConfig(personalDir);
    config.setDefaultModel(personalModel);
    config.save();

    const personalServer = await buildLocalServer({ dataDir: personalDir });
    const initiallyActiveWorkspace = personalServer.agentState.activeWorkspaceId;
    expect(initiallyActiveWorkspace).toBeTruthy();
    const retirement = await personalServer.agentState.closeWorkspaceMind(initiallyActiveWorkspace!);
    retirement.release();
    expect(personalServer.agentState.activeWorkspaceId).toBeNull();
    personalServer.workspaceManager.ensure('default', {
      name: 'default',
      group: 'test',
      teamId: 'managed-default-policy-team',
      teamRole: 'member',
    });
    personalServer.workspaceManager.update('default', {
      personaId: 'writer',
      model: managedModel,
    });

    // Model calls reach the suite's fake, which records the real loop's wire
    // requests (TD-CHAT-16).
    const fakeFetch = globalThis.fetch;
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(
      async (input, init) => {
        if (String(input).endsWith('/api/tags')) {
          return new Response(JSON.stringify({
            models: [
              { name: 'personal-policy-model:latest' },
              { name: 'managed-default-policy-model:latest' },
            ],
          }), { status: 200 });
        }
        if (String(input).endsWith('/chat/completions')) return fakeFetch(input, init);
        return new Response('', { status: 503 });
      },
    );
    personalServer.agentState.llmProvider = {
      provider: 'anthropic-proxy', health: 'healthy', detail: 'fake LLM provider', checkedAt: new Date().toISOString(),
    };
    personalServer.llmRetryBackoffMs = () => 0;
    // Re-pinned on the production path (TD-CHAT-16 §6l). The route no longer
    // charges an injected runner's usage: the loop's own spend meter records
    // every model call. And skill distillation fires for real: a turn that
    // asks for memory search makes five search_memory calls, then answers, and
    // the loop's D1 gate calls the route's onSkillDistillationFire.
    const usageSpy = vi.spyOn(personalServer.agentState.costTracker, 'addUsage');
    const costTracker = personalServer.agentState.costTracker;
    provider.respondWith((request) => (
      request.toolNames.includes('search_memory') && !request.messages.some(m => m.role === 'tool')
        ? {
          type: 'tool_calls',
          calls: Array.from({ length: 5 }, (_, i) => ({
            name: 'search_memory', args: { query: `next step ${i}` }, id: `call-step-${i}`,
          })),
          usage: { inputTokens: 1, outputTokens: 1 },
        }
        : { type: 'text', content: 'personal-policy-bound', usage: { inputTokens: 1, outputTokens: 1 } }
    ));

    try {
      const firstTurnStart = provider.requests.length;
      const entriesBefore = costTracker.getUsageEntries().length;
      const response = await injectWithAuth(personalServer, {
        method: 'POST',
        url: '/api/chat',
        payload: {
          message: 'Search memory for my next personal step.',
          session: `personal-policy-${Date.now()}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const firstTurn = provider.requests.slice(firstTurnStart);
      expect(firstTurn.length).toBeGreaterThan(0);
      expect(firstTurn.map(request => request.model))
        .toEqual(firstTurn.map(() => 'personal-policy-model:latest'));
      expect(firstTurn[0].systemPrompt).not.toContain('## Persona: Writer');
      expect(usageSpy).not.toHaveBeenCalled();
      expect(costTracker.getUsageEntries().slice(entriesBefore)).toEqual(firstTurn.map(() => (
        expect.objectContaining({
          model: personalModel,
          input: 1,
          output: 1,
          workspaceId: 'personal::default',
          billingClass: 'free',
        })
      )));
      expect(personalServer.agentState.activeWorkspaceId).toBeNull();

      const commandTurnStart = provider.requests.length;
      const commandResponse = await injectWithAuth(personalServer, {
        method: 'POST',
        url: '/api/chat',
        payload: {
          message: '/settings',
          session: `personal-command-${Date.now()}`,
        },
      });
      expect(commandResponse.statusCode).toBe(200);
      const commandPrompt = provider.requests[commandTurnStart]?.messages
        .filter(m => m.role !== 'system').at(-1)?.content ?? '';
      expect(commandPrompt).toContain('workspace "Personal"');
      expect(commandPrompt).not.toContain('personal::default');

      expect(personalServer.agentState.activateWorkspaceMind('default')).toBe(true);
      const managedTurnStart = provider.requests.length;
      const managedResponse = await injectWithAuth(personalServer, {
        method: 'POST',
        url: '/api/chat',
        payload: {
          message: 'Search memory for my managed workspace step.',
          session: `managed-default-policy-${Date.now()}`,
          workspace: 'default',
        },
      });
      expect(managedResponse.statusCode).toBe(200);
      expect(provider.requests.length).toBeGreaterThan(managedTurnStart);
      expect(provider.requests.at(-1)!.model).toContain('managed-default-policy-model:latest');

      const skillShares = personalServer.signalBus!.query({
        subtype: 'skill_share',
      });
      expect(skillShares).toEqual(expect.arrayContaining([
        expect.objectContaining({ teamId: 'personal::default' }),
        expect.objectContaining({ teamId: 'default' }),
      ]));
    } finally {
      provider.respondWith(DEFAULT_REPLY);
      usageSpy.mockRestore();
      fetchSpy.mockRestore();
      await personalServer.close();
      await new Promise(resolve => setTimeout(resolve, 100));
      fs.rmSync(personalDir, { recursive: true, force: true });
    }
  });

  it('rejects a viewer workspace whose literal generated id is default', async () => {
    const nonce = Date.now();
    const memberWorkspace = server.workspaceManager.create({
      name: `Literal default control ${nonce}`,
      group: 'test',
      teamId: `literal-default-team-${nonce}`,
      teamRole: 'member',
    });
    const literalDefaultWorkspace = server.workspaceManager.ensure('default', {
      name: 'default',
      group: 'test',
      teamId: `literal-default-team-${nonce}`,
      teamRole: 'viewer',
    });

    expect(literalDefaultWorkspace.id).toBe('default');
    expect(literalDefaultWorkspace.teamRole).toBe('viewer');
    expect(server.agentState.activateWorkspaceMind(memberWorkspace.id)).toBe(true);

    const response = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/chat',
      payload: { message: 'must remain read-only', workspace: 'default' },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: 'VIEWER_READ_ONLY' });
  });

  it('keeps omitted-workspace history out of a managed viewer workspace named default', async () => {
    const nonce = Date.now();
    const memberWorkspace = server.workspaceManager.create({
      name: `Implicit history member ${nonce}`,
      group: 'test',
      teamId: `implicit-history-team-${nonce}`,
      teamRole: 'member',
    });
    const literalDefaultWorkspace = server.workspaceManager.ensure('default', {
      name: 'default',
      group: 'test',
      teamId: `implicit-history-team-${nonce}`,
      teamRole: 'viewer',
    });
    const sessionId = `implicit-history-${nonce}`;
    const firstMessage = `first implicit history turn ${nonce}`;
    const secondMessage = `second implicit history turn ${nonce}`;
    const capturedMessages: Array<Array<{ role: string; content: string }>> = [];

    expect(literalDefaultWorkspace.teamRole).toBe('viewer');
    expect(server.agentState.activateWorkspaceMind(memberWorkspace.id)).toBe(true);
    // The real loop runs; the fake records what reached the model and echoes
    // the turn's own message (TD-CHAT-16).
    provider.respondWith((request) => {
      const conversation = request.messages.filter(m => m.role !== 'system');
      capturedMessages.push(conversation);
      return {
        type: 'text',
        content: `reply:${conversation.at(-1)?.content ?? ''}`,
        usage: { inputTokens: 1, outputTokens: 1 },
      };
    });

    try {
      const firstResponse = await injectWithAuth(server, {
        method: 'POST',
        url: '/api/chat',
        payload: { message: firstMessage, session: sessionId },
      });
      expect(firstResponse.statusCode).toBe(200);
      expect(
        server.agentState.sessionHistories.get(
          chatSessionStateKey(memberWorkspace.id, sessionId),
        )?.[0],
      ).toEqual({ role: 'user', content: firstMessage });

      server.agentState.sessionHistories.delete(
        chatSessionStateKey(memberWorkspace.id, sessionId),
      );

      const secondResponse = await injectWithAuth(server, {
        method: 'POST',
        url: '/api/chat',
        payload: { message: secondMessage, session: sessionId },
      });
      expect(secondResponse.statusCode).toBe(200);
      expect(capturedMessages[1]).toEqual(expect.arrayContaining([
        { role: 'user', content: firstMessage },
        { role: 'assistant', content: `reply:${firstMessage}` },
        { role: 'user', content: secondMessage },
      ]));
      expect(loadSessionMessages(tmpDir, memberWorkspace.id, sessionId)).toEqual([
        expect.objectContaining({ role: 'user', content: firstMessage }),
        expect.objectContaining({
          role: 'assistant',
          content: `reply:${firstMessage}`,
        }),
        expect.objectContaining({ role: 'user', content: secondMessage }),
        expect.objectContaining({
          role: 'assistant',
          content: `reply:${secondMessage}`,
        }),
      ]);
      expect(loadSessionMessages(tmpDir, 'default', sessionId)).toEqual([]);
    } finally {
      provider.respondWith(DEFAULT_REPLY);
      server.agentState.sessionHistories.delete(
        chatSessionStateKey(memberWorkspace.id, sessionId),
      );
    }
  });

  it('retries omitted-workspace history without rewriting a managed viewer workspace named default', async () => {
    const nonce = Date.now();
    const memberWorkspace = server.workspaceManager.create({
      name: `Implicit retry member ${nonce}`,
      group: 'test',
      teamId: `implicit-retry-team-${nonce}`,
      teamRole: 'member',
    });
    const literalDefaultWorkspace = server.workspaceManager.ensure('default', {
      name: 'default',
      group: 'test',
      teamId: `implicit-retry-team-${nonce}`,
      teamRole: 'viewer',
    });
    const sessionId = `implicit-retry-${nonce}`;
    const retryMessage = `retry member turn ${nonce}`;
    const defaultMessage = `viewer default turn ${nonce}`;

    expect(literalDefaultWorkspace.teamRole).toBe('viewer');
    expect(server.agentState.activateWorkspaceMind(memberWorkspace.id)).toBe(true);
    persistMessage(tmpDir, memberWorkspace.id, sessionId, {
      role: 'user',
      content: retryMessage,
    });
    persistMessage(tmpDir, memberWorkspace.id, sessionId, {
      role: 'assistant',
      content: `${GENERATION_FAILED_PREFIX}member failure`,
    });
    persistMessage(tmpDir, 'default', sessionId, {
      role: 'user',
      content: defaultMessage,
    });
    persistMessage(tmpDir, 'default', sessionId, {
      role: 'assistant',
      content: `${GENERATION_FAILED_PREFIX}viewer failure`,
    });
    const defaultSessionFile = path.join(
      tmpDir,
      'workspaces',
      'default',
      'sessions',
      `${sessionId}.jsonl`,
    );
    const defaultBytesBefore = fs.readFileSync(defaultSessionFile);
    server.agentState.sessionHistories.delete(
      chatSessionStateKey(memberWorkspace.id, sessionId),
    );
    // The real loop runs; the fake echoes the turn's own message (TD-CHAT-16).
    provider.respondWith((request) => ({
      type: 'text',
      content: `reply:${request.messages.filter(m => m.role !== 'system').at(-1)?.content ?? ''}`,
      usage: { inputTokens: 1, outputTokens: 1 },
    }));

    try {
      const response = await injectWithAuth(server, {
        method: 'POST',
        url: '/api/chat',
        payload: { message: retryMessage, session: sessionId, retry: true },
      });

      expect(response.statusCode).toBe(200);
      expect(loadSessionMessages(tmpDir, memberWorkspace.id, sessionId)).toEqual([
        expect.objectContaining({ role: 'user', content: retryMessage }),
        expect.objectContaining({
          role: 'assistant',
          content: `reply:${retryMessage}`,
        }),
      ]);
      expect(fs.readFileSync(defaultSessionFile)).toEqual(defaultBytesBefore);
      expect(loadSessionMessages(tmpDir, 'default', sessionId)).toEqual([
        expect.objectContaining({ role: 'user', content: defaultMessage }),
        expect.objectContaining({
          role: 'assistant',
          content: `${GENERATION_FAILED_PREFIX}viewer failure`,
        }),
      ]);
    } finally {
      provider.respondWith(DEFAULT_REPLY);
      server.agentState.sessionHistories.delete(
        chatSessionStateKey(memberWorkspace.id, sessionId),
      );
    }
  });

  it('separates a managed literal-default workspace from personal legacy-default session state', async () => {
    const nonce = Date.now();
    const previousActiveWorkspace = server.agentState.activeWorkspaceId;
    expect(previousActiveWorkspace).toBeTruthy();
    server.workspaceManager.ensure('default', {
      name: 'default',
      group: 'test',
    });
    server.workspaceManager.update('default', {
      teamId: `literal-default-member-team-${nonce}`,
      teamRole: 'member',
    });
    const sessionId = `default-state-collision-${nonce}`;
    const legacyMessage = `legacy implicit secret ${nonce}`;
    const managedMessage = `managed default message ${nonce}`;
    const capturedMessages: Array<Array<{ role: string; content: string }>> = [];

    // The real loop runs; the fake records what reached the model and echoes
    // the turn's own message (TD-CHAT-16).
    provider.respondWith((request) => {
      const conversation = request.messages.filter(m => m.role !== 'system');
      capturedMessages.push(conversation);
      return {
        type: 'text',
        content: `reply:${conversation.at(-1)?.content ?? ''}`,
        usage: { inputTokens: 1, outputTokens: 1 },
      };
    });

    try {
      const retirement = await server.agentState.closeWorkspaceMind(previousActiveWorkspace!);
      retirement.release();
      expect(server.agentState.activeWorkspaceId).toBeNull();
      const legacyResponse = await injectWithAuth(server, {
        method: 'POST',
        url: '/api/chat',
        payload: { message: legacyMessage, session: sessionId },
      });
      expect(legacyResponse.statusCode).toBe(200);

      expect(server.agentState.activateWorkspaceMind('default')).toBe(true);
      const managedResponse = await injectWithAuth(server, {
        method: 'POST',
        url: '/api/chat',
        payload: {
          message: managedMessage,
          session: sessionId,
          workspace: 'default',
        },
      });
      expect(managedResponse.statusCode).toBe(200);
      expect(capturedMessages[1]).not.toContainEqual({
        role: 'user',
        content: legacyMessage,
      });
      expect(loadSessionMessages(tmpDir, 'default', sessionId)).toEqual([
        expect.objectContaining({ role: 'user', content: managedMessage }),
        expect.objectContaining({
          role: 'assistant',
          content: `reply:${managedMessage}`,
        }),
      ]);

      const legacyClear = await injectWithAuth(server, {
        method: 'DELETE',
        url: `/api/chat/history?session=${sessionId}`,
      });
      expect(legacyClear.statusCode).toBe(200);
      const clearedLegacyHistory = await injectWithAuth(server, {
        method: 'GET',
        url: `/api/history?session=${sessionId}`,
      });
      const preservedManagedHistory = await injectWithAuth(server, {
        method: 'GET',
        url: `/api/history?workspace=default&session=${sessionId}`,
      });
      expect(clearedLegacyHistory.json().messages).toEqual([]);
      expect(
        preservedManagedHistory.json().messages.map(
          (entry: { content: string }) => entry.content,
        ),
      ).toEqual([managedMessage, `reply:${managedMessage}`]);
      expect(loadSessionMessages(
        chatHistoryDataDir(tmpDir, false),
        'default',
        sessionId,
      )).toEqual([]);

      const managedClear = await injectWithAuth(server, {
        method: 'DELETE',
        url: `/api/chat/history?workspace=default&session=${sessionId}`,
      });
      expect(managedClear.statusCode).toBe(200);
      const clearedManagedHistory = await injectWithAuth(server, {
        method: 'GET',
        url: `/api/history?workspace=default&session=${sessionId}`,
      });
      expect(clearedManagedHistory.json().messages).toEqual([]);
    } finally {
      provider.respondWith(DEFAULT_REPLY);
      server.agentState.sessionHistories.delete(
        chatSessionStateKey('default', sessionId),
      );
      server.workspaceManager.update('default', { teamRole: 'viewer' });
      expect(server.agentState.activateWorkspaceMind(previousActiveWorkspace!)).toBe(true);
    }
  });

  it('migrates cold legacy-default history before a managed default workspace can claim the path', async () => {
    const migrationDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'waggle-chat-history-migration-'),
    );
    const sessionId = `legacy-history-${Date.now()}`;
    const legacyMessage = `legacy cold history ${Date.now()}`;
    const legacySessionsDir = path.join(
      migrationDir,
      'workspaces',
      'default',
      'sessions',
    );
    const legacyFile = path.join(legacySessionsDir, `${sessionId}.jsonl`);
    fs.mkdirSync(legacySessionsDir, { recursive: true });
    fs.writeFileSync(
      legacyFile,
      [
        JSON.stringify({
          type: 'meta',
          title: null,
          created: new Date().toISOString(),
        }),
        JSON.stringify({
          role: 'user',
          content: legacyMessage,
          timestamp: new Date().toISOString(),
        }),
        '',
      ].join('\n'),
      'utf-8',
    );

    let migrationServer = await buildLocalServer({ dataDir: migrationDir });
    try {
      const legacyHistory = await injectWithAuth(migrationServer, {
        method: 'GET',
        url: `/api/history?session=${sessionId}`,
      });
      expect(legacyHistory.statusCode).toBe(200);
      expect(legacyHistory.json().messages).toEqual([
        expect.objectContaining({ role: 'user', content: legacyMessage }),
      ]);
      expect(fs.existsSync(legacyFile)).toBe(false);

      migrationServer.workspaceManager.ensure('default', {
        name: 'default',
        group: 'test',
        teamId: 'managed-default-history-team',
        teamRole: 'member',
      });
      await migrationServer.close();
      await new Promise(resolve => setTimeout(resolve, 100));
      migrationServer = await buildLocalServer({ dataDir: migrationDir });

      const restartedLegacyHistory = await injectWithAuth(migrationServer, {
        method: 'GET',
        url: `/api/history?session=${sessionId}`,
      });
      expect(restartedLegacyHistory.statusCode).toBe(200);
      expect(restartedLegacyHistory.json().messages).toEqual([
        expect.objectContaining({ role: 'user', content: legacyMessage }),
      ]);

      const managedHistory = await injectWithAuth(migrationServer, {
        method: 'GET',
        url: `/api/history?workspace=default&session=${sessionId}`,
      });
      expect(managedHistory.statusCode).toBe(200);
      expect(managedHistory.json().messages).toEqual([]);

      const managedSessionId = `${sessionId}-managed`;
      const managedMessage = `managed default cold history ${Date.now()}`;
      // The real loop runs on this server too; the suite's fake echoes the
      // turn's own message (TD-CHAT-16).
      migrationServer.agentState.llmProvider = {
        provider: 'anthropic-proxy', health: 'healthy', detail: 'fake LLM provider', checkedAt: new Date().toISOString(),
      };
      provider.respondWith((request) => ({
        type: 'text',
        content: `reply:${request.messages.filter(m => m.role !== 'system').at(-1)?.content ?? ''}`,
        usage: { inputTokens: 1, outputTokens: 1 },
      }));
      const managedPost = await injectWithAuth(migrationServer, {
        method: 'POST',
        url: '/api/chat',
        payload: {
          message: managedMessage,
          workspace: 'default',
          session: managedSessionId,
        },
      });
      expect(managedPost.statusCode).toBe(200);

      const warmManagedHistory = await injectWithAuth(migrationServer, {
        method: 'GET',
        url: `/api/history?workspace=default&session=${managedSessionId}`,
      });
      expect(
        warmManagedHistory.json().messages.map(
          (entry: { content: string }) => entry.content,
        ),
      ).toEqual([managedMessage, `reply:${managedMessage}`]);

      const managedTarget = resolveChatHistoryTarget(
        migrationDir,
        'default',
        true,
      );
      migrationServer.agentState.sessionHistories.delete(
        chatSessionStateKey(managedTarget.stateWorkspaceId, managedSessionId),
      );
      const coldManagedHistory = await injectWithAuth(migrationServer, {
        method: 'GET',
        url: `/api/history?workspace=default&session=${managedSessionId}`,
      });
      expect(
        coldManagedHistory.json().messages.map(
          (entry: { content: string }) => entry.content,
        ),
      ).toEqual([managedMessage, `reply:${managedMessage}`]);

      await migrationServer.close();
      await new Promise(resolve => setTimeout(resolve, 100));
      migrationServer = await buildLocalServer({ dataDir: migrationDir });
      const restartedManagedHistory = await injectWithAuth(migrationServer, {
        method: 'GET',
        url: `/api/history?workspace=default&session=${managedSessionId}`,
      });
      const finalLegacyHistory = await injectWithAuth(migrationServer, {
        method: 'GET',
        url: `/api/history?session=${sessionId}`,
      });
      expect(
        restartedManagedHistory.json().messages.map(
          (entry: { content: string }) => entry.content,
        ),
      ).toEqual([managedMessage, `reply:${managedMessage}`]);
      expect(finalLegacyHistory.json().messages).toEqual([
        expect.objectContaining({ role: 'user', content: legacyMessage }),
      ]);
    } finally {
      provider.respondWith(DEFAULT_REPLY);
      await migrationServer.close();
      await new Promise(resolve => setTimeout(resolve, 100));
      fs.rmSync(migrationDir, { recursive: true, force: true });
    }
  });

  it('fails closed without moving ambiguous pre-layout default histories', async () => {
    const recoveryDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'waggle-chat-history-recovery-'),
    );
    const sessionId = `ambiguous-history-${Date.now()}`;
    const managedSessionsDir = path.join(
      recoveryDir,
      'workspaces',
      'default',
      'sessions',
    );
    const managedCandidate = path.join(
      managedSessionsDir,
      `${sessionId}.jsonl`,
    );
    const managedContent = [
      JSON.stringify({
        type: 'meta',
        title: null,
        created: new Date().toISOString(),
      }),
      JSON.stringify({
        role: 'user',
        content: 'ambiguous canonical transcript',
        timestamp: new Date().toISOString(),
      }),
      '',
    ].join('\n');
    fs.mkdirSync(managedSessionsDir, { recursive: true });
    fs.writeFileSync(
      path.join(recoveryDir, 'workspaces', 'default', 'workspace.json'),
      JSON.stringify({
        id: 'default',
        name: 'default',
        group: 'test',
        teamId: 'ambiguous-default-team',
        teamRole: 'member',
        created: new Date().toISOString(),
      }),
      'utf-8',
    );
    const workspaceMind = new MindDB(
      path.join(recoveryDir, 'workspaces', 'default', 'workspace.mind'),
    );
    workspaceMind.close();
    fs.writeFileSync(managedCandidate, managedContent, 'utf-8');

    let recoveryServer = await buildLocalServer({ dataDir: recoveryDir });
    try {
      const legacyHistory = await injectWithAuth(recoveryServer, {
        method: 'GET',
        url: `/api/history?session=${sessionId}`,
      });
      const managedHistory = await injectWithAuth(recoveryServer, {
        method: 'GET',
        url: `/api/history?workspace=default&session=${sessionId}`,
      });
      const recoveryPost = await injectWithAuth(recoveryServer, {
        method: 'POST',
        url: '/api/chat',
        payload: { message: 'must not append', session: sessionId },
      });
      const recoveryDelete = await injectWithAuth(recoveryServer, {
        method: 'DELETE',
        url: `/api/chat/history?session=${sessionId}`,
      });

      expect(legacyHistory.statusCode).toBe(409);
      expect(managedHistory.statusCode).toBe(409);
      expect(recoveryPost.statusCode).toBe(409);
      expect(recoveryDelete.statusCode).toBe(409);
      expect(legacyHistory.json()).toMatchObject({
        code: 'CHAT_HISTORY_RECOVERY_REQUIRED',
      });
      expect(recoveryPost.json()).toMatchObject({
        code: 'CHAT_HISTORY_RECOVERY_REQUIRED',
      });
      expect(recoveryDelete.json()).toMatchObject({
        code: 'CHAT_HISTORY_RECOVERY_REQUIRED',
      });
      expect(fs.readFileSync(managedCandidate, 'utf-8')).toBe(managedContent);

      await recoveryServer.close();
      await new Promise(resolve => setTimeout(resolve, 100));
      recoveryServer = await buildLocalServer({ dataDir: recoveryDir });
      const restartedHistory = await injectWithAuth(recoveryServer, {
        method: 'GET',
        url: `/api/history?session=${sessionId}`,
      });
      expect(restartedHistory.statusCode).toBe(409);
      expect(fs.readFileSync(managedCandidate, 'utf-8')).toBe(managedContent);
    } finally {
      await recoveryServer.close();
      await new Promise(resolve => setTimeout(resolve, 100));
      fs.rmSync(recoveryDir, { recursive: true, force: true });
    }
  });

  it('preserves conflicting pre-layout roots and rechecks after recovery', () => {
    const recoveryDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'waggle-chat-history-conflict-'),
    );
    const sourceDir = path.join(
      recoveryDir,
      'workspaces',
      'default',
      'sessions',
    );
    const targetDir = path.join(
      chatHistoryDataDir(recoveryDir, false),
      'workspaces',
      'default',
      'sessions',
    );
    const sourceFile = path.join(sourceDir, 'source.jsonl');
    const targetFile = path.join(targetDir, 'target.jsonl');
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(sourceFile, 'source transcript\n', 'utf-8');
    fs.writeFileSync(targetFile, 'target transcript\n', 'utf-8');

    try {
      const conflict = isolateLegacyDefaultChatSessions(recoveryDir);
      expect(conflict).toMatchObject({
        status: 'recovery-required',
        code: 'CHAT_HISTORY_RECOVERY_REQUIRED',
      });
      expect(fs.readFileSync(sourceFile, 'utf-8')).toBe('source transcript\n');
      expect(fs.readFileSync(targetFile, 'utf-8')).toBe('target transcript\n');
      expect(
        fs.existsSync(path.join(recoveryDir, 'chat-history-layout.json')),
      ).toBe(false);

      fs.rmSync(sourceDir, { recursive: true, force: true });
      expect(isolateLegacyDefaultChatSessions(recoveryDir)).toEqual({
        status: 'ready',
      });
      expect(fs.readFileSync(targetFile, 'utf-8')).toBe('target transcript\n');
    } finally {
      fs.rmSync(recoveryDir, { recursive: true, force: true });
    }
  });

  it('retries a transient Windows legacy-history rename failure without losing bytes', () => {
    const recoveryDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'waggle-chat-history-rename-retry-'),
    );
    const sourceDir = path.join(
      recoveryDir,
      'workspaces',
      'default',
      'sessions',
    );
    const targetFile = path.join(
      chatHistoryDataDir(recoveryDir, false),
      'workspaces',
      'default',
      'sessions',
      'locked.jsonl',
    );
    const sourceFile = path.join(sourceDir, 'locked.jsonl');
    const sourceBytes = Buffer.from('locked transcript\r\n', 'utf-8');
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.writeFileSync(sourceFile, sourceBytes);
    const renameSpy = vi.spyOn(fs, 'renameSync').mockImplementationOnce(() => {
      throw Object.assign(new Error('file is temporarily locked'), {
        code: 'EPERM',
      });
    });

    try {
      const blocked = isolateLegacyDefaultChatSessions(recoveryDir);
      expect(blocked).toMatchObject({
        status: 'recovery-required',
        code: 'CHAT_HISTORY_RECOVERY_REQUIRED',
      });
      expect(fs.readFileSync(sourceFile)).toEqual(sourceBytes);
      expect(fs.existsSync(targetFile)).toBe(false);
      expect(
        fs.existsSync(path.join(recoveryDir, 'chat-history-layout.json')),
      ).toBe(false);
    } finally {
      renameSpy.mockRestore();
    }

    try {
      expect(isolateLegacyDefaultChatSessions(recoveryDir)).toEqual({
        status: 'ready',
      });
      expect(fs.existsSync(sourceFile)).toBe(false);
      expect(fs.readFileSync(targetFile)).toEqual(sourceBytes);
    } finally {
      fs.rmSync(recoveryDir, { recursive: true, force: true });
    }
  });
});
