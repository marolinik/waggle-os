# ADR-04 — Inline capability setup i OAuth kao kontinuitet rada; zamena held-action ADR-a („never mid-run suspend/resume”) i D3 („OAuth can't finish inline”)

**Revizija dokumenta:** 1.2 DRAFT · 27.09.2026 · pregledana revizija koda `2af0904df01ca3d374cc78ba95b60dc579dd6a7a`
**Datum:** 2026-09-27
**Status:** DRAFT — predlog ugovora; zavisi od ADR-02 (BLOCKED_* je stanje run-a)
**Autor:** planer (Fable 5.1)
**Ratifikuje:** founder — čeka (posebno: BYO OAuth client vs Waggle-owned verified client, R12 = **DQ-06** alias — OAuth putanja prvog mail/calendar scenarija, brief §20.3; ADR-INDEX §3)
**Zamenjuje / precizira:** inline ADR u `packages/server/src/local/held-action-executor.ts:6-10` i `packages/core/src/cron-store.ts:83-87` („Self-contained descriptor + execute-on-approve, never mid-run suspend/resume (a headless tick must finish; the only 'suspend' primitive in the codebase is request-bound and restart-fatal)”); D3 iz PR4 recon (`docs/redesign-warm-hive/pr4-recon/04-inline-in-chat.md:205`, sproveden u `packages/server/src/local/routes/agent-search.ts:79` `// OAuth can't finish inline (D3)`); FRD v1.1 §6 „Blocked run stores requested capability and resumes after successful setup” bez definicije „inline”; S1 A12 precedence sa `tier` slojem
**Obavezuje:** W4 (resolver facade, CapabilityRequest, kartice, BLOCKED_CAPABILITY resume, PKCE), W1 (run pre blokiranja), W7 (mail/calendar OAuth), WB (Approvals de-gating), FRD v1.2 §„Capability”
**Cross-references:** ADR-02, ADR-07 (rutine bez silent acquisition), ADR-08 (envelope bez tier-a, KVARK sloj), ADR-10; brief §9 (DIR-11, DIR-12); AT-11, AT-12, AT-17, AT-18, AT-19, AT-25

---

## §1 — Kontekst

**ADR-04-K1 (POTVRĐENO NA REVIZIJI — korekcija S1 putanje).** S1 citira `agent-search.ts:81`; fajl `apps/web/src/lib/agent-search.ts` ima 59 linija i ne sadrži komentar. Komentar je u `packages/server/src/local/routes/agent-search.ts:79`: OAuth konektor → `{ mode: 'open-in', appId: 'connectors' } // OAuth can't finish inline (D3)`; api_key/bearer → `{ mode: 'store', extensionId: 'connector:<id>', kind: 'federated' }` (`:76-80`). „D3” je oznaka iz PR4 recon tabele („approval contract is boolean-only”), ne formalni ADR. Test `packages/server/tests/routes/agent-search.test.ts:44` („routes an OAuth connector to the Hub (open-in), never an inline token”) zaključava trenutno ponašanje. [capability.md §0, F-CAP-02]

**ADR-04-K2 (POTVRĐENO NA REVIZIJI).** Held-action ADR (`held-action-executor.ts:6-10`) i `cron-store.ts:83-87` doslovno: „never mid-run suspend/resume”. Mehanizam: self-contained `{tool,args}` red, atomic claim, TTL 7 d, execute-on-approve re-materijalizuje **samo taj alat** iz `buildToolsForWorkspace` (`:213-233`) — bez nastavka konverzacije/run-a. Live approval timeout (300 s) → `[BLOCKED] Approval for X moved to Approvals inbox` i turn se prekida (`chat-approval-hook.ts:36,95-105,283-301`; test `chat-approval-hook-characterization.test.ts:714`). `BLOCKED_CAPABILITY|BLOCKED_APPROVAL` grep = 0. [F-CAP-02, F-CAP-08, F-DUR-05]

**ADR-04-K3 (POTVRĐENO NA REVIZIJI).** OAuth: `routes/oauth.ts:64-65,138-139` `pendingStates: Map<state,{provider,createdAt}>` u memoriji, `state=randomBytes(24)`, **bez** run/session/workspace vezivanja; `:200-209` validira samo state; `:290-311` upisuje token u vault i vraća HTML „You can close this tab”. **Nema PKCE** (grep `pkce|code_challenge|code_verifier` u `packages/server/src` = 0). Nema internog događaja posle callback-a. [F-CAP-02]

