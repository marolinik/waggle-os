# ADR-09 — Secondary worker (`packages/worker`, BullMQ/Redis/Postgres): eksplicitna granica, ne parity target (C20)

**Revizija dokumenta:** 1.2 DRAFT · 27.09.2026 · pregledana revizija koda `2af0904df01ca3d374cc78ba95b60dc579dd6a7a`
**Datum:** 2026-09-27
**Status:** DRAFT — predlog granice; konačna sudbina komponente (izdvojiti / legacy compat / ukloniti uz test / KVARK adapter) zavisi od ratifikacije ADR-08 O5 i ADR-09 O3 (Delivery plan §6.1 RAT-08; nije DQ); ništa ovde ne odlučuje da se worker briše
**Autor:** planer (Fable 5.1)
**Ratifikuje:** founder — čeka (ratifikacija ADR-a u celini, review u WB-PR1; klasa stavki po mapi Delivery plan §6 / ADR-INDEX §3: izolacija iz default build lanca vs zadržavanje = deo ove ratifikacije (O3); da li compose/self-host profil ostaje podržan surface = deo ove ratifikacije (O6, uz ADR-10 P-SELFHOST); nijedna stavka nije zaseban DQ)
**Zamenjuje / precizira:** FRD v1.1 §11 „Web/self-host and CLI share backend contracts with desktop; **no separate execution semantics**“ (netačno na kodu — S1 C20); PRD v1.1 §11 implicitnu pretpostavku da su CLI i web/self-host „secondary surfaces“ istog izvršioca; S1 §7 opciju „bring the worker into scope for 1.0“ (odbačena kao parity posao); implicitni status worker-a u `docker-compose.production.yml` kao produkcionog izvršioca
**Obavezuje:** WB-PR1 (granica u FRD v1.2 §11.3), WB-PR4/6 (izolacija/sudbina uz Teams server), W1 (agent-loop promene moraju ostaviti worker kompajlabilnim ili ga izdvojiti pre toga), W8-PR6 (release checklist: worker nije u Windows paketu)
**Cross-references:** ADR-02 (durable semantika se **ne** portuje u worker), ADR-03 (worker nema SSE/detach ugovor — progress ide Redis publish-om), ADR-05 (worker nema recall/ContextPackage), ADR-07 (worker cron ≠ Routines), ADR-08 (Teams server sudbina, O5), ADR-10 (P-SELFHOST profil); brief §12.2, §17 C20 („EXPLICIT BOUNDARY“); AT-06, AT-16, AT-30

---

## §1 — Kontekst

**ADR-09-K1 (POTVRĐENO NA REVIZIJI) — worker ima sopstvenu izvršnu semantiku.** `packages/worker/src/index.ts:1-14,24-46` `createWorker`: BullMQ `Worker` nad `waggle-jobs` queue-om, `ioredis`, drizzle Postgres kroz **relativne importe u server src** (`'../../server/src/db/connection.js'`, `'../../server/src/db/schema.js'`, `'../../server/src/services/job-service.js'`; 12 takvih importa u `packages/worker/src` — grep); registruje handler-e `chat`, `task`, `waggle`, `group`, `cron` (`:32-45`). Status job-a upisuje u Postgres `agent_jobs` (`:49-70`; šema `packages/server/src/db/schema.ts:162`), progress objavljuje `redisPub.publish('job:<id>:progress', …)` (`:57-63`). Tenant izolacija: `execution-policy.ts:47-63` `createWorkerExecutionContext(teamId)` → `WAGGLE_DATA_DIR/teams/<teamId>` sa realpath/junction odbranom; **read-only** alati + `READ_ONLY_WORKER_SYSTEM_PROMPT` (`:11-17`: „cannot run shell commands, execute code, or write, edit, or delete files“). [tiers-kvark.md F-TK-10]

