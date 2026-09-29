# Faza A — revalidacija grupe „hivemind” na reviziji `2af0904df01ca3d374cc78ba95b60dc579dd6a7a`

**Revizija:** `main` = `2af0904df01ca3d374cc78ba95b60dc579dd6a7a` (2026-09-27 05:08 +0200). `git status --porcelain` prijavljuje samo dva untracked `.docx` fajla u `docs/`; svaki tracked fajl citiran ispod je identičan HEAD-u (working tree == HEAD).

**Način provere:** read-only pregled izvora (`git grep`, `git blame`, `sed`, čitanje fajlova). Testovi **nisu izvršavani** (repo je read-only za ovaj prolaz; vitest upisuje keš u `node_modules`, a lokalni ABI trap za better-sqlite3 traži Node 22.23.2). Gde citiram test, to znači „test postoji i pinuje ponašanje”, ne „test je pokrenut u ovom prolazu”. Nijedan E2E tok nije izvršen na pokrenutom sidecar-u.

**Ulazni izvori:** docs/plans/v1.2-evidence/inputs/Waggle_Planner_Brief_v1.0_2026-09-27.md §8 (DIR-09, DIR-10), §16 AT-13..AT-16; docs/plans/v1.2-evidence/inputs/S1-audit-2026-09-27.md C11, A13 (hook read path), A26, W2, §3 red „Consolidating the two MCP servers”, spot-check „ContextPackage has zero occurrences”; PRD §8; FRD §7.

**Statusi:** ODLUKA / POTVRĐENO NA REVIZIJI / NALAZ AUDITA — ZA PROVERU / DELIMIČNO/NEPOVEZANO / PREDLOG / ODLOŽENO / NEPOZNATO / VEĆ ZATVORENO / NIJE POTVRĐENO.

---

## 1. Nalazi (jedan zapis po S1 tvrdnji / AT-u)

### F-HM-01 — RAWDETAIL verbatim lane postoji i aktivan je po defaultu (S1 C11, deo a)

- **Tvrdnja iz S1:** „RAWDETAIL verbatim lane (the driver behind the LoCoMo 86.49% result)” postoji i mora se očuvati.
- **Status:** POTVRĐENO NA REVIZIJI.
- **Commit:** `2af0904d`.
- **Putanja/simbol:** `packages/agent/src/orchestrator.ts:858-894` (render sekcije `## Raw dialogue excerpts (verbatim)`), `packages/hive-mind-core/src/mind/raw-detail-lane.ts:116-187` (`fetchRawDetailLane`: pool FTS/window → CE rerank top-K=6 → ±1 sused → dedup), `packages/hive-mind-core/src/harvest/raw-turns.ts` (write side, `MIND_RAWTURN_PREFIX = '[mind-rawturn'`, kill switch `WAGGLE_RAWDETAIL`).
- **Ulaz:** upit koji nije catch-up i mind sa `[mind-rawturn …]` frejmovima; reranker dostupan.
- **Trenutni izlaz:** verbatim isečci renderuju se POSLEDNJI u recall bloku, u formatu `- [YYYY-MM-DD] (speaker) tekst` (orchestrator.ts:885-893); lane zahteva reranker (`if (reranker && process.env['WAGGLE_RAWDETAIL'] !== '0')`, :866). Reranker je **default ON** (`orchestrator.ts:564`: samo `WAGGLE_RERANKER === '0'` ga gasi); komentar na `orchestrator.ts:106-109` („IF the WAGGLE_RERANKER=1 flag is set”) je zastareo. Prvo korišćenje preuzima ~22 MB ONNX model u `~/.waggle/models/reranker` (`packages/server/src/local/index.ts:792,800,1364`); posle 1 s grace-perioda recall pada na RRF bez lane-a (:566-579).
- **Korpus lane-a:** raw-turn frejmove pišu SAMO harvest putevi: `packages/server/src/local/routes/harvest.ts:660-662`, `packages/memory-mcp/src/tools/harvest.ts:316`, `packages/hive-mind-mcp-server/src/tools/harvest.ts:318`. Živi chat turn-ovi se **ne** čuvaju kao raw turns → RAWDETAIL danas pokriva importovane razgovore, ne tekući rad u Workspace-u.
- **Repro test / ograničenje provere:** `packages/agent/tests/w46-rawdetail-recall.test.ts` (5 `it`: render, count, kill switch, „no reranker → no lane”, no double-render), `packages/hive-mind-core/tests/mind/raw-detail-lane.test.ts`, `packages/server/tests/local/w46-harvest-raw-turns.test.ts`. Nisu izvršeni u ovom prolazu. Nije provereno da li je reranker model bundlovan u installer (grep `reranker|ms-marco|MiniLM` u `scripts/check-sidecar-resources.mjs`, `bundle-native-deps.mjs`, `build-sidecar.mjs` = 0 pogodaka) → na offline instaliranom desktopu lane može biti tiho neaktivan.
- **Očekivano (brief §8.2):** očuvati RAWDETAIL kao „izvorni materijal / retrieval evidence”, ne kao naučenu činjenicu; ne uklanjati.
- **Najmanja promena:** bez promene koda; ispraviti zastareli komentar (`orchestrator.ts:106-109`); u FRD v1.2 eksplicitno zapisati da RAWDETAIL trenutno indeksira samo harvestovane razgovore i da zavisi od reranker modela (offline profil = NEPOZNATO).
- **AT:** AT-14.

### F-HM-02 — Hookovi čuvaju svaki prompt kao `temporary` frame (S1 C11, deo b)

