/**
 * createEmbeddingProvider tests — ported from
 * hive-mind/packages/core/src/mind/embedding-provider.test.ts.
 *
 * Memory Sync Repair Step 2. Source: hive-mind file at HEAD c363257.
 *
 * Verbatim port — only the import path is adjusted from
 * `./embedding-provider.js` to `../../src/mind/embedding-provider.js`.
 *
 * NOTE: waggle-os has additional `tests/embedding-provider-quota.test.ts`
 * at the top level that exercises tier+quota enforcement (Waggle-only
 * feature). That file is NOT a substitute for this port — they cover
 * complementary surfaces: this file pins the generic mock fallback,
 * dimension respect, deterministic-vector behavior, batch shape, and
 * reprobe contract; the top-level file pins tier gating.
 */
import { describe, it, expect } from 'vitest';
import { createEmbeddingProvider } from '../../src/mind/embedding-provider.js';

describe('createEmbeddingProvider (hive-mind port)', () => {
  it('falls back to mock when provider=mock is requested explicitly', async () => {
    const provider = await createEmbeddingProvider({ provider: 'mock' });
    expect(provider.getActiveProvider()).toBe('mock');
    const status = provider.getStatus();
    expect(status.activeProvider).toBe('mock');
    expect(status.availableProviders).toContain('mock');
    expect(status.dimensions).toBe(1024);
    expect(status.modelName).toBe('deterministic-mock');
  });

  it('respects targetDimensions when configured', async () => {
    const provider = await createEmbeddingProvider({
      provider: 'mock',
      targetDimensions: 512,
    });
    expect(provider.dimensions).toBe(512);
    const vec = await provider.embed('hello');
    expect(vec).toBeInstanceOf(Float32Array);
    expect(vec.length).toBe(512);
  });

  it('produces deterministic mock vectors for identical inputs', async () => {
    const provider = await createEmbeddingProvider({ provider: 'mock' });
    const a = await provider.embed('deterministic input');
    const b = await provider.embed('deterministic input');
    expect(a.length).toBe(1024);
    expect(b.length).toBe(1024);
    for (let i = 0; i < a.length; i++) {
      expect(a[i]).toBe(b[i]);
    }
  });

  it('returns empty array for embedBatch([])', async () => {
    const provider = await createEmbeddingProvider({ provider: 'mock' });
    const result = await provider.embedBatch([]);
    expect(result).toEqual([]);
  });

  it('batch-embeds multiple inputs to the expected shape', async () => {
    const provider = await createEmbeddingProvider({
      provider: 'mock',
      targetDimensions: 256,
    });
    const out = await provider.embedBatch(['a', 'b', 'c']);
    expect(out).toHaveLength(3);
    for (const vec of out) {
      expect(vec).toBeInstanceOf(Float32Array);
      expect(vec.length).toBe(256);
    }
  });

  it('falls back to mock when an explicit non-mock provider fails to probe', async () => {
    // litellm with an obviously-unroutable URL — probe should fail quickly and
    // the factory should land on mock.
    const provider = await createEmbeddingProvider({
      provider: 'litellm',
      litellm: { url: 'http://127.0.0.1:1' },
    });
    expect(provider.getActiveProvider()).toBe('mock');
    const status = provider.getStatus();
    expect(status.availableProviders).toEqual(['mock']);
  });

  it('reprobe() refreshes status and keeps mock available when nothing else is', async () => {
    const provider = await createEmbeddingProvider({ provider: 'mock' });
    const first = provider.getStatus().probeTimestamp;
    await new Promise((r) => setTimeout(r, 5));
    const second = await provider.reprobe();
    expect(second.availableProviders).toContain('mock');
    expect(Date.parse(second.probeTimestamp)).toBeGreaterThanOrEqual(Date.parse(first));
  });
});
