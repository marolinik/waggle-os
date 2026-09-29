# ADR-05 — RAWDETAIL, tri skladišne odgovornosti, `ContextPackage` referenca i precedenca hook/central injekcije

**Revizija dokumenta:** 1.2 DRAFT · 27.09.2026 · pregledana revizija koda `2af0904df01ca3d374cc78ba95b60dc579dd6a7a`
**Datum:** 2026-09-27
**Status:** DRAFT — predlog ugovora; ne menja `recallMemory` engine (D-12, DIR-09 „preserve retrieval first”)
**Autor:** planer (Fable 5.1)
**Ratifikuje:** founder — čeka
**Zamenjuje / precizira:** FRD v1.1 §7 „transient reasoning is not memory; don't store every token” (C11 — bez carve-out-a za verbatim lane); S1 A26 predlog `WAGGLE_CONTEXT_INJECTED` kao autorizacije; „workspace run sažetak → personal mind” ponašanje uvedeno u `920a276c9` (2026-07-11) i pinovano testovima; hook read path bez `temporary` isključenja (`packages/hive-mind-core/src/hook-runtime.ts:237`)
**Obavezuje:** W0-PR10/PR11/PR18 (G1; O4 hook read path, O3 4 pisca + redefinicija fleet policy gate-a, MIG-05(i) reklasifikacija kao posledica O3 — idu pre ratifikacije kao PREDLOG, Delivery plan §6.1 RAT-04, TM-08), W2 (ContextPackage/reference ugovor, izolacija, capture, external handoff), W1 (contextRef u checkpoint-u), W3e (eval scope), OSS forward-port (`hive-mind-core` je substrat, CLAUDE.md §7.5)
**Cross-references:** ADR-02 (contextRef, konsolidacija), ADR-06 (eval dataset scope), ADR-10 (erasure/revocation), ADR-08 (KVARK kontekst granica); brief §8 (DIR-09, DIR-10); AT-13, AT-14, AT-15, AT-16, AT-28

---

## §1 — Kontekst

**ADR-05-K1 (POTVRĐENO NA REVIZIJI).** RAWDETAIL verbatim lane postoji i aktivan je po defaultu: `packages/agent/src/orchestrator.ts:858-894` (`## Raw dialogue excerpts (verbatim)`, renderuje se poslednji), `packages/hive-mind-core/src/mind/raw-detail-lane.ts:116-187` (FTS/window → CE rerank top-K=6 → ±1 sused → dedup), write side `harvest/raw-turns.ts` (`[mind-rawturn` prefiks, kill switch `WAGGLE_RAWDETAIL=0`). Reranker je default ON (`orchestrator.ts:564`; komentar `:106-109` zastareo). Korpus pune **samo** harvest putevi (`routes/harvest.ts:661`, `memory-mcp/src/tools/harvest.ts:316`, `hive-mind-mcp-server/src/tools/harvest.ts:318`) — živi chat turnovi se ne čuvaju kao raw turns. Reranker model (~22 MB ONNX) **nije bundlovan** u installer (grep u `certify-windows-installer.ps1`, `check-sidecar-resources.mjs`, `bundle-native-deps.mjs`, `build-sidecar.mjs` = 0; certify seed-uje samo embedding model `:2904`) → na svežem offline desktopu lane je verovatno neaktivan do prvog online recall-a (NALAZ AUDITA — ZA PROVERU). [hivemind.md F-HM-01; refute HOLDS]

**ADR-05-K2 (POTVRĐENO NA REVIZIJI).** Hookovi čuvaju svaki prompt kao `temporary` I-frame (`hive-mind-hooks-core/src/handlers-core.ts:148`; `hive-mind-hooks-claude-code/src/hooks/user-prompt-submit.ts:50`), write-side ingress guard postoji (`hook-runtime.ts:191-193`). TTL 30 d kroz `FrameStore.compact()` (`frames.ts:410-441`) — **server cron `memory_compact` VEĆ POSTOJI** (`packages/server/src/local/index.ts:2033-2058`, seed `setup-crons.ts:35` `30 3 * * *`, personal + svaki workspace); da li radi na desktopu u 03:30 = DELIMIČNO/NEPOVEZANO (nije E2E provereno). [F-HM-02; refute WEAKENED — minimalChange „dodati cron” pobijen]

