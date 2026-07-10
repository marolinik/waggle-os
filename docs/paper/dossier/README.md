# Dossier: Clever Memory Loses

The complete recognition package for the paper **"Clever Memory Loses: A Single Simple Substrate Is State of the Art on LoCoMo, LongMemEval, and BEAM"** (Marko Marković, KORRO / hive-mind). This is the arsenal you deploy when someone says "tell me more about what you do": paper, blog, deck, posts, and press kit, ready to send in under five minutes.

The one insight, repackaged for every format: **keep the memory store dumb and spend your cleverness on reads.**

## The three numbers

| Benchmark | Best published incumbent | This work |
|---|---|---|
| LoCoMo (1,540 Q) | Memori 81.95% | 86.49% |
| LongMemEval-S (500 Q) | Mastra 94.87 macro | 95.01 macro / 93.60 micro |
| BEAM 1M (700 Q) | mem0 0.6409 avg / 70.1% pass | 0.6482 avg / 74.0% pass |

Single differentiator: conflict-awareness, worth 23 points on BEAM's contradiction ability. Falsification ledger: 37 interventions measured, 33 lost.

## Contents

| File | What it is |
|---|---|
| `README.md` | This index and the 5-minute send checklist. |
| `arxiv-metadata.md` | Submission-ready arXiv fields: title, author, verbatim abstract, categories (cs.CL primary; cs.AI and cs.IR cross-lists), comments field, license, and a full submission checklist. |
| `talk-deck-outline.md` | Slide-by-slide outline for a 15-minute conference talk (14 slides plus backups): one message, visual spec, and timed speaker notes per slide. |
| `announcement-posts.md` | Launch-day copy: LinkedIn post, an 8-tweet X thread, and a Show HN title with comment. No em dashes, no hype words. |
| `press-kit.md` | One-page press kit: what happened, the three numbers, an author quote, the falsification-ledger press hook, figure list, contact, and a five-question FAQ. |

### Companion assets (one level up, already shipped)

| Asset | Path |
|---|---|
| Research paper (markdown master) | `../2026-07-09-clever-memory-loses-draft.md` |
| Blog post (accessible version) | `../2026-07-09-clever-memory-loses-blog.md` |
| Figure 1, the substrate pipeline | `../figures/fig1-substrate.png` |
| Figure 2, the falsification strip plot | `../figures/fig2-falsification.png` |
| Consolidated results and reproduction commands | `../../../benchmarks/results/MEMORY-BENCHMARKS-CONSOLIDATED-2026-07.md` |
| Code, protocols, per-question artifacts | `github.com/marolinik/waggle-os` |

## What to send, by situation

| Situation | What to send |
|---|---|
| Speaking invitation request | Press kit one-pager + talk deck outline + link to the blog |
| Press or editor inquiry | Press kit + Figure 1 and Figure 2 + blog |
| Research job or collaboration | Paper + press kit + talk deck outline |
| Investor or partnership intro | Press kit one-pager + paper + the three numbers |
| Launch day (arXiv is live) | Announcement posts (LinkedIn, X, Show HN), all at once |
| "Tell me more about what you do" | Press kit one-pager + link to this dossier |

## The 5-minute send checklist

Before you send any subset of this dossier, confirm:

- [ ] **Pick the target.** Use the table above to select the minimum set of files for the situation; do not send everything by default.
- [ ] **Fill the placeholders.** Replace every `[LINK]` in `announcement-posts.md` with the live arXiv or blog URL, and the `[contact placeholder]` in `press-kit.md` with a real email.
- [ ] **Confirm the artifacts are live.** The repository at `github.com/marolinik/waggle-os` is public and contains the harness, per-question results, negative-results tables, and the pre-heal snapshot.
- [ ] **Attach the figures if the recipient is press.** `fig1-substrate.png` and `fig2-falsification.png` are legible at 100 percent and in grayscale.
- [ ] **Verify the numbers match the paper.** LoCoMo 86.49 vs 81.95; LongMemEval 95.01 macro vs 94.87; BEAM 74.0% pass vs 70.1%; contradiction +23. Nothing rounded differently across files.
- [ ] **Lead with the one-pager.** The press kit is read in 60 seconds and must stand alone; everything else is depth behind it.
- [ ] **Zip and send.** The dossier folder plus the two companion figures should be one archive, ready to attach in under five minutes.
