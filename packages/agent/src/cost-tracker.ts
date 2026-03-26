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

/** Default pricing for common models (per 1K tokens). */
export const DEFAULT_MODEL_PRICING: Record<string, ModelPricing> = {
  'claude-sonnet-4-6': { inputPer1k: 0.003, outputPer1k: 0.015 },
  'claude-sonnet-4-20250514': { inputPer1k: 0.003, outputPer1k: 0.015 },
  'claude-haiku-3-5': { inputPer1k: 0.00025, outputPer1k: 0.00125 },
  'claude-3-5-haiku-20241022': { inputPer1k: 0.00025, outputPer1k: 0.00125 },
  'claude-opus-4-6': { inputPer1k: 0.015, outputPer1k: 0.075 },
  'claude-3-5-sonnet-20241022': { inputPer1k: 0.003, outputPer1k: 0.015 },
};

export class CostTracker {
  private pricing: Record<string, ModelPricing>;
  private usage: UsageEntry[] = [];

  constructor(pricing: Record<string, ModelPricing> = {}) {
    // Merge user pricing with defaults (user pricing takes precedence)
    this.pricing = { ...DEFAULT_MODEL_PRICING, ...pricing };
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
    if (!price) {
      // Fallback: use Sonnet pricing as a sensible default
      return (input / 1000) * 0.003 + (output / 1000) * 0.015;
    }
    return (input / 1000) * price.inputPer1k + (output / 1000) * price.outputPer1k;
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

  formatSummary(): string {
    const stats = this.getStats();
    return `Tokens: ${stats.totalInputTokens} in / ${stats.totalOutputTokens} out (${stats.turns} turns) | Est. cost: $${stats.estimatedCost.toFixed(4)}`;
  }
}
