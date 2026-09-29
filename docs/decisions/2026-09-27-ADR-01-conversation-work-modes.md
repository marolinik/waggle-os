# ADR-01 — Conversation vs work i režimi izvršenja (`normal` / `strict` / `benchmark`)

**Revizija dokumenta:** 1.2 DRAFT · 27.09.2026 · pregledana revizija koda `2af0904df01ca3d374cc78ba95b60dc579dd6a7a`
**Datum:** 2026-09-27
**Status:** DRAFT — predlog ugovora; nije odobreno, nije implementirano, nijedan test nije pokrenut nad izmenom
**Autor:** planer (Fable 5.1), po founder brief-u „Usmerenje za replaniranje i razrešenje PRD/FRD v1.1” (27.09.2026)
**Ratifikuje:** founder — čeka
**Zamenjuje / precizira:** implicitni „harness = opt-in tool koji model sam pozove” ugovor iz `93ff7813` (2026-04-15) i `fb341aad` (2026-07-30); FRD v1.1 §3 korak 3 („Classify TaskShape and choose harness version”) bez odvojene interakcione vrste; S1 A4 (jedna `ExecutionMode` tabela)
**Obavezuje:** W0 (istinitost statusa), W1 (DurableRun kreiranje), W3 (server router + dve recipe putanje), B1–B3 (benchmark režim), FRD v1.2 §„Režimi”
**Cross-references:** ADR-02 (durable store), ADR-03 (detach/cancel), ADR-10 (release/privacy profili); brief §6.1 (DIR-03), §7.2, §13.3; AT-01, AT-02, AT-03, AT-06, AT-21, AT-28

---

## §1 — Kontekst

**ADR-01-K1 (POTVRĐENO NA REVIZIJI).** Na `2af0904d` ne postoji server-side razdvajanje „razgovor” od „posao”. `detectTaskShape` (`packages/agent/src/task-shape.ts:145`) je čisto heuristički klasifikator (`research|compare|draft|review|decide|plan-execute|mixed` + `complexity`) koji chat putanja koristi samo kao ulaz za prompt assembler i budžet (`packages/server/src/local/routes/chat-turn-preparation.ts:381,1119-1123`; `chat.ts:746` samo `complexity === 'simple'`). Ne bira harness ni recipe. [docs/plans/v1.2-evidence/phaseA/harness.md F-HARN-09]

**ADR-01-K2 (POTVRĐENO NA REVIZIJI).** Izbor harnessa je model-invoked tekst: `compose_workflow` (`packages/agent/src/workflow-tools.ts:84-119`) samo ispisuje `executionMode` iz `selectExecutionMode` (`workflow-composer.ts:99-104`, `'harnessed'` kad `FEATURE_FLAGS.ADVANCED_WORKFLOWS` — default ON, `feature-flags.ts:14` — i `matchHarness(task)`), ne startuje harness; model potom možda pozove `run_harness`. `run_harness` je vidljiv u običnom chat turnu kad poruka sadrži `agent|delegate|workflow|orchestrate|synthesi[sz]e…` (`tool-filter.ts:242-246`). [F-HARN-09; harness.refute.md F-HARN-08]

**ADR-01-K3 (POTVRĐENO NA REVIZIJI).** Ne postoji pojam režima izvršenja. Verify faza se preskače po defaultu: `workflow-harness.ts:313` + `shouldSkipVerify()` `:474-482` (`env !== 'true' && env !== '1'`; `catch → true`); nijedna konfiguracija u repou ne postavlja `WAGGLE_AUTO_VERIFY` (`git grep` po `app/`, `sidecar/`, `scripts/`, `.env.example`, `package.json`, `apps/web` = 0). `FEATURE_FLAGS.VERIFIER_AUTO_RUN` (`feature-flags.ts:26`) čita istu promenljivu drugom semantikom i nema nijednog konzumenta. Commit `93ff7813` je auto-skip svesno zadržao („Behavior kept: … auto-skip of 'verify' phases when WAGGLE_AUTO_VERIFY is unset”). [F-HARN-01; refute HOLDS]

