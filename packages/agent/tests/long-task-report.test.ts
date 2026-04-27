/**
 * Tests for long-task/report.ts (Phase 4.2 of agent-fix sprint).
 *
 * Coverage:
 *   - Report shape: summary.json schema, predictions.jsonl, failures.jsonl, summary.md
 *   - Per-cell metrics correctness (accuracy raw/normalized, abstention, leakage, etc.)
 *   - Wilson 95% CI: math correctness, edge cases (n=0, p=0, p=1)
 *   - Bootstrap CI: triggers iff n >= 30, deterministic via seeded RNG
 *   - Cross-model matrix: rows × columns shape, NaN for missing cells
 *   - Best-per-cell argmax + ties handling
 *   - Win/loss vs baseline (pp delta)
 *   - Regression notes (5pp drop threshold)
 *   - Aggregate failure distribution
 *   - Markdown rendering: known-shape sections present
 *   - writeReportToDisk: 4 files written
 *   - Pilot adapter: fromPilotRecord shape mapping
 *   - End-to-end pilot reproduction: smoke-records.jsonl (N=20) reproduces D3 finding (40% substring)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fsp from 'node:fs/promises';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

import {
  generateReport,
  writeReportToDisk,
  fromPilotRecord,
  type AgentPredictionRecord,
  type ReportOptions,
  type PilotJsonlRecord,
} from '../src/long-task/report.js';

// ─────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────

let tmpRoot: string;

beforeEach(async () => {
  tmpRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'waggle-report-'));
});

afterEach(async () => {
  await fsp.rm(tmpRoot, { recursive: true, force: true });
});

function rec(overrides: Partial<AgentPredictionRecord> & { model: string; cell: string }): AgentPredictionRecord {
  return {
    instance_id: 'inst-1',
    gold_answer: 'gold',
    output_raw: 'output',
    output_normalized: 'output',
    ...overrides,
  };
}

const baseOpts: ReportOptions = { run_id: 'test-run' };

// ─────────────────────────────────────────────────────────────────────────
// Empty / trivial reports
// ─────────────────────────────────────────────────────────────────────────

describe('report — empty / trivial', () => {
  it('handles empty record list', async () => {
    const r = await generateReport([], baseOpts);
    expect(r.summary.n_instances).toBe(0);
    expect(r.summary.models).toEqual([]);
    expect(r.summary.cells).toEqual([]);
    expect(r.predictions_jsonl).toBe('');
    expect(r.failures_jsonl).toBe('');
  });

  it('handles single-record perfect case', async () => {
    const records = [rec({ model: 'm1', cell: 'raw', output_raw: 'gold', output_normalized: 'gold' })];
    const r = await generateReport(records, baseOpts);
    expect(r.summary.per_model_per_cell.m1?.raw?.accuracy_normalized).toBe(1);
    expect(r.summary.per_model_per_cell.m1?.raw?.accuracy_raw).toBe(1);
  });

  it('handles single-record failure case', async () => {
    const records = [rec({ model: 'm1', cell: 'raw', output_raw: 'wrong', output_normalized: 'wrong' })];
    const r = await generateReport(records, baseOpts);
    expect(r.summary.per_model_per_cell.m1?.raw?.accuracy_normalized).toBe(0);
    expect(r.failures_jsonl.split('\n').length).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Wilson CI math
// ─────────────────────────────────────────────────────────────────────────

describe('report — Wilson CI math', () => {
  it('Wilson: 5/10 → CI roughly [0.24, 0.76]', async () => {
    const records = Array.from({ length: 10 }, (_, i) =>
      rec({ model: 'm', cell: 'c', output_normalized: i < 5 ? 'gold' : 'wrong', instance_id: `i-${i}` }));
    const r = await generateReport(records, baseOpts);
    const m = r.summary.per_model_per_cell.m!.c!;
    expect(m.accuracy_normalized).toBe(0.5);
    expect(m.wilson_95ci_lower).toBeGreaterThan(0.20);
    expect(m.wilson_95ci_lower).toBeLessThan(0.30);
    expect(m.wilson_95ci_upper).toBeGreaterThan(0.70);
    expect(m.wilson_95ci_upper).toBeLessThan(0.80);
  });

  it('Wilson: 0/10 → lower bound = 0', async () => {
    const records = Array.from({ length: 10 }, (_, i) =>
      rec({ model: 'm', cell: 'c', output_normalized: 'wrong', instance_id: `i-${i}` }));
    const r = await generateReport(records, baseOpts);
    const m = r.summary.per_model_per_cell.m!.c!;
    expect(m.wilson_95ci_lower).toBe(0);
  });

  it('Wilson: 10/10 → upper bound = 1 (within FP precision)', async () => {
    const records = Array.from({ length: 10 }, (_, i) =>
      rec({ model: 'm', cell: 'c', output_normalized: 'gold', instance_id: `i-${i}` }));
    const r = await generateReport(records, baseOpts);
    const m = r.summary.per_model_per_cell.m!.c!;
    expect(m.wilson_95ci_upper).toBeCloseTo(1, 10);
  });

  it('Wilson half_width is in pp (×100)', async () => {
    const records = Array.from({ length: 100 }, (_, i) =>
      rec({ model: 'm', cell: 'c', output_normalized: i < 50 ? 'gold' : 'wrong', instance_id: `i-${i}` }));
    const r = await generateReport(records, baseOpts);
    const m = r.summary.per_model_per_cell.m!.c!;
    // At p=0.5, n=100: half-width ≈ 9.8 pp
    expect(m.wilson_95ci_half_width_pp).toBeGreaterThan(8);
    expect(m.wilson_95ci_half_width_pp).toBeLessThan(12);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Bootstrap CI gating + determinism
// ─────────────────────────────────────────────────────────────────────────

describe('report — Bootstrap CI', () => {
  it('does NOT compute bootstrap when N < 30', async () => {
    const records = Array.from({ length: 20 }, (_, i) =>
      rec({ model: 'm', cell: 'c', output_normalized: i < 10 ? 'gold' : 'wrong', instance_id: `i-${i}` }));
    const r = await generateReport(records, baseOpts);
    const m = r.summary.per_model_per_cell.m!.c!;
    expect(m.bootstrap_95ci_lower).toBeUndefined();
    expect(m.bootstrap_95ci_upper).toBeUndefined();
  });

  it('DOES compute bootstrap when N >= 30', async () => {
    const records = Array.from({ length: 30 }, (_, i) =>
      rec({ model: 'm', cell: 'c', output_normalized: i < 15 ? 'gold' : 'wrong', instance_id: `i-${i}` }));
    const r = await generateReport(records, baseOpts);
    const m = r.summary.per_model_per_cell.m!.c!;
    expect(m.bootstrap_95ci_lower).toBeGreaterThan(0);
    expect(m.bootstrap_95ci_upper).toBeLessThan(1);
  });

  it('seeded rng → deterministic bootstrap output', async () => {
    let seed = 1;
    const seededRng = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const records = Array.from({ length: 50 }, (_, i) =>
      rec({ model: 'm', cell: 'c', output_normalized: i < 25 ? 'gold' : 'wrong', instance_id: `i-${i}` }));

    seed = 1;
    const r1 = await generateReport(records, { ...baseOpts, rng: seededRng, bootstrap_iterations: 200 });
    seed = 1;
    const r2 = await generateReport(records, { ...baseOpts, rng: seededRng, bootstrap_iterations: 200 });
    expect(r1.summary.per_model_per_cell.m!.c!.bootstrap_95ci_lower).toBe(r2.summary.per_model_per_cell.m!.c!.bootstrap_95ci_lower);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Per-cell metric correctness
// ─────────────────────────────────────────────────────────────────────────

describe('report — per-cell metrics', () => {
  it('abstention rate counts unknown-class outputs', async () => {
    const records = [
      rec({ model: 'm', cell: 'c', output_normalized: 'unknown', instance_id: 'i1' }),
      rec({ model: 'm', cell: 'c', output_normalized: 'I don\'t know', instance_id: 'i2' }),
      rec({ model: 'm', cell: 'c', output_normalized: 'gold', instance_id: 'i3' }),
    ];
    const r = await generateReport(records, baseOpts);
    expect(r.summary.per_model_per_cell.m!.c!.abstention_rate).toBeCloseTo(2 / 3);
  });

  it('thinking_leakage rate counts <think> in raw output', async () => {
    const records = [
      rec({ model: 'm', cell: 'c', output_raw: '<think>x</think>gold', output_normalized: 'gold', instance_id: 'i1' }),
      rec({ model: 'm', cell: 'c', output_raw: 'gold', output_normalized: 'gold', instance_id: 'i2' }),
      rec({ model: 'm', cell: 'c', output_raw: '<THINKING>y</THINKING>gold', output_normalized: 'gold', instance_id: 'i3' }),
    ];
    const r = await generateReport(records, baseOpts);
    expect(r.summary.per_model_per_cell.m!.c!.thinking_leakage_rate).toBeCloseTo(2 / 3);
  });

  it('avg output chars: raw + normalized separately', async () => {
    const records = [
      rec({ model: 'm', cell: 'c', output_raw: 'aaaa', output_normalized: 'aa', instance_id: 'i1' }),
      rec({ model: 'm', cell: 'c', output_raw: 'bbbbbb', output_normalized: 'bbb', instance_id: 'i2' }),
    ];
    const r = await generateReport(records, baseOpts);
    expect(r.summary.per_model_per_cell.m!.c!.avg_output_chars_raw).toBe(5);
    expect(r.summary.per_model_per_cell.m!.c!.avg_output_chars_normalized).toBe(2.5);
  });

  it('total cost sums per cell', async () => {
    const records = [
      rec({ model: 'm', cell: 'c', cost_usd: 0.01, instance_id: 'i1' }),
      rec({ model: 'm', cell: 'c', cost_usd: 0.02, instance_id: 'i2' }),
      rec({ model: 'm', cell: 'c', cost_usd: 0.03, instance_id: 'i3' }),
    ];
    const r = await generateReport(records, baseOpts);
    expect(r.summary.per_model_per_cell.m!.c!.total_cost_usd).toBeCloseTo(0.06);
  });

  it('avg latency per cell', async () => {
    const records = [
      rec({ model: 'm', cell: 'c', latency_ms: 100, instance_id: 'i1' }),
      rec({ model: 'm', cell: 'c', latency_ms: 200, instance_id: 'i2' }),
    ];
    const r = await generateReport(records, baseOpts);
    expect(r.summary.per_model_per_cell.m!.c!.avg_latency_ms).toBe(150);
  });

  it('failure_distribution buckets failures by Phase 4.1 category', async () => {
    const records = [
      // thinking_leakage
      rec({ model: 'm', cell: 'c', output_raw: '<think>x</think>wrong', output_normalized: '<think>x</think>wrong', instance_id: 'i1' }),
      // unknown_false_negative
      rec({ model: 'm', cell: 'c', output_normalized: 'unknown', instance_id: 'i2' }),
      // correct (not a failure)
      rec({ model: 'm', cell: 'c', output_normalized: 'gold', instance_id: 'i3' }),
    ];
    const r = await generateReport(records, baseOpts);
    const dist = r.summary.per_model_per_cell.m!.c!.failure_distribution;
    expect(dist.thinking_leakage).toBe(1);
    expect(dist.unknown_false_negative).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Cross-model matrix + best-per-cell + win/loss
// ─────────────────────────────────────────────────────────────────────────

describe('report — cross-model + win/loss', () => {
  it('matrix has cells × models shape with sorted axes', async () => {
    const records = [
      rec({ model: 'qwen', cell: 'raw', output_normalized: 'gold', instance_id: 'i1' }),
      rec({ model: 'opus', cell: 'raw', output_normalized: 'wrong', instance_id: 'i2' }),
      rec({ model: 'qwen', cell: 'compressed', output_normalized: 'gold', instance_id: 'i3' }),
      rec({ model: 'opus', cell: 'compressed', output_normalized: 'gold', instance_id: 'i4' }),
    ];
    const r = await generateReport(records, baseOpts);
    expect(r.summary.cross_model_matrix.rows).toEqual(['compressed', 'raw']);
    expect(r.summary.cross_model_matrix.columns).toEqual(['opus', 'qwen']);
    // (compressed, opus) = 1, (compressed, qwen) = 1, (raw, opus) = 0, (raw, qwen) = 1
    expect(r.summary.cross_model_matrix.values[0]).toEqual([1, 1]);
    expect(r.summary.cross_model_matrix.values[1]).toEqual([0, 1]);
  });

  it('NaN for missing (model, cell) combinations', async () => {
    const records = [
      rec({ model: 'qwen', cell: 'raw', output_normalized: 'gold', instance_id: 'i1' }),
      rec({ model: 'opus', cell: 'compressed', output_normalized: 'gold', instance_id: 'i2' }),
    ];
    const r = await generateReport(records, baseOpts);
    // (compressed, opus) = 1, (compressed, qwen) = NaN
    // (raw, opus) = NaN, (raw, qwen) = 1
    expect(Number.isNaN(r.summary.cross_model_matrix.values[0]![1]!)).toBe(true);
    expect(Number.isNaN(r.summary.cross_model_matrix.values[1]![0]!)).toBe(true);
  });

  it('best_per_cell picks argmax model', async () => {
    const records = [
      rec({ model: 'qwen', cell: 'raw', output_normalized: 'gold', instance_id: 'i1' }),
      rec({ model: 'qwen', cell: 'raw', output_normalized: 'wrong', instance_id: 'i2' }),
      rec({ model: 'opus', cell: 'raw', output_normalized: 'gold', instance_id: 'i3' }),
      rec({ model: 'opus', cell: 'raw', output_normalized: 'gold', instance_id: 'i4' }),
    ];
    const r = await generateReport(records, baseOpts);
    expect(r.summary.best_per_cell.raw).toBe('opus');
  });

  it('win_loss_vs_baseline_pp computed for non-baseline cells', async () => {
    const records = [
      // m1/raw: 1/2 = 50%
      rec({ model: 'm1', cell: 'raw', output_normalized: 'gold', instance_id: 'i1' }),
      rec({ model: 'm1', cell: 'raw', output_normalized: 'wrong', instance_id: 'i2' }),
      // m1/compressed: 2/2 = 100%
      rec({ model: 'm1', cell: 'compressed', output_normalized: 'gold', instance_id: 'i3' }),
      rec({ model: 'm1', cell: 'compressed', output_normalized: 'gold', instance_id: 'i4' }),
    ];
    const r = await generateReport(records, baseOpts);
    expect(r.summary.per_model_per_cell.m1!.compressed!.win_loss_vs_baseline_pp).toBeCloseTo(50);
    // baseline cell itself has no win/loss
    expect(r.summary.per_model_per_cell.m1!.raw!.win_loss_vs_baseline_pp).toBeUndefined();
  });

  it('custom baseline_cell honored', async () => {
    const records = [
      rec({ model: 'm1', cell: 'compressed', output_normalized: 'gold', instance_id: 'i1' }),
      rec({ model: 'm1', cell: 'raw', output_normalized: 'gold', instance_id: 'i2' }),
    ];
    const r = await generateReport(records, { ...baseOpts, baseline_cell: 'compressed' });
    expect(r.summary.baseline_cell).toBe('compressed');
    expect(r.summary.per_model_per_cell.m1!.compressed!.win_loss_vs_baseline_pp).toBeUndefined();
    expect(r.summary.per_model_per_cell.m1!.raw!.win_loss_vs_baseline_pp).toBeCloseTo(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Regression notes
// ─────────────────────────────────────────────────────────────────────────

describe('report — regression notes', () => {
  it('flags cells with ≥ threshold_pp drop vs baseline', async () => {
    // m1/raw = 90%, m1/compressed = 60% → 30pp drop, well over 5pp threshold.
    const records: AgentPredictionRecord[] = [];
    for (let i = 0; i < 10; i += 1) {
      records.push(rec({ model: 'm1', cell: 'raw', output_normalized: i < 9 ? 'gold' : 'wrong', instance_id: `r-${i}` }));
      records.push(rec({ model: 'm1', cell: 'compressed', output_normalized: i < 6 ? 'gold' : 'wrong', instance_id: `c-${i}` }));
    }
    const r = await generateReport(records, baseOpts);
    expect(r.summary.regression_notes.length).toBe(1);
    expect(r.summary.regression_notes[0]).toContain('m1/compressed');
    expect(r.summary.regression_notes[0]).toContain('30.0pp');
  });

  it('respects custom regression_threshold_pp', async () => {
    const records: AgentPredictionRecord[] = [];
    for (let i = 0; i < 10; i += 1) {
      records.push(rec({ model: 'm', cell: 'raw', output_normalized: 'gold', instance_id: `r-${i}` }));
      records.push(rec({ model: 'm', cell: 'compressed', output_normalized: i < 8 ? 'gold' : 'wrong', instance_id: `c-${i}` }));
    }
    // 100% → 80% = 20pp drop
    const r1 = await generateReport(records, { ...baseOpts, regression_threshold_pp: 25 });
    expect(r1.summary.regression_notes.length).toBe(0); // 20 < 25
    const r2 = await generateReport(records, { ...baseOpts, regression_threshold_pp: 15 });
    expect(r2.summary.regression_notes.length).toBe(1); // 20 >= 15
  });

  it('improvements (positive delta) do NOT trigger regression notes', async () => {
    const records: AgentPredictionRecord[] = [];
    for (let i = 0; i < 10; i += 1) {
      records.push(rec({ model: 'm', cell: 'raw', output_normalized: i < 5 ? 'gold' : 'wrong', instance_id: `r-${i}` }));
      records.push(rec({ model: 'm', cell: 'compressed', output_normalized: 'gold', instance_id: `c-${i}` }));
    }
    const r = await generateReport(records, baseOpts);
    expect(r.summary.regression_notes.length).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Aggregate failure distribution
// ─────────────────────────────────────────────────────────────────────────

describe('report — aggregate failure distribution', () => {
  it('sums across all (model, cell)', async () => {
    const records = [
      rec({ model: 'm1', cell: 'raw', output_raw: '<think>x</think>x', output_normalized: '<think>x</think>x', instance_id: 'i1' }),
      rec({ model: 'm2', cell: 'raw', output_raw: '<think>y</think>y', output_normalized: '<think>y</think>y', instance_id: 'i2' }),
      rec({ model: 'm1', cell: 'compressed', output_normalized: 'unknown', instance_id: 'i3' }),
    ];
    const r = await generateReport(records, baseOpts);
    expect(r.summary.aggregate_failure_distribution.thinking_leakage).toBe(2);
    expect(r.summary.aggregate_failure_distribution.unknown_false_negative).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Markdown rendering
// ─────────────────────────────────────────────────────────────────────────

describe('report — markdown rendering', () => {
  it('contains all required sections', async () => {
    const records = [
      rec({ model: 'm', cell: 'raw', output_normalized: 'gold', instance_id: 'i1' }),
    ];
    const r = await generateReport(records, baseOpts);
    expect(r.summary_md).toContain('# Run Report');
    expect(r.summary_md).toContain('## m');
    expect(r.summary_md).toContain('## Cross-model comparison');
    expect(r.summary_md).toContain('## Aggregate failure distribution');
    expect(r.summary_md).toContain('## Regression notes');
  });

  it('uses bold for best model in cross-model table', async () => {
    const records = [
      rec({ model: 'qwen', cell: 'raw', output_normalized: 'wrong', instance_id: 'i1' }),
      rec({ model: 'opus', cell: 'raw', output_normalized: 'gold', instance_id: 'i2' }),
    ];
    const r = await generateReport(records, baseOpts);
    expect(r.summary_md).toContain('**opus**');
  });

  it('shows accuracy as percent with 1 decimal', async () => {
    const records = Array.from({ length: 100 }, (_, i) =>
      rec({ model: 'm', cell: 'raw', output_normalized: i < 33 ? 'gold' : 'wrong', instance_id: `i-${i}` }));
    const r = await generateReport(records, baseOpts);
    expect(r.summary_md).toContain('33.0%');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// writeReportToDisk
// ─────────────────────────────────────────────────────────────────────────

describe('report — writeReportToDisk', () => {
  it('writes 4 files in outputDir', async () => {
    const records = [rec({ model: 'm', cell: 'raw', output_normalized: 'wrong', instance_id: 'i1' })];
    const paths = await writeReportToDisk(records, { ...baseOpts, outputDir: tmpRoot });
    expect(fs.existsSync(paths.summary_json_path)).toBe(true);
    expect(fs.existsSync(paths.summary_md_path)).toBe(true);
    expect(fs.existsSync(paths.predictions_jsonl_path)).toBe(true);
    expect(fs.existsSync(paths.failures_jsonl_path)).toBe(true);
  });

  it('summary.json round-trips through JSON.parse', async () => {
    const records = [rec({ model: 'm', cell: 'raw', output_normalized: 'wrong', instance_id: 'i1' })];
    const paths = await writeReportToDisk(records, { ...baseOpts, outputDir: tmpRoot });
    const parsed = JSON.parse(await fsp.readFile(paths.summary_json_path, 'utf-8'));
    expect(parsed.run_id).toBe('test-run');
    expect(parsed.report_version).toBe(1);
  });

  it('predictions.jsonl has one line per record + trailing newline', async () => {
    const records = [
      rec({ model: 'm', cell: 'raw', output_normalized: 'gold', instance_id: 'i1' }),
      rec({ model: 'm', cell: 'raw', output_normalized: 'wrong', instance_id: 'i2' }),
    ];
    const paths = await writeReportToDisk(records, { ...baseOpts, outputDir: tmpRoot });
    const contents = await fsp.readFile(paths.predictions_jsonl_path, 'utf-8');
    expect(contents.trim().split('\n').length).toBe(2);
    expect(contents.endsWith('\n')).toBe(true);
  });

  it('failures.jsonl only contains failed instances', async () => {
    const records = [
      rec({ model: 'm', cell: 'raw', output_normalized: 'gold', instance_id: 'i1' }),       // pass
      rec({ model: 'm', cell: 'raw', output_normalized: 'wrong', instance_id: 'i2' }),      // fail
    ];
    const paths = await writeReportToDisk(records, { ...baseOpts, outputDir: tmpRoot });
    const failContents = (await fsp.readFile(paths.failures_jsonl_path, 'utf-8')).trim();
    expect(failContents.split('\n').length).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// fromPilotRecord adapter
// ─────────────────────────────────────────────────────────────────────────

describe('report — fromPilotRecord adapter', () => {
  it('maps pilot record fields to AgentPredictionRecord', () => {
    const pilot: PilotJsonlRecord = {
      instance_id: 'locomo_conv-49_q089',
      question: 'What habit?',
      gold_answer: 'consuming soda and candy',
      subject: { content: 'Consuming soda and candy.', in: 102, out: 865, cost: 0.0021, latency_ms: 7536, error: null },
      trio: { majority: 'correct' },
      self_judge: { verdict: 'Yes' },
    };
    const r = fromPilotRecord(pilot, { model: 'qwen3.6', cell: 'oracle' });
    expect(r.model).toBe('qwen3.6');
    expect(r.cell).toBe('oracle');
    expect(r.instance_id).toBe('locomo_conv-49_q089');
    expect(r.gold_answer).toBe('consuming soda and candy');
    expect(r.output_raw).toBe('Consuming soda and candy.');
    expect(r.output_normalized).toBe('Consuming soda and candy.');
    expect(r.judge_verdict).toBe('correct');
    expect(r.cost_usd).toBe(0.0021);
    expect(r.tokens_in).toBe(102);
  });

  it('handles array gold_answer', () => {
    const pilot: PilotJsonlRecord = {
      instance_id: 'i1',
      question: 'q?',
      gold_answer: ['a', 'b'],
      subject: { content: 'a' },
    };
    const r = fromPilotRecord(pilot, { model: 'm', cell: 'c' });
    expect(r.gold_answer).toEqual(['a', 'b']);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// End-to-end: pilot reproduction
// ─────────────────────────────────────────────────────────────────────────

describe('report — pilot reproduction (Phase 2 acceptance gate D3)', () => {
  it('reproduces 8/20 = 40% substring-match on smoke-records.jsonl', async () => {
    const PILOT_PATH = path.resolve(__dirname, '../../../benchmarks/results/phase-2-acceptance-gate/smoke-records.jsonl');
    if (!fs.existsSync(PILOT_PATH)) {
      console.warn('[skip] smoke-records.jsonl not present; pilot reproduction test skipped');
      return;
    }
    const lines = (await fsp.readFile(PILOT_PATH, 'utf-8')).split('\n').filter(Boolean);
    const pilots: PilotJsonlRecord[] = lines.map(l => JSON.parse(l));
    const records = pilots.map(p => fromPilotRecord(p, { model: 'qwen3.6-35b-a3b-via-dashscope-direct', cell: 'oracle' }));
    const r = await generateReport(records, baseOpts);
    const m = r.summary.per_model_per_cell['qwen3.6-35b-a3b-via-dashscope-direct']!.oracle!;
    expect(m.n).toBe(20);
    // D3 inspection found 8/20 = 40.0% substring-match accuracy.
    expect(m.accuracy_normalized).toBeCloseTo(0.40, 2);
  });
});
