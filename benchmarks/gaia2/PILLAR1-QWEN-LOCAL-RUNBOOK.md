# Pillar 1 — Qwen-local follow-up runbook

**Goal:** sovereign full-local number for the Waggle harness on GAIA 2 search split.
Repeat the **2026-05-22 Pillar-1 ON-PAR run** (Waggle harness + Sonnet 4.6 trio-strict 86.5% at N=40) but with **Qwen 3.6 35B served locally via Ollama** instead of Sonnet via OpenRouter.

This is a press-button runbook. All env-var plumbing, TOML configs, and gate criteria are inline so a future session (or Marko at a fresh terminal) can fire the run in one pass.

---

## Why this is single-knob

The Waggle worker (`waggle-container/waggle_worker.mjs`) is **fully env-driven**:

| Env var | Purpose | Sonnet (2026-05-22) | Qwen-local (this run) |
|---|---|---|---|
| `MODEL` | model identifier | `claude-sonnet-4-6` | `<ollama-qwen-tag>` |
| `BASE_URL` / `LITELLM_URL` | OpenAI-compat endpoint | `https://openrouter.ai/api/v1` | `http://host.docker.internal:11434/v1` |
| `API_KEY` / `LITELLM_API_KEY` | bearer token | OpenRouter key | any non-empty string (Ollama ignores) |

The ARE runner's `container_env.py` (`_DEFAULT` profile, matched on `gaia2-waggle` image) **injects exactly these four into the container** based on the TOML's `[agent]` block: `provider`/`model`/`api_key_env`/`base_url`. Plumbing verified 2026-05-26 at HEAD `6479dfa`.

The same `AGENTS.md` is rendered by `gaia2-init-entrypoint.sh` regardless of model, the same single `terminal` tool is exposed, the same `runAgentLoop` runs. **Only the model differs** — the strict fairness condition for a defensible follow-up number.

---

## Prerequisites

Before firing the run:

1. **Ollama serving Qwen 3.6 35B thinking** on the host machine.
   ```powershell
   # one-time pull (size ~20 GB, time depends on bandwidth)
   ollama pull qwen2.5:32b           # or whatever the current Qwen-3.6-thinking tag is
   # confirm endpoint reachable
   curl http://localhost:11434/v1/models
   ```
   **Decision needed before run:** confirm the exact Ollama tag for "Qwen 3.6 35B thinking". The 2026-04-25 Stage-3-v6 LoCoMo apples-to-apples used Qwen 3.6 + thinking-on + 16K tokens (see `packages/agent/src/prompt-shapes/qwen-thinking.ts` metadata) — match that tag.

2. **Docker Desktop running** on Windows. `host.docker.internal` resolves to the host gateway by default on Docker Desktop; the launcher uses bridge networking on Windows (`launcher.py:415` — `--network=host` dropped on Windows by 2026-05-21 Marko patch).

3. **gaia2-waggle image built** at `localhost/gaia2-waggle:latest`. Build steps in `waggle-container/BUILD.md`. If the worker changed since the last build, **rebuild** — env is read at runtime but worker code is baked in.

4. **`ANTHROPIC_API_KEY` exported** for the in-container judge (Sonnet — cheap, ~$2 for N=160). The agent itself is $0 because Qwen runs locally.

5. **Top up Anthropic + OpenAI + Google credits** if trio-strict rejudge will follow (M5 in OPEN-WORK-SUMMARY). Trio costs ~$10 for N=160.

---

## TOMLs

Drop both into `external/meta-agents-research-environments/gaia2-cli/runner/examples/`. Working copies also written there by the 2026-05-26 session for immediate use.

### Smoke (n=1) — confirms plumbing end-to-end

