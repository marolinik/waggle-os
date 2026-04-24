# Manifest v6 — Task 2.5 Stage 3 N=400 Pre-Registration (Judge Ensemble Swap)

**Manifest version:** v6.0.0-preregistration
**Manifest type:** `stage_3_n400_preregistration_v6_ensemble_swap`
**Preregistered date:** 2026-04-24
**Authority:** PM (Marko Marković) — §2.0 + §2.1 Phase 1 authorization 2026-04-24 on closure of the full §1.3f → §1.3h-C judge swap validation sequence. Inherits §1.1 lock-semantics waiver + §1.2 RCA + §1.3 throttle chain ratifications from v5.
**Branch:** `feature/c3-v3-wrapper`
**Code freeze:** HEAD `373516c2784807da8536dbc0c194c54f4e4cd4be` (short `373516c`) — frozen EXCEPT the v5 §5.2 Gemini `rpm:20` addendum (retained as audit artefact) and the v6 `litellm-config.yaml` supersession amendment committed separately as Phase 1 Commit 2 (adds `minimax-m27-via-openrouter` + `kimi-k26-direct` aliases).
**Supersedes:** Manifest v5 (anchor commit `fc16925`). v5 remains audit-immutable predecessor. v6 governs all Stage 3 N=400 re-kick from this commit forward.
**Inherits:** Bench-Spec LOCK v1 (`decisions/2026-04-22-bench-spec-locked.manifest.yaml`).
**Machine-readable twin:** [`manifest-v6-preregistration.yaml`](manifest-v6-preregistration.yaml)

---

## 0. Status

**PRE-REGISTERED — PHASE 1 KICK (κ RE-CAL + CONFIG AMENDMENT). PENDING PM RATIFICATION FOR PHASE 2 (N=400 EXECUTION).**

This document supersedes manifest v5 (anchor `fc16925`). v6's trigger and scope deltas are enumerated in §0.5 below. All other sections inherit v5 verbatim for tamper-evident standalone audit. Any change to v6's success criteria, statistical tests, sample design, or scope after v6's anchor commit invalidates the pre-registration and requires a new PM-ratified decision document (manifest v7+).

**Anchor commit SHA:** recorded in the git commit that adds these files.
**Manifest SHA-256 (MD + YAML bytes):** computed at anchor-commit time via
`sha256sum benchmarks/preregistration/manifest-v6-preregistration.{md,yaml}` — recorded in the commit message body for tamper-evident audit trail.

---

## 0.5. v6 Delta Log (NEW — v6-specific)

### Trigger

**§1.3f-§1.3h-C judge swap validation sequence (2026-04-24):**

Starting from v5's §1.3 Gate P+ probe FAIL + §1.3c throttle probe PASS + §1.3e RPD feasibility check INFEASIBLE@250 / FEASIBLE@2500, Stage 3 N=400 remained blocked by Google quota ceiling for `gemini-3.1-pro-preview`. PM approved two parallel paths: (A) Google quota relief ticket (unresolved; indefinite wait), (B) judge swap to a non-Google flagship reasoning model.

**§1.3f (anchor `8ad0567`, 2026-04-24):** Vertex AI Batch Prediction eligibility probe for `gemini-3.1-pro-preview`. Outcome: **INFEASIBLE**. Vertex v1beta does not list this preview model in the batch-eligible catalog; no publisher/model endpoint accepts batch ingestion. Branch A closed.

**§1.3g (anchor `8a2f0e6`, 2026-04-24):** 4-candidate judge swap κ probe (Kimi K2.6 + MiniMax M2.7 + DeepSeek V4 Pro + Zhipu GLM-5.1) on 20 stratified instances (first-4-per-cell from the 100-row v5 κ calibration set at `benchmarks/results/locomo-mini-n20-retry-2026-04-24T00-02-12Z.jsonl`). Outcome: **MULTI_PASS** with methodological caveat — κ=1.0 across all 4 on the unanimous-biased subset (0/20 Opus-GPT splits vs full-set 7% split rate). Operational ranking (Zhipu > DeepSeek > MiniMax > Kimi on speed × parse × direct) was heuristic only, not empirical κ discrimination.

