import { describe, it, expect } from 'vitest';
import {
  LLMJudge,
  DEFAULT_WEIGHTS,
  DEFAULT_RUBRIC,
  buildPrompt as buildJudgePrompt,
  parseJudgeResponse,
  computeLengthPenalty,
  type JudgeLLMCall,
  type JudgeInput,
} from '../src/judge.js';

// ── Pure helpers ───────────────────────────────────────────────

describe('buildJudgePrompt', () => {
  it('includes instruction, expected, actual in order', () => {
    const prompt = buildJudgePrompt('RUBRIC TEXT', {
      input: 'the question',
      expected: 'the answer',
      actual: 'the candidate',
    });
    expect(prompt).toContain('RUBRIC TEXT');
    expect(prompt).toContain('INSTRUCTION:\nthe question');
    expect(prompt).toContain('EXPECTED:\nthe answer');
    expect(prompt).toContain('ACTUAL:\nthe candidate');
    expect(prompt.indexOf('INSTRUCTION')).toBeLessThan(prompt.indexOf('EXPECTED'));
    expect(prompt.indexOf('EXPECTED')).toBeLessThan(prompt.indexOf('ACTUAL'));
  });

  it('includes optional context line when provided', () => {
    const prompt = buildJudgePrompt('R', {
      input: 'x', expected: 'y', actual: 'z', context: 'persona: coder',
    });
    expect(prompt).toContain('CONTEXT: persona: coder');
  });
});

describe('parseJudgeResponse', () => {
  it('parses clean JSON', () => {
    const raw = '{"correctness": 8, "procedure": 7, "conciseness": 9, "feedback": "Nice"}';
    const parsed = parseJudgeResponse(raw);
    expect(parsed).toEqual({ correctness: 8, procedure: 7, conciseness: 9, feedback: 'Nice' });
  });

  it('strips markdown code fences', () => {
    const raw = '```json\n{"correctness":5,"procedure":5,"conciseness":5,"feedback":"ok"}\n```';
    const parsed = parseJudgeResponse(raw);
    expect(parsed?.correctness).toBe(5);
  });

  it('handles extra prose before and after the JSON', () => {
    const raw = 'Sure! Here is the evaluation:\n{"correctness":9,"procedure":8,"conciseness":10,"feedback":"Tight"}\nLet me know if you need more.';
    const parsed = parseJudgeResponse(raw);
    expect(parsed?.correctness).toBe(9);
    expect(parsed?.feedback).toBe('Tight');
  });

  it('prefers the outer JSON when nested objects are present in strings', () => {
    const raw = '{"correctness":6,"procedure":6,"conciseness":6,"feedback":"Has {nested} braces in text"}';
    const parsed = parseJudgeResponse(raw);
    expect(parsed?.feedback).toBe('Has {nested} braces in text');
  });

  it('returns null for empty input', () => {
    expect(parseJudgeResponse('')).toBeNull();
  });

  it('returns null when required numeric fields are missing', () => {
    expect(parseJudgeResponse('{"feedback":"just prose"}')).toBeNull();
  });

  it('returns null for non-JSON text', () => {
    expect(parseJudgeResponse('The score is 10/10 — perfect!')).toBeNull();
  });

  it('returns null for malformed JSON', () => {
    expect(parseJudgeResponse('{"correctness": 5, "procedure":')).toBeNull();
  });

  it('defaults feedback to empty string when missing', () => {
    const parsed = parseJudgeResponse('{"correctness":1,"procedure":2,"conciseness":3}');
    expect(parsed?.feedback).toBe('');
  });
});

describe('computeLengthPenalty', () => {
  it('returns 1.0 when within tolerance', () => {
    expect(computeLengthPenalty(1500, 2000, 0.5, 0.5)).toBe(1);
    expect(computeLengthPenalty(3000, 2000, 0.5, 0.5)).toBe(1); // = target * 1.5
  });

  it('returns floor when far beyond limit', () => {
    expect(computeLengthPenalty(6000, 2000, 0.5, 0.5)).toBe(0.5); // = 3 * target
    expect(computeLengthPenalty(100000, 2000, 0.5, 0.5)).toBe(0.5);
  });

  it('interpolates linearly between limit and 3*target', () => {
    // limit = 3000, farLimit = 6000 — midpoint is 4500 → penalty = 0.75
    expect(computeLengthPenalty(4500, 2000, 0.5, 0.5)).toBeCloseTo(0.75, 5);
  });

  it('returns 1 for empty actual', () => {
    expect(computeLengthPenalty(0, 2000, 0.5, 0.5)).toBe(1);
  });

  it('returns 1 if target is non-positive', () => {
    expect(computeLengthPenalty(100, 0, 0.5, 0.5)).toBe(1);
  });
});

// ── LLMJudge (with a stub LLM) ─────────────────────────────────

function makeLLM(responses: string[] | ((prompt: string) => string)): JudgeLLMCall {
  if (typeof responses === 'function') {
    return async (prompt: string) => responses(prompt);
  }
  let i = 0;
  return async () => {
    const r = responses[Math.min(i, responses.length - 1)];
    i++;
    return r;
  };
}

