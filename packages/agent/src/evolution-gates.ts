/**
 * Evolution Gates — Phase 2.2 of the self-evolution loop.
 *
 * Gatekeeping for prompts/skills produced by the iterative GEPA optimizer
 * before they reach production. A candidate must pass ALL gates; the first
 * failure short-circuits and returns a `fail` verdict with the reason.
 *
 * Four gate categories:
 *
 *  1. Size gates   — hard character caps per target type (persona prompt
 *                    ≤ 3 000 chars, tool description ≤ 500, skill ≤ 15 KB,
 *                    behavioral-spec section ≤ 4 000).
 *  2. Growth gates — percentage cap over baseline (default +20%) prevents
 *                    runaway prompt bloat across generations.
 *  3. Structural   — non-empty, no unresolved placeholders, balanced
 *                    markdown fences, no obvious template accidents
 *                    (e.g. "[PLACEHOLDER]", "TODO:" left in).
 *  4. Regression   — score delta on a held-out eval set must not drop
 *                    below the allowed tolerance (default -0.02, i.e. a
 *                    2% accuracy regression is the worst allowed).
 *
 * Each gate returns structured reasons so the orchestrator (phase 4)
 * can log WHY a candidate was rejected and surface it in the UI.
 */

import type { EvolutionTarget } from './iterative-optimizer.js';

// ── Public types ───────────────────────────────────────────────

export type GateVerdict = 'pass' | 'fail';

export interface GateResult {
  gate: string;
  verdict: GateVerdict;
  reason: string;
  /** Optional measurable detail: e.g. `{ current: 3520, max: 3000 }` */
  detail?: Record<string, number | string>;
}

export interface GateCheckResult {
  verdict: GateVerdict;
  /** First failing gate, or null if all passed */
  firstFailure: GateResult | null;
  /** All gate results in order */
  results: GateResult[];
}

export interface SizeLimits {
  personaSystemPrompt: number;
  toolDescription: number;
  skillBody: number;
  behavioralSpecSection: number;
  generic: number;
}

export const DEFAULT_SIZE_LIMITS: SizeLimits = {
  personaSystemPrompt: 3_000,
  toolDescription: 500,
  skillBody: 15_000,
  behavioralSpecSection: 4_000,
  generic: 8_000,
};

export interface GateOptions {
  /** What is being evolved — drives which size cap applies. Default 'generic'. */
  targetKind?: EvolutionTarget;
  /** Max allowed % growth over baseline. Default 0.2 (i.e. +20%). */
  maxGrowthRatio?: number;
  /** Largest allowed accuracy regression vs baseline. Default -0.02 (i.e. -2%). */
  maxRegression?: number;
  /** Override the default size limits */
  sizeLimits?: Partial<SizeLimits>;
  /** Allow empty candidates (rarely useful — default false) */
  allowEmpty?: boolean;
}

export interface CheckInput {
  /** The new candidate text */
  candidate: string;
  /** The baseline (pre-evolution) text — used for growth + regression checks */
  baseline: string;
  /** Optional scores to enable the regression gate */
  scores?: {
    baseline: number;
    candidate: number;
  };
}

// ── Public API ─────────────────────────────────────────────────

/**
 * Run all gates in order. Returns a structured verdict. The overall
 * verdict is `pass` iff every gate passed; `fail` with `firstFailure`
 * populated otherwise.
 *
 * Callers can choose to short-circuit on the first failure or to
 * collect all of them — `runGates` returns every gate result either way.
 */
export function runGates(input: CheckInput, options: GateOptions = {}): GateCheckResult {
  const targetKind = options.targetKind ?? 'generic';
  const sizeLimits = { ...DEFAULT_SIZE_LIMITS, ...options.sizeLimits };
  const maxGrowthRatio = options.maxGrowthRatio ?? 0.2;
  const maxRegression = options.maxRegression ?? -0.02;
  const allowEmpty = options.allowEmpty ?? false;

  const results: GateResult[] = [];

  // 1. Non-empty
  if (!allowEmpty) {
    results.push(checkNonEmpty(input.candidate));
  }

  // 2. Size
  results.push(checkSize(input.candidate, targetKind, sizeLimits));

  // 3. Growth
  results.push(checkGrowth(input.candidate, input.baseline, maxGrowthRatio));

  // 4. Structural integrity
  results.push(checkBalancedFences(input.candidate));
  results.push(checkNoPlaceholders(input.candidate));
  results.push(checkNoObviousTodos(input.candidate));

  // 5. Regression (optional — skipped if scores not provided)
  if (input.scores) {
    results.push(checkRegression(input.scores.baseline, input.scores.candidate, maxRegression));
  }

  const firstFailure = results.find(r => r.verdict === 'fail') ?? null;
  return {
    verdict: firstFailure ? 'fail' : 'pass',
    firstFailure,
    results,
  };
}

// ── Individual gates (exported for unit tests + fine-grained use) ──

export function checkNonEmpty(candidate: string): GateResult {
  const trimmed = candidate.trim();
  if (trimmed.length === 0) {
    return {
      gate: 'non-empty',
      verdict: 'fail',
      reason: 'Candidate is empty or whitespace only',
    };
  }
  return { gate: 'non-empty', verdict: 'pass', reason: 'non-empty' };
}

export function checkSize(
  candidate: string,
  targetKind: EvolutionTarget,
  limits: SizeLimits,
): GateResult {
  const max = resolveSizeLimit(targetKind, limits);
  const len = candidate.length;
  if (len > max) {
    return {
      gate: 'size',
      verdict: 'fail',
      reason: `Candidate is ${len} chars but ${targetKind} cap is ${max}`,
      detail: { current: len, max },
    };
  }
  return {
    gate: 'size',
    verdict: 'pass',
    reason: `Within ${targetKind} limit (${len}/${max})`,
    detail: { current: len, max },
  };
}

