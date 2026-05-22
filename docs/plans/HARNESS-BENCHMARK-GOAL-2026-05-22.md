# GOAL STATEMENT — Agent Harness Benchmark (local-first, sovereign)

**Date:** 2026-05-22
**Owner:** Marko (PM) · drives benchmark design + execution
**Status:** DRAFT goal statement — hand to `/goal` → `/plan` once the §0 decision is locked

---

## 0. LOCKED — Reading B: Waggle is the arena + governance layer (2026-05-22)

**Decision (Marko, 2026-05-22): LOCKED to Reading B.**

Waggle OS is the **local-first OS that orchestrates** every one of these harnesses (the AI-OS arc: detect → launch Claude Code, Codex, Cursor, Hermes, OpenClaw… locally, with full audit). We do **not** position Waggle as a competing agent loop. We **run all of them safely on-prem** and publish the head-to-head comparison matrix as a **sovereign buyer's guide + governance proof**.

**Claim shape:** *"Run any agent harness locally — fully audited, zero data egress — and here's exactly how each one performs in that sovereign environment."*

**Why B (rationale of record):**
- Matches the mission verbatim — "onboarding → push toward KVARK as full sovereign AI orchestration + governance." That is an orchestration/governance story, not a "our agent loop beats Codex" story.
- The matrix becomes a **durable buyer asset** (a comparison guide buyers trust *because* we don't have a horse in the capability race) rather than a fragile "we're #1" claim that a single model/harness upgrade invalidates.
- Waggle's credibility comes from being the **neutral, auditable, local-first home** for whichever harness the customer already trusts — which is exactly the KVARK pitch one tier up.

**Consequence for design:** No Waggle→ARE adapter is required. Waggle's role is measured as the **execution+governance substrate** (it launches the harness, isolates it, captures the audit trail), and the protagonist metric set shifts from "Waggle's pass rate" to "the sovereignty triple (local-first / zero-egress / auditable) holds across ALL harnesses, and here is each harness's capability/cost/reliability profile when run inside Waggle." Reading A (Waggle's own loop as a 6th competitor) is explicitly **deferred** — it can become a later, narrower claim only if Waggle's loop proves differentiated, and is out of scope for this benchmark.

---

## 1. Objective (one sentence)

Produce **defensible, dual-tier (peer-review + hero-page) statements about agent-harness quality, measured head-to-head in a safe, local-first environment** — positioning Waggle OS as the place knowledge workers and sovereign-AI buyers run agentic work without their data leaving the perimeter, and as the on-ramp to KVARK.

## 2. Subject under test + comparison set

| Entity | Role (per §0 — Reading B) |
|---|---|
| **Waggle OS** | the **arena + governance substrate** — launches/isolates/audits each harness locally. Measured by the sovereignty triple holding across all harnesses, not by a pass rate of its own. |
| Hermes | harness-under-test · ARE-native reference agent (already wired — N=160 done) |
| OpenClaw | harness-under-test · ARE-native reference agent (config scaffolded) |
| Claude Code | harness-under-test · external coding/agent harness |
| Codex | harness-under-test · external coding/agent harness |
| Claude Cowork | harness-under-test · external agent product |

**Controlled-variable principle (non-negotiable):** the harness is the ONLY variable. Same benchmark, **same model (Claude Sonnet 4.6) where the harness allows model choice**, same judge model + same judge protocol, same scenario set, same denominator. Anything else and the comparison is not defensible. **Waggle is held constant as the environment under all of them** — so any harness's number is also implicitly a "this ran inside Waggle, locally, audited" number.

## 3. Environment constraint — local-first is itself a measured property

Everything runs **locally / on-prem** (Docker, hermetic, laptop-runnable). For the sovereign-AI audience this is not a footnote — it's a headline claim. Capture and assert:
- **Zero data egress** during execution (network-isolated containers; prove it).
- **Full auditability**: every tool call captured in `events.jsonl` / trace → this *is* the KVARK governance hook.
- **Reproducibility**: hermetic, runs on Marko's Windows hardware (already proven for Hermes).

