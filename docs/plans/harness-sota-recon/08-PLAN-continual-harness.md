# Continual-Memory Protocol Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax.

**Goal:** Build the Phase-A/B continual-memory protocol harness — a SHA-frozen mechanical split of a task pool into a Phase-A experience stream and a frozen Phase-B test, a neutral-builder mind build/freeze/hash utility, a memory-ON-vs-OFF arm runner with pass^k, and the goal-vs-structure overlap audit + per-task re-derivability gate — so Hive memory's lift on agentic tasks is *measured* under an enforced firewall, not asserted.

**Architecture:** Five pure-ish TypeScript modules under `benchmarks/harness/src/continual/`, each mirroring the harness idioms verified by reading the repo (Mulberry32 PRNG seeded from input, throw-style validation, `.js` import specifiers, explicit exported types, no `any`, immutable updates, `:memory:` MindDB fixtures with an injected fake embedder). The split builder is fully deterministic + unit-tested with zero substrate dependency. The mind build/freeze/hash utility drives the *production* write path (`@waggle/core` `FrameStore`/`HybridSearch`) over an `:memory:` substrate, snapshots it to a file via better-sqlite3 `db.backup()`, and hashes its `db.serialize()` bytes (reusing Plan 06's `hashMind` once Plan 06 lands; this plan vendors a thin local fallback + a probe test that asserts Plan 06's contract so it never blocks). The arm runner evaluates a Phase-B task against a frozen mind (memory-ON) vs an empty mind (memory-OFF) through the same recall path the production cells use (`HybridSearch.search` → `# Recalled Memories` block), capturing accuracy + tokens/turns/tool-calls + freeze-per-task pass^k. The re-derivability gate runs the OFF arm at a raised budget and excludes (+counts) tasks even unbounded-OFF cannot solve.

**Tech Stack:** TypeScript (ESM, NodeNext/Bundler resolution), vitest, `@waggle/core` (MindDB/FrameStore/HybridSearch/SessionStore/Embedder), `@waggle/agent` (runAgentLoop), `better-sqlite3` (transitively, via `@waggle/core`). No new npm dependencies.

**Spec refs:** `01-DESIGN-SPEC.md` §4.3/§6/§7/§9; `02-CONTINUAL-MEMORY-PROTOCOL.md` §3 (phases + 2 modes), §5 (firewall), §6 (caching defense), §7 (metrics), §8 (pass^k freeze-per-task); `03-REDTEAM-RESOLUTIONS.md` B6 (mechanical SHA-frozen split + difficulty-matched + Phase-B-random arm), B5 (pass^k T>0), C2 (per-task re-derivability gate), C3 (neutral builder + builder-sensitivity), C5/C7 (near-dup gate + negative-control family), D2 (Mode-2 co-primary), D3 (divergence-stress cell), E1/E2 (pinning). Consumes Plan 04 (`benchmarks/harness/src/stats/equivalence-tost.ts`) and Plan 06 (`hashMind` from the firewall module).

---

## File Structure

| File | Responsibility |
|---|---|
| `benchmarks/harness/src/continual/task-pool.ts` (create) | `ContinualTask` type + the task-pool shape every downstream module reads (difficulty + procedure-family + recurring-user + structure-tag + gold). Pure types + validators; no I/O. |
| `benchmarks/harness/src/continual/split-builder.ts` (create) | Deterministic difficulty-stratified Phase-A/B partition over a task pool; emits A/B difficulty distributions, a Phase-B-random subset, a negative-control subset, and a canonical SHA over the split. Mulberry32, throw-style validation. |
| `benchmarks/harness/src/continual/mind-build.ts` (create) | Build a MindDB from Phase-A via the production write path (neutral pinned builder), freeze it read-only to a file (better-sqlite3 `backup`), and hash it. Reuses Plan 06 `hashMind` with a guarded local fallback. Substrate-coupled — tested with an `:memory:` fixture + fake embedder. |
| `benchmarks/harness/src/continual/arm-runner.ts` (create) | Evaluate one Phase-B task with a frozen mind (memory-ON) vs an empty mind (memory-OFF): recall via `HybridSearch.search`, run the answer call, capture accuracy + efficiency + freeze-per-task pass^k. Interface + `:memory:`-fixture unit test. |
| `benchmarks/harness/src/continual/overlap-audit.ts` (create) | Goal-vs-structure overlap audit (max n-gram + embedding cosine of each Phase-B gold vs Phase-A artifacts) + per-task re-derivability gate (raised-budget OFF probe → exclude+count non-re-derivable tasks). Substrate-coupled scoring; pure n-gram core. |
| `benchmarks/harness/src/continual/index.ts` (create) | Barrel re-export of the public continual surface. |
| `benchmarks/harness/tests/continual/*.test.ts` (create) | One test file per module + a Plan-06-contract probe + a Plan-04-contract probe. |

Conventions copied verbatim from the harness (verified by reading `stats/cluster-bootstrap.ts`, `substrate.ts`, `substrate.test.ts`, `cells.ts`, `ingest.ts`): local `mulberry32(seed)` per module; `seed = 42` default; throw-on-invalid-input; `.js` extensions in relative imports; `createSubstrate({ embedder })` + `createFakeEmbedder()` for `:memory:` fixtures; `sessions.ensure(gopId, ...)` before any `createIFrame` (the `memory_frames.gop_id → sessions.gop_id` FK); `db.getDatabase()` to reach the raw better-sqlite3 handle.

---

### Task 1: The task-pool type + validators

**Files:**
- Create: `benchmarks/harness/src/continual/task-pool.ts`
- Test: `benchmarks/harness/tests/continual/task-pool.test.ts`

- [ ] **Step 1: Write the failing test**

Create `benchmarks/harness/tests/continual/task-pool.test.ts`:

```typescript
/**
 * Continual task-pool type + validators.
 *
 * The pool is the single input the whole protocol reads. A task carries:
 *   - a stable id, the task statement (goal) + its gold answer,
 *   - difficulty (raw-model pass-rate proxy in [0,1]) for stratified split,
 *   - procedure_family / recurring_user (the cluster ids — 03 B2),
 *   - structure_tag (which of M1..M4 sub-structure it reuses),
 *   - is_near_dup (positive control flag — C5),
 *   - is_negative_control (LOW structure-overlap; predicts NO lift — C7).
 */
import { describe, expect, it } from 'vitest';
import {
  validateContinualTask,
  validateTaskPool,
  type ContinualTask,
} from '../../src/continual/task-pool.js';

function mkTask(over: Partial<ContinualTask> = {}): ContinualTask {
  return {
    task_id: 't-1',
    goal: 'Process the return for order O-100.',
    gold: 'Return processed; $42 refunded.',
    difficulty: 0.5,
    procedure_family: 'returns',
    recurring_user: null,
    structure_tag: 'M1',
    is_near_dup: false,
    is_negative_control: false,
    ...over,
  };
}

describe('validateContinualTask', () => {
  it('accepts a well-formed task and returns it unchanged (immutable)', () => {
    const t = mkTask();
    const out = validateContinualTask(t);
    expect(out).toEqual(t);
    expect(out).not.toBe(t); // returns a defensive copy, never mutates input
  });

  it('rejects an empty task_id', () => {
    expect(() => validateContinualTask(mkTask({ task_id: '' }))).toThrow(/task_id/);
  });

  it('rejects an empty goal or gold', () => {
    expect(() => validateContinualTask(mkTask({ goal: '' }))).toThrow(/goal/);
    expect(() => validateContinualTask(mkTask({ gold: '   ' }))).toThrow(/gold/);
  });

  it('rejects difficulty outside [0,1]', () => {
    expect(() => validateContinualTask(mkTask({ difficulty: -0.1 }))).toThrow(/difficulty/);
    expect(() => validateContinualTask(mkTask({ difficulty: 1.1 }))).toThrow(/difficulty/);
  });

  it('rejects an unknown structure_tag', () => {
    expect(() =>
      validateContinualTask(mkTask({ structure_tag: 'M9' as unknown as ContinualTask['structure_tag'] })),
    ).toThrow(/structure_tag/);
  });

  it('rejects a task that is both near-dup and negative-control (mutually exclusive)', () => {
    expect(() =>
      validateContinualTask(mkTask({ is_near_dup: true, is_negative_control: true })),
    ).toThrow(/mutually exclusive/);
  });
});

describe('validateTaskPool', () => {
  it('accepts a pool with unique ids', () => {
    const pool = [mkTask({ task_id: 'a' }), mkTask({ task_id: 'b' })];
    expect(validateTaskPool(pool)).toHaveLength(2);
  });

  it('rejects an empty pool', () => {
    expect(() => validateTaskPool([])).toThrow(/non-empty/);
  });

  it('rejects duplicate task_ids', () => {
    const pool = [mkTask({ task_id: 'dup' }), mkTask({ task_id: 'dup' })];
    expect(() => validateTaskPool(pool)).toThrow(/duplicate task_id/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run benchmarks/harness/tests/continual/task-pool.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/continual/task-pool.js"` (module does not exist).

- [ ] **Step 3: Write the minimal implementation**

Create `benchmarks/harness/src/continual/task-pool.ts`:

