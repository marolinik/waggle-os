/**
 * GEPA Faza 1 — public API surface.
 *
 * Per launch decision §G + manifest v7 §gepa.
 *
 * Module map:
 *   - types          shared types + shape-class partitions
 *   - fitness        per-shape fitness function (Amendment 2 §3 fork)
 *   - acceptance     §F + §F.5 verdict per candidate
 *   - mutation-validator   cell-semantic preservation audit (boundary SHAs)
 *   - kappa-audit    drift band detection vs canonical 0.7878 ± 0.05
 *   - cost-tracker   super-linear governance + halt triggers
 *   - selection      top-1-per-shape + run-aggregate verdict
 *   - mutation-oracle-fork   Qwen vs non-Qwen template routing (Amendment 2 §4)
 */

export * from './types.js';
export * from './fitness.js';
export * from './acceptance.js';
export * from './mutation-validator.js';
export * from './kappa-audit.js';
export * from './cost-tracker.js';
export * from './selection.js';
export * from './mutation-oracle-fork.js';
