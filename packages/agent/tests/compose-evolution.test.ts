import { describe, it, expect, vi } from 'vitest';
import {
  ComposeEvolution,
  defaultFeedbackFilter,
  filterJudgeFeedback,
  stripStructuralLines,
  schemaExecutorFromInstructionRunner,
} from '../src/compose-evolution.js';
import type {
  Schema,
  SchemaExecuteFn,
} from '../src/evolve-schema.js';
import type { EvalExample } from '../src/eval-dataset.js';
import type { JudgeScore } from '../src/judge.js';

// ── Fixtures ───────────────────────────────────────────────────

function makeSchema(fields: string[]): Schema {
  return {
    name: 'test',
    fields: fields.map(name => ({
      name, type: 'string',
      description: `description of ${name}`,
      required: true,
      constraints: [],
    })),
    version: 1,
  };
}

function makeExamples(n: number): EvalExample[] {
  return Array.from({ length: n }, (_, i) => ({
    input: `q${i}`,
    expected_output: `a${i}`,
    metadata: { source: 'trace' as const },
  }));
}

function makeJudgeScore(overall: number, feedback: string): JudgeScore {
  return {
    overall, weighted: overall,
    correctness: overall, procedureFollowing: overall, conciseness: overall,
    lengthPenalty: 1, feedback, parsed: true,
  };
}

function makeFakeRunner(): SchemaExecuteFn {
  return async ({ schema }) => ({
    actual: schema.fields.map(f => f.name).join(','),
    parsed: true,
  });
}

// ── defaultFeedbackFilter ──────────────────────────────────────

describe('defaultFeedbackFilter', () => {
  it('classifies "missing reasoning field" as structural', () => {
    expect(defaultFeedbackFilter('Missing reasoning field.')).toBe('structural');
  });

  it('classifies "wrong field type" as structural', () => {
    expect(defaultFeedbackFilter('Wrong field type for answer.')).toBe('structural');
  });

  it('classifies "schema mismatch" as structural', () => {
    expect(defaultFeedbackFilter('Schema mismatch — expected 3 fields.')).toBe('structural');
  });

  it('classifies "should reorder fields" as structural', () => {
    expect(defaultFeedbackFilter('Should reorder fields — put reasoning first.')).toBe('structural');
  });

  it('classifies value-level complaints as value', () => {
    expect(defaultFeedbackFilter('The answer is too terse')).toBe('value');
    expect(defaultFeedbackFilter('Response is too verbose')).toBe('value');
    expect(defaultFeedbackFilter('Incorrect calculation')).toBe('value');
    expect(defaultFeedbackFilter('Wrong tone — should be more formal')).toBe('value');
  });

  it('classifies empty feedback as value (safe default)', () => {
    expect(defaultFeedbackFilter('')).toBe('value');
  });
});

// ── stripStructuralLines ──────────────────────────────────────

describe('stripStructuralLines', () => {
  it('returns empty for empty input', () => {
    expect(stripStructuralLines('')).toBe('');
  });

  it('drops only structural lines from multi-line feedback', () => {
    const input = [
      'Missing reasoning field.',
      'The answer is too terse.',
      'Wrong field type for confidence.',
      'Needs more detail.',
    ].join('\n');
    const out = stripStructuralLines(input);
    expect(out).not.toContain('Missing reasoning field');
    expect(out).not.toContain('Wrong field type');
    expect(out).toContain('too terse');
    expect(out).toContain('Needs more detail');
  });

  it('keeps all lines when none are structural', () => {
    const input = 'Too terse.\nNeeds more examples.';
    expect(stripStructuralLines(input)).toBe(input);
  });

  it('returns empty when all lines are structural', () => {
    const input = 'Missing reasoning field.\nSchema mismatch.';
    expect(stripStructuralLines(input)).toBe('');
  });

  it('accepts a custom filter', () => {
    const custom = (line: string) => line.includes('DROP') ? 'structural' : 'value';
    const input = 'keep me\nDROP me\nkeep too';
    expect(stripStructuralLines(input, custom)).toBe('keep me\nkeep too');
  });
});

// ── filterJudgeFeedback ───────────────────────────────────────

