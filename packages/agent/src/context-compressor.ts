/**
 * ContextCompressor — 5-step pipeline for intelligent conversation compression.
 *
 * When a conversation exceeds a configurable fraction of the context window,
 * this pipeline compresses it while preserving critical information:
 *
 *   1. Detect   — estimate token count, check against threshold
 *   2. Prune    — replace old tool-result messages with "[Cleared]" (no LLM, free)
 *   3. Protect  — split into head (system + first N msgs), tail (recent work), middle
 *   4. Summarize — call budget model on the middle using COMPACTION_PROMPT ($0 cost)
 *   5. Inject   — replace middle with summary, return compressed message array
 *
 * Iterative: when compressing again, the previous summary is fed to the summarizer
 * so information accumulates rather than being lost.
 */

import { COMPACTION_PROMPT } from './behavioral-spec.js';

// ── Types ────────────────────────────────────────────────────────────────

export interface CompressionConfig {
  /** Total context window size in tokens (e.g. 128000 for Claude Sonnet) */
  maxContextTokens: number;
  /** Fraction of context window that triggers compression (default: 0.5) */
  compressionThreshold: number;
  /** Number of messages to protect at the start after system prompt (default: 3) */
  protectedHeadMessages: number;
  /** Approximate token budget to protect at the tail (default: 20000) */
  protectedTailTokens: number;
  /** Budget model identifier for the summarizer (e.g. "qwen/qwen3.6-plus:free") */
  budgetModel: string;
  /** LiteLLM proxy base URL */
  litellmUrl: string;
  /** LiteLLM API key */
  litellmApiKey: string;
  /** Custom fetch function (for testing/injection) */
  fetch?: typeof globalThis.fetch;
}

export interface CompressionResult {
  /** The (possibly compressed) messages to send to the agent loop */
  messages: CompressibleMessage[];
  /** Whether compression was actually performed */
  compressed: boolean;
  /** Estimated token count before compression */
  originalTokens: number;
  /** Estimated token count after compression */
  compressedTokens: number;
  /** Whether an LLM summary was generated this pass */
  summaryGenerated: boolean;
  /** The generated summary text (for iterative use on next compression) */
  summary: string | null;
}

export interface CompressibleMessage {
  role: string;
  content: string;
}

// ── Step 1: Token Estimation ─────────────────────────────────────────────

/**
 * Estimate token count for a message array.
 * Uses the ~4 chars per token heuristic — fast and free.
 * Accurate enough for threshold decisions; exact counting would require tiktoken.
 */
export function estimateTokens(messages: ReadonlyArray<CompressibleMessage>): number {
  let chars = 0;
  for (const msg of messages) {
    // Role overhead: ~4 tokens per message for role/formatting
    chars += 16;
    chars += (msg.content ?? '').length;
  }
  return Math.ceil(chars / 4);
}

/**
 * Check whether the conversation needs compression.
 */
export function needsCompression(
  messages: ReadonlyArray<CompressibleMessage>,
  config: Pick<CompressionConfig, 'maxContextTokens' | 'compressionThreshold'>,
): boolean {
  const tokens = estimateTokens(messages);
  return tokens > config.maxContextTokens * config.compressionThreshold;
}

// ── Step 2: Prune Tool Results ───────────────────────────────────────────

/**
 * Replace old tool-result message content with a short placeholder.
 * This is free (no LLM call) and removes the bulkiest content.
 *
 * Only prunes messages NOT in the protected tail region.
 * Tool results in the tail are left intact since they're recent/relevant.
 */
