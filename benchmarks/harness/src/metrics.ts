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
import {
  computeFailureDistribution,
  type FailureRow,
} from './failure-taxonomy/index.js';

/**
 * Sprint 11 Task A2 — read-path pruning per H-AUDIT-1 ratification §Q4.
 *
 * Write-path always persists full records (incl. `reasoning_content`). The
 * exclusion contract (design doc §2.4) is enforced on the READ side: any
 * caller that might surface reasoning to a judge, UI, MCP payload, or
 * summary brief must pass `{ includeReasoning: false }` so the field is
 * stripped at the boundary.
 *
 * Default is `includeReasoning: false` — callers opt in explicitly when
 * they need the raw trace (e.g. for archival gzip, audit replay).
 */
export interface ReadJsonlOptions {
  /** When false (default), strips `reasoning_content` from each record.
   *  `reasoning_content_chars` and `reasoning_shape` are lightweight
   *  observability fields and are retained either way. */
  includeReasoning?: boolean;
}

export function readJsonl(filePath: string, options: ReadJsonlOptions = {}): JsonlRecord[] {
  const includeReasoning = options.includeReasoning ?? false;
  if (!fs.existsSync(filePath)) return [];
  const raw = fs.readFileSync(filePath, 'utf-8');
  const records: JsonlRecord[] = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    const record = JSON.parse(trimmed) as JsonlRecord;
    if (!includeReasoning && record.reasoning_content !== undefined) {
      // Strip the content; keep the chars + shape observability fields.
      const { reasoning_content: _stripped, ...rest } = record;
      records.push(rest as JsonlRecord);
    } else {
      records.push(record);
    }
  }
  return records;
}

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

  // Sprint 11 A2: reasoning_content aggregates when any record carries it.
  // `undefined` when no records had reasoning — lets consumers distinguish
  // "thinking was off" from "zero chars observed". Chars only, never content
  // (design doc §2.4 exclusion rule).
  const reasoningChars = records
    .filter(r => r.reasoning_content_chars !== undefined && r.reasoning_content_chars > 0)
    .map(r => r.reasoning_content_chars as number);
  const shapeDistribution: Record<string, number> = {};
  for (const r of records) {
    if (r.reasoning_shape !== undefined) {
      shapeDistribution[r.reasoning_shape] = (shapeDistribution[r.reasoning_shape] ?? 0) + 1;
    }
  }
  const reasoningAggregate = reasoningChars.length === 0 && Object.keys(shapeDistribution).length === 0
    ? undefined
    : {
        count: reasoningChars.length,
        sumChars: reasoningChars.reduce((s, n) => s + n, 0),
        p50Chars: Math.round(percentile(reasoningChars, 50)),
        p95Chars: Math.round(percentile(reasoningChars, 95)),
        shapeDistribution,
      };

  // Sprint 12 Task 2 §2.1 A3 namespace split (LOCKED 2026-04-23): compute
  // the A3 LOCK § 6 failure distribution from the `a3_failure_code` /
  // `a3_rationale` columns. Only rows that carry the A3 column are
  // included (pre-Sprint-12 rows and skipped-judge rows are excluded). The
  // aggregate section stays `undefined` when no A3 rows exist so
  // pre-A3 runs continue emitting the legacy shape verbatim.
  const a3Rows: FailureRow[] = records
    .filter(r => r.a3_failure_code !== undefined)
    .map(r => ({
      failure_code: r.a3_failure_code!,
      rationale: r.a3_rationale ?? null,
    }));
  const failureDistribution =
    a3Rows.length === 0 ? undefined : computeFailureDistribution(a3Rows);

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
    ...(reasoningAggregate && { reasoningContent: reasoningAggregate }),
    ...(failureDistribution && { failure_distribution: failureDistribution }),
  };
}

function round(n: number, decimals: number): number {
  const f = Math.pow(10, decimals);
  return Math.round(n * f) / f;
}
