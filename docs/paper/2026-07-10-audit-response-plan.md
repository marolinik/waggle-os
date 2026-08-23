# Audit Response Plan: Clever Memory Loses

**Date:** 2026-07-10
**Input:** publication-strength audit (2026-07-10), verdict no-go arXiv/press, conditional-go corrected blog.
**Decision:** ACCEPT the audit's core finding and PIVOT the thesis. Defend only 3 sub-points (below). The audit refutes the "raw-only, zero structure" claim using our own `benchmarks/results/longmemeval/RESULTS.md` — that is not survivable in review, and internal records confirm it (LongMemEval final = observation extraction + category routing + voting + KG-ledger guard; LoCoMo final = seven-lane layered system).

---

## 1. Triage of the 10 blockers

| # | Blocker | Ruling | Action |
|---|---|---|---|
| 1 | Thesis contradicted by own evidence | **ACCEPT — fatal as written** | Pivot thesis (§2) |
| 2 | LongMemEval routes on `question_type` metadata | **ACCEPT** | No-oracle rerun = new headline (E1) |
| 3 | LongMemEval tie presented as win | **ACCEPT with partial defense** | Reword: "ties 468/500 micro; +0.14 on incumbent's own macro aggregation." Macro is Mastra's own published metric, so reporting it is fair — claiming SOTA on it is not. Post-QA draft already concedes noise; title/abstract/dossier do not. Fix all. |
| 4 | Adaptive test-set tuning invalidates confirmatory p-values | **ACCEPT** | Relabel campaign exploratory; frozen confirmatory reruns (E3) |
| 5 | "33 made it worse" overclaims | **ACCEPT** | Rename Engineering Intervention Log; two tables (BEAM / LME), per-row N, model, baseline, metric, execution status, CI, adoption rule. Correct slogan: "33 not adopted; 4 adopted." |
| 6 | Conflict effect not causally isolated (store vs prompt) | **ACCEPT experiment, CONTEST breadth claim both ways** | Run 2×2 ablation (E2). Also narrow our own incumbent claim: Zep/Graphiti is bitemporal and retains history — say "systems that reconcile at write time on the answer path," not "every incumbent." |
| 7 | "Reproduced each incumbent" false for 2 of 3 | **ACCEPT** | Use audit's replacement wording verbatim |
| 8 | "No memory content leaves the machine" misleading | **ACCEPT** | Use audit's replacement wording verbatim; fix press kit too |
| 9 | SOTA landscape stale (mem0 92.5 LoCoMo, Hindsight 73.9 BEAM-1M) | **ACCEPT with defense** | New numbers are protocol-incomparable (different models/configs) — handle with landscape table + protocol-compatibility column, not silent retitle. But unqualified "state of the art" in title is dead regardless. |
| 10 | Reproducibility uneven (LME pipeline not public) | **ACCEPT** | Publish scripts 34–55 + per-question artifacts, or narrow Appendix B claim |

**Partial defenses to keep (write into rebuttal/limitations, do not overplay):**
- D1: `question_type` is benchmark-provided input, not a gold answer — but Mastra doesn't use it, so head-to-head is still unclean. Disclose + rerun; keep routed number as a labeled secondary result.
- D2: Macro aggregation is the incumbent's own leaderboard metric; we report both and lead with micro.
- D3: BEAM result IS the clean simple-substrate result — one benchmark where the raw-only story is fully true. The pivot thesis keeps it as the flagship.

---

## 2. Thesis pivot

**Old (dead):** one dumb raw-turn substrate, no distillation/graph/routing, wins all three.

**New:** *preserve dated raw evidence as the canonical store; make every derived view reversible; defer conflict resolution to read time.* Raw turns dominate detail- and contradiction-sensitive tasks (BEAM, all-raw win); derived observations and read-time aggregation help breadth/counting (LongMemEval, LoCoMo); nothing on the answer path irreversibly deletes evidence.

**Title candidates** (pick after E1/E2 results):
1. "Clever Memory Loses When It Deletes the Evidence" (keeps the sticky brand, now true)
2. "Preserve First, Transform Later: A Lossless Memory Substrate Across LoCoMo, LongMemEval, and BEAM"

**Contributions restated:** (1) lossless canonical-store architecture; (2) three protocol-matched studies, presented separately; (3) causal conflict-preservation ablation on BEAM; (4) protocol-fidelity audit (unchanged — strongest surviving section); (5) engineering intervention log, honestly labeled.

Bitter Lesson angle survives as: "do not irreversibly discard evidence," not "never build structure."

---

## 3. Phases

