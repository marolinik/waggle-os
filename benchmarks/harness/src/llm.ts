/**
 * LLM client — routes through LiteLLM when configured, stubs deterministically
 * when dryRun is true.
 *
 * The client deliberately accepts no tools. Each cell owns its own
 * prompt-assembly logic (memory injection vs. not, evolved prompt vs. not)
 * and hands the assembled prompt to this client as a single user turn. That
 * keeps the cell logic unit-testable and the LLM client a thin transport.
 */

import type { ModelSpec } from './types.js';

export interface LlmCallResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  /** Dollar cost of this single call, computed from model pricing + tokens. */
  costUsd: number;
  /** null = OK, otherwise a short classification of the failure. */
  failureMode: string | null;
}

export interface LlmCallInput {
  model: ModelSpec;
  systemPrompt: string;
  userPrompt: string;
  /** Abort the fetch after N ms. Default 30_000. */
  timeoutMs?: number;
}

export interface LlmClient {
  call(input: LlmCallInput): Promise<LlmCallResult>;
}

export function createLlmClient(opts: {
  dryRun: boolean;
  litellmUrl: string;
  litellmApiKey: string;
}): LlmClient {
  if (opts.dryRun) return new DryRunClient();
  return new LiteLlmClient(opts.litellmUrl, opts.litellmApiKey);
}

// ── Dry-run (deterministic echo) ───────────────────────────────────────────

class DryRunClient implements LlmClient {
  async call(input: LlmCallInput): Promise<LlmCallResult> {
    // Return the expected span from the user prompt if present, else echo.
    // The synthetic dataset embeds the answer in the context, so a smart
    // "model" can extract it — our stub uses a trivial rule that's enough
    // for the harness scaffold to verify end-to-end flow including accuracy
    // scoring against the synthetic set.
    const match = input.userPrompt.match(/Context:\s*([^\n]+)/);
    const firstLine = match ? match[1].trim() : input.userPrompt.slice(0, 120);
    const text = `DRY_RUN: ${firstLine}`;
    const inputTokens = approximateTokenCount(input.systemPrompt) + approximateTokenCount(input.userPrompt);
    const outputTokens = approximateTokenCount(text);
    // Even in dry-run we record a "cost" so downstream aggregators
    // exercise the cost path. Price comes from the model spec — in dry-run
    // it's book-value, not wire-actual.
    const costUsd =
      (inputTokens / 1_000_000) * input.model.pricePerMillionInput +
      (outputTokens / 1_000_000) * input.model.pricePerMillionOutput;
    return {
      text,
      inputTokens,
      outputTokens,
      latencyMs: 1, // dry-run is instant
      costUsd,
      failureMode: null,
    };
  }
}

// ── LiteLLM proxy ──────────────────────────────────────────────────────────

class LiteLlmClient implements LlmClient {
  constructor(private url: string, private apiKey: string) {}

  async call(input: LlmCallInput): Promise<LlmCallResult> {
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), input.timeoutMs ?? 30_000);
    try {
      const res = await fetch(`${this.url.replace(/\/$/, '')}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: input.model.litellmModel,
          messages: [
            { role: 'system', content: input.systemPrompt },
            { role: 'user', content: input.userPrompt },
          ],
          max_tokens: 600,
          temperature: 0.0,
        }),
      });
      const latencyMs = Date.now() - started;
      if (!res.ok) {
        return {
          text: '',
          inputTokens: 0,
          outputTokens: 0,
          latencyMs,
          costUsd: 0,
          failureMode: `http_${res.status}`,
        };
      }
      const body = await res.json() as {
        choices?: Array<{ message?: { content?: string } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      const text = body.choices?.[0]?.message?.content ?? '';
      const inputTokens = body.usage?.prompt_tokens ?? approximateTokenCount(input.systemPrompt + input.userPrompt);
      const outputTokens = body.usage?.completion_tokens ?? approximateTokenCount(text);
      const costUsd =
        (inputTokens / 1_000_000) * input.model.pricePerMillionInput +
        (outputTokens / 1_000_000) * input.model.pricePerMillionOutput;
      return { text, inputTokens, outputTokens, latencyMs, costUsd, failureMode: null };
    } catch (err) {
      const latencyMs = Date.now() - started;
      const name = (err as Error).name;
      const failureMode = name === 'AbortError' ? 'timeout' : `fetch_error_${name}`;
      return {
        text: '',
        inputTokens: 0,
        outputTokens: 0,
        latencyMs,
        costUsd: 0,
        failureMode,
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** Rough token estimate (chars / 4). Used when the LLM response doesn't
 *  include usage info (e.g. in dry-run or certain proxy setups). */
export function approximateTokenCount(s: string): number {
  return Math.max(1, Math.ceil(s.length / 4));
}
