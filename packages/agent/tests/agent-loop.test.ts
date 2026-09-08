import { describe, it, expect, vi } from 'vitest';
import { runAgentLoop, type AgentLoopConfig, type PluginToolProvider } from '../src/agent-loop.js';
import type { ToolDefinition } from '../src/tools.js';
import { CapabilityRouter } from '../src/capability-router.js';
import { HookRegistry } from '../src/hooks.js';
import { needsConfirmationWithAutonomy } from '../src/confirmation.js';
import type { ModelSpendBudget, ModelSpendReservationRequest } from '../src/cost-tracker.js';
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

function mockStreamFetch(
  chunks: string[],
  options: {
    toolCalls?: Array<{ id: string; name: string; arguments: string }>;
    usage?: { prompt_tokens: number; completion_tokens: number };
  } = {},
) {
  const encoder = new TextEncoder();
  const events = [
    ...chunks.map(content => `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`),
    ...(options.toolCalls?.length ? [`data: ${JSON.stringify({ choices: [{ delta: {
      tool_calls: options.toolCalls.map((toolCall, index) => ({
        index,
        id: toolCall.id,
        type: 'function',
        function: { name: toolCall.name, arguments: toolCall.arguments },
      })),
    } }] })}\n\n`] : []),
    `data: ${JSON.stringify({
      choices: [{ delta: {}, finish_reason: options.toolCalls?.length ? 'tool_calls' : 'stop' }],
      usage: options.usage ?? { prompt_tokens: 10, completion_tokens: 25 },
    })}\n\n`,
    'data: [DONE]\n\n',
  ];
  return vi.fn(async () => ({
    ok: true,
    status: 200,
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        for (const event of events) controller.enqueue(encoder.encode(event));
        controller.close();
      },
    }),
  } as unknown as Response));
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
    expect(body.reasoning).toBeUndefined();
    expect(body.messages[0]).toEqual({ role: 'system', content: 'You are a helpful assistant.' });
    expect(body.messages[1]).toEqual({ role: 'user', content: 'Hello' });
  });

  it('normalizes malformed Qwen reasoning content before returning it', async () => {
    const answer = 'ORCHID-ANCHOR';
    const malformed = '<think>all tests passed</think>'
      + Array.from({ length: 9 }, () => answer).join('</think>');
    const onToken = vi.fn();
    const fetch = mockFetch([{ content: malformed }]);

    const result = await runAgentLoop(makeConfig({
      fetch,
      onToken,
      model: 'openai-compatible/qwen3.8-flash-next',
    }));

    expect(result.content).toBe(answer);
    expect(result.content).not.toMatch(/<\/?think>/i);
    expect(onToken).toHaveBeenCalledWith(answer);
    expect(onToken).not.toHaveBeenCalledWith(malformed);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('buffers a Qwen stream until malformed reasoning content is normalized', async () => {
    const answer = 'ORCHID-STREAM';
    const malformed = '<think>private analysis</think>'
      + Array.from({ length: 4 }, () => answer).join('</think>');
    const fetch = mockStreamFetch([
      malformed.slice(0, 21),
      malformed.slice(21, 52),
      malformed.slice(52),
    ]);
    const onToken = vi.fn();
    const onModelActivity = vi.fn();

    const result = await runAgentLoop(makeConfig({
      fetch,
      onToken,
      onModelActivity,
      stream: true,
      model: 'openai-compatible/qwen3.8-flash-next',
    }));

    expect(result.content).toBe(answer);
    expect(onModelActivity).toHaveBeenCalledTimes(1);
    expect(onToken.mock.calls.map(call => call[0]).join('')).toBe(answer);
    expect(JSON.stringify(onToken.mock.calls)).not.toContain('private analysis');
    expect(JSON.stringify(onToken.mock.calls)).not.toContain('</think>');
  });

  it('uses the raw Qwen response for missing-usage token accounting', async () => {
    const raw = `<think>${'private '.repeat(80)}</think>Safe answer`;
    const fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{
          message: { role: 'assistant', content: raw },
          finish_reason: 'stop',
        }],
      }),
    } as unknown as Response));

    const result = await runAgentLoop(makeConfig({
      fetch,
      model: 'openai-compatible/qwen3.8-flash-next',
    }));

    expect(result.content).toBe('Safe answer');
    expect(result.usage.outputTokens).toBeGreaterThan(100);
  });

  it('emits the buffered Qwen answer once when the token budget stops the turn', async () => {
    const fetch = mockStreamFetch(['Budget answer'], {
      usage: { prompt_tokens: 190, completion_tokens: 25 },
    });
    const onToken = vi.fn();
    const result = await runAgentLoop(makeConfig({
      fetch,
      onToken,
      stream: true,
      model: 'openai-compatible/qwen3.8-flash-next',
      maxTokenBudget: 200,
    }));

    expect(onToken.mock.calls.map(call => call[0]).join('')).toBe(result.content);
    expect(onToken).toHaveBeenCalledTimes(1);
  });

  it('emits a buffered Qwen max-turn fallback after a streamed tool call', async () => {
    const echoTool: ToolDefinition = {
      name: 'echo',
      description: 'Echoes text',
      parameters: { type: 'object', properties: { text: { type: 'string' } } },
      execute: vi.fn(async args => String(args.text)),
    };
    const fetch = mockStreamFetch(['Checking safely.'], {
      toolCalls: [{ id: 'call_qwen', name: 'echo', arguments: '{"text":"ok"}' }],
    });
    const onToken = vi.fn();
    const result = await runAgentLoop(makeConfig({
      fetch,
      onToken,
      stream: true,
      model: 'openai-compatible/qwen3.8-flash-next',
      tools: [echoTool],
      maxTurns: 1,
    }));

    expect(result.content).toBe('Checking safely.');
    expect(onToken.mock.calls.map(call => call[0]).join('')).toBe(result.content);
    expect(onToken).toHaveBeenCalledTimes(1);
    expect(echoTool.execute).toHaveBeenCalledOnce();
  });

  it('emits a buffered Qwen D3 and D1 preserved answer exactly once', async () => {
    const echoTool: ToolDefinition = {
      name: 'echo',
      description: 'Echoes text',
      parameters: { type: 'object', properties: { text: { type: 'string' } } },
      execute: vi.fn(async args => String(args.text)),
    };
    const toolCalls = Array.from({ length: 5 }, (_, index) => ({
      id: `call_gate_${index}`,
      name: 'echo',
      arguments: `{"text":"${index}"}`,
    }));
    const responses = [
      mockStreamFetch([], { toolCalls }),
      mockStreamFetch(['All tests passed.']),
      mockStreamFetch(['Skill distillation complete.']),
    ];
    let responseIndex = 0;
    const fetch = vi.fn(async () => responses[responseIndex++]());
    const onToken = vi.fn();

    const result = await runAgentLoop(makeConfig({
      fetch,
      onToken,
      stream: true,
      model: 'openai-compatible/qwen3.8-flash-next',
      tools: [echoTool],
    }));

    expect(result.content).toContain('All tests passed.');
    expect(result.content).toContain('Verification scope: EVIDENCE-ONLY');
    expect(onToken.mock.calls.map(call => call[0]).join('')).toBe(result.content);
    expect(onToken).toHaveBeenCalledTimes(1);
    expect(echoTool.execute).toHaveBeenCalledTimes(5);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('preserves literal think markup from non-Qwen providers', async () => {
    const literal = 'Example: `<think>literal XML-like text</think>`.';
    const fetch = mockFetch([{ content: literal }]);
    const result = await runAgentLoop(makeConfig({ fetch, model: 'gpt-4' }));
    expect(result.content).toBe(literal);
  });

  it('forwards an explicit provider reasoning policy without inventing one', async () => {
    const fetch = mockFetch([{ content: 'Bounded answer.' }]);
    const config = makeConfig({
      fetch,
      reasoning: { enabled: true, effort: 'low' },
    });

    await runAgentLoop(config);

    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.reasoning).toEqual({ enabled: true, effort: 'low' });
  });

  it('forces one requested tool only on the first model turn', async () => {
    const fetch = mockFetch([
      {
        content: null,
        tool_calls: [{ id: 'call-1', function: { name: 'list_skills', arguments: '{}' } }],
      },
      { content: '18' },
    ]);
    const listSkills: ToolDefinition = {
      name: 'list_skills',
      description: 'List installed skills',
      parameters: { type: 'object', properties: {} },
      execute: vi.fn(async () => '18 skills'),
    };

    await runAgentLoop(makeConfig({
      fetch,
      tools: [listSkills],
      toolChoice: 'list_skills',
    }));

    const firstBody = JSON.parse(fetch.mock.calls[0][1].body);
    const secondBody = JSON.parse(fetch.mock.calls[1][1].body);
    expect(firstBody.tool_choice).toEqual({
      type: 'function',
      function: { name: 'list_skills' },
    });
    expect(firstBody.parallel_tool_calls).toBe(false);
    expect(secondBody.tool_choice).toBeUndefined();
    expect(secondBody.parallel_tool_calls).toBeUndefined();
    expect(listSkills.execute).toHaveBeenCalledOnce();
  });

  it('executes one strict zero-argument forced tool when the provider ignores tool_choice', async () => {
    const atomicFetch = mockFetch([
      { content: 'I can answer without the requested tool.' },
      { content: 'ORCHID-7' },
    ]);
    const leakedStreamFetch = mockStreamFetch(['I can answer without the requested tool.']);
    const fetch = vi.fn(async (url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as { stream?: boolean };
      return body.stream === true
        ? leakedStreamFetch(url, init)
        : atomicFetch(url, init);
    });
    const searchMemory: ToolDefinition = {
      name: 'search_memory',
      description: 'Return one exact saved value',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
        additionalProperties: false,
      },
      execute: vi.fn(async () => 'ORCHID-7'),
    };
    const onToken = vi.fn();

    const result = await runAgentLoop(makeConfig({
      fetch,
      tools: [searchMemory],
      toolChoice: 'search_memory',
      model: 'openai-compatible/qwen3.8-flash-next',
      stream: true,
      onToken,
    }));

    const firstBody = JSON.parse(fetch.mock.calls[0][1].body);
    const synthesisBody = JSON.parse(fetch.mock.calls[1][1].body);
    expect(firstBody.tool_choice.function.name).toBe('search_memory');
    expect(firstBody.stream).toBeUndefined();
    expect(firstBody.stream_options).toBeUndefined();
    expect(synthesisBody.tool_choice).toBeUndefined();
    expect(JSON.stringify(synthesisBody.messages)).toContain('ORCHID-7');
    expect(JSON.stringify(synthesisBody.messages)).not.toContain('I can answer without the requested tool.');
    expect(searchMemory.execute).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ content: 'ORCHID-7', toolsUsed: ['search_memory'] });
    expect(onToken.mock.calls.flat().join('')).toBe('ORCHID-7');
    expect(onToken.mock.calls.flat().join('')).not.toContain('I can answer without the requested tool.');
  });

  it('fails closed when an ignored forced tool is not strictly zero-argument', async () => {
    const fetch = mockFetch([{ content: 'FABRICATED_UNVERIFIED_TOOL_RESULT' }]);
    const listSkills: ToolDefinition = {
      name: 'list_skills',
      description: 'List installed skills',
      parameters: {
        type: 'object',
        properties: { verbose: { type: 'boolean' } },
      },
      execute: vi.fn(async () => '18 skills'),
    };
    const onToken = vi.fn();

    await expect(runAgentLoop(makeConfig({
      fetch,
      tools: [listSkills],
      toolChoice: 'list_skills',
      onToken,
    }))).rejects.toThrow('Forced tool choice list_skills was not called');

    expect(fetch).toHaveBeenCalledOnce();
    expect(listSkills.execute).not.toHaveBeenCalled();
    expect(onToken).not.toHaveBeenCalled();
  });

  it('rejects an ambiguous forced tool before a colliding plugin can replace it', async () => {
    const fetch = mockFetch([{ content: 'should not be reached' }]);
    const searchMemory: ToolDefinition = {
      name: 'search_memory',
      description: 'Return one exact saved value',
      parameters: { type: 'object', properties: {}, required: [], additionalProperties: false },
      execute: vi.fn(async () => 'base'),
    };
    const pluginExecute = vi.fn(async () => 'plugin');
    const pluginTools: PluginToolProvider = {
      getAllTools: () => [{ ...searchMemory, execute: pluginExecute }],
    };

    await expect(runAgentLoop(makeConfig({
      fetch,
      tools: [searchMemory],
      pluginTools,
      toolChoice: 'search_memory',
    }))).rejects.toThrow('Forced tool choice search_memory is ambiguous');

    expect(fetch).not.toHaveBeenCalled();
    expect(searchMemory.execute).not.toHaveBeenCalled();
    expect(pluginExecute).not.toHaveBeenCalled();
  });

  it('rejects a different tool returned for a forced tool choice before execution', async () => {
    const fetch = mockFetch([{
      content: null,
      tool_calls: [{ id: 'wrong-call', function: { name: 'read_file', arguments: '{"path":"secret.txt"}' } }],
    }]);
    const searchMemory: ToolDefinition = {
      name: 'search_memory',
      description: 'Return one exact saved value',
      parameters: { type: 'object', properties: {}, required: [], additionalProperties: false },
      execute: vi.fn(async () => 'ORCHID-7'),
    };
    const readFile: ToolDefinition = {
      name: 'read_file',
      description: 'Read a file',
      parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
      execute: vi.fn(async () => 'PRIVATE_FILE_CONTENT'),
    };

    await expect(runAgentLoop(makeConfig({
      fetch,
      tools: [searchMemory, readFile],
      toolChoice: 'search_memory',
    }))).rejects.toThrow('Forced tool choice search_memory returned a different tool call');

    expect(searchMemory.execute).not.toHaveBeenCalled();
    expect(readFile.execute).not.toHaveBeenCalled();
  });

  it('does not expose ignored forced-tool prose when the provider exhausts the budget', async () => {
    const fetch = mockFetch([{
      content: 'FABRICATED_UNVERIFIED_TOOL_RESULT',
      usage: { prompt_tokens: 4_000, completion_tokens: 2_000 },
    }]);
    const searchMemory: ToolDefinition = {
      name: 'search_memory',
      description: 'Return one exact saved value',
      parameters: { type: 'object', properties: {}, required: [], additionalProperties: false },
      execute: vi.fn(async () => 'ORCHID-7'),
    };
    const onToken = vi.fn();

    await expect(runAgentLoop(makeConfig({
      fetch,
      tools: [searchMemory],
      toolChoice: 'search_memory',
      maxTokenBudget: 6_000,
      onToken,
    }))).rejects.toThrow('Required tool search_memory could not complete within the token budget');

    expect(searchMemory.execute).not.toHaveBeenCalled();
    expect(onToken).not.toHaveBeenCalled();
  });

  it('does not dispatch a forced tool when it cannot start within the budget', async () => {
    const fetch = mockFetch([{ content: 'should not be reached' }]);
    const searchMemory: ToolDefinition = {
      name: 'search_memory',
      description: 'Return one exact saved value',
      parameters: { type: 'object', properties: {}, required: [], additionalProperties: false },
      execute: vi.fn(async () => 'ORCHID-7'),
    };

    await expect(runAgentLoop(makeConfig({
      fetch,
      tools: [searchMemory],
      toolChoice: 'search_memory',
      maxTokenBudget: 1,
    }))).rejects.toThrow('Required tool search_memory could not start within the token budget');

    expect(fetch).not.toHaveBeenCalled();
    expect(searchMemory.execute).not.toHaveBeenCalled();
  });

  it('does not bypass a forced tool when synthesis reserve exhausts the token budget', async () => {
    const fetch = mockFetch([{ content: 'FABRICATED_WITHOUT_MEMORY' }]);
    const searchMemory: ToolDefinition = {
      name: 'search_memory',
      description: 'Return one exact saved value',
      parameters: { type: 'object', properties: {}, required: [], additionalProperties: false },
      execute: vi.fn(async () => 'ORCHID-7'),
    };

    await expect(runAgentLoop(makeConfig({
      fetch,
      tools: [searchMemory],
      toolChoice: 'search_memory',
      systemPrompt: 'x'.repeat(8_000),
      maxTokenBudget: 3_000,
      synthesisReserveTokens: 500,
    }))).rejects.toThrow('Required tool search_memory could not start within the token budget');

    expect(fetch).not.toHaveBeenCalled();
    expect(searchMemory.execute).not.toHaveBeenCalled();
  });

  it.each([
    ['maxTurns', { maxTurns: 1 }],
    ['maxToolRounds', { maxToolRounds: 0 }],
  ])('does not bypass a forced tool when it cannot fit within %s', async (limit, config) => {
    const fetch = mockFetch([{ content: 'FABRICATED_WITHOUT_MEMORY' }]);
    const searchMemory: ToolDefinition = {
      name: 'search_memory',
      description: 'Return one exact saved value',
      parameters: { type: 'object', properties: {}, required: [], additionalProperties: false },
      execute: vi.fn(async () => 'ORCHID-7'),
    };

    await expect(runAgentLoop(makeConfig({
      fetch,
      tools: [searchMemory],
      toolChoice: 'search_memory',
      ...config,
    }))).rejects.toThrow(`Forced tool choice does not fit within ${limit}`);

    expect(fetch).not.toHaveBeenCalled();
    expect(searchMemory.execute).not.toHaveBeenCalled();
  });

  it('rejects multiple forced tool calls before executing any of them', async () => {
    const fetch = mockFetch([
      {
        content: null,
        tool_calls: [
          { id: 'call-1', function: { name: 'list_skills', arguments: '{}' } },
          { id: 'call-2', function: { name: 'list_skills', arguments: '{}' } },
        ],
      },
      { content: 'should not be reached' },
    ]);
    const onToolUse = vi.fn();
    const listSkills: ToolDefinition = {
      name: 'list_skills',
      description: 'List installed skills',
      parameters: { type: 'object', properties: {} },
      execute: vi.fn(async () => '18 skills'),
    };

    await expect(runAgentLoop(makeConfig({
      fetch,
      tools: [listSkills],
      toolChoice: 'list_skills',
      onToolUse,
    }))).rejects.toThrow('multiple tool calls');

    expect(listSkills.execute).not.toHaveBeenCalled();
    expect(onToolUse).not.toHaveBeenCalled();
  });

  it('does not execute the forced tool again on a later model turn', async () => {
    const fetch = mockFetch([
      {
        content: null,
        tool_calls: [{ id: 'call-1', function: { name: 'list_skills', arguments: '{}' } }],
      },
      {
        content: null,
        tool_calls: [{ id: 'call-2', function: { name: 'list_skills', arguments: '{}' } }],
      },
      { content: 'should not need another turn' },
    ]);
    const onToolUse = vi.fn();
    const listSkills: ToolDefinition = {
      name: 'list_skills',
      description: 'List installed skills',
      parameters: { type: 'object', properties: {} },
      execute: vi.fn(async () => '18 skills'),
    };

    await runAgentLoop(makeConfig({
      fetch,
      tools: [listSkills],
      toolChoice: 'list_skills',
      onToolUse,
    }));

    expect(listSkills.execute).toHaveBeenCalledOnce();
    expect(onToolUse).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('forces an authorized tool sequence exactly once before synthesis', async () => {
    const fetch = mockFetch([
      {
        content: null,
        tool_calls: [{
          id: 'call-skill',
          function: { name: 'read_skill', arguments: '{"name":"decision-matrix"}' },
        }],
      },
      {
        content: null,
        tool_calls: [{
          id: 'call-calculator',
          function: {
            name: 'calculate_decision_matrix',
            arguments: JSON.stringify({
              criteria: [{ name: 'cost', weight: 5 }],
              options: [
                { name: 'Option A', scores: [4] },
                { name: 'Option B', scores: [2] },
              ],
            }),
          },
        }],
      },
      { content: 'Option A wins 54 to 45.' },
    ]);
    const readSkill: ToolDefinition = {
      name: 'read_skill',
      description: 'Read one installed skill',
      parameters: { type: 'object', properties: {} },
      execute: vi.fn(async () => 'Decision matrix instructions'),
    };
    const calculator: ToolDefinition = {
      name: 'calculate_decision_matrix',
      description: 'Calculate a weighted decision matrix',
      parameters: { type: 'object', properties: {} },
      execute: vi.fn(async () => '{"winner":"Option A","total":54,"otherTotal":45}'),
    };

    const result = await runAgentLoop(makeConfig({
      fetch,
      tools: [readSkill, calculator],
      requiredToolSequence: ['read_skill', 'calculate_decision_matrix'],
    }));

    expect(result.content).toBe('Option A wins 54 to 45.');
    expect(result.toolsUsed).toEqual(['read_skill', 'calculate_decision_matrix']);
    expect(readSkill.execute).toHaveBeenCalledOnce();
    expect(calculator.execute).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledTimes(3);
    const bodies = fetch.mock.calls.map((call) => JSON.parse(call[1].body));
    expect(bodies[0].tool_choice.function.name).toBe('read_skill');
    expect(bodies[1].tool_choice.function.name).toBe('calculate_decision_matrix');
    expect(bodies[0].parallel_tool_calls).toBe(false);
    expect(bodies[1].parallel_tool_calls).toBe(false);
    expect(bodies[2].tool_choice).toBeUndefined();
    expect(bodies[2].tools).toBeUndefined();
    const synthesisToolMessages = bodies[2].messages.filter((message: { role: string }) => (
      message.role === 'tool'
    ));
    expect(synthesisToolMessages).toHaveLength(2);
    expect(synthesisToolMessages[0]).toMatchObject({ tool_call_id: 'call-skill' });
    expect(synthesisToolMessages[0].content).toContain('Decision matrix instructions');
    expect(synthesisToolMessages[1]).toMatchObject({ tool_call_id: 'call-calculator' });
    expect(synthesisToolMessages[1].content).toContain('"total":54');
  });

  it('fails closed before dispatch when a required sequence tool is unavailable', async () => {
    const fetch = mockFetch([{ content: 'must not run' }]);

    await expect(runAgentLoop(makeConfig({
      fetch,
      requiredToolSequence: ['read_skill'],
    }))).rejects.toThrow(/required tool.*read_skill.*unavailable/i);

    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    'Error: skill not found',
    'Failed: access denied',
    '{"error":"access denied"}',
  ])('fails closed when a required sequence tool returns %s', async (toolResult) => {
    const fetch = mockFetch([{
      content: null,
      tool_calls: [{
        id: 'call-skill',
        function: { name: 'read_skill', arguments: '{"name":"decision-matrix"}' },
      }],
    }]);
    const readSkill: ToolDefinition = {
      name: 'read_skill',
      description: 'Read one installed skill',
      parameters: { type: 'object', properties: {} },
      execute: vi.fn(async () => toolResult),
    };

    await expect(runAgentLoop(makeConfig({
      fetch,
      tools: [readSkill],
      requiredToolSequence: ['read_skill'],
    }))).rejects.toThrow(/required tool.*read_skill.*failed/i);

    expect(readSkill.execute).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('rejects a provider call that violates the required tool order', async () => {
    const fetch = mockFetch([{
      content: null,
      tool_calls: [{
        id: 'call-wrong',
        function: { name: 'calculate_decision_matrix', arguments: '{}' },
      }],
    }]);
    const readSkill: ToolDefinition = {
      name: 'read_skill',
      description: 'Read one installed skill',
      parameters: { type: 'object', properties: {} },
      execute: vi.fn(async () => 'Decision matrix instructions'),
    };
    const calculator: ToolDefinition = {
      name: 'calculate_decision_matrix',
      description: 'Calculate a weighted decision matrix',
      parameters: { type: 'object', properties: {} },
      execute: vi.fn(async () => '{}'),
    };

    await expect(runAgentLoop(makeConfig({
      fetch,
      tools: [readSkill, calculator],
      requiredToolSequence: ['read_skill', 'calculate_decision_matrix'],
    }))).rejects.toThrow(/required tool.*read_skill.*not called in sequence/i);

    expect(readSkill.execute).not.toHaveBeenCalled();
    expect(calculator.execute).not.toHaveBeenCalled();
  });

  it('fails closed when governance rejects a required tool before execution', async () => {
    const fetch = mockFetch([{
      content: null,
      tool_calls: [{
        id: 'call-skill',
        function: { name: 'read_skill', arguments: '{"name":"decision-matrix"}' },
      }],
    }]);
    const readSkill: ToolDefinition = {
      name: 'read_skill',
      description: 'Read one installed skill',
      parameters: { type: 'object', properties: {} },
      execute: vi.fn(async () => 'must not run'),
    };

    await expect(runAgentLoop(makeConfig({
      fetch,
      tools: [readSkill],
      requiredToolSequence: ['read_skill'],
      governancePolicies: { blockedTools: ['read_skill'] },
    }))).rejects.toThrow(/required tool.*read_skill.*failed/i);

    expect(readSkill.execute).not.toHaveBeenCalled();
  });

  it('rejects an ambiguous required tool before provider dispatch', async () => {
    const fetch = mockFetch([{ content: 'must not run' }]);
    const readSkill: ToolDefinition = {
      name: 'read_skill',
      description: 'Read one installed skill',
      parameters: { type: 'object', properties: {} },
      execute: vi.fn(async () => 'built-in'),
    };
    const pluginTools: PluginToolProvider = {
      getAllTools: () => [{ ...readSkill, execute: vi.fn(async () => 'plugin') }],
    };

    await expect(runAgentLoop(makeConfig({
      fetch,
      tools: [readSkill],
      pluginTools,
      requiredToolSequence: ['read_skill'],
    }))).rejects.toThrow(/required tool.*read_skill.*ambiguous/i);

    expect(fetch).not.toHaveBeenCalled();
  });

  it('fails closed when a required tool cannot start within the token budget', async () => {
    const fetch = mockFetch([{ content: 'must not run' }]);
    const readSkill: ToolDefinition = {
      name: 'read_skill',
      description: 'Read one installed skill',
      parameters: { type: 'object', properties: {} },
      execute: vi.fn(async () => 'instructions'),
    };

    await expect(runAgentLoop(makeConfig({
      fetch,
      tools: [readSkill],
      requiredToolSequence: ['read_skill'],
      maxTokenBudget: 1,
    }))).rejects.toThrow(/required tool.*read_skill.*could not start.*token budget/i);

    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not execute a required tool after the provider exhausts the token budget', async () => {
    const fetch = mockFetch([{
      content: null,
      tool_calls: [{
        id: 'call-skill',
        function: { name: 'read_skill', arguments: '{"name":"decision-matrix"}' },
      }],
      usage: { prompt_tokens: 700, completion_tokens: 300 },
    }]);
    const readSkill: ToolDefinition = {
      name: 'read_skill',
      description: 'Read one installed skill',
      parameters: { type: 'object', properties: {} },
      execute: vi.fn(async () => 'instructions'),
    };

    await expect(runAgentLoop(makeConfig({
      fetch,
      tools: [readSkill],
      requiredToolSequence: ['read_skill'],
      maxTokenBudget: 1_000,
    }))).rejects.toThrow(/required tool.*read_skill.*could not complete.*token budget/i);

    expect(readSkill.execute).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledOnce();
  });

  it.each([
    ['maxTurns', { maxTurns: 2 }],
    ['maxToolRounds', { maxToolRounds: 1 }],
  ])('rejects a required sequence that exceeds %s', async (_label, limits) => {
    const fetch = mockFetch([{ content: 'must not run' }]);
    const tools: ToolDefinition[] = ['read_skill', 'calculate_decision_matrix'].map((name) => ({
      name,
      description: name,
      parameters: { type: 'object', properties: {} },
      execute: vi.fn(async () => 'ok'),
    }));

    await expect(runAgentLoop(makeConfig({
      fetch,
      tools,
      requiredToolSequence: ['read_skill', 'calculate_decision_matrix'],
      ...limits,
    }))).rejects.toThrow(/required tool sequence does not fit/i);

    expect(fetch).not.toHaveBeenCalled();
  });

  it('retries once when the model emits raw tool-call markup as text', async () => {
    const fetch = mockFetch([
      {
        content: 'Let me check.\n[TOOL_CALL]\n{tool => "get_identity", args => {}}\n[/TOOL_CALL]',
      },
      { content: 'Direct answer without fake tool markup.' },
    ]);

    const result = await runAgentLoop(makeConfig({ fetch }));

    expect(result.content).toBe('Direct answer without fake tool markup.');
    expect(fetch).toHaveBeenCalledTimes(2);
    const secondBody = JSON.parse(fetch.mock.calls[1][1].body);
    expect(secondBody.messages.at(-1).content).toContain('Do not output tool-call tags');
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
      (m: { role?: string; tool_call_id?: string }) => m.role === 'tool' && m.tool_call_id === 'call_1'
    );
    expect(toolResultMsg).toBeDefined();
    // §C: executed-tool output is fenced as untrusted data; the result is
    // preserved verbatim inside the fence (was toBe before the fence landed).
    expect(toolResultMsg.content).toContain('Echo: hi');
  });

  it('keeps the next model request valid after malformed tool-call arguments', async () => {
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

    let callCount = 0;
    const fetch = vi.fn(async (_url: string, init?: RequestInit) => {
      callCount++;
      if (callCount === 1) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            choices: [
              {
                message: {
                  role: 'assistant',
                  content: 'Let me check that.',
                  tool_calls: [
                    {
                      id: 'call_bad',
                      type: 'function',
                      function: { name: 'echo', arguments: '{"text":' },
                    },
                  ],
                },
                finish_reason: 'tool_calls',
              },
            ],
            usage: { prompt_tokens: 10, completion_tokens: 4 },
          }),
        } as unknown as Response;
      }

      const body = JSON.parse(String(init?.body ?? '{}'));
      const assistantWithToolCall = body.messages.find(
        (m: { role?: string; tool_calls?: Array<{ function: { arguments: string } }> }) => m.role === 'assistant' && m.tool_calls,
      );
      const toolResult = body.messages.find((m: { role?: string; content?: string }) => m.role === 'tool');
      expect(assistantWithToolCall.tool_calls[0].function.arguments).toBe('{}');
      expect(toolResult.content).toContain('Invalid arguments for echo');

      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: { role: 'assistant', content: 'I can answer without that malformed tool call.' },
              finish_reason: 'stop',
            },
          ],
          usage: { prompt_tokens: 12, completion_tokens: 7 },
        }),
      } as unknown as Response;
    });

    const result = await runAgentLoop(makeConfig({ fetch, tools: [echoTool] }));

    expect(result.content).toBe('I can answer without that malformed tool call.');
    expect(echoTool.execute).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(2);
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
      (m: { role?: string; tool_call_id?: string }) => m.role === 'tool' && m.tool_call_id === 'call_missing'
    );
    expect(toolResultMsg).toBeDefined();
    expect(toolResultMsg.content).toContain('Tool "research" not found');
    expect(toolResultMsg.content).toContain('alternatives');
    // Should contain the sub-agent researcher route (keyword match on "research")
    expect(toolResultMsg.content).toContain('subagent');
    expect(toolResultMsg.content).toContain('researcher');
  });

  it('does not run approval hooks for unavailable tool calls', async () => {
    const hooks = new HookRegistry();
    const preTool = vi.fn();
    hooks.on('pre:tool', preTool);
    const fetch = mockFetch([
      {
        content: null,
        tool_calls: [
          { id: 'call_hidden', function: { name: 'bash', arguments: '{"command":"pwd"}' } },
        ],
      },
      { content: 'I answered without the unavailable tool.' },
    ]);

    const result = await runAgentLoop(makeConfig({ fetch, hooks, tools: [] }));

    expect(result.content).toBe('I answered without the unavailable tool.');
    expect(preTool).not.toHaveBeenCalled();
    const secondBody = JSON.parse(fetch.mock.calls[1][1].body);
    const toolResultMsg = secondBody.messages.find(
      (m: { role?: string; tool_call_id?: string }) => m.role === 'tool' && m.tool_call_id === 'call_hidden'
    );
    expect(toolResultMsg.content).toContain('Unknown tool "bash"');
  });

  it('merges plugin tools into the agent toolset via pluginTools provider', async () => {
    const pluginExecute = vi.fn(async () => 'plugin-result');
    const hooks = new HookRegistry();
    hooks.on('pre:tool', () => ({ authorize: true }));
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
      makeConfig({ fetch, pluginTools: pluginToolProvider, hooks })
    );

    expect(result.content).toBe('Found via plugin.');
    expect(result.toolsUsed).toEqual(['plugin_search']);
    expect(pluginExecute).toHaveBeenCalledWith({ query: 'test' });

    // Verify plugin tool was included in the tools sent to the LLM
    const firstBody = JSON.parse(fetch.mock.calls[0][1].body);
    const toolNames = firstBody.tools.map((t: { function: { name: string } }) => t.function.name);
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
    const toolNames = body.tools.map((t: { function: { name: string } }) => t.function.name);
    expect(toolNames).toContain('base_tool');
    expect(toolNames).toContain('plugin_tool');
    expect(toolNames).toHaveLength(2);
  });

  it.each([
    ['missing', undefined],
    ['low', 'low'],
    ['invalid', 'trusted'],
  ])('normalizes %s plugin-provider risk to the medium confirmation floor', async (_label, riskLevel) => {
    const pluginExecute = vi.fn(async () => 'MUTATION_RAN');
    const pluginToolProvider: PluginToolProvider = {
      getAllTools: () => [{
        name: 'opaque_plugin_mutation',
        description: 'Perform a plugin action',
        parameters: { type: 'object', properties: {} },
        execute: pluginExecute,
        ...(riskLevel === undefined ? {} : { riskLevel }),
      }],
    };
    const hooks = new HookRegistry();
    let observedRisk: unknown;
    hooks.on('pre:tool', (ctx) => {
      observedRisk = ctx.riskLevel;
      if (ctx.toolName && needsConfirmationWithAutonomy(
        ctx.toolName,
        ctx.args,
        'normal',
        ctx.riskLevel as 'low' | 'medium' | 'high' | 'critical' | undefined,
      )) {
        return { cancel: true, reason: 'external plugin risk requires approval' };
      }
    });
    const fetch = mockFetch([
      {
        content: null,
        tool_calls: [{
          id: 'call_plugin_risk',
          function: { name: 'opaque_plugin_mutation', arguments: '{}' },
        }],
      },
      { content: 'The plugin action was not approved.' },
    ]);

    const result = await runAgentLoop(makeConfig({
      fetch,
      hooks,
      pluginTools: pluginToolProvider,
    }));

    expect(observedRisk).toBe('medium');
    expect(pluginExecute).not.toHaveBeenCalled();
    expect(result.toolsUsed).toEqual([]);
    const secondBody = JSON.parse(fetch.mock.calls[1][1].body);
    const toolResult = secondBody.messages.find(
      (message: { role?: string; tool_call_id?: string }) =>
        message.role === 'tool' && message.tool_call_id === 'call_plugin_risk',
    );
    expect(toolResult.content).toContain('[BLOCKED]');
    expect(toolResult.content).toContain('requires approval');
  });

  it.each(['high', 'critical'] as const)(
    'preserves valid %s plugin-provider risk through pre:tool',
    async (riskLevel) => {
      const pluginExecute = vi.fn(async () => 'MUTATION_RAN');
      const pluginToolProvider: PluginToolProvider = {
        getAllTools: () => [{
          name: 'opaque_plugin_mutation',
          description: 'Perform a plugin action',
          parameters: { type: 'object', properties: {} },
          execute: pluginExecute,
          riskLevel,
        }],
      };
      const hooks = new HookRegistry();
      let observedRisk: unknown;
      hooks.on('pre:tool', (ctx) => {
        observedRisk = ctx.riskLevel;
        return { cancel: true, reason: 'approval required' };
      });
      const fetch = mockFetch([
        {
          content: null,
          tool_calls: [{
            id: 'call_plugin_elevated_risk',
            function: { name: 'opaque_plugin_mutation', arguments: '{}' },
          }],
        },
        { content: 'The plugin action was not approved.' },
      ]);

      await runAgentLoop(makeConfig({ fetch, hooks, pluginTools: pluginToolProvider }));

      expect(observedRisk).toBe(riskLevel);
      expect(pluginExecute).not.toHaveBeenCalled();
    },
  );

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

  it('terminates after the initial 502 plus three bounded retries', async () => {
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
    ).rejects.toThrow('Server error retry cap exceeded after 3 retries (latest 502)');

    expect(callCount).toBe(4);
  });

  it('bounds one logical model operation across slow 503 retries and backoff', async () => {
    vi.useFakeTimers();
    const abortController = new AbortController();
    let settlement: { kind: 'resolved' | 'rejected'; value: unknown } | undefined;
    let responseCount = 0;
    const fetch = vi.fn(() => new Promise<Response>((resolve) => {
      setTimeout(() => {
        responseCount++;
        resolve({
          ok: false,
          status: 503,
          headers: { get: () => null },
          text: responseCount === 1
            ? async () => 'temporarily unavailable'
            : () => new Promise<string>(resolveBody => {
                setTimeout(() => resolveBody('still unavailable'), 5_000);
              }),
        } as unknown as Response);
      }, 48_000);
    }));
    const run = runAgentLoop(makeConfig({
      fetch,
      signal: abortController.signal,
      modelOperationTimeoutMs: 100_000,
    })).then(
      value => { settlement = { kind: 'resolved', value }; },
      error => { settlement = { kind: 'rejected', value: error }; },
    );

    try {
      await vi.advanceTimersByTimeAsync(99_999);
      expect(settlement).toBeUndefined();
      await vi.advanceTimersByTimeAsync(1);
      expect(settlement?.kind).toBe('rejected');
      expect((settlement?.value as Error).message).toBe(
        'Model operation timed out after 100 seconds. The provider may be unavailable; retry this turn.',
      );
      expect(fetch).toHaveBeenCalledTimes(2);
    } finally {
      abortController.abort();
      await vi.runAllTimersAsync();
      await run;
      vi.useRealTimers();
    }
  });

  it('fails with a typed retryable timeout when the first stream stays silent', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      body: new ReadableStream<Uint8Array>({ start() {} }),
    } as unknown as Response));
    let rejection: unknown;
    const run = runAgentLoop(makeConfig({
      fetch,
      stream: true,
      modelOperationTimeoutMs: 100_000,
      initialModelActivityTimeoutMs: 30_000,
    })).catch(error => { rejection = error; });

    try {
      await vi.advanceTimersByTimeAsync(30_000);
      expect(rejection).toMatchObject({
        name: 'InitialModelActivityTimeoutError',
        code: 'INITIAL_MODEL_ACTIVITY_TIMEOUT',
        retryable: true,
        usageEstimated: true,
        usage: { outputTokens: 0 },
        toolsUsed: [],
      });
      expect((rejection as { usage: { inputTokens: number } }).usage.inputTokens).toBeGreaterThan(0);
    } finally {
      await run;
      vi.useRealTimers();
    }
  });

  it('accounts every committed retry estimate before the first-activity timeout', async () => {
    vi.useFakeTimers();
    const reservations: ModelSpendReservationRequest[] = [];
    const modelSpendBudget: ModelSpendBudget = {
      reserveModelSpend: vi.fn(request => {
        reservations.push(request);
        return { id: `reservation-${reservations.length}` };
      }),
      reconcileModelSpend: vi.fn(() => true),
      commitReservedModelSpend: vi.fn(() => true),
      releaseReservedModelSpend: vi.fn(() => true),
    };
    const fetch = vi.fn()
      .mockRejectedValueOnce(new Error('fetch failed'))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: new ReadableStream<Uint8Array>({ start() {} }),
      } as unknown as Response);
    let rejection: unknown;
    const run = runAgentLoop(makeConfig({
      fetch,
      stream: true,
      modelSpendBudget,
      modelOperationTimeoutMs: 100_000,
      initialModelActivityTimeoutMs: 30_000,
    })).catch(error => { rejection = error; });

    try {
      await vi.advanceTimersByTimeAsync(30_000);
      await run;
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(modelSpendBudget.commitReservedModelSpend).toHaveBeenCalledTimes(2);
      expect(rejection).toMatchObject({
        code: 'INITIAL_MODEL_ACTIVITY_TIMEOUT',
        usageEstimated: true,
        usage: {
          inputTokens: reservations.reduce((total, request) => total + request.inputTokens, 0),
          outputTokens: 0,
        },
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([
    ['reasoning', { reasoning_content: 'private' }],
    ['content', { content: 'Ready.' }],
  ])('permanently disarms the first-activity timeout for buffered Qwen %s activity', async (_kind, firstDelta) => {
    vi.useFakeTimers();
    const encoder = new TextEncoder();
    const fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          setTimeout(() => controller.enqueue(encoder.encode(
            `data: ${JSON.stringify({ choices: [{ delta: firstDelta }] })}\n\n`,
          )), 29_000);
          setTimeout(() => {
            controller.enqueue(encoder.encode(
              `data: ${JSON.stringify({ choices: [{ delta: firstDelta.content ? {} : { content: 'Ready.' }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 5 } })}\n\n`,
            ));
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
          }, 60_000);
        },
      }),
    } as unknown as Response));
    let result: Awaited<ReturnType<typeof runAgentLoop>> | undefined;
    const run = runAgentLoop(makeConfig({
      fetch,
      stream: true,
      model: 'openai-compatible/qwen3.8-flash-next',
      modelOperationTimeoutMs: 100_000,
      initialModelActivityTimeoutMs: 30_000,
    })).then(value => { result = value; });

    try {
      await vi.advanceTimersByTimeAsync(60_000);
      await run;
      expect(result?.content).toBe('Ready.');
      expect(fetch).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('disarms the first-activity timeout on a tool-call delta and never rearms it', async () => {
    vi.useFakeTimers();
    const encoder = new TextEncoder();
    const tool: ToolDefinition = {
      name: 'list_skills',
      description: 'List skills',
      parameters: { type: 'object', properties: {} },
      execute: vi.fn(async () => '[]'),
    };
    let request = 0;
    const fetch = vi.fn(async () => {
      request++;
      return {
        ok: true,
        status: 200,
        body: new ReadableStream<Uint8Array>({
          start(controller) {
            const delay = request === 1 ? 29_000 : 31_000;
            setTimeout(() => {
              const event = request === 1
                ? {
                    choices: [{
                      delta: {
                        tool_calls: [{
                          index: 0,
                          id: 'call-1',
                          type: 'function',
                          function: { name: 'list_skills', arguments: '{}' },
                        }],
                      },
                      finish_reason: 'tool_calls',
                    }],
                    usage: { prompt_tokens: 10, completion_tokens: 5 },
                  }
                : {
                    choices: [{ delta: { content: 'Finished.' }, finish_reason: 'stop' }],
                    usage: { prompt_tokens: 12, completion_tokens: 4 },
                  };
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
              controller.enqueue(encoder.encode('data: [DONE]\n\n'));
              controller.close();
            }, delay);
          },
        }),
      } as unknown as Response;
    });
    let result: Awaited<ReturnType<typeof runAgentLoop>> | undefined;
    const run = runAgentLoop(makeConfig({
      fetch,
      stream: true,
      tools: [tool],
      maxTurns: 3,
      modelOperationTimeoutMs: 100_000,
      initialModelActivityTimeoutMs: 30_000,
    })).then(value => { result = value; });

    try {
      await vi.advanceTimersByTimeAsync(61_000);
      await run;
      expect(result?.content).toBe('Finished.');
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(tool.execute).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('bounds a delayed response body within the same model-operation deadline', async () => {
    vi.useFakeTimers();
    const tool = {
      name: 'must_not_run',
      description: 'Would prove a body completed after the deadline.',
      parameters: { type: 'object', properties: {} },
      execute: vi.fn(async () => 'unexpected'),
    } satisfies ToolDefinition;
    let settlement: { kind: 'resolved' | 'rejected'; value: unknown } | undefined;
    const fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: () => new Promise((resolve) => {
        setTimeout(() => resolve({
          choices: [{
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [{ id: 'late_call', function: { name: 'must_not_run', arguments: '{}' } }],
            },
            finish_reason: 'tool_calls',
          }],
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        }), 120_000);
      }),
    } as unknown as Response));
    const run = runAgentLoop(makeConfig({
      fetch,
      tools: [tool],
      modelOperationTimeoutMs: 100_000,
    })).then(
      value => { settlement = { kind: 'resolved', value }; },
      error => { settlement = { kind: 'rejected', value: error }; },
    );

    try {
      await vi.advanceTimersByTimeAsync(99_999);
      expect(settlement).toBeUndefined();
      await vi.advanceTimersByTimeAsync(1);
      expect(settlement?.kind).toBe('rejected');
      expect((settlement?.value as Error).message).toBe(
        'Model operation timed out after 100 seconds. The provider may be unavailable; retry this turn.',
      );
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(tool.execute).not.toHaveBeenCalled();
    } finally {
      await vi.runAllTimersAsync();
      await run;
      vi.useRealTimers();
    }
  });

  it('bounds a partial SSE stream within the same model-operation deadline', async () => {
    vi.useFakeTimers();
    const encoder = new TextEncoder();
    const cancel = vi.fn();
    const onToken = vi.fn();
    const onReasoningActivity = vi.fn();
    const tool = {
      name: 'must_not_run',
      description: 'Would prove an incomplete stream executed a tool.',
      parameters: { type: 'object', properties: {} },
      execute: vi.fn(async () => 'unexpected'),
    } satisfies ToolDefinition;
    let settlement: { kind: 'resolved' | 'rejected'; value: unknown } | undefined;
    const fetch = vi.fn(async () => ({
      ok: true,
        status: 200,
        body: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(encoder.encode(
              `data: ${JSON.stringify({ choices: [{ delta: { reasoning_content: 'private', content: 'partial' } }] })}\n\n`,
            ));
          },
          cancel,
        }),
    } as unknown as Response));
    const run = runAgentLoop(makeConfig({
      fetch,
      stream: true,
      tools: [tool],
      onToken,
      onReasoningActivity,
      modelOperationTimeoutMs: 100_000,
    })).then(
      value => { settlement = { kind: 'resolved', value }; },
      error => { settlement = { kind: 'rejected', value: error }; },
    );

    try {
      await vi.advanceTimersByTimeAsync(99_999);
      expect(settlement).toBeUndefined();
      await vi.advanceTimersByTimeAsync(1);
      expect(settlement?.kind).toBe('rejected');
      expect((settlement?.value as Error).message).toBe(
        'Model operation timed out after 100 seconds. The provider may be unavailable; retry this turn.',
      );
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(tool.execute).not.toHaveBeenCalled();
      expect(cancel).toHaveBeenCalledTimes(1);
      expect(onToken).toHaveBeenCalledTimes(1);
      expect(onReasoningActivity).toHaveBeenCalledTimes(1);
    } finally {
      await run;
      vi.useRealTimers();
    }
  });

  it('suppresses late SSE callbacks from a non-cooperative reader after timeout', async () => {
    vi.useFakeTimers();
    const encoder = new TextEncoder();
    const onToken = vi.fn();
    const onReasoningActivity = vi.fn();
    const cancel = vi.fn(async () => undefined);
    let readCount = 0;
    const reader = {
      read: vi.fn(() => {
        readCount += 1;
        if (readCount === 1) {
          return Promise.resolve({
            done: false,
            value: encoder.encode(
              `data: ${JSON.stringify({ choices: [{ delta: { reasoning_content: 'private', content: 'partial' } }] })}\n\n`,
            ),
          });
        }
        if (readCount === 2) {
          return new Promise<ReadableStreamReadResult<Uint8Array>>((resolve) => {
            setTimeout(() => resolve({
              done: false,
              value: encoder.encode(
                `data: ${JSON.stringify({ choices: [{ delta: { reasoning_content: 'late-private', content: 'late' } }] })}\n\n`,
              ),
            }), 120_000);
          });
        }
        return Promise.resolve({ done: true, value: undefined });
      }),
      cancel,
    };
    const fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      body: { getReader: () => reader },
    }) as unknown as Response);
    let settlement: { kind: 'resolved' | 'rejected'; value: unknown } | undefined;
    const run = runAgentLoop(makeConfig({
      fetch,
      stream: true,
      onToken,
      onReasoningActivity,
      modelOperationTimeoutMs: 100_000,
    })).then(
      value => { settlement = { kind: 'resolved', value }; },
      error => { settlement = { kind: 'rejected', value: error }; },
    );

    try {
      await vi.advanceTimersByTimeAsync(0);
      expect(onToken).toHaveBeenCalledTimes(1);
      expect(onReasoningActivity).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(100_000);
      expect(settlement?.kind).toBe('rejected');
      expect(cancel).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(20_000);
      expect(onToken).toHaveBeenCalledTimes(1);
      expect(onReasoningActivity).toHaveBeenCalledTimes(1);
    } finally {
      await vi.runAllTimersAsync();
      await run;
      vi.useRealTimers();
    }
  });

  it('does not start response-body work after the client aborts between stages', async () => {
    const abortController = new AbortController();
    const json = vi.fn(async () => ({
      choices: [{ message: { role: 'assistant', content: 'too late' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    }));
    const response = { status: 200, json } as unknown as Response;
    Object.defineProperty(response, 'ok', {
      get() {
        abortController.abort();
        return true;
      },
    });

    await expect(runAgentLoop(makeConfig({
      signal: abortController.signal,
      fetch: vi.fn(async () => response),
      modelOperationTimeoutMs: 100_000,
    }))).rejects.toMatchObject({
      name: 'AgentLoopAbortError',
      code: 'AGENT_LOOP_ABORTED',
    });
    expect(json).not.toHaveBeenCalled();
  });

  it('enforces a fresh model-operation deadline after a long tool finishes', async () => {
    vi.useFakeTimers();
    const slowTool: ToolDefinition = {
      name: 'slow_tool',
      description: 'Completes after a long-running local operation.',
      parameters: { type: 'object', properties: {} },
      execute: vi.fn(async () => new Promise<string>((resolve) => {
        setTimeout(() => resolve('tool-finished'), 120_000);
      })),
    };
    let callCount = 0;
    const fetch = vi.fn(async () => {
      callCount++;
      if (callCount === 1) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            choices: [{
              message: {
                role: 'assistant',
                content: null,
                tool_calls: [{ id: 'call_1', function: { name: 'slow_tool', arguments: '{}' } }],
              },
              finish_reason: 'tool_calls',
            }],
            usage: { prompt_tokens: 10, completion_tokens: 5 },
          }),
        } as unknown as Response;
      }
      return new Promise<Response>((resolve) => {
        setTimeout(() => resolve({
          ok: true,
          status: 200,
          json: async () => ({
            choices: [{ message: { role: 'assistant', content: 'too late' }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 10, completion_tokens: 5 },
          }),
        } as unknown as Response), 120_000);
      });
    });
    let settlement: { kind: 'resolved' | 'rejected'; value: unknown } | undefined;
    const run = runAgentLoop(makeConfig({
      fetch,
      tools: [slowTool],
      modelOperationTimeoutMs: 100_000,
    })).then(
      value => { settlement = { kind: 'resolved', value }; },
      error => { settlement = { kind: 'rejected', value: error }; },
    );

    try {
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(120_000);
      expect(fetch).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(99_999);
      expect(settlement).toBeUndefined();
      await vi.advanceTimersByTimeAsync(1);
      expect(settlement?.kind).toBe('rejected');
      expect((settlement?.value as Error).message).toBe(
        'Model operation timed out after 100 seconds. Review completed activity before retrying to avoid duplicate actions.',
      );
      expect(settlement?.value).toMatchObject({
        name: 'ModelOperationTimeoutError',
        code: 'MODEL_OPERATION_TIMEOUT',
        usage: { inputTokens: 10, outputTokens: 5 },
        toolsUsed: ['slow_tool'],
      });
      expect(slowTool.execute).toHaveBeenCalledTimes(1);
    } finally {
      await vi.runAllTimersAsync();
      await run;
      vi.useRealTimers();
    }
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

    await expect(runAgentLoop(
      makeConfig({ fetch, tools: [tool], signal: abortController.signal })
    )).rejects.toMatchObject({
      name: 'AgentLoopAbortError',
      code: 'AGENT_LOOP_ABORTED',
      message: 'Agent loop aborted (client disconnected).',
      toolsUsed: ['slow_tool'],
    });
    // Only one fetch call — the loop exited before making a second LLM request
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('rejects an abort during a tool on the final turn with recorded tool activity', async () => {
    const abortController = new AbortController();
    const tool: ToolDefinition = {
      name: 'final_turn_write',
      description: 'Aborts after recording one final-turn tool result.',
      parameters: { type: 'object', properties: {} },
      execute: async () => {
        abortController.abort();
        return 'write-finished';
      },
    };
    const fetch = mockFetch([{
      content: null,
      tool_calls: [
        { id: 'call_final', function: { name: 'final_turn_write', arguments: '{}' } },
      ],
      usage: { prompt_tokens: 14, completion_tokens: 6 },
    }]);

    await expect(runAgentLoop(makeConfig({
      fetch,
      tools: [tool],
      signal: abortController.signal,
      maxTurns: 1,
    }))).rejects.toMatchObject({
      name: 'AgentLoopAbortError',
      code: 'AGENT_LOOP_ABORTED',
      toolsUsed: ['final_turn_write'],
      usage: { inputTokens: 14, outputTokens: 6 },
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('does not abort when signal is not provided', async () => {
    const fetch = mockFetch([{ content: 'Normal response.' }]);

    const result = await runAgentLoop(makeConfig({ fetch }));
    expect(result.content).toBe('Normal response.');
  });

  // R3-008: the abort signal must be forwarded into the in-flight request so an
  // aborted run tears down the connection instead of consuming the stream to
  // completion.
  it('forwards the abort signal to the underlying fetch', async () => {
    const abortController = new AbortController();
    const fetch = mockFetch([{ content: 'Hello.' }]);

    await runAgentLoop(makeConfig({ fetch, signal: abortController.signal }));

    expect(fetch).toHaveBeenCalledTimes(1);
    const init = fetch.mock.calls[0][1];
    // #2: the loop now merges the client-disconnect signal with a per-request
    // timeout (AbortSignal.any), so the fetch receives a *derived* signal rather
    // than the same object. The forwarding contract is functional, not identity:
    // aborting the client signal must abort the signal the fetch actually saw.
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(init.signal.aborted).toBe(false);
    abortController.abort();
    expect(init.signal.aborted).toBe(true);
  });

  // R3-008: an abort that fires while the in-flight response body is being read must
  // short-circuit the turn before tool calls run or a second request is issued.
  it('rejects promptly when aborted during the in-flight response body', async () => {
    const abortController = new AbortController();
    const tool: ToolDefinition = {
      name: 'should_not_run',
      description: 'Must never execute once aborted mid-request',
      parameters: { type: 'object', properties: {} },
      execute: vi.fn(async () => 'tool-result'),
    };

    let markBodyStarted!: () => void;
    const bodyStarted = new Promise<void>((resolve) => {
      markBodyStarted = resolve;
    });
    const fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: () => {
        markBodyStarted();
        return new Promise<never>(() => undefined);
      },
    }) as unknown as Response);

    const run = runAgentLoop(makeConfig({
      fetch,
      tools: [tool],
      signal: abortController.signal,
      modelOperationTimeoutMs: 100_000,
    }));
    const rejection = expect(run).rejects.toMatchObject({
      name: 'AgentLoopAbortError',
      code: 'AGENT_LOOP_ABORTED',
      message: 'Agent loop aborted (client disconnected).',
      toolsUsed: [],
    });

    await bodyStarted;
    abortController.abort();
    await rejection;

    expect(tool.execute).not.toHaveBeenCalled();
    // No model-deadline advancement is needed: the client signal settles the
    // pending body immediately, before either tools or a retry can start.
    expect(fetch).toHaveBeenCalledTimes(1);
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
      (m: { role?: string; tool_call_id?: string }) => m.role === 'tool' && m.tool_call_id === 'call_bad'
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
      (m: { role?: string; tool_call_id?: string }) => m.role === 'tool' && m.tool_call_id === 'call_fail'
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

  it('rejects 200 responses with no assistant content and no tool calls', async () => {
    const fetch = mockFetch([
      {
        content: null,
        // No tool_calls — a model/proxy returned a syntactically successful
        // response that cannot answer the user.
        usage: { prompt_tokens: 10, completion_tokens: 0 },
      },
    ]);

    await expect(runAgentLoop(makeConfig({ fetch }))).rejects.toThrow(/empty assistant response/i);
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
