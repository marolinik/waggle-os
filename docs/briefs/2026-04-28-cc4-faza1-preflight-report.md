---
report_id: 2026-04-28-cc4-faza1-preflight-report
date: 2026-04-28
session: CC-4 (fresh)
mission: GEPA Tier 2 Prompt-Shapes Evolution Faza 1
predecessor_brief: briefs/2026-04-28-cc4-gepa-tier2-evolution-faza1-brief.md
status: HALT-AND-PM (3 critical, 2 minor ratifications required before NULL-baseline kick)
authority_required: PM (Marko Markovic) ratification on §6 ratification asks
---

# CC-4 Faza 1 — Pre-Flight Report

## TL;DR

Pre-flight checks executed per brief §6 (8 sub-rules). **6.8 PASS, 6.5/6.6/6.7 PASS-DESIGN-READY, 6.1/6.2/6.4 PARTIAL pending manifest v7 authoring, 6.3 FAIL-AMBIGUOUS — cannot proceed without PM disambiguation**. Three additional discoveries during scan also require PM ratification before NULL-baseline kick.

**Recommendation:** halt-and-PM at this checkpoint per brief §6.3 protocol. Five ratification asks below in §6. No additional code or runs prior to PM response.

---

## §1 — Repository topology resolved

| Repo | Role | Confirmed paths used |
|---|---|---|
| `D:\Projects\waggle-os` | Code, benchmarks, decisions, .mind/, prompt-shapes | manifest v6, Stage 3 results, pilot 2026-04-26 data, prompt-shapes |
| `D:\Projects\PM-Waggle-OS` | Briefs, PM coordination, sessions | brief, this report, decisions/2026-04-28-phase-4-3-rescore-delta-report.md |

**Cross-repo audit chain references in brief resolve to waggle-os**, despite harness CWD = PM-Waggle-OS. CC-4 session will operate in waggle-os for code/runs and PM-Waggle-OS for briefs/reports — same dual-repo workflow as recent CC-1 sessions per Phase 4.3 verdict doc.

## §2 — Brief vs reality discrepancies (factual)

### 2.1 — Path error in brief §2 + §8

Brief writes **`packages/core/src/prompt-shapes/`** as the GEPA evolution target. Actual location verified:

```
D:\Projects\waggle-os\packages\agent\src\prompt-shapes\
  ├── README.md (Phase 1.2 spec — empirical evidence_link rule)
  ├── claude.ts (4096 max_tokens, thinking on)
  ├── qwen-thinking.ts (16000 max_tokens, thinking on) ← H3 substrate target
  ├── qwen-non-thinking.ts (3000 max_tokens)
  ├── gpt.ts (4096 max_tokens)
  ├── generic-simple.ts (4096 max_tokens, fallback)
  ├── selector.ts (model-alias → shape resolution)
  ├── types.ts (PromptShape interface + MULTI_STEP_ACTION_CONTRACT)
  └── index.ts (re-exports)
```

`packages/core/src/` does NOT contain prompt-shapes (verified `ls`). Brief §2 + §8 should read `packages/agent/src/prompt-shapes/`. This is a typo, not a scope change.

### 2.2 — Brief assumes `feedback_config_inheritance_audit.md` exists; it doesn't

Brief §6 cites this file as the source of the 8 sub-rules and §11 cross-references it as `.auto-memory/feedback_config_inheritance_audit.md`. **No such file exists in either repo** (verified `find`). The 8 sub-rules ARE listed verbatim in brief §6 itself, so functionally the rules are accessible. CC-4 should author the missing memory file (rebuild from brief contents) so future sessions inherit the rules.

### 2.3 — `.auto-memory/` directory does not exist

Brief §8.5 specifies post-Checkpoint-C memory entry at `.auto-memory/project_gepa_faza1_results.md`. Directory absent in both repos. CC-4 will create when authoring memory entry post Checkpoint C (no PM action needed beyond knowing the path will be created).

## §3 — Pre-flight check results

### 3.1 — §6.1 Config inheritance audit: PARTIAL

Manifest v6 §5.2 + §5.4 explicitly specifies model strings + temperature 0.0 + max_tokens per judge:
- claude-opus-4-7: 1024
- gpt-5.4: 1024
- minimax-m27 / kimi-k26: 4096

