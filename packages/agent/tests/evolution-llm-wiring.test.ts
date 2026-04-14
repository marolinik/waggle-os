import { describe, it, expect, vi } from 'vitest';
import {
  buildJudgeLLMCall,
  buildGEPAMutateFn,
  buildSchemaExecuteFn,
  makeRunningJudge,
  buildReflectiveMutationPrompt,
  buildSchemaFillPrompt,
  retryWithBackoff,
  wrapWithRetry,
  isRetryableEvolutionError,
  computeRetryDelay,
  DEFAULT_RETRY_OPTIONS,
  type EvolutionLLM,
  type RetryOptions,
  type RetryInfo,
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

// ── isRetryableEvolutionError ─────────────────────────────────────

describe('isRetryableEvolutionError', () => {
  it('returns true for retryable HTTP statuses (429/502/503/504/529/500/408/425)', () => {
    for (const status of [408, 425, 429, 500, 502, 503, 504, 529]) {
      expect(isRetryableEvolutionError({ status })).toBe(true);
      expect(isRetryableEvolutionError({ statusCode: status })).toBe(true);
    }
  });

  it('returns false for non-retryable HTTP statuses', () => {
    for (const status of [400, 401, 403, 404, 422]) {
      expect(isRetryableEvolutionError({ status })).toBe(false);
    }
  });

  it('returns true for transient network error codes', () => {
    for (const code of ['ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN']) {
      expect(isRetryableEvolutionError({ code })).toBe(true);
    }
  });

  it('returns true for rate-limit / overloaded / timeout message patterns', () => {
    const patterns = [
      new Error('Rate limit exceeded'),
      new Error('Too many requests, slow down'),
      new Error('Anthropic: server overloaded — retry shortly'),
      new Error('connection reset by peer'),
      new Error('fetch failed'),
      new Error('socket hang up'),
      new Error('HTTP 429: rate limited'),
      new Error('HTTP 503 Service Unavailable'),
    ];
    for (const err of patterns) {
      expect(isRetryableEvolutionError(err)).toBe(true);
    }
  });

  it('returns false for null, undefined, and empty errors', () => {
    expect(isRetryableEvolutionError(null)).toBe(false);
    expect(isRetryableEvolutionError(undefined)).toBe(false);
    expect(isRetryableEvolutionError({})).toBe(false);
    expect(isRetryableEvolutionError(new Error(''))).toBe(false);
  });

  it('returns false for deterministic logic errors', () => {
    expect(isRetryableEvolutionError(new Error('Invalid input schema'))).toBe(false);
    expect(isRetryableEvolutionError(new Error('Permission denied'))).toBe(false);
    expect(isRetryableEvolutionError(new Error('Not found'))).toBe(false);
  });
});

// ── computeRetryDelay ─────────────────────────────────────────────

describe('computeRetryDelay', () => {
  it('produces the 5s → 15s → 45s → 135s → 150s (capped) schedule with zero jitter', () => {
    const opts: RetryOptions = { jitterMs: 0 };
    expect(computeRetryDelay(1, opts)).toBe(5_000);
    expect(computeRetryDelay(2, opts)).toBe(15_000);
    expect(computeRetryDelay(3, opts)).toBe(45_000);
    expect(computeRetryDelay(4, opts)).toBe(135_000);
    expect(computeRetryDelay(5, opts)).toBe(150_000);
    expect(computeRetryDelay(6, opts)).toBe(150_000);
  });

  it('clamps attempt < 1 to attempt 1', () => {
    expect(computeRetryDelay(0, { jitterMs: 0 })).toBe(5_000);
    expect(computeRetryDelay(-5, { jitterMs: 0 })).toBe(5_000);
  });

  it('applies jitter within [0, jitterMs)', () => {
    // Stub Math.random to isolate jitter behavior.
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    try {
      expect(computeRetryDelay(1, { jitterMs: 2_000 })).toBe(5_000 + 1_000);
    } finally {
      spy.mockRestore();
    }
  });

  it('honors custom baseMs / capMs / factor', () => {
    const opts: RetryOptions = { baseMs: 100, capMs: 1_000, factor: 2, jitterMs: 0 };
    expect(computeRetryDelay(1, opts)).toBe(100);
    expect(computeRetryDelay(2, opts)).toBe(200);
    expect(computeRetryDelay(3, opts)).toBe(400);
    expect(computeRetryDelay(4, opts)).toBe(800);
    // Cap engages at attempt 5: 1600 → 1000.
    expect(computeRetryDelay(5, opts)).toBe(1_000);
  });
});

// ── retryWithBackoff ──────────────────────────────────────────────

describe('retryWithBackoff', () => {
  /** Instant sleep — tests run in ~microseconds. */
  const noSleep = async (): Promise<void> => { /* noop */ };

  it('returns the first-try result without retry', async () => {
    const op = vi.fn(async () => 'ok');
    const result = await retryWithBackoff(op, { sleep: noSleep });
    expect(result).toBe('ok');
    expect(op).toHaveBeenCalledTimes(1);
  });

  it('retries on retryable errors and eventually succeeds', async () => {
    let callCount = 0;
    const op = vi.fn(async () => {
      callCount++;
      if (callCount < 3) {
        const err = Object.assign(new Error('rate limit'), { status: 429 });
        throw err;
      }
      return 'recovered';
    });

    const sleeps: number[] = [];
    const result = await retryWithBackoff(op, {
      sleep: async (ms) => { sleeps.push(ms); },
      jitterMs: 0,
    });

    expect(result).toBe('recovered');
    expect(op).toHaveBeenCalledTimes(3);
    expect(sleeps).toEqual([5_000, 15_000]);
  });

  it('propagates non-retryable errors on first occurrence without retrying', async () => {
    const err = Object.assign(new Error('bad request'), { status: 400 });
    const op = vi.fn(async () => { throw err; });

    await expect(retryWithBackoff(op, { sleep: noSleep })).rejects.toBe(err);
    expect(op).toHaveBeenCalledTimes(1);
  });

  it('throws the last error after maxAttempts retryable failures', async () => {
    const err = Object.assign(new Error('always 503'), { status: 503 });
    const op = vi.fn(async () => { throw err; });

    await expect(
      retryWithBackoff(op, { sleep: noSleep, maxAttempts: 3 }),
    ).rejects.toBe(err);
    expect(op).toHaveBeenCalledTimes(3);
  });

  it('fires onRetry hook before each sleep with attempt + delay + error', async () => {
    let callCount = 0;
    const op = vi.fn(async () => {
      callCount++;
      if (callCount < 3) {
        throw Object.assign(new Error('rl'), { status: 429 });
      }
      return 'ok';
    });

    const retries: RetryInfo[] = [];
    await retryWithBackoff(op, {
      sleep: noSleep,
      jitterMs: 0,
      onRetry: (info) => retries.push(info),
    });

    expect(retries).toHaveLength(2);
    expect(retries[0].attempt).toBe(1);
    expect(retries[0].delayMs).toBe(5_000);
    expect(retries[1].attempt).toBe(2);
    expect(retries[1].delayMs).toBe(15_000);
    expect(retries.every(r => r.error instanceof Error)).toBe(true);
  });

  it('honors a custom isRetryable predicate', async () => {
    const err = new Error('custom: transient');
    const op = vi.fn(async () => { throw err; });

    // Default predicate would reject this — but custom says "always retry then give up".
    await expect(retryWithBackoff(op, {
      sleep: noSleep,
      maxAttempts: 2,
      isRetryable: (e) => e === err,
    })).rejects.toBe(err);
    expect(op).toHaveBeenCalledTimes(2);
  });

  it('throws immediately when signal is pre-aborted', async () => {
    const controller = new AbortController();
    controller.abort(new Error('user cancelled'));
    const op = vi.fn(async () => 'never');

    await expect(retryWithBackoff(op, {
      sleep: noSleep,
      signal: controller.signal,
    })).rejects.toThrow(/user cancelled|aborted/i);
    expect(op).not.toHaveBeenCalled();
  });

  it('uses DEFAULT_RETRY_OPTIONS when nothing is supplied', async () => {
    // Smoke test: a successful op should return without touching defaults.
    const result = await retryWithBackoff(async () => 42);
    expect(result).toBe(42);
    expect(DEFAULT_RETRY_OPTIONS.maxAttempts).toBe(6);
    expect(DEFAULT_RETRY_OPTIONS.baseMs).toBe(5_000);
    expect(DEFAULT_RETRY_OPTIONS.capMs).toBe(150_000);
    expect(DEFAULT_RETRY_OPTIONS.factor).toBe(3);
  });

  it('provides the 1-based attempt number to the operation', async () => {
    const attempts: number[] = [];
    let n = 0;
    const op = vi.fn(async (attempt: number) => {
      attempts.push(attempt);
      n++;
      if (n < 3) throw Object.assign(new Error('rl'), { status: 429 });
      return 'done';
    });

    await retryWithBackoff(op, { sleep: noSleep });
    expect(attempts).toEqual([1, 2, 3]);
  });
});

// ── wrapWithRetry ─────────────────────────────────────────────────

describe('wrapWithRetry', () => {
  it('wraps an EvolutionLLM so complete() retries on retryable errors', async () => {
    let n = 0;
    const base: EvolutionLLM = {
      async complete() {
        n++;
        if (n < 3) throw Object.assign(new Error('429'), { status: 429 });
        return 'finally';
      },
    };
    const wrapped = wrapWithRetry(base, { sleep: async () => {}, jitterMs: 0 });

    const result = await wrapped.complete('anything');
    expect(result).toBe('finally');
    expect(n).toBe(3);
  });

  it('does not retry non-retryable errors', async () => {
    let n = 0;
    const err = Object.assign(new Error('bad auth'), { status: 401 });
    const base: EvolutionLLM = {
      async complete() { n++; throw err; },
    };
    const wrapped = wrapWithRetry(base, { sleep: async () => {} });

    await expect(wrapped.complete('x')).rejects.toBe(err);
    expect(n).toBe(1);
  });

  it('threads retry options through to each call (independent per complete)', async () => {
    const calls: number[] = [];
    const base: EvolutionLLM = {
      async complete(prompt: string) {
        calls.push(prompt.length);
        throw Object.assign(new Error('503'), { status: 503 });
      },
    };
    const wrapped = wrapWithRetry(base, {
      sleep: async () => {},
      maxAttempts: 2,
    });

    await expect(wrapped.complete('a')).rejects.toThrow();
    await expect(wrapped.complete('bb')).rejects.toThrow();

    // Two separate complete() calls, each retried maxAttempts=2 times.
    expect(calls).toEqual([1, 1, 2, 2]);
  });
});
