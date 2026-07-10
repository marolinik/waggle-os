# Talk Deck Outline: 15-Minute Conference Talk

**Title:** Clever Memory Loses
**Subtitle:** A single simple substrate is state of the art on LoCoMo, LongMemEval, and BEAM
**Speaker:** Marko Marković (KORRO / hive-mind)
**Length:** 15 minutes, 14 slides.

Story arc (one narrative spine, no detours): cold open (the follower-count contradiction) to the wall (everyone builds cleverer memory) to the mechanism where clever becomes the weakness to the one dumb idea to fair measurement to the 37 levers to the reveal that 33 lost to the three receipts to the bitter-lesson close.

Design rules (from the presentation format guide): one message per slide, six lines of text maximum, 24pt minimum font, figures legible from the back, no em dashes, consistent color scheme with the paper. Total speaking budget below sums to roughly 15 minutes; the timings are a pacing guide, not a script.

---

## Slide 1: Title (0:10)

**Title:** Clever Memory Loses
**The one message:** The dumbest design on the board wins all three benchmarks.
**Visual:** Title, subtitle, author, venue. A faint background of dated raw turns (`[2023-03-14] ...`, `[2023-06-02] ...`) to preview the substrate.
**Speaker notes:**
- Say the title, then the thesis in one line: "We made memory dumber and it got better."
- Name the three benchmarks so the audience knows the scope up front.

## Slide 2: Cold open, the follower count (1:20)

**Title:** Your assistant deleted the evidence
**The one message:** Clever memory resolves a contradiction before you ever ask about it, and the number quietly disappears.
**Visual (build a new one):** A three-panel timeline. March: user says "10 followers." June: user says "15 followers." A write-time reconciler fires UPDATE and 10 vanishes from the store. Then a question mark: "Later: how did the count change?" with an empty store.
**Speaker notes:**
- Tell it as a story, no jargon: you say 10 in March, 15 in June, then someone asks about the change.
- A system that reconciles at write time already fired an UPDATE. 10 is gone. The contradiction the benchmark tests no longer exists.
- Land the line: "The clever system deleted the evidence." Pause. This is the whole talk in one anecdote.

## Slide 3: The wall (1:00)

**Title:** Everyone is building cleverer memory
**The one message:** The field agrees on one premise: a cleaner, smaller, reconciled store is a better store.
**Visual:** Four labeled boxes: Mem0 (atomic facts), Zep (temporal knowledge graph), Memori (dated triples), mem0 platform (write-time reconciliation). One arrow from each into a shrinking "derived store."
**Speaker notes:**
- Every leader spends its engineering budget on the same two moves: transform the conversation into a smaller derived representation, and resolve contradictions before the answerer runs.
- The shared, rarely-stated belief: better memory means cleverer memory.
- Set up the turn: what if the cleverness is the problem?

## Slide 4: The mechanism, clever becomes the weakness (1:30)

**Title:** The cleverness and the weakness are the same mechanism
**The one message:** The write-time reconciler that scores well on knowledge update is exactly what makes contradiction resolution the incumbent's worst ability.
**Visual:** A two-column contrast. Left: "Write-time reconcile: knowledge update 0.650 (strong)." Right: "Same reconciler: contradiction resolution 0.357 (worst)." An arrow labeled "same mechanism" connecting them.
**Speaker notes:**
- A write-time reconciler must pick one side to store. That helps knowledge update and destroys contradiction resolution.
- The weakness is not independent of the cleverness. It is a direct cost of it.
- This is the crack we drove a whole paper through.

## Slide 5: The one dumb idea (1:30)

**Title:** Conflict-aware raw-turn memory
**The one message:** Keep the raw dated turns, retrieve them verbatim, and when two disagree keep both.
**Visual:** Figure 1 (`figures/fig1-substrate.png`), the substrate pipeline: conversation to per-conversation dated raw-turn mind to top-30 retrieval to conflict-aware answer policy to answer.
**Speaker notes:**
- Three moves: per-conversation minds, dated verbatim raw turns as the primary lane, contradictions retained not reconciled.
- One transform at write time, resolving relative dates ("yesterday" becomes a real date), because that adds information rather than removing it.
- No graph, no fact distillation as the store, no write-time reconciliation, no learned router. The point is that it refuses to be clever.

