# LOCKED Decision — Phase 5 Cost Cap Amendment (per brief §4.4)

**Date:** 2026-04-30
**Status:** LOCKED
**Author:** PM
**Ratified by:** Marko ("stavi visi slobodno", 2026-04-30)
**Implements:** Brief §4.4 amendment procedure (no-revisit-without-amendment binding)
**Trigger:** §0.3 probe-validated cost ceiling $38.34 exceeded original $25 hard cap

---

## §1 — Decision

Phase 5 cost cap amendment ratified:

| Field | Original | Amended |
|---|---|---|
| Hard cap | $25 | **$75** |
| Halt trigger | $20 | **$60** |
| Expected total | $8-13 | **$35-45** |
| Buffer above probe-validated $38.34 | (negative) | ~96% (= $75/$38.34) |

Original cost cap was conservative PM projection authored before probe data existed. Probe revealed claude::gen1-v1 stretch case (1500 output tokens × Opus 4.7 $25/M output) dominates economics. Amendment preserves both variants (claude::gen1-v1 + qwen-thinking::gen1-v1) per §1 LOCKED scope intact.

Faza 2 budget headroom unchanged: $71.51 (decoupled from Phase 5 cap).

---

## §2 — Why amend, not pivot to Opcija A or C

PM originally proposed Opcija C (qwen-only canary) as cleanest math. Marko corrected: cost discipline argument applied to research evals, not production deployment. Egzakta Group EBITDA 4.5M makes $35-45 production deployment cost trivial; preserving scope (both variants) over saving $30 is correct trade-off.

Opcija A (volume reduction 740→386) preserved scope but had zero buffer — single probe overshoot or production traffic spike halt-uje sve. Risky for 14-day canary.

Amendment (this decision) preserves scope + provides 96% buffer over probe-validated reality. Cleanest path forward.

---

## §3 — Distinction: production vs research cost discipline

**Important precedent encoded:** cost cap discipline for **production deployment** ≠ cost cap discipline for **research evals**.

- **Research evals** (e.g., Faza 1 manifest v7, future GEPA generations) — strict pre-registered caps with no-revisit-without-amendment binding. Cost cap is proxy for methodology constraint (pre-registration discipline). Amendments require explicit halt-and-PM with §F-style verdict gate.
- **Production deployment** (Phase 5, future deployments) — operational cost, not methodology constraint. Cap is conservative PM projection that can be amended when probe data reveals underestimate. Amendment requires decision memo + PM ratification but does not invalidate prior evidence.

Two separate discipline regimes. Memory entry binds future PM briefs.

---

## §4 — Phase 5 brief §5.4 update

PM (ja) updates brief in-place with revised cap fields. Audit anchor preserved: original cap values commented inline as "v1: $25/$20 (superseded 2026-04-30 per cost amendment LOCKED memo)".

---

## §5 — CC continuation authorization

Per amendment, §0 §0.3 verdict revises from HARD-CAP-EXCEED to **PASS** ($38.34 < $60 halt < $75 hard cap). Aggregate §0 verdict revises to PASS sva 4 sub-gates:
- §0.1 PASS (substrate readiness, post quarantine commit 50393b1)
- §0.2 PASS (config inheritance audit)
- §0.3 PASS (probe-validated, $38.34 within amended $75 cap)
- §0.4 PASS-design-stage (per prior PM signoff)

CC unblocked za §1-§5 implementation per Phase 5 brief.

---

## §6 — Audit trail anchors

- Phase 5 brief: `briefs/2026-04-29-phase-5-deployment-brief-v1.md` (§5.4 updated in-place)
- Phase 5 brief LOCKED memo: `decisions/2026-04-29-phase-5-brief-LOCKED.md`
- Phase 5 scope LOCKED: `decisions/2026-04-29-phase-5-scope-LOCKED.md`
- §0 preflight evidence: `D:/Projects/waggle-os/gepa-phase-5/preflight-evidence.md` (CC-side, commit 11c7532 on phase-5-deployment-v2)
- Faza 1 closure: `decisions/2026-04-29-gepa-faza1-results.md`
- Memory entry: `feedback_production_vs_research_cost_discipline.md` (mirror: `D:/Projects/PM-Waggle-OS/memory-mirror/feedback_production_vs_research_cost_discipline.md`)
- Memory entry: `feedback_waggle_primary_framing.md` (mirror: `D:/Projects/PM-Waggle-OS/memory-mirror/feedback_waggle_primary_framing.md`)

---

**End of LOCKED decision. Phase 5 §0 PASS aggregate. CC authorization za §1-§5 LIVE.**
