# 04 — Mapa koda za oblasti koje dira plan v1.2

**Revizija dokumenta:** handoff 1.0 · 29.09.2026 · pregledana revizija koda `2af0904df01ca3d374cc78ba95b60dc579dd6a7a` (`main`, u daljem tekstu `2af0904d`)
**Revizija dokumenta:** 1.2.1 DRAFT · 30.09.2026 · završno zatvaranje (H-01..H-12)
**Izmene 1.2.1:** H-04 — §13 t.7 i STOP blok: pokazivači na predlog [TEAM-START-AUTHORIZATION](TEAM-START-AUTHORIZATION.md) (TSA-02; NEODOBRENO), §14 N-6 → TSA-01 t.2 · H-05 — §1 „Data dir”: upisi mimo `WAGGLE_DATA_DIR` (05 N-28, W0-PR20; kod nije popravljen), §13 t.7 BTP · H-09 — STOP blok i §12: izuzetak kontrolisanog koraka K i W8-PR7 (Delivery §5.1) · H-01 — §12 vidljivost repoa ponovo proverena 30.09.2026. Opis koda na `2af0904d` nije menjan; revizija nije odobrenje implementacije.
**Publika:** tech lead, developeri i QA koji od osnivača preuzimaju Waggle.
**Namena:** orijentacija u kodu za oblasti koje menja [Delivery plan v1.2](../plans/WAGGLE-DELIVERY-PLAN-v1.2.md). Ovo nije specifikacija ni plan: ugovori su u [FRD v1.2](../Waggle_FRD_v1.2_DRAFT.md), redosled i PR-ovi u Delivery planu, migracije u [WAGGLE-MIGRATIONS-v1.2.md](../plans/WAGGLE-MIGRATIONS-v1.2.md), dokazi u [phase-A nalazima](../plans/v1.2-evidence/phaseA/).

> **STOP pre koda.** Implementacija **nije odobrena**. Kodiranje počinje tek kad osnivač odobri Delivery plan (ratifikacije RAT-01..RAT-09 i odobrenja ODB-01/ODB-02 su u Delivery planu §6.1). Šta tim sme danas, a šta posle odobrenja: [00 §2](00-START-HERE.md); predlog operativnog modela tima je [TEAM-START-AUTHORIZATION](TEAM-START-AUTHORIZATION.md) (NEODOBRENO, ne važi pre pisane potvrde osnivača). Svaki PR, agent i sesija prolazi **obaveznu** bezbednu strategiju: Delivery plan §0 (DP-0.01..DP-0.16) i [SAFE-IMPLEMENTATION-CHECKLIST.md](../plans/SAFE-IMPLEMENTATION-CHECKLIST.md). Jedno „ne” na checklisti zaustavlja rad. Nema merge-a u `main`, nema `v*` tagova, nema release-a (DP-0.11, DP-0.12); jedini izuzetak je kontrolisani korak K koji pisano odobrava osnivač ([Delivery §5.1](../plans/WAGGLE-DELIVERY-PLAN-v1.2.md)), i on nije timski posao. Osnivačeve odluke D-01..D-18 ([brief §3](../plans/v1.2-evidence/inputs/Waggle_Planner_Brief_v1.0_2026-09-27.md)) su zatvorene i ovaj dokument ih ne otvara.

---

## 0. Kako čitati ovaj dokument

**Oznake statusa** su iste kao u paketu: **ODLUKA** (samo D-01..D-18) · **POTVRĐENO NA REVIZIJI** (pročitano u kodu na `2af0904d`) · **NALAZ AUDITA — ZA PROVERU** (tvrdnja audita koja još nije reprodukovana) · **DELIMIČNO/NEPOVEZANO** (mehanizam postoji, tok nije zatvoren) · **PREDLOG** (plan, nije odobreno) · **ODLOŽENO** · **NEPOZNATO**. Paket koristi i **VEĆ ZATVORENO** (tvrdnja S1 audita već rešena na reviziji). „Modul postoji” nigde nije dokaz da E2E funkcija radi.

**Šta je provereno u ovom prolazu (29.09.2026, read-only):**
- Postojanje **svake putanje fajla** u ovom dokumentu, preko `git ls-tree -r 2af0904d`. Putanje su tačne na toj reviziji, osim tamo gde piše „ne postoji na `2af0904d`” (novi fajlovi iz plana).
- Spot-check sadržaja na reviziji (`git show 2af0904d:<fajl>`): `shouldSkipVerify` (`workflow-harness.ts:474-482`), `'run_harness'` u `verification-gate.ts:33`, `listPersonas()` (`personas.ts:67-70`), `resolvePersona` (`chat.ts:439-440`), close→abort (`chat.ts:1604-1612`), `local/index.ts:538,565,585,612-616`, `ci.yml:3-6`, `release.yml:12-15`, `OLLAMA_TARGET_VERSION` (`managed-ollama-runtime.ts:28-29`), `dock-tiers.ts:82`, `createKvarkTools` (0 produkcijskih pozivalaca), `recallHookFrames` (`hook-runtime.ts:227-240`), `useHasWorkingModel.ts:174,244`, pull `stream:false` + 45 min (`local-inference.ts:330-331`), `cost-tracker.ts:24-33,66`, leak (`external-tool-runs.ts:964-977`), `hardware-detect.ts:330`, `interruptInFlightInternalRuns` (`agent-run-registry.ts:510-520`), `fleet-run-executor.ts:101-106`, `tauri.conf.json:4,21`, `vitest.config.ts:28`, i pin linije testova `workflow-tools-harness.test.ts:135-140`, `harness-trace-bridge.test.ts:82-92`, `cost-tracker.test.ts:54-57`, `fleet-isolation.test.ts:200-205`, `useHasWorkingModel.test.ts:271-275`. Sve se poklapa sa phase-A.
- **Ostali `path:line` citati** su preneti iz phase-A nalaza i Delivery plana sa njihovom oznakom statusa; ovde nisu ponovo čitani liniju po liniju. Linije važe samo na `2af0904d`: posle prvih W0 merge-ova na integracionoj grani **pomeraju se**. Sidri po simbolu, ne po broju linije (§13).

**Ispravke putanja koje je ovaj prolaz našao** (POTVRĐENO NA REVIZIJI, `git ls-tree`):

| Kako se negde navodi | Stvarna putanja na `2af0904d` |
|---|---|
| `chat-collaboration.ts` u grupi `routes/chat-*.ts` (DP-0.14) | `packages/server/src/local/chat-collaboration.ts` (nije u `routes/`) |
| `retrieval-agent-loop.ts` uz `long-task/` (phase-A durable §2) | `packages/agent/src/retrieval-agent-loop.ts` |
| `data-erase.ts` (ADR-10-K7, W1-PR14) | `packages/server/src/local/routes/data-erase.ts` + `packages/server/src/local/data-erase-helpers.ts` |
| `THREAT_MODEL.md` (W4-PR7) | koren repoa: `THREAT_MODEL.md` (175 linija) |
| `executor-brief.ts` | `packages/server/src/local/executor-brief.ts` (nije u `packages/agent`) |
| `agent-groups.ts:87` | `packages/server/src/local/routes/agent-groups.ts` |
| `MultiMind` (CLAUDE.md §2 ga stavlja u `packages/core/src/`) | `packages/hive-mind-core/src/multi-mind.ts`; `packages/core/src/` na reviziji nema `multi-mind.ts`, `multi-mind-cache.ts` ni `logger.ts` |
| `EvolutionTab.tsx` | `apps/web/src/components/os/apps/memory/EvolutionTab.tsx` |

**Doc drift koji treba znati** (POTVRĐENO NA REVIZIJI): `docs/ARCHITECTURE.md` („Storage Locations”) kaže da je lična memorija `~/.waggle/default.mind`, a kod otvara `path.join(dataDir, 'personal.mind')` (`packages/server/src/local/index.ts:565`). `CLAUDE.md` §2 kaže „94 .ts files” za `packages/agent/src/`; na reviziji je 150 `.ts` fajlova na prvom nivou. Za ovu stavku ne postoji PR u planu. Ne ispravljaj je bez tiketa: dozvoljeni doc-drift PR je W0-PR15, sa tačno navedenim obimom.

---

## 1. Topologija u jednoj strani

**Procesi.** Tauri 2 shell (`app/src-tauri/`) pokreće bundlovan Node sidecar. Sidecar je Fastify server čiji je composition root `packages/server/src/local/index.ts`. Taj fajl pravi sve store-ove i dekoriše ih na `server`. UI je `apps/web/src` (React 19). Teams cloud server (`packages/server/src/index.ts`) i BullMQ worker (`packages/worker/src/*`) ne startuju u Solo paketu: to se dešava samo uz `DATABASE_URL` i `CLERK_SECRET_KEY` (`local/index.ts:3585-3614`, F-TK-08, POTVRĐENO NA REVIZIJI).

**Pravilo zavisnosti** ([ARCHITECTURE.md](../ARCHITECTURE.md), „Layer Map”): `shared ← hive-mind-core ← core ← agent ← server`. Fastify se importuje samo u `packages/server`.

**Data dir.** Razrešava se kao `option > WAGGLE_DATA_DIR > ~/.waggle` (`packages/server/src/local/service.ts:112-121`, DP-0.08). Ne poštuju ga svi upisi: `routes/documents.ts:37`, `routes/pins.ts:32` i još nekoliko mesta pišu pod `os.homedir()/.waggle` (POTVRĐENO NA REVIZIJI čitanjem koda; lista u [05 N-28](05-RISKS-DECISIONS-ESCALATION.md) i [01 §9.5](01-ONBOARDING-DEV-ENV.md)). Popravka je W0-PR20 sa sentinel testom; kod nije popravljen, a do potvrde run-ovi idu samo u bezbednom test profilu (checklist „Bezbedan test profil (BTP)”). Composition root pravi:

| Stanje | Gde nastaje (`2af0904d`) | Napomena |
|---|---|---|
| `agent-runs.json` (run registar) | `local/index.ts:538` `new AgentRunRegistry(path.join(dataDir,'agent-runs.json'))` | whole-file JSON (F-DUR-02); postaje run store u W1-PR2 (MIG-01) |
| `personal.mind` (SQLite) | `local/index.ts:565-566` `new MultiMind(personalPath)` | nosi i semantičku memoriju **i** execution state: cron tabele i `pending_actions` ([MIG §1.1](../plans/WAGGLE-MIGRATIONS-v1.2.md)) |
| `CronStore` nad `personal.mind` | `local/index.ts:585` `new CronStore(multiMind.personal)` | rutine, leases, `pending_actions` |
| `HarnessTraceBridge` | `local/index.ts:612-616` (bez context resolver-a) | piše `execution_traces` |
| `workspaces/<id>/workspace.mind` | `hive-mind-core/src/workspace-manager.ts:139-140` | izolacija minds (D-12) |
| `{dataDir}/personas/*.json`, `behavioral-overrides/*.json` | evolution deploy (`evolution-deploy.ts`) | override fajlovi (MIG-03) |
| `config.json` (`tier`, `trialStartedAt`) | 5 čitača, 3 pisca (F-TK-07) | read-compatible kroz `parseTier` |

**Portovi.** Sidecar podrazumevano koristi `WAGGLE_PORT` 3333 (`service.ts:124-127`), Teams server `PORT` 3100 (`packages/server/src/config.ts:13`). Instalirani desktop preferira 3333 (`app/src-tauri/src/lib.rs:103`). Izolacija za agente i testove je propisana u DP-0.08 i u checklisti („Env izolacija”). Testovi se nikad ne pokreću nad `~/.waggle`.

---

## 2. Hotspot fajlovi i merge vlasnici (DP-0.14, uloge a ne imena)

Dva PR-a koja diraju isti hotspot ne merge-uju se istog dana bez integracionog testa.

| Hotspot | Merge vlasnik |
|---|---|
| `packages/server/src/local/routes/chat.ts` + `chat-*.ts` (i `packages/server/src/local/chat-collaboration.ts`) | Harness/Chat owner (DP-0.14; složena oznaka = dve uloge). Wave redovi navode samo Chat owner: otvoreno pitanje, vidi ispod tabele |
| `packages/agent/src/agent-loop.ts` + `loop-gates.ts` | Harness owner |
| `packages/agent/src/orchestrator.ts` + `prompt-assembler.ts` | Memory owner |
| `packages/server/src/local/index.ts` | Server owner |
| `packages/shared/src/tiers.ts` + `packages/server/src/middleware/assert-tier.ts` | Boundary owner |
| `packages/agent/src/workflow-harness.ts` + `workflow-tools.ts` | Harness owner u W0 → **Durable owner od W1** |
| `packages/core/src/cron-store.ts` + `packages/server/src/local/cron.ts` | Durable owner |
| `packages/hive-mind-core/src/**` | Memory owner + OSS drift dužnost (`CLAUDE.md` §7.5) |

