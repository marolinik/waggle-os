/**
 * Task 2.5 Stage 1.5 §7.3 — preCellHealthCheck tests.
 *
 * Injects a stub fetchFn that returns a programmable sequence of Response /
 * error so we can verify the liveness + model-ping matrix behaves correctly
 * without a live LiteLLM proxy.
 */

import { describe, expect, it } from 'vitest';
import { preCellHealthCheck } from '../src/health-check.js';

const OK_JSON = JSON.stringify({
  choices: [{ message: { content: 'pong' } }],
  usage: { prompt_tokens: 3, completion_tokens: 1 },
});

function okResponse(body = OK_JSON): Response {
  return new Response(body, { status: 200, headers: { 'Content-Type': 'application/json' } });
}

function errorResponse(status: number): Response {
  return new Response('', { status });
}

function seqFetch(responses: Array<Response | Error>): {
  fn: typeof globalThis.fetch;
  calls: Array<{ url: string; method: string }>;
} {
  const calls: Array<{ url: string; method: string }> = [];
  let idx = 0;
  const fn: typeof globalThis.fetch = async (url, init) => {
    calls.push({
      url: typeof url === 'string' ? url : String(url),
      method: (init?.method ?? 'GET').toUpperCase(),
    });
    const step = responses[idx++] ?? new Error('unexpected call');
    if (step instanceof Error) throw step;
    return step;
  };
  return { fn, calls };
}

const BASE_OPTS = {
  litellmUrl: 'http://localhost:4000',
  litellmApiKey: 'sk-test',
  subjectModel: 'qwen3.6-35b-a3b-via-dashscope-direct',
  judgeModels: ['claude-opus-4-7', 'gpt-5.4', 'gemini-3.1-pro-preview'],
};

describe('preCellHealthCheck — happy path', () => {
  it('returns ok when every probe succeeds', async () => {
    const { fn, calls } = seqFetch([
      okResponse(),               // /health/liveliness
      okResponse(),               // subject ping
      okResponse(),               // judge 1 ping
      okResponse(),               // judge 2 ping
      okResponse(),               // judge 3 ping
    ]);
    const r = await preCellHealthCheck({ ...BASE_OPTS, fetchFn: fn });
    expect(r.ok).toBe(true);
    expect(r.failures).toEqual([]);
    // 1 liveness + 4 model probes.
    expect(calls).toHaveLength(5);
    expect(calls[0].url).toContain('/health/liveliness');
    expect(calls[0].method).toBe('GET');
    expect(calls[1].url).toContain('/v1/chat/completions');
    expect(calls[1].method).toBe('POST');
  });

  it('skips liveness probe when includeLivenessProbe=false', async () => {
    const { fn, calls } = seqFetch([
      okResponse(), // subject
      okResponse(), // judge 1
      okResponse(), // judge 2
      okResponse(), // judge 3
    ]);
    const r = await preCellHealthCheck({
      ...BASE_OPTS,
      fetchFn: fn,
      includeLivenessProbe: false,
    });
    expect(r.ok).toBe(true);
    expect(calls).toHaveLength(4);
    expect(calls.every(c => c.url.includes('/v1/chat/completions'))).toBe(true);
  });

  it('works with subject only and no judges', async () => {
    const { fn, calls } = seqFetch([
      okResponse(), // liveness
      okResponse(), // subject
    ]);
    const r = await preCellHealthCheck({
      litellmUrl: 'http://localhost:4000',
      litellmApiKey: 'sk-test',
      subjectModel: 'qwen3.6-35b-a3b',
      fetchFn: fn,
    });
    expect(r.ok).toBe(true);
    expect(calls).toHaveLength(2);
  });
});

describe('preCellHealthCheck — failure paths', () => {
  it('flags liveness 5xx', async () => {
    const { fn } = seqFetch([
      errorResponse(503),         // liveness fails
      okResponse(),
      okResponse(),
      okResponse(),
      okResponse(),
    ]);
    const r = await preCellHealthCheck({ ...BASE_OPTS, fetchFn: fn });
    expect(r.ok).toBe(false);
    expect(r.failures).toHaveLength(1);
    expect(r.failures[0].endpoint).toContain('/health/liveliness');
    expect(r.failures[0].error).toBe('http_503');
  });

  it('flags subject model 5xx', async () => {
    const { fn } = seqFetch([
      okResponse(),               // liveness
      errorResponse(500),         // subject fails
      okResponse(),
      okResponse(),
      okResponse(),
    ]);
    const r = await preCellHealthCheck({ ...BASE_OPTS, fetchFn: fn });
    expect(r.ok).toBe(false);
    expect(r.failures).toHaveLength(1);
    expect(r.failures[0].endpoint).toContain('qwen3.6-35b-a3b-via-dashscope-direct');
    expect(r.failures[0].error).toBe('http_500');
  });

  it('flags judge model 5xx', async () => {
    const { fn } = seqFetch([
      okResponse(),               // liveness
      okResponse(),               // subject
      okResponse(),               // judge 1
      errorResponse(502),         // judge 2 fails
      okResponse(),               // judge 3
    ]);
    const r = await preCellHealthCheck({ ...BASE_OPTS, fetchFn: fn });
    expect(r.ok).toBe(false);
    expect(r.failures).toHaveLength(1);
    expect(r.failures[0].endpoint).toContain('gpt-5.4');
    expect(r.failures[0].error).toBe('http_502');
  });

  it('flags network/TypeError on any probe', async () => {
    const err = new Error('fetch failed');
    err.name = 'TypeError';
    const { fn } = seqFetch([
      okResponse(),               // liveness
      err,                        // subject throws
      okResponse(),
      okResponse(),
      okResponse(),
    ]);
    const r = await preCellHealthCheck({ ...BASE_OPTS, fetchFn: fn });
    expect(r.ok).toBe(false);
    expect(r.failures).toHaveLength(1);
    expect(r.failures[0].error).toBe('fetch_error_TypeError');
  });

  it('accumulates multiple failures across probes', async () => {
    const { fn } = seqFetch([
      errorResponse(503),         // liveness fails
      errorResponse(500),         // subject fails
      okResponse(),
      errorResponse(502),         // judge 2 fails
      okResponse(),
    ]);
    const r = await preCellHealthCheck({ ...BASE_OPTS, fetchFn: fn });
    expect(r.ok).toBe(false);
    expect(r.failures).toHaveLength(3);
  });

  it('returns probedAt ISO + positive durationMs', async () => {
    const { fn } = seqFetch([
      okResponse(), okResponse(), okResponse(), okResponse(), okResponse(),
    ]);
    const r = await preCellHealthCheck({ ...BASE_OPTS, fetchFn: fn });
    expect(new Date(r.probedAt).toString()).not.toBe('Invalid Date');
    expect(r.durationMs).toBeGreaterThanOrEqual(0);
  });
});