```typescript
/**
 * Continual-memory protocol — task pool types + validators.
 *
 * A ContinualTask is one unit of the domain task pool the protocol partitions
 * into a Phase-A experience stream and a frozen Phase-B held-out test
 * (02-CONTINUAL-MEMORY-PROTOCOL.md §3.1). Every field downstream modules need
 * is here so the split builder, overlap audit, and arm runner share ONE shape.
 *
 * Design decisions (no placeholders):
 *  - `difficulty` ∈ [0,1] is the raw-model pass-rate proxy used to stratify
 *    the A/B split so the two phases are difficulty-matched (03 B6). It is an
 *    INPUT to this module (measured upstream by a raw-model pilot, Plan 09),
 *    not computed here.
 *  - `procedure_family` and `recurring_user` are the candidate CLUSTER ids the
 *    stats layer (Plan 04) resamples over (03 B2). `recurring_user` is null on
 *    non-M4 tasks.
 *  - `structure_tag` records which transfer mechanism (M1..M4) a task reuses
 *    (02 §2). Negative-control tasks carry the literal 'NONE' tag.
 *  - `is_near_dup` (C5 positive control) and `is_negative_control` (C7) are
 *    mutually exclusive flags; headline tasks have both false.
 */

/** Transfer-mechanism tag (02 §2). 'NONE' = a negative-control task that
 *  reuses NO Phase-A sub-structure (03 C7 — design predicts no lift). */
export type StructureTag = 'M1' | 'M2' | 'M3' | 'M4' | 'NONE';

const STRUCTURE_TAGS: readonly StructureTag[] = ['M1', 'M2', 'M3', 'M4', 'NONE'];

export interface ContinualTask {
  /** Stable id; unique within the pool. */
  task_id: string;
  /** The task statement shown to the agent (the goal). */
  goal: string;
  /** The gold answer / target end-state used for scoring. NEVER enters a mind. */
  gold: string;
  /** Raw-model pass-rate proxy ∈ [0,1] for difficulty-stratified splitting. */
  difficulty: number;
  /** Procedure-family cluster id (03 B2). */
  procedure_family: string;
  /** Recurring-user cluster id for M4 tasks; null otherwise. */
  recurring_user: string | null;
  /** Which transfer mechanism this task reuses (02 §2). */
  structure_tag: StructureTag;
  /** C5 positive-control flag: a deliberate near-dup of a Phase-A task. */
  is_near_dup: boolean;
  /** C7 negative-control flag: LOW structure-overlap; predicts no lift. */
  is_negative_control: boolean;
}

/** Validate one task; returns a defensive shallow copy (never mutates input). */
export function validateContinualTask(task: ContinualTask): ContinualTask {
  if (typeof task.task_id !== 'string' || task.task_id.trim().length === 0) {
    throw new Error('ContinualTask requires a non-empty task_id');
  }
  if (typeof task.goal !== 'string' || task.goal.trim().length === 0) {
    throw new Error(`ContinualTask ${task.task_id} requires a non-empty goal`);
  }
  if (typeof task.gold !== 'string' || task.gold.trim().length === 0) {
    throw new Error(`ContinualTask ${task.task_id} requires a non-empty gold`);
  }
  if (!Number.isFinite(task.difficulty) || task.difficulty < 0 || task.difficulty > 1) {
    throw new Error(
      `ContinualTask ${task.task_id} requires difficulty ∈ [0,1]; got ${task.difficulty}`,
    );
  }
  if (typeof task.procedure_family !== 'string' || task.procedure_family.trim().length === 0) {
    throw new Error(`ContinualTask ${task.task_id} requires a non-empty procedure_family`);
  }
  if (task.recurring_user !== null && (typeof task.recurring_user !== 'string' || task.recurring_user.trim().length === 0)) {
    throw new Error(`ContinualTask ${task.task_id} recurring_user must be null or a non-empty string`);
  }
  if (!STRUCTURE_TAGS.includes(task.structure_tag)) {
    throw new Error(
      `ContinualTask ${task.task_id} structure_tag must be one of ${STRUCTURE_TAGS.join(', ')}; got ${task.structure_tag}`,
    );
  }
  if (typeof task.is_near_dup !== 'boolean' || typeof task.is_negative_control !== 'boolean') {
    throw new Error(`ContinualTask ${task.task_id} is_near_dup and is_negative_control must be booleans`);
  }
  if (task.is_near_dup && task.is_negative_control) {
    throw new Error(
      `ContinualTask ${task.task_id}: is_near_dup and is_negative_control are mutually exclusive`,
    );
  }
  return {
    task_id: task.task_id,
    goal: task.goal,
    gold: task.gold,
    difficulty: task.difficulty,
    procedure_family: task.procedure_family,
    recurring_user: task.recurring_user,
    structure_tag: task.structure_tag,
    is_near_dup: task.is_near_dup,
    is_negative_control: task.is_negative_control,
  };
}

/** Validate a whole pool: non-empty, every task valid, ids unique. Returns
 *  the validated copies. */
export function validateTaskPool(pool: readonly ContinualTask[]): ContinualTask[] {
  if (!Array.isArray(pool) || pool.length === 0) {
    throw new Error('task pool must be a non-empty array');
  }
  const seen = new Set<string>();
  const out: ContinualTask[] = [];
  for (const t of pool) {
    const v = validateContinualTask(t);
    if (seen.has(v.task_id)) {
      throw new Error(`task pool has a duplicate task_id: ${v.task_id}`);
    }
    seen.add(v.task_id);
    out.push(v);
  }
  return out;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run benchmarks/harness/tests/continual/task-pool.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git -C <worktree> add benchmarks/harness/src/continual/task-pool.ts benchmarks/harness/tests/continual/task-pool.test.ts
git -C <worktree> commit -m "feat(benchmarks): continual task-pool type + validators"
```

---

### Task 2: The deterministic difficulty-stratified Phase-A/B split builder

**Files:**
- Create: `benchmarks/harness/src/continual/split-builder.ts`
- Test: `benchmarks/harness/tests/continual/split-builder.test.ts`

> Why (03 B6): the Phase-A/B partition is a difficulty confound + researcher-DOF risk. It MUST be a mechanical rule (difficulty-stratified), SHA-frozen before any run, with A/B difficulty distributions reported to prove they match, PLUS a Phase-B-random arm and (C7) a negative-control subset. The split SHA is what we freeze at pre-registration.

- [ ] **Step 1: Write the failing test**

Create `benchmarks/harness/tests/continual/split-builder.test.ts`:

```typescript
/**
 * Deterministic difficulty-stratified Phase-A/B split.
 *
 * Properties under test:
 *  - determinism (same pool + seed ⇒ identical split + identical SHA),
 *  - the split is a PARTITION (every task in exactly one phase; no loss),
 *  - difficulty is matched across A and B (stratified, not skewed),
 *  - negative-control tasks are routed ENTIRELY to Phase B (they are tested,
 *    never used to build the mind),
 *  - near-dup tasks are routed ENTIRELY to Phase B (positive control set),
 *  - a Phase-B-random subset is emitted (a random draw, NOT reuse-selected),
 *  - the canonical SHA changes iff the split membership changes.
 */
import { describe, expect, it } from 'vitest';
import { buildPhaseSplit, type PhaseSplitInput } from '../../src/continual/split-builder.js';
import { type ContinualTask } from '../../src/continual/task-pool.js';

/** Build a pool of `n` headline tasks across `families` families with
 *  difficulty spread deterministically across [0,1]. */
function pool(n: number, families = 4): ContinualTask[] {
  const out: ContinualTask[] = [];
  for (let i = 0; i < n; i++) {
    out.push({
      task_id: `t-${i}`,
      goal: `goal ${i}`,
      gold: `gold ${i}`,
      difficulty: (i % 10) / 10, // 0.0..0.9 cycling — even difficulty spread
      procedure_family: `fam-${i % families}`,
      recurring_user: i % 3 === 0 ? `user-${i % 5}` : null,
      structure_tag: (['M1', 'M2', 'M3', 'M4'] as const)[i % 4],
      is_near_dup: false,
      is_negative_control: false,
    });
  }
  return out;
}

const baseInput = (tasks: ContinualTask[]): PhaseSplitInput => ({
  pool: tasks,
  testFraction: 0.4,
  phaseBRandomFraction: 0.25,
  seed: 42,
});

describe('buildPhaseSplit — determinism + partition', () => {
  it('is identical on two calls with the same input + seed', () => {
    const tasks = pool(60);
    const a = buildPhaseSplit(baseInput(tasks));
    const b = buildPhaseSplit(baseInput(tasks));
    expect(a.split_sha).toBe(b.split_sha);
    expect(a.phaseA.map(t => t.task_id)).toEqual(b.phaseA.map(t => t.task_id));
    expect(a.phaseB.map(t => t.task_id)).toEqual(b.phaseB.map(t => t.task_id));
    expect(a.phaseBRandom.map(t => t.task_id)).toEqual(b.phaseBRandom.map(t => t.task_id));
  });

  it('partitions the pool with no loss and no overlap', () => {
    const tasks = pool(60);
    const r = buildPhaseSplit(baseInput(tasks));
    const ids = new Set([...r.phaseA, ...r.phaseB].map(t => t.task_id));
    expect(ids.size).toBe(60);
    const aIds = new Set(r.phaseA.map(t => t.task_id));
    for (const t of r.phaseB) expect(aIds.has(t.task_id)).toBe(false);
  });

  it('respects testFraction within a small stratification tolerance', () => {
    const tasks = pool(100);
    const r = buildPhaseSplit(baseInput(tasks));
    // 40% to B; stratified rounding per family keeps it close, not exact.
    expect(r.phaseB.length).toBeGreaterThanOrEqual(35);
    expect(r.phaseB.length).toBeLessThanOrEqual(45);
  });
});

describe('buildPhaseSplit — difficulty matching', () => {
  it('A and B mean difficulty differ by < 0.05 (stratified match — 03 B6)', () => {
    const tasks = pool(120);
    const r = buildPhaseSplit(baseInput(tasks));
    expect(Math.abs(r.difficultyDist.phaseAMean - r.difficultyDist.phaseBMean)).toBeLessThan(0.05);
  });

  it('reports per-decile difficulty histograms for A and B', () => {
    const tasks = pool(120);
    const r = buildPhaseSplit(baseInput(tasks));
    expect(r.difficultyDist.phaseAHistogram).toHaveLength(10);
    expect(r.difficultyDist.phaseBHistogram).toHaveLength(10);
    const sumA = r.difficultyDist.phaseAHistogram.reduce((s, x) => s + x, 0);
    expect(sumA).toBe(r.phaseA.length);
  });
});

describe('buildPhaseSplit — control routing', () => {
  it('routes every negative-control task to Phase B', () => {
    const tasks = pool(40);
    tasks[3] = { ...tasks[3], is_negative_control: true, structure_tag: 'NONE' };
    tasks[7] = { ...tasks[7], is_negative_control: true, structure_tag: 'NONE' };
    const r = buildPhaseSplit(baseInput(tasks));
    const negInA = r.phaseA.filter(t => t.is_negative_control);
    expect(negInA).toHaveLength(0);
    expect(r.negativeControl.map(t => t.task_id).sort()).toEqual(['t-3', 't-7']);
    for (const t of r.negativeControl) {
      expect(r.phaseB.some(b => b.task_id === t.task_id)).toBe(true);
    }
  });

  it('routes every near-dup task to Phase B and surfaces them as the positive control', () => {
    const tasks = pool(40);
    tasks[5] = { ...tasks[5], is_near_dup: true };
    const r = buildPhaseSplit(baseInput(tasks));
    expect(r.phaseA.some(t => t.is_near_dup)).toBe(false);
    expect(r.nearDupControl.map(t => t.task_id)).toEqual(['t-5']);
    expect(r.phaseB.some(b => b.task_id === 't-5')).toBe(true);
  });
});

describe('buildPhaseSplit — Phase-B-random subset', () => {
  it('emits a phaseBRandom subset that is a subset of phaseB', () => {
    const tasks = pool(80);
    const r = buildPhaseSplit(baseInput(tasks));
    const bIds = new Set(r.phaseB.map(t => t.task_id));
    for (const t of r.phaseBRandom) expect(bIds.has(t.task_id)).toBe(true);
    expect(r.phaseBRandom.length).toBeGreaterThan(0);
  });

  it('phaseBRandom size ≈ phaseBRandomFraction × |phaseB|', () => {
    const tasks = pool(80);
    const r = buildPhaseSplit({ ...baseInput(tasks), phaseBRandomFraction: 0.5 });
    const expected = Math.round(0.5 * r.phaseB.length);
    expect(Math.abs(r.phaseBRandom.length - expected)).toBeLessThanOrEqual(1);
  });
});

describe('buildPhaseSplit — SHA sensitivity + validation', () => {
  it('SHA changes when a task moves phases (membership-sensitive)', () => {
    const tasks = pool(60);
    const a = buildPhaseSplit({ ...baseInput(tasks), testFraction: 0.4 });
    const b = buildPhaseSplit({ ...baseInput(tasks), testFraction: 0.6 });
    expect(a.split_sha).not.toBe(b.split_sha);
  });

  it('SHA is a 64-char lowercase hex string', () => {
    const r = buildPhaseSplit(baseInput(pool(30)));
    expect(r.split_sha).toMatch(/^[0-9a-f]{64}$/);
  });

  it('rejects testFraction outside (0,1)', () => {
    expect(() => buildPhaseSplit({ ...baseInput(pool(10)), testFraction: 0 })).toThrow(/testFraction/);
    expect(() => buildPhaseSplit({ ...baseInput(pool(10)), testFraction: 1 })).toThrow(/testFraction/);
  });

  it('rejects a pool with no headline (non-control) tasks left for Phase A', () => {
    const tasks = pool(4).map(t => ({ ...t, is_negative_control: true, structure_tag: 'NONE' as const }));
    expect(() => buildPhaseSplit(baseInput(tasks))).toThrow(/Phase A/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run benchmarks/harness/tests/continual/split-builder.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/continual/split-builder.js"`.

