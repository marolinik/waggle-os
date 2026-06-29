# WS1 — W4 SOTA Doc-Sync · Verification Report

**Date:** 2026-06-29 · **Branch:** `docs/w4-sota-doc-sync` · **Author:** Claude Code (per CC MASTER BRIEF WS1)

## What shipped (tasks 1–3)

| Commit | Scope |
|---|---|
| `4193e68a` | `docs(paper): port W4 LoCoMo SOTA briefing + paper + arxiv draft to master` — 3 files into `docs/paper/` (verbatim copy from `waggle-os-w4\docs\paper\`) |
| `76a8181b` | `docs: sync CLAUDE.md C-1 + cornerstone to 87.66% LoCoMo SOTA (supersede 73.1%)` |

- **CLAUDE.md §10 C-1** rewritten: 87.66% overall / +5.71pp over Memori 81.95 (z=4.42, p<10⁻⁵) / Memori same-judge / Mem0 re-run 73.96 (temporal +32.7pp) / W4 port COMPLETE / paper in `docs/paper/`. Old 73.1% line **kept, struck through, marked SUPERSEDED** (not deleted).
- **WAGGLE-CORNERSTONE.md** got a top-of-file SUPERSEDED banner: pricing $19/$49 (not $15/$79), window manager retired (`a6dc2e4` — SHA verified: `a6dc2e47 feat(ux-refactor): … window manager retired`), "personal AI workspace" repositioning, SOTA 87.66% (not the ~91.6% Mem0-parity target), re-baseline pending.

## Task 4 — `73.1%` reference audit (the load-bearing finding)

`grep "73.1"` across the repo returns **9 files**, which split into three classes. **Only one was edited.**

### A. EDIT (done)
- `CLAUDE.md` §10 C-1 — superseded in `76a8181b` (above).

### B. HISTORICAL — MUST NOT TOUCH (research-integrity / dated record)
Editing these would rewrite locked evidence or a dated activity log:
- `benchmarks/preregistration/manifest-v8-gaia2-preregistration.{md,yaml}` — a **locked pre-registration**; `73.1/73.4` is its *parent finding / motivation*. A prereg recording the finding that motivated it is evidence, not drift.
- `benchmarks/preregistration/manifest-v8.1-multi-benchmark.md` — same lineage.
- `docs/plans/OPEN-TASKS-2026-05-20.md` — a dated plan/activity log; `73.1` appears in records of what was done on specific dates (incl. the v0.3.0 OSS release commit message).
- `apps/web/public/placeholder.svg` — **false positive** (`73.1982` is an SVG path coordinate).

### C. PM DECISION — deliberate conservative public framing, NOT silently rewritten
These present `73.1`/`73.4` **not as "the current SOTA figure"** but as a *convergence delta* under a deliberately conservative protocol. Converting them to 87.66 is a **public-claims change**, not a stale-number sync — and is out of WS1's stated "docs only, zero code" scope:

- `apps/www/messages/en.json` + `apps/www/app/_data/proof-points.ts` — the live landing ("N2 honest rewrite") **leads with the conservative trio-strict 67.8% (AND-of-3)** and cites the **0.3-pt convergence (73.1 vs 73.4 on the same memory layer)** as a sub-claim. It deliberately does **not** headline same-judge numbers.
- `docs/methodology.md` — the honest-methodology doc. It explicitly states the self-judge 73.1% is "**disclosed as inflated — never the headline**", leading instead with trio-strict 67.8%.

**Why not just swap them to 87.66?** `87.66%` is a **same-judge** figure (GPT-4.1-mini answerer **and** judge, N=1540). The landing's entire stated principle is to *avoid* leading with same-judge numbers in favor of the stricter cross-vendor trio-strict bar. Replacing the conservative public claim with a more-permissive same-judge number would **invert the doc's own integrity stance** — a deliberate marketing-claims decision for the founder, not a mechanical doc-sync.

**State note:** the public surfaces are mid-transition. `apps/web/.../BenchmarkApp.tsx` **already** shows `87.66%` vs Memori `81.95` (the in-app benchmark is on the new SOTA arc); `apps/www` + `methodology.md` are still on the conservative v5 arc.

## WS1 gate — status

- ✅ **Clean `git status`** on `docs/w4-sota-doc-sync` after both commits.
- ⚠️ **`grep 73.1` → "no current refs"**: cannot be met *as literally stated* without rewriting (C) above — the locked preregs (B) must stay, and the landing/methodology (C) is a founder claims-call. **Recommended interpretation:** the *operating docs* (CLAUDE.md, cornerstone) now carry no current 73.1 headline (✅ achieved); the landing/methodology 87.66 migration is tracked as a separate, deliberate claims decision.

## Recommendation (original)

Ship WS1 as-is (tasks 1–3 + this verification). **Do not** bundle an apps/www / methodology.md rewrite into this zero-risk sync — surface it to the founder as a scoped "migrate public landing copy from conservative v5 trio-strict (67.8% / 73.1-vs-73.4) to the 87.66 same-judge SOTA arc?" decision, since it changes public marketing claims and their judging protocol.

## Addendum — founder decision: MIGRATE the landing (2026-06-29)

Founder chose to migrate the public landing + methodology to the 87.66 arc. Executed, mirroring the **already-shipped, verified 87.66 framing in `apps/web/.../BenchmarkApp.tsx`** (no fabricated numbers — every figure traces to `memory/project_sota_results_index.md`). Class-C files migrated:

- `apps/www/messages/en.json` (`proof.subhead` + `proof.methodology`): 67.8% trio-strict → 87.66% same-judge. **Critically removed the "three rival models had to agree" framing** — that describes the trio-strict ensemble; 87.66 is *single-judge* (GPT-4.1-mini answerer+judge), so keeping it would have been false. Replaced with the truthful "previous leader's own protocol and judge, reproduced to 0.03pp" framing.
- `apps/www/app/_data/proof-points.ts`: convergence card (0.3-pt / 73.1-vs-73.4) → **87.66% SOTA card**; single-hop card 87.5% trio-strict → **92.75% same-judge**; portable-layer card (sovereignty, no stale number) kept; header comment updated.
- `apps/www/app/docs/methodology/page.tsx`: SEO `metadata.description` → 87.66 framing.
- `docs/methodology.md`: bumped v2→**v3**; added a leading **§0 "Current canonical headline — 87.66%"** (full category table + Mem0 re-run + token Pareto + protocol note that 87.66 is same-judge/more-permissive than the trio-strict bar below + evidence pointers). The v5/N=320 trio-strict content (§1–§8) is **retained and reframed** as the earlier conservative arc, not deleted. **No fabricated W3.3 artifacts** (no invented rescore commands / SHAs / pairwise-agreement tables) — §0 cites the real evidence locations instead. This file also renders at the public `/docs/methodology` page.

Gates after migration: `apps/www` `tsc --noEmit` exit 0; `en.json` valid JSON; `grep` of the old v5 numbers across `apps/www` returns nothing in live copy (only historical `SESIJA-*-MANIFEST.md` session records remain, untouched). `BenchmarkApp.tsx` (already 87.66) and the landing are now consistent.
