import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MindDB } from '../../src/mind/db.js';

describe('raw_archive schema', () => {
  let db: MindDB;
  beforeEach(() => { db = new MindDB(':memory:'); });
  afterEach(() => { db.close(); });

  it('creates the raw_archive table with the expected columns', () => {
    const raw = db.getDatabase();
    const cols = (raw.prepare("PRAGMA table_info('raw_archive')").all() as { name: string }[])
      .map(c => c.name);
    expect(cols).toEqual(expect.arrayContaining([
      'id', 'archive_uid', 'source', 'source_ref', 'title', 'content',
      'content_sha256', 'injection_flagged', 'injection_flags', 'source_timestamp', 'created_at',
    ]));
  });

  it('rejects UPDATE and DELETE (append-only triggers)', () => {
    const raw = db.getDatabase();
    raw.prepare(
      `INSERT INTO raw_archive (archive_uid, source, content, content_sha256)
       VALUES ('uid1', 'claude', 'hello', 'uid1')`
    ).run();
    expect(() => raw.prepare("UPDATE raw_archive SET content = 'x' WHERE archive_uid = 'uid1'").run())
      .toThrow(/append-only/);
    expect(() => raw.prepare("DELETE FROM raw_archive WHERE archive_uid = 'uid1'").run())
      .toThrow(/append-only/);
  });
});
