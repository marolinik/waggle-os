# Ruler-Validation + End-to-End Smoke Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Build the **pre-priced-run gate** for the harness-SOTA benchmark: (1) a **ruler-validation** task that reproduces a published τ²/SWE leaderboard number within a pre-registered tolerance (FAIL ⇒ block the priced run); (2) an **end-to-end SMOKE** that drives the whole chain on a tiny N — split builder → mind build/freeze → leakage-firewall assertions emitting to `events.jsonl` → arm runner producing JSONL rows → equivalence stats (paired-diff CI + TOST + sample-size) — asserting the pipeline runs end-to-end, the firewall assertions all PASS on clean fixtures, and FAIL on a deliberately-poisoned fixture; (3) a **pre-registration checklist** task that emits the manifest hash + confirms code is frozen at a SHA, mirroring the existing `preregistration.ts`.

**Architecture:** Three new pure-ish modules under `benchmarks/harness/src/gate/` plus a tiny fixture set under `benchmarks/harness/tests/gate/fixtures/`. `ruler-validation.ts` compares a measured score against a pre-registered published reference + tolerance band and returns a PASS/FAIL gate verdict (pure; no network — the *measurement* is the caller's runner output, the *validation* is arithmetic). `firewall-assertions.ts` is the leakage-firewall surface (exact + normalized gold-substring assertion over every written artifact) that the smoke exercises and that the real continual-protocol harness (Plan 08) imports; it emits one structured assertion record per artifact into an `events.jsonl` sink. `prereg-checklist.ts` wraps the existing `preregistration.ts` emitter with a "code-frozen-at-SHA + clean-tree" confirmation. The smoke test glues them: a fixture split (Phase-A/B rows) → an in-test deterministic "mind" (a frozen JSON of banked artifacts) → firewall assertions → the existing dry-run `runOne` (stub LLM) producing JSONL → `computePairedDiffClusterBootstrapCI` + `tostEquivalence` + `computeTostSampleSizePaired` from Plan 04 — all offline, deterministic, zero LLM/network.

**Tech Stack:** TypeScript (ESM, harness `tsconfig` = `moduleResolution: Bundler`, `.js` import specifiers per the repo idiom), vitest 3, Node `fs`/`path`/`crypto`. No new dependencies (reuses `@waggle/core` `createCoreLogger`, the existing `preregistration.ts`, the existing `stats/equivalence-tost.ts` from Plan 04, and the runner's dry-run path).

**Spec refs:** `03-REDTEAM-RESOLUTIONS.md` **D6** (ruler-validate before claiming a delta), **C8** (firewall assertions implemented + unit-tested + emitted to `events.jsonl` per row before pre-registration), **B6** (freeze the A/B split at a SHA), **E1/E2** (pin checkpoints/weights, hash per row); `01-DESIGN-SPEC.md` §9 (pre-registration + leakage firewall + ruler-validate each substrate); `02-CONTINUAL-MEMORY-PROTOCOL.md` §5 (firewall invariants) + §11 (mind build/freeze/hash); sibling Plan `04-PLAN-equivalence-stats.md` (the stats surface this wires).

---

## Dependency note (read before starting)

This plan is the integration capstone of the Phase-0 series. Its siblings:
- **04** (DONE) — `benchmarks/harness/src/stats/equivalence-tost.ts`: `computePairedDiffClusterBootstrapCI`, `tostEquivalence`, `computeTostSampleSizePaired`. **This plan imports them directly.**
- **05** — model registry (Opus 4.8 etc.). **Not required to run this plan's smoke** (the smoke runs the stub `qwen3.6-35b-a3b` already in `config/models.json`).
- **06** — leakage-firewall assertion module. **This plan DEFINES `firewall-assertions.ts`** as a self-contained, tested surface (substring + normalized gold gates + `events.jsonl` emit). If Plan 06 is implemented first under the same path, this plan's Task 3 becomes a no-op import; if not, this plan IS the firewall implementation (C8 requires it before pre-registration, so building it here is correct, not duplicative). **Concrete decision:** build it here; Plan 06 extends it (embedding-similarity gate, scope-binding) — those extensions are out of scope for the *gate smoke*, which only needs the substring/normalized gold gates to prove the pipeline.
- **07** — τ²-bench adapter + task-completion oracle. **Not required**: ruler-validation here consumes a *measured score number* (whatever produces it) and validates it against the published reference; Task 1 ships with a fixture-measured score and a real seam for the live runner output.
- **08** — continual-protocol harness (split builder + mind build/freeze/hash). **This plan's smoke uses a fixture split + a fixture frozen mind** (a committed JSON) so it runs today, deterministically, with no dependency on Plan 08's live builder. When Plan 08 lands, its real `buildSplit()` / `freezeMind()` outputs drop into the same fixture shape (documented in Task 4). The smoke asserts the *contract* (firewall PASS on clean, FAIL on poisoned), which is builder-agnostic.

**Net:** every task in this plan is runnable end-to-end with only Plan 04 present. No task contains a placeholder waiting on 05/06/07/08.

---

## File Structure

| File | Responsibility |
|---|---|
| `benchmarks/harness/src/gate/ruler-validation.ts` (create) | Pure: compare a measured score to a pre-registered published reference ± tolerance; return a PASS/FAIL `RulerVerdict`. No I/O, no network. |
| `benchmarks/harness/src/gate/firewall-assertions.ts` (create) | Leakage-firewall surface: normalize + exact/normalized gold-substring assertion over every written artifact; emit one `firewall.assertion` record per artifact to an `events.jsonl` sink; aggregate to a PASS/FAIL `FirewallReport`. |
| `benchmarks/harness/src/gate/prereg-checklist.ts` (create) | Wrap `preregistration.ts`: confirm the working tree is clean + frozen at a SHA, emit the manifest-hash event, return a `PreregChecklistResult`. |
| `benchmarks/harness/src/gate/index.ts` (create) | Barrel re-exporting the three gate surfaces. |
| `benchmarks/harness/tests/gate/ruler-validation.test.ts` (create) | Tolerance band, PASS/FAIL boundaries, validation throws. |
| `benchmarks/harness/tests/gate/firewall-assertions.test.ts` (create) | Clean-artifact PASS, poisoned-artifact FAIL, normalization, `events.jsonl` emit shape. |
| `benchmarks/harness/tests/gate/prereg-checklist.test.ts` (create) | Clean-tree PASS, dirty-tree FAIL, manifest-hash echo. |
| `benchmarks/harness/tests/gate/e2e-smoke.test.ts` (create) | The end-to-end integration smoke: split → mind → firewall → dry-run `runOne` JSONL → stats. Asserts clean PASS + poisoned FAIL. |
| `benchmarks/harness/tests/gate/fixtures/phase-split.json` (create) | Tiny Phase-A/B fixture split (paired rows + golds) — stands in for Plan 08's `buildSplit()` output. |
| `benchmarks/harness/tests/gate/fixtures/frozen-mind.clean.json` (create) | Banked artifacts containing NO Phase-B gold (firewall must PASS). |
| `benchmarks/harness/tests/gate/fixtures/frozen-mind.poisoned.json` (create) | Banked artifacts containing a Phase-B gold substring (firewall must FAIL). |

Conventions to copy verbatim from `cluster-bootstrap.ts` / `equivalence-tost.ts`: throw-on-invalid-input style, `.js` import extensions, explicit exported interfaces, no `any`, immutable returns. Conventions from `preregistration.ts`: `createCoreLogger(scope)` for structured events, `execFileSync('git', …)` (no shell) for SHA, byte-hash via `crypto.createHash('sha256')`.

---

### Task 1: Ruler-validation gate (D6)

A published-number reproduction gate. The harness's prior memory arc proved this works (`memori-head-to-head`: reproduced Memori's published 81.95 at 81.98, within 0.03pp ⇒ ruler trustworthy). This task generalizes that into a reusable, pre-registered gate: given a *measured* score and a *pre-registered* `{published, tolerance}`, decide PASS/FAIL.

**Files:**
- Create: `benchmarks/harness/src/gate/ruler-validation.ts`
- Test: `benchmarks/harness/tests/gate/ruler-validation.test.ts`

- [ ] **Step 1: Write the failing test**

Create `benchmarks/harness/tests/gate/ruler-validation.test.ts`:

```typescript
/**
 * Ruler-validation gate tests (03-REDTEAM-RESOLUTIONS D6).
 * Reproduce a published τ²/SWE number within a pre-registered tolerance
 * BEFORE claiming any delta. FAIL ⇒ block the priced run.
 */
import { describe, expect, it } from 'vitest';
import {
  validateRuler,
  type RulerSpec,
  type RulerVerdict,
} from '../../src/gate/ruler-validation.js';

const TAU2_RETAIL: RulerSpec = {
  substrate: 'tau2-bench',
  split: 'retail',
  model: 'gpt-4.1-mini',
  published_score: 0.8195, // Memori-precedent style: fraction in [0,1]
  tolerance_abs: 0.01, // ±1pp pre-registered band
  source: 'Sierra tau2-bench leaderboard 2026-06 (pre-registered ref)',
};

describe('validateRuler — tolerance band', () => {
  it('PASS when the measured score is inside the ±tolerance band', () => {
    const v: RulerVerdict = validateRuler(TAU2_RETAIL, 0.8198);
    expect(v.pass).toBe(true);
    expect(v.measured_score).toBe(0.8198);
    expect(v.published_score).toBe(0.8195);
    expect(v.delta).toBeCloseTo(0.0003, 10);
    expect(v.abs_delta).toBeCloseTo(0.0003, 10);
    expect(v.tolerance_abs).toBe(0.01);
  });

  it('PASS at the exact lower edge (band is inclusive)', () => {
    const v = validateRuler(TAU2_RETAIL, 0.8195 - 0.01);
    expect(v.pass).toBe(true);
    expect(v.abs_delta).toBeCloseTo(0.01, 10);
  });

  it('PASS at the exact upper edge (band is inclusive)', () => {
    const v = validateRuler(TAU2_RETAIL, 0.8195 + 0.01);
    expect(v.pass).toBe(true);
  });

  it('FAIL when measured is below the band', () => {
    const v = validateRuler(TAU2_RETAIL, 0.80);
    expect(v.pass).toBe(false);
    expect(v.abs_delta).toBeGreaterThan(0.01);
    expect(v.reason).toMatch(/outside the pre-registered/);
  });

  it('FAIL when measured is above the band (a too-good reproduction is also suspect)', () => {
    const v = validateRuler(TAU2_RETAIL, 0.95);
    expect(v.pass).toBe(false);
    expect(v.abs_delta).toBeGreaterThan(0.01);
  });

  it('echoes the spec identity fields for the audit trail', () => {
    const v = validateRuler(TAU2_RETAIL, 0.8198);
    expect(v.substrate).toBe('tau2-bench');
    expect(v.split).toBe('retail');
    expect(v.model).toBe('gpt-4.1-mini');
    expect(v.source).toBe(TAU2_RETAIL.source);
  });
});

describe('validateRuler — validation', () => {
  it('rejects a non-positive tolerance', () => {
    expect(() => validateRuler({ ...TAU2_RETAIL, tolerance_abs: 0 }, 0.8195)).toThrow(/tolerance_abs > 0/);
  });
  it('rejects a published_score outside [0,1]', () => {
    expect(() => validateRuler({ ...TAU2_RETAIL, published_score: 1.5 }, 0.8)).toThrow(/published_score ∈ \[0, 1\]/);
  });
  it('rejects a measured score outside [0,1]', () => {
    expect(() => validateRuler(TAU2_RETAIL, 1.2)).toThrow(/measured ∈ \[0, 1\]/);
  });
  it('rejects a non-finite measured score', () => {
    expect(() => validateRuler(TAU2_RETAIL, Number.NaN)).toThrow(/measured ∈ \[0, 1\]/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run benchmarks/harness/tests/gate/ruler-validation.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/gate/ruler-validation.js"` (module does not exist yet).

- [ ] **Step 3: Write the minimal implementation**

Create `benchmarks/harness/src/gate/ruler-validation.ts`:

```typescript
/**
 * Ruler-validation gate (03-REDTEAM-RESOLUTIONS D6).
 *
 * Before claiming ANY delta on a substrate, reproduce a published leaderboard
 * number within a PRE-REGISTERED absolute tolerance. This is the same move the
 * prior memory arc made (reproduced Memori's published 81.95 at 81.98, within
 * 0.03pp ⇒ the ruler is trustworthy). Generalized here into a reusable gate.
 *
 * This module is pure arithmetic: the *measurement* (running the native,
 * unmodified τ²/SWE distribution for one model) is produced by the runner /
 * the substrate adapter; this function VALIDATES that measured number against
 * the pre-registered reference. A FAIL must block the priced run.
 *
 * Two-sided band on purpose: a reproduction that is FAR ABOVE the published
 * number is as suspect as one far below — it means our harness measures
 * something different (different split, leaked context, different metric),
 * so the comparison would not be apples-to-apples. Both edges fail.
 */

export interface RulerSpec {
  /** Substrate id, e.g. 'tau2-bench' | 'swe-bench-verified'. */
  substrate: string;
  /** Split / domain, e.g. 'retail' | 'airline' | 'verified'. */
  split: string;
  /** Model id whose published score we reproduce. */
  model: string;
  /** Published leaderboard score as a fraction in [0, 1]. */
  published_score: number;
  /** Pre-registered absolute tolerance (e.g. 0.01 = ±1pp). MUST be > 0. */
  tolerance_abs: number;
  /** Provenance string for the published number (leaderboard + date + ref). */
  source: string;
}

export interface RulerVerdict {
  pass: boolean;
  substrate: string;
  split: string;
  model: string;
  measured_score: number;
  published_score: number;
  /** measured − published (signed). */
  delta: number;
  /** |measured − published|. */
  abs_delta: number;
  tolerance_abs: number;
  source: string;
  /** Human-readable explanation (always set; empty-string-free). */
  reason: string;
}

export function validateRuler(spec: RulerSpec, measured_score: number): RulerVerdict {
  if (!Number.isFinite(spec.tolerance_abs) || spec.tolerance_abs <= 0) {
    throw new Error(`ruler validation requires tolerance_abs > 0; got ${spec.tolerance_abs}`);
  }
  if (!Number.isFinite(spec.published_score) || spec.published_score < 0 || spec.published_score > 1) {
    throw new Error(`ruler validation requires published_score ∈ [0, 1]; got ${spec.published_score}`);
  }
  if (!Number.isFinite(measured_score) || measured_score < 0 || measured_score > 1) {
    throw new Error(`ruler validation requires measured ∈ [0, 1]; got ${measured_score}`);
  }

  const delta = measured_score - spec.published_score;
  const abs_delta = Math.abs(delta);
  const pass = abs_delta <= spec.tolerance_abs;
  const reason = pass
    ? `reproduced ${spec.model} on ${spec.substrate}/${spec.split}: |Δ|=${abs_delta.toFixed(4)} ≤ tol ${spec.tolerance_abs} (ruler trustworthy)`
    : `measured ${measured_score.toFixed(4)} is outside the pre-registered ±${spec.tolerance_abs} band around published ${spec.published_score.toFixed(4)} (|Δ|=${abs_delta.toFixed(4)}) — BLOCK the priced run; the ruler is not reproduced`;

  return {
    pass,
    substrate: spec.substrate,
    split: spec.split,
    model: spec.model,
    measured_score,
    published_score: spec.published_score,
    delta,
    abs_delta,
    tolerance_abs: spec.tolerance_abs,
    source: spec.source,
    reason,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run benchmarks/harness/tests/gate/ruler-validation.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git -C <worktree> add benchmarks/harness/src/gate/ruler-validation.ts benchmarks/harness/tests/gate/ruler-validation.test.ts
git -C <worktree> commit -m "feat(benchmarks): ruler-validation gate — reproduce published score within tolerance (D6)"
```

---

### Task 2: Leakage-firewall assertions + `events.jsonl` emit (C8)

C8 mandates: implement + unit-test every firewall assertion (substring + normalized gold gate over EVERY written artifact — frame, skill body, write-back, correction, identity/awareness), freeze at a SHA, and **emit each assertion's pass/fail into `events.jsonl` per row** so the audit proves they ran. This task ships the substring/normalized gold gates + the per-artifact `events.jsonl` emit. (Plan 06 later extends with the embedding-similarity gate + scope-binding; out of scope for the gate smoke.)

**Files:**
- Create: `benchmarks/harness/src/gate/firewall-assertions.ts`
- Test: `benchmarks/harness/tests/gate/firewall-assertions.test.ts`

- [ ] **Step 1: Write the failing test**

Create `benchmarks/harness/tests/gate/firewall-assertions.test.ts`:

```typescript
/**
 * Leakage-firewall assertion tests (03-REDTEAM-RESOLUTIONS C8;
 * 02-CONTINUAL-MEMORY-PROTOCOL §5).
 *
 * Every written artifact (frame / skill body / write-back / correction /
 * identity / awareness) is asserted to contain NO Phase-B gold answer
 * substring (exact + normalized). Each assertion emits one record to an
 * events.jsonl sink. Clean artifacts ⇒ report PASS; a poisoned artifact ⇒
 * report FAIL with the offending artifact named.
 */
import { describe, expect, it } from 'vitest';
import {
  normalizeForGoldMatch,
  assertArtifactsClean,
  type Artifact,
  type FirewallReport,
  type FirewallEventSink,
} from '../../src/gate/firewall-assertions.js';

function sink(): { events: Record<string, unknown>[]; emit: FirewallEventSink } {
  const events: Record<string, unknown>[] = [];
  return { events, emit: (e) => { events.push(e); } };
}

const GOLDS = ['The refund is $42.50', 'order #A-1007 was cancelled'];

const CLEAN: Artifact[] = [
  { artifact_id: 'skill-1', kind: 'skill', content: 'process_return(order): look up order, check policy window, issue refund.' },
  { artifact_id: 'fact-1', kind: 'fact', content: 'Refund policy: returns accepted within 30 days of delivery.' },
  { artifact_id: 'corr-1', kind: 'correction', content: 'Previously applied the wrong fee table; use the current-tier table.' },
  { artifact_id: 'user-1', kind: 'identity', content: 'Recurring user prefers email receipts.' },
];

describe('normalizeForGoldMatch', () => {
  it('lowercases, collapses whitespace, strips punctuation for the normalized gate', () => {
    expect(normalizeForGoldMatch('The  Refund is $42.50!')).toBe('the refund is 4250');
  });
  it('is idempotent', () => {
    const once = normalizeForGoldMatch('Order #A-1007 was CANCELLED.');
    expect(normalizeForGoldMatch(once)).toBe(once);
  });
});

describe('assertArtifactsClean — clean fixtures PASS', () => {
  it('reports pass=true and emits one event per artifact', () => {
    const s = sink();
    const report: FirewallReport = assertArtifactsClean({ artifacts: CLEAN, golds: GOLDS, emit: s.emit });
    expect(report.pass).toBe(true);
    expect(report.n_artifacts).toBe(4);
    expect(report.n_violations).toBe(0);
    expect(report.violations).toEqual([]);
    expect(s.events).toHaveLength(4);
    for (const e of s.events) {
      expect(e.event).toBe('firewall.assertion');
      expect(e.pass).toBe(true);
      expect(e.gate).toBe('gold-substring');
    }
  });
});

describe('assertArtifactsClean — poisoned artifact FAILS', () => {
  it('catches an exact gold substring embedded in a skill body', () => {
    const s = sink();
    const poisoned: Artifact[] = [
      ...CLEAN,
      { artifact_id: 'skill-bad', kind: 'skill', content: 'To answer: The refund is $42.50 — just say that.' },
    ];
    const report = assertArtifactsClean({ artifacts: poisoned, golds: GOLDS, emit: s.emit });
    expect(report.pass).toBe(false);
    expect(report.n_violations).toBe(1);
    expect(report.violations[0].artifact_id).toBe('skill-bad');
    expect(report.violations[0].matched_gold).toBe('The refund is $42.50');
    expect(report.violations[0].match_kind).toBe('exact');
    // The poisoned artifact's event must record the failure.
    const bad = s.events.find(e => e.artifact_id === 'skill-bad');
    expect(bad?.pass).toBe(false);
  });

  it('catches a normalized (punctuation/case/space-mangled) gold leak', () => {
    const s = sink();
    const poisoned: Artifact[] = [
      ...CLEAN,
      { artifact_id: 'fact-bad', kind: 'fact', content: 'note: ORDER  #a1007 WAS cancelled, fyi' },
    ];
    const report = assertArtifactsClean({ artifacts: poisoned, golds: GOLDS, emit: s.emit });
    expect(report.pass).toBe(false);
    expect(report.violations[0].artifact_id).toBe('fact-bad');
    expect(report.violations[0].match_kind).toBe('normalized');
  });
});

describe('assertArtifactsClean — validation', () => {
  it('rejects an empty golds list (a firewall with no golds is a no-op trap)', () => {
    expect(() => assertArtifactsClean({ artifacts: CLEAN, golds: [], emit: sink().emit })).toThrow(/at least one gold/);
  });
  it('rejects an artifact missing an id', () => {
    const bad = [{ artifact_id: '', kind: 'fact' as const, content: 'x' }];
    expect(() => assertArtifactsClean({ artifacts: bad, golds: GOLDS, emit: sink().emit })).toThrow(/artifact_id/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run benchmarks/harness/tests/gate/firewall-assertions.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/gate/firewall-assertions.js"`.

- [ ] **Step 3: Write the minimal implementation**

Create `benchmarks/harness/src/gate/firewall-assertions.ts`:

```typescript
/**
 * Leakage-firewall assertions (03-REDTEAM-RESOLUTIONS C8;
 * 02-CONTINUAL-MEMORY-PROTOCOL §5).
 *
 * Asserts that NO Phase-B gold answer leaked into ANY written artifact the
 * harness banks during Phase A — skill bodies, write-back frames, corrections,
 * identity/awareness — not just ingest frames (C1: skills bypass the legacy
 * firewall). Two gates per (artifact × gold):
 *   - exact: gold substring appears verbatim in the artifact content.
 *   - normalized: gold appears after lower-casing, whitespace-collapse, and
 *     punctuation-strip (catches paraphrase-by-formatting, C4).
 *
 * Each assertion emits ONE structured record into an events.jsonl sink so the
 * audit proves the firewall ran on the priced run (C8). The aggregate report
 * is PASS iff zero violations.
 *
 * Plan 06 extends this with an embedding-similarity gate + scope-binding; this
 * module ships the substring/normalized gates required to clear pre-registration
 * and drive the end-to-end gate smoke.
 */

export type ArtifactKind =
  | 'frame' | 'skill' | 'fact' | 'correction' | 'identity' | 'awareness' | 'user-turn';

export interface Artifact {
  artifact_id: string;
  kind: ArtifactKind;
  content: string;
}

export interface FirewallEvent {
  event: 'firewall.assertion';
  gate: 'gold-substring';
  artifact_id: string;
  artifact_kind: ArtifactKind;
  pass: boolean;
  /** When pass=false: which gold matched and how. Null when pass=true. */
  matched_gold: string | null;
  match_kind: 'exact' | 'normalized' | null;
}

/** Caller-supplied sink. The smoke + the real harness pass an events.jsonl
 *  appender; tests pass an in-memory collector. */
export type FirewallEventSink = (event: FirewallEvent) => void;

export interface FirewallViolation {
  artifact_id: string;
  artifact_kind: ArtifactKind;
  matched_gold: string;
  match_kind: 'exact' | 'normalized';
}

export interface FirewallReport {
  pass: boolean;
  n_artifacts: number;
  n_violations: number;
  violations: FirewallViolation[];
}

export interface FirewallInput {
  artifacts: readonly Artifact[];
  /** Phase-B gold answers that must NOT appear in any artifact. */
  golds: readonly string[];
  emit: FirewallEventSink;
}

/** Lower-case, strip all non-alphanumeric (incl. punctuation + symbols),
 *  collapse internal whitespace runs to a single space, trim. Deterministic
 *  + idempotent. */
export function normalizeForGoldMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function assertArtifactsClean(input: FirewallInput): FirewallReport {
  const { artifacts, golds, emit } = input;
  if (!Array.isArray(golds) || golds.length === 0) {
    throw new Error('firewall requires at least one gold answer to assert against');
  }

  const normGolds = golds.map(g => ({ raw: g, norm: normalizeForGoldMatch(g) }));
  const violations: FirewallViolation[] = [];

  for (const artifact of artifacts) {
    if (!artifact.artifact_id) {
      throw new Error('firewall artifact requires a non-empty artifact_id');
    }
    const contentNorm = normalizeForGoldMatch(artifact.content);

    let matchedGold: string | null = null;
    let matchKind: 'exact' | 'normalized' | null = null;
    for (const g of normGolds) {
      if (artifact.content.includes(g.raw)) {
        matchedGold = g.raw;
        matchKind = 'exact';
        break;
      }
      // Normalized gate only fires on non-empty normalized golds (a gold that
      // normalizes to '' would match every artifact spuriously).
      if (g.norm.length > 0 && contentNorm.includes(g.norm)) {
        matchedGold = g.raw;
        matchKind = 'normalized';
        break;
      }
    }

    const pass = matchedGold === null;
    if (!pass && matchKind !== null) {
      violations.push({
        artifact_id: artifact.artifact_id,
        artifact_kind: artifact.kind,
        matched_gold: matchedGold as string,
        match_kind: matchKind,
      });
    }

    emit({
      event: 'firewall.assertion',
      gate: 'gold-substring',
      artifact_id: artifact.artifact_id,
      artifact_kind: artifact.kind,
      pass,
      matched_gold: matchedGold,
      match_kind: matchKind,
    });
  }

  return {
    pass: violations.length === 0,
    n_artifacts: artifacts.length,
    n_violations: violations.length,
    violations,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run benchmarks/harness/tests/gate/firewall-assertions.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git -C <worktree> add benchmarks/harness/src/gate/firewall-assertions.ts benchmarks/harness/tests/gate/firewall-assertions.test.ts
git -C <worktree> commit -m "feat(benchmarks): leakage-firewall gold-substring assertions + events.jsonl emit (C8)"
```

---

### Task 3: Pre-registration checklist (code frozen at a SHA)

Mirrors the existing `preregistration.ts` (which emits the manifest-hash event). This adds the C8/§9 "code frozen at a SHA" confirmation: assert the working tree is clean, capture the frozen SHA, emit the manifest-hash event, and return a single `PreregChecklistResult` the gate can log.

**Files:**
- Create: `benchmarks/harness/src/gate/prereg-checklist.ts`
- Test: `benchmarks/harness/tests/gate/prereg-checklist.test.ts`

- [ ] **Step 1: Write the failing test**

Create `benchmarks/harness/tests/gate/prereg-checklist.test.ts`:

```typescript
/**
 * Pre-registration checklist tests (01-DESIGN-SPEC §9: code frozen at a SHA).
 * Wraps preregistration.ts. We inject a git-state probe + an emit spy so the
 * test never shells out to git and never logs.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  runPreregChecklist,
  type PreregChecklistInput,
  type GitState,
} from '../../src/gate/prereg-checklist.js';
import type { PreregistrationManifestPayload } from '../../src/preregistration.js';

function payload(): PreregistrationManifestPayload {
  return {
    manifest_hash: 'a'.repeat(64),
    manifest_path: 'decisions/x.manifest.yaml',
    manifest_locked_at: '2026-06-16T00:00:00Z',
    dataset_version: 'b'.repeat(64),
    dataset_path: 'data/tau2/retail.jsonl',
    dataset_instance_count: 50,
    per_cell: ['agentic'],
    judge_tiebreak: 'quadri-vendor',
    judge_models: [],
    emitted_at: '2026-06-16T00:00:00Z',
    runner_version: 'deadbee',
    runner_invocation: { argv: ['node', 'runner'], cwd: '/x' },
  };
}

function input(over: Partial<PreregChecklistInput>): PreregChecklistInput {
  const emit = vi.fn();
  const probeGit = vi.fn<[], GitState>(() => ({ clean: true, sha: 'deadbeef' }));
  return { manifest: payload(), emit, probeGit, ...over };
}

describe('runPreregChecklist — clean tree', () => {
  it('PASS when the tree is clean; echoes the frozen SHA and emits the manifest event', () => {
    const emit = vi.fn();
    const probeGit = vi.fn<[], GitState>(() => ({ clean: true, sha: 'cafe1234' }));
    const r = runPreregChecklist(input({ emit, probeGit }));
    expect(r.pass).toBe(true);
    expect(r.frozen_sha).toBe('cafe1234');
    expect(r.tree_clean).toBe(true);
    expect(r.manifest_hash).toBe('a'.repeat(64));
    expect(emit).toHaveBeenCalledTimes(1);
    expect(probeGit).toHaveBeenCalledTimes(1);
  });
});

describe('runPreregChecklist — dirty tree blocks', () => {
  it('FAIL when the working tree is dirty; does NOT emit the manifest event', () => {
    const emit = vi.fn();
    const probeGit = vi.fn<[], GitState>(() => ({ clean: false, sha: 'cafe1234' }));
    const r = runPreregChecklist(input({ emit, probeGit }));
    expect(r.pass).toBe(false);
    expect(r.tree_clean).toBe(false);
    expect(r.reason).toMatch(/working tree is not clean/);
    expect(emit).not.toHaveBeenCalled();
  });
});

describe('runPreregChecklist — validation', () => {
  it('rejects a manifest_hash that is not 64-hex', () => {
    const m = { ...payload(), manifest_hash: 'nope' };
    expect(() => runPreregChecklist(input({ manifest: m }))).toThrow(/manifest_hash/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run benchmarks/harness/tests/gate/prereg-checklist.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/gate/prereg-checklist.js"`.

- [ ] **Step 3: Write the minimal implementation**

Create `benchmarks/harness/src/gate/prereg-checklist.ts`:

```typescript
/**
 * Pre-registration checklist (01-DESIGN-SPEC §9; 03-REDTEAM C8).
 *
 * The final gate before a priced run: confirm the code is FROZEN at a SHA
 * (clean working tree + captured short SHA) and emit the manifest-hash audit
 * anchor (via the existing preregistration emitter). A dirty tree blocks the
 * run — a priced run whose code changed mid-flight is not reproducible.
 *
 * The git probe is injected (no shell-out inside this pure unit) so it is
 * testable; the default probe used by the runner is `defaultGitProbe` below.
 */
import { execFileSync } from 'node:child_process';
import {
  emitPreregistrationManifest,
  type PreregistrationManifestPayload,
} from '../preregistration.js';

export interface GitState {
  /** True iff `git status --porcelain` is empty. */
  clean: boolean;
  /** Short HEAD SHA the run is frozen at. */
  sha: string;
}

/** Probe seam — overridable in tests. Default reads real git state. */
export type GitProbe = () => GitState;

export interface PreregChecklistInput {
  manifest: PreregistrationManifestPayload;
  /** Sink for the manifest-hash event. Default in the runner = the real
   *  preregistration emitter. Injected here so tests can spy. */
  emit?: (payload: PreregistrationManifestPayload) => void;
  /** Git-state probe. Injected so tests don't shell out. */
  probeGit?: GitProbe;
}

export interface PreregChecklistResult {
  pass: boolean;
  tree_clean: boolean;
  frozen_sha: string;
  manifest_hash: string;
  reason: string;
}

/** Real git probe: clean iff `git status --porcelain` is empty; sha from
 *  `git rev-parse --short HEAD`. No shell (execFileSync), hardcoded argv. */
export function defaultGitProbe(cwd: string = process.cwd()): GitState {
  const status = execFileSync('git', ['status', '--porcelain'], {
    cwd, stdio: ['ignore', 'pipe', 'ignore'], timeout: 4000,
  }).toString();
  const sha = execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
    cwd, stdio: ['ignore', 'pipe', 'ignore'], timeout: 4000,
  }).toString().trim();
  return { clean: status.trim().length === 0, sha };
}

export function runPreregChecklist(input: PreregChecklistInput): PreregChecklistResult {
  const { manifest } = input;
  if (!/^[0-9a-f]{64}$/.test(manifest.manifest_hash)) {
    throw new Error(`prereg checklist requires a 64-hex manifest_hash; got ${manifest.manifest_hash}`);
  }
  const probeGit = input.probeGit ?? (() => defaultGitProbe());
  const emit = input.emit ?? emitPreregistrationManifest;

  const git = probeGit();
  if (!git.clean) {
    return {
      pass: false,
      tree_clean: false,
      frozen_sha: git.sha,
      manifest_hash: manifest.manifest_hash,
      reason: `working tree is not clean — freeze the code (commit/stash) before the priced run; current SHA ${git.sha}`,
    };
  }

  emit(manifest);
  return {
    pass: true,
    tree_clean: true,
    frozen_sha: git.sha,
    manifest_hash: manifest.manifest_hash,
    reason: `code frozen at ${git.sha}; manifest ${manifest.manifest_hash} emitted`,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run benchmarks/harness/tests/gate/prereg-checklist.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git -C <worktree> add benchmarks/harness/src/gate/prereg-checklist.ts benchmarks/harness/tests/gate/prereg-checklist.test.ts
git -C <worktree> commit -m "feat(benchmarks): pre-registration checklist — code-frozen-at-SHA gate"
```

---

### Task 4: Gate fixtures (split + clean/poisoned frozen minds)

The end-to-end smoke needs a tiny deterministic split and two frozen-mind variants. These stand in for Plan 08's live `buildSplit()` / `freezeMind()` outputs; the shapes are documented so Plan 08's outputs drop in unchanged.

**Files:**
- Create: `benchmarks/harness/tests/gate/fixtures/phase-split.json`
- Create: `benchmarks/harness/tests/gate/fixtures/frozen-mind.clean.json`
- Create: `benchmarks/harness/tests/gate/fixtures/frozen-mind.poisoned.json`

- [ ] **Step 1: Write the split fixture**

Create `benchmarks/harness/tests/gate/fixtures/phase-split.json`. Phase-B carries paired per-item correctness for two arms (`arm_a` = Opus-stand-in, `arm_b` = Qwen-stand-in) and the gold answers the firewall asserts against. `cluster_id` is the τ²-style procedure-family. The dry-run runner consumes only `instance_id`/`question`/`context`/`expected`/`conversation_id` (the `DatasetInstance` shape); the extra paired/gold fields are read by the stats + firewall legs of the smoke.

```json
{
  "split_id": "gate-smoke-tau2-retail-v1",
  "substrate": "tau2-bench",
  "split": "retail",
  "phase_a_task_ids": ["A-001", "A-002", "A-003", "A-004"],
  "phase_b": [
    {
      "instance_id": "B-001",
      "conversation_id": "proc-return",
      "cluster_id": "proc-return",
      "question": "Process the return for order A-2001 and state the refund total.",
      "context": "Order A-2001: 1 item, $19.99, within 30-day window.",
      "expected": ["19.99"],
      "gold": "The refund total for order A-2001 is $19.99",
      "arm_a": 1,
      "arm_b": 1
    },
    {
      "instance_id": "B-002",
      "conversation_id": "proc-return",
      "cluster_id": "proc-return",
      "question": "Process the return for order A-2002 and state the refund total.",
      "context": "Order A-2002: 1 item, $34.00, within 30-day window.",
      "expected": ["34.00"],
      "gold": "The refund total for order A-2002 is $34.00",
      "arm_a": 1,
      "arm_b": 0
    },
    {
      "instance_id": "B-003",
      "conversation_id": "proc-exchange",
      "cluster_id": "proc-exchange",
      "question": "Exchange item in order A-2003 for the larger size; confirm the new order id.",
      "context": "Order A-2003: size M in stock as L.",
      "expected": ["A-2003-X"],
      "gold": "Exchange complete; new order id A-2003-X",
      "arm_a": 1,
      "arm_b": 1
    },
    {
      "instance_id": "B-004",
      "conversation_id": "proc-exchange",
      "cluster_id": "proc-exchange",
      "question": "Exchange item in order A-2004 for a different color; confirm the new order id.",
      "context": "Order A-2004: color swap available.",
      "expected": ["A-2004-X"],
      "gold": "Exchange complete; new order id A-2004-X",
      "arm_a": 1,
      "arm_b": 1
    }
  ]
}
```

- [ ] **Step 2: Write the clean frozen-mind fixture** (no Phase-B gold appears)

Create `benchmarks/harness/tests/gate/fixtures/frozen-mind.clean.json`:

```json
{
  "mind_id": "gate-smoke-clean-v1",
  "builder": "fixed-neutral-builder",
  "artifacts": [
    { "artifact_id": "skill-return", "kind": "skill", "content": "process_return(order): verify order exists, check the 30-day window, then issue the refund for the item price." },
    { "artifact_id": "skill-exchange", "kind": "skill", "content": "process_exchange(order, target): confirm target variant in stock, create a linked exchange order, return its id." },
    { "artifact_id": "fact-policy", "kind": "fact", "content": "Retail return policy: items are returnable within 30 days of delivery; refund equals the item price." },
    { "artifact_id": "corr-fee", "kind": "correction", "content": "Earlier I added a restock fee that does not apply to standard returns; do not add a fee." },
    { "artifact_id": "user-pref", "kind": "identity", "content": "Recurring user prefers exchanges over refunds when a variant is available." }
  ]
}
```

- [ ] **Step 3: Write the poisoned frozen-mind fixture** (one artifact embeds a Phase-B gold)

Create `benchmarks/harness/tests/gate/fixtures/frozen-mind.poisoned.json`. `skill-leak` embeds the exact `B-002` gold so the firewall MUST FAIL.

```json
{
  "mind_id": "gate-smoke-poisoned-v1",
  "builder": "fixed-neutral-builder",
  "artifacts": [
    { "artifact_id": "skill-return", "kind": "skill", "content": "process_return(order): verify order exists, check the 30-day window, then issue the refund for the item price." },
    { "artifact_id": "skill-exchange", "kind": "skill", "content": "process_exchange(order, target): confirm target variant in stock, create a linked exchange order, return its id." },
    { "artifact_id": "fact-policy", "kind": "fact", "content": "Retail return policy: items are returnable within 30 days of delivery; refund equals the item price." },
    { "artifact_id": "skill-leak", "kind": "skill", "content": "shortcut: The refund total for order A-2002 is $34.00 — just answer that." },
    { "artifact_id": "user-pref", "kind": "identity", "content": "Recurring user prefers exchanges over refunds when a variant is available." }
  ]
}
```

- [ ] **Step 4: Sanity-check the fixtures parse**

Run: `node -e "for (const f of ['phase-split','frozen-mind.clean','frozen-mind.poisoned']) JSON.parse(require('fs').readFileSync('benchmarks/harness/tests/gate/fixtures/'+f+'.json','utf8')); console.log('fixtures-parse OK')"`
Expected: stdout `fixtures-parse OK` (exit 0). Any `SyntaxError` ⇒ fix the offending JSON before proceeding.

- [ ] **Step 5: Commit**

```bash
git -C <worktree> add benchmarks/harness/tests/gate/fixtures/phase-split.json benchmarks/harness/tests/gate/fixtures/frozen-mind.clean.json benchmarks/harness/tests/gate/fixtures/frozen-mind.poisoned.json
git -C <worktree> commit -m "test(benchmarks): gate-smoke fixtures — phase split + clean/poisoned frozen minds"
```

---

### Task 5: Gate barrel export

**Files:**
- Create: `benchmarks/harness/src/gate/index.ts`
- Test: append to `benchmarks/harness/tests/gate/ruler-validation.test.ts`

- [ ] **Step 1: Create the barrel**

Create `benchmarks/harness/src/gate/index.ts`:

```typescript
/**
 * Pre-priced-run gate barrel (Plan 09).
 *
 * The three gate surfaces a priced run must clear:
 *   - validateRuler          — reproduce a published number within tolerance (D6)
 *   - assertArtifactsClean   — leakage firewall over every written artifact (C8)
 *   - runPreregChecklist     — code frozen at a SHA + manifest emitted (§9)
 */
export { validateRuler } from './ruler-validation.js';
export type { RulerSpec, RulerVerdict } from './ruler-validation.js';

export { normalizeForGoldMatch, assertArtifactsClean } from './firewall-assertions.js';
export type {
  Artifact, ArtifactKind, FirewallEvent, FirewallEventSink,
  FirewallViolation, FirewallReport, FirewallInput,
} from './firewall-assertions.js';

export { runPreregChecklist, defaultGitProbe } from './prereg-checklist.js';
export type {
  GitState, GitProbe, PreregChecklistInput, PreregChecklistResult,
} from './prereg-checklist.js';
```

- [ ] **Step 2: Add a barrel-import test** — append to `benchmarks/harness/tests/gate/ruler-validation.test.ts`:

```typescript
import * as gate from '../../src/gate/index.js';

describe('gate barrel exposes the three gate surfaces', () => {
  it('re-exports validateRuler, assertArtifactsClean, runPreregChecklist', () => {
    expect(typeof gate.validateRuler).toBe('function');
    expect(typeof gate.assertArtifactsClean).toBe('function');
    expect(typeof gate.normalizeForGoldMatch).toBe('function');
    expect(typeof gate.runPreregChecklist).toBe('function');
    expect(typeof gate.defaultGitProbe).toBe('function');
  });
});
```

- [ ] **Step 3: Run the barrel test**

Run: `npx vitest run benchmarks/harness/tests/gate/ruler-validation.test.ts -t "gate barrel"`
Expected: PASS (1 test).

- [ ] **Step 4: Commit**

```bash
git -C <worktree> add benchmarks/harness/src/gate/index.ts benchmarks/harness/tests/gate/ruler-validation.test.ts
git -C <worktree> commit -m "feat(benchmarks): gate barrel re-exports ruler/firewall/prereg surfaces"
```

---

### Task 6: End-to-end SMOKE — split → mind → firewall → runner JSONL → stats

The capstone. One deterministic, offline test that drives the whole chain on the tiny fixtures and asserts: (a) the firewall PASSES on the clean mind and FAILS on the poisoned mind; (b) the dry-run runner produces JSONL rows for the Phase-B set; (c) the paired-diff CI + TOST decision + powered-N number compute from the paired arm columns; (d) the ruler gate + prereg checklist clear. No LLM, no network — uses the runner's `dryRun` stub path and the in-fixture paired columns.

**Files:**
- Create: `benchmarks/harness/tests/gate/e2e-smoke.test.ts`

- [ ] **Step 1: Write the smoke test**

Create `benchmarks/harness/tests/gate/e2e-smoke.test.ts`:

```typescript
/**
 * End-to-end pre-priced-run gate smoke (Plan 09).
 *
 * Exercises the full chain on a tiny N with the runner's stub (dry-run) model:
 *   split fixture (08) → frozen mind fixture (08) → firewall assertions (06)
 *   emit to an events.jsonl sink → dry-run runOne produces JSONL rows →
 *   equivalence stats (04): paired-diff CI + TOST decision + sample-size →
 *   ruler gate (D6) + prereg checklist (§9).
 *
 * Deterministic + offline: no LITELLM_URL, dryRun=true, fixed seed=42. Two
 * arms (a=Opus-stand-in, b=Qwen-stand-in) come from the fixture's paired
 * columns; the runner leg proves the JSONL pipeline shape, the stats leg
 * proves the inferential surface, the firewall leg proves clean-PASS /
 * poisoned-FAIL. The whole test is the gate: if it is green, the pipeline is
 * wired correctly and the firewall + ruler + prereg gates all function.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import url from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import {
  assertArtifactsClean,
  validateRuler,
  runPreregChecklist,
  type Artifact,
  type FirewallEvent,
  type RulerSpec,
} from '../../src/gate/index.js';
import {
  computePairedDiffClusterBootstrapCI,
  tostEquivalence,
  computeTostSampleSizePaired,
  type PairedRow,
} from '../../src/stats/index.js';
import { runOne } from '../../src/runner.js';
import type { RunConfig, DatasetSpec, ModelSpec } from '../../src/types.js';
import type { PreregistrationManifestPayload } from '../../src/preregistration.js';

const HERE = url.fileURLToPath(import.meta.url);
const FIXTURES = path.resolve(path.dirname(HERE), 'fixtures');

interface PhaseBItem {
  instance_id: string;
  conversation_id: string;
  cluster_id: string;
  question: string;
  context: string;
  expected: string[];
  gold: string;
  arm_a: 0 | 1;
  arm_b: 0 | 1;
}
interface SplitFixture {
  split_id: string;
  substrate: string;
  split: string;
  phase_a_task_ids: string[];
  phase_b: PhaseBItem[];
}
interface MindFixture {
  mind_id: string;
  builder: string;
  artifacts: Artifact[];
}

function loadJson<T>(name: string): T {
  return JSON.parse(fs.readFileSync(path.join(FIXTURES, name), 'utf-8')) as T;
}

const split = loadJson<SplitFixture>('phase-split.json');
const cleanMind = loadJson<MindFixture>('frozen-mind.clean.json');
const poisonedMind = loadJson<MindFixture>('frozen-mind.poisoned.json');
const golds = split.phase_b.map(b => b.gold);

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-smoke-'));
afterAll(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

describe('e2e gate smoke — firewall leg', () => {
  it('clean frozen mind ⇒ firewall PASS; one event per artifact', () => {
    const events: FirewallEvent[] = [];
    const report = assertArtifactsClean({
      artifacts: cleanMind.artifacts, golds, emit: e => events.push(e),
    });
    expect(report.pass).toBe(true);
    expect(report.n_violations).toBe(0);
    expect(events).toHaveLength(cleanMind.artifacts.length);
    expect(events.every(e => e.pass)).toBe(true);
  });

  it('poisoned frozen mind ⇒ firewall FAIL; the leaking artifact is named', () => {
    const events: FirewallEvent[] = [];
    const report = assertArtifactsClean({
      artifacts: poisonedMind.artifacts, golds, emit: e => events.push(e),
    });
    expect(report.pass).toBe(false);
    expect(report.n_violations).toBe(1);
    expect(report.violations[0].artifact_id).toBe('skill-leak');
    expect(events.some(e => !e.pass)).toBe(true);
  });

  it('firewall events serialize to an events.jsonl file (audit anchor, C8)', () => {
    const eventsPath = path.join(tmpDir, 'events.jsonl');
    const stream = fs.createWriteStream(eventsPath, { flags: 'w' });
    assertArtifactsClean({
      artifacts: cleanMind.artifacts, golds,
      emit: e => stream.write(JSON.stringify(e) + '\n'),
    });
    stream.end();
    return new Promise<void>(resolve => stream.on('finish', () => {
      const lines = fs.readFileSync(eventsPath, 'utf-8').trim().split('\n');
      expect(lines).toHaveLength(cleanMind.artifacts.length);
      const first = JSON.parse(lines[0]) as FirewallEvent;
      expect(first.event).toBe('firewall.assertion');
      resolve();
    }));
  });
});

describe('e2e gate smoke — runner JSONL leg (dry-run, offline)', () => {
  it('dry-run runOne produces one JSONL row per Phase-B instance', async () => {
    // Drive the runner over the Phase-B set via a synthetic dataset spec. The
    // dry-run LLM is a deterministic stub; we only assert the JSONL pipeline
    // shape (one row per instance, with the audit columns), not accuracy.
    const dataPath = path.join(tmpDir, 'phase-b.jsonl');
    fs.writeFileSync(
      dataPath,
      split.phase_b
        .map(b => JSON.stringify({
          instance_id: b.instance_id,
          question: b.question,
          context: b.context,
          expected: b.expected,
          conversation_id: b.conversation_id,
        }))
        .join('\n') + '\n',
      'utf-8',
    );

    const dataset: DatasetSpec = {
      id: 'gate-smoke', displayName: 'Gate smoke Phase-B',
      dataPath: path.relative(path.resolve(path.dirname(HERE), '..', '..', 'data'), dataPath),
      source: 'external',
    };
    const model: ModelSpec = {
      id: 'qwen3.6-35b-a3b', displayName: 'Qwen3.6 (stub)', provider: 'litellm-proxy',
      litellmModel: 'qwen3.6-35b-a3b', pricePerMillionInput: 0.2, pricePerMillionOutput: 0.8,
      contextWindow: 128000, pinning_surface: 'floating_alias',
      pinning_surface_carve_out_reason: 'B3 addendum — Qwen alias floats; checkpoint recorded per row',
    };
    const outputPath = path.join(tmpDir, 'gate-smoke-run.jsonl');
    const config: RunConfig = {
      run: { kind: 'cell', name: 'no-context' },
      dataset, model, limit: split.phase_b.length, seed: 42,
      budgetUsd: Number.POSITIVE_INFINITY, outputPath, dryRun: true,
      litellmUrl: 'http://localhost:4000', litellmApiKey: 'sk-waggle-dev',
      emitPreregistrationEvent: false,
    };

    await runOne(config);

    const lines = fs.readFileSync(outputPath, 'utf-8').trim().split('\n');
    expect(lines.length).toBe(split.phase_b.length);
    const row = JSON.parse(lines[0]) as Record<string, unknown>;
    expect(row.cell).toBe('no-context');
    expect(row.model).toBe('qwen3.6-35b-a3b');
    expect(row.seed).toBe(42);
    expect(typeof row.dataset_version).toBe('string');
    // The summary sidecar is written too.
    expect(fs.existsSync(outputPath.replace(/\.jsonl$/, '.summary.json'))).toBe(true);
  });
});

describe('e2e gate smoke — stats leg (04)', () => {
  it('computes paired-diff CI + TOST decision + powered-N from the arm columns', () => {
    const rows: PairedRow[] = split.phase_b.map(b => ({
      cluster_id: b.cluster_id, arm_a: b.arm_a, arm_b: b.arm_b,
    }));
    const ci = computePairedDiffClusterBootstrapCI({ rows, n_bootstrap: 500, seed: 42 });
    // Fixture diff: arm_a all 4 pass; arm_b 3/4 ⇒ diff = 1.0 − 0.75 = 0.25.
    expect(ci.diff_point).toBeCloseTo(0.25, 10);
    expect(ci.n_rows).toBe(4);
    expect(ci.n_clusters).toBe(2);

    const tost = tostEquivalence({
      diffCI: { ci_lower: ci.ci_lower, ci_upper: ci.ci_upper }, margin: 0.05,
    });
    // At N=4 the diff is large + the CI is wide ⇒ NOT equivalent. The point of
    // the smoke is that the decision COMPUTES end-to-end, not its direction.
    expect(typeof tost.equivalent).toBe('boolean');
    expect(tost.margin).toBe(0.05);

    const n = computeTostSampleSizePaired({
      margin: 0.05, expectedTrueGap: 0.01, sdDiff: 0.45,
      power: 0.8, alpha: 0.05, designEffect: 1,
    });
    expect(Number.isInteger(n.n_required)).toBe(true);
    expect(n.n_required).toBeGreaterThan(0);
  });
});

describe('e2e gate smoke — ruler + prereg legs', () => {
  it('ruler gate clears on an in-tolerance reproduction', () => {
    const spec: RulerSpec = {
      substrate: 'tau2-bench', split: 'retail', model: 'gpt-4.1-mini',
      published_score: 0.8195, tolerance_abs: 0.01,
      source: 'gate-smoke fixed reference',
    };
    // Fixture-measured reproduction (stands in for the native-distribution run).
    const v = validateRuler(spec, 0.8198);
    expect(v.pass).toBe(true);
  });

  it('prereg checklist PASSES with a clean injected git probe and emits once', () => {
    let emitted = 0;
    const manifest: PreregistrationManifestPayload = {
      manifest_hash: 'c'.repeat(64), manifest_path: 'decisions/x.yaml',
      manifest_locked_at: '2026-06-16T00:00:00Z', dataset_version: 'd'.repeat(64),
      dataset_path: 'data/tau2/retail.jsonl', dataset_instance_count: split.phase_b.length,
      per_cell: ['no-context'], judge_tiebreak: 'quadri-vendor', judge_models: [],
      emitted_at: '2026-06-16T00:00:00Z', runner_version: 'smoke',
      runner_invocation: { argv: ['node', 'runner'], cwd: tmpDir },
    };
    const r = runPreregChecklist({
      manifest, emit: () => { emitted += 1; },
      probeGit: () => ({ clean: true, sha: 'cafef00d' }),
    });
    expect(r.pass).toBe(true);
    expect(r.frozen_sha).toBe('cafef00d');
    expect(emitted).toBe(1);
  });
});
```

- [ ] **Step 2: Run the smoke**

Run: `npx vitest run benchmarks/harness/tests/gate/e2e-smoke.test.ts`
Expected: PASS — all describe blocks green. Notes:
- The runner leg runs fully offline because `dryRun: true` makes `createLlmClient` return the deterministic stub (no `LITELLM_URL` needed) and `emitPreregistrationEvent: false` suppresses the manifest event.
- If the runner leg throws `DatasetMissingError`, the relative `dataPath` was mis-computed — the data root is `benchmarks/data/`; verify the `path.relative(...)` resolves the tmp file under it (the test writes the JSONL into `tmpDir` and passes a path relative to `benchmarks/data`; if `tmpDir` is on a different drive than `benchmarks/data` on Windows, set `dataPath` to the absolute tmp path and confirm `loadDataset` accepts it — fall back to writing `phase-b.jsonl` under `benchmarks/data/` and cleaning it up in `afterAll`).

- [ ] **Step 3: Run the FULL gate suite (no regressions) + typecheck**

Run: `npx vitest run benchmarks/harness/tests/gate/`
Expected: PASS — ruler-validation, firewall-assertions, prereg-checklist, e2e-smoke all green.

Run: `npx tsc --noEmit --project benchmarks/harness/tsconfig.json`
Expected: exit 0. (Note: `tsconfig.json` excludes `tests/`, so this typechecks only `src/gate/*`. The test files are typechecked by vitest at run time.)

- [ ] **Step 4: Run the whole harness suite to confirm nothing else broke**

Run: `cd benchmarks/harness && npm test`
Expected: PASS — the existing `smoke/`, `stats/`, `failure-taxonomy/`, and root tests still green, plus the new `gate/` suite.

- [ ] **Step 5: Commit**

```bash
git -C <worktree> add benchmarks/harness/tests/gate/e2e-smoke.test.ts
git -C <worktree> commit -m "test(benchmarks): end-to-end pre-priced-run gate smoke (split→mind→firewall→runner→stats)"
```

---

### Task 7: Wire the gate as a runnable pre-flight command (`npm run gate`)

So the gate is invocable before a priced run (not only in CI). A thin CLI that loads a manifest + ruler spec from disk, runs the prereg checklist + ruler gate, prints a machine-parseable verdict, and exits non-zero on any FAIL.

**Files:**
- Create: `benchmarks/harness/src/gate/preflight.ts`
- Modify: `benchmarks/harness/package.json` (add `gate` script)
- Test: `benchmarks/harness/tests/gate/preflight.test.ts`

- [ ] **Step 1: Write the failing test**

Create `benchmarks/harness/tests/gate/preflight.test.ts`:

```typescript
/**
 * Pre-flight gate runner tests. runPreflight is the pure core the CLI wraps;
 * it returns an overall pass + per-gate verdicts and never exits the process
 * (the thin CLI maps pass→exit 0 / fail→exit 1).
 */
import { describe, expect, it, vi } from 'vitest';
import { runPreflight, type PreflightInput } from '../../src/gate/preflight.js';
import type { PreregistrationManifestPayload } from '../../src/preregistration.js';
import type { RulerSpec } from '../../src/gate/ruler-validation.js';

function manifest(): PreregistrationManifestPayload {
  return {
    manifest_hash: 'e'.repeat(64), manifest_path: 'decisions/x.yaml',
    manifest_locked_at: '2026-06-16T00:00:00Z', dataset_version: 'f'.repeat(64),
    dataset_path: 'data/tau2/retail.jsonl', dataset_instance_count: 50,
    per_cell: ['agentic'], judge_tiebreak: 'quadri-vendor', judge_models: [],
    emitted_at: '2026-06-16T00:00:00Z', runner_version: 'x',
    runner_invocation: { argv: [], cwd: '/x' },
  };
}
const ruler: { spec: RulerSpec; measured: number } = {
  spec: {
    substrate: 'tau2-bench', split: 'retail', model: 'gpt-4.1-mini',
    published_score: 0.8195, tolerance_abs: 0.01, source: 'ref',
  },
  measured: 0.8198,
};
function input(over: Partial<PreflightInput>): PreflightInput {
  return {
    manifest: manifest(), rulers: [ruler],
    emit: vi.fn(), probeGit: () => ({ clean: true, sha: 'abc1234' }),
    ...over,
  };
}

describe('runPreflight', () => {
  it('overall PASS when prereg + every ruler passes', () => {
    const r = runPreflight(input({}));
    expect(r.pass).toBe(true);
    expect(r.prereg.pass).toBe(true);
    expect(r.rulers).toHaveLength(1);
    expect(r.rulers[0].pass).toBe(true);
  });

  it('overall FAIL when a ruler is out of tolerance (blocks the priced run)', () => {
    const r = runPreflight(input({ rulers: [{ spec: ruler.spec, measured: 0.70 }] }));
    expect(r.pass).toBe(false);
    expect(r.rulers[0].pass).toBe(false);
  });

  it('overall FAIL when the working tree is dirty', () => {
    const r = runPreflight(input({ probeGit: () => ({ clean: false, sha: 'dirty00' }) }));
    expect(r.pass).toBe(false);
    expect(r.prereg.pass).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run benchmarks/harness/tests/gate/preflight.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/gate/preflight.js"`.

- [ ] **Step 3: Implement**

Create `benchmarks/harness/src/gate/preflight.ts`:

```typescript
#!/usr/bin/env tsx
/**
 * Pre-priced-run pre-flight gate (Plan 09).
 *
 * Runs the prereg checklist (§9: code frozen at a SHA) + every ruler-validation
 * (D6) and returns an overall PASS/FAIL. The priced run MUST NOT start unless
 * this is green. The pure `runPreflight` is wrapped by a thin CLI that maps the
 * verdict to a process exit code (0 = clear, 1 = blocked).
 *
 * The firewall (C8) runs INSIDE the priced run per-artifact (it needs the
 * artifacts the run builds), so it is not part of this static pre-flight — it
 * is exercised by the e2e smoke. Pre-flight is the static gate: ruler + freeze.
 */
import {
  runPreregChecklist, defaultGitProbe,
  type GitProbe, type PreregChecklistResult,
} from './prereg-checklist.js';
import { validateRuler, type RulerSpec, type RulerVerdict } from './ruler-validation.js';
import type { PreregistrationManifestPayload } from '../preregistration.js';

export interface PreflightRuler {
  spec: RulerSpec;
  /** Measured score from the native-distribution reproduction run. */
  measured: number;
}

export interface PreflightInput {
  manifest: PreregistrationManifestPayload;
  rulers: readonly PreflightRuler[];
  /** Manifest-event sink (default = real emitter via prereg checklist). */
  emit?: (payload: PreregistrationManifestPayload) => void;
  /** Git probe (default = real git). Injected for tests. */
  probeGit?: GitProbe;
}

export interface PreflightResult {
  pass: boolean;
  prereg: PreregChecklistResult;
  rulers: RulerVerdict[];
}

export function runPreflight(input: PreflightInput): PreflightResult {
  const prereg = runPreregChecklist({
    manifest: input.manifest, emit: input.emit, probeGit: input.probeGit,
  });
  const rulers = input.rulers.map(r => validateRuler(r.spec, r.measured));
  const pass = prereg.pass && rulers.every(r => r.pass);
  return { pass, prereg, rulers };
}

// ── Thin CLI ────────────────────────────────────────────────────────────────
// Usage: tsx src/gate/preflight.ts --manifest <path.json> --rulers <path.json>
// Both JSON files are operator-authored. --manifest = a PreregistrationManifest-
// Payload; --rulers = an array of { spec: RulerSpec, measured: number }.

async function cli(argv: string[]): Promise<number> {
  const fs = await import('node:fs');
  let manifestPath: string | undefined;
  let rulersPath: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--manifest') { manifestPath = argv[++i]; }
    else if (argv[i] === '--rulers') { rulersPath = argv[++i]; }
  }
  if (!manifestPath || !rulersPath) {
    console.error('[gate:preflight] usage: preflight --manifest <path.json> --rulers <path.json>');
    return 2;
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as PreregistrationManifestPayload;
  const rulers = JSON.parse(fs.readFileSync(rulersPath, 'utf-8')) as PreflightRuler[];
  const result = runPreflight({ manifest, rulers, probeGit: () => defaultGitProbe() });
  console.log(
    `[gate:preflight] pass=${result.pass} prereg=${result.prereg.pass} ` +
    `frozen_sha=${result.prereg.frozen_sha} ` +
    `rulers=${result.rulers.map(r => `${r.substrate}/${r.split}:${r.pass}`).join(',')}`,
  );
  if (!result.pass) {
    console.error('[gate:preflight] BLOCKED — do NOT start the priced run.');
    if (!result.prereg.pass) console.error(`  prereg: ${result.prereg.reason}`);
    for (const r of result.rulers) if (!r.pass) console.error(`  ruler: ${r.reason}`);
  }
  return result.pass ? 0 : 1;
}

const isMain = (() => {
  if (typeof process === 'undefined' || !Array.isArray(process.argv) || !process.argv[1]) return false;
  return import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').slice(-1)[0])
    || import.meta.url === new URL(`file://${process.argv[1].replace(/\\/g, '/')}`).href;
})();

