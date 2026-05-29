import { describe, it, expect } from 'vitest';
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
});
