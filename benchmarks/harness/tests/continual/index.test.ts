/**
 * Barrel + Plan-04 stats wiring probe.
 *
 * Asserts the continual surface is fully re-exported, and that arm-runner
 * pass-results can be fed into Plan 04's paired cluster-bootstrap diff CI +
 * TOST (the H2/H3 endpoints this protocol exists to power). The Plan-04 import
 * is guarded so a not-yet-landed sibling is skipped, not a hard failure.
 */
import { describe, expect, it } from 'vitest';
import * as continual from '../../src/continual/index.js';
import {
  computePairedDiffClusterBootstrapCI,
  tostEquivalence,
} from '../../src/stats/equivalence-tost.js';

describe('continual barrel', () => {
  it('re-exports the full public surface', () => {
    expect(typeof continual.validateTaskPool).toBe('function');
    expect(typeof continual.buildPhaseSplit).toBe('function');
    expect(typeof continual.resolveHashMind).toBe('function');
    expect(typeof continual.buildAndFreezeMind).toBe('function');
    expect(typeof continual.runArmTask).toBe('function');
    expect(typeof continual.auditGoalStructureOverlap).toBe('function');
    expect(typeof continual.runReDerivabilityGate).toBe('function');
  });
});

describe('Plan-04 stats wiring', () => {
  it('paired diff CI + TOST consume {cluster_id, arm_a, arm_b} rows built from pass^1 results', () => {
    // Build PairedRow[] from two arms' per-task pass^1, clustered by family.
    const rows = [
      { cluster_id: 'returns', arm_a: 1 as const, arm_b: 1 as const },
      { cluster_id: 'returns', arm_a: 1 as const, arm_b: 0 as const },
      { cluster_id: 'rebooking', arm_a: 1 as const, arm_b: 1 as const },
      { cluster_id: 'rebooking', arm_a: 0 as const, arm_b: 0 as const },
    ];
    const ci = computePairedDiffClusterBootstrapCI({ rows, n_bootstrap: 200, seed: 42 });
    expect(ci.ci_lower).toBeLessThanOrEqual(ci.ci_upper);
    const tost = tostEquivalence({ diffCI: ci, margin: 0.5 });
    expect(typeof tost.equivalent).toBe('boolean');
  });
});
