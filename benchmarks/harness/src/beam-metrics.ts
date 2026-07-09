/**
 * BEAM metric aggregation — faithful port of mem0's `compute_beam_metrics`
 * (benchmarks/beam/run.py). Produces the two headline numbers the BEAM
 * leaderboard reports, plus the per-ability breakdown:
 *
 *   - Avg Score : MICRO mean of per-question scores over all questions. This is
 *                 the "64.1" number (mem0 1M = 0.641). Because BEAM tracks are
 *                 ability-balanced (70/ability @ 1M), micro == macro, but we
 *                 compute micro to match mem0 byte-for-byte.
 *   - Pass Rate : fraction of questions with score >= 0.5 (mem0 threshold),
 *                 reported as a percentage. mem0 1M = 70.1%.
 *
 * The per-question `score` is the plain nugget-mean for EVERY ability (see
 * beam-nugget-judge.ts) — event_ordering's tau-b blend is NOT aggregated here,
 * matching mem0's headline.
 */

export const BEAM_PASS_THRESHOLD = 0.5;

export interface BeamQuestionResult {
  instanceId: string;
  memoryAbility: string;
  /** Per-question headline score (nugget-mean), 0..1. */
  score: number;
  /** Present when the question could not be scored (e.g. no rubric). */
  error?: string;
}

export interface BeamAbilityMetric {
  total: number;
  correct: number;
  /** Pass rate as a percentage (0..100). */
  accuracy: number;
  /** Mean score (0..1). */
  avgScore: number;
}

export interface BeamMetrics {
  overall: {
    total: number;
    correct: number;
    errors: number;
    /** Pass rate as a percentage (0..100). */
    accuracy: number;
    /** Micro-averaged Avg Score (0..1) — the headline BEAM number. */
    avgScore: number;
  };
  byAbility: Record<string, BeamAbilityMetric>;
}

function mean(xs: number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((s, x) => s + x, 0) / xs.length;
}

/** Compute overall + per-ability BEAM metrics (single retrieval cutoff). */
export function computeBeamMetrics(results: BeamQuestionResult[]): BeamMetrics {
  const scores = results.map(r => r.score);
  const total = scores.length;
  const correct = scores.filter(s => s >= BEAM_PASS_THRESHOLD).length;
  const errors = results.filter(r => r.error).length;

  const byAbility: Record<string, BeamAbilityMetric> = {};
  const abilities = [...new Set(results.map(r => r.memoryAbility))].sort();
  for (const ability of abilities) {
    const items = results.filter(r => r.memoryAbility === ability);
    const abScores = items.map(r => r.score);
    const abCorrect = abScores.filter(s => s >= BEAM_PASS_THRESHOLD).length;
    byAbility[ability] = {
      total: items.length,
      correct: abCorrect,
      accuracy: items.length > 0 ? (abCorrect / items.length) * 100 : 0,
      avgScore: mean(abScores),
    };
  }

  return {
    overall: {
      total,
      correct,
      errors,
      accuracy: total > 0 ? (correct / total) * 100 : 0,
      avgScore: mean(scores),
    },
    byAbility,
  };
}

/** Render metrics as a compact human-readable table (for console/logs). */
export function formatBeamMetrics(m: BeamMetrics): string {
  const lines: string[] = [];
  lines.push(
    `OVERALL  avg_score=${m.overall.avgScore.toFixed(4)}  ` +
    `pass_rate=${m.overall.accuracy.toFixed(1)}% (${m.overall.correct}/${m.overall.total})  ` +
    `errors=${m.overall.errors}`,
  );
  const rows = Object.entries(m.byAbility).sort((a, b) => b[1].avgScore - a[1].avgScore);
  for (const [ability, v] of rows) {
    lines.push(
      `  ${ability.padEnd(26)} avg_score=${v.avgScore.toFixed(3)}  ` +
      `pass=${v.correct}/${v.total} (${v.accuracy.toFixed(1)}%)`,
    );
  }
  return lines.join('\n');
}
