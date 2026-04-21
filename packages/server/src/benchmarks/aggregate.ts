/**
 * Aggregate.ts — failure-mode distribution rollup for Stage 1 / Stage 2
 * preflight + Week 1/2 main runs.
 *
 * Brief:  PM-Waggle-OS/briefs/2026-04-20-cc-sprint-9-tasks.md Task 3
 * Rubric: PM-Waggle-OS/strategy/2026-04-20-failure-mode-taxonomy.md §5
 *
 * Consumes JSONL output from `benchmarks/harness` (one record per
 * instance per cell) and emits a structured report covering:
 *   1. Per-cell verdict distribution + weighted quality score
 *   2. Per-LoCoMo-category distribution (single/multi-hop/temporal/
 *      open-ended) with a hallucination rate flag for PM review
 *   3. Cross-cell delta matrix (full-stack vs raw: correct / F4 /
 *      F1 lift per taxonomy §5)
 *   4. Judge cost summary when the run included judge calls
 *
 * Input shape: each JSONL line has the fields declared in
 * `benchmarks/harness/src/types.ts` (optional `judge_verdict`,
 * `judge_failure_mode`, `model_answer`, etc.). Pre-judge records — rows
 * without `judge_verdict` — are counted under an `unjudged` bucket so
 * partial-run reports stay honest instead of silently skipping data.
 */

export type Verdict6 =
  | 'correct'
  | 'F1_abstain'
  | 'F2_partial'
  | 'F3_incorrect'
  | 'F4_hallucinated'
  | 'F5_offtopic'
  | 'unjudged';

export type CellName = 'raw' | 'memory-only' | 'evolve-only' | 'full-stack';
const CELL_NAMES: readonly CellName[] = ['raw', 'memory-only', 'evolve-only', 'full-stack'];

/** Categories match `preflight-locomo-50.json` `_meta.locomo_category_map`
 *  minus the excluded adversarial bucket. Unknown categories fall into
 *  `other` so the report still tallies them instead of dropping. */
export type LocomoCategory = 'single-hop' | 'multi-hop' | 'temporal' | 'open-ended' | 'other';
const LOCOMO_CATEGORIES: readonly LocomoCategory[] = [
  'single-hop', 'multi-hop', 'temporal', 'open-ended', 'other',
];

/** Inputs can carry either the explicit category column or the
 *  pre-lock instance_id (`locomo_<sample_id>_q<qindex>`) from which
 *  we can recover the category via a sibling lookup. This module only
 *  consumes the already-tagged JsonlRecord; category recovery lives in
 *  the caller (harness runner attaches `category` when loading from
 *  the sample lock). */
export interface JudgedJsonlRecord {
  turnId: string;
  cell: string;
  instance_id: string;
  model: string;
  seed: number;
  accuracy: number;
  p50_latency_ms: number;
  p95_latency_ms: number;
  usd_per_query: number;
  failure_mode: string | null;
  model_answer?: string;
  judge_verdict?: 'correct' | 'incorrect';
  judge_failure_mode?: 'F1' | 'F2' | 'F3' | 'F4' | 'F5' | null;
  judge_rationale?: string;
  judge_model?: string;
  judge_timestamp?: string;
  judge_confidence?: number;
  judge_ensemble?: Array<{
    model: string;
    verdict: 'correct' | 'incorrect';
    failure_mode: 'F1' | 'F2' | 'F3' | 'F4' | 'F5' | null;
    rationale?: string;
    latency_ms?: number;
  }>;
  /** Optional category tag attached by the runner when the sample came
   *  from preflight-locomo-50.json. When absent, rows fall into
   *  `other` for the per-category rollup. */
  category?: LocomoCategory;
}

/** Projection from the taxonomy §9 binary `verdict` + `failure_mode`
 *  slot pair to the 6-value Verdict6 enum the brief Task-1 spec asked
 *  for. Centralising this here means JsonlRecord keeps the canonical
 *  taxonomy shape while the aggregator surfaces the denser report
 *  form. */
export function projectVerdict6(r: JudgedJsonlRecord): Verdict6 {
  if (r.judge_verdict === undefined) return 'unjudged';
  if (r.judge_verdict === 'correct') return 'correct';
  switch (r.judge_failure_mode) {
    case 'F1': return 'F1_abstain';
    case 'F2': return 'F2_partial';
    case 'F3': return 'F3_incorrect';
    case 'F4': return 'F4_hallucinated';
    case 'F5': return 'F5_offtopic';
    default:
      // Contract violation — the taxonomy schema (judge module's Zod)
      // prevents `incorrect` with a null failure_mode. If it sneaks
      // through a malformed JSONL row, bucket as F3 by convention so
      // the row doesn't silently drop.
      return 'F3_incorrect';
  }
}

