# ADR-02 — Durable run store, faza kao jedinica oporavka, stabilni identitet radnje (`actionId` ≠ `attemptId`)

**Revizija dokumenta:** 1.2 DRAFT · 27.09.2026 · pregledana revizija koda `2af0904df01ca3d374cc78ba95b60dc579dd6a7a`
**Revizija dokumenta:** 1.2.1 DRAFT · 30.09.2026 · završno zatvaranje (H-01..H-12)
**Izmene 1.2.1:** H-03 (nalaz `finish/facts/f1/06`) — anchor `HarnessRunState` ispravljen sa `workflow-harness.ts:118-128` na `:110-128` u K5 i §7 (na `2af0904d` interfejs počinje na `:110`; POTVRĐENO NA REVIZIJI, `git show 2af0904d:packages/agent/src/workflow-harness.ts`). Sadržaj odluke nepromenjen.
**Datum:** 2026-09-27
**Status:** DRAFT — predlog ugovora; izbor store-a prolazi Build-vs-Borrow (brief §14) i NIJE ovim odlučen
**Autor:** planer (Fable 5.1)
**Ratifikuje:** founder — čeka (ratifikacija ADR-a u celini, review u W1-PR1; A8 store odluka, `runs.db` lokacija i status mapa su inženjerske odluke vlasnika (MDQ-01 / Build-vs-Borrow Q1 posle dvogranskog spike-a; MDQ-02) čiji se ishod upisuje u ovaj ADR i ratifikuje sa njim — nisu zaseban DQ; ADR-INDEX §3)
**Zamenjuje / precizira:** `agent-runs.json` whole-file JSON store (`AgentRunRegistry`, `packages/server/src/local/agent-run-registry.ts`); restart-politiku „svi aktivni interni runovi → terminalno `interrupted`” (`:510-520`); S1 A7 ključ `runId+phaseId+attempt+callIndex`; FRD v1.1 §3 redosled (run kreiran u koraku 7, posle konteksta i blokiranja) i §4 skup stanja (uključujući `PAUSED`); S1 §3 „Build ~600–1000 LOC” kao unapred zaključen ishod
**Obavezuje:** W1 (run store, server-driven faze, checkpoints, journal, budgets), W2 (context reference u checkpoint-u), W5 (Work Progress), W7 (WorkItems), migracije (brief §12.4), FRD v1.2 §„Ugovori” i §„State map”
**Cross-references:** ADR-01 (režimi), ADR-03 (detach/cancel/sinceSeq), ADR-04 (BLOCKED_CAPABILITY), ADR-07 (occurrence identitet rutina), ADR-10 (erasure granica); brief §6.2–6.5 (DIR-04, DIR-05, DIR-06), §12.4 (DIR-21); AT-07, AT-08, AT-09, AT-10, AT-15, AT-23, AT-27

---

## §1 — Kontekst

**ADR-02-K1 (POTVRĐENO NA REVIZIJI).** Restart označava sve aktivne interne runove terminalno: `AgentRunRegistry.interruptInFlightInternalRuns()` (`agent-run-registry.ts:510-520`, pozvan iz konstruktora `:137`) upisuje `status:'interrupted'`, `result.error='Waggle restarted before this run finished'`; `ALLOWED_TRANSITIONS.interrupted = new Set()` (`:41`); `control()` na terminalnom runu baca (`:282`). Nijedna tranzicija iz `interrupted` ne postoji u `packages/server/src`. Test `packages/server/tests/local/agent-run-registry.test.ts:195-218` pinuje ovo kao željeno. Kontekst iz refute-a: postoji drugi resume obrazac za harvest runove (M-08: `routes/harvest.ts:128`, `adapter.ts:4018`) — BORROW kandidat; fleet `pause` je abort, ne suspend (`workspace-sessions.ts:241-259`, `fleet.ts:419`). [durable.md F-DUR-01; refute HOLDS]

**ADR-02-K2 (POTVRĐENO NA REVIZIJI).** Store je whole-file JSON: `persist()` tmp+rename sa Windows `.bak` fallback-om (`:539-574`), persist na svaki upsert (`:497-508`), `MAX_EVENTS = 2_000` (`:29`), `load()` → prazan store na `version !== 1` ili corrupt JSON bez upozorenja (`:522-535`), nema GC nad `runs[]`. `eventsSince(since)` vraća `resetRequired` (`:243-257`); testiran samo `false` put (`agent-run-registry.test.ts:104-105`), nedostaju overflow i corrupt-load testovi. Instanca: `packages/server/src/local/index.ts:538` `agent-runs.json` u `dataDir`. [F-DUR-02; refute WEAKENED samo za tvrdnju o testu]