**ADR-05-K3 (DELIMIČNO/NEPOVEZANO).** Isključenje `temporary` iz recall-a: Waggle strana DA (`orchestrator.ts:728-737` `isAuthoritativeForRecall`, `:647-649` `excludeTemporary:true`, `context-loader.ts:77-88`, `workspace-context.ts:283,342,361`, `executor-brief.ts:66`); hook strana NE (`hook-runtime.ts:237` `WHERE importance != 'deprecated'` → `temporary` ulazi, rangiran poslednji); MCP `recall_memory` (`memory-mcp/src/tools/memory.ts:94-135`) koristi `HybridSearch` gde je importance SKOR, ne isključenje (`search.ts:37-43`). Test `hook-runtime.test.ts:126-137` ne pinuje uključivanje (limit 2). [F-HM-03, F-CAP-05(d)]

**ADR-05-K4 (POTVRĐENO NA REVIZIJI).** Hook read path ne skenira ni ne rediguje: `recallHookFrames` (`hook-runtime.ts:227-258`) čist SELECT; `formatHitsForContext` (`session-start.ts:46-60`; `handlers-core.ts:77-90`) ubrizgava `content` (240 znakova) direktno; grep `scanForInjection|evaluateExternalMemoryIngress|redact` u `hive-mind-hooks-*/src`, `hive-mind-shim-core/src` = 0. Waggle recall skenira ceo blok (`orchestrator.ts:923-933`). `redactSecrets` živi u `@waggle/agent` (`eval-dataset.ts:133`) — hook paketi ga ne mogu uvesti bez nove zavisnosti. [F-HM-04, F-HM-13; refute HOLDS]

**ADR-05-K5 (POTVRĐENO NA REVIZIJI — šire od S1).** Workspace run sažetak (do 1000 znakova, `importance:'normal'`, `source:'agent_inferred'`) upisuje se u **personal** mind na **četiri** mesta: `routes/external-tool-runs.ts:964-977`, `chat-collaboration.ts:802-814`, `fleet-run-executor.ts:924-936` (default `memoryScopes=['personal','workspace']` `:729`), `routes/agent-groups.ts:719-729`. Uvedeno `920a276c9`. `recallMemory` pretražuje personal na svakom upitu (`orchestrator.ts:682`), frejmovi prolaze `isAuthoritativeForRecall`/`notLaneFrame`; MCP `recall_memory` default scope `personal`. Testovi pinuju kao poželjno: `external-tool-runs.test.ts:245-260,319-335`, `fleet-isolation.test.ts:519-522`, `agent-groups.test.ts:346-362`. Fleet policy gate (`fleet-run-executor.ts:101-106`) tretira saved-agent **bez** `personal` u `memoryScopes` kao UNSUPPORTED (fail-closed), pinovano `fleet-isolation.test.ts:203` → `personal` je danas obavezan, promena zahteva redefiniciju gate-a, ne samo default-a. Nema sentinel testa Workspace A → nije u recall-u B/personal. [F-HM-05; refute WEAKENED za minimalChange]

**ADR-05-K6 (POTVRĐENO NA REVIZIJI).** Trust labele iz `frame.source` (`user_stated|tool_verified|agent_inferred|import|system`, `frames.ts:28`) ne ulaze u recall tekst (`orchestrator.ts:843,854` `[date, importance] content`); samo executor brief renderuje `[date | source | frameId]` (`executor-brief.ts:186`). Nema exact-line test pina (refute: grep `, normal] ` po testovima = 0); rizik promene je isključivo LoCoMo same-judge (render bajtovi). [F-HM-06; refute WEAKENED]

**ADR-05-K7 (POTVRĐENO NA REVIZIJI).** `ContextPackage|ContextBuilder|WAGGLE_CONTEXT_INJECTED` = 0 pojavljivanja. Dupla injekcija je moguća: route-proposal prependuje executor brief promptu (`route-proposals.ts:205-207`) **i** hookovi u eksternom procesu pri SessionStart ubrizgavaju sopstveni recall (`session-start.ts:80`); env allowlist (`external-process-env.ts:29-35`) nema marker; hookovi ne čitaju `WAGGLE_RUN_ID` (grep = 0 u shim/hooks). NEPOZNATO: da li Claude Code `--safe-mode` (headless argv `shared/tool-detection.ts:124-125`) suzbija SessionStart hookove. [F-HM-08; refute HOLDS sa jednom NEPOZNATOM premisom]

