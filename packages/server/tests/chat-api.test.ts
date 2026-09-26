import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { MindDB, FrameStore, SessionStore, WaggleConfig } from '@waggle/core';
import { buildLocalServer } from '../src/local/index.js';
import type { FastifyInstance } from 'fastify';
import { getPersona } from '@waggle/agent';
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
  /** Model names of the fake's requests since `start`, consecutive retries collapsed. */
  const modelsSince = (start: number): string[] => provider.requests.slice(start)
    .map(request => request.model)
    .filter((model, index, models) => model !== models[index - 1]);

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

  it('returns SSE stream with correct headers', async () => {
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/chat',
      payload: { message: 'Hello' },
    });
    expect(res.headers['content-type']).toBe('text/event-stream; charset=utf-8');
    expect(res.headers['cache-control']).toBe('no-cache');
    expect(res.headers['connection']).toBe('keep-alive');
  });

  it('streams token events', async () => {
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/chat',
      payload: { message: 'Hello' },
    });
    const events = parseSSE(res.body);
    const tokenEvents = events.filter(e => e.event === 'token');
    expect(tokenEvents.length).toBe(2);
    expect(JSON.parse(tokenEvents[0].data).content).toBe('Hello ');
    expect(JSON.parse(tokenEvents[1].data).content).toBe('world');
  });

  it('publishes safe model activity before a reasoning-sensitive turn settles', async () => {
    let releaseModel!: () => void;
    let markModelPaused!: () => void;
    let modelResumed = false;
    const modelGate = new Promise<void>(resolve => { releaseModel = resolve; });
    const modelPaused = new Promise<void>(resolve => { markModelPaused = resolve; });
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    const requestsBefore = provider.requests.length;
    // The model's first delta is private reasoning, then the stream holds open
    // until the test has read the activity step (TD-CHAT-16).
    provider.respondWith({
      type: 'stream',
      parts: [
        { reasoning: 'PRIVATE_REASONING' },
        { pause: () => { markModelPaused(); return modelGate.then(() => { modelResumed = true; }); } },
        { content: 'Safe answer' },
      ],
      usage: { inputTokens: 1, outputTokens: 2 },
    });

    try {
      const baseUrl = server.server.listening
        ? `http://127.0.0.1:${(server.server.address() as { port: number }).port}`
        : await server.listen({ host: '127.0.0.1', port: 0 });
      const response = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${getAuthToken(server)}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          message: 'Do not use tools. Provide a concise recommendation between Option A and Option B.',
          session: `live-single-pass-${Date.now()}`,
        }),
      });
      reader = response.body!.getReader();
      await modelPaused;

      const decoder = new TextDecoder();
      let observedBody = '';
      const deadline = Date.now() + 1_500;
      while (!observedBody.includes('"phase":"model_active"')) {
        const remainingMs = deadline - Date.now();
        if (remainingMs <= 0) throw new Error('Timed out waiting for safe model activity');
        const chunk = await Promise.race([
          reader.read(),
          new Promise<never>((_resolve, reject) => {
            setTimeout(() => reject(new Error('Timed out waiting for safe model activity')), remainingMs);
          }),
        ]);
        if (chunk.done) break;
        observedBody += decoder.decode(chunk.value, { stream: true });
      }

      expect(provider.requests.length - requestsBefore).toBe(1);
      expect(modelResumed).toBe(false);
      expect(observedBody).toContain('event: step');
      expect(observedBody).toContain(JSON.stringify({
        content: 'Model is responding; verifying the answer before display…',
        phase: 'model_active',
      }));
      expect(observedBody).not.toContain('event: token');
      expect(observedBody).not.toContain('event: draft_update');
      expect(observedBody).not.toContain('PRIVATE_REASONING');
    } finally {
      releaseModel();
      await reader?.cancel().catch(() => undefined);
      provider.respondWith(DEFAULT_REPLY);
    }
  });

  it('surfaces safe reasoning activity without exposing provisional model content', async () => {
    const requestsBefore = provider.requests.length;
    // Two private reasoning deltas, the second shaped like a tool call, then
    // the answer (TD-CHAT-16).
    provider.respondWith({
      type: 'stream',
      parts: [
        { reasoning: 'PRIVATE_REASONING' },
        { reasoning: '[TOOL_CALL]{"secret":"EXFIL"}' },
        { content: 'Authoritative answer' },
      ],
      usage: { inputTokens: 10, outputTokens: 5 },
    });

    try {
      const res = await injectWithAuth(server, {
        method: 'POST',
        url: '/api/chat',
        payload: { message: 'Think carefully' },
      });
      const events = parseSSE(res.body);
      const modelRequestEvents = events.filter(event => event.event === 'step'
        && JSON.parse(event.data).phase === 'model_requested');
      const reasoningEvents = events.filter(event => event.event === 'step'
        && JSON.parse(event.data).content === 'Thinking through your request…');
      const modelActivityEvents = events.filter(event => event.event === 'step'
        && JSON.parse(event.data).phase === 'model_streaming');
      const modelRequestIndex = events.indexOf(modelRequestEvents[0]);
      const reasoningIndex = events.indexOf(reasoningEvents[0]);
      const modelActivityIndex = events.indexOf(modelActivityEvents[0]);
      const tokenIndex = events.findIndex(event => event.event === 'token');
      const doneIndex = events.findIndex(event => event.event === 'done');

      expect(provider.requests.length - requestsBefore).toBe(1);
      expect(modelRequestEvents).toHaveLength(1);
      expect(JSON.parse(modelRequestEvents[0].data)).toEqual({
        content: 'Sending your request to the model…',
        phase: 'model_requested',
      });
      expect(reasoningEvents).toHaveLength(1);
      expect(modelActivityEvents).toHaveLength(1);
      expect(JSON.parse(modelActivityEvents[0].data)).toEqual({
        content: 'Writing the answer…',
        phase: 'model_streaming',
      });
      expect(modelRequestIndex).toBeGreaterThanOrEqual(0);
      expect(reasoningIndex).toBeGreaterThan(modelRequestIndex);
      expect(events.some(event => event.event === 'draft_update')).toBe(false);
      expect(modelActivityIndex).toBeGreaterThan(reasoningIndex);
      expect(tokenIndex).toBeGreaterThan(modelActivityIndex);
      expect(doneIndex).toBeGreaterThan(tokenIndex);
      expect(JSON.parse(events[tokenIndex].data).content).toBe('Authoritative answer');
      expect(JSON.parse(events[doneIndex].data).content).toBe('Authoritative answer');
      expect(res.body).not.toContain('PRIVATE_REASONING');
      expect(res.body).not.toContain('EXFIL');
    } finally {
      provider.respondWith(DEFAULT_REPLY);
    }
  });

  it('streams retry status before backoff settles while answer tokens remain authoritative', async () => {
    const retryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-chat-retry-status-'));
    const retryServer = await buildLocalServer({ dataDir: retryDir });
    retryServer.agentState.llmProvider = {
      provider: 'anthropic-proxy', health: 'healthy', detail: 'fake LLM provider', checkedAt: new Date().toISOString(),
    };
    retryServer.llmRetryBackoffMs = () => 0;
    let releaseRetry!: () => void;
    let markRetryRequested!: () => void;
    let modelAnswered = false;
    const retryGate = new Promise<void>(resolve => { releaseRetry = resolve; });
    const retryRequested = new Promise<void>(resolve => { markRetryRequested = resolve; });
    const retryNotice = 'Connection to the model failed — retrying in 2s (retry 1/3)...';

    // The first model request fails in transport, so the loop's own retry
    // policy announces the retry; the retried request is held open
    // (TD-CHAT-16).
    let modelCalls = 0;
    provider.respondWith(async () => {
      modelCalls += 1;
      if (modelCalls === 1) return { type: 'network_error', message: 'fetch failed' };
      markRetryRequested();
      await retryGate;
      modelAnswered = true;
      return { type: 'text', content: 'Recovered answer', usage: { inputTokens: 1, outputTokens: 1 } };
    });

    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    let observedBody = '';
    try {
      const baseUrl = await retryServer.listen({ host: '127.0.0.1', port: 0 });
      const responsePromise = fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${getAuthToken(retryServer)}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          message: 'Recover visibly from a transient provider outage',
          session: `retry-status-${Date.now()}`,
        }),
      });

      await retryRequested;
      const response = await Promise.race([
        responsePromise,
        new Promise<never>((_resolve, reject) => {
          setTimeout(() => reject(new Error('Timed out waiting for retry status response headers')), 3_000);
        }),
      ]);
      reader = response.body!.getReader();
      const decoder = new TextDecoder();
      const deadline = Date.now() + 3_000;
      while (!observedBody.includes(retryNotice)) {
        const remainingMs = deadline - Date.now();
        if (remainingMs <= 0) throw new Error('Timed out waiting for retry status SSE bytes');
        const chunk = await Promise.race([
          reader.read(),
          new Promise<never>((_resolve, reject) => {
            setTimeout(() => reject(new Error('Timed out waiting for retry status SSE bytes')), remainingMs);
          }),
        ]);
        if (chunk.done) break;
        observedBody += decoder.decode(chunk.value, { stream: true });
      }

      expect(modelCalls).toBe(2);
      expect(modelAnswered).toBe(false);
      expect(observedBody).toContain('event: step');
      expect(observedBody).toContain(retryNotice);
      expect(observedBody).not.toContain('event: token');
      expect(observedBody).not.toContain('event: done');

      releaseRetry();
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        observedBody += decoder.decode(chunk.value, { stream: true });
      }
      observedBody += decoder.decode();
      const events = parseSSE(observedBody);
      const tokenContents = events
        .filter(event => event.event === 'token')
        .map(event => JSON.parse(event.data).content);
      const doneEvents = events.filter(event => event.event === 'done');

      expect(tokenContents).toEqual(['Recovered answer']);
      expect(doneEvents).toHaveLength(1);
      expect(JSON.parse(doneEvents[0].data).content).toBe('Recovered answer');
      expect(tokenContents.join('')).not.toContain(retryNotice);
    } finally {
      releaseRetry();
      await reader?.cancel().catch(() => undefined);
      provider.respondWith(DEFAULT_REPLY);
      await retryServer.close();
      await new Promise(resolve => setTimeout(resolve, 100));
      try {
        fs.rmSync(retryDir, { recursive: true, force: true });
      } catch {
        // Windows can retain SQLite handles briefly after Fastify closes.
      }
    }
  }, 15_000);

  it('suppresses late reasoning and model output after a live client disconnect', async () => {
    const abortDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-chat-abort-'));
    const abortServer = await buildLocalServer({ dataDir: abortDir });
    abortServer.agentState.llmProvider = {
      provider: 'anthropic-proxy', health: 'healthy', detail: 'fake LLM provider', checkedAt: new Date().toISOString(),
    };
    abortServer.llmRetryBackoffMs = () => 0;
    let capturedSignal: AbortSignal | undefined;
    let releaseModel!: () => void;
    let markReasoningStarted!: () => void;
    let markModelFinished!: () => void;
    const modelGate = new Promise<void>(resolve => { releaseModel = resolve; });
    const reasoningStarted = new Promise<void>(resolve => { markReasoningStarted = resolve; });
    const modelFinished = new Promise<void>(resolve => { markModelFinished = resolve; });
    const sessionId = `live-disconnect-${Date.now()}`;

    // The fake keeps streaming after the disconnect, like a provider that
    // ignores cancellation, to exercise late deltas (TD-CHAT-16).
    provider.respondWith(request => {
      capturedSignal = request.signal;
      return {
        type: 'stream',
        parts: [
          { reasoning: 'thinking' },
          { pause: () => { markReasoningStarted(); return modelGate; } },
          { reasoning: 'LATE_PRIVATE_REASONING' },
          { content: '[TOOL_CALL]{"secret":"LATE_EXFIL"}' },
          { content: 'LATE_AUTHORITATIVE_RESPONSE' },
          { pause: () => markModelFinished() },
        ],
        usage: { inputTokens: 1, outputTokens: 1 },
      };
    });

    const controller = new AbortController();
    let observedBody = '';
    try {
      const baseUrl = await abortServer.listen({ host: '127.0.0.1', port: 0 });
      const responsePromise = fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${getAuthToken(abortServer)}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ message: 'Start then disconnect', session: sessionId }),
        signal: controller.signal,
      });

      await reasoningStarted;
      const response = await responsePromise;
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      const deadline = Date.now() + 3_000;
      while (!observedBody.includes('Thinking through your request…')) {
        const remainingMs = deadline - Date.now();
        if (remainingMs <= 0) throw new Error('Timed out waiting for the complete reasoning SSE event');
        const chunk = await Promise.race([
          reader.read(),
          new Promise<never>((_resolve, reject) => {
            setTimeout(() => reject(new Error('Timed out waiting for reasoning SSE bytes')), remainingMs);
          }),
        ]);
        if (chunk.done) break;
        observedBody += decoder.decode(chunk.value, { stream: true });
      }
      expect(observedBody).toContain('Thinking through your request…');

      controller.abort();
      await vi.waitFor(() => expect(capturedSignal?.aborted).toBe(true), { timeout: 3_000 });
      releaseModel();
      await modelFinished;
      await new Promise(resolve => setTimeout(resolve, 100));

      let postAbortMessages: Array<{ role: string; content: string }> = [];
      provider.respondWith(request => {
        postAbortMessages = request.messages.filter(message => message.role !== 'system');
        return { type: 'text', content: 'post-abort probe ok', usage: { inputTokens: 1, outputTokens: 1 } };
      });
      const postAbortProbe = await injectWithAuth(abortServer, {
        method: 'POST',
        url: '/api/chat',
        payload: { message: 'Probe canonical history after disconnect', session: sessionId },
      });
      const postAbortEvents = parseSSE(postAbortProbe.body);

      expect(postAbortProbe.statusCode).toBe(200);
      expect(postAbortMessages.at(-1)).toEqual({
        role: 'user',
        content: 'Probe canonical history after disconnect',
      });
      expect(postAbortEvents.filter(event => event.event === 'done')).toHaveLength(1);
      expect(JSON.stringify(postAbortMessages)).not.toContain('LATE_PRIVATE_REASONING');
      expect(JSON.stringify(postAbortMessages)).not.toContain('LATE_EXFIL');
      expect(JSON.stringify(postAbortMessages)).not.toContain('LATE_AUTHORITATIVE_RESPONSE');
    } finally {
      controller.abort();
      releaseModel();
      provider.respondWith(DEFAULT_REPLY);
      await abortServer.close();
      await new Promise(resolve => setTimeout(resolve, 100));
      try {
        fs.rmSync(abortDir, { recursive: true, force: true });
      } catch {
        // Windows can retain SQLite handles briefly after Fastify closes.
      }
    }
  }, 20_000);

  it('keeps failed-attempt output out of the fallback response stream', async () => {
    // Its own server: the failed primary's transport retries count against
    // the model endpoint's circuit breaker (TD-CHAT-16 §5).
    const fallbackDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-chat-failed-attempt-'));
    const fallbackServer = await buildLocalServer({ dataDir: fallbackDir });
    fallbackServer.agentState.llmProvider = {
      provider: 'anthropic-proxy', health: 'healthy', detail: 'fake LLM provider', checkedAt: new Date().toISOString(),
    };
    fallbackServer.llmRetryBackoffMs = () => 0;
    const config = new WaggleConfig(fallbackDir);
    config.setFallbackModel('ollama/fallback-test-model');
    config.save();
    const fakeFetch = globalThis.fetch;
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      if (String(input).endsWith('/api/tags')) {
        return new Response(JSON.stringify({
          models: [
            { name: 'primary-test-model' },
            { name: 'fallback-test-model' },
          ],
        }), { status: 200 });
      }
      if (String(input).endsWith('/chat/completions')) return fakeFetch(input, init);
      return new Response('', { status: 503 });
    });
    const requestsBefore = provider.requests.length;
    // The primary streams private reasoning and provisional content, then its
    // stream is cut before [DONE]; the route's same-model replay cannot reach
    // the endpoint, so the turn falls back (TD-CHAT-16).
    let primaryCalls = 0;
    provider.respondWith(request => {
      if (request.model !== 'primary-test-model') {
        return {
          type: 'stream',
          parts: [{ reasoning: 'fallback thinking' }, { content: 'fallback ok' }],
          usage: { inputTokens: 1, outputTokens: 1 },
        };
      }
      primaryCalls += 1;
      if (primaryCalls > 1) return { type: 'network_error', message: 'fetch failed' };
      return {
        type: 'stream',
        parts: [
          { reasoning: 'FAILED_PRIVATE_REASONING' },
          { content: '[TOOL_CALL]{"secret":"FAILED_EXFIL"}' },
        ],
        usage: { inputTokens: 1, outputTokens: 1 },
        truncated: true,
      };
    });

    try {
      const response = await injectWithAuth(fallbackServer, {
        method: 'POST',
        url: '/api/chat',
        payload: {
          message: 'Exercise isolated fallback streaming',
          model: 'ollama/primary-test-model',
          session: `reasoning-fallback-${Date.now()}`,
        },
      });
      const events = parseSSE(response.body);
      const reasoningEvents = events.filter(event => event.event === 'step'
        && JSON.parse(event.data).content === 'Thinking through your request…');
      const tokenContents = events
        .filter(event => event.event === 'token')
        .map(event => JSON.parse(event.data).content);
      const doneEvents = events.filter(event => event.event === 'done');

      expect(response.statusCode).toBe(200);
      const errorEvents = events.filter(event => event.event === 'error');
      expect(errorEvents).toHaveLength(0);
      expect(modelsSince(requestsBefore)).toEqual(['primary-test-model', 'fallback-test-model']);
      expect(reasoningEvents).toHaveLength(1);
      expect(events.filter(event => event.event === 'model_switch')).toHaveLength(1);
      expect(events.some(event => event.event === 'draft_update')).toBe(false);
      expect(tokenContents).toEqual(['fallback ok']);
      expect(doneEvents).toHaveLength(1);
      expect(JSON.parse(doneEvents[0].data)).toMatchObject({
        content: 'fallback ok',
        model: 'ollama/fallback-test-model',
      });
      expect(response.body).not.toContain('FAILED_PRIVATE_REASONING');
      expect(response.body).not.toContain('FAILED_EXFIL');
    } finally {
      fetchSpy.mockRestore();
      provider.respondWith(DEFAULT_REPLY);
      await fallbackServer.close();
      await new Promise(resolve => setTimeout(resolve, 100));
      try {
        fs.rmSync(fallbackDir, { recursive: true, force: true });
      } catch {
        // Windows can retain SQLite handles briefly after Fastify closes.
      }
    }
  });

  it('falls back from a blank no-tool response without leaking provisional text', async () => {
    const config = new WaggleConfig(tmpDir);
    const previousFallback = config.getFallbackModel();
    config.setFallbackModel('ollama/blank-fallback-model');
    config.save();
    // The real loop runs both attempts; model calls reach the suite's fake
    // (TD-CHAT-16).
    const fakeFetch = globalThis.fetch;
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      if (String(input).endsWith('/api/tags')) {
        return new Response(JSON.stringify({
          models: [
            { name: 'blank-primary-model' },
            { name: 'blank-fallback-model' },
          ],
        }), { status: 200 });
      }
      if (String(input).endsWith('/chat/completions')) return fakeFetch(input, init);
      return new Response('', { status: 503 });
    });
    const requestsBefore = provider.requests.length;
    provider.respondWith(request => (
      request.model === 'blank-primary-model'
        ? { type: 'text', content: ' \n', usage: { inputTokens: 10, outputTokens: 2 } }
        : { type: 'text', content: 'fallback ok', usage: { inputTokens: 10, outputTokens: 2 } }
    ));

    try {
      const response = await injectWithAuth(server, {
        method: 'POST',
        url: '/api/chat',
        payload: {
          message: 'Exercise blank response fallback.',
          model: 'ollama/blank-primary-model',
          session: `blank-fallback-${Date.now()}`,
        },
      });
      const events = parseSSE(response.body);

      expect(modelsSince(requestsBefore)).toEqual(['blank-primary-model', 'blank-fallback-model']);
      expect(events.filter(event => event.event === 'error')).toHaveLength(0);
      expect(events.filter(event => event.event === 'token').map(event => JSON.parse(event.data).content))
        .toEqual(['fallback ok']);
      expect(events.filter(event => event.event === 'model_switch')).toHaveLength(1);
      expect(JSON.parse(events.find(event => event.event === 'done')!.data)).toMatchObject({
        content: 'fallback ok',
        model: 'ollama/blank-fallback-model',
      });
      expect(events.filter(event => event.event === 'token').some(event => !JSON.parse(event.data).content.trim()))
        .toBe(false);
    } finally {
      fetchSpy.mockRestore();
      provider.respondWith(DEFAULT_REPLY);
      if (previousFallback) config.setFallbackModel(previousFallback);
      else config.clearFallbackModel();
      config.save();
    }
  });

  // Re-pinned on the real path (TD-CHAT-16 ruling 13): both attempts get a
  // blank provider answer, and the loop rejects each with its own message.
  it('terminates truthfully when both the primary and configured fallback are blank', async () => {
    const config = new WaggleConfig(tmpDir);
    const previousFallback = config.getFallbackModel();
    const workspaceId = server.workspaceManager.create({
      name: `Double blank ${Date.now()}`,
      group: 'test',
    }).id;
    const sessionId = `double-blank-session-${Date.now()}`;
    config.setFallbackModel('ollama/double-blank-fallback');
    config.save();
    const fakeFetch = globalThis.fetch;
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      if (String(input).endsWith('/api/tags')) {
        return new Response(JSON.stringify({
          models: [
            { name: 'double-blank-primary' },
            { name: 'double-blank-fallback' },
          ],
        }), { status: 200 });
      }
      if (String(input).endsWith('/chat/completions')) return fakeFetch(input, init);
      return new Response('', { status: 503 });
    });
    const requestsBefore = provider.requests.length;
    provider.respondWith({ type: 'text', content: ' \n', usage: { inputTokens: 1, outputTokens: 1 } });

    try {
      const response = await injectWithAuth(server, {
        method: 'POST',
        url: '/api/chat',
        payload: {
          message: 'Both attempts must fail truthfully.',
          model: 'ollama/double-blank-primary',
          workspace: workspaceId,
          session: sessionId,
        },
      });
      const events = parseSSE(response.body);

      expect(modelsSince(requestsBefore)).toEqual(['double-blank-primary', 'double-blank-fallback']);
      expect(events.filter(event => event.event === 'token')).toHaveLength(0);
      expect(events.filter(event => event.event === 'done')).toHaveLength(0);
      expect(events.filter(event => event.event === 'error')).toHaveLength(1);

      const inMemory = server.agentState.sessionHistories.get(
        chatSessionStateKey(workspaceId, sessionId),
      ) ?? [];
      expect(inMemory).toHaveLength(2);
      expect(inMemory[1].content)
        .toBe(`${GENERATION_FAILED_PREFIX}LLM returned an empty assistant response with no tool calls`);
      expect(inMemory[1].content.trim()).not.toBe('');
      expect(loadSessionMessages(tmpDir, workspaceId, sessionId)).toEqual(inMemory);
    } finally {
      fetchSpy.mockRestore();
      provider.respondWith(DEFAULT_REPLY);
      server.sessionManager.close(workspaceId);
      if (previousFallback) config.setFallbackModel(previousFallback);
      else config.clearFallbackModel();
      config.save();
    }
  });

  // Ported (TD-CHAT-16 §6n): a real search_memory call stands in for the
  // injected mutate_state tool, and the route's own auto_recall event is
  // filtered out of the count, as the ruling-4 stage filter does.
  it('does not replay completed tools when a terminal response is blank', async () => {
    const config = new WaggleConfig(tmpDir);
    const previousFallback = config.getFallbackModel();
    const workspaceId = server.workspaceManager.create({
      name: `Tool blank ${Date.now()}`,
      group: 'test',
    }).id;
    const sessionId = `tool-blank-session-${Date.now()}`;
    config.setFallbackModel('ollama/tool-blank-fallback');
    config.save();
    const fakeFetch = globalThis.fetch;
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      if (String(input).endsWith('/api/tags')) {
        return new Response(JSON.stringify({
          models: [
            { name: 'tool-blank-primary' },
            { name: 'tool-blank-fallback' },
          ],
        }), { status: 200 });
      }
      if (String(input).endsWith('/chat/completions')) return fakeFetch(input, init);
      return new Response('', { status: 503 });
    });
    const requestsBefore = provider.requests.length;
    provider.respondWith([
      { type: 'tool_calls', calls: [{ name: 'search_memory', args: { query: 'completed work' } }] },
      { type: 'text', content: '', chunks: [] },
      { type: 'text', content: 'fallback should not run' },
    ]);

    try {
      const response = await injectWithAuth(server, {
        method: 'POST',
        url: '/api/chat',
        payload: {
          message: 'Search memory for completed work. Do not repeat completed work.',
          model: 'ollama/tool-blank-primary',
          workspace: workspaceId,
          session: sessionId,
        },
      });
      const events = parseSSE(response.body);

      const modelToolEvents = (name: string) => events
        .filter(event => event.event === name && JSON.parse(event.data).name !== 'auto_recall');
      expect(provider.requests.slice(requestsBefore).map(request => request.model))
        .toEqual(['tool-blank-primary', 'tool-blank-primary']);
      expect(events.filter(event => event.event === 'done')).toHaveLength(0);
      expect(events.filter(event => event.event === 'error')).toHaveLength(1);
      expect(modelToolEvents('tool').map(event => JSON.parse(event.data).name)).toEqual(['search_memory']);
      expect(modelToolEvents('tool_result')).toHaveLength(1);
      expect(events.filter(event => event.event === 'model_switch')).toHaveLength(0);

      const inMemory = server.agentState.sessionHistories.get(
        chatSessionStateKey(workspaceId, sessionId),
      ) ?? [];
      expect(inMemory).toHaveLength(2);
      expect(inMemory[1].content).toContain(`${GENERATION_FAILED_PREFIX}LLM returned an empty assistant response`);
      expect(inMemory[1].content.trim()).not.toBe('');
      expect(loadSessionMessages(tmpDir, workspaceId, sessionId)).toEqual(inMemory);
    } finally {
      fetchSpy.mockRestore();
      provider.respondWith(DEFAULT_REPLY);
      server.sessionManager.close(workspaceId);
      if (previousFallback) config.setFallbackModel(previousFallback);
      else config.clearFallbackModel();
      config.save();
    }
  });

  it('consumes explicit read-only tool choice only after tool use across credential and model retries', async () => {
    const runScenario = async (firstCredentialUsesTool: boolean) => {
      const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-tool-choice-runner-'));
      const toolServer = await buildLocalServer({ dataDir });
      const workspace = toolServer.workspaceManager.create({
        name: `Tool choice ${Date.now()}`,
        group: 'test',
      });
      const sessionId = `tool-choice-runner-${Date.now()}-${firstCredentialUsesTool}`;
      const personaDir = path.join(dataDir, 'personas');
      fs.mkdirSync(personaDir, { recursive: true });
      fs.writeFileSync(path.join(personaDir, 'strict-private-persona.json'), JSON.stringify({
        id: 'strict-private-persona',
        name: 'Strict private persona',
        description: 'Route-level prompt isolation fixture',
        icon: 'test',
        systemPrompt: 'CUSTOM_PERSONA_PRIVATE_SENTINEL',
        modelPreference: 'claude-sonnet-4-6',
        tools: ['list_skills'],
        workspaceAffinity: [],
        suggestedCommands: [],
        defaultWorkflow: null,
      }), 'utf8');
      toolServer.workspaceManager.update(workspace.id, { personaId: 'strict-private-persona' });
      persistMessage(dataDir, workspace.id, sessionId, {
        role: 'user',
        content: 'PRIOR_USER_HISTORY_SENTINEL',
      });
      persistMessage(dataDir, workspace.id, sessionId, {
        role: 'assistant',
        content: 'PRIOR_ASSISTANT_HISTORY_SENTINEL',
      });
      const originalFetch = globalThis.fetch;
      const requests: Array<{
        authorization: string | null;
        model: string;
        toolChoice?: unknown;
        toolNames: string[];
        systemPrompt: string;
        nonSystemMessages: Array<{ role: string; content: string }>;
        maxTokens?: number;
        stream?: unknown;
        streamOptions?: unknown;
      }> = [];
      const config = new WaggleConfig(dataDir);
      config.setFallbackModel('ollama/fallback-test-model');
      config.save();
      toolServer.vault.set('anthropic', 'sk-primary-tool-choice');
      toolServer.vault.set('anthropic-2', 'sk-secondary-tool-choice');
      toolServer.agentState.llmProvider = {
        provider: 'anthropic-proxy',
        health: 'healthy',
        detail: 'test',
        checkedAt: new Date().toISOString(),
      };
      globalThis.fetch = vi.fn(async (input, init) => {
        if (String(input).endsWith('/api/tags')) {
          return new Response(JSON.stringify({ models: [{ name: 'fallback-test-model' }] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
        const authorization = new Headers(init?.headers).get('authorization');
        const model = String(body.model ?? '');
        const requestMessages = Array.isArray(body.messages)
          ? body.messages as Array<{ role?: unknown; content?: unknown }>
          : [];
        const requestTools = Array.isArray(body.tools)
          ? body.tools as Array<{ function?: { name?: unknown } }>
          : [];
        requests.push({
          authorization,
          model,
          toolChoice: body.tool_choice,
          toolNames: requestTools.map(tool => String(tool.function?.name ?? '')),
          systemPrompt: String(requestMessages.find(item => item.role === 'system')?.content ?? ''),
          nonSystemMessages: requestMessages
            .filter(item => item.role !== 'system')
            .map(item => ({ role: String(item.role ?? ''), content: String(item.content ?? '') })),
          ...(typeof body.max_tokens === 'number' ? { maxTokens: body.max_tokens } : {}),
          ...(body.stream !== undefined ? { stream: body.stream } : {}),
          ...(body.stream_options !== undefined ? { streamOptions: body.stream_options } : {}),
        });

        if (model === 'fallback-test-model') {
          if (body.tool_choice) return openAiToolJsonResponse('list_skills');
          const hasCompletedToolEvidence = requestMessages.some(message => (
            message.role === 'tool'
            || String(message.content ?? '').includes('# STRICT READ-ONLY TOOL CONTINUATION')
          ));
          return hasCompletedToolEvidence
            ? body.stream === true
              ? openAiSseResponse('fallback completed')
              : openAiJsonResponse('fallback completed')
            : new Response(JSON.stringify({ error: { message: 'missing completed tool evidence' } }), {
                status: 422,
                headers: { 'Content-Type': 'application/json' },
              });
        }
        if (authorization === 'Bearer sk-primary-tool-choice' && firstCredentialUsesTool) {
          const messages = body.messages as Array<{ role?: string }> | undefined;
          if (!messages?.some(message => message.role === 'tool')) {
            return openAiToolJsonResponse('list_skills');
          }
        }
        return new Response(JSON.stringify({ error: { message: '401 test credential rejection' } }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      });

      try {
        const response = await injectWithAuth(toolServer, {
          method: 'POST',
          url: '/api/chat',
          payload: {
            message: 'Call list_skills exactly once.',
            model: 'claude-sonnet-4-6',
            session: sessionId,
            workspace: workspace.id,
          },
        });
        const toolEvents = parseSSE(response.body)
          .filter(event => event.event === 'tool')
          .map(event => JSON.parse(event.data).name);
        const toolResults = parseSSE(response.body)
          .filter(event => event.event === 'tool_result')
          .map(event => String(JSON.parse(event.data).result ?? ''));
        return { response, requests, toolEvents, toolResults };
      } finally {
        globalThis.fetch = originalFetch;
        await toolServer.close();
        fs.rmSync(dataDir, { recursive: true, force: true });
      }
    };

    const afterToolUse = await runScenario(true);
    expect(afterToolUse.response.statusCode).toBe(200);
    expect(afterToolUse.toolEvents.filter(name => name === 'list_skills')).toHaveLength(1);
    expect(afterToolUse.toolEvents).not.toContain('auto_recall');
    expect(afterToolUse.toolResults).toHaveLength(1);
    for (const request of afterToolUse.requests.filter(request => request.toolChoice)) {
      expect(request.stream).toBeUndefined();
      expect(request.streamOptions).toBeUndefined();
    }
    for (const request of afterToolUse.requests) {
      expect(request.systemPrompt).not.toContain('CUSTOM_PERSONA_PRIVATE_SENTINEL');
      expect(JSON.stringify(request.nonSystemMessages)).not.toContain('PRIOR_USER_HISTORY_SENTINEL');
      expect(JSON.stringify(request.nonSystemMessages)).not.toContain('PRIOR_ASSISTANT_HISTORY_SENTINEL');
    }
    const primaryRequests = afterToolUse.requests.filter(request => (
      request.authorization === 'Bearer sk-primary-tool-choice'
      && request.model === 'anthropic/claude-sonnet-4-6'
    ));
    expect(primaryRequests).toHaveLength(2);
    expect(primaryRequests[0].toolNames).toEqual(['list_skills']);
    expect(primaryRequests[0].nonSystemMessages).toEqual([
      { role: 'user', content: 'Call list_skills exactly once.' },
    ]);
    expect(primaryRequests[1].toolNames).toEqual([]);
    const forcedRequestIndex = afterToolUse.requests.findIndex(request => request.toolChoice);
    expect(forcedRequestIndex).toBeGreaterThanOrEqual(0);
    expect(afterToolUse.requests.slice(forcedRequestIndex + 1).every(request => (
      request.toolNames.length === 0 && request.toolChoice === undefined
    ))).toBe(true);
    for (const request of primaryRequests) {
      expect(request.systemPrompt.length).toBeLessThan(12_000);
      expect(request.systemPrompt).toContain('# STRICT READ-ONLY TOOL TURN');
      expect(request.systemPrompt).not.toContain('# Context From Your Memory');
      expect(request.systemPrompt).not.toContain('# Recalled Memories');
      expect(request.systemPrompt).not.toContain("# Why You're Here");
      expect(request.maxTokens).toBeLessThanOrEqual(512);
    }
    expect(afterToolUse.requests.find(request => (
      request.authorization === 'Bearer sk-primary-tool-choice'
      && request.toolChoice
    ))?.toolChoice).toEqual({ type: 'function', function: { name: 'list_skills' } });
    expect(afterToolUse.requests.find(request => (
      request.authorization === 'Bearer sk-secondary-tool-choice'
    ))?.toolChoice).toBeUndefined();
    expect(afterToolUse.requests.find(request => request.model === 'fallback-test-model')?.toolChoice)
      .toBeUndefined();
    const continuationRequests = afterToolUse.requests.filter(request => (
      request.authorization === 'Bearer sk-secondary-tool-choice'
      || request.model === 'fallback-test-model'
    ));
    expect(continuationRequests).toHaveLength(2);
    for (const request of continuationRequests) {
      const continuation = request.nonSystemMessages.at(-1)?.content ?? '';
      expect(continuation).toContain('# STRICT READ-ONLY TOOL CONTINUATION');
      expect(continuation).toContain(JSON.stringify(afterToolUse.toolResults[0]));
    }
    const done = parseSSE(afterToolUse.response.body).find(event => event.event === 'done');
    expect(done).toBeDefined();
    expect(JSON.parse(done!.data).toolsUsed).toEqual(['list_skills']);

    const beforeToolUse = await runScenario(false);
    expect(beforeToolUse.response.statusCode).toBe(200);
    expect(beforeToolUse.toolEvents.filter(name => name === 'list_skills')).toHaveLength(1);
    expect(beforeToolUse.requests.find(request => (
      request.authorization === 'Bearer sk-primary-tool-choice'
    ))?.toolChoice).toEqual({ type: 'function', function: { name: 'list_skills' } });
    expect(beforeToolUse.requests.find(request => (
      request.authorization === 'Bearer sk-secondary-tool-choice'
    ))?.toolChoice).toEqual({ type: 'function', function: { name: 'list_skills' } });
    expect(beforeToolUse.requests.find(request => request.model === 'fallback-test-model')?.toolChoice)
      .toEqual({ type: 'function', function: { name: 'list_skills' } });
  }, 30_000);

  it('keeps a natural explicit read_file request to one bounded tool round', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-natural-read-file-'));
    const workspaceDir = path.join(dataDir, 'linked-workspace');
    fs.mkdirSync(workspaceDir, { recursive: true });
    fs.writeFileSync(
      path.join(workspaceDir, 'sentinel.txt'),
      'Error: NATURAL_READ_FILE_SENTINEL\nweekly',
      'utf8',
    );
    const configuredModel = 'openai-compatible/qwen3.8-flash-next';
    const config = new WaggleConfig(dataDir);
    config.setDefaultModel(configuredModel);
    config.setProvider('openai-compatible', {
      apiKey: '',
      models: ['qwen3.8-flash-next'],
      baseUrl: 'http://qwen-natural-read.test/v1',
    });
    config.save();
    const toolServer = await buildLocalServer({ dataDir });
    const workspace = toolServer.workspaceManager.create({
      name: 'Natural read file workspace',
      group: 'test',
      directory: workspaceDir,
      model: configuredModel,
    });
    const originalFetch = globalThis.fetch;
    const requests: Record<string, unknown>[] = [];
    globalThis.fetch = vi.fn(async (input, init) => {
      if (String(input).endsWith('/models')) {
        return new Response(JSON.stringify({ data: [{ id: 'qwen3.8-flash-next' }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      requests.push(body);
      const messages = Array.isArray(body.messages)
        ? body.messages as Array<{ role?: unknown }>
        : [];
      return messages.some(message => message.role === 'tool')
        ? openAiJsonResponse('MODEL_MISINTERPRETED_MARKERS')
        : openAiToolJsonResponse('read_file', { path: 'sentinel.txt' });
    });

    try {
      const message = 'Use the read_file tool to read sentinel.txt, then report the exact file contents between FILE_START and FILE_END.';
      const response = await injectWithAuth(toolServer, {
        method: 'POST',
        url: '/api/chat',
        payload: {
          message,
          model: configuredModel,
          session: 'natural-read-file',
          workspace: workspace.id,
        },
      });
      const events = parseSSE(response.body);
      const doneEvent = events.find(event => event.event === 'done');
      expect(doneEvent, response.body).toBeDefined();
      const done = JSON.parse(doneEvent!.data);
      const toolEvents = events
        .filter(event => event.event === 'tool')
        .map(event => JSON.parse(event.data) as { name?: unknown; input?: unknown });
      const toolResults = events
        .filter(event => event.event === 'tool_result')
        .map(event => JSON.parse(event.data) as { name?: unknown; result?: unknown });
      const modelRequests = requests.filter(request => Array.isArray(request.messages));
      const firstTools = modelRequests[0]?.tools as Array<{ function?: { name?: unknown } }>;

      expect(response.statusCode).toBe(200);
      expect(toolEvents).toEqual([{ name: 'read_file', input: { path: 'sentinel.txt' } }]);
      expect(toolResults).toMatchObject([{
        name: 'read_file',
        result: 'Error: NATURAL_READ_FILE_SENTINEL\nweekly',
      }]);
      expect(events.filter(event => event.event === 'error')).toHaveLength(0);
      expect(done).toMatchObject({
        content: 'FILE_START\nError: NATURAL_READ_FILE_SENTINEL\nweekly\nFILE_END',
        toolsUsed: ['read_file'],
        contextMetrics: {
          packageMode: 'compact',
          toolSelectedCount: 1,
        },
      });
      expect(modelRequests).toHaveLength(2);
      expect(firstTools.map(tool => tool.function?.name)).toEqual(['read_file']);
      expect(modelRequests[0]?.tool_choice).toEqual({ type: 'function', function: { name: 'read_file' } });
      expect(modelRequests[0]?.max_tokens).toBeLessThanOrEqual(3_072);
      expect(modelRequests[1]?.tools).toBeUndefined();
      expect(modelRequests[1]?.tool_choice).toBeUndefined();
      const firstMessages = modelRequests[0]?.messages as Array<{ role?: unknown; content?: unknown }>;
      expect(firstMessages.filter(item => item.role !== 'system')).toEqual([{ role: 'user', content: message }]);
      expect(String(firstMessages.find(item => item.role === 'system')?.content ?? ''))
        .toContain('# STRICT READ-ONLY TOOL TURN');
      expect(events
        .filter(event => event.event === 'token')
        .map(event => (JSON.parse(event.data) as { content?: string }).content ?? '')
        .join(''))
        .toBe('FILE_START\nError: NATURAL_READ_FILE_SENTINEL\nweekly\nFILE_END');
      expect(response.body).not.toContain('MODEL_MISINTERPRETED_MARKERS');
      expect(loadSessionMessages(dataDir, workspace.id, 'natural-read-file').at(-1)?.content)
        .toBe('FILE_START\nError: NATURAL_READ_FILE_SENTINEL\nweekly\nFILE_END');
    } finally {
      globalThis.fetch = originalFetch;
      await toolServer.close();
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, 30_000);

  it.each([
    {
      label: 'a model-selected path that differs from the user request',
      requestedPath: 'requested.txt',
      selectedPath: 'other.txt',
      expectedFailure: 'must read the complete explicitly requested workspace file',
      session: 'bound-natural-read-file-wrong-path',
    },
    {
      label: 'a requested file that does not exist',
      requestedPath: 'missing.txt',
      selectedPath: 'missing.txt',
      expectedFailure: 'ENOENT',
      session: 'bound-natural-read-file-missing',
    },
    {
      label: 'a linked-workspace sensitive-file denial',
      requestedPath: 'credentials.json',
      selectedPath: 'credentials.json',
      expectedFailure: 'Access to sensitive file denied',
      session: 'bound-natural-read-file-sensitive',
    },
  ])('refuses $label', async ({ requestedPath, selectedPath, expectedFailure, session }) => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-natural-read-file-bound-'));
    const workspaceDir = path.join(dataDir, 'linked-workspace');
    fs.mkdirSync(workspaceDir, { recursive: true });
    fs.writeFileSync(path.join(workspaceDir, 'requested.txt'), 'REQUESTED_FILE_SENTINEL');
    fs.writeFileSync(path.join(workspaceDir, 'other.txt'), 'WRONG_PATH_SECRET_SENTINEL');
    fs.writeFileSync(path.join(workspaceDir, 'credentials.json'), 'SENSITIVE_FILE_SENTINEL');
    const configuredModel = 'openai-compatible/qwen3.8-flash-next';
    const config = new WaggleConfig(dataDir);
    config.setDefaultModel(configuredModel);
    config.setProvider('openai-compatible', {
      apiKey: '',
      models: ['qwen3.8-flash-next'],
      baseUrl: 'http://qwen.test/v1',
    });
    config.save();
    const toolServer = await buildLocalServer({ dataDir });
    const workspace = toolServer.workspaceManager.create({
      name: 'Bound read file workspace',
      group: 'test',
      directory: workspaceDir,
      model: configuredModel,
    });
    const originalFetch = globalThis.fetch;
    const requests: Record<string, unknown>[] = [];
    globalThis.fetch = vi.fn(async (input, init) => {
      if (String(input).endsWith('/models')) {
        return new Response(JSON.stringify({ data: [{ id: 'qwen3.8-flash-next' }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      requests.push(body);
      const messages = Array.isArray(body.messages)
        ? body.messages as Array<{ role?: unknown }>
        : [];
      return messages.some(message => message.role === 'tool')
        ? openAiJsonResponse('PATH_GUARD_HANDLED')
        : openAiToolJsonResponse('read_file', { path: selectedPath });
    });

    try {
      const response = await injectWithAuth(toolServer, {
        method: 'POST',
        url: '/api/chat',
        payload: {
          message: `Read ${requestedPath} in this workspace, then return the exact file contents.`,
          model: configuredModel,
          session,
          workspace: workspace.id,
        },
      });
      const events = parseSSE(response.body);
      const toolEvent = JSON.parse(events.find(event => event.event === 'tool')!.data);
      const toolResult = JSON.parse(events.find(event => event.event === 'tool_result')!.data);
      const done = events.find(event => event.event === 'done');
      const error = events.find(event => event.event === 'error');
      const serializedResults = JSON.stringify(toolResult);
      const modelRequests = requests.filter(request => Array.isArray(request.messages));

      expect(response.statusCode).toBe(200);
      expect(events.filter(event => event.event === 'tool')).toHaveLength(1);
      expect(events.filter(event => event.event === 'tool_result')).toHaveLength(1);
      expect(toolEvent).toMatchObject({ name: 'read_file', input: { path: selectedPath } });
      expect(toolResult).toMatchObject({
        name: 'read_file',
        result: expect.stringContaining(expectedFailure),
        isError: true,
      });
      expect(serializedResults).not.toContain('WRONG_PATH_SECRET_SENTINEL');
      expect(serializedResults).not.toContain('REQUESTED_FILE_SENTINEL');
      expect(serializedResults).not.toContain('SENSITIVE_FILE_SENTINEL');
      expect(done).toBeUndefined();
      expect(error).toBeDefined();
      expect(JSON.parse(error!.data).message).toContain('read_file');
      expect(events.filter(event => event.event === 'token')).toHaveLength(0);
      expect(response.body).not.toContain('PATH_GUARD_HANDLED');
      expect(loadSessionMessages(dataDir, workspace.id, session)
        .some(item => item.role === 'assistant' && item.content.includes('PATH_GUARD_HANDLED')))
        .toBe(false);
      expect(modelRequests).toHaveLength(2);
      expect(modelRequests[0]?.tool_choice).toEqual({ type: 'function', function: { name: 'read_file' } });
      expect(modelRequests[1]?.tools).toBeUndefined();
    } finally {
      globalThis.fetch = originalFetch;
      await toolServer.close();
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, 30_000);

  it.each([
    ['rejects non-boolean line_numbers', 'typed.txt', { path: 'typed.txt', line_numbers: 'false' }],
    ['rejects an oversized exact read', 'large.txt', { path: 'large.txt' }],
    ['rejects an oversized Error-prefixed exact read', 'large-error.txt', { path: 'large-error.txt' }],
  ] as const)('%s', async (_label, requestedPath, toolArgs) => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-natural-read-file-guard-'));
    const workspaceDir = path.join(dataDir, 'linked-workspace');
    fs.mkdirSync(workspaceDir, { recursive: true });
    fs.writeFileSync(path.join(workspaceDir, 'typed.txt'), 'TYPED_ARGUMENT_SENTINEL', 'utf8');
    fs.writeFileSync(path.join(workspaceDir, 'large.txt'), 'LARGE_FILE_PRIVATE_SENTINEL'.repeat(240), 'utf8');
    fs.writeFileSync(
      path.join(workspaceDir, 'large-error.txt'),
      'Error: LARGE_ERROR_FILE_PRIVATE_SENTINEL'.repeat(240),
      'utf8',
    );
    const configuredModel = 'openai-compatible/qwen3.8-flash-next';
    const config = new WaggleConfig(dataDir);
    config.setDefaultModel(configuredModel);
    config.setProvider('openai-compatible', {
      apiKey: '',
      models: ['qwen3.8-flash-next'],
      baseUrl: 'http://qwen-read-guard.test/v1',
    });
    config.save();
    const toolServer = await buildLocalServer({ dataDir });
    const workspace = toolServer.workspaceManager.create({
      name: 'Guarded read file workspace',
      group: 'test',
      directory: workspaceDir,
      model: configuredModel,
    });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (input, init) => {
      if (String(input).endsWith('/models')) {
        return new Response(JSON.stringify({ data: [{ id: 'qwen3.8-flash-next' }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      const messages = Array.isArray(body.messages)
        ? body.messages as Array<{ role?: unknown }>
        : [];
      return messages.some(message => message.role === 'tool')
        ? openAiJsonResponse('FABRICATED_GUARD_SUCCESS')
        : openAiToolJsonResponse('read_file', toolArgs);
    });

    try {
      const response = await injectWithAuth(toolServer, {
        method: 'POST',
        url: '/api/chat',
        payload: {
          message: `Read ${requestedPath} in this workspace, then return the exact file contents.`,
          model: configuredModel,
          session: `guarded-read-${requestedPath.replace(/[^A-Za-z0-9_-]/g, '-')}`,
          workspace: workspace.id,
        },
      });
      const events = parseSSE(response.body);
      const toolResultEvent = events.find(event => event.event === 'tool_result');
      expect(toolResultEvent, response.body).toBeDefined();
      const toolResult = JSON.parse(toolResultEvent!.data);
      const serialized = JSON.stringify(toolResult);

      expect(response.statusCode).toBe(200);
      expect(events.filter(event => event.event === 'tool')).toHaveLength(1);
      expect(events.filter(event => event.event === 'tool_result')).toHaveLength(1);
      expect(events.find(event => event.event === 'done')).toBeUndefined();
      expect(events.find(event => event.event === 'error')).toBeDefined();
      expect(toolResult.result).toMatch(/^Error:/);
      expect(serialized).not.toContain('TYPED_ARGUMENT_SENTINEL');
      expect(serialized).not.toContain('LARGE_FILE_PRIVATE_SENTINEL');
      expect(serialized).not.toContain('LARGE_ERROR_FILE_PRIVATE_SENTINEL');
      expect(response.body).not.toContain('FABRICATED_GUARD_SUCCESS');
    } finally {
      globalThis.fetch = originalFetch;
      await toolServer.close();
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, 30_000);

  it('fails closed when a detected read-only tool is denied by the active persona', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-tool-choice-blocked-'));
    const blockedServer = await buildLocalServer({ dataDir });
    const workspace = blockedServer.workspaceManager.create({
      name: `Blocked tool choice ${Date.now()}`,
      group: 'test',
    });
    const personaDir = path.join(dataDir, 'personas');
    fs.mkdirSync(personaDir, { recursive: true });
    fs.writeFileSync(path.join(personaDir, 'deny-list-skills.json'), JSON.stringify({
      id: 'deny-list-skills',
      name: 'Deny list skills',
      description: 'Authorization fixture',
      icon: 'test',
      systemPrompt: 'DENIED_PERSONA_PRIVATE_SENTINEL',
      modelPreference: 'claude-sonnet-4-6',
      tools: ['list_skills', 'read_file'],
      disallowedTools: ['list_skills', 'read_file'],
      workspaceAffinity: [],
      suggestedCommands: [],
      defaultWorkflow: null,
    }), 'utf8');
    blockedServer.workspaceManager.update(workspace.id, { personaId: 'deny-list-skills' });
    const originalFetch = globalThis.fetch;
    const outboundBodies: Record<string, unknown>[] = [];
    blockedServer.vault.set('anthropic', 'sk-blocked-tool-choice');
    blockedServer.agentState.llmProvider = {
      provider: 'anthropic-proxy',
      health: 'healthy',
      detail: 'test',
      checkedAt: new Date().toISOString(),
    };
    globalThis.fetch = vi.fn(async (_input, init) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      // The local server may perform unrelated background health requests while
      // this global test double is installed. Count only actual model payloads;
      // otherwise a timing-dependent `{}` request shifts the assertions.
      if (Array.isArray(body.messages)) outboundBodies.push(body);
      return openAiSseResponse('The requested tool is not available in this workspace.');
    });

    try {
      const response = await injectWithAuth(blockedServer, {
        method: 'POST',
        url: '/api/chat',
        payload: {
          message: 'Call list_skills exactly once.',
          model: 'claude-sonnet-4-6',
          session: `blocked-tool-choice-${Date.now()}`,
          workspace: workspace.id,
        },
      });
      const events = parseSSE(response.body);
      const outbound = outboundBodies[0];
      const outboundMessages = outbound.messages as Array<{ role?: unknown; content?: unknown }>;

      expect(response.statusCode).toBe(200);
      expect(outboundBodies).toHaveLength(1);
      expect(outbound.tools ?? []).toEqual([]);
      expect(outbound.tool_choice).toBeUndefined();
      expect(String(outboundMessages.find(message => message.role === 'system')?.content ?? ''))
        .toContain('# UNAVAILABLE READ-ONLY TOOL TURN');
      expect(JSON.stringify(outboundMessages)).not.toContain('DENIED_PERSONA_PRIVATE_SENTINEL');
      expect(events.filter(event => event.event === 'tool')).toHaveLength(0);
      expect(events.filter(event => event.event === 'error')).toHaveLength(0);
      expect(JSON.parse(events.find(event => event.event === 'done')!.data)).toMatchObject({
        content: 'The requested tool is not available in this workspace.',
        toolsUsed: [],
      });

      const readResponse = await injectWithAuth(blockedServer, {
        method: 'POST',
        url: '/api/chat',
        payload: {
          message: 'Read README.md in this workspace, then return the exact file contents.',
          model: 'claude-sonnet-4-6',
          session: `blocked-read-file-${Date.now()}`,
          workspace: workspace.id,
        },
      });
      const readEvents = parseSSE(readResponse.body);
      const readOutbound = outboundBodies[1];
      const readMessages = readOutbound.messages as Array<{ role?: unknown; content?: unknown }>;
      expect(readResponse.statusCode).toBe(200);
      expect(outboundBodies).toHaveLength(2);
      expect(readOutbound.tools ?? []).toEqual([]);
      expect(readOutbound.tool_choice).toBeUndefined();
      expect(String(readMessages.find(message => message.role === 'system')?.content ?? ''))
        .toContain('# UNAVAILABLE READ-ONLY TOOL TURN');
      expect(JSON.stringify(readMessages)).not.toContain('DENIED_PERSONA_PRIVATE_SENTINEL');
      expect(readEvents.filter(event => event.event === 'tool')).toHaveLength(0);
    } finally {
      globalThis.fetch = originalFetch;
      await blockedServer.close();
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it('keeps strict-looking trusted turns on the full history path', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-tool-choice-trusted-'));
    const trustedServer = await buildLocalServer({ dataDir });
    const workspace = trustedServer.workspaceManager.create({
      name: `Trusted tool choice ${Date.now()}`,
      group: 'test',
    });
    const sessionId = `trusted-tool-choice-${Date.now()}`;
    persistMessage(dataDir, workspace.id, sessionId, {
      role: 'user',
      content: 'TRUSTED_PRIOR_USER_SENTINEL',
    });
    persistMessage(dataDir, workspace.id, sessionId, {
      role: 'assistant',
      content: 'TRUSTED_PRIOR_ASSISTANT_SENTINEL',
    });
    // The real loop runs; the first model request is read off the wire
    // (TD-CHAT-16).
    trustedServer.agentState.llmProvider = {
      provider: 'anthropic-proxy', health: 'healthy', detail: 'fake LLM provider', checkedAt: new Date().toISOString(),
    };
    trustedServer.llmRetryBackoffMs = () => 0;
    const requestsBefore = provider.requests.length;
    provider.respondWith({ type: 'text', content: 'trusted full path', usage: { inputTokens: 1, outputTokens: 1 } });

    try {
      const message = 'Read README.md in this workspace, then return the exact file contents.';
      const response = await injectWithAuth(trustedServer, {
        method: 'POST',
        url: '/api/chat',
        payload: {
          message,
          model: 'claude-sonnet-4-6',
          session: sessionId,
          workspace: workspace.id,
          autonomy: { level: 'trusted' },
        },
      });

      expect(response.statusCode).toBe(200);
      expect(provider.requests.length).toBeGreaterThan(requestsBefore);
      const captured = provider.requests[requestsBefore];
      expect(captured.systemPrompt).not.toContain('# STRICT READ-ONLY TOOL TURN');
      expect(captured.messages).toEqual(expect.arrayContaining([
        { role: 'user', content: 'TRUSTED_PRIOR_USER_SENTINEL' },
        { role: 'assistant', content: 'TRUSTED_PRIOR_ASSISTANT_SENTINEL' },
        { role: 'user', content: message },
      ]));
    } finally {
      provider.respondWith(DEFAULT_REPLY);
      await trustedServer.close();
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it('fails closed when the provider ignores the required read-only tool choice', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-tool-choice-ignored-'));
    const ignoredServer = await buildLocalServer({ dataDir });
    const workspace = ignoredServer.workspaceManager.create({
      name: `Ignored tool choice ${Date.now()}`,
      group: 'test',
    });
    const originalFetch = globalThis.fetch;
    const outboundBodies: Record<string, unknown>[] = [];
    const config = new WaggleConfig(dataDir);
    config.clearFallbackModel();
    config.save();
    ignoredServer.vault.set('anthropic', 'sk-ignored-tool-choice');
    ignoredServer.agentState.llmProvider = {
      provider: 'anthropic-proxy',
      health: 'healthy',
      detail: 'test',
      checkedAt: new Date().toISOString(),
    };
    globalThis.fetch = vi.fn(async (_input, init) => {
      outboundBodies.push(JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>);
      return openAiJsonResponse('FABRICATED_UNVERIFIED_TOOL_RESULT');
    });

    try {
      const response = await injectWithAuth(ignoredServer, {
        method: 'POST',
        url: '/api/chat',
        payload: {
          message: 'Call list_skills exactly once.',
          model: 'claude-sonnet-4-6',
          session: `ignored-tool-choice-${Date.now()}`,
          workspace: workspace.id,
        },
      });
      const events = parseSSE(response.body);

      expect(response.statusCode).toBe(200);
      expect(outboundBodies).toHaveLength(1);
      expect(outboundBodies[0].tool_choice).toEqual({
        type: 'function',
        function: { name: 'list_skills' },
      });
      expect(events.filter(event => event.event === 'tool')).toHaveLength(0);
      expect(events.filter(event => event.event === 'error')).toHaveLength(1);
      expect(events.filter(event => (
        event.event === 'done'
        && String(JSON.parse(event.data).content ?? '').includes('FABRICATED_UNVERIFIED_TOOL_RESULT')
      ))).toHaveLength(0);
      expect(response.body).not.toContain('FABRICATED_UNVERIFIED_TOOL_RESULT');
    } finally {
      globalThis.fetch = originalFetch;
      await ignoredServer.close();
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it('translates a validated OpenAI forced tool choice for the native Anthropic route', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-anthropic-tool-choice-'));
    const proxyServer = await buildLocalServer({ dataDir });
    const originalFetch = globalThis.fetch;
    proxyServer.vault.set('anthropic', 'sk-anthropic-tool-choice');
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({
      content: [{ type: 'text', text: 'native tool choice accepted' }],
      model: 'claude-sonnet-4-6',
      stop_reason: 'end_turn',
      usage: { input_tokens: 1, output_tokens: 1 },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    const tool = {
      type: 'function',
      function: {
        name: 'list_skills',
        description: 'List installed skills',
        parameters: { type: 'object', properties: {} },
      },
    } as const;
    // Only the provider calls count: a live server may fetch in the background
    // (a startup probe or monitor), and the global spy sees those too (TD-TEST-20).
    const messagesCalls = () => vi.mocked(globalThis.fetch).mock.calls
      .filter(([url]) => String(url) === 'https://api.anthropic.com/v1/messages');
    try {
      const response = await injectWithAuth(proxyServer, {
        method: 'POST',
        url: '/v1/chat/completions',
        payload: {
          model: 'anthropic/claude-sonnet-4-6',
          messages: [{ role: 'user', content: 'Call list_skills exactly once.' }],
          tools: [tool],
          tool_choice: { type: 'function', function: { name: 'list_skills' } },
          parallel_tool_calls: false,
          stream: false,
        },
      });
      expect(response.statusCode).toBe(200);
      const outboundBody = JSON.parse(String(
        messagesCalls()[0]?.[1]?.body ?? '{}',
      ));
      expect(outboundBody.tool_choice).toEqual({
        type: 'tool',
        name: 'list_skills',
        disable_parallel_tool_use: true,
      });

      for (const [choice, expectedType] of [['auto', 'auto'], ['required', 'any']] as const) {
        const mapped = await injectWithAuth(proxyServer, {
          method: 'POST',
          url: '/v1/chat/completions',
          payload: {
            model: 'anthropic/claude-sonnet-4-6',
            messages: [{ role: 'user', content: 'Use available tools.' }],
            tools: [tool],
            tool_choice: choice,
            parallel_tool_calls: false,
            stream: false,
          },
        });
        expect(mapped.statusCode).toBe(200);
        const mappedBody = JSON.parse(String(
          messagesCalls().at(-1)?.[1]?.body ?? '{}',
        ));
        expect(mappedBody.tool_choice).toEqual({
          type: expectedType,
          disable_parallel_tool_use: true,
        });
      }

      const invalid = await injectWithAuth(proxyServer, {
        method: 'POST',
        url: '/v1/chat/completions',
        payload: {
          model: 'anthropic/claude-sonnet-4-6',
          messages: [{ role: 'user', content: 'Call hidden_tool.' }],
          tools: [tool],
          tool_choice: { type: 'function', function: { name: 'hidden_tool' } },
          stream: false,
        },
      });
      expect(invalid.statusCode).toBe(400);
      expect(messagesCalls()).toHaveLength(3);
    } finally {
      globalThis.fetch = originalFetch;
      await proxyServer.close();
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });
});


/**
 * Regression: in-app chat failed with LiteLLM's
 *   {"message":"No connected db.","type":"no_db_connection","code":"400"}
 * because the credential pool injected a *provider* key (e.g. sk-ant-…) as the
 * bearer sent TO LiteLLM. LiteLLM validates only its master key in-memory; any
 * other key is treated as a virtual key and looked up in its database → 400 when
 * no DB is attached. The fix: skip the credential pool when the active provider
 * is LiteLLM, so the LiteLLM master key is used. The direct anthropic-proxy path
 * must still use the per-provider pool key.
 */
describe('Chat LiteLLM key routing (regression: no_db_connection)', () => {
  let server: FastifyInstance;
  let tmpDir: string;
  let capturedKey: string | undefined;
  let keyRouteProvider: FakeLlmProvider;
  const MASTER_KEY = 'sk-litellm-master-test';
  const POOL_KEY = 'sk-ant-pool-test';

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-chat-keyroute-'));
    const mind = new MindDB(path.join(tmpDir, 'personal.mind'));
    mind.close();

    server = await buildLocalServer({ dataDir: tmpDir });

    // Seed a provider key so the 'anthropic' credential pool is NON-empty —
    // without this the pool is empty and the bug can't be observed.
    server.vault.set('anthropic', POOL_KEY);

    // The LiteLLM master key Waggle authenticates to the proxy with.
    server.agentState.litellmApiKey = MASTER_KEY;

    // The real loop runs against a fake provider, which records the bearer key
    // each model request carried (TD-CHAT-16).
    server.llmRetryBackoffMs = () => 0;
    keyRouteProvider = installFakeLlmProvider({
      respond: request => {
        capturedKey = request.authorization?.replace(/^Bearer /, '') ?? undefined;
        return { type: 'text', content: 'ok', usage: { inputTokens: 1, outputTokens: 1 } };
      },
    });
  });

  afterAll(async () => {
    keyRouteProvider.restore();
    await server.close();
    await new Promise(r => setTimeout(r, 100));
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* EBUSY on Windows */ }
  });

  it('LiteLLM provider → sends the LiteLLM master key, NOT a provider pool key', async () => {
    server.agentState.llmProvider = {
      provider: 'litellm', health: 'healthy', detail: 'test', checkedAt: new Date().toISOString(),
    };
    capturedKey = undefined;

    await injectWithAuth(server, {
      method: 'POST',
      url: '/api/chat',
      payload: { message: 'hi', model: 'claude-sonnet-4-6' },
    });

    // Pre-fix this was POOL_KEY → LiteLLM rejected it as an unknown virtual key.
    expect(capturedKey).toBe(MASTER_KEY);
    expect(capturedKey).not.toBe(POOL_KEY);
  });

  it('anthropic-proxy provider → still uses the credential pool key (direct path unchanged)', async () => {
    server.agentState.llmProvider = {
      provider: 'anthropic-proxy', health: 'healthy', detail: 'test', checkedAt: new Date().toISOString(),
    };
    capturedKey = undefined;

    await injectWithAuth(server, {
      method: 'POST',
      url: '/api/chat',
      payload: { message: 'hi', model: 'claude-sonnet-4-6' },
    });

    expect(capturedKey).toBe(POOL_KEY);
  });
});

describe('applyContextWindow', () => {
  it('returns all messages when under the limit', () => {
    const messages = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there' },
    ];
    const result = applyContextWindow(messages);
    expect(result).toEqual(messages);
    expect(result.length).toBe(2);
  });

  it('returns all messages when exactly at the limit', () => {
    const messages = Array.from({ length: MAX_CONTEXT_MESSAGES }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `msg-${i}`,
    }));
    const result = applyContextWindow(messages);
    expect(result).toEqual(messages);
    expect(result.length).toBe(MAX_CONTEXT_MESSAGES);
  });

  it('truncates and prepends notice when history exceeds limit', () => {
    const totalMessages = 60;
    const messages = Array.from({ length: totalMessages }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `msg-${i}`,
    }));

    const result = applyContextWindow(messages);

    // Should be MAX_CONTEXT_MESSAGES + 1 truncation notice
    expect(result.length).toBe(MAX_CONTEXT_MESSAGES + 1);

    // First message is the truncation notice
    expect(result[0].role).toBe('system');
    expect(result[0].content).toContain('Context summary');
    expect(result[0].content).toContain(`${totalMessages - MAX_CONTEXT_MESSAGES} earlier messages`);

    // Remaining messages are the last MAX_CONTEXT_MESSAGES from the original
    const expectedMessages = messages.slice(-MAX_CONTEXT_MESSAGES);
    expect(result.slice(1)).toEqual(expectedMessages);

    // Last message should be the most recent
    expect(result[result.length - 1].content).toBe(`msg-${totalMessages - 1}`);
  });

  it('preserves the most recent messages', () => {
    const messages = Array.from({ length: 55 }, (_, i) => ({
      role: 'user',
      content: `msg-${i}`,
    }));

    const result = applyContextWindow(messages);
    // The oldest kept message should be msg-5 (55 - 50 = 5 truncated)
    expect(result[1].content).toBe('msg-5');
    expect(result[result.length - 1].content).toBe('msg-54');
  });

  it('accepts a custom max messages parameter', () => {
    const messages = Array.from({ length: 10 }, (_, i) => ({
      role: 'user',
      content: `msg-${i}`,
    }));

    const result = applyContextWindow(messages, 5);
    expect(result.length).toBe(6); // 5 messages + 1 truncation notice
    expect(result[0].role).toBe('system');
    expect(result[0].content).toContain('5 earlier messages');
    expect(result[1].content).toBe('msg-5');
  });
});

describe('conversational gated tool filtering', () => {
  const tools = [
    { name: 'search_memory' },
    { name: 'save_memory' },
    { name: 'web_search' },
    { name: 'web_fetch' },
    { name: 'query_knowledge' },
    { name: 'git_log' },
    { name: 'write_file' },
    { name: 'bash' },
    { name: 'git_push' },
    { name: 'create_plan' },
    { name: 'spawn_agent' },
    { name: 'run_code' },
    { name: 'get_task_output' },
  ];

  it('hides gated system tools for normal conversational turns', () => {
    const filtered = filterGatedToolsForConversationalTurn(
      tools,
      "Prove you're not just a ChatGPT wrapper. What can you concretely do?",
      'normal',
    ).map(t => t.name);

    expect(filtered).toEqual([]);
  });

  it('keeps memory search when the user explicitly asks for memory recall', () => {
    const filtered = filterGatedToolsForConversationalTurn(
      tools,
      'Search memory for my product notes',
      'normal',
    ).map(t => t.name);

    expect(filtered).toEqual(['search_memory']);
  });

  it('keeps web tools when the user explicitly asks for external research', () => {
    expect(isExplicitExternalResearchRequest('Research the latest MCP connector options online')).toBe(true);
    const filtered = filterGatedToolsForConversationalTurn(
      tools,
      'Research the latest MCP connector options online',
      'normal',
    ).map(t => t.name);

    expect(filtered).toEqual(['web_search', 'web_fetch']);
  });

  it('keeps memory save when the user explicitly asks to remember something', () => {
    expect(isExplicitMemorySaveRequest('Remember this: I prefer concise launch reports')).toBe(true);
    const filtered = filterGatedToolsForConversationalTurn(
      tools,
      'Remember this: I prefer concise launch reports',
      'normal',
    ).map(t => t.name);

    expect(filtered).toEqual(['save_memory']);
  });

  it('keeps gated tools when the user explicitly asks for an action', () => {
    expect(isExplicitGatedToolRequest('Write this as a file and export a document')).toBe(true);
    for (const request of [
      'Fix the failing TypeScript test',
      'Build a roadmap with dependencies',
      'Prepare a meeting brief from prior notes',
      'Verify this implementation with evidence',
      'Delegate parallel research to agents',
    ]) {
      expect(isExplicitGatedToolRequest(request), request).toBe(true);
    }
    const filtered = filterGatedToolsForConversationalTurn(
      tools,
      'Write this as a file and export a document',
      'normal',
    ).map(t => t.name);

    expect(filtered).toContain('write_file');
    expect(filtered).not.toContain('create_plan');
  });

  it('does not require capability acquisition for the exact native file round-trip', () => {
    const message = 'Create file named pm-write-read-1788105943.txt in this workspace containing exactly single line QWEN_WRITE_READ_OK. Then verify saved file by reading it and respond with exactly QWEN_WRITE_READ_OK.';

    expect(isExplicitGatedToolRequest(message)).toBe(true);
    expect(shouldRequireCapabilityAcquisitionTools(message)).toBe(false);
    expect(shouldRequireCapabilityAcquisitionTools('Create a reusable skill for release triage.')).toBe(true);
  });

  it('withholds plan authoring for an inline advisory plan but keeps explicit plan creation', () => {
    const advisory = filterGatedToolsForConversationalTurn(
      tools,
      'Choose the order, justify it in one concise plan, and identify the first action for today.',
      'normal',
    ).map(tool => tool.name);
    expect(advisory).not.toContain('create_plan');

    const explicit = filterGatedToolsForConversationalTurn(
      tools,
      'Create a product launch plan and a concise launch memo.',
      'normal',
    ).map(tool => tool.name);
    expect(explicit).toContain('create_plan');
  });

  it('does not treat a prioritization plan as authorization to execute tools', () => {
    const message = 'I have three priorities this week: close one customer, repair onboarding friction, and investigate a production memory bug. Choose the order, justify it in one concise plan, and identify the first action for today. Do not ask clarifying questions; make reasonable assumptions.';
    expect(isExplicitGatedToolRequest(message)).toBe(false);
    expect(isExplicitExternalResearchRequest(message)).toBe(false);

    const filtered = filterGatedToolsForConversationalTurn(tools, message, 'normal')
      .map(tool => tool.name);
    expect(filtered).toEqual([]);
  });

  it('treats a broad no-change clause as authoritative at every autonomy level', () => {
    const message = 'Turn this goal into milestones and exit criteria. Do not create or edit anything.';
    expect(isExplicitGatedToolRequest(message)).toBe(false);
    for (const autonomy of ['normal', 'trusted', 'yolo'] as const) {
      const filtered = filterGatedToolsForConversationalTurn(tools, message, autonomy)
        .map(tool => tool.name);
      expect(filtered, autonomy).toContain('search_memory');
      expect(filtered, autonomy).toContain('git_log');
      for (const mutation of ['save_memory', 'write_file', 'bash', 'git_push', 'create_plan', 'spawn_agent']) {
        expect(filtered, `${autonomy}:${mutation}`).not.toContain(mutation);
      }
    }
  });

  it('can deny memory persistence without blocking another explicit action', () => {
    const filtered = filterGatedToolsForConversationalTurn(
      tools,
      'Write this as a file, but do not save this to memory.',
      'normal',
    ).map(tool => tool.name);

    expect(filtered).toContain('write_file');
    expect(filtered).not.toContain('save_memory');
  });

  it('does not broaden a calendar-only prohibition into a memory ban', () => {
    const filtered = filterGatedToolsForConversationalTurn(
      tools,
      'Remember this preference, but do not create a calendar event.',
      'normal',
    ).map(tool => tool.name);

    expect(filtered).toContain('save_memory');
  });

  it('keeps gated tools when elevated autonomy is active', () => {
    const filtered = filterGatedToolsForConversationalTurn(
      tools,
      'Give me a concise answer',
      'trusted',
    ).map(t => t.name);

    expect(filtered).toEqual(tools.map(t => t.name));
  });

  it('recognizes explicit memory recall requests separately from topical memory discussion', () => {
    const positiveRequests = [
      'What do you remember about me?',
      'What memories have you saved about me?',
      'Search memory for my product notes',
      'Search in my memory for prior launch notes',
      'Show me my memories',
      'Recall our launch decision',
      'Remember what I told you about launch timing',
      'Do you remember when we selected the local model?',
      'Use Waggle memory if available: what did I ask you to remember in another session?',
      'Use Waggle memory if available: what exact project codename did I ask you to remember in another session?',
      'Use Waggle memory if available: when did we choose the codename in another session?',
      'Use Waggle memory if available: after which meeting did we choose the codename?',
      'Use Waggle memory if available: when did we approve the budget in another session?',
      'Use Waggle memory if available: after which meeting did we approve the budget?',
      'Use Waggle memory if available: when exactly did we approve the budget in another session?',
      'Use Waggle memory if available: after exactly which meeting did we approve the budget?',
      'Use Waggle memory if available: when, exactly, did we approve the budget?',
      'Find our saved launch decision',
      'Retrieve my saved decision',
      'Tell me what I asked you to remember in another conversation.',
      'Look in my memory for the Qwen endpoint.',
    ];
    const topicalRequests = [
      'How does persistent memory affect agent reliability?',
      'Compare precision and recall for these search results',
      'Recall the formula for cosine similarity',
      'Explain how to remember the order of operations',
      'Investigate a product recall with current primary sources',
      'Find the memory leak in this TypeScript service',
      'Inspect memory usage for the local model',
      'Search memory store benchmarks',
      'Find my context window limit',
      'Search prior history of SQLite',
      'Retrieve my notes app installer',
      'Translate this sentence: "What project codename did I ask you to remember in another session?"',
      'Compare desktop AI memory store architectures',
      'Use current primary sources to compare SQLite vector search with PostgreSQL plus pgvector for a single-user desktop AI memory store.',
    ];

    for (const request of positiveRequests) {
      expect(isExplicitMemoryRecallRequest(request), request).toBe(true);
    }
    for (const request of topicalRequests) {
      expect(isExplicitMemoryRecallRequest(request), request).toBe(false);
    }
  });

  it('does not treat an attributed memory question as the user requesting recall', () => {
    for (const request of [
      'Alice said: what did I ask you to remember in another session? Please explain her statement.',
      'Alice asked: what did I ask you to remember in another session? Please explain her question.',
      'Alice requested: what did I ask you to remember in another session? Please explain her request.',
      'Alice said — search my saved memory for the codename. Explain her request.',
      'Alice said, search my saved memory for the codename. Explain her request.',
      'According to Alice: what did I ask you to remember in another session? Explain that.',
      "Alice's request: use my saved memory if available. Critique it.",
    ]) {
      expect(isExplicitMemoryRecallRequest(request), request).toBe(false);
      expect(filterGatedToolsForConversationalTurn(tools, request, 'normal').map(tool => tool.name), request).toEqual([]);
    }
  });

  it('does not treat an unquoted descriptive memory question as a recall request', () => {
    for (const request of [
      'Quote: what did I ask you to remember in another session?',
      'Explain: what did I ask you to remember in another session?',
      'Analyze this question: what did I ask you to remember in another session?',
      'Summarize this question: what did I ask you to remember in another session?',
      'Rewrite this question: what did I ask you to remember in another session?',
      'Summarize: what did I ask you to remember in another session?',
      'Rewrite: what did I ask you to remember in another session?',
      'alice said: what did I ask you to remember in another session? Please explain her statement.',
      'Please summarize: what did I ask you to remember in another session?',
      'Summarize briefly: what did I ask you to remember in another session?',
      'Can you rewrite: what did I ask you to remember in another session?',
      'Proofread this sentence: search my saved memory for launch notes.',
      'Evaluate this prompt: search my saved memory for launch notes.',
      'Answer whether this is clear: use my saved memory if available.',
      'Discuss this question: what did I ask you to remember in another session?',
      'Correct the grammar: what do you remember about me?',
      'Alice told me: what did I ask you to remember in another session? Please explain her statement.',
    ]) {
      expect(isExplicitMemoryRecallRequest(request), request).toBe(false);
      expect(filterGatedToolsForConversationalTurn(tools, request, 'normal').map(tool => tool.name), request).toEqual([]);
    }
  });

  it('preserves a later explicit action after attributed memory content', () => {
    const request = 'Alice said: what did I ask you to remember in another session? Please explain her statement. Then send the explanation to Bob.';
    expect(isExplicitMemoryRecallRequest(request)).toBe(false);
    expect(isExplicitGatedToolRequest(request)).toBe(true);
  });

  it('does not spend a memory-tool round on an external vector-search comparison', () => {
    const filtered = filterGatedToolsForConversationalTurn(
      tools,
      'Use current primary sources to compare SQLite vector search with PostgreSQL plus pgvector for a single-user desktop AI memory store. Cite source URLs.',
      'normal',
    ).map(tool => tool.name);

    expect(filtered).toEqual(['web_search', 'web_fetch']);
  });

  it('applies the same conversational narrowing to plugin tools', () => {
    const provider = {
      getAllTools: () => [
        { name: 'bash', description: '', parameters: {}, execute: async () => 'ok' },
        { name: 'web_search', description: '', parameters: {}, execute: async () => 'ok' },
        { name: 'save_memory', description: '', parameters: {}, execute: async () => 'ok' },
        { name: 'plugin_slack_send_message', description: 'Send a Slack message', parameters: {}, execute: async () => 'ok' },
        { name: 'mcp_github_create_issue', description: 'Create a GitHub issue', parameters: {}, execute: async () => 'ok' },
      ],
    };
    const withheld: number[] = [];

    const filteredProvider = filterPluginToolsForConversationalTurn(
      provider,
      "Prove you're not just a ChatGPT wrapper. What can you concretely do?",
      'normal',
      count => withheld.push(count),
    );

    expect(filteredProvider.getAllTools().map(t => t.name)).toEqual([]);
    expect(withheld).toEqual([5]);
  });
});
