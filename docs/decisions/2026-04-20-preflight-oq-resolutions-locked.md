# LOCKED — Pre-Flight Gate Three OQ Resolutions

**Datum:** 2026-04-20
**Odobrio:** Marko Marković
**Status:** LOCKED — zatvara OQ-PF-1, OQ-PF-2, OQ-PF-3 iz `strategy/2026-04-20-preflight-gate-spec.md` §10
**Scope:** operativne i budžetske finalizacije pre-flight gate-a; nema daljih open question-a u Stage 0/1/2 strukturi

---

## OQ-PF-1 — Kategorijska proporcija Stage 2 sample-a

**Odluka:** ekvi-proporcija **13 single-hop / 13 multi-hop / 12 temporal / 12 open-ended** = 50 instanci, fiksni seed=42.

**Rezon:** Svrha Stage 2 nije reprodukcija Mem0 91.6% kao point estimate — to ostaje posao punog H-42a/b run-a na izvornoj LoCoMo distribuciji. Svrha Stage 2 je trostruka: (i) validacija cell isolation na harness-u, (ii) ordinal ispravnost full-stack ≥ memory ≥ raw, (iii) effect size full-stack − raw sa minimum 10pp delta. Za ordinal comparison na istih-50 sample-u, distribucijska reprezentativnost je sekundarna — inter-cell razlika je robust na sample distribuciju jer svaka ćelija vidi istih 50 pitanja. Ekvi-proporcija maksimizira per-kategoriju visibility koja je kritična dijagnostička informacija za Stage 1 → Stage 2 eskalaciju.

**Alternativa koja je odbačena:** reprodukcija izvorne LoCoMo distribucije. Problem: ako LoCoMo nije otprilike 25/25/25/25, na sample-u 50 dobijamo kategorije ispod 10 instanci, što je ispod noise floor-a za per-kategoriju dijagnozu i poništava jednu od tri svrhe Stage 2.

**Ograničenje koje se eksplicitno prihvata:** full-stack accuracy na ekvi-proporcijskom 50-sample-u **nije direktan proxy za Mem0 91.6%**. Ako Stage 2 full-stack da 78%, to znači "signal iznad raw baseline u ordinal testu" — ne znači "H-42 će dati 78%". Mem0-uporedivost se meri odvojeno kroz OQ4 scoring validation na Mem0 paper sub-sample-u (`decisions/2026-04-20-harness-spec-4-oq-locked.md` §OQ4).

**Operativno:**
- Sample lock fajl `benchmarks/data/preflight-locomo-50.json` se bira proporcijom iznad, commituje u repo pre prvog Stage 2 run-a
- Harness mora da assertuje kategorijsku distribuciju pre pokretanja (fail-fast ako distribucija ne odgovara lock fajlu)
- Pre-flight spec §2 Stage 2 dobija eksplicitnu napomenu: "Stage 2 accuracy NIJE uporediv sa Mem0 91.6% — uporedivost se meri zasebno u OQ4 scoring validation"

---

## OQ-PF-2 — Re-run politika na Stage 2 fail

**Odluka:** **debugging loop sa istim sample-om**, bez sample zamene. Nije dozvoljeno povlačenje drugog sample-a od 50 pitanja ako prvi fail-uje.

**Rezon:** Cherry-picking rizik je kvantifikovan. Dva nezavisna pokušaja sa različitim sample-ovima udvostručuje verovatnoću false positive na p<0.05 (multiple testing problem). Ako se re-sample uvek dozvoljava, gate efektivno nije gate — samo je kašnjenje. U F2 scenario-u (near miss 80-84%), razlika 80% na sample-u A i 85% na sample-u B bez ikakve promene u kodu je manifest sample variance — ne stvarna accuracy razlika — i lažni pass koji bi iz toga proizašao pokvario bi celokupni H-42 claim.

**Alternativa koja je odbačena:** dozvoliti drugi sample ako prvi fail-uje uz argument "prvi je možda bio loš slučajni izvlak". Problem: isti argument važi u obrnutom smeru — ako prvi pass-uje a drugi bi fail-ovao, da li bismo ponovo izvlačili? Asimetrija u praksi kreira systematic bias ka pass-u.

**Izuzeci koji su formalno dozvoljeni:**

1. **Sample curation sa paper trail-om.** Ako fail analiza otkrije da N pitanja (N ≤ 5) sadrže legitimate scope gap — npr. entitete kojima stack strukturalno ne može da pristupi jer nisu u harvest pipeline-u, ili referenciraju LoCoMo kontekst koji naš ingest ne obrađuje — ta pitanja mogu biti **isključena** uz formalni zapis zašto u `preflight-results/stage-2-{ISO}-exclusions.md`. Isključena pitanja se **ne zamenjuju** drugim pitanjima. Posle svakog isključenja, minimum sample size mora da ostane ≥ 45 (10% gubitka gornja granica). Ispod 45, celokupni sample se odbacuje i radi se debugging pre nego što se komituje nova verzija sample-a.

2. **Deterministička scoring promena.** Ako se u fail analizi otkrije bug u scoring implementaciji (npr. neispravan alias matching, loš tokenizer), promena se primenjuje na **isti sample** — re-run je samo scoring prolaz, bez novih LLM call-ova. Cost: trivial. Ovo nije re-sample nego re-metrika.

3. **Deterministička harness promena.** Ako se otkrije harness bug (npr. cell isolation curi — verbose-fixed case aktivira retrieval), fix se testira prvo kroz Smoke kriterijum D iz harness spec-a (cell isolation integrity) pre punog re-run-a na istom sample-u.

