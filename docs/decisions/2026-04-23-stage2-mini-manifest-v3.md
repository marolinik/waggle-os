# C3 Stage 2 Mini Retry v3 — Per-Run Manifest (markdown twin)

**Manifest SHA-256:** `628e44734be8edcd1f900eb4d782d11d8c13a7aaf3c1763e360502d6aca80191`
**Manifest SHA-256 (short):** `628e44734be8`
**Machine-readable twin:** `decisions/2026-04-23-stage2-mini-manifest-v3.yaml`
**Parent bench-spec lock:** `decisions/2026-04-22-bench-spec-locked.md` (A3 LOCK v1)
**Supersedes v1:** `decisions/2026-04-23-stage2-mini-manifest.md` (aborted 2026-04-23T01:33Z)
**Datum:** 2026-04-23
**Sprint:** 12 · Task 2 · C3 Stage 2 Mini Retry v3
**Authority:** PM (Marko Marković), 2026-04-23 v3 brief + GATE-0 (Option 4) + GATE-1 ratifications
**Status:** LOCKED pending GATE-2 ratification. Any parameter change
requires HALT + new decision doc + new hash binding.

---

## 0. TL;DR

C3 Stage 2 mini retry v3 per-run manifest. Subject roster reduced from
3-provider to 2-provider per GATE-0 Option 4 (Ollama cloud 3.6 catalog
miss). Subject primary `qwen3.6-35b-a3b-via-dashscope-direct` chosen at
GATE-1 based on 3/3 Stage-1 smoke reliability + 5.5 s median latency
+ TRUE Qwen 3.6 routing. Judges direct via LiteLLM (Anthropic/OpenAI/
Google AI Studio). 4 cells × N=100 = 400 evaluations, seed 42, $250
hard cap, 300 s HTTP timeout, max_tokens=16000, parallel_concurrency=2.

---

## 1. Audit header — v3 decisions summary

### Stage 0 outcome (balance + alias verification)

- Docker Desktop daemon down at entry → Marko restored. LiteLLM
  container `Up` post-restart, `/health/liveliness` HTTP 200.
- All 6 provider keys present in container `.env`: ANTHROPIC, OPENAI,
  GEMINI, XAI, OPENROUTER, DASHSCOPE.
- 2 LiteLLM alias siblings added (commit `5ec069e`, pushed
  `origin/main`): `qwen3.6-35b-a3b-via-dashscope-direct` (rename
  sibling of `-via-dashscope`), `gemini-3.1-pro-preview` (rename
  sibling of `gemini-3.1-pro`). Zero upstream behavior change.
- 1 expected alias **NOT ADDED**: `qwen3.6-35b-a3b-via-ollama-cloud`.
  Ollama cloud does NOT publish Qwen 3.6 as of 2026-04-23 catalog
  check (`ollama.com/library/qwen3.6/tags`). 3.6 publishes only
  local-inference variants (`qwen3.6:35b-a3b`, `qwen3.6:35b-a3b-bf16`,
  `-mxfp8`, `-nvfp4`, `-mlx-bf16`, `-q4_`, `-q8_0`), no cloud-routed
  `:cloud` suffix tags. Cloud-routed variants exist only for Qwen 3.5
  family today. **Marko adjudicated GATE-0 Option 4: accept 2-route
  roster.** `subject_fallback_2: NOT_AVAILABLE`. **Sprint 13 revisit
  flagged** in the YAML (`subject_fallback_2_detail.revisit_sprint`)
  for re-check if Alibaba ships cloud-routed 3.6 in the meantime.

### Stage 1 binary smoke summary

6 calls, 2 providers × 3 samples, **total cost $0.0024**.

| Provider | N | OK | Median latency | Max latency | Reason chars median | Cost |
|----------|---|----|----------------|-------------|-----|-----|
| `qwen3.6-35b-a3b-via-dashscope-direct` | 3 | **3/3** | **5,528 ms** | 11,655 ms | 1971 | $0.0017 |
| `qwen3.6-35b-a3b-via-openrouter` | 3 | 2/3 | 3,353 ms (healthy only) | 4,008 ms (healthy only) | 1270 | $0.0007 |

