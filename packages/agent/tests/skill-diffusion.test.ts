/**
 * AI-OS Phase 3 — skill diffusion observer test.
 *
 * Verifies that the agent-loop's onSkillDistillationFire callback
 * fires AT the D1 firing site (≥5-tool, R2-gated successful turn)
 * and that observer failures do not block the loop.
 *
 * The diffusion broadcast is recorded onto the signal bus by the
 * chat route — that integration is covered separately. This test
 * just nails down the agent-loop contract.
 */

import { describe, it, expect, vi } from 'vitest';
import { runAgentLoop, type AgentLoopConfig } from '../src/agent-loop.js';
import type { ToolDefinition } from '../src/tools.js';

interface FakeResponse {
  content?: string | null;
  tool_calls?: Array<{
    id: string;
    function: { name: string; arguments: string };
  }>;
  usage?: { prompt_tokens: number; completion_tokens: number };
}

/**
 * Build a fake fetch that emits a programmatic sequence of
 * OpenAI-compatible LiteLLM responses.
 */
function mockFetch(responses: FakeResponse[]): typeof globalThis.fetch {
  let i = 0;
  return (async () => {
    const resp = responses[Math.min(i, responses.length - 1)];
    i += 1;
    const body = {
      id: `msg-${i}`,
      choices: [
        {
          message: {
            role: 'assistant' as const,
            content: resp.content ?? '',
            tool_calls: resp.tool_calls,
          },
          finish_reason: resp.tool_calls ? 'tool_calls' : 'stop',
        },
      ],
      usage: resp.usage ?? { prompt_tokens: 10, completion_tokens: 5 },
    };
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof globalThis.fetch;
}

function makeNoopTool(name: string): ToolDefinition {
  return {
    name,
    description: `${name} tool`,
    input_schema: { type: 'object', properties: {}, required: [] },
    execute: async () => 'ok',
  };
}

function makeConfig(overrides: Partial<AgentLoopConfig> = {}): AgentLoopConfig {
  return {
    litellmUrl: 'http://stub',
    litellmApiKey: 'test',
    model: 'claude-haiku-4-5',
    systemPrompt: 'test agent',
    tools: [
      makeNoopTool('read_file'),
      makeNoopTool('grep'),
      makeNoopTool('list_files'),
      makeNoopTool('edit_file'),
      makeNoopTool('run_tests'),
    ],
    messages: [{ role: 'user', content: 'do a 5-tool task' }],
    maxTurns: 6,
    stream: false,
    ...overrides,
  };
}

/**
 * The "≥5 tools then done" trace shape. The loop will execute the
 * 5 tool_calls, then turn 2 returns a clean text response, which
 * triggers the D1 evaluation.
 */
function fiveTooThenDone(): FakeResponse[] {
  return [
    {
      content: null,
      tool_calls: [
        { id: 't1', function: { name: 'read_file', arguments: '{}' } },
        { id: 't2', function: { name: 'grep', arguments: '{}' } },
        { id: 't3', function: { name: 'list_files', arguments: '{}' } },
        { id: 't4', function: { name: 'edit_file', arguments: '{}' } },
        { id: 't5', function: { name: 'run_tests', arguments: '{}' } },
      ],
    },
    // Use a verification-class word so D3 doesn't try to inject a
    // corrective directive (it would also fire and we'd loop further).
    { content: 'Read the files and edited them. All done.' },
    // After D1 directive injection the loop sends one more user turn;
    // the model returns this clean text and the loop exits.
    { content: 'Skill noted.' },
  ];
}

describe('onSkillDistillationFire (D1 observer)', () => {
  it('fires after a ≥5-tool successful turn', async () => {
    const observer = vi.fn();
    const result = await runAgentLoop(
      makeConfig({
        onSkillDistillationFire: observer,
        fetch: mockFetch(fiveTooThenDone()),
      }),
    );
    expect(result.toolsUsed.length).toBeGreaterThanOrEqual(5);
    expect(observer).toHaveBeenCalledTimes(1);
    const arg = observer.mock.calls[0][0];
    expect(arg.patternKey).toBeTruthy();
    expect(arg.toolsUsed.length).toBeGreaterThanOrEqual(5);
    expect(arg.directive).toContain('distil');
  });

  it('does not fire when fewer than 5 tools were used', async () => {
    const observer = vi.fn();
    await runAgentLoop(
      makeConfig({
        onSkillDistillationFire: observer,
        fetch: mockFetch([
          {
            content: null,
            tool_calls: [
              { id: 't1', function: { name: 'read_file', arguments: '{}' } },
            ],
          },
          { content: 'Done with the single read.' },
        ]),
      }),
    );
    expect(observer).not.toHaveBeenCalled();
  });

  it('swallows observer errors so the distillation loop continues', async () => {
    const failingObserver = vi.fn(() => {
      throw new Error('downstream emitter exploded');
    });
    const result = await runAgentLoop(
      makeConfig({
        onSkillDistillationFire: failingObserver,
        fetch: mockFetch(fiveTooThenDone()),
      }),
    );
    expect(failingObserver).toHaveBeenCalled();
    // Loop completed with a response — observer's throw did NOT break it.
    expect(result.content.length).toBeGreaterThan(0);
  });

  it('is not called when skillDistillationGate=false', async () => {
    const observer = vi.fn();
    await runAgentLoop(
      makeConfig({
        onSkillDistillationFire: observer,
        skillDistillationGate: false,
        fetch: mockFetch(fiveTooThenDone()),
      }),
    );
    expect(observer).not.toHaveBeenCalled();
  });
});
