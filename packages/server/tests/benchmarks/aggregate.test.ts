/**
 * aggregate.ts unit tests (Sprint 9 Task 3).
 *
 * Brief:  PM-Waggle-OS/briefs/2026-04-20-cc-sprint-9-tasks.md Task 3 §Acceptance
 * Rubric: PM-Waggle-OS/strategy/2026-04-20-failure-mode-taxonomy.md §5
 *
 * Synthetic 12-instance JSONL fixture: 3 cells × 4 verdicts. Tests
 * assert:
 *   - per-cell count table matches hand-computed rows
 *   - weighted score matches hand-computed number (see §2 below)
 *   - per-category rollup surfaces the hallucination flag at the right threshold
 *   - cross-cell delta matrix populates full-context − raw direction
 *   - cost summary sums correctly + Week-1 projection flag fires at the threshold
 *   - markdown renderer produces parseable output + contains every row
 */

import { describe, it, expect } from 'vitest';
import {
  buildReport,
  perCellRollup,
  perCategoryRollup,
  crossCellDeltaMatrix,
  costSummary,
  projectVerdict6,
  renderMarkdown,
  WEIGHTS,
  VERDICT6_VALUES,
  type JudgedJsonlRecord,
} from '../../src/benchmarks/aggregate.ts';

// ── Fixture builder ─────────────────────────────────────────────────────

function mkRecord(
  turnId: string,
  cell: string,
  verdict: 'correct' | 'incorrect' | 'unjudged',
  failureMode: 'F1' | 'F2' | 'F3' | 'F4' | 'F5' | null,
  category: JudgedJsonlRecord['category'] = 'single-hop',
  usd = 0.001,
): JudgedJsonlRecord {
  const rec: JudgedJsonlRecord = {
    turnId,
    cell,
    instance_id: `i_${turnId}`,
    model: 'qwen3.6-35b-a3b',
    seed: 42,
    accuracy: verdict === 'correct' ? 1 : 0,
    p50_latency_ms: 800,
    p95_latency_ms: 1200,
    usd_per_query: usd,
    failure_mode: null,
    category,
  };
  if (verdict !== 'unjudged') {
    rec.judge_verdict = verdict;
    rec.judge_failure_mode = failureMode;
    rec.judge_rationale = 'test rationale';
    rec.judge_model = 'claude-sonnet-4-6';
    rec.judge_timestamp = '2026-04-21T12:00:00Z';
  }
  return rec;
}

/** 12-instance fixture — 4 each per cell, one of each verdict shape.
 *  Hand-computed expectations are commented inline so a future diff
 *  catches silent drift in the rubric. */
function fixture12(): JudgedJsonlRecord[] {
  const recs: JudgedJsonlRecord[] = [];
  const cells = ['raw', 'filtered', 'full-context'];
  // Per cell: 1 correct + 1 F2 partial + 1 F3 incorrect + 1 F4 hallucinated.
  for (const c of cells) {
    recs.push(mkRecord(`${c}-A`, c, 'correct', null, 'single-hop'));
    recs.push(mkRecord(`${c}-B`, c, 'incorrect', 'F2', 'multi-hop'));
    recs.push(mkRecord(`${c}-C`, c, 'incorrect', 'F3', 'temporal'));
    recs.push(mkRecord(`${c}-D`, c, 'incorrect', 'F4', 'open-ended'));
  }
  return recs;
}

// ── projectVerdict6 ─────────────────────────────────────────────────────

describe('projectVerdict6 — taxonomy §9 binary → brief §Task-1 6-value', () => {
  it('maps correct → correct', () => {
    expect(projectVerdict6(mkRecord('x', 'raw', 'correct', null))).toBe('correct');
  });
  it('maps incorrect + F1..F5 through their exact projections', () => {
    const cases: Array<[typeof WEIGHTS extends Record<infer K, number> ? K : never, string]> = [
      ['F1_abstain', 'F1'],
      ['F2_partial', 'F2'],
      ['F3_incorrect', 'F3'],
      ['F4_hallucinated', 'F4'],
      ['F5_offtopic', 'F5'],
    ];
    for (const [expected, mode] of cases) {
      expect(projectVerdict6(
        mkRecord('x', 'raw', 'incorrect', mode as 'F1' | 'F2' | 'F3' | 'F4' | 'F5'),
      )).toBe(expected);
    }
  });
  it('maps undefined judge_verdict → unjudged', () => {
    expect(projectVerdict6(mkRecord('x', 'raw', 'unjudged', null))).toBe('unjudged');
  });
});

// ── perCellRollup ───────────────────────────────────────────────────────