One **HTTP 500 fast-fail** (58 ms) on `openrouter` route for
`locomo_conv-26_q059` — classic OpenRouter bridge transient flake.
Same class of upstream-flake as v1 run's tail-latency degradation that
triggered the abort. `dashscope-direct` zero failures in smoke.

Per-sample correctness:

- `locomo_conv-26_q059` (open-ended religiosity question):
  dashscope-direct `"Yes."` vs gold `"Somewhat, but not extremely
  religious"` → **content-match divergence** (see §1.5 below);
  openrouter HTTP 500 — no response to compare.
- `locomo_conv-50_q086` (factoid): both providers returned
  `"Skiing"` matching gold exactly.
- `locomo_conv-44_q000` (temporal factoid): both providers returned
  `"2020"` matching gold exactly.

### GATE-1 decision — primary provider pick

- **Primary:** `qwen3.6-35b-a3b-via-dashscope-direct` (TRUE Qwen 3.6,
  100% smoke reliability, 5.5 s median latency, 25× headroom vs
  300 s HTTP timeout)
- **Fallback_1:** `qwen3.6-35b-a3b-via-openrouter` (disclosed 3.5
  regression — OpenRouter does NOT carry 3.6-a3b slug; documented in
  YAML `subject_fallback_1_detail.regression_disclosure`)
- **Fallback_2:** `NOT_AVAILABLE` (GATE-0 Option 4 + Sprint 13 revisit)

### Ollama cloud Qwen 3.6 catalog miss — Sprint 13 revisit flag

- Verified 2026-04-23T02:00Z via `ollama.com/library/qwen3.6/tags`
  scrape (HTTP 200) and `ollama pull` attempts on `qwen3.6:cloud`,
  `qwen3.6-cloud`, `qwen3.6-35b-a3b:cloud`, `qwen3.6:35b-a3b-cloud`
  (all returned `Error: pull model manifest: file does not exist`).
- **Sprint 13 check-in:** re-probe the same catalog + try alternate
  vendor routes (Alibaba Model Studio cloud-api OR DeepInfra Qwen 3.6
  endpoints) to decide whether to re-introduce a third subject
  fallback. No commitment until Sprint 13 planning.

### Sample A open-ended content-match observation (non-blocking)

