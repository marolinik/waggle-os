# Results — Hermes "~40% faster" closed-loop claim (R6 pilot)

**Verdict: `INCONCLUSIVE-STOPPED`** (pre-registered outcome, manifest §10)
**Spend:** $0.0048 / $5 pilot cap · **Wall:** ~50s · **Model:** `qwen/qwen3-30b-a3b-instruct-2507` (OpenRouter)
**Contract:** `docs/plans/HERMES-40-PREREG-2026-05-19.md` @ `a7b844a` · **Harness:** `f9de7ae`
Reported verbatim against the manifest. No goalpost moving (§11).

## What happened

| Family | task_a tools | R1 trigger (real `planSkillDistillation`) | Skill authored? | Pair |
|---|---|---|---|---|
| F1 trace-wired-behavior | 4 | gated-off (<5, correct) | no | not formed |
| F2 audit-pattern | 2 | gated-off (<5, correct) | no | not formed |
| F3 summarize-subsystem | 6 | **would-fire** (≥5) | **no — model ignored `create_skill`** | not formed |

0/3 families PASS–PASS → pre-registered gate §9 (`passFamilies ≥ 2`) failed → **STOP**. All 3 distill-source runs *passed the code grader* (the model is genuinely agentic over the tools; grader/cost-cap/gate/sign-test machinery all functioned).

## Honest reading

The pilot did **not** measure the Hermes effect and find it absent — it **never formed a measurable pair**. The claim is **neither supported nor refuted**. Two precisely-located, distinct causes — both *experiment construction*, not evidence about the claim:

1. **Corpus too small to exercise the loop.** Tasks resolve in 2–4 tool calls, below the ≥5 distillation threshold. The *real* `planSkillDistillation` correctly returned `null` for F1/F2 (gated-off) — shipped R1 behaving exactly as specified, just under test conditions that never reach it.
2. **30B model under-complies with the meta-directive.** F3 reached 6 tools (R1 *would* fire) yet the model did not call `create_skill` despite the shipped behavioral-rule text in context. A 30B instruct model under-follows a secondary "now distil a skill" instruction.

This is the T3 tier working as designed: **$0.0048 bought the finding that the experiment is underpowered by construction**, instead of $40 on a doomed N=20.

## Effect on the rubric

D1 (closed learning loop) **stays 2** ("solid", wired + deterministically triggered + unit-proven). The Hermes "~40% faster" benchmark remains the open gap between D1=2 and a real premium D1=3 — unchanged from the R5 honest state. Nothing in this pilot lets us claim 3.

What the pilot *did* add (a real, if narrow, datum on the loop's autonomous half): a small instruct model, given the shipped behavioral distillation rule and a qualifying ≥5-tool success, did **not** self-distil. That argues the production loop's reliability depends on either model strength or a more deterministic surfacing than behavioral-prose — relevant to R5b's design (the seam emits a `step`, but authoring still depends on the model acting).

## Pre-registered amendment ask (manifest §10)

To actually measure the speed claim the experiment needs amendment (documented, user-decided per cost-discipline — not a silent re-run):
- **A. Forcing corpus** — larger/deeper corpus + tasks engineered so a correct answer *requires* ≥5–10 tool calls (reliably trips the real R1 gate).
- **B. Stronger model** — a model that complies with the `create_skill` directive (cost ↑ per the pinned-model amendment process), keeping authoring LLM-side (Hermes-faithful).
- **C. Deterministic distillation arm** — harness mechanically distils a skill from task_a's successful trace, testing reuse-speedup (claim part ii) while *separately* reporting model self-distillation compliance (claim part i). Cheapest path to a real speed number; explicitly decouples the two halves of the Hermes claim.
- **D. Stop here** — record as honestly unproven (rubric already states this); spend nothing further.

No option is taken without an explicit pre-registered amendment + (for B) a cost-cap decision.

## Pilot 2 — Amendment 2 (qwen-thinking, user-directed)

**Verdict: `INCONCLUSIVE-STOPPED`** · spend $0.0093 (cumulative **$0.0141 / $5**) · ~56s · `qwen/qwen3-30b-a3b-thinking-2507`.

| Family | task_a tools | distill grader | R1 trigger | Pair |
|---|---|---|---|---|
| F1 | 2 | PASS | gated-off (<5, correct) | not formed |
| F2 | 1 | **FAIL** | gated-off | not formed |
| F3 | 2 | **FAIL** | gated-off | not formed |

Pattern *inverted* vs Pilot 1 (instruct: 4/2/6 tools, all distill-PASS, no skill authored): the thinking variant used **fewer** tool calls and failed 2/3 graders. Not a measurement bug — F1 passed the grader, so the `content` field is read correctly for the thinking model; F2/F3 were genuinely under-grounded.

## Cross-pilot conclusion (binding)

**Two pilots, two models, identical structural verdict.** The limiting factor is **experiment construction, model-invariant**: the synthetic corpus is small enough that a 30B model (reasoning or not) resolves these tasks in ≤6 tool calls — below the ≥5 distillation threshold. The real `planSkillDistillation` correctly gated-off on every family (shipped R1 working as designed; the test never reaches it). The Hermes "~40% faster" claim is **neither supported nor refuted**. **D1 stays 2.** Total spend $0.0141 of $5 — the T3 tier did its job: ~1.4 cents bought a decisive structural finding instead of $40 on a doomed powered run.

To measure the effect at all, the *task environment* must force ≥5–10 grounded tool calls (amendment A-class). That is a design change with cost implications and is a **user decision** — autonomous re-engineering + re-run would be the goalpost-moving the cost-discipline rule bans. Decision options surfaced to the user; no further spend without an explicit Amendment 3.