- **Tvrdnja iz S1:** „hooks that store every prompt as a temporary frame”.
- **Status:** POTVRĐENO NA REVIZIJI.
- **Commit:** `2af0904d`.
- **Putanja/simbol:** `packages/hive-mind-hooks-core/src/handlers-core.ts:126-152` (`runUserPromptBody`, `encodeFrame(event, { importance: 'temporary' })` na :148 — koristi se za codex/codex-desktop/cursor/hermes/openclaw), `packages/hive-mind-hooks-claude-code/src/hooks/user-prompt-submit.ts:50` (Claude Code kopija).
- **Ulaz:** bilo koji UserPromptSubmit događaj sa nepraznim `prompt`.
- **Trenutni izlaz:** ceo prompt upisan u aktivni mind (`workspace` iz `WAGGLE_WORKSPACE_ID`, inače personal) kao I-frame `importance='temporary'`, `source` iz adaptera. Write-side ingress guard odbija nesigurno (`hook-runtime.ts:191-193`). TTL: `FrameStore.compactFrames` briše `temporary` > 30 dana (`packages/hive-mind-core/src/mind/frames.ts:404-433`), ali pozivaoci su samo `hive-mind-cli maintenance.ts:501`, MCP `cleanup_frames` (`memory-mcp/src/tools/cleanup.ts:319`) i PreCompact hook (`handlers-core.ts:232-240`); u `packages/server/src` nema planiranog compact poziva (grep `compactFrames(` = 0 u serveru).
- **Repro test / ograničenje:** `packages/hive-mind-hooks-core/tests/handlers-core.test.ts:55-65,162-172`; `packages/hive-mind-hooks-claude-code/tests/hooks/user-prompt-submit.test.ts:12-29` — pinuju `temporary`. Nisu izvršeni.
- **Očekivano (brief §8.2):** privremeni hook sadržaj sme imati operativnu svrhu; ne promoviše se u dugotrajne činjenice; poseban kanal/TTL/retrieval exclusion.
- **Najmanja promena:** bez promene skladištenja; PREDLOG: Waggle-side periodični `compactFrames` (personal + svaki workspace) da TTL bude stvaran, ne samo dostupan preko CLI/MCP.
- **AT:** AT-14.

### F-HM-03 — Isključenje `temporary` iz recall-a: Waggle strana DA, hook/MCP strana NE (S1 C11 deo c, A13)

- **Tvrdnja iz S1:** „Hooks should exclude `temporary` from recall.”
- **Status:** DELIMIČNO/NEPOVEZANO.
- **Commit:** `2af0904d`.
- **Putanja/simbol:**
  - Waggle recall isključuje: `packages/agent/src/orchestrator.ts:728-737` (`isAuthoritativeForRecall`: `temporary` i `deprecated`), importance lane bira samo critical/important (:707-714), `fetchRecentFrames(..., { excludeTemporary: true })` (:647-649), `packages/agent/src/context-loader.ts:77-88`, `packages/server/src/local/routes/workspace-context.ts:283,342,361`, `packages/server/src/local/executor-brief.ts:66`.
  - Hook recall NE isključuje: SessionStart → `recallPersonalAndWorkspace` (`packages/hive-mind-shim-core/src/context-recall.ts:10-33`) → `cli-bridge.ts:345-377` (`hook-call recall_memory`) → `packages/hive-mind-cli/src/commands/hook-call.ts:112-155` → `packages/hive-mind-core/src/hook-runtime.ts:227-258` (`recallHookFrames`): SQL `WHERE importance != 'deprecated'` (:237) — `temporary` ulazi, rangiran poslednji (:238-243).
  - MCP `recall_memory` (`packages/memory-mcp/src/tools/memory.ts:94-135`, isto u `hive-mind-mcp-server`) poziva `HybridSearch.search` bez `excludeDeprecated`; `HybridSearch` tretira importance kao SKOR, ne kao isključenje (`search.ts:37-43`) → `temporary`/`deprecated` mogu izaći, samo umanjeni.
- **Ulaz (repro):** svež `dataDir`, `saveHookFrame({content:'temporary recent item', importance:'temporary'})`, potom `recallHookFrames({ limit: 20 })`.
- **Trenutni izlaz:** temporary frame u rezultatu (kada nema više od `limit` boljih frejmova) → ubrizgan u novu Claude Code/Codex/Hermes sesiju kao `additionalContext`.
- **Repro test / ograničenje:** `packages/hive-mind-core/tests/hook-runtime.test.ts:126-137` koristi `limit: 2` sa tri frejma, pa temporary ispadne po rangu — test NE pinuje uključivanje, dakle isključenje ga ne lomi. Waggle stranu pinuje `packages/agent/tests/r2-recall-closure.test.ts:27-40`.
- **Očekivano (brief §8.2, S1 C11):** privremeni hook tekst nije automatski dugotrajna činjenica i ne vraća se kao autoritativan kontekst.
- **Najmanja promena:** `hook-runtime.ts:237` → `WHERE importance NOT IN ('deprecated','temporary')` + test; za MCP `recall_memory` post-filter identičan `isAuthoritativeForRecall` (ili nova opcija `excludeTemporary` u `HybridSearch`).
- **AT:** AT-14.

### F-HM-04 — Hook read path ne skenira ubrizgani sadržaj (S1 A13)

- **Tvrdnja iz S1:** dodati „The hook read path also runs the scan and excludes `temporary`.”
- **Status:** POTVRĐENO NA REVIZIJI (praznina potvrđena: skener na read putu ne postoji).
- **Commit:** `2af0904d`.
- **Putanja/simbol:** `hook-runtime.ts:227-258` (`recallHookFrames` bez skeniranja), `packages/hive-mind-hooks-claude-code/src/hooks/session-start.ts:46-60,80` (`formatHitsForContext` direktno ubrizgava `content`), `handlers-core.ts:77-90,110-123` (isto za ostale alate). Write-side guard postoji (`hook-runtime.ts:191`). Grep `scanForInjection|evaluateExternalMemoryIngress` u `hive-mind-hooks-*/src`, `hive-mind-shim-core/src` = 0 pogodaka (jedini pogoci su CLI `cognify.ts`/`harvest-local.ts`).
- **Ulaz:** frame upisan mimo hook guard-a (npr. import ili MCP `save_memory` iz drugog alata) sa injection sadržajem.
- **Trenutni izlaz:** sadržaj ulazi u SessionStart `additionalContext` bez read-side provere. Waggle recall na read putu skenira (`orchestrator.ts:923-933`).
- **Repro test / ograničenje:** nema testa; ograničenje = statička analiza.
- **Očekivano (brief §8.3, §11.4):** defense-in-depth; hook ne prihvata nepoverljiv sadržaj bez scope/taint provere.
- **Najmanja promena:** u `recallHookFrames` (ili u `formatHitsForContext`) primeniti `evaluateExternalMemoryIngress` po hitu i izbaciti nesigurne; fail-open (nema ubrizgavanja umesto pada hook-a).
- **AT:** AT-14, AT-19.

