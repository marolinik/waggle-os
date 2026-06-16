/**
 * Equivalence (TOST) statistics for the harness-SOTA benchmark.
 *
 * The harness ships Wilson + cluster-bootstrap + Fleiss κ but NO inferential
 * or equivalence test. The H3 claim ("the small model is statistically
 * equivalent to the frontier model inside the harness") requires TOST, which
 * a non-significant difference test cannot substitute for (absence of evidence
 * ≠ evidence of absence; Lakens 2017).
 *
 * Design (mirrors cluster-bootstrap.ts):
 *   - PAIRED: every row carries BOTH arms' correctness on the SAME item, and a
 *     resample applies the SAME cluster picks to both arms — so the positive
 *     cross-arm covariance shrinks the diff CI (Miller 2024) and the design is
 *     a true paired equivalence test.
 *   - CLUSTERED: resample WHOLE clusters with replacement (cluster_id =
 *     procedure-family / recurring-user / conversation), because tasks nest in
 *     clusters and instance-level independence is violated (DEFF can be >3×).
 *   - 90% CI: TOST = two one-sided α=0.05 tests ⇔ the 100·(1−2α)=90% CI of the
 *     difference lying entirely inside [−δ, +δ] (Schuirmann 1987; Lakens 2017).
 *
 * Determinism: Mulberry32 PRNG seeded with `seed`; same input+seed ⇒ identical
 * output (re-implemented locally to keep the module self-contained, as
 * cluster-bootstrap.ts does).
 */

export interface PairedRow {
  /** Cluster unit (procedure-family-id / recurring-user-id / conversation_id).
   *  Pre-registered per 03-REDTEAM-RESOLUTIONS.md B2. */
  cluster_id: string;
  /** Arm A correctness on this item (e.g. Opus): 1 = pass, 0 = fail. */
  arm_a: 0 | 1;
  /** Arm B correctness on the SAME item (e.g. Qwen): 1 = pass, 0 = fail. */
  arm_b: 0 | 1;
}

export interface PairedDiffInput {
  rows: readonly PairedRow[];
  /** Bootstrap iterations. Default 10 000 (matches cluster-bootstrap.ts). */
  n_bootstrap?: number;
  /** PRNG seed. Default 42. */
  seed?: number;
  /** CI level. Default 0.90 (the TOST level for α=0.05 two one-sided tests). */
  confidence?: number;
}

export interface PairedDiffResult {
  /** mean(arm_a) − mean(arm_b) on the full (un-resampled) sample. */
  diff_point: number;
  /** Lower bound of the (confidence)% CI of the difference, clamped to [−1,1]. */
  ci_lower: number;
  /** Upper bound, clamped to [−1, 1]. */
  ci_upper: number;
  n_bootstrap: number;
  seed: number;
  confidence: number;
  /** Distinct cluster_id count (report alongside n_rows per 03 B2). */
  n_clusters: number;
  n_rows: number;
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

export function computePairedDiffClusterBootstrapCI(
  input: PairedDiffInput,
): PairedDiffResult {
  const { rows, n_bootstrap = 10000, seed = 42, confidence = 0.9 } = input;

  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('paired-diff bootstrap requires a non-empty rows array');
  }
  if (!Number.isFinite(n_bootstrap) || n_bootstrap < 1 || !Number.isInteger(n_bootstrap)) {
    throw new Error(`paired-diff bootstrap requires n_bootstrap ≥ 1 (integer); got ${n_bootstrap}`);
  }
  if (!Number.isFinite(seed) || !Number.isInteger(seed)) {
    throw new Error(`paired-diff bootstrap requires an integer seed; got ${seed}`);
  }
  if (!Number.isFinite(confidence) || confidence <= 0 || confidence >= 1) {
    throw new Error(`paired-diff bootstrap requires confidence ∈ (0,1); got ${confidence}`);
  }

