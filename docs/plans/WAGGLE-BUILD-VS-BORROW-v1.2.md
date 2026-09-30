# WAGGLE — Build-vs-Borrow zapis (Preserve → Borrow → Adapt → Build)

**Revizija dokumenta: 1.2 DRAFT · 27.09.2026 · pregledana revizija koda 2af0904df01ca3d374cc78ba95b60dc579dd6a7a**

**Revizija dokumenta: 1.2.1 DRAFT · 30.09.2026 · završno zatvaranje (H-01..H-12)**

Izmene 1.2.1: H-03 (ponovna provera 30.09.2026) — BB-01 `HarnessRunState` opseg `workflow-harness.ts:118-128` → `:110-128` (LOW `finish/facts/f1/06`; read-only `git show 2af0904d`: interfejs počinje na liniji 110); §5 BB-COST.6 usklađen sa BB-13 i označen kao živi eksterni podatak (LOW `finish/facts/f1/04`). Ostatak dokumenta je nepromenjen; stanje „dva untracked `.docx`” iznad i u BB-00 odnosi se na radno stablo `D:/Projects/waggle-os` na `2af0904d`.

Radno stablo `D:/Projects/waggle-os` == HEAD (`git status --porcelain` prijavljuje samo dva untracked `.docx` u `docs/`), pa svaki `path:line` ispod važi za navedenu reviziju. Repo je tretiran read-only; ovaj dokument ne menja kod, ne bira dependency za produkciju i ne odobrava ništa (BRIEF §20.4). Datumska osnova: 27.09.2026; 12–17 nedelja = 20.12.2026–24.01.2027.

**Legenda statusa (obavezna na svakoj tvrdnji; usklađena sa PRD v1.2):** ODLUKA (samo D-01..D-18) · ISTORIJSKA FOUNDER ODLUKA (memorija, datum) — usklađena sa D-xx / smerom briefa (founder zapisi iz projektne memorije pre 27.09.2026; brief §2.1/§21: nije D autoritet) · PREDLOG — SMER BRIEFA (DIR-nn, brief §17–§19 razrešenja, brief §k — planerski smer, nikad ODLUKA; zabrane iz DIR-01 = „PREDLOG — SMER BRIEFA (DIR-01, granica ovlašćenja)”) · POTVRĐENO NA REVIZIJI · NALAZ AUDITA — ZA PROVERU · DELIMIČNO/NEPOVEZANO · PREDLOG · ODLOŽENO · NEPOZNATO. „Modul postoji“ nikada nije dokaz E2E funkcije. „Not found“ se navodi samo posle više grep-ova po sposobnosti, ne po imenu.

---

## 0. Svrha, osnova i pravila čitanja

**BB-00.1 — Šta je ovaj dokument.** Zapis po oblasti tražen u BRIEF §14 (DIR-24), FRD v1.1 FR-OSS-01/-02/-03/-12 (FRD v1.1 §18; FRD v1.2 nema zasebnu OSS sekciju — §16.1/§16.2 napominju da FR-OSS-01..12 ostaju važeći) i PRD v1.1 §14 / PRD v1.2 §15: za svaku veću oblast — postojeći Waggle (sa pozivaocima), OSS kandidati sa ocenom, odluka Preserve/Borrow/Adapt/Build, obrazloženje, vlasnik (uloga). Uključuje šemu provenance inventara (FR-OSS-04) i seed listu. **ODLUKA** (D-17 „BORROW → ADAPT → BUILD“) + **PREDLOG — SMER BRIEFA** (DIR-24).

**BB-00.2 — Šta nije.** Nije odobrenje za dodavanje dependency-ja, nije ADR i nije implementacija. Svaka odluka „Borrow/Adapt“ ispod je **PREDLOG** dok je founder ne potvrdi i dok test-kriterijum iz §3 ne prođe. Odluke D-01..D-18 se ne otvaraju; „Option A ship first“ nije plan; radna osnova je G1 → G2 → G3 (BRIEF §5.1). **ODLUKA** (D-01..D-18 se ne otvaraju) + **PREDLOG — SMER BRIEFA** (§5.1 radna osnova; ratifikacija: founder).

**BB-00.3 — Autoritet izvora.** Faza-A nalazi (`docs/plans/v1.2-evidence/phaseA/*.md`) i refuter verdikti (`*.refute.md`) nadjačavaju S1 gde se razlikuju — **POTVRĐENO NA REVIZIJI** za nalaze izvedene iz repoa (izvori navedeni u fusnoti). Eksterni podaci (repo/verzija/commit/licenca/održavanje/zvezdice OSS kandidata) potiču iz `docs/plans/v1.2-evidence/phaseA/external.md` i predstavljaju živo stanje GitHub-a/registara, ne svojstvo revizije `2af0904d`: **NALAZ AUDITA — ZA PROVERU (live 27.09.2026, izvor: external.md §2–3, §8)**; isto važi za model, benchmark i kanalske podatke (external §1, §4, §5). Gde faza A nije istražila neku OSS oblast, to je označeno **NEPOZNATO** i navedeno je šta bi ga zatvorilo — ne izmišljaju se kandidati.

**BB-00.4 — Definicije odluka.**

| Odluka | Značenje u ovom dokumentu |
|---|---|
| **Preserve** | Postojeći Waggle kod ostaje jezgro; menja se samo ugovor/povezivanje/test. Zabranjeno „čuvati“ no-op kao gotovu sposobnost (BRIEF §14, DIR-13). |
| **Borrow** | OSS se koristi kao dependency ili se preuzima kod/patern bez izmene semantike, uz licencu i provenance u inventaru (§4). |
| **Adapt** | OSS se omotava/forkuje/portuje uz izmene; obavezan upstream-sync ili long-term ownership plan (FRD v1.1 §19 OSS acceptance; u FRD v1.2 kroz §16.1/§16.2 napomenu o FR-OSS-01..12). |
| **Build** | Novi kod, sa kratkim obrazloženjem zašto Preserve/Borrow/Adapt ne zadovoljava (PRD v1.1 §14 „OSS Harvest gate“ / PRD v1.2 §15, PRD-15-01). |

**BB-00.5 — Kriterijumi ocenjivanja (FRD v1.1 FR-OSS-03, PRD v1.1 §14 / PRD v1.2 §15).** Licenca; održavanje/aktivnost; bezbednost/supply chain; težina dependency-ja; Windows; offline/local-first; API/arhitektonski fit; testovi; performanse; upstream trošak/verovatnoća divergencije; exit strategija. Kolone u tabelama ispod prate ovaj redosled. **PREDLOG** (nasleđen zahtev FRD v1.1 FR-OSS-03; S5 nacrt, nije D-nn).

**BB-00.6 — Granice repoa koje utiču na sve oblasti (POTVRĐENO NA REVIZIJI).**
- Windows Solo paket ne sme zavisiti od developer Node/Python/Docker/eksternog LiteLLM/zasebno instaliranog Ollama (CLAUDE.md §1). Python i Docker su dozvoljeni samo na dev/bench mašini, ne u installer-u.
- Već isporučene native/runtime komponente: `better-sqlite3` **12.6.2** (`package.json:73`), `sqlite-vec-windows-x64` **0.1.9** (`package.json:133`), `onnxruntime-node` **1.21.0** (lock), `@huggingface/transformers` **3.8.1** (`package.json:114`), `cron-parser` **4.9.0** (`packages/core/package.json:22`), `@ax-llm/ax` **24.0.23** (lock; deklarisano `^24.0.20` u `packages/agent/package.json:35`), `@modelcontextprotocol/sdk` **1.30.1**, `fastify` **5.12.5**, Node desktop pin **22.23.2** (`scripts/bundle-node.mjs:39`), Ollama pin **0.32.3** / rollback **0.32.0** (`packages/server/src/local/managed-ollama-runtime.ts:28-29`).
- Substrat `packages/hive-mind-core/src/{mind,harvest}` je predmet kuriranog OSS forward-porta (CLAUDE.md §7.5); svaka izmena tamo nosi trošak re-baseline-a u `scripts/oss-drift-baseline.json`. Drift checker trenutno vraća exit 1 sa 22 known blockers + **3** unreviewed (`docs/plans/v1.2-evidence/phaseA/oss-drift-check-output.txt`; F-REL-07).

**BB-00.7 — Kontrolni prolaz nad radnim stablom (== HEAD `2af0904d`; `git status --porcelain` = samo dva untracked `.docx`). POTVRĐENO NA REVIZIJI.** Nezavisno od faze A ponovo su pročitani sledeći anchori i odgovaraju tekstu ovog dokumenta: `package.json:73,114,133`; `scripts/bundle-node.mjs:39`; `managed-ollama-runtime.ts:28-29`; `agent-run-registry.ts:29` (`MAX_EVENTS = 2_000`); `held-action-executor.ts:6-10` (inline ADR „never mid-run suspend/resume“); `workflow-harness.ts:313` (`shouldSkipVerify()`); `builtin-harnesses.ts:128,181`; `verification-gate.ts:33` (`'run_harness'`); `command-registry.ts:108`; `capability-router.ts:51`; `evolution-runs.ts:23-28` (enum bez `rolled_back`); `execution-traces.ts:150-151` (`CHECK` bez `gate_passed`); `iterative-optimizer.ts:88-93` (`EvolutionTarget` bez recipe vrednosti); `oss-drift-check.mjs:22-28`; `bundle-native-deps.mjs:113-130` (kopira binarije bez LICENSE); `certify-windows-installer.ps1:2596-2600,2904`; `.github/workflows/ci.yml:108-110` (`npm audit` `continue-on-error: true`); `hardware-detect.ts:7-19`; `cookbook/catalog.ts:44-51` (najnoviji Qwen = `qwen3:*`); `local-inference.ts:313-332` (`stream: false`, 45-min timeout); `inprocess-embedder.ts:32`; `inprocess-reranker.ts:55`; `packages/core/package.json:22`; `packages/agent/package.json:35`; `packages/shared/package.json:16`. Brojevi: 18 `starter-skills/*.md`, 30 konektora (bez `index.ts`), 148 `id:` unosa u `mcp-catalog.ts` (jedan pogodak za `license`, i to `capabilities`). `node_modules`: `onnxruntime-node` 1.21.0 MIT, `sqlite-vec-windows-x64` 0.1.9 „MIT OR Apache“, `sqlite-vec` 0.1.9, `@ax-llm/ax` 24.0.23 Apache-2.0 — sva četiri **bez** LICENSE fajla; `better-sqlite3` 12.6.2, `cron-parser` 4.9.0, `@huggingface/transformers` 3.8.1, `@modelcontextprotocol/sdk` 1.30.1, `fastify` 5.12.5, `undici` 8.11.2, `zod` 4.6.5, `stripe` 22.6.2 — sa LICENSE fajlom. `vendor/pptxgenjs/LICENSE` postoji; `git ls-files` bez `THIRD_PARTY*|SBOM|NOTICES`; `tauri.conf.json` bez `licenseFile`; `packages/{optimizer,weaver}/LICENSE` „proprietary and confidential“ uz `"license": "MIT"` (`optimizer/package.json:17`, `weaver/package.json:24`); 9 manifesta bez `license` polja (lista u BB-12). Nijedan spot-check nije odstupio od teksta.

---

## 1. Pregled odluka (jedan red po oblasti)

| ID | Oblast | Postojeći Waggle (sažetak) | OSS kandidat(i) | Odluka | Status odluke |
|---|---|---|---|---|---|
| BB-01 | Durable run store | `AgentRunRegistry` (JSON fajl), `CheckpointStore`/`RecoveryRunner` (nepovezani), held-action queue, `CronStore` leases | Reflow (MIT, SQLite), persistasaurus/Morling (referenca), DBOS/Temporal/Restate/Inngest/Absurd (ne ispunjavaju uslove) | **Preserve** postojeće + **spike Adapt(Reflow) vs Build(minimalni SQLite)** po §3 | PREDLOG |
| BB-02 | Harness engine/router | `advancePhase` state machine, deterministički gate helperi, `detectTaskShape`, `composeWorkflow`, `CapabilityRouter`, `HarnessTraceBridge` | agent-native (pattern only), Omnigent (pattern only) | **Preserve + Build** (server-side router i observed-evidence gates su net-new) | PREDLOG |
| BB-03 | Context package | `recallMemory` 7 lane-ova + RAWDETAIL, `PromptAssembler`, `executor-brief.ts`, hook runtime | nijedan istražen u fazi A | **Preserve** engine + **Build** tipizovani ugovor (omotač) | PREDLOG (kandidati NEPOZNATO) |
| BB-04 | Capability resolver | 4 engine-a bez fasade; `CapabilityProposalStore`; `PermissionEnvelope` ne postoji kao objekat | agent-native „shared actions“ (pattern only) | **Preserve** engine-e + **Build** tanku fasadu i envelope | PREDLOG |
| BB-05 | Shared actions (UI/agent/rutina) | `ACTION_REGISTRY` (4 akcije, samo ⌘K), `ToolDefinition` deljen agent↔held action, UI ide na REST direktno | agent-native `@agent-native/core` (MIT po package.json, bez root LICENSE) | **Preserve** `ToolDefinition` + **Adapt** postojeći `ActionDescriptor`; agent-native samo patern | PREDLOG |
| BB-06 | Evolution/promotion | GEPA (`@ax-llm/ax`), running judge, `EvalDatasetBuilder.build()` (nepovezan), `evolution_runs`, deploy/rollback funkcije (rollback bez pozivaoca) | `@ax-llm/ax` (Apache-2.0, već dependency); drugi optimizeri nisu istraženi | **Preserve + Borrow(ax)** + **Build** active-version pointer, holdout, manifest | PREDLOG |
| BB-07 | Attention / WorkItem sync | Gmail/GCal/Outlook/Slack konektori, `connector-harvest.ts`, `home.ts` briefing; WorkItem store ne postoji; incremental sync (historyId/syncToken/delta) ne postoji | nijedan istražen u fazi A | **Preserve** konektore + **Build** WorkItem store i delta sync; ToS profil po kanalu | PREDLOG (OSS NEPOZNATO) |
| BB-08 | Local inference / hardware detect | managed Ollama runtime (sha256 pin, Range resume), `hardware-detect.ts` (NVIDIA/Apple/CPU), `model-fit.ts`, `cookbook/catalog.ts` (bez Qwen 3.5/3.6/3.8) | Ollama (MIT), vLLM (Apache-2.0; server put), llama.cpp/LM Studio kao OpenAI-compatible presets (R17), odysseus `hwfit` (AGPL — samo koncept) | **Preserve + Borrow(Ollama/vLLM/OpenAI-compat)** + **Build** WMI/AMD detekciju i re-baseline kataloga | PREDLOG |
| BB-09 | Benchmark runners | `benchmarks/gaia2/adapter.ts` (narrow-proxy), `benchmarks/harness` (4-cell), τ² adapter samo na grani `feature/harness-sota-bench` | APEX-Agents 1.1 (CC-BY-4.0) + Harbor 0.20.0, τ²-bench v1.0.1 (MIT), ARE (MIT)+gaia2 (CC-BY-4.0), GDPval (licenca NEPOZNATO), FORTE (MIT, 15/180), OdysseyBench (MIT) | **Borrow** zvanične runnere/scorere; **Build** samo Harbor/HTTP shim ka production sidecar-u (DIR-22); cherry-pick τ² adaptera bez rebase-a | PREDLOG (primarni test nije odobren) |
| BB-10 | Skills pack | 18 first-party starter skills (`packages/sdk/src/starter-skills/*.md`), skill create/distill/audit/hygiene putevi | `anthropics/knowledge-work-plugins` i `anthropics/skills` — licenca/verzija **nije proverena** u fazi A | **Preserve** first-party pack; OSS uvoz **ODLOŽENO** do per-repo licencne provere | PREDLOG / NEPOZNATO |
| BB-11 | Connectors / MCP | 30 first-party konektora (`packages/agent/src/connectors/`), MCP katalog 148 stavki (`packages/shared/src/mcp-catalog.ts`), `MarketplaceInstaller`+`SecurityGate`, `mcp-runtime.ts` | OSS MCP serveri iz kataloga (licenca po serveru; katalog nosi `license` polje samo u marketplace sync-u) | **Preserve** konektore i installer; **Borrow** MCP servere isključivo kroz SecurityGate + inventar; bez silent install-a (R11) | PREDLOG |
| BB-12 | Licenses / SBOM tooling | `oss-drift-check.mjs`, `bundle-node.mjs` NODE-LICENSE, `stage-sidecar-deps.mjs` (čuva LICENSE), `certify-windows-installer.ps1:2596-2600`; **nema** SBOM/THIRD_PARTY_NOTICES/license CI | CycloneDX/SPDX generatori za npm, `license-checker`-klasa alata, `cargo-deny`/`cargo-about` — **nije istraženo** u fazi A | **Borrow** standardni SBOM/notices alat posle evaluacije; **Build** samo agregaciju za native binarije i model/runtime unose | PREDLOG (alati NEPOZNATO) |

