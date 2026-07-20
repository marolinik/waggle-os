/**
 * OpenAI-compatible chat completions adapter.
 *
 * Works with any provider that exposes the standard
 * POST /v1/chat/completions endpoint (OpenAI, Groq, Together,
 * Mistral, LiteLLM proxy, etc.).
 */

import type { ResolvedModel } from '../model-router.js';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatResponse {
  content: string;
  model: string;
  usage: { input_tokens: number; output_tokens: number };
}

export interface CompletionUsage {
  inputTokens: number;
  outputTokens: number;
  totalCostUsd: number;
}

export interface ParsedOpenAiTextCompletion {
  content: string;
  model: string;
  usage: CompletionUsage;
}

export type IncompleteCompletionError = Error & {
  code: 'INCOMPLETE_COMPLETION';
  usage: CompletionUsage;
};

function incompleteCompletionError(
  reason: string,
  usage: IncompleteCompletionError['usage'],
): IncompleteCompletionError {
  const error = new Error(
    `OpenAI-compatible completion was not complete (${reason}); partial content was rejected.`,
  ) as IncompleteCompletionError;
  error.name = 'IncompleteCompletionError';
  error.code = 'INCOMPLETE_COMPLETION';
  error.usage = usage;
  return error;
}

export function isIncompleteCompletionError(error: unknown): error is IncompleteCompletionError {
  return typeof error === 'object'
    && error !== null
    && (error as { code?: unknown }).code === 'INCOMPLETE_COMPLETION';
}

function usageNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}

/**
 * Validate a non-streaming OpenAI-compatible text completion.
 *
 * HTTP 200 is not sufficient evidence of a complete answer: only an explicit
 * `finish_reason: "stop"` with non-blank text and no tool calls is accepted.
 * Reported usage is attached to integrity failures so callers can account for
 * paid partial responses without replaying them.
 */
export function parseOpenAiTextCompletion(rawData: unknown): ParsedOpenAiTextCompletion {
  if (typeof rawData !== 'object' || rawData === null) {
    throw incompleteCompletionError('invalid response body', {
      inputTokens: 0,
      outputTokens: 0,
      totalCostUsd: 0,
    });
  }

  const data = rawData as {
    error?: { message?: unknown } | string;
    choices?: Array<{
      finish_reason?: string | null;
      message?: {
        content?: string | null;
        refusal?: string | null;
        tool_calls?: unknown;
      };
    }>;
    model?: unknown;
    usage?: {
      prompt_tokens?: unknown;
      completion_tokens?: unknown;
      total_cost?: unknown;
    };
  };
  const usage: CompletionUsage = {
    inputTokens: usageNumber(data.usage?.prompt_tokens),
    outputTokens: usageNumber(data.usage?.completion_tokens),
    totalCostUsd: usageNumber(data.usage?.total_cost),
  };

  if (data.error) {
    const detail = typeof data.error === 'string'
      ? data.error
      : typeof data.error.message === 'string'
        ? data.error.message
        : 'upstream error payload';
    throw incompleteCompletionError(detail, usage);
  }

  const choice = data.choices?.[0];
  if (!choice) {
    throw incompleteCompletionError('missing completion choice', usage);
  }
  if (choice.finish_reason !== 'stop') {
    const reason = choice.finish_reason ?? 'missing';
    throw incompleteCompletionError(`finish_reason=${reason}`, usage);
  }
  const toolCalls = choice.message?.tool_calls;
  if (toolCalls !== undefined && toolCalls !== null
    && (!Array.isArray(toolCalls) || toolCalls.length > 0)) {
    throw incompleteCompletionError('finish_reason=stop with tool_calls', usage);
  }
  if (typeof choice.message?.refusal === 'string' && choice.message.refusal.trim().length > 0) {
    throw incompleteCompletionError('assistant refusal', usage);
  }
  const content = choice.message?.content;
  if (typeof content !== 'string' || content.trim().length === 0) {
    throw incompleteCompletionError('missing assistant text', usage);
  }

  return {
    content,
    model: typeof data.model === 'string' ? data.model : '',
    usage,
  };
}

