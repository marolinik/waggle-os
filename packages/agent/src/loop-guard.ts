import { createHash } from 'node:crypto';

export interface LoopGuardConfig {
  maxRepeats?: number;
  /** Size of the rolling window for oscillation detection (default: 10) */
  windowSize?: number;
  /** Number of times a hash can appear in the window before flagging a loop (default: 4) */
  windowThreshold?: number;
  /** T1 — identical tool+args calls (any outcome) before a "result already returned" block (default: 5) */
  identicalCallLimit?: number;
  /** T2 — identical consecutive FAILURES before a block (default: 3) */
  identicalFailureLimit?: number;
  /** T4 — same-tool (any-args) consecutive FAILURES before a block (default: 6) */
  sameToolFailureLimit?: number;
  /** T3 — same-tool consecutive FAILURES before a HARD ABORT (default: 8) */
  criticalFailureLimit?: number;
  /** Cap on the retained (toolName, argsHash, success) history (default: 50) */
  historyCap?: number;
}

/** One recorded tool execution outcome (feeds the graduated tiers). */
interface CallRecord {
  toolName: string;
  argsHash: string;
  success: boolean;
}

interface SuccessfulReadRange {
  path: string;
  start: number;
  end: number;
  lineNumbers: boolean;
}

const FILE_MUTATION_TOOLS = new Set([
  'bash', 'run_code', 'write_file', 'edit_file', 'multi_edit',
  'git_commit', 'git_merge', 'git_pull', 'git_stash',
]);

/**
 * Graduated verdict from {@link LoopGuard.checkTiered}. `block` results are
 * surfaced as first-party tool-result nudges; `abort` is a hard stop that the
 * agent loop turns into a user-facing give-up message and run termination.
 */
export type LoopGuardVerdict =
  | { action: 'allow' }
  | { action: 'block'; tier: 'T1' | 'T2' | 'T4'; reason: string }
  | { action: 'abort'; tier: 'T3'; reason: string };

export class LoopGuard {
  private maxRepeats: number;
  private lastHash: string | null = null;
  private consecutiveCount = 0;

  /** Rolling window of recent call hashes for oscillation detection */
  private window: string[] = [];
  private windowSize: number;
  private windowThreshold: number;

  /** Graduated-tier state: outcome history of attempted executions. */
  private history: CallRecord[] = [];
  private successfulReadRanges: SuccessfulReadRange[] = [];
  private identicalCallLimit: number;
  private identicalFailureLimit: number;
  private sameToolFailureLimit: number;
  private criticalFailureLimit: number;
  private historyCap: number;

  constructor(config: LoopGuardConfig = {}) {
    this.maxRepeats = config.maxRepeats ?? 3;
    this.windowSize = config.windowSize ?? 10;
    this.windowThreshold = config.windowThreshold ?? 4;
    this.identicalCallLimit = config.identicalCallLimit ?? 5;
    this.identicalFailureLimit = config.identicalFailureLimit ?? 3;
    this.sameToolFailureLimit = config.sameToolFailureLimit ?? 6;
    this.criticalFailureLimit = config.criticalFailureLimit ?? 8;
    this.historyCap = config.historyCap ?? 50;
  }

  check(toolName: string, args: Record<string, unknown>): boolean {
    const hash = createHash('sha256')
      .update(toolName + ':' + JSON.stringify(args))
      .digest('hex');

    // Consecutive repeat detection (existing behavior)
    if (hash === this.lastHash) {
      this.consecutiveCount++;
    } else {
      this.lastHash = hash;
      this.consecutiveCount = 1;
    }

    if (this.consecutiveCount > this.maxRepeats) {
      return false;
    }

    // Rolling window oscillation detection
    this.window.push(hash);
    if (this.window.length > this.windowSize) {
      this.window.shift();
    }

    // Count occurrences of current hash in the window
    let count = 0;
    for (const h of this.window) {
      if (h === hash) count++;
    }

    if (count >= this.windowThreshold) {
      return false;
    }

    return true;
  }

  /**
   * Record the outcome of an attempted execution. The tool-executor feeds
   * pass/fail from its try/catch; blocked (never-executed) calls are NOT
   * recorded so a block never feeds the failure tiers.
   */
  record(toolName: string, args: Record<string, unknown>, success: boolean): void {
    this.history.push({ toolName, argsHash: this.hashArgs(args), success });
    if (this.history.length > this.historyCap) {
      this.history.splice(0, this.history.length - this.historyCap);
    }
    if (!success) return;
    if (FILE_MUTATION_TOOLS.has(toolName)) {
      this.successfulReadRanges = [];
      return;
    }
    const range = this.readRange(toolName, args);
    if (!range) return;
    this.successfulReadRanges = this.successfulReadRanges.filter(existing => !(
      existing.path === range.path
      && existing.lineNumbers === range.lineNumbers
      && range.start <= existing.start
      && range.end >= existing.end
    ));
    this.successfulReadRanges.push(range);
    if (this.successfulReadRanges.length > this.historyCap) {
      this.successfulReadRanges.splice(0, this.successfulReadRanges.length - this.historyCap);
    }
  }

