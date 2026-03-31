/**
 * In-process embedder using @huggingface/transformers (ONNX Runtime).
 * Default provider for ALL desktop users — zero config, works offline.
 * Model: Xenova/all-MiniLM-L6-v2 (384 native dims, normalized to target dims).
 * Downloads ~23MB model on first use, cached in ~/.waggle/models/.
 */

import path from 'node:path';
import os from 'node:os';
import type { Embedder } from './embeddings.js';

export interface InProcessEmbedderConfig {
  model?: string;
  cacheDir?: string;
  targetDimensions?: number;
}

/** Normalize embedding dimensions: zero-pad shorter, truncate longer. */
export function normalizeDimensions(embedding: Float32Array, targetDims: number): Float32Array {
  if (embedding.length === targetDims) return embedding;
  const result = new Float32Array(targetDims);
  const copyLen = Math.min(embedding.length, targetDims);
  result.set(embedding.subarray(0, copyLen));
  return result;
}

export async function createInProcessEmbedder(config?: Partial<InProcessEmbedderConfig>): Promise<Embedder> {
  const model = config?.model ?? 'Xenova/all-MiniLM-L6-v2';
  const cacheDir = config?.cacheDir ?? path.join(os.homedir(), '.waggle', 'models');
  const targetDims = config?.targetDimensions ?? 1024;

  console.log(`[waggle] Loading in-process embedding model: ${model} (~23MB first download)`);

  const { pipeline, env } = await import('@huggingface/transformers');
  env.cacheDir = cacheDir;
  env.allowRemoteModels = true;

  const extractor = await pipeline('feature-extraction', model, { dtype: 'fp32' });
  const nativeDims = 384; // all-MiniLM-L6-v2 output dimensions

  console.log(`[waggle] In-process embedder ready (${nativeDims} native dims → ${targetDims} normalized)`);

  return {
    dimensions: targetDims,

    async embed(text: string): Promise<Float32Array> {
      const result = await extractor(text, { pooling: 'mean', normalize: true });
      const raw = new Float32Array(result.data as Float32Array);
      return normalizeDimensions(raw, targetDims);
    },

    async embedBatch(texts: string[]): Promise<Float32Array[]> {
      if (texts.length === 0) return [];
      const results: Float32Array[] = [];
      // Process one at a time to avoid memory issues with large batches
      for (const text of texts) {
        const result = await extractor(text, { pooling: 'mean', normalize: true });
        const raw = new Float32Array(result.data as Float32Array);
        results.push(normalizeDimensions(raw, targetDims));
      }
      return results;
    },
  };
}
