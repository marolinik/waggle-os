import { describe, expect, it, vi } from 'vitest';
import { runAgentLoop, type AgentLoopConfig } from '../src/agent-loop.js';
import {
  compactToolContextForModel,
  selectAgentRunBudget,
} from '../src/agent-run-budget.js';
import type { ToolDefinition } from '../src/tools.js';

function jsonResponse(
  message: Record<string, unknown>,
  promptTokens: number,
  completionTokens = 100,
): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{ message, finish_reason: message.tool_calls ? 'tool_calls' : 'stop' }],
      usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens },
    }),
  } as unknown as Response;
}

function jsonResponseWithoutUsage(message: Record<string, unknown>): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{ message, finish_reason: message.tool_calls ? 'tool_calls' : 'stop' }],
    }),
  } as unknown as Response;
}

function researchConfig(
  fetchFn: typeof fetch,
  tool: ToolDefinition,
): AgentLoopConfig {
  const policy = selectAgentRunBudget({
    taskShape: 'research',
    complexity: 'complex',
    selectedToolNames: [tool.name],
  });
  return {
    litellmUrl: 'http://localhost:4000',
    litellmApiKey: 'test-key',
    model: 'test-model',
    systemPrompt: 'S'.repeat(30_000),
    messages: [{ role: 'user', content: 'Research this with primary sources.' }],
    tools: [tool],
    fetch: fetchFn,
    stream: false,
    verificationGate: false,
    skillDistillationGate: false,
    ...policy,
  };
}

describe('agent run budget policy', () => {
  it('bounds research while reserving a final synthesis turn', () => {
    const policy = selectAgentRunBudget({
      taskShape: 'research',
      complexity: 'complex',
      selectedToolNames: ['web_search', 'web_fetch'],
    });

    expect(policy.maxToolRounds).toBe(4);
    expect(policy.maxTurns).toBe(5);
    expect(policy.maxTokenBudget).toBe(56_000);
    expect(policy.synthesisReserveTokens).toBe(13_000);
    expect(policy.toolContextBudget).toEqual({
      maxSingleResultChars: 3_000,
      recentResultCount: 1,
      historicalResultChars: 400,
    });
  });

  it('keeps calculator, complex multi-step, and document workflows functional', () => {
    const calculator = selectAgentRunBudget({
      taskShape: 'decide',
      complexity: 'simple',
      selectedToolNames: ['calculator'],
    });
    const multiStep = selectAgentRunBudget({
      taskShape: 'plan-execute',
      complexity: 'complex',
      selectedToolNames: ['read_file', 'edit_file', 'run_tests'],
    });
    const document = selectAgentRunBudget({
      taskShape: 'draft',
      complexity: 'moderate',
      selectedToolNames: ['generate_docx'],
    });

    expect(calculator.maxToolRounds).toBeGreaterThanOrEqual(4);
    expect(multiStep.maxToolRounds).toBeGreaterThan(12);
    expect(document.maxToolRounds).toBeGreaterThan(12);
    expect(document.toolContextBudget.maxSingleResultChars).toBeGreaterThan(4_000);
  });
});

