import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { MindDB } from '../src/mind/db.js';
import { FrameStore } from '../src/mind/frames.js';
import { needsMigration, migrateToMultiMind } from '../src/migration.js';

describe('Migration: default.mind → personal.mind', () => {
  let tmpDir: string;

  function makeTmpDir(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-migration-'));
    return dir;
  }

  afterEach(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  describe('needsMigration', () => {
    it('returns true when default.mind exists and personal.mind does not', () => {
      tmpDir = makeTmpDir();
      // Create a real MindDB so it's a valid SQLite file
      const db = new MindDB(path.join(tmpDir, 'default.mind'));
      db.close();

      expect(needsMigration(tmpDir)).toBe(true);
    });

    it('returns false when personal.mind already exists', () => {
      tmpDir = makeTmpDir();
      // Both exist
      const db1 = new MindDB(path.join(tmpDir, 'default.mind'));
      db1.close();
      const db2 = new MindDB(path.join(tmpDir, 'personal.mind'));
      db2.close();

      expect(needsMigration(tmpDir)).toBe(false);
    });

    it('returns false on fresh install (nothing exists)', () => {
      tmpDir = makeTmpDir();
      expect(needsMigration(tmpDir)).toBe(false);
    });
  });

  describe('migrateToMultiMind', () => {
    it('migrates default.mind to personal.mind with data preserved', () => {
      tmpDir = makeTmpDir();
      const defaultPath = path.join(tmpDir, 'default.mind');

      // Create a MindDB with real data
      const db = new MindDB(defaultPath);
      // Create a session (foreign key requirement)
      db.getDatabase().prepare(
        "INSERT OR IGNORE INTO sessions (gop_id, status) VALUES (?, 'active')"
      ).run('test-gop');
      const frames = new FrameStore(db);
      frames.createIFrame('test-gop', 'migration test content', 'normal');
      db.close();

      const result = migrateToMultiMind(tmpDir);

      expect(result.migrated).toBe(true);
      expect(result.message).toBe('Migrated default.mind to personal.mind');

      // Verify personal.mind has the data
      const personalPath = path.join(tmpDir, 'personal.mind');
      expect(fs.existsSync(personalPath)).toBe(true);

      const personalDb = new MindDB(personalPath);
      const personalFrames = new FrameStore(personalDb);
      const state = personalFrames.reconstructState('test-gop');
      expect(state.iframe).not.toBeNull();
      expect(state.iframe!.content).toBe('migration test content');
      personalDb.close();
    });

    it('keeps default.mind as backup (.bak) after migration', () => {
      tmpDir = makeTmpDir();
      const db = new MindDB(path.join(tmpDir, 'default.mind'));
      db.close();

      migrateToMultiMind(tmpDir);

      expect(fs.existsSync(path.join(tmpDir, 'default.mind.bak'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, 'default.mind'))).toBe(false);
    });

    it('creates workspaces directory', () => {
      tmpDir = makeTmpDir();
      const db = new MindDB(path.join(tmpDir, 'default.mind'));
      db.close();

      migrateToMultiMind(tmpDir);

      const wsDir = path.join(tmpDir, 'workspaces');
      expect(fs.existsSync(wsDir)).toBe(true);
      expect(fs.statSync(wsDir).isDirectory()).toBe(true);
    });

    it('does not migrate twice (idempotent)', () => {
      tmpDir = makeTmpDir();
      const db = new MindDB(path.join(tmpDir, 'default.mind'));
      db.close();

      const first = migrateToMultiMind(tmpDir);
      expect(first.migrated).toBe(true);

      const second = migrateToMultiMind(tmpDir);
      expect(second.migrated).toBe(false);
      expect(second.message).toBe('No migration needed');
    });

    it('returns no migration needed when nothing exists', () => {
      tmpDir = makeTmpDir();
      const result = migrateToMultiMind(tmpDir);
      expect(result.migrated).toBe(false);
      expect(result.message).toBe('No migration needed');
    });
  });
});
