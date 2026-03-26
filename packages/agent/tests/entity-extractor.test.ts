import { describe, it, expect } from 'vitest';
import { extractEntities } from '../src/entity-extractor.js';

describe('Entity Extractor', () => {
  it('extracts person names', () => {
    const entities = extractEntities('I had a meeting with Alice Johnson about the Q3 roadmap.');
    const people = entities.filter(e => e.type === 'person');
    expect(people.length).toBeGreaterThanOrEqual(1);
    expect(people.some(p => p.name.includes('Alice'))).toBe(true);
  });

  it('extracts technology references', () => {
    const entities = extractEntities('Switch from PostgreSQL to SQLite for the local database.');
    const techs = entities.filter(e => e.type === 'technology');
    expect(techs.length).toBeGreaterThanOrEqual(2);
  });

  it('returns empty array for trivial input', () => {
    expect(extractEntities('Hi')).toEqual([]);
  });

  it('deduplicates within same extraction', () => {
    const entities = extractEntities('Alice Johnson talked to Alice Johnson about Alice Johnson.');
    const alices = entities.filter(e => e.name.includes('Alice'));
    expect(alices).toHaveLength(1);
  });
});
