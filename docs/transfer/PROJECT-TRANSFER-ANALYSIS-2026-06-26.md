# Project Transfer Analysis — Hive Mind + Waggle OS

**Date:** 2026-06-26
**Author:** Transfer-audit synthesis (6 parallel scout passes)
**Audience:** Incoming developer taking over the Waggle OS + Hive Mind ecosystem
**Scope:** `D:/Projects/waggle-os` (+ 3 worktrees), `D:/Projects/hive-mind`, `D:/Projects/hive-mind-test`, `D:/Projects/hive-mind-clients`, `D:/Projects/claude-hive-mind`, plus developer-local stores under `~/.waggle`, `~/.mem0`, and the Claude Code project memory.
**Rev:** Completeness-critic reviewed (2026-06-26). Corrected: vault classified as *recoverable* (not irreplaceable); Ollama/`nomic-embed-text` reclassified from "optional" to a **hard benchmark prerequisite**; `Desktop\MEMORIES` cross-referenced into the local-data section; recall-stress gitignore rationale clarified as by-design.

---

## 1. Executive Summary

The Hive Mind + Waggle OS ecosystem transfers as **source code cleanly, but NOT as a turnkey reproducible whole**. Every line of application code, schema, migration, and benchmark harness lives in git and re-clones cleanly. Infrastructure (PostgreSQL, Redis, MinIO) is fully regenerable via `docker-compose up`. Public benchmark datasets (LoCoMo, LongMemEval, BEAM) are downloadable, and two flagship benchmark numbers (LoCoMo SOTA 87.66 and LoCoMo v5 OSS 67.8%) are fully reproducible given API keys. **However**, the institutional memory (1.6 MB of hand-written session handoffs and the SOTA results index), the LLM-generated benchmark answers/judgments (dollars and researcher-hours to regenerate), the developer's `.mind` / `hive-mind.db` memory databases (embedder-locked, not cheaply regenerable), and a concurrent session's uncommitted WIP in the main repo are all **local-only and irreplaceable** — they must be physically copied. The encrypted **vault is a distinct case: machine-local but *recoverable*** — the new developer simply re-enters their own keys; the `.vault-key` itself never transfers. No API credentials transfer; the new developer must provision their own ~22 keys/accounts.

> **Reproduce-everything verdict: PARTIAL.**
> - Code, infra, public datasets, and 2 of 5 benchmarks: YES.
> - LongMemEval (N=500) and recall-stress: PARTIAL (engineering/proprietary-query gaps).
> - GAIA2: NO (blocked on an unresolved `ARE SIGALRM` platform bug).
> - Institutional context + LLM-generated results: only via physical copy (not regenerable cheaply).

---

## 2. Repository Map

