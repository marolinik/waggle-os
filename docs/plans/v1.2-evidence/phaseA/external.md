# Phase A — Eksterna provera (READ-ONLY istraživanje)

**Revizija pod pregledom:** `main` = `2af0904df01ca3d374cc78ba95b60dc579dd6a7a` (`git status` čist osim dva untracked `.docx` u `docs/`; working tree == HEAD, pa svaki `path:line` ispod važi za tu reviziju).
**Datum provere svih spoljnih izvora:** 2026-09-27 (ako nije drugačije navedeno).
**Metod:** WebSearch/WebFetch + `gh api` (read-only) + HF API (`curl`) + read-only `git show/grep` nad repoom. Nijedan fajl u `D:/Projects/waggle-os` nije menjan.
**Kontekst:** BRIEF §3 (D-01..D-18, ne otvaraju se), §11.3, §11.4, §13.1, §14, §17 (C6, C19), §18 (A29); S1_AUDIT §2/§3. Radna osnova G1 → G2 → G3 (BRIEF §5.1).

**Legenda statusa:** ODLUKA · POTVRĐENO NA REVIZIJI · NALAZ AUDITA — ZA PROVERU · DELIMIČNO/NEPOVEZANO · PREDLOG · ODLOŽENO · NEPOZNATO. „Modul postoji“ nikada nije dokaz E2E funkcije.

---

## 0. Kratki rezime nalaza

| # | Nalaz | Status |
|---|---|---|
| 1 | Qwen 3.8 27B = `Qwen/Qwen3.8-27B`, HF sha `1d4bf0f2ff6012fd82039f2fa52739d0dd7c60c0`, objavljen 2026-08-14, Apache-2.0, **dense** 27B VL (`model_type: qwen3_5`), 262k native ctx, thinking default-on + `reasoning_effort`, chat template ima `<tool_call>`/`<function=` markere. | POTVRĐENO NA REVIZIJI |
| 2 | Ollama library `qwen3.8:27b` = 18 GB (Q4_K_M klasa), varijante q8_0 30 GB, bf16 56 GB, mtp/nvfp4/mxfp8/mlx. Qwen 3.8 27B ušao u Ollama **v0.32.12 (14.08.2026)**; Waggle pinuje `OLLAMA_TARGET_VERSION = '0.32.3'` / rollback `'0.32.0'` (`packages/server/src/local/managed-ollama-runtime.ts:28-29`) — **pinovani runtime je stariji od prvog Qwen 3.8 release-a.** | NALAZ AUDITA — ZA PROVERU (repin + pull test) |
| 3 | Zvanični VRAM/RAM po quantu **ne postoji** ni na HF kartici ni na Ollama strani; postoje samo sekundarne procene (Q4_K_M ≈ 17.6 GB @8k ctx do 33.5 GB @262k). | NEPOZNATO (zvanično) / NALAZ — ZA PROVERU (izmeriti) |
| 4 | Qwen3.6-35B-A3B (kontrolni baseline) = MoE 35B/3B aktivnih, Apache-2.0, sha `995ad96e…`, 2026-04-24; u repou je ruta **cloud DashScope** (`litellm-config.yaml:211-215`), ne lokalna. | POTVRĐENO NA REVIZIJI |
| 5 | BuilderIO/agent-native: root `package.json` `"license": "ISC"`, GitHub `license: null` (nema root LICENSE), paketi `@agent-native/*` deklarišu MIT; runtime Postgres/PGlite + Nitro. Durable/replay tvrdnje nisu dokazive iz README/PRODUCT/docs. Ostaje **pattern reference only**. | POTVRĐENO NA REVIZIJI (licenca) / DELIMIČNO/NEPOVEZANO (durable) |
| 6 | Omnigent (Databricks, 2026-06-13): Apache-2.0, Python 3.12+ & Node 22, **alpha**, Windows „native but degraded“. Reference only. | POTVRĐENO NA REVIZIJI |
| 7 | Durable execution: nijedan kandidat ne ispunjava sva 4 uslova (embed u Node/Fastify, SQLite, Windows, bez zasebnog servera, zrelost). Najbliži fit: **Reflow (`danfry1/reflow-ts`, MIT, v0.7.0, SQLite/better-sqlite3 ≥9, 41★)** — mali/jednoautorski. DBOS TS = Postgres-only (SQLite samo u Go SDK). | POTVRĐENO NA REVIZIJI / PREDLOG (spike Reflow vs minimal build) |
| 8 | Benchmark: FORTE postoji (`AGI-Eval-Official/FORTE`, MIT) ali javno ima **15 od 180** taskova. GDPval bez deklarisane licence dataset-a; ocenjivanje = ljudi ili OpenAI hosted grader. **APEX-Agents 1.1** (CC-BY-4.0, 240 taskova, otvoren runner + rubrike, objavljeni frontier baseline-i) je najpotpuniji evidence card. | POTVRĐENO NA REVIZIJI |
| 9 | Preporuka primarnog professional-work testa: **APEX-Agents 1.1** (sa uslovima u §4.7). | PREDLOG (nije odobreno) |
| 10 | τ²-bench adapter u repou **nije nađen** (git grep `tau2|tau-bench|tau_bench|taubench` na HEAD pogađa samo `docs/`); GAIA2 adapter postoji (`benchmarks/gaia2/adapter.ts`, narrow-proxy, ne puna evaluacija). | POTVRĐENO NA REVIZIJI |
| 11 | Kanali: WhatsApp personal inbox = samo unofficial klijent (repo `whatsapp-adapter.ts:2-5` sam kaže da Baileys krši ToS); WABP zabranjuje general-purpose AI assistente od 15.01.2026. Viber = samo bot. Discord = samo bot (self-bot zabranjen). Telegram = Bot API (bot-forward) ili user API (rizičan profil). Slack = user token dozvoljen uz ToS ograničenja skladištenja. Gmail = restricted scopes → OAuth verifikacija + godišnji CASA. MS Graph = delegated, bez admin consent-a; publisher verification za multitenant. | POTVRĐENO NA REVIZIJI (po kanalu, vidi §5) |
| 12 | Cene: `cost-tracker.ts` ima Opus 4.6/4.7/4.8 na **$15/$75** (zvanično **$5/$25**), Sonnet 5 na **$3/$15** (zvanično **$2/$10**, trajno), Haiku 3.5 na $0.25/$1.25 (zvanično $0.80/$4, model povučen). Tri ID-a u tabeli su **retired**. Codex 5.3 i Gemini 2.5 Flash tačni. | POTVRĐENO NA REVIZIJI (A29 potvrđen) |

---

## 1. Qwen 3.8 27B-klasa (D-15, C19, §11.3) i kontrolni baseline Qwen3.6-35B-A3B

### 1.1 Zvanični identitet modela

