# B3 LOCK §5 — DashScope Addendum (Non-Anthropic Provider Carve-Out)

**Datum:** 2026-04-22 (Sprint 11 Day 2 PM)
**Authority:** PM (Marko Marković)
**Type:** Addendum to B3 LOCK (model route naming, Sprint 11 Day 2 AM, commit `da9b3c5`)
**Status:** ✅ **LOCKED**
**Scope:** Surface B mapping for non-Anthropic providers when dated snapshot pinning is unavailable
**Supersedes:** Nothing. Extends B3 LOCK §5 only — original Anthropic-direct semantics intact.
**Related artefacti:** `decisions/2026-04-22-bench-spec-locked.md` §H-AUDIT-2; `briefs/2026-04-22-cc-c3-stage2-mini-kickoff.md`; `sessions/2026-04-22-c3-blocked-substrate-gap.md` (Blocker 6).

---

## 1. Trigger

CC-1 pre-kick verification za C3 Stage 2 mini (`sessions/2026-04-22-c3-blocked-substrate-gap.md` §6) razotkrila je da B3 LOCK §5 (Surface B = dated snapshot pinning za audit-anchor manifest) implicitno pretpostavlja Anthropic-style dated alias pattern (npr. `claude-opus-4-7-20260415`). DashScope (provider za Qwen3-30B-A3B-Thinking i Qwen3.6-35B-A3B varijante) **ne expose-uje dated snapshot ID** u javnom routing surface-u. To stvara H-AUDIT-2 audit-anchor ambiguity: ako manifest field `target_model` mora biti dated snapshot, Qwen runs ne mogu satisfy-ovati LOCK bez ili (a) izmišljanja pseudo-snapshota, ili (b) hard-blocking-a non-Anthropic providers iz benchmark surface-a.

Oba puta su loša. Pseudo-snapshot ruši audit integritet (nema verifiable upstream). Hard-blocking briše multi-vendor ensemble svrhu (Sprint 10 LOCK je B3-side authoritative na tri-vendor judge ensemble + Qwen kao primary system-under-test).

## 2. Decision

**Non-Anthropic providers (DashScope, OpenRouter bridge, vLLM lokalni endpoints) koriste Surface A floating alias za `target_model` manifest field, sa documented carve-out i opcionalnim revision-hash augmentation-om.**

Konkretno:

1. **Manifest field semantika ostaje:** `target_model` je STRING koji identifies model used for run. Audit verifier (H-AUDIT-2 spot-check) re-runuje sa tim string-om i poredi semantic equivalence sa originalnim outputom.
2. **Surface B (dated snapshot) ostaje preferred za Anthropic API direktne rute.** Primer: `claude-opus-4-7-20260415` → manifest `target_model: claude-opus-4-7-20260415`.
3. **Surface A (floating alias) je permitted za non-Anthropic providere** kada (a) provider ne expose-uje dated snapshot ID, ili (b) provider routing layer (LiteLLM, OpenRouter) ne propagira dated alias upstream. Primer: DashScope `qwen3-30b-a3b-thinking` → manifest `target_model: qwen3-30b-a3b-thinking` (floating alias preserved).
4. **Opcioni revision hash augmentation:** Ako provider ili routing layer expose-uje revision/build hash (npr. OpenRouter `revision_id`, vLLM `model_hash`, DashScope `model_version` header), manifest field se proširuje na `target_model + ":" + revision_hash`. Primer: `qwen3-30b-a3b-thinking:rev-2026-04-15-a1b2c3`. Ako hash nije available, plain alias je dovoljan.
5. **Carve-out polje obavezno u JSONL row:** Za svaki run koji koristi Surface A umesto Surface B, JSONL row MORA emit-ovati `model_pinning_surface: "A"` polje, plus `model_pinning_carve_out_reason: "<provider_name>_no_dated_snapshot"` ili equivalent rationale string. Anthropic-direct runs default-uju na `model_pinning_surface: "B"` bez `carve_out_reason` polja.

## 3. Rationale

**Audit anchor svrha je verifiability, ne syntactic uniformity.** H-AUDIT-2 (per A3 LOCK §H-AUDIT-2) zahteva da spot-check može re-run-ovati uzorak sa identičnom konfiguracijom i potvrditi semantic equivalence outputa. Floating alias za non-Anthropic providere zadržava verifiability u onoj meri u kojoj provider ne shift-uje model silently — što je pretpostavka koja drži za production-grade routing layers (LiteLLM, OpenRouter, vLLM lokalni) gde je floating alias stable za poznati prozor.

**Pseudo-snapshot izmišljanje (npr. fabricating `qwen3-30b-a3b-thinking-20260422`) je gore od floating alias-a.** Fabricated snapshot sugeriše audit-grade pinning koji ne postoji upstream — to je harder failure mode od honest floating alias plus carve-out flag.

**Hard-blocking non-Anthropic providers ruši core thesis.** Multi-vendor ensemble (Opus 4.7 + GPT-5.4 + Gemini 3.1 + Grok 4.20) je B3-side judge protokol; Qwen je system-under-test kroz DashScope/OpenRouter rute. Brisanje non-Anthropic surface-a iz audit-compliant zone bi anihilirao Sprint 12 H-42a (Qwen 4620 evals) execution capability.

