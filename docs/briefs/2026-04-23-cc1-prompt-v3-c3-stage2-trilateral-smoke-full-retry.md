# CC-1 Prompt v3 — Sprint 12 Task 2 C3 Stage 2 Retry

**Authored:** 2026-04-23
**Author:** PM-Waggle-OS
**Status:** PASTE-READY for CC-1
**Supersedes:** v2 (aborted run 2026-04-23T00-56-52Z, 100 raw-cell records, 20% subject timeout, SOTA-inadequate)
**Parent decision:** Stage 2 Mini LoCoMo four-cell × N=100 × judge-ensemble (Opus 4.7 + GPT-5.4 + Gemini 3.1 pro preview)

---

## Marko adjudikacija (LOCKED 2026-04-23)

1. `thinking=on` na Qwen 3.6-35b-A3B ostaje NEDODIRLJIV. Ako bilo koja opcija traži `thinking=off`, ta opcija je odbačena.
2. Trilateralna triangulacija primarnog provajdera pre full retry-a: **DashScope direct** (Alibaba, primary kandidat), **Ollama cloud** (hosted, ne lokalna instanca — peer-level fallback), **OpenRouter bridge** (current, secondary fallback).
3. N=400 (four-cell × N=100) ostaje. N redukcija je odbačena — statistička snaga po ćeliji je već marginalna.
4. Budžet cap: $250 full retry. Auto top-up na OpenRouter aktivan; DashScope i Ollama balance treba proveriti u §0.

---

## PASTE-READY CC-1 PROMPT v3

```
Acting as CC-1 in waggle-os repo. Sprint 12 Task 2 C3 Stage 2 Mini LoCoMo retry.

PARENT CONTEXT:
- Previous run aborted 2026-04-23T01:33Z at 100 cell-raw records (20% subject timeout)
- File: benchmarks/results/raw-locomo-2026-04-23T00-56-52-730Z.jsonl (archived, NOT publishable)
- Root cause: OpenRouter→Alibaba bridge tail latency under thinking=on + max_tokens=64000
- JsonlRecord taxonomy: Option C namespace split (a3_failure_code + a3_rationale, commit 7b7436d)

MARKO LOCKED:
- thinking=on MANDATORY (not negotiable)
- Trilateral provider probe BEFORE full retry
- N=400 preserved (four-cell × N=100)
- Ensemble judges direct provider routing (no OpenRouter markup):
  * primary: claude-opus-4-7 via Anthropic direct
  * secondary: gpt-5.4 via OpenAI direct
  * tie_breaker: gemini-3.1-pro-preview via Google AI Studio direct

=============================================
STAGE 0 — PROVIDER BALANCE + KEY VERIFICATION
=============================================

Before spending ANY token on retry, confirm:

0.1 LiteLLM .env audit:
  grep -E "^(ANTHROPIC|OPENAI|GEMINI|OPENROUTER|DASHSCOPE|ALIBABA|OLLAMA)_" <litellm-proxy-dir>/.env
  Report which keys present; flag any missing.

0.2 LiteLLM model aliases live:
  curl -s http://localhost:4000/v1/models | jq -r '.data[].id' | grep -iE "qwen|opus|gpt-5|gemini|dashscope|ollama"
  Expected aliases needed:
    - qwen3.6-35b-a3b-via-dashscope-direct
    - qwen3.6-35b-a3b-via-ollama-cloud
    - qwen3.6-35b-a3b-via-openrouter (existing)
    - claude-opus-4-7 (Anthropic direct)
    - gpt-5.4 (OpenAI direct)
    - gemini-3.1-pro-preview (Google AI Studio direct)
  If any alias missing, add to LiteLLM config.yaml and restart proxy. Report before proceeding.

0.3 Balance snapshot → sessions/2026-04-23-c3-retry-prerun-balance.md:
  - OpenRouter balance
  - DashScope/Alibaba credit balance (API or dashboard)
  - Ollama cloud balance
  - Anthropic, OpenAI, Google AI Studio: confirm keys active (1 test call each, 5 tokens out)

GATE: HALT for Marko adjudication if (a) any required alias missing after config attempt, or (b) any provider balance < $20.

=============================================
STAGE 1 — TRILATERAL SMOKE TEST
=============================================

Goal: measure provider latency + completion reliability on 3 representative LoCoMo samples × 3 providers = 9 calls. Cost budget $1.50-3.00 total.

1.1 Sample selection:
  Pick 3 LoCoMo instances deterministically (same seed across providers):
    - locomo_conv-26_q059 (known prior timeout victim — hardest case)
    - locomo_conv-50_q086 (known prior success — easy fact-recall)
    - locomo_conv-44_q000 (mid-difficulty, prior-run present)
  Hardcode these instance_ids in a scripts/smoke-trilateral.ts file.

1.2 Per provider × per sample:
  Call subject with thinking=on, max_tokens=16000, HTTP timeout=300s.
  Measure: latency_ms, completion_status (ok / timeout / error), reasoning_content_chars, response_chars, usd_cost.
  Emit one JSONL record per call to benchmarks/results/smoke-trilateral-<ISO>.jsonl.

1.3 Providers (literal slugs, via LiteLLM proxy):
  - qwen3.6-35b-a3b-via-dashscope-direct
  - qwen3.6-35b-a3b-via-ollama-cloud
  - qwen3.6-35b-a3b-via-openrouter

1.4 Judge ensemble: SKIP for Stage 1. We measure only subject behavior.

1.5 Report format (paste to sessions/2026-04-23-trilateralni-smoke.md):
  | provider | sample | latency_ms | status | reasoning_chars | response_chars | usd |
  |----------|--------|------------|--------|-----------------|----------------|-----|
  ...
  Plus aggregate:
    - median latency per provider
    - completion rate per provider (N=3)
    - any 3xx/4xx/5xx errors with response body

GATE: HALT and ping Marko with smoke results. Marko selects primary provider. DO NOT proceed to Stage 2 without explicit primary provider confirmation.

=============================================
STAGE 2 — MANIFEST RE-EMIT
=============================================

After Marko adjudicates primary provider:

2.1 Config updates in benchmarks/config/:
  - subject.max_tokens: 64000 → 16000
  - subject.http_timeout_ms: 180000 → 300000
  - subject.parallel_concurrency: 5 → 2
  - subject.thinking: on (unchanged, explicit in manifest)

2.2 Manifest pair re-emit (decisions/ dir, non-git convention):
  - decisions/2026-04-23-stage2-mini-manifest-v3.md
  - decisions/2026-04-23-stage2-mini-manifest-v3.yaml (twin)
  Field 7 structure:
    subject_model: qwen3.6-35b-a3b-via-<primary-chosen>
    subject_fallback_1: qwen3.6-35b-a3b-via-<second-choice>
    subject_fallback_2: qwen3.6-35b-a3b-via-<third-choice>
    subject_thinking: on
    subject_max_tokens: 16000
    subject_http_timeout_ms: 300000
    subject_parallel_concurrency: 2
    subject_routing_path: <explicit upstream, e.g., "alibaba-dashscope-direct">
    subject_quantization: "FP16-cloud" (or whatever primary provider serves)
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
  SHA-256 hash both files, commit hash to manifest md header.
  Report SHA-256 + both file paths to PM-Waggle-OS.

=============================================
STAGE 3 — FULL N=400 RETRY
=============================================

After manifest re-emit + Marko final go:

3.1 Pre-flight:
  - Re-verify subject provider alive (1 test call, 5 tokens, timeout 30s)
  - Re-verify judge ensemble alive (1 test call each, 5 tokens, timeout 30s)
  - Log live output to /tmp/c3-mini-retry-v3.log

3.2 Execute:
  npx tsx scripts/run-mini-locomo.ts \
    --manifest decisions/2026-04-23-stage2-mini-manifest-v3.yaml \
    --subject qwen3.6-35b-a3b-via-<primary> \
    --judge-ensemble claude-opus-4-7,gpt-5.4,gemini-3.1-pro-preview \
    --N 100 --cells raw,context,retrieval,agentic \
    --parallel-concurrency 2 \
    --output benchmarks/results/raw-locomo-retry-v3-<ISO>.jsonl

3.3 Abort triggers (code-level, not manual):
  - rolling 50-eval error rate > 10% → HALT, page Marko
  - any single cell > 30min without progress → HALT, page Marko
  - total spend > $325 → HARD HALT

3.4 On clean finish (all 400 records, error rate ≤ 5%):
  - SHA-256 output JSONL
  - Commit raw-locomo-retry-v3-<ISO>.jsonl to benchmarks/results/ (git)
  - Append summary row to benchmarks/results/INDEX.md:
    | timestamp | manifest-sha | total-N | completion-rate | accuracy-per-cell | budget-usd |
  - Ping PM-Waggle-OS with completion report + accuracy-per-cell table.

3.5 On abort before completion:
  - SHA-256 partial output
  - Archive to sessions/2026-04-23-c3-retry-v3-partial-<ISO>.md with NOT_PUBLISHABLE marker
  - Ping PM-Waggle-OS with abort reason + rolling error trajectory.

=============================================
DELIVERABLES CHECKLIST
=============================================

□ Stage 0 complete: .env audit + alias verify + balance snapshot committed
□ Stage 1 complete: 9 smoke records + aggregate table in sessions/2026-04-23-trilateralni-smoke.md
□ Marko primary provider adjudication received
□ Stage 2 complete: manifest v3 pair + SHA-256 in decisions/
□ Marko full-retry go received
□ Stage 3 complete: N=400 JSONL committed OR partial archived with abort reason

HALT behavior: each GATE (end of Stage 0, end of Stage 1, end of Stage 2) requires Marko ack before proceeding. Do NOT auto-advance.
```

