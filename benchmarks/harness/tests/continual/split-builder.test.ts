/**
 * Deterministic difficulty-stratified Phase-A/B split.
 *
 * Properties under test:
 *  - determinism (same pool + seed ⇒ identical split + identical SHA),
 *  - the split is a PARTITION (every task in exactly one phase; no loss),
 *  - difficulty is matched across A and B (stratified, not skewed),
 *  - negative-control tasks are routed ENTIRELY to Phase B (they are tested,
 *    never used to build the mind),
 *  - near-dup tasks are routed ENTIRELY to Phase B (positive control set),
 *  - a Phase-B-random subset is emitted (a random draw, NOT reuse-selected),
 *  - the canonical SHA changes iff the split membership changes.
 */
import { describe, expect, it } from 'vitest';
import { buildPhaseSplit, type PhaseSplitInput } from '../../src/continual/split-builder.js';
import { type ContinualTask } from '../../src/continual/task-pool.js';

/** Build a pool of `n` headline tasks across `families` families with
 *  difficulty spread deterministically across [0,1]. */
function pool(n: number, families = 4): ContinualTask[] {
  const out: ContinualTask[] = [];
  for (let i = 0; i < n; i++) {
    out.push({
      task_id: `t-${i}`,
      goal: `goal ${i}`,
      gold: `gold ${i}`,
      difficulty: (i % 10) / 10, // 0.0..0.9 cycling — even difficulty spread
      procedure_family: `fam-${i % families}`,
      recurring_user: i % 3 === 0 ? `user-${i % 5}` : null,
      structure_tag: (['M1', 'M2', 'M3', 'M4'] as const)[i % 4],
      is_near_dup: false,
      is_negative_control: false,
    });
  }
  return out;
}

const baseInput = (tasks: ContinualTask[]): PhaseSplitInput => ({
  pool: tasks,
  testFraction: 0.4,
  phaseBRandomFraction: 0.25,
  seed: 42,
});

describe('buildPhaseSplit — determinism + partition', () => {
  it('is identical on two calls with the same input + seed', () => {
    const tasks = pool(60);
    const a = buildPhaseSplit(baseInput(tasks));
    const b = buildPhaseSplit(baseInput(tasks));
    expect(a.split_sha).toBe(b.split_sha);
    expect(a.phaseA.map(t => t.task_id)).toEqual(b.phaseA.map(t => t.task_id));
    expect(a.phaseB.map(t => t.task_id)).toEqual(b.phaseB.map(t => t.task_id));
    expect(a.phaseBRandom.map(t => t.task_id)).toEqual(b.phaseBRandom.map(t => t.task_id));
  });

  it('partitions the pool with no loss and no overlap', () => {
    const tasks = pool(60);
    const r = buildPhaseSplit(baseInput(tasks));
    const ids = new Set([...r.phaseA, ...r.phaseB].map(t => t.task_id));
    expect(ids.size).toBe(60);
    const aIds = new Set(r.phaseA.map(t => t.task_id));
    for (const t of r.phaseB) expect(aIds.has(t.task_id)).toBe(false);
  });

  it('respects testFraction within a small stratification tolerance', () => {
    const tasks = pool(100);
    const r = buildPhaseSplit(baseInput(tasks));
    // 40% to B; stratified rounding per family keeps it close, not exact.
    expect(r.phaseB.length).toBeGreaterThanOrEqual(35);
    expect(r.phaseB.length).toBeLessThanOrEqual(45);
  });
});

describe('buildPhaseSplit — difficulty matching', () => {
  it('A and B mean difficulty differ by < 0.05 (stratified match — 03 B6)', () => {
    const tasks = pool(120);
    const r = buildPhaseSplit(baseInput(tasks));
    expect(Math.abs(r.difficultyDist.phaseAMean - r.difficultyDist.phaseBMean)).toBeLessThan(0.05);
  });

  it('reports per-decile difficulty histograms for A and B', () => {
    const tasks = pool(120);
    const r = buildPhaseSplit(baseInput(tasks));
    expect(r.difficultyDist.phaseAHistogram).toHaveLength(10);
    expect(r.difficultyDist.phaseBHistogram).toHaveLength(10);
    const sumA = r.difficultyDist.phaseAHistogram.reduce((s, x) => s + x, 0);
    expect(sumA).toBe(r.phaseA.length);
  });
});