**ADR-09-K2 (POTVRĐENO NA REVIZIJI) — chat kroz worker ≠ chat kroz sidecar.** `handlers/chat-handler.ts:11-24` poziva `runAgentLoop({ litellmUrl: LITELLM_URL, litellmApiKey, model: DEFAULT_MODEL ?? 'claude-sonnet', systemPrompt, tools, messages })` direktno; `LITELLM_URL` default `http://localhost:4000/v1` (`:7`). U `packages/worker/src` **nula** referenci na `recallMemory|buildSystemPrompt|Orchestrator|PERSONAS|MultiMind|FrameStore|persona|approval|governance` (grep). Lokalni put: `packages/server/src/local/routes/chat.ts:7,1717` isti `runAgentLoop`, ali sa 32 `routes/chat-*.ts` modula (34 u `packages/server/src`; recall, persona, governance, approval hook, model routing, budget…). Isti korisnički zahtev daje dva različita ishoda (memorija, persona, gates, budžet). `task-handler.ts`, `group-handler.ts` (parallel/sequential/coordinator strategije nad `agentGroups` Postgres tabelama), `waggle-handler.ts` (WaggleDance dispatcher + sopstveni `CapabilityRouter` sa praznim skills/plugins/mcp/connectors, `:26-33`), `cron-handler.ts` (delegira samo `chat|task|waggle|group`, `:5,27-31`) — sve nezavisno od lokalnog `CronStore`/`LocalScheduler`.

**ADR-09-K3 (POTVRĐENO NA REVIZIJI) — dva job store-a, dve idempotencije.** Team: `packages/server/src/routes/jobs.ts:11-89` (`/api/jobs`, Postgres, Clerk auth) + `services/job-service.ts:25-50` (`onConflictDoNothing` po `jobId`, „Job idempotency key collision“ — id kolizija, ne provider ključ; ADR-02 K6). Lokalno: `packages/server/src/local/routes/jobs.ts:1-20` `/api/jobs/:id`, `/api/jobs/:id/cancel` nad `server.localJobStore` (in-memory; `adapter.ts:2927-2934` komentar: „in-memory store; lost on sidecar restart“). Web `adapter.getJobStatus/cancelJob` (`adapter.ts:2925-2941`) gađa **lokalni** store za agent-group run-ove; worker `agent_jobs` tabela nema klijenta u `apps/web` (grep `/api/teams/` = 0).

**ADR-09-K4 (POTVRĐENO NA REVIZIJI) — gde worker živi u isporuci.** U build lancu: `package.json:25 build:packages … && cd ../worker && npm run build` (tsc + esbuild bundle); `packages/worker/tsconfig.json` `references: ["../shared", "../server"]`. U produkcionom compose-u: `docker-compose.production.yml:76-91` servis `worker` (`image: waggle/server:latest`, `command: node packages/worker/dist/index.js`, `DATABASE_URL`, `REDIS_URL`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, **`WAGGLE_SKIP_LITELLM=1`**, bez `LITELLM_URL`). **Nije** u `render.yaml` (samo `type: web`, `startCommand: npx tsx packages/server/src/local/start.ts --skip-litellm`, `:13-22`). **Nije** u Windows paketu: grep `worker` u `scripts/stage-sidecar-deps.mjs`, `check-sidecar-resources.mjs`, `build-sidecar.mjs`, `app/src-tauri/tauri.conf.json` = **0**. Testovi: `packages/worker/tests/job-processor.test.ts` u `vitest.infra-suites.ts:34` (Postgres/Redis); ostalih 7 worker test fajlova (`entrypoint`, `execution-policy`, `execution/strategies`, `handlers/*`) u default gate-u (`vitest.config.ts:29` `packages/*/tests/**`).

**ADR-09-K5 (NALAZ AUDITA — ZA PROVERU) — compose model putanja worker-a je verovatno nefunkcionalna.** `chat-handler.ts:7` default `LITELLM_URL=http://localhost:4000/v1`; compose za `worker` postavlja `WAGGLE_SKIP_LITELLM=1` i provider ključeve, ali **ne** `LITELLM_URL` → worker u sopstvenom kontejneru gađa `localhost:4000` gde LiteLLM ne radi; `WAGGLE_SKIP_LITELLM` worker ne čita (grep u `packages/worker/src` = 0). Nije izvršeno (zahteva Docker/Postgres/Redis) → ZA PROVERU. Ako se potvrdi, worker `chat` job u compose profilu ne može završiti.

