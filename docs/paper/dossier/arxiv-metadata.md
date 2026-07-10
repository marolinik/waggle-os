# arXiv Submission Metadata

Submission-ready metadata for the paper. Copy each field into the arXiv submission form. Every number is drawn verbatim from the paper master (`../2026-07-09-clever-memory-loses-draft.md`); do not paraphrase the abstract.

---

## Title

```
Clever Memory Loses: A Single Simple Substrate Is State of the Art on LoCoMo, LongMemEval, and BEAM
```

## Authors

```
Marko Marković
```

Affiliation line (paper byline): KORRO / hive-mind.

## Abstract

Paste verbatim. This is the paper's Section 1 abstract, unaltered.

```
Long-term conversational memory, answering questions over weeks of prior dialogue, is the load-bearing capability for durable AI assistants, and three benchmarks (LoCoMo, LongMemEval, and BEAM) are the field's rulers. Every published leader adds structure to the memory path: atomic-fact distillation, temporal knowledge graphs, write-time entity reconciliation, and learned routing. Our insight is that these transforms are lossy in exactly the way the benchmarks penalize, because distillation strips the dates and specifics the rubrics score and write-time reconciliation silently resolves the contradictions the rubrics want surfaced. We show that one simple substrate, conflict-aware raw-turn memory (per-conversation minds, verbatim dated raw-turn retrieval, and a conflict-preserving answer policy), is state of the art on all three under each incumbent's own published protocol: LoCoMo 86.49 against 81.95, LongMemEval 95.01 macro against 94.87, and BEAM 0.6482 average and 74.0 percent pass against 0.6409 and 70.1 percent. We then measured 37 constructive interventions that tried to make the substrate cleverer; 33 lost, and we report them as a first-class falsification ledger. The single differentiator is conflict-awareness, worth 23 points on BEAM's contradiction ability. Because the leaderboards mix macro and micro metrics and gpt-5 and gpt-4o judges, we reproduce each incumbent's pipeline before comparing and report against the most conservative protocol on the board. All protocols, per-question artifacts, and the empty-answer-heal disclosure are released.
```

## Categories

| Field | Value | Rationale |
|---|---|---|
| Primary | `cs.CL` | Long-term conversational memory over natural-language dialogue; LLM answerers and LLM-as-judge scoring. |
| Cross-list | `cs.AI` | Agent memory architecture; the Bitter Lesson framing for autonomous agents. |
| Cross-list | `cs.IR` | Hybrid dense plus BM25 retrieval, reciprocal rank fusion, reranking, retrieval-headroom analysis. |

## Comments field

Paste into the "Comments" box (confirm the page count against the compiled PDF before submitting; the figure and table counts are fixed).

```
14 pages, 2 figures, 6 tables, 2 appendices. Code, protocols, per-question answers and judgments, the falsification ledger, and the empty-answer pre-heal snapshot: https://github.com/marolinik/waggle-os
```

## License

Suggested: **arXiv.org perpetual, non-exclusive license** (the default arXiv license). It permits arXiv to distribute the work while the author retains copyright, which is the correct choice for a preprint intended to be widely read and cited. Do not select a CC-BY or CC0 variant unless a target venue later requires it.

## MSC / ACM classification (optional fields)

- ACM class (optional): `I.2.7` (Natural Language Processing), `H.3.3` (Information Search and Retrieval).

---

## Submission checklist

### Endorsement
- [ ] Confirm endorsement status for `cs.CL`. A first-time submitter without an institutional arXiv history typically needs an endorsement from an established author in the category. If unendorsed, request endorsement from a coauthor or a cited author before uploading, and allow lead time.
- [ ] Verify the submitting email is on an endorsed or auto-endorsed domain if applicable.

### PDF and source requirements
- [ ] Preferred submission is LaTeX source (the markdown master converts to LaTeX; upload `.tex` plus the two `.png` figures, not a pre-built PDF, so arXiv can compile). A direct PDF upload is accepted but discouraged for text-heavy papers.
- [ ] Both figures embedded at print resolution: `figures/fig1-substrate.png` and `figures/fig2-falsification.png`. Confirm they are legible at 100 percent zoom and in grayscale.
- [ ] All six tables render inside the text column with no overflow (Tables 1 through 6).
- [ ] References compile cleanly; every arXiv identifier in the reference list resolves (2504.19413, 2501.13956, 2402.17753, 2410.10813, 2510.27246, 2512.12818, 2512.20237, 2310.08560).
- [ ] Title, author, and abstract in the form match the compiled PDF exactly.
- [ ] Page count in the Comments field matches the final PDF.

### Ancillary files
- [ ] Optional: attach the consolidated command list (`benchmarks/results/MEMORY-BENCHMARKS-CONSOLIDATED-2026-07.md`) as an ancillary file, or link it from the repository.
- [ ] Confirm the repository at `github.com/marolinik/waggle-os` is public and contains the harness, per-question result files, negative-results tables, and the pre-heal snapshot referenced in Appendix B, so the artifacts URL in the Comments field is live at submission time.
- [ ] No private data or API keys in any uploaded source; all three datasets are public and used as published.

### Post-submission
- [ ] After the paper is announced, add the arXiv ID to the blog post, the LinkedIn post, and the X thread (replace the `[LINK]` placeholders in `announcement-posts.md`).
- [ ] Submit the blog post to Hacker News and the paper to r/MachineLearning on the announcement day.
