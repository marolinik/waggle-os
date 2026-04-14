import { describe, it, expect, vi } from 'vitest';
import {
  buildJudgeLLMCall,
  buildGEPAMutateFn,
  buildSchemaExecuteFn,
  makeRunningJudge,
  buildReflectiveMutationPrompt,
  buildSchemaFillPrompt,
  type EvolutionLLM,
} from '../src/evolution-llm-wiring.js';
import type { MutateArgs, GEPACandidate } from '../src/index.js';
import type { Schema } from '../src/evolve-schema.js';
import type { JudgeInput } from '../src/judge.js';

// ── Fixtures ──────────────────────────────────────────────────────

function makeMockLLM(handler: (prompt: string) => string | Promise<string>): {
  llm: EvolutionLLM;
  calls: string[];
} {
  const calls: string[] = [];
  return {
    calls,
    llm: {
      async complete(prompt: string) {
        calls.push(prompt);
        return await handler(prompt);
      },
    },
  };
}

function makeCandidate(overrides: Partial<GEPACandidate> = {}): GEPACandidate {
  return {
    id: 'g1-m0',
    prompt: 'You are a tester. Respond with the exact expected word.',
    generation: 1,
    parent: 'g0-baseline',
    strategy: 'expand-edge-cases',
    score: null,
    perExample: [],
    ...overrides,
  };
}

function makeSchema(overrides: Partial<Schema> = {}): Schema {
  return {
    name: 'answer',
    version: 1,
    fields: [
      { name: 'reasoning', type: 'string', description: 'step-by-step thinking', required: true, constraints: [] },
      { name: 'answer', type: 'string', description: 'the final answer', required: true, constraints: [] },
    ],
    ...overrides,
  };
}

// ── buildJudgeLLMCall ─────────────────────────────────────────────

describe('buildJudgeLLMCall', () => {
  it('forwards the prompt unchanged and returns the raw completion', async () => {
    const { llm, calls } = makeMockLLM(() => '{"correctness":8,"procedure":7,"conciseness":6,"feedback":"ok"}');
    const judgeCall = buildJudgeLLMCall(llm);

    const result = await judgeCall('SCORE THIS: foo');

    expect(calls).toEqual(['SCORE THIS: foo']);
    expect(result).toContain('correctness');
  });

  it('propagates errors from the underlying LLM', async () => {
    const llm: EvolutionLLM = {
      async complete() { throw new Error('network down'); },
    };
    const judgeCall = buildJudgeLLMCall(llm);

    await expect(judgeCall('anything')).rejects.toThrow('network down');
  });
});

// ── buildGEPAMutateFn ─────────────────────────────────────────────

describe('buildGEPAMutateFn', () => {
  const mutateArgs: MutateArgs = {
    parent: makeCandidate(),
    strategy: 'expand-edge-cases',
    weaknessFeedback: [
      'Fails to handle empty input',
      'Sometimes forgets to include the final answer',
    ],
    targetKind: 'persona-system-prompt',
    generation: 2,
  };

  it('builds a reflective mutation prompt that includes parent + strategy + feedback', async () => {
    const { llm, calls } = makeMockLLM(() => 'EVOLVED SYSTEM PROMPT');
    const mutate = buildGEPAMutateFn(llm);

    const result = await mutate(mutateArgs);

    expect(result).toBe('EVOLVED SYSTEM PROMPT');
    expect(calls).toHaveLength(1);
    const prompt = calls[0];
    expect(prompt).toContain(mutateArgs.parent.prompt);
    expect(prompt).toContain(mutateArgs.strategy);
    expect(prompt).toContain('Fails to handle empty input');
    expect(prompt).toContain('persona-system-prompt');
  });

  it('falls back to the parent prompt when the LLM returns empty or whitespace', async () => {
    const { llm } = makeMockLLM(() => '   \n  ');
    const mutate = buildGEPAMutateFn(llm);

    const result = await mutate(mutateArgs);

    expect(result).toBe(mutateArgs.parent.prompt);
  });

  it('falls back to the parent prompt when the LLM throws', async () => {
    const llm: EvolutionLLM = {
      async complete() { throw new Error('boom'); },
    };
    const mutate = buildGEPAMutateFn(llm);

    const result = await mutate(mutateArgs);

    expect(result).toBe(mutateArgs.parent.prompt);
  });

  it('strips markdown code fences from the LLM response', async () => {
    const { llm } = makeMockLLM(() => '```\nHIDDEN PROMPT\n```');
    const mutate = buildGEPAMutateFn(llm);

    const result = await mutate(mutateArgs);

    expect(result.trim()).toBe('HIDDEN PROMPT');
  });
});

describe('buildReflectiveMutationPrompt', () => {
  it('includes the generation number and weakness bullets', () => {
    const prompt = buildReflectiveMutationPrompt({
      parent: 'PARENT',
      strategy: 'tighten-format',
      weaknessFeedback: ['a', 'b'],
      targetKind: 'behavioral-spec-section',
      generation: 3,
    });

    expect(prompt).toContain('generation 3');
    expect(prompt).toContain('- a');
    expect(prompt).toContain('- b');
    expect(prompt).toContain('tighten-format');
    expect(prompt).toContain('PARENT');
  });

  it('handles missing weakness feedback gracefully', () => {
    const prompt = buildReflectiveMutationPrompt({
      parent: 'PARENT',
      strategy: 'add-examples',
      weaknessFeedback: [],
      targetKind: 'generic',
      generation: 0,
    });

    expect(prompt).toContain('PARENT');
    expect(prompt).toContain('(no specific weakness signals yet)');
  });
});

// ── buildSchemaExecuteFn ──────────────────────────────────────────

