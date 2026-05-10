# LOCKED — Verbose-Fixed Template Three OQ Resolutions

**Datum:** 2026-04-20
**Odobrio:** Marko Marković
**Status:** LOCKED — zatvara OQ-VF-1, OQ-VF-2, OQ-VF-3 iz `strategy/2026-04-20-verbose-fixed-template.md` §11
**Scope:** jezik, version-lock timing, harness retrieval stub test — finalizacija verbose-fixed kontrole pre Week 2 aktivacije

---

## OQ-VF-1 — Jezik template-a

**Odluka:** **engleski**. Verbose-fixed prompt, svih 6 segmenata A-F, piše se i zaključava na engleskom. Srpska varijanta se ne pravi.

**Rezon:** Tri pragmatična ograničenja vuku na istu stranu. Prvo, LoCoMo dataset, LongMemEval i τ-bench su svi originalno na engleskom — verbose-fixed mora match language of the ground-truth dataset ili uvodi translation confounder koji pokvari cell isolation. Drugo, training distribution ciljnog modela (Qwen3 35B-A3B-Thinking) je dominantno engleska; verbose-fixed prompt na srpskom bi aktivirao drugi deo parameter space-a i interkalira jezični shift u već skučen eksperimentalni dizajn. Treće, judge prompt ensemble (Sonnet/Haiku/GPT-5/Gemini) je kalibrisan na engleski — holding the judge language constant while flipping prompt language uvodi noise u scoring layer koji ne pripada eksperimentu.

**Alternativa odbačena:** bilingvalni (engleski prompt + srpski inline gloss). Problem: duplira dužinu, potencijalno prelazi 700-1100 token budžet iz §2, i uvodi translation drift kada se inline gloss ne slaže sa engleskim formulacijama.

**Operativno:**
- §4 template text u `strategy/2026-04-20-verbose-fixed-template.md` ostaje engleski kako je draftovan
- Harness label: `cell=verbose-fixed|lang=en` u output metadata-i
- Srpska razmatranja kroz lifecycle (Marko review, dokumentacija) ostaju na srpskom; deliverable artifact je engleski

---

## OQ-VF-2 — Version lock timing

**Odluka:** **zaključava se posle Week 2**, ne pre Week 1. Template ostaje "v1 draft, pending lock" do zatvaranja Week 2 four-cell main run-a.

**Rezon:** Verbose-fixed je eksplicitno Week 2 kontrola, ne Week 1. Week 1 Qwen3 35B-A3B × LoCoMo main run koristi tri ćelije (raw / memory-only / full-stack bez evolve) — verbose-fixed ne učestvuje. Zaključavanje template-a pre Week 1 bilo bi premature jer Week 1 rezultati mogu izložiti ambigvitete u 6 segmenata (tipično u §C Memory Access Framing i §D Tool Use Guidance) koje treba retuširati pre Week 2 aktivacije. Zaključavanje posle Week 2 main run-a znači: pre produkcije izveštaja, template ima svoj final commit hash u waggle-os repo-u i ne može retroaktivno da se promeni, što štiti reproducibility claim.

**Alternativa (a) odbačena:** zaključavanje pre Week 1. Problem: ne koristimo template u Week 1, a dorađivanje templata posle Week 1 bazirano na nalazima ne kvari eksperiment — ne bi bilo sample contamination-a. Prerano zaključavanje bi samo smanjilo kvalitet finalne verzije.

**Alternativa (b) odbačena:** zaključavanje pre Week 2 main run-a ali posle Week 2 smoke-a. Problem: uvodi dodatnu check-point granicu koja u praksi ne menja ništa — ako Week 2 smoke uspešno validira four-cell isolation, nema razloga da se template još menja. Post-Week-2 lock je čisto, jasno, auditable.

**Operativno:**
- `strategy/2026-04-20-verbose-fixed-template.md` header dobija `Status: v1 draft — pending lock after Week 2 main run completion`
- Svaka izmena template-a između sada i Week 2 lock-a dobija version bump (v1.1, v1.2…) sa changelog-om u fajlu
- Posle Week 2 main run-a (milestone: four-cell isolation validated, main run results committed), Claude Code commituje `packages/server/benchmarks/configs/verbose-fixed-prompt.md` sa final hash-om i PM updateuje decisions log sa lock entry
- Ako Week 2 four-cell main run fail-uje (nije prošao kriterijum), template verzija se može još jednom dotakne pre rerun-a, ali ide kroz eksplicitan amendment dokument