export const VERDICT6_VALUES: readonly Verdict6[] = [
  'correct', 'F1_abstain', 'F2_partial', 'F3_incorrect', 'F4_hallucinated', 'F5_offtopic', 'unjudged',
];

// ── Per-cell distribution + weighted score ─────────────────────────────

export interface PerCellRow {
  cell: string;
  total: number;
  counts: Record<Verdict6, number>;
  percents: Record<Verdict6, number>;
  /** Weighted quality score per taxonomy §5 rubric. `unjudged` is
   *  excluded from the denominator so the score is computed over the
   *  set of instances actually graded. */
  weightedScore: number;
}

/** Taxonomy §5 coefficient table. Positive weights for correct / F2
 *  (partial credit), zero for F1 (abstain neutral), negatives for
 *  F3 / F4 / F5. Exported so Task-3 unit tests can reproduce the
 *  hand-check number by name. */
export const WEIGHTS: Record<Exclude<Verdict6, 'unjudged'>, number> = {
  correct: 1.0,
  F2_partial: 0.30,
  F1_abstain: 0.0,
  F3_incorrect: -0.15,
  F4_hallucinated: -0.35,
  F5_offtopic: -0.10,
};

function emptyVerdictMap(fill = 0): Record<Verdict6, number> {
  const out = {} as Record<Verdict6, number>;
  for (const v of VERDICT6_VALUES) out[v] = fill;
  return out;
}

export function perCellRollup(records: readonly JudgedJsonlRecord[]): PerCellRow[] {
  const byCell = new Map<string, JudgedJsonlRecord[]>();
  for (const r of records) {
    const arr = byCell.get(r.cell) ?? [];
    arr.push(r);
    byCell.set(r.cell, arr);
  }
  const rows: PerCellRow[] = [];
  // Emit in CELL_NAMES order when present, then any controls / extras.
  const orderedCellKeys = [
    ...CELL_NAMES.filter(c => byCell.has(c)),
    ...[...byCell.keys()].filter(c => !CELL_NAMES.includes(c as CellName)),
  ];
  for (const cell of orderedCellKeys) {
    const rowRecords = byCell.get(cell)!;
    const counts = emptyVerdictMap();
    for (const r of rowRecords) counts[projectVerdict6(r)]++;
    const total = rowRecords.length;
    const judgedTotal = total - counts['unjudged'];
    const percents = emptyVerdictMap();
    for (const v of VERDICT6_VALUES) {
      percents[v] = total === 0 ? 0 : counts[v] / total;
    }
    let weightedScore = 0;
    if (judgedTotal > 0) {
      for (const v of VERDICT6_VALUES) {
        if (v === 'unjudged') continue;
        weightedScore += (counts[v] / judgedTotal) * WEIGHTS[v];
      }
    }
    rows.push({ cell, total, counts, percents, weightedScore });
  }
  return rows;
}

// ── Per-LoCoMo-category distribution ───────────────────────────────────

export interface PerCategoryRow {
  category: LocomoCategory;
  total: number;
  counts: Record<Verdict6, number>;
  percents: Record<Verdict6, number>;
  /** True when F4 (hallucinated) share exceeds 20% — flags the
   *  category for PM spot-review per brief §Task-3 rule 2. */
  hallucinationFlag: boolean;
}

const HALLUCINATION_FLAG_THRESHOLD = 0.20;

export function perCategoryRollup(records: readonly JudgedJsonlRecord[]): PerCategoryRow[] {
  const byCat = new Map<LocomoCategory, JudgedJsonlRecord[]>();
  for (const r of records) {
    const cat = r.category ?? 'other';
    const arr = byCat.get(cat) ?? [];
    arr.push(r);
    byCat.set(cat, arr);
  }
  const rows: PerCategoryRow[] = [];
  for (const cat of LOCOMO_CATEGORIES) {
    const recs = byCat.get(cat) ?? [];
    if (recs.length === 0) continue;
    const counts = emptyVerdictMap();
    for (const r of recs) counts[projectVerdict6(r)]++;
    const total = recs.length;
    const percents = emptyVerdictMap();
    for (const v of VERDICT6_VALUES) {
      percents[v] = total === 0 ? 0 : counts[v] / total;
    }
    rows.push({
      category: cat,
      total,
      counts,
      percents,
      hallucinationFlag: percents['F4_hallucinated'] > HALLUCINATION_FLAG_THRESHOLD,
    });
  }
  return rows;
}

// ── Cross-cell delta matrix (full-stack vs raw) ────────────────────────

