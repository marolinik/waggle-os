/**
 * Phase 5 monitoring — emitters + threshold detector + alert routing.
 *
 * Writes JSONL per-variant per-day to `gepa-phase-5/monitoring/<ISO_date>/<variant>.jsonl`
 * and threshold breaches to `gepa-phase-5/phase-5-alerts/<ISO_date>.jsonl`.
 *
 * Five required metrics (manifest gepa-phase-5/manifest.yaml § promotion_criteria + § rollback_triggers):
 *   1. pass_ii_rate              — Pass II rate moving 10-sample window per variant
 *   2. retrieval_engagement      — per-request retrieval call count
 *   3. latency_ms                — per-request wall-clock latency
 *   4. cost_usd                  — per-request USD cost
 *   5. error                     — per-variant agent_error_rate by type (loop_exhausted, timeout, parse_fail, other)
 *
 * Stage 1 deliverable per brief §3.4: JSONL files + daily markdown summary (no UI).
 *
 * BIND: thresholds are pre-registered in manifest § promotion_criteria + § rollback_triggers.
 * Mid-flight changes require amendment + Marko ratifikacija (no-revisit-without-amendment).
 *
 * AUDIT: gepa-phase-5/manifest.yaml § promotion_criteria, § rollback_triggers, § halt_and_pm_triggers.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
// packages/agent/src/canary/phase-5-monitoring.ts → repo root
const PROJECT_ROOT = path.resolve(path.dirname(__filename), '../../../..');
const DEFAULT_MONITORING_BASE_DIR = path.join(PROJECT_ROOT, 'gepa-phase-5', 'monitoring');
const DEFAULT_ALERTS_BASE_DIR = path.join(PROJECT_ROOT, 'gepa-phase-5', 'phase-5-alerts');

// ── Types ────────────────────────────────────────────────────────────────

export type MetricName =
  | 'pass_ii_rate'
  | 'retrieval_engagement'
  | 'latency_ms'
  | 'cost_usd'
  | 'error';

export type ErrorType = 'loop_exhausted' | 'timeout' | 'parse_fail' | 'other';

export interface MetricEntry {
  ts: string;             // ISO 8601 timestamp
  variant: string;        // canary variant REGISTRY key OR baseline shape name
  request_id: string;
  metric_name: MetricName;
  metric_value: number;
  baseline_comparison?: BaselineComparison;
  error_type?: ErrorType;  // populated when metric_name === 'error'
}

export interface BaselineComparison {
  baseline_value: number;
  delta?: number;
}

export interface AlertEntry {
  ts: string;
  trigger_id: string;
  variant: string;
  metric_name: MetricName | string;
  observed_value: number;
  threshold: number;
  is_rollback_trigger: boolean;
  diagnostic?: string;
}

export interface MonitoringPaths {
  monitoringBaseDir: string;
  alertsBaseDir: string;
}

export interface MonitoringContext {
  paths: MonitoringPaths;
  /** Override clock for tests. */
  now?: () => Date;
  /** Inject a writer (default: fs.appendFileSync). Tests use in-memory writer. */
  appendLine?: (filePath: string, line: string) => void;
}

// ── Threshold registry (manifest-bound, LOCKED) ──────────────────────────

/**
 * Rollback trigger thresholds (immediate action). Mirror manifest § rollback_triggers.
 * Any breach → emit AlertEntry with is_rollback_trigger=true.
 */
export const ROLLBACK_THRESHOLDS = {
  pass_ii_collapse_pp: -10,                  // variant pass_ii < baseline pass_ii − 10pp
  pass_ii_consecutive_windows: 2,
  pass_ii_window_size: 10,
  error_rate_spike_pp: 5,                    // variant error > baseline error + 5pp
  error_consecutive_window_hours: 24,
  cost_per_request_multiplier: 2.0,          // variant_cost > baseline_cost × 2.0
  latency_p95_multiplier: 3.0,               // variant_p95 > baseline_p95 × 3.0
  opcija_c_loop_exhausted_rate_pct: 5,       // > 5% baseline → halt with "long-task fixes potrebni"
} as const;

/**
 * Promotion criteria thresholds (canary → full enable). Mirror manifest § promotion_criteria.
 * ε = 1e-9 inclusive boundary per feedback_epsilon_inclusive_boundary.
 */
