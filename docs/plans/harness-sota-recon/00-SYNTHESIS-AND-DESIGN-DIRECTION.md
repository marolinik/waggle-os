# Harness-SOTA Benchmark — Synthesis & Design Direction

**Date:** 2026-06-16
**Status:** PRE-DESIGN synthesis (brainstorming step: explore → propose → decide → write spec). No code yet.
**Inputs:** 12 recon agents (`docs/plans/harness-sota-recon/*.md`): harness anatomy (r1), prior GAIA2 results (r2),
ablation-harness audit (r3), model/cost (r4), memory-toggle+rigor (r5), w4 memory-test (r6), hive-mind substrate (r7),
proprietary roster (r8); external: substrate landscape (e1), scaffold-attribution (e2), democratization prior-art (e3),
equivalence/stats (e4).

**Goal (founder):** A clear, *publishable* benchmark proving (H1) Waggle harness > raw model; (H2) harness + Hive
memory > harness; (H3) a small local OSS model (**Qwen3.6-35B-A3B**) + harness + memory ≈ / Pareto-beats premium
frontier (**Opus 4.8**, **GPT-5.5**, **Gemini 3.5**) — a memory-SOTA-grade claim for the harness.

---

## 0. THE RE-BASELINE — read this first (it changes the whole design)

Two findings from recon reframe the problem and must drive every decision below.

### 0.1 The naïve version of the hypothesis was ALREADY TESTED — and it FAILED (r2)
On GAIA 2 *search* split, the prior Pillar-1 arc measured, well-powered (N=156, trio-strict):
- Waggle harness + **Qwen3.6-35B-A3B** = **67.9%**
- Waggle harness + **Sonnet 4.6** = **84.6%**  ·  Hermes + Sonnet = **87.2%**
- Gap = **−19.3pp**, and **three harness levers (gates / persona / output-shape) did NOT close it** (the +10.5pp
  "win" was a prefix-sampling false positive that vanished at scale → −3.2pp).

**BUT** the two legs that could close it were never on that substrate:
- **No "raw / no-harness" arm ever existed** (so H1 is *unmeasured*, not proven).
- **Memory (Hive) was deliberately held OUT of every GAIA 2 cell** (so H2 is *unmeasured*) — the prior arc's own
  doctrine said "GAIA 2 measures the harness, not memory; keep lanes separate."

So the prior negative is **not** a refutation of the founder's *memory-inclusive* hypothesis. It is a warning that
on a **stateless, single-shot-able agentic task without memory, the gap is model-bound.**

### 0.2 r1 (harness anatomy) reached the SAME imperative independently
The harness's distinctive layers — memory write-back, skill distillation, correction-learning, sub-agents — are
**long-horizon**: they help *future / related* tasks, not the current turn. On single-turn QA they are pure cost.
On a stateless task like GAIA-search, **memory has nothing to bite on.**

### 0.3 The convergent design imperative (the whole ballgame)
> **The benchmark substrate must be one where BOTH the harness AND accumulated memory can actually contribute** —
> i.e. genuinely **agentic** (multi-step tool use, so planning/tools/self-correction beat single-shot) AND
> **memory-accumulating** (multi-session / repeated-domain / personalized, so Hive recall beats a cold model).

On the wrong substrate the hypothesis is unprovable (or already false). On the right substrate it is open — and the
prior art says a *scoped* version is achievable.

---

## 1. WHAT THE PRIOR ART SAYS ABOUT THE CLAIM (e3) — the publishability spine

The "small/open + scaffold + memory ≈ frontier" claim has **strong published precedent**, but **the unscoped version
gets torn apart every time** ("GPT-4 for $X" genre → contamination, cherry-picking, weak-baseline accusations).

**Three framings that survive peer scrutiny — adopt these:**
1. **Iso-model harness/memory lift** — "the *same model* is worth N points under our scaffold." Model held constant ⇒
   "the scaffold did it" is the point, not an objection. (Live-SWE-agent: scaffold within 1.7pp of vendor's own;
   HAL/May-2026: ~30pp GAIA spread from scaffold alone.)
2. **Memory-as-leveler with the residual gap honestly attributed to the model** — Ensue: "the 5-pt gap is what the
   better model adds; 88% is what our architecture delivers." Mastra: "architecture scales with model quality."
3. **Cost-controlled Pareto / sovereignty** — "within Δpp at 1/N the $, on your own hardware, zero egress." Concedes
   the frontier model *can* be better while showing it isn't *worth it* at the margin.

**The kill-shot to pre-empt (the baseline-fairness objection):**
> "Your harness+memory would also lift Opus. You compared Qwen+full-stack vs Opus-raw. Give Opus the same stack and
> the gap reopens. You handicapped the baseline."

