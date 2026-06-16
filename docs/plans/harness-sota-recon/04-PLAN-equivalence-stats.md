# Equivalence-Statistics Module — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the paired, cluster-aware **equivalence (TOST)** statistics the harness needs to support the H3 "Qwen ≈ Opus inside the harness" claim — which the harness today cannot compute (it has Wilson + cluster-bootstrap + Fleiss κ, but **no inferential / equivalence test at all**).

**Architecture:** A new pure-functional module `benchmarks/harness/src/stats/equivalence-tost.ts` mirroring the existing `cluster-bootstrap.ts` idiom (Mulberry32 PRNG, seed=42, n_bootstrap=10000, throw-style validation, `.js` import specifiers). Three surfaces: (1) `computePairedDiffClusterBootstrapCI` — resamples whole clusters and applies the SAME picks to BOTH arms to preserve pairing, returning the 90% CI of the paired difference (Opus − Qwen); (2) `tostEquivalence` — declares equivalence iff that CI ⊆ [−δ, +δ]; (3) `computeTostSampleSizePaired` — the powered-N planning helper the red-team requires (so N is derived, not guessed). Plus a **Monte-Carlo coverage-calibration test** — the red-team flagged a mis-implemented TOST CI as "the single likeliest silent failure", so we prove coverage ≈ nominal before any priced run.

**Tech Stack:** TypeScript (ESM, NodeNext), vitest. No new dependencies (PRNG + z-table are in-module, matching `cluster-bootstrap.ts` / `wilson-ci.ts`).

**Spec refs:** `01-DESIGN-SPEC.md` §7, `02-CONTINUAL-MEMORY-PROTOCOL.md` §9, `03-REDTEAM-RESOLUTIONS.md` B1 (powered N), B2 (cluster id + DEFF), B5 (pairing), and "minor: require a pre-run bootstrap coverage check."

**Scope note:** This is Plan 1 of the Phase-0 series. Sibling plans (separate files, separate subsystems): `05` model-registry additions (Opus 4.8 / GPT-5.5 / Gemini + litellm routes), `06` leakage-firewall assertion module, `07` τ²-bench adapter + task-completion oracle, `08` continual-protocol harness (Phase-A/B split + mind build/freeze/hash + overlap audit), `09` ruler-validation + smoke. This plan is self-contained: it produces a tested, importable stats module with zero LLM/network/substrate dependencies.

---

## File Structure

| File | Responsibility |
|---|---|
| `benchmarks/harness/src/stats/equivalence-tost.ts` (create) | Paired cluster-bootstrap diff CI, TOST decision, powered-N helper. Pure functions; no I/O. |
| `benchmarks/harness/tests/stats/equivalence-tost.test.ts` (create) | Determinism, pairing, structural invariants, TOST decisions, validation, **coverage calibration**. |
| `benchmarks/harness/src/stats/index.ts` (modify) | Re-export the new surface (barrel). |

Conventions to copy verbatim from `cluster-bootstrap.ts`: the `mulberry32(seed)` helper (re-implemented locally — keep modules self-contained, as `cluster-bootstrap.ts` does), `n_bootstrap = 10000` / `seed = 42` defaults, throw-on-invalid-input style, `.js` extensions in imports.

---

### Task 1: Paired cluster-bootstrap difference CI

**Files:**
- Create: `benchmarks/harness/src/stats/equivalence-tost.ts`
- Test: `benchmarks/harness/tests/stats/equivalence-tost.test.ts`

- [ ] **Step 1: Write the failing test**

Create `benchmarks/harness/tests/stats/equivalence-tost.test.ts`:

```typescript
/**
 * Equivalence-stats tests — paired cluster-bootstrap diff CI + TOST + N helper.
 * Mirrors the acceptance style of cluster-bootstrap.test.ts.
 */
import { describe, expect, it } from 'vitest';
import {
  computePairedDiffClusterBootstrapCI,
  type PairedRow,
} from '../../src/stats/equivalence-tost.js';

/** Build paired rows: each cluster has `rowsPerCluster` items; arm_a/arm_b
 *  correctness set deterministically by rate so tests don't depend on PRNG. */
function buildPairedRows(
  clusterCount: number,
  rowsPerCluster: number,
  rateA: number,
  rateB: number,
): PairedRow[] {
  const rows: PairedRow[] = [];
  const cA = Math.round(rateA * rowsPerCluster);
  const cB = Math.round(rateB * rowsPerCluster);
  for (let c = 0; c < clusterCount; c++) {
    const cluster_id = `cl-${c}`;
    for (let r = 0; r < rowsPerCluster; r++) {
      rows.push({ cluster_id, arm_a: r < cA ? 1 : 0, arm_b: r < cB ? 1 : 0 });
    }
  }
  return rows;
}

describe('computePairedDiffClusterBootstrapCI — determinism + shape', () => {
  it('is bit-identical on two calls with same input + seed', () => {
    const rows = buildPairedRows(8, 4, 0.75, 0.5);
    const a = computePairedDiffClusterBootstrapCI({ rows, n_bootstrap: 500, seed: 42 });
    const b = computePairedDiffClusterBootstrapCI({ rows, n_bootstrap: 500, seed: 42 });
    expect(a.ci_lower).toBe(b.ci_lower);
    expect(a.ci_upper).toBe(b.ci_upper);
    expect(a.diff_point).toBe(b.diff_point);
  });

  it('defaults n_bootstrap=10000, seed=42, confidence=0.90', () => {
    const rows = buildPairedRows(4, 4, 0.5, 0.5);
    const r = computePairedDiffClusterBootstrapCI({ rows });
    expect(r.n_bootstrap).toBe(10000);
    expect(r.seed).toBe(42);
    expect(r.confidence).toBe(0.9);
  });

  it('reports n_clusters and n_rows', () => {
    const rows = buildPairedRows(3, 4, 1, 0);
    const r = computePairedDiffClusterBootstrapCI({ rows, n_bootstrap: 100, seed: 42 });
    expect(r.n_clusters).toBe(3);
    expect(r.n_rows).toBe(12);
  });
});

describe('computePairedDiffClusterBootstrapCI — correctness of the difference', () => {
  it('diff_point = mean_a − mean_b on the full sample', () => {
    // arm_a 75% correct, arm_b 50% correct → diff = +0.25
    const rows = buildPairedRows(10, 4, 0.75, 0.5);
    const r = computePairedDiffClusterBootstrapCI({ rows, n_bootstrap: 1000, seed: 42 });
    expect(r.diff_point).toBeCloseTo(0.25, 10);
  });

  it('homogeneous A=1,B=0 clusters → diff ≈ 1 with a degenerate CI', () => {
    const rows = buildPairedRows(6, 4, 1, 0);
    const r = computePairedDiffClusterBootstrapCI({ rows, n_bootstrap: 2000, seed: 42 });
    expect(r.diff_point).toBe(1);
    expect(r.ci_lower).toBe(1);
    expect(r.ci_upper).toBe(1);
  });

  it('identical arms → diff_point = 0 and CI brackets 0', () => {
    const rows = buildPairedRows(12, 4, 0.5, 0.5);
    const r = computePairedDiffClusterBootstrapCI({ rows, n_bootstrap: 2000, seed: 42 });
    expect(r.diff_point).toBe(0);
    expect(r.ci_lower).toBeLessThanOrEqual(0);
    expect(r.ci_upper).toBeGreaterThanOrEqual(0);
  });

  it('ci_lower ≤ diff_point ≤ ci_upper and bounds within [−1, 1]', () => {
    const rows = buildPairedRows(15, 3, 0.66, 0.33);
    const r = computePairedDiffClusterBootstrapCI({ rows, n_bootstrap: 1500, seed: 42 });
    expect(r.ci_lower).toBeLessThanOrEqual(r.diff_point);
    expect(r.diff_point).toBeLessThanOrEqual(r.ci_upper);
    expect(r.ci_lower).toBeGreaterThanOrEqual(-1);
    expect(r.ci_upper).toBeLessThanOrEqual(1);
  });

  it('preserves pairing: resampling uses the SAME clusters for both arms', () => {
    // If pairing were broken (independent resampling of A and B), the diff CI
    // would be wider. Here A and B are perfectly correlated per cluster (each
    // cluster is all-A-correct-and-B-correct OR all-wrong) so the PAIRED diff
    // is exactly 0 in every resample → zero-width CI at 0. Independent
    // resampling would produce a non-zero-width CI.
    const rows: PairedRow[] = [];
    for (let c = 0; c < 6; c++) {
      const both = c % 2 === 0 ? 1 : 0;
      for (let r = 0; r < 4; r++) rows.push({ cluster_id: `c-${c}`, arm_a: both as 0 | 1, arm_b: both as 0 | 1 });
    }
    const r = computePairedDiffClusterBootstrapCI({ rows, n_bootstrap: 2000, seed: 42 });
    expect(r.diff_point).toBe(0);
    expect(r.ci_lower).toBe(0);
    expect(r.ci_upper).toBe(0);
  });
});

describe('computePairedDiffClusterBootstrapCI — validation', () => {
  it('rejects empty rows', () => {
    expect(() => computePairedDiffClusterBootstrapCI({ rows: [] })).toThrow(/non-empty/);
  });
  it('rejects arm values ∉ {0,1}', () => {
    const rows = [{ cluster_id: 'a', arm_a: 1 as 0 | 1, arm_b: 2 as unknown as 0 | 1 }];
    expect(() => computePairedDiffClusterBootstrapCI({ rows, n_bootstrap: 10 })).toThrow(/arm_a, arm_b ∈/);
  });
  it('rejects confidence outside (0,1)', () => {
    const rows = buildPairedRows(2, 2, 0.5, 0.5);
    expect(() => computePairedDiffClusterBootstrapCI({ rows, confidence: 1.5 })).toThrow(/confidence/);
  });
  it('rejects non-integer seed', () => {
    const rows = buildPairedRows(2, 2, 0.5, 0.5);
    expect(() => computePairedDiffClusterBootstrapCI({ rows, seed: 1.5 })).toThrow(/integer seed/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run benchmarks/harness/tests/stats/equivalence-tost.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/stats/equivalence-tost.js"` (module does not exist yet).