### F-HM-05 — Workspace run sažetak se kopira u personal mind, i to na ČETIRI mesta (S1 A26 „leak”)

- **Tvrdnja iz S1:** „fix the leak where workspace run summaries are copied into the personal mind (`external-tool-runs.ts:964-976`)”.
- **Status:** POTVRĐENO NA REVIZIJI — i šire nego u S1.
- **Commit:** `2af0904d`; uvedeno `920a276c9` (2026-07-11, `git blame -L 964,977`).
- **Putanja/simbol:**
  1. `packages/server/src/local/routes/external-tool-runs.ts:964-977` (`recordResultToMinds`): personal I-frame `[External agent run]\nRun…\nWorkspace: ${workspaceId}\n…\nSummary: ${safeSummary.slice(0,1_000)}`, `'normal'`, `'agent_inferred'`, sesija `agent-runs`.
  2. `packages/server/src/local/chat-collaboration.ts:802-814`: `[${label}]\nRun…\nWorkspace…\nSummary: ${result.slice(0,1_000)}`.
  3. `packages/server/src/local/fleet-run-executor.ts:924-936`; default `memoryScopes = savedAgentPolicy?.memoryScopes ?? ['personal','workspace']` (:729) → svaki fleet run bez eksplicitne politike piše i u personal.
  4. `packages/server/src/local/routes/agent-groups.ts:719-729`.
- **Ulaz:** bilo koji external/fleet/group/chat-collaboration run u Workspace A.
- **Trenutni izlaz:** sažetak rezultata (do 1000 znakova) leži u `personal.mind` sa `importance='normal'`; `recallMemory` pretražuje personal mind pri svakom upitu i renderuje `## Personal Memory` (`orchestrator.ts:847-856`), MCP `recall_memory` default scope je `personal` → sadržaj iz Workspace A može izaći u Workspace B i u eksternim alatima. Personal `agent-runs` indeks nema čitača (grep `'agent-runs'` van testova pogađa samo 4 pisca) — koristi se isključivo posredno kroz recall.
- **Repro test / ograničenje:** postojeći testovi PINUJU trenutno ponašanje kao ispravno: `packages/server/tests/local/external-tool-runs.test.ts:245-260,319-335`, `packages/server/tests/local/fleet-isolation.test.ts:519-522` (`expect(personalFrame?.content).toContain('[Agent run]')`), `packages/server/tests/local/agent-groups.test.ts:346-362`. Ne postoji test sa sentinel podatkom „Workspace A → nije u recall-u Workspace B/personal”.
- **Očekivano (brief §8.3, AT-13, founder pravilo 2026-06-12 „no memory leakage between minds”):** run sažetak ostaje u workspace mind-u; personal dobija najviše content-free pointer.
- **Najmanja promena:** na sva 4 mesta ukinuti upis sadržaja u personal (opcija: content-free pointer `Run/Workspace/Status` bez `Summary`, `importance='temporary'` da bude recall-nevidljiv); zadržati `CollaborationRunMemoryRefs` oblik (`personalFrameIds` može ostati prazan; prilagoditi `status` semantiku); ažurirati 4 testa; dodati sentinel izolacioni test (AT-13). Za fleet promeniti default `memoryScopes` na `['workspace']`.
- **AT:** AT-13.

### F-HM-06 — Trust labele iz `frame.source` ne ulaze u recall tekst (S1 A26)

- **Tvrdnja iz S1:** „trust labels from `frame.source`”.
- **Status:** POTVRĐENO NA REVIZIJI (praznina potvrđena; delimično pokriveno u executor brief-u).
- **Commit:** `2af0904d`.
- **Putanja/simbol:** `orchestrator.ts:843,854` renderuju `[date, importance] content` — bez `source`; `source` se skuplja samo za UI pill (`recalledFrames`, :910-917). Hook inject renderuje `(importance)[from] ts: content` (`session-start.ts:54-58`) — bez source. Executor brief renderuje `[date | source | frameId]` (`executor-brief.ts:186`). `FrameSource = 'user_stated'|'tool_verified'|'agent_inferred'|'import'|'system'` (`frames.ts:28`).
- **Ulaz:** recall sa frejmovima različitih izvora.
- **Trenutni izlaz:** model ne vidi razliku `user_stated` vs `agent_inferred` vs `import` u chat recall bloku.
- **Repro test / ograničenje:** rendering pinuju `orchestrator-recall-hardening.test.ts`, `w41-temporal-recall.test.ts` (byte-osetljiv blok).
- **Očekivano (PRD §8 „provenance-bearing Context Package”, brief §8.1):** trust/taint oznake uz svaki izvor.
- **Najmanja promena:** dodati source token u render liniju (npr. `[date, importance, source]`) — menja bajtove recall bloka, pa zahteva LoCoMo same-judge kontrolu (W2 rizik) i ažuriranje pinning testova. PREDLOG, ne quick fix.
- **AT:** AT-14, AT-16.

### F-HM-07 — Token budžet po model tier-u: delimično, na assembler nivou, ne na nivou recall lane-ova (S1 A26)

