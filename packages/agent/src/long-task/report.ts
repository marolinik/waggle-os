/**
 * Reporting module — Phase 4.2 of agent-fix sprint
 * (per decisions/2026-04-26-agent-fix-sprint-plan.md §4.2)
 *
 * Consumes per-instance agent prediction records and emits four artifacts:
 *   - summary.json          machine-readable per-run aggregate
 *   - summary.md            human-readable per-run aggregate
 *   - predictions.jsonl     one record per (model, cell, instance)
 *   - failures.jsonl        one record per failed instance with Phase 4.1 classification
 *
 * Required metrics per (model, cell):
 *   - accuracy_raw + accuracy_normalized (substring-match against gold)
 *   - abstention rate
 *   - thinking_leakage rate, format_violation rate
 *   - avg output chars (raw + normalized), avg latency, total cost
 *   - 10-bucket failure distribution from Phase 4.1 classifier
 *   - Wilson 95% CI half-width
 *   - bootstrap 95% CI when N >= 30
 *   - win/loss vs baseline cell (in pp)
 *
 * Required overall metrics:
 *   - cross-model comparison matrix (cells × models)
 *   - best model per cell
 *   - regression notes (cell drop ≥ 5 pp vs baseline)
 *   - aggregate failure distribution
 *
 * NOTE on stats inlining: Wilson CI + cluster-free bootstrap are inlined here
 * rather than imported from benchmarks/harness/src/stats/ because @waggle/agent
 * cannot import from benchmarks/harness/ (wrong dependency direction). Future
 * Sprint 12 cleanup should hoist the shared math to @waggle/shared and
 * deduplicate.
 */

import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import {
  classifyFailure,
  failureDistribution,
  FAILURE_CATEGORIES,
  type FailureCategory,
  type FailureClassification,
  type ClassifierOptions,
} from './failure-classify.js';

// ─────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────

export interface AgentPredictionRecord {
  model: string;
  cell: string;
  instance_id: string;
  question?: string;
  gold_answer: string | readonly string[];
  output_raw: string;
  output_normalized: string;
  judge_verdict?: 'correct' | 'incorrect' | 'null' | string;
  cost_usd?: number;
  latency_ms?: number;
  tokens_in?: number;
  tokens_out?: number;
  upstream_error?: string;
  /** Optional pre-classified failure; classifier is skipped if set. */
  failure_classification?: FailureClassification;
}

export interface ReportOptions {
  run_id: string;
  /** Baseline cell name for win/loss comparison. Default 'raw'. */
  baseline_cell?: string;
  /** Regression threshold in percentage points. Default 5.0 pp drop vs baseline. */
  regression_threshold_pp?: number;
  /** Bootstrap iterations for CI. Default 1000. Only computed when N >= 30. */
  bootstrap_iterations?: number;
  /** Optional LLM judge for the failure classifier on low-confidence cases. */
  failure_classifier?: ClassifierOptions;
  /** Optional seeded RNG for replay-deterministic bootstrap. Default Math.random. */
  rng?: () => number;
}

export interface CellMetrics {
  n: number;
  accuracy_raw: number;
  accuracy_normalized: number;
  abstention_rate: number;
  thinking_leakage_rate: number;
  format_violation_rate: number;
  avg_output_chars_raw: number;
  avg_output_chars_normalized: number;
  avg_latency_ms: number;
  total_cost_usd: number;
  failure_distribution: Record<FailureCategory, number>;
  wilson_95ci_lower: number;
  wilson_95ci_upper: number;
  wilson_95ci_half_width_pp: number;
  bootstrap_95ci_lower?: number;
  bootstrap_95ci_upper?: number;
  /** Delta vs baseline cell in percentage points (accuracy_normalized). */
  win_loss_vs_baseline_pp?: number;
}

export interface ModelComparisonMatrix {
  rows: readonly string[];
  columns: readonly string[];
  /** values[rowIdx][colIdx] = accuracy_normalized for (cell=rows[r], model=cols[c]); NaN if missing. */
  values: readonly (readonly number[])[];
}

