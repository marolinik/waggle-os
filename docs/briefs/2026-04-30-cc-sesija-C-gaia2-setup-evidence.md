# CC Sesija C — §0 Preflight Evidence (gaia2-setup-evidence.md)

**Evidence ID:** `cc-sesija-c-gaia2-setup-evidence-v1`
**Date:** 2026-04-30
**Author:** CC Sesija C
**Brief:** `briefs/2026-04-30-cc-sesija-C-gaia2-setup-dry-verification.md` (LOCKED)
**Status:** **§0 PARTIAL — HALT-AND-PM REQUIRED before §1 begins**
**Verdict summary:** §0.1 PASS · §0.2 **PARTIAL FAIL (brief contradiction)** · §0.3 **PAPER ESTIMATE at/above cap, actual probe deferred**
**Working tree state at evidence time:** waggle-os primary worktree on `phase-5-deployment-v2` with 1,282 unstaged changes (-52,062 LOC) matching main's shrunk state — **independent halt-and-PM required.**

---

## §0.1 — Gaia2 ARE platform availability — **PASS**

| Sub-item | Brief requirement | Verified evidence | Verdict |
|---|---|---|---|
| 1 | ARE platform repo accessible | `https://github.com/facebookresearch/meta-agents-research-environments` — Public, **MIT License**, 26 commits on main branch. Install methods: `uv` / `pip install meta-agents-research-environments` / Docker. CLI `are-benchmark gaia2-run --hf meta-agents-research-environments/gaia2`. | **PASS** |
| 2 | Gaia2 paper anchor `arxiv 2602.11964` | Cited in brief §6 + benchmark portfolio brief 2026-04-29 §2.1 (Froger et al., 12 Feb 2026, Meta SuperIntelligence Labs). Anchor consistent across authority chain. | **PASS** |
| 3 | Gaia2 dataset license verified for research use | HuggingFace dataset card `meta-agents-research-environments/gaia2`: **Creative Commons Attribution 4.0 International (CC-BY-4.0)**, SPDX `cc-by-4.0`. Direct quote: *"The Data is released CC-by 4.0 and is intended for benchmarking purposes only."* No commercial-use prohibition. Llama-attribution clause applies only if the data is used to train/finetune distributed models — **not applicable to dry run** (we benchmark prompt shapes, do not retrain models). Synthetic-data subcomponents are Llama-3.3 + Llama-4 Maverick outputs subject to those model licenses. | **PASS** |
| 4 | Gaia2 Search split task count | HuggingFace card lists 800 total scenarios across 6 configurations: **execution 200 · search 200 · adaptability 200 · time 200 · ambiguity 200 · mini 200**. Brief targets dry run **N=10–20** (subset of search 200) with full **N=200** deferred to Phase 3 sprint Week 6. Aligned. | **PASS** |

**§0.1 verdict:** **PASS.** Platform installable, paper authoritative, license permits dry run + Phase 3 sprint research use, search split has sufficient task count.

---

## §0.2 — GEPA-evolved variants accessible — **PARTIAL FAIL (brief contradiction)**

