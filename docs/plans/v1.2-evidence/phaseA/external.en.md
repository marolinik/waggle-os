# Phase A — External verification (READ-ONLY research)

> **English translation** of [external.md](external.md) (Serbian original, same folder). The Serbian original is authoritative; report any discrepancy. Dates are written DD.MM.YYYY; "wd" means working days.

**Revision under review:** `main` = `2af0904df01ca3d374cc78ba95b60dc579dd6a7a` (`git status` clean except for two untracked `.docx` in `docs/`; working tree == HEAD, so every `path:line` below applies to that revision).
**Verification date for all external sources:** 2026-09-27 (unless stated otherwise).
**Method:** WebSearch/WebFetch + `gh api` (read-only) + HF API (`curl`) + read-only `git show/grep` over the repo. No file in `D:/Projects/waggle-os` was modified.
**Context:** BRIEF §3 (D-01..D-18, not reopened), §11.3, §11.4, §13.1, §14, §17 (C6, C19), §18 (A29); S1_AUDIT §2/§3. Working basis G1 → G2 → G3 (BRIEF §5.1).

**Status legend:** DECISION · CONFIRMED AT REVISION · AUDIT FINDING — TO VERIFY · PARTIAL/UNWIRED · PROPOSAL · DEFERRED · UNKNOWN. "Module exists" is never evidence of E2E functionality.

---

## 0. Short summary of findings