  /**
   * Graduated stops layered on top of {@link check}. Evaluated in the order
   * T3 → T1 → T2 → T4 so the hard-abort wins over the same-tool block when a
   * failure streak crosses both thresholds. All scans read the recorded history
   * from the tail and stop (implicit reset) on the first break condition.
   */
  checkTiered(toolName: string, args: Record<string, unknown>): LoopGuardVerdict {
    const argsHash = this.hashArgs(args);
    const requestedRead = this.readRange(toolName, args);
    if (requestedRead && this.successfulReadRanges.some(existing => (
      existing.path === requestedRead.path
      && existing.lineNumbers === requestedRead.lineNumbers
      && existing.start <= requestedRead.start
      && existing.end >= requestedRead.end
    ))) {
      return {
        action: 'block',
        tier: 'T1',
        reason: 'This file range was already read successfully. Use the prior result instead of reading it again.',
      };
    }

    // Same-tool consecutive failures (shared by T3 abort + T4 block).
    // Break on a different tool or on a success.
    let sameToolFailures = 0;
    for (let i = this.history.length - 1; i >= 0; i--) {
      const e = this.history[i];
      if (e.toolName !== toolName || e.success) break;
      sameToolFailures++;
    }
    if (sameToolFailures >= this.criticalFailureLimit) {
      return {
        action: 'abort',
        tier: 'T3',
        reason:
          `I wasn't able to complete this — the ${toolName} tool failed repeatedly. ` +
          `Try rephrasing your request, breaking it into smaller steps, or approaching it a different way.`,
      };
    }

    // T1 — identical tool+args, any outcome. Break on a different call.
    let identicalCalls = 0;
    for (let i = this.history.length - 1; i >= 0; i--) {
      const e = this.history[i];
      if (e.toolName !== toolName || e.argsHash !== argsHash) break;
      identicalCalls++;
    }
    if (identicalCalls >= this.identicalCallLimit) {
      return {
        action: 'block',
        tier: 'T1',
        reason:
          `Error: ${toolName} was already called with these exact arguments and returned the same result. ` +
          `Use the result you already have or try a different approach.`,
      };
    }

    // T2 — identical consecutive failures. Break on a different call or a success.
    let identicalFailures = 0;
    for (let i = this.history.length - 1; i >= 0; i--) {
      const e = this.history[i];
      if (e.toolName !== toolName || e.argsHash !== argsHash || e.success) break;
      identicalFailures++;
    }
    if (identicalFailures >= this.identicalFailureLimit) {
      return {
        action: 'block',
        tier: 'T2',
        reason:
          `Error: ${toolName} has failed repeatedly with these exact arguments. ` +
          `Change the arguments or try a different approach.`,
      };
    }

    // T4 — same-tool failures below the critical threshold.
    if (sameToolFailures >= this.sameToolFailureLimit) {
      return {
        action: 'block',
        tier: 'T4',
        reason:
          `Error: ${toolName} has failed repeatedly. Try a different tool or a different approach.`,
      };
    }

    return { action: 'allow' };
  }

  /** Number of retained outcome records (bounded by historyCap). */
  get historySize(): number {
    return this.history.length;
  }

  reset(): void {
    this.lastHash = null;
    this.consecutiveCount = 0;
    this.window = [];
    this.history = [];
    this.successfulReadRanges = [];
  }

  private hashArgs(args: Record<string, unknown>): string {
    return createHash('sha256').update(JSON.stringify(args)).digest('hex');
  }

  private readRange(toolName: string, args: Record<string, unknown>): SuccessfulReadRange | null {
    if (toolName !== 'read_file' || typeof args.path !== 'string' || args.path.trim().length === 0) {
      return null;
    }
    const path = args.path.trim().replace(/\\/g, '/').replace(/^\.\/+/, '');
    const start = typeof args.offset === 'number' && Number.isFinite(args.offset) && args.offset >= 1
      ? Math.floor(args.offset)
      : 1;
    if (args.limit !== undefined
      && (typeof args.limit !== 'number' || !Number.isFinite(args.limit) || args.limit < 1)) {
      return null;
    }
    const end = typeof args.limit === 'number'
      ? start + Math.floor(args.limit) - 1
      : Number.POSITIVE_INFINITY;
    return { path, start, end, lineNumbers: args.line_numbers === true };
  }
}
