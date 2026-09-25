/**
 * The fake provider is only useful if the REAL agent loop reads its replies the
 * way it reads a real OpenAI-compatible endpoint, so every scripted reply type
 * is checked through `runAgentLoop` itself rather than by decoding the bytes
 * here.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { runAgentLoop, type AgentLoopConfig, type ToolDefinition } from '@waggle/agent';
import {
  installFakeLlmProvider,
  markFakeProviderHealthy,
  type FakeLlmProvider,
} from './fake-llm-provider.js';

const LITELLM_URL = 'http://127.0.0.1:4999/v1';

function loopConfig(overrides: Partial<AgentLoopConfig> = {}): AgentLoopConfig {
  return {
    litellmUrl: LITELLM_URL,
    litellmApiKey: 'sk-helper-test',
    model: 'claude-sonnet-4-6',
    systemPrompt: 'SYSTEM_SENTINEL',
    tools: [],
    messages: [{ role: 'user', content: 'hello' }],
    ...overrides,
  };
}

describe('installFakeLlmProvider', () => {
  let provider: FakeLlmProvider | undefined;

  afterEach(() => {
    provider?.restore();
    provider = undefined;
  });

  it('streams text in the scripted chunks and reports the scripted usage', async () => {
    provider = installFakeLlmProvider({
      respond: { type: 'text', content: 'Hello world', chunks: ['Hello ', 'world'], usage: { inputTokens: 10, outputTokens: 5 } },
    });
    const tokens: string[] = [];
    const result = await runAgentLoop(loopConfig({ stream: true, onToken: token => tokens.push(token) }));

    expect(result.content).toBe('Hello world');
    expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 5 });
    expect(tokens.join('')).toBe('Hello world');
    expect(provider.requests).toHaveLength(1);
    expect(provider.requests[0]).toMatchObject({
      url: `${LITELLM_URL}/chat/completions`,
      authorization: 'Bearer sk-helper-test',
      model: 'claude-sonnet-4-6',
      stream: true,
      systemPrompt: 'SYSTEM_SENTINEL',
    });
    expect(provider.requests[0].messages.at(-1)).toEqual({ role: 'user', content: 'hello' });
  });

  it('answers a non-streaming request with a JSON completion', async () => {
    provider = installFakeLlmProvider({ respond: { type: 'text', content: 'plain answer' } });
    const result = await runAgentLoop(loopConfig({ stream: false }));

    expect(result.content).toBe('plain answer');
    expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 2 });
    expect(provider.requests[0].stream).toBe(false);
  });

  it.each([true, false])('drives a real tool call and records what the model was sent (stream=%s)', async (stream) => {
    const executed: Array<Record<string, unknown>> = [];
    const echoTool: ToolDefinition = {
      name: 'echo_tool',
      description: 'Echoes its input.',
      parameters: { type: 'object', properties: { text: { type: 'string' } } },
      execute: async (args) => {
        executed.push(args);
        return `echoed ${String(args.text)}`;
      },
    };
    provider = installFakeLlmProvider({
      respond: [
        { type: 'tool_calls', calls: [{ name: 'echo_tool', args: { text: 'ping' } }] },
        { type: 'text', content: 'tool finished' },
      ],
    });
    const used: string[] = [];
    const result = await runAgentLoop(loopConfig({
      stream,
      tools: [echoTool],
      onToolUse: name => used.push(name),
    }));

    expect(executed).toEqual([{ text: 'ping' }]);
    expect(used).toEqual(['echo_tool']);
    expect(result.toolsUsed).toEqual(['echo_tool']);
    expect(result.content).toBe('tool finished');
    expect(provider.requests.map(request => request.toolNames)).toEqual([['echo_tool'], ['echo_tool']]);
    expect(provider.requests[1].messages.some(message => (
      message.role === 'tool' && message.content.includes('echoed ping')
    ))).toBe(true);
    expect(provider.unexpectedRequests).toEqual([]);
  });

  it('turns a scripted 401 into the loop failure a rejected credential produces', async () => {
    provider = installFakeLlmProvider({
      respond: { type: 'http_error', status: 401, message: 'invalid x-api-key' },
    });
    await expect(runAgentLoop(loopConfig({ stream: true }))).rejects.toThrow(/401/);
  });

  it('turns a scripted network error into a rejected fetch', async () => {
    provider = installFakeLlmProvider({ respond: { type: 'network_error', message: 'connect ECONNREFUSED' } });
    await expect(fetch(`${LITELLM_URL}/chat/completions`, { method: 'POST', body: '{}' }))
      .rejects.toThrow('connect ECONNREFUSED');
  });

  it('ends a truncated stream without [DONE], which the loop reports as incomplete', async () => {
    provider = installFakeLlmProvider({
      respond: { type: 'truncated_stream', content: 'partial', usage: { inputTokens: 3, outputTokens: 1 } },
    });
    await expect(runAgentLoop(loopConfig({ stream: true }))).rejects.toMatchObject({
      code: 'INCOMPLETE_COMPLETION',
      usage: { inputTokens: 3, outputTokens: 1 },
    });
  });

  it('holds a hanging request until its signal aborts', async () => {
    provider = installFakeLlmProvider({ respond: { type: 'hang' } });
    const controller = new AbortController();
    const pending = fetch(`${LITELLM_URL}/chat/completions`, {
      method: 'POST',
      body: '{}',
      signal: controller.signal,
    });
    controller.abort();
    await expect(pending).rejects.toThrow();
  });

  it('lets an async responder hold a turn open until the test releases it', async () => {
    let release!: () => void;
    const released = new Promise<void>(resolve => { release = resolve; });
    let entered = false;
    provider = installFakeLlmProvider({
      respond: async () => {
        entered = true;
        await released;
        return { type: 'text', content: 'released' };
      },
    });
    const run = runAgentLoop(loopConfig({ stream: true }));
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(entered).toBe(true);
    release();
    expect((await run).content).toBe('released');
  });

  it('answers 500 past the end of a scripted list and records it as unexpected', async () => {
    provider = installFakeLlmProvider({ respond: [{ type: 'text', content: 'only one' }] });
    await fetch(`${LITELLM_URL}/chat/completions`, { method: 'POST', body: '{}' });
    const second = await fetch(`${LITELLM_URL}/chat/completions`, { method: 'POST', body: '{}' });

    expect(second.status).toBe(500);
    expect(provider.unexpectedRequests).toEqual([
      `${LITELLM_URL}/chat/completions (script exhausted at request 1)`,
    ]);
  });

  it('restarts the list when the script is replaced', async () => {
    provider = installFakeLlmProvider({ respond: [{ type: 'text', content: 'first' }] });
    await fetch(`${LITELLM_URL}/chat/completions`, { method: 'POST', body: '{}' });
    provider.respondWith([{ type: 'text', content: 'second' }]);
    const response = await fetch(`${LITELLM_URL}/chat/completions`, { method: 'POST', body: '{}' });

    expect(await response.json()).toMatchObject({ choices: [{ message: { content: 'second' } }] });
    expect(provider.requests.map(request => request.index)).toEqual([0, 1]);
  });

  it('answers the Ollama listing and health paths, and records any other URL', async () => {
    provider = installFakeLlmProvider({
      respond: { type: 'text', content: 'unused' },
      ollamaModels: ['qwen3:8b'],
    });
    const tags = await fetch('http://127.0.0.1:11434/api/tags');
    const health = await fetch(`${LITELLM_URL.replace('/v1', '')}/health/readiness`);
    const other = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST' });

    expect(await tags.json()).toEqual({ models: [{ name: 'qwen3:8b' }] });
    expect(health.status).toBe(200);
    expect(other.status).toBe(404);
    expect(provider.unexpectedRequests).toEqual(['https://api.anthropic.com/v1/messages']);
    expect(provider.requests).toEqual([]);
  });

  it('delegates non-model URLs to the previous fetch when asked', async () => {
    const outer = installFakeLlmProvider({
      respond: { type: 'text', content: 'outer' },
      otherRequest: async () => new Response('from the suite stub', { status: 202 }),
    });
    try {
      provider = installFakeLlmProvider({ respond: { type: 'text', content: 'inner' }, otherRequest: 'previous' });
      const other = await fetch('https://team.example/api/sync');
      expect(other.status).toBe(202);
      expect(await other.text()).toBe('from the suite stub');
      expect(provider.unexpectedRequests).toEqual([]);
      // The direct Anthropic API is always the fake's, never the suite stub's.
      const anthropic = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST' });
      expect(anthropic.status).toBe(404);
      expect(provider.unexpectedRequests).toEqual(['https://api.anthropic.com/v1/messages']);
    } finally {
      provider?.restore();
      provider = undefined;
      outer.restore();
    }
  });

  it('streams reasoning deltas as private reasoning, never as content', async () => {
    provider = installFakeLlmProvider({
      respond: {
        type: 'stream',
        parts: [{ reasoning: 'PRIVATE_REASONING' }, { content: 'Public ' }, { content: 'answer' }],
        usage: { inputTokens: 4, outputTokens: 3 },
      },
    });
    let reasoningSignals = 0;
    const tokens: string[] = [];
    const result = await runAgentLoop(loopConfig({
      stream: true,
      onReasoningActivity: () => { reasoningSignals += 1; },
      onToken: token => tokens.push(token),
    }));

    expect(reasoningSignals).toBe(1);
    expect(tokens).toEqual(['Public ', 'answer']);
    expect(result.content).toBe('Public answer');
    expect(result.usage).toEqual({ inputTokens: 4, outputTokens: 3 });
  });

  it('holds a chunked stream open at a pause after its first delta', async () => {
    let release!: () => void;
    const released = new Promise<void>(resolve => { release = resolve; });
    let paused = false;
    provider = installFakeLlmProvider({
      respond: {
        type: 'stream',
        parts: [
          { content: 'first ' },
          { pause: () => { paused = true; return released; } },
          { content: 'second' },
        ],
      },
    });
    const activity: string[] = [];
    const run = runAgentLoop(loopConfig({
      stream: true,
      onModelActivity: () => activity.push('model'),
      onToken: token => activity.push(`token:${token}`),
    }));
    await vi.waitFor(() => expect(paused).toBe(true));
    await vi.waitFor(() => expect(activity).toEqual(['model', 'token:first ']));
    release();

    expect((await run).content).toBe('first second');
    expect(activity).toEqual(['model', 'token:first ', 'token:second']);
  });

  it('ends a truncated scripted stream without [DONE], which the loop reports as incomplete', async () => {
    provider = installFakeLlmProvider({
      respond: {
        type: 'stream',
        parts: [{ reasoning: 'hidden' }, { content: 'partial' }],
        usage: { inputTokens: 3, outputTokens: 1 },
        truncated: true,
      },
    });
    await expect(runAgentLoop(loopConfig({ stream: true }))).rejects.toMatchObject({
      code: 'INCOMPLETE_COMPLETION',
      usage: { inputTokens: 3, outputTokens: 1 },
    });
  });

  it('answers a non-streaming request for a scripted stream with its joined content', async () => {
    provider = installFakeLlmProvider({
      respond: { type: 'stream', parts: [{ reasoning: 'hidden' }, { content: 'a' }, { content: 'b' }] },
    });
    expect((await runAgentLoop(loopConfig({ stream: false }))).content).toBe('ab');
  });

  it('restores the fetch that was installed before it', () => {
    const before = globalThis.fetch;
    const installed = installFakeLlmProvider({ respond: { type: 'text', content: 'x' } });
    expect(globalThis.fetch).not.toBe(before);
    installed.restore();
    expect(globalThis.fetch).toBe(before);
  });
});

describe('markFakeProviderHealthy', () => {
  function fakeServer(existingKey?: string) {
    const vault = new Map<string, { value: string; metadata?: Record<string, unknown> }>();
    if (existingKey) vault.set('anthropic', { value: existingKey });
    const unconfigured = { provider: 'none', health: 'unavailable' };
    const server = {
      vault: {
        get: (name: string) => vault.get(name) ?? null,
        set: (name: string, value: string, metadata?: Record<string, unknown>) => { vault.set(name, { value, metadata }); },
        delete: (name: string) => vault.delete(name),
      },
      agentState: { llmProvider: unconfigured },
    };
    return { vault, unconfigured, server: server as unknown as Parameters<typeof markFakeProviderHealthy>[0] };
  }

  it('sets the vault key and a healthy built-in proxy, and undoes both', () => {
    const { vault, unconfigured, server } = fakeServer();
    const undo = markFakeProviderHealthy(server, 'sk-custom');

    expect(vault.get('anthropic')?.value).toBe('sk-custom');
    expect(server.agentState.llmProvider).toMatchObject({ provider: 'anthropic-proxy', health: 'healthy' });

    undo();
    expect(vault.has('anthropic')).toBe(false);
    expect(server.agentState.llmProvider).toBe(unconfigured);
  });

  it('puts a pre-existing key back on undo', () => {
    const { vault, server } = fakeServer('sk-original');
    markFakeProviderHealthy(server)();

    expect(vault.get('anthropic')?.value).toBe('sk-original');
  });
});