**Otvoreno pitanje: ko odobrava merge chat hotspot-a** (NEPOZNATO). DP-0.14 za `chat.ts` + `chat-*.ts` navodi `Harness/Chat owner`, a to su dve uloge. Delivery §2 W0 „Hotspot merge owner (po DP-0.14)” ipak navodi samo Chat owner za `chat.ts` (PR9), `chat-agent-run.ts` (PR8) i `chat-collaboration.ts` (PR11). Isto rade „Hotspot merge owner” redovi W1, W2, W3, W3e, W4, W5 i B1–B3, pa i „Hotspot vlasnik” redovi u §5–§9 ovog dokumenta koji ih prepisuju. Plan ne kaže da li Harness owner ko-odobrava merge, a handoff to ne bira ćutke. Pitanje ide tech lead-u i founder-u po [02 §10](02-WORKING-AGREEMENT.md) i mora biti rešeno pre prvog merge-a PR-a koji dira ove fajlove (W0-PR8, W0-PR9, W0-PR11). SAFE checklist (stavka o hotspot fajlovima) navodi iste fajlove, ali ne imenuje ulogu.

Kanonska lista uloga je Harness, Chat, Durable, Memory, Server, Boundary, Capability, Security, External-executor, Evolution, Model/Runtime, UX, Attention, Channels, Benchmark, Release i OSS/License owner. Founder odlučuje samo o decision queue-u i spoljnim kapijama. Sve ovo je PREDLOG (brief §15.3).

---

## 3. Harness i verifikacija

**Šta radi danas.** Harness faze vodi **model**: poziva alat `run_harness` i sam prijavljuje `phase_output.tool_calls`. Server nema phase executor (F-DUR-13). Stanje run-a živi u in-memory `Map`-i i ne preživljava restart.

**Ključni fajlovi** (svi postoje na `2af0904d`):

| Fajl | Uloga |
|---|---|
| `packages/agent/src/workflow-harness.ts` | `HarnessRunState` (`:110-128`), `PhaseStatus` (`:23`), `PhaseOutput.toolCalls` (`:76`), `advancePhase` state machine (`:213-374`), globalni `harnessEvents` (`:132`), `shouldSkipVerify` (`:474-482`) |
| `packages/agent/src/workflow-tools.ts` | alati `run_harness`/`compose_workflow` (`:84-119`, `:362-434`), `activeHarnessRuns` in-memory (`:447`), self-reported `phase_output` (`:330-358,412-422`) |
| `packages/agent/src/builtin-harnesses.ts` | deterministički gate helperi (`:13-89`), 3 ugrađena harnessa (`:94-259`, uključujući `code-review-fix` `:138`), `VERDICT` regex (`:125-128`), bash gate (`:181`) |
| `packages/agent/src/verification-gate.ts` | `VERIFICATION_TOOL_EXACT` (`:25-39`; `'run_harness'` na `:33`), D3 `assertsUnverifiedCompletion` (`:220-239`) |
| `packages/agent/src/loop-gates.ts` | D3 disclosure (`:902-935`), budget stop (`:697`) |
| `packages/agent/src/harness-trace-bridge.ts` | `harness:phase:complete` → `'verified'` (`:91`), `ok:true`/`durationMs:0` (`:125-148`), per-event context resolver (`:54-56,80-86`) |
| `packages/agent/src/trace-recorder.ts` | `completeToolCall` (`:142-166`); `ok:true` hardkodovan (`:281,288`) |
| `packages/agent/src/eval-dataset.ts` | `positiveOutcomes` (`:66,208`), `build()` sa secret scan-om i split-om (`:96-145,207-325`), `redactSecrets` (`:133`) |
| `packages/agent/src/system-tools.ts` / `system-tools-helpers.ts` / `tool-executor.ts` | exit code se opaža (`system-tools-helpers.ts:732-734`) pa odbacuje (`system-tools.ts:681-691`); `succeeded` (`tool-executor.ts:285-298`) |
| `packages/agent/src/task-shape.ts`, `workflow-composer.ts`, `capability-router.ts`, `feature-flags.ts` | `detectTaskShape` (`:145`) ne bira recipe; `composeWorkflow` (`:70,99-139`); `CapabilityRouter` (`:51-186`); `ADVANCED_WORKFLOWS` (`:14`), mrtav `VERIFIER_AUTO_RUN` (`:26`) |
| `packages/hive-mind-core/src/mind/execution-traces.ts`, `mind/schema.ts` | `TraceOutcome` (`:20`) sa `CHECK` (`execution-traces.ts:150-151`, `schema.ts:242-243`) |

**Šta plan menja.** W0-PR1..PR8 (G1): verify fail-closed, `VERDICT` vrednost, exit code, `run_harness` izbačen iz verifikacije, budget stop, istinitost bridge-a sa tagom `gate_passed` (MIG-04(A)), aditivni `runId`, označen self-reported dokaz. Redosled je obavezan: PR1 → PR8 → PR2/PR3 (Delivery plan W0 „Rizik”). W1-PR4 uvodi server-driven executor, a `run_harness` postaje tanki klijent. W1-PR7 donosi `ProofReceipt` i enum `gate_passed` kroz table-rebuild migraciju. W3-PR1..PR8 donosi router, recipe registry i validatore. Ugovori: FRD-05.1..05.8, [ADR-01](../decisions/2026-09-27-ADR-01-conversation-work-modes.md) (RAT-03 pre W3-PR2).

**Šta se čuva i zašto** ([harness.md §2](../plans/v1.2-evidence/phaseA/harness.md), 12 stavki). `advancePhase` je immutabilni state machine i osnova W1 executora. Gate helperi i 3 harnessa postaju „recipe v1” bez brisanja (W3). `run_id` scoping sprečava bleed između sesija. D3 disclosure put se čuva, isto kao server-observed ledger primitivi (`TraceRecorder`, `TurnToolActivity`), supervizor koji vidi exit code, `detectTaskShape` i `CapabilityRouter`. Advisory polja `allowedTools/requiresApproval/timeoutMs` (`workflow-harness.ts:47-68`) čuvaju semantiku za W1. Konfigurabilni `positiveOutcomes` omogućava isključivanje bez promene šeme. Razlog: BORROW iz sopstvenog koda (D-17), bez novog engine-a.

**Poznati defekti na `2af0904d`** (izvor: [harness.md](../plans/v1.2-evidence/phaseA/harness.md) + [harness.refute.md](../plans/v1.2-evidence/phaseA/harness.refute.md)):

| Nalaz | Status | Suština |
|---|---|---|
| F-HARN-01 | POTVRĐENO NA REVIZIJI | verify se preskače kad `WAGGLE_AUTO_VERIFY` nije postavljen, a `catch` vraća `true` |
| F-HARN-02 | POTVRĐENO NA REVIZIJI | regex prihvata `VERDICT: FAIL`; CONDITIONAL nema politiku |
| F-HARN-03 | POTVRĐENO NA REVIZIJI | bilo koji bash poziv prolazi kao test; exit code se gubi |
| F-HARN-04 | POTVRĐENO NA REVIZIJI | `run_harness` se računa kao verifikacioni alat |
| F-HARN-05 | POTVRĐENO NA REVIZIJI | budget stop isključuje D3 (`agent-loop.ts:1531`) |
| F-HARN-06 | POTVRĐENO NA REVIZIJI (refute WEAKENED za enum deo) | završena faza → `verified`; tool zapisi `ok:true/durationMs:0`; kontekst null |
| F-HARN-07 | DELIMIČNO/NEPOVEZANO | state je izolovan po `run_id`, eventi nisu |
| F-HARN-08 | POTVRĐENO NA REVIZIJI | gate čita dokaz koji je dao model |
| F-HARN-09 | DELIMIČNO/NEPOVEZANO | klasifikator postoji, harness bira model (W3, ne G1) |

**Testovi koji pinuju trenutno ponašanje** (putanje postoje):

| Test | Šta pinuje | Sudbina po planu |
|---|---|---|
| `packages/agent/tests/workflow-tools-harness.test.ts:135-179` | oslanja se na auto-skip verify | **ažurira se** u W0-PR1; `:82-106` preživljava W0-PR8 |
| `packages/agent/tests/harness-trace-bridge.test.ts:82-92,327` | `outcome === 'verified'` | **ažurira se** u W0-PR6; `:146-156` (`toContain`) preživljava aditivni `runId` |
| `packages/agent/tests/system-tools.test.ts:365-370` | `toContain('err')` | ne lomi se (W0-PR3) |
| `packages/agent/tests/verification-gate.test.ts` | D3 | dobija regresioni test (W0-PR4) |
| `packages/agent/tests/verification-gate-loop.test.ts` | D3 u petlji | RED za W0-PR5 |
| `packages/agent/tests/agent-loop-budget.test.ts` | exact asserti | ne lome se (ne matchuju `SUCCESS_ASSERTION`) |
| `packages/agent/tests/task-shape.test.ts`, `workflow-composer.test.ts`, `capability-router.test.ts`, `eval-dataset.test.ts`, `trace-recorder.test.ts` | pokrivenost modula | sadržaj nije čitan u ovom prolazu: pokreni ih pre i posle promene |

**Hotspot vlasnik:** Harness owner. `workflow-*` od W1 prelazi na Durable ownera. `execution-traces.ts`/`schema.ts` pripadaju Memory owneru (drift baseline).

---

## 4. Agent loop i chat ruta

**Tok** ([ARCHITECTURE.md](../ARCHITECTURE.md), „Chat Message Flow”): `POST /api/chat` → priprema turn-a (recall, persona, alati, governance) → `runAgentLoop()` → SSE eventi → završetak turn-a (signali, trace). Danas zatvaranje SSE socket-a **prekida** run (R3-008, namerno).

| Fajl | Uloga |
|---|---|
| `packages/agent/src/agent-loop.ts` | petlja; `budgetStopResponse` (`:895-920`), budget stop grana (`:1507-1550`, `enableVerification:false` `:1531`), AbortSignal (`:125-126,973-975,1090-1108,1458-1468`), poziv verification gate-a (`:1826`) |
| `packages/server/src/local/routes/chat.ts` | ruta; `resolvePersona` (`:439-440`), `systemPromptCache` (`:993`), „# User Corrections” (`:1485-1496`), socket close → abort (`:1604-1612`) |
| `packages/server/src/local/routes/chat-turn-preparation.ts` | recall (`:237`), `detectTaskShape` (`:381`), persona filter (`:454,530,553`), governance fail-closed (`:694-738`), CapabilityRouter (`:1101-1117`); ovde ulaze W3-PR2 router i W4-PR1 envelope |
| `packages/server/src/local/routes/chat-agent-run.ts` | SSE `step` kanal (`:155-199`), `onToolResult` (`:214-225`) |
| `packages/server/src/local/routes/chat-turn-completion.ts` | `analyzeAndRecordCorrection` (`:253-261`), `finalizeOnce` (`:371-383`) |
| `packages/server/src/local/routes/chat-approval-hook.ts` | approval hook; abort/timeout → `resolve(false)` (`:81,123`), deny (`:496-506`) |
| `packages/server/src/local/routes/chat-governance.ts` | `blockedTools` lanac, team-only (`:73-134`, `:87-89`) |
| `packages/server/src/local/routes/chat-turn-recall-context.ts`, `chat-turn-execution-trace.ts`, `chat-bounded-read-tools.ts` | recall render, per-turn trace, bounded read alati |
| `packages/server/src/local/chat-collaboration.ts` | subagent/collab tok (`:110-128,302-308`); leak u personal mind (`:802-814`) |
| `packages/agent/src/subagent-orchestrator.ts` | subagenti (čuvaju se, D-16) |
| `apps/web/src/components/os/apps/ChatApp.tsx`, `apps/web/src/hooks/useChat.ts` | „Stop generating” (`ChatApp.tsx:2428-2432`), obrada `step` eventa (`useChat.ts:925-948`) |

**Šta plan menja:** W0-PR5 (budget stop u disclose-only režimu + `budgetStop` meta), W0-PR8 (observed tool calls iz `chat-agent-run.ts`), W0-PR9 (resolver u `chat.ts`), W0-PR11 (leak u `chat-collaboration.ts`), W0-PR16 (copy za Stop), W1-PR9 (detach ≠ cancel za `work`; R3-008 ostaje samo za `conversation`; [ADR-03](../decisions/2026-09-27-ADR-03-detach-cancel-supersedes-r3-008.md), RAT-02), W2-PR1 (ContextBuilder oko postojećih pozivalaca recall-a), W3-PR2, W4-PR1/PR2 i W5-PR1 (`step` payload).

**Šta se čuva:** AbortSignal lanac (fetch, body read, između turnova), D3 disclosure bez novog turn-a, approval hook i governance lanac, SSE `step` kanal i `ActivityStream` (`aria-live`), subagenti bez novog „fusion” proizvoda (ODLUKA D-16). Chat ruta je razbijena na karakterisane kriške. **Pre izmene pročitaj „Safety Net Map” u [docs/TESTING.md](../TESTING.md)**: tamo je pinovano svako izdvojeno ponašanje `chat.ts`, sa poznatim QUIRK-ovima (npr. TD-CHAT-36, TD-CHAT-38).