**ADR-02-K3 (POTVRĐENO NA REVIZIJI).** `COLLABORATION_RUN_STATUSES` (`packages/shared/src/types.ts:398-402`) = 10 stanja; `starting`, `waiting_for_approval`, `paused` nemaju produkcionog settera (grep `status: 'waiting_for_approval'|'starting'` = 0; `capabilities.pause = true` = 0); `paused` samo iz `control('pause')` (`:330`) koji zahteva capability koju niko ne daje. Zod enum na ruti (`routes/agent-runs.ts:15`) i UI mape (`RoomApp.tsx:51-66`, `routes/agents.ts:149-160`, `room-state-reducer.ts:228` `interrupted→'failed'`) zavise od svih vrednosti — brisanje bilo koje lomi ugovor. FRD §4 stanja `BLOCKED_CAPABILITY|BLOCKED_APPROVAL|FAILED_RETRYABLE|FAILED_FINAL` nemaju ekvivalent (grep = 0 u `packages/` i `apps/`). [F-DUR-03, F-CAP-02]

**ADR-02-K4 (DELIMIČNO/NEPOVEZANO).** `packages/agent/src/long-task/checkpoint.ts` (`CheckpointStore`, atomic save `:170-211`, `verifyIntegrity` `:267-290`, `CHECKPOINT_SCHEMA_VERSION=1`, per-step `cost_usd`) i `recovery.ts` (`RecoveryRunner`) postoje i testirani su cross-process (`long-task-loop-integration.test.ts:221-330`), ali jedini ne-test potrošač je opcioni `retrieval-agent-loop.ts:153,568-579,713-755`; `/api/agent/run`, chat, fleet, cron ne prosleđuju `checkpointStore`; `RecoveryRunner` 0 produkcionih pozivalaca. Jedinica oporavka je LLM turn, ne faza. [F-DUR-04]

**ADR-02-K5 (POTVRĐENO NA REVIZIJI).** Nema server-driven phase executor-a: `createHarnessRun/advancePhase` nemaju pozivaoce u `packages/server/src` (samo re-export `packages/agent/src/index.ts:315`); `HarnessRunState` (`workflow-harness.ts:110-128`) je serijalizabilan oblik (phaseStatuses, checkpoints, totalTokens) ali živi samo u `activeHarnessRuns` Map-i. `latestDurableRun()` u `routes/agents.ts:106,153,490` je lokalni helper nad registry-jem, ne sistem. Grep `DurableRun|ProofReceipt|ToolCallJournal|runs\.db|idempotencyKey|Idempotency-Key` po `packages/**/*.ts` = 0 relevantnih. [F-DUR-13; refute HOLDS]

**ADR-02-K6 (POTVRĐENO NA REVIZIJI).** Jedini idempotency obrazac za spoljnu radnju je held-action queue: `pending_actions` red = jedna radnja, atomic claim `held→approved` (`held-action-executor.ts:154-160` → `packages/core/src/cron-store.ts:551-556` `UPDATE … WHERE id=? AND status='held'`), TTL 7 d, re-validacija na execute (`:191-206`), `tool.execute` pa `updatePendingActionResult('executed')` (`:233-235`). Crash između `:233` i `:235` ostavlja red `approved` zauvek — nema `unknown_outcome`, nema `attemptId`, nema `providerIdempotencyKey` (grep 0); `routes/approval.ts:66-68` vraća 409 `already_decided` bez izvršenog rezultata. `PendingActionStatus = 'held'|'approved'|'denied'|'executed'|'failed'|'expired'` (`cron-store.ts:88`). `job-service.ts:38` je team-mode Postgres id-kolizija, ne provider ključ. S1 A7 ključ (`runId+phaseId+attempt+callIndex`) nije prisutan u kodu; postojeći obrazac je bliži DIR-06 nego S1 A7. [F-DUR-05; refute HOLDS]

