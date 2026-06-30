/**
 * Waggle↔τ² bridge — TOOL-FORWARDING rework (Approach A+, direct-call).
 *
 * Hermetic: NO network, NO ollama, NO τ². The LLM is a fake `llmFetch` that
 *   (a) records the OpenAI-wire `messages` array it was handed (so we can assert
 *       the conversation state the bridge threads), and
 *   (b) returns a scripted chat-completion {content, tool_calls, usage}.
 * Recall is injected via `recallFn` (no MindDB/HybridSearch needed here; the
 * real-mind recall path is covered by waggle-bridge-server.test.ts).
 *
 * Proves the rework forwards model tool_calls to τ² (resp.tool_calls with OBJECT
 * arguments) and threads τ²'s tool_results back into the next wire as
 * role:'tool'+tool_call_id, while preserving the EMPTY_FALLBACK / prefer-tool_calls
 * / id-mint / memory-on-off / stats / /seed contracts.
 *
 * NOTE: lives under tests/ (not bridge/) so it matches the repo vitest include
 * glob `benchmarks/*​/tests/**​/*.test.ts` and is discoverable from the worktree
 * root — a test vitest cannot find is worthless. (Spec named the bridge/ path.)
 */
import { describe, expect, it, vi } from 'vitest';
import { startWaggleBridge } from '../bridge/waggle-bridge-server.js';

const GREETING = 'Hi! How can I help you today?';