**§1.3h (anchor `ae0d312`, 2026-04-24):** PM-adjudicated stratified discriminating re-probe on the 7 available Opus≠GPT split cases (PM-amended min 7 under §1.3H-POOL-SHORTAGE OPTION 1). Executed 28 calls (7 × 4 candidates) with MiniMax direct-first routing test. Outcome: **INCONCLUSIVE_BUT_OPERATIONAL_SIGNAL** — split-only κ structurally degenerate (all 7 splits Opus=correct / GPT=incorrect → reference column has no variance). Informative signal = correctness on oriented splits (agreement with verified-correct Opus reference):
- MiniMax: 6/7 = **86%** (best)
- Kimi: 4/5 = 80%
- DeepSeek: 2/5 = 40% (mis-calibrated)
- Zhipu: 0/6 = **0% — GPT-echo, DISQUALIFIED** (violates ensemble independence assumption)

MiniMax direct routing failed both `api.minimaxi.com` and `api.minimax.chat` v2 endpoints (MINIMAX_GROUP_ID did not unblock); OpenRouter fallback 7/7 parse.

**§1.3h-C (anchor `005a19a`, 2026-04-24):** DeepSeek `max_tokens` 1024→2048 bump verification on same 7-split sample. Outcome: **truncation_fixable_but_correctness_regressed** — parse 5/7 → 7/7 (truncation confirmed as root cause of NULLs), but correctness 40% → 14% (longer reasoning budget made DeepSeek more GPT-strict, moving further from verified-correct Opus reference). DeepSeek DISQUALIFIED on correctness grounds regardless of parse fix.

### Final ensemble selection ratified 2026-04-24

| Role | Model | Selection rationale | Routing |
|------|-------|----------------------|---------|
| primary_judge_1 | Claude Opus 4.7 | inherited from v5 (unchanged) | anthropic direct |
| primary_judge_2 | GPT-5.4 | inherited from v5 (unchanged) | openai direct |
| **primary_judge_3** | **MiniMax M2.7** | **86% correct on splits (best empirical fit), 100% parse via OR** | **openrouter (direct failed)** |
| **backup_judge** | **Kimi K2.6** | **80% correct on splits, per-instance failover on primary_judge_3 failure** | **moonshot direct** |

### Disqualified candidates (audit trail)

| Model | DQ reason | Evidence anchor |
|-------|-----------|------------------|
| Gemini 3.1 Pro Preview | Google per-model 25 RPM cap + Vertex batch INFEASIBLE | §1.3 `66dcd5a` + §1.3e `1d3851d` + §1.3f `8ad0567` |
| Zhipu GLM-5.1 | 100% GPT-echo on splits (p_opus=0%, p_gpt=100%) — violates ensemble independence | §1.3h `ae0d312` |
| DeepSeek V4-Pro | 14% correctness on splits at mt=2048 (regressed from 40% at mt=1024); GPT-alignment escalates with reasoning depth | §1.3h-C `005a19a` |

### Changes from v5

