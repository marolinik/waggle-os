import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MindDB } from '../../src/mind/db.js';
import { AwarenessLayer, type AwarenessItem, type AwarenessCategory } from '../../src/mind/awareness.js';

describe('Awareness Layer (Layer 1)', () => {
  let db: MindDB;
  let awareness: AwarenessLayer;

  beforeEach(() => {
    db = new MindDB(':memory:');
    awareness = new AwarenessLayer(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('CRUD operations', () => {
    it('adds an active task', () => {
      const item = awareness.add('task', 'Review pull request #42', 5);
      expect(item.id).toBeDefined();
      expect(item.category).toBe('task');
      expect(item.content).toBe('Review pull request #42');
      expect(item.priority).toBe(5);
    });

    it('adds a recent action', () => {
      const item = awareness.add('action', 'Sent email to team');
      expect(item.category).toBe('action');
      expect(item.priority).toBe(0); // default
    });

    it('adds a pending item', () => {
      const item = awareness.add('pending', 'Waiting for API response');
      expect(item.category).toBe('pending');
    });

    it('adds a context flag', () => {
      const item = awareness.add('flag', 'user_prefers_dark_mode');
      expect(item.category).toBe('flag');
    });

    it('removes an item by id', () => {
      const item = awareness.add('task', 'Delete me');
      awareness.remove(item.id);
      const all = awareness.getAll();
      expect(all).toHaveLength(0);
    });

    it('updates an item', () => {
      const item = awareness.add('task', 'Original', 1);
      const updated = awareness.update(item.id, { content: 'Updated', priority: 10 });
      expect(updated.content).toBe('Updated');
      expect(updated.priority).toBe(10);
    });
  });

  describe('retrieval', () => {
    it('returns items ordered by priority (highest first)', () => {
      awareness.add('task', 'Low priority', 1);
      awareness.add('task', 'High priority', 10);
      awareness.add('task', 'Medium priority', 5);

      const items = awareness.getAll();
      expect(items[0].content).toBe('High priority');
      expect(items[1].content).toBe('Medium priority');
      expect(items[2].content).toBe('Low priority');
    });

    it('filters by category', () => {
      awareness.add('task', 'Task 1');
      awareness.add('action', 'Action 1');
      awareness.add('flag', 'Flag 1');

      const tasks = awareness.getByCategory('task');
      expect(tasks).toHaveLength(1);
      expect(tasks[0].category).toBe('task');
    });

    it('limits to 10 items per the spec', () => {
      for (let i = 0; i < 15; i++) {
        awareness.add('task', `Task ${i}`, i);
      }
      const items = awareness.getAll();
      expect(items).toHaveLength(10);
      // Should return the 10 highest priority
      expect(items[0].priority).toBe(14);
    });
  });

  describe('clear/reset', () => {
    it('clears all awareness items', () => {
      awareness.add('task', 'Task 1');
      awareness.add('action', 'Action 1');
      awareness.clear();
      expect(awareness.getAll()).toHaveLength(0);
    });

    it('clears by category', () => {
      awareness.add('task', 'Task 1');
      awareness.add('action', 'Action 1');
      awareness.clearCategory('task');
      const all = awareness.getAll();
      expect(all).toHaveLength(1);
      expect(all[0].category).toBe('action');
    });
  });

  describe('expiration', () => {
    it('can set an expiration time', () => {
      const item = awareness.add('flag', 'Temporary flag', 0, '2020-01-01T00:00:00');
      expect(item.expires_at).toBe('2020-01-01T00:00:00');
    });

    it('filters out expired items', () => {
      awareness.add('flag', 'Expired', 0, '2020-01-01T00:00:00');
      awareness.add('flag', 'Active', 0);
      const items = awareness.getAll();
      expect(items).toHaveLength(1);
      expect(items[0].content).toBe('Active');
    });
  });

  describe('toContext', () => {
    it('serializes to a context string', () => {
      awareness.add('task', 'Review PR #42', 10);
      awareness.add('action', 'Sent status email', 5);
      awareness.add('flag', 'meeting_in_progress', 1);

      const ctx = awareness.toContext();
      expect(ctx).toContain('Review PR #42');
      expect(ctx).toContain('Sent status email');
      expect(ctx).toContain('meeting_in_progress');
    });

    it('context string is under 2000 tokens (estimated)', () => {
      for (let i = 0; i < 10; i++) {
        awareness.add('task', `Task number ${i} with some description text`, i);
      }
      const ctx = awareness.toContext();
      const estimatedTokens = Math.ceil(ctx.length / 4);
      expect(estimatedTokens).toBeLessThan(2000);
    });
  });

  describe('performance', () => {
    it('full state reconstruction under 50ms (100 iterations)', () => {
      for (let i = 0; i < 10; i++) {
        awareness.add('task', `Task ${i}`, i);
      }

      // Warm up
      for (let i = 0; i < 5; i++) awareness.getAll();

      const start = performance.now();
      const iterations = 100;
      for (let i = 0; i < iterations; i++) {
        awareness.getAll();
      }
      const elapsed = performance.now() - start;
      const avgMs = elapsed / iterations;

      expect(avgMs).toBeLessThan(50);
    });
  });
});