**ADR-01-K4 (POTVRĐENO NA REVIZIJI).** Gates čitaju model-supplied dokaz: `workflow-tools.ts:330-358` schema `phase_output.tool_calls/artifacts/duration_ms/tokens` popunjava model, `:412-422` gradi `PhaseOutput` doslovno; `git grep phase_output packages/server/src` = 0. Server ima opažene podatke (`chat-agent-run.ts:214-225` `onToolResult` → `isError`, `TurnToolActivity`), ali ne stižu do `run_harness`. VERDICT regex prihvata `FAIL` i `CONDITIONAL` kao PASS (`builtin-harnesses.ts:128`, `hasPattern` `:43-51`); bash gate prolazi na bilo koji poziv čije ime sadrži `bash` (`:181`, `:13-24` substring), exit code se opaža (`packages/agent/src/system-tools-helpers.ts:732-735`) pa odbacuje (`packages/agent/src/system-tools.ts:681-691`: `Error:` prefiks samo kad je izlaz prazan). `run_harness` je u `VERIFICATION_TOOL_EXACT` (`verification-gate.ts:33`; poreklo `9fce1d2f`, bez dokumentovane odluke). Budget stop gasi D3 uključujući disclosure putanju (`agent-loop.ts:1523-1534` `enableVerification:false`; `loop-gates.ts:903`; `budgetStopResponse` `agent-loop.ts:895-920` bez partial oznake). [F-HARN-02/03/04/05/08; refute: sve HOLDS; putanje ispravljene po refute-u — `system-tools*.ts`/`tool-executor.ts` su u `packages/agent/src/`]

**ADR-01-K5 (POTVRĐENO NA REVIZIJI).** Završena faza upisuje trace `outcome:'verified'` bez sadržinske provere (`harness-trace-bridge.ts:91`; tool zapisi `ok:true/durationMs:0` `:139-148`; boot bez `context` `packages/server/src/local/index.ts:612-616`), a `eval-dataset.ts:208` `positiveOutcomes ?? ['success','verified']` te redove tretira kao pozitivne primere za evolution. `TraceOutcome` (`packages/hive-mind-core/src/mind/execution-traces.ts:20`) nema `gate_passed`; SQL `CHECK` na `:150-151` i `schema.ts:242-243` → dodavanje vrednosti je table-rebuild migracija, ne type-edit. [F-HARN-06; refute WEAKENED samo na nivou minimalChange]

**ADR-01-K6 (POTVRĐENO NA REVIZIJI).** `harnessEvents` je process-globalni `EventEmitter` (`workflow-harness.ts:132`); payloadi `:169-207` nose `harnessId` (id šablona), ne `runId`; `run_harness` generiše `run_id` (`workflow-tools.ts:374,453-457`, in-memory `activeHarnessRuns` `:447`) i ne prosleđuje ga u engine. Dva istovremena Workspace run-a istog harnessa su nerazlučiva u events/traces. [F-HARN-07, F-DUR-08]

**ADR-01-K7 (ODLUKA — D-06, D-08, D-13, D-18 · PREDLOG — SMER BRIEFA — DIR-03, DIR-07, DIR-08, DIR-22).** ODLUKA: knowledge work je primarni posao (D-06); chat ostaje unutar Workspace-a (D-08); evolution je deo teze proizvoda (D-13); benchmark je ključan dokaz (D-18). PREDLOG — SMER BRIEFA (planerski smer, ne korisnikovo odobrenje): režim ne sme davati veća ovlašćenja (DIR-03, brief §6.1); server je autoritet izvršnih dokaza (DIR-07); budget stop ne stvara uspeh (DIR-08); benchmark ide kroz production putanju (DIR-22). Odluke ovaj ADR sprovodi, ne odlučuje ponovo; smer briefa razrađuje kao radnu osnovu nacrta.

**ADR-01-K8 (NALAZ AUDITA — ZA PROVERU).** S1 A4 traži „default za everyday chat i latency budget”. Brief §6.1 zabranjuje preuzimanje ranijeg opšteg cilja „deset minuta”. Izmereni budžeti latencije po task shape-u ne postoje u repou (nijedan test ne meri klasifikacija→prvi token za `work`). Prag se postavlja pre zaključanog testa (brief §16).

## §2 — Odluka (predlog ugovora)

**ADR-01-O1 (PREDLOG).** Uvesti dve ortogonalne ose, obe server-side i persistirane u `DurableRun` (ADR-02):
- `interaction: 'conversation' | 'work'` — vrsta interakcije;
- `mode: 'normal' | 'strict' | 'benchmark'` — režim izvršenja (važi samo za `work`; `conversation` nema režim).

