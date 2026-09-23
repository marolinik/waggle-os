/**
 * The state one chat turn's model attempts share (TD-CHAT-3).
 *
 * The handler kept this as eight `let`s and a `Set` read and written by the
 * agent-loop callbacks, `runAgentAttempt`, and the answer tail:
 * - the answer tokens buffered until an attempt completes, discarded when a
 *   new attempt begins, so a failed attempt's partial text never reaches the
 *   client;
 * - the `acquire_capability` results waiting to become proposals, and the one
 *   capability receipt the answer carries;
 * - the tools a failed attempt reported, which the turn's `done` still lists;
 * - the once-per-turn progress steps (request sent, model responding,
 *   reasoning, streaming) and the one-time initial-activity deadline.
 *
 * It holds state only. Which attempt runs next, and on which model, stays in
 * the route and in `TurnModelSelection`.
 */
import type { PersistedCapabilityReceipt } from './chat-persistence.js';

export interface PendingCapabilityToolResult {
  input: Record<string, unknown>;
  output: string;
  duration?: number;
}

/** Progress steps a turn announces at most once, however many attempts it makes. */
export type OnceStep = 'modelRequested' | 'modelResponding' | 'reasoning' | 'modelStreaming';

export class TurnAttemptState {
  private tokens: string[] = [];
  private receipt: PersistedCapabilityReceipt | null = null;
  private pendingCapabilities: PendingCapabilityToolResult[] = [];
  private readonly failedTools = new Set<string>();
  private readonly sentSteps = new Set<OnceStep>();
  private initialActivityDeadlineAvailable = true;

  /**
   * Starts a model attempt: drops the previous attempt's buffered tokens,
   * capability receipt and pending capability results. Failed-attempt tools
   * and sent steps carry over.
   */
  beginAttempt(): void {
    this.tokens = [];
    this.receipt = null;
    this.pendingCapabilities = [];
  }

  bufferToken(token: string): void {
    this.tokens.push(token);
  }

  /**
   * The token events for `finalContent`, then an empty buffer: the buffered
   * chunks when they spell the answer exactly, else the answer as one token
   * (none for an empty answer).
   */
  takeFinalTokenChunks(finalContent: string): string[] {
    const chunks = this.tokens.join('') === finalContent
      ? this.tokens
      : finalContent ? [finalContent] : [];
    this.tokens = [];
    return chunks;
  }

  /** True the first time `step` is claimed in this turn, false after. */
  claimOnce(step: OnceStep): boolean {
    if (this.sentSteps.has(step)) return false;
    this.sentSteps.add(step);
    return true;
  }

  /** True for the turn's first attempt only: later attempts get no initial-activity deadline. */
  takeInitialActivityDeadline(): boolean {
    const available = this.initialActivityDeadlineAvailable;
    this.initialActivityDeadlineAvailable = false;
    return available;
  }

  /** Records the non-blank string entries of a failed attempt's `toolsUsed`. */
  recordFailedTools(tools: unknown): void {
    if (!Array.isArray(tools)) return;
    for (const tool of tools) {
      if (typeof tool === 'string' && tool.trim()) this.failedTools.add(tool.trim());
    }
  }

  /** Records the tools of an attempt that answered with empty content, as given. */
  recordFailedToolNames(tools: Iterable<string>): void {
    for (const tool of tools) this.failedTools.add(tool);
  }

  /** Failed-attempt tools first, then `answerTools`, each once. */
  toolsUsedWith(answerTools: readonly string[] | undefined): string[] {
    return [...new Set([...this.failedTools, ...(answerTools ?? [])])];
  }

  addPendingCapability(result: PendingCapabilityToolResult): void {
    this.pendingCapabilities.push(result);
  }

  /** The pending capability results, then an empty list. */
  takePendingCapabilities(): PendingCapabilityToolResult[] {
    const pending = this.pendingCapabilities;
    this.pendingCapabilities = [];
    return pending;
  }

  get capabilityReceipt(): PersistedCapabilityReceipt | null {
    return this.receipt;
  }

  /** Keeps the current receipt when `receipt` is null. */
  offerCapabilityReceipt(receipt: PersistedCapabilityReceipt | null): void {
    this.receipt = receipt ?? this.receipt;
  }
}