export function pruneToolResults(
  messages: ReadonlyArray<CompressibleMessage>,
  protectedTailCount: number,
): CompressibleMessage[] {
  const tailStart = Math.max(0, messages.length - protectedTailCount);

  return messages.map((msg, i) => {
    // Don't touch protected tail messages
    if (i >= tailStart) return { ...msg };

    // Prune tool-role messages (these are tool call results — often huge)
    if (msg.role === 'tool') {
      return { role: msg.role, content: '[Cleared: tool result]' };
    }

    // Prune assistant messages that contain large code blocks or tool output
    if (msg.role === 'assistant' && msg.content && msg.content.length > 2000) {
      // Check for tool-output patterns (JSON results, file contents, etc.)
      const content = msg.content;
      if (content.startsWith('{') || content.startsWith('[') || content.includes('```')) {
        // Keep first 200 chars as context, clear the rest
        const preview = content.slice(0, 200);
        return { role: msg.role, content: `${preview}\n\n[Cleared: ${content.length} chars of detailed output]` };
      }
    }

    return { ...msg };
  });
}

// ── Step 3: Split Protected Regions ──────────────────────────────────────

export interface ProtectedRegions {
  /** System prompt + first N user/assistant messages */
  head: CompressibleMessage[];
  /** Messages in the middle that can be summarized */
  middle: CompressibleMessage[];
  /** Recent messages (last ~protectedTailTokens worth) */
  tail: CompressibleMessage[];
}

/**
 * Split messages into head (protected), middle (compressible), tail (protected).
 *
 * Head: first message (system) + protectedHeadMessages additional messages.
 * Tail: messages from the end that fit within protectedTailTokens.
 * Middle: everything between head and tail.
 */
export function splitProtectedRegions(
  messages: ReadonlyArray<CompressibleMessage>,
  config: Pick<CompressionConfig, 'protectedHeadMessages' | 'protectedTailTokens'>,
): ProtectedRegions {
  // Head: system prompt + first N messages
  const headEnd = Math.min(1 + config.protectedHeadMessages, messages.length);
  const head = messages.slice(0, headEnd);

  // Tail: walk backwards from the end until we hit the token budget
  let tailTokens = 0;
  let tailStart = messages.length;
  for (let i = messages.length - 1; i >= headEnd; i--) {
    const msgTokens = estimateTokens([messages[i]]);
    if (tailTokens + msgTokens > config.protectedTailTokens) break;
    tailTokens += msgTokens;
    tailStart = i;
  }

  const tail = messages.slice(tailStart);
  const middle = messages.slice(headEnd, tailStart);

  return { head, middle, tail };
}

// ── Step 4: Summarize Middle ─────────────────────────────────────────────

/**
 * Call the budget model to summarize the compressible middle section.
 * Uses COMPACTION_PROMPT from behavioral-spec.ts.
 *
 * If a previousSummary is provided, it's included so the model can build
 * on accumulated context rather than losing older information.
 */