**ADR-02-K7 (DELIMIČNO/NEPOVEZANO).** Budžet: dnevni spend preživljava restart (`local-mode.test.ts:1067-1075`); per-run `metrics` upisuju se u registry tek na terminalnom patch-u (`fleet-run-executor.ts:746-766,825-840,883`), pa `interrupted` run nema potrošnju; checkpoint sa `total_cost_usd` postoji samo u nepovezanom retrieval loop-u. [F-DUR-07]

**ADR-02-K8 (POTVRĐENO NA REVIZIJI).** Execution state Loop-ova živi u semantičkoj memoriji: `loop-executor.ts:212-230,311-322` `stateKey='loop:<id>'` kao `AwarenessLayer` item (`pending`); za `workspace_id null/'*'` u **personal** mind-u (`index.ts:2596-2597`); `AwarenessLayer.toContext()` (`awareness.ts:142-168`) renderuje sve `pending` stavke bez filtera → jedan red `- Loop: <name>` po Loop-u ulazi u recall kontekst (`context-loader.ts:111-120`, `orchestrator.ts:315-316`). [F-DUR-09; refute HOLDS+, NEPOZNATO razrešeno]

**ADR-02-K9 (NALAZ AUDITA — ZA PROVERU (live 27.09.2026, izvor: external.md §3, §8) / PREDLOG; jedino Waggle `better-sqlite3` 12.6.2 = POTVRĐENO NA REVIZIJI, `package.json:73`).** Build-vs-Borrow za durable engine: nijedan kandidat ne ispunjava svih 5 uslova (external.md §3 (a)–(e): embed u Node/Fastify bez zasebnog servera, SQLite, Windows, permisivna licenca, zrelost). DBOS TS = Postgres-only; Absurd Postgres; Inngest/Restate/Temporal/Resonate = zaseban server (Restate BSL, Inngest SSPL server); LangGraph SqliteSaver = `better-sqlite3 ^11` konflikt sa 12.6.2 + LangGraph runtime; Vercel Workflow Local World = JSON fajlovi „not production”. Najbliži fit: **Reflow** (`danfry1/reflow-ts`, MIT, v0.7.0, `sqlite-node` nad better-sqlite3 ≥9, lease/heartbeat, retries, `AbortSignal` cancel, idempotent enqueue) — 41★, jedan autor (bus factor 1). BuilderIO/agent-native: Postgres/PGlite + Nitro, root licenca `ISC` bez LICENSE fajla, durable/replay tvrdnje nedokazane iz docs — pattern reference only. [external.md §2.1, §3, §8]

**ADR-02-K10 (ODLUKA — D-14, D-17 · PREDLOG — SMER BRIEFA — DIR-04, DIR-05, DIR-06, DIR-21).** ODLUKA: dug rad je deo proizvoda (D-14); BORROW → ADAPT → BUILD (D-17). PREDLOG — SMER BRIEFA (planerski smer, ne korisnikovo odobrenje): run postoji pre side effect-a, blokiranja i trajnog konteksta (DIR-04); faza je jedinica oporavka (DIR-05); stabilni identitet poslovne radnje (DIR-06); rollback ne vraća obrisana prava (DIR-21). Ovaj ADR sprovodi odluke, a smer briefa razrađuje kao radnu osnovu nacrta.

## §2 — Odluka (predlog ugovora)

**ADR-02-O1 (PREDLOG) — minimalni data ugovori (brief §6.3, preneseni kao ugovor; nazive uskladiti sa postojećim tipovima uz mapu kompatibilnosti):**

