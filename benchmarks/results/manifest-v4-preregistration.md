# Manifest v4 — Task 2.5 Stage 3 N=400 Pre-Registration

**Manifest version:** v4.0.0-preregistration
**Manifest type:** `stage_3_n400_preregistration`
**Preregistered date:** 2026-04-24
**Authority:** PM (Marko Marković) — Option 1 (N=400 direct escalate) ratified 2026-04-24 on Stage 2-Retry Gate C PARTIAL PASS exit.
**Branch:** `feature/c3-v3-wrapper`
**Code freeze:** HEAD `373516c2784807da8536dbc0c194c54f4e4cd4be` (short `373516c`)
**Supersedes:** Stage 2-Retry N=20 gate (see PM-Waggle-OS/sessions/2026-04-24-task25-stage2-retry-complete.md). Inherits Bench-Spec LOCK v1 (`decisions/2026-04-22-bench-spec-locked.manifest.yaml`).
**Machine-readable twin:** [`manifest-v4-preregistration.yaml`](manifest-v4-preregistration.yaml)

---

## 0. Status

**PRE-REGISTERED — PENDING PM GATE P RATIFICATION.**

This document is the ex-ante anchor for the Stage 3 N=400 LoCoMo run. It is
committed BEFORE the N=400 run starts. Any change to its success criteria,
statistical tests, sample design, or scope after the anchor commit invalidates
the pre-registration and requires a new PM-ratified decision document.

**Anchor commit SHA:** recorded in the git commit that adds these files.
**Manifest SHA-256 (YAML bytes):** computed at anchor-commit time via
`sha256sum benchmarks/results/manifest-v4-preregistration.yaml` — recorded
in the commit message body for tamper-evident audit trail.

---

## 1. Primary hypothesis (directional, confirmatory)

> **Memory-lift at conv-scope retrieval exceeds zero-memory baseline.**
>
> `retrieval_judge_accuracy − no-context_judge_accuracy ≥ 5pp`
>
> evaluated at **Fisher exact one-sided** p-value **< 0.10**.

**One-sided justification (locked ex-ante):** the directional claim is
theory-driven, not data-driven. Memory provides lift if the cognitive-layer
framing is correct; the task from the start was to measure the magnitude and
significance of that lift, not its direction. The ex-ante scaffolding that
justifies the directional framing is:
1. **Gate B dry-run evidence (Stage 2-Retry 2026-04-24):** whole-corpus search
   leaked 8/20 retrievals to other conversations for instance 0 of conv-26,
   while conv-scope search returned 20/20 from conv-26 with top-1 = exact
   evidence turn. The direction of effect was locked before any N=20 accuracy
   numbers existed.
2. **Gate C monotonicity (Stage 2-Retry 2026-04-24):** `no-context (0.10) <
   retrieval (0.35) < agentic (0.40) < oracle (0.55)` observed at N=20. The
   chain is directionally consistent; N=400 tests whether the +25pp
   retrieval − no-context gap is signal, not sampling artefact.

**Failure mode:** if primary endpoint fails (p ≥ 0.10) despite Gate C's
effect size and coherent chain, this is a power-vs-signal question requiring
PM adjudication — but PM pre-agrees this outcome has <2% probability given
N=400 power and the 5× effect-size overshoot at N=20.

---

## 2. Secondary endpoints (ex-ante, non-blocking on primary, all reported)

All secondary endpoints are **descriptive/diagnostic** per the Bench-Spec LOCK
v1 multiple-comparisons policy (`multiple_comparisons.full_declaration.
secondary_metrics_treatment: descriptive_no_correction_required`). No
correction required because only the primary is confirmatory.