Brief §3.1 mandates **max_tokens=3000 per Stage 3 v6 fix** for all judges in trio-strict scoring — **this conflicts with manifest v6 values** (1024 for Opus/GPT, 4096 for MiniMax). PM ratification needed on which max_tokens governs Faza 1 (manifest v6 inherited values vs brief override 3000).

Manifest v7 must explicitly redeclare these values + Qwen reasoning_effort + per-shape model parameters. Cannot inherit implicitly.

**Status:** READY-PENDING-PM-DECISION on max_tokens reconciliation.

### 3.2 — §6.2 Mixed-methodology baseline: READY

NULL-baseline run will report trio-strict + self-judge **separately** (not aggregate). Acceptance rule will cite trio-strict only. Compliant with rule.

### 3.3 — §6.3 Scope verification (H3 ≥40 instances): **FAIL — AMBIGUOUS**

This is the **critical halt trigger**. Two semantically distinct "H3 cell" interpretations:

| Interpretation | Source | Available instances | Phase 4.3 anchor compatibility |
|---|---|---|---|
| **A. Pilot synthesis "H3 hypothesis"** = Qwen solo on task-{1,2,3}/C | `benchmarks/results/pilot-2026-04-26/pilot-task-{1,2,3}-C.jsonl` | **3 instances total** | YES — directly maps to Phase 4.3 H3 verdict (66.7% T2) |
| **B. Stage 3 v6 LoCoMo "agentic cell"** | `benchmarks/results/agentic-locomo-2026-04-25T16-13-29-924Z.jsonl` | 400 instances | NO — Stage 3 v6 cells are no-context/oracle/full/retrieval/agentic; no "H3" label exists in v6 |
| **C. Hybrid: generate ≥40 new synthesis instances** | NEW corpus, same NorthLane/CFO task structure as pilot | 0 today; would need authoring | YES via stratified sampling |

Brief is internally inconsistent on this:
- §2 anchors to **Phase 4.3 verdict** → implies A
- §3.4 says "15 instances per cell sampled deterministic-stratified iz **LoCoMo full corpus**" → implies B
- §6.3 demands ≥40 instances → only B satisfies; A fails outright (3 << 40); C requires net-new corpus authoring

**Verdict:** brief §6.3 cannot pass with current corpus + Interpretation A. Brief §6.3 requires PM disambiguation before NULL-baseline kick.

### 3.4 — §6.4 Cell semantic preservation: DESIGN READY

Mutation validator will diff GEPA candidate vs baseline shape and reject if any of these change:
1. `MULTI_STEP_ACTION_CONTRACT` constant in `types.ts` (touched at all → INVALID)
2. `types.ts` interfaces (`PromptShape`, `PromptShapeMetadata`, `*Input`)
3. `selector.ts` (registry, resolution logic)
4. `index.ts` exports
5. Cell-level config in manifest v7 (cells_semantics block — locked from v6)
6. Shape file outside the 4 method bodies (`systemPrompt`, `soloUserPrompt`, `multiStepKickoffUserPrompt`, `retrievalInjectionUserPrompt`) — i.e. metadata block is also off-limits except `evidence_link` which MUST be updated to point to GEPA Gen 1 results

Allowed mutation surface = the 4 method bodies' string-building only.

### 3.5 — §6.5 σ-aware acceptance documented: READY

N=8 binomial CI = ±17pp at 95%. +5pp threshold = fitness signal indicator only, not statistically rigorous. Will be stated explicitly in launch decision §LOCK and Checkpoint C results memo.

### 3.6 — §6.6 Trio-strict primary: CONFIRMED

Acceptance §4 will cite trio-strict only. Self-judge supplementary diagnostic.

### 3.7 — §6.7 Cost super-linear projection: READY

Will use 1.5× baseline token count for cost projection. Mid-run threshold: halt if actual cost exceeds projection by >30%. Telemetry hook will fire at every 20 evaluations.

### 3.8 — §6.8 Source data structure (agentic spot-check): PASS

