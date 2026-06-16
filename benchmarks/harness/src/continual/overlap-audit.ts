/**
 * Answer-caching defense (02 §6) + per-task re-derivability gate (03 C2).
 *
 * Two surfaces:
 *  1. auditGoalStructureOverlap — for every Phase-B gold, compute the max
 *     n-gram overlap (pure) AND the max embedding cosine (injected) against the
 *     Phase-A artifacts, and EXCLUDE any task whose gold overlap exceeds a
 *     pre-registered cutoff on EITHER axis (C5 near-dup gating of the headline
 *     set). The excluded count + the lift-with/without-exclusion are reported.
 *  2. runReDerivabilityGate — run the memory-OFF arm at a RAISED budget
 *     (injected `offSolves`); only tasks unbounded-OFF can solve enter the
 *     accuracy headline; the rest are excluded and counted (a high count is
 *     itself a finding — "memory supplied unobtainable knowledge").
 *
 * Both take injected scorers/probes so the module is unit-testable without an
 * embedder or LLM; production wiring passes the real embedder cosine + the
 * arm-runner OFF probe at raised k/budget.
 */

/** Tokenize on whitespace + drop empties; lowercase for overlap robustness. */
function tokens(s: string): string[] {
  return s.toLowerCase().split(/\s+/).filter(t => t.length > 0);
}

/** Build the set of n-grams (space-joined) for a token list. */
function ngrams(toks: readonly string[], n: number): Set<string> {
  const set = new Set<string>();
  if (toks.length < n) {
    if (toks.length > 0) set.add(toks.join(' '));
    return set;
  }
  for (let i = 0; i + n <= toks.length; i++) {
    set.add(toks.slice(i, i + n).join(' '));
  }
  return set;
}

/**
 * Max fraction of `gold`'s n-grams that appear in ANY single artifact.
 * 1.0 ⇒ every gold n-gram is present in one artifact (a verbatim-ish leak).
 */
export function maxNgramOverlap(gold: string, artifacts: readonly string[], n: number): number {
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(`maxNgramOverlap requires n ≥ 1 (integer); got ${n}`);
  }
  const goldGrams = ngrams(tokens(gold), n);
  if (goldGrams.size === 0) return 0;
  let best = 0;
  for (const art of artifacts) {
    const artGrams = ngrams(tokens(art), n);
    let hit = 0;
    for (const g of goldGrams) if (artGrams.has(g)) hit++;
    const frac = hit / goldGrams.size;
    if (frac > best) best = frac;
  }
  return best;
}

export interface OverlapTask {
  task_id: string;
  gold: string;
  is_near_dup: boolean;
}

/** Injected: max embedding cosine of `gold` vs any artifact. */
export type CosineFn = (gold: string, artifacts: readonly string[]) => number;

export interface OverlapAuditInput {
  tasks: readonly OverlapTask[];
  phaseAArtifacts: readonly string[];
  /** n-gram size for the n-gram axis. */
  ngram: number;
  /** Exclude when n-gram overlap > this. Pre-registered. */
  ngramCutoff: number;
  cosine: CosineFn;
  /** Exclude when embedding cosine > this. Pre-registered. */
  cosineCutoff: number;
}

export interface OverlapPerTask {
  task_id: string;
  ngramOverlap: number;
  cosineOverlap: number;
  excluded: boolean;
  exclusionReason: string | null;
}

export interface OverlapAuditResult {
  perTask: OverlapPerTask[];
  headlineCount: number;
  excludedCount: number;
}

export function auditGoalStructureOverlap(input: OverlapAuditInput): OverlapAuditResult {
  const { tasks, phaseAArtifacts, ngram, ngramCutoff, cosine, cosineCutoff } = input;
  if (!Number.isFinite(ngramCutoff) || ngramCutoff < 0 || ngramCutoff > 1) {
    throw new Error(`auditGoalStructureOverlap requires ngramCutoff ∈ [0,1]; got ${ngramCutoff}`);
  }
  if (!Number.isFinite(cosineCutoff) || cosineCutoff < 0 || cosineCutoff > 1) {
    throw new Error(`auditGoalStructureOverlap requires cosineCutoff ∈ [0,1]; got ${cosineCutoff}`);
  }
  if (!Array.isArray(tasks) || tasks.length === 0) {
    throw new Error('auditGoalStructureOverlap requires a non-empty tasks array');
  }

  const perTask: OverlapPerTask[] = [];
  let excludedCount = 0;
  for (const t of tasks) {
    const ng = maxNgramOverlap(t.gold, phaseAArtifacts, ngram);
    const cos = cosine(t.gold, phaseAArtifacts);
    let excluded = false;
    let reason: string | null = null;
    if (ng > ngramCutoff) {
      excluded = true;
      reason = `n-gram overlap ${ng.toFixed(3)} > cutoff ${ngramCutoff}`;
    } else if (cos > cosineCutoff) {
      excluded = true;
      reason = `embedding cosine ${cos.toFixed(3)} > cutoff ${cosineCutoff}`;
    }
    if (excluded) excludedCount++;
    perTask.push({ task_id: t.task_id, ngramOverlap: ng, cosineOverlap: cos, excluded, exclusionReason: reason });
  }

  return { perTask, headlineCount: tasks.length - excludedCount, excludedCount };
}

/** Injected raised-budget OFF probe: true ⇒ unbounded-OFF reaches the gold. */
export type OffSolveFn = (task: OverlapTask) => Promise<boolean>;

export interface ReDerivabilityInput {
  tasks: readonly OverlapTask[];
  offSolves: OffSolveFn;
}

export interface ReDerivabilityResult {
  reDerivable: OverlapTask[];
  nonReDerivable: OverlapTask[];
  nonReDerivableCount: number;
}

export async function runReDerivabilityGate(input: ReDerivabilityInput): Promise<ReDerivabilityResult> {
  const { tasks, offSolves } = input;
  if (!Array.isArray(tasks) || tasks.length === 0) {
    throw new Error('runReDerivabilityGate requires a non-empty tasks array');
  }
  const reDerivable: OverlapTask[] = [];
  const nonReDerivable: OverlapTask[] = [];
  for (const t of tasks) {
    if (await offSolves(t)) reDerivable.push(t);
    else nonReDerivable.push(t);
  }
  return { reDerivable, nonReDerivable, nonReDerivableCount: nonReDerivable.length };
}
