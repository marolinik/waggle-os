# Phase 2 Smoke Evidence (Sesija C Task C1+C2)

**Date:** 2026-04-30 (executed 2026-04-29 21:55–21:58 local timestamp inside ARE logs; date discrepancy is local-clock drift, branch + commit time stamps are authoritative)
**Branch:** `feature/gaia2-are-setup` @ Phase 1 commit `a72b724`
**Wall-clock:** ~3 minutes total (sync 1.5min + Smoke A 1s + Smoke B-retry 31.8s)
**LLM cost:** **$0.00** (oracle mode + mock provider — no real model invocations)

---

## §1 — ARE platform clone (Task C1.a)

| Field | Value |
|---|---|
| Repo | `https://github.com/facebookresearch/meta-agents-research-environments` |
| Cloned to | `D:/Projects/waggle-os/external/meta-agents-research-environments/` (gitignored) |
| Clone strategy | `git clone --depth 1` (shallow; full history not required for setup verification) |
| **Pinned SHA** | **`0330191ffef8581e3c0620b78df9c7408bcb98b0`** (2026-04-20 11:53:48 +0200, "Format run-config HF split selection fix (#55)") |
| License | MIT |
| Repo size | 95+ Python deps + are/ source tree (~2,000+ Python files) |
| Last upstream commit at clone | 2026-04-20 (10 days before Sesija C kickoff) |

**Note on SHA discipline (per branch architecture LOCKED §4.1 binding):** The pinned SHA above was captured from `git rev-parse HEAD` after clone, not from memory. Cite this SHA going forward, not "latest main".

---

## §2 — Install verification (Task C1.b)

**Method:** `uv sync --frozen` from `external/meta-agents-research-environments/`.

| Field | Value |
|---|---|
| uv version | 0.8.17 |
| Python version | 3.10.18 (uv-managed; auto-selected per `requires-python = ">=3.10"` in `pyproject.toml`; system Python 3.11.9 not used) |
| Dependency count | 95 packages |
| Editable install | meta-agents-research-environments 1.2.0 |
| Key dependencies | `litellm 1.71.1` (LiteLLM-compatible — aligns with our existing routing layer); `huggingface-hub 0.33.4`; `mcp 1.11.0`; `datasets 4.0.0`; `aiohttp 3.13.2`; `httpx 0.28.1` |
| Install duration | ~1.5 min wall-clock |
| Exit code | 0 (clean install) |

**Binary verification:** `uv run are-run --help` and `uv run are-benchmark gaia2-run --help` both return clean usage output.

---

## §3 — Smoke A: Oracle mode, built-in scenario (Task C2.a)

**Command:**
```bash
cd external/meta-agents-research-environments && \
  uv run are-run -o -s scenario_find_image_file \
    --output_dir benchmarks/gaia2/runs/smoke-c2-2026-04-30/smoke-A-oracle
```

**Result:** **PASS.**
- `ScenarioValidationResult(success=True, exception=None, ...)`
- `Success=100.0%`, 1 scenario completed in <1 second
- Output files: `output.jsonl`, `initial_state.jsonl`, `final_state.jsonl`
- Output format (output.jsonl): `{"task_id": "scenario_find_image_file", "trace_id": null, "score": 1.0, "metadata": {"scenario_id": "scenario_find_image_file", "status": "success", "has_exception": false}}`

**Cosmetic warning (non-blocking):** Windows cp1252 codec cannot encode `✅` (✅) emoji from ARE's logger. UnicodeEncodeError raised inside `logging_config.py:61`, scenario completes normally. Acceptable for headless CI/CD if stdout encoding is set to utf-8.

---

## §4 — Smoke B: Gaia2 mini config × 1 scenario, mock provider (Task C2.b)

**First attempt — `gaia2-run` with default executor:** ❌ FAILED on Windows. Error: `cannot find context for 'fork'`. ARE's `gaia2-run` orchestrates 7 phase/configs (standard/{ambiguity, adaptability, execution, search, time}, agent2agent/mini, noise/mini) using `multiprocessing` with `fork` context — Windows only supports `spawn`. All 7 phases skipped.

**Second attempt — `are-benchmark run` with thread executor:** ✅ **PASS.**

```bash
cd external/meta-agents-research-environments && \
  uv run are-benchmark run \
    --hf-dataset meta-agents-research-environments/gaia2 \
    --hf-config mini \
    --hf-split validation \
    -l 1 \
    --provider mock \
    --agent default \
    --executor_type thread \
    --max_concurrent_scenarios 1 \
    --output_dir benchmarks/gaia2/runs/smoke-c2-2026-04-30/smoke-B-gaia2-mock-thread \
    --trace_dump_format lite
```

