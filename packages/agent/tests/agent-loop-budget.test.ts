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

    expect(policy.maxToolRounds).toBe(12);
    expect(policy.maxTurns).toBe(13);
    expect(policy.maxTokenBudget).toBe(100_000);
    expect(policy.synthesisReserveTokens).toBeGreaterThan(0);
    expect(policy.toolContextBudget.maxSingleResultChars).toBeLessThanOrEqual(4_000);
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
  it('keeps a deterministic nine-web-call research run below 100k cumulative input', async () => {
    const requestBodies: Array<Record<string, unknown>> = [];
    let modelCall = 0;
    const fetchFn = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      requestBodies.push(body);
      const messages = body.messages as Array<Record<string, unknown>>;
      const promptTokens = Math.ceil(JSON.stringify(messages).length / 4);
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

    expect(webFetch.execute).toHaveBeenCalledTimes(9);
    expect(fetchFn).toHaveBeenCalledTimes(10);
    expect(result.content).toBe('Synthesis grounded in the collected sources.');
    expect(result.usage.inputTokens).toBeLessThanOrEqual(100_000);
    const finalMessages = requestBodies.at(-1)!.messages as Array<{ role: string; content: string; tool_call_id?: string }>;
    const toolResults = finalMessages.filter(message => message.role === 'tool');
    expect(toolResults).toHaveLength(9);
    expect(toolResults.every(message => message.content.length <= 4_000)).toBe(true);
    expect(toolResults.map(message => message.tool_call_id)).toEqual(
      Array.from({ length: 9 }, (_, index) => `call_${index}`),
    );
  });

  it('forces synthesis after twelve normal research rounds without a max-turn failure', async () => {
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

    const result = await runAgentLoop(researchConfig(fetchFn, webFetch));

    expect(webFetch.execute).toHaveBeenCalledTimes(12);
    expect(fetchFn).toHaveBeenCalledTimes(13);
    expect(result.content).toBe('Final evidence synthesis.');
    expect(result.content).not.toMatch(/max(?:imum)? tool turns/i);
  });

  it('uses the token reserve to synthesize before cumulative input crosses 100k', async () => {
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

    expect(webFetch.execute).toHaveBeenCalledTimes(3);
    expect(fetchFn).toHaveBeenCalledTimes(4);
    expect(result.content).toBe('Budget-aware synthesis.');
    expect(result.usage.inputTokens).toBe(92_000);
  });
});
