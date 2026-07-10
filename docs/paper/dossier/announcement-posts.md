# Announcement Posts

Three ready-to-send posts. Replace every `[LINK]` with the arXiv URL (or the blog URL) once the paper is announced. No em dashes anywhere. No hype words; the numbers carry it. Every figure quoted here matches the paper.

---

## (a) LinkedIn

Professional, roughly 200 words. Hook, then three numbers, then the link.

---

Everyone building AI memory is making it cleverer: knowledge graphs, extracted facts, systems that reconcile what you said last week against what you say today. We spent months building that cleverness, measured 37 versions of it against three public benchmarks, and watched 33 of them make the memory worse.

The design that won keeps the raw conversation, stamps every line with its date, and when two lines disagree, shows both. We call it conflict-aware raw-turn memory. The entire point is that it refuses to be clever.

Under each incumbent's own published protocol and judge, one substrate is state of the art on all three benchmarks:

- LoCoMo: 86.49% against the prior best 81.95%
- LongMemEval: 95.01 macro against 94.87
- BEAM 1M: 74.0% pass against 70.1%

The single decision that separates us from the field is conflict-awareness: keep both sides of a contradiction instead of resolving it at write time. A reconciler that runs at write time has to pick one value and delete the other before the question is ever asked. On contradiction resolution, the hardest ability on BEAM, that one choice is worth 23 points.

We released everything, including the 33 experiments that failed and a bug we could have hidden. The Bitter Lesson came for agent memory too.

Paper, code, and every per-question judgment: [LINK]

---

## (b) X / Twitter thread

Six to eight tweets. Tweet 1 stands alone and is numbers-forward; the honest-disclosure angle is the differentiator.

**1/**
We tried 37 ways to make AI memory smarter. 33 made it worse.

The design that won keeps the raw conversation, dates every line, and when two lines disagree keeps both. It is state of the art on LoCoMo, LongMemEval, and BEAM. We published all 33 failures.

**2/**
Everyone in agent memory builds the same thing: distill conversations into facts, build a knowledge graph, reconcile new facts against old ones at write time.

The shared belief is that a cleaner, smaller, reconciled store is a better store.

**3/**
We built the opposite. Keep the original turns, exactly as said, each stamped with its date. Retrieve the relevant ones per question. When two contradict, keep both and surface the conflict.

No graph. No fact extraction as the store. No reconciliation.

**4/**
One substrate, three benchmarks, each under the incumbent's own protocol and judge:

LoCoMo 86.49% vs 81.95%
LongMemEval 95.01 macro vs 94.87
BEAM 1M 74.0% pass vs 70.1%

Zero per-benchmark tuning.

**5/**
The one decision that separates us: keep both sides of a contradiction instead of resolving it at write time.

A reconciler that runs at write time must pick one value. A read-time policy can hold both. On BEAM's hardest ability that is worth 23 points.

**6/**
The 37 experiments are the real product. Every intervention that transformed the store lost: distill it, graph it, reconcile it, restructure it, all worse.

The only 4 that helped never touched the store. They just read it more carefully.

**7/**
Honest disclosure: our first BEAM run scored lower because a token cap left 56 answers blank.

We could have quietly raised the cap. Instead we re-ran under the identical config, healed the blanks, and published the broken snapshot as an artifact.

**8/**
Keep the store dumb, spend your cleverness on reads.

We released the three protocols, every per-question judgment, the full ledger of 37 interventions, and the harness. The Bitter Lesson came for agent memory too.

[LINK]

---

## (c) Hacker News (Show HN)

**Title:**

```
Show HN: Conflict-aware raw-turn memory, SOTA on LoCoMo, LongMemEval and BEAM
```

**Comment (post immediately after submitting):**

I spent months building clever agent memory (fact distillation, knowledge graphs, write-time reconciliation) and then measured 37 versions of it against three public long-term-memory benchmarks. 33 of the 37 made the memory worse. The design that won is almost embarrassingly simple: keep the raw conversation turns, stamp each with its date, retrieve the relevant ones per question, and when two turns contradict each other, keep both and surface the conflict instead of resolving it. Under each incumbent's own published protocol and judge, this one substrate is state of the art on all three: LoCoMo 86.49% (prior best 81.95%), LongMemEval 95.01 macro (prior best 94.87), and BEAM 1M 74.0% pass (prior best 70.1%). The single differentiator is conflict-awareness: a reconciler that resolves conflicts at write time has to delete one side before the question is ever asked, which is exactly what the contradiction rubric penalizes. That one decision is worth 23 points on BEAM's hardest ability.

The part I most want feedback on is the falsification ledger. I am publishing all 37 interventions, including the 33 that lost, because the negative results are the actual finding: every scheme that transformed the store (distillation, graphs, ledgers, routers, self-ensembles) lost, and the only four that helped left the store untouched and just read it more carefully. I am also disclosing a bug: my first BEAM run scored lower because a completion-token cap left 56 answers blank, and rather than quietly raise the cap I re-ran under the identical config and published the broken snapshot alongside the fixed one. All protocols, per-question judgments, and the harness are in the repo. I am happy to go deep on the protocol-fidelity methodology, since cross-lab memory numbers are mostly noise until you reproduce the incumbent under the same judge. [LINK]