  // Group by cluster, preserving insertion order for PRNG stability.
  const clusterMap = new Map<string, PairedRow[]>();
  for (const row of rows) {
    if ((row.arm_a !== 0 && row.arm_a !== 1) || (row.arm_b !== 0 && row.arm_b !== 1)) {
      throw new Error(
        `paired rows require arm_a, arm_b ∈ {0,1}; got a=${row.arm_a} b=${row.arm_b} at cluster ${row.cluster_id}`,
      );
    }
    const bucket = clusterMap.get(row.cluster_id);
    if (bucket) bucket.push(row);
    else clusterMap.set(row.cluster_id, [row]);
  }
  const clusters = Array.from(clusterMap.values());
  const nClusters = clusters.length;

  let totalA = 0;
  let totalB = 0;
  for (const r of rows) {
    totalA += r.arm_a;
    totalB += r.arm_b;
  }
  const diff_point = totalA / rows.length - totalB / rows.length;

  // Per-cluster (sumA, sumB, size) so each iteration is O(K).
  const sumA = new Array<number>(nClusters);
  const sumB = new Array<number>(nClusters);
  const size = new Array<number>(nClusters);
  for (let i = 0; i < nClusters; i++) {
    let a = 0;
    let b = 0;
    const c = clusters[i];
    for (const r of c) {
      a += r.arm_a;
      b += r.arm_b;
    }
    sumA[i] = a;
    sumB[i] = b;
    size[i] = c.length;
  }

  const rand = mulberry32(seed);
  const diffs = new Array<number>(n_bootstrap);
  for (let it = 0; it < n_bootstrap; it++) {
    let a = 0;
    let b = 0;
    let n = 0;
    for (let k = 0; k < nClusters; k++) {
      const pick = Math.floor(rand() * nClusters); // SAME pick feeds both arms ⇒ pairing
      a += sumA[pick];
      b += sumB[pick];
      n += size[pick];
    }
    diffs[it] = n === 0 ? 0 : a / n - b / n;
  }

  diffs.sort((x, y) => x - y);
  const lowerQ = (1 - confidence) / 2;
  const upperQ = 1 - lowerQ;
  const lowerIdx = Math.floor(lowerQ * n_bootstrap);
  const upperIdx = Math.min(n_bootstrap - 1, Math.floor(upperQ * n_bootstrap));
  const clamp = (v: number) => Math.max(-1, Math.min(1, v));

  return {
    diff_point,
    ci_lower: clamp(diffs[lowerIdx]),
    ci_upper: clamp(diffs[upperIdx]),
    n_bootstrap,
    seed,
    confidence,
    n_clusters: nClusters,
    n_rows: rows.length,
  };
}

export interface TostInput {
  /** The (1−2α)=90% CI of the paired difference, from
   *  computePairedDiffClusterBootstrapCI. */
  diffCI: Pick<PairedDiffResult, 'ci_lower' | 'ci_upper'>;
  /** Equivalence margin δ (e.g. 0.05 for ±5pp). Pre-register BEFORE the run. */
  margin: number;
}

export interface TostResult {
  /** True iff [ci_lower, ci_upper] ⊆ [−margin, +margin]. */
  equivalent: boolean;
  margin: number;
  ci_lower: number;
  ci_upper: number;
}

export function tostEquivalence(input: TostInput): TostResult {
  const { diffCI, margin } = input;
  if (!Number.isFinite(margin) || margin <= 0) {
    throw new Error(`tostEquivalence requires margin > 0; got ${margin}`);
  }
  const { ci_lower, ci_upper } = diffCI;
  if (!Number.isFinite(ci_lower) || !Number.isFinite(ci_upper)) {
    throw new Error('tostEquivalence requires finite ci_lower and ci_upper');
  }
  if (ci_lower > ci_upper) {
    throw new Error(`tostEquivalence requires ci_lower ≤ ci_upper; got [${ci_lower}, ${ci_upper}]`);
  }
  const equivalent = ci_lower >= -margin && ci_upper <= margin;
  return { equivalent, margin, ci_lower, ci_upper };
}

