import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MindDB } from '../../src/mind/db.js';
import { FrameStore } from '../../src/mind/frames.js';
import { SessionStore } from '../../src/mind/sessions.js';
import { HybridSearch } from '../../src/mind/search.js';
import { MockEmbedder } from './helpers/mock-embedder.js';

/**
 * W4.1b — since/until substrate fixes (W4-PRODUCTION-PORT-PLAN-2026-06-11.md
 * §3, production bug #2):
 *
 *  FENCEPOST: `created_at` carries mixed formats ("YYYY-MM-DD HH:MM:SS" from
 *  datetime('now') vs harvest ISO "…T…Z"). A date-only `until` string-compared
 *  below any same-day timestamp, silently excluding the final day of every
 *  window. Date-only bounds now compare on the 10-char date prefix.
 *
 *  SLOT CONSUMPTION: the temporal filter ran AFTER the lanes (WHERE over
 *  candidate ids), so out-of-window candidates consumed lane slots and results
 *  shrank below `limit` even when in-window frames existed deeper in the
 *  lanes. Lanes now over-fetch (limit*10) when a window is active.
 */

describe('HybridSearch — since/until date-window fixes (W4.1b)', () => {
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

  function setCreatedAt(frameId: number, createdAt: string): void {
    db.getDatabase()
      .prepare('UPDATE memory_frames SET created_at = ? WHERE id = ?')
      .run(createdAt, frameId);
  }

  describe('fencepost: date-only until includes the whole final day', () => {
    it('returns a frame whose ISO timestamp falls later on the until day', async () => {
      const f = frames.createIFrame(gopId, 'quarterly metrics review for the launch', 'normal', 'user_stated');
      setCreatedAt(f.id, '2026-03-21T10:00:00.000Z'); // same day, after midnight

      const hits = await search.search('quarterly metrics review', {
        limit: 5,
        until: '2026-03-21',
      });
      expect(hits.map(h => h.frame.id)).toContain(f.id);
    });

    it('returns a frame with a space-separated timestamp on the until day', async () => {
      const f = frames.createIFrame(gopId, 'quarterly metrics review for the launch', 'normal', 'user_stated');
      setCreatedAt(f.id, '2026-03-21 14:30:00'); // datetime('now') format

      const hits = await search.search('quarterly metrics review', {
        limit: 5,
        until: '2026-03-21',
      });
      expect(hits.map(h => h.frame.id)).toContain(f.id);
    });

    it('still excludes frames after the until day', async () => {
      const f = frames.createIFrame(gopId, 'quarterly metrics review for the launch', 'normal', 'user_stated');
      setCreatedAt(f.id, '2026-03-22T00:30:00.000Z');

      const hits = await search.search('quarterly metrics review', {
        limit: 5,
        until: '2026-03-21',
      });
      expect(hits.map(h => h.frame.id)).not.toContain(f.id);
    });

    it('date-only since includes frames from midnight of that day', async () => {
      const f = frames.createIFrame(gopId, 'quarterly metrics review for the launch', 'normal', 'user_stated');
      setCreatedAt(f.id, '2026-03-21T00:30:00.000Z');

      const hits = await search.search('quarterly metrics review', {
        limit: 5,
        since: '2026-03-21',
      });
      expect(hits.map(h => h.frame.id)).toContain(f.id);
    });
  });

  describe('slot consumption: windowed search reaches past out-of-window candidates', () => {
    it('returns in-window frames even when out-of-window frames dominate the lanes', async () => {
      // 30 out-of-window frames that rank HIGHER on the keyword lane (denser
      // keyword repetition) — in the old code these filled the limit*2 lane
      // slots and the post-filter left nothing.
      for (let i = 0; i < 30; i++) {
        const f = frames.createIFrame(
          gopId,
          `alpha rollout alpha checklist item ${i} alpha`,
          'normal',
          'user_stated',
        );
        setCreatedAt(f.id, '2026-06-01T08:00:00.000Z');
      }
      // 3 in-window frames, weaker keyword density
      const inWindow: number[] = [];
      for (let i = 0; i < 3; i++) {
        const f = frames.createIFrame(
          gopId,
          `alpha planning note ${i} from spring`,
          'normal',
          'user_stated',
        );
        setCreatedAt(f.id, `2025-05-1${i}T09:00:00.000Z`);
        inWindow.push(f.id);
      }

      const hits = await search.search('alpha', {
        limit: 5,
        since: '2025-05-01',
        until: '2025-05-31',
      });
      const ids = hits.map(h => h.frame.id);
      for (const id of inWindow) expect(ids).toContain(id);
    });
  });
});
