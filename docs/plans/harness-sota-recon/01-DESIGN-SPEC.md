# Waggle Harness-SOTA Benchmark — Design Specification

**Date:** 2026-06-16 · **Status:** DESIGN SPEC (awaiting founder review → then implementation plan)
**Supersedes** the open-decisions section of `00-SYNTHESIS-AND-DESIGN-DIRECTION.md`. Research basis: 12 recon agents
(`docs/plans/harness-sota-recon/*.md`). Founder-ratified decisions baked in (2026-06-16): agentic tasks; Opus also runs
inside the Waggle harness (apples-to-apples); headline = convergence ("Qwen 35B ≈ Opus 4.8 inside our harness+memory");
**both substrates** (τ²-bench model-axis + GAIA2 harness-arena); **competitors in Phase 2**; **open budget**.

---

## 1. Objective & Hypotheses

Prove, to a publishable standard, that **the Waggle agent harness + Hive memory is the dominant source of agentic
capability variance — to the point that a small local open model under the full stack matches a premium frontier
model under the same stack.** Four hypotheses, two axes.

**Model axis (hold harness = Waggle+memory; vary the model):**
- **H1 — Harness lift (superiority).** For a fixed model M, `Waggle-harness(M) > raw(M)`. One-sided, paired.
- **H2 — Memory lift (superiority).** `Waggle-harness+memory(M) > Waggle-harness(M)`. One-sided, paired.
- **H3 — Convergence (THE headline; v2 = efficiency/reliability-led).** Primary: inside Waggle+memory, the small open
  model matches the frontier on **cost ($/tokens/turns at non-inferior accuracy) and reliability (pass^k)** — robust to
  saturation + leakage. Secondary (only on **divergent, non-saturated** cells with powered N, else a descriptive
  paired-CI): `Waggle+memory(Qwen) ≈ Waggle+memory(Opus)` **TOST-equivalent at ±5pp**. Also report GPT-5.5 / Gemini 3.x.
  Supporting row: the open model **exceeds every frontier model in its raw config** (`B > C`). See `03` A1/A2.

**Harness axis (hold the model; vary the harness) — Phase 2:**
- **H4 — Competitive harness lift (iso-model).** For a fixed model M, `Waggle-harness+memory(M) > {Claude Code,
  Hermes, OpenClaw}(M)`. Same model, same tasks, same judge — only the harness changes.

**Non-goals (explicit, to pre-empt scope creep & reviewer attacks):**
- NOT "small model beats frontier model *raw*" as the headline (the torn-apart genre — we report `B>C` only as a
  supporting row, never the lead).
- NOT a LoCoMo headline (publicly audited-broken; secondary cell only, with caveats).
- NOT a memory-QA claim dressed as a harness claim (the harness claim runs on *agentic* tasks).

---

## 2. Claim Shape (what we will and will not say)

> **v2 (post red-team, 2026-06-16):** authoritative deltas in [`03-REDTEAM-RESOLUTIONS.md`](./03-REDTEAM-RESOLUTIONS.md).
> The accuracy-equivalence-led headline below was **demoted** — τ²-bench is saturated (Qwen≈Opus *raw*, ~1pp), so an
> accuracy-parity claim there is "equivalence-by-ceiling." The v2 headline **leads with efficiency + pass^k reliability**
> (saturation- AND leakage-immune) and runs accuracy-equivalence ONLY on **divergent, non-saturated** cells.

**Headline (v2 — efficiency/reliability-led, accuracy-equivalence secondary):**
> "On agentic task distributions where the raw open model and the raw frontier model **measurably diverge**, the Waggle
> harness + Hive memory **closes the gap** — equal-or-better task success at **materially lower cost and higher
> reliability (pass^k)**, fully local + zero-egress + auditable. Where headroom exists, the small local model
> (**Qwen3.6-35B-A3B, 3B active**) reaches **TOST-equivalence (±5pp, 90% CI)** with **Opus 4.8** inside the harness;
> everywhere, it does so **cheaper and more reliably**. The harness+memory, not the model, dominates the outcome."

**Superseded v1 headline (kept for the record):**
> ~~"Inside Waggle's harness+memory, Qwen3.6-35B-A3B is statistically equivalent (TOST ±5pp) to Opus 4.8 on agentic
> tasks, at ~1/N cost, local, zero-egress, auditable."~~ — accuracy-led; defeated by τ² saturation (see v2 above).

