/**
 * Waggle↔τ² bridge — memory-ON recall injection (P1 of the conforming arm).
 *
 * The agentic τ² cell can't use arm-runner's QA-shaped recall (τ² owns the
 * multi-turn loop + DB scorer), so memory-ON is recalled INSIDE the bridge,
 * where the agent's systemPrompt is assembled. This test proves that path
 * hermetically: a REAL frozen mind on disk + REAL HybridSearch recall, with
 * only the embedder (no ollama) and the LLM (no network) faked.
 *
 *   - memory-OFF (no mindPath): systemPrompt is the domain policy alone (the
 *     proven B⁻ path),
 *   - memory-ON (mindPath): the recalled "# Recalled Memories" block is appended
 *     to the domain policy in the cfg handed to runAgentLoop,
 *   - freeze-per-task: recall runs once per session (query = first user message)
 *     and the SAME block is reused across the task's turns.
 */
import { afterAll, describe, expect, it } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import { unlinkSync } from 'node:fs';
import type { AgentLoopConfig, AgentResponse } from '@waggle/agent';
import type { Embedder } from '@waggle/core';
import { startWaggleBridge, type BridgeRunAgentLoopFn } from '../bridge/waggle-bridge-server.js';
import { buildAndFreezeMind } from '../../harness/src/continual/mind-build.js';

const VEC_DIMS = 1024;
/** Deterministic fake embedder (FNV-1a → xorshift unit vector); no ollama.
 *  Recall still works via HybridSearch's FTS5 keyword leg (RRF). */
function fakeEmbedder(dims = VEC_DIMS): Embedder {
  const fnv1a = (s: string): number => { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h || 1; };
  const one = (t: string): Float32Array => {
    let st = fnv1a(t); const v = new Float32Array(dims);
    for (let i = 0; i < dims; i++) { st ^= st << 13; st >>>= 0; st ^= st >>> 17; st ^= st << 5; st >>>= 0; v[i] = ((st >>> 0) / 0x100000000) * 2 - 1; }
    let m = 0; for (let i = 0; i < dims; i++) m += v[i] * v[i]; m = Math.sqrt(m); if (m > 0) for (let i = 0; i < dims; i++) v[i] /= m;
    return v;
  };
  return { dimensions: dims, async embed(t) { return one(t); }, async embedBatch(ts) { return ts.map(one); } };
}

/** A runAgentLoop fake that records each cfg it is handed (for systemPrompt
 *  assertions) and returns a trivial response. */
function capturingRunFn(): { fn: BridgeRunAgentLoopFn; calls: AgentLoopConfig[] } {
  const calls: AgentLoopConfig[] = [];
  const fn: BridgeRunAgentLoopFn = async (cfg) => {
    calls.push(cfg);
    const r: AgentResponse = { content: 'ok', toolsUsed: [], usage: { inputTokens: 1, outputTokens: 1 } };
    return r;
  };
  return { fn, calls };
}

const MIND_PATH = path.join(os.tmpdir(), 'waggle-bridge-memon.test.mind');

async function buildTinyRetailMind(): Promise<void> {
  await buildAndFreezeMind({
    artifacts: [
      { task_id: 'a1', mechanism: 'M2', procedure_family: 'returns', recurring_user: null,
        content: 'Return policy: opened electronics carry a 10% restocking fee.' },
      { task_id: 'a2', mechanism: 'M1', procedure_family: 'returns', recurring_user: null,
        content: 'To exchange a delivered item: find the user, look up the order, then exchange the item.' },
    ],
    goldStrings: [],
    outputPath: MIND_PATH,
    embedder: fakeEmbedder(),
    builderId: 'memon-test-builder',
  });
}

async function postTurn(url: string, body: Record<string, unknown>): Promise<{ status: number }> {
  const res = await fetch(`${url}/turn`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  await res.text();
  return { status: res.status };
}

describe('Waggle↔τ² bridge — memory recall injection', () => {
  afterAll(() => { for (const s of ['', '-wal', '-shm']) { try { unlinkSync(MIND_PATH + s); } catch { /* absent */ } } });

  it('memory-OFF (no mindPath): systemPrompt is the domain policy alone', async () => {
    const { fn, calls } = capturingRunFn();
    const bridge = await startWaggleBridge({ port: 0, litellmUrl: 'http://unused', litellmApiKey: 'k', runAgentLoopFn: fn });
    try {
      const r = await postTurn(bridge.url, {
        session_id: 's-off', model: 'm', domain_policy: 'You are a retail agent.',
        message: { role: 'user', content: 'What is the restocking fee?' }, tools: [],
      });
      expect(r.status).toBe(200);
      expect(calls).toHaveLength(1);
      expect(calls[0].systemPrompt).toBe('You are a retail agent.');
      expect(calls[0].systemPrompt).not.toContain('# Recalled Memories');
    } finally { await bridge.close(); }
  });

  it('memory-ON (mindPath): recalls the frozen fact into the agent systemPrompt', async () => {
    await buildTinyRetailMind();
    const { fn, calls } = capturingRunFn();
    const bridge = await startWaggleBridge({
      port: 0, litellmUrl: 'http://unused', litellmApiKey: 'k', runAgentLoopFn: fn,
      mindPath: MIND_PATH, embedder: fakeEmbedder(), recallLimit: 5,
    });
    try {
      await postTurn(bridge.url, {
        session_id: 's-on', model: 'm', domain_policy: 'You are a retail agent.',
        message: { role: 'user', content: 'What is the restocking fee on opened electronics?' }, tools: [],
      });
      expect(calls).toHaveLength(1);
      const sp = calls[0].systemPrompt;
      expect(sp).toContain('You are a retail agent.');
      expect(sp).toContain('# Recalled Memories');
      expect(sp).toContain('restocking fee');
    } finally { await bridge.close(); }
  });

  it('freeze-per-task: recall runs once per session and is reused across turns', async () => {
    await buildTinyRetailMind();
    const { fn, calls } = capturingRunFn();
    const bridge = await startWaggleBridge({
      port: 0, litellmUrl: 'http://unused', litellmApiKey: 'k', runAgentLoopFn: fn,
      mindPath: MIND_PATH, embedder: fakeEmbedder(), recallLimit: 5,
    });
    try {
      // Turn 1 — kickoff query shares keywords with the frozen fee fact → recall.
      await postTurn(bridge.url, {
        session_id: 's-frozen', model: 'm', domain_policy: 'POLICY',
        message: { role: 'user', content: 'restocking fee on opened electronics?' }, tools: [],
      });
      // Turn 2 — unrelated follow-up; the cached block (with the fee) must persist
      // (proves recall is frozen at task start, not re-run per turn).
      await postTurn(bridge.url, {
        session_id: 's-frozen', model: 'm', domain_policy: 'POLICY',
        message: { role: 'user', content: 'thanks — what colors does it come in?' }, tools: [],
      });
      expect(calls).toHaveLength(2);
      expect(calls[0].systemPrompt).toContain('restocking fee');
      expect(calls[1].systemPrompt).toContain('restocking fee');
      expect(calls[1].systemPrompt).toBe(calls[0].systemPrompt);
    } finally { await bridge.close(); }
  });
});
