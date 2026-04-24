# Manifest v5 — Task 2.5 Stage 3 N=400 Pre-Registration (RPM-Throttled)

**Manifest version:** v5.0.0-preregistration
**Manifest type:** `stage_3_n400_preregistration_v5_rpm_throttled`
**Preregistered date:** 2026-04-24
**Authority:** PM (Marko Marković) — P4 path (manifest v5 + concurrency=1) ratified 2026-04-24 on §1.3b IN_SCOPE verdict following §1.3 Gate P+ probe FAIL. Inherits §1.1 lock-semantics waiver + §1.2 RCA ratifications.
**Branch:** `feature/c3-v3-wrapper`
**Code freeze:** HEAD `373516c2784807da8536dbc0c194c54f4e4cd4be` (short `373516c`) — frozen EXCEPT the single §5.2 addendum edit to `litellm-config.yaml` permitted by Step 2 of the v5 emission path (see §0.5 Delta Log + §11).
**Supersedes:** Manifest v4 (anchor commit `dedd698`, obsoleted by this v5 emission after §1.3 probe FAIL revealed Google per-model 25-RPM preview cap on `gemini-3.1-pro-preview`). v4 pre-registration remains a predecessor audit artefact; v5 governs all Stage 3 re-kick forward.
**Inherits:** Bench-Spec LOCK v1 (`decisions/2026-04-22-bench-spec-locked.manifest.yaml`).
**Machine-readable twin:** [`manifest-v5-preregistration.yaml`](manifest-v5-preregistration.yaml)

---

## 0. Status

**PRE-REGISTERED — PENDING PM RATIFICATION OF v5 EMISSION.**

This document supersedes manifest v4 (anchor `dedd698`). v5's trigger and scope deltas are enumerated in §0.5 below. All other sections inherit v4 verbatim for tamper-evident standalone audit. Any change to v5's success criteria, statistical tests, sample design, or scope after v5's anchor commit invalidates the pre-registration and requires a new PM-ratified decision document (manifest v6+).

**Anchor commit SHA:** recorded in the git commit that adds these files.
**Manifest SHA-256 (MD + YAML bytes):** computed at anchor-commit time via
`sha256sum benchmarks/preregistration/manifest-v5-preregistration.{md,yaml}` — recorded
in the commit message body for tamper-evident audit trail.

---

## 0.5. v5 Delta Log (NEW — v5-specific)

### Trigger

**§1.3 Gate P+ pre-flight probe (anchor `66dcd5a`, 2026-04-24) empirical finding:** 24 / 50 HTTP 429 on `gemini-3.1-pro-preview` via LiteLLM alias, at a steady 1.67 RPS submission rate. Google 429 body (call 25) cites:

> `Quota exceeded for metric: generativelanguage.googleapis.com/generate_requests_per_model, limit: 25, model: gemini-3.1-pro`.

Root cause: Google PRODUCT POLICY — preview models have per-model sub-caps (here **25 RPM**) that do NOT scale with account billing tier. Tier 2's 1000 RPM (Egzakta billing ID 01DBA5-921E58-9DAF46) applies account-wide across models, not per model.

**§1.3b scope audit (anchor `69a14708`, 2026-04-24):** applying P2 (LiteLLM `rpm: 20`) inline to `litellm-config.yaml:361-364` (gemini-3.1-pro-preview alias block) is IN_SCOPE of manifest v4 §11 frozen paths list under both strict YAML and narrow MD readings. P2 terminally blocked; fallback to P4 per PM decision tree.

### Changes from v4

