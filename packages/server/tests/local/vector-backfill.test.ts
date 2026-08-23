import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FrameStore,
  HybridSearch,
  MindDB,
  SessionStore,
  type EmbeddingProviderInstance,
  type EmbeddingProviderStatus,
} from '@waggle/core';
import { runVectorBackfill } from '../../src/local/vector-backfill.js';
import { MockEmbedder } from '../../../hive-mind-core/tests/mind/helpers/mock-embedder.js';

const FLAG_KEY = 'vector_backfill_v1';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => { resolve = res; });
  return { promise, resolve };
}

class ControlledProvider implements EmbeddingProviderInstance {
  readonly dimensions = 1024;
  active: 'ollama' | 'openai' | 'mock';
  modelName = 'test-model';
  recoverOnReprobe = false;
  failBatchCall: number | null = null;
  poisonContent: string | null = null;
  batchCalls = 0;
  readonly reprobe = vi.fn(async (): Promise<EmbeddingProviderStatus> => {
    if (this.recoverOnReprobe) this.active = 'ollama';
    this.lastError = undefined;
    return this.getStatus();
  });

  private readonly delegate = new MockEmbedder();
  private lastError: string | undefined;

  constructor(active: 'ollama' | 'openai' | 'mock' = 'ollama') {
    this.active = active;
  }

  async embed(text: string): Promise<Float32Array> {
    return this.delegate.embed(text);
  }

  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    this.batchCalls += 1;
    if (
      this.failBatchCall === this.batchCalls
      || (this.poisonContent && texts.some(text => text.includes(this.poisonContent as string)))
    ) {
      // Mirrors EmbeddingProvider's production failure mode: it returns mock
      // vectors instead of throwing, and exposes degradation through status.
      this.lastError = 'forced provider fallback';
    }
    return this.delegate.embedBatch(texts);
  }

  getActiveProvider(): 'ollama' | 'openai' | 'mock' {
    return this.active;
  }

  getStatus(): EmbeddingProviderStatus {
    return {
      activeProvider: this.active,
      availableProviders: [this.active],
      dimensions: this.dimensions,
      modelName: this.active === 'mock' ? 'deterministic-mock' : this.modelName,
      lastError: this.lastError,
      probeTimestamp: new Date(0).toISOString(),
    };
  }

  getQuotaStatus() {
    return {
      tier: 'FREE' as const,
      quota: -1,
      used: 0,
      remaining: -1,
      percentage: 0,
      resetsAt: new Date(0).toISOString(),
    };
  }
}

function vectorCount(db: MindDB): number {
  return (db.getDatabase().prepare('SELECT COUNT(*) AS n FROM memory_frames_vec').get() as { n: number }).n;
}

function chunkVectorCount(db: MindDB): number {
  return (db.getDatabase().prepare('SELECT COUNT(*) AS n FROM memory_frame_chunks_vec').get() as { n: number }).n;
}

function hasWholeVector(db: MindDB, frameId: number): boolean {
  return Boolean(db.getDatabase().prepare(
    'SELECT 1 FROM memory_frames_vec WHERE rowid = ?',
  ).get(Math.trunc(frameId)));
}

