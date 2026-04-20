/**
 * Failure-mode judge — unit tests.
 *
 * Brief:  PM-Waggle-OS/briefs/2026-04-20-cc-preflight-prep-tasks.md Task 4
 * Module: packages/server/src/benchmarks/judge/failure-mode-judge.ts
 *
 * Coverage:
 *   - Valid JSON parse for all 5 failure modes (F1..F5) + the correct verdict.
 *   - Invalid-JSON → retry succeeds.
 *   - Invalid-JSON on both attempts → JudgeParseError.
 *   - 4-judge ensemble: 4-0 unanimous, 3-1 majority, 2-2 tie broken by
 *     the first model in `judgeModels` (Sonnet by convention).
 *   - Fleiss' kappa on hand-crafted 4×10 matrices with values computed by
 *     hand and verified against the formula (κ=1 for unanimous two-cluster,
 *     κ≈0.1111 for a known mixed matrix — both within ±0.01 tolerance).
 *
 * No network. No LLM calls. Pure unit tests against mock LlmClients.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  buildJudgePrompt,
  computeFleissKappa,
  extractJsonBody,
  judgeAnswer,
  judgeEnsemble,
  JudgeParseError,
  RETRY_REMINDER,
  type FailureMode,
  type JudgeResult,
  type LlmClient,
  type Verdict,
} from '../../src/benchmarks/judge/failure-mode-judge.js';

// ── Test helpers ───────────────────────────────────────────────────────

class ScriptedLlmClient implements LlmClient {
  readonly calls: string[] = [];
  private readonly queue: Array<string | Error>;
  constructor(responses: Array<string | Error>) {
    this.queue = [...responses];
  }
  async complete(prompt: string): Promise<string> {
    this.calls.push(prompt);
    if (this.queue.length === 0) throw new Error('ScriptedLlmClient out of responses');
    const next = this.queue.shift()!;
    if (next instanceof Error) throw next;
    return next;
  }
}

function mkResult(verdict: Verdict, failure_mode: FailureMode | null, rationale: string, judge_model: string): JudgeResult {
  return { verdict, failure_mode, rationale, judge_model };
}

// ── Prompt shape ───────────────────────────────────────────────────────

describe('buildJudgePrompt', () => {
  it('interpolates all four required variables verbatim', () => {
    const prompt = buildJudgePrompt({
      question: 'When did Caroline go to the support group?',
      groundTruth: '7 May 2023',
      contextExcerpt: 'Caroline: I went to a LGBTQ support group yesterday.',
      modelAnswer: 'Unclear.',
    });
    expect(prompt).toContain('## Question\nWhen did Caroline go to the support group?');
    expect(prompt).toContain('## Ground-truth answer\n7 May 2023');
    expect(prompt).toContain('## Ground-truth supporting context');
    expect(prompt).toContain("Caroline: I went to a LGBTQ support group yesterday.");
    expect(prompt).toContain("## Model's answer\nUnclear.");
    // Decision tree sanity — verifies the exact §4 text didn't drift.
    expect(prompt).toContain('→ F1 (ABSTAIN)');
    expect(prompt).toContain('→ F5 (OFF-TOPIC)');
    expect(prompt).toContain('→ F4 (HALLUCINATED)');
    expect(prompt).toContain('→ F2 (PARTIAL)');
    expect(prompt).toContain('→ F3 (INCORRECT)');
  });
});

// ── JSON extraction ────────────────────────────────────────────────────

describe('extractJsonBody', () => {
  it('returns bare JSON unchanged', () => {
    expect(extractJsonBody('{"verdict":"correct"}')).toBe('{"verdict":"correct"}');
  });
  it('strips markdown fences with `json` hint', () => {
    const raw = '```json\n{"verdict":"correct"}\n```';
    expect(extractJsonBody(raw)).toBe('{"verdict":"correct"}');
  });
  it('strips bare markdown fences', () => {
    const raw = '```\n{"verdict":"incorrect","failure_mode":"F3"}\n```';
    expect(extractJsonBody(raw)).toBe('{"verdict":"incorrect","failure_mode":"F3"}');
  });
  it('extracts the JSON object from prose', () => {
    const raw = 'Here is my verdict: {"verdict":"correct","failure_mode":null,"rationale":"ok"}';
    expect(extractJsonBody(raw)).toBe('{"verdict":"correct","failure_mode":null,"rationale":"ok"}');
  });
  it('returns null when no object is present', () => {
    expect(extractJsonBody('I cannot comply.')).toBeNull();
  });
});

// ── judgeAnswer — happy path + failure modes ───────────────────────────

describe('judgeAnswer — valid JSON parse for all 5 failure modes + correct', () => {
  const cases: Array<{ name: string; verdict: Verdict; failure_mode: FailureMode | null; rationale: string }> = [
    { name: 'correct',          verdict: 'correct',   failure_mode: null, rationale: 'All facts match the ground truth.' },
    { name: 'F1 abstain',       verdict: 'incorrect', failure_mode: 'F1', rationale: 'Model explicitly refused to answer.' },
    { name: 'F2 partial',       verdict: 'incorrect', failure_mode: 'F2', rationale: 'Model stated 2 of 3 required facts.' },
    { name: 'F3 incorrect',     verdict: 'incorrect', failure_mode: 'F3', rationale: 'Model stated a wrong date derived from context.' },
    { name: 'F4 hallucinated',  verdict: 'incorrect', failure_mode: 'F4', rationale: 'Model named a person not in the context.' },
    { name: 'F5 off-topic',     verdict: 'incorrect', failure_mode: 'F5', rationale: 'Model answered a different question.' },
  ];

  for (const c of cases) {
    it(`parses ${c.name} and stamps the judge_model`, async () => {
      const payload = JSON.stringify({ verdict: c.verdict, failure_mode: c.failure_mode, rationale: c.rationale });
      const client = new ScriptedLlmClient([payload]);
      const result = await judgeAnswer({
        question: 'q', groundTruth: 'gt', contextExcerpt: 'ctx', modelAnswer: 'ma',
        judgeModel: 'claude-sonnet-4-6', llmClient: client,
      });
      expect(result.verdict).toBe(c.verdict);
      expect(result.failure_mode).toBe(c.failure_mode);
      expect(result.rationale).toBe(c.rationale);
      expect(result.judge_model).toBe('claude-sonnet-4-6');
      expect(client.calls).toHaveLength(1);
    });
  }
});

describe('judgeAnswer — retry semantics', () => {
  const validPayload = JSON.stringify({ verdict: 'correct', failure_mode: null, rationale: 'All facts match.' });

  it('on invalid JSON, retries once with the reminder and returns the retry result', async () => {
    const client = new ScriptedLlmClient([
      'Sorry, I cannot produce structured output — here is a paragraph.',
      validPayload,
    ]);
    const result = await judgeAnswer({
      question: 'q', groundTruth: 'gt', contextExcerpt: 'ctx', modelAnswer: 'ma',
      judgeModel: 'claude-sonnet-4-6', llmClient: client,
    });
    expect(result.verdict).toBe('correct');
    expect(client.calls).toHaveLength(2);
    // Retry prompt must begin with the exact reminder text from the spec.
    expect(client.calls[1].startsWith(RETRY_REMINDER)).toBe(true);
  });

  it('on invalid JSON twice, throws JudgeParseError with the raw response attached', async () => {
    const client = new ScriptedLlmClient([
      'Still refusing to produce JSON.',
      'Nope, same here.',
    ]);
    await expect(
      judgeAnswer({
        question: 'q', groundTruth: 'gt', contextExcerpt: 'ctx', modelAnswer: 'ma',
        judgeModel: 'gpt-5', llmClient: client,
      }),
    ).rejects.toBeInstanceOf(JudgeParseError);

    try {
      await judgeAnswer({
        question: 'q', groundTruth: 'gt', contextExcerpt: 'ctx', modelAnswer: 'ma',
        judgeModel: 'gpt-5', llmClient: new ScriptedLlmClient(['bad1', 'bad2']),
      });
    } catch (e) {
      expect(e).toBeInstanceOf(JudgeParseError);
      const err = e as JudgeParseError;
      expect(err.judgeModel).toBe('gpt-5');
      expect(err.lastResponse).toBe('bad2');
      expect(err.lastParseError).toBeTruthy();
    }
  });

  it('rejects schema-valid JSON that violates the verdict/failure_mode invariant', async () => {
    // verdict=correct with a non-null failure_mode — Step-3 contract violation.
    const bad = JSON.stringify({ verdict: 'correct', failure_mode: 'F4', rationale: 'contradictory' });
    // Both attempts return the same bad shape — should throw.
    const client = new ScriptedLlmClient([bad, bad]);
    await expect(
      judgeAnswer({
        question: 'q', groundTruth: 'gt', contextExcerpt: 'ctx', modelAnswer: 'ma',
        judgeModel: 'gemini-pro', llmClient: client,
      }),
    ).rejects.toBeInstanceOf(JudgeParseError);
  });

  it('accepts fenced JSON in the first attempt (no retry)', async () => {
    const fenced = '```json\n' + JSON.stringify({ verdict: 'incorrect', failure_mode: 'F3', rationale: 'Wrong date.' }) + '\n```';
    const client = new ScriptedLlmClient([fenced]);
    const result = await judgeAnswer({
      question: 'q', groundTruth: 'gt', contextExcerpt: 'ctx', modelAnswer: 'ma',
      judgeModel: 'haiku', llmClient: client,
    });
    expect(result.failure_mode).toBe('F3');
    expect(client.calls).toHaveLength(1);
  });
});

// ── judgeEnsemble — 4-judge aggregation ────────────────────────────────

describe('judgeEnsemble — 4-judge aggregation', () => {
  function mkClientWith(verdict: Verdict, failure_mode: FailureMode | null, rationale: string): LlmClient {
    return new ScriptedLlmClient([JSON.stringify({ verdict, failure_mode, rationale })]);
  }

  const models = ['claude-sonnet-4-6', 'claude-haiku-4-5', 'gpt-5', 'gemini-pro'];

  it('4-0 unanimous → majority matches the unanimous verdict', async () => {
    const clients = new Map<string, LlmClient>();
    for (const m of models) clients.set(m, mkClientWith('correct', null, 'match'));
    const result = await judgeEnsemble({
      question: 'q', groundTruth: 'gt', contextExcerpt: 'ctx', modelAnswer: 'ma',
      judgeModels: models, llmClients: clients,
    });
    expect(result.ensemble).toHaveLength(4);
    expect(result.majority.verdict).toBe('correct');
    expect(result.majority.failure_mode).toBeNull();
    // κ = 1 when every rater agrees on the same class (and all 6 classes
    // contribute 0 or 1 to the marginals → expected = observed = 1).
    expect(result.fleissKappa).toBeCloseTo(1, 6);
  });

  it('3-1 majority → majority verdict wins, minority is recorded in ensemble', async () => {
    const clients = new Map<string, LlmClient>();
    clients.set(models[0], mkClientWith('incorrect', 'F3', 'A'));
    clients.set(models[1], mkClientWith('incorrect', 'F3', 'B'));
    clients.set(models[2], mkClientWith('incorrect', 'F3', 'C'));
    clients.set(models[3], mkClientWith('incorrect', 'F4', 'D')); // minority — says hallucination
    const result = await judgeEnsemble({
      question: 'q', groundTruth: 'gt', contextExcerpt: 'ctx', modelAnswer: 'ma',
      judgeModels: models, llmClients: clients,
    });
    expect(result.majority.verdict).toBe('incorrect');
    expect(result.majority.failure_mode).toBe('F3');
    const failureModes = result.ensemble.map(r => r.failure_mode);
    expect(failureModes.filter(m => m === 'F3')).toHaveLength(3);
    expect(failureModes.filter(m => m === 'F4')).toHaveLength(1);
  });

  it('2-2 tie is broken by the first model in judgeModels (Sonnet by convention)', async () => {
    const clients = new Map<string, LlmClient>();
    // Sonnet + Haiku say F2; GPT-5 + Gemini say F3.
    clients.set(models[0], mkClientWith('incorrect', 'F2', 'sonnet'));
    clients.set(models[1], mkClientWith('incorrect', 'F2', 'haiku'));
    clients.set(models[2], mkClientWith('incorrect', 'F3', 'gpt-5'));
    clients.set(models[3], mkClientWith('incorrect', 'F3', 'gemini'));
    const result = await judgeEnsemble({
      question: 'q', groundTruth: 'gt', contextExcerpt: 'ctx', modelAnswer: 'ma',
      judgeModels: models, llmClients: clients,
    });
    // Sonnet wins the tie → F2.
    expect(result.majority.failure_mode).toBe('F2');
    expect(result.majority.rationale).toBe('sonnet');
    expect(result.majority.judge_model).toBe('claude-sonnet-4-6');
  });

  it('refuses when no client is registered for a judge model', async () => {
    const clients = new Map<string, LlmClient>();
    clients.set(models[0], mkClientWith('correct', null, 'ok'));
    // Missing models[1..3]
    await expect(
      judgeEnsemble({
        question: 'q', groundTruth: 'gt', contextExcerpt: 'ctx', modelAnswer: 'ma',
        judgeModels: models, llmClients: clients,
      }),
    ).rejects.toThrow(/no LlmClient registered/);
  });
});

// ── Fleiss' kappa ──────────────────────────────────────────────────────

describe("computeFleissKappa on hand-crafted 4-judge × 10-subject matrices", () => {
  function row(n: number, verdict: Verdict, failure_mode: FailureMode | null): JudgeResult[] {
    return Array.from({ length: n }, (_, i) => mkResult(verdict, failure_mode, 'r', `j${i}`));
  }

  it('κ = 1 for two-cluster unanimous agreement (5 × correct / 5 × F3)', () => {
    // 5 subjects: 4 raters all say correct.
    // 5 subjects: 4 raters all say F3.
    // Pbar = 1 (every subject unanimous).  Pj(correct) = 0.5, Pj(F3) = 0.5.
    // Pebar = 0.5 + 0.5 = 0.5 (treating the other 4 classes as 0).
    // κ = (1 - 0.5) / (1 - 0.5) = 1.
    const matrix: JudgeResult[][] = [];
    for (let i = 0; i < 5; i++) matrix.push(row(4, 'correct', null));
    for (let i = 0; i < 5; i++) matrix.push(row(4, 'incorrect', 'F3'));
    const kappa = computeFleissKappa(matrix);
    expect(kappa).toBeCloseTo(1, 6);
  });

  it('κ ≈ 0.1111 for 5 unanimous-correct + 5 split-2/2-correct/F3 subjects', () => {
    // Hand-computed: n_correct = 5*4 + 5*2 = 30, n_F3 = 5*2 = 10. Total = 40.
    // Pj(correct) = 30/40 = 0.75 → 0.5625
    // Pj(F3)      = 10/40 = 0.25 → 0.0625
    // Pebar = 0.5625 + 0.0625 = 0.625
    // Per-subject Pi:
    //   unanimous correct: (16+0-4)/(4*3) = 12/12 = 1
    //   split 2/2:         (4+4-4)/12     = 4/12  ≈ 0.33333
    // Pbar = (5*1 + 5*0.33333) / 10 = 6.66667 / 10 = 0.66667
    // κ = (0.66667 - 0.625) / (1 - 0.625) = 0.04167 / 0.375 = 0.11111
    const matrix: JudgeResult[][] = [];
    for (let i = 0; i < 5; i++) matrix.push(row(4, 'correct', null));
    for (let i = 0; i < 5; i++) {
      matrix.push([
        mkResult('correct', null, 'r', 'j0'),
        mkResult('correct', null, 'r', 'j1'),
        mkResult('incorrect', 'F3', 'r', 'j2'),
        mkResult('incorrect', 'F3', 'r', 'j3'),
      ]);
    }
    const kappa = computeFleissKappa(matrix);
    expect(kappa).toBeCloseTo(0.1111, 2); // tolerance ±0.01 per the brief
  });

  it('κ = 1 when every rating falls in a single category (expected = observed = 1)', () => {
    // Degenerate edge case: all 40 ratings are `correct`. Pebar = 1.
    // Implementation clamps to 1 (the (1-1)/(1-1) limit).
    const matrix: JudgeResult[][] = [];
    for (let i = 0; i < 10; i++) matrix.push(row(4, 'correct', null));
    expect(computeFleissKappa(matrix)).toBe(1);
  });

  it('throws when rater counts are inconsistent across subjects', () => {
    const matrix: JudgeResult[][] = [
      row(4, 'correct', null),
      row(3, 'correct', null), // wrong rater count
    ];
    expect(() => computeFleissKappa(matrix)).toThrow(/constant rater count/);
  });

  it('returns 0 for a single-rater input (kappa undefined, convention 0)', () => {
    const matrix: JudgeResult[][] = Array.from({ length: 10 }, () => row(1, 'correct', null));
    expect(computeFleissKappa(matrix)).toBe(0);
  });

  it('returns 0 for an empty input', () => {
    expect(computeFleissKappa([])).toBe(0);
  });
});