| # | Endpoint | Direction | Threshold | Test |
|---|----------|-----------|-----------|------|
| S1 | Monotonicity chain: no-context ≤ retrieval | positive | ≥ 0pp | Fisher one-sided p < 0.20 |
| S2 | Monotonicity chain: retrieval ≤ agentic    | positive | ≥ 0pp | Fisher one-sided p < 0.20 |
| S3 | Monotonicity chain: agentic  ≤ oracle-context | positive | ≥ 0pp | Fisher one-sided p < 0.20 |
| S4 | Agentic lift over retrieval: agentic − retrieval | positive | ≥ 0pp | descriptive + 95% Wilson CI |
| S5 | Abstain penalty: oracle-context − full-context | positive (expected) | descriptive | descriptive — expected positive given SYSTEM_EVOLVED strict abstain; diagnostic only |

**Loose p < 0.20 on monotonicity pairs**: chosen to detect direction of effect
at N=400 power, not statistical significance. The monotonicity chain is
structural — if it breaks, something is wrong with cell design, not with the
memory-lift framework.

---

## 3. Sample design

- **Cells:** five, run in a single invocation.
  1. `no-context`      — true zero-memory baseline (NEW at Stage 2-Retry §1.1).
  2. `oracle-context`  — PM-facing alias for harness `raw` (oracle-fed on LoCoMo).
  3. `full-context`    — oracle context + SYSTEM_EVOLVED strict-abstain prompt.
  4. `retrieval`       — conv-scope HybridSearch top-K=20 (Stage 2-Retry §1.2).
  5. `agentic`         — softened SYSTEM_AGENTIC + bound search_memory tool
     (Stage 2-Retry §1.3 + §1.4 forced-answer fallback).
- **N per cell:** 400 instances.
- **Total evaluations:** 5 × 400 = **2000 judge-scored evaluations**.
- **Instance selection seed:** `42` (locked; matches Stage 1 / Stage 1.5 /
  Stage 2 / Stage 2-Retry precedent — no re-roll unless a structural bug
  surfaces and is documented in the deviation log).
- **Instance pool:** canonical LoCoMo dataset (see §4).
- **Matched-pairs design:** the same 400 instances flow through all five
  cells (harness `--limit 400 --seed 42` is deterministic across invocations).
- **Concurrency:** 2 cells in parallel per batch (`--parallel-concurrency 2`);
  three batches total (cells 1+2, then 3+4, then 5 alone). Matches
  Stage 2-Retry ratified config; no tuning for Stage 3.

---

## 4. Dataset

- **Source:** `benchmarks/data/locomo10.json` (snap-research LoCoMo).
- **Upstream reference:** `https://raw.githubusercontent.com/snap-research/locomo/main/data/locomo10.json`.
- **Paper reference:** Maharana et al., ACL-2024, "Evaluating Very Long-Term Conversational Memory of LLM Agents".
- **Raw archive SHA-256:** `79fa87e90f04081343b8c8debecb80a9a6842b76a7aa537dc9fdf651ea698ff4` (2,805,274 bytes).
- **Canonical build:** `benchmarks/data/locomo/locomo-1540.jsonl` (built via
  `scripts/build-locomo-canonical.ts`, deterministic UTF-8 no-BOM, LF line
  terminator, field-order locked, instance-id ascending sort).
- **Canonical dataset SHA-256:** `39e415e2f3a0fa1bd3cb1804a58d0b440b50d3070b2100698437e4ec402a5b24`.
- **Instance count:** 1531 (paper claims 1540; 9 instances dropped via
  canonicalisation — see `locomo-1540.meta.json` for `skip_stats`).
- **Category distribution:** single-hop 841, multi-hop 281, temporal 320,
  open-ended 89.
- **Selection:** 400 instances per cell drawn from the 1531-instance pool via
  seed-42 shuffle + take-first-400 (same 400 for every cell).

---

## 5. Model stack

### 5.1 Subject route table (Qwen 3.6-35B-A3B-Thinking)

| Priority | alias | route | thinking | max_tokens | provider |
|----------|-------|-------|----------|------------|----------|
| primary       | `qwen3.6-35b-a3b-via-dashscope-direct` | LiteLLM → DashScope-intl (`openai/qwen3.6-35b-a3b` @ `https://dashscope-intl.aliyuncs.com/compatible-mode/v1`) | `on` | 16000 | alibaba (TRUE 3.6) |
| fallback_1    | `qwen3.6-35b-a3b-via-openrouter`       | LiteLLM → OpenRouter bridge (`openrouter/qwen/qwen3.5-35b-a3b`) | `on` | 64000 | OpenRouter (known 3.5 regress — only used on primary network failure) |
| fallback_2    | `NOT_AVAILABLE`                        | — | — | — | no third fallback; halt on fallback_1 failure |

