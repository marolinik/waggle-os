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
  /** Signals private provider reasoning activity without exposing its contents. */
  onReasoningActivity?: () => void;
  /** Signals the first substantive reasoning, content, or tool-call delta. */
  onActivity?: () => void;
}

const MAX_PENDING_SSE_EVENT_CHARS = 1_048_576;
const MAX_PENDING_SSE_EVENT_LINES = 4_096;
const MAX_TOTAL_SSE_CHARS = 2_097_152;
const MAX_STREAMED_TOOL_CALLS = 256;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isTokenCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function incompleteStreamError(
  inputTokens: number,
  outputTokens: number,
  partialToolCalls: StreamedToolCall[] | undefined,
  message = 'LLM stream ended unexpectedly before data: [DONE]; partial content was not accepted.',
): Error & {
  code: 'INCOMPLETE_COMPLETION';
  usage: { inputTokens: number; outputTokens: number };
  partialToolCalls?: StreamedToolCall[];
} {
  const error = new Error(message) as Error & {
    code: 'INCOMPLETE_COMPLETION';
    usage: { inputTokens: number; outputTokens: number };
    partialToolCalls?: StreamedToolCall[];
  };
  error.name = 'IncompleteCompletionError';
  error.code = 'INCOMPLETE_COMPLETION';
  error.usage = { inputTokens, outputTokens };
  error.partialToolCalls = partialToolCalls;
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
  const { onToken, onReasoningActivity, onActivity } = options;
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
  // Provider-supplied indexes are validated as non-negative. Keep synthetic
  // slots negative so arrival order can never collide with a later explicit index.
  let nextSyntheticIndex = -1;
  let lastSlot = 0;

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let lineBuffer = '';
  let pendingCarriageReturn = false;
  let eventDataLines: string[] = [];
  let eventDataChars = 0;
  let totalDecodedChars = 0;
  let stopReading = false;

  const partialToolCalls = () => (
    toolCalls.size > 0 ? Array.from(toolCalls.values()) : undefined
  );

  const failClosed = (message: string): never => {
    if (typeof reader.cancel === 'function') {
      void reader.cancel().catch(() => undefined);
    }
    throw incompleteStreamError(inputTokens, outputTokens, partialToolCalls(), message);
  };

  const processPayload = (payload: string): void => {
    if (payload === '[DONE]') {
      doneObserved = true;
      stopReading = true;
      if (typeof reader.cancel === 'function') {
        void reader.cancel().catch(() => undefined);
      }
      return;
    }

    let chunk: unknown;
    try {
      chunk = JSON.parse(payload);
    } catch {
      failClosed('LLM stream contained malformed SSE data; partial content was not accepted.');
    }

    if (!isRecord(chunk)) {
      failClosed('LLM stream contained a non-object completion event; partial content was not accepted.');
    }
    const event = chunk as Record<string, unknown>;
    if (event.error != null) {
      failClosed('LLM stream contained a provider error event; partial content was not accepted.');
    }

    let nextInputTokens = inputTokens;
    let nextOutputTokens = outputTokens;
    const rawUsage = event.usage;
    if (rawUsage != null) {
      if (!isRecord(rawUsage)) {
        failClosed('LLM stream contained invalid usage data; partial content was not accepted.');
      }
      const usage = rawUsage as Record<string, unknown>;
      if ((usage.prompt_tokens != null && !isTokenCount(usage.prompt_tokens))
        || (usage.completion_tokens != null && !isTokenCount(usage.completion_tokens))) {
        failClosed('LLM stream contained invalid usage data; partial content was not accepted.');
      }
      nextInputTokens = typeof usage.prompt_tokens === 'number' ? usage.prompt_tokens : inputTokens;
      nextOutputTokens = typeof usage.completion_tokens === 'number' ? usage.completion_tokens : outputTokens;
    }

    if (event.choices != null && !Array.isArray(event.choices)) {
      failClosed('LLM stream contained invalid choices data; partial content was not accepted.');
    }
    const choices = Array.isArray(event.choices) ? event.choices : [];
    const rawChoice = choices[0];
    if (choices.length > 0 && !isRecord(rawChoice)) {
      failClosed('LLM stream contained an invalid choice; partial content was not accepted.');
    }
    const choice = isRecord(rawChoice) ? rawChoice : undefined;
    if (choice?.finish_reason != null && typeof choice.finish_reason !== 'string') {
      failClosed('LLM stream contained an invalid finish reason; partial content was not accepted.');
    }
    const nextFinishReason = typeof choice?.finish_reason === 'string'
      ? choice.finish_reason
      : null;

    const rawDeltaValue = choice?.delta;
    if (rawDeltaValue != null && !isRecord(rawDeltaValue)) {
      failClosed('LLM stream contained an invalid delta; partial content was not accepted.');
    }
    const rawDelta = isRecord(rawDeltaValue) ? rawDeltaValue : undefined;
    for (const field of ['content', 'reasoning_content', 'reasoning'] as const) {
      if (rawDelta?.[field] != null && typeof rawDelta[field] !== 'string') {
        failClosed('LLM stream contained invalid text data; partial content was not accepted.');
      }
    }
    if (rawDelta?.tool_calls != null && !Array.isArray(rawDelta.tool_calls)) {
      failClosed('LLM stream contained invalid tool-call data; partial content was not accepted.');
    }
    const deltaToolCalls = Array.isArray(rawDelta?.tool_calls) ? rawDelta.tool_calls : undefined;
    for (const rawToolCall of deltaToolCalls ?? []) {
      if (!isRecord(rawToolCall)
        || (rawToolCall.index != null && (!isTokenCount(rawToolCall.index)))
        || (rawToolCall.id != null && typeof rawToolCall.id !== 'string')
        || (rawToolCall.function != null && !isRecord(rawToolCall.function))
        || (isRecord(rawToolCall.function)
          && rawToolCall.function.name != null
          && typeof rawToolCall.function.name !== 'string')
        || (isRecord(rawToolCall.function)
          && rawToolCall.function.arguments != null
          && typeof rawToolCall.function.arguments !== 'string')) {
        failClosed('LLM stream contained an invalid tool call; partial content was not accepted.');
      }
    }

    const contentDelta = typeof rawDelta?.content === 'string' ? rawDelta.content : undefined;
    const reasoning = typeof rawDelta?.reasoning_content === 'string'
      ? rawDelta.reasoning_content
      : (typeof rawDelta?.reasoning === 'string' ? rawDelta.reasoning : undefined);
    const hasSemanticDelta = Boolean(reasoning || contentDelta || deltaToolCalls?.length);

    if (finishReason !== null) {
      if (nextFinishReason !== null && nextFinishReason !== finishReason) {
        failClosed('LLM stream reported contradictory finish reasons; partial content was not accepted.');
      }
      if (hasSemanticDelta) {
        failClosed('LLM stream emitted semantic data after finish_reason; partial content was not accepted.');
      }
    }

    let stagedToolCalls: Map<number, StreamedToolCall> | undefined;
    let stagedIdToSyntheticIndex: Map<string, number> | undefined;
    let stagedNextSyntheticIndex = nextSyntheticIndex;
    let stagedLastSlot = lastSlot;
    if (deltaToolCalls) {
      stagedToolCalls = new Map(Array.from(toolCalls, ([index, call]) => [
        index,
        { ...call, function: { ...call.function } },
      ]));
      stagedIdToSyntheticIndex = new Map(idToSyntheticIndex);
      for (const rawToolCall of deltaToolCalls) {
        const tc = rawToolCall as {
          index?: number;
          id?: string;
          function?: { name?: string; arguments?: string };
        };
        const explicitIndex = typeof tc.index === 'number' ? tc.index : undefined;
        const knownIndex = tc.id ? stagedIdToSyntheticIndex.get(tc.id) : undefined;
        let idx = stagedLastSlot;
        if (knownIndex !== undefined) {
          if (explicitIndex === undefined || explicitIndex === knownIndex) {
            idx = knownIndex;
          } else if (knownIndex < 0 && !stagedToolCalls.has(explicitIndex)) {
            // Some compatible providers add an explicit index only after first
            // identifying the call by ID. Move the synthetic slot without
            // changing its insertion order or losing already assembled data.
            stagedToolCalls = new Map(Array.from(stagedToolCalls, ([slot, call]) => (
              slot === knownIndex ? [explicitIndex, call] : [slot, call]
            )));
            for (const [id, slot] of stagedIdToSyntheticIndex) {
              if (slot === knownIndex) stagedIdToSyntheticIndex.set(id, explicitIndex);
            }
            if (stagedLastSlot === knownIndex) stagedLastSlot = explicitIndex;
            idx = explicitIndex;
          } else {
            failClosed('LLM stream contained conflicting tool-call identity; partial content was not accepted.');
          }
        } else if (explicitIndex !== undefined) {
          idx = explicitIndex;
          const existing = stagedToolCalls.get(idx);
          if (tc.id && existing?.id && existing.id !== tc.id) {
            failClosed('LLM stream contained conflicting tool-call identity; partial content was not accepted.');
          }
          if (tc.id) stagedIdToSyntheticIndex.set(tc.id, idx);
        } else if (tc.id) {
          if (stagedToolCalls.size >= MAX_STREAMED_TOOL_CALLS) {
            failClosed('LLM stream exceeded the tool-call limit; partial content was not accepted.');
          }
          while (stagedToolCalls.has(stagedNextSyntheticIndex)) stagedNextSyntheticIndex -= 1;
          idx = stagedNextSyntheticIndex--;
          stagedIdToSyntheticIndex.set(tc.id, idx);
        } else {
          idx = stagedLastSlot;
        }
        stagedLastSlot = idx;
        if (!stagedToolCalls.has(idx)) {
          if (stagedToolCalls.size >= MAX_STREAMED_TOOL_CALLS) {
            failClosed('LLM stream exceeded the tool-call limit; partial content was not accepted.');
          }
          stagedToolCalls.set(idx, {
            id: tc.id ?? '',
            type: 'function' as const,
            function: { name: tc.function?.name ?? '', arguments: '' },
          });
        }
        const existing = stagedToolCalls.get(idx)!;
        if (tc.id && existing.id && existing.id !== tc.id) {
          failClosed('LLM stream contained conflicting tool-call identity; partial content was not accepted.');
        }
        if (tc.function?.name
          && existing.function.name
          && existing.function.name !== tc.function.name) {
          failClosed('LLM stream contained conflicting tool-call identity; partial content was not accepted.');
        }
        if (tc.id) existing.id = tc.id;
        if (tc.function?.name) existing.function.name = tc.function.name;
        if (tc.function?.arguments) existing.function.arguments += tc.function.arguments;
      }
    }

    inputTokens = nextInputTokens;
    outputTokens = nextOutputTokens;

    if (reasoning || contentDelta || deltaToolCalls?.length) onActivity?.();
    if (reasoning) onReasoningActivity?.();

    if (contentDelta) {
      content += contentDelta;
      onToken?.(contentDelta);
    }

    if (stagedToolCalls && stagedIdToSyntheticIndex) {
      toolCalls.clear();
      for (const [index, call] of stagedToolCalls) toolCalls.set(index, call);
      idToSyntheticIndex.clear();
      for (const [id, index] of stagedIdToSyntheticIndex) idToSyntheticIndex.set(id, index);
      nextSyntheticIndex = stagedNextSyntheticIndex;
      lastSlot = stagedLastSlot;
    }

    if (finishReason === null && nextFinishReason !== null) {
      finishReason = nextFinishReason;
    }
  };

  const processLine = (line: string): void => {
    if (line === '') {
      if (eventDataLines.length > 0) {
        const payload = eventDataLines.join('\n');
        eventDataLines = [];
        eventDataChars = 0;
        processPayload(payload);
      }
      return;
    }
    if (line.startsWith(':')) return;

    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'data') {
      const nextLength = eventDataChars + value.length + (eventDataLines.length > 0 ? 1 : 0);
      if (nextLength > MAX_PENDING_SSE_EVENT_CHARS
        || eventDataLines.length >= MAX_PENDING_SSE_EVENT_LINES) {
        failClosed('LLM stream exceeded the pending SSE event limit; partial content was not accepted.');
      }
      eventDataLines.push(value);
      eventDataChars = nextLength;
    }
  };

  const feedText = (text: string): void => {
    for (const character of text) {
      if (stopReading) return;
      if (pendingCarriageReturn) {
        pendingCarriageReturn = false;
        processLine(lineBuffer);
        lineBuffer = '';
        if (character === '\n') continue;
      }
      if (character === '\r') {
        pendingCarriageReturn = true;
      } else if (character === '\n') {
        processLine(lineBuffer);
        lineBuffer = '';
      } else {
        lineBuffer += character;
        if (lineBuffer.length > MAX_PENDING_SSE_EVENT_CHARS) {
          failClosed('LLM stream exceeded the pending SSE line limit; partial content was not accepted.');
        }
      }
    }
  };

  const feedDecodedText = (text: string): void => {
    totalDecodedChars += text.length;
    if (totalDecodedChars > MAX_TOTAL_SSE_CHARS) {
      failClosed('LLM stream exceeded the total SSE size limit; partial content was not accepted.');
    }
    feedText(text);
  };

  for (;;) {
    let readResult: ReadableStreamReadResult<Uint8Array>;
    try {
      readResult = await reader.read();
    } catch {
      throw incompleteStreamError(
        inputTokens,
        outputTokens,
        toolCalls.size > 0 ? Array.from(toolCalls.values()) : undefined,
      );
    }
    const { done, value } = readResult;
    if (done) {
      feedDecodedText(decoder.decode());
      if (pendingCarriageReturn) {
        pendingCarriageReturn = false;
        processLine(lineBuffer);
        lineBuffer = '';
      }
      break;
    }

    feedDecodedText(decoder.decode(value, { stream: true }));
    if (stopReading) break;
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