**ADR-09-K6 (POTVRĐENO NA REVIZIJI) — render.yaml self-host već koristi sidecar semantiku.** Web/self-host profil na Render-u pokreće `packages/server/src/local/start.ts` — **isti** lokalni core kao desktop, sa `WAGGLE_HOST=0.0.0.0` opt-in-om (`net-config.ts:4-6`). Dakle „web/self-host deli izvršnu semantiku sa desktopom“ je **tačno za render profil**, a **netačno** kad se uključi Teams server + worker (compose). CLI (`packages/cli`) i `packages/hive-mind-cli` nisu proveravani u fazi A za izvršnu semantiku (NEPOZNATO; van obima C20 koji imenuje worker).

**ADR-09-K7 (ODLUKA — D-02, D-04 · PREDLOG — SMER BRIEFA — C20 „EXPLICIT BOUNDARY“, brief §12.2).** ODLUKA: nema zasebnog Waggle Team proizvoda (D-02); Windows/Tauri je primaran, CLI i web/self-host su podržani odvojeni instalacioni putevi **istog** proizvoda (D-04). PREDLOG — SMER BRIEFA (planerski smer, ne korisnikovo odobrenje): „inventarisati secondary worker; local core ima jedinstvene ugovore; legacy team worker sačuvati/izolovati ili vezati za KVARK, bez novog Solo dupliranja“ (C20); multi-user BullMQ/Postgres/Clerk putanja ne postaje novi Waggle Team proizvod (brief §12.2, u skladu sa D-02).

## §2 — Odluka (predlog granice)

**ADR-09-O1 (PREDLOG) — jedan izvršilac za individualni Waggle.** Izvršna semantika Waggle-a (režimi ADR-01, `DurableRun` ADR-02, detach/cancel ADR-03, envelope ADR-04, `ContextPackage` ADR-05, evolution ADR-06, rutine ADR-07) živi **isključivo** u lokalnom core-u (`packages/server/src/local/**` + `@waggle/agent`). Desktop, CLI i web/self-host (render profil) su tri instalaciona puta **istog** sidecar-a. FRD v1.2 §11.3 formuliše: „deljeni backend ugovori“ važe za sidecar; za `packages/worker` **ne** važe i to se ne obećava.

**ADR-09-O2 (PREDLOG) — `packages/worker` je legacy team-mode komponenta, ne parity target.** Klasifikacija: **isolate + freeze**. Nema novih feature-a, nema porta durable/routine/context/evolution semantike, nema pokušaja da worker `chat` dostigne sidecar `chat`. Ne pominje se u PRD/FRD kao podržana korisnička površina; ne ulazi u Windows Solo receipts (i danas nije u paketu — K4). Odluka **nije** brisanje: brisanje traži zaseban korak posle ADR-08 O5 (Teams server sudbina) i eventualne KVARK odluke.

**ADR-09-O3 (PREDLOG) — tri dozvoljena ishoda po komponenti (brief §12.2 obrazac), sa preporukom.**

| Ishod | Šta znači | Uslov | Preporuka |
|---|---|---|---|
| (a) KVARK adapter | worker handler-i postaju izvršni sloj KVARK job queue-a | KVARK usvaja BullMQ/Postgres `agent_jobs` semantiku — **NEPOZNATO** (ADR-08 K9) | ne planirati bez KVARK vlasnika |
| (b) izolovati / legacy compat | ostaje u repou, `private: true`, van default `build:packages` lanca ili iza `BUILD_WORKER=1`; testovi ostaju (infra + unit); compose profil označen „legacy team (unsupported for individual release)“ | nema | **preporučeno** za G1–G3 |
| (c) ukloniti uz test | brisanje paketa, compose servisa, `worker` reda u `vitest.infra-suites.ts`, `tsconfig` referenci; test da `build:packages` i `npm test` prolaze | zavisi od ADR-08 O5 (ako Teams server ide u „ukloniti“) | tek posle ratifikacije ADR-08 O5 o Teams serveru (nije zaseban DQ; ADR-INDEX §3) |

