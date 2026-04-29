import type { Embedder } from '../../../src/mind/embeddings.js';

/**
 * Deterministic mock embedder for testing.
 * Generates embeddings based on word overlap so that semantically
 * similar texts produce similar vectors.
 */
export class MockEmbedder implements Embedder {
  dimensions = 1024;

  async embed(text: string): Promise<Float32Array> {
    return this.textToVector(text);
  }

  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    return texts.map(t => this.textToVector(t));
  }

  private textToVector(text: string): Float32Array {
    const vec = new Float32Array(this.dimensions);
    const words = text.toLowerCase().split(/\s+/);

    for (const word of words) {
      // Hash each word to a set of dimensions and add a value
      const hash = this.simpleHash(word);
      for (let i = 0; i < 8; i++) {
        const idx = (hash + i * 127) % this.dimensions;
        vec[idx] += 1.0;
      }
    }

    // Normalize to unit vector
    let norm = 0;
    for (let i = 0; i < this.dimensions; i++) norm += vec[i] * vec[i];
    norm = Math.sqrt(norm);
    if (norm > 0) {
      for (let i = 0; i < this.dimensions; i++) vec[i] /= norm;
    }

    return vec;
  }

  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
    }
    return Math.abs(hash);
  }
}
