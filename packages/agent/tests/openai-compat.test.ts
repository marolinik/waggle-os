import { describe, it, expect, vi } from 'vitest';
import {
  isIncompleteCompletionError,
  openaiChat,
  parseOpenAiTextCompletion,
} from '../src/providers/openai-compat.js';
import type { ResolvedModel } from '../src/model-router.js';

const resolved: ResolvedModel = {
  provider: 'openai',
  model: 'gpt-4o-mini',
  apiKey: 'test-key',
  baseUrl: 'https://api.example.com/v1',
};

function okBody(content: string | null = 'hi', finishReason: string | null | 'missing' = 'stop') {
  return new Response(
    JSON.stringify({
      choices: [{
        message: { content },
        ...(finishReason === 'missing' ? {} : { finish_reason: finishReason }),
      }],
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

  it.each(['missing', null, 'length', 'content_filter', 'tool_calls'])(
    'rejects a 200 response with non-final finish reason %s without replay',
    async (finishReason) => {
      const fetchImpl = vi.fn(async () => okBody('Partial content', finishReason)) as unknown as typeof fetch;

      await expect(openaiChat(
        resolved,
        [{ role: 'user', content: 'hey' }],
        undefined,
        { fetchImpl, sleepImpl: noSleep },
      )).rejects.toMatchObject({
        code: 'INCOMPLETE_COMPLETION',
        usage: { inputTokens: 12, outputTokens: 5 },
        message: expect.stringMatching(/finish_reason=.*partial content was rejected/i),
      });

      expect(fetchImpl).toHaveBeenCalledOnce();
    },
  );

  it.each([null, '', '   '])('rejects stop with unusable assistant text %s', async (content) => {
    const fetchImpl = vi.fn(async () => okBody(content, 'stop')) as unknown as typeof fetch;

    await expect(openaiChat(
      resolved,
      [{ role: 'user', content: 'hey' }],
      undefined,
      { fetchImpl, sleepImpl: noSleep },
    )).rejects.toMatchObject({
      code: 'INCOMPLETE_COMPLETION',
      usage: { inputTokens: 12, outputTokens: 5 },
    });

    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('rejects stop with missing assistant text or tool calls without replay', async () => {
    const payloads = [
      { choices: [{ finish_reason: 'stop', message: {} }] },
      {
        choices: [{
          finish_reason: 'stop',
          message: {
            content: 'Text plus an unsupported tool call.',
            tool_calls: [{ id: 'call_1' }],
          },
        }],
      },
    ];

    for (const payload of payloads) {
      const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
        ...payload,
        model: 'gpt-4o-mini',
        usage: { prompt_tokens: 12, completion_tokens: 5 },
      }), { status: 200 })) as unknown as typeof fetch;

      await expect(openaiChat(
        resolved,
        [{ role: 'user', content: 'hey' }],
        undefined,
        { fetchImpl, sleepImpl: noSleep },
      )).rejects.toMatchObject({ code: 'INCOMPLETE_COMPLETION' });
      expect(fetchImpl).toHaveBeenCalledOnce();
    }
  });

  it('classifies an empty paid choice set as incomplete and preserves usage', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      choices: [],
      model: 'gpt-4o-mini',
      usage: { prompt_tokens: 12, completion_tokens: 5 },
    }), { status: 200 })) as unknown as typeof fetch;

    await expect(openaiChat(
      resolved,
      [{ role: 'user', content: 'hey' }],
      undefined,
      { fetchImpl, sleepImpl: noSleep },
    )).rejects.toMatchObject({
      code: 'INCOMPLETE_COMPLETION',
      usage: { inputTokens: 12, outputTokens: 5 },
      message: expect.stringMatching(/missing completion choice/i),
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('rejects a null JSON response without replay', async () => {
    const fetchImpl = vi.fn(async () => new Response('null', { status: 200 })) as unknown as typeof fetch;

    await expect(openaiChat(
      resolved,
      [{ role: 'user', content: 'hey' }],
      undefined,
      { fetchImpl, sleepImpl: noSleep },
    )).rejects.toMatchObject({ code: 'INCOMPLETE_COMPLETION' });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('classifies malformed JSON from a successful HTTP response as incomplete without replay', async () => {
    const fetchImpl = vi.fn(async () => new Response('{', { status: 200 })) as unknown as typeof fetch;

    await expect(openaiChat(
      resolved,
      [{ role: 'user', content: 'hey' }],
      undefined,
      { fetchImpl, sleepImpl: noSleep },
    )).rejects.toMatchObject({ code: 'INCOMPLETE_COMPLETION' });
    expect(fetchImpl).toHaveBeenCalledOnce();
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

describe('parseOpenAiTextCompletion', () => {
  it('returns complete text and normalized token/cost usage', () => {
    expect(parseOpenAiTextCompletion({
      choices: [{ finish_reason: 'stop', message: { content: 'Complete.' } }],
      model: 'test-model',
      usage: { prompt_tokens: 9, completion_tokens: 4, total_cost: 0.0123 },
    })).toEqual({
      content: 'Complete.',
      model: 'test-model',
      usage: { inputTokens: 9, outputTokens: 4, totalCostUsd: 0.0123 },
    });
  });

  it('preserves paid usage on an incomplete provider error payload', () => {
    try {
      parseOpenAiTextCompletion({
        error: { message: 'provider interrupted' },
        usage: { prompt_tokens: 8, completion_tokens: 3, total_cost: 0.004 },
      });
      throw new Error('expected parser to reject');
    } catch (error) {
      expect(isIncompleteCompletionError(error)).toBe(true);
      expect(error).toMatchObject({
        code: 'INCOMPLETE_COMPLETION',
        usage: { inputTokens: 8, outputTokens: 3, totalCostUsd: 0.004 },
      });
    }
  });

  it.each([
    { finish_reason: 'stop', message: { content: 'text', refusal: 'blocked' } },
    { finish_reason: 'stop', message: { content: 'text', tool_calls: { malformed: true } } },
  ])('rejects terminal payload mismatches', (choice) => {
    expect(() => parseOpenAiTextCompletion({ choices: [choice] })).toThrow(/rejected/i);
  });
});