## Slide 6: Measuring fairly (1:00)

**Title:** Cross-lab memory numbers are noise
**The one message:** We reproduce each incumbent's own pipeline under the same judge before we compare, then swap in our store and change nothing else.
**Visual:** Table 2 condensed: three rows (LoCoMo, LongMemEval, BEAM) showing answerer and judge held identical to the incumbent. Callout: "README says gpt-4o, shipped result files say gpt-5."
**Speaker notes:**
- The leaderboards mix macro and micro metrics and gpt-5 and gpt-4o judges. Reading them as one number is a category error.
- We reproduced Memori to 81.98 against their 81.95 to validate the harness end to end.
- One memory system, three benchmarks, zero per-benchmark tuning, most conservative protocol on the board.

## Slide 7: The measurement, 37 levers (1:00)

**Title:** We tried 37 ways to make it cleverer
**The one message:** The negative results are the product, not a footnote.
**Visual:** A grid of 37 tiles grouped by family: compression/distillation, structuring (KG/ledger), routing, prompt shaping, ensembling/voting. All tiles neutral for now (the reveal is next slide).
**Speaker notes:**
- Two independent programs: 23 levers on LongMemEval, 14 on BEAM.
- Each lever was a real attempt to beat the simple substrate: distill it, graph it, reconcile it, route it, ensemble it.
- Hold the suspense one beat before the reveal.

## Slide 8: The reveal, 33 lost (1:30)

**Title:** 33 of 37 made it worse
**The one message:** Every lever that transformed the store lost; the only four that helped never touched the store.
**Visual:** Figure 2 (`figures/fig2-falsification.png`), the falsification strip plot: 33 points on or below the raw-turn baseline, only 4 above it, all answer-side.
**Speaker notes:**
- The four survivors: self-consistency voting, a guarded split-vote recount, a preference grounding critic, a routing-matrix completion. All read the store more carefully; none rebuild it.
- Roughly 90 percent of everything we tried was self-harm.
- One concrete casualty: a distilled session outline cut summarization from 0.38 to 0.16. It was genuinely nice. It replaced high-resolution signal with a blurry copy.

## Slide 9: Receipt 1, LoCoMo (1:00)

**Title:** LoCoMo: 86.49 against 81.95
**The one message:** State of the art by 4.54 points, statistically solid, and it leads every question category.
**Visual:** Table 3 condensed to the top rows (Ours vs Memori vs full-context ceiling), single/multi/temporal/open/overall columns, our row in bold.
**Speaker notes:**
- 1332 of 1540, z = 4.64, p below ten to the minus five, against the reproduced same-judge Memori row.
- Open-domain accuracy is statistically indistinguishable from the full-context ceiling.
- We also corrected a column-scrambling error that had propagated through the LoCoMo literature.

## Slide 10: Receipt 2, LongMemEval (1:00)

**Title:** LongMemEval: 95.01 macro against 94.87
**The one message:** State of the art on the leader's own headline metric, under the most conservative judge on the board.
**Visual:** Table 4 intervention arc as a rising line from 75.9 percent to 95.01 macro, four adopted rungs labeled (vh5, klc, pfc, h3u).
**Speaker notes:**
- 468 of 500 under the official gpt-4o judge.
- The single biggest lever was recovering a dropped `question_date` field, which lifted temporal accuracy from 61 to 84 percent. No reasoning tuning can supply a reference point absent from the data.
- Every adopted lever is answer-side. None restructures the store.

## Slide 11: Receipt 3, BEAM and the 23 points (1:30)

