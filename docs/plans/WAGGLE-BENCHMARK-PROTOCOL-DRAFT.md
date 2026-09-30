# WAGGLE — Benchmark protokol (nacrt)

**Revizija dokumenta: 1.2 DRAFT · 27.09.2026 · pregledana revizija koda 2af0904df01ca3d374cc78ba95b60dc579dd6a7a**

**Revizija dokumenta: 1.2.1 DRAFT · 30.09.2026 · završno zatvaranje (H-01..H-12)**

Izmene 1.2.1: H-07 — BP-CMP-01 „Pravila”: W−recipe je zasebna `conversation` grana bez gates i bez `ProofReceipt`-a, ne ablation flag nad verify-jem (FRD-05.9 R1/R11); BP-PROD-08: W-full pre W3 režima radi pod G1 strict flag-om (W0-PR8), bez opt-out-a i bez CONDITIONAL završetka; rezultat bez strict semantike je samo B2 razvojni signal, ne B3 dokaz (FRD-05.9 R11, S/B redovi) · H-10 — BP-CMP-01 red W+evolved (ODB-02 ČEKA ODLUKU OSNIVAČA; u B3 samo opcija B), novi pasus o W−recipe i W+evolved, §11 novo pravilo atribucije BP-MSG-01 · H-11 — Q-08: H200 FP8 serverska merenja (LM TEK program) nisu zamena ni B2 profil · H-03 (ponovna provera 30.09.2026) — BP-INV-01 `BP-SEC-04` → `BP-SEL-04` (LOW `finish/traceability/f1/07`); §7 zastareli zbir B2 bez B2-PR3 zamenjen sa 7–13 / 4–7 po Delivery §4.1.1 (LOW `finish/estimates/f1/06`) · H-05 (usklađivanje sa checklistom) — §9.3 novi red „Upisi mimo `WAGGLE_DATA_DIR`” (W0-PR20, BTP). Ništa od ovoga nije pokrenuto, plaćeno ni odobreno.

Predloženo mesto u repou: `docs/plans/WAGGLE-BENCHMARK-PROTOCOL-DRAFT.md` (BRIEF §20.1). Ovaj fajl je planski artefakt; ništa u njemu nije pokrenuto, plaćeno ni odobreno (DIR-01).

Status oznake (BRIEF §2.2): **ODLUKA** · **POTVRĐENO NA REVIZIJI** · **NALAZ AUDITA — ZA PROVERU** · **DELIMIČNO/NEPOVEZANO** · **PREDLOG** (podvrsta **PREDLOG — SMER BRIEFA (DIR-nn / brief §k)**: direktiva ili sekcija autora briefa usvojena kao radna osnova — brief §1: planerski smer, ne korisnikovo odobrenje) · **ODLOŽENO** · **NEPOZNATO**. **ODLUKA** se ovde koristi samo za korisnikove odluke D-01..D-18 (brief §3); founder odluke zabeležene u projektnoj memoriji nose **ISTORIJSKA FOUNDER ODLUKA (memorija, datum) — usklađena sa D-xx / smerom briefa** (PRD v1.2 „Način čitanja”; nije D autoritet); važeći projektni ugovor iz `CLAUDE.md` §1 (BP-SEL-03c) nosi POTVRĐENO NA REVIZIJI, ne ODLUKA. „Modul postoji“ nije dokaz E2E funkcije. Sve `path:line` reference su čitane na `main` = `2af0904df01ca3d374cc78ba95b60dc579dd6a7a` (`git status --porcelain` čist osim dva untracked `.docx` u `docs/`, dakle working tree == HEAD). Reference na granu `origin/feature/harness-sota-bench` (`18e5b36a`, 2026-07-01) su eksplicitno označene i čitane preko `git show`.

Datumska aritmetika: danas je 27.09.2026; „12–17 nedelja od danas“ = 20.12.2026–24.01.2027 (BRIEF §15.2).

---

## 0. Šta ovaj dokument jeste, a šta nije

| ID | Tvrdnja | Status |
|---|---|---|
| BP-00-01 | Benchmark je ključan dokaz, ne dekoracija; teza „frontier-class“ je hipoteza dok rezultat to ne podrži; test se ne projektuje da Waggle mora da pobedi. | ODLUKA (D-18) |
| BP-00-02 | Knowledge work je primarni posao; primarni test mora meriti profesionalni knowledge-work deliverable, ne generičku agent sposobnost ili coding. | ODLUKA (D-06) |
| BP-00-03 | Referentni cilj je Qwen 3.8 27B-klasa; Qwen3.6-35B-A3B je kontrolni baseline, ne tiha zamena cilja. | ODLUKA (D-15); re-baseline po C19 |
| BP-00-04 | Testirani Waggle izvršava zadatak kroz istu production sidecar/runtime putanju kao korisnik; adapter sme da prevede ulaz, pokrene izolovan run i pokupi izlaz. | PREDLOG — SMER BRIEFA (DIR-22) |
| BP-00-05 | Ovaj dokument bira **jednog** primarnog kandidata (APEX-Agents 1.1) uz obrazloženje i uslove. Izbor je PREDLOG; nije odobren. | PREDLOG |
| BP-00-06 | Budžet, N, k, sudija i konačan raspored su **otvorene** stavke decision queue-a (§15); dokument daje formule i ulaze, ne brojeve koje bi se predstavili kao dogovor. | NEPOZNATO — otvoreno: DQ-04 / Q-01..Q-03, Q-05 (founder: Q-01, Q-02 → DQ-04; protokol-lokalno: Q-03, Q-05 — mapa Delivery plan §6); konačan raspored NEPOZNATO do Q-01/Q-02 (§7). Nije ODLOŽENO: stavke nisu svesno van obima, nego otvorene u queue-u BRIEF §20.3 (Napomena kritike 28.09.2026) |
| BP-00-07 | Nijedna istorijska founder ratifikacija sa grane `feature/harness-sota-bench` (δ=±5pp, banking_knowledge, N≈1500, šest grana) ne prenosi se automatski na ovaj protokol; one su vezane za stari τ² dizajn i idu u decision queue za ponovnu potvrdu. | ODLOŽENO (BRIEF §13.6 „Šest grana i proizvoljan ukupni N≈1500 nisu obavezni unapred“) |
| BP-00-08 | Rezultat benchmarka na trenutnom HEAD-u ne bi bio kvalifikovan za tvrdnje o „proverenom radu“: verify faza se preskače po defaultu, gates čitaju model-supplied dokaz. Zato B2 zavisi od W0 popravki (§7). | POTVRĐENO NA REVIZIJI (docs/plans/v1.2-evidence/phaseA/harness.md F-HARN-01/02/03/08; refute HOLDS 7/7) |

---

## 1. Izvori i autoritet za ovaj artefakt

| Izvor | Šta daje | Pravilo |
|---|---|---|
| BRIEF §3 D-06, D-15, D-18; §13 DIR-22, DIR-23; §13.1–13.6; §15.1 red B1–B3; §16 AT-21/AT-28/AT-29; §17 C18, C19; §18 A25, A29; §19 R08, R09; §20.3 „Benchmark budžet“ | autoritet smera i granice | ne otvarati ponovo |
| `docs/plans/v1.2-evidence/phaseA/external.md` §1 (Qwen), §4 (evidence cards), §6 (cene), §7 (otvoreno) | proverene spoljne činjenice od 27.09.2026 | nadjačava S1 gde se razlikuje |
| `docs/plans/v1.2-evidence/phaseA/release-oss.md` F-REL-06 (cene), F-REL-12 (grana, cherry-pick inventar) | stanje repoa | nadjačava S1 |
| `docs/plans/v1.2-evidence/phaseA/harness.md` + `harness.refute.md` F-HARN-01..09 | zašto trenutni harness nije benchmark-ready | HOLDS 7/7 |
| `docs/plans/v1.2-evidence/phaseA/evolution.md` F-EVO-04, F-EVO-06, F-EVO-07 | zašto „evolved“ grana čeka W3e | — |
| `docs/plans/v1.2-evidence/phaseA/hivemind.md` F-HM-15 | LoCoMo regression gate ne postoji u CI | — |
| S1 §2 A25, A29; §3 redovi „Full six-arm N≈1500“, „LongWork“; §7 pitanje 5 | polazni input | tvrdnje audita, revalidirane gore |
| Sopstvene read-only provere repoa (ovaj dokument, §2) | `git ls-files`, `git show`, `git grep` na HEAD i na grani | putanje ispod |

Ako grupa `capability`, `ux-model`, `tiers-kvark` ili `durable` utiče na tvrdnju ovde, to je eksplicitno navedeno; inače se te grupe ne koriste.

---

## 2. Stanje benchmark infrastrukture na reviziji `2af0904d` (POTVRĐENO NA REVIZIJI)

### 2.1 Šta postoji na `main`

| ID | Šta | Putanja | Pozivaoci / status | Ocena za protokol |
|---|---|---|---|---|
| BP-INV-01 | Memory benchmark harness (LoCoMo / LongMemEval / BEAM): runner, judge client, cells, ingest, substrate | `benchmarks/harness/src/{runner,judge-runner,judge-client,cells,cells-ipb,substrate,ingest*,beam-*}.ts` | testovi u `benchmarks/harness/tests/*` (nisu pokretani) | POTVRĐENO postoji; **nije** knowledge-work runner; ostaje regression alat za Hive Mind (BP-SEL-04) |
| BP-INV-02 | Statistika: Wilson CI, cluster bootstrap CI, Fleiss κ | `benchmarks/harness/src/stats/index.ts:19-26` (`computeFleissKappa`, `computeWilsonCI`, `computeClusterBootstrapCI`) | isti harness | POTVRĐENO; ponovo upotrebljivo u §10 |
| BP-INV-03 | Pre-registration emitter (`bench.preregistration.manifest_hash`), SHA-256 manifest YAML, dataset SHA, judge roster sa `pinning_surface` | `benchmarks/harness/src/preregistration.ts:36-43,52-75`; test `benchmarks/harness/tests/preregistration.test.ts:1-16` | harness CLI | POTVRĐENO; osnova za §12 manifest; `CANONICAL_MANIFEST_PATH` pokazuje na `decisions/2026-04-22-bench-spec-locked.manifest.yaml` (referentni string, ne runtime putanja — `:36-40`) |
| BP-INV-04 | Failure taxonomy (codes, rubric, validator, aggregate) | `benchmarks/harness/src/failure-taxonomy/*` | testovi | POTVRĐENO; osnova za razdvajanje model/alat/infra/budžet/evaluator neuspeha (§10.6) |
| BP-INV-05 | Istorijski pre-registration manifesti v5–v8.2 | `benchmarks/preregistration/manifest-v{5,6,7,8,8.1,8.2}*.{md,yaml}` | — | POTVRĐENO; obrazac, ne aktuelni protokol |
| BP-INV-06 | LoCoMo offline recount (nula API poziva; EXPECT 1332/1540) | `benchmarks/results/locomo-sota-2026-06/recount.mjs:1-5,13-20` | ručno (`node recount.mjs`) | POTVRĐENO; obrazac za „offline recount“ zahtev A25/AT-28 |
| BP-INV-07 | GAIA2 ARE narrow-proxy adapter | `benchmarks/gaia2/adapter.ts:1-12` („NOT a full Gaia2 evaluation; it is cost-projection“); `:31-37` importuje `runRetrievalAgentLoop` direktno iz `packages/agent/src/retrieval-agent-loop.js` | skripte u `benchmarks/gaia2/scripts` | POTVRĐENO postoji; **ne ide kroz production sidecar** (DIR-22) — čuvati za cost-projection, ne za claim |
| BP-INV-08 | τ² adapter | `git ls-files \| grep -iE "tau2\|tau-bench\|taubench"` → **0** | — | POTVRĐENO NIJE NA MAIN-u; postoji samo na grani (§14) |
| BP-INV-09 | `turnId` per-turn trace propagacija; komentar ga naziva „correlation key for the four-cell ablation harness JSONL output“ | `packages/agent/src/turn-context.ts:1-20` | `chat.ts` → agent-loop → orchestrator → prompt-assembler | POTVRĐENO postoji; korisno za spajanje production trace-a sa benchmark redom (BP-PROD-06) |
| BP-INV-10 | Production ulazne tačke | `packages/server/src/local/routes/chat.ts:1541` (`POST /api/chat`), `packages/server/src/local/routes/agent-run.ts:237` (`POST /api/agent/run`), `packages/server/src/local/routes/external-tool-runs.ts:173` (`POST /api/tools/run`) | web UI, CLI, launcher | POTVRĐENO; `/api/chat` je korisnička putanja (D-08) → jedina prihvatljiva za DIR-22 (BP-PROD-01) |
| BP-INV-11 | Izolacija podataka po instanci: `WAGGLE_DATA_DIR` | `packages/server/src/local/index.ts:516` (`dataDir: config.dataDir ?? process.env.WAGGLE_DATA_DIR`), `:538` `agent-runs.json`, `:565` `personal.mind`, `:627` behavioral overrides, `:639` vault | boot | POTVRĐENO; osnova za run reset (§9.3) |
| BP-INV-12 | Delimični kill switch-evi recall/prompt putanje: `WAGGLE_RAWDETAIL=0` (jedna recall lane), `WAGGLE_RERANKER=0` (gasi cross-encoder reranker, a time i RAWDETAIL lane), `WAGGLE_PROMPT_ASSEMBLER=0` (vraća sirovi `buildSystemPrompt()` + `recallMemory()` put), `WAGGLE_CHUNK_RETRIEVAL=0` (chunk-vektorska pretraga, write i read strana) | `packages/agent/src/orchestrator.ts:858-866` (`:866` traži `reranker`), `packages/agent/src/orchestrator.ts:562-566`, `packages/agent/src/feature-flags.ts:33-38`, `packages/hive-mind-core/src/mind/search.ts:103-111` | recallMemory / `getReranker()` / agent-loop / HybridSearch | POTVRĐENO; sve pronađene ručice su **delimične** — nijedna nije „memory OFF“ ni „harness OFF“ ablation (takav flag ne postoji) |
| BP-INV-13 | Hardware detekcija (NVIDIA/Apple/basic) | `packages/server/src/local/hardware-detect.ts:1-20` | local-inference rute | POTVRĐENO; ulaz za hardware polje manifesta (BP-MAN-05); AMD/Intel/WMI namerno nisu izgrađeni (`:17-19`) |
| BP-INV-14 | Model registry za benchmark | `benchmarks/harness/config/models.json:2-8` (`qwen3.6-35b-a3b` DashScope 0.20/0.80), `:61-67` (`qwen3.6-35b-a3b-local` cena **0.0/0.0**), `:83-100` (`claude-opus-4-6/4-7` **15/75**) | harness | POTVRĐENO; cene Opus pogrešne (F-REL-06); „lokalno = 0“ krši BRIEF §13.6 (BP-COST-05) |

