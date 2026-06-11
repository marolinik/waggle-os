import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MindDB } from '../../src/mind/db.js';
import { FrameStore } from '../../src/mind/frames.js';
import { SessionStore } from '../../src/mind/sessions.js';
import { HybridSearch } from '../../src/mind/search.js';
import type { Reranker } from '../../src/mind/inprocess-reranker.js';
import { computeRelevance, SCORING_PROFILES } from '../../src/mind/scoring.js';
import { MockEmbedder } from './helpers/mock-embedder.js';

/**
 * W4.2 — cross-encoder reranker integration (reverse-ported from the OSS
 * benchmark-proven stack; W4-PRODUCTION-PORT-PLAN-2026-06-11.md component #4)
 * + scoring bug #3 (temporal decay anchors on created_at, not last_accessed).
 *
 * Tests use a mock Reranker — the real ONNX model (~22MB download) is
 * exercised only behind the WAGGLE_RERANKER=1 opt-in at runtime.
 */

describe('HybridSearch — reranker option (W4.2)', () => {
  let db: MindDB;
  let frames: FrameStore;
  let sessions: SessionStore;
  let search: HybridSearch;
  let gopId: string;

  beforeEach(() => {
    db = new MindDB(':memory:');
    frames = new FrameStore(db);
    sessions = new SessionStore(db);
    search = new HybridSearch(db, new MockEmbedder());
    gopId = sessions.create().gop_id;
  });

  afterEach(() => {
    db.close();
  });

  /** Reranker that scores by presence of a marker substring. */
  function markerReranker(marker: string): Reranker {
    const scoreOf = (doc: string): number => (doc.includes(marker) ? 10 : -10);
    return {
      score: async (_q, doc) => scoreOf(doc),
      scoreBatch: async (_q, docs) => docs.map(scoreOf),
    };
  }

  it('re-orders the RRF pool by reranker score', async () => {
    // Both frames match the query keywords; the marker one should win
    // ONLY when the reranker is active.
    frames.createIFrame(gopId, 'deploy checklist for the staging rollout', 'normal', 'user_stated');
    frames.createIFrame(gopId, 'deploy checklist MARKER for the production rollout', 'normal', 'user_stated');

    const reranked = await search.search('deploy checklist rollout', {
      limit: 2,
      reranker: markerReranker('MARKER'),
    });
    expect(reranked.length).toBeGreaterThan(0);
    expect(reranked[0].frame.content).toContain('MARKER');
    expect(reranked[0].finalScore).toBe(10);
  });

  it('soft-fails to RRF ordering when the reranker throws', async () => {
    frames.createIFrame(gopId, 'deploy checklist for the staging rollout', 'normal', 'user_stated');

    const broken: Reranker = {
      score: async () => { throw new Error('model load failed'); },
      scoreBatch: async () => { throw new Error('model load failed'); },
    };
    const results = await search.search('deploy checklist', { limit: 5, reranker: broken });
    expect(results.length).toBeGreaterThan(0); // recall survives
  });

  it('returns identical results when no reranker is passed (back-compat)', async () => {
    frames.createIFrame(gopId, 'deploy checklist for the staging rollout', 'normal', 'user_stated');
    const a = await search.search('deploy checklist', { limit: 5 });
    const b = await search.search('deploy checklist', { limit: 5 });
    expect(a.map(r => r.frame.id)).toEqual(b.map(r => r.frame.id));
  });
});

describe('computeRelevance — temporal anchors on created_at (W4.2 bug #3)', () => {
  it('scores an old-created frame low even when freshly accessed', () => {
    const now = new Date().toISOString();
    const yearAgo = new Date(Date.now() - 365 * 86400000).toISOString();

    const oldButTouched = computeRelevance(
      { id: 1, created_at: yearAgo, last_accessed: now, access_count: 0, importance: 'normal' },
      SCORING_PROFILES.recent,
    );
    const trulyRecent = computeRelevance(
      { id: 2, created_at: now, last_accessed: now, access_count: 0, importance: 'normal' },
      SCORING_PROFILES.recent,
    );
    // Before the fix both scored identically (decay ran on last_accessed,
    // which touch() bumps to now on every read).
    expect(trulyRecent).toBeGreaterThan(oldButTouched);
  });

  it('falls back to last_accessed when created_at is absent (back-compat)', () => {
    const now = new Date().toISOString();
    const score = computeRelevance(
      { id: 3, last_accessed: now, access_count: 0, importance: 'normal' },
      SCORING_PROFILES.recent,
    );
    expect(score).toBeGreaterThan(0);
  });
});
