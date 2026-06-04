# Manifest v8 — GAIA 2 Ambiguity+Adaptability Ablation Pre-Registration

**Manifest version:** v8.0.0-preregistration
**Manifest type:** `gaia2_ambiguity_adaptability_hive_mind_ablation`
**Preregistered date:** 2026-06-04
**Authority:** PM (Marko Marković) — v8 emission under full PM authority. Extends waggle-os benchmark programme to the ARE/GAIA 2 evaluation environment. Does not supersede v6/v7 (LoCoMo / GEPA lineage continues independently). v8 governs all GAIA 2 work from this pre-registration forward.
**Branch:** `feature/gaia2-hive-mind-ablation` (to be created at code-freeze)
**Machine-readable twin:** [`manifest-v8-gaia2-preregistration.yaml`](manifest-v8-gaia2-preregistration.yaml)

---

## 0. Status

**PRE-REGISTERED — PENDING PM RATIFICATION FOR PHASE 1 (ENVIRONMENT UNBLOCK + ADAPTER BUILD).**

Any change to §1–§9 of this document after the anchor commit invalidates the pre-registration and requires a new PM-ratified manifest (v9+). The anchor commit SHA and SHA-256 of both MD and YAML files are recorded in the commit message body.

**Anchor commit SHA:** recorded in the git commit that adds these files.
**Manifest SHA-256 (MD + YAML bytes):** `sha256sum benchmarks/preregistration/manifest-v8-gaia2-preregistration.{md,yaml}` — recorded in the commit message body.

---

## 0.1. Motivation and lineage

This pre-registration extends the waggle-os benchmark programme from its LoCoMo memory-recall focus (v2–v7) to the **GAIA 2 ARE** (Agent Runtime Environments) evaluation environment. The scientific motivation is a direct continuation of the hive-mind LoCoMo finding:

> **Substrate ≫ subject model**: Opus 4.7 and Qwen3.6-35B converge to 73.1% / 73.4% on identical retrieval substrate (hive-mind LoCoMo v5, N=320).

The LoCoMo benchmark tests single-turn factoid recall from conversational memory. The central open question is whether the **I/P/B frame architecture** (Intra, Predicted, Bidirectional frames in `@waggle/core::FrameStore`) provides incremental lift on tasks that require:

1. **Detecting and tracking conflicting instructions** across turns (GAIA 2 Ambiguity split)
2. **Replanning in response to environment changes** that contradict earlier agent decisions (GAIA 2 Adaptability split)

These two splits were selected because they map directly onto the semantic purpose of I/P/B frames — specifically:
- **P-frames (Predicted):** record agent hypotheses and planned actions before execution
- **B-frames (Bidirectional):** record corrections and resolved contradictions
- The Ambiguity split requires an agent to detect that two instructions conflict before acting
- The Adaptability split requires an agent to update an earlier committed plan when new information arrives

The ARE SIGALRM blocker (`module 'signal' has no attribute 'SIGALRM'` — smoke run `smoke-c2-2026-04-30`) must be resolved as a **Phase 1 prerequisite** before any benchmark execution.

---

## 0.2. Relationship to prior manifests

| Manifest | Dataset | Claim | Status |
|---|---|---|---|
| v2–v5 | LoCoMo | Memory lift proof (retrieval cell) | Completed |
| v6 | LoCoMo | Judge ensemble swap (MiniMax) | Completed |
| v7 | LoCoMo (GEPA) | Prompt-shape evolution | Active |
| **v8 (this)** | **GAIA 2 ARE** | **I/P/B frame lift on Ambiguity + Adaptability** | **Pre-registered** |

v8 does NOT inherit v6/v7 code freeze or judge ensemble choices. v8 is a new benchmark programme on a new evaluation framework. All sections are v8-native.

---

## 1. Primary hypothesis (directional, confirmatory)

> **I/P/B-augmented hive-mind substrate improves agent task success on GAIA 2 Ambiguity and Adaptability splits vs. a substrate-free baseline, by a margin of ≥ 10 percentage points.**
>
> `score(hive_mind_ipb) − score(no_memory_baseline) ≥ 10pp`
>
> evaluated at **Fisher exact one-sided** p-value **< 0.10** on the pooled Ambiguity + Adaptability scenario set.

