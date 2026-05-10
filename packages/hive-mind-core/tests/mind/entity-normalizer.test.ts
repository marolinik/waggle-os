/**
 * entity-normalizer tests — ported from
 * hive-mind/packages/core/src/mind/entity-normalizer.test.ts.
 *
 * Memory Sync Repair Step 2. Source: hive-mind file at HEAD c363257.
 *
 * Verbatim port — only the import path is adjusted. Both repos export
 * `normalizeEntityName` and `findDuplicates` with identical signatures.
 *
 * NOTE: waggle-os already has `tests/entity-normalizer.test.ts` at the
 * top level with 3 different cases focused on the normalize+findDuplicate
 * pair. The hive-mind cases are complementary (alias-resolution
 * specifics for known DB/lang abbreviations + cross-type separation
 * guarantee) — both files are kept.
 */
import { describe, it, expect } from 'vitest';
import { normalizeEntityName, findDuplicates } from '../../src/mind/entity-normalizer.js';

describe('normalizeEntityName (hive-mind port)', () => {
  it('resolves known aliases to their canonical name', () => {
    expect(normalizeEntityName('Postgres')).toBe('postgresql');
    expect(normalizeEntityName('pg')).toBe('postgresql');
    expect(normalizeEntityName('JS')).toBe('javascript');
    expect(normalizeEntityName('ts')).toBe('typescript');
    expect(normalizeEntityName('K8s')).toBe('kubernetes');
  });

  it('lowercases unknown names without aliasing', () => {
    expect(normalizeEntityName('Acme Corp')).toBe('acme corp');
    expect(normalizeEntityName('ZEBRA')).toBe('zebra');
  });
});

describe('findDuplicates (hive-mind port)', () => {
  it('groups aliased + differently-cased names of the same type', () => {
    const groups = findDuplicates([
      { id: '1', name: 'Postgres', type: 'db' },
      { id: '2', name: 'postgresql', type: 'DB' },
      { id: '3', name: 'pg', type: 'db' },
      { id: '4', name: 'MongoDB', type: 'db' },
      { id: '5', name: 'mongo', type: 'db' },
      { id: '6', name: 'solo', type: 'other' },
    ]);

    const keyed = new Map(groups.map((g) => [g.map((e) => e.id).sort().join(','), g]));

    // Three postgres refs land in the same group (case-insensitive type key).
    expect(keyed.has('1,2,3')).toBe(true);
    // Mongo alias pair lands in another group.
    expect(keyed.has('4,5')).toBe(true);
    // The unique `solo` stays in its own single-element group.
    expect(keyed.has('6')).toBe(true);
  });

  it('separates the same name across distinct types', () => {
    const groups = findDuplicates([
      { id: '1', name: 'Apple', type: 'fruit' },
      { id: '2', name: 'apple', type: 'company' },
    ]);
    expect(groups).toHaveLength(2);
  });
});
