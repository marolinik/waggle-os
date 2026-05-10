# Arxiv Paper Skeleton v2 — Pre-Launch Submission Ready

**Date:** 2026-04-30
**Author:** PM
**Status:** SKELETON DRAFT — awaiting Marko 7 decision points ratifikacija → drafting full content
**Predecessor:** `00-paper-outline.md` (2026-04-26) + `02-section-5-refresh-2026-04-30.md`
**Target venue:** arxiv preprint (cs.AI primary, cs.CL secondary), Day 0 launch submission
**Authority:** `decisions/2026-04-30-pre-launch-sprint-consolidation-LOCKED.md`
**Wall-clock:** 7-9 dana drafting (PM) + 1-2 dana review (Marko) = ~10 dana to submission

---

## §1 — Marko 7 decision points — RATIFIED 2026-05-02

**1. Title — RATIFIED:** "Apples-to-Apples on LoCoMo: A Bitemporal Local-First Memory Substrate and a +27.35-Point Methodology Gap."

Marko rationale: methodology-led, dvodelno, konkretan broj kao hook. Najjači za arxiv discoverability jer "methodology gap" privlači citate iz svake naredne LoCoMo evaluacije. Marko REJECTED PM rec (d) jer cross-family generalization je sekundarna narativna linija, ne primary anchor; primary contribution je substrate vs Mem0 + +27.35pp self-judge bias methodology gap.

**Abstract refinement (Marko ratified):** prva rečenica metodološka, druga arhitekturna, treća broj. Reorder iz prethodne 4-claim strukture da odražava ovaj sequence.

**2. Co-author roster — RATIFIED 2026-05-02 final:**
- Lead/corresponding: Marko Marković, CEO Egzakta Group ✅
- Co-author 1 (Egzakta technical lead): **Michail (Mikhail) Pavlukhin** ✅
  - LinkedIn (Marko-confirmed 2026-05-02): https://www.linkedin.com/in/mpavlukhin/ (rs.linkedin = Serbia)
  - **Profile verified via WebSearch 2026-05-02:** Public output = DSPy + GEPA practitioner tutorials ("Improving performance of small LLMs on creative tasks with DSPy and GEPA"), Timeboat Adventures experimental narrative game, AI engineering content creation.
  - **EVOLVESCHEMA author — VERIFIED per `memory/project_benchmark_strategy.md` LOCKED 2026-04-20:** Pavlukhin je first-author EVOLVESCHEMA paper "LLM-Guided Evolutionary Optimization of DSPY Signature Schemas" (Marko uploadovao PDF 2026-04-20). Paper demonstrates composition pipeline EVOLVESCHEMA→GEPA, najbolji javno objavljeni brojevi 0.925 FIRE NER, 0.903 SGD Hotels (per Pavlukhin Table 2). Teza: "schema structure matters more than instructions". 74% HotPotQA gain od jedne strukturne mutacije (replace_output_fields).
  - **Strategic alignment:** Pavlukhin radi tačno u methodology orbiti našeg §5.4 GEPA finding + §2.4 Related Work EVOLVESCHEMA reference. Coauthorship strengthens cross-citation network and signals Egzakta team deep methodological investment u trojnoj kompoziciji optimization layer-a.
  - **Arxiv presence:** EVOLVESCHEMA paper trenutno NIJE NA ARXIV-U (PDF was internal Egzakta material per Marko 2026-04-20 upload). WebSearch arxiv author profile 404 + zero hits potvrđuje no prior arxiv first-author submission **yet**. → cannot currently endorse, ALI strategic option below.
  - **STRATEGIC OPTION (Pavlukhin EVOLVESCHEMA arxiv submission):** Pavlukhin submit EVOLVESCHEMA kao standalone short preprint (4-6 strana, cs.AI primary) u sledećih 3-5 dana. Three benefits: (1) Pavlukhin postaje arxiv author → Scenario A re-activated (auto-endorsement kroz coauthorship); (2) Cross-citation network: EVOLVESCHEMA u §2.4 + §5.4 composition pipeline reference; (3) Egzakta team javan akademski signal pre Day 0 launch. Marko 2026-05-02 to ask Pavlukhin if feasible.
