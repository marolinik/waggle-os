# LOCKED — Failure Mode Taxonomy Three OQ Resolutions

**Datum:** 2026-04-20
**Odobrio:** Marko Marković
**Status:** LOCKED — zatvara OQ-FM-1, OQ-FM-2, OQ-FM-3 iz `strategy/2026-04-20-failure-mode-taxonomy.md` §11
**Scope:** finalizacija rubric-a, decision tree bucketizacije i kalibracione suite pre Stage 1 preflight judge aktivacije

---

## OQ-FM-1 — Abstain kredit

**Odluka:** **sačekati Stage 2 distribuciju**, v1 zadržava 0 weight za F1 u safety-adjusted rubric-u.

**Rezon:** Odluka o F1 kreditu je empirijska, ne teorijska. U trenutnoj praksi sa dva dominantna model stack-a (Qwen3 35B-A3B-Thinking sovereign, Opus 4.6 performance), očekivano je da pokažu materijalno različite F1 rate-ove. Ako se to potvrdi u Stage 2, kredit za F1 postaje trade-off odluka sa stvarnim podacima (not philosophical). Ako je F1 rate uniformno nizak preko ćelija, bonus na F1 nema uticaj i zato nije prioritet. Odluka kasnije, sa rukom punom brojeva.

**Operativno:**
- Stage 2 attempt log mora da prijavi per-cell F1/F2/F3/F4/F5 distribuciju
- PM post-Stage-2 review uključuje jedno pitanje: "Koliko je F1 rate u full-stack vs raw ćeliji?"
- Ako Δ(F1) > 10pp između ćelija, otvara se revizija OQ-FM-1; inače rubric ostaje kako je

---

## OQ-FM-2 — F2 vs F3 hybrid (2 tačne + 1 pogrešna)

**Odluka:** **ostaje F3**. Nema hibridne klase u v1 taksonomiji.

**Rezon:** MECE princip je arhitekturno kritičan za pouzdan decision tree u judge prompt-u. Hibridna klasa F2+F3 razbija eksplicitno granično pitanje "da li model iznosi pogrešne činjenice — da ili ne". Ako da, ide u F3 bez obzira na delimičnu ispravnost drugih tvrdnji. Inter-judge agreement bi pao sa hybrid klasom jer bi judge-evi morali da vagaju "koliko partial" u svakom mešovitom slučaju; binary grana (iznosi pogrešno / ne iznosi pogrešno) je znatno reprodukibilnija.

**Operativno:**
- §3 decision tree u `strategy/2026-04-20-failure-mode-taxonomy.md` ostaje nepromenjen
- Follow-up v2 razmatranje samo ako Stage 2 fail analiza pokaže da je mešane greške 30%+ distribucije i da ih F3 bucket maskira

---

## OQ-FM-3 — Kalibracioni set veličina

**Odluka:** **v1 = 10 instanci**. Brža iteracija, niža labeling cost, spremna pre Stage 1.

**Rezon:** Za initial judge kalibraciju pre produkcijskog run-a, 10 instanci je dovoljno da uhvati očigledne prompt defekte (npr. judge sistematski meša F3 i F4, ili F1 i F5 u multi-hop pitanjima). Veći set je korisniji za finalni Fleiss' kappa compute u Week 1 ensemble-u, ne za bootstrap kalibraciju. 10 instanci znači PM može da ih labelira u jednoj sesiji (~45-60 min sa LoCoMo kontekstom), CC validira u drugoj, cela kalibracija gotova unutar 24h od committa Stage 2 sample-a.

**Operativno:**
- `benchmarks/data/failure-mode-calibration-10.jsonl` sadrži 10 labeled instanci: 3 single-hop, 3 multi-hop, 2 temporal, 2 open-ended
- Source: prvih 10 instanci iz `benchmarks/data/preflight-locomo-50.json` pravi kalibracioni set nasumičnim izborom zbog overlap rizika; predlažem da kalibracioni set bude **odvojen** od Stage 2 sample-a (različita instance IDs, iste kategorije) da bi se izbeglo "kalibrisati judge-a na istim pitanjima koje će ocenjivati"
- PM labelira prvi prolaz (verdict + failure_mode + rationale), CC validira second-pass, razlike se razrešavaju diskusijom; finalni human_label se commituje
- Aktivacija: judge može da pokrene Stage 1 samo nakon ≥ 8/10 match sa human label
- Ispod 8/10: judge prompt se retušuje (§4), re-run na istih 10, sve dok ne pređe 8

**Ekspanzija na 25:** ostaje kao opcija pre Week 1 main run-a ako želimo veću confidence u Fleiss' kappa compute-u. Odluka posle Stage 2 PASS-a, ne sada.

---

## Status failure mode taxonomy posle ovih resolution-a

**Zatvoreno:**
- Pet failure mode-ova MECE struktura
- Decision tree bucketizacija (F1 → F5 → F4 → F2 → F3 precedence)
- Judge prompt engleski, fiksan preko ćelija
- Scoring rubric sa penalty koeficijentima (binary remains primary gate)
- 4-judge ensemble Fleiss' kappa target ≥ 0.70
- Calibration set v1 = 10 instanci, target match ≥ 8/10

**Blocking dependencies ispred Stage 1 preflight judge aktivacije:**
1. CC Sprint 7 push na origin/main
2. CC commits `benchmarks/data/preflight-locomo-50.json` (Stage 2 sample)
3. PM labelira `benchmarks/data/failure-mode-calibration-10.jsonl` (10 non-overlapping instanci)
4. CC validira labeling, second-pass
5. Judge kalibracioni run na 10 instanci, target ≥ 8/10
6. Ako < 8/10: refine judge prompt, loop
7. Ako ≥ 8/10: judge clear za Stage 1 produkcijski run

---

## Referenca

- Failure mode taxonomy spec: `strategy/2026-04-20-failure-mode-taxonomy.md`
- Pre-flight OQ resolutions: `decisions/2026-04-20-preflight-oq-resolutions-locked.md`
- Verbose-fixed OQ resolutions: `decisions/2026-04-20-verbose-fixed-oq-resolutions-locked.md`
- Harness spec 4 OQ (OQ4 Mem0 scoring): `decisions/2026-04-20-harness-spec-4-oq-locked.md`
- 7 obligations LOCKED: `decisions/2026-04-20-benchmark-7-obligations-locked.md`