export const PROMOTION_THRESHOLDS = {
  inclusive_boundary_epsilon: 1e-9,
  pass_ii_delta_pp: 0,                       // variant_pass_ii ≥ baseline + 0pp − ε
  retrieval_qwen_thinking_multiplier: 0.80,  // qwen-thinking variant ≥ baseline × 0.80
  retrieval_claude_multiplier: 1.0,          // claude variant ≥ baseline
  latency_p95_multiplier: 1.20,              // variant_p95 ≤ baseline × 1.20
  cost_per_request_multiplier: 1.15,         // variant_cost ≤ baseline × 1.15
  error_rate_delta_pp: 1,                    // variant_error ≤ baseline + 1pp
  sample_floor_per_metric: 30,
  days_min: 7,
} as const;

// ── Filesystem helpers ──────────────────────────────────────────────────

function defaultClock(): Date {
  return new Date();
}

function defaultAppendLine(filePath: string, line: string): void {
  ensureDir(path.dirname(filePath));
  fs.appendFileSync(filePath, line, 'utf-8');
}

function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function isoDateUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Sanitize a variant identifier for use as a filename component. Replaces
 * `::` (REGISTRY key separator) with `__` and strips other unsafe chars.
 */
export function sanitizeVariantForFilename(variant: string): string {
  if (!variant) return 'unknown';
  return variant.replace(/::/g, '__').replace(/[^a-zA-Z0-9_-]/g, '_');
}

function defaultContext(): Required<Omit<MonitoringContext, 'paths'>> & {
  paths: MonitoringPaths;
} {
  return {
    paths: {
      monitoringBaseDir: DEFAULT_MONITORING_BASE_DIR,
      alertsBaseDir: DEFAULT_ALERTS_BASE_DIR,
    },
    now: defaultClock,
    appendLine: defaultAppendLine,
  };
}

function withDefaults(ctx?: MonitoringContext): Required<Omit<MonitoringContext, 'paths'>> & {
  paths: MonitoringPaths;
} {
  const d = defaultContext();
  return {
    paths: ctx?.paths ?? d.paths,
    now: ctx?.now ?? d.now,
    appendLine: ctx?.appendLine ?? d.appendLine,
  };
}

// ── Emitters ────────────────────────────────────────────────────────────

function emitMetric(entry: MetricEntry, ctx?: MonitoringContext): void {
  const c = withDefaults(ctx);
  const date = isoDateUtc(c.now());
  const dir = path.join(c.paths.monitoringBaseDir, date);
  const file = path.join(dir, `${sanitizeVariantForFilename(entry.variant)}.jsonl`);
  c.appendLine(file, JSON.stringify(entry) + '\n');
}

export interface EmitOptions {
  baselineComparison?: BaselineComparison;
  ctx?: MonitoringContext;
}

export function emitPassIIRate(
  variant: string,
  requestId: string,
  passIiRate: number,
  options: EmitOptions = {},
): void {
  const c = withDefaults(options.ctx);
  emitMetric(
    {
      ts: c.now().toISOString(),
      variant,
      request_id: requestId,
      metric_name: 'pass_ii_rate',
      metric_value: passIiRate,
      baseline_comparison: options.baselineComparison,
    },
    options.ctx,
  );
}

export function emitRetrievalEngagement(
  variant: string,
  requestId: string,
  retrievalCallCount: number,
  options: EmitOptions = {},
): void {
  const c = withDefaults(options.ctx);
  emitMetric(
    {
      ts: c.now().toISOString(),
      variant,
      request_id: requestId,
      metric_name: 'retrieval_engagement',
      metric_value: retrievalCallCount,
      baseline_comparison: options.baselineComparison,
    },
    options.ctx,
  );
}

export function emitLatency(
  variant: string,
  requestId: string,
  latencyMs: number,
  options: EmitOptions = {},
): void {
  const c = withDefaults(options.ctx);
  emitMetric(
    {
      ts: c.now().toISOString(),
      variant,
      request_id: requestId,
      metric_name: 'latency_ms',
      metric_value: latencyMs,
      baseline_comparison: options.baselineComparison,
    },
    options.ctx,
  );
}

export function emitCost(
  variant: string,
  requestId: string,
  costUsd: number,
  options: EmitOptions = {},
): void {
  const c = withDefaults(options.ctx);
  emitMetric(
    {
      ts: c.now().toISOString(),
      variant,
      request_id: requestId,
      metric_name: 'cost_usd',
      metric_value: costUsd,
      baseline_comparison: options.baselineComparison,
    },
    options.ctx,
  );
}

export function emitError(
  variant: string,
  requestId: string,
  errorType: ErrorType,
  options: EmitOptions = {},
): void {
  const c = withDefaults(options.ctx);
  emitMetric(
    {
      ts: c.now().toISOString(),
      variant,
      request_id: requestId,
      metric_name: 'error',
      metric_value: 1,
      error_type: errorType,
      baseline_comparison: options.baselineComparison,
    },
    options.ctx,
  );
}