- Co-author 2 (methodology consult): **DROPPED** per Marko ratification 2026-05-02 (Opcija C). Paper ide kao 3-author. Barać preuzima methodology cross-check rolu pored academic advisor.
- Co-author 3 (academic advisor): **Dušan Barać** ✅
  - Scholar profile (primary, Marko-confirmed 2026-05-02): https://scholar.google.com/citations?user=WvzsdGkAAAAJ&hl=sr&oi=ao
  - Scholar profile (alternative ID seen earlier, possibly stale): https://scholar.google.com/citations?user=wn7N_HsAAAAJ&hl=sr&oi=sra — confirm sa Markom da li je isti čovek dva profila ili greška
  - **Profile verified via web search 2026-05-02:** Full Professor, Department of E-business, Faculty of Organizational Sciences (FON), University of Belgrade. 56 publikacija ukupno; 25+ u peer-reviewed international journals sa impact factor; 8 papers u SCI/SCIe journals. 18+ godina IT consulting experience. Primary research domains: digital transformation, e-commerce, IT project management, e-learning technologies, AI-based apps, blockchain.
  - **Academic credibility:** STRONG — Full Professor + University of Belgrade (recognized institution) + SCI track record. Strong co-authorship credibility signal for peer reviewers.
  - **Methodology cross-check capacity:** ADEQUATE — IT/e-business background covers general empirical research methodology rigor; možda not specifično cs.AI/judge ensemble expertise, ali general academic peer-review standards covered.
  - **Arxiv endorsement potential:** ❌ WEAK — primary domain je e-business / IT ecosystems, NE cs.AI/cs.CL/cs.LG; plus Marko confirmed "nema na arxiv" → no prior arxiv first-author submission → cannot endorse cs.AI primary submission. Domain mismatch + zero arxiv presence = double pre-empt.

**3. Endorsement path — RESOLVED 2026-05-02 final via Path A + Path D combination.**

Verified results:
- Pavlukhin: NEMA arxiv first-author submission **yet** — but EVOLVESCHEMA standalone arxiv submission planned (Marko-side action sutra 2026-05-03 ponedeljak) → Path A reactivated
- Barać: NEMA arxiv first-author submission + e-business domain mismatch → cannot endorse
- LinkedIn 1st-degree network sweep (Bojan Djuric verified 2026-05-02): no arxiv-eligible candidate match without cold outreach
- Marko 2026-05-02 verdict: cold outreach is out of scope for current sprint

**Path A — PRIMARY (Marko-side action sutra):** Pavlukhin podnosi EVOLVESCHEMA na arxiv kao standalone short preprint (4-6 strana, cs.AI primary). Posle arxiv approval (~24h), Pavlukhin postaje cs.AI/cs.LG eligible endorser. **Critical insight:** Pavlukhin NE MORA biti coauthor našeg paper-a — endorses kao nezavisni researcher kroz EVOLVESCHEMA author credentials. Single email request to direct contact, NE cold outreach. Timeline: 3-5 dana Pavlukhin draft + 24h approval = ~5-6 dana to endorsement-ready. Compatible sa Day 0 ETA 6-10 dana.

**Path D — FALLBACK + DECOUPLING:** Day 0 launch ne treba biti gated na arxiv preprint timing. Landing trust signal "Published methodology — arxiv preprint" (Trust Band Card 4 placeholder + Sources reference) zamenjuje se sa "Open methodology — github.com/marolinik/waggle/docs/methodology" (markdown doc u OSS repo). Credibility signal ostaje (open methodology = open source rigor), arxiv timing više nije launch dependency. Posle arxiv preprint linkujemo retroactively kao news cycle update.

**Landing copy implications (apply paralelno sa Track D apps/www port):**
- Trust Band Card 4 swap: "Published methodology — arxiv preprint" → "Open methodology — github docs"
- Footer Research column: "arxiv preprint" link → defer to placeholder ili remove until arxiv preprint dođe
- Hero Variant D Sasha (developer): no copy change needed (no arxiv mention)
- Proof Card 1 GEPA: keep "Methodology in arxiv preprint" — to je forward reference, cleanly fulfilled when Path A succeeds OR replace sa "Methodology in companion docs" if delayed