- **Tvrdnja iz S1:** „token budget per model tier with a priority order”.
- **Status:** DELIMIČNO/NEPOVEZANO.
- **Commit:** `2af0904d`.
- **Putanja/simbol:** `packages/agent/src/prompt-assembler.ts:165-169` (`FRAME_LIMITS` small 3 / mid 6 / frontier 10), `:118` (`DEFAULT_MAX_CHARS = 32_000`), `:369,376,487-489` (sekcije se odbacuju dok `system.length <= maxChars`). Sa W4.5 pre-renderovanim `recalledText` (:437-445) ceo multi-lane blok je JEDNA sekcija → `FRAME_LIMITS` se ne primenjuje na njega; kapovi lane-ova su fiksni bez obzira na tier (`orchestrator.ts:765` facts 60, `:771` events 40, `RAW_DETAIL_K = 6`, `RECALL_LINE_LENGTH`). `PROMPT_ASSEMBLER` je default ON (`feature-flags.ts:38`, `!== '0'`) — CLAUDE.md §10 tvrdi „PA on for Claude, default OFF” (doc drift).
- **Ulaz:** isti upit na small vs frontier modelu.
- **Trenutni izlaz:** identičan recall blok; razlika samo u odbacivanju celih sekcija kad se pređe 32k znakova.
- **Repro test / ograničenje:** `packages/server/tests/local/persona-acceptance-prompt-budget.test.ts` postoji (nije čitan detaljno); nije izvršen.
- **Očekivano (brief §8.1):** `ContextPackage` nosi token budžet i prioritet.
- **Najmanja promena:** ništa sada; W2 ugovor definiše budžet po tier-u na nivou paketa; ispraviti CLAUDE.md §10 tvrdnju o defaultu.
- **AT:** AT-06, AT-14.

### F-HM-08 — Nema `ContextPackage`/`ContextBuilder`/`WAGGLE_CONTEXT_INJECTED`; dupla injekcija je moguća (S1 spot-check + A26)

- **Tvrdnja iz S1:** „`ContextPackage` has zero occurrences”; predlog „hook-precedence marker (`WAGGLE_CONTEXT_INJECTED`)”.
- **Status:** POTVRĐENO NA REVIZIJI.
- **Commit:** `2af0904d`.
- **Putanja/simbol:** grep `ContextPackage|WAGGLE_CONTEXT_INJECTED|ContextBuilder` nad celim repo-om (bez `node_modules`) = 0 fajlova. Dupla injekcija: route-proposal put prependuje brief u prompt (`route-proposals.ts:205-207`: `` `${brief.text}\n\n${proposal.prompt}` ``) I hookovi u eksternom procesu pri SessionStart ubrizgavaju sopstveni recall (`session-start.ts:80`) — nema koordinacije. `WAGGLE_SIGNAL_EMIT='0'` za headless (`external-tool-runner.ts:389`) gasi samo signal emisiju, ne recall/save.
- **Ulaz:** headless run kroz route-proposal sa instaliranim Claude Code hookovima.
- **Trenutni izlaz:** dva nezavisna memorijska bloka u istoj sesiji (brief + SessionStart recall), potencijalno isti frejmovi dvaput.
- **Repro test / ograničenje:** nema testa; statička analiza.
- **Očekivano (brief §8.3):** marker za koordinaciju uparen sa run/context ID-em; nije autorizacija.
- **Najmanja promena:** dodati env marker u `WAGGLE_ENV_ALLOWLIST` (`external-process-env.ts:29-35`) uz `WAGGLE_RUN_ID`; SessionStart preskače/skraćuje recall kad marker + run id postoje; scope/taint provera ostaje.
- **AT:** AT-16.

### F-HM-09 — `recallMemory` engine sa 7 lane-ova na tačno navedenim linijama (S1 W2 „preserve”)

- **Tvrdnja iz S1:** „`orchestrator.ts:582-978` recallMemory (7 lanes, engine unchanged)”.
- **Status:** POTVRĐENO NA REVIZIJI.
- **Commit:** `2af0904d`.
- **Putanja/simbol:** `packages/agent/src/orchestrator.ts:582-978`. Lane-ovi: (1) importance K5 (:700-725), (2) semantic personal (:682), (3) semantic workspace (:683-685), (4) date-window since/until + fallback (:673-693) i sekcija „Events during X” (:826-837), (5) profiles (:759-762, :800-807), (6) facts najnovijih 60 (:763-766, :808-815), (7) events poslednjih 40 (:767-771, :816-822), plus RAWDETAIL (:858-894; komentar :878 „the other 6 lanes stand”). Catch-up grana (:628-665). Empty-mind fast path (:591-607). Read-side injection scan (:923-933). Temporal anchor (:935-957).
- **Pozivaoci (grep `recallMemory(`):** `packages/server/src/local/routes/chat-turn-preparation.ts:237`, `chat.ts:390`, `command.ts:266`, `commands.ts:74`.
- **Ulaz/izlaz:** vidi kod; `{ text, count, recalled, recalledFrames }`.
- **Repro test / ograničenje:** `packages/agent/tests/orchestrator-recall-hardening.test.ts`, `w41-temporal-recall.test.ts`, `r2-recall-closure.test.ts`, `w46-rawdetail-recall.test.ts`, `orchestrator-memory-boundary-pins.test.ts`. Nisu izvršeni.
- **Očekivano (D-12, DIR-09):** čuvati; omotati tipizovanim ugovorom bez dupliranja.
- **Najmanja promena:** nema.
- **AT:** AT-13, AT-14.

### F-HM-10 — Fleet/spawn/subagent/harness: fleet koristi assembler bez multi-lane recall-a; harness i subagent bez recall-a (S1 W2 net-new „wiring”)