Verified `pilot-task-1-C.jsonl` and prompt archive. Confirmed:
- Task structure = persona (CFO of NorthLane B2B SaaS) + scenario (Q2-Q4 risk memo) + 7 source documents (P&L, pipeline, churn, eng velocity, marketing, board notes, competitor intel) + open-ended Likert-scored question
- Format = agentic knowledge work synthesis (NOT factoid LoCoMo Q&A)
- Output = ~5300-token CFO memo with structured action plans
- Judge dimensions: completeness, accuracy, synthesis, judgment, actionability, structure (6-dim Likert 1-5)
- Trio uses **trio_mean** (Likert) + **trio_strict_pass** (binary, threshold UNDOCUMENTED in pilot artifact — see §4 below)

PASS on agentic format. **Open question on metric definition** (§4).

## §4 — Additional discoveries requiring PM ratification

### 4.1 — Metric ambiguity: "trio-strict accuracy" on Likert tasks

Brief §3.1 says fitness = "trio-strict accuracy (Opus 4.7 + GPT-5.4 + MiniMax M2.7 ensemble, 2/3 must agree, max_tokens=3000)".

For LoCoMo binary correctness this is unambiguous (2 of 3 judges return correct=true → trio_strict).

For pilot synthesis Likert, "agreement" is undefined. Two operationalization candidates:
- **(i)** trio_strict_pass = ≥2 of 3 judge_means ≥ 4.0 (binary on per-judge mean)
- **(ii)** trio_strict_pass = trio_mean ≥ threshold T (single binary on aggregate; T = 4.0 candidate)

Pilot data already contains `trio_strict_pass` field (sample shows `true` for trio_mean=4.583 with judge_minimax failed). This implies operationalization (ii) with T probably = 4.0 (sample value 4.583 ≥ 4.0 = pass). **PM ratification needed on T value + which operationalization.**

### 4.2 — Canonical κ baseline (brief §4) source

Brief §4 condition 3: "Trio judge κ remains within ±0.05 of canonical 0.7878". 

Manifest v6 §5.4 specifies:
- pass_trio_kappa_gte: 0.70
- borderline: [0.60, 0.70]
- fail: <0.60

Stage 3 v6 N=400 final-memo or kappa-recal artifact may carry the actual measured value 0.7878 — need to verify source. Brief value 0.7878 is plausibly the Phase 1 κ re-cal result. **PM cite needed** so manifest v7 can pin the canonical reference + audit chain.

### 4.3 — Path correction authorization

Brief §2 + §8 reference `packages/core/src/prompt-shapes/`. Actual = `packages/agent/src/prompt-shapes/`. **Authorize CC-4 to use actual path in manifest v7 + decisions + GEPA outputs?** (Recommended: yes, treat as typo correction, no scope change.)

### 4.4 — feedback_config_inheritance_audit.md authorization

File missing. Should CC-4 reconstruct from brief §6 verbatim and persist at `.auto-memory/feedback_config_inheritance_audit.md` in waggle-os? (Recommended: yes, as audit infrastructure.)

### 4.5 — Substrate freeze verification

Brief §3.5: "GEPA radi nad post-Phase 4.6 HEAD". Manifest v6 §11 freezes HEAD at `373516c`. Phase 4.3 verdict cites HEAD `c9bda3d` (Phase 4.7). **Branch is feature/c3-v3-wrapper.**

CC-4 needs to verify current HEAD on this branch matches expectation (post-Phase-4.6, NOT post any Phase 5+ work). Quick check planned post-PM-ratify (single `git rev-parse HEAD` + `git log --oneline | head -5`).

## §5 — Pre-flight check matrix summary

| Check | ID | Status | Blocker? |
|---|---|---|---|
| Config inheritance | 6.1 | PARTIAL (max_tokens reconciliation needed) | NO (resolved in manifest v7) |
| Mixed-methodology baseline | 6.2 | READY | NO |
| **Scope verification (≥40 H3)** | **6.3** | **FAIL — AMBIGUOUS** | **YES** |
| Cell semantic preservation | 6.4 | DESIGN READY | NO |
| σ-aware acceptance | 6.5 | READY | NO |
| Trio-strict primary | 6.6 | CONFIRMED | NO |
| Cost super-linear | 6.7 | READY | NO |
| Source data agentic format | 6.8 | PASS | NO |

## §6 — Ratification asks (in order — A is critical path blocker)

