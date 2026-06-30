import { describe, it, expect } from 'vitest';
import { renderGoalAncestry } from '../src/goal-ancestry.js';

describe('renderGoalAncestry', () => {
  it('renders a heading + one line per present level, in mission→project→goal→task order', () => {
    const out = renderGoalAncestry({ project: 'Acme', goal: 'Ship the pane', mission: 'Win', task: 'x' });
    expect(out).toBe("# Why You're Here\nMission: Win\nProject: Acme\nGoal: Ship the pane\nTask: x");
  });

  it('renders only the present levels', () => {
    expect(renderGoalAncestry({ project: 'Acme' })).toBe("# Why You're Here\nProject: Acme");
  });

  it('returns empty string for null / undefined / all-empty', () => {
    expect(renderGoalAncestry(null)).toBe('');
    expect(renderGoalAncestry(undefined)).toBe('');
    expect(renderGoalAncestry({})).toBe('');
    expect(renderGoalAncestry({ goal: '' })).toBe('');
  });

  it('truncates an over-long level to 200 chars', () => {
    const long = 'x'.repeat(300);
    const out = renderGoalAncestry({ goal: long });
    const line = out.split('\n')[1];
    expect(line.length).toBeLessThanOrEqual('Goal: '.length + 200);
    expect(line.endsWith('...')).toBe(true);
  });
});
