/**
 * Sprint 12 Task 1 Blocker #6 — failure distribution aggregator.
 *
 * Counts failure codes across a run's emitted rows, computes F_other rate,
 * flags taxonomy-review triggers per A3 LOCK § 6 (strict >10% threshold),
 * and captures up to 10 F_other rationales for manual PM review in the
 * exit ping.
 */

import {
  FAILURE_CODES,
  F_OTHER_REVIEW_THRESHOLD,
  type FailureCode,
} from './codes.js';

export interface FailureRow {
  failure_code: FailureCode;
  rationale?: string | null;
}

export interface FailureDistribution {
  /** Counts keyed by code. `null` is the correct-verdict bucket. */
  counts: Record<'null' | 'F1' | 'F2' | 'F3' | 'F4' | 'F5' | 'F6' | 'F_other', number>;
  /** Total rows counted (sum of `counts`). */
  total: number;
  /** F_other rate ∈ [0, 1]. Zero when total=0. */
  f_other_rate: number;
  /** True when f_other_rate > 10% (strict greater-than per A3 LOCK § 6). */
  f_other_review_flag: boolean;
  /** First 10 F_other rationales in input order, for PM manual inspection. */
  f_other_rationales_sample: string[];
}

const MAX_F_OTHER_SAMPLE = 10;

function emptyCounts(): FailureDistribution['counts'] {
  return {
    null: 0,
    F1: 0,
    F2: 0,
    F3: 0,
    F4: 0,
    F5: 0,
    F6: 0,
    F_other: 0,
  };
}

export function computeFailureDistribution(
  rows: readonly FailureRow[],
): FailureDistribution {
  const counts = emptyCounts();
  const f_other_rationales_sample: string[] = [];

  for (const row of rows) {
    const code = row.failure_code;
    if (code === null) {
      counts.null += 1;
      continue;
    }
    if (!(FAILURE_CODES as readonly string[]).includes(code)) {
      // Defensive skip — aggregate is lenient vs. validator. Unknown codes
      // don't crash the report but also don't pollute the known-buckets.
      continue;
    }
    counts[code] += 1;
    if (code === 'F_other') {
      if (
        typeof row.rationale === 'string' &&
        row.rationale.length > 0 &&
        f_other_rationales_sample.length < MAX_F_OTHER_SAMPLE
      ) {
        f_other_rationales_sample.push(row.rationale);
      }
    }
  }

  const total =
    counts.null +
    counts.F1 +
    counts.F2 +
    counts.F3 +
    counts.F4 +
    counts.F5 +
    counts.F6 +
    counts.F_other;

  const f_other_rate = total === 0 ? 0 : counts.F_other / total;
  const f_other_review_flag = f_other_rate > F_OTHER_REVIEW_THRESHOLD;

  return {
    counts,
    total,
    f_other_rate,
    f_other_review_flag,
    f_other_rationales_sample,
  };
}