| # | Section | v4 | v5 |
|---|---------|-----|-----|
| §3 | Sample concurrency | `--parallel-concurrency 2`; three batches (cells 1+2, 3+4, 5) | **`--parallel-concurrency 1`; five sequential cell invocations (cells 1→2→3→4→5)** |
| §5.2 | Judge ensemble | triple with no rate limits in LiteLLM config | **addendum: `rpm: 20` on `gemini-3.1-pro-preview` alias** (the ONLY §11 exception in v5) |
| §8 §7.4 | Runner lock | `concurrent_runners: FORBIDDEN (cross-process)` per §1.1 waiver; intra-wrapper parallel allowed | **`concurrent_runners: SEQUENTIAL, parallel-concurrency=1`**; moot by sample-design change, but §1.1 cross-process waiver still applies at PID level |
| §11 | Code freeze | HEAD 373516c; no file modifications during run | **HEAD 373516c except the ONE permitted `litellm-config.yaml` §5.2 addendum** (`rpm: 20` on gemini-3.1-pro-preview alias). All other frozen paths from v4 unchanged. |
| §14 | Budget | $30 cap / $28 halt / ~$23 expected; wall-clock ~40-60 min (optimistic) | $30 cap / $28 halt / ~$23 expected UNCHANGED; wall-clock re-estimated under concurrency=1 (see §14) |

### UNCHANGED from v4 (verbatim inheritance)

**§1** primary hypothesis (Fisher one-sided p<0.10 on retrieval−no-context ≥ 5pp); **§2** secondary endpoints (S1–S5); **§4** dataset (LoCoMo 1531 instances, SHAs `79fa87e9…` + `39e415e2…`); **§6** substrate (HybridSearch conv-scope top-K=20, nomic-embed-text); **§7** SYSTEM_AGENTIC verbatim bytes (SHA-256 `6facae6d…`, 1467 bytes); **§9** post-hoc exclusion policy NONE; **§10** deviation policy (halt + restart-required); **§12** scope boundaries (claim/not-claim + SOTA composition reserved for PM); **§13** PM gates (Gate P + Gate D structure retained); **§15** related artefacts (predecessor).

### Parent chain

v4 predecessor pre-registration: anchor commit `dedd698`. v5 supersedes v4 for Stage 3 N=400 governance. v4's artefacts (probe FAIL at `66dcd5a`, scope audit at `69a14708`) inform v5 but do NOT re-pre-register.

---

## 1. Primary hypothesis (directional, confirmatory)

_Inherited verbatim from manifest v4 §1. No change._

> **Memory-lift at conv-scope retrieval exceeds zero-memory baseline.**
>
> `retrieval_judge_accuracy − no-context_judge_accuracy ≥ 5pp`
>
> evaluated at **Fisher exact one-sided** p-value **< 0.10**.

**One-sided justification:** theory-driven directional claim; ex-ante
scaffolding from Gate B whole-corpus-leak dry-run (8/20 other-conv leak)
+ Gate C monotonicity chain (no-context 0.10 < retrieval 0.35 < agentic
0.40 < oracle 0.55 at N=20).

**Failure mode:** <2% probability at N=400 given Gate C's +25pp effect
size (5× threshold). If primary fails despite coherent chain → PM
adjudication on power-vs-signal question.

---

## 2. Secondary endpoints (ex-ante, non-blocking on primary)

_Inherited verbatim from manifest v4 §2. No change._

| # | Endpoint | Direction | Threshold | Test |
|---|----------|-----------|-----------|------|
| S1 | no-context ≤ retrieval | positive | ≥ 0pp | Fisher one-sided p < 0.20 |
| S2 | retrieval ≤ agentic | positive | ≥ 0pp | Fisher one-sided p < 0.20 |
| S3 | agentic ≤ oracle-context | positive | ≥ 0pp | Fisher one-sided p < 0.20 |
| S4 | agentic − retrieval | positive | ≥ 0pp | descriptive + Wilson 95% CI |
| S5 | oracle-context − full-context | positive (expected) | descriptive | descriptive (SYSTEM_EVOLVED strict-abstain diagnostic) |

Bench-Spec LOCK v1 multi-comparisons policy: secondary = descriptive, no correction required.

---

## 3. Sample design — **CHANGED (concurrency 2 → 1)**

- **Cells:** five, run in a single invocation. Cell definitions unchanged from v4:
  1. `no-context` — true zero-memory baseline.
  2. `oracle-context` — PM-facing alias for harness `raw`.
  3. `full-context` — oracle + SYSTEM_EVOLVED strict-abstain.
  4. `retrieval` — conv-scope HybridSearch top-K=20.
  5. `agentic` — softened SYSTEM_AGENTIC + bound search_memory + forced-fallback.