### Phase 0 — Verify audit citations (0.5 day, agents, no writes)
Audit is specific and matches memory, but confirm before rewriting on top of it:
- [ ] `RESULTS.md:43-49, 27-40, 64-76` say what audit says
- [ ] `hive-mind/benchmarks/longmemeval/42-compose-final.mjs:15,36-40` routes on `it.question_type`
- [ ] Ledger entries claimed flat/positive (+0.023 temporal-commit, count-hint +3, etc.) — recheck signs in source tables
- [ ] Mastra category counts sum to 468/500 (mastra.ai/research/observational-memory)
- [ ] mem0 memory-benchmarks repo current numbers; Hindsight BEAM-1M 73.9 blog post; LIGHT/Honcho results
- [ ] BEAM repo license split (CC BY-SA 4.0 data / MIT code)
- [ ] Supermemory 85.4 vs 85.9 inconsistency; MemR3 duplicate reference
- **Gate:** any audit claim that fails verification gets struck from the plan; rest proceeds.

### Phase 1 — P0 rewrite (1–2 days, no new compute)
1. Rewrite title/abstract/intro/conclusion around pivot thesis.
2. Kill four false slogans everywhere (draft, blog, deck, posts, press kit): "zero per-benchmark tuning," "swap and change nothing," "33 made it worse," "every transform loses."
3. LongMemEval: micro tie first, macro second, metadata-routing disclosed in results section, not a footnote.
4. Privacy wording per audit (§8). Reproduction wording per audit (§7).
5. Section 4 rewritten: one canonical store, three benchmark-specific read paths, presented as three configurations of one preservation principle.
6. Ledger → Engineering Intervention Log (two tables + qualitative synthesis).
7. Figures: fig1 redrawn as one store / three read paths (or labeled BEAM-only interim); fig2 split into two panels with CIs or adoption matrix.
8. Related work: Memori arXiv:2603.19935 proper cite; Zep bitemporal correction; landscape table with protocol-compatibility column incl. current mem0/Hindsight/LIGHT; fix Supermemory number; dedupe MemR3; real bibliography.
9. Strip "Phase B-1 draft" status line; fix page-count/table-count in arxiv-metadata; fix title duplication p.1; fix orphaned Table 6 / blank half-pages.
10. `DATA_LICENSES.md` (LoCoMo, LongMemEval CC?, BEAM CC BY-SA 4.0 data) + attribution in result JSONL release.
11. Archive `draft.v1.md`, both DOCX, old LaTeX to `docs/paper/archive/` with README note (they present the layered thesis — audit is right that leaving them loose invites "your own files disagree").

### Phase 2 — P1 experiments (compute; sequence by information value)
- **E1 — LongMemEval no-oracle rerun** (highest value, cheapest): frozen config, ONE uniform read policy across all 500 Q (arm A); optional arm B = NL-only question classifier, report its confusion matrix. New headline number = arm A. Routed 95.01 becomes labeled secondary. Risk handled in §4.
- **E2 — BEAM 2×2 store×prompt ablation**: {raw-versioned, reconciled-current-only} × {incumbent prompt, conflict-aware prompt}. Stage 1: contradiction-ability subset (~100 Q × 4 cells) — isolates the +23pp mechanism cheaply. Stage 2 (if stage 1 clean): full 700 × 4. Reconciled store = simulate write-time reconciliation over same turns (mem0-style ADD/UPDATE/DELETE pass).
- **E3 — Confirmatory frozen reruns**: BEAM + LongMemEval final configs, 3 independent answer/judge passes each, report run distributions. Fixes the "judge-noise SE" mislabel with actual re-judging variance.
- **E4 — LoCoMo paired test**: McNemar vs reproduced Memori per-question outcomes + paired CI on accuracy difference; demote one-sample z-test.
- **E5 — Stats hygiene**: paired bootstrap CIs everywhere; exact tests; label exploratory vs confirmatory endpoints; BEAM avg-score delta reported as tie (CI −0.019..+0.034).

### Phase 3 — Release ops (after 1+2)
1. Publish full LME pipeline (scripts 34–55) + per-question artifacts to public repos; verify public-tree parity with Appendix B claims.
2. Regenerate ALL launch assets from ONE claim matrix (single source of truth: claim → evidence file → status). PDF, arxiv-metadata, blog, posts, press kit, deck.
3. Proper bibliography (BibTeX), consider LaTeX/Typst build instead of Chrome print.
4. Re-run internal QA gates (adversarial review, anti-paper) against the NEW draft.

### P2 (only if targeting main conference — defer)
Weaker answerer family + alternative judge; held-out confirmatory slice; cost–quality Pareto; real-world contradiction eval; one-command pinned repro env.

---

## 4. Risk register

