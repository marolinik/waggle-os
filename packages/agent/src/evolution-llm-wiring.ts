/**
 * Evolution LLM Wiring — binds real LLMs into the self-evolution loop.
 *
 * The evolution primitives (judge, iterative-optimizer, evolve-schema) are
 * deliberately model-agnostic: they accept plain callables. This module
 * supplies production adapters that turn a Haiku-class LLM into those
 * callables, so the `/api/evolution/run` endpoint can perform a real run.
 *
 * Public surface:
 *
 *   createAnthropicEvolutionLLM(apiKey, model?)
 *     Builds the default Haiku-backed LLM via @ax-llm/ax — same pattern as
 *     `optimizer-service.ts`. Dynamic import to avoid startup cost when
 *     evolution is not in use.
 *
 *   buildJudgeLLMCall(llm)      → JudgeLLMCall      (for LLMJudge)
 *   buildGEPAMutateFn(llm)      → MutateFn          (for IterativeGEPA)
 *   buildSchemaExecuteFn(llm)   → SchemaExecuteFn   (for EvolveSchema)
 *   makeRunningJudge(base, llm) → Pick<LLMJudge,'score'>
 *
 *   The `makeRunningJudge` wrapper is what enables GEPA to evaluate real
 *   prompt effectiveness: on each score() call it first executes the
 *   candidate prompt against the example input via the LLM, then delegates
 *   to the wrapped judge with the model's actual response. Without this,
 *   GEPA compares prompt text to expected output directly — less useful.
 *
 * All adapters are pure wrappers over `EvolutionLLM.complete()`, which is a
 * minimal `(prompt: string) => Promise<string>` contract. Tests supply
 * in-memory mocks of that contract; production code goes through AxAI.
 */

import type { JudgeLLMCall, JudgeInput, JudgeScore } from './judge.js';
import type { LLMJudge } from './judge.js';
import type { MutateArgs, MutateFn, EvolutionTarget } from './iterative-optimizer.js';
import type { SchemaExecuteFn, Schema, SchemaField } from './evolve-schema.js';

// ── Minimal LLM contract ────────────────────────────────────────

/**
 * A minimal single-turn completion contract. All evolution adapters depend
 * on this interface rather than on @ax-llm/ax directly so they stay easy to
 * mock in unit tests.
 */
export interface EvolutionLLM {
  complete(prompt: string): Promise<string>;
}

// ── Retry with exponential backoff ──────────────────────────────

/**
 * Tuning knobs for `retryWithBackoff` and `wrapWithRetry`. All fields
 * optional — defaults match the schedule proven out in the hypothesis
 * test: 5s → 15s → 45s → 135s (capped at 150s) with ±3s jitter across
 * six total attempts (five retries).
 */
export interface RetryOptions {
  /** Total attempts including the first. Default 6 (= 5 retries). */
  maxAttempts?: number;
  /** Base backoff in ms. Default 5_000. */
  baseMs?: number;
  /** Cap on a single backoff in ms. Default 150_000. */
  capMs?: number;
  /** Multiplicative growth factor per attempt. Default 3. */
  factor?: number;
  /** Random jitter in ms added to each backoff. Default 3_000. */
  jitterMs?: number;
  /** Predicate that decides whether an error is retryable. */
  isRetryable?: (err: unknown) => boolean;
  /** Sleep override — tests can pass `async () => {}` for instant sleeps. */
  sleep?: (ms: number) => Promise<void>;
  /** Observability hook fired BEFORE each retry sleep. */
  onRetry?: (info: RetryInfo) => void;
  /** AbortSignal — interrupts the next sleep + causes the loop to throw. */
  signal?: AbortSignal;
}

export interface RetryInfo {
  /** 1-based attempt number that just failed. */
  attempt: number;
  /** Planned sleep duration in ms before the next attempt. */
  delayMs: number;
  /** The error that triggered the retry. */
  error: unknown;
}

/** Immutable defaults — frozen so typos at call sites fail loudly. */
export const DEFAULT_RETRY_OPTIONS: Required<Omit<RetryOptions, 'onRetry' | 'signal' | 'sleep' | 'isRetryable'>> = Object.freeze({
  maxAttempts: 6,
  baseMs: 5_000,
  capMs: 150_000,
  factor: 3,
  jitterMs: 3_000,
});

const DEFAULT_SLEEP = (ms: number): Promise<void> => new Promise(r => setTimeout(r, ms));

const RETRYABLE_STATUSES: ReadonlySet<number> = new Set([408, 425, 429, 500, 502, 503, 504, 529]);

