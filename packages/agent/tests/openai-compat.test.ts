import { describe, it, expect, vi } from 'vitest';
import { openaiChat } from '../src/providers/openai-compat.js';
import type { ResolvedModel } from '../src/model-router.js';

const resolved: ResolvedModel = {
  provider: 'openai',
  model: 'gpt-4o-mini',
  apiKey: 'test-key',
  baseUrl: 'https://api.example.com/v1',
};

function okBody(content = 'hi') {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content } }],
      model: 'gpt-4o-mini',
      usage: { prompt_tokens: 12, completion_tokens: 5 },
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

const noSleep = async () => {};

describe('openaiChat', () => {
  it('returns parsed content and usage on success', async () => {
    const fetchImpl = vi.fn(async () => okBody('hello')) as unknown as typeof fetch;
    const res = await openaiChat(resolved, [{ role: 'user', content: 'hey' }], undefined, { fetchImpl });
    expect(res.content).toBe('hello');
    expect(res.usage).toEqual({ input_tokens: 12, output_tokens: 5 });
  });

  it('passes an AbortSignal (timeout) to fetch', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      return okBody();
    }) as unknown as typeof fetch;
    await openaiChat(resolved, [{ role: 'user', content: 'x' }], undefined, { fetchImpl });
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1);
  });

  it('retries a transient 500 then succeeds', async () => {
    let n = 0;
    const fetchImpl = vi.fn(async () => {
      n++;
      if (n === 1) return new Response('upstream boom', { status: 500 });
      return okBody('recovered');
    }) as unknown as typeof fetch;

    const res = await openaiChat(resolved, [{ role: 'user', content: 'x' }], undefined, {
      fetchImpl,
      sleepImpl: noSleep,
    });
    expect(res.content).toBe('recovered');
    expect(n).toBe(2);
  });

  it('retries a network-level failure then succeeds', async () => {
    let n = 0;
    const fetchImpl = vi.fn(async () => {
      n++;
      if (n === 1) throw new Error('fetch failed');
      return okBody('ok-after-network-retry');
    }) as unknown as typeof fetch;

    const res = await openaiChat(resolved, [{ role: 'user', content: 'x' }], undefined, {
      fetchImpl,
      sleepImpl: noSleep,
    });
    expect(res.content).toBe('ok-after-network-retry');
    expect(n).toBe(2);
  });

  it('gives up after maxRetries on persistent 503', async () => {
    const fetchImpl = vi.fn(async () => new Response('down', { status: 503 })) as unknown as typeof fetch;
    await expect(
      openaiChat(resolved, [{ role: 'user', content: 'x' }], undefined, {
        fetchImpl,
        maxRetries: 2,
        sleepImpl: noSleep,
      }),
    ).rejects.toThrow(/503/);
    // 1 initial + 2 retries
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(3);
  });

  it('does not retry a non-transient 400', async () => {
    const fetchImpl = vi.fn(async () => new Response('bad request', { status: 400 })) as unknown as typeof fetch;
    await expect(
      openaiChat(resolved, [{ role: 'user', content: 'x' }], undefined, { fetchImpl, sleepImpl: noSleep }),
    ).rejects.toThrow(/400/);
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1);
  });
});