| Sub-item | Brief requirement | Verified evidence | Verdict |
|---|---|---|---|
| 1 | `claude::gen1-v1` + `qwen-thinking::gen1-v1` shape definitions reachable | Files exist in repo at `packages/agent/src/prompt-shapes/gepa-evolved/claude-gen1-v1.ts` and `qwen-thinking-gen1-v1.ts`. **Headers preserved** (Faza 1 mutation oracle provenance, Phase 4.5 retrieval-engagement evidence, Amendment 2 §3 retrieval-engagement bonus, Cell-semantic baseline anchors via `mutation-validator.ts` SHA pins). **BUT:** `git ls-tree -r main` returns ZERO matches for `prompt-shapes/` AND ZERO matches for `retrieval-agent-loop.ts` — files DO NOT exist on `main`. Files exist on `feature/c3-v3-wrapper`, `gepa-faza-1`, `phase-5-deployment-v2`. | **FAIL on `main` (brief §1 mandate)** / PASS on `feature/c3-v3-wrapper` |
| 2 | `registerShape` canonical API working (Amendment 8 native) | On `phase-5-deployment-v2`, `packages/agent/src/prompt-shapes/index.ts` exports `registerShape` from `./selector.js`: `export { selectShape, listShapes, getShapeMetadata, REGISTRY, registerShape, _resetConfigCache, type SelectShapeOptions } from './selector.js';`. Comment block confirms "Public API (Phase 1.2 of agent-fix sprint)". Amendment 8 native confirmed via Faza 1 closure decision §G.1 SHA chain. **BUT:** API is reachable only on branches that contain `prompt-shapes/`. Same branch-base contradiction as sub-item 1. | **FAIL on `main`** / PASS on Faza 1 substrate branches |
| 3 | `runRetrievalAgentLoop` accessible from Gaia2 harness adapter | On `phase-5-deployment-v2`, `packages/agent/src/retrieval-agent-loop.ts` is the production entry point: *"Two entry points: `runSoloAgent` — single-shot Cell A/C pattern; `runRetrievalAgentLoop` — multi-step Cell B/D pattern."* Phase 5 canary wiring already integrated (`routeRequestToVariant`, `WAGGLE_PHASE5_CANARY_PCT`). 38.3 KB integration surface, consumes `selectShape` + `MULTI_STEP_ACTION_CONTRACT` from `prompt-shapes/index.js`. Same branch-availability scope as sub-item 1+2. | **FAIL on `main`** / PASS on Faza 1 substrate branches |

**§0.2 verdict:** **PARTIAL FAIL.** Files + APIs verified existent and correctly structured, **but brief §1 explicitly mandates branching from `main`, where these artifacts do NOT exist**. The brief is internally contradictory:

- Brief §1 line 8: *"Branch: Kreirati `feature/gaia2-are-setup` iz `main` (ne zavisi od Sesija A ili B grana)"*
- Brief §0.2 sub-item 1: *"shape definitions reachable u `packages/agent/src/prompt-shapes/` ili monorepo migrated location"*

The shapes are on Faza 1 substrate branches (per Faza 1 closure decision §G manifest v7 substrate anchor `c9bda3d6dd4c0a4f715e09f3757a96d01ff01cd7` on `feature/c3-v3-wrapper`). They are NOT on `main`. The "monorepo migrated location" escape clause does not yet apply — Track C (CC Sesija B: hive-mind monorepo migration) has not yet executed, so no monorepo migration has happened.

**Halt-and-PM required.** PM must ratify branch-base before §1 can begin.

---

## §0.3 — Cost projection probe — **PAPER ESTIMATE (deferred actual probe)**

**Constraint:** Brief §0.3 specifies "3-request dry run probe sa Gaia2 sample tasks". Actual probe requires ARE platform installed + Gaia2 dataset downloaded — both are §2.1 Day-1-morning tasks (Task C1+C2). §0 cannot literally execute a 3-request probe before §2.1 install.

**Methodology adopted:** Paper estimate using two anchors —
- (a) Faza 1 cost evidence (`decisions/2026-04-29-gepa-faza1-results.md` §F): 135 evaluative records / $43.49 = **$0.32/eval avg** (mixed: NULL baseline, Gen 1 mutation, Checkpoint C held-out).
- (b) Gaia2 task character: per-scenario data field 2.44–2.67M characters (HuggingFace card), 12 apps + 101 tools system overhead, multi-step async with dynamic events. Materially larger than Faza 1 LoCoMo-style analytical scenarios.

### Per-task cost estimate band

| Configuration | Per-task cost estimate | Source / reasoning |
|---|---|---|
| Qwen-thinking baseline (filtered tool surface, single-step retrieval) | **$0.08–0.15** | Faza 1 Qwen Checkpoint C $1.93/15 = $0.13/eval; Gaia2 multi-step adds ~30% premium offset by tool filtering |
| Claude baseline (full system prompt, multi-step retrieval) | **$0.25–0.50** | Faza 1 Gen 1 $15.02/120 = $0.125/eval; Gaia2 adds 2-4× for 12-app system overhead + multi-step async |
| GEPA-evolved variants (claude::gen1-v1 + qwen-thinking::gen1-v1, retrieval-engagement positive signal) | **+15–30% premium** over baseline | Faza 1 evidence shows GEPA variants emit more retrievals (Phase 4.5 mechanism: qwen-thinking 2.231 mean retrieval vs same-shape baseline 1.625, +37% relative) |

