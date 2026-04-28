---
report_id: 2026-04-28-gepa-faza1-gen-1-investigate
date: 2026-04-28
checkpoint: Gen 1 partial — Investigate (mid-run HALT triggered + critical wiring bug discovered)
manifest_anchor: manifest-v7-gepa-faza1
manifest_v7_sha_amendment_7: bc0bcf9bd8b0c8344b25e5f8ab15b0475039ba28a1f782ebffe4cc1c4ff7d1de
predecessor: checkpoint-a-report.md (Checkpoint A v2 LOCKED ANOMALOUS, PM ratified Option C)
status: HALT-AND-PM (Amendment 7 §checkpoint_b_tightened.qwen_retrieval_engagement_regression triggered + REGISTRY-injection bug invalidated all mutation candidate evals)
authority: PM (Marko Markovic)
binding_directive: "If any of 3 mid-run thresholds trigger, halt immediately and file Investigate report — do NOT auto-recover" (PM brief 2026-04-28 RATIFY GO message)
---

# Gen 1 Investigate Report — Critical wiring bug + mid-run halt (CC-2)

## TL;DR

Gen 1 partial run (`b5avslp51`, exit 0) halted at **11/30 evals** after running for ~9 minutes. Two findings, ranked by severity:

1. **CRITICAL — REGISTRY-injection bug invalidates all mutation candidate evals.** All 16 mutation-candidate evals attempted (claude::gen1-v1/v2 × 8 each) FAILED with `prompt-shapes selector: override "<shape>-gen1-v1" not in REGISTRY`. Despite the runner mutating `REGISTRY[name] = shape` immediately before each call, the agent-loop's view of REGISTRY still showed only the 5 baselines. Root cause: pending investigation; ESM module-identity OR bound-reference snapshot OR Object.freeze-style barrier. Confirms with 100% reproducibility in this run (16/16 attempted mutation evals failed identically).