| Polje | Vrednost | Izvor | Status |
|---|---|---|---|
| Model ID | `Qwen/Qwen3.8-27B` | https://huggingface.co/Qwen/Qwen3.8-27B | POTVRĐENO NA REVIZIJI |
| Revizija (HF `sha`) | `1d4bf0f2ff6012fd82039f2fa52739d0dd7c60c0`; `lastModified` 2026-08-14T15:00:01Z | HF API `/api/models/Qwen/Qwen3.8-27B` (2026-09-27) | POTVRĐENO NA REVIZIJI |
| Licenca | Apache-2.0 (`LICENSE` fajl u repou, tag `license:apache-2.0`) | isto | POTVRĐENO NA REVIZIJI |
| Arhitektura | **Dense**, `architectures: ["Qwen3_5ForConditionalGeneration"]`, `model_type: qwen3_5`, pipeline `image-text-to-text` (VL model, ima vision encoder) | HF API config | POTVRĐENO NA REVIZIJI |
| Veličina | 27B parametara; 18 safetensors shardova; BF16 GGUF ≈ 54.7 GB | HF kartica; unsloth GGUF | POTVRĐENO NA REVIZIJI |
| Kontekst | „262,144 natively and extensible up to 1,000,000 tokens“ | HF kartica | POTVRĐENO NA REVIZIJI |
| Thinking | „Thinking mode is on by default and can be disabled per request; reasoning depth can be tuned with `reasoning_effort`“ | HF kartica; template sadrži `reasoning_effort` ×6, `enable_thinking` ×4 | POTVRĐENO NA REVIZIJI |
| Tool calling | Kartica ne pominje eksplicitno; **chat template** (`chat_template.jinja`, 8,952 znaka) sadrži `<tool_call>` ×5, `</tool_call>` ×3, `<tool_response>` ×2, `<function=` ×5, `tools` ×6 — tj. Qwen-XML/Hermes-stil tool use na nivou template-a. Ollama library badge „Tools“. | HF API `tokenizer_config.chat_template`; https://ollama.com/library/qwen3.8 | POTVRĐENO NA REVIZIJI (template) / ZA PROVERU (E2E sa Waggle tool loop-om) |
| Parser preporuka | Qwen docs *Function Calling* pokrivaju samo Qwen3 (`--tool-call-parser hermes`); Qwen3.6-35B-A3B kartica preporučuje `qwen3_coder`; za 3.8 zvanična preporuka **nije nađena**. `<function=` markeri odgovaraju vLLM `qwen3_xml`/`qwen3_coder` familiji. | https://qwen.readthedocs.io/en/latest/framework/function_call.html ; HF Qwen3.6-35B-A3B | NEPOZNATO (zvanično) / PREDLOG: testirati `qwen3_xml` na vLLM i native tools na Ollama |
| Preporučeni framework-i | SGLang, vLLM, TokenSpeed, Transformers — „use the latest framework versions“, **bez minimalnih verzija** | HF kartica | NEPOZNATO (verzije) |
| Zvanični quant | `Qwen/Qwen3.8-27B-FP8` (zvanični FP8) | HF API `author=Qwen&search=Qwen3.8` | POTVRĐENO NA REVIZIJI |
| Familija Qwen 3.8 (open) | `Qwen/Qwen3.8-27B`, `Qwen/Qwen3.8-Flash-Next`, `Qwen/Qwen3.8-2.4T-A95B` (+ `-FP8` varijante). Hostovan: Qwen3.8-Max (blog `qwen.ai/blog?id=qwen3.8`). Zaseban blog za 27B na qwen.ai nije nađen. | HF API; https://qwen.ai/blog?id=qwen3.8 ; https://qwen.ai/blog?id=qwen3.8-flash-next | POTVRĐENO NA REVIZIJI (postojanje) / NEPOZNATO (Flash-Next veličina — sekundarno „180B-A6B“) |

### 1.2 GGUF dostupnost i veličine

| Repo | Licenca | Napomena | Status |
|---|---|---|---|
| `unsloth/Qwen3.8-27B-GGUF` | Apache-2.0 | UD-IQ1_S 6.19 · UD-Q2_K_XL 9.83 · UD-Q3_K_XL 13.1 · UD-IQ4_XS 14.3 · UD-Q4_K_S 15.4 · Q4_0 16.1 · **UD-Q4_K_M 16.5** · UD-Q4_K_XL 17.6 · UD-Q5_K_M 19.8 · UD-Q6_K 22 · **Q8_0 29** · BF16 54.7 (GB) | POTVRĐENO NA REVIZIJI |
| `ggml-org/Qwen3.8-27B-GGUF` | (nije proveravano) | postoji | NEPOZNATO (detalji) |
| `nvidia/Qwen3.8-27B-NVFP4`, `lmstudio-community/Qwen3.8-27B-MLX-4bit`, `mlx-community/Qwen3.8-27B-8bit` | — | postoje | NEPOZNATO (detalji) |

Izvori: https://huggingface.co/unsloth/Qwen3.8-27B-GGUF ; https://huggingface.co/ggml-org/Qwen3.8-27B-GGUF

### 1.3 Ollama library tag i potrebna verzija

| Tag | Veličina | Ctx | Quant | Digest / ažurirano |
|---|---|---|---|---|
| `qwen3.8:latest` = `qwen3.8:27b` | 18 GB | 256K | (default; ista veličina kao q4_K_M) | `e118e4d12a70` · „2 days ago“ (≈2026-09-25) |
| `qwen3.8:27b-q4_K_M` | 18 GB | 256K | Q4_K_M | `25b843619e94` · ~1 mesec |
| `qwen3.8:27b-q8_0` | 30 GB | 256K | Q8_0 | `8f5fb6b71ea0` |
| `qwen3.8:27b-bf16` | 56 GB | 256K | BF16 | `1aa85dae8b2d` |
| `qwen3.8:27b-mtp-q4_K_M` / `-mtp-q8_0` / `-mtp-bf16` | 18/30/56 GB | 256K | MTP (speculative) | — |
| `qwen3.8:27b-nvfp4` · `27b-mxfp8` · `27b-mlx` · `27b-mlx-bf16` | 18 / 32 / 18 / 56 GB | 256K | NVFP4 / MXFP8 / MLX | — |

Izvor: https://ollama.com/library/qwen3.8/tags (2026-09-27). Badges: Vision, Thinking, Tools. Ollama strana **ne navodi minimalnu verziju**.

