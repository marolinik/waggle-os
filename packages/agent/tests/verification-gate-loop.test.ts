/**
 * D3 — the verification-before-completion gate is STRUCTURAL: enforced
 * by the agent loop, not the model's goodwill toward behavioral prose.
 * These lock the wired contract end-to-end (deterministic mock fetch).
 */
import { describe, it, expect, vi } from 'vitest';
import { runAgentLoop, type AgentLoopConfig } from '../src/agent-loop.js';
import { VERIFICATION_GATE_DIRECTIVE } from '../src/verification-gate.js';

function mockFetch(contents: Array<string | null>) {
  let i = 0;
  return vi.fn(async (_url: string, _init?: RequestInit) => ({
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{ message: { role: 'assistant', content: contents[i++], tool_calls: undefined }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    }),
  } as unknown as Response));
}

function cfg(fetch: ReturnType<typeof mockFetch>, over: Partial<AgentLoopConfig> = {}): AgentLoopConfig {
  return {
    litellmUrl: 'http://x', litellmApiKey: 'k', model: 'm',
    systemPrompt: 'sys', tools: [], messages: [{ role: 'user', content: 'do it' }],
    fetch: fetch as unknown as typeof globalThis.fetch, ...over,
  };
}

describe('D3 — verification-before-completion gate (structural, locked)', () => {
  it('does NOT accept an unverified completion claim — forces one corrective turn', async () => {
    const fetch = mockFetch([
      'All tests pass and the build succeeds.',           // unverified claim, no tools
      'UNVERIFIED — I cannot run the suite here; not checked.', // model corrects
    ]);
    const result = await runAgentLoop(cfg(fetch));

    expect(fetch).toHaveBeenCalledTimes(2); // the claim was rejected, loop continued
    const secondBody = JSON.parse((fetch.mock.calls[1][1] as RequestInit).body as string);
    const injected = (secondBody.messages as Array<{ role: string; content: string }>)
      .find(m => m.role === 'system' && m.content === VERIFICATION_GATE_DIRECTIVE);
    expect(injected, 'corrective directive must be injected before completion').toBeDefined();
    expect((secondBody.messages as Array<{ role: string; content: string }>)
      .some(m => m.role === 'user' && m.content === VERIFICATION_GATE_DIRECTIVE)).toBe(false);
    expect(result.content).toBe('UNVERIFIED — I cannot run the suite here; not checked.');
  });

  it('is ONE-SHOT — a re-asserted unverified claim is then accepted (no infinite loop)', async () => {
    const fetch = mockFetch([
      'All tests pass.',                  // claim 1 → gated
      'Everything works, the suite is green.', // claim 2 → one-shot used, accepted
    ]);
    const result = await runAgentLoop(cfg(fetch));
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result.content).toBe('Everything works, the suite is green.');
  });

  it('does NOT fire on a neutral completion (no false positive, no behavior change)', async () => {
    const fetch = mockFetch(['I updated the config as you asked.']);
    const result = await runAgentLoop(cfg(fetch));
    expect(fetch).toHaveBeenCalledTimes(1); // returned immediately
    expect(result.content).toBe('I updated the config as you asked.');
  });

  it('does not rewrite facts preserved from the current user request', async () => {
    const response = 'API tests are passing. Browser tests still have two failures on Windows.';
    const fetch = mockFetch([response]);
    const result = await runAgentLoop(cfg(fetch, {
      messages: [{
        role: 'user',
        content: 'Rewrite this and preserve the facts: API tests pass. Browser tests still have two failures on Windows.',
      }],
    }));

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.content).toBe(response);
  });

  it('honors the opt-out (verificationGate:false)', async () => {
    const fetch = mockFetch(['All tests pass and the build succeeds.']);
    const result = await runAgentLoop(cfg(fetch, { verificationGate: false }));
    expect(fetch).toHaveBeenCalledTimes(1); // gate disabled — accepted as-is
    expect(result.content).toBe('All tests pass and the build succeeds.');
  });
});
