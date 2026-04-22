/**
 * Sprint 12 Task 1 Blocker #5 — statistics module barrel.
 *
 * Re-exports the three A3 LOCK § 2 / § 4 numerical surfaces used by the
 * aggregate JSON writer and smoke test:
 *
 *   computeFleissKappa        — pre-tie-break judge agreement
 *   computeWilsonCI           — frequentist 95% binomial CI (primary)
 *   computeClusterBootstrapCI — non-parametric 95% CI (secondary,
 *                               conversation-level resampling)
 *
 * Import surface for consumers in Task 2 (C3 mini execution) and
 * downstream Task 4 (H-42 full run):
 *
 *   import { computeFleissKappa, computeWilsonCI, computeClusterBootstrapCI }
 *     from '../stats/index.js';
 */

export { computeFleissKappa } from './fleiss-kappa.js';
export type { VoteMatrix, FleissKappaResult } from './fleiss-kappa.js';

export { computeWilsonCI, Z_95_TWO_SIDED } from './wilson-ci.js';
export type { WilsonInput, WilsonResult } from './wilson-ci.js';

export { computeClusterBootstrapCI } from './cluster-bootstrap.js';
export type { CorrectnessRow, BootstrapInput, BootstrapResult } from './cluster-bootstrap.js';