**PM action queue (sutra 2026-05-03):**
- Marko 1-line Pavlukhin message za EVOLVESCHEMA arxiv submission timing
- PM update Track D apps/www CC sesija D §3 acceptance review sa Trust Band Card 4 copy swap
- PM draft methodology markdown doc skeleton za github (post Day 0 link target)

**3. Endorsement path — DEFERRED:** Marko asked "kako da proverim ko od mojih kontakata ima prior arxiv publications" — PM follow-up sa 3 actionable proverava metoda (vidi §1bis below).

**4. Multiplier section disposition — RATIFIED with sharper framing:**

**NOT** "Branch B prerequisites for re-test (deferred)" — that reads evasive after Zep/Mem0 dispute reviewer-instinct.

**INSTEAD:** Eksplicitna "Negative Result" subsekcija u §6 Discussion sa 5 elementa:
1. Hypothesis statement
2. N=12 protocol
3. Numbers verbatim: h2=1/3, h3=0/3, h4=0/3
4. Preconditions for re-test imenovane: B-frame compaction stability, harvest timestamp fix, minimum N
5. Qualification: "ne aplicira na primary contribution (substrate-vs-Mem0 + methodology gap)"

"Deferred" ide u footnote, NE u headline. Negative result se hvata u CV publikacije jer je honest, ne uprkos tome.

**5. GEPA scope u §5.4 — RATIFIED (a) sa companion paper signal:**

Zadržava ~1.5 page §5.4 sub-section. PLUS footnote: *"Extended cross-family treatment in companion paper, in preparation."*

Marko rationale: standalone §5 GEPA bi te koštao desk-reject rizika ("this is two papers stitched together") što ne želiš na prvoj submisiji. Cross-family generalization sa GEPA Faza 1 je dovoljno jako da nosi sopstveni arxiv preprint za 6-8 nedelja sa ERL methodology framing. Footnote daje opciju za drugi launch ciklus bez current commitment. Ako kapaciteta za companion paper nema, footnote se izostavi pre submission.

**6. §5.5 framing — RATIFIED with active-voice rewrite:**

NOT "methodology maturity demonstration" — chita se defanzivno, apologetičko.

INSTEAD: **"Bias-detection guardrails functioning as designed"** — aktivan claim sa proverim outcome:
- "GPT selection bias **detected and filtered** by held-out validation at N=..."
- "Qwen-non-thinking decoupling probe **revealed** effect Z magnitude"
- "Calibration **evolved** across Amendments 7-11 with adjustments documented in Appendix"

Aktivni glagoli protiv pasivnih: "guard-rail caught and filtered" vs "bilo je pažljivo." Druga formulacija nosi metodološku težinu, prva zvuči apologetski.

**7. Phase 5 forward reference — RATIFIED with two terminological refinements:**

REVISED forward reference statement:
*"Production traffic Pass II rates, p95 latency, and recall@K on production traffic distribution from Phase 5 deployment will be reported in v2 of this preprint, scheduled within 60 days post-publication."*

Refinement 1: "expected ~6 weeks" → "scheduled within 60 days" (operational discipline signaling + 14-day margin if Phase 5 slips two weeks; missed v2 datum bi bio credibility liability za naredni paper).

Refinement 2: imenovati konkretne metrike (Pass II rates + p95 latency + recall@K) — vague forward reference izgleda kao vaporware; specifična obećana metrika izgleda kao discipline.

---

**Marko net evaluation note (2026-05-02):** PM intencije su sve ispravne; tri od četiri framing-a (4, 6, 7) treba da se pomere stepenicu ka aktivnijem, ne dodatak na sadržaj. Cilj nije da paper deluje skromno ili pažljivo — cilj je da deluje **tačno**.

Posle ovih ratifikacija, drafting kick-off može da krene paralelno sa rešavanjem Co-author 2 + Endorsement path.

---

## §1bis — Endorsement path actionables (PM follow-up za Decision 3)

Marko question: "kako da proverim ko od mojih kontakata ima prior arxiv publications". 3 metoda po brzini:

**Method A — arxiv search (5 min per name):**
1. Otvori https://arxiv.org/search
2. Unesi "FirstName LastName" u Author search
3. Filter: cs.AI, cs.CL, cs.LG (relevant categories)
4. Ako se pojavi makar 1 paper kao first author → endorsement candidate. Ako appears samo kao co-author → weaker, endorsement may still work ako paper je u cs.AI specifically (arxiv requires first-author publication u target category).

**Method B — Google Scholar (3 min per name):**
1. Otvori https://scholar.google.com
2. Search "FirstName LastName" + relevant keyword (e.g., "memory" or "agent")
3. Ako ima Scholar profile → click → vidi publication list. cs.AI/cs.CL papers = endorsement potential.
4. Bonus: h-index ≥3 u relevant category = strong endorser.

**Method C — Brain dump → PM verifies:**
Marko mi da listu 10-20 imena (LinkedIn 1st-degree connections u academic + AI research). PM uradi Method A + B za svaki kroz web search. Output je rang-lista candidates sortirana po endorsement probability + first-message draft za top 3.

**PM preporuka:** Method C najbrži za Marka (sve što treba je brain-dump 20 imena), ja u 30-45 min vratim ranked list. Pavlukhin kao confirmed Co-author 1 — proveriti da li ima cs.AI prior publications (ako da, automatic auto-endorsement, NEMA need za external).

Plus za Co-author 2 methodology consult — kandidati koji dolaze iz EVOLVESCHEMA, GEPA (Agrawal), ACE (Zhang) author networks su strong (već su empirical AI rigor). Pavlukhin može introduce.

---

## §2 — Section structure (10 sekcija, ~10-13 strana)

### Abstract (≤ 250 words)

Three-claim structure (preserved iz v1):
1. Architectural separation of memory substrate from retrieval is novel and methodologically important.
2. Substrate beats peer-reviewed Mem0 on LoCoMo oracle ceiling: 74% vs 66.9%.
3. We document +27.35pp self-judge bias; we propose trio-strict ensemble as remedy.

NEW fourth claim (per §5.4 refresh):
4. Genetic-evolutionary prompt adaptation (GEPA) on Waggle harness produces +12.5pp Pass II uplift on held-out validation; method generalizes cross-family (Claude flagship + Qwen 35B open-source); on-prem Qwen achieves Opus-class quality on validated samples.

Word budget: 230-250 words.

### 1. Introduction (~1 page)

Subsections:
- 1.1 Problem framing (LLM agents lack persistent memory; products bundle layers; independent measurement impossible)
- 1.2 Why substrate-retrieval separation matters (no one knows which layer to improve)
- 1.3 Contributions (4 — architectural + empirical + methodological + GEPA cross-family + open)
- 1.4 What this paper is not (no system-level competitive claim, V1 retrieval acknowledged)

### 2. Related Work (~1 page)

Subsections (preserved iz v1):
- 2.1 Memory systems for LLMs (Mem0, MemGPT, Letta, LongMem, GraphRAG)
- 2.2 Long-term conversational memory benchmarks (LoCoMo, LongMemEval; Gaia2 + τ³ za future work mention)
- 2.3 Methodology critiques in LLM evaluation (self-judging bias, judge ensembles, reproducibility)
- 2.4 NEW: Genetic-evolutionary prompt adaptation (Agrawal et al. 2025 GEPA, Pavlukhin et al. 2025 EvolveSchema)
- 2.5 NEW: Experiential reflective learning (ERL — arxiv:2603.24639; Waggle bitemporal-KG-conditioned extension framing)
- 2.6 NEW: Closed-learning-loop agents (Hermes Agent positioning differentiation)

### 3. Architecture (~2 pages)

Subsections (preserved iz v1):
- 3.1 Substrate: bitemporal knowledge graph
- 3.2 Memory compression: I/P/B frame analogy (MPEG-4 inspired)
- 3.3 Retrieval interface (intentionally pluggable)
- 3.4 Audit + governance layer (EU AI Act compliance, sovereign deployment)

### 4. Methodology (~1 page)

