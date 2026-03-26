import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { MindDB, FrameStore, SessionStore } from '@waggle/core';
import { buildLocalServer } from '../src/local/index.js';
import type { FastifyInstance } from 'fastify';
import type { AgentLoopConfig, AgentResponse } from '@waggle/agent';
import { applyContextWindow, MAX_CONTEXT_MESSAGES } from '../src/local/routes/chat.js';
import { injectWithAuth, resetRateLimiter } from './test-utils.js';

/**
 * Parse raw SSE response body into an array of { event, data } objects.
 */
function parseSSE(raw: string): Array<{ event: string; data: string }> {
  const events: Array<{ event: string; data: string }> = [];
  const blocks = raw.split(/\n\n/).filter(Boolean);
  for (const block of blocks) {
    let event = '';
    let data = '';
    for (const line of block.split('\n')) {
      if (line.startsWith('event: ')) {
        event = line.slice(7);
      } else if (line.startsWith('data: ')) {
        data = line.slice(6);
      }
    }
    if (event || data) {
      events.push({ event, data });
    }
  }
  return events;
}

describe('Chat Streaming API', () => {
  let server: FastifyInstance;
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-chat-test-'));

    // Create personal.mind with test data
    const personalPath = path.join(tmpDir, 'personal.mind');
    const mind = new MindDB(personalPath);
    const sessions = new SessionStore(mind);
    const frames = new FrameStore(mind);
    const s1 = sessions.create('test-project');
    frames.createIFrame(s1.gop_id, 'Waggle chat test content', 'normal');
    mind.close();

    // Mock agent runner that simulates streaming tokens
    const mockAgentRunner = async (config: AgentLoopConfig): Promise<AgentResponse> => {
      if (config.onToken) {
        config.onToken('Hello ');
        config.onToken('world');
      }
      return {
        content: 'Hello world',
        toolsUsed: [],
        usage: { inputTokens: 10, outputTokens: 5 },
      };
    };

    server = await buildLocalServer({ dataDir: tmpDir });
    server.agentRunner = mockAgentRunner;
  });

  afterAll(async () => {
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
    expect(res.headers['content-type']).toBe('text/event-stream');
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
  });

  it('validates message is required', async () => {
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/chat',
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toContain('message');
  });

  it('validates empty message string', async () => {
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/chat',
      payload: { message: '' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('handles agent errors gracefully', async () => {
    // Temporarily replace agent runner with one that throws
    const originalRunner = server.agentRunner;
    server.agentRunner = async () => {
      throw new Error('LiteLLM is not available');
    };

    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/chat',
      payload: { message: 'Hello' },
    });

    const events = parseSSE(res.body);
    const errorEvents = events.filter(e => e.event === 'error');
    expect(errorEvents.length).toBe(1);
    const errorData = JSON.parse(errorEvents[0].data);
    expect(errorData.message).toContain('LiteLLM is not available');

    // Restore original runner
    server.agentRunner = originalRunner;
  });

  it('streams tool use events', async () => {
    const originalRunner = server.agentRunner;
    server.agentRunner = async (config: AgentLoopConfig): Promise<AgentResponse> => {
      if (config.onToken) config.onToken('Search results: ...');
      if (config.onToolUse) config.onToolUse('web_search', { query: 'waggle bees' });
      return {
        content: 'Search results: ...',
        toolsUsed: ['web_search'],
        usage: { inputTokens: 20, outputTokens: 15 },
      };
    };

    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/chat',
      payload: { message: 'Search for waggle bees' },
    });

    const events = parseSSE(res.body);
    const tokenEvents = events.filter(e => e.event === 'token');
    expect(tokenEvents.length).toBe(1);
    expect(JSON.parse(tokenEvents[0].data).content).toBe('Search results: ...');

    const toolEvents = events.filter(e => e.event === 'tool');
    expect(toolEvents.length).toBe(1);
    const toolData = JSON.parse(toolEvents[0].data);
    expect(toolData.name).toBe('web_search');
    expect(toolData.input).toEqual({ query: 'waggle bees' });

    const doneEvents = events.filter(e => e.event === 'done');
    const doneData = JSON.parse(doneEvents[0].data);
    expect(doneData.toolsUsed).toEqual(['web_search']);

    server.agentRunner = originalRunner;
  });

  it('accepts optional workspace parameter', async () => {
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/chat',
      payload: { message: 'Hello', workspace: 'my-project' },
    });
    const events = parseSSE(res.body);
    const doneEvents = events.filter(e => e.event === 'done');
    expect(doneEvents.length).toBe(1);
  });

  it('accepts optional model parameter', async () => {
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/chat',
      payload: { message: 'Hello', model: 'gpt-4o' },
    });
    const events = parseSSE(res.body);
    const doneEvents = events.filter(e => e.event === 'done');
    expect(doneEvents.length).toBe(1);
  });

  it('passes windowed messages to agent runner when history exceeds MAX_CONTEXT_MESSAGES', async () => {
    let capturedMessages: Array<{ role: string; content: string }> | undefined;
    const originalRunner = server.agentRunner;

    server.agentRunner = async (config: AgentLoopConfig): Promise<AgentResponse> => {
      capturedMessages = config.messages;
      if (config.onToken) config.onToken('ok');
      return {
        content: 'ok',
        toolsUsed: [],
        usage: { inputTokens: 1, outputTokens: 1 },
      };
    };

    // Build a session with 60 messages (30 user + 30 assistant pairs)
    const sessionId = 'window-test-' + Date.now();
    const history = server.agentState.sessionHistories;
    const messages: Array<{ role: string; content: string }> = [];
    for (let i = 0; i < 30; i++) {
      messages.push({ role: 'user', content: `msg-${i}` });
      messages.push({ role: 'assistant', content: `reply-${i}` });
    }
    history.set(sessionId, messages);

    // Send one more message — total becomes 61 (60 existing + 1 new user message)
    await injectWithAuth(server, {
      method: 'POST',
      url: '/api/chat',
      payload: { message: 'final message', session: sessionId },
    });

    // The captured messages should have 50 + 1 truncation notice = 51
    expect(capturedMessages).toBeDefined();
    expect(capturedMessages!.length).toBe(MAX_CONTEXT_MESSAGES + 1);
    // First message should be the truncation notice
    expect(capturedMessages![0].role).toBe('system');
    expect(capturedMessages![0].content).toContain('Context summary');
    expect(capturedMessages![0].content).toContain('11 earlier messages');
    // Last message should be the latest user message
    expect(capturedMessages![capturedMessages!.length - 1].content).toBe('final message');

    server.agentRunner = originalRunner;
  });

  it('passes signal to agent runner for client disconnect abort', async () => {
    // Reset rate limiter — previous tests may have exhausted the /api/chat limit (10/min)
    resetRateLimiter(server);
    let capturedSignal: AbortSignal | undefined;
    const originalRunner = server.agentRunner;

    server.agentRunner = async (config: AgentLoopConfig): Promise<AgentResponse> => {
      capturedSignal = config.signal;
      if (config.onToken) config.onToken('ok');
      return {
        content: 'ok',
        toolsUsed: [],
        usage: { inputTokens: 1, outputTokens: 1 },
      };
    };

    await injectWithAuth(server, {
      method: 'POST',
      url: '/api/chat',
      payload: { message: 'Hello' },
    });

    // The agent runner should have received an AbortSignal
    expect(capturedSignal).toBeDefined();
    expect(capturedSignal).toBeInstanceOf(AbortSignal);

    server.agentRunner = originalRunner;
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
