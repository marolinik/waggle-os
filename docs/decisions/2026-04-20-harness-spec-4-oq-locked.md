# LOCKED — Four-Cell Harness Spec, Four Open Questions

**Datum:** 2026-04-20
**Odobrio:** Marko Marković
**Status:** LOCKED
**Scope:** četiri metodološke odluke unutar four-cell ablation harness spec-a; posledice za pre-flight, cost model, Week 1 scoring

---

## OQ1 — Sample strategija za pre-flight 4×50 smoke

**Odluka:** istih 50 LoCoMo instanci (identičnih `datasetInstanceId`) preko sve četiri ćelije, sa `--seed 42`.

**Rezon:** eliminiše sample variance kao confounder. Razlika cell 4 − cell 1 je tako isključivo pripisiva cell effect-u, ne slučajnom sample-ovanju. Harness mora da assertuje set-equivalence pre pokretanja smoke-a.

**Alternativa koja je odbačena:** random 50 po ćeliji sa različitim seed-ovima. Problem: ako cell 4 slučajno dobije lakši sample od cell 1, razlika bi bila artefakt a ne signal.

**Operativno:** sample lock fajl `benchmarks/data/preflight-locomo-50.json` sadrži 50 question IDs; commituje se u repo; svaki smoke run čita iz ovog fajla.

---

## OQ2 — Verbose-fixed kontrola template

**Odluka:** detaljan template se piše kao poseban deliverable u dva koraka:

1. PM draft u `PM-Waggle-OS/strategy/2026-04-20-verbose-fixed-template.md` — Marko pregleda
2. Posle odobrenja, commituje se u `waggle-os/benchmarks/configs/verbose-fixed-prompt.md`

**Rezon:** ova kontrola eliminiše "prompt engineering je pomoglo" objašnjenje. Ako je template tanak ili nasumičan, kontrola ne daje vrednost — ne eliminiše confounder, samo dodaje buku. Mora biti pažljivo napisan da pokrije full spektar onoga što GEPA potencijalno dodaje.

**Template mora uključiti (bez aktiviranja memory/evolve):**
- Role setup (ko je asistent, koji je kontekst razgovora)
- CoT encouragement ("Think step by step before answering")
- Tool-use guidance gde je primenljivo (τ-bench)
- Memory access instruction u obliku koji NE poziva stvarni memory retrieval (npr. "If relevant context from prior turns exists in your working memory, use it" — LLM ne dobija stvarni retrieval, samo je instruiran kao da ga ima)
- Konzistentan format output-a (ako dataset zahteva structured response)

**Template ne sme:**
- Injektovati GEPA-optimized fraze
- Aktivirati ACE augmentation loop
- Dobijati wiki ili memory content iz stvarnih retrievers

**ETA PM draft:** ulazi u strategy queue posle pre-flight spec-a i failure mode taxonomy; pre Week 2 start-a kada se kontrola aktivira.

---

## OQ3 — Self-hosted cost model sa CAPEX amortizacijom

**Odluka:** `clusterHourlyCost` u `benchmarks/configs/model-prices.yaml` uključuje punu TCO dekompoziciju:

```yaml
cluster_hourly_cost_usd:
  hardware_capex_amortized: X  # LM TEK H200 CAPEX / amortizacioni period (sati)
  electricity: Y                 # kWh × cena × PUE
  cooling: Z                     # data center cooling overhead
  operations: W                  # staff allocation, monitoring, maintenance
  total: X + Y + Y + W
metadata:
  last_verified: 2026-04-20
  capex_total_usd: ...
  amortization_years: 3
  source_notes: "..."
```

**Rezon:** sovereign AI pitch pred EU enterprise kupcem oslanja se na defensible TCO. Ako KVARK tvrdi da je jeftiniji od Claude ili OpenAI za istu accuracy, brojka mora da preživi due diligence. Enterprise procurement-ovi rade svoje TCO kalkulacije — ako naš broj koristi samo marginal electricity a njihov uključuje amortizaciju, pitch se ruši u prvoj review rundi.

**Alternativa koja je odbačena:** samo marginal cost (electricity + cooling). Privremeno daje bolji broj ali je nedefensible. Transparency preko CAPEX je veća moat od optimisticnog broja.

**Operativno:** amortizacioni period konzervativno 3 godine za H200 cluster. CAPEX broj Marko potvrđuje u narednim 7-14 dana (uključuje nabavnu cenu hardvera + instalaciju + initial networking).

---

## OQ4 — LoCoMo scoring metoda

**Odluka:** reimplementacija iz Mem0 paper appendix-a; validacija kroz reprodukciju Mem0 objavljenog broja na njihovom setup-u (sanity check scoring-a pre merenja sopstvenog stack-a).

**Rezon:** Mem0 91.6% na LoCoMo je naš reper. Da bi naš broj bio uporediv, scoring metrika mora biti bit-identična — uključujući alias matching, normalization rules, token pre-processing, edge case handling. Ako koristimo različitu metriku, dobijamo broj koji nije uporediv sa 91.6%, i sav competitive claim gubi osnovu.

**Validacijski test pre scored run-a:**
1. Uzeti Mem0 publicly reported rezultat na LoCoMo dataset subsample (ako je paper objavio per-instance scores ili reprodukovljivu metodologiju)
2. Proći njihov setup kroz naš scoring implementacija
3. Ako se naš score razlikuje od njihovog za > 1pp, scoring implementacija nije correct — debugging pre dalje akcije

**Alternativa koja je odbačena:** fuzzy matching ili semantic similarity scoring (ROUGE-L, BERTScore). Tehnički validne metrike ali nisu uporedive sa Mem0 91.6% — trošak uvezivanja novog scoring-a bi bio odlaganje prvog defensible broja.

**Operativno:** scoring reimplementacija ide u Task 7 CC scope ili kao zasebni mikro-task Task 8 (ako CC timing postane tesan). Ako ne stigne u trenutni sprint, blokira Week 1 scored run — bukvalno nema brojke bez scoring-a.

---

## Posledice za downstream deliverables

- **Pre-flight gate spec** (sledeći PM deliverable): koristi OQ1 sample lock fajl; pass/fail threshold-ovi se kalibriraju na istih-50 setup-u
- **Verbose-fixed template draft**: novi PM deliverable iza pre-flight spec-a, pre failure mode taxonomy
- **`model-prices.yaml`**: commit pre prvog scored run-a, sa CAPEX brojem koji Marko verifikuje
- **LoCoMo scoring reimplementacija**: ulazi u CC sprint (Task 8) ili u post-sprint mini-cikulus pre Week 1 Day 3-4 glavnog run-a

---

## Referenca

- Harness spec: `strategy/2026-04-20-four-cell-harness-spec.md`
- 7 obaveza LOCKED: `decisions/2026-04-20-benchmark-7-obligations-locked.md`
- Gemma probe LOCKED: `decisions/2026-04-20-gemma-week3-probe-locked.md`
- CC sprint brief: `briefs/2026-04-20-cc-sprint-7-tasks.md`