**ADR-01-O2 (PREDLOG).** Klasifikacija je server-side, deterministička u prvom obimu (postojeći `detectTaskShape` + eksplicitni signali: Routine trigger, Ask Waggle intent sa artefakt tipom, `/work` komanda), vidljiva korisniku („Ovo izgleda kao posao: research brief. Pokreni kao posao / Ostani u razgovoru”) i popravljiva pre nego što run pređe u `RUNNING`. Pogrešna klasifikacija ne pokreće tihi skup dugi rad (DIR-03). LLM-klasifikator nije uslov za G1/G2.

**ADR-01-O3 (PREDLOG) — tabela režima (brief §6.1, prenesena kao ugovor):**

| Režim | Ponašanje | Nepromenljivo |
|---|---|---|
| `conversation` | postojeći lagani agent tok (`/api/chat`), retrieval + dozvoljeni alati; nema DurableRun-a osim kad turn eksplicitno pokrene posao | ne izmišlja verifikaciju (D3 ostaje); scope/egress/approvals/budžet važe |
| `work · normal` | izabrani recipe/version; samo opravdane faze; obavezni gates konkretnog zadatka; neuspeh se ne prikazuje kao provereno završen | verify faza se ne preskače tiho; opt-out je eksplicitan, upisan u run sa razlogom i prikazan („Completed — verify skipped”) |
| `work · strict` | sve obavezne provere; evidence minimum definisan recipe-om; blok/partial pri nedostatku dokaza ili budžeta | nema skip verify, nema self-reported tool uspeha, nema popuštanja D3 posle retry-ja |
| `work · benchmark` | ista production semantika kao testirana konfiguracija; zaključan manifest; izabrani ablation profil; nezavisno ocenjivanje | ne otključava dodatne podatke/alate/odobrenja; puna Waggle konfiguracija ne preskače obavezni verify |

**ADR-01-O4 (PREDLOG).** Server-observed evidence je jedini ulaz u gates (DIR-07): `WorkflowToolsConfig` dobija `observedToolCalls(sinceMarker)` provider koji server puni iz `onToolResult`; `phase_output.tool_calls` iz modela se ignoriše u `strict`/`benchmark`, a u `normal` označava kao `selfReported:true` i ne može sam zadovoljiti gate. Verify gate čita **vrednost** verdikta (`PASS` prolazi; `FAIL` → retry pa block; `CONDITIONAL` → recipe-definisana `conditionalPolicy`: dopuna | korisnički pregled | završetak sa eksplicitnim ograničenjem; nikad tihi PASS). Bash/test gate čita `ok/exitCode` sa granice alata (nenulti exit ≠ success; `echo` nije test).

**ADR-01-O5 (PREDLOG).** Tri nivoa potvrde umesto jednog `verified` (brief §7.2), kao `ProofReceipt.level` enum iz FRD-02.6: `structural` (izvršno/strukturno: fajl postoji i parsira se, sekcije, alat završen sa opaženim statusom), `defined_elements` (provera definisanih elemenata: brojevi/datumi/citati/reference prema označenim izvorima), `content_review` (sadržinski pregled po rubrici). `ProofReceipt` (ADR-02) nosi nivo. `gate_passed` ostaje isključivo `TraceOutcome` vrednost (trag faze koja je prošla strukturni gate, P2), ne `ProofReceipt` nivo; `verified` je rezervisan za receipt nivoa ≥ `defined_elements` (FRD-02.6). Postojeći `verified` trace redovi sa `task_shape LIKE 'harness:%'` postaju `legacy/unqualified` i ne ulaze u eval pozitive dok ne postoji ProofReceipt (DIR-13 veza: ADR-06).

**ADR-01-O6 (PREDLOG).** Budget stop (DIR-08): zadržati D3 u „disclose-only” modu pre `budgetStopResponse`; `AgentResponse` dobija `budgetStop:true`; run status → `FAILED_RETRYABLE` sa razlogom `budget_exhausted_before_verify` i sačuvanim potrošenim budžetom; korisnik može odobriti dodatni budžet ili prihvatiti jasno označen nacrt; obavezni gate se ne briše retroaktivno.