interface ScriptedResp {
  content: string | null;
  tool_calls?: Array<{ id: string; type?: 'function'; function: { name: string; arguments: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

type WireMsg = {
  role: string;
  content: string | null;
  tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
};

/** A fake fetch for callChatCompletion: records the `messages` wire it received
 *  per call and returns the next scripted chat-completion response. */
function fakeLlm(script: ScriptedResp[]): { fetch: typeof fetch; wires: WireMsg[][]; bodies: any[] } {
  const wires: WireMsg[][] = [];
  const bodies: any[] = [];
  let i = 0;
  const fn = (async (_url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const body = JSON.parse(String(init?.body ?? '{}'));
    bodies.push(body);
    wires.push(body.messages as WireMsg[]);
    const s = script[i++] ?? { content: 'fallback' };
    const payload = {
      choices: [{ message: { content: s.content, tool_calls: s.tool_calls } }],
      usage: s.usage ?? { prompt_tokens: 0, completion_tokens: 0 },
    };
    return new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as unknown as typeof fetch;
  return { fetch: fn, wires, bodies };
}

async function post(url: string, path: string, body: Record<string, unknown>): Promise<{ status: number; json: any }> {
  const res = await fetch(`${url}${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : null };
}

/** TS port of the τ² message-sequence invariants (validate_message_history +
 *  AssistantMessage.validate + environment id matching), applied to a wire the
 *  bridge handed the LLM. */
function assertOpusValid(wire: WireMsg[]): void {
  expect(wire.length).toBeGreaterThan(0);
  expect(wire[0].role).toBe('system');
  // never ends on an assistant message (no assistant-prefill rejection)
  expect(wire[wire.length - 1].role).not.toBe('assistant');
  for (let j = 1; j < wire.length; j++) {
    const m = wire[j];
    if (m.role === 'assistant') {
      const hasContent = typeof m.content === 'string' && m.content.trim().length > 0;
      const hasTools = Array.isArray(m.tool_calls) && m.tool_calls.length > 0;
      // R6: never empty-content AND no tool_calls
      expect(hasContent || hasTools).toBe(true);
      if (hasTools) {
        // each tool_call is followed by exactly one matching role:'tool'
        const ids = m.tool_calls!.map(tc => tc.id);
        const followers = wire.slice(j + 1, j + 1 + ids.length);
        expect(followers).toHaveLength(ids.length);
        for (const f of followers) expect(f.role).toBe('tool');
        const followerIds = followers.map(f => f.tool_call_id);
        expect(new Set(followerIds)).toEqual(new Set(ids));
      }
    }
  }
}

const BASE = { litellmUrl: 'http://unused', litellmApiKey: 'k' } as const;

describe('Waggle↔τ² bridge — tool-call forwarding (A+ direct-call)', () => {
  it('1. FORWARD: model tool_calls become resp.tool_calls with OBJECT arguments', async () => {
    const llm = fakeLlm([{ content: null, tool_calls: [{ id: 'call_1', function: { name: 'get_order_details', arguments: '{"order_id":"#W1"}' } }] }]);
    const bridge = await startWaggleBridge({ ...BASE, port: 0, llmFetch: llm.fetch });
    try {
      const r = await post(bridge.url, '/turn', {
        session_id: 's1', model: 'm', domain_policy: 'P', tools: [],
        message: { role: 'user', content: 'where is my order' },
      });
      expect(r.status).toBe(200);
      expect(r.json.tool_calls).toEqual([{ id: 'call_1', name: 'get_order_details', arguments: { order_id: '#W1' } }]);
      expect(r.json.content).toBeNull();
      expect(r.json.tools_used).toEqual(['get_order_details']);
    } finally { await bridge.close(); }
  });

  it('2. THREAD-BACK: tool_results are threaded into the next wire as role:tool + tool_call_id', async () => {
    const llm = fakeLlm([
      { content: null, tool_calls: [{ id: 'call_1', function: { name: 'get_order_details', arguments: '{"order_id":"#W1"}' } }] },
      { content: 'Your order shipped.', tool_calls: undefined },
    ]);
    const bridge = await startWaggleBridge({ ...BASE, port: 0, llmFetch: llm.fetch });
    try {
      await post(bridge.url, '/seed', { session_id: 's2', message: { role: 'assistant', content: GREETING } });
      await post(bridge.url, '/turn', { session_id: 's2', model: 'm', domain_policy: 'P', tools: [], message: { role: 'user', content: 'where is my order' } });
      const r2 = await post(bridge.url, '/turn', { session_id: 's2', model: 'm', domain_policy: 'P', tools: [], tool_results: [{ id: 'call_1', content: '{"status":"shipped"}' }] });
      expect(r2.json.content).toBe('Your order shipped.');
      // The wire the LLM saw on turn-2 (index 1)
      const wire = llm.wires[1];
      expect(wire[0].role).toBe('system');
      expect(wire[1]).toMatchObject({ role: 'assistant', content: GREETING });
      expect(wire[2]).toMatchObject({ role: 'user', content: 'where is my order' });
      expect(wire[3].role).toBe('assistant');
      expect(wire[3].content).toBe(''); // tool-call assistant stores EMPTY STRING, not null
      expect(wire[3].tool_calls).toEqual([{ id: 'call_1', type: 'function', function: { name: 'get_order_details', arguments: '{"order_id":"#W1"}' } }]);
      expect(wire[4]).toMatchObject({ role: 'tool', content: '{"status":"shipped"}', tool_call_id: 'call_1' });
      expect(wire[wire.length - 1].role).not.toBe('assistant');
    } finally { await bridge.close(); }
  });

  it('3. OPUS-VALID ORACLE: every captured wire satisfies the τ² invariants', async () => {
    const llm = fakeLlm([
      { content: null, tool_calls: [{ id: 'call_1', function: { name: 'get_order', arguments: '{}' } }] },
      { content: 'All done — anything else?' },
    ]);
    const bridge = await startWaggleBridge({ ...BASE, port: 0, llmFetch: llm.fetch });
    try {
      await post(bridge.url, '/seed', { session_id: 's3', message: { role: 'assistant', content: GREETING } });
      await post(bridge.url, '/turn', { session_id: 's3', model: 'm', domain_policy: 'P', tools: [], message: { role: 'user', content: 'hi' } });
      await post(bridge.url, '/turn', { session_id: 's3', model: 'm', domain_policy: 'P', tools: [], tool_results: [{ id: 'call_1', content: 'ok' }] });
      expect(llm.wires.length).toBe(2);
      for (const wire of llm.wires) assertOpusValid(wire);
    } finally { await bridge.close(); }
  });

  it('4. PREFER-TOOL_CALLS: content alongside tool_calls is dropped (stored content empty)', async () => {
    const llm = fakeLlm([
      { content: 'let me check', tool_calls: [{ id: 'call_1', function: { name: 'lookup', arguments: '{}' } }] },
      { content: 'done' },
    ]);
    const bridge = await startWaggleBridge({ ...BASE, port: 0, llmFetch: llm.fetch });
    try {
      const r = await post(bridge.url, '/turn', { session_id: 's4', model: 'm', domain_policy: 'P', tools: [], message: { role: 'user', content: 'go' } });
      expect(r.json.content).toBeNull();
      expect(r.json.tool_calls).toHaveLength(1);
      // confirm stored assistant content === '' via the next turn's wire
      await post(bridge.url, '/turn', { session_id: 's4', model: 'm', domain_policy: 'P', tools: [], tool_results: [{ id: 'call_1', content: 'x' }] });
      const wire = llm.wires[1];
      const assistant = wire.find(m => m.role === 'assistant' && m.tool_calls);
      expect(assistant?.content).toBe('');
    } finally { await bridge.close(); }
  });

  it('5. EMPTY_FALLBACK: null content + no tool_calls yields a non-empty fallback (sim stays alive)', async () => {
    const llm = fakeLlm([{ content: null }]);
    const bridge = await startWaggleBridge({ ...BASE, port: 0, llmFetch: llm.fetch });
    try {
      const r = await post(bridge.url, '/turn', { session_id: 's5', model: 'm', domain_policy: 'P', tools: [], message: { role: 'user', content: 'go' } });
      expect(r.json.tool_calls).toBeNull();
      expect(typeof r.json.content).toBe('string');
      expect(r.json.content.trim().length).toBeGreaterThan(0);
    } finally { await bridge.close(); }
  });

  it('6. MULTI: two tool_calls thread back as two ordered role:tool messages with matching ids', async () => {
    const llm = fakeLlm([
      { content: null, tool_calls: [
        { id: 'call_1', function: { name: 'a', arguments: '{}' } },
        { id: 'call_2', function: { name: 'b', arguments: '{}' } },
      ] },
      { content: 'done' },
    ]);
    const bridge = await startWaggleBridge({ ...BASE, port: 0, llmFetch: llm.fetch });
    try {
      const r = await post(bridge.url, '/turn', { session_id: 's6', model: 'm', domain_policy: 'P', tools: [], message: { role: 'user', content: 'go' } });
      expect(r.json.tool_calls.map((t: any) => t.id)).toEqual(['call_1', 'call_2']);
      await post(bridge.url, '/turn', { session_id: 's6', model: 'm', domain_policy: 'P', tools: [], tool_results: [
        { id: 'call_1', content: 'r1' }, { id: 'call_2', content: 'r2' },
      ] });
      const wire = llm.wires[1];
      const tools = wire.filter(m => m.role === 'tool');
      expect(tools.map(t => t.tool_call_id)).toEqual(['call_1', 'call_2']);
      expect(tools.map(t => t.content)).toEqual(['r1', 'r2']);
      assertOpusValid(wire);
    } finally { await bridge.close(); }
  });

  it('7. ID MINT: a blank model tool_call id is minted AND stored identically', async () => {
    const llm = fakeLlm([
      { content: null, tool_calls: [{ id: '', function: { name: 'a', arguments: '{}' } }] },
      { content: 'done' },
    ]);
    const bridge = await startWaggleBridge({ ...BASE, port: 0, llmFetch: llm.fetch });
    try {
      const r = await post(bridge.url, '/turn', { session_id: 's7', model: 'm', domain_policy: 'P', tools: [], message: { role: 'user', content: 'go' } });
      const mintedId = r.json.tool_calls[0].id;
      expect(typeof mintedId).toBe('string');
      expect(mintedId.length).toBeGreaterThan(0);
      // thread it back using the minted id; the stored assistant must carry the SAME id
      await post(bridge.url, '/turn', { session_id: 's7', model: 'm', domain_policy: 'P', tools: [], tool_results: [{ id: mintedId, content: 'x' }] });
      const wire = llm.wires[1];
      const assistant = wire.find(m => m.role === 'assistant' && m.tool_calls);
      expect(assistant?.tool_calls?.[0].id).toBe(mintedId);
      assertOpusValid(wire);
    } finally { await bridge.close(); }
  });

  it('8. MEMORY-ON: recallFn injects a frozen block once; tool_results turns do NOT re-recall', async () => {
    const llm = fakeLlm([
      { content: null, tool_calls: [{ id: 'call_1', function: { name: 'a', arguments: '{}' } }] },
      { content: 'done' },
    ]);
    const recallFn = vi.fn(async (_q: string) => '# Recalled Memories\n- frozen fact');
    const bridge = await startWaggleBridge({ ...BASE, port: 0, llmFetch: llm.fetch, recallFn });
    try {
      await post(bridge.url, '/turn', { session_id: 's8', model: 'm', domain_policy: 'You are a retail agent.', tools: [], message: { role: 'user', content: 'help' } });
      await post(bridge.url, '/turn', { session_id: 's8', model: 'm', domain_policy: 'You are a retail agent.', tools: [], tool_results: [{ id: 'call_1', content: 'x' }] });
      const sys = llm.wires[0][0].content as string;
      expect(sys).toContain('customer service agent'); // AGENT_INSTRUCTION wrap
      expect(sys).toContain('You are a retail agent.'); // domain policy
      expect(sys).toContain('# Recalled Memories');
      expect(recallFn).toHaveBeenCalledTimes(1);
      expect(recallFn).toHaveBeenCalledWith('help');
      // turn-2 system still carries the frozen block (reused, not re-recalled)
      expect(llm.wires[1][0].content).toContain('# Recalled Memories');
    } finally { await bridge.close(); }
  });

  it('9. MEMORY-OFF: no recallFn/mindPath → system has instructions+policy, NO recalled block', async () => {
    const llm = fakeLlm([{ content: 'hello' }]);
    const bridge = await startWaggleBridge({ ...BASE, port: 0, llmFetch: llm.fetch });
    try {
      await post(bridge.url, '/turn', { session_id: 's9', model: 'm', domain_policy: 'You are a retail agent.', tools: [], message: { role: 'user', content: 'help' } });
      const sys = llm.wires[0][0].content as string;
      expect(sys).toContain('customer service agent');
      expect(sys).toContain('You are a retail agent.');
      expect(sys).not.toContain('# Recalled Memories');
    } finally { await bridge.close(); }
  });

  it('10. STATS: per-turn usage accumulates across turns', async () => {
    const llm = fakeLlm([
      { content: 'a', usage: { prompt_tokens: 100, completion_tokens: 20 } },
      { content: 'b', usage: { prompt_tokens: 100, completion_tokens: 20 } },
    ]);
    const bridge = await startWaggleBridge({ ...BASE, port: 0, llmFetch: llm.fetch });
    try {
      await post(bridge.url, '/turn', { session_id: 's10', model: 'm', domain_policy: 'P', tools: [], message: { role: 'user', content: 'a' } });
      await post(bridge.url, '/turn', { session_id: 's10', model: 'm', domain_policy: 'P', tools: [], message: { role: 'user', content: 'b' } });
    } finally { await bridge.close(); }
    const s = bridge.stats();
    expect(s).toEqual({ inputTokens: 200, outputTokens: 40, turns: 2 });
  });

  it('11. SEED: prior tool history (assistant tool_calls + tool) round-trips into the wire', async () => {
    const llm = fakeLlm([{ content: 'continuing' }]);
    const bridge = await startWaggleBridge({ ...BASE, port: 0, llmFetch: llm.fetch });
    try {
      await post(bridge.url, '/seed', { session_id: 's11', message: { role: 'assistant', content: GREETING } });
      await post(bridge.url, '/seed', { session_id: 's11', message: { role: 'user', content: 'earlier question' } });
      await post(bridge.url, '/seed', { session_id: 's11', message: { role: 'assistant', content: '', tool_calls: [{ id: 'seed_1', type: 'function', function: { name: 'a', arguments: '{}' } }] } });
      await post(bridge.url, '/seed', { session_id: 's11', message: { role: 'tool', content: 'seed-result', tool_call_id: 'seed_1' } });
      await post(bridge.url, '/turn', { session_id: 's11', model: 'm', domain_policy: 'P', tools: [], message: { role: 'user', content: 'follow up' } });
      const wire = llm.wires[0];
      expect(wire[1]).toMatchObject({ role: 'assistant', content: GREETING });
      expect(wire[2]).toMatchObject({ role: 'user', content: 'earlier question' });
      expect(wire[3].role).toBe('assistant');
      expect(wire[3].tool_calls?.[0].id).toBe('seed_1');
      expect(wire[4]).toMatchObject({ role: 'tool', tool_call_id: 'seed_1', content: 'seed-result' });
      expect(wire[5]).toMatchObject({ role: 'user', content: 'follow up' });
    } finally { await bridge.close(); }
  });

  it('12. MALFORMED-ARGS: invalid-JSON args parse to {} AND the stored wire stays valid JSON', async () => {
    // A model emits unparseable tool-call arguments. Lenient default: τ² gets {}.
    // CRITICAL: the wire-stored assistant tool_call args must be RE-SERIALIZED to
    // valid JSON — re-sending a verbatim '{bad' next turn makes litellm→Anthropic
    // 400 and crashes the whole session (infra-excluded → biased denominators).
    const llm = fakeLlm([
      { content: null, tool_calls: [{ id: 'call_1', function: { name: 'a', arguments: '{bad' } }] },
      { content: 'done' },
    ]);
    const bridge = await startWaggleBridge({ ...BASE, port: 0, llmFetch: llm.fetch });
    try {
      const r = await post(bridge.url, '/turn', { session_id: 's13', model: 'm', domain_policy: 'P', tools: [], message: { role: 'user', content: 'go' } });
      expect(r.json.tool_calls[0].arguments).toEqual({});
      await post(bridge.url, '/turn', { session_id: 's13', model: 'm', domain_policy: 'P', tools: [], tool_results: [{ id: 'call_1', content: 'x' }] });
      const wire = llm.wires[1];
      const assistant = wire.find(m => m.role === 'assistant' && m.tool_calls);
      const storedArgs = assistant?.tool_calls?.[0].function.arguments as string;
      expect(() => JSON.parse(storedArgs)).not.toThrow(); // valid JSON on the wire
      expect(JSON.parse(storedArgs)).toEqual({});
    } finally { await bridge.close(); }
  });

  it('13. DEGENERATE TURN: no user message and no tool_results → 400 (no assistant-prefill wire)', async () => {
    const llm = fakeLlm([{ content: 'should-not-be-called' }]);
    const bridge = await startWaggleBridge({ ...BASE, port: 0, llmFetch: llm.fetch });
    try {
      await post(bridge.url, '/seed', { session_id: 's14', message: { role: 'assistant', content: GREETING } });
      const r = await post(bridge.url, '/turn', { session_id: 's14', model: 'm', domain_policy: 'P', tools: [] });
      expect(r.status).toBe(400);
      expect(llm.wires.length).toBe(0); // never issued a completion
    } finally { await bridge.close(); }
  });

  it('normalizeTools: parameters carry type:object (Anthropic-via-litellm requirement)', async () => {
    const llm = fakeLlm([{ content: 'ok' }]);
    const bridge = await startWaggleBridge({ ...BASE, port: 0, llmFetch: llm.fetch });
    try {
      await post(bridge.url, '/turn', {
        session_id: 's12', model: 'm', domain_policy: 'P',
        tools: [{ name: 'get_order', description: 'd', parameters: { properties: { order_id: { type: 'string' } } } }],
        message: { role: 'user', content: 'go' },
      });
      const body = llm.bodies[0];
      expect(body.tools[0]).toMatchObject({ type: 'function', function: { name: 'get_order', description: 'd' } });
      expect(body.tools[0].function.parameters.type).toBe('object');
      expect(body.tool_choice).toBe('auto');
    } finally { await bridge.close(); }
  });
});