export interface RunSummary {
  report_version: 1;
  run_id: string;
  generated_at_iso: string;
  n_instances: number;
  models: readonly string[];
  cells: readonly string[];
  baseline_cell?: string;
  per_model_per_cell: Readonly<Record<string, Readonly<Record<string, CellMetrics>>>>;
  cross_model_matrix: ModelComparisonMatrix;
  best_per_cell: Readonly<Record<string, string>>;
  regression_notes: readonly string[];
  aggregate_failure_distribution: Readonly<Record<FailureCategory, number>>;
}

export interface ReportArtifacts {
  summary: RunSummary;
  summary_md: string;
  predictions_jsonl: string;
  failures_jsonl: string;
}

// ─────────────────────────────────────────────────────────────────────────
// Inline stats helpers
// ─────────────────────────────────────────────────────────────────────────

const Z_95 = 1.959964;

interface WilsonResult {
  point_estimate: number;
  lower: number;
  upper: number;
  half_width: number;
}

/** Wilson 95% binomial CI. Returns { lower, upper, half_width } in [0, 1]. */
function wilsonCI(successes: number, trials: number): WilsonResult {
  if (trials === 0) return { point_estimate: 0, lower: 0, upper: 0, half_width: 0 };
  const p = successes / trials;
  const z = Z_95;
  const z2 = z * z;
  const denom = 1 + z2 / trials;
  const center = (p + z2 / (2 * trials)) / denom;
  const half = (z * Math.sqrt(p * (1 - p) / trials + z2 / (4 * trials * trials))) / denom;
  return {
    point_estimate: p,
    lower: Math.max(0, center - half),
    upper: Math.min(1, center + half),
    half_width: half,
  };
}

/** Non-clustered bootstrap 95% CI on a binary correctness array. */
function bootstrapCI(correctness: readonly number[], iterations: number, rng: () => number): { lower: number; upper: number } {
  const n = correctness.length;
  if (n === 0) return { lower: 0, upper: 0 };
  const samples: number[] = [];
  for (let i = 0; i < iterations; i += 1) {
    let sum = 0;
    for (let j = 0; j < n; j += 1) {
      const idx = Math.floor(rng() * n);
      sum += correctness[idx]!;
    }
    samples.push(sum / n);
  }
  samples.sort((a, b) => a - b);
  const lo = samples[Math.floor(0.025 * iterations)] ?? 0;
  const hi = samples[Math.floor(0.975 * iterations)] ?? 0;
  return { lower: lo, upper: hi };
}

// ─────────────────────────────────────────────────────────────────────────
// Substring-match accuracy (v6 rule)
// ─────────────────────────────────────────────────────────────────────────

function asGolds(g: string | readonly string[]): readonly string[] {
  return typeof g === 'string' ? [g] : g;
}

function scoreAccuracy(output: string, gold: string | readonly string[]): number {
  const golds = asGolds(gold);
  if (golds.length === 0) return 0;
  const lower = output.toLowerCase();
  for (const g of golds) {
    if (g && lower.includes(g.toLowerCase())) return 1;
  }
  return 0;
}

// ─────────────────────────────────────────────────────────────────────────
// Per-cell metric computation
// ─────────────────────────────────────────────────────────────────────────

const UNKNOWN_OUTPUTS = new Set([
  'unknown', 'i don\'t know', 'i do not know', 'cannot determine',
  'cannot be determined', 'not specified', 'no information', 'insufficient information',
  'no answer', 'n/a', 'na', 'none',
]);

const THINKING_RE = /<\s*\/?\s*think(?:ing)?\s*[>\s]/i;

function isAbstention(output: string): boolean {
  const lc = output.toLowerCase().trim();
  return UNKNOWN_OUTPUTS.has(lc);
}

function hasThinkingLeakage(rawOutput: string): boolean {
  return THINKING_RE.test(rawOutput);
}

