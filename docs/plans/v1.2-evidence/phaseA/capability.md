# Phase A — revalidacija grupe „capability" na `2af0904df01ca3d374cc78ba95b60dc579dd6a7a`

**Revizija:** `main = 2af0904df01ca3d374cc78ba95b60dc579dd6a7a` (`git rev-parse HEAD` potvrđen; `git status --porcelain` prikazuje samo dva untracked `.docx` u `docs/`, nijedan citirani fajl nije izmenjen — working tree == HEAD za sve navedene putanje).
**Datum:** 2026-09-27. **Metod:** read-only čitanje fajlova + `grep`/`rg` po capability-ju (ne po imenu), bez izvršavanja testova (nije dozvoljeno `npm ci`). Sve putanje su relativne u odnosu na `D:/Projects/waggle-os`.
**Obim (S1):** C13, C14, C16, A12–A15, W4; spot-check `dock-tiers.ts:82`, `cost.ts:210,272`; AT-11, AT-12, AT-17, AT-18, AT-19, AT-25.

> Statusi: **POTVRĐENO NA REVIZIJI** = tvrdnja S1 reprodukovana na ovoj reviziji čitanjem koda; **DELIMIČNO/NEPOVEZANO** = deo postoji, deo ne, ili postoji bez pozivaoca/ugovora; **VEĆ ZATVORENO** = S1 nalaz već rešen na HEAD-u; **NEPOZNATO** = nije provereno dovoljno. Ništa ispod nije rezultat izvršenog testa; „repro test" navodi *postojeći* test ili ograničenje provere.

---

## 0. Korekcija S1 referenci (pre svega)

