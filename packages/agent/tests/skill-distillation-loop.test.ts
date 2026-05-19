/**
 * D1 — the closed learning loop is MECHANICALLY closed at the agent
 * loop, not a soft out-of-band sendEvent('step') the model never sees
 * in its message stream (R5b's seam) and may ignore (R6 proved
 * model-goodwill-dependent). On a qualifying ≥5-tool, R2-gated success
 * the loop deterministically injects the real planSkillDistillation
 * directive INTO the conversation and continues — Hermes-style
 * mechanical closure. Locked end-to-end (deterministic mock fetch).
 *
 * Scope: this verifies the loop deterministically DRIVES distillation.
 * The ~40% speed payoff remains the separate, workload-dependent R6
 * question — not claimed here.
 */
import { describe, it, expect, vi } from 'vitest';
import { runAgentLoop, type AgentLoopConfig } from '../src/agent-loop.js';
import { planSkillDistillation } from '../src/skill-distillation.js';
import type { ToolDefinition } from '../src/tools.js';

type Turn = { content: string | null; tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }> };

function mockFetch(turns: Turn[]) {
  let i = 0;
  return vi.fn(async (_u: string, _i?: RequestInit) => {
    const t = turns[i++];
    return {
      ok: true, status: 200,
      json: async () => ({
        choices: [{ message: { role: 'assistant', content: t.content, tool_calls: t.tool_calls }, finish_reason: t.tool_calls ? 'tool_calls' : 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      }),
    } as unknown as Response;
  });
}

const probe: ToolDefinition = {
  name: 'probe', description: 'noop',
  parameters: { type: 'object', properties: {}, required: [] },
  execute: async () => 'ok',
};
// Distinct args — 5 *identical* calls would (correctly) trip the
// LoopGuard; real ≥5-tool work is varied.
const fiveCalls = [1, 2, 3, 4, 5].map(n => ({ id: `c${n}`, function: { name: 'probe', arguments: JSON.stringify({ step: n }) } }));

function cfg(fetch: ReturnType<typeof mockFetch>, over: Partial<AgentLoopConfig> = {}): AgentLoopConfig {
  return {
    litellmUrl: 'http://x', litellmApiKey: 'k', model: 'm', systemPrompt: 's',
    tools: [probe], messages: [{ role: 'user', content: 'trace it' }],
    fetch: fetch as unknown as typeof globalThis.fetch,
    verificationGate: false, // isolate D1 from the D3 gate
    ...over,
  };
}

describe('D1 — mechanically-closed learning loop (deterministic, locked)', () => {
  it('on a ≥5-tool success the loop INJECTS the real distillation directive and continues', async () => {
    const success = 'Done — traced the full pipeline end to end.';
    const fetch = mockFetch([
      { content: null, tool_calls: fiveCalls },   // 5 tool calls → toolsUsed length 5
      { content: success },                       // qualifying success → loop must distil
      { content: 'Created the reusable skill.' }, // model authors → loop returns
    ]);
    const result = await runAgentLoop(cfg(fetch));

    expect(fetch).toHaveBeenCalledTimes(3); // the success turn was NOT accepted as final
    const expected = planSkillDistillation(['probe', 'probe', 'probe', 'probe', 'probe'], success)!;
    expect(expected).not.toBeNull();
    const body3 = JSON.parse((fetch.mock.calls[2][1] as RequestInit).body as string);
    const injected = (body3.messages as Array<{ role: string; content: string }>)
      .find(m => m.role === 'user' && m.content === expected.directive);
    expect(injected, 'the real planSkillDistillation directive must be injected into the conversation').toBeDefined();
    expect(result.content).toBe('Created the reusable skill.');
  });

  it('is ONE-SHOT — does not re-fire after the distillation turn', async () => {
    const fetch = mockFetch([
      { content: null, tool_calls: fiveCalls },
      { content: 'Traced it fully.' },
      { content: 'Traced it fully again.' }, // even if still "success", one-shot → accepted
    ]);
    const result = await runAgentLoop(cfg(fetch));
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(result.content).toBe('Traced it fully again.');
  });

  it('does NOT fire below the ≥5-tool threshold (no spurious distill turn)', async () => {
    const fetch = mockFetch([
      { content: null, tool_calls: [{ id: 'c1', function: { name: 'probe', arguments: '{}' } }] },
      { content: 'Done with a trivial change.' },
    ]);
    const result = await runAgentLoop(cfg(fetch));
    expect(fetch).toHaveBeenCalledTimes(2); // returned immediately, no injected turn
    expect(result.content).toBe('Done with a trivial change.');
  });

  it('is R2-gated — a ≥5-tool refusal/self-incapacity turn is NOT distilled', async () => {
    const fetch = mockFetch([
      { content: null, tool_calls: fiveCalls },
      { content: "I can't access that path — you'll need to run it yourself." },
    ]);
    const result = await runAgentLoop(cfg(fetch));
    expect(fetch).toHaveBeenCalledTimes(2); // gated off → no distill turn
    expect(result.content).toBe("I can't access that path — you'll need to run it yourself.");
  });

  it('honors the opt-out (skillDistillationGate:false)', async () => {
    const fetch = mockFetch([
      { content: null, tool_calls: fiveCalls },
      { content: 'Traced it fully.' },
    ]);
    const result = await runAgentLoop(cfg(fetch, { skillDistillationGate: false }));
    expect(fetch).toHaveBeenCalledTimes(2); // gate disabled → accepted as-is
    expect(result.content).toBe('Traced it fully.');
  });
});