**One-sided justification:** theory-driven directional claim. The I/P/B frame architecture was explicitly designed to track conflicting and corrective information. Both selected splits require this capability. No prior GAIA 2 / hive-mind result exists; direction is grounded in hive-mind LoCoMo monotonicity chain (no-memory 0.0% → retrieval 35% → agentic 40% → oracle 55% at N=20, Stage 2 Gate C) and the semantic alignment of I/P/B frames with Ambiguity + Adaptability task structure.

**Threshold rationale:** 10pp chosen over the LoCoMo-standard 5pp because:
- GAIA 2 write-action scoring is harder (argument-level exact + soft checks vs. string match)
- I/P/B frames are a structural advantage, not a marginal one, on contradiction-requiring tasks
- A weaker effect at <10pp would be scientifically interesting but would not support a strong architectural claim
- Power: 10pp effect size at N=100 per cell gives ~70% power at α=0.10 (Wilson-based estimate); adequate for a pilot

**Failure mode:** If primary fails (Δ < 10pp or p ≥ 0.10):
- Report full cell distribution
- PM adjudication on whether to run a larger N or revise the architectural integration
- Do NOT claim negative result without replication; pilot N=100 may underpower marginal effects

---

## 2. Secondary endpoints (ex-ante, non-blocking on primary)

| # | Endpoint | Direction | Threshold | Test |
|---|---|---|---|---|
| S1 | `no_memory_baseline ≤ hive_mind_retrieval_only` | positive | ≥ 0pp | Fisher one-sided p < 0.20 |
| S2 | `hive_mind_retrieval_only ≤ hive_mind_ipb` | positive | ≥ 0pp | Fisher one-sided p < 0.20 |
| S3 | Ambiguity split: `hive_mind_ipb − no_memory_baseline` | descriptive | ≥ 0pp | point estimate + Wilson 95% CI |
| S4 | Adaptability split: `hive_mind_ipb − no_memory_baseline` | descriptive | ≥ 0pp | point estimate + Wilson 95% CI |
| S5 | Temporal split: `hive_mind_ipb − no_memory_baseline` | descriptive (null expected) | n/a | point estimate (negative control) |
| S6 | Cost-efficiency: `hive_mind_ipb` cost per solved scenario vs. no-memory | descriptive | n/a | median + IQR in USD |
| S7 | `subject_model_strong` (Opus 4.x) vs `subject_model_cheap` (Qwen3.6-35B) on `hive_mind_ipb` cell | descriptive | n/a | Δpp + Wilson 95% CI |

**S5 Negative control rationale:** the Temporal split is the hardest GAIA 2 split (all models), with failures driven by wall-clock latency, not memory architecture. hive-mind should not help here. If S5 shows large positive lift, it signals a confound in the experimental design.

Multi-comparisons policy: secondary endpoints are descriptive, no correction required. Primary hypothesis test is the only confirmatory statistical test.

---

## 3. Sample design

- **Cells:** four, run sequentially (concurrency = 1 per cell; within-cell parallelism TBD at Phase 2).

  | Cell | Description |
  |---|---|
  | `no_memory_baseline` | Standard ARE ReAct loop, no memory injection, no hive-mind substrate |
  | `hive_mind_retrieval` | ARE ReAct loop + hive-mind `@waggle/core::HybridSearch` passive recall (no I/P/B frame writes) |
  | `hive_mind_ipb` | ARE ReAct loop + full hive-mind substrate (retrieval + I/P/B frame detection + contradiction gate) |
  | `hive_mind_ipb_strong` | Same as `hive_mind_ipb` with stronger subject model (Opus 4.x vs Qwen3.6) |

- **Primary splits:** Ambiguity + Adaptability (pooled for primary hypothesis test; per-split for S3/S4)
- **Negative control split:** Temporal (S5)
- **N per cell per split:** 50 scenarios × 2 splits = 100 scenarios per cell
- **Total scenario executions:** 400 (4 cells × 100 scenarios)
- **Instance selection seed:** `42`
- **Matched design:** same 100 scenarios (50 Ambiguity + 50 Adaptability) flow through all four cells
- **Negative control:** same 50 Temporal scenarios flow through `no_memory_baseline` and `hive_mind_ipb` only (100 additional executions)
- **Total executions including negative control:** 500
- **Concurrency (within cell):** `1` pending Phase 1 environment characterization; may be raised to `≤4` at Phase 2 gate if ARE rate limits permit, under PM authorization
- **N justification:** N=50 per split per cell is the minimum for the 10pp threshold at α=0.10 with ~70% power. A larger N=100 per split per cell is preferred and reserved for PM authorization at Phase 2 if Phase 1 pilot (N=50 per split) is inconclusive.

