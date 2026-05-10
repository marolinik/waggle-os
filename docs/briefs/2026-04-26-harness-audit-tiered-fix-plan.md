# Harness Audit Tiered Fix Plan

**Date:** 2026-04-26
**Author:** PM
**Status:** Authored awaiting Marko ratification of Tier 1 launch (pre-launch ship)
**Sources:** `research/2026-04-26-harness-audit-comparative-analysis.md` + ChatGPT deep code-level analysis + PM pilot evidence (decisions/2026-04-26-pilot-verdict-FAIL.md)

**Decomposition principle:** ChatGPT analiza je dobra ali full-scope plan je 6-12 nedelja. Pre-launch ne čeka. Tier 1 = launch-friendly fix-evi (3-5 dana CC-1 work). Tier 2 = Sprint 12 post-launch re-pilot. Tier 3 = KVARK quarterly enterprise governance.

---

## TIER 1 — Pre-launch hardening (3-5 dana CC-1 work, $0 incremental, NOT launch-blocking)

### Goal

Make harness model-aware enough that Tier 2 re-pilot can isolate "harness design issue" from "model capability issue" without re-running pilot data collection.

### Scope (5 deliverables)

#### T1.1 — Output normalization layer

**File:** `benchmarks/harness/src/normalize.ts` (new) + integration into `cells.ts` scoring path

**Behavior:**
- Strip `<think>...</think>` blocks (Qwen reasoning leakage)
- Strip leading "Answer:" / "Response:" / "Final answer:" labels
- Trim whitespace + remove markdown fences
- Normalize "unknown" variants ("Unknown", "UNKNOWN", "unknown.", "N/A", "None") → "unknown"
- Remove copied metadata patterns ("[memory:synth]", "# Recalled Memories")
- Optional configurable: lowercase, strip trailing punctuation, remove articles
- Store both raw and normalized output + array of normalization actions applied

**Schema addition:**
```ts
interface HarnessPrediction {
  rawOutput: string;
  normalizedOutput: string;
  normalizationActions: string[];
  scoreRaw: number;
  scoreNormalized: number;
  exactMatchRaw: boolean;
  exactMatchNormalized: boolean;
}
```

**Acceptance:** unit tests covering Qwen `<think>` strip + abstention variant normalization + metadata copy removal. No silent over-normalization (configurable per benchmark).

#### T1.2 — Per-model prompt profiles

**File:** `benchmarks/harness/src/prompt-profiles.ts` (new) + cells.ts refactor to consume profiles

**Profiles to ship (3 minimum):**

**Claude/Anthropic profile:**
```
System: You are a knowledge work assistant. Read the provided context carefully and answer the question precisely. If the context does not contain the answer, reply with "unknown".

User: [memory or context block in markdown format]
[question]
```

**Qwen non-thinking profile:**
```
System: You are in direct answer mode. Do not output reasoning. Do not output <think> tags. Use the context only. Return exactly one short answer. If the answer is absent, return "unknown".

User:
CONTEXT:
{context}

QUESTION:
{question}

ANSWER:
```

**Generic-simple profile:**
```
System: Answer the question using the provided context.

User:
{context}

Question: {question}
```

**Profile selection:** model_id → profile mapping in config file (`benchmarks/harness/config/model-profiles.json`)

**Acceptance:** per-model profile applied automatically based on model alias. Profile override via CLI flag `--prompt-profile <name>`. Unit tests confirm correct profile selection.

#### T1.3 — Failure taxonomy classifier

**File:** `benchmarks/harness/src/failure-classify.ts` (new) + integration into report generation

**Categories (10):**
1. `correct_answer_with_extra_text` — answer present in output but with surrounding prose
2. `thinking_leakage` — `<think>` tags or visible reasoning in output
3. `unknown_false_negative` — model said "unknown" but ground truth is in context
4. `metadata_copy` — output contains `[memory:synth]`, `# Recalled Memories`, or other copied formatting
5. `format_violation` — output structure doesn't match expected (e.g., JSON when expected span)
6. `punctuation_or_case_only` — answer correct after punctuation/case normalization but failed raw
7. `wrong_span` — extracted wrong portion of context as answer
8. `wrong_entity` — confused entities (e.g., named one person, ground truth is another)
9. `hallucination` — answer not derivable from context
10. `retrieval_or_harness_error` — system-side failure (not model failure)

**Logic:** rule-based classifier + optional LLM-judge fallback for ambiguous cases. Each failed example tagged with most-applicable category.

**Acceptance:** unit tests covering ≥ 1 example per category. Per-cell + per-model failure distribution reported.

#### T1.4 — Per-cell + per-model report generation

**File:** `benchmarks/harness/src/report.ts` (new) + replaces existing minimal aggregation