- **Pricing:** $0.20 / $0.80 per million input / output tokens (DashScope-intl rate card).
- **Pinning surface:** `floating_alias` on both (DashScope-intl + OpenRouter
  do not expose immutable snapshots). B3 addendum § 5 mandated.
- **B2 LOCK:** DashScope-intl route is the primary; OpenRouter route is a
  non-default fallback that triggers only on `fetch_error_*` from the primary.

### 5.2 Judge ensemble (tri-model majority vote with tie-break reserve)

| Slot | alias | role | route | provider | pinning | price in/out ($/M) |
|------|-------|------|-------|----------|---------|--------------------|
| primary_judge_1 | `claude-opus-4-7` | primary | Anthropic API direct via LiteLLM | anthropic | `anthropic_immutable` | 15.00 / 75.00 |
| primary_judge_2 | `gpt-5.4` | primary | LiteLLM local alias `openai/gpt-5.4` (Chat Completions) | openai_via_openrouter → direct OpenAI since Stage 2 mini | `floating_alias` | 10.00 / 30.00 |
| primary_judge_3 | `gemini-3.1-pro` | primary | LiteLLM local alias `gemini/gemini-3.1-pro-preview` (Google AI Studio direct) | google | `floating_alias` (-preview suffix) | 3.50 / 10.50 |
| tiebreak_reserve | `grok-4.20` | reserve (1/1/1 split only) | LiteLLM → OpenRouter → xAI | xai | `floating_alias` | 5.00 / 15.00 |

- **Tie-break path:** three-way 1/1/1 split → Grok 4.20 reserve (Sprint 11 B2 LOCK).
  2/2 split → PM escalation.
- **Consistency constraint:** same physical judge models as Stage 1 / Stage 1.5 /
  Stage 2 / Stage 2-Retry. No snapshot drift permitted during the N=400 run.
- **κ monitoring:** Fleiss' κ on the pre-tiebreak 3-judge vote matrix. Thresholds
  inherited from Bench-Spec LOCK v1: pass-no-flag ≥ 0.65, pass-with-flag
  [0.60, 0.65], halt ≤ 0.60.

### 5.3 Health-check predicate

`preCellHealthCheck` (`benchmarks/harness/src/health-check.ts`) probes:
1. `GET /health/liveliness` on the LiteLLM proxy (skippable).
2. `POST /v1/chat/completions` with a 5-token "pong" payload for each model
   in `[subject] ∪ judge_ensemble`. Probe `max_tokens=1024` to survive reasoning
   models. `temperature` omitted when `/opus-4-7|gpt-5|o3|o4/i` matches
   (mirrors `judge-client.ts:88`).

Any 5xx or fetch-error → halt before any eval fires.

---

## 6. Substrate (conv-scope retrieval)

- **Implementation:** `@waggle/core::HybridSearch` (RRF-fused FTS5 + vec0).
- **Ingest:** LoCoMo turns → `FrameStore` I-frames, keyed by `gop_id = <conversation_id>`.
- **Scope filter:** `HybridSearch.search(query, { limit, gopId: instance.conversation_id })`
  — scoped by the production `gopId` parameter plumbed at
  `packages/core/src/mind/search.ts:14` (`SearchOptions.gopId`). The benchmark
  re-uses the production code path with zero added surface area.
- **Top-K default:** 20 (Stage 2-Retry §1.2 bump from Stage 1 default of 10;
  upper clamp 50 for agent-requested wider recall).
- **Embedder:** `createOllamaEmbedder()` → `http://localhost:11434` with model
  `nomic-embed-text` (1024 dims, matches `VEC_TABLE_SQL`). Local inference; $0 cost.
