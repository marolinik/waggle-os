import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MindDB } from '../../src/mind/db.js';
import { FrameStore } from '../../src/mind/frames.js';
import { SessionStore } from '../../src/mind/sessions.js';
import { KnowledgeGraph } from '../../src/mind/knowledge.js';

/**
 * Pins for the three counts `getMemoryStats()` reports on every user turn.
 *
 * R-6 measured what `orchestrator.ts` had already guessed: those six `COUNT(*)`
 * queries cost 68 ms at 100k frames and 245 ms at 500k, per turn. The fix the
 * comment there prescribes is "a write-counter in MindDB, not a time-based
 * cache", because ancillary write paths — a direct `createIFrame`, a
 * `KnowledgeGraph.createEntity` — would silently skip a cache invalidation.
 *
 * These pins characterise the arithmetic BEFORE that counter exists, through
 * every mutation shape that can move a count: ordinary writes, dedup collapses,
 * single deletes, prefix deletes and the compaction sweep. After the counter
 * lands, the same numbers must still come out — and the counter must agree with
 * `COUNT(*)`, which is the property that makes it safe to read instead.
 */

function countRows(db: MindDB, table: string): number {
  const row = db.getDatabase().prepare(`SELECT COUNT(*) as cnt FROM ${table}`).get() as { cnt: number };
  return row.cnt;
}

describe('mind row counts — the numbers getMemoryStats reports', () => {
  let db: MindDB;
  let frames: FrameStore;
  let sessions: SessionStore;
  let knowledge: KnowledgeGraph;
  let gopId: string;

  beforeEach(() => {
    db = new MindDB(':memory:');
    frames = new FrameStore(db);
    sessions = new SessionStore(db);
    knowledge = new KnowledgeGraph(db);
    gopId = sessions.create().gop_id;
  });

  afterEach(() => {
    db.close();
  });

  it('a fresh mind reports zero frames and zero entities, and one session', () => {
    expect(countRows(db, 'memory_frames')).toBe(0);
    expect(countRows(db, 'knowledge_entities')).toBe(0);
    expect(countRows(db, 'sessions')).toBe(1);
  });

  it('counts every distinct frame written', () => {
    for (let i = 0; i < 5; i++) frames.createIFrame(gopId, `frame ${i}`);

    expect(countRows(db, 'memory_frames')).toBe(5);
  });

  it('a duplicate does NOT raise the count — the write path dedups on content hash', () => {
    frames.createIFrame(gopId, 'the same thing');
    frames.createIFrame(gopId, 'the same thing');

    // This is the mutation shape a naive counter gets wrong: createIFrame was
    // called twice and returned a frame twice, but only one row exists.
    expect(countRows(db, 'memory_frames')).toBe(1);
  });

  it('a P-frame raises the count even when its content repeats an I-frame', () => {
    const base = frames.createIFrame(gopId, 'shared text');
    frames.createPFrame(gopId, 'shared text', base.id);

    // createPFrame has no dedup probe, so identical content does add a row.
    expect(countRows(db, 'memory_frames')).toBe(2);
  });

  it('deleting a frame lowers the count by exactly one', () => {
    const a = frames.createIFrame(gopId, 'keep me');
    const b = frames.createIFrame(gopId, 'delete me');

    expect(frames.delete(b.id)).toBe(true);

    expect(countRows(db, 'memory_frames')).toBe(1);
    expect(frames.getById(a.id)).toBeDefined();
  });

  it('a prefix delete lowers the count by however many it matched', () => {
    frames.createIFrame(gopId, 'User identity: first');
    frames.createIFrame(gopId, 'User identity: second');
    frames.createIFrame(gopId, 'unrelated frame');

    const removed = frames.deleteByContentPrefix('User identity: ');

    expect(removed).toBe(2);
    expect(countRows(db, 'memory_frames')).toBe(1);
  });

  it('compaction on a young mind removes nothing', () => {
    for (let i = 0; i < 3; i++) frames.createIFrame(gopId, `recent ${i}`, 'temporary');

    frames.compact();

    // Temporary frames age out after 30 days; nothing here is old enough.
    expect(countRows(db, 'memory_frames')).toBe(3);
  });

  it('entities count on create, and a retired entity is still a row', () => {
    const e = knowledge.createEntity('person', 'Marko', {});
    knowledge.createEntity('concept', 'Waggle', {});

    expect(countRows(db, 'knowledge_entities')).toBe(2);

    knowledge.retireEntity(e.id);

    // Retirement is temporal (valid_to), not deletion — the row stays, so the
    // count the user sees does not drop.
    expect(countRows(db, 'knowledge_entities')).toBe(2);
  });

  describe('the trigger-maintained counters agree with COUNT(*)', () => {
    /** The whole safety property: reading row_counts must equal scanning. */
    function expectAgreement() {
      const counts = db.memoryCounts();
      expect(counts.frameCount).toBe(countRows(db, 'memory_frames'));
      expect(counts.sessionCount).toBe(countRows(db, 'sessions'));
      expect(counts.entityCount).toBe(countRows(db, 'knowledge_entities'));
    }

    it('on a fresh mind', () => {
      expectAgreement();
    });

    it('after writes, a dedup collapse and a P-frame', () => {
      const base = frames.createIFrame(gopId, 'first');
      frames.createIFrame(gopId, 'first');
      frames.createPFrame(gopId, 'first', base.id);
      knowledge.createEntity('person', 'Marko', {});
      sessions.create('project-y');

      expectAgreement();
      expect(db.memoryCounts().frameCount).toBe(2);
    });

    it('after a single delete and a prefix delete', () => {
      const doomed = frames.createIFrame(gopId, 'delete me');
      frames.createIFrame(gopId, 'User identity: a');
      frames.createIFrame(gopId, 'User identity: b');
      frames.delete(doomed.id);
      frames.deleteByContentPrefix('User identity: ');

      expectAgreement();
      expect(db.memoryCounts().frameCount).toBe(0);
    });

    it('after a raw SQL write that bypasses every store class', () => {
      // The reason this is a trigger and not an application-side cache:
      // orchestrator.ts declined to cache these precisely because ancillary
      // paths write the tables directly. A trigger cannot be bypassed.
      db.getDatabase()
        .prepare(
          "INSERT INTO memory_frames (frame_type, gop_id, t, content, importance, source) " +
          "VALUES ('I', ?, 99, 'written behind the stores', 'normal', 'system')",
        )
        .run(gopId);

      expectAgreement();
      expect(db.memoryCounts().frameCount).toBe(1);
    });

    it('recountRows repairs a counter that was corrupted out of band', () => {
      frames.createIFrame(gopId, 'real row');
      db.getDatabase().prepare("UPDATE row_counts SET n = 9999 WHERE table_name = 'memory_frames'").run();

      expect(db.memoryCounts().frameCount).toBe(9999);

      db.recountRows();

      expectAgreement();
      expect(db.memoryCounts().frameCount).toBe(1);
    });
  });

  it('sessions count on create and survive closing', () => {
    const second = sessions.create('project-x');
    sessions.close(second.gop_id, 'done');

    expect(countRows(db, 'sessions')).toBe(2);
  });
});
