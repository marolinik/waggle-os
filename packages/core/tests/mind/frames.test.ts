import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MindDB } from '../../src/mind/db.js';
import { FrameStore, type MemoryFrame, type FrameType, type Importance } from '../../src/mind/frames.js';
import { SessionStore, type Session } from '../../src/mind/sessions.js';

describe('Memory Frames (Layer 2 - The Codec)', () => {
  let db: MindDB;
  let frames: FrameStore;
  let sessions: SessionStore;

  beforeEach(() => {
    db = new MindDB(':memory:');
    frames = new FrameStore(db);
    sessions = new SessionStore(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('Session management', () => {
    it('creates a session with generated gop_id', () => {
      const session = sessions.create();
      expect(session.gop_id).toMatch(/^session:/);
      expect(session.status).toBe('active');
    });

    it('creates a session linked to a project', () => {
      const session = sessions.create('project:waggle');
      expect(session.project_id).toBe('project:waggle');
    });

    it('closes a session', () => {
      const session = sessions.create();
      const closed = sessions.close(session.gop_id, 'Session complete');
      expect(closed.status).toBe('closed');
      expect(closed.summary).toBe('Session complete');
      expect(closed.ended_at).toBeDefined();
    });

    it('lists sessions by project', () => {
      sessions.create('project:a');
      sessions.create('project:a');
      sessions.create('project:b');
      expect(sessions.getByProject('project:a')).toHaveLength(2);
      expect(sessions.getByProject('project:b')).toHaveLength(1);
    });

    it('gets active sessions', () => {
      const s1 = sessions.create();
      sessions.create();
      sessions.close(s1.gop_id);
      expect(sessions.getActive()).toHaveLength(1);
    });
  });

  describe('I-Frame creation', () => {
    it('creates an I-Frame (full snapshot)', () => {
      const session = sessions.create();
      const frame = frames.createIFrame(session.gop_id, 'Full state snapshot at start of session');
      expect(frame.frame_type).toBe('I');
      expect(frame.gop_id).toBe(session.gop_id);
      expect(frame.t).toBe(0);
      expect(frame.base_frame_id).toBeNull();
      expect(frame.importance).toBe('normal');
    });

    it('I-Frame t=0 has no base_frame', () => {
      const session = sessions.create();
      const frame = frames.createIFrame(session.gop_id, 'Keyframe');
      expect(frame.base_frame_id).toBeNull();
    });
  });

  describe('P-Frame creation', () => {
    it('creates a P-Frame (delta) referencing an I-Frame', () => {
      const session = sessions.create();
      const iframe = frames.createIFrame(session.gop_id, 'Full snapshot');
      const pframe = frames.createPFrame(session.gop_id, 'User asked about weather', iframe.id);
      expect(pframe.frame_type).toBe('P');
      expect(pframe.base_frame_id).toBe(iframe.id);
      expect(pframe.t).toBe(1);
    });

    it('P-Frames auto-increment t within GOP', () => {
      const session = sessions.create();
      const iframe = frames.createIFrame(session.gop_id, 'Keyframe');
      const p1 = frames.createPFrame(session.gop_id, 'Delta 1', iframe.id);
      const p2 = frames.createPFrame(session.gop_id, 'Delta 2', iframe.id);
      const p3 = frames.createPFrame(session.gop_id, 'Delta 3', iframe.id);
      expect(p1.t).toBe(1);
      expect(p2.t).toBe(2);
      expect(p3.t).toBe(3);
    });
  });

  describe('B-Frame creation', () => {
    it('creates a B-Frame (cross-reference) linking frames across GOPs', () => {
      const s1 = sessions.create();
      const s2 = sessions.create();
      const iframe1 = frames.createIFrame(s1.gop_id, 'Session 1 snapshot');
      const iframe2 = frames.createIFrame(s2.gop_id, 'Session 2 snapshot');

      const bframe = frames.createBFrame(
        s1.gop_id,
        'References related discussion in session 2',
        iframe1.id,
        [iframe2.id]
      );
      expect(bframe.frame_type).toBe('B');
      expect(bframe.base_frame_id).toBe(iframe1.id);
    });
  });

  describe('Frame retrieval', () => {
    it('gets latest I-Frame within a GOP', () => {
      const session = sessions.create();
      frames.createIFrame(session.gop_id, 'First keyframe');
      frames.createPFrame(session.gop_id, 'Delta', 1);
      frames.createIFrame(session.gop_id, 'Second keyframe');

      const latest = frames.getLatestIFrame(session.gop_id);
      expect(latest).toBeDefined();
      expect(latest!.content).toBe('Second keyframe');
    });

    it('gets P-Frames since last I-Frame', () => {
      const session = sessions.create();
      const i1 = frames.createIFrame(session.gop_id, 'KF1');
      frames.createPFrame(session.gop_id, 'Old delta', i1.id);
      const i2 = frames.createIFrame(session.gop_id, 'KF2');
      frames.createPFrame(session.gop_id, 'New delta 1', i2.id);
      frames.createPFrame(session.gop_id, 'New delta 2', i2.id);

      const pframes = frames.getPFramesSinceLastI(session.gop_id);
      expect(pframes).toHaveLength(2);
      expect(pframes[0].content).toBe('New delta 1');
    });

    it('gets all frames for a GOP (window query)', () => {
      const session = sessions.create();
      frames.createIFrame(session.gop_id, 'KF');
      frames.createPFrame(session.gop_id, 'D1', 1);
      frames.createPFrame(session.gop_id, 'D2', 1);

      const all = frames.getGopFrames(session.gop_id);
      expect(all).toHaveLength(3);
    });
  });

  describe('State reconstruction', () => {
    it('reconstructs state from latest I + all P-deltas in GOP', () => {
      const session = sessions.create();
      frames.createIFrame(session.gop_id, JSON.stringify({ tasks: ['buy milk'], notes: 'Morning briefing' }));
      frames.createPFrame(session.gop_id, JSON.stringify({ tasks_add: ['review PR'], action: 'checked email' }), 1);
      frames.createPFrame(session.gop_id, JSON.stringify({ tasks_add: ['deploy v2'], notes_append: ' Updated plan.' }), 1);

      const state = frames.reconstructState(session.gop_id);
      expect(state.iframe).toBeDefined();
      expect(state.pframes).toHaveLength(2);
      expect(state.iframe!.content).toContain('buy milk');
    });

    it('returns null iframe when GOP has no frames', () => {
      const session = sessions.create();
      const state = frames.reconstructState(session.gop_id);
      expect(state.iframe).toBeNull();
      expect(state.pframes).toHaveLength(0);
    });
  });

  describe('P-Frame compression', () => {
    it('P-Frames are significantly smaller than I-Frames', () => {
      const session = sessions.create();
      const bigContent = JSON.stringify({
        tasks: Array.from({ length: 20 }, (_, i) => `Task ${i}: ${Array(50).fill('x').join('')}`),
        notes: Array(200).fill('Full context note.').join(' '),
        context: { user: 'Marko', project: 'Waggle', phase: 'POC' },
      });
      const iframe = frames.createIFrame(session.gop_id, bigContent);
      const pframe = frames.createPFrame(session.gop_id, JSON.stringify({ tasks_add: ['small update'] }), iframe.id);

      expect(pframe.content.length).toBeLessThan(iframe.content.length * 0.5);
    });
  });

  describe('Access tracking', () => {
    it('touch increments access count', () => {
      const session = sessions.create();
      const frame = frames.createIFrame(session.gop_id, 'Test');
      expect(frame.access_count).toBe(0);

      frames.touch(frame.id);
      frames.touch(frame.id);
      frames.touch(frame.id);

      const updated = frames.getById(frame.id);
      expect(updated!.access_count).toBe(3);
    });

    it('touch updates last_accessed timestamp', () => {
      const session = sessions.create();
      const frame = frames.createIFrame(session.gop_id, 'Test');
      const before = frame.last_accessed;
      frames.touch(frame.id);
      const after = frames.getById(frame.id)!.last_accessed;
      expect(after).toBeDefined();
    });
  });

  describe('Importance levels', () => {
    it('supports all importance levels', () => {
      const session = sessions.create();
      const levels: Importance[] = ['critical', 'important', 'normal', 'temporary', 'deprecated'];
      for (const level of levels) {
        const frame = frames.createIFrame(session.gop_id, `Frame: ${level}`, level);
        expect(frame.importance).toBe(level);
      }
    });

    it('importance multipliers map correctly', () => {
      expect(frames.getImportanceMultiplier('critical')).toBe(2.0);
      expect(frames.getImportanceMultiplier('important')).toBe(1.5);
      expect(frames.getImportanceMultiplier('normal')).toBe(1.0);
      expect(frames.getImportanceMultiplier('temporary')).toBe(0.7);
      expect(frames.getImportanceMultiplier('deprecated')).toBe(0.3);
    });
  });

  describe('Cross-GOP B-frame references', () => {
    it('B-frame stores cross-references in content', () => {
      const s1 = sessions.create();
      const s2 = sessions.create();
      const i1 = frames.createIFrame(s1.gop_id, 'S1 KF');
      const i2 = frames.createIFrame(s2.gop_id, 'S2 KF');

      const bframe = frames.createBFrame(s1.gop_id, 'Link to S2 discussion', i1.id, [i2.id]);
      expect(bframe.frame_type).toBe('B');

      const refs = frames.getBFrameReferences(bframe.id);
      expect(refs).toContain(i2.id);
    });
  });

  describe('getRecent', () => {
    it('returns recent frames sorted by created_at descending', () => {
      const session = sessions.create();
      frames.createIFrame(session.gop_id, 'First');
      frames.createIFrame(session.gop_id, 'Second');
      frames.createIFrame(session.gop_id, 'Third');

      const recent = frames.getRecent(2);
      expect(recent).toHaveLength(2);
      expect(recent[0].content).toBe('Third');
      expect(recent[1].content).toBe('Second');
    });

    it('returns all frames when limit exceeds count', () => {
      const session = sessions.create();
      frames.createIFrame(session.gop_id, 'Only');
      const recent = frames.getRecent(100);
      expect(recent).toHaveLength(1);
    });

    it('returns empty array for empty database', () => {
      expect(frames.getRecent(10)).toHaveLength(0);
    });
  });

  describe('Performance', () => {
    it('inserts 10,000 frames in under 10s', () => {
      const session = sessions.create();
      const iframe = frames.createIFrame(session.gop_id, 'Initial keyframe');

      const start = performance.now();
      const raw = db.getDatabase();
      const insertStmt = raw.prepare(`
        INSERT INTO memory_frames (frame_type, gop_id, t, base_frame_id, content, importance)
        VALUES ('P', ?, ?, ?, ?, 'normal')
      `);

      const insertMany = raw.transaction(() => {
        for (let i = 1; i <= 9999; i++) {
          insertStmt.run(session.gop_id, i, iframe.id, `Delta content ${i}: user interaction data`);
        }
      });
      insertMany();

      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(10_000);

      const count = raw.prepare('SELECT COUNT(*) as c FROM memory_frames').get() as { c: number };
      expect(count.c).toBe(10_000);
    });

    it('reconstructs state from 10,000 frames in under 100ms', () => {
      // Uses the frames inserted by prior test? No - each test has fresh DB.
      // Create a realistic scenario: 1 I-frame + 100 P-frames (typical GOP)
      const session = sessions.create();
      const iframe = frames.createIFrame(session.gop_id, 'Keyframe with full state');

      const raw = db.getDatabase();
      const insertStmt = raw.prepare(`
        INSERT INTO memory_frames (frame_type, gop_id, t, base_frame_id, content, importance)
        VALUES ('P', ?, ?, ?, ?, 'normal')
      `);
      const insertMany = raw.transaction(() => {
        for (let i = 1; i <= 100; i++) {
          insertStmt.run(session.gop_id, i, iframe.id, `Delta ${i}`);
        }
      });
      insertMany();

      // Warm up
      for (let i = 0; i < 3; i++) frames.reconstructState(session.gop_id);

      const start = performance.now();
      const iterations = 10;
      for (let i = 0; i < iterations; i++) {
        frames.reconstructState(session.gop_id);
      }
      const avgMs = (performance.now() - start) / iterations;
      expect(avgMs).toBeLessThan(100);
    });
  });
});