const RETRYABLE_CODES: ReadonlySet<string> = new Set([
  'ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN',
  'EPIPE', 'ECONNABORTED', 'ESOCKETTIMEDOUT', 'UND_ERR_SOCKET',
]);

const RETRYABLE_MESSAGE_RE = /\b(rate.?limit|too.many.requests|overloaded|timeout|timed.out|socket.hang.up|network.error|connection.reset|connection.refused|fetch.failed|retry|503|502|504|529|429)\b/i;

/**
 * Default retryable-error detector. Looks at (in order):
 *   1. Explicit HTTP status on the error object (`status`, `statusCode`).
 *   2. Well-known Node/fetch failure codes (ETIMEDOUT, ECONNRESET, ...).
 *   3. Message patterns that indicate a transient condition.
 *
 * Conservative on unknowns — returns `false` rather than retrying blind.
 */
export function isRetryableEvolutionError(err: unknown): boolean {
  if (err === null || err === undefined) return false;
  const e = err as { status?: unknown; statusCode?: unknown; code?: unknown; message?: unknown };
  const status = typeof e.status === 'number' ? e.status
    : typeof e.statusCode === 'number' ? e.statusCode
      : undefined;
  if (status !== undefined && RETRYABLE_STATUSES.has(status)) return true;
  if (typeof e.code === 'string' && RETRYABLE_CODES.has(e.code)) return true;
  const message = typeof e.message === 'string' ? e.message : '';
  if (message && RETRYABLE_MESSAGE_RE.test(message)) return true;
  return false;
}

/**
 * Deterministic (when `jitterMs === 0`) backoff schedule. Attempt is
 * 1-based: the first retry uses `attempt = 1`, giving `baseMs`.
 */
export function computeRetryDelay(attempt: number, options: RetryOptions = {}): number {
  const baseMs = options.baseMs ?? DEFAULT_RETRY_OPTIONS.baseMs;
  const capMs = options.capMs ?? DEFAULT_RETRY_OPTIONS.capMs;
  const factor = options.factor ?? DEFAULT_RETRY_OPTIONS.factor;
  const jitterMs = options.jitterMs ?? DEFAULT_RETRY_OPTIONS.jitterMs;
  const clampedAttempt = Math.max(1, attempt);
  const raw = baseMs * Math.pow(factor, clampedAttempt - 1);
  const base = Math.min(capMs, raw);
  const jitter = jitterMs > 0 ? Math.floor(Math.random() * jitterMs) : 0;
  return base + jitter;
}

/**
 * Run `op` with exponential-backoff retries. The closure receives the
 * 1-based attempt number so callers can do per-attempt diagnostics.
 *
 * - Non-retryable errors throw on first occurrence.
 * - After `maxAttempts` failed retryable attempts, the final error is
 *   rethrown unchanged (so callers can inspect `.status` / `.message`).
 * - `signal` aborts the next sleep and causes the loop to throw — the
 *   op itself is not cancelled mid-flight.
 */
export async function retryWithBackoff<T>(
  op: (attempt: number) => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? DEFAULT_RETRY_OPTIONS.maxAttempts;
  const isRetryable = options.isRetryable ?? isRetryableEvolutionError;
  const sleep = options.sleep ?? DEFAULT_SLEEP;
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (options.signal?.aborted) {
      throw options.signal.reason instanceof Error
        ? options.signal.reason
        : new Error('retryWithBackoff aborted');
    }
    try {
      return await op(attempt);
    } catch (err) {
      lastError = err;
      if (!isRetryable(err) || attempt === maxAttempts) throw err;
      const delayMs = computeRetryDelay(attempt, options);
      options.onRetry?.({ attempt, delayMs, error: err });
      await sleep(delayMs);
    }
  }
  // Unreachable: the loop either returns, throws inside the catch, or exhausts
  // maxAttempts (which is handled by the `attempt === maxAttempts` throw above).
  throw lastError ?? new Error('retryWithBackoff: unreachable');
}

/**
 * Wrap any `EvolutionLLM` so that each `complete()` call is retried on
 * transient failures. Pure composition — the inner LLM is unaware.
 */
export function wrapWithRetry(llm: EvolutionLLM, options: RetryOptions = {}): EvolutionLLM {
  return {
    complete(prompt: string): Promise<string> {
      return retryWithBackoff(() => llm.complete(prompt), options);
    },
  };
}

// ── Anthropic builder ───────────────────────────────────────────