---

## 4. Dataset — ARE/GAIA 2 scenarios

- **Source:** Meta AI ARE framework (arXiv:2509.17158), open-source MIT license, dataset CC BY 4.0
- **Repository:** `https://github.com/facebookresearch/agentbenchmark` (canonical ARE repo — to be confirmed at Phase 1)
- **Version:** ARE public release (800 scenarios across 10 universes), as of Phase 1 clone date
- **Selected splits:** `ambiguity`, `adaptability`, `temporal` (negative control)
- **Scenario selection:** deterministic seed-42 shuffle within each split, take-first-N
- **Scenario count per split:**
  - Ambiguity: 50 (pilot); expand to 100 at Phase 2 gate if available
  - Adaptability: 50 (pilot); expand to 100 at Phase 2 gate if available
  - Temporal (negative control): 50 (no expansion planned)
- **Dataset integrity:** SHA-256 of the scenario JSON files recorded at Phase 1 clone time in the run manifest
- **No modifications** to scenario content, oracle traces, or verifier DAGs. ARE scenarios used as-is from the public release.

---

## 5. Model stack

### 5.1 Subject models

| Priority | Cell | Model alias | Provider | Thinking | Notes |
|---|---|---|---|---|---|
| primary | `no_memory_baseline`, `hive_mind_retrieval`, `hive_mind_ipb` | `qwen3.6-35b-a3b-via-dashscope-direct` | Alibaba DashScope-intl | on | Inherits v6 primary subject |
| fallback | above cells | `qwen3.6-35b-a3b-via-openrouter` | OpenRouter | on | Inherits v6 fallback |
| primary | `hive_mind_ipb_strong` | `claude-opus-4-x` | Anthropic direct | n/a | Exact alias pinned at Phase 1 |
| fallback | `hive_mind_ipb_strong` | `claude-sonnet-4-x` | Anthropic direct | n/a | Fallback if Opus rate-limits |

Subject model pricing (Qwen3.6-35B): $0.20 / $0.80 per M in/out (inherits v6).
Subject model pricing (Claude Opus 4.x): to be recorded at Phase 1 from Anthropic pricing page.

### 5.2 Judge protocol — ARE verifier (primary) + LLM soft judge (secondary)

GAIA 2 scoring uses a **two-layer judge**:

**Layer 1 — ARE verifier (deterministic):**
- Hard checks: argument-level exact match for deterministic fields (dates, names, IDs)
- Causality and relative-time constraint validation
- Implemented in the ARE scenario DAG verifier; no LLM call
- Score: binary pass/fail per hard-check field

**Layer 2 — LLM soft judge (for open-ended fields):**
- Per ARE paper (arXiv:2509.17158): `Llama 3.3 Instruct 70B` used in paper baseline
- **v8 policy:** replicate ARE paper's judge (`llama-3.3-70b-instruct-via-openrouter`) as Layer 2 primary for reproducibility with the leaderboard baseline
- **v8 secondary judge:** `claude-opus-4-x` (Anthropic) for cross-validation of open-ended verdicts on a 20% random sample
- Temperature: 0 for both judges
- κ calibration: compute pairwise Cohen's κ (ARE-Llama vs. Opus) on the 20% sample at Phase 1 exit. Threshold: κ ≥ 0.65 PASS / κ < 0.60 HALT.

**Score aggregation:** final scenario score = arithmetic mean of (all hard-check pass rates + soft-judge pass rates) per ARE paper §4. Reported as a decimal in [0, 1].

**v8 does NOT use the waggle-os LoCoMo judge ensemble (Opus + GPT + MiniMax).** That ensemble was designed for factoid string-match accuracy. GAIA 2 scenarios require structural verifier checks that cannot be delegated to a general-purpose judge.

### 5.3 Health-check predicate

Pre-cell health check required before each cell execution:
- ARE environment boot: `python -c "from agents_benchmark import ARE; ARE().ping()"` — must succeed
- LiteLLM liveness: `/v1/chat/completions` ping on all active subject aliases
- LLM soft judge: ping on `llama-3.3-70b-instruct-via-openrouter`
- Ollama embedder (for `hive_mind_retrieval` + `hive_mind_ipb` cells): `curl http://localhost:11434/api/embeddings` with `nomic-embed-text`