Supporting, all from the same matrix/judge/denominator:
- `Waggle-harness(M) > raw(M)` (H1) and `+memory > harness` (H2), per model, with effect sizes + CIs.
- `Qwen+stack > {Opus, GPT-5.5, Gemini} raw` (`B>C`) — the open model beats frontier *raw* (a real, defensible row).
- Phase 2: `Waggle+memory > {Claude Code, Hermes, OpenClaw}` at a fixed model (H4).

**The fairness spine (defeats the "you handicapped the baseline" kill-shot):** every model is reported in BOTH its raw
config AND inside the full Waggle stack. The honest residual `A − B` (Opus-in-stack minus Qwen-in-stack) is the
credibility, not a weakness. We are the ones who run Opus-with-everything.

---

## 3. The Experimental Matrix

### 3.1 Model-axis arms (Phase 1) — per substrate, per task set
| Arm | Subject model | Harness | Memory | Role |
|---|---|---|---|---|
| **A** | Opus 4.8 | Waggle | ON | ceiling-with-everything (fair premium baseline) |
| **B** | **Qwen3.6-35B-A3B** | Waggle | ON | **protagonist** |
| **C** | Opus 4.8 | raw (1-shot / minimal loop, same tools? NO) | OFF | model-only ceiling |
| **D** | Qwen3.6-35B-A3B | raw | OFF | model-only floor |
| **E** | Opus 4.8 | Opus's *own* native agentic mode (first-party tools + extended thinking) | n/a | commercial baseline |
| **B′,A′** | GPT-5.5, Gemini 3.x | Waggle | ON | additional frontier ceilings for H3 |

Step-2 (later): repeat B for `gpt-oss-120b`, `DeepSeek V3.x`, `gpt-oss-20b` to show the convergence holds across OSS
lineages/sizes (the "substrate ≫ subject" generalization).

### 3.2 Ablation ladder (the H1/H2 internal proof) — fixed model, capability layers added one at a time
`bare (no-context) → +behavioral-spec → +memory recall → +prompt-assembler → tools-only → +full toolset →
+self-correction (D3) → +closed-loop (D1) → +sub-agents → FULL`. (Detail + toggles: `harness-layer-map.md` §4.)
Run the full ladder for **both** Qwen and Opus so H1/H2 are shown per model and the *shape* of the lift is comparable.

### 3.3 Harness-axis arms (Phase 2) — fixed model (start: Qwen, then Opus), vary the harness
`Waggle+memory · Claude Code · Hermes · OpenClaw · raw`. Same tasks, same judge, same model. Hermes has an existing
ARE adapter (head start); Claude Code + OpenClaw need adapters.

---

## 4. Substrates

Two substrates → cross-substrate robustness (a single-substrate claim is fragile to "you cherry-picked the bench").