export interface CreateAnthropicEvolutionLLMOptions {
  /** Optional model override. Defaults to Claude 4.5 Haiku. */
  model?: string;
  /**
   * Retry policy applied to every `complete()` call. Omit to use the
   * library defaults; pass `{ maxAttempts: 1 }` to disable retries
   * entirely.
   */
  retry?: RetryOptions;
}

/**
 * Build the default Anthropic-backed EvolutionLLM. Dynamic-imports
 * @ax-llm/ax so evolution is a zero-cost dependency until used.
 *
 * Returns null when @ax-llm/ax is unavailable — callers should treat null
 * as "evolution disabled" and surface a clear error to the user.
 */
export async function createAnthropicEvolutionLLM(
  apiKey: string,
  options: CreateAnthropicEvolutionLLMOptions = {},
): Promise<EvolutionLLM | null> {
  if (!apiKey) return null;
  try {
    const mod = await import('@ax-llm/ax');
    const AxAI = (mod as unknown as { AxAI: new (config: unknown) => unknown }).AxAI;
    const AxAIAnthropicModel = (mod as unknown as {
      AxAIAnthropicModel: Record<string, string>;
    }).AxAIAnthropicModel;
    if (!AxAI) return null;

    const model = options.model ?? AxAIAnthropicModel?.Claude45Haiku ?? 'claude-haiku-4-5-20251001';
    const ai = new AxAI({
      name: 'anthropic',
      apiKey,
      config: { model },
    }) as {
      chat(req: {
        chatPrompt: { role: 'user' | 'system'; content: string }[];
      }): Promise<unknown>;
    };

    const inner: EvolutionLLM = {
      async complete(prompt: string): Promise<string> {
        const response = await ai.chat({
          chatPrompt: [{ role: 'user', content: prompt }],
        });
        // chat() may return a ReadableStream in streaming mode — evolution
        // does not stream, so we only handle the non-stream case.
        const typed = response as {
          results?: readonly { content?: string }[];
        };
        const first = typed.results?.[0]?.content;
        return typeof first === 'string' ? first : '';
      },
    };
    // Apply retry policy — defaults are sized for background evolution runs
    // (5s → 15s → 45s → 135s → 150s across 6 attempts). Callers can disable
    // by passing `retry: { maxAttempts: 1 }`.
    return wrapWithRetry(inner, options.retry ?? {});
  } catch {
    // @ax-llm/ax missing or init failure — graceful degradation.
    return null;
  }
}

// ── Judge adapter ───────────────────────────────────────────────

/**
 * Turn an EvolutionLLM into a JudgeLLMCall. The rubric prompt is built by
 * `LLMJudge` itself; this adapter only forwards the prompt text.
 */
export function buildJudgeLLMCall(llm: EvolutionLLM): JudgeLLMCall {
  return (prompt: string) => llm.complete(prompt);
}

// ── Reflective mutation (GEPA) ──────────────────────────────────

export interface BuildReflectiveMutationPromptArgs {
  parent: string;
  strategy: string;
  weaknessFeedback: string[];
  targetKind: EvolutionTarget;
  generation: number;
}

/**
 * Build a reflective mutation prompt for GEPA. Returns the *mutated child*
 * text only — no commentary, no wrapping — per the instruction in the
 * prompt body. The LLM is told what to fix, using the weakness signal from
 * the parent's worst-scoring eval examples.
 */
export function buildReflectiveMutationPrompt(
  args: BuildReflectiveMutationPromptArgs,
): string {
  const weaknessBullets = args.weaknessFeedback.length > 0
    ? args.weaknessFeedback.map(fb => `- ${fb}`).join('\n')
    : '(no specific weakness signals yet)';

  return `You are evolving an AI prompt. This is generation ${args.generation}.

TARGET KIND: ${args.targetKind}
STRATEGY: ${args.strategy}

PARENT PROMPT (do not return this unchanged — produce a *better* variant):
---
${args.parent}
---

WEAKNESS SIGNALS from the parent's lowest-scoring eval examples:
${weaknessBullets}

Apply the strategy above to address the weakness signals. Keep the same
role and overall structure — do not change the prompt's purpose. Produce
a concrete variant that should score higher on the next eval.

Return ONLY the new prompt text. No preamble, no explanation, no markdown
fences. Plain text only.`;
}

/**
 * Build a GEPA MutateFn that uses an LLM to produce reflective mutations.
 * Graceful fallback: if the LLM throws or returns empty, returns the
 * parent prompt unchanged (GEPA will still evaluate it as part of the
 * Pareto population — no progress that generation, but no crash).
 */
