/**
 * D6 — Permission/recovery, premium pillar: graceful partial-failure
 * recovery WITHOUT confabulation (rubric gap "recovery↔confab").
 *
 * agent-loop.ts catches a thrown tool, feeds the model an HONEST
 * "Error executing <tool>: <msg>" as the role:'tool' result, and the
 * loop continues — so a single tool failure neither crashes the loop
 * nor gets silently swallowed into a fabricated success (ties to the
 * 2cfa773 / D2 anti-confabulation guarantee). This premium behavior was
 * implemented but unlocked — same R5 pattern as D4/D5. (`long-task-
 * recovery.test.ts` locks the higher-level RecoveryRunner, NOT this
 * per-tool-failure agent-loop contract.)
 *
 * Deterministic: mock fetch (no LLM), a tool that throws.
 */
import { describe, it, expect, vi } from 'vitest';
import { runAgentLoop, type AgentLoopConfig } from '../src/agent-loop.js';
import type { ToolDefinition } from '../src/tools.js';

function mockFetch(
  responses: Array<{
    content: string | null;
    tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
  }>,
) {
  let i = 0;
  return vi.fn(async (_url: string, _init?: RequestInit) => {
    const r = responses[i++];
    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{
          message: { role: 'assistant', content: r.content, tool_calls: r.tool_calls },
          finish_reason: r.tool_calls ? 'tool_calls' : 'stop',
        }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      }),
    } as unknown as Response;
  });
}

describe('D6 — graceful partial-failure recovery without confabulation (premium, locked)', () => {
  it('a thrown tool is surfaced HONESTLY to the model and the loop recovers — no crash, no fabricated success', async () => {
    const boom: ToolDefinition = {
      name: 'boom',
      description: 'always fails',
      parameters: { type: 'object', properties: {}, required: [] },
      execute: async () => { throw new Error('disk exploded'); },
    };
    const fetch = mockFetch([
      { content: null, tool_calls: [{ id: 'c1', function: { name: 'boom', arguments: '{}' } }] },
      { content: 'The boom tool failed, so I adjusted and finished without it.' },
    ]);
    const config: AgentLoopConfig = {
      litellmUrl: 'http://localhost:4000',
      litellmApiKey: 'k',
      model: 'test',
      systemPrompt: 'sys',
      tools: [boom],
      messages: [{ role: 'user', content: 'use boom' }],
      fetch: fetch as unknown as typeof globalThis.fetch,
    };

    // 1. Graceful: a failing tool must NOT crash the loop.
    const result = await runAgentLoop(config);
    expect(result.content).toBe('The boom tool failed, so I adjusted and finished without it.');

    // 2. recovery↔confab: the failure is fed back as the tool result —
    //    the EXACT error, not a fabricated success, not empty/dropped.
    const secondBody = JSON.parse((fetch.mock.calls[1][1] as RequestInit).body as string);
    const toolMsg = (secondBody.messages as Array<{ role: string; content: string; tool_call_id?: string }>)
      .find(m => m.role === 'tool' && m.tool_call_id === 'c1');
    expect(toolMsg, 'failed tool must produce a role:tool result for the model').toBeDefined();
    expect(toolMsg!.content).toBe('Error executing boom: disk exploded');

    // 3. Honest accounting: the attempt is recorded, not hidden.
    expect(result.toolsUsed).toContain('boom');

    // 4. The loop genuinely continued past the failure (≥2 LLM turns).
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
