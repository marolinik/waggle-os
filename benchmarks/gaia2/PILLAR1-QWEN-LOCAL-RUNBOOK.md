# Pillar 1 — Qwen 3.6 35B-A3B follow-up runbook

**Goal:** API-served Qwen 3.6 number for the Waggle harness on GAIA 2 search split.
Repeat the **2026-05-22 Pillar-1 ON-PAR run** (Waggle harness + Sonnet 4.6 trio-strict **86.5% at N=40**) but with **Qwen 3.6 35B-A3B via LiteLLM → DashScope-intl direct** instead of Sonnet via OpenRouter.

## 2026-05-26 PIVOT — API-served, not local

This runbook originally scaffolded a **local-Ollama** path. We pivoted to **API-served via LiteLLM** on 2026-05-26 because (1) the LiteLLM proxy already holds all credentials, (2) DashScope-intl direct delivers the TRUE Qwen 3.6 (the OpenRouter route silently regresses to Qwen 3.5 per `models.json:43`), and (3) eliminates the gateway-confound caveat from the Sonnet baseline by routing both agent and judge through one proxy.

The sovereign-local variant is preserved at the bottom as an optional follow-up.

## Smoke verdict (2026-05-26 17:14)

Plumbing **PASS**. Single-scenario judge **inconclusive** on the known-flaky `21_1afh09`:

| Signal | Result |
|---|---|
| LiteLLM → DashScope-intl auth | ✅ keys resolved via `LITELLM_MASTER_KEY` |
| Worker → ARE adapter socket | ✅ scenario lifecycle clean |
| Qwen 3.6 agent engagement | ✅ **28 agent events**, coherent multi-step reasoning ("count 31 Shanghai contacts → sum ages 1402 → avg 45.23 → round 45") |
| Judge route via LiteLLM | ✅ ran, returned `inconclusive` (not "wrong") |
| Cost | ✅ ~$0.05 |

Scenario `21_1afh09` was flagged in `PILLAR1-WAGGLE-VS-HERMES-N40-2026-05-22.md` as "flipped between runs" — its `user_message_checker` is unstable on phrasing. Trio-rejudge typically resolves these. **Smoke is GREEN.**

---

## Why this is single-knob

Worker (`waggle-container/waggle_worker.mjs`) is fully env-driven. Runner `container_env.py` `_DEFAULT` profile injects from the TOML `[agent]` block into the container:

| Env var | Sonnet baseline (2026-05-22) | Qwen 3.6 (this run) |
|---|---|---|
| `MODEL` | `claude-sonnet-4-6` | `qwen3.6-35b-a3b` (LiteLLM alias) |
| `BASE_URL` | `https://openrouter.ai/api/v1` | `http://host.docker.internal:4000/v1` (LiteLLM proxy) |
| `API_KEY` | OpenRouter key | `sk-waggle-dev` (LiteLLM master key) |

LiteLLM alias `qwen3.6-35b-a3b` routes to `openai/qwen3.6-35b-a3b` at `https://dashscope-intl.aliyuncs.com/compatible-mode/v1` (`litellm-config.yaml:211` — Sprint 12 sibling of the deprecated `via-openrouter` route).

Same `AGENTS.md` renders, same single `terminal` tool, same `runAgentLoop`. **Only the model differs.** Strict fairness with the 86.5% Sonnet baseline.

---

## Prerequisites (all verified 2026-05-26)

1. **LiteLLM proxy stack up.** From repo root: `docker-compose up -d` brings up `litellm` (port 4000), `postgres`, `redis`, `minio`. Confirm: `curl http://localhost:4000/health` returns auth-required error (= healthy + listening).
2. **`localhost/gaia2-waggle:latest` built.** Verify: `docker images | grep gaia2-waggle`. Rebuild via `waggle-container/BUILD.md` if the worker or `@waggle/agent/dist` has changed since last build.
3. **`LITELLM_MASTER_KEY` set in shell.** Default `sk-waggle-dev` per `.env` and `docker-compose.yml`.
4. **gaia2-runner available.** At `external/meta-agents-research-environments/gaia2-cli/runner/.venv/Scripts/gaia2-runner.exe` (Windows) — installed via `uv sync --frozen`.
5. **GAIA 2 dataset cached.** First run pulls from HuggingFace. Cached at `~/.cache/gaia2/hf_datasets/`.

---

## TOMLs

