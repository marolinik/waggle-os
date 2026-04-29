/**
 * Phase 5 monitoring tests.
 *
 * Coverage matrix:
 *   - 5 emitters write valid JSONL entries with correct shape
 *   - Variant filename sanitization (`::` → `__`)
 *   - Per-day file partitioning by ISO date
 *   - Single-event rollback detection: cost spike + latency spike
 *   - Multi-event rollback detection: Pass II collapse, error rate spike, loop_exhausted rate
 *   - Promotion criteria threshold values (manifest cross-check)
 *   - Alert emission writes to correct path + emits stderr line for rollback triggers
 *   - Moving window mean computation
 *   - Sample floor enforcement (return null below floor)
 *
 * Audit anchor: gepa-phase-5/manifest.yaml § promotion_criteria, § rollback_triggers.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  emitPassIIRate,
  emitRetrievalEngagement,
  emitLatency,
  emitCost,
  emitError,
  emitAlert,
  checkSingleEventRollback,
  checkPassIIRateCollapse,
  checkErrorRateSpike,
  checkLoopExhaustedRate,
  computeMovingWindowMean,
  sanitizeVariantForFilename,
  ROLLBACK_THRESHOLDS,
  PROMOTION_THRESHOLDS,
  type MetricEntry,
  type AlertEntry,
  type MonitoringContext,
} from '../src/canary/phase-5-monitoring.js';

// In-memory writer for test isolation. Captures (filePath, line) pairs.
function makeInMemoryWriter() {
  const writes: Array<{ filePath: string; line: string }> = [];
  function appendLine(filePath: string, line: string): void {
    writes.push({ filePath, line });
  }
  return { writes, appendLine };
}

function makeCtx(now: Date = new Date('2026-04-29T12:00:00Z')): {
  ctx: MonitoringContext;
  writer: ReturnType<typeof makeInMemoryWriter>;
} {
  const writer = makeInMemoryWriter();
  return {
    ctx: {
      paths: {
        monitoringBaseDir: '/tmp/phase5-test/monitoring',
        alertsBaseDir: '/tmp/phase5-test/alerts',
      },
      now: () => now,
      appendLine: writer.appendLine,
    },
    writer,
  };
}

function parseLastEntry(writer: ReturnType<typeof makeInMemoryWriter>): MetricEntry {
  const last = writer.writes[writer.writes.length - 1];
  expect(last).toBeDefined();
  return JSON.parse(last.line.trim()) as MetricEntry;
}

describe('emitPassIIRate', () => {
  it('writes pass_ii_rate entry with timestamp + variant + request_id + value', () => {
    const { ctx, writer } = makeCtx();
    emitPassIIRate('claude::gen1-v1', 'req-001', 0.95, { ctx });
    expect(writer.writes).toHaveLength(1);
    const entry = parseLastEntry(writer);
    expect(entry.variant).toBe('claude::gen1-v1');
    expect(entry.request_id).toBe('req-001');
    expect(entry.metric_name).toBe('pass_ii_rate');
    expect(entry.metric_value).toBe(0.95);
    expect(entry.ts).toBe('2026-04-29T12:00:00.000Z');
  });

  it('attaches baseline_comparison when provided', () => {
    const { ctx, writer } = makeCtx();
    emitPassIIRate('claude::gen1-v1', 'req-002', 0.95, {
      ctx,
      baselineComparison: { baseline_value: 0.85, delta: 0.10 },
    });
    const entry = parseLastEntry(writer);
    expect(entry.baseline_comparison).toEqual({ baseline_value: 0.85, delta: 0.10 });
  });

  it('writes to monitoring/<ISO_date>/<variant>.jsonl path', () => {
    const { ctx, writer } = makeCtx(new Date('2026-04-29T22:30:00Z'));
    emitPassIIRate('claude::gen1-v1', 'req-003', 0.92, { ctx });
    const last = writer.writes[writer.writes.length - 1];
    // OS-portable: check date segment + filename present, regardless of separator.
    expect(last.filePath).toMatch(/[/\\]monitoring[/\\]2026-04-29[/\\]/);
    expect(last.filePath).toContain('claude__gen1-v1.jsonl');
  });
});

describe('emitRetrievalEngagement', () => {
  it('writes retrieval_engagement entry with call count', () => {
    const { ctx, writer } = makeCtx();
    emitRetrievalEngagement('qwen-thinking::gen1-v1', 'req-r1', 2.5, { ctx });
    const entry = parseLastEntry(writer);
    expect(entry.metric_name).toBe('retrieval_engagement');
    expect(entry.metric_value).toBe(2.5);
    expect(entry.variant).toBe('qwen-thinking::gen1-v1');
  });
});

describe('emitLatency', () => {
  it('writes latency_ms entry', () => {
    const { ctx, writer } = makeCtx();
    emitLatency('claude::gen1-v1', 'req-l1', 1234, { ctx });
    const entry = parseLastEntry(writer);
    expect(entry.metric_name).toBe('latency_ms');
    expect(entry.metric_value).toBe(1234);
  });
});

describe('emitCost', () => {
  it('writes cost_usd entry', () => {
    const { ctx, writer } = makeCtx();
    emitCost('claude::gen1-v1', 'req-c1', 0.0432, { ctx });
    const entry = parseLastEntry(writer);
    expect(entry.metric_name).toBe('cost_usd');
    expect(entry.metric_value).toBe(0.0432);
  });
});

describe('emitError', () => {
  it('writes error entry with error_type field', () => {
    const { ctx, writer } = makeCtx();
    emitError('claude::gen1-v1', 'req-e1', 'loop_exhausted', { ctx });
    const entry = parseLastEntry(writer);
    expect(entry.metric_name).toBe('error');
    expect(entry.metric_value).toBe(1);
    expect(entry.error_type).toBe('loop_exhausted');
  });

  it('handles all 4 error types', () => {
    const errorTypes: Array<'loop_exhausted' | 'timeout' | 'parse_fail' | 'other'> = [
      'loop_exhausted',
      'timeout',
      'parse_fail',
      'other',
    ];
    for (const type of errorTypes) {
      const { ctx, writer } = makeCtx();
      emitError('claude::gen1-v1', `req-${type}`, type, { ctx });
      expect(parseLastEntry(writer).error_type).toBe(type);
    }
  });
});

describe('sanitizeVariantForFilename', () => {
  it('replaces :: with __', () => {
    expect(sanitizeVariantForFilename('claude::gen1-v1')).toBe('claude__gen1-v1');
    expect(sanitizeVariantForFilename('qwen-thinking::gen1-v1')).toBe('qwen-thinking__gen1-v1');
  });

  it('keeps clean baseline shape names unchanged', () => {
    expect(sanitizeVariantForFilename('claude')).toBe('claude');
    expect(sanitizeVariantForFilename('qwen-thinking')).toBe('qwen-thinking');
  });

  it('strips unsafe characters', () => {
    expect(sanitizeVariantForFilename('foo/bar')).toBe('foo_bar');
    expect(sanitizeVariantForFilename('foo bar')).toBe('foo_bar');
  });

  it('returns "unknown" for empty input', () => {
    expect(sanitizeVariantForFilename('')).toBe('unknown');
  });
});

describe('checkSingleEventRollback — cost_per_request_spike', () => {
  it('flags variant cost > baseline × 2.0', () => {
    const alert = checkSingleEventRollback({
      variantValue: 0.10,
      baselineValue: 0.04,
      variant: 'claude::gen1-v1',
      metricName: 'cost_usd',
    });
    expect(alert).not.toBeNull();
    expect(alert?.trigger_id).toBe('cost_per_request_spike');
    expect(alert?.is_rollback_trigger).toBe(true);
  });

  it('does NOT flag at exactly 2.0× (boundary inclusive only on exceed)', () => {
    const alert = checkSingleEventRollback({
      variantValue: 0.08, // exactly 0.04 × 2.0
      baselineValue: 0.04,
      variant: 'claude::gen1-v1',
      metricName: 'cost_usd',
    });
    expect(alert).toBeNull();
  });

  it('does not flag when below threshold', () => {
    const alert = checkSingleEventRollback({
      variantValue: 0.05,
      baselineValue: 0.04,
      variant: 'claude::gen1-v1',
      metricName: 'cost_usd',
    });
    expect(alert).toBeNull();
  });
});

describe('checkSingleEventRollback — latency_p95_spike', () => {
  it('flags variant latency > baseline × 3.0', () => {
    const alert = checkSingleEventRollback({
      variantValue: 18000, // 3.6× baseline
      baselineValue: 5000,
      variant: 'claude::gen1-v1',
      metricName: 'latency_ms',
    });
    expect(alert).not.toBeNull();
    expect(alert?.trigger_id).toBe('latency_p95_spike');
    expect(alert?.is_rollback_trigger).toBe(true);
  });

  it('does not flag at exactly 3.0× boundary', () => {
    const alert = checkSingleEventRollback({
      variantValue: 15000,
      baselineValue: 5000,
      variant: 'claude::gen1-v1',
      metricName: 'latency_ms',
    });
    expect(alert).toBeNull();
  });
});

describe('checkPassIIRateCollapse', () => {
  it('flags 2 consecutive 10-sample windows below baseline − 10pp', () => {
    // 20 values all at 0.5 vs baseline 0.85 → variant - baseline = -35pp << -10pp threshold
    const series = Array(20).fill(0.5);
    const alert = checkPassIIRateCollapse(series, 0.85, 'claude::gen1-v1');
    expect(alert).not.toBeNull();
    expect(alert?.trigger_id).toBe('pass_ii_collapse');
    expect(alert?.is_rollback_trigger).toBe(true);
  });

  it('does NOT flag when only one window collapsed', () => {
    // Window 1 (oldest 10): all 0.5 (collapsed)
    // Window 2 (newest 10): all 0.85 (not collapsed)
    const series = [...Array(10).fill(0.5), ...Array(10).fill(0.85)];
    const alert = checkPassIIRateCollapse(series, 0.85, 'claude::gen1-v1');
    expect(alert).toBeNull();
  });

  it('returns null below sample floor (< 20 values for 2×10 windows)', () => {
    const series = Array(15).fill(0.5);
    const alert = checkPassIIRateCollapse(series, 0.85, 'claude::gen1-v1');
    expect(alert).toBeNull();
  });

  it('returns null when both windows above threshold', () => {
    const series = Array(20).fill(0.85);
    const alert = checkPassIIRateCollapse(series, 0.85, 'claude::gen1-v1');
    expect(alert).toBeNull();
  });
});

describe('checkErrorRateSpike', () => {
  it('flags 24 consecutive hours where variant error > baseline + 5pp', () => {
    const hourlyRates = Array(24).fill(0.10); // 10% error rate
    const alert = checkErrorRateSpike(hourlyRates, 0.02, 'claude::gen1-v1'); // baseline 2% → threshold 7%
    expect(alert).not.toBeNull();
    expect(alert?.trigger_id).toBe('error_rate_spike');
  });

  it('does not flag when only some hours breach', () => {
    const hourlyRates = [...Array(12).fill(0.10), ...Array(12).fill(0.02)];
    const alert = checkErrorRateSpike(hourlyRates, 0.02, 'claude::gen1-v1');
    expect(alert).toBeNull();
  });

  it('returns null below 24h sample floor', () => {
    const hourlyRates = Array(20).fill(0.10);
    const alert = checkErrorRateSpike(hourlyRates, 0.02, 'claude::gen1-v1');
    expect(alert).toBeNull();
  });
});

describe('checkLoopExhaustedRate (Opcija C trigger)', () => {
  it('flags loop_exhausted rate > 5% with cherry-pick option in diagnostic', () => {
    const alert = checkLoopExhaustedRate(7.5, 'claude::gen1-v1');
    expect(alert).not.toBeNull();
    expect(alert?.trigger_id).toBe('opcija_c_long_task_loop_exhausted');
    expect(alert?.diagnostic).toContain('long-task fixes potrebni');
    expect(alert?.diagnostic).toContain('cherry-pick');
    expect(alert?.diagnostic).toContain('c9bda3d');
  });

  it('does not flag at or below 5%', () => {
    expect(checkLoopExhaustedRate(5, 'claude::gen1-v1')).toBeNull();
    expect(checkLoopExhaustedRate(2, 'claude::gen1-v1')).toBeNull();
  });
});

describe('emitAlert', () => {
  it('writes AlertEntry to phase-5-alerts/<ISO_date>.jsonl', () => {
    const { ctx, writer } = makeCtx();
    const alert: AlertEntry = {
      ts: '2026-04-29T12:00:00Z',
      trigger_id: 'cost_per_request_spike',
      variant: 'claude::gen1-v1',
      metric_name: 'cost_usd',
      observed_value: 0.10,
      threshold: 0.08,
      is_rollback_trigger: true,
    };
    emitAlert(alert, ctx);
    expect(writer.writes).toHaveLength(1);
    const last = writer.writes[0];
    // OS-portable: check filename present, regardless of separator.
    expect(last.filePath).toMatch(/[/\\]alerts[/\\]2026-04-29\.jsonl$/);
    expect(JSON.parse(last.line.trim())).toEqual(alert);
  });

  it('emits stderr line for rollback triggers (PHASE5-ROLLBACK-TRIGGER)', () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const { ctx } = makeCtx();
    emitAlert(
      {
        ts: '2026-04-29T12:00:00Z',
        trigger_id: 'cost_per_request_spike',
        variant: 'claude::gen1-v1',
        metric_name: 'cost_usd',
        observed_value: 0.10,
        threshold: 0.08,
        is_rollback_trigger: true,
      },
      ctx,
    );
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining('PHASE5-ROLLBACK-TRIGGER'),
    );
    stderrSpy.mockRestore();
  });

  it('does NOT emit stderr line for non-rollback alerts', () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const { ctx } = makeCtx();
    emitAlert(
      {
        ts: '2026-04-29T12:00:00Z',
        trigger_id: 'informational',
        variant: 'claude::gen1-v1',
        metric_name: 'cost_usd',
        observed_value: 0.05,
        threshold: 0.06,
        is_rollback_trigger: false,
      },
      ctx,
    );
    expect(stderrSpy).not.toHaveBeenCalled();
    stderrSpy.mockRestore();
  });
});

describe('computeMovingWindowMean', () => {
  it('returns mean of last N values', () => {
    const result = computeMovingWindowMean([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 5);
    expect(result?.windowSize).toBe(5);
    expect(result?.variantMean).toBe(8); // (6+7+8+9+10)/5
  });

  it('returns null below window size', () => {
    expect(computeMovingWindowMean([1, 2, 3], 10)).toBeNull();
  });
});

describe('manifest threshold cross-check', () => {
  it('ROLLBACK_THRESHOLDS values match manifest § rollback_triggers', () => {
    expect(ROLLBACK_THRESHOLDS.pass_ii_collapse_pp).toBe(-10);
    expect(ROLLBACK_THRESHOLDS.pass_ii_consecutive_windows).toBe(2);
    expect(ROLLBACK_THRESHOLDS.pass_ii_window_size).toBe(10);
    expect(ROLLBACK_THRESHOLDS.error_rate_spike_pp).toBe(5);
    expect(ROLLBACK_THRESHOLDS.error_consecutive_window_hours).toBe(24);
    expect(ROLLBACK_THRESHOLDS.cost_per_request_multiplier).toBe(2.0);
    expect(ROLLBACK_THRESHOLDS.latency_p95_multiplier).toBe(3.0);
    expect(ROLLBACK_THRESHOLDS.opcija_c_loop_exhausted_rate_pct).toBe(5);
  });

  it('PROMOTION_THRESHOLDS values match manifest § promotion_criteria', () => {
    expect(PROMOTION_THRESHOLDS.inclusive_boundary_epsilon).toBe(1e-9);
    expect(PROMOTION_THRESHOLDS.pass_ii_delta_pp).toBe(0);
    expect(PROMOTION_THRESHOLDS.retrieval_qwen_thinking_multiplier).toBe(0.80);
    expect(PROMOTION_THRESHOLDS.retrieval_claude_multiplier).toBe(1.0);
    expect(PROMOTION_THRESHOLDS.latency_p95_multiplier).toBe(1.20);
    expect(PROMOTION_THRESHOLDS.cost_per_request_multiplier).toBe(1.15);
    expect(PROMOTION_THRESHOLDS.error_rate_delta_pp).toBe(1);
    expect(PROMOTION_THRESHOLDS.sample_floor_per_metric).toBe(30);
    expect(PROMOTION_THRESHOLDS.days_min).toBe(7);
  });
});
