# We Tried 37 Ways to Make AI Memory Smarter. 33 Made It Worse.

*Simple memory beats clever memory on LoCoMo, LongMemEval, and BEAM. Here is the evidence, including the parts that embarrassed us.*

Your AI assistant forgets you. Tell it on Monday that you changed jobs, and by Friday it is still congratulating you on the old one. The industry's answer is to build cleverer memory: knowledge graphs, extracted facts, systems that reconcile what you said last week against what you say today. We spent months building exactly that kind of cleverness, measured 37 versions of it against three public benchmarks, and watched 33 of them make the memory worse. The design that won was almost embarrassingly dumb. Keep the raw conversation, stamp every line with its date, and when two lines disagree, show both.

## The one dumb idea

Everyone in this space is building cleverer memory. Mem0 distills your conversations into atomic facts. Zep builds a temporal knowledge graph. The mem0 platform reconciles each new fact against the old ones the moment you say them. The shared belief is that a cleaner, smaller, reconciled store is a better store.

We built the opposite. We keep the original conversation turns, exactly as you said them, each stamped with the date. We retrieve the relevant ones per question. When two of them contradict each other, we keep both and surface the conflict. No graph. No fact extraction as the primary store. No reconciliation. **We call it conflict-aware raw-turn memory, and the entire point is that it refuses to be clever.**

Then we tested it fairly. Cross-lab benchmark numbers are noise, so for each benchmark we first reproduced the incumbent's own pipeline under the same judge and the same protocol, then swapped in our store and changed nothing else. One memory system, three benchmarks, zero per-benchmark tuning.

It won all three.

| Benchmark | Best published system | Ours |
|---|---|---|
| LoCoMo (1,540 Q) | Memori 81.95% | **86.49%** |
| LongMemEval (500 Q) | Mastra 94.87 macro | **95.01 macro** |
| BEAM 1M (700 Q) | mem0 0.6409 avg / 70.1% pass | **0.6482 avg / 74.0% pass** |

The averages are close, and we say so out loud. On BEAM the average-score margin sits inside the judge's own noise, so we rest that claim on the pass rate, where a paired McNemar test gives z = 2.14 at p of about 0.03. The point of the table is not that we crushed anyone. The point is that the dumbest design on the board matches or beats every clever one.

## Where clever actively hurts: the follower count

Here is the single decision that separates us from the pack, told through one question BEAM actually asks.

You mention in March that an account has 10 followers. In June you mention it has 15. Later someone asks about the change. A system that reconciles memory when it writes has already resolved this for you: the second number arrived, it fired an UPDATE, and 10 quietly disappeared. The contradiction the benchmark is testing no longer exists in the store. The clever system deleted the evidence.

Our dumb store kept both dated statements. At answer time it says: you reported 10 in March and 15 in June, which is correct? That is precisely what the rubric rewards.

**On contradiction resolution, the hardest ability on the benchmark, this one decision is worth 23 points** (0.588 against 0.357). And it is not a tuning gap a better reconciler could close. A reconciler that runs at write time must pick one value to keep. A policy that runs at read time can hold both and decide per question. Resolving early optimizes the wrong moment.

## The beautiful thing we built that made everything worse

The 37 experiments are the real product, so let me show you one that hurt.

Summarization questions ask the model to cover a lot of ground, so we built a timeline for each conversation: a clean, distilled outline that we prepended to the context. It was genuinely nice. It cost 36 cents a run to generate. It felt like it had to help.

It cut our summarization score from 0.38 to 0.16.

The reason is the whole thesis in miniature. **A summary is lossy by definition, and the benchmark scores verbatim detail.** Our tidy outline said "discussed training plans" where the rubric wanted the exact mileage, the exact date, the exact phrase the user typed. The outline did not add knowledge. It replaced high-resolution signal with a blurry copy, then buried the real turns underneath it. Thirty-two more experiments told the same story from different angles: distilled-fact retrieval, knowledge graph ledgers, routers that classify content, self-ensembles that merge answers. **33 of 37 lost, and the four that survived never touched the store.**

To be clear, the dumb store does not win everything. On summarization overall it still trails, 0.570 against mem0's 0.635, because those questions reward breadth and a compact set of real turns simply lists fewer items than a padded fact dump. We report that loss as loudly as the wins.

## The bug we are telling you about on purpose

Our first full run on BEAM scored 0.605, and it should have scored higher. When we looked, 56 answers were empty strings, and every empty answer scores zero.

The cause was mundane and entirely ours. Our client capped completion tokens at 4096. On long summarization questions, gpt-5 spent that whole budget on hidden reasoning and had nothing left to write the answer. Fifty-six blanks, all zeros, dragging the mean down.

We could have quietly raised the cap and reported the better number. Instead we re-ran all 56 under the identical configuration with a larger token floor, healed a mean of 0.000 up to 0.528, and kept the broken snapshot as a published artifact. **If a result leans on a bug you found, the honest move is to show the bug, the fix, and both numbers.** That is not a footnote. It is part of what makes the comparison trustworthy.

## The takeaway: dumb store, clever reads

The pattern across all 37 experiments is sharp enough to act on. Every intervention that transformed the stored memory lost. Distill it, graph it, reconcile it, restructure it: all worse. The only four that helped shared one property. They left the store alone and got smarter about reading it.

Self-consistency voting reads the same conversation five times and takes the majority answer. A guarded recount recomputes a count only when the votes split. A grounding critic runs best of five on answers that lack support. A router picks which complete context to read without changing any of them. This is what reasoning models already do, applied to memory: hold the store fixed and buy accuracy by reading it more carefully, the same way a reasoning model samples more chains over one fixed prompt.

So if you are building agent memory, here is the whole lesson in one line. **Keep the store dumb, and spend your cleverness on reads.** Preserve the raw dated turns. Resolve relative dates when you write, because turning "yesterday" into a real date adds information instead of removing it. Keep both sides of a contradiction. Then, when you want more accuracy, read the store more times or more carefully rather than rebuilding it.

We are releasing everything: the three protocols, the per-question records, the full falsification ledger of all 37 interventions, and the harness. The Bitter Lesson came for agent memory too. You do not need to re-derive the distillation tax. We already paid it, 33 times.

*Read the paper: [Clever Memory Loses](./2026-07-09-clever-memory-loses-draft.md). Code, protocols, and every per-question judgment live in the hive-mind benchmarks harness.*
