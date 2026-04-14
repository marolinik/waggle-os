/**
 * Iterative GEPA Optimizer — Phase 2.1 of the self-evolution loop.
 *
 * Upgrades the one-shot prompt expander (optimizer-service) to a multi-
 * generation population search with Pareto-frontier selection and
 * reflective mutations driven by LLMJudge feedback (Phase 1.3).
 *
 * Loop:
 *   1. Start with `baseline` prompt as the seed population (1 member).
 *   2. For each generation:
 *      a. Micro-screen survivors on a small sample (default 50) to prune
 *         obvious losers.
 *      b. Mini-eval passing candidates on a larger sample (default 64).
 *      c. Spawn `populationSize` reflective mutations of the top Pareto
 *         candidate, using aggregated judge feedback as ASI.
 *   3. Anchor evaluation on the full eval set (default 400) picks the winner.
 *
 * "Actionable Side Information" (ASI) is the textual feedback the judge
 * produces — fed back into the `mutate` callback so the next generation
 * targets the identified weakness rather than mutating blindly.
 *
 * Pareto selection keeps candidates that are non-dominated on a
 * 3-dimensional fitness vector (correctness, procedureFollowing,
 * conciseness). A single scalar `overall` is also tracked for tie-breaking
 * and final ranking.
 */

import type { EvalExample } from './eval-dataset.js';
import type { LLMJudge, JudgeScore } from './judge.js';

// ── Types ───────────────────────────────────────────────────────

export interface Candidate {
  /** Stable id — e.g. `g0-baseline`, `g1-m2` */
  id: string;
  /** The prompt text being evolved */
  prompt: string;
  /** Generation index (0 = baseline) */
  generation: number;
  /** Parent candidate id (null for baseline) */
  parent: string | null;
  /** Short label describing the mutation strategy */
  strategy: string;
  /** Aggregated score across the most recent eval stage, or null if not yet scored */
  score: CandidateScore | null;
  /** Raw per-example scores used for Pareto analysis */
  perExample: JudgeScore[];
}

/** Aggregated, mean-reduced score used for selection. */
export interface CandidateScore {
  overall: number;
  correctness: number;
  procedureFollowing: number;
  conciseness: number;
  /** Mean length penalty applied across the eval set */
  lengthPenalty: number;
  /** Number of examples the candidate was scored on */
  n: number;
  /** Aggregated feedback lines from the lowest-scoring examples */
  weaknessFeedback: string[];
}

export type MutationStrategy =
  | 'expand-edge-cases'
  | 'tighten-format'
  | 'add-examples'
  | 'clarify-constraints'
  | 'reduce-length'
  | 'restructure-steps'
  | 'targeted-feedback';

export interface MutateArgs {
  parent: Candidate;
  strategy: MutationStrategy;
  /** Textual feedback taken from the parent's lowest-scoring examples */
  weaknessFeedback: string[];
  /** Target types we are mutating (for the mutate fn to tune style) */
  targetKind: EvolutionTarget;
  /** Generation index of the child */
  generation: number;
}

export type MutateFn = (args: MutateArgs) => Promise<string>;

/** What is being evolved — informs mutation style and constraint policies. */
export type EvolutionTarget =
  | 'persona-system-prompt'
  | 'behavioral-spec-section'
  | 'tool-description'
  | 'skill-body'
  | 'generic';

export interface GEPAProgress {
  phase: 'start' | 'micro-screen' | 'mini-eval' | 'mutate' | 'anchor' | 'done';
  generation: number;
  populationSize: number;
  /** The best-so-far overall score at this point */
  best: number;
  message?: string;
}

