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
  it('on a ≥5-tool success the loop INJECTS the real distillation directive and returns the pre-distillation answer (issue #4)', async () => {
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
    // Issue #4 — the returned content is the answer to the user's question,
    // NOT the distillation turn's skill summary. Distillation runs as a
    // side-effect (skill authored via create_skill); the answer survives.
    expect(result.content).toBe(success);
  });

  it('issue #4 regression — even if the distillation turn returns garbage, the user answer survives', async () => {
    const realAnswer = 'The average age is 45.';
    const fetch = mockFetch([
      { content: null, tool_calls: fiveCalls },
      { content: realAnswer },
      { content: 'The skill has been saved to /home/agent/skills/contact-average/SKILL.md.' },
    ]);
    const result = await runAgentLoop(cfg(fetch));
    expect(fetch).toHaveBeenCalledTimes(3);
    // The distillation summary MUST NOT replace the answer (the GAIA 2
    // failure mode documented in issue #4).
    expect(result.content).not.toContain('skill');
    expect(result.content).toBe(realAnswer);
  });

  it('issue #4 regression — pre-distillation answer survives even at maxTurns exit', async () => {
    const realAnswer = 'Answer is 42.';
    // After D1 fires, the distillation turn itself makes a tool call,
    // and then we hit maxTurns before another text turn — the answer
    // must STILL be the returned content.
    const fetch = mockFetch([
      { content: null, tool_calls: fiveCalls },              // turn 1: 5 tool calls
      { content: realAnswer },                                // turn 2: success → D1 fires
      { content: null, tool_calls: [{ id: 'cs', function: { name: 'probe', arguments: '{}' } }] }, // turn 3: distill-side tool call
      // No more turns scheduled — but maxTurns=3 forces exit here.
    ]);
    const result = await runAgentLoop(cfg(fetch, { maxTurns: 3 }));
    expect(result.content).toBe(realAnswer);
  });

  it('is ONE-SHOT — D1 does not re-fire after the distillation turn (and the preserved answer is returned, issue #4)', async () => {
    const fetch = mockFetch([
      { content: null, tool_calls: fiveCalls },
      { content: 'Traced it fully.' },
      { content: 'Traced it fully again.' }, // even if still "success", D1 does NOT re-fire
    ]);
    const result = await runAgentLoop(cfg(fetch));
    // ONE-SHOT semantics: exactly 3 fetches — no second directive injection.
    expect(fetch).toHaveBeenCalledTimes(3);
    // Issue #4: the answer that triggered D1 is the one delivered to the
    // caller — the distillation turn's text never overwrites it.
    expect(result.content).toBe('Traced it fully.');
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