describe('LLMJudge', () => {
  const example: JudgeInput = {
    input: 'What is 2 + 2?',
    expected: '4',
    actual: 'The answer is 4.',
  };

  it('scores a clean response with weighted sum', async () => {
    const llm = makeLLM([
      '{"correctness":10,"procedure":10,"conciseness":10,"feedback":"Perfect"}',
    ]);
    const judge = new LLMJudge(llm);
    const score = await judge.score(example);

    expect(score.parsed).toBe(true);
    expect(score.correctness).toBe(1);
    expect(score.procedureFollowing).toBe(1);
    expect(score.conciseness).toBe(1);
    expect(score.weighted).toBeCloseTo(1, 5);
    expect(score.overall).toBeCloseTo(1, 5);
    expect(score.feedback).toBe('Perfect');
    expect(score.lengthPenalty).toBe(1);
  });

  it('applies weights correctly', async () => {
    const llm = makeLLM([
      '{"correctness":10,"procedure":0,"conciseness":0,"feedback":""}',
    ]);
    const judge = new LLMJudge(llm);
    const score = await judge.score(example);

    // correctness weight is 0.5 → overall = 1 * 0.5 + 0 + 0
    expect(score.weighted).toBeCloseTo(DEFAULT_WEIGHTS.correctness, 5);
  });

  it('clamps scores outside 0-10 into 0..1', async () => {
    const llm = makeLLM([
      '{"correctness":15,"procedure":-3,"conciseness":5,"feedback":""}',
    ]);
    const judge = new LLMJudge(llm);
    const score = await judge.score(example);

    expect(score.correctness).toBe(1);
    expect(score.procedureFollowing).toBe(0);
    expect(score.conciseness).toBe(0.5);
  });

  it('applies length penalty to verbose responses', async () => {
    const llm = makeLLM([
      '{"correctness":10,"procedure":10,"conciseness":10,"feedback":"verbose"}',
    ]);
    const judge = new LLMJudge(llm, { lengthTarget: 20, lengthTolerance: 0.5 });
    const verbose: JudgeInput = {
      input: 'x', expected: 'y', actual: 'z'.repeat(60), // far beyond 3*target=60
    };
    const score = await judge.score(verbose);

    expect(score.lengthPenalty).toBeLessThan(1);
    expect(score.overall).toBeLessThan(score.weighted);
  });

  it('returns errorScore when LLM throws', async () => {
    const llm: JudgeLLMCall = async () => {
      throw new Error('network down');
    };
    const judge = new LLMJudge(llm);
    const score = await judge.score(example);

    expect(score.parsed).toBe(false);
    expect(score.overall).toBe(0);
    expect(score.feedback).toContain('network down');
  });

  it('returns errorScore when response cannot be parsed', async () => {
    const llm = makeLLM(['totally unparseable garbage']);
    const judge = new LLMJudge(llm);
    const score = await judge.score(example);

    expect(score.parsed).toBe(false);
    expect(score.overall).toBe(0);
    expect(score.feedback).toContain('could not be parsed');
  });

  it('scoreBatch processes inputs in order', async () => {
    const responses = [
      '{"correctness":10,"procedure":10,"conciseness":10,"feedback":"A"}',
      '{"correctness":5,"procedure":5,"conciseness":5,"feedback":"B"}',
      '{"correctness":0,"procedure":0,"conciseness":0,"feedback":"C"}',
    ];
    const llm = makeLLM(responses);
    const judge = new LLMJudge(llm);

    const scores = await judge.scoreBatch([example, example, example]);
    expect(scores.map(s => s.feedback)).toEqual(['A', 'B', 'C']);
    expect(scores[0].overall).toBeGreaterThan(scores[1].overall);
    expect(scores[1].overall).toBeGreaterThan(scores[2].overall);
  });

  it('honors custom weights', async () => {
    const llm = makeLLM([
      '{"correctness":0,"procedure":10,"conciseness":0,"feedback":""}',
    ]);
    const judge = new LLMJudge(llm, {
      weights: { correctness: 0.1, procedure: 0.8, conciseness: 0.1 },
    });
    const score = await judge.score(example);
    expect(score.weighted).toBeCloseTo(0.8, 5);
  });

  it('rejects weights that do not sum to 1', () => {
    expect(() => new LLMJudge(makeLLM(['']), {
      weights: { correctness: 0.5, procedure: 0.3, conciseness: 0.1 },
    })).toThrow(/sum to 1/);
  });

  it('rejects negative weights', () => {
    expect(() => new LLMJudge(makeLLM(['']), {
      weights: { correctness: -0.1, procedure: 0.6, conciseness: 0.5 },
    })).toThrow(/non-negative/);
  });

  it('uses rubric override when provided', async () => {
    let capturedPrompt = '';
    const llm: JudgeLLMCall = async (prompt) => {
      capturedPrompt = prompt;
      return '{"correctness":5,"procedure":5,"conciseness":5,"feedback":""}';
    };
    const judge = new LLMJudge(llm, { rubricOverride: 'CUSTOM_RUBRIC_MARKER' });
    await judge.score(example);
    expect(capturedPrompt).toContain('CUSTOM_RUBRIC_MARKER');
    expect(capturedPrompt).not.toContain(DEFAULT_RUBRIC.slice(0, 40));
  });
});
