/**
 * Judge LLM client — thin wrapper around LiteLLM chat completions that
 * implements the `LlmClient` interface the failure-mode-judge module
 * expects (`complete(prompt: string): Promise<string>`).
 *
 * Sprint 9 Task 2. Two retries with exponential backoff (1s, 3s) per
 * brief §Failure-handling. Parse-level retry (the reminder-and-retry
 * for malformed JSON) is handled INSIDE the judge module itself —
 * this client only retries transport-level failures (HTTP non-2xx,
 * fetch errors, timeouts). Keeping the two concerns separated stops
 * a single flaky network hop from eating both retry budgets at once.
 *
 * Cost tracking: the underlying LiteLLM response carries `usage.*` and
 * sometimes `cost` on the message envelope; the caller that constructs
 * this client passes a cost table so the runner can aggregate per-cell
 * judge spend in the Task-3 rollup.
 */

import type { LlmClient } from './judge-types.js';
export type { LlmClient } from './judge-types.js';

export interface JudgeClientCostEntry {
  /** ISO-8601 timestamp of the call. */
  timestamp: string;
  /** Model id used for the judge call. */
  model: string;
  promptTokens: number;
  completionTokens: number;
  usd: number;
  latencyMs: number;
  /** `true` when the call succeeded, `false` when all retries exhausted. */
  ok: boolean;
}

export interface JudgeLlmClientConfig {
  litellmUrl: string;
  litellmApiKey: string;
  model: string;
  /** USD per 1M tokens — [input, output]. Defaults to Sonnet tier rates. */
  pricePerMillionInput?: number;
  pricePerMillionOutput?: number;
  /** Called once per completed attempt (success or final failure). The
   *  runner's cost aggregator reads this to populate the Task-3 cost
   *  summary in aggregate.ts. Optional — tests can omit. */
  onCall?: (entry: JudgeClientCostEntry) => void;
  /** Injection seam for tests: replaces `fetch` so unit tests never
   *  reach the network. Production path leaves this undefined and uses
   *  the global fetch. */
  fetchImpl?: typeof fetch;
  /** Abort individual attempt after N ms. Default 30_000. */
  timeoutMs?: number;
  /** Override the default backoff schedule ([1000, 3000] per brief).
   *  Exposed so tests can collapse sleeps to near-zero and stay fast. */
  backoffMs?: number[];
}

/** Default Sonnet-4.6 pricing (current 2026-04 list rate). */
const DEFAULT_PRICE_PER_MILLION_INPUT = 3.0;
const DEFAULT_PRICE_PER_MILLION_OUTPUT = 15.0;
const DEFAULT_BACKOFF_MS = [1000, 3000];

export function createJudgeLlmClient(config: JudgeLlmClientConfig): LlmClient {
  const url = config.litellmUrl.replace(/\/$/, '');
  const priceIn = config.pricePerMillionInput ?? DEFAULT_PRICE_PER_MILLION_INPUT;
  const priceOut = config.pricePerMillionOutput ?? DEFAULT_PRICE_PER_MILLION_OUTPUT;
  const fetchFn = config.fetchImpl ?? fetch;
  const timeoutMs = config.timeoutMs ?? 30_000;
  const backoff = config.backoffMs ?? DEFAULT_BACKOFF_MS;

  async function sleep(ms: number): Promise<void> {
    return new Promise(resolve => { setTimeout(resolve, ms); });
  }

  async function attempt(prompt: string): Promise<{
    text: string;
    promptTokens: number;
    completionTokens: number;
    latencyMs: number;
  }> {
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchFn(`${url}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.litellmApiKey}`,
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: config.model,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 1024,
          temperature: 0.0,
        }),
      });
      const latencyMs = Date.now() - started;
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`judge-client ${config.model} HTTP ${res.status}: ${body.slice(0, 240)}`);
      }
      const body = (await res.json()) as {
        choices?: Array<{ message?: { content?: string; reasoning_content?: string } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      const message = body.choices?.[0]?.message ?? {};
      const content = typeof message.content === 'string' ? message.content : '';
      // Thinking-mode providers occasionally return empty `content` with
      // the parsed JSON hiding in `reasoning_content`. Fall back so the
      // judge module's JSON extractor still has a chance to find the
      // payload — its `extractJsonBody` strips prose and fence wrappers.
      const reasoning = typeof message.reasoning_content === 'string' ? message.reasoning_content : '';
      const text = content || reasoning;
      return {
        text,
        promptTokens: body.usage?.prompt_tokens ?? 0,
        completionTokens: body.usage?.completion_tokens ?? 0,
        latencyMs,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async complete(prompt: string): Promise<string> {
      // Up to `backoff.length + 1` total attempts: one initial + len(backoff) retries.
      const totalAttempts = backoff.length + 1;
      let lastErr: unknown = null;
      for (let i = 0; i < totalAttempts; i++) {
        try {
          const result = await attempt(prompt);
          config.onCall?.({
            timestamp: new Date().toISOString(),
            model: config.model,
            promptTokens: result.promptTokens,
            completionTokens: result.completionTokens,
            usd:
              (result.promptTokens / 1_000_000) * priceIn +
              (result.completionTokens / 1_000_000) * priceOut,
            latencyMs: result.latencyMs,
            ok: true,
          });
          return result.text;
        } catch (err) {
          lastErr = err;
          if (i < backoff.length) {
            await sleep(backoff[i]);
          }
        }
      }
      // All attempts exhausted — surface one cost log entry marked failed
      // so the aggregator can account for consumed budget even on total
      // loss, then throw for the caller's retry-vs-skip decision.
      config.onCall?.({
        timestamp: new Date().toISOString(),
        model: config.model,
        promptTokens: 0,
        completionTokens: 0,
        usd: 0,
        latencyMs: 0,
        ok: false,
      });
      throw lastErr instanceof Error
        ? lastErr
        : new Error(`judge-client ${config.model} failed after ${totalAttempts} attempts`);
    },
  };
}