async function computeCellMetrics(
  records: readonly AgentPredictionRecord[],
  opts: ReportOptions,
): Promise<{ metrics: CellMetrics; failures: ReadonlyArray<AgentPredictionRecord & { classification: FailureClassification }> }> {
  const n = records.length;
  if (n === 0) {
    const zeros = Object.fromEntries(FAILURE_CATEGORIES.map(c => [c, 0])) as Record<FailureCategory, number>;
    return {
      metrics: {
        n: 0, accuracy_raw: 0, accuracy_normalized: 0,
        abstention_rate: 0, thinking_leakage_rate: 0, format_violation_rate: 0,
        avg_output_chars_raw: 0, avg_output_chars_normalized: 0,
        avg_latency_ms: 0, total_cost_usd: 0,
        failure_distribution: zeros,
        wilson_95ci_lower: 0, wilson_95ci_upper: 0, wilson_95ci_half_width_pp: 0,
      },
      failures: [],
    };
  }

  const correctnessRaw: number[] = [];
  const correctnessNormalized: number[] = [];
  let abstentions = 0;
  let thinkingLeaks = 0;
  let totalRawChars = 0;
  let totalNormalizedChars = 0;
  let totalLatency = 0;
  let totalCost = 0;

  for (const r of records) {
    correctnessRaw.push(scoreAccuracy(r.output_raw, r.gold_answer));
    correctnessNormalized.push(scoreAccuracy(r.output_normalized, r.gold_answer));
    if (isAbstention(r.output_normalized)) abstentions += 1;
    if (hasThinkingLeakage(r.output_raw)) thinkingLeaks += 1;
    totalRawChars += r.output_raw.length;
    totalNormalizedChars += r.output_normalized.length;
    totalLatency += r.latency_ms ?? 0;
    totalCost += r.cost_usd ?? 0;
  }

  // Classify failures (where accuracy_normalized = 0).
  const classified: Array<AgentPredictionRecord & { classification: FailureClassification }> = [];
  for (let i = 0; i < records.length; i += 1) {
    const r = records[i]!;
    if (correctnessNormalized[i] === 1) continue; // not a failure
    const classification = r.failure_classification ?? await classifyFailure({
      model_output: r.output_normalized,
      gold_answer: r.gold_answer,
      question: r.question,
      upstream_error: r.upstream_error,
    }, opts.failure_classifier ?? {});
    classified.push({ ...r, classification });
  }

  const fdist = failureDistribution(classified.map(c => c.classification));
  const formatViolations = fdist.format_violation;

  const successesNorm = correctnessNormalized.reduce((a, b) => a + b, 0);
  const wilson = wilsonCI(successesNorm, n);

  let bootstrap: { lower: number; upper: number } | undefined;
  const bootIter = opts.bootstrap_iterations ?? 1000;
  if (n >= 30) {
    bootstrap = bootstrapCI(correctnessNormalized, bootIter, opts.rng ?? Math.random);
  }

  const metrics: CellMetrics = {
    n,
    accuracy_raw: correctnessRaw.reduce((a, b) => a + b, 0) / n,
    accuracy_normalized: successesNorm / n,
    abstention_rate: abstentions / n,
    thinking_leakage_rate: thinkingLeaks / n,
    format_violation_rate: formatViolations / n,
    avg_output_chars_raw: totalRawChars / n,
    avg_output_chars_normalized: totalNormalizedChars / n,
    avg_latency_ms: totalLatency / n,
    total_cost_usd: totalCost,
    failure_distribution: fdist,
    wilson_95ci_lower: wilson.lower,
    wilson_95ci_upper: wilson.upper,
    wilson_95ci_half_width_pp: wilson.half_width * 100,
    ...(bootstrap ? { bootstrap_95ci_lower: bootstrap.lower, bootstrap_95ci_upper: bootstrap.upper } : {}),
  };

  return { metrics, failures: classified };
}

