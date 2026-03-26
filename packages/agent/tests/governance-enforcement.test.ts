import { describe, it, expect, vi } from 'vitest';
import { runAgentLoop, type AgentLoopConfig } from '../src/agent-loop.js';
import type { ToolDefinition } from '../src/tools.js';

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

describe('Governance enforcement in agent loop', () => {
  it('blocks a tool that is in the blockedTools list and returns policy error', async () => {
    const executeSpy = vi.fn(async () => 'tool executed');
    const blockedTool: ToolDefinition = {
      name: 'delete_file',
      description: 'Delete a file',
      parameters: { type: 'object', properties: { path: { type: 'string' } } },
      execute: executeSpy,
    };

    const onToolResult = vi.fn();

    const fetch = mockFetch([
      // LLM calls delete_file
      {
        content: null,
        tool_calls: [{ id: 'tc1', function: { name: 'delete_file', arguments: '{"path":"test.txt"}' } }],
      },
      // LLM responds after seeing blocked message
      { content: 'I cannot delete that file due to governance policy.' },
    ]);

    const result = await runAgentLoop(
      makeConfig({
        fetch,
        tools: [blockedTool],
        governancePolicies: { blockedTools: ['delete_file'] },
        onToolResult,
      })
    );

    // Tool should NOT have been executed
    expect(executeSpy).not.toHaveBeenCalled();
    // onToolResult should have been called with the policy message
    expect(onToolResult).toHaveBeenCalledWith(
      'delete_file',
      { path: 'test.txt' },
      expect.stringContaining('blocked by your team\'s governance policy')
    );
    expect(result.content).toContain('governance policy');
  });

  it('allows a tool that is NOT in the blockedTools list to execute normally', async () => {
    const executeSpy = vi.fn(async () => 'file content here');
    const allowedTool: ToolDefinition = {
      name: 'read_file',
      description: 'Read a file',
      parameters: { type: 'object', properties: { path: { type: 'string' } } },
      execute: executeSpy,
    };

    const fetch = mockFetch([
      // LLM calls read_file
      {
        content: null,
        tool_calls: [{ id: 'tc1', function: { name: 'read_file', arguments: '{"path":"readme.md"}' } }],
      },
      // LLM responds
      { content: 'Here is the file content.' },
    ]);

    const result = await runAgentLoop(
      makeConfig({
        fetch,
        tools: [allowedTool],
        governancePolicies: { blockedTools: ['delete_file', 'write_file'] },
      })
    );

    // Tool should have been executed since it's not blocked
    expect(executeSpy).toHaveBeenCalledWith({ path: 'readme.md' });
    expect(result.content).toBe('Here is the file content.');
    expect(result.toolsUsed).toContain('read_file');
  });

  it('allows all tools when no governancePolicies are set', async () => {
    const executeSpy = vi.fn(async () => 'deleted');
    const tool: ToolDefinition = {
      name: 'delete_file',
      description: 'Delete a file',
      parameters: { type: 'object', properties: { path: { type: 'string' } } },
      execute: executeSpy,
    };

    const fetch = mockFetch([
      {
        content: null,
        tool_calls: [{ id: 'tc1', function: { name: 'delete_file', arguments: '{"path":"test.txt"}' } }],
      },
      { content: 'File deleted.' },
    ]);

    const result = await runAgentLoop(
      makeConfig({
        fetch,
        tools: [tool],
        // No governancePolicies set
      })
    );

    // Tool should execute normally when no governance policies are set
    expect(executeSpy).toHaveBeenCalledWith({ path: 'test.txt' });
    expect(result.content).toBe('File deleted.');
    expect(result.toolsUsed).toContain('delete_file');
  });

  it('allows all tools when governancePolicies has empty blockedTools', async () => {
    const executeSpy = vi.fn(async () => 'done');
    const tool: ToolDefinition = {
      name: 'write_file',
      description: 'Write a file',
      parameters: { type: 'object', properties: { path: { type: 'string' } } },
      execute: executeSpy,
    };

    const fetch = mockFetch([
      {
        content: null,
        tool_calls: [{ id: 'tc1', function: { name: 'write_file', arguments: '{"path":"out.txt"}' } }],
      },
      { content: 'Written.' },
    ]);

    const result = await runAgentLoop(
      makeConfig({
        fetch,
        tools: [tool],
        governancePolicies: { blockedTools: [] },
      })
    );

    expect(executeSpy).toHaveBeenCalled();
    expect(result.toolsUsed).toContain('write_file');
  });
});