export async function summarizeMiddle(
  middle: ReadonlyArray<CompressibleMessage>,
  config: Pick<CompressionConfig, 'budgetModel' | 'litellmUrl' | 'litellmApiKey' | 'fetch'>,
  previousSummary?: string | null,
): Promise<string> {
  if (middle.length === 0) return previousSummary ?? '';

  const fetchFn = config.fetch ?? globalThis.fetch;

  // Build the summarization prompt
  const summarizerMessages: Array<{ role: string; content: string }> = [];

  // If we have a previous summary, include it as context
  if (previousSummary) {
    summarizerMessages.push({
      role: 'system',
      content: `You are summarizing a conversation that has been compressed before. Here is the previous summary:\n\n${previousSummary}\n\nNow incorporate the new messages below into an updated summary.`,
    });
  }

  // Add the middle messages as the conversation to summarize
  for (const msg of middle) {
    summarizerMessages.push({ role: msg.role === 'system' ? 'user' : msg.role, content: msg.content ?? '' });
  }

  // Add the compaction instruction as the final user message
  summarizerMessages.push({ role: 'user', content: COMPACTION_PROMPT });

  const body = {
    model: config.budgetModel,
    messages: summarizerMessages,
    max_tokens: 2000,
    temperature: 0.1,
  };

  const response = await fetchFn(`${config.litellmUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.litellmApiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    // On summarizer failure, fall back to a basic text-only summary
    return buildFallbackSummary(middle, previousSummary);
  }

  const result = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = result.choices?.[0]?.message?.content;
  if (!content) {
    return buildFallbackSummary(middle, previousSummary);
  }

  return content;
}

/**
 * Fallback summary when the LLM call fails.
 * Extracts key signals from messages without any LLM.
 */
function buildFallbackSummary(
  middle: ReadonlyArray<CompressibleMessage>,
  previousSummary?: string | null,
): string {
  const userMessages = middle.filter(m => m.role === 'user');
  const firstLines = userMessages
    .map(m => (m.content ?? '').split('\n')[0]?.trim())
    .filter(line => line && line.length > 10 && line.length < 200)
    .slice(0, 5);

  const parts: string[] = [];
  if (previousSummary) {
    parts.push('## Previous Context\n' + previousSummary);
  }
  parts.push(`## Compressed Region (${middle.length} messages)`);
  if (firstLines.length > 0) {
    parts.push('Topics: ' + firstLines.join(' → '));
  }
  return parts.join('\n\n');
}

// ── Step 5: Compress Conversation (Orchestrator) ─────────────────────────

/**
 * Run the full 5-step compression pipeline.
 *
 * @param messages      Full conversation history
 * @param config        Compression configuration
 * @param previousSummary  Summary from a previous compression pass (for iterative use)
 * @returns CompressionResult with the compressed messages and metadata
 */
export async function compressConversation(
  messages: ReadonlyArray<CompressibleMessage>,
  config: CompressionConfig,
  previousSummary?: string | null,
): Promise<CompressionResult> {
  const originalTokens = estimateTokens(messages);

  // Step 1: Detect — do we need compression?
  if (!needsCompression(messages, config)) {
    return {
      messages: messages.map(m => ({ ...m })),
      compressed: false,
      originalTokens,
      compressedTokens: originalTokens,
      summaryGenerated: false,
      summary: previousSummary ?? null,
    };
  }

  // Step 2: Prune tool results in the non-tail region
  // Estimate how many messages fit in the tail based on token budget
  const avgTokensPerMsg = originalTokens / messages.length;
  const estimatedTailCount = Math.max(5, Math.ceil(config.protectedTailTokens / avgTokensPerMsg));
  const pruned = pruneToolResults(messages, estimatedTailCount);

  // Step 3: Split into protected head, compressible middle, protected tail
  const regions = splitProtectedRegions(pruned, config);

  // If middle is empty or very small, no point summarizing
  if (regions.middle.length <= 2) {
    const result = [...regions.head, ...regions.middle, ...regions.tail];
    return {
      messages: result,
      compressed: false,
      originalTokens,
      compressedTokens: estimateTokens(result),
      summaryGenerated: false,
      summary: previousSummary ?? null,
    };
  }

  // Step 4: Summarize the middle
  const summary = await summarizeMiddle(regions.middle, config, previousSummary);

  // Step 5: Inject — replace middle with a single summary message
  const summaryMessage: CompressibleMessage = {
    role: 'system',
    content: `[Conversation compressed — ${regions.middle.length} messages summarized]\n\n${summary}`,
  };

  const compressed = [...regions.head, summaryMessage, ...regions.tail];
  const compressedTokens = estimateTokens(compressed);

  return {
    messages: compressed,
    compressed: true,
    originalTokens,
    compressedTokens,
    summaryGenerated: true,
    summary,
  };
}

// ── Default Config Factory ───────────────────────────────────────────────

/** Sensible defaults for context compression */
export function createDefaultCompressionConfig(
  overrides: Partial<CompressionConfig> & Pick<CompressionConfig, 'budgetModel' | 'litellmUrl' | 'litellmApiKey'>,
): CompressionConfig {
  return {
    maxContextTokens: 128000,
    compressionThreshold: 0.5,
    protectedHeadMessages: 3,
    protectedTailTokens: 20000,
    ...overrides,
  };
}
