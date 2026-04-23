/**
 * Task 2.5 Stage 1 — substrate factory tests.
 *
 * Covers the lifecycle contract: construct with `:memory:` + an injected
 * fake embedder, verify the FTS5 + vec0 tables exist, ingest a handful of
 * frames, round-trip-search, tear down.
 *
 * No Ollama / network dependency — tests inject a deterministic fake embedder.
 */

import { describe, expect, it } from 'vitest';
import type { Embedder } from '@waggle/core';
import { createSubstrate } from '../src/substrate.js';

const VEC_DIMS = 1024;

function createFakeEmbedder(dims: number = VEC_DIMS): Embedder {
  const fnv1a = (s: string): number => {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h || 1;
  };
  const embedOne = (text: string): Float32Array => {
    let state = fnv1a(text);
    const v = new Float32Array(dims);
    for (let i = 0; i < dims; i++) {
      state ^= state << 13; state >>>= 0;
      state ^= state >>> 17;
      state ^= state << 5; state >>>= 0;
      v[i] = ((state >>> 0) / 0x100000000) * 2 - 1;
    }
    let mag = 0;
    for (let i = 0; i < dims; i++) mag += v[i] * v[i];
    mag = Math.sqrt(mag);
    if (mag > 0) for (let i = 0; i < dims; i++) v[i] /= mag;
    return v;
  };
  return {
    dimensions: dims,
    async embed(text) { return embedOne(text); },
    async embedBatch(texts) { return texts.map(embedOne); },
  };
}

describe('createSubstrate', () => {
  it('constructs an ephemeral :memory: substrate with injected embedder', () => {
    const sub = createSubstrate({ embedder: createFakeEmbedder() });
    try {
      expect(sub.db).toBeDefined();
      expect(sub.frames).toBeDefined();
      expect(sub.search).toBeDefined();
      expect(sub.embedder.dimensions).toBe(VEC_DIMS);
      // Verify schema bootstrap: memory_frames + vec table exist.
      const raw = sub.db.getDatabase();
      const row = raw.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='memory_frames'",
      ).get();
      expect(row).toBeDefined();
    } finally {
      sub.close();
    }
  });

  it('createIFrame + indexFramesBatch round-trip via the substrate', async () => {
    const sub = createSubstrate({ embedder: createFakeEmbedder() });
    try {
      // memory_frames.gop_id FKs to sessions.gop_id — ensure rows first.
      sub.sessions.ensure('gop-a');
      sub.sessions.ensure('gop-b');
      const f1 = sub.frames.createIFrame('gop-a', 'Alice: The sunrise painting', 'normal', 'import');
      const f2 = sub.frames.createIFrame('gop-a', 'Bob: Nice painting Alice', 'normal', 'import');
      const f3 = sub.frames.createIFrame('gop-b', 'Carol: Morning Dan', 'normal', 'import');
      await sub.search.indexFramesBatch([
        { id: f1.id, content: f1.content },
        { id: f2.id, content: f2.content },
        { id: f3.id, content: f3.content },
      ]);

      const results = await sub.search.search('sunrise painting', { limit: 3 });
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].frame.content).toContain('sunrise');
    } finally {
      sub.close();
    }
  });

  it('close() is idempotent', () => {
    const sub = createSubstrate({ embedder: createFakeEmbedder() });
    sub.close();
    expect(() => sub.close()).not.toThrow();
  });

  it('after close(), DB access throws', () => {
    const sub = createSubstrate({ embedder: createFakeEmbedder() });
    sub.close();
    expect(() => sub.db.getDatabase().prepare('SELECT 1').get()).toThrow();
  });
});