- **Ingest batch size:** 200 frames per `indexFramesBatch` call (Stage 1.5
  defensive-coding addition — prevents vec0 transaction-size explosion on
  the 1531-instance corpus).

### 6.1 Agentic-cell tool binding (locked ex-ante)

- **Tool allowlist:** `[search_memory]` single-tool roster.
- **Tool binding:** `makeSearchMemoryTool(substrate, defaultLimit=20, boundToGopId=instance.conversation_id)`.
  The `gopId` binding is **non-overridable by the agent** — the tool does not
  expose a `gopId` parameter at call time. Per-conversation scope is a benchmark
  invariant, not an agent decision.
- **Hard turn cap:** 3. `agenticMaxTurns=3` in `CellInput`.
- **Timeout:** 180 s AbortController per inner agent-loop invocation.
- **Forced-answer fallback:** `SYSTEM_AGENTIC_FORCED_FALLBACK` fires when
  `resp.content.trim() === ''` AND `capturedToolResults.length > 0` after
  `runAgentLoop` exits. Fallback is a direct subject LLM call (no tools) with
  accumulated `search_memory` results in the user message. Stage 2-Retry
  Gate C observed 0/20 firings; retained as load-bearing insurance.

---

## 7. SYSTEM_AGENTIC prompt — verbatim bytes locked

**SHA-256 of verbatim bytes (after `.join('\n')`):**
`6facae6decc44a6404290514accb4f7cb364081b32d02847a20f8e871633e328` (1467 bytes, no trailing newline).

**Source of record:** `benchmarks/harness/src/cells.ts`, lines 75–102, export
`SYSTEM_AGENTIC` (the array literal joined with `\n`). Softened from the Stage 1
text (commit `c80a4a3`) per PM Stage 2-Retry Gate A ratification in commit
`373516c`.

**Changes vs Stage 1:** §1 MUST→SHOULD protocol verb, general-knowledge skip
exception; §3 "directly contain"→"contain" (inference tolerated); §5 "SHOULD
finish in 2"→"use your turns wisely"; §6 abstain threshold nominalized; §7
NEW tool-exhaustion fallback clause; closing paragraph allows general knowledge
alongside search_memory content.

**Verbatim text** (reproduced here for audit; canonical bytes live in
`cells.ts::SYSTEM_AGENTIC`):

```
You are a memory-grounded answering agent. Your job: answer a short
factoid question using content returned by the search_memory tool and
your reasoning over it.

Protocol (you SHOULD follow):
1. First turn: call search_memory with a focused query derived from the
   question, UNLESS the question is a simple factual lookup you can
   answer with high confidence from general knowledge and the answer
   does not require conversation-specific context. When uncertain,
   prefer the search_memory call.
2. After the tool returns, read the retrieved memories carefully.
3. If the retrieved memories contain the answer, respond with the
   shortest possible answer span — no sentences, no hedging, no preamble.
4. If the retrieved memories are ambiguous or incomplete, you MAY call
   search_memory ONE more time with a refined query (different wording,
   different entity, different time window). Then answer.
5. You have a hard cap of 3 total turns. Use your turns wisely.
6. If after reasonable search you believe the memory does not contain a
   supported answer, reply with exactly: unknown
7. If turn 3 arrives without a clear answer, commit to your best
   supported answer span using the context you have gathered across
   search calls. Do NOT leave the response empty.

Output format: plain answer span only. No JSON, no markdown, no
explanation. Never invent facts. Ground every factual claim in retrieved
context or clearly-established general knowledge.
```

---

## 8. Stopping rules (ex-ante, no interim looks)