**ADR-01-O7 (PREDLOG).** Latency budžet po task shape-u se **meri**, ne preuzima (brief §6.1): izmerena medijana i p90 za `conversation` (klasifikacija + prvi token) i za svaku od dve recipe putanje (klasifikacija → prva faza start), na referentnom lokalnom modelu i referentnom hardveru, meri se u W3 (Delivery plan §2 W3 Output: „latency budžet po task shape-u (meren, ne 10-min pretpostavka)”) i predstavlja **ulaz za DQ-09** (Delivery plan §6: „latency budžet po task shape-u (meren u W3)”, zaključava se pre B3/F2), pre zaključavanja praga (brief §16 uvodni pasus). Ovo **nije** zaseban G2 exit kriterijum: Delivery plan §1 G2 (a)–(i) ga ne sadrži, a ovaj ADR ga ne dodaje.

**ADR-01-O8 (PREDLOG).** Redosled popravki u W0 je obavezan: F-HARN-01 (skip default) i F-HARN-08 (self-reported dokaz) pre F-HARN-02/03 (gate vrednosti) — strog gate koji čita izmišljene podatke ne vredi; F-HARN-04 (`run_harness` van verification skupa) i F-HARN-05 (budget disclose-only) nezavisno. [harness.refute.md cross-cutting 2]

## §3 — Šta zamenjuje i zašto

| Prethodna odluka / stanje | Gde | Zašto se menja |
|---|---|---|
| Auto-skip verify faze kad `WAGGLE_AUTO_VERIFY` nije postavljen (svesno zadržano) | `93ff7813` commit poruka; `workflow-harness.ts:313,474-482` | Fail-open default suprotan DIR-03/07; production default = skip; „Completed” bez oznake (POTVRĐENO NA REVIZIJI) |
| `run_harness` kao verifikacioni alat | `9fce1d2f` (2026-07-20), `verification-gate.ts:33` | Preneseno mehanički iz starog regexa (`run_`), bez odluke; orkestracija nije verifikacija (POTVRĐENO NA REVIZIJI) |
| Harness biranje = model čita tekst `compose_workflow` | `workflow-tools.ts:84-119` | Nema server-side klasifikacije ni režima; korisnik ne vidi ni ne može popraviti (POTVRĐENO NA REVIZIJI) |
| FRD v1.1 §3 korak 3 i §5 „Verification is mandatory in strict/benchmark recipes” bez definicije režima | docs/plans/v1.2-evidence/inputs/Waggle_FRD_v1.1_2026-09-27.md:45,89 | Precizirano tabelom O3; `conversation` dobija eksplicitan tretman (S1 A4 PRIHVATITI/PRECIZIRATI) |
| S1 A4 „jedna ExecutionMode tabela (normal/strict/benchmark)” | docs/plans/v1.2-evidence/inputs/S1-audit-2026-09-27.md A4 | Razdvojeno na dve ose po brief §6.1; režim ne proširuje dozvole |
| `harness:phase:complete → 'verified'` | `harness-trace-bridge.ts:11,91` | Strukturni gate ≠ sadržinska potvrda; kontaminira eval skup (POTVRĐENO NA REVIZIJI) |

**ADR-01-Z1 (ODLUKA — ne otvara se · PREDLOG — SMER BRIEFA — brief §5.1).** ODLUKA: D-01..D-18 nisu predmet ovog ADR-a. PREDLOG — SMER BRIEFA: „Option A ship first” nije radna osnova (brief §5.1 planerski smer: G1 → G2 → G3).

## §4 — Posledice

**ADR-01-P1 (PREDLOG).** Testovi koji pocrvene i moraju se ažurirati uz fix (POTVRĐENO NA REVIZIJI da postoje i pinuju trenutno ponašanje): `packages/agent/tests/workflow-tools-harness.test.ts:135-179` (oslanja se na auto-skip), `:82-106` (Gather gate na self-reported `search_memory`), `packages/agent/tests/harness-trace-bridge.test.ts:82-92,327` (pinuje `'verified'`). Nijedan test ne pinuje `ok:true/durationMs:0`.

**ADR-01-P2 (PREDLOG).** `gate_passed` kao novi `TraceOutcome` zahteva SQLite table-rebuild migraciju (`execution-traces.ts:150-151`, `schema.ts:242-243` CHECK). Alternativa bez šeme: bridge upisuje `'pending'` + tag `gate_passed` u `tags[]` (`harness-trace-bridge.ts:134`), a `EvalDatasetBuilder.positiveOutcomes` (već konfigurabilno, `eval-dataset.ts:66,208`) isključuje te redove. Izbor se donosi u ADR-02 migracionoj mapi; `schema.ts` je deo OSS substrata (CLAUDE.md §7.5), `execution-traces.ts` je OSS-EXCLUDED — drift baseline treba ažurirati (NEPOZNATO da li baseline pokriva blok `schema.ts:235-253`).

