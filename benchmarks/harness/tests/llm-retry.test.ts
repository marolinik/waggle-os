/**
 * Task 2.5 Stage 1.5 §7.1 — fetch-retry on TypeError tests.
 *
 * Exercises the retry branch in LiteLlmClient.call. Uses vi.stubGlobal to
 * inject a fake fetch that returns a programmable sequence of responses or
 * throws controllable error classes. 1-second wait between retries is
 * accepted as per-test wall-clock cost; only 2-3 retry-path tests pay it.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLlmClient } from '../src/llm.js';
import type { ModelSpec } from '../src/types.js';

const MODEL: ModelSpec = {
  id: 'test-model',
  displayName: 'Test',
  provider: 'alibaba',
  litellmModel: 'test/model',
  pricePerMillionInput: 0.1,
  pricePerMillionOutput: 0.5,
  contextWindow: 16_000,
};

function buildInput() {
  return {
    model: MODEL,
    systemPrompt: 'sys',
    userPrompt: 'hello',
  };
}

/** Mock that returns a JSON-body successful response. */
function mockSuccess(content = 'ok', usage?: { prompt_tokens: number; completion_tokens: number }): Response {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content } }],
      usage: usage ?? { prompt_tokens: 10, completion_tokens: 2 },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

/** Mock an HTTP error response. */
function mockHttpError(status: number): Response {
  return new Response('', { status });
}

function throwTypeError(): never {
  const e = new Error('fetch failed');
  e.name = 'TypeError';
  throw e;
}

function throwAbortError(): never {
  const e = new Error('aborted');
  e.name = 'AbortError';
  throw e;
}

function throwRangeError(): never {
  const e = new Error('range issue');
  e.name = 'RangeError';
  throw e;
}

let fetchCallCount = 0;

beforeEach(() => {
  fetchCallCount = 0;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('LiteLlmClient — §7.1 fetch-retry on TypeError', () => {
  it('succeeds on first attempt with no retries (fast path)', async () => {
    vi.stubGlobal('fetch', async () => {
      fetchCallCount++;
      return mockSuccess('hello-response');
    });
    const client = createLlmClient({
      dryRun: false,
      litellmUrl: 'http://mock',
      litellmApiKey: 'sk-test',
    });
    const r = await client.call(buildInput());
    expect(fetchCallCount).toBe(1);
    expect(r.failureMode).toBeNull();
    expect(r.text).toBe('hello-response');
  });

  it('retries once on TypeError and succeeds on the second attempt', async () => {
    vi.stubGlobal('fetch', async () => {
      fetchCallCount++;
      if (fetchCallCount === 1) throwTypeError();
      return mockSuccess('recovered');
    });
    const client = createLlmClient({
      dryRun: false,
      litellmUrl: 'http://mock',
      litellmApiKey: 'sk-test',
    });
    const started = Date.now();
    const r = await client.call(buildInput());
    const elapsed = Date.now() - started;
    expect(fetchCallCount).toBe(2);
    expect(r.failureMode).toBeNull();
    expect(r.text).toBe('recovered');
    // 1s backoff should be observable in the total latency.
    expect(elapsed).toBeGreaterThanOrEqual(900);
    expect(r.latencyMs).toBeGreaterThanOrEqual(900);
  });

  it('gives up after two TypeError attempts and returns failureMode', async () => {
    vi.stubGlobal('fetch', async () => {
      fetchCallCount++;
      throwTypeError();
    });
    const client = createLlmClient({
      dryRun: false,
      litellmUrl: 'http://mock',
      litellmApiKey: 'sk-test',
    });
    const r = await client.call(buildInput());
    // 1 initial + 1 retry = 2 attempts total (FETCH_RETRY_MAX = 1).
    expect(fetchCallCount).toBe(2);
    expect(r.failureMode).toBe('fetch_error_TypeError');
    expect(r.text).toBe('');
  });

  it('does NOT retry on AbortError (timeout) — returns immediately', async () => {
    vi.stubGlobal('fetch', async () => {
      fetchCallCount++;
      throwAbortError();
    });
    const client = createLlmClient({
      dryRun: false,
      litellmUrl: 'http://mock',
      litellmApiKey: 'sk-test',
    });
    const r = await client.call(buildInput());
    expect(fetchCallCount).toBe(1);
    expect(r.failureMode).toBe('timeout');
  });

  it('does NOT retry on http_5xx — returns immediately', async () => {
    vi.stubGlobal('fetch', async () => {
      fetchCallCount++;
      return mockHttpError(502);
    });
    const client = createLlmClient({
      dryRun: false,
      litellmUrl: 'http://mock',
      litellmApiKey: 'sk-test',
    });
    const r = await client.call(buildInput());
    expect(fetchCallCount).toBe(1);
    expect(r.failureMode).toBe('http_502');
  });

  it('does NOT retry on non-TypeError JS errors — returns immediately', async () => {
    vi.stubGlobal('fetch', async () => {
      fetchCallCount++;
      throwRangeError();
    });
    const client = createLlmClient({
      dryRun: false,
      litellmUrl: 'http://mock',
      litellmApiKey: 'sk-test',
    });
    const r = await client.call(buildInput());
    expect(fetchCallCount).toBe(1);
    expect(r.failureMode).toBe('fetch_error_RangeError');
  });

  it('latencyMs on successful retry reflects total wall-clock (including backoff)', async () => {
    vi.stubGlobal('fetch', async () => {
      fetchCallCount++;
      if (fetchCallCount === 1) throwTypeError();
      return mockSuccess('ok');
    });
    const client = createLlmClient({
      dryRun: false,
      litellmUrl: 'http://mock',
      litellmApiKey: 'sk-test',
    });
    const r = await client.call(buildInput());
    // Total latency must include the 1000 ms backoff, NOT just the second
    // attempt's round-trip. Otherwise budget accounting underestimates.
    expect(r.latencyMs).toBeGreaterThanOrEqual(900);
  });

  it('DryRunClient path is unaffected by retry logic', async () => {
    // Dry-run never touches fetch; retry loop shouldn't run.
    vi.stubGlobal('fetch', async () => {
      fetchCallCount++;
      throwTypeError();
    });
    const client = createLlmClient({
      dryRun: true,
      litellmUrl: 'http://mock',
      litellmApiKey: 'sk-test',
    });
    const r = await client.call(buildInput());
    expect(fetchCallCount).toBe(0);
    expect(r.failureMode).toBeNull();
    expect(r.text.startsWith('DRY_RUN:')).toBe(true);
  });
});