**Title:** BEAM 1M: 74.0 percent pass, contradiction +23
**The one message:** Pass rate is a real win, and the one differentiator is conflict-awareness worth 23 points on the hardest ability.
**Visual:** Table 5 per-ability bars, ours vs mem0, with contradiction_resolution highlighted (0.588 against 0.357). Foot: pass 74.0 percent against 70.1 percent.
**Speaker notes:**
- 518 of 700, McNemar paired test z = 2.14 at p about 0.03. We rest the claim on pass rate; the average margin sits inside judge noise and we say so.
- Contradiction resolution: 0.588 against 0.357, a 23-point gap, on the benchmark's hardest ability.
- 7 times fewer retrieved items than the incumbent (30 raw turns against 200 facts). The whole BEAM program cost about 160 dollars.

## Slide 12: The mechanism, why simple wins (1:00)

**Title:** Every transform removes what the rubric scores
**The one message:** The benchmarks reward verbatim dates, numbers, and both sides of a conflict, which is exactly what distillation, graphs, and reconciliation delete.
**Visual (build a new one):** Left, a raw turn with date, number, and exact phrase intact. Right, three lossy arrows (distill, graph, reconcile) each dropping one of those tokens. Caption: "Detail removed by a transform cannot be recovered downstream."
**Speaker notes:**
- Retrieval-headroom audit: the supporting content is at rank 30 or better for about 90 percent of failed nuggets. The material is already in front of the answerer.
- So deeper retrieval and richer structure cannot help, and distillation only removes what the answerer already holds.
- The productive place to spend cleverness is read time, not write time. The survivors are the memory analog of test-time-compute scaling.

## Slide 13: Where it loses, honest disclosure (0:50)

**Title:** We report the losses as loudly as the wins
**The one message:** Simple concedes coverage-shaped breadth and inference cost, and we disclosed a bug we could have hidden.
**Visual:** Two small panels. Left: "Summarization 0.570 against 0.635 (we trail)." Right: "Empty-answer bug: 56 blanks, healed under identical config, broken snapshot published."
**Speaker notes:**
- Summarization trails because compound-nugget rubrics reward enumerated breadth, and a compact set of real turns lists fewer items than a padded fact dump. Forcing enumeration backfired every time.
- The bug: a token cap left 56 answers blank on our first BEAM run. We re-ran under the identical configuration and kept the broken snapshot as an artifact rather than quietly raising the cap.
- This disclosure is part of what makes the comparison trustworthy.

## Slide 14: The bitter lesson close (0:30)

**Title:** Keep the store dumb, spend cleverness on reads
**The one message:** The Bitter Lesson came for agent memory. Preserve the raw dated turns, keep both sides of a contradiction, and read more carefully instead of rebuilding.
**Visual:** The one-line takeaway centered, plus contact and links: paper, `github.com/marolinik/waggle-os`, email placeholder.
**Speaker notes:**
- The load-bearing moves: keep the raw data, resolve dates at write time because that adds information, preserve contradictions. Everything else is optional at best.
- We released the three protocols, every per-question judgment, the full ledger, and the harness. You do not need to re-derive the distillation tax; we paid it 33 times.
- Thank the audience, point to the repo, invite questions.

---

## Backup slides (for Q and A)

- **B1. Protocol-fidelity matrix (full Table 2):** answerer, judge, metric, and retrieval budget per system, including the README-versus-shipped judge swap on BEAM.
- **B2. Full falsification ledger (Table 6):** all 37 levers by family with the one-line reason each lost or survived.
- **B3. Retrieval-headroom numbers:** first-hit rank 30 or better for 88 percent (summarization), 90 percent (event ordering), 93 percent (multi-session); widening to top-100 moves only about 8 percent at 2 to 3 times the cost.
- **B4. Cost and tokens:** BEAM context about 27,000 tokens at top-30 against mem0's about 7,000; LoCoMo 3,747 tokens against Memori's 1,294; total BEAM spend about 160 dollars.
- **B5. LongMemEval appendix:** the 19 falsified levers enumerated individually.