**ADR-05-K8 (POTVRĐENO NA REVIZIJI).** `recallMemory` engine sa 7 lane-ova + RAWDETAIL na `orchestrator.ts:582-978` (importance K5, semantic personal/workspace, date-window, profiles, facts 60, events 40, RAWDETAIL K6; catch-up grana; empty-mind fast path; read-side scan; temporal anchor); pozivaoci `chat-turn-preparation.ts:237`, `chat.ts:390`, `command.ts:266`, `commands.ts:74`. Fleet koristi `buildAssembledPrompt` bez `recalledText` (`fleet-run-executor.ts:647-648`, `routes/fleet.ts:350-356` → siromašnija grana `orchestrator.ts:463-470`); harness i subagent bez recall-a (grep = 0). [F-HM-09, F-HM-10]

**ADR-05-K9 (DELIMIČNO/NEPOVEZANO).** Executor brief (`executor-brief.ts:46-154`: workspace HybridSearch, `excludeDeprecated`, izbacuje `temporary`/unreviewed import, `redactSecrets`, cap 8000/6, injection scan, `briefHash`) postoji samo na route-proposal putu; direktan `/api/tools/run` i interaktivni launch (`routes/tools.ts:514-525`) ne prilažu brief. Capture nosi `WAGGLE_WORKSPACE_ID` → ispravan workspace mind (`cli-bridge.ts:240,404-408`; `hook-runtime.ts:121-187` scoped resolveMind sa symlink odbranom) ali ne i `runId` (frame-encoder daje `session:<id>`). `tool` događaji eksternog alata su self-reported (`external-tool-runner.ts:519,531` → `metrics.toolsUsed` bez oznake porekla). Nema checkpoint-vezanog konteksta → nema invalidacije obrisanog izvora posle resume-a (jedina trajna referenca je `briefHash` u `attribution`). [F-HM-11, F-HM-12, F-HM-14, F-HM-18]

**ADR-05-K10 (DELIMIČNO/NEPOVEZANO).** Idempotentnost: content-hash dedup (`frames.ts:109-111,289-294`), lane dedup, distill replace-on-update (`weaver/consolidation.ts:226-236`); nema ključa `(runId, outputHash)` → drugačiji tekst istog run-a se duplira. Token budžet: `FRAME_LIMITS` po tier-u u assembler-u (`prompt-assembler.ts:165-169`) se **ne primenjuje** na W4.5 pre-renderovani recall blok (jedna sekcija); lane kapovi fiksni. `PROMPT_ASSEMBLER` default ON (`feature-flags.ts:38`). Napomena kritike: raniji „CLAUDE.md §10 default OFF” drift ne postoji u repou (`CLAUDE.md` na `2af0904d` nema „default OFF”; fraza je samo u auto-memoriji van repoa). [F-HM-07, F-HM-16]

**ADR-05-K11 (ODLUKA — D-11, D-12; ISTORIJSKA FOUNDER ODLUKA (memorija, 2026-06-12; founder: „beware not to mix the personal and workspace minds... workspace minds are separate and no memory leakage between users is allowed”) — usklađena sa D-12 · PREDLOG — SMER BRIEFA — DIR-09, DIR-10).** ODLUKA: Hive Mind ostaje memorijski temelj, postojeći retrieval i izolacija se čuvaju (D-12); scope izolacija je nepromenljiva (D-12; istorijsko founder pravilo 2026-06-12 usklađeno sa D-12); eksterni izvršilac je opcion, a rezultat se vraća istom Workspace-u (D-11). PREDLOG — SMER BRIEFA (planerski smer, ne korisnikovo odobrenje): postojeći retrieval se prvo mapira i omotava tipizovanim ugovorom, ne duplira (DIR-09); izvršilac je eksplicitan i vezan za isti Workspace, sa proverom celog toka (DIR-10).