**Poznati defekti:** F-HARN-05 i F-HARN-08 (POTVRĐENO NA REVIZIJI); F-DUR-06 (POTVRĐENO NA REVIZIJI, namerno ponašanje; refute WEAKENED za copy: postoji, ali ne kaže šta se gubi); F-DUR-12 (POTVRĐENO NA REVIZIJI; refute WEAKENED citat → `packages/server/tests/tools-routes-launch.test.ts:1148-1170`); F-EVO-01 (resolver u `chat.ts`, §8); F-HM-05 (leak iz `chat-collaboration.ts`, §6).

**Testovi koji pinuju:** `packages/agent/tests/agent-loop.test.ts:1981-2010` (abort), `packages/agent/tests/agent-loop-budget.test.ts`, `packages/agent/tests/verification-gate-loop.test.ts`, `packages/server/tests/local/chat-approval-hook-characterization.test.ts`, `packages/server/tests/local/chat-approval-timeout.test.ts`, `packages/server/tests/local/chat-agent-run-characterization.test.ts`, `packages/server/tests/local/persona-acceptance-prompt-budget.test.ts` (rizik za W4: menja se tool set u promptu), plus kompletna lista karakterizacija u TESTING.md.

**Hotspot vlasnik:** `agent-loop.ts`/`loop-gates.ts` → Harness owner. `chat.ts`, `chat-*.ts`, `chat-collaboration.ts` → Harness/Chat owner po DP-0.14, dok wave redovi navode Chat owner (otvoreno pitanje, §2).

---

## 5. Durable: run registar, cron/rutine, held actions

**Šta radi danas.** `AgentRunRegistry` je trajan zapis room/worker run-ova sa event logom, u whole-file JSON-u. Na restartu **svi** aktivni interni run-ovi postaju terminalno `interrupted` i ne postoji resume (F-DUR-01, test to asertuje). Rutine idu preko `CronStore` + `LocalScheduler`, a held actions preko `pending_actions`.

| Fajl | Uloga |
|---|---|
| `packages/server/src/local/agent-run-registry.ts` | `MAX_EVENTS=2_000` (`:29`), `ALLOWED_TRANSITIONS` (`:41`), pid reconcile za eksterne alate (`:381-395`), `interruptInFlightInternalRuns` (`:510-520`), `version!==1` → prazan store (`:510-537`), atomic tmp+rename sa Windows retry-em (`:539-574`) |
| `packages/server/src/local/routes/agent-runs.ts` | `/api/agent-runs/events?since=` + `/snapshot` + `/:id/control` (`:61-116`), zod enum (`:15`), `since`/`resetRequired` (`:20-22,73-84`) |
| `packages/shared/src/types.ts` | `COLLABORATION_RUN_STATUSES` (`:398-405`), `AGENT_RUN_STATES` (`:381-384`, ne mapira se na run status), `Automation.status` (`:777`) |
| `packages/server/src/local/fleet-run-executor.ts`, `routes/fleet.ts`, `routes/agents.ts`, `routes/agent-groups.ts` | fleet i saved-agent run-ovi (spawn 202, abort `:480-515`, persona snapshot `:589-591`) |
| `packages/agent/src/long-task/checkpoint.ts`, `long-task/recovery.ts`, `packages/agent/src/retrieval-agent-loop.ts` | `CheckpointStore` (`CHECKPOINT_SCHEMA_VERSION=1`), `RecoveryRunner` (0 produkcionih pozivalaca), cross-process resume retrieval petlje |
| `packages/server/src/local/held-action-executor.ts` | atomic claim; ADR komentar „never mid-run suspend/resume” (`:6-10`); pad između `approved` i izvršenja ostavlja `approved` zauvek (`:233-235`) |
| `packages/core/src/cron-store.ts` | `PendingActionRow` (`:88-100`), `computeNextRun`/`getDue` (`:203-206,367-382,442-447`), held queue (`:505-586`) |
| `packages/server/src/local/cron.ts` | `LocalScheduler` (`:19,90`), tick i lease (`:245-314,366-389`) |
| `packages/server/src/local/loop-executor.ts` | Loop L1/L2 (TOOLLESS maker, judge gate, jedan held predlog; `:212-230,311-322`) |
| `packages/hive-mind-core/src/mind/awareness.ts` | `toContext()` (`:142-168`) renderuje `- Loop: <name>` u recall |
| `packages/server/src/local/routes/automations.ts`, `routes/cron.ts`, `apps/web/src/components/os/apps/AutomationCenterApp.tsx` | `/api/automations*` (emituje samo `active|paused`, `:128-148`); Automation Center UI |
| `apps/web/src/components/os/apps/RoomApp.tsx`, `apps/web/src/lib/room-state-reducer.ts`, `apps/web/src/components/os/apps/ApprovalsApp.tsx` | UI konzumenti statusa i held queue-a (`RoomApp.tsx:51-66`, `ApprovalsApp.tsx:182,301`) |
| `packages/server/src/local/index.ts` | executor za 8 `job_type`-ova (`:1913-2706`), Loop producent (`:2588-2648`), `memory_compact` (`:2033-2058`); `setup-crons.ts:35` `30 3 * * *` |

**Šta plan menja.** W0-PR14 (RED repro za `getDue` ISO-vs-`datetime('now')`), W0-PR19 (golden legacy-datadir fixture; putanja `tests/fixtures/legacy-datadir/` je PREDLOG, generator NEPOZNATO do dizajna) i ceo W1: PR1 spike (Reflow vs minimalni BUILD) → PR2 run store → PR3 mapa statusa → PR4 executor → PR5 lease/fencing → PR6 `ToolAction`/`ToolAttempt` → PR7 `ProofReceipt` → PR8 per-run bus → PR9 detach → PR10 Loop state → PR11 rutine → PR12 crash-injection (dev) → PR13 MIG-09 runner → PR14 export/erasure → PR15 `revocations.json`. Zatim W5-PR2/PR3 (UI statusi i Routines blok). Ugovori: FRD-02.1..02.5, FRD-04.x, FRD-09.3..09.5; [ADR-02](../decisions/2026-09-27-ADR-02-durable-store-phase-resume-action-idempotency.md) i ADR-03 (RAT-02 pre W1-PR2 merge-a), [ADR-07](../decisions/2026-09-27-ADR-07-routines-vs-toolless-loops.md) (RAT-06 pre W1-PR11); migracije MIG-01, MIG-02, MIG-08, MIG-09. Rizik je **VISOK** (Delivery plan W1): PR4 ide iza feature flag-a.

**Šta se čuva i zašto** ([durable.md §2](../plans/v1.2-evidence/phaseA/durable.md)). `AgentRunRegistry` ostaje adapter, a API `/api/agent-runs/*` se zadržava. Čuvaju se i atomic persist obrazac, pid reconcile (presedan za preživljavanje restarta), `CheckpointStore`/`RecoveryRunner` (BORROW), held-action atomic claim (polazna tačka za DIR-06), AbortSignal lanac, CronStore sa leases/5-strike/history, Loop L1/L2 TOOLLESS, Automation Center i dnevni spend ledger. `COLLABORATION_RUN_STATUSES` se **ne skraćuje**: zod enum, `RoomApp.tsx` i `routes/agents.ts:149-160` zavise od njega (FRD-02.12). „L2 assist stays TOOLLESS” je ISTORIJSKA FOUNDER ODLUKA (memorija, 2026-06-29), usklađena sa brief §11.5/C15.

**Poznati defekti** ([durable.md](../plans/v1.2-evidence/phaseA/durable.md), [durable.refute.md](../plans/v1.2-evidence/phaseA/durable.refute.md)):

| Nalaz | Status |
|---|---|
| F-DUR-01 restart → terminalno `interrupted` | POTVRĐENO NA REVIZIJI |
| F-DUR-02 whole-file JSON, bez migracije/retencije | POTVRĐENO NA REVIZIJI (refute WEAKENED: `resetRequired` false grana je testirana) |
| F-DUR-03 10 stanja, `paused` bez semantike | POTVRĐENO NA REVIZIJI |
| F-DUR-04 checkpoint/recovery nepovezani | DELIMIČNO/NEPOVEZANO |
| F-DUR-05 held actions bez `unknown_outcome` i provider ključa | POTVRĐENO NA REVIZIJI; DELIMIČNO za DIR-06 |
| F-DUR-06 socket close abortuje run | POTVRĐENO NA REVIZIJI (namerno, R3-008) |
| F-DUR-07 per-run budžet ne postoji u checkpoint-u | DELIMIČNO/NEPOVEZANO |
| F-DUR-08 `harnessEvents` bez `runId` | POTVRĐENO NA REVIZIJI |
| F-DUR-09 Loop state u Awareness ulazi u recall | POTVRĐENO NA REVIZIJI (refute HOLDS+) |
| F-DUR-10 misfire implicitan, lease bez fencing-a, nema timezone; hipoteza da `getDue` ne vraća ništa | POTVRĐENO NA REVIZIJI (politika); NALAZ AUDITA — ZA PROVERU (`getDue` probe, W0-PR14); NEPOZNATO (DST) |
| F-DUR-11 Automation Center već pokriva većinu | POTVRĐENO NA REVIZIJI; DELIMIČNO za „blokada” |
| F-DUR-12 background vezan za roditeljski turn | POTVRĐENO NA REVIZIJI |
| F-DUR-13 nema server-driven executora | POTVRĐENO NA REVIZIJI (odsustvo) |
| F-DUR-14 TD-CHAT-46 ledger anchor zastareo (`docs/TECH-DEBT.md:65`) | VEĆ ZATVORENO (kod) + NALAZ AUDITA — ZA PROVERU (ledger); ide u W0-PR15 |

**Testovi koji pinuju:**

| Test | Šta pinuje | Sudbina |
|---|---|---|
| `packages/server/tests/local/agent-run-registry.test.ts:84-94` | terminalna semantika `interrupted` | ostaje: resume ide kroz eksplicitan API (W1-PR5), ne kroz izmenu `ALLOWED_TRANSITIONS` |
| `packages/server/tests/local/agent-run-registry.test.ts:104-105` | `resetRequired` false grana | ostaje; nedostaju overflow i corrupt-load testovi (W1-PR2) |
| `packages/server/tests/local/cron-scheduler-hardening.test.ts:227-250` | lease/sweep | ne asertuje `next_run_at` → ne lomi se (W0-PR14) |
| `packages/server/tests/local-scheduler.test.ts`, `packages/server/tests/local/cron-error-handling.test.ts`, `packages/server/tests/local/automations.test.ts`, `packages/core/tests/cron-store.test.ts` | scheduler, greške, alias sloj, store | nijedan ne vežba realan `create()→getDue()` (zato postoji W0-PR14 RED) |
| `packages/server/tests/local/loop-executor.test.ts` | L1/L2 | regresija za W1-PR10 |
| `packages/agent/tests/long-task-loop-integration.test.ts:221-330` | cross-process resume (jedinica = LLM turn) | BORROW referenca za W1 |
| `packages/server/tests/tools-routes-launch.test.ts:1148-1170` | eksterni run preživljava restart | presedan za W1-PR9 |
| `packages/server/tests/local/held-action-executor.test.ts`, `packages/server/tests/local/approval-held.test.ts` | held queue | proširuju se u W1-PR6 |
| `apps/web/src/test/phase3b-automation-center.test.tsx`, `apps/web/src/lib/room-state-reducer.test.ts` | UI | regresija za W5 |
| `packages/server/tests/local-mode.test.ts:1067-1075` | dnevni spend preživljava restart | ostaje |

**Hotspot vlasnik:** Durable owner (`cron-store.ts`, `cron.ts`, `workflow-*` od W1). `local/index.ts` → Server owner. Kod detach-a u `chat.ts` → Chat owner.

---

## 6. Hive Mind: recall, prompt assembler, hookovi, memory MCP, eksterni izvršioci

**Šta radi danas.** `recallMemory` je 7-lane engine sa RAWDETAIL lane-om. Ima pin testove i LoCoMo 86.49% pinovan offline (`benchmarks/results/locomo-sota-2026-06/recount.mjs`, EXPECT 1332/1540; status „SOTA” = NALAZ AUDITA — ZA PROVERU). Nema `ContextPackage`/`ContextBuilder`/`WAGGLE_CONTEXT_INJECTED` (F-HM-08). Workspace run sažeci cure u personal mind na **četiri** mesta (F-HM-05).

