# Phase A — revalidacija grupe „durable" (Durable runs & routines)

- **Revizija:** `main = 2af0904df01ca3d374cc78ba95b60dc579dd6a7a` (`git rev-parse HEAD` potvrđen; `git status --porcelain` prikazuje samo dva untracked `.docx` fajla u `docs/`, dakle radno stablo == HEAD za sve citirane izvorne fajlove).
- **Datum:** 2026-09-27. Repo tretiran read-only; ništa nije menjano, instalirano ni pokretano u repou.
- **Obim (iz zadatka):** S1 L12, C12, C15, A6–A10, W1, W5; brief §6.2–6.5, §11.5, AT-07..AT-10, AT-23.
- **Napomena o S1:** S1 je rađen na istoj reviziji `2af0904d` (S1 uvod). Zato nijedan nalaz nije mogao da bude „popravljen posle audita"; status **VEĆ ZATVORENO** dobija samo ono što je S1 pogrešno prijavio ili što je već bilo zatvoreno u kodu na toj reviziji.
- **Metod:** čitanje fajlova + višestruki grep po sposobnosti (ne po imenu): `DurableRun|ProofReceipt|ToolCallJournal|runs.db|idempotencyKey|actionId` (0 pogodaka u durable smislu), `sinceSeq|Last-Event-ID|lastEventId` (0 u server/src), `CheckpointStore|RecoveryRunner` (pozivaoci), `pause:|resume:|status: 'paused'|'waiting_for_approval'|'starting'` (setteri), `timezone|tz|misfire|catch-up|DST` (cron), `background|detach` (chat).

---

## 1. Registar nalaza

Format po briefu §1: commit · putanja/simbol · ulaz · trenutni izlaz · repro test ili granica provere · očekivano · najmanja promena · AT.

### F-DUR-01 — Restart označava SVE aktivne interne runove kao terminalno `interrupted` (S1 L12, A6, A8)
- **Status:** POTVRĐENO NA REVIZIJI
- **Putanja/simbol:** `packages/server/src/local/agent-run-registry.ts:510-520` `AgentRunRegistry.interruptInFlightInternalRuns()`, pozvan iz konstruktora `:137`; `ALLOWED_TRANSITIONS.interrupted = new Set()` (`:41`), `TERMINAL_STATUSES` uključuje `interrupted` (`:26-28`); `control()` na terminalnom runu baca `Run is already interrupted` (`:282`).
- **Ulaz:** `agent-runs.json` sa runom čiji je `source !== 'external_tool'` i status u `ACTIVE_STATUSES` (`queued|starting|running|waiting_for_approval|paused|cancelling`, `:23-25`), zatim novi proces.
- **Trenutni izlaz:** status `interrupted`, `result.error = 'Waggle restarted before this run finished'`, `completedAt` postavljen (`:452`). Nema resume putanje: nijedno mesto u `packages/server/src` ne prelazi iz `interrupted` (grep `'interrupted'` — svi pogoci su terminal-filteri: `index.ts:1811`, `chat-collaboration.ts:29,665`, `fleet-run-executor.ts:821,866`, `agent-groups.ts`, `tools.ts`, `external-tool-runs.ts`). UI mapira `interrupted → 'failed'` (`apps/web/src/lib/room-state-reducer.ts:228`, `packages/server/src/local/routes/agents.ts:155`).
- **Repro test / granica:** `packages/server/tests/local/agent-run-registry.test.ts:195-218` (`restored.get(internal.id)?.status === 'interrupted'`). Nije izvršen u ovoj sesiji (read-only); test postoji i asertuje upravo ovo ponašanje kao željeno.
- **Očekivano (brief §6.4, DIR-05):** `interrupted` čuva razlog prekida i cursor faze; ne postaje automatski `COMPLETED` niti bezuslovno `RUNNING`; eksplicitan resume koji validira checkpoint.
- **Najmanja promena:** zadržati označavanje `interrupted`, ali (a) upisati razlog + poslednji poznati `progress`/cursor umesto samo `result.error`, (b) dozvoliti tranziciju `interrupted → queued` isključivo kroz eksplicitan resume API koji proverava postojanje validnog checkpoint-a; do tada UI mora `interrupted` prikazati kao failure/partial (AT-22), što danas i radi.
- **AT:** AT-07, AT-22, AT-10.

### F-DUR-02 — `agent-runs.json` je whole-file JSON store bez šeme migracije i bez retencije (S1 A2, A8)
- **Status:** POTVRĐENO NA REVIZIJI
- **Putanja/simbol:** `agent-run-registry.ts:539-574` `persist()` (tmp + rename, Windows fallback sa `.bak`), `:497-508` `record()` (persist na SVAKI upsert), `:29` `MAX_EVENTS = 2_000`, `:522-537` `load()` (`version !== 1` → prazan store; corrupt JSON → tiho prazan store, komentar `:534-535`), `:243-257` `eventsSince()` vraća `resetRequired` kad je `since` stariji od najstarijeg zadržanog eventa. Instanciranje: `packages/server/src/local/index.ts:538` `new AgentRunRegistry(path.join(fullConfig.dataDir, 'agent-runs.json'))`.
- **Ulaz:** >2 000 upsert događaja ili corrupt fajl.
- **Trenutni izlaz:** najstariji eventi se odbacuju; klijent sa starim `since` dobija `resetRequired + snapshot`; corrupt fajl = gubitak istorije runova bez upozorenja korisniku.
- **Repro test / granica:** `packages/server/tests/waggle-dance-routes.test.ts:225,291` čita fajl; nema testa za corrupt/version-mismatch ni za MAX_EVENTS overflow (granica provere: nije nađen grep-om `resetRequired` u tests).
- **Očekivano (brief §6.3, §12.4):** `schemaVersion`, dry-run migracija, retention/GC, mapiranje statusa; izbor store-a prolazi §14 (BORROW→ADAPT→BUILD), SQLite je kandidat, ne odluka.
- **Najmanja promena:** dokumentovati u planu migracionu mapu `agent-runs.json v1 → ciljni store` (statusi 1:1, `interrupted` zadržava razlog); ne uvoditi novu bazu bez §14 zapisa. Atomic write logika (`:548-573`) je asset koji treba sačuvati.
- **AT:** AT-07, AT-10.