## §2 — Odluka (predlog ugovora)

**ADR-05-O1 (PREDLOG) — tri skladišne odgovornosti (brief §8.2, ispravlja C11).**

| Sloj | Uloga | Gde danas | Pravilo |
|---|---|---|---|
| Izvorni materijal / RAWDETAIL | verbatim dokaz za retrieval i tačno citiranje; **nije** naučena činjenica | `[mind-rawturn]` frejmovi (harvest) | čuva se; kill switch ostaje; FRD v1.2 beleži da danas pokriva samo harvestovane razgovore i zavisi od reranker modela; širenje na živi rad = W2 odluka, ne tiho |
| Izvedena memorija | činjenice/odluke/preference/veze/sažeci/potvrđeni ishodi/korekcije sa poreklom | I/P/B frejmovi, facts/events/profiles lane-ovi | `temporary` hook sadržaj se **ne promoviše** automatski; TTL 30 d kroz postojeći `memory_compact` cron (verifikovati da radi na desktopu) |
| Execution state | runovi, checkpoints, retries, grants, leases, budžeti | danas delom u Awareness `.mind` (Loop state) | ADR-02: nije semantički frame; premešta se |

**ADR-05-O2 (PREDLOG) — `ContextPackage` kao tipizovan omotač, ne novi engine (DIR-09).** Polja: `contextId`, `version`, `runId/workspaceId/sessionId`, `queryOrTaskShape`, `sourceRefs[] {frameId|fileRef, revision/hash, scope, source, trust/taint}`, `tokenBudget + priority`, `payloadForExecutor` (reference-first; privatni sadržaj kopiran samo kad je potrebno i dozvoljeno), `omittedReasons[]`. `ContextBuilder` **poziva postojeći `recallMemory`** i pakuje `{text, recalledFrames}` + workspace fajl reference; render bajtovi recall bloka se **ne menjaju** u W2 bez LoCoMo same-judge kontrole (K6).

**ADR-05-O3 (PREDLOG) — scope i izolacija (AT-13).** Run sažetak ostaje u **workspace** mind-u; personal mind dobija najviše content-free pointer (`Run/Workspace/Status`, bez `Summary`, `importance:'temporary'`) ili ništa. Zahteva: (a) izmenu na 4 mesta (K5), (b) redefiniciju fleet policy gate-a (`fleet-run-executor.ts:101-106`: `personal` više nije obavezan scope; `agents-store` već dozvoljava workspace-only, `agents.test.ts:238`), (c) ažuriranje ≥5 testova (`fleet-isolation.test.ts:203,519-522`, `agent-groups.test.ts:362`, `external-tool-runs.test.ts:259`, `:319-335`), (d) novi sentinel test. Izvedena činjenica nasleđuje ograničenja izvora; klasifikator/evolution ne može je proglasiti javnom.

**ADR-05-O4 (PREDLOG) — hook read path (A13, F-HM-03/04/13).** `recallHookFrames`: `WHERE importance NOT IN ('deprecated','temporary')`; po hitu `evaluateExternalMemoryIngress` (fail-open: izostavi hit, ne ruši hook) + redakcija tajni; `redactSecrets` se premešta u `hive-mind-core` (OSS substrat) ili se filter primenjuje u `hook-runtime.ts`/`hook-call.ts` koji već zavise od core-a. MCP `recall_memory` dobija post-filter identičan `isAuthoritativeForRecall` ili opciju `excludeTemporary` u `HybridSearch`.

**ADR-05-O5 (PREDLOG) — precedenca i marker (brief §8.3, A26).** Central Waggle injekcija je autoritativna za harness-kontrolisan rad (FRD §7). Dodati `WAGGLE_CONTEXT_INJECTED={contextId}` u env allowlist (`WAGGLE_ENV_ALLOWLIST`, `external-process-env.ts:29-35`; `WAGGLE_RUN_ID` već postoji, `:31`); hookovi počinju da čitaju oba — hook SessionStart, kad vidi marker + run id, **preskače ili skraćuje** sopstveni recall i beleži `contextId` u frame metadata. Marker je **koordinacija, ne autorizacija**: hook ne prihvata nepoverljiv sadržaj koji tvrdi „već verifikovan kontekst” i zato ne preskače scope/taint proveru. Sadržaj koji hook ubrizgava i dalje prolazi O4.