| Fajl | Uloga |
|---|---|
| `packages/agent/src/orchestrator.ts` | `recallMemory` (`:582-978`), isključenje `temporary`/`deprecated` (`:728-737`), render linija (`:839-856`), RAWDETAIL čitač (`:873`), reranker default ON (`:70-86,554-580`), zastareo komentar (`:106-109`) |
| `packages/agent/src/prompt-assembler.ts` | W4.5 single-render recall bloka (`:433-457`), `FRAME_LIMITS` (`:118,165-169,369-489`) |
| `packages/agent/src/context-loader.ts` | isključenje `temporary` (`:77-89`) |
| `packages/agent/src/tools.ts` | `save_memory` B1 guardrail i cross-mind dedup (`:405-515`) |
| `packages/hive-mind-core/src/hook-runtime.ts` | write put: scoped `resolveMind`, ingress guard, dedup (`:121-225`); read put `recallHookFrames` (`:227-258`) filtrira **samo** `deprecated` |
| `packages/hive-mind-core/src/memory-ingress-guard.ts`, `injection-scanner.ts` | `evaluateExternalMemoryIngress`, `scanForInjection` |
| `packages/hive-mind-core/src/multi-mind.ts`, `workspace-manager.ts` | personal/workspace minds; layout `workspaces/<id>/` |
| `packages/hive-mind-core/src/mind/frames.ts` | content-hash dedup (`:109-111,289-294`), `compact()`: TTL `temporary` 30 d, `deprecated` 90 d (`:404-483`, `:427-433`) |
| `packages/hive-mind-core/src/mind/raw-detail-lane.ts`, `mind/inprocess-reranker.ts`, `harvest/raw-turns.ts` | RAWDETAIL (kill switch `WAGGLE_RAWDETAIL`) i reranker (`WAGGLE_RERANKER=0`) |
| `packages/hive-mind-hooks-core/src/handlers-core.ts`, `packages/hive-mind-hooks-claude-code/src/hooks/session-start.ts` | hook lifecycle (recall+inject `:77-90`, PreCompact `:237`); claude-code ima sopstvene kopije (`session-start.ts:46-60`) |
| `packages/hive-mind-shim-core/src/cli-bridge.ts` | `WAGGLE_WORKSPACE_ID` → aktivni workspace (`:240,404-408`) |
| `packages/memory-mcp/src/**`, `packages/hive-mind-mcp-server/src/**` | dva živa MCP servera; `erase` postoji samo u jednom (F-HM-17; spajanje ODLOŽENO, FRD-07.9) |
| `packages/server/src/local/executor-brief.ts` | bounded, redigovan, skeniran brief sa hash-om (`:46-154`) |
| `packages/server/src/local/routes/external-tool-runs.ts` | `/api/tools/run` (`attribution.briefHash` `:103`), self-reported `toolsUsed` (`:922-932`), `recordResultToMinds` (`:941-1005`, leak `:964-977`) |
| `packages/agent/src/external-process-env.ts`, `external-tool-runner.ts`, `tool-launcher.ts` | fail-closed env allowlist (`:29-35`, `WAGGLE_RUN_ID` već na `:31`), redakcija u event tekstu |
| `packages/server/src/local/routes/route-proposals.ts` | jedini put koji danas predaje brief eksternom izvršiocu (`:205-211`) |
| `packages/weaver/src/consolidation.ts`, `packages/server/src/local/memory-lane-cron.ts`, `packages/server/src/local/dream-journal.ts` | konsolidacija i dedup; `memory_compact` zapis (`dream-journal.ts:75-77`) |
| `scripts/oss-drift-check.mjs`, `scripts/oss-drift-baseline.json` | OSS drift gate (nije u CI) |

**Šta plan menja.** G1: W0-PR10 (hook read path trio: isključi `temporary`, skeniraj po hitu, rediguj tajne), W0-PR11 (leak na 4 mesta + redefinicija fleet policy gate-a `fleet-run-executor.ts:101-106`), W0-PR15 (samo komentar `:106-109`), W0-PR18 (MIG-05(i): oznaka `metadata.recallExcluded`, **nikad** `importance='temporary'`, jer bi je noćni `compact()` obrisao; tačni fajlovi NEPOZNATO do dizajna). G2: W2-PR1..PR10. Ključno: **W2-PR3 menja bajtove recall bloka**, pa LoCoMo same-judge kontrola mora proći pre merge-a (procesni gate, DQ-04 budžet). Ugovori: FRD-02.7, FRD-07.1..07.9; [ADR-05](../decisions/2026-09-27-ADR-05-rawdetail-context-hook-precedence.md) (RAT-04 pre W2-PR1; W0-PR10/PR11/PR18 ne čekaju); MIG-04, MIG-05, MIG-08.

**Šta se čuva i zašto.** `recallMemory` **ostaje engine** i samo se omotava. To je ODLUKA D-12 („bez ponovnog pisanja memorijskog engine-a”) i DIR-09. Čuvaju se i izolacija minds (D-12, AT-13), RAWDETAIL, reranker, executor brief, fail-closed env, write-side ingress guard, workspace layout, extraction dedup i izolacioni pin testovi ([hivemind.md §2](../plans/v1.2-evidence/phaseA/hivemind.md)). Svaka promena u `packages/hive-mind-core/**` prvo pada ovde, a mirror dobija curated forward-port kasnije (`CLAUDE.md` §7.5). Pre bilo kog hive-mind release-a pokreni `node scripts/oss-drift-check.mjs <mirror>`. Stanje na reviziji: exit 1, 22 blockera, 3 unreviewed (F-REL-07).

**Poznati defekti** ([hivemind.md](../plans/v1.2-evidence/phaseA/hivemind.md), [hivemind.refute.md](../plans/v1.2-evidence/phaseA/hivemind.refute.md)):

| Nalaz | Status |
|---|---|
| F-HM-01 RAWDETAIL aktivan, indeksira samo harvest; reranker se ne bundluje | POTVRĐENO NA REVIZIJI; offline posledica NALAZ AUDITA — ZA PROVERU (W2-PR9) |
| F-HM-02 hookovi čuvaju prompt kao `temporary` | POTVRĐENO NA REVIZIJI (refute WEAKENED: `compact` postoji, S1 „nema compact” pobijeno) |
| F-HM-03 `temporary` isključen na Waggle strani, a na hook/MCP strani nije | DELIMIČNO/NEPOVEZANO |
| F-HM-04 hook read path ne skenira | POTVRĐENO NA REVIZIJI |
| F-HM-05 leak workspace → personal na 4 mesta | POTVRĐENO NA REVIZIJI (WEAKENED na nivou minimalChange: policy gate + ≥5 testova) |
| F-HM-06 trust labele nisu u render liniji | POTVRĐENO NA REVIZIJI (WEAKENED) |
| F-HM-07 token budžet samo na assembler nivou | DELIMIČNO/NEPOVEZANO |
| F-HM-08 nema `ContextPackage`; moguća dupla injekcija | POTVRĐENO NA REVIZIJI |
| F-HM-09 engine sa 7 lane-ova (asset) | POTVRĐENO NA REVIZIJI |
| F-HM-10 fleet/harness/subagent bez multi-lane recall-a | DELIMIČNO/NEPOVEZANO |
| F-HM-11 handoff samo na route-proposal putu | DELIMIČNO/NEPOVEZANO |
| F-HM-12 run id ne stiže u hook frejmove | DELIMIČNO/NEPOVEZANO |
| F-HM-13 key leakage (jedna rupa) | POTVRĐENO NA REVIZIJI |
| F-HM-14 eksterni `toolsUsed` je self-reported | DELIMIČNO/NEPOVEZANO |
| F-HM-15 LoCoMo gate pre merge-a ne postoji | DELIMIČNO/NEPOVEZANO (po refuteru; ručni proces, nema CI gate-a) |
| F-HM-16 nema dedup ključa `(runId, outputHash)` | DELIMIČNO/NEPOVEZANO |
| F-HM-17 dva MCP servera | POTVRĐENO NA REVIZIJI; spajanje ODLOŽENO |
| F-HM-18 nema checkpoint-vezanog konteksta | DELIMIČNO/NEPOVEZANO |

**Testovi koji pinuju:**

| Test | Sudbina |
|---|---|
| `packages/server/tests/local/external-tool-runs.test.ts:259`, `packages/server/tests/local/agent-groups.test.ts:362`, `packages/server/tests/local/fleet-isolation.test.ts:203,496-525` | **pinuju leak kao poželjan: lome se i prepisuju u W0-PR11** (`fleet-isolation.test.ts:519-522` preživljava ako label ostane) |
| `packages/hive-mind-core/tests/hook-runtime.test.ts:126-137` | ne pinuje uključivanje `temporary` → bezbedno za W0-PR10 |
| `packages/hive-mind-hooks-claude-code/tests/hooks/session-start.test.ts` (+ codex/cursor/hermes varijante), `packages/hive-mind-hooks-core/tests/handlers-core.test.ts` | NALAZ AUDITA — ZA PROVERU: možda pinuju tačan string injekcije |
| `packages/agent/tests/r2-recall-closure.test.ts:27-40` | pinuje isključenje `temporary` u Waggle recall-u; ostaje |
| `packages/agent/tests/w46-rawdetail-recall.test.ts`, `w41-temporal-recall.test.ts`, `orchestrator-recall-hardening.test.ts`, `packages/hive-mind-core/tests/mind/raw-detail-lane.test.ts` | engine pinovi; ostaju zeleni kroz W2 |
| `packages/agent/tests/orchestrator-memory-boundary-pins.test.ts`, `packages/server/tests/local/memory-stats-isolation.test.ts`, `packages/agent/tests/subagent-isolation.test.ts` | izolacija; ostaju, sentinel AT-13 se dodaje |
| `packages/server/tests/local/executor-brief.test.ts`, `packages/hive-mind-shim-core/tests/cli-bridge.test.ts`, `packages/hive-mind-core/tests/mind/erasure.test.ts` | handoff, workspace env, erasure; regresija za W2-PR2/PR6 |
| `vitest.setup.ts:25-26` | reranker je **OFF u testovima**: rezultati testova nisu isto što i produkcioni recall |

Phase-A nije izvršio ove testove (repo read-only). Komanda koju phase-A preporučuje za prvi prolaz je u [hivemind.md §3](../plans/v1.2-evidence/phaseA/hivemind.md).

**Hotspot vlasnik:** `orchestrator.ts`/`prompt-assembler.ts`/`hive-mind-core/**` → Memory owner. `chat-turn-preparation.ts` → Chat owner. `external-*.ts` → External-executor owner.

---

## 7. Sposobnosti: capability resolver, marketplace, konektori, approvals, IM kanali

**Šta radi danas.** Postoje četiri nezavisna engine-a bez fasade (F-CAP-11) i nijedan ne filtrira po dozvolama pre rangiranja (F-CAP-01). Install put je već ograničen: starter-pack i marketplace predlog idu iza `install_capability` ALWAYS_CONFIRM + SecurityGate (F-CAP-06). Approval stack postoji i testiran je. Approve preko IM kanala je dokumentovano „Not in v1” (`docs/plans/CHANNELS-ARC-2026-07-09.md:23`).

| Fajl | Uloga |
|---|---|
| `packages/agent/src/capability-acquisition.ts` | `searchCapabilities` (`:187`), `CapabilityCandidate` (`:27-36`), sort (`:299-311`), `validateInstallCandidate` (`:447`) |
| `packages/agent/src/capability-router.ts` | unknown-tool fallback (poziva se iz `tool-executor.ts:143-151`) |
| `packages/server/src/local/routes/agent-search.ts` | `scoreConnectors` (`:56`), „D3” komentar (`:79`; S1 je pogrešno citirao `apps/web/src/lib/agent-search.ts:81`), merge (`:158`) |
| `packages/agent/src/skill-tools.ts` | `install_capability` (`:484-580`), skill promocija koja se uvek odbija (`:755-765`) |
| `packages/server/src/local/persona-tool-filter.ts` | `applyPersonaToolFilter`/`filterMcpToolsForPersona` (`:98-153`) |
| `packages/agent/src/confirmation.ts`, `trust-model.ts` | approval klasifikacija (`confirmation.ts:337-358`), `assessTrust` |
| `packages/server/src/local/routes/capability-proposals.ts` | server-issued proposal store, claim-once, TTL (`:35-101,232-268`) |
| `apps/web/src/components/os/apps/chat-blocks/CapabilityRequestCard.tsx`, `capability-request-parser.ts` | kartica: za connector/mcp vraća `null` (`:94-99`); HTML komentar se parsira regex-om |
| `packages/server/src/local/routes/oauth.ts` | loopback OAuth, CSRF `state` (`:64-71,137-150,200-209,290-311`); **bez PKCE i bez vezivanja za run** |
| `packages/server/src/local/routes/approval.ts`, `approval-grants.ts`, `held-action-executor.ts`, `routes/chat-approval-hook.ts` | `/api/approval/*` (nije tier-gated), `ApprovalGrantStore.revoke` (`approval-grants.ts:286`), `DELETE /api/approval/grants/:id` (`approval.ts:120`) |
| `packages/server/src/local/command-registry.ts` | zatvoren `ACTION_REGISTRY` (4 akcije, `:108-192`), samo za NL command bar |
| `packages/marketplace/src/installer.ts`, `security.ts`; `routes/marketplace.ts`, `routes/mcps.ts`, `routes/connectors.ts` | install + SecurityGate + audit |
| `packages/agent/src/connector-registry.ts`; `packages/agent/src/connectors/{gmail,gcal,outlook,slack}-connector.ts`; `packages/server/src/local/connector-harvest.ts` | konektori (E2E nije proveren: DELIMIČNO); injection scan na ingest (`connector-harvest.ts:189-191`) |
| `packages/server/src/local/channels/{manager,pairing,chat-client,routes}.ts` | IM: deny-by-default, `/pair`, pairing kod in-memory (`pairing.ts:95-123`), `APPROVAL_NEEDED_REPLY` (`chat-client.ts:11-13`) |
| `packages/core/src/install-audit.ts`, `packages/core/src/vault.ts` | install audit trail; vault (`:286` kuka za revocation ledger, W1-PR15) |
| `THREAT_MODEL.md` (koren) | 175 linija; ne pokriva inline install granicu, MCP binary, egress profile ni PostHog (NALAZ AUDITA — ZA PROVERU, W4-PR7) |

