/**
 * Arm runner — memory-ON (frozen mind) vs memory-OFF (empty mind).
 *
 * Hermetic: the "answer model" is an injected function; the mind is a :memory:
 * substrate with a fake embedder. Asserts:
 *   - ON recalls the frozen mind into the prompt; OFF gets an empty block,
 *   - efficiency (turns/tool-calls/tokens) is captured per trial,
 *   - pass^k = fraction of k trials that pass; freeze-per-task (the mind is
 *     identical across the k trials),
 *   - accuracy uses the injected scorer,
 *   - the mind is never written during evaluation (read-only in Phase B).
 */
import { describe, expect, it } from 'vitest';
import { FrameStore, HybridSearch, MindDB, SessionStore, type Embedder } from '@waggle/core';
import { runArmTask, type AnswerFn, type ArmTaskInput } from '../../src/continual/arm-runner.js';

const VEC_DIMS = 1024;
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

async function seededMind(): Promise<MindDB> {
  const db = new MindDB(':memory:');
  const frames = new FrameStore(db);
  const sessions = new SessionStore(db);
  const search = new HybridSearch(db, fakeEmbedder());
  sessions.ensure('returns', 'builder', 'fam');
  const f = frames.createIFrame('returns', 'Fact: restocking fee is 10% on opened electronics.', 'important', 'agent_inferred');
  await search.indexFramesBatch([{ id: f.id, content: f.content }]);
  return db;
}

/** An answer model that "knows" the fee only if the recalled block mentions it. */
const feeAwareAnswer: AnswerFn = async ({ recalledBlock }) => {
  const knows = /restocking fee is 10%/.test(recalledBlock);
  return {
    text: knows ? '10% restocking fee applies.' : 'I am not sure of the fee.',
    inputTokens: 100 + recalledBlock.length,
    outputTokens: 12,
    turns: knows ? 1 : 2,
    toolCalls: knows ? 0 : 1,
  };
};

const baseInput = (mind: MindDB | null): ArmTaskInput => ({
  task: { task_id: 't-1', goal: 'What is the restocking fee on opened electronics?', gold: '10%' },
  mind,
  embedder: fakeEmbedder(),
  answer: feeAwareAnswer,
  scorer: (text, gold) => (text.includes(gold) ? 1 : 0),
  k: 3,
  recallLimit: 5,
});

describe('runArmTask — memory ON vs OFF', () => {
  it('memory-ON recalls the frozen fact and passes', async () => {
    const mind = await seededMind();
    try {
      const r = await runArmTask({ ...baseInput(mind), memoryOn: true });
      expect(r.recalledCount).toBeGreaterThan(0);
      expect(r.passK).toBe(1); // all k trials pass
      expect(r.passAtLeastOne).toBe(true);
    } finally { mind.close(); }
  });

  it('memory-OFF gets an empty block and fails the fee question', async () => {
    const r = await runArmTask({ ...baseInput(null), memoryOn: false });
    expect(r.recalledCount).toBe(0);
    expect(r.passK).toBe(0);
  });

  it('captures efficiency (mean turns / tool-calls / tokens) per trial', async () => {
    const mind = await seededMind();
    try {
      const r = await runArmTask({ ...baseInput(mind), memoryOn: true });
      expect(r.meanTurns).toBe(1);
      expect(r.meanToolCalls).toBe(0);
      expect(r.meanInputTokens).toBeGreaterThan(0);
      expect(r.trials).toHaveLength(3);
    } finally { mind.close(); }
  });

  it('freeze-per-task: the mind is byte-stable across the k trials', async () => {
    const mind = await seededMind();
    try {
      const before = mind.getDatabase().prepare('SELECT COUNT(*) AS c FROM memory_frames').get() as { c: number };
      await runArmTask({ ...baseInput(mind), memoryOn: true, k: 5 });
      const after = mind.getDatabase().prepare('SELECT COUNT(*) AS c FROM memory_frames').get() as { c: number };
      expect(after.c).toBe(before.c); // no write-back during evaluation
    } finally { mind.close(); }
  });

  it('memoryOn=true requires a mind', async () => {
    await expect(runArmTask({ ...baseInput(null), memoryOn: true })).rejects.toThrow(/memory-ON requires a mind/);
  });

  it('rejects k < 1', async () => {
    await expect(runArmTask({ ...baseInput(null), memoryOn: false, k: 0 })).rejects.toThrow(/k ≥ 1/);
  });
});