---

## 2. Zapisi po oblasti

### BB-01 — Durable run store (run lifecycle, checkpoint, actions, lease)

**Šta tražimo (ugovor):** `DurableRun`, `PhaseAttempt`, `Checkpoint`, `ToolAction`/`ToolAttempt` (stabilan `actionId` ≠ `attemptId`), `RunEvent` sa monotonim `seq`, `ProofReceipt` (BRIEF §6.3); kanonska stanja sa legacy mapom (§6.4); lease/fencing (§6.5); migracija `agent-runs.json` (§12.4). Vezani testovi: AT-07, AT-08, AT-09, AT-10, AT-27.

**Postojeći Waggle — POTVRĐENO NA REVIZIJI (pozivaoci provereni grep-om; izvor F-DUR-01..14 + refute):**

| Sredstvo | Putanja | Pozivaoci / testovi | Ocena za reuse |
|---|---|---|---|
| `AgentRunRegistry`: run zapis pre izvršenja, revision/seq event log, `eventsSince(since)` + `resetRequired`, atomic tmp+rename persist sa Windows fallback-om, `reconcileExternalProcesses` | `packages/server/src/local/agent-run-registry.ts` (`:243-257`, `:497-508`, `:522-574`) | `index.ts:538`, `fleet-run-executor.ts:413,480-496,551`, `chat-collaboration.ts:119-622`, `routes/agent-runs.ts`, `routes/agents.ts:106-160`, `routes/tools.ts:211-336` | **Preserve** kao adapter/fasada nad budućim store-om (S1 A8 smer). Ograničenja: whole-file JSON, `MAX_EVENTS=2_000` (`:29`), `load()` tiho prazan store na `version!==1`/corrupt (`:522-535`), restart → svi interni runovi terminalno `interrupted` (`:510-520`, konstruktor `:137`), nema tranzicije iz `interrupted` (0 u `packages/server/src`). |
| `CheckpointStore` (schema_version=1, atomic save, `verifyIntegrity`) + `RecoveryRunner` (retry/backoff/fallback/exhaust) | `packages/agent/src/long-task/checkpoint.ts:31,85,170-211,267-290`; `recovery.ts:250-386` | jedini ne-test potrošač `retrieval-agent-loop.ts:153,568-579,713-755` (opciono); `RecoveryRunner` 0 produkcionih pozivalaca; `/api/agent/run`, gaia2 adapter, `agent-loop.ts` = 0 | **DELIMIČNO/NEPOVEZANO** → asset za **Adapt**: jedinica oporavka je LLM turn, ne faza (DIR-05); potrebno mapiranje `CheckpointStepState → Checkpoint`. Cross-process resume dokazan samo u `packages/agent/tests/long-task-loop-integration.test.ts:221-330`. |
| Held-action queue: `pending_actions`, atomic claim `held→approved` (`UPDATE … WHERE id=? AND status='held'`), TTL 7d, re-validacija na execute | `packages/server/src/local/held-action-executor.ts:6-10,29,154-166,191-235`; `packages/core/src/cron-store.ts:83-88,505-586` | producenti `index.ts:2632-2645`, `chat-approval-hook.ts:301-323`; potrošač `routes/approval.ts:58-99`; testovi `held-action-executor.test.ts` (18) | **Preserve** kao polazni patern za stabilan `actionId` (bliži DIR-06 nego S1 A7 ključ `runId+phaseId+attempt+callIndex`, koji u kodu ne postoji). Rupa: nema `unknown_outcome`/`dispatching` statusa; crash između `tool.execute` (`:233`) i upisa rezultata (`:235`) ostavlja red `approved` zauvek (F-DUR-05 HOLDS). Inline ADR „never mid-run suspend/resume“ (`:6-10`) zahteva superseding ADR (BRIEF §20.2 (2),(4)). |
| `CronStore` + `LocalScheduler`: `getDue/markRun`, run leases + boot sweep, rate-limit resume, 5-strike auto-disable, history retention 30d, `ai_task` dnevni cap | `packages/core/src/cron-store.ts:203-206,367-382,442-447`; `packages/server/src/local/cron.ts:219-389` | `index.ts:1913-2706` (8 job tipova); testovi `local-scheduler`, `cron-scheduler-hardening`, `cron-error-handling`, `automations`, `core/tests/cron-store` | **Preserve** raspored; execution state razdvojiti (BRIEF §12.4). Rupe: lease je čist `INSERT` bez UNIQUE → nije fencing (AT-09); executor nema occurrence id; `computeNextRun` bez `tz`; **NALAZ AUDITA — ZA PROVERU:** `getDue()` poredi ISO `'T'` string sa `datetime('now')` (razmak) → isti-dan dospelost možda nikad ne nastupa (refute F-DUR-10; SQL probe nad `:memory:`, ne nad `CronStore`). |
| Harvest resume patern (`interrupted` → resume u drugom domenu) | `packages/server/src/local/routes/harvest.ts:128`; `apps/web/src/lib/adapter.ts:4018`; `HarvestTab.tsx:100-227` | UI M-08 | **Borrow iz Waggle-a** za W1 resume API (refute F-DUR-01 kontekst). |
| Serijalizabilan `HarnessRunState` (`phaseStatuses`, `checkpoints`, `totalTokens`) | `packages/agent/src/workflow-harness.ts:110-128` | in-memory `workflow-tools.ts:447` | Oblik koji se može serijalizovati u `Checkpoint`. |
| Registry stream `GET /api/agent-runs/events?since=` | `routes/agent-runs.ts:61-116` | `RoomApp.tsx`, `room-state-reducer.ts` | Kompatibilan ekvivalent `sinceSeq` za run-status, **ne** za chat tekst/kartice (chat SSE nema `Last-Event-ID`; 0 u `packages/server/src`). |

**Šta NIJE nađeno (više grep-ova po sposobnosti, F-DUR §3): POTVRĐENO NA REVIZIJI** — `DurableRun|ProofReceipt|ToolCallJournal|runs.db|idempotencyKey|Idempotency-Key` = 0 relevantnih (jedini `latestDurableRun` u `routes/agents.ts:106,153,490` je lokalni helper nad registry-jem); `sinceSeq|Last-Event-ID` u chat SSE = 0; timezone/misfire konfiguracija = 0; server-driven phase executor = 0 (`createHarnessRun|advancePhase(` u `packages/server/src` = 0).

**OSS kandidati — NALAZ AUDITA — ZA PROVERU (live 27.09.2026, izvor: external.md §3, §8; nije svojstvo revizije) — 5 kriterijuma prema external.md §3: (a) embed u Node/Fastify sidecar bez zasebnog servera, (b) SQLite, (c) Windows, (d) permisivna licenca, (e) zrelost/održavanje:**

| Kandidat | Repo / verzija | Licenca | Održavanje | Bezbednost (supply chain) | Windows | Offline | Težina deps | API fit | Testovi | Perf | Exit strategija | Verdikt |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Reflow** | `danfry1/reflow-ts` v0.7.0 (push 2026-09-14) | MIT | 1 autor, 41★, kreiran 2026-03-11 → **bus factor 1** | nije pregledan (NEPOZNATO); mala površina | da (Node) | da | `reflow-ts/sqlite-node` traži `better-sqlite3 ≥9` → **kompatibilno sa 12.6.2** (bez drugog native builda) | lease/heartbeat, retries, cooperative cancel (`AbortSignal`), `sleep`/`waitFor` sa otpuštanjem lease-a, idempotent enqueue, `getRunStatus()` → pokriva deo AT-09/AT-10; **nema** ProofReceipt/PhaseAttempt/actionId semantike | NEPOZNATO (nije čitan test suite) | NEPOZNATO (nije mereno) | vendor/fork uz MIT; mala baza = lako preuzeti održavanje | **Najbliži fit** — kandidat za Adapt spike |
| persistasaurus / Morling blog | `gunnarmorling/persistasaurus`, blog 2025-11-20 | Apache-2.0 | referentni | n/a | Java | n/a | n/a (ne uvozi se) | „<1000 LOC, not production-ready“; nema retry/backoff, paralelizam, compensation | — | — | referenca za dizajn | **Referenca za Build** |
| DBOS Transact TS | `dbos-inc/dbos-transact-ts` v5.1 | MIT | aktivan, 1,376★ | — | da | ne | **Postgres obavezan** (SQLite samo u Go SDK v0.17) | ne ispunjava (b) | — | — | — | Odbačen |
| Temporal | `temporalio/temporal` + `sdk-typescript` | MIT | zreo, 23k★ | — | `temporal.exe` dev server | delimično | zaseban binarni server + Rust core | „sidecar sidecar-a“ pretežak za desktop | — | — | — | Odbačen za desktop; moguće za KVARK server profil (ODLOŽENO) |
| Restate | `restatedev/restate` | server **BSL 1.1**, SDK MIT | aktivan | — | **bez Windows binarija** | ne | zaseban server, RocksDB | — | — | — | — | Odbačen |
| Inngest | `inngest/inngest` + SDK `inngest@4.21.0` | server SSPL + delayed Apache; SDK `package.json` Apache-2.0 (GitHub detekcija GPL-3.0 → NEPOZNATO) | aktivan, 5,894★ | — | poznati Win11 problemi | ne | zaseban dev server | — | — | — | — | Odbačen |
| Absurd | `earendil-works/absurd` | Apache-2.0 | „experiment“, push 2026-08-10 | — | — | ne | Postgres-only | — | — | — | — | Odbačen |
| LangGraph JS `SqliteSaver` | `@langchain/langgraph-checkpoint-sqlite` | MIT | održavan | — | da | da | `better-sqlite3 ^11.7.0` → **konflikt sa 12.6.2** (dva native builda) | samo checkpointer za LangGraph grafove; zahteva LangGraph runtime | — | — | — | Odbačen |
| Vercel Workflow DevKit | `vercel/workflow` | Apache-2.0 | 2,439★, public beta | — | da | „Local World“ = JSON fajlovi, „not production“ | custom World nad SQLite = Build posao | delimično | — | — | — | Odbačen kao dependency; koncept „World“ = referenca |
| iterativeflow / OpenWorkflow / Resonate / durabletasks | razni | MIT / Apache / Apache / **bez licence** | nezreo / NEPOZNATO / zaseban server / mrtav | — | — | — | — | — | — | — | — | Odbačeni |

**Odluka (PREDLOG):** **Preserve** `AgentRunRegistry` (kao adapter), held-action patern, `CheckpointStore` semantiku, `CronStore` raspored, AbortSignal lanac (`agent-loop.ts:1090-1108`). Za samo jezgro run store-a: **ograničen spike u dve grane — (1) Adapt Reflow (vendor ili fork, MIT) vs (2) Build minimalni engine nad `better-sqlite3` sa Reflow/persistasaurus kao referencama** — odluku donosi **test-kriterijum iz §3 (R22)**, ne LOC. SQLite je kandidat, ne odluka (BRIEF §6.3, A8 „KANDIDAT + ADR“). Nova baza se ne dodaje ako postojeći storage može dokazivo zadovoljiti ugovor; execution state se ne smešta u semantičku memoriju (Loop `loop:<id>` state danas živi u personal `.mind` Awareness sloju i ulazi u recall kao red „Pending Items“ — refute F-DUR-09 HOLDS+).

**Obrazloženje:** nijedan kandidat ne ispunjava svih 5 uslova (a)–(e) (NALAZ AUDITA — ZA PROVERU, live 27.09.2026, izvor: external.md §3, §8; rezime external §0 red 7 kaže „sva 4 uslova“, ali nabraja pet — merodavna je lista (a)–(e) u §3). Reflow jedini nema zaseban proces, koristi kompatibilan `better-sqlite3`, ali ima bus factor 1 i ne pokriva ProofReceipt/PhaseAttempt/action-attempt razdvajanje — to bi u oba slučaja bilo Waggle kod. S1 „Build ~600–1000 LOC“ ostaje validna opcija, ali **nije unapred zaključena** (R22).

**Vlasnik (uloga):** Runtime/W1 owner; ADR (2) i (3) iz BRIEF §20.2; merge vlasnik za `agent-run-registry.ts`, `held-action-executor.ts`, `cron-store.ts`.

**Otvoreno:** Reflow test suite i bezbednosni pregled (NEPOZNATO); `getDue()` format-bug (NALAZ — ZA PROVERU, repro: `store.create({cronExpr:'* * * * *'})` → posle >60 s `getDue()` očekivano 1, hipoteza 0); da li `interrupted → queued` tranzicija lomi `agent-run-registry.test.ts:84-94` (refute: da, ako se menja tabela tranzicija — zato eksplicitan resume API).

---

### BB-02 — Harness engine i router (faze, gates, režimi)

**Šta tražimo:** server-side razdvajanje `conversation`/`work` i `normal`/`strict`/`benchmark` (DIR-03), server kao autoritet dokaza (DIR-07), tri nivoa provere (§7.2), run-scoped event bus (§6.4). Testovi: AT-01, AT-02, AT-03, AT-06, AT-21.

**Postojeći Waggle — POTVRĐENO NA REVIZIJI (F-HARN-01..09, repro 25/25 nad `packages/agent/dist`; refute 7/7 HOLDS):**

| Sredstvo | Putanja | Pozivaoci | Ocena |
|---|---|---|---|
| `advancePhase` state machine: gates → checkpoint → retry (`maxRetries`) → abort; imutabilni state | `packages/agent/src/workflow-harness.ts:213-374` | `workflow-tools.ts:424`; test `harness-trace-bridge.test.ts:323` | **Preserve** mašinu; zameniti izvor dokaza |
| Deterministički gate helperi (`hasToolCalls`, `hasMinSections`, `hasPattern`, `hasMinLength`, `hasSpecificImprovement`) | `builtin-harnesses.ts:13-89` | 3 ugrađena harness-a `:94-238` | **Preserve**; popraviti semantiku (VERDICT vrednost, exit code) |
| Tri ugrađena harness-a + `matchHarness`/`getHarnessById` | `builtin-harnesses.ts:94-259` | `workflow-composer.ts:19,82,102`; `workflow-tools.ts:10,307,366` | **Preserve** kao seed za dve knowledge-work recipe putanje (W3) |
| `run_harness` run_id scoping (state ne bleed-uje između sesija, `93ff7813`) | `workflow-tools.ts:371-390,440-465` | testovi `workflow-tools-harness.test.ts` (8) | **Preserve**; `runId` treba da uđe u event payload (F-HARN-07) |
| D3 `assertsUnverifiedCompletion` + disclosure putanja bez novog turna | `verification-gate.ts:220-239`; `loop-gates.ts:907-920` | `agent-loop.ts:1523-1534,1649-1662` | **Preserve**; ukloniti `'run_harness'` iz `VERIFICATION_TOOL_EXACT` (`verification-gate.ts:33`) |
| `HarnessTraceBridge` sa per-event `context` resolverom i scoped emitterom | `harness-trace-bridge.ts:54-56,80-86` | `packages/server/src/local/index.ts:612-616` (bez resolvera) | **Preserve**; mapiranje `complete → 'verified'` (`:91`) i `ok:true/durationMs:0` (`:139-148`) menjati |
| Server-observed ledger primitive: `TraceRecorder.completeToolCall`, `TurnExecutionTrace`, `TurnToolActivity.recordResult`, `isReportedToolFailure` | `packages/agent/src/trace-recorder.ts:142-166`; `packages/server/src/local/routes/chat-turn-execution-trace.ts:46`; `chat-agent-run.ts:214-225`; `routes/chat-bounded-read-tools.ts:13-34` | `agent-loop.ts:489`; `chat.ts:1653` | **Preserve** — ovo je izvor „observed evidence“ koji `run_harness` danas ne vidi (`grep phase_output packages/server/src` = 0) |
| Supervizor procesa opaža exit code, alat ga odbacuje | `packages/agent/src/system-tools-helpers.ts:732-735` → `system-tools.ts:681-691` | — | **Preserve** supervizor; popraviti granicu alata (putanje su `packages/agent/src/`, ne `server/local` — korekcija refute-a) |
| `detectTaskShape` (heuristički), `composeWorkflow`/`selectExecutionMode`, `FEATURE_FLAGS.ADVANCED_WORKFLOWS` (default ON) | `task-shape.ts:145`; `workflow-composer.ts:70,99-139`; `feature-flags.ts:14` | `chat-turn-preparation.ts:381,1119-1123`, `chat.ts:746`, `prompt-assembler.ts:375`, `subagent-orchestrator.ts:336`, `fleet-run-executor.ts:639` | **Preserve** klasifikator; **harness izbor nije server router** — `compose_workflow` samo ispisuje mode (`workflow-tools.ts:84-119`) |
| Advisory polja `allowedTools/requiresApproval/timeoutMs` (deklarisana, neizvršena) | `workflow-harness.ts:47-68` | nema enforce pozivalaca | čuvati semantiku za W1 executor |