| # | Section | v5 | v6 |
|---|---------|-----|-----|
| §5.2 | Judge ensemble | Opus + GPT + Gemini-3.1-Pro-Preview primary; Grok-4.20 reserve (1/1/1 only) | **Opus + GPT + MiniMax-M2.7 primary; Kimi-K2.6 backup (per-instance failover)** |
| §5.2 | Tie-break policy | majority + Grok-4.20 on 1/1/1 split | **primary 3-judge majority; backup activates per-instance on MiniMax failure; three-way 1/1/1 → PM escalation (no reserve judge in v6)** |
| §5.2 | Rate-limit metadata | `rpm: 20` on `gemini-3.1-pro-preview` (v5 addendum) | **No active rpm:20 in judge path (Gemini alias retained but unused); MiniMax OR rpm + Kimi Moonshot rpm TBD at §1.3c-v6 probe time** |
| §11 | Code freeze `litellm-config.yaml` | Frozen except v5 §5.2 Gemini rpm:20 addendum | **v5 freeze superseded; v6 amendment adds `minimax-m27-via-openrouter` + `kimi-k26-direct` aliases + retains all v5 entries (Gemini alias with rpm:20 kept as orphan audit artefact). Post-amendment state pinned by v6 §11.** |
| §14 | Budget envelope | $30 cap / $28 halt / ~$23 expected | **$60 cap / $55 halt / ~$50 expected (Phase 1 κ re-cal ~$25 + Phase 2 N=400 ~$25; no preview-model premium)** |
| §0.5 | Delta log | v4→v5 trigger from §1.3 probe FAIL + §1.3b IN_SCOPE + naming reconciliation | **v5→v6 trigger from §1.3f → §1.3h-C sequence closure; MiniMax primary + Kimi backup selection rationale; Zhipu/DeepSeek DQ; κ re-cal methodology** |
| §13 | PM gates | Gate P+ (v5 pre-run) + Gate D (post-run) | **Gate P++ (v6 Phase 1: κ re-cal + config amendment) + Gate P+++ (v6 Phase 2 kick = PM-RATIFY-V6-KAPPA) + Gate D (post-run unchanged)** |

### UNCHANGED from v5 (verbatim inheritance)

- **§1** primary hypothesis (Fisher one-sided p<0.10 on retrieval − no-context ≥ 5pp)
- **§2** secondary endpoints (S1–S5)
- **§3** sample design (concurrency=1; five cells sequential; N=400 per cell; seed=42)
- **§4** dataset (LoCoMo 1531 instances, raw SHA `79fa87e9...`, canonical SHA `39e415e2...`)
- **§5.1** subject route table (Qwen 3.6-35B-A3B-Thinking, DashScope-intl direct primary, OR fallback)
- **§5.3** health-check predicate
- **§6** substrate (HybridSearch conv-scope top-K=20, nomic-embed-text)
- **§7** SYSTEM_AGENTIC verbatim bytes (SHA-256 `6facae6d...`, 1467 bytes)
- **§8** stopping rules (budget + streak + pre-cell health + §1.1 waiver + deviation)
- **§9** post-hoc exclusion policy NONE
- **§10** deviation policy (halt + restart-required)
- **§12** scope boundaries (claim/not-claim + SOTA composition reserved for PM)
- **§15** related artefacts (predecessor chain extended to include v6 ancestry)

### Parent chain (extended)

| Phase | Anchor | Note |
|-------|--------|------|
| v4 | `dedd698` | obsolete predecessor pre-reg |
| §1.1 lock waiver | `67eb899` | ratified |
| §1.2 RCA | `274e987` | ratified |
| §1.3 probe FAIL | `66dcd5a` | preview 25 RPM discovery |
| §1.3b scope audit | `69a14708` | IN_SCOPE verdict |
| v5 emission | `fc16925` | manifest-v5 anchor (throttle config) |
| §5.2 rpm:20 edit | `ad324cc` | v5 §11 exception |
| §1.3c throttle probe PASS | `3a146ef` | empirical verification |
| Fold-in 3.5b sibling mirror | `d0ab680` | defensive rpm:20 on sibling alias |
| §1.3e RPD feasibility | `1d3851d` | INFEASIBLE@250, FEASIBLE@2500 |
| §1.3f Vertex Batch | `8ad0567` | INFEASIBLE → Branch A closed |
| §1.3g Judge swap MULTI_PASS | `8a2f0e6` | 4-candidate κ=1.0 (unanimous-biased) |
| §1.3h Stratified re-probe | `ae0d312` | INCONCLUSIVE_BUT_OPERATIONAL_SIGNAL (bias exposed) |
| §1.3h-C DeepSeek mt bump | `005a19a` | truncation_fixable_but_correctness_regressed |
| **v6 emission** | **THIS COMMIT** | **manifest-v6 anchor** |

---

## 1. Primary hypothesis (directional, confirmatory)

