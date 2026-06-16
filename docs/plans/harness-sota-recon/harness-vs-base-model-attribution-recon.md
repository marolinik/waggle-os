# Recon: How Published Work Credibly Isolates a Harness/Scaffold from the Base Model

**Date:** 2026-06-16
**Purpose:** Feed a PUBLISHABLE benchmark design that claims "Waggle harness > raw base model." This file collects the standard methodological moves to attribute gains to the harness, the strongest reviewer attacks on such claims, and a concrete "must-report" checklist so the claim cannot be dismissed as *"you just called the model 10x."*
**Bottom line:** The killer critique is real and has sunk published claims before. The defense is **cost/compute-controlled evaluation**: report the **accuracy-vs-cost Pareto frontier**, show the **harness wins at EQUAL token/$ budget** (not just at higher accuracy), and use **`pass^k` (reliability)** not just `pass@k` (coverage), because the "just sample more" attack lives entirely in the `pass@k` regime.

---

## 0. The single most important framing

There are two distinct questions, and reviewers will force you to separate them:

1. **Coverage question** ("can the system ever get it right?") → measured by `pass@k`, by repeated sampling, by "best of N". **This is where the killer critique wins.** Almost any scaffold that issues more model calls will raise `pass@k`, because `pass@k` mechanically increases with more attempts. A reviewer will say: a raw model sampled N times gets the same lift for the same compute.

2. **Compute-efficiency + reliability question** ("does the harness get more correct answers *per unit compute*, and does it do so *consistently*?") → measured by the **accuracy-vs-cost Pareto frontier** and by **`pass^k`**. **This is where a harness can legitimately win and survive review.**

Your benchmark must be designed so that the headline claim lives in regime (2), not regime (1).

---

## 1. The standard methodological moves to attribute gains to the harness

### 1.1 Matched-model ablation (hold the base model FIXED, vary only the scaffold)

This is the foundational move. You fix the LLM weights and toggle scaffold components on/off. The gain that remains is the scaffold's contribution.

- **SWE-agent (Princeton, NeurIPS 2024, arXiv 2405.15793).** The canonical example. They hold the base model fixed and ablate the *Agent-Computer Interface* (ACI). On a 300-instance SWE-bench subset, **SWE-agent solves 10.7 percentage points more instances than a baseline agent that uses only the default Linux shell** with the same model. Headline: GPT-4 Turbo + SWE-agent resolves **12.5%** of the full 2,294-issue SWE-bench vs the **3.8%** prior best (an RAG pipeline) — and Claude 3 Opus + SWE-agent resolves **10.5%**. The paper's explicit thesis: "careful ACI design can substantially improve LM agent performance *without modifying the underlying LM's weights*." This is exactly the "harness isolated from model" claim done credibly. (Sources: NeurIPS 2024 proceedings PDF; arXiv 2405.15793; Princeton collaborate page.)
  - **Why it survives review:** the ablation is matched-model AND matched-task; the only thing that changed is the interface. They further ablate sub-components (search interface, file viewer with line limits, edit-with-linter feedback) so the gain is decomposed, not monolithic.

- **Reflexion (arXiv 2303.11366, NeurIPS 2023).** Ablates the *self-reflection* component: they omit the natural-language reflection step after a failed unit-test run, forcing the agent to combine error-identification and fixing in one step. Result: **the compromised agent did not improve over the baseline** — isolating the reflection module as the source of gains. Headline: 91% pass@1 on HumanEval vs GPT-4's 80%. **CAUTION — see §2.4: Reflexion's coding/decision-making results lean on oracle stopping, which is the central vulnerability.**

- **ADAS / Meta Agent Search (arXiv 2408.08435, ICLR 2025).** All baselines (CoT, CoT-SC/self-consistency, Self-Refine, LLM-Debate, Quality-Diversity) are *implemented in the same framework* as the discovered agents and *evaluated on the same base model* (GPT-3.5 for agents/baselines; GPT-4 only for the meta-search). This is the "same harness substrate, only the design varies" control. Critically, **ADAS caps inference budget at 20 queries / 10k tokens per question** for all methods — an explicit iso-budget control (see §1.2).

### 1.2 Iso-compute / iso-token / iso-call comparison (the decisive control)

Hold *compute spent at inference* fixed across the harness and the baseline. If the harness wins at *equal* budget, "you just spent more compute" is dead.