- [ ] **Step 3: Write the minimal implementation**

Create `benchmarks/harness/src/stats/equivalence-tost.ts`:

```typescript
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run benchmarks/harness/tests/stats/equivalence-tost.test.ts`
Expected: PASS — the `computePairedDiffClusterBootstrapCI` describe blocks green (the `tostEquivalence` / sample-size imports are added in later tasks; if vitest reports those as not-yet-imported, that's fine — they aren't referenced until Task 2/4).

- [ ] **Step 5: Commit**

```bash
git add benchmarks/harness/src/stats/equivalence-tost.ts benchmarks/harness/tests/stats/equivalence-tost.test.ts
git commit -m "feat(benchmarks): paired cluster-bootstrap difference CI for equivalence testing"
```

---

### Task 2: TOST equivalence decision

**Files:**
- Modify: `benchmarks/harness/src/stats/equivalence-tost.ts` (append)
- Test: `benchmarks/harness/tests/stats/equivalence-tost.test.ts` (append)

- [ ] **Step 1: Write the failing test** — append to the test file:

```typescript
import {
  tostEquivalence,
  type TostInput,
} from '../../src/stats/equivalence-tost.js';

describe('tostEquivalence — decision rule', () => {
  it('equivalent when the diff CI lies entirely inside [−δ, +δ]', () => {
    const r = tostEquivalence({ diffCI: { ci_lower: -0.021, ci_upper: 0.034 }, margin: 0.05 });
    expect(r.equivalent).toBe(true);
    expect(r.margin).toBe(0.05);
  });

  it('NOT equivalent when the CI crosses the upper bound', () => {
    const r = tostEquivalence({ diffCI: { ci_lower: -0.01, ci_upper: 0.062 }, margin: 0.05 });
    expect(r.equivalent).toBe(false);
  });

  it('NOT equivalent when the CI crosses the lower bound', () => {
    const r = tostEquivalence({ diffCI: { ci_lower: -0.06, ci_upper: 0.01 }, margin: 0.05 });
    expect(r.equivalent).toBe(false);
  });

  it('boundary: CI exactly touching ±δ counts as equivalent (⊆ is inclusive)', () => {
    const r = tostEquivalence({ diffCI: { ci_lower: -0.05, ci_upper: 0.05 }, margin: 0.05 });
    expect(r.equivalent).toBe(true);
  });

  it('echoes the CI bounds it was given', () => {
    const r = tostEquivalence({ diffCI: { ci_lower: -0.02, ci_upper: 0.03 }, margin: 0.05 });
    expect(r.ci_lower).toBe(-0.02);
    expect(r.ci_upper).toBe(0.03);
  });

  it('rejects a non-positive margin', () => {
    expect(() => tostEquivalence({ diffCI: { ci_lower: -0.01, ci_upper: 0.01 }, margin: 0 })).toThrow(/margin > 0/);
  });

  it('rejects an inverted CI (lower > upper)', () => {
    expect(() => tostEquivalence({ diffCI: { ci_lower: 0.05, ci_upper: -0.05 }, margin: 0.05 })).toThrow(/ci_lower ≤ ci_upper/);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run benchmarks/harness/tests/stats/equivalence-tost.test.ts -t "tostEquivalence"`