_Inherited verbatim from manifest v5 §1 (which inherited verbatim from v4 §1). No change._

> **Memory-lift at conv-scope retrieval exceeds zero-memory baseline.**
>
> `retrieval_judge_accuracy − no-context_judge_accuracy ≥ 5pp`
>
> evaluated at **Fisher exact one-sided** p-value **< 0.10**.

**One-sided justification:** theory-driven directional claim; ex-ante scaffolding from Gate B whole-corpus-leak dry-run (8/20 other-conv leak) + Gate C monotonicity chain (no-context 0.10 < retrieval 0.35 < agentic 0.40 < oracle 0.55 at N=20).

**Failure mode:** <2% probability at N=400 given Gate C's +25pp effect size (5× threshold). If primary fails despite coherent chain → PM adjudication on power-vs-signal question.

---

## 2. Secondary endpoints (ex-ante, non-blocking on primary)

_Inherited verbatim from manifest v5 §2. No change._

| # | Endpoint | Direction | Threshold | Test |
|---|----------|-----------|-----------|------|
| S1 | no-context ≤ retrieval | positive | ≥ 0pp | Fisher one-sided p < 0.20 |
| S2 | retrieval ≤ agentic | positive | ≥ 0pp | Fisher one-sided p < 0.20 |
| S3 | agentic ≤ oracle-context | positive | ≥ 0pp | Fisher one-sided p < 0.20 |
| S4 | agentic − retrieval | positive | ≥ 0pp | descriptive + Wilson 95% CI |
| S5 | oracle-context − full-context | positive (expected) | descriptive | descriptive (SYSTEM_EVOLVED strict-abstain diagnostic) |

Bench-Spec LOCK v1 multi-comparisons policy: secondary = descriptive, no correction required.

---

## 3. Sample design

_Inherited verbatim from manifest v5 §3 (concurrency=1 retained). No change from v5._

- **Cells:** five, run in a single invocation. Definitions unchanged.
  1. `no-context` — true zero-memory baseline.
  2. `oracle-context` — PM-facing alias for harness `raw`.
  3. `full-context` — oracle + SYSTEM_EVOLVED strict-abstain.
  4. `retrieval` — conv-scope HybridSearch top-K=20.
  5. `agentic` — softened SYSTEM_AGENTIC + bound search_memory + forced-fallback.
- **N per cell:** 400.
- **Total evaluations:** 2000.
- **Instance selection seed:** `42`.
- **Matched-pairs design:** same 400 instances flow through all cells.
- **Concurrency:** `--parallel-concurrency 1`. Five cells sequential.

---

## 4. Dataset

_Inherited verbatim from manifest v5 §4. No change._

- **Source:** `benchmarks/data/locomo10.json` (snap-research LoCoMo).
- **Raw archive SHA-256:** `79fa87e90f04081343b8c8debecb80a9a6842b76a7aa537dc9fdf651ea698ff4`.
- **Canonical build:** `benchmarks/data/locomo/locomo-1540.jsonl` (1531 instances).
- **Canonical dataset SHA-256:** `39e415e2f3a0fa1bd3cb1804a58d0b440b50d3070b2100698437e4ec402a5b24`.
- **Selection:** 400 per cell via seed-42 shuffle + take-first-400.

---

## 5. Model stack

### 5.1 Subject route table (Qwen 3.6-35B-A3B-Thinking)

_Inherited verbatim from manifest v5 §5.1. No change._

| Priority | alias | thinking | max_tokens |
|----------|-------|----------|------------|
| primary | `qwen3.6-35b-a3b-via-dashscope-direct` | `on` | 16000 |
| fallback_1 | `qwen3.6-35b-a3b-via-openrouter` | `on` | 64000 |
| fallback_2 | `NOT_AVAILABLE` | — | — |

Pricing $0.20 / $0.80 per M in/out. `floating_alias` pinning. B3 addendum § 5.

### 5.2 Judge ensemble — **CHANGED (ensemble swap + backup policy)**

