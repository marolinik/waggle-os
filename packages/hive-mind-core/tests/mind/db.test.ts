/**
 * MindDB substrate tests — ported from hive-mind/packages/core/src/mind/db.test.ts.
 *
 * Memory Sync Repair Step 2. Source: hive-mind file at HEAD c363257
 * (D:/Projects/hive-mind/packages/core/src/mind/db.test.ts).
 *
 * One adaptation vs the upstream file: the "creates the expected OSS
 * tables and omits the proprietary ones" test is split into two cases
 * here — the OSS-existence half is verbatim; the proprietary-absence
 * half is replaced with a Waggle-specific positive assertion that
 * exercises the same schema surface (proprietary tables MUST exist
 * here). This is intentional API divergence per EXTRACTION.md, not a
 * substrate bug. Tracked in the Step 2 results report as
 * "FAIL — API mismatch (Waggle-specific extension intentional)" if
 * un-adapted; this file ships the adaptation so the suite stays green.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rmSync, existsSync } from 'node:fs';
import { MindDB } from '../../src/mind/db.js';

describe('MindDB (hive-mind port)', () => {
  let dbPath: string;
  let db: MindDB | null;

  beforeEach(() => {
    dbPath = join(tmpdir(), `waggle-mind-test-${Date.now()}-${Math.random()}.mind`);
    db = new MindDB(dbPath);
  });

  afterEach(() => {
    db?.close();
    db = null;
    if (existsSync(dbPath)) rmSync(dbPath);
    // better-sqlite3 creates -shm and -wal sidecar files in WAL mode
    for (const suffix of ['-shm', '-wal']) {
      if (existsSync(dbPath + suffix)) rmSync(dbPath + suffix);
    }
  });

  it('initializes schema and records a first_run_at timestamp on first open', () => {
    const firstRun = db!.getFirstRunAt();
    expect(firstRun).not.toBeNull();
    expect(() => new Date(firstRun!).toISOString()).not.toThrow();
  });

  it('creates the OSS shared-substrate tables (verbatim from hive-mind)', () => {
    const raw = db!.getDatabase();
    const tables = raw
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[];
    const names = new Set(tables.map((t) => t.name));

    // Core OSS surface — same expectation as hive-mind: these are the
    // tables that BOTH repos must carry to keep the sync workflow valid.
    for (const expected of [
      'meta',
      'identity',
      'awareness',
      'sessions',
      'memory_frames',
      'knowledge_entities',
      'knowledge_relations',
      'harvest_sources',
    ]) {
      expect(names.has(expected), `expected table ${expected}`).toBe(true);
    }
  });

  it('also creates the Waggle-specific extension tables (intentional API divergence)', () => {
    // hive-mind asserts these tables MUST be ABSENT (its OSS-scrub
    // guarantee). Waggle-os intentionally carries them as the
    // production-feature extensions per EXTRACTION.md. We invert the
    // assertion to keep coverage on the same surface but reflect the
    // legitimate divergence — surfacing accidental loss of these
    // tables would be a real waggle-os regression.
    const raw = db!.getDatabase();
    const tables = raw
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[];
    const names = new Set(tables.map((t) => t.name));

    for (const required of [
      'ai_interactions',
      'execution_traces',
      'evolution_runs',
      'improvement_signals',
      'install_audit',
    ]) {
      expect(names.has(required), `Waggle-specific table ${required} must exist`).toBe(true);
    }
  });

  it('supports the memory_frames + FTS5 + sqlite-vec pipeline', () => {
    const raw = db!.getDatabase();

    raw.prepare(
      "INSERT INTO sessions (gop_id, project_id) VALUES (?, ?)"
    ).run('gop-1', 'test-project');

    const insert = raw.prepare(
      `INSERT INTO memory_frames (frame_type, gop_id, content, importance, source)
       VALUES (?, ?, ?, ?, ?)`
    );
    insert.run('I', 'gop-1', 'User prefers TypeScript over JavaScript', 'important', 'user_stated');
    insert.run('I', 'gop-1', 'User uses vitest for testing', 'normal', 'user_stated');

    const countRow = raw
      .prepare('SELECT COUNT(*) as n FROM memory_frames')
      .get() as { n: number };
    expect(countRow.n).toBe(2);

    // vec0 virtual table accepts float[1024] embeddings. rowid must be
    // interpolated literally — vec0 rejects parameter-bound rowids.
    const embedding = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) embedding[i] = Math.random();
    const embeddingBlob = new Uint8Array(
      embedding.buffer,
      embedding.byteOffset,
      embedding.byteLength
    );
    raw.prepare(
      `INSERT INTO memory_frames_vec (rowid, embedding) VALUES (1, ?)`
    ).run(embeddingBlob);

    const vecCountRow = raw
      .prepare('SELECT COUNT(*) as n FROM memory_frames_vec')
      .get() as { n: number };
    expect(vecCountRow.n).toBe(1);
  });

  it('runs migrations idempotently when reopening an existing database', () => {
    db!.close();
    db = new MindDB(dbPath);
    // No throw = migrations re-applied cleanly against existing schema.
    expect(db.getFirstRunAt()).not.toBeNull();
  });
});