**Provider drift detection ostaje obaveza, ali kroz drugi mehanizam.** Floating alias risk je that provider shift-uje model bez notice. Kontramera nije snapshot pinning (jer ga nema), nego (a) revision hash augmentation gde dostupan, (b) kontinuirana baseline κ monitoring (Sprint 10 baseline 0.7458, HALT < 0.60 per A3 LOCK §10), (c) periodic re-run replication checks na fixed instance subset-u (Sprint 12 Task 1 može uvesti 50-instance canary set za drift detection ako bude potrebno).

## 4. Implementation surface

**JSONL row schema dodatak (per-run, per-judge-eval row):**

```json
{
  "run_id": "<uuid>",
  "target_model": "qwen3-30b-a3b-thinking",
  "model_pinning_surface": "A",
  "model_pinning_carve_out_reason": "dashscope_no_dated_snapshot",
  "model_revision_hash": null,
  ...
}
```

vs Anthropic-direct row:

```json
{
  "run_id": "<uuid>",
  "target_model": "claude-opus-4-7-20260415",
  "model_pinning_surface": "B",
  ...
}
```

**Pre-registration manifest YAML field (audit anchor):**

```yaml
target_model_pinning:
  primary_system:
    model_id: "qwen3-30b-a3b-thinking"
    surface: "A"
    carve_out_reason: "dashscope_no_dated_snapshot"
    revision_hash: null
  judge_ensemble:
    - model_id: "claude-opus-4-7-20260415"
      surface: "B"
    - model_id: "gpt-5.4"
      surface: "A"
      carve_out_reason: "openai_routing_layer_floating"
      revision_hash: null
    - model_id: "gemini-3.1"
      surface: "A"
      carve_out_reason: "google_routing_layer_floating"
      revision_hash: null
    - model_id: "grok-4.20"
      surface: "A"
      carve_out_reason: "xai_routing_layer_floating"
      revision_hash: null
```

**Default behaviour:** Ako routing layer expose-uje dated snapshot, Surface B je preferred i mora se koristiti. Surface A je carve-out, ne shortcut.

## 5. Sprint 12 Task 1 acceptance criterion

CC-1 implementation u Sprint 12 Task 1 (infra-build) MORA:

1. Dodati `model_pinning_surface` i `model_pinning_carve_out_reason` polja u JSONL row schema (`benchmarks/harness/src/types.ts` ili equivalent).
2. Dodati per-model defaults u `config/models.json` route entry-iju (npr. DashScope route entries imaju `"pinning_surface": "A", "carve_out_reason": "dashscope_no_dated_snapshot"` polje koje runner reflektuje u manifest + JSONL).
3. Pre-registration manifest emitter (`benchmarks/harness/src/preregistration.ts`) MORA proširiti `target_model_pinning` block per gore navedenu YAML schemu.
4. H-AUDIT-2 spot-verification harness MORA tolerisati Surface A entry-ije kao validne (re-run replicates floating alias, verify semantic equivalence within tolerance).

## 6. Što ovaj addendum NE radi

- **Ne re-otvara B3 LOCK** (commit `da9b3c5` ostaje authoritative za Anthropic-direct routing). B3 strategy axes (Surface A = floating, Surface B = dated, lint guard za default route) su intact.
- **Ne uvodi nove modele.** Carve-out je o pinning surface-u za već-LOCKED modele iz Sprint 10/11 ensembles.
- **Ne menja A3 LOCK v1.** A3 §H-AUDIT-2 audit anchor logika je kompatibilna — samo je pinning surface enumeracija eksplicitna.
- **Ne dozvoljava silent provider drift.** Carve-out je "honest declaration that we cannot pin", ne "we're not watching for drift". Drift monitoring obaveza ostaje (κ baseline + canary subset).

## 7. Audit trail i verifiability

**Spot-check protokol u H-AUDIT-2 sa Surface A entry-ijima:**

1. Auditor selectuje N=10% rows iz tier-2 retention archive-a sa `model_pinning_surface: "A"`.
2. Re-runuje istu input + judge configuration kroz isti `target_model` floating alias.
3. Computes semantic equivalence (per A3 LOCK §H-AUDIT-2 tolerance band — npr. judge verdict matches in ≥85% spot-checked instances).
4. Ako spot-check fails (verdict drift > tolerance), audit log flag-uje provider drift incident i triggeruje Sprint review.
5. Carve-out je transparent — audit-konzument vidi `model_pinning_surface: "A"` polje i razume da je drift-monitoring proxy zamena za dated snapshot guarantee.

## 8. Related

- `decisions/2026-04-22-bench-spec-locked.md` — A3 LOCK v1 (intact, ovo je addendum, ne v2)
- `decisions/2026-04-22-bench-spec-locked.manifest.yaml` — A3 LOCK YAML twin (intact, Sprint 12 Task 1 backfill će extend-ovati pre-registration block per §4 gore)
- `decisions/2026-04-22-stage-2-full-kickoff-memo.md` — B4 final, §3 ovaj addendum referenced kao prerequisite za H-42a execution
- `sessions/2026-04-22-c3-blocked-substrate-gap.md` — Blocker 6 (DashScope ambiguity, sada resolved)
- `sessions/2026-04-22-c3-standdown-path-c-ratified.md` — Path C verdict, §3 ovaj addendum imenovan kao Day 3 PM slot (now closed)
- B3 LOCK source commit: `da9b3c5` (waggle-os repo, Sprint 11 Day 2 AM)

---

**LOCKED 2026-04-22 PM. Sprint 11 close artifact #2 (uz B4 final memo). Sprint 12 Task 1 implementuje §4 + §5 acceptance criteria. H-42a (Qwen primary) execution capability sačuvana.**
