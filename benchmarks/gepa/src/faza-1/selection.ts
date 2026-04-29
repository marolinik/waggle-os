/**
 * GEPA Faza 1 — top-1-per-shape selection.
 *
 * Per brief §2 selection metric ("best-per-shape-per-cell, ne aggregate") +
 * launch decision §F + §F.5 acceptance.
 *
 * Selection algorithm:
 *   1. For each shape, compute fitness for all candidates (per-shape fitness fork)
 *   2. Per shape, select candidate with highest fitness as "best"
 *   3. Apply acceptance verdict to each best-per-shape candidate
 *   4. Report shape-level + run-aggregate verdict
 *
 * Run-aggregate §F conditions:
 *   §F.2: ≥3/5 shapes show positive trio_strict delta vs NULL-baseline
 *
 * Per-candidate §F.1 + §F.5 already evaluated by acceptance.evaluateCandidate.
 */

import { computeFitness } from './fitness.js';
import { evaluateCandidate } from './acceptance.js';
import {
  type CandidateMetrics,
  type FitnessComponents,
  type AcceptanceVerdict,
  type ShapeName,
} from './types.js';

/** Per-shape selection result. */
export interface ShapeSelectionResult {
  shape: ShapeName;
  bestCandidate: CandidateMetrics;
  bestFitness: FitnessComponents;
  acceptance: AcceptanceVerdict;
  /** All candidates evaluated for this shape (for audit log). */
  allCandidatesRanked: Array<{ candidate: CandidateMetrics; fitness: FitnessComponents }>;
}

/** Aggregate run verdict per launch decision §F.2. */
export interface RunAggregateVerdict {
  /** Number of shapes with positive trio_strict delta vs NULL-baseline. */
  shapesWithPositiveDelta: number;
  /** Total shapes evaluated. */
  totalShapes: number;
  /** §F.2 condition: ≥3/5 shapes show positive delta. */
  condition2Pass: boolean;
  /** Number of shapes where best candidate was ACCEPTED (passes §F.1 + not §F.5). */
  shapesAccepted: number;
}

/** Full selection report — per shape + run aggregate. */
export interface SelectionReport {
  perShape: ShapeSelectionResult[];
  runAggregate: RunAggregateVerdict;
}

/** Inputs: per-shape candidates + per-shape NULL-baseline metrics + cost baselines. */
export interface SelectionInputs {
  /** All candidates grouped by shape. */
  candidatesPerShape: Map<ShapeName, CandidateMetrics[]>;
  /** NULL-baseline trio_strict_pass_rate (op. ii) per shape. */
  baselineTrioStrictPassRateII: Map<ShapeName, number>;
  /** NULL-baseline median cost (USD per evaluation) per shape. */
  baselineMedianCostUsd: Map<ShapeName, number>;
}

/**
 * Run top-1-per-shape selection + apply acceptance verdicts.
 *
 * Returns a complete selection report including per-shape results and the
 * run-aggregate verdict.
 *
 * Throws if a shape in candidatesPerShape lacks a corresponding baseline entry.
 */
export function runSelection(inputs: SelectionInputs): SelectionReport {
  const perShape: ShapeSelectionResult[] = [];

  for (const [shape, candidates] of inputs.candidatesPerShape.entries()) {
    if (candidates.length === 0) {
      continue;  // skip shapes with no candidates
    }

    const baselineRate = inputs.baselineTrioStrictPassRateII.get(shape);
    if (baselineRate === undefined) {
      throw new Error(`runSelection: missing baseline trio_strict rate for shape "${shape}"`);
    }
    const baselineCost = inputs.baselineMedianCostUsd.get(shape);
    if (baselineCost === undefined) {
      throw new Error(`runSelection: missing baseline median cost for shape "${shape}"`);
    }

    // Compute fitness for all candidates of this shape
    const ranked = candidates
      .map(candidate => ({
        candidate,
        fitness: computeFitness({ candidate, baselineMedianCostUsd: baselineCost }),
      }))
      .sort((a, b) => b.fitness.fitness - a.fitness.fitness);

    const top = ranked[0];
    const acceptance = evaluateCandidate({
      candidate: top.candidate,
      baselineTrioStrictPassRateII: baselineRate,
    });

    perShape.push({
      shape,
      bestCandidate: top.candidate,
      bestFitness: top.fitness,
      acceptance,
      allCandidatesRanked: ranked,
    });
  }

  const shapesWithPositiveDelta = perShape.filter(s => s.acceptance.trioStrictDeltaPP > 0).length;
  const shapesAccepted = perShape.filter(s => s.acceptance.accepted).length;
  const totalShapes = perShape.length;
  const condition2Pass = shapesWithPositiveDelta >= 3;

  return {
    perShape,
    runAggregate: {
      shapesWithPositiveDelta,
      totalShapes,
      condition2Pass,
      shapesAccepted,
    },
  };
}
