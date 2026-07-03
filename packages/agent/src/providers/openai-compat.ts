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

    const data = (await res.json()) as {
      choices: Array<{ message: { content: string } }>;
      model: string;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };

    const choice = data.choices?.[0];
    if (!choice) {
      throw new Error('No choices returned from API');
    }

    return {
      content: choice.message.content,
      model: data.model,
      usage: {
        input_tokens: data.usage?.prompt_tokens ?? 0,
        output_tokens: data.usage?.completion_tokens ?? 0,
      },
    };
  }
}