- **Tvrdnja iz S1:** net-new „wiring into fleet/spawn/sub-agents/harness phases”.
- **Status:** DELIMIČNO/NEPOVEZANO.
- **Commit:** `2af0904d`.
- **Putanja/simbol:** `packages/server/src/local/fleet-run-executor.ts:647-648` i `routes/fleet.ts:350-356` pozivaju `orchestrator.buildAssembledPrompt(task, persona, …)` bez `recalledText` → grana „Direct search for raw frames” (`orchestrator.ts:463-470`: dve semantic pretrage, limit 10, bez importance/facts/events/RAWDETAIL lane-ova). `packages/agent/src/subagent-orchestrator.ts` i `workflow-harness.ts`: grep `recallMemory|buildAssembledPrompt|recalledText` = 0.
- **Ulaz:** fleet run ili harness faza sa istim upitom kao chat.
- **Trenutni izlaz:** siromašniji kontekst nego u chatu (gubitak lane fidelity-ja); harness faze bez memorije.
- **Repro test / ograničenje:** nema testa koji poredi kontekst chat vs fleet.
- **Očekivano (FRD §7 „context injection before native or external execution”):** isti ugovor konteksta.
- **Najmanja promena:** za fleet: pozvati `recallMemory` i proslediti `recalledText` u `buildAssembledPrompt` (W4.5 put već postoji); harness/subagent = W2 dizajn.
- **AT:** AT-06, AT-16.

### F-HM-11 — Predaja konteksta eksternom izvršiocu postoji samo na route-proposal putu (DIR-10, W2 „external-executor injection”)

- **Tvrdnja iz S1/brief:** „predaja konteksta” eksternom izvršiocu; S1 W2 net-new „external-executor injection (file handoff)”.
- **Status:** DELIMIČNO/NEPOVEZANO.
- **Commit:** `2af0904d`.
- **Putanja/simbol:** `packages/server/src/local/executor-brief.ts:46-123` (`buildExecutorBrief`: workspace `HybridSearch`, `excludeDeprecated`, izbacuje `temporary`/unreviewed import, `redactSecrets`, odbacuje >30% redigovano, cap 8000 znakova / 6 stavki, injection scan celog brief-a, sha256 `briefHash`), `:130-154` (`filterExecutorBrief`: nikad ne re-runuje retrieval). Pozivaoci: `routes/route-proposals.ts:14,188,296`; brief se prependuje promptu (:205-207) i `briefHash` ide u `attribution` (:211) → `/api/tools/run` schema (`external-tool-runs.ts:103`) → `metadata` frejma (`:956`). Direktan `/api/tools/run` (dock/LauncherApp) i interaktivni `/api/tools/launch` (`routes/tools.ts:514-525`) NE prilažu brief — eksterni alat dobija prompt + env ID-eve; memorija stiže samo ako su hookovi instalirani. Transport prompta: `temp-file` ili `stdin` po manifestu (`external-tool-runner.ts:128-130,364`).
- **Ulaz:** (a) run kroz route-proposal; (b) run direktno kroz `/api/tools/run`; (c) interaktivni launch.
- **Trenutni izlaz:** (a) bounded, redigovan, skeniran brief sa hash-om; (b),(c) bez konteksta iz Hive Mind-a.
- **Repro test / ograničenje:** `packages/server/tests/local/executor-brief.test.ts` (6 `it`), `route-proposals.test.ts`. Nisu izvršeni.
- **Očekivano (PRD §8 „native and external executors receive equivalent context contracts”, DIR-10):** eksplicitna predaja za svaki put.
- **Najmanja promena:** ponovo iskoristiti `buildExecutorBrief` u `/api/tools/run` kad `attribution.briefHash` nedostaje (opt-in) — konačan oblik odlučuju pisci (nije arhitektonski predlog ovog prolaza).
- **AT:** AT-16.

### F-HM-12 — Capture sa workspace ID-em radi; run ID ne stiže u hook frejmove (DIR-10, `WAGGLE_WORKSPACE_ID`)

- **Tvrdnja iz brief-a:** capture „sa tačnim workspace/run identitetom”.
- **Status:** DELIMIČNO/NEPOVEZANO (workspace: POTVRĐENO; run id: NIJE POVEZANO).
- **Commit:** `2af0904d`.
- **Putanja/simbol:** env gradi fail-closed `buildExternalProcessEnv` (`packages/agent/src/external-process-env.ts:8-35,49-72`; allowlist `WAGGLE_WORKSPACE_ID`, `WAGGLE_RUN_ID`, `HIVE_MIND_DATA_DIR`…); headless: `external-tool-runner.ts:369-392` (`WAGGLE_RUN_ID`, `WAGGLE_WORKSPACE_ID`, `HIVE_MIND_DATA_DIR: request.dataDir`); interaktivno: `tool-launcher.ts:371-393`, `routes/tools.ts:514-525` (`dataDir`, `runId`, `roomId`, `runToken`). Hook strana: `cli-bridge.ts:240,404-408` čita `WAGGLE_WORKSPACE_ID` → `workspace` arg na save/recall (:329-330,352-355) → `hook-runtime.ts:121-187` (`resolveMind`: `<dataDir>/workspaces/<id>/workspace.mind` + `workspace.json` id check, symlink/hardlink odbrana) što se poklapa sa `packages/hive-mind-core/src/workspace-manager.ts:139-140,234,264`. Run id: grep `WAGGLE_RUN_ID|runId` u `hive-mind-shim-core/src`, `hive-mind-hooks-core/src`, `hive-mind-hooks-claude-code/src` = 0 → hook frejmovi nose `session:<id>` token (`frame-encoder.ts:112`), ne run id; run id postoji samo u `recordResultToMinds` metadata (`external-tool-runs.ts:950-958`).
- **Ulaz:** headless run sa hookovima; Stop hook.
- **Trenutni izlaz:** frame u ispravnom workspace mind-u, bez veze na `runId`.
- **Repro test / ograničenje:** `packages/hive-mind-shim-core/tests/cli-bridge.test.ts` (WAGGLE_WORKSPACE_ID), `hive-mind-core/tests/hook-runtime.test.ts`, `agent/tests/external-tool-runner.test.ts`, `tool-launcher.test.ts`. Nisu izvršeni.
- **Očekivano (DIR-10):** capture povezan sa run identitetom.
- **Najmanja promena:** `cli-bridge` čita `WAGGLE_RUN_ID` i `frame-encoder.ts` dodaje `run:<id>` token u header/metadata.
- **AT:** AT-16.

