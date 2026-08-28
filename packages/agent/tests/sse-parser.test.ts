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
});