describe('filterJudgeFeedback', () => {
  it('strips structural feedback but preserves numeric scores', async () => {
    const rawJudge = {
      async score(): Promise<JudgeScore> {
        return makeJudgeScore(0.7, 'Missing reasoning field.\nResponse is too terse.');
      },
    };
    const filtered = filterJudgeFeedback(rawJudge);
    const score = await filtered.score({ input: 'x', expected: 'y', actual: 'z' });

    expect(score.overall).toBe(0.7);
    expect(score.correctness).toBe(0.7);
    expect(score.feedback).not.toContain('Missing reasoning field');
    expect(score.feedback).toContain('too terse');
  });

  it('returns empty feedback when all lines are structural', async () => {
    const rawJudge = {
      async score(): Promise<JudgeScore> {
        return makeJudgeScore(0.5, 'Missing reasoning field.\nSchema mismatch.');
      },
    };
    const filtered = filterJudgeFeedback(rawJudge);
    const score = await filtered.score({ input: 'x', expected: 'y', actual: 'z' });
    expect(score.feedback).toBe('');
  });
});

// ── schemaExecutorFromInstructionRunner ───────────────────────

describe('schemaExecutorFromInstructionRunner', () => {
  it('builds a schema prefix and delegates to the runner', async () => {
    let captured: { prompt: string; input: string } | null = null;
    const runner = async (args: { prompt: string; input: string }) => {
      captured = args;
      return '{"answer":"42"}';
    };
    const schemaRunner = schemaExecutorFromInstructionRunner(runner);
    const result = await schemaRunner({
      schema: makeSchema(['reasoning', 'answer']),
      input: 'What is 6*7?',
    });

    expect(result.actual).toBe('{"answer":"42"}');
    expect(result.parsed).toBe(true);
    expect(captured!.prompt).toContain('reasoning');
    expect(captured!.prompt).toContain('answer');
    expect(captured!.input).toBe('What is 6*7?');
  });

  it('reports parsed=false for non-JSON output', async () => {
    const schemaRunner = schemaExecutorFromInstructionRunner(async () => 'just prose');
    const result = await schemaRunner({ schema: makeSchema(['answer']), input: 'x' });
    expect(result.parsed).toBe(false);
  });

  it('swallows runner errors and reports parsed=false', async () => {
    const schemaRunner = schemaExecutorFromInstructionRunner(async () => {
      throw new Error('boom');
    });
    const result = await schemaRunner({ schema: makeSchema(['answer']), input: 'x' });
    expect(result.actual).toBe('');
    expect(result.parsed).toBe(false);
  });
});

// ── ComposeEvolution end-to-end ────────────────────────────────

