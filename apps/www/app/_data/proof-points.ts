/**
 * Verified LoCoMo benchmark data for the proof band (86.49 SOTA arc,
 * 2026-06; the earlier 87.66 figure was withdrawn 2026-07-01 as
 * unreproducible — never surface it).
 *
 * Protocol: LoCoMo, N=1,540, GPT-4.1-mini as answerer AND judge — the prior
 * leader's (Memori) published protocol, reproduced in-harness before
 * comparing. Waggle (hive-mind substrate) 86.49% vs Memori 81.95%
 * (+4.54pp, z=4.64, p<10⁻⁵); Mem0 re-measured under the same protocol:
 * 73.96%. Single-hop: 92.27%. Sources: benchmarks/results/locomo-sota-2026-06/
 * and docs/methodology.md §0. Numbers MUST match those files. Do not
 * fabricate; do not rescale chart axes away from zero.
 */

export interface BenchmarkBar {
  readonly id: string;
  readonly system: string;
  readonly detail: string;
  readonly score: number;
  readonly highlight: boolean;
}

export const LOCOMO_BARS: readonly BenchmarkBar[] = Object.freeze([
  {
    id: 'waggle',
    system: 'Waggle (hive-mind)',
    detail: 'open source · runs locally',
    score: 86.49,
    highlight: true,
  },
  {
    id: 'memori',
    system: 'Memori',
    detail: 'prior state of the art',
    score: 81.95,
    highlight: false,
  },
  {
    id: 'mem0',
    system: 'Mem0',
    detail: 're-measured, same protocol',
    score: 73.96,
    highlight: false,
  },
]);

/** Secondary verified stat: single-hop recall. */
export const SINGLE_HOP_SCORE = 92.27;