### F-HM-13 — Sprečavanje key leakage-a ka eksternom izvršiocu (AT-16)

- **Tvrdnja (AT-16):** „nema key leakage-a”.
- **Status:** POTVRĐENO NA REVIZIJI (mehanizmi postoje) uz jednu rupu.
- **Commit:** `2af0904d`.
- **Putanja/simbol:** env allowlist ne prosleđuje provider ključeve (`external-process-env.ts:8-35`); runner rediguje vrednosti env varijabli `/(KEY|TOKEN|SECRET)$/` iz event teksta (`external-tool-runner.ts:588-595`, primenjeno u `emit` :169) — pokriva i `WAGGLE_RUN_TOKEN`; brief rediguje (`executor-brief.ts:72-82`). Rupa: hook SessionStart inject (`session-start.ts:46-60`) ne rediguje tajne iz recalled sadržaja.
- **Ulaz:** frame sa tajnom u personal mind-u + SessionStart hook u eksternom alatu.
- **Trenutni izlaz:** tajna može ući u eksterni kontekst kroz hook recall.
- **Repro test / ograničenje:** env i redakcija: `external-tool-runner.test.ts`, `external-process-env` pokriven u `tool-launcher.test.ts`. Hook rupa: nema testa.
- **Očekivano:** nema tajni u ubrizganom kontekstu.
- **Najmanja promena:** `redactSecrets` nad hitovima u `formatHitsForContext` (oba mesta: claude-code i handlers-core).
- **AT:** AT-16.

### F-HM-14 — `tool` događaji eksternog alata su self-reported, ne server-provereni (AT-16)

- **Tvrdnja (AT-16, brief §8.4):** „nema tvrdnje o neopaženim internim tool radnjama”.
- **Status:** DELIMIČNO/NEPOVEZANO.
- **Commit:** `2af0904d`.
- **Putanja/simbol:** `external-tool-runner.ts:519,531` emituje `'tool'` iz parsiranog JSON stream-a alata (`tool_use`, `command_execution`); `external-tool-runs.ts:922-932` upisuje u `metrics.toolsUsed` bez oznake porekla.
- **Ulaz:** eksterni alat koji u stream-u tvrdi da je pozvao alat.
- **Trenutni izlaz:** registar beleži `toolsUsed` kao činjenicu; UI oznaka porekla nije proverena u ovom prolazu.
- **Repro test / ograničenje:** statička analiza; UI nije pregledan.
- **Očekivano (brief §8.4):** ne označavati kao server-provereno kad Waggle prima samo tekstualni stream.
- **Najmanja promena:** u registru označiti `toolsUsed` kao `tool-reported`; UI copy „prijavio alat”.
- **AT:** AT-16.

### F-HM-15 — LoCoMo same-judge regression gate pre merge-a ne postoji (S1 A26)

- **Tvrdnja iz S1:** dodati „a LoCoMo same-judge regression gate before merge”.
- **Status:** NIJE POTVRĐENO (gate ne postoji).
- **Commit:** `2af0904d`.
- **Putanja/simbol:** `.github/workflows/` (ci.yml, deploy-www.yml, hive-mind-cli-cross-platform.yml, installer-smoke.yml, mind-parity-check.yml, release.yml, sync-mind.yml, tauri-build-pr.yml) — grep `locomo` = 0. Postoje `benchmarks/harness`, `benchmarks/results`, `recount.mjs` (offline recount) — ručni proces.
- **Ulaz:** PR koji menja render recall bloka.
- **Trenutni izlaz:** nema automatske detekcije regresije.
- **Repro test / ograničenje:** n/a.
- **Očekivano (S1 W2 rizik „LoCoMo regression”):** kontrolisan re-run pre merge-a promena u recall renderu.
- **Najmanja promena:** procesni gate (ručni same-judge run + `recount.mjs`) dokumentovan u planu; CI nije nužan za G1.
- **AT:** AT-28.

### F-HM-16 — Idempotentnost extraction/konsolidacije: content-hash dedup postoji; nema ključa run/output verzija (brief §8.2, AT-14)

- **Tvrdnja iz brief-a:** „Memorijska konsolidacija mora biti idempotentna po run/output verziji.”
- **Status:** DELIMIČNO/NEPOVEZANO.
- **Commit:** `2af0904d`.
- **Putanja/simbol:** `packages/hive-mind-core/src/mind/frames.ts:109-111,289-294` (`createIFrame` → `findDuplicate` po `content_hash`, ažurira access_count); `harvest/extract-memory-lanes.ts:284` (facts/events idempotentni po dedup-u, profili replace); `packages/weaver/src/consolidation.ts:226-236` (`distillSessionContent` replace-on-update kroz `deleteByContentPrefix`), `:181-189` (B-frame pair dedup); `packages/agent/src/cognify.ts:64-70` (`cognify` pravi P-frame kad I-frame postoji — dedup P-frame-a nije proveren). External run zapis dedupuje samo identičan sadržaj (runId je u tekstu → isti run/isti sažetak = 1 frame; retry sa drugačijim sažetkom = drugi frame).
- **Ulaz:** ponovljena ista extraction / ponovljen zapis istog run-a.
- **Trenutni izlaz:** identičan sadržaj se ne duplira; drugačiji tekst istog run-a se duplira.
- **Repro test / ograničenje:** `hive-mind-core/tests/harvest/extract-memory-lanes.test.ts:111-122`, `hive-mind-core/tests/hook-runtime.test.ts:96-121`, `server/tests/local/memory-lane-cron.test.ts:74-86`, `weaver/tests/consolidation-enhanced.test.ts:127`. Nisu izvršeni.
- **Očekivano (AT-14):** re-run istog extraction-a ne duplira memoriju.
- **Najmanja promena:** dedup ključ `(runId, outputHash)` u metadata za run zapise; provera `createPFrame` dedup-a.
- **AT:** AT-14.

