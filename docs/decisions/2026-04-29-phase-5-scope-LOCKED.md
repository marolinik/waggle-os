# LOCKED Decision — Phase 5 Deployment Scope

**Date:** 2026-04-29
**Status:** LOCKED
**Author:** PM
**Ratified by:** Marko ("da", 2026-04-29)
**Supersedes:** none — first formal Phase 5 scope lock
**Binds:** Phase 5 brief authoring (PM-side, next 4-5 dana wall-clock)

---

## §1 — Decision

Phase 5 deployment obuhvata **dva GEPA-evolved variants**:

1. `claude::gen1-v1` — AUTHORIZED (combined N=13 = 100% Pass II, 0pp held-out gap)
2. `qwen-thinking::gen1-v1` — AUTHORIZED (Phase 4.5 mechanism CONFIRMED out-of-distribution: retrieval 2.231 = 96% Opus parity, +12.5pp quality, 0pp held-out gap)

`gpt::gen1-v2` je **WITHHELD** iz Phase 5; ulazi u Faza 2 N=16 re-validacioni run pre bilo kakve deploy odluke.

---

## §2 — Rationale (sazeto)

§F.1 (≥+5pp held-out) prosli su sva tri kandidata. §F.5 cond_2 (overfitting bound ±15pp) prosli su samo claude (0pp) i qwen-thinking (0pp); gpt FAIL sa 20pp gap (in-sample +25pp -> held-out +5pp). To znaci da je gpt rezultat selection-biased na in-sample distribuciji i da bi deployment na inflated effect-size estimatu bio metodoloska greska. Held-out validation methodology je upravo i autorizovana da uhvati ovakve slucajeve — radi kako je dizajnirana.

Cuvanje pre-registration discipline kroz 11 amendments imalo bi smisla samo ako rezultate primenjujemo konzistentno: bind kada trigger fire na mehanizmu, ne kada je trigger detection pod selection bias-om. Phase 5 zato deploy-uje samo robustno validirane variante.

---

## §3 — Strategic implications

**KVARK enterprise pitch anchor** sada dobija oba primary use case scientific support:
- Claude flagship-class continuity (claude::gen1-v1)
- On-prem Qwen 35B = Opus-class out-of-distribution (qwen-thinking::gen1-v1, 96% Opus retrieval parity)

**arxiv §5 evidence** je publishable: cross-family generalization sa transparentnom selection bias scoping discussion (gpt) kao methodology demonstration, ne failure disclosure.

**Faza 2 sprint planning** dobija jasan primary scope: gpt::gen1-v2 N=16 re-validacija sa selection bias resolution kao explicit cilj.

---

## §4 — Phase 5 brief delivery commitments (PM-side)

PM (ja) ce drafting Phase 5 brief obuhvatiti:

1. **Deployment plan** — kako se claude::gen1-v1 i qwen-thinking::gen1-v1 apply-uju u repo, koja je rollback procedura, koji canary uslov pre full enable
2. **Monitoring infrastructure** — koje metrike se prate (Pass II, retrieval engagement, latency, cost), threshold alerts, observation window
3. **Pre-registered exit criteria** — kada Phase 5 prelazi u "production-stable" status, kada eskalira u rollback
4. **Cost projection** — bind na real model pricing × max_tokens × probe-validated per-instance cost (per feedback_cost_projection_real_anchoring rule)
5. **Cross-stream dependencies** — Landing v2 refinement trigger (Proof Card 1 swap), arxiv §5 timing, KVARK pitch readiness

**ETA brief land:** 4-5 dana wall-clock from 2026-04-29 evening start.

**Trigger condition za actual deployment kick-off:** Marko ratifikacija drafted brief-a + canary readiness verifikacija.

---

## §5 — Audit trail anchors

- Faza 1 closure decision memo: `decisions/2026-04-29-gepa-faza1-results.md` (568 linija)
- Faza 1 acceptance verdicts: §F.1-F.5 + cond_2 dokumentovani u closure memo §B-C
- Cumulative Faza 1 spend: $43.49 / $115 cap (headroom $71.51 za Faza 2)
- Memory entries: `project_gepa_faza1_closed_2026_04_29` + `project_sprint_2026_04_28_master`
- Handoff: `sessions/2026-04-29-handoff-faza1-closed-landing-parked.md`

---

**End of LOCKED decision.**
