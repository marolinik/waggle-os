# LOCKED Decision — Phase 5 Deployment Brief Ratification

**Date:** 2026-04-29
**Status:** LOCKED
**Author:** PM
**Ratified by:** Marko ("sve ok idemo dalje", 2026-04-29)
**Implements:** `decisions/2026-04-29-phase-5-scope-LOCKED.md`
**Brief artifact:** `briefs/2026-04-29-phase-5-deployment-brief-v1.md`
**Updated 2026-04-30:** SHA terminus correction (fa716ff9 hallucinated → 6bc2089 verified) + branch architecture Opcija C ratifikacija per `decisions/2026-04-30-branch-architecture-opcija-c.md`. Phase 5 deployment branch = `phase-5-deployment-v2` (from `gepa-faza-1` baseline).

---

## §1 — Decision

Phase 5 deployment brief v1 je LOCKED i drives CC execution sa zero critique amendments na Marko-side review. Brief sadrži 9 sekcija (§0-§9) koje pokrivaju:

- §0 — 4 BLOCKING preflight gates (substrate readiness + config inheritance + cost projection probe + deployment readiness)
- §1 — LOCKED scope declaration (claude::gen1-v1 + qwen-thinking::gen1-v1; gpt withheld)
- §2 — Gradient canary deployment plan (10→25→50→100% sa AND-gate full enable trigger)
- §3 — Monitoring infrastructure (5 required metrics + threshold alert routing)
- §4 — Pre-registered exit criteria sa epsilon inclusive boundary
- §5 — Real-anchored cost projection (3-element decomposition sa probe-validation)
- §6 — Cross-stream dependencies (Landing v2, arxiv §5, KVARK pitch, Faza 2)
- §7 — 5 decision points sa explicit triggers
- §8 — Audit trail anchors (7 binding feedback rules referenced)

QA pass uhvatio i ispravio jedan logical bug pre LOCK: `min(...)` umesto `max(...)` u canary promotion floor (oba uslova ≥7 dana AND ≥30 samples moraju drzati pa effective floor je sporiji).

---

## §2 — Cost ceiling LOCKED

| Field | Value |
|---|---|
| Hard cap | $25 |
| Halt trigger | $20 (auto halt-and-PM) |
| Expected total | $8-13 |
| Probe budget | $0.30-0.50 (5 requests per variant) |
| Canary phase budget | $5-10 |
| Buffer | $2-3 |

Cumulative project-wide post-Phase 5: ~$52-57 of theoretical $115 cap (Faza 1 cap aggregated). Faza 2 headroom retained: $58-63.

---

## §3 — Wall-clock LOCKED (projection NOT trigger)

| Phase | Wall-clock |
|---|---|
| CC §0-§5 implementation | 2-4 dana |
| Canary observation window | minimum 7 kalendarskih dana **AND** ≥30 samples per variant per metric |
| Production-stable transition | 30 dana zero-rollback post full enable |
| Total Phase 5 lifecycle (kick-off → production-stable) | ~6-8 nedelja |

Effective wall-clock floor je `max(time_to_reach_7_days, time_to_reach_30_samples)` — slower constraint dominates.

---

## §4 — CC handoff readiness

CC moze da pokrene Phase 5 sesiju cim Marko inicijalizuje fresh CC sesiju sa:

1. Load brief: `D:/Projects/PM-Waggle-OS/briefs/2026-04-29-phase-5-deployment-brief-v1.md`
2. Load upstream: `D:/Projects/PM-Waggle-OS/decisions/2026-04-29-gepa-faza1-results.md`
3. Load scope LOCK: `D:/Projects/PM-Waggle-OS/decisions/2026-04-29-phase-5-scope-LOCKED.md`
4. Load this decision: `D:/Projects/PM-Waggle-OS/decisions/2026-04-29-phase-5-brief-LOCKED.md`
5. Verify HEAD reachability za manifest v7 SHA terminus `6bc2089` per §0.1 #4
6. Krece sa §0.1 substrate readiness grep evidence collection

Posle §0 PASS aggregation, CC emit-uje preflight-evidence pa ceka PM (ja) signoff per §7.2 pre nego sto krene u §2 deployment.

---

## §5 — Halt-and-PM authority

Bilo ko (Marko, PM, automation) moze trigger-ovati halt-and-PM:

- §4.2 automatic rollback triggers (immediate execution, no human approval)
- Manual discretion (Marko ili PM observe anomaly)
- CC observed anomaly outside pre-registered thresholds (CC emit halt request, PM ratifies)

Post-halt decision authority: PM proposal + Marko ratifikacija.

---

## §6 — Audit trail anchors

- Scope LOCK: `decisions/2026-04-29-phase-5-scope-LOCKED.md`
- Faza 1 closure: `decisions/2026-04-29-gepa-faza1-results.md` (568 linija)
- Manifest v7 SHA terminus: `6bc2089`
- Brief LOCKED artifact: `briefs/2026-04-29-phase-5-deployment-brief-v1.md`
- Handoff context: `sessions/2026-04-29-handoff-faza1-closed-landing-parked.md`
- Memory entries: `project_phase_5_scope_locked_2026_04_29` + `project_gepa_faza1_closed_2026_04_29`

---

**End of LOCKED decision. Phase 5 brief is execution-ready.**
