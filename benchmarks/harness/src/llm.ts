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
  /**
   * Sprint 11 Task B1 (2026-04-22): captured chain-of-thought when the
   * provider emits it under `thinking=on`. Parsed from two canonical shapes:
   *   - OpenRouter unified:  `body.choices[0].message.reasoning`
   *   - DashScope native:    `body.choices[0].message.reasoning_content`
   * `undefined` when thinking is off or the provider omits the field.
   * Per H-AUDIT-1 §2.4 exclusion rules, NEVER persisted to frames / memory /
   * judge inputs — captured at the transport layer for JSONL + B1 smoke logs
   * only.
   */
  reasoningContent?: string;
}

export interface LlmCallInput {
  model: ModelSpec;
  systemPrompt: string;
  userPrompt: string;
  /** Abort the fetch after N ms. Default 30_000. */
  timeoutMs?: number;
  /**
   * Sprint 11 Task B1 (2026-04-22): enable provider reasoning/thinking mode.
   * Takes precedence over `model.stage2Config?.thinking`. Request body gets
   * `reasoning: { enabled: true }` (OpenRouter unified shape) when true.
   */
  thinking?: boolean;
  /**
   * Sprint 11 Task B1 (2026-04-22): override request `max_tokens`. Takes
   * precedence over `model.stage2Config?.maxTokens`. Default (no override)
   * keeps the pre-existing 600 value — back-compat for non-Stage-2 cells.
   */
  maxTokensOverride?: number;
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
    // Sprint 11 B1: thinking=on on Stage 2 config pushes avg latency up to
    // ~18s (Task 1.1 measured). Widen default timeout to 180s so a single
    // reasoning-heavy call doesn't abort mid-response. Callers can still
    // pass a tighter timeoutMs when needed.
    const timer = setTimeout(() => controller.abort(), input.timeoutMs ?? 180_000);
    // Resolve thinking + max_tokens: per-call input > model.stage2Config > defaults.
    const stage2 = input.model.stage2Config;
    const thinkingEnabled = input.thinking ?? stage2?.thinking ?? false;
    const maxTokens = input.maxTokensOverride ?? stage2?.maxTokens ?? 600;
    const requestBody: Record<string, unknown> = {
      model: input.model.litellmModel,
      messages: [
        { role: 'system', content: input.systemPrompt },
        { role: 'user', content: input.userPrompt },
      ],
      max_tokens: maxTokens,
      temperature: 0.0,
    };
    if (thinkingEnabled) {
      // OpenRouter unified reasoning API — LiteLLM with drop_params=true will
      // pass this through to OpenRouter unchanged. DashScope-intl native
      // accepts a different shape (enable_thinking); LiteLLM normalizes
      // either way when routed through its provider adapter. If the provider
      // is one that doesn't support reasoning, drop_params strips silently.
      requestBody.reasoning = { enabled: true };
    }
    try {
      const res = await fetch(`${this.url.replace(/\/$/, '')}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        signal: controller.signal,
        body: JSON.stringify(requestBody),
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
        choices?: Array<{
          message?: {
            content?: string;
            reasoning?: string;           // OpenRouter unified shape
            reasoning_content?: string;   // DashScope native shape
          };
        }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      const msg = body.choices?.[0]?.message;
      const text = msg?.content ?? '';
      // Sprint 11 B1: capture reasoning surface if present. Prefer OpenRouter's
      // unified `reasoning` (the route via `qwen3.6-35b-a3b-via-openrouter`
      // emits this); fall back to DashScope's `reasoning_content` when the
      // route is direct-DashScope. `undefined` when thinking off or provider
      // drops the field.
      const reasoningContent = msg?.reasoning ?? msg?.reasoning_content;
      const inputTokens = body.usage?.prompt_tokens ?? approximateTokenCount(input.systemPrompt + input.userPrompt);
      const outputTokens = body.usage?.completion_tokens ?? approximateTokenCount(text);
      const costUsd =
        (inputTokens / 1_000_000) * input.model.pricePerMillionInput +
        (outputTokens / 1_000_000) * input.model.pricePerMillionOutput;
      return {
        text,
        inputTokens,
        outputTokens,
        latencyMs,
        costUsd,
        failureMode: null,
        ...(reasoningContent !== undefined && { reasoningContent }),
      };
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