| Ugovor | Polja / odgovornosti |
|---|---|
| `DurableRun` | `runId`, `workspaceId`, `sessionId`, `requestFingerprint`, `status` (kanonski, §O3), `interaction/mode` (ADR-01), `recipeId/recipeVersion`, `modelId/runtimeId`, `budget {limit, spent}`, `contextRef` (ADR-05), `cursor {phaseId, attempt}`, `permissionEnvelopeRef` (ADR-04), `createdAt/updatedAt/completedAt`, `schemaVersion`, `leaseOwner/leaseUntil` |
| `PhaseAttempt` | `runId`, `phaseId`, `attempt`, `inputRefs[]`, `startedAt/endedAt`, `observedToolCalls[]` (server ledger), `evidenceRefs[]`, `gateResults[] {gate, passed, verdict?, reason}`, `abortReason?` |
| `Checkpoint` | `runId`, `phaseId`, `attempt`, `phaseOutput`, `artifactRefs[] {path, sha256}`, `evidenceRefs[]`, `contextRef + contextHash`, `spent {tokens, usd}`, `nextPhaseId`, `schemaVersion`; pisan samo na **potvrđenoj granici faze** (gates prošli) |
| `ToolAction` / `ToolAttempt` | `actionId` (server-persistiran, stabilan kroz retry), `runId`, `phaseId`, `tool`, `argsFingerprint`, `sideEffectClass`, `grantRef?`, `status` (§O5), `providerIdempotencyKey?`, `receipt?`; `ToolAttempt {attemptId, actionId, startedAt, endedAt, ok, exitCode?, resultRef}` |
| `RunEvent` | `runId`, monotoni `seq`, `phaseId/attempt`, `type`, `label` (user-facing), `status`, `evidenceRefs[]`, `at`; bez tajni u payload-u |
| `ProofReceipt` | `runId`, `level: structural\|defined_elements\|content_review` (ADR-01 O5, FRD-02.6; `gate_passed` je samo `TraceOutcome`, ne nivo), `verifierVersions`, `observedEvidence[]`, `mandatoryGates[]`, `optionalGates[]`, `warnings[]`, `unresolved[]`; nije opšti pečat istinitosti |

**ADR-02-O2 (PREDLOG) — redosled nastanka run-a (DIR-04; ispravlja C8):** (1) razreši korisnika/Workspace, sačuvaj intent + `requestFingerprint`; (2) klasifikuj (ADR-01 O2), izaberi recipe/version; za `conversation` ostaje session putanja; (3) **kreiraj `DurableRun`** sa scope/mode/budget/envelope; (4) sastavi i poveži `ContextPackage` (može biti pripremljen u memoriji pre 3, ali nijedna trajna referenca ne sme zavisiti od paketa bez run-a); (5) razreši capabilities → po potrebi `BLOCKED_CAPABILITY` (ADR-04); (6) posle grant-a ponovo proveri envelope i svežu dostupnost, nastavi **isti** run; (7) izvrši fazu; gates čitaju server ledger; checkpoint na potvrđenoj granici; (8) `ProofReceipt` → `COMPLETED`; memorijska konsolidacija kao zasebno evidentirana, idempotentna operacija (ADR-05).

**ADR-02-O3 (PREDLOG) — kanonska stanja i mapa na postojeći ugovor (C12 PRIHVATITI):**

| Kanonsko | Legacy `CollaborationRunStatus` | Napomena |
|---|---|---|
| `QUEUED` | `queued` | 1:1 |
| `RUNNING` | `starting`, `running` | `starting` ostaje u enumu (zod/UI), mapira se na RUNNING |
| `BLOCKED_CAPABILITY` | — (novo) | ADR-04; legacy klijenti vide `waiting_for_approval` preko kompatibilne projekcije |
| `BLOCKED_APPROVAL` | `waiting_for_approval` | danas bez settera; postaje stvarno stanje run-a (ne samo held tool call) |
| `FAILED_RETRYABLE` | `failed` (+ `retryable:true`) | klasifikacija model/tool/infra/budget/evaluator (brief §7.3) obavezna u `reason` |
| `FAILED_FINAL` | `failed` | |
| `CANCELLED` | `cancelling` → `cancelled` | `cancelling` ostaje prelazno |
| `COMPLETED` | `completed` | samo uz `ProofReceipt` u `strict`/`benchmark`; u `normal` uz ispunjen recipe minimum |
| `interrupted` (legacy) | `interrupted` | **ne** postaje automatski `COMPLETED` ni `RUNNING`; migracija čuva razlog + poslednji cursor; eksplicitan resume API proverava validan checkpoint → `QUEUED`; bez checkpoint-a → `FAILED_RETRYABLE` sa razlogom `no_checkpoint` |
| `PAUSED` | `paused` | **ODLOŽENO** (R10): nema suspension primitiva; čekanje odobrenja ≠ korisnička pauza; vrednost ostaje u enumu, bez settera |

Vrednosti se ne brišu iz `COLLABORATION_RUN_STATUSES` (zod enum `routes/agent-runs.ts:15`, `RoomApp.tsx:51-66`).

