/**
 * Overlap audit + re-derivability gate.
 *
 * Pure n-gram overlap is tested directly. The embedding-cosine + the
 * raised-budget OFF probe are injected (a cosine fn + an OFF-solve fn) so the
 * test is hermetic and substrate-free.
 */
import { describe, expect, it } from 'vitest';
import {
  maxNgramOverlap,
  auditGoalStructureOverlap,
  runReDerivabilityGate,
  type OverlapTask,
} from '../../src/continual/overlap-audit.js';

describe('maxNgramOverlap', () => {
  it('returns 1.0 when the gold appears verbatim in an artifact', () => {
    const o = maxNgramOverlap('issue a full refund', ['please issue a full refund to the buyer'], 3);
    expect(o).toBeCloseTo(1.0, 5);
  });
  it('returns 0 when there is no shared n-gram', () => {
    expect(maxNgramOverlap('aaa bbb ccc', ['xxx yyy zzz'], 3)).toBe(0);
  });
  it('is fractional for partial overlap', () => {
    const o = maxNgramOverlap('a b c d', ['a b c x'], 2); // bigrams: {a b, b c, c d} vs {a b, b c, c x} → 2/3
    expect(o).toBeCloseTo(2 / 3, 5);
  });
  it('rejects n < 1', () => {
    expect(() => maxNgramOverlap('a b', ['a b'], 0)).toThrow(/n ≥ 1/);
  });
});

const tasks: OverlapTask[] = [
  { task_id: 'lowdup', gold: 'rebook to the morning flight', is_near_dup: false },
  { task_id: 'highdup', gold: 'process the return for order O-100', is_near_dup: false },
];
const phaseAArtifacts = [
  'Skill: rebooking procedure — search alternates, hold seat, confirm.',
  'process the return for order O-100 then refund', // near-identical to highdup gold
];

describe('auditGoalStructureOverlap', () => {
  it('flags a task whose gold n-gram overlap exceeds the cutoff', () => {
    const r = auditGoalStructureOverlap({
      tasks, phaseAArtifacts, ngram: 4, ngramCutoff: 0.5,
      cosine: () => 0.1, cosineCutoff: 0.9,
    });
    const high = r.perTask.find(t => t.task_id === 'highdup')!;
    expect(high.excluded).toBe(true);
    expect(high.exclusionReason).toMatch(/n-gram/);
    const low = r.perTask.find(t => t.task_id === 'lowdup')!;
    expect(low.excluded).toBe(false);
  });

  it('flags a task whose gold embedding cosine exceeds the cutoff', () => {
    const r = auditGoalStructureOverlap({
      tasks: [tasks[0]], phaseAArtifacts, ngram: 4, ngramCutoff: 0.9,
      cosine: () => 0.95, cosineCutoff: 0.9,
    });
    expect(r.perTask[0].excluded).toBe(true);
    expect(r.perTask[0].exclusionReason).toMatch(/cosine/);
  });

  it('reports headline count = tasks not excluded', () => {
    const r = auditGoalStructureOverlap({
      tasks, phaseAArtifacts, ngram: 4, ngramCutoff: 0.5,
      cosine: () => 0.1, cosineCutoff: 0.9,
    });
    expect(r.headlineCount).toBe(1);
    expect(r.excludedCount).toBe(1);
  });

  it('rejects a cutoff outside [0,1]', () => {
    expect(() =>
      auditGoalStructureOverlap({ tasks, phaseAArtifacts, ngram: 4, ngramCutoff: 1.5, cosine: () => 0, cosineCutoff: 0.9 }),
    ).toThrow(/ngramCutoff/);
  });
});

describe('runReDerivabilityGate', () => {
  it('excludes (and counts) tasks that unbounded-OFF cannot solve', async () => {
    const r = await runReDerivabilityGate({
      tasks: [
        { task_id: 'rederivable', gold: 'g1', is_near_dup: false },
        { task_id: 'unobtainable', gold: 'g2', is_near_dup: false },
      ],
      // raised-budget OFF probe: 'rederivable' solves, 'unobtainable' never does.
      offSolves: async (t) => t.task_id === 'rederivable',
    });
    expect(r.reDerivable.map(t => t.task_id)).toEqual(['rederivable']);
    expect(r.nonReDerivable.map(t => t.task_id)).toEqual(['unobtainable']);
    expect(r.nonReDerivableCount).toBe(1);
  });

  it('an empty task set throws', async () => {
    await expect(runReDerivabilityGate({ tasks: [], offSolves: async () => true })).rejects.toThrow(/non-empty/);
  });
});
