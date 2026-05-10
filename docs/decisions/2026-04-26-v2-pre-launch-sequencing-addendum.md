# V2 Pre-Launch Sequencing Addendum

**Date:** 2026-04-26
**Author:** PM
**Status:** Ratified by Marko 2026-04-26 in PM session
**Predecessors:**
- `decisions/2026-04-25-launch-gate-reframe-decision-matrix.md` (original Decision Matrix)
- `decisions/2026-04-26-decision-matrix-self-judge-reframe.md` (PHF reframe post self-judge re-eval)
- `briefs/2026-04-26-retrieval-v2-embeddings-audit-brief.md` (V2 brief sa 5 open questions)

---

## §1 — Trigger

Marko 2026-04-26 ratifikovao 5 pitanja iz retrieval V2 brief §8. Najveći shift: **V2 ide PRE launch, ne post**. Marko quote: "nema launcha dok se sve ne sredi".

To uključuje:
1. V2 sequencing PRE launch (ratified)
2. CC-3 fresh sesija (ratified)
3. Sve 5 directions execute, no cuts (ratified)
4. Tier-gating Pro za reranker, Voyage/OpenAI Free (ratified)
5. Mock-fallback telemetry internal-only (ratified)

Ova ratifikacija fundamentally menja launch sequencing i comms framing. Audit trail u ovom dokumentu.

---

## §2 — Šta se menja

### 2.1 — Launch ETA

Pre 2026-04-26 ratifikacije: launch ETA bila ~3-4 nedelje (CC-1 Phase 5 + CC-2 Step 3 + 14-step launch plan items). V2 work bila planirana post-launch kao "v2 of arxiv paper ili follow-up note".

Posle ratifikacije: launch ETA shift na **6-9 nedelja** od danas (2026-04-26):
- CC-1 agent fix Phases 2-5: ~2-4 nedelje (Phase 1 done)
- CC-2 memory sync Steps 2-3: ~1-2 nedelje (Step 1 done)
- CC-3 retrieval V2 Phases A-C: 4-5 nedelje (sequenced, ne paralelno sa CC-1 Phase 2-5 jer baseline merenja confounded inače)
- Critical path: CC-1 Phase 5 + CC-2 Step 3 → CC-3 starts → Phase C ends → ostali 14-step items ako nisu paralelno gotovi

### 2.2 — Launch comms framing

**Pre ratifikacije** (PHF — PASS-with-honest-framing per `2026-04-26-decision-matrix-self-judge-reframe.md`):
- Substrate ceiling claim (74% self-judge oracle vs Mem0 peer-reviewed 66.9%) leads
- V1 retrieval honest disclosure (48% self-judge / 22.25% trio-strict, V2 in progress)
- Methodology contribution (+27.35pp self-judge bias)
- Apache-2.0 + sovereignty axes

