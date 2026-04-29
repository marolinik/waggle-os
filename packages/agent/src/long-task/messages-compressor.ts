/**
 * Messages-array compression — Phase 4.6 of agent-fix sprint
 * (per decisions/2026-04-26-agent-fix-sprint-plan.md §4.6)
 *
 * Addresses the Phase 3 acceptance gate finding: ContextManager (Phase 3.3)
 * compresses ONLY accumulated_context (audit log, ~450 tokens by step 30 —
 * never crosses 4K threshold). Real LLM cost is dominated by the messages
 * array (~16K tokens by step 30 on Opus). Phase 4.6 closes the gap by adding
 * a SEPARATE compression layer for the messages array, invoked at the top of
 * each retrieval-agent-loop iteration.
 *
 * REUSE / NON-DUPLICATION (per CLAUDE.md §3.6 check-before-create):
 *   - estimateStringTokens (per-string version) from context-compressor.ts
 *     for content-aware token estimation
 *   - pruneToolResults from context-compressor.ts (drops tool-result blobs in
 *     older messages to reduce size before LLM summarization)
 *   - COMPACTION_PROMPT from behavioral-spec.ts (proven summarizer prompt)
 *
 * NEW (this module):
 *   - summarizeMiddleViaLlmCall: drop-in replacement for context-compressor's
 *     fetch-based summarizeMiddle that uses Phase 2.1's LlmCallFn abstraction.
 *   - Simple message-count-based split (head + middle + tail) — PM brief
 *     specified `retainRecentTurns` as a COUNT, not the token-budget surface
 *     used by context-compressor.ts's splitProtectedRegions.
 *
 * NOT REFACTORED:
 *   - context-compressor.ts itself stays fetch-based for its existing
 *     consumers (harness + server). Future Sprint 12 cleanup could unify on
 *     LlmCallFn but that's separate scope.
 */

import {
  estimateStringTokens,
  pruneToolResults,
  type CompressibleMessage,
} from '../context-compressor.js';
import { COMPACTION_PROMPT } from '../behavioral-spec.js';
import type { LlmCallFn } from '../retrieval-agent-loop.js';

// ─────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────

export interface MessagesCompressionEvent {
  type: 'messages_compressed';
  before_tokens: number;
  after_tokens: number;
  messages_before: number;
  messages_after: number;
  cost_usd: number;
  summary_generated: boolean;
}

export interface MessagesContextManagerConfig {
  /** Token budget for the messages array (per LLM call). */
  budgetTokens: number;
  /** Fraction of budget that triggers compression. Default 0.7. */
  threshold?: number;
  /**
   * Number of recent TURNS to retain verbatim. One turn ≈ 2 messages
   * (assistant + user, or vice-versa). Default 5 turns = 10 messages.
   */
  retainRecentTurns?: number;
  /**
   * Number of head messages (after the system prompt) to keep verbatim.
   * Default 1 (typically the kickoff user prompt — system is always retained).
   */
  protectedHeadMessages?: number;
  /**
   * Per-string token estimator override. Default = estimateStringTokens
   * (content-aware: prose 4.0 / code 3.2 / json 3.5 / mixed 2.5 chars-per-token).
   * Caller can inject tiktoken or Anthropic count_tokens for exact counts.
   */
  estimateTokensFn?: (text: string) => number;
  /**
   * LLM call function for summarizing the middle region. If absent, the
   * middle is replaced with a structural placeholder ("[N compressed
   * messages]") — pruning still happens but no semantic summary.
   */
  llmCall?: LlmCallFn;
  /** Model alias for the summarizer. Required if llmCall is provided. */
  summarizationModel?: string;
  /** max_tokens for the summarizer LLM call. Default 2000. */
  summarizationMaxTokens?: number;
  /** Optional callback for messages-compression events. */
  onCompressionEvent?: (event: MessagesCompressionEvent) => void;
}

export interface CompressMessagesResult {
  /** The (possibly compressed) messages array. */
  messages: Array<{ role: string; content: string }>;
  /** Updated running summary (carries forward across compressions). */
  summary: string | null;
  /** Whether compression actually fired this call. */
  compressed: boolean;
}

// ─────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────

