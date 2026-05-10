# LOCKED Decision — Track E Arxiv Skeleton 7-Decision Ratifikacija

**Date:** 2026-05-02
**Status:** LOCKED
**Author:** PM (decision memo authored retroactively 2026-05-05 to close decisions/ folder gap iz consolidation 2026-05-04)
**Ratified by:** Marko (interactive 7-decision sesija 2026-05-02 sa surgical refinements za odluke 1, 4, 6, 7; explicit "uradi to sve" 2026-05-05 to author missing decision memos)
**Binds:** Arxiv preprint drafting kick-off, Path A+D combination endorsement strategy, 3-author roster, Day 0 decoupling od arxiv timing
**Cross-references:**
- `research/2026-04-26-arxiv-paper/03-paper-skeleton-v2-2026-04-30.md` (10-section skeleton + 7 decision points authored 2026-04-30)
- `decisions/2026-04-30-pre-launch-sprint-consolidation-LOCKED.md` (Track E sequencing)
- `project_benchmark_strategy.md` memorija (Pavlukhin EVOLVESCHEMA author atribucija LOCKED 2026-04-20)
- `project_pilot_2026_04_26_result.md` memorija (multiplier teza conditional finding source)
- `project_gepa_faza1_closed_2026_04_29.md` memorija (GEPA cross-family evidence source za §5.4)
- `project_n400_run_state_2026_04_24.md` memorija (LoCoMo paper claim #1 LOCKED, +27.35-point methodology gap source)
- Memory entry `project_track_e_arxiv_closed_2026_05_02.md` (point-in-time observation, primary source)

---

## §1 — Trigger i steering kontekst

Track E iz pre-launch sprint-a — arxiv skeleton ratification kao gate za drafting kick-off. PM facilitirao 7-decision interactive sesiju sa Markom 2026-05-02. Marko prešao iz "ratify pojedinačno" u **"sve ti, vec znas o celoj prici"** steering delegacije za većinu odluka, ali zadržao surgical refinements za 4 framing odluke (4, 6, 7, plus title 1).

---

## §2 — Sedam ratifikovanih odluka

### Odluka 1 — Title

**Final:** "Apples-to-Apples on LoCoMo: A Bitemporal Local-First Memory Substrate and a +27.35-Point Methodology Gap."

Marko-revised, methodology-led, +27.35 hook. **Rejected** PM rec za cross-family generalization title (sekundarna narrativna linija).

**Abstract reorder:** 1. rečenica methodological, 2. architectural, 3. brojevi.

### Odluka 2 — Co-author roster

**Final:** 3-author paper.
- **Marko** (lead/corresponding)
- **Pavlukhin** (Egzakta tech lead, EVOLVESCHEMA author per `project_benchmark_strategy` LOCK 2026-04-20)
- **Barać** (Full Professor FON UB, e-business)

Co-author 2 (methodology consult slot) **DROPPED** — Barać preuzima cross-check rolu pored academic advisor.

### Odluka 3 — Endorsement path A+D combination

**Path A primary (Marko 2026-05-03 ponedeljak):** Pavlukhin podnosi EVOLVESCHEMA na arxiv kao standalone short preprint (4-6 strana, cs.AI). Posle arxiv approval (~24h), Pavlukhin endorses Markov paper kao nezavisni researcher (NE mora biti coauthor). Single email request to direct contact, ne cold outreach. Timeline 5-6 dana to endorsement-ready, compatible sa Day 0 ETA 6-10 dana.

**Path D fallback decoupling:** Day 0 launch decoupled od arxiv timing. Landing Trust Band Card 4 "Published methodology — arxiv preprint" zamenjuje se sa **"Open methodology — github docs"** (markdown methodology doc u OSS repo). Arxiv preprint linkujemo retroactively post-launch news cycle.

### Odluka 4 — Multiplier disclosure

**Final:** Eksplicitna "Negative Result" subsekcija u §6 Discussion sa 5 elemenata:

1. Hypothesis (multiplier teza)
2. N=12 protocol
3. Brojevi h2=1/3, h3=0/3, h4=0/3
4. Preconditions for re-test imenovane
5. Qualification "ne aplicira na primary contribution"

NOT "deferred" framing u headline — to ide u footnote.

### Odluka 5 — GEPA scope §5.4

**Final:** Zadržava ~1.5 page sub-section format (PM rec a). Plus footnote: *"Extended cross-family treatment in companion paper, in preparation."*

**Razlog:** standalone §5 GEPA bi koštao desk-reject rizika; cross-family generalization je dovoljno jako da nosi sopstveni preprint za 6-8 nedelja sa ERL methodology framing.

### Odluka 6 — §5.5 framing

**Final:** ACTIVE-VOICE rewrite — *"Bias-detection guardrails functioning as designed"*. NE "methodology maturity demonstration" (defanzivno).

Aktivni glagoli:
- "GPT selection bias detected and filtered by held-out"
- "qwen-non-thinking decoupling probe revealed effect"
- "calibration evolved across Amendments 7-11"

### Odluka 7 — Forward reference §5.6

**Final:** REVISED statement: *"Production traffic Pass II rates, p95 latency, and recall@K on production traffic distribution from Phase 5 deployment will be reported in v2 of this preprint, scheduled within 60 days post-publication."*

**Refinement 1:** "expected ~6 weeks" → **"scheduled within 60 days"** (operational discipline + 14-day margin).
**Refinement 2:** Imenovane konkretne metrike (Pass II rates + p95 latency + recall@K) — vague forward reference izgleda kao vaporware, specifična obećana metrika izgleda kao discipline.

---

## §3 — Marko net evaluation note

PM intencije sve ispravne; tri od četiri framing-a (4, 6, 7) treba da se pomere stepenicu ka aktivnijem, ne dodatak na sadržaj. Cilj nije da paper deluje skromno ili pažljivo — cilj je da deluje **tačno**.

---

## §4 — Drafting kick-off prerequisites (sve resolved)

- ✅ Title locked
- ✅ Author roster (3-author final)
- ✅ Endorsement path locked (A primary + D fallback)
- ✅ Multiplier framing locked (Negative Result subsection)
- ✅ GEPA scope locked (§5.4 sub-section + companion paper footnote)
- ✅ §5.5 framing locked (active-voice bias-detection guardrails)
- ✅ §5.6 forward reference locked (60-day scheduled + named metrics)

---

## §5 — Posledice za pre-launch sprint i downstream

1. **Drafting can start immediately ne blokira Day 0 launch.** Sa A+D combination, arxiv timing više nije Day 0 launch dependency — Day 0 može da se ship-uje sa Path D landing implementation, arxiv preprint dolazi kao post-launch news cycle.

2. **PM full drafting sequence:** Abstract → §1 Intro → §2 Related Work → §3 Architecture → §4 Methodology → §5 Results → §6 Discussion sa Negative Result subsec → §7 Conclusion. 7-9 dana PM autoring time, sledi Marko 1-2 dana review, total ~10 dana to submission.

3. **Apps/www CC Sesija D §3 acceptance review** treba dobiti Trust Band Card 4 copy swap napomenu ("Open methodology — github docs" replace "Published methodology — arxiv preprint" za Day 0; revertable na arxiv reference posle Path A endorsement).

4. **Pavlukhin contact-initiation Marko-side ponedeljak 2026-05-03.**

5. **Methodology markdown doc skeleton za github post Day 0 launch (PM action item).** Završeno 2026-05-02 kao `strategy/methodology/2026-05-02-methodology-doc-FINAL.md` (13.2 KB), Marko-side action: copy u `waggle-os/docs/methodology.md` + git commit + push (resolved 2026-05-03 commit `87b1637`).

---

## §6 — Memory correction (2026-05-02)

Prior memorija `project_benchmark_strategy.md` LOCK 2026-04-20 atribucija "Pavlukhin = EVOLVESCHEMA author" je **CONFIRMED ACCURATE**. Prior PM web search miss (arxiv author profile 404 + zero hits) je explained by: EVOLVESCHEMA paper trenutno NIJE na arxiv-u (Marko had PDF locally on 2026-04-20 upload; paper not indexed publicly). Path A action will resolve that — Pavlukhin submits EVOLVESCHEMA standalone arxiv preprint, becomes arxiv author, becomes endorser-eligible.

---

## §7 — Authoring trace

Ova decision memo je autorizovana **retroactively 2026-05-05** kao deo pop-up-a četiri-fajla decisions/ folder gap-a koji je flagovan u `project_execution_state.md` snapshot 2026-05-04. Sadržaj reflektuje point-in-time observation iz `project_track_e_arxiv_closed_2026_05_02.md` memorije.

Razlog za retroaktivnu autorizaciju: per CLAUDE.md decision memo discipline, svaka LOCKED odluka mora imati matching `decisions/<date>-<topic>.md` fajl. Memorija postoji ali memorija nije auditable artifact (živi u Cowork space-u, nije u git-u).

**END DECISION MEMO.**
