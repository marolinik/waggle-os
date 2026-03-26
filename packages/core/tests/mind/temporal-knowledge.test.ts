import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MindDB } from '../../src/mind/db.js';
import { KnowledgeGraph } from '../../src/mind/knowledge.js';

describe('Temporal Knowledge Queries', () => {
  let db: MindDB;
  let kg: KnowledgeGraph;

  beforeEach(() => {
    db = new MindDB(':memory:');
    kg = new KnowledgeGraph(db);
  });

  afterEach(() => {
    db.close();
  });

  it('queries entities valid at a specific time', () => {
    kg.createEntity('fact', 'Alice is on Team Alpha', {}, {
      valid_from: '2026-01-01T00:00:00Z',
      valid_to: '2026-02-01T00:00:00Z',
    });
    kg.createEntity('fact', 'Alice is on Team Beta', {}, {
      valid_from: '2026-02-01T00:00:00Z',
    });

    const jan = kg.getEntitiesValidAt('2026-01-15T00:00:00Z');
    expect(jan.some(e => e.name.includes('Alpha'))).toBe(true);
    expect(jan.some(e => e.name.includes('Beta'))).toBe(false);

    const feb = kg.getEntitiesValidAt('2026-02-15T00:00:00Z');
    expect(feb.some(e => e.name.includes('Beta'))).toBe(true);
    expect(feb.some(e => e.name.includes('Alpha'))).toBe(false);
  });

  it('entities with no valid_from default to creation time', () => {
    const entity = kg.createEntity('person', 'Charlie', {});
    const now = new Date().toISOString();
    const results = kg.getEntitiesValidAt(now);
    expect(results.some(e => e.name === 'Charlie')).toBe(true);
  });

  it('entities with valid_to in the past are excluded', () => {
    kg.createEntity('fact', 'Expired fact', {}, {
      valid_from: '2020-01-01T00:00:00Z',
      valid_to: '2020-06-01T00:00:00Z',
    });

    const results = kg.getEntitiesValidAt('2026-01-01T00:00:00Z');
    expect(results.some(e => e.name === 'Expired fact')).toBe(false);
  });

  it('entities with future valid_from are excluded', () => {
    kg.createEntity('fact', 'Future fact', {}, {
      valid_from: '2030-01-01T00:00:00Z',
    });

    const results = kg.getEntitiesValidAt('2026-01-01T00:00:00Z');
    expect(results.some(e => e.name === 'Future fact')).toBe(false);
  });
});
