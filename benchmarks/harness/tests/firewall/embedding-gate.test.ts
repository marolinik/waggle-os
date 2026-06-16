/**
 * Embedding-similarity gate tests — cosine + max-similarity + threshold gate.
 * Uses a deterministic in-test stub embedder; NO network, NO @waggle/core.
 */
import { describe, expect, it } from 'vitest';
import {
  cosineSimilarity,
  maxEmbeddingSimilarity,
  assertEmbeddingGate,
  type FirewallEmbedder,
} from '../../src/firewall/embedding-gate.js';
import type { Artifact } from '../../src/firewall/artifact.js';
import type { Gold } from '../../src/firewall/substring-gate.js';

/**
 * Deterministic stub: maps a fixed lexicon of phrases to fixed unit vectors in
 * R^3 so similarities are known exactly. Unknown text → a near-orthogonal vector
 * derived from its length, so it is dissimilar to every lexicon vector.
 */
function makeStubEmbedder(): FirewallEmbedder {
  const lex: Record<string, [number, number, number]> = {
    'refund total 342': [1, 0, 0],
    'the refund is three hundred forty two dollars': [0.98, 0.199, 0], // ~0.98 cos with [1,0,0]
    'window seats preferred': [0, 1, 0],
    'i would like to return something': [0, 0, 1],
  };
  const toVec = (t: string): Float32Array => {
    const key = t.toLowerCase().replace(/[^a-z0-9 ]+/g, '').replace(/\s+/g, ' ').trim();
    const v = lex[key];
    if (v) return Float32Array.from(v);
    // deterministic orthogonal-ish fallback (tiny components on a 4th phantom axis
    // are dropped to 3D → near-zero cos with the lexicon unit vectors)
    const n = key.length || 1;
    return Float32Array.from([0.001 * (n % 3), 0.001 * (n % 5), 0.001 * (n % 7)]);
  };
  return {
    async embedBatch(texts: string[]): Promise<Float32Array[]> {
      return texts.map(toVec);
    },
  };
}

describe('cosineSimilarity', () => {
  it('is 1 for identical vectors', () => {
    expect(cosineSimilarity(Float32Array.from([1, 0, 0]), Float32Array.from([1, 0, 0]))).toBeCloseTo(1, 10);
  });
  it('is 0 for orthogonal vectors', () => {
    expect(cosineSimilarity(Float32Array.from([1, 0, 0]), Float32Array.from([0, 1, 0]))).toBeCloseTo(0, 10);
  });
  it('is symmetric', () => {
    const a = Float32Array.from([0.3, 0.4, 0.5]);
    const b = Float32Array.from([0.1, 0.9, 0.2]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(cosineSimilarity(b, a), 12);
  });
  it('throws on length mismatch', () => {
    expect(() => cosineSimilarity(Float32Array.from([1, 0]), Float32Array.from([1, 0, 0]))).toThrow(/same length/);
  });
  it('returns 0 when either vector is all-zero (no direction)', () => {
    expect(cosineSimilarity(Float32Array.from([0, 0, 0]), Float32Array.from([1, 0, 0]))).toBe(0);
  });
});

describe('maxEmbeddingSimilarity', () => {
  it('returns the max cosine between the artifact and any gold + which gold', async () => {
    const embedder = makeStubEmbedder();
    const artifact: Artifact = { kind: 'write_back', id: 'wb', text: 'the refund is three hundred forty two dollars' };
    const golds: Gold[] = [
      { task_id: 'B-07', text: 'refund total 342' },
      { task_id: 'B-99', text: 'window seats preferred' },
    ];
    const r = await maxEmbeddingSimilarity(artifact, golds, embedder);
    expect(r.max_similarity).toBeCloseTo(0.98, 2);
    expect(r.nearest_gold_task_id).toBe('B-07');
  });
});

describe('assertEmbeddingGate', () => {
  const embedder = makeStubEmbedder();
  const golds: Gold[] = [{ task_id: 'B-07', text: 'refund total 342' }];

  it('passes when every artifact is below the threshold', async () => {
    const arts: Artifact[] = [{ kind: 'user_turn', id: 'u1', text: 'i would like to return something' }];
    const r = await assertEmbeddingGate(arts, golds, embedder, 0.9);
    expect(r.passed).toBe(true);
    expect(r.hits).toEqual([]);
    expect(r.threshold).toBe(0.9);
  });

  it('flags a paraphrase artifact whose cosine exceeds the threshold (03 C4/C5)', async () => {
    const arts: Artifact[] = [
      { kind: 'write_back', id: 'wb', text: 'the refund is three hundred forty two dollars' },
    ];
    const r = await assertEmbeddingGate(arts, golds, embedder, 0.9);
    expect(r.passed).toBe(false);
    expect(r.hits).toHaveLength(1);
    expect(r.hits[0]).toMatchObject({
      artifact_kind: 'write_back',
      artifact_id: 'wb',
      nearest_gold_task_id: 'B-07',
    });
    expect(r.hits[0].similarity).toBeGreaterThan(0.9);
  });

  it('reports the max similarity per artifact even when it passes (for the audit row)', async () => {
    const arts: Artifact[] = [{ kind: 'frame', id: 'f1', text: 'i would like to return something' }];
    const r = await assertEmbeddingGate(arts, golds, embedder, 0.9);
    expect(r.per_artifact_max).toHaveLength(1);
    expect(r.per_artifact_max[0].artifact_id).toBe('f1');
    expect(typeof r.per_artifact_max[0].max_similarity).toBe('number');
  });

  it('rejects a threshold outside [0,1]', async () => {
    const arts: Artifact[] = [{ kind: 'frame', id: 'f', text: 'x' }];
    await expect(assertEmbeddingGate(arts, golds, embedder, 1.5)).rejects.toThrow(/threshold ∈ \[0, 1\]/);
  });

  it('rejects an embedder that returns the wrong batch length', async () => {
    const broken: FirewallEmbedder = { async embedBatch() { return []; } };
    const arts: Artifact[] = [{ kind: 'frame', id: 'f', text: 'x' }];
    await expect(assertEmbeddingGate(arts, golds, broken, 0.9)).rejects.toThrow(/embedBatch returned/);
  });
});
