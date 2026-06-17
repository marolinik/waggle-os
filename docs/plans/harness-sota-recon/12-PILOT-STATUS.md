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
| retail × gpt-5.2 (attempt 1) | 456 sims, reasoning OFF + max_steps 30 | **68.16%** | 81.58% | INVALID — config gap (superseded) |
| **retail × gpt-5.2 (clean)** | 456 sims, reasoning=high, steps=200 | **77.70%** | 81.58% | **✅ PASS — |Δ|=3.88pp, within ±8pp. RETAIL RULER VALIDATED** ($30.21) |
| banking × gpt-5.5 (chat API) | 388 sims **all-errored, $0** | — | 37.37% | VOID — gpt-5.5 needs /v1/responses (→ docs/13, FIXED) |
| **banking × gpt-5.5-responses** | running (gpt-5.5 via responses bridge) | _in progress_ | 37.37% | the real pinned primary anchor; gpt-5.5 fix verified live through tau2 |

### Status 2026-06-17 (latest)
- **Retail ruler PASSED** with the corrected config (77.70% vs 81.58%). The apparatus is validated for the dual-control machinery.
- **gpt-5.5 responses-API blocker SOLVED** (docs/13): new `gpt-5.5-responses` litellm alias (chat→responses bridge); verified end-to-end through tau2 (tool calls execute, 0 errors). Was a benchmark-wide bug — gpt-5.5 is a study *arm*, would have all-zeroed every tool cell.
- **Banking primary anchor now running** via `gpt-5.5-responses`.
- **Op note:** do NOT restart the litellm proxy while a run is live — it kills in-flight connections and wedges sims in a retry loop (cost a banking re-launch this session).

### Root cause of the retail gap — FORENSICS 2026-06-17 (NOT contamination)

A 3-analyst forensic pass on the existing run data proved the 13.4pp gap is a **config-apparatus mismatch**, not rate-limit contamination and **not a substrate failure** (this was the stock `llm_agent`; the Waggle bridge was never in the path). Two additive levers fully account for it:

1. **`reasoning_effort` was never sent.** τ²'s default agent `llm_args = {temperature:0.0}` only; `litellm.drop_params=True` discards `temperature` for gpt-5.2 and **nothing else is sent**, so gpt-5.2 ran at default effort — `reasoning_tokens=0` on **all 3,940 assistant turns** (57 median completion tokens, 1.9s/turn = a reasoning model not thinking). The published `gpt-5-2_sierra` retail run was `reasoning_effort:high` (81.58); the board's own `none` variant = 75.00 → **high−none ≈ 6.6pp**.
2. **`max_steps=30` vs τ² `DEFAULT_MAX_STEPS=200`** (`config.py:4`). 35/402 valid sims hit the ceiling (force-scored 0); excluding them lifts pass^1 to **74.66% (+6.5pp)**.

~6.6pp (effort) + ~6.5pp (truncation) ≈ the full 13.4pp. The 54 infra-errors were correctly excluded; τ² retries are transparent so the 402 valid sims were an unbiased sample (the gap is real config, which a clean re-run with the fix resolves). Cost of the (now-superseded) run: **$19.45**.

**Broader implication (benchmark-wide):** every gpt-5.x / reasoning arm (Opus, Gemini too) MUST pin `reasoning_effort` + use `max_steps=200`, or every number is wrong. This empirically validates param-sheet §5.3 ("pin a single effort level per model").

### Corrected, committed run recipe

- `benchmarks/tau2/run-ruler-retail.sh` — retail × gpt-5.2, `--agent-llm-args '{"reasoning_effort":"high"}'`, `--max-steps 200`, `--max-concurrency 4`.
- `benchmarks/tau2/run-ruler-banking.sh` — banking × gpt-5.5 (`alltools`) inside `harness-tau2-linux`, same effort/steps.
- Score from τ²'s own per-task pass^1, not a flat mean. Run anchors **sequentially** at concurrency 4 (the account's RPM tier throttled at combined concurrency 8 — separate from the now-resolved credit cap).

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