describe('model-facing tool context', () => {
  it('preserves tool-call IDs, recent results, errors, and bounded source excerpts', () => {
    const messages = [
      { role: 'assistant' as const, content: '', tool_calls: [{ id: 'call_old', type: 'function' as const, function: { name: 'web_fetch', arguments: '{}' } }] },
      { role: 'tool' as const, content: `https://old.example/source\n${'o'.repeat(3_000)}\nTAIL_OLD`, tool_call_id: 'call_old' },
      { role: 'assistant' as const, content: '', tool_calls: [{ id: 'call_error', type: 'function' as const, function: { name: 'web_fetch', arguments: '{}' } }] },
      { role: 'tool' as const, content: 'Error fetching https://broken.example: timed out', tool_call_id: 'call_error' },
      { role: 'assistant' as const, content: '', tool_calls: [{ id: 'call_recent_1', type: 'function' as const, function: { name: 'web_fetch', arguments: '{}' } }] },
      { role: 'tool' as const, content: `https://recent.example/1\n${'r'.repeat(3_000)}\nTAIL_RECENT_1`, tool_call_id: 'call_recent_1' },
      { role: 'assistant' as const, content: '', tool_calls: [{ id: 'call_recent_2', type: 'function' as const, function: { name: 'web_fetch', arguments: '{}' } }] },
      { role: 'tool' as const, content: `https://recent.example/2\n${'s'.repeat(3_000)}\nTAIL_RECENT_2`, tool_call_id: 'call_recent_2' },
    ];

    const compacted = compactToolContextForModel(messages, {
      maxSingleResultChars: 4_000,
      recentResultCount: 2,
      historicalResultChars: 500,
    });
    const results = compacted.filter(message => message.role === 'tool');

    expect(results.map(message => message.tool_call_id)).toEqual([
      'call_old', 'call_error', 'call_recent_1', 'call_recent_2',
    ]);
    expect(results[0].content?.length).toBeLessThanOrEqual(500);
    expect(results[0].content).toContain('https://old.example/source');
    expect(results[0].content).toContain('TAIL_OLD');
    expect(results[1].content).toBe('Error fetching https://broken.example: timed out');
    expect(results[2].content?.length).toBeGreaterThan(2_000);
    expect(results[3].content).toContain('TAIL_RECENT_2');
  });
});

describe('bounded agent loop synthesis', () => {
  it('forces a deterministic long research run to synthesize below 60k cumulative input', async () => {
    const requestBodies: Array<Record<string, unknown>> = [];
    let modelCall = 0;
    const fetchFn = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      requestBodies.push(body);
      const messages = body.messages as Array<Record<string, unknown>>;
      const promptTokens = Math.ceil(JSON.stringify(messages).length / 4);
      if (!body.tools) {
        return jsonResponse({ role: 'assistant', content: 'Synthesis grounded in the collected sources.' }, promptTokens);
      }
      const current = modelCall++;
      if (current < 9) {
        return jsonResponse({
          role: 'assistant',
          content: '',
          tool_calls: [{
            id: `call_${current}`,
            type: 'function',
            function: { name: 'web_fetch', arguments: JSON.stringify({ url: `https://primary.example/${current}` }) },
          }],
        }, promptTokens);
      }
      return jsonResponse({ role: 'assistant', content: 'Synthesis grounded in the collected sources.' }, promptTokens);
    }) as unknown as typeof fetch;
    const webFetch: ToolDefinition = {
      name: 'web_fetch',
      description: 'Fetch a primary source.',
      parameters: { type: 'object', properties: { url: { type: 'string' } } },
      execute: vi.fn(async args => (
        `SOURCE ${String(args.url)}\nFACT_${String(args.url).split('/').at(-1)}\n`
        + 'e'.repeat(20_000)
        + `\nEND_SOURCE ${String(args.url)}`
      )),
    };

    const result = await runAgentLoop(researchConfig(fetchFn, webFetch));

    expect(webFetch.execute).toHaveBeenCalledTimes(4);
    expect(fetchFn).toHaveBeenCalledTimes(5);
    expect(result.content).toBe('Synthesis grounded in the collected sources.');
    expect(result.usage.inputTokens).toBeLessThanOrEqual(60_000);
    const finalMessages = requestBodies.at(-1)!.messages as Array<{ role: string; content: string; tool_call_id?: string }>;
    const toolResults = finalMessages.filter(message => message.role === 'tool');
    expect(toolResults).toHaveLength(4);
    expect(toolResults.every(message => message.content.length <= 3_000)).toBe(true);
    expect(toolResults.map(message => message.tool_call_id)).toEqual(
      Array.from({ length: 4 }, (_, index) => `call_${index}`),
    );
  });

  it('forces synthesis after four normal research rounds without a max-turn failure', async () => {
    let toolCall = 0;
    const fetchFn = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { tools?: unknown[] };
      if (!body.tools) {
        return jsonResponse({
          role: 'assistant',
          content: 'Final evidence synthesis.',
          tool_calls: [{
            id: 'ignored_after_budget',
            type: 'function',
            function: { name: 'web_fetch', arguments: '{"url":"https://must-not-run.test"}' },
          }],
        }, 5_000);
      }
      const current = toolCall++;
      return jsonResponse({
        role: 'assistant',
        content: '',
        tool_calls: [{
          id: `round_${current}`,
          type: 'function',
          function: { name: 'web_fetch', arguments: JSON.stringify({ url: `https://example.test/${current}` }) },
        }],
      }, 5_000);
    }) as unknown as typeof fetch;
    const webFetch: ToolDefinition = {
      name: 'web_fetch',
      description: 'Fetch evidence.',
      parameters: { type: 'object', properties: { url: { type: 'string' } } },
      execute: vi.fn(async args => `Evidence from ${String(args.url)}`),
    };

    const result = await runAgentLoop({
      ...researchConfig(fetchFn, webFetch),
      maxTokenBudget: 1_000_000,
    });

    expect(webFetch.execute).toHaveBeenCalledTimes(4);
    expect(fetchFn).toHaveBeenCalledTimes(5);
    expect(result.content).toBe('Final evidence synthesis.');
    expect(result.content).not.toMatch(/max(?:imum)? tool turns/i);
  });

  it('uses the token reserve to synthesize before cumulative input crosses 60k', async () => {
    let toolCall = 0;
    const fetchFn = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { tools?: unknown[] };
      if (!body.tools) {
        return jsonResponse({ role: 'assistant', content: 'Budget-aware synthesis.' }, 8_000);
      }
      const current = toolCall++;
      return jsonResponse({
        role: 'assistant',
        content: '',
        tool_calls: [{
          id: `budget_${current}`,
          type: 'function',
          function: { name: 'web_fetch', arguments: JSON.stringify({ url: `https://budget.test/${current}` }) },
        }],
      }, 28_000);
    }) as unknown as typeof fetch;
    const webFetch: ToolDefinition = {
      name: 'web_fetch',
      description: 'Fetch evidence.',
      parameters: { type: 'object', properties: { url: { type: 'string' } } },
      execute: vi.fn(async () => 'Evidence'),
    };

    const result = await runAgentLoop(researchConfig(fetchFn, webFetch));

    expect(webFetch.execute).toHaveBeenCalledTimes(1);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(result.content).toBe('Budget-aware synthesis.');
    expect(result.usage.inputTokens).toBe(36_000);
  });
});

