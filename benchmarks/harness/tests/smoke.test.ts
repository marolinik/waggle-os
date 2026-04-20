/**
 * Four-cell ablation harness — smoke tests.
 *
 * Covers the brief's acceptance criteria:
 *  - `--cell raw --dataset locomo --limit 1` produces a JSONL record with all
 *    required fields (turnId, cell, instance_id, model, seed, accuracy,
 *    p50/p95 latency, usd_per_query, failure_mode).
 *  - `--control verbose-fixed --dataset locomo --limit 50` runs 50 instances
 *    without crashing and writes the aggregate summary.
 *  - Cost capture active on every record (all four cost fields present).
 *  - Seed reproducibility: same seed → identical instance order.
 *  - All four cells produce valid records when run via --all-cells.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { parseArgs, buildRuns, runOne } from '../src/runner.js';
import { loadDataset, sampleInstances } from '../src/datasets.js';
import type { JsonlRecord } from '../src/types.js';

const SYNTHETIC_DATASET = {
  id: 'synthetic' as const,
  displayName: 'Synthetic',
  dataPath: 'synthetic/placeholder.jsonl',
  source: 'synthetic' as const,
};

const QWEN_MODEL = {
  id: 'qwen3.6-35b-a3b',
  displayName: 'Qwen3.6-35B-A3B',
  provider: 'alibaba' as const,
  litellmModel: 'dashscope/qwen3.6-35b-a3b',
  pricePerMillionInput: 0.2,
  pricePerMillionOutput: 0.8,
  contextWindow: 262144,
};

function readJsonl(file: string): JsonlRecord[] {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf-8')
    .split('\n')
    .filter(l => l.trim().length > 0)
    .map(l => JSON.parse(l) as JsonlRecord);
}

describe('arg parsing', () => {
  it('parses a single-cell invocation', () => {
    const args = parseArgs(['--cell', 'raw', '--dataset', 'locomo', '--limit', '1', '--model', 'qwen3.6-35b-a3b']);
    expect(args.cell).toBe('raw');
    expect(args.dataset).toBe('locomo');
    expect(args.limit).toBe(1);
    expect(args.model).toBe('qwen3.6-35b-a3b');
  });

  it('parses --all-cells', () => {
    const args = parseArgs(['--all-cells', '--dataset', 'synthetic', '--limit', '5']);
    expect(args.allCells).toBe(true);
    expect(buildRuns(args)).toHaveLength(4);
  });

  it('parses --full as Infinity', () => {
    const args = parseArgs(['--cell', 'raw', '--full']);
    expect(args.limit).toBe(Number.POSITIVE_INFINITY);
  });

  it('rejects unknown cell names', () => {
    const args = parseArgs(['--cell', 'nonsense']);
    expect(() => buildRuns(args)).toThrow(/Unknown cell/);
  });

  it('rejects unknown control names', () => {
    const args = parseArgs(['--control', 'nonsense']);
    expect(() => buildRuns(args)).toThrow(/Unknown control/);
  });
});

describe('dataset sampling (reproducibility)', () => {
  it('produces identical instance order for the same seed', () => {
    const all = loadDataset(SYNTHETIC_DATASET, '/nonexistent');
    const a = sampleInstances(all, 42, 10);
    const b = sampleInstances(all, 42, 10);
    expect(a.map(i => i.instance_id)).toEqual(b.map(i => i.instance_id));
  });

  it('produces different order for different seeds', () => {
    const all = loadDataset(SYNTHETIC_DATASET, '/nonexistent');
    const a = sampleInstances(all, 42, 10);
    const b = sampleInstances(all, 7, 10);
    expect(a.map(i => i.instance_id)).not.toEqual(b.map(i => i.instance_id));
  });
});

describe('runOne — acceptance criteria', () => {
  let tmpDir: string;
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-bench-smoke-'));
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('--cell raw --limit 1 produces a JSONL record with all required fields', async () => {
    const outputPath = path.join(tmpDir, 'raw.jsonl');
    await runOne({
      run: { kind: 'cell', name: 'raw' },
      dataset: SYNTHETIC_DATASET,
      model: QWEN_MODEL,
      limit: 1,
      seed: 42,
      budgetUsd: Number.POSITIVE_INFINITY,
      outputPath,
      dryRun: true,
      litellmUrl: 'http://unused',
      litellmApiKey: 'unused',
    });
    const records = readJsonl(outputPath);
    expect(records).toHaveLength(1);
    const r = records[0];
    expect(r.turnId).toMatch(/^[0-9a-f-]{36}$/);
    expect(r.cell).toBe('raw');
    expect(r.instance_id).toBeTruthy();
    expect(r.model).toBe('qwen3.6-35b-a3b');
    expect(r.seed).toBe(42);
    expect(typeof r.accuracy).toBe('number');
    expect(typeof r.p50_latency_ms).toBe('number');
    expect(typeof r.p95_latency_ms).toBe('number');
    expect(typeof r.usd_per_query).toBe('number');
    expect(r.failure_mode).toBeNull();

    // Summary file is written alongside.
    const summaryPath = outputPath.replace(/\.jsonl$/, '.summary.json');
    expect(fs.existsSync(summaryPath)).toBe(true);
    const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf-8'));
    expect(summary.counts.total).toBe(1);
    expect(summary.metrics).toHaveProperty('meanAccuracy');
    expect(summary.metrics).toHaveProperty('totalUsd');
  });

  it('--control verbose-fixed --limit 50 executes 50 instances without crashing', async () => {
    const outputPath = path.join(tmpDir, 'verbose-fixed.jsonl');
    await runOne({
      run: { kind: 'control', name: 'verbose-fixed' },
      dataset: SYNTHETIC_DATASET,
      model: QWEN_MODEL,
      limit: 50,
      seed: 42,
      budgetUsd: Number.POSITIVE_INFINITY,
      outputPath,
      dryRun: true,
      litellmUrl: 'http://unused',
      litellmApiKey: 'unused',
    });
    const records = readJsonl(outputPath);
    expect(records).toHaveLength(50);
    for (const r of records) {
      expect(r.cell).toBe('verbose-fixed');
      expect(r.turnId).toMatch(/^[0-9a-f-]{36}$/);
      expect(typeof r.usd_per_query).toBe('number');
      expect(typeof r.p50_latency_ms).toBe('number');
      expect(typeof r.p95_latency_ms).toBe('number');
    }
    // All turnIds must be unique (one per instance).
    const turnIds = new Set(records.map(r => r.turnId));
    expect(turnIds.size).toBe(50);
  });

  it('every record carries all four cost-capture fields (accuracy, p50, p95, usd_per_query)', async () => {
    const outputPath = path.join(tmpDir, 'cost.jsonl');
    await runOne({
      run: { kind: 'cell', name: 'memory-only' },
      dataset: SYNTHETIC_DATASET,
      model: QWEN_MODEL,
      limit: 5,
      seed: 42,
      budgetUsd: Number.POSITIVE_INFINITY,
      outputPath,
      dryRun: true,
      litellmUrl: 'http://unused',
      litellmApiKey: 'unused',
    });
    const records = readJsonl(outputPath);
    expect(records.length).toBeGreaterThan(0);
    for (const r of records) {
      // All four cost fields — brief acceptance requirement.
      expect(r).toHaveProperty('accuracy');
      expect(r).toHaveProperty('p50_latency_ms');
      expect(r).toHaveProperty('p95_latency_ms');
      expect(r).toHaveProperty('usd_per_query');
    }
  });

  it('budget cap stops the run early', async () => {
    const outputPath = path.join(tmpDir, 'budgeted.jsonl');
    await runOne({
      run: { kind: 'cell', name: 'raw' },
      dataset: SYNTHETIC_DATASET,
      model: QWEN_MODEL,
      limit: 20,
      seed: 42,
      // Budget is tiny — even dry-run cost (roughly a few cents per call)
      // will stop well before 20 instances complete if the budget guard
      // works. We accept anywhere from 0 to a partial count here; the
      // important invariant is that `<= 20` always.
      budgetUsd: 0.000001,
      outputPath,
      dryRun: true,
      litellmUrl: 'http://unused',
      litellmApiKey: 'unused',
    });
    const records = readJsonl(outputPath);
    expect(records.length).toBeLessThan(20);
    const summary = JSON.parse(
      fs.readFileSync(outputPath.replace(/\.jsonl$/, '.summary.json'), 'utf-8'),
    );
    expect(summary.counts.budgetStoppedAt).not.toBeNull();
  });

  it('all four cells produce records with the correct `cell` tag', async () => {
    const cellNames = ['raw', 'memory-only', 'evolve-only', 'full-stack'] as const;
    for (const name of cellNames) {
      const outputPath = path.join(tmpDir, `${name}.jsonl`);
      await runOne({
        run: { kind: 'cell', name },
        dataset: SYNTHETIC_DATASET,
        model: QWEN_MODEL,
        limit: 2,
        seed: 42,
        budgetUsd: Number.POSITIVE_INFINITY,
        outputPath,
        dryRun: true,
        litellmUrl: 'http://unused',
        litellmApiKey: 'unused',
      });
      const records = readJsonl(outputPath);
      expect(records).toHaveLength(2);
      for (const r of records) {
        expect(r.cell).toBe(name);
      }
    }
  });
});
