# Manifest v8.1 — Multi-Benchmark Programme Amendment
## GAIA 2 · BEAM · LongMemEval-V2 · Terminal-Bench 2.0

**Manifest version:** v8.1.0-preregistration (amends v8.0.0)
**Preregistered date:** 2026-06-04
**Authority:** PM (Marko Marković)
**Supersedes:** manifest-v8-gaia2-preregistration (v8.0.0) for scope section only.
All methodology in v8.0.0 §1–§9 for GAIA 2 remains intact and unmodified.
This document adds three new benchmark tracks (BEAM, LongMemEval-V2, Terminal-Bench 2.0)
and defines their preregistered methodology, runability status, and relationship to the
central I/P/B frame architectural claim.
**Machine-readable twin:** `manifest-v8.1-multi-benchmark.yaml` (companion file)

---

## 0. Amendment rationale

v8.0.0 scoped the v8 benchmark programme to GAIA 2 only. This amendment adds three
parallel tracks following a landscape review (2026-06-04) that identified:

1. **BEAM** — the only benchmark with an explicit, unsolved Contradiction Resolution (CR)
   category. CR is the direct evaluation target for hive-mind I/P/B B-frames. Runnable
   today with minimal adapter work. Highest priority addition.

2. **LongMemEval-V2** — brand new (May 2026), no published competitor results, uses
   web agent trajectories as memory haystacks. A different evaluation surface from V1
   and from LoCoMo. High publication opportunity precisely because it's fresh.

3. **Terminal-Bench 2.0** — positioning data only. Not a memory or agentic-task benchmark.
   Submission-only (no public runner). Qwen3.6-35B baseline already on leaderboard at
   24.6% via `little-coder`. Included as a capability floor reference, not as a
   primary scientific claim.

---

## 1. Four-benchmark overview

| Track | Benchmark | Primary claim | Runability | Adapter effort | Timeline |
|---|---|---|---|---|---|
| **A** | **BEAM** | I/P/B B-frames solve unsolved CR category | **Runnable now** — `pip install` + download script | Low — JSONL conversation → DatasetInstance | **Sprint 13, Phase 1** |
| **B** | **GAIA 2 / ARE** | I/P/B frames lift Ambiguity + Adaptability splits | Blocked — SIGALRM fix required | High — ARE adapter + contradiction gate | Sprint 14, Phase 1 after SIGALRM |
| **C** | **LongMemEval-V2** | Substrate advantage on web agent trajectory memory | Partially runnable — haystacks available, no public runner yet | Medium-high — trajectory Insert/Query API, multimodal, 25M+ token haystacks | Sprint 14–15, after BEAM |
| **D** | **Terminal-Bench 2.0** | Positioning floor for waggle on coding tasks | Submission-only | None — submit scaffold as-is | Anytime — submit existing agent |

**Execution priority:** A → B (parallel after SIGALRM fix) → C → D (asynchronous).

The central scientific claim across all tracks:
> **Substrate (I/P/B hive-mind) > subject model selection.**
> Demonstrated on memory recall (LoCoMo, done), contradiction resolution (BEAM, Track A),
> stateful task completion (GAIA 2, Track B), and trajectory experience memory (LME-V2, Track C).

---

## 2. Track A — BEAM

### 2.1 What BEAM actually is

**Paper:** "Beyond a Million Tokens: Benchmarking and Enhancing Long-Term Memory in LLMs"
(arXiv:2510.27246, ICLR 2026). Authors: Tavakoli, Salemi, Ye, Abdalla, Zamani, Mitchell.
**Repo:** https://github.com/mohammadtavakoli78/BEAM
**License:** Not explicitly stated on repo (academic use; no commercial restriction noted).
**Dataset:** 100 conversations × 4 context scales (128K / 500K / 1M / 10M tokens).
**Questions:** 2,000 probing questions across 10 memory ability categories.

### 2.2 BEAM categories and hive-mind relevance

| Category | Abbrev | Direct I/P/B relevance | Current SOTA status |
|---|---|---|---|
| **Contradiction Resolution** | CR | **Highest** — B-frames are designed for exactly this | **Unsolved** — worst-performing category across all tested models |
| **Knowledge Update** | KU | High — B-frames track fact revision | Moderate performance |
| **Instruction Following** | IF | High — P-frames record instructions; B-frames detect violations | Moderate |
| **Preference Following** | PF | Medium — I-frames track preferences | Moderate |
| Multi-Session Reasoning | MR | Medium | Moderate |
| Temporal Reasoning | TR | Low (same signal as LoCoMo negative control) | Moderate |
| Information Extraction | IE | Low | High |
| Event Ordering | EO | Low | Moderate |
| Abstention | ABS | Low | High |
| Summarization | SUM | Low | High |

