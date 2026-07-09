# Tri-Benchmark Memory-Systems Paper — OUTLINE (for team-lead approval)

**Status:** outline only, no section prose. Awaiting KORRO human-in-the-loop sign-off before any section is written.
**Deliverables covered:** (1) 3 candidate titles, (2) thesis + worldview, (3) full section outline with per-section topic sentences + figure/table + evidence source, (4) figure/table plan, (5) claim-evidence map, (6) blog-post variant.
**Primary evidence base:** `benchmarks/results/MEMORY-BENCHMARKS-CONSOLIDATED-2026-07.md`; `docs/paper/2026-06-12-locomo-sota-arxiv-draft.tex`; `benchmarks/results/beam/{mem0-0641-pipeline-analysis,forensics-p2p-losing-abilities,forensics-retrieval-headroom,forensics-temporal}.md`; `benchmarks/results/locomo-sota-2026-06/`; LongMemEval `RESULTS.md` (hive-mind workspace).

---

## 1. Candidate Titles

Per `title.md`: write one of each type; the best is often the one first rejected. Each names the three benchmarks and/or the striking number, avoids "Novel/Towards/On the."

1. **(Provocation)** *"Clever Memory Loses: A Single Simple Substrate Is State of the Art on LoCoMo, LongMemEval, and BEAM"*
   - Rationale: leads with the counter-intuitive claim (structure/distillation/graphs *lose*), then earns it with three named incumbents. The provocation is the entire thesis in five words.

2. **(Concept name)** *"Conflict-Aware Raw-Turn Memory: State-of-the-Art Long-Term Recall Without Distillation, Graphs, or Routing"*
   - Rationale: installs the concept we want cited — *conflict-aware raw-turn memory* — and the subtitle names the three "clever" mechanisms it beats. The name is the linguistic currency (`impact.md` Principle 5, `ideation.md` Protocol 7).

3. **(Descriptive precision)** *"Simple Memory Beats Clever Memory: Three Long-Term-Memory SOTAs and 37 Falsified Interventions Under Each Incumbent's Own Protocol"*
   - Rationale: the understated-confidence register (`title.md` Type 3) that carries the two stickiest numbers — *three SOTAs, 37 falsified levers* — and the fairness hook (*own protocol*) that pre-empts the "cross-lab noise" reviewer.

