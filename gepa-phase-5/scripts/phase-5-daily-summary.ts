#!/usr/bin/env tsx
/**
 * Phase 5 §3.3 — Daily monitoring summary aggregator.
 *
 * Reads JSONL emit files from `gepa-phase-5/monitoring/<ISO_date>/<variant>.jsonl`
 * and alert log from `gepa-phase-5/phase-5-alerts/<ISO_date>.jsonl`, then
 * writes a markdown summary to `gepa-phase-5/phase-5-daily-summary/<ISO_date>.md`.
 *
 * Per brief §3.3 reading cadence: PM-side reading is 1×/day during canary
 * Day 0-5, then 2×/week. This script is intended to run once per UTC day.
 *
 * Per brief §3.4 Stage 1 deliverable: JSONL files + daily markdown summary
 * (no UI). Stage 2 dashboard deferred post-launch.
 *
 * Usage:
 *   npx tsx gepa-phase-5/scripts/phase-5-daily-summary.ts            # default = today UTC
 *   npx tsx gepa-phase-5/scripts/phase-5-daily-summary.ts 2026-04-30
 *
 * Audit: gepa-phase-5/manifest.yaml § halt_and_pm_triggers, § rollback_triggers.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
// gepa-phase-5/scripts/phase-5-daily-summary.ts → repo root
const REPO_ROOT = path.resolve(path.dirname(__filename), '../..');
const MONITORING_DIR = path.join(REPO_ROOT, 'gepa-phase-5', 'monitoring');
const ALERTS_DIR = path.join(REPO_ROOT, 'gepa-phase-5', 'phase-5-alerts');
const SUMMARY_DIR = path.join(REPO_ROOT, 'gepa-phase-5', 'phase-5-daily-summary');

interface MetricEntry {
  ts: string;
  variant: string;
  request_id: string;
  metric_name: string;
  metric_value: number;
  baseline_comparison?: { baseline_value: number; delta?: number };
  error_type?: string;
}

interface AlertEntry {
  ts: string;
  trigger_id: string;
  variant: string;
  metric_name: string;
  observed_value: number;
  threshold: number;
  is_rollback_trigger: boolean;
  diagnostic?: string;
}

function todayIsoUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function readJsonlSafe<T>(filePath: string): T[] {
  if (!fs.existsSync(filePath)) return [];
  const raw = fs.readFileSync(filePath, 'utf-8');
  const lines = raw.split('\n').filter((l) => l.trim().length > 0);
  return lines.map((l) => JSON.parse(l) as T);
}

function p50(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? null;
}

function p95(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length * 0.95)] ?? null;
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

interface VariantSummary {
  variant: string;
  totalEvents: number;
  perMetric: Record<
    string,
    {
      n: number;
      mean?: number;
      p50?: number;
      p95?: number;
    }
  >;
  errorBreakdown?: Record<string, number>;
}

function summarizeVariant(variant: string, entries: MetricEntry[]): VariantSummary {
  const summary: VariantSummary = {
    variant,
    totalEvents: entries.length,
    perMetric: {},
  };
  const byMetric = new Map<string, number[]>();
  const errorTypes = new Map<string, number>();
  for (const e of entries) {
    if (!byMetric.has(e.metric_name)) byMetric.set(e.metric_name, []);
    byMetric.get(e.metric_name)!.push(e.metric_value);
    if (e.metric_name === 'error' && e.error_type) {
      errorTypes.set(e.error_type, (errorTypes.get(e.error_type) ?? 0) + 1);
    }
  }
  for (const [metric, vals] of byMetric.entries()) {
    summary.perMetric[metric] = {
      n: vals.length,
      mean: mean(vals) ?? undefined,
      p50: p50(vals) ?? undefined,
      p95: p95(vals) ?? undefined,
    };
  }
  if (errorTypes.size > 0) {
    summary.errorBreakdown = Object.fromEntries(errorTypes.entries());
  }
  return summary;
}

function fmtNum(v: number | undefined, decimals = 4): string {
  if (v === undefined || !Number.isFinite(v)) return '-';
  return v.toFixed(decimals);
}

function formatMarkdown(date: string, summaries: VariantSummary[], alerts: AlertEntry[]): string {
  const lines: string[] = [];
  lines.push(`# Phase 5 Daily Summary — ${date}`);
  lines.push('');
  lines.push(`**Generated:** ${new Date().toISOString()}`);
  lines.push(`**Source:** \`gepa-phase-5/monitoring/${date}/*.jsonl\` + \`gepa-phase-5/phase-5-alerts/${date}.jsonl\``);
  lines.push(`**Manifest:** \`gepa-phase-5/manifest.yaml\``);
  lines.push('');

  // Alerts first (top of summary so PM sees rollback triggers immediately).
  lines.push('## Alerts');
  lines.push('');
  if (alerts.length === 0) {
    lines.push('_No alerts._');
  } else {
    const rollbackAlerts = alerts.filter((a) => a.is_rollback_trigger);
    const informational = alerts.filter((a) => !a.is_rollback_trigger);
    if (rollbackAlerts.length > 0) {
      lines.push(`### 🚨 ROLLBACK TRIGGERS (${rollbackAlerts.length})`);
      lines.push('');
      for (const a of rollbackAlerts) {
        lines.push(`- **${a.trigger_id}** — ${a.variant} — \`${a.metric_name}\` observed=${fmtNum(a.observed_value)} threshold=${fmtNum(a.threshold)}`);
        if (a.diagnostic) lines.push(`  - ${a.diagnostic}`);
      }
      lines.push('');
    }
    if (informational.length > 0) {
      lines.push(`### Informational alerts (${informational.length})`);
      lines.push('');
      for (const a of informational) {
        lines.push(`- ${a.trigger_id} — ${a.variant} — observed=${fmtNum(a.observed_value)}`);
      }
      lines.push('');
    }
  }
  lines.push('');

  // Per-variant aggregates.
  lines.push('## Per-variant metrics');
  lines.push('');
  if (summaries.length === 0) {
    lines.push('_No metric events recorded._');
  } else {
    for (const s of summaries) {
      lines.push(`### ${s.variant} (events: ${s.totalEvents})`);
      lines.push('');
      lines.push('| Metric | n | mean | p50 | p95 |');
      lines.push('|---|---|---|---|---|');
      for (const [metric, agg] of Object.entries(s.perMetric)) {
        lines.push(
          `| ${metric} | ${agg.n} | ${fmtNum(agg.mean)} | ${fmtNum(agg.p50)} | ${fmtNum(agg.p95)} |`,
        );
      }
      if (s.errorBreakdown) {
        lines.push('');
        lines.push('**Error breakdown:**');
        for (const [type, count] of Object.entries(s.errorBreakdown)) {
          lines.push(`- ${type}: ${count}`);
        }
      }
      lines.push('');
    }
  }

  lines.push('---');
  lines.push('');
  lines.push('**Cross-references:**');
  lines.push('- Manifest: `gepa-phase-5/manifest.yaml` (LOCKED scope + thresholds)');
  lines.push('- Brief: `D:/Projects/PM-Waggle-OS/briefs/2026-04-29-phase-5-deployment-brief-v1.md` §3 monitoring + §4 exit criteria');
  lines.push('- Cost amendment: `D:/Projects/PM-Waggle-OS/decisions/2026-04-30-phase-5-cost-amendment-LOCKED.md`');
  lines.push('');

  return lines.join('\n');
}

function main(): void {
  const date = process.argv[2] ?? todayIsoUtc();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    process.stderr.write(`Invalid date format: ${date}. Expected YYYY-MM-DD.\n`);
    process.exit(2);
  }

  const monitoringDateDir = path.join(MONITORING_DIR, date);
  const summaries: VariantSummary[] = [];
  if (fs.existsSync(monitoringDateDir)) {
    const files = fs.readdirSync(monitoringDateDir).filter((f) => f.endsWith('.jsonl'));
    for (const file of files) {
      const variantSafe = file.replace(/\.jsonl$/, '');
      const entries = readJsonlSafe<MetricEntry>(path.join(monitoringDateDir, file));
      // Recover real variant name from entries[0] (sanitize is one-way).
      const realVariant = entries[0]?.variant ?? variantSafe;
      summaries.push(summarizeVariant(realVariant, entries));
    }
  }

  const alertsFile = path.join(ALERTS_DIR, `${date}.jsonl`);
  const alerts = readJsonlSafe<AlertEntry>(alertsFile);

  const markdown = formatMarkdown(date, summaries, alerts);

  ensureDir(SUMMARY_DIR);
  const outFile = path.join(SUMMARY_DIR, `${date}.md`);
  fs.writeFileSync(outFile, markdown, 'utf-8');

  process.stdout.write(`Wrote: ${outFile}\n`);
  process.stdout.write(`Variants summarized: ${summaries.length}\n`);
  process.stdout.write(`Alerts: ${alerts.length} (rollback triggers: ${alerts.filter((a) => a.is_rollback_trigger).length})\n`);
}

main();
