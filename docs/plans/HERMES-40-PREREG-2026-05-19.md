# Pre-Registration — Hermes "~40% faster" closed-loop claim (R6)

**Date:** 2026-05-19 · **Status:** LOCKED before any LLM spend · **Repo @** `c87e5b7`
**Discipline:** research eval — strict pre-registration, no revisit (`feedback_production_vs_research_cost_discipline.md`). Any post-data change = documented amendment with rationale, never a silent edit. This file's committed content is the contract.

## 1. Claim under test

Rubric line 7 / D1: a Waggle agent that has autonomously distilled a reusable skill from a successful complex task completes a *similar later task* materially faster than a fresh instance — Hermes Agent's benchmarked **~40% faster on research tasks**. We test Waggle's now-wired R1 loop (`planSkillDistillation` seam `c87e5b7` + behavioral rule + real `create_skill`).

## 2. Metrics (locked)

- **Primary:** tool-calls to a *grader-correct* completion = `AgentResponse.toolsUsed.length`.
- **Secondary (reported, not gating):** assistant turns; total tokens (input+output).
- A faster *wrong* answer does not count — speed is measured only among correct completions (§6 grader).

## 3. Pre-registered success criterion (locked)

Paired unit = a "second similar task" `t_b` run twice: once with no skill (baseline), once with the family's distilled skill in context (treatment). Per pair, reduction `r = (tc_baseline − tc_treatment) / tc_baseline`, counted **only when both runs are grader-PASS**.

- **PROVEN** ⇔ escalated N=20 run has **median r ≥ 0.40** AND a **one-sided sign test** (H0: P(treatment<baseline) ≤ 0.5; H1: >0.5) over PASS–PASS pairs with **p < 0.05** (ties dropped; exact binomial).
- Anything else after escalation = **NOT-PROVEN** (report effect size + CI honestly).

## 4. Model (pinned)

`qwen/qwen3-30b-a3b-instruct-2507` via **OpenRouter** (key hydrated from `VaultStore`, as `prompt-assembler-v5-eval.ts`). Temperature **0** (determinism where supported). Mandatory pre-run **slug probe** (trivial call, maxTokens=8): if the model is unreachable the run **ABORTS** — no fallback substitution (v5-eval deviation policy). Within-model paired design ⇒ absolute model competence does not bias the *relative* effect.

## 5. Arms (per task family `i`)

1. **A0 — distill source:** fresh `Orchestrator`, fixed tool set, **empty** skill scope, task `t_a` (a real ≥5-tool research task). Run real `runAgentLoop`. If grader-PASS **and** ≥5 tool calls → the R1 loop directive is applied and the agent authors `skill_i` via the **real `create_skill`** tool (faithful to the wired loop; skill `.md` lands in an isolated scope dir).
2. **baseline_b:** fresh `Orchestrator`, fixed tool set, **empty** skill scope, sibling task `t_b` (same family/method, different specifics). Record tool-calls/turns/tokens; grade.
3. **treatment_b:** fresh `Orchestrator`, fixed tool set, skill scope containing **only `skill_i`** (surfaced via `list_skills`/`search_skills` exactly as the product does), task `t_b`. Record; grade.

Pair = `t_b`: `baseline_b` vs `treatment_b`. The only difference is the presence of the self-distilled skill. Skill isolation is asserted at runtime (baseline scope dir empty; treatment scope dir contains exactly `skill_i`); a violation aborts the family.

## 6. Grader (deterministic, code-based)

Each `t_b` ships a required-facts checklist (string/regex must-appear in the final answer — specific `file.ts` names + specific facts). **PASS** = all required facts present in the final assistant message. Only PASS–PASS pairs enter the metric. Grader is code, not a model (no LLM-judge cost/variance in the gate).

## 7. Task families (pre-specified; corpus = this repo @ `c87e5b7` + memory substrate)

Real, ≥5-tool, reproducible (Grep/Read/recall over fixed local content; no live web):

- **F1 trace-a-wired-behavior** — `t_a`: trace how `recallMemory` excludes `temporary`; `t_b`: trace how the autoSave sign-gate coerces self-incapacity. Required facts: `orchestrator.ts` + `memory-sign-gate.ts` + the importance values.
- **F2 audit-for-a-pattern** — `t_a`: enumerate every `!= 'temporary'` recall filter; `t_b`: enumerate every `scanForInjection` call site. Required facts: the specific files/paths.
- **F3 summarize-a-subsystem-from-source** — `t_a`: the evolution stack; `t_b`: the harvest stack. Required facts: ≥3 specific module names each.

Pilot uses F1–F3 (N=3). Powered run reuses the same 3 families × repeated sibling instances drawn from a fixed pre-listed pool (N=20 total pairs; pool enumerated in the harness, not improvised post-hoc).

## 8. Cost governance (hard)

`CostTracker` **hard** mode. `dailyBudgetUsd = 5` pilot / **`45` combined** cap. Per-response tokens → USD via the pinned model's OpenRouter price (recorded in manifest output). `BudgetExceededError` aborts immediately — overspend is structurally impossible. Additional ceilings: `maxTurns ≤ 25` per agentic run; global LLM-call ceiling; slug-probe before spend.

## 9. Gate — pilot → escalation (pre-registered, no discretion)

After N=3 pilot, **ESCALATE to N=20** iff **all**:
1. **median r ≥ 0.40** over pilot PASS–PASS pairs, **and**
2. **≥ 2 of 3** pilot families are PASS–PASS (model can actually do the tasks — guards a false-negative from model-floor), **and**
3. projected powered cost `= (pilot_spend / 3) × 20 × 1.3 safety ≤ 40` remaining.

Else **STOP** → emit `INCONCLUSIVE-STOPPED` with pilot numbers + cost projection + recommended amendment (PM-memo pattern). No metric swap, no re-run, no threshold move.

## 10. Pre-registered outcomes (all valid; none hidden)

- **PROVEN** — escalated, §3 met. Rubric D1 may move 2→3 with this as evidence.
- **NOT-PROVEN** — escalated, §3 not met. Rubric D1 stays 2; record honest effect size.
- **INCONCLUSIVE-STOPPED** — pilot gate (§9) failed (effect <40% directional, model-floor <2/3 PASS, or cost projection >cap). Rubric D1 stays 2, flagged "directional pilot only, not proven"; manifest the projection + amendment ask.

## 11. Anti-p-hacking

Single confirmatory analysis (§3). No optional stopping beyond the one pre-registered gate (§9). No post-hoc family/metric selection. Nondeterminism is handled by the sign test + explicit small-N pilot caveat; the pilot is explicitly underpowered and cannot itself say "proven" (§10). Results doc reports the verdict verbatim against this file.
