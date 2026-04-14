import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MindDB, ExecutionTraceStore } from '@waggle/core';
import { runAgentLoop, type AgentLoopConfig } from '../src/agent-loop.js';
import { TraceRecorder } from '../src/trace-recorder.js';
import type { ToolDefinition } from '../src/tools.js';

/** Minimal mock fetch — same helper shape as agent-loop.test.ts. */
function mockFetch(
  responses: Array<{
    content: string | null;
    tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
    usage?: { prompt_tokens: number; completion_tokens: number };
  }>,
) {
  let i = 0;
  return vi.fn(async () => {
    const resp = responses[i++];
    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{
          message: { role: 'assistant', content: resp.content, tool_calls: resp.tool_calls },
          finish_reason: resp.tool_calls ? 'tool_calls' : 'stop',
        }],
        usage: resp.usage ?? { prompt_tokens: 10, completion_tokens: 5 },
      }),
    } as unknown as Response;
  });
}

function baseConfig(overrides: Partial<AgentLoopConfig> = {}): AgentLoopConfig {
  return {
    litellmUrl: 'http://localhost:4000',
    litellmApiKey: 'test-key',
    model: 'gpt-4',
    systemPrompt: 'You are a helpful assistant.',
    tools: [],
    messages: [{ role: 'user', content: 'Hello' }],
    maxTurns: 3,
    ...overrides,
  };
}

describe('runAgentLoop — trace recording', () => {
  let db: MindDB;
  let store: ExecutionTraceStore;
  let recorder: TraceRecorder;

  beforeEach(() => {
    db = new MindDB(':memory:');
    store = new ExecutionTraceStore(db);
    recorder = new TraceRecorder(store);
  });

  afterEach(() => {
    db.close();
  });

  it('captures tool calls into the trace when traceRecording is provided', async () => {
    const handle = recorder.start({ input: 'Hello', personaId: 'coder' });
    const tools: ToolDefinition[] = [{
      name: 'echo',
      description: 'Echo input',
      parameters: { properties: { text: { type: 'string' } } },
      execute: async (args) => `you said: ${args.text}`,
    }];

    const fetchFn = mockFetch([
      {
        content: null,
        tool_calls: [{
          id: 'call_1',
          function: { name: 'echo', arguments: JSON.stringify({ text: 'hi' }) },
        }],
      },
      { content: 'Done!' },
    ]);

    await runAgentLoop(baseConfig({
      tools,
      fetch: fetchFn,
      traceRecording: { recorder, handle },
    }));

    // Recorder buffers events; flush via finalize (or manual flush).
    recorder.flush(handle);

    const parsed = store.getParsed(handle.id);
    expect(parsed).toBeDefined();
    expect(parsed!.payload.toolCalls).toHaveLength(1);
    expect(parsed!.payload.toolCalls[0].tool).toBe('echo');
    expect(parsed!.payload.toolCalls[0].result).toContain('you said');
  });

  it('additive to caller-supplied callbacks — both fire', async () => {
    const handle = recorder.start({ input: 'x' });
    const userOnToolUse = vi.fn();
    const userOnToolResult = vi.fn();

    const tools: ToolDefinition[] = [{
      name: 'ping',
      description: 'Ping',
      parameters: { properties: {} },
      execute: async () => 'pong',
    }];

    const fetchFn = mockFetch([
      {
        content: null,
        tool_calls: [{
          id: 'call_1',
          function: { name: 'ping', arguments: '{}' },
        }],
      },
      { content: 'done' },
    ]);

    await runAgentLoop(baseConfig({
      tools,
      fetch: fetchFn,
      onToolUse: userOnToolUse,
      onToolResult: userOnToolResult,
      traceRecording: { recorder, handle },
    }));

    // Both user callbacks fired
    expect(userOnToolUse).toHaveBeenCalledWith('ping', {});
    expect(userOnToolResult).toHaveBeenCalledWith('ping', {}, 'pong');

    // Trace also recorded the call
    recorder.flush(handle);
    const parsed = store.getParsed(handle.id);
    expect(parsed!.payload.toolCalls).toHaveLength(1);
  });

  it('no-ops cleanly when traceRecording is omitted', async () => {
    const userOnToolUse = vi.fn();
    const userOnToolResult = vi.fn();

    const tools: ToolDefinition[] = [{
      name: 'ping',
      description: 'Ping',
      parameters: { properties: {} },
      execute: async () => 'pong',
    }];

    const fetchFn = mockFetch([
      {
        content: null,
        tool_calls: [{ id: 'c', function: { name: 'ping', arguments: '{}' } }],
      },
      { content: 'done' },
    ]);

    await runAgentLoop(baseConfig({
      tools,
      fetch: fetchFn,
      onToolUse: userOnToolUse,
      onToolResult: userOnToolResult,
    }));

    // User callbacks still fire, no trace side-effects
    expect(userOnToolUse).toHaveBeenCalled();
    expect(userOnToolResult).toHaveBeenCalled();
  });

  it('survives when user callback throws — trace is still populated', async () => {
    const handle = recorder.start({ input: 'x' });
    const throwingOnToolUse = vi.fn(() => { throw new Error('user code bug'); });

    const tools: ToolDefinition[] = [{
      name: 'ping',
      description: 'Ping',
      parameters: { properties: {} },
      execute: async () => 'pong',
    }];

    const fetchFn = mockFetch([
      {
        content: null,
        tool_calls: [{ id: 'c', function: { name: 'ping', arguments: '{}' } }],
      },
      { content: 'done' },
    ]);

    // Expect the loop to propagate or swallow — we just check the trace
    // recorded the call BEFORE the throw (recorder wires run first).
    await runAgentLoop(baseConfig({
      tools,
      fetch: fetchFn,
      onToolUse: throwingOnToolUse,
      traceRecording: { recorder, handle },
    })).catch(() => { /* user-bug may propagate — acceptable */ });

    // Even if the loop aborted, onToolUse fired first on the recorder.
    // Partial state is acceptable.
    expect(recorder.pendingToolCount(handle) + recorder.peekToolCalls(handle).length)
      .toBeGreaterThanOrEqual(1);
  });

  it('finalize persists the trace with the given outcome + output', async () => {
    const handle = recorder.start({ input: 'Hello' });

    const fetchFn = mockFetch([{ content: 'Hi there!' }]);

    const result = await runAgentLoop(baseConfig({
      fetch: fetchFn,
      traceRecording: { recorder, handle },
    }));

    recorder.finalize(handle, {
      outcome: 'success',
      output: result.content,
      tokens: { input: result.usage.inputTokens, output: result.usage.outputTokens },
    });

    const parsed = store.getParsed(handle.id);
    expect(parsed!.outcome).toBe('success');
    expect(parsed!.payload.output).toBe('Hi there!');
    expect(parsed!.payload.tokens.input).toBe(result.usage.inputTokens);
  });
});
