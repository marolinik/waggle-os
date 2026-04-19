/**
 * Brain Health metric — weighted saturation score across memory stats.
 *
 * Surfaces a single 0-100 signal answering "how much of my brain is
 * populated?". Weights reflect relative signal value per dimension:
 *  - frames (raw captured memory) carries the most quantity (40%)
 *  - entities (distilled KG nouns) carries mid (30%)
 *  - relations (KG edges) carries mid (30%)
 *
 * Each dimension saturates at its target count so no single dimension
 * can push the overall score above 100%. Targets are tuned against
 * observed counts on a "mature" personal.mind and can be revisited.
 *
 * Divergence from the M-27 backlog spec:
 *   The backlog's original formula was (frames × 0.3) + (concepts ×
 *   0.4) + (entities × 0.3). `concept_mastery` exists in MindDB schema
 *   but ConceptTracker isn't wired into the cognify pipeline yet, so
 *   counting concepts would produce a constant zero. Until that lands,
 *   we swap the concepts term for relations (which is emitted by the
 *   KG and already flows through /api/memory/stats). When concepts
 *   ship, update `BrainHealthCounts` + the formula to match the spec.
 */

export interface BrainHealthCounts {
  frames: number;
  entities: number;
  relations: number;
}

/** Target counts that correspond to 100% saturation per dimension. */
export const HEALTH_TARGETS = {
  frames: 10_000,
  entities: 500,
  relations: 500,
} as const;

/** Weights per dimension — sum to 1. */
export const HEALTH_WEIGHTS = {
  frames: 0.4,
  entities: 0.3,
  relations: 0.3,
} as const;

export type BrainHealthTier = 'empty' | 'sparse' | 'growing' | 'healthy' | 'mature';

export const TIER_LABELS: Record<BrainHealthTier, string> = {
  empty: 'Empty',
  sparse: 'Sparse',
  growing: 'Growing',
  healthy: 'Healthy',
  mature: 'Mature',
};

/**
 * Compute a 0-100 integer Brain Health score from memory counts.
 * Negative inputs clamp to 0; counts above the dimension target cap
 * that dimension's contribution at its weight.
 */
export function computeBrainHealth(counts: BrainHealthCounts): number {
  const frames = Math.max(0, counts.frames ?? 0);
  const entities = Math.max(0, counts.entities ?? 0);
  const relations = Math.max(0, counts.relations ?? 0);

  const framesRatio = Math.min(1, frames / HEALTH_TARGETS.frames);
  const entitiesRatio = Math.min(1, entities / HEALTH_TARGETS.entities);
  const relationsRatio = Math.min(1, relations / HEALTH_TARGETS.relations);

  const score =
    framesRatio * HEALTH_WEIGHTS.frames +
    entitiesRatio * HEALTH_WEIGHTS.entities +
    relationsRatio * HEALTH_WEIGHTS.relations;

  return Math.round(score * 100);
}

/** Qualitative tier label for a given score. */
export function brainHealthTier(score: number): BrainHealthTier {
  if (score < 5) return 'empty';
  if (score < 25) return 'sparse';
  if (score < 50) return 'growing';
  if (score < 80) return 'healthy';
  return 'mature';
}

/**
 * Per-dimension contribution breakdown (rounded integers summing to
 * the final score). Useful for tooltips that show "why" a score is
 * low — the user can see which dimension is lagging.
 */
export function brainHealthBreakdown(counts: BrainHealthCounts): {
  frames: number;
  entities: number;
  relations: number;
} {
  const frames = Math.max(0, counts.frames ?? 0);
  const entities = Math.max(0, counts.entities ?? 0);
  const relations = Math.max(0, counts.relations ?? 0);

  return {
    frames: Math.round(Math.min(1, frames / HEALTH_TARGETS.frames) * HEALTH_WEIGHTS.frames * 100),
    entities: Math.round(Math.min(1, entities / HEALTH_TARGETS.entities) * HEALTH_WEIGHTS.entities * 100),
    relations: Math.round(Math.min(1, relations / HEALTH_TARGETS.relations) * HEALTH_WEIGHTS.relations * 100),
  };
}