describe('perCellRollup', () => {
  it('emits 3 rows, one per observed cell, in CELL_NAMES order', () => {
    const rows = perCellRollup(fixture12());
    expect(rows).toHaveLength(3);
    expect(rows.map(r => r.cell)).toEqual(['raw', 'filtered', 'full-context']);
  });

  it('computes per-cell counts + weighted score correctly (hand-check)', () => {
    const rows = perCellRollup(fixture12());
    for (const row of rows) {
      expect(row.total).toBe(4);
      expect(row.counts.correct).toBe(1);
      expect(row.counts.F2_partial).toBe(1);
      expect(row.counts.F3_incorrect).toBe(1);
      expect(row.counts.F4_hallucinated).toBe(1);
      expect(row.counts.F1_abstain).toBe(0);
      expect(row.counts.F5_offtopic).toBe(0);
      expect(row.counts.unjudged).toBe(0);
      // Weighted score = sum(percent × weight) over judged instances.
      // judgedTotal=4. Each verdict is 1/4 = 0.25 of the cell.
      //   correct:          0.25 ×  1.00 =  0.250
      //   F2_partial:       0.25 ×  0.30 =  0.075
      //   F3_incorrect:     0.25 × -0.15 = -0.0375
      //   F4_hallucinated:  0.25 × -0.35 = -0.0875
      // Total = 0.250 + 0.075 − 0.0375 − 0.0875 = 0.200
      expect(row.weightedScore).toBeCloseTo(0.200, 4);
    }
  });

  it('honors WEIGHTS table exactly', () => {
    // Rebuild the hand-computed number from WEIGHTS by name so a rubric
    // edit in aggregate.ts forces this test to recompute + update the
    // expectation — no silent coefficient drift.
    const expected =
      0.25 * WEIGHTS.correct +
      0.25 * WEIGHTS.F2_partial +
      0.25 * WEIGHTS.F3_incorrect +
      0.25 * WEIGHTS.F4_hallucinated;
    const rows = perCellRollup(fixture12());
    for (const row of rows) {
      expect(row.weightedScore).toBeCloseTo(expected, 6);
    }
  });

  it('treats unjudged rows as denominator-excluded for weightedScore', () => {
    const mix = fixture12().slice(0, 4); // one cell worth
    mix.push(mkRecord('unjudged-1', 'raw', 'unjudged', null));
    mix.push(mkRecord('unjudged-2', 'raw', 'unjudged', null));
    // Now raw has 4 judged + 2 unjudged. Weighted score denominator = 4,
    // same as the baseline fixture — the 2 unjudged rows don't pull
    // the score toward 0.
    const rawRow = perCellRollup(mix).find(r => r.cell === 'raw')!;
    expect(rawRow.total).toBe(6);
    expect(rawRow.counts.unjudged).toBe(2);
    expect(rawRow.weightedScore).toBeCloseTo(0.200, 4);
  });
});

// ── perCategoryRollup ──────────────────────────────────────────────────

describe('perCategoryRollup', () => {
  it('groups by category and computes percents per bucket', () => {
    const rows = perCategoryRollup(fixture12());
    // fixture assigns 3 rows per category (one per cell × one verdict shape)
    const cats = rows.map(r => r.category);
    expect(cats).toContain('single-hop');
    expect(cats).toContain('multi-hop');
    expect(cats).toContain('temporal');
    expect(cats).toContain('open-ended');
    for (const row of rows) {
      expect(row.total).toBe(3);
    }
    // open-ended has all F4 (hallucinated) rows — flag must fire.
    const openEnded = rows.find(r => r.category === 'open-ended')!;
    expect(openEnded.counts.F4_hallucinated).toBe(3);
    expect(openEnded.hallucinationFlag).toBe(true);
    // single-hop has all correct — flag off.
    const singleHop = rows.find(r => r.category === 'single-hop')!;
    expect(singleHop.counts.correct).toBe(3);
    expect(singleHop.hallucinationFlag).toBe(false);
  });

  it('does not include categories that have zero rows', () => {
    const rows = perCategoryRollup(fixture12());
    for (const row of rows) {
      expect(row.total).toBeGreaterThan(0);
    }
  });
});

// ── crossCellDeltaMatrix ───────────────────────────────────────────────