export interface IterativeGEPAOptions {
  /** The starting prompt text. */
  baseline: string;
  /** Full eval dataset (train + val combined is typical). */
  examples: EvalExample[];
  /** Scorer — LLMJudge or anything that implements `score(input): Promise<JudgeScore>`. */
  judge: Pick<LLMJudge, 'score'>;
  /** Function that produces a mutated prompt from a parent + weakness feedback. */
  mutate: MutateFn;
  /** What we're optimizing (tunes mutation + gate policy). Default 'generic'. */
  targetKind?: EvolutionTarget;
  /** Candidates per generation. Default 5. */
  populationSize?: number;
  /** How many generations to run. Default 3. */
  generations?: number;
  /** Micro-screen sample size. Default 50. */
  microScreenSize?: number;
  /** Mini-eval sample size. Default 64. */
  miniEvalSize?: number;
  /** Anchor evaluation sample size (applied to final Pareto set). Default 400. */
  anchorEvalSize?: number;
  /** Seed for deterministic sampling. Default 1. */
  seed?: number;
  /** Emits progress events across stages. */
  onProgress?: (event: GEPAProgress) => void;
  /** Optional abort signal */
  signal?: AbortSignal;
  /**
   * Max concurrent `judge.score()` calls per candidate during eval stages.
   * Default 1 (fully sequential) — preserves legacy behavior. Bumping to
   * 4–8 cuts wall time dramatically when the judge is an LLM API with
   * plenty of concurrent capacity. Does not affect determinism: all
   * scores are aggregated after every example completes.
   */
  concurrency?: number;
}

export interface GEPARunResult {
  winner: Candidate;
  /** Full Pareto-non-dominated set from the anchor stage */
  paretoFront: Candidate[];
  /** All candidates across all generations */
  history: Candidate[];
  /** True if the winner improved overall score over baseline */
  improved: boolean;
  /** Delta winner.score.overall - baseline.score.overall */
  delta: number;
}

// ── Public API ─────────────────────────────────────────────────