**ADR-01-P3 (PREDLOG).** `run_harness` postaje interni izvršni primitiv ispod server routera (W3), ne alat koji model bira; zadržati ga izložen u `power` režimu za napredne korisnike do W3 završetka, uz `selfReported` oznaku u `normal`.

**ADR-01-P4 (PREDLOG).** Svaki `harness:phase:*` payload dobija `runId` (+ `workspaceId/sessionId`), `createHarnessRun(harness, {runId,…})`, `advancePhase(state, harness, output, runId)`; `HarnessTraceBridge` resolver čita `ev.runId` (resolver mehanizam već postoji: `harness-trace-bridge.ts:54-56,80-86`, testovi `:197-237`). Puni per-run bus sa `seq` = ADR-02/ADR-03.

**ADR-01-P5 (PREDLOG).** Receipt uticaj: promene diraju chat/harness/verify površinu → svaka W0 popravka poništava carry-forward i ulazi u sledeći freeze (S1 A1; brief §15.4). Nijedan receipt ne pokriva `2af0904d` (POTVRĐENO NA REVIZIJI, release-oss.md F-REL-02).

**ADR-01-P6 (PREDLOG).** UX: Work Progress prikazuje `interaction/mode`, fazu, status (`running|done|failed|blocked|skipped`), blokadu i „View work”; bez procenta i ETA (brief §11.1). `getRunSummary` `**Status:** Completed` dobija sufiks kad postoji `skipped` faza.

## §5 — Rizik

| ID | Rizik | Verovatnoća / uticaj | Mitigacija |
|---|---|---|---|
| ADR-01-R1 | Misklasifikacija `conversation`→`work` uvodi latenciju i trošak u običan chat | srednja / visoka (UX regresija; UX score arc 2026-07) | O2 vidljiva/popravljiva odluka pre RUNNING; O7 merenje; `conversation` default za kratke upite |
| ADR-01-R2 | Invertovanje skip default-a lomi postojeće harness testove i ponašanje `research-verify` u produkciji | visoka / srednja | P1 lista; feature-flag `WAGGLE_AUTO_VERIFY=0` eksplicitni opt-out samo u `normal` |
| ADR-01-R3 | `gate_passed` migracija na korisničkim `execution_traces` bazama | srednja / srednja | tag-based varijanta bez šeme (P2) ili migracija sa dry-run i rollback (ADR-02 §6) |
| ADR-01-R4 | Strict mod bez server-observed provider-a blokira svaki run (fail-closed do W1) | visoka ako se strict uključi pre O4 | O8 redosled; strict opt-in dok `observedToolCalls` ne postoji |
| ADR-01-R5 | Benchmark režim iskorišćen da „olabavi” gates radi boljeg skora | niska / kritična (DIR-22/23) | O3 nepromenljivo pravilo; manifest beleži `mode` i gate ishode; AT-28 |
| ADR-01-R6 | Persona/prompt izmene za `mode` menjaju persona receipt površinu | visoka / srednja | batching u freeze (A1) |

## §6 — Migration test (RED pre fix-a, GREEN posle)

