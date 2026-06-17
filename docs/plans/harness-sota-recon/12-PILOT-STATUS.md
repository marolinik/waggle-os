# 12 — Ruler Pilot Reproduction: Status & Blocker (2026-06-17)

**Status:** PAUSED — blocked on OpenAI quota (founder billing action). Run mechanism fully built + proven; one anchor ran (contaminated); banking-on-Linux stack built + ready.

---

## What was built / proven (all working)

- **Bench LiteLLM proxy on `:4001`** — isolated from the founder's running stack (which mounts the *main-repo* config and routes neither gpt-5.5 nor gpt-5.2). Started from the worktree `litellm-config.yaml`, same OpenAI key. Container `harness-litellm`.
- **Routes added** (worktree `litellm-config.yaml` + `benchmarks/harness/config/models.json`): **`gpt-5.2`** (the τ² v0.2.1-dev user-sim + retail cross-check agent — was entirely missing) and **`text-embedding-3-large`** (banking `alltools` KB embedder). Both verified HTTP 200 through the proxy.
- **Run path:** stock τ² agent `llm_agent`, `uv run tau2 run`, models as `openai/<alias>` via the proxy. Windows needs `PYTHONUTF8=1` (else tau2's `rich` progress renderer crashes on `→` under cp1252).
- **Banking faithful Linux stack BUILT** (container `harness-tau2-linux`, privileged): the default banking variant is **`alltools`** (BM25 + OpenAI dense embeddings + read-only **shell sandbox**), and the sandbox is **Linux-only** (`srt`/`rg`/`bwrap`/`socat`). Provisioned: apt `ripgrep bubblewrap socat nodejs npm` + `npm i -g @anthropic-ai/sandbox-runtime@0.0.23` (gives `srt`) + `uv sync --extra knowledge`. **`bwrap` functional test PASSED inside the privileged container** (the key risk — cleared). Proxy reachable via `host.docker.internal:4001`.

## Results so far

| Anchor | Status | Reproduced pass^1 | Published | Verdict |
|---|---|---|---|---|
| retail × gpt-5.2 | ran 456 sims (402 valid, **54 infra-errored on quota**) | **68.16%** | 81.58% | **INVALID — contaminated** |
| banking × gpt-5.5 | smoke only; **2/2 sims quota-errored** | — | 37.37% | not yet run |

**The retail 68.16% is NOT a usable ruler verdict.** The run was throttled throughout (680 rate-limit log lines, 54 infra errors); rate-limits firing *mid-conversation* break tool calls and depress pass-rate (a throttled mid-task call = a failed task that would otherwise pass). The 13pp gap cannot be attributed to the substrate until a CLEAN re-run. Cost of this run: **$19.45** (agent $14.83 + user $4.62), ≈ $0.048/valid-sim.

## BLOCKER (founder action)

**OpenAI account hit `insufficient_quota`** — after ~$19.45 spend, both gpt-5.2 and gpt-5.5 return persistent HTTP 429 *at zero load* with "You exceeded your current quota, please check your plan and billing details." This is a hard credit/spend cap, not transient RPM. **All further gpt-5.x runs are blocked until credits are added / the cap is raised.**

Secondary lesson: even before the cap, **concurrency 8 tripped intermittent RPM throttling** — the account's rate tier is low. Future runs must use **low concurrency (~2–4)** and run anchors **sequentially**, not concurrently.

## Next steps (once quota restored)

1. **Clean retail re-run** — `retail × gpt-5.2`, `--num-trials 4`, **`--max-concurrency 3`**, alone → valid pass^1 vs 81.58 ±8pp.
2. **Banking run** — inside `harness-tau2-linux`: `banking_knowledge × gpt-5.5` (default `alltools`), `--num-trials 4`, low concurrency → pass^1 vs 37.37 ±10pp. Same run feeds the **C2 re-derivability/construct gate**.
3. Fill `measured` in `benchmarks/harness/config/rulers.json`; run the ruler gate; measure paired discordance + ICC → finalize N (§6.1).

## Environment left running (for resume; remove when done)

- `harness-litellm` (proxy :4001) and `harness-tau2-linux` (privileged Linux runner) are **left up** so the resume is immediate. Tear down with `docker rm -f harness-litellm harness-tau2-linux` if abandoning.
- Embedding cache + the contaminated retail results live under `benchmarks/tau2/upstream/data/simulations/` (gitignored).