**ADR-02-O4 (PREDLOG) — faza je jedinica oporavka (DIR-05, A6).** Nedovršena faza posle restart-a kreće iz poslednjeg validnog `Checkpoint`-a koristeći već potvrđene izlaze prethodnih faza; nema resume-a usred agent loop-a ni između model misli. Postojeći step-level `CheckpointStore` može ostati **interni** ispod fazne granice (ADAPT, ne prepisivanje), uz mapiranje `CheckpointStepState → Checkpoint`. Resume validira: `schemaVersion`, `recipeVersion` pinovanu za run, model/runtime dostupnost, `contextRef` validnost (ADR-05 O6: obrisan/revokovan izvor invalidira), i envelope.

**ADR-02-O5 (PREDLOG) — stabilni identitet radnje (DIR-06; ispravlja S1 A7).** `actionId` je server-persistiran identitet jedne nameravane/odobrene radnje, stabilan kroz retry i re-generisanje plana; `attemptId` identifikuje pokušaj; `providerIdempotencyKey` vezan za `actionId` kad ga servis podržava. Statusi: `planned → approved → dispatching → succeeded | failed | unknown_outcome`. `dispatching` se upisuje **pre** provider poziva; ako proces padne pre lokalnog ack-a, status ostaje `unknown_outcome` → prvo provider state/receipt check, inače korisnička provera; **bez blind retry-ja** za ne-idempotentan servis. Novi `actionId` ne sme služiti modelu kao prečica oko nerešenog prethodnog pokušaja iste radnje (dedup po `runId + phaseId + tool + argsFingerprint` dok postoji `unknown_outcome`). Dve odobrene occurrence rutine su dve radnje (ADR-07). Nema univerzalnog exactly-once obećanja.

**ADR-02-O6 (PREDLOG) — jedan ovlašćeni izvršilac po fazi (AT-09).** `DurableRun.leaseOwner/leaseUntil` sa uslovnim claim-om (`UPDATE … WHERE leaseOwner IS NULL OR leaseUntil < now`) i fencing tokenom u svakom side-effect pozivu; stari proces sa isteklim lease-om ne sme započeti novu sporednu radnju. Isti obrazac primeniti na `acquireRunLease` rutina (danas čist `INSERT`, `cron-store.ts:442-447`, bez UNIQUE — F-DUR-10).

**ADR-02-O7 (PREDLOG) — budžet preživljava restart (A10).** `Checkpoint.spent` je obavezno polje; `DurableRun.budget.spent` se ažurira na granici turna, ne samo terminalno; restart ne resetuje potrošnju; judge/evaluator trošak (ADR-06) ulazi u isti budžet run-a.

**ADR-02-O8 (PREDLOG) — store: kandidat, ne odluka (A8, R22, brief §14).** Kriterijumi: embed u Fastify sidecar, SQLite (better-sqlite3 12.6.2 već isporučen), Windows, permisivna licenca, migracije sa `schemaVersion`, retention/GC, bez Postgres/zasebnog procesa. Ograničen spike sa dve grane: (a) ADAPT Reflow (`reflow-ts/sqlite-node`, MIT) — pregled koda/testova, vendor ili fork, procena bus-factor rizika; (b) minimalan BUILD nad better-sqlite3 uz Reflow/Morling/persistasaurus kao reference. Kriterijum izbora su testovi ADR-02-T1..T3 (AT-07/08/09; = BvB §3 T1–T3) i BvB T9 (zavisnosti), izvršeni nad throwaway prototipom obe grane u dev Node okruženju, ne LOC; ADR-02-T4..T10 (uklj. ADR-02-T6 `MAX_EVENTS` overflow/`resetRequired` → AT-10 i packaged crash-injection T10; `sinceSeq` reconnect je BvB T4 → W1-PR8, nije u ADR-02-T skupu) su exit kriterijumi izabrane grane u W1/F2, ne kriterijum spike-a (Delivery plan W1-PR1, 28.09.2026: oni zavise od samog izbora). `runs.db` kao zaseban fajl u `dataDir` je kandidat lokacije (execution state **nije** u `.mind`, brief §6.3/§8.2); konačna lokacija = inženjerska odluka Durable owner-a (MDQ-01, BvB Q1, posle dvogranskog spike-a), upisuje se u O8 i ratifikuje sa ADR-02 (RAT-02); nije DQ (van DQ-01..09, brief §20.3; ADR-INDEX §3). `AgentRunRegistry` postaje adapter nad novim store-om, zadržava `eventsSince/resetRequired`, atomic write se ne gubi.

