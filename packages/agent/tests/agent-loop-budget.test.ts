import { describe, expect, it, vi } from 'vitest';
import { runAgentLoop, type AgentLoopConfig } from '../src/agent-loop.js';
import {
  compactToolContextForModel,
  selectAgentRunBudget,
} from '../src/agent-run-budget.js';
import type { ToolDefinition } from '../src/tools.js';
import {
  UNTRUSTED_GUARD_CLOSE,
  UNTRUSTED_GUARD_OPEN,
  untrustedContextWrapper,
} from '../src/untrusted-context.js';

function jsonResponse(
  message: Record<string, unknown>,
  promptTokens: number,
  completionTokens = 100,
  finishReason = message.tool_calls ? 'tool_calls' : 'stop',
): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{ message, finish_reason: finishReason }],
      usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens },
    }),
  } as unknown as Response;
}

function streamResponse(events: string[]): Response {
  const encoder = new TextEncoder();
  return {
    ok: true,
    status: 200,
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        for (const event of events) controller.enqueue(encoder.encode(event));
        controller.close();
      },
    }),
  } as unknown as Response;
}

function sse(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
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
      historicalResultChars: 900,
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

  it('keeps leading source facts and guard fences in historical research excerpts', () => {
    const policy = selectAgentRunBudget({
      taskShape: 'research',
      complexity: 'complex',
      selectedToolNames: ['web_fetch'],
    });
    const representativeFact = 'Vector search that runs anywhere and stays embedded.';
    const messages = [
      { role: 'assistant' as const, content: '', tool_calls: [{ id: 'call_source', type: 'function' as const, function: { name: 'web_fetch', arguments: '{}' } }] },
      {
        role: 'tool' as const,
        content: untrustedContextWrapper(
          'web_fetch',
          `${representativeFact}\n${'SQLite extension details. '.repeat(200)}\nSOURCE_TAIL`,
        ),
        tool_call_id: 'call_source',
      },
      { role: 'assistant' as const, content: '', tool_calls: [{ id: 'call_newer', type: 'function' as const, function: { name: 'web_fetch', arguments: '{}' } }] },
      {
        role: 'tool' as const,
        content: untrustedContextWrapper('web_fetch', 'Newer PostgreSQL source.'),
        tool_call_id: 'call_newer',
      },
    ];

    const compacted = compactToolContextForModel(messages, policy.toolContextBudget);
    const historical = compacted.find(message => message.tool_call_id === 'call_source');

    expect(historical?.content.length).toBeLessThanOrEqual(900);
    expect(historical?.content).toContain(UNTRUSTED_GUARD_OPEN);
    expect(historical?.content).toContain(UNTRUSTED_GUARD_CLOSE);
    expect(historical?.content).toContain(representativeFact);
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

  it('reserves a replay-sized final input and output budget before another evidence round', async () => {
    const requestBodies: Array<Record<string, unknown>> = [];
    let toolCall = 0;
    const fetchFn = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      requestBodies.push(body);
      if (!body.tools) {
        return jsonResponse({ role: 'assistant', content: 'Budget-aware synthesis.' }, 13_500, 1_000);
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
      }, 13_500, 500);
    }) as unknown as typeof fetch;
    const webFetch: ToolDefinition = {
      name: 'web_fetch',
      description: 'Fetch evidence.',
      parameters: { type: 'object', properties: { url: { type: 'string' } } },
      execute: vi.fn(async () => 'Evidence'),
    };

    const result = await runAgentLoop(researchConfig(fetchFn, webFetch));

    expect(webFetch.execute).toHaveBeenCalledTimes(2);
    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(result.content).toBe('Budget-aware synthesis.');
    expect(result.usage).toEqual({ inputTokens: 40_500, outputTokens: 2_000 });
    expect(requestBodies.map(body => Boolean(body.tools))).toEqual([true, true, false]);
    expect(Number(requestBodies.at(-1)?.max_tokens)).toBeGreaterThanOrEqual(8_000);

    const finalMessages = requestBodies.at(-1)?.messages as Array<{ role: string; content: string }>;
    const directive = finalMessages.at(-1);
    expect(directive?.role).toBe('user');
    const answerIndex = directive?.content.indexOf('First sentence') ?? -1;
    const deliverablesIndex = directive?.content.indexOf('every other explicit user deliverable') ?? -1;
    const detailIndex = directive?.content.indexOf('Only then') ?? -1;
    expect(answerIndex).toBeGreaterThanOrEqual(0);
    expect(deliverablesIndex).toBeGreaterThan(answerIndex);
    expect(detailIndex).toBeGreaterThan(deliverablesIndex);
    expect(directive?.content).toMatch(/recommendation or decision/i);
    expect(directive?.content).toMatch(/do not open with sources, process, or evidence gaps/i);
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

  it('rejects a non-streaming length completion before budget-stop can preserve it', async () => {
    const onToken = vi.fn();
    const fetchFn = vi.fn(async () => jsonResponse(
      { role: 'assistant', content: 'Partial answer presented as complete.' },
      300,
      150,
      'length',
    )) as unknown as typeof fetch;

    await expect(runAgentLoop({
      litellmUrl: 'http://localhost:4000',
      litellmApiKey: 'test-key',
      model: 'test-model',
      systemPrompt: 'Answer directly.',
      messages: [{ role: 'user', content: 'Answer.' }],
      tools: [],
      fetch: fetchFn,
      onToken,
      maxTurns: 3,
      maxTokenBudget: 400,
      synthesisReserveTokens: 100,
      verificationGate: false,
      skillDistillationGate: false,
    })).rejects.toMatchObject({
      code: 'INCOMPLETE_COMPLETION',
      usage: { inputTokens: 300, outputTokens: 150 },
      message: expect.stringMatching(/finish_reason=length.*not accepted/i),
    });

    expect(fetchFn).toHaveBeenCalledOnce();
    expect(onToken).not.toHaveBeenCalled();
  });

  it('rejects a non-streaming completion without a terminal finish reason', async () => {
    const fetchFn = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { role: 'assistant', content: 'Apparently complete.' } }],
        usage: { prompt_tokens: 120, completion_tokens: 30 },
      }),
    } as unknown as Response)) as unknown as typeof fetch;

    await expect(runAgentLoop({
      litellmUrl: 'http://localhost:4000',
      litellmApiKey: 'test-key',
      model: 'test-model',
      systemPrompt: 'Answer directly.',
      messages: [{ role: 'user', content: 'Answer.' }],
      tools: [],
      fetch: fetchFn,
      verificationGate: false,
      skillDistillationGate: false,
    })).rejects.toMatchObject({
      code: 'INCOMPLETE_COMPLETION',
      usage: { inputTokens: 120, outputTokens: 30 },
      message: expect.stringMatching(/missing finish_reason.*not accepted/i),
    });

    expect(fetchFn).toHaveBeenCalledOnce();
  });

  it('reports cumulative paid usage when a later completion is incomplete', async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        role: 'assistant',
        content: '',
        tool_calls: [{
          id: 'read_before_truncation',
          type: 'function',
          function: { name: 'read_file', arguments: '{}' },
        }],
      }, 100, 20))
      .mockResolvedValueOnce(jsonResponse(
        { role: 'assistant', content: 'Partial final answer.' },
        200,
        50,
        'length',
      )) as unknown as typeof fetch;
    const readFile: ToolDefinition = {
      name: 'read_file',
      description: 'Read evidence.',
      parameters: { type: 'object', properties: {} },
      execute: vi.fn(async () => 'evidence'),
    };

    await expect(runAgentLoop({
      litellmUrl: 'http://localhost:4000',
      litellmApiKey: 'test-key',
      model: 'test-model',
      systemPrompt: 'Use evidence.',
      messages: [{ role: 'user', content: 'Answer with evidence.' }],
      tools: [readFile],
      fetch: fetchFn,
      verificationGate: false,
      skillDistillationGate: false,
    })).rejects.toMatchObject({
      code: 'INCOMPLETE_COMPLETION',
      usage: { inputTokens: 300, outputTokens: 70 },
    });

    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(readFile.execute).toHaveBeenCalledOnce();
  });

  it('conservatively accounts a tool-call-only stream when the reader fails without usage', async () => {
    const encoder = new TextEncoder();
    const brokenToolCall = sse({
      choices: [{
        delta: {
          tool_calls: [{
            index: 0,
            id: 'partial_mutation',
            function: { name: 'mutate_state', arguments: JSON.stringify({ value: 'x'.repeat(1_000) }) },
          }],
        },
      }],
    });
    let pullCount = 0;
    const brokenResponse = {
      ok: true,
      status: 200,
      body: new ReadableStream<Uint8Array>({
        pull(controller) {
          if (pullCount++ === 0) controller.enqueue(encoder.encode(brokenToolCall));
          else controller.error(new Error('upstream socket closed'));
        },
      }),
    } as unknown as Response;
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(streamResponse([
        sse({
          choices: [{
            delta: {
              tool_calls: [{
                index: 0,
                id: 'read_first',
                function: { name: 'read_file', arguments: '{}' },
              }],
            },
          }],
        }),
        sse({
          choices: [{ delta: {}, finish_reason: 'tool_calls' }],
          usage: { prompt_tokens: 100, completion_tokens: 20 },
        }),
        'data: [DONE]\n\n',
      ]))
      .mockResolvedValueOnce(brokenResponse) as unknown as typeof fetch;
    const readFile: ToolDefinition = {
      name: 'read_file',
      description: 'Read evidence.',
      parameters: { type: 'object', properties: {} },
      execute: vi.fn(async () => 'evidence'),
    };
    let caught: unknown;

    try {
      await runAgentLoop({
        litellmUrl: 'http://localhost:4000',
        litellmApiKey: 'test-key',
        model: 'test-model',
        systemPrompt: 'Use evidence.',
        messages: [{ role: 'user', content: 'Answer with evidence.' }],
        tools: [readFile],
        fetch: fetchFn,
        stream: true,
        verificationGate: false,
        skillDistillationGate: false,
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toMatchObject({ code: 'INCOMPLETE_COMPLETION' });
    const usage = (caught as { usage: { inputTokens: number; outputTokens: number } }).usage;
    expect(usage.inputTokens).toBeGreaterThan(100);
    expect(usage.outputTokens).toBeGreaterThan(200);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(readFile.execute).toHaveBeenCalledOnce();
  });

  it.each([
    {
      name: 'length termination with DONE',
      events: [
        sse({ choices: [{ delta: { content: 'Partial streamed answer.' } }] }),
        sse({
          choices: [{ delta: {}, finish_reason: 'length' }],
          usage: { prompt_tokens: 100, completion_tokens: 20 },
        }),
        'data: [DONE]\n\n',
      ],
    },
    {
      name: 'physical EOF before DONE',
      events: [
        sse({ choices: [{ delta: { content: 'Apparently complete answer.' } }] }),
        sse({
          choices: [{ delta: {}, finish_reason: 'stop' }],
          usage: { prompt_tokens: 100, completion_tokens: 20 },
        }),
      ],
    },
    {
      name: 'DONE without a terminal finish reason',
      events: [
        sse({ choices: [{ delta: { content: 'Apparently complete answer.' } }] }),
        sse({
          choices: [{ delta: {} }],
          usage: { prompt_tokens: 100, completion_tokens: 20 },
        }),
        'data: [DONE]\n\n',
      ],
    },
  ])('rejects a streaming $name instead of resolving partial content', async ({ events }) => {
    const fetchFn = vi.fn(async () => streamResponse(events)) as unknown as typeof fetch;

    await expect(runAgentLoop({
      litellmUrl: 'http://localhost:4000',
      litellmApiKey: 'test-key',
      model: 'test-model',
      systemPrompt: 'Answer directly.',
      messages: [{ role: 'user', content: 'Answer.' }],
      tools: [],
      fetch: fetchFn,
      stream: true,
      verificationGate: false,
      skillDistillationGate: false,
    })).rejects.toMatchObject({ code: 'INCOMPLETE_COMPLETION' });

    expect(fetchFn).toHaveBeenCalledOnce();
  });

  it.each([
    {
      name: 'length termination',
      terminal: sse({
        choices: [{ delta: {}, finish_reason: 'length' }],
        usage: { prompt_tokens: 100, completion_tokens: 20 },
      }),
    },
    {
      name: 'missing terminal finish reason',
      terminal: sse({
        choices: [{ delta: {} }],
        usage: { prompt_tokens: 100, completion_tokens: 20 },
      }),
    },
  ])('never executes a tool call after an incomplete stream with $name', async ({ terminal }) => {
    const mutate = vi.fn(async () => 'mutated');
    const events = [
      sse({
        choices: [{
          delta: {
            tool_calls: [{
              index: 0,
              id: 'must_not_run',
              function: { name: 'mutate_state', arguments: '{}' },
            }],
          },
        }],
      }),
      terminal,
      'data: [DONE]\n\n',
    ];
    const fetchFn = vi.fn(async () => streamResponse(events)) as unknown as typeof fetch;

    await expect(runAgentLoop({
      litellmUrl: 'http://localhost:4000',
      litellmApiKey: 'test-key',
      model: 'test-model',
      systemPrompt: 'Use tools safely.',
      messages: [{ role: 'user', content: 'Make a change.' }],
      tools: [{
        name: 'mutate_state',
        description: 'Mutates state.',
        parameters: { type: 'object', properties: {} },
        execute: mutate,
      }],
      fetch: fetchFn,
      stream: true,
      verificationGate: false,
      skillDistillationGate: false,
    })).rejects.toMatchObject({ code: 'INCOMPLETE_COMPLETION' });

    expect(fetchFn).toHaveBeenCalledOnce();
    expect(mutate).not.toHaveBeenCalled();
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