### Dry run total projection (4 shapes × 10 tasks = 40 invocations)

| Scenario | Per-task avg | Total projection |
|---|---|---|
| Optimistic (all Qwen baseline rates) | $0.13 | **$5.20** |
| Mid (mixed Claude + Qwen, baselines + GEPA average) | $0.25 | **$10.00** |
| Pessimistic (Claude-heavy + GEPA premium + multi-step retrieval failures) | $0.45 | **$18.00** |

**Brief cost cap:** $10 hard / $8 halt / $5–8 expected.
**Projection:** **Mid-estimate $10 lands AT hard cap.** Pessimistic $18 lands ABOVE hard cap.

### Recommended scope adjustments (require PM ratification)

**Option α — Reduce dry run scope to N=5 per shape (20 invocations total).** Mid-estimate $5, pessimistic $9. Stays within $8 halt. Sacrifices statistical power but aligns with §0.3 cost discipline.

**Option β — Keep N=10 per shape (40 invocations) with strict per-shape halt monitoring.** After each 10-invocation shape batch, compute running cost; halt-and-PM if total > $8 before all 4 batches complete.

**Option γ — Defer §0.3 to first-batch-as-probe.** Run the 4-shape × 3-task probe (12 invocations) first, measure actual cost, project remaining 28 invocations from probe data, halt-and-PM if projection > $8.

**Option δ — Authorize cost cap raise to $15 hard / $12 halt** (still within Phase 5 cost amendment $75 hard / $60 halt envelope).

**§0.3 verdict:** **PAPER ESTIMATE PARTIAL.** Actual 3-request probe deferred to first execution batch in §2.1+§2.3 sequencing. **PM must ratify scope adjustment** (α/β/γ/δ) before §1 begins.

---

## §0.4 — Independent halt-and-PM: working tree state inconsistency

**Not part of brief §0 gates — surfaced because it blocks §1 branch creation.**

`git status --porcelain | wc -l` on primary worktree `D:/Projects/waggle-os` reports **1,282 unstaged changes**.

`git diff --stat phase-5-deployment-v2 main` reports **261 files changed, 89 insertions, 52,062 deletions.** Direction phase-5-deployment-v2 → main = main is the SHRUNK version. Working-tree pending deletions match main's state, suggesting prior `git checkout main -- .` or equivalent operation that left HEAD on `phase-5-deployment-v2` while replacing working tree files with main's content.

**Examples of pending deletions:** `apps/web/components.json`, `apps/web/index.html`, `apps/web/package.json`, `apps/web/playwright.config.ts`, all of `apps/web/src/components/os/apps/`, `apps/web/src/assets/personas/`, plus `packages/core/tests/mind/scoring.test.ts`, `scripts/run-pilot-2026-04-26.ts` (951 LOC), `scripts/run-mini-locomo.ts` (619 LOC), `scripts/parity-check.sh`, `vitest.setup.ts` (8 LOC), and 256 more files.