/** Per-request wall-clock timeout before the request is aborted. */
const DEFAULT_TIMEOUT_MS = 60_000;
/** Additional attempts after the first on a transient failure. */
const DEFAULT_MAX_RETRIES = 3;
/** Cap on exponential backoff between attempts. */
const BACKOFF_CAP_MS = 30_000;

/** Statuses worth retrying: rate limit + gateway/transient server errors. */
function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

/** Exponential backoff (1s, 2s, 4s, …) capped at BACKOFF_CAP_MS. */
function backoffMs(attempt: number): number {
  return Math.min(1000 * 2 ** (attempt - 1), BACKOFF_CAP_MS);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface OpenAiChatOptions {
  /** Per-request timeout in ms (default 60s). Aborts a hung upstream. */
  timeoutMs?: number;
  /** Extra retry attempts on 5xx/429/network failure (default 3). */
  maxRetries?: number;
  /** Injectable fetch (tests). Defaults to globalThis.fetch. */
  fetchImpl?: typeof globalThis.fetch;
  /** Injectable backoff sleep (tests) — lets a test skip real delays. */
  sleepImpl?: (ms: number) => Promise<void>;
}

/**
 * Send a chat completion request to an OpenAI-compatible API.
 *
 * Wraps the request in an AbortSignal timeout (a hung upstream no longer wedges
 * the caller forever) and retries transient failures (429 / 5xx / network) with
 * exponential backoff, mirroring the agent-loop retry policy. Non-transient
 * errors (4xx other than 429, malformed body) throw immediately.
 *
 * @param resolved  - Provider details from ModelRouter.resolve()
 * @param messages  - Conversation history
 * @param systemPrompt - Optional system prompt (prepended as a system message)
 * @param options   - Timeout / retry / injection overrides
 */
export async function openaiChat(
  resolved: ResolvedModel,
  messages: ChatMessage[],
  systemPrompt?: string,
  options: OpenAiChatOptions = {},
): Promise<ChatResponse> {
  const baseUrl = resolved.baseUrl ?? 'https://api.openai.com/v1';
  const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const doSleep = options.sleepImpl ?? sleep;

  const allMessages: ChatMessage[] = [];
  if (systemPrompt) {
    allMessages.push({ role: 'system', content: systemPrompt });
  }
  allMessages.push(...messages);

  const requestInit: RequestInit = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${resolved.apiKey}`,
    },
    body: JSON.stringify({
      model: resolved.model,
      messages: allMessages,
    }),
  };

  let attempt = 0;
  // Loop bound: 1 initial attempt + maxRetries retries.
  for (;;) {
    let res: Response;
    try {
      res = await fetchImpl(url, { ...requestInit, signal: AbortSignal.timeout(timeoutMs) });
    } catch (err: unknown) {
      // Network-level failure or timeout abort — retry with backoff.
      if (attempt < maxRetries) {
        attempt++;
        await doSleep(backoffMs(attempt));
        continue;
      }
      const detail = err instanceof Error ? err.message : String(err);
      throw new Error(
        `OpenAI-compatible request failed after ${maxRetries + 1} attempts: ${detail}`,
      );
    }

    if (!res.ok) {
      if (isRetryableStatus(res.status) && attempt < maxRetries) {
        attempt++;
        await res.text().catch(() => ''); // drain body to free the socket
        await doSleep(backoffMs(attempt));
        continue;
      }
      const body = await res.text().catch(() => '');
      throw new Error(
        `OpenAI-compatible API error ${res.status}: ${res.statusText}${body ? ` — ${body}` : ''}`,
      );
    }

    let rawData: unknown;
    try {
      rawData = await res.json();
    } catch {
      throw incompleteCompletionError('invalid JSON response body', {
        inputTokens: 0,
        outputTokens: 0,
        totalCostUsd: 0,
      });
    }
    const parsed = parseOpenAiTextCompletion(rawData);

    return {
      content: parsed.content,
      model: parsed.model || resolved.model,
      usage: {
        input_tokens: parsed.usage.inputTokens,
        output_tokens: parsed.usage.outputTokens,
      },
    };
  }
}