describe('ComposeEvolution.run', () => {
  it('runs schema stage then instruction stage', async () => {
    const stages: string[] = [];

    const result = await new ComposeEvolution().run({
      schema: {
        baseline: makeSchema(['answer']),
        examples: makeExamples(5),
        execute: makeFakeRunner(),
        judge: { async score() { return makeJudgeScore(0.5, 'ok'); } },
        populationSize: 2, generations: 1,
        evalSize: 3, anchorEvalSize: 3,
      },
      instructions: {
        baseline: 'a baseline instruction prompt for testing purposes',
        examples: makeExamples(5),
        judge: { async score() { return makeJudgeScore(0.5, 'ok'); } },
        mutate: async ({ parent }) => `${parent.prompt} v2`,
        allowBareJudge: true,
        populationSize: 2, generations: 1,
        microScreenSize: 3, miniEvalSize: 3, anchorEvalSize: 3,
      },
      onProgress: (e) => stages.push(e.stage),
    });

    expect(stages).toContain('schema');
    expect(stages).toContain('instructions');
    expect(stages).toContain('done');
    expect(result.schema.winner).toBeDefined();
    expect(result.instructions.winner).toBeDefined();
    expect(result.frozenSchema).toBe(result.schema.winner.schema);
  });

  it('feedback separation: GEPA cannot see structural feedback from the judge', async () => {
    const capturedFeedbacks: string[] = [];

    // Judge always emits structural + value feedback
    const mixedJudge = {
      async score(): Promise<JudgeScore> {
        return makeJudgeScore(0.5, 'Missing reasoning field.\nResponse too terse.');
      },
    };

    const mutateSpy = vi.fn(async ({ weaknessFeedback }: { parent: unknown; weaknessFeedback: string[]; strategy: string; targetKind: string; generation: number }) => {
      capturedFeedbacks.push(...weaknessFeedback);
      return 'mutated instruction prompt is a reasonable length';
    });

    await new ComposeEvolution().run({
      schema: {
        baseline: makeSchema(['answer']),
        examples: makeExamples(5),
        execute: makeFakeRunner(),
        judge: mixedJudge,
        populationSize: 2, generations: 1,
        evalSize: 3, anchorEvalSize: 3,
      },
      instructions: {
        baseline: 'a baseline instruction prompt for testing purposes',
        examples: makeExamples(5),
        judge: mixedJudge,
        mutate: mutateSpy,
        allowBareJudge: true,
        populationSize: 2, generations: 1,
        microScreenSize: 3, miniEvalSize: 3, anchorEvalSize: 3,
      },
    });

    // GEPA must never receive "Missing reasoning field" in weaknessFeedback.
    for (const fb of capturedFeedbacks) {
      expect(fb.toLowerCase()).not.toContain('missing reasoning field');
      expect(fb.toLowerCase()).not.toContain('wrong field type');
    }
    // But it should see the value-level complaint
    expect(capturedFeedbacks.join(' ')).toContain('too terse');
  });

  it('accepts a custom feedback filter', async () => {
    let filterCalls = 0;
    const customFilter = (feedback: string): 'structural' | 'value' => {
      filterCalls++;
      return feedback.includes('CUSTOM-DROP') ? 'structural' : 'value';
    };

    const judge = {
      async score(): Promise<JudgeScore> {
        return makeJudgeScore(0.5, 'CUSTOM-DROP this line\nkeep this line');
      },
    };

    await new ComposeEvolution().run({
      schema: {
        baseline: makeSchema(['answer']),
        examples: makeExamples(3),
        execute: makeFakeRunner(),
        judge,
        populationSize: 1, generations: 1,
        evalSize: 2, anchorEvalSize: 2,
      },
      instructions: {
        baseline: 'baseline prompt text is long enough',
        examples: makeExamples(3),
        judge,
        mutate: async () => 'new prompt text that is long enough',
        allowBareJudge: true,
        populationSize: 1, generations: 1,
        microScreenSize: 2, miniEvalSize: 2, anchorEvalSize: 2,
      },
      feedbackFilter: customFilter,
    });

    expect(filterCalls).toBeGreaterThan(0);
  });

  it('returns a stable shape when aborted before instruction stage', async () => {
    const ctrl = new AbortController();
    let progressCount = 0;

    const result = await new ComposeEvolution().run({
      schema: {
        baseline: makeSchema(['answer']),
        examples: makeExamples(3),
        execute: async () => {
          // Abort during the schema stage
          if (progressCount === 1) ctrl.abort();
          progressCount++;
          return { actual: '', parsed: false };
        },
        judge: { async score() { return makeJudgeScore(0.2, 'ok'); } },
        populationSize: 1, generations: 1,
        evalSize: 3, anchorEvalSize: 3,
      },
      instructions: {
        baseline: 'baseline prompt',
        examples: makeExamples(3),
        judge: { async score() { return makeJudgeScore(0.2, 'ok'); } },
        mutate: async () => 'should not run',
        allowBareJudge: true,
        populationSize: 1, generations: 1,
        microScreenSize: 2, miniEvalSize: 2, anchorEvalSize: 2,
      },
      signal: ctrl.signal,
    });

    expect(result.schema).toBeDefined();
    expect(result.instructions).toBeDefined();
    expect(result.instructions.winner.prompt).toBe('baseline prompt');
  });

  it('combinedDelta is a number; frozenSchema matches ES winner', async () => {
    const judge = {
      async score(args: { input: string; expected: string; actual: string }): Promise<JudgeScore> {
        return makeJudgeScore(Math.min(1, args.actual.length / 50), 'ok');
      },
    };

    const result = await new ComposeEvolution().run({
      schema: {
        baseline: makeSchema(['answer']),
        examples: makeExamples(8),
        execute: makeFakeRunner(),
        judge,
        populationSize: 2, generations: 1,
        evalSize: 4, anchorEvalSize: 4,
      },
      instructions: {
        baseline: 'short',
        examples: makeExamples(8),
        judge,
        mutate: async ({ parent }) => `${parent.prompt} more tokens here`,
        allowBareJudge: true,
        populationSize: 2, generations: 2,
        microScreenSize: 3, miniEvalSize: 3, anchorEvalSize: 6,
      },
    });

    expect(result.instructions.winner.score).not.toBeNull();
    expect(result.frozenSchema).toBe(result.schema.winner.schema);
    expect(typeof result.combinedDelta).toBe('number');
  });
});