**Poznati defekti koji određuju redosled (POTVRĐENO NA REVIZIJI):** verify se preskače po defaultu (`workflow-harness.ts:313,474-482`; nijedna konfiguracija u repou ne postavlja `WAGGLE_AUTO_VERIFY`); `VERDICT: FAIL` prolazi (`builtin-harnesses.ts:128`); bilo koji bash prolazi kao test (`:181`); budget stop gasi D3 (`agent-loop.ts:1523-1534`). Refute napomena: gate popravke su nevidljive dok se skip default (F-HARN-01) i self-reported dokaz (F-HARN-08) ne reše. `gate_passed` outcome zahteva **SQLite table-rebuild migraciju** zbog `CHECK` constraint-a (`hive-mind-core/src/mind/execution-traces.ts:150-151`, `mind/schema.ts:242-243`) — nije type-edit; alternativa bez šeme = tag u `tags[]` + eval filter (PREDLOG).

**OSS kandidati:**

| Kandidat | Repo / verzija | Licenca | Održavanje | Bezbednost | Windows | Offline | Težina | API fit | Testovi | Exit | Verdikt |
|---|---|---|---|---|---|---|---|---|---|---|---|
| BuilderIO/agent-native | v0.1.271 (2026-09-27), 6,863★ | root `package.json` **ISC**, GitHub `license: null` (bez root LICENSE), paketi `@agent-native/*` deklarišu MIT bez LICENSE teksta u paketu → **pravo po fajlu NEPOZNATO** | vrlo aktivan | nije pregledan | Node/Nitro | Postgres/PGlite | Postgres + Nitro | **nizak** (Waggle = SQLite/Fastify/Tauri) | `docs/agent-run-stop-conditions.md`: watchdog patch-ovan „≥6 puta u 4 meseca“ | n/a | **Pattern reference only** (actions-once, event log, proof receipts); bez kopiranja koda dok licenca po fajlu nije jasna (R20, FR-OSS-05 uslov „license-compatible“ nije ispunjen) |
| Omnigent | `omnigent-ai/omnigent` v0.15.0 (2026-09-24), 10,293★ | Apache-2.0 (+NOTICE) | aktivan, **alpha** | nije pregledan | „native but degraded“ (bez terminal wrappera, sandbox-a, egress proxy-ja) | — | **Python 3.12+** + Node 22 → krši no-Python paket | adapter ugovori (ACP preko stdio, povrat rezultata, policy) | — | n/a | **Reference only** (R21, FR-OSS-06) |

**Odluka (PREDLOG):** **Preserve** state machine, gate helpere, klasifikator i trace primitive; **Build** (a) server-side router `conversation/work × normal/strict/benchmark`, (b) `observedToolCalls` provider koji puni server iz `onToolResult`, (c) `runId` u event payload-ima i per-run bus. agent-native i Omnigent = pattern reference bez dependency-ja (D-17, BRIEF §14 red 2–3).

**Obrazloženje:** ne postoji OSS „harness router“ koji bi se uključio bez framework migracije, a D-17 zabranjuje automatsku migraciju. Sav potreban kod je tanak sloj nad postojećim `advancePhase` i `TurnToolActivity`; kopiranje agent-native koda nije dozvoljeno dok LICENSE po fajlu ne postoji.

**Vlasnik (uloga):** Harness/W0→W3 owner; merge vlasnik `agent-loop.ts`, `workflow-harness.ts`, `chat.ts` (hotspot, BRIEF §15.3).

**Testovi koji će pocrveneti uz fix (POTVRĐENO NA REVIZIJI):** `workflow-tools-harness.test.ts:135-179` (oslanja se na auto-skip), `harness-trace-bridge.test.ts:82-92,327` (pinuje `'verified'`), `:82-106` (Gather gate na self-reported pozivima).

---

### BB-03 — Context package (retrieval → tipizovani ugovor)

**Šta tražimo:** `ContextPackage` (identitet/verzija, run/workspace/session, izabrani source/frame ID-evi, revizije/hash, scope/provenance, trust/taint, token budžet/prioritet, dozvoljeni payload, razlozi izostavljanja) kao **omotač** postojećeg retrieval-a (DIR-09), invalidacija posle brisanja (AT-15), izolacija (AT-13), RAWDETAIL očuvan (AT-14), external handoff (AT-16).

**Postojeći Waggle — POTVRĐENO NA REVIZIJI (F-HM-01..18; refute: 0 REFUTED):**

| Sredstvo | Putanja | Pozivaoci | Ocena |
|---|---|---|---|
| `recallMemory` 7 lane-ova + RAWDETAIL + read-side injection scan + temporal anchor | `packages/agent/src/orchestrator.ts:582-978` | `chat-turn-preparation.ts:237`, `chat.ts:390`, `command.ts:266`, `commands.ts:74` | **Preserve, engine nepromenjen** (D-12, S1 W2) |
| RAWDETAIL write/read + kill switch `WAGGLE_RAWDETAIL` | `hive-mind-core/src/harvest/raw-turns.ts`; `mind/raw-detail-lane.ts:116-187` | writers `routes/harvest.ts:661`, `memory-mcp/src/tools/harvest.ts:316`, `hive-mind-mcp-server/src/tools/harvest.ts:318`; reader `orchestrator.ts:873` | **Preserve**. Napomena: korpus pune **samo harvest putevi** (živi chat ne piše raw turns); lane zavisi od reranker modela koji se **ne bundluje** u installer (`certify-windows-installer.ps1:2904` seed-uje samo embedding) → na offline desktopu lane verovatno neaktivan do prvog online recall-a (NALAZ AUDITA — ZA PROVERU) |
| Cross-encoder reranker default ON (`WAGGLE_RERANKER=0` gasi) | `orchestrator.ts:70-86,554-580`; `hive-mind-core/src/mind/inprocess-reranker.ts:55` (`Xenova/ms-marco-MiniLM-L-6-v2`) | `packages/server/src/local/index.ts:792-800` | **Preserve**; komentar `orchestrator.ts:106-109` zastareo |
| PromptAssembler W4.5 single-render + `TurnRecalledContext`; `FRAME_LIMITS` po tier-u ne važi za pre-renderovan blok | `prompt-assembler.ts:118,165-169,433-457`; `routes/chat-turn-recall-context.ts` | `chat-turn-preparation.ts:377-387`, `chat.ts:1235,1347`, `fleet-run-executor.ts:647` | **Preserve**; token budžet po paketu = W2 ugovor (F-HM-07 DELIMIČNO) |
| Executor brief (bounded, redigovan, skeniran, `briefHash`) | `packages/server/src/local/executor-brief.ts:46-154` | `routes/route-proposals.ts:14,188,296`; `/api/tools/run` `attribution.briefHash` (`external-tool-runs.ts:103`) | **Preserve** — najbliži postojeći „package“ za eksterni izvršilac; direktan `/api/tools/run` i `/api/tools/launch` **ne** prilažu brief (F-HM-11 DELIMIČNO) |
| Fail-closed env za eksterne procese + redakcija tajni u event tekstu | `packages/agent/src/external-process-env.ts:8-72`; `external-tool-runner.ts:588-595` | `external-tool-runner.ts:375`, `tool-launcher.ts:393` | **Preserve**; rupa: hook SessionStart inject ne rediguje (`hooks-claude-code/src/hooks/session-start.ts:46-60`, `hooks-core/src/handlers-core.ts:77-90`); `redactSecrets` živi u `@waggle/agent` (`eval-dataset.ts:133`) pa hook paketi ne mogu da ga uvezu bez nove zavisnosti |
| Hook runtime: scoped `resolveMind`, write-side ingress guard, content dedup | `hive-mind-core/src/hook-runtime.ts:121-225` | `hive-mind-cli/src/commands/hook-call.ts:115,143`; `shim-core/src/cli-bridge.ts:258` | **Preserve**; read put vraća `temporary` (`:237` `WHERE importance != 'deprecated'`) i ne skenira (F-HM-03/04) |
| Isključenje `temporary`/`deprecated` iz Waggle recall-a | `orchestrator.ts:728-737`; `context-loader.ts:77-88`; `workspace-context.ts:283,342,361`; `executor-brief.ts:66` | pin `r2-recall-closure.test.ts:27-40` | **Preserve** |
| TTL compaction (`temporary` 30d / `deprecated` 90d) + **server cron `memory_compact`** | `hive-mind-core/src/mind/frames.ts:404-483`; `packages/server/src/local/index.ts:2033-2058`; `setup-crons.ts:35` (`'30 3 * * *'`) | cron | **VEĆ POSTOJI** (refute F-HM-02 WEAKENED: S1/nalaz tvrdili suprotno); E2E na desktopu NEPOZNATO |
| Extraction idempotentnost (content-hash dedup, lane dedup, distill replace-on-update) | `frames.ts:109-111,289-294`; `harvest/extract-memory-lanes.ts:284`; `weaver/src/consolidation.ts:181-189,226-236` | `memory-lane-cron.ts` | **Preserve**; nema ključa `(runId, outputHash)` (F-HM-16) |
| Izolacioni pin testovi | `agent/tests/orchestrator-memory-boundary-pins.test.ts`; `server/tests/local/{memory-stats-isolation,fleet-isolation}.test.ts`; `agent/tests/subagent-isolation.test.ts` | — | **Preserve**; nedostaje sentinel test AT-13 |

**Poznati defekti (POTVRĐENO NA REVIZIJI):** workspace run sažetak (do 1000 znakova) upisan u personal mind na **4 mesta** (`external-tool-runs.ts:964-977`, `chat-collaboration.ts:802-814`, `fleet-run-executor.ts:924-936`, `agent-groups.ts:719-729`), a najmanje 5 testova pinuje to kao poželjno (refute F-HM-05); fleet policy gate `fleet-run-executor.ts:101-106` čini `personal` scope obaveznim (`fleet-isolation.test.ts:203`) — popravka menja policy gate, ne samo default. Nema `ContextPackage|ContextBuilder|WAGGLE_CONTEXT_INJECTED` (0 fajlova); dupla injekcija brief + SessionStart hook moguća (F-HM-08; NEPOZNATO da li `--safe-mode` suzbija hookove). Nema veze checkpoint↔kontekst pa ni invalidacije obrisanog izvora posle resume-a (F-HM-18).

**OSS kandidati:** **NEPOZNATO** — faza A nije istraživala eksterne „context assembly“ biblioteke. Razlog: D-12/DIR-09 nalažu da se postojeći engine omota, ne zameni; kandidat bi imao smisla samo za tipizovanu šemu paketa (JSON schema/zod), a `zod` **4.6.5** je već dependency (`packages/shared/package.json:16`). Šta bi zatvorilo: kratka provera 2–3 referentne šeme „retrieval provenance“ (npr. iz OSS RAG framework-a) radi imenovanja polja, bez uvoza runtime-a. **PREDLOG**.

**Odluka (PREDLOG):** **Preserve** engine i sve navedene assets; **Build** tipizovani `ContextPackage` ugovor (zod) kao omotač nad `recallMemory`/`executor-brief` izlazom, sa `briefHash` kao postojećom referencom; **ne uvoditi paralelni memory engine** (BRIEF §14 poslednji pasus, GluoMem napomena). Izmena render bajtova recall bloka (npr. source token, F-HM-06) zahteva LoCoMo same-judge kontrolu pre merge-a (ručni proces; CI gate ne postoji — F-HM-15).

**Vlasnik (uloga):** Memory/W2 owner + maintainer substrata (OSS forward-port, CLAUDE.md §7.5); merge vlasnik `orchestrator.ts`, `hook-runtime.ts`.

**Trošak substrata (POTVRĐENO NA REVIZIJI):** izmene u `hive-mind-core/src/{mind,harvest}` i `hook-runtime.ts` zahtevaju re-baseline `oss-drift-baseline.json`; `hook-runtime.ts` je već „only-canonical; product-curation“ blocker.

---

### BB-04 — Capability resolver (inventory, envelope, blocked/resume)

**Šta tražimo:** jedan resolver ugovor nad postojećim engine-ima (DIR-11), permission envelope kao presek ograničenja bez tier-a (§9.2, A12), inline setup kao kontinuitet rada sa trajnim request-om i server-side OAuth vezivanjem (§9.3), bez silent binary install-a (R11). Testovi: AT-11, AT-12, AT-17, AT-19.

**Postojeći Waggle — POTVRĐENO NA REVIZIJI (F-CAP-01..13):**

| Sredstvo | Putanja | Pozivaoci / testovi | Ocena |
|---|---|---|---|
| `searchCapabilities` (matchScore + availabilityOrder), `validateInstallCandidate` (samo `starter-pack`), tipovi | `packages/agent/src/capability-acquisition.ts:187,299-311,447-461` | `skill-tools.ts:13,454,521`; `routes/agent-search.ts:11,143`; testovi (20+13) | **Preserve** engine; trust ne utiče na rang (`capability-acquisition-trust.test.ts:126` to pinuje) |
| `CapabilityRouter.resolve` (fiksni per-lane confidence native 1.0 → subagent 0.4) | `capability-router.ts:51-186` | jedini konzument `tool-executor.ts:143-151` (unknown-tool fallback) | **Preserve**; nije permission filter (C13) |
| `scoreConnectors` + marketplace FTS merge | `routes/agent-search.ts:56,132,158` | web suggestion box; testovi `agent-search.test.ts` | **Preserve** |
| Server-issued `CapabilityProposalStore` (claim-once, TTL 10 min, max 256, ws/session scope) | `routes/capability-proposals.ts:12-13,35-101,232-268` | `InstallProvider.tsx:104` → `CapabilityRequestCard.tsx:108`; testovi (9) | **Preserve**; in-memory, ne preživi restart, nema pojam run-a |
| `ConnectorRegistry` (vault-hydrated, `connector_<id>_<action>`, audit) | `packages/agent/src/connector-registry.ts:24-212` | `agent-search.ts:157`; `routes/connectors.ts`; `held-action-executor.ts:221-224` | **Preserve** |
| Approval stack (`createChatApprovalHook`, `/api/approval/*`, `ApprovalGrantStore`, held actions, `needsConfirmation`/`isCriticalNeverAutopass`, executor approval floor) | `routes/chat-approval-hook.ts`; `routes/approval.ts`; `approval-grants.ts:20-25,172-304`; `packages/agent/src/confirmation.ts:16-29,337-358`; `tool-executor.ts:184-226` | testovi: approval-flow (4), approval-held (14), held-action-executor (18), chat-approval-timeout (4), characterization (15) | **Preserve** — ovo je „user policy“ sloj; decline je one-shot (nema negativnog granta, F-CAP-09) |
| Persona tool policy `applyPersonaToolFilter`/`filterMcpToolsForPersona` | `packages/server/src/local/persona-tool-filter.ts:98-153` | `chat-turn-preparation.ts:454,530,553` | **Preserve** |
| Governance `blockedTools` lanac (samo `wsConfig.teamId`) | `routes/chat-governance.ts:73-134` → `chat-turn-preparation.ts:694-738` → `tool-executor.ts:129` | fail-closed na `unavailable/invalid` | **Preserve**; za Solo ne postoji (`chat-governance.ts:87-89`) — ne premeštati u „tier“ stepenicu |
| `MarketplaceInstaller` + `SecurityGate` (blocked → refuse bez `forceInsecure`) | `packages/marketplace/src/installer.ts:109-118,392`; `security.ts` | `routes/marketplace.ts:420-432`; `routes/mcps.ts:227-301`; `skill-tools.ts:540-560`; `installer-security.test.ts` (40) | **Preserve**; `forceInsecure` dolazi iz klijentskog body-ja uz audit (`marketplace.ts:228,482-503`) |
| `InstallAuditStore` (`install_audit`, governance schema) | `packages/core/src/install-audit.ts:67-143` | `skill-tools.ts`; `marketplace.ts`; `mcps.ts` | **Preserve** |
| OAuth loopback rute (CSRF `state`, 127.0.0.1 redirect, vault upis) | `routes/oauth.ts:64-71,137-150,200-209,290-311` | testovi `oauth-callback-escaping.test.ts` (2) | **Preserve**; `pendingStates` u memoriji, **bez run/session vezivanja i bez PKCE** (`grep pkce\|code_challenge` = 0) |
| `CapabilityRequestCard` + parser (marker = HTML komentar u tool rezultatu) | `chat-blocks/{CapabilityRequestCard.tsx,capability-request-parser.ts}` | `TextBlock.tsx`; test `pr4-agent-search.test.tsx` | **Preserve**; renderuje samo `starter-pack`/`marketplace` (`:94-99`), connector/mcp → `null` (F-CAP-12) |
| `install_capability` (starter-pack only, path traversal guard, heuristics gate, non-grantable) | `skill-tools.ts:484-580`; `approval-grants.ts:20-25` | `behavioral-spec.ts:291-317` | **Preserve** |