describe('runVectorBackfill', () => {
  let db: MindDB;
  let frames: FrameStore;
  let gopId: string;

  beforeEach(() => {
    db = new MindDB(':memory:');
    frames = new FrameStore(db);
    gopId = new SessionStore(db).create().gop_id;
  });

  afterEach(() => db.close());

  it('ignores the legacy flag for new fast-hook frames and restores whole, chunk, and semantic retrieval', async () => {
    db.getDatabase().prepare('INSERT INTO meta (key, value) VALUES (?, ?)').run(FLAG_KEY, 'already-set');
    const frame = frames.createIFrame(
      gopId,
      'The cobalt albatross release marker belongs to the Windows hook canary.',
      'normal',
      'system',
    );
    const provider = new ControlledProvider();

    const result = await runVectorBackfill(db, provider);

    expect(result.skipped).toBeNull();
    expect(result.framesReembedded).toBe(1);
    expect(result.chunksCreated).toBe(1);
    expect(result.hasMore).toBe(false);
    expect(vectorCount(db)).toBe(1);
    expect(chunkVectorCount(db)).toBe(1);
    await expect(new HybridSearch(db, provider).vectorSearchChunks('cobalt albatross', 5))
      .resolves.toContain(frame.id);
  });

  it('treats a flagged empty mind as empty instead of permanently done', async () => {
    db.getDatabase().prepare('INSERT INTO meta (key, value) VALUES (?, ?)').run(FLAG_KEY, 'already-set');

    const result = await runVectorBackfill(db, new ControlledProvider());

    expect(result.skipped).toBe('empty_mind');
    expect(result.hasMore).toBe(false);
    expect(result.framesProcessed).toBe(0);
  });

  it('repairs absent and partial chunk vectors without replacing a valid whole vector', async () => {
    const first = frames.createIFrame(
      gopId,
      'quarterly planning details and approval evidence. '.repeat(100),
      'normal',
      'system',
    );
    frames.createIFrame(gopId, 'sailing trip notes and logistics', 'normal', 'system');
    const provider = new ControlledProvider();
    await runVectorBackfill(db, provider);
    const raw = db.getDatabase();
    const totalChunksBefore = chunkVectorCount(db);
    const firstChunkCount = (raw.prepare(
      'SELECT COUNT(*) AS n FROM memory_frame_chunks WHERE frame_id = ?',
    ).get(first.id) as { n: number }).n;
    expect(firstChunkCount).toBeGreaterThan(1);
    const firstChunk = raw.prepare('SELECT id FROM memory_frame_chunks WHERE frame_id = ?').get(first.id) as { id: number };
    raw.prepare('DELETE FROM memory_frame_chunks_vec WHERE rowid = ?').run(Math.trunc(firstChunk.id));
    const wholeBefore = vectorCount(db);

    const result = await runVectorBackfill(db, provider);

    expect(result.framesReembedded).toBe(0);
    expect(result.chunksCreated).toBe(1);
    expect(result.hasMore).toBe(false);
    expect(vectorCount(db)).toBe(wholeBefore);
    expect(chunkVectorCount(db)).toBe(totalChunksBefore);
  });

  it('does not persist silent mock chunk fallbacks and retries them on the next pass', async () => {
    frames.createIFrame(gopId, 'quarterly planning details', 'normal', 'system');
    frames.createIFrame(gopId, 'sailing trip notes and logistics', 'normal', 'system');
    const provider = new ControlledProvider();
    provider.failBatchCall = 2; // whole-frame batch succeeds; first chunk call degrades

    const failed = await runVectorBackfill(db, provider);

    expect(failed.framesReembedded).toBe(2);
    expect(failed.errors).toEqual([expect.stringContaining('forced provider fallback')]);
    expect(failed.hasMore).toBe(true);
    expect(vectorCount(db)).toBe(2);
    expect(chunkVectorCount(db)).toBe(1); // valid peer progresses past the failed frame

    provider.failBatchCall = null;
    const retried = await runVectorBackfill(db, provider);
    expect(retried.errors).toEqual([]);
    expect(retried.framesReembedded).toBe(0);
    expect(retried.chunksCreated).toBe(1);
    expect(retried.hasMore).toBe(false);
  });

  it('reprobes mock providers and resumes once a real provider is available', async () => {
    frames.createIFrame(gopId, 'provider recovery frame', 'normal', 'system');
    const provider = new ControlledProvider('mock');

    const skipped = await runVectorBackfill(db, provider);
    expect(skipped.skipped).toBe('no_real_embedder');
    expect(provider.reprobe).toHaveBeenCalledTimes(1);
    expect(vectorCount(db)).toBe(0);

    provider.recoverOnReprobe = true;
    const recovered = await runVectorBackfill(db, provider);
    expect(recovered.skipped).toBeNull();
    expect(vectorCount(db)).toBe(1);
    expect(chunkVectorCount(db)).toBe(1);
  });

  it('uses the legacy flag only to record a mock-fingerprint rebuild', async () => {
    frames.createIFrame(gopId, 'first legacy frame', 'normal', 'system');
    frames.createIFrame(gopId, 'second legacy frame', 'normal', 'system');
    const raw = db.getDatabase();
    raw.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('embedding_provider', 'mock')").run();
    raw.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('embedding_model', 'deterministic-mock')").run();
    raw.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('embedding_dim', '1024')").run();

    const repaired = await runVectorBackfill(db, new ControlledProvider());

    expect(repaired.vectorsRepaired).toBe(true);
    expect(repaired.framesReembedded).toBe(2);
    expect(raw.prepare('SELECT value FROM meta WHERE key = ?').get(FLAG_KEY)).toBeTruthy();

    frames.createIFrame(gopId, 'new frame after the legacy flag', 'normal', 'system');
    const incremental = await runVectorBackfill(db, new ControlledProvider());
    expect(incremental.vectorsRepaired).toBe(false);
    expect(incremental.framesReembedded).toBe(1);
    expect(vectorCount(db)).toBe(3);
  });

  it('bounds each pass and advertises remaining work', async () => {
    for (let i = 0; i < 5; i += 1) {
      frames.createIFrame(gopId, `bounded frame ${i}`, 'normal', 'system');
    }
    const provider = new ControlledProvider();

    const first = await runVectorBackfill(db, provider, { maxFrames: 2, batchSize: 2 });
    expect(first.framesProcessed).toBe(2);
    expect(first.hasMore).toBe(true);
    expect(vectorCount(db)).toBe(2);

    await runVectorBackfill(db, provider, { maxFrames: 2, batchSize: 2 });
    const last = await runVectorBackfill(db, provider, { maxFrames: 2, batchSize: 2 });
    expect(last.framesProcessed).toBe(1);
    expect(last.hasMore).toBe(false);
    expect(vectorCount(db)).toBe(5);
  });

  it('rejects a real provider/model switch that occurs during an embed await', async () => {
    frames.createIFrame(gopId, 'provider switch race frame', 'normal', 'system');
    const provider = new ControlledProvider();
    const entered = deferred<void>();
    const resume = deferred<void>();
    const originalEmbedBatch = provider.embedBatch.bind(provider);
    let pause = true;
    provider.embedBatch = vi.fn(async (texts: string[]) => {
      if (pause) {
        pause = false;
        entered.resolve();
        await resume.promise;
      }
      return originalEmbedBatch(texts);
    });

    const running = runVectorBackfill(db, provider);
    await entered.promise;
    provider.active = 'openai';
    provider.modelName = 'switched-model';
    resume.resolve();
    const result = await running;

    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.every(error => error.includes('changed during enrichment'))).toBe(true);
    expect(vectorCount(db)).toBe(0);
    expect(chunkVectorCount(db)).toBe(0);
  });

  it('rebuilds complete legacy vector tables whose fingerprint is absent', async () => {
    const frame = frames.createIFrame(gopId, 'unknown legacy vector provenance', 'normal', 'system');
    const raw = db.getDatabase();
    const unknown = new Uint8Array(1024 * Float32Array.BYTES_PER_ELEMENT);
    raw.prepare('INSERT INTO memory_frames_vec (rowid, embedding) VALUES (CAST(? AS INTEGER), ?)')
      .run(Math.trunc(frame.id), unknown);
    const chunk = raw.prepare(
      'INSERT INTO memory_frame_chunks (frame_id, chunk_idx, content, char_start, char_end) VALUES (?, 0, ?, 0, ?)',
    ).run(frame.id, frame.content, frame.content.length);
    const chunkId = Math.trunc(Number(chunk.lastInsertRowid));
    raw.prepare('INSERT INTO memory_frame_chunks_vec (rowid, embedding) VALUES (CAST(? AS INTEGER), ?)')
      .run(chunkId, unknown);
    expect(db.getEmbeddingFingerprint()).toBeNull();

    const result = await runVectorBackfill(db, new ControlledProvider());

    expect(result.vectorsRepaired).toBe(true);
    expect(result.framesReembedded).toBe(1);
    expect(db.getEmbeddingFingerprint()).toMatchObject({ provider: 'ollama', model: 'test-model' });
    expect(raw.prepare('SELECT value FROM meta WHERE key = ?').get(FLAG_KEY)).toBeUndefined();
  });

  it('advances past persistent poison frames so newer valid hook frames are not starved', async () => {
    frames.createIFrame(gopId, 'persistent poison one', 'normal', 'system');
    frames.createIFrame(gopId, 'persistent poison two', 'normal', 'system');
    frames.createIFrame(gopId, 'persistent poison three', 'normal', 'system');
    const valid = frames.createIFrame(gopId, 'newer valid hook frame', 'normal', 'system');
    const provider = new ControlledProvider();
    provider.poisonContent = 'persistent poison';

    const first = await runVectorBackfill(db, provider, { maxFrames: 2, batchSize: 2 });
    expect(first.hasMore).toBe(true);
    expect(hasWholeVector(db, valid.id)).toBe(false);

    const second = await runVectorBackfill(db, provider, { maxFrames: 2, batchSize: 2 });
    expect(second.errors.length).toBeGreaterThan(0);
    expect(hasWholeVector(db, valid.id)).toBe(true);
  });

  it('considers whitespace-only frames complete without manufacturing empty chunks', async () => {
    const blank = frames.createIFrame(gopId, '', 'normal', 'system');
    const valid = frames.createIFrame(gopId, 'valid frame after blank content', 'normal', 'system');
    const provider = new ControlledProvider();

    const first = await runVectorBackfill(db, provider, { maxFrames: 1 });
    expect(hasWholeVector(db, blank.id)).toBe(true);
    expect(first.hasMore).toBe(true);

    const second = await runVectorBackfill(db, provider, { maxFrames: 1 });
    expect(hasWholeVector(db, valid.id)).toBe(true);
    expect(second.hasMore).toBe(false);
    expect(chunkVectorCount(db)).toBe(1);
  });
});
