import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MindDB } from '../../src/mind/db.js';
import { SessionStore } from '../../src/mind/sessions.js';

describe('SessionStore', () => {
  let db: MindDB;
  let sessions: SessionStore;

  beforeEach(() => {
    db = new MindDB(':memory:');
    sessions = new SessionStore(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('ensureActive (review #7 — session-create race in autoSaveFromExchange)', () => {
    it('creates a new active session when none exists', () => {
      expect(sessions.getActive()).toHaveLength(0);

      const result = sessions.ensureActive();
      expect(result.status).toBe('active');
      expect(result.gop_id).toMatch(/^session:/);
      expect(sessions.getActive()).toHaveLength(1);
    });

    it('returns the existing active session when one exists', () => {
      const first = sessions.ensureActive();
      const second = sessions.ensureActive();
      const third = sessions.ensureActive();

      // All three calls return the same session — never a duplicate.
      expect(second.id).toBe(first.id);
      expect(third.id).toBe(first.id);
      expect(sessions.getActive()).toHaveLength(1);
    });

    it('returns the most-recent active session when multiple are open', () => {
      const older = sessions.create();
      // Force a tiny time gap so started_at differs measurably
      const newer = sessions.create();

      const result = sessions.ensureActive();
      // Most-recent (newer) wins — matches getActive() ordering contract
      expect(result.id).toBe(newer.id);
      expect(result.id).not.toBe(older.id);
    });

    it('does not resurrect closed or archived sessions', () => {
      const s = sessions.create();
      sessions.close(s.gop_id);

      // No active session now — ensureActive should create a fresh one
      const ensured = sessions.ensureActive();
      expect(ensured.id).not.toBe(s.id);
      expect(ensured.status).toBe('active');
    });

    it('preserves project_id when provided', () => {
      const result = sessions.ensureActive('my-project');
      expect(result.project_id).toBe('my-project');
    });
  });
});