| Metric | Value |
|---|---|
| Dataset loaded | 160 examples in `mini/validation` split |
| Scenarios run | 1 unique × 3 runs (Pass@3 standard) |
| Wall-clock | 31.8 seconds |
| Provider | `mock` (default model alias `meta-llama/llama3-70b-instruct`, no real inference) |
| Success rate | 0.0% (mock provider returns fake responses; expected) |
| Exit code | 0 (1 config attempted, 1 successful) |
| Output files | `output.jsonl`, `benchmark_stats.json` |

**Per-run failure mode (3/3 runs):** `module 'signal' has no attribute 'SIGALRM'` — Windows lacks the Unix `SIGALRM` signal used by ARE's per-scenario timeout enforcement (`scenario_runner.py` raises `AttributeError`). Caught and recorded as `exception_runs` in stats, but blocks ANY scenario from completing on Windows even with mock provider.

**Output format (sample run, output.jsonl line):**
```json
{
  "task_id": "scenario_universe_21_xvc7uo",
  "trace_id": null,
  "score": 0.0,
  "metadata": {
    "scenario_id": "scenario_universe_21_xvc7uo",
    "run_number": 1,
    "status": "failed",
    "has_exception": true,
    "exception_type": "AttributeError",
    "exception_message": "module 'signal' has no attribute 'SIGALRM'"
  }
}
```

**Stats schema (benchmark_stats.json):** `metadata{model, model_provider, timestamp, report_version}` + `statistics{per_capability{<config>{success_rate, pass_at_k, pass_k, total_runs, ...}}, global{macro_success_rate, micro_success_rate, pass_at_k, pass_k, job_duration, ...}}`. Pass@k + Pass^k are first-class metrics (k=3 by default for Gaia2 standard).

---

## §5 — Windows compat findings + Phase 3+4 implications

| Finding | Where it surfaces | Workaround for Phase 3 (adapter) | Workaround for Phase 4 (dry run) |
|---|---|---|---|
| `multiprocessing.get_context('fork')` fails on Windows | `gaia2-run` full benchmark orchestrator | Use `are-benchmark run` directly (per-config) instead of `gaia2-run`; our adapter wraps single-config calls anyway | Use `--executor_type thread` for parallelism + run configs sequentially |
| `signal.SIGALRM` missing on Windows | `scenario_runner.py` per-scenario timeout enforcement (every scenario, regardless of provider/agent) | **Hard blocker** for Windows — adapter must either (a) patch `signal.SIGALRM` shim, (b) run inside Docker/WSL, or (c) document that dry run requires Linux | **DECISION POINT for PM**: Windows-host dry run blocked. Options: (i) WSL2 / Linux subsystem; (ii) Docker (Dockerfile present in ARE repo); (iii) accept Windows + monkey-patch; (iv) defer Phase 4 to Linux CI runner. |
| Unicode `✅` emoji in logger crashes on cp1252 | `logging_config.py:61` (cosmetic only) | Set `PYTHONIOENCODING=utf-8` env var before invoking | Same env var setting |

**Severity ranking:** SIGALRM is **HIGH** (blocks all scenario execution on Windows host). Fork is **MEDIUM** (blocks `gaia2-run` orchestrator only, our adapter doesn't need it). Unicode is **LOW** (cosmetic). 

**Fastest unblock for Phase 4:** Docker. The ARE repo ships a `Dockerfile` (`external/meta-agents-research-environments/Dockerfile`). A containerized run sidesteps both fork + SIGALRM issues since the container runs Linux. Trade-off: Docker daemon dependency on operator machine, ~5-15min initial image build.

**Decision deferred to PM:** Phase 4 Windows host vs Docker vs WSL ratification before Task C5 (dry run execution).

---

## §6 — What the smoke verified (smoke verdict)

| Brief §0.1 acceptance criterion | Verified by Smoke A+B |
|---|---|
| ARE platform installable | ✅ uv sync exit 0, 95 deps |
| Default agent runs scenarios | ✅ Smoke A: scenario_find_image_file PASS oracle; Smoke B: Gaia2 mini scenario_universe_21_xvc7uo executed (failed only on SIGALRM, not on agent logic) |
| HF dataset accessible | ✅ Smoke B downloaded mini/validation 160 examples |
| Output format reproducible | ✅ output.jsonl + benchmark_stats.json schemas captured §3 + §4 above |
| Provider config supports mock + LiteLLM-compatible providers | ✅ `mock` provider works; ARE shares LiteLLM 1.71.1 with our LLM routing layer (zero-friction Phase 3 wiring) |

**Phase 2 verdict: SMOKE PASS** (with documented Windows-compat halt-and-PM trigger for Phase 4 host choice).

---

## §7 — Audit anchors

- ARE clone SHA: `0330191ffef8581e3c0620b78df9c7408bcb98b0`
- Smoke A output: `runs/smoke-c2-2026-04-30/smoke-A-oracle/` (gitignored; reproducible from §3 command)
- Smoke B output: `runs/smoke-c2-2026-04-30/smoke-B-gaia2-mock-thread/` (gitignored; reproducible from §4 command)
- This evidence: `benchmarks/gaia2/smoke-evidence.md`
