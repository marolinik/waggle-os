/**
 * OpenAI-format chat-completion SSE stream parser.
 *
 * Extracted from agent-loop.ts (PR-B, 2026-05-27) — was ~90L inlined in the
 * runAgentLoop streaming branch. Lifted so the parsing logic is independently
 * testable and the agent loop reads as a conversation loop, not a buffer/decoder
 * loop.
 *
 * Wire format follows OpenAI's streaming spec, also emitted by LiteLLM →
 * Anthropic. Events are `data: <json>\n\n`-delimited; the terminal sentinel
 * is `data: [DONE]`. Tool calls arrive as incremental deltas indexed by
 * `tc.index`; this parser assembles them into complete records.
 */

/** Assembled tool call from streaming deltas. Shape matches OpenAI / LiteLLM. */
export interface StreamedToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface ParsedChatCompletionStream {
  /** Concatenated `choices[0].delta.content` across all chunks in this turn */
  content: string;
  /** Tool calls assembled from incremental deltas (in `tc.index` order), or undefined if the turn had none */
  toolCalls: StreamedToolCall[] | undefined;
  /** Usage from the final chunk carrying a `usage` block */
  usage: { inputTokens: number; outputTokens: number };
}

export interface SseParseOptions {
  /** Per-token callback fired for each `delta.content` chunk. Caller's content accumulator hooks here. */
  onToken?: (token: string) => void;
}

/**
 * Read an OpenAI-format SSE stream end-to-end and return assembled content +
 * tool calls + usage. Pure function over the stream — no caller state mutation
 * beyond the `onToken` callback (which the caller can wrap to capture
 * cross-turn content if needed).
 */
export async function parseChatCompletionStream(
  body: ReadableStream<Uint8Array>,
  options: SseParseOptions = {},
): Promise<ParsedChatCompletionStream> {
  const { onToken } = options;
  let content = '';
  let inputTokens = 0;
  let outputTokens = 0;
  const toolCalls = new Map<number, StreamedToolCall>();

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // Process complete SSE events (separated by double newlines).
    // Last part may be incomplete — keep it in the buffer.
    const parts = buffer.split('\n\n');
    buffer = parts.pop() ?? '';

    for (const part of parts) {
      for (const line of part.split('\n')) {
        if (!line.startsWith('data: ')) continue;
        const payload = line.slice(6).trim();
        if (payload === '[DONE]') continue;

        let chunk: unknown;
        try {
          chunk = JSON.parse(payload);
        } catch {
          continue;
        }

        const c = chunk as {
          usage?: { prompt_tokens?: number; completion_tokens?: number };
          choices?: Array<{
            delta?: {
              content?: string;
              tool_calls?: Array<{
                index?: number;
                id?: string;
                function?: { name?: string; arguments?: string };
              }>;
            };
          }>;
        };

        if (c.usage) {
          inputTokens = c.usage.prompt_tokens ?? inputTokens;
          outputTokens = c.usage.completion_tokens ?? outputTokens;
        }

        const delta = c.choices?.[0]?.delta;
        if (!delta) continue;

        if (delta.content) {
          content += delta.content;
          if (onToken) onToken(delta.content);
        }

        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index ?? 0;
            if (!toolCalls.has(idx)) {
              toolCalls.set(idx, {
                id: tc.id ?? '',
                type: 'function' as const,
                function: { name: tc.function?.name ?? '', arguments: '' },
              });
            }
            const existing = toolCalls.get(idx)!;
            if (tc.id) existing.id = tc.id;
            if (tc.function?.name) existing.function.name = tc.function.name;
            if (tc.function?.arguments) {
              existing.function.arguments += tc.function.arguments;
            }
          }
        }
      }
    }
  }

  const toolCallsArray = toolCalls.size > 0 ? Array.from(toolCalls.values()) : undefined;

  return {
    content,
    toolCalls: toolCallsArray,
    usage: { inputTokens, outputTokens },
  };
}