### 2.2 Šta nije nađeno (provereno po sposobnosti, više grep-ova)

| ID | Tražena sposobnost | Grep (HEAD, `packages/server/src`, `packages/agent/src`, `sidecar`, `app/src-tauri`) | Status |
|---|---|---|---|
| BP-INV-20 | Production ablation flag „memory OFF / skills OFF / harness OFF“ | `ablation\|benchmarkMode\|WAGGLE_BENCHMARK\|disableMemory\|skipRecall\|WAGGLE_DISABLE_(MEMORY\|SKILLS\|HARNESS)\|WAGGLE_NO_MEMORY` → samo komentari (`orchestrator.ts:861`, `turn-context.ts:16`); `memoryEnabled\|recallEnabled\|skipRecall\|disableRecall\|noMemory\|memoryOff\|skillsEnabled\|harnessEnabled` u `routes/chat*.ts`, `chat*.ts`, `orchestrator.ts` → 0 | **NIJE NAĐENO** (memory/harness); skills OFF **NEPOZNATO** (nije grep-ovan po `tool-filter` opcijama) → W3 „production ablation flags“ (S1 W3 net-new) je stvaran posao, ne postojeća funkcija |
| BP-INV-21 | Režim `benchmark` / `strict` na chat ruti | `strict\|WAGGLE_AUTO_VERIFY\|verification` u `routes/chat.ts` → 0 | NIJE NAĐENO; DIR-03 režimi su W1/W3 posao (harness.md F-HARN-09: izbor harnessa je model-invoked tekst, ne server router) |
| BP-INV-22 | LoCoMo same-judge regression gate u CI | `.github/workflows/*` grep `locomo` → 0; ručni offline recount postoji (`benchmarks/results/locomo-sota-2026-06/recount.mjs`, BP-INV-06) | DELIMIČNO/NEPOVEZANO — ručni same-judge proces postoji, CI gate ne (hivemind.md F-HM-15; refuter `hivemind.refute.md` traži baš ovu oznaku umesto „NIJE POTVRĐENO“) |
| BP-INV-23 | Crash-injection receipt nad packaged buildom | release-oss.md F-REL-03 | NIJE NAĐENO (relevantno za R08 interni crash/resume test, ne za javni benchmark) |

### 2.3 Zašto HEAD nije benchmark-ready za claim (POTVRĐENO NA REVIZIJI, docs/plans/v1.2-evidence/phaseA/harness.md; refute HOLDS)

| Nalaz | Dokaz | Posledica za protokol |
|---|---|---|
| F-HARN-01 verify preskočen po defaultu; `WAGGLE_AUTO_VERIFY` nigde nije postavljen u repou | `packages/agent/src/workflow-harness.ts:313,474-482` | „Waggle full“ grana bez W0 popravke meri sistem bez obaveznog verify → ne sme se prodavati kao „verified work“ (DIR-07) |
| F-HARN-02 `VERDICT: FAIL` prolazi regex | `packages/agent/src/builtin-harnesses.ts:128` | isto |
| F-HARN-03 bilo koji bash = test; exit code odbačen | `builtin-harnesses.ts:181`; `packages/agent/src/system-tools.ts:681-691` | ProofReceipt nivo 1 (§10.5) nije poverljiv |
| F-HARN-08 gates čitaju `phase_output.tool_calls` koje piše model | `packages/agent/src/workflow-tools.ts:330-358,412-422` | dokaz „šta je alat uradio“ mora doći iz server ledger-a pre nego što benchmark meri „proof“ |
| F-HARN-06 bridge: završena faza → `verified`, `ok:true/durationMs:0` | `packages/agent/src/harness-trace-bridge.ts:91,139-148` | `execution_traces` sa `harness:%` i `outcome='verified'` **ne ulaze** u eval/holdout skup (§9.2) |
| F-EVO-04/06/07 executor==judge, delta na različitim uzorcima, holdout ne postoji, tajne stižu do sudije | `packages/agent/src/evolution-llm-wiring.ts:214-260`; `iterative-optimizer.ts:205-211,315-325`; `evolution-orchestrator.ts:311-326` | „+evolved“ grana (PRD §12) je **ODLOŽENA** dok W3e ne zatvori ove nalaze (§6.3, R03/R04) |

---

## 3. Evidence cards kandidata (BRIEF §13.1; izvor `docs/plans/v1.2-evidence/phaseA/external.md` §4, provereno 27.09.2026)

Format polja po §13.1: zvanični izvor/verzija · dostupnost taskova i reference/scorera · dozvola upotrebe · artifact/tool okruženje · lokalno izvršenje · način grading-a · objavljeni baseline-i · integracioni napor.

**Važi za sve kartice BP-EC-01..BP-EC-06:** redovi sa živim eksternim podacima (verzije, broj taskova, licence, grading/judge, leaderboard/taubench i blog baseline-i, aktivnost repoa) nose **NALAZ AUDITA — ZA PROVERU (live 27.09.2026, izvor: external.md §4, §8)** — živa eksterna provera, ne svojstvo revizije `2af0904d`, usklađeno sa PRD v1.2 legendom. Isto važi za BP-SEL-01 (§4) i cene/veličine u BP-COST-02/BP-COST-08 (§13; external.md §1.2–1.3, §6). Redovi koji se pozivaju na repo (BP-EC-02 „Integracija”, BP-EC-03 „U repou”; BP-INV-*, BP-PROD-09, `CLAUDE.md`) nose POTVRĐENO NA REVIZIJI. Napomena kritike (28.09.2026): raniji nacrt je ovu napomenu vezivao samo za BP-EC-01. Napomena kritike (drugi prolaz, 28.09.2026): kartice su nosile oznaku „POTVRĐENO” (van taksonomije BRIEF §2.2), a ova napomena ju je samo reinterpretirala — oznake su sada ispravljene u samim karticama; za dva repo reda nalaz je primenjen kao POTVRĐENO NA REVIZIJI, ne kao NALAZ AUDITA, jer se oslanjaju na BP-INV-07/08 i BP-PROD-09 (čitanje revizije i grane preko `git show`), a ne na živ eksterni izvor.

### BP-EC-01 — APEX-Agents 1.1 (Mercor)

| Polje | Vrednost | Status |
|---|---|---|
| Izvor/verzija | HF dataset `mercor/apex-agents-v1.1`; blog 2026-09-08; runner Harbor **0.20.0** (`uv tool install harbor==0.20.0`); infrastruktura Archipelago (`mercor-intelligence/archipelago`, Apache-2.0); referentni agent `Mercor-Intelligence/apex_loop_truncated_tools_agent` | NALAZ AUDITA — ZA PROVERU (live 27.09.2026, izvor: external.md §4, §8) |
| Taskovi/scorer | **240** taskova (80 × investment banking, management consulting, corporate law); rubrike sa binarnim kriterijumima; sve javno | NALAZ AUDITA — ZA PROVERU (live 27.09.2026, izvor: external.md §4, §8) |
| Dozvola | dataset **CC-BY-4.0**; Archipelago Apache-2.0 | NALAZ AUDITA — ZA PROVERU (live 27.09.2026, izvor: external.md §4, §8) |
| Artifact/tool okruženje | realni projektni fajlovi + aplikacije: dokumenti, tabele, PDF, email, chat, kalendar; 3 deljena `linux/amd64` Docker image-a | NALAZ AUDITA — ZA PROVERU (live 27.09.2026, izvor: external.md §4, §8) |
| Lokalno izvršenje | da, uz Docker (Windows: WSL2) **na bench mašini**; nije zahtev za proizvod (certified desktop bez Docker-a, CLAUDE.md §1) | NALAZ AUDITA — ZA PROVERU (live 27.09.2026, izvor: external.md §4, §8) |
| Grading | rubrike; judge **DeepSeek-v4-Flash-0731, t=0.1** (cloud API); 1.1 „no longer rewards noncommittal answers“ | NALAZ AUDITA — ZA PROVERU (live 27.09.2026, izvor: external.md §4, §8) |
| Baseline-i | Claude Fable 5.1 **68.6% pass@1**; GPT-6 Astra **56.3% pass^4** (najviši pass^4); autori ističu jaz pass@k vs pass^k | NALAZ AUDITA — ZA PROVERU (live 27.09.2026, izvor: external.md §4, §8; kako je objavljeno) |
| Integracija | Harbor agent shim → Waggle production sidecar (DIR-22); napor **M–H**; trošak = judge API + model | PREDLOG procene |
| Otvoreno | da li je task-level score binaran (svi kriterijumi) ili frakcija kriterijuma; da li referentni agent prima proizvoljan OpenAI-compatible endpoint (lokalni Qwen) | NEPOZNATO — ZA PROVERU u B1 |

### BP-EC-02 — τ²-bench (Sierra)

| Polje | Vrednost | Status |
|---|---|---|
| Izvor/verzija | `sierra-research/tau2-bench`, MIT, **v1.0.1** (jul 2026); Python ≥3.12 <3.14 | NALAZ AUDITA — ZA PROVERU (live 27.09.2026, izvor: external.md §4, §8) |
| Taskovi/scorer | domeni mock/airline/retail/telecom/banking_knowledge; airline base 50 (30/20), retail 114 (74/40), telecom 20 u `tasks_small.json` (pun skup nije brojan), banking ≈100 | NALAZ AUDITA — ZA PROVERU (live 27.09.2026, izvor: external.md §4, §8; telecom: pun skup nije brojan) |
| Dozvola | MIT | NALAZ AUDITA — ZA PROVERU (live 27.09.2026, izvor: external.md §4, §8) |
| Okruženje | customer-service tool-agent + **LLM user-simulator** (cloud trošak/zavisnost) | NALAZ AUDITA — ZA PROVERU (live 27.09.2026, izvor: external.md §4, §8) |
| Lokalno | da (Python), bez Docker-a | NALAZ AUDITA — ZA PROVERU (live 27.09.2026, izvor: external.md §4, §8) |
| Grading | deterministički: DB hash posle replay-a + `communicate_info`; `NL_ASSERTION` LLM judge eksperimentalan | NALAZ AUDITA — ZA PROVERU (live 27.09.2026, izvor: external.md §4, §8) |
| Baseline-i (taubench.com) | τ² text: Qwen3.5-397B-A17B 87.9, Gemini 3.0 Pro 85.4, Claude Opus 4.5 85.3; τ³-Banking: Qwen 3.8 Max 55.2, Opus 5 48.7 | NALAZ AUDITA — ZA PROVERU (live 27.09.2026, izvor: external.md §4, §8) |
| Integracija | adapter samo na grani (§14); bridge na grani **ne ide kroz production sidecar** | POTVRĐENO NA REVIZIJI (BP-INV-08; grana `18e5b36a` čitana preko `git show`, §6 BP-PROD-09) |
| Fit za D-06 | domen nije knowledge-work deliverable → **kontrola za tool-use**, ne primarni test | PREDLOG |

### BP-EC-03 — GAIA2 / ARE (Meta)

| Polje | Vrednost | Status |
|---|---|---|
| Izvor | kod MIT (`facebookresearch/meta-agents-research-environments`); dataset CC-BY-4.0 (sintetika pod Llama licencama) | NALAZ AUDITA — ZA PROVERU (live 27.09.2026, izvor: external.md §4, §8) |
| Taskovi | 800 validation / 10 univerzuma; 5 sposobnosti × 160; `gaia2-mini` 160; test set privatan | NALAZ AUDITA — ZA PROVERU (live 27.09.2026, izvor: external.md §4, §8) |
| Grading | Llama 3.3 70B judge + exact match | NALAZ AUDITA — ZA PROVERU (live 27.09.2026, izvor: external.md §4, §8) |
| Baseline-i | brojevi nisu izvučeni | NEPOZNATO |
| U repou | narrow-proxy adapter (BP-INV-07); Phase 3 HALT $4.09/invocation (CLAUDE.md §10 C-3) | POTVRĐENO NA REVIZIJI (BP-INV-07; `CLAUDE.md` §10 C-3) |
| Fit | opšti agent, ne professional deliverable; ekonomija loša | PREDLOG: čuvati za cost-projection |

### BP-EC-04 — GDPval (OpenAI)

| Polje | Vrednost | Status |
|---|---|---|
| Izvor | HF `openai/gdpval` (sha `11e7900c`, 2026-02-10); arXiv 2510.04374 | NALAZ AUDITA — ZA PROVERU (live 27.09.2026, izvor: external.md §4, §8) |
| Taskovi | gold subset 220 / 44 zanimanja; rubrike za sve taskove? | NALAZ AUDITA — ZA PROVERU (live 27.09.2026, izvor: external.md §4, §8) |
| Dozvola | HF kartica **bez** license tag-a | NEPOZNATO (uslovi dataset-a) |
| Grading | blind pairwise ljudski + eksperimentalni OpenAI hosted grader (cloud; nedopustiv u KVARK režimu D-03) | NALAZ AUDITA — ZA PROVERU (live 27.09.2026, izvor: external.md §4, §8) |
| Baseline-i | nisu izvučeni | NEPOZNATO |
| Fit | najbolji „economic value“ narativ, ali grading nije reproduktivan lokalno | PREDLOG: opciono kasnije uz ljudske ocenjivače |

### BP-EC-05 — FORTE (AGI-Eval)

