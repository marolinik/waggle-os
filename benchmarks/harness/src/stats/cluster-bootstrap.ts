/**
 * Sprint 12 Task 1 Blocker #5 — conversation-level cluster bootstrap CI.
 *
 * Non-parametric 95% CI that respects LoCoMo's hierarchical structure: each
 * conversation contributes multiple question instances, so instance-level
 * rows are NOT independent. Wilson (which assumes independence) under-
 * estimates uncertainty when intra-cluster correlation is high; cluster
 * bootstrap resamples WHOLE conversations with replacement and rebuilds
 * the correctness distribution from each resample.
 *
 * A3 LOCK § 2 cluster-bootstrap parameters (LOCKED):
 *   - iterations = 10 000
 *   - seed = 42
 *   - cluster unit = conversation_id
 *   - resample mode = cluster-level with replacement
 *   - quantiles = 2.5 / 97.5
 *
 * Determinism: this module uses a custom Mulberry32 PRNG seeded with
 * `input.seed` — no external dep (seedrandom NOT in repo per R4
 * verification). Same input + seed produces bit-identical output.
 *
 * Reference: Efron, B., & Tibshirani, R. J. (1993). "An Introduction to
 * the Bootstrap." Chapman & Hall. Cluster-resampling variant: Field &
 * Welsh (2007) "Bootstrapping clustered data," JRSS B 69(3).
 */

export interface CorrectnessRow {
  conversation_id: string;
  /** 1 = correct (passes judge), 0 = incorrect. */
  correct: 0 | 1;
}

export interface BootstrapInput {
  rows: readonly CorrectnessRow[];
  /** Number of bootstrap iterations. A3 LOCK § 2 LOCKED value: 10 000. */
  n_bootstrap?: number;
  /** PRNG seed for determinism. A3 LOCK § 2 LOCKED value: 42. */
  seed?: number;
  /** Confidence level — only 0.95 supported in this implementation. */
  confidence?: number;
}

export interface BootstrapResult {
  point_estimate: number;
  ci_lower: number;
  ci_upper: number;
  n_bootstrap: number;
  seed: number;
  confidence: number;
  /** Number of distinct conversations that contributed rows (cluster count). */
  n_clusters: number;
  /** Row count (informational — larger than n_clusters when clustering is real). */
  n_rows: number;
}

/**
 * Mulberry32 PRNG — 32-bit xorshift variant. Uniformly distributed on
 * [0, 1) given a 32-bit seed. Same seed ⇒ same sequence across Node
 * versions / platforms / architectures. Chosen over xorshift32 (already
 * used in datasets.ts) purely because the Fisher-Yates + bootstrap
 * idiom in stats literature cites Mulberry32 more often — functionally
 * equivalent for our needs.
 *
 * Reference: https://github.com/bryc/code/blob/master/jshash/PRNGs.md
 */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function computeClusterBootstrapCI(input: BootstrapInput): BootstrapResult {
  const {
    rows,
    n_bootstrap = 10000,
    seed = 42,
    confidence = 0.95,
  } = input;

  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('cluster-bootstrap requires a non-empty rows array');
  }
  if (!Number.isFinite(n_bootstrap) || n_bootstrap < 1 || !Number.isInteger(n_bootstrap)) {
    throw new Error(`cluster-bootstrap requires n_bootstrap ≥ 1 (integer); got ${n_bootstrap}`);
  }
  if (!Number.isFinite(seed) || !Number.isInteger(seed)) {
    throw new Error(`cluster-bootstrap requires an integer seed; got ${seed}`);
  }
  if (confidence !== 0.95) {
    throw new Error(
      `cluster-bootstrap only supports confidence=0.95 in this implementation; got ${confidence}`,
    );
  }

  // Group rows by conversation_id. Preserve insertion order so the PRNG
  // sees the same cluster sequence on every call with the same input.
  const clusterMap = new Map<string, CorrectnessRow[]>();
  for (const row of rows) {
    if (row.correct !== 0 && row.correct !== 1) {
      throw new Error(
        `cluster-bootstrap rows must have correct ∈ {0, 1}; got ${row.correct} at conversation ${row.conversation_id}`,
      );
    }
    const bucket = clusterMap.get(row.conversation_id);
    if (bucket) bucket.push(row);
    else clusterMap.set(row.conversation_id, [row]);
  }
  const clusters = Array.from(clusterMap.values());
  const nClusters = clusters.length;

  // Point estimate — mean correctness over the full (un-resampled) input.
  let totalCorrect = 0;
  for (const r of rows) totalCorrect += r.correct;
  const point_estimate = totalCorrect / rows.length;

  // Precompute per-cluster (sum, count) so each bootstrap iteration is O(K)
  // rather than O(N). Matters at n_bootstrap=10 000 with ~300 clusters.
  const clusterSums = new Array<number>(nClusters);
  const clusterSizes = new Array<number>(nClusters);
  for (let i = 0; i < nClusters; i++) {
    let s = 0;
    const c = clusters[i];
    for (const r of c) s += r.correct;
    clusterSums[i] = s;
    clusterSizes[i] = c.length;
  }

  const rand = mulberry32(seed);
  const means = new Array<number>(n_bootstrap);

  for (let b = 0; b < n_bootstrap; b++) {
    let sumCorrect = 0;
    let sumSize = 0;
    // Draw nClusters clusters with replacement.
    for (let k = 0; k < nClusters; k++) {
      const pick = Math.floor(rand() * nClusters);
      sumCorrect += clusterSums[pick];
      sumSize += clusterSizes[pick];
    }
    means[b] = sumSize === 0 ? 0 : sumCorrect / sumSize;
  }

  means.sort((a, b) => a - b);
  // 2.5th and 97.5th percentiles. Linear-interpolation variant would be
  // marginally more accurate but adds implementation surface; standard
  // lower-floor / upper-floor indexing is what most published bootstrap
  // pipelines use and matches the A3 LOCK § 2 "quantiles: [2.5, 97.5]"
  // directive without prescribing interpolation style.
  const lowerIdx = Math.floor(0.025 * n_bootstrap);
  const upperIdx = Math.floor(0.975 * n_bootstrap);
  const ci_lower = Math.max(0, Math.min(1, means[lowerIdx]));
  const ci_upper = Math.max(0, Math.min(1, means[upperIdx]));

  return {
    point_estimate,
    ci_lower,
    ci_upper,
    n_bootstrap,
    seed,
    confidence,
    n_clusters: nClusters,
    n_rows: rows.length,
  };
}