Failure on any probe → halt before cell, PM raise.

---

## 6. Substrate

### 6.1 hive-mind substrate (`@waggle/core`)

Inherited from hive-mind v5 architecture (`hive-mind` repo, `feature/v5-distilled-dense` or equivalent frozen branch — to be confirmed at Phase 1).

**Components:**
- `MindDB` (SQLite + sqlite-vec) — in-memory per scenario (`:memory:` path), ephemeral per run
- `FrameStore` — I/P/B-frame CRUD + FTS5 auto-index
- `HybridSearch` — RRF-fused FTS5 + vec0 search
- `SessionStore` — per-scenario session lifecycle
- `createOllamaEmbedder()` — `nomic-embed-text`, 1024 dims, local, $0

**Cell-specific substrate config:**

| Cell | `MindDB` | `FrameStore` | Frame types written | `HybridSearch` |
|---|---|---|---|---|
| `no_memory_baseline` | none | none | none | none |
| `hive_mind_retrieval` | `:memory:` | active (read-only after ingest) | I-frames only (past turns ingested) | conv-scoped, top-K=20 |
| `hive_mind_ipb` | `:memory:` | active (read+write during run) | I + P + B frames | conv-scoped, top-K=20 |
| `hive_mind_ipb_strong` | same as `hive_mind_ipb` | same | same | same |

### 6.2 I/P/B frame integration contract for GAIA 2

This is the **core novel integration** that does not exist in the current codebase and must be built during Phase 1. The integration contract is pre-specified here to prevent methodology drift:

**Intra-frames (I-frames):** written after each user message and each environment event notification is received. Content = the raw turn text. Standard frame, equivalent to what LoCoMo ingest uses.

**Predicted-frames (P-frames):** written **before** each write-action tool call. Content = the agent's stated intent and predicted post-state (extracted from the agent's reasoning trace). Purpose: create a retrievable record of what the agent expected to happen, enabling contradiction detection when the environment responds differently.

**Bidirectional-frames (B-frames):** written when the agent detects a contradiction between:
- A new user message and a previously recorded P-frame (instruction conflict → Ambiguity)
- An environment event and a previously recorded P-frame (plan invalidated → Adaptability)

B-frames store: the conflicting pair (new content + prior P-frame ID), the resolved intent (if any), and a `conflict_type` label (`instruction_conflict` or `plan_invalidation`).

**Contradiction gate:** a lightweight check (single LLM call or heuristic rule, TBD at Phase 1 code-freeze) that fires before each write-action tool call when there are ≥ 1 P-frames in the substrate. If triggered, the gate:
1. Retrieves the top-3 P-frames by semantic similarity to the current action
2. Asks the subject model (or a cheap dedicated gate model, TBD): "Does the proposed action contradict any of these prior plans?"
3. If YES → writes a B-frame and injects a `# Contradiction Warning` block into the agent's context before the write-action call
4. If NO → proceeds without injection

The contradiction gate is the primary mechanism by which `hive_mind_ipb` is expected to outperform `hive_mind_retrieval` on the Ambiguity and Adaptability splits.

**Gate model (contradiction check):** default = same subject model as the outer agent loop (Qwen3.6-35B). Alternative: a lightweight dedicated model (e.g., `qwen3.6-8b` via OpenRouter) to reduce latency and cost. Decision deferred to Phase 1 gate after latency profiling.

### 6.3 Substrate lifecycle per scenario

1. `createSubstrate({dbPath: ':memory:'})` at scenario start
2. Ingest prior turns (if scenario has a conversation history preamble) as I-frames
3. Agent loop runs; P/B frames written dynamically during execution
4. Scenario exits (success or failure per ARE verifier)
5. `substrate.close()` — `:memory:` freed; no persistence between scenarios
6. ARE verifier evaluates the recorded action trace independently of the substrate

Substrate state does NOT affect the ARE verifier. The verifier scores the agent's actual tool calls in the environment, not the memory contents.

---

## 7. Agent architecture — ARE ReAct loop with hive-mind hooks

**Base architecture:** ARE paper's standard uniform ReAct loop (temperature=0.5, max generation=16K tokens per ARE §4.2). This is the architecture all GAIA 2 baseline models use; it is adopted for comparability.

