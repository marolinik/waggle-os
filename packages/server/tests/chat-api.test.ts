import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { MindDB, FrameStore, SessionStore } from '@waggle/core';
import { buildLocalServer } from '../src/local/index.js';
import type { FastifyInstance } from 'fastify';
import type { AgentLoopConfig, AgentResponse } from '@waggle/agent';
import {
  applyContextWindow,
  filterGatedToolsForConversationalTurn,
  filterPluginToolsForConversationalTurn,
  isExplicitExternalResearchRequest,
  isExplicitGatedToolRequest,
  isExplicitMemoryRecallRequest,
  isExplicitMemorySaveRequest,
  MAX_CONTEXT_MESSAGES,
} from '../src/local/routes/chat.js';
import { loadSessionMessages } from '../src/local/routes/chat-persistence.js';
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

  it('persists an assistant error turn when generation fails', async () => {
    resetRateLimiter(server);
    const originalRunner = server.agentRunner;
    const workspaceId = `error-workspace-${Date.now()}`;
    const sessionId = `error-session-${Date.now()}`;
    server.agentRunner = async () => {
      throw new Error('LLM error (400): invalid tool call arguments');
    };

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

      const inMemory = server.agentState.sessionHistories.get(sessionId) ?? [];
      expect(inMemory).toHaveLength(2);
      expect(inMemory[0]).toMatchObject({
        role: 'user',
        content: 'Please remember that this turn failed visibly.',
      });
      expect(inMemory[1].role).toBe('assistant');
      expect(inMemory[1].content).toContain('Generation failed: LLM error (400): invalid tool call arguments');

      const onDisk = loadSessionMessages(tmpDir, workspaceId, sessionId);
      expect(onDisk).toEqual(inMemory);
    } finally {
      server.agentRunner = originalRunner;
    }
  });

  // #3 launch-blocker: memory capture must NOT depend on generation success.
  // When the model call throws, the happy-path write-back never runs — so the
  // route persists the raw user turn directly, else "remembers everything" breaks.
  it('persists the raw user turn to memory even when generation fails (#3)', async () => {
    resetRateLimiter(server);
    const originalRunner = server.agentRunner;
    server.agentRunner = async () => {
      throw new Error('LiteLLM is not available');
    };

    const seed = 'Launch-blocker seed: my horse is named Comet and I live in Belgrade.';
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/chat',
      payload: { message: seed },
    });

    // The turn failed — an error event was surfaced to the client.
    const errorEvents = parseSSE(res.body).filter(e => e.event === 'error');
    expect(errorEvents.length).toBe(1);

    server.agentRunner = originalRunner;

    // ...but the raw user turn was still persisted to memory (write decoupled
    // from generation success), so it is recallable on the next turn.
    const persisted = server.agentState.orchestrator.getFrames().findDuplicate(seed);
    expect(persisted).not.toBeNull();
    expect(persisted!.content).toContain('my horse is named Comet');
  });

  // #4: a locally-selected Ollama model must route to Ollama's OpenAI-compatible
  // endpoint (graceful degradation / sovereignty), NOT LiteLLM which doesn't have
  // it — and the 'ollama/' routing prefix must be stripped to the bare tag.
  it('routes an Ollama-selected model to the local Ollama endpoint, not LiteLLM (#4)', async () => {
    resetRateLimiter(server);
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      if (String(input).endsWith('/api/tags')) {
        return new Response(JSON.stringify({ models: [{ name: 'llama3.2:latest' }] }), {
          status: 200,
        });
      }
      return new Response('', { status: 503 });
    });
    let capturedUrl: string | undefined;
    let capturedModel: string | undefined;
    const originalRunner = server.agentRunner;
    server.agentRunner = async (config: AgentLoopConfig): Promise<AgentResponse> => {
      capturedUrl = config.litellmUrl;
      capturedModel = config.model;
      if (config.onToken) config.onToken('ok');
      return { content: 'ok', toolsUsed: [], usage: { inputTokens: 1, outputTokens: 1 } };
    };

    await injectWithAuth(server, {
      method: 'POST',
      url: '/api/chat',
      payload: { message: 'hi', model: 'ollama/llama3.2:latest' },
    });

    expect(capturedUrl).toMatch(/:11434\/v1$/);    // routed to Ollama, not LiteLLM
    expect(capturedModel).toBe('llama3.2:latest');  // 'ollama/' prefix stripped

    server.agentRunner = originalRunner;
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
    const originalRunner = server.agentRunner;
    server.agentRunner = async () => {
      throw new Error('H-07 regression: forced failure');
    };

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

    server.agentRunner = originalRunner;
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

    // Capturing runner — records the key the chat route resolved for this turn.
    server.agentRunner = async (config: AgentLoopConfig): Promise<AgentResponse> => {
      capturedKey = config.litellmApiKey;
      if (config.onToken) config.onToken('ok');
      return { content: 'ok', toolsUsed: [], usage: { inputTokens: 1, outputTokens: 1 } };
    };
  });

  afterAll(async () => {
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

    expect(filtered).toEqual(tools.map(t => t.name));
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
    expect(isExplicitMemoryRecallRequest('What do you remember about me?')).toBe(true);
    expect(isExplicitMemoryRecallRequest('Search memory for my product notes')).toBe(true);
    expect(isExplicitMemoryRecallRequest('How does persistent memory affect agent reliability?')).toBe(false);
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
