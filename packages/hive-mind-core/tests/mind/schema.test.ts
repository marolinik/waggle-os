import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MindDB } from '../../src/mind/db.js';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('.mind SQLite Schema', () => {
  let db: MindDB;
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `waggle-test-${Date.now()}.mind`);
    db = new MindDB(dbPath);
  });

  afterEach(() => {
    db.close();
    try {
      if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    } catch {
      // Windows: file may still be locked briefly after close
    }
  });

  it('creates a single portable file on disk', () => {
    expect(fs.existsSync(dbPath)).toBe(true);
  });

  it('creates identity table (Layer 0)', () => {
    const cols = getColumns(db, 'identity');
    expect(cols).toContainEqual(expect.objectContaining({ name: 'id' }));
    expect(cols).toContainEqual(expect.objectContaining({ name: 'name' }));
    expect(cols).toContainEqual(expect.objectContaining({ name: 'role' }));
    expect(cols).toContainEqual(expect.objectContaining({ name: 'department' }));
    expect(cols).toContainEqual(expect.objectContaining({ name: 'personality' }));
    expect(cols).toContainEqual(expect.objectContaining({ name: 'capabilities' }));
    expect(cols).toContainEqual(expect.objectContaining({ name: 'system_prompt' }));
    expect(cols).toContainEqual(expect.objectContaining({ name: 'created_at' }));
    expect(cols).toContainEqual(expect.objectContaining({ name: 'updated_at' }));
  });

  it('creates awareness table (Layer 1)', () => {
    const cols = getColumns(db, 'awareness');
    expect(cols).toContainEqual(expect.objectContaining({ name: 'id' }));
    expect(cols).toContainEqual(expect.objectContaining({ name: 'category' }));
    expect(cols).toContainEqual(expect.objectContaining({ name: 'content' }));
    expect(cols).toContainEqual(expect.objectContaining({ name: 'priority' }));
    expect(cols).toContainEqual(expect.objectContaining({ name: 'created_at' }));
    expect(cols).toContainEqual(expect.objectContaining({ name: 'expires_at' }));
  });

  it('creates sessions table', () => {
    const cols = getColumns(db, 'sessions');
    expect(cols).toContainEqual(expect.objectContaining({ name: 'id' }));
    expect(cols).toContainEqual(expect.objectContaining({ name: 'gop_id' }));
    expect(cols).toContainEqual(expect.objectContaining({ name: 'project_id' }));
    expect(cols).toContainEqual(expect.objectContaining({ name: 'status' }));
    expect(cols).toContainEqual(expect.objectContaining({ name: 'started_at' }));
    expect(cols).toContainEqual(expect.objectContaining({ name: 'ended_at' }));
    expect(cols).toContainEqual(expect.objectContaining({ name: 'summary' }));
  });

  it('enforces session status CHECK constraint', () => {
    const raw = db.getDatabase();
    raw.prepare(`INSERT INTO sessions (gop_id, project_id, status, started_at)
      VALUES ('gop:test', NULL, 'active', datetime('now'))`).run();
    expect(() => {
      raw.prepare(`INSERT INTO sessions (gop_id, project_id, status, started_at)
        VALUES ('gop:bad', NULL, 'invalid_status', datetime('now'))`).run();
    }).toThrow();
  });

  it('creates memory_frames table (Layer 2)', () => {
    const cols = getColumns(db, 'memory_frames');
    expect(cols).toContainEqual(expect.objectContaining({ name: 'id' }));
    expect(cols).toContainEqual(expect.objectContaining({ name: 'frame_type' }));
    expect(cols).toContainEqual(expect.objectContaining({ name: 'gop_id' }));
    expect(cols).toContainEqual(expect.objectContaining({ name: 't' }));
    expect(cols).toContainEqual(expect.objectContaining({ name: 'base_frame_id' }));
    expect(cols).toContainEqual(expect.objectContaining({ name: 'content' }));
    expect(cols).toContainEqual(expect.objectContaining({ name: 'importance' }));
    expect(cols).toContainEqual(expect.objectContaining({ name: 'access_count' }));
    expect(cols).toContainEqual(expect.objectContaining({ name: 'created_at' }));
    expect(cols).toContainEqual(expect.objectContaining({ name: 'last_accessed' }));
  });

  it('enforces frame_type CHECK constraint (I, P, B)', () => {
    const raw = db.getDatabase();
    // Valid types should work
    raw.prepare(`INSERT INTO sessions (gop_id, status, started_at) VALUES ('gop:t1', 'active', datetime('now'))`).run();
    raw.prepare(`INSERT INTO memory_frames (frame_type, gop_id, t, content, importance)
      VALUES ('I', 'gop:t1', 0, 'test', 'normal')`).run();
    raw.prepare(`INSERT INTO memory_frames (frame_type, gop_id, t, content, importance)
      VALUES ('P', 'gop:t1', 1, 'delta', 'normal')`).run();
    raw.prepare(`INSERT INTO memory_frames (frame_type, gop_id, t, content, importance)
      VALUES ('B', 'gop:t1', 2, 'xref', 'normal')`).run();
    // Invalid type should fail
    expect(() => {
      raw.prepare(`INSERT INTO memory_frames (frame_type, gop_id, t, content, importance)
        VALUES ('X', 'gop:t1', 3, 'bad', 'normal')`).run();
    }).toThrow();
  });

  it('enforces importance CHECK constraint', () => {
    const raw = db.getDatabase();
    raw.prepare(`INSERT INTO sessions (gop_id, status, started_at) VALUES ('gop:imp', 'active', datetime('now'))`).run();
    for (const level of ['critical', 'important', 'normal', 'temporary', 'deprecated']) {
      raw.prepare(`INSERT INTO memory_frames (frame_type, gop_id, t, content, importance)
        VALUES ('I', 'gop:imp', 0, 'test-${level}', ?)`).run(level);
    }
    expect(() => {
      raw.prepare(`INSERT INTO memory_frames (frame_type, gop_id, t, content, importance)
        VALUES ('I', 'gop:imp', 0, 'bad', 'invalid_importance')`).run();
    }).toThrow();
  });

  it('creates FTS5 virtual table for memory search', () => {
    const raw = db.getDatabase();
    const tables = raw.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='memory_frames_fts'"
    ).get() as { name: string } | undefined;
    expect(tables).toBeDefined();
    expect(tables!.name).toBe('memory_frames_fts');
  });

  it('creates sqlite-vec virtual table for embeddings', () => {
    const raw = db.getDatabase();
    const tables = raw.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='memory_frames_vec'"
    ).get() as { name: string } | undefined;
    expect(tables).toBeDefined();
    expect(tables!.name).toBe('memory_frames_vec');
  });

  it('creates knowledge_entities table (Layer 3)', () => {
    const cols = getColumns(db, 'knowledge_entities');
    expect(cols).toContainEqual(expect.objectContaining({ name: 'id' }));
    expect(cols).toContainEqual(expect.objectContaining({ name: 'entity_type' }));
    expect(cols).toContainEqual(expect.objectContaining({ name: 'name' }));
    expect(cols).toContainEqual(expect.objectContaining({ name: 'properties' }));
    expect(cols).toContainEqual(expect.objectContaining({ name: 'valid_from' }));
    expect(cols).toContainEqual(expect.objectContaining({ name: 'valid_to' }));
    expect(cols).toContainEqual(expect.objectContaining({ name: 'recorded_at' }));
  });

  it('creates knowledge_relations table (Layer 3)', () => {
    const cols = getColumns(db, 'knowledge_relations');
    expect(cols).toContainEqual(expect.objectContaining({ name: 'id' }));
    expect(cols).toContainEqual(expect.objectContaining({ name: 'source_id' }));
    expect(cols).toContainEqual(expect.objectContaining({ name: 'target_id' }));
    expect(cols).toContainEqual(expect.objectContaining({ name: 'relation_type' }));
    expect(cols).toContainEqual(expect.objectContaining({ name: 'confidence' }));
    expect(cols).toContainEqual(expect.objectContaining({ name: 'properties' }));
    expect(cols).toContainEqual(expect.objectContaining({ name: 'valid_from' }));
    expect(cols).toContainEqual(expect.objectContaining({ name: 'valid_to' }));
    expect(cols).toContainEqual(expect.objectContaining({ name: 'recorded_at' }));
  });

  it('creates procedures table (Layer 4)', () => {
    const cols = getColumns(db, 'procedures');
    expect(cols).toContainEqual(expect.objectContaining({ name: 'id' }));
    expect(cols).toContainEqual(expect.objectContaining({ name: 'name' }));
    expect(cols).toContainEqual(expect.objectContaining({ name: 'model' }));
    expect(cols).toContainEqual(expect.objectContaining({ name: 'template' }));
    expect(cols).toContainEqual(expect.objectContaining({ name: 'version' }));
    expect(cols).toContainEqual(expect.objectContaining({ name: 'success_rate' }));
    expect(cols).toContainEqual(expect.objectContaining({ name: 'avg_cost' }));
    expect(cols).toContainEqual(expect.objectContaining({ name: 'created_at' }));
    expect(cols).toContainEqual(expect.objectContaining({ name: 'updated_at' }));
  });

  it('creates meta table with schema version', () => {
    const raw = db.getDatabase();
    const row = raw.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get() as { value: string };
    expect(row).toBeDefined();
    expect(row.value).toBe('1');
  });

  it('creates GOP indexes for fast window queries', () => {
    const raw = db.getDatabase();
    const indexes = raw.prepare(
      "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_frames_%'"
    ).all() as { name: string }[];
    const names = indexes.map(i => i.name);
    expect(names).toContain('idx_frames_gop_t');
    expect(names).toContain('idx_frames_type');
    expect(names).toContain('idx_frames_base');
  });

  it('creates session index for project queries', () => {
    const raw = db.getDatabase();
    const idx = raw.prepare(
      "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_sessions_project'"
    ).get() as { name: string } | undefined;
    expect(idx).toBeDefined();
  });

  it('can open an existing .mind file without recreating schema', () => {
    const raw = db.getDatabase();
    raw.prepare("INSERT INTO meta (key, value) VALUES ('test_key', 'test_value')").run();
    db.close();

    const db2 = new MindDB(dbPath);
    const row = db2.getDatabase().prepare("SELECT value FROM meta WHERE key = 'test_key'").get() as { value: string };
    expect(row.value).toBe('test_value');
    db2.close();

    // Reopen for afterEach cleanup
    db = new MindDB(dbPath);
  });

  it('supports in-memory database for testing', () => {
    const memDb = new MindDB(':memory:');
    const cols = getColumns(memDb, 'identity');
    expect(cols.length).toBeGreaterThan(0);
    memDb.close();
  });
});

function getColumns(db: MindDB, table: string) {
  return db.getDatabase().prepare(`PRAGMA table_info('${table}')`).all() as Array<{
    cid: number;
    name: string;
    type: string;
    notnull: number;
    dflt_value: string | null;
    pk: number;
  }>;
}