| Polje | Vrednost | Status |
|---|---|---|
| Izvor | MIT; kreiran 2026-06-29, poslednji push 2026-06-30, 20★ | NALAZ AUDITA — ZA PROVERU (live 27.09.2026, izvor: external.md §4, §8) |
| Taskovi | deklarisano 180 / 15 profesija; **javno 15 demo taskova** | NALAZ AUDITA — ZA PROVERU (live 27.09.2026, izvor: external.md §4, §8) |
| Grading | LLM-as-judge all-or-nothing; runner vezan za OpenClaw (roadmap-only u Waggle-u) | NALAZ AUDITA — ZA PROVERU (live 27.09.2026, izvor: external.md §4, §8) |
| Fit | 15 javnih taskova nedovoljno; adapter H | PREDLOG: ne |

### BP-EC-06 — OdysseyBench (Microsoft)

| Polje | Vrednost | Status |
|---|---|---|
| Izvor | MIT; 18★; poslednji push 2026-06-11; arXiv 2508.09124 | NALAZ AUDITA — ZA PROVERU (live 27.09.2026, izvor: external.md §4, §8) |
| Taskovi | OdysseyBench+ 300 realnih + Neo 302 sintetičkih; Word/Excel/PDF/Email/Calendar; long-horizon memorija | NALAZ AUDITA — ZA PROVERU (live 27.09.2026, izvor: external.md §4, §8) |
| Grading | LLM judge + rule-based cross-validation (OfficeBench Docker) | NALAZ AUDITA — ZA PROVERU (live 27.09.2026, izvor: external.md §4, §8) |
| Baseline-i | nisu izvučeni | NEPOZNATO |
| Fit | direktno relevantno za Hive Mind tezu (D-12), ali niska aktivnost | PREDLOG: kandidat za kasniju memory-in-work studiju, ne primarni |

Kandidati viđeni, **neevaluirani** (NEPOZNATO): Agents' Last Exam, OmegaUse-OfficeVal, Workspace-Bench 1.0, WorkBench Revisited, FORCE-Bench; TheAgentCompany (`docs/plans/BENCHMARK-LANDSCAPE-RESEARCH-2026-05-22.md`, stanje maj 2026, nije revalidirano 27.09.2026).

---

## 4. Izbor primarnog professional-work testa

### BP-SEL-01 — Primarni test: **APEX-Agents 1.1** (PREDLOG, nije odobreno)

Kriterijumi iz BRIEF §13.1, redom:

1. **Pinovljivost** — dataset (HF sha), Harbor 0.20.0, tri image digesta, judge ID+temperatura; sve ulazi u manifest (§12). NALAZ AUDITA — ZA PROVERU (live 27.09.2026, izvor: external.md §4, §8) da su svi elementi javni.
2. **Javnost taskova i rubrika** — 240/240 pod CC-BY-4.0; FORTE ima 15/180, GDPval bez licence i sa hostovanim grader-om. NALAZ AUDITA — ZA PROVERU (live 27.09.2026, izvor: external.md §4, §8).
3. **Otvoren runner i scorer** — Harbor/Archipelago Apache-2.0; grading reproduktivan uz pinovan judge. NALAZ AUDITA — ZA PROVERU (live 27.09.2026, izvor: external.md §4, §8). (Judge je cloud model: ograničenje §4.2.)
4. **Artefakt okruženje = knowledge work** — dokumenti/tabele/PDF/email/chat/kalendar poklapaju D-06 i referentnu vertikalu BRIEF §4.2 (research brief, document production). NALAZ AUDITA — ZA PROVERU (live 27.09.2026, izvor: external.md §4, §8).
5. **Objavljeni frontier baseline-i na istom protokolu** — 68.6% pass@1 (Claude Fable 5.1) omogućava system-to-system red iz §13.2 uz imenovanu konfiguraciju, bez preuzimanja tuđeg protokola. NALAZ AUDITA — ZA PROVERU (live 27.09.2026, izvor: external.md §4, §8; kako je objavljeno; naša reprodukcija protokola je uslov, §5.3).
6. **Ne zahteva da Waggle pobedi** — sve poruke iz lestvice §11 su dostupne. ODLUKA D-18.

### BP-SEL-02 — Zašto ne ostali kao primarni (PREDLOG)

| Kandidat | Razlog |
|---|---|
| τ²-bench | customer-service tool domen ≠ knowledge-work deliverable; zahteva cloud user-simulator; ostaje sekundarna tool-use kontrola |
| GAIA2 | generički agent; $4.09/invocation HALT (CLAUDE.md §10 C-3); test set privatan |
| GDPval | licenca dataset-a NEPOZNATA; grading kod ljudi/OpenAI |
| FORTE | 15 javnih taskova; OpenClaw runner |
| OdysseyBench | održavanje; memory-heavy — bolje kao kasnija D-12 studija |

### BP-SEL-03 — Uslovi i rizici primarnog izbora (moraju u manifest i decision queue)

| ID | Uslov/rizik | Status |
|---|---|---|
| BP-SEL-03a | Judge je cloud model (DeepSeek-v4-Flash-0731). Trošak i zavisnost. Zamena lokalnim sudijom kvari uporedivost sa leaderboard-om → prijavljuje se kao **odvojen profil**, nikad pomešano. | PREDLOG; judge profil: NEPOZNATO — otvoreno: Q-05 (protokol-lokalno, §15) |
| BP-SEL-03b | U KVARK režimu (D-03) cloud judge nije dozvoljen; ovaj protokol je za individualni Waggle (BYOK D-05) na bench mašini, ne za KVARK evaluaciju. | ODLUKA (D-03/D-05) |
| BP-SEL-03c | Docker/WSL2 samo na bench mašini; certified Windows desktop ostaje bez Docker-a. | POTVRĐENO NA REVIZIJI (važeći release contract `CLAUDE.md` §1; nije D-nn) |
| BP-SEL-03d | Waggle mora ići kroz production sidecar (§6). Adapter koji poziva `runRetrievalAgentLoop` ili LiteLLM direktno (kao BP-INV-07 i bridge na grani) ne kvalifikuje. | PREDLOG — SMER BRIEFA (DIR-22) |
| BP-SEL-03e | Contamination firewall: rubrike i `solution`/reference fajlovi ne ulaze u `.mind`, cache ni prompt (§9). | PREDLOG — SMER BRIEFA (brief §13.4) |
| BP-SEL-03f | Task-level scoring semantika (binaran vs frakcija) određuje statistički dizajn (§10). | NEPOZNATO — B1 zatvara |
| BP-SEL-03g | Da li referentni agent i Harbor mogu koristiti lokalni OpenAI-compatible endpoint (Ollama/vLLM) za baseline B0 sa Qwen-om. | NEPOZNATO — B1 zatvara na nivou čitanja koda referentnog agenta; potvrda run-om u B2-PR0 (§7) |

### BP-SEL-04 — Sekundarni testovi (PREDLOG)

| Test | Uloga | Uslov |
|---|---|---|
| τ²-bench (retail/airline) | tool-use kontrola; efficiency/pass^k | adapter cherry-pick + **rewire bridge-a na production sidecar** (§14) |
| GAIA2 narrow-proxy | cost-projection samo | bez claim-a |
| LoCoMo same-judge (`recount.mjs`) | **regression gate za Hive Mind**, ne naslov | ručni gate pre merge-a promena recall rendera (F-HM-15) |
| Interni crash/resume/change-input acceptance (AT-07, AT-22) | proizvodni dokaz, ne javni benchmark | R08: LongWork javni dataset ODLOŽEN, interni testovi obavezni |

---

## 5. Hipoteze i dva odvojena poređenja (BRIEF §13.2)

### BP-HYP — Hipoteze (PREDLOG formulacije; zamrzavaju se u B3)

| ID | Hipoteza | Tip | Poređenje |
|---|---|---|---|
| H-A1 | Isti lokalni model M kroz Waggle production putanju (W-full) postiže viši primarni score nego M kroz minimalan dovoljan tool adapter (B0). | superiornost, jednostrana | system lift |
| H-A2 | Uklanjanje sloja X (memorija / skills / recipe-harness) iz W-full smanjuje primarni score ili povećava trošak/latenciju („odakle dolazi lift“). | ablation, dvostrana, sekundarna | system lift |
| H-B1 | W-full(M) prema potpuno imenovanoj frontier konfiguraciji F na istom benchmarku/protokolu: **deskriptivno**, sa intervalom razlike; neinferiornost samo uz unapred zadatu marginu δ. | deskriptivno / neinferiornost | system-to-system |
| H-C (opciono) | pass^k reliability W-full ≥ B0 pri k ponavljanja. | reliability | system lift |

Nije hipoteza: „Qwen je postao bolji osnovni model“ (BRIEF §13.2, druga kolona). Nije hipoteza: „pobedio frontier“ (§11).

### BP-CMP-01 — Poređenje 1: šta Waggle dodaje istom modelu (system lift)

| Grana | Definicija | Šta je isto | Status |
|---|---|---|---|
| **B0 „raw + minimal sufficient tool adapter“** | isti model M (isti ID, revizija, quant, runtime, reasoning/`thinking` podešavanje, context limit) kroz **zvanični referentni agent** benchmarka (`apex_loop_truncated_tools_agent`) u istom Harbor okruženju, sa svim alatima koje okruženje daje (čitanje/pisanje fajlova, tabele, mail/chat/kalendar aplikacije). Baseline-u se **ne oduzima** pristup fajlovima. | model, podaci, alati okruženja, timeout, broj pokušaja, judge | PREDLOG (definicija po §13.2 „minimalan dovoljan tool adapter“) |
| **B0-chat „vanilla chat bez alata“** | M sa promptom + sadržajem fajlova ubačenim kao tekst, bez alata. | — | PREDLOG; **sme se prikazati samo pod tim imenom**, ne kao kontrolisan efekat harnessa (§13.2) |
| **W-full** | M kroz `POST /api/chat` production sidecar-a (BP-INV-10) u izolovanom Workspace-u sa task fajlovima; Waggle alati, skills, recall, recipe (work režim, strict/benchmark gates); artefakti se vraćaju u Harbor output direktorijum za grading. | isti M, isti podaci, isti judge | PREDLOG; zavisi od W0/W1/W3 (§7) |
| **W−mem** | W-full bez Hive Mind recall-a (production ablation flag, BP-INV-20 → W3 posao). Napomena: taskovi su nezavisni i memorija je po protokolu čista, pa se ovde meri efekat *intra-task* memorije (radni kontekst, RAWDETAIL) — ne „znanje iz prošlosti“. | — | PREDLOG; flag ne postoji (NIJE NAĐENO) |
| **W−skills** | W-full bez marketplace/starter skills (samo native alati). | — | PREDLOG; flag NEPOZNATO |
| **W−recipe** | W-full sa conversation putanjom umesto work recipe-a (bez faza/gates), ali sa istim alatima. | — | PREDLOG; režimi ne postoje (BP-INV-21) |
| **W+evolved** | W-full sa promovisanom varijantom iz ograničenog registry-ja (DIR-14), evoluiranom **isključivo na dev skupu**. | — | ODLOŽENO do W3e (F-EVO-04/06/07); zavisi od W3e-PR9 i odobrenja obima ODB-02 (Delivery plan §6.1; ČEKA ODLUKU OSNIVAČA); u B3 samo u opciji B „W3e-PR9 u G2” (Delivery plan §4.3, §6.1 „ODB-02 — opcije”); bez ove grane nema tvrdnje o doprinosu recipe sloja (BP-MSG-01) |

Pravila: benchmark režim ne otključava šire podatke/alate/odobrenja (BRIEF §6.1); puna Waggle konfiguracija **ne preskače** obavezni verify (DIR-03); ablation flag **ne sme** isključiti strict verifikaciju (A25) ni u jednoj grani koja koristi Waggle recipe. W−recipe nije ablation flag nad verify-jem, nego zasebna grana na `conversation` putanji, bez gates i bez Waggle `ProofReceipt`-a (FRD-05.9 R1); zato se njen rezultat nikad ne prikazuje kao proveren rad. Waggle status i `GateOutcome` zapisi W-grana ulaze u manifest po FRD-05.9 R11. Baseline B0 se ocenjuje istim nezavisnim scorerom, bez Waggle verification pipeline-a (§13.3).

Minimum za prvi finalni run (§13.3 „ne zahtevati svaku kombinaciju“): **B0, W-full i jedna ablation koja objašnjava lift** (predlog: W−recipe, jer je recipe/proof najveći novi sloj W1/W3; alternativa W−mem). Izbor ablation grane: NEPOZNATO — otvoreno: Q-04 (protokol-lokalno, §15).

Grana W−recipe meri ručnu recipe/proof putanju iz W3 (faze, gates, `ProofReceipt`), ne ograničenu recipe evoluciju (DIR-14, W3e-PR9). Doprinos evolucije varijanti meri samo razlika W+evolved − W-full (BP-MSG-01). U opcijama A i C iz Delivery plana §6.1 („ODB-02 — opcije”) B3 nema W+evolved granu.

### BP-CMP-02 — Poređenje 2: kako stoji prema konkurentskom sistemu (system-to-system)

| Varijanta | Definicija | Granica zaključka | Status |
|---|---|---|---|
| S2S-ref | referenca na **tuđe objavljeno merenje** (APEX blog: Claude Fable 5.1 68.6% pass@1, Harbor 0.20.0, judge DeepSeek-v4-Flash-0731) uz eksplicitnu proveru poklapanja: dataset verzija, Harbor verzija, judge+temperatura, pass@1 definicija, broj pokušaja, reasoning budžet, tools | „W-full(M) je postigao X% na APEX-Agents 1.1 pod istim runnerom/sudijom; objavljena referenca za F je Y%“ — bez tvrdnje o pobedi ako protokol nije identično reprodukovan | PREDLOG |
| S2S-own | sopstveni run frontier modela F kroz **isti referentni agent** (B0 sa F) i, opciono, F kroz W-full | „W-full(M) vs B0(F) pod uslovima Z“ — API model u neutralnom runneru **nije** Claude/ChatGPT gotov proizvod (§13.2) | PREDLOG; budžet: NEPOZNATO — otvoreno: DQ-04 / Q-01 |

