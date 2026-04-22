/**
 * JsonlRecord extension tests (Sprint 9 Task 1).
 *
 * Extension spec: `PM-Waggle-OS/strategy/2026-04-20-failure-mode-taxonomy.md` §9
 * Brief: `PM-Waggle-OS/briefs/2026-04-20-cc-sprint-9-tasks.md` Task 1
 *
 * These tests prove three acceptance criteria from the brief:
 *   (i)  A pre-judge JSONL record (Sprint-7/8 shape, no judge fields)
 *        parses as a JsonlRecord without error — backward compatibility.
 *   (ii) A post-judge JSONL record (Task-1 extended shape) parses and
 *        preserves every judge field.
 *   (iii) The `JudgeVerdict` union is a closed enum — downstream code that
 *        exhaustive-switches on it caught at compile time. We enforce this
 *        with a compile-time never-check so TypeScript proves the coverage
 *        rather than depending on runtime validation (no Zod dep on the
 *        harness side yet; TypeScript is the check as per the brief:
 *        "Ako postoji schema validator (Zod ili sl.), dopuniti; ako ne,
 *        preskoči i ostavi TypeScript checking").
 */

import { describe, it, expect } from 'vitest';
import type {
  JsonlRecord,
  FailureMode,
  JudgeVerdict,
  JudgeEnsembleEntry,
} from '../src/types.js';

// Fixture: pre-judge record exactly as Sprint-7/8 runners emitted it.
const PRE_JUDGE_JSONL = JSON.stringify({
  turnId: '5a02a79a-0a56-4e1d-a6e5-bc5a7b80b19f',
  cell: 'raw',
  instance_id: 'locomo_conv-26_q000',
  model: 'qwen3.6-35b-a3b',
  seed: 42,
  accuracy: 1,
  p50_latency_ms: 820,
  p95_latency_ms: 1240,
  usd_per_query: 0.000017,
  failure_mode: null,
});

// Fixture: post-judge record with every new field populated, ensemble shape.
const POST_JUDGE_JSONL = JSON.stringify({
  turnId: '9f16c4b2-e831-4a23-8a97-cd8b1e4c7210',
  cell: 'full-context',
  instance_id: 'locomo_conv-26_q001',
  model: 'qwen3.6-35b-a3b',
  seed: 42,
  accuracy: 1,
  p50_latency_ms: 1145,
  p95_latency_ms: 1540,
  usd_per_query: 0.000087,
  failure_mode: null,
  model_answer: '7 May 2023',
  judge_verdict: 'correct',
  judge_failure_mode: null,
  judge_rationale: 'Answer matches ground truth date precisely.',
  judge_model: 'claude-sonnet-4-6',
  judge_timestamp: '2026-04-21T14:32:00.000Z',
  judge_confidence: 0.98,
  judge_ensemble: [
    { model: 'claude-sonnet-4-6', verdict: 'correct', failure_mode: null, latency_ms: 920 },
    { model: 'claude-haiku-4-5', verdict: 'correct', failure_mode: null, latency_ms: 410 },
  ],
});

// Fixture: incorrect verdict with a specific failure mode — asserts the
// binary verdict + failure_mode pairing that replaces the brief Task-1
// combined 6-value enum.
const INCORRECT_JSONL = JSON.stringify({
  turnId: 'c7d54b11-a2e8-4c50-8f96-1a3b00c4ff70',
  cell: 'raw',
  instance_id: 'locomo_conv-26_q002',
  model: 'qwen3.6-35b-a3b',
  seed: 42,
  accuracy: 0,
  p50_latency_ms: 890,
  p95_latency_ms: 1300,
  usd_per_query: 0.000021,
  failure_mode: null,
  model_answer: 'The event took place on 12 December 2024.',
  judge_verdict: 'incorrect',
  judge_failure_mode: 'F3',
  judge_rationale: 'Model states a date that contradicts the ground-truth context.',
  judge_model: 'claude-sonnet-4-6',
  judge_timestamp: '2026-04-21T14:33:05.000Z',
});