**Šta plan menja:** W4-PR1..PR7 u G2 (envelope, fasada `filterCandidates` pre `sort`, tipizovan `CapabilityRequest`, `BLOCKED_CAPABILITY` resume, OAuth state + PKCE, negativni grant i revoke test, dopuna THREAT_MODEL), W4-PR8 u G3 (`ActionDescriptor`), W7-PR1..PR7 u G3 (WorkItem, sync; zavisi od DQ-06), W8-PR3/PR4 u G3 (Telegram approve token, PREDLOG uslovno od DQ-07). Ugovori: FRD-06.x, FRD-09.1/09.2, FRD-11.2; [ADR-04](../decisions/2026-09-27-ADR-04-inline-capability-oauth.md) (RAT-07 pre W4-PR3). Nova trajna W4 store-a moraju od prvog dana imati MIG-06/MIG-08 mapiranje, inače PR ne prolazi.

**Šta se čuva i zašto** ([capability.md §2](../plans/v1.2-evidence/phaseA/capability.md), 16 stavki). Engine-i ostaju, a spaja ih samo **ugovor** (fasada, DIR-11), ne fizičko spajanje. Instalacija ostaje u Settings uz SecurityGate. Čuvaju se i approval stack, governance lanac (team-only, ne pomera se u „tier” stepenicu), injection defense, pairing/allowlist format (`channels.json`) i zabrana fabrikacije u `behavioral-spec.ts:303-317`. D-10 kaže: inline ne znači da se OAuth ili tajne obrađuju u LLM tekstu. D-01 kaže: Approvals su core za pojedinca.

**Poznati defekti:** F-CAP-01 (POTVRĐENO NA REVIZIJI), F-CAP-02 (POTVRĐENO NA REVIZIJI, uz korekciju putanje), F-CAP-03 (POTVRĐENO kao činjenica / DELIMIČNO kao defekt), F-CAP-04 (DELIMIČNO/NEPOVEZANO), F-CAP-05 (po podstavci; hook read path vraća `temporary` = nova rupa), F-CAP-06 (DELIMIČNO), F-CAP-07 (POTVRĐENO NA REVIZIJI: Approvals i cost iza TEAMS-a), F-CAP-08 (DELIMIČNO/NEPOVEZANO), F-CAP-09 (VEĆ ZATVORENO delimično: expiry i revoke postoje, decline je one-shot), F-CAP-10 (POTVRĐENO, namerno isključeno u v1), F-CAP-11 i F-CAP-12 (POTVRĐENO NA REVIZIJI), F-CAP-13 (DELIMIČNO/NEPOVEZANO).

**Testovi koji pinuju** (broj `it(` po phase-A): `packages/agent/tests/capability-acquisition.test.ts` (20), `packages/agent/tests/capability-acquisition-trust.test.ts` (13; `:126` zaključava da `trust` ne utiče na rang), `packages/marketplace/tests/installer-security.test.ts` (40; `:825` provenance), `packages/server/tests/local/capability-proposals.test.ts` (9), `packages/server/tests/routes/approval-flow.test.ts` (4), `packages/server/tests/local/approval-held.test.ts` (14), `packages/server/tests/local/held-action-executor.test.ts` (18), `packages/server/tests/local/chat-approval-timeout.test.ts` (4), `packages/server/tests/local/chat-approval-hook-characterization.test.ts` (15), `packages/server/tests/local/oauth-callback-escaping.test.ts` (2), `packages/server/tests/channels-manager.test.ts` (22), `packages/server/tests/channels-pairing.test.ts` (13), `packages/server/tests/routes/connectors-tier.test.ts:13-29` (konektori nisu paywall-ovani), `packages/server/tests/local/connector-registry-integration.test.ts`, `packages/agent/tests/trust-model.test.ts`, `packages/agent/tests/injection-scanner.test.ts`, `apps/web/src/test/pr4-agent-search.test.tsx`. Test „nema vault vrednosti u system promptu/trace-u”: NEPOZNATO da li postoji (W4-PR7).

**Hotspot vlasnik:** Capability owner. `oauth.ts`/`approval-*` → Security owner. `tool-executor.ts` → Harness owner. `chat-turn-preparation.ts` → Chat owner. `channels/*` → Channels owner. `connector-harvest.ts`/`connectors/*` → Attention owner.

---

## 8. Evolution / GEPA

**Šta radi danas.** GEPA deploy upisuje persona override na disk, ali ga chat **ne vidi**. `listPersonas()` vraća `[...PERSONAS, ...custom]`, a `resolvePersona` uzima prvi pogodak, dakle ugrađenu personu (F-EVO-01, repro [`repro-shadow.mjs`](../plans/v1.2-evidence/phaseA/repro-shadow.mjs)). Behavioral-spec override put **radi** (F-EVO-11). Mapa „ko poziva → šta proizvodi → gde se čuva → naredni run” je u FRD-08.1.

| Fajl | Uloga |
|---|---|
| `packages/agent/src/personas.ts`, `persona-data.ts`, `custom-personas.ts`; `packages/server/src/local/routes/personas.ts` | `listPersonas` (`:67-70`); custom loader sa zaštitom ugrađenih ID-eva (`custom-personas.ts:34-70`; 409/403 u `routes/personas.ts:72-74,208-210`); deploy tu zaštitu namerno zaobilazi |
| `packages/agent/src/evolution-deploy.ts` | persona writer/rollback (`:68-135,277-305`; rollback 0 pozivalaca), behavioral-spec deploy (`:184-259`) |
| `packages/agent/src/evolution-orchestrator.ts`, `evolution-llm-wiring.ts`, `iterative-optimizer.ts`, `compose-evolution.ts`, `evolve-schema.ts`, `evolution-gates.ts` | running judge + GEPA guard (`evolution-llm-wiring.ts:415-452`, `iterative-optimizer.ts:173-184`), `EvolutionTarget` enum (`iterative-optimizer.ts:88-93`), zastareo komentar (`:393-397`), `frozenSchema` se ne prosleđuje (`compose-evolution.ts:191-196`), gates (`evolution-gates.ts:99-135`) |
| `packages/agent/src/eval-dataset.ts` | `build()` bez produkcionog pozivaoca; orkestrator koristi `sourceFromTraces` (`evolution-orchestrator.ts:319-325`) |
| `packages/agent/src/agent-learning.ts`, `improvement-wiring.ts`, `improvement-detector.ts` | `AgentLearning` (0 pozivalaca), `processInteractionForImprovement` (0), `analyzeAndRecordCorrection` (živ, `:81-98`) |
| `packages/server/src/local/routes/evolution.ts`, `packages/server/src/local/services/evolution-service.ts`, `routes/feedback.ts` | deploy (`:51-82`), targets (`:228-240`), baseline (`:259,269-284`), SSE run (`:437-488`); opt-in daemon (`WAGGLE_EVOLUTION_AUTO_ENABLED`); thumbs-down → signal (`feedback.ts:91-94`) |
| `packages/hive-mind-core/src/mind/evolution-runs.ts`, `improvement-signals.ts`, `execution-traces.ts` | `EvolutionRunStatus` sa `CHECK` (`:23-28,95-96`), `markCorrected` (0 pozivalaca, `:473-490`) |
| `apps/web/src/components/os/apps/memory/EvolutionTab.tsx` | „deployed/score-verified” copy (`:191-249,759-771,883`), statični disclaimer troška (`:1296`) |
| `packages/server/src/local/fleet-run-executor.ts:127,589-591`, `routes/agent-groups.ts:87`, `routes/fleet.ts:354` | isti `find()` obrazac; fleet persona snapshot = presedan za „run ostaje na svojoj verziji” |

**Šta plan menja.** W0-PR9 (G1): `listPersonas()` kao Map po `id` sa custom na kraju, isti resolver na svih 5 mesta, **zatim** F-EVO-10 activation check (`written_not_active`) u istom PR-u. Redosled je obavezan jer `evolution-routes.test.ts:169-188` pinuje `deployed`. W3e-PR1..PR8 u G2: active-version pointer + rollback ruta + `rolled_back` (CHECK rebuild, MIG-03), `EvolutionLLM` preko router-a, paired scoring + drift watch, `build()` sa holdout-om, lokalni evaluator + consent + cap + abort, EvolveSchema wire-or-drop, learning wiring, route test. W3e-PR9a..e je bounded recipe evolution i zavisi od ODB-02 (ako se ne odobri: ODLOŽENO). Ugovori: FRD-08.x; [ADR-06](../decisions/2026-09-27-ADR-06-active-override-promotion-rollback.md) (RAT-05 pre W3e-PR1). Svaki W3e PR menja persona resolution, pa traži novi **P** (persona) receipt pre F2.

**Šta se čuva i zašto** ([evolution.md §2](../plans/v1.2-evidence/phaseA/evolution.md)): running judge i GEPA guard (F-EVO-03 VEĆ ZATVORENO za produkcione putanje), behavioral-spec pipeline (radi), `EvolutionRunStore` audit trail, gates, `EvalDatasetBuilder.build()`, atomic override writer, custom persona zaštita, živi tok korekcija → `# User Corrections`, `ExecutionTraceStore`, opt-in daemon (nikad auto-deploy), SSE progres i fleet snapshot. D-13: evolution je deo teze proizvoda i ne svodi se na demo.

**Poznati defekti:** F-EVO-01, -02, -04, -05, -06, -07, -08, -10: POTVRĐENO NA REVIZIJI (F-EVO-07 repro: `sk-ant-…` ključ je stigao do judge-a; F-EVO-08 ima jednu WEAKENED pod-tvrdnju). F-EVO-03 i F-EVO-11: VEĆ ZATVORENO / radi. F-EVO-09: POTVRĐENO (mrtav kod) + DELIMIČNO/NEPOVEZANO; refute je pobio pod-tvrdnju „samo thumbs-down”, jer tekstualne korekcije već proizvode signale. F-EVO-12: DELIMIČNO/NEPOVEZANO. NEPOZNATO: produkcioni pozivalac `markSurfaced` (W3e-PR7).

**Testovi koji pinuju:**

| Test | Sudbina |
|---|---|
| `packages/server/tests/evolution-routes.test.ts:169-188` (i `:184-188` disk-only assert) | pinuje `deployed`: redosled F-EVO-01 → F-EVO-10 u W0-PR9 |
| `packages/agent/tests/evolution-deploy.test.ts:116` | predikat koji je propustio F-EVO-01; RED za AT-04 ide kroz `resolvePersona`/`buildSystemPrompt`, ne kroz `find(includes)` |
| `packages/agent/tests/personas.test.ts:43-47`, `packages/server/tests/local/personas-routes.test.ts:121-140` | ne lome se |
| `packages/agent/tests/compose-evolution.test.ts:342-371` (i `:223,370`) | **lomi se** ako se `combinedDelta` ukloni; plan ga zadržava kao polje (W3e-PR3/PR6) |
| `packages/server/tests/evolution-run-route.test.ts:37-58,267-360` | stub `callCount()` postoji; W3e-PR8 dodaje route test |
| `packages/agent/tests/iterative-optimizer.test.ts:424-445`, `packages/agent/tests/evolution-llm-wiring.test.ts:266-330` | GEPA guard; ostaju |
| `packages/agent/tests/evolution-gates.test.ts`, `packages/server/tests/services/evolution-service.test.ts`, `packages/agent/tests/evolution-orchestrator.test.ts`, `packages/hive-mind-core/tests/mind/evolution-runs.test.ts`, `apps/web/src/components/os/apps/memory/EvolutionTab.test.tsx` | regresija; `EvolutionTab.test.tsx` verovatno pinuje copy koji W0-PR9 menja (sadržaj nije čitan: ZA PROVERU) |
| `packages/server/tests/local/fleet-isolation.test.ts:455-485` | fleet persona snapshot; ostaje |

**Hotspot vlasnik:** `routes/evolution.ts`/`evolution-service.ts` → Evolution owner. Resolver u `chat.ts:439-440` → Chat owner.

---

