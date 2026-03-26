import { describe, it, expect, vi } from 'vitest';
import { runAgentLoop, type AgentLoopConfig, type PluginToolProvider } from '../src/agent-loop.js';
import type { ToolDefinition } from '../src/tools.js';
import { CapabilityRouter } from '../src/capability-router.js';
import Database from 'better-sqlite3';

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

describe('runAgentLoop', () => {
  it('returns text response when no tools used', async () => {
    const fetch = mockFetch([{ content: 'Hello there!' }]);
    const result = await runAgentLoop(makeConfig({ fetch }));

    expect(result.content).toBe('Hello there!');
    expect(result.toolsUsed).toEqual([]);
    expect(result.usage.inputTokens).toBe(10);
    expect(result.usage.outputTokens).toBe(5);

    // Verify the fetch was called with correct URL and headers
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('http://localhost:4000/chat/completions');
    expect(init.headers['Authorization']).toBe('Bearer test-key');
    expect(init.headers['Content-Type']).toBe('application/json');

    // Verify body includes system prompt and user message
    const body = JSON.parse(init.body);
    expect(body.model).toBe('gpt-4');
    expect(body.messages[0]).toEqual({ role: 'system', content: 'You are a helpful assistant.' });
    expect(body.messages[1]).toEqual({ role: 'user', content: 'Hello' });
  });

  it('executes tool calls and loops until final response', async () => {
    const echoTool: ToolDefinition = {
      name: 'echo',
      description: 'Echoes input',
      parameters: {
        type: 'object',
        properties: { text: { type: 'string' } },
        required: ['text'],
      },
      execute: vi.fn(async (args) => `Echo: ${args.text}`),
    };

    const fetch = mockFetch([
      {
        content: null,
        tool_calls: [
          { id: 'call_1', function: { name: 'echo', arguments: '{"text":"hi"}' } },
        ],
        usage: { prompt_tokens: 20, completion_tokens: 10 },
      },
      {
        content: 'Done echoing!',
        usage: { prompt_tokens: 30, completion_tokens: 8 },
      },
    ]);

    const result = await runAgentLoop(
      makeConfig({ fetch, tools: [echoTool] })
    );

    expect(result.content).toBe('Done echoing!');
    expect(result.toolsUsed).toEqual(['echo']);
    expect(result.usage.inputTokens).toBe(50); // 20 + 30
    expect(result.usage.outputTokens).toBe(18); // 10 + 8
    expect(echoTool.execute).toHaveBeenCalledWith({ text: 'hi' });
    expect(fetch).toHaveBeenCalledTimes(2);

    // Second call should include tool result message
    const secondBody = JSON.parse(fetch.mock.calls[1][1].body);
    const toolResultMsg = secondBody.messages.find(
      (m: any) => m.role === 'tool' && m.tool_call_id === 'call_1'
    );
    expect(toolResultMsg).toBeDefined();
    expect(toolResultMsg.content).toBe('Echo: hi');
  });

  it('calls onToken for final content', async () => {
    const onToken = vi.fn();
    const fetch = mockFetch([{ content: 'streaming text' }]);

    await runAgentLoop(makeConfig({ fetch, onToken }));

    expect(onToken).toHaveBeenCalledWith('streaming text');
  });

  it('calls onToolUse when executing tools', async () => {
    const onToolUse = vi.fn();
    const tool: ToolDefinition = {
      name: 'greet',
      description: 'Greet someone',
      parameters: { type: 'object', properties: { name: { type: 'string' } } },
      execute: async (args) => `Hello ${args.name}`,
    };

    const fetch = mockFetch([
      {
        content: null,
        tool_calls: [
          { id: 'call_g', function: { name: 'greet', arguments: '{"name":"World"}' } },
        ],
      },
      { content: 'Greeted.' },
    ]);

    await runAgentLoop(makeConfig({ fetch, tools: [tool], onToolUse }));

    expect(onToolUse).toHaveBeenCalledWith('greet', { name: 'World' });
  });

  it('respects maxTurns limit', async () => {
    const tool: ToolDefinition = {
      name: 'loop_tool',
      description: 'Always called',
      parameters: {},
      execute: async () => 'result',
    };

    // Return tool calls forever — the loop should stop at maxTurns
    const infiniteToolCalls = Array.from({ length: 5 }, () => ({
      content: null as string | null,
      tool_calls: [
        { id: 'call_x', function: { name: 'loop_tool', arguments: '{}' } },
      ],
    }));

    const fetch = mockFetch(infiniteToolCalls);

    const result = await runAgentLoop(
      makeConfig({ fetch, tools: [tool], maxTurns: 3 })
    );

    expect(result.content).toContain('Max tool turns reached');
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('returns alternative routes via capabilityRouter when tool not found', async () => {
    const capabilityRouter = new CapabilityRouter({
      toolNames: ['search_memory'],
      skills: [{ name: 'summarize', content: 'Creates summaries of text' }],
      plugins: [],
      mcpServers: ['github-mcp'],
      subAgentRoles: ['researcher'],
    });

    const fetch = mockFetch([
      {
        content: null,
        tool_calls: [
          { id: 'call_missing', function: { name: 'research', arguments: '{}' } },
        ],
      },
      { content: 'Got it, using alternatives.' },
    ]);

    const result = await runAgentLoop(
      makeConfig({ fetch, capabilityRouter })
    );

    expect(result.content).toBe('Got it, using alternatives.');
    expect(fetch).toHaveBeenCalledTimes(2);

    // Verify the tool result message sent back to the LLM contains route suggestions
    const secondBody = JSON.parse(fetch.mock.calls[1][1].body);
    const toolResultMsg = secondBody.messages.find(
      (m: any) => m.role === 'tool' && m.tool_call_id === 'call_missing'
    );
    expect(toolResultMsg).toBeDefined();
    expect(toolResultMsg.content).toContain('Tool "research" not found');
    expect(toolResultMsg.content).toContain('alternatives');
    // Should contain the sub-agent researcher route (keyword match on "research")
    expect(toolResultMsg.content).toContain('subagent');
    expect(toolResultMsg.content).toContain('researcher');
  });

  it('merges plugin tools into the agent toolset via pluginTools provider', async () => {
    const pluginExecute = vi.fn(async () => 'plugin-result');
    const pluginToolProvider: PluginToolProvider = {
      getAllTools: () => [
        {
          name: 'plugin_search',
          description: 'Search via plugin',
          parameters: { type: 'object', properties: { query: { type: 'string' } } },
          execute: pluginExecute,
        },
      ],
    };

    const fetch = mockFetch([
      {
        content: null,
        tool_calls: [
          { id: 'call_p1', function: { name: 'plugin_search', arguments: '{"query":"test"}' } },
        ],
      },
      { content: 'Found via plugin.' },
    ]);

    const result = await runAgentLoop(
      makeConfig({ fetch, pluginTools: pluginToolProvider })
    );

    expect(result.content).toBe('Found via plugin.');
    expect(result.toolsUsed).toEqual(['plugin_search']);
    expect(pluginExecute).toHaveBeenCalledWith({ query: 'test' });

    // Verify plugin tool was included in the tools sent to the LLM
    const firstBody = JSON.parse(fetch.mock.calls[0][1].body);
    const toolNames = firstBody.tools.map((t: any) => t.function.name);
    expect(toolNames).toContain('plugin_search');
  });

  it('works with both config tools and plugin tools combined', async () => {
    const baseTool: ToolDefinition = {
      name: 'base_tool',
      description: 'A base tool',
      parameters: { type: 'object', properties: {} },
      execute: async () => 'base-result',
    };

    const pluginToolProvider: PluginToolProvider = {
      getAllTools: () => [
        {
          name: 'plugin_tool',
          description: 'A plugin tool',
          parameters: { type: 'object', properties: {} },
          execute: async () => 'plugin-result',
        },
      ],
    };

    const fetch = mockFetch([{ content: 'All good.' }]);

    await runAgentLoop(
      makeConfig({ fetch, tools: [baseTool], pluginTools: pluginToolProvider })
    );

    // Both tools should appear in the LLM request
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    const toolNames = body.tools.map((t: any) => t.function.name);
    expect(toolNames).toContain('base_tool');
    expect(toolNames).toContain('plugin_tool');
    expect(toolNames).toHaveLength(2);
  });

  it('terminates with error after 3 consecutive 429 rate-limit responses', async () => {
    let callCount = 0;
    const fetch = vi.fn(async () => {
      callCount++;
      return {
        ok: false,
        status: 429,
        headers: { get: (name: string) => (name === 'retry-after' ? '0' : null) },
        text: async () => 'rate limited',
      } as unknown as Response;
    });

    await expect(
      runAgentLoop(makeConfig({ fetch }))
    ).rejects.toThrow('Rate limit retry cap exceeded (3 consecutive 429 responses)');

    // Should have been called exactly 3 times (retries capped at 3)
    expect(callCount).toBe(3);
  });

  it('terminates with error after 3 consecutive 502 server errors', async () => {
    let callCount = 0;
    const fetch = vi.fn(async () => {
      callCount++;
      return {
        ok: false,
        status: 502,
        headers: { get: () => null },
        text: async () => 'bad gateway',
      } as unknown as Response;
    });

    await expect(
      runAgentLoop(makeConfig({ fetch }))
    ).rejects.toThrow('Server error retry cap exceeded (3 consecutive 502 errors)');

    expect(callCount).toBe(3);
  });

  it('resets retry count after a successful response', async () => {
    let callCount = 0;
    const fetch = vi.fn(async () => {
      callCount++;
      // First call: 429, second call: success, third call: 429, fourth call: 429, fifth call: 429 → should cap
      if (callCount === 1 || callCount >= 3) {
        return {
          ok: false,
          status: 429,
          headers: { get: (name: string) => (name === 'retry-after' ? '0' : null) },
          text: async () => 'rate limited',
        } as unknown as Response;
      }
      // Success response (no tool calls — terminates loop)
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { role: 'assistant', content: 'Hello!' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        }),
      } as unknown as Response;
    });

    // After the first 429 retry count is 1, then success resets to 0, so loop ends with content
    const result = await runAgentLoop(makeConfig({ fetch }));
    expect(result.content).toBe('Hello!');
    // Only 2 calls: one 429 + one success (loop terminates on success)
    expect(callCount).toBe(2);
  });

  it('terminates gracefully when token budget is exceeded', async () => {
    const fetch = mockFetch([
      {
        content: null,
        tool_calls: [
          { id: 'call_1', function: { name: 'echo', arguments: '{"text":"hi"}' } },
        ],
        usage: { prompt_tokens: 80, completion_tokens: 70 },
      },
      { content: 'Should not reach this.', usage: { prompt_tokens: 50, completion_tokens: 50 } },
    ]);

    const echoTool: ToolDefinition = {
      name: 'echo',
      description: 'Echoes input',
      parameters: { type: 'object', properties: { text: { type: 'string' } } },
      execute: async (args) => `Echo: ${args.text}`,
    };

    const result = await runAgentLoop(
      makeConfig({ fetch, tools: [echoTool], maxTokenBudget: 100 })
    );

    expect(result.content).toContain('Token budget exceeded');
    expect(result.content).toContain('used 150 tokens');
    expect(result.content).toContain('limit 100');
    expect(result.usage.inputTokens).toBe(80);
    expect(result.usage.outputTokens).toBe(70);
    // Only 1 LLM call — budget exceeded after the first response
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('does not enforce token budget when maxTokenBudget is not set', async () => {
    const fetch = mockFetch([
      { content: 'Big response.', usage: { prompt_tokens: 5000, completion_tokens: 5000 } },
    ]);

    const result = await runAgentLoop(makeConfig({ fetch }));
    expect(result.content).toBe('Big response.');
    expect(result.usage.inputTokens).toBe(5000);
    expect(result.usage.outputTokens).toBe(5000);
  });

  it('terminates gracefully when abort signal is triggered between turns', async () => {
    const abortController = new AbortController();

    const tool: ToolDefinition = {
      name: 'slow_tool',
      description: 'A tool that aborts the signal',
      parameters: { type: 'object', properties: {} },
      execute: async () => {
        // Simulate client disconnect during tool execution
        abortController.abort();
        return 'tool-result';
      },
    };

    const fetch = mockFetch([
      {
        content: null,
        tool_calls: [
          { id: 'call_1', function: { name: 'slow_tool', arguments: '{}' } },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      },
      // This second response should never be reached because the signal was aborted
      { content: 'Should not appear.', usage: { prompt_tokens: 10, completion_tokens: 5 } },
    ]);

    const result = await runAgentLoop(
      makeConfig({ fetch, tools: [tool], signal: abortController.signal })
    );

    expect(result.content).toBe('Agent loop aborted (client disconnected).');
    expect(result.toolsUsed).toEqual(['slow_tool']);
    // Only one fetch call — the loop exited before making a second LLM request
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('does not abort when signal is not provided', async () => {
    const fetch = mockFetch([{ content: 'Normal response.' }]);

    const result = await runAgentLoop(makeConfig({ fetch }));
    expect(result.content).toBe('Normal response.');
  });
});

describe('Agent error paths (PRQ-045)', () => {
  it('handles malformed JSON response from LLM gracefully', async () => {
    const fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('Unexpected token in JSON');
      },
    }) as unknown as Response);

    await expect(
      runAgentLoop(makeConfig({ fetch }))
    ).rejects.toThrow();

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('handles LLM response with empty choices array', async () => {
    const fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [],
        usage: { prompt_tokens: 5, completion_tokens: 0 },
      }),
    }) as unknown as Response);

    await expect(
      runAgentLoop(makeConfig({ fetch }))
    ).rejects.toThrow('LiteLLM returned no choices');

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('handles LLM response with missing choices field entirely', async () => {
    const fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        // No choices field at all
        usage: { prompt_tokens: 5, completion_tokens: 0 },
      }),
    }) as unknown as Response);

    await expect(
      runAgentLoop(makeConfig({ fetch }))
    ).rejects.toThrow('LiteLLM returned no choices');

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('handles non-200 non-retryable error response', async () => {
    const fetch = vi.fn(async () => ({
      ok: false,
      status: 400,
      headers: { get: () => null },
      text: async () => 'Bad request: invalid model',
    }) as unknown as Response);

    await expect(
      runAgentLoop(makeConfig({ fetch }))
    ).rejects.toThrow('LLM error (400)');

    // Non-retryable errors should fail on first attempt
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('handles tool call with invalid JSON arguments gracefully', async () => {
    const tool: ToolDefinition = {
      name: 'test_tool',
      description: 'A test tool',
      parameters: { type: 'object', properties: { input: { type: 'string' } } },
      execute: async () => 'result',
    };

    const fetch = mockFetch([
      {
        content: null,
        tool_calls: [
          {
            id: 'call_bad',
            function: { name: 'test_tool', arguments: '{invalid json here' },
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      },
      {
        content: 'Handled the error gracefully.',
        usage: { prompt_tokens: 15, completion_tokens: 8 },
      },
    ]);

    const result = await runAgentLoop(makeConfig({ fetch, tools: [tool] }));

    // Agent should recover and continue to the next turn
    expect(result.content).toBe('Handled the error gracefully.');
    expect(fetch).toHaveBeenCalledTimes(2);

    // The tool result sent back to LLM should indicate the error
    const secondBody = JSON.parse(fetch.mock.calls[1][1].body);
    const toolResultMsg = secondBody.messages.find(
      (m: any) => m.role === 'tool' && m.tool_call_id === 'call_bad'
    );
    expect(toolResultMsg).toBeDefined();
    expect(toolResultMsg.content).toContain('Error');
    expect(toolResultMsg.content).toContain('Invalid arguments');
  });

  it('handles tool execution that throws an error', async () => {
    const failingTool: ToolDefinition = {
      name: 'failing_tool',
      description: 'A tool that always throws',
      parameters: { type: 'object', properties: {} },
      execute: async () => { throw new Error('Database connection failed'); },
    };

    const fetch = mockFetch([
      {
        content: null,
        tool_calls: [
          { id: 'call_fail', function: { name: 'failing_tool', arguments: '{}' } },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      },
      {
        content: 'I see the tool failed. Let me try another approach.',
        usage: { prompt_tokens: 20, completion_tokens: 10 },
      },
    ]);

    const result = await runAgentLoop(makeConfig({ fetch, tools: [failingTool] }));

    expect(result.content).toBe('I see the tool failed. Let me try another approach.');
    expect(result.toolsUsed).toEqual(['failing_tool']);
    expect(fetch).toHaveBeenCalledTimes(2);

    // Verify error was communicated back to the LLM
    const secondBody = JSON.parse(fetch.mock.calls[1][1].body);
    const toolResultMsg = secondBody.messages.find(
      (m: any) => m.role === 'tool' && m.tool_call_id === 'call_fail'
    );
    expect(toolResultMsg).toBeDefined();
    expect(toolResultMsg.content).toContain('Error executing failing_tool');
    expect(toolResultMsg.content).toContain('Database connection failed');
  });

  it('accumulates totalInputTokens and totalOutputTokens across multiple turns', async () => {
    const tool: ToolDefinition = {
      name: 'counter',
      description: 'A simple tool',
      parameters: { type: 'object', properties: {} },
      execute: async () => 'counted',
    };

    const fetch = mockFetch([
      {
        content: null,
        tool_calls: [
          { id: 'call_1', function: { name: 'counter', arguments: '{}' } },
        ],
        usage: { prompt_tokens: 100, completion_tokens: 50 },
      },
      {
        content: null,
        tool_calls: [
          { id: 'call_2', function: { name: 'counter', arguments: '{}' } },
        ],
        usage: { prompt_tokens: 200, completion_tokens: 75 },
      },
      {
        content: 'All done.',
        usage: { prompt_tokens: 300, completion_tokens: 25 },
      },
    ]);

    const result = await runAgentLoop(makeConfig({ fetch, tools: [tool] }));

    expect(result.content).toBe('All done.');
    // Verify token accumulation: 100+200+300 = 600 input, 50+75+25 = 150 output
    expect(result.usage.inputTokens).toBe(600);
    expect(result.usage.outputTokens).toBe(150);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('handles 200 response with null content and no tool calls', async () => {
    const fetch = mockFetch([
      {
        content: null,
        // No tool_calls — this is an edge case where the LLM returns nothing
        usage: { prompt_tokens: 10, completion_tokens: 0 },
      },
    ]);

    const result = await runAgentLoop(makeConfig({ fetch }));

    // Should return empty string content (null coalesces to '')
    expect(result.content).toBe('');
    expect(result.toolsUsed).toEqual([]);
    expect(result.usage.inputTokens).toBe(10);
    expect(result.usage.outputTokens).toBe(0);
  });
});

describe('LIKE wildcard escaping (PRQ-033)', () => {
  it('escapes % in search keywords so it does not match everything', () => {
    const db = new Database(':memory:');
    db.exec(`CREATE TABLE test_frames (id INTEGER PRIMARY KEY, content TEXT)`);
    db.exec(`INSERT INTO test_frames (content) VALUES ('normal text')`);
    db.exec(`INSERT INTO test_frames (content) VALUES ('has 100% completion')`);
    db.exec(`INSERT INTO test_frames (content) VALUES ('another row')`);

    // Simulate the escaping logic from tools.ts search_memory LIKE fallback
    const keyword = '100%';
    const escaped = keyword.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');

    const rows = db.prepare(
      "SELECT id, content FROM test_frames WHERE LOWER(content) LIKE '%' || ? || '%' ESCAPE '\\'"
    ).all(escaped) as { id: number; content: string }[];

    // Should only match the row containing the literal "100%", not all rows
    expect(rows).toHaveLength(1);
    expect(rows[0].content).toBe('has 100% completion');

    db.close();
  });

  it('escapes _ in search keywords so it does not match single characters', () => {
    const db = new Database(':memory:');
    db.exec(`CREATE TABLE test_frames (id INTEGER PRIMARY KEY, content TEXT)`);
    db.exec(`INSERT INTO test_frames (content) VALUES ('file_name here')`);
    db.exec(`INSERT INTO test_frames (content) VALUES ('filename here')`);

    const keyword = 'file_name';
    const escaped = keyword.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');

    const rows = db.prepare(
      "SELECT id, content FROM test_frames WHERE LOWER(content) LIKE '%' || ? || '%' ESCAPE '\\'"
    ).all(escaped) as { id: number; content: string }[];

    // Should only match the row with literal underscore
    expect(rows).toHaveLength(1);
    expect(rows[0].content).toBe('file_name here');

    db.close();
  });
});