- **"AI Agents That Matter" (Kapoor, Stroebl, ... Narayanan; arXiv 2407.01502).** THE methodological reference for this exact problem. Core argument: agent benchmarks have "a narrow focus on accuracy without attention to other metrics," which produces "needlessly complex and costly" agents. Their fix: report **Pareto curves of accuracy vs inference cost** and *jointly optimize* both. Hard finding on **HumanEval**:
  - Simple **"Warming" baseline** (just call GPT-4 with retries/escalating prompts): **93.2% accuracy at $2.45**.
  - **LATS** (SOTA agent): **88.0% at $134.50**.
  - **LDB**: **91.0% at $2.19**.
  - Verdict: "State-of-the-art agent architectures for HumanEval do *not* outperform simple baselines." This is the cautionary tale: complex scaffolds *losing* once cost is on the axis.
  - They distinguish **model developers** (may control for *training* compute and use accuracy) from **downstream/agent developers** (must use *dollar cost* — parameter count is "misleading for downstream evaluation").

- **"Large Language Models Cannot Self-Correct Reasoning Yet" (Huang et al., DeepMind, ICLR 2024; arXiv 2310.01798).** Provides the iso-call takedown of multi-agent debate. **Table 7, matched model-call budget:**
  | Responses/calls | Self-Consistency | Multi-Agent Debate |
  |---|---|---|
  | 3 | 82.5% | 83.2% (6 calls) |
  | 6 | 85.3% | 83.2% (6 calls) |
  | 9 | 88.2% | 83.0% (9 calls) |
  Conclusion: "multi-agent debate significantly underperforms simple self-consistency" *at equivalent inference budgets*. The debate "gain" was just more compute. **This is precisely the attack a reviewer will run on Waggle.** Pre-empt it by running the equivalent table yourselves.

- **Inference Scaling Laws (arXiv 2408.00724) / Scaling Test-Time Compute Optimally (Snell et al., UC Berkeley + DeepMind, arXiv 2408.03314).** Establish the *compute-optimal inference* methodology: plot accuracy vs inference FLOPs/tokens, find the Pareto frontier across model sizes AND inference strategies (greedy, self-consistency, best-of-N, tree-search/REBASE). Snell et al.'s headline: a smaller model with optimally-allocated test-time compute can **outperform a model 14× larger at matched compute** (≈4× efficiency). The autoregressive cost model to cite: an LLM does **2P FLOPs per output token** (P = params), so generating T tokens ≈ **2PT FLOPs** — this lets you put *different models* on one compute axis. (Note: for an API product, *dollars* is the more honest axis than FLOPs, per "AI Agents That Matter".)