| Slot | alias (LiteLLM) | role | routing | rate-limit (v6) |
|------|------------------|------|---------|-------------------|
| primary_judge_1 | `claude-opus-4-7` | primary | anthropic direct | none (Anthropic immutable) |
| primary_judge_2 | `gpt-5.4` | primary | openai direct | none |
| **primary_judge_3** | **`minimax-m27-via-openrouter`** | **primary** | **openrouter (direct failed per §1.3h)** | **TBD at §1.3c-v6 probe time (OR tier-dependent; default 60 RPM if unspecified)** |
| **backup_judge** | **`kimi-k26-direct`** | **backup (per-instance failover)** | **moonshot direct api.moonshot.ai/v1** | **TBD at §1.3c-v6 probe time (Moonshot tier-dependent)** |
| ~~tiebreak_reserve~~ | ~~`grok-4.20`~~ | — (RETIRED in v6) | — | — |

**Backup activation policy (new in v6):**
- Primary judges (Opus + GPT + MiniMax) execute majority vote per instance.
- If MiniMax primary fails (API error / parse failure / 60s timeout / non-200 HTTP), Kimi K2.6 backup is activated **for that single instance only** (per-instance failover).
- If both MiniMax and Kimi fail for a single instance → `judge_ensemble_fail` marker; instance excluded from final analysis per post-hoc exclusion policy §9 (counted as `evaluator_loss` in denominator).
- Three-way 1/1/1 split on primary trio → PM escalation (no reserve judge in v6; Grok-4.20 retired from tie-break role).
- 2/2 defensive tie → PM escalation (unchanged from v5 policy).

**Consistency constraint:** One judge call per instance per primary judge; backup called only on primary_judge_3 failure. No prompt-level batching. Identical prompt template per `failure-mode-judge.ts:245-258` verbatim. Temperature=0.0. Matched max_tokens per model (MiniMax/Kimi: 4096 per §1.3h findings; Opus/GPT per v5).

**κ monitoring (κ re-cal phase, §5.4):** three pairwise Cohen's κ + conservative trio min. Thresholds from Bench-Spec LOCK v1 (pass ≥ 0.65; borderline 0.60-0.65; halt ≤ 0.60) retained. v6 κ re-cal success criterion ≥ 0.70 substantial agreement (tighter than operational halt threshold).

### 5.3 Health-check predicate

_Inherited from manifest v5 §5.3 (health-check.ts frozen), amended for new aliases._

Pre-cell health check must verify liveness on all v6 active aliases:
- `claude-opus-4-7` via `/v1/chat/completions` ping
- `gpt-5.4` via ping
- `minimax-m27-via-openrouter` via ping
- `kimi-k26-direct` via ping
- Subject aliases per v5

No code change to `health-check.ts` itself (retained as §11 frozen path); new aliases consumed via LiteLLM config lookup.

### 5.4 κ re-calibration methodology (NEW in v6 — Phase 1 gate)

Conducted at Phase 1 before any Stage 3 N=400 execution. Gates Phase 2 authorization.

**Sample:** full 100-instance κ calibration set from v5 at
`benchmarks/results/locomo-mini-n20-retry-2026-04-24T00-02-12Z.jsonl`
(same authoritative source used for §1.3h split analysis). Identical sample
→ new trio κ is directly comparable to v5's original κ=0.7458 three-way
baseline.

**Judge verdicts reused:**
- `claude-opus-4-7`: 100 existing verdicts from `judge_ensemble` field. Zero new calls.
- `gpt-5.4`: 100 existing verdicts from `judge_ensemble` field. Zero new calls.

**Judge verdicts new (Phase 1 execution):**
- `minimax-m27-via-openrouter`: 100 new calls, verbatim prompt from `failure-mode-judge.ts:245-258`, temperature=0.0, max_tokens=4096.

**Total new API calls at Phase 1: 100 (MiniMax only).**

