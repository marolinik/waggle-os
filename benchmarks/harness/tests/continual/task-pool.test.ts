/**
 * Continual task-pool type + validators.
 *
 * The pool is the single input the whole protocol reads. A task carries:
 *   - a stable id, the task statement (goal) + its gold answer,
 *   - difficulty (raw-model pass-rate proxy in [0,1]) for stratified split,
 *   - procedure_family / recurring_user (the cluster ids — 03 B2),
 *   - structure_tag (which of M1..M4 sub-structure it reuses),
 *   - is_near_dup (positive control flag — C5),
 *   - is_negative_control (LOW structure-overlap; predicts NO lift — C7).
 */
import { describe, expect, it } from 'vitest';
import {
  validateContinualTask,
  validateTaskPool,
  type ContinualTask,
} from '../../src/continual/task-pool.js';

function mkTask(over: Partial<ContinualTask> = {}): ContinualTask {
  return {
    task_id: 't-1',
    goal: 'Process the return for order O-100.',
    gold: 'Return processed; $42 refunded.',
    difficulty: 0.5,
    procedure_family: 'returns',
    recurring_user: null,
    structure_tag: 'M1',
    is_near_dup: false,
    is_negative_control: false,
    ...over,
  };
}

describe('validateContinualTask', () => {
  it('accepts a well-formed task and returns it unchanged (immutable)', () => {
    const t = mkTask();
    const out = validateContinualTask(t);
    expect(out).toEqual(t);
    expect(out).not.toBe(t); // returns a defensive copy, never mutates input
  });

  it('rejects an empty task_id', () => {
    expect(() => validateContinualTask(mkTask({ task_id: '' }))).toThrow(/task_id/);
  });

  it('rejects an empty goal or gold', () => {
    expect(() => validateContinualTask(mkTask({ goal: '' }))).toThrow(/goal/);
    expect(() => validateContinualTask(mkTask({ gold: '   ' }))).toThrow(/gold/);
  });

  it('rejects difficulty outside [0,1]', () => {
    expect(() => validateContinualTask(mkTask({ difficulty: -0.1 }))).toThrow(/difficulty/);
    expect(() => validateContinualTask(mkTask({ difficulty: 1.1 }))).toThrow(/difficulty/);
  });

  it('rejects an unknown structure_tag', () => {
    expect(() =>
      validateContinualTask(mkTask({ structure_tag: 'M9' as unknown as ContinualTask['structure_tag'] })),
    ).toThrow(/structure_tag/);
  });

  it('rejects a task that is both near-dup and negative-control (mutually exclusive)', () => {
    expect(() =>
      validateContinualTask(mkTask({ is_near_dup: true, is_negative_control: true })),
    ).toThrow(/mutually exclusive/);
  });
});

describe('validateTaskPool', () => {
  it('accepts a pool with unique ids', () => {
    const pool = [mkTask({ task_id: 'a' }), mkTask({ task_id: 'b' })];
    expect(validateTaskPool(pool)).toHaveLength(2);
  });

  it('rejects an empty pool', () => {
    expect(() => validateTaskPool([])).toThrow(/non-empty/);
  });

  it('rejects duplicate task_ids', () => {
    const pool = [mkTask({ task_id: 'dup' }), mkTask({ task_id: 'dup' })];
    expect(() => validateTaskPool(pool)).toThrow(/duplicate task_id/);
  });
});
