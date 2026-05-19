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

## Pilot 3 — Amendment 3 (forcing corpus, qwen-thinking)

**Verdict: `INCONCLUSIVE-STOPPED`** · spend $0.0244 (cum **$0.0385 / $5**) · ~2m15s.

| Family | task_a tools | distill grader | R1 trigger | create_skill called? | Pair |
|---|---|---|---|---|---|
| F1 ingest→export | **5** | **PASS** | **would-fire** | **no** | not formed |
| F2 audit→ingest | **5** | **PASS** | **would-fire** | **no** | not formed |
| F3 export→audit | **5** | **PASS** | **would-fire** | **no** | not formed |

**Amendment 3 succeeded at its purpose.** The forcing corpus reliably produced genuine ≥5-tool, grader-correct successes where the real `planSkillDistillation` **would fire** (in-data, 3/3). The task-difficulty bottleneck (Pilots 1–2) is solved.

> **⚠ RETRACTED 2026-05-19 PM (Amendment 4).** The "decisive" finding below is **WITHDRAWN**. It was a **harness artifact**: the distill phase was a single `runAgentLoop` turn that ended at the model's answer (no tool_calls → loop exits), so the model was **never given the post-task turn** where production R1 actually distils (`chat.ts` seam fires `planSkillDistillation` *after* the turn → directive surfaced into a *subsequent* turn). The model never declined `create_skill` — it was never asked where it could act. qwen demonstrably *can* call tools (every distill run passed the grader, which requires tool calls). Pilots 1–3 measured an incomplete harness, not model self-distillation propensity. Fixed via two-phase distill + re-run (Amendment 4). The section is kept for history only.

## Decisive cross-pilot finding (half i of the Hermes claim) — RETRACTED, see banner above

The blocker is now isolated and **model-behavioral**: given a real qualifying success **and** the shipped behavioral distillation rule in context, the **30B model does not call `create_skill`**. Replicated across both variants and the forcing corpus: **6/6 qualifying opportunities → 0 autonomous distillations** (Pilot 1 instruct F3 @6 tools; Pilot 3 thinking @5 tools ×3).

This is a real, citable result, not a null. The Hermes claim has two halves:
- **(i) the loop autonomously distils on success** — **empirically negative on a 30B model.** The trigger is correctly wired (R5b) and *would* fire; the model simply does not act on the in-context directive. Confirms the R5b open concern verbatim: the seam emits a `step`/directive but authoring still depends on the model *acting*.
- **(ii) reuse of a distilled skill → ~40% faster** — **still unmeasured**, blocked behind (i): no skill is ever authored, so no treatment arm forms.

**Rubric impact:** D1 stays 2. New durable datum: a robust closed loop cannot depend on model goodwill to call `create_skill` — premium D1=3 likely requires the seam to *deterministically* distil (or compel it), not merely emit a directive. Directly informs a future R5b hardening.

## Decision after Pilot 3 (user-decided; no autonomous re-run)

- **B. Stronger model** — a frontier agentic model likely complies with `create_skill`; tests whether *both* halves hold. Real $ + bigger build.
- **C. Deterministic distillation arm** — harness mechanically distils a skill from task_a's PASS trace (no reliance on model volunteering), measures half (ii) directly, and separately reports half (i) = the strong negative above. Cheapest path to an actual speed number; also a prototype of the more robust production seam. *(Recommended.)*
- **D. Stop** — record as-is: half (i) empirically negative on 30B (valuable, honest), half (ii) undetermined; D1=2.

## Pilot 4 — Amendment 4 (fixed two-phase harness + sonnet-4.6) — VALID RESULT, R6 CONCLUDES

**Verdict: `INCONCLUSIVE-STOPPED`** (pre-registered gate §9.1) · spend $0.4597 (cum **~$0.50 / $5**) · ~4m45s · `anthropic/claude-sonnet-4.6`.

**The harness fix worked — this result is valid, not an artifact.** All **3/3 families formed PASS–PASS pairs**: the model traced task_a, authored a skill on the faithful post-task distill turn (production-mirroring Phase 2), and both baseline_b and treatment_b passed the grader.

| Family | tcBase | tcTreat | reduction |
|---|---|---|---|
| F1 ingest→export | 7 | 8 | **−14%** (skill *added* a lookup call) |
| F2 audit→ingest | 7 | 7 | **0%** |
| F3 export→audit | 7 | 7 | **0%** |

**median reduction = 0%**, sign-test p = 1. Gate: passFamilies ✓, cost ✓, **median ✗ (0 < 0.40)** → no escalation. The gate correctly **halted before the $40 powered run** rather than spend it confirming a null.

### Conclusion (R6, valid, final under the locked manifest)

The Hermes "~40% faster" speed claim is **NOT reproduced** in this controlled setting: with a fixed harness and a frontier agentic model, a self-distilled skill yielded **~0% median tool-call reduction** (range −14%…0%). This is a real measured negative.

**Why — and the actual finding about when the closed loop pays off:** the forcing corpus is a clean linear chain whose *optimal* path is short (~7 grounded calls). A strong model already walks it near-optimally **without** the skill, so there is no wasted exploration for a distilled recipe to eliminate (it can even cost one extra `skill_lookup`). Self-distilled skills accelerate tasks where the **baseline floundered** (dead-ends, re-derivation); they cannot speed up a task that is already a short deterministic traversal for a capable model. Hermes's ~40% presumably comes from workloads with genuine exploratory waste — not from clean, well-specified lookups.

**Rubric:** D1 **stays 2** — and is now *better characterized*: the R1 loop is wired + unit/integration-proven (R5b) and, with the fixed harness, the model **does** autonomously distil on a qualifying success (the Pilot 1–3 negative was retracted as a harness bug). The remaining gap to a premium D1=3 is not "does the loop work" but "does reuse pay off" — which is **workload-dependent**, ~0% on already-optimal tasks. Citing a flat "~40% faster" would be unsupported by this evidence.

**Cost discipline outcome:** total R6 spend ≈ $0.50 of the $5 pilot budget; the $40 powered budget was **correctly never spent** — the T3 pilot→gate design prevented a $40 confirmation of a null. R6 concludes here under the pre-registered no-revisit rule; any "tasks-with-genuine-floundering" follow-up is a *new* pre-registered experiment, user-initiated, not an autonomous re-run.

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