**Computation (three pairwise Cohen's κ):**
- κ(Opus, GPT): should match v5's historical baseline (~0.74-0.82 range)
- κ(Opus, MiniMax): new measurement
- κ(GPT, MiniMax): new measurement

**Conservative trio κ = min(three pairwise κ values).**

**Also reported:**
- Raw agreement % per pair
- Confusion matrix per pair
- Per-cell breakdown (no-context / oracle-context / full-context / retrieval / agentic)

**Success criteria (v6 Phase 1 κ re-cal gate):**
- `κ_conservative_trio ≥ 0.70` → **PASS**, halt with `PM-RATIFY-V6-KAPPA` for Phase 2 authorization
- `0.60 ≤ κ_conservative_trio < 0.70` → **BORDERLINE**, halt with PM adjudication request
- `κ_conservative_trio < 0.60` → **FAIL**, halt with swap-path-re-evaluation request (may require Kimi promoted to primary or backup-judge strategy rework)

**Operational hedge:** during 100-call execution, log parse rate (target ≥95/100), latency p50 (target ≤25s) + p95, OpenRouter routing errors. If parse rate <90/100, halt before κ compute and raise PM flag.

---

## 6. Substrate (conv-scope retrieval)

_Inherited verbatim from manifest v5 §6. No change._

- `@waggle/core::HybridSearch` (RRF-fused FTS5 + vec0).
- `gopId = conversation_id` scope filter at `search.ts:14`.
- Top-K default 20; upper clamp 50.
- `createOllamaEmbedder()` + `nomic-embed-text` (1024 dims, local, $0).
- Ingest batch 200.

### 6.1 Agentic-cell tool binding

_Inherited verbatim from manifest v5 §6.1. No change._

`makeSearchMemoryTool(substrate, 20, instance.conversation_id)`. `maxTurns=3`. 180 s timeout. Forced-fallback on empty content + tool-use (0 firings at Gate C; load-bearing insurance).

---

## 7. SYSTEM_AGENTIC prompt — verbatim bytes locked

_Inherited verbatim from manifest v5 §7. No change._

**SHA-256:** `6facae6decc44a6404290514accb4f7cb364081b32d02847a20f8e871633e328` (1467 bytes, no trailing newline). Source: `benchmarks/harness/src/cells.ts` lines 75–102. Softened text from Stage 2-Retry Gate A (commit `373516c`).

---

## 8. Stopping rules

_Inherited verbatim from manifest v5 §8 (v5 §7.4 update under concurrency=1). No change._

| # | Rule | Source | Trigger | Action |
|---|------|--------|---------|--------|
| §7.1 | Budget hard halt | `runner.ts` | cumulative spend ≥ **$55.00** (v6 budget) | halt, persist partial, exit ping |
| §7.2 | Streak halt | `streak-tracker.ts` | 3 consecutive subject fetch failures | halt, persist partial |
| §7.3 | Pre-cell health check fail | `health-check.ts` | 5xx / fetch-error on subject or any judge probe | halt before cell |
| §7.4 | Runner lock | `runner-lock.ts` | concurrent cross-process invocation detected | halt (§1.1 waiver unchanged) |
| §7.5 | Pre-registration deviation | this document | any change to §1–§9 during run | halt + PM raise |

Note: v6 budget hard halt at $55 (was $28 in v5) reflects expanded envelope for κ re-cal + N=400 combined. See §14.

**No interim looks.** Halt only on the five conditions above.

---

## 9. Post-hoc exclusion policy: **NONE**

_Inherited verbatim from manifest v5 §9. No change. `judge_ensemble_fail` (from v6 §5.2 backup-failover failure) counts in denominator as `evaluator_loss`._

All 2000 evals enter the denominator. `evaluator_loss` (judge-triple failure, including MiniMax+Kimi both-failed failover) counted in denominator, reported separately. No instance whitelist/blacklist. Selective exclusion forbidden ex-ante.

---

## 10. Deviation policy

_Inherited verbatim from manifest v5 §10. No change._

Any deviation from §1–§9 during run → (1) immediate halt, (2) PM raise, (3) re-pre-registration (manifest v7+) if accepted.

---

## 11. Code freeze — **updated via v6 supersession of v5 §11**

The following code is **frozen at HEAD `373516c`** for the duration of Stage 3 N=400 under v6. v6 emits the single permitted amendment to `litellm-config.yaml` as Phase 1 Commit 2 (under v6 authority — explicit supersession of v5 §11 freeze per PM authorization 2026-04-24).

**v6 post-amendment state pinned:** `litellm-config.yaml` at Phase 1 Commit 2's tree state. The amendment adds `minimax-m27-via-openrouter` + `kimi-k26-direct` aliases. All v5 entries retained (including the Gemini `gemini-3.1-pro` alias with `rpm:20` — retained as orphan audit artefact; not routed in v6 judge ensemble).

Frozen paths (inherited from v5 §11, unchanged EXCEPT `litellm-config.yaml`):

- Cell semantics (`benchmarks/harness/src/cells.ts`).
- Substrate (`benchmarks/harness/src/substrate.ts`, `@waggle/core::HybridSearch`, `@waggle/core::FrameStore`, `@waggle/core::SessionStore`).
- SYSTEM_AGENTIC + SYSTEM_AGENTIC_FORCED_FALLBACK prompts.
- Agent loop (`@waggle/agent::runAgentLoop`, `@waggle/agent::tools.ts`).
- Judge ensemble + routing (`benchmarks/harness/src/judge-*.ts`, `benchmarks/harness/src/failure-mode-judge.ts`, `config/models.json`).
- Runner + health-check (`benchmarks/harness/src/runner.ts`, `benchmarks/harness/src/health-check.ts`, `benchmarks/harness/src/runner-lock.ts`, `benchmarks/harness/src/streak-tracker.ts`).
- Subject route table entries within `config/models.json`.
- Test suite.
- `litellm-config.yaml` pinned at **v6 Phase 1 Commit 2's tree state** (supersedes v5's pre-amendment pin).

