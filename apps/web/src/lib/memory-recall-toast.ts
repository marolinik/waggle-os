/**
 * "I just remembered" toast trigger (M-22 / ENG-1).
 *
 * Fires once per chat session when the user has sent exactly
 * MEMORY_RECALL_TRIGGER_AT messages and a memory search returns at
 * least one relevant frame. The user-facing intent: Waggle proves
 * its long-term memory by surfacing something genuinely relevant
 * right when the conversation is picking up.
 */

/** Number of user messages at which the recall toast should fire. */
export const MEMORY_RECALL_TRIGGER_AT = 5;

/** Maximum characters of recalled content to show in the toast body. */
export const MEMORY_RECALL_PREVIEW_LIMIT = 150;

/** How many recent user messages to fold into the search query. */
export const MEMORY_RECALL_QUERY_WINDOW = 3;

export interface MemoryRecallTriggerInput {
  /** Count of user-role messages in the current session. */
  readonly userMessageCount: number;
  /** Whether this session has already fired the toast. */
  readonly alreadyFired: boolean;
}

/**
 * Pure decision: should the recall toast fire right now?
 * True only when the count hits exactly the trigger and we haven't
 * fired yet. Returning false once the count moves past the trigger
 * prevents late firing if messages replay (e.g. session reload with
 * saved history).
 */
export function shouldFireMemoryRecall(input: MemoryRecallTriggerInput): boolean {
  if (input.alreadyFired) return false;
  if (!Number.isFinite(input.userMessageCount)) return false;
  return input.userMessageCount === MEMORY_RECALL_TRIGGER_AT;
}

export interface MessageLike {
  readonly role: string;
  readonly content?: string | null;
}

/**
 * Build a recall query from the last MEMORY_RECALL_QUERY_WINDOW user
 * messages. Collapses whitespace, trims, and caps at 500 characters
 * — longer queries dilute semantic search signal.
 */
export function buildRecallQuery(messages: readonly MessageLike[]): string {
  const userMsgs = messages
    .filter(m => m.role === 'user' && typeof m.content === 'string' && m.content.trim().length > 0);
  const window = userMsgs.slice(-MEMORY_RECALL_QUERY_WINDOW);
  const joined = window
    .map(m => (m.content as string).replace(/\s+/g, ' ').trim())
    .join(' ');
  return joined.slice(0, 500);
}

/**
 * Trim a recalled frame's content into a toast-sized preview. Cuts on
 * a word boundary when possible and appends an ellipsis if truncated.
 */
export function previewRecall(content: string, limit: number = MEMORY_RECALL_PREVIEW_LIMIT): string {
  const collapsed = content.replace(/\s+/g, ' ').trim();
  if (collapsed.length <= limit) return collapsed;
  const cut = collapsed.slice(0, limit);
  const lastSpace = cut.lastIndexOf(' ');
  const base = lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut;
  return `${base}\u2026`;
}
