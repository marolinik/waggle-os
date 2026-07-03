export interface ModelPricing {
  inputPer1k: number;
  outputPer1k: number;
}

export interface UsageEntry {
  model: string;
  input: number;
  output: number;
  timestamp: string;
  workspaceId?: string;
}

export interface UsageStats {
  totalInputTokens: number;
  totalOutputTokens: number;
  estimatedCost: number;
  turns: number;
  byModel: Record<string, { input: number; output: number; cost: number }>;
}

/** Default pricing for common models (per 1K tokens). Model IDs cross-checked
 *  against litellm-config.yaml (repo root) — the canonical router catalog. */
export const DEFAULT_MODEL_PRICING: Record<string, ModelPricing> = {
  // ── Anthropic Claude — Opus class ($15/$75 per 1M) ──
  'claude-opus-4-8': { inputPer1k: 0.015, outputPer1k: 0.075 },
  'claude-opus-4-7': { inputPer1k: 0.015, outputPer1k: 0.075 },
  'claude-opus-4-6': { inputPer1k: 0.015, outputPer1k: 0.075 },
  // ── Claude — Sonnet class ($3/$15 per 1M) ──
  'claude-sonnet-5': { inputPer1k: 0.003, outputPer1k: 0.015 },
  'claude-sonnet-4-6': { inputPer1k: 0.003, outputPer1k: 0.015 },
  'claude-sonnet-4-20250514': { inputPer1k: 0.003, outputPer1k: 0.015 },
  'claude-3-5-sonnet-20241022': { inputPer1k: 0.003, outputPer1k: 0.015 },
  // ── Claude — Haiku class ──
  'claude-haiku-4-5': { inputPer1k: 0.001, outputPer1k: 0.005 }, // 4.5 ($1/$5 per 1M)
  'claude-haiku-4-5-20251001': { inputPer1k: 0.001, outputPer1k: 0.005 },
  'claude-haiku-3-5': { inputPer1k: 0.00025, outputPer1k: 0.00125 },
  'claude-3-5-haiku-20241022': { inputPer1k: 0.00025, outputPer1k: 0.00125 },
};

/**
 * Family-aware fallback pricing for a model id with no explicit entry. Keys off
 * the Anthropic tier word in the id so an unrecognized Opus snapshot isn't
 * costed at ~5× under Sonnet rates. Defaults to Sonnet for everything else.
 */
function fallbackPricingFor(model: string): { label: string; pricing: ModelPricing } {
  const m = model.toLowerCase();
  if (m.includes('opus')) return { label: 'Opus', pricing: { inputPer1k: 0.015, outputPer1k: 0.075 } };
  if (m.includes('haiku')) return { label: 'Haiku', pricing: { inputPer1k: 0.001, outputPer1k: 0.005 } };
  return { label: 'Sonnet', pricing: { inputPer1k: 0.003, outputPer1k: 0.015 } };
}

/** Models already warned about — keeps the unknown-model warning to once each. */
const warnedUnknownModels = new Set<string>();

export type BudgetMode = 'soft' | 'hard';

export class BudgetExceededError extends Error {
  public readonly budgetUsd: number;
  public readonly currentUsd: number;
  constructor(budgetUsd: number, currentUsd: number) {
    super(`Daily budget exceeded: $${currentUsd.toFixed(4)} / $${budgetUsd.toFixed(2)} (hard cap)`);
    this.name = 'BudgetExceededError';
    this.budgetUsd = budgetUsd;
    this.currentUsd = currentUsd;
  }
}

export class CostTracker {
  private pricing: Record<string, ModelPricing>;
  private usage: UsageEntry[] = [];
  private dailyBudgetUsd: number | null = null;
  private budgetMode: BudgetMode = 'soft';

  constructor(pricing: Record<string, ModelPricing> = {}) {
    this.pricing = { ...DEFAULT_MODEL_PRICING, ...pricing };
  }

  setBudget(dailyUsd: number | null, mode: BudgetMode = 'soft'): void {
    this.dailyBudgetUsd = dailyUsd;
    this.budgetMode = mode;
  }

  getBudget(): { dailyBudgetUsd: number | null; mode: BudgetMode } {
    return { dailyBudgetUsd: this.dailyBudgetUsd, mode: this.budgetMode };
  }

  /**
   * Check if daily budget allows proceeding. Returns true if OK.
   * In hard mode, throws BudgetExceededError. In soft mode, returns false but doesn't throw.
   */
  checkBudget(): boolean {
    if (this.dailyBudgetUsd === null) return true;
    const current = this.getDailyTotal();
    if (current >= this.dailyBudgetUsd) {
      if (this.budgetMode === 'hard') {
        throw new BudgetExceededError(this.dailyBudgetUsd, current);
      }
      return false;
    }
    return true;
  }

  addUsage(model: string, inputTokens: number, outputTokens: number, workspaceId?: string): void {
    this.usage.push({
      model,
      input: inputTokens,
      output: outputTokens,
      timestamp: new Date().toISOString(),
      workspaceId,
    });
  }

  /** Get raw usage entries (for cost routes). */
  getUsageEntries(): ReadonlyArray<UsageEntry> {
    return this.usage;
  }

  /** Calculate cost for a single usage entry. */
  calculateCost(input: number, output: number, model: string): number {
    const price = this.pricing[model];
    if (price) {
      return (input / 1000) * price.inputPer1k + (output / 1000) * price.outputPer1k;
    }
    // Unknown model: fall back to family-aware pricing (not always Sonnet — an
    // unrecognized Opus id would otherwise under-report ~5×) and warn loudly
    // once so the cost isn't silently wrong.
    const { label, pricing } = fallbackPricingFor(model);
    if (!warnedUnknownModels.has(model)) {
      warnedUnknownModels.add(model);
      console.warn(
        `[cost-tracker] Unknown model "${model}" — no pricing entry; estimating with ` +
          `${label} pricing ($${pricing.inputPer1k}/1K in, $${pricing.outputPer1k}/1K out). ` +
          `Cost may be inaccurate — add it to DEFAULT_MODEL_PRICING.`,
      );
    }
    return (input / 1000) * pricing.inputPer1k + (output / 1000) * pricing.outputPer1k;
  }

  getStats(): UsageStats {
    let totalInput = 0, totalOutput = 0, totalCost = 0;
    const byModel: Record<string, { input: number; output: number; cost: number }> = {};

    for (const u of this.usage) {
      totalInput += u.input;
      totalOutput += u.output;
      const cost = this.calculateCost(u.input, u.output, u.model);
      totalCost += cost;
      if (!byModel[u.model]) byModel[u.model] = { input: 0, output: 0, cost: 0 };
      byModel[u.model].input += u.input;
      byModel[u.model].output += u.output;
      byModel[u.model].cost += cost;
    }

    return { totalInputTokens: totalInput, totalOutputTokens: totalOutput, estimatedCost: totalCost, turns: this.usage.length, byModel };
  }

  /** Get total estimated cost for a specific workspace (current session). */
  getWorkspaceCost(workspaceId: string): number {
    let total = 0;
    for (const u of this.usage) {
      if (u.workspaceId === workspaceId) {
        total += this.calculateCost(u.input, u.output, u.model);
      }
    }
    return total;
  }

  /** Get total estimated cost for the current session (proxy for daily total). */
  getDailyTotal(): number {
    return this.getStats().estimatedCost;
  }

  formatSummary(): string {
    const stats = this.getStats();
    return `Tokens: ${stats.totalInputTokens} in / ${stats.totalOutputTokens} out (${stats.turns} turns) | Est. cost: $${stats.estimatedCost.toFixed(4)}`;
  }
}