export class IterativeGEPA {
  /**
   * Run the iterative optimization loop.
   *
   * Returns the winner candidate plus the full Pareto set. Winner is the
   * Pareto-set member with the highest `overall` score (ties broken by
   * length penalty, i.e. the more concise one wins).
   */
  async run(options: IterativeGEPAOptions): Promise<GEPARunResult> {
    const config = normalizeOptions(options);
    const rng = makeRng(config.seed);

    // ── Seed population with baseline ────────────────────────
    const baseline: Candidate = {
      id: 'g0-baseline',
      prompt: config.baseline,
      generation: 0,
      parent: null,
      strategy: 'baseline',
      score: null,
      perExample: [],
    };

    emit(config, 'start', 0, 1, 0, 'seeding baseline');

    const history: Candidate[] = [baseline];
    let survivors: Candidate[] = [baseline];

    // Score the baseline on the micro-screen so we have a comparison point.
    const microSample = pickSample(config.examples, config.microScreenSize, rng);
    await scoreCandidate(baseline, microSample, config.judge, {
      signal: config.signal,
      concurrency: config.concurrency,
    });
    emit(config, 'micro-screen', 0, 1, baseline.score?.overall ?? 0);

    // ── Generations ──────────────────────────────────────────
    for (let gen = 1; gen <= config.generations; gen++) {
      if (config.signal?.aborted) break;

      // 1. Mutate top survivor(s) into N children.
      const topParent = pickTopParent(survivors);
      if (!topParent) break;

      emit(config, 'mutate', gen, survivors.length, topParent.score?.overall ?? 0);

      const children: Candidate[] = [];
      const strategies = cycleStrategies(config.populationSize, gen);
      for (let i = 0; i < config.populationSize; i++) {
        if (config.signal?.aborted) break;
        const strategy = strategies[i];
        let childPrompt: string;
        try {
          childPrompt = await config.mutate({
            parent: topParent,
            strategy,
            weaknessFeedback: topParent.score?.weaknessFeedback ?? [],
            targetKind: config.targetKind,
            generation: gen,
          });
        } catch {
          // Mutation failed — reuse parent so the loop doesn't stall.
          childPrompt = topParent.prompt;
        }

        const child: Candidate = {
          id: `g${gen}-m${i}`,
          prompt: childPrompt,
          generation: gen,
          parent: topParent.id,
          strategy,
          score: null,
          perExample: [],
        };
        children.push(child);
        history.push(child);
      }

      // 2. Micro-screen children on a small sample.
      const microSet = pickSample(config.examples, config.microScreenSize, rng);
      for (const child of children) {
        if (config.signal?.aborted) break;
        await scoreCandidate(child, microSet, config.judge, {
          signal: config.signal,
          concurrency: config.concurrency,
        });
      }
      emit(
        config, 'micro-screen', gen, children.length,
        Math.max(...children.map(c => c.score?.overall ?? 0), topParent.score?.overall ?? 0),
      );

      // 3. Keep children that at least match the parent's overall score.
      const threshold = topParent.score?.overall ?? 0;
      const microSurvivors = children.filter(c => (c.score?.overall ?? 0) >= threshold - 0.05);

      // If everyone got filtered out, keep the single best child so we don't stall.
      if (microSurvivors.length === 0 && children.length > 0) {
        const best = children.reduce((a, b) =>
          (a.score?.overall ?? 0) >= (b.score?.overall ?? 0) ? a : b,
        );
        microSurvivors.push(best);
      }

      // 4. Mini-eval survivors on a larger sample.
      if (microSurvivors.length > 0) {
        const miniSet = pickSample(config.examples, config.miniEvalSize, rng);
        for (const cand of microSurvivors) {
          if (config.signal?.aborted) break;
          await scoreCandidate(cand, miniSet, config.judge, {
            signal: config.signal,
            concurrency: config.concurrency,
          });
        }
        emit(
          config, 'mini-eval', gen, microSurvivors.length,
          Math.max(...microSurvivors.map(c => c.score?.overall ?? 0)),
        );
      }

      // 5. Pareto-select survivors for next generation.
      const candidatePool = [topParent, ...microSurvivors];
      survivors = paretoFront(candidatePool);
    }

    // ── Anchor evaluation — big sample, final ranking ───────
    emit(config, 'anchor', config.generations, survivors.length, bestOverall(survivors));
    const anchorSet = pickSample(config.examples, config.anchorEvalSize, rng);
    for (const cand of survivors) {
      if (config.signal?.aborted) break;
      await scoreCandidate(cand, anchorSet, config.judge, {
        signal: config.signal,
        concurrency: config.concurrency,
      });
    }

    const anchorPareto = paretoFront(survivors);
    const winner = pickWinner(anchorPareto);
    const baselineOverall = baseline.score?.overall ?? 0;
    const winnerOverall = winner.score?.overall ?? 0;

    emit(config, 'done', config.generations, anchorPareto.length, winnerOverall);

    return {
      winner,
      paretoFront: anchorPareto,
      history,
      improved: winnerOverall > baselineOverall,
      delta: winnerOverall - baselineOverall,
    };
  }
}

// ── Helpers (exported for tests) ───────────────────────────────

/**
 * Pareto front: keep candidates not dominated on any of the three scored
 * dimensions. A dominates B if A ≥ B on all three and strictly greater
 * on at least one.
 */
export function paretoFront(candidates: Candidate[]): Candidate[] {
  const scored = candidates.filter(c => c.score !== null);
  const front: Candidate[] = [];
  for (const cand of scored) {
    let dominated = false;
    for (const other of scored) {
      if (other === cand) continue;
      if (dominates(other.score!, cand.score!)) {
        dominated = true;
        break;
      }
    }
    if (!dominated) front.push(cand);
  }
  // If all candidates have equal scores, return them all.
  return front.length > 0 ? front : scored;
}

function dominates(a: CandidateScore, b: CandidateScore): boolean {
  const geAll =
    a.correctness >= b.correctness &&
    a.procedureFollowing >= b.procedureFollowing &&
    a.conciseness >= b.conciseness;
  const gtAny =
    a.correctness > b.correctness ||
    a.procedureFollowing > b.procedureFollowing ||
    a.conciseness > b.conciseness;
  return geAll && gtAny;
}

export interface ScoreCandidateOptions {
  /** Abort signal — checked before each example is dispatched. */
  signal?: AbortSignal;
  /** Max concurrent judge.score() calls. Default 1 (sequential). */
  concurrency?: number;
}

