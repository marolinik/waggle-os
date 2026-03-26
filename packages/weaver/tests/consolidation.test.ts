import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MindDB, FrameStore, type Importance, SessionStore } from '@waggle/core';
import { MemoryWeaver } from '../src/consolidation.js';

describe('Memory Weaver (Consolidation)', () => {
  let db: MindDB;
  let frames: FrameStore;
  let sessions: SessionStore;
  let weaver: MemoryWeaver;

  beforeEach(() => {
    db = new MindDB(':memory:');
    frames = new FrameStore(db);
    sessions = new SessionStore(db);
    weaver = new MemoryWeaver(db, frames, sessions);
  });

  afterEach(() => {
    db.close();
  });

  describe('P-frame merging into consolidated I-frame', () => {
    it('merges P-frames into a new I-frame within a GOP', () => {
      const session = sessions.create();
      const iframe = frames.createIFrame(session.gop_id, JSON.stringify({ state: 'initial', items: ['a'] }));
      frames.createPFrame(session.gop_id, JSON.stringify({ added: 'b' }), iframe.id);
      frames.createPFrame(session.gop_id, JSON.stringify({ added: 'c' }), iframe.id);
      frames.createPFrame(session.gop_id, JSON.stringify({ added: 'd' }), iframe.id);

      const consolidated = weaver.consolidateGop(session.gop_id);
      expect(consolidated).toBeDefined();
      expect(consolidated!.frame_type).toBe('I');

      // Old P-frames should be marked deprecated
      const gopFrames = frames.getGopFrames(session.gop_id);
      const deprecated = gopFrames.filter(f => f.importance === 'deprecated' && f.frame_type === 'P');
      expect(deprecated).toHaveLength(3);
    });

    it('skips consolidation if no P-frames exist', () => {
      const session = sessions.create();
      frames.createIFrame(session.gop_id, 'Just a keyframe');
      const result = weaver.consolidateGop(session.gop_id);
      expect(result).toBeNull();
    });

    it('consolidated I-frame contains merged content', () => {
      const session = sessions.create();
      const iframe = frames.createIFrame(session.gop_id, 'Base state');
      frames.createPFrame(session.gop_id, 'Delta 1: user asked about weather', iframe.id);
      frames.createPFrame(session.gop_id, 'Delta 2: showed forecast', iframe.id);

      const consolidated = weaver.consolidateGop(session.gop_id);
      expect(consolidated!.content).toContain('Base state');
      expect(consolidated!.content).toContain('Delta 1');
      expect(consolidated!.content).toContain('Delta 2');
    });
  });

  describe('Decay: remove deprecated frames', () => {
    it('removes deprecated frames with zero access', () => {
      const session = sessions.create();
      frames.createIFrame(session.gop_id, 'Active frame', 'normal');
      frames.createIFrame(session.gop_id, 'Deprecated unused', 'deprecated');
      frames.createIFrame(session.gop_id, 'Deprecated but accessed', 'deprecated');

      // Touch the third frame to give it accesses
      const gopFrames = frames.getGopFrames(session.gop_id);
      const accessedFrame = gopFrames[2];
      frames.touch(accessedFrame.id);
      frames.touch(accessedFrame.id);

      const removed = weaver.decayFrames();
      expect(removed).toBe(1); // Only the zero-access deprecated frame
    });

    it('does not remove non-deprecated frames', () => {
      const session = sessions.create();
      frames.createIFrame(session.gop_id, 'Normal frame', 'normal');
      frames.createIFrame(session.gop_id, 'Temporary frame', 'temporary');

      const removed = weaver.decayFrames();
      expect(removed).toBe(0);
    });
  });

  describe('Strengthen: upgrade frequently accessed frames', () => {
    it('upgrades temporary frames to normal after threshold accesses', () => {
      const session = sessions.create();
      const frame = frames.createIFrame(session.gop_id, 'Getting popular', 'temporary');

      // Simulate many accesses
      for (let i = 0; i < 10; i++) frames.touch(frame.id);

      const upgraded = weaver.strengthenFrames(10);
      expect(upgraded).toBe(1);

      const updated = frames.getById(frame.id);
      expect(updated!.importance).toBe('normal');
    });

    it('upgrades normal frames to important after higher threshold', () => {
      const session = sessions.create();
      const frame = frames.createIFrame(session.gop_id, 'Very popular', 'normal');

      for (let i = 0; i < 25; i++) frames.touch(frame.id);

      const upgraded = weaver.strengthenFrames(10, 25);
      expect(upgraded).toBe(1);

      const updated = frames.getById(frame.id);
      expect(updated!.importance).toBe('important');
    });

    it('does not upgrade already critical frames', () => {
      const session = sessions.create();
      const frame = frames.createIFrame(session.gop_id, 'Already critical', 'critical');
      for (let i = 0; i < 50; i++) frames.touch(frame.id);

      const upgraded = weaver.strengthenFrames(10);
      expect(upgraded).toBe(0);
    });
  });

  describe('Daily summary', () => {
    it('creates a compressed I-frame from day activity', () => {
      const session = sessions.create('project:daily');
      const iframe = frames.createIFrame(session.gop_id, 'Morning start');
      frames.createPFrame(session.gop_id, 'Checked emails', iframe.id);
      frames.createPFrame(session.gop_id, 'Had meeting with team', iframe.id);
      frames.createPFrame(session.gop_id, 'Reviewed PRs', iframe.id);
      frames.createPFrame(session.gop_id, 'Deployed v2.1', iframe.id);

      const summary = weaver.createDailySummary([session.gop_id]);
      expect(summary).toBeDefined();
      expect(summary!.frame_type).toBe('I');
      expect(summary!.importance).toBe('important');
      expect(summary!.content).toContain('Morning start');
    });

    it('returns null when no sessions provided', () => {
      const summary = weaver.createDailySummary([]);
      expect(summary).toBeNull();
    });
  });

  describe('Session archival', () => {
    it('closes and archives old sessions', () => {
      const s1 = sessions.create();
      const s2 = sessions.create();
      frames.createIFrame(s1.gop_id, 'S1 content');
      frames.createIFrame(s2.gop_id, 'S2 content');

      // Close s1
      sessions.close(s1.gop_id, 'Done');

      const archived = weaver.archiveClosedSessions();
      expect(archived).toBe(1);

      const s1Updated = sessions.getByGopId(s1.gop_id);
      expect(s1Updated!.status).toBe('archived');
    });

    it('does not archive active sessions', () => {
      sessions.create();
      const archived = weaver.archiveClosedSessions();
      expect(archived).toBe(0);
    });
  });

  describe('Cross-GOP consolidation', () => {
    it('merges related GOPs from same project', () => {
      const s1 = sessions.create('project:waggle');
      const s2 = sessions.create('project:waggle');

      frames.createIFrame(s1.gop_id, 'Session 1: Designed the schema');
      frames.createIFrame(s2.gop_id, 'Session 2: Implemented the schema');

      sessions.close(s1.gop_id, 'Schema design complete');
      sessions.close(s2.gop_id, 'Schema implementation complete');

      const merged = weaver.consolidateProject('project:waggle');
      expect(merged).toBeDefined();
      expect(merged!.content).toContain('Session 1');
      expect(merged!.content).toContain('Session 2');
    });

    it('returns null for project with no closed sessions', () => {
      sessions.create('project:empty');
      const merged = weaver.consolidateProject('project:empty');
      expect(merged).toBeNull();
    });
  });

  describe('Session distillation', () => {
    it('creates a durable memory frame from session summary and key points', () => {
      const frame = weaver.distillSessionContent(
        '2026-03-10',
        'Discussed Q2 marketing strategy',
        ['decided to focus on social media', 'agreed on $50k budget']
      );

      expect(frame).toBeDefined();
      expect(frame.frame_type).toBe('I');
      expect(frame.importance).toBe('important');
      expect(frame.content).toContain('Session (2026-03-10)');
      expect(frame.content).toContain('Discussed Q2 marketing strategy');
      expect(frame.content).toContain('decided to focus on social media');
      expect(frame.content).toContain('agreed on $50k budget');
    });

    it('creates a frame even without key points', () => {
      const frame = weaver.distillSessionContent(
        '2026-03-11',
        'Quick check-in about project status',
        []
      );

      expect(frame).toBeDefined();
      expect(frame.content).toContain('Session (2026-03-11)');
      expect(frame.content).toContain('Quick check-in about project status');
      expect(frame.content).not.toContain('Key points');
    });

    it('distilled frames are marked important (survive decay)', () => {
      const frame = weaver.distillSessionContent(
        '2026-03-10',
        'Important strategic discussion',
        ['decided to pivot to enterprise']
      );

      // Run decay — important frames should NOT be affected
      weaver.decayByAge(0, 0); // aggressive decay
      const afterDecay = frames.getById(frame.id);
      expect(afterDecay).toBeDefined();
      expect(afterDecay!.importance).toBe('important');
    });
  });
});
