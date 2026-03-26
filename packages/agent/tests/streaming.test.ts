import { describe, it, expect, vi } from 'vitest';
import { runAgentLoop } from '../src/agent-loop.js';

describe('Streaming', () => {
  it('streams tokens via onToken callback when stream=true', async () => {
    const tokens: string[] = [];

    const sseBody = [
      'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":" world"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"!"}}],"usage":{"prompt_tokens":10,"completion_tokens":3}}\n\n',
      'data: [DONE]\n\n',
    ].join('');

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Map([['content-type', 'text/event-stream']]),
      body: {
        getReader: () => {
          let sent = false;
          return {
            read: async () => {
              if (!sent) {
                sent = true;
                return { done: false, value: new TextEncoder().encode(sseBody) };
              }
              return { done: true, value: undefined };
            },
          };
        },
      },
    });

    const result = await runAgentLoop({
      litellmUrl: 'http://localhost:4000/v1',
      litellmApiKey: 'test',
      model: 'test-model',
      systemPrompt: 'You are helpful.',
      tools: [],
      messages: [{ role: 'user', content: 'Hi' }],
      onToken: (t) => tokens.push(t),
      stream: true,
      fetch: mockFetch,
    });

    expect(tokens).toEqual(['Hello', ' world', '!']);
    expect(result.content).toBe('Hello world!');
    expect(result.usage.inputTokens).toBe(10);
    expect(result.usage.outputTokens).toBe(3);
  });

  it('handles streaming with tool calls', async () => {
    const toolUsed: string[] = [];

    // First response: streaming tool call
    const sseToolCall = [
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"echo","arguments":""}}]}}]}\n\n',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"text\\""}}]}}]}\n\n',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":":\\"hi\\"}"}}]}}]}\n\n',
      'data: {"choices":[{"delta":{}}],"usage":{"prompt_tokens":20,"completion_tokens":10}}\n\n',
      'data: [DONE]\n\n',
    ].join('');

    // Second response: final text (non-streaming since we test mixed)
    const sseFinal = [
      'data: {"choices":[{"delta":{"content":"Done!"}}]}\n\n',
      'data: {"choices":[{"delta":{}}],"usage":{"prompt_tokens":30,"completion_tokens":5}}\n\n',
      'data: [DONE]\n\n',
    ].join('');

    let callIndex = 0;
    const mockFetch = vi.fn().mockImplementation(async () => {
      const body = callIndex === 0 ? sseToolCall : sseFinal;
      callIndex++;
      return {
        ok: true,
        headers: new Map([['content-type', 'text/event-stream']]),
        body: {
          getReader: () => {
            let sent = false;
            return {
              read: async () => {
                if (!sent) {
                  sent = true;
                  return { done: false, value: new TextEncoder().encode(body) };
                }
                return { done: true, value: undefined };
              },
            };
          },
        },
      };
    });

    const result = await runAgentLoop({
      litellmUrl: 'http://localhost:4000/v1',
      litellmApiKey: 'test',
      model: 'test-model',
      systemPrompt: 'You are helpful.',
      tools: [
        {
          name: 'echo',
          description: 'Echoes input',
          parameters: {
            type: 'object',
            properties: { text: { type: 'string' } },
            required: ['text'],
          },
          execute: async (args) => {
            toolUsed.push(args.text);
            return `Echo: ${args.text}`;
          },
        },
      ],
      messages: [{ role: 'user', content: 'Hi' }],
      onToolUse: (name) => toolUsed.push(`called:${name}`),
      stream: true,
      fetch: mockFetch,
    });

    expect(result.content).toBe('Done!');
    expect(result.toolsUsed).toEqual(['echo']);
    expect(toolUsed).toContain('called:echo');
    expect(result.usage.inputTokens).toBe(50); // 20 + 30
    expect(result.usage.outputTokens).toBe(15); // 10 + 5
  });

  it('handles chunks split across reads', async () => {
    const tokens: string[] = [];

    // Split an SSE event across two reads
    const chunk1 = 'data: {"choices":[{"delta":{"con';
    const chunk2 = 'tent":"Hello"}}]}\n\ndata: {"choices":[{"delta":{"content":" world"}}],"usage":{"prompt_tokens":5,"completion_tokens":2}}\n\ndata: [DONE]\n\n';

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Map([['content-type', 'text/event-stream']]),
      body: {
        getReader: () => {
          let readCount = 0;
          return {
            read: async () => {
              if (readCount === 0) {
                readCount++;
                return { done: false, value: new TextEncoder().encode(chunk1) };
              }
              if (readCount === 1) {
                readCount++;
                return { done: false, value: new TextEncoder().encode(chunk2) };
              }
              return { done: true, value: undefined };
            },
          };
        },
      },
    });

    const result = await runAgentLoop({
      litellmUrl: 'http://localhost:4000/v1',
      litellmApiKey: 'test',
      model: 'test-model',
      systemPrompt: 'You are helpful.',
      tools: [],
      messages: [{ role: 'user', content: 'Hi' }],
      onToken: (t) => tokens.push(t),
      stream: true,
      fetch: mockFetch,
    });

    expect(tokens).toEqual(['Hello', ' world']);
    expect(result.content).toBe('Hello world');
  });

  it('falls back to non-streaming when stream=false', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'Hello!' } }],
        usage: { prompt_tokens: 10, completion_tokens: 2 },
      }),
    });

    const result = await runAgentLoop({
      litellmUrl: 'http://localhost:4000/v1',
      litellmApiKey: 'test',
      model: 'test-model',
      systemPrompt: 'You are helpful.',
      tools: [],
      messages: [{ role: 'user', content: 'Hi' }],
      fetch: mockFetch,
    });

    expect(result.content).toBe('Hello!');
  });

  it('sends stream options in request body when stream=true', async () => {
    const sseBody = [
      'data: {"choices":[{"delta":{"content":"Hi"}}],"usage":{"prompt_tokens":5,"completion_tokens":1}}\n\n',
      'data: [DONE]\n\n',
    ].join('');

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Map([['content-type', 'text/event-stream']]),
      body: {
        getReader: () => {
          let sent = false;
          return {
            read: async () => {
              if (!sent) {
                sent = true;
                return { done: false, value: new TextEncoder().encode(sseBody) };
              }
              return { done: true, value: undefined };
            },
          };
        },
      },
    });

    await runAgentLoop({
      litellmUrl: 'http://localhost:4000/v1',
      litellmApiKey: 'test',
      model: 'test-model',
      systemPrompt: 'You are helpful.',
      tools: [],
      messages: [{ role: 'user', content: 'Hi' }],
      stream: true,
      fetch: mockFetch,
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.stream).toBe(true);
    expect(body.stream_options).toEqual({ include_usage: true });
  });
});
