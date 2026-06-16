/**
 * Deterministic, difficulty-stratified Phase-A / Phase-B split (03 B6).
 *
 * Mechanical rule (no researcher DOF):
 *  1. Control tasks are routed by flag, not by chance:
 *       - is_negative_control → Phase B only (tested, never builds the mind).
 *       - is_near_dup        → Phase B only (positive control, C5).
 *  2. The remaining HEADLINE tasks are stratified by (procedure_family ×
 *     difficulty-decile). Within each stratum, tasks are deterministically
 *     shuffled (Mulberry32(seed)) and the first `round(testFraction × |stratum|)`
 *     go to Phase B, the rest to Phase A. Stratifying by family AND difficulty
 *     decile is what makes A vs B difficulty-matched.
 *  3. The Phase-B-random subset is a fresh Mulberry32 draw over the FULL
 *     Phase-B set (NOT reuse-selected) so the lift can be shown to survive on
 *     a random test draw (03 B6).
 *  4. The canonical split SHA is SHA-256 over the sorted (phase, task_id)
 *     membership list — it changes iff membership changes, and is frozen at
 *     pre-registration.
 *
 * Determinism: a single Mulberry32 stream seeded with `seed`, consumed in a
 * fixed order (strata sorted by key, then random subset), so the same input +
 * seed yields a byte-identical split + SHA.
 */

import crypto from 'node:crypto';
import { validateTaskPool, type ContinualTask } from './task-pool.js';

export interface PhaseSplitInput {
  pool: readonly ContinualTask[];
  /** Fraction of HEADLINE (non-control) tasks routed to Phase B, per stratum.
   *  Must be in (0,1). */
  testFraction: number;
  /** Fraction of the FULL Phase-B set drawn (at random) into the
   *  Phase-B-random subset. Must be in (0,1]. */
  phaseBRandomFraction: number;
  /** PRNG seed. Default 42. */
  seed?: number;
}

export interface DifficultyDistribution {
  phaseAMean: number;
  phaseBMean: number;
  /** 10 buckets [0,0.1) .. [0.9,1.0]; value = task count in that decile. */
  phaseAHistogram: number[];
  phaseBHistogram: number[];
}

export interface PhaseSplitResult {
  phaseA: ContinualTask[];
  phaseB: ContinualTask[];
  /** A random subset of phaseB (NOT reuse-selected). */
  phaseBRandom: ContinualTask[];
  /** All negative-control tasks (⊆ phaseB). */
  negativeControl: ContinualTask[];
  /** All near-dup positive-control tasks (⊆ phaseB). */
  nearDupControl: ContinualTask[];
  difficultyDist: DifficultyDistribution;
  /** SHA-256 hex over the sorted (phase,task_id) membership. Frozen at pre-reg. */
  split_sha: string;
  seed: number;
  testFraction: number;
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Difficulty decile index 0..9 (1.0 lands in bucket 9). */
function decile(d: number): number {
  return Math.min(9, Math.floor(d * 10));
}

/** Deterministic in-place Fisher-Yates using the supplied RNG. */
function shuffleInPlace<T>(arr: T[], rand: () => number): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
}

function histogram(tasks: readonly ContinualTask[]): number[] {
  const h = new Array<number>(10).fill(0);
  for (const t of tasks) h[decile(t.difficulty)]++;
  return h;
}

function mean(tasks: readonly ContinualTask[]): number {
  if (tasks.length === 0) return 0;
  let s = 0;
  for (const t of tasks) s += t.difficulty;
  return s / tasks.length;
}

export function buildPhaseSplit(input: PhaseSplitInput): PhaseSplitResult {
  const { testFraction, phaseBRandomFraction, seed = 42 } = input;
  if (!Number.isFinite(testFraction) || testFraction <= 0 || testFraction >= 1) {
    throw new Error(`buildPhaseSplit requires testFraction ∈ (0,1); got ${testFraction}`);
  }
  if (!Number.isFinite(phaseBRandomFraction) || phaseBRandomFraction <= 0 || phaseBRandomFraction > 1) {
    throw new Error(`buildPhaseSplit requires phaseBRandomFraction ∈ (0,1]; got ${phaseBRandomFraction}`);
  }
  if (!Number.isFinite(seed) || !Number.isInteger(seed)) {
    throw new Error(`buildPhaseSplit requires an integer seed; got ${seed}`);
  }

  const pool = validateTaskPool(input.pool);
  const rand = mulberry32(seed);

  const negativeControl = pool.filter(t => t.is_negative_control);
  const nearDupControl = pool.filter(t => t.is_near_dup);
  const headline = pool.filter(t => !t.is_negative_control && !t.is_near_dup);

  if (headline.length === 0) {
    throw new Error('buildPhaseSplit: no headline (non-control) tasks left to build Phase A');
  }

  // Strata key = `${procedure_family}#${decile}`. Build in a STABLE sorted
  // key order so the RNG stream is consumed deterministically.
  const strata = new Map<string, ContinualTask[]>();
  for (const t of headline) {
    const key = `${t.procedure_family}#${decile(t.difficulty)}`;
    const bucket = strata.get(key);
    if (bucket) bucket.push(t);
    else strata.set(key, [t]);
  }
  const sortedKeys = Array.from(strata.keys()).sort();

  const phaseA: ContinualTask[] = [];
  const phaseB: ContinualTask[] = [...negativeControl, ...nearDupControl]; // controls are tested
  for (const key of sortedKeys) {
    const bucket = strata.get(key)!.slice();
    shuffleInPlace(bucket, rand);
    const nToB = Math.round(testFraction * bucket.length);
    for (let i = 0; i < bucket.length; i++) {
      if (i < nToB) phaseB.push(bucket[i]);
      else phaseA.push(bucket[i]);
    }
  }

  if (phaseA.length === 0) {
    throw new Error('buildPhaseSplit: Phase A is empty after the split — lower testFraction');
  }

  // Phase-B-random subset: a fresh random draw over the FULL Phase-B set.
  const bShuffled = phaseB.slice();
  shuffleInPlace(bShuffled, rand);
  const nRandom = Math.round(phaseBRandomFraction * phaseB.length);
  const phaseBRandom = bShuffled.slice(0, Math.max(1, nRandom));

  // Canonical, order-insensitive membership SHA.
  const membership = [
    ...phaseA.map(t => `A:${t.task_id}`),
    ...phaseB.map(t => `B:${t.task_id}`),
  ].sort();
  const split_sha = crypto.createHash('sha256').update(membership.join('\n')).digest('hex');

  return {
    phaseA,
    phaseB,
    phaseBRandom,
    negativeControl,
    nearDupControl,
    difficultyDist: {
      phaseAMean: mean(phaseA),
      phaseBMean: mean(phaseB),
      phaseAHistogram: histogram(phaseA),
      phaseBHistogram: histogram(phaseB),
    },
    split_sha,
    seed,
    testFraction,
  };
}