## 9. UX shell: Home, onboarding, ModelGate, telemetrija

**Šta radi danas.** HomeCockpit ima AskBar, RecallStrip, StartHere, OvernightHero i „Pick up where you left off”, ali **nema** Routines blok ni WorkItem listu (F-UXM-13). Onboarding ima 6 koraka i može se nastaviti posle prekida. Prvi zadatak je „Hello! What can you help me with?” (`OnboardingWizard.tsx:107`). Approvals je sakriven iza TEAMS-a samo u navigaciji, na 3 mesta. PostHog je podrazumevano opted-in kad je ključ upečen (ADR-10-K3).

| Fajl | Uloga |
|---|---|
| `apps/web/src/components/os/apps/HomeCockpit.tsx`, `apps/web/src/routes/HomeRoute.tsx`, `apps/web/src/components/os/warm/{AskBar,OvernightHero,ActivityStream}.tsx` | Home (`HomeCockpit.tsx:902-1046`, AskBar `:1040-1044`), `aria-live` u ActivityStream |
| `apps/web/src/components/os/AppShell.tsx`, `Sidebar.tsx`, `apps/web/src/lib/dock-tiers.ts`, `apps/web/src/lib/command-catalog.ts` | Approvals gate (`dock-tiers.ts:82`, `AppShell.tsx:727-728`, `command-catalog.ts:89`), simple dock (`dock-tiers.ts:121-131`), „New Agent” na svim tier-ovima (`Sidebar.tsx:180-191`), „Upgrade to Team” (`command-catalog.ts:80`) |
| `apps/web/src/components/os/overlays/OnboardingWizard.tsx`, `overlays/onboarding/{ModelGateStep.tsx,constants.ts}`, `apps/web/src/hooks/useOnboarding.ts` | wizard (`:97,112-116`, `onboarding_complete` capture `:463`); `ModelGateStep.tsx` ima 77 linija (raniji citat `:107` je bio pogrešan); mrtvi `ALL_ONBOARDING_PERSONAS`/`getPersonasForTemplate` (`constants.ts:102,125`) |
| `apps/web/src/components/os/model-gate/{ModelGate.tsx,NoModelBanner.tsx}`, `apps/web/src/hooks/useHasWorkingModel.ts` | readiness (§10) |
| `apps/web/src/components/os/apps/SettingsApp.tsx`, `apps/web/src/providers/ShellContext.tsx`, `apps/web/src/hooks/useDeveloperMode.ts`, `apps/web/src/lib/{settings,onboarding}-tier-filter.ts` | telemetry prekidač (`SettingsApp.tsx:722-731`), dva prekidača: experience tier (`ShellContext.tsx:157`) i Developer Mode (F-UXM-08) |
| `apps/web/src/lib/posthog.ts`, `apps/web/src/lib/clerk.ts`, `apps/web/src/app-entry.tsx` | PostHog (`:39,42,49-60,72,84,114-127,133-166`), Clerk (`clerk.ts:42-43`), init (`app-entry.tsx:19-22`) |
| `apps/web/src/lib/activity-labels.ts`, `notification-copy.ts`, `apps/web/src/lib/types.ts` | centralizovan copy (seme za DQ-08); `StepContentBlock` (`types.ts:575-586`) |
| `apps/web/src/components/os/apps/MemoryCenterApp.tsx`, `chat-blocks/ChatWorkCanvas.tsx`, `chat-blocks/BlockRenderer.tsx` | Memory Center (`:57-67`); ChatWorkCanvas je panel artefakata, ne Work Progress |
| `apps/web/src/lib/run-status-labels.ts` | **ne postoji na `2af0904d`**: nastaje u W5-PR2 |
| `tests/e2e/runtime-a11y.spec.ts` | axe, 43 rute × 2 viewporta (`:10-60`); wizard i ModelGate nisu pokriveni |

**Šta plan menja:** W0-PR12 (UI de-gate Approvals, Boundary owner), W0-PR16 (Stop copy), W0-PR17 (jedan telemetry prekidač za lokalni store i PostHog, uz disclosure pre prvog `onboarding_complete`), W5-PR1..PR7 (G2: `step` payload + View-work drawer; G3: Routines blok, nav/⌘K + jedan advanced prekidač A23, first-task artefakt, Playwright baseline, axe za wizard), W6-PR8 (reorder wizarda, G3), W7-PR5 (What-Needs-Me), WB-PR5 (Team upsell copy, posle DQ-03). D-07/D-08/D-09 i DIR-16: **bez UI rewrite-a**, samo dopune.

**Šta se čuva i zašto** ([ux-model.md §2](../plans/v1.2-evidence/phaseA/ux-model.md)): wizard, deljeni ModelGate, `useHasWorkingModel` (popraviti, ne zameniti), SSE `step` + `ActivityStream`, HomeCockpit paneli, Sidebar/⌘K/dock tiers, Memory Center, CronStore/Automation Center (reuse za Routines), axe e2e i centralizovani copy moduli. ODLUKA D-07: Home se čuva, ne projektuje se ponovo.

**Poznati defekti:** F-UXM-07, F-UXM-13 (DELIMIČNO/NEPOVEZANO); F-UXM-08, -09, -10, -14, -15 (POTVRĐENO NA REVIZIJI); F-UXM-11, -12 (POTVRĐENO za sredstva / DELIMIČNO za ugovor i artefakt prvog zadatka); F-TK-02 (DELIMIČNO/NEPOVEZANO: gate postoji samo u UI navigaciji); ADR-10-K3 PostHog (NALAZ AUDITA — ZA PROVERU); F-UXM-01 installer `0.2.0` (`tauri.conf.json:4`) vs `app/package.json` `0.1.0` (POTVRĐENO NA REVIZIJI; rešava se tek uz DQ-01).

**Testovi koji pinuju:** `apps/web/src/lib/posthog.test.ts` (dopuna RED u W0-PR17), `apps/web/src/components/os/overlays/OnboardingWizard.test.tsx:13,31` (mock `captureOnboardingComplete` ostaje; dodaje se disclosure asercija), `apps/web/src/test/p1a-routes.test.ts:232-239` (`:235` pinuje da FREE ne vidi Approvals; prepisuje se u W0-PR12; `p7-a6-approval-gating.test.tsx` ne pinuje tier gate — POTVRĐENO NA REVIZIJI, 03 W0-PR12), `apps/web/src/lib/command-catalog.test.ts`, `apps/web/src/lib/activity-labels.test.ts`, `apps/web/src/lib/onboarding-tier-filter.test.ts:14` (jedini potrošač `ALL_ONBOARDING_PERSONAS`), onboarding step testovi u `apps/web/src/components/os/overlays/onboarding/*.test.tsx`, `apps/web/src/test/phase5b-usechat.test.ts`, `apps/web/src/components/os/StatusBar.test.tsx`, `tests/e2e/runtime-a11y.spec.ts`, Playwright/vision baseline-i (W5-PR6; rizik kaskade).

**Hotspot vlasnik:** `AppShell.tsx`/`HomeCockpit.tsx`/`ModelGate.tsx`/`OnboardingWizard.tsx` → UX owner. `chat-agent-run.ts` → Chat owner.

---

## 10. Lokalni model runtime i hardware detekcija

**Šta radi danas.** „Ready” nije dokaz da generacija radi. Cloud readiness je `verified || (!rejected && transient)` (`useHasWorkingModel.ts:174`), a lokalni je `localModelCount > 0` (`:244`). Oba su false positives (F-UXM-02). Pull je `stream:false` sa timeout-om od 45 minuta (`local-inference.ts:330-331`). Hardware detekcija vidi samo NVIDIA, Apple i CPU (`hardware-detect.ts:330` „STAGED TAIL”). Managed Ollama je pinovan na `0.32.3`, sa rollback-om na `0.32.0`: to je **starije od prvog Qwen 3.8 release-a** (NALAZ AUDITA — ZA PROVERU, external.md §1). Certify model je `qwen2.5:0.5b` (`certify-windows-installer.ps1:2099`) i služi kao smoke test, ne kao cilj.

| Fajl | Uloga |
|---|---|
| `packages/server/src/local/managed-ollama-runtime.ts` | pinovi (`:28-29`), sha256 artefakti (`:158-237`), Range-resume download runtime-a (`:1109-1204`) |
| `packages/server/src/local/routes/local-inference.ts` | pull (`:313-332`), post-pull digest + generation probe (`:338-377`, **zadržati**) |
| `packages/server/src/local/hardware-detect.ts` | NVIDIA/Apple/CPU; W6-PR5 dodaje `detectWindowsWmi` |
| `packages/server/src/local/routes/settings.ts` | live probe ruta + `probeConfiguredModel` (`:103-164,844-889`) |
| `packages/agent/src/cookbook/catalog.ts`, `cookbook/model-fit.ts` | katalog bez qwen3.5/3.6/3.8 (`catalog.ts:44-51`), fit pravila bez `qwen3.8` (`model-fit.ts:207-214`) |
| `apps/web/src/hooks/useHasWorkingModel.ts`, `apps/web/src/components/os/model-gate/ModelGate.tsx` | readiness (`ModelGate.tsx:257-261`), jedna neutralna poruka greške (`:843-858`) |
| `litellm-config.yaml` | Qwen3.6-35B-A3B u produkcionom routeru je cloud DashScope ruta (`:211-215`); lokalna kontrola ide preko `benchmarks/harness/config/models.json:61-67` |

**Šta plan menja:** W6-PR1..PR4, PR6, PR7 (G2): readiness istinitost, `reason` u probe-u, tool round-trip probe, pull stream + resume, Ollama repin **posle online potvrde** + katalog + arch check + certify polja, hardware ladder na ≥3 profila. W6-PR5 (WMI) i W6-PR8 (wizard) idu u G3. Tuning modela je B2-PR3. Ugovori: FRD-10.1..10.5. Otvoreno: DQ-05 (tačna model/hardware konfiguracija; blokira W6-PR6 i B2). ODLUKA D-15: cilj je Qwen 3.8 27B-klasa. Stariji model je kontrolni baseline, ne tiha zamena cilja.

**Šta se čuva:** ModelGate deljen između Settings i onboarding-a, live probe ruta, pin + sha256 + rollback, Range resume, post-pull generation probe, fit engine.

**Poznati defekti:** F-UXM-02..05 (POTVRĐENO NA REVIZIJI); F-UXM-06 (POTVRĐENO za „nije re-baselinovano”; **NEPOZNATO** da li Ollama 0.32.3 servira arhitekturu `qwen3_5`). Zvanični VRAM/RAM po quantu ne postoji (NEPOZNATO → meri se u W6-PR7).

**Testovi koji pinuju:** `apps/web/src/hooks/useHasWorkingModel.test.ts:271-281,301-307,486-495` pinuje false positives, uvedene namerno u `5e2de2b8`. W6-PR1 ih **lomi i prepisuje**. Pokrivenost (sadržaj nije čitan u ovom prolazu): `packages/server/tests/local/managed-ollama-runtime.test.ts`, `packages/server/tests/local/local-inference-route.test.ts`, `packages/server/tests/hardware-detect.test.ts`, `packages/agent/tests/cookbook-model-fit.test.ts`, `apps/web/src/components/os/model-gate/ModelGate.test.tsx`, `apps/web/src/components/os/overlays/onboarding/ModelGateStep.test.tsx`, `apps/web/src/components/os/model-gate/NoModelBanner.test.tsx`.

**Hotspot vlasnik:** `managed-ollama-runtime.ts`/`local-inference.ts` → Model/Runtime owner. `ModelGate.tsx`/`OnboardingWizard.tsx` → UX owner. Promena pina menja **I** (installer) i **R** (router) receipt.

---

## 11. Tiers, KVARK, Stripe, Teams server

**Šta radi danas.** U kodu je i dalje živ sistem od 4 tier-a, TRIAL/FREE/TEAMS/ENTERPRISE (F-TK-01). Stvarni FREE gate-ovi (F-TK-19): `embeddingProviders` bez `litellm` (`tiers.ts:85`, `routes/embedding.ts:106-119`), sesije 10/25 (`tier-session-cap.ts:4`), rute `/api/cost/*`, `/api/cloud-sync/toggle`, `/api/admin/*`, `/api/team/connect`, `/api/marketplace/enterprise-packs`, `/api/team/governance/permissions` i UI Approvals/Team zona. Deset dekorativnih zastavica ima 0 potrošača. KVARK nije povezan: `createKvarkTools` ima 0 produkcijskih pozivalaca, a `KvarkClient` se nigde ne instancira (F-TK-11). Oba je ovaj prolaz potvrdio grep-om na reviziji.