describe('buildSchemaExecuteFn', () => {
  it('returns parsed=true when LLM returns valid JSON matching schema shape', async () => {
    const { llm, calls } = makeMockLLM(() => '{"reasoning":"thought","answer":"42"}');
    const execute = buildSchemaExecuteFn(llm);

    const result = await execute({ schema: makeSchema(), input: 'What is the answer?' });

    expect(result.parsed).toBe(true);
    expect(result.actual).toBe('{"reasoning":"thought","answer":"42"}');
    expect(calls[0]).toContain('What is the answer?');
    expect(calls[0]).toContain('"reasoning"');
    expect(calls[0]).toContain('"answer"');
  });

  it('returns parsed=false when LLM returns non-JSON', async () => {
    const { llm } = makeMockLLM(() => 'just some text');
    const execute = buildSchemaExecuteFn(llm);

    const result = await execute({ schema: makeSchema(), input: 'hi' });

    expect(result.parsed).toBe(false);
    expect(result.actual).toBe('just some text');
  });

  it('extracts JSON from markdown fences', async () => {
    const { llm } = makeMockLLM(() => '```json\n{"reasoning":"x","answer":"y"}\n```');
    const execute = buildSchemaExecuteFn(llm);

    const result = await execute({ schema: makeSchema(), input: 'hi' });

    expect(result.parsed).toBe(true);
    expect(result.actual).toContain('"reasoning"');
  });

  it('returns parsed=false and empty actual when LLM throws', async () => {
    const llm: EvolutionLLM = {
      async complete() { throw new Error('boom'); },
    };
    const execute = buildSchemaExecuteFn(llm);

    const result = await execute({ schema: makeSchema(), input: 'hi' });

    expect(result.parsed).toBe(false);
    expect(result.actual).toBe('');
  });
});

describe('buildSchemaFillPrompt', () => {
  it('serializes each field with name + type + description', () => {
    const prompt = buildSchemaFillPrompt({
      schema: makeSchema(),
      input: 'What is 2+2?',
    });

    expect(prompt).toContain('"reasoning"');
    expect(prompt).toContain('"answer"');
    expect(prompt).toContain('step-by-step thinking');
    expect(prompt).toContain('the final answer');
    expect(prompt).toContain('What is 2+2?');
  });

  it('notes required constraints', () => {
    const schema: Schema = {
      name: 'x', version: 1,
      fields: [
        {
          name: 'score',
          type: 'number',
          description: 'a rating',
          required: true,
          constraints: [{ kind: 'range', value: '0-10' }],
        },
      ],
    };
    const prompt = buildSchemaFillPrompt({ schema, input: 'rate this' });
    expect(prompt).toContain('score');
    expect(prompt).toContain('number');
    expect(prompt).toContain('range');
  });
});

// ── makeRunningJudge ──────────────────────────────────────────────

describe('makeRunningJudge', () => {
  it('executes the candidate prompt with the example input, then delegates to the base judge', async () => {
    const { llm, calls } = makeMockLLM((prompt) => {
      // Simulate running the candidate prompt and returning a model response.
      return `MODEL OUTPUT for: ${prompt}`;
    });

    const baseScore = vi.fn(async (args: JudgeInput) => ({
      overall: 0.8, weighted: 0.8,
      correctness: 0.8, procedureFollowing: 0.8, conciseness: 0.8,
      lengthPenalty: 1, feedback: 'passed through', parsed: true,
    }));
    const baseJudge = { score: baseScore };

    const runningJudge = makeRunningJudge(baseJudge, llm);

    const result = await runningJudge.score({
      input: 'What is love?',
      expected: 'baby don\'t hurt me',
      actual: 'SYSTEM: You are a haiku writer.', // this is the candidate prompt when called by GEPA
    });

    // Model was asked to run the candidate prompt against the example input.
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('SYSTEM: You are a haiku writer.');
    expect(calls[0]).toContain('What is love?');

    // The base judge received the LLM's OUTPUT as `actual`, not the candidate prompt.
    expect(baseScore).toHaveBeenCalledTimes(1);
    const passedArgs = baseScore.mock.calls[0][0];
    expect(passedArgs.input).toBe('What is love?');
    expect(passedArgs.expected).toBe('baby don\'t hurt me');
    expect(passedArgs.actual).toContain('MODEL OUTPUT for:');

    expect(result.overall).toBe(0.8);
  });

  it('surfaces a zero-score when the underlying LLM throws (graceful degradation)', async () => {
    const llm: EvolutionLLM = {
      async complete() { throw new Error('rate limited'); },
    };
    const baseJudge = { score: vi.fn() };

    const runningJudge = makeRunningJudge(baseJudge, llm);

    const result = await runningJudge.score({
      input: 'any', expected: 'any', actual: 'prompt',
    });

    expect(result.overall).toBe(0);
    expect(result.parsed).toBe(false);
    expect(result.feedback).toMatch(/execution failed/i);
    expect(baseJudge.score).not.toHaveBeenCalled();
  });

  it('passes context through to the base judge', async () => {
    const { llm } = makeMockLLM(() => 'EXECUTED');
    const baseScore = vi.fn(async () => ({
      overall: 0.5, weighted: 0.5,
      correctness: 0.5, procedureFollowing: 0.5, conciseness: 0.5,
      lengthPenalty: 1, feedback: '', parsed: true,
    }));

    const runningJudge = makeRunningJudge({ score: baseScore }, llm);

    await runningJudge.score({
      input: 'q', expected: 'a', actual: 'prompt',
      context: 'persona:coder',
    });

    expect(baseScore.mock.calls[0][0].context).toBe('persona:coder');
  });
});