**Šta NIJE nađeno (POTVRĐENO NA REVIZIJI):** `BLOCKED_CAPABILITY|BLOCKED_APPROVAL` = 0 u `packages/` i `apps/`; tipizovan `PermissionEnvelope` objekat = 0 (slojevi postoje odvojeno, F-CAP-04); tipizovan SSE `CapabilityRequest` događaj = 0 (F-CAP-12); taint polje = 0 (samo komentari, F-CAP-05b); convert-to-work/WorkItem = 0.

**OSS kandidati:** agent-native „shared actions / auth & permissions“ — **pattern reference only** (licenca po fajlu NEPOZNATO; API fit nizak; vidi BB-02). Drugi kandidati nisu istraženi u fazi A (**NEPOZNATO**). Zaključak: resolver je tanak sloj nad Waggle engine-ima; nema smisla tražiti eksterni „policy engine“ (BRIEF §9.2 „ne graditi veliki Solo policy engine“, R13).

**Odluka (PREDLOG):** **Preserve** svih 4 engine-a i approval stack; **Build** (a) tanku fasadu `resolveCapabilities(need, envelope)` koja vraća jedan `CapabilityCandidate[]` posle `filterCandidates(envelope)` pre ranga; (b) tipizovan `PermissionEnvelope` izračunat u `chat-turn-preparation.ts` i prosleđen i resolveru i executoru; (c) trajni capability request vezan za run (zavisi od BB-01 store-a); (d) OAuth `pendingStates` sa `requestId/workspaceId/sessionId` + persistencija + PKCE gde je primenljivo. MCP binarne instalacije ostaju u Settings kroz SecurityGate (R11). Superseding ADR za `held-action-executor.ts:6-10` i „D3“ (`routes/agent-search.ts:79`, ne `apps/web/src/lib/agent-search.ts:81` kako S1 navodi — korekcija).

**Vlasnik (uloga):** Capability/W4 owner; ADR (4) iz BRIEF §20.2; zavisi od W1.

**WB veza (POTVRĐENO NA REVIZIJI):** Approvals nav je TEAMS-gated samo u UI (`dock-tiers.ts:82`, `AppShell.tsx:727-728`, `command-catalog.ts:89`); ruta `/approvals` i API nisu gate-ovani (F-TK-02). Konektori nisu paywall-ovani (`connectorLimit: -1` na svim tier-ovima).

---

### BB-05 — Shared actions (UI, agent i rutina kroz isti ugovor — DIR-12)

**Postojeći Waggle — POTVRĐENO NA REVIZIJI (F-CAP-13; refute F-TK-17):**

| Sredstvo | Putanja | Pozivaoci | Ocena |
|---|---|---|---|
| Zatvoren `ACTION_REGISTRY` (4 akcije: `open_app`, `open_workspace`, `create_workspace`, `install_mcp`; `sideEffect`, `riskLevel`, `build()`) + `validateAndBuildAction` | `packages/server/src/local/command-registry.ts:108-192` | jedini pozivalac `command-interpret.ts:17,93,135` → `routes/command.ts:213`; UI potvrda `CommandCenter.tsx:94,538` | **Adapt**: proširiti `ActionDescriptor` u izvor istine za side-effect endpointe; `requiredTier`/`checkTier()` (`:91,227-236`) je mrtva grana (0 deskriptora) — ne prenositi u DIR-12 ugovor |
| `ToolDefinition` deljen između agent tool-a i held action executora (re-materializacija iz `buildToolsForWorkspace`) | `packages/agent/src/tools.ts`; `held-action-executor.ts:213-233` | agent loop; approval | **Preserve** — agent i rutina već dele ugovor za proposable alate |
| UI klikovi idu direktno na REST (`/api/connectors/:id/connect`, `/api/marketplace/install`) bez registry-ja; validacija + SecurityGate na endpointu | `routes/connectors.ts:118-142`; `routes/marketplace.ts`, `routes/mcps.ts` | web | tri ulazna puta, različita approval semantika (UI klik vs CommandCenter modal vs chat kartica) |

**OSS kandidati:**

| Kandidat | Šta nudi | Licenca / fit | Verdikt |
|---|---|---|---|
| BuilderIO/agent-native `@agent-native/core` 0.195.0, `toolkit` 0.22.3, `dispatch` 0.38.15, `scheduling` 0.2.3 | „Shared actions“ (agent, UI, HTTP, MCP, A2A, CLI), shared data/state, automations | paketi deklarišu MIT bez LICENSE teksta; root ISC/`license: null`; Postgres/PGlite + Nitro → API fit nizak | **Pattern reference only** (R20). Durable/replay tvrdnje nisu dokazive iz README/PRODUCT (DELIMIČNO/NEPOVEZANO; ZA PROVERU čitanjem `packages/core/agent/production-agent.ts` ako se ikad razmatra više od paterna) |

**Odluka (PREDLOG):** **Preserve** `ToolDefinition` kao zajednički ugovor; **Adapt** postojeći `ActionDescriptor`/`ACTION_REGISTRY` da pokrije akcije koje UI danas poziva preko REST-a (ulazna šema, scope, side-effect klasa, validacija, approval, audit, idempotency — BRIEF §9.4); UI/browser automatizacija spoljnih aplikacija ostaje odvojena sposobnost. Bez dependency-ja na agent-native.

**Vlasnik (uloga):** Capability/W4 owner zajedno sa UX/W5 (pozivaoci u `CommandCenter.tsx`, Marketplace UI). Test: AT-18.

---

### BB-06 — Evolution i promotion (GEPA, holdout, active pointer, rollback)

**Šta tražimo:** stvarno izvršenje kandidata kroz target runtime, evaluacija, eksplicitna aktivacija, rollback (D-13, DIR-13/14/15); local evaluator default (§10.4); paired poređenje na istim primerima (AT-29); override ulazi u sledeći prompt (AT-04); candidate se izvršava pre ocenjivanja (AT-05).

**Postojeći Waggle — POTVRĐENO NA REVIZIJI (F-EVO-01..12; refute: F-EVO-09 WEAKENED, ostalo HOLDS):**

| Sredstvo | Putanja | Pozivaoci | Ocena |
|---|---|---|---|
| Running judge + brend + GEPA guard (kandidat se izvršava pre ocene) | `packages/agent/src/evolution-llm-wiring.ts:415-452`; `iterative-optimizer.ts:173-184`; `compose-evolution.ts:142-149` | `routes/evolution.ts:377,404`; `services/evolution-service.ts:310,332`; testovi `iterative-optimizer.test.ts:424-445`, `evolution-llm-wiring.test.ts:266-330` | **Preserve** (VEĆ ZATVORENO za produkcione putanje, F-EVO-03); komentar `iterative-optimizer.ts:393-397` zastareo |
| GEPA engine nad `@ax-llm/ax` | `iterative-optimizer.ts`; `evolve-schema.ts` | `compose-evolution.ts:174-196` | **Preserve + Borrow** (`@ax-llm/ax` 24.0.23 Apache-2.0 — već dependency; npm paket **nema LICENSE fajl** → notices generisati iz upstream-a) |
| Behavioral-spec override pipeline (deploy → load → active spec → chat prompt) | `evolution-deploy.ts:184-259`; `behavioral-spec.ts:409-437`; `packages/server/src/local/index.ts:626-635`; `chat.ts:1264-1314,1441-1444` | test `evolution-routes.test.ts:190` | **Preserve** — radi (F-EVO-11) |
| Persona override writer/rollback (atomic write, `.bak`, Windows rename retry) | `evolution-deploy.ts:68-135,277-305` | deploy `routes/evolution.ts:57`; rollback **0** pozivalaca | **Preserve** + **povezati** rollback; jednonivovski `.bak` = rollback jednog koraka |
| `EvolutionRunStore` audit trail (`evolution_runs`, `winner_schema_json`) | `hive-mind-core/src/mind/evolution-runs.ts` | `index.ts:622-623`; `routes/evolution.ts`; `evolution-orchestrator.ts:219-253` | **Preserve**; nema `rolled_back` u enum-u i SQL `CHECK` (`:23-28,95-96`) → table-rebuild migracija |
| Gates (size/growth/structure/regression) | `evolution-gates.ts:99-135` | `evolution-orchestrator.ts:194-204` | **Preserve**; regression gate danas poredi neuparene uzorke (F-EVO-06) |
| `EvalDatasetBuilder.build()` (secret scan, heuristika, dedup, 60/20/20 split) + `detectSecrets`/`redactSecrets` | `eval-dataset.ts:96-145,207-325` | `build()` **bez produkcionog pozivaoca** (orkestrator zove `sourceFromTraces`, `evolution-orchestrator.ts:319-325`) | **DELIMIČNO/NEPOVEZANO** → **povezati** (tajna `sk-ant-…` iz traga stiže do judge-a; repro `docs/plans/v1.2-evidence/phaseA/repro-gepa-delta.mjs (b)`) |
| `ExecutionTraceStore` (`persona_id`, `workspace_id`, `model`, `markCorrected`) | `hive-mind-core/src/mind/execution-traces.ts:56-61,473-490` | `index.ts:591`; `chat.ts:1653`; `chat-turn-completion.ts:374-383` | **Preserve**; `markCorrected` 0 pozivalaca |
| Živi learning tok: tekstualna korekcija → `analyzeAndRecordCorrection` → `improvement_signals('correction')` → „# User Corrections“ u promptu; thumbs-down isto | `chat-turn-completion.ts:253-270`; `improvement-detector.ts:81-98`; `improvement-signals.ts:116-146`; `chat.ts:1485-1496`; `feedback.ts:91-94` | wired | **Preserve** (refute F-EVO-09: improvement-detector JESTE povezan; predlog „wire `processInteractionForImprovement`“ bi duplirao put). Mrtvo: `AgentLearning` (0 instanci), `improvement-wiring.ts` (0), `recordPersonaTask` (0). `markSurfaced` pozivalac u produkciji NEPOZNATO |
| `EvolutionService` opt-in daemon (samo `proposed`, nikad auto-deploy) | `services/evolution-service.ts`; `index.ts:2747-2767` | env `WAGGLE_EVOLUTION_AUTO_ENABLED` | **Preserve** |
| Fleet persona snapshot (presedan „run ostaje na svojoj verziji“) | `fleet-run-executor.ts:589-591` | `fleet-isolation.test.ts:455-485` | **Borrow iz Waggle-a** za AT-04 pinned verziju |

**Poznati defekti koji određuju redosled (POTVRĐENO NA REVIZIJI):** persona override zasenčen ugrađenom (`personas.ts:67-70` + `chat.ts:439-440` `find` → prvi pogodak; isti obrazac `fleet-run-executor.ts:127,590`, `agent-groups.ts:87`, `fleet.ts:354`; repro `repro-shadow.mjs`); baseline endpoint čita built-in (`routes/evolution.ts:259`); `persona:reloaded` bez konzumenta; jedan Anthropic Haiku LLM je executor **i** judge **i** mutator (`routes/evolution.ts:365,376-379`; `createAnthropicEvolutionLLM` hard-kodira `Claude45Haiku`); 422 bez Anthropic ključa (`routes/evolution.ts:355-363`) → nema lokalnog evaluatora, nema cost cap/consent/abort (SSE close namerno ne prekida run `:458-462`); `frozenSchema` ne ide u Stage 2 ni deploy (`compose-evolution.ts:184,191-196`); UI „Accept & Deploy“/„deployed lift“/„score-verified“ (`EvolutionTab.tsx:759,771,883,237-249`) bez provere aktivacije. Redosled popravki: F-EVO-01 → F-EVO-10 (`evolution-routes.test.ts:169-188` pinuje `status==='deployed'`).

**OSS kandidati:**

| Kandidat | Verzija | Licenca | Fit | Verdikt |
|---|---|---|---|---|
| `@ax-llm/ax` (GEPA, signatures) | 24.0.23 instaliran (`^24.0.20` deklarisan) | Apache-2.0 (package.json; **bez LICENSE fajla u paketu**) | već jezgro; ugovor `complete(prompt)` | **Borrow (postojeći)**; notices iz upstream-a (BB-12) |
| Drugi prompt-optimizacioni framework-i (npr. Python DSPy/GEPA referentne implementacije) | — | — | Python → van no-Python paketa; nisu istraženi u fazi A | **NEPOZNATO / ODLOŽENO** — nije potrebno za DIR-13/15 (posao je aktivacija, holdout, manifest — sve Waggle kod) |

**Odluka (PREDLOG):** **Preserve** GEPA/running judge/gates/store/deploy funkcije; **Build**: (a) `EvolutionLLM` adapter nad postojećim provider router-om (lokalni model default; BYOK judge uz eksplicitan consent, cap, `AbortController` vezan na SSE close — plumbing `IterativeGEPAOptions.signal` već postoji), (b) active-version pointer + `rolled_back` (migracija CHECK), (c) resolver koji custom/evolved personu stavlja ispred ugrađene (Map po `id`), (d) `build()` umesto `sourceFromTraces` sa `traceFilter {personaId, workspaceId}`, `includeCorrections:false`, frozen holdout + hash, (e) manifest (`executorModel`, `judgeModel`, per-example izlazi redigovano). Ograničena recipe evolution (DIR-14) je net-new (enum `EvolutionTarget` nema harness-recipe vrednost, `iterative-optimizer.ts:88-93`) — zaseban obim, ne „defer“ postojećeg koda.

**Obrazloženje:** sve što nedostaje je povezivanje i ugovor nad postojećim modulima; nijedan eksterni paket to ne rešava, a KVARK režim (D-03) zabranjuje cloud judge fallback — što je Waggle policy kod.

**Vlasnik (uloga):** Evolution/W3e owner; ADR (6) iz BRIEF §20.2; OSS napomena: `evolution-runs.ts`, `execution-traces.ts`, `improvement-signals.ts` su OSS-EXCLUDED (`oss-drift-check.mjs:22-28`) → izmene nemaju obavezu porta, ali NOTICE fajlovi 3 hive-mind paketa ih proglašavaju proprietary (BB-12).

**Test upozorenja (POTVRĐENO NA REVIZIJI):** uklanjanje/preimenovanje `combinedDelta` lomi `compose-evolution.test.ts:342-371`; activation check pre F-EVO-01 lomi `evolution-routes.test.ts:169-188`.

---

### BB-07 — Attention / WorkItem sync (mail/calendar, delta sync, dedup)

**Šta tražimo:** jedan `WorkItem` (Action/Commitment/Decision/Signal) sa statusom, provenance, vremenom izvora, workspace-om, confidence i korisničkom korekcijom (DIR-18); jedan početni mail/calendar scenario sa stvarnom autorizacijom; background incremental sync sa cursor/delta persistencijom, lost-cursor handling, dedup, revoked credentials, retention; labeled eval (AT-24); taint/provenance na harvestovanom sadržaju (AT-19). ToS profil po kanalu (C6).

**Postojeći Waggle — POTVRĐENO NA REVIZIJI (git ls-files, grep po sposobnosti; F-CAP-05c; external §5):**

| Sredstvo | Putanja | Ocena |
|---|---|---|
| First-party konektori: `gmail`, `gcal`, `gdocs`, `gdrive`, `gsheets`, `outlook`, `onedrive`, `onenote`, `ms-teams`, `slack`, `discord`, `email`, `notion`, `linear`, `jira`, `confluence`, `asana`, `trello`, `monday`, `airtable`, `hubspot`, `salesforce`, `pipedrive`, `github`, `gitlab`, `bitbucket`, `dropbox`, `obsidian`, `postgres`, `composio` (30 fajlova + `index.ts`) | `packages/agent/src/connectors/*.ts` | **Preserve**; E2E nijednog nije proveren u fazi A (NEPOZNATO) |
| `connector-harvest.ts` (scan pre `writeFrame`), `harvest-autosync-service.ts`, `harvest-autosync-frame.ts` | `packages/server/src/local/connector-harvest.ts:189-191`; `services/harvest-autosync-service.ts` | **Preserve** kao ulazna tačka; **incremental sync ne postoji**: `grep historyId\|syncToken\|deltaLink\|delta` u `connectors/` i `connector-harvest.ts` = 0 (POTVRĐENO NA REVIZIJI) |
| Home briefing/ranking (`PENDING_BOOST_CAP`) | `packages/server/src/local/routes/home.ts:132,304` | **Preserve**; nema WorkItem tipa |
| IM kanali: `ChannelManager` (deny-by-default, `/pair`, dedup, rate limit, `proposeHeld`), adapteri Telegram (Bot API), Discord (bot), WhatsApp (Baileys — sam fajl kaže da krši ToS) | `packages/server/src/local/channels/{manager,pairing,chat-client,routes}.ts`; `channels/{telegram,discord,whatsapp}-adapter.ts` | **Preserve** Telegram/Discord bot profil; WhatsApp Baileys **nije shipping default** (external §5, R01) |
| Injection defense na ingest (Pass 0 `evaluateExternalMemoryIngress`) | `hive-mind-core/src/harvest/pipeline.ts:108-142`; `connector-harvest.ts:189-191` | **VEĆ ZATVORENO** (F-CAP-05a); taint polje ne postoji (F-CAP-05b) |
| Erasure/`erased_subjects`/`stableHarvestId` | `hive-mind-core/tests/mind/erasure.test.ts`; `memory-mcp/src/tools/erase.ts` | **Preserve**; `erase` postoji samo u `waggle-memory-mcp`, ne u `hive-mind-mcp-server` (F-HM-17) |