**ADR-05-O6 (PREDLOG) — trajna referenca i invalidacija (AT-15, DIR-21).** `Checkpoint.contextRef + contextHash` (ADR-02) pokazuje na `ContextPackage` sa `sourceRefs`; pri resume-u se proverava da svaki `frameId`/fileRef postoji, nije `deprecated`/erased (`erased_subjects`), i da scope nije promenjen; inače `contextInvalidated` → novo razrešenje pre nastavka. **Snapshot ne nadjačava brisanje ili opoziv.** Prelazno (pre W2): resume eksternog run-a proverava da `briefHash` frejmovi i dalje postoje ili odbija tihi nastavak.

**ADR-05-O7 (PREDLOG) — trust/taint u kontekstu (A13(b), A26).** `sourceRefs[].source` (postojeća kolona) + `taint: 'harvested'|'external_tool'|'import'|'user'` u paketu; u render liniji recall bloka source token se dodaje **tek posle** LoCoMo same-judge kontrole (K6 rizik), u executor brief-u već postoji. Prompt-injection scanner je defense-in-depth; harvestovani mejl je tainted podatak koji ne može promeniti policy (ADR-04 O5).

**ADR-05-O8 (PREDLOG) — eksterni izvršilac (DIR-10, AT-16).** Isti `ContextPackage` (ili executor brief kao njegov `payloadForExecutor`) na sva tri puta: route-proposal (postoji), `/api/tools/run` (opt-in reuse `buildExecutorBrief` kad `attribution.briefHash` nedostaje), interaktivni launch (marker + brief fajl); `cli-bridge` čita `WAGGLE_RUN_ID` → `run:<id>` token u frame header/metadata; `metrics.toolsUsed` iz eksternog stream-a označen `tool-reported`, UI copy „prijavio alat”; nema key leakage-a (env allowlist + runner redact ostaju; hook inject dobija redakciju O4).

**ADR-05-O9 (PREDLOG) — idempotentna konsolidacija (brief §8.2, AT-14).** Run-end extraction ključ `(runId, outputVersion/outputHash)` u frame metadata; ponovljen isti extraction ne duplira; drugačiji output iste run verzije = replace-on-update (Weaver obrazac `deleteByContentPrefix`), ne append. Proveriti `createPFrame` dedup (NEPOZNATO).

**ADR-05-O10 (PREDLOG) — token budžet po tier-u na nivou paketa (A26).** `ContextPackage.tokenBudget` po model tier-u sa prioritetom lane-ova (importance → RAWDETAIL → facts → events → semantic), primenjen u `ContextBuilder`, ne u assembler-u nad već renderovanim blokom. (Napomena kritike: raniji korak „ispraviti CLAUDE.md §10 tvrdnju o `PROMPT_ASSEMBLER` defaultu” uklonjen — `CLAUDE.md` na `2af0904d` nema „default OFF”; fraza je samo u auto-memoriji van repoa.)

## §3 — Šta zamenjuje i zašto

| Prethodno | Gde | Zašto |
|---|---|---|
| FRD v1.1 §7 „transient reasoning is not memory; don't store every token” bez carve-out-a | docs/plans/v1.2-evidence/inputs/Waggle_FRD_v1.1_2026-09-27.md:119 | Preširoko: ugrozilo bi RAWDETAIL lane (LoCoMo 86.49 % driver po memoriji) — C11 PRECIZIRATI; O1 razdvaja tri sloja |
| Workspace run sažetak → personal mind (4 pisca) | `920a276c9`; K5 | Krši izolaciju minds (founder 2026-06-12) i AT-13; sadržaj iz Workspace A curi u B i eksterne alate (POTVRĐENO) |
| Fleet policy: `personal` obavezan u `memoryScopes` | `fleet-run-executor.ts:101-106`; `fleet-isolation.test.ts:203` | Onemogućava workspace-only izolaciju; gate se redefiniše zajedno sa O3 |
| Hook recall `!= 'deprecated'` (temporary ulazi) | `hook-runtime.ts:237` | Privremeni prompt nije autoritativan kontekst (brief §8.2) |
| S1 A26 `WAGGLE_CONTEXT_INJECTED` kao „hook-precedence marker” | S1 A26 | Prihvaćen kao koordinacija, eksplicitno **ne** kao autorizacija (brief §8.3) |
| S1 W2 „net-new ContextBuilder + typed package” | S1 W2 | Prihvaćeno kao omotač; engine `recallMemory` nepromenjen (DIR-09) |

