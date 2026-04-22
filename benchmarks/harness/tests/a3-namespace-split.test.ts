/**
 * Sprint 12 Task 2 §2.1 — A3 failure taxonomy namespace split coverage.
 *
 * Decision doc: decisions/2026-04-23-jsonl-record-taxonomy-split-locked.md
 *
 * Covers the additive namespace split across four surfaces:
 *   1. JudgePayload carries `a3_failure_code` + `a3_rationale` alongside the
 *      legacy `judge_failure_mode` + `judge_rationale` fields (Sprint 9
 *      read-only preservation contract).
 *   2. `buildAggregate` emits `failure_distribution` when records carry the
 *      `a3_failure_code` column (legacy-only runs stay `undefined`).
 *   3. `a3_failure_code` / `a3_rationale` grep-compatibility — A3 rows are
 *      greppable under the `a3_` prefix per Opcija C audit trail rationale.
 *   4. Mapping from Sprint 9 5-value FailureMode into A3 § 6 8-value
 *      FailureCode preserves semantic equivalence (F1..F5 pass through,
 *      null → null, F6 / F_other remain unused until rubric upgrade).
 */

import { describe, expect, it } from 'vitest';
import { runJudge, type JudgeConfig, type JudgeTriple } from '../src/judge-runner.js';
import type { LlmClient } from '../src/judge-types.js';
import { buildAggregate } from '../src/metrics.js';
import type { FailureMode, JsonlRecord, RunConfig } from '../src/types.js';

function stubClient(
  verdict: 'correct' | 'incorrect',
  failureMode: FailureMode | null,
): LlmClient {
  return {
    async complete(_prompt: string) {
      return JSON.stringify({
        verdict,
        failure_mode: failureMode,
        rationale: `stub: ${verdict}/${failureMode ?? 'null'}`,
      });
    },
  };
}

const TRIPLE: JudgeTriple = {
  question: 'What is the capital of France?',
  groundTruth: 'Paris',
  contextExcerpt: 'France is a country in Europe. Its capital is Paris.',
  modelAnswer: 'Paris',
};

describe('Sprint 12 Task 2 §2.1 — JudgePayload carries a3_* fields', () => {
  it('single-judge correct verdict → a3_failure_code=null, a3_rationale=null, legacy preserved', async () => {
    const client = stubClient('correct', null);
    const payload = await runJudge(TRIPLE, { kind: 'single', model: 'claude-opus-4-7', client });

    // A3 namespace columns.
    expect(payload.a3_failure_code).toBeNull();
    expect(payload.a3_rationale).toBeNull();
    // Sprint 9 legacy preserved verbatim (contract: read-only, not erased).
    expect(payload.judge_failure_mode).toBeNull();
    expect(payload.judge_rationale).toContain('correct');
  });

  it('single-judge incorrect/F3 → a3_failure_code mirrors legacy 5-value code', async () => {
    const client = stubClient('incorrect', 'F3');
    const payload = await runJudge(TRIPLE, { kind: 'single', model: 'claude-opus-4-7', client });

    expect(payload.a3_failure_code).toBe('F3');
    expect(payload.a3_rationale).toBeNull();
    expect(payload.judge_failure_mode).toBe('F3');
  });

  it('3-primary ensemble 2-1 majority → a3_failure_code mirrors majority code', async () => {
    const opus = stubClient('incorrect', 'F1');
    const gpt = stubClient('incorrect', 'F1');
    const gemini = stubClient('correct', null);

    const clients = new Map<string, LlmClient>();
    clients.set('claude-opus-4-7', opus);
    clients.set('gpt-5.4', gpt);
    clients.set('gemini-3.1', gemini);

    const config: JudgeConfig = {
      kind: 'ensemble',
      models: ['claude-opus-4-7', 'gpt-5.4', 'gemini-3.1'],
      clients,
    };

    const payload = await runJudge(TRIPLE, config);
    expect(payload.judge_failure_mode).toBe('F1');
    expect(payload.a3_failure_code).toBe('F1');
    expect(payload.a3_rationale).toBeNull();
  });

  it('3-primary + quadri-vendor tie-break → a3_failure_code mirrors resolved code', async () => {
    const opus = stubClient('correct', null);
    const gpt = stubClient('incorrect', 'F3');
    const gemini = stubClient('incorrect', 'F4');
    const grok = stubClient('correct', null);

    const clients = new Map<string, LlmClient>();
    clients.set('claude-opus-4-7', opus);
    clients.set('gpt-5.4', gpt);
    clients.set('gemini-3.1', gemini);

    const config: JudgeConfig = {
      kind: 'ensemble',
      models: ['claude-opus-4-7', 'gpt-5.4', 'gemini-3.1'],
      clients,
      tieBreakerModel: 'xai/grok-4.20',
      tieBreakerClient: grok,
    };

    const payload = await runJudge(TRIPLE, config);
    expect(payload.tie_break_path).toBe('quadri-vendor');
    expect(payload.judge_verdict).toBe('correct');
    expect(payload.judge_failure_mode).toBeNull();
    expect(payload.a3_failure_code).toBeNull();
    expect(payload.a3_rationale).toBeNull();
  });

  it('3-primary pm-escalation 1-1-1-1 → a3_failure_code undefined (skipped-judge semantics)', async () => {
    const opus = stubClient('correct', null);
    const gpt = stubClient('incorrect', 'F1');
    const gemini = stubClient('incorrect', 'F2');
    const grok = stubClient('incorrect', 'F3');  // fourth bucket → 1-1-1-1

    const clients = new Map<string, LlmClient>();
    clients.set('claude-opus-4-7', opus);
    clients.set('gpt-5.4', gpt);
    clients.set('gemini-3.1', gemini);

    const config: JudgeConfig = {
      kind: 'ensemble',
      models: ['claude-opus-4-7', 'gpt-5.4', 'gemini-3.1'],
      clients,
      tieBreakerModel: 'xai/grok-4.20',
      tieBreakerClient: grok,
    };

    const payload = await runJudge(TRIPLE, config);
    expect(payload.tie_break_path).toBe('pm-escalation');
    expect(payload.judge_error).toBe('PM_ESCALATION');
    // skipped-judge semantics: no A3 code assigned, aggregator will exclude.
    expect(payload.a3_failure_code).toBeUndefined();
    expect(payload.a3_rationale).toBeNull();
  });
});

