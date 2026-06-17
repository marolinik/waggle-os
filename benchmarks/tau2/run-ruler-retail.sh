#!/usr/bin/env bash
# Clean retail ruler reproduction — retail × gpt-5.2 @ reasoning_effort=high, max_steps=200.
#
# Why this config (docs/plans/harness-sota-recon/12 + forensics 2026-06-17):
# the first attempt scored 68.16% (vs published 81.58%) because (1) reasoning_effort
# was NEVER sent — tau2's default agent llm_args = {temperature:0.0} only, and
# gpt-5.2 ran with reasoning_tokens=0 on every turn (reasoning effectively OFF;
# the board's gpt-5.2 'none' variant = 75.00, 'high' = 81.58); and (2) we used
# --max-steps 30 vs tau2's DEFAULT_MAX_STEPS=200 (35 sims truncated -> forced 0).
# Both are config, NOT a substrate gap (this is the stock llm_agent, no Waggle bridge).
#
# Prereqs: bench LiteLLM proxy on :4001 (gpt-5.2 route) + OpenAI quota restored.
# Low concurrency (4) to avoid the account's RPM throttle that contaminated attempt 1.
set -euo pipefail
cd "$(dirname "$0")/upstream"
PYTHONUTF8=1 PYTHONIOENCODING=utf-8 NO_COLOR=1 TERM=dumb \
OPENAI_API_BASE=http://localhost:4001 OPENAI_BASE_URL=http://localhost:4001 OPENAI_API_KEY=sk-waggle-dev \
uv run tau2 run --domain retail --agent llm_agent \
  --agent-llm openai/gpt-5.2 --agent-llm-args '{"reasoning_effort":"high"}' \
  --user-llm  openai/gpt-5.2 --user-llm-args  '{"reasoning_effort":"low"}' \
  --num-trials 4 --max-concurrency 4 --max-steps 200 --max-errors 10 --seed 42 \
  --save-to waggle_ruler_retail_gpt52_high_n114k4
# Expected: pass^1 ~78-82% -> within ±8pp of published 81.58 -> retail ruler VALIDATED.
# Score from the run's own tau2 pass^1 (per-task), not a flat mean.