**ADR-09-O4 (PREDLOG) — granice u kodu koje se čuvaju bez obzira na ishod.** (1) Worker **ne** importuje `packages/server/src/local/**` i lokalni core **ne** importuje `packages/worker/**` (danas POTVRĐENO: 0 u oba smera osim `server/src/db|services` relativnih importa iz worker-a); (2) `@waggle/agent` javni API (`runAgentLoop`, `createSystemTools`, `PermissionManager`, `CapabilityRouter`) ostaje kompatibilan dok je worker u build lancu — ADR-02 promene `agent-loop.ts` (AbortSignal/ledger callbacks) su **aditivne** ili worker prvo prelazi u ishod (b) sa sopstvenim build korakom; (3) worker ostaje **read-only** izvršilac (`execution-policy.ts`) — nikakvo širenje alata; (4) worker cron (`cron-handler.ts`) **nije** Routines (ADR-07) i ne dobija occurrence/misfire ugovor.

**ADR-09-O5 (PREDLOG) — SSE/detach i progress.** ADR-03 ugovor (`sinceSeq`, `RunEvent`, detach ≠ cancel) važi samo za sidecar run-ove. Worker progress ostaje Redis publish `job:<id>:progress` + Postgres status (`index.ts:49-70`) — ne mapira se na `RunEvent`. Web `adapter.getJobStatus/cancelJob` ostaje vezan za lokalni `localJobStore`; **nijedan** UI put ne dobija „job iz worker-a“ prikaz.

**ADR-09-O6 (PREDLOG) — compose/self-host profil (ADR-10 P-SELFHOST).** Podržani self-host = render profil (sidecar, `WAGGLE_HOST=0.0.0.0`, opcioni LiteLLM). `docker-compose.production.yml` sa Postgres/Redis/MinIO/worker = **legacy team deployment**, dokumentovan kao nepodržan za individualni release; K5 (`LITELLM_URL`) se proverava jednim compose smoke-om **samo** ako se ishod (b) zadrži kao „runnable legacy“ — inače se ne troši vreme.

**ADR-09-O7 (PREDLOG) — tvrdnje.** FRD v1.2 §11.3 zamenjuje rečenicu FRD v1.1 §11 sa: „Desktop, CLI i web/self-host (sidecar) dele izvršnu semantiku; `packages/worker` (BullMQ/Redis/Postgres) je legacy team komponenta sa sopstvenom, read-only semantikom, van individualnog release-a i van parity obaveze.“ PRD v1.2 ne navodi worker kao surface. Nema tvrdnje o multi-user skaliranju.

## §3 — Šta zamenjuje i zašto

| Prethodno | Gde | Zašto |
|---|---|---|
| FRD v1.1 §11 „no separate execution semantics“ | docs/plans/v1.2-evidence/inputs/Waggle_FRD_v1.1_2026-09-27.md:171 | Netačno: worker `chat` bez memorije/persone/gate-ova (K2 POTVRĐENO); C20 traži eksplicitnu granicu, ne lažni parity |
| S1 §7 opcija „bring the worker into scope for 1.0“ | docs/plans/v1.2-evidence/inputs/S1-audit-2026-09-27.md C20 | Parity posao bi duplirao Solo ugovore u drugom runtime-u (brief §12.2 „bez novog Solo dupliranja“); D-02 nema Team proizvoda koji bi to opravdao |
| Worker kao produkcioni servis u compose-u bez ograde | `docker-compose.production.yml:76-91` | Legacy team deployment; model putanja ZA PROVERU (K5); nije u render profilu ni Windows paketu |
| Implicitno: worker u default `build:packages` lancu kao ravnopravan paket | `package.json:25` | Ishod (b): izolacija smanjuje trošak svake `agent-loop`/server promene (W1) |