**ADR-04-K4 (POTVRĐENO NA REVIZIJI).** `CapabilityProposalStore` (`routes/capability-proposals.ts:12-13,35`) je in-memory Map, TTL 10 min, max 256, scope `workspaceId+sessionId`, claim-once (`:232-268`; testovi `capability-proposals.test.ts` ×9) — dobar obrazac, ali ne preživi restart i nema pojam run-a. Marker capability zahteva je HTML komentar u tekstu tool rezultata (`capability-acquisition.ts:411-413`) parsiran regex-om (`capability-request-parser.ts:9,14`; `capability-proposals.ts:10-11`) — nije tipizovan SSE događaj; `CapabilityRequestCard.tsx:94-99` renderuje samo `starter-pack`/`marketplace`, connector/mcp → `return null`. [F-CAP-12]

**ADR-04-K5 (POTVRĐENO NA REVIZIJI).** Četiri engine-a bez fasade: `searchCapabilities` (`capability-acquisition.ts:187`; sort po `matchScore`, lane samo kroz `NATIVE_TOOL_HINTS`), `CapabilityRouter.resolve` (`capability-router.ts:62-170`; fiksni per-lane confidence native 1.0 → connector 0.75 → skill 0.7 → plugin 0.6 → mcp 0.45 → subagent 0.4; pozvan samo kao unknown-tool fallback `tool-executor.ts:143-151`), `scoreConnectors` (`routes/agent-search.ts:56`), marketplace FTS. Nijedan ne filtrira po dozvolama/egress/readonly/trust **pre** rangiranja; `capability-acquisition-trust.test.ts:126` zaključava „trust assessment does not change candidate scoring/ranking”. [F-CAP-01, F-CAP-11]

**ADR-04-K6 (DELIMIČNO/NEPOVEZANO).** Envelope slojevi postoje odvojeno, bez jednog ugovora: persona allowlist/read-only (`persona-tool-filter.ts:98-153`, pozvano `chat-turn-preparation.ts:454,530,553`); governance `blockedTools` **samo uz `wsConfig.teamId`** (`chat-turn-preparation.ts:694-738`; `chat-governance.ts:87-89` → Solo nema governance sloj); executor approval floor (`tool-executor.ts:129,160-226`); user policy = `ApprovalGrantStore` (`approval-grants.ts:172-304`; non-grantable `bash/run_code/cli_execute/install_capability` `:20-25`) + autonomy level (`confirmation.ts:337-358`). Resolver ne konsultuje nijedan. Tier: `requireTier` gate-uje rute, ne alate; akcijski `requiredTier` (`command-registry.ts:91,227-236`) ima 0 deskriptora → mrtav. [F-CAP-04, F-TK-17]

**ADR-04-K7 (POTVRĐENO NA REVIZIJI / VEĆ ZATVORENO).** Instalacioni put je već bounded: chat instalira samo `starter-pack` skill (`skill-tools.ts:521`, `capability-acquisition.ts:453-456`) i marketplace paket kroz server-issued proposal, oba iza `install_capability` ALWAYS_CONFIRM (`confirmation.ts:21`) + SecurityGate; MCP install ide kroz `/api/marketplace/install` sa `forceInsecure` iz klijentskog body-ja uz audit (`marketplace.ts:228,482-503`). Nema silent binary install-a. `THREAT_MODEL.md` postoji u korenu repoa (NALAZ AUDITA — ZA PROVERU, sopstvena read-only provera van phase-A, v. ADR-10 „Provenijencija anchora“: 175 linija, `c520bfb0` 2026-08-24; Controls + Known Gaps) — da li pokriva inline MCP/binary install granicu = ZA PROVERU (dopuna, P3/ADR-10-P6). Nedostaje: test „nema tajni u promptu/trace-u” (NEPOZNATO da li postoji; `installer-security.test.ts:825` pokriva provenance, ne prompt). [F-CAP-06]