**ADR-02-O9 (PREDLOG) — atomicity granica (brief §6.3).** Atomično je samo ono što je u istoj transakciji izabranog store-a (run + checkpoint + events + action status). Spoljni mejl, filesystem artefakt i zaseban `.mind` upis nisu u toj transakciji: artefakti se referenciraju hash-om (sadržaj, ne poslovna tačnost), memorijski upisi idu kroz idempotentnu konsolidaciju (ADR-05), spoljne radnje kroz `ToolAction` statusni model (O5) sa outbox/reconciliation semantikom.

## §3 — Šta zamenjuje i zašto

| Prethodno | Gde | Zašto |
|---|---|---|
| „Svi aktivni interni runovi → `interrupted` (terminalno) na restart” | `agent-run-registry.ts:510-520`; test `:195-218` | Namerno i testirano, ali bez ikakve resume putanje; jaz prema DIR-05/AT-07 (POTVRĐENO NA REVIZIJI). Ostaje kao **legacy stanje** sa razlogom, dobija eksplicitan resume |
| `agent-runs.json` v1 whole-file store | `agent-run-registry.ts:29,497-574`; `index.ts:538` | Nema migracione šeme/retencije, `MAX_EVENTS` odbacuje istoriju, corrupt → tihi gubitak (POTVRĐENO). Postaje adapter/import izvor |
| S1 A7 idempotency ključ `runId+phaseId+attempt+callIndex` | docs/plans/v1.2-evidence/inputs/S1-audit-2026-09-27.md A7 | Identifikuje pokušaj, ne radnju; promena `attempt` menja ključ (brief §6.5 DIR-06 „važna korekcija A7”) |
| Held-action „jedna radnja = jedan pokušaj”, bez `unknown_outcome` | `held-action-executor.ts:233-235`; `cron-store.ts:88` | Crash posle provider uspeha ostavlja `approved` zauvek (POTVRĐENO). Obrazac atomic claim-a se **čuva** (BORROW), statusni model se širi |
| FRD v1.1 §3 redosled (run u koraku 7) i §4 `PAUSED` | docs/plans/v1.2-evidence/inputs/Waggle_FRD_v1.1_2026-09-27.md:41-69 | C8 PRIHVATITI: run pre blokiranja i trajnog konteksta; C12: PAUSED odloženo dok nema semantike |
| S1 §3 „Build ~600–1000 LOC on better-sqlite3” kao zaključak | docs/plans/v1.2-evidence/inputs/S1-audit-2026-09-27.md §3 red „Durable-execution engines” | R22: Build-vs-Borrow odlučuje; Reflow je realan ADAPT kandidat (external.md §3) |
| Loop execution state u `AwarenessLayer` `.mind` | `loop-executor.ts:212-230,311-322` | Execution state nije semantički frame (brief §8.2); zagađuje recall (`toContext()`) |

**ADR-02-Z1 (ODLUKA — ne otvara se).** D-14 (dug rad je deo proizvoda) i D-17 (BORROW→ADAPT→BUILD) se ne odlučuju ponovo; ovaj ADR ih primenjuje.

## §4 — Posledice

**ADR-02-P1 (PREDLOG).** Migraciona mapa (brief §12.4, A2), sve sa `schemaVersion`, dry-run, snapshot, rollback:
1. `agent-runs.json v1 → runs store`: statusi 1:1 po O3; `interrupted` zadržava `result.error` kao `reason`, `progress` kao cursor; ne pokreće se automatski.
2. Cron leases / Loop `loop:<id>` Awareness state → execution store; raspored ostaje u `cron_schedules`; report frame ostaje u mind-u (nije execution state); occurrence identitet (ADR-07).
3. `pending_actions` → `ToolAction` model ili adapter: postojeći redovi dobijaju `actionId = id`, status mapiran (`held→planned/approved`, `executed→succeeded`).
4. Harness `verified` traces → `unqualified` (ADR-01 P2).
5. Novi store-ovi ulaze u erasure/export (`erased_subjects`, `stableHarvestId` obrazac) — checkpoint i artifact reference su korisnički/tuđi sadržaj (A3; ADR-10).

