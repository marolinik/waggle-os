# Press Kit: Clever Memory Loses

One page for journalists, editors, and program chairs. Everything here is drawn from the paper and is quotable. No em dashes.

---

## What happened (3 sentences)

A single, deliberately simple memory substrate is state of the art on all three of the field's long-term conversational memory benchmarks, LoCoMo, LongMemEval, and BEAM, each measured under the incumbent leader's own published protocol and judge. Instead of distilling conversations into facts or knowledge graphs, it keeps the raw dated conversation turns and, when two statements contradict each other, retains both rather than resolving the conflict at write time. Alongside the three results, the author publishes a falsification ledger of 37 interventions that tried to make the substrate cleverer, of which 33 made it worse.

## The three numbers

| Benchmark | Best published incumbent | This work | Margin |
|---|---|---|---|
| LoCoMo (1,540 Q) | Memori 81.95% | 86.49% | +4.54pp (z=4.64, p<0.00001) |
| LongMemEval-S (500 Q) | Mastra 94.87 macro | 95.01 macro / 93.60 micro | +0.14 macro |
| BEAM 1M (700 Q) | mem0 0.6409 avg / 70.1% pass | 0.6482 avg / 74.0% pass | +3.9pp pass (McNemar z=2.14, p≈0.03) |

Single differentiator: conflict-awareness is worth 23 points on BEAM's contradiction ability (0.588 against 0.357). Total BEAM program cost: about 160 dollars.

## Quote from the author

Marko Marković (KORRO / hive-mind):

> "We paid the distillation tax 33 times so nobody else has to: keep the store dumb, keep both sides of a contradiction, and spend your cleverness on reading it, not rebuilding it."

## The press hook: they published everything that failed

Memory-systems papers typically report only the surviving configuration. This one ships the opposite: a first-class negative-results artifact of 37 interventions across two independent programs, 33 of which lost to the simple baseline, grouped by family so a reader can see that every scheme which transformed the store (distillation, graphs, ledgers, routers, self-ensembles) lost, and the only four that helped never touched the store. The author also volunteers a bug disclosure most papers would bury: a first BEAM run scored lower because a completion-token cap left 56 answers blank, and rather than quietly raise the cap, the author re-ran under the identical configuration and preserved the broken snapshot as a published artifact. The story is not only that simple beat clever; it is that the author documented every way clever lost.

## Figure files

- `figures/fig1-substrate.png` : the conflict-aware raw-turn substrate, left to right (write time: dated raw-turn minds with relative-date resolution; read time: hybrid top-k retrieval; answer policy: surface both sides on contradiction). Best for explainer and architecture context.
- `figures/fig2-falsification.png` : the falsification strip plot, 33 falsified levers on or below the raw-turn baseline and only 4 adopted answer-side levers above it. Best for the "complexity buys nothing" narrative.

(Both files live one level up at `../figures/` relative to this dossier.)

## Contact

- Author: Marko Marković, KORRO / hive-mind
- Email: [contact placeholder]
- Code, protocols, per-question artifacts, and the pre-heal snapshot: `github.com/marolinik/waggle-os`
- Paper: `../2026-07-09-clever-memory-loses-draft.md` (arXiv link to be added on announcement)
- Accessible write-up: `../2026-07-09-clever-memory-loses-blog.md`

---

## FAQ

**Is this cherry-picked?**
No, and the paper is built to make cherry-picking hard to hide. Each incumbent's own pipeline is reproduced under the same judge before any comparison (Memori's LoCoMo number was reproduced to 81.98 against their published 81.95). The losses are reported as loudly as the wins: summarization trails the incumbent at 0.570 against 0.635, and the BEAM average-score margin is stated as a statistical tie inside the judge-noise band. Every per-question judgment is released, along with a ledger of the 33 interventions that failed, and where a result was inflated by a bug the bug and both numbers are disclosed.

**Why should users care?**
An assistant that cannot recall what you said three weeks ago cannot be a durable collaborator. Today's memory systems quietly resolve your contradictions for you: tell one that your follower count changed and one number silently disappears from its store. This substrate keeps both dated statements and, at answer time, presents both and asks which is correct, which is what people actually want from a memory that is supposed to have been paying attention.

**What is conflict-aware memory?**
It keeps the original dated conversation turns instead of distilling them into facts or a graph, and when two statements disagree it retains both rather than reconciling them the moment they are written. At answer time it states the contradiction, presents both dated statements, and asks which is correct. A reconciler that runs at write time must pick one side to store; a policy that runs at read time can hold both and decide per question. That single decision is worth 23 points on BEAM's hardest ability.

**What did it cost?**
The entire BEAM program cost roughly 160 dollars in API spend. The memory engine runs local embeddings (nomic-embed-text via Ollama), so no memory content leaves the machine on the write path or the read path, and it retrieves 7 times fewer items than the incumbent (30 raw turns against 200 facts). The one axis it concedes is inference token cost: a raw-turn answer context is larger than a distilled-fact one (about 27,000 tokens against about 7,000 on BEAM), so the win is on answer quality and the concession is on efficiency.

**What is next?**
Three open questions. Can conflict preservation be made cheap enough to also win the coverage-shaped abilities such as summarization, where the substrate still trails. Does the raw-turn result hold under weaker and cheaper answerers, or is long-context capacity the true enabler. And what is the right rubric for a memory that surfaces a contradiction and asks for clarification, as against one that commits to a single value and happens to be right.