const DEFAULT_THRESHOLD = 0.7;
const DEFAULT_RETAIN_RECENT_TURNS = 5;
const DEFAULT_PROTECTED_HEAD_MESSAGES = 1;
const DEFAULT_SUMMARIZATION_MAX_TOKENS = 2000;
const PER_MESSAGE_ROLE_OVERHEAD_TOKENS = 4;

// ─────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────

function estimateMessagesTokens(
  messages: ReadonlyArray<{ role: string; content: string }>,
  perStringFn: (text: string) => number,
): number {
  let sum = 0;
  for (const m of messages) {
    sum += PER_MESSAGE_ROLE_OVERHEAD_TOKENS;
    sum += perStringFn(m.content ?? '');
  }
  return sum;
}

interface SplitRegions {
  head: Array<{ role: string; content: string }>;
  middle: Array<{ role: string; content: string }>;
  tail: Array<{ role: string; content: string }>;
}

/**
 * Split messages into head (system + first N messages) / middle (compressible)
 * / tail (last K turns × 2 messages, retained verbatim).
 *
 * One turn ≈ 2 messages, so retainRecentTurns × 2 messages are kept in tail.
 * Head + tail must not overlap; if the conversation is short, middle may be empty.
 */
function splitForCompress(
  messages: ReadonlyArray<{ role: string; content: string }>,
  protectedHead: number,
  retainRecentTurns: number,
): SplitRegions {
  const headEnd = Math.min(1 + protectedHead, messages.length);
  const tailStart = Math.max(headEnd, messages.length - retainRecentTurns * 2);
  return {
    head: messages.slice(0, headEnd).map(m => ({ ...m })),
    middle: messages.slice(headEnd, tailStart).map(m => ({ ...m })),
    tail: messages.slice(tailStart).map(m => ({ ...m })),
  };
}

// ─────────────────────────────────────────────────────────────────────────
// LLM-call-based summarizer (replaces fetch-based summarizeMiddle)
// ─────────────────────────────────────────────────────────────────────────

interface SummarizeResult {
  summary: string;
  costUsd: number;
  generated: boolean;
}

async function summarizeMiddleViaLlmCall(
  middle: ReadonlyArray<CompressibleMessage>,
  llmCall: LlmCallFn,
  model: string,
  maxTokens: number,
  previousSummary: string | null,
): Promise<SummarizeResult> {
  if (middle.length === 0) {
    return { summary: previousSummary ?? '', costUsd: 0, generated: false };
  }

  const summarizerMessages: Array<{ role: string; content: string }> = [];

  if (previousSummary) {
    summarizerMessages.push({
      role: 'system',
      content: `You are summarizing a conversation that has been compressed before. Here is the previous summary:\n\n${previousSummary}\n\nNow incorporate the new messages below into an updated summary.`,
    });
  }

  for (const msg of middle) {
    summarizerMessages.push({
      role: msg.role === 'system' ? 'user' : msg.role,
      content: msg.content ?? '',
    });
  }

  summarizerMessages.push({ role: 'user', content: COMPACTION_PROMPT });

  const r = await llmCall({
    model,
    messages: summarizerMessages,
    maxTokens,
    temperature: 0.1,
  });

  if (r.error || !r.content) {
    return { summary: buildFallbackSummary(middle, previousSummary), costUsd: r.costUsd, generated: false };
  }
  return { summary: r.content, costUsd: r.costUsd, generated: true };
}

function buildFallbackSummary(
  middle: ReadonlyArray<CompressibleMessage>,
  previousSummary: string | null,
): string {
  const lines: string[] = [];
  if (previousSummary) lines.push('## Previous summary\n' + previousSummary);
  lines.push(`## Compressed region (${middle.length} messages, no LLM summary)`);
  const userFirstLines = middle
    .filter(m => m.role === 'user')
    .map(m => (m.content ?? '').split('\n')[0]?.slice(0, 100).trim())
    .filter((l): l is string => Boolean(l && l.length > 8))
    .slice(0, 5);
  if (userFirstLines.length > 0) {
    lines.push('Topics covered: ' + userFirstLines.join(' → '));
  }
  return lines.join('\n\n');
}