**ADR-04-K8 (POTVRĐENO NA REVIZIJI).** Approvals gate: `dock-tiers.ts:82` `minBillingTier:'TEAMS'`, `AppShell.tsx:727-728`, `command-catalog.ts:89` — samo navigacija; `/approvals` ruta i `routes/approval.ts` nisu gate-ovani (`ApprovalsRoute.tsx:1-6` to eksplicitno kaže). Decline je one-shot: `resolve(false)` je na `chat-approval-hook.ts:81` (abort) i `:123` (timeout); korisnički deny putanja `:496-506` radi samo `sendEvent('step', …denied by user)` + audit `approval_denied` + `return { cancel: true, reason: 'User denied …' }`, ništa trajno — sledeći identičan poziv ponovo traži odobrenje (**korekcija anchora iz F-CAP-09:** citirani `:469-474` nije deny — na HEAD-u su to argumenti `sendEvent`/`signal` i početak `onHeld` timeout→held callback-a, koji je `:471-486`; usklađeno sa PRD-08-11); expiry/revoke postoje (`approval-grants.ts:111,233-246,286-292`). Approve/deny preko IM namerno „Not in v1” (`channels/manager.ts:30-31`; `docs/plans/CHANNELS-ARC-2026-07-09.md:23`). [F-CAP-07, F-CAP-09, F-CAP-10, F-TK-02]

**ADR-04-K9 (ODLUKA — D-09, D-10, D-17 · PREDLOG — SMER BRIEFA — DIR-11, DIR-12, brief §9.1).** ODLUKA: skills i konektori se koriste inline, a „inline” ne znači da se OAuth ili tajne obrađuju u LLM tekstu (D-10); tehnički agenti i MCP plumbing ostaju ispod površine (D-09); prvo postojeći Waggle, pa OSS, pa novo kodiranje (D-17). PREDLOG — SMER BRIEFA (planerski smer, ne korisnikovo odobrenje): jedan resolver ugovor, ne obavezno jedan veliki rewrite (DIR-11, brief §9.1); ista funkcionalnost kroz UI, agenta i rutinu (DIR-12).

## §2 — Odluka (predlog ugovora)

**ADR-04-O1 (PREDLOG) — definicija „inline” (brief §9.3).** Kartica u toku rada objašnjava šta nedostaje, zašto, potreban scope i posledicu. Tajna se unosi u zaštićeno polje kartice (api_key/bearer) ili se OAuth otvara u **sistemskom browseru** (loopback redirect, kao danas). Run je trajan (`BLOCKED_CAPABILITY`, ADR-02 O3). Posle validnog callback-a server emituje `SetupCompleted {requestId, runId, capabilityId}`; model **ne vidi token**; isti run nastavlja **samo** uz važeći grant i ponovnu proveru envelope-a (ADR-02 O2 korak 6). Zatvoren prozor, callback za drugi request, istekla saglasnost → nema nastavka.

**ADR-04-O2 (PREDLOG) — trajni `CapabilityRequest`.** Polja: `requestId`, `runId`, `workspaceId`, `sessionId`, `capability {kind: connector|skill|mcp|starter, id, authType}`, `scope[]`, `reason`, `status: proposed|awaiting_user|granted|declined|expired`, `expiresAt`. Persistira u run store (ADR-02), ne u memoriji; `CapabilityProposalStore` semantika (claim-once, scope, expiry) se **prenosi**, storage se menja. Tipizovan `RunEvent {type:'capability_request'}` zamenjuje HTML-komentar marker u prelaznom periodu (marker ostaje za backward-compat parsiranje dok W5 ne pređe na event).

**ADR-04-O3 (PREDLOG) — OAuth vezivanje.** `pendingStates` dobija `{requestId, runId, workspaceId, sessionId, codeVerifier?}` i persistenciju (preživi restart u granicama TTL-a); callback proverava `state` ↔ `requestId` ↔ run; PKCE gde provider podržava; callback origin/redirect allowlist ostaje loopback `127.0.0.1`; posle uspeha: token → vault (postojeće), `SetupCompleted` event, kartica prelazi u „Povezano — nastavljam”. Token nikad ne ulazi u `RunEvent`, prompt ili trace (ADR-10 test „no secrets in prompts/traces”).

