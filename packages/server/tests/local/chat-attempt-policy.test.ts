import { describe, expect, it } from 'vitest';
import {
  emptyModelResponseError,
  isTerminalAttemptError,
  planInterruptedRetry,
  type InterruptedRetryInput,
} from '../../src/local/routes/chat-attempt-policy.js';

function interruption(inputTokens: number, outputTokens: number): Error {
  return Object.assign(
    new Error('Model stream ended early (stream ended before data: [DONE]); partial content was not accepted.'),
    { code: 'INCOMPLETE_COMPLETION', usage: { inputTokens, outputTokens } },
  );
}

const REPLAYABLE: InterruptedRetryInput = {
  error: interruption(30, 10),
  maxTokenBudget: 1_000,
  modelOperationTimeoutMs: 100_000,
  elapsedMs: 40_000.6,
  offersTools: false,
  budgetModelSelected: false,
  replayBlocked: false,
  explicitToolWasUsed: false,
};

describe('planInterruptedRetry', () => {
  it('hands the replay what the failed attempt did not use', () => {
    expect(planInterruptedRetry(REPLAYABLE)).toEqual({ maxTokenBudget: 960, modelOperationTimeoutMs: 59_999 });
  });

  it.each([
    ['a failure that is not a stream interruption', { error: Object.assign(new Error('Model stream ended early.'), { code: 'INCOMPLETE_COMPLETION' }) }],
    ['a turn that offers tools', { offersTools: true }],
    ['the budget model', { budgetModelSelected: true }],
    ['a turn whose replay is blocked', { replayBlocked: true }],
    ['a turn that used its explicit tool', { explicitToolWasUsed: true }],
    ['a spent token budget', { error: interruption(600, 400) }],
    ['no token budget', { maxTokenBudget: undefined }],
    ['a spent model time limit', { elapsedMs: 100_000 }],
    ['no model time limit', { modelOperationTimeoutMs: undefined }],
  ] as const)('refuses %s', (_name, change) => {
    expect(planInterruptedRetry({ ...REPLAYABLE, ...change })).toBeNull();
  });
});

describe('isTerminalAttemptError', () => {
  it('ends the turn on an incomplete completion, an empty answer after a tool, and a budget refusal', () => {
    expect(isTerminalAttemptError(interruption(1, 1))).toBe(true);
    expect(isTerminalAttemptError(emptyModelResponseError({
      content: '', toolsUsed: ['search_memory'], usage: { inputTokens: 1, outputTokens: 1 },
    }))).toBe(true);
    expect(isTerminalAttemptError({ code: 'DAILY_MODEL_BUDGET_EXCEEDED' })).toBe(true);
    expect(isTerminalAttemptError({ code: 'DAILY_MODEL_BUDGET_PRICING_UNAVAILABLE' })).toBe(true);
  });

  it('leaves an empty answer with no tool, and ordinary failures, to rotation and fallback', () => {
    expect(isTerminalAttemptError(emptyModelResponseError({
      content: '', toolsUsed: [], usage: { inputTokens: 1, outputTokens: 1 },
    }))).toBe(false);
    expect(isTerminalAttemptError(Object.assign(new Error('Rate limit exceeded'), { status: 429 }))).toBe(false);
    expect(isTerminalAttemptError(null)).toBe(false);
  });
});
