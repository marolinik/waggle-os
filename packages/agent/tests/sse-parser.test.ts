import { describe, it, expect, vi } from 'vitest';
import { parseChatCompletionStream } from '../src/sse-parser.js';

/** Build a ReadableStream<Uint8Array> from raw SSE event strings. */
function streamFrom(events: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const e of events) controller.enqueue(encoder.encode(e));
      controller.close();
    },
  });
}

function sse(obj: unknown): string {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

describe('parseChatCompletionStream', () => {
  it('signals reasoning activity without exposing private reasoning text', async () => {
    const onReasoningActivity = vi.fn();
    const onToken = vi.fn();
    const body = streamFrom([
      sse({ choices: [{ delta: { reasoning_content: 'PRIVATE_REASONING' } }] }),
      sse({ choices: [{ delta: { content: 'Ready' } }] }),
      sse({ choices: [{ delta: {}, finish_reason: 'stop' }] }),
      'data: [DONE]\n\n',
    ]);

    const result = await parseChatCompletionStream(body, { onReasoningActivity, onToken });

    expect(onReasoningActivity).toHaveBeenCalledOnce();
    expect(onToken).toHaveBeenCalledWith('Ready');
    expect(result.content).toBe('Ready');
    expect(JSON.stringify(result)).not.toContain('PRIVATE_REASONING');
  });

  it('keeps index-less parallel tool calls in separate slots by id (R3-006)', async () => {
    // Two distinct parallel tool calls whose deltas omit `index`, interleaved.
    const body = streamFrom([
      sse({ choices: [{ delta: { tool_calls: [{ id: 'call_a', function: { name: 'get_weather', arguments: '{"ci' } }] } }] }),
      sse({ choices: [{ delta: { tool_calls: [{ id: 'call_b', function: { name: 'get_time', arguments: '{"zo' } }] } }] }),
      sse({ choices: [{ delta: { tool_calls: [{ id: 'call_a', function: { arguments: 'ty":"NYC"}' } }] } }] }),
      sse({ choices: [{ delta: { tool_calls: [{ id: 'call_b', function: { arguments: 'ne":"UTC"}' } }] } }] }),
      'data: [DONE]\n\n',
    ]);

    const result = await parseChatCompletionStream(body);

    expect(result.finishReason).toBeNull();
    expect(result.doneObserved).toBe(true);
    expect(result.toolCalls).toBeDefined();
    expect(result.toolCalls!).toHaveLength(2);

    const a = result.toolCalls!.find((t) => t.id === 'call_a');
    const b = result.toolCalls!.find((t) => t.id === 'call_b');

    expect(a).toBeDefined();
    expect(b).toBeDefined();
    // Args must NOT be concatenated across the two distinct calls.
    expect(a!.function.name).toBe('get_weather');
    expect(a!.function.arguments).toBe('{"city":"NYC"}');
    expect(b!.function.name).toBe('get_time');
    expect(b!.function.arguments).toBe('{"zone":"UTC"}');
  });

  it('still assembles index-addressed tool calls correctly', async () => {
    const body = streamFrom([
      sse({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'c0', function: { name: 'f0', arguments: '{"a"' } }] } }] }),
      sse({ choices: [{ delta: { tool_calls: [{ index: 1, id: 'c1', function: { name: 'f1', arguments: '{"b"' } }] } }] }),
      sse({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: ':1}' } }] } }] }),
      sse({ choices: [{ delta: { tool_calls: [{ index: 1, function: { arguments: ':2}' } }] } }] }),
      'data: [DONE]\n\n',
    ]);

    const result = await parseChatCompletionStream(body);

    expect(result.toolCalls).toHaveLength(2);
    expect(result.toolCalls![0]).toMatchObject({ id: 'c0', function: { name: 'f0', arguments: '{"a":1}' } });
    expect(result.toolCalls![1]).toMatchObject({ id: 'c1', function: { name: 'f1', arguments: '{"b":2}' } });
  });

  it('keeps distinct null-index tool calls in ID-addressed slots', async () => {
    const body = streamFrom([
      sse({ choices: [{ delta: { tool_calls: [{ index: null, id: 'call_a', function: { name: 'alpha', arguments: '{"a":1}' } }] } }] }),
      sse({ choices: [{ delta: { tool_calls: [{ index: null, id: 'call_b', function: { name: 'beta', arguments: '{"b":2}' } }] } }] }),
      sse({ choices: [{ delta: {}, finish_reason: 'tool_calls' }] }),
      'data: [DONE]\n\n',
    ]);

    const result = await parseChatCompletionStream(body);

    expect(result.toolCalls).toEqual([
      { id: 'call_a', type: 'function', function: { name: 'alpha', arguments: '{"a":1}' } },
      { id: 'call_b', type: 'function', function: { name: 'beta', arguments: '{"b":2}' } },
    ]);
  });

  it('keeps an earlier synthetic slot disjoint from a later explicit index', async () => {
    const body = streamFrom([
      sse({ choices: [{ delta: { tool_calls: [{ index: null, id: 'call_b', function: { name: 'beta', arguments: '{"b":2}' } }] } }] }),
      sse({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_a', function: { name: 'alpha', arguments: '{"a":1}' } }] } }] }),
      sse({ choices: [{ delta: {}, finish_reason: 'tool_calls' }] }),
      'data: [DONE]\n\n',
    ]);

    const result = await parseChatCompletionStream(body);

    expect(result.toolCalls).toEqual([
      { id: 'call_b', type: 'function', function: { name: 'beta', arguments: '{"b":2}' } },
      { id: 'call_a', type: 'function', function: { name: 'alpha', arguments: '{"a":1}' } },
    ]);
  });

  it('keeps one tool call when an index is present in only some ID-bearing deltas', async () => {
    for (const events of [
      [
        sse({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_a', function: { name: 'alpha', arguments: '{"a"' } }] } }] }),
        sse({ choices: [{ delta: { tool_calls: [{ id: 'call_a', function: { arguments: ':1}' } }] } }] }),
      ],
      [
        sse({ choices: [{ delta: { tool_calls: [{ index: null, id: 'call_a', function: { name: 'alpha', arguments: '{"a"' } }] } }] }),
        sse({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_a', function: { arguments: ':1}' } }] } }] }),
      ],
    ]) {
      const body = streamFrom([
        ...events,
        sse({ choices: [{ delta: {}, finish_reason: 'tool_calls' }] }),
        'data: [DONE]\n\n',
      ]);

      await expect(parseChatCompletionStream(body)).resolves.toMatchObject({
        toolCalls: [{
          id: 'call_a',
          function: { name: 'alpha', arguments: '{"a":1}' },
        }],
      });
    }
  });

  it.each([
    [
      { index: 0, id: 'call_a', function: { name: 'alpha', arguments: '{}' } },
      { index: 0, id: 'call_b', function: { name: 'beta', arguments: '{}' } },
    ],
    [
      { index: 0, id: 'call_a', function: { name: 'alpha', arguments: '{}' } },
      { index: 1, id: 'call_a', function: { arguments: '{}' } },
    ],
  ])('fails closed on conflicting explicit tool-call identity %#', async (first, second) => {
    const body = streamFrom([
      sse({ choices: [{ delta: { tool_calls: [first] } }] }),
      sse({ choices: [{ delta: { tool_calls: [second] } }] }),
    ]);

    await expect(parseChatCompletionStream(body)).rejects.toMatchObject({
      code: 'INCOMPLETE_COMPLETION',
    });
  });

  it('fails closed before a streamed tool call can change function identity', async () => {
    const body = streamFrom([
      sse({ choices: [{ delta: { tool_calls: [{
        index: 0,
        id: 'call_a',
        function: { name: 'alpha', arguments: '{"a"' },
      }] } }] }),
      sse({ choices: [{ delta: { tool_calls: [{
        index: 0,
        id: 'call_a',
        function: { name: 'beta', arguments: ':1}' },
      }] } }] }),
    ]);

    await expect(parseChatCompletionStream(body)).rejects.toMatchObject({
      code: 'INCOMPLETE_COMPLETION',
      partialToolCalls: [{
        id: 'call_a',
        function: { name: 'alpha', arguments: '{"a"' },
      }],
    });
  });

  it('records a length termination even when the stream has a DONE sentinel', async () => {
    const body = streamFrom([
      sse({ choices: [{ delta: { content: 'Partial answer' } }] }),
      sse({
        choices: [{ delta: {}, finish_reason: 'length' }],
        usage: { prompt_tokens: 120, completion_tokens: 50 },
      }),
      'data: [DONE]\n\n',
    ]);

    const result = await parseChatCompletionStream(body);

    expect(result.content).toBe('Partial answer');
    expect(result.finishReason).toBe('length');
    expect(result.doneObserved).toBe(true);
    expect(result.usage).toEqual({ inputTokens: 120, outputTokens: 50 });
  });

  it('distinguishes a physical EOF from a protocol-complete stream', async () => {
    const body = streamFrom([
      sse({ choices: [{ delta: { content: 'Looks complete' } }] }),
      sse({ choices: [{ delta: {}, finish_reason: 'stop' }] }),
    ]);

    const result = await parseChatCompletionStream(body);

    expect(result.content).toBe('Looks complete');
    expect(result.finishReason).toBe('stop');
    expect(result.doneObserved).toBe(false);
  });

  it('classifies a reader failure before DONE as a non-retryable incomplete completion', async () => {
    const encoder = new TextEncoder();
    let pullCount = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (pullCount++ === 0) {
          controller.enqueue(encoder.encode(sse({
            choices: [{ delta: { content: 'Partial answer' } }],
            usage: { prompt_tokens: 120, completion_tokens: 50 },
          })));
        } else {
          controller.error(new Error('upstream socket closed'));
        }
      },
    });

    await expect(parseChatCompletionStream(body)).rejects.toMatchObject({
      code: 'INCOMPLETE_COMPLETION',
      usage: { inputTokens: 120, outputTokens: 50 },
      message: expect.stringMatching(/before data: \[DONE\].*not accepted/i),
    });
  });

  it('cancels immediately at DONE and ignores bytes after the terminal event', async () => {
    const cancel = vi.fn();
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode([
          sse({ choices: [{ delta: { content: 'Complete answer' } }] }),
          sse({
            choices: [{ delta: {}, finish_reason: 'stop' }],
            usage: { prompt_tokens: 100, completion_tokens: 20 },
          }),
          'data: [DONE]\n\n',
          sse({ choices: [{ delta: { content: 'MUST_NOT_APPEAR' } }] }),
        ].join('')));
      },
      cancel,
    });

    const result = await parseChatCompletionStream(body);

    expect(result.content).toBe('Complete answer');
    expect(result.finishReason).toBe('stop');
    expect(result.doneObserved).toBe(true);
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('parses data fields with and without the optional post-colon space', async () => {
    const body = streamFrom([
      sse({ choices: [{ delta: { content: 'A' } }] }),
      `data:${JSON.stringify({ choices: [{ delta: { content: 'B' } }] })}\n\n`,
      sse({ choices: [{ delta: {}, finish_reason: 'stop' }] }),
      'data:[DONE]\n\n',
    ]);

    await expect(parseChatCompletionStream(body)).resolves.toMatchObject({
      content: 'AB',
      finishReason: 'stop',
      doneObserved: true,
    });
  });

  it('parses CRLF-delimited OpenAI events', async () => {
    const body = streamFrom([
      `data: ${JSON.stringify({ choices: [{ delta: { content: 'AB' } }] })}\r\n\r\n`,
      `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] })}\r\n\r\n`,
      'data: [DONE]\r\n\r\n',
    ]);

    await expect(parseChatCompletionStream(body)).resolves.toMatchObject({
      content: 'AB',
      finishReason: 'stop',
      doneObserved: true,
    });
  });

  it('joins multiline data fields before parsing JSON', async () => {
    const body = streamFrom([
      'data: {"choices":[\ndata: {"delta":{"content":"AB"}}]}\n\n',
      sse({ choices: [{ delta: {}, finish_reason: 'stop' }] }),
      'data: [DONE]\n\n',
    ]);

    await expect(parseChatCompletionStream(body)).resolves.toMatchObject({
      content: 'AB',
      finishReason: 'stop',
      doneObserved: true,
    });
  });

  it('fails closed on malformed JSON before a valid terminal', async () => {
    const body = streamFrom([
      sse({ choices: [{ delta: { content: 'A' } }] }),
      'data: {"choices":\n\n',
      sse({ choices: [{ delta: {}, finish_reason: 'stop' }] }),
      'data: [DONE]\n\n',
    ]);

    await expect(parseChatCompletionStream(body)).rejects.toMatchObject({
      code: 'INCOMPLETE_COMPLETION',
    });
  });

  it('fails closed on semantic data after finish_reason', async () => {
    const body = streamFrom([
      sse({ choices: [{ delta: { content: 'A' } }] }),
      sse({ choices: [{ delta: {}, finish_reason: 'stop' }] }),
      sse({ choices: [{ delta: { content: 'B' } }] }),
      'data: [DONE]\n\n',
    ]);

    await expect(parseChatCompletionStream(body)).rejects.toMatchObject({
      code: 'INCOMPLETE_COMPLETION',
    });
  });

  it('fails closed when a later finish reason contradicts the first', async () => {
    const body = streamFrom([
      sse({ choices: [{ delta: { content: 'A' } }] }),
      sse({ choices: [{ delta: {}, finish_reason: 'length' }] }),
      sse({ choices: [{ delta: {}, finish_reason: 'stop' }] }),
      'data: [DONE]\n\n',
    ]);

    await expect(parseChatCompletionStream(body)).rejects.toMatchObject({
      code: 'INCOMPLETE_COMPLETION',
      usage: { inputTokens: 0, outputTokens: 0 },
    });
  });

  it('does not let a rejected terminal frame overwrite accepted usage', async () => {
    const body = streamFrom([
      sse({
        choices: [{ delta: {}, finish_reason: 'stop' }],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      }),
      sse({
        choices: [{ delta: {}, finish_reason: 'length' }],
        usage: { prompt_tokens: 999, completion_tokens: 999 },
      }),
    ]);

    await expect(parseChatCompletionStream(body)).rejects.toMatchObject({
      code: 'INCOMPLETE_COMPLETION',
      usage: { inputTokens: 1, outputTokens: 1 },
    });
  });

  it.each([
    null,
    'not-a-completion',
    { choices: {} },
    { choices: [null] },
    { choices: [{ delta: { content: 7 } }] },
    { choices: [{ delta: { tool_calls: {} } }] },
    { error: { message: 'gateway failed' } },
  ])('fails closed on a syntactically valid invalid completion payload %#', async (payload) => {
    const body = streamFrom([
      sse({ choices: [{ delta: { content: 'A' } }] }),
      sse(payload),
      sse({ choices: [{ delta: {}, finish_reason: 'stop' }] }),
      'data: [DONE]\n\n',
    ]);

    await expect(parseChatCompletionStream(body)).rejects.toMatchObject({
      code: 'INCOMPLETE_COMPLETION',
    });
  });

  it('cancels the upstream reader on a protocol failure', async () => {
    const cancel = vi.fn();
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('data: null\n\n'));
      },
      cancel,
    });

    await expect(parseChatCompletionStream(body)).rejects.toMatchObject({
      code: 'INCOMPLETE_COMPLETION',
    });
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('fails closed when a pending SSE line or event exceeds its memory bound', async () => {
    const overlongLine = streamFrom(['data: ', 'x'.repeat(1_048_577)]);
    await expect(parseChatCompletionStream(overlongLine)).rejects.toMatchObject({
      code: 'INCOMPLETE_COMPLETION',
    });

    const overlongEvent = streamFrom(Array.from(
      { length: 1_025 },
      () => `data: ${'x'.repeat(1_024)}\n`,
    ));
    await expect(parseChatCompletionStream(overlongEvent)).rejects.toMatchObject({
      code: 'INCOMPLETE_COMPLETION',
    });
  });

  it('fails closed when many individually valid events exceed the total stream bound', async () => {
    const event = sse({ choices: [{ delta: { content: 'x'.repeat(700_000) } }] });
    const body = streamFrom([event, event, event, event, 'data: [DONE]\n\n']);

    await expect(parseChatCompletionStream(body)).rejects.toMatchObject({
      code: 'INCOMPLETE_COMPLETION',
    });
  });

  it('fails closed when a stream exceeds the tool-call bound', async () => {
    const body = streamFrom([
      sse({
        usage: { prompt_tokens: 3, completion_tokens: 2 },
        choices: [{
          delta: {
            tool_calls: [{
              index: 0,
              id: 'accepted_call',
              function: { name: 'accepted', arguments: '{}' },
            }],
          },
        }],
      }),
      sse({
        usage: { prompt_tokens: 999, completion_tokens: 999 },
        choices: [{
          delta: {
            tool_calls: Array.from({ length: 256 }, (_, index) => ({
              index: index + 1,
              id: `call_${index}`,
              function: { name: 'noop', arguments: '{}' },
            })),
          },
        }],
      }),
    ]);

    await expect(parseChatCompletionStream(body)).rejects.toMatchObject({
      code: 'INCOMPLETE_COMPLETION',
      usage: { inputTokens: 3, outputTokens: 2 },
      partialToolCalls: [{
        id: 'accepted_call',
        function: { name: 'accepted', arguments: '{}' },
      }],
    });
  });

  it('preserves CRLF dispatch and UTF-8 when both split across byte chunks', async () => {
    const encoded = new TextEncoder().encode([
      `data: ${JSON.stringify({ choices: [{ delta: { content: 'A🐝' } }] })}\r\n\r\n`,
      `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] })}\r\n\r\n`,
      'data: [DONE]\r\n\r\n',
    ].join(''));
    const splitPoints = new Set<number>();
    for (let index = 1; index < encoded.length; index += 1) {
      if (encoded[index - 1] === 13 && encoded[index] === 10) splitPoints.add(index);
      if (encoded[index - 1] >= 0xf0 && encoded[index] >= 0x80) splitPoints.add(index);
    }
    const chunks: Uint8Array[] = [];
    let start = 0;
    for (const end of [...splitPoints].sort((a, b) => a - b)) {
      chunks.push(encoded.slice(start, end));
      start = end;
    }
    chunks.push(encoded.slice(start));
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(chunk);
        controller.close();
      },
    });

    await expect(parseChatCompletionStream(body)).resolves.toMatchObject({
      content: 'A🐝',
      finishReason: 'stop',
      doneObserved: true,
    });
  });

  it('discards an unterminated final event at physical EOF', async () => {
    const body = streamFrom([
      sse({ choices: [{ delta: { content: 'A' } }] }),
      `data: ${JSON.stringify({ choices: [{ delta: { content: 'B' } }] })}`,
    ]);

    await expect(parseChatCompletionStream(body)).resolves.toMatchObject({
      content: 'A',
      finishReason: null,
      doneObserved: false,
    });
  });
});