| Risk | Handling |
|---|---|
| E1 no-oracle drops below 94.87 | Paper survives — pivot thesis does not require winning LME. Report honestly: "matches/near leader; routed variant reaches X with disclosed metadata routing." Tie-with-simpler-read-path is still a result. |
| E2 shows prompt (not store) carries the +23pp | Also survivable — thesis becomes "read-time conflict policy over preserved evidence"; store retention is the necessary precondition (prompt can't surface deleted history). Interaction cell measures exactly this. |
| Confirmatory reruns regress BEAM pass-rate significance | Report distribution; drop p-value claims to descriptive. BEAM avg was already a tie. |
| mem0/Hindsight newer numbers steal headline | Landscape table with protocol column; claims scoped "under incumbent's published protocol as of [date]." |
| Rewrite drifts back to hype | Claim matrix is the gate: no sentence in any launch asset without a matrix row. |

---

## 5. Go/no-go (mirrors audit gates)

| Target | Gate |
|---|---|
| Corrected blog | Phase 1 items 1–4 + slogan kill |
| Social/HN launch | Blog gate + landscape table |
| arXiv preprint | Phase 1 complete + E1 + E2-stage-1 |
| Workshop paper | + E3, E4 |
| Main conference | + P2 item(s) |

## 6. Suggested execution order

1. Phase 0 verification (today, parallel agents).
2. Decision checkpoint: confirm pivot + title with user.
3. E1 + E2-stage-1 launch (compute runs overnight) in parallel with Phase 1 rewrite.
4. Assemble claim matrix → regenerate assets → QA gates → arXiv.

Rough new-compute cost: E1 ~500–1000 answer+judge calls (gpt-5-mini/gpt-4o); E2 stage 1 ~800 gpt-5 calls; E3 ~3×(700+500) both roles. Order of magnitude comparable to one prior full-700 run — low hundreds of dollars, not thousands.

---

## 7. Phase 0 RESULTS (2026-07-10, three independent verifiers)

**Verdict: audit confirmed on all internal citations and all statistics; 3 external claims softened in our favor.**

Internal (verify-internal): claims 1–7 ALL CONFIRMED with file:line quotes. Ledger decomposition of "33 lost": 21 strictly negative / 6 flat / 3 positive-unadopted / 3 analytical-only — all six audit-named entries executed A/Bs, flat-or-positive as audit said. No NL classifier anywhere in LME scripts 34–55; routing purely on dataset `question_type`. Only audit slip: "6 tables" metadata was accurate (page count 14→16 still our error).

Stats (verify-stats): every number MATCH — BEAM ours 0.6482016 / 518/700; mem0 0.6408656 / 491/700 (gpt-5 answerer+judge, top_200 — like-for-like judge symmetry confirmed); McNemar 425/93/66/116, z=2.141, p=0.0323 (asymptotic), 0.0392 (continuity), 0.0389 (exact); paired delta +0.007336, CI [−0.0193, +0.0340], bootstrap agrees; LoCoMo 1332/1540 recount exact; contradiction ours 0.5875 vs mem0 0.3571 (+0.2304). Audit's judge-noise-SE point confirmed: draft's "0.014 judge-noise band" is across-question sampling SE (0.01348/0.01359), not judge noise. Method note: ours↔mem0 pairing must join on question TEXT (id ordering differs; id-join collapses to 70 rows). **E4 unblocked: Memori per-question reproduction exists at `D:\Projects\memori-repo\benchmarks\results_gemma\eval_20260609T035542Z.json` (1540 entries, join-able).**

External (verify-external): Mastra 94.87 CONFIRMED = macro, gpt-5-mini answerer + gpt-4o judge (protocol-matched to ours; micro tie 468/500 exact). BEAM data license CC BY-SA 4.0 CONFIRMED → DATA_LICENSES.md required. Zep bitemporal CONFIRMED (edge invalidation, history preserved) → our "every incumbent deletes" claim dead. Memori cite arXiv:2603.19935 CONFIRMED. **Softened:** (a) Hindsight 73.9 BEAM-1M uses Llama-4-Maverick judge, unstated metric, headline actually 64.1%@10M — NOT comparable; (b) mem0 92.5 LoCoMo = Top-200 + GPT-5 judge — protocol-incomparable to our Memori-protocol 86.49; (c) no public evidence incumbents do/don't route on `question_type` — reporting per-category ≠ routing. Landscape table with protocol-compatibility column is the right instrument (audit agreed). LongMemEval `_abs` abstention marking (30 Q, id suffix not question_type) must be handled identically in E1.

**Decisions locked:** pivot thesis per §2; all Phase 1 items proceed; E1 arm A = last pre-routing ladder rung config, uniform for all 500 Q; final step after rewrite + E1/E2 = independent re-audit ("re-judge") of the new package.

---

## 8. RIVAL PROTOCOL FORENSICS (2026-07-10) — the "we lost SOTA" numbers dissected

**Mastra 94.87 (LME):** macro artifact. Micro = 468/500 = 93.60, EXACT TIE with our routed run. Same answerer (gpt-5-mini), same official gpt-4o judge. Our macro 95.01 > their 94.87 — but ours oracle-routed, theirs not. True deficit: production-legal only (~92.4 classifier-routed vs their 93.60). Their system: gemini-2.5-flash ingestion-time observation compression, one static ~30k-tok context, single pass, open source. Beat = close ~6–10 questions in temporal-reasoning + knowledge-update without labels. Multi-session already tied (116/133 both).

**mem0 92.5 (LoCoMo):** protocol-inflation stack, NOT a substrate win. Their own paper (arXiv:2504.19413) scored J≈67% on the same 1540. The 92.5 = gpt-5 answerer + gpt-5 judge with maximally lenient prompt (1-of-N list items = CORRECT; ±14-day dates; ±50% durations; same-valence emotions; abstention-banned CoT answerer; cat-3 gold truncated at semicolon; adversarial cat-5 excluded — same 1540 scope as ours) + Platform-v3 closed retriever, top-200 (top-k lever only +0.7pp vs top-50). Judge is directly reusable standalone: `benchmarks/locomo/prompts.get_judge_prompt` + `common/llm_client.LLMClient` — ~20-line script over our (category, question, gold, prediction) triples. Full comparable rerun config documented in forensic report.

**Eywa 81.45 (BEAM):** not a comparable number. Sonnet 4.6 as BOTH answerer AND judge, custom rubric harness (paper misleadingly says BEAM "introduced here"; official-nuggets-or-reauthored unverifiable — artifacts URL 403s, no code, single-author vendor self-report), ZERO in-harness baselines, undisclosed context budget. Answerer edge small (+1.4pp Sonnet-vs-gpt-4o by their own LoCoMo anchor); judge is the story. Triangulated: plain raw-turn substrate under their harness ≈ 0.70–0.74 avg → Eywa's true like-for-like edge ≈ 5–10 pts (concentrated in abstention 92.9, temporal 90.0; their weakness = summarization 64.1, same as ours; contradiction we already own via dated turns). **CRITICAL protocol note: Hindsight's 73.9 is the AMB harness (Gemini answerer + Gemini judge, vendor-run) — ALSO not comparable to our gpt-5/gpt-5.** Honest position: our 0.648/74.0% vs mem0 0.641/70.1% is the ONLY clean like-for-like BEAM-1M comparison in existence; no one has published a comparable number above ours. Landscape table needs judge column: Eywa (Sonnet self-judge) / Hindsight+Honcho (Gemini/Gemini AMB) / mem0+ours (gpt-5 or gpt-4o official-style) — three islands, not one leaderboard.

### Campaign menu (SOTA recovery)
- **C1 LoCoMo unqualified SOTA (cheapest, highest probability):** rerun our substrate under mem0's exact protocol (gpt-5 answerer, their judge prompt verbatim, top-200, cat 1–4). Expected 92–95 given we score 86.49 under a FAR stricter judge. Stage 1 (cheap, no re-answering) = 3-pass judge decomposition over our EXISTING 1540 answers: (a) Memori judge baseline 86.49; (b) mem0 `_JUDGE_TEMPLATE` + gpt-4.1-mini → isolates prompt leniency; (c) mem0 `_JUDGE_TEMPLATE` + gpt-5 → isolates judge model. Residual to 92.5 after (c) = answerer + retrieval + their 7-step CoT answer prompt (abstention banned — third confound lever; for stage 2 rerun, decide ours-vs-theirs answer prompt explicitly). Adapter = ~30 lines importing `benchmarks/locomo/prompts.get_judge_prompt` + `common/llm_client.LLMClient` from D:\Projects\mem0-memory-benchmarks (cat-3 golds get `preprocess_answer` semicolon truncation). Total est. <$50, half a day.
- **C2 LME production-legal lead:** finish E1b exact number (was mid-run, ~$3), then target temporal-reasoning (84.2→) + knowledge-update + multi-session with label-free levers (uniform voting; observation-layer improvements à la Mastra). Need ≥469/500 micro no-oracle. Moderate difficulty.
- **C3 BEAM vs Hindsight 73.9:** abstention gate (biggest structural gap), knowledge-update latest-fact selection, summarization lane. Research campaign, days + iterative pilots. Judge caveat: Hindsight's judge identity (Llama-4-Maverick per their comparison page) still muddies exact comparability — verify before claiming.