// ─────────────────────────────────────────────────────────────────────────
// Cross-model matrix + best per cell + regression notes
// ─────────────────────────────────────────────────────────────────────────

function buildCrossModelMatrix(
  perMperC: Readonly<Record<string, Readonly<Record<string, CellMetrics>>>>,
  models: readonly string[],
  cells: readonly string[],
): ModelComparisonMatrix {
  const values: number[][] = cells.map(cell => models.map(model => {
    const m = perMperC[model]?.[cell];
    return m ? m.accuracy_normalized : Number.NaN;
  }));
  return { rows: cells, columns: models, values };
}

function bestModelPerCell(
  perMperC: Readonly<Record<string, Readonly<Record<string, CellMetrics>>>>,
  models: readonly string[],
  cells: readonly string[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const cell of cells) {
    let bestModel = '';
    let bestScore = -Infinity;
    for (const m of models) {
      const score = perMperC[m]?.[cell]?.accuracy_normalized ?? -Infinity;
      if (score > bestScore) {
        bestScore = score;
        bestModel = m;
      }
    }
    if (bestModel) out[cell] = bestModel;
  }
  return out;
}

function regressionNotes(
  perMperC: Readonly<Record<string, Readonly<Record<string, CellMetrics>>>>,
  models: readonly string[],
  cells: readonly string[],
  baselineCell: string,
  thresholdPp: number,
): string[] {
  const notes: string[] = [];
  for (const m of models) {
    const baseAcc = perMperC[m]?.[baselineCell]?.accuracy_normalized;
    if (baseAcc === undefined) continue;
    for (const c of cells) {
      if (c === baselineCell) continue;
      const acc = perMperC[m]?.[c]?.accuracy_normalized;
      if (acc === undefined) continue;
      const deltaPp = (acc - baseAcc) * 100;
      if (-deltaPp >= thresholdPp) {
        notes.push(
          `Regression: ${m}/${c} (acc=${(acc * 100).toFixed(1)}%) is ${(-deltaPp).toFixed(1)}pp below baseline ${baselineCell} (acc=${(baseAcc * 100).toFixed(1)}%)`,
        );
      }
    }
  }
  return notes;
}

function aggregateFailureDistribution(
  perMperC: Readonly<Record<string, Readonly<Record<string, CellMetrics>>>>,
): Record<FailureCategory, number> {
  const agg = Object.fromEntries(FAILURE_CATEGORIES.map(c => [c, 0])) as Record<FailureCategory, number>;
  for (const modelMap of Object.values(perMperC)) {
    for (const cm of Object.values(modelMap)) {
      for (const c of FAILURE_CATEGORIES) {
        agg[c] += cm.failure_distribution[c];
      }
    }
  }
  return agg;
}

// ─────────────────────────────────────────────────────────────────────────
// Markdown rendering
// ─────────────────────────────────────────────────────────────────────────

