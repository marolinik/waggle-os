# Harness-Lifts-Model Benchmark Substrate Recon (2026-06-16)

**Author:** research agent (web recon)
**Date:** 2026-06-16
**Purpose:** Survey the 2026 landscape of agentic / tool-use / harness benchmarks and pick
the best substrate(s) to **cheaply and credibly prove that a harness (scaffold) lifts model
capability** — i.e. that the same model, under our scaffold, beats the same model raw.
**Audience:** a skeptical reviewer of a *publishable* benchmark design.

> **Scope note.** This is the **Pillar-1 (harness/orchestration) claim**, distinct from the
> Pillar-2 memory-substrate claim that the repo's `manifest-v8.*` preregistrations target
> (LongMemEval / BEAM / GAIA2-memory). The harness README at
> `benchmarks/harness/README.md` is a **memory** ablation grid (raw/filtered/compressed/
> full-context), not a tool-use harness grid. Nothing here conflicts with that work; this
> recon is about a *new* substrate for the orchestration claim. See "Relation to prior work".

---

## 0. TL;DR — Ranked shortlist

The claim "**harness lifts model capability**" requires a benchmark where (a) the **scaffold is
a free variable** independent of the model, (b) you can run `#models × #conditions × N≥150`
for **low $$**, (c) **contamination is controlled**, (d) the benchmark is **recognized** by
skeptics, and (e) it **runs locally** so OSS/local arms are honest.

| Rank | Benchmark | Why it wins for OUR claim | Cost to run N≥150 | Local OSS arm? |
|---|---|---|---|---|
| **#1** | **τ²-bench (Sierra)** | Purpose-built scaffold-vs-model separation: leaderboard *explicitly* tags "standard" (raw) vs "custom" (scaffold) submissions with identical `--agent-llm`. LiteLLM = any local model. `pass^k` measures the exact thing a harness fixes (reliability). No Docker. | ~$ low-mid (text dialogues, ~5-15 turns) | **Yes** (LiteLLM → vLLM/Ollama) |
| **#2** | **AppWorld (test-normal)** | Real held-out challenge split (Amazon/Gmail APIs unseen in train), state-based unit tests, runs in-process (no Docker needed), model-agnostic + vLLM self-host. Interactive coding agent = scaffold-sensitive. | ~$ low-mid | **Yes** (vLLM) |
| **#3** | **SWE-bench Verified** | Most-recognized agentic bench; leaderboards *already* carry the same model under multiple distinct scaffolds (Inspect-SWE / Claude Code / Codex / mini-SWE-agent) → scaffold delta is a published norm. Per-instance git-history stripped (contamination control). | $$ high (Docker per-repo, long rollouts) | Yes but **expensive** locally |
| **#4** | **GAIA2 / Meta ARE** | Newest (Sep 2025), CC-BY-4.0, oracle-event verification, capability splits (Ambiguity/Adaptability) that *reward* scaffold behavior. But: ARE simulator required, repo already has a halted GAIA2 arc ($4.09/invocation), and SIGALRM blocker. Use only if the ARE harness is already paid for. | $$$ high (repo's own data: 9-31× over estimate) | Partial (ARE supports arbitrary endpoints) |

**Bottom line:** **τ²-bench is the recommended primary substrate.** AppWorld is the
strongest #2 (cheap, held-out, local). SWE-bench Verified is the "credibility tax" arm to
include for a skeptical audience even though it is pricier. **Avoid** WebArena/VisualWebArena/
OSWorld/BrowseComp as *primary* substrates for a cost-bounded scaffold-delta study (reasons
below).

---

## 1. Why scaffold-vs-model separation is the whole ballgame

The central risk to our claim is that a reviewer says *"you just used a better model"* or
*"your delta is within run-to-run noise."* The literature in 2026 has converged on the fact
that **scaffold matters as much as the model** — which is simultaneously our thesis AND the
thing we must control for cleanly.