export interface CrossCellDelta {
  verdict: Verdict6;
  rawPercent: number;
  fullStackPercent: number;
  /** fullStack − raw. Positive = full-stack raised this verdict's share;
   *  negative = full-stack lowered it. The brief's headline expectation:
   *  `correct` delta > 0, `F4_hallucinated` delta < 0, `F1_abstain`
   *  may go either way (more abstains is sometimes an OK signal). */
  delta: number;
}

export function crossCellDeltaMatrix(perCell: readonly PerCellRow[]): CrossCellDelta[] | null {
  const raw = perCell.find(r => r.cell === 'raw');
  const full = perCell.find(r => r.cell === 'full-stack');
  if (!raw || !full) return null;
  const out: CrossCellDelta[] = [];
  for (const v of VERDICT6_VALUES) {
    out.push({
      verdict: v,
      rawPercent: raw.percents[v],
      fullStackPercent: full.percents[v],
      delta: full.percents[v] - raw.percents[v],
    });
  }
  return out;
}

// ── Cost summary ───────────────────────────────────────────────────────

export interface CostSummary {
  totalUsd: number;
  perCellUsd: Record<string, number>;
  judgeTotalUsd: number;
  judgeCallCount: number;
  /** Median judge call latency across the run; `null` when no judge
   *  call recorded a latency. */
  medianJudgeMs: number | null;
  /** Brief §Task-3 rule 4: flag when total judge spend would exceed
   *  ~$20 projected for a full 4-cell × 50-instance run. Computed as
   *  `perInstanceJudgeUsd × 200`. */
  week1WarningProjectedUsd: number;
  week1WarningFired: boolean;
}

const WEEK1_PROJECTION_INSTANCE_COUNT = 200; // 4 cells × 50 instances

export function costSummary(records: readonly JudgedJsonlRecord[]): CostSummary {
  const perCellUsd: Record<string, number> = {};
  let total = 0;
  const judgeLatencies: number[] = [];
  let judgeTotal = 0;
  let judgeCalls = 0;
  for (const r of records) {
    total += r.usd_per_query;
    perCellUsd[r.cell] = (perCellUsd[r.cell] ?? 0) + r.usd_per_query;
    if (r.judge_ensemble) {
      for (const entry of r.judge_ensemble) {
        if (typeof entry.latency_ms === 'number') judgeLatencies.push(entry.latency_ms);
      }
      judgeCalls += r.judge_ensemble.length;
    } else if (r.judge_verdict !== undefined) {
      // Single-judge call — we don't store per-judge latency in the
      // JsonlRecord shape (no judge_latency_ms field), so the median
      // is computed only over ensemble entries that carry it. If no
      // ensemble row is present, medianJudgeMs stays null.
      judgeCalls += 1;
    }
  }
  const judgedCount = records.filter(r => r.judge_verdict !== undefined).length;
  // Per-instance judge spend is not stored directly — the aggregator
  // doesn't know judge USD without the onCall sink. When the caller
  // passes judgeTotalUsd separately (see buildReport), we populate
  // this from the authoritative source. Here we return zero; buildReport
  // overwrites with the real total.
  const medianJudgeMs = judgeLatencies.length === 0
    ? null
    : (() => {
        const s = [...judgeLatencies].sort((a, b) => a - b);
        const mid = Math.floor(s.length / 2);
        return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
      })();
  const perInstanceJudgeUsd = judgedCount > 0 ? judgeTotal / judgedCount : 0;
  const projected = perInstanceJudgeUsd * WEEK1_PROJECTION_INSTANCE_COUNT;
  return {
    totalUsd: total,
    perCellUsd,
    judgeTotalUsd: judgeTotal,
    judgeCallCount: judgeCalls,
    medianJudgeMs,
    week1WarningProjectedUsd: projected,
    week1WarningFired: projected > 20,
  };
}

// ── Top-level report + markdown renderer ───────────────────────────────

export interface AggregateReport {
  generatedAt: string;
  totalRecords: number;
  perCell: PerCellRow[];
  perCategory: PerCategoryRow[];
  crossCellDelta: CrossCellDelta[] | null;
  cost: CostSummary;
}

