import { describe, it, expect, vi } from 'vitest';
import { runAgentLoop, type AgentLoopConfig } from '../src/agent-loop.js';
import {
  handleNetworkError,
  handleNonOkResponse,
  initialRetryState,
  type RetryState,
} from '../src/retry-policy.js';

/**
 * #2 (loop resilience): a network-level fetch rejection ("fetch failed" /
 * ECONNREFUSED / socket hang-up) — as opposed to an HTTP error status — used
 * to propagate uncaught and kill the whole turn. The agent loop now treats it
 * like a 5xx: retry with backoff, capped, then a clean fatal error. This is the
 * exact failure the LiteLLM container restart surfaced in testing.
 */

function okResponse(content: string): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    }),
  } as unknown as Response;
}

function baseConfig(overrides: Partial<AgentLoopConfig> = {}): AgentLoopConfig {
  return {
    litellmUrl: 'http://localhost:4000',
    litellmApiKey: 'test-key',
    model: 'gpt-4',
    systemPrompt: 'You are a helpful assistant.',
    tools: [],
    messages: [{ role: 'user', content: 'Hello' }],
    maxTurns: 3,
    ...overrides,
  };
}

describe('runAgentLoop — network-failure resilience (#2)', () => {
  it('retries a network-level fetch rejection instead of killing the turn', async () => {
    let calls = 0;
    const fetchFn = vi.fn(async () => {
      calls++;
      // First attempt: the endpoint is down/restarting — the fetch promise rejects.
      if (calls === 1) throw new TypeError('fetch failed');
      // Second attempt: back online.
      return okResponse('recovered');
    });

    const result = await runAgentLoop(baseConfig({ fetch: fetchFn as unknown as typeof fetch }));

    expect(calls).toBe(2); // retried past the network failure
    expect(result.content).toBe('recovered');
  }, 10_000); // one real backoff wait (~2s) — generous ceiling

  it('announces the retry before backoff without mixing status into answer tokens', async () => {
    vi.useFakeTimers();
    const retryNotices: string[] = [];
    const answerTokens: string[] = [];
    let calls = 0;
    const fetchFn = vi.fn(async () => {
      calls++;
      if (calls === 1) throw new TypeError('fetch failed');
      return okResponse('recovered answer');
    });
    const config = baseConfig({
      fetch: fetchFn as unknown as typeof fetch,
      onToken: token => answerTokens.push(token),
      onRetry: notice => retryNotices.push(notice),
    });

    try {
      const run = runAgentLoop(config);
      await vi.advanceTimersByTimeAsync(0);

      expect(calls).toBe(1);
      expect(retryNotices).toEqual([
        '\n[Connection to the model failed — retrying in 2s (retry 1/3)...]\n',
      ]);
      expect(answerTokens).toEqual([]);

      await vi.advanceTimersByTimeAsync(2_000);
      const result = await run;

      expect(result.content).toBe('recovered answer');
      expect(answerTokens).toEqual(['recovered answer']);
      expect(answerTokens.join('')).not.toContain('retrying');
    } finally {
      vi.useRealTimers();
    }
  });

  it('announces an HTTP 503 retry through the status callback', async () => {
    vi.useFakeTimers();
    const retryNotices: string[] = [];
    const answerTokens: string[] = [];
    let calls = 0;
    const fetchFn = vi.fn(async () => {
      calls++;
      if (calls === 1) {
        return new Response('temporary outage', { status: 503 });
      }
      return okResponse('service recovered');
    });

    try {
      const run = runAgentLoop(baseConfig({
        fetch: fetchFn as unknown as typeof fetch,
        onRetry: notice => retryNotices.push(notice),
        onToken: token => answerTokens.push(token),
      }));
      await vi.advanceTimersByTimeAsync(0);

      expect(calls).toBe(1);
      expect(retryNotices).toEqual([
        '\n[Server error 503 — retrying in 2s (retry 1/3)...]\n',
      ]);
      expect(answerTokens).toEqual([]);

      await vi.advanceTimersByTimeAsync(2_000);
      const result = await run;

      expect(result.content).toBe('service recovered');
      expect(answerTokens).toEqual(['service recovered']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps retry notices on onToken for legacy callers without onRetry', async () => {
    vi.useFakeTimers();
    const legacyTokens: string[] = [];
    let calls = 0;
    const fetchFn = vi.fn(async () => {
      calls++;
      if (calls === 1) throw new TypeError('fetch failed');
      return okResponse('legacy recovered');
    });

    try {
      const run = runAgentLoop(baseConfig({
        fetch: fetchFn as unknown as typeof fetch,
        onToken: token => legacyTokens.push(token),
      }));
      await vi.advanceTimersByTimeAsync(0);

      expect(legacyTokens).toEqual([
        '\n[Connection to the model failed — retrying in 2s (retry 1/3)...]\n',
      ]);

      await vi.advanceTimersByTimeAsync(2_000);
      const result = await run;

      expect(result.content).toBe('legacy recovered');
      expect(legacyTokens.at(-1)).toBe('legacy recovered');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('handleNetworkError (#2)', () => {
  it('first failure → retry with positive backoff and an incremented counter', () => {
    const action = handleNetworkError(new TypeError('fetch failed'), initialRetryState());
    expect(action.kind).toBe('retry');
    if (action.kind === 'retry') {
      expect(action.waitMs).toBeGreaterThan(0);
      expect(action.state.networkErrorRetries).toBe(1);
      // unrelated counters untouched
      expect(action.state.rateLimitRetries).toBe(0);
      expect(action.state.serverErrorRetries).toBe(0);
    }
  });

  it('at the retry cap → clean, user-facing fatal error', () => {
    const atCap: RetryState = { rateLimitRetries: 0, serverErrorRetries: 0, networkErrorRetries: 2 };
    const action = handleNetworkError(new Error('ECONNREFUSED'), atCap);
    expect(action.kind).toBe('fatal');
    if (action.kind === 'fatal') {
      expect(action.error.message).toMatch(/Could not reach the model endpoint/);
      expect(action.error.message).toContain('ECONNREFUSED');
    }
  });
});

describe('visible retry wait', () => {
  it('reports the capped wait rather than an unbounded Retry-After value', async () => {
    const response = new Response('rate limited', {
      status: 429,
      headers: { 'retry-after': '3600' },
    });
    const action = await handleNonOkResponse(response, initialRetryState());

    expect(action.kind).toBe('retry');
    if (action.kind === 'retry') {
      expect(action.waitMs).toBe(60_000);
      expect(action.notice).toContain('waiting 60s');
      expect(action.notice).not.toContain('3600s');
    }
  });
});
