#!/usr/bin/env bash
# Banking ruler reproduction — banking_knowledge × gpt-5.5 (default 'alltools' variant:
# BM25 + OpenAI dense embeddings + read-only shell sandbox) @ reasoning_effort=high,
# max_steps=200. PRIMARY pinned ruler anchor (published pass^1 = 37.37, ±10pp).
#
# Runs INSIDE the privileged Linux container `harness-tau2-linux` because banking's
# 'alltools' shell sandbox is Linux-only (needs srt/rg/bwrap/socat; bwrap verified
# working in the container). The container already carries the proxy env
# (OPENAI_API_BASE=http://host.docker.internal:4001) + a Linux venv (/opt/tau2-venv).
#
# Same reasoning_effort/max_steps fix as the retail script (docs/12 forensics).
# Prereqs: harness-tau2-linux + harness-litellm up; OpenAI quota restored.
set -euo pipefail
docker exec harness-tau2-linux bash -lc '
  cd /work && PYTHONUTF8=1 NO_COLOR=1 TERM=dumb \
  uv run tau2 run --domain banking_knowledge --agent llm_agent \
    --agent-llm openai/gpt-5.5 --agent-llm-args "{\"reasoning_effort\":\"high\"}" \
    --user-llm  openai/gpt-5.2 --user-llm-args  "{\"reasoning_effort\":\"low\"}" \
    --num-trials 4 --max-concurrency 4 --max-steps 200 --max-errors 10 --seed 42 \
    --save-to waggle_ruler_banking_gpt55_high_n97k4
'
# Expected: pass^1 near published 37.37 (±10pp Clopper-Pearson at n=97) -> banking ruler VALIDATED.
# Then run the C2 re-derivability/construct gate on this output (docs/11 §3).