Zabranjene formulacije: „pobedio frontier“ iz jedne poddomene (npr. samo corporate law) ili iz različitih protokola (§13.5).

---

## 6. Zahtev production sidecar putanje (DIR-22) i adapter ugovor

### BP-PROD — Obavezni zahtevi

| ID | Zahtev | Dokaz/veza | Status |
|---|---|---|---|
| BP-PROD-01 | Adapter komunicira sa Waggle-om **isključivo** preko `POST /api/chat` (`chat.ts:1541`) sa `workspaceId`/`sessionId` (`chat.ts:75-77,614-654`) i, po potrebi, postojećih workspace/session ruta za pripremu fajlova. Nema direktnog importa `@waggle/agent` loop-a u adapteru. | BP-INV-10 | PREDLOG ugovora (sprovodi SMER BRIEFA DIR-22) |
| BP-PROD-02 | Sidecar koji se testira je izgrađen iz **zamrznute revizije** (SHA u manifestu) istim build lancem kao proizvod (`npm run build:packages` + sidecar bundle). Da li se koristi packaged Windows installer sidecar (ne može u Linux Docker) ili isti SHA pokrenut na bench hostu — **NEPOZNATO — otvoreno: Q-06** (protokol-lokalno); u oba slučaja manifest navodi build komandu i hash. | CLAUDE.md §2 build komande | PREDLOG; Q-06 |
| BP-PROD-03 | Adapter sme: prevesti task u prompt + fajlove, kreirati izolovan Workspace, pokrenuti run, sačekati završetak, pokupiti artefakte i trace. Adapter **ne sme**: menjati system prompt, dodavati alate/verifikaciju koje javna aplikacija nema, retry-ovati mimo production politike. | DIR-22 | PREDLOG — SMER BRIEFA (DIR-22) |
| BP-PROD-04 | Jedan sidecar proces + jedan `WAGGLE_DATA_DIR` (BP-INV-11) po tasku (ili po tasku resetovan i hash-verifikovan; §9.3). | §13.4 run reset | PREDLOG |
| BP-PROD-05 | Model endpoint je isti kao za korisnika: managed Ollama runtime ili validiran OpenAI-compatible endpoint (BRIEF §11.3). Za Qwen 3.8 27B: managed runtime pin `OLLAMA_TARGET_VERSION='0.32.3'` (`packages/server/src/local/managed-ollama-runtime.ts:28-29`) **prethodi** prvoj Ollama verziji sa `qwen3.8:27b` (v0.32.12) → repin + pull/generate/tool test je preduslov (external.md §1.3). | external.md #2 | NALAZ AUDITA — ZA PROVERU |
| BP-PROD-06 | Svaki benchmark red nosi `turnId`/run identitet iz production trace-a (BP-INV-09) radi offline audita. | turn-context.ts | PREDLOG |
| BP-PROD-07 | Egress u W-full granama: samo lokalni model endpoint (ili BYOK provider kad je M cloud model u S2S-own) i ništa drugo; benchmark host meri egress (BRIEF §16 „merenje neodobrenog egress-a“). Judge poziv izvodi Harbor, ne Waggle. **Setup egress** (van taska): preuzimanje embedding/reranker težina sa HF i pull modela kroz managed Ollama dešavaju se samo pri pripremi pre-seed kopije `<dataDir>/models` (§9.3), beleže se odvojeno u `egress_log` (BP-MAN-15); isti poziv tokom taska = prekršaj ovog zahteva. | AT-28; §9.3 | PREDLOG |
| BP-PROD-08 | Benchmark režim = production semantika `work`+`strict`/`benchmark` (DIR-03), bez skrivenih promena ovlašćenja. Dok režimi ne postoje (BP-INV-21), W-full je definisan kao „production chat turn posle W0 popravki, pod G1 strict flag-om (W0-PR8)“ i tako se imenuje: verify se izvršava bez opt-out-a (`WAGGLE_AUTO_VERIFY` i run opt-out se ne primenjuju, FRD-05.9 R5/S5), self-reported dokaz daje `FAIL` (R3/S4), a nijedna `conditionalPolicy` ne daje `completed=true` (S3; W0-PR2). Ishod ne sme biti blaži od redova S1–S8/B1–B8 (R11). Rezultat W-full dobijen bez te semantike (npr. podrazumevana `work · normal` politika sa CONDITIONAL završetkom ili „Completed (verify skipped)”) nije B3/benchmark dokaz; sme se koristiti samo kao razvojni B2 A/B signal i tako se označava u manifestu (BP-MAN-08 `mode`). | §6.1 | PREDLOG |

### BP-PROD-09 — Šta danas krši DIR-22 (POTVRĐENO NA REVIZIJI)

| Artefakt | Dokaz | Zaključak |
|---|---|---|
| `benchmarks/gaia2/adapter.ts` (main) | `:31-37` importuje `runRetrievalAgentLoop` iz `packages/agent/src/retrieval-agent-loop.js`; zaglavlje `:1-12` „NOT a full Gaia2 evaluation“ | in-process loop, ne sidecar → samo cost-projection |
| `benchmarks/tau2/bridge/waggle-bridge-server.ts` (grana) | `:15-21`: „It does NOT run @waggle/agent's runAgentLoop … ‘Waggle under test’ narrows to system-prompt assembly (the AGENT_INSTRUCTION wrap + frozen recalled memory)“; `:33` `HybridSearch, MindDB` iz `@waggle/core` direktno; `llm-client.ts:2,79` „Direct litellm /chat/completions client“ | bridge meri prompt-assembly + recall, ne proizvod; sam PILOT-RESULT (§„Harness fidelity ceiling“) to priznaje |
| `benchmarks/gaia2/waggle-container/stub-core/` (main) | `stub-core/index.js:1-7`: „Path-A stub for @waggle/core — the ONLY 2 symbols runAgentLoop's runtime chain needs“; re-eksportuje samo `createCoreLogger` i `scanForInjection` iz `@waggle/hive-mind-core/dist/*` da bi `runAgentLoop` startovao **bez better-sqlite3/sqlite-vec**; `stub-core/package.json` se predstavlja kao `@waggle/core` verzije `0.0.0-gaia2-stub` | POTVRĐENO NA REVIZIJI: agent loop bez memorijskog substrata i bez sidecar-a — tačno ono što A25 zabranjuje („not stub-core“); nikad kao „Waggle under test“ |

### BP-PROD-10 — Topologija bench mašine (PREDLOG, dve opcije za Q-06)

| Opcija | Opis | Prednost | Rizik |
|---|---|---|---|
| T1 host-sidecar | Harbor kontejner (task fajlovi + aplikacije) na WSL2/Linux; Waggle sidecar na hostu (Windows ili WSL2) na zamrznutom SHA; model server (Ollama/vLLM) na host GPU; agent shim u kontejneru zove sidecar preko mreže; task fajlovi deljeni volumenom | bliže Windows proizvodu; GPU direktno | dva fajl sistema (mount semantics), mrežna izolacija |
| T2 sidecar-in-container | sidecar u zasebnom kontejneru (Node 22 + native `better-sqlite3`/`onnxruntime`), model server na hostu | čist reset po tasku (novi kontejner) | Linux build sidecar-a nije packaged Windows sidecar; manifest to mora reći |

---

## 7. Faze B1 / B2 / B3 (BRIEF §15.1 red B1–B3) i zavisnosti

| Faza | Cilj | Ulazi | Izlaz / exit kriterijum | Vezano za | Status |
|---|---|---|---|---|---|
| **B1 — izbor i protokol** (= Delivery plan `B1-PR1`) | **dokumentacioni posao, bez instalacije i bez plaćenih poziva:** zatvoriti evidence card otvorene stavke koje se zatvaraju čitanjem koda/dokumentacije (BP-SEL-03f; BP-SEL-03g na nivou čitanja referentnog agenta), finalizovati ovaj protokol; **definisati** split (§9.1: stratifikacija, seed, hash pravilo), firewall pravila i assertion listu (§9.2) i manifest šemu (§12). **Nije u B1:** instalacija Harbor 0.20.0 + image-a i ruler reprodukcija (→ `B2-PR0`), adapter shim (→ `B2-PR1`, Delivery plan §2), cherry-pick sa grane (→ `W3-PR8`, §14) | ovaj dokument; external.md | `B1-EXIT-1` evidence card bez stavki „ZA PROVERU“ koje se mogu zatvoriti čitanjem (ostatak eksplicitno prebačen u B2-PR0); `B1-EXIT-2` split **pravilo** (stratifikacija, seed, hash) definisano — generisanje i hash-ovi u B2-PR0, sealed nikad otvoren; `B1-EXIT-3` firewall pravila + assertion lista definisane (implementacija = W3-PR8 ADAPT + B2-PR1); `B1-EXIT-4` manifest šema (§12) popunjena kao prazan obrazac za dry-run; `B1-EXIT-5` gruba procena troška po tasku iz **javnih cena** (BP-COST-01/02) → ulaz za Q-01 cap za B2-PR0 (merenje tek u B2-PR0) | **rano G2** (Delivery plan §2 „B1 (rano, G2)“, §4.1 red B1 2–3 / 1–2 dana, §4.2 G2 „B1 1–2“); ne dira runtime i ne troši budžet; tekst se sme pisati paralelno sa W0, ali se knjiži u G2 | PREDLOG |
| **B2 — razvojni A/B** | **`B2-PR0` (ulazni korak, van kritične putanje; Delivery plan §4.1.1 ga rastavlja na `B2-PR0a` setup / `B2-PR0b` ruler + analiza odstupanja / `B2-PR0c` split):** instalacija Harbor 0.20.0 + tri image-a na bench mašini, reprodukcija **ruler-a** — referentni agent sa javno objavljenim modelom na malom uzorku i poređenje sa objavljenim brojem u toleranciji; generisanje split-a + hash-ovi; **jedini deo B pre W3 koji troši judge API** → Q-01/DQ-04 cap pre starta. **`B2-PR3` (ulazni korak A/B, R16):** konfiguracija/tuning ciljnog modela (sampling, thinking, tool parser, ctx/KV) pre A/B; zavisi od W6-PR6 (Ollama repin, DQ-05); tuning i kalibracija **samo na dev split-u** (BP-DATA §9.1, BP-FW; validation/sealed se ne gledaju), a dobijena konfiguracija se zamrzava i hash-uje u manifest (BP-MAN-03) pre A/B. **Zatim** prvi kontrolisani A/B čim vertikala radi (G2 uslov, BRIEF §5.1): B0 vs W-full na **dev** skupu, N_dev mali; svrha = greške, task variance, procena troška, kalibracija timeout-a, provera ProofReceipt nivoa; **ne javni „beats“ naslov** (§13.3) | B2-PR0: samo Q-01/DQ-04 odobrenje i bench mašina (Docker/WSL2); B2 A/B: W0 popravke (F-HARN-01/02/03/04/08), minimalni W1 run, W3 recipe + production adapter (`B2-PR1` shim), W6 target readiness (AT-20), **W6-PR6** (Ollama repin za cilj; DQ-05) i **`B2-PR3`** tuning ciljnog modela (R16) — isti skup kao Delivery plan §3 („B2 A/B (zavisi W3-PR7 + W6-PR6 + W2-PR1 + B2-PR3)“) | `B2-EXIT-0` ruler reprodukovan ili odstupanje objašnjeno; izmeren judge+model trošak po tasku → ulaz za Q-01 cap za B2 A/B i B3; split generisan, hash-ovi u manifestu; `B2-EXIT-1` ≥1 kompletan paired dev run bez infra greške klase >X% (X iz B2-PR0); `B2-EXIT-2` izmerena discordance rate i varijansa → power račun (§10.7); `B2-EXIT-3` failure taxonomy popunjena; `B2-EXIT-4` firewall assertions 0 prekršaja; `B2-EXIT-5` validation skup upotrebljen za odabir konfiguracije najviše **jednom**, sa view log-om | G2 (Delivery plan §4.1 red B1–B3 i §4.1.1: B2 **12–21 / 7–12** dana (klasično / AI) = B2-PR0a/b/c 1.5–3 / 1.5–2 + B2-PR1 (samo shim; manifest/reset = W3-PR7) 2.5–4 / 1–1.5 + B2-PR2a (rework popravke posle dev run-a; R4) 1–3 / 0.5–1.5 + B2-PR2 2–3 / 1–2 + B2-PR3 5–8 / 3–5; §4.2 G2 „B2 7–12“ uklj. B2-PR0, B2-PR2a i B2-PR3; B2 re-run (0–2 rd) i validation run su wall-clock placeholderi u G2 lancu (Delivery plan §3/§4.3); §4.2 G2 „Spoljne blokade“: DQ-04 uklj. judge API kvotu za ruler) | PREDLOG |
| **B3 — zaključana studija** | zamrznuti hipotezu, metriku, N, budžet, kriterijume prekida i analizu (pre-registration hash, `preregistration.ts`), zatim jedan run na **sealed** skupu; publikacija metodologije i rezultata bez obzira na ishod (§5.1 „Negativan rezultat nije razlog da se preskoči objavljivanje“) | freeze kandidat SHA (isti kao release kandidat ili eksplicitno imenovan), W3e ako ulazi „+evolved“ | `B3-EXIT-1` prereg hash emitovan pre prvog sealed poziva; `B3-EXIT-2` kompletan output + grader output + recount skripta sačuvani i offline provereni (AT-28); `B3-EXIT-3` claim wording izabran iz lestvice §11 prema rezultatu; `B3-EXIT-4` manifest kompletan (§12) | G3 (performance-led poruka) | PREDLOG |

Zavisnosti (POTVRĐENO iz phaseA): B2 A/B ne može da meri „proveren rad“ pre F-HARN-01/02/03/08 (harness.refute.md „Redosled zavisnosti“); W+evolved ne pre F-EVO-04/06/07; W−mem/W−skills/W−recipe ne pre W3 ablation flagova (BP-INV-20); B2 A/B ne pre `B2-PR3` tuning-a ciljnog modela, a `B2-PR3` ne pre W6-PR6 (Delivery plan §3). B1 nema zavisnost od runtime-a, ne troši budžet i može odmah; B2-PR0 (Harbor + ruler) ne zavisi od W-talasa, zavisi samo od Q-01/DQ-04 odobrenja (judge API) i bench mašine, pa ne produžava kritičnu putanju W1 → W3 → B2 A/B → F2; `B2-PR3` po Delivery plan §4.3 takođe teče paralelno, van te putanje.