**Šta NIJE nađeno (POTVRĐENO NA REVIZIJI):** `WorkItem|toWorkItem|convert.?to.?work` = 0 u `packages/server/src`, `apps/web/src`, `packages/shared/src`; cursor/delta persistencija = 0; Viber adapter = 0.

**Kanalni profil (NALAZ AUDITA — ZA PROVERU: live 27.09.2026, izvor external §5, §8 — nije svojstvo revizije; pravni deo ZA PROVERU):**

| Kanal | Profil | Ključno ograničenje |
|---|---|---|
| Microsoft Graph (Outlook/Calendar/Teams) | **live API — najpovoljniji put** | delegated `Mail.Read/ReadWrite/Send`, `Calendars.Read` bez admin consent-a; publisher verification za multitenant; MSA lični nalozi ZA PROVERU |
| Gmail/GCal | live API uz verifikaciju / BYO-client / Takeout import | `gmail.readonly/modify/compose` = **Restricted** → OAuth verifikacija (nedelje) + godišnji CASA; izuzeće za local-only desktop **nije eksplicitno** (ZA PROVERU); unverified cap 100 korisnika |
| Slack | live API (user token) | API ToS 10.10.2025: bez LLM treninga, bez bulk export-a; „persistent copies“ klauzula vs lokalna memorija — pravni pregled (ZA PROVERU) |
| Telegram | bot/forward (sada); user API roadmap uz ADR | Bot API vidi samo chat sa botom |
| Discord | bot/forward | self-bot zabranjen; `MESSAGE_CONTENT` privileged intent |
| WhatsApp | export/import (+roadmap) | WABP zabranjuje general-purpose AI asistente od 15.01.2026; lični inbox samo unofficial |
| Viber | bot ili drop | samo Chat Bot API; „not for personal use“ |

**OSS kandidati:** **NEPOZNATO** — faza A nije istraživala OSS sync/WorkItem biblioteke (npr. IMAP/Graph delta klijente, dedup engine). Šta bi zatvorilo: evidence card za 1–2 održavana klijenta za izabrani prvi ekosistem (predlog: MS Graph zbog delegated dozvola bez CASA), sa licencom, Windows/offline ponašanjem i težinom. Do tada je pretpostavka **Build** WorkItem store-a (u BB-01 store-u ili odvojenoj tabeli — odluka W1/W7) i delta sync-a nad postojećim konektorima. **PREDLOG**.

**Odluka (PREDLOG):** **Preserve** konektore, ingest scan, kanale, erasure; **Build** WorkItem store, cursor/delta persistenciju, dedup ključ, labeled eval set; **ODLOŽENO** WhatsApp/Viber live (R01). Prvi scenario: **PREDLOG MS Graph mail+calendar** (na dohvaćenim izvorima bez CASA/restricted-scope verifikacije; publisher verification za multitenant — verifikovan Microsoft AI Cloud Partner Program nalog + publisher domain, jer tenanti sa risk-based step-up consent-om ne mogu da odobre neverifikovanu multitenant aplikaciju — ostaje spoljna zavisnost, `docs/plans/v1.2-evidence/phaseA/external.md` §5) — nije odobreno; BRIEF §20.3 „Prvi mail/calendar scenario“ ostaje otvoreno.

**Vlasnik (uloga):** Attention/W7 owner; zavisi od W1 (convert-to-work bez neodobrenog efekta) i W4 (envelope). Test: AT-19, AT-24.

---

### BB-08 — Local inference i hardware detect (runtime, model lifecycle, ladder)

**Šta tražimo:** tačan ID/revizija/quant/runtime za Qwen 3.8 27B (D-15, C19); hardware ladder (A21); live readiness (DIR-17, AT-20); resumable pull sa progresom; instalacioni putevi: managed runtime / postojeći Ollama / OpenAI-compatible endpoint / BYOK (§11.3). FR-OSS-09: bez sopstvenog serving-a.

**Postojeći Waggle — POTVRĐENO NA REVIZIJI (F-UXM-02..06; external §1):**

| Sredstvo | Putanja | Ocena |
|---|---|---|
| Managed Ollama runtime: pin `0.32.3`/rollback `0.32.0`, per-platform zip URL + sha256, Range resume, size+sha256 verifikacija, retry/backoff, 45-min timeout | `packages/server/src/local/managed-ollama-runtime.ts:28-29,158-237,1109-1204` | **Preserve**; **pin je stariji od prvog Ollama release-a sa Qwen 3.8 27B (v0.32.12, 14.08.2026)** → repin ≥0.32.12 (razumno ≥0.32.15) + pull/generate/tool test + nova receipt (NALAZ AUDITA — ZA PROVERU) |
| Post-pull digest check + live `/api/generate` probe (`verifiedGeneration:true`) | `routes/local-inference.ts:338-377` | **Preserve** — kvalitetan deo |
| Pull `stream:false`, 45-min timeout, bez progresa/resume oglašavanja | `routes/local-inference.ts:313-332` | popraviti (`stream:true` + relay); ne dirati runtime download |
| `hardware-detect.ts` (NVIDIA `nvidia-smi`, Apple, CPU floor; AMD/Intel/WMI „intentionally NOT built“) | `packages/server/src/local/hardware-detect.ts:7-19,95-109,174-198,315-333` | **Preserve** obrazac (injectable `CommandRunner`); **Build** `detectWindowsWmi` (registry `HardwareInformation.qwMemorySize` zbog 4 GB `AdapterRAM` cap-a) |
| `model-fit.ts` + `cookbook/catalog.ts` (najnoviji Qwen = `qwen3:*` 2025; bez 3.5/3.6/3.8) | `packages/agent/src/cookbook/model-fit.ts:207-214,296-301`; `catalog.ts:44-51` | **Preserve** engine; re-baseline kataloga; `model-fit.ts` nema pravilo za `qwen3.8` (pada na generički `qwen3`=4) |
| Readiness: `probeConfiguredModel` (1-token, `verified = content.length>0`, bez tool round-trip-a; svaki ne-auth neuspeh isti izlaz) i `useHasWorkingModel` false positives | `routes/settings.ts:103-164`; `apps/web/src/hooks/useHasWorkingModel.ts:129-136,171-174,244-245` | popraviti (AT-20); testovi `useHasWorkingModel.test.ts:271-281,301-307,486-495` pinuju pogrešno ponašanje |
| Certifikat managed modela = `qwen2.5:0.5b` smoke, ne referentni cilj | `scripts/certify-windows-installer.ps1:2099,2951-3005` | receipt razdvojiti `certificateModel` vs `recommendedModel` |
| Embedding in-process `Xenova/all-MiniLM-L6-v2` (bundlovan/seed-ovan), reranker `Xenova/ms-marco-MiniLM-L-6-v2` (nije bundlovan) | `hive-mind-core/src/mind/inprocess-embedder.ts:32`; `inprocess-reranker.ts:55`; `certify:2904` | **Preserve**; reranker offline profil ZA PROVERU (BB-03) |

**Target model — NALAZ AUDITA — ZA PROVERU (live 27.09.2026, HF/Ollama; izvor external §1, §8; godina Ollama datuma izvedena — external §7):** `Qwen/Qwen3.8-27B`, HF sha `1d4bf0f2ff6012fd82039f2fa52739d0dd7c60c0`, 2026-08-14, Apache-2.0, **dense** VL (`model_type: qwen3_5`), 262k ctx, thinking default-on, chat template sa `<tool_call>`/`<function=` markerima (E2E sa Waggle tool loop-om ZA PROVERU). Ollama tagovi: `qwen3.8:27b` 18 GB (Q4_K_M klasa), `q8_0` 30 GB, `bf16` 56 GB; GGUF `unsloth/Qwen3.8-27B-GGUF` (Apache-2.0) UD-Q4_K_M 16.5 GB. **Zvanični VRAM/RAM po quantu ne postoji** (NEPOZNATO; sekundarno: Q4_K_M 17.6 GB @8k → 33.5 GB @262k) → meriti (A21). Kontrolni baseline `Qwen/Qwen3.6-35B-A3B` je MoE; u produkcionom routeru ide **cloud DashScope** (`litellm-config.yaml:211-215`), dok benchmark harness ima lokalni vLLM unos `qwen3.6-35b-a3b-local` (`benchmarks/harness/config/models.json:61-67`) i runbook `benchmarks/gaia2/PILLAR1-QWEN-LOCAL-RUNBOOK.md` (POTVRĐENO NA REVIZIJI); da li su stari rezultati lokalni ili cloud — ZA PROVERU.

**OSS kandidati:**

| Kandidat | Verzija | Licenca | Windows | Offline | Fit | Verdikt |
|---|---|---|---|---|---|---|
| Ollama | pin 0.32.3 → potreban ≥0.32.12/0.32.15; latest 0.34.4 (23.09.2026) | MIT | da (zip, pinovan sha256) | da posle pull-a | već integrisan (managed + optional user-installed) | **Borrow (postojeći)**; repin + receipt |
| vLLM | HF kartica: „use latest“, bez min verzije (NEPOZNATO); Qwen3.6 kartica traži `vllm>=0.19.0`; tool parser za 3.8 zvanično nije naveden (`qwen3_xml`/`qwen3_coder` familija — ZA PROVERU) | Apache-2.0 | ne kao native one-click | server | self-host/server ili validiran OpenAI-compatible endpoint (§11.3) | **Borrow kao endpoint profil**, ne kao Windows instalacija |
| llama.cpp / LM Studio | — | MIT / proprietary app | da | da | OpenAI-compatible preset (R17); llama.cpp direktno traži `--jinja` za template | **Borrow kao preset**, bez zasebne integracije |
| SGLang / TokenSpeed | — | Apache-2.0 / NEPOZNATO | ne | server | server profil | **ODLOŽENO** (nije istraženo) |
| odysseus `hwfit`/`llmfit` | — | **AGPL-3.0** | — | — | ranking math + detection checklist | **Koncept samo, clean-room** (`docs/analysis/odysseus-adoption-2026-06-28.md:3,99`); nikad binary ni kod |

**Odluka (PREDLOG):** **Preserve** managed runtime, digest+generation probe, `hardware-detect` obrazac, fit engine; **Borrow** Ollama (repin), vLLM/llama.cpp/LM Studio kao OpenAI-compatible profili; **Build** WMI/AMD detekciju (clean-room), katalog redove za potvrđeni target (`releaseDate`, `contextLength`, `quant`), `/api/show` arch check protiv pinovanog runtime-a, `reason` u `ModelProbeResult`, opcioni tool round-trip probe za work profil, stream pull. Bez sopstvenog inference servera (FR-OSS-09).

**Vlasnik (uloga):** Model/W6 owner + Release (receipt); zavisnost: hardware matrica NVIDIA/AMD/Intel/CPU (spoljni trošak, BRIEF §15.3). Test: AT-20, AT-30.

---

### BB-09 — Benchmark runners (zvanični taskovi, scoreri, production-path adapter)

**Šta tražimo:** jedan primarni professional-work test sa evidence card-om (§13.1); production sidecar putanja (DIR-22); dva odvojena poređenja (§13.2); manifest (§13.6); contamination firewall (§13.4). FR-OSS-10: zvanični runneri/scoreri, izmene izolovane i objavljene.

**Postojeći Waggle — POTVRĐENO NA REVIZIJI (external §4; F-REL-12):**

| Sredstvo | Putanja | Ocena |
|---|---|---|
| GAIA2 ARE narrow-proxy adapter („NOT a full Gaia2 evaluation; cost-projection“) + LOCKED config, Phase 3 HALT $4.09/invocation | `benchmarks/gaia2/adapter.ts:1-12`; `config.yaml`; `README.md` | **Preserve** za cost-projection; **ne** production-path dokaz (`grep api/chat\|/api/agent/run` u `adapter.ts` = 0 → nije production putanja, POTVRĐENO NA REVIZIJI) |
| 4-cell ablation harness (`@waggle/benchmarks-harness`), pre-registration, `results/`, `E6-LOCKED-CONFIG.md` | `benchmarks/harness/` (`package.json` engines `>=20`, deps `@waggle/agent`, `@waggle/core`) | **Preserve**; `config/models.json:88-89` ima pogrešne Opus cene (F-REL-06) |
| LoCoMo/LongMemEval/BEAM podaci + `recount.mjs` offline recount | `benchmarks/data/*`, `benchmarks/results/locomo-sota-2026-06/` | **Preserve** (memory benchmark, D-12) |
| τ² adapter — **samo na grani** `origin/feature/harness-sota-bench` @ `18e5b36a` (66 komita ispred, 2022 iza `main`) | `benchmarks/harness/src/tau2/*`, `benchmarks/tau2/bridge/*`, `benchmarks/tau2/agent/*.py` | **Adapt cherry-pick-om**, bez rebase-a; preskočiti `fe7804bf` (`cost-tracker.ts` konflikt sa reservation ledger-om); ne prenositi pilot rezultate (`9eb454bd`, `16b4dc3d`, `df159ac2` — N=114 n.s., DIR-23); da li `waggle-bridge-server.ts` koristi production `/api/chat` — **NEPROVERENO** |
| `cost-tracker.ts` reservation ledger | `packages/agent/src/cost-tracker.ts` | **Preserve** logiku; tabela pogrešna (Opus 4.6/4.7/4.8 15/75 vs zvanično 5/25; Sonnet 5 3/15 vs 2/10; tri retired ID-a) — product impact na dnevni budžet. Stanje repoa (vrednosti `cost-tracker.ts:28-30,32,34-35,39-40,66`; A29): POTVRĐENO NA REVIZIJI; zvanične cene i retired status ID-a: NALAZ AUDITA — ZA PROVERU (live 27.09.2026, platform.claude.com; izvor: external.md §6, §8) |

**OSS kandidati (external §4, provera 27.09.2026):**

| Benchmark | Izvor / verzija | Licenca (taskovi / runner) | Taskovi javno | Runner/scorer | Lokalno / Windows | Baseline-i | Integracija | Verdikt |
|---|---|---|---|---|---|---|---|---|
| **APEX-Agents 1.1** (Mercor) | HF `mercor/apex-agents-v1.1`; Harbor 0.20.0; Archipelago (Apache-2.0, 282★) | CC-BY-4.0 / Apache-2.0 | **240** (IB, consulting, corporate law; dokumenti/tabele/PDF/email/chat/kalendar) | Harbor + rubrike; judge DeepSeek-v4-Flash-0731 (cloud) | Docker `linux/amd64` → WSL2 na **bench mašini**, ne u proizvodu | Claude Fable 5.1 68.6% pass@1; GPT-6 Astra 56.3% pass^4 (isti protokol) | Harbor agent shim → production sidecar (DIR-22); napor M–H | **PREDLOG primarnog testa** (nije odobreno) |
| τ²-bench (Sierra) | `sierra-research/tau2-bench` v1.0.1 (jul 2026), 2,111★ | MIT | airline 50, retail 114, telecom (puni skup ZA PROVERU), banking ≈100 | otvoren; DB-hash + `communicate_info`; **zahteva LLM user-simulator** (cloud) | Python ≥3.12, bez Docker-a | taubench.com leaderboard | adapter na grani (vidi gore); domen = customer-service tool agent, **ne** knowledge-work deliverable | **Sekundarni (tool-use kontrola)** |
| GAIA2 / ARE (Meta) | `facebookresearch/meta-agents-research-environments` (MIT, 558★); dataset `gaia2` | CC-BY-4.0 (sintetika pod Llama licencama) / MIT | 800 validation / `gaia2-mini` 160 | `are-benchmark`; judge Llama 3.3 70B + EM | Docker nije obavezan | u HF blogu (nisu izvučeni — NEPOZNATO) | adapter postoji (narrow-proxy); ekonomija H | **Preserve za cost-projection** |
| GDPval (OpenAI) | HF `openai/gdpval` (sha `11e7900c`) | **licenca dataset-a NEPOZNATO**; paper CC-BY-4.0 | 220 gold | ljudi ili OpenAI hosted grader (cloud) | fajl in → fajl out | NEPOZNATO | grading validnost H; **nedozvoljen u KVARK režimu** (D-03) | **ODLOŽENO** |
| FORTE (AGI-Eval) | `AGI-Eval-Official/FORTE` (MIT, 20★, push 2026-06-30) | MIT | **15 od 180** javno | OpenClaw agent u Docker-u; all-or-nothing LLM judge | Docker Desktop+WSL2 | leaderboard (nisu izvučeni) | vezan za OpenClaw (roadmap-only) | Odbačen kao primarni |
| OdysseyBench (Microsoft) | `microsoft/OdysseyBench` (MIT, 18★, push 2026-06-11) | MIT | 300 + 302 | OfficeBench Docker + LLM judge | Docker | u paperu (NEPOZNATO) | long-horizon memorija — relevantno za D-12; niska aktivnost | **ODLOŽENO (sekundarni memory test)** |