/**
 * Score a candidate against a batch of examples and aggregate.
 *
 * Backwards compatible: the 4th argument may be either an `AbortSignal`
 * (legacy) or a `ScoreCandidateOptions` object. Pass
 * `{ concurrency: 4 }` to parallelize — individual examples are
 * independent so the aggregate result is identical to the sequential
 * version, only faster when the judge is an LLM API.
 */
export async function scoreCandidate(
  candidate: Candidate,
  examples: EvalExample[],
  judge: Pick<LLMJudge, 'score'>,
  signalOrOptions?: AbortSignal | ScoreCandidateOptions,
): Promise<CandidateScore> {
  const options = resolveScoreOptions(signalOrOptions);
  const signal = options.signal;
  const concurrency = Math.max(1, options.concurrency ?? 1);

  // The "candidate" in this context IS the new prompt we want to test.
  // We treat it as the model's actual response to the example's input,
  // since mutation produces a variant prompt-as-response. Callers can
  // substitute a `runCandidate` step before scoring if the prompt needs
  // to be executed first — see docs.
  const scoreOne = async (ex: EvalExample): Promise<JudgeScore | null> => {
    if (signal?.aborted) return null;
    try {
      return await judge.score({
        input: ex.input,
        expected: ex.expected_output,
        actual: candidate.prompt,
      });
    } catch {
      // Keep iterating so one bad example doesn't invalidate the whole score.
      return null;
    }
  };

  const results = concurrency === 1
    ? await runSequential(examples, scoreOne)
    : await mapWithConcurrency(examples, concurrency, scoreOne);

  const scores = results.filter((s): s is JudgeScore => s !== null);
  candidate.perExample = scores;
  const aggregated = aggregateScores(scores);
  candidate.score = aggregated;
  return aggregated;
}

function resolveScoreOptions(
  arg: AbortSignal | ScoreCandidateOptions | undefined,
): ScoreCandidateOptions {
  if (!arg) return {};
  // Legacy: AbortSignal passed directly. Detect by presence of `aborted`
  // (a boolean getter unique to AbortSignal-like objects).
  if (typeof (arg as AbortSignal).aborted === 'boolean' && typeof (arg as AbortSignal).addEventListener === 'function') {
    return { signal: arg as AbortSignal };
  }
  return arg as ScoreCandidateOptions;
}

async function runSequential<T, R>(
  items: readonly T[],
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  for (const item of items) {
    results.push(await fn(item));
  }
  return results;
}

/**
 * Bounded-parallelism map. Runs `fn` over `items` with at most
 * `concurrency` in-flight calls at once. Results are returned in the
 * same order as inputs regardless of completion order.
 *
 * Implementation: N worker loops share a counter. Each worker pulls the
 * next index, awaits `fn`, stores at that index, repeats. No external
 * deps, no extra state machinery.
 */