// ── Threshold detection (single-event evaluation) ────────────────────────

export interface SingleEventCheck {
  variantValue: number;
  baselineValue: number;
  variant: string;
  metricName: MetricName | string;
}

/**
 * Single-event rollback trigger detection. Returns an AlertEntry to emit if
 * any threshold is breached on this single observation; null if all clear.
 *
 * Multi-window rollback triggers (pass_ii_collapse over 2 consecutive windows;
 * error_rate spike over 24h consecutive) require the daily aggregator
 * (gepa-phase-5/scripts/phase-5-daily-summary.ts) — they cannot be detected
 * from a single observation.
 *
 * Single-event triggers handled here:
 *   - cost_per_request_spike: variant > baseline × 2.0 (immediate single-window)
 *   - latency_p95_spike: variant > baseline × 3.0 (immediate single-window)
 */
export function checkSingleEventRollback(
  check: SingleEventCheck,
  now: () => Date = defaultClock,
): AlertEntry | null {
  const ts = now().toISOString();

  if (check.metricName === 'cost_usd') {
    const threshold = check.baselineValue * ROLLBACK_THRESHOLDS.cost_per_request_multiplier;
    if (check.variantValue > threshold) {
      return {
        ts,
        trigger_id: 'cost_per_request_spike',
        variant: check.variant,
        metric_name: 'cost_usd',
        observed_value: check.variantValue,
        threshold,
        is_rollback_trigger: true,
        diagnostic: `Variant cost ${check.variantValue.toFixed(4)} > baseline ${check.baselineValue.toFixed(4)} × ${ROLLBACK_THRESHOLDS.cost_per_request_multiplier} = ${threshold.toFixed(4)}`,
      };
    }
  }

  if (check.metricName === 'latency_ms') {
    const threshold = check.baselineValue * ROLLBACK_THRESHOLDS.latency_p95_multiplier;
    if (check.variantValue > threshold) {
      return {
        ts,
        trigger_id: 'latency_p95_spike',
        variant: check.variant,
        metric_name: 'latency_ms',
        observed_value: check.variantValue,
        threshold,
        is_rollback_trigger: true,
        diagnostic: `Variant p95 ${check.variantValue.toFixed(0)}ms > baseline ${check.baselineValue.toFixed(0)}ms × ${ROLLBACK_THRESHOLDS.latency_p95_multiplier} = ${threshold.toFixed(0)}ms`,
      };
    }
  }

  return null;
}

/**
 * Append an alert entry to phase-5-alerts/<ISO_date>.jsonl.
 *
 * Halt-and-PM hook: when is_rollback_trigger=true, also emits a structured log
 * line via process.stderr. In production this triggers automation that can
 * invoke §2.3 rollback procedure (canary toggle to 0 + git revert ratification).
 */
export function emitAlert(alert: AlertEntry, ctx?: MonitoringContext): void {
  const c = withDefaults(ctx);
  const date = isoDateUtc(c.now());
  const file = path.join(c.paths.alertsBaseDir, `${date}.jsonl`);
  c.appendLine(file, JSON.stringify(alert) + '\n');

  if (alert.is_rollback_trigger) {
    // Structured stderr line — automation hook for halt-and-PM cascade.
    // Format: PHASE5-ROLLBACK-TRIGGER <ts> <trigger_id> <variant> <metric_name>=<observed> threshold=<threshold>
    process.stderr.write(
      `PHASE5-ROLLBACK-TRIGGER ${alert.ts} ${alert.trigger_id} ${alert.variant} ${alert.metric_name}=${alert.observed_value} threshold=${alert.threshold}\n`,
    );
  }
}

// ── Aggregation primitives (multi-event analysis) ────────────────────────

export interface MovingWindowResult {
  windowSize: number;
  variantValues: number[];
  variantMean: number;
}

/**
 * Compute mean of last N observations. Returns null if fewer than N values
 * available (caller is responsible for sample-floor compliance).
 */
export function computeMovingWindowMean(values: readonly number[], windowSize: number): MovingWindowResult | null {
  if (values.length < windowSize) return null;
  const tail = values.slice(values.length - windowSize);
  const sum = tail.reduce((a, b) => a + b, 0);
  return {
    windowSize,
    variantValues: tail,
    variantMean: sum / windowSize,
  };
}

/**
 * Pass II rate collapse: 2 consecutive 10-sample moving windows where variant
 * Pass II < baseline Pass II − 10pp. Returns AlertEntry if breach, null otherwise.
 *
 * Window 1 = oldest 10 samples; Window 2 = newest 10 samples. Caller passes
 * the full sequence of variant Pass II observations + the baseline mean.
 *
 * Returns null if fewer than 20 samples available (need 2 windows of 10 each).
 */
