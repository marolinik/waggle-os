import { createHash } from 'node:crypto';

export interface LoopGuardConfig {
  maxRepeats?: number;
  /** Size of the rolling window for oscillation detection (default: 10) */
  windowSize?: number;
  /** Number of times a hash can appear in the window before flagging a loop (default: 4) */
  windowThreshold?: number;
}

export class LoopGuard {
  private maxRepeats: number;
  private lastHash: string | null = null;
  private consecutiveCount = 0;

  /** Rolling window of recent call hashes for oscillation detection */
  private window: string[] = [];
  private windowSize: number;
  private windowThreshold: number;

  constructor(config: LoopGuardConfig = {}) {
    this.maxRepeats = config.maxRepeats ?? 3;
    this.windowSize = config.windowSize ?? 10;
    this.windowThreshold = config.windowThreshold ?? 4;
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

  reset(): void {
    this.lastHash = null;
    this.consecutiveCount = 0;
    this.window = [];
  }
}