**ADR-04-O4 (PREDLOG) — prvi obim (R11, R12).** G2 minimalni capability put = starter skills + **api_key/bearer konektori** inline (postojeći `POST /api/connectors/:id/connect`, `connectors.ts:118-142`, iza kartice). OAuth inline block-and-resume mehanizam se dokazuje na provajderu bez verifikacione prepreke; **Gmail/Outlook kroz Waggle-owned client zavisi od founder odluke R12 (= DQ-06, OAuth putanja prvog mail/calendar scenarija)** (BYO-client pilot ili verified client; Google restricted scopes → OAuth verifikacija + CASA, external.md §5). MCP binarne i remote-marketplace instalacije: resolve/propose inline, install u Settings uz SecurityGate; povratak na posao ne gubi intent (request ostaje `awaiting_user`).

**ADR-04-O5 (PREDLOG) — permission envelope kao presek, bez tier-a (A12 IZMENITI TIER DEO).** `PermissionEnvelope` = presek: (1) sistemski bezbednosni/egress limiti (ALWAYS_CONFIRM, non-grantable, critical-never-autopass), (2) KVARK policy/ACL **kad je konekcija živa** (ADR-08), (3) korisnički grantovi/decline-ovi (`ApprovalGrantStore` + negativni grant), (4) Workspace i persona/rola/read-only ograničenja (`applyPersonaToolFilter`), (5) sposobnosti konkretnog alata. Računa se jednom u `chat-turn-preparation` i prosleđuje i resolveru i executoru (isti izvor istine). **Tier nije sloj** (D-01; F-TK-17 mrtav `requiredTier` se uklanja). Resolver nikada ne proširuje dozvole; „mount silently” važi samo za već aktivne capabilities unutar envelope-a.

**ADR-04-O6 (PREDLOG) — resolver facade (DIR-11, C13 PRECIZIRATI).** `resolveCapabilities(need, envelope): CapabilityCandidate[]` — tanki sloj nad postojeća četiri engine-a: (1) `filterCandidates(envelope)` (dozvole, egress, readonly, raspoloživost, trust) **pre** rangiranja; (2) rang po task fit, pouzdanosti, setup i runtime trošku; (3) lane red native → skill → connector → plugin → mcp → subagent je **tie-breaker** među validnim kandidatima, ne prioritet. Engine-i se ne spajaju fizički.

**ADR-04-O7 (PREDLOG) — approvals su core za pojedinca (A15).** Ukloniti `minBillingTier:'TEAMS'` na 3 mesta (`dock-tiers.ts:82`, `AppShell.tsx:727-728`, `command-catalog.ts:89`); `BLOCKED_APPROVAL` kao trajno stanje run-a (ADR-02); decline dobija opcioni negativni grant u `ApprovalGrantStore` (isti `keyForTool`), proveren pre `pendingApprovals`; expiry/decline/revoke preživljavaju restart i **ne mogu** biti poništeni modelom, hook-om ni IM porukom (AT-12). Approve/deny iz IM kanala = G3/W8 uz one-time token po `actionId`, payload fingerprint, expiry (AT-25); slobodan tekst nije grant.

**ADR-04-O8 (PREDLOG) — shared actions (DIR-12, AT-18).** Za Waggle-ove sopstvene side-effect radnje isti typed action ugovor (ulazna šema, scope, side-effect klasa, validacija, approval, rezultat, audit, idempotency): proširiti postojeći `ACTION_REGISTRY` (`command-registry.ts:108-192`, danas samo NL command bar) da bude izvor istine za endpointe koje UI već koristi (`/api/connectors/:id/connect`, `/api/marketplace/install`); agent tool i held action već dele `ToolDefinition` (`held-action-executor.ts:213-233`) — to se zadržava. Agent ne potvrđuje sopstveno odobrenje. UI/browser automatizacija spoljnih aplikacija ostaje odvojena sposobnost.

## §3 — Šta zamenjuje i zašto