**Posle ratifikacije** (V2 production-ready at launch):
- Substrate ceiling claim INTACT (74% self-judge oracle, paper claim #1)
- **V2 retrieval results REPLACE V1 honest disclosure** — production-ready numbers, ne "in progress"
- Methodology contribution (+27.35pp self-judge bias) INTACT
- Apache-2.0 + sovereignty axes INTACT
- New: "production-grade retrieval validated against substrate ceiling, gap closed" framing if V2 acceptance criteria met (per V2 brief §7: trio-strict V2 ≥30% AND beats full-context 27.25%)

### 2.3 — arxiv paper §5.3 framing

**Pre ratifikacije:** §5.3 says "V1 retrieval at 48% self-judge / 22.25% trio-strict; 5 directions identified for community contribution; V2 work in progress".

**Posle ratifikacije:** §5.3 will publish V2 results at launch:
- V2 retrieval baseline (target: trio-strict ≥30%, self-judge ≥65% per V2 brief acceptance criteria)
- Per-direction ablation results (5 directions × empirical contribution to overall lift)
- Comparison: V1 vs V2 vs oracle ceiling (both methodologies)
- Production deployment deployment criterion satisfied (V2 > full-context baseline)

If V2 acceptance criteria fail at full N=400 (Phase C verdict), §5.3 framing reverts to honest disclosure ("V2 work attempted, achieved X% gap closure, V3 work scoped as next") — this is contingent path, but per Mixed-methodology baseline rule we'll publish whichever is honestly defensible.

### 2.4 — Landing copy v3 §3 Claim 3 framing

**Pre ratifikacije:** "We publish what survives multi-vendor blind judging. We also publish what doesn't: V1 retrieval is honest at 48%..."

**Posle ratifikacije:** "Production-grade retrieval. Validated. V2 retrieval reaches X% (trio-strict) — closing 70%+ of gap to substrate ceiling. Beats full-context baseline. Five-direction architectural improvement (embedding model, scoring weights, temporal-aware, learned reranker, entity-aware KG bridge) — full ablation in arxiv paper §5.3."

If V2 fails acceptance: revert to honest disclosure per current draft.

### 2.5 — Decision Matrix scenario

**Pre ratifikacije:** PHF (PASS-with-honest-framing) per `decisions/2026-04-26-decision-matrix-self-judge-reframe.md`.

**Posle ratifikacije:** PHF augmented to **PASS-with-production-validation**:
- Substrate ceiling claim retained (PHF fundamentals)
- V2 retrieval production validation added as launch prerequisite
- If V2 fails: fallback to PHF (i.e., revert to V1 honest disclosure, accept timeline shift if V2 retry needed)
- If V2 passes: stronger launch narrative with end-to-end production-ready memory

---

## §3 — Šta ne menja se

- **Substrate ceiling claim** (74% self-judge oracle, +7.1pp vs Mem0 peer-reviewed) — INTACT
- **Methodology contribution** (+27.35pp self-judge bias quantification) — INTACT
- **Apache-2.0 + local-first + EU AI Act audit triggers** — INTACT
- **Pricing** (Solo Free / Pro $19 / Teams $49 LOCKED 04-18) — UNCHANGED
- **Pre-registered manifest v6 + amendments + audit chain** — UNCHANGED
- **Trio-strict κ=0.7878 ensemble** — UNCHANGED
- **14-step launch plan** — sequencing within steps adjusted but step set unchanged
- **Anti-pattern #4 discipline** (thresholds do not shift post-hoc) — UNCHANGED; V2 acceptance criteria are pre-registered before V2 execution

---

## §4 — Implementation queue (PM streams)

Following items must be authored / updated based on this addendum:

1. **arxiv §5.3 update** — replace V1 honest disclosure framing with V2 production-ready framing (placeholder until V2 results land); methodology citations explicit per Mixed-methodology baseline rule
2. **Landing copy v3 §3 Claim 3 update** — replace V1 honest disclosure with V2 production-ready framing (placeholder until V2 results land)
3. **CC-3 brief authoring** — paste-ready prompt for fresh CC-3 sesija; not sent until CC-1 Phase 5 + CC-2 Step 3 done; placeholder + acceptance criteria binding
4. **14-step launch plan memory entry update** — Korak 2 (retrieval V2) now PRE-launch, not post-launch annotation
5. **Substrate integrity audit brief (Korak 12)** — must include V2 reproducibility check, not just V1 substrate verification

PM authoring queue:
- (1) + (2) + (4) ide sad (parallel sa CC-1/CC-2 active work)
- (3) ide kad CC-3 prerequisites ispunjeni (~2-3 nedelje)
- (5) ide pre Day 0 launch comms freeze (~1-2 nedelje pre launch-a)

---

## §5 — Open question — none

Sve 5 V2 pitanja ratified. Sequencing implications dokumentovani. PM proceeds with implementation queue per §4.

---

## §6 — Cross-references

- Original Decision Matrix: `decisions/2026-04-25-launch-gate-reframe-decision-matrix.md`
- PHF reframe: `decisions/2026-04-26-decision-matrix-self-judge-reframe.md`
- V2 brief (5 ratifications resolved): `briefs/2026-04-26-retrieval-v2-embeddings-audit-brief.md`
- Memory sync audit: `decisions/2026-04-26-memory-sync-audit.md`
- Pilot verdict: `decisions/2026-04-26-pilot-verdict-FAIL.md`
- Mixed-methodology baseline rule: `feedback_config_inheritance_audit.md` Extension 2
- Stage 3 v6 5-cell summary: `D:\Projects\waggle-os\benchmarks\results\stage3-n400-v6-final-5cell-summary.md`
