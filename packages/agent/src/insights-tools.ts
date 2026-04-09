/**
 * Insights Tools — self-analytics for the agent (Hermes-inspired).
 *
 * Provides the agent with awareness of its own performance:
 * - Tool usage frequency and success rates
 * - Cost per model
 * - Correction frequency trends
 * - Improvement signal summary
 *
 * This enables the agent to reflect on what works and adapt strategy.
 */

import type { ToolDefinition } from './tools.js';

export interface InsightsDeps {
  getOptimizationLogs: (limit: number) => Array<{
    model?: string;
    tool_names?: string;
    total_tokens?: number;
    estimated_cost?: number;
    was_correction?: number;
    created_at?: string;
  }>;
  getImprovementSignals: () => Array<{
    category: string;
    pattern_key: string;
    detail: string;
    count: number;
    first_seen: string;
    last_seen: string;
  }>;
}

export function createInsightsTools(deps: InsightsDeps): ToolDefinition[] {
  return [
    {
      name: 'agent_insights',
      description: [
        'Analyze your own performance metrics. Returns: tool usage frequency,',
        'cost per model, correction rate, and active improvement signals.',
        'Use this to reflect on what approaches work and adapt your strategy.',
        'Call this when you want to understand your performance patterns.',
      ].join(' '),
      parameters: {
        type: 'object' as const,
        required: [],
        properties: {
          lookbackDays: {
            type: 'number' as const,
            description: 'Number of days to analyze (default 30)',
          },
        },
      },
      execute: async (args: Record<string, unknown>) => {
        const lookbackDays = (args.lookbackDays as number) ?? 30;
        const limit = lookbackDays * 50; // ~50 interactions/day estimate

        try {
          const logs = deps.getOptimizationLogs(limit);
          const signals = deps.getImprovementSignals();

          // Tool usage frequency
          const toolCounts: Record<string, { total: number; successes: number }> = {};
          for (const log of logs) {
            const tools = log.tool_names?.split(',').map(t => t.trim()).filter(Boolean) ?? [];
            const isCorrection = log.was_correction === 1;
            for (const tool of tools) {
              if (!toolCounts[tool]) toolCounts[tool] = { total: 0, successes: 0 };
              toolCounts[tool].total++;
              if (!isCorrection) toolCounts[tool].successes++;
            }
          }

          const toolStats = Object.entries(toolCounts)
            .sort((a, b) => b[1].total - a[1].total)
            .slice(0, 15)
            .map(([name, stats]) => ({
              tool: name,
              uses: stats.total,
              successRate: stats.total > 0 ? Math.round((stats.successes / stats.total) * 100) : 0,
            }));

          // Cost per model
          const modelCosts: Record<string, { calls: number; tokens: number; cost: number }> = {};
          for (const log of logs) {
            const model = log.model ?? 'unknown';
            if (!modelCosts[model]) modelCosts[model] = { calls: 0, tokens: 0, cost: 0 };
            modelCosts[model].calls++;
            modelCosts[model].tokens += log.total_tokens ?? 0;
            modelCosts[model].cost += log.estimated_cost ?? 0;
          }

          const modelStats = Object.entries(modelCosts)
            .sort((a, b) => b[1].calls - a[1].calls)
            .map(([model, stats]) => ({
              model,
              calls: stats.calls,
              tokens: stats.tokens,
              costUsd: Math.round(stats.cost * 100) / 100,
            }));

          // Correction rate
          const totalInteractions = logs.length;
          const corrections = logs.filter(l => l.was_correction === 1).length;
          const correctionRate = totalInteractions > 0
            ? Math.round((corrections / totalInteractions) * 100)
            : 0;

          // Active improvement signals
          const activeSignals = signals
            .filter(s => s.count >= 2)
            .slice(0, 10)
            .map(s => ({
              category: s.category,
              pattern: s.pattern_key,
              detail: s.detail,
              occurrences: s.count,
              lastSeen: s.last_seen,
            }));

          return JSON.stringify({
            period: `Last ${lookbackDays} days`,
            totalInteractions,
            correctionRate: `${correctionRate}%`,
            topTools: toolStats,
            modelUsage: modelStats,
            improvementSignals: activeSignals,
            recommendation: correctionRate > 15
              ? 'High correction rate — review recent corrections and adjust approach.'
              : correctionRate > 5
              ? 'Moderate corrections — some patterns may need attention.'
              : 'Low correction rate — current approach is working well.',
          }, null, 2);
        } catch (err: any) {
          return `Error generating insights: ${err.message}`;
        }
      },
    },
  ];
}
