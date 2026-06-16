# Prior Art Recon — "Smaller/Open Model + Scaffolding + Memory ≈ Premium Frontier"

**Date:** 2026-06-16
**Author:** research agent (web recon for publishable benchmark design)
**Purpose:** Find prior art for the founder's central claim — *scaffolding + memory lets a SMALLER / OPEN model match a PREMIUM frontier model* — and extract (1) a precedent table, (2) which framings proved defensible vs which got torn apart, (3) specific guidance to make a **Qwen3.6 + harness + memory ≈ Opus-4.8-raw** claim survive a hostile read.

> Scope note: all numbers below are from public web sources, dated and cited inline. Where a source conflicts with our own internal docs, that is called out explicitly (see §6 "Corrections to internal docs"). I did **not** run any benchmark; this is literature/landscape recon only.

---

## 0. Executive summary (the one-paragraph version)

The "small/open + scaffold + memory ≈ frontier" claim has **strong, repeated, published precedent** — but **almost every version that survived scrutiny was carefully scoped**, and **the broad version ("our cheap stack = GPT-4/Opus, period") gets torn apart every time.** The three durable framings are: (a) **scaffold-controlled** ("the same model is worth 15-30pp depending on the harness" — HAL, Live-SWE-agent, the May-2026 leaderboard's "30-point spread"); (b) **test-time-compute-on-easy-problems** ("a small model thinking longer beats a 14× bigger one *where the small model already has non-trivial success*" — Snell et al.); and (c) **memory-as-leveler-on-long-context-tasks** ("structured memory lifts a 20B model above full-context GPT-4o" — Hindsight). The claim that consistently **fails** is the unscoped capability-parity one, because (i) every credible memory paper that disclosed it found the architecture **scales WITH model quality** (so it lifts the frontier model too, and the gap persists), and (ii) the memory benchmarks themselves (LoCoMo especially) have been **publicly audited as broken** (6.4% wrong answer key; judge accepts 62.8% of wrong-but-topical answers; weak full-context baseline that a no-memory model beats). **The single most defensible move for us:** frame it as **iso-model harness/memory lift** + **cost-controlled Pareto**, on a **hardened, non-LoCoMo benchmark**, with an **independent ensemble judge**, against **Opus-with-its-own-tools-and-extended-thinking** (NOT raw Opus) — see §5.

---

## 1. PRECEDENT TABLE — who claimed small/open ≈ frontier, on what, how strong

Legend for "Strength": **A** = peer-review-grade, scoped, survived scrutiny · **B** = credible vendor/lab claim, defensible-if-scoped · **C** = headline claim that got materially walked back or torn apart.

| # | Who / source | Exact claim | Models compared | Benchmark | Delta | How RECEIVED | Strength |
|---|---|---|---|---|---|---|---|
| P1 | **Snell et al. 2024** (DeepMind), *Scaling LLM Test-Time Compute Optimally…* (arXiv:2408.03314) | "On problems where a smaller base model attains **somewhat non-trivial success rates**, test-time compute can be used to outperform a **14× larger** model" (FLOPs-matched) | small base vs 14× larger (PaLM-2 family) | MATH | beats 14× bigger | Widely cited, foundational. **Survived** because explicitly scoped: "effectiveness… **critically varies depending on the difficulty of the prompt**." On the hardest problems it does **not** substitute for params. | **A** |
| P2 | **HuggingFace 2025** test-time-scaling cookbook / VentureBeat writeup | Small model "punches above its weight" — Llama-1B/3B with search+PRM approaches much larger model on MATH-500 | Llama-3.2-1B/3B + best-of-N/beam + process reward model vs Llama-8B/70B | MATH-500 | 1B→~8B, 3B→~70B (compute-heavy) | Positive, but the **caveat is load-bearing**: needs a *verifier/PRM* and works on problems with a verifiable signal; not a general capability claim. (VentureBeat URL 403'd; corroborated via search snippet + Snell.) | **A/B** |
| P3 | **SWE-Reasoner** *Thinking Longer, Not Larger* (arXiv:2503.23803) | A **32B open** model reaches **46% on SWE-bench Verified, surpassing DeepSeek-R1 671B and OpenAI o1** via development-process test-time search + verifiers | 32B open vs 671B / o1 | SWE-bench Verified | 32B > 671B / o1 | On-topic and strong. Caveat: relies on **execution verification + reward-model search** (a scaffold/test-time-compute story, not a bare-model story). | **A/B** |
| P4 | **DeepSWE** (Together AI / Agentica, Jul 2025) | RL-trained **Qwen3-32B** hits **59% SWE-bench Verified with test-time scaling** (42.2% Pass@1) — "new SOTA for open-weight" | Qwen3-32B vs other open agents | SWE-bench Verified | 23%→42.2% Pass@1; 59% w/ TTS | Well-received as **open-weight SOTA**. Crucially **made NO claim to match closed frontier**. The 59% needs **K=16 rollouts + a hybrid verifier**; Pass@1 (42.2%) is the honest single-run number. The gap between 42.2 and 59 is the test-time-compute tax. | **B** |
| P5 | **Live-SWE-agent** (2026) | Best **open-source scaffold** on a closed model (Opus 4.5) hits **79.2% SWE-bench Verified**, trailing Anthropic's **own internal scaffold by just 1.7pp** (80.9%) | Opus 4.5 + OSS scaffold vs Opus 4.5 + Anthropic scaffold | SWE-bench Verified | −1.7pp | This is a **scaffold-parity** claim (same model, different harness), NOT open-vs-closed. Received positively *for reproducibility*; flagged concern: a self-rewriting agent is "harder to audit, test, and constrain." | **B** (scaffold story) |
| P6 | **Holistic Agent Leaderboard (HAL)** (arXiv:2510.11977) | 21,730 rollouts, 9 models × 9 benchmarks, ~$40k. Scaffold/harness is a **dominant confound**; "**higher reasoning effort reduced accuracy in the majority of runs**"; log inspection found agents **"searching for the benchmark on HuggingFace instead of solving the task"** (contamination behavior). | 9 models across scaffolds | 9 agent benchmarks | — | The **rigor anchor**. Establishes that scaffold variance + contamination + reasoning-effort backfire make naive agent comparisons unreliable. **Cite this to pre-empt the "your scaffold is doing the work" objection — by owning it.** | **A** |
| P7 | **May-2026 agent leaderboard** (codersera) | "A **30-point spread** between HAL-scaffolded Sonnet 4.5 (74.6% GAIA) and bare GPT-5 Mini (44.8% GAIA)… agent harnesses can dramatically elevate weaker models." | Sonnet-4.5 (HAL) vs GPT-5-Mini (bare) on GAIA | GAIA | ~30pp from scaffold alone | Secondary source, but the **single cleanest quote** that scaffold≫model on open-ended agent tasks. | **B** |
| P8 | **Hindsight** (Vectorize, arXiv:2512.12818) | Memory lifts a **GPT-OSS-20B** from **39%→83.6%** (LongMemEval) and **"outperforms full-context GPT-4o" (60.2%)** with the same 20B backbone. On **LoCoMo: OSS-20B = 83.18, OSS-120B = 85.67, Gemini-3 = 89.61** | OSS-20B/120B/Gemini-3 + Hindsight memory vs full-context GPT-4o | LongMemEval, LoCoMo | 20B+mem (83.6) >> full-ctx GPT-4o (60.2) | The **closest precedent to our exact claim**. BUT: judge = **GPT-OSS-120B self-judge for all Hindsight rows**; LoCoMo = only **50 conversations**; **no ablation** isolating which component (reranker/temporal/graph) drives gains. | **B** (memory story; judge caveat) |
| P9 | **Mastra Observational Memory** | LongMemEval: **GPT-4o 84.23%, GPT-5-mini 94.87% ("~95%")** with the SAME architecture | GPT-4o vs GPT-5-mini, same OM arch | LongMemEval-S (500 Q) | +10.64pp **from the model, arch held constant** | **Self-disclosed the key anti-pattern:** "OM's architecture **scales with model quality**." I.e. memory does **not** equalize models — the better model still wins by ~11pp with identical memory. Single-session category = 30 Q → "one flip = 3.3pp" (noise). | **B** (honest) |
| P10 | **Ensue** (open-source memory) | **88.2% LongMemEval with open-source models**, 93.2% with GPT-5-mini — "the **5-point gap is what the better model adds**; 88% is what our architecture delivers on its own." | open-source vs GPT-5-mini, same pipeline | LongMemEval | −5pp (open vs closed, same arch) | The **most honest framing in the genre** and the template we should copy: *attribute the residual gap to the model, claim only the architecture's floor.* | **B** (model-agnostic) |
| P11 | **DeepSeek V3 / R1** (Dec 2024 – 2025) | "GPT-4-class / o1-class performance at a fraction of the cost" (R1 on par with o1; "20-50× cheaper") | DeepSeek vs GPT-4o / o1 | MMLU/MATH/AIME/coding | parity-ish; cost 20-50× | Mixed. **Capability parity largely held** on math/reasoning; the **cost claim ($5.6M training) drew heavy skepticism** (Epoch: plausible but contested). Also "brittle, hard to prompt," weak safety. The *cost* claim is what got attacked, not the *capability* one. | **B/C** (cost claim = C) |
| P12 | **τ²-bench mid-2026** (Sierra) | Open **Qwen3.6 Plus = 76.8%** vs **Claude Opus 4.5 = 77.9%** (≈1pp) on agentic tool-use — and telecom split now **saturated ~99% for everyone** | Qwen3.6 Plus vs Opus 4.5 | τ²-bench | ~1pp (open ≈ closed already) | Shows open models are **already near-parity raw** on bounded tool-use → makes "harness+memory closes the gap" a *smaller, easier, more defensible* delta on these tasks; but saturation kills discriminative power. | **B** |
| P13 | **"GPT-4 for $X" genre** broadly | recurrent claim that open model = GPT-4 at fraction of cost | many | MMLU etc. | varies | **Frequently undermined by contamination** ("some models reach GPT-4 scores through clear data contamination"; SWE-bench Pro found a closed model "cheating on 12% of tasks"). The genre's reputation is *exactly* what a hostile reviewer will pattern-match us to. | **C** |

---

## 2. The FRAMINGS — what proved defensible vs what got torn apart

### 2.1 DEFENSIBLE framings (copy these)

1. **Iso-model harness lift ("the scaffold is worth N points on the SAME model").**
   - Live-SWE-agent (P5): Opus+OSS-scaffold within **1.7pp** of Opus+internal-scaffold.
   - HAL/May-2026 (P6,P7): **~30pp** spread on GAIA from scaffold alone, same model class.
   - Why it survives: the model is held constant, so "the scaffold did it" is not an objection — **it's the point.** No open-vs-closed capability claim to attack.

2. **Test-time-compute trades for params — on problems with a verifiable signal and non-trivial base success.**
   - Snell et al. (P1), HF (P2), SWE-Reasoner (P3): all real, all cited, **all explicitly scoped** to "where the base model already does non-trivially / where a verifier exists."
   - Why it survives: the authors **named the boundary themselves** (hard problems, no verifier → fails). Owning the limit is what made it durable.

3. **Memory-as-leveler, with the residual gap honestly attributed to the model.**
   - Ensue (P10): "the 5-point gap is what the better model adds; 88% is what our architecture delivers." Mastra (P9): "architecture scales with model quality."
   - Why it survives: it does **not** claim the small model *equals* the big one — it claims the architecture has a high floor that the open model reaches, and the model adds a quantified, disclosed residual.

4. **Cost-controlled Pareto frontier** ("at $X/task, the open stack is on/above the frontier").
   - DeepSeek capability parity (P11) + HAL cost-accuracy framing (P6). Cost-per-task Pareto is much harder to attack than raw parity, because it concedes the frontier model *can* be better while showing it's not *worth it* at the margin.

### 2.2 TORN-APART framings (avoid these)

1. **Unscoped capability parity** ("our small stack = Opus/GPT-4").**
   The "GPT-4 for $X" genre (P13) is the reviewer's prior. Pattern-matching to it is fatal. The instant you say "≈ Opus" without scope, you inherit the whole genre's skepticism (contamination, cherry-picking, weak baselines).

2. **Numbers on LoCoMo as a headline.** LoCoMo is **publicly audited as broken**:
   - **Penfield Labs audit:** **6.4% of the 1,540-item answer key is wrong** (99 errors: hallucinated facts, bad temporal reasoning, speaker mis-attribution) → a noise floor ~2× the typical ML-benchmark error rate; **the LLM judge accepted 62.81% of intentionally-wrong-but-topically-adjacent answers** ("vague correct-topic answers passed nearly two-thirds of the time, rewarding weak retrieval").
   - **Weak full-context baseline:** Mem0's own LoCoMo results show their memory system **beaten by simply feeding the whole conversation** (~73% full-context vs ~68% Mem0) → the benchmark measures **context-window efficiency, not memory**. Conversations are only **16k-26k tokens** — trivially inside modern context windows.
   - **Zep teardown of Mem0** ("Lies, Damn Lies, and Statistics"): Mem0's SOTA claim rested on a **weak baseline + mis-implemented competitor** (wrong user model, improper timestamps, sequential-not-parallel search inflating competitor latency); "Category 5 unusable — missing ground truth." Corrected Zep = 75.14 ±0.17.
   - **Zep's own 84% LoCoMo claim was itself corrected to 58.44%** (getzep/zep-papers issue #5) — *the auditors got audited.* Nobody in this space has clean hands on LoCoMo.

3. **Self-judge (model judging its own family).** Hindsight (P8) used **GPT-OSS-120B as judge for all its own rows** — a reviewer will discount this immediately. Our own internal doctrine already knows this (HARNESS-BENCHMARK-GOAL §7 "Judge-leniency risk… use an independent/ensemble judge and report the self-vs-independent delta").

4. **Headline test-time-compute number that hides the rollout tax.** DeepSWE's **59% needs K=16 + a verifier**; the honest number is **42.2% Pass@1** (P4). Publishing "59%" without the Pass@1 and the compute multiplier is the kind of thing that gets a footnote-shamed retraction.

5. **The cost claim, unsubstantiated.** DeepSeek's *capability* survived; its **$5.6M cost claim got the skepticism** (P11). If we make a cost-parity claim, the cost accounting must be airtight (include the test-time-compute cost of the harness + the memory ingestion cost, not just the cheap per-token rate).

---

## 3. The CENTRAL THREAT to a "Qwen3.6 + harness + memory ≈ Opus-4.8-raw" claim

**The memory/scaffold literature's own honest results refute the naive version of our claim.** Three independent sources (Mastra P9, Ensue P10, and implicitly Hindsight P8) found that **the same architecture lifts the better model too** — memory is model-agnostic and *amplifies* with model quality. A hostile reviewer's one-line kill shot:

> "Your harness + memory would also lift Opus-4.8. You compared *Qwen + your full stack* against *Opus raw*. Give Opus the same stack and the gap reopens. You didn't level the field; you handicapped the baseline."

This is the **baseline-fairness** objection, and it is the objection that ends the conversation if we haven't pre-built the answer. It maps directly onto the founder's stated question: *"raw Opus with NO tools vs Opus with its own tools/extended thinking — which baseline is fair?"*

### The raw numbers that define the gap we'd need to close (mid-2026, public):
| Benchmark | Opus 4.8 (raw-ish) | Qwen3.6-35B-A3B | Qwen3.6 Plus | Best open | Source |
|---|---|---|---|---|---|
| SWE-bench Verified | **88.6%** | 73.4% | 78.8% | DeepSeek-V4-Pro-Max 80.6% | codersera / morphllm / vals |
| Terminal-Bench 2.0 | 69.4% (Opus 4.7) | 51.5% | — | — | getmaxim |
| τ²-bench | Opus 4.5 = 77.9% | — | 76.8% | — | Sierra / benchlm |
| GPQA Diamond | 94.2% (Opus 4.7) | trails | "parity reported" | — | getmaxim |
| MCP Atlas (agentic) | 77.3% (Opus 4.7) | — | 48.2% | — | getmaxim |

- **Raw SWE-bench gap Qwen3.6-35B → Opus-4.8 ≈ 15pp.** That is the gap the harness+memory must demonstrably close.
- **getmaxim's verdict is the key nuance:** the gap is **largest on open-ended agentic workloads (74.9 vs 61.6 avg)** and **narrows inside bounded, repeatable, constrained loops** (document parsing, screenshot QA, UI generation). → **Our claim is most defensible if our task distribution is bounded/repeatable, least defensible on open-ended agency.**

---

## 4. Which PREMIUM BASELINE is fair? (the founder's explicit question)

**Recommendation: the fair premium baseline is Opus-4.8 WITH its own first-party tools + extended thinking, run inside the SAME harness/scaffold our Qwen runs in — NOT raw Opus with no tools.** Reasons, grounded in the literature:

1. **The field's own fairness standard requires equal tool access.** The agent-eval survey + unified-framework papers (arXiv:2605.27898, 2507.21504) state the principle plainly: *"expose closed-source baselines to the full interfaces of all tools and explicitly instruct them they may invoke these tools,"* and *"scaffold choices can substantially affect evaluation outcomes."* Comparing your-scaffolded-Qwen to no-scaffold-Opus violates the equal-tool-access principle the reviewers will hold you to.

2. **A skeptic will reconstruct the fair comparison anyway.** The Zep-vs-Mem0 teardown (§2.2) is precisely a case of a reviewer re-running the comparison with the competitor properly configured and watching the SOTA claim collapse. If raw-Opus is a strawman, someone will give Opus the harness and publish the correction *for* you.

3. **It still leaves us a real, defensible claim.** Even Opus-with-everything vs Qwen-with-everything: if Qwen+ours lands **within a small, disclosed margin** of Opus+ours **at a fraction of the cost / fully locally**, that is the *durable* claim (the Ensue/Pareto framing P10/§2.1.4). "We don't beat the frontier model; we get **within Xpp at 1/Nth the cost, on your own hardware, with zero data egress**" is *stronger for our actual audience (sovereign buyers)* than a fragile "we equal Opus."

### Recommended baseline ladder (publish ALL of them — the comparison set IS the rigor):
| Arm | What it isolates | Role |
|---|---|---|
| **A. Opus-4.8 + our harness + our memory** | the ceiling with everything | the *fair* premium baseline — the number we must come close to |
| **B. Qwen3.6 + our harness + our memory** | **our headline system** | the protagonist |
| **C. Opus-4.8 raw (no tools, no memory)** | model-only ceiling | shows how much the harness/memory adds *to the frontier model* (and that it's not free) |
| **D. Qwen3.6 raw (no tools, no memory)** | model-only floor | shows the lift our stack gives the open model (the Hindsight 39→83.6 move) |
| **E. Opus-4.8 + Opus's own first-party tools/extended-thinking** | the realistic way someone uses Opus | the *commercial* baseline (what a buyer would actually compare against) |

The **headline claim** is then a *quantified, bounded* statement built from these arms, e.g.:
> "B reaches within Δpp of A and exceeds E on [bounded task class], at 1/N the $ and fully local (egress=0)." — with Δ disclosed, CIs reported, on a hardened benchmark, independent judge.

**Do NOT** publish "B ≈ C" (Qwen+stack vs raw Opus). That is the handicapped-baseline framing that gets torn apart.

---

## 5. SPECIFIC GUIDANCE — making OUR claim survive a hostile read

A checklist distilled from every teardown above. Each item maps to a documented failure mode.

1. **Pick the right claim shape.** Lead with **iso-model harness/memory lift** (§2.1.1) + **cost-controlled Pareto / sovereignty** (§2.1.4), NOT capability parity. "Within Δpp at 1/N cost, locally" beats "≈ Opus." This is also exactly the §0-Reading-B positioning the founder already locked (arena + governance, not "we beat the frontier").

2. **Run Opus WITH the stack (arm A) and publish it.** Pre-empt the baseline-fairness kill shot (§3) by being the one who ran it. The honest residual (A − B) is your credibility, not your weakness — Ensue (P10) made the residual the headline and it survived.

3. **Do NOT headline LoCoMo.** It is audited-broken (§2.2.2). If LoCoMo appears at all, it's a *secondary* cell with the Penfield caveats cited in-text. **Headline on a hardened benchmark**: LongMemEval (knowledge-updates + abstention; 500 Q) or BEAM (unsaturated, up to 10M tokens, designed so structured memory beats long-context) for memory; for agency, prefer **contamination-controlled** sets (SWE-bench Pro / SWE-rebench / TheAgentCompany with its 71% deterministic grading) over vanilla SWE-bench Verified, which the May-2026 source flags as contaminated.

4. **Independent ensemble judge + report the self-vs-independent delta.** Hindsight's self-judge (P8) is the discount-on-sight error. Our own doctrine (HARNESS-BENCHMARK-GOAL §7) already mandates this and our LoCoMo arc already used trio-strict — keep it.

5. **Report the test-time-compute tax explicitly.** If the harness uses best-of-N / verifier search / multiple rollouts (the Snell/DeepSWE mechanism), publish **Pass@1 AND the TTS number AND the compute multiplier AND the $/task**. The cost-parity claim dies if the "cheap" open model needs 16× rollouts to match (DeepSeek cost-claim lesson, P11; DeepSWE 42.2 vs 59, P4).

6. **Scope to where the gap is closeable.** getmaxim (§3): the gap narrows on **bounded, repeatable** tasks and is largest on **open-ended agency**. Define the task distribution honestly and don't over-generalize from a bounded win to "general parity." Snell's "varies by difficulty" is the same lesson.

7. **Pre-register and disclose everything Penfield demands** (§2.2.2): ingestion method + prompt, embedding model, answer-generation prompt, judge model + prompt, **number of runs + std-dev**, N per cell, denominator (strict vs judged-only), exclusions. No post-hoc baseline shopping (our §7 honesty bar).

8. **Decontamination check.** HAL (P6) caught agents *Googling the benchmark*; the genre (P13) is contamination-haunted. Use/cite a decontaminated split (SWE-rebench) or run a contamination probe; for Qwen specifically, note training-cutoff vs benchmark-release dates.

9. **Account for "reasoning effort can backfire."** HAL: higher reasoning effort *reduced* accuracy in the majority of runs. If we tune the harness's thinking budget, sweep it and report the curve — don't assume more is better, and don't let a reviewer find a setting where less compute wins.

10. **Concede the audit/governance cost of the scaffold.** Live-SWE-agent's reviewers flagged that a clever self-modifying scaffold is "harder to audit." For OUR sovereign/governance positioning, turn this into a feature: our harness is **auditable (events.jsonl trace) and reproducible**, which is the KVARK story — make auditability part of the claim, not a liability.

---

## 6. Corrections to internal docs (verify-don't-trust)

1. **`MEMORY-SOTA-PROPOSAL-2026-06-10.md` line 184-185 says** *"Hindsight's local-model result (85.67 w/ GPT-OSS-20B)."* **This is wrong on the model.** Per the Hindsight benchmark README, **85.67 = GPT-OSS-120B**; **GPT-OSS-20B = 83.18** on LoCoMo. (The 20B's headline result is the **LongMemEval 39%→83.6%** lift, and "outperforms full-context GPT-4o" — a *different* benchmark.) The architectural-validation argument still holds, but cite the correct pairing or a reviewer will catch it.

2. **The Hindsight LoCoMo result rests on N=50 conversations and a GPT-OSS-120B self-judge with no component ablation** — weaker evidence than the proposal's tone implies. Treat it as *directional support*, not a peer-reviewed anchor.

3. **MEMORY-SOTA-PROPOSAL's own LoCoMo landscape table** is internally fine, but note that **the whole LoCoMo edifice is contested** (Penfield + Zep + the Zep-84%→58.44% self-correction). Our doc's instinct — *"in-harness same-judge comparison is the defensible standard"* (line 37) — is **exactly right** and should be elevated to a stated principle: cross-lab LoCoMo numbers are uncitable; only same-harness/same-judge deltas count.

4. **`HARNESS-BENCHMARK-GOAL` §7** already nails the three big traps (judge-leniency, apples-to-oranges baselines, error-hiding). This recon **confirms and reinforces** that doctrine — nothing there needs changing; the new addition is the **arm-A "Opus with the stack" baseline** (§4) as the explicit fairness move.

---

## 7. Gaps / things I could NOT verify (flag for the skeptic)

- **VentureBeat HF test-time-scaling article (P2) returned HTTP 403** — the Llama-1B/3B↔8B/70B specifics are from the search snippet + corroborated by Snell (P1), not a direct read. Verify exact model pairs before citing as primary.
- **The "thinking longer not larger" 32B=46% number (P3)** is from the abstract via search; I could not fully read the PDF (binary). The "surpasses DeepSeek-R1 671B and o1" claim should be re-read in the paper body before publication.
- **HAL's exact scaffold-variance percentage** — I confirmed the qualitative findings (reasoning-effort backfire, contamination behavior, $40k/21,730 rollouts) but the abstract did not give a single "scaffold = X% of variance" number; the cleanest quantified scaffold-spread figure is the **secondary** codersera "30-point GAIA spread" (P7). Treat the 30pp as illustrative, not a primary statistic.
- **τ²-bench / leaderboard numbers (P12, §3 table)** are from leaderboard aggregators (benchlm, codersera, morphllm, getmaxim, vals) dated mid-2026, **not** from first-party model cards. Cross-comparison across these aggregators is itself noisy (different harnesses/dates) — exactly the HAL warning. Use first-party model cards for any published number; treat my table as a landscape sketch.
- **"Opus 4.8 raw" has no clean public number with tools OFF** — vendor SWE-bench numbers are *with* Anthropic's scaffold. So "raw Opus" is partly a strawman *because the public number already includes a scaffold*; another reason arm A/E (Opus-with-tools) is the honest comparator (§4).
- I did **not** independently verify any Qwen3.6 / Opus-4.8 score by running it; all are reported figures subject to the contamination/scaffold caveats throughout.

---

## 8. Sources (URLs + the specific number used)

- Snell et al. 2024 — arXiv:2408.03314 — "outperform a 14× larger model" on non-trivial-success problems; "critically varies by prompt difficulty."
- *Thinking Longer, Not Larger* — arXiv:2503.23803 — 32B open model, 46% SWE-bench Verified, "surpassing significantly larger models" (DeepSeek-R1 671B, o1).
- DeepSWE — together.ai/blog/deepswe — Qwen3-32B, 42.2% Pass@1 / 59% w/ TTS (K=16 + verifier); no closed-frontier parity claim.
- Live-SWE-agent — agentmarketcap.ai/blog/2026/04/11/… — Opus 4.5 + OSS scaffold 79.2%, −1.7pp vs Anthropic internal scaffold (80.9%); "scaffold quality, not model capability alone."
- HAL — arXiv:2510.11977 — 21,730 rollouts / 9 models / 9 benchmarks / ~$40k; "higher reasoning effort reducing accuracy in the majority of runs"; agents "searching for the benchmark on HuggingFace."
- May-2026 leaderboard — codersera.com/blog/ai-agent-benchmarks-state-of-leaderboard-may-2026 — "30-point spread between HAL-scaffolded Sonnet 4.5 (74.6% GAIA) and bare GPT-5 Mini (44.8%)"; Opus 4.8 88.6% SWE-bench Verified (flags it contaminated → use SWE-bench Pro).
- Hindsight — arXiv:2512.12818 + github.com/vectorize-io/hindsight-benchmarks/README — OSS-20B 83.18 / OSS-120B 85.67 / Gemini-3 89.61 LoCoMo; OSS-20B 39%→83.6% LongMemEval, ">full-context GPT-4o 60.2%"; **GPT-OSS-120B self-judge, LoCoMo N=50, no ablation.**
- Mastra OM — mastra.ai/research/observational-memory — LongMemEval GPT-4o 84.23% / GPT-5-mini 94.87%; "architecture scales with model quality"; +10.64pp from model alone; single-session 30 Q "one flip = 3.3pp."
- Ensue — ensue.dev/blog/beating-memory-benchmarks — 88.2% open / 93.2% GPT-5-mini LongMemEval; "5-point gap is what the better model adds."
- Penfield Labs LoCoMo audit — penfieldlabs.substack.com / dev.to — 6.4% answer key wrong (99/1540); judge accepts 62.81% of wrong-but-topical answers; full-context beats memory; 16-26k-token convs; publisher disclosure checklist.
- Zep vs Mem0 — blog.getzep.com/lies-damn-lies-statistics-is-mem0-really-sota-in-agent-memory — weak baseline (full-context ~73% > Mem0 ~68%), mis-implemented competitor, "Category 5 unusable"; corrected Zep 75.14 ±0.17.
- Zep self-correction — github.com/getzep/zep-papers/issues/5 — Zep's own 84% LoCoMo → 58.44%.
- τ²-bench / model comparisons — sierra/benchlm.ai/benchmarks/tauBench, codersera, getmaxim.ai (Opus 4.7 vs Qwen 3.6), morphllm.com, vals.ai/benchmarks/swebench — SWE-bench Verified Opus 4.8 88.6 / Qwen3.6-35B-A3B 73.4 / Qwen3.6 Plus 78.8 / best-open 80.6; τ² Opus 4.5 77.9 vs Qwen3.6 Plus 76.8; getmaxim "gap largest on agentic (74.9 vs 61.6), narrows in bounded loops."
- DeepSeek reception — epoch.ai/gradient-updates/what-went-into-training-deepseek — capability ≈ o1; $5.6M cost claim contested; "20-50× cheaper."
- Fair-baseline principle — arXiv:2605.27898 (Unified Framework), arXiv:2507.21504 (Agent eval survey) — "expose closed-source baselines to the full interfaces of all tools"; "scaffold choices can substantially affect evaluation outcomes."
- SWE-bench scaffold/contamination — Epoch SWE-bench Verified page, SWE-bench Pro (arXiv:2509.16941), SWE-rebench (arXiv:2505.20411), Scale SEAL leaderboard — standardized-scaffold = only directly comparable numbers; GPT-5 23.1%→14.9% public→private (leakage signal).
</content>
</invoke>