## 4. What to measure (harness quality is multi-dimensional)

Pass rate alone is a thin claim. Measure per harness, per GAIA 2 split (search / execution / adaptability / time / ambiguity / noise):

1. **Capability** — strict pass rate + judged-only pass rate (report both; errors counted honestly).
2. **Efficiency** — tokens & $ per task, tool-calls per task, wall-clock.
3. **Reliability** — error rate, recovery, determinism across reruns.
4. **Sovereignty/safety** — local-first ✓, egress=0 ✓, trace-auditability ✓ (binary asserts, per harness).

## 5. Two deliverable tiers (different bars — do not blur)

- **Tier 1 — Publishable** (paper / arxiv / KVARK technical annex): pre-registered protocol, N≥160 per cell, CI reported, judge protocol fixed in advance, no post-hoc baseline shopping. The GAIA 2 N=160 Hermes run is the first cell of this matrix.
- **Tier 2 — Hero-page** (waggle-os.ai + KVARK deck): punchy but every number traces back to a Tier-1 cell. Honest framing only. E.g. *"Run Codex, Claude Code, or Hermes locally — fully audited, your data never leaves your machine."*

## 6. Success criteria (what counts as a win)

- A **completed comparison matrix**: {6 harnesses} × {GAIA 2 splits} × {4 metric families}, same protocol throughout.
- At least one **Tier-1 publishable** statement that survives peer-review scrutiny.
- At least one **Tier-2 hero-page** statement that is punchy AND traces to a Tier-1 cell.
- The **sovereignty triple** (local-first / zero-egress / auditable) demonstrated, not asserted.

## 7. Non-goals / guardrails (honesty bar)

- **Not a memory-substrate proof.** That is C-1 (LOCOMO 67.8% trio-strict) + C-2 (Stage 3 +19.25pp, p=8e-18). GAIA 2 measures the *harness*, not hive-mind memory. Keep the lanes separate in every artifact.
- **Kill the apples-to-oranges baseline.** Do NOT publish "Waggle 83.8% vs Mem0 ~40-55%" — different judge/denominator/protocol. Every comparison number must come from OUR matrix under identical protocol, or be dropped.
- **Judge-leniency risk.** A self-judge (Sonnet judging Sonnet) inflates. For Tier-1, use an independent / ensemble judge and report the self-vs-independent delta (same discipline as C-1 trio-strict).
- **No goalpost-moving, no hiding errors.** Strict + judged-only always reported together.

## 8. What already exists (starting point)

- ✅ GAIA 2 ARE local-first pipeline runs on Windows Docker (Hermes + Sonnet 4.6), patches captured.
- ✅ First matrix cell: **Hermes × search × N=160 = 83.8% strict / 86.5% judged-only.**
- 🔲 OpenClaw cell (config scaffolded, not run).
- 🔲 Claude Code / Codex / Claude Cowork adapters (do these expose an ARE-compatible runtime? — research task; first design question).
- ⛔ Waggle→ARE adapter — **out of scope** (Reading A deferred per §0).
- 🔲 Independent/ensemble judge wiring for Tier-1.
- 🔲 Egress=0 proof harness (the sovereignty triple — protagonist metric for Reading B).

---

## TL;DR for `/goal`

> **Benchmark agent-harness quality head-to-head (Waggle vs Hermes, OpenClaw, Claude Code, Codex, Claude Cowork) on GAIA 2, in a local-first / zero-egress / fully-audited environment — holding model + judge + scenarios constant so the harness is the only variable — to produce both peer-review-publishable and honest hero-page claims that onboard knowledge workers and funnel sovereign-AI buyers toward KVARK.**
>
> §0 LOCKED to Reading B (Waggle = orchestrator + governance layer, not a competing loop). First cell done (Hermes 83.8%). Next: research which external harnesses expose an ARE-compatible runtime, wire the independent judge, build the egress=0 proof, then fill the matrix.
