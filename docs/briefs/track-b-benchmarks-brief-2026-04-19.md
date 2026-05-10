# Brief za Claude Code — Track B (v2 GEPA + LoCoMo benchmark)

**Datum**: 2026-04-19
**Prethodna sesija**: hive-mind v0.1.0 SHIPPED na npm (4/4 paketi live, GitHub Release javan)
**Scope**: Unblock SOTA benchmark proof — jedini preostali tehnički blocker ka Waggle launch-u
**Expected span**: 2-4 Claude Code sesije sekvencijalno, ne paralelno

---

## Session goal (one sentence)

Take Waggle cognitive layer from "v1 validated at 108.8% raw Opus 4.6 on 10 coder questions" to "LoCoMo benchmark result against Mem0 91.6% SOTA target" through v2 GEPA experiment rerun with revised judge model configuration, so launch narrative can carry verifiable SOTA proof.

## Why now

hive-mind shipped on npm 2026-04-19. Track A (polish) and Track C (announcement) both depend on benchmark numbers or are low-priority. Launch is SOTA-gated per LOCKED decision 2026-04-18 — no benchmark, no launch. Track B is the only critical path remaining on the engineering side.

## Prerequisite — HARD GATE

[M]-02 judge model revision MUST be decided by Marko before this session starts meaningful work. Status as of 2026-04-19 late-day: OPEN (blocker for v2 GEPA rerun).

First action in session: read `docs/plans/BACKLOG-MASTER-2026-04-18.md` (or v2/v3 if newer) and check [M]-02 entry. Three outcomes:

- **(a) [M]-02 RESOLVED with judge config documented** → proceed to Step 1 (v2 GEPA rerun).
- **(b) [M]-02 still OPEN** → STOP. Write a single-paragraph memo to `docs/plans/m02-judge-memo-<date>.md` summarizing the decision surface (what judge ensemble, what models, why no-Claude constraint stays or drops, what risk each config carries). Post the memo path back to Marko. Do NOT start v2 GEPA work. The cost of running v2 against the wrong judge is 10x the cost of waiting for a clean decision.
- **(c) [M]-02 resolved but config unclear** → read commit log for the resolution commit, reconstruct config. If reconstruction takes more than 15 min, fall back to (b).

## Scope (what this brief covers)

### Step 1 — v2 GEPA experiment rerun

Per existing v2 plan (60 examples × 3 domains, multi-model judge ensemble — exact config depends on [M]-02 outcome).

Acceptance:
- v2 experiment run completes without judge-guard timeouts (H-09 G3 guard must hold)
- Results JSON + per-domain breakdown in `experiments/v2-gepa-<timestamp>/`
- Compare v2 to v1 (108.8% raw Opus baseline) — regression or improvement across all 3 domains
- If v2 regresses on any domain, STOP and report to Marko before H-42 benchmark

### Step 2 — LoCoMo benchmark (H-42/43/44 block)

Per BACKLOG-MASTER H12 block definition:
- H-42: LoCoMo dataset loader + evaluator harness
- H-43: End-to-end run against Waggle cognitive layer (memory retrieval + answer generation)
- H-44: Score calculation + SOTA comparison report

Acceptance:
- LoCoMo score documented against Mem0 91.6% SOTA target
- Per-category breakdown (temporal reasoning, multi-hop, open-domain, etc.)
- Reproducibility: `pnpm run benchmark:locomo` must reproduce within ±2% variance on rerun
- Results committed to `experiments/locomo-<timestamp>/` with README explaining config

### Step 3 — Reporting artifact (for launch announcement)

Single document: `docs/research/benchmark-proof-2026-04-19.md` (or actual date)

Contents:
- LoCoMo score (ours vs Mem0 91.6%)
- v1 vs v2 GEPA comparison (cross-domain)
- Methodology transparency (judge config, sample size, model versions, date run)
- Limitations section (what this benchmark does NOT prove)

This doc becomes the proof-point source for landing copy and announcement. Must be launch-ready prose, not raw numbers dump.

## Non-goals (strict)

- NO new features in cognitive layer.
- NO architectural refactor inspired by benchmark findings — those are follow-up tickets.
- NO touching hive-mind repo (v0.1.0 is shipped, do not rebase).
- NO Stripe, auth handshake, i18n, or landing infrastructure work (H13 block is separate).
- NO announcement drafting (PM-Waggle-OS does that in parallel).
- NO Track A polish work (CI matrix, docs site, Trusted Publishing) — community backlog.

## Order of operations

1. [M]-02 prerequisite check (first 10 minutes).
2. If GREEN: v2 GEPA rerun, full cycle.
3. Compare v2 to v1. If regression on any domain → STOP, report, do not proceed to LoCoMo.
4. If v2 clean: LoCoMo harness build (H-42) → run (H-43) → score + report (H-44).
5. Final artifact: benchmark-proof research doc.

## Escalation triggers (when to STOP and ask Marko)

- [M]-02 judge model revision unresolved.
- v2 GEPA regresses vs v1 on any domain (not just overall).
- LoCoMo harness reveals our retrieval assumptions are wrong (e.g., bitemporal KG can't handle temporal reasoning subset).
- Score lands significantly below Mem0 91.6% — do not spin interpretation, report raw.
- Score lands significantly above — same rule, report raw, Marko decides framing.
- Any security warning during experiment runs (model API keys exposed, data leaks in logs).

## Definition of done (session-complete)

- v2 GEPA experiment committed with reproducible config
- LoCoMo score documented with methodology
- Benchmark-proof research doc drafted (PM-Waggle-OS polishes into announcement-ready prose after)
- Handoff file updated with raw numbers + next-session recommendation
- Commits pushed to main

## Reporting at session end

Two-paragraph summary for Marko:
1. What the numbers are (blunt, no spin).
2. What the numbers unlock or block (launch implication).

Plus: commits made, artifacts produced, next-session recommendation (Track C announcement, or iteration on v3 GEPA if v2 clearly subpar).
