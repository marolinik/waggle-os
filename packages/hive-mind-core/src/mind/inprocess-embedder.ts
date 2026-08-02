/**
 * In-process embedder using @huggingface/transformers (ONNX Runtime).
 * Default provider for ALL desktop users — zero config, works offline.
 * Model: Xenova/all-MiniLM-L6-v2 (384 native dims, normalized to target dims).
 * Downloads ~90MB fp32 model on first use, cached in ~/.waggle/models/.
 */

import path from 'node:path';
import os from 'node:os';
import type { Embedder } from './embeddings.js';
import { createCoreLogger } from '../logger.js';
import { withTransformersModelLoad } from './transformers-model-load.js';

const log = createCoreLogger('inprocess-embedder');

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

  log.info(`Loading in-process embedding model: ${model} (~90MB fp32 first download)`);

  const { pipeline } = await import('@huggingface/transformers');
  const extractor = await withTransformersModelLoad({
    cacheDir,
    model,
    load: (canonicalCacheDir) => pipeline('feature-extraction', model, {
      dtype: 'fp32',
      cache_dir: canonicalCacheDir,
    }),
    onQuarantine: () => log.warn(`Quarantined corrupt embedding model cache: ${model}`),
  });
  const nativeDims = 384; // all-MiniLM-L6-v2 output dimensions

  log.info(`In-process embedder ready (${nativeDims} native dims → ${targetDims} normalized)`);

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