- **N per cell:** 400 instances. **Unchanged.**
- **Total evaluations:** 5 × 400 = **2000 judge-scored evaluations**. **Unchanged.**
- **Instance selection seed:** `42`. **Unchanged.**
- **Instance pool:** canonical LoCoMo dataset (see §4). **Unchanged.**
- **Matched-pairs design:** same 400 instances flow through all cells. **Unchanged.**
- **Concurrency (CHANGED):** **`--parallel-concurrency 1`**. Five cells run
  sequentially (no intra-wrapper parallelism). Five serial batches of one
  cell each. No inter-cell overlap.
  - _Rationale:_ §1.3 Gate P+ empirical finding — Gemini per-model 25-RPM cap.
    Concurrency=1 halves peak Gemini RPS (ceiling ≈ 12 Gemini/min at steady
    rate), providing margin under the 20 RPM LiteLLM-side throttle (§5.2
    addendum) + the 25 RPM Google-side cap.
  - _Impact on runtime:_ ~2× wall-clock vs v4's concurrency=2 assumption
    (see §14).

---

## 4. Dataset

_Inherited verbatim from manifest v4 §4. No change._

- **Source:** `benchmarks/data/locomo10.json` (snap-research LoCoMo).
- **Upstream reference:** `https://raw.githubusercontent.com/snap-research/locomo/main/data/locomo10.json`.
- **Paper reference:** Maharana et al., ACL-2024.
- **Raw archive SHA-256:** `79fa87e90f04081343b8c8debecb80a9a6842b76a7aa537dc9fdf651ea698ff4`.
- **Canonical build:** `benchmarks/data/locomo/locomo-1540.jsonl` (1531 instances after canonicalisation).
- **Canonical dataset SHA-256:** `39e415e2f3a0fa1bd3cb1804a58d0b440b50d3070b2100698437e4ec402a5b24`.
- **Selection:** 400 per cell via seed-42 shuffle + take-first-400.

---

## 5. Model stack

### 5.1 Subject route table (Qwen 3.6-35B-A3B-Thinking)

_Inherited verbatim from manifest v4 §5.1. No change._

| Priority | alias | thinking | max_tokens |
|----------|-------|----------|------------|
| primary | `qwen3.6-35b-a3b-via-dashscope-direct` | `on` | 16000 |
| fallback_1 | `qwen3.6-35b-a3b-via-openrouter` | `on` | 64000 |
| fallback_2 | `NOT_AVAILABLE` | — | — |

Pricing $0.20 / $0.80 per M in/out. `floating_alias` pinning. B3 addendum § 5.

### 5.2 Judge ensemble — **CHANGED (rpm:20 addendum)**

| Slot | alias | role | rate-limit (v5 addendum) |
|------|-------|------|--------------------------|
| primary_judge_1 | `claude-opus-4-7` | primary | none (Anthropic immutable, no observed rate-limit pressure at Stage 3 scale) |
| primary_judge_2 | `gpt-5.4` | primary | none |
| primary_judge_3 | `gemini-3.1-pro-preview` | primary | **`rpm: 20`** (v5 addendum via litellm-config.yaml §5.2 edit) |
| tiebreak_reserve | `grok-4.20` | reserve (1/1/1 only) | none |

- **rpm: 20 addendum** is the single permitted §11 exception in v5. Applied to
  the `model_list` entry for `gemini-3.1-pro-preview` in `litellm-config.yaml`
  (Step 2 of the v5 emission path). Chosen 20 < 25 Google-side cap with a 5
  RPM margin for burst variance. Further throttle (rpm:15) reserved for PM
  adjudication if §1.3c throttle-verification probe FAILs at rpm:20.
- **Tie-break path:** 1/1/1 → Grok 4.20. 2/2 → PM escalation. Unchanged.
- **Consistency constraint:** same physical judge models as v4 / Stage 2-Retry.
  LiteLLM alias identifier unchanged (`gemini-3.1-pro-preview`); only the
  in-file rate-limit metadata added. Physical upstream model binding
  (`gemini/gemini-3.1-pro-preview` @ Google AI Studio) unchanged.
- **κ monitoring:** Fleiss' κ thresholds inherited from Bench-Spec LOCK v1
  (pass-no-flag ≥ 0.65; pass-with-flag [0.60, 0.65]; halt ≤ 0.60).