**ADR-09-Z1 (ODLUKA — ne otvara se).** D-02 (Waggle = me; KVARK = us) i D-04 (desktop-first, CLI/web kao odvojeni putevi) se sprovode. Nema Waggle Team servera kao proizvoda.

## §4 — Posledice

**ADR-09-P1 (PREDLOG).** Ako ishod (b): `packages/worker/package.json` `private: true` (danas nema `license` polja — F-TK-13 lista 9 manifesta), `build:packages` bez `&& cd ../worker && npm run build` ili iza env flag-a; `vitest.config.ts` include ostaje (unit testovi zeleni bez infra); CI vreme se smanjuje za esbuild bundle. Rizik: `tsc --build` referenca `../server` više se ne proverava kroz worker — pokriveno `packages/server` sopstvenim build-om.

**ADR-09-P2 (PREDLOG).** W1 (`agent-loop.ts` promene) dobija checklist stavku „worker kompajlira ili je izdvojen“; ako se izdvoji pre W1, stavka otpada.

**ADR-09-P3 (PREDLOG).** Doc-only: FRD v1.2 §11.3 (već formulisano u nacrtu kao „ADR (9)“), PRD §11 bez worker-a, `docker-compose.production.yml` komentar zaglavlja „legacy team deployment — not part of the individual Windows/self-host release“, `docs/ARCHITECTURE.md` ako pominje worker kao ravnopravan (nije proveravano — ZA PROVERU).

**ADR-09-P4 (PREDLOG).** Receipt: nema uticaja na Windows kandidat (worker nije u paketu — K4); nema uticaja na persona/router receipts.

**ADR-09-P5 (PREDLOG).** Licenca: `packages/worker/package.json` bez `license` polja → ulazi u O-2 inventar (ADR-10), ne odlučuje se ovde.

## §5 — Rizik

| ID | Rizik | V/U | Mitigacija |
|---|---|---|---|
| ADR-09-R1 | Tiha divergencija: neko „popravi“ worker chat dodavanjem recall-a → drugi Solo put | niska / srednja | O4 (1) import granica kao lint/test; O2 freeze u CONTRIBUTING |
| ADR-09-R2 | Izolacija iz build lanca sakrije kompajlacione greške dok se worker ne pokrene | srednja / niska | unit testovi ostaju u default gate-u (tsc kroz vitest transpile ne hvata tipove → dodati `tsc --noEmit -p packages/worker` kao opcioni CI job iza flag-a) |
| ADR-09-R3 | Compose profil ostaje javno u repou i deluje kao podržan | srednja / niska | O6 komentar + README napomena; K5 ZA PROVERU pre bilo kakve tvrdnje |
| ADR-09-R4 | KVARK kasnije zatraži job queue semantiku, a worker je obrisan | niska / niska | ishod (c) tek posle KVARK odluke; git istorija čuva kod |
| ADR-09-R5 | Relativni importi `../../server/src/db/*` pucaju ako se `packages/server` restrukturira (TD-CHAT ekstrakcije) | srednja / niska | ishod (b) + P1; ili prelaz na `@waggle/server` export (van obima) |

## §6 — Migration test (RED pre fix-a, GREEN posle)