| Fajl | Uloga |
|---|---|
| `packages/shared/src/tiers.ts` | `TIERS`, `TierCapabilities`, `connectorLimit=-1` svuda, `parseTier`/`LEGACY_TIER_MAP`/`getEffectiveTier` (`:154-197`) |
| `packages/server/src/middleware/assert-tier.ts` | `requireTier`/`readTierFromDataDir` (`:21-63`) |
| `packages/server/src/local/routes/cost.ts`, `routes/settings.ts`, `routes/team.ts`, `routes/marketplace.ts`, `routes/embedding.ts`, `packages/server/src/local/tier-session-cap.ts` | gate-ovi: `cost.ts:210,272`; `settings.ts:1192` (audit export), `:1051` (KVARK na `tier==='ENTERPRISE'`), `:1060-1090` (`PATCH /api/tier`), `:1092-1137` (start-trial); `marketplace.ts:190-208`; `team.ts:143-331` |
| `packages/server/src/stripe/{index,webhook,checkout,sync,portal}.ts` | TEAMS-only; `tierFromPriceId` PRO→FREE presedan (`index.ts:68-107`), webhook potpis + idempotency (`webhook.ts:25-79,88-170`) |
| `packages/server/src/kvark/{kvark-client,kvark-auth,kvark-config,kvark-types,index}.ts`; `packages/agent/src/kvark-tools.ts` (`createKvarkTools` `:127`, `:123-296`), `combined-retrieval.ts`, `result-formatter.ts` | KVARK: kod i testovi postoje, a produkcijsko povezivanje ne postoji; `handleKvarkError` nema cloud fallback (dobro za D-03) |
| `packages/server/src/local/routes/vault.ts` | generički vault upsert (`:153-171`): već može da primi `kvark:connection`, pa gate na golo prisustvo ključa **nije** dovoljan (DIR-20) |
| `packages/core/src/team-sync.ts`; `local/index.ts:1440-1503,1661-1704` | team-sync push/pull u **workspace** mind |
| `packages/server/src/index.ts`, `packages/worker/src/**` | Teams cloud server i worker; worker ima sopstvenu chat semantiku (F-TK-10, C20) |
| `apps/www/app/_components/Pricing.tsx`, `apps/www/messages/en.json`, `apps/web/src/components/os/billing/PlanCards.tsx`, `apps/web/src/components/os/overlays/{UpgradeModal,TrialExpiredModal}.tsx`, `apps/web/src/components/os/apps/WorkspaceDesktopApp.tsx` | copy koji i dalje prodaje Team $49/seat (`en.json:196-250`, `Pricing.tsx:10-58`); PRO ostaci (`PlanCards.tsx:59`) |

**Šta plan menja:** W0-PR12 u G1 (de-gate Approvals na 3 UI mesta, `cost.ts:210,272`, `settings.ts:1192`; `tier-enforcement-matrix.test.ts` redovi → `minTier:'FREE'`), WB-PR1 (inventar + review ADR-08/09), WB-PR2 u G1 (**samo** KVARK RED test kao `it.fails`, bez registracije), WB-PR3..PR6 u G3 (registracija 4 KVARK alata sa gate-om `getKvarkConfig(vault)!==null && health.ok`, connect/validate/disconnect/revoke, mrtav tier kod, `LEGACY_TIER_MAP` posle DQ-03, sudbina team-sync-a). Ugovori: FRD-01.6, FRD-11.3/11.4; [ADR-08](../decisions/2026-09-27-ADR-08-individual-tiers-kvark-boundary.md) i [ADR-09](../decisions/2026-09-27-ADR-09-secondary-worker-parity.md) (RAT-08 pre WB-PR3); MIG-07. **Stripe se ne dira** do DQ-03: bez otkaza, refunda i billing promena (DP-0.11).

**Šta se čuva i zašto** ([tiers-kvark.md §2](../plans/v1.2-evidence/phaseA/tiers-kvark.md)): `parseTier`/`LEGACY_TIER_MAP` (read-compatible migracija `config.json`), `requireTier` fail-closed, tier-enforcement tripwire matrica, Stripe webhook (potpis, idempotency, atomski upis), `tierFromPriceId` presedan, KVARK klijent i alati (BORROW kad se povežu), `handleKvarkError` bez fallback-a, team-sync binding, OSS export guard. ODLUKE D-01 (besplatno za pojedinca), D-02 (nema Waggle Team SKU-a) i D-03 (KVARK samo on-prem, bez cloud fallback-a).

**Poznati defekti:** F-TK-01, -03, -04, -05, -06, -07, -08, -09, -10, -11, -13, -14, -15, -18, -19 (POTVRĐENO NA REVIZIJI za kod; F-TK-04 stub, F-TK-05 link na repo, F-TK-07 sitna nekonzistentnost i F-TK-13 protivrečnosti su NALAZ AUDITA — ZA PROVERU); F-TK-02, -12, -17 (DELIMIČNO/NEPOVEZANO); F-TK-16 (DELIMIČNO: kod-obrazac postoji, poslovni deo NEPOZNATO). **NEPOZNATO:** Stripe live proizvodi i aktivni pretplatnici (DQ-03; zahteva ovlašćen read-only inventar).

**Testovi koji pinuju:** `packages/server/tests/tier-enforcement-matrix.test.ts` (tripwire `:43-49`; u W0-PR12 redovi `:53`, `:56` → `minTier:'FREE'`, a TRIAL/403 testovi `:131-180`, koji koriste `/api/cost/by-workspace` kao TEAMS canary, prelaze na rutu koja ostaje TEAMS — 03 W0-PR12), `apps/web/src/test/p1a-routes.test.ts:232-239` (Approvals skriven za FREE; prepis u W0-PR12; nije u F-TK-18 listi od 21 — POTVRĐENO NA REVIZIJI), `packages/server/tests/routes/connectors-tier.test.ts`, `packages/server/tests/kvark/*.test.ts` (6 fajlova, uključujući `kvark-wiring.test.ts`), `packages/agent/tests/kvark-tools.test.ts`, `kvark-pipeline-smoke.test.ts`, `combined-retrieval.test.ts`, `conflict-detection.test.ts`, `packages/server/tests/stripe/{webhook,checkout,sync,status,smoke-e2e}.test.ts`, `packages/core/tests/team-sync.test.ts`, `apps/www/__tests__/Pricing.test.tsx`, `apps/www/__tests__/stripe-checkout-route.test.ts`. Ukupno 21 test fajl zaključava tier ponašanje (F-TK-18). Lista je u [tiers-kvark.md](../plans/v1.2-evidence/phaseA/tiers-kvark.md) F-TK-18.

**Hotspot vlasnik:** `tiers.ts`/`assert-tier.ts` → Boundary owner. Registracija alata u `local/index.ts` → Server owner.

---

## 12. Release, CI, installer, licence, cene

**Šta radi danas.** CI se okida samo na `main` (`ci.yml:3-6`). `release.yml` se okida na **bilo koji** `v*` tag (`:12-15`), a u repou ima 10 istorijskih `v*` tagova (DP-0.12). Signing chain ima 6 job-ova i fail-closed guardove. Alati za router i auth-canary receipt nemaju npm/CI pozivaoca. Alat za crash-injection receipt ne postoji (F-REL-03). Nema SBOM-a ni `THIRD_PARTY_NOTICES` (F-REL-04). `npm audit` je `continue-on-error: true` (`ci.yml:108-110`).

| Fajl | Uloga |
|---|---|
| `.github/workflows/ci.yml` | blocking gate-ovi (`:30-106,120-146`); W0-PR0 dodaje `integration/**` |
| `.github/workflows/release.yml` | chain `build-windows-prebuilt → prepare-windows-signing → sign-windows → certify-windows → attest-windows → publish-windows`; certify na `:1884,1900`; **ne dira se** bez founder review-a |
| `.github/workflows/tauri-build-pr.yml` | PR build; certify `:202`; W0-PR0 dodaje `integration/**` |
| `scripts/certify-windows-installer.ps1` | 3422 l.; clean-profile certifikacija; `Refusing …` odbijanja (`:1724,1960-1962,2258,2271`) zaustavljaju rad; seed samo embedding modela (`:2904`) |
| `scripts/bundle-node.mjs`, `bundle-native-deps.mjs` (`:113-130`, samo binarije), `stage-sidecar-deps.mjs` (`:16-18,111`) | staging; native LICENSE tekst nedostaje (`onnxruntime-node@1.21.0`, `sqlite-vec-windows-x64@0.1.9`) |
| `scripts/qualify-smart-router.ts` (+ `.test.ts`), `scripts/test-windows-official-auth-canaries.ps1`, `scripts/seal-persona-acceptance.ts` (`npm run persona:seal`) | R, A i P receipt alati; W8-PR1 dodaje entry-pointe u G1 pre F1 |
| `scripts/oss-drift-check.mjs`, `scripts/oss-drift-baseline.json`, `scripts/oss-subtree-split.sh` (`:117-133` abort guard) | OSS drift (nije u CI); split skripta služi samo za inspekciju |
| `app/src-tauri/tauri.conf.json` (`:4` `0.2.0`, `:21` `installMode: "currentUser"`), `app/src-tauri/src/{service.rs,lib.rs}`, `app/package.json` | Tauri; `WAGGLE_DESKTOP_PORT_FALLBACK` (`service.rs:163`), port 3333 (`lib.rs:103`) |
| `LICENSE`, `packages/optimizer/LICENSE`, `packages/weaver/LICENSE`, `packages/hive-mind-{cli,mcp-server,wiki-compiler}/NOTICE` | licencne protivrečnosti (F-REL-08/F-TK-13): „proprietary” LICENSE uz `"license":"MIT"`; NOTICE referiše nepostojeći `EXTRACTION.md` |
| `packages/agent/src/cost-tracker.ts`, `benchmarks/harness/config/models.json:88-89`, `packages/server/src/local/model-spend-meter.ts` | pricing tabela (`:24-68`): Opus 4.6/4.7/4.8 na $15/$75, fallback `:66`; ulazi u hard daily budget (F-REL-06) |
| `docs/production-readiness/09-LAUNCH_RECOMMENDATION.md`, `README.md`, `CLAUDE.md`, `AGENTS.md` | doc drift kandidata (F-REL-01) → W0-PR15; rečenice o vidljivosti i licenci (`CLAUDE.md:84`, `AGENTS.md:68`, `README.md:110,118`) su **izuzete** dok ne presudi DQ-02 |
| `vitest.config.ts` (`maxWorkers: 4`, `:28`), `vitest.setup.ts`, `playwright.config.ts` (`:36-44,57,116`), `playwright-e2e.config.ts` (`:9` hardkodovan `localhost:3333`), `tests/vision/_helpers.ts:13-22` | test infrastruktura; E2E izolacija po checklisti |

**Šta plan menja:** W0-PR0 (CI filter), W0-PR13 (pricing: 4 reda + fallback + Haiku 3.5 + provenance komentar; **ne** cherry-pick `fe7804bf`; ažurira `cost-tracker.test.ts:54-57`), W0-PR15 (doc drift), W8-PR1 (G1, pre F1), W8-PR2 (G2, pre F2: crash-injection receipt nad packaged build-om), W8-PR5/PR6 (G3), W8-PR7 (uslovno, kapija REL-BOOT; founder review izmene `release.yml`), OSS-PR1..PR5 (OSS-PR2 u report modu u G1; PR3/4/5 posle DQ-02), W3-PR8 (cherry-pick iz `origin/feature/harness-sota-bench` @ `18e5b36a` **bez rebase-a**). Receipt i freeze pravila: Delivery plan §5; release put F3a → K → F3b → javni GO: §5.1. Ugovori: FRD-12, FRD-13.5; [ADR-10](../decisions/2026-09-27-ADR-10-release-privacy-profiles.md) (RAT-09 pre W8-PR6).

**Šta se čuva i zašto** ([release-oss.md §6](../plans/v1.2-evidence/phaseA/release-oss.md)): signing chain i immutable guardovi, certify skripta, staging koji čuva first-party LICENSE/NOTICE, Ollama pinovi, `CostTracker` reservation ledger (logika je ispravna, pogrešna je samo tabela), persona seal alat, blocking CI gate-ovi, Dependabot. Windows Solo ugovor (`CLAUDE.md` §1): instalirani desktop ne sme zavisiti od developer Node-a, Python-a, Docker-a, eksternog LiteLLM-a ni zasebno instalirane Ollame. Zato τ² Python alat i Harbor/Docker ostaju na bench mašini (AT-30).

**Poznati defekti:** F-REL-01, -04, -06, -10 (POTVRĐENO NA REVIZIJI); F-REL-02 (POTVRĐENO / DELIMIČNO); F-REL-03, -08 (DELIMIČNO/NEPOVEZANO); F-REL-05 (POTVRĐENO za npm audit, license CI nije nađen); F-REL-07, -09 (kod POTVRĐENO; live GitHub stanje NALAZ AUDITA — ZA PROVERU: repo public, `WINDOWS_PUBLIC_RELEASE_AUTHORIZED` nedefinisan, bez branch protection; vidljivost `public` ponovo potvrđena read-only 30.09.2026, H-01); F-REL-11 (NEPOZNATO: Authenticode i Deep Security su spoljne kapije); F-REL-12 (POTVRĐENO + inventar za cherry-pick). Ciljne zvanične cene u W0-PR13 su NALAZ AUDITA — ZA PROVERU i proveravaju se ponovo pri merge-u.