### F-DUR-03 — `CollaborationRunStatus` vs FRD §4: 10 stanja, tri praktično mrtva, `paused` bez semantike (S1 C12)
- **Status:** POTVRĐENO NA REVIZIJI
- **Putanja/simbol:** `packages/shared/src/types.ts:398-402` `COLLABORATION_RUN_STATUSES = ['queued','starting','running','waiting_for_approval','paused','cancelling','completed','failed','cancelled','interrupted']`; `:404-405` kontrole `cancel|pause|resume|message`; `:445-450` `capabilities`. Odvojena unija `AGENT_RUN_STATES` (`types.ts:381-384`) ima svoj `paused` (lifecycle sačuvanog Agent blueprint-a, komentar `:376-380`).
- **Ulaz/provera:** grep settera u `packages/server/src`: `status: 'waiting_for_approval'` — 0 pogodaka; `status: 'starting'` — 0 pogodaka; `capabilities.pause/resume = true` — 0 pogodaka (samo `DEFAULT_CAPABILITIES` false, `agent-run-registry.ts:46-47`); `status: 'paused'` samo u `control('pause')` (`:330`) koji zahteva capability+handler koje niko ne registruje, i u `derivedStatus` (`:613`).
- **Trenutni izlaz:** `starting`, `waiting_for_approval`, `paused` postoje u tipu, tranzicijama i UI mapiranju (`RoomApp.tsx:51-66`, `routes/agents.ts:149-160`, `room-state-reducer.ts:228`, `routes/agent-runs.ts:15` zod enum, `external-tool-runs.ts:1450`, `tools.ts:149,216`, `fleet-run-executor.ts:48`, `anthropic-proxy.ts:483`, `security-middleware.ts:667-673`, `index.ts:1811`) ali ih ništa ne proizvodi. FRD §4 stanja (`BLOCKED_CAPABILITY`, `BLOCKED_APPROVAL`, `FAILED_RETRYABLE`, `FAILED_FINAL`) nemaju ekvivalent; `interrupted`/`cancelling`/`starting` nemaju FRD ekvivalent.
- **Repro test / granica:** `agent-run-registry.test.ts` pokriva tranzicije; nema testa koji proizvodi `paused`/`waiting_for_approval` kroz produkcioni tok (pretraženo `tests/local/*.test.ts` po `'paused'` — samo unit tranzicije).
- **Očekivano (brief §6.4, C12 PRIHVATITI):** kanonska/legacy mapa stanja uz očuvanje API ugovora; `PAUSED` odložiti dok nema semantike (čekanje odobrenja ≠ korisnička pauza).
- **Najmanja promena:** tabela mapiranja u FRD v1.2: `queued→QUEUED`, `starting|running→RUNNING`, `waiting_for_approval→BLOCKED_APPROVAL`, `cancelling→(prelazno, zadržati)`, `completed→COMPLETED`, `cancelled→CANCELLED`, `failed→FAILED_FINAL` (dok ne postoji klasifikacija), `interrupted→(legacy, razlog + resume provera)`, `paused→ODLOŽENO`. Ne brisati vrednosti iz `COLLABORATION_RUN_STATUSES` (zod enum na ruti + web tipovi zavise od njih).
- **AT:** AT-07, AT-10, AT-22.