Expected: FAIL — `tostEquivalence` is not exported.

- [ ] **Step 3: Implement** — append to `equivalence-tost.ts`:

```typescript
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
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run benchmarks/harness/tests/stats/equivalence-tost.test.ts -t "tostEquivalence"`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add benchmarks/harness/src/stats/equivalence-tost.ts benchmarks/harness/tests/stats/equivalence-tost.test.ts
git commit -m "feat(benchmarks): TOST equivalence decision (90% CI ⊆ [−δ,+δ])"
```

---

### Task 3: Coverage calibration test (the silent-failure guard)

**Files:**
- Test: `benchmarks/harness/tests/stats/equivalence-tost.test.ts` (append)

> Why: the red-team flagged a mis-implemented TOST/bootstrap CI as "the single likeliest silent failure." This Monte-Carlo test generates synthetic paired data at a KNOWN true difference and verifies the 90% CI's empirical coverage ≈ nominal. Fully deterministic (fixed seeds), so it is reproducible, not flaky. If it fails, the bootstrap is miscalibrated — do NOT run a priced benchmark.

- [ ] **Step 1: Write the test** — append:

```typescript
import { computePairedDiffClusterBootstrapCI as ciFn } from '../../src/stats/equivalence-tost.js';

/** Local Mulberry32 for deterministic synthetic-data generation in the test. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('computePairedDiffClusterBootstrapCI — empirical coverage ≈ 90%', () => {
  it('a 90% CI covers the true paired difference ~90% of the time (independent items)', () => {
    // Independent items (one item per cluster), true marginals pA=0.70, pB=0.65,
    // with positive within-item correlation (shared latent difficulty) so the
    // PAIRED diff is the right target. True diff = pA − pB = 0.05.
    const pA = 0.7;
    const pB = 0.65;
    const trueDiff = pA - pB;
    const nReplicates = 300;
    const nItems = 200;
    let covered = 0;
    for (let rep = 0; rep < nReplicates; rep++) {
      const gen = rng(1000 + rep);
      const rows: PairedRow[] = [];
      for (let i = 0; i < nItems; i++) {
        // shared difficulty u induces positive A/B correlation (realistic pairing)
        const u = gen();
        const a = u < pA ? 1 : 0;
        const b = u < pB ? 1 : 0;
        rows.push({ cluster_id: `item-${i}`, arm_a: a as 0 | 1, arm_b: b as 0 | 1 });
      }
      const r = ciFn({ rows, n_bootstrap: 600, seed: 42, confidence: 0.9 });
      if (r.ci_lower <= trueDiff && trueDiff <= r.ci_upper) covered++;
    }
    const coverage = covered / nReplicates;
    // Nominal 0.90; allow Monte-Carlo + discreteness slack. A value far outside
    // this band means the CI is miscalibrated — block the priced run.
    expect(coverage).toBeGreaterThanOrEqual(0.85);
    expect(coverage).toBeLessThanOrEqual(0.97);
  });
});
```

- [ ] **Step 2: Run it** (no implementation change — exercises Task-1 code)

Run: `npx vitest run benchmarks/harness/tests/stats/equivalence-tost.test.ts -t "empirical coverage"`
Expected: PASS. If it FAILS (coverage outside [0.85, 0.97]), STOP — the bootstrap CI is miscalibrated; debug Task 1 before proceeding. (Note: this test does ~300×600 resamples; it may take a few seconds — acceptable for a one-shot calibration guard.)

- [ ] **Step 3: Commit**

```bash
git add benchmarks/harness/tests/stats/equivalence-tost.test.ts
git commit -m "test(benchmarks): Monte-Carlo coverage calibration for the equivalence CI"
```

---

### Task 4: Powered sample-size helper (so N is derived, not guessed)

**Files:**
- Modify: `benchmarks/harness/src/stats/equivalence-tost.ts` (append)
- Test: `benchmarks/harness/tests/stats/equivalence-tost.test.ts` (append)

> Why (03-REDTEAM B1): N≈250-400 was the at-true-diff-0 figure. A powered TOST N must use the planning gap, the diff SD, the power target, and the cluster design effect (DEFF). This helper makes the pre-registration N a derivation, not a guess.

- [ ] **Step 1: Write the failing test** — append:

```typescript
import {
  computeTostSampleSizePaired,
  type TostSampleSizeInput,
} from '../../src/stats/equivalence-tost.js';

describe('computeTostSampleSizePaired — powered N', () => {
  it('returns a positive integer N and echoes inputs', () => {
    const r = computeTostSampleSizePaired({
      margin: 0.05, expectedTrueGap: 0.01, sdDiff: 0.45, power: 0.8, alpha: 0.05, designEffect: 1,
    });
    expect(Number.isInteger(r.n_required)).toBe(true);
    expect(r.n_required).toBeGreaterThan(0);
    expect(r.margin).toBe(0.05);
    expect(r.designEffect).toBe(1);
  });

  it('a non-zero planning gap inflates N vs gap=0 (the key red-team point)', () => {
    const base = { margin: 0.05, sdDiff: 0.45, power: 0.8, alpha: 0.05, designEffect: 1 } as const;
    const atZero = computeTostSampleSizePaired({ ...base, expectedTrueGap: 0 });
    const atTwo = computeTostSampleSizePaired({ ...base, expectedTrueGap: 0.02 });
    expect(atTwo.n_required).toBeGreaterThan(atZero.n_required);
  });

  it('design effect multiplies N (clustering inflates required N)', () => {
    const base = { margin: 0.05, expectedTrueGap: 0.01, sdDiff: 0.45, power: 0.8, alpha: 0.05 } as const;
    const deff1 = computeTostSampleSizePaired({ ...base, designEffect: 1 });
    const deff2 = computeTostSampleSizePaired({ ...base, designEffect: 2 });
    expect(deff2.n_required).toBe(deff1.n_required * 2);
  });

  it('throws when the planning gap ≥ margin (equivalence impossible to power)', () => {
    expect(() =>
      computeTostSampleSizePaired({
        margin: 0.05, expectedTrueGap: 0.05, sdDiff: 0.45, power: 0.8, alpha: 0.05, designEffect: 1,
      }),
    ).toThrow(/expectedTrueGap < margin/);
  });

  it('rejects unsupported power / alpha (z-table is fixed)', () => {
    expect(() =>
      computeTostSampleSizePaired({
        margin: 0.05, expectedTrueGap: 0.01, sdDiff: 0.45, power: 0.5, alpha: 0.05, designEffect: 1,
      }),
    ).toThrow(/power must be one of/);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run benchmarks/harness/tests/stats/equivalence-tost.test.ts -t "powered N"`
Expected: FAIL — `computeTostSampleSizePaired` not exported.

- [ ] **Step 3: Implement** — append to `equivalence-tost.ts`:

```typescript
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
```

> Note on the `designEffect` test: `Math.ceil(n_unclustered * 2)` equals `n_unclustered * 2` only when `n_unclustered` is an integer — it always is (it's `Math.ceil(nRaw)`), so `deff2.n_required === deff1.n_required * 2` holds exactly. ✓

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run benchmarks/harness/tests/stats/equivalence-tost.test.ts -t "powered N"`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add benchmarks/harness/src/stats/equivalence-tost.ts benchmarks/harness/tests/stats/equivalence-tost.test.ts
git commit -m "feat(benchmarks): powered TOST sample-size helper (gap + DEFF aware)"
```

---

### Task 5: Barrel export + full-module verification

**Files:**
- Modify: `benchmarks/harness/src/stats/index.ts`

- [ ] **Step 1: Add the re-exports** — append to `benchmarks/harness/src/stats/index.ts`:

```typescript
export {
  computePairedDiffClusterBootstrapCI,
  tostEquivalence,
  computeTostSampleSizePaired,
} from './equivalence-tost.js';
export type {
  PairedRow,
  PairedDiffInput,
  PairedDiffResult,
  TostInput,
  TostResult,
  TostSampleSizeInput,
  TostSampleSizeResult,
} from './equivalence-tost.js';
```

- [ ] **Step 2: Add a barrel-import test** — append to the test file:

```typescript
import * as stats from '../../src/stats/index.js';

describe('stats barrel exposes the equivalence surface', () => {
  it('re-exports the three equivalence functions', () => {
    expect(typeof stats.computePairedDiffClusterBootstrapCI).toBe('function');
    expect(typeof stats.tostEquivalence).toBe('function');
    expect(typeof stats.computeTostSampleSizePaired).toBe('function');
  });
});
```

- [ ] **Step 3: Run the full module test + typecheck**

Run: `npx vitest run benchmarks/harness/tests/stats/equivalence-tost.test.ts`
Expected: PASS (all describe blocks).

Run: `npx tsc --noEmit --project benchmarks/harness/tsconfig.json`
Expected: exit 0 (no type errors).

- [ ] **Step 4: Run the whole stats suite to confirm no regression**

Run: `npx vitest run benchmarks/harness/tests/stats/`
Expected: PASS — existing `fleiss-kappa`, `wilson-ci`, `cluster-bootstrap` tests still green, plus the new `equivalence-tost` tests.

- [ ] **Step 5: Commit**

```bash
git add benchmarks/harness/src/stats/index.ts benchmarks/harness/tests/stats/equivalence-tost.test.ts
git commit -m "feat(benchmarks): export equivalence-tost from the stats barrel"
```

---

## Self-Review

**Spec coverage:**
- `03` B1 (powered N: gap + DEFF) → Task 4. ✓
- `03` B2 (cluster id + report n_clusters/n_rows) → `PairedRow.cluster_id` + result fields, Task 1. ✓
- `03` B5 (pairing: same picks both arms) → Task 1 impl + the explicit pairing test. ✓
- `01` §7 / `02` §9 (TOST, 90% CI ⊆ [−δ,+δ]) → Task 2. ✓
- "pre-run bootstrap coverage check" (red-team minor) → Task 3. ✓
- The harness's missing inferential test → whole module. ✓
- NOT in scope (sibling plans 05-09): model registry, firewall assertions, adapters, continual harness, ruler-validation. Flagged in the scope note. ✓

**Placeholder scan:** none — every step has complete code or an exact command + expected output.

**Type consistency:** `PairedRow{cluster_id, arm_a, arm_b}`, `PairedDiffResult{diff_point, ci_lower, ci_upper, n_bootstrap, seed, confidence, n_clusters, n_rows}`, `TostInput{diffCI, margin}`, `TostResult{equivalent, margin, ci_lower, ci_upper}`, `TostSampleSizeInput/Result` — names are identical across the impl, the tests, and the barrel. `computePairedDiffClusterBootstrapCI` / `tostEquivalence` / `computeTostSampleSizePaired` spelled identically throughout. ✓