Working copies live in `external/meta-agents-research-environments/gaia2-cli/runner/examples/` (`.gitignored` per the existing pattern; embedded verbatim below for reproduction on any fresh checkout).

### Smoke (n=1) — `waggle_qwen36_smoke_n1.toml`

```toml
[target]
dataset = "meta-agents-research-environments/gaia2-cli"
splits = ["search"]
limit = 1

[agent]
image = "localhost/gaia2-waggle:latest"
runtime = "docker"
provider = "openai-compat"
model = "qwen3.6-35b-a3b"
api_key_env = "LITELLM_MASTER_KEY"
base_url = "http://host.docker.internal:4000/v1"
thinking = "high"

[judge]
provider = "openai-compat"
model = "claude-sonnet-4-6"
api_key_env = "LITELLM_MASTER_KEY"
base_url = "http://localhost:4000/v1"

[run]
timeout = 1800
health_timeout = 180
concurrency = 1
pass_at = 1
output_dir = "D:/Projects/waggle-os-gaia2-wt/benchmarks/gaia2/runs/waggle-qwen36-smoke-n1"
log_level = "INFO"
```

### Full N=160 — `waggle_qwen36_n160.toml`

```toml
[target]
dataset = "meta-agents-research-environments/gaia2-cli"
splits = ["search"]
limit = 160

[agent]
image = "localhost/gaia2-waggle:latest"
runtime = "docker"
provider = "openai-compat"
model = "qwen3.6-35b-a3b"
api_key_env = "LITELLM_MASTER_KEY"
base_url = "http://host.docker.internal:4000/v1"
thinking = "high"

[judge]
provider = "openai-compat"
model = "claude-sonnet-4-6"
api_key_env = "LITELLM_MASTER_KEY"
base_url = "http://localhost:4000/v1"

[run]
timeout = 1800
health_timeout = 180
concurrency = 2
pass_at = 1
output_dir = "D:/Projects/waggle-os-gaia2-wt/benchmarks/gaia2/runs/waggle-qwen36-n160"
log_level = "INFO"
```

Difference: `limit` and `concurrency` only. Output dirs distinct.

---

## Run sequence

```powershell
# 0. Confirm LiteLLM stack
docker ps --format '{{.Names}} ({{.Status}})' | Select-String 'litellm|postgres|redis|minio'

# 1. Set the master key for the runner's host shell
$env:LITELLM_MASTER_KEY = "sk-waggle-dev"

# 2. Smoke first (~3-5 min wall, ~$0.05)
cd D:/Projects/waggle-os/external/meta-agents-research-environments/gaia2-cli
& "runner/.venv/Scripts/gaia2-runner.exe" run-config `
  --config "runner/examples/waggle_qwen36_smoke_n1.toml"

# 3. Inspect smoke
Get-Content D:/Projects/waggle-os-gaia2-wt/benchmarks/gaia2/runs/waggle-qwen36-smoke-n1/results.jsonl

# 4. If smoke clean (plumbing + non-zero agent events) -> full run (~3-5 hrs wall, ~$5-8)
& "runner/.venv/Scripts/gaia2-runner.exe" run-config `
  --config "runner/examples/waggle_qwen36_n160.toml"

# 5. Trio-strict rejudge
cd D:/Projects/waggle-os-gaia2-wt/benchmarks/gaia2
python rejudge_user_message.py `
  --runs-dir runs/waggle-qwen36-n160 `
  --judges opus-4-7,gpt-5-4,gemini-2.5-pro `
  --output runs/rejudge-waggle-qwen36-n160.jsonl
