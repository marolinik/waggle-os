/**
 * Metrics + JSONL writer.
 *
 * Each instance run emits one JSONL record. The record shape is intentionally
 * flat so downstream tools (jq, DuckDB, pandas) don't need unnesting. At the
 * end of a run we also write an aggregate summary JSON alongside the JSONL.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { AggregateSummary, JsonlRecord, RunConfig } from './types.js';

/** Scores a model output against expected substrings (any-match = full credit). */
export function scoreAccuracy(output: string, expected: string[]): number {
  if (expected.length === 0) return 0;
  const lower = output.toLowerCase();
  for (const exp of expected) {
    if (lower.includes(exp.toLowerCase())) return 1;
  }
  return 0;
}

/** p50 / p95 helpers. Returns 0 on empty input rather than NaN so JSONL
 *  consumers don't have to special-case an empty batch. */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

export class JsonlWriter {
  private stream: fs.WriteStream;
  private records: JsonlRecord[] = [];

  constructor(private outputPath: string) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    this.stream = fs.createWriteStream(outputPath, { flags: 'a' });
  }

  write(record: JsonlRecord): void {
    this.stream.write(JSON.stringify(record) + '\n');
    this.records.push(record);
  }

  all(): JsonlRecord[] {
    return this.records.slice();
  }

  async close(): Promise<void> {
    // Wait for BOTH finish (all writes flushed to kernel) AND close (file
    // descriptor released). end(callback) only guarantees finish — on
    // Windows the fd release lags, which races test cleanup rmSync.
    await new Promise<void>((resolve, reject) => {
      this.stream.once('close', () => resolve());
      this.stream.once('error', reject);
      this.stream.end();
    });
  }
}

export function buildAggregate(config: RunConfig, records: JsonlRecord[], startedAt: string, finishedAt: string, budgetStoppedAt: number | null): AggregateSummary {
  const completed = records.filter(r => r.failure_mode === null);
  const failed = records.filter(r => r.failure_mode !== null);
  const latencies = records.map(r => r.p50_latency_ms).filter(v => v > 0);
  const p95Latencies = records.map(r => r.p95_latency_ms).filter(v => v > 0);
  const totalUsd = records.reduce((s, r) => s + r.usd_per_query, 0);
  const meanAccuracy = records.length === 0 ? 0 : completed.reduce((s, r) => s + r.accuracy, 0) / records.length;
  const failureModes: Record<string, number> = {};
  for (const r of failed) {
    const key = r.failure_mode ?? 'unknown';
    failureModes[key] = (failureModes[key] ?? 0) + 1;
  }

  return {
    run: {
      kind: config.run.kind,
      name: config.run.name,
      dataset: config.dataset.id,
      model: config.model.id,
      seed: config.seed,
      startedAt,
      finishedAt,
    },
    counts: {
      total: records.length,
      completed: completed.length,
      failed: failed.length,
      budgetStoppedAt,
    },
    metrics: {
      meanAccuracy: round(meanAccuracy, 4),
      p50LatencyMs: round(percentile(latencies, 50), 2),
      p95LatencyMs: round(percentile(p95Latencies, 95), 2),
      totalUsd: round(totalUsd, 6),
      meanUsdPerQuery: records.length === 0 ? 0 : round(totalUsd / records.length, 6),
    },
    failureModes,
  };
}

function round(n: number, decimals: number): number {
  const f = Math.pow(10, decimals);
  return Math.round(n * f) / f;
}