| # | Rule | Source | Trigger | Action |
|---|------|--------|---------|--------|
| §7.1 | Budget hard halt | `benchmarks/harness/src/runner.ts` | cumulative spend ≥ **$28.00** (2pp below the $30 cap) | halt immediately, write partial JSONL, emit `budget_halt` exit ping |
| §7.2 | Streak halt | `benchmarks/harness/src/streak-tracker.ts` | 3 consecutive fetch failures on the same model | halt, persist partial JSONL |
| §7.3 | Pre-cell health check fail | `benchmarks/harness/src/health-check.ts` | any 5xx / fetch-error on subject or any judge probe | halt before cell fires |
| §7.4 | Runner lock contention | `benchmarks/harness/src/runner-lock.ts` | concurrent runner invocation detected | halt (`concurrent_runners: FORBIDDEN` is a Stage 1.5 commitment) |
| §7.5 | Pre-registration deviation | this document | any change to §1–§9 during run | halt immediately, PM raise |

**No interim looks policy:** the N=400 run is pre-registered; the runner does
NOT peek at partial results to selectively halt. Halt occurs only on the five
conditions above. "Does it look good yet?" is not a halt trigger.

---

## 9. Post-hoc exclusion policy: **NONE**

All 2000 evals that the pipeline emits enter the analysis denominator.

- **Judge failures:** if a row's three-judge ensemble fails to produce a
  majority verdict (e.g. all three return invalid JSON or all three time out),
  the row is counted as `evaluator_loss` and **reported separately** with its
  own count. **It is NOT excluded from the cell's denominator.** The cell
  accuracy is reported as `correct / (correct + incorrect + evaluator_loss)`
  with `evaluator_loss` surfaced explicitly.
- **Subject failures:** empty-content responses, timeouts, network errors all
  count toward the cell total and are classified as `failure_mode` per the
  F1–F6 + F_other taxonomy.
- **No whitelist / blacklist of instances:** the same 400 seed-42 instances
  flow through all cells. No instance is dropped based on its own behaviour
  or any cell's outcome.

**Rationale:** selective exclusion is the single largest source of inflated
significance in empirical ML benchmarks. By forbidding it ex-ante and reporting
`evaluator_loss` as a separate line item, we ensure the primary Fisher test
uses the true denominator.

---

## 10. Deviation policy

Any deviation from sections §1 through §9 during the N=400 run or the Gate D
analysis triggers:
1. **Immediate halt** of the run (or halt of analysis if deviation surfaces
   post-hoc).
2. **PM raise** with a deviation memo documenting what changed and why.
3. **Re-pre-registration** if the deviation is accepted — a new manifest v5
   (or revision) must be drafted, anchor-committed, and PM-ratified before
   any further N=400 execution.

This is consistent with Bench-Spec LOCK v1 `preregistration.mid_run_amendment_policy: halt_restart_required`.

---

## 11. Code freeze — non-scope assertions

The following code is **frozen at HEAD `373516c`** for the duration of Stage 3.
No changes permitted between anchor commit and Gate D exit:

- Cell semantics (`benchmarks/harness/src/cells.ts`).
- Substrate (`benchmarks/harness/src/substrate.ts`, `@waggle/core::HybridSearch`,
  `@waggle/core::FrameStore`, `@waggle/core::SessionStore`).
- SYSTEM_AGENTIC + SYSTEM_AGENTIC_FORCED_FALLBACK prompts (cells.ts).
- Agent loop (`@waggle/agent::runAgentLoop`, `@waggle/agent::tools.ts`).
- Judge ensemble + routing (`benchmarks/harness/src/judge-*.ts`, `config/models.json`,
  `litellm-config.yaml` judge aliases).
- Subject route table (`config/models.json` qwen aliases).
- Test suite (325/325 green across 29 files — see Stage 2-Retry Session 20 handoff).

Execution-only delta Stage 3 may introduce: **new JSONL files** emitted to
`benchmarks/results/` by the N=400 run. No other file modifications.

---

## 12. Scope boundaries — what this pre-registration DOES and DOES NOT claim

### Can claim at Gate D (if primary endpoint passes):
- Magnitude and significance of conv-scope retrieval memory-lift at
  `qwen3.6-35b-a3b` under the harness at HEAD `373516c`.
- Per-cell judge-accuracy point estimates with 95% Wilson CIs.
- Monotonicity chain observation across the 5-cell grid.
- Conv-scope fair-comparison methodology (retrieval + agentic use the
  instance's own conversation as the search corpus, not the whole 1531-instance
  pool — matches LoCoMo QA-pair locality).