| Prethodno | Gde | Zašto |
|---|---|---|
| „never mid-run suspend/resume; the only suspend primitive is request-bound and restart-fatal” | `held-action-executor.ts:6-10`; `cron-store.ts:83-87` | Bila tačna dok run nije bio trajan; sa `DurableRun` (ADR-02) suspend primitiv postoji kao `BLOCKED_*` stanje, ne kao Promise. Held-action queue se **čuva** kao ToolAction obrazac; „nikad” se sužava na „nikad usred model turn-a/agent loop-a” (ADR-02 O4) |
| D3: OAuth → `open-in` Hub, nikad inline; turn se završi | `routes/agent-search.ts:76-80`; PR4 recon 04-inline-in-chat.md:205; test `agent-search.test.ts:44` | Ostaje tačno da OAuth **ne završava u chat tekstu**; menja se to da run ostaje blokiran i nastavlja posle callback-a. Test se prepisuje: `open-in` → `awaiting_user` kartica + browser, ne kraj posla |
| In-memory `pendingStates` bez run vezivanja, bez PKCE | `oauth.ts:64-65,138-139,200-209` | Callback za drugi run ne sme pokrenuti posao (AT-11); PKCE gde je primenljivo (brief §9.3) |
| S1 A12 precedence `governance > tier > persona > user policy > resolver` | S1 A12 | Tier nije individualna granica (D-01, brief §9.2); governance samo uz živ team/KVARK sloj |
| Lane red kao strogi prioritet (`CapabilityRouter` confidence) i čist score (`searchCapabilities`) | `capability-router.ts:62-170`; `capability-acquisition.ts:299-311` | Dva različita ponašanja, nijedno „permissions first” (C13) |
| Approvals iza TEAMS navigacije | `dock-tiers.ts:82` i dr. | D-01 (A15 PRIHVATITI) |

**ADR-04-Z1 (ODLUKA — ne otvara se).** D-10 (inline) i D-01 (bez paywall-a za approvals) se sprovode, ne odlučuju.

## §4 — Posledice

**ADR-04-P1 (PREDLOG).** Testovi koji se prepisuju: `agent-search.test.ts:44`; `capability-proposals.test.ts` (storage promena, semantika ista); `p7-a6-approval-gating.test.tsx` (nije čitan — ZA PROVERU); `chat-approval-hook-characterization.test.ts:714` ostaje (timeout → held) dok run ne postane durable.

**ADR-04-P2 (PREDLOG).** Persona prompt-budget testovi (`persona-acceptance-prompt-budget.test.ts`) mogu reagovati na novu karticu/instrukciju u promptu — receipt persona površina (A1).

**ADR-04-P3 (PREDLOG).** Dopuna postojećeg `THREAT_MODEL.md` za inline instalacije (A14; dokument postoji na `2af0904d`, dopuna = ADR-10 P6) + test da `buildSystemPrompt`/trace ne sadrže vault vrednosti povezanog konektora — deo ADR-10 profila.

**ADR-04-P4 (PREDLOG).** `hasCapability` (`tiers.ts:233-244`, 0 pozivalaca), `requiredTier`/`checkTier` (`command-registry.ts:91,227-236`), nekorišćen `requireTier` import (`fleet.ts:8`) — uklanjaju se ili ostaju van envelope ugovora (ADR-08 inventar).

**ADR-04-P5 (PREDLOG).** Hook read path (`hook-runtime.ts:237` vraća `temporary`) i taint oznake su ADR-05; ovde samo veza: envelope ne zavisi od scanner-a (A13 „scanner sam nije garancija”), zaštita policy/vault/send ostaje na approval floor-u (`tool-executor.ts:184-226`, `ALWAYS_CONFIRM`).

## §5 — Rizik

| ID | Rizik | V/U | Mitigacija |
|---|---|---|---|
| ADR-04-R1 | Callback za tuđi/istekli request nastavi run | niska / kritična | O3 state↔request↔run vezivanje, expiry; AT-11 |
| ADR-04-R2 | Google CASA/verification blokira Gmail OAuth nedeljama (spoljno) | visoka / srednja | O4: dokaz mehanizma na api_key + provider bez verifikacije; R12 founder odluka |
| ADR-04-R3 | Envelope presek previše restriktivan → resolver ne vraća ništa | srednja / niska | kandidat sa `blockedBy: [reason]` se prikazuje kao objašnjenje, ne sakriva |
| ADR-04-R4 | Chat hot path (`chat-turn-preparation`) dobija još jedan sloj | srednja / srednja | envelope se računa jednom po turnu; merenje latencije (ADR-01 O7) |
| ADR-04-R5 | Negativni grant („never allow”) zaključa korisnika van alata | niska / niska | revoke ruta postoji (`approval.ts:119-133`); UI lista grantova |
| ADR-04-R6 | `forceInsecure` iz klijentskog body-ja bez server-side potvrde | niska / visoka | server zahteva eksplicitan approval identitet za override (postojeći audit ostaje) — deo threat modela |

## §6 — Migration test

