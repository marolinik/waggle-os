import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MindDB } from '../../src/mind/db.js';
import { FrameStore } from '../../src/mind/frames.js';
import { SessionStore } from '../../src/mind/sessions.js';
import { HybridSearch, rechunkAllFrames } from '../../src/mind/search.js';
import { MockEmbedder } from './helpers/mock-embedder.js';

/**
 * D1 (oss-drift triage, 2026-06-11) — chunk-level retrieval lane, reverse-
 * ported from OSS hive-mind "Phase 3b-3". FLAG-GATED: WAGGLE_CHUNK_RETRIEVAL=1
 * is OPT-IN; default OFF must be byte-identical to pre-D1 behavior.
 */

const FLAG = 'WAGGLE_CHUNK_RETRIEVAL';

/** A single paragraph of `sentences` short sentences (~55 chars each). */
function para(topic: string, sentences: number): string {
  return Array.from(
    { length: sentences },
    (_, i) => `The ${topic} system processes record number ${i} every day.`
  ).join(' ');
}

/** Multi-paragraph content long enough to produce >= 2 chunks (default knobs). */
function longContent(topic: string): string {
  return `${para(topic, 30)}\n\n${para(topic, 30)}`;
}

describe('HybridSearch — chunk-level retrieval lane (D1)', () => {
  let db: MindDB;
  let frames: FrameStore;
  let sessions: SessionStore;
  let search: HybridSearch;
  let gopId: string;
  let savedFlag: string | undefined;

  beforeEach(() => {
    savedFlag = process.env[FLAG];
    // D1 flip (2026-06-12): the flag is now default-ON (unset = enabled), so
    // "off" in tests must be the explicit kill switch '0', not deletion.
    process.env[FLAG] = '0';
    db = new MindDB(':memory:');
    frames = new FrameStore(db);
    sessions = new SessionStore(db);
    search = new HybridSearch(db, new MockEmbedder());
    gopId = sessions.create().gop_id;
  });

  afterEach(() => {
    if (savedFlag === undefined) delete process.env[FLAG];
    else process.env[FLAG] = savedFlag;
    db.close();
  });

  function chunkRowCount(): number {
    return (db.getDatabase().prepare('SELECT COUNT(*) AS n FROM memory_frame_chunks').get() as { n: number }).n;
  }

  function chunkVecCount(): number {
    return (db.getDatabase().prepare('SELECT COUNT(*) AS n FROM memory_frame_chunks_vec').get() as { n: number }).n;
  }

  describe('flag OFF (default) — byte-identical to pre-D1', () => {
    it('indexFrame writes ZERO chunk rows', async () => {
      const f = frames.createIFrame(gopId, longContent('kubernetes'), 'normal', 'user_stated');
      await search.indexFrame(f.id, f.content);
      expect(chunkRowCount()).toBe(0);
      expect(chunkVecCount()).toBe(0);
    });

    it('search() never touches the chunk lane and uses whole-frame vectors', async () => {
      const f = frames.createIFrame(gopId, longContent('kubernetes'), 'normal', 'user_stated');
      await search.indexFrame(f.id, f.content);

      const chunkSpy = vi.spyOn(search, 'vectorSearchChunks');
      const vecSpy = vi.spyOn(search, 'vectorSearch');
      const results = await search.search('kubernetes system record', { limit: 5 });

      expect(chunkSpy).not.toHaveBeenCalled();
      expect(vecSpy).toHaveBeenCalledTimes(1);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].frame.id).toBe(f.id);
    });

    it('search() output is stable across calls (regression anchor)', async () => {
      const a = frames.createIFrame(gopId, longContent('kubernetes'), 'normal', 'user_stated');
      const b = frames.createIFrame(gopId, longContent('gardening'), 'normal', 'user_stated');
      await search.indexFrame(a.id, a.content);
      await search.indexFrame(b.id, b.content);

      const r1 = await search.search('kubernetes system record', { limit: 5 });
      const r2 = await search.search('kubernetes system record', { limit: 5 });
      expect(r1.map(r => [r.frame.id, r.finalScore])).toEqual(r2.map(r => [r.frame.id, r.finalScore]));
    });
  });

  describe('flag ON — chunk lane active', () => {
    beforeEach(() => {
      process.env[FLAG] = '1';
    });

    it('indexFrame also writes chunk rows + chunk vectors', async () => {
      const f = frames.createIFrame(gopId, longContent('kubernetes'), 'normal', 'user_stated');
      await search.indexFrame(f.id, f.content);
      expect(chunkRowCount()).toBeGreaterThanOrEqual(2); // long content → multiple chunks
      expect(chunkVecCount()).toBe(chunkRowCount());
    });

    it('indexFramesBatch also writes chunk rows for every frame', async () => {
      const a = frames.createIFrame(gopId, longContent('kubernetes'), 'normal', 'user_stated');
      const b = frames.createIFrame(gopId, 'short note about tomatoes', 'normal', 'user_stated');
      await search.indexFramesBatch([
        { id: a.id, content: a.content },
        { id: b.id, content: b.content },
      ]);
      const raw = db.getDatabase();
      const perFrame = raw
        .prepare('SELECT frame_id, COUNT(*) AS n FROM memory_frame_chunks GROUP BY frame_id')
        .all() as Array<{ frame_id: number; n: number }>;
      const byId = new Map(perFrame.map(r => [r.frame_id, r.n]));
      expect(byId.get(a.id)).toBeGreaterThanOrEqual(2);
      expect(byId.get(b.id)).toBe(1); // short content → single chunk
    });

    it('search() uses the chunk lane (whole-frame vectorSearch NOT called)', async () => {
      const f = frames.createIFrame(gopId, longContent('kubernetes'), 'normal', 'user_stated');
      await search.indexFrame(f.id, f.content);

      const vecSpy = vi.spyOn(search, 'vectorSearch');
      const results = await search.search('kubernetes system record', { limit: 5 });

      expect(vecSpy).not.toHaveBeenCalled();
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].frame.id).toBe(f.id);
    });

    it('vectorSearchChunks dedups to best-chunk-per-frame', async () => {
      // Both of this frame's chunks match the query — the parent frame must
      // appear exactly once in the returned ids.
      const f = frames.createIFrame(gopId, longContent('kubernetes'), 'normal', 'user_stated');
      const g = frames.createIFrame(gopId, longContent('gardening'), 'normal', 'user_stated');
      await search.indexFrame(f.id, f.content);
      await search.indexFrame(g.id, g.content);
      expect(chunkRowCount()).toBeGreaterThanOrEqual(4);

      const ids = await search.vectorSearchChunks('kubernetes system record', 10);
      expect(ids).not.toBeNull();
      const occurrences = (ids as number[]).filter(id => id === f.id).length;
      expect(occurrences).toBe(1);
      expect(new Set(ids as number[]).size).toBe((ids as number[]).length);
      expect((ids as number[])[0]).toBe(f.id); // best-matching frame first
    });

    it('falls back to whole-frame vectors when the chunk index is empty', async () => {
      // Index with the flag OFF (explicit kill switch — default is ON) so no
      // chunks are written…
      process.env[FLAG] = '0';
      const f = frames.createIFrame(gopId, longContent('kubernetes'), 'normal', 'user_stated');
      await search.indexFrame(f.id, f.content);
      expect(chunkRowCount()).toBe(0);
      // …then search with the flag ON: chunk probe finds 0 rows → null → fallback.
      process.env[FLAG] = '1';

      const vecSpy = vi.spyOn(search, 'vectorSearch');
      const results = await search.search('kubernetes system record', { limit: 5 });

      expect(vecSpy).toHaveBeenCalledTimes(1);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].frame.id).toBe(f.id);
    });

    it('vectorSearchChunks honours gopId scoping', async () => {
      const otherGop = sessions.create().gop_id;
      const f = frames.createIFrame(gopId, longContent('kubernetes'), 'normal', 'user_stated');
      // Distinct content: identical text would hit the D3 content-hash dedup
      // and return the SAME frame (one frame can't be vector-indexed twice).
      const g = frames.createIFrame(
        otherGop,
        `${longContent('kubernetes')} Extra kubernetes deployment sentence.`,
        'normal',
        'user_stated'
      );
      await search.indexFrame(f.id, f.content);
      await search.indexFrame(g.id, g.content);

      const ids = await search.vectorSearchChunks('kubernetes system record', 10, gopId);
      expect(ids).not.toBeNull();
      expect(ids).toContain(f.id);
      expect(ids).not.toContain(g.id);
    });
  });

  describe('indexChunksForFrame (flag-independent)', () => {
    it('is callable with the flag OFF (backfill/eval path)', async () => {
      const f = frames.createIFrame(gopId, longContent('kubernetes'), 'normal', 'user_stated');
      const n = await search.indexChunksForFrame(f.id, f.content);
      expect(n).toBeGreaterThanOrEqual(2);
      expect(chunkRowCount()).toBe(n);
      expect(chunkVecCount()).toBe(n);
    });

    it('replaces chunks on reindex (no orphaned vec rows)', async () => {
      const f = frames.createIFrame(gopId, longContent('kubernetes'), 'normal', 'user_stated');
      const first = await search.indexChunksForFrame(f.id, f.content);
      expect(first).toBeGreaterThanOrEqual(2);

      const second = await search.indexChunksForFrame(f.id, 'short replacement content');
      expect(second).toBe(1);
      expect(chunkRowCount()).toBe(1);
      expect(chunkVecCount()).toBe(1);
      const row = db.getDatabase()
        .prepare('SELECT content FROM memory_frame_chunks WHERE frame_id = ?')
        .get(f.id) as { content: string };
      expect(row.content).toBe('short replacement content');
    });

    it('rejects invalid frame ids', async () => {
      await expect(search.indexChunksForFrame(0, 'x')).rejects.toThrow('Invalid frame ID');
      await expect(search.indexChunksForFrame(Number.NaN, 'x')).rejects.toThrow('Invalid frame ID');
    });
  });

  describe('recreateVecTables (D1 extension)', () => {
    it('drops + recreates the chunk vec table; chunk CONTENT rows survive', async () => {
      const f = frames.createIFrame(gopId, longContent('kubernetes'), 'normal', 'user_stated');
      await search.indexChunksForFrame(f.id, f.content);
      const contentRows = chunkRowCount();
      expect(contentRows).toBeGreaterThanOrEqual(2);
      expect(chunkVecCount()).toBe(contentRows);

      db.recreateVecTables(1024);

      // Vectors discarded, content rows survive (they're re-derivable text,
      // not vectors — rechunkAllFrames re-embeds them).
      expect(chunkVecCount()).toBe(0);
      expect(chunkRowCount()).toBe(contentRows);
      // And the recreated table is writable again.
      await search.indexChunksForFrame(f.id, f.content);
      expect(chunkVecCount()).toBe(chunkRowCount());
    });
  });

  describe('rechunkAllFrames (backfill helper)', () => {
    it('populates chunks from existing frames, skipping deprecated', async () => {
      const a = frames.createIFrame(gopId, longContent('kubernetes'), 'normal', 'user_stated');
      const b = frames.createIFrame(gopId, 'short note about tomatoes', 'normal', 'user_stated');
      const dep = frames.createIFrame(gopId, longContent('obsolete'), 'deprecated', 'user_stated');
      expect(chunkRowCount()).toBe(0);

      const result = await rechunkAllFrames(db, search);

      expect(result.framesProcessed).toBe(2);
      expect(result.framesFailed).toBe(0);
      expect(result.chunksCreated).toBeGreaterThanOrEqual(3); // >=2 for a, 1 for b
      expect(chunkRowCount()).toBe(result.chunksCreated);
      expect(chunkVecCount()).toBe(result.chunksCreated);

      const raw = db.getDatabase();
      const frameIds = (raw.prepare('SELECT DISTINCT frame_id FROM memory_frame_chunks').all() as Array<{ frame_id: number }>)
        .map(r => r.frame_id);
      expect(frameIds).toContain(a.id);
      expect(frameIds).toContain(b.id);
      expect(frameIds).not.toContain(dep.id);
    });

    it('is idempotent — a second pass yields the same chunk counts', async () => {
      const f = frames.createIFrame(gopId, longContent('kubernetes'), 'normal', 'user_stated');
      void f;
      const first = await rechunkAllFrames(db, search);
      const second = await rechunkAllFrames(db, search);
      expect(second.chunksCreated).toBe(first.chunksCreated);
      expect(chunkRowCount()).toBe(first.chunksCreated);
      expect(chunkVecCount()).toBe(first.chunksCreated);
    });
  });
});