**ADR-02-P2 (PREDLOG).** Testovi koji pucaju ili se moraju prepisati (POTVRĐENO NA REVIZIJI da postoje): `agent-run-registry.test.ts:84-94` („rejects illegal terminal transitions” — zato resume ide kroz eksplicitan API, ne kroz `ALLOWED_TRANSITIONS`), `:195-218` (pinuje `interrupted`); `held-action-executor.test.ts:108-131` ostaju zeleni ako terminalni statusi ostanu `executed/failed`, ali `PendingActionStatus` union se širi — proveriti `switch` bez default-a (grep: nema u ne-test kodu; `ApprovalsApp.tsx:182,301` filtrira po `source`, ne po statusu).

**ADR-02-P3 (PREDLOG).** Sredstva koja se čuvaju (BORROW iz Waggle-a): `AgentRunRegistry` revision/seq log + `eventsSince/resetRequired` + atomic persist (`:243-257,539-574`); `reconcileExternalProcesses` (`:381-395`, pid-based preživljavanje eksternih runova, test `tests/tools-routes-launch.test.ts:1148-1170` — putanja ispravljena po refute-u); `CheckpointStore`/`RecoveryRunner` semantika; held-action atomic claim + TTL + execute-time re-validacija; `AbortSignal` kroz agent loop (`agent-loop.ts:1090-1108`); harvest M-08 resume obrazac.

**ADR-02-P4 (PREDLOG).** `fleet spawn` (`POST /api/fleet/spawn`, 202; `fleet-run-executor.ts:480-515` kreira room+worker pre izvršenja) je najbliži postojeći interni tok koji nastavlja bez klijentskog socket-a — kandidat za prvi ADAPT na `DurableRun`; ne preživljava restart (registry ga označi `interrupted`). BORROW presedan za preživljavanje restarta je external-tool pid-reconcile (P3; F-DUR-12 refute).

**ADR-02-P5 (PREDLOG).** Receipt: dira chat/harness/run površinu → obavezan novi kandidat SHA + fresh receipts + **crash-injection receipt na packaged Windows kandidatu** (brief §15.4; release-oss.md F-REL-03: takav alat NIJE NAĐEN, novi posao).

**ADR-02-P6 (PREDLOG).** Retention/GC: run store dobija retention politiku (npr. terminalni runovi > N dana → arhiva/GC; artifact reference ostaju dok artefakt postoji); `MAX_EVENTS` semantika zamenjena `seq` + `resetRequired` po run-u (ADR-03).

## §5 — Rizik

| ID | Rizik | V/U | Mitigacija |
|---|---|---|---|
| ADR-02-R1 | Dira `agent-loop.ts` i chat hot path; konflikti paralelnih tokova | visoka / visoka | hotspot merge owner (brief §15.3); server-driven executor kao novi modul iza interfejsa, agent-loop menja samo AbortSignal/ledger callback |
| ADR-02-R2 | Side-effect replay pri resume-u (dupli mejl) | srednja / kritična | O4 potvrđeni izlazi + O5 `unknown_outcome` + AT-08 |
| ADR-02-R3 | Reflow bus factor 1 / neodržavanje | srednja / srednja | vendor + fork strategija u Build-vs-Borrow zapisu; exit plan (ugovor je naš, engine zamenljiv) |
| ADR-02-R4 | Migracija `agent-runs.json` gubi istoriju ili oživljava stare runove | niska / visoka | dry-run + snapshot; `interrupted` nikad auto-RUNNING (O3) |
| ADR-02-R5 | Nova baza pored `.mind` i `cron-store` — tri SQLite fajla, tri migraciona lanca | visoka / niska | jedan `schemaVersion` registar; store odluka u §14 zapisu može izabrati postojeći `cron-store.ts` DB za execution tabele ako testovi to dozvole |
| ADR-02-R6 | Erasure ne pokriva checkpoint kopije sadržaja | srednja / visoka (GDPR) | O1 reference-first; ADR-10; AT-15/AT-27 |

## §6 — Migration test

