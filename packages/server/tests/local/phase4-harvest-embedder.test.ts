/**
 * Phase 4 — Harvest cognify embedder policy (R3-001).
 *
 * The post-harvest "cognify" block vector-indexes freshly-harvested frames so
 * they are retrievable by semantic search — the free-forever memory moat.
 *
 * BUG (R3-001): that block hard-coded `createEmbeddingProvider({ provider: 'mock' })`,
 * so harvested frames were indexed with MEANINGLESS placeholder vectors. They
 * looked indexed (rows in `memory_frames_vec`) but were silently unretrievable
 * by real semantic search — a memory-moat regression with no UI signal.
 *
 * FIX (mirrors the adjacent wiki-compile block): use the server's real
 * `fastify.embeddingProvider`; when the active provider is 'mock'/unavailable,
 * SKIP vector indexing entirely rather than writing bogus vectors.
 *
 * These tests exercise the indexing DECISION via a full route inject, asserting
 * directly on the `memory_frames_vec` table:
 *   - mock provider  -> NO bogus vectors written for harvested frames
 *   - real provider  -> the real provider IS used (vectors written from it)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { MindDB, SessionStore, FrameStore } from '@waggle/core';
import type { EmbeddingProviderInstance } from '@waggle/core';
import { buildLocalServer } from '../../src/local/index.js';
import type { FastifyInstance } from 'fastify';
import { injectWithAuth } from '../test-utils.js';

const VEC_DIMS = 1024;

const CHATGPT_EXPORT = [
  {
    title: 'Editor preferences chat',
    create_time: 1700000000,
    mapping: {
      n1: {
        message: {
          author: { role: 'user' },
          content: { parts: ['My preferred editor is VSCode with vim bindings.'] },
          create_time: 1700000001,
        },
      },
      n2: {
        message: {
          author: { role: 'assistant' },
          content: { parts: ['Got it — VSCode with vim is a solid setup.'] },
          create_time: 1700000002,
        },
      },
    },
  },
];

/** Count rows currently in the personal-mind vector index. */
function countVecRows(dataDir: string): number {
  const mind = new MindDB(path.join(dataDir, 'personal.mind'));
  try {
    const db = mind.getDatabase();
    const row = db.prepare('SELECT COUNT(*) as cnt FROM memory_frames_vec').get() as { cnt: number };
    return row.cnt;
  } finally {
    mind.close();
  }
}

/**
 * Minimal EmbeddingProviderInstance stub. `embed`/`embedBatch` return a marker
 * vector whose first element is `marker` so we can prove WHICH embedder ran.
 * `getActiveProvider()` is controllable so we can drive each branch of the fix.
 */
function makeEmbedderStub(activeProvider: 'mock' | 'voyage', marker: number): {
  calls: { embed: number; embedBatch: number };
  instance: EmbeddingProviderInstance;
} {
  const calls = { embed: 0, embedBatch: 0 };
  const vec = () => {
    const f = new Float32Array(VEC_DIMS);
    f[0] = marker;
    return f;
  };
  const instance: EmbeddingProviderInstance = {
    dimensions: VEC_DIMS,
    async embed(_text: string) { calls.embed++; return vec(); },
    async embedBatch(texts: string[]) { calls.embedBatch++; return texts.map(() => vec()); },
    getActiveProvider() { return activeProvider; },
    getStatus() {
      return {
        activeProvider,
        availableProviders: [activeProvider],
        dimensions: VEC_DIMS,
        modelName: `stub-${activeProvider}`,
        probeTimestamp: new Date().toISOString(),
      };
    },
    async reprobe() { return instance.getStatus(); },
    getQuotaStatus() {
      return { tier: 'FREE', quota: -1, used: 0, remaining: -1, percentage: 0, resetsAt: new Date().toISOString() };
    },
  };
  return { calls, instance };
}

async function buildServer(dataDir: string): Promise<FastifyInstance> {
  // Seed a fresh personal mind so the schema (incl. memory_frames_vec) exists.
  const mind = new MindDB(path.join(dataDir, 'personal.mind'));
  const sessions = new SessionStore(mind);
  const frames = new FrameStore(mind);
  const s = sessions.create('embedder-test-seed');
  frames.createIFrame(s.gop_id, 'seed frame', 'normal');
  mind.close();
  return buildLocalServer({ dataDir });
}

async function commitHarvest(server: FastifyInstance) {
  return injectWithAuth(server, {
    method: 'POST',
    url: '/api/harvest/commit',
    payload: { source: 'chatgpt', data: CHATGPT_EXPORT },
  });
}

describe('R3-001 — harvest cognify embedder policy', () => {
  let server: FastifyInstance;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-harvest-embedder-test-'));
  });

  afterEach(async () => {
    if (server) await server.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('does NOT write bogus vectors when the active provider is mock', async () => {
    server = await buildServer(tmpDir);

    // Force the mock/unavailable branch deterministically (independent of
    // whether an inprocess model happens to be present in CI).
    const stub = makeEmbedderStub('mock', 0.111);
    server.embeddingProvider = stub.instance;

    const before = countVecRows(tmpDir);

    const res = await commitHarvest(server);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.saved).toBeGreaterThan(0); // frames WERE harvested

    // The fix must NOT index harvested frames with a mock/placeholder vector.
    const after = countVecRows(tmpDir);
    expect(after).toBe(before);

    // And the mock embedder must not have been invoked for indexing at all.
    expect(stub.calls.embed).toBe(0);
    expect(stub.calls.embedBatch).toBe(0);
  });

  it('uses the real provider for indexing when one is active', async () => {
    server = await buildServer(tmpDir);

    const stub = makeEmbedderStub('voyage', 0.999);
    server.embeddingProvider = stub.instance;

    const before = countVecRows(tmpDir);

    const res = await commitHarvest(server);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.saved).toBeGreaterThan(0);

    // With a real provider, harvested frames ARE vector-indexed...
    const after = countVecRows(tmpDir);
    expect(after).toBeGreaterThan(before);

    // ...and indexing went through the REAL (server) provider, not a hard-coded mock.
    expect(stub.calls.embed + stub.calls.embedBatch).toBeGreaterThan(0);
  });
});