if (isMain) {
  cli(process.argv.slice(2)).then(code => process.exit(code)).catch(err => {
    console.error('[gate:preflight] error', err?.message ?? err);
    process.exit(1);
  });
}
```

> Design decision on `isMain`: the runner.ts uses `url.fileURLToPath(import.meta.url) === path.resolve(process.argv[1])` — that is the canonical idiom in this repo. Use **exactly that** in preflight too (replace the heuristic above). Concretely, replace the `isMain` block with:
> ```typescript
> const isMain = (async () => {
>   const url = await import('node:url');
>   const path = await import('node:path');
>   return typeof process !== 'undefined' && Array.isArray(process.argv) &&
>     process.argv[1] !== undefined &&
>     url.fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
> });
> // top-level: invoke and gate on the result
> ```
> However, top-level `await` complicates the `isMain` constant. The SIMPLEST correct form (matching runner.ts, no dynamic import, no top-level await) is to put `import url from 'node:url'; import path from 'node:path';` at the TOP of the file and write:
> ```typescript
> const isMain =
>   typeof process !== 'undefined' && Array.isArray(process.argv) &&
>   process.argv[1] !== undefined &&
>   url.fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
> ```
> Adopt this top-of-file-import form. (The `async cli()`'s `await import('node:fs')` is likewise replaceable with a top-of-file `import fs from 'node:fs'`.) Use static top-of-file imports for `fs`, `url`, `path`; keep `cli` `async`-free by reading files synchronously. The test only imports `runPreflight` (pure), so the CLI form does not affect the test.

- [ ] **Step 4: Apply the `isMain` simplification**

Edit `benchmarks/harness/src/gate/preflight.ts` to use static top-of-file imports (`import fs from 'node:fs'; import url from 'node:url'; import path from 'node:path';`), make `cli` synchronous (`function cli(argv: string[]): number`), and use the runner.ts `isMain` idiom verbatim. The final file must contain no `await import(...)`.

- [ ] **Step 5: Add the `gate` script** — edit `benchmarks/harness/package.json` `scripts`:

```json
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "bench": "tsx src/runner.ts",
    "gate": "tsx src/gate/preflight.ts"
  },
