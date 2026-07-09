/**
 * Minimal direct-to-OpenAI client for the BEAM answerer + graded judge.
 *
 * Why not the existing `llm.ts` LiteLlmClient? Two reasons:
 *   1. The official BEAM protocol (mem0) uses gpt-4o for both answerer and
 *      judge, driven directly via OPENAI_API_KEY — the team's instruction for
 *      this phase. This client reads that key from waggle-os/.env using the
 *      same "manual .env load, no dotenv dependency" convention already used in
 *      gepa-phase-5/scripts/cost-probe.ts and vitest.setup.ts.
 *   2. The graded judge needs JSON-mode structured output
 *      (`response_format: {type:'json_object'}`), which the LiteLLM transport
 *      in llm.ts does not expose.
 *
 * It implements the `BeamLlm` interface from beam-nugget-judge.ts, so the judge
 * and answerer are transport-agnostic and could later be pointed at the LiteLLM
 * proxy or a different provider without touching the scoring logic.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { BeamLlm, BeamLlmResult } from './beam-nugget-judge.js';

// ── .env loading (manual; mirrors cost-probe.ts) ────────────────────────────

/**
 * Load KEY=VALUE pairs from a `.env` file into process.env without clobbering
 * values already present (CLI/real env wins over the file). Searches the given
 * path, then walks up from cwd looking for a `.env`. Returns the resolved path
 * used, or null if none was found.
 */
export function loadDotEnv(explicitPath?: string): string | null {
  const candidates: string[] = [];
  if (explicitPath) candidates.push(explicitPath);
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    candidates.push(path.join(dir, '.env'));
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  for (const p of candidates) {
    if (!fs.existsSync(p)) continue;
    const content = fs.readFileSync(p, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      // Strip surrounding quotes.
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!(key in process.env) || !process.env[key]) process.env[key] = val;
    }
    return p;
  }
  return null;
}

// ── Pricing (USD per 1M tokens) ─────────────────────────────────────────────

export interface ModelPricing {
  inputPerMillion: number;
  outputPerMillion: number;
}

/** Default pricing table. gpt-4o = the mem0 BEAM README default; gpt-5 = the
 *  model behind mem0's published 0.641 (results/platform metadata). */
export const OPENAI_PRICING: Record<string, ModelPricing> = {
  'gpt-4o': { inputPerMillion: 2.5, outputPerMillion: 10.0 },
  'gpt-4o-mini': { inputPerMillion: 0.15, outputPerMillion: 0.6 },
  'gpt-5': { inputPerMillion: 1.25, outputPerMillion: 10.0 },
  'gpt-5-mini': { inputPerMillion: 0.25, outputPerMillion: 2.0 },
  'gpt-5-nano': { inputPerMillion: 0.05, outputPerMillion: 0.4 },
};

/** gpt-5 / o-series reasoning models reject `max_tokens` + non-default
 *  temperature, and spend completion budget on hidden reasoning tokens. */
function isReasoningModel(model: string): boolean {
  return /^(gpt-5|o\d)/.test(model.toLowerCase());
}

// ── Client ──────────────────────────────────────────────────────────────────

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_TIMEOUT_MS = 60_000;

export interface BeamOpenAiClientOptions {
  model: string;
  apiKey: string;
  baseUrl?: string;
  pricing?: ModelPricing;
  timeoutMs?: number;
  maxRetries?: number;
}

export class BeamOpenAiClient implements BeamLlm {
  private readonly model: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly pricing: ModelPricing;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;

  constructor(opts: BeamOpenAiClientOptions) {
    this.model = opts.model;
    this.apiKey = opts.apiKey;
    this.baseUrl = (opts.baseUrl ?? 'https://api.openai.com/v1').replace(/\/$/, '');
    this.pricing = opts.pricing ?? OPENAI_PRICING[opts.model] ?? { inputPerMillion: 0, outputPerMillion: 0 };
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxRetries = opts.maxRetries ?? DEFAULT_MAX_RETRIES;
  }