```toml
# waggle_qwen_local_smoke_n1.toml
# Smoke: Waggle harness + Qwen 3.6 35B thinking (LOCAL via Ollama) on N=1 search-split scenario.
# Purpose: prove Ollama → container connectivity + tool-call roundtrip before spending the full run.
# Cost envelope: ~$0.02 in-container judge (Sonnet); $0 agent (local).

[target]
dataset = "meta-agents-research-environments/gaia2-cli"
splits = ["search"]
limit = 1

[agent]
image = "localhost/gaia2-waggle:latest"
runtime = "docker"
provider = "openai-compat"
model = "qwen2.5:32b"                       # FIXME: confirm exact Ollama tag for Qwen 3.6 35B thinking before firing
api_key_env = "OPENAI_COMPAT_API_KEY"       # set to any non-empty string ("ollama" works)
base_url = "http://host.docker.internal:11434/v1"
thinking = "high"

[judge]
provider = "anthropic"
model = "claude-sonnet-4-6"
api_key_env = "ANTHROPIC_API_KEY"

[run]
timeout = 1800                              # Qwen-local is ~10-30× slower than Sonnet; widen timeout
health_timeout = 180
concurrency = 1                             # local LLM = serial; multiple containers would compete for the GPU
pass_at = 1
output_dir = "D:/Projects/waggle-os-gaia2-wt/benchmarks/gaia2/runs/waggle-qwen-local-smoke-n1"
log_level = "INFO"
```

### Full N=160 search split — the publishable number

```toml
# waggle_qwen_local_n160.toml
# Full run: Waggle harness + Qwen 3.6 35B thinking (LOCAL via Ollama) on N=160 search split.
# Purpose: Pillar 1 follow-up — sovereign full-local number.
# Cost envelope: ~$2 in-container judge; +$10 trio-strict rejudge (separate step). $0 agent (local).
# Time envelope: ~3-15 hours depending on GPU (160 scenarios × ~1-5 min each at concurrency=1).

[target]
dataset = "meta-agents-research-environments/gaia2-cli"
splits = ["search"]
limit = 160

[agent]
image = "localhost/gaia2-waggle:latest"
runtime = "docker"
provider = "openai-compat"
model = "qwen2.5:32b"                       # FIXME: confirm exact Ollama tag — must match smoke
api_key_env = "OPENAI_COMPAT_API_KEY"
base_url = "http://host.docker.internal:11434/v1"
thinking = "high"

[judge]
provider = "anthropic"
model = "claude-sonnet-4-6"
api_key_env = "ANTHROPIC_API_KEY"

[run]
timeout = 1800
health_timeout = 180
concurrency = 1
pass_at = 1
output_dir = "D:/Projects/waggle-os-gaia2-wt/benchmarks/gaia2/runs/waggle-qwen-local-n160"
log_level = "INFO"
```

---

## Run sequence

```powershell
# 1. Confirm Ollama serving Qwen
curl http://localhost:11434/v1/models

# 2. Set the dummy key (Ollama ignores but TOML expects something resolvable)
$env:OPENAI_COMPAT_API_KEY = "ollama"
# ANTHROPIC_API_KEY should already be set from prior runs

# 3. Smoke first — 1 scenario, ~5 min on a 4090, validates plumbing
cd D:/Projects/waggle-os/external/meta-agents-research-environments/gaia2-cli
gaia2-runner run-config --config runner/examples/waggle_qwen_local_smoke_n1.toml

# 4. Inspect smoke output
type D:/Projects/waggle-os-gaia2-wt/benchmarks/gaia2/runs/waggle-qwen-local-smoke-n1/summary.json
# Expected: 1 scenario completed, model called Qwen successfully, terminal tool used.

# 5. If smoke clean → full run
gaia2-runner run-config --config runner/examples/waggle_qwen_local_n160.toml

# 6. Trio-strict rejudge — port the existing pattern from the Sonnet N=40 result
cd D:/Projects/waggle-os-gaia2-wt/benchmarks/gaia2
python rejudge_user_message.py \
  --runs-dir runs/waggle-qwen-local-n160 \
  --judges opus-4-7,gpt-5-4,gemini-2.5-pro \
  --output runs/rejudge-waggle-qwen-local-n160.jsonl
```