describe('hard request dispatch budget', () => {
  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid maxTokenBudget=%s before any provider call',
    async (maxTokenBudget) => {
      const fetchFn = vi.fn() as unknown as typeof fetch;

      await expect(runAgentLoop({
        litellmUrl: 'http://localhost:4000',
        litellmApiKey: 'test-key',
        model: 'test-model',
        systemPrompt: 'Be concise.',
        messages: [{ role: 'user', content: 'Answer.' }],
        tools: [],
        fetch: fetchFn,
        maxTokenBudget,
      })).rejects.toThrow(/maxTokenBudget must be a positive finite number/i);

      expect(fetchFn).not.toHaveBeenCalled();
    },
  );

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid maxOutputTokens=%s before any provider call',
    async (maxOutputTokens) => {
      const fetchFn = vi.fn() as unknown as typeof fetch;

      await expect(runAgentLoop({
        litellmUrl: 'http://localhost:4000',
        litellmApiKey: 'test-key',
        model: 'test-model',
        systemPrompt: 'Be concise.',
        messages: [{ role: 'user', content: 'Answer.' }],
        tools: [],
        fetch: fetchFn,
        maxOutputTokens,
      })).rejects.toThrow(/maxOutputTokens must be a positive finite number/i);

      expect(fetchFn).not.toHaveBeenCalled();
    },
  );

  it('rejects an oversized initial request before any provider call', async () => {
    const fetchFn = vi.fn() as unknown as typeof fetch;
    const result = await runAgentLoop({
      litellmUrl: 'http://localhost:4000',
      litellmApiKey: 'test-key',
      model: 'test-model',
      systemPrompt: 'x'.repeat(2_000),
      messages: [{ role: 'user', content: 'Answer briefly.' }],
      tools: [],
      fetch: fetchFn,
      maxTurns: 3,
      maxTokenBudget: 100,
      synthesisReserveTokens: 50,
      verificationGate: false,
      skillDistillationGate: false,
    });

    expect(fetchFn).not.toHaveBeenCalled();
    expect(result.content).toMatch(/token budget/i);
  });

  it('caps every provider response to the remaining dispatch allowance', async () => {
    const requestBodies: Array<Record<string, unknown>> = [];
    const fetchFn = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      requestBodies.push(body);
      if (requestBodies.length === 1) {
        return jsonResponse({
          role: 'assistant',
          content: '',
          tool_calls: [{
            id: 'read_1',
            type: 'function',
            function: { name: 'read_file', arguments: '{}' },
          }],
        }, 50, 10);
      }
      return jsonResponse({ role: 'assistant', content: 'Done.' }, 70, 20);
    }) as unknown as typeof fetch;
    const readFile: ToolDefinition = {
      name: 'read_file',
      description: 'Read a file.',
      parameters: { type: 'object', properties: {} },
      execute: vi.fn(async () => 'short result'),
    };

    await runAgentLoop({
      litellmUrl: 'http://localhost:4000',
      litellmApiKey: 'test-key',
      model: 'test-model',
      systemPrompt: 'Be concise.',
      messages: [{ role: 'user', content: 'Read the file and answer.' }],
      tools: [readFile],
      fetch: fetchFn,
      maxTurns: 3,
      maxTokenBudget: 1_000,
      maxOutputTokens: 900,
      verificationGate: false,
      skillDistillationGate: false,
    });

    const caps = requestBodies.map(body => Number(body.max_tokens));
    expect(caps).toHaveLength(2);
    expect(caps.every(cap => Number.isInteger(cap) && cap > 0 && cap <= 900)).toBe(true);
    expect(caps[1]).toBeLessThan(caps[0]);
  });

  it('accounts conservatively when the provider omits usage', async () => {
    const requestBodies: Array<Record<string, unknown>> = [];
    const fetchFn = vi.fn(async (_url: string, init?: RequestInit) => {
      requestBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      if (requestBodies.length === 1) {
        return jsonResponseWithoutUsage({
          role: 'assistant',
          content: '',
          tool_calls: [{
            id: 'read_without_usage',
            type: 'function',
            function: { name: 'read_file', arguments: '{}' },
          }],
        });
      }
      return jsonResponseWithoutUsage({ role: 'assistant', content: 'Done without usage.' });
    }) as unknown as typeof fetch;
    const readFile: ToolDefinition = {
      name: 'read_file',
      description: 'Read a file.',
      parameters: { type: 'object', properties: {} },
      execute: vi.fn(async () => 'short result'),
    };

    const result = await runAgentLoop({
      litellmUrl: 'http://localhost:4000',
      litellmApiKey: 'test-key',
      model: 'test-model',
      systemPrompt: 'S'.repeat(400),
      messages: [{ role: 'user', content: 'Read the file and answer.' }],
      tools: [readFile],
      fetch: fetchFn,
      maxTurns: 3,
      maxTokenBudget: 1_000,
      maxOutputTokens: 800,
      verificationGate: false,
      skillDistillationGate: false,
    });

    const caps = requestBodies.map(body => Number(body.max_tokens));
    expect(caps).toHaveLength(2);
    expect(caps[1]).toBeLessThan(caps[0]);
    expect(result.usage.inputTokens).toBeGreaterThan(0);
    expect(result.usage.outputTokens).toBeGreaterThan(0);
  });

  it('does not execute pending tools or issue synthesis after reported usage exhausts the budget', async () => {
    const fetchFn = vi.fn(async () => jsonResponse({
      role: 'assistant',
      content: '',
      tool_calls: [{
        id: 'must_not_run',
        type: 'function',
        function: { name: 'read_file', arguments: '{}' },
      }],
    }, 300, 150)) as unknown as typeof fetch;
    const readFile: ToolDefinition = {
      name: 'read_file',
      description: 'Read a file.',
      parameters: { type: 'object', properties: {} },
      execute: vi.fn(async () => 'secret'),
    };

    const result = await runAgentLoop({
      litellmUrl: 'http://localhost:4000',
      litellmApiKey: 'test-key',
      model: 'test-model',
      systemPrompt: 'Use evidence.',
      messages: [{ role: 'user', content: 'Read the file.' }],
      tools: [readFile],
      fetch: fetchFn,
      maxTurns: 5,
      maxTokenBudget: 400,
      synthesisReserveTokens: 100,
      verificationGate: true,
      skillDistillationGate: true,
    });

    expect(fetchFn).toHaveBeenCalledOnce();
    expect(readFile.execute).not.toHaveBeenCalled();
    expect(result.content).toMatch(/budget|evidence/i);
  });

  it('preserves a usable final answer after provider-reported overshoot', async () => {
    const fetchFn = vi.fn(async () => jsonResponse(
      { role: 'assistant', content: 'Usable final answer.' },
      300,
      150,
    )) as unknown as typeof fetch;

    const result = await runAgentLoop({
      litellmUrl: 'http://localhost:4000',
      litellmApiKey: 'test-key',
      model: 'test-model',
      systemPrompt: 'Answer directly.',
      messages: [{ role: 'user', content: 'Answer.' }],
      tools: [],
      fetch: fetchFn,
      maxTurns: 3,
      maxTokenBudget: 400,
      synthesisReserveTokens: 100,
      verificationGate: true,
      skillDistillationGate: true,
    });

    expect(fetchFn).toHaveBeenCalledOnce();
    expect(result.content).toBe('Usable final answer.');
  });

  it('preserves forced synthesis prose when an exhausted provider adds a phantom tool call', async () => {
    const fetchFn = vi.fn(async () => jsonResponse({
      role: 'assistant',
      content: 'Usable forced synthesis.',
      tool_calls: [{
        id: 'phantom_after_synthesis',
        type: 'function',
        function: { name: 'read_file', arguments: '{}' },
      }],
    }, 300, 100)) as unknown as typeof fetch;
    const readFile: ToolDefinition = {
      name: 'read_file',
      description: 'Read a file.',
      parameters: { type: 'object', properties: {} },
      execute: vi.fn(async () => 'must not run'),
    };

    const result = await runAgentLoop({
      litellmUrl: 'http://localhost:4000',
      litellmApiKey: 'test-key',
      model: 'test-model',
      systemPrompt: 'Answer directly.',
      messages: [{ role: 'user', content: 'Synthesize.' }],
      tools: [readFile],
      fetch: fetchFn,
      maxTurns: 2,
      maxToolRounds: 0,
      maxTokenBudget: 400,
      synthesisReserveTokens: 100,
      verificationGate: false,
      skillDistillationGate: false,
    });

    expect(fetchFn).toHaveBeenCalledOnce();
    expect(readFile.execute).not.toHaveBeenCalled();
    expect(result.content).toBe('Usable forced synthesis.');
  });

  it('keeps the normal research output cap above the persona acceptance ceiling', async () => {
    let requestBody: Record<string, unknown> | undefined;
    const fetchFn = vi.fn(async (_url: string, init?: RequestInit) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return jsonResponse({ role: 'assistant', content: 'Research answer.' }, 8_000, 100);
    }) as unknown as typeof fetch;
    const webFetch: ToolDefinition = {
      name: 'web_fetch',
      description: 'Fetch evidence.',
      parameters: { type: 'object', properties: {} },
      execute: vi.fn(async () => 'evidence'),
    };

    await runAgentLoop(researchConfig(fetchFn, webFetch));

    expect(Number(requestBody?.max_tokens)).toBeGreaterThanOrEqual(8_000);
  });
});