**Odluka (PREDLOG):** **Borrow** zvanične runnere/scorere bez reimplementacije scorera (BRIEF §14 red „Benchmark projekti“); **Build** samo tanki shim (Harbor agent ili HTTP klijent) koji poziva production sidecar i sakuplja izlaz; **Adapt** τ² adapter cherry-pick-om; **Preserve** GAIA2 adapter za cost-projection i memory benchmark alate. Pinovati dataset sha, Harbor verziju, image digeste, judge model/verziju; zamena judge-a lokalnim modelom = odvojen profil (kvari uporedivost). Python/Docker dozvoljeni samo na bench mašini.

**Vlasnik (uloga):** Benchmark/B1–B3 owner; budžet i primarni test = founder odluka (BRIEF §20.3). Test: AT-28.

---

### BB-10 — Skills pack (starter skills, uvoz, provenance)

**Postojeći Waggle — POTVRĐENO NA REVIZIJI:**

| Sredstvo | Putanja | Ocena |
|---|---|---|
| **18** first-party starter skills (`brainstorm`, `catch-up`, `code-review`, `compare-docs`, `daily-plan`, `decision-matrix`, `draft-memo`, `explain-concept`, `extract-actions`, `meeting-prep`, `plan-execute`, `research-synthesis`, `research-team`, `retrospective`, …) + loader `getStarterSkillsDir()`/`listStarterSkills()` | `packages/sdk/src/starter-skills/*.md`; `index.ts:11-25` | **Preserve**; nijedan `.md` nema provenance/license header (`grep license\|source\|adapted` = samo tekst uputstva) → first-party pretpostavka, u inventar upisati kao `origin: first-party` (ZA PROVERU sa autorom) |
| `install_capability` (starter-pack only), `validateInstallCandidate`, `SecurityGate` heuristics, `skill-audit.ts` injection scan | `skill-tools.ts:484-580`; `capability-acquisition.ts:447-461`; `skill-audit.ts:265,304,350` | **Preserve** |
| Skill create/distill/hygiene/retire/recommend putevi, `skill_promotion` signal | `chat-turn-completion.ts:199-212`; `SkillRecommender` (`persona-tool-filter.ts:27-30`) | **Preserve** (E2E ne proveren) |
| `promote_skill` u team/enterprise scope — uvek odbijen (nema provajdera `isEnterprise`) | `skill-tools.ts:67-68,755-765` | mrtva grana do KVARK connect (F-TK-12) |
| `.agents/skills/ax-*` (9 SKILL.md) | `.agents/skills/` | dev-alat za Claude Code, **nije** korisnički pack; nije deo installer-a (ZA PROVERU) |

**OSS kandidati:**

| Kandidat | Šta | Licenca / verzija | Status provere |
|---|---|---|---|
| `anthropics/knowledge-work-plugins` (11 plugin-a: Sales, Marketing, Legal, Finance, Data, PM, Support, Enterprise Search, Bio-Research, Productivity, Plugin Mgmt) | skills + slash komande + MCP konektori po roli | **NIJE PROVERENO** u fazi A; S2 (04.09.2026) navodi različit tretman vs document skills (istorijski nalaz, BRIEF §14) | **NEPOZNATO** → licencna provera po repo-u i preuzetoj verziji pre bilo kakvog uvoza |
| `anthropics/skills` | opšte skills (docx/pptx/xlsx/pdf, itd.) | memorija projekta navodi „Apache seed“, „Anthropic doc skills PROPRIETARY never port“ — **nije verifikovano na reviziji ni u fazi A** | **NEPOZNATO** → ista provera; „sve Cowork skills je OSS“ nije shipping dozvola (BRIEF §14) |
| `minimax` doc skills / clean-room pptx (iz exploration backloga) | dokument produkcija | nije istraženo | **NEPOZNATO / ODLOŽENO** (post-launch v1.1 backlog) |

**Odluka (PREDLOG):** **Preserve** first-party pack kao G2 osnovu za dve recipe putanje (research brief, document production — DIR-02/W3); OSS uvoz **ODLOŽENO** do per-repo evidence card-a (licenca, verzija/commit, dependencies, tool nazivlje, model-specifične instrukcije, artefakti — BRIEF §9.5 „uvoz ≠ uspešna upotreba na Qwen-u“). Svaki uvezeni skill dobija red u inventaru (§4) i prolazi `SecurityGate`/`skill-audit`. FR-OSS-07 uslov „license review“ trenutno **nije ispunjen ni za jedan eksterni izvor**.

**Vlasnik (uloga):** Harness/W3 owner (recipe) + Release/OSS owner (licenca). Test: AT-17, AT-21.

---

### BB-11 — Connectors i MCP (adapteri, katalog, install, runtime)

**Postojeći Waggle — POTVRĐENO NA REVIZIJI:**

| Sredstvo | Putanja | Ocena |
|---|---|---|
| 30 first-party konektora (lista u BB-07) + `ConnectorRegistry` + `find_connector` | `packages/agent/src/connectors/`; `connector-registry.ts:24-212` | **Preserve**; nema per-connector inventara ToS/scopes (BB-07 tabela je početak) |
| MCP katalog **148** stavki (`id`, `author`, `installCmd`, `capabilities`; `license` polje **ne postoji** u katalogu — samo `capabilities: ['licenses']` kod Snyk unosa) | `packages/shared/src/mcp-catalog.ts` (148 × `{ id: '…'`) | **Preserve**; licence po serveru dolaze iz marketplace sync-a (`packages/marketplace/src/mcp-registry.ts:80,116,152,190,227,320`, `sync.ts:122,174` čita GitHub `license.spdx_id`) — pokrivenost NEPOZNATO |
| `MarketplaceInstaller` + `SecurityGate` + `InstallAuditStore`; `mcp-runtime.ts` spawn kroz `spawnSidecarOwnedProcess` | `packages/marketplace/src/installer.ts`; `packages/agent/src/mcp/mcp-runtime.ts:152-158,529` | **Preserve**; `forceInsecure` iz klijentskog body-ja (audit postoji) |
| Dva memory MCP servera (`waggle-memory-mcp` bundlovan u sidecar; `@waggle/hive-mind-mcp-server` u CLI/hook putu); `erase` samo u prvom | `packages/memory-mcp/`; `packages/hive-mind-mcp-server/`; `scripts/check-sidecar-resources.mjs:955`; `hive-mind-cli/src/commands/mcp-start.ts:36` | **Preserve oba** (R23 spajanje ODLOŽENO); divergencija `erase` = rizik za AT-15 |
| Composio konektor (agregator) | `connectors/composio-connector.ts` | **Preserve**; supply-chain/ToS profil NEPOZNATO |

**OSS kandidati:** OSS MCP serveri iz kataloga (po serveru: repo, verzija, licenca, održavanje, binarni/remote profil). Faza A **nije** evaluirala pojedinačne servere (**NEPOZNATO**). Pravilo iz BRIEF §14: „ne svaki MCP binary kao silent install“ — svaki server koji se preporučuje inline ili bundluje mora imati red u inventaru i proći SecurityGate.

**Odluka (PREDLOG):** **Preserve** konektore, katalog, installer, runtime; **Borrow** MCP servere isključivo kroz Settings + SecurityGate + inventar (R11, FR-OSS-08); **Build** samo `kind:'connector'` proposal + api_key karticu (F-CAP-12) i omotač iza resolver ugovora (BB-04). Nema fizičkog spajanja MCP servera pre scope/auth/context ugovora (R23).

**Vlasnik (uloga):** Capability/W4 owner + Release/OSS owner (inventar). Test: AT-11, AT-17.

---

### BB-12 — Licenses / SBOM / notices tooling

**Postojeći Waggle — POTVRĐENO NA REVIZIJI (F-REL-04/05/07/08; F-TK-13/14):**

| Sredstvo | Putanja | Ocena |
|---|---|---|
| `oss-drift-check.mjs` + immutable `oss-drift-baseline.json` (parity 5, adaptations 38, known blockers 22, unreviewed 1 → live 3, forbidden exports 3 fajla + `vault.ts`, `compliance/`, `governance/`; **odnos baseline ↔ live:** baseline 38 intentional adaptations, live run 36 reviewed + 2 `BASELINE-DRIFT` (`harvest/url-egress-guard.ts`, `mind/transformers-model-load.ts`) koje ulaze u 3 unreviewed — PRD-15-04 navodi 36, ovde 38, bez protivrečnosti) | `scripts/oss-drift-check.mjs:22-36`; `scripts/oss-drift-baseline.json` | **Preserve**; ručna kapija (nije u CI); exit 1 (`docs/plans/v1.2-evidence/phaseA/oss-drift-check-output.txt`) |
| Node runtime + `NODE-LICENSE` staging i provera | `scripts/bundle-node.mjs:39,89,165-166,273`; `certify-windows-installer.ps1:2596-2600` | **Preserve** |
| `stage-sidecar-deps.mjs` čuva first-party LICENSE/NOTICE („retain published runtime layout“) | `scripts/stage-sidecar-deps.mjs:16-18,111` | **Preserve**; ne pomaže paketima bez LICENSE fajla |
| `bundle-native-deps.mjs` kopira `better_sqlite3.node`, `vec0.dll`, `onnxruntime-node/bin/napi-v3/<os>/<arch>/*` — **bez** LICENSE/NOTICE | `scripts/bundle-native-deps.mjs:113-130` | **Adapt**: uz binarije staviti tekst licence |
| `oss-subtree-split.sh` abort guard (`FORBIDDEN_FILES`) + test | `scripts/oss-subtree-split.sh:117-133`; `tests/oss-subtree-split.test.ts` | **Preserve** (inspection only) |
| Marketplace `license` polje (spdx iz GitHub-a) | `packages/marketplace/src/mcp-registry.ts`, `sync.ts:122,174` | **Preserve**; seme za inventar MCP servera |
| `npm audit` u CI `continue-on-error: true`; **nema** license CI (npm ni cargo), **nema** SBOM/THIRD_PARTY_NOTICES fajla (`git ls-files` grep = 0; `git grep cyclonedx\|spdx\|sbom\|syft` = samo marketplace) | `.github/workflows/ci.yml:108-110` | praznina (A28) |
| `tauri.conf.json` `bundle` bez `licenseFile` | `app/src-tauri/tauri.conf.json` | praznina |

**Stanje licenci u repou (POTVRĐENO NA REVIZIJI; odluka o realizaciji ostaje otvorena — BRIEF §20.3):** root `LICENSE` MIT; `README.md:190-194` „MIT osim hive-mind-* = Apache-2.0“; `packages/optimizer/LICENSE` i `packages/weaver/LICENSE` „proprietary and confidential“ uz `"license": "MIT"` u `package.json` (protivrečnost); NOTICE u `hive-mind-cli`, `hive-mind-mcp-server`, `hive-mind-wiki-compiler` proglašava `packages/agent/*`, evolution/traces/signals, vault, tiers, Tauri/web UI, WaggleDance vlasničkim i referiše **nepostojeći** `EXTRACTION.md`; 9 manifesta bez `license` polja (`admin-web`, `server`, `shared`, `waggle-dance`, `worker`, `apps/web`, `apps/www`, `app`, `sidecar`); `hive-mind-core` Apache-2.0 + `"private": true`. Live (27.09.2026, nije svojstvo revizije): repo **javan**, MIT; `WINDOWS_PUBLIC_RELEASE_AUTHORIZED` nije definisan; `main` bez branch protection; secret scanning isključen. CLAUDE.md §1/AGENTS.md/README „remains private“ **zastarelo**.

**Paketi koje isporučujemo bez LICENSE fajla u npm paketu (POTVRĐENO NA REVIZIJI, `node_modules/*/package.json` + `ls`):** `onnxruntime-node` 1.21.0 (MIT), `sqlite-vec-windows-x64` 0.1.9 („MIT OR Apache“), `sqlite-vec` 0.1.9, `@ax-llm/ax` 24.0.23 (Apache-2.0). Sa LICENSE fajlom: `better-sqlite3` 12.6.2 (MIT), `cron-parser` 4.9.0 (MIT), `@huggingface/transformers` 3.8.1 (Apache-2.0), `@modelcontextprotocol/sdk` 1.30.1 (MIT), `fastify` 5.12.5 (MIT), `undici` 8.11.2 (MIT), `zod` 4.6.5 (MIT), `stripe` 22.6.2 (MIT).

**OSS kandidati (alati):** faza A **nije** evaluirala SBOM/license alate (**NEPOZNATO** za verziju, licencu, Windows ponašanje, održavanje). Klase alata koje treba oceniti po FR-OSS-03: (a) CycloneDX/SPDX generator za npm closure (`resources/node_modules`), (b) license allowlist checker nad `npm ls --json --omit=dev`, (c) `cargo-deny`/`cargo-about` za Tauri Rust shell, (d) generator agregiranih notices sa ručnim unosima za native binarije, Ollama zip, model weights. **PREDLOG**: kratak evidence card (repo, verzija, licenca, Windows run, izlazni format, održavanje) za po jedan alat iz klasa (a)–(c) pre izbora; nijedan nije unapred izabran.

**Odluka (PREDLOG):** **Preserve** drift checker, Node/sidecar staging, split guard; **Borrow** standardni SBOM + license-check alat posle evaluacije (blocking CI korak); **Build** samo: agregaciju notices-a za pakete bez LICENSE fajla (tekst iz upstream repoa), ručne unose za native/runtime/model komponente, jednu `Assert-True` grupu u `certify-windows-installer.ps1` za prisustvo `THIRD_PARTY_NOTICES` i SBOM, inventar fajl (§4). Napomena: promena notices-a menja installer SHA → nova certifikacija (S1 OSS gate red, tačno).

**Vlasnik (uloga):** Release/OSS owner; licencna realizacija (ownership, finalni tekstovi, NOTICE ispravke, `EXTRACTION.md` referenca) = **founder decision-queue**, ne implementacija. Test: AT-30.

---

### BB-13 — FR-OSS-03 matrica za kandidate iz skraćenih tabela (BB-02, BB-05, BB-06, BB-08, BB-09, BB-10)

Tabele u BB-02/05/06/08/09/10 nose samo kolone bitne za verdikt; ova matrica dopunjuje preostale kriterijume iz BB-00.5 za svakog kandidata koji se pominje kao Borrow/Adapt ili pattern reference, da nijedan kriterijum ne ostane implicitan. Vrednosti potiču iz `docs/plans/v1.2-evidence/phaseA/external.md` (provera 27.09.2026) ili iz repoa; gde faza A nije merila/čitala, stoji NEPOZNATO — ne pretpostavlja se. **NALAZ AUDITA — ZA PROVERU (live 27.09.2026, izvor: external.md §1–4, §8)** za eksterne kolone (održavanje, verzija/commit, zvezdice, licenca, upstream stanje); **POTVRĐENO NA REVIZIJI** samo za vrednosti sa repo-izvorom (npr. `managed-ollama-runtime.ts:158-237`, `ci.yml:108-110`, `benchmarks/gaia2/README.md`); **NEPOZNATO** gde je tako označeno.

