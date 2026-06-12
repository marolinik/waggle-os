import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MindDB, FrameStore, SessionStore } from '@waggle/core';
import { runVectorBackfill } from '../../src/local/vector-backfill.js';
import { MockEmbedder } from '../../../hive-mind-core/tests/mind/helpers/mock-embedder.js';
import type { EmbeddingProviderInstance } from '@waggle/core';

/**
 * D1 follow-up — one-time vector repair + chunk backfill per mind.
 * Mock-fingerprint repair (re-embed noise vectors) + rechunkAllFrames,
 * idempotent via meta flag, skip-and-retry while the embedder is mock.
 */

/** Wrap MockEmbedder as a provider instance reporting a REAL active provider. */
function realProvider(): EmbeddingProviderInstance {
  const m = new MockEmbedder();
  return Object.assign(m, {
    getActiveProvider: () => 'ollama',
    getStatus: () => ({ activeProvider: 'ollama', modelName: 'test-model' }),
  }) as unknown as EmbeddingProviderInstance;
}

function mockProvider(): EmbeddingProviderInstance {
  const m = new MockEmbedder();
  return Object.assign(m, {
    getActiveProvider: () => 'mock',
    getStatus: () => ({ activeProvider: 'mock', modelName: 'deterministic-mock' }),
  }) as unknown as EmbeddingProviderInstance;
}

describe('runVectorBackfill', () => {
  let db: MindDB;
  let gopId: string;

  beforeEach(() => {
    db = new MindDB(':memory:');
    const frames = new FrameStore(db);
    gopId = new SessionStore(db).create().gop_id;
    frames.createIFrame(gopId, 'a frame about quarterly planning details', 'normal', 'system');
    frames.createIFrame(gopId, 'another frame with sailing trip notes and logistics', 'normal', 'system');
  });

  afterEach(() => db.close());

  it('skips (without setting the flag) while the embedder is mock — retries later', async () => {
    const r1 = await runVectorBackfill(db, mockProvider());
    expect(r1.skipped).toBe('no_real_embedder');
    // a later run with a real provider DOES the work
    const r2 = await runVectorBackfill(db, realProvider());
    expect(r2.skipped).toBeNull();
    expect(r2.chunksCreated).toBeGreaterThan(0);
  });

  it('backfills chunks once and is a flagged no-op afterwards', async () => {
    const r1 = await runVectorBackfill(db, realProvider());
    expect(r1.skipped).toBeNull();
    expect(r1.chunksCreated).toBe(2);
    expect(r1.vectorsRepaired).toBe(false); // no mock fingerprint on a fresh mind

    const r2 = await runVectorBackfill(db, realProvider());
    expect(r2.skipped).toBe('already_done');
    expect(r2.chunksCreated).toBe(0);
  });

  it('repairs mock-fingerprinted vectors: recreates vec tables and re-embeds all frames', async () => {
    const raw = db.getDatabase();
    // simulate the D1 probe finding: vectors written under the mock fingerprint
    raw.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('embedding_provider', 'mock')").run();
    raw.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('embedding_dim', '1024')").run();

    const r = await runVectorBackfill(db, realProvider());
    expect(r.skipped).toBeNull();
    expect(r.vectorsRepaired).toBe(true);
    expect(r.framesReembedded).toBe(2);
    expect(r.chunksCreated).toBe(2);
    const vec = raw.prepare('SELECT COUNT(*) AS n FROM memory_frames_vec').get() as { n: number };
    expect(vec.n).toBe(2);
  });

  it('marks an empty mind done without doing work', async () => {
    const empty = new MindDB(':memory:');
    try {
      const r = await runVectorBackfill(empty, realProvider());
      expect(r.skipped).toBe('empty_mind');
      const again = await runVectorBackfill(empty, realProvider());
      expect(again.skipped).toBe('already_done');
    } finally {
      empty.close();
    }
  });
});