- **AlphaCodium (Qodo/CodiumAI, arXiv 2401.08500).** The efficiency framing: it beats AlphaCode "using a significantly smaller computation budget and **4 orders of magnitude fewer LLM calls**" (~15-20 calls/solution vs AlphaCode's ~millions). On CodeContests, GPT-4 pass@5 goes **19% → 44%** with the flow. This is a "harness wins while spending *less*" story — the strongest possible shape.

### 1.3 Pareto frontier (accuracy vs cost/tokens) as the primary plot

Do not report a single accuracy number. Report a **frontier**: each system is a point (or curve) in (cost, accuracy) space. A harness "wins" only if it is **on or above the frontier** traced by the *raw model swept across its own compute knobs* (temperature, #samples, best-of-N, longer reasoning). "AI Agents That Matter" frames this as opening "a new space for agent design: jointly optimizing cost and accuracy." METR (R&D-capabilities eval, 2024-11) uses the time-budget analog: score vs 2h/8h/32h budgets, with "best of k" splitting the budget into attempts.

### 1.4 Report tokens AND dollars per task alongside accuracy

Anthropic's "Demystifying evals for AI agents" guide bakes `n_total_tokens` and latency into its task spec's `tracked_metrics`. "AI Agents That Matter" insists dollar cost is the procurement-relevant metric for downstream developers. **Minimum reportable triple per system: (accuracy, mean tokens/task, mean $/task).** Ideally also turns/steps and wall-clock.

### 1.5 `pass@k` vs `pass^k` — and why `pass^k` (reliability) matters more for agents

- **`pass@k`** = P(at least one of k trials succeeds) = `1 − C(n−c, k)/C(n, k)`. Monotonically rises with k. **This is the metric the killer critique exploits** — more samples ⇒ higher `pass@k`, trivially.
- **`pass^k`** = P(*all* k trials succeed) = `E_task[ C(c,k)/C(n,k) ]` (τ-bench's estimator) ≈ `(c/n)^k` for the simple raw-rate form. Falls with k. Measures **consistency/reliability**.
- **Divergence (Anthropic guide + philschmid):** at k=1 they're identical; by **k=10 `pass@k` → ~100% while `pass^k` → ~0%**. philschmid's worked example: 70% per-trial rate ⇒ `pass@3 ≈ 97%` but `pass^3 ≈ 34.3%`.
- **τ-bench (Sierra; arXiv 2406.12045) introduced `pass^k` for tool-agents.** GPT-4o function-calling: ~61% on τ-retail / ~35% on τ-airline at pass^1, but **`pass^8` drops below ~25% on retail** — frequent inconsistency / rule-violation. Their point: real agents need robustness (`pass^k` trend), not just peak `pass^1`.
- **Why this defends Waggle:** a memory/governance harness that makes the agent *consistently* right (high `pass^k`) is doing something a raw model *cannot* replicate by sampling more — sampling more *lowers* `pass^k` reliability per attempt. Framing the win as a `pass^k`/reliability win structurally sidesteps the "just sample more" attack, which only ever buys `pass@k`.

### 1.6 The verifier caveat (coverage ≠ usable accuracy)

From **Large Language Monkeys (Brown et al., Stanford; arXiv 2407.21787):** coverage (`pass@k`) scales as a near-log-linear / exponentiated-power-law over 4 orders of magnitude of samples (DeepSeek-Coder-V2 on SWE-bench Lite: **15.9% @1 sample → 56% @250 samples**, beating the 43% single-sample SOTA). BUT: **in domains without an automatic verifier, methods for *picking* the right sample (majority voting, reward models) plateau after a few hundred samples** and do not track coverage. So repeated sampling only converts to real accuracy when you can verify. **Implication for Waggle:** if your tasks lack a cheap oracle verifier, the "raw model + N samples" baseline is *weaker than its `pass@k` suggests* — lean into this, and report **majority-vote / no-oracle accuracy**, not `pass@k`, for the raw-model baseline.

---

## 2. The strongest reviewer attacks on "harness beats model" — and how to pre-empt each

### 2.1 ATTACK: "Your harness just spends more inference compute (you called the model 10×)."
**Why it bites:** most scaffold gains correlate with extra calls/tokens. Epoch/Inside-the-Scaffold note "the highest-performing scaffolds typically give more affordances / more inference-time compute."
**Pre-empt:**
- Plot the **accuracy-vs-$ (and accuracy-vs-token) Pareto frontier**. Show Waggle is **above the raw model's own compute-sweep curve** (raw model at temp/#samples/best-of-N/extended-thinking matched to Waggle's spend).
- Provide the **iso-budget table** (à la Huang Table 7): raw model given the *same* token/$ budget as Waggle, via self-consistency / best-of-N. Waggle must still win.
- Best shape: show Waggle **wins while spending LESS** (AlphaCodium shape) on at least one axis.

### 2.2 ATTACK: "A trivial baseline (retry / self-consistency / best-of-N) catches up if you give it your budget."
**Why it bites:** "AI Agents That Matter" showed SOTA HumanEval agents losing to a "Warming" GPT-4 baseline.
**Pre-empt:** Include the *strong simple baselines* in your own paper: (a) single call, (b) self-consistency / majority vote at N, (c) best-of-N with your own selector, (d) extended-thinking / longer reasoning budget. Show the raw-model curve **plateaus or crosses below** Waggle as budget grows (i.e., raw sampling does NOT catch up). If it does catch up, you don't have a harness result — you have a compute result. Find the budget regime where you genuinely dominate, and state its bounds.

### 2.3 ATTACK: "Coverage (`pass@k`) is not accuracy — you can't pick the right answer without an oracle."
**Why it bites:** Large Language Monkeys — selection methods plateau without a verifier.
**Pre-empt:** Report **end-to-end accuracy with a realistic selector** (majority vote, or the harness's own committed single answer), never `pass@k`, as the headline. If you *do* have an automatic verifier (tests/exec), state it explicitly and acknowledge it advantages *both* Waggle and the sampling baseline equally.

### 2.4 ATTACK: "Your gains come from oracle/ground-truth leakage in the stopping rule."
**Why it bites:** THE famous one. Huang et al. (DeepMind, ICLR 2024) showed Reflexion/RCI used the **correct label to decide when to stop self-correcting** — "If we are already in possession of the ground truth, there seems to be little reason to deploy LLMs." Without the oracle, **intrinsic self-correction *degrades* performance**: GSM8K GPT-3.5 75.9% → 75.1% → 74.7%; CommonSenseQA **75.8% → 38.1% → 41.8%**. With the oracle stop it *looks* like a gain (GSM8K 75.9→84.3; CSQA 75.8→89.7) — but that gain is the oracle, not the harness.
**Pre-empt:** Your harness's stopping/verification/retry logic **must NOT consult the gold label**. Audit every loop-termination condition. State explicitly: "no component of the harness has access to ground-truth labels at inference time." If you use test execution as feedback, that's allowed *only if* the baseline gets the same tests. (Waggle relevance: any memory/quality/contradiction loop that "knows when it's right" via the eval answer would be fatal.)

### 2.5 ATTACK: "Scaffold-model confound — your scaffold is tuned to *this* model (and maybe by the same org)."
**Why it bites:** "Inside the Scaffold" (arXiv 2604.03515) deliberately avoids benchmarking because "benchmark scores confound scaffold architecture with model capability"; agent scaffolds are "engineered to accommodate specific model tendencies, especially when developed by the same organization."
**Pre-empt:** Run the **same harness across ≥2-3 base models from different providers** (e.g., a Claude, a GPT, an open model). If the harness lifts *all* of them, the gain is the harness, not co-tuning. Report the lift per model.

### 2.6 ATTACK: "Benchmark overfitting / no held-out set / contamination."
**Why it bites:** "AI Agents That Matter": of surveyed benchmarks, only **1/8 domain-general** and **0/2 fully-general** had appropriate held-outs; WebArena's STeP "agent" hardcoded `/user/user_name` URL shortcuts. Plus public benchmarks may be in pretraining data (Search-Time Data Contamination; SWE-bench contamination concerns).
**Pre-empt:** Use a **held-out / freshly-constructed test split** the harness was never tuned on; report tuning vs test separately; prefer benchmarks with private test sets or recent/temporal cutoffs; if using a public set, run a contamination check and disclose.

### 2.7 ATTACK: "`pass@1` is up but the agent is unreliable (`pass^k` collapses)."
**Why it bites:** τ-bench — `pass^8 < 25%` for GPT-4o. A leaderboard `pass^1` win can mask production-unusable inconsistency.
**Pre-empt:** Report `pass^k` curves. Turn this *for* you: if Waggle's memory/governance improves `pass^k` (consistency), that's a defensible, hard-to-fake harness contribution.

### 2.8 ATTACK: "Variance / too few seeds / cherry-picked run."
**Pre-empt:** Multiple seeds, report mean ± CI, sufficient N (the Waggle LoCoMo arc already uses N=320-400 with Fisher tests — match that rigor). State the statistical test and effect size, not just point estimates.

### 2.9 ATTACK: "Unfair baseline — you under-powered the raw model."
**Pre-empt:** Give the raw-model baseline its *best* configuration (good system prompt, self-consistency, extended thinking, best-of-N with a fair selector). A strawman baseline is the fastest desk-reject. The credibility of the harness claim is exactly as strong as the strength of the baseline it beats.

---

## 3. Concrete: what Waggle MUST report so the claim cannot be dismissed

A skeptical reviewer should be unable to say "you just called the model 10×." To guarantee that, report all of:

1. **Matched-model ablation table.** Same base model(s), scaffold components toggled (memory on/off, retrieval on/off, governance/quality loop on/off). Decompose the gain by component (SWE-agent style), don't report it as one monolith.

2. **Accuracy-vs-cost Pareto frontier (the headline figure).** X-axis = $/task (primary) and tokens/task (secondary); Y-axis = accuracy. Overlay:
   - Waggle (as a point or a budget curve),
   - raw base model swept across its compute knobs: temperature, **self-consistency @ N**, **best-of-N**, extended-thinking budget.
   - **Claim shape that survives review:** Waggle sits *above and/or left of* the raw-model curve, AND the raw-model curve **does not catch up** even when extended to ≥ Waggle's budget.

3. **Iso-budget head-to-head table (the Huang Table 7 analog).** Fix total tokens (or $, or model calls) to Waggle's actual spend; give the raw model that exact budget via self-consistency/best-of-N. Waggle must still win at equal budget. Show 2-3 budget levels so the trend is visible.

4. **(accuracy, tokens/task, $/task, turns/task)** for every system, every cell. No naked accuracy numbers anywhere.

5. **`pass^k` reliability curves**, not just `pass@k`. Headline accuracy = committed single answer or majority vote, NEVER `pass@k`. If you report `pass@k` at all, pair it with `pass^k` and with no-oracle selected accuracy.

6. **Oracle-free audit statement.** Explicit sentence: "No harness component (stopping, verification, retry, memory write/read, selection) consults ground-truth labels at inference time." This directly inoculates against the 2310.01798 critique — the one most likely to sink the paper.

7. **Cross-model generalization.** Same harness on ≥2-3 base models from different providers; report per-model lift. Kills the scaffold-model co-tuning confound.

8. **Held-out / contamination-checked test set**, with tuning-set vs test-set numbers separated, and a contamination disclosure.

9. **Statistical rigor.** Multiple seeds, mean ± CI, N large enough, named test + effect size (continue the LoCoMo-arc standard: N≈320-400, Fisher/z-tests).

10. **Strong, well-tuned baselines.** Single-call (best prompt), self-consistency@N, best-of-N, extended-thinking. The harness claim is only as credible as the strongest baseline it beats.

### The one-sentence defensible claim template
> "At **equal token/dollar budget** (Pareto-matched), the Waggle harness achieves **+X pp accuracy** and **+Y pp `pass^k` reliability** over the raw base model swept across its own inference-compute knobs (self-consistency, best-of-N, extended thinking), and the raw-model curve **does not close the gap** even when extended to ≥N× Waggle's budget; the lift holds across **M base models** from different providers, with **no ground-truth access** in any harness component, on a **held-out** test set."

If every clause in that sentence is backed by a figure/table, "you just called the model 10×" is not available to the reviewer.

---

## 4. Source ledger (URL + the specific number/claim used)

- **SWE-agent** — Princeton, NeurIPS 2024. ACI ablation **+10.7pp** vs default-shell baseline (300 instances, same model); GPT-4 Turbo **12.5%** full SWE-bench vs **3.8%** prior best; Claude 3 Opus **10.5%**; "without modifying the underlying LM's weights." https://arxiv.org/abs/2405.15793 · https://proceedings.neurips.cc/paper_files/paper/2024/file/5a7c947568c1b1328ccc5230172e1e7c-Paper-Conference.pdf
- **AI Agents That Matter** — Kapoor/Stroebl/Narayanan. HumanEval: Warming GPT-4 **93.2% @ $2.45** vs LATS **88.0% @ $134.50** vs LDB **91.0% @ $2.19**; "SOTA agent architectures for HumanEval do not outperform simple baselines"; accuracy-vs-cost Pareto; model-dev vs downstream-dev cost framing; held-out gaps (1/8 domain-general, 0/2 fully-general). https://arxiv.org/pdf/2407.01502
- **LLMs Cannot Self-Correct Reasoning Yet** — Huang et al., DeepMind, ICLR 2024. Intrinsic self-correct DEGRADES: GSM8K 75.9→75.1→74.7; CSQA **75.8→38.1→41.8**; oracle-stop inflates (GSM8K→84.3, CSQA→89.7); Table 7 iso-call: self-consistency ≥ multi-agent debate (88.2% vs 83.0% @ 9 calls). https://arxiv.org/abs/2310.01798 · https://arxiv.org/html/2310.01798v2
- **τ-bench** — Sierra, ICLR 2025. `pass^k = E_task[C(c,k)/C(n,k)]`; GPT-4o ~61% retail / ~35% airline @ pass^1; **`pass^8` < ~25%** retail; reliability > peak success. https://arxiv.org/abs/2406.12045
- **Pass@k vs Pass^k** — Anthropic eng guide: "k=1 identical; by k=10 pass@k → ~100% while pass^k → ~0%"; tracked_metrics include n_total_tokens. https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents · philschmid: 70% rate ⇒ pass@3 ≈97%, **pass^3 ≈34.3%**. https://www.philschmid.de/agents-pass-at-k-pass-power-k
- **Large Language Monkeys** — Brown et al., Stanford, arXiv 2407.21787. Coverage power-law over 4 OOM; DeepSeek-Coder-V2 SWE-bench Lite **15.9%@1 → 56%@250** (>43% SOTA); cheaper-model-×5-samples beats one GPT-4o/Claude sample; **without a verifier, majority-vote/reward-model selection plateaus** after a few hundred samples. https://arxiv.org/abs/2407.21787 · https://scalingintelligence.stanford.edu/pubs/large_language_monkeys
- **Scaling Test-Time Compute Optimally** — Snell et al., UC Berkeley + DeepMind, arXiv 2408.03314. Compute-optimal allocation lets a smaller model beat a **14×-larger** model at matched compute (~4× efficiency). https://arxiv.org/abs/2408.03314
- **Inference Scaling Laws** — arXiv 2408.00724. Accuracy-vs-FLOPs Pareto across model sizes × strategies (greedy/SC/best-of-N/REBASE); **2P FLOPs/token** cost model; REBASE 7B beats weighted-voting at ~7× less compute. https://arxiv.org/pdf/2408.00724
- **AlphaCodium** — Qodo, arXiv 2401.08500. Beats AlphaCode with **4 OOM fewer LLM calls** (~15-20/solution); CodeContests GPT-4 pass@5 **19%→44%** via flow engineering. https://arxiv.org/abs/2401.08500
- **Reflexion** — arXiv 2303.11366, NeurIPS 2023. HumanEval **91% pass@1** (vs GPT-4 80%); ablation: removing the NL reflection step ⇒ no improvement over baseline. **CAVEAT:** coding/decision results use oracle stopping (per Huang et al.). https://arxiv.org/abs/2303.11366
- **ADAS / Meta Agent Search** — arXiv 2408.08435, ICLR 2025. Baselines (CoT, CoT-SC, Self-Refine, LLM-Debate, QD) in same framework, same eval model; **iso-budget cap 20 queries / 10k tokens per question**; +13.6 F1 reading, +14.4% math over hand-designed. https://arxiv.org/abs/2408.08435
- **METR R&D-capabilities eval (2024-11)** — score vs 2h/8h/32h *time* budgets; humans ~2× agents at 32h; "best of k" splits budget; agents cheaper/hour ⇒ scaffolding could lift performance-per-cost; does NOT isolate scaffold from model. https://metr.org/blog/2024-11-22-evaluating-r-d-capabilities-of-llms/
- **Inside the Scaffold** — arXiv 2604.03515. "benchmark scores confound scaffold architecture with model capability"; scaffolds "engineered to accommodate specific model tendencies, especially ... same organization." https://arxiv.org/abs/2604.03515
- **Epoch/scaffold-affordance note** (via search): "highest-performing scaffolds typically give more affordances / more inference-time compute"; ~33% (simple) vs **62.2%** (optimized scaffold) on SWE-bench Verified, Claude-Sonnet-3.5.

---

## 5. Verification gaps / what I could NOT confirm directly

- **PDF extraction failures:** WebFetch could not parse several arXiv PDFs (binary stream): SWE-agent PDF, Large Language Monkeys PDF, τ-bench PDF, Inference Scaling Laws PDF, SWE-agent NeurIPS PDF. Numbers for those were taken from **WebSearch result summaries and secondary sources**, cross-checked across ≥2 results where possible (SWE-agent 10.7pp / 12.5% / 3.8% appear in two independent searches; τ-bench pass^8<25% from one search summary + the OpenReview/Sierra framing). **Before publishing, re-verify exact decimals against the source PDFs** (especially Huang Table 7 percentages, τ-bench per-domain numbers, and the SWE-agent sub-component ablations which I could not get line-by-line).
- **SWE-agent sub-component ablations** (search interface, file-viewer window size, edit-linter individual deltas) — confirmed they exist but I could not extract per-component numbers; pull from §4 of the paper.
- **METR** does NOT do scaffold isolation — cited only as a *budget-curve / human-baseline-matching* methodology exemplar, not as a harness-attribution example.
- **The philschmid article** does not cover the "just sample more" counterargument; the Anthropic guide gives the pass@k/pass^k divergence and tracks tokens but offers **no** explicit matched-compute methodology — so the matched-compute defense rests on "AI Agents That Matter" + Huang et al., which are the load-bearing references.
- I did **not** locate a single paper that does *all* of (matched-model ablation + iso-cost Pareto + pass^k + cross-model + held-out + oracle-free audit) together. The Waggle benchmark combining them would itself be a methodological contribution — but that also means there's no single template to copy; assemble from the references above.