async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  const workerCount = Math.min(concurrency, items.length);
  let next = 0;
  const workers = Array.from({ length: workerCount }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

export function aggregateScores(scores: JudgeScore[]): CandidateScore {
  if (scores.length === 0) {
    return {
      overall: 0, correctness: 0, procedureFollowing: 0, conciseness: 0,
      lengthPenalty: 1, n: 0, weaknessFeedback: [],
    };
  }
  const n = scores.length;
  const sum = scores.reduce(
    (acc, s) => ({
      overall: acc.overall + s.overall,
      correctness: acc.correctness + s.correctness,
      procedureFollowing: acc.procedureFollowing + s.procedureFollowing,
      conciseness: acc.conciseness + s.conciseness,
      lengthPenalty: acc.lengthPenalty + s.lengthPenalty,
    }),
    { overall: 0, correctness: 0, procedureFollowing: 0, conciseness: 0, lengthPenalty: 0 },
  );

  // Collect the 3 worst-scoring examples' feedback as weakness signal.
  const worst = [...scores].sort((a, b) => a.overall - b.overall).slice(0, 3);
  const weaknessFeedback = worst
    .map(s => s.feedback)
    .filter(fb => fb && fb.length > 0);

  return {
    overall: sum.overall / n,
    correctness: sum.correctness / n,
    procedureFollowing: sum.procedureFollowing / n,
    conciseness: sum.conciseness / n,
    lengthPenalty: sum.lengthPenalty / n,
    n,
    weaknessFeedback,
  };
}

/**
 * Pick the "winner" from a Pareto set. Prefers highest overall; ties broken
 * by higher length penalty (more concise) then lowest generation (simpler).
 */
export function pickWinner(candidates: Candidate[]): Candidate {
  if (candidates.length === 0) {
    throw new Error('pickWinner called on empty candidate list');
  }
  return candidates.reduce((best, cand) => {
    const b = best.score?.overall ?? -1;
    const c = cand.score?.overall ?? -1;
    if (c > b) return cand;
    if (c < b) return best;
    // Tie on overall — prefer higher lengthPenalty (more concise, less penalized).
    const bLen = best.score?.lengthPenalty ?? 0;
    const cLen = cand.score?.lengthPenalty ?? 0;
    if (cLen !== bLen) return cLen > bLen ? cand : best;
    return best.generation <= cand.generation ? best : cand;
  });
}

function pickTopParent(survivors: Candidate[]): Candidate | undefined {
  if (survivors.length === 0) return undefined;
  return survivors.reduce((a, b) =>
    (a.score?.overall ?? 0) >= (b.score?.overall ?? 0) ? a : b,
  );
}

function bestOverall(candidates: Candidate[]): number {
  if (candidates.length === 0) return 0;
  return Math.max(...candidates.map(c => c.score?.overall ?? 0));
}

/**
 * Deterministic sampler — picks `k` examples using a seeded RNG.
 * If k >= examples.length, returns the full list in deterministic shuffled order.
 */
export function pickSample(examples: EvalExample[], k: number, rng: () => number): EvalExample[] {
  if (k <= 0 || examples.length === 0) return [];
  const copy = [...examples];
  // Fisher–Yates shuffle
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, Math.min(k, copy.length));
}

/** Rotate through strategies so early generations explore the mutation space. */
function cycleStrategies(n: number, generation: number): MutationStrategy[] {
  const all: MutationStrategy[] = [
    'expand-edge-cases',
    'tighten-format',
    'add-examples',
    'clarify-constraints',
    'reduce-length',
    'restructure-steps',
    'targeted-feedback',
  ];
  // Early generations: spread across strategies.
  // Later generations: bias toward targeted-feedback once ASI is strong.
  if (generation <= 1) {
    return Array.from({ length: n }, (_, i) => all[i % all.length]);
  }
  return Array.from({ length: n }, (_, i) => {
    if (i === 0) return 'targeted-feedback';
    return all[(i + generation) % all.length];
  });
}

function emit(
  config: { onProgress?: (event: GEPAProgress) => void },
  phase: GEPAProgress['phase'],
  generation: number,
  populationSize: number,
  best: number,
  message?: string,
): void {
  if (config.onProgress) {
    config.onProgress({ phase, generation, populationSize, best, message });
  }
}

function normalizeOptions(opts: IterativeGEPAOptions): Required<Omit<IterativeGEPAOptions, 'signal' | 'onProgress'>> & {
  onProgress?: IterativeGEPAOptions['onProgress'];
  signal?: AbortSignal;
} {
  return {
    baseline: opts.baseline,
    examples: opts.examples,
    judge: opts.judge,
    mutate: opts.mutate,
    targetKind: opts.targetKind ?? 'generic',
    populationSize: opts.populationSize ?? 5,
    generations: opts.generations ?? 3,
    microScreenSize: opts.microScreenSize ?? 50,
    miniEvalSize: opts.miniEvalSize ?? 64,
    anchorEvalSize: opts.anchorEvalSize ?? 400,
    seed: opts.seed ?? 1,
    onProgress: opts.onProgress,
    signal: opts.signal,
    concurrency: Math.max(1, opts.concurrency ?? 1),
  };
}

// Mulberry32 — deterministic uniform PRNG
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
