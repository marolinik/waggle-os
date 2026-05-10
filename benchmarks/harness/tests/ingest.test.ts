/**
 * Task 2.5 Stage 1 — ingest module tests.
 *
 * Covers extractTurnsFromLocomoRaw (raw JSON → flat turn stream) and
 * ingestLoCoMoCorpus (turn stream → ephemeral MindDB + HybridSearch indices).
 *
 * Uses :memory: MindDB + a deterministic zero-dep 1024-dim fake embedder.
 * Real runs use `createOllamaEmbedder` from @waggle/core, but that requires
 * a live Ollama server — not appropriate for unit tests.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  FrameStore,
  HybridSearch,
  MindDB,
  SessionStore,
  type Embedder,
} from '@waggle/core';
import {
  extractTurnsFromLocomoRaw,
  ingestLoCoMoCorpus,
  type LocomoRawSample,
} from '../src/ingest.js';

const VEC_DIMS = 1024; // matches VEC_TABLE_SQL `embedding float[1024]`

/** Deterministic hash-seeded 1024-dim embedder. Produces unit-norm vectors
 *  whose direction is entirely determined by the input string's bytes. Good
 *  enough for FTS5-agreement round-trip tests; not for semantic retrieval. */
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
      // xorshift32 — cheap, deterministic, well-distributed
      state ^= state << 13; state >>>= 0;
      state ^= state >>> 17;
      state ^= state << 5; state >>>= 0;
      v[i] = ((state >>> 0) / 0x100000000) * 2 - 1;
    }
    // L2-normalize so vec0 cosine distance behaves sensibly
    let mag = 0;
    for (let i = 0; i < dims; i++) mag += v[i] * v[i];
    mag = Math.sqrt(mag);
    if (mag > 0) for (let i = 0; i < dims; i++) v[i] /= mag;
    return v;
  };
  return {
    dimensions: dims,
    async embed(text: string): Promise<Float32Array> { return embedOne(text); },
    async embedBatch(texts: string[]): Promise<Float32Array[]> { return texts.map(embedOne); },
  };
}

/** Tiny LoCoMo-shaped fixture: 2 conversations, 3 turns each, 2 sessions in
 *  conv-01 (to verify multi-session ordering). */
const FIXTURE_SAMPLES: LocomoRawSample[] = [
  {
    sample_id: 'conv-01',
    qa: [],
    conversation: {
      speaker_a: 'Alice',
      speaker_b: 'Bob',
      session_1_date_time: '1 January 2023',
      session_1: [
        { speaker: 'Alice', dia_id: 'D1:1', text: 'Hello there' },
        { speaker: 'Bob', dia_id: 'D1:2', text: 'Hi Alice' },
      ],
      session_2_date_time: '2 January 2023',
      session_2: [
        { speaker: 'Alice', dia_id: 'D2:1', text: 'The sunrise painting is ready' },
      ],
    },
  },
  {
    sample_id: 'conv-02',
    qa: [],
    conversation: {
      speaker_a: 'Carol',
      speaker_b: 'Dan',
      session_1_date_time: '10 February 2023',
      session_1: [
        { speaker: 'Carol', dia_id: 'D1:1', text: 'Morning Dan' },
        { speaker: 'Dan', dia_id: 'D1:2', text: 'Morning' },
        { speaker: 'Carol', dia_id: 'D1:3', text: 'How is the weather today' },
      ],
    },
  },
];

let tmpFixturePath: string;

beforeEach(() => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'locomo-ingest-test-'));
  tmpFixturePath = path.join(dir, 'locomo10.json');
  fs.writeFileSync(tmpFixturePath, JSON.stringify(FIXTURE_SAMPLES), 'utf-8');
});

afterEach(() => {
  try {
    fs.rmSync(path.dirname(tmpFixturePath), { recursive: true, force: true });
  } catch {
    // best-effort cleanup — OS will reap on next tmp prune
  }
});