Usklađenost sa Delivery planom v1.2 (ispravka kritike, 27.09.2026): raniji nacrt je B1 smeštao u G1 i davao mu obim koji Delivery plan (§2 B1-PR1 „evidence card + protokol“, §4.1 „B1 2–3 / 1–2“, §4.2 G2 „B1 1–2“) ne pokriva (Harbor setup, ruler run sa judge troškom, shim, cherry-pick). Sada oba dokumenta drže isti raspored: B1 = dokumentacija, rano G2, bez budžeta; Harbor + ruler = `B2-PR0` u G2 sa judge API kvotom pod DQ-04; shim = `B2-PR1`; cherry-pick = `W3-PR8`. Delivery plan §4.1/§4.1.1 (kritički prolaz 28.09.2026) daje B2 **12–21 / 7–12** (uklj. rastavljen B2-PR0a/b/c 1.5–3 / 1.5–2, B2-PR1 kao samo shim 2.5–4 / 1–1.5, B2-PR2a rework popravke 1–3 / 0.5–1.5 — R4: popravke posle dev run-a su inženjerski PR, a re-run ostaje compute — i B2-PR3 tuning ciljnog modela 5–8 / 3–5, R16), a §4.2 G2 „B2 7–12“. Napomena kritike (28.09.2026): raniji „B2 7–10 / 4–6“ bio je zastareo; bez B2-PR3 zbir po Delivery planu §4.1.1 (PR1 kao shim, uz B2-PR2a) je 7–13 / 4–7 (ispravka 1.2.1: raniji međuzbirovi „7.5–12 / 4.5–7” i „6–10 / 3.5–5.5” nisu uključivali B2-PR2a). PREDLOG (raspored), ne odobrenje.