Execution-only delta during N=400 run: new JSONL files emitted to `benchmarks/results/` (κ re-cal output goes to `benchmarks/calibration/v6-kappa-recal/`). No code file modifications during or after run.

---

## 12. Scope boundaries

_Inherited verbatim from manifest v5 §12. No change._

### Can claim at Gate D:
- Magnitude + significance of conv-scope retrieval memory-lift at Qwen-3.6-35b-a3b under HEAD 373516c.
- Per-cell judge-accuracy with Wilson 95% CIs.
- Monotonicity chain.
- Conv-scope fair-comparison methodology.
- Agentic discipline numbers.

### Cannot claim at Gate D:
- Direct comparability to Mem0 91.6% (different scope + memory-synthesis layer).
- Multi-model generalization (Qwen-only).
- Production performance.

### Reserved for PM:
- Public-claim phrasing + venue.
- Matched-scope Mem0 co-run.
- Publication timing.

**CC-1 does NOT compose public SOTA claim.** Scope + data only.

---

## 13. PM gates — **Gate P++ + Gate P+++ new; Gate D unchanged**

### Gate P++ (v6 Phase 1: κ re-cal + config amendment)

- Trigger: Phase 1 completion = v6 emission commit + `litellm-config.yaml` amendment commit + κ re-cal analysis commit on `feature/c3-v3-wrapper`.
- Halt: CC-1 stops; no Phase 2 N=400 kick without PM-RATIFY-V6-KAPPA.
- PM checks: v6 content matches brief §1–§5; κ_conservative_trio ≥ 0.70; MiniMax parse + latency + routing operational metrics acceptable.

### Gate P+++ (v6 Phase 2 kick = post-κ ratification)

- Trigger: PM-RATIFY-V6-KAPPA received after Phase 1 ratification.
- Action: CC-1 kicks N=400 execution via v5's `cli_invocation_template` patched for v6 aliases (`--judge-ensemble claude-opus-4-7,gpt-5.4,minimax-m27-via-openrouter --backup-judge kimi-k26-direct`).

### Gate D (post-run, pre-SOTA-claim)