| Kandidat (oblast) | Održavanje (2026-09-27) | Bezbednost / supply chain | Windows | Offline / local-first | Težina deps | Testovi (upstream) | Perf | Update / exit strategija |
|---|---|---|---|---|---|---|---|---|
| BuilderIO/agent-native (BB-02, BB-04, BB-05) | commit `4f899f1d` 27.09.2026, v0.1.271, 6,863★/617 forks, vrlo aktivan | nije pregledan; watchdog „patch-ovan ≥6× u 4 meseca“ (`docs/agent-run-stop-conditions.md`) = signal nestabilnosti run petlje | Node/Nitro — da | **ne** (Postgres/PGlite) | Postgres + Nitro host + 21 paketa u monorepou | NEPOZNATO (nije čitan) | NEPOZNATO | pattern-only → nema exit troška; nikad dependency dok LICENSE po fajlu ne postoji |
| Omnigent (BB-02) | `56c6a7f7` 27.09.2026, v0.15.0, 10,293★, **alpha** | Apache-2.0 + NOTICE; bezbednosni pregled nije rađen; sandbox (bwrap/seatbelt) i egress proxy **nedostupni na Windows-u** | „native but degraded“ | delimično (server + web UI lokalno) | Python 3.12+, Node 22, uv, tmux, pnpm | NEPOZNATO | NEPOZNATO | pattern-only (ACP/stdio ugovor); nema exit troška |
| `@ax-llm/ax` (BB-06) | 24.0.23 instaliran; dependabot aktivan (`^24.0.20`) | npm paket bez LICENSE fajla; `npm audit` u CI samo informativno (`ci.yml:108-110`) | da (čist TS) | da | već u `packages/agent` | upstream suite NEPOZNATO; Waggle pokriva `iterative-optimizer.test.ts`, `evolution-llm-wiring.test.ts`, `compose-evolution.test.ts` | GEPA trošak = broj LLM poziva (cap/consent = Waggle kod) | zamenljiv kroz `complete(prompt)` adapter; exit = sopstveni mutator (Build) — nije planiran |
| Ollama (BB-08) | latest 0.34.4 (23.09.2026); Waggle pin 0.32.3 zastareo za Qwen 3.8 | zip + sha256 pin + Range resume (`managed-ollama-runtime.ts:158-237`); licenca MIT, tekst nije u paketu | da (managed zip) | da posle pull-a | zaseban proces (sidecar-owned) ~ GB | Waggle: `managed-ollama-runtime` testovi; upstream NEPOZNATO | NEPOZNATO za Qwen 3.8 27B na Windows GGML (A21) | manual-pin + rollback verzija (`0.32.0`); exit = OpenAI-compatible profil (llama.cpp/LM Studio/vLLM) — već predviđen (§11.3) |
| vLLM / llama.cpp / LM Studio kao OpenAI-compatible profil (BB-08) | vLLM: HF kartica „use latest“; llama.cpp aktivan; LM Studio proprietary app | van Waggle paketa; korisnički endpoint → validacija odgovora i tool round-trip probe (Build) | vLLM ne native; llama.cpp/LM Studio da | da (lokalni server) | 0 u paketu (samo preset) | n/a | NEPOZNATO (min. verzija vLLM za 3.8 nije zvanično navedena) | preset se briše bez traga; nema exit troška |
| APEX-Agents 1.1 + Harbor 0.20.0 + Archipelago (BB-09) | Archipelago push 25.09.2026, 282★; dataset HF (revizija nije pinovana) | judge = cloud DeepSeek-v4-Flash-0731 → API ključ i podaci van mašine (bench profil, ne proizvod) | Docker `linux/amd64` → WSL2 na bench mašini | ne (judge cloud) | Docker + Harbor + Python | Harbor runner testovi NEPOZNATO | 240 taskova × pass@1/pass^4 → budžet founder odluka | dataset pin (HF sha) + Harbor verzija + image digest; exit = drop primarnog testa (nema koda u proizvodu) |
| τ²-bench v1.0.1 (BB-09) | 2,111★, jul 2026 | user-simulator = cloud LLM; MIT | Python ≥3.12, bez Docker-a | ne (simulator cloud) | Python venv na bench mašini | upstream suite postoji (nije čitan → NEPOZNATO) | airline 50 / retail 114 (+telecom/banking ZA PROVERU) | vendor pin `7bec6062` na grani; cherry-pick bez rebase-a; exit = brisanje `benchmarks/tau2/` |
| ARE / gaia2 (BB-09) | push 26.08.2026, 558★; commit **nije pinovan** | judge Llama 3.3 70B (cloud ili lokalni GPU); MIT/CC-BY-4.0 | Docker opciono | delimično | Python | NEPOZNATO | Phase 3 HALT $4.09/invocation (POTVRĐENO NA REVIZIJI, `benchmarks/gaia2/README.md`) | `Preserve` adapter samo za cost-projection; exit trivijalan |
| `anthropics/knowledge-work-plugins`, `anthropics/skills` (BB-10) | NEPOZNATO | NEPOZNATO (nije čitan; skill tekst = prompt injection površina → obavezan `skill-audit` pri uvozu) | n/a (markdown) | da | 0 runtime deps; MCP konektori po plugin-u = zasebna procena (BB-11) | n/a | n/a | ne koristi se; ODLOŽENO do evidence card-a |
| Reflow `danfry1/reflow-ts` v0.7.0 (BB-01, ponovljeno radi kompletnosti) | push 14.09.2026, 41★, 1 autor | NEPOZNATO (nije pregledan) | da | da | `better-sqlite3 ≥9` (deljen build) | NEPOZNATO (nije čitan) | NEPOZNATO (nije mereno) | vendor/fork uz MIT; long-term ownership obavezan ako Adapt (FRD v1.1 §19) |
| odysseus `hwfit` (BB-08) | — | **AGPL-3.0** → nikad kod ni binary | — | — | 0 | n/a | n/a | koncept clean-room (POTVRĐENO NA REVIZIJI: AGPL-3.0 + obavezujuća licencna napomena projektne analize `docs/analysis/odysseus-adoption-2026-06-28.md:3`; nije D-nn) |

**Zaključak matrice (PREDLOG):** bezbednosni pregled **nije urađen ni za jednog** eksternog kandidata (kolona = NEPOZNATO ili „nije pregledan“); upstream test suite nije čitan ni za jednog. To je očekivano za fazu planiranja i znači da svaki „Borrow/Adapt“ pre implementacije prolazi `securityReview.status ≥ manual` u inventaru (§4) i čitanje testova — uslov, ne formalnost (BRIEF §14 „automatski scanner nije potpuna verifikacija“).

---

## 3. Kriterijum odluke za durable engine (R22) — testovi, ne LOC

**BB-R22.1 — Pravilo.** Odluka „Adapt Reflow“ vs „Build minimalni SQLite engine“ donosi se **isključivo** ishodom spike-a nad istim skupom testova (kriterijum spike-a: T1–T3 + T9, BB-R22.2); brojka „600–1000 LOC“ iz S1 nije kriterijum (BRIEF R22, §14 poslednji red). **PREDLOG — SMER BRIEFA** (§19 R22, §14).

**BB-R22.2 — Testovi (mapirani na AT-ove; pragovi se postavljaju pre pokretanja, BRIEF §16). Kriterijum izbora spike-a (Delivery plan W1-PR1, 28.09.2026) = T1–T3 + T9, izvršeni nad throwaway prototipom obe grane u dev Node okruženju (+ BB-R22.3 za Reflow). T4–T8 i T10 su exit kriterijumi izabrane grane u W1/F2 (T4 → W1-PR8, T5/T6 → W1-PR2, T7 → W1-PR14 + W1-PR15 (erasure/export run store-a; revocation ledger `revocations.json` + Klasa B restore sa ponovnom primenom erasure-a i opoziva, GDPR-H-05), T10 → W1-PR11, T8 → F2 C receipt W8-PR2), jer zavise od samog izbora (W8-PR2 → W1-PR4/PR5 → W1-PR2 → spike: kružna zavisnost) i ne staju u time-box spike-a. PREDLOG:**

| # | Test | Šta dokazuje | AT |
|---|---|---|---|
| T1 | Crash posle potvrđene faze → restart nastavlja sledeću fazu sa istim referencama; potrošnja prethodne faze sačuvana (`Checkpoint.spent`) | phase-level resume, budžet | AT-07 |
| T2 | Crash između provider uspeha i lokalnog ack-a → isti `actionId`, status `unknown_outcome`/ekvivalent, bez blind resend-a; provider receipt/korisnička provera | stabilan action identitet | AT-08 |
| T3 | Dva procesa nad istim `dataDir` pokušaju preuzeti isti run → samo jedan sme započeti novu sporednu radnju (lease + fencing) | fencing | AT-09 |
| T4 | SSE reconnect sa `sinceSeq` → bez dupliranih kartica/akcija; detach ≠ cancel; cancel sprečava nove radnje | run-scoped bus, `seq` | AT-10 |
| T5 | Migracija `agent-runs.json` v1 → store: ponovljiva (dry-run), `interrupted` zadržava razlog i ne postaje `COMPLETED`/`RUNNING`, statusi mapirani 1:1 (`packages/shared/src/types.ts:398-402` enum se ne briše — zod ruta `routes/agent-runs.ts:15` i `RoomApp.tsx:51-66` zavise) | migracija bez gubitka | AT-27 |
| T6 | Retention/GC: >2 000 događaja i >N runova ne ruše `eventsSince` (`resetRequired` overflow put — danas netestiran) i ne rastu bez granice | retention | AT-10 |
| T7 | Erasure/export: run store ulazi u postojeće erasure/export mehanizme (W1-PR14); rollback ne vraća obrisane podatke/opozvane grantove (W1-PR15: revocation ledger + Klasa B restore, MIG-00.6) | A3, DIR-21, GDPR-H-05 | AT-27 |
| T8 | Packaged Windows kandidat bez developer Node/Python/Docker: T1–T4 izvršeni nad instaliranim sidecar-om (crash-injection receipt — alat danas **NIJE NAĐEN**, F-REL-03) | no-prereq paket | AT-30 |
| T9 | Nema Postgres-a, nema zasebnog procesa, jedan native build `better-sqlite3` 12.6.2 (nema drugog ABI-ja) | dependency uslovi | — |
| T10 | Rutine: occurrence identitet, misfire politika (skip / jedan catch-up), DST/restart bez duple radnje; `getDue()` format-bug razrešen (repro iz BB-01) | routines nad istim store-om | AT-23 |

**BB-R22.3 — Dodatni kriterijumi za Adapt Reflow (moraju biti zabeleženi u inventaru §4):** pregled koda i testova (bezbednost), plan vendor/fork uz MIT, bus factor 1 → obaveza long-term ownership (FRD v1.1 §19), razlika API-ja koje bismo morali dopisati (ProofReceipt, PhaseAttempt, action/attempt razdvajanje). Ako dopisani deo prevazilazi pozajmljeni, spike to mora prikazati brojkom, a odluka pada na Build. **PREDLOG**.

**BB-R22.4 — Šta spike ne sme:** menjati semantiku foreground chat-a (R3-008 ostaje do W1 ugovora), smeštati lease/lock u `.mind`, obećavati exactly-once za ne-idempotentne servise (BRIEF §6.5). **PREDLOG — SMER BRIEFA** (§6.5).

---

## 4. Provenance inventar (FR-OSS-04) — šema i seed lista

**BB-INV.1 — Format.** Jedan mašinski čitljiv fajl (predlog lokacije: `docs/oss/PROVENANCE-INVENTORY.json`, uz generisan `THIRD_PARTY_NOTICES.md`); izmene kroz PR; CI validira šemu i kompletnost (FR-OSS-11). Ovo je **PREDLOG** strukture, ne tvrdnja da fajl postoji na reviziji (ne postoji — POTVRĐENO NA REVIZIJI).

**BB-INV.2 — Polja (obavezna ako nije označeno opciono):**

| Polje | Tip | Opis |
|---|---|---|
| `id` | string | stabilan ključ (`npm:better-sqlite3`, `bin:ollama-windows-amd64`, `model:Qwen/Qwen3.8-27B`, `dataset:mercor/apex-agents-v1.1`) |
| `kind` | enum | `npm` · `cargo` · `native-binary` · `runtime` · `model-weights` · `dataset` · `benchmark-runner` · `skill` · `mcp-server` · `vendored-source` · `pattern-reference` |
| `name`, `sourceUrl` | string | repo/registry URL |
| `version` | string | semver ili tag |
| `commitOrHash` | string | commit SHA, HF `sha`, artefakt `sha256`, npm `integrity` ili Ollama digest |
| `license` | string (SPDX) | deklarisana licenca |
| `licenseEvidence` | enum | `LICENSE-file` · `package.json-field-only` · `repo-metadata` · `NONE` |
| `licenseTextIncluded` | bool | da li tekst ulazi u notices |
| `usage` | enum | `shipped-desktop` · `shipped-sidecar` · `dev-only` · `bench-only` · `pattern-only` |
| `decision` | enum | `preserve` · `borrow` · `adapt` · `build-reference` |
| `modifications` | string / null | opis lokalnih izmena (za `adapt`) |
| `attribution` | string / null | obaveze (NOTICE, CC-BY autor, …) |
| `securityReview` | object | `{status: none\|scanner\|manual\|sealed, date, owner, findingsOpen}` — automatski scanner nije potpuna verifikacija (BRIEF §14) |
| `windows`, `offline` | enum | `verified` · `claimed` · `unknown` · `not-applicable` |
| `updateStrategy` | enum + string | `dependabot` · `manual-pin` · `vendor-sync` · `frozen` + napomena |
| `exitStrategy` | string | kako se zamenjuje/uklanja |
| `owner` | string (uloga) | odgovorna uloga |
| `addedIn`, `lastVerified` | date | 
| `notes` | string, opciono | |

**BB-INV.3 — Seed lista (vrednosti su stanje na reviziji `2af0904d` ili spoljna provera 27.09.2026; `licenseEvidence` je ono što je stvarno nađeno):**