Subsections (preserved iz v1):
- 4.1 LoCoMo-1540 evaluation protocol (5 cells, 5 question types)
- 4.2 Trio-strict judge ensemble (Opus + GPT + MiniMax, κ_trio = 0.79)
- 4.3 Apples-to-apples re-judging (GPT-4o-mini self-judge methodology re-eval)
- 4.4 Pre-registration & reproducibility (manifest v6 frozen, git SHA, seeds locked)
- 4.5 NEW: GEPA evolution methodology (manifest v7 + 11 amendments, held-out validation, §F gates)

### 5. Experiments & Results (~4-5 pages)

#### 5.1 Substrate quality (oracle ceiling)
- Claim: 74% trio-strict (N=400)
- Compared: Mem0 peer-reviewed 66.9% basic / 68.4% graph
- Headline: +7.1pp over peer-reviewed baseline
- Statistical test: Fisher one-sided p < 8.07e-18 vs no-context (H1 PASS)

#### 5.2 Methodology bias quantification
- Self-judge: aggregate +X.X% inflation
- Trio-strict: true performance band
- Measured gap: **+27.35pp**
- Implication: published "91.6% LoCoMo SOTA" claims likely 18-30pp inflated

#### 5.3 V1 retrieval performance
- Retrieval cell: 48% trio-strict
- Honest: 26pp below substrate ceiling
- Direction: 5 specific improvements identified (community contribution invitation)

#### 5.4 GEPA Evolution + Cross-Family Generalization (NEW, ~1.5 page)
Subsections:
- 5.4.1 GEPA evolution methodology summary (~0.3 page)
- 5.4.2 Cross-family generalization results (~0.5 page) — table:
  - claude::gen1-v1: +12.5pp in-sample / +12.5pp held-out / 0pp gap
  - qwen-thinking::gen1-v1: +12.5pp / +12.5pp / 0pp
  - gpt::gen1-v2: +25.0pp / +5.0pp / 20pp gap (FAIL §F.5 cond_2)
  - §F.1 PASS 3/3, §F.5 cond_2 PASS 2/3
- 5.4.3 Qwen 35B = Opus-class on out-of-distribution (~0.4 page)
  - Retrieval engagement 2.231 = 96% Opus parity
  - Pass II 100% on N=13 (8 in-sample + 5 held-out)
  - Sovereign deployment without flagship-tier compromise
- 5.4.4 Phase 5 deployment status (~0.2 page) — both AUTHORIZED variants
- 5.4.5 Pilot 2026-04-26 disposition (~0.1 page) — multiplier conditional finding

#### 5.5 Scoping Discussion (NEW, ~1.2 page)
4 methodological findings:
- 5.5.1 gpt selection bias exposed by held-out methodology (~0.3 page)
- 5.5.2 qwen-non-thinking retrieval-quality decoupling (~0.3 page)
- 5.5.3 generic-simple necessary-but-not-sufficient retrieval (~0.2 page)
- 5.5.4 Calibration evolution Amendments 7-11 (~0.4 page)

#### 5.6 Phase 5 Production Validation Hook (NEW, ~0.2 page)
Forward reference za v2 preprint sa production traffic results.

### 6. Discussion (~1-2 pages)

Subsections:
- 6.1 Substrate-retrieval separation as paper contribution
- 6.2 Sovereignty axis (local-first + Apache-2.0; KVARK secondary downstream)
- 6.3 Cross-family generalization implications (NEW per §5.4)
- 6.4 Limitations (single benchmark + retrieval gap + multiplier conditional)

### 7. Future Work (~0.5 page)

- Retrieval V2 (entity-aware reranking, hybrid scoring)
- Cross-dataset replication (LongMemEval + Gaia2 + τ³-bench banking_knowledge — per benchmark portfolio Phase 3 + Phase 4 sprints)
- Faza 2 sprint (gpt N=16 re-validation + scoping investigations)
- Multiplier thesis at scale (Branch B prerequisites)
- ERL methodology extension (per arxiv:2603.24639) submission MemAgents Workshop

### 8. Conclusion (~0.25 page)

Restate 4 contributions. Restate Apache-2.0 community invitation.

### 9. Acknowledgments

- Anthropic (Claude AI assistance, explicit per ICML/NeurIPS/arxiv standards — Claude does NOT appear as author)
- LiteLLM gateway za multi-vendor judge orchestration
- LoCoMo dataset authors