**Output formats:**
- JSON: `benchmarks/results/<run-id>/summary.json` (machine-readable)
- Markdown: `benchmarks/results/<run-id>/summary.md` (human-readable)
- JSONL predictions: `benchmarks/results/<run-id>/predictions.jsonl`
- JSONL failures: `benchmarks/results/<run-id>/failures.jsonl`

**Required metrics per (model, cell):**
- accuracy / EM (raw + normalized)
- F1 (if applicable for benchmark)
- abstention rate ("unknown" outputs / total)
- thinking leakage rate (% outputs with `<think>` blocks pre-normalization)
- format violation rate (% outputs failing format check)
- average output length (raw + normalized)
- average latency
- failure category distribution (10-bucket histogram)
- win/loss vs raw baseline (if applicable)
- 95% confidence interval (bootstrap, if N ≥ 30)

**Required metrics per run (overall):**
- per-model best-cell ranking
- cross-model comparison matrix
- regression notes (Cell X improved/degraded vs baseline)

**Acceptance:** sample run on existing pilot JSONL (N=12) reproduces pilot summary numbers + adds normalization columns.

#### T1.5 — Run artifact persistence + reproducibility

**File:** `benchmarks/harness/src/run-meta.ts` (new) + emission hook in main runner

**Persisted per run:**
- run_id (timestamp + git SHA prefix)
- config snapshot (cells, prompts, judges, normalization settings)
- dataset hash (SHA256 of input jsonl)
- model versions + provider routing (e.g., "qwen3.6-35b-a3b@dashscope-direct, thinking=on")
- prompt profile names per model
- random seed
- git commit SHA at run time
- timestamp (UTC + local)
- normalization actions applied (per prediction)
- raw API responses (full, not just extracted answer)
- judge call traces

**Acceptance:** run reproduces given identical config + dataset + seed (deterministic for greedy decoding; bounded variance for sampling).

### Tier 1 effort + cost

- 3-5 dana CC-1 engineering work (single contributor)
- $0 incremental API spend (refactor + unit tests; minimal smoke testing)
- No re-pilot required; existing pilot data can be re-scored with new normalization layer to validate fix as proof-of-concept

### Tier 1 acceptance criteria

- [ ] All 5 deliverables (T1.1 - T1.5) shipped to main branch
- [ ] Unit tests passing
- [ ] Existing pilot JSONL (N=12) re-scored with normalization → produces report showing per-cell normalized vs raw scores + failure taxonomy distribution
- [ ] Documentation updates to README explaining new harness capabilities
- [ ] No regression to existing benchmark suite (LoCoMo Stage 3 v6 must reproduce 74% oracle ceiling with new harness)

---

## TIER 2 — Sprint 12 post-launch re-pilot (2-4 nedelje)

### Goal

Test whether Tier 1 harness fix + per-model evolved prompts close H3/H4 reversal observed in 2026-04-26 pilot. Re-pilot at N=20-30 first; full N=400 only if PASS.

### Scope (6 deliverables)

#### T2.1 — Per-model GEPA optimization

Run GEPA separately per target model:
- Claude Opus 4.7 → produces Claude-tuned evolved prompt
- Qwen 3.6 35B-A3B → produces Qwen-tuned evolved prompt (with non-thinking profile baseline)

Each evolved prompt tagged with `target_model_family` metadata. Evolution gates check that evolved prompt is not deployed to incompatible model family without explicit override.

#### T2.2 — Cross-model GEPA objective (alternative path)

Optional: single GEPA optimization with multi-model scoring objective:
```
score = α × claude_score + β × qwen_score - γ × variance_penalty
```

Where `variance_penalty` increases if one model improves while another regresses. Useful for "portable prompt" use case. Tag prompt as `cross_model_robust` if passes both per-model thresholds.

#### T2.3 — Robustness gates in evolution-gates.ts

Add new gate: `crossModelRegressionGate`. Reject candidate if any target model degrades > 2pp from baseline on golden test set, unless candidate explicitly tagged as model-specific.

Add gate: `formatLeakageGate`. Reject candidate if thinking_leakage_rate > 5% on Qwen-class models (or other reasoning-mode-emitting families) at evaluation time.

#### T2.4 — Holdout / golden / adversarial eval split

Restructure `eval-dataset.ts` to support 4-way split:
- train: trace-mined examples GEPA mutates against
- dev: GEPA selection signal
- holdout: final approval gate (never seen during evolution)
- golden: 5-10 critical tasks every candidate must pass

Adversarial subset (sub-set of golden):
- prompt injection attempts
- ambiguous abstention cases
- format trick cases (e.g., answer present but in non-canonical form)

#### T2.5 — Re-pilot N=20-30 with Tier 1 harness + Tier 2 GEPA outputs