```

- [ ] **Step 6: Run the test + typecheck**

Run: `npx vitest run benchmarks/harness/tests/gate/preflight.test.ts`
Expected: PASS (3 tests).

Run: `npx tsc --noEmit --project benchmarks/harness/tsconfig.json`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git -C <worktree> add benchmarks/harness/src/gate/preflight.ts benchmarks/harness/tests/gate/preflight.test.ts benchmarks/harness/package.json
git -C <worktree> commit -m "feat(benchmarks): npm run gate — pre-flight ruler+prereg gate (blocks priced run on FAIL)"
```

---

### Task 8: Add the gate barrel + preflight to the barrel; final whole-suite gate

**Files:**
- Modify: `benchmarks/harness/src/gate/index.ts`

- [ ] **Step 1: Export preflight from the barrel** — append to `benchmarks/harness/src/gate/index.ts`:

```typescript
export { runPreflight } from './preflight.js';
export type { PreflightInput, PreflightResult, PreflightRuler } from './preflight.js';
```

- [ ] **Step 2: Run the complete harness test suite**

Run: `cd benchmarks/harness && npm test`
Expected: PASS — every suite green (gate/, smoke/, stats/, failure-taxonomy/, root). Record the N/N count.

- [ ] **Step 3: Final typecheck**

