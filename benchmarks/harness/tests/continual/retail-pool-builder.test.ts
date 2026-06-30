/**
 * Retail task-pool builder — maps τ² retail tasks.json into the continual
 * ContinualTask shape so buildPhaseSplit can produce a deterministic Phase-B
 * held-out set for the pilot.
 *
 * Pure helpers are unit-tested hermetically; buildRetailTaskPool is checked
 * against the real vendored 114-task retail fixture.
 */
import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import {
  buildRetailTaskPool,
  primaryFamily,
  extractRecurringUser,
  synthesizeGold,
} from '../../src/continual/retail-pool-builder.js';

const RETAIL_TASKS = fileURLToPath(
  new URL('../../../tau2/upstream/data/tau2/domains/retail/tasks.json', import.meta.url),
);

describe('primaryFamily', () => {
  it('picks the write action family over read-only probes', () => {
    expect(primaryFamily([
      { name: 'find_user_id_by_name_zip' },
      { name: 'get_order_details' },
      { name: 'exchange_delivered_order_items' },
    ])).toBe('exchange');
  });
  it('returns read_only when no write action is present', () => {
    expect(primaryFamily([{ name: 'get_order_details' }, { name: 'get_product_details' }])).toBe('read_only');
  });
  it('returns no_action for an empty action list', () => {
    expect(primaryFamily([])).toBe('no_action');
  });
});

describe('extractRecurringUser', () => {
  it('parses the persona name from known_info', () => {
    expect(extractRecurringUser('You are Yusuf Rossi in zip code 19122.')).toBe('Yusuf Rossi');
  });
  it('returns null when no persona is stated', () => {
    expect(extractRecurringUser('You do not remember your email.')).toBeNull();
    expect(extractRecurringUser(undefined)).toBeNull();
  });
});

describe('synthesizeGold', () => {
  it('serializes the gold action sequence deterministically', () => {
    const g = synthesizeGold([
      { name: 'find_user_id_by_name_zip', arguments: { zip: '19122' } },
      { name: 'get_order_details', arguments: { order_id: '#W1' } },
    ]);
    expect(g).toContain('find_user_id_by_name_zip');
    expect(g).toContain('#W1');
    expect(g).toContain(' ; ');
  });
  it('returns a non-empty marker for no actions', () => {
    expect(synthesizeGold([])).toBe('no_action');
  });
});

describe('buildRetailTaskPool (real fixture)', () => {
  it('loads the 114 retail tasks into a validated ContinualTask pool', () => {
    const pool = buildRetailTaskPool({ tasksJsonPath: RETAIL_TASKS });
    expect(pool.length).toBe(114);
    expect(pool.every(t => t.goal.length > 0 && t.gold.length > 0)).toBe(true);
    expect(pool.every(t => t.difficulty === 0.5)).toBe(true);             // pilot: uniform
    expect(pool.every(t => t.structure_tag === 'NONE')).toBe(true);
    expect(new Set(pool.map(t => t.task_id)).size).toBe(114);             // unique ids
    expect(pool.some(t => t.recurring_user !== null)).toBe(true);         // M4 candidates exist
    expect(pool.some(t => t.procedure_family === 'exchange')).toBe(true); // families derived
  });
});