export function buildGEPAMutateFn(llm: EvolutionLLM): MutateFn {
  return async (args: MutateArgs): Promise<string> => {
    const prompt = buildReflectiveMutationPrompt({
      parent: args.parent.prompt,
      strategy: args.strategy,
      weaknessFeedback: args.weaknessFeedback,
      targetKind: args.targetKind,
      generation: args.generation,
    });
    let raw = '';
    try {
      raw = await llm.complete(prompt);
    } catch {
      return args.parent.prompt;
    }
    const cleaned = stripFences(raw).trim();
    if (cleaned.length === 0) return args.parent.prompt;
    return cleaned;
  };
}

// ── Schema execute (ES) ─────────────────────────────────────────

/**
 * Build a schema-filling prompt that asks the LLM to return JSON matching
 * the given schema for the given user input. Every field is documented by
 * name + type + description + required flag + constraints.
 */
export function buildSchemaFillPrompt(args: { schema: Schema; input: string }): string {
  const fieldLines = args.schema.fields.map(f => formatField(f)).join('\n');
  return `Fill the JSON schema below using the user input. Respond with
valid JSON — no markdown, no prose, no trailing commas.

SCHEMA (name: ${args.schema.name}, version: ${args.schema.version}):
${fieldLines}

USER INPUT:
${args.input}

Return ONLY the JSON object.`;
}

function formatField(field: SchemaField): string {
  const req = field.required ? 'required' : 'optional';
  const constraints = field.constraints.length > 0
    ? ' constraints: ' + field.constraints.map(c => `${c.kind}=${stringifyConstraintValue(c.value)}`).join(', ')
    : '';
  return `- "${field.name}" (${field.type}, ${req}): ${field.description}${constraints}`;
}

function stringifyConstraintValue(value: string | number | string[]): string {
  if (Array.isArray(value)) return `[${value.join(',')}]`;
  return String(value);
}

/**
 * Build a SchemaExecuteFn that asks the LLM to fill a schema. Returns
 * `parsed: true` only when the response parses as JSON. On any error
 * (network, timeout, bad model), returns `{actual: '', parsed: false}`.
 */
export function buildSchemaExecuteFn(llm: EvolutionLLM): SchemaExecuteFn {
  return async ({ schema, input }) => {
    let raw = '';
    try {
      raw = await llm.complete(buildSchemaFillPrompt({ schema, input }));
    } catch {
      return { actual: '', parsed: false };
    }
    const cleaned = stripFences(raw);
    return { actual: cleaned, parsed: looksLikeJSON(cleaned) };
  };
}

// ── Running judge (executes candidate prompt first, then scores) ─

/**
 * Wrap a base judge so that each score() call first runs the candidate
 * prompt through the LLM on the example's input. The base judge then
 * receives the LLM's output as `actual`, giving a real behavioral signal
 * instead of a prompt-text-to-expected-output comparison.
 *
 * When the LLM call fails, returns a zero score with clear feedback so the
 * Pareto population treats the candidate as a loser without crashing the
 * whole generation.
 */
export function makeRunningJudge(
  baseJudge: Pick<LLMJudge, 'score'>,
  llm: EvolutionLLM,
): Pick<LLMJudge, 'score'> {
  return {
    async score(args: JudgeInput): Promise<JudgeScore> {
      // `args.actual` is the candidate prompt supplied by GEPA. Treat it as
      // a system prompt, run it against the example input via the LLM, and
      // use the LLM's reply as the new `actual` for the downstream judge.
      const runPrompt = buildRunPrompt(args.actual, args.input);
      let modelOutput = '';
      try {
        modelOutput = await llm.complete(runPrompt);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          overall: 0, weighted: 0,
          correctness: 0, procedureFollowing: 0, conciseness: 0,
          lengthPenalty: 1,
          feedback: `Candidate execution failed: ${msg}`,
          parsed: false,
        };
      }
      return baseJudge.score({ ...args, actual: modelOutput });
    },
  };
}

function buildRunPrompt(candidatePrompt: string, userInput: string): string {
  return `${candidatePrompt}

USER INPUT:
${userInput}

Respond now.`;
}

// ── Shared helpers ──────────────────────────────────────────────

/** Strip ``` and ```json fences if present. Never throws. */
function stripFences(raw: string): string {
  if (!raw) return '';
  return raw
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();
}

function looksLikeJSON(s: string): boolean {
  const trimmed = s.trim();
  if (!trimmed) return false;
  if (!(trimmed.startsWith('{') || trimmed.startsWith('['))) return false;
  try {
    JSON.parse(trimmed);
    return true;
  } catch {
    return false;
  }
}