- [ ] **Step 3: Write the minimal implementation**

Create `benchmarks/harness/src/continual/split-builder.ts`:

```typescript
/**
 * Deterministic, difficulty-stratified Phase-A / Phase-B split (03 B6).
 *
 * Mechanical rule (no researcher DOF):
 *  1. Control tasks are routed by flag, not by chance:
 *       - is_negative_control → Phase B only (tested, never builds the mind).
 *       - is_near_dup        → Phase B only (positive control, C5).
 *  2. The remaining HEADLINE tasks are stratified by (procedure_family ×
 *     difficulty-decile). Within each stratum, tasks are deterministically
 *     shuffled (Mulberry32(seed)) and the first `round(testFraction × |stratum|)`
 *     go to Phase B, the rest to Phase A. Stratifying by family AND difficulty
 *     decile is what makes A vs B difficulty-matched.
 *  3. The Phase-B-random subset is a fresh Mulberry32 draw over the FULL
 *     Phase-B set (NOT reuse-selected) so the lift can be shown to survive on
 *     a random test draw (03 B6).
 *  4. The canonical split SHA is SHA-256 over the sorted (phase, task_id)
 *     membership list — it changes iff membership changes, and is frozen at
 *     pre-registration.
 *
 * Determinism: a single Mulberry32 stream seeded with `seed`, consumed in a
 * fixed order (strata sorted by key, then random subset), so the same input +
 * seed yields a byte-identical split + SHA.
 */

import crypto from 'node:crypto';
import { validateTaskPool, type ContinualTask } from './task-pool.js';

export interface PhaseSplitInput {
  pool: readonly ContinualTask[];
  /** Fraction of HEADLINE (non-control) tasks routed to Phase B, per stratum.
   *  Must be in (0,1). */
  testFraction: number;
  /** Fraction of the FULL Phase-B set drawn (at random) into the
   *  Phase-B-random subset. Must be in (0,1]. */
  phaseBRandomFraction: number;
  /** PRNG seed. Default 42. */
  seed?: number;
}

export interface DifficultyDistribution {
  phaseAMean: number;
  phaseBMean: number;
  /** 10 buckets [0,0.1) .. [0.9,1.0]; value = task count in that decile. */
  phaseAHistogram: number[];
  phaseBHistogram: number[];
}

export interface PhaseSplitResult {
  phaseA: ContinualTask[];
  phaseB: ContinualTask[];
  /** A random subset of phaseB (NOT reuse-selected). */
  phaseBRandom: ContinualTask[];
  /** All negative-control tasks (⊆ phaseB). */
  negativeControl: ContinualTask[];
  /** All near-dup positive-control tasks (⊆ phaseB). */
  nearDupControl: ContinualTask[];
  difficultyDist: DifficultyDistribution;
  /** SHA-256 hex over the sorted (phase,task_id) membership. Frozen at pre-reg. */
  split_sha: string;
  seed: number;
  testFraction: number;
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

/** Difficulty decile index 0..9 (1.0 lands in bucket 9). */
function decile(d: number): number {
  return Math.min(9, Math.floor(d * 10));
}

/** Deterministic in-place Fisher-Yates using the supplied RNG. */
function shuffleInPlace<T>(arr: T[], rand: () => number): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
}

function histogram(tasks: readonly ContinualTask[]): number[] {
  const h = new Array<number>(10).fill(0);
  for (const t of tasks) h[decile(t.difficulty)]++;
  return h;
}

function mean(tasks: readonly ContinualTask[]): number {
  if (tasks.length === 0) return 0;
  let s = 0;
  for (const t of tasks) s += t.difficulty;
  return s / tasks.length;
}

export function buildPhaseSplit(input: PhaseSplitInput): PhaseSplitResult {
  const { testFraction, phaseBRandomFraction, seed = 42 } = input;
  if (!Number.isFinite(testFraction) || testFraction <= 0 || testFraction >= 1) {
    throw new Error(`buildPhaseSplit requires testFraction ∈ (0,1); got ${testFraction}`);
  }
  if (!Number.isFinite(phaseBRandomFraction) || phaseBRandomFraction <= 0 || phaseBRandomFraction > 1) {
    throw new Error(`buildPhaseSplit requires phaseBRandomFraction ∈ (0,1]; got ${phaseBRandomFraction}`);
  }
  if (!Number.isFinite(seed) || !Number.isInteger(seed)) {
    throw new Error(`buildPhaseSplit requires an integer seed; got ${seed}`);
  }

  const pool = validateTaskPool(input.pool);
  const rand = mulberry32(seed);

  const negativeControl = pool.filter(t => t.is_negative_control);
  const nearDupControl = pool.filter(t => t.is_near_dup);
  const headline = pool.filter(t => !t.is_negative_control && !t.is_near_dup);

  if (headline.length === 0) {
    throw new Error('buildPhaseSplit: no headline (non-control) tasks left to build Phase A');
  }

  // Strata key = `${procedure_family}#${decile}`. Build in a STABLE sorted
  // key order so the RNG stream is consumed deterministically.
  const strata = new Map<string, ContinualTask[]>();
  for (const t of headline) {
    const key = `${t.procedure_family}#${decile(t.difficulty)}`;
    const bucket = strata.get(key);
    if (bucket) bucket.push(t);
    else strata.set(key, [t]);
  }
  const sortedKeys = Array.from(strata.keys()).sort();

  const phaseA: ContinualTask[] = [];
  const phaseB: ContinualTask[] = [...negativeControl, ...nearDupControl]; // controls are tested
  for (const key of sortedKeys) {
    const bucket = strata.get(key)!.slice();
    shuffleInPlace(bucket, rand);
    const nToB = Math.round(testFraction * bucket.length);
    for (let i = 0; i < bucket.length; i++) {
      if (i < nToB) phaseB.push(bucket[i]);
      else phaseA.push(bucket[i]);
    }
  }

  if (phaseA.length === 0) {
    throw new Error('buildPhaseSplit: Phase A is empty after the split — lower testFraction');
  }

  // Phase-B-random subset: a fresh random draw over the FULL Phase-B set.
  const bShuffled = phaseB.slice();
  shuffleInPlace(bShuffled, rand);
  const nRandom = Math.round(phaseBRandomFraction * phaseB.length);
  const phaseBRandom = bShuffled.slice(0, Math.max(1, nRandom));

  // Canonical, order-insensitive membership SHA.
  const membership = [
    ...phaseA.map(t => `A:${t.task_id}`),
    ...phaseB.map(t => `B:${t.task_id}`),
  ].sort();
  const split_sha = crypto.createHash('sha256').update(membership.join('\n')).digest('hex');

  return {
    phaseA,
    phaseB,
    phaseBRandom,
    negativeControl,
    nearDupControl,
    difficultyDist: {
      phaseAMean: mean(phaseA),
      phaseBMean: mean(phaseB),
      phaseAHistogram: histogram(phaseA),
      phaseBHistogram: histogram(phaseB),
    },
    split_sha,
    seed,
    testFraction,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run benchmarks/harness/tests/continual/split-builder.test.ts`
Expected: PASS (all describe blocks). If the "difficulty matching < 0.05" test fails, that is a real bug in the stratification — debug it before proceeding (do not loosen the threshold).

- [ ] **Step 5: Commit**

```bash
git -C <worktree> add benchmarks/harness/src/continual/split-builder.ts benchmarks/harness/tests/continual/split-builder.test.ts
git -C <worktree> commit -m "feat(benchmarks): deterministic difficulty-stratified Phase-A/B split builder"
```

---

### Task 3: Pin the Plan 06 `hashMind` contract (probe + guarded fallback)

**Files:**
- Create: `benchmarks/harness/src/continual/mind-hash.ts`
- Test: `benchmarks/harness/tests/continual/mind-hash-contract.test.ts`

> Why: this plan CONSUMES Plan 06's `hashMind` (the firewall module). Plan 06 may not have landed when this task runs. To avoid a blank dependency, we pin the EXACT contract here: a deterministic SHA-256 over the mind's serialized bytes. `resolveHashMind()` prefers Plan 06's export when present and otherwise uses a local fallback that satisfies the same contract. A contract probe test asserts the property (same bytes ⇒ same hash; different bytes ⇒ different hash) so a future Plan-06 swap is caught.

- [ ] **Step 1: Write the failing test**

Create `benchmarks/harness/tests/continual/mind-hash-contract.test.ts`:

```typescript
/**
 * Contract probe for the mind-hash dependency (Plan 06 hashMind).
 *
 * The continual harness needs a STABLE content hash of a frozen MindDB so the
 * Mode-1 "byte-identical mind across models" claim is auditable per row
 * (02 §5.4). We pin the contract here and assert it on a real :memory: MindDB
 * via @waggle/core, so a later swap to Plan 06's hashMind cannot silently
 * change the property.
 */
import { describe, expect, it } from 'vitest';
import { MindDB } from '@waggle/core';
import { hashMindBytes, resolveHashMind } from '../../src/continual/mind-hash.js';

function seedMind(db: MindDB, label: string): void {
  const raw = db.getDatabase();
  raw.prepare('CREATE TABLE IF NOT EXISTS probe (k TEXT)').run();
  raw.prepare('INSERT INTO probe (k) VALUES (?)').run(label);
}

describe('hashMindBytes — local fallback contract', () => {
  it('same content ⇒ same hash', () => {
    const a = new MindDB(':memory:');
    const b = new MindDB(':memory:');
    try {
      seedMind(a, 'same');
      seedMind(b, 'same');
      // serialize() omits WAL/rowid-internal jitter for identical logical DBs.
      expect(hashMindBytes(a)).toBe(hashMindBytes(b));
    } finally {
      a.close();
      b.close();
    }
  });

  it('different content ⇒ different hash', () => {
    const a = new MindDB(':memory:');
    const b = new MindDB(':memory:');
    try {
      seedMind(a, 'alpha');
      seedMind(b, 'beta');
      expect(hashMindBytes(a)).not.toBe(hashMindBytes(b));
    } finally {
      a.close();
      b.close();
    }
  });

  it('returns a 64-char lowercase hex string', () => {
    const a = new MindDB(':memory:');
    try {
      seedMind(a, 'x');
      expect(hashMindBytes(a)).toMatch(/^[0-9a-f]{64}$/);
    } finally {
      a.close();
    }
  });
});

describe('resolveHashMind — dependency resolution', () => {
  it('returns a callable that hashes a MindDB', () => {
    const fn = resolveHashMind();
    const a = new MindDB(':memory:');
    try {
      seedMind(a, 'y');
      const h = fn(a);
      expect(typeof h).toBe('string');
      expect(h).toMatch(/^[0-9a-f]{64}$/);
    } finally {
      a.close();
    }
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run benchmarks/harness/tests/continual/mind-hash-contract.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/continual/mind-hash.js"`.

- [ ] **Step 3: Implement**

Create `benchmarks/harness/src/continual/mind-hash.ts`:

```typescript
/**
 * Mind content-hash — the Plan 06 `hashMind` contract, pinned + guarded.
 *
 * Contract (02 §5.4): a deterministic hash of a frozen MindDB such that
 *   - logically-identical minds hash equal, and
 *   - any content difference changes the hash.
 * We implement it over `better-sqlite3`'s `serialize()` (a deterministic
 * byte image of the logical DB — independent of WAL/journal artifacts), which
 * is exactly what an auditor needs to assert "byte-identical mind across
 * Mode-1 arms."
 *
 * `resolveHashMind()` prefers Plan 06's export when the firewall module is on
 * disk; otherwise it returns the local `hashMindBytes`. Both satisfy the same
 * contract (asserted in mind-hash-contract.test.ts), so swapping to Plan 06
 * later is transparent. We resolve via a guarded dynamic require so a missing
 * Plan 06 module never throws at import time.
 */

import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import type { MindDB } from '@waggle/core';

/** Local fallback: SHA-256 of the serialized DB image. */
export function hashMindBytes(mind: MindDB): string {
  const buf = mind.getDatabase().serialize();
  return crypto.createHash('sha256').update(buf).digest('hex');
}

export type HashMindFn = (mind: MindDB) => string;

/**
 * Resolve the hashMind implementation. Plan 06 (firewall.ts) is expected to
 * export `hashMind(mind: MindDB): string`. When that module is absent (Plan 06
 * not yet landed), fall back to `hashMindBytes` — same contract.
 */
export function resolveHashMind(): HashMindFn {
  try {
    const req = createRequire(import.meta.url);
    // Plan 06 lands at benchmarks/harness/src/firewall.ts → ../firewall.js
    const mod = req('../firewall.js') as { hashMind?: HashMindFn };
    if (typeof mod.hashMind === 'function') {
      return mod.hashMind;
    }
  } catch {
    // Plan 06 not present — use the local contract-equivalent fallback.
  }
  return hashMindBytes;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run benchmarks/harness/tests/continual/mind-hash-contract.test.ts`
Expected: PASS (4 tests). If "same content ⇒ same hash" fails, `serialize()` is carrying nondeterministic bytes on your platform — STOP and switch the fallback to a logical-row hash (a `SELECT * FROM memory_frames ORDER BY id` digest) before proceeding; the frozen-mind audit depends on this property.

- [ ] **Step 5: Commit**

```bash
git -C <worktree> add benchmarks/harness/src/continual/mind-hash.ts benchmarks/harness/tests/continual/mind-hash-contract.test.ts
git -C <worktree> commit -m "feat(benchmarks): pin Plan 06 hashMind contract with guarded local fallback"
```

---

### Task 4: Mind build / freeze / hash utility (neutral pinned builder)

**Files:**
- Create: `benchmarks/harness/src/continual/mind-build.ts`
- Test: `benchmarks/harness/tests/continual/mind-build.test.ts`

> Why (02 §11, 03 C3): build the Mode-1 shared mind via the PRODUCTION write path over the Phase-A stream, with a NEUTRAL, deterministic builder (no subject-model prose smuggled in), freeze it read-only to a file, and hash it so every Mode-1 arm reads the same byte-identical mind. The builder banks ONLY agent-earned/re-derivable content keyed by transfer mechanism (M1..M4); gold answers NEVER enter the mind (firewall is Plan 06 — this module exposes the artifacts it banks so Plan 06's assertions can run over them).

- [ ] **Step 1: Write the failing test**

Create `benchmarks/harness/tests/continual/mind-build.test.ts`:

```typescript
/**
 * Mind build / freeze / hash — neutral builder over a Phase-A stream.
 *
 * Substrate-coupled: uses a :memory: MindDB + injected fake embedder (the
 * substrate.test.ts pattern). Asserts:
 *   - Phase-A artifacts (M1..M4) land as frames the production HybridSearch
 *     can recall,
 *   - NO Phase-A or Phase-B gold string is banked (firewall backbone),
 *   - freeze() writes a file + returns a stable hash,
 *   - re-building the same stream + seed yields the same hash (neutral builder
 *     is deterministic → Mode-1 byte-identical claim holds),
 *   - the frozen file re-opens read-only and recalls the banked content.
 */
import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MindDB, HybridSearch, type Embedder } from '@waggle/core';
import { buildAndFreezeMind, type PhaseAArtifact } from '../../src/continual/mind-build.js';

const VEC_DIMS = 1024;

function createFakeEmbedder(dims = VEC_DIMS): Embedder {
  const fnv1a = (s: string): number => {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h || 1;
  };
  const embedOne = (text: string): Float32Array => {
    let state = fnv1a(text);
    const v = new Float32Array(dims);
    for (let i = 0; i < dims; i++) {
      state ^= state << 13; state >>>= 0; state ^= state >>> 17; state ^= state << 5; state >>>= 0;
      v[i] = ((state >>> 0) / 0x100000000) * 2 - 1;
    }
    let mag = 0; for (let i = 0; i < dims; i++) mag += v[i] * v[i]; mag = Math.sqrt(mag);
    if (mag > 0) for (let i = 0; i < dims; i++) v[i] /= mag;
    return v;
  };
  return { dimensions: dims, async embed(t) { return embedOne(t); }, async embedBatch(ts) { return ts.map(embedOne); } };
}

function artifacts(): PhaseAArtifact[] {
  return [
    { task_id: 't-1', mechanism: 'M1', procedure_family: 'returns', recurring_user: null,
      content: 'Skill: process_return(order) — look up order, check 30-day window, issue refund.' },
    { task_id: 't-2', mechanism: 'M2', procedure_family: 'returns', recurring_user: null,
      content: 'Fact: the restocking fee is 10% on opened electronics.' },
    { task_id: 't-3', mechanism: 'M3', procedure_family: 'exchanges', recurring_user: null,
      content: 'Correction: do not refund shipping on buyer-remorse returns; only on defects.' },
    { task_id: 't-4', mechanism: 'M4', procedure_family: 'rebooking', recurring_user: 'user-7',
      content: 'User user-7 prefers aisle seats and morning departures.' },
  ];
}

const tmpFiles: string[] = [];
function tmpPath(): string {
  const p = path.join(os.tmpdir(), `mind-build-${Date.now()}-${Math.random().toString(36).slice(2)}.sqlite`);
  tmpFiles.push(p);
  return p;
}
afterEach(() => {
  for (const f of tmpFiles.splice(0)) {
    for (const suffix of ['', '-wal', '-shm']) { try { fs.unlinkSync(f + suffix); } catch { /* ignore */ } }
  }
});

describe('buildAndFreezeMind', () => {
  it('banks every Phase-A artifact so HybridSearch can recall it', async () => {
    const out = tmpPath();
    const res = await buildAndFreezeMind({
      artifacts: artifacts(), goldStrings: ['Return processed; $42 refunded.'],
      outputPath: out, embedder: createFakeEmbedder(), builderId: 'neutral-deterministic-v1', seed: 42,
    });
    expect(res.frameCount).toBe(4);
    expect(res.mindHash).toMatch(/^[0-9a-f]{64}$/);
    expect(fs.existsSync(out)).toBe(true);

    // Re-open the frozen file and recall.
    const frozen = new MindDB(out);
    try {
      const search = new HybridSearch(frozen, createFakeEmbedder());
      const hits = await search.search('restocking fee', { limit: 5 });
      expect(hits.some(h => h.frame.content.includes('restocking fee'))).toBe(true);
    } finally { frozen.close(); }
  });

  it('NEVER banks a gold string (firewall backbone — 02 §5.2)', async () => {
    const out = tmpPath();
    const arts = artifacts();
    // Inject a poisoned artifact that contains the gold — the builder MUST reject it.
    arts.push({ task_id: 't-x', mechanism: 'M2', procedure_family: 'returns', recurring_user: null,
      content: 'Fact leak: the answer is Return processed; $42 refunded.' });
    await expect(
      buildAndFreezeMind({
        artifacts: arts, goldStrings: ['Return processed; $42 refunded.'],
        outputPath: out, embedder: createFakeEmbedder(), builderId: 'neutral-deterministic-v1', seed: 42,
      }),
    ).rejects.toThrow(/gold/i);
  });

  it('is deterministic: same stream + seed ⇒ same mindHash (Mode-1 byte-identical)', async () => {
    const a = await buildAndFreezeMind({
      artifacts: artifacts(), goldStrings: [], outputPath: tmpPath(),
      embedder: createFakeEmbedder(), builderId: 'neutral-deterministic-v1', seed: 42,
    });
    const b = await buildAndFreezeMind({
      artifacts: artifacts(), goldStrings: [], outputPath: tmpPath(),
      embedder: createFakeEmbedder(), builderId: 'neutral-deterministic-v1', seed: 42,
    });
    expect(a.mindHash).toBe(b.mindHash);
  });

  it('records builder provenance + artifact mechanism counts', async () => {
    const res = await buildAndFreezeMind({
      artifacts: artifacts(), goldStrings: [], outputPath: tmpPath(),
      embedder: createFakeEmbedder(), builderId: 'neutral-deterministic-v1', seed: 42,
    });
    expect(res.builderId).toBe('neutral-deterministic-v1');
    expect(res.mechanismCounts).toEqual({ M1: 1, M2: 1, M3: 1, M4: 1 });
  });

  it('rejects an empty artifact stream', async () => {
    await expect(
      buildAndFreezeMind({
        artifacts: [], goldStrings: [], outputPath: tmpPath(),
        embedder: createFakeEmbedder(), builderId: 'neutral-deterministic-v1', seed: 42,
      }),
    ).rejects.toThrow(/non-empty/);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run benchmarks/harness/tests/continual/mind-build.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/continual/mind-build.js"`.

- [ ] **Step 3: Implement**

Create `benchmarks/harness/src/continual/mind-build.ts`:

```typescript
/**
 * Mode-1 shared-mind builder: run a Phase-A artifact stream through the
 * PRODUCTION write path, freeze the result read-only to a file, and hash it
 * (02 §11; 03 C3).
 *
 * Neutrality (03 C3): the builder is a DETERMINISTIC, non-LLM extraction — it
 * banks the artifacts it is handed verbatim (each tagged with its transfer
 * mechanism M1..M4). No subject-model prose is synthesized here, so the frozen
 * mind is model-neutral by construction and the "byte-identical mind ⇒ the
 * model is the only variable" claim holds. The artifacts themselves are
 * produced upstream (Phase-A run by a NEUTRAL pinned builder; builder-id is
 * recorded). The full firewall (substring + embedding gates over these
 * artifacts) is Plan 06 — this module enforces the substring backbone (02 §5.2)
 * so a gold leak fails the build loudly even before Plan 06 lands.
 *
 * Freeze: frames are written to a :memory: MindDB via FrameStore (the same
 * createIFrame path ingest.ts uses), vector-indexed via HybridSearch, then the
 * logical DB is copied to `outputPath` via better-sqlite3 `db.backup()`. The
 * file is the frozen, read-only-by-convention shared mind. Its hash is the
 * Plan 06 contract hash (mind-hash.ts).
 */

import {
  FrameStore, HybridSearch, MindDB, SessionStore, type Embedder, type Importance,
} from '@waggle/core';
import { resolveHashMind } from './mind-hash.js';

/** A single piece of Phase-A-earned, re-derivable knowledge to bank. */
export interface PhaseAArtifact {
  /** Source task id (provenance). */
  task_id: string;
  /** Transfer mechanism this artifact carries (02 §2). */
  mechanism: 'M1' | 'M2' | 'M3' | 'M4';
  /** Procedure-family cluster id. */
  procedure_family: string;
  /** Recurring-user id for M4 artifacts; null otherwise. */
  recurring_user: string | null;
  /** The text banked into a frame. MUST NOT contain any gold string. */
  content: string;
}

export interface BuildMindInput {
  artifacts: readonly PhaseAArtifact[];
  /** Every Phase-A AND Phase-B gold string — none may appear in any artifact. */
  goldStrings: readonly string[];
  /** Where to freeze the mind. The file is overwritten if present. */
  outputPath: string;
  /** Embedder used for vector indexing (inject a fake in tests). */
  embedder: Embedder;
  /** Provenance id of the neutral builder (recorded per row). */
  builderId: string;
  /** PRNG/order seed (kept for parity + future ordering knobs). Default 42. */
  seed?: number;
}

export interface BuildMindResult {
  mindHash: string;
  outputPath: string;
  frameCount: number;
  builderId: string;
  mechanismCounts: Record<'M1' | 'M2' | 'M3' | 'M4', number>;
}

/** Map a mechanism to a frame importance — durable knowledge banks higher. */
const MECHANISM_IMPORTANCE: Record<PhaseAArtifact['mechanism'], Importance> = {
  M1: 'important',  // skills
  M2: 'important',  // domain facts/policy
  M3: 'normal',     // corrections
  M4: 'normal',     // personalization
};

/** Normalize for substring leak detection: lowercase + collapse whitespace. */
function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

export async function buildAndFreezeMind(input: BuildMindInput): Promise<BuildMindResult> {
  const { artifacts, goldStrings, outputPath, embedder, builderId } = input;
  if (typeof builderId !== 'string' || builderId.trim().length === 0) {
    throw new Error('buildAndFreezeMind requires a non-empty builderId (provenance)');
  }
  if (!Array.isArray(artifacts) || artifacts.length === 0) {
    throw new Error('buildAndFreezeMind requires a non-empty artifacts stream');
  }

  // Firewall backbone (02 §5.2): no gold substring (exact + normalized) in any
  // banked artifact. The richer embedding gate is Plan 06.
  const golds = goldStrings.map(normalize).filter(g => g.length > 0);
  for (const art of artifacts) {
    const norm = normalize(art.content);
    for (const g of golds) {
      if (norm.includes(g)) {
        throw new Error(
          `buildAndFreezeMind: artifact ${art.task_id} contains a gold string — firewall violation`,
        );
      }
    }
  }

  const db = new MindDB(':memory:');
  const frames = new FrameStore(db);
  const sessions = new SessionStore(db);
  const search = new HybridSearch(db, embedder);

  const mechanismCounts: Record<'M1' | 'M2' | 'M3' | 'M4', number> = { M1: 0, M2: 0, M3: 0, M4: 0 };
  const ensured = new Set<string>();
  const toIndex: Array<{ id: number; content: string }> = [];

  try {
    for (const art of artifacts) {
      // gop_id = procedure_family so recall scopes naturally; ensure the FK row.
      const gop = art.procedure_family;
      if (!ensured.has(gop)) {
        sessions.ensure(gop, builderId, `Phase-A family ${gop}`);
        ensured.add(gop);
      }
      const frame = frames.createIFrame(gop, art.content, MECHANISM_IMPORTANCE[art.mechanism], 'agent_inferred');
      toIndex.push({ id: frame.id, content: art.content });
      mechanismCounts[art.mechanism]++;
    }
    await search.indexFramesBatch(toIndex);

    // Freeze: copy the logical DB to outputPath. better-sqlite3 backup() is
    // async and produces a clean single-file image (no WAL sidecar carried).
    for (const suffix of ['', '-wal', '-shm']) {
      try { (await import('node:fs')).unlinkSync(outputPath + suffix); } catch { /* not present */ }
    }
    await db.getDatabase().backup(outputPath);

    const hashMind = resolveHashMind();
    const mindHash = hashMind(db);

    return {
      mindHash,
      outputPath,
      frameCount: toIndex.length,
      builderId,
      mechanismCounts,
    };
  } finally {
    db.close();
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run benchmarks/harness/tests/continual/mind-build.test.ts`
Expected: PASS (5 tests). Requires a real `@waggle/core` build (the substrate tests already depend on it). If `db.getDatabase().backup` is missing at runtime, the installed `better-sqlite3` is too old — STOP and verify `@types/better-sqlite3` `backup()` matches the runtime (it was confirmed present during planning).

- [ ] **Step 5: Commit**

```bash
git -C <worktree> add benchmarks/harness/src/continual/mind-build.ts benchmarks/harness/tests/continual/mind-build.test.ts
git -C <worktree> commit -m "feat(benchmarks): neutral-builder mind build/freeze/hash utility"
```

---

### Task 5: The arm runner (memory-ON vs memory-OFF, with freeze-per-task pass^k)

**Files:**
- Create: `benchmarks/harness/src/continual/arm-runner.ts`
- Test: `benchmarks/harness/tests/continual/arm-runner.test.ts`

> Why (02 §3.3 / §7 / §8; 03 B5): evaluate a Phase-B task with a FROZEN mind (memory-ON) vs an EMPTY mind (memory-OFF) through the SAME recall path the production cells use (`HybridSearch.search` → `# Recalled Memories` block), capturing accuracy + efficiency (tokens/turns/tool-calls) + pass^k. pass^k uses k INDEPENDENT trials at a pre-registered T>0 (03 B5) over a mind frozen for the whole task (02 §8). The answer model is injected (a function) so the unit test is hermetic; the production wiring passes a LiteLLM-backed adapter.

- [ ] **Step 1: Write the failing test**

Create `benchmarks/harness/tests/continual/arm-runner.test.ts`:

```typescript
/**
 * Arm runner — memory-ON (frozen mind) vs memory-OFF (empty mind).
 *
 * Hermetic: the "answer model" is an injected function; the mind is a :memory:
 * substrate with a fake embedder. Asserts:
 *   - ON recalls the frozen mind into the prompt; OFF gets an empty block,
 *   - efficiency (turns/tool-calls/tokens) is captured per trial,
 *   - pass^k = fraction of k trials that pass; freeze-per-task (the mind is
 *     identical across the k trials),
 *   - accuracy uses the injected scorer,
 *   - the mind is never written during evaluation (read-only in Phase B).
 */
import { describe, expect, it } from 'vitest';
import { FrameStore, HybridSearch, MindDB, SessionStore, type Embedder } from '@waggle/core';
import { runArmTask, type AnswerFn, type ArmTaskInput } from '../../src/continual/arm-runner.js';

const VEC_DIMS = 1024;
function fakeEmbedder(dims = VEC_DIMS): Embedder {
  const fnv1a = (s: string): number => { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h || 1; };
  const one = (t: string): Float32Array => {
    let st = fnv1a(t); const v = new Float32Array(dims);
    for (let i = 0; i < dims; i++) { st ^= st << 13; st >>>= 0; st ^= st >>> 17; st ^= st << 5; st >>>= 0; v[i] = ((st >>> 0) / 0x100000000) * 2 - 1; }
    let m = 0; for (let i = 0; i < dims; i++) m += v[i] * v[i]; m = Math.sqrt(m); if (m > 0) for (let i = 0; i < dims; i++) v[i] /= m;
    return v;
  };
  return { dimensions: dims, async embed(t) { return one(t); }, async embedBatch(ts) { return ts.map(one); } };
}

async function seededMind(): Promise<MindDB> {
  const db = new MindDB(':memory:');
  const frames = new FrameStore(db);
  const sessions = new SessionStore(db);
  const search = new HybridSearch(db, fakeEmbedder());
  sessions.ensure('returns', 'builder', 'fam');
  const f = frames.createIFrame('returns', 'Fact: restocking fee is 10% on opened electronics.', 'important', 'agent_inferred');
  await search.indexFramesBatch([{ id: f.id, content: f.content }]);
  return db;
}

/** An answer model that "knows" the fee only if the recalled block mentions it. */
const feeAwareAnswer: AnswerFn = async ({ recalledBlock }) => {
  const knows = /restocking fee is 10%/.test(recalledBlock);
  return {
    text: knows ? '10% restocking fee applies.' : 'I am not sure of the fee.',
    inputTokens: 100 + recalledBlock.length,
    outputTokens: 12,
    turns: knows ? 1 : 2,
    toolCalls: knows ? 0 : 1,
  };
};

const baseInput = (mind: MindDB | null): ArmTaskInput => ({
  task: { task_id: 't-1', goal: 'What is the restocking fee on opened electronics?', gold: '10%' },
  mind,
  embedder: fakeEmbedder(),
  answer: feeAwareAnswer,
  scorer: (text, gold) => (text.includes(gold) ? 1 : 0),
  k: 3,
  recallLimit: 5,
});

describe('runArmTask — memory ON vs OFF', () => {
  it('memory-ON recalls the frozen fact and passes', async () => {
    const mind = await seededMind();
    try {
      const r = await runArmTask({ ...baseInput(mind), memoryOn: true });
      expect(r.recalledCount).toBeGreaterThan(0);
      expect(r.passK).toBe(1); // all k trials pass
      expect(r.passAtLeastOne).toBe(true);
    } finally { mind.close(); }
  });

  it('memory-OFF gets an empty block and fails the fee question', async () => {
    const r = await runArmTask({ ...baseInput(null), memoryOn: false });
    expect(r.recalledCount).toBe(0);
    expect(r.passK).toBe(0);
  });

  it('captures efficiency (mean turns / tool-calls / tokens) per trial', async () => {
    const mind = await seededMind();
    try {
      const r = await runArmTask({ ...baseInput(mind), memoryOn: true });
      expect(r.meanTurns).toBe(1);
      expect(r.meanToolCalls).toBe(0);
      expect(r.meanInputTokens).toBeGreaterThan(0);
      expect(r.trials).toHaveLength(3);
    } finally { mind.close(); }
  });

  it('freeze-per-task: the mind is byte-stable across the k trials', async () => {
    const mind = await seededMind();
    try {
      const before = mind.getDatabase().prepare('SELECT COUNT(*) AS c FROM memory_frames').get() as { c: number };
      await runArmTask({ ...baseInput(mind), memoryOn: true, k: 5 });
      const after = mind.getDatabase().prepare('SELECT COUNT(*) AS c FROM memory_frames').get() as { c: number };
      expect(after.c).toBe(before.c); // no write-back during evaluation
    } finally { mind.close(); }
  });

  it('memoryOn=true requires a mind', async () => {
    await expect(runArmTask({ ...baseInput(null), memoryOn: true })).rejects.toThrow(/memory-ON requires a mind/);
  });

  it('rejects k < 1', async () => {
    await expect(runArmTask({ ...baseInput(null), memoryOn: false, k: 0 })).rejects.toThrow(/k ≥ 1/);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run benchmarks/harness/tests/continual/arm-runner.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/continual/arm-runner.js"`.

- [ ] **Step 3: Implement**

Create `benchmarks/harness/src/continual/arm-runner.ts`:

```typescript
/**
 * Continual-protocol arm runner (02 §3.3, §7, §8; 03 B5).
 *
 * Evaluates ONE Phase-B task under one arm:
 *   - memory-ON: recall the FROZEN mind via HybridSearch.search → a
 *     "# Recalled Memories" block (the production cell shape, cells.ts), then
 *     run the answer model with that block.
 *   - memory-OFF: an EMPTY recall block; the model must re-derive (or fail).
 *
 * pass^k (02 §8): the mind is read-only and IDENTICAL across the k trials
 * (freeze-per-task), and trials are independent (the answer model is expected
 * to run at a pre-registered T>0 / varied seed — 03 B5 — so pass^k is not inert).
 * passK = (# passing trials)/k.
 *
 * Efficiency (02 §7.2): turns, tool-calls, input/output tokens are captured per
 * trial and averaged. Tokens are TOTAL (recall-block length feeds the input
 * count via the model's own accounting — the memory tax counts against itself,
 * 03 B3).
 *
 * The answer model + scorer are INJECTED so this module is substrate-coupled
 * only through HybridSearch (the recall path), not through any LLM. Production
 * wiring passes a LiteLLM-backed AnswerFn (a thin wrapper over runAgentLoop or
 * a single call); tests pass a deterministic stub.
 */

import { HybridSearch, type Embedder, type MindDB, type SearchResult } from '@waggle/core';

/** Minimal Phase-B task view the runner needs. */
export interface ArmTask {
  task_id: string;
  goal: string;
  gold: string;
}

/** One answer-model trial result. The model accounts its own usage. */
export interface AnswerResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  turns: number;
  toolCalls: number;
}

/** The injected answer model. `recalledBlock` is '' for memory-OFF. */
export type AnswerFn = (args: {
  goal: string;
  recalledBlock: string;
  trialIndex: number;
}) => Promise<AnswerResult>;

/** Injected scorer: 1 = pass, 0 = fail. (Plan 07 supplies the τ² oracle.) */
export type ScorerFn = (text: string, gold: string) => 0 | 1;

export interface ArmTaskInput {
  task: ArmTask;
  /** Frozen mind for memory-ON; null for memory-OFF. */
  mind: MindDB | null;
  /** Embedder for recall (matches the frozen mind's dimension). */
  embedder: Embedder;
  answer: AnswerFn;
  scorer: ScorerFn;
  /** Whether to recall the mind. */
  memoryOn: boolean;
  /** pass^k trial count. Pre-registered. */
  k: number;
  /** Recall top-K. Default 10 (matches orchestrator recallMemory default). */
  recallLimit?: number;
}

export interface ArmTrial {
  trialIndex: number;
  pass: 0 | 1;
  inputTokens: number;
  outputTokens: number;
  turns: number;
  toolCalls: number;
}

export interface ArmTaskResult {
  task_id: string;
  memoryOn: boolean;
  /** # frames recalled into the block (0 for memory-OFF). */
  recalledCount: number;
  /** (# passing trials)/k. */
  passK: number;
  /** True iff ≥1 trial passed. */
  passAtLeastOne: boolean;
  meanInputTokens: number;
  meanOutputTokens: number;
  meanTurns: number;
  meanToolCalls: number;
  trials: ArmTrial[];
}

/** Render recalled frames into the production "# Recalled Memories" shape
 *  (cells.ts formatRecalledMemories). */
function formatRecalled(results: readonly SearchResult[]): string {
  if (results.length === 0) return '# Recalled Memories\n(none)';
  const lines = results.map(r => {
    const score = r.finalScore.toFixed(3);
    const source = r.frame.source ?? 'user_stated';
    return `- [memory:${r.frame.gop_id}:${r.frame.id} score=${score} src=${source}] ${r.frame.content}`;
  });
  return `# Recalled Memories\n${lines.join('\n')}`;
}

export async function runArmTask(input: ArmTaskInput): Promise<ArmTaskResult> {
  const { task, mind, embedder, answer, scorer, memoryOn, k, recallLimit = 10 } = input;
  if (!Number.isInteger(k) || k < 1) {
    throw new Error(`runArmTask requires k ≥ 1 (integer); got ${k}`);
  }
  if (memoryOn && !mind) {
    throw new Error('runArmTask: memory-ON requires a mind (got null)');
  }

  // Recall ONCE (freeze-per-task): the same block feeds every trial.
  let recalledBlock = '# Recalled Memories\n(none)';
  let recalledCount = 0;
  if (memoryOn && mind) {
    const search = new HybridSearch(mind, embedder);
    const results = await search.search(task.goal, { limit: recallLimit, profile: 'balanced' });
    recalledBlock = formatRecalled(results);
    recalledCount = results.length;
  }

  const trials: ArmTrial[] = [];
  for (let i = 0; i < k; i++) {
    const a = await answer({ goal: task.goal, recalledBlock, trialIndex: i });
    trials.push({
      trialIndex: i,
      pass: scorer(a.text, task.gold),
      inputTokens: a.inputTokens,
      outputTokens: a.outputTokens,
      turns: a.turns,
      toolCalls: a.toolCalls,
    });
  }

  const passes = trials.reduce((s, t) => s + t.pass, 0);
  const avg = (sel: (t: ArmTrial) => number): number =>
    trials.reduce((s, t) => s + sel(t), 0) / trials.length;

  return {
    task_id: task.task_id,
    memoryOn,
    recalledCount,
    passK: passes / k,
    passAtLeastOne: passes > 0,
    meanInputTokens: avg(t => t.inputTokens),
    meanOutputTokens: avg(t => t.outputTokens),
    meanTurns: avg(t => t.turns),
    meanToolCalls: avg(t => t.toolCalls),
    trials,
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run benchmarks/harness/tests/continual/arm-runner.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git -C <worktree> add benchmarks/harness/src/continual/arm-runner.ts benchmarks/harness/tests/continual/arm-runner.test.ts
git -C <worktree> commit -m "feat(benchmarks): continual arm runner (memory ON/OFF, freeze-per-task pass^k)"
```

---

### Task 6: Goal-vs-structure overlap audit + per-task re-derivability gate

**Files:**
- Create: `benchmarks/harness/src/continual/overlap-audit.ts`
- Test: `benchmarks/harness/tests/continual/overlap-audit.test.ts`

> Why (02 §6; 03 C2/C5/C7): (a) the answer-caching defense — for every Phase-B gold compute max n-gram overlap AND max embedding cosine vs Phase-A artifacts, classify goal-overlap (must be LOW) vs structure-overlap (HIGH), and GATE the headline set (exclude tasks whose gold overlap exceeds a pre-registered cutoff — C5); (b) the per-task re-derivability gate (C2) — run the memory-OFF arm at a raised budget; ONLY tasks unbounded-OFF can solve enter the accuracy headline; the rest are excluded and COUNTED ("memory supplied unobtainable knowledge"). The n-gram core is pure; the embedding-cosine + OFF-probe pieces take injected functions so the unit test is hermetic.

- [ ] **Step 1: Write the failing test**

Create `benchmarks/harness/tests/continual/overlap-audit.test.ts`:

```typescript
/**
 * Overlap audit + re-derivability gate.
 *
 * Pure n-gram overlap is tested directly. The embedding-cosine + the
 * raised-budget OFF probe are injected (a cosine fn + an OFF-solve fn) so the
 * test is hermetic and substrate-free.
 */
import { describe, expect, it } from 'vitest';
import {
  maxNgramOverlap,
  auditGoalStructureOverlap,
  runReDerivabilityGate,
  type OverlapTask,
} from '../../src/continual/overlap-audit.js';

describe('maxNgramOverlap', () => {
  it('returns 1.0 when the gold appears verbatim in an artifact', () => {
    const o = maxNgramOverlap('issue a full refund', ['please issue a full refund to the buyer'], 3);
    expect(o).toBeCloseTo(1.0, 5);
  });
  it('returns 0 when there is no shared n-gram', () => {
    expect(maxNgramOverlap('aaa bbb ccc', ['xxx yyy zzz'], 3)).toBe(0);
  });
  it('is fractional for partial overlap', () => {
    const o = maxNgramOverlap('a b c d', ['a b c x'], 2); // bigrams: {a b, b c, c d} vs {a b, b c, c x} → 2/3
    expect(o).toBeCloseTo(2 / 3, 5);
  });
  it('rejects n < 1', () => {
    expect(() => maxNgramOverlap('a b', ['a b'], 0)).toThrow(/n ≥ 1/);
  });
});

const tasks: OverlapTask[] = [
  { task_id: 'lowdup', gold: 'rebook to the morning flight', is_near_dup: false },
  { task_id: 'highdup', gold: 'process the return for order O-100', is_near_dup: false },
];
const phaseAArtifacts = [
  'Skill: rebooking procedure — search alternates, hold seat, confirm.',
  'process the return for order O-100 then refund', // near-identical to highdup gold
];

describe('auditGoalStructureOverlap', () => {
  it('flags a task whose gold n-gram overlap exceeds the cutoff', () => {
    const r = auditGoalStructureOverlap({
      tasks, phaseAArtifacts, ngram: 4, ngramCutoff: 0.5,
      cosine: () => 0.1, cosineCutoff: 0.9,
    });
    const high = r.perTask.find(t => t.task_id === 'highdup')!;
    expect(high.excluded).toBe(true);
    expect(high.exclusionReason).toMatch(/n-gram/);
    const low = r.perTask.find(t => t.task_id === 'lowdup')!;
    expect(low.excluded).toBe(false);
  });

  it('flags a task whose gold embedding cosine exceeds the cutoff', () => {
    const r = auditGoalStructureOverlap({
      tasks: [tasks[0]], phaseAArtifacts, ngram: 4, ngramCutoff: 0.9,
      cosine: () => 0.95, cosineCutoff: 0.9,
    });
    expect(r.perTask[0].excluded).toBe(true);
    expect(r.perTask[0].exclusionReason).toMatch(/cosine/);
  });

  it('reports headline count = tasks not excluded', () => {
    const r = auditGoalStructureOverlap({
      tasks, phaseAArtifacts, ngram: 4, ngramCutoff: 0.5,
      cosine: () => 0.1, cosineCutoff: 0.9,
    });
    expect(r.headlineCount).toBe(1);
    expect(r.excludedCount).toBe(1);
  });

  it('rejects a cutoff outside [0,1]', () => {
    expect(() =>
      auditGoalStructureOverlap({ tasks, phaseAArtifacts, ngram: 4, ngramCutoff: 1.5, cosine: () => 0, cosineCutoff: 0.9 }),
    ).toThrow(/ngramCutoff/);
  });
});

describe('runReDerivabilityGate', () => {
  it('excludes (and counts) tasks that unbounded-OFF cannot solve', async () => {
    const r = await runReDerivabilityGate({
      tasks: [
        { task_id: 'rederivable', gold: 'g1', is_near_dup: false },
        { task_id: 'unobtainable', gold: 'g2', is_near_dup: false },
      ],
      // raised-budget OFF probe: 'rederivable' solves, 'unobtainable' never does.
      offSolves: async (t) => t.task_id === 'rederivable',
    });
    expect(r.reDerivable.map(t => t.task_id)).toEqual(['rederivable']);
    expect(r.nonReDerivable.map(t => t.task_id)).toEqual(['unobtainable']);
    expect(r.nonReDerivableCount).toBe(1);
  });

  it('an empty task set throws', async () => {
    await expect(runReDerivabilityGate({ tasks: [], offSolves: async () => true })).rejects.toThrow(/non-empty/);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run benchmarks/harness/tests/continual/overlap-audit.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/continual/overlap-audit.js"`.

- [ ] **Step 3: Implement**

Create `benchmarks/harness/src/continual/overlap-audit.ts`:

```typescript
/**
 * Answer-caching defense (02 §6) + per-task re-derivability gate (03 C2).
 *
 * Two surfaces:
 *  1. auditGoalStructureOverlap — for every Phase-B gold, compute the max
 *     n-gram overlap (pure) AND the max embedding cosine (injected) against the
 *     Phase-A artifacts, and EXCLUDE any task whose gold overlap exceeds a
 *     pre-registered cutoff on EITHER axis (C5 near-dup gating of the headline
 *     set). The excluded count + the lift-with/without-exclusion are reported.
 *  2. runReDerivabilityGate — run the memory-OFF arm at a RAISED budget
 *     (injected `offSolves`); only tasks unbounded-OFF can solve enter the
 *     accuracy headline; the rest are excluded and counted (a high count is
 *     itself a finding — "memory supplied unobtainable knowledge").
 *
 * Both take injected scorers/probes so the module is unit-testable without an
 * embedder or LLM; production wiring passes the real embedder cosine + the
 * arm-runner OFF probe at raised k/budget.
 */

/** Tokenize on whitespace + drop empties; lowercase for overlap robustness. */
function tokens(s: string): string[] {
  return s.toLowerCase().split(/\s+/).filter(t => t.length > 0);
}

/** Build the set of n-grams (space-joined) for a token list. */
function ngrams(toks: readonly string[], n: number): Set<string> {
  const set = new Set<string>();
  if (toks.length < n) {
    if (toks.length > 0) set.add(toks.join(' '));
    return set;
  }
  for (let i = 0; i + n <= toks.length; i++) {
    set.add(toks.slice(i, i + n).join(' '));
  }
  return set;
}

/**
 * Max fraction of `gold`'s n-grams that appear in ANY single artifact.
 * 1.0 ⇒ every gold n-gram is present in one artifact (a verbatim-ish leak).
 */
export function maxNgramOverlap(gold: string, artifacts: readonly string[], n: number): number {
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(`maxNgramOverlap requires n ≥ 1 (integer); got ${n}`);
  }
  const goldGrams = ngrams(tokens(gold), n);
  if (goldGrams.size === 0) return 0;
  let best = 0;
  for (const art of artifacts) {
    const artGrams = ngrams(tokens(art), n);
    let hit = 0;
    for (const g of goldGrams) if (artGrams.has(g)) hit++;
    const frac = hit / goldGrams.size;
    if (frac > best) best = frac;
  }
  return best;
}

export interface OverlapTask {
  task_id: string;
  gold: string;
  is_near_dup: boolean;
}

/** Injected: max embedding cosine of `gold` vs any artifact. */
export type CosineFn = (gold: string, artifacts: readonly string[]) => number;

export interface OverlapAuditInput {
  tasks: readonly OverlapTask[];
  phaseAArtifacts: readonly string[];
  /** n-gram size for the n-gram axis. */
  ngram: number;
  /** Exclude when n-gram overlap > this. Pre-registered. */
  ngramCutoff: number;
  cosine: CosineFn;
  /** Exclude when embedding cosine > this. Pre-registered. */
  cosineCutoff: number;
}

export interface OverlapPerTask {
  task_id: string;
  ngramOverlap: number;
  cosineOverlap: number;
  excluded: boolean;
  exclusionReason: string | null;
}

export interface OverlapAuditResult {
  perTask: OverlapPerTask[];
  headlineCount: number;
  excludedCount: number;
}

export function auditGoalStructureOverlap(input: OverlapAuditInput): OverlapAuditResult {
  const { tasks, phaseAArtifacts, ngram, ngramCutoff, cosine, cosineCutoff } = input;
  if (!Number.isFinite(ngramCutoff) || ngramCutoff < 0 || ngramCutoff > 1) {
    throw new Error(`auditGoalStructureOverlap requires ngramCutoff ∈ [0,1]; got ${ngramCutoff}`);
  }
  if (!Number.isFinite(cosineCutoff) || cosineCutoff < 0 || cosineCutoff > 1) {
    throw new Error(`auditGoalStructureOverlap requires cosineCutoff ∈ [0,1]; got ${cosineCutoff}`);
  }
  if (!Array.isArray(tasks) || tasks.length === 0) {
    throw new Error('auditGoalStructureOverlap requires a non-empty tasks array');
  }

  const perTask: OverlapPerTask[] = [];
  let excludedCount = 0;
  for (const t of tasks) {
    const ng = maxNgramOverlap(t.gold, phaseAArtifacts, ngram);
    const cos = cosine(t.gold, phaseAArtifacts);
    let excluded = false;
    let reason: string | null = null;
    if (ng > ngramCutoff) {
      excluded = true;
      reason = `n-gram overlap ${ng.toFixed(3)} > cutoff ${ngramCutoff}`;
    } else if (cos > cosineCutoff) {
      excluded = true;
      reason = `embedding cosine ${cos.toFixed(3)} > cutoff ${cosineCutoff}`;
    }
    if (excluded) excludedCount++;
    perTask.push({ task_id: t.task_id, ngramOverlap: ng, cosineOverlap: cos, excluded, exclusionReason: reason });
  }

  return { perTask, headlineCount: tasks.length - excludedCount, excludedCount };
}

/** Injected raised-budget OFF probe: true ⇒ unbounded-OFF reaches the gold. */
export type OffSolveFn = (task: OverlapTask) => Promise<boolean>;

export interface ReDerivabilityInput {
  tasks: readonly OverlapTask[];
  offSolves: OffSolveFn;
}

export interface ReDerivabilityResult {
  reDerivable: OverlapTask[];
  nonReDerivable: OverlapTask[];
  nonReDerivableCount: number;
}

export async function runReDerivabilityGate(input: ReDerivabilityInput): Promise<ReDerivabilityResult> {
  const { tasks, offSolves } = input;
  if (!Array.isArray(tasks) || tasks.length === 0) {
    throw new Error('runReDerivabilityGate requires a non-empty tasks array');
  }
  const reDerivable: OverlapTask[] = [];
  const nonReDerivable: OverlapTask[] = [];
  for (const t of tasks) {
    if (await offSolves(t)) reDerivable.push(t);
    else nonReDerivable.push(t);
  }
  return { reDerivable, nonReDerivable, nonReDerivableCount: nonReDerivable.length };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run benchmarks/harness/tests/continual/overlap-audit.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git -C <worktree> add benchmarks/harness/src/continual/overlap-audit.ts benchmarks/harness/tests/continual/overlap-audit.test.ts
git -C <worktree> commit -m "feat(benchmarks): goal-vs-structure overlap audit + re-derivability gate"
```

---

### Task 7: Barrel export, Plan-04 stats wiring probe, and full-module verification

**Files:**
- Create: `benchmarks/harness/src/continual/index.ts`
- Test: `benchmarks/harness/tests/continual/index.test.ts`

> Why: expose the continual surface as one import, and prove that the H2/H3 stats this protocol feeds (Plan 04 `computePairedDiffClusterBootstrapCI` + `tostEquivalence`) consume arm-runner output shape correctly (a contract probe so a Plan-04 signature drift is caught here). Plan 04's module is a sibling already specified — if it has not landed, the probe test is skipped via a guarded import, never a hard failure.

- [ ] **Step 1: Add the barrel**

Create `benchmarks/harness/src/continual/index.ts`:

```typescript
/**
 * Continual-memory protocol harness — public barrel.
 * (02-CONTINUAL-MEMORY-PROTOCOL.md; 03-REDTEAM-RESOLUTIONS.md.)
 */
export {
  validateContinualTask,
  validateTaskPool,
  type ContinualTask,
  type StructureTag,
} from './task-pool.js';

export {
  buildPhaseSplit,
  type PhaseSplitInput,
  type PhaseSplitResult,
  type DifficultyDistribution,
} from './split-builder.js';

export {
  hashMindBytes,
  resolveHashMind,
  type HashMindFn,
} from './mind-hash.js';

export {
  buildAndFreezeMind,
  type PhaseAArtifact,
  type BuildMindInput,
  type BuildMindResult,
} from './mind-build.js';

export {
  runArmTask,
  type ArmTask,
  type ArmTaskInput,
  type ArmTaskResult,
  type ArmTrial,
  type AnswerFn,
  type AnswerResult,
  type ScorerFn,
} from './arm-runner.js';

export {
  maxNgramOverlap,
  auditGoalStructureOverlap,
  runReDerivabilityGate,
  type OverlapTask,
  type OverlapAuditInput,
  type OverlapAuditResult,
  type OverlapPerTask,
  type CosineFn,
  type ReDerivabilityInput,
  type ReDerivabilityResult,
  type OffSolveFn,
} from './overlap-audit.js';
```

- [ ] **Step 2: Add the barrel + Plan-04 wiring probe test**

Create `benchmarks/harness/tests/continual/index.test.ts`:

```typescript
/**
 * Barrel + Plan-04 stats wiring probe.
 *
 * Asserts the continual surface is fully re-exported, and that arm-runner
 * pass-results can be fed into Plan 04's paired cluster-bootstrap diff CI +
 * TOST (the H2/H3 endpoints this protocol exists to power). The Plan-04 import
 * is guarded so a not-yet-landed sibling is skipped, not a hard failure.
 */
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import * as continual from '../../src/continual/index.js';

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

describe('Plan-04 stats wiring (guarded)', () => {
  const req = createRequire(import.meta.url);
  let stats: {
    computePairedDiffClusterBootstrapCI?: (i: unknown) => { ci_lower: number; ci_upper: number };
    tostEquivalence?: (i: unknown) => { equivalent: boolean };
  } | null = null;
  try {
    stats = req('../../src/stats/equivalence-tost.js');
  } catch {
    stats = null;
  }

  it.runIf(stats?.computePairedDiffClusterBootstrapCI)(
    'paired diff CI consumes {cluster_id, arm_a, arm_b} rows built from pass^1 results',
    () => {
      // Build PairedRow[] from two arms' per-task pass^1, clustered by family.
      const rows = [
        { cluster_id: 'returns', arm_a: 1 as const, arm_b: 1 as const },
        { cluster_id: 'returns', arm_a: 1 as const, arm_b: 0 as const },
        { cluster_id: 'rebooking', arm_a: 1 as const, arm_b: 1 as const },
        { cluster_id: 'rebooking', arm_a: 0 as const, arm_b: 0 as const },
      ];
      const ci = stats!.computePairedDiffClusterBootstrapCI!({ rows, n_bootstrap: 200, seed: 42 });
      expect(ci.ci_lower).toBeLessThanOrEqual(ci.ci_upper);
      const tost = stats!.tostEquivalence!({ diffCI: ci, margin: 0.5 });
      expect(typeof tost.equivalent).toBe('boolean');
    },
  );
});
```

- [ ] **Step 3: Run the continual suite + typecheck**

Run: `npx vitest run benchmarks/harness/tests/continual/`
Expected: PASS — all continual test files green (the Plan-04 probe runs if `equivalence-tost.js` exists, otherwise its single case is skipped).

Run: `npx tsc --noEmit --project benchmarks/harness/tsconfig.json`
Expected: exit 0. (Note: `tsconfig.json` `exclude`s `tests`, so this typechecks `src/continual/*` only — the test files are typechecked by vitest at run time.)

- [ ] **Step 4: Run the whole harness test suite to confirm no regression**

Run: `npx vitest run benchmarks/harness/tests/`
Expected: PASS — the pre-existing harness tests (substrate, cells, ingest, stats, etc.) still green, plus the new `continual/*` tests.

- [ ] **Step 5: Commit**

```bash
git -C <worktree> add benchmarks/harness/src/continual/index.ts benchmarks/harness/tests/continual/index.test.ts
git -C <worktree> commit -m "feat(benchmarks): continual barrel + Plan-04 stats wiring probe"
```

---

## Self-Review

**Spec coverage:**
- `02` §3.1 phases / §3.3 arm×mind map → Task 5 arm runner (frozen mind ON vs empty OFF). ✓
- `02` §3.2 Mode-1 shared frozen mind (neutral builder, byte-identical) → Task 4 `buildAndFreezeMind` (deterministic hash; builderId recorded). `03` C3 builder neutrality (deterministic non-LLM extraction; builder-sensitivity is run by re-invoking with a different artifact source — the builderId knob enables it). ✓
- `02` §5 firewall backbone (no gold substring in banked content) → Task 4 substring gate; richer embedding gate delegated to Plan 06 (consumed via `resolveHashMind`/firewall). ✓
- `02` §6 / `03` C5 answer-caching defense + near-dup GATE of the headline set → Task 6 `auditGoalStructureOverlap` (n-gram + cosine, exclude+count). ✓
- `02` §6.3 / `03` C2 re-derivability proof + per-task gate (raised-budget OFF probe → exclude+count) → Task 6 `runReDerivabilityGate`. ✓
- `02` §7.1 pass^k / §8 freeze-per-task / `03` B5 T>0 trials → Task 5 (recall once, identical mind across k independent trials; T>0 lives in the injected AnswerFn). ✓
- `02` §7.2 efficiency (tokens/turns/tool-calls, total incl. recall) → Task 5 per-trial capture + means. ✓
- `03` B6 mechanical SHA-frozen difficulty-stratified split + A/B difficulty distribution + Phase-B-random arm → Task 2 `buildPhaseSplit` (`split_sha`, `difficultyDist`, `phaseBRandom`). ✓
- `03` C7 negative-control family (LOW structure-overlap; routed entirely to Phase B; predicts no lift) → Task 1 `is_negative_control`/`structure_tag='NONE'` + Task 2 routing. ✓
- `03` D3 divergence-stress is carried by `structure_tag` + the headline/negative split (tasks needing novel composition vs answer-present); the audit's overlap scores feed the subset labeling. ✓
- `03` B2 cluster ids (procedure-family / recurring-user) → Task 1 fields; Task 7 probe feeds them as `cluster_id` to Plan 04. ✓
- Plan 04 consumption (`computePairedDiffClusterBootstrapCI` / `tostEquivalence`) → Task 7 wiring probe. ✓
- Plan 06 consumption (`hashMind`) → Task 3 contract probe + guarded fallback. ✓
- Substrate-coupled pieces written with `:memory:` MindDB fixture + injected fake embedder (substrate.ts/substrate.test.ts pattern) → Tasks 4, 5. ✓
- NOT in scope (sibling plans): the τ²-bench task pool *population* + completion oracle (Plan 07 — this plan consumes the `ContinualTask`/`ScorerFn` shapes), the LiteLLM-backed `AnswerFn` production adapter (Plan 07/09), ruler-validation + priced smoke (Plan 09), the firewall embedding gate (Plan 06). Flagged inline. ✓

**Placeholder scan:** none. Every code step is a complete fenced block; every command has an exact expected output. The two cross-plan dependencies (Plan 04 stats, Plan 06 hashMind) are pinned with a concrete contract + guarded fallback/probe so neither leaves a blank (Tasks 3 and 7). The `db.getDatabase().backup()` / `.serialize()` APIs were verified present in `@types/better-sqlite3` during planning.

**Type consistency:** `ContinualTask{task_id,goal,gold,difficulty,procedure_family,recurring_user,structure_tag,is_near_dup,is_negative_control}` is the one task shape; `PhaseSplitResult{phaseA,phaseB,phaseBRandom,negativeControl,nearDupControl,difficultyDist,split_sha,seed,testFraction}`; `BuildMindResult{mindHash,outputPath,frameCount,builderId,mechanismCounts}`; `ArmTaskResult{task_id,memoryOn,recalledCount,passK,passAtLeastOne,mean*,trials}`; `OverlapAuditResult{perTask,headlineCount,excludedCount}` / `ReDerivabilityResult{reDerivable,nonReDerivable,nonReDerivableCount}`. Function names (`validateTaskPool`, `buildPhaseSplit`, `resolveHashMind`/`hashMindBytes`, `buildAndFreezeMind`, `runArmTask`, `maxNgramOverlap`/`auditGoalStructureOverlap`/`runReDerivabilityGate`) are spelled identically across impl, tests, and the barrel. The `SearchResult`/`MindDB`/`Embedder`/`Importance` types are imported from `@waggle/core` exactly as `substrate.ts` does; `formatRecalled` mirrors `cells.ts::formatRecalledMemories` field-for-field (`gop_id`, `id`, `finalScore`, `source`, `content`). ✓
