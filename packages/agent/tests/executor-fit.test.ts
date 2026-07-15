import { describe, it, expect } from 'vitest';
import {
  EXECUTOR_FIT,
  DEFAULT_TASK_FIT,
  resolveTaskFit,
  buildTaskFit,
  classifyTask,
} from '../src/executor-fit.js';
import type { TaskCategory } from '../src/executor-router.js';

describe('EXECUTOR_FIT static table', () => {
  it('carries the specified persona fits', () => {
    expect(EXECUTOR_FIT['persona:coder']).toEqual({ coding: 0.85 });
    expect(EXECUTOR_FIT['persona:writer']).toEqual({ writing: 0.9 });
    expect(EXECUTOR_FIT['persona:researcher']).toEqual({ research: 0.9 });
    expect(EXECUTOR_FIT['persona:analyst']).toEqual({ analysis: 0.9 });
  });

  it('gives general-purpose a uniform 0.6 across all categories', () => {
    expect(EXECUTOR_FIT['persona:general-purpose']).toEqual({
      coding: 0.6,
      writing: 0.6,
      research: 0.6,
      analysis: 0.6,
      ops: 0.6,
      general: 0.6,
    });
  });

  it('carries the specified external CLI fits', () => {
    expect(EXECUTOR_FIT['external:claude-code']).toEqual({ coding: 0.95, analysis: 0.6 });
    expect(EXECUTOR_FIT['external:codex']).toEqual({ coding: 0.9 });
    expect(EXECUTOR_FIT['external:hermes']).toEqual({ coding: 0.6, research: 0.5 });
    expect(EXECUTOR_FIT['external:openclaw']).toEqual({ coding: 0.7, ops: 0.6 });
  });
});

describe('resolveTaskFit', () => {
  it('returns the explicit fit when present', () => {
    expect(resolveTaskFit('persona:coder', 'coding')).toBe(0.85);
    expect(resolveTaskFit('external:claude-code', 'analysis')).toBe(0.6);
  });

  it('falls back to 0.3 for an unlisted category on a known executor', () => {
    expect(resolveTaskFit('persona:coder', 'writing')).toBe(DEFAULT_TASK_FIT);
    expect(resolveTaskFit('external:codex', 'ops')).toBe(0.3);
  });

  it('falls back to 0.3 for a completely unknown executor', () => {
    expect(resolveTaskFit('external:mystery', 'coding')).toBe(0.3);
  });
});

describe('buildTaskFit', () => {
  it('default-fills every category for a partial entry', () => {
    expect(buildTaskFit('persona:coder')).toEqual({
      coding: 0.85,
      writing: 0.3,
      research: 0.3,
      analysis: 0.3,
      ops: 0.3,
      general: 0.3,
    });
  });

  it('returns all-0.3 for an unknown executor', () => {
    const fit = buildTaskFit('external:unknown');
    expect(Object.values(fit).every((v) => v === 0.3)).toBe(true);
  });
});

describe('classifyTask — category matrix', () => {
  const cases: Array<{ prompt: string; category: TaskCategory }> = [
    { prompt: 'Please refactor this function and fix the failing test', category: 'coding' },
    { prompt: 'Update the file app.ts to add a class', category: 'coding' },
    { prompt: '```js\nconsole.log(1)\n```', category: 'coding' },
    { prompt: 'Draft a blog post and write a marketing email', category: 'writing' },
    { prompt: 'Research and compare sources on solar adoption, cite references', category: 'research' },
    { prompt: 'Analyze the sales report and summarize the key metrics and trends', category: 'analysis' },
    { prompt: 'Deploy the service and configure the docker pipeline', category: 'ops' },
    { prompt: 'Tell me a story about a friendly dragon', category: 'general' },
  ];

  for (const { prompt, category } of cases) {
    it(`classifies "${prompt.slice(0, 30)}..." as ${category}`, () => {
      expect(classifyTask(prompt).category).toBe(category);
    });
  }
});

describe('classifyTask — confidence', () => {
  it('returns 0.3 confidence for an unmatched (general) prompt', () => {
    const c = classifyTask('hello there, how are you today');
    expect(c).toEqual({ category: 'general', confidence: 0.3 });
  });

  it('raises confidence with more matched signals', () => {
    const one = classifyTask('please write this'); // 1 writing signal
    const strong = classifyTask('refactor the function, fix the bug in app.ts'); // 3 coding signals
    expect(one.confidence).toBeCloseTo(0.65, 10);
    expect(strong.confidence).toBeGreaterThan(one.confidence);
    expect(strong.confidence).toBeLessThanOrEqual(0.95);
  });

  it('never exceeds the 0.95 confidence cap', () => {
    const c = classifyTask('```\nrefactor implement fix debug build test class function\n``` app.ts app.py');
    expect(c.confidence).toBeLessThanOrEqual(0.95);
  });

  it('breaks a cross-category tie by declaration order (coding first)', () => {
    // one coding signal ("implement") and one writing signal ("write") → coding wins
    const c = classifyTask('write and implement');
    expect(c.category).toBe('coding');
  });
});
