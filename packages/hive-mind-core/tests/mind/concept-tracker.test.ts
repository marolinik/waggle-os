import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MindDB } from '../../src/mind/db.js';
import { ConceptTracker } from '../../src/mind/concept-tracker.js';

describe('ConceptTracker (F19)', () => {
  let db: MindDB;
  let tracker: ConceptTracker;

  beforeEach(() => {
    db = new MindDB(':memory:');
    tracker = new ConceptTracker(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('upsertConcept', () => {
    it('creates a new concept with defaults', () => {
      const entry = tracker.upsertConcept('TypeScript generics');
      expect(entry.concept).toBe('TypeScript generics');
      expect(entry.mastery_level).toBe(1);
      expect(entry.times_correct).toBe(0);
      expect(entry.times_wrong).toBe(0);
      expect(entry.notes).toBe('');
      expect(entry.created_at).toBeDefined();
    });

    it('creates a concept with custom mastery level', () => {
      const entry = tracker.upsertConcept('SQL joins', { mastery_level: 3 });
      expect(entry.mastery_level).toBe(3);
    });

    it('creates a concept with notes', () => {
      const entry = tracker.upsertConcept('React hooks', { notes: 'Focus on useEffect cleanup' });
      expect(entry.notes).toBe('Focus on useEffect cleanup');
    });

    it('updates existing concept mastery level', () => {
      tracker.upsertConcept('Git rebase', { mastery_level: 2 });
      const updated = tracker.upsertConcept('Git rebase', { mastery_level: 4 });
      expect(updated.mastery_level).toBe(4);
    });

    it('updates existing concept notes', () => {
      tracker.upsertConcept('Docker', { notes: 'basics' });
      const updated = tracker.upsertConcept('Docker', { notes: 'Dockerfile multi-stage builds' });
      expect(updated.notes).toBe('Dockerfile multi-stage builds');
    });

    it('clamps mastery level to 1-5 range', () => {
      const low = tracker.upsertConcept('test-low', { mastery_level: 0 });
      expect(low.mastery_level).toBe(1);

      const high = tracker.upsertConcept('test-high', { mastery_level: 10 });
      expect(high.mastery_level).toBe(5);
    });
  });

  describe('getConcept', () => {
    it('returns a concept by name', () => {
      tracker.upsertConcept('Rust ownership');
      const found = tracker.getConcept('Rust ownership');
      expect(found).toBeDefined();
      expect(found!.concept).toBe('Rust ownership');
    });

    it('returns undefined for nonexistent concept', () => {
      expect(tracker.getConcept('nonexistent')).toBeUndefined();
    });
  });

  describe('listConcepts', () => {
    it('lists all concepts', () => {
      tracker.upsertConcept('A', { mastery_level: 1 });
      tracker.upsertConcept('B', { mastery_level: 3 });
      tracker.upsertConcept('C', { mastery_level: 5 });
      expect(tracker.listConcepts()).toHaveLength(3);
    });

    it('filters by minimum mastery', () => {
      tracker.upsertConcept('Low', { mastery_level: 1 });
      tracker.upsertConcept('Mid', { mastery_level: 3 });
      tracker.upsertConcept('High', { mastery_level: 5 });
      const filtered = tracker.listConcepts(3);
      expect(filtered).toHaveLength(2);
      expect(filtered.every(c => c.mastery_level >= 3)).toBe(true);
    });

    it('filters by maximum mastery', () => {
      tracker.upsertConcept('Low', { mastery_level: 1 });
      tracker.upsertConcept('Mid', { mastery_level: 3 });
      tracker.upsertConcept('High', { mastery_level: 5 });
      const filtered = tracker.listConcepts(undefined, 2);
      expect(filtered).toHaveLength(1);
      expect(filtered[0].concept).toBe('Low');
    });

    it('filters by mastery range', () => {
      tracker.upsertConcept('A', { mastery_level: 1 });
      tracker.upsertConcept('B', { mastery_level: 2 });
      tracker.upsertConcept('C', { mastery_level: 3 });
      tracker.upsertConcept('D', { mastery_level: 4 });
      const filtered = tracker.listConcepts(2, 3);
      expect(filtered).toHaveLength(2);
    });
  });

  describe('recordAnswer', () => {
    it('increases mastery on correct answer', () => {
      tracker.upsertConcept('Promises', { mastery_level: 2 });
      const updated = tracker.recordAnswer('Promises', true);
      expect(updated.mastery_level).toBe(3);
      expect(updated.times_correct).toBe(1);
      expect(updated.times_wrong).toBe(0);
      expect(updated.last_tested).toBeDefined();
    });

    it('decreases mastery on wrong answer', () => {
      tracker.upsertConcept('Closures', { mastery_level: 3 });
      const updated = tracker.recordAnswer('Closures', false);
      expect(updated.mastery_level).toBe(2);
      expect(updated.times_wrong).toBe(1);
    });

    it('caps mastery at 5', () => {
      tracker.upsertConcept('HTML', { mastery_level: 5 });
      const updated = tracker.recordAnswer('HTML', true);
      expect(updated.mastery_level).toBe(5);
      expect(updated.times_correct).toBe(1);
    });

    it('floors mastery at 1', () => {
      tracker.upsertConcept('Assembly', { mastery_level: 1 });
      const updated = tracker.recordAnswer('Assembly', false);
      expect(updated.mastery_level).toBe(1);
      expect(updated.times_wrong).toBe(1);
    });

    it('auto-creates concept on first answer if not exists', () => {
      const entry = tracker.recordAnswer('New concept', true);
      expect(entry.concept).toBe('New concept');
      expect(entry.mastery_level).toBe(2); // correct = start at 2
      expect(entry.times_correct).toBe(1);
    });

    it('auto-creates concept with mastery 1 on wrong answer', () => {
      const entry = tracker.recordAnswer('Hard concept', false);
      expect(entry.mastery_level).toBe(1);
      expect(entry.times_wrong).toBe(1);
    });

    it('accumulates correct and wrong counts', () => {
      tracker.upsertConcept('CSS Grid', { mastery_level: 3 });
      tracker.recordAnswer('CSS Grid', true);
      tracker.recordAnswer('CSS Grid', true);
      tracker.recordAnswer('CSS Grid', false);
      const entry = tracker.getConcept('CSS Grid')!;
      expect(entry.times_correct).toBe(2);
      expect(entry.times_wrong).toBe(1);
      // 3 + 1 + 1 - 1 = 4
      expect(entry.mastery_level).toBe(4);
    });
  });

  describe('getDueForReview', () => {
    it('returns concepts with mastery < 4', () => {
      tracker.upsertConcept('Easy', { mastery_level: 5 });
      tracker.upsertConcept('Medium', { mastery_level: 3 });
      tracker.upsertConcept('Hard', { mastery_level: 1 });

      const due = tracker.getDueForReview();
      expect(due).toHaveLength(2);
      // Hard (1) should come before Medium (3)
      expect(due[0].concept).toBe('Hard');
      expect(due[1].concept).toBe('Medium');
    });

    it('excludes mastered concepts (level 4+)', () => {
      tracker.upsertConcept('Mastered', { mastery_level: 4 });
      tracker.upsertConcept('NotYet', { mastery_level: 2 });

      const due = tracker.getDueForReview();
      expect(due).toHaveLength(1);
      expect(due[0].concept).toBe('NotYet');
    });

    it('respects limit parameter', () => {
      for (let i = 0; i < 20; i++) {
        tracker.upsertConcept(`Concept ${i}`, { mastery_level: 1 });
      }
      expect(tracker.getDueForReview(5)).toHaveLength(5);
    });

    it('returns empty array when all concepts are mastered', () => {
      tracker.upsertConcept('A', { mastery_level: 4 });
      tracker.upsertConcept('B', { mastery_level: 5 });
      expect(tracker.getDueForReview()).toHaveLength(0);
    });
  });

  describe('table idempotency', () => {
    it('creating multiple ConceptTracker instances on same DB does not error', () => {
      const tracker2 = new ConceptTracker(db);
      tracker.upsertConcept('test');
      expect(tracker2.getConcept('test')).toBeDefined();
    });
  });
});
