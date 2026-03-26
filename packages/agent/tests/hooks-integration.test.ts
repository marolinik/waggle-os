import { describe, it, expect, vi } from 'vitest';
import { runAgentLoop, type AgentLoopConfig } from '../src/agent-loop.js';
import type { ToolDefinition } from '../src/tools.js';
import { HookRegistry } from '../src/hooks.js';

/**
 * Helper: create a mock fetch that returns predefined OpenAI-format responses in sequence.
 */
function mockFetch(
  responses: Array<{
    content: string | null;
    tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
    usage?: { prompt_tokens: number; completion_tokens: number };
  }>
) {
  let callIndex = 0;
  return vi.fn(async (_url: string, _init?: RequestInit) => {
    const resp = responses[callIndex++];
    const body = {
      choices: [
        {
          message: {
            role: 'assistant' as const,
            content: resp.content,
            tool_calls: resp.tool_calls,
          },
          finish_reason: resp.tool_calls ? 'tool_calls' : 'stop',
        },
      ],
      usage: resp.usage ?? { prompt_tokens: 10, completion_tokens: 5 },
    };
    return {
      ok: true,
      status: 200,
      json: async () => body,
    } as unknown as Response;
  });
}

function makeConfig(overrides: Partial<AgentLoopConfig> = {}): AgentLoopConfig {
  return {
    litellmUrl: 'http://localhost:4000',
    litellmApiKey: 'test-key',
    model: 'gpt-4',
    systemPrompt: 'You are a helpful assistant.',
    tools: [],
    messages: [{ role: 'user', content: 'Hello' }],
    ...overrides,
  };
}

function makeEchoTool(): ToolDefinition {
  return {
    name: 'echo',
    description: 'Echoes input',
    parameters: {
      type: 'object',
      properties: { text: { type: 'string' } },
      required: ['text'],
    },
    execute: vi.fn(async (args: Record<string, unknown>) => `Echo: ${args.text}`),
  };
}

describe('hooks integration with agent loop', () => {
  it('fires pre:tool and post:tool during tool execution', async () => {
    const hooks = new HookRegistry();
    const events: Array<{ event: string; ctx: Record<string, unknown> }> = [];

    hooks.on('pre:tool', (ctx) => {
      events.push({ event: 'pre:tool', ctx: { toolName: ctx.toolName, args: ctx.args } });
    });
    hooks.on('post:tool', (ctx) => {
      events.push({ event: 'post:tool', ctx: { toolName: ctx.toolName, args: ctx.args, result: ctx.result } });
    });

    const echoTool = makeEchoTool();

    const fetch = mockFetch([
      {
        content: null,
        tool_calls: [
          { id: 'call_1', function: { name: 'echo', arguments: '{"text":"hello"}' } },
        ],
      },
      { content: 'Done!' },
    ]);

    const result = await runAgentLoop(
      makeConfig({
        fetch,
        tools: [echoTool],
        hooks,
      })
    );

    expect(result.content).toBe('Done!');
    expect(echoTool.execute).toHaveBeenCalledOnce();

    // Verify pre:tool fired before post:tool
    expect(events).toHaveLength(2);
    expect(events[0].event).toBe('pre:tool');
    expect(events[0].ctx.toolName).toBe('echo');
    expect(events[0].ctx.args).toEqual({ text: 'hello' });

    expect(events[1].event).toBe('post:tool');
    expect(events[1].ctx.toolName).toBe('echo');
    expect(events[1].ctx.args).toEqual({ text: 'hello' });
    expect(events[1].ctx.result).toBe('Echo: hello');
  });

  it('cancels tool execution when pre:tool returns cancel: true', async () => {
    const hooks = new HookRegistry();

    hooks.on('pre:tool', () => {
      return { cancel: true, reason: 'Blocked by policy' };
    });

    const echoTool = makeEchoTool();

    const fetch = mockFetch([
      {
        content: null,
        tool_calls: [
          { id: 'call_1', function: { name: 'echo', arguments: '{"text":"hello"}' } },
        ],
      },
      { content: 'After block' },
    ]);

    const result = await runAgentLoop(
      makeConfig({
        fetch,
        tools: [echoTool],
        hooks,
      })
    );

    expect(result.content).toBe('After block');
    // Tool should NOT have been executed
    expect(echoTool.execute).not.toHaveBeenCalled();
    // The tool result message should contain the blocked reason
    // We verify indirectly: the fetch was called twice (tool_calls response + final),
    // and the tool was not in toolsUsed
    expect(result.toolsUsed).not.toContain('echo');
  });
});