**Hive-mind hooks (new for v8):**

The `no_memory_baseline` cell uses the ARE loop unmodified.

The `hive_mind_*` cells wrap the ARE loop with three hooks:
1. **Pre-turn hook:** `search_memory(query=current_user_message, topK=20, scopeToSession=true)` → inject `# Recalled Memories` block into system context (as in LoCoMo agentic cell). Skipped on turn 1 if no prior I-frames exist.
2. **Pre-write-action hook:** contradiction gate (§6.2) — fires before any `write`-type ARE tool call
3. **Post-turn hook:** write I-frame (always) + write P-frame if the turn contained a write-action intent

**Tool allowlist:** all 101 ARE tools remain available. No tool is blocked. The hive-mind substrate is additive, not restrictive.

**ARE environment:** Mobile universe (smartphone mock-up with Email, Calendar, Contacts, Shopping, FileSystem) unless the Ambiguity/Adaptability split scenarios span multiple universes — to be confirmed at Phase 1 dataset inspection. If multiple universes are present, universe distribution is reported in run metadata.

**SIGALRM blocker fix (prerequisite for Phase 1 execution):**

The smoke run `smoke-c2-2026-04-30` failed on all 3 runs with:
```
AttributeError: module 'signal' has no attribute 'SIGALRM'
```
This is a Windows/non-Unix signal error. Resolution options (in priority order):
1. **WSL2 Linux environment** — run ARE inside WSL2 where `signal.SIGALRM` is available (zero code change, recommended)
2. **Docker container** — run `benchmarks/harness` + ARE inside a Linux container (Docker Desktop on Windows)
3. **SIGALRM shim** — patch ARE's timeout mechanism to use `asyncio.wait_for` instead of `signal.SIGALRM` (code change to ARE; requires upstreaming or local fork maintenance)

Option 1 (WSL2) is the pre-registered preferred path. If WSL2 is unavailable, Option 2 (Docker) is the fallback. Option 3 is a last resort requiring PM approval as a scope-deviation.

Phase 1 does NOT begin until the SIGALRM blocker is resolved and a clean smoke run (`0 exceptions, ≥ 1 scenario scored ≥ 0.5`) is recorded.

---

## 8. Stopping rules

| # | Rule | Trigger | Action |
|---|---|---|---|
| §8.1 | Budget hard halt | Cumulative spend ≥ **$80.00** | Halt, persist partial JSONL, PM raise |
| §8.2 | Scenario exception rate | > 20% of scenarios in a cell raise Python exceptions | Halt cell, PM raise before next cell |
| §8.3 | ARE environment health | ARE ping fails on pre-cell health check | Halt before cell |
| §8.4 | Subject fetch failures | 5 consecutive LiteLLM 5xx / fetch errors | Halt, persist partial |
| §8.5 | κ failure (Phase 1 exit) | κ(ARE-Llama, Opus) < 0.60 on 20% calibration sample | Halt, PM raise — Phase 2 requires judge renegotiation |
| §8.6 | Deviation from §1–§9 | Any change detected during run | Immediate halt + PM raise + re-pre-registration required (v9+) |
| §8.7 | SIGALRM unresolved | Phase 1 smoke run still fails after resolution attempt | Halt, report blocker to PM, await environment decision |

**No interim looks at primary hypothesis during execution.** Budget monitoring is continuous (non-statistical). Halts are operational, not inferential.

---

## 9. Post-hoc exclusion policy: NONE

All 500 scenario executions (400 primary + 100 negative control) enter the denominator. `verifier_error` and `environment_crash` scenarios are counted in denominator and reported as `execution_loss` separately. No scenario whitelist/blacklist. Selective exclusion forbidden ex-ante.

Exception: if the ARE environment produces a scenario with a known bug acknowledged in the ARE issue tracker, PM may authorize exclusion of that specific scenario ID with audit trail. This requires a new decision document (not a manifest amendment).

---

## 10. Deviation policy

Any deviation from §1–§9 during run → (1) immediate halt, (2) PM raise, (3) re-pre-registration (manifest v9+) if accepted.

**Permitted non-deviations (do not require v9):**
- SIGALRM fix choice between Option 1 (WSL2) and Option 2 (Docker), per §7
- Gate model selection for contradiction check (subject model vs. dedicated lightweight), per §6.2
- Minor litellm-config.yaml amendments (new alias additions only, no semantic changes to existing aliases)
- κ calibration sample size adjustment ±10% due to split availability (if < 50 scenarios exist in a split at Phase 1, N adjusts to available count — primary hypothesis threshold adjusts proportionally)