**Testovi koji pinuju:** `packages/agent/tests/cost-tracker.test.ts:54-57` (pinuje $15/$75; ažurira se u W0-PR13), `scripts/qualify-smart-router.test.ts`, `tests/oss-subtree-split.test.ts`, `packages/server/tests/local/model-spend-meter.test.ts`.

**Hotspot vlasnik:** `release.yml`/`scripts/certify-*`/`scripts/{bundle-*,stage-*}` → Release owner (bez founder review-a se ne diraju). `oss-drift-baseline.json` → Memory owner (maintainer). Licence → OSS/License owner. GitHub podešavanja (rulesets, environments, secret scanning, Actions varijable) su owner radnje kroz W8 i **nisu PR posao** (DP-0.11).

---

## 13. Kako tražiti (obavezna disciplina)

Phase-A je više puta pokazao da je prva tvrdnja bila pogrešna. S1 je citirao `apps/web/src/lib/agent-search.ts:81` umesto `packages/server/src/local/routes/agent-search.ts:79`. S1 je stavio `system-tools.ts` u server paket, a on je u `packages/agent/src/`. Citat `ModelGateStep.tsx:107` pokazivao je na fajl od 77 linija. Ledger red TD-CHAT-46 je zastareo, a mapa u `CLAUDE.md` §2 i `ARCHITECTURE.md` ne odgovara kodu (§0). **Pogrešan ledger red je i sam defekt.** Pravila:

1. **Traži po sposobnosti, ne po imenu.** Ne pitaj „postoji li `ContextPackage`”. Pitaj „ko sastavlja kontekst za model”. Primeri obrazaca (uvek ih kombinuj) su u **ERE** sintaksi (POSIX extended: `|` je alternacija, `\(` je doslovna zagrada), pa ih pokreći samo kroz `git grep -nE` ili `rg`, nikad kroz goli `git grep -n`:
   - *ko upisuje u personal mind:* `multiMind\.personal|createIFrame|new FrameStore\(personal|personal\.mind`
   - *ko preskače ili lažira verifikaciju:* `shouldSkipVerify|WAGGLE_AUTO_VERIFY|VERIFIER_AUTO_RUN|VERDICT|'verified'|ok: true`
   - *tier gate (i bez navodnika):* `requireTier|minBillingTier|minTier|isPro|isEnterprise|TEAMS|ENTERPRISE|TRIAL`
   - *trajno stanje:* `writeFileSync|renameSync|\.json'\)|CREATE TABLE|CHECK \(`
   - *eventi i kanali:* `harnessEvents\.(on|emit)|eventBus\.on\(|'persona:reloaded'|sendEvent\(`
   - *env prekidači:* `process\.env\.WAGGLE_|VITE_[A-Z_]+`
   - *rute:* string `'/api/<nešto>'` u `packages/server/src/**` **i** klijent u `apps/web/src/lib/adapter.ts`
2. **Jedan grep nikad nije dovoljan** (`CLAUDE.md` §3.5). Za svaki simbol pokrij: direktne reference; tipove (`import type`, `satisfies`, generički parametri); string literale (imena alata kao `'run_harness'`, imena evenata, SQL tabele i `CHECK` vrednosti, zod enum-e); dinamičke `import(`; re-exporte i barrele (`packages/agent/src/index.ts`, `packages/*/src/index.ts`); `server.decorate('x')` → `fastify.x`/`server.x`; testove (`packages/*/tests/**`, `apps/web/src/**/*.test.ts(x)`, `apps/web/src/test/**`, `tests/e2e/**`, `tests/vision/**`); skripte i workflow-e (`scripts/**`, `.github/workflows/**`); dokumente (`docs/**`, `CLAUDE.md`, `AGENTS.md`, `docs/TECH-DEBT.md`).
3. **Grep nad revizijom, ne nad radnim stablom ili `dist`-om.** Baseline tvrdnje proveravaj sa `git grep -nE '<obrazac>' 2af0904df01ca3d374cc78ba95b60dc579dd6a7a -- 'packages/*/src/**' 'apps/web/src/**'` i `git show 2af0904df01ca3d374cc78ba95b60dc579dd6a7a:<putanja>`. Bez `-E` `git grep` koristi POSIX basic regex, u kome su `|`, `(`, `)` i `?` doslovni znakovi. POTVRĐENO NA REVIZIJI (git 2.51): `git grep -n "from '.*/workflow-harness(\.js)?'" 2af0904d -- 'packages/*/src/**'` daje 0 pogodaka, a isti obrazac sa `-nE` daje 5; `shouldSkipVerify|WAGGLE_AUTO_VERIFY` daje 0 bez `-E` i 4 sa `-E` (nad `packages/*/src/**` i `apps/web/src/**`). Build izlazi (`packages/*/dist`) mogu biti stari. Phase-A repro skripte su čitale `dist` i proveravale da je noviji od izvora.
4. **Kako naći pozivaoce.** (a) `git grep -nE '\bimeSimbola\b'` (ili `git grep -nw 'imeSimbola'`) i odbaci definiciju, barrel i testove. Ako ostane 0, to je „0 produkcionih pozivalaca”, kao u slučaju `createKvarkTools`, `RecoveryRunner`, `rollbackPersonaOverride` i `markCorrected`. Nula važi samo ako je obrazac pokrenut sa `-E` (ili kroz `rg`); nula iz golog `git grep -n` nad obrascem sa `|`, `(`, `)` ili `?` ne dokazuje ništa. (b) Nađi import sajtove fajla: `git grep -nE "from '.*/<fajl-bez-ekstenzije>(\.js)?'"`. (c) Za rute prati registraciju u `packages/server/src/local/index.ts` i klijentsku metodu u `adapter.ts`, pa UI pozivaoca. (d) Za alate agenta traži ime alata kao string, filter persona (`persona-tool-filter.ts`), approval klasifikaciju (`confirmation.ts`) i `selectToolsForTurn` (vidi reachability napomenu u [TESTING.md](../TESTING.md)). (e) Za DB kolone traži i SQL string i TS tip, jer `CHECK` ograničenja traže table-rebuild migraciju (`execution-traces.ts:150-151`, `evolution-runs.ts:95-96`).
5. **Pre novog fajla, grep** (`CLAUDE.md` §3.6, §8 „Already Built”). Plan je već popisao šta se pozajmljuje iz Waggle-a (BORROW, D-17). Vidi [Build-vs-Borrow](../plans/WAGGLE-BUILD-VS-BORROW-v1.2.md) BB-01..BB-13.
6. **Brojevi linija se pomeraju.** Posle svakog merge-a na `integration/waggle-next` re-sidri citate po simbolu. U PR opisu citiraj `putanja:simbol` i SHA na kome je linija važila.
7. **Verifikacija se ne tvrdi, nego pokreće:** `npm run build:packages` (jedini autoritativni tsc lanac, TD-TEST-12), `npm run typecheck:server-tests`, `npm run lint`, `npm run test -- --run --maxWorkers=6` (DP-0.06). Node mora biti **22.23.2**, jer je `better-sqlite3` građen za ABI 127 ([TESTING.md](../TESTING.md), „Runtime”). Ove komande se pokreću tek kad je plan odobren, u sopstvenom worktree-ju i sa izolovanim env-om po checklisti (root suite do merge-a W0-PR20 samo u BTP-u, 05 N-28). Pre odobrenja ne pokreću se nigde, ni u zasebnom svežem klonu na sopstvenoj mašini (isto pravilo kao [00 §2](00-START-HERE.md) i [01 §0](01-ONBOARDING-DEV-ENV.md); PREDLOG, izuzetak samo kroz founder pitanje (o) u 00 §6, predlog TSA-02 u [TEAM-START-AUTHORIZATION](TEAM-START-AUTHORIZATION.md)).

---

## 14. Registar NEPOZNATO za ovaj dokument

ID-evi `N-1..N-6` važe samo u ovom dokumentu. Van njega se pišu kao „04 N-n”, jer [03 §7](03-BACKLOG.md) i [05 §2](05-RISKS-DECISIONS-ESCALATION.md) imaju sopstvene `N` registre sa drugim značenjem (05 §0, „ID-evi su lokalni po dokumentu”).

| # | Stavka | Gde se zatvara |
|---|---|---|
| N-1 | Tačni fajlovi W0-PR18 (proširenje recall filtera na MCP/hook put) i putanja generatora W0-PR19 | dizajn PR-a (Memory owner / Durable owner) |
| N-2 | Da li `session-start.test.ts` / `handlers-core.test.ts` i `EvolutionTab.test.tsx` pinuju tačan string koji W0 menja. Deo za W0-PR12 razrešen 29.09.2026: `p7-a6-approval-gating.test.tsx` ne pinuje tier gate; gate pinuju `p1a-routes.test.ts:232-239` i `tier-enforcement-matrix.test.ts:53,56,131-180` (POTVRĐENO NA REVIZIJI; 03 W0-PR12) | prvo čitanje pre W0-PR10/PR9; W0-PR12 prepisuje navedena dva testa |
| N-3 | Da li pinovana Ollama `0.32.3` servira `qwen3_5` arhitekturu; zvanični VRAM/RAM po quantu | online provera + W6-PR6/PR7 (DQ-05) |
| N-4 | Produkcioni pozivalac `markSurfaced`; da li postoji test „nema vault vrednosti u promptu/trace-u”; da li Claude Code `--safe-mode` suzbija SessionStart hookove | W3e-PR7, W4-PR7, W2-PR6 |
| N-5 | Da li je `VITE_POSTHOG_KEY` upečen u kandidat build (zavisi od `apps/web/.env.local` na build hostu); Stripe pretplatnici (DQ-03); DST ponašanje rutina; status Authenticode i Deep Security | W0-PR17 checklist grep, DQ-03, W1-PR11, W8 spoljne kapije |
| N-6 | Da li merge `chat.ts` + `chat-*.ts` odobrava samo Chat owner (wave redovi) ili i Harness owner (DP-0.14 `Harness/Chat owner`), §2 | tech lead / founder po [02 §10](02-WORKING-AGREEMENT.md), pre prvog merge-a W0-PR8/PR9/PR11; predlog: oba (Chat owner i Harness owner), TSA-01 t.2 u [TEAM-START-AUTHORIZATION](TEAM-START-AUTHORIZATION.md) (NEODOBRENO) |

---

## Izvori

- [Delivery plan v1.2](../plans/WAGGLE-DELIVERY-PLAN-v1.2.md): §0 (DP-0.01..DP-0.16), §2 (talasi i PR tabele), §6/§6.1 (DQ, RAT, ODB).
- [FRD v1.2](../Waggle_FRD_v1.2_DRAFT.md): §1 (slojevi), §2.12 (mapa kompatibilnosti), §15 (AT-01..AT-30 sa lokacijom testa i ownerom). [PRD v1.2](../Waggle_PRD_v1.2_DRAFT.md).
- Phase-A: [harness](../plans/v1.2-evidence/phaseA/harness.md), [durable](../plans/v1.2-evidence/phaseA/durable.md), [hivemind](../plans/v1.2-evidence/phaseA/hivemind.md), [capability](../plans/v1.2-evidence/phaseA/capability.md), [evolution](../plans/v1.2-evidence/phaseA/evolution.md), [ux-model](../plans/v1.2-evidence/phaseA/ux-model.md), [tiers-kvark](../plans/v1.2-evidence/phaseA/tiers-kvark.md), [release-oss](../plans/v1.2-evidence/phaseA/release-oss.md), [external](../plans/v1.2-evidence/phaseA/external.md), i refute prolazi `*.refute.md`.
- [ADR-INDEX](../decisions/ADR-INDEX.md), [Migracije](../plans/WAGGLE-MIGRATIONS-v1.2.md), [Build-vs-Borrow](../plans/WAGGLE-BUILD-VS-BORROW-v1.2.md), [Benchmark protokol](../plans/WAGGLE-BENCHMARK-PROTOCOL-DRAFT.md), [Dispozicija audita](../plans/WAGGLE-AUDIT-DISPOSITION-v1.2.md), [Otvoreni LOW nalazi](../plans/WAGGLE-V1.2-OPEN-LOW-FINDINGS.md), [SAFE checklist](../plans/SAFE-IMPLEMENTATION-CHECKLIST.md).
- Repo vodiči: [CLAUDE.md](../../CLAUDE.md), [AGENTS.md](../../AGENTS.md) (kanonski ugovor), [ARCHITECTURE.md](../ARCHITECTURE.md), [TESTING.md](../TESTING.md), [TECH-DEBT.md](../TECH-DEBT.md), [THREAT_MODEL.md](../../THREAT_MODEL.md), `package.json`.
- Founder brief: [Waggle_Planner_Brief_v1.0_2026-09-27.md](../plans/v1.2-evidence/inputs/Waggle_Planner_Brief_v1.0_2026-09-27.md) (§3 D-01..D-18).