| # | Finding | Status |
|---|---|---|
| 1 | Qwen 3.8 27B = `Qwen/Qwen3.8-27B`, HF sha `1d4bf0f2ff6012fd82039f2fa52739d0dd7c60c0`, released 2026-08-14, Apache-2.0, **dense** 27B VL (`model_type: qwen3_5`), 262k native ctx, thinking default-on + `reasoning_effort`, the chat template has `<tool_call>`/`<function=` markers. | CONFIRMED AT REVISION |
| 2 | Ollama library `qwen3.8:27b` = 18 GB (Q4_K_M class), variants q8_0 30 GB, bf16 56 GB, mtp/nvfp4/mxfp8/mlx. Qwen 3.8 27B landed in Ollama **v0.32.12 (14.08.2026)**; Waggle pins `OLLAMA_TARGET_VERSION = '0.32.3'` / rollback `'0.32.0'` (`packages/server/src/local/managed-ollama-runtime.ts:28-29`) — **the pinned runtime is older than the first Qwen 3.8 release.** | AUDIT FINDING — TO VERIFY (repin + pull test) |
| 3 | Official VRAM/RAM per quant **does not exist** on either the HF card or the Ollama page; only secondary estimates exist (Q4_K_M ≈ 17.6 GB @8k ctx up to 33.5 GB @262k). | UNKNOWN (official) / FINDING — TO VERIFY (measure) |
| 4 | Qwen3.6-35B-A3B (control baseline) = MoE 35B/3B active, Apache-2.0, sha `995ad96e…`, 2026-04-24; in the repo the route is **cloud DashScope** (`litellm-config.yaml:211-215`), not local. | CONFIRMED AT REVISION |
| 5 | BuilderIO/agent-native: root `package.json` `"license": "ISC"`, GitHub `license: null` (no root LICENSE), the `@agent-native/*` packages declare MIT; runtime Postgres/PGlite + Nitro. Durable/replay claims are not provable from README/PRODUCT/docs. Remains **pattern reference only**. | CONFIRMED AT REVISION (license) / PARTIAL/UNWIRED (durable) |
| 6 | Omnigent (Databricks, 2026-06-13): Apache-2.0, Python 3.12+ & Node 22, **alpha**, Windows "native but degraded". Reference only. | CONFIRMED AT REVISION |
| 7 | Durable execution: no candidate meets all 4 conditions (embed in Node/Fastify, SQLite, Windows, no separate server, maturity). Closest fit: **Reflow (`danfry1/reflow-ts`, MIT, v0.7.0, SQLite/better-sqlite3 ≥9, 41★)** — small/single-author. DBOS TS = Postgres-only (SQLite only in the Go SDK). | CONFIRMED AT REVISION / PROPOSAL (spike Reflow vs minimal build) |
| 8 | Benchmark: FORTE exists (`AGI-Eval-Official/FORTE`, MIT) but publicly has **15 of 180** tasks. GDPval has no declared dataset license; grading = humans or the OpenAI hosted grader. **APEX-Agents 1.1** (CC-BY-4.0, 240 tasks, open runner + rubrics, published frontier baselines) is the most complete evidence card. | CONFIRMED AT REVISION |
| 9 | Recommendation for the primary professional-work test: **APEX-Agents 1.1** (with the conditions in §4.7). | PROPOSAL (not approved) |
| 10 | A τ²-bench adapter was **not found** in the repo (git grep `tau2|tau-bench|tau_bench|taubench` on HEAD hits only `docs/`); a GAIA2 adapter exists (`benchmarks/gaia2/adapter.ts`, narrow-proxy, not a full evaluation). | CONFIRMED AT REVISION |
| 11 | Channels: WhatsApp personal inbox = unofficial client only (the repo's `whatsapp-adapter.ts:2-5` itself says Baileys violates the ToS); WABP prohibits general-purpose AI assistants from 15.01.2026. Viber = bot only. Discord = bot only (self-bot prohibited). Telegram = Bot API (bot-forward) or user API (risky profile). Slack = user token allowed, subject to ToS storage restrictions. Gmail = restricted scopes → OAuth verification + annual CASA. MS Graph = delegated, without admin consent; publisher verification for multitenant. | CONFIRMED AT REVISION (per channel, see §5) |
| 12 | Prices: `cost-tracker.ts` has Opus 4.6/4.7/4.8 at **$15/$75** (official **$5/$25**), Sonnet 5 at **$3/$15** (official **$2/$10**, permanent), Haiku 3.5 at $0.25/$1.25 (official $0.80/$4, model retired). Three IDs in the table are **retired**. Codex 5.3 and Gemini 2.5 Flash are correct. | CONFIRMED AT REVISION (A29 confirmed) |

---

## 1. Qwen 3.8 27B class (D-15, C19, §11.3) and the control baseline Qwen3.6-35B-A3B

### 1.1 Official model identity

| Field | Value | Source | Status |
|---|---|---|---|
| Model ID | `Qwen/Qwen3.8-27B` | https://huggingface.co/Qwen/Qwen3.8-27B | CONFIRMED AT REVISION |
| Revision (HF `sha`) | `1d4bf0f2ff6012fd82039f2fa52739d0dd7c60c0`; `lastModified` 2026-08-14T15:00:01Z | HF API `/api/models/Qwen/Qwen3.8-27B` (2026-09-27) | CONFIRMED AT REVISION |
| License | Apache-2.0 (`LICENSE` file in the repo, tag `license:apache-2.0`) | same | CONFIRMED AT REVISION |
| Architecture | **Dense**, `architectures: ["Qwen3_5ForConditionalGeneration"]`, `model_type: qwen3_5`, pipeline `image-text-to-text` (VL model, has a vision encoder) | HF API config | CONFIRMED AT REVISION |
| Size | 27B parameters; 18 safetensors shards; BF16 GGUF ≈ 54.7 GB | HF card; unsloth GGUF | CONFIRMED AT REVISION |
| Context | "262,144 natively and extensible up to 1,000,000 tokens" | HF card | CONFIRMED AT REVISION |
| Thinking | "Thinking mode is on by default and can be disabled per request; reasoning depth can be tuned with `reasoning_effort`" | HF card; the template contains `reasoning_effort` ×6, `enable_thinking` ×4 | CONFIRMED AT REVISION |
| Tool calling | The card does not mention it explicitly; the **chat template** (`chat_template.jinja`, 8,952 characters) contains `<tool_call>` ×5, `</tool_call>` ×3, `<tool_response>` ×2, `<function=` ×5, `tools` ×6 — i.e. Qwen-XML/Hermes-style tool use at the template level. Ollama library badge "Tools". | HF API `tokenizer_config.chat_template`; https://ollama.com/library/qwen3.8 | CONFIRMED AT REVISION (template) / TO VERIFY (E2E with the Waggle tool loop) |
| Parser recommendation | The Qwen docs *Function Calling* cover only Qwen3 (`--tool-call-parser hermes`); the Qwen3.6-35B-A3B card recommends `qwen3_coder`; for 3.8 an official recommendation was **not found**. The `<function=` markers correspond to the vLLM `qwen3_xml`/`qwen3_coder` family. | https://qwen.readthedocs.io/en/latest/framework/function_call.html ; HF Qwen3.6-35B-A3B | UNKNOWN (official) / PROPOSAL: test `qwen3_xml` on vLLM and native tools on Ollama |
| Recommended frameworks | SGLang, vLLM, TokenSpeed, Transformers — "use the latest framework versions", **no minimum versions** | HF card | UNKNOWN (versions) |
| Official quant | `Qwen/Qwen3.8-27B-FP8` (official FP8) | HF API `author=Qwen&search=Qwen3.8` | CONFIRMED AT REVISION |
| Qwen 3.8 family (open) | `Qwen/Qwen3.8-27B`, `Qwen/Qwen3.8-Flash-Next`, `Qwen/Qwen3.8-2.4T-A95B` (+ `-FP8` variants). Hosted: Qwen3.8-Max (blog `qwen.ai/blog?id=qwen3.8`). A separate blog post for 27B on qwen.ai was not found. | HF API; https://qwen.ai/blog?id=qwen3.8 ; https://qwen.ai/blog?id=qwen3.8-flash-next | CONFIRMED AT REVISION (existence) / UNKNOWN (Flash-Next size — secondary "180B-A6B") |

### 1.2 GGUF availability and sizes

| Repo | License | Note | Status |
|---|---|---|---|
| `unsloth/Qwen3.8-27B-GGUF` | Apache-2.0 | UD-IQ1_S 6.19 · UD-Q2_K_XL 9.83 · UD-Q3_K_XL 13.1 · UD-IQ4_XS 14.3 · UD-Q4_K_S 15.4 · Q4_0 16.1 · **UD-Q4_K_M 16.5** · UD-Q4_K_XL 17.6 · UD-Q5_K_M 19.8 · UD-Q6_K 22 · **Q8_0 29** · BF16 54.7 (GB) | CONFIRMED AT REVISION |
| `ggml-org/Qwen3.8-27B-GGUF` | (not checked) | exists | UNKNOWN (details) |
| `nvidia/Qwen3.8-27B-NVFP4`, `lmstudio-community/Qwen3.8-27B-MLX-4bit`, `mlx-community/Qwen3.8-27B-8bit` | — | exist | UNKNOWN (details) |

Sources: https://huggingface.co/unsloth/Qwen3.8-27B-GGUF ; https://huggingface.co/ggml-org/Qwen3.8-27B-GGUF

### 1.3 Ollama library tag and required version

| Tag | Size | Ctx | Quant | Digest / updated |
|---|---|---|---|---|
| `qwen3.8:latest` = `qwen3.8:27b` | 18 GB | 256K | (default; same size as q4_K_M) | `e118e4d12a70` · "2 days ago" (≈2026-09-25) |
| `qwen3.8:27b-q4_K_M` | 18 GB | 256K | Q4_K_M | `25b843619e94` · ~1 month |
| `qwen3.8:27b-q8_0` | 30 GB | 256K | Q8_0 | `8f5fb6b71ea0` |
| `qwen3.8:27b-bf16` | 56 GB | 256K | BF16 | `1aa85dae8b2d` |
| `qwen3.8:27b-mtp-q4_K_M` / `-mtp-q8_0` / `-mtp-bf16` | 18/30/56 GB | 256K | MTP (speculative) | — |
| `qwen3.8:27b-nvfp4` · `27b-mxfp8` · `27b-mlx` · `27b-mlx-bf16` | 18 / 32 / 18 / 56 GB | 256K | NVFP4 / MXFP8 / MLX | — |

Source: https://ollama.com/library/qwen3.8/tags (2026-09-27). Badges: Vision, Thinking, Tools. The Ollama page **does not state a minimum version**.

Release notes (https://github.com/ollama/ollama/releases):
- **v0.32.12 (14.08.2026)**: "Qwen 3.8 27B" introduced, `ollama run qwen3.8:27b` and `qwen3.8:27b-mlx`. → first version with Qwen 3.8 27B. CONFIRMED AT REVISION.
- v0.32.15 (19.08.2026): "Qwen 3.8 system messages are now normalized so non-leading system messages are handled consistently"; metadata cache (TTFT ~½). CONFIRMED AT REVISION.
- v0.33.1 (26.08.2026): "MLX: Qwen3.8 Flash Next support". Latest: v0.34.4 (23.09.2026).

**Repo:** `packages/server/src/local/managed-ollama-runtime.ts:28` `OLLAMA_TARGET_VERSION = '0.32.3'`, `:29` `OLLAMA_ROLLBACK_VERSION = '0.32.0'`; Windows zip URLs `:163-203`. → **AUDIT FINDING — TO VERIFY:** the pinned managed runtime (0.32.3) predates v0.32.12; it has not been proven that `qwen3.8:27b` loads on that runtime (same `qwen3_5` arch as Qwen3.5/3.6 27B, so it is possible, but that is not evidence). Required: a repin (≥0.32.12; reasonably ≥0.32.15 because of the system-message normalization) + an actual pull/generate/tool test on the Windows GGML engine + a new router/installer receipt (CLAUDE.md §1 release contract).

Additionally in the repo: `packages/agent/src/model-tier.ts:19` recognizes the prefix `'qwen3.8-'`; `packages/agent/src/cookbook/model-fit.ts:210-214` scores `qwen3.6`→9, `qwen3.5`→8, `qwen3`→4 — **there is no rule for `qwen3.8`** (it would fall back to the generic `qwen3`=4); `cookbook/catalog.ts:45-51` has only Qwen3 (2025) entries. → PARTIAL/UNWIRED (minor, but affects model-fit ranking).

### 1.4 VRAM/RAM per quant

- **Official (HF card, Ollama, unsloth):** no RAM/VRAM guidance. → UNKNOWN.
- **Secondary** (dev.to, 14.08.2026, https://dev.to/purpledoubled/run-qwen-38-27b-locally-real-gguf-sizes-the-kv-cache-trick-and-the-template-trap-114j): the model uses the KV cache in only 16 of 64 layers → KV: 8K 0.5 GB · 32K 2.0 GB · 128K 8.0 GB · 262K 16.4 GB; Q4_K_M total 17.6 / 19.1 / 25.1 / 33.5 GB; "24 GB GPU: Q4_K_M whole, with real context headroom"; 16 GB: IQ4_XS whole or Q4_K_M with offload; 12 GB: only 2-bit with degradation; Apple 32 GB unified OK. "Template trap" note: llama.cpp used directly requires `--jinja`; Ollama/LM Studio pick up the template automatically. → AUDIT FINDING — TO VERIFY (in line with §11.3/A21: measure disk, RAM/VRAM, ctx/KV, offload, latency on representative work; do not assume "24 GB").
- Disk: Q4_K_M 16.5–18 GB, Q8_0 29–30 GB, BF16 ~55–56 GB (+ vision encoder in the Ollama tags).

### 1.5 Control baseline: Qwen3.6-35B-A3B

| Field | Value | Status |
|---|---|---|
| ID / sha / date | `Qwen/Qwen3.6-35B-A3B`, sha `995ad96eacd98c81ed38be0c5b274b04031597b0`, `lastModified` 2026-04-24 | CONFIRMED AT REVISION |
| License | Apache-2.0 | CONFIRMED AT REVISION |
| Architecture | **MoE** `Qwen3_5MoeForConditionalGeneration`; 35B total / 3B active; 256 experts (8 routed + 1 shared), 40 layers, hidden 2048 | CONFIRMED AT REVISION |
| Context | 262,144 native → 1,010,000 | CONFIRMED AT REVISION |
| Thinking / tools | thinking by default (`<think>`), tool use with `--tool-call-parser qwen3_coder`; `sglang>=0.5.10`, `vllm>=0.19.0`; recommendation ≥128K ctx for thinking | CONFIRMED AT REVISION |
| In the repo | `litellm-config.yaml:211-215` alias `qwen3.6-35b-a3b` → `openai/qwen3.6-35b-a3b` @ `https://dashscope-intl.aliyuncs.com/compatible-mode/v1` (**cloud**, `DASHSCOPE_API_KEY`); `packages/agent/src/model-family.ts:66` maps `qwen3.6-*a3b*` → `qwen-reasoning`; the local runbook `benchmarks/gaia2/PILLAR1-QWEN-LOCAL-RUNBOOK.md` and the result `benchmarks/gaia2/PILLAR1-QWEN36-N160-RESULT-2026-05-27.md` exist (not revalidated here) | CONFIRMED AT REVISION (route) / TO VERIFY (whether the old results are local or cloud) |

Conclusion for C19: 27B dense and 35B-A3B MoE are different configurations (dense vs MoE, 27B active vs 3B active) — do not carry over the score or the hardware behavior (BRIEF §11.3). CONFIRMED AT REVISION.

---

## 2. BuilderIO/agent-native and Omnigent (BRIEF §14; S1 §3)

### 2.1 BuilderIO/agent-native

| Field | Value | Status |
|---|---|---|
| Repo | https://github.com/BuilderIO/agent-native — created 2026-03-12; last commit `4f899f1d` 2026-09-27; 6,863★ / 617 forks; latest release **v0.1.271** (2026-09-27) | CONFIRMED AT REVISION |
| Root license | GitHub API `license: null` (no root LICENSE/COPYING); root `package.json` `"name":"agentnative"`, **`"license":"ISC"`**; the README claims MIT | CONFIRMED AT REVISION — S1 finding ("No root LICENSE, ISC vs MIT") is accurate |
| Licenses per package (`package.json` `license` field) | `@agent-native/core` 0.195.0 MIT · `agentkit` 0.4.1 MIT · `toolkit` 0.22.3 MIT · `dispatch` 0.38.15 MIT · `scheduling` 0.2.3 MIT · `skills` 0.3.9 MIT · `frame` 0.1.154 MIT. LICENSE files exist only in `packages/vscode-extension/LICENSE.md` and for fonts (`packages/core/src/assets/fonts/LICENSE_*`). | CONFIRMED AT REVISION (fields) / UNKNOWN (per-file rights — no LICENSE text in the packages) |
| Packages in the monorepo | agent-browser-extension, agent-chrome-extension, agentkit, browser-control-extension-core, code-agents-ui, core, creative-context, desktop-app, dispatch, docs, embedding, frame, migrate, mobile-app, pinpoint, recap-cli, scheduling, shared-app-config, skills, toolkit, vscode-extension | CONFIRMED AT REVISION |
| What is implemented (README) | "Shared actions" (agent, UI, HTTP, MCP, A2A, CLI), "shared data", "shared application state"; agent chat, auth/permissions, skills & memory, automations (scheduled/event), agent teams; **PostgreSQL backend (PGlite for local dev)**; runtime "any Nitro-compatible host" (Node/serverless) | CONFIRMED AT REVISION |
| Event log / durable / replay | README and PRODUCT.md: **0** hits for durable/replay/event log/heartbeat/proof. GitHub code search (repo-wide, includes tests/code): `durable` 1206, `replay` 786, `idempotency` 257, `heartbeat` 139, `"proof receipt"` 76 — the words exist in the code, but a documented guarantee does not. `docs/agent-run-stop-conditions.md` (2026-08-21, `core@0.168.5`): stop conditions in `runAgentLoop` (`maxIterations` 400, `maxRunInputTokens` 20M) and "a healthy run killed by a watchdog — has been patched at least six times in four months". | PARTIAL/UNWIRED — the S1 claim "per-step replay not yet built" is neither confirmed nor refuted without reading `packages/core/agent/production-agent.ts`; TO VERIFY if anything beyond a pattern reference is ever considered |
| Fit for Waggle | Postgres/PGlite + Nitro vs Waggle SQLite/Fastify/Tauri → low API fit; a mandatory framework change is not allowed (D-17, §14). | DECISION (D-17) + PROPOSAL: pattern reference only (actions-once, event log, proof receipts), no dependency and no code copying until the LICENSE is clear per file — in line with S1 §3 |

### 2.2 Omnigent

| Field | Value | Status |
|---|---|---|
| Repo | https://github.com/omnigent-ai/omnigent — created 2026-06-11; Databricks announcement 2026-06-13 (https://www.databricks.com/blog/introducing-omnigent-meta-harness-combine-control-and-share-your-agents); 10,293★ / 1.6k forks; latest **v0.15.0** (2026-09-24); last commit `56c6a7f7` 2026-09-27 | CONFIRMED AT REVISION |
| License | Apache-2.0 (`LICENSE` + `NOTICE` in the root) | CONFIRMED AT REVISION |
| Language | GitHub languages: Python 59.5 MB, TypeScript 13.1 MB, JS 1.2 MB, Swift/Kotlin/Rust less; `pyproject.toml`, `uv.lock`, `.python-version` | CONFIRMED AT REVISION |
| Maturity | Badge **"Status: alpha"** | CONFIRMED AT REVISION |
| Requirements | Python 3.12+, Node.js 22 LTS+, npm, pnpm, git, uv, tmux, bubblewrap (Linux) | CONFIRMED AT REVISION |
| Harness adapters | Claude Code, Codex, Cursor, Antigravity, OpenCode, Hermes, Pi, Grok Build, Devin, custom YAML agents | CONFIRMED AT REVISION |
| Invocation of external agents | subprocess/tmux terminal wrappers; **ACP (Agent Client Protocol) over stdio**; SDK harnesses (claude-sdk, cursor, codex) | CONFIRMED AT REVISION |
| Windows | "Native but degraded": available: `omnigent server`, web UI, SDK harnesses; **unavailable**: native terminal wrappers, bwrap/seatbelt sandbox, L7 egress proxy | CONFIRMED AT REVISION |
| Fit | The Python runtime violates the no-Python Windows package (CLAUDE.md §1); alpha. → reference for adapter contracts (ACP, result return, policy) — not a foundation. | DECISION (D-11, §14) + PROPOSAL: reference only |

---

## 3. Durable execution candidates (A8, §6, §14)

Criteria: (a) embed in the Node/Fastify sidecar without a separate server, (b) SQLite backend, (c) Windows, (d) permissive license, (e) maturity/maintenance. Waggle already ships `better-sqlite3` **12.6.2** (`package.json:73`; `packages/*/package.json` `^12.6.2`).

| Candidate | License | Separate server? | SQLite? | Windows | Maturity (2026-09-27) | Assessment |
|---|---|---|---|---|---|---|
| **DBOS Transact TS** `dbos-inc/dbos-transact-ts` | MIT | No (library), but **Postgres required** (README: "built on top of Postgres") | **Not in TS** — SQLite backend added only in **DBOS Go v0.17** (blog June 2026) | yes (Node) | v5.1 (2026-09-24), 1,376★ | Does not meet (b) |
| **Absurd** `earendil-works/absurd` | Apache-2.0 | Workers pull from the database; "entirely based on Postgres and nothing else" | No | — | "An experiment in durability", 2,443★, push 2026-08-10 | Does not meet (b) |
| **Inngest** `inngest/inngest` + `inngest-js` | Server: **SSPL** + "Apache 2.0 Future License" (delayed); SDK `inngest@4.21.0` `package.json` **Apache-2.0** (GitHub's repo detection says GPL-3.0 → mismatch, check the LICENSE file) | **Yes** — dev/self-host server (single binary, bundled Redis+SQLite) | internally in the server | known issues (`inngest/inngest#449` Win11) | active, 5,894★ | Does not meet (a); server license non-OSI |
| **Restate** `restatedev/restate` + `sdk-typescript` | Server **BSL 1.1**; SDK MIT | **Yes** (restate-server) | no (RocksDB) | **No Windows binary** (macOS/Linux only; community fork) | active | Does not meet (a),(c); BSL |
| **Temporal** `temporalio/temporal` + `sdk-typescript` | MIT (both) | **Yes** — `temporal server start-dev --db-filename` (single binary, SQLite, has `temporal.exe`) | yes (dev server) | yes | mature, 23k★; TS SDK Node ≥20, Rust core native | Does not meet (a) strictly; too heavy as a bundled "sidecar of the sidecar" |
| **LangGraph JS SqliteSaver** `@langchain/langgraph-checkpoint-sqlite` | MIT | No | **Yes** (`better-sqlite3 ^11.7.0` → **conflict with 12.6.2**, two native builds) | yes | maintained (langgraphjs 3,320★) | Partial: only a checkpointer for LangGraph graphs, not run lifecycle; requires the LangGraph runtime |
| **Vercel Workflow DevKit** `vercel/workflow` | Apache-2.0 | No for the local "Local World" (JSON files in `.workflow-data/`, in-memory queue, "not production"); self-host = Postgres World or a custom World | no (JSON files) | yes | 2,439★, active, public beta | Partial: a custom World over SQLite = BUILD work |
| **Reflow** `danfry1/reflow-ts` | **MIT** | **No** ("no external services required") | **Yes**: `reflow-ts/sqlite-node` (better-sqlite3 **≥9**, so 12.6.2 is OK), `node:sqlite`, `bun:sqlite` | yes | **v0.7.0**, created 2026-03-11, push 2026-09-14, **41★**, single author | **Closest fit** — but a small user base; features: lease/heartbeat, retries, cooperative cancel (`AbortSignal`), `sleep`/`waitFor` with lease release, idempotent enqueue, `getRunStatus()` |
| iterativeflow `ahmedrowaihi/iterativeflow` | MIT | No | yes (multi-backend) | yes | created 2026-05-28, 14★ | Immature |
| OpenWorkflow `openworkflowdev/openworkflow` | Apache-2.0 | ? | ? | ? | 1,323★ | UNKNOWN (not evaluated) |
| Resonate `resonatehq/resonate` | Apache-2.0 | **Yes** (single binary; SQLite dev / Postgres prod) | in the server | UNKNOWN | 674★ | Does not meet (a) |
| persistasaurus `gunnarmorling/persistasaurus` + blog 2025-11-20 | Apache-2.0 | No | Yes | — | Java, <1000 LOC, "not a production-ready engine"; no retry/backoff, parallelism, compensation, definition evolution | Reference for BUILD |
| durabletasks `danthegoodman1/durabletasks` | **no license** | — | — | — | dead (2024) | No |

**Conclusion (CONFIRMED AT REVISION):** there is no drop-in engine that meets all conditions. S1 §3 ("Build ~600-1000 LOC on better-sqlite3") remains a valid option; BRIEF §14 says this is not decided in advance. **PROPOSAL for an ADR (A8):** a bounded spike — (1) ADAPT Reflow (MIT, better-sqlite3-compatible; code/test review, vendor or fork, bus factor 1), vs (2) a minimal BUILD over better-sqlite3 with Reflow/persistasaurus/Morling as references; in both cases retention/GC, schema versions, stable `actionId` vs `attemptId` (§6.5) and a side-effect journal (A6/A7). None of this requires Postgres or a separate process.

Sources: https://www.dbos.dev/blog/new-in-dbos-june-2026 ; https://github.com/dbos-inc/dbos-transact-ts ; https://github.com/earendil-works/absurd ; https://github.com/inngest/inngest ; https://github.com/restatedev/restate ; https://docs.temporal.io/develop/run-a-development-server ; https://www.npmjs.com/package/@langchain/langgraph-checkpoint-sqlite ; https://useworkflow.dev/docs/deploying/world/local-world ; https://github.com/danfry1/reflow-ts ; https://www.morling.dev/blog/building-durable-execution-engine-with-sqlite/ ; https://github.com/resonatehq/resonate

---

## 4. Benchmark evidence cards (§13.1, D-18, DIR-22)

State in the repo (CONFIRMED AT REVISION): `benchmarks/gaia2/adapter.ts` exists ("Gaia2 ARE narrow-proxy adapter … NOT a full Gaia2 evaluation; it is cost-projection"); the Phase 3 HALT ($4.09/invocation) is recorded in CLAUDE.md §10 C-3 and `benchmarks/gaia2/*.md`. **A τ² adapter was not found in the code** (git grep on HEAD for `tau2|tau-bench|tau_bench|taubench` hits only `docs/briefs/…`, `docs/decisions/…`, `docs/plans/BENCHMARK-LANDSCAPE-RESEARCH-2026-05-22.md`, `docs/strategy/…`). Branch `origin/feature/harness-sota-bench` @ `18e5b36a` (2026-07-01): 66 commits ahead of, **2,022** behind `main`.

### 4.1 τ²-bench (Sierra)
- **Source/version:** https://github.com/sierra-research/tau2-bench — MIT; **v1.0.1** (July 2026); push 2026-09-19; 2,111★; Python ≥3.12 <3.14. CONFIRMED.
- **Tasks:** domains `mock · airline · retail · telecom · banking_knowledge`. `data/tau2/domains/airline/split_tasks.json`: base **50** (train 30/test 20); `retail`: base **114** (74/40); `telecom`: `tasks_small.json` = 20, the full set in `tasks.json` (14 MB, not counted; the paper states 114) → TO VERIFY; `banking_knowledge` ≈100 (docs: "about 9 out of ~100"). Voice variants (τ³) exist.
- **Runner/scorer:** open (`tau2` CLI). Grading is deterministic: DB hash after replay of the reference actions × `communicate_info` strings (`reward_basis` default `["DB","COMMUNICATE"]`); `NL_ASSERTION` = LLM judge (experimental). **Requires an LLM user-simulator** (`--user-llm gpt-4.1` in the examples) → cloud cost/dependency. CONFIRMED.
- **License/terms:** MIT. **Locally executable:** yes (Python), without Docker.
- **Published baselines (taubench.com, 2026-09-27):** τ² text: Qwen3.5-397B-A17B 87.9%, Gemini 3.0 Pro 85.4%, Claude Opus 4.5 85.3%; τ³-Banking: Qwen 3.8 Max 55.2%, Claude Opus 5 48.7%, Grok 4.5 47.9%. CONFIRMED (leaderboard).
- **Integration:** a Waggle adapter does not exist → an agent interface in Python (Agent Developer Guide) that would call the production sidecar over HTTP; effort **M**. Domain = customer service tool-agent, **not a knowledge-work deliverable** → a control for tool-use, not the primary test.

### 4.2 GAIA2 / ARE (Meta)
- **Source:** https://github.com/facebookresearch/meta-agents-research-environments (code **MIT**, 558★, push 2026-08-26); dataset https://huggingface.co/datasets/meta-agents-research-environments/gaia2 (**CC-BY-4.0**, synthetic data under the Llama 3.3 / Llama 4 licenses). CONFIRMED.
- **Tasks:** 800 validation scenarios / 10 universes; 5 capabilities × 160 (Execution, Search, Adaptability, Time, Ambiguity) + Agent2Agent/Noise augmentations; `gaia2-mini` 160; test set private (the leaderboard uses validation). CONFIRMED.
- **Runner/scorer:** `uvx --from meta-agents-research-environments are-benchmark gaia2-run …`; any model via LiteLLM; judge = **Llama 3.3 70B Instruct** + exact-match. Docker is not required. CONFIRMED.
- **Baselines (HF blog, 2025-09):** GPT-5 (high) best; Kimi K2 best open; Execution/Search "close to solved", Time the hardest; numbers not extracted → UNKNOWN (in the blog/paper).
- **Integration:** the adapter exists (narrow-proxy), but the $4.09/invocation economics and the need for the ARE environment (C-3). Effort **M** (adapter) / cost **H**. General agent, not a professional deliverable.

### 4.3 GDPval (OpenAI)
- **Source:** https://huggingface.co/datasets/openai/gdpval (sha `11e7900c`, `lastModified` 2026-02-10); paper arXiv 2510.04374; https://openai.com/index/gdpval/ (fetch 403). CONFIRMED (existence).
- **Tasks:** gold subset **220** tasks / 44 occupations / 9 sectors (paper: 1,320 in total; only gold is public). Card: prompt + reference files + deliverable files + `rubric_pretty`/`rubric_json` → whether rubrics exist for all tasks: **TO VERIFY**. Contains a canary string; NSFW warning.
- **License:** the HF card has **no** license tag; the arXiv page shows CC-BY-4.0 for the **paper**, not the dataset. → **UNKNOWN** (dataset terms of use).
- **Grading:** blind pairwise comparison by experts (win/tie rate) + an "experimental automated grader" hosted at https://evals.openai.com (content inaccessible to fetch; secondary: ~66% agreement with humans). → locally executable for **deliverable production**, but **grading requires humans or the OpenAI hosted grader** (cloud dependency; acceptable for Waggle BYOK, not for KVARK mode D-03).
- **Baselines:** not extracted from the official source (403/PDF too large) → UNKNOWN.
- **Integration:** no tool environment (files in → file out) → harness **M**; grading validity **H**.

### 4.4 APEX-Agents 1.1 (Mercor)
- **Source/version:** https://huggingface.co/datasets/mercor/apex-agents-v1.1 — **CC-BY-4.0**; blog https://www.mercor.com/blog/introducing-apex-agents-1-1/ (2026-09-08); reference agent https://github.com/Mercor-Intelligence/apex_loop_truncated_tools_agent ; Archipelago infrastructure https://github.com/mercor-intelligence/archipelago (**Apache-2.0**, 282★, push 2026-09-25). CONFIRMED.
- **Tasks:** **240** (80 × investment banking, management consulting, corporate law); real project files + applications (documents, spreadsheets, PDF, email, chat, calendar). CONFIRMED.
- **Runner/scorer:** **Harbor 0.20.0** (`uv tool install harbor==0.20.0`), 3 shared `linux/amd64` Docker images; command `harbor run -p apex-agents-v1.1/tasks -a … -m anthropic/claude-opus-5`; rubrics with binary criteria, judge **DeepSeek-v4-Flash-0731 (t=0.1)**; 1.1 "no longer rewards noncommittal answers". CONFIRMED.
- **Locally executable:** yes, with Docker (on Windows: WSL2) — on the dev/bench machine; **not** a product requirement (the certified desktop stays without Docker).
- **Baselines (blog 2026-09-08):** Claude Fable 5.1 **68.6% pass@1**; GPT-6 Astra **56.3% pass^4** (highest pass^4); the authors highlight the pass@4 vs pass^4 gap. CONFIRMED (as published).
- **Integration:** a Harbor agent shim that calls the Waggle production sidecar inside/outside the container (DIR-22), pinned dataset+Harbor+judge; effort **M–H**; cost = judge API + model.

### 4.5 FORTE (LongCat / AGI-Eval)
- **Source:** https://github.com/AGI-Eval-Official/FORTE — **MIT**; created 2026-06-29, last push **2026-06-30**, 20★. Leaderboard https://AGI-Eval-Official.github.io/FORTE/. CONFIRMED.
- **Tasks:** "180 tasks, ≥10 per profession across 15 professions" (Marketing, Sales, BA, Ops, Dev, SRE, HR, Finance, PM, Legal, Algorithm, QA, UI/UX, Admin, General); **public: `data/tasks` = 15 demo tasks** (1 per profession); SRE skills omitted; the full set is not public. CONFIRMED.
- **Runner/scorer:** OpenClaw agent inside a Docker image; Python 3.10+ stdlib + `docker` CLI; **LLM-as-judge all-or-nothing** (`score = 1` iff all rubric items pass); `solution/` reference answers for the judge; Windows via Docker Desktop + WSL2. CONFIRMED.
- **Baselines:** on the leaderboard page (not extracted) → UNKNOWN.
- **Integration:** the runtime is tied to OpenClaw (roadmap-only in Waggle, CLAUDE.md §1) → adapter **H**; with 15 public tasks it is insufficient for the primary test.

### 4.6 OdysseyBench (Microsoft)
- **Source:** https://github.com/microsoft/OdysseyBench — **MIT**; 18★; last push 2026-06-11; paper arXiv 2508.09124 (2025-08-12). CONFIRMED.
- **Tasks:** OdysseyBench+ **300** (real use-case) + OdysseyBench-Neo **302** (synthetic, HomerAgents); applications Word, Excel, PDF, Email, Calendar. CONFIRMED.
- **Runner/scorer:** OfficeBench Docker environment (testbed files), `llm-as-a-judge.py` + rule-based cross-validation; `agent_interact.py` for a custom agent. Baseline numbers in the paper (not extracted) → UNKNOWN.
- **Relevance:** focus on long-horizon memory/retrieval → directly relevant to the Hive Mind thesis (D-12), but low activity/maintenance; effort **M–H**.

Other candidates seen in the search, **not evaluated** (UNKNOWN): Agents' Last Exam (arXiv 2606.05405, 960 workflows), OmegaUse-OfficeVal (2607.27155), Workspace-Bench 1.0 (2605.03596), WorkBench Revisited (2606.13715), FORCE-Bench (2607.19409 — name similar to FORTE, a different thing: enterprise finance).

### 4.7 Recommendation: ONE primary professional-work test — **PROPOSAL, not approved**

**Proposal: APEX-Agents 1.1 as the primary test for the G2/G3 study.** Rationale per the §13.1 criteria:
1. Official source/version is pinnable (HF dataset `mercor/apex-agents-v1.1` + Harbor 0.20.0 + image digests + judge model/version).
2. Tasks and rubrics are fully public (CC-BY-4.0) — unlike FORTE (15/180) and GDPval (no license, grading by OpenAI/humans).
3. Runner and scorer are open (Harbor/Archipelago Apache-2.0); grading is reproducible with a pinned judge.
4. Artifact/tool environment = documents, spreadsheets, PDF, email, chat, calendar → matches the knowledge-work vertical (D-06) and the Home mail/calendar scenario (§5.2).
5. Published frontier baselines on the **same protocol** (Claude Fable 5.1 68.6% pass@1) → enables the "system-to-system" comparison from §13.2 with a clearly named configuration, without adopting someone else's protocol.
6. Does not require Waggle to "win" (D-18): the permitted outcomes of §13.5 remain.

**Conditions/risks (must go into the §13.6 manifest):** the judge is a cloud API model (DeepSeek-v4-Flash-0731) — cost and dependency; replacing the judge with a local model breaks comparability with the leaderboard, so it is reported as a separate profile; Docker/WSL2 only on the bench machine; Waggle must go through the production sidecar path (DIR-22) via the Harbor agent shim; contamination firewall (§13.4) — rubrics and `solution` files do not enter `.mind`.

**Secondary:** τ²-bench as a tool-use control only if the adapter is built (not found in the code); keep the GAIA2 adapter for cost-projection; GDPval optional for deliverable quality with human graders later. Everything listed is a PROPOSAL (BRIEF §20.4), not an approved decision.

---

## 5. Channels — ToS per concrete use case (C6, §11.4)

**Use case:** "a personal desktop assistant reads my own inbox/chat and can send with my approval". Profiles: **live API** · **bot/forward** · **export/import** · **roadmap**.

| Channel | Profile | What the official terms say | Repo state (revision `2af0904d`) | Status |
|---|---|---|---|---|
| **WhatsApp** | **export/import** (+ roadmap); live personal = NO | (1) WhatsApp Business Platform: "AI Providers" (LLM, gen-AI platforms, **general-purpose AI assistants**) from **15.01.2026** may offer such services only where legally required (new API users from 15.10.2025 immediately); non-template messages from AI Providers are charged from 16.02.2026 (stopped in some markets on 13.05.2026). WABP is a business number — it does not read the user's personal inbox. (2) Personal account via unofficial libraries: the WhatsApp ToS prohibits "reverse engineer, alter, modify… extract code", "gain… unauthorized access", "bulk messaging, auto-messaging", "software or APIs that function substantially the same as our Services". (3) Chat export is an app feature (the ToS text does not mention it). | `packages/server/src/local/channels/whatsapp-adapter.ts:2` "Baileys (unofficial multi-device WebSocket)", `:5` "Baileys is an UNOFFICIAL client that violates WhatsApp's ToS; accounts can [be banned]" → **not a shipping default** | CONFIRMED AT REVISION (the S1 cut "cut live harvest" is confirmed) |
| **Viber** | **bot/forward** or roadmap/drop | Only the Chat Bot API (bot ↔ subscribed user; the user initiates the communication; the user can unsubscribe) + Business Messages via partners; Developer Terms: license "for commercial and authorized purposes and **not for personal use**"; no API for a personal account. TLS ≥1.2. | no Viber adapter (grep `viber` → 0 in `packages/server/src`, `packages/agent/src`) | CONFIRMED AT REVISION |
| **Discord** | **bot/forward** | Self-bots/automation of user accounts prohibited (Discord support "Automated User Accounts (Self-Bots)"; fetch 403 — text TO VERIFY); the bot sees only channels where it is a member; `MESSAGE_CONTENT` is a **privileged intent** (verification for ≥100 servers), but "Content in DMs with the app" arrives without the intent; the bot cannot read the user's DMs with others. | `discord-adapter.ts:4` "the bot dials OUT to Discord's gateway", `:20` `https://discord.com/api/v10` → bot model, compliant | CONFIRMED AT REVISION (bot) / TO VERIFY (policy quote) |
| **Telegram** | **bot/forward** (now); user API = **roadmap with an ADR** | Bot API: the bot receives "All messages from private chats with users" (with it), privacy mode in groups; it does not see the user's other chats, does not see other bots. User API (MTProto/TDLib, `api_id`): third-party clients allowed; prohibited: "making actions on behalf of the user without the user's knowledge and consent"; using the data to train AI is prohibited. | `telegram-adapter.ts:17` `https://api.telegram.org`, `:40` `botToken` (50s long-poll) → Bot API | CONFIRMED AT REVISION |
| **Slack** | **live API (user token)** subject to ToS storage restrictions | User token (`xoxp`) = the access the user has; write as the user. API ToS (Effective **10.10.2025**): prohibited "use API Data to train a large language model", "bulk export Slack message and file data" except under an additional agreement; for the Data Access/Real-Time Search API "may not create persistent copies, archives, indexes, or long-term data stores of other organizations' API Data"; "explicit authorization from the organization installing your Application". | `packages/agent/src/connectors/slack-connector.ts` exists (E2E not verified) | CONFIRMED AT REVISION (rules) / TO VERIFY (legal: local persistent storage of one's own messages vs the "persistent copies" clause) |
| **Gmail** | **live API with verification** / BYO-client / export-import (Takeout) | `gmail.readonly`, `gmail.modify`, `gmail.compose`, `gmail.metadata`, `mail.google.com` = **Restricted**; `gmail.send` = Sensitive; `gmail.labels` = non-sensitive. Restricted → OAuth app verification ("can potentially take several weeks") + "annual security assessment"; the assessment is mandatory for "every app that requests access to Google users' restricted data **and has the ability to access data from or through a third-party server**" — an exemption for purely local applications is **not explicit** on the fetched pages; reverification every 12 months from the LOA; unverified app cap **100 new users**; exceptions: "Apps in development", "Internal apps", OAuth plugins. | `packages/agent/src/connectors/gmail-connector.ts`, `gcal-connector.ts` exist (E2E not verified) | CONFIRMED AT REVISION (scope classification) / TO VERIFY (CASA exemption for local-only desktop; price and tier) |
| **Microsoft Graph** | **live API** (most favorable path) | `Mail.Read`, `Mail.ReadWrite`, `Mail.Send`, `Calendars.Read`, `Chat.Read` — delegated available, **admin consent not required**; admins can restrict via an application access policy. Publisher verification (free; requires a verified Microsoft AI Cloud Partner Program account + publisher domain) — since 08.11.2020 users in tenants with risk-based step-up consent **cannot** approve new multitenant non-publisher-verified applications. | `outlook-connector.ts`, `ms-teams-connector.ts`, `onedrive-connector.ts` exist (E2E not verified) | CONFIRMED AT REVISION / TO VERIFY (personal MSA accounts, `Chat.Read` work/school only) |

Note (BRIEF §11.4): the injection scanner is defense-in-depth; harvested mail/chat carries taint/provenance and cannot approve an external effect. This research does not change that.

Sources: https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/ai-providers ; https://www.whatsapp.com/legal/terms-of-service ; https://developers.viber.com/docs/general/api-access-white-paper/ ; https://www.viber.com/en/terms/viber-developer-distribution-agreement/ ; https://support.discord.com/hc/en-us/articles/115002192352-Automated-User-Accounts-Self-Bots ; https://docs.discord.com/developers/events/gateway#privileged-intents ; https://core.telegram.org/bots/faq ; https://core.telegram.org/api/terms ; https://slack.com/terms-of-service/api ; https://docs.slack.dev/authentication/tokens/ ; https://developers.google.com/workspace/gmail/api/auth/scopes ; https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification ; https://support.google.com/cloud/answer/13464321 ; https://support.google.com/cloud/answer/7454865 ; https://learn.microsoft.com/en-us/graph/permissions-reference ; https://learn.microsoft.com/en-us/entra/identity-platform/publisher-verification-overview

---

## 6. Provider prices vs `packages/agent/src/cost-tracker.ts` (A29, §13.6)

Official sources (2026-09-27): Anthropic https://platform.claude.com/docs/en/about-claude/pricing ; OpenAI https://developers.openai.com/api/docs/pricing ; Google https://ai.google.dev/gemini-api/docs/pricing ; Anthropic deprecations https://platform.claude.com/docs/en/about-claude/model-deprecations

`DEFAULT_MODEL_PRICING` is at `cost-tracker.ts:26-48`; the values are "per 1K" (×1000 = per 1M).

| `cost-tracker.ts` line | Model ID | In code ($/1M in/out) | Official ($/1M in/out) | Finding |
|---|---|---|---|---|
| :28 | `claude-opus-4-8` | **15 / 75** | **5 / 25** (cache write 6.25, cache hit 0.50) | **MISMATCH ×3** — A29 confirmed |
| :29 | `claude-opus-4-7` | 15 / 75 | 5 / 25 | **MISMATCH ×3** |
| :30 | `claude-opus-4-6` | 15 / 75 | 5 / 25 | **MISMATCH ×3** |
| :32 | `claude-sonnet-5` | 3 / 15 | **2 / 10** (footnote: the introductory price became standard; the 1.9.2026 increase "will not occur") | **MISMATCH** |
| :33 | `claude-sonnet-4-6` | 3 / 15 | 3 / 15 | OK |
| :34 | `claude-sonnet-4-20250514` | 3 / 15 | 3 / 15, but the model was **Retired 15.06.2026** | price OK, **ID retired** |
| :35 | `claude-3-5-sonnet-20241022` | 3 / 15 | not on the pricing page; **Retired 28.10.2025** (`litellm-config.yaml:26-28` alias → `anthropic/claude-sonnet-4-6`) | **ID retired** (alias kept in the router) |
| :37-38 | `claude-haiku-4-5`, `-20251001` | 1 / 5 | 1 / 5 | OK |
| :39-40 | `claude-haiku-3-5`, `claude-3-5-haiku-20241022` | 0.25 / 1.25 | **0.80 / 4** (Haiku 3.5); model **Retired 19.02.2026** | **MISMATCH** (Haiku 3 price entered) + ID retired |
| :42-43 | `gemini-2.5-flash` | 0.30 / 2.50 | 0.30 / 2.50 (text/image/video) | OK (note: 2.5 is "previous generation"; 3.7/3.8 Flash = 0.75/3.75) |
| :45-47 | `gpt-5.3-codex` (3 prefixes) | 1.75 / 14 | 1.75 / 14 (cached in 0.175) | OK |
| :66 | `fallbackPricingFor` Opus | 15 / 75 | 5 / 25 | **MISMATCH ×3** for unknown Opus IDs |
| :67 | fallback Haiku | 1 / 5 | 1 / 5 (4.5) | OK |
| :68 | fallback Sonnet (default for everything else) | 3 / 15 | Sonnet 5 = 2 / 10; Sonnet 4.6 = 3 / 15 | depends on the model |

Additionally (CONFIRMED AT REVISION): models from `litellm-config.yaml` without a row in the table fall through to the Sonnet fallback with a `console.warn` (`cost-tracker.ts:498-508`): `gpt-4o` (officially 2.50/10), `gpt-4o-mini` (0.15/0.60), `o3` (2/8), `gemini-2.5-pro` (1.25/10 ≤200k), grok/deepseek/perplexity/kimi/qwen-max (not checked) → wrong estimate in both directions. The comment at `cost-tracker.ts:24-25` ("Model IDs cross-checked against litellm-config.yaml") is inconsistent: `litellm-config.yaml` has no `claude-opus-4-8`/`claude-opus-4-7` model_name (it has `claude-opus-4-6` and `claude-opus-4-7-via-openrouter`).

Benchmark branch `origin/feature/harness-sota-bench` @ `18e5b36a` (2026-07-01), `packages/agent/src/cost-tracker.ts`: `:33` `claude-opus-4-8` 5/25 (correct), `:28` `claude-opus-4-6` and `:32` `claude-opus-4-7` 15/75 (incorrect; comment `:29-30` "Opus 4.7 stays at the 4.6 list price; Opus 4.8 is the $5/$25 generation"). → S1 A29 conflict confirmed; **neither branch is fully correct**. CONFIRMED AT REVISION.

Other relevant official items (for the §13.6 manifest): Anthropic batch −50%, cache hit 0.1× (Fable 5.1 0.025×, Opus 5.5 0.05×), `inference_geo: "us"` ×1.1, web search $10/1k searches; Opus 5 = 5/25, Opus 5.5 = 4/20, Fable 5.1 = 10/50; the Claude ≥4.7 tokenizer produces ~30% more tokens for the same text. OpenAI: gpt-5.4 2.50/15, gpt-5.5 5/30, gpt-5 1.25/10. Google: Gemini 2.5 Pro 1.25/10 (≤200k), 2.5 Flash-Lite 0.10/0.40.

**Local is not zero cost** (§13.6): GPU time/energy/hardware for Qwen 3.8 27B must go into the manifest separately from the cloud bill; this document does not provide those numbers (UNKNOWN — to be measured).

---

## 7. What remains open / not confirmed

| Item | Status | What would close it |
|---|---|---|
| Whether Ollama 0.32.3 (pin) loads `qwen3.8:27b` on Windows GGML | UNKNOWN | Pull/generate/tools test; likely a repin to ≥0.32.15 + a new receipt |
| Official minimum versions of vLLM/SGLang/llama.cpp for Qwen3.8-27B; recommended tool parser | UNKNOWN | Qwen docs update or empirical test (`qwen3_xml`) |
| Measured VRAM/RAM/latency per quant and ctx (A21) | FINDING — TO VERIFY | Hardware ladder measurement |
| Whether the old Qwen3.6-35B-A3B results are local or via DashScope | TO VERIFY | Review of the `benchmarks/gaia2/PILLAR1-QWEN36-N160-RESULT-2026-05-27.md` manifest |
| agent-native per-file rights and actual durable/replay semantics | PARTIAL/UNWIRED | LICENSE in the repo; reading `packages/core/agent/production-agent.ts` |
| Inngest SDK license (Apache-2.0 in `package.json` vs GPL-3.0 GitHub detection) | PARTIAL | Read `LICENSE*` in `inngest/inngest-js` |
| τ² telecom/banking full task count; GDPval/OdysseyBench/FORTE baseline numbers | UNKNOWN | Reading the paper/leaderboard (PDF too large to fetch) |
| GDPval dataset license and evals.openai.com grader terms | UNKNOWN | HF card/OpenAI page (403 on fetch) |
| Exact Discord Developer Policy quote (self-bots) | TO VERIFY | Page returns 403 to automated fetch; manual |
| Gmail CASA exemption for local-only desktop; price/tier | TO VERIFY | Google OAuth Verification FAQ / assessor |
| Slack "persistent copies" clause vs local personal memory | TO VERIFY (legal) | Legal review of API ToS §Data Access |
| MS Graph for personal MSA accounts (outlook.com) | TO VERIFY | Test with an MSA account |
| Dates in Ollama release notes shown without a year ("14 Aug") | note | Year 2026 inferred from context (v0.32.x August 2026) |

---

## 8. Source register (all checked 2026-09-27)

**Qwen:** https://huggingface.co/Qwen/Qwen3.8-27B · https://huggingface.co/api/models/Qwen/Qwen3.8-27B · https://huggingface.co/Qwen/Qwen3.8-27B-FP8 · https://huggingface.co/Qwen/Qwen3.6-35B-A3B · https://huggingface.co/unsloth/Qwen3.8-27B-GGUF · https://huggingface.co/ggml-org/Qwen3.8-27B-GGUF · https://ollama.com/library/qwen3.8 · https://ollama.com/library/qwen3.8/tags · https://github.com/ollama/ollama/releases (v0.32.12, v0.32.15, v0.33.1, v0.34.4) · https://qwen.readthedocs.io/en/latest/framework/function_call.html · https://qwen.ai/blog?id=qwen3.8 · https://qwen.ai/blog?id=qwen3.8-flash-next · https://dev.to/purpledoubled/run-qwen-38-27b-locally-real-gguf-sizes-the-kv-cache-trick-and-the-template-trap-114j (secondary)

**OSS harness:** https://github.com/BuilderIO/agent-native (+ `gh api` contents/packages, releases, commits, search/code) · https://github.com/omnigent-ai/omnigent · https://www.databricks.com/blog/introducing-omnigent-meta-harness-combine-control-and-share-your-agents

**Durable:** see the §3 list.

**Benchmark:** https://github.com/sierra-research/tau2-bench (+ `docs/evaluation.md`, `data/tau2/domains/*/split_tasks.json`) · https://taubench.com · https://github.com/facebookresearch/meta-agents-research-environments · https://facebookresearch.github.io/meta-agents-research-environments/user_guide/gaia2_evaluation.html · https://huggingface.co/blog/gaia2 · https://huggingface.co/datasets/openai/gdpval · https://arxiv.org/abs/2510.04374 · https://huggingface.co/datasets/mercor/apex-agents-v1.1 · https://www.mercor.com/blog/introducing-apex-agents-1-1/ · https://github.com/mercor-intelligence/archipelago · https://github.com/AGI-Eval-Official/FORTE · https://github.com/microsoft/OdysseyBench · https://arxiv.org/abs/2508.09124

**Channels:** see the §5 list.

**Prices:** https://platform.claude.com/docs/en/about-claude/pricing · https://platform.claude.com/docs/en/about-claude/model-deprecations · https://developers.openai.com/api/docs/pricing · https://ai.google.dev/gemini-api/docs/pricing

**Repo (read-only, revision `2af0904d`):** `packages/agent/src/cost-tracker.ts:24-68,498-508` · `packages/server/src/local/managed-ollama-runtime.ts:28-29,163-203` · `litellm-config.yaml:9-213` · `packages/agent/src/model-tier.ts:19` · `packages/agent/src/model-family.ts:62-66` · `packages/agent/src/cookbook/model-fit.ts:210-214` · `packages/agent/src/cookbook/catalog.ts:45-51` · `packages/server/src/local/channels/{whatsapp,telegram,discord}-adapter.ts` · `packages/agent/src/connectors/*` · `benchmarks/gaia2/adapter.ts:1-12` · `package.json:73` · `origin/feature/harness-sota-bench:packages/agent/src/cost-tracker.ts:26-33` (`git show`)
