/**
 * Sprint 12 Task 1 Blocker #6 — failure distribution aggregator tests.
 *
 * Acceptance (brief § 2.1 B):
 *   1. counts sum equals total
 *   2. f_other_rate computation correct
 *   3. review_flag at 11% triggers
 *   4. review_flag at 10% does NOT trigger (strict greater-than)
 *   5. sample captures first 10 F_other rationales in order
 *   6. zero-F_other input yields empty sample
 */

import { describe, expect, it } from 'vitest';
import {
  computeFailureDistribution,
  type FailureRow,
} from '../../src/failure-taxonomy/aggregate.js';

describe('computeFailureDistribution — structural invariants', () => {
  it('counts sum equals total', () => {
    const rows: FailureRow[] = [
      { failure_code: null },
      { failure_code: null },
      { failure_code: 'F1' },
      { failure_code: 'F3' },
      { failure_code: 'F6' },
    ];
    const dist = computeFailureDistribution(rows);
    expect(dist.total).toBe(5);
    const summed =
      dist.counts.null +
      dist.counts.F1 + dist.counts.F2 + dist.counts.F3 +
      dist.counts.F4 + dist.counts.F5 + dist.counts.F6 +
      dist.counts.F_other;
    expect(summed).toBe(dist.total);
  });

  it('f_other_rate = F_other count / total', () => {
    const rows: FailureRow[] = [
      { failure_code: 'F_other', rationale: 'rationale one two three four five six seven eight nine' },
      { failure_code: 'F_other', rationale: 'another rationale two three four five six seven eight nine' },
      { failure_code: null },
      { failure_code: 'F1' },
      { failure_code: null },
    ];
    const dist = computeFailureDistribution(rows);
    expect(dist.counts.F_other).toBe(2);
    expect(dist.total).toBe(5);
    expect(dist.f_other_rate).toBeCloseTo(2 / 5, 10);
  });
});

describe('computeFailureDistribution — F_other review flag threshold', () => {
  function buildRows(fOtherCount: number, total: number): FailureRow[] {
    const rows: FailureRow[] = [];
    for (let i = 0; i < fOtherCount; i++) {
      rows.push({
        failure_code: 'F_other',
        rationale: `rationale ${i} padded padded padded padded padded padded padded padded padded`,
      });
    }
    for (let i = 0; i < total - fOtherCount; i++) {
      rows.push({ failure_code: null });
    }
    return rows;
  }

  it('flag triggers at 11% (11/100 > 10%)', () => {
    const dist = computeFailureDistribution(buildRows(11, 100));
    expect(dist.f_other_rate).toBeCloseTo(0.11, 10);
    expect(dist.f_other_review_flag).toBe(true);
  });

  it('flag does NOT trigger at 10% (strict greater-than: 10/100 not > 10%)', () => {
    const dist = computeFailureDistribution(buildRows(10, 100));
    expect(dist.f_other_rate).toBeCloseTo(0.10, 10);
    expect(dist.f_other_review_flag).toBe(false);
  });

  it('flag does not trigger on empty input', () => {
    const dist = computeFailureDistribution([]);
    expect(dist.total).toBe(0);
    expect(dist.f_other_rate).toBe(0);
    expect(dist.f_other_review_flag).toBe(false);
  });
});

describe('computeFailureDistribution — F_other rationale sample', () => {
  it('captures first 10 F_other rationales in input order', () => {
    const rows: FailureRow[] = [];
    for (let i = 0; i < 15; i++) {
      rows.push({
        failure_code: 'F_other',
        rationale: `rationale-${i} padded padded padded padded padded padded padded padded padded`,
      });
    }
    const dist = computeFailureDistribution(rows);
    expect(dist.f_other_rationales_sample).toHaveLength(10);
    expect(dist.f_other_rationales_sample[0]).toMatch(/^rationale-0 /);
    expect(dist.f_other_rationales_sample[9]).toMatch(/^rationale-9 /);
  });

  it('zero-F_other input yields empty sample array', () => {
    const rows: FailureRow[] = [
      { failure_code: null },
      { failure_code: 'F1' },
      { failure_code: 'F2' },
    ];
    const dist = computeFailureDistribution(rows);
    expect(dist.counts.F_other).toBe(0);
    expect(dist.f_other_rationales_sample).toEqual([]);
  });

  it('skips F_other rows without a rationale string in the sample (robustness)', () => {
    const rows: FailureRow[] = [
      { failure_code: 'F_other', rationale: null },
      { failure_code: 'F_other', rationale: 'valid rationale one two three four five six seven eight' },
    ];
    const dist = computeFailureDistribution(rows);
    expect(dist.counts.F_other).toBe(2);
    expect(dist.f_other_rationales_sample).toHaveLength(1);
  });
});
