# Phase 5 §5 Cross-Stream Dependencies

**Date:** 2026-04-30
**Status:** Declared per `feedback_waggle_primary_framing` (NEW 2026-04-30)
**Manifest:** `gepa-phase-5/manifest.yaml` § cross_stream_primary + § cross_stream_secondary
**Brief:** `D:/Projects/PM-Waggle-OS/briefs/2026-04-29-phase-5-deployment-brief-v1.md` §6

This doc enumerates the cross-stream destinations for Phase 5 production-stable evidence in **primary** vs **secondary** order per the binding feedback rule. Phase 5 production-stable is a **Waggle-launch-readiness gate** with KVARK as a downstream beneficiary.

---

## Strategic framing (binding rule)

`feedback_waggle_primary_framing`:

> Waggle is the demand-creation engine for KVARK (per CLAUDE.md §1 strategic function). KVARK without Waggle has no funnel; the strategic order is Waggle-first because Waggle drives the inbound that qualifies into KVARK. Reversing primary/secondary in deployment narratives confuses positioning and risks framing the sovereign-enterprise tier as the entry point rather than the upgrade path.

**Bound:** any brief that inverts primary/secondary order (KVARK first, Waggle second) flagged for amendment. Phase 5 brief §6 lists the destinations but does not explicitly tag primary/secondary; this doc closes that authoring gap by declaring the order.

---

## Primary cross-stream destinations (Waggle-launch-readiness)

### P1 — Waggle landing v3 Proof Card 1 swap

| Field | Value |
|---|---|
| Brief anchor | §6.1 |
| Trigger condition | `phase_5_production_stable + Pass II numbers + retrieval engagement validated samples` |
| Action | Update Landing v2.3 Proof Card 1 sa **PROVENANCE → BENCHMARK** swap (concrete numbers from Phase 5) |
| Owner | PM authoring + claude.ai/design generation |
| Timing post-production-stable | 2-3 weeks |
| Additional audit anchor | `project_landing_v2_basics_2026_04_28` |

### P2 — Waggle launch comms

| Field | Value |
|---|---|
| Brief anchor | §6.1 implicit extension (brief lists §6.1-§6.4 but doesn't separately enumerate launch comms — declared here per `feedback_waggle_primary_framing`) |
| Trigger condition | `phase_5_production_stable` |
| Action | Public launch comms — Waggle production-stable evidence as anchor; KVARK pitch is downstream consumption of the same evidence |
| Owner | Marko + PM |
| Timing post-production-stable | Aligned with landing v3 swap |

### P3 — arxiv §5.1-§5.2 (methodology + Faza 1 results)

| Field | Value |
|---|---|
| Brief anchor | §6.2 (§5.1 + §5.2 portion only — §5.3 KVARK enterprise narrative is **secondary**, see S2 below) |
| Trigger condition | `phase_5_production_stable + Marko_arxiv_co_author_roster_ratification + endorsement_contact` |
| Action | arxiv §5.1 (methodology + manifest v7 + 11 amendments transparent narrative) + §5.2 (Faza 1 results: cross-family generalization, claude + qwen-thinking pass; gpt selection bias scoping) — Waggle-primary academic credibility |
| Owner | Marko authoring |
| Timing post-production-stable | TBD |

---

## Secondary cross-stream destinations (KVARK-downstream)

### S1 — KVARK enterprise pitch deck

| Field | Value |
|---|---|
| Brief anchor | §6.3 |
| Trigger condition | `phase_5_production_stable + Marko_pitch_deck_draft_approval` |
| Action | KVARK enterprise pitch deck section: "On-prem Qwen + Waggle harness validated Opus-class on real production traffic, X% retrieval parity, Y% Pass II floor" |
| Owner | Marko |
| Timing post-production-stable | TBD post landing v3 swap |
| Relationship to primary | Downstream beneficiary of landing v3 evidence (consumes same Pass II + retrieval numbers) |

### S2 — arxiv §5.3 KVARK enterprise narrative

| Field | Value |
|---|---|
| Brief anchor | §6.2 §5.3-only portion |
| Trigger condition | `phase_5_production_stable` |
| Action | arxiv §5.3 KVARK enterprise narrative — Qwen 35B = Opus-class on production traffic = KVARK pitch scientific anchor |
| Relationship to primary | Downstream beneficiary of §5.1 + §5.2 (consumes same methodology + results sections) |

### S3 — Faza 2 sprint planning

| Field | Value |
|---|---|
| Brief anchor | §6.4 |
| Trigger condition | `phase_5_production_stable + 2 weeks observation` |
| Scope | gpt::gen1-v2 N=16 re-validation; qwen-non-thinking deeper investigation (retrieval-quality decoupling characterization); generic-simple investigation (necessary-but-not-sufficient retrieval scoping); arxiv §5.4 finalization |
| Budget headroom | $71.51 USD (decoupled from Phase 5 cap; Faza 1 unspent of $115 cap) |
| Timing post-production-stable | 2 weeks observation, then Faza 2 sprint kick-off |
| Relationship to primary | Methodology continuation; not Waggle-launch trigger directly |

---

## Sequencing implications

If multiple primary destinations are time-pressured:

1. **Always P1 first** (landing v3 swap is the customer-facing surface).
2. **P2 in parallel** (launch comms can author against the same evidence as P1).
3. **P3 follows** (arxiv has longest authoring timeline; doesn't gate launch).

Secondary destinations cannot pre-empt primary:

- **S1 KVARK pitch deck draft** can begin authoring during P1-P2-P3 work, but cannot precede them publicly.
- **S2 arxiv §5.3** authored alongside P3 §5.1-§5.2 (same artifact), but the §5.3 KVARK section never carries primary-narrative weight.
- **S3 Faza 2 planning** is post-launch methodology continuation; sequenced after the 2-week observation window.

---

## Anti-pattern guards

Per `feedback_waggle_primary_framing` "How to apply":

- ❌ "Phase 5 production-stable is a KVARK-readiness gate" — wrong. It is a Waggle-launch-readiness gate.
- ❌ KVARK pitch deck listed before Waggle landing v3 in cross-stream dependency tables — flag for amendment.
- ❌ arxiv §5.3 weight pitched as primary academic narrative — §5.3 is a downstream lift; §5.1 + §5.2 are primary.
- ✅ Primary order: Waggle landing v3 → Waggle launch comms → arxiv §5.1-§5.2.
- ✅ Secondary order: KVARK pitch deck → arxiv §5.3 → Faza 2 sprint planning.

---

**End of cross-stream declaration. Manifest § cross_stream_primary + § cross_stream_secondary mirror this doc; if drift detected, manifest is canonical.**
