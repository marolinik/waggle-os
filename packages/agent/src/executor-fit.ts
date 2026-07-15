// SPEC P1-A · A2 — Static executor fit table + heuristic task classifier.
//
// EXECUTOR_FIT is the static task-fit source the ExecutorRegistry (A3, later
// package) reads to populate each ExecutorCandidate.taskFit. `classifyTask` is a
// pure keyword/pattern heuristic (v1 — no LLM call). See
// .planning/router-arc/SPEC-P1-router-core.md §A2.

import type { TaskCategory } from './executor-router.js';

// Executor ids match ExecutorCandidate.id ('persona:<id>' | 'external:<toolId>').
// Persona ids verified against packages/agent/src/persona-data.ts:
// coder / writer / researcher / analyst / general-purpose all exist.
const ALL_CATEGORIES: readonly TaskCategory[] = ['coding', 'writing', 'research', 'analysis', 'ops', 'general'];

/** Any (executor, category) pair not listed in EXECUTOR_FIT resolves to this. */
export const DEFAULT_TASK_FIT = 0.3;

function uniform(value: number): Record<TaskCategory, number> {
  return {
    coding: value,
    writing: value,
    research: value,
    analysis: value,
    ops: value,
    general: value,
  };
}

/**
 * Static fit table keyed by executor id. Entries carry only the categories a
 * given executor is notably good at; unlisted categories fall back to
 * DEFAULT_TASK_FIT via `resolveTaskFit`. general-purpose is uniformly 0.6.
 */
export const EXECUTOR_FIT: Readonly<Record<string, Partial<Record<TaskCategory, number>>>> = {
  // Personas
  'persona:coder': { coding: 0.85 },
  'persona:writer': { writing: 0.9 },
  'persona:researcher': { research: 0.9 },
  'persona:analyst': { analysis: 0.9 },
  'persona:general-purpose': uniform(0.6),
  // External CLI executors
  'external:claude-code': { coding: 0.95, analysis: 0.6 },
  'external:codex': { coding: 0.9 },
  'external:hermes': { coding: 0.6, research: 0.5 },
  'external:openclaw': { coding: 0.7, ops: 0.6 },
};

/** Fit for one (executor, category), applying the 0.3 default for unlisted pairs. */
export function resolveTaskFit(executorId: string, category: TaskCategory): number {
  return EXECUTOR_FIT[executorId]?.[category] ?? DEFAULT_TASK_FIT;
}

/** Full task-fit map for an executor, default-filled — used by the registry to build candidates. */
export function buildTaskFit(executorId: string): Record<TaskCategory, number> {
  const out = {} as Record<TaskCategory, number>;
  for (const category of ALL_CATEGORIES) {
    out[category] = resolveTaskFit(executorId, category);
  }
  return out;
}

export interface TaskClassification {
  category: TaskCategory;
  confidence: number; // 0..1
}

// Ordered signal sets. Tie between categories is broken by this declaration order.
const SIGNALS: ReadonlyArray<{ category: Exclude<TaskCategory, 'general'>; patterns: RegExp[] }> = [
  {
    category: 'coding',
    patterns: [
      /```/, // code fence
      /\.(ts|tsx|js|jsx|py|rs|go|java|rb|c|cpp|cs|php|sh|sql|json|yaml|yml|html|css)\b/i, // file extensions
      /\b(refactor|implement|fix|debug|compile|build|function|class|method|test|bug|stack ?trace|lint)\b/i,
    ],
  },
  {
    category: 'writing',
    patterns: [/\b(write|draft|post|email|blog|article|newsletter|copy|essay|letter|rewrite|proofread)\b/i],
  },
  {
    category: 'research',
    patterns: [/\b(research|find|compare|sources?|investigate|look ?up|cite|references?|survey)\b/i],
  },
  {
    category: 'analysis',
    patterns: [/\b(analyze|analysis|report|metrics?|statistics|trends?|dataset|chart|summari[sz]e|insights?)\b/i],
  },
  {
    category: 'ops',
    patterns: [/\b(deploy|install|configure|setup|provision|infrastructure|server|docker|kubernetes|pipeline|ci\/cd)\b/i],
  },
];

/**
 * Heuristic v1 task classifier. Counts matched signal patterns per category and
 * returns the strongest; falls back to `general` (confidence 0.3) when nothing
 * matches. Pure — no LLM call.
 */
export function classifyTask(prompt: string): TaskClassification {
  let best: { category: Exclude<TaskCategory, 'general'>; hits: number } | null = null;

  for (const signal of SIGNALS) {
    const hits = signal.patterns.reduce((n, re) => (re.test(prompt) ? n + 1 : n), 0);
    if (hits > 0 && (best === null || hits > best.hits)) {
      best = { category: signal.category, hits };
    }
  }

  if (best === null) {
    return { category: 'general', confidence: 0.3 };
  }
  return { category: best.category, confidence: Math.min(0.95, 0.55 + 0.1 * best.hits) };
}
