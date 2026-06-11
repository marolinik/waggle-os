import type { Importance } from './frames.js';

export type ScoringProfile = 'balanced' | 'recent' | 'important' | 'connected';

export interface ScoringWeights {
  temporal: number;
  popularity: number;
  contextual: number;
  importance: number;
}

/**
 * KNOWN GAP (W4-PRODUCTION-PORT-PLAN-2026-06-11.md §3 bug #1): no production
 * caller passes `graphDistances`, so the `contextual` dimension scores 0 for
 * every frame — 20% of 'balanced' (60% of 'connected') is a uniform constant.
 * This does NOT distort ranking (a constant-0 term preserves ordering) but it
 * deflates absolute finalScores and makes 'connected' a functional no-op.
 * Deliberately NOT zeroed out: tests and future callers may pass
 * graphDistances, and KnowledgeGraph.bfsDistances needs an entity-id →
 * frame-id bridge before production wiring (open decision #3).
 */
export const SCORING_PROFILES: Record<ScoringProfile, ScoringWeights> = {
  balanced: { temporal: 0.4, popularity: 0.2, contextual: 0.2, importance: 0.2 },
  recent: { temporal: 0.6, popularity: 0.1, contextual: 0.2, importance: 0.1 },
  important: { temporal: 0.1, popularity: 0.1, contextual: 0.2, importance: 0.6 },
  connected: { temporal: 0.1, popularity: 0.1, contextual: 0.6, importance: 0.2 },
};

const IMPORTANCE_WEIGHTS: Record<Importance, number> = {
  critical: 2.0,
  important: 1.5,
  normal: 1.0,
  temporary: 0.7,
  deprecated: 0.3,
};

const HALF_LIFE_DAYS = 30;
const RECENCY_BOOST_DAYS = 7;

export interface ScoredResult {
  frameId: number;
  rrfScore: number;
  relevanceScore: number;
  finalScore: number;
}

export interface ScoringContext {
  recentEntityIds?: number[];
  graphDistances?: Map<number, number>; // frameId -> shortest BFS distance
}

export function computeTemporalScore(lastAccessedIso: string): number {
  const now = Date.now();
  const accessed = new Date(lastAccessedIso).getTime();
  const daysSince = (now - accessed) / (1000 * 60 * 60 * 24);

  if (daysSince <= RECENCY_BOOST_DAYS) {
    return 1.0; // full score for recent items
  }

  // Exponential decay with 30-day half-life
  return Math.pow(0.5, daysSince / HALF_LIFE_DAYS);
}

export function computePopularityScore(accessCount: number): number {
  return 1 + Math.log10(1 + accessCount) * 0.1;
}

export function computeContextualScore(
  frameId: number,
  graphDistances: Map<number, number> | undefined
): number {
  if (!graphDistances || !graphDistances.has(frameId)) return 0;
  const distance = graphDistances.get(frameId)!;
  if (distance === 0) return 1.0;
  if (distance === 1) return 0.7;
  if (distance === 2) return 0.4;
  if (distance === 3) return 0.2;
  return 0;
}

export function computeImportanceScore(importance: Importance): number {
  return IMPORTANCE_WEIGHTS[importance];
}

export function computeRelevance(
  frame: { id: number; created_at?: string; last_accessed: string; access_count: number; importance: Importance },
  weights: ScoringWeights,
  context: ScoringContext = {}
): number {
  // W4.2 (plan §3 bug #3): the temporal dimension decays on WRITE time
  // (created_at), not access time. last_accessed is bumped to "now" by
  // touch() on every read — decaying on it made this dimension constant
  // noise on historical corpora (every recalled frame scored "recent").
  // created_at is optional for back-compat; callers not passing it keep
  // the old access-decay behavior.
  const temporal = computeTemporalScore(frame.created_at ?? frame.last_accessed);
  const popularity = computePopularityScore(frame.access_count);
  const contextual = computeContextualScore(frame.id, context.graphDistances);
  const importance = computeImportanceScore(frame.importance);

  return (
    temporal * weights.temporal +
    popularity * weights.popularity +
    contextual * weights.contextual +
    importance * weights.importance
  );
}