| # | Ask | Recommended option | Blocks |
|---|---|---|---|
| **A** | Disambiguate "H3 cell" semantics | C: generate ≥40 new synthesis instances using NorthLane-style task family (preserves Phase 4.3 anchor + satisfies §6.3) — adds 2-3 hours pre-work + small subject-LLM cost (~$5) | NULL-baseline kick |
| **B** | Define `trio_strict_pass` operationalization for Likert synthesis | (ii) trio_mean ≥ T with T ratified explicitly (rec T=4.0 based on pilot sample) | NULL-baseline kick |
| **C** | Confirm canonical κ value 0.7878 source | Cite Stage 3 v6 Phase 1 κ re-cal artifact path or override with actual measured value | manifest v7 LOCK |
| **D** | Authorize path correction (`packages/core/` → `packages/agent/`) | YES (typo) | manifest v7 LOCK |
| **E** | Authorize `.auto-memory/feedback_config_inheritance_audit.md` reconstruction | YES (audit infra) | optional, not blocker |

If PM ratifies A as Option C (corpus expansion):
- Sub-ask: target N for new H3 corpus = 50? (8 NULL + 24 Gen 1 + 5 held-out + 13 buffer = 50, comfortable margin over §6.3 ≥40)
- Sub-ask: subject model for instance generation = Opus 4.7? (consistent with mutation oracle)
- Sub-ask: stratification axes (task type / persona / domain)? Recommended: 5 task families × 10 instances each, mirroring pilot's task-1/task-2/task-3 structure.

If PM ratifies A as Option B (LoCoMo agentic): Faza 1 disconnects from Phase 4.3 verdict; would need brief addendum reframing the rationale.

If PM ratifies A as Option A (proceed with 3 instances): would violate brief §6.3 — would need brief amendment relaxing the threshold for Faza 1 specifically. Not recommended.

## §7 — Cost & wall-clock impact of ratifications

| Option | Pre-work cost | Pre-work wall-clock | Faza 1 wall-clock impact |
|---|---|---|---|
| A: Option C corpus expansion | ~$5 (50 synthesis-task generations × Opus 4.7) | ~2-3h CC time | +1 day total |
| A: Option B LoCoMo pivot | $0 | 0 | -0.5 day (faster, 400 instances ready) |
| A: Option A relax threshold | $0 | 0 | 0 (immediate kick possible) |
| B+C+D+E | $0 | ~30 min CC time | 0 |

## §8 — Status post-ratification → next moves

Upon receiving PM ratification on asks A-E:
1. CC-4 executes corpus expansion (if Option C) — gated by ratification
2. CC-4 authors `manifest-v7-gepa-faza1.yaml` with explicit max_tokens reconciliation, κ baseline pin, path correction
3. CC-4 authors `decisions/2026-04-28-gepa-faza1-launch.md` (LOCK on session start) per brief §8.3
4. CC-4 reconstructs `feedback_config_inheritance_audit.md` (if E ratified)
5. CC-4 verifies substrate HEAD on feature/c3-v3-wrapper
6. CC-4 builds GEPA harness scaffold + tests (≥80% coverage)
7. CC-4 kicks NULL-baseline → Checkpoint A halt

No code authoring or LLM API calls before PM ratification.

---

## Audit chain

| Item | Value |
|---|---|
| Pre-flight session date | 2026-04-28 |
| Brief read | briefs/2026-04-28-cc4-gepa-tier2-evolution-faza1-brief.md (266 lines) |
| Phase 4.3 verdict read | decisions/2026-04-28-phase-4-3-rescore-delta-report.md (172 lines) |
| Stage 3 v6 5-cell summary read | benchmarks/results/stage3-n400-v6-final-5cell-summary.md (76 lines) |
| Manifest v6 read | benchmarks/preregistration/manifest-v6-preregistration.yaml (688 lines) |
| Prompt-shapes README + 5 shape files + selector + types read | packages/agent/src/prompt-shapes/ (verified inventory) |
| Pilot-2026-04-26 sample data + prompt archive read | pilot-task-1-C.jsonl + prompts-archive/task-1-cell-C-prompt.md |
| Pre-flight session cumulative cost | $0 (no LLM calls; only file reads) |

**End of pre-flight report. Standing AWAITING PM ratification on §6 asks A-E before proceeding to manifest v7 authoring + NULL-baseline kick.**
