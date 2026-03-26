import { describe, it, expect } from 'vitest';
import { normalizeEntityName, findDuplicates } from '../src/mind/entity-normalizer.js';

describe('Entity Normalizer', () => {
  it('normalizes common abbreviations', () => {
    expect(normalizeEntityName('NYC')).toBe('new york city');
    expect(normalizeEntityName('JS')).toBe('javascript');
    expect(normalizeEntityName('TS')).toBe('typescript');
    expect(normalizeEntityName('PG')).toBe('postgresql');
    expect(normalizeEntityName('k8s')).toBe('kubernetes');
  });

  it('finds duplicate entity groups', () => {
    const entities = [
      { id: '1', name: 'PostgreSQL', type: 'technology' },
      { id: '2', name: 'Postgres', type: 'technology' },
      { id: '3', name: 'React', type: 'technology' },
    ];
    const groups = findDuplicates(entities);
    const pgGroup = groups.find(g => g.some(e => e.id === '1'));
    expect(pgGroup).toBeDefined();
    expect(pgGroup!.length).toBeGreaterThanOrEqual(2);
  });

  it('does not group unrelated entities', () => {
    const entities = [
      { id: '1', name: 'React', type: 'technology' },
      { id: '2', name: 'Docker', type: 'technology' },
    ];
    const groups = findDuplicates(entities);
    expect(groups.every(g => g.length === 1)).toBe(true);
  });
});