Pre-registered manifest pilot-2026-05-XX-v1 (date TBD by Sprint 12 schedule):
- Same 3 task types (synthesis, coordination, decision support)
- 4 cells per task: Opus solo, Opus + harness (Claude-evolved prompt), Qwen solo, Qwen + harness (Qwen-evolved prompt)
- Trio-strict judge ensemble (κ recalibrate on 14-instance synthesis subset, ~$0.20)
- Pre-registered hypotheses identical to 2026-04-26 pilot:
  - H2: B - A ≥ +0.30 on ≥ 2/3 tasks
  - H3: D - C ≥ +0.30 on ≥ 2/3 tasks
  - H4: D ≥ A on ≥ 2/3 tasks
- Cost cap $20-30 (similar to original pilot envelope)
- Halt rules + amendment v2 wrapper inheritance preserved

#### T2.6 — Full N=400 multiplier benchmark (only if T2.5 PASS)

If T2.5 PASS, authorize full N=400 multiplier benchmark using the same Tier 1 harness + Tier 2 GEPA outputs at production scale.

Pre-registered manifest pilot-2026-05-XX-N400-v1.

Cost cap $80-150 (3 models × 4 cells × 400 instances + judge ensemble).

Output: paper-grade evidence for arxiv paper update (v2 of preprint or follow-up).

### Tier 2 effort + cost

- 2-4 nedelje engineering (Marko + 1 contributor + CC-1)
- ~$30 (re-pilot N=20-30) + ~$80-150 (full N=400 if authorized) = ~$110-180 total
- κ recalibration + adversarial test corpus authoring as one-time costs (minor)

### Tier 2 acceptance criteria

- [ ] All 6 deliverables (T2.1 - T2.6) shipped + tested
- [ ] Re-pilot N=20-30 H2/H3/H4 verdict ratified per pre-registration
- [ ] If PASS, full N=400 manifest authorized + executed
- [ ] arxiv paper §5.4 updated with Tier 2 evidence (v2 preprint update)

---

## TIER 3 — KVARK quarterly enterprise governance (multi-quarter, post-launch)

### Goal

Harden self-evolve from advanced prototype to governed agent improvement platform suitable for regulated enterprise deployment. Critical for KVARK enterprise sovereign GTM motion (locked post-launch sequencing per Decision Matrix Dimension 8).

### Scope (7 deliverables — high-level only; detailed brief authored at KVARK roadmap entry)

#### T3.1 — Security gates (prompt injection, data exfiltration, tool misuse, policy override)
#### T3.2 — Tool-call trajectory evaluation (not just text output)
#### T3.3 — Immutable policy layer (security/compliance/permission rules cannot be evolved)
#### T3.4 — Deployment lifecycle (proposed → reviewed → staged → canary → production → rollback)
#### T3.5 — Tenant isolation + EU AI Act Article 12 audit gates
#### T3.6 — Human-readable diff + rationale UI for evolution candidates
#### T3.7 — Production-grade research/staging/production mode separation

### Tier 3 effort + cost

- 1-2 quarters (multi-engineer)
- Significant engineering + design + QA + compliance review
- Detailed Tier 3 brief authored at KVARK roadmap entry, not now

### Tier 3 acceptance criteria

To be defined at Tier 3 brief authoring.

---

## CC-1 paste-ready brief (Tier 1 only)

For Marko to paste to CC-1 if Tier 1 ratified.

