import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MindDB } from '../../src/mind/db.js';
import { FrameStore } from '../../src/mind/frames.js';
import { SessionStore } from '../../src/mind/sessions.js';
import { HybridSearch } from '../../src/mind/search.js';
import { reconcileIndexes, reconcileFtsIndex, reconcileVecIndex } from '../../src/mind/reconcile.js';
import { MockEmbedder } from './helpers/mock-embedder.js';

describe('Index Reconciliation', () => {
  let db: MindDB;
  let frames: FrameStore;
  let sessions: SessionStore;
  let embedder: MockEmbedder;

  beforeEach(() => {
    db = new MindDB(':memory:');
    frames = new FrameStore(db);
    sessions = new SessionStore(db);
    embedder = new MockEmbedder();
  });

  afterEach(() => {
    db.close();
  });

  describe('reconcileFtsIndex', () => {
    it('returns 0 when all frames have FTS entries', () => {
      const session = sessions.create();
      frames.createIFrame(session.gop_id, 'Already indexed frame');
      frames.createIFrame(session.gop_id, 'Another indexed frame');

      const fixed = reconcileFtsIndex(db);
      expect(fixed).toBe(0);
    });

    it('detects and repairs frames missing from FTS', () => {
      const session = sessions.create();
      const frame = frames.createIFrame(session.gop_id, 'Test frame for FTS reconciliation');

      // Manually delete the FTS entry to simulate a crash between insert and FTS index
      const raw = db.getDatabase();
      raw.prepare('DELETE FROM memory_frames_fts WHERE rowid = ?').run(frame.id);

      // Verify it's missing from FTS
      const ftsCheck = raw.prepare(
        'SELECT rowid FROM memory_frames_fts WHERE rowid = ?',
      ).get(frame.id);
      expect(ftsCheck).toBeUndefined();

      // Reconcile
      const fixed = reconcileFtsIndex(db);
      expect(fixed).toBe(1);

      // Verify it's back in FTS
      const ftsAfter = raw.prepare(
        'SELECT rowid FROM memory_frames_fts WHERE rowid = ?',
      ).get(frame.id);
      expect(ftsAfter).toBeDefined();
    });

    it('repairs multiple missing FTS entries', () => {
      const session = sessions.create();
      const f1 = frames.createIFrame(session.gop_id, 'Frame alpha for reconcile');
      const f2 = frames.createPFrame(session.gop_id, 'Frame beta update', f1.id);
      const f3 = frames.createIFrame(session.gop_id, 'Frame gamma snapshot');

      const raw = db.getDatabase();
      // Delete FTS for f1 and f3, leave f2 intact
      raw.prepare('DELETE FROM memory_frames_fts WHERE rowid IN (?, ?)').run(f1.id, f3.id);

      const fixed = reconcileFtsIndex(db);
      expect(fixed).toBe(2);

      // All three should now be searchable
      for (const fid of [f1.id, f2.id, f3.id]) {
        const entry = raw.prepare(
          'SELECT rowid FROM memory_frames_fts WHERE rowid = ?',
        ).get(fid);
        expect(entry).toBeDefined();
      }
    });

    it('restored FTS entries are searchable via keyword search', async () => {
      const session = sessions.create();
      const frame = frames.createIFrame(session.gop_id, 'Quantum computing algorithms');

      // Delete FTS entry
      const raw = db.getDatabase();
      raw.prepare('DELETE FROM memory_frames_fts WHERE rowid = ?').run(frame.id);

      // Verify search fails
      const search = new HybridSearch(db, embedder);
      const beforeResults = await search.keywordSearch('quantum', 10);
      expect(beforeResults).toHaveLength(0);

      // Reconcile
      reconcileFtsIndex(db);

      // Verify search works again
      const afterResults = await search.keywordSearch('quantum', 10);
      expect(afterResults).toHaveLength(1);
      expect(afterResults[0]).toBe(frame.id);
    });

    it('is idempotent — running twice changes nothing', () => {
      const session = sessions.create();
      const frame = frames.createIFrame(session.gop_id, 'Idempotent test frame');

      const raw = db.getDatabase();
      raw.prepare('DELETE FROM memory_frames_fts WHERE rowid = ?').run(frame.id);

      const first = reconcileFtsIndex(db);
      expect(first).toBe(1);

      const second = reconcileFtsIndex(db);
      expect(second).toBe(0);
    });
  });

  describe('reconcileVecIndex', () => {
    it('returns 0 when all frames have vector entries', async () => {
      const session = sessions.create();
      const frame = frames.createIFrame(session.gop_id, 'Vectorized frame');
      const search = new HybridSearch(db, embedder);
      await search.indexFrame(frame.id, frame.content);

      const fixed = await reconcileVecIndex(db, embedder);
      expect(fixed).toBe(0);
    });

    it('detects and repairs frames missing from vec index', async () => {
      const session = sessions.create();
      const frame = frames.createIFrame(session.gop_id, 'Missing vector entry');

      // Frame exists in memory_frames and FTS, but NOT in vec index
      // (simulates crash after FTS index but before vec index)
      const fixed = await reconcileVecIndex(db, embedder);
      expect(fixed).toBe(1);

      // Verify it's in vec now — search should find it
      const search = new HybridSearch(db, embedder);
      const results = await search.vectorSearch('missing vector', 10);
      expect(results).toContain(frame.id);
    });

    it('repairs multiple missing vec entries', async () => {
      const session = sessions.create();
      const f1 = frames.createIFrame(session.gop_id, 'Vector test alpha');
      const f2 = frames.createIFrame(session.gop_id, 'Vector test beta');
      frames.createIFrame(session.gop_id, 'Vector test gamma');

      // Index only f1 so f2 and f3 are missing
      const search = new HybridSearch(db, embedder);
      await search.indexFrame(f1.id, f1.content);

      const fixed = await reconcileVecIndex(db, embedder);
      expect(fixed).toBe(2);
    });

    it('is idempotent — running twice changes nothing', async () => {
      const session = sessions.create();
      frames.createIFrame(session.gop_id, 'Idempotent vec test');

      const first = await reconcileVecIndex(db, embedder);
      expect(first).toBe(1);

      const second = await reconcileVecIndex(db, embedder);
      expect(second).toBe(0);
    });
  });

  describe('reconcileIndexes (combined)', () => {
    it('repairs both FTS and vec in one call', async () => {
      const session = sessions.create();
      const frame = frames.createIFrame(session.gop_id, 'Combined reconcile test');

      // Delete FTS entry — frame was inserted but FTS index crashed
      const raw = db.getDatabase();
      raw.prepare('DELETE FROM memory_frames_fts WHERE rowid = ?').run(frame.id);

      // Vec is also missing (never indexed)
      const result = await reconcileIndexes(db, embedder);
      expect(result.ftsFixed).toBe(1);
      expect(result.vecFixed).toBe(1);
    });

    it('works without an embedder (FTS-only reconciliation)', async () => {
      const session = sessions.create();
      const frame = frames.createIFrame(session.gop_id, 'FTS only reconcile');

      const raw = db.getDatabase();
      raw.prepare('DELETE FROM memory_frames_fts WHERE rowid = ?').run(frame.id);

      const result = await reconcileIndexes(db);
      expect(result.ftsFixed).toBe(1);
      expect(result.vecFixed).toBe(0);
    });

    it('returns zeros when everything is consistent', async () => {
      const session = sessions.create();
      const frame = frames.createIFrame(session.gop_id, 'Consistent frame');
      const search = new HybridSearch(db, embedder);
      await search.indexFrame(frame.id, frame.content);

      const result = await reconcileIndexes(db, embedder);
      expect(result.ftsFixed).toBe(0);
      expect(result.vecFixed).toBe(0);
    });

    it('handles empty database gracefully', async () => {
      const result = await reconcileIndexes(db, embedder);
      expect(result.ftsFixed).toBe(0);
      expect(result.vecFixed).toBe(0);
    });
  });
});