- Agentic discipline numbers: search rate, turn distribution, unknown rate,
  forced-answer fallback firing rate.

### Cannot claim at Gate D:
- **Direct comparability to Mem0 91.6%.** Mem0's reported result uses
  whole-corpus search with a memory-synthesis layer, not conv-scope with
  RRF-retrieval. Scope-disclosure is required in any external statement.
  A matched-scope Mem0 co-run is a separate Stage 4 question.
- **Multi-model generalization.** Stage 3 is Qwen-only. Claims about
  "LLM-agnostic" memory lift require a multi-model run (`h42_full` in
  Bench-Spec LOCK v1).
- **Production performance claims.** Stage 3 runs the benchmark harness, not
  the production Waggle orchestrator end-to-end.

### Open questions reserved for PM at Gate D:
- Public-claim phrasing and venue (blog / paper / landing / none).
- Co-comparison with Mem0 at matched scope (requires separate run).
- Publication timing relative to Sprint 12 Task 2.6+ roadmap.

**CC-1 does NOT compose the public SOTA claim.** CC-1 delivers the scope
document + N=400 data that bounds what any claim can truthfully say.

---

## 13. PM gates

### Gate P (pre-run, pre-N=400 execution)
- **Trigger:** commit of this file + YAML twin on `feature/c3-v3-wrapper`.
- **Halt:** CC-1 stops immediately after commit; no N=400 kick without PM GO.
- **PM checks:** does the pre-registration content match all Stage 2-Retry
  Gate C ratifications? Are §1–§10 locked in a way that Gate D can be
  adjudicated unambiguously?
- **Outcome:** PM issues GO → §1.2 N=400 kickoff. Or PM requests revisions
  → Gate P loop.

### Gate D (post-run, pre-SOTA-claim)
- **Trigger:** N=400 run exit (clean completion or halted per §8).
- **Halt:** CC-1 writes Gate D exit report and stops.
- **PM checks:** primary-endpoint pass/fail, secondary-endpoint summary,
  deviation count, budget usage, evaluator-loss count.
- **Outcome:** PM decides (a) compose SOTA claim, (b) publish gate, (c) further
  scope work (matched-scope Mem0 co-run, multi-model expansion, etc.).

No self-advance at either gate.

---

## 14. Budget

- **Cap:** $30.00 (inherited from Stage 2-Retry +26.5× scale).
- **Hard halt:** $28.00 (2pp below cap, leaves room for in-flight judge calls).
- **Expected burn:** ~$23 (Stage 2-Retry Gate C $1.16 / 100 evals × 20 = $23.20).
- **Variance ceiling:** $28 covers reasoning-token variance on Qwen thinking=on
  tail latencies. If variance exceeds $28, halt rule §7.1 fires cleanly.
- **Cost breakdown expected:**
  - Subject (Qwen direct): ~$2.50 (subject evals across 5 cells × 400).
  - Judge triple (Opus + GPT-5.4 + Gemini): ~$20 (~6000 judge calls total).
  - Embedding (ollama local): $0.
  - Tie-break reserve (Grok): ~$0.50 (fires only on 1/1/1 splits).

---

## 15. Related artefacts

- **Bench-Spec LOCK v1 parent manifest:** `PM-Waggle-OS/decisions/2026-04-22-bench-spec-locked.manifest.yaml`.
- **Stage 2-Retry Gate C exit report:** `PM-Waggle-OS/sessions/2026-04-24-task25-stage2-retry-complete.md`.
- **Stage 3 brief:** `PM-Waggle-OS/briefs/2026-04-24-cc-task25-stage3-n400-kickoff.md`.
- **Stage 2-Retry §1 commit:** `373516c feat(benchmarks): Task 2.5 Stage 2-Retry §1 — five deliverables shipped`.
- **Rollback tag:** `checkpoint/pre-self-evolution-2026-04-14`.

---

_End of Manifest v4 pre-registration. This document is the anchor for all
analysis choices at Stage 3 Gate D exit._
