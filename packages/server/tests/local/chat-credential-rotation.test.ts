import { describe, expect, it } from 'vitest';
import { rotateCredentials, type CredentialRotationPool } from '../../src/local/routes/chat-credential-rotation.js';
import { emptyModelResponseError } from '../../src/local/routes/chat-attempt-policy.js';

const statusError = (status: number) => Object.assign(new Error(`status ${status}`), { status, statusCode: status });

/** A pool of `keys`, handed out in order; a key reported failed stays failed. */
function fakePool(keys: string[]) {
  const failed = new Set<string>();
  const succeeded: string[] = [];
  const pool: CredentialRotationPool = {
    get size() { return keys.length; },
    getNameForKey: (key: string) => `name-${key}`,
    reportError: (key: string) => { failed.add(key); return keys.some(k => !failed.has(k)); },
    getKey: () => keys.find(k => !failed.has(k)) ?? null,
    reportSuccess: (key: string) => { succeeded.push(key); },
  };
  return { pool, failed, succeeded };
}

function input(pool: CredentialRotationPool, runWithKey: (key: string) => Promise<string>, overrides: Record<string, unknown> = {}) {
  const warnings: string[] = [];
  let rotations = 0;
  return {
    warnings,
    rotations: () => rotations,
    value: {
      pool,
      failedKey: 'k1',
      error: statusError(429),
      runWithKey,
      isAborted: () => false,
      isReplayBlocked: () => false,
      onRotate: () => { rotations += 1; },
      warn: (message: string) => { warnings.push(message); },
      ...overrides,
    },
  };
}

describe('rotateCredentials', () => {
  it('replays with the next key and reports it successful', async () => {
    const { pool, succeeded } = fakePool(['k1', 'k2']);
    const run = input(pool, async key => `answer with ${key}`);
    const outcome = await rotateCredentials(run.value);
    expect(outcome).toMatchObject({ result: 'answer with k2', poolExhausted: false });
    expect(succeeded).toEqual(['k2']);
    expect(run.rotations()).toBe(1);
    expect(run.warnings[0]).toContain('[credential-pool] Key name-k1 failed (429)');
  });

  it('reports the pool exhausted when every key fails', async () => {
    const { pool } = fakePool(['k1', 'k2']);
    const last = statusError(401);
    const outcome = await rotateCredentials(input(pool, async () => { throw last; }).value);
    expect(outcome).toEqual({ result: null, error: last, poolExhausted: true });
  });

  it('stops without rotating when the error carries no status', async () => {
    const { pool } = fakePool(['k1', 'k2']);
    const plain = new Error('network down');
    const run = input(pool, async () => 'unused', { error: plain });
    expect(await rotateCredentials(run.value)).toEqual({ result: null, error: plain, poolExhausted: false });
    expect(run.rotations()).toBe(0);
  });

  it('hands an empty answer on to the caller instead of rotating again', async () => {
    const { pool } = fakePool(['k1', 'k2', 'k3']);
    const empty = emptyModelResponseError({ content: '', toolsUsed: [], usage: { inputTokens: 0, outputTokens: 0 } });
    const run = input(pool, async () => { throw empty; });
    expect(await rotateCredentials(run.value)).toEqual({ result: null, error: empty, poolExhausted: false });
    expect(run.rotations()).toBe(1);
  });

  it('throws a replay failure when the turn was aborted or the replay is blocked', async () => {
    const failure = statusError(429);
    await expect(rotateCredentials(
      input(fakePool(['k1', 'k2']).pool, async () => { throw failure; }, { isAborted: () => true }).value,
    )).rejects.toBe(failure);
    await expect(rotateCredentials(
      input(fakePool(['k1', 'k2']).pool, async () => { throw failure; }, { isReplayBlocked: () => true }).value,
    )).rejects.toBe(failure);
  });

  it('throws an incomplete completion from a replay', async () => {
    const incomplete = Object.assign(new Error('cut'), { code: 'INCOMPLETE_COMPLETION' });
    await expect(rotateCredentials(
      input(fakePool(['k1', 'k2']).pool, async () => { throw incomplete; }).value,
    )).rejects.toBe(incomplete);
  });
});