---

## OQ-VF-3 — Harness retrieval stub test

**Odluka:** **explicit unit test**. Runtime assertion-i u four-cell harness-u nisu dovoljni — potrebna je eksplicitna test suite koja dokazuje cell isolation kroz construction, ne kroz observation.

**Rezon:** Verbose-fixed cell ima strukturalni zahtev: kada se aktivira, retrieval pipeline ne sme biti pozvan. Validacija kroz runtime assert ("ako retrieval call broj > 0 u verbose-fixed cell-u, fail") hvata nepravilnost tek kada se desi, što znači da fail može tiho da se previdi ako test case ne pogodi tu granu. Explicit unit test — mockuje retrieval stack, aktivira verbose-fixed cell, assertuje 0 poziva — dokazuje invariantu kroz test infrastructure pre nego što se benchmark pokrene. Ovo je standardan test-first princip: bugovi u cell isolation kodu se hvataju u CI pre nego što dođu u main run.

**Alternativa (a) odbačena:** samo runtime assertion u harness-u. Problem: ne hvata regression u source code-u. Ako neko slučajno ubaci retrieval poziv u cell=verbose-fixed branch-u, assertion to vidi tek kad se main run pokrene, što je skup benchmark cost (~$150 Block 4.3) da bi se uhvatio bug koji je test suite mogao uhvatiti za $0.

**Alternativa (b) odbačena:** integration test sa kompletnim dataset-om. Problem: spor (integration test-ovi traju minute, unit test-ovi traju sekunde) i overkills za invariantu koja se može izolovano testirati.

**Operativno:**
- Unit test fajl: `packages/server/tests/benchmarks/verbose-fixed-cell-isolation.test.ts`
- Minimum 3 test case-a:
  1. `verbose-fixed cell invokes zero retrieval calls` — mock retriever, aktiviraj verbose-fixed cell, assert retriever.search call count === 0
  2. `verbose-fixed cell invokes zero wiki compiler calls` — mock wiki compiler, assert wiki.compile call count === 0
  3. `verbose-fixed cell invokes zero memory read calls` — mock memory reader, assert memory.read call count === 0
- Test mora biti dodat u exit gate za four-cell harness (Task 7 u `briefs/2026-04-20-cc-sprint-7-tasks.md` — ako test nije dodat, Task 7 nije zatvoren)
- CI failing ovaj test = blocker za merge u main

---

## Status verbose-fixed template-a posle ovih resolution-a

**Zatvoreno:**
- Jezik: engleski (sva 6 segmenata)
- Timing: v1 draft sada, version-locked posle Week 2 main run
- Harness kontrola: explicit unit test + runtime assertions (defense in depth)

**Ostaje otvoreno (non-blocking):**
- Da li verbose-fixed uključuje "thinking" mode aktivaciju za Qwen3 35B-A3B-Thinking — naslanja se na §C Memory Access Framing sekciju, rešava se kada se Week 1 rezultati vide (Week 2 prep)
- Failure mode taxonomy (sledeći PM deliverable) — nije verbose-fixed specific ali se koristi u LLM-judge prompt-ima koji ocenjuju verbose-fixed output

**Blocking dependencies ispred Week 2 aktivacije:**
1. Pre-flight gate PASS (Stage 0 → Stage 1 → Stage 2 4-cell)
2. Week 1 Qwen3 35B-A3B × LoCoMo main run PASS (tri ćelije bez verbose-fixed)
3. Four-cell harness Task 7 merged + verbose-fixed unit test-ovi green
4. Template finalizacija po Week 1 observation-ima, ako ih bude

---

## Referenca

- Verbose-fixed template spec: `strategy/2026-04-20-verbose-fixed-template.md`
- Four-cell harness spec: `strategy/2026-04-20-four-cell-harness-spec.md`
- Harness spec 4 OQ LOCKED: `decisions/2026-04-20-harness-spec-4-oq-locked.md`
- Pre-flight OQ resolutions: `decisions/2026-04-20-preflight-oq-resolutions-locked.md`
- 7 obligations LOCKED: `decisions/2026-04-20-benchmark-7-obligations-locked.md`
- CC Sprint brief: `briefs/2026-04-20-cc-sprint-7-tasks.md`
- Memory: `.auto-memory/project_cc_sprint_active_2026_04_20.md`