Memory is **model-agnostic and amplifies with model quality** (3 independent sources confirm). Therefore we MUST run
**Opus WITH the full stack (arm A)** and publish it. The honest residual `A − B` is our credibility.

**The 5-arm baseline matrix (e3 + r8 independently converged) — publish ALL rows:**
| Arm | System | Isolates |
|---|---|---|
| **A** | Opus 4.8 + our harness + our memory | the ceiling-with-everything (the *fair* premium baseline) |
| **B** | **Qwen3.6 + our harness + our memory** | **our headline system (protagonist)** |
| **C** | Opus 4.8 raw (no tools, no memory) | model-only ceiling; shows the stack isn't free even for Opus |
| **D** | Qwen3.6 raw (no tools, no memory) | model-only floor; the lift our stack gives the open model |
| **E** | Opus 4.8 in its *own* native agentic mode (first-party tools + extended thinking) | the *commercial* baseline a buyer actually compares against |

**Headline claim shape (bounded, defensible):**
> "B reaches within **Δpp** of A (TOST-equivalent at ±5pp), **exceeds C and D**, and is competitive with E, at **~1/N
> the cost** and **fully local with zero data egress**, on [bounded, contamination-controlled task class]."

**Do NOT** headline "B ≈ C" (Qwen+stack vs raw Opus) — that is the handicapped-baseline framing that gets torn apart.
**Do NOT** headline LoCoMo — it is publicly **audited as broken** (Penfield: 6.4% wrong answer key, judge accepts
62.8% of wrong-but-topical answers; Zep teardown; Zep's own 84%→58.44% self-correction). Use it only as a secondary
cell with caveats cited in-text.

---

## 2. RECOMMENDED SUBSTRATE (e1) — where the claim is cheap AND credible

Ranked for: (a) scaffold is a free variable independent of model, (b) cheap at #models×#conditions×N≥150,
(c) contamination-controlled, (d) recognized by skeptics, (e) local OSS arm honest.

| Rank | Benchmark | Why it fits | Cost (N≥150) | Local OSS? |
|---|---|---|---|---|
| **#1** | **τ²-bench (Sierra)** | Leaderboard *explicitly tags* "standard"(raw) vs "custom"(scaffold) at identical `--agent-llm`. Native metric **`pass^k`** measures *reliability* — exactly what a harness fixes. LiteLLM ⇒ any local model. **No Docker.** | low-mid | **Yes** |
| **#2** | **AppWorld (test-challenge)** | Real held-out split (unseen apps), state-based unit tests, runs in-process, vLLM self-host. Coding-agent ⇒ scaffold-sensitive. | low-mid | **Yes** |
| **#3** | **SWE-bench Verified** (slice) | Most-recognized; same-model-multiple-scaffolds is already a published norm. Include a small N≈100 "credibility arm." Prefer **SWE-bench Pro-private / SWE-rebench** for the contamination story. | $$ high | expensive |
| **#4** | **GAIA2 / ARE** | Ambiguity+Adaptability splits are the *best possible* harness showcase, BUT the repo's own arc HALTED at $4.09/inv + SIGALRM. Use only as a secondary showcase if ARE is already paid for. | $$$ | partial |

**Avoid as primary:** WebArena/OSWorld/BrowseComp (heavy/flaky/browser/VM); ToolBench/AgentBench (training corpus /
diagnostic, contaminated).

**The memory dimension** (the part τ²/SWE don't natively give us): memory needs an *accumulating* substrate. Options:
- **Memory track on LongMemEval (500 Q) + BEAM (≤10M-token, unsaturated)** — purpose-built so structured memory beats
  long-context; this is where H2/H3-with-memory land cleanest, and where we already have evidence
  (`hive-mind/benchmarks/locomo`: **Qwen 73.4% ≈ Opus 73.1% on identical substrate** — the substrate≫subject thesis).
- **Multi-session agentic protocol** — run *related* τ²/AppWorld tasks in sequence so the harness's write-back +
  skill-distillation + recall accumulate across tasks (memory's lift becomes measurable on an agentic substrate).
  Higher-effort, but it is the *only* way to show memory lifting the *harness* claim (not just a QA claim).

---

## 3. WHAT WE REUSE (founder steer: "use the old benchmarks in light of the new goal")

The existing infra is **publication-grade plumbing** — reuse it; the novel work is new *cells* + *equivalence stats* +
possibly a new *task adapter*.

**Reuse verbatim (task-agnostic, already built — `benchmarks/harness/`):**
- Per-row JSONL + `turnId` correlation, seed reproducibility, `--budget` hard cap, single-runner lock, pre-cell
  health check, consecutive-failure streak halt, fetch-retry.
- **Pre-registration system** (`src/preregistration.ts`): manifest-hash anchor, per-row pinning surfaces, sanitized
  argv. This is the single biggest rigor asset.
- **Judge ensemble** (`src/judge-runner.ts`): trio cross-vendor + 4th-vendor tie-break + PM-escalation (skip, never
  coin-flip).
- **Stats** (`src/stats/`): Wilson CI, **cluster-bootstrap** (conv-level, 10k iters, seed 42), Fleiss κ.
- **Model registry** (`config/models.json`) — Qwen + Opus first-class; add `claude-opus-4-8`, `gpt-5.5`, gemini,
  gpt-oss-120b, DeepSeek (§5).
- The **`agentic` cell pattern** (`runAgentLoop` + swappable subject + tools) and the **`retrieval`/`no-context`
  memory toggle** are the templates for the new cells.

**Build new:**
- **`src/stats/equivalence-tost.ts`** — paired cluster-bootstrap difference CI + TOST decision (r3 gave the exact
  minimal-surface signature). **The harness has NO inferential test today** (the memory claim's z/Fisher were
  external scripts) — this is required for the equivalence (H3) claim.
- A **harness-layer ablation namespace** (do NOT reuse the locked `raw/filtered/compressed/full-context` labels —
  they're memory-substrate cells with publication-locked semantics and the `raw` cell *leaks oracle context*).
- If agentic substrate: a **τ²-bench (and/or AppWorld) adapter** + a **task-completion success oracle** (not the
  current substring scorer).

**Do NOT reuse:** the LoCoMo `.mjs` System-B pipeline as headline (memory-recall-specific, single-judge self-judge,
LoCoMo audited-broken); the `filtered`/`full-context` cells (oracle leak); the GAIA2 narrow-proxy adapter (abandoned,
$4.09/inv).

**Substrate source-of-truth:** main's `packages/hive-mind-core` (founder-ratified; has the agent harness +
PromptAssembler; at parity with the OSS mirror). Reuse `hive-mind/benchmarks/locomo/*.mjs` runners only as a template.

---

## 4. THE HARNESS, PRECISELY DEFINED (r1) — the independent variable & ablation ladder

"The harness" = everything `runAgentLoop` + `Orchestrator` add over one raw `model.complete()` call. Capability layers
(can raise quality) vs governance/cost layers (hold constant). The clean, buildable ablation ladder:

| Rung | Name | = prior + … | Exists? |
|---|---|---|---|
| 0 | **bare model** | `no-context`: 1 call, output-format persona only (**NOT `raw`** — `raw` leaks oracle ctx) | ✅ |
| 1 | + behavioral spec | full BEHAVIORAL_SPEC system prompt | new |
| 2 | + memory recall | `recallMemory` block, no tools | ✅ `retrieval` |
| 3 | + prompt assembler | tier-adaptive packaging (`WAGGLE_PROMPT_ASSEMBLER`) | new |
| 4 | tools-only | model decides when to call tools (`agentic`) | ✅ |
| 5 | + full toolset | full Waggle tool pool | new |
| 6 | + self-correction | D3 verification gate (`verificationGate:true`) | new |
| 7 | + closed loop | D1 skill distillation (`skillDistillationGate:true`) | new |
| 8 | + sub-agents/workflow | SubagentOrchestrator / WorkflowHarness | new |
| Full | production harness | all + governance (chat.ts — not cleanly ablatable; disclose as approximation) | ⚠️ |

**Must-pin confounds:** Layer 22 **model pilot** (budget/smart-route/fallback silently swaps the model mid-run — hard-
pin a single model, disable routing); decoding params (temperature/max_tokens/thinking) identical across rungs; GEPA
(L9) + context-compression (L10) make *extra non-subject* LLM calls — disable or account separately.
**Single-turn caveat:** rungs 7/17/18 (distillation, write-back, correction-learning) only pay off multi-turn/multi-
session — exclude on single-turn or use a multi-session protocol and say so.

---

## 5. MODELS & COST (r4, r8) — feasibility gate

**Subject (Step 1):** `Qwen3.6-35B-A3B` (35B total / **3B active** MoE, Apache-2.0; 262K→1M ctx). **Publish "35B-A3B
(3B active)", never "27B"** — the config says 35B-A3B; a "27B" in copy vs "35B-A3B" in config is an instant credibility
hit. The honest small-model story is "**3B active params — the compute footprint of a ~3B dense model.**" Pin the
**DashScope-direct or local-vLLM** alias — the `-via-openrouter` alias **silently serves Qwen 3.5** (a real foot-gun).

**Frontier baselines (Step 1):** `claude-opus-4-8` ✓ ($5/$25, 1M ctx, adaptive-thinking-only) · `gpt-5.5` ✓
($5/$0.50cached/$30) · **Gemini 3.5 Pro — preview/unverified id** (`gemini-3.5-pro-preview`, not on OpenRouter) → fall
back to `gemini-3.1-pro` until a stable GA id exists. None of the three is in `litellm-config.yaml` yet — add routes +
`models.json` entries (4-step change in r4 §2).

**Step-2 OSS (strengthen later):** add `gpt-oss-120b` (Apache) + `DeepSeek V3.x` (MIT) for lineage/size diversity;
`gpt-oss-20b` as the "runs on a laptop" floor. Llama (community license) / Kimi (modified-MIT) → footnote, not "open
source."

**Cost model (from the repo's OWN measured anchors — gold):**
- Memory/QA tracks are **cheap**: a full LongMemEval 500-Q × 3-cell Qwen pass = **$2.29**.
- The cost drivers are (1) the **Opus cell on an agentic track** (~$1/scenario × 320 ≈ $320 — dominates everything)
  and (2) any full-128K-context cell on Opus.
- **Cheapest credible design:** OSS arms local/cheap (~$0 agent-side); Opus only where the claim needs it (the
  memory-track ceiling, ~$35); cap Opus-agentic N or split.

| Scope | Est. cost |
|---|---|
| Memory tracks (LongMemEval+BEAM), 3 OSS + Opus + judge | **~$55** |
| + Agentic track (τ²/AppWorld) OSS-local + capped Opus | **~$120–180** |
| + GAIA2 with Opus on full agentic grid (avoid) | ~$505 |

---

## 6. STATISTICAL DESIGN (e4) — the rigor that makes it publishable

- **H1 (harness > raw), H2 (+memory > harness): superiority** — paired (same tasks/seed), cluster-bootstrap CI,
  one-sided test / McNemar on paired binary. Detectable at **N≈60–150**.
- **H3 (small ≈ premium): EQUIVALENCE — TOST, not a non-significant difference test.** Declare equivalence iff the
  **90% CI** of the paired difference lies entirely within **[−δ, +δ]**. **Pre-register δ = ±5pp primary, ±3pp
  secondary**, justified by decision-relevance ("the gap at which a buyer would pay for / switch to premium"). Binding
  N: **~200–400** paired for ±5pp, ~600–1000 for ±3pp. This is the sample-size driver.
- **Judge:** Panel-of-LLM-judges (PoLL), **3 disjoint vendors** (Opus 4.x + GPT-5.x + Gemini 3.x), **never let the
  subject's own family judge its outputs** (self-preference bias). Report **majority AND trio-strict (AND-of-3)**;
  lead with trio-strict. Report **Fleiss κ** (gate ≥0.65) + judge-vs-human Cohen κ on a 50–100-item spot-check.
- **Multiplicity:** Holm for the confirmatory family (the few headline tests); Benjamini–Hochberg for the exploratory
  grid. Pre-register which is which.
- **Small-N:** below a few hundred, use Wilson/Bayesian, not CLT error bars.
- **Pre-register on OSF + freeze analysis script at a SHA + decontamination check.** Report N (questions AND clusters),
  margin, 90% CI, both TOST p-values, and the verbatim conclusion sentence. Report **$/task alongside accuracy**
  (the Pareto axis) — and the **test-time-compute tax** (pass@1 AND any best-of-N multiplier).

---

## 7. VALIDITY / LEAKAGE FIREWALL (r5) — assert as ex-ante invariants
1. Memory built from legitimately-available context only — **never gold answers/QA metadata** (assert no gold substring
   in any frame).
2. "Memory-on" = real `HybridSearch` recall (`retrieval`/`agentic`), **never** oracle-context cells.
3. Scope is task/conversation-local and **agent-non-overridable**; spot-audit 0 cross-scope hits.
4. Retrieval at inference over the ingested corpus, production `HybridSearch` path; local embedder; T=0; fixed seed;
   injection-scan recalled memory.
5. Pre-register the exact "memory-on" definition (cell, K, lanes, kill-switch states) + freeze code SHA.

---

## 8. OPEN DECISIONS (founder's call — see chat)
- **D1 — Claim positioning:** bounded augmentation-parity + sovereign-Pareto (recommended, survives review) vs literal
  "small beats frontier" (risks the torn-apart genre).
- **D2 — Substrate & scope:** memory-track-first (cheap/fast, reuses v8 nearly as-is) vs agentic-track (τ²/AppWorld,
  where the *harness* claim is strongest) vs both/phased.
- **D3 — Budget ceiling & timeline** (gates how much of the matrix runs and whether Opus rides the agentic grid).

## 9. TOP REVIEWER-KILL RISKS (own them up front)
Handicapped baseline (→ run arm A); LoCoMo-as-headline (→ don't); self-judge (→ exclude subject family); non-stratified
prefix sampling (already burned the team once → stratify); single split (→ ≥2); "it's just more compute" (→ iso-token /
Pareto / pass^k); equivalence-via-non-significance (→ TOST + pre-registered δ); contamination (→ held-out/private
split); model-pilot silently swapping models (→ pin); Qwen-3.5-via-OpenRouter regress (→ pin DashScope/local).
