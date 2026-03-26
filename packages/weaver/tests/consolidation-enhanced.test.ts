import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MindDB, FrameStore, SessionStore, KnowledgeGraph } from '@waggle/core';
import { MemoryWeaver } from '../src/consolidation.js';

describe('Enhanced Memory Consolidation', () => {
  let db: MindDB;
  let frames: FrameStore;
  let sessions: SessionStore;
  let kg: KnowledgeGraph;
  let weaver: MemoryWeaver;

  beforeEach(() => {
    db = new MindDB(':memory:');
    frames = new FrameStore(db);
    sessions = new SessionStore(db);
    kg = new KnowledgeGraph(db);
    weaver = new MemoryWeaver(db, frames, sessions);
  });

  afterEach(() => {
    db.close();
  });

  describe('decayByAge — time-based decay', () => {
    it('deprecates temporary frames older than maxAgeDays with low access', () => {
      const session = sessions.create();
      const raw = db.getDatabase();

      // Create a temporary frame and backdate it to 45 days ago
      const oldFrame = frames.createIFrame(session.gop_id, 'Old temporary note', 'temporary');
      raw.prepare(
        "UPDATE memory_frames SET created_at = datetime('now', '-45 days') WHERE id = ?"
      ).run(oldFrame.id);

      // Create a recent temporary frame (should NOT be deprecated)
      frames.createIFrame(session.gop_id, 'Recent temporary note', 'temporary');

      // Create an old normal frame (should NOT be deprecated — wrong importance)
      const normalFrame = frames.createIFrame(session.gop_id, 'Old normal note', 'normal');
      raw.prepare(
        "UPDATE memory_frames SET created_at = datetime('now', '-45 days') WHERE id = ?"
      ).run(normalFrame.id);

      const deprecated = weaver.decayByAge(30);
      expect(deprecated).toBe(1);

      // Verify the old temporary frame is now deprecated
      const updated = frames.getById(oldFrame.id);
      expect(updated!.importance).toBe('deprecated');

      // Verify the recent temporary frame is still temporary
      const allFrames = frames.getGopFrames(session.gop_id);
      const stillTemp = allFrames.filter(f => f.importance === 'temporary');
      expect(stillTemp).toHaveLength(1);
      expect(stillTemp[0].content).toBe('Recent temporary note');
    });

    it('does not deprecate old temporary frames with high access count', () => {
      const session = sessions.create();
      const raw = db.getDatabase();

      const frame = frames.createIFrame(session.gop_id, 'Frequently accessed old temp', 'temporary');
      raw.prepare(
        "UPDATE memory_frames SET created_at = datetime('now', '-45 days') WHERE id = ?"
      ).run(frame.id);

      // Give it many accesses
      for (let i = 0; i < 5; i++) frames.touch(frame.id);

      const deprecated = weaver.decayByAge(30);
      expect(deprecated).toBe(0);

      const updated = frames.getById(frame.id);
      expect(updated!.importance).toBe('temporary');
    });

    it('returns 0 when no frames match criteria', () => {
      const session = sessions.create();
      frames.createIFrame(session.gop_id, 'Normal frame', 'normal');
      frames.createIFrame(session.gop_id, 'Important frame', 'important');

      const deprecated = weaver.decayByAge(30);
      expect(deprecated).toBe(0);
    });
  });

  describe('linkRelatedFrames — entity-aware linking', () => {
    it('creates B-frames linking frames that share entities', () => {
      const s1 = sessions.create('project:test');
      const s2 = sessions.create('project:test');

      // Create frames mentioning the same entity
      frames.createIFrame(s1.gop_id, 'Working on the React frontend today');
      frames.createIFrame(s2.gop_id, 'React component performance optimization');

      // Create an entity in the knowledge graph
      kg.createEntity('technology', 'React', { category: 'frontend' });

      const linked = weaver.linkRelatedFrames(kg);
      expect(linked).toBe(1);

      // Verify a B-frame was created
      const gopFrames = frames.getGopFrames(s1.gop_id);
      const bframes = gopFrames.filter(f => f.frame_type === 'B');
      expect(bframes).toHaveLength(1);

      // Verify B-frame content references the shared entity
      const parsed = JSON.parse(bframes[0].content);
      expect(parsed.description).toContain('React');
      expect(parsed.references).toHaveLength(1);
    });

    it('does not create B-frames when no shared entities exist', () => {
      const s1 = sessions.create('project:test');
      const s2 = sessions.create('project:test');

      frames.createIFrame(s1.gop_id, 'Working on the frontend');
      frames.createIFrame(s2.gop_id, 'Backend database migration');

      kg.createEntity('technology', 'React', { category: 'frontend' });

      // Only one frame mentions React, so no link should be created
      const linked = weaver.linkRelatedFrames(kg);
      expect(linked).toBe(0);
    });

    it('handles multiple shared entities without duplicate B-frames', () => {
      const s1 = sessions.create('project:test');
      const s2 = sessions.create('project:test');

      // Both frames mention React and TypeScript
      frames.createIFrame(s1.gop_id, 'Building React components with TypeScript');
      frames.createIFrame(s2.gop_id, 'React + TypeScript best practices');

      kg.createEntity('technology', 'React', {});
      kg.createEntity('technology', 'TypeScript', {});

      const linked = weaver.linkRelatedFrames(kg);
      // Only 1 B-frame for the pair, not 2 (one per entity)
      expect(linked).toBe(1);
    });

    it('returns 0 when no entities exist in the knowledge graph', () => {
      const session = sessions.create();
      frames.createIFrame(session.gop_id, 'Some content');

      const linked = weaver.linkRelatedFrames(kg);
      expect(linked).toBe(0);
    });

    it('links three frames sharing an entity with correct B-frame count', () => {
      const s1 = sessions.create('project:multi');
      const s2 = sessions.create('project:multi');
      const s3 = sessions.create('project:multi');

      frames.createIFrame(s1.gop_id, 'SQLite schema design');
      frames.createIFrame(s2.gop_id, 'SQLite performance tuning');
      frames.createIFrame(s3.gop_id, 'SQLite backup strategy');

      kg.createEntity('technology', 'SQLite', {});

      const linked = weaver.linkRelatedFrames(kg);
      // 3 frames → 3 pairs: (1,2), (1,3), (2,3)
      expect(linked).toBe(3);
    });
  });
});
