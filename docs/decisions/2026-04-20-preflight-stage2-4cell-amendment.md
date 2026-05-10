# LOCKED — Pre-Flight Gate Stage 2 Amendment (3-arm → 4-cell)

**Datum:** 2026-04-20
**Odobrio:** Marko Marković
**Status:** LOCKED — amendment na `decisions/2026-04-20-preflight-gate-locked.md`
**Scope:** Stage 2 strukturu menja iz 3-arm u 4-cell; Stage 0 i Stage 1 ostaju netaknuti

---

## Kontekst

Pre-flight gate je LOCKED ranije 2026-04-20 sa tri stage-a: Dogfood ($5), mikro-eval 12 zadataka × 3-arm ($5-10), LoCoMo mini 50 pitanja × 3-arm ($50-100). Total $60-115.

Naknadno LOCKED 7 obligations (decisions/2026-04-20-benchmark-7-obligations-locked.md) zahteva **four-cell ablation** (raw / memory-only / evolve-only / full-stack) kao non-negotiable metodološki osnov za kauzalnu dekompoziciju. OQ1 (LOCKED istog dana) zaključava istih 50 instanci preko sve četiri ćelije.

Dve LOCKED odluke nisu bile usklađene. Amendment razrešava — Stage 2 se revidira iz 3-arm u 4-cell varijantu.

---

## Amendment

**Stage 0 (Dogfood) — BEZ IZMENA.** Ostaje 3-arm mentalno (bare / hive-mind / Waggle), tri pitanja, Marko lično verifikuje. Ovo je interni sanity check harvest pipeline-a, ne ulazi u four-cell metodologiju.

**Stage 1 (mikro-eval 12 zadataka) — BEZ IZMENA.** Ostaje 3-ruka (A bare / B hive-mind solo / C Waggle full). Svrha Stage 1 je brz signal o orthogonalnosti layer-a (memory pomaže, evolve pomaže, kompozicija nije antagonistička) — 3-arm je adekvatan signal bez troška 4-cell proširenja na ovom granularnosti nivou. Budžet $5-10 ostaje.

**Stage 2 (LoCoMo mini sample) — REVIDIRANO.** Prebacuje se iz 3-arm u 4-cell:
- Istih **50 LoCoMo instanci** preko sve četiri ćelije (LOCKED u OQ1)
- Ćelije: `raw`, `memory-only`, `evolve-only`, `full-stack`
- Single seed = 42, Sonnet judge (konzistentno sa original Stage 2)
- Kategorijska proporcija zadržana (single-hop / multi-hop / temporal / open-ended)

**Mapiranje original ruka na nove ćelije:**
- Ruka A (bare) → Cell `raw` (direktno)
- Ruka B (hive-mind solo) → **retira se**; signal koji je B hvatao sada se deli između `memory-only` i `evolve-only` — ta dva cell-a zajedno daju bolju dekompoziciju nego jedna ruka B
- Ruka C (Waggle full) → Cell `full-stack` (direktno)

Mapiranje **nije 1:1** — 3-arm je bio mix koji 4-cell razdvaja. Time gubimo direktnu uporedivost sa ranijim PA V5 rukama B, ali dobijamo kauzalnu izolaciju memory sloja od evolve sloja.

---

## Budžet impact

**Stage 2 original:** 3-arm × 50 = 150 LLM calls, $50-100.
**Stage 2 revidiran:** 4-cell × 50 = 200 LLM calls, **$67-134** (linear scaling ~33% više).

**Total gate:**
- Original: $60-115 (unutar Block 4.3 $100 budžetske linije iz `waggle-os/docs/REMAINING-BACKLOG-2026-04-16.md`)
- Revidiran: **$77-149**
- **Prekoračenje Block 4.3 budžeta:** ~$49 u gornjem slučaju

**Defensible jer:**
- Prekoračenje je < 3% total H-42a/b budžeta ($1500-2600)
- Razlika omogućava kauzalnu dekompoziciju, bez koje H-42 run ne može imati publishable claim
- Bez 4-cell u Stage 2, pre-flight signal nije predictive za main run — gubimo svrhu gate-a
- Budžetska linija Block 4.3 može se ponovo alocirati ili proširiti; PM evidentira prekoračenje u sledećoj finansijskoj review-u

---

## Pass/fail thresholds za Stage 2 4-cell

**Primarni pass kriterijum (apsolutan):** `full-stack` cell ≥ **85% accuracy** na 50-pitanja LoCoMo sample-u. Ovo je identično original Stage 2 C ruci ≥ 85%.

**Sekundarni pass kriterijumi (ordinal, svi moraju važiti):**
- `full-stack` ≥ `memory-only` (memory+evolve nije gori od samo memory)
- `full-stack` ≥ `evolve-only` (memory+evolve nije gori od samo evolve)
- `full-stack` > `raw` sa deltom ≥ 10pp (signal iznad 50-sample noise floor; statistički značajan na p<0.05 za binomial test)
- `memory-only` > `raw` ILI `evolve-only` > `raw` (bar jedan layer dodaje vrednost nad baseline — ako nijedan ne dodaje, celokupni stack je noise)

**Fail scenario escalation:**
- Ako `full-stack` < 85% ali > `raw` sa značajnom deltom: root-cause analysis u stack-u ili scoring implementaciji, popraviti, re-run
- Ako `full-stack` ≤ `raw`: kritična pipeline failure; stop, ne ide se na H-42
- Ako ordering je pokvaren (`memory-only` > `full-stack`): harness ima bug ili evolve sloj antagonistički interreaguje sa memory — debugging pre re-run-a
- Ako sve cell-e imaju sličan accuracy (spread < 5pp): ili test set ne razlikuje (sve pitanja trivial), ili harness nije pravilno aktivirao cell isolation — **Smoke kriterijum D iz harness spec-a mora se re-verifikovati**

---

## Referenca

- Original pre-flight gate: `decisions/2026-04-20-preflight-gate-locked.md`
- 7 obligations LOCKED: `decisions/2026-04-20-benchmark-7-obligations-locked.md`
- Four-cell harness spec: `strategy/2026-04-20-four-cell-harness-spec.md`
- Harness OQ1-4 LOCKED: `decisions/2026-04-20-harness-spec-4-oq-locked.md`
- Pre-flight detailed spec: `strategy/2026-04-20-preflight-gate-spec.md` (sledeći deliverable)