describe('Sprint 12 Task 2 §2.1 — buildAggregate failure_distribution', () => {
  function makeConfig(): RunConfig {
    return {
      run: { kind: 'cell', name: 'raw' },
      dataset: { id: 'synthetic', displayName: 'Synthetic', dataPath: 'synthetic', source: 'synthetic' },
      model: {
        id: 'qwen3.6-35b-a3b',
        displayName: 'Qwen',
        provider: 'alibaba',
        litellmModel: 'dashscope/qwen3.6-35b-a3b',
        pricePerMillionInput: 0.2,
        pricePerMillionOutput: 0.8,
        contextWindow: 262144,
      },
      limit: 10,
      seed: 42,
      budgetUsd: Infinity,
      outputPath: '/tmp/test.jsonl',
      dryRun: true,
      litellmUrl: 'http://localhost:4000',
      litellmApiKey: 'sk-test',
    };
  }

  function makeRecord(overrides: Partial<JsonlRecord> = {}): JsonlRecord {
    return {
      turnId: 't-1',
      cell: 'raw',
      instance_id: 'inst-1',
      model: 'qwen',
      seed: 42,
      accuracy: 1,
      p50_latency_ms: 10,
      p95_latency_ms: 20,
      usd_per_query: 0.001,
      failure_mode: null,
      ...overrides,
    };
  }

  it('emits failure_distribution when records carry a3_failure_code', () => {
    const records: JsonlRecord[] = [
      makeRecord({ instance_id: 'i1', a3_failure_code: null }),
      makeRecord({ instance_id: 'i2', a3_failure_code: null }),
      makeRecord({ instance_id: 'i3', a3_failure_code: 'F1' }),
      makeRecord({
        instance_id: 'i4',
        a3_failure_code: 'F_other',
        a3_rationale: 'model hallucinated an unrelated entity and drifted off topic entirely forever',
      }),
    ];
    const summary = buildAggregate(
      makeConfig(),
      records,
      '2026-04-23T00:00:00.000Z',
      '2026-04-23T00:00:01.000Z',
      null,
    );
    expect(summary.failure_distribution).toBeDefined();
    expect(summary.failure_distribution!.total).toBe(4);
    expect(summary.failure_distribution!.counts.null).toBe(2);
    expect(summary.failure_distribution!.counts.F1).toBe(1);
    expect(summary.failure_distribution!.counts.F_other).toBe(1);
    expect(summary.failure_distribution!.f_other_rate).toBeCloseTo(0.25, 10);
    expect(summary.failure_distribution!.f_other_review_flag).toBe(true); // 25% > 10%
    expect(summary.failure_distribution!.f_other_rationales_sample).toHaveLength(1);
  });

  it('leaves failure_distribution undefined when no records carry a3_failure_code', () => {
    const records: JsonlRecord[] = [
      makeRecord({ instance_id: 'i1', judge_failure_mode: 'F1' }),  // legacy only
      makeRecord({ instance_id: 'i2' }),                             // no judge at all
    ];
    const summary = buildAggregate(
      makeConfig(),
      records,
      '2026-04-23T00:00:00.000Z',
      '2026-04-23T00:00:01.000Z',
      null,
    );
    expect(summary.failure_distribution).toBeUndefined();
  });

  it('excludes rows with undefined a3_failure_code (PM_ESCALATION skipped-judge semantics)', () => {
    const records: JsonlRecord[] = [
      makeRecord({ instance_id: 'i1', a3_failure_code: null }),
      makeRecord({ instance_id: 'i2', a3_failure_code: 'F1' }),
      // PM escalated → a3 undefined, should be excluded from distribution.
      makeRecord({ instance_id: 'i3' }),
    ];
    const summary = buildAggregate(
      makeConfig(),
      records,
      '2026-04-23T00:00:00.000Z',
      '2026-04-23T00:00:01.000Z',
      null,
    );
    expect(summary.failure_distribution).toBeDefined();
    expect(summary.failure_distribution!.total).toBe(2);
  });
});

describe('Sprint 12 Task 2 §2.1 — JsonlRecord grep compatibility', () => {
  it('a3_failure_code + a3_rationale accepted at the type level as optional fields', () => {
    // Compile-time contract check: the fields exist and accept the
    // FailureCode union. The test body only asserts that the object
    // structural-types correctly against JsonlRecord.
    const rec: JsonlRecord = {
      turnId: 't-1',
      cell: 'raw',
      instance_id: 'inst-1',
      model: 'qwen',
      seed: 42,
      accuracy: 1,
      p50_latency_ms: 10,
      p95_latency_ms: 20,
      usd_per_query: 0.001,
      failure_mode: null,
      a3_failure_code: 'F_other',
      a3_rationale: 'ten or more token rationale satisfying the A3 LOCK validator invariant',
    };
    expect(rec.a3_failure_code).toBe('F_other');
    expect(rec.a3_rationale?.split(/\s+/).filter(Boolean).length).toBeGreaterThanOrEqual(10);
  });
});