### F-HM-17 — Dva MCP servera su oba živa u različitim putevima; `erase` postoji samo u jednom (S1 §3 „defer”)

- **Tvrdnja iz S1:** „Consolidating the two MCP servers — Defer (debt)”.
- **Status:** POTVRĐENO NA REVIZIJI (postoje dva); odluka o spajanju = ODLOŽENO (S1).
- **Commit:** `2af0904d`.
- **Putanja/simbol:** `packages/memory-mcp` (`name: waggle-memory-mcp`, server `waggle-memory`, data `WAGGLE_DATA_DIR`/`~/.waggle`, ima `tools/erase.ts`) vs `packages/hive-mind-mcp-server` (`@waggle/hive-mind-mcp-server`, server `hive-mind-memory`, `HIVE_MIND_DATA_DIR`/`~/.hive-mind`, bez erase). `diff -rq` = 14 različitih fajlova, ukupno 289 diff linija. Potrošači: sidecar bundluje `waggle-memory-mcp` (`scripts/check-sidecar-resources.mjs:955`, `stage-sidecar-deps.mjs:53`, `build-hook-runtime.mjs:25,55`); claude-desktop hookovi registruju `waggle-memory-mcp` (`hive-mind-hooks-claude-desktop/src/install.ts:52,110`); `hive-mind-cli mcp start|call` pokreće `@waggle/hive-mind-mcp-server` (`hive-mind-cli/src/commands/mcp-start.ts:36`) — hook bridge `mcp call` put (`cli-bridge.ts:260-266`) ide na hive-mind server.
- **Ulaz:** GDPR erase kroz alat koji koristi hive-mind server.
- **Trenutni izlaz:** `erase` tool nedostupan tim putem; divergencija ponašanja između dva servera.
- **Repro test / ograničenje:** `hive-mind-mcp-server/src/integration.test.ts`, `tests/scope.test.ts`; nisu izvršeni.
- **Očekivano:** jedna semantika ili dokumentovana razlika.
- **Najmanja promena:** bez spajanja (S1: defer); zabeležiti divergenciju `erase` kao rizik za AT-15/GDPR i odlučiti da li hook put treba erase.
- **AT:** AT-15.

### F-HM-18 — Nema checkpoint-vezanog konteksta, pa ni invalidacije obrisanog izvora posle resume-a (AT-15)

- **Tvrdnja (AT-15):** „Revokovan/obrisan izvor iz checkpoint konteksta nije upotrebljen posle resume-a.”
- **Status:** DELIMIČNO/NEPOVEZANO (erasure postoji; veza checkpoint↔kontekst ne postoji).
- **Commit:** `2af0904d`.
- **Putanja/simbol:** jedina trajna referenca konteksta je `briefHash` u `attribution` (`route-proposals.ts:211`, `external-tool-runs.ts:103`); resume eksternog run-a koristi samo `sessionId` (`external-tool-runner.ts:55-56,138`) bez re-validacije brief-a. Erasure: `hive-mind-core/tests/mind/erasure.test.ts`, `memory-mcp/src/tools/erase.ts`, `erased_subjects` (memory arc 2026-07-02).
- **Ulaz:** frame iz brief-a obrisan, potom resume run-a.
- **Trenutni izlaz:** nema mehanizma koji bi kontekst ponovo razrešio; eksterni alat nastavlja sa sopstvenom sesijom.
- **Repro test / ograničenje:** nema testa; statička analiza.
- **Očekivano (brief §8.1):** snapshot ne nadjačava brisanje; označiti invalidaciju.
- **Najmanja promena:** W2 dizajn (izvan ovog prolaza); minimalno: pri resume-u proveriti da `briefHash` frejmovi i dalje postoje ili odbiti tihi nastavak.
- **AT:** AT-15.

---

## 2. Šta već radi ili postoji (existingAssetsToPreserve; pozivaoci provereni grep-om)

