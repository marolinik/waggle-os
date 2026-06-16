import { describe, expect, it, afterEach } from 'vitest';
import {
  startWaggleBridge,
  type WaggleBridgeHandle,
  type BridgeRunAgentLoopFn,
} from '../../../tau2/bridge/waggle-bridge-server.js';
import type { AgentResponse } from '@waggle/agent';

let handle: WaggleBridgeHandle | undefined;
afterEach(async () => { if (handle) { await handle.close(); handle = undefined; } });

/** Deterministic fake runAgentLoop: echoes the last user message, records the
 *  model + tool count so the test can assert the bridge forwarded them. */
const fakeRunAgentLoop: BridgeRunAgentLoopFn = async (cfg) => {
  const lastUser = [...cfg.messages].reverse().find(m => m.role === 'user');
  const resp: AgentResponse = {
    content: `ECHO[${cfg.model}]: ${lastUser?.content ?? ''} (tools=${cfg.tools.length})`,
    toolsUsed: [],
    usage: { inputTokens: 11, outputTokens: 7 },
  };
  return resp;
};

async function post(url: string, body: unknown): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('waggle-bridge-server', () => {
  it('GET /health returns ok', async () => {
    handle = await startWaggleBridge({ port: 0, runAgentLoopFn: fakeRunAgentLoop, litellmUrl: 'http://x', litellmApiKey: 'k' });
    const res = await fetch(`${handle.url}/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
  });

  it('POST /turn forwards the agent-llm as the model + returns content + usage', async () => {
    handle = await startWaggleBridge({ port: 0, runAgentLoopFn: fakeRunAgentLoop, litellmUrl: 'http://x', litellmApiKey: 'k' });
    const res = await post(`${handle.url}/turn`, {
      session_id: 's1',
      model: 'qwen3.6-35b-a3b',
      domain_policy: 'be helpful',
      message: { role: 'user', content: 'hi' },
      tools: [{ name: 'search', description: 'search', parameters: { type: 'object', properties: {} } }],
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { content: string; usage: { inputTokens: number; outputTokens: number } };
    expect(body.content).toContain('ECHO[qwen3.6-35b-a3b]');
    expect(body.content).toContain('tools=1');
    expect(body.usage).toEqual({ inputTokens: 11, outputTokens: 7 });
  });

  it('accumulates the conversation across turns within a session', async () => {
    handle = await startWaggleBridge({ port: 0, runAgentLoopFn: fakeRunAgentLoop, litellmUrl: 'http://x', litellmApiKey: 'k' });
    await post(`${handle.url}/turn`, { session_id: 's2', model: 'm', domain_policy: 'p', message: { role: 'user', content: 'first' }, tools: [] });
    const res = await post(`${handle.url}/turn`, { session_id: 's2', model: 'm', domain_policy: 'p', message: { role: 'user', content: 'second' }, tools: [] });
    const body = await res.json() as { content: string; turn_count: number };
    // turn_count = number of user messages seen in this session.
    expect(body.turn_count).toBe(2);
  });

  it('POST /turn rejects a missing model', async () => {
    handle = await startWaggleBridge({ port: 0, runAgentLoopFn: fakeRunAgentLoop, litellmUrl: 'http://x', litellmApiKey: 'k' });
    const res = await post(`${handle.url}/turn`, { session_id: 's3', message: { role: 'user', content: 'x' }, tools: [] });
    expect(res.status).toBe(400);
  });
});