---

## 11. Code freeze

Code is frozen at the commit that adds this manifest to the repository. The following paths are frozen for the duration of v8 execution:

**Frozen paths (substrate and harness):**
- `packages/core/src/mind/search.ts` (HybridSearch)
- `packages/core/src/mind/frames.ts` (FrameStore, I/P/B frame types)
- `packages/core/src/mind/sessions.ts` (SessionStore)
- `packages/core/src/mind/db.ts` (MindDB)
- `packages/agent/src/agent-loop.ts` (runAgentLoop)
- `benchmarks/harness/src/substrate.ts`

**Frozen paths (v8-specific, to be created at Phase 1 code-freeze):**
- `benchmarks/gaia2/src/adapter.ts` — ARE scenario ↔ harness schema adapter
- `benchmarks/gaia2/src/cells-gaia2.ts` — four v8 cell implementations
- `benchmarks/gaia2/src/contradiction-gate.ts` — I/P/B contradiction gate
- `benchmarks/gaia2/src/runner-gaia2.ts` — v8 runner (wraps ARE loop)
- `benchmarks/gaia2/src/judge-gaia2.ts` — ARE verifier + Llama soft-judge integration

These paths are frozen at Phase 1 code-freeze commit (separate from this pre-registration commit). Any post-freeze modification to the above paths triggers §8.6 (halt + PM raise).

**Permitted delta during run:** new JSONL files emitted to `benchmarks/gaia2/runs/` and `benchmarks/gaia2/results/`.

---

## 12. Scope boundaries

### Can claim at Gate D (post-run):
- Magnitude + significance of I/P/B hive-mind lift on GAIA 2 Ambiguity + Adaptability splits under the pre-registered cell stack and subject models
- Per-cell, per-split scenario success rates with Wilson 95% CIs
- Negative control result (Temporal split)
- Contradiction gate firing rate and per-firing outcome (resolved vs. unresolved)
- Cost-per-solved-scenario across cells
- Substrate-is-the-moat finding (if S7 shows Opus ≈ Qwen on `hive_mind_ipb`, replicating LoCoMo finding in GAIA 2 context)

### Cannot claim at Gate D:
- General GAIA 2 leaderboard rank (v8 tests 2 of 7 splits; full leaderboard requires all splits)
- Multi-model generalization beyond Qwen3.6-35B + Opus 4.x
- Production agent performance on real mobile environments
- Direct comparison to GAIA 2 paper baseline models (different scaffold; comparisons are indicative only)

### Reserved for PM:
- Public claim phrasing and venue
- Full 7-split GAIA 2 leaderboard submission (requires v9 pre-registration)
- Publication timing and co-author decisions
- "beats Opus 4.x without hive-mind" framing (requires v9 + explicit cross-model ablation design)

---

## 13. PM gates

### Gate P+ (Phase 1: environment unblock + adapter build)

**Trigger:** SIGALRM fix verified + clean smoke run + Phase 1 code-freeze commit

**Pre-kick checks required:**
- SIGALRM resolution option confirmed (WSL2 or Docker)
- Clean smoke run: `≥ 1 scenario scored ≥ 0.5`, `0 signal.SIGALRM exceptions`
- All frozen paths (§11 v8-specific) committed at Phase 1 code-freeze
- κ calibration plan confirmed (20% sample, Llama + Opus)
- LiteLLM config includes all v8 subject model aliases
- Ollama `nomic-embed-text` liveness confirmed in execution environment

**Action:** CC (agent) halts; awaits `PM-RATIFY-V8-PHASE1` before Phase 2 execution.

### Gate P++ (Phase 2: N=500 execution kick)

**Trigger:** `PM-RATIFY-V8-PHASE1` received after Gate P+ ratification.

**Pre-kick checks required:**
- Phase 1 exit report at `benchmarks/gaia2/preregistration/phase1-exit-report.md`
- κ(ARE-Llama, Opus) ≥ 0.65 on calibration sample
- Budget envelope confirmed ($80 hard halt)
- Cell order confirmed (no_memory_baseline → hive_mind_retrieval → hive_mind_ipb → hive_mind_ipb_strong)

**Action:** kick N=500 execution via CLI invocation template (§14).