| Šta | Putanja | Pozivaoci / testovi |
|---|---|---|
| `recallMemory` multi-lane engine (7 lane-ova + RAWDETAIL, read-side scan, temporal anchor) | `packages/agent/src/orchestrator.ts:582-978` | `server/src/local/routes/chat-turn-preparation.ts:237`, `chat.ts:390`, `command.ts:266`, `commands.ts:74`; testovi `agent/tests/orchestrator-recall-hardening`, `w41-temporal-recall`, `r2-recall-closure`, `w46-rawdetail-recall` |
| Isključenje `temporary`/`deprecated` iz Waggle recall-a | `orchestrator.ts:728-737`; `agent/src/context-loader.ts:77-88`; `server/src/local/routes/workspace-context.ts:283,342,361`; `server/src/local/executor-brief.ts:66` | pin `agent/tests/r2-recall-closure.test.ts:27-40` |
| RAWDETAIL write/read + kill switch `WAGGLE_RAWDETAIL` | `hive-mind-core/src/harvest/raw-turns.ts`; `hive-mind-core/src/mind/raw-detail-lane.ts:116-187` | writers `server/src/local/routes/harvest.ts:661`, `memory-mcp/src/tools/harvest.ts:316`, `hive-mind-mcp-server/src/tools/harvest.ts:318`; reader `orchestrator.ts:873`; testovi `w46-*`, `raw-detail-lane.test.ts` |
| Cross-encoder reranker, default ON, kill switch `WAGGLE_RERANKER=0` | `orchestrator.ts:70-86,554-580`; `hive-mind-core/src/mind/inprocess-reranker.ts` | `server/src/local/index.ts:792,800,1364` (`rerankerCacheDir`); `vitest.setup.ts:25-26` pinuje OFF u testovima |
| PromptAssembler W4.5 single-render recall bloka + `TurnRecalledContext` | `agent/src/prompt-assembler.ts:433-457`; `server/src/local/routes/chat-turn-recall-context.ts` | `chat-turn-preparation.ts:377-387`, `chat.ts:1235,1347`, `fleet-run-executor.ts:647`, `routes/fleet.ts:350` |
| Executor brief (bounded, redigovan, skeniran, hash) | `server/src/local/executor-brief.ts:46-154` | `routes/route-proposals.ts:14,188,296`; `/api/tools/run` `attribution.briefHash` (`external-tool-runs.ts:103`); testovi `executor-brief.test.ts` (6), `route-proposals.test.ts` |
| Fail-closed env za eksterne procese + redakcija tajni u event tekstu | `agent/src/external-process-env.ts:8-72`; `agent/src/external-tool-runner.ts:588-595` | `external-tool-runner.ts:375`, `tool-launcher.ts:393`; testovi `external-tool-runner.test.ts`, `tool-launcher.test.ts` |
| Hook runtime: scoped resolveMind, write-side ingress guard, content dedup | `hive-mind-core/src/hook-runtime.ts:121-225` | `hive-mind-cli/src/commands/hook-call.ts:115,143`; `shim-core/src/cli-bridge.ts:258`; test `hive-mind-core/tests/hook-runtime.test.ts` |
| Hook lifecycle bodies (recall+inject, save-temporary, stop summarize, pre-compact) | `hive-mind-hooks-core/src/handlers-core.ts` | hooks codex/codex-desktop/cursor/hermes/openclaw; claude-code ima sopstvene kopije (`hooks-claude-code/src/hooks/*`); testovi `handlers-core.test.ts` |
| `WAGGLE_WORKSPACE_ID` → aktivni workspace u hook bridge-u | `shim-core/src/cli-bridge.ts:240,404-408`; `context-recall.ts:10-33` | svi hook paketi kroz `createCliBridge`; test `shim-core/tests/cli-bridge.test.ts` |
| Workspace mind layout `workspaces/<id>/{workspace.json,workspace.mind}` | `hive-mind-core/src/workspace-manager.ts:139-140,234,264` | `hook-runtime.ts:140-186` isti layout; test `hive-mind-core/tests/workspace-manager.test.ts` |
| Extraction idempotentnost (content-hash dedup, lane dedup, distill replace-on-update) | `hive-mind-core/src/mind/frames.ts:109-111,289-294`; `harvest/extract-memory-lanes.ts:284`; `weaver/src/consolidation.ts:181-189,226-236` | `server/src/local/memory-lane-cron.ts`; testovi `extract-memory-lanes.test.ts:111`, `memory-lane-cron.test.ts:74`, `consolidation-enhanced.test.ts:127`, `hook-runtime.test.ts:96` |
| TTL za `temporary` (30 dana) i `deprecated` (90) | `hive-mind-core/src/mind/frames.ts:404-483` (`compactFrames`) | `hive-mind-cli/src/commands/maintenance.ts:501`; `memory-mcp/src/tools/cleanup.ts:319`; PreCompact hook `handlers-core.ts:237` — NEMA server-side cron pozivaoca |
| Izolacioni pin testovi minda | `agent/tests/orchestrator-memory-boundary-pins.test.ts`; `server/tests/local/memory-stats-isolation.test.ts`; `agent/tests/subagent-isolation.test.ts`; `server/tests/local/fleet-isolation.test.ts` | pinuju: dve orkestracije ne dele layer; workspace save ne ide u personal; stats personal-only; subagent fresh window |
| `save_memory` B1 guardrail (workspace signal → workspace) + F7 cross-mind dedup | `agent/src/tools.ts:405-515` | agent tool registry; testovi u `agent/tests` (naziv nije proveren) |
| `recordResultToMinds` metadata sa `runId/roomId/workspaceId/toolId/briefHash` + ingress karantin | `server/src/local/routes/external-tool-runs.ts:941-1005` | `external-tool-runs.ts:803-806`; test `external-tool-runs.test.ts:240-336` |
| Dva MCP servera (`waggle-memory-mcp`, `@waggle/hive-mind-mcp-server`) | `packages/memory-mcp/src`, `packages/hive-mind-mcp-server/src` | sidecar bundle `scripts/check-sidecar-resources.mjs:955`; claude-desktop `install.ts:110`; `hive-mind-cli mcp-start.ts:36` |

---

## 3. Napomene i ograničenja

- Testovi navedeni kao „pin” nisu izvršeni u ovom prolazu (read-only direktiva; vitest keš u `node_modules`; better-sqlite3 ABI trap traži Node 22.23.2). Preporuka za sledeći prolaz sa dozvolom pisanja: `npm run test -- --run packages/agent/tests/r2-recall-closure.test.ts packages/agent/tests/w46-rawdetail-recall.test.ts packages/hive-mind-core/tests/hook-runtime.test.ts packages/server/tests/local/external-tool-runs.test.ts packages/server/tests/local/fleet-isolation.test.ts`.
- Nijedan E2E tok (sidecar + Claude Code/Codex/Hermes sa hookovima) nije pokrenut; F-HM-08/11/12/13 su statička analiza.
- Doc drift uočen usput (nije zaseban nalaz): CLAUDE.md §10 „PA … default OFF” vs `feature-flags.ts:38` default ON; `orchestrator.ts:106-109` „IF WAGGLE_RERANKER=1” vs `:564` default ON.
- F-HM-05 proširuje S1 A26: leak nije jedno mesto nego četiri (`external-tool-runs.ts`, `chat-collaboration.ts`, `fleet-run-executor.ts`, `agent-groups.ts`) i tri test fajla ga pinuju kao poželjno ponašanje — popravka mora ići zajedno sa izmenom tih testova i novim sentinel testom (AT-13).
- Nema arhitektonskih predloga u ovom dokumentu; „najmanja promena” je opis granice popravke, ne dizajn `ContextPackage`-a (posao pisaca).