export function checkGrowth(
  candidate: string,
  baseline: string,
  maxGrowthRatio: number,
): GateResult {
  // A candidate shorter than baseline always passes the growth gate.
  if (candidate.length <= baseline.length) {
    return {
      gate: 'growth',
      verdict: 'pass',
      reason: 'Candidate is not larger than baseline',
      detail: { baseline: baseline.length, candidate: candidate.length },
    };
  }

  // Empty baseline means any candidate can't be measured as a ratio —
  // defer to the size gate instead.
  if (baseline.length === 0) {
    return {
      gate: 'growth',
      verdict: 'pass',
      reason: 'No baseline to compare against',
    };
  }

  const ratio = (candidate.length - baseline.length) / baseline.length;
  if (ratio > maxGrowthRatio) {
    return {
      gate: 'growth',
      verdict: 'fail',
      reason: `Candidate grew ${(ratio * 100).toFixed(1)}% over baseline (cap ${(maxGrowthRatio * 100).toFixed(0)}%)`,
      detail: { baseline: baseline.length, candidate: candidate.length, ratio },
    };
  }
  return {
    gate: 'growth',
    verdict: 'pass',
    reason: `Grew ${(ratio * 100).toFixed(1)}% (cap ${(maxGrowthRatio * 100).toFixed(0)}%)`,
    detail: { baseline: baseline.length, candidate: candidate.length, ratio },
  };
}

export function checkBalancedFences(candidate: string): GateResult {
  const fenceMatches = candidate.match(/```/g);
  const count = fenceMatches?.length ?? 0;
  if (count % 2 !== 0) {
    return {
      gate: 'balanced-fences',
      verdict: 'fail',
      reason: `Odd number of markdown code fences (${count}) — unbalanced`,
      detail: { fences: count },
    };
  }
  return {
    gate: 'balanced-fences',
    verdict: 'pass',
    reason: `${count} fence(s), balanced`,
    detail: { fences: count },
  };
}

/**
 * Reject candidates that still contain placeholder text like `[TODO]`,
 * `<placeholder>`, or `{{var}}` — these are almost always unfinished
 * generations.
 */
export function checkNoPlaceholders(candidate: string): GateResult {
  const patterns: Array<{ name: string; re: RegExp }> = [
    { name: 'bracket-placeholder', re: /\[(?:PLACEHOLDER|TODO|FIXME|INSERT|XXX|YOUR[_ ][A-Z ]+)\]/i },
    { name: 'angle-placeholder', re: /<(?:placeholder|todo|your[-_ ][a-z ]+)>/i },
    { name: 'handlebars-placeholder', re: /\{\{[a-zA-Z_][a-zA-Z0-9_.]*\}\}/ },
  ];

  for (const { name, re } of patterns) {
    const m = candidate.match(re);
    if (m) {
      return {
        gate: 'no-placeholders',
        verdict: 'fail',
        reason: `Found unresolved placeholder (${name}): "${m[0]}"`,
      };
    }
  }
  return { gate: 'no-placeholders', verdict: 'pass', reason: 'no unresolved placeholders' };
}

/**
 * Reject candidates with "TODO:" or "FIXME:" headers — a prompt shouldn't
 * ship with unfinished author notes.
 */
export function checkNoObviousTodos(candidate: string): GateResult {
  // Only match lines that START with the marker (as a label), not prose
  // that happens to mention "todo" (e.g. a task-list prompt).
  const re = /(?:^|\n)\s*(?:TODO|FIXME|XXX)\s*:/i;
  const m = candidate.match(re);
  if (m) {
    return {
      gate: 'no-todos',
      verdict: 'fail',
      reason: `Found leftover author marker: "${m[0].trim()}"`,
    };
  }
  return { gate: 'no-todos', verdict: 'pass', reason: 'no leftover author markers' };
}

export function checkRegression(
  baselineScore: number,
  candidateScore: number,
  maxRegression: number,
): GateResult {
  const delta = candidateScore - baselineScore;
  // Small epsilon avoids float-precision false negatives when delta is
  // numerically equal to the tolerance (e.g. 0.78 - 0.8 === -0.02000002).
  const epsilon = 1e-9;
  if (delta < maxRegression - epsilon) {
    return {
      gate: 'regression',
      verdict: 'fail',
      reason: `Candidate score regressed by ${(delta * 100).toFixed(2)}pp (allowed ${(maxRegression * 100).toFixed(2)}pp)`,
      detail: { baseline: baselineScore, candidate: candidateScore, delta },
    };
  }
  return {
    gate: 'regression',
    verdict: 'pass',
    reason: `Score delta ${(delta * 100).toFixed(2)}pp (allowed floor ${(maxRegression * 100).toFixed(2)}pp)`,
    detail: { baseline: baselineScore, candidate: candidateScore, delta },
  };
}

// ── Helpers ─────────────────────────────────────────────────────

function resolveSizeLimit(target: EvolutionTarget, limits: SizeLimits): number {
  switch (target) {
    case 'persona-system-prompt': return limits.personaSystemPrompt;
    case 'tool-description': return limits.toolDescription;
    case 'skill-body': return limits.skillBody;
    case 'behavioral-spec-section': return limits.behavioralSpecSection;
    case 'generic':
    default:
      return limits.generic;
  }
}