*(Working shortlist favorite: #1 as title, #2's concept name threaded through the paper as the named contribution. Decision deferred to team lead.)*

---

## 2. Thesis and Worldview (per `impact.md` + `ideation.md`)

**One-sentence thesis (no jargon):**
> Across all three major long-term-memory benchmarks, a deliberately dumb memory — the original dated conversation turns, retrieved per conversation, with contradictions *kept* rather than reconciled — beats every state-of-the-art system that distills, structures, graphs, or routes its memories, and we measured 37 "clever" additions, ~90% of which made it *worse*.

**Worldview destroyed:** "Better agent memory means *cleverer* memory — richer structure (knowledge graphs, entity reconciliation, atomic-fact distillation), learned routing, and test-time ensembling. The frontier is engineering more intelligence *into the memory path*."

**Worldview installed:** "The memory path should stay dumb. Distillation, reconciliation, and routing are mostly self-inflicted information loss; a substrate that preserves raw dated turns and *surfaces* conflicts instead of silently resolving them is the state of the art. This is the Bitter Lesson for agent memory."

**Memorability hooks (deploy ≥2, `impact.md` P5):**
- **The Number:** "37 interventions measured, ~90% falsified." Secondary: "+23pp on the benchmark's hardest ability (contradiction)."
- **The Analogy:** Sutton's *Bitter Lesson* — hand-engineered structure loses to simple methods that leverage the raw data/compute. Here: distilled facts / KGs lose to raw dated turns.
- **The Name:** *conflict-aware raw-turn memory* (contribution) and *the falsification ledger* (the negative-results artifact).

**Inevitability arc (`impact.md` P4) — section-to-phase mapping is enforced in §3 below.**

---

## 3. Full Section Outline (arXiv preprint)

> Convention below: each section lists 3-6 **topic sentences** (first-sentence-of-paragraph messages, per `introduction.md` checklist), the **figure/table** that lands there, and the **evidence source file/number**.

### 3.1 Abstract  *(Template B: Challenge → Insight → Contribution, `abstract.md`)*
- **Topic 1 (task):** Long-term conversational memory — answering over weeks of prior dialogue — is the load-bearing capability for durable AI assistants, and three benchmarks (LoCoMo, LongMemEval, BEAM) are the field's rulers.
- **Topic 2 (challenge):** Every published leader adds structure to the memory path — atomic-fact distillation, temporal knowledge graphs, write-time entity reconciliation, learned routing, test-time ensembling.
- **Topic 3 (insight):** These are lossy. Distillation strips the dates and specifics the rubrics reward; write-time reconciliation *silently resolves* contradictions the rubrics want surfaced.
- **Topic 4 (contribution):** One simple substrate — per-conversation minds, verbatim dated raw-turn retrieval, and a conflict-*preserving* answer policy — is SOTA on all three under each incumbent's own published protocol (LoCoMo 86.49 vs 81.95; LongMemEval 95.01 macro vs 94.87; BEAM 0.6482 / 74.0% vs 0.6409 / 70.1%).
- **Topic 5 (benefit / negative results):** We measured 37 constructive interventions across two programs; ~90% lost to the simple substrate — negative results reported as a first-class contribution (the *falsification ledger*).
- **Topic 6 (experiment summary):** The single differentiator is conflict-awareness: +23pp on BEAM contradiction_resolution. All protocols, per-question artifacts, and the empty-answer-heal disclosure are released.
- **Figure/Table:** none (abstract). **Evidence:** consolidated lines 7-11, 66-89.

### 3.2 Introduction  *(logic map from `introduction.md`; Version A4 "open with challenge")*
- **Topic 1:** A system that cannot recall what its user said three weeks ago cannot be a durable collaborator; LoCoMo, LongMemEval, and BEAM operationalize this and now anchor a public leaderboard race.
- **Topic 2 (SOTA + root issue):** The leaders differ in representation (Mem0 atomic facts, Zep temporal KG, Memori triples, Mastra, mem0-platform reconciled facts) but agree on one premise: cleverer structure on the memory path is the path forward.
- **Topic 3 (the crack in the worldview):** Yet each incumbent's own weakest ability traces to its own cleverness — mem0's write-time reconciler is its worst on contradiction (0.357); distillation is worst on fine-grained recall.
- **Topic 4 (our contribution, `impact.md` "make the reader the hero"):** We show a single dumb substrate is SOTA on all three, and — more useful to practitioners — we publish 37 measured interventions so the community stops paying the distillation/routing tax.
- **Topic 5 (contribution list):** (i) three same-protocol SOTAs; (ii) conflict-aware raw-turn memory as the named mechanism; (iii) the falsification ledger; (iv) an evaluation-protocol-fidelity methodology that exposed leaderboard-metric chaos.
- **Topic 6 (why now / hindsight, `ideation.md` Test B/C):** The enabling shift is long-context answerers (gpt-5) that can consume raw turns directly — making distillation not just lossy but unnecessary; in hindsight, "of course you shouldn't throw away the data before the model reads it."
- **Figure/Table:** **Table 1** (headline tri-benchmark summary). **Evidence:** consolidated lines 7-11; tex Introduction §.

### 3.3 Related Work
- **Topic 1 (memory systems on LoCoMo):** Mem0 (atomic facts), Zep/Graphiti (temporal KG), LangMem (profiles), Memori (timestamped triples, prior SOTA 81.95); MemR3 is an agentic multi-round retrieval pipeline, classed separately. *(reuse tex Related Work verbatim-adjacent.)*
- **Topic 2 (LongMemEval line):** Mastra (94.87 macro) and mem0-platform (93.4, GPT-5 judge) as incumbents; note the judge-model divergence up front.
- **Topic 3 (BEAM line):** mem0 memory-platform pipeline (2-turn-chunk write-time reconciliation, top-200 dated facts, chronological render) as the ICLR-2026 reference (0.6409 / 70.1%).
- **Topic 4 (the common commitment we break):** Every system above commits to a *dominant derived representation* and to *write-time resolution* of conflicts; none retains raw dated turns as the primary answer substrate or preserves both sides of a contradiction.
- **Topic 5 (where we differ):** We layer representations over a common frame store but let the answer path draw verbatim raw turns first; the benchmark categories are won by *different* representations, and a substrate that serves all simultaneously beats any single-representation system. *(tex Related Work "Where Hive Mind differs.")*
- **Figure/Table:** none. **Evidence:** tex Related Work; consolidated line 87; mem0-0641 pipeline analysis §"The pipeline, step by step."

### 3.4 The Substrate (Architecture)  *(`impact.md` arc Phase 4 "resolution")*
- **Topic 1 (storage core):** Memory is stored as typed frames (Information / Preference / Belief) plus verbatim per-turn frames in per-conversation "minds"; retrieval is hybrid dense (nomic-embed) + FTS5 BM25 with RRF fusion and optional cross-encoder rerank — fully local.
- **Topic 2 (the primary lane is raw):** Unlike the incumbents, the answer context is built from *dated verbatim raw turns* retrieved per conversation, date-stamped `[YYYY-MM-DD]`; distilled layers are auxiliary, not the substrate.
- **Topic 3 (write-time dating, the one thing we DO transform):** Relative dates are resolved at write time ("yesterday" in an 8 May session → 7 May event) — the single distillation that survived, because it adds information rather than removing it.
- **Topic 4 (conflict-preserving policy — the differentiator):** The answer policy *retains both sides* of a conflict and instructs the model to state the contradiction and ask which is correct, rather than reconciling at write time; this is the mechanism behind the BEAM contradiction win.
- **Topic 5 (answer policy):** Conditional abstention (commit on factual spans when an anchor exists; abstain only when truly absent), granularity-calibrated dates, commit-to-one-option — tuned to what rubrics reward, not to prose quality.
- **Topic 6 (one substrate, three protocols):** The *same* substrate is evaluated under three different answerers/judges by swapping only the protocol harness — no benchmark-specific memory engineering.
- **Figure/Table:** **Figure 1** (substrate architecture: minds → I/P/B frames + raw dated turns → hybrid retrieval → assembler lanes → conflict-aware answer policy). **Evidence:** tex §"The Hive Mind substrate"; consolidated lines 59-64.

### 3.5 Evaluation Protocol Fidelity (the metric-audit methodology)  *(`impact.md` arc Phase 2-3 "tension + diagnosis"; the honest-metrics thread)*
- **Topic 1 (why a whole section):** Cross-lab long-term-memory numbers are noise; the only defensible comparison is *same judge, same protocol, reproduced pipeline* — so we first reproduce each incumbent before comparing.
- **Topic 2 (LoCoMo fidelity):** We reproduced Memori's own pipeline to 81.98 vs their published 81.95 before any comparison, restoring image-caption input parity (protocol compliance, not architecture).
- **Topic 3 (LongMemEval metric chaos):** The leaderboard mixes metrics — Mastra's 94.87 is *macro* (category mean), mem0's 93.4 used a *GPT-5* judge not the official GPT-4o; we report both macro (95.01) and micro (93.60) under the official GPT-4o judge, the most conservative cell on the board.
- **Topic 4 (BEAM metric chaos):** mem0's shipped 0.641 result file is *gpt-5/gpt-5*, though the repo README defaults imply gpt-4o/gpt-4o — an answerer/judge confound we neutralize by matching gpt-5/gpt-5, and we report *both* pass-rate (headline) and avg-score (within noise).
- **Topic 5 (full disclosure principle):** We disclose the empty-answer-heal bug (56 rows, reasoning-budget cap), keep the pre-heal snapshot, and report judge-noise bands (SE ≈ 0.014 on BEAM avg) — the anti-cherry-pick posture.
- **Figure/Table:** **Table 6** (protocol-fidelity / metric-audit matrix: per benchmark — what the leaderboard reported, judge model, macro-vs-micro, README-vs-actual, our reported cell). **Evidence:** mem0-0641 pipeline analysis §"Headline finding"; consolidated lines 38-40, 91-96; forensics-p2p §2 (empty-answer bug).

### 3.6 Results (three benchmarks)  *(`impact.md` arc Phase 4)*
- **Topic 1 (LoCoMo):** 86.49% (1332/1540) under Memori's protocol, +4.54pp (one-sample z=4.64, p<10⁻⁵), leading every category among memory systems and statistically at the full-context ceiling on open-domain; verified drift-free (fresh regen on HEAD reproduced 86.49 exactly).
- **Topic 2 (LoCoMo field correction):** We correct a column-scrambling error propagating through the literature (LangMem's cited "temporal 86.92" is its single-hop; true temporal 61.06) and re-run Mem0 same-judge (we lead every category, temporal +30.8pp).
- **Topic 3 (LongMemEval):** 95.01 macro / 93.60 micro (468/500), SOTA under the leader's own macro metric; the arc from 75.9 was won by four answer-side survivors, not by richer memory.
- **Topic 4 (BEAM headline):** 0.6482 avg / 74.0% pass (700 Q, gpt-5/gpt-5, top-30 raw turns) vs mem0 0.6409 / 70.1%; pass-rate +3.9pp (~2.3 SE, statistically real), avg +0.007 within noise (both reported).
- **Topic 5 (BEAM differentiator):** contradiction_resolution 0.588 (87.1% pass) vs mem0 0.357 (48.6%) — **+23pp on the benchmark's hardest ability** — plus abstention +6.8pp and information_extraction +4.0pp; the losses are concentrated in coverage abilities (summarization −7.4, temporal −6.1).
- **Topic 6 (efficiency framing):** BEAM SOTA at top-30 raw turns beats mem0's top-200 facts (4× depth buys them only +0.037) — compactness of *raw* beats depth of *distilled*; total program spend ≈ $160.
- **Figure/Table:** **Table 2** (corrected LoCoMo landscape), **Table 3** (LongMemEval intervention arc), **Table 4** (BEAM per-ability vs mem0). **Evidence:** consolidated §1-§3 (lines 17-89); tex Table `tab:field`; mem0-0641 §"Second finding" (top-200 vs top-50).

### 3.7 The Falsification Ledger (negative results)  *(the first-class contribution; `ideation.md` Protocol 3 territory map)*
- **Topic 1 (framing):** We treat negative results as the product: 37 constructive interventions across two independent programs (23 LongMemEval + 14 BEAM), ~90% falsified against the simple substrate.
- **Topic 2 (compression/distillation loses):** Distilled-fact retrieval (k=100 → 0.354, k=200 → 0.382) and every raw+fact hybrid (0.498-0.540) lost — facts are net-harmful at *any* mix because they strip dates/numbers; the session-outline preamble diluted summarization 0.38→0.16.
- **Topic 3 (routing loses):** Gold-blind ability routing hit a 40% classifier ceiling (0.584 < 0.600) — abilities are not text-identifiable; coverage-shaped/stratified retrieval lost to similarity-dense clusters (summ 0.38→0.24).
- **Topic 4 (prompt engineering plateaus):** Strict-abstention (0.542), exhaustive-enumeration (−0.048; summ −0.119), and temporal-commit (+0.023, below re-roll variance) prompts all failed to beat the plain conflict-aware v2 prompt.
- **Topic 5 (ensembling loses):** Answer-merge self-ensemble (0.668/0.674) was within noise for 2× the cost; on LongMemEval all four *surviving* levers were answer-side (voting vh5, KG split-vote guard klc, preference critic pfc, routing-matrix completion h3u) — never memory-structure levers.
- **Topic 6 (the convergent conclusion):** Two programs, different benchmarks, same verdict — the local optimum is plain dated raw-turn retrieval + a conflict-aware prompt; cleverness on the memory path is measured self-harm.
- **Figure/Table:** **Table 5** (the falsification ledger — 37 rows: lever, program, score, why it lost, verdict), **Figure 2** (falsification scatter: intervention complexity vs Δscore, ~90% below the raw-turn baseline). **Evidence:** consolidated BEAM 14-lever table (lines 102-117), lines 44-45 + 124-126; LongMemEval `RESULTS.md`.

### 3.8 Analysis (why simple wins)  *(`impact.md` arc Phase 5 "map the new territory")*
- **Topic 1 (why simple wins — the mechanism):** Retrieval headroom forensics show 88-93% of *failed* nuggets were already retrieved at rank ≤30 — the bottleneck is answer-side synthesis, not retrieval depth, so adding structure/depth cannot help and distillation only removes what the answerer needed.
- **Topic 2 (contradiction case study — the differentiator):** mem0 solves knowledge_update via write-time UPDATE/DELETE but that *same* reconciler makes contradiction its floor (0.357); our retain-both-sides substrate scores 0.588 — the trade is intrinsic to write-time resolution, not a tuning gap.
- **Topic 3 (ability-level tradeoffs — honest):** Where we lose (summarization −7.4, event_ordering −4.2), the forensic cause is *coverage/clause density*, not memory quality — mem0's enumerative fact dumps (1067 vs 600 words, 48 vs 29 bullets) mechanically harvest more compound-nugget clauses; largely an answer-verbosity artifact of the rubric.
- **Topic 4 (temporal is disposition, not knowledge):** The BEAM temporal gap (−6.1) is 94% duration arithmetic; 74% of the loss is over-abstention + wrong-anchor (single-date-selection), and a chunk is irreducible gpt-5-self-judge phrasing variance — not a memory-representation deficit.
- **Topic 5 (what this means for the field):** The load-bearing levers are (a) keep the raw data, (b) resolve dates at write time, (c) preserve conflicts — everything else the field is building is optional at best, harmful at worst.
- **Figure/Table:** **Figure 3** (contradiction mechanism: write-time reconcile collapses to one side vs retain-both-surface; paired with the 0.588 vs 0.357 bar), **Table 7-inline** (retrieval-headroom rank distribution, small). **Evidence:** forensics-retrieval-headroom (rank table); forensics-p2p §5-§8 (coverage/verbosity); forensics-temporal §2-§3; mem0-0641 §"Ingestion."

### 3.9 Limitations  *(`ideation.md` Protocol 6 anti-paper pre-emption)*
- **Topic 1 (summarization/coverage gap):** We are genuinely behind on coverage-shaped abilities; whether the raw substrate can close it *without* the enumeration tax (which we showed backfires) is open.
- **Topic 2 (judge noise):** All scores are LLM-as-judge; we mitigate with fixed judges, archived per-question judgments, reproduced baselines, and reported noise bands — but absolute numbers are protocol-relative, and some BEAM deltas sit inside gpt-5-self-judge variance.
- **Topic 3 (single-substrate / single-answerer scope):** Each benchmark uses one answerer per its protocol; model-generality of the raw-turn design is untested, and LoCoMo token cost (3747 vs 1294) means there is no free ≤1500-token operating point — the raw lanes are load-bearing.
- **Topic 4 (token/cost honesty):** Raw-turn top-k is cheap at k=30 but scales super-linearly (k=100 ≈ 88K ctx tokens/question); distillation's appeal is cost, not quality — we win quality, they win the efficiency axis on LoCoMo.
- **Topic 5 (the empty-answer bug, disclosed):** The healed 56-row reasoning-budget bug is disclosed with a pre-heal snapshot; the residual post-heal gaps are the honest comparison.
- **Figure/Table:** none. **Evidence:** tex Limitations §; forensics-retrieval-headroom (k-cost table); forensics-p2p §2; consolidated lines 91-96.

### 3.10 Conclusion  *(`impact.md` P8 call-to-action; `ideation.md` Protocol 3)*
- **Topic 1 (restate the one thing):** One dumb substrate — dated raw turns, per-conversation, conflicts preserved — is state of the art on all three long-term-memory benchmarks.
- **Topic 2 (the bitter lesson):** 37 measured interventions say the field is over-engineering the memory path; the wins are in *not* discarding data and *not* resolving conflicts early.
- **Topic 3 (call to action):** All protocols, per-question artifacts, the falsification ledger, and the harness are open; the community can stop re-deriving the distillation/routing tax and audit its own leaderboard metrics.
- **Topic 4 (open territory):** (i) Can conflict-preservation be made cheap enough to also win coverage abilities? (ii) Is there a write-time transform *other than* date resolution that adds rather than removes? (iii) Does the raw-turn result hold under weaker/cheaper answerers, or is long-context the true enabler? (iv) What is the right rubric for "surfaced a contradiction correctly" vs "committed and got lucky"?
- **Figure/Table:** none. **Evidence:** consolidated line 124-126; tex Conclusion §.

---

## 4. Figure / Table Plan (~6 tables, ~3 figures)

| # | Artifact | Lands in | Exact data source |
|---|---|---|---|
| **Table 1** | Headline tri-benchmark summary (ours / best competitor / protocol / verdict) | Intro | consolidated lines 7-11 |
| **Table 2** | Corrected LoCoMo landscape (per-category memory systems + MemR3 + full-context ceiling) | Results §3.6 | tex `tab:field` (lines 389-403) |
| **Table 3** | LongMemEval intervention arc (75.9 → 95.01 macro / 93.60 micro, lever labels vh5/klc/pfc/h3u) | Results §3.6 | consolidated lines 41-43; `RESULTS.md` |
| **Table 4** | BEAM per-ability vs mem0 (10 abilities + overall avg + pass rate) | Results §3.6 | consolidated lines 68-81 |
| **Table 5** | **The Falsification Ledger** (37 levers: lever / program / score / why-lost / verdict) | §3.7 | consolidated BEAM table lines 102-117 (14) + `RESULTS.md` (23) |
| **Table 6** | Protocol-fidelity / metric-audit matrix (leaderboard-claim / judge model / macro-vs-micro / README-vs-actual / our cell) | §3.5 | mem0-0641 §"Headline finding"; consolidated lines 38-40 |
| **Figure 1** | Substrate architecture (minds → I/P/B + raw dated turns → hybrid retrieval → assembler lanes → conflict-aware policy) | §3.4 | tex §"The Hive Mind substrate"; consolidated 59-64 |
| **Figure 2** | Falsification scatter (intervention complexity vs Δscore; ~90% below the raw-turn baseline line) | §3.7 | consolidated 102-117; `RESULTS.md` |
| **Figure 3** | Contradiction mechanism diagram + bar (write-time reconcile → one side vs retain-both-surface; 0.588 vs 0.357) | §3.8 | mem0-0641 §"Ingestion"; consolidated line 70, 86-89 |
| *(inline mini-table)* | Retrieval-headroom rank distribution (≤30 answer-side 88-93%) | §3.8 | forensics-retrieval-headroom rank table (lines 40-44) |

---

## 5. Claim-Evidence Map (every headline claim → file/number)

| # | Headline claim | Number | Evidence source |
|---|---|---|---|
| C1 | LoCoMo SOTA | 86.49% (1332/1540), +4.54pp, z=4.64, p<10⁻⁵ | consolidated line 9; tex abstract + `tab:field` |
| C2 | LoCoMo reproduced baseline before comparing | 81.98 vs published 81.95 | tex §Experimental setup / Introduction contrib 1 |
| C3 | LoCoMo drift-free | fresh HEAD regen reproduced 86.49 exactly | consolidated line 9 |
| C4 | LoCoMo field-table correction | LangMem "temporal 86.92" = single-hop; true 61.06 | tex §"corrected LoCoMo field" |
| C5 | Mem0 re-run same-judge | lead every category, temporal +30.8pp | consolidated line ~; tex `tab:field` footnote (+32.7pp) |
| C6 | LongMemEval SOTA (macro) | 95.01 macro vs Mastra 94.87 | consolidated line 10; lines 38-43 |
| C7 | LongMemEval micro reported too | 93.60 micro (468/500), GPT-4o judge | consolidated line 10, 43 |
| C8 | LongMemEval levers | 23 measured, 4 adopted (vh5,klc,pfc,h3u), 19 falsified | consolidated lines 44-45; `RESULTS.md` |
| C9 | BEAM SOTA (pass rate) | 74.0% (518/700) vs 70.1% (491/700), +3.9pp ≈2.3 SE | consolidated lines 11, 81-84 |
| C10 | BEAM avg reported honestly | 0.6482 vs 0.6409, +0.007 within noise SE≈0.014 | consolidated lines 80, 83-84 |
| C11 | **Contradiction differentiator** | contradiction_resolution 0.588 vs 0.357 = **+23pp** | consolidated line 70, 86-89 |
| C12 | Why: mem0 reconciler is its own floor | write-time UPDATE/DELETE silently resolves; their weakest 0.357 | mem0-0641 §Ingestion (lines 43-49, 78) |
| C13 | Depth is not the lever | mem0 top-200 vs top-50: 4× depth = +0.037 | mem0-0641 §"Second finding" (lines 28-37) |
| C14 | Simple wins is answer-side | 88/90/93% of failed nuggets already at rank ≤30 | forensics-retrieval-headroom (lines 40-63) |
| C15 | Our losses are coverage/verbosity | mem0 answers 1067 vs 600 words, 48 vs 29 bullets | forensics-p2p §5 (lines 82-101, 263) |
| C16 | Temporal gap = disposition not knowledge | 94% duration arithmetic; 74% over-abstention + wrong-anchor | forensics-temporal §2-§3 (lines 72-118) |
| C17 | 37 levers, ~90% falsified | 14 BEAM (table) + 23 LME | consolidated 102-117; 44-45; 124-126 |
| C18 | Distillation is lossy | distilled k=100 → 0.354 vs 0.448 raw | consolidated line 104 |
| C19 | Empty-answer bug disclosed | 56 rows healed; pre-heal snapshot kept | consolidated 91-96; forensics-p2p §2 |
| C20 | Metric audit: hidden judge swap | mem0 BEAM 0.641 file = gpt-5/gpt-5 (README implies gpt-4o) | mem0-0641 §"Headline finding" (lines 5-24) |
| C21 | Cost | total BEAM program ≈ $160; LoCoMo 3747 vs 1294 tok/q | consolidated line 13; tex Limitations |

**Open dependency to resolve before writing:** C8 (LongMemEval 19 falsified levers) and Table 3/5 LME rows are sourced from `RESULTS.md` in the hive-mind workspace, not the waggle-os filesystem — pull that file into `benchmarks/results/longmemeval/` for citable line numbers before drafting §3.6-§3.7.

---

## 6. Blog-Post Variant Outline (800-1500 words)

**One insight:** "Simple memory beats clever memory — we measured 37 ways."
**Title candidates:** *"We Tried 37 Ways to Make AI Memory Smarter. 33 Made It Worse."* / *"The Bitter Lesson of Agent Memory."*
**Register:** `title.md` blog rule — click-worthy, not clickbait; lead with the number and the counter-intuitive result.

- **Hook (≈120 w):** The industry is racing to build cleverer memory for AI agents — knowledge graphs, fact distillation, entity reconciliation. We benchmarked a deliberately dumb alternative and it won on all three major benchmarks. Then we tried 37 ways to make it smarter; almost all made it worse.
- **The setup (≈150 w):** Three benchmarks (LoCoMo, LongMemEval, BEAM), each with a published SOTA. The honest-comparison rule: same judge, same protocol, reproduce the incumbent first. One substrate, no per-benchmark memory engineering.
- **The result in one table (≈120 w):** 86.49 vs 81.95 / 95.01 vs 94.87 / 74.0% vs 70.1% — with the caveat we're transparent about (avg-score is within noise on BEAM; pass-rate is the real win).
- **The counter-intuitive core (≈250 w):** The falsification ledger. Distillation strips the dates and specifics the questions ask for. Routing hits a classifier ceiling. Ensembling costs 2× for nothing. The one transform that helped — resolving "yesterday" to a real date at write time — *adds* information instead of removing it. Bitter Lesson analogy.
- **The differentiator (≈250 w):** Conflict-aware memory. Competitors reconcile contradictions when they *write* memory — which silently deletes one side. We keep both and surface them. Result: +23pp on the hardest ability. The vivid example: "you said 10 vector-field problems here, and 15 there — which is right?" vs a system that already threw one number away.
- **The honesty section (≈200 w):** Where we lose (coverage/summarization), why (answer verbosity gaming compound rubrics, not memory quality), and the metric mess we found (macro vs micro, GPT-5 vs GPT-4o judges, README-vs-actual protocols) — plus the empty-answer bug we disclosed.
- **The takeaway / CTA (≈150 w):** Stop over-engineering the memory path. Keep the raw data, date it at write time, preserve conflicts. Everything is open — protocols, per-question records, the ledger. Link to the arXiv preprint.
- **Sticky elements:** the number (37 / ~90%), the analogy (Bitter Lesson), the contradiction example (10 vs 15 problems), one figure (the falsification scatter, Figure 2 reused).

---

## 7. Pre-Writing Gate Check (`ideation.md` decision gate — all filled)

1. **One-sentence insight:** raw dated turns + preserve conflicts beats distill/graph/route — measured on 3 benchmarks, 37 falsified levers.
2. **Why nobody before:** everyone assumed richer structure = better memory; long-context answerers only recently made raw-turn feeding viable (Why-Now).
3. **Hindsight verdict:** "of course you shouldn't delete the data before the model reads it, and of course you shouldn't resolve a contradiction the user asked about."
4. **Abstraction (verb form, domain-free):** *preserve the raw signal and the conflicts; transform only when the transform adds information.*
5. **The name:** *conflict-aware raw-turn memory* / *the falsification ledger*.

**Anti-paper pre-emptions staged (Protocol 6):** cross-lab noise → same-protocol reproduction (§3.5); "avg-score is within noise" → we lead on pass-rate and say so (§3.6, C10); "you lose on summarization" → shown to be rubric-verbosity artifact, stated as limitation (§3.8/§3.9); "judge is unreliable" → fixed judge + noise bands + disclosure (§3.5/§3.9).
