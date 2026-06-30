/**
 * Direct litellm /chat/completions client for the τ² bridge (Approach A+).
 *
 * The bridge owns an OpenAI-wire per-session message state and issues ONE chat
 * completion per τ² turn — it does NOT run @waggle/agent's runAgentLoop (whose
 * loop/executor/gates are owned by τ² in this cell). This keeps the only real
 * advantage of the loop we still want — the production 429/5xx/network retry —
 * without touching the shared core (packages/agent/src/agent-loop.ts is UNCHANGED).
 *
 * Everything is injectable (fetchFn) so the bridge is hermetically testable.
 */

/** An OpenAI-wire chat message (system/user/assistant/tool). */
export interface WireMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
}

/** An OpenAI tool definition (function wrapper). */
export interface OpenAITool {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

/** Parsed result of a single chat completion. `toolCalls` carries the verbatim
 *  JSON-STRING arguments the model emitted (re-sendable as-is on the wire). */
export interface ChatCompletionResult {
  content: string | null;
  toolCalls: Array<{ id: string; fn: { name: string; arguments: string } }>;
  usage: { inputTokens: number; outputTokens: number };
}

export interface CallChatCompletionArgs {
  url: string;
  apiKey: string;
  model: string;
  messages: WireMessage[];
  tools: OpenAITool[];
  tool_choice?: 'auto' | 'none' | 'required';
  signal?: AbortSignal;
  /** Override retry backoffs (ms) — tests pass [] to disable waiting. */
  retryDelaysMs?: number[];
}

const DEFAULT_RETRY_DELAYS_MS = [200, 600, 1800];

/**
 * Normalize τ² domain tools to OpenAI function tools. Mirrors
 * agent-loop.ts:224-235 — `parameters.type:'object'` is REQUIRED by Anthropic
 * via litellm; we splat the τ² parameters over the {type:'object',properties:{}}
 * base so a partial schema still translates.
 */
export function normalizeTools(
  tools: Array<{ name: string; description: string; parameters: Record<string, unknown> }>,
): OpenAITool[] {
  return tools.map(t => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: { type: 'object' as const, properties: {}, ...t.parameters },
    },
  }));
}

interface RawChatCompletion {
  choices?: Array<{
    message: {
      content: string | null;
      tool_calls?: Array<{ id: string; type?: string; function: { name: string; arguments: string } }>;
    };
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

/**
 * POST one chat completion to litellm and parse choices[0].message.
 *
 * Minimal production-fidelity retry (recovers runAgentLoop's intent without
 * editing core): retry on HTTP 429/5xx and network errors up to 3 attempts with
 * exponential backoff. A genuine client abort re-throws immediately.
 */
export async function callChatCompletion(
  fetchFn: typeof fetch,
  args: CallChatCompletionArgs,
): Promise<ChatCompletionResult> {
  const { url, apiKey, model, messages, tools, tool_choice, signal } = args;
  const delays = args.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;

  const body: Record<string, unknown> = { model, messages };
  if (tools.length > 0) {
    body.tools = tools;
    body.tool_choice = tool_choice ?? 'auto';
  }
  const payload = JSON.stringify(body);

  let attempt = 0;
  // attempts = 1 initial + delays.length retries
  for (;;) {
    let response: Response;
    try {
      response = await fetchFn(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: payload,
        signal,
      });
    } catch (netErr) {
      if (signal?.aborted) throw netErr;
      if (attempt >= delays.length) {
        throw new Error(`litellm network error after ${attempt + 1} attempts: ${netErr instanceof Error ? netErr.message : String(netErr)}`);
      }
      await sleep(delays[attempt++]);
      continue;
    }

    if (!response.ok) {
      const retriable = response.status === 429 || response.status >= 500;
      if (retriable && attempt < delays.length) {
        await sleep(delays[attempt++]);
        continue;
      }
      const text = await safeText(response);
      throw new Error(`litellm ${response.status}: ${text.slice(0, 300)}`);
    }

    const data = (await response.json()) as RawChatCompletion;
    if (!data.choices || data.choices.length === 0) {
      throw new Error(`litellm returned no choices: ${JSON.stringify(data).slice(0, 200)}`);
    }
    const m = data.choices[0].message;
    return {
      content: m.content ?? null,
      toolCalls: (m.tool_calls ?? []).map(tc => ({ id: tc.id, fn: { name: tc.function.name, arguments: tc.function.arguments } })),
      usage: { inputTokens: data.usage?.prompt_tokens ?? 0, outputTokens: data.usage?.completion_tokens ?? 0 },
    };
  }
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise(r => setTimeout(r, ms));
}

async function safeText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return '<unreadable body>';
  }
}