Stage-1 smoke revealed that the dashscope-direct subject produced
`"Yes."` for `locomo_conv-26_q059` ("Would Caroline be considered
religious?") whereas the gold answer is `"Somewhat, but not extremely
religious"`. This is a **content-quality divergence on open-ended
category questions, NOT a provider-reliability issue.**

- The cell-raw prompt template (`cells.ts::buildUserPromptRaw` +
  `SYSTEM_BASELINE`) optimizes for SHORT answers: `"You are
  answering a short factoid question. Give the shortest possible
  answer; no preamble."` — this pressure may cost nuance on
  open-ended categories.
- Stage-3 full-retry judge ensemble (Opus + GPT-5.4 + Gemini 3.1 Pro
  Preview) will score `"Yes."` against `"Somewhat, but not extremely"`
  and likely classify as F2-partial or F3-off-topic.
- **Flagged as Stage-3 post-run investigation item, NOT a blocker
  for GATE-2.** If the full-retry aggregate shows elevated
  F2-partial rate concentrated in LoCoMo's `open-ended` category,
  revisit the SYSTEM_BASELINE prompt's "shortest possible answer"
  framing in a separate Sprint 13 ticket. For now, run v3 on the
  same prompt template to preserve methodological continuity with
  v1 (prompts unchanged across runs; only subject routing + config
  changed).

### Judge ensemble direct routing (unchanged from v1)

- `claude-opus-4-7` → `anthropic/claude-opus-4-7` via
  `ANTHROPIC_API_KEY` (direct)
- `gpt-5.4` → `openai/gpt-5.4` via `OPENAI_API_KEY` (direct)
- `gemini-3.1-pro-preview` → `gemini/gemini-3.1-pro-preview` via
  `GEMINI_API_KEY` (Google AI Studio direct)

Pre-flight liveness per §4 at end of this document.

---

## 2. Field 7 — exact values (v3 brief §2.2)

```yaml
subject_model: qwen3.6-35b-a3b-via-dashscope-direct
subject_fallback_1: qwen3.6-35b-a3b-via-openrouter
subject_fallback_2: NOT_AVAILABLE
subject_thinking: on
subject_max_tokens: 16000
subject_http_timeout_ms: 300000
subject_parallel_concurrency: 2
subject_routing_path: alibaba-dashscope-direct
subject_quantization: FP16-cloud
judge_primary: claude-opus-4-7 (via-anthropic-direct)
judge_secondary: gpt-5.4 (via-openai-direct)
judge_tie_breaker: gemini-3.1-pro-preview (via-google-ai-studio-direct)
target_N: 400
cells: [raw, context, retrieval, agentic]
expected_budget_usd: 100-200
abort_triggers:
  - rolling_50_error_rate > 10%
  - cell_completion_p50 > 30min
  - total_spend > 325
```

### Pinning surface annotations

| Slot | Pinning surface | Carve-out reason |
|------|-----------------|------------------|
| subject_model (dashscope-direct) | `floating_alias` | DashScope-intl does not expose immutable model snapshots. Per B3 addendum § 5. |
| subject_fallback_1 (openrouter) | `floating_alias` | OpenRouter bridge to 3.5-a3b (not 3.6). Per B3 addendum § 5 + regression disclosure. |
| subject_fallback_2 | `n/a` | NOT_AVAILABLE. |
| judge_primary (Opus 4.7) | `anthropic_immutable` | Anthropic publishes dated snapshots; `claude-opus-4-7` is the plain family alias stable within release. |
| judge_secondary (GPT-5.4) | `floating_alias` | OpenAI does not expose immutable snapshots for gpt-5.x. Per B3 addendum § 5. |
| judge_tie_breaker (Gemini 3.1 Pro Preview) | `floating_alias` | Google ships the 3.1 Pro generation as `-preview` only; stability within release window, not across cycles. Replay-time re-verification required. Per B3 addendum § 5. |

---

## 3. Known scope-outs / audit notes

### 3.1 Cell vocabulary drift (v1 vs v3)

v3 brief specifies cells `[raw, context, retrieval, agentic]`; the
harness code in `benchmarks/harness/src/runner.ts` +
`benchmarks/harness/src/cells.ts` uses v1 vocabulary
`[raw, filtered, compressed, full-context]`. See YAML
`cells_audit_note` for the two resolution paths (patch the
runner's `CellName` union vs. runner invocation with documented
mapping v3→v1). **GATE-2 ratification should specify which path to
take for Stage 3 kickoff.**

Provisional semantic mapping for audit transparency:

| v3 brief name | v1 harness name       | Behaviour delta                                                |
|---------------|-----------------------|----------------------------------------------------------------|
| raw           | raw                   | 1:1 match — LLM only, no retrieval, no evolved prompt          |
| context       | full-context          | Context retrieval + evolved prompt. v3 `context` reads as      |
|               |                       | "include context in the prompt" — closest existing cell is     |
|               |                       | `full-context` (context + evolved system). May need rename to  |
|               |                       | just `context` if v3 intent is context-only (no evolved sys).  |
| retrieval     | filtered              | Memory-retrieval-like prompt, baseline system prompt.          |
| agentic       | compressed            | Evolved system prompt, raw context. v3 `agentic` may intend    |
|               |                       | multi-turn tool-use; if so, this mapping is incorrect and a    |
|               |                       | new cell type needs implementation (out of scope for v3 retry).|

### 3.2 Stage 3 runner invocation — script missing

v3 brief §3.2 invokes `npx tsx scripts/run-mini-locomo.ts` which does
NOT exist in the repo. Options (flagged for GATE-2):

1. **Create `scripts/run-mini-locomo.ts`** as a thin wrapper that
   reads the manifest YAML, applies the v3→v1 cell-name mapping, and
   shells out to `runner.ts`. Zero modifications to `runner.ts`.
2. **Invoke `benchmarks/harness/src/runner.ts` directly** with
   equivalent flags. Flag translation:

   | v3 brief flag                      | runner.ts equivalent                                  |
   |------------------------------------|--------------------------------------------------------|
   | `--manifest <path>`                | `--manifest-hash 628e44734be8...`                      |
   | `--subject <model>`                | `--model qwen3.6-35b-a3b-via-dashscope-direct`         |
   | `--judge-ensemble <list>`          | `--judge-ensemble claude-opus-4-7,gpt-5.4,gemini-3.1-pro-preview` |
   | `--N 100`                          | `--limit 100`                                          |
   | `--cells raw,context,retrieval,agentic` | `--all-cells` (mapped to v1 names; requires cells.ts patch) OR `--per-cell raw --per-cell filtered --per-cell compressed --per-cell full-context` |
   | `--parallel-concurrency 2`         | **NOT SUPPORTED** — runner.ts executes sequentially per cell iteration. Parallelism requires either a runner.ts patch or running multiple `runner.ts` processes concurrently and aggregating JSONL post-hoc. |
   | `--output <path>`                  | `--output <path>` (same; existing flag)                |

**Parallel-concurrency=2 is the material implementation gap.** At the
observed 5.5 s median × 400 evals + judges, sequential takes ~6–10 h
wall-clock. With concurrency=2 it drops to ~3–5 h wall-clock. Running
two concurrent runner.ts processes and merging JSONL post-hoc is the
low-risk substitute; patching runner.ts for in-process concurrency is
a non-trivial change to the request loop.

### 3.3 F6 / F_other live emission

Unchanged from v1 manifest. Judge response parser still targets
Sprint 9 5-value space. F6 and F_other will count as 0 in
`aggregate.failure_distribution.counts`. Distribution remains
structurally valid; review-flag gate OFF trivially. Activation
deferred to Task 2 Phase 2 rubric splice.

### 3.4 models.json provider-field union lag

Unchanged from v1 manifest. `ModelProvider` union doesn't have
direct-variant members; `gpt-5.4.provider` + `gemini-3.1-pro.provider`
remain `*_via_openrouter` labels for TS-compat even though runtime
routing is direct. Audit drift cosmetic; litellmModel + carve-out
reason fields are authoritative for replay.

---

## 4. Judge ensemble liveness — pre-flight pings (captured 2026-04-23T13:18Z)

Per v3 brief §2.4: 1 call × 3 judges × 5 output tokens each via
LiteLLM proxy `localhost:4000/chat/completions`.

| Judge alias                | Latency  | Response        | Notes                                                      |
|----------------------------|----------|-----------------|-------------------------------------------------------------|
| `claude-opus-4-7`          | 1,958 ms | `"pong"`        | Anthropic direct, clean                                     |
| `gpt-5.4`                  | 1,969 ms | `"pong"`        | OpenAI direct, clean                                        |
| `gemini-3.1-pro-preview`   | 7,825 ms | `"Pong"`        | Google AI Studio direct; initial 48-token cap produced empty content (27 reasoning_tokens ate the budget). Re-pinged with `max_tokens=256` → clean. Judge-client default `max_tokens=1024` has ample headroom — verified clean at 256 already. |

All three judges **LIVE**. Gemini reasoning-token behaviour documented;
no action required for Stage 3 (judge-client already passes 1024).

## 5. Pre-flight spend snapshot (captured 2026-04-23T13:20Z)

### OpenRouter

```json
{"data":{"total_credits":595,"total_usage":403.111112227}}
```

| Field              | Value                   |
|--------------------|-------------------------|
| total_credits      | 595.00 USD              |
| total_usage        | 403.11 USD              |
| effective_balance  | **191.89 USD**          |

Cumulative OpenRouter delta since the 2026-04-23T00:52Z v2 pre-run
snapshot ($196.68 balance): **−$4.79** (covers v2 partial run's
subject-Qwen-via-OpenRouter spend and Stage 1 smoke's openrouter-route
calls).

### DashScope-intl liveness

`GET https://dashscope-intl.aliyuncs.com/compatible-mode/v1/models`
with `DASHSCOPE_API_KEY`: HTTP 200, catalog includes
`qwen3.6-35b-a3b` and related Qwen 3.6 variants.
Balance endpoint requires POST with date range — not fetched;
operationally verified by successful smoke calls.

### Direct-provider judge spend (not centrally tracked)

Anthropic / OpenAI / Google AI Studio spending accrues on their
respective billing dashboards and is NOT visible from OpenRouter's
`/credits` endpoint. Harness-side cost accumulator (runner.ts
`--budget` enforcement + `judgeCosts[]`) is the in-run budget guard
and applies across all providers uniformly.

### Cumulative budget posture

| Line item                            | Spend            | Cumulative | vs $325 cap |
|--------------------------------------|------------------|------------|-------------|
| Pre-v3 setup (§2.1, §2.2, §2.3, §3.5) | ~$0.001          | $0.001     | 0.0003%     |
| v2 partial run (aborted 01:33Z)      | ~$4.79 (OR side) + ~$3 (judges, estimated direct-provider side) = ~$7.79 | $7.79 | 2.40%       |
| v3 Stage 0 (Docker/alias audit)      | ~$0.001          | $7.79      | 2.40%       |
| v3 Stage 1 (binary smoke, 6 calls)   | $0.0024          | $7.79      | 2.40%       |
| v3 Stage 2 (this manifest, 4 pings)  | ~$0.0005         | $7.80      | 2.40%       |
| v3 Stage 3 expected                  | $100–$200        | $107–$208  | 33–64%      |
| **Hard abort**                       |                  |            | **$325**    |

**Headroom to hard abort: $317. Ample.** Expected Stage-3 spend sits
well inside the cap with >50% margin for retry/reasoning-tail cases.

---

## 7. Related

- `briefs/2026-04-23-cc-sprint-12-task2-c3-mini-kickoff.md` — v1+v2
  parent brief
- `decisions/2026-04-22-bench-spec-locked.md` — A3 LOCK v1 parent
- `decisions/2026-04-23-jsonl-record-taxonomy-split-locked.md` —
  §2.1 Opcija C LOCK
- `decisions/2026-04-23-stage2-mini-manifest.md` — v1 manifest
  (superseded by this doc)
- `decisions/2026-04-23-stage2-mini-manifest.manifest.yaml` — v1 YAML
  twin (superseded)
- `sessions/2026-04-23-c3-retry-prerun-balance.md` — Stage 0 record
- `sessions/2026-04-23-binary-subject-smoke.md` — Stage 1 smoke report
- `sessions/2026-04-23-c3-blocked-litellm-unhealthy.md` — first Docker
  block (precedent)
- `sessions/2026-04-23-litellm-config-audit.md` — §3.5 direct-provider
  audit record
- `benchmarks/results/smoke-binary-2026-04-23T12-10-15Z.jsonl` —
  Stage 1 smoke JSONL (6 records)
- Waggle-OS commits on `origin/main` bound to this manifest:
  `7b7436d`, `68f26ba`, `89268ae`, `34ba083`, `01ccf59`, `5ec069e`

---

**LOCKED pending GATE-2. Hash binding
`628e44734be8edcd1f900eb4d782d11d8c13a7aaf3c1763e360502d6aca80191`
is the audit anchor for the v3 retry run. Any post-lock parameter
change requires HALT + new decision doc + new hash per A3 LOCK § 5
vN+1 protocol.**

---

## Gate ping (per brief format)

```
[GATE-2] status: halt
artefact: decisions/2026-04-23-stage2-mini-manifest-v3.md
         + decisions/2026-04-23-stage2-mini-manifest-v3.yaml
sha256: 628e44734be8edcd1f900eb4d782d11d8c13a7aaf3c1763e360502d6aca80191 (yaml)
next: Marko ratifies manifest v3 + picks Stage 3 runner path — §3.1 (new scripts/run-mini-locomo.ts wrapper) vs §3.2 (existing runner.ts with documented v3→v1 cell-name mapping + sequential concurrency caveat). Then CC-1 runs §3.1 pre-flight re-verify + §3.2 execute.
```
