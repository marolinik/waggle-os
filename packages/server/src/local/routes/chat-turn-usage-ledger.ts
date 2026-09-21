/**
 * Turn Usage Ledger — whole-turn token accounting for one chat turn.
 *
 * A turn can dispatch several model attempts (a same-model replay after a
 * stream interruption, a credential rotation, a model fallback), and each one
 * that consumed tokens is billable whether or not it answered. Before this
 * module those eight facts were eight hoisted mutable variables inside the
 * `POST /api/chat` closure, and the fold that turns them into the turn total was
 * written out VERBATIM TWICE — once on the aborted-after-attempt path and once
 * on the normal completion path. The receipt-push was written out twice more.
 *
 * Extracting them as a class is the Replace Method with Method Object move
 * applied to one cohesive cluster (TD-CHAT-3): the locals become fields, so the
 * arithmetic can be named without threading six variables through a parameter
 * list. It imports no framework, no persistence and no `node:` I/O.
 *
 * Two invariants the route relied on implicitly and this module now states:
 *  - A failed attempt is only billable once a model has been chosen for it.
 *    Before `beginAttempt` there is nobody to bill, so the receipt is dropped.
 *  - Whole-turn provenance stays `priced` if ANY attempted model was priced. A
 *    later free fallback cannot erase spend already incurred.
 */
import type { AgentLoopConfig } from '@waggle/agent';

export type TurnTokenUsage = { inputTokens: number; outputTokens: number };

export type TurnBillingClass = NonNullable<AgentLoopConfig['modelSpendBillingClass']>;

export type AttemptUsageReceipt = {
  model: string;
  billingClass: TurnBillingClass;
  usage: TurnTokenUsage;
  estimated?: boolean;
};

/**
 * Usage worth billing for: both counts present, finite, non-negative, and not
 * both zero. A zero-token attempt is not a receipt — it is an attempt that cost
 * nothing, and writing it down would only make the turn look estimated.
 */
export function getBillableUsage(usage: unknown): TurnTokenUsage | null {
  const candidate = usage as {
    inputTokens?: unknown;
    outputTokens?: unknown;
  } | null | undefined;
  if (!candidate
    || typeof candidate.inputTokens !== 'number'
    || !Number.isFinite(candidate.inputTokens)
    || candidate.inputTokens < 0
    || typeof candidate.outputTokens !== 'number'
    || !Number.isFinite(candidate.outputTokens)
    || candidate.outputTokens < 0
    || candidate.inputTokens + candidate.outputTokens <= 0) {
    return null;
  }
  return {
    inputTokens: candidate.inputTokens,
    outputTokens: candidate.outputTokens,
  };
}

export class TurnUsageLedger {
  private attemptModelId: string | null = null;
  private attemptBillingClassId: TurnBillingClass = 'priced';
  private readonly attemptedBillingClasses = new Set<TurnBillingClass>();
  private readonly failedReceipts: AttemptUsageReceipt[] = [];
  private completedReceipt: AttemptUsageReceipt | null = null;
  private totalUsage: TurnTokenUsage = { inputTokens: 0, outputTokens: 0 };
  private abortedUsage: TurnTokenUsage | null = null;
  private accounted = false;

  /** The model the current attempt is billed against, if one has been chosen. */
  get attemptModel(): string | null {
    return this.attemptModelId;
  }

  get attemptBillingClass(): TurnBillingClass {
    return this.attemptBillingClassId;
  }

  /** Every token the turn has consumed across all of its attempts. */
  get total(): TurnTokenUsage {
    return { ...this.totalUsage };
  }

  /**
   * The turn total as of the last completed attempt, kept so an abort that
   * happens after the model answered can still bill what it consumed. Cleared
   * at the start of each attempt: an attempt that has not completed has not
   * produced a figure to fall back to.
   */
  get abortedAttemptUsage(): TurnTokenUsage | null {
    return this.abortedUsage ? { ...this.abortedUsage } : null;
  }

  /** True once the turn's tokens have been charged, so no path charges twice. */
  get isAccounted(): boolean {
    return this.accounted;
  }

  /** True when any billed attempt reported an estimate rather than a count. */
  get isEstimated(): boolean {
    return this.failedReceipts.some(receipt => receipt.estimated === true);
  }

  /** Every receipt the turn can be billed for, failed attempts first. */
  get receipts(): AttemptUsageReceipt[] {
    return [
      ...this.failedReceipts,
      ...(this.completedReceipt ? [this.completedReceipt] : []),
    ];
  }

  /**
   * Whole-turn billing provenance. `free` only when every attempted model was
   * free; one priced attempt prices the turn.
   */
  get messageBillingClass(): TurnBillingClass {
    return this.attemptedBillingClasses.size > 0
      && [...this.attemptedBillingClasses].every(billingClass => billingClass === 'free')
      ? 'free'
      : 'priced';
  }

  /** Point the ledger at the model this attempt will actually run on. */
  beginAttempt(model: string, billingClass: TurnBillingClass): void {
    this.attemptModelId = model;
    this.attemptBillingClassId = billingClass;
    this.attemptedBillingClasses.add(billingClass);
    this.abortedUsage = null;
  }

  /** Bill an attempt that threw. Dropped when it consumed nothing. */
  recordFailedAttempt(
    usage: TurnTokenUsage | null,
    options: { estimated?: boolean } = {},
  ): void {
    if (!usage || !this.attemptModelId) return;
    this.failedReceipts.push({
      model: this.attemptModelId,
      billingClass: this.attemptBillingClassId,
      usage,
      ...(options.estimated ? { estimated: true } : {}),
    });
  }

  /**
   * Bill the attempt that answered and fold the turn total. `fallbackModel`
   * covers a completion that arrived without `beginAttempt` — an injected
   * runner, which the route still has to bill against something.
   */
  completeAttempt(
    usage: { inputTokens?: number; outputTokens?: number } | null | undefined,
    fallbackModel: string,
  ): void {
    this.completedReceipt = {
      model: this.attemptModelId ?? fallbackModel,
      billingClass: this.attemptBillingClassId,
      usage: {
        inputTokens: usage?.inputTokens ?? 0,
        outputTokens: usage?.outputTokens ?? 0,
      },
    };
    this.totalUsage = this.failedReceipts.reduce(
      (total, receipt) => ({
        inputTokens: total.inputTokens + receipt.usage.inputTokens,
        outputTokens: total.outputTokens + receipt.usage.outputTokens,
      }),
      { ...this.completedReceipt.usage },
    );
    this.abortedUsage = getBillableUsage(this.totalUsage);
  }

  markAccounted(): void {
    this.accounted = true;
  }
}
