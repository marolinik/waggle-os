# Faza A — revalidacija grupe „evolution” na reviziji `2af0904df01ca3d374cc78ba95b60dc579dd6a7a`

Datum: 2026-09-27. Repo: `D:/Projects/waggle-os`, grana `main`, `git status` čist (radno stablo == HEAD; jedina netrackovana fajla su dva `.docx` u `docs/`). Sve `path:line` reference su čitane iz radnog stabla na toj reviziji. Reprodukcije su izvršene **read-only** protiv `packages/agent/dist` (ESM build; ključne funkcije `listPersonas`, `isRunningJudge` guard, `scoreCandidate(baseline, microSample…)`, `sourceFromTraces([...], true, …)` uporedjene sa `src` i identične), skripte i privremeni fajlovi žive isključivo u planerskom radnom prostoru (sada `docs/plans/v1.2-evidence/phaseA/repro-shadow.mjs`, `docs/plans/v1.2-evidence/phaseA/repro-gepa-delta.mjs`).

Izvori: BRIEF §10 (DIR-13/14/15), AT-04, AT-05, AT-29; S1 L11, L13, C10, A16–A19, W3e; PRD §9; FRD §8/§14/§15.

Oznake statusa: **POTVRĐENO NA REVIZIJI** (nalaz reprodukovan ili dokazan čitanjem koda na 2af0904d), **VEĆ ZATVORENO** (S1 tvrdnja je već popravljena, sa dokazom), **DELIMIČNO/NEPOVEZANO** (mehanizam postoji, ali nije povezan ili je samo deo zatvoren), **NEPOZNATO** (nije provereno u ovom prolazu), **PREDLOG** (samo „najmanja promena” — nije odobreno, nije arhitektura).

---

## 0. Mapa „ko poziva → šta proizvodi → gde se čuva → kako se bira aktivna verzija → koji naredni run je koristi” (DIR-13)

| Modul | Pozivaoci (git grep, bez dist/tests) | Proizvodi | Čuva se | Aktivna verzija | Naredni run koristi? |
|---|---|---|---|---|---|
| `AgentLearning` (`packages/agent/src/agent-learning.ts:43`) | **0** — samo barrel export `packages/agent/src/index.ts:231`; nema `new AgentLearning` nigde | `LearningSnapshot`, `formatLearningPrompt()` | `improvement_signals` (preko `ImprovementSignalPort`) | n/a | **Ne** (mrtav kod) |
| `processInteractionForImprovement` (`improvement-wiring.ts:97`) | **0** u src; zaglavlje `improvement-wiring.ts:2` kaže „Not exported from index.ts — future feature, tested but not wired” | korekcija/capability gap/workflow pattern | ništa (čist detektor) | n/a | **Ne** |
| `detectCorrection` (`correction-detector.ts`), `improvement-detector.ts`, `ExecutionTraceStore.markCorrected` (`hive-mind-core/src/mind/execution-traces.ts:473`) | **0** produkcionih pozivalaca (`markCorrected(` — 0; `correction-detector`/`improvement-detector` importuje samo `improvement-wiring.ts`) | outcome `corrected` | `execution_traces` | n/a | **Ne** — `corrected` se u produkciji **nikad ne upisuje** (`chat-turn-completion.ts:371-375` uvek `outcome: 'success'`; komentar „correction-detector may downgrade it” nije istinit) |
| Thumbs-down → `signalStore.record('correction', …)` (`packages/server/src/local/routes/feedback.ts:91-94`) → `getActionable()` → `# User Corrections` u promptu (`routes/chat.ts:1485-1496`) | wired | tekst korekcije u volatile tail prompta | `improvement_signals` (personal mind) | prag `count >= threshold` (`improvement-signals.ts:112-128`) | **Da** — ovo je jedini živ „learning” tok. `markSurfaced` niko ne zove osim nepovezanog `improvement-detector.ts:206-208`, pa se signal ubacuje u svaki naredni prompt dok ne prođe pragove — nije verifikovano ponašanje kroz test u ovom prolazu (NEPOZNATO) |
| `EvolveSchema` (Stage 1 u `compose-evolution.ts:174-184`) | `ComposeEvolution.run` ← `EvolutionOrchestrator.runOnce` ← `POST /api/evolution/run` (`routes/evolution.ts:468,492`) i `EvolutionService.defaultRunner` (`evolution-service.ts:320`) | `frozenSchema`, `winner_schema_json` | `evolution_runs.winner_schema_json` (`evolution-orchestrator.ts:224`) | nema | **Ne** — Stage 2 ne dobija šemu (`compose-evolution.ts:191-196`), deploy je ignoriše (`routes/evolution.ts:51-82`), UI je ne renderuje (samo tip: `EvolutionTab.tsx:32,45`) |
| GEPA winner (`IterativeGEPA.run`) | isto kao gore | `winner.prompt` → `winner_text` | `evolution_runs` | `.json` override fajl (`{dataDir}/personas/<id>.json` ili `behavioral-overrides/<section>.json`) + jedan `.bak` | persona: **Ne** (zasenčen, F-EVO-01); behavioral-spec: **Da** (`index.ts:626-635`, `chat.ts:1441-1444`) |