### 10. References (~30-50 BibTeX entries)

Categories:
- Memory systems (Mem0, MemGPT, Letta, LongMem, GraphRAG): 8-10
- Conversational memory benchmarks (LoCoMo, LongMemEval): 5-7
- LLM evaluation methodology (judge bias, ensembles): 6-10
- Genetic-evolutionary prompt adaptation (GEPA, EvolveSchema): 3-4
- Experiential reflective learning (ERL): 2-3
- Bitemporal databases + KGs: 4-6
- MPEG-4 video compression analogy: 2-3
- Reproducibility & pre-registration: 3-5

---

## §3 — Claim trace (where each numerical claim comes from)

Preserved iz v1 sa NEW additions:

| Claim | Source artifact | Verification path |
|---|---|---|
| 74% oracle ceiling | `benchmarks/results/v6-trio-strict/oracle-context-*.summary.json` | Stage 3 v6 N=400 |
| 66.9% Mem0 baseline | Mem0 paper Table 2 | arxiv:2504.19413 |
| +7.1pp gap | direct subtraction | verified |
| Fisher p < 8.07e-18 | Stage 3 v6 H1 | `benchmarks/results/v6-trio-strict/h1-fisher-result.json` |
| +27.35pp self-judge bias | Apples-to-apples re-eval | `benchmarks/results/v6-self-judge-rebench/` |
| κ_trio = 0.79 | Stage 3 v6 calibration | `benchmarks/calibration/2026-04-24-trio-strict-recal.json` |
| +12.5pp held-out (claude::gen1-v1) | Faza 1 §F.1 PASS | `decisions/2026-04-29-gepa-faza1-results.md` |
| +12.5pp held-out (qwen-thinking::gen1-v1) | Faza 1 §F.1 PASS | same |
| 0pp held-out gap (claude + qwen-thinking) | §F.5 cond_2 PASS | same |
| 20pp gap (gpt::gen1-v2 FAIL §F.5 cond_2) | held-out vs in-sample | same |
| 96% retrieval parity (qwen-thinking) | retrieval 2.231 / Opus 2.33 | Faza 1 evidence |
| 100% Pass II combined N=13 | Faza 1 Checkpoint C | same |
| 11 amendments manifest v7 | Faza 1 manifest chain | `decisions/2026-04-29-gepa-faza1-results.md` §11-amendment chain |

Every numerical claim mora trace to JSON artifact + git SHA + manifest anchor. No hand-computed numbers u paper text.

---

## §4 — Authoring sequence

**Day 0 (today, 2026-04-30):** This skeleton authored. Pending Marko 7 decision points ratifikacija.

**Day 1 (post-ratifikacija):** PM autoring abstract + introduction (~1500 words).

**Day 2:** PM autoring related work + architecture (~3000 words).

**Day 3:** PM autoring methodology (~1500 words).

**Day 4-5:** PM autoring experiments & results — heavy lifting (~5000 words sa §5.4 + §5.5 + §5.6 detail).

**Day 6:** PM autoring discussion + future work + conclusion (~2000 words).

**Day 7:** PM autoring acknowledgments + references (BibTeX entries).

**Day 8-9:** Internal review (Marko + co-authors) + revisions.

**Day 10:** LaTeX formatting + final polish + arxiv submission.

ETA submit: Day 10 wall-clock from ratifikacija. Posle submission, preprint live within 1-2 days.

---

## §5 — Cross-references

- v1 outline: `00-paper-outline.md`
- §5 refresh: `02-section-5-refresh-2026-04-30.md`
- Faza 1 closure: `decisions/2026-04-29-gepa-faza1-results.md`
- Pre-launch sprint consolidation: `decisions/2026-04-30-pre-launch-sprint-consolidation-LOCKED.md`
- Benchmark portfolio refresh: `briefs/2026-04-29-benchmark-portfolio-refresh-2026-venues.md`
- This skeleton: `research/2026-04-26-arxiv-paper/03-paper-skeleton-v2-2026-04-30.md`

---

**End of skeleton. Awaiting Marko 7 decision points ratifikacija → drafting kick-off.**