- Trigger: N=400 run exit (clean or halted per §8).
- Action: CC-1 writes exit report at `PM-Waggle-OS/sessions/2026-04-24-task25-stage3-n400-complete.md`.
- PM decides SOTA claim composition / publish gate / further scope.

No self-advance at any gate.

---

## 14. Budget — **envelope expanded for Phase 1 + Phase 2**

- **v6 total cap:** $60.00 (v5: $30.00)
- **v6 total hard halt:** $55.00 (v5: $28.00)
- **v6 expected total burn:** ~$50.00 (v5: ~$23.00)
  - Phase 1 κ re-cal: ~$25 (100 MiniMax calls via OR @ $0.30 prompt + $1.20 completion per M; ~250K prompt tokens + ~50K completion tokens estimated → well under cap)
  - Phase 2 N=400: ~$25 (subject + 3 primary judges × 2000 evals; OR MiniMax pricing vs v5's Gemini preview premium delta)

- **Phase 1 cap:** $30 (brief §7)
- **Phase 1 halt:** $35

- **Phase 2 cap:** $30 (separate envelope; authorized by PM-RATIFY-V6-KAPPA + subsequent brief)

**Cost breakdown (expected, per phase):**
- Subject (Qwen DashScope-intl): ~$2.50 (Phase 2 only)
- Judge triple Opus+GPT+MiniMax: ~$22 (Phase 2)
- MiniMax κ re-cal: ~$2 (Phase 1)
- Kimi backup activations (per-instance failover, expected <5% trigger rate): ~$1 (Phase 2, variable)
- Ollama embedding local: $0

**Wall-clock estimate (Phase 2 N=400 unchanged from v5's 2-3 hour estimate);** Phase 1 κ re-cal ≤90 min per brief §7.

---

## 15. Related artefacts

### v6 ancestry
- **Manifest v5 predecessor:** anchor commit `fc16925` (audit-immutable).
- **§5.2 rpm:20 edit:** anchor `ad324cc` (v5 §11 exception, retained in v6 config).
- **§1.3c throttle probe PASS:** anchor `3a146ef`.
- **Fold-in 3.5b sibling mirror:** anchor `d0ab680`.
- **§1.3e RPD feasibility:** anchor `1d3851d`.
- **§1.3f Vertex Batch INFEASIBLE:** anchor `8ad0567`.
- **§1.3g Judge swap MULTI_PASS:** anchor `8a2f0e6`.
- **§1.3h Stratified re-probe:** anchor `ae0d312`.
- **§1.3h-C DeepSeek mt bump:** anchor `005a19a`.

### Inherited predecessors (unchanged)
- **Manifest v4:** anchor `dedd698` (obsolete).
- **§1.1 lock-semantics waiver:** anchor `67eb899`.
- **§1.2 runner RCA:** anchor `274e987`.
- **§1.3 Gate P+ probe FAIL:** anchor `66dcd5a`.
- **§1.3b scope audit:** anchor `69a14708`.
- **Bench-Spec LOCK v1 parent:** `PM-Waggle-OS/decisions/2026-04-22-bench-spec-locked.manifest.yaml`.
- **Stage 2-Retry Gate C exit:** `PM-Waggle-OS/sessions/2026-04-24-task25-stage2-retry-complete.md`.
- **Rollback tag:** `checkpoint/pre-self-evolution-2026-04-14`.

### v6-specific (this pre-registration)
- **v6 Phase 1 Commit 1 (manifest emission):** THIS COMMIT.
- **v6 Phase 1 Commit 2 (config amendment):** recorded at Commit 2 time.
- **v6 Phase 1 Commit 3 (κ re-cal artefacts):** recorded at Commit 3 time.
- **v6 brief:** `PM-Waggle-OS/briefs/2026-04-24-cc1-manifest-v6-phase1-kappa-recal-brief.md`.

---

_End of Manifest v6 pre-registration. This document is the anchor for all analysis choices at Stage 3 Gate D exit under the judge-ensemble-swap path. v5 remains audit-immutable predecessor._