// ─────────────────────────────────────────────────────────────────────────
// Main entry point
// ─────────────────────────────────────────────────────────────────────────

/**
 * Compress the messages array if it exceeds threshold. Returns the (possibly
 * compressed) messages, a running summary (carries forward), and a boolean
 * indicating whether compression actually fired.
 *
 * Pipeline (when triggered):
 *   1. Prune tool-result-shaped blobs from older messages (no LLM, free).
 *   2. Split into head (system + first N) / middle (compressible) / tail
 *      (last retainRecentTurns × 2 messages verbatim).
 *   3. Summarize the middle via LLM (or fallback placeholder if no LLM).
 *   4. Replace middle with single summary message; reassemble [head, summary, tail].
 *
 * Idempotency: if called twice in a row without growth, the second call is a
 * no-op (under-threshold).
 */
export async function maybeCompressMessages(
  messages: ReadonlyArray<{ role: string; content: string }>,
  config: MessagesContextManagerConfig,
  previousSummary: string | null,
): Promise<CompressMessagesResult> {
  const stringEstimator = config.estimateTokensFn ?? estimateStringTokens;
  const threshold = config.threshold ?? DEFAULT_THRESHOLD;
  const protectedHead = config.protectedHeadMessages ?? DEFAULT_PROTECTED_HEAD_MESSAGES;
  const retainRecentTurns = config.retainRecentTurns ?? DEFAULT_RETAIN_RECENT_TURNS;

  const tokensBefore = estimateMessagesTokens(messages, stringEstimator);
  if (tokensBefore <= config.budgetTokens * threshold) {
    return { messages: messages.map(m => ({ ...m })), summary: previousSummary, compressed: false };
  }

  // Step 1: prune tool-result blobs (free, no LLM).
  const pruneTailCount = retainRecentTurns * 2;
  const pruned = pruneToolResults(messages, pruneTailCount);

  // Step 2: split into head / middle / tail.
  const regions = splitForCompress(pruned, protectedHead, retainRecentTurns);

  // If middle is empty (very short conversation, head + tail covers everything),
  // no compression is possible — return as-is (compressed=false).
  if (regions.middle.length === 0) {
    return { messages: pruned.map(m => ({ ...m })), summary: previousSummary, compressed: false };
  }

  // Step 3: summarize middle.
  let summaryText: string;
  let summaryGenerated = false;
  let costUsd = 0;

  if (config.llmCall && config.summarizationModel) {
    const r = await summarizeMiddleViaLlmCall(
      regions.middle,
      config.llmCall,
      config.summarizationModel,
      config.summarizationMaxTokens ?? DEFAULT_SUMMARIZATION_MAX_TOKENS,
      previousSummary,
    );
    summaryText = r.summary;
    summaryGenerated = r.generated;
    costUsd = r.costUsd;
  } else {
    summaryText = buildFallbackSummary(regions.middle, previousSummary);
  }

  // Step 4: replace middle with summary message.
  const summaryMessage = {
    role: 'system',
    content: `[Compressed: ${regions.middle.length} earlier messages]\n${summaryText}`,
  };
  const newMessages = [...regions.head, summaryMessage, ...regions.tail];

  const tokensAfter = estimateMessagesTokens(newMessages, stringEstimator);

  if (config.onCompressionEvent) {
    config.onCompressionEvent({
      type: 'messages_compressed',
      before_tokens: tokensBefore,
      after_tokens: tokensAfter,
      messages_before: messages.length,
      messages_after: newMessages.length,
      cost_usd: costUsd,
      summary_generated: summaryGenerated,
    });
  }

  return { messages: newMessages, summary: summaryText, compressed: true };
}

/**
 * Returns true if the given messages array would trigger compression under
 * the given config. Exposed for callers that want to check without invoking.
 */
export function shouldCompressMessages(
  messages: ReadonlyArray<{ role: string; content: string }>,
  config: MessagesContextManagerConfig,
): boolean {
  const stringEstimator = config.estimateTokensFn ?? estimateStringTokens;
  const threshold = config.threshold ?? DEFAULT_THRESHOLD;
  return estimateMessagesTokens(messages, stringEstimator) > config.budgetTokens * threshold;
}