- **HAL (Holistic Agent Leaderboard, Princeton, arXiv 2510.11977, Oct 2025):** "AI agent
  evaluations" across **9 models × 9 benchmarks**, **21,730 agent rollouts**, **~$40,000**
  total, **2.5 billion tokens** logged. Built explicitly because "**scaffolds dramatically
  impact both accuracy and cost, yet comparisons across scaffolds are rare**" and "model
  accuracy varies by the benchmark and scaffold combination." Headline counter-intuitive
  finding: **"increased reasoning effort lowered accuracy in 21 of 36 tested settings."**
  (Source: https://arxiv.org/abs/2510.11977 ; https://www.emergentmind.com/topics/holistic-agent-leaderboard-hal)
  → **Implication for us:** HAL is the *citation* that legitimizes the question. It is NOT a
  benchmark to re-run (it's an aggregator). It proves "scaffold matters" is a recognized,
  publishable axis.

- **MarkTechPost "Top 7 benchmarks that matter for agentic reasoning" (Apr 2026):** "**Agent
  benchmark scores are highly scaffold-dependent — model, tool access, retry budget, and
  evaluator version all materially affect reported numbers.**" For WebArena specifically:
  "modular Planner-Executor-Memory architectures drove progress more than model improvements
  alone." For SWE-bench Verified: "scaffold, tool setup, and evaluator protocol heavily shape
  scores; not directly comparable across vendors."
  (Source: https://www.marktechpost.com/2026/04/26/top-7-benchmarks-that-actually-matter-for-agentic-reasoning-in-large-language-models/)

- **τ²-bench paper (arXiv 2506.07982):** "**scaffolding strategies materially impact
  performance**," with structured prompting yielding "substantially different results for
  identical models compared to baseline methods." `pass^k` reveals "consistency issues —
  models often fail to replicate correct solutions across multiple tries, indicating
  instability in reasoning rather than capability gaps." (Source: https://arxiv.org/pdf/2506.07982)
  → **This is our exact lever:** a good harness's job is to *fix reliability* (raise `pass^k`),
  not just raise `pass^1`. τ²-bench is the only mainstream bench whose **primary metric**
  directly rewards what a harness does.

**Design consequence:** the cleanest possible experiment is **hold the model fixed, vary only
the scaffold** (raw single-shot tool-call loop vs our orchestrator), on a bench whose
leaderboard *already normalizes* that comparison. τ²-bench's standard-vs-custom submission
taxonomy does exactly this.

---

## 2. Per-benchmark deep-dive (verified facts + citations)

### 2.1 τ-bench / τ²-bench (Sierra) — **#1 PICK**

| Field | Value | Source |
|---|---|---|
| Task class | Tool-Agent-User dialogue in service domains; agent must follow policy + use tools + guide a *simulated user* | README |
| Domains / N | τ¹: retail **115** + airline **50** (=165). τ²: adds telecom **114**. τ²-bench paper reports **540 total** (180 telecom / 180 retail / 180 airline) in the expanded set | https://github.com/sierra-research/tau2-bench ; https://arxiv.org/pdf/2506.07982 |
| Metric | **pass^k** (pass-hat-k): success consistency across *k* independent trials; also pass@1, policy adherence, DB-state match. Leaderboard reports Pass^1..Pass^4 + optional $/trajectory | leaderboard-submission.md |
| Public leaderboard w/ raw AND scaffolded | **YES — explicitly.** "Standard" submission = "a general-purpose LLM as the agent (not specifically trained), unchanged scaffold"; "Custom" = "any approach that differs… multi-model routers, modified prompts, additional tools, domain-specific training." Custom requires methodology docs. | leaderboard-submission.md |
| Scaffold-vs-model finding | "scaffolding strategies materially impact performance"; frontier models still <50% on τ¹ retail and `pass^8 <25%` (inconsistent) | https://arxiv.org/abs/2406.12045 ; https://arxiv.org/pdf/2506.07982 |
| Arbitrary / local models | **YES.** "Uses LiteLLM — any supported provider works." `--agent-llm` + `--user-llm` CLI flags. Local OSS via OpenAI-compatible endpoint (vLLM/Ollama) | README |
| User-simulator dependency | A separate LLM simulates the user (recommended `gpt-5.2` for fidelity). **This is a confound to pin** — see risks. | leaderboard-submission.md |
| Infra | `git clone` + `uv sync`. **No Docker.** Pure Python. | README |
| License | Not stated in README excerpt (**GAP — verify before publishing; the repo is `sierra-research/tau2-bench`**) | — |
| Contamination | τ² (Jun 2025) + telecom domain are recent; dialogues are dynamically generated per-run (user sim), so memorizing a static answer string is largely useless. Lower contamination than static QA. | inference from design |

**Fit for our 5 constraints:** (a) **cleanest separation in the field** — the leaderboard
taxonomy *is* "raw vs scaffold." (b) **cheap** — text dialogues, no browser/VM, ~5-15 turns;
540 tasks × few models × 2 conditions is well within a low-hundreds-of-dollars budget. (c)
**low contamination** — dynamic user sim, recent telecom split. (d) **highly recognized** —
Sierra is a flagship agent-eval brand; cited everywhere in 2026 roundups. (e) **local OSS arm
trivial** via LiteLLM. **This is the recommendation.**

### 2.2 AppWorld (Stony Brook, ACL'24 Best Resource) — **#2 PICK**

| Field | Value | Source |
|---|---|---|
| Task class | Interactive **coding** agent across 9 apps (Amazon, Spotify, Venmo, Gmail, Todoist, SimpleNote, Splitwise, FileSystem, Phone) via **457 APIs**, ~100 simulated users | README ; https://arxiv.org/abs/2407.18901 |
| N / splits | **750 tasks**: Train 105 / Dev 60 / Test-Normal 168 / **Test-Challenge 417** (Test-Challenge needs Amazon+Gmail APIs *absent* from train/dev/normal — true held-out) | search + README |
| Metric | **TGC** (Task Goal Completion) + **SGC** (Scenario Goal Completion); database-state unit tests that also check for *collateral damage* | README |
| Public leaderboard w/ raw AND scaffolded | YES — `StonyBrookNLP/appworld-leaderboard` lists ReAct / FullCodeRefl / etc. baselines (distinct scaffolds) per model | https://github.com/StonyBrookNLP/appworld-leaderboard |
| Arbitrary / local models | **YES.** Model-agnostic; `experiments/configs/_generator/models/`; **vLLM self-host** examples; 15+ orgs | README |
| Infra | Runs **locally in-process** (FastAPI TestClient, no server needed); Docker optional. **No browser, no VM.** | README |
| License | Apache-2.0 (code); protected `.bundle` (API docs/solutions/tests) Apache-2.0 + "redistribute only encrypted" | README |
| Contamination | Test-Challenge is structurally held-out (unseen apps); ground truth not in train/dev | README |

**Fit:** Cheap (in-process, no VM), genuinely held-out split, local OSS via vLLM,
state-based grading (robust to phrasing). The downside vs τ²: scaffold-vs-model is a *de facto*
norm (baselines differ) but NOT a *formalized leaderboard tag* like τ²'s standard/custom.
Strong complementary second substrate — and the "coding agent" framing diversifies the claim
beyond dialogue.

### 2.3 SWE-bench / SWE-bench Verified / SWE-bench Pro / Multimodal — **#3 (credibility arm)**

| Field | Value | Source |
|---|---|---|
| Task class | Resolve real GitHub issues; patch must pass hidden dev tests | OpenAI |
| N | Verified = **500** human-validated (Epoch runs 484 after their own filtering) across **12 Python repos**. Pro = **1,865** tasks / 41 repos / 4 langs (incl. 276 *private* commercial tasks). Multimodal = JS/visual front-end issues. | https://openai.com/index/introducing-swe-bench-verified/ ; https://labs.scale.com/leaderboard/swe_bench_pro_public ; https://epoch.ai/benchmarks/swe-bench-verified |
| Metric | **% Resolved** (≈ pass@1) | OpenAI |
| Public leaderboard w/ raw AND scaffolded | **YES, and this is its strength.** Epoch: "We also include results from other scaffolds, such as Claude Code or Codex"; Feb 2026 "added third-party scaffolds (Claude Code and Codex)." swebench.com has a "Bash Only" (mini-SWE-agent) lane. Same model appears under multiple scaffolds. | https://epoch.ai/benchmarks/swe-bench-verified |
| Verified curation | 93 developers reviewed; removed **68.3%** of original tasks (bad harnesses / vague / env deps). | search |
| Arbitrary / local models | Yes (OpenHands/SWE-agent/Agentless all model-agnostic) but coding agents need many long tool-calls → **expensive locally** | — |
| Infra | **Docker per repo/instance** (heavy); long multi-turn rollouts | — |
| Contamination | Verified ≠ contamination-free (public repos, pre-cutoff). **Epoch mitigates**: "remove all git history after that sample's original issue." **SWE-bench Pro private set (276 tasks)** is the real contamination control ("legally inaccessible to trainers"). SWE-rebench (arXiv 2505.20411) = decontaminated continuously-refreshed pipeline. | https://epoch.ai/benchmarks/swe-bench-verified ; https://arxiv.org/pdf/2505.20411 |

**Fit:** Best *recognition* by a skeptical audience; the scaffold-delta is *already a published
norm here*, which de-risks the "is this real?" objection. BUT: Docker-heavy, long rollouts =
**most expensive** to run N≥150 × #models × #conditions, and Verified has residual
contamination risk. **Recommendation: include a small SWE-bench Verified slice (N≈100-150) as a
"credibility arm," not the cost-driver.** If budget allows, prefer **SWE-bench Pro public** or
**SWE-rebench** for the contamination story.

### 2.4 GAIA & GAIA2 (Meta ARE) — **#4 (only if ARE already paid for)**

| Field | Value | Source |
|---|---|---|
| GAIA (orig) | General-assistant, web+tools+multimodal, 3 difficulty levels; ~466 Q; held-out private test set on HF leaderboard. Text-only subsets exist (filter to no-file questions). | general |
| GAIA2 / N | **800 scenarios**, single validation split, capability configs: execution/search/adaptability/time/ambiguity/mini = **200 each**; 7 capabilities incl. Agent2Agent + Noise | https://huggingface.co/datasets/meta-agents-research-environments/gaia2 |
| Metric | **pass@1** + per-capability; **oracle events** (ground-truth events) for automated verification + judge-based dev feedback | HF dataset card |
| Public leaderboard w/ raw AND scaffolded | YES (HF Space `meta-agents-research-environments/leaderboard`), but content didn't render in fetch — **verify scaffold tags manually** | https://huggingface.co/spaces/meta-agents-research-environments/leaderboard |
| Arbitrary / local models | Yes — ARE supports arbitrary endpoints; `gaia2-run` command | docs |
| Infra | **Requires ARE simulator framework** (stateful, evolving environments) | docs |
| License | **CC-BY-4.0** (clean for redistribution) | HF dataset card |
| Contamination | Newest (Sep 2025), simulated/stateful → low static-memorization risk; **Ambiguity + Adaptability splits specifically reward scaffold behavior** (clarify-vs-guess, re-plan) | design |

**Fit / why #4 not higher:** Scientifically GAIA2's **Ambiguity** and **Adaptability** splits
are arguably the *best possible* showcase for a harness (a good scaffold clarifies, re-plans,
and abstains — exactly what those splits score). BUT three concrete blockers from the repo's
own history: (1) the existing GAIA2 arc was **HALTED** at **$4.09/invocation** — "9-31× over
the original estimate, narrow-proxy adapter approach economically non-viable" (CLAUDE.md §10
C-3); (2) a **SIGALRM** blocker is flagged in `manifest-v8.2-final.md` Track B; (3) ARE is a
heavier dependency than τ²/AppWorld. **Use GAIA2 only if the ARE harness investment is already
sunk** (the repo has `benchmarks/gaia2/runs/` + a full v8 preregistration), in which case the
Ambiguity/Adaptability splits are a high-value *secondary* showcase — not the cost-efficient
primary.

### 2.5 WebArena / VisualWebArena — **NOT recommended as primary**

| Field | Value | Source |
|---|---|---|
| N | WebArena **812** tasks / 6 domains; VisualWebArena **910** tasks / 3 apps | https://github.com/web-arena-x/visualwebarena ; search |
| Metric | execution-based success rate (functional correctness) | README |
| Leaderboard raw+scaffold | YES — and the *literature explicitly attributes progress to scaffold* ("Planner-Executor-Memory drove progress more than model improvements"). IBM CUGA reached **61.7%** on WebArena (2025); VWA SOTA ~16-30%. Human ~78%/89%. | MarkTechPost ; Medium roundup |
| Arbitrary / local models | Yes (`--model`/`--provider`) | README |
| Infra | **Self-hosted Docker websites + AWS AMI** — heavy, flaky. WAREX/WABER papers (2025) document **reliability/eval-harness flakiness** as a confound. | https://github.com/web-arena-x/visualwebarena ; WAREX arXiv 2510.03285 |
| License | MIT | README |

**Why not:** Scientifically WebArena is the *poster child* for "scaffold > model," which is
attractive. But the **infra is heavy and flaky** (Docker site copies, reset-per-task, browser
automation), which threatens reproducibility — a skeptical reviewer can attack the *harness
reliability itself* (WAREX/WABER literature exists precisely to flag this). High $$ + high
variance + browser dependency make it a poor fit for cheap N≥150 × conditions. **Skip for our
cost-bounded claim.**

### 2.6 OSWorld — **NOT recommended**

- **369** real computer-use tasks (Ubuntu/Windows), GUI + file I/O + multi-app; metric = success
  rate; human **72.36%** vs AI baseline **12.24%**; SOTA ~22% (Claude 3.5 Sonnet on OSWorld-Extended).
  (https://os-world.github.io/ ; https://arxiv.org/abs/2404.07972 ; MarkTechPost)
- **Why not:** Requires **full VM / screen-pixel** computer-use; slowest + most expensive per
  rollout of any candidate; small N (369); scores so low (<25%) that a scaffold delta sits in a
  noisy floor regime. Wrong tool for a cheap, clean, high-signal scaffold-delta study.

### 2.7 BrowseComp (OpenAI) — **NOT recommended as a harness-delta substrate**

- **1,266** hard multi-hop browsing questions; short exact-match answers; released Apr 2025.
  GPT-4o+browse **1.9%**, Deep Research **51.5%**, human trainers solved **29.2%**.
  (https://openai.com/index/browsecomp/ ; https://cdn.openai.com/pdf/.../browsecomp.pdf)
- **Why not:** Designed to measure *browsing capability*, and the headline gap (1.9% → 51.5%) is
  conflated **scaffold + tools + model** (Deep Research is a whole product). It does prove "a
  harness/agent product lifts a model 27×" rhetorically, but it's **not a clean controlled
  separation** (you can't easily hold tools fixed and vary only scaffold), and it requires **live
  web** (non-reproducible, contamination drift). Good *rhetorical citation*, bad *experimental
  substrate*. Note: **BrowseComp answers were public** → contamination risk grows over time.

### 2.8 AgentBench — **diagnostic only, not for the claim**

- **8 environments** (OS, DB, KG, card game, lateral-thinking puzzles, + web/house/shopping);
  ICLR'24; tested 27 LLMs. (https://arxiv.org/abs/2308.03688)
- **Why not:** It's a *breadth* diagnostic ("where does capability transfer break"), older
  (2023), and not built for a scaffold-vs-model controlled comparison. MarkTechPost: "not
  predictive of production performance." Skip.

### 2.9 ToolBench / ToolLLM (OpenBMB) — **NOT recommended**

- **16,464** RapidAPI tools, **>120k-210k** instruction-API pairs; metric = Pass Rate + Win Rate
  via **ToolEval (LLM judge)**. (https://github.com/OpenBMB/ToolBench ; https://openreview.net/forum?id=dHng2O0Jjr)
- **Why not:** Primarily a **training corpus**, not a clean held-out eval; depends on **live
  RapidAPIs** (rot/availability → non-reproducible) and an **LLM-judge** Win Rate (gameable,
  contestable by a skeptic). High contamination (massive public dataset). Skip.

### 2.10 2025-2026 newcomers worth naming

- **τ²-bench** (Jun 2025) — covered, #1.
- **SWE-bench Pro** (Scale) — **1,865** tasks, 276 **private** commercial tasks = strongest
  contamination control; standardized scaffold (250-turn limit, identical tooling) so "scaffold
  is held constant" — which is the *opposite* of what we want to vary, but it's the gold standard
  for the **model-only** comparison. Best Claude Fable 5 ~80.3% public / frontier ~23% on Pro-private.
  (https://labs.scale.com/leaderboard/swe_bench_pro_public ; https://www.morphllm.com/swe-bench-pro)
- **SWE-rebench** (arXiv 2505.20411) — automated, continuously-decontaminated SWE task pipeline;
  best answer to "your SWE set is contaminated."
- **HAL** (Princeton, Oct 2025) — the meta-leaderboard that *legitimizes the scaffold axis*; cite, don't run.
- **ToolComp** — 485 prompts, dependent multi-tool composition, golden answer chains + process
  supervision; recommended in 2026 roundups for tool-use.
- **MCP Atlas** — "controlled harness, real tools" tool-use bench named in 2026 roundups (verify primary source).
- **ARC-AGI-2 / ARC-AGI-3** — fluid-reasoning, *model-bound* (scaffold-insensitive by design) →
  irrelevant to our claim, useful only as a "this is model not harness" contrast.

---

## 3. Recommended experimental design for the claim

**Substrate:** τ²-bench primary + AppWorld (test-normal) secondary + a small SWE-bench Verified
credibility slice.

**Grid (the publishable table):**
```
For each MODEL m in { 1 frontier closed (e.g. Claude/GPT), 1 mid OSS (e.g. Qwen3 35B local via vLLM) }:
  For each CONDITION c in { raw-baseline-loop, our-harness }:
    Run N≥150 tasks (τ²: all 540 if budget allows; else 180/domain stratified)
    Report: pass^1, pass^k (k=2..4), $/task, mean turns
Primary effect = Δ(our-harness − raw) within-model, within-task (paired).
```

**Why this is reviewer-proof:**
1. **Within-model, within-task paired delta** kills "you used a better model."
2. **`pass^k`** (τ²'s native metric) shows the harness fixes *reliability*, the deepest claim.
3. **τ²'s standard-vs-custom leaderboard taxonomy** means our "raw vs harness" framing matches
   an *existing community norm* — reviewers can't call it idiosyncratic.
4. **HAL + MarkTechPost** are the citations that establish "scaffold matters" as a recognized
   axis, so the *question* is pre-legitimized.
5. **Local OSS arm (Qwen via vLLM through LiteLLM)** makes the sovereignty/"works on your own
   model" claim honest — and it's free compute if self-hosted.
6. **AppWorld test-challenge held-out** + **SWE-bench Verified git-stripped** give two
   independent contamination postures; **SWE-bench Pro-private / SWE-rebench** are the escalation
   if a reviewer pushes on contamination.

**Stats to preregister (matches repo's existing `benchmarks/preregistration/` discipline):**
paired bootstrap CI on the within-model harness delta; report N, seed, model id, user-sim model
id, $/condition; one-sided test that Δ>0; effect size in pp. Mirror the
`manifest-v8.*` format.

---

## 4. Cost reality check (rough, order-of-magnitude)

| Substrate | Per-task cost driver | N≥150 × 2 models × 2 conditions ≈ 600 rollouts |
|---|---|---|
| τ²-bench | ~5-15 text turns × 2 LLMs (agent+user) | **low-mid** — hundreds of $ at most with closed models; ~free if both arms local |
| AppWorld | in-process API calls, code-gen turns | **low-mid** |
| GAIA2/ARE | stateful sim, the repo measured **$4.09/invocation** | **$$$** (~$2.5k+ at 600 rollouts) → why it's #4 |
| SWE-bench Verified | Docker build + long agent rollouts | **$$ high** — keep slice small (N≈100-150, 1 model × 2 scaffolds) |
| WebArena/OSWorld | browser/VM, slow, flaky | **$$$ + variance** → excluded |

**The repo's GAIA2 $4.09/invocation halt (CLAUDE.md §10, C-3) is the single most important
local datapoint:** it is the empirical reason to make τ²-bench (not GAIA2) the cost-efficient
primary.

---

## 5. Risks / gaps a skeptical reviewer will attack (read this)

1. **User-simulator confound (τ²-bench).** The *user* is an LLM. If you change the agent
   scaffold but the user-sim model differs across conditions, your delta is contaminated. **Pin
   the user-sim model identical across all cells** (leaderboard requires this) and report it.
2. **`pass^k` denominator / k must be preregistered.** k and #trials drive the reliability
   number; choose k before running.
3. **τ²-bench license UNVERIFIED.** README excerpt didn't surface a license. **Confirm the repo
   license before any redistribution/publication** — do not assume MIT/Apache.
4. **GAIA2 leaderboard scaffold-tag UNVERIFIED.** The HF Space didn't render in fetch; I could
   not confirm whether GAIA2 entries distinguish scaffolds from raw models. Verify manually if
   GAIA2 is used.
5. **SWE-bench Verified contamination is real, not zero.** Public repos pre-cutoff. The
   git-history strip helps but doesn't eliminate it. For a *strong* contamination claim, use
   **SWE-bench Pro private** or **SWE-rebench**, not Verified.
6. **HAL's "reasoning effort lowers accuracy in 21/36" finding** is a double-edged sword: it
   means more scaffold/reasoning is NOT monotonically better. Our harness must show a *positive*
   delta *despite* this — frame the harness as "structure," not "more tokens," or a reviewer
   weaponizes HAL against us.
7. **I could not extract a single clean "scaffold changes accuracy by X pp for the same model"
   number** from HAL's abstract/secondary pages (the figure is in the full PDF, which exceeded
   fetch limits). The *qualitative* claim is well-sourced; the *exact pp* is a GAP — pull it
   from the HAL PDF (arXiv 2510.11977) / OpenReview before citing a number.
8. **τ²-bench per-domain counts have two conflicting figures**: README/τ¹ says retail 115 +
   airline 50 + telecom 114; the τ²-bench *paper* says 180/domain (540). These are likely
   different release versions (τ¹ task sets vs τ²'s expanded/balanced set). **Confirm against the
   exact commit you run** before quoting N.
9. **"Harness lifts model" vs "harness = different tools."** A reviewer will demand the raw
   baseline have *access to the same tools* — the only difference being orchestration. If the
   harness also adds tools, you're measuring tools+scaffold, not scaffold. **Hold the tool set
   constant; vary only orchestration logic.** (This is the single biggest internal-validity trap.)
10. **Relation to prior work (avoid double-counting).** The repo's existing
    `benchmarks/harness/` grid and `manifest-v8.*` preregistrations are the **memory** claim
    (Pillar-2). This recon proposes a **new** orchestration substrate (Pillar-1). Do not reuse
    the memory ablation cells (raw/filtered/compressed/full-context) as the scaffold conditions —
    they answer a different question.

---

## 6. Sources (primary-first)

- τ²-bench repo: https://github.com/sierra-research/tau2-bench
- τ²-bench leaderboard-submission: https://github.com/sierra-research/tau2-bench/blob/main/docs/leaderboard-submission.md
- τ²-bench paper: https://arxiv.org/pdf/2506.07982 ; τ¹ paper: https://arxiv.org/abs/2406.12045
- AppWorld repo: https://github.com/StonyBrookNLP/appworld ; paper: https://arxiv.org/abs/2407.18901 ; leaderboard: https://github.com/StonyBrookNLP/appworld-leaderboard
- SWE-bench Verified: https://openai.com/index/introducing-swe-bench-verified/ ; Epoch: https://epoch.ai/benchmarks/swe-bench-verified ; leaderboard: https://www.swebench.com/verified.html
- SWE-bench Pro: https://labs.scale.com/leaderboard/swe_bench_pro_public ; https://www.morphllm.com/swe-bench-pro
- SWE-rebench: https://arxiv.org/pdf/2505.20411
- GAIA2/ARE: https://github.com/facebookresearch/meta-agents-research-environments ; dataset: https://huggingface.co/datasets/meta-agents-research-environments/gaia2 ; leaderboard: https://huggingface.co/spaces/meta-agents-research-environments/leaderboard
- WebArena/VisualWebArena: https://github.com/web-arena-x/visualwebarena ; WAREX: https://arxiv.org/pdf/2510.03285
- OSWorld: https://os-world.github.io/ ; https://arxiv.org/abs/2404.07972
- BrowseComp: https://openai.com/index/browsecomp/ ; https://cdn.openai.com/pdf/5e10f4ab-d6f7-442e-9508-59515c65e35d/browsecomp.pdf
- AgentBench: https://arxiv.org/abs/2308.03688
- ToolBench/ToolLLM: https://github.com/OpenBMB/ToolBench ; https://openreward.ai (judge)
- HAL: https://arxiv.org/abs/2510.11977 ; https://www.emergentmind.com/topics/holistic-agent-leaderboard-hal ; https://openreview.net/forum?id=vUaY1t64ZZ
- 2026 roundups: https://www.marktechpost.com/2026/04/26/top-7-benchmarks-that-actually-matter-for-agentic-reasoning-in-large-language-models/ ; https://benchlm.ai/agentic
- Repo prior work: `benchmarks/harness/README.md` ; `benchmarks/preregistration/manifest-v8.2-final.md` ; `CLAUDE.md` §10 (GAIA2 C-3 halt)
