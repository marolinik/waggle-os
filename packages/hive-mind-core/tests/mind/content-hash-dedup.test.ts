import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { MindDB } from '../../src/mind/db.js';
import { FrameStore } from '../../src/mind/frames.js';
import { SessionStore } from '../../src/mind/sessions.js';
import { hashFrameContent, stripHmPrefix } from '../../src/mind/content-hash.js';

/**
 * oss-drift D3 — indexed content_hash dedup with MONO semantics
 * (stripHmPrefix + trim). The old findDuplicate scanned only the last 500
 * frames; the indexed lookup has NO recency window. Backfill covers rows
 * written before the column existed.
 */

describe('D3 — content-hash dedup (indexed, unbounded)', () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => { while (cleanups.length) cleanups.pop()!(); });

  function freshMind(): { db: MindDB; frames: FrameStore; gopId: string } {
    const db = new MindDB(':memory:');
    cleanups.push(() => db.close());
    const frames = new FrameStore(db);
    const gopId = new SessionStore(db).create().gop_id;
    return { db, frames, gopId };
  }

  it('hashFrameContent is stripHmPrefix-aware and trim-stable', () => {
    expect(hashFrameContent('  body text \n')).toBe(hashFrameContent('body text'));
    expect(hashFrameContent('[hm session:x src:claude-code event:stop] body text'))
      .toBe(hashFrameContent('body text'));
    expect(stripHmPrefix('[hm src:a] hello')).toBe('hello');
  });

  it('dedups beyond the old 500-frame recency window', () => {
    const { frames, gopId } = freshMind();
    const first = frames.createIFrame(gopId, 'the very first unique frame body', 'normal', 'system');
    // bury it under 550 distinct frames (old implementation would miss it)
    for (let i = 0; i < 550; i++) {
      frames.createIFrame(gopId, `filler frame number ${i}`, 'normal', 'system');
    }
    const dup = frames.createIFrame(gopId, 'the very first unique frame body', 'normal', 'system');
    expect(dup.id).toBe(first.id); // dedup hit, no new row
  });

  it('provenance-insensitive dedup still holds (OQ-6 regression)', () => {
    const { frames, gopId } = freshMind();
    const a = frames.createIFrame(gopId, '[hm session:s1 src:openclaw event:stop] same turn body', 'normal', 'system');
    const b = frames.createIFrame(gopId, '[hm session:s2 src:claude-code event:stop] same turn body', 'normal', 'system');
    expect(b.id).toBe(a.id);
  });

  it('content_hash is maintained on insert, update, and stays consistent', () => {
    const { db, frames, gopId } = freshMind();
    const f = frames.createIFrame(gopId, 'original content', 'normal', 'system');
    const raw = db.getDatabase();
    const row = (): { content_hash: string } =>
      raw.prepare('SELECT content_hash FROM memory_frames WHERE id = ?').get(f.id) as { content_hash: string };
    expect(row().content_hash).toBe(hashFrameContent('original content'));

    frames.update(f.id, 'updated content');
    expect(row().content_hash).toBe(hashFrameContent('updated content'));
    // the updated frame is now findable as a duplicate of the NEW content
    expect(frames.findDuplicate('updated content')?.id).toBe(f.id);
    expect(frames.findDuplicate('original content')).toBeNull();
  });

  it('migration backfills NULL hashes from rows written by raw SQL', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-d3-'));
    cleanups.push(() => fs.rmSync(dir, { recursive: true, force: true }));
    const file = path.join(dir, 'test.mind');

    const db1 = new MindDB(file);
    new SessionStore(db1).ensure('raw-sess', 'system', 'raw');
    // simulate a pre-column writer: insert WITHOUT content_hash
    db1.getDatabase().prepare(
      `INSERT INTO memory_frames (frame_type, gop_id, t, content, importance)
       VALUES ('I', 'raw-sess', 0, 'legacy row body', 'normal')`
    ).run();
    db1.close();

    const db2 = new MindDB(file); // runMigrations → backfill
    cleanups.push(() => db2.close());
    const row = db2.getDatabase().prepare(
      `SELECT content_hash FROM memory_frames WHERE content = 'legacy row body'`
    ).get() as { content_hash: string | null };
    expect(row.content_hash).toBe(hashFrameContent('legacy row body'));
    // and the legacy row now participates in dedup
    const frames2 = new FrameStore(db2);
    expect(frames2.findDuplicate('legacy row body')).not.toBeNull();
  });
});
