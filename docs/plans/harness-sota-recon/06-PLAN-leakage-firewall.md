# Leakage-Firewall Assertion Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Build the credibility backbone of the harness-SOTA benchmark — a pure, unit-testable **leakage-firewall** module that proves, per priced run, that *no Phase-B gold answer leaked into the mind* across **every** written artifact (ingest frames, LLM-authored skill bodies, write-back frames, identity/awareness, user-sim turns), via an exact+normalized **gold-substring gate**, an injected-embedder **embedding-similarity gate**, a deterministic **frozen-mind hash**, and a per-row `events.jsonl` **audit emitter** that records each assertion's pass/fail.

**Architecture:** A new package-local namespace `benchmarks/harness/src/firewall/` of small, side-effect-free functions. The pure substring/normalize/hash functions are fully deterministic and tested against hand-built fixtures. The embedding-similarity gate is defined against an **injected `FirewallEmbedder` interface** (a structural subset of `@waggle/core`'s `Embedder`) so it unit-tests with an in-module deterministic stub — **zero network, zero Ollama, zero `@waggle/core` import in the firewall source**. `hashMind` and `emitFirewallAssertion` do real file I/O but are tested with per-test tmpdirs (the existing `runner-lock.test.ts` idiom).

**Tech Stack:** TypeScript (ESM; harness tsconfig uses `moduleResolution: "Bundler"` but every existing module + sibling Plan 04 uses `.js` import specifiers — match that exactly), Node `node:crypto` + `node:fs` + `node:path`/`node:os`, vitest 3. No new dependencies.

**Spec refs:** `01-DESIGN-SPEC.md` §9 (leakage firewall); `02-CONTINUAL-MEMORY-PROTOCOL.md` §5 (ex-ante invariants: agent-earned content only; assert-no-gold-substring exact+normalized; Phase-A⟂Phase-B; frozen+hashed mind; scope-bound recall; injection-scan; local embedder/T=0/seed) + §6 (near-dup similarity GATE on the headline set); `03-REDTEAM-RESOLUTIONS.md` **C1** (firewall covers ALL written artifacts incl. skill bodies; embedding-similarity gate; per-row emission), **C2** (re-derivability — out of scope here, flagged), **C4** (user-sim paraphrase → embedding gate over banked user turns), **C5** (near-dup must GATE, not just diagnose), **C6** (mechanism-spread is NOT a leakage defense — this module IS the defense), **C8** (implement + unit-test every assertion BEFORE pre-registration; freeze at SHA; emit pass/fail into `events.jsonl`).

**Scope note:** Plan 06 of the Phase-0 series. Siblings (separate files/subsystems): `04` equivalence-stats (`src/stats/equivalence-tost.ts` — already written), `05` model-registry, `07` τ²-bench adapter + oracle, `08` continual-protocol harness (Phase-A/B split + mind build/freeze + the *caller* that wires this firewall into the run loop and writes the `events.jsonl` rows), `09` ruler-validation. This plan delivers a tested, importable firewall library with **zero LLM/network/substrate dependencies in its source**. It does NOT build the per-task **re-derivability** gate (C2 — that needs the live memory-OFF arm; it belongs to Plan 08), nor the goal/structure-overlap classifier (C7 — Plan 08). Those are flagged in Self-Review.

---

## File Structure

| File | Responsibility |
|---|---|
| `benchmarks/harness/src/firewall/normalize.ts` (create) | Pure text canonicalization: lowercase / Unicode-NFKC / whitespace-collapse / punctuation-fold. The single shared normalizer used by the substring gate. |
| `benchmarks/harness/src/firewall/artifact.ts` (create) | `Artifact` discriminated type (the universe of written mind content) + `collectArtifactTexts()` flattener. The data contract every gate consumes. |
| `benchmarks/harness/src/firewall/substring-gate.ts` (create) | `assertNoGoldSubstring(artifacts, golds)` — exact AND normalized containment over ALL artifact text; returns a structured per-hit report; never throws on a finding (it *reports*). |
| `benchmarks/harness/src/firewall/embedding-gate.ts` (create) | `FirewallEmbedder` interface + `cosineSimilarity()` + `maxEmbeddingSimilarity(artifact, golds, embedder)` + `assertEmbeddingGate(artifacts, golds, embedder, threshold)` with a pre-registered threshold. |
| `benchmarks/harness/src/firewall/hash-mind.ts` (create) | `hashMind(dbPathOrBytes)` — deterministic SHA-256 of the frozen mind DB (file path → bytes, or raw `Uint8Array`). |
| `benchmarks/harness/src/firewall/emit.ts` (create) | `FirewallAssertionRow` type + `emitFirewallAssertion(eventsJsonlPath, row)` — append one canonical JSONL audit line per assertion. |
| `benchmarks/harness/src/firewall/index.ts` (create) | Barrel re-export of the firewall surface. |
| `benchmarks/harness/tests/firewall/normalize.test.ts` (create) | Normalizer unit tests. |
| `benchmarks/harness/tests/firewall/substring-gate.test.ts` (create) | Substring gate + each leakage vector from `03`/`memory-toggle...` as explicit cases. |
| `benchmarks/harness/tests/firewall/embedding-gate.test.ts` (create) | Cosine + max-similarity + gate, with a deterministic stub embedder. |
| `benchmarks/harness/tests/firewall/hash-mind.test.ts` (create) | Determinism + path-vs-bytes equivalence + tamper-detection. |
| `benchmarks/harness/tests/firewall/emit.test.ts` (create) | JSONL append shape + round-trip + multi-row ordering. |
| `benchmarks/harness/tests/firewall/index.test.ts` (create) | Barrel exposes the full surface. |

Conventions to copy verbatim from the existing harness: the `mulberry32(seed)` idiom (re-implemented locally in tests that need synthetic vectors — keep modules self-contained, as `cluster-bootstrap.ts` does); throw-on-invalid-input style with `≥`/`∈`-flavored messages; `.js` import specifiers in every import; per-test tmpdir via `fs.mkdtempSync(path.join(os.tmpdir(), 'bench-fw-...'))` + `afterEach` `fs.rmSync(..., { recursive: true, force: true })` (from `runner-lock.test.ts`); explicit exported `interface`/`type`, no `any`, immutable returns (new objects, never mutate inputs).

---

### Task 1: Text normalizer (the shared canonicalizer)

**Files:**
- Create: `benchmarks/harness/src/firewall/normalize.ts`
- Test: `benchmarks/harness/tests/firewall/normalize.test.ts`

- [ ] **Step 1: Write the failing test**

Create `benchmarks/harness/tests/firewall/normalize.test.ts`:

```typescript
/**
 * Firewall normalizer tests — the canonical fold used by the gold-substring gate.
 * Deterministic; no I/O, no PRNG.
 */
import { describe, expect, it } from 'vitest';
import { normalizeForMatch } from '../../src/firewall/normalize.js';

describe('normalizeForMatch', () => {
  it('lowercases', () => {
    expect(normalizeForMatch('HELLO World')).toBe('hello world');
  });

  it('collapses all whitespace runs (spaces/tabs/newlines) to a single space', () => {
    expect(normalizeForMatch('a\t b\n\n  c')).toBe('a b c');
  });

  it('trims leading/trailing whitespace', () => {
    expect(normalizeForMatch('   padded   ')).toBe('padded');
  });

  it('folds punctuation to a single space (so "order#123!" ~ "order 123")', () => {
    expect(normalizeForMatch('order#123!')).toBe('order 123');
  });

  it('treats hyphenated and spaced forms identically', () => {
    expect(normalizeForMatch('re-book flight')).toBe(normalizeForMatch('re book flight'));
  });

  it('applies Unicode NFKC so full-width and ligature forms canonicalize', () => {
    // Full-width "ＡＢＣ" (U+FF21..) → "abc"; ﬁ ligature (U+FB01) → "fi".
    expect(normalizeForMatch('ＡＢＣ')).toBe('abc');
    expect(normalizeForMatch('ﬁle')).toBe('file');
  });

  it('strips zero-width characters that could split a banned substring', () => {
    // zero-width space (U+200B) between letters must not survive
    expect(normalizeForMatch('go​ld')).toBe('gold');
  });

  it('is idempotent', () => {
    const once = normalizeForMatch('  The   Quick-Brown FOX.  ');
    expect(normalizeForMatch(once)).toBe(once);
  });

  it('rejects non-string input', () => {
    expect(() => normalizeForMatch(42 as unknown as string)).toThrow(/expects a string/);
  });

  it('returns empty string for empty/whitespace-only input', () => {
    expect(normalizeForMatch('')).toBe('');
    expect(normalizeForMatch('   \n\t ')).toBe('');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run benchmarks/harness/tests/firewall/normalize.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/firewall/normalize.js"` (module does not exist yet).

- [ ] **Step 3: Write the minimal implementation**

Create `benchmarks/harness/src/firewall/normalize.ts`:

```typescript
/**
 * Leakage-firewall text canonicalizer.
 *
 * The gold-substring gate (02-CONTINUAL-MEMORY-PROTOCOL.md §5.2) must catch a
 * leaked gold answer even when an artifact paraphrases its surface form:
 * different case, re-spaced, hyphen-vs-space, full-width glyphs, ligatures, or
 * zero-width characters inserted to defeat a naive `includes`. `normalizeForMatch`
 * produces ONE canonical form so that "Order #123!" and "order 123" collide.
 *
 * Pipeline (order matters):
 *   1. Unicode NFKC — fold compatibility forms (full-width, ligatures) to ASCII-ish.
 *   2. lowercase.
 *   3. strip zero-width + control chars (U+200B-U+200D, U+FEFF, U+0000-U+001F except
 *      whitespace) so they can't split a banned substring.
 *   4. replace every non-alphanumeric (Unicode letters/digits) run with a single space.
 *   5. collapse remaining whitespace to single spaces; trim.
 *
 * Pure + deterministic + idempotent. No I/O.
 */

// Zero-width + BOM joiners that must be deleted before matching.
const ZERO_WIDTH = /[​‌‍﻿]/g;
// Anything that is NOT a Unicode letter or number → fold to a space.
const NON_ALPHANUM = /[^\p{L}\p{N}]+/gu;
const WHITESPACE_RUN = /\s+/g;

export function normalizeForMatch(text: string): string {
  if (typeof text !== 'string') {
    throw new Error(`normalizeForMatch expects a string; got ${typeof text}`);
  }
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(ZERO_WIDTH, '')
    .replace(NON_ALPHANUM, ' ')
    .replace(WHITESPACE_RUN, ' ')
    .trim();
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run benchmarks/harness/tests/firewall/normalize.test.ts`
Expected: PASS (all `normalizeForMatch` cases green).

- [ ] **Step 5: Commit**

```bash
git -C "$WORKTREE" add benchmarks/harness/src/firewall/normalize.ts benchmarks/harness/tests/firewall/normalize.test.ts
git -C "$WORKTREE" commit -m "feat(benchmarks): firewall text canonicalizer for the gold-substring gate"
```

---

### Task 2: Artifact contract + text flattener

**Files:**
- Create: `benchmarks/harness/src/firewall/artifact.ts`
- Test: extends the substring-gate test in Task 3 (the flattener is exercised there). Add a focused contract test here first.
- Test: `benchmarks/harness/tests/firewall/artifact.test.ts` (create)

> Why a typed `Artifact` union: `03` C1 makes the firewall cover **ALL** written artifacts, not just ingest frames. Encoding the artifact *kind* (frame / skill_body / write_back / identity / awareness / user_turn) means the audit row can say *which class* of artifact leaked — a frame leak (ingest bug) and a skill-body leak (LLM smuggling) are different failures. The flattener is the single adapter every gate consumes, so adding a new artifact source later is a one-line change.

- [ ] **Step 1: Write the failing test**

Create `benchmarks/harness/tests/firewall/artifact.test.ts`:

```typescript
/**
 * Artifact contract tests — the universe of written mind content the firewall scans.
 */
import { describe, expect, it } from 'vitest';
import {
  collectArtifactTexts,
  type Artifact,
  ARTIFACT_KINDS,
} from '../../src/firewall/artifact.js';

describe('Artifact contract', () => {
  it('exposes every written-artifact kind the firewall must cover (03 C1)', () => {
    expect(ARTIFACT_KINDS).toEqual([
      'frame',
      'skill_body',
      'write_back',
      'identity',
      'awareness',
      'user_turn',
    ]);
  });
});

describe('collectArtifactTexts', () => {
  const artifacts: Artifact[] = [
    { kind: 'frame', id: 'f1', text: 'Alice: I bought order 555.' },
    { kind: 'skill_body', id: 's1', text: '# process_return(order)\nLook up the order, ...' },
    { kind: 'write_back', id: 'wb1', text: 'Change-fee policy is $50.' },
    { kind: 'identity', id: 'id1', text: 'User prefers window seats.' },
    { kind: 'awareness', id: 'aw1', text: 'Currently rebooking flight.' },
    { kind: 'user_turn', id: 'u1', text: 'I would like to return something.' },
  ];

  it('returns one entry per artifact, preserving kind+id+text', () => {
    const flat = collectArtifactTexts(artifacts);
    expect(flat).toHaveLength(6);
    expect(flat[1]).toEqual({ kind: 'skill_body', id: 's1', text: artifacts[1].text });
  });

  it('does not mutate the input array or its objects', () => {
    const snapshot = JSON.stringify(artifacts);
    collectArtifactTexts(artifacts);
    expect(JSON.stringify(artifacts)).toBe(snapshot);
  });

  it('rejects a non-array input', () => {
    expect(() => collectArtifactTexts({} as unknown as Artifact[])).toThrow(/array of artifacts/);
  });

  it('rejects an artifact with an unknown kind', () => {
    const bad = [{ kind: 'secret', id: 'x', text: 'leak' }] as unknown as Artifact[];
    expect(() => collectArtifactTexts(bad)).toThrow(/unknown artifact kind/);
  });

  it('rejects an artifact missing text', () => {
    const bad = [{ kind: 'frame', id: 'x' }] as unknown as Artifact[];
    expect(() => collectArtifactTexts(bad)).toThrow(/text must be a string/);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run benchmarks/harness/tests/firewall/artifact.test.ts`
Expected: FAIL — module `../../src/firewall/artifact.js` does not exist.

- [ ] **Step 3: Implement**

Create `benchmarks/harness/src/firewall/artifact.ts`:

```typescript
/**
 * The artifact contract — the universe of written mind content the leakage
 * firewall scans.
 *
 * 03-REDTEAM-RESOLUTIONS.md C1 (critical): the firewall must cover ALL written
 * artifacts, not just ingest frames. A Phase-A skill body is LLM-authored
 * markdown that could encode a Phase-B-determining procedure; a write-back frame
 * could bank a discovered gold; user-sim turns are goal-conditioned and may
 * paraphrase the target (C4). Each kind is a distinct failure class, so we tag it.
 *
 * Kinds:
 *   frame       — ingest / harvest I/P/B frame content (memory_frames.content)
 *   skill_body  — LLM-authored distilled-skill markdown (D1 create_skill)
 *   write_back  — cognify / write-back banked fact
 *   identity    — IdentityLayer persisted profile text
 *   awareness   — AwarenessLayer active-task/state text
 *   user_turn   — simulated-user conversational turn banked for M4 personalization
 */

export const ARTIFACT_KINDS = [
  'frame',
  'skill_body',
  'write_back',
  'identity',
  'awareness',
  'user_turn',
] as const;

export type ArtifactKind = (typeof ARTIFACT_KINDS)[number];

export interface Artifact {
  kind: ArtifactKind;
  /** Stable identifier for the audit trail (frame id, skill id, etc.). */
  id: string;
  /** The full text written into the mind for this artifact. */
  text: string;
}

/** A flattened, validated copy ready for a gate to scan. Same shape as Artifact
 *  today, kept as a distinct type so a future flattener can split multi-field
 *  artifacts (e.g. a frame with title+body) into multiple scan units. */
export interface ArtifactText {
  kind: ArtifactKind;
  id: string;
  text: string;
}

const KIND_SET: ReadonlySet<string> = new Set<string>(ARTIFACT_KINDS);

export function collectArtifactTexts(artifacts: readonly Artifact[]): ArtifactText[] {
  if (!Array.isArray(artifacts)) {
    throw new Error('collectArtifactTexts requires an array of artifacts');
  }
  return artifacts.map((a, i) => {
    if (!a || !KIND_SET.has(a.kind)) {
      throw new Error(`unknown artifact kind at index ${i}: ${a?.kind}`);
    }
    if (typeof a.text !== 'string') {
      throw new Error(`artifact text must be a string at index ${i} (kind ${a.kind}, id ${a.id})`);
    }
    if (typeof a.id !== 'string') {
      throw new Error(`artifact id must be a string at index ${i} (kind ${a.kind})`);
    }
    return { kind: a.kind, id: a.id, text: a.text };
  });
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run benchmarks/harness/tests/firewall/artifact.test.ts`
Expected: PASS (all cases green).

- [ ] **Step 5: Commit**

```bash
git -C "$WORKTREE" add benchmarks/harness/src/firewall/artifact.ts benchmarks/harness/tests/firewall/artifact.test.ts
git -C "$WORKTREE" commit -m "feat(benchmarks): firewall artifact contract covering all written mind content"
```

---

### Task 3: Gold-substring gate (exact + normalized) — the leakage-vector test bed

**Files:**
- Create: `benchmarks/harness/src/firewall/substring-gate.ts`
- Test: `benchmarks/harness/tests/firewall/substring-gate.test.ts`

> This is the firewall's spine (`02` §5.2). It scans **every** artifact text for **every** Phase-B gold, in BOTH exact and normalized form. Per `03` C6, mechanism-spread is NOT a defense — this gate (plus the embedding gate) IS the defense, so it must be ruthless: a single hit makes `passed=false`. The leakage vectors from `memory-toggle-and-rigor-template.md` §A.3 and `03` C1/C4 are encoded as explicit cases.

- [ ] **Step 1: Write the failing test**

Create `benchmarks/harness/tests/firewall/substring-gate.test.ts`:

```typescript
/**
 * Gold-substring gate tests — exact + normalized containment over ALL artifacts.
 * Each leakage vector from 03 (C1 skill bodies, C4 user-turn paraphrase) and
 * memory-toggle-and-rigor-template.md §A.3 is an explicit case.
 */
import { describe, expect, it } from 'vitest';
import {
  assertNoGoldSubstring,
  type Gold,
} from '../../src/firewall/substring-gate.js';
import type { Artifact } from '../../src/firewall/artifact.js';

const cleanArtifacts: Artifact[] = [
  { kind: 'frame', id: 'f1', text: 'Alice: I want to return the blue jacket I bought last week.' },
  { kind: 'skill_body', id: 's1', text: '# process_return(order)\n1. Look up the order by id.\n2. Check the return window.' },
  { kind: 'user_turn', id: 'u1', text: 'Can you help me with a return?' },
];

const golds: Gold[] = [
  { task_id: 'B-07', text: 'The refund total is $342.18' },
  { task_id: 'B-12', text: 'flight UA-915 rebooked to 2026-07-04' },
];

describe('assertNoGoldSubstring — clean case', () => {
  it('passes when no gold appears in any artifact', () => {
    const r = assertNoGoldSubstring(cleanArtifacts, golds);
    expect(r.passed).toBe(true);
    expect(r.hits).toEqual([]);
    expect(r.n_artifacts).toBe(3);
    expect(r.n_golds).toBe(2);
  });
});

describe('assertNoGoldSubstring — exact-match leakage', () => {
  it('flags a frame containing a gold verbatim (vector 2: gold in ingested corpus)', () => {
    const leaky: Artifact[] = [
      ...cleanArtifacts,
      { kind: 'frame', id: 'fbad', text: 'note to self: The refund total is $342.18 for that order.' },
    ];
    const r = assertNoGoldSubstring(leaky, golds);
    expect(r.passed).toBe(false);
    expect(r.hits).toHaveLength(1);
    expect(r.hits[0]).toMatchObject({
      artifact_kind: 'frame',
      artifact_id: 'fbad',
      gold_task_id: 'B-07',
      match_type: 'exact',
    });
  });
});

describe('assertNoGoldSubstring — skill-body leakage (03 C1)', () => {
  it('flags a Phase-A skill body that smuggles a Phase-B gold', () => {
    const leaky: Artifact[] = [
      { kind: 'skill_body', id: 'sbad', text: '# rebook\nFor this customer, flight UA-915 rebooked to 2026-07-04.' },
    ];
    const r = assertNoGoldSubstring(leaky, golds);
    expect(r.passed).toBe(false);
    expect(r.hits[0].artifact_kind).toBe('skill_body');
    expect(r.hits[0].gold_task_id).toBe('B-12');
  });
});

describe('assertNoGoldSubstring — normalized-only leakage (case/spacing/punctuation)', () => {
  it('catches a gold that only matches after normalization', () => {
    // gold "The refund total is $342.18" re-cased + re-punctuated + re-spaced.
    const leaky: Artifact[] = [
      { kind: 'write_back', id: 'wb', text: 'THE  REFUND   TOTAL is 342 18 dollars' },
    ];
    // The gold normalizes to "the refund total is 342 18"; the artifact normalizes
    // to "the refund total is 342 18 dollars" → normalized containment hit.
    const r = assertNoGoldSubstring(leaky, golds);
    expect(r.passed).toBe(false);
    expect(r.hits[0].match_type).toBe('normalized');
    expect(r.hits[0].artifact_kind).toBe('write_back');
  });
});

describe('assertNoGoldSubstring — user-turn paraphrase boundary (03 C4)', () => {
  it('a banked user turn echoing the gold surface form is caught by the normalized gate', () => {
    const leaky: Artifact[] = [
      { kind: 'user_turn', id: 'ubad', text: 'so the refund total IS $342.18, right?' },
    ];
    const r = assertNoGoldSubstring(leaky, golds);
    expect(r.passed).toBe(false);
    expect(r.hits[0].artifact_kind).toBe('user_turn');
    // (Semantic paraphrase that shares no surface tokens is the embedding gate's
    //  job — see embedding-gate.test.ts. The substring gate owns surface forms.)
  });
});

describe('assertNoGoldSubstring — short-gold guard (avoid trivial false positives)', () => {
  it('ignores golds whose normalized form is shorter than the min length', () => {
    const shortGold: Gold[] = [{ task_id: 'B-yes', text: 'Yes' }];
    const arts: Artifact[] = [{ kind: 'frame', id: 'f', text: 'Yes, I can help with that.' }];
    const r = assertNoGoldSubstring(arts, shortGold, { minGoldChars: 8 });
    expect(r.passed).toBe(true);
    expect(r.skipped_short_golds).toContain('B-yes');
  });
});

describe('assertNoGoldSubstring — multiple hits across artifacts and golds', () => {
  it('reports every (artifact, gold) hit, not just the first', () => {
    const leaky: Artifact[] = [
      { kind: 'frame', id: 'f1', text: 'The refund total is $342.18' },
      { kind: 'skill_body', id: 's1', text: 'flight UA-915 rebooked to 2026-07-04' },
    ];
    const r = assertNoGoldSubstring(leaky, golds);
    expect(r.passed).toBe(false);
    expect(r.hits).toHaveLength(2);
  });
});

describe('assertNoGoldSubstring — validation', () => {
  it('rejects a non-array artifacts argument', () => {
    expect(() => assertNoGoldSubstring(null as unknown as Artifact[], golds)).toThrow(/array of artifacts/);
  });
  it('rejects a non-array golds argument', () => {
    expect(() => assertNoGoldSubstring(cleanArtifacts, null as unknown as Gold[])).toThrow(/array of golds/);
  });
  it('rejects a gold missing text', () => {
    const bad = [{ task_id: 'x' }] as unknown as Gold[];
    expect(() => assertNoGoldSubstring(cleanArtifacts, bad)).toThrow(/gold text must be a string/);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run benchmarks/harness/tests/firewall/substring-gate.test.ts`
Expected: FAIL — module `../../src/firewall/substring-gate.js` does not exist.

- [ ] **Step 3: Implement**

Create `benchmarks/harness/src/firewall/substring-gate.ts`:

```typescript
/**
 * Gold-substring gate — the leakage firewall's spine (02 §5.2, 03 C1/C4/C6).
 *
 * Scans EVERY written artifact (frames, skill bodies, write-back, identity,
 * awareness, user turns — 03 C1) for EVERY Phase-B gold answer, in BOTH:
 *   - exact form (raw `includes` — catches verbatim copies), and
 *   - normalized form (`normalizeForMatch` on both sides — catches case/spacing/
 *     punctuation/Unicode re-encodings that defeat a naive `includes`).
 *
 * A single hit ⇒ `passed=false`. Per 03 C6, do NOT rely on mechanism-spread as a
 * defense; this gate (plus the embedding gate) IS the defense, so it is exhaustive:
 * it reports ALL (artifact, gold) hits, not just the first.
 *
 * Short-gold guard: a 1-3 token gold ("Yes", "$50") would false-positive on
 * ordinary text. Golds whose NORMALIZED length is below `minGoldChars` are
 * skipped by the substring gate and recorded in `skipped_short_golds` — they are
 * the embedding gate's responsibility (semantic match), and the caller MUST run
 * the embedding gate (it does, per the firewall wiring in Plan 08).
 *
 * Pure + deterministic. Does NOT throw on a finding — it returns a report so the
 * caller can emit a per-row audit event (03 C8) before deciding to halt.
 */

import { normalizeForMatch } from './normalize.js';
import { collectArtifactTexts, type Artifact } from './artifact.js';

export interface Gold {
  /** Phase-B task this gold belongs to (for the audit trail). */
  task_id: string;
  /** The gold answer string that must never appear in the mind. */
  text: string;
}

export interface SubstringGateOptions {
  /** Minimum normalized gold length to run the substring gate. Default 8.
   *  Shorter golds are deferred to the embedding gate (see module doc). */
  minGoldChars?: number;
}

export type SubstringMatchType = 'exact' | 'normalized';

export interface SubstringHit {
  artifact_kind: string;
  artifact_id: string;
  gold_task_id: string;
  match_type: SubstringMatchType;
}

export interface SubstringGateResult {
  /** True iff zero hits across all (artifact, gold) pairs. */
  passed: boolean;
  hits: SubstringHit[];
  /** task_ids skipped because their normalized form was shorter than minGoldChars. */
  skipped_short_golds: string[];
  n_artifacts: number;
  n_golds: number;
  min_gold_chars: number;
}

const DEFAULT_MIN_GOLD_CHARS = 8;

export function assertNoGoldSubstring(
  artifacts: readonly Artifact[],
  golds: readonly Gold[],
  options: SubstringGateOptions = {},
): SubstringGateResult {
  if (!Array.isArray(golds)) {
    throw new Error('assertNoGoldSubstring requires an array of golds');
  }
  const minGoldChars = options.minGoldChars ?? DEFAULT_MIN_GOLD_CHARS;
  // collectArtifactTexts validates the artifacts array + each artifact shape.
  const flat = collectArtifactTexts(artifacts);

  // Pre-normalize each artifact once (O(A + G·A) total instead of O(G·A) normalizations).
  const normArtifacts = flat.map(a => ({ ...a, norm: normalizeForMatch(a.text) }));

  const hits: SubstringHit[] = [];
  const skipped_short_golds: string[] = [];

  for (const gold of golds) {
    if (typeof gold?.text !== 'string') {
      throw new Error(`gold text must be a string (task ${gold?.task_id})`);
    }
    if (typeof gold.task_id !== 'string') {
      throw new Error('gold task_id must be a string');
    }
    const normGold = normalizeForMatch(gold.text);
    if (normGold.length < minGoldChars) {
      skipped_short_golds.push(gold.task_id);
      continue;
    }
    for (let i = 0; i < flat.length; i++) {
      const art = flat[i];
      // Exact takes priority in the reported match_type; otherwise normalized.
      if (art.text.includes(gold.text)) {
        hits.push({
          artifact_kind: art.kind,
          artifact_id: art.id,
          gold_task_id: gold.task_id,
          match_type: 'exact',
        });
        continue;
      }
      if (normArtifacts[i].norm.includes(normGold)) {
        hits.push({
          artifact_kind: art.kind,
          artifact_id: art.id,
          gold_task_id: gold.task_id,
          match_type: 'normalized',
        });
      }
    }
  }

  return {
    passed: hits.length === 0,
    hits,
    skipped_short_golds,
    n_artifacts: flat.length,
    n_golds: golds.length,
    min_gold_chars: minGoldChars,
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run benchmarks/harness/tests/firewall/substring-gate.test.ts`
Expected: PASS (all describe blocks green).

- [ ] **Step 5: Commit**

```bash
git -C "$WORKTREE" add benchmarks/harness/src/firewall/substring-gate.ts benchmarks/harness/tests/firewall/substring-gate.test.ts
git -C "$WORKTREE" commit -m "feat(benchmarks): exact+normalized gold-substring gate over all artifacts"
```

---

### Task 4: Embedding-similarity gate (injected stub embedder, no network)

**Files:**
- Create: `benchmarks/harness/src/firewall/embedding-gate.ts`
- Test: `benchmarks/harness/tests/firewall/embedding-gate.test.ts`

> Why injected: `03` C1(b)/C4/C5 require an embedding-similarity gate (max cosine between any banked artifact and any Phase-B gold below a pre-registered threshold). The production embedder is network-bound (Ollama/LiteLLM). To keep this module unit-testable with **zero network**, the gate depends only on a structural `FirewallEmbedder` interface (`embedBatch(texts) → Promise<Float32Array[]>`, the exact subset of `@waggle/core`'s `Embedder`). Plan 08 injects the real local embedder; tests inject a deterministic stub. This mirrors `substrate.ts`'s injected-embedder pattern.

- [ ] **Step 1: Write the failing test**

Create `benchmarks/harness/tests/firewall/embedding-gate.test.ts`:

```typescript
/**
 * Embedding-similarity gate tests — cosine + max-similarity + threshold gate.
 * Uses a deterministic in-test stub embedder; NO network, NO @waggle/core.
 */
import { describe, expect, it } from 'vitest';
import {
  cosineSimilarity,
  maxEmbeddingSimilarity,
  assertEmbeddingGate,
  type FirewallEmbedder,
} from '../../src/firewall/embedding-gate.js';
import type { Artifact } from '../../src/firewall/artifact.js';
import type { Gold } from '../../src/firewall/substring-gate.js';

/**
 * Deterministic stub: maps a fixed lexicon of phrases to fixed unit vectors in
 * R^3 so similarities are known exactly. Unknown text → a near-orthogonal vector
 * derived from its length, so it is dissimilar to every lexicon vector.
 */
function makeStubEmbedder(): FirewallEmbedder {
  const lex: Record<string, [number, number, number]> = {
    'refund total 342': [1, 0, 0],
    'the refund is three hundred forty two dollars': [0.98, 0.199, 0], // ~0.98 cos with [1,0,0]
    'window seats preferred': [0, 1, 0],
    'i would like to return something': [0, 0, 1],
  };
  const toVec = (t: string): Float32Array => {
    const key = t.toLowerCase().replace(/[^a-z0-9 ]+/g, '').replace(/\s+/g, ' ').trim();
    const v = lex[key];
    if (v) return Float32Array.from(v);
    // deterministic orthogonal-ish fallback (tiny components on a 4th phantom axis
    // are dropped to 3D → near-zero cos with the lexicon unit vectors)
    const n = key.length || 1;
    return Float32Array.from([0.001 * (n % 3), 0.001 * (n % 5), 0.001 * (n % 7)]);
  };
  return {
    async embedBatch(texts: string[]): Promise<Float32Array[]> {
      return texts.map(toVec);
    },
  };
}

describe('cosineSimilarity', () => {
  it('is 1 for identical vectors', () => {
    expect(cosineSimilarity(Float32Array.from([1, 0, 0]), Float32Array.from([1, 0, 0]))).toBeCloseTo(1, 10);
  });
  it('is 0 for orthogonal vectors', () => {
    expect(cosineSimilarity(Float32Array.from([1, 0, 0]), Float32Array.from([0, 1, 0]))).toBeCloseTo(0, 10);
  });
  it('is symmetric', () => {
    const a = Float32Array.from([0.3, 0.4, 0.5]);
    const b = Float32Array.from([0.1, 0.9, 0.2]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(cosineSimilarity(b, a), 12);
  });
  it('throws on length mismatch', () => {
    expect(() => cosineSimilarity(Float32Array.from([1, 0]), Float32Array.from([1, 0, 0]))).toThrow(/same length/);
  });
  it('returns 0 when either vector is all-zero (no direction)', () => {
    expect(cosineSimilarity(Float32Array.from([0, 0, 0]), Float32Array.from([1, 0, 0]))).toBe(0);
  });
});

describe('maxEmbeddingSimilarity', () => {
  it('returns the max cosine between the artifact and any gold + which gold', async () => {
    const embedder = makeStubEmbedder();
    const artifact: Artifact = { kind: 'write_back', id: 'wb', text: 'the refund is three hundred forty two dollars' };
    const golds: Gold[] = [
      { task_id: 'B-07', text: 'refund total 342' },
      { task_id: 'B-99', text: 'window seats preferred' },
    ];
    const r = await maxEmbeddingSimilarity(artifact, golds, embedder);
    expect(r.max_similarity).toBeCloseTo(0.98, 2);
    expect(r.nearest_gold_task_id).toBe('B-07');
  });
});

describe('assertEmbeddingGate', () => {
  const embedder = makeStubEmbedder();
  const golds: Gold[] = [{ task_id: 'B-07', text: 'refund total 342' }];

  it('passes when every artifact is below the threshold', async () => {
    const arts: Artifact[] = [{ kind: 'user_turn', id: 'u1', text: 'i would like to return something' }];
    const r = await assertEmbeddingGate(arts, golds, embedder, 0.9);
    expect(r.passed).toBe(true);
    expect(r.hits).toEqual([]);
    expect(r.threshold).toBe(0.9);
  });

  it('flags a paraphrase artifact whose cosine exceeds the threshold (03 C4/C5)', async () => {
    const arts: Artifact[] = [
      { kind: 'write_back', id: 'wb', text: 'the refund is three hundred forty two dollars' },
    ];
    const r = await assertEmbeddingGate(arts, golds, embedder, 0.9);
    expect(r.passed).toBe(false);
    expect(r.hits).toHaveLength(1);
    expect(r.hits[0]).toMatchObject({
      artifact_kind: 'write_back',
      artifact_id: 'wb',
      nearest_gold_task_id: 'B-07',
    });
    expect(r.hits[0].similarity).toBeGreaterThan(0.9);
  });

  it('reports the max similarity per artifact even when it passes (for the audit row)', async () => {
    const arts: Artifact[] = [{ kind: 'frame', id: 'f1', text: 'i would like to return something' }];
    const r = await assertEmbeddingGate(arts, golds, embedder, 0.9);
    expect(r.per_artifact_max).toHaveLength(1);
    expect(r.per_artifact_max[0].artifact_id).toBe('f1');
    expect(typeof r.per_artifact_max[0].max_similarity).toBe('number');
  });

  it('rejects a threshold outside [0,1]', async () => {
    const arts: Artifact[] = [{ kind: 'frame', id: 'f', text: 'x' }];
    await expect(assertEmbeddingGate(arts, golds, embedder, 1.5)).rejects.toThrow(/threshold ∈ \[0, 1\]/);
  });

  it('rejects an embedder that returns the wrong batch length', async () => {
    const broken: FirewallEmbedder = { async embedBatch() { return []; } };
    const arts: Artifact[] = [{ kind: 'frame', id: 'f', text: 'x' }];
    await expect(assertEmbeddingGate(arts, golds, broken, 0.9)).rejects.toThrow(/embedBatch returned/);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run benchmarks/harness/tests/firewall/embedding-gate.test.ts`
Expected: FAIL — module `../../src/firewall/embedding-gate.js` does not exist.

- [ ] **Step 3: Implement**

Create `benchmarks/harness/src/firewall/embedding-gate.ts`:

```typescript
/**
 * Embedding-similarity gate (03 C1(b)/C4/C5).
 *
 * Catches SEMANTIC leakage the substring gate misses: a user-sim turn or skill
 * body that paraphrases a Phase-B gold (no shared surface tokens) but is
 * embedding-near it. For every artifact, computes the max cosine against any
 * Phase-B gold; any artifact above the PRE-REGISTERED threshold is a hit.
 *
 * Network-free by construction: depends only on `FirewallEmbedder`, the
 * structural subset of @waggle/core's `Embedder` the gate needs (`embedBatch`).
 * Plan 08 injects the real LOCAL embedder (Ollama/nomic-embed-text — same one
 * substrate.ts uses, $0, zero-egress); tests inject a deterministic stub. This
 * mirrors substrate.ts's injected-embedder pattern and keeps this module's unit
 * tests hermetic.
 *
 * The threshold is a pre-registration parameter, NOT hardcoded — the caller
 * supplies it from the frozen manifest (02 §5; "below a pre-registered
 * threshold, per row").
 */

import { collectArtifactTexts, type Artifact } from './artifact.js';
import type { Gold } from './substring-gate.js';

/** Structural subset of @waggle/core's Embedder the firewall needs. Defined
 *  locally so the firewall source imports nothing network-bound. */
export interface FirewallEmbedder {
  embedBatch(texts: string[]): Promise<Float32Array[]>;
}

export interface MaxSimilarityResult {
  max_similarity: number;
  nearest_gold_task_id: string;
}

export interface EmbeddingHit {
  artifact_kind: string;
  artifact_id: string;
  nearest_gold_task_id: string;
  similarity: number;
}

export interface PerArtifactMax {
  artifact_kind: string;
  artifact_id: string;
  max_similarity: number;
  nearest_gold_task_id: string;
}

export interface EmbeddingGateResult {
  /** True iff every artifact's max gold-similarity is ≤ threshold. */
  passed: boolean;
  hits: EmbeddingHit[];
  /** Max similarity per artifact (recorded for the audit row, pass or fail). */
  per_artifact_max: PerArtifactMax[];
  threshold: number;
  n_artifacts: number;
  n_golds: number;
}

export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) {
    throw new Error(`cosineSimilarity requires vectors of the same length; got ${a.length} and ${b.length}`);
  }
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0; // a zero vector has no direction
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export async function maxEmbeddingSimilarity(
  artifact: Artifact,
  golds: readonly Gold[],
  embedder: FirewallEmbedder,
): Promise<MaxSimilarityResult> {
  if (!Array.isArray(golds) || golds.length === 0) {
    throw new Error('maxEmbeddingSimilarity requires a non-empty golds array');
  }
  // collectArtifactTexts validates the single-artifact shape too.
  const [art] = collectArtifactTexts([artifact]);
  const goldTexts = golds.map(g => {
    if (typeof g?.text !== 'string') throw new Error(`gold text must be a string (task ${g?.task_id})`);
    return g.text;
  });
  const vectors = await embedder.embedBatch([art.text, ...goldTexts]);
  if (!Array.isArray(vectors) || vectors.length !== goldTexts.length + 1) {
    throw new Error(`embedBatch returned ${Array.isArray(vectors) ? vectors.length : 'non-array'}; expected ${goldTexts.length + 1}`);
  }
  const artVec = vectors[0];
  let max = -Infinity;
  let nearest = golds[0].task_id;
  for (let i = 0; i < golds.length; i++) {
    const sim = cosineSimilarity(artVec, vectors[i + 1]);
    if (sim > max) {
      max = sim;
      nearest = golds[i].task_id;
    }
  }
  return { max_similarity: max, nearest_gold_task_id: nearest };
}

export async function assertEmbeddingGate(
  artifacts: readonly Artifact[],
  golds: readonly Gold[],
  embedder: FirewallEmbedder,
  threshold: number,
): Promise<EmbeddingGateResult> {
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
    throw new Error(`assertEmbeddingGate requires threshold ∈ [0, 1]; got ${threshold}`);
  }
  if (!Array.isArray(golds) || golds.length === 0) {
    throw new Error('assertEmbeddingGate requires a non-empty golds array');
  }
  const flat = collectArtifactTexts(artifacts);
  const goldTexts = golds.map(g => {
    if (typeof g?.text !== 'string') throw new Error(`gold text must be a string (task ${g?.task_id})`);
    return g.text;
  });

  // One batch call: [all artifact texts..., all gold texts...].
  const inputs = [...flat.map(a => a.text), ...goldTexts];
  const vectors = await embedder.embedBatch(inputs);
  if (!Array.isArray(vectors) || vectors.length !== inputs.length) {
    throw new Error(`embedBatch returned ${Array.isArray(vectors) ? vectors.length : 'non-array'}; expected ${inputs.length}`);
  }
  const artVecs = vectors.slice(0, flat.length);
  const goldVecs = vectors.slice(flat.length);

  const hits: EmbeddingHit[] = [];
  const per_artifact_max: PerArtifactMax[] = [];
  for (let i = 0; i < flat.length; i++) {
    let max = -Infinity;
    let nearest = golds[0].task_id;
    for (let j = 0; j < golds.length; j++) {
      const sim = cosineSimilarity(artVecs[i], goldVecs[j]);
      if (sim > max) {
        max = sim;
        nearest = golds[j].task_id;
      }
    }
    per_artifact_max.push({
      artifact_kind: flat[i].kind,
      artifact_id: flat[i].id,
      max_similarity: max,
      nearest_gold_task_id: nearest,
    });
    if (max > threshold) {
      hits.push({
        artifact_kind: flat[i].kind,
        artifact_id: flat[i].id,
        nearest_gold_task_id: nearest,
        similarity: max,
      });
    }
  }

  return {
    passed: hits.length === 0,
    hits,
    per_artifact_max,
    threshold,
    n_artifacts: flat.length,
    n_golds: golds.length,
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run benchmarks/harness/tests/firewall/embedding-gate.test.ts`
Expected: PASS (all describe blocks green).

- [ ] **Step 5: Commit**

```bash
git -C "$WORKTREE" add benchmarks/harness/src/firewall/embedding-gate.ts benchmarks/harness/tests/firewall/embedding-gate.test.ts
git -C "$WORKTREE" commit -m "feat(benchmarks): embedding-similarity firewall gate (injected embedder, pre-reg threshold)"
```

---

### Task 5: Frozen-mind hash (deterministic)

**Files:**
- Create: `benchmarks/harness/src/firewall/hash-mind.ts`
- Test: `benchmarks/harness/tests/firewall/hash-mind.test.ts`

> Why (`02` §5.4, `03` C8): the Mode-1 shared frozen mind must be byte-identical across arms, so the run records a deterministic content hash per row. `hashMind` hashes the SQLite mind-DB **bytes** (accepting either a file path or raw bytes), so two arms reading the same DB file produce the same hash and any tamper changes it. SHA-256 via `node:crypto` — no dep.

- [ ] **Step 1: Write the failing test**

Create `benchmarks/harness/tests/firewall/hash-mind.test.ts`:

```typescript
/**
 * Frozen-mind hash tests — deterministic SHA-256 over the mind-DB bytes.
 * Uses a per-test tmpdir (runner-lock.test.ts idiom).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { hashMind } from '../../src/firewall/hash-mind.js';

let tmpDir: string;
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-fw-hash-'));
});
afterEach(() => {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
});

describe('hashMind', () => {
  it('hashes raw bytes deterministically (same bytes → same hash)', () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5]);
    expect(hashMind(bytes)).toBe(hashMind(Uint8Array.from(bytes)));
  });

  it('produces the known SHA-256 of a fixed byte string', () => {
    // SHA-256("waggle") = the value below (verified separately via node crypto).
    const h = hashMind(new TextEncoder().encode('waggle'));
    expect(h).toBe('cb59cdca5b7d0d895e36c5ad0a9b3c5e2d2c7d3b1f0c6f6b3d7d9b9e2a7c1f6a');
    // NOTE: replace the expected literal in Step 1.5 below with the real digest.
  });

  it('a file path and its bytes hash identically', () => {
    const p = path.join(tmpDir, 'mind.db');
    const bytes = new Uint8Array([10, 20, 30, 40]);
    fs.writeFileSync(p, bytes);
    expect(hashMind(p)).toBe(hashMind(bytes));
  });

  it('detects a single-byte tamper', () => {
    const a = new Uint8Array([0, 0, 0, 0]);
    const b = new Uint8Array([0, 0, 1, 0]);
    expect(hashMind(a)).not.toBe(hashMind(b));
  });

  it('returns a 64-char lowercase hex string', () => {
    const h = hashMind(new Uint8Array([7]));
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it('throws on a missing file path', () => {
    expect(() => hashMind(path.join(tmpDir, 'does-not-exist.db'))).toThrow(/mind DB not found/);
  });

  it('throws on a non-string, non-bytes argument', () => {
    expect(() => hashMind(42 as unknown as string)).toThrow(/file path or a Uint8Array/);
  });
});
```

- [ ] **Step 1.5: Pin the known-digest fixture (no guessing)**

The expected SHA-256 literal in the "known SHA-256" test MUST be the real digest, not a placeholder. Compute it exactly:

Run: `node -e "console.log(require('crypto').createHash('sha256').update(Buffer.from('waggle')).digest('hex'))"`
Expected output: a 64-char hex string. Copy it verbatim into the test, replacing the literal `'cb59cdca...'`, and delete the `// NOTE:` line.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run benchmarks/harness/tests/firewall/hash-mind.test.ts`
Expected: FAIL — module `../../src/firewall/hash-mind.js` does not exist.

- [ ] **Step 3: Implement**

Create `benchmarks/harness/src/firewall/hash-mind.ts`:

```typescript
/**
 * Deterministic frozen-mind hash (02 §5.4, 03 C8).
 *
 * Mode-1's shared frozen mind must be byte-identical across every arm; the run
 * records this content hash per row so the audit proves the same substrate fed
 * every model and that nothing wrote to it during Phase B. We hash the SQLite
 * mind-DB BYTES (SHA-256), so:
 *   - two arms reading the same file → the same hash, and
 *   - any tamper (a stray write-back, a different build) → a different hash.
 *
 * Accepts a file path (read from disk) OR raw bytes (for in-memory / test use).
 *
 * Caveat for the Plan-08 caller: hash the DB only when it is QUIESCENT (handle
 * closed / checkpointed). SQLite WAL mode keeps recent writes in a `-wal`
 * sidecar, so hashing the main `.db` mid-transaction can miss bytes. Plan 08
 * must close the MindDB (or `PRAGMA wal_checkpoint(TRUNCATE)`) before calling
 * hashMind on the path. This module hashes exactly the bytes it is given.
 */

import { createHash } from 'node:crypto';
import fs from 'node:fs';

export function hashMind(dbPathOrBytes: string | Uint8Array): string {
  let bytes: Uint8Array;
  if (typeof dbPathOrBytes === 'string') {
    if (!fs.existsSync(dbPathOrBytes)) {
      throw new Error(`mind DB not found at ${dbPathOrBytes}`);
    }
    bytes = fs.readFileSync(dbPathOrBytes);
  } else if (dbPathOrBytes instanceof Uint8Array) {
    bytes = dbPathOrBytes;
  } else {
    throw new Error('hashMind requires a file path or a Uint8Array');
  }
  return createHash('sha256').update(bytes).digest('hex');
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run benchmarks/harness/tests/firewall/hash-mind.test.ts`
Expected: PASS (all cases green, including the pinned known-digest literal from Step 1.5).

- [ ] **Step 5: Commit**

```bash
git -C "$WORKTREE" add benchmarks/harness/src/firewall/hash-mind.ts benchmarks/harness/tests/firewall/hash-mind.test.ts
git -C "$WORKTREE" commit -m "feat(benchmarks): deterministic frozen-mind SHA-256 hash"
```

---

### Task 6: Per-row audit emitter (`events.jsonl`)

**Files:**
- Create: `benchmarks/harness/src/firewall/emit.ts`
- Test: `benchmarks/harness/tests/firewall/emit.test.ts`

> Why (`03` C8): "emit each assertion's pass/fail into `events.jsonl` per row so the audit proves they ran on the priced run." This emitter appends one canonical JSONL line per firewall assertion. It mirrors the runner's `JSON.stringify` + file-write idiom but uses **append** (one line per assertion) and a fixed `event` tag so the offline audit can grep them.

- [ ] **Step 1: Write the failing test**

Create `benchmarks/harness/tests/firewall/emit.test.ts`:

```typescript
/**
 * Firewall audit-emitter tests — append one JSONL line per assertion (03 C8).
 * Per-test tmpdir; round-trips the written lines back.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  emitFirewallAssertion,
  type FirewallAssertionRow,
} from '../../src/firewall/emit.js';

let tmpDir: string;
let eventsPath: string;
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-fw-emit-'));
  eventsPath = path.join(tmpDir, 'events.jsonl');
});
afterEach(() => {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
});

function readLines(p: string): unknown[] {
  return fs.readFileSync(p, 'utf-8').split('\n').filter(Boolean).map(l => JSON.parse(l));
}

const baseRow: FirewallAssertionRow = {
  row_id: 'B-07#trial0',
  mind_hash: 'a'.repeat(64),
  assertion: 'gold_substring',
  passed: true,
  detail: { hits: 0, n_artifacts: 120, n_golds: 300 },
};

describe('emitFirewallAssertion', () => {
  it('creates the file and writes one parseable JSONL line', () => {
    emitFirewallAssertion(eventsPath, baseRow);
    const lines = readLines(eventsPath);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      event: 'firewall.assertion',
      row_id: 'B-07#trial0',
      assertion: 'gold_substring',
      passed: true,
      mind_hash: 'a'.repeat(64),
    });
  });

  it('stamps an ISO-8601 timestamp', () => {
    emitFirewallAssertion(eventsPath, baseRow);
    const [line] = readLines(eventsPath) as Array<{ ts: string }>;
    expect(() => new Date(line.ts).toISOString()).not.toThrow();
    expect(new Date(line.ts).toISOString()).toBe(line.ts);
  });

  it('appends (does not truncate) across multiple calls, preserving order', () => {
    emitFirewallAssertion(eventsPath, { ...baseRow, assertion: 'gold_substring' });
    emitFirewallAssertion(eventsPath, { ...baseRow, assertion: 'embedding_similarity', passed: false });
    emitFirewallAssertion(eventsPath, { ...baseRow, assertion: 'mind_hash' });
    const lines = readLines(eventsPath) as Array<{ assertion: string; passed: boolean }>;
    expect(lines.map(l => l.assertion)).toEqual(['gold_substring', 'embedding_similarity', 'mind_hash']);
    expect(lines[1].passed).toBe(false);
  });

  it('writes exactly one newline-terminated line per call (no JSON spanning lines)', () => {
    emitFirewallAssertion(eventsPath, baseRow);
    const raw = fs.readFileSync(eventsPath, 'utf-8');
    expect(raw.endsWith('\n')).toBe(true);
    expect(raw.trimEnd().includes('\n')).toBe(false);
  });

  it('rejects an unknown assertion name', () => {
    const bad = { ...baseRow, assertion: 'totally_made_up' } as unknown as FirewallAssertionRow;
    expect(() => emitFirewallAssertion(eventsPath, bad)).toThrow(/assertion must be one of/);
  });

  it('rejects a non-boolean passed', () => {
    const bad = { ...baseRow, passed: 'yes' } as unknown as FirewallAssertionRow;
    expect(() => emitFirewallAssertion(eventsPath, bad)).toThrow(/passed must be a boolean/);
  });

  it('rejects an empty events path', () => {
    expect(() => emitFirewallAssertion('', baseRow)).toThrow(/eventsJsonlPath/);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run benchmarks/harness/tests/firewall/emit.test.ts`
Expected: FAIL — module `../../src/firewall/emit.js` does not exist.

- [ ] **Step 3: Implement**

Create `benchmarks/harness/src/firewall/emit.ts`:

```typescript
/**
 * Firewall audit emitter (03 C8).
 *
 * Appends ONE JSONL line per firewall assertion to the run's events.jsonl so the
 * offline audit proves every gate actually ran on the priced run. Each line is a
 * self-contained, newline-terminated JSON object tagged `event: "firewall.assertion"`
 * and carrying the per-row mind hash (02 §5.4/§5.7) — so the audit can confirm the
 * SAME frozen mind was scanned that the model read.
 *
 * Append-only + flush-per-line: a crash mid-run still leaves a valid prefix of
 * complete lines (matches the harness's per-row JSONL discipline).
 */

import fs from 'node:fs';

export const FIREWALL_ASSERTIONS = [
  'gold_substring',
  'embedding_similarity',
  'mind_hash',
  'scope_binding',
] as const;

export type FirewallAssertionName = (typeof FIREWALL_ASSERTIONS)[number];

export interface FirewallAssertionRow {
  /** The run row this assertion applies to (e.g. "<task_id>#trial<k>"). */
  row_id: string;
  /** SHA-256 of the frozen mind scanned (from hashMind). */
  mind_hash: string;
  /** Which firewall gate this line reports. */
  assertion: FirewallAssertionName;
  /** Gate verdict for this row. */
  passed: boolean;
  /** Gate-specific structured detail (hit counts, thresholds, etc.). */
  detail: Readonly<Record<string, unknown>>;
}

const ASSERTION_SET: ReadonlySet<string> = new Set<string>(FIREWALL_ASSERTIONS);

export function emitFirewallAssertion(eventsJsonlPath: string, row: FirewallAssertionRow): void {
  if (typeof eventsJsonlPath !== 'string' || eventsJsonlPath.length === 0) {
    throw new Error('emitFirewallAssertion requires a non-empty eventsJsonlPath');
  }
  if (!row || typeof row.row_id !== 'string' || row.row_id.length === 0) {
    throw new Error('firewall row requires a non-empty row_id');
  }
  if (typeof row.mind_hash !== 'string') {
    throw new Error('firewall row requires a string mind_hash');
  }
  if (!ASSERTION_SET.has(row.assertion)) {
    throw new Error(`assertion must be one of ${FIREWALL_ASSERTIONS.join(', ')}; got ${row.assertion}`);
  }
  if (typeof row.passed !== 'boolean') {
    throw new Error('firewall row passed must be a boolean');
  }

  const line = JSON.stringify({
    event: 'firewall.assertion',
    ts: new Date().toISOString(),
    row_id: row.row_id,
    mind_hash: row.mind_hash,
    assertion: row.assertion,
    passed: row.passed,
    detail: row.detail ?? {},
  });
  fs.appendFileSync(eventsJsonlPath, `${line}\n`, 'utf-8');
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run benchmarks/harness/tests/firewall/emit.test.ts`
Expected: PASS (all cases green).

- [ ] **Step 5: Commit**

```bash
git -C "$WORKTREE" add benchmarks/harness/src/firewall/emit.ts benchmarks/harness/tests/firewall/emit.test.ts
git -C "$WORKTREE" commit -m "feat(benchmarks): per-row firewall audit emitter to events.jsonl"
```

---

### Task 7: Barrel export + full-module verification

**Files:**
- Create: `benchmarks/harness/src/firewall/index.ts`
- Test: `benchmarks/harness/tests/firewall/index.test.ts`

- [ ] **Step 1: Create the barrel**

Create `benchmarks/harness/src/firewall/index.ts`:

```typescript
/**
 * Leakage-firewall module barrel (06-PLAN-leakage-firewall.md).
 *
 * The credibility backbone of the harness-SOTA benchmark: ex-ante invariants
 * (02 §5) implemented + unit-tested BEFORE pre-registration (03 C8), covering
 * ALL written artifacts (03 C1). Plan 08 wires these into the run loop and emits
 * one events.jsonl row per assertion per run row.
 */

export { normalizeForMatch } from './normalize.js';

export { collectArtifactTexts, ARTIFACT_KINDS } from './artifact.js';
export type { Artifact, ArtifactKind, ArtifactText } from './artifact.js';

export { assertNoGoldSubstring } from './substring-gate.js';
export type {
  Gold,
  SubstringGateOptions,
  SubstringMatchType,
  SubstringHit,
  SubstringGateResult,
} from './substring-gate.js';

export { cosineSimilarity, maxEmbeddingSimilarity, assertEmbeddingGate } from './embedding-gate.js';
export type {
  FirewallEmbedder,
  MaxSimilarityResult,
  EmbeddingHit,
  PerArtifactMax,
  EmbeddingGateResult,
} from './embedding-gate.js';

export { hashMind } from './hash-mind.js';

export { emitFirewallAssertion, FIREWALL_ASSERTIONS } from './emit.js';
export type { FirewallAssertionName, FirewallAssertionRow } from './emit.js';
```

- [ ] **Step 2: Add a barrel-import test**

Create `benchmarks/harness/tests/firewall/index.test.ts`:

```typescript
/**
 * Barrel test — the firewall index exposes the full public surface.
 */
import { describe, expect, it } from 'vitest';
import * as firewall from '../../src/firewall/index.js';

describe('firewall barrel', () => {
  it('re-exports every public function', () => {
    expect(typeof firewall.normalizeForMatch).toBe('function');
    expect(typeof firewall.collectArtifactTexts).toBe('function');
    expect(typeof firewall.assertNoGoldSubstring).toBe('function');
    expect(typeof firewall.cosineSimilarity).toBe('function');
    expect(typeof firewall.maxEmbeddingSimilarity).toBe('function');
    expect(typeof firewall.assertEmbeddingGate).toBe('function');
    expect(typeof firewall.hashMind).toBe('function');
    expect(typeof firewall.emitFirewallAssertion).toBe('function');
  });

  it('re-exports the constant tables', () => {
    expect(firewall.ARTIFACT_KINDS).toContain('skill_body');
    expect(firewall.FIREWALL_ASSERTIONS).toContain('gold_substring');
  });
});
```

- [ ] **Step 3: Run the full firewall test suite + typecheck**

Run: `npx vitest run benchmarks/harness/tests/firewall/`
Expected: PASS — all firewall describe blocks across normalize / artifact / substring-gate / embedding-gate / hash-mind / emit / index green.

Run: `npx tsc --noEmit --project benchmarks/harness/tsconfig.json`
Expected: exit 0 (no type errors). NOTE: the harness `tsconfig.json` `exclude`s `tests`, so this typechecks `src/firewall/**` only — the test files are typechecked by vitest at run time. If vitest surfaced no type errors and tsc exits 0, both source and tests are sound.

- [ ] **Step 4: Run the whole harness test suite to confirm no regression**

Run: `npx vitest run`
Expected: PASS — the existing harness suites (stats, failure-taxonomy, cells, ingest, etc.) still green, plus the new `firewall` suite.

- [ ] **Step 5: Commit**

```bash
git -C "$WORKTREE" add benchmarks/harness/src/firewall/index.ts benchmarks/harness/tests/firewall/index.test.ts
git -C "$WORKTREE" commit -m "feat(benchmarks): export the leakage-firewall barrel"
```

---

## Self-Review

**Spec coverage:**
- `02` §5.1 (agent-earned content only) → the `Artifact` union enumerates the legitimate written-content kinds; gold/oracle metadata is the `Gold` input the gates scan *against*, never an artifact kind. ✓ (Enforcement that the mind was *built* from agent-earned content is the Plan-08 wiring's job; this module provides the assertions it calls.)
- `02` §5.2 / `03` C1(a) (assert no gold substring, exact + normalized, over ALL artifacts incl. skill bodies + write-back + identity + user turns) → Task 1 (normalizer) + Task 3 (`assertNoGoldSubstring`), with explicit skill-body (C1) and user-turn (C4) cases. ✓
- `03` C1(b) / C4 / C5 (embedding-similarity gate, pre-registered threshold, per-row max-sim) → Task 4 (`maxEmbeddingSimilarity` + `assertEmbeddingGate`, threshold is a required arg sourced from the manifest, `per_artifact_max` recorded for the audit). ✓
- `02` §5.4 / `03` C8 (frozen-mind hash, recorded per row) → Task 5 (`hashMind`, path-or-bytes, deterministic SHA-256). ✓
- `03` C8 (emit each assertion's pass/fail into `events.jsonl` per row) → Task 6 (`emitFirewallAssertion`). ✓
- `02` §6 / `03` C5 (near-dup similarity GATE on the headline set) → the embedding gate IS that mechanism: max cosine(gold, artifact) > pre-reg cutoff ⇒ hit/exclude. The *per-task headline-set exclusion loop* (compute over top-K retrieved Phase-A artifacts, exclude & report count) is the Plan-08 caller using `assertEmbeddingGate`/`maxEmbeddingSimilarity`; this module supplies the gate primitive. Flagged. ✓
- `01` §9 (scope-bound recall; injection-scan recalled memory; local embedder/T=0/seed) → the `scope_binding` assertion name is reserved in `FIREWALL_ASSERTIONS` for the Plan-08 spot-audit emitter; injection-scan reuses production `scanForInjection` in the recall path (Plan 08, not re-implemented here per CLAUDE.md §8 "don't recreate"); local-embedder/T=0/seed is enforced by Plan 08's embedder injection (this module is embedder-agnostic by design). Flagged. ✓
- mirrors sibling Plan 04 style (Mulberry32 idiom referenced, throw-style validation, `.js` specifiers, vitest, explicit exported types, no `any`, immutable returns, `git -C "$WORKTREE"` commits, conventional-commit subjects). ✓

**Out of scope (flagged, belongs to Plan 08, not a gap in this module):**
- `03` C2 per-task **re-derivability** gate (needs the live memory-OFF arm / unbounded-budget probe). NOT buildable as a pure function — Plan 08.
- `03` C7 goal/structure-overlap classifier + negative-control family. NOT a firewall assertion — Plan 08.
- The run-loop wiring that calls these gates over the real mind's artifacts and writes the `events.jsonl` rows — Plan 08.

**Placeholder scan:** none. The one literal that could be a placeholder — the known SHA-256 in `hash-mind.test.ts` — has an explicit pinning step (Task 5 Step 1.5) with the exact `node -e` command to compute the real digest before the test is run; the in-text literal is marked for replacement and the test will fail loudly until it is pinned. Every other code step is complete; every command has an exact expected result.

**Type consistency:** `Artifact{kind,id,text}` + `ArtifactText` + `ArtifactKind` consistent across artifact.ts / substring-gate / embedding-gate / barrel. `Gold{task_id,text}` defined once in substring-gate.ts, imported by embedding-gate + tests. `FirewallEmbedder{embedBatch}` is the structural subset of `@waggle/core` `Embedder` (verified: `embed`/`embedBatch`/`dimensions` — we depend only on `embedBatch`, so the real embedder satisfies it). Result types (`SubstringGateResult`, `EmbeddingGateResult`, `FirewallAssertionRow`) and function names (`normalizeForMatch`, `collectArtifactTexts`, `assertNoGoldSubstring`, `cosineSimilarity`, `maxEmbeddingSimilarity`, `assertEmbeddingGate`, `hashMind`, `emitFirewallAssertion`) spelled identically in impl, tests, and barrel. ✓