function renderSummaryMd(summary: RunSummary): string {
  const lines: string[] = [];
  lines.push(`# Run Report — ${summary.run_id}`);
  lines.push('');
  lines.push(`Generated: ${summary.generated_at_iso}`);
  lines.push(`N instances: ${summary.n_instances}`);
  lines.push(`Models: ${summary.models.join(', ')}`);
  lines.push(`Cells: ${summary.cells.join(', ')}`);
  if (summary.baseline_cell) lines.push(`Baseline cell: \`${summary.baseline_cell}\``);
  lines.push('');

  // Per-model tables.
  for (const m of summary.models) {
    lines.push(`## ${m}`);
    lines.push('');
    lines.push('| cell | n | acc_raw | acc_norm | 95% CI | abstain | think_leak | fmt_viol | avg_lat_ms | cost_$ | win/loss vs baseline |');
    lines.push('|---|---|---|---|---|---|---|---|---|---|---|');
    for (const c of summary.cells) {
      const cm = summary.per_model_per_cell[m]?.[c];
      if (!cm) {
        lines.push(`| ${c} | – | – | – | – | – | – | – | – | – | – |`);
        continue;
      }
      const wlPp = cm.win_loss_vs_baseline_pp;
      const wlStr = wlPp === undefined ? '–' : `${wlPp >= 0 ? '+' : ''}${wlPp.toFixed(1)}pp`;
      lines.push([
        c,
        cm.n,
        (cm.accuracy_raw * 100).toFixed(1) + '%',
        (cm.accuracy_normalized * 100).toFixed(1) + '%',
        `[${(cm.wilson_95ci_lower * 100).toFixed(1)}%, ${(cm.wilson_95ci_upper * 100).toFixed(1)}%]`,
        (cm.abstention_rate * 100).toFixed(1) + '%',
        (cm.thinking_leakage_rate * 100).toFixed(1) + '%',
        (cm.format_violation_rate * 100).toFixed(1) + '%',
        cm.avg_latency_ms.toFixed(0),
        cm.total_cost_usd.toFixed(4),
        wlStr,
      ].map(v => String(v)).join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
    }
    lines.push('');
  }

  // Cross-model comparison matrix.
  lines.push('## Cross-model comparison (accuracy_normalized %)');
  lines.push('');
  lines.push(`| cell | ${summary.cross_model_matrix.columns.join(' | ')} | best |`);
  lines.push(`| --- | ${summary.cross_model_matrix.columns.map(() => '---').join(' | ')} | --- |`);
  for (let r = 0; r < summary.cross_model_matrix.rows.length; r += 1) {
    const cell = summary.cross_model_matrix.rows[r]!;
    const row = summary.cross_model_matrix.values[r]!.map(v => Number.isNaN(v) ? '–' : (v * 100).toFixed(1) + '%');
    const best = summary.best_per_cell[cell] ?? '–';
    lines.push(`| ${cell} | ${row.join(' | ')} | **${best}** |`);
  }
  lines.push('');

  // Aggregate failure distribution.
  lines.push('## Aggregate failure distribution (across all model × cell)');
  lines.push('');
  lines.push('| category | count |');
  lines.push('|---|---|');
  for (const c of FAILURE_CATEGORIES) {
    lines.push(`| ${c} | ${summary.aggregate_failure_distribution[c]} |`);
  }
  lines.push('');

  // Regression notes.
  if (summary.regression_notes.length > 0) {
    lines.push('## Regression notes');
    lines.push('');
    for (const n of summary.regression_notes) lines.push(`- ${n}`);
    lines.push('');
  } else {
    lines.push('## Regression notes');
    lines.push('');
    lines.push('_(none — no cell drops ≥ regression threshold vs baseline)_');
    lines.push('');
  }

  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────
// Main entry point
// ─────────────────────────────────────────────────────────────────────────

export async function generateReport(
  records: readonly AgentPredictionRecord[],
  opts: ReportOptions,
): Promise<ReportArtifacts> {
  const baseline = opts.baseline_cell ?? 'raw';
  const regressionThreshold = opts.regression_threshold_pp ?? 5.0;

  const models = Array.from(new Set(records.map(r => r.model))).sort();
  const cells = Array.from(new Set(records.map(r => r.cell))).sort();

  const perMperC: Record<string, Record<string, CellMetrics>> = {};
  const allFailures: Array<AgentPredictionRecord & { classification: FailureClassification }> = [];

  for (const m of models) {
    perMperC[m] = {};
    for (const c of cells) {
      const subset = records.filter(r => r.model === m && r.cell === c);
      if (subset.length === 0) continue;
      const { metrics, failures } = await computeCellMetrics(subset, opts);
      perMperC[m]![c] = metrics;
      for (const f of failures) allFailures.push(f);
    }
    // Compute win/loss vs baseline.
    const baseAcc = perMperC[m]?.[baseline]?.accuracy_normalized;
    if (baseAcc !== undefined) {
      for (const c of cells) {
        if (c === baseline) continue;
        const cm = perMperC[m]?.[c];
        if (!cm) continue;
        perMperC[m]![c] = { ...cm, win_loss_vs_baseline_pp: (cm.accuracy_normalized - baseAcc) * 100 };
      }
    }
  }

  const summary: RunSummary = {
    report_version: 1,
    run_id: opts.run_id,
    generated_at_iso: new Date().toISOString(),
    n_instances: records.length,
    models,
    cells,
    baseline_cell: baseline,
    per_model_per_cell: perMperC,
    cross_model_matrix: buildCrossModelMatrix(perMperC, models, cells),
    best_per_cell: bestModelPerCell(perMperC, models, cells),
    regression_notes: regressionNotes(perMperC, models, cells, baseline, regressionThreshold),
    aggregate_failure_distribution: aggregateFailureDistribution(perMperC),
  };

  const summary_md = renderSummaryMd(summary);
  const predictions_jsonl = records.map(r => JSON.stringify(r)).join('\n');
  const failures_jsonl = allFailures.map(f => JSON.stringify(f)).join('\n');

  return { summary, summary_md, predictions_jsonl, failures_jsonl };
}

export interface WrittenReportPaths {
  summary_json_path: string;
  summary_md_path: string;
  predictions_jsonl_path: string;
  failures_jsonl_path: string;
}

export async function writeReportToDisk(
  records: readonly AgentPredictionRecord[],
  opts: ReportOptions & { outputDir: string },
): Promise<WrittenReportPaths> {
  const artifacts = await generateReport(records, opts);
  await fsp.mkdir(opts.outputDir, { recursive: true });
  const paths: WrittenReportPaths = {
    summary_json_path: path.join(opts.outputDir, 'summary.json'),
    summary_md_path: path.join(opts.outputDir, 'summary.md'),
    predictions_jsonl_path: path.join(opts.outputDir, 'predictions.jsonl'),
    failures_jsonl_path: path.join(opts.outputDir, 'failures.jsonl'),
  };
  await fsp.writeFile(paths.summary_json_path, JSON.stringify(artifacts.summary, null, 2), 'utf-8');
  await fsp.writeFile(paths.summary_md_path, artifacts.summary_md, 'utf-8');
  await fsp.writeFile(paths.predictions_jsonl_path, artifacts.predictions_jsonl + (artifacts.predictions_jsonl ? '\n' : ''), 'utf-8');
  await fsp.writeFile(paths.failures_jsonl_path, artifacts.failures_jsonl + (artifacts.failures_jsonl ? '\n' : ''), 'utf-8');
  return paths;
}

// ─────────────────────────────────────────────────────────────────────────
// Pilot-record adapter
// ─────────────────────────────────────────────────────────────────────────

export interface PilotJsonlRecord {
  instance_id: string;
  question: string;
  gold_answer: string | string[];
  subject: {
    content: string;
    in?: number;
    out?: number;
    cost?: number;
    latency_ms?: number;
    error?: string | null;
  };
  trio?: { majority?: string };
  self_judge?: { verdict?: string };
}

/**
 * Convert a pilot-format JSONL record into the canonical AgentPredictionRecord.
 * Caller supplies the (model, cell) tuple — pilot records don't carry those
 * fields explicitly (they live in the filename / external context).
 */
export function fromPilotRecord(
  record: PilotJsonlRecord,
  opts: { model: string; cell: string },
): AgentPredictionRecord {
  return {
    model: opts.model,
    cell: opts.cell,
    instance_id: record.instance_id,
    question: record.question,
    gold_answer: record.gold_answer,
    output_raw: record.subject.content,
    output_normalized: record.subject.content, // pilot records don't preserve a separate normalized form
    judge_verdict: record.trio?.majority,
    cost_usd: record.subject.cost,
    latency_ms: record.subject.latency_ms,
    tokens_in: record.subject.in,
    tokens_out: record.subject.out,
    upstream_error: record.subject.error ?? undefined,
  };
}