| ID | Test | Očekivanje | AT |
|---|---|---|---|
| ADR-04-T1 | Run zahteva api_key konektor → `BLOCKED_CAPABILITY` persistiran; korisnik unese ključ u karticu → `SetupCompleted` → **isti** `runId` nastavlja fazom | RED danas (turn se završi, nema stanja) | AT-11 |
| ADR-04-T2 | OAuth callback sa `state` drugog `requestId` → 4xx, nijedan run ne nastavlja; istekao request → isto | RED danas (state validiran, run ne postoji) | AT-11 |
| ADR-04-T3 | Restart sidecar-a tokom `awaiting_user` → request i run preživljavaju; callback posle restarta radi | RED danas (in-memory) | AT-11/AT-12 |
| ADR-04-T4 | Decline sa negativnim grantom preživi restart; model/hook/IM poruka „approve” ne menja odluku | RED danas (one-shot deny) | AT-12 |
| ADR-04-T5 | Read-only persona: resolver ne vraća write kandidata; `acquire_capability` ne predlaže write skill | RED danas (resolver ne zna envelope) | AT-17 |
| ADR-04-T6 | Postojeći instalirani skill se nađe i koristi bez odlaska u katalog; binarna MCP sposobnost se ne instalira bez Settings/SecurityGate toka | delimično zeleno (K7) | AT-17 |
| ADR-04-T7 | Ista side-effect radnja iz UI, agenta i rutine prolazi isti validation/approval ugovor; agent bez prečice | RED danas (tri puta, različit approval) | AT-18 |
| ADR-04-T8 | Injection u harvestovanom mejlu bez ključne reči skenera ne menja policy, ne izvlači vault, ne autorizuje slanje (approval floor test) | novi | AT-19 |
| ADR-04-T9 | Prompt/trace ne sadrži vault vrednost povezanog konektora | NEPOZNATO da li postoji → novi | AT-16 |
| ADR-04-T10 | Approvals nav vidljiv za FREE; ruta i API nepromenjeni | RED (nav) | AT-12 |

## §7 — Izvori

- **D:** D-01, D-09, D-10, D-17 · **DIR:** DIR-11, DIR-12 (brief §9.1–9.4) · **C/A/R:** C13, C14 (NOVI ADR), C16; A12 (IZMENITI TIER DEO), A13, A14, A15; R11, R12, R13 · **AT:** AT-11, AT-12, AT-16, AT-17, AT-18, AT-19, AT-25
- **Phase A:** `docs/plans/v1.2-evidence/phaseA/capability.md` §0, F-CAP-01..13; `docs/plans/v1.2-evidence/phaseA/tiers-kvark.md` F-TK-02, F-TK-17; `docs/plans/v1.2-evidence/phaseA/durable.md` F-DUR-05; `docs/plans/v1.2-evidence/phaseA/external.md` §5 (Gmail restricted scopes/CASA)
- **S1:** C13, C14, A12–A15, W4 · **Kod (na `2af0904d`):** `packages/server/src/local/routes/agent-search.ts:56,76-80,158`; `held-action-executor.ts:6-10,154-166,213-235`; `packages/core/src/cron-store.ts:83-88`; `routes/oauth.ts:64-65,138-139,200-209,290-311`; `routes/capability-proposals.ts:12-13,35,232-268`; `packages/agent/src/capability-acquisition.ts:187,299-311,411-413,453-456`; `capability-router.ts:62-170`; `tool-executor.ts:129,143-151,160-226`; `packages/server/src/local/persona-tool-filter.ts:98-153`; `routes/chat-turn-preparation.ts:454,530,553,694-738`; `routes/chat-governance.ts:87-89`; `approval-grants.ts:20-25,111,172-304`; `routes/chat-approval-hook.ts:36,81,95-105,123,283-301,471-486 (onHeld),496-506`; `command-registry.ts:91,108-192,227-236`; `apps/web/src/lib/dock-tiers.ts:82`; `apps/web/src/components/os/AppShell.tsx:727-728`; `apps/web/src/lib/command-catalog.ts:89`; `apps/web/src/components/os/apps/chat-blocks/CapabilityRequestCard.tsx:94-99`; `docs/redesign-warm-hive/pr4-recon/04-inline-in-chat.md:205`; `docs/plans/CHANNELS-ARC-2026-07-09.md:23`