export interface TostSampleSizeInput {
  /** Equivalence margin δ (e.g. 0.05). */
  margin: number;
  /** Planning value for the true paired gap |μ_A − μ_B| (e.g. 0.01–0.02). MUST be < margin. */
  expectedTrueGap: number;
  /** SD of the paired per-item difference. For paired pass/fail this ≈
   *  sqrt(discordance_rate); e.g. 0.45 for ~20% discordance. Pilot-measure it. */
  sdDiff: number;
  /** Target power (0.80 or 0.90 supported). */
  power: number;
  /** One-sided α per TOST sub-test (0.05 supported). */
  alpha: number;
  /** Cluster design effect DEFF = 1 + (m−1)·ICC. 1 = no clustering. */
  designEffect: number;
}

export interface TostSampleSizeResult {
  /** Required paired items (ceil), already multiplied by designEffect. */
  n_required: number;
  /** Required items BEFORE the design-effect multiplier (informational). */
  n_unclustered: number;
  margin: number;
  expectedTrueGap: number;
  sdDiff: number;
  power: number;
  alpha: number;
  designEffect: number;
}

/** Standard normal upper-quantiles z_{1−p}. Fixed table (matches the repo's
 *  hardcoded-z convention in wilson-ci.ts) — extend deliberately, never guess. */
const Z_UPPER: Readonly<Record<string, number>> = {
  '0.05': 1.6448536269514722, // z_{0.95}
  '0.10': 1.2815515594457831, // z_{0.90}  (power 0.90 → z_β)
  '0.20': 0.8416212335729143, // z_{0.80}  (power 0.80 → z_β)
};

export function computeTostSampleSizePaired(input: TostSampleSizeInput): TostSampleSizeResult {
  const { margin, expectedTrueGap, sdDiff, power, alpha, designEffect } = input;

  if (!Number.isFinite(margin) || margin <= 0) throw new Error(`margin > 0 required; got ${margin}`);
  if (!Number.isFinite(expectedTrueGap) || expectedTrueGap < 0) {
    throw new Error(`expectedTrueGap ≥ 0 required; got ${expectedTrueGap}`);
  }
  if (expectedTrueGap >= margin) {
    throw new Error(`equivalence cannot be powered unless expectedTrueGap < margin; got gap=${expectedTrueGap} margin=${margin}`);
  }
  if (!Number.isFinite(sdDiff) || sdDiff <= 0) throw new Error(`sdDiff > 0 required; got ${sdDiff}`);
  if (!Number.isFinite(designEffect) || designEffect < 1) throw new Error(`designEffect ≥ 1 required; got ${designEffect}`);
  if (alpha !== 0.05) throw new Error(`alpha must be 0.05 (only the TOST z is tabled); got ${alpha}`);
  // For TOST at power 1−β, the standard approximation uses z_{1−β/2}? No — the
  // common Chow/Liu TOST formula uses z_{1−α} + z_{1−β}. Power 0.80 → z_{0.80}.
  const powerKey = power === 0.8 ? '0.20' : power === 0.9 ? '0.10' : null;
  if (powerKey === null) throw new Error(`power must be one of {0.80, 0.90}; got ${power}`);

  const zAlpha = Z_UPPER['0.05'];
  const zBeta = Z_UPPER[powerKey];
  const denom = margin - Math.abs(expectedTrueGap);
  const nRaw = ((zAlpha + zBeta) * sdDiff / denom) ** 2;
  const n_unclustered = Math.ceil(nRaw);
  const n_required = Math.ceil(n_unclustered * designEffect);

  return {
    n_required,
    n_unclustered,
    margin,
    expectedTrueGap,
    sdDiff,
    power,
    alpha,
    designEffect,
  };
}
