/**
 * IterationBudget — per-conversation LLM call counter with pressure warnings.
 */

export interface IterationBudgetConfig {
  maxIterations: number;
  cautionThreshold?: number;
  warningThreshold?: number;
  freeToolCalls?: string[];
}

export class IterationBudget {
  private readonly max: number;
  private readonly cautionAt: number;
  private readonly warningAt: number;
  private readonly freeTools: ReadonlySet<string>;
  private count = 0;

  constructor(config: IterationBudgetConfig) {
    this.max = config.maxIterations;
    this.cautionAt = config.cautionThreshold ?? 0.7;
    this.warningAt = config.warningThreshold ?? 0.9;
    this.freeTools = new Set(config.freeToolCalls ?? []);
  }

  tick(toolName?: string): void {
    if (toolName && this.freeTools.has(toolName)) return;
    this.count++;
  }

  get used(): number { return this.count; }
  get remaining(): number { return Math.max(0, this.max - this.count); }
  get exhausted(): boolean { return this.count >= this.max; }

  getPressureMessage(): string | null {
    const fraction = this.count / this.max;
    if (fraction >= this.warningAt) {
      return `\n\n[BUDGET WARNING: ${this.remaining}/${this.max} iterations remaining. Wrap up immediately and respond to the user NOW.]`;
    }
    if (fraction >= this.cautionAt) {
      return `\n\n[BUDGET: ${this.remaining}/${this.max} iterations remaining. Start consolidating your work and prepare a response.]`;
    }
    return null;
  }
}