---

## PM briefing notes za sebe

- Trilateralni smoke je jeftin ($1.50-3.00) i brz (~15-20 min) — ne stavljati velike procene ispred njega.
- DashScope direct očekujem da pobedi: uklanja 2 bridge hop-a, Sprint 10 Task 1.4 već potvrdio slug.
- Ollama cloud ulazi kao peer-level fallback (Marko ispravka 2026-04-23) — ne treba više kvant-parity brige.
- OpenRouter ostaje secondary; auto-switch logic iz Sprint 10 već implementiran.
- max_tokens 16k + timeout 300s + concurrency 2 su tri netaknute-semantike izmene koje rešavaju transport bez menjanja benchmark variable-a.
- SHA-256 manifest v3 treba zabeležiti u memory kao decision trail pre full run-a.

## Post-full-retry akcije (ako N=400 uspe)

1. Accuracy-per-cell uporedi sa prior-run očekivanjima (Mem0 91.6% LoCoMo reper).
2. Ako raw→agentic delta > 15pp: proslavljamo, idemo u Sprint 12 Task 3 preregistration.
3. Ako delta < 10pp: pre-registered failure response plan aktiviramo (dokumentovan u `project_locked_2026_04_20_benchmark_gemma_cc.md`).
4. Ažuriraj memory: `project_cc_sprint_active_2026_04_20.md` + kreiraj `project_sprint_12_task2_closed.md`.
5. Handoff u `sessions/2026-04-23-handoff-c3-stage2-close.md` sa full-retry outcome + next-step brief.