**Filesystem confirms:** `apps/web/` exists as empty/stub directory; `external/` does not exist (would be Task C1 install destination); `packages/agent/src/prompt-shapes/` returns ZERO files on disk via Glob (consistent with main's tree which lacks the directory).

**Faza 1 worktree referenced in Faza 1 closure decision (`D:/Projects/waggle-os-faza1-wt`) does NOT exist on filesystem.** Per `git worktree list`: only one worktree, the primary at `D:/Projects/waggle-os`. The Faza 1 worktree was cleaned up between 2026-04-29 closure and 2026-04-30 Sesija C kickoff.

**Resolution options for working-tree state:**
- **Option A — Reset working tree to `phase-5-deployment-v2` HEAD** (`git checkout phase-5-deployment-v2 -- .` then `git clean -fd`). Restores the Phase 5 canary state. Loses the deletions (which appear unintentional).
- **Option B — Stash deletions and discard** (`git stash push --keep-index --include-untracked` then `git stash drop`). Same effect as A.
- **Option C — Investigate first.** What happened between 2026-04-29 S2 handoff (clean tree) and 2026-04-30 evidence time? `git reflog` may explain.

**§0.4 verdict:** **HALT.** PM should pick A/B/C before §1 branch creation.

---

## §1 prerequisites — what PM must ratify

Three independent ratifications required:

### Ratification ask 1 — branch base (§0.2 contradiction resolution)

The brief mandates branching from `main`, but `main` lacks the GEPA-evolved shape files + retrieval-agent-loop.ts. Pick one:

| Option | Branch base | Trade-off |
|---|---|---|
| 1A | `feature/c3-v3-wrapper` (Faza 1 substrate anchor `c9bda3d6`) | Cleanest — substrate-pinned to Faza 1 closure SHA. Diverges from brief §1 literal text. |
| 1B | `phase-5-deployment-v2` (Phase 5 canary tip `a8283d6`) | Inherits Phase 5 canary infrastructure (manifest, monitoring emitters, feature flags). Slightly larger surface than needed. |
| 1C | `gepa-faza-1` | Same shapes as 1A. Different branch label. Less canonical. |
| 1D | First merge `feature/c3-v3-wrapper` → `main`, then branch from `main` | Honors brief §1 literal text. Adds prerequisite work + merge resolution risk. Couples Sesija C to merge work. |
| 1E | First cherry-pick `prompt-shapes/gepa-evolved/` + `retrieval-agent-loop.ts` into a fresh main-based branch | Surgical. Preserves brief §1 literal text. Risks substrate-isolation discipline if cherry-pick alters anchor SHAs. |

**CC recommendation:** **1A (`feature/c3-v3-wrapper`)** — Faza 1 substrate anchor preserved verbatim, no merge or cherry-pick risk, no working-tree resolution coupling. Brief §1 line 8 should be amended to substitute `feature/c3-v3-wrapper` for `main`.

### Ratification ask 2 — §0.3 cost projection scope (Option α/β/γ/δ)

| Option | Action | Risk |
|---|---|---|
| α | Reduce dry run to N=5/shape (20 invocations) | Lower stat power |
| β | Keep N=10/shape with strict per-shape halt | Modest cost-overshoot risk |
| γ | First batch as probe (12 invocations), project remainder | Probe-validated; aligns with brief §0.3 literal text |
| δ | Raise cost cap to $15 hard / $12 halt | Within Phase 5 amendment envelope ($75/$60) |

**CC recommendation:** **γ (first batch as probe).** Honors brief §0.3 literal text most closely; produces a real probe-validated projection at minimal initial spend (~$1–4); halts before exceeding $8 if pessimistic estimate is realized.

### Ratification ask 3 — §0.4 working-tree resolution (Option A/B/C)

**CC recommendation:** **C (investigate first).** `git reflog` is cheap and may reveal whether the deletions are intentional (e.g., a preparatory cleanup that should be committed) or accidental (e.g., aborted checkout). After reflog inspection, fall back to A or commit-and-move-on as appropriate.

---

## Audit anchors

- Brief: `briefs/2026-04-30-cc-sesija-C-gaia2-setup-dry-verification.md`
- Authority chain:
  - `decisions/2026-04-30-pre-launch-sprint-consolidation-LOCKED.md`
  - `briefs/2026-04-29-benchmark-portfolio-refresh-2026-venues.md` (§2.1 + §2.3)
  - `decisions/2026-04-29-gepa-faza1-results.md`
- ARE platform: `https://github.com/facebookresearch/meta-agents-research-environments`
- Gaia2 dataset: HuggingFace `meta-agents-research-environments/gaia2` (CC-BY-4.0)
- Faza 1 substrate anchor: `c9bda3d6dd4c0a4f715e09f3757a96d01ff01cd7` on `feature/c3-v3-wrapper`
- Phase 5 substrate tip: `a8283d6` on `phase-5-deployment-v2` (tag `v0.1.0-phase-5-day-0`)
- This evidence: `briefs/2026-04-30-cc-sesija-C-gaia2-setup-evidence.md`

---

**End of §0 evidence. CC HALTED at §0 gate. §1 begins only after PM ratifies asks 1+2+3.**
