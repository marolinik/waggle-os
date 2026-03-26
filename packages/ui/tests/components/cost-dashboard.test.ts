/**
 * Cost Dashboard — data shape and budget alert logic tests.
 *
 * Tests the budget alert threshold math used in the cost dashboard.
 * CostTracker behavior is tested in @waggle/agent tests (cost-tracker.test.ts).
 *
 * Part of PM-4 — Agent Cost Dashboard.
 */

import { describe, it, expect } from 'vitest';

/** Budget status determination logic (mirrors cost.ts route logic). */
function determineBudgetStatus(todayCost: number, dailyBudget: number | null): {
  status: 'ok' | 'warning' | 'exceeded';
  percent: number;
} {
  if (dailyBudget === null || dailyBudget <= 0) {
    return { status: 'ok', percent: 0 };
  }
  const percent = Math.round((todayCost / dailyBudget) * 100);
  if (todayCost >= dailyBudget) {
    return { status: 'exceeded', percent };
  }
  if (todayCost >= dailyBudget * 0.8) {
    return { status: 'warning', percent };
  }
  return { status: 'ok', percent };
}

/** Token formatting logic (mirrors CostDashboardCard). */
function formatTokens(n: number): string {
  if (n === 0) return '0';
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}K`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}

/** Cost formatting logic (mirrors CostDashboardCard). */
function formatCost(cost: number): string {
  if (cost === 0) return '$0.00';
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  return `$${cost.toFixed(2)}`;
}

describe('Cost Dashboard — budget alert logic', () => {
  it('returns ok when no budget is set', () => {
    const result = determineBudgetStatus(0.50, null);
    expect(result.status).toBe('ok');
    expect(result.percent).toBe(0);
  });

  it('returns ok when under 80% of budget', () => {
    const result = determineBudgetStatus(0.05, 0.10);
    expect(result.status).toBe('ok');
    expect(result.percent).toBe(50);
  });

  it('returns warning at 85% of budget', () => {
    const result = determineBudgetStatus(0.085, 0.10);
    expect(result.status).toBe('warning');
    expect(result.percent).toBe(85);
  });

  it('returns warning between 80% and 100%', () => {
    const result = determineBudgetStatus(0.09, 0.10);
    expect(result.status).toBe('warning');
    expect(result.percent).toBe(90);
  });

  it('returns exceeded at 100% of budget', () => {
    const result = determineBudgetStatus(0.10, 0.10);
    expect(result.status).toBe('exceeded');
    expect(result.percent).toBe(100);
  });

  it('returns exceeded when over budget', () => {
    const result = determineBudgetStatus(0.15, 0.10);
    expect(result.status).toBe('exceeded');
    expect(result.percent).toBe(150);
  });

  it('handles zero budget gracefully', () => {
    const result = determineBudgetStatus(0.05, 0);
    expect(result.status).toBe('ok');
    expect(result.percent).toBe(0);
  });
});

describe('Cost Dashboard — formatting helpers', () => {
  it('formats zero tokens', () => {
    expect(formatTokens(0)).toBe('0');
  });

  it('formats small token counts', () => {
    expect(formatTokens(500)).toBe('500');
  });

  it('formats thousands as K', () => {
    expect(formatTokens(1500)).toBe('1.5K');
    expect(formatTokens(10000)).toBe('10.0K');
  });

  it('formats millions as M', () => {
    expect(formatTokens(1500000)).toBe('1.50M');
  });

  it('formats zero cost', () => {
    expect(formatCost(0)).toBe('$0.00');
  });

  it('formats small costs with 4 decimal places', () => {
    expect(formatCost(0.0035)).toBe('$0.0035');
  });

  it('formats normal costs with 2 decimal places', () => {
    expect(formatCost(1.50)).toBe('$1.50');
  });
});
