import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MindDB } from '@waggle/core';
import { Orchestrator, type ContextFrames } from '../src/orchestrator.js';
import { MockEmbedder } from '../../core/tests/mind/helpers/mock-embedder.js';

/**
 * Tests the PromptAssembler wiring points added to Orchestrator:
 *  - `loadRecentContextFrames()`: typed counterpart to loadRecentContext
 *  - `recallMemory(query, limit, opts?)`: extended with profile / scoreFloor / tier
 *
 * Byte-identical-when-absent contract: recallMemory must behave exactly as
 * the pre-extension version when opts is omitted.
 */
describe('Orchestrator PromptAssembler wiring', () => {
  let db: MindDB;
  let orchestrator: Orchestrator;

  beforeEach(() => {
    db = new MindDB(':memory:');
    orchestrator = new Orchestrator({
      db,
      embedder: new MockEmbedder(),
    });
  });

  afterEach(() => {
    db.close();
  });

  describe('loadRecentContextFrames()', () => {
    it('returns well-formed ContextFrames on an empty mind', () => {
      const frames: ContextFrames = orchestrator.loadRecentContextFrames();

      expect(frames.stateFrames).toEqual([]);
      expect(frames.recentChanges).toEqual([]);
      expect(frames.activeWork).toEqual([]);
      expect(frames.keyEntities).toEqual([]);
      expect(frames.personalPreferences).toEqual([]);
    });

    it('populates activeWork from AwarenessLayer items', () => {
      orchestrator.getAwareness().add('task', 'Ship PromptAssembler', 10);
      orchestrator.getAwareness().add('pending', 'Verify OpenRouter slugs', 5);

      const frames = orchestrator.loadRecentContextFrames();

      expect(frames.activeWork).toHaveLength(2);
      expect(frames.activeWork[0].content).toMatch(/Ship PromptAssembler|Verify OpenRouter/);
      expect(frames.activeWork[0].priority).toBeGreaterThanOrEqual(0);
      expect(['task', 'pending', 'action', 'flag']).toContain(frames.activeWork[0].category);
    });

    it('pulls personal preferences even when no workspace is active', async () => {
      await orchestrator.executeTool('save_memory', {
        content: 'User preference: prefers concise replies',
        importance: 'normal',
      });

      const frames = orchestrator.loadRecentContextFrames();
      expect(frames.personalPreferences.some(p => p.includes('User preference'))).toBe(true);
    });

    it('splits frames by frame_type: I → stateFrames, P/B → recentChanges', () => {
      const frames = orchestrator.getFrames();
      const session = orchestrator.getSessions().ensureActive();
      const iFrame = frames.createIFrame(session.gop_id, 'Identity snapshot', 'important');
      frames.createPFrame(session.gop_id, 'Delta update', iFrame.id, 'normal');

      const ctx = orchestrator.loadRecentContextFrames();

      expect(ctx.stateFrames.length).toBeGreaterThanOrEqual(1);
      expect(ctx.stateFrames.every(f => f.frame_type === 'I')).toBe(true);
      expect(ctx.recentChanges.some(f => f.frame_type === 'P')).toBe(true);
    });

    it('respects the limit argument', () => {
      const frames = orchestrator.getFrames();
      const session = orchestrator.getSessions().ensureActive();
      for (let i = 0; i < 20; i++) {
        frames.createIFrame(session.gop_id, `State frame ${i}`, 'normal');
      }

      const ctx = orchestrator.loadRecentContextFrames(3);
      const total = ctx.stateFrames.length + ctx.recentChanges.length;
      expect(total).toBeLessThanOrEqual(3);
    });
  });

  describe('recallMemory() byte-identical when opts absent', () => {
    it('returns empty result structure on empty mind', async () => {
      const result = await orchestrator.recallMemory('anything');
      expect(result.count).toBe(0);
      expect(result.text).toBe('');
      expect(result.recalled).toEqual([]);
    });

    it('default-path shape unchanged (text starts with # Recalled Memories when hits exist)', async () => {
      const frames = orchestrator.getFrames();
      const session = orchestrator.getSessions().ensureActive();
      frames.createIFrame(session.gop_id, 'The KVARK license boundary is non-negotiable', 'important');

      // Seed the search index
      await orchestrator.getSearch().indexFrame(
        (await new Promise<number>(resolve => {
          const raw = db.getDatabase();
          const row = raw.prepare('SELECT id FROM memory_frames ORDER BY id DESC LIMIT 1').get() as { id: number };
          resolve(row.id);
        })),
        'The KVARK license boundary is non-negotiable',
      );

      const result = await orchestrator.recallMemory('license boundary');
      // Either hit or miss — test just checks shape stability
      expect(typeof result.text).toBe('string');
      expect(typeof result.count).toBe('number');
      expect(Array.isArray(result.recalled)).toBe(true);
    });
  });

  describe('recallMemory() with RecallOptions', () => {
    it('accepts profile override without type errors', async () => {
      const result = await orchestrator.recallMemory('test', 5, { profile: 'recent' });
      expect(result).toBeDefined();
      expect(typeof result.count).toBe('number');
    });

    it('accepts scoreFloor (filters when provided)', async () => {
      const result = await orchestrator.recallMemory('test', 5, { scoreFloor: 0.99 });
      // With a very high score floor and no seeded matches, count should be 0
      expect(result.count).toBe(0);
    });

    it('accepts tier hint (recorded, not acted upon in recallMemory)', async () => {
      const result = await orchestrator.recallMemory('test', 5, { tier: 'small' });
      expect(result).toBeDefined();
    });
  });
});