2. **Mid-run halt triggered (Amendment 7 §checkpoint_b_tightened.qwen_retrieval_engagement_regression).** qwen-thinking aggregated retrieval mean = 1.000 over N=3 evals < per-shape NULL baseline 1.12 → HALT. With baseline N=3 sample at the noise floor (binomial CI on retrieval is ±large), this is variance-driven, NOT evolution signal. Notably: the 3 evals were qwen-thinking::baseline (NOT mutations — they couldn't run per finding #1).

The combination means **Gen 1 produced ZERO evolution data**: the only evals that completed were baselines (claude × 8, qwen-thinking × 3), and the mutation candidates never executed. Sunk cost $1.36; cumulative Faza 1 spend $26.54 of $115 cap; headroom $88.46.

**Per binding PM directive: HALT, do NOT auto-recover. Awaiting PM ratify on path forward.**

## §A — Run metadata

| Item | Value |
|---|---|
| Background job ID | `b5avslp51` |
| Wall clock | ~9 min (15:59 UTC start, 16:09 UTC halt) |
| Total cost | **$1.3572** |
| Evals completed | **11/30** (Checkpoint B target was 30) |
| Halt reason | Amendment 7 §checkpoint_b_tightened.qwen_retrieval_engagement_regression: shape=qwen-thinking mean=1.000 < NULL baseline 1.120 (n=3) |
| Manifest SHA at run | `bc0bcf9bd8b0c8344b25e5f8ab15b0475039ba28a1f782ebffe4cc1c4ff7d1de` (Amendment 7) |
| Cumulative Faza 1 spend post halt | **$26.54** ($25.18 pre-Gen-1 + $1.36 Gen 1 partial) |
| Headroom under $115 cap | **$88.46** |

## §B — What ran vs what didn't

### B.1 — Completed evals (11)

| Candidate | Variant | Shape | Evals | trio_strict_pass_II rate | Mean retrieval | Mean cost/eval |
|---|---|---|---|---|---|---|
| claude::baseline | baseline | claude | 8/8 | **100.0%** (8/8) | 1.375 | $0.1228 |
| qwen-thinking::baseline | baseline | qwen-thinking | 3/8 | 66.7% (2/3) | **1.000** | $0.1248 |

### B.2 — Failed evals (16) — REGISTRY-injection bug

All 16 attempted mutation-candidate evals failed instantly (~10ms each — never hit LLM API):

| Candidate | Variant | Outcome |
|---|---|---|
| claude::gen1-v1 | gen1-v1 | 8/8 FAIL: `prompt-shapes selector: override "claude-gen1-v1" not in REGISTRY. Available: claude, qwen-thinking, qwen-non-thinking, gpt, generic-simple` |
| claude::gen1-v2 | gen1-v2 | 8/8 FAIL: same pattern (`"claude-gen1-v2" not in REGISTRY`) |

### B.3 — Never attempted (skipped due to halt) — 93 evals

After 11 evals + 16 failed attempts, the runner halted on Amendment 7 mid-run threshold before reaching:
- qwen-thinking::gen1-v1 / gen1-v2 (16 evals)
- qwen-non-thinking::baseline / gen1-v1 / gen1-v2 (24 evals)
- gpt::baseline / gen1-v1 / gen1-v2 (24 evals)
- generic-simple::baseline / gen1-v1 / gen1-v2 (24 evals)
- Remaining qwen-thinking::baseline (5 evals)

These 93 evals would be needed to complete Checkpoint B (30) and full Gen 1 (120).

## §C — Critical finding: REGISTRY-injection bug

### C.1 — Symptom

Runner code at `benchmarks/gepa/scripts/faza-1/run-gen-1.ts:357`:
```typescript
(REGISTRY as any)[cand.promptShape.name] = cand.promptShape;
agentResult = await runRetrievalAgentLoop({
  ...
  promptShapeOverride: cand.promptShape.name,
} as any);
```

For `cand.promptShape.name = 'claude-gen1-v1'`, the mutation should populate `REGISTRY['claude-gen1-v1']`. The agent-loop's `selectShape(modelAlias, { override: 'claude-gen1-v1' })` then looks up `REGISTRY[options.override]` and should return the candidate shape. Instead, lookup returns undefined and throws:
> `prompt-shapes selector: override "claude-gen1-v1" not in REGISTRY. Available: claude, qwen-thinking, qwen-non-thinking, gpt, generic-simple`

### C.2 — Hypotheses (ranked)

**H1 (~50% credence) — ESM module identity mismatch.** The runner imports `REGISTRY` via deep relative path:
```typescript
import { REGISTRY } from '../../../../packages/agent/src/prompt-shapes/selector.js';
```

The agent-loop imports via package-internal path:
```typescript
import { selectShape, ..., type PromptShape } from './prompt-shapes/index.js';
```

Where `prompt-shapes/index.ts` re-exports from `./selector.js`. Under Node ESM, the resolved URL determines the module instance. If tsx normalizes these to different URLs (e.g., one with `file://` and one with `node:`-style or different drive-letter casing on Windows), the two imports yield separate REGISTRY objects.

**H2 (~30% credence) — Runner mutation didn't execute due to silent-throw.** The `(REGISTRY as any)[name] = ...` syntax bypasses TypeScript type checking but if REGISTRY is somehow frozen at runtime (Object.freeze() in selector.ts initialization OR via a hidden middleware), assignment would throw silently in strict mode. selector.ts:30 declares `export const REGISTRY: Record<string, PromptShape> = {...}` with no Object.freeze, so this is unlikely — but worth verifying with a probe assertion.

**H3 (~15% credence) — `loadCandidates()` mutation pattern is broken.** Looking at lines 357-358 of the runner:
```typescript
(REGISTRY as any)[cand.promptShape.name] = cand.promptShape;
```

`cand.promptShape` is loaded via `await import(pathToFileURL(filepath).href)`. The dynamic import returns a module namespace object. The runner finds the shape via `Object.values(mod).find(v => ...)`. If this is a getter-property or a frozen module-namespace export, assigning it INTO REGISTRY may produce a frozen reference that selectShape's strict-mode lookup doesn't return correctly.

**H4 (~5% credence) — Race condition with concurrent eval loops.** Single-threaded Node, only one eval at a time per the loop structure, so unlikely.

### C.3 — Diagnostic probe to confirm root cause

Before any fix: add a probe in runOneEval after the mutation:
```typescript
(REGISTRY as any)[cand.promptShape.name] = cand.promptShape;
log(`[probe] post-mutation REGISTRY keys: ${Object.keys(REGISTRY).join(',')}`);
log(`[probe] REGISTRY['${cand.promptShape.name}'] === undefined: ${REGISTRY[cand.promptShape.name] === undefined}`);
```

If both probes show the new key and non-undefined value, but selectShape still doesn't see it → H1 confirmed (module identity).
If probes show key missing or value undefined → H2 or H3 confirmed.

### C.4 — Recommended fixes (ranked)

**Fix A — Add explicit `registerShape(name, shape)` API in selector.ts (RECOMMENDED, lowest risk).**
```typescript
// selector.ts
export function registerShape(name: string, shape: PromptShape): void {
  REGISTRY[name] = shape;
}
```
Runner calls `registerShape(cand.promptShape.name, cand.promptShape)` instead of direct mutation. This collapses both module instances onto the same call site, sidestepping H1 if it exists.

Side-benefit: makes the registration intent explicit (auditable in code) rather than `as any` hack.

**Fix B — Pass PromptShape object directly via new agent-loop parameter.** Change `runRetrievalAgentLoop`'s config to accept `promptShapeObject?: PromptShape` alongside `promptShapeOverride?: string`. Selector returns the object directly without REGISTRY lookup. Higher risk: changes a binding interface.

**Fix C — Restructure runner to register all candidates upfront (before any agent call).** Move the REGISTRY mutation out of `runOneEval` into the initialization phase. May or may not fix H1; doesn't help H2/H3.

**Fix D — Static import of `gepa-evolved/*.ts` instead of dynamic import.** If H3 is the cause (frozen module-namespace export), changing dynamic import to a static import may unfreeze the value. Heavier refactor.

CC-2 recommends **Fix A** as the most surgical resolution — adds 4 lines to selector.ts + 1 line change in runner, doesn't disturb agent-loop interface.

## §D — Mid-run halt analysis

### D.1 — What the halt fired on

Amendment 7 §checkpoint_b_tightened.qwen_retrieval_engagement_regression:
> "Mean retrieval engagement on Qwen-targeted candidates drops below per-shape NULL baseline (qwen-thinking 1.12, qwen-non-thinking 1.25) at any aggregation point with ≥3 evals on that shape"

Triggered at qwen-thinking N=3, mean=1.000, NULL=1.12 → delta -0.120 < 0 → HALT.

### D.2 — Was the halt warranted?

**Mechanism: correct.** The condition fired exactly per spec. Code working as designed.

**Signal: noise-corrupted.**
- 3 evals all returned retrieval_calls=1 (1, 1, 1 → mean exactly 1.000)
- NULL baseline retrieved 1.12 over different sample of 8 evals on same instances at same seed
- Single-call-only behavior on 3 evals could be variance: same sample on NULL baseline showed 1.12 = ~1.0 with one or two 2-call evals
- BUT: the 3 evals were on instances `h3-F4-p4_vp_finance-stage_b`, `h3-F4-p2_cfo-stage_a`, `h3-F5-p4_vp_finance-stage_a`. NULL baseline data for these specific instances is not directly available without re-derivation; aggregate comparison is approximate.

**Conclusion:** Halt was procedurally correct but informationally underpowered. Pre-Amendment-7, this halt did not exist; Amendment 7 added it specifically to catch retrieval regression as a mechanistic signal. With N=3 the binomial CI is wide enough that any shape-baseline-only run could trip this on noise.

### D.3 — Recommendation: tune `QWEN_RETRIEVAL_REGRESSION_MIN_EVALS` post bug fix

Currently `QWEN_RETRIEVAL_REGRESSION_MIN_EVALS = 3`. Suggest raising to:
- **5** — narrows variance window before triggering
- OR aggregate across BOTH Qwen shapes (qwen-thinking + qwen-non-thinking together) before triggering, since the metric is "engagement gap" which is per-shape-class not per-shape

This adjustment would be a minor patch (Amendment 7.1 or rolled into Amendment 8) — non-binding fitness-function change, just halt-threshold tightening.

## §E — Δ-floor verdict (from summary)

Despite the bug-corrupted data, the runner computed Δ-floor verdict on what completed:

| Threshold | Verdict | Value |
|---|---|---|
| 1 — aggregate Tier 1 ≥+3pp | **PASS** | +3.41pp (claude=100% × 8 + qwen-thinking=66.7% × 3 weighted-mean = 0.909 vs NULL 0.875) |
| 2 — Qwen retrieval ≥+0.10 absolute | FAIL | -0.120 (qwen-thinking 1.0 vs NULL 1.12) |
| 3 — compound (Tier 1 ≥0pp AND Tier 2 ≥0.05) | FAIL | Tier 1 +3.41pp ✓, Tier 2 0.0 ✗ |

Overall: **PROCEED** (threshold 1 alone passes).

**BUT this verdict is not informative**: the +3.41pp signal comes from *baselines only* (claude::baseline 100% pass + qwen-thinking::baseline partial sample), not evolution. NO mutation candidate completed. The "PROCEED" verdict says "evolution moved the aggregate" but evolution wasn't tested. Δ-floor is procedurally PASS but mechanistically void.

CC-2 recommends PM treat Δ-floor as VOID-FOR-EVOLUTION-ANALYSIS pending bug fix and re-run.

## §F — Per-candidate tier breakdown (what we have)

```
claude::baseline       (8 evals): tier1=+12.5pp, tier2=N/A, tier3=0.10, aggregate=0.10
qwen-thinking::baseline (3 evals): tier1=-20.83pp, tier2=0 (1.0 ≤ 1.12 baseline), tier3=0.10, aggregate=0.10
```

claude::baseline is an outlier vs NULL data: NULL had claude at 87.5% (7/8), Gen 1 baseline ran 100% (8/8) — +12.5pp absolute, well within N=8 binomial variance.

qwen-thinking::baseline is the noise-driver: 2/3 = 66.7% pass on a small sample triggered Tier 1 = -20.83pp despite NULL showing 87.5% (7/8). Variance signal, not evolution.

Mutation candidates: zero data due to bug.

## §G — Path forward — PM ratify required

**Per binding PM directive: do NOT auto-recover.**

CC-2 presents three paths:

### G.1 — Option A: Fix-and-Resume (RECOMMENDED if H1 confirmed)

1. Diagnostic probe (§C.3) — confirm H1 vs H2/H3
2. Implement Fix A (`registerShape` API in selector.ts) — 4-line patch
3. Document in Amendment 8: "REGISTRY-injection mechanism corrected; mid-run halt threshold `QWEN_RETRIEVAL_REGRESSION_MIN_EVALS` raised to 5 (optional, recommended)"
4. Resume Gen 1: keep the 11 completed baseline evals (8 claude + 3 qwen-thinking) — they are valid baseline-shape data; restart from where halt fired
5. Cost: probe ~$0 (no LLM); fix ~10 LOC + tests; resume ~$3.50 to reach 30 evals
6. Total cumulative post fix-and-resume: ~$30.04

**Pros:** preserves $1.36 sunk; minimal additional cost; allows clean Gen 1 partial.

**Cons:** assumes the bug fix produces the correct REGISTRY behavior — if H2/H3 turn out to be cause, Fix A may not be sufficient.

### G.2 — Option B: Fix-and-Restart Fresh

1. Same fix as Option A
2. Discard the 11 sunk evals; restart Gen 1 from zero
3. Cost: ~$3.72 fresh Gen 1 partial = $4.96 cumulative new spend on Gen 1

**Pros:** clean Gen 1 partial dataset; no mixing of pre/post bug-fix evals; methodologically tightest.

**Cons:** $1.36 wasted (small absolute, ~6% of $26 Gen 1 budget); slightly more time.

### G.3 — Option C: Pause Faza 1 + Investigate REGISTRY architecture

1. No additional eval runs until REGISTRY-injection mechanism is robustly understood
2. Author Amendment 8 documenting bug + investigation results
3. Add regression tests for REGISTRY mutation across module boundaries
4. Consider Fix B (interface-level `promptShapeObject` param) as architecturally cleaner long-term

**Pros:** architecturally rigorous; prevents recurrence in Faza 2 + Phase 5
**Cons:** delays Gen 1 by ~1-2 sessions of investigation

CC-2 mild preference: **Option A** (assuming H1 turns out to be the cause), with explicit documented commitment to architectural cleanup (Fix B) post-Faza-1 to avoid recurrence.

## §H — What the halt does NOT mean

To avoid over-reading the data:
1. **Mutation candidates are NOT broken.** The candidates' file SHA + content invariance was verified at run start (all 10 passed mutation_validator). The bug is in injection, not the candidates themselves.
2. **§F.1 acceptance gate is NOT failed.** Acceptance is computed on full Gen 1 evals; we don't have any candidate evals, so the gate is undefined, not failed.
3. **The Δ-floor PROCEED verdict is NOT a green light.** It's a procedural verdict on partial data; mechanistically void due to missing mutation evals.
4. **The retrieval-regression halt is NOT a Phase-4.5-signal-reversal finding.** With N=3 baseline evals only, it's variance.

## §I — Audit chain

| Item | Path / SHA |
|---|---|
| This Investigate report | `D:/Projects/waggle-os-faza1-wt/benchmarks/results/gepa-faza1/gen-1/investigate-report.md` |
| Run summary JSON | `D:/Projects/waggle-os-faza1-wt/benchmarks/results/gepa-faza1/gen-1/gen-1-summary.json` |
| Run JSONL (11 records) | `D:/Projects/waggle-os-faza1-wt/benchmarks/results/gepa-faza1/gen-1/gen-1-eval.jsonl` |
| Run log | `D:/Projects/waggle-os-faza1-wt/benchmarks/results/gepa-faza1/gen-1/gen-1-run.log` |
| Manifest v7 SHA at run | `bc0bcf9bd8b0c8344b25e5f8ab15b0475039ba28a1f782ebffe4cc1c4ff7d1de` (Amendment 7) |
| Bug location | `benchmarks/gepa/scripts/faza-1/run-gen-1.ts:357` (`(REGISTRY as any)[cand.promptShape.name] = cand.promptShape`) |
| Selector source | `packages/agent/src/prompt-shapes/selector.ts:30` (REGISTRY declaration) |
| Cumulative Faza 1 spend | $26.54 of $115 cap; headroom $88.46 |

## §J — HALT criteria status

1. ✅ Investigate report committed (this file)
2. ✅ Sunk evals preserved as `gen-1-eval.jsonl` (audit chain)
3. ✅ Summary JSON written (mid-run halt details + Δ-floor verdict)
4. ⏳ **PM ratify path forward** (Option A / B / C per §G above)

---

**End of Investigate report. Standing AWAITING PM ratification on §G path forward before any further Gen 1 action. Per binding directive: NOT auto-recovering.**