| Repo / Worktree | Remote URL | Public/Private | Role | Clones clean? |
|---|---|---|---|---|
| `D:/Projects/waggle-os` | `https://github.com/marolinik/waggle-os.git` (confirmed `git remote -v`) | PRIVATE (MIT license in repo) | Main monorepo — Tauri desktop + web + Fastify sidecar, 27 workspace packages | **NO — concurrent session WIP**: 52 modified + 22 untracked files at HEAD `18aebe1f`, 0 unpushed commits. Do NOT stage/commit/clean. WIP is reproducible only by its owner. |
| `D:/Projects/hive-mind` | `https://github.com/marolinik/hive-mind.git` | PUBLIC (Apache-2.0, v0.4.0) | OSS memory substrate mirror (`packages/core` = mind/ + harvest/) + `benchmarks/locomo` harness. HEAD `bc4eba1` | YES — clean, no uncommitted changes |
| `D:/Projects/hive-mind-test` | `https://github.com/marolinik/hive-mind-test.git` | (v0.1.0) | LoCoMo SOTA benchmark harness + answers/judgments (the 87.66 evidence). HEAD `05f2146` | YES — clean, but precious local data inside (see §5) |
| `D:/Projects/hive-mind-clients` | `https://github.com/marolinik/hive-mind-clients-archive.git` | PUBLIC (Apache-2.0, v0.1.0) | Per-IDE silent-capture shims. HEAD `5b41eb5` | YES — clean |
| `D:/Projects/claude-hive-mind` | (check `.git/config`) | (likely older variant of hive-mind) | Older copy/variant; **contains 32 MB personal data fixture** | YES — but holds personal-data zip to scrub on transfer |
| `D:/Projects/waggle-os-w4` | worktree of waggle-os, branch `feature/w4-port` | PRIVATE | SOTA paper artifacts (arXiv LaTeX + docx + team briefing). HEAD `d146e906` | Clean: 0 uncommitted, 0 unpushed |
| `D:/Projects/waggle-os-gaia2-wt` | worktree of waggle-os, branch `feature/gaia2-are-setup` | PRIVATE | GAIA2 Phase 3 evaluation (HALT verdict). HEAD `08a63ba7` | **3 unpushed commits** — review/push before discarding |
| `D:/Projects/waggle-os-harness-bench` | worktree of waggle-os, branch `feature/harness-sota-bench` | PRIVATE | Premium harness eval (21/21 pillars, 2657/2657 suite). HEAD `ea078769` | **NO_UPSTREAM** — branch tracks no remote; would be LOST if worktree discarded without pushing |
| `D:/Projects/waggle-os-ux-prototype` | **not git-tracked** | n/a | Standalone Vite+React UX prototype (122 MB incl. node_modules) | **NOT under version control** — copy as-is or treat as ephemeral |

