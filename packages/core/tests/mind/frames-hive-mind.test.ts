/**
 * FrameStore tests — full-file port from
 * hive-mind/packages/core/src/mind/frames.test.ts.
 *
 * Memory Sync Repair Step 2. Source: hive-mind file at HEAD c363257.
 *
 * Filename suffix `-hive-mind` keeps this distinct from waggle-os's own
 * `frames.test.ts` (which exercises sessions+frames together with much
 * broader coverage including importance multipliers, performance under
 * 10K frames, getRecent/getGopFrames, etc.). Hive-mind's file focuses on
 * the smaller surface: I/P/B frame creation, reconstructState, dedup,
 * update, delete, compact, getStats — all of which exist in waggle-os.
 *
 * Also includes the 4 createIFrame createdAt cases ported in Step 1 —
 * here as a duplicate-but-isolated check that the public API contract
 * holds when exercised through the hive-mind test setup convention
 * (raw INSERT into sessions vs SessionStore).
 *
 * Adapted imports: `./db.js`, `./frames.js` → `../../src/mind/...`.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rmSync, existsSync } from 'node:fs';
import { MindDB } from '../../src/mind/db.js';
import { FrameStore } from '../../src/mind/frames.js';

describe('FrameStore (hive-mind port)', () => {
  let dbPath: string;
  let db: MindDB;
  let frames: FrameStore;

  beforeEach(() => {
    dbPath = join(tmpdir(), `waggle-mind-frames-test-${Date.now()}-${Math.random()}.mind`);
    db = new MindDB(dbPath);
    db.getDatabase()
      .prepare("INSERT INTO sessions (gop_id, status, started_at) VALUES ('gop-test', 'active', datetime('now'))")
      .run();
    frames = new FrameStore(db);
  });

  afterEach(() => {
    db.close();
    if (existsSync(dbPath)) rmSync(dbPath);
    for (const suffix of ['-shm', '-wal']) {
      if (existsSync(dbPath + suffix)) rmSync(dbPath + suffix);
    }
  });

  it('creates I-frames with monotonically increasing t within a GOP', () => {
    const a = frames.createIFrame('gop-test', 'first', 'normal');
    const b = frames.createIFrame('gop-test', 'second', 'normal');
    expect(a.frame_type).toBe('I');
    expect(b.frame_type).toBe('I');
    expect(a.t).toBe(0);
    expect(b.t).toBe(1);
    expect(b.id).toBeGreaterThan(a.id);
  });

  it('createPFrame attaches to a base I-frame', () => {
    const iframe = frames.createIFrame('gop-test', 'base state');
    const pframe = frames.createPFrame('gop-test', 'delta update', iframe.id);
    expect(pframe.frame_type).toBe('P');
    expect(pframe.base_frame_id).toBe(iframe.id);
  });

  it('createBFrame stores referenced frame IDs in the parsed content', () => {
    const a = frames.createIFrame('gop-test', 'A');
    const b = frames.createIFrame('gop-test', 'B');
    const c = frames.createIFrame('gop-test', 'C');
    const bridge = frames.createBFrame('gop-test', 'links a-b-c', a.id, [b.id, c.id]);
    expect(bridge.frame_type).toBe('B');
    expect(frames.getBFrameReferences(bridge.id)).toEqual([b.id, c.id]);
  });

  it('reconstructState returns the latest I-frame and following P-frames', () => {
    const iframe = frames.createIFrame('gop-test', 'state v1', 'important');
    frames.createPFrame('gop-test', 'delta 1', iframe.id);
    frames.createPFrame('gop-test', 'delta 2', iframe.id);

    const state = frames.reconstructState('gop-test');
    expect(state.iframe?.id).toBe(iframe.id);
    expect(state.pframes).toHaveLength(2);
    expect(state.pframes.map((p) => p.content)).toEqual(['delta 1', 'delta 2']);
  });

  it('createIFrame honors a valid ISO-8601 createdAt override', () => {
    const ts = '2025-12-01T14:32:00Z';
    const f = frames.createIFrame('gop-test', 'harvested content', 'normal', 'import', ts);
    expect(f.created_at).toBe(ts);
    expect(f.last_accessed).toBe(ts);
  });

  it('createIFrame with undefined createdAt falls back to the schema default (NOW())', () => {
    const before = Date.now();
    const f = frames.createIFrame('gop-test', 'undefined-ts content', 'normal', 'import', undefined);
    const after = Date.now();
    expect(f.created_at).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    const parsed = Date.parse(f.created_at.replace(' ', 'T') + 'Z');
    expect(parsed).toBeGreaterThanOrEqual(before - 5000);
    expect(parsed).toBeLessThanOrEqual(after + 5000);
  });

  it('createIFrame with an invalid-ISO string falls back to the schema default (NOW())', () => {
    const before = Date.now();
    const f = frames.createIFrame(
      'gop-test',
      'invalid-ts content',
      'normal',
      'import',
      'not-a-valid-iso-string',
    );
    const after = Date.now();
    expect(f.created_at).not.toBe('not-a-valid-iso-string');
    expect(f.created_at).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    const parsed = Date.parse(f.created_at.replace(' ', 'T') + 'Z');
    expect(parsed).toBeGreaterThanOrEqual(before - 5000);
    expect(parsed).toBeLessThanOrEqual(after + 5000);
  });

  it('createIFrame with a null createdAt falls back to the schema default', () => {
    const f = frames.createIFrame('gop-test', 'null-ts content', 'normal', 'import', null);
    expect(f.created_at).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });

  it('dedups identical content on createIFrame and increments access_count', () => {
    const first = frames.createIFrame('gop-test', 'repeated content');
    const second = frames.createIFrame('gop-test', 'repeated content');
    expect(second.id).toBe(first.id);
    const row = frames.getById(first.id);
    expect(row?.access_count).toBeGreaterThanOrEqual(1);
  });

  it('update() rewrites content and importance and keeps FTS in sync', () => {
    const iframe = frames.createIFrame('gop-test', 'original');
    const updated = frames.update(iframe.id, 'revised', 'critical');
    expect(updated?.content).toBe('revised');
    expect(updated?.importance).toBe('critical');

    const ftsHit = db
      .getDatabase()
      .prepare('SELECT rowid FROM memory_frames_fts WHERE memory_frames_fts MATCH ?')
      .all('revised') as { rowid: number }[];
    expect(ftsHit.map((r) => r.rowid)).toContain(iframe.id);
  });

  it('delete() removes the row, FTS entry, and clears back-references', () => {
    const base = frames.createIFrame('gop-test', 'base');
    const dependent = frames.createPFrame('gop-test', 'dependent', base.id);

    const ok = frames.delete(base.id);
    expect(ok).toBe(true);
    expect(frames.getById(base.id)).toBeUndefined();

    const survivor = frames.getById(dependent.id);
    expect(survivor).toBeDefined();
    expect(survivor?.base_frame_id).toBeNull();
  });

  it('compact() prunes stale temporary frames older than maxTempAgeDays', () => {
    const tempFrame = frames.createIFrame('gop-test', 'ephemeral', 'temporary');
    db.getDatabase()
      .prepare("UPDATE memory_frames SET created_at = datetime('now', '-100 days') WHERE id = ?")
      .run(tempFrame.id);

    const result = frames.compact(30, 90);
    expect(result.temporaryPruned).toBe(1);
    expect(frames.getById(tempFrame.id)).toBeUndefined();
  });

  it('getStats() aggregates counts by type and importance', () => {
    frames.createIFrame('gop-test', 'a', 'critical');
    frames.createIFrame('gop-test', 'b', 'normal');
    const base = frames.createIFrame('gop-test', 'c', 'important');
    frames.createPFrame('gop-test', 'd', base.id, 'normal');

    const stats = frames.getStats();
    expect(stats.total).toBe(4);
    expect(stats.byType.I).toBe(3);
    expect(stats.byType.P).toBe(1);
    expect(stats.byImportance.critical).toBe(1);
    expect(stats.byImportance.important).toBe(1);
    expect(stats.byImportance.normal).toBe(2);
  });
});
