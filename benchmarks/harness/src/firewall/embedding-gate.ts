/**
 * Embedding-similarity gate (03 C1(b)/C4/C5).
 *
 * Catches SEMANTIC leakage the substring gate misses: a user-sim turn or skill
 * body that paraphrases a Phase-B gold (no shared surface tokens) but is
 * embedding-near it. For every artifact, computes the max cosine against any
 * Phase-B gold; any artifact above the PRE-REGISTERED threshold is a hit.
 *
 * Network-free by construction: depends only on `FirewallEmbedder`, the
 * structural subset of @waggle/core's `Embedder` the gate needs (`embedBatch`).
 * Plan 08 injects the real LOCAL embedder (Ollama/nomic-embed-text — same one
 * substrate.ts uses, $0, zero-egress); tests inject a deterministic stub. This
 * mirrors substrate.ts's injected-embedder pattern and keeps this module's unit
 * tests hermetic.
 *
 * The threshold is a pre-registration parameter, NOT hardcoded — the caller
 * supplies it from the frozen manifest (02 §5; "below a pre-registered
 * threshold, per row").
 */

import { collectArtifactTexts, type Artifact } from './artifact.js';
import type { Gold } from './substring-gate.js';

/** Structural subset of @waggle/core's Embedder the firewall needs. Defined
 *  locally so the firewall source imports nothing network-bound. */
export interface FirewallEmbedder {
  embedBatch(texts: string[]): Promise<Float32Array[]>;
}

export interface MaxSimilarityResult {
  max_similarity: number;
  nearest_gold_task_id: string;
}

export interface EmbeddingHit {
  artifact_kind: string;
  artifact_id: string;
  nearest_gold_task_id: string;
  similarity: number;
}

export interface PerArtifactMax {
  artifact_kind: string;
  artifact_id: string;
  max_similarity: number;
  nearest_gold_task_id: string;
}

export interface EmbeddingGateResult {
  /** True iff every artifact's max gold-similarity is ≤ threshold. */
  passed: boolean;
  hits: EmbeddingHit[];
  /** Max similarity per artifact (recorded for the audit row, pass or fail). */
  per_artifact_max: PerArtifactMax[];
  threshold: number;
  n_artifacts: number;
  n_golds: number;
}

export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) {
    throw new Error(`cosineSimilarity requires vectors of the same length; got ${a.length} and ${b.length}`);
  }
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0; // a zero vector has no direction
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export async function maxEmbeddingSimilarity(
  artifact: Artifact,
  golds: readonly Gold[],
  embedder: FirewallEmbedder,
): Promise<MaxSimilarityResult> {
  if (!Array.isArray(golds) || golds.length === 0) {
    throw new Error('maxEmbeddingSimilarity requires a non-empty golds array');
  }
  // collectArtifactTexts validates the single-artifact shape too.
  const [art] = collectArtifactTexts([artifact]);
  const goldTexts = golds.map(g => {
    if (typeof g?.text !== 'string') throw new Error(`gold text must be a string (task ${g?.task_id})`);
    return g.text;
  });
  const vectors = await embedder.embedBatch([art.text, ...goldTexts]);
  if (!Array.isArray(vectors) || vectors.length !== goldTexts.length + 1) {
    throw new Error(`embedBatch returned ${Array.isArray(vectors) ? vectors.length : 'non-array'}; expected ${goldTexts.length + 1}`);
  }
  const artVec = vectors[0];
  let max = -Infinity;
  let nearest = golds[0].task_id;
  for (let i = 0; i < golds.length; i++) {
    const sim = cosineSimilarity(artVec, vectors[i + 1]);
    if (sim > max) {
      max = sim;
      nearest = golds[i].task_id;
    }
  }
  return { max_similarity: max, nearest_gold_task_id: nearest };
}

export async function assertEmbeddingGate(
  artifacts: readonly Artifact[],
  golds: readonly Gold[],
  embedder: FirewallEmbedder,
  threshold: number,
): Promise<EmbeddingGateResult> {
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
    throw new Error(`assertEmbeddingGate requires threshold ∈ [0, 1]; got ${threshold}`);
  }
  if (!Array.isArray(golds) || golds.length === 0) {
    throw new Error('assertEmbeddingGate requires a non-empty golds array');
  }
  const flat = collectArtifactTexts(artifacts);
  const goldTexts = golds.map(g => {
    if (typeof g?.text !== 'string') throw new Error(`gold text must be a string (task ${g?.task_id})`);
    return g.text;
  });

  // One batch call: [all artifact texts..., all gold texts...].
  const inputs = [...flat.map(a => a.text), ...goldTexts];
  const vectors = await embedder.embedBatch(inputs);
  if (!Array.isArray(vectors) || vectors.length !== inputs.length) {
    throw new Error(`embedBatch returned ${Array.isArray(vectors) ? vectors.length : 'non-array'}; expected ${inputs.length}`);
  }
  const artVecs = vectors.slice(0, flat.length);
  const goldVecs = vectors.slice(flat.length);

  const hits: EmbeddingHit[] = [];
  const per_artifact_max: PerArtifactMax[] = [];
  for (let i = 0; i < flat.length; i++) {
    let max = -Infinity;
    let nearest = golds[0].task_id;
    for (let j = 0; j < golds.length; j++) {
      const sim = cosineSimilarity(artVecs[i], goldVecs[j]);
      if (sim > max) {
        max = sim;
        nearest = golds[j].task_id;
      }
    }
    per_artifact_max.push({
      artifact_kind: flat[i].kind,
      artifact_id: flat[i].id,
      max_similarity: max,
      nearest_gold_task_id: nearest,
    });
    if (max > threshold) {
      hits.push({
        artifact_kind: flat[i].kind,
        artifact_id: flat[i].id,
        nearest_gold_task_id: nearest,
        similarity: max,
      });
    }
  }

  return {
    passed: hits.length === 0,
    hits,
    per_artifact_max,
    threshold,
    n_artifacts: flat.length,
    n_golds: golds.length,
  };
}