Worktree list verified live via `git worktree list` (gaia2-wt, harness-bench, w4 all attached to the main repo's `.git`).

---

## 3. Data Volumes & Databases

| Path | Size | Contents | Reproducible? | Transfer method |
|---|---|---|---|---|
| `packages/marketplace/marketplace.db` | 14 MB | SQLite catalog: 40 sources, 120+ packages, 18 packs, FTS5, scan_history, security_config | YES — `npm run sync` in packages/marketplace (re-fetches ClawHub/SkillsMP/GitHub/LobeHub) | Travels in git clone; or regenerate via sync |
| Docker volume `pgdata` (`DATABASE_URL=postgres://waggle:waggle_dev@localhost:5434/waggle`) | Variable (empty fresh) | Team server: users/teams/agents/tasks/messages/team_entities (Drizzle ORM, PG16) | YES — `docker-compose up`, Drizzle migrations auto-run from `packages/server/drizzle/` | Regenerate; do not copy |
| Docker volume `redisdata` (`redis://localhost:6381`) | Variable (empty fresh) | Session cache, BullMQ job queue | YES — ephemeral by design | Regenerate |
| Docker volume `miniodata`/`minio-data` (`localhost:9000`, bucket `waggle-files`) | Variable (empty fresh) | S3-compatible object storage; `minio-init` auto-creates bucket | YES — `docker-compose up` | Regenerate |
| `waggle-os/.mind/` | 47 KB | Local hive-mind memory for this workspace (KG + entity cache) | NO (session-local content) — schema auto-creates | Copy if context valued; else regenerates on first use |
| `~/.waggle/hive-mind.db` (per-project MemoryStore) | Varies (LoCoMo trio ~100 MB+) | FrameStore + HybridSearch (FTS5 + 1024-d sqlite-vec) + KnowledgeGraph + Identity/Awareness | NO — local-only; vectors tied to embedder model | Physically copy; **not portable if embedder changes** |
| `~/.waggle/vault.json` + `~/.waggle/.vault-key` | <10 KB | AES-256-GCM encrypted API keys (canonical secret store) | NO — `.vault-key` is machine-local, never backed up | New dev re-enters keys via UI; if `.vault-key` lost, all entries unrecoverable |
| `~/.mem0/history.db` | 888 KB (≈909 KB) | Mem0 SDK conversation history (cross-project, personal) | NO | **Do NOT transfer** (personal) |
| `~/.mem0/migrations_qdrant/` | 18 KB | Qdrant vectors (1536-d Cosine, `mem0migrations` collection) | NO | **Do NOT transfer** (personal) |
| `.claude/projects/D--Projects-waggle-os/memory/` | 1.6 MB (~100–250 `.md`) | Session handoffs, SOTA index, decisions, founder feedback pins | NO — hand-written | **Physically copy** (heart of handoff) — see §5 |
| `packages/server/drizzle/` | 2 SQL + meta (~120 KB) | `0000_wild_glorian.sql`, `0001_redundant_sauron.sql` + journal | YES — source-controlled | Travels in git |
| `hive-mind-test/scripts/locomo/data/` | ~144 MB dir (2.8 MB `locomo10.json` + ~15 MB judgments) | LoCoMo test set + answers (packc/packd/mem0/ours/theirs) + trio judgments | Dataset YES (public); answers/judgments NO ($$ token spend) | Copy answers/judgments; dataset auto-fetched |
| `waggle-os/benchmarks/results/*.jsonl` (+ `.summary.json`) | ~36 MB, 68 files | Per-instance harness results (accuracy/latency/cost/failure_mode) | NO — real LLM calls cost $$ | Physically copy |
| `waggle-os-gaia2-wt/benchmarks/gaia2/runs/*/` | multi-run | GAIA2 execution traces + scenario `trace.jsonl` | NO — $$ LLM + judge calls | Physically copy |
| `waggle-os/.understand-anything/` | 7.1 MB | KG (4,067 nodes / 6,521 edges) + fingerprints + dashboard | YES — `/understand --full` (~17.9M tokens, ~2h, costly) | Copy or regenerate |

---

## 4. What the Developer Can Get Themselves (download or regenerate)

### 4.1 Public source repos (git clone)
```bash
git clone https://github.com/marolinik/hive-mind.git
git clone https://github.com/marolinik/hive-mind-clients-archive.git   # hive-mind-clients
git clone https://github.com/marolinik/hive-mind-test.git
git clone https://github.com/marolinik/waggle-os.git                   # PRIVATE — needs GitHub access
```
All use npm/pnpm workspaces, Node >= 20. After clone: `npm install && npm run build` (waggle-os: `npm run build:all`).

### 4.2 Native deps & toolchain (regenerate)
- **Node.js 20+ (LTS)** — https://nodejs.org/ ; verify `node --version`.
- **better-sqlite3 v12.6.2** — compiles via node-gyp on `npm install`; Windows needs **MSVC Build Tools + Python 3.x**.
- **sqlite-vec-windows-x64 v0.1.9** — optionalDependency; npm skips on non-Windows. Source: https://github.com/asg017/sqlite-vec-releases
- **Playwright browser** — `npx playwright install` (Chromium) on first E2E run.
- **Local embedder** — `Xenova/all-MiniLM-L6-v2` (~23 MB) downloads to `~/.waggle/models/` on first `EMBEDDING_PROVIDER=local` boot.

### 4.3 Local infrastructure (regenerate)
```bash
docker-compose up -d        # postgres :5434, redis :6381, minio :9000 (+ minio-init bucket)
# Drizzle migrations auto-run on server start; force re-apply:
docker volume rm waggle-os_pgdata && docker-compose up -d postgres
```
**Optional — LiteLLM proxy** (`litellm-proxy --config litellm-config.yaml --port 4000`): the app falls back to its built-in Anthropic proxy / Ollama if absent.

**REQUIRED for any hive-mind benchmark — Ollama** (NOT optional): `ollama pull nomic-embed-text`, then serve on `localhost:11434`. The embedder is **load-bearing** — the `.mind` / `hive-mind.db` vectors are 1024-d nomic; running a benchmark against a DB embedded with a *different* model silently corrupts retrieval (no error, just wrong results). Treat this as a hard prerequisite alongside API keys.

### 4.4 Public benchmark datasets (download + canonicalize)
| Dataset | Fetch command | Then canonicalize |
|---|---|---|
| LoCoMo raw | `curl -L 'https://raw.githubusercontent.com/snap-research/locomo/main/data/locomo10.json' -o benchmarks/data/locomo10.json` (SHA-256 of canonical archive: `39e415e2…2a5b24`; raw `locomo10.json` pinned `79fa87e9…698ff4`) | `cd benchmarks/harness && tsx scripts/build-locomo-canonical.ts` → `locomo/locomo-1540.jsonl` (1531 instances) |
| LongMemEval S | `curl -L 'https://huggingface.co/datasets/xiaowu0162/longmemeval-cleaned/resolve/main/longmemeval_s_cleaned.json' -o benchmarks/data/longmemeval_s_cleaned.json` (264 MB, SHA `d6f21ea9…c3a442`) | `tsx scripts/build-longmemeval-canonical.ts --variant s` (500 instances) |
| BEAM | `git clone https://github.com/mohammadtavakoli78/BEAM.git` (parent dir) | `tsx scripts/build-beam-canonical.ts --beam-chats-path /path/to/BEAM/chats --chat-size 128K` (400 instances) |

Committed (no download needed): `preflight-locomo-50.json`, `failure-mode-calibration-10.jsonl`, all `*.meta.json`, harness config `benchmarks/harness/config/datasets.json`, build scripts `benchmarks/harness/scripts/build-*.ts`. The hive-mind OSS LoCoMo number is **free** offline: `cd D:/Projects/hive-mind/benchmarks/locomo && npm run build && node rescore.mjs` (zero API cost; verifies SHA-256-pinned artifacts).

---

## 5. Local-Only / IRREPLACEABLE Data (must physically copy)

This is the heart of the handoff. None of the below comes back from a `git clone`.

### 5.1 Institutional memory (highest priority)
- **`C:/Users/MarkoMarkovic/.claude/projects/D--Projects-waggle-os/memory/`** (1.6 MB, ~100–250 `.md`). Single source of truth for what shipped / what's open / how to roll back. Includes `MEMORY.md` (START HERE index, daily), `project_session_handoff_*.md` (150+ sessions Apr–Jun 2026), `project_sota_results_index.md` (binding LoCoMo 87.66 evidence with commit SHAs + reproduction recipe), tier/KVARK/AI-Act strategy pins, and founder feedback pins. **Cannot regenerate** — copy the directory; or extract key insights into committed `docs/`.

### 5.2 LLM-generated benchmark answers/judgments/results ($ + time to regenerate)
- **`hive-mind-test/scripts/locomo/data/{answers,judgments}/`** — the 87.66 SOTA evidence (packc/packd/mem0/ours/theirs answers, trio-strict judgments). Regenerable only with API keys + ~2h compute + token spend.
- **`waggle-os/benchmarks/results/*.jsonl` + `*.summary.json`** (~36 MB, 68 files) — per-cell ablation results; each row is a paid LLM call. Gitignored.
- **`waggle-os/benchmarks/calibration/v6-kappa-recal/*.jsonl`** + **`benchmarks/probes/judge-swap-validation/*.jsonl`** — judge-reliability (Fleiss' kappa) outputs across deepseek/kimi/minimax/zhipu. No regeneration script.
- **`waggle-os/benchmarks/results/pilot-2026-04-26/`** (~40 MB) — agentic pilot (FAIL verdict, kept for audit).
- **`waggle-os/benchmarks/results/v6-self-judge-rebench/`** (~50 KB) — apples-to-apples vs Mem0.
- **`waggle-os-gaia2-wt/benchmarks/gaia2/runs/*/results.jsonl` + `search/scenario_*/trace.jsonl`** — GAIA2 execution traces (real LLM + judge $$).
- **`waggle-os-gaia2-wt/benchmarks/gaia2/data/tasks-mini-2.jsonl`** (4.8 MB) — GAIA2 task set with **no traced public source** (origin untraced; cannot re-fetch).

> **⚠ Expected-but-ABSENT (verify before relying on it):** `C:/Users/MarkoMarkovic/Desktop/MEMORIES/` — `CLAUDE.md` §10 (M2/M3) cites a 30 MB Claude export + 437 MB Gemini export "ready for E-11 ingestion", but **the directory does not exist on this disk** (see §9). If those harvest corpora matter to the handoff, re-export them from the source Claude/Google accounts — they are recoverable from *no* repo or backup found here.

### 5.3 Generated DBs worth keeping
- **`~/.waggle/hive-mind.db`** (and any project `.mind` DBs) — harvested memories + KG + identity. 1024-d sqlite-vec vectors are **embedder-locked** (re-embedding with a different model silently invalidates retrieval).
- **`~/.waggle/vault.json` + `.vault-key`** — only if continuing on the SAME machine; otherwise re-enter keys.

### 5.4 Unpushed / unversioned work that vanishes if ignored
- **`waggle-os` main repo concurrent WIP** (52 modified + 22 untracked at `18aebe1f`) — owner must review+commit; do not clobber.
- **`waggle-os-harness-bench` (NO_UPSTREAM)** — push the branch or it dies with the worktree.
- **`waggle-os-gaia2-wt`** — 3 unpushed commits to review/push.
- **`waggle-os-ux-prototype/`** (122 MB, not git) — add to git or treat as ephemeral.
- **`waggle-os/.planning/`** (1.6 MB, gitignored) — planning snapshots/decision logs.

### 5.5 Personal — DO NOT transfer (privacy)
- **`~/.mem0/` (`history.db` + `migrations_qdrant/` + `config.json`)** — founder's cross-project personal memory. `config.json` is auto-regenerated by the Mem0 SDK on first run, so nothing under `~/.mem0/` is worth (or safe to) transfer.
- **`hive-mind/test-fixtures/claude-export-2026-04-22-marko.zip`** (32 MB) and its duplicate in **`claude-hive-mind/test-fixtures/`** — founder's personal Claude chat archive. Scrub before any public push.

---

## 6. Credentials & Accounts the Developer Must Obtain

Secrets live in the encrypted vault (`~/.waggle/vault.json`) and/or `.env`/`.env.locomo-trio` (gitignored). **Never transfer the founder's values — provision your own.** `.env.example` is the safe template.

| Key name | File / store | External service | Purpose |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | vault / `.env` | console.anthropic.com | Claude (default model + judge) |
| `OPENAI_API_KEY` | vault / `.env` | platform.openai.com | GPT-4o/o3, embeddings, eval judge |
| `GEMINI_API_KEY` / `GOOGLE_API_KEY` | vault / `.env` | ai.google.dev | Gemini 2.5/3.1 (judge) |
| `XAI_API_KEY` | vault / `.env` | console.x.ai | Grok (v6 judge) |
| `DEEPSEEK_API_KEY` | vault / `.env` | platform.deepseek.com | DeepSeek chat/reasoner |
| `PERPLEXITY_API_KEY` | vault / `.env` | perplexity.ai/settings/api | Sonar web-grounded |
| `OPENROUTER_API_KEY` | vault / `.env` | openrouter.ai/keys | **Critical fallback** for 10+ routes |
| `MISTRAL_API_KEY` | vault / `.env` | console.mistral.ai | Mistral Large/Small/Codestral |
| `MOONSHOT_API_KEY` | vault / `.env` | platform.moonshot.ai (intl) | Kimi K2 family |
| `DASHSCOPE_API_KEY` | vault / `.env` | dashscope-intl.aliyuncs.com | **Qwen3.6-35B-A3B (LOCKED default)** — intl tenant only |
| `MINIMAX_API_KEY` (+ `MINIMAX_GROUP_ID`) | vault / `.env` | minimaxi.com | MiniMax M1/M2.7 (v6 judge) |
| `ZHIPU_API_KEY` | vault / `.env` | open.bigmodel.cn | GLM-4-Plus/GLM-5 |
| `GENSPARK_API_KEY` | vault / `.env` | genspark.ai | Claude-compatible proxy |
| `TAVILY_API_KEY` | vault / `.env` | tavily.com | Web search (not LLM) |
| `LITELLM_MASTER_KEY` | `.env` | local (placeholder `sk-waggle-dev`) | Auth for local LiteLLM proxy |
| `CLERK_SECRET_KEY` / `CLERK_PUBLISHABLE_KEY` / `VITE_CLERK_PUBLISHABLE_KEY` | `.env` | dashboard.clerk.com | Team server auth (optional for single-user) |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `STRIPE_PRICE_PRO_MONTHLY`/`_ANNUAL`/`STRIPE_PRICE_TEAMS_MONTHLY`/`_ANNUAL` | `.env` | dashboard.stripe.com | Billing (optional for dev) |
| `DATABASE_URL` | `.env` | local PG (docker) | `postgres://waggle:waggle_dev@localhost:5434/waggle` |
| `REDIS_URL` | `.env` | local Redis (docker) | `redis://localhost:6381` |
| `MINIO_ENDPOINT`/`MINIO_ACCESS_KEY`/`MINIO_SECRET_KEY`/`MINIO_BUCKET` | `.env` | local MinIO (docker) | `localhost:9000`, `waggle-files` (dev creds `waggle`/`waggle_s3_dev`) |
| `OLLAMA_URL` / `OLLAMA_MODEL` | `.env.locomo-trio` | local Ollama | `localhost:11434` + `nomic-embed-text` — **must match DB embedder (1024-d) or retrieval silently breaks** |

> Benchmark reproduction additionally needs `hive-mind-test/.env.locomo-trio` (ANTHROPIC + OPENAI + MINIMAX + DASHSCOPE + Ollama). The file is marked "treat as compromised and rotate post-run."

---

## 7. Benchmark Reproducibility Assessment

> **Prerequisite for EVERY hive-mind benchmark below:** Ollama serving `nomic-embed-text` (1024-d) on `localhost:11434` (see §4.3) **+** the relevant API keys (§6). The embedder must match what each DB was built with or retrieval silently breaks. This is not documented in any benchmark README today — it is the single most common silent failure for a new dev.

| Benchmark | Headline | Status | Doc / harness path |
|---|---|---|---|
| LoCoMo SOTA | 87.66% (Memori protocol, N=1540, GPT-4.1-mini) | **COMPLETE** | `hive-mind-test/scripts/locomo/` + `RESULT-backlog-closeout-2026-06-15.md` |
| LoCoMo v5 OSS | 67.8% trio-strict (N=320) | **COMPLETE** | `hive-mind/benchmarks/locomo/` + `METHODOLOGY.md` |
| LongMemEval | 75.2% trio-strict (N=100 probe) | **PARTIAL** | `hive-mind-test/scripts/longmemeval/` + `docs/plans/PILLAR2-MEMORY-LONGMEMEVAL-PLAN-2026-05-22.md` |
| GAIA2 | preregistered, no live runs | **MISSING (blocked)** | `benchmarks/preregistration/manifest-v8-gaia2-preregistration.md`, `manifest-v8.2-final.md` |
| recall-stress | precision@3 gate | **PARTIAL** | `hive-mind/benchmarks/recall-stress/` + `README.md` |

**LoCoMo SOTA (COMPLETE).** Scripts 40/41/42 + harness fixes (PACK packing, `--measure`) + gotchas (judge-trio resume trap, Mem0 qdrant lock) documented; answers/judgments committed. Repro: `cd hive-mind-test/scripts/locomo && node --env-file=../../.env.locomo-trio 40-cell-retrieval-gpt41mini.mjs` (env `PROMPT_MODE=ours PROFILES=1 DATEWIN=1 EPISODIC=1 RAWDETAIL=1`) `&& node 41-judge-memori-gpt41mini.mjs && node 42-report-memori.mjs`. Gaps: NONE except API keys + Ollama. Effort: 1–2h setup + ~2h compute.

**LoCoMo v5 OSS (COMPLETE).** Offline number is free via `node benchmarks/locomo/rescore.mjs` (zero cost, SHA-256 artifact integrity check). Full live pipeline (00–37) needs workspace build + API keys. Gaps: NONE for offline rescore.

**LongMemEval (PARTIAL).** Method proven (ablation 41.6%→52.5%→68.3%→75.2%); `run-longmemeval.mjs`, `run-blend.mjs`, `judge-trio.mjs` exist; dataset SHA-pinned. Gaps: (1) fetch script not implemented (only "adapt 00-fetch" in plan); (2) per-question workspace isolation not coded; (3) full N=500 never executed (only N=100 probe); (4) Qwen-local lane designed, not built; (5) abstention judge in plan, not verified in code. Remediation: ~2–3 days engineering for N=500 scale-out. **Start here:** the dataset is SHA-pinned and `run-longmemeval.mjs` / `run-blend.mjs` / `judge-trio.mjs` already exist in `hive-mind-test/scripts/longmemeval/` — fork `hive-mind-test/scripts/locomo/00-fetch-dataset.mjs` for the fetch step and add per-question workspace isolation to the existing runners; do **not** rewrite from scratch.

**GAIA2 (MISSING / blocked).** Preregistration thorough (4-cell ablation, ARE verifier + Llama-3.3-70B soft judge, health-check predicates; v8.2 makes LongMemEval V1 Track A0). Gaps: (1) **hard blocker** `module 'signal' has no attribute 'SIGALRM'` in smoke run 2026-04-30; (2) zero live runs, only smoke scaffolds; (3) no adapter code; (4) judge κ calibration unrun; (5) cost/timeline unvalidated. Phase 3 (separate, in `waggle-os-gaia2-wt`) DID close with +19.25pp Fisher p=8.07e-18, but cost $4.09/invocation → HALT. Remediation: fix SIGALRM (ARE platform) + build adapter + Docker — open-ended.

**recall-stress (PARTIAL).** Harness complete: `node benchmarks/recall-stress/run.mjs --queries <path> --profile … --min-precision … --max-seconds …`. Gaps: **`queries.local.json` is gitignored by design** (permanent and intentional — it shields a proprietary query corpus from the public mirror; this is *not* an accidental omission, so don't expect it to ever ship in git); only `queries.example.json` template ships. No public query set means historical recall-stress numbers are **not** reproducible from git alone. Regression thresholds are examples, not preregistered. Remediation: ~1 day to author domain-specific local queries. **Cross-cutting gap:** Ollama (`nomic-embed-text` 1024-d at `localhost:11434`) is assumed by all hive-mind benchmarks but has NO setup docs in any README.

---

## 8. Recommended Transfer Checklist

1. **Clone the public repos** (clean): `hive-mind`, `hive-mind-clients-archive`, `hive-mind-test`. Run `npm install && npm run build` in each.
2. **Resolve the main repo's dirty state FIRST.** Have the concurrent-session owner review + commit the 52 modified + 22 untracked files at `18aebe1f`, or stash, before anyone else touches `waggle-os`. Then clone `waggle-os` (private — provision GitHub access).
3. **Rescue unpushed worktree work:** push `feature/harness-sota-bench` (NO_UPSTREAM) and the 3 unpushed commits on `feature/gaia2-are-setup`; decide fate of `waggle-os-ux-prototype` (add to git or archive).
4. **Provision credentials** (§6): copy `.env.example` → `.env`, obtain ~15 LLM keys + Clerk + Stripe + local DB/MinIO creds. Set keys in the Waggle vault via UI (Settings → API Keys). For benchmarks, create `hive-mind-test/.env.locomo-trio`.
5. **Stand up infra:** `docker-compose up -d` (PG 5434 / Redis 6381 / MinIO 9000); install Ollama + `ollama pull nomic-embed-text`; build native deps (MSVC + Python 3.x on Windows).
6. **Physically copy irreplaceable data** (§5): the `.claude/.../memory/` directory (institutional context), benchmark answers/judgments in `hive-mind-test/scripts/locomo/data/`, `waggle-os/benchmarks/results/`, GAIA2 runs, and `~/.waggle/hive-mind.db` if continuing the same memory corpus. **Scrub** the personal `claude-export-*-marko.zip` fixtures and do NOT copy `~/.mem0/`.
7. **Verify code health:** `npm run build:all`, `npx tsc --noEmit` on `packages/agent`, `packages/server`, `app`; `npm run test -- --run`; `npm run lint`. (Note: `npm run build` typechecks only `apps/web`; the sidecar runs via `tsx` transpile-only — typecheck `packages/server` separately.)
8. **Validate one cheap benchmark:** `cd hive-mind/benchmarks/locomo && node rescore.mjs` (offline, free) to confirm the 67.8% reproduces.
9. **Document the gaps** the new dev inherits: LongMemEval N=500 engineering, GAIA2 SIGALRM blocker, recall-stress local queries, missing `Desktop\MEMORIES` exports.
10. **Regenerate orientation aids** if helpful: `/understand --full` rebuilds `.understand-anything/` KG + dashboard (costly ~17.9M tokens).

---

## 9. Risks & Open Gaps

**Security / privacy**
- Live API keys exist in `waggle-os/.env`, `hive-mind-test/.env.locomo-trio` (file self-flags keys as compromised), and `.env.locomo-trio` comments. **Rotate all on transfer.** Confirm both files remain gitignored.
- Personal founder data: `claude-export-2026-04-22-marko.zip` (32 MB) lives in BOTH `hive-mind/test-fixtures/` and `claude-hive-mind/test-fixtures/` — must not reach any public mirror. `~/.mem0/` is personal — never transfer.
- `~/.waggle/.vault-key` is machine-local and never backed up; losing it makes the vault unrecoverable. New dev re-enters keys.
- recall-stress `queries.local.json` is gitignored specifically to keep a proprietary corpus out of the repo — keep it that way.

**Reproducibility / completeness gaps**
- **`Desktop\MEMORIES` is MISSING.** CLAUDE.md §10 (M2/M3) claims a 30 MB Claude export + 437 MB Gemini export are "ready for E-11 ingestion," but the directory does not exist on disk. Do not assume availability — re-export from source accounts if needed.
- **GAIA2 task dataset origin untraced** (`tasks-mini-2.jsonl`, 4.8 MB) — no public URL/fetch script found; if lost, cannot re-acquire.
- **BEAM upstream URL** only inferred from an error string (`github.com/mohammadtavakoli78/BEAM.git`); confirm canonical source.
- **Ollama embedder setup** (nomic-embed-text, 1024-d, :11434) is a hard prerequisite for every hive-mind benchmark but is undocumented in any README — embedder mismatch silently corrupts retrieval.
- **Sidecar type errors ship undetected** — `npm run build` typechecks only `apps/web`; the Fastify sidecar runs transpile-only via `tsx`. Always run `npx tsc --noEmit --project packages/server/tsconfig.json`.
- **Concurrent-session WIP** in the main repo is the single biggest operational hazard: 74 changed files at `18aebe1f` with no commits. Any clean/reset destroys them.

**Documentation gaps surfaced by scouts**
- No `00-fetch-dataset` automation for LongMemEval; build scripts must be run manually post-clone.
- Hive Mind canonical upstream URLs partly inferred — verify each repo's `.git/config` before relying on them.
- `waggle-os/.lovable/` and `.agents/` contents unverified (build cache vs. artifacts).
- OSS sync scripts (`oss-subtree-split.sh` guard-only, `oss-drift-check.sh`) — verify functional before any OSS release; per CLAUDE.md §7.5 a raw split would leak proprietary IP.
