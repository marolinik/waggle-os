# Paper 2 — Closed-Loop Prompt Evolution: Can Smaller Models Match Flagships?

**Status:** CONCEPT — section skeleton + key claims. Full write-up after v2 experiment ($200 budget approved).
**Target:** arXiv cs.AI preprint → ICLR / NeurIPS workshop
**Authors:** Marko Markovic (Egzakta Group)
**Drafted:** 2026-04-15

---

## Thesis

A closed-loop prompt-evolution system — combining GEPA (Genetic-Pareto prompt optimization) with schema-level behavioral constraints — can produce prompts for smaller open-weight models (Gemma 4 31B) that match or exceed the performance of flagship commercial models (Opus 4.6) on domain-specific tasks, at 10-50x lower inference cost.

---

## Section Skeleton

### 1. Abstract (~250 words)
- Problem: organizations pay flagship-model prices for tasks where a tuned smaller model suffices
- Approach: closed-loop system that traces agent behavior → builds eval datasets → evolves prompts → gates deployments → deploys to production
- v1 result: 108.8% C/A ratio (Gemma 4 + evolved prompt vs raw Opus 4.6, n=10, 4 blind judges)
- v2 design: n=60, 3 domains, 4-judge multi-vendor pool, bootstrap CI, pre-committed negative-result publication
- **Placeholder:** insert v2 numbers after experiment

### 2. Introduction
- The cost problem: flagship models at $15-75/M tokens for tasks that don't require frontier reasoning
- The prompt-engineering bottleneck: human prompt engineers are expensive and iterate slowly
- Our approach: automated prompt evolution with production-grade safety gates
- **Key insight:** the evolution system runs on production traces, not synthetic data — the prompts are evolved against real user behavior

### 3. Background and Related Work
- **GEPA** (Agrawal et al., arXiv:2507.19457, ICLR 2026 Oral): Genetic-Pareto prompt evolution, beats RL (GRPO) by +6% avg / +20% max with ≤35x fewer rollouts, beats MIPROv2 by >10%. Integrated into DSPy 3.0.
- **ACE** (Zhang et al., arXiv:2510.04618, Stanford/SambaNova): Agentic Context Engineering — closest public analog to our EvolveSchema approach for behavioral-spec mutation
- **Reflection 70B** (Shumer, Sept 2024): cautionary tale — "small beats big" claims require extreme rigor
- **DSPy** (Khattab et al.): programmatic prompt optimization framework
- **TextGrad** (Yuksekgonul et al.): gradient-based prompt optimization
- Our positioning: we're not a prompt optimizer — we're a closed-loop production system that happens to use prompt evolution as one component

### 4. System Architecture
- **6-stage pipeline (ASCII diagram):**
  ```
  Traces → Dataset → Compose → Gates → Deploy → Monitor
           ↑                                    ↓
           └────────── Feedback Loop ───────────┘
  ```
- **TraceRecorder:** captures every agent turn (model, tokens, tools, human action)
- **EvalDatasetBuilder:** builds train/test splits from production traces
- **LLM-as-Judge:** multi-vendor blind judging with rubric
- **GEPA + EvolveSchema composition:** GEPA mutates the prompt, EvolveSchema mutates behavioral rules, feedback separation ensures they don't interfere
- **Constraint gates:** 4 categories (safety, quality, cost, behavioral) with configurable thresholds
- **Evolution deploy:** atomic persona override + behavioral-spec override with backup/rollback
- **Boot-time merge:** accepted overrides merge into active behavioral spec on server start

### 5. The Evolution Pipeline in Detail

#### 5.1 Trace Collection
- Automatic via `wireAgentLoopCallbacks` — every tool call, every model response
- Stored in `execution_traces` table with session scoping

#### 5.2 Dataset Construction
- Group traces by tool patterns (e.g., "save_memory → search_memory" sequences)
- Score by outcome quality (human approval rate, task completion)
- Split: 50/50 train/test with reproducible seed

#### 5.3 GEPA Iterative Evolution
- Population of prompt candidates
- Pareto frontier across objectives (quality, cost, length)
- Iteration cap: 500 iterations OR cost ceiling
- Early-abort: plateau detection (50 consecutive iterations below threshold)

#### 5.4 EvolveSchema Integration
- Behavioral-spec mutations: add/remove/modify rules
- Feedback separation: GEPA feedback on prompt quality vs EvolveSchema feedback on behavioral compliance
- Compose: merge prompt mutations and schema mutations into a single candidate

#### 5.5 Constraint Gates
- **Safety gate:** injection scan score must not degrade
- **Quality gate:** judge scores must meet minimum threshold
- **Cost gate:** token count must not exceed budget
- **Behavioral gate:** all critical behavioral rules must pass