**Primary focus for Track A:** CR + KU as confirmatory; IF + PF as secondary descriptive.
IE, EO, ABS, SUM as negative controls (hive-mind should not help here).

### 2.3 BEAM runability assessment

```bash
# Installation — no known blockers
git clone https://github.com/mohammadtavakoli78/BEAM
pip install -r requirements.txt

# Dataset download (pre-built, no generation needed for evaluation)
python src/beam/download_dataset.py
# → downloads to data/ directory; chat sizes 128K/500K/1M/10M

# Answer generation
EVAL_TYPE="rag"  # hive-mind cells use RAG eval type
bash src/model_inference/answer_generation.sh

# Evaluation
python -m src.evaluation.run_evaluation \
  --input_directory results/128K \
  --chat_size 128K \
  --start_index 0 --end_index 20 \
  --max_workers 4 \
  --allowed_result_files [cell_output_files]
```

**No SIGALRM issue. No Windows signal dependency. Python-native pipeline.**

LLM config: `src/llms_config.json` — add Qwen3.6-35B DashScope + Opus 4.x entries.
Judge: LLM-as-judge (configurable; use Llama-3.3-70B for leaderboard comparability).

### 2.4 Harness adapter for BEAM (Track A build tasks)

The waggle-os harness `DatasetInstance` schema maps cleanly:

| BEAM field | DatasetInstance field | Notes |
|---|---|---|
| conversation text (full) | `context` | Truncated per BEAM's chat_size (128K/500K/1M/10M) |
| probing question | `question` | One question per instance |
| reference answer | `expected[]` | BEAM uses nugget scoring; adapter extracts string answers |
| conversation_id | `conversation_id` | BEAM conversation index |
| memory_ability category | metadata only | Not in DatasetInstance schema; stored in output JSONL |

**`DatasetSpec.id`:** `'beam'` — add to the union in `types.ts` alongside existing `'locomo' | 'longmemeval' | 'synthetic'`.

**New build task B1:** `benchmarks/harness/scripts/build-beam-canonical.ts` — analogous to `build-locomo-canonical.ts`. Converts BEAM JSON format to JSONL with `DatasetInstance` schema. Emit one instance per (conversation_id × question) pair. Record SHA-256 of source download.

**New build task B2:** `benchmarks/harness/src/cells-beam.ts` — four cells for BEAM (no_memory_baseline, hive_mind_retrieval, hive_mind_ipb, hive_mind_ipb_strong). Identical architecture to GAIA 2 cells except:
- Input is a long conversation (not an ARE scenario)
- Output scoring uses BEAM's LLM judge, not ARE verifier
- No write-action oracle — BEAM is read-only (QA over memory)

**New build task B3:** BEAM judge integration — call `src/evaluation/run_evaluation.py` from the TypeScript harness via child_process, or replicate the judge logic in `judge-beam.ts` using the same Llama-3.3-70B soft judge as GAIA 2.

### 2.5 BEAM primary hypothesis

> **I/P/B-augmented hive-mind improves Contradiction Resolution (CR) score on BEAM
> vs. no-memory baseline by ≥ 8 percentage points, at α = 0.10 one-sided.**

**Scope:** 128K tier primary (all 20 conversations, CR + KU + IF questions only, N ≈ 200–300 questions depending on BEAM distribution).
**Extension:** 1M tier as secondary descriptive (hive-mind advantage should widen at scale).
**10M tier:** not in v8.1 scope (wall-clock cost + `:memory:` SQLite constraint at 10M tokens — requires chunked ingestion; deferred to v9).

**Secondary BEAM endpoints:**
- S_B1: KU monotonicity (no_memory ≤ hive_mind_retrieval ≤ hive_mind_ipb)
- S_B2: Negative control — IE, EO, SUM: hive_mind_ipb ≈ no_memory_baseline (≤ 3pp Δ)
- S_B3: Substrate-is-the-moat — Opus 4.x vs Qwen3.6 on hive_mind_ipb (CR category)

### 2.6 BEAM cells

| Cell | Substrate | Frame types |
|---|---|---|
| `no_memory_baseline` | none | none |
| `hive_mind_retrieval` | HybridSearch, I-frames only | I |
| `hive_mind_ipb` | Full substrate | I + P + B |
| `hive_mind_ipb_strong` | Full substrate | I + P + B |