### F-DUR-04 — `long-task/checkpoint.ts` + `recovery.ts` postoje i testirani su, ali nisu povezani ni sa jednim produkcionim runom (S1 W1 „preserve semantics")
- **Status:** DELIMIČNO/NEPOVEZANO
- **Putanja/simbol:** `packages/agent/src/long-task/checkpoint.ts` (`CheckpointStore`, `save` tmp+rename `:170-211`, `verifyIntegrity` `:267-290`, `CHECKPOINT_SCHEMA_VERSION=1` `:31`, per-step `cost_usd` `:85`); `recovery.ts` (`RecoveryRunner.run` `:250-344`, `_resolveStartingPoint` `:350-386` — fresh/resume_clean/resume_from_error; persistence cadence samo success/exhaustion `:31-35`). Jedini ne-test potrošač: `packages/agent/src/retrieval-agent-loop.ts:153` (opcioni `checkpointStore`), resume `:568-579` (proverava `latest.run_id === runId`, „finalized → cached result"), per-turn save `:713-755` sa `total_cost_usd/total_tokens_*` u `step_output` (`:729-733`). `RecoveryRunner`: 0 ne-test pozivalaca (samo export `packages/agent/src/index.ts:152`). `agent-loop.ts`: 0 pogodaka za `checkpoint`. `routes/agent-run.ts` (`/api/agent/run`, poziva `runRetrievalAgentLoop` `:305`): 0 pogodaka za `checkpointStore`. `benchmarks/gaia2/adapter.ts`: 0 pogodaka.
- **Ulaz:** produkcioni chat (`/api/chat`), fleet spawn, `/api/agent/run`, cron `ai_task`.
- **Trenutni izlaz:** nijedan od tih tokova ne piše checkpoint; kod restarta run postaje `interrupted` (F-DUR-01) bez podataka za nastavak.
- **Repro test / granica:** cross-process resume dokazan samo u testu `packages/agent/tests/long-task-loop-integration.test.ts:221-284` (`mid-loop crash → fresh runner → resumes from next turn`; `finalized checkpoint → cached result`; `:286` „resume preserves running totals across processes"). Jedinica oporavka je LLM turn (step), ne faza (DIR-05).
- **Očekivano (brief §6.4 DIR-05, AT-07):** faza kao jedinica oporavka, checkpoint na potvrđenoj granici sa referencama i potrošenim budžetom.
- **Najmanja promena:** nema promene koda u ovoj fazi; u planu ga označiti kao **asset za ADAPT**, ne kao „gotovu durable funkciju". Za W1 dovoljno je: definisati mapiranje `CheckpointStepState → Checkpoint` (brief §6.3) i odlučiti da li se step-granularnost zadržava kao interna ispod fazne granice.
- **AT:** AT-07, AT-03.

### F-DUR-05 — Held-action executor: idempotentan claim + ADR „never mid-run suspend/resume" postoji inline; nema `unknown_outcome` ni provider ključa (S1 C14, A7)
- **Status:** POTVRĐENO NA REVIZIJI (ADR i idempotency), DELIMIČNO za DIR-06
- **Putanja/simbol:** `packages/server/src/local/held-action-executor.ts:6-10` (ADR tekst: „never mid-run suspend/resume … the only 'suspend' primitive in the codebase is request-bound and restart-fatal"), `:154-160` atomic claim `held→approved` preko `cronStore.claimPendingAction` (`packages/core/src/cron-store.ts:551-556`, `UPDATE … WHERE id=? AND status='held'`), `:29` TTL 7 dana, `:162-166` expiry guard, `:191-206` re-validacija allowlist/critical/injection/workspace na execute, `:221-225` alias `send_email → connector_*_send_email` na LIVE pool-u, `:233-235` `tool.execute` pa `updatePendingActionResult('executed')`. `PendingActionStatus = 'held'|'approved'|'denied'|'executed'|'failed'|'expired'` (`cron-store.ts:88`). Producenti: Loop L2 (`index.ts:2632-2645`), `proposeHeld` turovi — ai_task (`index.ts:2439`), channel (`channels/manager.ts:261`), session-reviewer (`index.ts:2728`) — kroz `chat-approval-hook.ts:301-323`. Potrošač: `routes/approval.ts:58-82` (`POST /api/approval/:requestId`), lista `:90-99` (`/api/approval/pending`, union live+held).
- **Ulaz:** dupli approve; approve posle TTL; crash između `tool.execute` (`:233`) i upisa rezultata (`:235`).
- **Trenutni izlaz:** dupli approve → `already decided` (nema drugog izvršenja); expired → `failed`; crash posle provider uspeha → red ostaje `approved` zauvek: nema `unknown_outcome`, nema reconciliation-a, ali ni blind retry-ja (re-approve je odbijen). Nema `providerIdempotencyKey` (grep 0). Identitet radnje = `pending_actions.id` (jedna radnja = jedan pokušaj); nema odvojenog `attemptId`.
- **Repro test / granica:** `packages/server/tests/local/held-action-executor.test.ts:120-128` (idempotent), `:193` (expired), `:292-317` (no longer proposable). Nema testa za crash-after-provider-success.
- **Očekivano (brief §6.5 DIR-06, AT-08):** `actionId` stabilan kroz retry, `attemptId`, status `unknown_outcome` sa provider proverom ili korisničkom potvrdom; nema univerzalnog exactly-once obećanja.
- **Najmanja promena:** dodati status `unknown_outcome` (ili ekvivalent) koji se upisuje PRE `tool.execute` (npr. `dispatching`) i razrešava posle; UI ga prikazuje kao „ishod nepoznat — proveri". Superseding ADR za C14 je posao pisaca (brief §20 lista ADR (4)). Napomena: S1 predlog ključa `runId+phaseId+attempt+callIndex` nije prisutan u kodu; postojeći pattern je bliži DIR-06 (stabilan id radnje) nego S1 A7.
- **AT:** AT-08, AT-10.

### F-DUR-06 — Zatvaranje SSE socket-a prekida run (R3-008); Stop u UI == zatvaranje socket-a; nema detach ni `sinceSeq` za chat (S1 A9)
- **Status:** POTVRĐENO NA REVIZIJI (namerno ponašanje)
- **Putanja/simbol:** server `packages/server/src/local/routes/chat.ts:1604-1612` (`raw.once('close', () => { if (!raw.writableEnded) abortController.abort(); })`, komentar „must abort the provider/tool run immediately"); `packages/agent/src/agent-loop.ts:1090-1108` (R3-008: `config.signal` spojen `AbortSignal.any` sa timeout signalima i prosleđen u fetch `:1147`), `:973-975` provera između turnova, `:1458-1468` post-read guard, `:1663,1827,1872` dodatne provere. Klijent: `apps/web/src/lib/adapter.ts:1122-1148` (fetch sa controller.signal), `:1184-1192` `finally` → `controller.abort()` + `reader.cancel()`, `:1196-1208` `abortAgent()`; `apps/web/src/hooks/useChat.ts:463-469` (Stop) i `:473-487` (unmount takođe abortuje). Subagenti nasleđuju prekid roditelja: `chat-collaboration.ts:110-128` `linkParentCancellation` → `registry.control(runId,'cancel')`.
- **Ulaz:** korisnik klikne Stop / zatvori tab / mreža padne tokom `/api/chat` streama.
- **Trenutni izlaz:** turn i svi child subagent runovi se otkazuju; nema opcije „nastavi u pozadini" (grep `background|detach` u `useChat.ts`: 0). Za replay: `GET /api/agent-runs/events?since=` postoji za registry upsert događaje (`routes/agent-runs.ts:20-22,73-84`, `agent-run-registry.ts:243-257`, `resetRequired`), ali chat SSE nema `sinceSeq`/`Last-Event-ID` (grep `packages/server/src`: 0); `/api/events/stream` (`routes/events.ts:328-359`) je live-only.
- **Repro test / granica:** `packages/agent/tests/agent-loop.test.ts:1981-2010` (R3-008 forwarding); poreklo odluke `docs/audits/2026-05-29-prod-readiness/REPORT.md:103,157`. UX copy koja to kaže korisniku nije proverena (nije nađen string u web kodu; granica provere).
- **Očekivano (brief §6.4):** gubitak veze nije korisnički cancel; foreground putanja koja namerno prekida mora to jasno reći; durable putanja ima poseban ugovor; `sinceSeq` ekvivalent za reconnect.
- **Najmanja promena:** (a) UX tekst na Stop/disconnect: „prekid zaustavlja posao"; (b) ne menjati R3-008 za foreground chat pre W1; (c) za registry stream `since` već postoji — dokumentovati kao kompatibilan ekvivalent `sinceSeq` za run-status, ne za tekst/kartice.
- **AT:** AT-10.

### F-DUR-07 — Budžet: dnevni spend preživljava restart, per-run budžet ne postoji u checkpoint-u (S1 A10)
- **Status:** DELIMIČNO/NEPOVEZANO
- **Putanja/simbol:** per-run metrike se upisuju u registry tek na kraju: `packages/server/src/local/fleet-run-executor.ts:746-766, 825-840, 883` (`metrics.inputTokens/outputTokens/costUsd`), progresivno samo `toolsUsed` (`:698`); dnevni total kroz `costTracker` + `modelSpendBudget` rezervacije (in-memory, `agent-loop.ts` ne perzistira). Checkpoint (retrieval loop) nosi `total_cost_usd` (`retrieval-agent-loop.ts:731`) ali nije u produkciji (F-DUR-04). Cron ai_task ima dnevni cap `AI_TASK_DAILY_CAP=24` preko `cronStore.countExecutionsToday` (`index.ts:1917, 2414-2418`; `cron-store.ts:406-411`, UTC `date('now')`).
- **Ulaz:** restart usred fleet run-a; restart posle 23 ai_task izvršenja.
- **Trenutni izlaz:** run → `interrupted` bez upisa potrošenih tokena tog runa (metrics ostaju iz poslednjeg terminalnog patch-a, tj. nema ih); dnevni total preživljava (`packages/server/tests/local-mode.test.ts:1067-1075` asertuje `getDailyTotal()` == 0.018 posle `buildLocalServer` restarta); ai_task cap preživljava (history tabela).
- **Repro test / granica:** `local-mode.test.ts:1030-1117` (dnevni budžet posle restarta); nema testa za per-run potrošnju posle restarta.
- **Očekivano (brief §6.3 Checkpoint „potrošeni budžet", §6.5 „restart ne resetuje potrošnju").**
- **Najmanja promena:** u planu W1: `Checkpoint.spent` obavezno polje; do tada progresivno patch-ovati `metrics` u registry na granici turna (mali dodatak u `fleet-run-executor.ts`), da `interrupted` run bar nosi potrošnju.
- **AT:** AT-03, AT-07, AT-23.

### F-DUR-08 — `harnessEvents` je globalni emitter bez `runId`; run id postoji u tool sloju ali se ne emituje (S1 A11, AT-06)
- **Status:** POTVRĐENO NA REVIZIJI
- **Putanja/simbol:** `packages/agent/src/workflow-harness.ts:132` `export const harnessEvents = new EventEmitter()`; payloadi `:169-183` (`HarnessPhaseStartEvent/CompleteEvent`: `harnessId, phaseId, phaseName…`), emit `:144-148, 243-256, 292-300, 323-335, 344-353, 359-369` — nigde `runId`. `harnessId` = id šablona (`getHarnessById(harnessId)`, `workflow-tools.ts:366`), ne instanca. Run instanca postoji: `workflow-tools.ts:447` `activeHarnessRuns` (module-level Map, in-memory), `:453-457` `generateHarnessRunId`, `:373-375` kreiranje, `:405,429` brisanje po završetku. `HarnessTraceBridge` tag-uje samo `harnessId` (`harness-trace-bridge.ts:22-24, 131-133, 159`); `index.ts:612-616` jedna globalna bridge instanca.
- **Ulaz:** dva istovremena Workspace-a pokreću isti harness (`harness_id` isti).
- **Trenutni izlaz:** događaji i trace tagovi nerazlučivi po instanci (AT-06); harness run state nestaje na restart (Map).
- **Repro test / granica:** `packages/agent/tests/harness-trace-bridge.test.ts:306-309` koristi shared emitter; nema testa sa dva paralelna runa.
- **Očekivano (brief §6.4 „run-scoped event bus; globalni harnessId nije dovoljan").**
- **Najmanja promena:** aditivno polje `runId` u sva tri event payload-a (izvor: `providedRunId`/`runId` iz `workflow-tools.ts:364,374`) i u bridge tagove; `advancePhase` treba da primi runId (potpis `:213`). Ne dira semantiku gate-ova (W0 grupa).
- **AT:** AT-06, AT-10.

### F-DUR-09 — Loops L2: maker TOOLLESS, jedna predložena radnja ide u held queue; cross-tick stanje živi u Awareness sloju `.mind` (S1 C15, A2)
- **Status:** POTVRĐENO NA REVIZIJI
- **Putanja/simbol:** `packages/server/src/local/loop-executor.ts:9-18` (L1 garancija), `:99-102` `mode: 'report'|'assist'`, `:212-230` stanje `stateKey = loop:<id>` iz `AwarenessLayer.getByStatus`, `:224-230` throttle `minIntervalMs` po `lastTickAt` (ne po `schedule.last_run_at`), `:254-262` toolless `chat()`, `:271-274` `parseProposal`, `:295-303` frame upis `createIFrame('loop', …)` (default `writeToMemory=true`), `:311-322` `awareness.add('pending', …)/updateMetadata` sa `result/lastTickAt/score`. Izbor mind-a: `index.ts:2596-2597` (workspace mind ako `workspace_id` nije null/`'*'`, inače **personal**). L2 enqueue: `index.ts:2632-2645` → `enqueueHeldAction` (F-DUR-05).
- **Ulaz:** loop sa `workspace_id = null` ili `'*'`.
- **Trenutni izlaz:** execution state (poslednji rezultat, `lastTickAt`, score) upisan kao Awareness item u **personal** `.mind`; report frame u istom mind-u. Odluka „L2 ostaje TOOLLESS" je poštovana u kodu.
- **Repro test / granica:** `packages/server/tests/local/loop-executor.test.ts` (283 linije; nije čitan red po red — granica), `apps/web/src/test/phase3b-automation-center.test.tsx`.
- **Očekivano (brief §8.2 „Execution state … nije semantički memory frame"; §11.5; §12.4 „Cron leases / Loop state — razdvojiti raspored od execution state-a").**
- **Najmanja promena:** premestiti `loop:<id>` state (ne report frame) u execution store iz W1; do tada dodati `retrieval exclusion` za Awareness stavke sa `status` prefiksom `loop:` ako ih recall vidi (nije provereno da li `getByStatus` stavke ulaze u recall — NEPOZNATO).
- **AT:** AT-23.

### F-DUR-10 — Rutine: implicitna misfire politika, ponovno izvršenje iste occurrence posle crash-a, lease bez fencing-a, nema timezone polja (AT-23, AT-09)
- **Status:** POTVRĐENO NA REVIZIJI (politika postoji implicitno i nedokumentovano); NEPOZNATO za DST
- **Putanja/simbol:** `packages/core/src/cron-store.ts:367-371` `getDue()` = `enabled=1 AND next_run_at <= datetime('now')`; `:374-382` `markRun()` = `last_run_at=now`, `next_run_at=computeNextRun(cron_expr)`; `:203-206` `computeNextRun` = `parseExpression(cronExpr).next()` **bez `tz` opcije** (cron-parser `^4.9.0`, `packages/core/package.json:22`; instalirano 4.9.0; `node_modules/cron-parser/lib/expression.js:28` → `_tz = options.tz` → lokalna zona procesa). Nema `timezone` polja u šemi/rutama (grep `timezone|\btz\b` u `cron-store.ts`, `routes/cron.ts`, `routes/automations.ts`: 0). Scheduler: `packages/server/src/local/cron.ts:219-243` `tick()`, `:245-314` `runSchedule()` — `markRun` **samo posle uspeha** (`:276`); neuspeh → `failCounts`, auto-disable posle `MAX_CONSECUTIVE_FAILURES=5` (`:55, :307-311`, perzistira `job_config.auto_disabled` `:429-453`); rate-limit → one-shot resume timer (`:316-347`, in-memory). Lease: `:253-254` `acquireRunLease` = čist `INSERT` (`cron-store.ts:442-447`), bez uslovnog claim-a; `:366-389` `sweepInterruptedRuns` na start-u upisuje `failed_interrupted: process exited mid-run` u history i briše sve lease-ove, **ne dira `next_run_at`**. Executor prima samo `schedule` (`cron.ts:19`), bez occurrence id.
- **Ulaz i trenutni izlaz (izvedeno iz koda, nije izvršeno):**
  1. Laptop spava preko više termina → na prvom tick-u jedan catch-up fire (sve propuštene occurrence kolapsiraju u jednu; `next_run_at` se računa od `now`, ne od zakazanog termina).
  2. Job baci grešku → `next_run_at` ostaje u prošlosti → **ponovno pokretanje na svakom tick-u (60 s)** dok ne uspe ili dok 5 neuspeha ne isključi job.
  3. Crash usred izvršenja → na restart history dobija `failed_interrupted`, lease-ovi se čiste, i **ista occurrence se odmah ponovo izvršava** na prvom tick-u (nema occurrence identiteta, nema provere delimičnih sporednih radnji; za `ai_task` sa `proposeHeld` to može značiti dva held reda za isti intent).
  4. Dva procesa nad istim `dataDir` (npr. dupli sidecar) → oba mogu izvršiti isti job (single-flight je samo `this.ticking` po procesu; lease nije fencing).
  5. DST: cron-parser ima `_applyTimezoneShift` (`expression.js:411`), ponašanje na prelazu nije testirano u repou → NEPOZNATO.
- **Repro test / granica:** `packages/server/tests/local/cron-scheduler-hardening.test.ts:227-250` (stale lease sweep → history + notifikacija; `getFailCount === 1`), `:44-73` (rate-limit resume), `:180` (lease release on throw). Nema testa za „re-fire posle crash-a", „catch-up posle spavanja", „dva procesa", ni DST.
- **Očekivano (brief §11.5 DIR-19, AT-23):** eksplicitna misfire politika (skip / jedan catch-up / ograničeno pravilo), timezone, occurrence identitet, bez duplih radnji, budžet se ne resetuje.
- **Najmanja promena:** (a) dokumentovati postojeću implicitnu politiku kao „jedan catch-up + retry-svaki-tick + 5-strike disable" i odlučiti da li ostaje; (b) pre ponovnog izvršenja posle `failed_interrupted` zahtevati eksplicitan flag (npr. `job_config.rerunAfterInterrupt`) ili pomeriti `next_run_at` u `sweepInterruptedRuns`; (c) occurrence id = `cron_execution_history.id` ili `lease.id` prosleđen executor-u; (d) `acquireRunLease` kao uslovni `INSERT … WHERE NOT EXISTS` (fencing). Timezone polje je proširenje šeme — odluka pisaca.
- **AT:** AT-23, AT-09, AT-08.

### F-DUR-11 — AutomationCenterApp već pokriva next run / last result / pause / run now / history / L2 approvals; nema block state ni misfire/timezone prikaza (S1 W5)
- **Status:** POTVRĐENO NA REVIZIJI (postoji i povezano), DELIMIČNO za „blokada"
- **Putanja/simbol:** `apps/web/src/components/os/apps/AutomationCenterApp.tsx:29` tabovi `overview|running|scheduled|triggers|history|logs`; `:74-99` refresh + per-automation logs (`getAutomationLogs`, C27); `:111-127` engine status poll + L2 held approvals (`getPendingApprovals` filter `source==='held'`); `:176-178` pause/resume (`adapter.pauseAutomation` / `updateAutomation({enabled:true})`); `:536-546, 669-670` next run; `:478-489` approve/deny dugmad; `:679-680` history. Backend: `packages/server/src/local/routes/automations.ts:128-148` `toAutomation` (`status: enabled ? 'active' : 'paused'`, `lastRun`, `nextRun`), `:320-324` pause → `cronStore.update(enabled:false)`, `:272-298` run → `scheduler.executeJob`; `routes/cron.ts:201-215` run-now auto-enable + `resetFailure`. Engine pill: `cron.ts:183-199` `getStatus()`.
- **Trenutni izlaz:** korisnik vidi sledeći termin, poslednji rezultat (history), može pauzirati/isključiti rutinu i pokrenuti odmah; L2 predlozi se odobravaju inline u ovoj aplikaciji (nezavisno od TEAMS-gated Approvals dock ikonice, `apps/web/src/lib/dock-tiers.ts:82` — nalaz A15, druga grupa). Nema statusa „blocked" (Automation status samo `active|paused`; UI referencira `'running'` `:308,536,669` koje backend nikad ne emituje — mrtva grana). Nema timezone/misfire kontrola. Kod interrupted history reda (`failed_interrupted`) prikazuje se kao failure u history tabu (M-09 Home failure items `:129`).
- **Repro test / granica:** `apps/web/src/test/phase3b-automation-center.test.tsx`, `packages/server/tests/local/automations.test.ts:284` (pause), `:256-267` (run aliases). Nije izvršeno.
- **Očekivano (brief §11.5):** korisnik vidi sledeći termin, poslednji rezultat, blokadu i pause/disable same rutine.
- **Najmanja promena:** dodati `blocked` izvedeni status kad postoji held akcija sa `source = loop:<id>` ili poslednji history red je `failed_interrupted`/rate-limited; ukloniti mrtvu `'running'` granu ili je napuniti iz `scheduler` lease-a. Ne graditi novu površinu (DIR-16).
- **AT:** AT-23.

### F-DUR-12 — Subagent/workflow „background" je vezan za životni vek roditeljskog turna; nema detach-a
- **Status:** POTVRĐENO NA REVIZIJI
- **Putanja/simbol:** `packages/agent/src/subagent-orchestrator.ts:93` `signal?: AbortSignal` („Abort all workers when the owning async job is cancelled"), `:119-124` in-memory `workers` Map, `:439-458` `runLoop({... signal: this.config.signal})`, rezultati samo u `WorkerState` + `emit('worker:status')`. Registracija u registry: `chat-collaboration.ts:236-269` (`chat_subagent`), `:455-478` (`workflow`), kontrole `:280-301` (cancel → `controller.abort()` + settlement), `:302-308` `linkParentCancellation(parentSignal)` → prekid roditeljskog SSE-a otkazuje decu; fleet `fleet-run-executor.ts:480-515` kreira room+worker PRE izvršenja (`lifecycle.trackExecution`), `:551-564` cancel kontrola; `agent-groups.ts:315-328`.
- **Trenutni izlaz:** subagenti nastaju i završavaju unutar jednog HTTP turna; kad korisnik zatvori stream, deca se otkazuju (F-DUR-06); restart → `interrupted` (F-DUR-01). Fleet spawn (`POST /api/fleet/spawn`, 202) je jedini tok koji nastavlja bez otvorenog klijentskog socket-a — ali ne preživljava restart.
- **Repro test / granica:** `packages/server/tests/local/chat-collaboration.test.ts`, `tools-routes-launch.test.ts:1152-1167` (external tool run preživljava restart dok je pid živ). Nije izvršeno.
- **Očekivano (brief §6.4 „Detach znači da se UI odvaja, a odobreni background posao nastavlja").**
- **Najmanja promena:** nema promene koda u ovoj fazi; u planu razlikovati „request-bound subagent" (postojeće) od „detached durable run" (W1 net-new). Fleet spawn putanja je najbliži postojeći kandidat za ADAPT.
- **AT:** AT-06, AT-10.

### F-DUR-13 — Nema server-driven phase executor-a: harness faze vodi model kroz `run_harness` tool sa self-reported `tool_calls` (S1 A6 kontekst, W1 net-new)
- **Status:** POTVRĐENO NA REVIZIJI (odsustvo)
- **Putanja/simbol:** `packages/agent/src/workflow-tools.ts:362-434` (`execute`: prvi poziv kreira run, kasniji pozivi prosleđuju `phase_output` iz argumenata modela → `advancePhase`), `:393-399, 412-422` (`phase_output.tool_calls/artifacts/duration_ms/tokens` su model-supplied; `durationMs` default 0), `:447` in-memory `activeHarnessRuns`. `createHarnessRun/advancePhase` nemaju pozivaoce u `packages/server/src` (grep 0).
- **Trenutni izlaz:** nema faznog checkpoint-a, nema oporavka faze, nema server-observed dnevnika za gate-ove (sadržinski deo je W0 grupa). Restart briše run state.
- **Repro test / granica:** N/A (odsustvo potvrđeno grep-om po sposobnosti: `createHarnessRun|advancePhase(` u server/src = 0; `DurableRun|ProofReceipt|ToolCallJournal|runs.db` = 0 u durable smislu).
- **Očekivano (brief §6.2 DIR-04, §6.4 DIR-05, §7 DIR-07).**
- **Najmanja promena:** nema; ovo je W1 net-new i predmet ADR (2) iz brief §20. Zabeležiti da `HarnessRunState` (`workflow-harness.ts:118-128`: `phaseStatuses`, `checkpoints`, `totalTokens`, `startedAt`) već ima oblik koji se može serijalizovati.
- **AT:** AT-07, AT-06.

### F-DUR-14 — TD-CHAT-46 (held-proposal branch unreachable) je zatvoren u kodu, ali ledger red i dalje kaže „Pinned, not fixed"
- **Status:** VEĆ ZATVORENO (kod) + NALAZ AUDITA — ZA PROVERU (ledger drift; van uže grupe, utiče na F-DUR-05 producente)
- **Putanja/simbol:** `packages/server/src/local/routes/chat-approval-hook.ts:290-323` — grana `if (proposeHeldTurn)` bez `allowDerivedPersistence` guarda, komentar eksplicitno navodi TD-CHAT-46 kao razlog; `docs/TECH-DEBT.md:65` i dalje opisuje granu kao nedostižnu i citira stare linije `routes/chat.ts:3611/3618` koje više ne postoje (handler refaktorisan, TD-CHAT-3 zatvoren).
- **Posledica za durable grupu:** `ai_task` rutine (`index.ts:2433-2441`, `proposeHeld:true`) zaista parkiraju gated proposable alate kao held akcije → F-DUR-10 tačka 3 (dupla occurrence → dva held reda) je realan scenario.
- **Najmanja promena:** ažurirati ledger red (dokument, ne kod). Nije izvršen test; `packages/server/tests/local/held-action-executor.test.ts` pokriva executor, ne hook granu (granica provere).
- **AT:** AT-08.

---

## 2. Šta već radi ili postoji-ali-nije-povezano (existingAssetsToPreserve)

| Šta | Putanja | Pozivaoci (grep) |
|---|---|---|
| `AgentRunRegistry` — durable room/worker zapis pre izvršenja, revision/seq event log, `eventsSince(since)` sa `resetRequired`, atomic tmp+rename persist sa Windows fallback-om, credential issue/revoke, `reconcileExternalProcesses` | `packages/server/src/local/agent-run-registry.ts` | `index.ts:538` (instanca), `fleet-run-executor.ts:413,480-496,551`, `chat-collaboration.ts:119-622`, `routes/agent-runs.ts`, `routes/agents.ts:106-160`, `routes/agent-groups.ts:315-627`, `routes/tools.ts:211-336`, `routes/external-tool-runs.ts:146-152,445,478,838`, `security-middleware.ts:667-673`, `index.ts:1809-1813` (workspace delete cancels active work) |
| `/api/agent-runs/events?since=` + `/snapshot` + `/:id/control` | `packages/server/src/local/routes/agent-runs.ts:61-116` | web `RoomApp.tsx`, `room-state-reducer.ts` (revision-based merge), `security-middleware.ts:61` rate limit |
| External tool runs preživljavaju restart dok je pid živ; pid reconcile na boot | `agent-run-registry.ts:381-395`; `routes/tools.ts:280-336` | `tools.ts:336` `reconcileExternalProcesses(startupAlive)`; test `tools-routes-launch.test.ts:1152-1167` |
| `CheckpointStore` (schema_version, atomic save, integrity check, dispose) i `RecoveryRunner` (retry/backoff/fallback/exhaust, deterministic decisions) | `packages/agent/src/long-task/checkpoint.ts`, `recovery.ts` | Samo `retrieval-agent-loop.ts:153,534-579,713-755` (opciono) + testovi; `RecoveryRunner` 0 produkcionih pozivalaca; `/api/agent/run` i gaia2 adapter ga ne prosleđuju |
| Cross-process resume retrieval petlje sa cached-final i running totals | `retrieval-agent-loop.ts:568-579,713-755`; test `long-task-loop-integration.test.ts:221-330` | unwired u produkciji |
| Held-action queue: `pending_actions` tabela, atomic claim, TTL, execute-time re-validacija, alias resolve | `held-action-executor.ts`; `cron-store.ts:179-198,505-586`; `routes/approval.ts:58-99` | producenti: `index.ts:2632-2645` (Loop L2), `chat-approval-hook.ts:301-323` (ai_task/channel/session-reviewer); UI: `AutomationCenterApp.tsx:65-70,119-122,478-489`, ApprovalsApp (`/approvals`) |
| AbortSignal kroz agent loop (fetch, body read, između turnova) | `agent-loop.ts:125-126,973-975,1090-1108,1458-1468` | `routes/chat.ts:1607-1612` (socket close), `subagent-orchestrator.ts:450`, `chat-collaboration.ts:254,466`, `fleet-run-executor.ts:501-515`; test `agent-loop.test.ts:1981-2010` |
| CronStore + LocalScheduler: `getDue/markRun`, run leases + boot sweep, rate-limit resume, 5-strike auto-disable perzistiran u `job_config`, history + retention 30d, `ai_task` daily cap | `packages/core/src/cron-store.ts`; `packages/server/src/local/cron.ts` | `index.ts:1913-2706` (executor za 8 `job_type`-ova, `cronStore.ts:15`), `routes/cron.ts`, `routes/automations.ts`; testovi `local-scheduler.test.ts`, `cron-scheduler-hardening.test.ts`, `cron-error-handling.test.ts`, `automations.test.ts`, `core/tests/cron-store.test.ts` |
| Loop L1/L2 executor (toolless maker, judge gate, one held proposal, injection scan na recall/prior state) | `packages/server/src/local/loop-executor.ts` | `index.ts:2588-2648`; test `loop-executor.test.ts` |
| Automation Center UI (next run, pause/run-now, history, engine pill, L2 approvals) + `/api/automations*` alias sloj | `apps/web/src/components/os/apps/AutomationCenterApp.tsx`; `routes/automations.ts` | `adapter.ts:2238-2310` (`pauseAutomation/runAutomation/getAutomationLogs`); test `phase3b-automation-center.test.tsx`, `automations.test.ts` |
| `harnessEvents` + `HarnessTraceBridge` (kanal za progress/trace; treba mu runId) | `workflow-harness.ts:132`; `harness-trace-bridge.ts`; `index.ts:612-616` | `workflow-tools.ts:373-434` (jedini driver), `agent/src/index.ts:315-316` |
| Serijalizabilan `HarnessRunState` oblik (phaseStatuses, checkpoints, totalTokens) | `workflow-harness.ts:118-128` | in-memory `workflow-tools.ts:447` |
| Dnevni spend ledger preživljava restart | `agentState.costTracker` (test `local-mode.test.ts:1067-1075`) | fleet executor spend meter `fleet-run-executor.ts:593-595` |

---

## 3. Šta NIJE nađeno (posle više grep-ova po sposobnosti)
- Trajni run store sa šemom/migracijom, `DurableRun`, `Checkpoint` na faznoj granici, `ToolCallJournal`, `ProofReceipt`, `actionId/attemptId/providerIdempotencyKey` (grep `DurableRun|ProofReceipt|ToolCallJournal|runs\.db|idempotencyKey|idempotency_key|Idempotency-Key` u `packages/**/*.ts`: 0 relevantnih; `actionId` postoji samo u command-registry/Composio/KVARK kontekstu).
- `sinceSeq`/`Last-Event-ID` reconnect za chat SSE (0 u `packages/server/src`).
- Timezone/misfire konfiguracija rutina (0).
- Bilo koji resume iz `interrupted` (0 tranzicija u kodu).
- Occurrence identitet za rutine u executor potpisu (`JobExecutor = (schedule) => Promise<void>`).

## 4. Napomene za pisce (bez arhitektonskih predloga)
- S1 tvrdnja L12 je tačna i namerna (test je asertuje). Nije bug u smislu greške koda; jeste jaz prema DIR-05/AT-07.
- S1 A7 predlog ključa (`runId+phaseId+attempt+callIndex`) nema pandana u kodu; postojeći held-action pattern (stabilan id radnje, atomic claim) je bliži brief DIR-06 — koristiti ga kao polaznu tačku (BORROW iz Waggle-a).
- S1 A9 opis „socket-close-aborts behavior is deliberate today (R3-008)" je tačan; poreklo u `docs/audits/2026-05-29-prod-readiness/REPORT.md:103`.
- Ledger `docs/TECH-DEBT.md:65` (TD-CHAT-46) je zastareo u odnosu na kod — pogrešan ledger red je defekt sam po sebi (pravilo iz MEMORY.md).
- Datumska aritmetika briefa: 12–17 nedelja od 27.09.2026 = 20.12.2026–24.01.2027 (nije relevantna za ovu grupu, prenosim radi doslednosti).