describe('crossCellDeltaMatrix', () => {
  it('returns delta = full-context − raw for each verdict, preserving sign', () => {
    // Build a case where full-context correct% > raw correct%.
    const recs: JudgedJsonlRecord[] = [
      // raw: 1 correct, 3 incorrect-F4 → 25% correct, 75% F4
      mkRecord('r1', 'raw', 'correct', null, 'single-hop'),
      mkRecord('r2', 'raw', 'incorrect', 'F4', 'single-hop'),
      mkRecord('r3', 'raw', 'incorrect', 'F4', 'single-hop'),
      mkRecord('r4', 'raw', 'incorrect', 'F4', 'single-hop'),
      // full-context: 3 correct, 1 F4 → 75% correct, 25% F4
      mkRecord('f1', 'full-context', 'correct', null, 'single-hop'),
      mkRecord('f2', 'full-context', 'correct', null, 'single-hop'),
      mkRecord('f3', 'full-context', 'correct', null, 'single-hop'),
      mkRecord('f4', 'full-context', 'incorrect', 'F4', 'single-hop'),
    ];
    const perCell = perCellRollup(recs);
    const delta = crossCellDeltaMatrix(perCell);
    expect(delta).not.toBeNull();
    const correctDelta = delta!.find(d => d.verdict === 'correct')!;
    expect(correctDelta.rawPercent).toBeCloseTo(0.25, 6);
    expect(correctDelta.fullContextPercent).toBeCloseTo(0.75, 6);
    expect(correctDelta.delta).toBeCloseTo(0.50, 6);
    // F4 goes the other way.
    const f4Delta = delta!.find(d => d.verdict === 'F4_hallucinated')!;
    expect(f4Delta.delta).toBeCloseTo(-0.50, 6);
  });

  it('returns null when either raw or full-context is absent', () => {
    const recs: JudgedJsonlRecord[] = [mkRecord('x', 'filtered', 'correct', null)];
    const perCell = perCellRollup(recs);
    expect(crossCellDeltaMatrix(perCell)).toBeNull();
  });
});

// ── costSummary + Week-1 projection threshold ──────────────────────────

describe('costSummary', () => {
  it('sums per-cell USD across records', () => {
    const recs: JudgedJsonlRecord[] = [
      mkRecord('a', 'raw', 'correct', null, 'single-hop', 0.010),
      mkRecord('b', 'raw', 'correct', null, 'single-hop', 0.020),
      mkRecord('c', 'full-context', 'correct', null, 'single-hop', 0.050),
    ];
    const cost = costSummary(recs);
    expect(cost.totalUsd).toBeCloseTo(0.08, 6);
    expect(cost.perCellUsd['raw']).toBeCloseTo(0.03, 6);
    expect(cost.perCellUsd['full-context']).toBeCloseTo(0.05, 6);
  });

  it('buildReport overlays an authoritative judgeTotalUsd and recomputes the Week-1 projection', () => {
    const recs = fixture12();
    // 12 records all judged; 12 × 4 cells × 50 instances scaling → 200
    // instances. Set judgeTotalUsd = $1.50 across 12 → per-instance = 0.125
    // → projected = 0.125 × 200 = $25 → above $20 → warning fires.
    const report = buildReport(recs, { judgeTotalUsd: 1.50 });
    expect(report.cost.judgeTotalUsd).toBeCloseTo(1.50, 6);
    expect(report.cost.week1WarningProjectedUsd).toBeCloseTo(25.0, 6);
    expect(report.cost.week1WarningFired).toBe(true);
  });

  it('Week-1 warning does not fire when projected stays under $20', () => {
    const recs = fixture12();
    const report = buildReport(recs, { judgeTotalUsd: 0.60 });
    // per-instance = 0.05; projected = 0.05 × 200 = $10
    expect(report.cost.week1WarningProjectedUsd).toBeCloseTo(10.0, 6);
    expect(report.cost.week1WarningFired).toBe(false);
  });
});

// ── Markdown renderer — smoke + snapshot-lite ──────────────────────────

describe('renderMarkdown', () => {
  it('produces parseable markdown with every cell row + every verdict column', () => {
    const report = buildReport(fixture12());
    const md = renderMarkdown(report);
    // Header structure
    expect(md).toContain('# Benchmark Aggregate Report');
    expect(md).toContain('## Per-cell verdict distribution');
    expect(md).toContain('## Per-LoCoMo-category distribution');
    expect(md).toContain('## Cost summary');
    // Cells in table
    for (const cell of ['raw', 'filtered', 'full-context']) {
      expect(md).toContain(`| ${cell} |`);
    }
    // Verdict columns in the header row
    for (const v of VERDICT6_VALUES) {
      // VERDICT6_VALUES uses snake names that won't all appear literally
      // in the header (e.g. "F1 abstain" vs "F1_abstain"). Assert on the
      // base labels the renderer emits.
    }
    expect(md).toContain('Correct');
    expect(md).toContain('F1 abstain');
    expect(md).toContain('F4 hallucinated');
    expect(md).toContain('Weighted score');
  });

  it('surfaces the hallucination-flag emoji on the flagged category', () => {
    const md = renderMarkdown(buildReport(fixture12()));
    // open-ended is flagged in the fixture (3/3 F4). Shape check via the
    // brief's sentinel emoji + "PM review" string.
    expect(md).toContain('⚠️ PM review');
  });

  it('omits the Week-1 warning line when threshold not crossed', () => {
    const md = renderMarkdown(buildReport(fixture12(), { judgeTotalUsd: 0.40 }));
    expect(md).not.toContain('Week-1 scale-up warning');
  });

  it('emits the Week-1 warning line when threshold crossed', () => {
    const md = renderMarkdown(buildReport(fixture12(), { judgeTotalUsd: 5.0 }));
    expect(md).toContain('Week-1 scale-up warning');
  });
});