**Note:** For BEAM, P-frames are written when the probing question is asked (recording the agent's retrieval intent). B-frames are written when retrieved content contradicts an earlier I-frame. The contradiction gate fires before answer generation (not before a write action, as in GAIA 2).

### 2.7 BEAM budget

| Component | Est. cost |
|---|---|
| N≈300 questions × 4 cells × 128K tier, Qwen3.6 | ~$8–12 |
| Opus 4.x cell (hive_mind_ipb_strong) | ~$15–20 |
| BEAM LLM judge (Llama-3.3-70B, N=1200 questions) | ~$3–5 |
| **Total expected** | **~$26–37** |

**Hard halt:** $50 for Track A.

---

## 3. Track B — GAIA 2 / ARE

No changes to v8.0.0 methodology. Full preregistration at
`benchmarks/preregistration/manifest-v8-gaia2-preregistration.md`.

**Status:** Blocked on SIGALRM fix. Track A (BEAM) runs first in Sprint 13.
GAIA 2 Phase 1 begins in Sprint 14 after:
1. SIGALRM resolution (WSL2 preferred)
2. BEAM Track A results available (inform whether I/P/B contradiction gate works as expected before building GAIA 2 adapter)

**Dependency:** Track A is the methodological pilot for the contradiction gate.
If B-frames don't lift CR on BEAM (Track A fails), revisit the gate design before
investing Sprint 14 effort in the GAIA 2 adapter.

---

## 4. Track C — LongMemEval-V2

### 4.1 What LME-V2 actually is

**Paper:** "LongMemEval-V2: Evaluating Long-Term Agent Memory on Web Agent Trajectories"
(arXiv:2605.12493, May 2026). Lead: Xiaowu Li (UCLA).
**Website:** https://xiaowu0162.github.io/longmemeval-v2/
**Questions:** 451 manually curated.
**Context scale:** 25M tokens (Small, 100 trajectories) / 115M tokens (Medium, 500 trajectories).
**Tiers:** LME-V2-Small (100-trajectory shared haystack) / LME-V2-Medium (500-trajectory question-specific).

**Critical distinction from V1:** LME-V2 is a **web agent experience memory** benchmark.
Memory haystacks are web browsing trajectories (screenshot + accessibility tree + BrowserGym action).
It is NOT a conversational memory benchmark. This is a fundamentally different evaluation surface.

**Five memory abilities in V2:**
1. **Static State Recall** — remember a fact from agent history (closest to LoCoMo V1)
2. **Dynamic State Tracking** — track evolving state across trajectory steps
3. **Workflow Knowledge** — remember procedural patterns from past agent sessions
4. **Environment Gotchas** — recall known failure modes in the current environment
5. **Premise Awareness** — detect that a question assumes something false about the environment

**hive-mind fit by category:**
- Dynamic State Tracking → **high** (P-frames record state before actions; B-frames track state changes)
- Environment Gotchas → **high** (I-frames accumulate error observations; B-frames flag recurrence)
- Premise Awareness → **medium** (B-frames can detect false premises if prior I-frames contain contradicting evidence)
- Static State Recall → low (same as LoCoMo; retrieval is sufficient)
- Workflow Knowledge → low (procedural; I-frame accumulation is sufficient)

### 4.2 LME-V2 runability assessment

**Current status: partially runnable.**
- Trajectory dataset: available via project website (haystacks can be downloaded)
- Evaluation harness: **no public runner released yet** as of 2026-06-04
- Paper uses Codex + GPT-5.4-mini as the evaluation agent
- AgentLab framework (ServiceNow): https://github.com/ServiceNow/AgentLab — provides the execution environment
- **The Insert/Query API is the evaluation interface**, not a CLI benchmark runner

**Adapter complexity:** High. Each trajectory contains screenshot + accessibility tree + BrowserGym action. Ingesting into hive-mind requires:
1. Stripping screenshots (or OCR-ing them) for I-frame text content
2. Treating each trajectory step as an I-frame with metadata (trajectory_id, step_index, action)
3. Implementing `Insert(trajectory)` and `Query(question)` over hive-mind's HybridSearch

**Recommendation:** Target **LME-V2-Small only** in v8.1. 100 trajectories per question, text-only (accessibility tree, no screenshots). Defer multimodal screenshots to v9.

### 4.3 LME-V2 preregistration (conditional)

**LME-V2 execution is GATED on Track A (BEAM) completion AND PM-RATIFY-V8C.**

Rationale: LME-V2 is a significant new adapter build (~comparable to GAIA 2). Running it before BEAM validates the I/P/B integration would be premature. PM ratification is required before Sprint 15 build allocation.

**Provisional primary hypothesis for LME-V2 (subject to PM ratification):**
> I/P/B-augmented hive-mind improves Dynamic State Tracking + Environment Gotchas
> on LME-V2-Small vs. no-memory baseline by ≥ 8 percentage points.

**Provisional cells:** identical to BEAM (4 cells). Reader model: Qwen3.5-9B per paper baseline.
**N:** 451 questions on Small tier (100-trajectory haystack).

**LME-V2 build tasks (pre-ratification design only):**
- C1: `benchmarks/longmemeval-v2/src/adapter.ts` — trajectory → I-frame ingestion (text-only, accessibility tree)
- C2: `benchmarks/longmemeval-v2/src/cells-lmev2.ts` — 4 cells implementing Insert/Query protocol
- C3: `benchmarks/longmemeval-v2/src/judge-lmev2.ts` — normalized string match (structured) + LLM judge (free-form)

### 4.4 LME-V2 budget (provisional)

| Component | Est. cost |
|---|---|
| N=451 × 4 cells × Qwen3.6 reader | ~$10–15 |
| Opus 4.x strong cell | ~$20–30 |
| LLM judge (GPT-5.2 medium per paper) | ~$5–10 |
| **Total expected** | **~$35–55** |

**Hard halt:** $65 for Track C.

---

## 5. Track D — Terminal-Bench 2.0

### 5.1 Status and rationale

Terminal-Bench 2.0 tests long-horizon agentic coding and system administration in
terminal environments. Waggle is not a coding system. This track is **positioning
data only** — it establishes waggle's floor on a broadly-followed leaderboard and
provides a signal about whether the general agent scaffold (not the memory substrate)
is competitive.

**Critical fact: Qwen3.6-35B via `little-coder` is already on the leaderboard at
entries #118 and #123 at 24.6% ± 3.2 and 23.0% respectively (submitted 2026-05-14).
This baseline exists.** No new run is required to have a data point.

### 5.2 What a waggle submission would add

The `little-coder` entries (#118/#123) use Qwen3.6-35B but no waggle scaffold and
no hive-mind. A waggle-scaffolded submission would test:
- Whether waggle's tool-calling loop (ReAct + Plan-Execute + Critic hybrid per v7 GEPA)
  outperforms a bare `little-coder` harness on terminal tasks
- Whether hive-mind memory helps on long-running tasks (task-state persistence)

**Expected result:** moderate improvement from waggle scaffold (architectural advantage);
small or zero improvement from hive-mind (terminal tasks are not memory-intensive in
the same way as LoCoMo/BEAM/GAIA 2).

### 5.3 Terminal-Bench 2.0 runability

**Submission-only via `harborframework/terminal-bench-2-leaderboard`.**
No public runner or local evaluation. Requires submitting agent code; Terminal-Bench
team runs the evaluation.

**Current leaderboard context (as of 2026-06-02):**
- Top: `vix` + Claude Opus 4.7 = 90.2%
- Claude Code + Claude Opus 4.6 = 58.0% (#52)
- `little-coder` + Qwen3.6-35B-A3B = 24.6% (#118) — our baseline
- Waggle scaffold target: ≥ 35% (matching Claude Opus 4.5 era baselines)

### 5.4 Terminal-Bench submission plan

**No preregistration required** — Terminal-Bench is positioning data, not a confirmatory
scientific claim. The submission is not governed by waggle-os preregistration policy.

**Execution:** submit to `harborframework/terminal-bench-2-leaderboard` after BEAM
Track A completion (Sprint 13 end). Use Qwen3.6-35B + waggle scaffold, no hive-mind
(isolate scaffold contribution). If scaffold submission scores ≥ 35%, add a second
submission with hive-mind to test the memory lift.

**No budget cap required** — Terminal-Bench evaluations run on their infrastructure.

---

## 6. Amended execution timeline

```
Sprint 13 (now)
├── Track A: BEAM Phase 1
│   ├── build-beam-canonical.ts (B1)
│   ├── cells-beam.ts (B2)
│   ├── judge-beam.ts (B3)
│   └── N≈300 × 4 cells execution (Qwen3.6 + Opus 4.x)
│
├── Track D: Terminal-Bench submission
│   └── Submit waggle scaffold (async, no gate)
│
Sprint 14
├── Track B: GAIA 2 Phase 1 (after SIGALRM fix + BEAM CR result validates gate)
│   ├── SIGALRM resolution (WSL2)
│   ├── ARE adapter (A1–A5)
│   └── N=500 × 4 cells execution
│
├── PM-RATIFY-V8C decision: proceed with LME-V2?
│
Sprint 15 (conditional)
└── Track C: LongMemEval-V2 (gated on PM-RATIFY-V8C)
    ├── Trajectory adapter (C1–C3)
    └── N=451 × 4 cells execution
```

---

## 7. Cross-benchmark claim architecture

The four tracks build a layered argument:

```
Layer 1 (DONE)     LoCoMo v5         → substrate > model on factoid recall
                                       Qwen 73.4% ≈ Opus 73.1% with hive-mind

Layer 2 (BEAM)     BEAM 128K CR/KU   → I/P/B B-frames solve unsolved CR category
                   [Track A]          → first published system to address the open problem

Layer 3 (GAIA 2)   ARE Ambiguity +   → I/P/B lift carries into stateful write-action environment
                   Adaptability       → substrate > model on interactive agent tasks
                   [Track B]

Layer 4 (LME-V2)   Web agent         → Dynamic State + Gotcha categories: P/B frames
                   trajectories       → track agent state and recurring failures
                   [Track C]

Positioning        Terminal-Bench    → waggle scaffold competitiveness floor
                   [Track D]
```

The claim stacks: each layer adds a new evaluation surface while reusing the same
architectural claim. The B-frame contradiction gate is the single mechanism tested
across BEAM (QA), GAIA 2 (write-action), and LME-V2 (trajectory).

---

## 8. Amended gates

### Gate A-P+ (Track A Phase 1 kick)
**Pre-kick checks:**
- BEAM dataset download complete and SHA-256 recorded
- `build-beam-canonical.ts` output validated (N instances ≥ 1,800 for 128K tier)
- `cells-beam.ts` dry-run passes (all 4 cells, 5-instance smoke)
- LiteLLM config includes Qwen3.6 DashScope + Llama-3.3-70B judge aliases
- hive-mind `:memory:` substrate liveness confirmed
- Budget envelope confirmed ($50 hard halt)

**Action:** kick N≈300 × 4 cells.

### Gate A-D (Track A post-run)
**Action:** CC writes `benchmarks/beam/results/v8a-gate-d-exit-report.md`.
**PM decides:**
1. Is the CR lift ≥ 8pp? If yes → proceed to GAIA 2 (B) and LME-V2 gate
2. Is the contradiction gate working? If no → redesign gate before GAIA 2
3. Terminal-Bench submission: submit waggle scaffold result

### Gate V8C-PM (Track C authorization)
Separate PM ratification required before LME-V2 build starts.

---

## 9. Budget summary

| Track | Hard halt | Expected burn |
|---|---|---|
| A — BEAM | $50 | $26–37 |
| B — GAIA 2 | $80 | $41–73 (per v8.0.0) |
| C — LME-V2 | $65 | $35–55 (provisional) |
| D — Terminal-Bench | $0 (external infra) | $0 |
| **Programme total** | **$195** | **$102–165** |

---

## 10. Scope boundaries (amended)

### Added at Gate A-D:
- BEAM CR + KU lift magnitude + significance (pre-registered cells + models, 128K tier)
- BEAM negative control result (IE, EO, SUM)
- Contradiction gate firing rate on BEAM conversations

### Added at Gate D (GAIA 2, per v8.0.0):
- Per v8.0.0 §12 (unchanged)

### Added at Gate C-D (LME-V2, conditional):
- Dynamic State Tracking + Environment Gotchas lift on LME-V2-Small
- Trajectory I-frame ingestion lift vs. no-memory baseline

### NOT claimable from Track D:
- Terminal-Bench results are NOT a preregistered claim; they are positioning data

### Cannot claim from any track:
- "Waggle OS beats [model X] on all benchmarks" — each track has specific splits and conditions
- Generalization beyond the preregistered cells and models

---

## 11. Related artefacts

- **v8.0.0 anchor:** `benchmarks/preregistration/manifest-v8-gaia2-preregistration.md`
  (commit SHA `a3ae4cada43c` / `51b6bcc9c39c`)
- **BEAM repo:** https://github.com/mohammadtavakoli78/BEAM (ICLR 2026)
- **LME-V2 paper:** https://arxiv.org/html/2605.12493v1 (May 2026)
- **Terminal-Bench 2.0 leaderboard:** https://www.tbench.ai/leaderboard/terminal-bench/2.0
- **`little-coder` baseline entries:** #118 (24.6% ± 3.2) and #123 (23.0%), submitted 2026-05-14
- **hive-mind LoCoMo v5 results:** `hive-mind/benchmarks/locomo/RESULTS.md`

---

_End of Manifest v8.1 amendment. v8.0.0 GAIA 2 methodology is unchanged._
_v8.1 governs Track A (BEAM) and Track C (LME-V2) preregistration._
_Track D (Terminal-Bench) is positioning data, not governed by preregistration policy._