Release notes (https://github.com/ollama/ollama/releases):
- **v0.32.12 (14.08.2026)**: „Qwen 3.8 27B“ uveden, `ollama run qwen3.8:27b` i `qwen3.8:27b-mlx`. → prva verzija sa Qwen 3.8 27B. POTVRĐENO NA REVIZIJI.
- v0.32.15 (19.08.2026): „Qwen 3.8 system messages are now normalized so non-leading system messages are handled consistently“; metadata cache (TTFT ~½). POTVRĐENO NA REVIZIJI.
- v0.33.1 (26.08.2026): „MLX: Qwen3.8 Flash Next support“. Najnovija: v0.34.4 (23.09.2026).

**Repo:** `packages/server/src/local/managed-ollama-runtime.ts:28` `OLLAMA_TARGET_VERSION = '0.32.3'`, `:29` `OLLAMA_ROLLBACK_VERSION = '0.32.0'`; Windows zip URL-ovi `:163-203`. → **NALAZ AUDITA — ZA PROVERU:** pinovani managed runtime (0.32.3) prethodi v0.32.12; `qwen3.8:27b` na tom runtime-u nije dokazano da se učitava (isti `qwen3_5` arch kao Qwen3.5/3.6 27B, pa je moguće, ali nije dokaz). Potreban repin (≥0.32.12; razumno ≥0.32.15 zbog system-message normalizacije) + stvarni pull/generate/tool test na Windows GGML engine-u + nova router/installer receipt (CLAUDE.md §1 release contract).

Dodatno u repou: `packages/agent/src/model-tier.ts:19` prepoznaje prefiks `'qwen3.8-'`; `packages/agent/src/cookbook/model-fit.ts:210-214` boduje `qwen3.6`→9, `qwen3.5`→8, `qwen3`→4 — **nema pravila za `qwen3.8`** (pao bi na generički `qwen3`=4); `cookbook/catalog.ts:45-51` ima samo Qwen3 (2025) ulaze. → DELIMIČNO/NEPOVEZANO (manje, ali utiče na model-fit rangiranje).

### 1.4 VRAM/RAM po quantu

- **Zvanično (HF kartica, Ollama, unsloth):** nema RAM/VRAM smernica. → NEPOZNATO.
- **Sekundarno** (dev.to, 14.08.2026, https://dev.to/purpledoubled/run-qwen-38-27b-locally-real-gguf-sizes-the-kv-cache-trick-and-the-template-trap-114j): model koristi KV cache samo u 16 od 64 slojeva → KV: 8K 0.5 GB · 32K 2.0 GB · 128K 8.0 GB · 262K 16.4 GB; Q4_K_M ukupno 17.6 / 19.1 / 25.1 / 33.5 GB; „24 GB GPU: Q4_K_M whole, with real context headroom“; 16 GB: IQ4_XS ceo ili Q4_K_M sa offload-om; 12 GB: samo 2-bit uz degradaciju; Apple 32 GB unified OK. Napomena „template trap“: llama.cpp direktno traži `--jinja`; Ollama/LM Studio preuzimaju template automatski. → NALAZ AUDITA — ZA PROVERU (u skladu sa §11.3/A21: izmeriti disk, RAM/VRAM, ctx/KV, offload, latenciju na representative poslu; ne pretpostavljati „24 GB“).
- Disk: Q4_K_M 16.5–18 GB, Q8_0 29–30 GB, BF16 ~55–56 GB (+ vision encoder u Ollama tagovima).

### 1.5 Kontrolni baseline: Qwen3.6-35B-A3B

| Polje | Vrednost | Status |
|---|---|---|
| ID / sha / datum | `Qwen/Qwen3.6-35B-A3B`, sha `995ad96eacd98c81ed38be0c5b274b04031597b0`, `lastModified` 2026-04-24 | POTVRĐENO NA REVIZIJI |
| Licenca | Apache-2.0 | POTVRĐENO NA REVIZIJI |
| Arhitektura | **MoE** `Qwen3_5MoeForConditionalGeneration`; 35B ukupno / 3B aktivnih; 256 eksperata (8 routed + 1 shared), 40 slojeva, hidden 2048 | POTVRĐENO NA REVIZIJI |
| Kontekst | 262,144 native → 1,010,000 | POTVRĐENO NA REVIZIJI |
| Thinking / tools | thinking default (`<think>`), tool use sa `--tool-call-parser qwen3_coder`; `sglang>=0.5.10`, `vllm>=0.19.0`; preporuka ≥128K ctx za thinking | POTVRĐENO NA REVIZIJI |
| U repou | `litellm-config.yaml:211-215` alias `qwen3.6-35b-a3b` → `openai/qwen3.6-35b-a3b` @ `https://dashscope-intl.aliyuncs.com/compatible-mode/v1` (**cloud**, `DASHSCOPE_API_KEY`); `packages/agent/src/model-family.ts:66` mapira `qwen3.6-*a3b*` → `qwen-reasoning`; lokalni runbook `benchmarks/gaia2/PILLAR1-QWEN-LOCAL-RUNBOOK.md` i rezultat `benchmarks/gaia2/PILLAR1-QWEN36-N160-RESULT-2026-05-27.md` postoje (nisu revalidirani ovde) | POTVRĐENO NA REVIZIJI (ruta) / ZA PROVERU (da li su stari rezultati lokalni ili cloud) |

Zaključak za C19: 27B dense i 35B-A3B MoE su različite konfiguracije (dense vs MoE, 27B aktivnih vs 3B aktivnih) — ne prenositi score ni hardversko ponašanje (BRIEF §11.3). POTVRĐENO NA REVIZIJI.

---

## 2. BuilderIO/agent-native i Omnigent (BRIEF §14; S1 §3)

### 2.1 BuilderIO/agent-native

| Polje | Vrednost | Status |
|---|---|---|
| Repo | https://github.com/BuilderIO/agent-native — kreiran 2026-03-12; poslednji commit `4f899f1d` 2026-09-27; 6,863★ / 617 forks; latest release **v0.1.271** (2026-09-27) | POTVRĐENO NA REVIZIJI |
| Root licenca | GitHub API `license: null` (nema root LICENSE/COPYING); root `package.json` `"name":"agentnative"`, **`"license":"ISC"`**; README tvrdi MIT | POTVRĐENO NA REVIZIJI — nalaz S1 („No root LICENSE, ISC vs MIT“) tačan |
| Licence po paketu (`package.json` `license` polje) | `@agent-native/core` 0.195.0 MIT · `agentkit` 0.4.1 MIT · `toolkit` 0.22.3 MIT · `dispatch` 0.38.15 MIT · `scheduling` 0.2.3 MIT · `skills` 0.3.9 MIT · `frame` 0.1.154 MIT. LICENSE fajlovi postoje samo u `packages/vscode-extension/LICENSE.md` i za fontove (`packages/core/src/assets/fonts/LICENSE_*`). | POTVRĐENO NA REVIZIJI (polja) / NEPOZNATO (pravo po fajlu — bez LICENSE teksta u paketima) |
| Paketi u monorepou | agent-browser-extension, agent-chrome-extension, agentkit, browser-control-extension-core, code-agents-ui, core, creative-context, desktop-app, dispatch, docs, embedding, frame, migrate, mobile-app, pinpoint, recap-cli, scheduling, shared-app-config, skills, toolkit, vscode-extension | POTVRĐENO NA REVIZIJI |
| Šta je implementirano (README) | „Shared actions“ (agent, UI, HTTP, MCP, A2A, CLI), „shared data“, „shared application state“; agent chat, auth/permissions, skills & memory, automations (scheduled/event), agent teams; **PostgreSQL backend (PGlite za lokalni dev)**; runtime „any Nitro-compatible host“ (Node/serverless) | POTVRĐENO NA REVIZIJI |
| Event log / durable / replay | README i PRODUCT.md: **0** pogodaka za durable/replay/event log/heartbeat/proof. GitHub code search (repo-wide, uključuje test/kod): `durable` 1206, `replay` 786, `idempotency` 257, `heartbeat` 139, `"proof receipt"` 76 — reči postoje u kodu, ali dokumentovana garancija ne. `docs/agent-run-stop-conditions.md` (2026-08-21, `core@0.168.5`): stop uslovi u `runAgentLoop` (`maxIterations` 400, `maxRunInputTokens` 20M) i „a healthy run killed by a watchdog — has been patched at least six times in four months“. | DELIMIČNO/NEPOVEZANO — S1 tvrdnja „per-step replay not yet built“ nije ni potvrđena ni opovrgnuta bez čitanja `packages/core/agent/production-agent.ts`; ZA PROVERU ako se ikad razmatra više od pattern reference |
| Fit za Waggle | Postgres/PGlite + Nitro vs Waggle SQLite/Fastify/Tauri → API fit nizak; obavezna framework promena nije dozvoljena (D-17, §14). | ODLUKA (D-17) + PREDLOG: pattern reference only (actions-once, event log, proof receipts), bez zavisnosti i bez kopiranja koda dok LICENSE ne bude jasan po fajlu — u skladu sa S1 §3 |

### 2.2 Omnigent

| Polje | Vrednost | Status |
|---|---|---|
| Repo | https://github.com/omnigent-ai/omnigent — kreiran 2026-06-11; Databricks najava 2026-06-13 (https://www.databricks.com/blog/introducing-omnigent-meta-harness-combine-control-and-share-your-agents); 10,293★ / 1.6k forks; latest **v0.15.0** (2026-09-24); poslednji commit `56c6a7f7` 2026-09-27 | POTVRĐENO NA REVIZIJI |
| Licenca | Apache-2.0 (`LICENSE` + `NOTICE` u root-u) | POTVRĐENO NA REVIZIJI |
| Jezik | GitHub languages: Python 59.5 MB, TypeScript 13.1 MB, JS 1.2 MB, Swift/Kotlin/Rust manje; `pyproject.toml`, `uv.lock`, `.python-version` | POTVRĐENO NA REVIZIJI |
| Zrelost | Badge **„Status: alpha“** | POTVRĐENO NA REVIZIJI |
| Zahtevi | Python 3.12+, Node.js 22 LTS+, npm, pnpm, git, uv, tmux, bubblewrap (Linux) | POTVRĐENO NA REVIZIJI |
| Harness adapteri | Claude Code, Codex, Cursor, Antigravity, OpenCode, Hermes, Pi, Grok Build, Devin, custom YAML agenti | POTVRĐENO NA REVIZIJI |
| Invocation eksternih agenata | subprocess/tmux terminal wrapperi; **ACP (Agent Client Protocol) preko stdio**; SDK harnesses (claude-sdk, cursor, codex) | POTVRĐENO NA REVIZIJI |
| Windows | „Native but degraded“: dostupno `omnigent server`, web UI, SDK harnesses; **nedostupno** native terminal wrappers, bwrap/seatbelt sandbox, L7 egress proxy | POTVRĐENO NA REVIZIJI |
| Fit | Python runtime krši no-Python Windows paket (CLAUDE.md §1); alpha. → reference za adapter ugovore (ACP, povrat rezultata, policy) — ne temelj. | ODLUKA (D-11, §14) + PREDLOG: reference only |

---

## 3. Durable execution kandidati (A8, §6, §14)

Kriterijumi: (a) embed u Node/Fastify sidecar bez zasebnog servera, (b) SQLite backend, (c) Windows, (d) permisivna licenca, (e) zrelost/održavanje. Waggle već isporučuje `better-sqlite3` **12.6.2** (`package.json:73`; `packages/*/package.json` `^12.6.2`).

| Kandidat | Licenca | Zaseban server? | SQLite? | Windows | Zrelost (2026-09-27) | Ocena |
|---|---|---|---|---|---|---|
| **DBOS Transact TS** `dbos-inc/dbos-transact-ts` | MIT | Ne (biblioteka), ali **Postgres obavezan** (README: „built on top of Postgres“) | **Ne u TS** — SQLite backend dodat samo u **DBOS Go v0.17** (blog jun 2026) | da (Node) | v5.1 (2026-09-24), 1,376★ | Ne ispunjava (b) |
| **Absurd** `earendil-works/absurd` | Apache-2.0 | Workeri vuku iz baze; „entirely based on Postgres and nothing else“ | Ne | — | „An experiment in durability“, 2,443★, push 2026-08-10 | Ne ispunjava (b) |
| **Inngest** `inngest/inngest` + `inngest-js` | Server: **SSPL** + „Apache 2.0 Future License“ (delayed); SDK `inngest@4.21.0` `package.json` **Apache-2.0** (GitHub detekcija repo-a kaže GPL-3.0 → nesaglasnost, LICENSE fajl proveriti) | **Da** — dev/self-host server (single binary, bundled Redis+SQLite) | interno u serveru | poznati problemi (`inngest/inngest#449` Win11) | aktivan, 5,894★ | Ne ispunjava (a); licenca servera ne-OSI |
| **Restate** `restatedev/restate` + `sdk-typescript` | Server **BSL 1.1**; SDK MIT | **Da** (restate-server) | ne (RocksDB) | **Nema Windows binary** (samo macOS/Linux; community fork) | aktivan | Ne ispunjava (a),(c); BSL |
| **Temporal** `temporalio/temporal` + `sdk-typescript` | MIT (oba) | **Da** — `temporal server start-dev --db-filename` (single binary, SQLite, ima `temporal.exe`) | da (dev server) | da | zreo, 23k★; TS SDK Node ≥20, Rust core native | Ne ispunjava (a) strogo; kao bundlovani „sidecar sidecar-a“ pretežak |
| **LangGraph JS SqliteSaver** `@langchain/langgraph-checkpoint-sqlite` | MIT | Ne | **Da** (`better-sqlite3 ^11.7.0` → **konflikt sa 12.6.2**, dva native builda) | da | održavan (langgraphjs 3,320★) | Delimično: samo checkpointer za LangGraph grafove, ne run lifecycle; zahteva LangGraph runtime |
| **Vercel Workflow DevKit** `vercel/workflow` | Apache-2.0 | Ne za lokalni „Local World“ (JSON fajlovi u `.workflow-data/`, in-memory queue, „not production“); self-host = Postgres World ili custom World | ne (JSON fajlovi) | da | 2,439★, aktivan, public beta | Delimično: custom World nad SQLite = BUILD posao |
| **Reflow** `danfry1/reflow-ts` | **MIT** | **Ne** („no external services required“) | **Da**: `reflow-ts/sqlite-node` (better-sqlite3 **≥9**, dakle 12.6.2 OK), `node:sqlite`, `bun:sqlite` | da | **v0.7.0**, kreiran 2026-03-11, push 2026-09-14, **41★**, jedan autor | **Najbliži fit** — ali mala baza korisnika; features: lease/heartbeat, retries, cooperative cancel (`AbortSignal`), `sleep`/`waitFor` sa otpuštanjem lease-a, idempotent enqueue, `getRunStatus()` |
| iterativeflow `ahmedrowaihi/iterativeflow` | MIT | Ne | da (multi-backend) | da | kreiran 2026-05-28, 14★ | Nezreo |
| OpenWorkflow `openworkflowdev/openworkflow` | Apache-2.0 | ? | ? | ? | 1,323★ | NEPOZNATO (nije evaluiran) |
| Resonate `resonatehq/resonate` | Apache-2.0 | **Da** (single binary; SQLite dev / Postgres prod) | u serveru | NEPOZNATO | 674★ | Ne ispunjava (a) |
| persistasaurus `gunnarmorling/persistasaurus` + blog 2025-11-20 | Apache-2.0 | Ne | Da | — | Java, <1000 LOC, „not a production-ready engine“; nema retry/backoff, paralelizam, compensation, evoluciju definicija | Reference za BUILD |
| durabletasks `danthegoodman1/durabletasks` | **bez licence** | — | — | — | mrtav (2024) | Ne |

**Zaključak (POTVRĐENO NA REVIZIJI):** nema drop-in engine-a koji ispunjava sve uslove. S1 §3 („Build ~600-1000 LOC on better-sqlite3“) ostaje validna opcija; BRIEF §14 kaže da to nije unapred odlučeno. **PREDLOG za ADR (A8):** ograničen spike — (1) ADAPT Reflow (MIT, better-sqlite3-kompatibilan; pregled koda/testova, vendor ili fork, bus factor 1), vs (2) minimalan BUILD nad better-sqlite3 uz Reflow/persistasaurus/Morling kao reference; u oba slučaja retention/GC, schema verzije, stable `actionId` vs `attemptId` (§6.5) i side-effect journal (A6/A7). Ništa od ovoga ne zahteva Postgres ili zaseban proces.

Izvori: https://www.dbos.dev/blog/new-in-dbos-june-2026 ; https://github.com/dbos-inc/dbos-transact-ts ; https://github.com/earendil-works/absurd ; https://github.com/inngest/inngest ; https://github.com/restatedev/restate ; https://docs.temporal.io/develop/run-a-development-server ; https://www.npmjs.com/package/@langchain/langgraph-checkpoint-sqlite ; https://useworkflow.dev/docs/deploying/world/local-world ; https://github.com/danfry1/reflow-ts ; https://www.morling.dev/blog/building-durable-execution-engine-with-sqlite/ ; https://github.com/resonatehq/resonate

---

## 4. Benchmark evidence cards (§13.1, D-18, DIR-22)

Stanje u repou (POTVRĐENO NA REVIZIJI): `benchmarks/gaia2/adapter.ts` postoji („Gaia2 ARE narrow-proxy adapter … NOT a full Gaia2 evaluation; it is cost-projection“); Phase 3 HALT ($4.09/invocation) zabeležen u CLAUDE.md §10 C-3 i `benchmarks/gaia2/*.md`. **τ² adapter nije nađen u kodu** (git grep na HEAD za `tau2|tau-bench|tau_bench|taubench` pogađa samo `docs/briefs/…`, `docs/decisions/…`, `docs/plans/BENCHMARK-LANDSCAPE-RESEARCH-2026-05-22.md`, `docs/strategy/…`). Grana `origin/feature/harness-sota-bench` @ `18e5b36a` (2026-07-01): 66 commitova ispred, **2,022** iza `main`.

### 4.1 τ²-bench (Sierra)
- **Izvor/verzija:** https://github.com/sierra-research/tau2-bench — MIT; **v1.0.1** (jul 2026); push 2026-09-19; 2,111★; Python ≥3.12 <3.14. POTVRĐENO.
- **Taskovi:** domeni `mock · airline · retail · telecom · banking_knowledge`. `data/tau2/domains/airline/split_tasks.json`: base **50** (train 30/test 20); `retail`: base **114** (74/40); `telecom`: `tasks_small.json` = 20, puni skup u `tasks.json` (14 MB, nije brojan; paper navodi 114) → ZA PROVERU; `banking_knowledge` ≈100 (docs: „about 9 out of ~100“). Voice varijante (τ³) postoje.
- **Runner/scorer:** otvoren (`tau2` CLI). Grading deterministički: DB hash posle replay-a referentnih akcija × `communicate_info` stringovi (`reward_basis` default `["DB","COMMUNICATE"]`); `NL_ASSERTION` = LLM judge (eksperimentalno). **Zahteva LLM user-simulator** (`--user-llm gpt-4.1` u primerima) → cloud trošak/zavisnost. POTVRĐENO.
- **Licenca/uslovi:** MIT. **Lokalno izvršivo:** da (Python), bez Docker-a.
- **Objavljeni baseline-i (taubench.com, 2026-09-27):** τ² text: Qwen3.5-397B-A17B 87.9%, Gemini 3.0 Pro 85.4%, Claude Opus 4.5 85.3%; τ³-Banking: Qwen 3.8 Max 55.2%, Claude Opus 5 48.7%, Grok 4.5 47.9%. POTVRĐENO (leaderboard).
- **Integracija:** Waggle adapter ne postoji → agent interface u Pythonu (Agent Developer Guide) koji bi zvao production sidecar preko HTTP; napor **M**. Domen = customer service tool-agent, **nije knowledge-work deliverable** → kontrola za tool-use, ne primarni test.

### 4.2 GAIA2 / ARE (Meta)
- **Izvor:** https://github.com/facebookresearch/meta-agents-research-environments (kod **MIT**, 558★, push 2026-08-26); dataset https://huggingface.co/datasets/meta-agents-research-environments/gaia2 (**CC-BY-4.0**, sintetika pod Llama 3.3 / Llama 4 licencama). POTVRĐENO.
- **Taskovi:** 800 validation scenarija / 10 univerzuma; 5 sposobnosti × 160 (Execution, Search, Adaptability, Time, Ambiguity) + Agent2Agent/Noise augmentacije; `gaia2-mini` 160; test set privatan (leaderboard koristi validation). POTVRĐENO.
- **Runner/scorer:** `uvx --from meta-agents-research-environments are-benchmark gaia2-run …`; bilo koji model preko LiteLLM; judge = **Llama 3.3 70B Instruct** + exact-match. Docker nije obavezan. POTVRĐENO.
- **Baseline-i (HF blog, 2025-09):** GPT-5 (high) najbolji; Kimi K2 najbolji open; Execution/Search „close to solved“, Time najteži; brojevi nisu izvučeni → NEPOZNATO (u blogu/paperu).
- **Integracija:** adapter postoji (narrow-proxy), ali ekonomija $4.09/invocation i potreba za ARE okruženjem (C-3). Napor **M** (adapter) / trošak **H**. Opšti agent, ne professional deliverable.

### 4.3 GDPval (OpenAI)
- **Izvor:** https://huggingface.co/datasets/openai/gdpval (sha `11e7900c`, `lastModified` 2026-02-10); paper arXiv 2510.04374; https://openai.com/index/gdpval/ (fetch 403). POTVRĐENO (postojanje).
- **Taskovi:** gold subset **220** taskova / 44 zanimanja / 9 sektora (paper: 1,320 ukupno; samo gold javan). Kartica: prompt + reference files + deliverable files + `rubric_pretty`/`rubric_json` → da li rubrike postoje za sve taskove: **ZA PROVERU**. Sadrži canary string; NSFW upozorenje.
- **Licenca:** HF kartica **nema** license tag; arXiv strana pokazuje CC-BY-4.0 za **paper**, ne dataset. → **NEPOZNATO** (uslovi korišćenja dataset-a).
- **Grading:** blind pairwise poređenje od strane stručnjaka (win/tie rate) + „experimental automated grader“ hostovan na https://evals.openai.com (sadržaj nedostupan fetch-u; sekundarno: ~66% slaganje sa ljudima). → lokalno izvršivo za **proizvodnju deliverable-a**, ali **grading zahteva ljude ili OpenAI hosted grader** (cloud zavisnost; prihvatljivo za Waggle BYOK, ne za KVARK režim D-03).
- **Baseline-i:** nisu izvučeni iz zvaničnog izvora (403/PDF prevelik) → NEPOZNATO.
- **Integracija:** nema tool okruženja (fajlovi in → fajl out) → harness **M**; validnost ocenjivanja **H**.

### 4.4 APEX-Agents 1.1 (Mercor)
- **Izvor/verzija:** https://huggingface.co/datasets/mercor/apex-agents-v1.1 — **CC-BY-4.0**; blog https://www.mercor.com/blog/introducing-apex-agents-1-1/ (2026-09-08); referentni agent https://github.com/Mercor-Intelligence/apex_loop_truncated_tools_agent ; infrastruktura Archipelago https://github.com/mercor-intelligence/archipelago (**Apache-2.0**, 282★, push 2026-09-25). POTVRĐENO.
- **Taskovi:** **240** (80 × investment banking, management consulting, corporate law); realni project fajlovi + aplikacije (documents, spreadsheets, PDF, email, chat, calendar). POTVRĐENO.
- **Runner/scorer:** **Harbor 0.20.0** (`uv tool install harbor==0.20.0`), 3 shared `linux/amd64` Docker image-a; komanda `harbor run -p apex-agents-v1.1/tasks -a … -m anthropic/claude-opus-5`; rubrike sa binarnim kriterijumima, judge **DeepSeek-v4-Flash-0731 (t=0.1)**; 1.1 „no longer rewards noncommittal answers“. POTVRĐENO.
- **Lokalno izvršivo:** da, uz Docker (na Windows: WSL2) — na dev/bench mašini; **nije** zahtev za proizvod (certified desktop ostaje bez Docker-a).
- **Baseline-i (blog 2026-09-08):** Claude Fable 5.1 **68.6% pass@1**; GPT-6 Astra **56.3% pass^4** (najviši pass^4); autori ističu jaz pass@4 vs pass^4. POTVRĐENO (kako je objavljeno).
- **Integracija:** Harbor agent shim koji unutar/izvan kontejnera poziva Waggle production sidecar (DIR-22), pinovan dataset+Harbor+judge; napor **M–H**; trošak = judge API + model.

### 4.5 FORTE (LongCat / AGI-Eval)
- **Izvor:** https://github.com/AGI-Eval-Official/FORTE — **MIT**; kreiran 2026-06-29, poslednji push **2026-06-30**, 20★. Leaderboard https://AGI-Eval-Official.github.io/FORTE/. POTVRĐENO.
- **Taskovi:** „180 tasks, ≥10 per profession across 15 professions“ (Marketing, Sales, BA, Ops, Dev, SRE, HR, Finance, PM, Legal, Algorithm, QA, UI/UX, Admin, General); **javno: `data/tasks` = 15 demo taskova** (1 po profesiji); SRE skills izostavljeni; puni skup nije javan. POTVRĐENO.
- **Runner/scorer:** OpenClaw agent unutar Docker image-a; Python 3.10+ stdlib + `docker` CLI; **LLM-as-judge all-or-nothing** (`score = 1` iff svi rubric itemi prolaze); `solution/` referentni odgovori za judge; Windows preko Docker Desktop + WSL2. POTVRĐENO.
- **Baseline-i:** na leaderboard strani (nije izvučeno) → NEPOZNATO.
- **Integracija:** runtime je vezan za OpenClaw (u Waggle-u roadmap-only, CLAUDE.md §1) → adapter **H**; sa 15 javnih taskova nedovoljan za primarni test.

### 4.6 OdysseyBench (Microsoft)
- **Izvor:** https://github.com/microsoft/OdysseyBench — **MIT**; 18★; poslednji push 2026-06-11; paper arXiv 2508.09124 (2025-08-12). POTVRĐENO.
- **Taskovi:** OdysseyBench+ **300** (realni use-case) + OdysseyBench-Neo **302** (sintetički, HomerAgents); aplikacije Word, Excel, PDF, Email, Calendar. POTVRĐENO.
- **Runner/scorer:** OfficeBench Docker okruženje (testbed fajlovi), `llm-as-a-judge.py` + rule-based cross-validation; `agent_interact.py` za custom agent. Baseline brojevi u paperu (nisu izvučeni) → NEPOZNATO.
- **Relevantnost:** fokus na long-horizon memoriju/retrieval → direktno relevantno za Hive Mind tezu (D-12), ali niska aktivnost/održavanje; napor **M–H**.

Ostali kandidati viđeni u pretrazi, **nisu evaluirani** (NEPOZNATO): Agents' Last Exam (arXiv 2606.05405, 960 workflow-a), OmegaUse-OfficeVal (2607.27155), Workspace-Bench 1.0 (2605.03596), WorkBench Revisited (2606.13715), FORCE-Bench (2607.19409 — ime slično FORTE, druga stvar: enterprise finance).

### 4.7 Preporuka: JEDAN primarni professional-work test — **PREDLOG, nije odobreno**

**Predlog: APEX-Agents 1.1 kao primarni test za G2/G3 studiju.** Obrazloženje po kriterijumima §13.1:
1. Zvanični izvor/verzija pinovljiva (HF dataset `mercor/apex-agents-v1.1` + Harbor 0.20.0 + image digesti + judge model/verzija).
2. Taskovi i rubrike u potpunosti javni (CC-BY-4.0) — za razliku od FORTE (15/180) i GDPval (bez licence, ocenjivanje kod OpenAI-ja/ljudi).
3. Runner i scorer otvoreni (Harbor/Archipelago Apache-2.0); grading reproduktivan uz pinovan judge.
4. Artefakt/tool okruženje = dokumenti, tabele, PDF, email, chat, kalendar → poklapa se sa knowledge-work vertikalom (D-06) i Home mail/calendar scenarijem (§5.2).
5. Objavljeni frontier baseline-i na **istom protokolu** (Claude Fable 5.1 68.6% pass@1) → omogućava „system-to-system“ poređenje iz §13.2 sa jasno imenovanom konfiguracijom, bez preuzimanja tuđeg protokola.
6. Ne zahteva da Waggle „pobedi“ (D-18): dozvoljeni ishodi §13.5 ostaju.

**Uslovi/rizici (moraju u manifest §13.6):** judge je cloud API model (DeepSeek-v4-Flash-0731) — trošak i zavisnost; zamena judge-a lokalnim modelom kvari uporedivost sa leaderboard-om, pa se prijavljuje kao odvojen profil; Docker/WSL2 samo na bench mašini; Waggle mora ići kroz production sidecar putanju (DIR-22) preko Harbor agent shim-a; contamination firewall (§13.4) — rubrike i `solution` fajlovi ne ulaze u `.mind`.

**Sekundarno:** τ²-bench kao tool-use kontrola tek ako se adapter napravi (nije nađen u kodu); GAIA2 adapter čuvati za cost-projection; GDPval opciono za kvalitet deliverable-a uz ljudske ocenjivače kasnije. Sve navedeno je PREDLOG (BRIEF §20.4), a ne odobrena odluka.

---

## 5. Kanali — ToS po konkretnom use-case-u (C6, §11.4)

**Use case:** „lični desktop asistent čita moj sopstveni inbox/chat i može da šalje uz moje odobrenje“. Profili: **live API** · **bot/forward** · **export/import** · **roadmap**.

| Kanal | Profil | Šta zvanično piše | Repo stanje (revizija `2af0904d`) | Status |
|---|---|---|---|---|
| **WhatsApp** | **export/import** (+ roadmap); live personal = NE | (1) WhatsApp Business Platform: „AI Providers“ (LLM, gen-AI platforme, **general-purpose AI assistants**) od **15.01.2026** mogu nuditi takve usluge samo gde je zakonski obavezno (novi API korisnici od 15.10.2025 odmah); non-template poruke AI Providera naplaćuju se od 16.02.2026 (u nekim tržištima prestalo 13.05.2026). WABP je business broj — ne čita korisnikov lični inbox. (2) Lični nalog preko unofficial biblioteka: WhatsApp ToS zabranjuje „reverse engineer, alter, modify… extract code“, „gain… unauthorized access“, „bulk messaging, auto-messaging“, „software or APIs that function substantially the same as our Services“. (3) Export chat je funkcija aplikacije (ToS tekst je ne pominje). | `packages/server/src/local/channels/whatsapp-adapter.ts:2` „Baileys (unofficial multi-device WebSocket)“, `:5` „Baileys is an UNOFFICIAL client that violates WhatsApp's ToS; accounts can [be banned]“ → **nije shipping default** | POTVRĐENO NA REVIZIJI (S1 rez „cut live harvest“ potvrđen) |
| **Viber** | **bot/forward** ili roadmap/drop | Samo Chat Bot API (bot ↔ subscribed user; komunikaciju započinje korisnik; korisnik može da se odjavi) + Business Messages preko partnera; Developer Terms: licenca „for commercial and authorized purposes and **not for personal use**“; nema API-ja za lični nalog. TLS ≥1.2. | nema Viber adaptera (grep `viber` → 0 u `packages/server/src`, `packages/agent/src`) | POTVRĐENO NA REVIZIJI |
| **Discord** | **bot/forward** | Self-bots/automatizacija korisničkih naloga zabranjena (Discord support „Automated User Accounts (Self-Bots)“; fetch 403 — tekst ZA PROVERU); bot vidi samo kanale gde je član; `MESSAGE_CONTENT` je **privileged intent** (verifikacija za ≥100 servera), ali „Content in DMs with the app“ stiže bez intenta; bot ne može da čita korisnikove DM-ove sa drugima. | `discord-adapter.ts:4` „the bot dials OUT to Discord's gateway“, `:20` `https://discord.com/api/v10` → bot model, u skladu | POTVRĐENO NA REVIZIJI (bot) / ZA PROVERU (citat policy-ja) |
| **Telegram** | **bot/forward** (sada); user API = **roadmap uz ADR** | Bot API: bot prima „All messages from private chats with users“ (sa njim), u grupama privacy mode; ne vidi druge chatove korisnika, ne vidi druge botove. User API (MTProto/TDLib, `api_id`): third-party klijenti dozvoljeni; zabranjeno „making actions on behalf of the user without the user's knowledge and consent“; zabranjeno korišćenje podataka za treniranje AI. | `telegram-adapter.ts:17` `https://api.telegram.org`, `:40` `botToken` (50s long-poll) → Bot API | POTVRĐENO NA REVIZIJI |
| **Slack** | **live API (user token)** uz ToS ograničenja skladištenja | User token (`xoxp`) = pristup koji korisnik ima; write kao korisnik. API ToS (Effective **10.10.2025**): zabranjeno „use API Data to train a large language model“, „bulk export Slack message and file data“ osim po dodatnom ugovoru; za Data Access/Real-Time Search API „may not create persistent copies, archives, indexes, or long-term data stores of other organizations' API Data“; „explicit authorization from the organization installing your Application“. | `packages/agent/src/connectors/slack-connector.ts` postoji (E2E nije proveravan) | POTVRĐENO NA REVIZIJI (pravila) / ZA PROVERU (pravno: lokalno trajno memorisanje sopstvenih poruka vs „persistent copies“ klauzula) |
| **Gmail** | **live API uz verifikaciju** / BYO-client / export-import (Takeout) | `gmail.readonly`, `gmail.modify`, `gmail.compose`, `gmail.metadata`, `mail.google.com` = **Restricted**; `gmail.send` = Sensitive; `gmail.labels` = non-sensitive. Restricted → OAuth app verification („can potentially take several weeks“) + „annual security assessment“; assessment obavezan za „every app that requests access to Google users' restricted data **and has the ability to access data from or through a third-party server**“ — izuzeće za čisto lokalne aplikacije **nije eksplicitno** na dohvaćenim stranama; reverifikacija svakih 12 meseci od LOA; unverified app cap **100 novih korisnika**; izuzeci: „Apps in development“, „Internal apps“, OAuth plugini. | `packages/agent/src/connectors/gmail-connector.ts`, `gcal-connector.ts` postoje (E2E nije proveravan) | POTVRĐENO NA REVIZIJI (klasifikacija scope-ova) / ZA PROVERU (CASA izuzeće za local-only desktop; cena i tier) |
| **Microsoft Graph** | **live API** (najpovoljniji put) | `Mail.Read`, `Mail.ReadWrite`, `Mail.Send`, `Calendars.Read`, `Chat.Read` — delegated dostupno, **admin consent nije obavezan**; admini mogu ograničiti application access policy. Publisher verification (besplatno; traži verifikovan Microsoft AI Cloud Partner Program nalog + publisher domain) — od 08.11.2020 korisnici u tenantima sa risk-based step-up consent-om **ne mogu** da odobre nove multitenant nepublisher-verified aplikacije. | `outlook-connector.ts`, `ms-teams-connector.ts`, `onedrive-connector.ts` postoje (E2E nije proveravan) | POTVRĐENO NA REVIZIJI / ZA PROVERU (personal MSA nalozi, `Chat.Read` samo work/school) |

Napomena (BRIEF §11.4): scanner injekcija je defense-in-depth; harvestovani mejl/chat nosi taint/provenance i ne može odobriti spoljni efekat. Ovo istraživanje ne menja to.

Izvori: https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/ai-providers ; https://www.whatsapp.com/legal/terms-of-service ; https://developers.viber.com/docs/general/api-access-white-paper/ ; https://www.viber.com/en/terms/viber-developer-distribution-agreement/ ; https://support.discord.com/hc/en-us/articles/115002192352-Automated-User-Accounts-Self-Bots ; https://docs.discord.com/developers/events/gateway#privileged-intents ; https://core.telegram.org/bots/faq ; https://core.telegram.org/api/terms ; https://slack.com/terms-of-service/api ; https://docs.slack.dev/authentication/tokens/ ; https://developers.google.com/workspace/gmail/api/auth/scopes ; https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification ; https://support.google.com/cloud/answer/13464321 ; https://support.google.com/cloud/answer/7454865 ; https://learn.microsoft.com/en-us/graph/permissions-reference ; https://learn.microsoft.com/en-us/entra/identity-platform/publisher-verification-overview

---

## 6. Provider cene vs `packages/agent/src/cost-tracker.ts` (A29, §13.6)

Zvanični izvori (2026-09-27): Anthropic https://platform.claude.com/docs/en/about-claude/pricing ; OpenAI https://developers.openai.com/api/docs/pricing ; Google https://ai.google.dev/gemini-api/docs/pricing ; Anthropic deprecations https://platform.claude.com/docs/en/about-claude/model-deprecations

`DEFAULT_MODEL_PRICING` je na `cost-tracker.ts:26-48`; vrednosti su „per 1K“ (×1000 = per 1M).

| `cost-tracker.ts` linija | Model ID | U kodu ($/1M in/out) | Zvanično ($/1M in/out) | Nalaz |
|---|---|---|---|---|
| :28 | `claude-opus-4-8` | **15 / 75** | **5 / 25** (cache write 6.25, cache hit 0.50) | **NESLAGANJE ×3** — A29 potvrđen |
| :29 | `claude-opus-4-7` | 15 / 75 | 5 / 25 | **NESLAGANJE ×3** |
| :30 | `claude-opus-4-6` | 15 / 75 | 5 / 25 | **NESLAGANJE ×3** |
| :32 | `claude-sonnet-5` | 3 / 15 | **2 / 10** (fusnota: introductory cena postala standardna; povećanje 1.9.2026 „will not occur“) | **NESLAGANJE** |
| :33 | `claude-sonnet-4-6` | 3 / 15 | 3 / 15 | OK |
| :34 | `claude-sonnet-4-20250514` | 3 / 15 | 3 / 15, ali model **Retired 15.06.2026** | cena OK, **ID povučen** |
| :35 | `claude-3-5-sonnet-20241022` | 3 / 15 | nije na pricing strani; **Retired 28.10.2025** (`litellm-config.yaml:26-28` alias → `anthropic/claude-sonnet-4-6`) | **ID povučen** (alias zadržan u routeru) |
| :37-38 | `claude-haiku-4-5`, `-20251001` | 1 / 5 | 1 / 5 | OK |
| :39-40 | `claude-haiku-3-5`, `claude-3-5-haiku-20241022` | 0.25 / 1.25 | **0.80 / 4** (Haiku 3.5); model **Retired 19.02.2026** | **NESLAGANJE** (uneta cena Haiku 3) + ID povučen |
| :42-43 | `gemini-2.5-flash` | 0.30 / 2.50 | 0.30 / 2.50 (text/image/video) | OK (napomena: 2.5 je „previous generation“; 3.7/3.8 Flash = 0.75/3.75) |
| :45-47 | `gpt-5.3-codex` (3 prefiksa) | 1.75 / 14 | 1.75 / 14 (cached in 0.175) | OK |
| :66 | `fallbackPricingFor` Opus | 15 / 75 | 5 / 25 | **NESLAGANJE ×3** za nepoznate Opus ID-eve |
| :67 | fallback Haiku | 1 / 5 | 1 / 5 (4.5) | OK |
| :68 | fallback Sonnet (default za sve ostalo) | 3 / 15 | Sonnet 5 = 2 / 10; Sonnet 4.6 = 3 / 15 | zavisi od modela |

Dodatno (POTVRĐENO NA REVIZIJI): modeli iz `litellm-config.yaml` bez reda u tabeli padaju na Sonnet fallback uz `console.warn` (`cost-tracker.ts:498-508`): `gpt-4o` (zvanično 2.50/10), `gpt-4o-mini` (0.15/0.60), `o3` (2/8), `gemini-2.5-pro` (1.25/10 ≤200k), grok/deepseek/perplexity/kimi/qwen-max (nije proveravano) → pogrešna procena u oba smera. Komentar na `cost-tracker.ts:24-25` („Model IDs cross-checked against litellm-config.yaml“) nije u skladu: `litellm-config.yaml` nema `claude-opus-4-8`/`claude-opus-4-7` model_name (ima `claude-opus-4-6` i `claude-opus-4-7-via-openrouter`).

Benchmark grana `origin/feature/harness-sota-bench` @ `18e5b36a` (2026-07-01), `packages/agent/src/cost-tracker.ts`: `:33` `claude-opus-4-8` 5/25 (tačno), `:28` `claude-opus-4-6` i `:32` `claude-opus-4-7` 15/75 (netačno; komentar `:29-30` „Opus 4.7 stays at the 4.6 list price; Opus 4.8 is the $5/$25 generation“). → S1 A29 sukob potvrđen; **ni jedna grana nije potpuno tačna**. POTVRĐENO NA REVIZIJI.

Ostale relevantne zvanične stavke (za §13.6 manifest): Anthropic batch −50%, cache hit 0.1× (Fable 5.1 0.025×, Opus 5.5 0.05×), `inference_geo: "us"` ×1.1, web search $10/1k pretraga; Opus 5 = 5/25, Opus 5.5 = 4/20, Fable 5.1 = 10/50; Claude ≥4.7 tokenizer ~30% više tokena za isti tekst. OpenAI: gpt-5.4 2.50/15, gpt-5.5 5/30, gpt-5 1.25/10. Google: Gemini 2.5 Pro 1.25/10 (≤200k), 2.5 Flash-Lite 0.10/0.40.

**Lokalno nije nula troška** (§13.6): GPU vreme/energija/hardver za Qwen 3.8 27B moraju u manifest odvojeno od cloud računa; ovaj dokument ne daje te brojeve (NEPOZNATO — meriti).

---

## 7. Šta ostaje otvoreno / nije potvrđeno

| Stavka | Status | Šta bi zatvorilo |
|---|---|---|
| Da li Ollama 0.32.3 (pin) učitava `qwen3.8:27b` na Windows GGML | NEPOZNATO | Pull/generate/tools test; verovatno repin ≥0.32.15 + nova receipt |
| Zvanični min. verzije vLLM/SGLang/llama.cpp za Qwen3.8-27B; preporučen tool parser | NEPOZNATO | Qwen docs update ili empirijski test (`qwen3_xml`) |
| Izmereni VRAM/RAM/latencija po quantu i ctx (A21) | NALAZ — ZA PROVERU | Hardware ladder merenje |
| Da li su stari Qwen3.6-35B-A3B rezultati lokalni ili preko DashScope | ZA PROVERU | Pregled `benchmarks/gaia2/PILLAR1-QWEN36-N160-RESULT-2026-05-27.md` manifesta |
| agent-native per-file prava i stvarna durable/replay semantika | DELIMIČNO/NEPOVEZANO | LICENSE u repou; čitanje `packages/core/agent/production-agent.ts` |
| Inngest SDK licenca (Apache-2.0 u `package.json` vs GPL-3.0 GitHub detekcija) | DELIMIČNO | Pročitati `LICENSE*` u `inngest/inngest-js` |
| τ² telecom/banking pun broj taskova; GDPval/OdysseyBench/FORTE baseline brojevi | NEPOZNATO | Paper/leaderboard čitanje (PDF prevelik za fetch) |
| GDPval licenca dataset-a i uslovi evals.openai.com grader-a | NEPOZNATO | HF kartica/OpenAI strana (403 pri fetch-u) |
| Discord Developer Policy tačan citat (self-bots) | ZA PROVERU | Strana vraća 403 automatizovanom fetch-u; ručno |
| Gmail CASA izuzeće za local-only desktop; cena/tier | ZA PROVERU | Google OAuth Verification FAQ / assessor |
| Slack „persistent copies“ klauzula vs lokalna lična memorija | ZA PROVERU (pravno) | Pravni pregled API ToS §Data Access |
| MS Graph za personal MSA naloge (outlook.com) | ZA PROVERU | Test sa MSA nalogom |
| Datumi u Ollama release notes prikazani bez godine („14 Aug“) | napomena | Godina 2026 izvedena iz konteksta (v0.32.x avgust 2026) |

---

## 8. Registar izvora (svi provereni 2026-09-27)

**Qwen:** https://huggingface.co/Qwen/Qwen3.8-27B · https://huggingface.co/api/models/Qwen/Qwen3.8-27B · https://huggingface.co/Qwen/Qwen3.8-27B-FP8 · https://huggingface.co/Qwen/Qwen3.6-35B-A3B · https://huggingface.co/unsloth/Qwen3.8-27B-GGUF · https://huggingface.co/ggml-org/Qwen3.8-27B-GGUF · https://ollama.com/library/qwen3.8 · https://ollama.com/library/qwen3.8/tags · https://github.com/ollama/ollama/releases (v0.32.12, v0.32.15, v0.33.1, v0.34.4) · https://qwen.readthedocs.io/en/latest/framework/function_call.html · https://qwen.ai/blog?id=qwen3.8 · https://qwen.ai/blog?id=qwen3.8-flash-next · https://dev.to/purpledoubled/run-qwen-38-27b-locally-real-gguf-sizes-the-kv-cache-trick-and-the-template-trap-114j (sekundarno)

**OSS harness:** https://github.com/BuilderIO/agent-native (+ `gh api` contents/packages, releases, commits, search/code) · https://github.com/omnigent-ai/omnigent · https://www.databricks.com/blog/introducing-omnigent-meta-harness-combine-control-and-share-your-agents

**Durable:** vidi §3 lista.

**Benchmark:** https://github.com/sierra-research/tau2-bench (+ `docs/evaluation.md`, `data/tau2/domains/*/split_tasks.json`) · https://taubench.com · https://github.com/facebookresearch/meta-agents-research-environments · https://facebookresearch.github.io/meta-agents-research-environments/user_guide/gaia2_evaluation.html · https://huggingface.co/blog/gaia2 · https://huggingface.co/datasets/openai/gdpval · https://arxiv.org/abs/2510.04374 · https://huggingface.co/datasets/mercor/apex-agents-v1.1 · https://www.mercor.com/blog/introducing-apex-agents-1-1/ · https://github.com/mercor-intelligence/archipelago · https://github.com/AGI-Eval-Official/FORTE · https://github.com/microsoft/OdysseyBench · https://arxiv.org/abs/2508.09124

**Kanali:** vidi §5 lista.

**Cene:** https://platform.claude.com/docs/en/about-claude/pricing · https://platform.claude.com/docs/en/about-claude/model-deprecations · https://developers.openai.com/api/docs/pricing · https://ai.google.dev/gemini-api/docs/pricing

**Repo (read-only, revizija `2af0904d`):** `packages/agent/src/cost-tracker.ts:24-68,498-508` · `packages/server/src/local/managed-ollama-runtime.ts:28-29,163-203` · `litellm-config.yaml:9-213` · `packages/agent/src/model-tier.ts:19` · `packages/agent/src/model-family.ts:62-66` · `packages/agent/src/cookbook/model-fit.ts:210-214` · `packages/agent/src/cookbook/catalog.ts:45-51` · `packages/server/src/local/channels/{whatsapp,telegram,discord}-adapter.ts` · `packages/agent/src/connectors/*` · `benchmarks/gaia2/adapter.ts:1-12` · `package.json:73` · `origin/feature/harness-sota-bench:packages/agent/src/cost-tracker.ts:26-33` (`git show`)
