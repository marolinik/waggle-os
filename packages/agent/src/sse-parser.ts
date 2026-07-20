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
  /** Provider termination reason from the final choice chunk, when supplied. */
  finishReason: string | null;
  /** True only when the stream contained the protocol terminal `data: [DONE]` event. */
  doneObserved: boolean;
}

export interface SseParseOptions {
  /** Per-token callback fired for each `delta.content` chunk. Caller's content accumulator hooks here. */
  onToken?: (token: string) => void;
}

function incompleteStreamError(
  inputTokens: number,
  outputTokens: number,
): Error & {
  code: 'INCOMPLETE_COMPLETION';
  usage: { inputTokens: number; outputTokens: number };
} {
  const error = new Error(
    'LLM stream ended unexpectedly before data: [DONE]; partial content was not accepted.',
  ) as Error & {
    code: 'INCOMPLETE_COMPLETION';
    usage: { inputTokens: number; outputTokens: number };
  };
  error.name = 'IncompleteCompletionError';
  error.code = 'INCOMPLETE_COMPLETION';
  error.usage = { inputTokens, outputTokens };
  return error;
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
  let finishReason: string | null = null;
  let doneObserved = false;
  const toolCalls = new Map<number, StreamedToolCall>();
  // Synthetic slot assignment for providers that omit `tc.index` on parallel
  // tool-call deltas: each distinct `tc.id` gets its own stable slot so their
  // argument fragments don't all collapse into index 0 and corrupt each other.
  const idToSyntheticIndex = new Map<string, number>();
  let nextSyntheticIndex = 0;
  let lastSlot = 0;

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  streamRead: for (;;) {
    let readResult: ReadableStreamReadResult<Uint8Array>;
    try {
      readResult = await reader.read();
    } catch {
      throw incompleteStreamError(inputTokens, outputTokens);
    }
    const { done, value } = readResult;
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
        if (payload === '[DONE]') {
          doneObserved = true;
          if (typeof reader.cancel === 'function') {
            void reader.cancel().catch(() => undefined);
          }
          break streamRead;
        }

        let chunk: unknown;
        try {
          chunk = JSON.parse(payload);
        } catch {
          continue;
        }

        const c = chunk as {
          usage?: { prompt_tokens?: number; completion_tokens?: number };
          choices?: Array<{
            finish_reason?: string | null;
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

        const choice = c.choices?.[0];
        if (choice?.finish_reason != null) finishReason = choice.finish_reason;

        const delta = choice?.delta;
        if (!delta) continue;

        if (delta.content) {
          content += delta.content;
          if (onToken) onToken(delta.content);
        }

        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            let idx: number;
            if (tc.index !== undefined) {
              idx = tc.index;
            } else if (tc.id) {
              // No index but a distinct id — assign (or reuse) a synthetic slot keyed by id.
              const known = idToSyntheticIndex.get(tc.id);
              if (known !== undefined) {
                idx = known;
              } else {
                idx = nextSyntheticIndex++;
                idToSyntheticIndex.set(tc.id, idx);
              }
            } else {
              // No index and no id — argument-only continuation of the most-recent slot.
              idx = lastSlot;
            }
            lastSlot = idx;
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
    finishReason,
    doneObserved,
  };
}
