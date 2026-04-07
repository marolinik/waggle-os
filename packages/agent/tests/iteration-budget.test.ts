import { describe, it, expect } from 'vitest';
import { IterationBudget } from '../src/iteration-budget.js';

describe('IterationBudget', () => {
  it('starts with zero used', () => {
    const budget = new IterationBudget({ maxIterations: 10 });
    expect(budget.used).toBe(0);
    expect(budget.remaining).toBe(10);
    expect(budget.exhausted).toBe(false);
  });

  it('increments on tick', () => {
    const budget = new IterationBudget({ maxIterations: 10 });
    budget.tick();
    budget.tick();
    expect(budget.used).toBe(2);
    expect(budget.remaining).toBe(8);
  });

  it('marks exhausted at max', () => {
    const budget = new IterationBudget({ maxIterations: 3 });
    budget.tick();
    budget.tick();
    budget.tick();
    expect(budget.exhausted).toBe(true);
    expect(budget.remaining).toBe(0);
  });

  it('skips free tool calls', () => {
    const budget = new IterationBudget({
      maxIterations: 10,
      freeToolCalls: ['execute_code'],
    });
    budget.tick('execute_code');
    budget.tick('execute_code');
    expect(budget.used).toBe(0);
    budget.tick('web_search');
    expect(budget.used).toBe(1);
  });

  it('returns null pressure below caution threshold', () => {
    const budget = new IterationBudget({ maxIterations: 10, cautionThreshold: 0.7 });
    budget.tick();
    expect(budget.getPressureMessage()).toBeNull();
  });

  it('returns caution message at 70%', () => {
    const budget = new IterationBudget({ maxIterations: 10, cautionThreshold: 0.7 });
    for (let i = 0; i < 7; i++) budget.tick();
    const msg = budget.getPressureMessage();
    expect(msg).toContain('BUDGET');
    expect(msg).toContain('3');
    expect(msg).toContain('consolidating');
  });

  it('returns warning message at 90%', () => {
    const budget = new IterationBudget({ maxIterations: 10, warningThreshold: 0.9 });
    for (let i = 0; i < 9; i++) budget.tick();
    const msg = budget.getPressureMessage();
    expect(msg).toContain('WARNING');
    expect(msg).toContain('1');
    expect(msg).toContain('NOW');
  });

  it('uses default thresholds when not specified', () => {
    const budget = new IterationBudget({ maxIterations: 100 });
    for (let i = 0; i < 70; i++) budget.tick();
    expect(budget.getPressureMessage()).toContain('BUDGET');
  });
});