---

## 1. Nalazi

### F-EVO-01 — Evolved persona override je zasenčen ugrađenom personom u chat konzumeru (S1 L11, C10; AT-04)
- **Status:** POTVRĐENO NA REVIZIJI
- **Commit:** `2af0904df01ca3d374cc78ba95b60dc579dd6a7a`
- **Putanja/simbol:** `packages/agent/src/personas.ts:67-70` `listPersonas()` vraća `[...PERSONAS, ...custom]` (ugrađene prve). `packages/server/src/local/routes/chat.ts:439-440` `resolvePersona(id) = listPersonas().find(p => p.id === id)` — `find` vraća **prvi** pogodak = ugrađenu. Pozivaoci: `chat.ts:761` (turnPersona), `:1292`, `:1303`, `:1311`, `:1508` (activePersona za system prompt). Isti obrazac: `packages/server/src/local/fleet-run-executor.ts:127,590`, `routes/agent-groups.ts:87`, `routes/fleet.ts:354`.
- **Ulaz:** `deployPersonaOverride(dataDir, { personaId: 'coder', systemPrompt: 'EVOLVED ROUTING v2' })` (tačno ono što radi `deployFromRun` u `routes/evolution.ts:53-62`), zatim `setPersonaDataDir(dataDir)` (kao `server/src/local/index.ts:552`), pa `resolvePersona('coder')`.
- **Trenutni izlaz (repro `docs/plans/v1.2-evidence/phaseA/repro-shadow.mjs`):** `listPersonas()` ima 2 stavke sa `id=coder`; `entry[0]` = ugrađena, `entry[1]` = evolved; `resolvePersona('coder').systemPrompt includes EVOLVED? false`. Dakle posle „Accept & Deploy” status postaje `deployed`, fajl je upisan, event `persona:reloaded` emitovan — a nijedan chat turn ne koristi novi prompt.
- **Repro test / ograničenje:** skripta iznad protiv `dist`. Postojeći test `packages/agent/tests/evolution-deploy.test.ts:109-123` ostaje zelen jer je predikat `p.id === 'coder' && p.systemPrompt.includes('EVOLVED ROUTING')` (pogađa **drugu** stavku); `packages/server/tests/evolution-routes.test.ts:169-188` proverava samo fajl na disku i `status === 'deployed'`. Nijedan test ne proverava sledeći effective prompt. Istorijski dokument `docs/GEPA-SCOPE-AUDIT-2026-04-30.md` §3 je predložio prelazak `getPersona → listPersonas`; prelazak je urađen (komentar `chat.ts:427-438`), ali redosled u `listPersonas` čini popravku neefikasnom za shadow ID-eve.
- **Očekivano ponašanje:** aktivirani override ulazi u sledeći stvarni prompt; rollback menja sledeći run; postojeći run ostaje na svojoj verziji (AT-04).
- **Najmanja promena (PREDLOG):** u `listPersonas()` custom sa istim `id` mora zameniti ugrađenu (npr. `Map` po `id`, custom poslednji), ili `resolvePersona` bira custom prvo; RED test: `resolvePersona('coder').systemPrompt === override` + route test da `POST /api/chat` posle accept-a sadrži override u system promptu; isto primeniti na fleet/agent-groups konzumente.
- **Povezani AT:** AT-04

### F-EVO-02 — Nema active-version pointera; baseline za sledeći krug čita ugrađenu personu; rollback funkcije nemaju pozivaoca; nema `rolled_back`; `persona:reloaded` nema konzumenta (S1 A2/A18, W3e; AT-04)
- **Status:** POTVRĐENO NA REVIZIJI
- **Commit:** `2af0904d…`
- **Putanja/simbol:** `routes/evolution.ts:259` (`GET /api/evolution/baseline` → `getPersona(name)` = built-in only, vidi `personas.ts:54-57`); `services/evolution-service.ts:277` `resolveBaseline` → `getPersona`; UI učitava baseline odatle (`EvolutionTab.tsx:1042`). `evolution-deploy.ts:119-135` `rollbackPersonaOverride` i `:220-235` `rollbackBehavioralSpecOverride` — **0 pozivalaca** u `packages/server/src` i `apps/web/src` (grep `rollback*Override|rollback`). `hive-mind-core/src/mind/evolution-runs.ts:23-28,95-96` status enum + SQL `CHECK` bez `rolled_back`. `routes/evolution.ts:185` emituje `persona:reloaded`; `eventBus.on('persona:reloaded')` ne postoji nigde (jedini `on` je `behavioral-spec:reloaded`, `index.ts:630`). Backup je jednonivovski `.bak` (`evolution-deploy.ts:79-82`).
- **Ulaz:** deploy override za `coder`, pa `GET /api/evolution/baseline?kind=persona-system-prompt&name=coder`.
- **Trenutni izlaz:** ugrađeni prompt (repro: `getPersona('coder') includes EVOLVED? false`). Drugi krug evolucije kreće od ugrađene verzije; „verzija” postoji samo kao red u `evolution_runs` bez veze sa fajlom na disku.
- **Repro test / ograničenje:** isti repro; rollback nepostojanje = grep dokaz; nije testiran restart server-a.
- **Očekivano ponašanje:** versionovani registry sa eksplicitnim active pointerom po targetu; rollback vraća prethodnu aktivnu verziju i menja sledeći run; baseline endpoint čita aktivnu verziju.
- **Najmanja promena (PREDLOG):** baseline endpointi koriste isti resolver kao chat (posle F-EVO-01); `POST /api/evolution/runs/:uuid/rollback` koji zove postojeće `rollback*Override` + novi status `rolled_back` (migracija `CHECK` ograničenja u `evolution_runs`); UI dugme; `evolution_runs` beleži `active_from/active_until`.
- **Povezani AT:** AT-04