| ID | Test | Očekivanje | AT |
|---|---|---|---|
| ADR-02-T1 | Crash (SIGKILL sidecar-a) posle potvrđene faze 2 od 4; restart → run nastavlja fazom 3 sa istim `contextRef`/artifact referencama; `spent` iz faza 1–2 sačuvan | RED danas (run → `interrupted`, bez checkpoint-a) | AT-07 |
| ADR-02-T2 | Crash između provider uspeha i lokalnog ack-a (`dispatching`) → status `unknown_outcome`; resume ne šalje ponovo; UI prikazuje „ishod nepoznat — proveri” | RED danas (red ostaje `approved`, nema statusa) | AT-08 |
| ADR-02-T3 | Dva procesa nad istim `dataDir` pokušaju isti run → samo jedan drži lease; drugi ne sme započeti side-effect | RED danas (nema lease-a za runove; cron lease čist INSERT) | AT-09 |
| ADR-02-T4 | `interrupted` run iz `agent-runs.json v1` posle migracije: status/razlog sačuvani; `POST /api/runs/:id/resume` bez checkpoint-a → `FAILED_RETRYABLE(no_checkpoint)`; sa checkpoint-om → `QUEUED` | novi | AT-27 |
| ADR-02-T5 | Migracija ponovljiva: dva puta ista ulazna datoteka → identičan store; rollback vraća v1 fajl bez dupliranja radnji | novi | AT-27 |
| ADR-02-T6 | `MAX_EVENTS` overflow i corrupt `agent-runs.json`: klijent dobija `resetRequired`; korisnik dobija upozorenje (ne tihi prazan store) | RED danas (testovi ne postoje; refute F-DUR-02) | AT-10 |
| ADR-02-T7 | Budget: restart posle 60 % potrošnje → `budget.spent` ≥ 60 %; nastavak ne resetuje | RED danas (F-DUR-07) | AT-03/AT-07 |
| ADR-02-T8 | Loop `loop:<id>` state posle migracije nije u `AwarenessLayer.toContext()` izlazu; report frame ostaje | RED danas (F-DUR-09 refute) | AT-23 |
| ADR-02-T9 | Strict run bez `ProofReceipt` ne može u `COMPLETED` (API odbija tranziciju) | novi | AT-01 |
| ADR-02-T10 | Crash-injection na packaged Windows build-u (certify korak): kill sidecar-a usred faze → restart → T1 ishod | NIJE NAĐEN alat (F-REL-03) — novi receipt korak | AT-07/AT-30 |

**Granica provere:** ništa od gornjeg nije izvršeno; F-DUR nalazi su čitanje koda + dva `node -e` probe-a (better-sqlite3 in-memory, cron-parser) van repoa.

## §7 — Izvori

- **D:** D-14, D-17 (brief §3)
- **DIR:** DIR-04, DIR-05, DIR-06, DIR-21 (brief §6.2–6.5, §12.4)
- **C/A/R:** C8, C12; A2, A6, A7 (ISPRAVITI DIZAJN), A8 (KANDIDAT + ADR), A10; R10, R20, R22
- **AT:** AT-07, AT-08, AT-09, AT-10, AT-15, AT-23, AT-27
- **Phase A:** `docs/plans/v1.2-evidence/phaseA/durable.md` F-DUR-01..05, 07, 09, 12, 13; `docs/plans/v1.2-evidence/phaseA/durable.refute.md` (HOLDS/WEAKENED, harvest M-08 kontekst, `tests/tools-routes-launch.test.ts` putanja); `docs/plans/v1.2-evidence/phaseA/external.md` §2.1, §3, §8 (Reflow, DBOS, Temporal, agent-native licenca; live eksterni podaci 27.09.2026 = NALAZ AUDITA — ZA PROVERU)
- **S1:** L12; A2, A6–A10; W1; §3 „Durable-execution engines”, „BuilderIO agent-native”
- **Kod (na `2af0904d`):** `packages/server/src/local/agent-run-registry.ts:29,41,137,243-257,282,330,497-574,510-520`; `packages/shared/src/types.ts:398-402`; `packages/agent/src/long-task/{checkpoint,recovery}.ts`; `retrieval-agent-loop.ts:153,568-579,713-755`; `packages/server/src/local/held-action-executor.ts:6-10,154-166,233-235`; `packages/core/src/cron-store.ts:83-88,442-447,551-556`; `packages/server/src/local/routes/approval.ts:58-85`; `fleet-run-executor.ts:480-515,746-766`; `loop-executor.ts:212-230,311-322`; `index.ts:538,2596-2597`; `packages/hive-mind-core/src/mind/awareness.ts:142-168`; `packages/agent/src/workflow-harness.ts:110-128`; `workflow-tools.ts:362-457`