```

---

## Gate criteria

| Gate | Pass condition |
|---|---|
| **Smoke plumbing** | LiteLLM auth resolves; container completes lifecycle; agent emits ≥1 event; judge runs (even if inconclusive). The 28-event scenario `21_1afh09` smoke met this on 2026-05-26. |
| **Full run health** | error-rate < 10% (per-scenario container exits or judge errors). Concurrency=2 means 2 docker containers + 2 simulated app daemons in parallel — `entrypoint.log` per scenario captures issues. |
| **Headline** | trio-strict score with 95% CI. **No threshold** — this is "where does API-served Qwen 3.6 land," not a hypothesis test. Sonnet ON-PAR (86.5%, N=40, trio-strict) is the comparator. A trio-strict in the **75-85% band** would be a strong sovereign-eligible result; lower than that frames Pillar 1 as model-bound and worth focused harness work. |

---

## Known risks & open assumptions

1. **`runAgentLoop` against LiteLLM-proxied DashScope** — smoke proved roundtrip works at the OpenAI-compat surface, with tool calls flowing correctly. Full-N parallelism is the next stress test: 2 containers competing for LiteLLM throughput shouldn't hit rate limits at N=160 / 2 = 80 sequential calls per stream.

2. **DashScope 16K thinking-tokens cap** (per `models.json:55`, Stage 2 Mini Retry v3 manifest §2.1) — reduced from 64K to avoid tail-latency timeouts. If the agent loop blows through this on multi-step scenarios, expect `loop_exhausted` failures similar to the 2026-04-30 dry-run-results-memo §3 finding.

3. **Concurrency=2 GPU/cost contention** — DashScope is API-served, no local GPU constraint. Cost stays linear with N (~$5-8 total at $0.20+$0.80/M).

4. **No prompt-shape change** — Waggle's GAIA 2 worker uses `AGENTS.md` + single `terminal` tool. The `qwen-thinking.ts` PromptShape lives in `packages/agent/src/prompt-shapes/` and is a LoCoMo retrieval framework, **not** the GAIA 2 shape. Do not wire it in here — that would break fairness with the 86.5% Sonnet baseline.

5. **Scenario `21_1afh09` flakiness** — known unstable per the N=40 memo. Single-instance failure carries no signal; trio-rejudge resolves most "inconclusive" verdicts.

---

## Comparator targets

| Cell | N | trio-strict | source |
|---|---:|---:|---|
| Hermes (reference) + Sonnet 4.6 | 40 (matched subset of 160) | **89.2%** | `PILLAR1-WAGGLE-VS-HERMES-N40-2026-05-22.md` |
| **Waggle + Sonnet 4.6** | 40 | **86.5%** | same memo |
| Hermes + Sonnet 4.6 | 160 (full search) | 83.8% strict / 86.5% judged-only | `PHASE-4-P4.5-RESULTS-N160-2026-05-22.md` |
| **Waggle + Qwen 3.6 35B-A3B (API via LiteLLM→DashScope)** | 160 | **TBD** | this runbook (fired 2026-05-26) |

The third row is the natural comparator for the new API-served Qwen 3.6 number. A defensible launch claim: *"Waggle harness lands within ε of the Hermes-Sonnet ceiling even with a sovereign-eligible 35B model"* — provided ε is small enough. Defining "small enough" is the next round of analysis once the trio-strict number is in.

---

## Optional follow-up: sovereign-local variant via Ollama

If a fully-local number is later needed (no cloud API surface), the variant just swaps `[agent]`:

```toml
[agent]
image = "localhost/gaia2-waggle:latest"
runtime = "docker"
provider = "openai-compat"
model = "qwen2.5:32b"                       # FIXME: confirm exact Ollama tag for Qwen 3.6 35B thinking
api_key_env = "OPENAI_COMPAT_API_KEY"       # set to any non-empty string ("ollama" works)
base_url = "http://host.docker.internal:11434/v1"
thinking = "high"
```

Prerequisites: `ollama pull <qwen-3.6-thinking-tag>`, plus `concurrency=1` (single GPU serializes) → wall time ~3-15h instead of ~3-5h. Cost is $0 on agent side, judge stays the same (~$2 in-container Sonnet). Output dir suffix changes to `-ollama-local` to keep the API-served and sovereign-local runs distinct.

---

## Provenance

- Initial scaffold 2026-05-26 (Ollama-only): commit `b4e4354` on `feature/gaia2-are-setup`.
- 2026-05-26 PM pivot to API-served via LiteLLM → DashScope: this revision.
- Smoke fired 2026-05-26 17:14 (task ID `benccwrgl`): plumbing PASS, scenario `21_1afh09` judge inconclusive (known flaky).
- N=160 fired 2026-05-26 17:19 (task ID `blt6winb3`): in progress at the time this runbook update was written; result memo to follow under `PILLAR1-QWEN36-N160-RESULT-2026-05-26.md`.
- Worker entry: `benchmarks/gaia2/waggle-container/waggle_worker.mjs` (HEAD `6479dfa`).
- ARE container_env: `external/meta-agents-research-environments/gaia2-cli/runner/gaia2_runner/container_env.py` `_DEFAULT` profile.
- LiteLLM alias source: `litellm-config.yaml:211` (Sprint 12 Task 2 C3 Stage 2 mini).