#### 5.6 Deploy and Monitor
- Atomic file writes with backup/rollback
- Hot-reload via event emission (`behavioral-spec:reloaded`)
- Production monitoring via the same TraceRecorder

### 6. Experimental Design

#### 6.1 v1 (completed, preliminary)
- **Setup:** 10 coder questions, Gemma 4 31B + Waggle-evolved prompt vs raw Opus 4.6
- **Judges:** 4 blind judges (Opus, Sonnet, Haiku, GPT-4o)
- **Result:** C/A ratio 108.8% — evolved-Gemma beat raw-Opus on per-judge mean
- **Limitations:** n=10, one domain, eval=train, Opus-as-judge bias, no CI
- **Placeholder:** v1 results table

#### 6.2 v2 (designed, budget approved, not yet run)
- **Dataset:** 60 examples (30 train + 30 test), 3 domains (writer/analyst/researcher), 10 per domain per stratum
- **Arms:**
  - A: raw Opus 4.6 (flagship reference)
  - B: Gemma 4 + human-engineered prompt (100 tokens)
  - C: Gemma 4 + GEPA-evolved prompt (from training run)
- **Judges:** 4-judge multi-vendor pool:
  - Sonnet 4.6 (Anthropic)
  - Haiku 4.5 (Anthropic)
  - GPT-5 (OpenAI)
  - Gemini 2.5 Pro (Google)
- **Rotation:** each test example judged by all 4, randomized arm-letter assignment
- **Statistics:** bootstrap 95% CI + permutation test at alpha=0.05
- **Hypotheses:**
  - H1: C/A >= 0.95 for 2+ of 3 domains
  - H2: C/A >= 1.00 for 1+ domain (replicates v1 headline)
  - H3: C/A < 0.90 for 2+ domains → publish negative (pre-committed)
- **Budget:** $200 hard cap ($80 training + $80 evaluation + $40 buffer)
- **Placeholder:** v2 results table, per-domain breakdown, judge agreement, CI intervals

### 7. Results (TO BE COMPLETED)
- **Placeholder:** v2 primary results table
- **Placeholder:** per-domain breakdown
- **Placeholder:** inter-judge agreement (Krippendorff's alpha)
- **Placeholder:** bootstrap CI visualization
- **Placeholder:** training curve (score per iteration)
- **Placeholder:** prompt length analysis (tokens added vs quality gained)
- **Placeholder:** cost analysis (evolution cost vs inference savings)

### 8. Discussion
- What the results mean for the cost-quality tradeoff
- When evolution works (domain-specific, well-defined tasks) vs when it doesn't (open-ended reasoning)
- The role of judge diversity in credibility
- Production implications: how often to re-evolve, drift detection

### 9. Limitations
- v1 sample size (n=10) is underpowered
- Single-organization traces (Waggle users, not a general population)
- GEPA is domain-specific — global prompts may not generalize across all task families
- Judge-based evaluation inherits judge biases
- No human evaluation (judges are all LLMs)
- Evolution cost is amortized but non-trivial ($80-150 per run)

### 10. Reproducibility
- Split seed committed to repo
- GEPA config, judge prompts, dataset — all published
- Raw results JSON available
- Cost tracking via CostTracker

### 11. Conclusion
- Closed-loop evolution is a viable alternative to paying flagship prices
- The system is production-grade, not a research prototype
- Pre-committed negative-result publication builds trust

---

## Key Claims (must be defensible with data)

| # | Claim | Evidence needed | Status |
|---|-------|----------------|--------|
| 1 | Evolved Gemma 4 matches Opus 4.6 (C/A >= 0.95) | v2 experiment (30 test, 4 judges) | PLANNED |
| 2 | Evolution cost ($80-150) is amortized over thousands of inferences | Cost analysis | PLANNED |
| 3 | Multi-vendor judges agree on ranking (alpha > 0.6) | Inter-judge agreement stats | PLANNED |
| 4 | Constraint gates prevent quality regressions | Gate pass/fail rates from training | PLANNED |
| 5 | System handles negative results gracefully | Pre-committed H3 publication | DESIGNED |
| 6 | Evolution converges within 500 iterations | Training curve analysis | PLANNED |

---

## What Needs to Happen Before Full Write-Up

1. **Pre-flight checklist** — verify API keys for all 4 judges + Gemma endpoint
2. **Write-up skeleton** — abstract + methods with [X.X%] placeholders (this document)
3. **Run v2 training** — GEPA on 30 train examples ($80 budget)
4. **Run v2 evaluation** — 30 test x 3 arms x 4 judges ($80 budget)
5. **Statistical analysis** — bootstrap CI, permutation test, inter-judge agreement
6. **Fill in results** — tables, charts, per-domain breakdown
7. **External reviewer pass** — one ML peer reads methods + results
8. **Publish** — arXiv preprint + reproducibility repo