export function buildReport(
  records: readonly JudgedJsonlRecord[],
  opts: { judgeTotalUsd?: number } = {},
): AggregateReport {
  const perCell = perCellRollup(records);
  const perCategory = perCategoryRollup(records);
  const crossCellDelta = crossCellDeltaMatrix(perCell);
  const cost = costSummary(records);
  // Callers that run the harness end-to-end know the authoritative
  // judge spend because judge-client emits `onCall` entries. Pass the
  // aggregated total here so the report carries real dollars instead
  // of the placeholder zero computed from JSONL alone.
  if (opts.judgeTotalUsd !== undefined) {
    cost.judgeTotalUsd = opts.judgeTotalUsd;
    const judgedCount = records.filter(r => r.judge_verdict !== undefined).length;
    const perInstance = judgedCount > 0 ? opts.judgeTotalUsd / judgedCount : 0;
    cost.week1WarningProjectedUsd = perInstance * WEEK1_PROJECTION_INSTANCE_COUNT;
    cost.week1WarningFired = cost.week1WarningProjectedUsd > 20;
  }
  return {
    generatedAt: new Date().toISOString(),
    totalRecords: records.length,
    perCell,
    perCategory,
    crossCellDelta,
    cost,
  };
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function fmtUsd(n: number): string {
  return `$${n.toFixed(n < 1 ? 6 : 2)}`;
}

export function renderMarkdown(report: AggregateReport): string {
  const lines: string[] = [];
  lines.push('# Benchmark Aggregate Report');
  lines.push('');
  lines.push(`**Generated at:** ${report.generatedAt}`);
  lines.push(`**Total records:** ${report.totalRecords}`);
  lines.push('');
  lines.push('## Per-cell verdict distribution');
  lines.push('');
  lines.push('| Cell | Total | Correct | F1 abstain | F2 partial | F3 incorrect | F4 hallucinated | F5 off-topic | Unjudged | Weighted score |');
  lines.push('|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
  for (const row of report.perCell) {
    lines.push(
      `| ${row.cell} | ${row.total} | ${row.counts.correct} (${pct(row.percents.correct)}) | ` +
      `${row.counts.F1_abstain} (${pct(row.percents.F1_abstain)}) | ` +
      `${row.counts.F2_partial} (${pct(row.percents.F2_partial)}) | ` +
      `${row.counts.F3_incorrect} (${pct(row.percents.F3_incorrect)}) | ` +
      `${row.counts.F4_hallucinated} (${pct(row.percents.F4_hallucinated)}) | ` +
      `${row.counts.F5_offtopic} (${pct(row.percents.F5_offtopic)}) | ` +
      `${row.counts.unjudged} (${pct(row.percents.unjudged)}) | ` +
      `${row.weightedScore.toFixed(3)} |`,
    );
  }
  lines.push('');
  if (report.perCategory.length > 0) {
    lines.push('## Per-LoCoMo-category distribution');
    lines.push('');
    lines.push('| Category | Total | Correct% | F4 (hallucinated)% | Flagged? |');
    lines.push('|---|---:|---:|---:|:---:|');
    for (const row of report.perCategory) {
      lines.push(
        `| ${row.category} | ${row.total} | ${pct(row.percents.correct)} | ` +
        `${pct(row.percents.F4_hallucinated)} | ` +
        `${row.hallucinationFlag ? '⚠️ PM review' : '✓'} |`,
      );
    }
    lines.push('');
  }
  if (report.crossCellDelta) {
    lines.push('## Full-stack vs raw delta');
    lines.push('');
    lines.push('| Verdict | raw % | full-stack % | Δ (full − raw) |');
    lines.push('|---|---:|---:|---:|');
    for (const r of report.crossCellDelta) {
      const sign = r.delta > 0 ? '+' : '';
      lines.push(`| ${r.verdict} | ${pct(r.rawPercent)} | ${pct(r.fullStackPercent)} | ${sign}${pct(r.delta)} |`);
    }
    lines.push('');
  }
  lines.push('## Cost summary');
  lines.push('');
  lines.push(`- Total cell spend: **${fmtUsd(report.cost.totalUsd)}**`);
  lines.push(`- Judge spend: **${fmtUsd(report.cost.judgeTotalUsd)}** across ${report.cost.judgeCallCount} call(s)`);
  if (report.cost.medianJudgeMs !== null) {
    lines.push(`- Median judge latency: ${report.cost.medianJudgeMs.toFixed(0)} ms`);
  }
  if (Object.keys(report.cost.perCellUsd).length > 0) {
    lines.push('- Per-cell cell spend:');
    for (const [cell, usd] of Object.entries(report.cost.perCellUsd)) {
      lines.push(`  - ${cell}: ${fmtUsd(usd)}`);
    }
  }
  if (report.cost.week1WarningFired) {
    lines.push(
      `- ⚠️ **Week-1 scale-up warning:** projected judge spend for a full 4-cell × 50-instance run is ` +
      `${fmtUsd(report.cost.week1WarningProjectedUsd)} (threshold $20). Flagged per brief §Task-3 rule 4.`,
    );
  }
  return lines.join('\n');
}