**ADR-05-Z1 (ODLUKA — D-12; ISTORIJSKA FOUNDER ODLUKA (memorija, 2026-06-12) — usklađena sa D-12; ne otvara se).** ODLUKA: D-12 (Hive Mind temelj, bez ponovnog pisanja engine-a). ISTORIJSKA FOUNDER ODLUKA (memorija, 2026-06-12): mind-isolation pravilo, koje važi kroz D-12. Oba se sprovode.

## §4 — Posledice

**ADR-05-P1 (PREDLOG).** OSS forward-port: promene u `hive-mind-core/src/{mind,harvest,hook-runtime}` su substrat → `oss-drift-check.mjs` baseline se re-baseline-uje kroz maintainer review; `execution-traces.ts` ostaje OSS-EXCLUDED; drift check danas već exit 1 (22 known blockers, 3 unreviewed; release-oss.md F-REL-07).

**ADR-05-P2 (PREDLOG).** LoCoMo same-judge regression gate **ne postoji u CI** (F-HM-15; grep `locomo` u `.github/workflows` = 0) — procesni gate (ručni run + `recount.mjs`) je obavezan pre merge-a bilo koje promene render bajtova recall bloka (feedback_benchmark_evidence_discipline). Ne CI za G1.

**ADR-05-P3 (PREDLOG).** Reranker model bundling/offline profil je ADR-10 stavka (offline profil ne sme tiho izgubiti RAWDETAIL lane).

**ADR-05-P4 (PREDLOG).** Testovi za prepisivanje: K5 lista (5); hook testovi (`hook-runtime.test.ts:126-137` ostaje zelen; `hooks-claude-code tests/hooks/session-start.test.ts`, `handlers-core.test.ts` mogu pinovati tačan `additionalContext` string — ZA PROVERU); `external-tool-runner.test.ts` može pinovati tačan skup env ključeva (ZA PROVERU) pri dodavanju markera.

**ADR-05-P5 (PREDLOG).** Doc drift za ispravku (doc-only): `orchestrator.ts:106-109` komentar, `docs/backend-map/sections/05d-subsystem-evolution.md:94` (ADR-06).

## §5 — Rizik

| ID | Rizik | V/U | Mitigacija |
|---|---|---|---|
| ADR-05-R1 | LoCoMo regresija promenom recall render bajtova | srednja / visoka (javna tvrdnja 86.49 %) | O2 bajtovi nepromenjeni u W2 osnovi; source token tek uz same-judge run; pin `recount.mjs` |
| ADR-05-R2 | Uklanjanje personal upisa gubi „Pick up where you left off” signal na Home-u | srednja / niska | content-free pointer + Home čita run store (ADR-02), ne personal mind |
| ADR-05-R3 | Hook filter izbaci legitiman kontekst (fail-open na scan) | niska / niska | logovanje izostavljenih hitova; nema pada hook-a |
| ADR-05-R4 | Dupla injekcija ostaje za Codex/Hermes headless ako marker nije pročitan | srednja / srednja | O5 marker u sva tri hook paketa + interaktivni launch; NEPOZNATO `--safe-mode` proveriti |
| ADR-05-R5 | Erasure ne stiže do checkpoint kopija | srednja / visoka | O2 reference-first; O6 invalidacija; ADR-10 |
| ADR-05-R6 | `memory_compact` cron ne radi na desktopu (03:30, ugašen laptop) | srednja / niska | catch-up politika rutina (ADR-07) + dream-journal zapis kao dokaz |

## §6 — Migration test