### 5.3 Health-check predicate

_Inherited verbatim from manifest v4 §5.3. No change._

---

## 6. Substrate (conv-scope retrieval)

_Inherited verbatim from manifest v4 §6. No change._

- `@waggle/core::HybridSearch` (RRF-fused FTS5 + vec0).
- `gopId = conversation_id` scope filter at `search.ts:14`.
- Top-K default 20; upper clamp 50.
- `createOllamaEmbedder()` + `nomic-embed-text` (1024 dims, local, $0).
- Ingest batch 200.

### 6.1 Agentic-cell tool binding

_Inherited verbatim from manifest v4 §6.1. No change._

`makeSearchMemoryTool(substrate, 20, instance.conversation_id)`. `maxTurns=3`.
180 s timeout. Forced-fallback on empty content + tool-use (0 firings at
Gate C; load-bearing insurance).

---

## 7. SYSTEM_AGENTIC prompt — verbatim bytes locked

_Inherited verbatim from manifest v4 §7. No change._

**SHA-256:** `6facae6decc44a6404290514accb4f7cb364081b32d02847a20f8e871633e328` (1467 bytes, no trailing newline). Source: `benchmarks/harness/src/cells.ts` lines 75–102. Softened text from Stage 2-Retry Gate A (commit `373516c`). See manifest v4 §7 for full verbatim reproduction.

---

## 8. Stopping rules — **§7.4 updated for concurrency=1**

| # | Rule | Source | Trigger | Action |
|---|------|--------|---------|--------|
| §7.1 | Budget hard halt | `runner.ts` | cumulative spend ≥ **$28.00** | halt, persist partial, exit ping |
| §7.2 | Streak halt | `streak-tracker.ts` | 3 consecutive subject fetch failures | halt, persist partial |
| §7.3 | Pre-cell health check fail | `health-check.ts` | 5xx / fetch-error on subject or judge probe | halt before cell |
| **§7.4 (v5)** | **Runner lock** | `runner-lock.ts` | concurrent cross-process invocation detected | halt. Under v5 concurrency=1 there is no intra-wrapper parallelism — the §1.1 cross-process-only waiver still governs, now with no exemption needed because no intra-wrapper spawning occurs. |
| §7.5 | Pre-registration deviation | this document | any change to §1–§9 during run | halt + PM raise |

**No interim looks.** Halt only on the five conditions above.

---

## 9. Post-hoc exclusion policy: **NONE**

_Inherited verbatim from manifest v4 §9. No change._

All 2000 evals enter the denominator. `evaluator_loss` (judge-triple
failure) counted in denominator, reported separately. No instance
whitelist/blacklist. Selective exclusion forbidden ex-ante.

---

## 10. Deviation policy

_Inherited verbatim from manifest v4 §10. No change._

Any deviation from §1–§9 during run → (1) immediate halt, (2) PM raise,
(3) re-pre-registration (manifest v6+) if accepted. Consistent with
Bench-Spec LOCK v1 `preregistration.mid_run_amendment_policy: halt_restart_required`.

---

## 11. Code freeze — **updated with single permitted exception**

The following code is **frozen at HEAD `373516c`** for the duration of
Stage 3 N=400 under v5. No changes permitted between v5 anchor commit
and Gate D exit **EXCEPT** the single §5.2 addendum edit to
`litellm-config.yaml` noted in §0.5 Delta Log and §5.2 (`rpm: 20` on
the `gemini-3.1-pro-preview` alias block).

Frozen paths (inherited verbatim from v4 §11):

- Cell semantics (`benchmarks/harness/src/cells.ts`).
- Substrate (`benchmarks/harness/src/substrate.ts`, `@waggle/core::HybridSearch`, `@waggle/core::FrameStore`, `@waggle/core::SessionStore`).
- SYSTEM_AGENTIC + SYSTEM_AGENTIC_FORCED_FALLBACK prompts.
- Agent loop (`@waggle/agent::runAgentLoop`, `@waggle/agent::tools.ts`).
- Judge ensemble + routing (`benchmarks/harness/src/judge-*.ts`, `config/models.json`, `litellm-config.yaml` judge aliases EXCEPT the single rpm:20 addendum).
- Subject route table (`config/models.json` qwen aliases).
- Test suite.