| ID | Test | Lokacija (predlog) | Očekivanje | AT |
|---|---|---|---|---|
| ADR-01-T1 | `research-verify` run bez `WAGGLE_AUTO_VERIFY` stiže do verify faze; `completed=false` dok verify ne prođe | `packages/agent/tests/workflow-tools-harness.test.ts` (novi `it`) | RED danas (repro 01a–d POTVRĐENO: `verify='skipped'`, `completed=true`) | AT-01 |
| ADR-01-T2 | Verify sa `VERDICT: FAIL` → `passed:false`; `CONDITIONAL` → ne-PASS ishod po `conditionalPolicy` | `packages/agent/tests/builtin-harnesses.test.ts` (novi) | RED danas (repro 02a–d: FAIL `passed:true`) | AT-01 |
| ADR-01-T3 | `tool_calls:[{tool:'bash', args:{command:'echo hi'}}]` ne prolazi test gate; `Exit code: 1` ne prolazi; `my_bash_like_tool` ne prolazi | isto | RED danas (repro 03a–c) | AT-02 |
| ADR-01-T4 | `assertsUnverifiedCompletion('All tests pass…', ['run_harness'])` → `true` | `packages/agent/tests/verification-gate.test.ts` | RED danas (`false`) | AT-01/02 |
| ADR-01-T5 | Budget stop sa `SUCCESS_ASSERTION` sadržajem dobija disclosure sufiks i `budgetStop:true` | `packages/agent/tests/verification-gate-loop.test.ts` | RED danas (repro 05a: `fired:false`) | AT-03 |
| ADR-01-T6 | `run_harness` sa izmišljenim `tool_calls` u `strict` → gate fail; u `normal` → `selfReported:true` u state-u | `workflow-tools-harness.test.ts` | RED danas (repro 08a: `Completed`) | AT-01/02 |
| ADR-01-T7 | Dva `createHarnessRun` u dva workspace-a → dva `harness:phase:complete` sa različitim `runId`; bridge trace `workspaceId` popunjen | `packages/agent/tests/harness-trace-bridge.test.ts` (novi) | RED danas (repro 07a–b) | AT-06 |
| ADR-01-T8 | `harness:phase:complete` → trace outcome ≠ `'verified'`; `EvalDatasetBuilder` default ne uzima taj red kao pozitivan | `harness-trace-bridge.test.ts:82-92,327` (prepisati) | RED danas | AT-01/AT-29 |
| ADR-01-T9 | Migracija: postojeći redovi `task_shape LIKE 'harness:%' AND outcome='verified'` označeni `unqualified`; dry-run vraća broj; rollback vraća oznaku bez brisanja istorije | `packages/hive-mind-core/tests/mind/execution-traces-migration.test.ts` (novi) | n/a (novi) | AT-27 |
| ADR-01-T10 | Klasifikacija: pozdrav → `conversation`; „napravi research brief iz priloženih izvora” → `work`; korisnik može promeniti pre RUNNING; `mode` upisan u run | `packages/server/tests/local/work-classifier.test.ts` (novi, W3) | n/a (novi) | AT-21 |

**Granica provere (POTVRĐENO NA REVIZIJI):** repro nad `packages/agent/dist` (docs/plans/v1.2-evidence/phaseA/repro-harness.mjs, 25/25) je mehanizamski; realan chat turn sa provider-om i realan `bash` nisu izvršeni; repo suite nije pokretan.

## §7 — Izvori

- **D:** D-06, D-08, D-13, D-18 (brief §3)
- **DIR:** DIR-03, DIR-04, DIR-07, DIR-08, DIR-22, DIR-23 (brief §6.1, §6.2, §7.1–7.3, §13)
- **C/A/R:** C8, C12 (harness deo), C21; A4, A5, A6, A11, A17 (outcome taxonomija); R04, R07
- **AT:** AT-01, AT-02, AT-03, AT-06, AT-21, AT-28
- **Phase A:** `docs/plans/v1.2-evidence/phaseA/harness.md` F-HARN-01..09; `docs/plans/v1.2-evidence/phaseA/harness.refute.md` (7/7 HOLDS; putanje `packages/agent/src/system-tools*.ts`, `tool-executor.ts`; `budgetStopResponse` u `agent-loop.ts:895`); `docs/plans/v1.2-evidence/phaseA/durable.md` F-DUR-08, F-DUR-13; `docs/plans/v1.2-evidence/phaseA/evolution.md` F-EVO-12; `docs/plans/v1.2-evidence/phaseA/repro-harness.mjs`
- **S1:** spot-check L5–L10; A4, A5, A6, A11; W0, W1, W3
- **Kod (na `2af0904d`, potvrđeno `git status` čist):** `packages/agent/src/workflow-harness.ts:132,313,474-482`; `builtin-harnesses.ts:128,181`; `verification-gate.ts:33`; `agent-loop.ts:895-920,1523-1534`; `loop-gates.ts:903-935`; `workflow-tools.ts:84-119,330-358,412-422,447`; `harness-trace-bridge.ts:91,139-148`; `system-tools.ts:681-691`; `system-tools-helpers.ts:732-735`; `task-shape.ts:145`; `workflow-composer.ts:99-104`; `feature-flags.ts:14,26`; `packages/server/src/local/index.ts:612-616`; `packages/hive-mind-core/src/mind/execution-traces.ts:20,150-151`; `schema.ts:242-243`