| S1 citat | Stvarno na `2af0904d` |
|---|---|
| `agent-search.ts:81` „OAuth can't finish inline (D3)" | Fajl `apps/web/src/lib/agent-search.ts` ima 59 linija i ne sadrži taj komentar. Komentar je u **`packages/server/src/local/routes/agent-search.ts:79`** (`{ mode: 'open-in', appId: 'connectors' } // OAuth can't finish inline (D3)`). „D3" je oznaka iz PR4 recon tabele `docs/redesign-warm-hive/pr4-recon/04-inline-in-chat.md:205` („Token→vault on approve … the approval contract is boolean-only"), ne ADR. |
| `held-action-executor.ts:6-10` „never mid-run suspend/resume" | Potvrđeno doslovno: `packages/server/src/local/held-action-executor.ts:8-10`. |
| `dock-tiers.ts:82` Approvals TEAMS | Potvrđeno: `apps/web/src/lib/dock-tiers.ts:82` `minBillingTier: 'TEAMS'`. Isti gate i u `apps/web/src/components/os/AppShell.tsx:727-728` i `apps/web/src/lib/command-catalog.ts:89`. |
| `cost.ts:210,272` TEAMS | Potvrđeno: `packages/server/src/local/routes/cost.ts:210` (`/api/cost/by-workspace`) i `:272` (`/api/costs` alias) oba `requireTier('TEAMS')`; `/api/cost/summary` (`:85-88`) je namerno FREE. |

---

## 1. Nalazi (finding records)

### F-CAP-01 — C13: red lane-ova (native → … → marketplace) vs rangiranje
- **Tvrdnja S1:** FRD §6 daje strogi red lane-ova, a istovremeno „rank by task match"; nejasno da li je prioritet ili tie-breaker.
- **Status:** **POTVRĐENO NA REVIZIJI** (u kodu postoje *dva različita* ponašanja, nijedno nije „permissions first").
- **Putanja/simbol:**
  - `packages/agent/src/capability-acquisition.ts:299-311` `searchCapabilities()` — sortira po `matchScore` desc; tek ako je razlika ≤0.05 primenjuje `availabilityOrder` (active < installed_inactive < installable). Lane (native/skill/starter/marketplace) nije kriterijum osim kroz `NATIVE_TOOL_HINTS` score.
  - `packages/agent/src/capability-router.ts:62-170` `CapabilityRouter.resolve()` — fiksni per-lane confidence: native 1.0/0.8 → connector 0.75 → skill 0.7/0.5 → plugin 0.6 → mcp 0.45 → subagent 0.4; sort po confidence (tj. *strogi* lane red pod maskom skora).
  - `packages/server/src/local/routes/agent-search.ts:158` — spaja engine kandidate i connector lane samo po `matchScore`.
  - Ni jedan od tri engine-a ne filtrira po dozvolama/egress/readonly/trust *pre* rangiranja; `trust` se samo prikači (`capability-acquisition.ts:220,241,265,294`) i ne utiče na rang (test `capability-acquisition-trust.test.ts:126` to eksplicitno zaključava: „trust assessment does not change candidate scoring/ranking").
- **Ulaz:** `need = "send an email to the team"` uz konektovan Gmail i starter skill `email-drafting`.
- **Trenutni izlaz:** `searchCapabilities` → skill/starter po keyword skoru; `CapabilityRouter` → connector 0.75 iznad skill 0.7 bez obzira na fit; `agent-search` → merge po skoru. Tri odgovora za isto pitanje.
- **Repro test / ograničenje:** postojeći `packages/agent/tests/capability-acquisition.test.ts:131` („prefers native tools over installable skills when native matches well") i `capability-router.test.ts`; nema testa koji pokriva „permission-filter pre ranga".
- **Očekivano (brief §9.1, C13 PRECIZIRATI):** prvo filtrirati po dozvolama/egress/readonly/raspoloživosti/trust-u, zatim rangirati task fit; lane red je tie-breaker među validnim kandidatima.
- **Minimalna promena:** jedan `filterCandidates(envelope)` korak ispred `candidates.sort` u `searchCapabilities` (i isti korak u `agent-search` merge-u), plus test „read-only persona ne dobija write kandidata". Ne spajati engine-e fizički (brief DIR-11).
- **Povezani AT:** AT-17.

### F-CAP-02 — C14: „missing connector blokira inline i nastavlja isti run" vs D3 i held-action ADR
- **Tvrdnja S1:** FRD §6/§15 obećava inline block+resume; kod kaže OAuth ne može inline (D3) i „never mid-run suspend/resume".
- **Status:** **POTVRĐENO NA REVIZIJI** (uz korekciju putanje iz §0).
- **Putanja/simbol:**
  - `packages/server/src/local/routes/agent-search.ts:76-80` — OAuth konektor → `{ mode: 'open-in', appId: 'connectors' }`; api_key/bearer → `{ mode: 'store', extensionId: 'connector:<id>', kind: 'federated' }`.
  - `packages/server/src/local/held-action-executor.ts:6-10` — ADR: held action je self-contained `{tool,args}`, „execute-on-approve, never mid-run suspend/resume".
  - `packages/server/src/local/routes/oauth.ts:64-65,138-139` — `pendingStates: Map<state,{provider,createdAt}>` u memoriji; state je `randomBytes(24)`; **nema** run/session/workspace vezivanja; `:200-209` validira samo state; `:290-311` upisuje token u vault i vraća HTML „You can close this tab". Nema PKCE (`grep -i "pkce|code_challenge|code_verifier"` → 0 pogodaka u `packages/server/src`).
  - `packages/server/src/local/routes/capability-proposals.ts:12-13,35` — `CapabilityProposalStore` je `Map` u memoriji, TTL 10 min, max 256; vezan za `workspaceId+sessionId` (dobro), ali ne preživi restart i nema pojam run-a.
  - `grep -rn "BLOCKED_CAPABILITY|BLOCKED_APPROVAL"` u `packages/` i `apps/` → **0** pogodaka. Postojeći run status skup: `packages/shared/src/types.ts:398-402` (`…'waiting_for_approval'…'interrupted'`), `packages/server/src/local/agent-run-registry.ts:24-35`.
- **Ulaz:** agent u toku turn-a zaključi da mu treba Gmail (OAuth) konektor.
- **Trenutni izlaz:** nema server-side događaja; UI kartica `CapabilityRequestCard` renderuje samo `starter-pack`/`marketplace` (`apps/web/src/components/os/apps/chat-blocks/CapabilityRequestCard.tsx:94-99`); connector/mcp kind → `return null`. Korisnik ide u Connector Hub; posle OAuth callback-a nema signala nazad u chat/run; turn je već završen.
- **Repro test / ograničenje:** `packages/server/tests/routes/agent-search.test.ts:44` („routes an OAuth connector to the Hub (open-in), never an inline token") zaključava *trenutno* ponašanje; `capability-proposals.test.ts:100,114,171` zaključavaju scope/expiry/replay proposal-a. Nema testa za „callback za drugi request ne pokreće posao" jer mehanizam ne postoji.
- **Očekivano (brief §9.3, C14 NOVI ADR, DIR-04):** run postoji pre blokiranja; trajni capability request (run/request ID, alat, scope, stanje, rok); OAuth state/nonce vezan za pravi request, proveren server-side; SetupCompleted → isti run nastavlja samo uz važeći grant.
- **Minimalna promena (bez arhitekture):** (1) `pendingStates` dobija `requestId/workspaceId/sessionId` i persistenciju u isti store kao proposals; (2) callback emituje interni događaj umesto samo HTML-a; (3) superseding ADR za `held-action-executor.ts:6-10`. Ostalo zavisi od W1 (DurableRun).
- **Povezani AT:** AT-11, AT-12.

### F-CAP-03 — C16: „agenti skriveni" vs 22 persona izložene
- **Tvrdnja S1:** PRD kaže agents hidden; PersonaSwitcher i onboarding izlažu 22 persona.
- **Status:** **POTVRĐENO NA REVIZIJI** kao činjenica; **DELIMIČNO** kao „defekt" — brief §17 C16 kaže PRECIZIRATI (opciona razumljiva rola može ostati). Nije greška koda.
- **Putanja/simbol:** `packages/agent/src/persona-data.ts` — 23 `id:` unosa (22 korisničkih + `session-reviewer` interni). `apps/web/src/components/os/overlays/PersonaSwitcher.tsx:3,77-83,176-179` (UNIVERSAL_MODE_IDS + `getSpecialistsForTemplate` + fallback na ceo `PERSONAS`). `apps/web/src/components/os/overlays/onboarding/constants.ts:102,127-129` `ALL_ONBOARDING_PERSONAS` (3 tiera).
- **Ulaz/izlaz:** otvaranje PersonaSwitcher-a → dve grupe; onboarding → picker sa 19 (po CLAUDE.md §5).
- **Repro test / ograničenje:** UI testovi persona-tier postoje (CLAUDE.md §10 „26/26"); nisam ih izvršio.
- **Očekivano:** persona kao opciona „rola/mode" sa razumljivim copy-jem; tehnička konfiguracija skrivena; bez obaveznog izbora pre prvog posla.
- **Minimalna promena:** copy/IA odluka (W5), ne runtime.
- **Povezani AT:** —

### F-CAP-04 — A12: capability precedence envelope (governance > tier > persona > user policy > resolver)
- **Tvrdnja S1:** potreban je envelope; „mount silently" samo unutar njega.
- **Status:** **DELIMIČNO/NEPOVEZANO** — svi slojevi *osim tier-a* postoje kao odvojeni filteri, ali ne kao jedan ugovor; resolver ih ne čita. S1 „tier" stepenica ne postoji u tool filtriranju (i brief A12 kaže da je ne uvoditi).
- **Putanja/simbol (stvarni redosled u chat putu):**
  1. Persona allowlist/denylist/read-only: `packages/server/src/local/persona-tool-filter.ts:98-129` `applyPersonaToolFilter` (READ_ONLY_ALLOWED_TOOLS allowlist :72-88), `filterMcpToolsForPersona:145-153`; pozvano iz `packages/server/src/local/routes/chat-turn-preparation.ts:454,530,553`.
  2. Governance `blockedTools`: `chat-turn-preparation.ts:694-738` — **samo kad `wsConfig.teamId`**; `packages/server/src/local/routes/chat-governance.ts:87-89` vraća `{status:'none'}` bez team servera → Solo korisnik nema governance sloj. Turn se odbija ako je policy `unavailable/invalid` (:701-729).
  3. Executor defense-in-depth: `packages/agent/src/tool-executor.ts:129` governance block; `:160-182` `pre:tool` hook; `:184-226` approval floor (`needsConfirmation`/`isCriticalNeverAutopass` bez `authorize` → `[BLOCKED]`).
  4. „User policy" = samo `ApprovalGrantStore` (`packages/server/src/local/approval-grants.ts:172-304`, per (tool,targetKey,sourceWorkspaceId), non-grantable `bash/run_code/cli_execute/install_capability` :20-25) + autonomy level (`packages/agent/src/confirmation.ts:337-358`).
  5. Resolver (`searchCapabilities`, `CapabilityRouter`) — ne konsultuje 1–4 (v. F-CAP-01).
  - Tier: `packages/server/src/middleware/assert-tier.ts` `requireTier` gate-uje *rute* (cost, team), ne alate.
- **Ulaz:** read-only persona `planner` + kandidat `write_file`.
- **Trenutni izlaz:** alat je uklonjen iz serialized šeme (persona filter), ali `acquire_capability` bi i dalje mogao predložiti write-skill (resolver ne zna za persona ograničenje).
- **Repro test / ograničenje:** persona-tool-filter testovi (CLAUDE.md pominje), `chat-approval-hook-characterization.test.ts` (15 testova); nema testa koji vezuje resolver sa envelope-om.
- **Očekivano (brief §9.2):** presek sistemskih/egress, KVARK (kad je povezan), korisničkih grantova, workspace/rola/read-only, sposobnosti alata; resolver nikad ne proširuje dozvole.
- **Minimalna promena:** tipizovan `PermissionEnvelope` objekat izračunat u `chat-turn-preparation.ts` i prosleđen i resolveru i executor-u (isti izvor istine); bez novog policy engine-a.
- **Povezani AT:** AT-17, AT-18.

### F-CAP-05 — A13: prompt injection iz harvestovanog sadržaja (scan na ingest, taint, convert-to-work, hook read path)
- **Tvrdnja S1:** četiri podstavke.
- **Status po podstavci:**
  - (a) `scanForInjection` na ingestion — **VEĆ ZATVORENO.** `packages/hive-mind-core/src/harvest/pipeline.ts:108-142` Pass 0 `evaluateExternalMemoryIngress` (drop + log); `packages/server/src/local/connector-harvest.ts:189-191` scan pre `writeFrame`; `packages/hive-mind-core/src/harvest/extract-memory-lanes.ts:298` scan LLM izlaza; `extract-kg-entities.ts:172`. Guard dodaje normalizacione projekcije (`packages/hive-mind-core/src/memory-ingress-guard.ts:709-745`).
  - (b) taint by provenance — **NIJE POTVRĐENO** (ne postoji tipizovano polje). `grep -rn -i taint` → samo komentari u `extract-kg-entities.ts:19,137` i `extract-memory-lanes.ts:20,286`. Provenance se čuva kao `source` frame kolona, ne kao taint oznaka u kontekstu.
  - (c) convert-to-work bez spoljnog efekta — **N/A na ovoj reviziji**: `grep -rn -i "convert.?to.?work|WorkItem|toWorkItem"` u `packages/server/src` i `apps/web/src` → 0. Feature ne postoji (W7).
  - (d) hook read path skenira i isključuje `temporary` — **POTVRĐENO NA REVIZIJI kao rupa.** `packages/hive-mind-core/src/hook-runtime.ts:227-256` `recallHookFrames` čita `WHERE importance != 'deprecated'` (:237) → `temporary` frame-ovi (UserPromptSubmit, `packages/hive-mind-hooks-core/src/handlers-core.ts:148`) SE vraćaju hook-u; scan je na *write* strani (`hook-runtime.ts:191`), ne na read. Glavni app recall isključuje temporary (`packages/agent/src/orchestrator.ts:648` `excludeTemporary:true`, `:734`).
- **Ulaz:** hostile mejl/fajl sa `SYSTEM: ignore previous instructions` → (a) blokiran na ingest; varijanta bez ključne reči (AT-19) prolazi scanner (regex-only: `packages/hive-mind-core/src/injection-scanner.ts:22-56`).
- **Trenutni izlaz:** sadržaj ulazi u kontekst kao običan tekst; zaštita policy/vault/send *ne zavisi* od scannera nego od approval floor-a (`tool-executor.ts:184-226`) i `ALWAYS_CONFIRM` (`confirmation.ts:16-29`) — što je ispravno; nema testa koji to spaja (AT-19 „put bez detektovane ključne reči").
- **Repro test / ograničenje:** `packages/agent/tests/injection-scanner.test.ts`; `connector-harvest.test.ts`; nema testa za hook recall `temporary` exclusion.
- **Očekivano (brief §11.4, A13 „PRIHVATITI UZ OGRANIČENJE"):** scan + taint + provenance + permission boundary; scanner nije garancija.
- **Minimalna promena:** (d) `recallHookFrames` dodaje `AND importance != 'temporary'` (ili opt-in flag) + test; (b) `trust/taint` polje u budućem `ContextPackage` (W2), ne novi engine; AT-19 test bez ključne reči kroz approval floor.
- **Povezani AT:** AT-19, AT-14.

### F-CAP-06 — A14: threat model za inline MCP install + test „no secrets in prompts/traces"
- **Tvrdnja S1:** nedostaje threat model za inline binarne instalacije i test da nema tajni u promptu/trace-u.
- **Status:** **DELIMIČNO** — instalacioni put je već bounded (nema inline MCP/binary install-a iz chata), ali formalni threat-model dokument i „no secrets in prompts/traces" test nisu potvrđeni.
- **Putanja/simbol:**
  - Chat može instalirati samo `starter-pack` skill (`packages/agent/src/skill-tools.ts:521` → `validateInstallCandidate`, `capability-acquisition.ts:453-456` „Only starter-pack") i marketplace paket kroz server-issued proposal (`capability-proposals.ts:184-226`), oba iza `install_capability` ALWAYS_CONFIRM (`confirmation.ts:21`) i heuristics SecurityGate (`skill-tools.ts:540-560`).
  - MCP: `packages/server/src/local/routes/mcps.ts:227-301` → `/api/marketplace/install`; `packages/marketplace/src/installer.ts:392` `scanResult.blocked && !request.forceInsecure` → refuse; `forceInsecure` prihvaćen iz klijentskog body-ja (`marketplace.ts:228`, `mcps.ts:235`) uz audit (`marketplace.ts:482-503`, `mcps.ts:399-416`). MCP binari se pokreću kroz `packages/agent/src/mcp/mcp-runtime.ts:152-158` (`spawnSidecarOwnedProcess`).
  - Tajne: `packages/marketplace/tests/installer-security.test.ts:825` („secret-free provenance for a canonical MCP install"); connector tool rezultati su JSON iz `connector.execute` (`connector-registry.ts:198`), token nikad ne ulazi u args. Dedicated test „nema tajni u sistemskom promptu/trace-u" — **NEPOZNATO** (nisam našao po capability grep-u `secret.*prompt|redact.*trace` u testovima; nisam iscrpno pretražio).
- **Ulaz:** `POST /api/marketplace/install {packageId, forceInsecure:true}` na paket sa HIGH nalazom.
- **Trenutni izlaz:** instalira se uz audit zapis „SECURITY OVERRIDE"; nema dodatnog UI potvrđivanja specifičnog za override na serveru (klijent šalje flag).
- **Repro test / ograničenje:** `installer-security.test.ts` (40 testova, supply-chain), `capability-proposals.test.ts` (9).
- **Očekivano (brief §9.3 poslednji pasus, R11):** propose inline, install u Settings uz SecurityGate; bez silent binary install-a — **već važi**; treba ga *dokumentovati* kao threat model i dodati secrets test.
- **Minimalna promena:** ADR/threat-model dokument + jedan test koji asertuje da `buildSystemPrompt`/trace ne sadrže vault vrednosti za povezani konektor.
- **Povezani AT:** AT-17.

### F-CAP-07 — A15(a): Approvals iza TEAMS paywall-a; cost view TEAMS
- **Tvrdnja S1:** `dock-tiers.ts:82` gate-uje Approvals na TEAMS; `cost.ts:210,272` TEAMS.
- **Status:** **POTVRĐENO NA REVIZIJI.**
- **Putanja/simbol:** `apps/web/src/lib/dock-tiers.ts:81-82` (komentar „Pro gets inline chat approvals"); `apps/web/src/components/os/AppShell.tsx:727-728`; `apps/web/src/lib/command-catalog.ts:89`. Server: `packages/server/src/local/routes/approval.ts` **nije** tier-gated (nema `requireTier`); `/approvals` ruta postoji bez guard-a (`apps/web/src/App.tsx:150`). Cost: `cost.ts:210,272` `requireTier('TEAMS')`, `cost.ts:85-88` summary FREE.
- **Ulaz:** FREE (Solo) korisnik; held action nastane iz IM kanala (`APPROVAL_NEEDED_REPLY`) ili approval timeout `hold`.
- **Trenutni izlaz:** inline approval kartica radi (`apps/web/src/hooks/useChat.ts:846,1072`), ali **Approvals inbox nije u navigaciji** za Solo — held akcije čekaju u `pending_actions` bez vidljivog ulaza osim direktnog URL-a `/approvals` ili notifikacije `actionUrl:'/approvals'` (`held-action-executor.ts:96`).
- **Repro test / ograničenje:** `apps/web/src/test/p7-a6-approval-gating.test.tsx` (nisam čitao sadržaj); `approval-held.test.ts` pokriva server put.
- **Očekivano (D-01, brief §12.2, A15):** individualni approvals nisu iza paywall-a.
- **Minimalna promena:** ukloniti `minBillingTier:'TEAMS'` na tri mesta (dock-tiers, AppShell, command-catalog) + testovi; cost `requireTier('TEAMS')` na `:210,:272` prevesti u WB inventar (per-workspace cost je Solo funkcionalnost po briefu).
- **Povezani AT:** AT-12.

### F-CAP-08 — A15(b): persisted BLOCKED_APPROVAL
- **Tvrdnja S1:** potreban trajni blokirani run.
- **Status:** **DELIMIČNO/NEPOVEZANO** — trajno se čuva *tool call* (held action), ne run.
- **Putanja/simbol:** `packages/server/src/local/routes/chat-approval-hook.ts:36` `APPROVAL_HOLD_TTL_MS = 24h`; `:95-105` timeout `policy.action==='hold'` → `cronStore.savePendingAction`; `:283-301` `proposeHeldTurn` → `decideReviewTurnTool` → `{cancel:true}`; `held-action-executor.ts:29` 7-dnevni TTL za L2. Live approvals su `server.agentState.pendingApprovals` Map u memoriji (`approval.ts:33`). `waiting_for_approval` postoji samo za collaboration/fleet runove (`agent-run-registry.ts:24,35`, `fleet.ts:49`).
- **Ulaz:** gated tool u chatu, korisnik ne odgovori 300 s (`chat-approval-timeout.test.ts:68`).
- **Trenutni izlaz:** turn se prekida (`[BLOCKED] Approval for X moved to Approvals inbox`), akcija ostaje u inboxu; posle odobrenja `executeHeldAction` izvršava *samo taj alat* iz `buildToolsForWorkspace` (`held-action-executor.ts:213-233`), bez nastavka konverzacije/run-a.
- **Repro test / ograničenje:** `chat-approval-hook-characterization.test.ts:714` („moves an unanswered card to the Approvals inbox and blocks the live call"); `chat-approval-timeout.test.ts` (4).
- **Očekivano (brief §6.4, AT-12):** `BLOCKED_APPROVAL` kao trajno stanje run-a; decline/expiry/revoke preživi restart.
- **Minimalna promena:** zavisi od W1 store-a; do tada mapa `held action ↔ run` nije potrebna za G1 ako se jasno dokumentuje da je jedinica održivosti tool call.
- **Povezani AT:** AT-12, AT-11.

### F-CAP-09 — A15(c): expiry / decline / revoke semantika
- **Tvrdnja S1:** potrebne.
- **Status:** **VEĆ ZATVORENO (delimično)** — expiry i revoke postoje i testirani su; decline je one-shot (ne pamti se).
- **Putanja/simbol:** `held-action-executor.ts:159` atomic claim `held→approved`; `:163-166` expiry guard; `:191-202` re-validacija (allowlist, critical, injection) u trenutku izvršenja; `approval.ts:77-82` deny = `claimPendingAction(...,'denied')`; `approval-grants.ts:111,233-246` `expiresAt` + prune; `:286-292` `revoke`; `approval.ts:119-133` DELETE/clear rute. Live deny: `chat-approval-hook.ts:469-474` samo `resolve(false)` + audit `approval_denied`, ništa trajno.
- **Ulaz:** isti gated tool posle „Deny".
- **Trenutni izlaz:** sledeći identičan poziv ponovo traži odobrenje (nema „never allow" granta).
- **Repro test:** `held-action-executor.test.ts:187,198,292`; `approval-held.test.ts:302,313`; `approval-flow.test.ts:75`.
- **Očekivano:** decline sa opcionim trajanjem, model/hook/IM ga ne mogu poništiti.
- **Minimalna promena:** negativni grant u `ApprovalGrantStore` (isti `keyForTool`), proveren pre `pendingApprovals`.
- **Povezani AT:** AT-12.

### F-CAP-10 — A15(d): approve/deny iz IM kanala (zameniti `APPROVAL_NEEDED_REPLY`)
- **Tvrdnja S1:** IM ne može odobriti; treba zameniti.
- **Status:** **POTVRĐENO NA REVIZIJI** — namerno isključeno u v1 (kod + dokument).
- **Putanja/simbol:** `packages/server/src/local/channels/manager.ts:30-31` konstanta; `:265-275` upotreba; `packages/server/src/local/channels/chat-client.ts:11-13` „we do NOT approve over IM"; `docs/plans/CHANNELS-ARC-2026-07-09.md:23` „Tool approvals over IM — Not in v1". Pairing: `pairing.ts:95-123` single-use 8-znakovni kod, 10 min TTL, samo u memoriji; allowlist po `platform+senderId` (`:132`), persist u `channels.json`. Dedup po `platform:chatId:messageId` 24h u memoriji (`manager.ts:320-341`); rate limit 10/min (`:348-357`). `proposeHeld:true` (`manager.ts:261`) → gated proposable tool → held action (`chat-approval-hook.ts:283-301`), ne-proposable → deny.
- **Ulaz:** upareni Telegram korisnik pošalje „pošalji mejl X".
- **Trenutni izlaz:** `send_email` postaje held action; reply `APPROVAL_NEEDED_REPLY`; nema tokena/nonce-a koji bi vezao IM odgovor za akciju (mehanizam ne postoji, pa ni replay rizik tog tipa).
- **Repro test:** `channels-manager.test.ts:143` („replies with the approval message when the turn stalls on approval"), `:159` dedup, `:256` rate limit; `channels-pairing.test.ts` (13).
- **Očekivano (brief §11.6, AT-25):** potvrda vezana za run/action, payload fingerprint, expiry, jedinstven token; replay/forward ne daje grant; senderId sam nije dovoljan.
- **Minimalna promena:** kad se radi (G3/W8): potvrda kroz kratkotrajni one-time token po `pending_action.id`, proveren u `executeHeldAction` claim-u; ne kroz slobodan tekst.
- **Povezani AT:** AT-25, AT-12.

### F-CAP-11 — W4 „jedan resolver spaja 4 engine-a"
- **Tvrdnja S1:** postoje 4 engine-a.
- **Status:** **POTVRĐENO NA REVIZIJI** (najmanje 4, bez fasade).
- **Putanja/simbol:** (1) `searchCapabilities` `packages/agent/src/capability-acquisition.ts:187`; (2) `CapabilityRouter.resolve` `capability-router.ts:58` — pozvan samo kao unknown-tool fallback u `packages/agent/src/tool-executor.ts:143-151`; (3) `scoreConnectors` `routes/agent-search.ts:56`; (4) marketplace FTS `fastify.marketplace.search` (`agent-search.ts:132`, `skill-tools.ts:446-448` `deps.searchMarketplace`). Plus `find_connector` alat i SkillRecommender (`persona-tool-filter.ts:27-30` ALWAYS_AVAILABLE).
- **Ulaz/izlaz:** isti `need` daje različite liste (v. F-CAP-01).
- **Repro test:** `agent-search.test.ts:92,109` (three-up), `capability-router.test.ts`.
- **Očekivano (DIR-11):** zajednički interfejs, engine-i ostaju iza njega.
- **Minimalna promena:** tanki `resolveCapabilities(need, envelope)` facade koji poziva postojeće funkcije i vraća jedan `CapabilityCandidate[]`.
- **Povezani AT:** AT-17.

### F-CAP-12 — W4 „typed CapabilityRequest event + card varijante (api_key, OAuth)"
- **Tvrdnja S1:** nedostaju.
- **Status:** **POTVRĐENO NA REVIZIJI.**
- **Putanja/simbol:** marker je HTML komentar u tekstu tool rezultata (`capability-acquisition.ts:411-413`), parsiran regex-om na klijentu (`apps/web/src/components/os/apps/chat-blocks/capability-request-parser.ts:9,14`) i serveru (`capability-proposals.ts:10-11`, `chat-persistence.ts:26`); nije SSE tipizovan događaj. `CapabilityRequest` tip (`CapabilityRequestCard.tsx:8-30`) ima `connectorId/authType` označene „Reserved … not authorized". Kartica renderuje samo starter/marketplace (`:94-99`). Behavioral spec zabranjuje modelu da fabrikuje marker (`packages/agent/src/behavioral-spec.ts:303-317`).
- **Ulaz:** api_key konektor kao kandidat.
- **Trenutni izlaz:** `agent-search` vraća `install.mode:'store'` za FE suggestion box, ali chat kartica to ne renderuje; korisnik ide u Hub.
- **Repro test:** `capability-proposals.test.ts:41,59,73`; `apps/web/src/test/pr4-agent-search.test.tsx`.
- **Očekivano (brief §9.3):** kartica objašnjava šta/zašto/scope; tajna u zaštićeno polje; OAuth u sistemskom browseru.
- **Minimalna promena:** proširiti postojeći server-issued proposal (`CapabilityProposalStore.issue`) na `kind:'connector'` sa `authType`, pa karticu za api_key koja poziva postojeći `POST /api/connectors/:id/connect` (`packages/server/src/local/routes/connectors.ts:118-142`).
- **Povezani AT:** AT-11, AT-17.

### F-CAP-13 — W4 / DIR-12: shared action registry (UI, agent, rutina isti ugovor)
- **Tvrdnja S1 / pitanje zadatka:** postoji li tipizovan action registry?
- **Status:** **DELIMIČNO/NEPOVEZANO** — postoji zatvoren registry, ali samo za NL command bar; agent/UI/rutina imaju tri puta, delimično deljena.
- **Putanja/simbol:** `packages/server/src/local/command-registry.ts:108-181` `ACTION_REGISTRY` (4 akcije: `open_app`, `open_workspace`, `create_workspace`, `install_mcp`; `sideEffect`, `riskLevel`, `build()`), `:192` `validateAndBuildAction`; jedini pozivalac `packages/server/src/local/command-interpret.ts:17,93,135` → `routes/command.ts`; UI potvrda za `sideEffect` u `apps/web/src/components/os/overlays/CommandCenter.tsx:94,538`. Agent: `ToolDefinition` (`packages/agent/src/tools.ts`) + approval hook. Rutina/held: `held-action-executor.ts:213-233` re-materializuje *isti* `ToolDefinition` iz `buildToolsForWorkspace` (agent i rutina dele ugovor za proposable alate). UI klikovi idu direktno na REST (`/api/connectors/:id/connect`, `/api/marketplace/install`) bez registry-ja.
- **Ulaz:** „instaliraj MCP X" iz command bara vs iz chata vs iz Marketplace UI.
- **Trenutni izlaz:** tri ulazna puta, jedan zajednički server endpoint (`/api/mcps/install` → `/api/marketplace/install`) — validacija i SecurityGate su na endpointu (dobro), ali approval semantika različita (UI klik vs CommandCenter modal vs chat kartica).
- **Repro test / ograničenje:** `packages/server/tests/local/command-registry*.test.ts` (nisam otvarao); `held-action-executor.test.ts:140,158`.
- **Očekivano (DIR-12, AT-18):** ista ulazna šema/scope/side-effect klasa/approval/audit/idempotency; agent bez prečice oko potvrde.
- **Minimalna promena:** ne novi engine; proširiti `ActionDescriptor` da bude izvor istine za side-effect endpointe koje UI već koristi, i navesti u ADR-u da agent tool + held action već dele `ToolDefinition`.
- **Povezani AT:** AT-18.

---

## 2. Šta već radi / postoji (existingAssetsToPreserve) — pozivaoci potvrđeni grep-om

| # | Šta | Putanja | Pozivaoci / testovi |
|---|---|---|---|
| 1 | `searchCapabilities`, `validateInstallCandidate`, `CapabilityCandidate`/`AcquisitionProposal` tipovi | `packages/agent/src/capability-acquisition.ts:187,447` | `packages/agent/src/skill-tools.ts:13,454,521`; `packages/server/src/local/routes/agent-search.ts:11,143`; testovi `packages/agent/tests/capability-acquisition.test.ts` (20), `capability-acquisition-trust.test.ts` (13) |
| 2 | `CapabilityRouter.resolve` (unknown-tool fallback) | `packages/agent/src/capability-router.ts:51-186` | `packages/agent/src/tool-executor.ts:143-151`; `packages/agent/tests/capability-router.test.ts` |
| 3 | `MarketplaceInstaller` + `SecurityGate` (blocked → refuse bez `forceInsecure`, approval identity, provenance) | `packages/marketplace/src/installer.ts:109-118,392`; `packages/marketplace/src/security.ts` | `packages/server/src/local/routes/marketplace.ts:420-432`; `routes/mcps.ts:227-301`; `routes/capability-proposals.ts:105-116`; `packages/agent/src/skill-tools.ts:540-560`; `packages/marketplace/tests/installer-security.test.ts` (40) |
| 4 | Server-issued scoped `CapabilityProposalStore` + `POST /api/capability-proposals/:id/confirm` (claim-once, expiry, ws/session scope) | `packages/server/src/local/routes/capability-proposals.ts:35-101,232-268` | `apps/web/src/providers/InstallProvider.tsx:104` → `CapabilityRequestCard.tsx:108`; `packages/server/tests/local/capability-proposals.test.ts` (9) |
| 5 | `ConnectorRegistry` (vault-hydrated, `connector_<id>_<action>` alati, audit log) | `packages/agent/src/connector-registry.ts:24-212` | `routes/agent-search.ts:157`; `routes/connectors.ts`; `held-action-executor.ts:221-224` (send_email alias); `packages/server/tests/local/connector-registry-integration.test.ts` |
| 6 | Approval stack: `createChatApprovalHook`/`waitForApprovalDecision`, `/api/approval/*`, `ApprovalGrantStore`, `enqueueHeldAction`/`executeHeldAction`/`decideReviewTurnTool`, `needsConfirmation`/`isCriticalNeverAutopass`/`needsConfirmationWithAutonomy`/`classifyGatedToolRisk`, executor approval floor | `packages/server/src/local/routes/chat-approval-hook.ts`; `routes/approval.ts`; `approval-grants.ts`; `held-action-executor.ts`; `packages/agent/src/confirmation.ts`; `packages/agent/src/tool-executor.ts:184-226` | testovi: `routes/approval-flow.test.ts` (4), `local/approval-held.test.ts` (14), `local/held-action-executor.test.ts` (18), `local/chat-approval-timeout.test.ts` (4), `local/chat-approval-hook-characterization.test.ts` (15) |
| 7 | `InstallAuditStore` (install_audit tabela, governance schema) | `packages/core/src/install-audit.ts:67-143` | `skill-tools.ts` (`deps.auditStore.record`); `routes/marketplace.ts:482-503`; `routes/mcps.ts:399-416`; testovi `packages/core/tests/install-audit*.test.ts` |
| 8 | `assessTrust`/`deriveApprovalClass`/`formatTrustSummary` | `packages/agent/src/trust-model.ts:203,345,420` | `capability-acquisition.ts:14`; `chat-approval-hook.ts:24,378`; `confirmation.ts:9`; `packages/agent/tests/trust-model.test.ts` |
| 9 | Persona tool policy `applyPersonaToolFilter`/`filterMcpToolsForPersona` (allowlist + READ_ONLY allowlist) | `packages/server/src/local/persona-tool-filter.ts:98-153` | `routes/chat-turn-preparation.ts:454,530,553` |
| 10 | Governance `blockedTools` lanac (team-only) | `routes/chat-governance.ts:73-134` → `chat-turn-preparation.ts:694-738` → `tool-executor.ts:129` → `packages/agent/src/subagent-orchestrator.ts:429-456` | fail-closed na `unavailable/invalid` (`chat-turn-preparation.ts:701-729`) |
| 11 | IM kanali: `ChannelManager` (deny-by-default, `/pair`, dedup, rate limit, `proposeHeld`), `PairingStore`, `runChannelChatTurn` | `packages/server/src/local/channels/{manager,pairing,chat-client,routes}.ts` | `packages/server/tests/channels-manager.test.ts` (22), `channels-pairing.test.ts` (13) |
| 12 | Injection defense: `scanForInjection` + `evaluateExternalMemoryIngress` (normalizacija) | `packages/hive-mind-core/src/injection-scanner.ts:59`; `memory-ingress-guard.ts:709` | `harvest/pipeline.ts:108-142`; `connector-harvest.ts:191`; `tool-executor.ts:48`; `routes/chat.ts:786`; `chat-turn-preparation.ts:242,471,652`; `orchestrator.ts:479,924`; `held-action-executor.ts:77,199`; `mcp/mcp-runtime.ts:529`; `skill-audit.ts:265,304,350`; `hook-runtime.ts:191` (write); `packages/agent/tests/injection-scanner.test.ts` |
| 13 | Zatvoreni `ACTION_REGISTRY` + `validateAndBuildAction` (NL command bar) | `packages/server/src/local/command-registry.ts:108-192` | `command-interpret.ts:17,93,135` → `routes/command.ts:213`; `CommandCenter.tsx:538` approval za `sideEffect` |
| 14 | OAuth loopback rute (CSRF `state`, 127.0.0.1 redirect, vault upis, escaping) | `packages/server/src/local/routes/oauth.ts:64-71,137-150,200-209,290-311` | `packages/server/tests/local/oauth-callback-escaping.test.ts` (2); **bez PKCE i bez run vezivanja** (F-CAP-02) |
| 15 | `CapabilityRequestCard` + `segmentText` parser (strogi marketplace identity ugovor) | `apps/web/src/components/os/apps/chat-blocks/{CapabilityRequestCard.tsx,capability-request-parser.ts}` | `chat-blocks/TextBlock.tsx`; `apps/web/src/test/pr4-agent-search.test.tsx` |
| 16 | `install_capability` alat (starter-pack only, path traversal guard, heuristics SecurityGate, audit, non-grantable) | `packages/agent/src/skill-tools.ts:484-580`; `approval-grants.ts:20-25` | `behavioral-spec.ts:291-317`; `persona-tool-filter.ts:28` |

---

## 3. Napomene

1. **S1 putanja `agent-search.ts:81` je pogrešna** (v. §0) — ista tvrdnja stoji, ali na `packages/server/src/local/routes/agent-search.ts:79`.
2. **Konektori nisu paywall-ovani**: `getCapabilities(tier).connectorLimit === -1` na svim tierovima (`packages/server/tests/routes/connectors-tier.test.ts:13-29`, `packages/shared/src/tiers.ts:62,83,104,125`). WB inventar za ovu grupu = Approvals nav (3 mesta) + `cost.ts:210,272`.
3. **Governance je isključivo team-server sloj** (`chat-governance.ts:87-89`); za Solo korisnika „envelope" = persona filter + approval floor + grantovi. Ne treba ga premeštati u A12 „tier" stepenicu.
4. **Approval-over-IM je dokumentovana odluka „Not in v1"** (`docs/plans/CHANNELS-ARC-2026-07-09.md:23`), ne propust; AT-25 je nova obaveza za G3.
5. **Hook read path vraća `temporary` frame-ove** (`hook-runtime.ts:237`) — jedina nova konkretna rupa u A13 na ovoj reviziji; ostalo iz A13(a) je već zatvoreno.
6. Ništa od navedenog nije izvršeno kao test u ovoj sesiji (repo READ-ONLY, bez `npm ci`); brojevi testova su prebrojani `grep`-om po `it(`.
7. Nisam predlagao arhitekturu; „minimalna promena" je najmanji zahvat koji zatvara S1 tvrdnju i ostavlja W1/W2 ugovore piscima.