  async chat(opts: { system: string; user: string; jsonMode?: boolean; maxTokens?: number }): Promise<BeamLlmResult> {
    const started = Date.now();
    let lastFailure = 'unknown';
    const reasoning = isReasoningModel(this.model);
    // Reasoning models spend completion budget on hidden reasoning tokens before
    // emitting any answer text; long-form questions can exhaust a small cap and
    // return HTTP-200 with empty text. Start at a high floor and, on an empty
    // completion, double the budget (capped) and retry within this loop.
    let reasoningBudget = Math.max(opts.maxTokens ?? 800, 16384);
    const REASONING_BUDGET_CAP = 32768;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (attempt > 0) {
        await sleep(Math.min(8000, 500 * 2 ** (attempt - 1)));
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const body: Record<string, unknown> = {
          model: this.model,
          messages: [
            { role: 'system', content: opts.system },
            { role: 'user', content: opts.user },
          ],
        };
        if (reasoning) {
          body.max_completion_tokens = reasoningBudget;
        } else {
          body.temperature = 0;
          body.max_tokens = opts.maxTokens ?? 800;
        }
        if (opts.jsonMode) body.response_format = { type: 'json_object' };

        const res = await fetch(`${this.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!res.ok) {
          lastFailure = `http_${res.status}`;
          // Retry on rate-limit / server errors; bail on client errors.
          if (res.status === 429 || res.status >= 500) continue;
          const errText = await res.text().catch(() => '');
          return this.fail(`http_${res.status}`, started, errText.slice(0, 200));
        }

        const json = (await res.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
          usage?: { prompt_tokens?: number; completion_tokens?: number };
        };
        const text = json.choices?.[0]?.message?.content ?? '';
        // Retry-on-empty for reasoning models: HTTP-200 but no answer text means
        // the whole budget went to hidden reasoning. Count this attempt as a
        // failure, double the budget (capped), and retry.
        if (reasoning && text.trim() === '' && reasoningBudget < REASONING_BUDGET_CAP) {
          lastFailure = 'empty_completion';
          const nextBudget = Math.min(reasoningBudget * 2, REASONING_BUDGET_CAP);
          console.warn(
            `[beam-openai] empty completion from ${this.model} ` +
            `(max_completion_tokens=${reasoningBudget}); retrying with ${nextBudget}`,
          );
          reasoningBudget = nextBudget;
          continue;
        }
        const inputTokens = json.usage?.prompt_tokens ?? approxTokens(opts.system + opts.user);
        const outputTokens = json.usage?.completion_tokens ?? approxTokens(text);
        const costUsd =
          (inputTokens / 1_000_000) * this.pricing.inputPerMillion +
          (outputTokens / 1_000_000) * this.pricing.outputPerMillion;
        return { text, inputTokens, outputTokens, costUsd, latencyMs: Date.now() - started, failureMode: null };
      } catch (err) {
        const name = (err as Error).name;
        lastFailure = name === 'AbortError' ? 'timeout' : `fetch_error_${name}`;
        // Loop will retry unless attempts exhausted.
      } finally {
        clearTimeout(timer);
      }
    }
    return this.fail(lastFailure, started);
  }

  private fail(failureMode: string, started: number, _detail?: string): BeamLlmResult {
    return { text: '', inputTokens: 0, outputTokens: 0, costUsd: 0, latencyMs: Date.now() - started, failureMode };
  }
}

/** Build a client, resolving the API key from env/.env. Throws if absent. */
export function createBeamOpenAiClient(opts: {
  model: string;
  envPath?: string;
  baseUrl?: string;
  pricing?: ModelPricing;
}): BeamOpenAiClient {
  loadDotEnv(opts.envPath);
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'OPENAI_API_KEY not found in environment or .env. ' +
      'Set it in waggle-os/.env or export it before running.',
    );
  }
  return new BeamOpenAiClient({ model: opts.model, apiKey, baseUrl: opts.baseUrl, pricing: opts.pricing });
}

function approxTokens(s: string): number {
  return Math.max(1, Math.ceil(s.length / 4));
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