export function checkPassIIRateCollapse(
  variantPassIiSeries: readonly number[],
  baselinePassIi: number,
  variant: string,
  now: () => Date = defaultClock,
): AlertEntry | null {
  const sampleSize = ROLLBACK_THRESHOLDS.pass_ii_window_size;
  const consecutive = ROLLBACK_THRESHOLDS.pass_ii_consecutive_windows;
  if (variantPassIiSeries.length < sampleSize * consecutive) return null;

  const tail = variantPassIiSeries.slice(variantPassIiSeries.length - sampleSize * consecutive);
  // Last `consecutive` windows of `sampleSize` each; check ALL must breach.
  for (let i = 0; i < consecutive; i++) {
    const start = i * sampleSize;
    const window = tail.slice(start, start + sampleSize);
    const mean = window.reduce((a, b) => a + b, 0) / sampleSize;
    const collapseThreshold = baselinePassIi + ROLLBACK_THRESHOLDS.pass_ii_collapse_pp / 100;
    if (mean >= collapseThreshold) return null; // not collapsed in this window
  }
  // All consecutive windows collapsed.
  const lastWindow = tail.slice((consecutive - 1) * sampleSize);
  const lastMean = lastWindow.reduce((a, b) => a + b, 0) / sampleSize;
  return {
    ts: now().toISOString(),
    trigger_id: 'pass_ii_collapse',
    variant,
    metric_name: 'pass_ii_rate',
    observed_value: lastMean,
    threshold: baselinePassIi + ROLLBACK_THRESHOLDS.pass_ii_collapse_pp / 100,
    is_rollback_trigger: true,
    diagnostic: `Pass II collapse: ${consecutive} consecutive ${sampleSize}-sample windows below baseline ${baselinePassIi.toFixed(3)} − 10pp = ${(baselinePassIi - 0.1).toFixed(3)}`,
  };
}

/**
 * Error-rate spike: variant error rate > baseline + 5pp over 24h consecutive.
 * Caller computes hourly error rate buckets from raw error events.
 */
export function checkErrorRateSpike(
  variantErrorRateHourly: readonly number[],
  baselineErrorRate: number,
  variant: string,
  now: () => Date = defaultClock,
): AlertEntry | null {
  const hours = ROLLBACK_THRESHOLDS.error_consecutive_window_hours;
  if (variantErrorRateHourly.length < hours) return null;
  const tail = variantErrorRateHourly.slice(variantErrorRateHourly.length - hours);
  const threshold = baselineErrorRate + ROLLBACK_THRESHOLDS.error_rate_spike_pp / 100;
  if (tail.every((rate) => rate > threshold)) {
    const meanRate = tail.reduce((a, b) => a + b, 0) / hours;
    return {
      ts: now().toISOString(),
      trigger_id: 'error_rate_spike',
      variant,
      metric_name: 'error',
      observed_value: meanRate,
      threshold,
      is_rollback_trigger: true,
      diagnostic: `Error rate spike: variant ${(meanRate * 100).toFixed(2)}% > baseline ${(baselineErrorRate * 100).toFixed(2)}% + 5pp = ${(threshold * 100).toFixed(2)}% for ${hours} consecutive hours`,
    };
  }
  return null;
}

/**
 * Opcija C long-task trigger: loop_exhausted error rate > 5% baseline.
 * Phase 4 long-task fixes not inherited per Opcija C §3; halt diagnostic
 * "long-task fixes potrebni" + selective cherry-pick option flagged.
 */
export function checkLoopExhaustedRate(
  loopExhaustedRatePct: number,
  variant: string,
  now: () => Date = defaultClock,
): AlertEntry | null {
  const threshold = ROLLBACK_THRESHOLDS.opcija_c_loop_exhausted_rate_pct;
  if (loopExhaustedRatePct > threshold) {
    return {
      ts: now().toISOString(),
      trigger_id: 'opcija_c_long_task_loop_exhausted',
      variant,
      metric_name: 'error',
      observed_value: loopExhaustedRatePct,
      threshold,
      is_rollback_trigger: true,
      diagnostic: `loop_exhausted rate ${loopExhaustedRatePct.toFixed(2)}% > 5% baseline. Phase 4 long-task fixes not inherited per Opcija C §3 — halt with "long-task fixes potrebni" rationale + selective cherry-pick option from feature/c3-v3-wrapper (commits c9bda3d, be8f702, e906114, 4d0542f, 8b8a940).`,
    };
  }
  return null;
}