Execution-only delta during N=400 run: new JSONL files emitted to
`benchmarks/results/` AND the single pre-run `litellm-config.yaml`
§5.2 addendum committed before the run. No other file modifications
during or after run.

---

## 12. Scope boundaries

_Inherited verbatim from manifest v4 §12. No change._

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

## 13. PM gates

_Inherited verbatim from manifest v4 §13. No change._

### Gate P+ (v5 pre-run, pre-N=400 execution)
- Trigger: commit of v5 files + litellm-config.yaml §5.2 addendum on feature/c3-v3-wrapper.
- Halt: CC-1 stops; no N=400 kick without PM GO after §1.3c + §1.3e.
- PM checks: v5 content matches all prior ratifications; §1–§10 locked unambiguously.

### Gate D (post-run, pre-SOTA-claim)
- Trigger: N=400 exit (clean or halted per §8).
- Halt: CC-1 writes exit report at `PM-Waggle-OS/sessions/2026-04-24-task25-stage3-n400-complete.md`.
- PM decides SOTA claim composition / publish gate / further scope.

No self-advance at either gate.

---

## 14. Budget — envelope unchanged; wall-clock re-estimated

- **Cap:** $30.00. **Unchanged.**
- **Hard halt:** $28.00. **Unchanged.**
- **Expected burn:** ~$23. **Unchanged.**
- **Variance ceiling:** $28. **Unchanged.**
- **Cost breakdown:** same (Qwen ~$2.50, judge triple ~$20, ollama $0, Grok ~$0.50).

**Wall-clock re-estimate (v5-specific):**
- Under concurrency=1 + rpm:20 Gemini throttle, effective cell throughput
  is governed by the judge triple's slowest path. Gemini ≤ 20 RPM floor
  means ≤ 20 full triples/min (Opus + GPT + Gemini all complete).
- At 400 instances × 5 cells = 2000 evals / 20 RPM = **100 min minimum**
  sustained-rate floor for the Gemini leg. Realistic wall-clock includes
  subject call latency + Opus/GPT judge latency adding to the triple
  critical path.
- **Practical estimate:** 2–3 hours for the full N=400 run under v5.
- **Upper bound:** if judge latency variance pushes instances past their
  expected rate, halt §7.1 at $28 caps the downside independently of time.

---

## 15. Related artefacts

- **Manifest v4 predecessor:** anchor commit `dedd69888e008fb1584bc249aff43b19f55a88e5` (short `dedd698`).
- **§1.1 lock-semantics clarification (L-1 ratified):** anchor `67eb89914a49ec38049379bf952d5f62b82c188d` (short `67eb899`).
- **§1.2 runner early-exit RCA (Task 2.6 tech-debt ratified):** anchor `274e9871b54599077a3d72de88d505550803a805` (short `274e987`).
- **§1.3 Gate P+ probe FAIL:** anchor `66dcd5a1b18b9367662b04f1c9e1b66d855a9481` (short `66dcd5a`).
- **§1.3b litellm-config scope audit (IN_SCOPE verdict):** anchor `69a14708f78a74d2cb7ef07faf2d949f6ffc3209` (short `69a14708`).
- **Bench-Spec LOCK v1 parent:** `PM-Waggle-OS/decisions/2026-04-22-bench-spec-locked.manifest.yaml`.
- **Stage 2-Retry Gate C exit:** `PM-Waggle-OS/sessions/2026-04-24-task25-stage2-retry-complete.md`.
- **Stage 3 rekick brief (Option A / P4):** `PM-Waggle-OS/briefs/2026-04-24-cc-task25-stage3-rekick-option-a.md`.
- **Stage 3 brief (original):** `PM-Waggle-OS/briefs/2026-04-24-cc-task25-stage3-n400-kickoff.md`.
- **Rollback tag:** `checkpoint/pre-self-evolution-2026-04-14`.

---

_End of Manifest v5 pre-registration. This document is the anchor for all
analysis choices at Stage 3 Gate D exit under the P4 (concurrency=1 + rpm:20)
path._