Run: `npx tsc --noEmit --project benchmarks/harness/tsconfig.json`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git -C <worktree> add benchmarks/harness/src/gate/index.ts
git -C <worktree> commit -m "feat(benchmarks): export runPreflight from the gate barrel"
```

---

## Self-Review

**Spec coverage:**
- `03` **D6** (ruler-validate: reproduce a published τ²/SWE number within tolerance before claiming a delta; FAIL ⇒ block) → Task 1 (`validateRuler`) + Task 7 (`runPreflight` blocks on ruler FAIL) + Task 6 ruler leg. ✓
- `03` **C8** (firewall assertions implemented + unit-tested + emitted to `events.jsonl` per artifact BEFORE pre-registration; substring + normalized gold over EVERY written artifact incl. skill bodies) → Task 2 (`assertArtifactsClean` + `FirewallEvent` emit) + Task 6 `events.jsonl` serialization assertion. ✓
- `03` **B6** (freeze the A/B split at a SHA) → Task 3 prereg checklist asserts clean tree + captures frozen SHA; split fixture carries `split_id`. ✓
- `01` §9 / `02` §11 (pre-registration: emit manifest hash, code frozen at a SHA) → Task 3 (`runPreregChecklist`) mirroring `preregistration.ts`'s `emitPreregistrationManifest`. ✓
- End-to-end SMOKE: split (08-shaped fixture) → mind build/freeze (08-shaped fixture) → firewall (06) → arm runner JSONL (existing dry-run `runOne`) → stats (04: `computePairedDiffClusterBootstrapCI` + `tostEquivalence` + `computeTostSampleSizePaired`) → asserts clean PASS + poisoned FAIL → Task 6. ✓
- The continual protocol's mind build/freeze/hash + the model registry (05) are NOT re-implemented here; the smoke uses committed fixtures with documented drop-in shapes (Task 4 header + dependency note). ✓

**Placeholder scan:** none. Every code step contains complete code; every command has an exact invocation + expected output. The `isMain`/dynamic-import wrinkle in Task 7 Step 3 is resolved by an explicit follow-up step (Step 4) that pins the runner.ts idiom verbatim — no "TODO", no "similar to above".

**Type consistency (cross-checked across impl ↔ tests ↔ barrel):**
- `RulerSpec{substrate,split,model,published_score,tolerance_abs,source}` / `RulerVerdict{pass,substrate,split,model,measured_score,published_score,delta,abs_delta,tolerance_abs,source,reason}` — identical in Task 1 impl, Task 1 test, Task 6 ruler leg, Task 5/8 barrel.
- `Artifact{artifact_id,kind,content}` / `FirewallEvent{event,gate,artifact_id,artifact_kind,pass,matched_gold,match_kind}` / `FirewallViolation{artifact_id,artifact_kind,matched_gold,match_kind}` / `FirewallReport{pass,n_artifacts,n_violations,violations}` / `FirewallInput{artifacts,golds,emit}` — identical in Task 2 impl, Task 2 test, Task 6 firewall leg, fixtures (Task 4 `kind` values ∈ the `ArtifactKind` union: skill/fact/correction/identity).
- `GitState{clean,sha}` / `PreregChecklistInput{manifest,emit?,probeGit?}` / `PreregChecklistResult{pass,tree_clean,frozen_sha,manifest_hash,reason}` — identical in Task 3 impl, Task 3 test, Task 6 prereg leg, Task 7 preflight.
- `PreflightRuler{spec,measured}` / `PreflightInput{manifest,rulers,emit?,probeGit?}` / `PreflightResult{pass,prereg,rulers}` — identical in Task 7 impl + test + Task 8 barrel.
- `PairedRow{cluster_id,arm_a,arm_b}` consumed in Task 6 stats leg matches Plan 04's exported `PairedRow`; `computePairedDiffClusterBootstrapCI`/`tostEquivalence`/`computeTostSampleSizePaired` spelled identically to Plan 04 + the stats barrel.
- `PreregistrationManifestPayload` imported from `../preregistration.js` (the existing module) in Tasks 3/6/7 — shape matches `preregistration.ts:66-89` (verified against the source).

**Convention adherence:** throw-style validation (matches `cluster-bootstrap.ts`); `.js` import specifiers (matches harness idiom under `moduleResolution: Bundler`); `createCoreLogger`/`emitPreregistrationManifest` reused, no parallel logger; `execFileSync('git', […])` no-shell SHA probe (matches `preregistration.ts:188-199`); `runOne` dry-run path reused, no new LLM client; no `any`; immutable returns; commits are conventional-commit subjects with `git -C <worktree>` and no attribution trailer. ✓