### 4.1 τ²-bench (Sierra) — PRIMARY, model-axis headline
- **Why:** native `pass^k` (reliability — the deepest thing a harness fixes); leaderboard formalizes raw-vs-scaffold
  (`--agent-llm` standard vs custom); LiteLLM → any local model; **no Docker**; low cost; dynamic user-sim ⇒ low
  contamination. (`harness-benchmark-substrate-recon` #1.)
- **Domains:** retail + airline + telecom (telecom may be saturated ~99% — verify; drop if non-discriminative).
- **Confound to pin:** the **user-simulator model** must be IDENTICAL across all arms (it's an LLM) — pin + record it.
- **License:** UNVERIFIED in recon — confirm `sierra-research/tau2-bench` license before any redistribution.

### 4.2 GAIA2 / Meta ARE — SECONDARY (model-axis robustness in Phase 1) + harness-arena home (Phase 2)
- **Why:** richest agentic env; Ambiguity/Adaptability splits reward exactly what a harness does (clarify, re-plan,
  abstain); Hermes harness already wired (the Phase-2 arena head start). CC-BY-4.0.
- **Cost reality:** ARE-native (Docker) path is ~$0.03–0.05/scenario for Qwen, **~$1/scenario for Opus** — open budget
  covers it. The abandoned **narrow-proxy** adapter ($4.09/inv) is NOT used; ARE-native only.
- **Must build:** wire Hive memory into the ARE worker (currently not connected) for arms A/B.
- **Splits:** use ≥2 (e.g. search + adaptability) so the claim isn't single-split. Stratify; do NOT prefix-sample
  (non-stratified `limit=N` already produced one false positive in the prior arc).

### 4.3 The MEMORY protocol on agentic tasks (the crux — how Hive memory bites)
> **Full design: [`02-CONTINUAL-MEMORY-PROTOCOL.md`](./02-CONTINUAL-MEMORY-PROTOCOL.md)** (Phase-A experience stream →
> frozen Phase-B held-out test; shared-frozen-mind for the H3 convergence isolation; four transfer mechanisms;
> leakage firewall; answer-caching defense). Summary:

Agentic tasks are stateless per task; memory only contributes with **accumulation**. Design = a **continual / multi-
session protocol**:
- The agent faces a **stream of related tasks** in a domain. With memory ON (arms A/B), after each task the harness
  does write-back + skill distillation + correction capture; later tasks **recall prior solutions/skills/facts**.
  With memory OFF (arms C/D), every task is cold.
- **Primary memory metrics:** (i) pass^k uplift on later-in-stream tasks (memory-on vs memory-off); (ii) **tokens &
  turns per task** (memory should make the agent *more efficient*, not just more accurate); (iii) skill-reuse rate.
- This is the honest home for H2 on agentic tasks and matches a REAL product use case (an agent that gets better at
  your workflows over time). It also exercises the long-horizon layers (D1/write-back/correction) that single-turn
  benchmarks render inert (`harness-layer-map.md` §4 note).
- **Supporting (not headline):** LongMemEval (500 Q) + BEAM as a memory-substrate *transfer* cell — shows the memory
  moat independently; cite LoCoMo only with the Penfield caveats.

---

## 5. Models (exact identities, routing, pinning)

| Role | Model | API id | Route / pinning | Price (in/out $/M) |
|---|---|---|---|---|
| Subject (Step 1) | **Qwen3.6-35B-A3B** (35B/3B-active MoE, Apache-2.0) | `qwen3.6-35b-a3b` | **DashScope-direct or local vLLM** (NEVER `-via-openrouter` → silently 3.5); `floating_alias` | 0.20 / 0.80 |
| Frontier | **Claude Opus 4.8** | `claude-opus-4-8` | add Anthropic route; `anthropic_immutable` | 5 / 25 |
| Frontier | **GPT-5.5** | `gpt-5.5` (snap `gpt-5.5-2026-04-23`) | add OpenAI/OpenRouter route | 5 / 30 (0.50 cached) |
| Frontier | **Gemini 3.x Pro** | `gemini-3.5-pro-preview` (UNVERIFIED) → fallback `gemini-3.1-pro` | Vertex; not on OpenRouter | ~2–4 / 12–18 |
| Step-2 OSS | gpt-oss-120b (Apache), DeepSeek V3.x (MIT), gpt-oss-20b (laptop floor) | — | OpenRouter/local | cheap/free |

**Publish "35B-A3B (3B active)", never "27B"** (config says 35B-A3B; mismatch = instant credibility hit). Add the 3
frontier models to `litellm-config.yaml` + `benchmarks/harness/config/models.json` (4-step change, `model-roster...md`
§2; pinning-surface test contract is strict). Smoke each alias before spend. **Pin the exact subject checkpoint per
row** — Qwen aliases are floating (no immutable snapshot) → record DashScope-date/local-vLLM in the manifest.

---

## 6. Metrics
- **Accuracy:** task-completion oracle (state-based where the substrate provides it: τ² DB-state, GAIA2 oracle events,
  AppWorld unit tests) — NOT the current substring scorer. LLM-judge with a task-completion rubric where no
  programmatic oracle exists.
- **Reliability:** **pass^k** (τ² native; pre-register k and #trials) — the harness's deepest claim.
- **Efficiency (the Pareto axes):** **$/task**, **tokens/task**, **turns/task**, wall-clock. Report alongside every
  accuracy number. The cost-controlled Pareto frontier is a primary deliverable, not an afterthought.
- **Memory-specific:** in-stream improvement curve, skill-reuse rate (memory protocol §4.3).
- **Test-time-compute tax:** if any arm uses best-of-N / verifier search, report pass@1 AND the multiplier AND $.

---

## 7. Statistics (the publishability core)

- **H1/H2 (superiority):** paired (same tasks+seed across arms), **cluster-bootstrap** CI (resample whole
  conversations/scenarios; reuse `src/stats/cluster-bootstrap.ts`), one-sided test; **McNemar** (mid-p) on paired
  binary pass/fail. Detectable at N≈60–150.
- **H3 (equivalence — THE binding constraint):** **TOST** — declare equivalence iff the **90% CI** of the paired
  difference `(Opus − Qwen)` lies entirely within **[−δ, +δ]**. **Pre-register δ = ±5pp primary, ±3pp secondary**,
  justified by decision-relevance (the accuracy gap at which a buyer would pay for premium). **Binding N ≈ 200–400
  paired** for ±5pp (≈600–1000 for ±3pp) → plan the matrix at this N, not the superiority N.
- **Build new:** `src/stats/equivalence-tost.ts` — `computePairedDiffClusterBootstrapCI({rowsA, rowsB,
  conversation_id, n_bootstrap, seed, confidence=0.90})` + `tostEquivalence({diffCI, margin})`; plumb the
  pre-registered `margin`+`confidence` into the manifest. (Signature: `harness-capability-audit.md` §3.3. The harness
  has NO inferential test today — required.)
- **Multiplicity:** Holm for the confirmatory family (the ~3 headline tests); Benjamini–Hochberg for the exploratory
  grid. Pre-register the split.
- **Small N:** below a few hundred clusters, report Wilson/Bayesian, not CLT error bars.

---

## 8. Judge (Panel-of-LLM-judges)
- **Roster:** 3 disjoint vendors — Opus 4.x + GPT-5.x + Gemini 3.x; **4th-vendor (Grok) tie-break** for 1-1-1;
  **PM-escalate (skip, never coin-flip)** for 1-1-1-1. (Reuse `src/judge-runner.ts`.)
- **Hard rule — no self-family judging:** the subject's own family must NOT (solely) judge its outputs (self-preference
  bias is perplexity-driven and real). When Opus is the subject, Opus is excluded/outvoted in the jury for that arm.
- **Report BOTH** majority AND **trio-strict (AND-of-3)**; **lead with trio-strict.**
- **κ:** Fleiss κ on the pre-tie-break matrix (gate: PASS ≥0.65, flag 0.60–0.65, HALT ≤0.60); **judge-vs-human Cohen κ
  on a 50–100-item dual-coded spot-check** (without a human anchor, "the jury agrees with itself" is circular).
- **Pairwise bias mitigations** if any pairwise judging: position-swap + length-control.

---

## 9. Pre-registration, leakage firewall & reproducibility
- **Pre-register on OSF + the repo manifest BEFORE the priced run:** hypotheses (incl. δ + confirmatory/exploratory
  split), substrate+split+N, the exact "memory-on" cell definition (cell, K, lanes, kill-switch states), model ids +
  pinning, judge roster + aggregation, SE method, multiplicity policy, stopping rules (no interim looks), post-hoc
  exclusion = NONE, **code frozen at a SHA**. (Reuse `src/preregistration.ts`; mirror `manifest-v*` discipline.)
- **Leakage firewall (assert as invariants, `memory-toggle-and-rigor-template.md` §A.3):** memory built from
  legitimately-available context only (never gold answers/oracle context); scope task-local + agent-non-overridable;
  retrieval at inference via production `HybridSearch`; local embedder; T=0; fixed seed; injection-scan recalled
  memory.
- **Decontamination:** prefer held-out/private/recent splits (AppWorld test-challenge, SWE-bench Pro-private,
  SWE-rebench, τ² dynamic user-sim); contamination probe for Qwen (training-cutoff vs bench-release).
- **Reproducibility:** release seeds, prompts, judge configs, raw `events.jsonl`, offline re-judge harness, aggregation
  code; report N (items AND clusters) per cell; **$/task per row**; ruler-validate each substrate (reproduce a known
  public number within tolerance before claiming a delta).

---

## 10. Phasing
- **Phase 0 — plumbing (no claims):** add the 3 frontier models + pinning; build `equivalence-tost.ts`; build the
  agentic task adapter(s) (τ² primary; ARE memory-wiring); build the task-completion success oracle; the continual-
  memory protocol; smoke each model alias. Pre-register Phase 1.
- **Phase 1 — THE BIGGEST WIN (model-axis, both substrates):** arms A–E + GPT-5.5/Gemini ceilings + full ablation
  ladder for Qwen & Opus, on τ² (primary) + GAIA2 (≥2 splits). Trio-judged, TOST for H3, Pareto + cost. **Deliverable:
  the "Qwen 35B ≈ Opus 4.8 inside Waggle+memory" paper-grade result.**
- **Phase 2 — competitive moat (harness-axis):** Waggle+memory vs Hermes (wired) → + Claude Code + OpenClaw adapters,
  fixed model. GAIA2 arena + sovereignty-triple (local/zero-egress/auditable) evidence harness.
- **Phase 3 — generalization:** step-2 OSS models (gpt-oss-120b, DeepSeek, gpt-oss-20b) → "substrate ≫ subject across
  lineages"; LongMemEval/BEAM memory-transfer cell.

---

## 11. Cost (open budget — estimates for planning, not caps)
Memory/QA tracks are ~$2–35; the drivers are Opus-on-agentic (~$1/scenario) and any full-context-on-Opus cell. With
open budget: model-axis on both substrates with Opus on the full agentic grid ≈ low-to-mid hundreds $; Phase 2 adds
competitor-harness runs. Keep the existing per-track `$` halt guards as safety rails even with no cap (they caught
overruns before). Run all OSS arms local/cheap.

---

## 12. Reuse map (founder steer: reuse old benchmarks in light of the new goal)
- **Reuse verbatim:** `benchmarks/harness/` plumbing (JSONL+turnId, seed, budget-cap, runner-lock, health-check,
  streak-halt), `src/preregistration.ts`, `src/judge-runner.ts` (ensemble+tie-break), `src/stats/*` (Wilson,
  cluster-bootstrap, Fleiss κ), `config/models.json` registry, the `agentic`/`retrieval`/`no-context` cell patterns.
- **Reuse the prior agentic arc:** the GAIA2 ARE-native runner + the wired **Hermes** adapter (Phase 2 head start);
  the `hive-mind/benchmarks/locomo` subject-decoupled-from-substrate skeleton as a template for arms.
- **Build new:** `equivalence-tost.ts`; a harness-layer ablation namespace (NOT the locked memory cell labels);
  τ²-bench adapter + task-completion oracle; ARE↔Hive-memory wiring; the continual-memory protocol; Claude
  Code/OpenClaw adapters (Phase 2).
- **Do NOT reuse:** the LoCoMo System-B `.mjs` pipeline as headline; the `filtered`/`full-context` oracle-leaking
  cells; the abandoned GAIA2 narrow-proxy adapter.
- **Substrate source-of-truth:** main `packages/hive-mind-core`.

---

## 13. Top reviewer-kill risks → mitigations (own them in the paper)
| Risk | Mitigation |
|---|---|
| "You handicapped the baseline" | Arm A (Opus in full stack) + arm E (Opus native) — published. |
| Equivalence via non-significant difference test | TOST + pre-registered δ. |
| Self-judge leniency | 3 disjoint-vendor jury; exclude subject family; human-κ spot-check. |
| LoCoMo-as-headline | Don't; agentic substrates headline; LoCoMo caveated-secondary only. |
| "It's just more compute" | iso-token / Pareto frontier / pass^k / report TTC multiplier. |
| Non-stratified prefix sampling (burned the team once) | stratified sampling; ≥2 splits; pre-registered. |
| Contamination | held-out/private/recent splits; contamination probe. |
| Model-pilot silently swapping models | hard-pin model; disable budget/smart-route/fallback. |
| Qwen-3.5 regress via OpenRouter | pin DashScope-direct / local-vLLM; record checkpoint per row. |
| User-sim confound (τ²) | pin identical user-sim model across all arms; record it. |
| Single substrate | τ² + GAIA2 (+ AppWorld/SWE optional credibility arm). |

---

## 14. Open items to confirm during Phase 0
- Exact Gemini 3.x GA id + benchmark-scale quota (preview/Vertex-gated today).
- τ²-bench license (redistribution).
- The continual-memory protocol's exact task-stream construction per substrate (how related tasks are sequenced).
- Whether to add an AppWorld test-challenge and/or SWE-bench-Pro-private credibility arm (cheap robustness vs effort).
- Equivalence margin δ final justification text for OSF.