```
[PM-AUTHORIZE-TIER-1-HARNESS-FIX]

Tier 1 harness audit fix-evi authorized. 3-5 dana scope, $0 cost, NOT launch-blocking.

Source brief: D:\Projects\PM-Waggle-OS\briefs\2026-04-26-harness-audit-tiered-fix-plan.md (§Tier 1)
Comparative analysis: D:\Projects\PM-Waggle-OS\research\2026-04-26-harness-audit-comparative-analysis.md
Pilot evidence: D:\Projects\PM-Waggle-OS\decisions\2026-04-26-pilot-verdict-FAIL.md

Goal: make harness model-aware enough that Tier 2 re-pilot (Sprint 12 post-launch) can isolate "harness design issue" from "model capability issue" without re-running pilot data collection from scratch.

5 DELIVERABLES:

T1.1 — Output normalization layer
- New file: benchmarks/harness/src/normalize.ts
- Strip <think>...</think>, leading "Answer:" labels, markdown fences, copied metadata
- Normalize "unknown" variants
- Configurable per-benchmark (no silent over-normalization)
- Store raw + normalized + actions array
- Unit tests required

T1.2 — Per-model prompt profiles
- New file: benchmarks/harness/src/prompt-profiles.ts
- Config file: benchmarks/harness/config/model-profiles.json
- 3 profiles minimum:
  * Claude/Anthropic (existing strict-extraction style preserved as-is)
  * Qwen non-thinking (simple CONTEXT/QUESTION/ANSWER format, explicit no-reasoning instruction, no markdown metadata in memory format)
  * Generic-simple (minimal scaffolding, fallback for new models)
- Auto-selected by model alias; CLI override --prompt-profile <name>
- Refactor cells.ts to consume profiles instead of hardcoded prompts

T1.3 — Failure taxonomy classifier
- New file: benchmarks/harness/src/failure-classify.ts
- 10 categories: correct_answer_with_extra_text, thinking_leakage, unknown_false_negative, metadata_copy, format_violation, punctuation_or_case_only, wrong_span, wrong_entity, hallucination, retrieval_or_harness_error
- Rule-based classifier + optional LLM-judge fallback for ambiguous
- Per-cell + per-model failure distribution in reports

T1.4 — Per-cell + per-model report generation
- New file: benchmarks/harness/src/report.ts
- Outputs: summary.json + summary.md + predictions.jsonl + failures.jsonl
- Metrics per (model, cell): EM raw + normalized, F1, abstention rate, thinking leakage rate, format violation rate, avg output length, avg latency, failure category distribution, win/loss vs baseline, bootstrap CI if N≥30
- Cross-model comparison matrix
- Reproduces existing pilot summary on N=12 data when re-scored

T1.5 — Run artifact persistence + reproducibility
- New file: benchmarks/harness/src/run-meta.ts
- Per-run persistence: run_id, config snapshot, dataset SHA256, model versions, prompt profile names, seed, git SHA, timestamp, normalization actions per prediction, raw API responses, judge traces
- Deterministic reproduction for greedy decoding

ACCEPTANCE:
- All 5 deliverables shipped to main
- Unit tests passing
- Existing pilot JSONL (benchmarks/results/pilot-2026-04-26/) re-scored with new normalization → produces report showing per-cell normalized vs raw scores + failure taxonomy
- README updated explaining new harness capabilities
- Stage 3 v6 LoCoMo benchmark reproduces 74% oracle ceiling with refactored harness (no regression)

VALIDATION TASK:
After T1.1-T1.5 ship, re-score the existing 2026-04-26 pilot JSONL (12 cells × 3 judges = 36 records) using the new normalization layer and failure classifier. Output a delta report showing:
- Per-cell raw vs normalized score
- Failure category distribution per cell
- Specifically: how many of the 8 H2/H3/H4 FAIL cells (Tasks 2+3 H2, all Tasks H3, all Tasks H4) had:
  * thinking_leakage failures (would be removed by T1.1)
  * unknown_false_negative failures (would be flagged by T1.3)
  * metadata_copy failures (would be removed by T1.1)
  * format_violation failures (would be flagged by T1.3)

This delta report is the empirical evidence for whether Tier 1 harness fix substantively addresses pilot H3/H4 reversal — input for Sprint 12 Tier 2 re-pilot decision.

Cost ceiling: $0 incremental for T1.1-T1.5 implementation + unit tests. Re-scoring existing JSONL is local computation, no API calls. New API calls only if optional LLM-judge fallback in T1.3 is invoked on edge cases (cap at $5 for that path).

DELIVERY EXPECTATION:
- Day 1: T1.1 (normalization) + T1.3 (failure taxonomy) + unit tests
- Day 2: T1.2 (prompt profiles) + cells.ts refactor
- Day 3: T1.4 (report generation) + T1.5 (run artifacts)
- Day 4: Validation task — re-score pilot JSONL, produce delta report
- Day 5: Documentation updates + smoke test on Stage 3 v6 LoCoMo to confirm no regression

Halt-and-ping triggers:
- LoCoMo Stage 3 v6 76% → 74% reproduction shows >2pp regression with new harness (config issue; halt before main merge)
- Re-scored pilot deltas show Tier 1 fix-evi do NOT substantively change H3/H4 pattern (i.e., harness-Opus-bias hipoteza is partially refuted by Tier 1 alone, requires Tier 2 GEPA per-model variant); this is informational ne halt — flag for Sprint 12 brief authoring

Standing GREEN. Proceed with T1.1-T1.5. PM ratification of any architectural decisions surfaced during implementation requested via halt-and-ping.
```

---

## §Open questions for Marko

1. **Ship Tier 1 pre-launch?** PM rec: YES. Y/N
2. **Tier 1 timing — parallel with launch comms work, or before?** PM rec: parallel. Confirm or override.
3. **Tier 2 schedule — Sprint 12 (post-launch) or accelerate?** PM rec: Sprint 12. Confirm.
4. **Tier 3 — file as KVARK quarterly entry?** PM rec: yes, separate workstream from consumer Waggle launch. Confirm.
5. **Send paste-ready Tier 1 prompt to CC-1 now, or wait for additional ratification?** PM rec: send now if 1-4 ratified.