describe('extractTurnsFromLocomoRaw', () => {
  it('flattens every session_N turn across every conversation', () => {
    const turns = extractTurnsFromLocomoRaw(tmpFixturePath);
    expect(turns).toHaveLength(6); // 2 + 1 + 3 turns
  });

  it('preserves speaker + text + dia_id + conversation id per turn', () => {
    const turns = extractTurnsFromLocomoRaw(tmpFixturePath);
    const first = turns[0];
    expect(first.gopId).toBe('conv-01');
    expect(first.diaId).toBe('D1:1');
    expect(first.speaker).toBe('Alice');
    expect(first.text).toBe('Hello there');
    expect(first.content).toBe('Alice: Hello there');
  });

  it('orders sessions numerically within a conversation', () => {
    const turns = extractTurnsFromLocomoRaw(tmpFixturePath);
    const conv01 = turns.filter(t => t.gopId === 'conv-01');
    expect(conv01.map(t => t.diaId)).toEqual(['D1:1', 'D1:2', 'D2:1']);
  });

  it('maintains per-conversation grouping in output order', () => {
    const turns = extractTurnsFromLocomoRaw(tmpFixturePath);
    const ids = turns.map(t => t.gopId);
    // conv-01 turns come before conv-02 turns (source order preserved)
    const firstConv02 = ids.indexOf('conv-02');
    const lastConv01 = ids.lastIndexOf('conv-01');
    expect(lastConv01).toBeLessThan(firstConv02);
  });

  it('throws a clear error when the archive is missing', () => {
    const missing = path.join(os.tmpdir(), `locomo-missing-${Date.now()}.json`);
    expect(() => extractTurnsFromLocomoRaw(missing))
      .toThrow(/LoCoMo raw archive not found/);
  });

  it('throws on invalid JSON', () => {
    const bad = path.join(path.dirname(tmpFixturePath), 'bad.json');
    fs.writeFileSync(bad, 'not json at all', 'utf-8');
    expect(() => extractTurnsFromLocomoRaw(bad))
      .toThrow(/not valid JSON/);
  });

  it('skips turns that are missing dia_id or text', () => {
    const malformed = path.join(path.dirname(tmpFixturePath), 'malformed.json');
    fs.writeFileSync(malformed, JSON.stringify([
      {
        sample_id: 'conv-x', qa: [],
        conversation: {
          speaker_a: 'A', speaker_b: 'B',
          session_1: [
            { speaker: 'A', dia_id: 'D1:1', text: 'ok' },
            { speaker: 'A', text: 'no dia_id' } as unknown as { speaker: string; dia_id: string; text: string },
            { dia_id: 'D1:3', text: 'no speaker' } as unknown as { speaker: string; dia_id: string; text: string },
            { speaker: 'B', dia_id: 'D1:4' } as unknown as { speaker: string; dia_id: string; text: string },
          ],
        },
      },
    ]), 'utf-8');
    const turns = extractTurnsFromLocomoRaw(malformed);
    expect(turns).toHaveLength(1);
    expect(turns[0].diaId).toBe('D1:1');
  });
});

describe('ingestLoCoMoCorpus', () => {
  it('creates one frame per turn and indexes them for vector search', async () => {
    const db = new MindDB(':memory:');
    try {
      const frames = new FrameStore(db);
      const sessions = new SessionStore(db);
      const search = new HybridSearch(db, createFakeEmbedder());
      const turns = extractTurnsFromLocomoRaw(tmpFixturePath);
      const stats = await ingestLoCoMoCorpus(db, search, frames, sessions, turns);

      expect(stats.count).toBe(6);
      expect(stats.ingestMs).toBeGreaterThanOrEqual(0);
      expect(stats.indexMs).toBeGreaterThanOrEqual(0);

      // Confirm rows landed in memory_frames.
      const raw = db.getDatabase();
      const total = raw.prepare('SELECT COUNT(*) as c FROM memory_frames').get() as { c: number };
      expect(total.c).toBe(6);
    } finally {
      db.close();
    }
  });

  it('tags every frame with gop_id = conversation_id and source = import', async () => {
    const db = new MindDB(':memory:');
    try {
      const frames = new FrameStore(db);
      const sessions = new SessionStore(db);
      const search = new HybridSearch(db, createFakeEmbedder());
      const turns = extractTurnsFromLocomoRaw(tmpFixturePath);
      await ingestLoCoMoCorpus(db, search, frames, sessions, turns);

      const raw = db.getDatabase();
      const rows = raw.prepare('SELECT gop_id, source FROM memory_frames').all() as Array<{ gop_id: string; source: string }>;
      const gops = new Set(rows.map(r => r.gop_id));
      expect(gops).toEqual(new Set(['conv-01', 'conv-02']));
      expect(rows.every(r => r.source === 'import')).toBe(true);
    } finally {
      db.close();
    }
  });

  it('round-trip: FTS5 keyword search finds the ingested turn', async () => {
    const db = new MindDB(':memory:');
    try {
      const frames = new FrameStore(db);
      const sessions = new SessionStore(db);
      const search = new HybridSearch(db, createFakeEmbedder());
      const turns = extractTurnsFromLocomoRaw(tmpFixturePath);
      await ingestLoCoMoCorpus(db, search, frames, sessions, turns);

      const results = await search.search('sunrise painting', { limit: 3 });
      expect(results.length).toBeGreaterThan(0);
      // Sunrise line lives in conv-01 / D2:1
      const top = results[0];
      expect(top.frame.content).toContain('sunrise');
      expect(top.frame.gop_id).toBe('conv-01');
    } finally {
      db.close();
    }
  });

  it('respects gopId scope: searching within one conversation excludes others', async () => {
    const db = new MindDB(':memory:');
    try {
      const frames = new FrameStore(db);
      const sessions = new SessionStore(db);
      const search = new HybridSearch(db, createFakeEmbedder());
      const turns = extractTurnsFromLocomoRaw(tmpFixturePath);
      await ingestLoCoMoCorpus(db, search, frames, sessions, turns);

      const scoped = await search.search('morning', { limit: 5, gopId: 'conv-02' });
      expect(scoped.every(r => r.frame.gop_id === 'conv-02')).toBe(true);
    } finally {
      db.close();
    }
  });

  it('close() frees the :memory: handle', async () => {
    const db = new MindDB(':memory:');
    const frames = new FrameStore(db);
    const sessions = new SessionStore(db);
    const search = new HybridSearch(db, createFakeEmbedder());
    const turns = extractTurnsFromLocomoRaw(tmpFixturePath);
    await ingestLoCoMoCorpus(db, search, frames, sessions, turns);
    db.close();
    // After close, further reads throw (better-sqlite3 behaviour).
    expect(() => db.getDatabase().prepare('SELECT 1').get())
      .toThrow();
  });
});