Sve tri varijante moraju biti zabeležene u `preflight-results/stage-2-{ISO}-attempt-{N}.md` sa jasnim root-cause zapisom.

**Operativno:**
- Pre-flight spec §2 Stage 2 fail scenario tree dobija dodatak: "Pre re-run-a, Claude Code mora evidentirati root cause u attempt log-u i potvrditi da promena spada u jednu od tri dozvoljene varijante"
- PM review obavezna pre svakog re-run-a
- Maksimalno 3 attempta po Stage 2 sample-u; posle 3 fail-a bez resolution-a, eskalacija na Marko-a za go/no-go odluku

---

## OQ-PF-3 — Budžet formalizacija

**Odluka:** **formalno proširenje Block 4.3 sa $100 na $150.** Ne accepted overrun, ne re-alokacija iz drugog block-a.

**Rezon:** Scope je promenjen — 4-cell zahtev iz `decisions/2026-04-20-benchmark-7-obligations-locked.md` stigao je posle originalne Block 4.3 definicije u `waggle-os/docs/REMAINING-BACKLOG-2026-04-16.md`. Legitimate scope change zaslužuje legitimate budget amendment, ne overrun evidenciju. Ovo je najčistiji obrazac u zreloj finansijskoj praksi: novi scope → nova linija → jasni audit trail.

**Alternativa (a) odbačena:** accepted overrun sa evidencijom u finansijskoj review-u. Problem: kreira precedent "ako je razumljiv, overrun je OK". Svi overruns su razumljivi iz perspektive onih koji ih prave. Posle trećeg takvog, budžetska disciplina se erodira tiho.

**Alternativa (b) odbačena:** re-alokacija iz drugog block-a. Zahteva identifikovanje block-a sa viškom kapaciteta što je dodatan PM time u kritičnom trenutku pre pre-flight batch-a. Korisno kao vežba u redovnim finansijskim ciklusima, ne kao ad-hoc patch.

**Operativno:**
- `waggle-os/docs/REMAINING-BACKLOG-2026-04-16.md` Block 4.3 linija 117 se ažurira sa $100 → $150; comment u fajlu: "expanded 2026-04-20 via decisions/2026-04-20-preflight-oq-resolutions-locked.md §OQ-PF-3"
- Amendment entry u `PM-Waggle-OS/sessions/` log-u kao transparentan record
- Sledeća finansijska review (monthly cadence) vidi ovaj amendment kao retrospektivnu verifikaciju, ne kao surprise
- Verovatnoća da se budget opet pomera u Stage 2 implementaciji: niska (<10%), jer je $150 sa safety margin-om iznad $134 worst-case iz Stage 2 budget breakdown table-a

**Kolateralni benefit:** kreira obrazac formalnog scope-change process-a koji se skalira. Kada sledeći block dobije legitiman scope dodatak (bilo u $500 ili $5000 redu), isti obrazac se primenjuje bez ad-hoc pregovora.

---

## Status pre-flight gate-a posle ovih resolution-a

**Zatvoreno:**
- Struktura: Stage 0 Dogfood → Stage 1 mikro-eval 3-arm → Stage 2 LoCoMo 4-cell (amendment 2026-04-20)
- Sample: istih 50 LoCoMo instanci, 13/13/12/12 kategorijska distribucija, seed=42, commituje se u repo
- Pass kriterijumi: primarni ≥85% full-stack, sekundarni ordinal (full ≥ memory, full ≥ evolve, full > raw sa ≥10pp delta, bar jedan layer > raw)
- Fail tree: F1-F5 sa eskalacijama (root-cause → fix → re-run na istom sample-u pod tri dozvoljene varijante)
- Budget: $77-149, Block 4.3 proširen sa $100 na $150
- Re-run politika: isti sample, max 3 attempta, sample curation samo za legitimate scope gap ≤5 pitanja

**Ostaje otvoreno van pre-flight scope-a:**
- OQ4 scoring reimplementacija (odvojen post-pre-flight mini-sprint, LOCKED u `decisions/2026-04-20-harness-spec-4-oq-locked.md`)
- Verbose-fixed template draft (sledeći PM deliverable, ne blokira Stage 2 koji ne koristi verbose-fixed — ta kontrola ulazi u Week 2)
- CAPEX broj za cost model (Marko verifikuje u 7-14 dana)

**Blocking dependencies ispred pre-flight batch-a:**
1. CC Sprint 7 tasks PASS (Tasks 0-7 u `briefs/2026-04-20-cc-sprint-7-tasks.md`)
2. Task 7 four-cell harness scaffold merge-ovan u waggle-os
3. Sample lock fajl `benchmarks/data/preflight-locomo-50.json` commituje CC ili PM — ko god ima dataset access prvi
4. Stage 0 → Stage 1 → Stage 2 sekvencijalno sa Marko go/no-go između stage-ova

---

## Referenca

- Pre-flight gate spec: `strategy/2026-04-20-preflight-gate-spec.md`
- Stage 2 4-cell amendment: `decisions/2026-04-20-preflight-stage2-4cell-amendment.md`
- Original pre-flight LOCKED: `decisions/2026-04-20-preflight-gate-locked.md`
- Harness spec 4 OQ LOCKED: `decisions/2026-04-20-harness-spec-4-oq-locked.md`
- Four-cell harness spec: `strategy/2026-04-20-four-cell-harness-spec.md`
- 7 obligations LOCKED: `decisions/2026-04-20-benchmark-7-obligations-locked.md`
- Backlog Block 4.3: `waggle-os/docs/REMAINING-BACKLOG-2026-04-16.md` linija 117