### F-EVO-03 — „Kandidat se izvršava pre ocenjivanja” (S1 W0/W3e, PRD §9 „Audit/fix production evolution”; AT-05)
- **Status:** VEĆ ZATVORENO (za produkcione putanje), sa ogradom u F-EVO-04
- **Commit:** `2af0904d…`
- **Putanja/simbol:** `packages/agent/src/evolution-llm-wiring.ts:415-452` `RUNNING_JUDGE_BRAND` + `makeRunningJudge` (izvršava `buildRunPrompt(candidate, input)` kroz `llm.complete`, pa `baseJudge.score({...args, actual: modelOutput})`); `iterative-optimizer.ts:173-184` `IterativeGEPA.run` baca grešku za bare judge bez `allowBareJudge` (H-09 G3); `compose-evolution.ts:142-149` čuva brend posle `filterJudgeFeedback`. Produkcioni pozivaoci prosleđuju running judge: `routes/evolution.ts:376-377,404`; `services/evolution-service.ts:309-310,332`. Stage 1 (`evolve-schema.ts:350-379` `scoreSchemaCandidate`) takođe izvršava (`execute` pa `judge`).
- **Ulaz/izlaz:** testovi `packages/agent/tests/iterative-optimizer.test.ts:424-445` (guard) i `tests/evolution-llm-wiring.test.ts:266-330` (running judge poziva LLM sa kandidatom i ocenjuje izlaz).
- **Ograničenje provere:** nije izveden živi provider run; komentar u `iterative-optimizer.ts:393-397` („We treat it as the model's actual response…”) je zastareo i opisuje staro prompt-as-output ponašanje. Guard je bypass-abilan sa `allowBareJudge: true` (dozvoljen u testovima).
- **Očekivano:** kao AT-05 — test prepoznaje prompt-as-output slučaj. Postoji za GEPA stage; ne postoji end-to-end test na route nivou da je `llm.complete` pozvan sa kandidatom pre judge poziva (NEPOZNATO — nije pronađen grepom `running|RUNNING_JUDGE` u `packages/server/tests/evolution-run-route.test.ts`).
- **Najmanja promena (PREDLOG):** ažurirati komentar; dodati route test koji broji `complete()` pozive po primeru (2 = execute + judge).
- **Povezani AT:** AT-05

### F-EVO-04 — Executor == judge (isti Haiku LLM), izvršenje nije kroz target model/router ni kroz komponovan system prompt; nema model/runtime manifesta niti sačuvanih izlaza (S1 A19; BRIEF 10.2, 10.4; AT-05)
- **Status:** POTVRĐENO NA REVIZIJI
- **Commit:** `2af0904d…`
- **Putanja/simbol:** `routes/evolution.ts:365,376-379` i `evolution-service.ts:304,309-312`: jedan `llm` gradi `baseJudge`, `makeRunningJudge(baseJudge, llm)`, `buildSchemaExecuteFn(llm)`, `buildGEPAMutateFn(llm)`. `evolution-llm-wiring.ts:214-260` `createAnthropicEvolutionLLM` hard-kodira `AxAI.create({name:'anthropic'})` + `Claude45Haiku`. `buildRunPrompt` (`:454-461`) = `candidatePrompt + "USER INPUT:" + input` u **jednom user turn-u** (`:240-242` `chatPrompt:[{role:'user'}]`), bez `composePersonaPrompt` (core prompt + behavioral spec), bez alata, bez korisnikovog izabranog modela. Artefakti run-a: `evolution-orchestrator.ts:230-235` čuvaju samo `runSeed/generations/paretoFrontSize/exampleCount` — bez modela, bez per-example izlaza.
- **Ulaz:** target `persona-system-prompt`/`behavioral-spec-section`.
- **Trenutni izlaz:** persona prompt evoluira u izolaciji od runtime-a u kom će raditi; ocenjivač i generator su isti model bez oznake rizika pristrasnosti; ne postoji sačuvan izlaz da bi se post-hoc proverilo šta je izvršeno (BRIEF 10.2 „Sačuvati output-e i model/runtime manifest”).
- **Repro/ograničenje:** čitanje koda; nije meren efekat na kvalitet.
- **Očekivano:** izvršenje kroz target runtime (lokalni model/provider router) sa komponovanim promptom; druga familija poželjna, ne obavezna (BRIEF A19 „IZMENITI APSOLUTNI USLOV”); manifest i izlazi sačuvani.
- **Najmanja promena (PREDLOG):** `EvolutionLLM` adapter nad postojećim provider router-om (ugovor je `complete(prompt)`); `buildRunPrompt` zameniti pozivom koji koristi `composePersonaPrompt(core, {systemPrompt: candidate})` kao system poruku; u `artifacts` upisati `{executorModel, judgeModel, perExampleOutputs (redigovano)}`.
- **Povezani AT:** AT-05, AT-26 (KVARK bez cloud fallbacka)

### F-EVO-05 — EvolveSchema pobednička šema se ne koristi u Stage 2 izvršenju niti u deploy-u (S1 C10, R19; PRD §9 „Preserve EvolveSchema”; AT-05)
- **Status:** POTVRĐENO NA REVIZIJI
- **Commit:** `2af0904d…`
- **Putanja/simbol:** `compose-evolution.ts:184` `frozenSchema = schemaResult.winner.schema`; `:191-196` `new IterativeGEPA().run({...options.instructions, judge: filteredJudge, …})` — šema **nije** prosleđena; `makeRunningJudge`/`buildRunPrompt` nemaju parametar šeme; `routes/evolution.ts:51-82` `deployFromRun` upisuje samo `run.winner_text`; `winner_schema_json` postoji u bazi (`evolution-orchestrator.ts:224`) i u GET detail (`routes/evolution.ts:133-136`), UI ga ne prikazuje (`EvolutionTab.tsx:32,45` samo tipovi). Stage 1 troši default `populationSize 5 × generations 3 × evalSize 32 + anchor 100` LLM poziva (`evolve-schema.ts:830-835`).
- **Ulaz:** bilo koji run.
- **Trenutni izlaz:** rezultat Stage 1 utiče samo na `combinedDelta`/`fullyImproved` (`compose-evolution.ts:198-201`) i na `paretoFrontSize` artefakt.
- **Repro/ograničenje:** čitanje koda (potpisi funkcija); `repro-gepa-delta.mjs (c)` pokazuje da `runOnce` prolazi Stage 1 i vraća `frozenSchema`, ali nema kanala do Stage 2.
- **Očekivano:** ili se šema koristi u target izvršenju i deploy-u, ili se stage izbacuje iz default compose-a (BRIEF R19: „Sačuvati koristan efekat, ne no-op”).
- **Najmanja promena (PREDLOG):** proslediti `frozenSchema` u Stage 2 executor (schema-fill deo prompta, kao `buildSchemaFillPrompt`) i u deploy artefakt; AT-05 test da Stage 2 executor vidi šemu.
- **Povezani AT:** AT-05

### F-EVO-06 — Delta i regression gate porede različite uzorke; `combinedDelta` oduzima različite metrike; null ispada iz imenitelja; infrastrukturna greška = 0 (S1 A18; BRIEF DIR-15; AT-29)
- **Status:** POTVRĐENO NA REVIZIJI
- **Commit:** `2af0904d…`
- **Putanja/simbol:** `iterative-optimizer.ts:205-211` baseline se ocenjuje **samo** na `microSample` (`microScreenSize` 50); `:302-311` anchor ocenjuje samo `survivors` (baseline je tu jedino ako nije dominiran); `:315-325` `delta = winner.score.overall − baseline.score.overall` (score = poslednja faza). `evolution-orchestrator.ts:187-189` isto (`history[0].score.overall` vs `winner.score.overall`), komentar `:184-186` „Both are scored… on the same eval stage” nije tačan u dominiranom slučaju; `:194-199` regression gate koristi te brojeve; `evolution-runs.delta_accuracy` = taj broj; UI ga prikazuje kao `deployed lift`. `compose-evolution.ts:198-200` `combinedDelta = gepa.winner.overall − schema.history[0].accuracy` (metrika GEPA vs metrika šeme). `iterative-optimizer.ts:398-416` `scoreOne` vraća `null` na abort/throw i filtrira ih pre `aggregateScores` → `n` se smanjuje; `judge.ts:141-151` i `evolution-llm-wiring.ts:439-447` LLM/infra greške postaju score 0 (mešaju se sa modelnim neuspehom).
- **Ulaz (repro `docs/plans/v1.2-evidence/phaseA/repro-gepa-delta.mjs (a)`):** 400 primera, deterministički running judge (baseline 0.5/0.9 naizmenično → prava sredina 0.7; dete 0.95), `microScreenSize 50`, `anchorEvalSize 400`, `seed 1`.
- **Trenutni izlaz:** `history[0].score.n = 50`, `winner.score.n = 400`; baseline (micro) `0.6840`; `GEPARunResult.delta = 0.2660`, a na istom uzorku bio bi `0.2500`.
- **Repro/ograničenje:** repro je sintetički; smer greške zavisi od uzorka (može precenjivati ili potcenjivati); nije provereno na stvarnim tragovima.
- **Očekivano:** baseline i kandidat ponovo ocenjeni na istim primerima i budžetu; CI/margina; greške ne ispadaju iz imenitelja; razdvojiti model/alat/infra/evaluator neuspeh.
- **Najmanja promena (PREDLOG):** u anchor fazi uvek oceniti i `baseline` (zaseban `anchorScore` polje, ne prepisivati micro score), delta/gate računati iz anchor para; `combinedDelta` ukloniti ili preimenovati; `aggregateScores` vraća `n_failed` i `n_aborted`.
- **Povezani AT:** AT-29

### F-EVO-07 — Orkestrator zaobilazi `EvalDatasetBuilder.build()`: nema secret scan-a, heuristike, dedup-a, splita/holdout-a; korekcija = gold; nema persona/workspace scope-a (S1 A16, A17; AT-29, AT-13, AT-19)
- **Status:** POTVRĐENO NA REVIZIJI
- **Commit:** `2af0904d…`
- **Putanja/simbol:** `evolution-orchestrator.ts:311-326` `buildExamplesFromTraces` → `builder.sourceFromTraces(['success','verified'], true, {...traceFilter, limit:500})`; `build()` (`eval-dataset.ts:207-325`, sa secret scan-om `:232-245` i 60/20/20 splitom) **nema produkcionog pozivaoca** (git grep: jedini `EvalDatasetBuilder` u src je orkestrator sa `sourceFromTraces`). `eval-dataset.ts:359-381` `traceToExample`: za `corrected` `expected_output = correctionFeedback` (korekcija kao gold). `traceFilter = options.autoTrigger?.traceFilter ?? {}` — `routes/evolution.ts:387-416` i `evolution-service.ts:320-339` ne prosleđuju `autoTrigger` → filter `{}`; servis filtrira `personaId` samo za dataset gate (`:229-236`), ne za sam run. `traceStore = new ExecutionTraceStore(multiMind.personal)` (`index.ts:591`), redovi nose `persona_id`/`workspace_id` (`execution-traces.ts:59-60`), ali se ne filtriraju → tragovi svih persona i workspace-a ulaze u kandidata za jednu personu. Svi primeri idu u iste micro/mini/anchor uzorke (bez zamrznutog holdout-a).
- **Ulaz (repro `(b)`):** trag sa `sk-ant-…` ključem u `payload.input`.
- **Trenutni izlaz:** `detectSecrets` = `anthropic-key` (build() bi odbio), a tajna je **stigla i do judge-a i do schema executora** (u produkciji: poslata Anthropic-u).
- **Repro/ograničenje:** in-memory store; nije testiran stvarni SQLite `queryParsed`.
- **Očekivano:** frozen holdout + hash, provenance/scope po primeru, korekcija je signal a ne gold (BRIEF 10.4/10.5, A17).
- **Najmanja promena (PREDLOG):** zameniti `sourceFromTraces` sa `await builder.build({ traceFilter: { personaId, workspaceId }, includeCorrections: false, seed })`; GEPA faze na `train+val`, finalni upareni score na `holdout`; `artifacts` beleži hash skupa i broj pogleda na holdout.
- **Povezani AT:** AT-29, AT-13, AT-19

### F-EVO-08 — Evolution zahteva Anthropic ključ u vault-u; nema lokalnog evaluatora; nema procene troška, cap-a ni abort-a (S1 L13, A16; BRIEF 10.4; D-03/D-05)
- **Status:** POTVRĐENO NA REVIZIJI
- **Commit:** `2af0904d…`
- **Putanja/simbol:** `routes/evolution.ts:355-363` (`server.vault?.get('anthropic')` → 422 „No Anthropic API key configured”); `evolution-service.ts:177-180`; `index.ts:2751` `getApiKey: () => server.vault?.get('anthropic')`; `evolution-llm-wiring.ts:214-260` jedini produkcioni `EvolutionLLM` (Anthropic/Haiku), alternativa samo test hook `__waggleEvolutionLlmFactory` (`routes/evolution.ts:632-641`). Grep `budget|maxCost|cost cap|estimate|consent|AbortController` po evolution fajlovima i `EvolutionTab.tsx`: 0 relevantnih pogodaka. SSE klijent-disconnect ne prekida run (`routes/evolution.ts:458-462`, namerno). Retry do 6 pokušaja sa backoff do 150 s (`:87-93`) povećava potrošnju bez gornje granice.
- **Ulaz:** lokalni profil bez Anthropic ključa, ili KVARK režim.
- **Trenutni izlaz:** evolution nedostupna (422) odn. skriveno cloud-zavisna; nema prikaza gde podaci odlaze (tragovi korisnikovog rada idu Anthropic-u, vidi F-EVO-07).
- **Repro/ograničenje:** test `packages/server/tests/evolution-run-route.test.ts:132` potvrđuje 422; nije proveren stvarni trošak.
- **Očekivano:** lokalni evaluator default; BYOK judge uz zasebno odobrenje, minimizaciju, budžet, abort; u KVARK režimu bez cloud izlaza.
- **Najmanja promena (PREDLOG):** `EvolutionLLM` adapter nad provider router-om/izabranim lokalnim modelom; eksplicitan `consent` flag u body-ju za cloud judge; `AbortController` vezan na SSE close + `maxJudgeCalls` cap u `scoreCandidate`.
- **Povezani AT:** AT-29, AT-26

### F-EVO-09 — `AgentLearning` i improvement wiring su mrtav kod; `corrected` tragovi se ne proizvode; postoji delimična zamena (thumbs-down → signal → prompt) (S1 C10, R18; PRD §9 „Preserve behavior learning… persona effectiveness”)
- **Status:** POTVRĐENO NA REVIZIJI (mrtav kod) + DELIMIČNO/NEPOVEZANO (zamena postoji samo za deo)
- **Commit:** `2af0904d…`
- **Putanja/simbol:** vidi tabelu §0. Dodatno: `AgentLearning.recordPersonaTask` (`agent-learning.ts:69-77`) — jedini izvor „persona effectiveness” — nema pozivaoca, pa PRD tvrdnja o persona effectiveness learning-u nema producenta. Živi tok: `feedback.ts:91-94` → `improvement_signals('correction')` → `chat.ts:1485-1496` „# User Corrections (from prior sessions — follow these)”. `capability_gap` signale proizvodi `chat.ts:955-969` (`recordCapabilityGap`), `skill_promotion` proizvodi `chat-turn-completion.ts:199-212`.
- **Ulaz:** korisnička tekstualna korekcija u sledećem turn-u („ne, hteo sam…”).
- **Trenutni izlaz:** ništa se ne beleži kao korekcija (ni trace `corrected`, ni signal); samo eksplicitni thumbs-down sa `reason` proizvodi signal.
- **Repro/ograničenje:** grep dokaz; nije testiran end-to-end thumbs-down tok.
- **Očekivano:** BRIEF C10/R18: dokazati effective behavior; ne čuvati no-op; brisanje nije „rešeno učenje”.
- **Najmanja promena (PREDLOG):** odluka wire-vs-remove; ako wire: `processInteractionForImprovement` u `chat-turn-completion` → `traceStore.markCorrected(prevTraceId, detail)` + `signalStore.record('correction', …)`; `AgentLearning.formatLearningPrompt()` spojiti sa postojećom „# User Corrections” sekcijom (jedan kanal, ne dva); `recordPersonaTask` iz `finalizeOnce`. Ako remove: ukloniti export `index.ts:231` i preformulisati PRD §9.
- **Povezani AT:** (nema direktnog; ulaz za AT-29 korekcija ≠ gold)

### F-EVO-10 — UI i dokumentacija tvrde „deployed/hot-reload/score-verified” koje runtime ne potvrđuje (S1 W0 „hide/guard Evolution 'deployed'”; DIR-13 „ukloniti lažne UX tvrdnje”)
- **Status:** POTVRĐENO NA REVIZIJI
- **Commit:** `2af0904d…`
- **Putanja/simbol:** `apps/web/src/components/os/apps/memory/EvolutionTab.tsx:759` „Accept & Deploy”; `:771` „Accepting writes an override file and hot-reloads the spec”; `:191-192, :212` „The run that actually shipped (status === 'deployed')”; `:883` `deployed lift`; `:237-247` `deriveProvenance` → „regression gate · score-verified”. `evolution-runs.ts:192-201` `markDeployed` se postavlja čim `deploy` callback ne baci (fajl upisan), bez provere aktivacije. `docs/backend-map/sections/05d-subsystem-evolution.md:5` („versioned, rollback-able override and hot-reloads the live spec”) i `:94` (event „invalidate the chat route's system-prompt cache” — konzument ne postoji).
- **Ulaz:** accept persona run-a.
- **Trenutni izlaz:** status `deployed` + „deployed lift” za promenu koju nijedan chat turn ne koristi (F-EVO-01); „score-verified” izveden iz gate-a sa neuparenim uzorcima (F-EVO-06). Za `behavioral-spec-section` tvrdnja „hot-reloads the spec” je tačna (F-EVO-11).
- **Repro/ograničenje:** čitanje koda/copy-ja; nije snimljen UI.
- **Očekivano:** status odražava aktivaciju; copy zavisi od target kind-a.
- **Najmanja promena (PREDLOG):** posle F-EVO-01/02 — pre `markDeployed` proveriti da resolver vraća upisani prompt (activation check), inače status `written_not_active`/`failed` sa razlogom; ukloniti „score-verified” dok gate ne poredi upareni holdout.
- **Povezani AT:** AT-04

### F-EVO-11 — Behavioral-spec override put radi (S1 nije tvrdio suprotno; potvrda pozitivnog stanja)
- **Status:** VEĆ ZATVORENO / radi (uz ogradu)
- **Commit:** `2af0904d…`
- **Putanja/simbol:** `evolution-deploy.ts:184-259` (`deployBehavioralSpecOverride`, `loadBehavioralSpecOverrides`), `packages/agent/src/behavioral-spec.ts:409-437` `buildActiveBehavioralSpec`, `index.ts:626-635` (učitavanje pri boot-u + `on('behavioral-spec:reloaded')` re-dekoracija), `chat.ts:1264-1314,1441-1444` (`server.activeBehavioralSpec ?? BEHAVIORAL_SPEC`), test `evolution-routes.test.ts:190`.
- **Ograda:** `systemPromptCache` (`chat.ts:993,1318-1329`) nije eksplicitno invalidiran na `behavioral-spec:reloaded`; ključ je po sesiji, validacija po `historyLength/personaId/model…`, pa novi spec ulazi tek kad se `historyLength` promeni (praktično sledeći turn). Nije reprodukovano; oslonac je čitanje koda i istorijski `GEPA-SCOPE-AUDIT` §2.
- **Povezani AT:** AT-04 (za spec deo)

### F-EVO-12 — `verified` outcome u eval skupu potiče iz `harness:phase:complete`, ne iz sadržinske provere (ukršteno sa harness grupom; BRIEF §7.3; S1 A17)
- **Status:** DELIMIČNO/NEPOVEZANO (vlasnik: harness grupa; ovde samo posledica za evolution podatke)
- **Commit:** `2af0904d…`
- **Putanja/simbol:** `packages/agent/src/harness-trace-bridge.ts:9-14, 91, 123, 155` (`harness:phase:complete → trace outcome 'verified'`), instanciran u `index.ts:612-618`; `evolution-orchestrator.ts:302` i `:321` tretiraju `verified` kao pozitivan/gold primer; `evolution-service.ts:110` u dataset gate. Drugi producent `verified` u `packages/server/src` nije pronađen (grep `'verified'`).
- **Očekivano:** BRIEF §7.3 — legacy `verified` bez dokaza = unqualified; samo kvalifikovani tragovi ulaze u eval skup.
- **Najmanja promena (PREDLOG):** u eval izboru razdvojiti `gate_passed` od `verified` (ProofReceipt) čim W1 definiše ProofReceipt; do tada `positiveOutcomes: ['success']` + eksplicitno označena qualification.
- **Povezani AT:** AT-29

---

## 2. Šta postoji i treba sačuvati (existingAssetsToPreserve)

| Šta | Putanja | Pozivaoci (grep) |
|---|---|---|
| Running judge + brend + GEPA guard (izvršenje kandidata pre ocenjivanja) | `packages/agent/src/evolution-llm-wiring.ts:415-452`; `iterative-optimizer.ts:173-184`; propagacija brenda `compose-evolution.ts:142-149` | `routes/evolution.ts:377,404`; `services/evolution-service.ts:310,332`; testovi `iterative-optimizer.test.ts:424-445`, `evolution-llm-wiring.test.ts:266-330` |
| Behavioral-spec override pipeline (deploy → load → active spec → chat prompt) | `evolution-deploy.ts:184-259`; `behavioral-spec.ts:409-437`; `index.ts:626-635`; `chat.ts:1264-1314,1441-1444` | `routes/evolution.ts:63-73` (deploy), `routes/evolution.ts:269-284` (baseline čita aktivni spec), `evolution-service.ts:279-287`; test `evolution-routes.test.ts:190` |
| `EvolutionRunStore` audit trail (svaki run, i odbijeni) | `packages/hive-mind-core/src/mind/evolution-runs.ts` | `index.ts:622-623`; `routes/evolution.ts:113,130,166,210,218,518`; `evolution-orchestrator.ts:219-253`; `evolution-service.ts:222` |
| Gates (size/growth/structure/regression) | `packages/agent/src/evolution-gates.ts:99-135` | `evolution-orchestrator.ts:194-204`; test `tests/evolution-gates.test.ts` |
| `EvalDatasetBuilder.build()` sa secret scan/heuristikom/dedup/60-20-20 splitom + `detectSecrets`/`redactSecrets` | `packages/agent/src/eval-dataset.ts:96-145, 207-325` | `build()` **bez produkcionog pozivaoca** (samo `sourceFromTraces` iz `evolution-orchestrator.ts:319-325`); `redactSecrets` koristi `server/src/local/executor-brief.ts:72`; export `agent/src/index.ts:237` |
| Persona override writer/rollback (atomic write, `.bak`, Windows rename retry) | `evolution-deploy.ts:68-135, 277-305` | deploy: `routes/evolution.ts:57`; rollback: **0** pozivalaca (samo testovi `evolution-deploy.test.ts`) |
| Custom personas loader/CRUD sa zaštitom built-in ID-eva | `packages/agent/src/custom-personas.ts:34-70`; `routes/personas.ts:72-74, 208-210` (409/403 za built-in id) | `personas.ts:68`; `routes/personas.ts`; napomena: deploy put (`deployPersonaOverride`) namerno **zaobilazi** tu zaštitu i piše shadow ID |
| Živi „learning” tok: thumbs-down → `improvement_signals('correction')` → „# User Corrections” u promptu; `capability_gap` i `skill_promotion` signali | `routes/feedback.ts:91-94`; `chat.ts:955-969, 1485-1496`; `chat-turn-completion.ts:199-212`; `hive-mind-core/src/mind/improvement-signals.ts:80-141` | `fastify.agentState.orchestrator.getImprovementSignals()`; `monthly-assessment.ts:136-138,246` |
| `ExecutionTraceStore` supstrat sa `persona_id`, `workspace_id`, `model`, `markCorrected` API | `hive-mind-core/src/mind/execution-traces.ts:56-61, 473-490` | `index.ts:591`; `chat.ts:1653` (`TurnExecutionTrace`), `chat-turn-completion.ts:374-383` (`finalizeOnce`), `fleet.ts:442`, `external-tool-runs.ts:795,851`, `agent-groups.ts:617` |
| `EvolutionService` opt-in daemon (samo `proposed`, nikad auto-deploy) | `services/evolution-service.ts`; `index.ts:2747-2767`; env `WAGGLE_EVOLUTION_AUTO_ENABLED`, `WAGGLE_EVOLUTION_TICK_INTERVAL_MS`, `WAGGLE_EVOLUTION_MIN_TRACES` | `index.ts:2764-2766`; test `tests/services/evolution-service.test.ts` |
| SSE progress za `POST /api/evolution/run` + UI progres | `routes/evolution.ts:437-488`; `EvolutionTab.tsx:1096` | test `evolution-run-route.test.ts:267-360` |
| Fleet persona snapshot (presedan za „run ostaje na svojoj verziji”) | `fleet-run-executor.ts:589-591` (`savedAgentPolicy?.persona ?? listPersonas().find`) | test `tests/local/fleet-isolation.test.ts:455-485` |
| Statički GEPA-evolved prompt shapes (Faza 1, LOCKED gen1-v1) | `packages/agent/src/prompt-shapes/index.ts:40-44`; `canary/phase-5-router.ts:35-36` | `routes/agent-run.ts:39-40` (`registerShape`) — **ne** chat put; `chat.ts:1235-1236` pominje PROMPT_ASSEMBLER (nije proveravano u ovoj grupi) |

---

## 3. Napomene

- **Deploy za `tool-description`/`skill-body`/`generic`:** `validateRunBody` ih prihvata (`routes/evolution.ts:530-536`), a `deployFromRun` baca „not yet implemented” (`:74-81`) → run završava `failed` tek posle accept-a. UI targets endpoint nudi samo persone i sekcije (`:228-240`), pa je rizik nizak, ali API ugovor je nekonzistentan. (DELIMIČNO)
- **Recipe evolution (S1 §3 „defer”; BRIEF 10.3 ograničen obim):** ne postoji kod za harness-recipe target (enum `EvolutionTarget` `iterative-optimizer.ts:88-93` nema takvu vrednost). Nema šta da se „odloži” u kodu; ograničeni obim iz DIR-14 je net-new. (NEPOZNATO → planer)
- **Cache posle deploy-a:** `systemPromptCache` (`chat.ts:993`) nema `on('persona:reloaded')` niti `on('behavioral-spec:reloaded')`; efekat novog override-a ulazi tek na cache miss (ključ validacija po `historyLength` itd., `chat.ts:1327-1329`). Za personu je to trenutno irelevantno zbog F-EVO-01.
- **Test rupa koja je dozvolila F-EVO-01:** predikat u `evolution-deploy.test.ts:116` i disk-only assert u `evolution-routes.test.ts:184-188`. RED test za AT-04 mora proći kroz `resolvePersona`/`buildSystemPrompt`, ne kroz `listPersonas().find(id && includes)`.
- **Repro fajlovi:** `docs/plans/v1.2-evidence/phaseA/repro-shadow.mjs`, `docs/plans/v1.2-evidence/phaseA/repro-gepa-delta.mjs` (oba čitaju `packages/agent/dist`, pišu samo u planerski radni prostor (sada `docs/plans/v1.2-evidence/`); `dist` gradnja od 2026-09-27 05:27 je novija od poslednje izmene `personas.ts`/`chat.ts` iz commit-a `fba2f94d`).
- **Nije menjano ništa u repou.** Nisu izvršavani `npm`/`vitest` ni mutirajuće git komande.