describe('buildPhaseSplit — control routing', () => {
  it('routes every negative-control task to Phase B', () => {
    const tasks = pool(40);
    tasks[3] = { ...tasks[3], is_negative_control: true, structure_tag: 'NONE' };
    tasks[7] = { ...tasks[7], is_negative_control: true, structure_tag: 'NONE' };
    const r = buildPhaseSplit(baseInput(tasks));
    const negInA = r.phaseA.filter(t => t.is_negative_control);
    expect(negInA).toHaveLength(0);
    expect(r.negativeControl.map(t => t.task_id).sort()).toEqual(['t-3', 't-7']);
    for (const t of r.negativeControl) {
      expect(r.phaseB.some(b => b.task_id === t.task_id)).toBe(true);
    }
  });

  it('routes every near-dup task to Phase B and surfaces them as the positive control', () => {
    const tasks = pool(40);
    tasks[5] = { ...tasks[5], is_near_dup: true };
    const r = buildPhaseSplit(baseInput(tasks));
    expect(r.phaseA.some(t => t.is_near_dup)).toBe(false);
    expect(r.nearDupControl.map(t => t.task_id)).toEqual(['t-5']);
    expect(r.phaseB.some(b => b.task_id === 't-5')).toBe(true);
  });
});

describe('buildPhaseSplit — Phase-B-random subset', () => {
  it('emits a phaseBRandom subset that is a subset of phaseB', () => {
    const tasks = pool(80);
    const r = buildPhaseSplit(baseInput(tasks));
    const bIds = new Set(r.phaseB.map(t => t.task_id));
    for (const t of r.phaseBRandom) expect(bIds.has(t.task_id)).toBe(true);
    expect(r.phaseBRandom.length).toBeGreaterThan(0);
  });

  it('phaseBRandom size ≈ phaseBRandomFraction × |phaseB|', () => {
    const tasks = pool(80);
    const r = buildPhaseSplit({ ...baseInput(tasks), phaseBRandomFraction: 0.5 });
    const expected = Math.round(0.5 * r.phaseB.length);
    expect(Math.abs(r.phaseBRandom.length - expected)).toBeLessThanOrEqual(1);
  });
});

describe('buildPhaseSplit — SHA sensitivity + validation', () => {
  it('SHA changes when a task moves phases (membership-sensitive)', () => {
    const tasks = pool(60);
    const a = buildPhaseSplit({ ...baseInput(tasks), testFraction: 0.4 });
    const b = buildPhaseSplit({ ...baseInput(tasks), testFraction: 0.6 });
    expect(a.split_sha).not.toBe(b.split_sha);
  });

  it('SHA is a 64-char lowercase hex string', () => {
    const r = buildPhaseSplit(baseInput(pool(30)));
    expect(r.split_sha).toMatch(/^[0-9a-f]{64}$/);
  });

  it('rejects testFraction outside (0,1)', () => {
    expect(() => buildPhaseSplit({ ...baseInput(pool(10)), testFraction: 0 })).toThrow(/testFraction/);
    expect(() => buildPhaseSplit({ ...baseInput(pool(10)), testFraction: 1 })).toThrow(/testFraction/);
  });

  it('rejects a pool with no headline (non-control) tasks left for Phase A', () => {
    const tasks = pool(4).map(t => ({ ...t, is_negative_control: true, structure_tag: 'NONE' as const }));
    expect(() => buildPhaseSplit(baseInput(tasks))).toThrow(/Phase A/);
  });
});
