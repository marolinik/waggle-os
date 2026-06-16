/**
 * Mind build / freeze / hash — neutral builder over a Phase-A stream.
 *
 * Substrate-coupled: uses a :memory: MindDB + injected fake embedder (the
 * substrate.test.ts pattern). Asserts:
 *   - Phase-A artifacts (M1..M4) land as frames the production HybridSearch
 *     can recall,
 *   - NO Phase-A or Phase-B gold string is banked (firewall backbone),
 *   - freeze() writes a file + returns a stable hash,
 *   - re-building the same stream + seed yields the same hash (neutral builder
 *     is deterministic → Mode-1 byte-identical claim holds),
 *   - the frozen file re-opens read-only and recalls the banked content.
 */
import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MindDB, HybridSearch, type Embedder } from '@waggle/core';
import { buildAndFreezeMind, type PhaseAArtifact } from '../../src/continual/mind-build.js';

const VEC_DIMS = 1024;

function createFakeEmbedder(dims = VEC_DIMS): Embedder {
  const fnv1a = (s: string): number => {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h || 1;
  };
  const embedOne = (text: string): Float32Array => {
    let state = fnv1a(text);
    const v = new Float32Array(dims);
    for (let i = 0; i < dims; i++) {
      state ^= state << 13; state >>>= 0; state ^= state >>> 17; state ^= state << 5; state >>>= 0;
      v[i] = ((state >>> 0) / 0x100000000) * 2 - 1;
    }
    let mag = 0; for (let i = 0; i < dims; i++) mag += v[i] * v[i]; mag = Math.sqrt(mag);
    if (mag > 0) for (let i = 0; i < dims; i++) v[i] /= mag;
    return v;
  };
  return { dimensions: dims, async embed(t) { return embedOne(t); }, async embedBatch(ts) { return ts.map(embedOne); } };
}

function artifacts(): PhaseAArtifact[] {
  return [
    { task_id: 't-1', mechanism: 'M1', procedure_family: 'returns', recurring_user: null,
      content: 'Skill: process_return(order) — look up order, check 30-day window, issue refund.' },
    { task_id: 't-2', mechanism: 'M2', procedure_family: 'returns', recurring_user: null,
      content: 'Fact: the restocking fee is 10% on opened electronics.' },
    { task_id: 't-3', mechanism: 'M3', procedure_family: 'exchanges', recurring_user: null,
      content: 'Correction: do not refund shipping on buyer-remorse returns; only on defects.' },
    { task_id: 't-4', mechanism: 'M4', procedure_family: 'rebooking', recurring_user: 'user-7',
      content: 'User user-7 prefers aisle seats and morning departures.' },
  ];
}

const tmpFiles: string[] = [];
function tmpPath(): string {
  const p = path.join(os.tmpdir(), `mind-build-${Date.now()}-${Math.random().toString(36).slice(2)}.sqlite`);
  tmpFiles.push(p);
  return p;
}
afterEach(() => {
  for (const f of tmpFiles.splice(0)) {
    for (const suffix of ['', '-wal', '-shm']) { try { fs.unlinkSync(f + suffix); } catch { /* ignore */ } }
  }
});

describe('buildAndFreezeMind', () => {
  it('banks every Phase-A artifact so HybridSearch can recall it', async () => {
    const out = tmpPath();
    const res = await buildAndFreezeMind({
      artifacts: artifacts(), goldStrings: ['Return processed; $42 refunded.'],
      outputPath: out, embedder: createFakeEmbedder(), builderId: 'neutral-deterministic-v1', seed: 42,
    });
    expect(res.frameCount).toBe(4);
    expect(res.mindHash).toMatch(/^[0-9a-f]{64}$/);
    expect(fs.existsSync(out)).toBe(true);

    // Re-open the frozen file and recall.
    const frozen = new MindDB(out);
    try {
      const search = new HybridSearch(frozen, createFakeEmbedder());
      const hits = await search.search('restocking fee', { limit: 5 });
      expect(hits.some(h => h.frame.content.includes('restocking fee'))).toBe(true);
    } finally { frozen.close(); }
  });

  it('NEVER banks a gold string (firewall backbone — 02 §5.2)', async () => {
    const out = tmpPath();
    const arts = artifacts();
    // Inject a poisoned artifact that contains the gold — the builder MUST reject it.
    arts.push({ task_id: 't-x', mechanism: 'M2', procedure_family: 'returns', recurring_user: null,
      content: 'Fact leak: the answer is Return processed; $42 refunded.' });
    await expect(
      buildAndFreezeMind({
        artifacts: arts, goldStrings: ['Return processed; $42 refunded.'],
        outputPath: out, embedder: createFakeEmbedder(), builderId: 'neutral-deterministic-v1', seed: 42,
      }),
    ).rejects.toThrow(/gold/i);
  });

  it('is deterministic: same stream + seed ⇒ same mindHash (Mode-1 byte-identical)', async () => {
    const a = await buildAndFreezeMind({
      artifacts: artifacts(), goldStrings: [], outputPath: tmpPath(),
      embedder: createFakeEmbedder(), builderId: 'neutral-deterministic-v1', seed: 42,
    });
    const b = await buildAndFreezeMind({
      artifacts: artifacts(), goldStrings: [], outputPath: tmpPath(),
      embedder: createFakeEmbedder(), builderId: 'neutral-deterministic-v1', seed: 42,
    });
    expect(a.mindHash).toBe(b.mindHash);
  });

  it('records builder provenance + artifact mechanism counts', async () => {
    const res = await buildAndFreezeMind({
      artifacts: artifacts(), goldStrings: [], outputPath: tmpPath(),
      embedder: createFakeEmbedder(), builderId: 'neutral-deterministic-v1', seed: 42,
    });
    expect(res.builderId).toBe('neutral-deterministic-v1');
    expect(res.mechanismCounts).toEqual({ M1: 1, M2: 1, M3: 1, M4: 1 });
  });

  it('rejects an empty artifact stream', async () => {
    await expect(
      buildAndFreezeMind({
        artifacts: [], goldStrings: [], outputPath: tmpPath(),
        embedder: createFakeEmbedder(), builderId: 'neutral-deterministic-v1', seed: 42,
      }),
    ).rejects.toThrow(/non-empty/);
  });
});