| ID | Test | Lokacija (predlog) | Očekivanje | AT |
|---|---|---|---|---|
| ADR-09-T1 | Import granica: nijedan fajl u `packages/worker/src` ne importuje `packages/server/src/local/**`; nijedan fajl u `packages/server/src/local/**` ni `apps/web/src` ne importuje `packages/worker/**` | `tests/boundaries/worker-boundary.test.ts` (novi, grep-based) | zeleno danas (POTVRĐENO grep) — pinuje granicu | — |
| ADR-09-T2 | `npm run build:packages` prolazi posle ADR-02 `agent-loop.ts` promena **ili** worker je izdvojen iz lanca (test čita `package.json` skriptu) | CI (postojeći) | zeleno danas | — |
| ADR-09-T3 | `execution-policy.test.ts` i `handlers/*.test.ts` ostaju zeleni bez infra; `job-processor.test.ts` ostaje u INFRA listi | postojeći | zeleno danas (nije izvršeno u fazi A — granica) | — |
| ADR-09-T4 | Copy/doc lint: FRD/PRD v1.2 ne sadrže „no separate execution semantics“ bez worker ograde; compose zaglavlje nosi legacy napomenu | doc lint (novi) | RED danas (FRD v1.1 tekst) | — |
| ADR-09-T5 | Windows kandidat ne sadrži `packages/worker/dist` ni `bullmq`/`ioredis` u `resources/node_modules` closure-u | `certify-windows-installer.ps1` assert (novi) ili `check-sidecar-resources.mjs` | verovatno zeleno danas (K4 grep 0) — potvrditi na packaged build-u | AT-30 |
| ADR-09-T6 | (samo ako ishod (b) „runnable legacy“) compose smoke: worker `chat` job sa eksplicitnim `LITELLM_URL` završava; bez njega → dokumentovan fail | infra lane (opciono) | NEPOZNATO (K5) | — |
| ADR-09-T7 | Dva istovremena Workspace run-a kroz sidecar imaju različite `runId` i ne dele stanje sa worker `agent_jobs` (nema cross-store čitanja) | `packages/server/tests/local/` (novi, uz ADR-02 T) | n/a | AT-06 |

**Granica provere (POTVRĐENO NA REVIZIJI):** grep i čitanje; worker nije pokretan (Redis/Postgres); compose nije podizan; K5 je izvedeno iz env deklaracija, ne iz izvršenja.

## §7 — Izvori

- **D:** D-02, D-04 (brief §3) · **DIR:** brief §12.2 (tier/Stripe/team kod — „sekundarni server/worker“), §15.3 (hotspot vlasnici) · **C/A/R:** C20 (EXPLICIT BOUNDARY), C2; A2; R15 · **AT:** AT-06, AT-16, AT-30
- **Phase A:** `docs/plans/v1.2-evidence/phaseA/tiers-kvark.md` F-TK-08, F-TK-10, F-TK-13 (manifesti bez `license`), §2 tabela („Teams cloud server + BullMQ worker“); `docs/plans/v1.2-evidence/phaseA/durable.md` F-DUR-05 (`job-service.ts:38` je id-kolizija, ne provider ključ); `docs/plans/v1.2-evidence/phaseA/release-oss.md` F-REL-04 (bundle skripte)
- **Planski paket:** `docs/plans/WAGGLE-DELIVERY-PLAN-v1.2.md` WB-PR1/PR6, TM-15; `docs/Waggle_FRD_v1.2_DRAFT.md` FRD-11.3; `docs/plans/WAGGLE-MIGRATIONS-v1.2.md` MIG-07.5
- **S1:** C20; §7 „secondary decisions“
- **Kod (na `2af0904d`, `git status` čist):** `packages/worker/src/index.ts:1-14,24-70`; `packages/worker/src/handlers/{chat-handler.ts:1-33,task-handler.ts:1-40,group-handler.ts:1-40,waggle-handler.ts:1-40,cron-handler.ts:1-50}`; `packages/worker/src/execution-policy.ts:11-63`; `packages/worker/src/job-processor.ts:1-30`; `packages/worker/{package.json,tsconfig.json}`; `packages/server/src/services/job-service.ts:25-50`; `packages/server/src/routes/jobs.ts:11-89`; `packages/server/src/local/routes/jobs.ts:1-20`; `packages/server/src/db/schema.ts:162`; `packages/server/src/index.ts:41-60`; `packages/server/src/local/index.ts:3585-3614`; `packages/server/src/local/net-config.ts:4-6,24-27`; `apps/web/src/lib/adapter.ts:2925-2941`; `package.json:25`; `docker-compose.production.yml:76-91`; `render.yaml:13-22`; `vitest.infra-suites.ts:16-36`; `vitest.config.ts:29-42`; `scripts/{stage-sidecar-deps.mjs,check-sidecar-resources.mjs,build-sidecar.mjs}` (grep `worker` = 0); `app/src-tauri/tauri.conf.json` (grep `worker` = 0)