### Gate D (post-run, pre-claim)

**Trigger:** N=500 run exit (clean or halted per §8)

**Action:** CC writes Gate D exit report at `benchmarks/gaia2/results/v8-gate-d-exit-report.md`. Halts. PM decides claim composition, venue, and whether to proceed to full 7-split leaderboard submission (v9).

**No self-advance at any gate.**

---

## 14. Budget

- **Hard halt:** $80.00
- **Cap:** $90.00
- **Expected burn:** ~$55–$70

| Component | Est. cost |
|---|---|
| Phase 1: smoke run validation, adapter testing, κ calibration | ~$5–10 |
| N=500 executions — Qwen3.6-35B subject (3 cells × 100 scenarios × ~8K avg tokens) | ~$10–15 |
| N=100 executions — Opus 4.x subject (1 cell × 100 scenarios) | ~$20–30 |
| ARE Llama soft judge (N=500 × soft-check fields, est. avg 2 soft fields/scenario) | ~$5–8 |
| Opus soft-judge cross-validation (20% sample = 100 scenarios) | ~$3–5 |
| Contradiction gate calls (fired on est. 30% of Ambiguity/Adaptability turns) | ~$3–5 |
| Ollama embedding (local, $0) | $0 |
| **Total expected** | **~$41–73** |

Wall-clock estimate: Phase 1 ≤ 1 day; Phase 2 N=500 ≈ 4–8 hours (ARE scenarios have longer execution traces than LoCoMo turns; temporal scenarios have real wait periods that may be simulated or skipped).

---

## 15. Related artefacts

### v8-specific
- **v8 anchor commit:** THIS COMMIT
- **Phase 1 smoke run (failed):** `benchmarks/gaia2/runs/smoke-c2-2026-04-30/` (SIGALRM blocker — audit trail)
- **ARE paper:** Froger et al., arXiv:2509.17158, Sept 2025
- **GAIA 2 comparison report:** `docs/gaia-comparison.md` (research background, 2026-06-04)

### Prior waggle-os manifests (independent lineage)
- v6 LoCoMo Stage 3 anchor: `fc169250c3c27cd3`
- v7 GEPA Faza 1 anchor: see manifest-v7-gepa-faza1.yaml
- Bench-Spec LOCK v1: `PM-Waggle-OS/decisions/2026-04-22-bench-spec-locked.manifest.yaml`

### hive-mind lineage
- LoCoMo v5 result (73.1% Opus, 73.4% Qwen): `hive-mind/benchmarks/locomo/RESULTS.md`
- Trio-strict re-judge (67.8% AND-of-3): `hive-mind/data/judgments/trio-judgments-v5-retrieval.v2.jsonl`
- METHODOLOGY.md: `hive-mind/benchmarks/METHODOLOGY.md`

---

## Appendix A — Integration work required before Phase 1 code-freeze

This appendix documents the build tasks needed. It is informational; it is NOT part of the pre-registered methodology (§1–§9 are the invariant sections).

| Task | File to create | Description |
|---|---|---|
| A1 | `benchmarks/gaia2/src/adapter.ts` | Map ARE scenario JSON schema → harness `DatasetInstance` equivalent; extract split label, oracle trace, universe ID |
| A2 | `benchmarks/gaia2/src/cells-gaia2.ts` | Four cell implementations wrapping ARE loop with hive-mind hooks (§7) |
| A3 | `benchmarks/gaia2/src/contradiction-gate.ts` | P-frame retrieval + conflict check + B-frame write + context injection (§6.2) |
| A4 | `benchmarks/gaia2/src/runner-gaia2.ts` | Scenario runner: load ARE env, run cell, call ARE verifier, emit JSONL |
| A5 | `benchmarks/gaia2/src/judge-gaia2.ts` | ARE verifier wrapper + Llama 3.3 70B soft-judge + Opus cross-validation |
| A6 | SIGALRM fix | WSL2 or Docker environment setup (§7); clean smoke run gate |
| A7 | `litellm-config.yaml` amendment | Add `llama-3.3-70b-instruct-via-openrouter` alias + Opus 4.x alias (if not already present) |

---

_End of Manifest v8 pre-registration. This document is the anchor for all analysis choices at GAIA 2 Gate D exit. Prior waggle-os manifests (v2–v7) remain audit-immutable and govern the LoCoMo/GEPA programme independently._