| ID | Test | Očekivanje | AT |
|---|---|---|---|
| ADR-05-T1 | Sentinel `WSA-SECRET-7731` u Workspace A run sažetku → nije u recall-u personal ni Workspace B; nije u MCP `recall_memory` sa default scope-om | RED danas (K5) | AT-13 |
| ADR-05-T2 | Fleet saved-agent sa `memoryScopes:['workspace']` prolazi policy gate i ne piše personal | RED danas (`fleet-isolation.test.ts:203` pinuje odbijanje) | AT-13 |
| ADR-05-T3 | RAWDETAIL citat dostupan u dozvoljenom scope-u; `WAGGLE_RAWDETAIL=0` gasi; bez reranker-a → bez lane-a (postojeći `w46-*` ostaju zeleni) | zeleno danas | AT-14 |
| ADR-05-T4 | `saveHookFrame(temporary)` → `recallHookFrames` ne vraća; injection sadržaj u frame-u → izostavljen iz `additionalContext`; tajna u frame-u → redigovana | RED danas | AT-14/AT-19 |
| ADR-05-T5 | Re-run istog run-end extraction-a → 0 novih frejmova; drugačiji output iste verzije → replace, ne append | delimično (content-hash) | AT-14 |
| ADR-05-T6 | Checkpoint `contextRef` sa obrisanim frejmom → resume `contextInvalidated`, nema nastavka sa starom kopijom | RED danas (nema veze) | AT-15 |
| ADR-05-T7 | Eksterni executor kroz `/api/tools/run` dobija brief/paket; frame nosi `run:<id>`; `toolsUsed` označen `tool-reported`; env bez provider ključeva | delimično | AT-16 |
| ADR-05-T8 | Headless run sa hookovima + marker → jedan memorijski blok (bez dupliranja istih frejmova) | RED danas | AT-16 |
| ADR-05-T9 | LoCoMo same-judge rerun pre merge-a W2 render izmena: `recount.mjs` unutar dogovorene tolerancije istog protokola | procesni | AT-28 |

## §7 — Izvori

- **D:** D-11, D-12 · **DIR:** DIR-09, DIR-10, DIR-21 (brief §8.1–8.4, §12.4) · **C/A/R:** C11 (PRECIZIRATI); A3, A13, A26 (PRECIZIRATI); R23 · **AT:** AT-13, AT-14, AT-15, AT-16, AT-19, AT-28
- **Phase A:** `docs/plans/v1.2-evidence/phaseA/hivemind.md` F-HM-01..18; `docs/plans/v1.2-evidence/phaseA/hivemind.refute.md` (F-HM-02 cron postoji; F-HM-05 fleet gate; F-HM-06 nema byte pina; F-HM-08 `--safe-mode` NEPOZNATO); `docs/plans/v1.2-evidence/phaseA/capability.md` F-CAP-05; `docs/plans/v1.2-evidence/phaseA/release-oss.md` F-REL-07
- **S1:** C11, A13, A26, W2, §3 „Consolidating the two MCP servers” · **Kod (na `2af0904d`):** `packages/agent/src/orchestrator.ts:106-109,463-470,564,582-978,647-649,682,728-737,843,854,858-894,923-933`; `packages/hive-mind-core/src/mind/raw-detail-lane.ts:116-187`; `harvest/raw-turns.ts`; `hook-runtime.ts:121-193,227-258`; `mind/frames.ts:28,109-111,289-294,410-441`; `packages/hive-mind-hooks-core/src/handlers-core.ts:77-90,148`; `packages/hive-mind-hooks-claude-code/src/hooks/{session-start.ts:46-60,80,user-prompt-submit.ts:50}`; `packages/server/src/local/routes/external-tool-runs.ts:964-977`; `chat-collaboration.ts:802-814`; `fleet-run-executor.ts:101-106,647-648,729,924-936`; `routes/agent-groups.ts:719-729`; `executor-brief.ts:46-154,186`; `routes/route-proposals.ts:205-211`; `packages/agent/src/external-process-env.ts:29-35`; `external-tool-runner.ts:369-392,519,531,588-595`; `packages/server/src/local/index.ts:2033-2058`; `setup-crons.ts:35`; `packages/agent/src/prompt-assembler.ts:165-169,433-457`; `feature-flags.ts:38`