Kalendar: protokol ne daje datum završetka B3 — **NEPOZNATO** do Q-01/Q-02. Kalendarski raspored nosi Delivery plan §4.3: B3 izvršenje je PREDLOG placeholder 10–20 rd wall-clock (`docs/plans/v1.2-evidence/inputs/S1-audit-2026-09-27.md:238`), a G3 ekspertski raspon (ne P50) je 16–27 nedelja od 27.09.2026 (varijanta a, B3 ‖ W7/W8: 17.01.2027–04.04.2027; sa W3e-PR9 samo uz uslov (a'), a sa T_evo pre B3 na istoj mašini 16–28) ili 18–30 nedelja (varijanta b, B3 serijski: 31.01.2027–25.04.2027; sa W3e-PR9 isto, a sa T_evo placeholder-om 1–8 rd 18–32 nedelje, do 09.05.2027), bez spoljnih kapija i bez pauza, uz neizmeren AI throughput (raspon je iz AI kolone; klasična osetljivost G3 23–45 nedelja; prvo merenje je F1 retrospektiva — Delivery plan §4.3, R4) (Delivery plan §4.3, kritički prolaz 28.09.2026; G2 lanac sada nosi i B2 rework/re-run i validation run iz §9.1). S1 raspon 12–17 nedelja = 20.12.2026–24.01.2027 (BRIEF §15.2) služi samo za poređenje. Izmereno odstupanje trajanja B3 od placeholder-a (§10.7; Q-01/Q-02) pomera G3 1:1 u varijanti (b); u (a) samo dok B3 lanac premašuje effort-bound (Delivery plan §4.3: effort-bound G3 bez W3e-PR9 18.3–31.2 rd, pa kraće izmereno B3 ne skraćuje G3 1:1). Napomena kritike (28.09.2026): raniji tekst je 1:1 davao bez uslova.

---

## 8. Recipe putanje koje se testiraju (veza sa W3, BRIEF §4.2)

| ID | Recipe | Zašto u benchmark | Status |
|---|---|---|---|
| BP-REC-01 | research brief | referentna vertikala; APEX consulting/banking taskovi imaju research+analiza karakter | PREDLOG (W3) |
| BP-REC-02 | document production (DOCX/XLSX/PDF artefakt) | APEX deliverable-i su fajlovi; ProofReceipt nivo 1 (parsiranje, sekcije) i nivo 2 (brojevi/datumi/citati) su primenljivi (BRIEF §7.2; AT-21) | PREDLOG (W3) |
| BP-REC-03 | mapiranje APEX task → recipe: router bira po `task-shape` (`packages/agent/src/task-shape.ts:145` postoji; izbor recipe-a je W3 posao, F-HARN-09) | pogrešna klasifikacija je legitimni izvor neuspeha i mora se brojati (ne ručno preusmeravati) | PREDLOG |

Recipe se ne sme menjati posle B3 freeze-a; promena recipe-a posle gledanja sealed rezultata = nova studija.

---

## 9. Podaci, kontaminacija, run reset (BRIEF §13.4)

### 9.1 BP-DATA — Podela skupa (PREDLOG; brojevi: NEPOZNATO — otvoreno: DQ-04 / Q-02)

| Skup | Namena | Pravilo pristupa | Predlog veličine (ulaz za Q-02, ne odluka) |
|---|---|---|---|
| **dev** | greške, prompt/recipe iteracija, evolucija varijanti (DIR-14), procena troška | slobodan; svaki run zabeležen | stratifikovano po 3 domena; red veličine 40–60 od 240 |
| **validation** | izbor konfiguracije/promocija pre B3 | ograničen broj pogleda (predlog: ≤2), svaki pogled u view log sa SHA konfiguracije | red veličine 40–60 |
| **sealed** | jedini izvor javne tvrdnje | 0 pogleda pre prereg hash-a; jedan run po zamrznutoj konfiguraciji; svaki dodatni run = nova prereg | ostatak (red veličine 120–160) |

Stratifikacija: po domenu (3) i, ako APEX daje težinu/tip, po njemu; deterministički seed; split fajl sa SHA-256 ulazi u manifest. Alat: `split-builder.ts` sa grane (§14) je kandidat za ADAPT (deterministički stratifikovani split). „Najmanje 30“ iz A17 nije dokaz dovoljne snage (BRIEF §10.5); N se izvodi iz B2 discordance/varijanse (§10.7).

Napomena o holdout-u iz `execution_traces`: postojeći `verified` harness redovi (F-HARN-06) i `positiveOutcomes ?? ['success','verified']` (`packages/agent/src/eval-dataset.ts:208`) **ne smeju** biti izvor benchmark primera niti evolution promotion holdout-a dok kvalifikacija tragova (BRIEF §7.3) ne postoji. POTVRĐENO NA REVIZIJI.

### 9.2 BP-FW — Contamination firewall

| ID | Pravilo | Mehanizam | Status |
|---|---|---|---|
| BP-FW-01 | Rubrike, `solution`/reference fajlovi i grader promptovi nikad ne ulaze u Waggle Workspace, `.mind`, cache, skills ni prompt. Adapter montira **samo** task input fajlove. | mount allowlist u shim-u; assertion pre run-a | PREDLOG |
| BP-FW-02 | Svaki task dobija čist scope (novi Workspace + reset data dir), osim ako benchmark izričito traži kontinuitet (APEX ne traži). | §9.3 | PREDLOG |
| BP-FW-03 | Posle svakog taska: substring gate (normalizovani gold/rubric tekst vs sve što je Waggle upisao u mind/artefakte) + embedding gate sa pre-registrovanim pragom; hash mind-a pre/posle; 1 red po assertion-u u `events.jsonl`. | `firewall/{normalize,substring-gate,embedding-gate,hash-mind,emit}.ts` sa grane (§14) — ADAPT | PREDLOG |
| BP-FW-04 | Evolucija (W+evolved) radi samo na dev skupu; promovisana verzija se zamrzava pre validation/sealed; hash registry verzije u manifestu. | DIR-14/15; F-EVO-07 nalaz (nema holdout-a) mora biti zatvoren | ODLOŽENO do W3e |
| BP-FW-05 | Learning tragovi nastali tokom evaluacije služe dijagnostici i **ne** koriste se za sledeći task (protokol ne dopušta). | reset po tasku | PREDLOG |
| BP-FW-06 | Memory benchmark (LoCoMo/BEAM) dobija istu dozvoljenu istoriju po protokolu, ne dodatno znanje samo za Waggle. | postojeći harness | PREDLOG — SMER BRIEFA (brief §13.4) |

### 9.3 BP-RESET — Run reset manifest (šta se resetuje po tasku i kako se dokazuje)

| Stavka | Putanja/mehanizam na `2af0904d` | Reset | Dokaz |
|---|---|---|---|
| Personal mind | `<WAGGLE_DATA_DIR>/personal.mind` (`index.ts:565`) | novi data dir | SHA-256 direktorijuma pre starta = „clean baseline hash“ u manifestu |
| Workspace minds | `<WAGGLE_DATA_DIR>/workspaces/<id>/workspace.mind` (hivemind.md F-HM-12: `workspace-manager.ts:139-140`) | novi data dir | isto |
| Run registry | `agent-runs.json` (`index.ts:538`) | novi data dir | isto |
| Persona/spec override-i | `personas/<id>.json`, `behavioral-overrides/` (`index.ts:627`; evolution.md §0) | novi data dir; za W+evolved: **kontrolisano** kopirana zamrznuta verzija sa hash-om | hash override fajlova u manifestu |
| Vault | `VaultStore(dataDir)` (`index.ts:639`) | novi data dir sa **test** ključevima; nikad korisnički nalozi (§13.6 „ne slati stvarne poslovne mejlove“) | popis ključeva bez vrednosti |
| Pending/held actions, cron | `CronStore` piše u tabelu `cron_schedules` **unutar `personal.mind`** (`packages/core/src/cron-store.ts:386` `DELETE FROM cron_schedules`; konstrukcija `new CronStore(multiMind.personal)` u `packages/server/src/local/index.ts:585`); held actions po durable.md F-DUR-05 (`loop-executor.ts`) | novi data dir (obuhvaćen resetom `personal.mind`) | POTVRĐENO NA REVIZIJI — isti hash kao red „Personal mind“ |
| Harness in-memory stanje | `activeHarnessRuns` process-global Map (`workflow-tools.ts:447`) | novi sidecar proces po tasku (BP-PROD-04) | PID/start time u manifestu |
| Embedding/model cache | production sidecar: embedder `cacheDir = <dataDir>/models` (`packages/core/src/config.ts:436` `path.join(this.configDir, 'models')`; `new WaggleConfig(fullConfig.dataDir \|\| undefined)` u `packages/server/src/local/index.ts:762-764`; certify to proverava: `scripts/certify-windows-installer.ps1:2904` `$dataDir\models\Xenova\all-MiniLM-L6-v2\onnx\model.onnx`), reranker `<dataDir>/models/reranker` (`index.ts:791-792`, `waggleHome = fullConfig.dataDir \|\| ~/.waggle`) → **unutar** `WAGGLE_DATA_DIR`; default `~/.waggle/models` (`packages/hive-mind-core/src/mind/inprocess-embedder.ts:33`) važi samo za standalone pozivaoce bez `cacheDir` i za prazan `dataDir` (`config.ts:192-195`); lock fajl `modelLoadLockPath` se piše u `cacheDir` (`transformers-model-load.ts:27-32`) | **ne** resetovati težine (nisu task znanje). Uz nov data dir po tasku (BP-PROD-04) sidecar bi ih ponovo preuzimao sa HF za svaki task (embedding ~90 MB, `inprocess-embedder.ts:36`; reranker ~22 MB, `inprocess-reranker.ts:58`): težine bi se ipak resetovale, nastao bi egress protiv BP-PROD-07 i dodatni wall-clock. **Korak run reset-a (PREDLOG; jedinica rada `W3-PR7` „run reset“, u okviru njegovih 4–5 / 1.5–2 eng-dana — Delivery plan §2, §4.1.1):** pre-seed `<dataDir>/models/` iz verifikovane lokalne kopije u svaki čist data dir pre starta sidecar-a; hash po fajlu u manifestu (BP-MAN-12), **van** clean-baseline hash-a data dir-a. Alternativa, deljeni read-only cache kroz konfiguraciju, danas nema ručicu mimo `configDir`/`dataDir` (`config.ts:429-444`; `index.ts:791-792`), a lock fajl se piše u `cacheDir` → traži izmenu koda (NEPOZNATO; nije planirana — ako se izabere umesto pre-seed-a, ide u `W3-PR7` **van** broja 4–5 / 1.5–2 i, pošto je W3-PR7 na G2 kritičnoj putanji, pomera G2 1:1; Delivery plan §4.1.1) | POTVRĐENO NA REVIZIJI putanja `<dataDir>/models` (čitanje koda); ponovno preuzimanje po tasku i HF egress = NALAZ AUDITA — ZA PROVERU (nije pokretano; setup egress u BP-MAN-15); zaseban query/embedding *rezultat* cache NEPOZNATO — B1 grep po `mind/`. Napomena kritike (28.09.2026): raniji red je tvrdio „van `WAGGLE_DATA_DIR`“ — netačno za production sidecar. Napomena kritike (drugi prolaz, 28.09.2026): pre-seed/cache posao je bio pripisan `B2-PR1`, koji je u Delivery planu sveden na samo shim — preusmeren na `W3-PR7` |
| Ollama model store | managed runtime (BP-PROD-05): modeli `<dataDir>/models/ollama`, runtime `<dataDir>/runtimes/ollama` (`packages/server/src/local/managed-ollama-runtime.ts:603-604`; `dataDir` iz `packages/server/src/local/routes/local-inference.ts:165-169`) → **unutar** data dir-a; spoljni endpoint (korisnikov Ollama/vLLM) je van data dir-a | ne resetovati; za managed runtime isti pre-seed kao red iznad (kopija store-a, van clean-baseline hash-a) — inače ponovni pull modela po tasku (Qwen 3.8 27B Q4_K_M 16.5–18 GB, BP-COST-08); digest modela u manifestu | `ollama show` digest; POTVRĐENO NA REVIZIJI putanja; efekat po tasku NALAZ AUDITA — ZA PROVERU (ranije „van data dir-a“ — netačno za managed runtime) |
| Task fajlovi | Harbor volumen | novi kontejner po tasku (Harbor standard) | image digest |
| Upisi mimo `WAGGLE_DATA_DIR` (dopuna 1.2.1, H-05) | na `2af0904d` pod `os.homedir()/.waggle`: `workspaces/<id>/documents.json` i `pins.json` (`packages/server/src/local/routes/documents.ts:37`, `routes/pins.ts:32`), marketplace `skills/`, `plugins/` (`packages/marketplace/src/installer.ts:47-50`), `security-cache` (`packages/marketplace/src/security.ts:183,222`), adapteri (`packages/agent/src/tool-manifest-loader.ts:141`) — POTVRĐENO NA REVIZIJI (čitanje koda), runtime nije reprodukovan | novi data dir ih **ne** resetuje; popravka je W0-PR20 (G1), kod nije popravljen; do tada BP-INV-11 nije potpuna izolacija, a svaki run ide samo u bezbednom test profilu ([SAFE-IMPLEMENTATION-CHECKLIST](SAFE-IMPLEMENTATION-CHECKLIST.md), BTP) | PREDLOG: B2/B3 kandidat sadrži W0-PR20 sa zelenim sentinel testom; bez toga izolacija task X/Y (AT-28) nije dokazana |

Pravilo (BRIEF §13.4): reset obuhvata `.mind`, caches, persisted artifacts, actions i knowledge iz prethodnih primera, uz proverljiv manifest. Ako se umesto novog data dir-a koristi „čišćenje“, mora postojati hash-poređenje sa clean baseline-om; u suprotnom rezultat je nekvalifikovan.

---

## 10. Metrike i statistički dizajn po metrici (BRIEF §13.5; A25 „McNemar/TOST nisu obavezni za svaku metriku“)

### 10.1 BP-MET — Metrike

| ID | Metrika | Tip | Izvor | Status |
|---|---|---|---|---|
| BP-MET-01 | **Primarna:** APEX task score pass@1 (kako ga definiše Harbor/rubrika) | binaran po tasku **ili** frakcija kriterijuma — NEPOZNATO (BP-SEL-03f) | grader output | PREDLOG |
| BP-MET-02 | pass^k (svi k pokušaja uspešni) | binaran po tasku | k ponavljanja | PREDLOG; k: NEPOZNATO — otvoreno: Q-03 (protokol-lokalno) |
| BP-MET-03 | Trošak po tasku (model USD ili lokalni compute jedinice), tokeni in/out | kontinuiran, desno-zakošen | production trace + manifest cene | PREDLOG |
| BP-MET-04 | Latencija po tasku (wall clock), broj tool poziva, retries | kontinuiran | trace | PREDLOG |
| BP-MET-05 | ProofReceipt nivo dostignut (0/1/2/3, BRIEF §7.2) i da li je „COMPLETED“ bio ispravan (gate_passed vs verified) | ordinalan | server ledger (posle W0/W1) | PREDLOG; zavisi od F-HARN popravki |
| BP-MET-06 | Neuspesi po klasi: model / alat / infra / budžet / evaluator (BRIEF §7.3) | kategorijalan | failure taxonomy (BP-INV-04) | PREDLOG |
| BP-MET-07 | Egress događaji van dozvoljenih odredišta | broj | host merenje | PREDLOG (AT-28) |
| BP-MET-08 | Judge stabilnost: slaganje ponovljenih judge poziva na poduzorku | κ / % slaganja | `computeFleissKappa` (BP-INV-02) | PREDLOG |

### 10.2 BP-STAT — Statistički postupak po metrici

| Metrika | Dizajn | Test/interval | Zašto baš taj | Ne koristiti |
|---|---|---|---|---|
| pass@1 **binaran**, upareno po tasku (B0 vs W-full) | paired | **exact McNemar** na diskordantnim parovima + **paired difference CI** preko cluster bootstrap-a (cluster = task familija/domen; postojeći `computeClusterBootstrapCI`, i `PairedRow` dizajn sa grane) | binaran uparen ishod; zavisnost unutar domena | nezavisni χ² / dvouzorački z-test (ignoriše uparivanje) |
| pass@1 **frakcija kriterijuma** (0..1) | paired | paired mean difference sa bootstrap CI (cluster); Wilcoxon signed-rank kao robusna provera | nije binaran → McNemar neprimenljiv | McNemar |
| pass^k | paired binaran | isto kao binaran pass@1; prijaviti i pass@k radi jaza pass@k vs pass^k (APEX autori to ističu) | — | mešanje pass@k i pass^k u jednom broju |
| trošak, tokeni, latencija | paired, log-skala | razlika log-vrednosti sa bootstrap CI; medijana i IQR; „×“ odnos kao point estimate | desno zakošeno; odnos je prirodna poruka („~N× jeftinije“) | t-test na sirovim USD |
| system-to-system H-B1 deskriptivno | nezavisno (S2S-ref) ili paired (S2S-own na istim taskovima) | Wilson CI za svaku granu (`computeWilsonCI`); za paired S2S-own: paired difference CI | leaderboard broj nema per-task podatke → samo intervali | tvrdnja o razlici bez uparenih podataka |
| neinferiornost / ekvivalencija (samo ako je H-B1 tako pre-registrovana) | paired | 90% paired CI unutar [−δ, +δ] (TOST logika; `equivalence-tost.ts` sa grane) uz **unapred zadatu** δ i power račun | „nije detektovana razlika“ ≠ „isti su“ (DIR-23) | p>0.05 kao „matches“ |
| ProofReceipt nivo | ordinalan | distribucija po grani; paired sign test na promeni nivoa | — | prosek nivoa |
| failure klase | kategorijalan | proporcije sa Wilson CI; bez inferencije | dijagnostika | — |
| judge stabilnost | ponovljeno merenje | Fleiss κ / % slaganja na poduzorku od n_j taskova × r ponavljanja | evaluator varijabilnost mora u analizu (§13.5) | pretpostavka determinističkog sudije |

### 10.3 BP-STAT-MULT — Višestruka poređenja i kandidati

- Jedna **primarna** hipoteza (H-A1) i jedan primarni ishod; sve ostalo sekundarno sa Holm korekcijom unutar familije (PREDLOG).
- Broj posmatranih kandidata (konfiguracija) pre sealed run-a upisuje se u manifest; ponovljeno biranje po validation skupu ga vremenom čini delom optimizacije (BRIEF §10.5) → view log (§9.1).
- Stochastic seeds: pinovati seed gde runtime dozvoljava; gde ne (thinking modeli), prijaviti k ponavljanja i pass^k.

### 10.4 BP-STAT-STOP — Kriterijumi prekida (zamrzavaju se u B3)

- Infra greška klasa > prag → pauza i popravka pre nastavka, bez odbacivanja taskova iz imenitelja (greške ne nestaju jer scorer vrati `null`, DIR-15).
- Budžet cap dostignut → studija se prijavljuje kao nepotpuna sa N_dosegnuto; nema „retroaktivnog“ smanjenja N.
- Firewall prekršaj → red se označava kontaminiranim i **ostaje** u izveštaju kao takav.

### 10.5 BP-STAT-PROOF — Tri nivoa provere, ne jedan boolean (BRIEF §7.2)

Benchmark grader ocenjuje sadržaj (nivo 3 ekvivalent); Waggle-ov ProofReceipt nivo 1–2 se prijavljuje odvojeno i **ne** ulazi u primarni score. Poređenje „ProofReceipt tvrdi COMPLETED“ vs „grader kaže pass“ daje meru lažno-pozitivnih završetaka (BP-MET-05) — ovo je proizvodni kvalitet, ne benchmark naslov.

### 10.6 BP-STAT-FAIL — Razdvajanje neuspeha

Model (pogrešan sadržaj), alat (exit≠0, timeout alata), infra (sidecar/model server pad, mreža), budžet (token/cost cap), evaluator (judge greška/timeout). Postojeći `failure-taxonomy` modul (BP-INV-04) je kandidat za ADAPT; infra i evaluator neuspesi se prijavljuju i **ne** računaju kao „model fail“ (F-EVO-06 pokazuje suprotan obrazac u evolution kodu — ne ponavljati).

### 10.7 BP-STAT-N — Kako se izvodi N (ulaz za Q-02)

Za paired binaran ishod: potrebna N zavisi od očekivane diskordance rate p_d i ciljane razlike Δ (McNemar power); za neinferiornost od δ i varijanse razlike. Oba parametra se **mere u B2** (dev/validation), ne pretpostavljaju. Grana ima helper „powered TOST sample-size (gap + DEFF aware)“ (commit `79381854`) — kandidat za ADAPT samo ako se neinferiornost pre-registruje. Napomena iz istorije: N=114 τ² pilot, p=0.110 n.s. (grana, `PILOT-RESULT-2026-06-30.md` §„UPDATE — N-bump“) — prenosi se **samo kao upozorenje** (DIR-23), ne kao ulaz za APEX N.

---

## 11. Lestvica dozvoljenih poruka (DIR-23; BRIEF §13.5)

| Nivo | Uslov (svi moraju važiti) | Dozvoljena formulacija | Zabranjeno |
|---|---|---|---|
| L0 | studija nije izvedena ili je samo dev/validation | „Hipoteza: … Merenje u toku.“ | bilo koji broj kao rezultat |
| L1 | sealed run izveden; paired CI razlike W-full − B0 pokriva 0 | „U ovom uzorku (N=…, APEX-Agents 1.1, Harbor 0.20.0, judge …) razlika između Waggle-a i baseline-a **nije utvrđena**.“ | „isti su“, „matches“ |
| L2 | sealed run; paired CI razlike > 0 (donja granica > 0) na primarnoj metrici | „**Izmeren lift** od X pp [CI a–b] prema našem baseline-u (isti model M, referentni agent) na APEX-Agents 1.1 pod uslovima Z.“ | generalizacija na druge benchmarke/modele |
| L3 | pre-registrovana margina δ; 90% paired CI ⊂ [−δ, +δ] prema imenovanoj konfiguraciji F na **istom** protokolu (S2S-own) | „**Potvrđena neinferiornost** unutar ±δ pp prema konfiguraciji F (model, agent, runner, judge) na APEX-Agents 1.1.“ | „frontier-class“ bez navođenja F i δ |
| L4 | paired CI razlike W-full(M) − B0(F) > 0 na istom protokolu, sealed, pre-registrovano | „**Nadmašio konfiguraciju F** na benchmarku APEX-Agents 1.1 pod uslovima Z (N=…, CI …).“ | „pobedio frontier“, „beats Claude/ChatGPT“ (API model u runneru nije gotov proizvod) |
| L-cost | deterministički izmereno u istom runu | „~N× niži trošak po tasku (medijana) uz [L1/L2/L3] ishod na kvalitetu; lokalni compute prijavljen odvojeno.“ | „besplatno“ za lokalni model |

Dodatna pravila: nema poruke iz poddomene (npr. samo corporate law) kao ukupne; nema poređenja sa leaderboard brojem kao „pobeda“ (L4 zahteva S2S-own); negativan ili L1 rezultat se **objavljuje** sa metodologijom (BRIEF §5.1). „Matches“ iz S1 C18 se **ispravlja** u L1 formulaciju dok L3 ne postoji (BRIEF §17 C18).

**BP-MSG-01 — Pravilo atribucije za sloj ograničene recipe evolucije (PREDLOG; revizija 1.2.1, H-10).** Sloj je W3e-PR9a..e: registry odobrenih varijanti research/document postupka i promovisana varijanta (DIR-14, PRD-10-13, FRD-08.5).

1. Rezultat konfiguracije bez tog sloja nije dokaz njegovog doprinosa. To važi za svaki B2 ili B3 run na SHA koji ne sadrži W3e-PR9a..e, za W-full bez promovisane varijante i za ablation W−recipe. W−recipe meri ručnu recipe/proof putanju iz W3, ne evoluciju varijanti.
2. Merljiv doprinos sloja sme se tvrditi samo iz razlike W+evolved − W-full. Obe grane moraju biti na istom zamrznutom kandidatu (isti SHA, model, runtime i protokol), na sealed skupu i pre-registrovane. Formulacija ide po nivoima ove sekcije (L1 ili L2), primenjenim na tu razliku, sa W-full kao osnovom poređenja.
3. Upareni rezultat promocije na dev/holdout skupu (W3e-PR9c, AT-29 recipe deo) je interni dokaz da je promocija ispravna. Za javnu poruku to je nivo L0: bez broja kao rezultata.
4. Bez merenja iz tačke 2 dozvoljena je samo funkcionalna tvrdnja „Waggle poredi i eksplicitno promoviše odobrene varijante research/document postupka”. Uslov: ODB-02 = da i AT-29 recipe deo prošao na kvalifikovanom kandidatu (F3). Ako je ODB-02 = ne, ni ta tvrdnja nije dozvoljena (PRD-10-13).
5. B3 rezultat na F2 SHA bez sloja opisuje tu konfiguraciju. Ako sloj stigne posle F2, F2→F3 carry-forward review (Delivery plan §4.3, §5) ga navodi kao izmenjenu merenu površinu. B3 poruka tada ostaje vezana za F2 SHA i ne pripisuje se sloju.

---

## 12. Manifest polja (BRIEF §13.6, A25) — BP-MAN

Osnova: `benchmarks/harness/src/preregistration.ts` payload (`manifest_hash`, `manifest_path`, `manifest_locked_at`, `dataset_version/path/instance_count`, `per_cell`, `judge_tiebreak`, `judge_models[]` sa `pinning_surface`) — POTVRĐENO postoji; proširuje se poljima ispod (PREDLOG).

| ID | Polje | Napomena |
|---|---|---|
| BP-MAN-01 | `code_sha` (40 hex), `tree_clean: true`, build komande i hash sidecar bundle-a | prereg checklist sa grane (`gate/prereg-checklist.ts:1-11`) zahteva čist tree — ADAPT |
| BP-MAN-02 | `installer_sha256` ako se koristi packaged sidecar; inače `sidecar_build: {cmd, node_version: 22.23.2, hash}` | Q-06 |
| BP-MAN-03 | `model`: `{id, hf_sha, quant, format, runtime: {name, version, digest}, thinking/reasoning_effort, context_limit, max_output_tokens, temperature/seed}` — za cilj `Qwen/Qwen3.8-27B` sha `1d4bf0f2ff6012fd82039f2fa52739d0dd7c60c0`, Ollama tag+digest; za kontrolu `Qwen/Qwen3.6-35B-A3B` sha `995ad96e…` i **ruta** (lokalno vs DashScope, `litellm-config.yaml:211-215`) | external.md §1; C19 „ne prenositi score između konfiguracija“ |
| BP-MAN-04 | `frontier_config` (S2S): `{provider, model_id, snapshot, reasoning/effort, agent, runner}` ili `reference: {url, date, number}` | §5 |
| BP-MAN-05 | `hardware`: GPU model/VRAM, RAM, CPU, OS/WSL2, driver; iz `hardware-detect.ts` gde pokriva (NVIDIA/Apple), ručno inače | BP-INV-13 |
| BP-MAN-06 | `dataset`: HF id + sha, Harbor verzija, image digesti, split fajl SHA-256, `sealed_view_count: 0` do prereg-a, `validation_view_log[]` | §9.1 |
| BP-MAN-07 | `scorer`: judge model id/verzija/temperatura, rubric verzija, `judge_out_tag` (svež po judge prolazu), r ponavljanja | memorija projekta o svežem OUT_TAG-u; BP-MET-08 |
| BP-MAN-08 | `waggle_config`: recipe ID/verzija, skills lista+hash, connectors (nijedan live), persona/spec override hash, ablation flags, režim (`work`/`strict`/`benchmark`), token/context budžet, timeout, retry politika, pause/recovery režim | §5, §8 |
| BP-MAN-09 | `baseline_config`: referentni agent commit, tools, prompt, isti model parametri | §5 |
| BP-MAN-10 | `attempts/seeds`, `k`, timeout po tasku, `max_steps` | §10 |
| BP-MAN-11 | `outputs`: putanje do kompletnih artefakata, trace-ova (`turnId`), grader izlaza, `events.jsonl` sa firewall assertion redovima, `recount` skripta + EXPECT | AT-28 |
| BP-MAN-12 | `reset`: clean baseline hash data dir-a po tasku (bez `models/`), hash po fajlu pre-seed-ovanog `<dataDir>/models/` (embedding, reranker, managed Ollama store), sidecar PID/start | §9.3 |
| BP-MAN-13 | `cost`: po stavci iz §13 sa izvorom cene (URL + datum) | A29 |
| BP-MAN-14 | `deviations[]`: svaka izmena zvaničnog runnera/scorera (FR-OSS-10 iz FRD v1.1 §18; PRD v1.1 §14 „Benchmarks“ / PRD v1.2 §15, PRD-15-02) | disclose |
| BP-MAN-15 | `egress_log`: dozvoljena odredišta i izmereni saobraćaj; odvojeno `setup_egress` (pre-seed modela: HF embedding/reranker, managed Ollama pull — izvor, veličina, hash) od task egress-a | AT-28; §9.3, BP-PROD-07 |
| BP-MAN-16 | `prereg`: `bench.preregistration.manifest_hash` event vreme, hash, ko je odobrio | BP-INV-03 |

---

## 13. Trošak, budžet i N (NEPOZNATO — otvoreno: DQ-04 / Q-01, Q-02; BRIEF §13.6, §20.3)

### 13.1 BP-COST — Stavke troška (ništa nije „nula“)

| ID | Stavka | Kako se meri | Izvor cene | Status |
|---|---|---|---|---|
| BP-COST-01 | Judge API (DeepSeek-v4-Flash-0731) po tasku × grane × k × r | tokeni iz Harbor loga | zvanična DeepSeek cena — **nije proverena** u external.md | NEPOZNATO (B1 proverava cenu iz javnog izvora; B2-PR0 ruler meri tokene po tasku) |
| BP-COST-02 | Frontier model za S2S-own (npr. Claude) | tokeni × cena | zvanično 27.09.2026 (external.md §6): Opus 4.6/4.7/4.8 = $5/$25, Sonnet 5 = $2/$10, Fable 5.1 = $10/$50, Haiku 4.5 = $1/$5 per MTok | NALAZ AUDITA — ZA PROVERU (live 27.09.2026, izvor: external.md §6, §8) cene; izbor F: NEPOZNATO — otvoreno: Q-07 (protokol-lokalno) |
| BP-COST-03 | Lokalni compute za Qwen: GPU sati × (amortizacija hardvera + energija), izmereno na bench mašini | vreme po tasku × snaga | interna pretpostavka u manifestu | NEPOZNATO — meriti |
| BP-COST-04 | Kontrolni Qwen3.6-35B-A3B ako ide preko DashScope | tokeni × cena | `models.json:7-8` 0.20/0.80 nije revalidiran | NEPOZNATO |
| BP-COST-05 | **Greška u repou:** `benchmarks/harness/config/models.json:61-67` `qwen3.6-35b-a3b-local` cena 0.0/0.0 i `packages/agent/src/cost-tracker.ts:28-30` Opus 15/75 (3×), `:32` Sonnet 5 3/15 (1.5×), fallback `:66` — **ne koristiti ove tabele za claim**; ispraviti pre B2 (F-REL-06 najmanja promena = obim Delivery plan W0-PR13: 4 reda + Haiku 3.5 `:39-40` (→ $0.80/$4 ili oznaka retired) + fallback + test + `models.json`) | — | POTVRĐENO NA REVIZIJI |
| BP-COST-06 | τ² user-simulator (samo ako sekundarni test ide) | tokeni × cena | — | NEPOZNATO — otvoreno: DQ-04 / Q-01 (samo ako sekundarni τ² test ide) |
| BP-COST-07 | Ljudski rad: adjudikacija sudije na poduzorku, code review adaptera, analiza | sati | — | NEPOZNATO |
| BP-COST-08 | Bench mašina: Docker/WSL2 setup, disk (image-i + Qwen 3.8 27B Q4_K_M 16.5–18 GB, Q8 29–30 GB; external.md §1.2–1.3) | jednokratno | — | NALAZ AUDITA — ZA PROVERU (live 27.09.2026, izvor: external.md §1.2–1.3, §8) veličine |
| BP-COST-09 | Model download i re-pin managed Ollama (≥0.32.12; razumno ≥0.32.15) + nova router/installer receipt (CLAUDE.md §1) | inženjerski dani | — | NALAZ AUDITA — ZA PROVERU |

### 13.2 BP-BUDGET — Formule za procenu (ulazi popunjava B1/B2)

- `cost_B3 ≈ N_sealed × grane × k × (c_model_grana + c_judge × r) + c_infra + c_human`
- `cost_B2 ≈ N_dev_run × 2 × (c_model + c_judge)` po iteraciji × broj iteracija
- `c_model` za lokalni Qwen = `t_task × P_GPU × cena_energije + amortizacija`; nije 0.
- Istorijski red veličine (samo kao upozorenje, drugi benchmark): τ² pilot opus ~$0.56/task vs qwen ~$0.022/task agent trošak (grana, PILOT-RESULT) — **ne prenositi na APEX** (duži taskovi, drugi judge).

### 13.3 Šta je ovde otvoreno — NEPOZNATO (decision queue §15)

Budžet cap (Q-01), N po skupu (Q-02), k i r (Q-03), ablation grana (Q-04), judge profil (Q-05), production build topologija (Q-06), frontier F i S2S-own (Q-07), model/quant/hardware pin (Q-08), δ (Q-09), uslov objave (Q-10), APEX kao primarni (Q-00).

---

## 14. Šta stara grana `feature/harness-sota-bench` doprinosi (cherry-pick, ne rebase)

Stanje (POTVRĐENO NA REVIZIJI, release-oss.md F-REL-12 + `git diff --name-status` ovde): `origin/feature/harness-sota-bench` @ `18e5b36a` (2026-07-01); 66 komita ispred, 2022 iza `main`; merge-base `33a92354`; 121 fajl, +21435/−4; svi fajlovi osim 8 su **A** (ne postoje na main) → aditivno, bez konflikta; konflikt siguran samo `packages/agent/src/cost-tracker.ts` (+test).

| ID | Komiti | Fajlovi | Odluka za protokol | Status |
|---|---|---|---|---|
| BP-CP-01 | `37fa8142`, `68fb47e3`, `dc278462`, `44e7d50c`, `fc61c636`, `e2287e8d`, `8e0a2b3e` | `benchmarks/harness/src/firewall/*` + `tests/firewall/*` (barrel `firewall/index.ts:1-8`: normalize, artifact, substring gate, embedding gate, hashMind, emit) | **ADAPT** za BP-FW-03; kontrakt „artifact kinds“ proširiti na Waggle Workspace fajlove/DOCX izlaze | PREDLOG |
| BP-CP-02 | `0f7d82b3`, `83edcb50`, `4fdaa67a`, `787952a2`, `fab0f0f1`, `f07148da`, `024f3394` | `benchmarks/harness/src/gate/{preflight,prereg-checklist,ruler-validation,index}.ts` + fixtures (`preflight.ts:1-13`: „priced run MUST NOT start unless this is green“; `prereg-checklist.ts:1-11`: čist tree + SHA) | **ADAPT** za B2-PR0 ruler (§7) i B3 freeze gate | PREDLOG |
| BP-CP-03 | `967727b4`, `eb77bb7b`, `78072088`, `79381854`, `ced5a4b2` | `stats/equivalence-tost.ts` (+ 1-linijski export u `stats/index.ts`) — paired cluster-bootstrap difference CI, TOST, power helper (`equivalence-tost.ts:1-24`) | **ADAPT**: paired difference CI je opšte korisan (§10.2); TOST **samo** ako se H-B1 pre-registruje kao neinferiornost (A25: ne blanket) | PREDLOG |
| BP-CP-04 | `0404b106`, `4e8a6046`, `7a2e15ea`, `4d6a5c49`, `14b9bd1b`, `45fc53d4`, `19676850` | `benchmarks/harness/src/continual/*` (split-builder, mind-build/hash, overlap-audit, arm-runner) | **ADAPT** `split-builder` (deterministički stratifikovani split, §9.1) i `mind-hash`; `arm-runner`/`mind-build` su τ²-specifični (memory-ON/OFF sa zamrznutim mind-om) — referenca | PREDLOG |
| BP-CP-05 | `7bec6062`, `56401547`, `daba32d6`, `9a653947`, `3a0842cc`, `227805a5`, `84527a87`, `9750ea3a`, `ca931116`, `cee97a47`, `be855789`, `cc580777` | τ² adapter: `benchmarks/harness/src/tau2/*`, `benchmarks/tau2/{VENDOR.md (pin 5ebebbe8…, MIT), scripts/vendor.sh, agent/*.py, bridge/*}` | **ADAPT shell** (vendor pin, argv builder, results/oracle parser, JSONL emitter) za sekundarni test; **bridge (`waggle-bridge-server.ts`, `llm-client.ts`) NE prenositi kao „Waggle under test“** — krši DIR-22 (§6 BP-PROD-09); mora se prepisati da poziva `POST /api/chat` | PREDLOG; Python fajlovi su dev alat, ne deo no-Python paketa (BRIEF §14) |
| BP-CP-06 | `e251bf3c`, `ddb7f5b0`, `dcbc42a7`, `ea078769` | `models.json`, `litellm-config.yaml` (+66 linija, čist patch) | **ADAPT uz ispravku cena** (F-REL-06); ne unositi „lokalno = 0“ | PREDLOG |
| BP-CP-07 | `fe7804bf` | `packages/agent/src/cost-tracker.ts` + test | **PRESKOČITI** — obrisao bi reservation ledger (`ModelSpendBudget`, `BudgetPricingUnavailableError`) i ima pogrešnu cenu za 4.7 (15/75) | POTVRĐENO NA REVIZIJI (F-REL-06/12) |
| BP-CP-08 | `9eb454bd`, `16b4dc3d`, `df159ac2`, `18e5b36a` | `benchmarks/tau2/results-retail-pilot/*` (N=50 → N=114, McNemar p=0.077 → 0.110 n.s.) | **ARHIVIRATI** sa oznakom „nije potvrđena razlika; bridge nije production putanja“ — nikad kao rezultat (DIR-23, C18) | PREDLOG — SMER BRIEFA (brief §13.5) |
| BP-CP-09 | `75303ac1`, `4d2ab660`, `fb5840c3`, `b3501c46`, `85bd1e59`, `4e751fd5` … | `docs/plans/harness-sota-recon/*` (00–15 + recon) | **REFERENCA**; founder ratifikacije u `10-PREREGISTRATION-PARAMETERS.md` (δ=±5pp primarna, ±3pp deskriptivna; `banking_knowledge` cell; ruler anchor banking×GPT-5.5=37.37; AppWorld arm; subject Qwen3.6-35B-A3B) su vezane za stari τ² dizajn i subject model koji više nije cilj (D-15) → **ne prenose se**; ulaze u Q-09/Q-07 kao istorijski input | ODLOŽENO |

Napomena: grana ima i `tests/frontier-baseline-smoke.test.ts` (env-gated, troši novac) i `ddeee231` pre-spend smoke — prenositi samo sa jasnim env gate-om.

---

## 15. Decision queue (NEPOZNATO — otvoreno; PREDLOG + uticaj; ne traži se ponovo ništa iz D-01..D-18)

| # | Otvoreno | Preporuka (PREDLOG) | Uticaj ako se ne odluči | Šta nije otvoreno |
|---|---|---|---|---|
| Q-00 | APEX-Agents 1.1 kao primarni test | da, uz uslove §4 BP-SEL-03 | B1 ne može da pinuje dataset/runner | potreba za izvršenom poštenom studijom (D-18) |
| Q-01 | Budžet cap (API + GPU + ljudski) za B2-PR0 ruler, B2 A/B i B3 (= Delivery plan DQ-04) | cap po fazi; B2-PR0 ruler mali (prvi plaćeni korak; B1 je bez troška); B2 A/B i B3 cap posle B2-PR0 merenja | ništa plaćeno ne kreće (DIR-01) | — |
| Q-02 | N po skupu (dev/validation/sealed) | izvesti iz B2 discordance; §9.1 raspon je ulaz | B3 ne može da se pre-registruje | „≥30“ i „N≈1500“ nisu obavezni (A17, §13.6) |
| Q-03 | k ponavljanja (pass^k) i r judge ponavljanja | k≥2 na poduzorku ako budžet dozvoli; r≥2 na kalibracionom poduzorku | reliability i evaluator varijansa ostaju neprijavljene | — |
| Q-04 | Koja ablation grana ide u prvi finalni run | W−recipe (alternativa W−mem) | „odakle dolazi lift“ ostaje neproverivo | najmanje jedna ablation (§13.3) |
| Q-05 | Judge profil: zvanični cloud judge (uporedivo sa leaderboard-om) vs lokalni judge profil (odvojen) | zvanični za javnu tvrdnju; lokalni kao dodatni profil ako se traži | BYOK budžet vs uporedivost | KVARK bez cloud judge-a (D-03) |
| Q-06 | Šta je „production sidecar“ na bench mašini (T1 vs T2, §6 BP-PROD-10) | T1 host-sidecar na Windows/WSL2 sa istim SHA; manifest navodi build | DIR-22 usklađenost sporna | DIR-22 sam |
| Q-07 | Frontier konfiguracija F za S2S i da li se radi S2S-own | S2S-ref obavezno; S2S-own ako Q-01 dozvoli, F = najbliži javno objavljenom (Claude familija) | L3/L4 poruke nedostupne | „API model ≠ gotov proizvod“ |
| Q-08 | Model/quant/runtime/hardware pin za cilj (Qwen 3.8 27B: Q4_K_M vs Q8; Ollama repin; ctx budžet; GPU klasa) i kontrolu (Qwen3.6-35B-A3B lokalno vs DashScope) | Q4_K_M na 24 GB klasi kao radna pretpostavka, izmeriti (external.md §1.4); repin ≥0.32.15; H200 FP8 serverska merenja (LM TEK program) nisu zamena ni B2 profil (PRD-13-10 t.6) | B2 ne može da krene sa target modelom | cilj Qwen 3.8 27B-klase (D-15) |
| Q-09 | Margina δ za neinferiornost, ako se H-B1 pre-registruje tako | odložiti do B2 varijanse; istorijska ±5pp je input, ne odluka | L3 nedostupan | — |
| Q-10 | Uslov objave: objaviti metodologiju i rezultat bez obzira na ishod; ko potpisuje wording iz §11 | da (objava bez obzira na ishod već sledi iz BRIEF §5.1 i §11 „Dodatna pravila“); nivo poruke L0–L4 određuju uslovi §11 iz izvršenog rezultata, a wording potpisuje Benchmark owner uz nezavisan review — **protokol-lokalno** po mapi Delivery plan §6, nije founder DQ; javni naziv/GO za release ostaje DQ-01 | rizik marketinga iznad rezultata (§5.1) | negativan rezultat se ne skriva (BRIEF §5.1) |

---

## 16. Acceptance veze (BRIEF §16)

| AT | Kako ga ovaj protokol pokriva | Faza |
|---|---|---|
| AT-28 | production putanja (§6), izolacija task X/Y (§9.2–9.3), manifest + offline recount (§12, BP-MAN-11) | B2 dry-run, B3 |
| AT-29 | baseline i kandidat na istim primerima (§5, §10.2 paired), kandidat sa regresijom/cap-om nije promovisan (BP-FW-04, W3e), holdout access log (§9.1) | B2/B3 + W3e |
| AT-21 | research/document fixture → fajl koji se otvara, sekcije, razrešivi izvori; validator hvata pogrešan broj/citat (BP-MET-05, §10.5) | B2 |
| AT-20 | izabrani lokalni model prolazi generation + tool round-trip pre B2 (BP-PROD-05) | B1/B2 |
| AT-07/AT-22 | interni crash/resume i change-input testovi ostaju obavezni (R08), nisu deo javnog benchmarka | G2 |

---

## 17. Rizici

| Rizik | Verovatnoća/uticaj | Mitigacija | Status |
|---|---|---|---|
| APEX referentni agent ne podržava lokalni endpoint → B0 sa Qwen-om zahteva adapter izmenu (deviation) | NEPOZNATO / visok | B1 proverava; svaka izmena u `deviations[]` | NEPOZNATO |
| Judge drift (cloud model se promeni) između B2 i B3 | srednja / visok | pin verzije/datuma; ponovni judge svih grana u istom prozoru; svež OUT_TAG | PREDLOG |
| Qwen 3.8 27B ne staje/ne radi upotrebljivo na dostupnom GPU-u | srednja / visok | hardware ladder merenje (A21); Q8 vs Q4 kao odvojene konfiguracije u manifestu; MoE kontrola odvojeno (C19) | NALAZ — ZA PROVERU |
| W-full pre W0 popravki daje „Completed“ bez verify → rezultat nekvalifikovan | POTVRĐENO / visok | B2 čeka F-HARN-01/02/03/08 | POTVRĐENO |
| Kontaminacija kroz skills/marketplace sadržaj koji citira benchmark | niska / visok | firewall substring/embedding gate nad prompt-om i mind-om | PREDLOG |
| Pogrešna cost tabela u proizvodu (`cost-tracker.ts`) ulazi u izveštaj | POTVRĐENO / srednji | manifest cene iz zvaničnog izvora; ispravka F-REL-06 pre B2 | POTVRĐENO |
| Ponavljano gledanje validation skupa | srednja / srednji | view log, ≤2 pogleda, prereg hash | PREDLOG |
| Grana `harness-sota-bench` cherry-pick unese τ² bridge kao „Waggle“ | srednja / visok | BP-CP-05 eksplicitno zabranjuje; test da adapter zove `/api/chat` | PREDLOG |

---

## 18. Šta je u ovom artefaktu NEPOZNATO / otvoreno (sažetak)

1. APEX task-level scoring semantika (binaran vs frakcija) i podrška lokalnog endpointa u referentnom agentu — B1 (čitanje koda/dokumentacije), potvrda run-om u B2-PR0.
2. Budžet, N, k, r, δ, frontier F — Q-01/02/03/07/09.
3. Šta se računa kao „production sidecar“ na Linux/WSL2 bench mašini (T1/T2) — Q-06.
4. Da li Ollama pin 0.32.3 uopšte učitava `qwen3.8:27b`; izmereni VRAM/latencija po quantu — Q-08.
5. Da li postoji zaseban query/embedding *rezultat* cache u `mind/` koji preživljava novi `WAGGLE_DATA_DIR` — B1. Težine **nisu** van data dir-a: production sidecar ih drži u `<dataDir>/models` (embedding, reranker, managed Ollama; §9.3), pa su ponovno preuzimanje po tasku i HF/Ollama egress NALAZ AUDITA — ZA PROVERU dok pre-seed korak (§9.3; jedinica rada `W3-PR7` run reset) ne bude proveren run-om — reset test na izolovanom data dir-u u `W3-PR7`, potvrda na bench mašini u prvom B2 dev run-u (Delivery plan §3). Napomena kritike (28.09.2026): raniji tekst je proveru vezivao za `B2-PR1`, koji je sveden na samo shim.
6. DeepSeek judge cena; DashScope kontrolna cena — B1.
7. Kalendar B3 (freeze + run + judge + analiza) — zavisi od Q-01/Q-02; protokol ne daje datum (Delivery plan §4.3 nosi samo PREDLOG placeholder 10–20 rd, §7).

Zatvoreno u ovom prolazu (bilo NEPOZNATO u ranijoj verziji nacrta): sadržaj `stub-core/` (BP-PROD-09), putanja cron store-a (`cron_schedules` u `personal.mind`, §9.3), oznaka F-HM-15 usklađena sa refuterom (BP-INV-22). Napomena kritike (28.09.2026): raniji nacrt je ovde navodio i „putanja embedding cache-a“ (`~/.waggle/models`, van `WAGGLE_DATA_DIR`) kao zatvorenu — netačno za production sidecar (`packages/core/src/config.ts:436`, `packages/server/src/local/index.ts:762-764,791-792`); ispravljeno u §9.3 i stavci 5.

---

## Izvori

- **D:** D-03, D-05, D-06, D-08, D-12, D-15, D-18 (BRIEF §3).
- **DIR:** DIR-01, DIR-03, DIR-07, DIR-14, DIR-15, DIR-22, DIR-23 (BRIEF §1, §6.1, §7.1, §10.3, §10.5, §13).
- **BRIEF sekcije:** §4.2, §5.1, §7.2–7.3, §11.3, §13.1–13.6, §14 (red „Benchmark projekti“), §15.1 (red B1–B3), §15.2, §16 (AT-07, AT-20, AT-21, AT-22, AT-28, AT-29), §17 (C18, C19), §18 (A17, A19, A21, A25, A29), §19 (R03, R04, R08, R09), §20.1, §20.3, §20.4.
- **S1 (audit):** spot-check L18; C18, C19; A25, A29; §3 redovi „Harness recipe evolution“, „Waggle LongWork“, „Full six-arm N≈1500“; §7 pitanje 5.
- **Phase A:** `docs/plans/v1.2-evidence/phaseA/external.md` §0 #1–4, #8–10, #12; §1.1–1.5; §4.1–4.7; §6; §7 · `docs/plans/v1.2-evidence/phaseA/release-oss.md` F-REL-06, F-REL-12, §6 · `docs/plans/v1.2-evidence/phaseA/harness.md` F-HARN-01..09 + `harness.refute.md` (HOLDS 7/7; korekcija putanja `packages/agent/src/{system-tools,system-tools-helpers,tool-executor}.ts`) · `docs/plans/v1.2-evidence/phaseA/evolution.md` F-EVO-04, F-EVO-06, F-EVO-07 · `docs/plans/v1.2-evidence/phaseA/hivemind.md` F-HM-12, F-HM-15 + `hivemind.refute.md` (F-HM-15 → DELIMIČNO/NEPOVEZANO) · `docs/plans/v1.2-evidence/phaseA/evolution.refute.md` (F-EVO-04/06/07 HOLDS) · `docs/plans/v1.2-evidence/phaseA/durable.md` F-DUR-05 + `durable.refute.md` (HOLDS).
- **Repo, revizija `2af0904d` (read-only):** `packages/server/src/local/routes/chat.ts:75-77,614-654,1541` · `packages/server/src/local/routes/agent-run.ts:237` · `packages/server/src/local/routes/external-tool-runs.ts:173` · `packages/server/src/local/index.ts:516,538,565,627,639` · `packages/server/src/local/managed-ollama-runtime.ts:28-29` · `packages/server/src/local/hardware-detect.ts:1-20` · `packages/agent/src/orchestrator.ts:858-866` · `packages/agent/src/turn-context.ts:1-20` · `packages/agent/src/eval-dataset.ts:208` · `packages/agent/src/cost-tracker.ts:28-32,66` · `packages/agent/src/workflow-harness.ts:313,474-482` · `packages/agent/src/builtin-harnesses.ts:128,181` · `packages/agent/src/workflow-tools.ts:330-358,412-422,447` · `packages/agent/src/harness-trace-bridge.ts:91,139-148` · `packages/agent/src/task-shape.ts:145` · `benchmarks/gaia2/adapter.ts:1-12,31-37` · `benchmarks/gaia2/waggle-container/stub-core/{index.js:1-7,package.json}` · `packages/core/src/cron-store.ts:386` · `packages/server/src/local/index.ts:585,762-764,791-792` · `packages/core/src/config.ts:192-195,429-444` · `packages/server/src/local/managed-ollama-runtime.ts:603-604` · `packages/server/src/local/routes/local-inference.ts:165-169` · `scripts/certify-windows-installer.ps1:2904` · `packages/hive-mind-core/src/mind/inprocess-embedder.ts:33,36` · `packages/hive-mind-core/src/mind/inprocess-reranker.ts:58` · `packages/hive-mind-core/src/mind/transformers-model-load.ts:27-32` · `benchmarks/harness/src/stats/index.ts:19-26` · `benchmarks/harness/src/preregistration.ts:36-43,52-75` · `benchmarks/harness/src/failure-taxonomy/*` · `benchmarks/harness/config/models.json:2-8,61-67,83-100` · `benchmarks/results/locomo-sota-2026-06/recount.mjs:1-20` · `benchmarks/preregistration/*` · `docs/plans/BENCHMARK-LANDSCAPE-RESEARCH-2026-05-22.md` · `litellm-config.yaml:211-215`.
- **Grana `origin/feature/harness-sota-bench` @ `18e5b36a` (git show):** `benchmarks/tau2/bridge/waggle-bridge-server.ts:1-33` · `benchmarks/tau2/bridge/llm-client.ts:2,79` · `benchmarks/tau2/VENDOR.md` · `benchmarks/tau2/results-retail-pilot/PILOT-RESULT-2026-06-30.md` · `benchmarks/harness/src/firewall/index.ts:1-33` · `benchmarks/harness/src/stats/equivalence-tost.ts:1-24` · `benchmarks/harness/src/gate/preflight.ts:1-13` · `benchmarks/harness/src/gate/prereg-checklist.ts:1-11` · `docs/plans/harness-sota-recon/10-PREREGISTRATION-PARAMETERS.md` · `git log --oneline main..origin/feature/harness-sota-bench` (66 komita).
- **Spoljni izvori (provereni 27.09.2026 u `docs/plans/v1.2-evidence/phaseA/external.md` §8):** HF `mercor/apex-agents-v1.1`, Mercor blog 2026-09-08, `mercor-intelligence/archipelago`, `sierra-research/tau2-bench`, taubench.com, `facebookresearch/meta-agents-research-environments`, HF `openai/gdpval`, `AGI-Eval-Official/FORTE`, `microsoft/OdysseyBench`, HF `Qwen/Qwen3.8-27B`, ollama.com/library/qwen3.8, Anthropic/OpenAI/Google pricing strane.
