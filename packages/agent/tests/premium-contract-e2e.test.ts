/**
 * Standing end-to-end premium-contract fixture.
 *
 * The per-mechanism locks (verification-gate-loop, skill-distillation-
 * loop) each test D3 / D1 in ISOLATION (the latter even disables D3 to
 * isolate). Nothing tests them BOTH default-on, composed in one real
 * session — which is the realistic premium scenario and the exact
 * interaction introduced when both gates were added at the same
 * agent-loop completion boundary. A future loop change that reorders,
 * double-fires, or lets one gate swallow the other would pass every
 * unit lock and still break premium. This fixture fails if the composed
 * contract regresses. Deterministic (mock fetch) → CI-safe, no spend.
 */
import { describe, it, expect, vi } from 'vitest';
import { runAgentLoop, type AgentLoopConfig } from '../src/agent-loop.js';
import { VERIFICATION_GATE_DIRECTIVE } from '../src/verification-gate.js';
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
// Distinct args — identical calls would (correctly) trip the LoopGuard.
const fiveCalls = [1, 2, 3, 4, 5].map(n => ({ id: `c${n}`, function: { name: 'probe', arguments: JSON.stringify({ step: n }) } }));

function cfg(fetch: ReturnType<typeof mockFetch>): AgentLoopConfig {
  // BOTH gates default-on — the whole point of this fixture.
  return {
    litellmUrl: 'http://x', litellmApiKey: 'k', model: 'm', systemPrompt: 's',
    tools: [probe], messages: [{ role: 'user', content: 'do the multi-step task' }],
    fetch: fetch as unknown as typeof globalThis.fetch,
  };
}

describe('premium contract — D3 + D1 compose at the completion boundary (standing fixture)', () => {
  it('a ≥5-tool run that first claims unverified success: D3 corrects, THEN D1 distils, both one-shot, in order', async () => {
    const unverified = 'All tests pass and the build succeeds.';
    const honest = 'UNVERIFIED — I did not run the suite. Across the run I traced the full pipeline.';
    const fetch = mockFetch([
      { content: null, tool_calls: fiveCalls },   // ≥5 tools
      { content: unverified },                    // D3 must fire (no verify tool ran)
      { content: honest },                        // D3 one-shot done → D1 must fire (≥5 tools, not a refusal)
      { content: 'Distilled the reusable skill.' }, // both gates spent → loop returns
    ]);

    const result = await runAgentLoop(cfg(fetch));

    expect(fetch).toHaveBeenCalledTimes(4);
    const body3 = JSON.parse((fetch.mock.calls[2][1] as RequestInit).body as string).messages as Array<{ role: string; content: string }>;
    const body4 = JSON.parse((fetch.mock.calls[3][1] as RequestInit).body as string).messages as Array<{ role: string; content: string }>;

    // D3 fired before turn 3 (verification corrective injected)…
    expect(body3.some(m => m.role === 'user' && m.content === VERIFICATION_GATE_DIRECTIVE)).toBe(true);
    // …and D1 fired before turn 4 (the real distillation directive injected),
    // i.e. ordering preserved and D3 did NOT swallow D1.
    const expectedDistill = planSkillDistillation(['probe', 'probe', 'probe', 'probe', 'probe'], honest)!;
    expect(expectedDistill).not.toBeNull();
    expect(body4.some(m => m.role === 'user' && m.content === expectedDistill.directive)).toBe(true);
    // D3 directive must NOT reappear in turn 4 (one-shot, not re-fired).
    expect(body4.filter(m => m.content === VERIFICATION_GATE_DIRECTIVE).length).toBe(1);

    // Issue #4 — the D3-corrected honest answer is what the caller gets;
    // D1's distillation runs as a side-effect that does NOT overwrite the
    // delivered answer with the skill summary.
    expect(result.content).toBe(honest);
    expect(result.toolsUsed.length).toBe(5);
  });

  it('the common case is untouched — neither default-on gate perturbs a normal short run', async () => {
    const fetch = mockFetch([
      { content: null, tool_calls: [{ id: 'c1', function: { name: 'probe', arguments: '{}' } }] },
      { content: 'I updated the config as requested.' }, // neutral, <5 tools
    ]);
    const result = await runAgentLoop(cfg(fetch));
    expect(fetch).toHaveBeenCalledTimes(2); // returned immediately — no spurious gate turn
    expect(result.content).toBe('I updated the config as requested.');
  });
});