---

## Gate criteria

| Gate | Pass condition |
|---|---|
| **Smoke** | n=1 returns a non-empty agent message + non-error judge verdict; no socket / Ollama / tool-call failures in `/tmp/entrypoint.log`. |
| **Full run** | error-rate < 10% (per-scenario container exits or judge errors); cost reconciles to the ~$2 envelope. |
| **Headline** | trio-strict score with 95% CI. **No threshold set** — this is "where does sovereign-local land," not a hypothesis test. The Sonnet ON-PAR result is the comparator; expect a **3-10pp drop** for Qwen 3.6 vs Sonnet 4.6 (rule-of-thumb from prior LoCoMo deltas). A trio-strict landing in the **75-85% band** would be a strong sovereign-local result. |

---

## Known risks & open assumptions

1. **`runAgentLoop` against Ollama OpenAI-compat** — the worker has only ever been exercised against OpenRouter + Anthropic gateways. The OpenAI-compatible `/v1/chat/completions` surface should work, but **tool-call serialization** could differ. The smoke is the gate.

2. **Model tag** — the runbook hardcodes `qwen2.5:32b` as a placeholder. The exact tag for "Qwen 3.6 35B thinking" depends on what's currently pulled / available on Ollama. **Confirm before firing.** If a thinking-on variant requires explicit `enable_thinking=true` in chat-completion params, the worker may need a one-line patch (currently passes `stream:true` only).

3. **Concurrency = 1** — Qwen-local serializes on a single GPU. N=160 × ~3 min/scenario ≈ **8 hours wall clock**. Plan around this; running overnight is the obvious move.

4. **Faketime** — GAIA 2 search scenarios use a fixed simulated date via `FAKETIME` env. Confirm `gaia2-init-entrypoint.sh` still propagates this when the worker process is Node (not Python Hermes). The entrypoint script is verbatim-shared per `waggle-container/BUILD.md` step 1, so this should hold, but check the smoke trace for date-sensitive scenario behavior.

5. **No prompt-shape change** — Waggle's GAIA 2 worker uses `AGENTS.md` as system prompt + single `terminal` tool. The `qwen-thinking.ts` PromptShape lives in `packages/agent/src/prompt-shapes/` and is a LoCoMo-style retrieval framework, **not** the GAIA 2 shape. **Do not wire it in here** — that would break fairness with the 86.5% Sonnet baseline.

---

## Comparator targets

| Cell | N | trio-strict | source |
|---|---:|---:|---|
| Hermes (reference) + Sonnet 4.6 | 40 (matched subset of 160) | **89.2%** | `PILLAR1-WAGGLE-VS-HERMES-N40-2026-05-22.md` |
| **Waggle + Sonnet 4.6** | 40 | **86.5%** | same memo |
| Hermes + Sonnet 4.6 | 160 (full search) | 83.8% strict / 86.5% judged-only | `PHASE-4-P4.5-RESULTS-N160-2026-05-22.md` |
| **Waggle + Qwen 3.6 35B (LOCAL)** | 160 | **TBD** | this runbook |

The third row is the obvious comparator for the new sovereign-local number. A defensible launch claim would be "Waggle harness lands within ε of the Hermes-Sonnet ceiling even when the model is run fully on-device" — provided ε is small enough.

---

## Provenance

- Created 2026-05-26 by the session that closed the env-plumbing audit.
- Tracked in the gaia2 worktree at `benchmarks/gaia2/PILLAR1-QWEN-LOCAL-RUNBOOK.md`.
- Working TOML copies dropped into `D:/Projects/waggle-os/external/meta-agents-research-environments/gaia2-cli/runner/examples/`.
- Worker entry: `benchmarks/gaia2/waggle-container/waggle_worker.mjs` (HEAD `6479dfa`).
- ARE container_env: `external/meta-agents-research-environments/gaia2-cli/runner/gaia2_runner/container_env.py` `_DEFAULT` profile.