| id | kind | version / hash | license (evidence) | usage | decision | Windows/offline | update | Status |
|---|---|---|---|---|---|---|---|---|
| `runtime:node` | runtime | **22.23.2** (`scripts/bundle-node.mjs:39`); artefakt sha proverava `bundle-node.mjs`/`certify` | MIT-style Node license (`NODE-LICENSE` staged) | shipped-desktop | borrow | verified (certify 64/64 na ranijem kandidatu; **ne** na `2af0904d`) | manual-pin | POTVRĐENO NA REVIZIJI |
| `npm:better-sqlite3` | npm (native) | 12.6.2 | MIT (LICENSE-file) | shipped-sidecar | borrow | verified (bundlovan `.node`) | dependabot | POTVRĐENO NA REVIZIJI |
| `npm:sqlite-vec-windows-x64` | native-binary | 0.1.9 (`vec0.dll`) | „MIT OR Apache“ (**package.json-field-only, NONE LICENSE fajl**) | shipped-sidecar | borrow | verified | dependabot | POTVRĐENO NA REVIZIJI — tekst licence generisati iz upstream-a |
| `npm:onnxruntime-node` | native-binary | 1.21.0 | MIT (**package.json-field-only, NONE**) | shipped-sidecar | borrow | verified | dependabot | POTVRĐENO NA REVIZIJI — isto |
| `npm:@huggingface/transformers` | npm | 3.8.1 | Apache-2.0 (LICENSE-file) | shipped-sidecar | borrow | claimed | dependabot (major 4 blokiran — TD-DEP-4) | POTVRĐENO NA REVIZIJI |
| `model:Xenova/all-MiniLM-L6-v2` | model-weights | HF revizija **NEPOZNATO** (nije pinovana u kodu; `inprocess-embedder.ts:32`) | Apache-2.0 (upstream sentence-transformers; ZA PROVERU na HF kartici) | shipped-sidecar (seed u certify `:2904`) | borrow | offline posle seed-a | frozen (predlog: pin revizije) | NALAZ AUDITA — ZA PROVERU |
| `model:Xenova/ms-marco-MiniLM-L-6-v2` | model-weights | revizija NEPOZNATO (`inprocess-reranker.ts:55`) | Apache-2.0 (ZA PROVERU) | shipped-sidecar (**nije bundlovan**; download na prvo korišćenje) | borrow | offline **unknown** (soft-fail → RRF) | frozen (predlog: pin + seed) | NALAZ AUDITA — ZA PROVERU |
| `npm:@ax-llm/ax` | npm | 24.0.23 | Apache-2.0 (**package.json-field-only, NONE**) | shipped-sidecar | borrow | claimed | dependabot | POTVRĐENO NA REVIZIJI |
| `npm:cron-parser` | npm | 4.9.0 | MIT (LICENSE-file) | shipped-sidecar | borrow | verified | dependabot | POTVRĐENO NA REVIZIJI; `tz` neiskorišćen |
| `npm:@modelcontextprotocol/sdk` | npm | 1.30.1 | MIT (LICENSE-file) | shipped-sidecar | borrow | claimed | dependabot | POTVRĐENO NA REVIZIJI |
| `npm:fastify` / `undici` / `zod` / `stripe` | npm | 5.12.5 / 8.11.2 / 4.6.5 / 22.6.2 | MIT (LICENSE-file) | shipped-sidecar (stripe: server/www) | borrow | — | dependabot | POTVRĐENO NA REVIZIJI |
| `bin:ollama-windows-amd64` | runtime | **0.32.3** target / **0.32.0** rollback; rollback sha256 `56561a8f…b89e` (`managed-ollama-runtime.ts:160-184`); target sha u istom bloku | MIT (Ollama repo; tekst **nije** u paketu — ZA PROVERU) | shipped-desktop (managed download) | borrow | verified (Range resume, sha256) | manual-pin → **repin ≥0.32.12/0.32.15 potreban za Qwen 3.8** | NALAZ AUDITA — ZA PROVERU |
| `model:qwen2.5:0.5b` (Ollama) | model-weights | digest u receipt-u (`09-LAUNCH:47-48`) | Apache-2.0 (Qwen2.5; ZA PROVERU) | certifikacioni smoke model | borrow | offline posle pull-a | frozen | POTVRĐENO NA REVIZIJI (uloga = smoke, ne cilj) |
| `model:Qwen/Qwen3.8-27B` | model-weights | HF sha `1d4bf0f2ff6012fd82039f2fa52739d0dd7c60c0` (2026-08-14); Ollama `qwen3.8:27b-q4_K_M` digest `25b843619e94`; `unsloth/Qwen3.8-27B-GGUF` UD-Q4_K_M 16.5 GB | Apache-2.0 (LICENSE u HF repou) | target (nije još na proizvodnoj putanji) | borrow | Windows/offline: **unknown** do merenja (A21) | manual-pin | NALAZ AUDITA — ZA PROVERU (identitet; live 27.09.2026, external §1, §8) / NEPOZNATO (VRAM/RAM) |
| `model:Qwen/Qwen3.6-35B-A3B` | model-weights | sha `995ad96eacd98c81ed38be0c5b274b04031597b0` (2026-04-24) | Apache-2.0 | kontrolni baseline (produkcioni router: cloud DashScope `litellm-config.yaml:211-215`; benchmark harness: lokalni vLLM unos `models.json:61-67`) | borrow | n/a | frozen | NALAZ AUDITA — ZA PROVERU (sha/licenca; live 27.09.2026, external §1.5, §8); uloga u routeru/harness-u POTVRĐENO NA REVIZIJI |
| `bench:meta-agents-research-environments` (ARE) | benchmark-runner | commit **NEPOZNATO** (nije pinovan; push 2026-08-26) | MIT | bench-only | borrow | Docker opciono; bench mašina | manual-pin | NALAZ AUDITA — ZA PROVERU (licenca/push; live 27.09.2026, external §4.2, §8) |
| `dataset:gaia2` | dataset | HF revizija NEPOZNATO | CC-BY-4.0 (sintetika pod Llama 3.3/4 licencama) | bench-only | borrow | — | frozen | NALAZ AUDITA — ZA PROVERU (live 27.09.2026, external §4.2, §8) |
| `bench:tau2-bench` | benchmark-runner | v1.0.1 (jul 2026); vendor pin na grani `7bec6062` | MIT | bench-only (Python ≥3.12) | adapt (cherry-pick) | bench mašina | manual-pin | NALAZ AUDITA — ZA PROVERU (verzija/licenca; live 27.09.2026, external §4.1, §8); vendor pin `7bec6062` postoji samo na `origin/feature/harness-sota-bench`, ne na `2af0904d` |
| `dataset:mercor/apex-agents-v1.1` + `bench:harbor` + `bench:archipelago` | dataset + runner | HF revizija NEPOZNATO; Harbor **0.20.0**; Archipelago push 2026-09-25 | CC-BY-4.0 / (Harbor licenca **NEPOZNATO**) / Apache-2.0 | bench-only (Docker/WSL2) | borrow | bench mašina | manual-pin | PREDLOG (primarni test nije odobren) |
| `dataset:openai/gdpval` | dataset | sha `11e7900c` | **NEPOZNATO** | bench-only | odloženo | — | — | ODLOŽENO |
| `vendored:pptxgenjs` | vendored-source | `vendor/pptxgenjs/LICENSE` | MIT | shipped (agent pptx runtime — `scripts/stage-agent-pptx-runtime.mjs`) | adapt | — | vendor-sync | POTVRĐENO NA REVIZIJI (postojanje); verzija/izmene ZA PROVERU |
| `pattern:BuilderIO/agent-native` | pattern-reference | v0.1.271, commit `4f899f1d` | ISC/MIT/**null** (root) | pattern-only | build-reference | n/a | n/a | NALAZ AUDITA — ZA PROVERU (live 27.09.2026, external §2.1, §8); bez koda |
| `pattern:omnigent` | pattern-reference | v0.15.0, `56c6a7f7` | Apache-2.0 | pattern-only | build-reference | n/a | n/a | NALAZ AUDITA — ZA PROVERU (live 27.09.2026, external §2.2, §8) |
| `pattern:reflow-ts` | pattern-reference → kandidat `adapt` | v0.7.0 | MIT | spike | TBD (§3) | Node | vendor/fork | PREDLOG |
| `concept:odysseus-hwfit` | pattern-reference | — | **AGPL-3.0** | koncept samo (clean-room) | build-reference | n/a | n/a | POTVRĐENO NA REVIZIJI (AGPL-3.0; licencna napomena `docs/analysis/odysseus-adoption-2026-06-28.md:3`; nije D-nn) |
| `skills:first-party-starter (18)` | skill | `packages/sdk/src/starter-skills/` @ `2af0904d` | MIT (root) — provenance header ne postoji | shipped-sidecar | preserve | — | repo | POTVRĐENO NA REVIZIJI |
| `skills:anthropics/knowledge-work-plugins`, `skills:anthropics/skills` | skill | — | **NEPOZNATO** | ne koristi se | odloženo | — | — | NEPOZNATO |
| `mcp:*` (148 kataloških + instalirani) | mcp-server | po serveru | po serveru (`spdx_id` iz sync-a) | user-installed kroz SecurityGate | borrow (uslovno) | po serveru | marketplace sync | NEPOZNATO (pokrivenost licenci) |

**BB-INV.4 — Pravila održavanja inventara (PREDLOG):** nova materijalna dependency odluka → novi red + dopuna ovog zapisa (BRIEF §14 „materijalna nova dependency odluka zahteva dopunu“, R24 bez birokratije po PR-u); `securityReview.status = scanner` nije dovoljan za `shipped-*` — nerešen nalaz ima vlasnika, odluku i ograničenje upotrebe; model weights i native binarije su komponente kao i npm paketi.

---

## 5. Upstream, bezbednost i održavanje — najvažniji troškovi

| ID | Trošak | Oblast | Status |
|---|---|---|---|
| BB-COST.1 | Repin Ollama 0.32.3 → ≥0.32.12/0.32.15: nova installer receipt + router receipt (CLAUDE.md §1 release contract); Qwen 3.8 pull/generate/tool test na Windows GGML | BB-08 | NALAZ AUDITA — ZA PROVERU |
| BB-COST.2 | Notices/SBOM menjaju installer SHA → nova certifikacija; `certify` proširiti | BB-12 | POTVRĐENO NA REVIZIJI (posledica) |
| BB-COST.3 | Substrat (`hive-mind-core`) i `hook-runtime.ts` izmene → re-baseline drift checkera + kurirani forward-port; već 22 blockers + 3 unreviewed | BB-03, BB-06 | POTVRĐENO NA REVIZIJI |
| BB-COST.4 | SQLite `CHECK` constraint migracije (table-rebuild) za `execution_traces.outcome` (`gate_passed`) i `evolution_runs.status` (`rolled_back`) | BB-02, BB-06 | POTVRĐENO NA REVIZIJI |
| BB-COST.5 | Reflow bus factor 1 → obaveza fork/vendor održavanja ako se izabere Adapt | BB-01 | PREDLOG (uslovno) |
| BB-COST.6 | DeepSeek judge (APEX) i LLM user-simulator (τ²) su cloud API → trošak + KVARK režim isključen za te profile; GAIA2 judge Llama 3.3 70B može i lokalno (BB-13) | BB-09 | NALAZ AUDITA — ZA PROVERU (live 27.09.2026, izvor: external.md §4, §8) |
| BB-COST.7 | `cost-tracker.ts` tabela precenjuje Opus ×3 i Sonnet 5 ×1.5 → hard daily budget prevremeno puca (BYOK korisnik) | BB-09 (manifest) / product | POTVRĐENO NA REVIZIJI (vrednosti tabele `cost-tracker.ts:28-32,39-40,66`) + NALAZ AUDITA — ZA PROVERU (zvanične cene, pa i faktori ×3/×1.5: live 27.09.2026, izvor: external.md §6, §8) |
| BB-COST.8 | Gmail restricted scopes → OAuth verifikacija + CASA (nedelje, spolja); MS Graph delegated bez admin consent-a | BB-07 | NALAZ AUDITA — ZA PROVERU (Gmail/MS Graph pravila: live 27.09.2026, izvor: external.md §5, §8; CASA izuzeće za local-only posebno otvoreno) |
| BB-COST.9 | Licencne protivrečnosti (optimizer/weaver LICENSE vs package.json; NOTICE „proprietary“ + nepostojeći `EXTRACTION.md`; 9 manifesta bez `license`) na javnom repou | BB-12 | POTVRĐENO NA REVIZIJI → founder decision-queue |
| BB-COST.10 | Repo je javan bez branch protection, secret scanning isključen; `production` env bez reviewer-a | BB-12 (release) | NALAZ AUDITA — ZA PROVERU (live 27.09.2026) |

---

## 6. Pod-lista (mapa na DQ) (kratko; ne otvara D-01..D-18)

Founder queue je isključivo Delivery plan §6 `DQ-01..09` (= brief §20.3, PRD v1.2 §17 `O-1..O-9`); `Q1..Q6` ispod su pod-lista i ne redefinišu `DQ-nn`. Mapa (ista kao Delivery plan §6): Q2 → DQ-04, Q3 → DQ-06, Q4 → DQ-02, Q5 → DQ-05; **Q1 i Q6 su inženjerske odluke vlasnika** (Q1: Runtime/W1 owner, uz ratifikaciju ADR-02 za ishod; Q6: Release/OSS owner), ne founder queue. **PREDLOG**.

| # | Odluka | Preporuka ovog zapisa (PREDLOG) | Uticaj |
|---|---|---|---|
| Q1 | Durable jezgro: dvogranski spike (Adapt Reflow vs Build SQLite) po §3 — **inženjerska** (Runtime/W1 owner) | pokrenuti spike u izolovanom worktree-u; izbor posle T1–T3 + T9 na prototipu obe grane (BB-R22.2); T4–T8/T10 su W1/F2 exit izabrane grane; Borrow/Adapt ostaje PREDLOG do potvrde (BB-00.2) | W1 kritična putanja |
| Q2 | Primarni benchmark: APEX-Agents 1.1 (+ τ² kontrola) i budžet judge API-ja | odobriti evidence card kao primarni; τ² sekundarni | B1–B3, G2/G3 |
| Q3 | Prvi mail/calendar ekosistem | MS Graph (delegated, bez CASA) pre Gmail-a | W7, G3 |
| Q4 | Licencna realizacija: finalni tekstovi, NOTICE ispravke, `EXTRACTION.md`, `license` polja; SBOM/license alat izbor posle evidence card-a | odvojena odluka; ne blokira G1 kod | OSS gate, AT-30 |
| Q5 | Repin Ollama + re-baseline kataloga na Qwen 3.8 27B (D-15 ostaje) | odobriti kao W6 rani korak | W6, receipts |
| Q6 | Uvoz eksternih skill paketa — **inženjerska** (Release/OSS owner) | ODLOŽENO do per-repo licencne provere | W3/G3 |

---

## 7. Registar NEPOZNATO / otvoreno

| # | Stavka | Oblast | Šta bi zatvorilo |
|---|---|---|---|
| U1 | OSS kandidati za context package, WorkItem/delta sync, SBOM/license alate — **nisu istraženi u fazi A** | BB-03, BB-07, BB-12 | kratki evidence card-ovi po klasi (repo, verzija, licenca, Windows, održavanje) |
| U2 | Licence/verzije `anthropics/knowledge-work-plugins`, `anthropics/skills`, Harbor, GDPval dataset; HF revizije ONNX modela i gaia2/apex dataset-a | BB-09, BB-10, §4 | provera po repo-u i pin u inventaru |
| U3 | Reflow: test suite, bezbednosni pregled, perf | BB-01 | čitanje repoa + spike |
| U4 | `getDue()` ISO-vs-`datetime('now')` poređenje (rutine ne dospevaju istog UTC dana) | BB-01 | repro nad `CronStore` (ne `:memory:`) |
| U5 | Da li Ollama 0.32.3 servira `qwen3_5` arch (Qwen 3.8 27B) na Windows GGML; zvanični min. vLLM/SGLang; tool parser za 3.8; VRAM/RAM po quantu | BB-08 | pull/generate/tool test; merenje (A21) |
| U6 | Reranker model offline na svežem desktopu; `memory_compact` cron E2E na desktopu | BB-03 | instalacioni test |
| U7 | Da li `waggle-bridge-server.ts` (τ² grana) ide kroz production `/api/chat`; τ² telecom/banking pun broj taskova | BB-09 | čitanje grane / paper |
| U8 | Gmail CASA izuzeće za local-only desktop; Slack „persistent copies“ vs lokalna memorija; MS Graph za MSA naloge; Discord policy citat | BB-07 | pravni/vendor pregled |
| U9 | Pokrivenost `license` polja u marketplace sync-u za 148 kataloških MCP servera | BB-11 | upit nad marketplace DB |
| U10 | Ko poziva `markSurfaced` u produkciji; da li Claude Code `--safe-mode` suzbija SessionStart hookove (dupla injekcija) | BB-06, BB-03 | grep/test; dokumentacija Claude Code |
| U11 | Stvarni pretplatnici/Stripe proizvodi; datum kad je repo postao javan | WB (van ovog zapisa) | ovlašćen inventar |
| U12 | Bezbednosni pregled i čitanje upstream testova **ni za jednog** eksternog kandidata (BB-13 matrica) | sve Borrow/Adapt oblasti | `securityReview.status ≥ manual` + zapis o testovima u inventaru pre prvog PR-a koji uvodi dependency |
| U13 | Inngest SDK licenca (Apache-2.0 u `package.json` vs GPL-3.0 GitHub detekcija) i OpenWorkflow (nije evaluiran) — irelevantno za odluku (oba odbačena/NEPOZNATO), zabeleženo radi kompletnosti | BB-01 | čitanje `LICENSE*` u repoima ako se ikad ponovo razmatraju |
| U14 | HF revizije dataset-a `mercor/apex-agents-v1.1`, `gaia2`, `openai/gdpval` i ARE commit — **nisu pinovani** ni u repou ni u fazi A; Harbor licenca | BB-09, §4 | pin u inventaru pre prvog benchmark run-a (§13.6 manifest) |

---

## Izvori

- **D** — odluke korisnika 27.09.2026: D-01, D-02, D-03, D-05, D-06, D-11, D-12, D-13, D-15, D-17, D-18 (BRIEF §3).
- **DIR** — DIR-01, DIR-02, DIR-03, DIR-04, DIR-05, DIR-06, DIR-07, DIR-09, DIR-10, DIR-11, DIR-12, DIR-13, DIR-14, DIR-15, DIR-17, DIR-18, DIR-19, DIR-21, DIR-22, DIR-23, DIR-24 (BRIEF §4–§14).
- **C** — C5, C6, C10, C11, C12, C13, C14, C19, C20, C22 (BRIEF §17; S1 §1).
- **A** — A1, A2, A3, A5, A6, A7, A8, A9, A10, A11, A12, A13, A15, A16, A17, A18, A19, A20, A21, A26, A27, A28, A29 (BRIEF §18; S1 §2).
- **R** — R01, R11, R13, R17, R20, R21, R22, R23, R24 (BRIEF §19; S1 §3).
- **BRIEF** — `docs/plans/v1.2-evidence/inputs/Waggle_Planner_Brief_v1.0_2026-09-27.md` §2.2, §5.1, §6, §7, §8, §9, §10, §11.3, §11.4, §12.3, §13, §14, §15.3, §16, §20.
- **S1** — `docs/plans/v1.2-evidence/inputs/S1-audit-2026-09-27.md` (spot-checks, §2 A1–A29, §3 rezovi, §4 OSS gate red).
- **PRD/FRD v1.1** — `docs/plans/v1.2-evidence/inputs/Waggle_PRD_v1.1_2026-09-27.md` §14 (OSS-first), `docs/plans/v1.2-evidence/inputs/Waggle_FRD_v1.1_2026-09-27.md` §18 FR-OSS-01..12, §19.
- **Faza A** — `docs/plans/v1.2-evidence/phaseA/{harness,durable,evolution,hivemind,capability,ux-model,tiers-kvark,release-oss}.md` + `{harness,durable,evolution,hivemind}.refute.md`, `external.md` (spoljne provere 27.09.2026), `oss-drift-check-output.txt`, `repro-harness.mjs`, `repro-shadow.mjs`, `repro-gepa-delta.mjs`.
- **Repo (read-only, revizija `2af0904df01ca3d374cc78ba95b60dc579dd6a7a`)** — `package.json`, `package-lock.json`, `packages/*/package.json`, `node_modules/*/package.json` (verzije/licence), `packages/sdk/src/starter-skills/`, `packages/agent/src/connectors/`, `packages/shared/src/mcp-catalog.ts`, `scripts/{bundle-node,bundle-native-deps,stage-sidecar-deps,oss-drift-check}.mjs`, `packages/server/src/local/managed-ollama-runtime.ts`, `benchmarks/gaia2/{adapter.ts,config.yaml,README.md}`, `benchmarks/harness/package.json`, `docs/analysis/odysseus-adoption-2026-06-28.md`.