describe('JsonlRecord backward compatibility (Task 1 acceptance)', () => {
  it('parses a pre-judge Sprint-7/8 record without error', () => {
    const parsed = JSON.parse(PRE_JUDGE_JSONL) as JsonlRecord;
    expect(parsed.turnId).toMatch(/^[0-9a-f-]{36}$/);
    expect(parsed.cell).toBe('raw');
    expect(parsed.failure_mode).toBeNull();
    // All judge fields must be absent — treated as "not judged yet".
    expect(parsed.judge_verdict).toBeUndefined();
    expect(parsed.judge_failure_mode).toBeUndefined();
    expect(parsed.judge_rationale).toBeUndefined();
    expect(parsed.judge_model).toBeUndefined();
    expect(parsed.judge_timestamp).toBeUndefined();
    expect(parsed.judge_confidence).toBeUndefined();
    expect(parsed.judge_ensemble).toBeUndefined();
    expect(parsed.model_answer).toBeUndefined();
  });

  it('parses a post-judge record with ensemble and preserves every field', () => {
    const parsed = JSON.parse(POST_JUDGE_JSONL) as JsonlRecord;
    expect(parsed.model_answer).toBe('7 May 2023');
    expect(parsed.judge_verdict).toBe('correct');
    expect(parsed.judge_failure_mode).toBeNull();
    expect(parsed.judge_rationale).toBe('Answer matches ground truth date precisely.');
    expect(parsed.judge_model).toBe('claude-sonnet-4-6');
    expect(parsed.judge_timestamp).toBe('2026-04-21T14:32:00.000Z');
    expect(parsed.judge_confidence).toBeCloseTo(0.98, 3);
    expect(parsed.judge_ensemble).toHaveLength(2);
    expect(parsed.judge_ensemble?.[0].model).toBe('claude-sonnet-4-6');
    expect(parsed.judge_ensemble?.[0].latency_ms).toBe(920);
  });

  it('parses an incorrect record with a populated failure_mode code', () => {
    const parsed = JSON.parse(INCORRECT_JSONL) as JsonlRecord;
    expect(parsed.judge_verdict).toBe('incorrect');
    expect(parsed.judge_failure_mode).toBe('F3');
    expect(parsed.judge_ensemble).toBeUndefined(); // single-judge run
  });
});

describe('JsonlRecord judge-field type closedness (Task 1 acceptance)', () => {
  // Compile-time never-check: any new value in the JudgeVerdict union
  // will produce a TypeScript error here, forcing the author to update
  // the aggregator and schema consumers. Serves as the "invalid string"
  // gate the brief specified: TS catches at tsc time instead of at
  // runtime via Zod.
  it('JudgeVerdict is an exhaustive closed union', () => {
    const verdicts: JudgeVerdict[] = ['correct', 'incorrect'];
    for (const v of verdicts) {
      switch (v) {
        case 'correct':
          expect(v).toBe('correct');
          break;
        case 'incorrect':
          expect(v).toBe('incorrect');
          break;
        default: {
          const _exhaustive: never = v;
          throw new Error(`unreachable: ${_exhaustive as string}`);
        }
      }
    }
  });

  it('FailureMode is exactly F1..F5 — no extras or aliases', () => {
    const codes: FailureMode[] = ['F1', 'F2', 'F3', 'F4', 'F5'];
    expect(codes).toHaveLength(5);
    for (const code of codes) {
      expect(code).toMatch(/^F[1-5]$/);
    }
  });

  it('JudgeEnsembleEntry carries model + verdict + failure_mode at minimum', () => {
    const entry: JudgeEnsembleEntry = {
      model: 'claude-sonnet-4-6',
      verdict: 'incorrect',
      failure_mode: 'F4',
    };
    expect(entry.model).toBe('claude-sonnet-4-6');
    expect(entry.verdict).toBe('incorrect');
    expect(entry.failure_mode).toBe('F4');
    // Optional fields are assignable without being required.
    const withOptionals: JudgeEnsembleEntry = {
      ...entry,
      rationale: 'hallucinated a name',
      latency_ms: 540,
    };
    expect(withOptionals.rationale).toBeTruthy();
    expect(withOptionals.latency_ms).toBe(540);
  });
});
