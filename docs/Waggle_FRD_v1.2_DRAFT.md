# Waggle — Functional Requirements Document (FRD) v1.2 DRAFT

**Revizija dokumenta: 1.2 DRAFT · 27.09.2026 · pregledana revizija koda 2af0904df01ca3d374cc78ba95b60dc579dd6a7a**

**DOCX izvoz (brief §20.1 traži `.md` + DOCX):** isporučeno 28.09.2026 — `Waggle_FRD_v1.2_DRAFT.docx` (i `Waggle_PRD_v1.2_DRAFT.docx`) u `docs/`, generisan iz ovog `.md` komandom `pandoc -f gfm-tex_math_dollars-tex_math_gfm Waggle_FRD_v1.2_DRAFT.md -o Waggle_FRD_v1.2_DRAFT.docx` (`pandoc 3.9` na hostu; izvor je pisan kao GFM; `$` matematika isključena da iznosi kao „$49/seat” ostanu tekst). `.md` ostaje izvor istine; SHA-256 oba `.md` i oba `.docx` upisani su u `plans/WAGGLE-DELIVERY-PLAN-v1.2.md` §6.1 i u OD-9 `plans/WAGGLE-AUDIT-DISPOSITION-v1.2.md` §5 (heš `.md` fajla ne može stajati u samom fajlu). Svaka kasnija izmena ovog `.md` čini DOCX zastarelim: pre predaje se heš proverava i izvoz ponavlja istom komandom. — POTVRĐENO na hostu (28.09.2026; svojstvo paketa, ne revizije koda).

> Implementacioni ugovori za dogovoreni Waggle mentalni model (brief §4). Ovo je nacrt: nijedan ugovor ispod nije implementiran, odobren za implementaciju niti verifikovan testom, osim tamo gde je red označen **POTVRĐENO NA REVIZIJI** (postojeće ponašanje pročitano na `2af0904d`) ili **VEĆ ZATVORENO** (S1 tvrdnja već rešena na toj reviziji). Radna osnova isporuke je **G1 → G2 → G3** (brief §5.1); opcija „ship current main first” iz S1 §5 nije osnova ovog dokumenta.
>
> **Konvencija statusa (obavezna na svakoj tvrdnji; usklađena sa PRD v1.2 „Način čitanja”):** ODLUKA (**samo** eksplicitne odluke korisnika D-01..D-18 iz brief §3; ne otvara se ponovo; zabrane iz DIR-01 su granica ovlašćenja ovog prolaza, ne proizvodni smer) · ISTORIJSKA FOUNDER ODLUKA (memorija, datum) — usklađena sa D-xx / smerom briefa (founder zapis iz projektne memorije pre 27.09.2026 — „L2 assist stays TOOLLESS” 2026-06-29 → brief §11.5/C15; izolacija personal/workspace minds 2026-06-12 → D-12; brief §2.1 i §21: nije D autoritet, važi samo kroz naveden D ili brief osnov) · PREDLOG — SMER BRIEFA (DIR-nn / §17 Cn / §18 An / §19 Rn / brief §k: planerski smer ili razrešenje autora briefa usvojeno kao radna osnova nacrta; brief §1 i §2.1 red P ga ne svrstavaju u odluke korisnika, pa se **nikad** ne označava kao ODLUKA — ranija oznaka „ODLUKA (DIR/C/A/R/brief §)” ukinuta je ovim prolazom) · POTVRĐENO NA REVIZIJI (pročitano na `2af0904d`, radno stablo == HEAD) · NALAZ AUDITA — ZA PROVERU (tvrdnja iz S1/faze A koja traži izvršenje/repro) · DELIMIČNO/NEPOVEZANO (postoji, ali nije povezano ili pokriva deo) · PREDLOG (predloženi ugovor, nije odobren) · ODLOŽENO · NEPOZNATO · VEĆ ZATVORENO.
>
> **Konvencija ID-eva:** `FRD-<sekcija>.<redni>` (npr. `FRD-02.4`). Reference na nalaze faze A: `F-HARN-*`, `F-DUR-*`, `F-HM-*`, `F-EVO-*`, `F-CAP-*`, `F-UXM-*`, `F-TK-*`, `F-REL-*`, `EXT-*` (external.md §0 redni broj). Sve `path:line` reference su na reviziji `2af0904d`; faza A je potvrdila `git status --porcelain` = samo dva untracked `.docx` u `docs/`, dakle radno stablo == HEAD za svaki citirani fajl. Putanje ispravljene po refute prolazu (npr. `system-tools.ts`, `tool-executor.ts` su u `packages/agent/src/`, ne u `packages/server/src/local/`; `budgetStopResponse` je `packages/agent/src/agent-loop.ts:895`).
>
> **Datumska aritmetika:** 12–17 kalendarskih nedelja od 27.09.2026 = **20.12.2026–24.01.2027** (brief §15.2). Ovaj FRD ne daje procenu; procena je u Delivery planu.

---

## Sadržaj

1. Slojevi i granice
2. Ugovori podataka (+ mapa kompatibilnosti sa postojećim tipovima)
3. Redosled nastanka run-a (8 koraka)
4. State machine, lease i fencing
5. Harness engine: gates, server-observed evidence, budget stop, CONDITIONAL politika
6. Capability resolver i permission envelope
7. Hive Mind kontekstna petlja
8. Evolution pipeline
9. Attention / WorkItem i Routines
10. Model readiness i hardware ladder
11. Površine: desktop, IM companion, worker granica
12. Bezbednost, privatnost, egress
13. Observability i benchmark manifest
14. Migracije (pokazivač)
15. Acceptance testovi AT-01..AT-30
16. Traceability PRD → FRD
Izvori

---

## 1. Slojevi i granice

Slojevi su isti kao u FRD v1.1 §1, ali svaki red sada nosi stanje na reviziji i ono što se u v1.2 menja. „Sloj postoji” nije dokaz E2E funkcije.

| ID | Sloj | Stanje na `2af0904d` | Šta v1.2 ugovara | Status |
|---|---|---|---|---|
| FRD-01.1 | **Korisnički sloj:** Home (What Needs Me / My Work / Routines / Ask Waggle), Workspace (sesije/tabovi, fajlovi, memorija, artefakti, dugi rad), Memory Center, Settings/Advanced | `HomeCockpit.tsx:902-1046` ima AskBar, RecallStrip, StartHere, OvernightHero, „Pick up where you left off”; **nema** Routines bloka ni jedinstvene WorkItem liste (F-UXM-13). Sidebar je dvoslojan, ali „New Agent” je vidljiv na svakom tier-u i ⌘K „Power tools” nisu tier-gated (F-UXM-08/15). | Čuvati postojeće komponente (D-07, DIR-16); dopuniti Routines blok nad postojećim `CronStore`/`/api/automations`; Work Progress kao proširenje SSE `step` kanala (§11). Bez novog UI rewrite-a. | ODLUKA (D-07, D-08, D-09) + POTVRĐENO NA REVIZIJI (stanje) + PREDLOG (dopune) |
| FRD-01.2 | **Izvršni sloj:** klasifikacija posla, izbor recipe/version, harness engine, durable run engine, proof-of-done | `detectTaskShape` (`task-shape.ts:145`) radi, ali ne bira harness; harness bira model kroz `run_harness`/`compose_workflow` tekst (F-HARN-09); nema server-driven phase executor-a (F-DUR-13); `activeHarnessRuns` je in-memory Map (`workflow-tools.ts:447`). | Server postaje autoritet za: run identitet, izbor recipe-a, faze, gates, checkpoint, proof (DIR-04/05/07). Model predaje samo `content`. | POTVRĐENO NA REVIZIJI (stanje) + PREDLOG (ugovor) |
| FRD-01.3 | **Sloj sposobnosti:** native tools, skills (active/inactive/starter/marketplace), konektori, MCP | Najmanje 4 nezavisna engine-a bez fasade (F-CAP-11); nijedan ne filtrira po dozvolama pre rangiranja (F-CAP-01). Install put je već bounded: starter-pack i marketplace proposal iza `install_capability` ALWAYS_CONFIRM + SecurityGate (F-CAP-06). | Jedan resolver **ugovor** (facade), ne fizičko spajanje engine-a (DIR-11); permissions prvo, lane red kao tie-breaker (§6). | POTVRĐENO NA REVIZIJI + PREDLOG |
| FRD-01.4 | **Memorijski sloj:** Hive Mind (`recallMemory` 7 lane-ova + RAWDETAIL), hookovi, memory MCP, Weaver, extraction | `orchestrator.ts:582-978` engine postoji i ima pin testove (F-HM-09); nula pojavljivanja `ContextPackage`/`ContextBuilder`/`WAGGLE_CONTEXT_INJECTED` (F-HM-08); 4 mesta upisuju workspace run sažetak u personal mind (F-HM-05). | Omotati postojeći retrieval tipizovanim `ContextPackage` ugovorom bez novog engine-a (DIR-09, D-12); zatvoriti izolaciju; snapshot ne nadjačava brisanje. | ODLUKA (D-12) + POTVRĐENO NA REVIZIJI + PREDLOG |
| FRD-01.5 | **Sloj stanja (execution state):** runovi, checkpoints, retries, grants, leases, budžeti | `agent-runs.json` whole-file JSON store (F-DUR-02); `pending_actions` SQLite tabela (F-DUR-05); cron leases bez fencing-a (F-DUR-10); Loop cross-tick state u Awareness sloju personal `.mind` i **ulazi u recall** kroz `toContext()` (F-DUR-09, refute HOLDS+). | Kanonski run store odvojen od semantičke memorije (brief §8.2). Izbor store-a (SQLite `runs.db` vs postojeći) prolazi Build-vs-Borrow (§14, A8, EXT-7: nema drop-in engine-a; Reflow je najbliži, bus factor 1). | POTVRĐENO NA REVIZIJI + PREDLOG (store = ADR (2)) |
| FRD-01.6 | **Granica KVARK-a:** organizacioni svet dolazi povezivanjem, bez prelivanja lične memorije | `createKvarkTools` 0 produkcijskih pozivalaca; `KvarkClient` se nigde ne instancira; `kvark:connection` se samo čita; Settings polja bez handlera; gate na `tier === 'ENTERPRISE'` umesto na konekciju (F-TK-11). `handleKvarkError` nema cloud fallback (F-TK-12, dobro za D-03). | Connect/validate/revoke ugovor; gate na živu konekciju; no-sharing default (§11, §12). Nije Waggle Team SKU (D-02). | ODLUKA (D-02, D-03) + POTVRĐENO NA REVIZIJI + PREDLOG |
| FRD-01.7 | **Presečni slojevi:** permissions/provenance na svakoj radnji; observability; learning/evolution kao predlagač proverenih izmena | Approval stack postoji i testiran je (F-CAP §2 red 6); `HarnessTraceBridge` piše `verified` za svaku završenu fazu (F-HARN-06); evolution deploy persona override je zasenčen (F-EVO-01). | Tri nivoa provere (§5.4), qualification tragova (§13), active-version pointer (§8). | POTVRĐENO NA REVIZIJI + PREDLOG |
| FRD-01.8 | **Režimi:** vrsta interakcije `conversation`/`work` × režim izvršenja `normal`/`strict`/`benchmark` (DIR-03) | Ne postoji eksplicitan režim; `detectTaskShape.complexity === 'simple'` se koristi samo za jednu proveru u `chat.ts:746` (F-HARN-09). | Režim je polje `DurableRun.mode` (§2) i **nikada ne proširuje dozvole**; latency budžet po task shape-u se meri, ne pretpostavlja (brief §6.1). Konkretni pragovi: NEPOZNATO do baseline merenja. | PREDLOG — SMER BRIEFA (DIR-03) + PREDLOG |

**FRD-01.9 — Šta ovaj FRD ne ugovara:** Fusion/council/5-hats — ODLUKA (D-16); nova mobilna aplikacija, svi mail/chat ekosistemi, proizvoljna graph/topology evolucija, veliki coding program i potpuno preuređenje Team servera — PREDLOG — SMER BRIEFA (§5.2; planerski smer, ne odluka korisnika — D-16 pokriva samo Fusion). Native coding put se čuva i **kvalifikuje** (C17 „OČUVATI, KVALIFIKOVATI”, R06) — POTVRĐENO NA REVIZIJI: native `code-review-fix` harness postoji (`packages/agent/src/builtin-harnesses.ts:138` `id: 'code-review-fix'`, faze understand → review → fix → verify), a njegov verify gate prolazi na **bilo koji** `bash`/`run_command` poziv bez čitanja exit code-a (`builtin-harnesses.ts:181` `hasToolCalls(output, ['bash','Bash','run_command'], 1)`; F-HARN-03, AT-02, W0-PR3; isto stanje navode PRD-04-03, FRD-05.2 i dispozicija C17/R06). E2E **kvalitet** native i external (Claude Code/Codex/Hermes preko route-proposals) coding putanje = NEPOZNATO (nije izvršen u fazi A; javno coding poređenje tek posle KW studije, R06).

---

## 2. Ugovori podataka

Sva polja ispod su **PREDLOG ugovora** (brief §6.3), osim gde je red označen kao postojeći tip. Nazivi su prilagođeni postojećim simbolima gde postoje; mapa kompatibilnosti je u §2.12. Nijedan payload ne sme sadržati tajne (brief §6.3, RunEvent).

### FRD-02.1 — `DurableRun` — PREDLOG

| Polje | Tip / semantika | Napomena kompatibilnosti |
|---|---|---|
| `runId` | stabilan UUID, kreiran pre bilo kog side effect-a (§3 korak 3) | `CollaborationRun.id` iz `AgentRunRegistry` je postojeći kandidat za isti identitet; harness `run_id` iz `workflow-tools.ts:374` danas nastaje **posle** klasifikacije, in-memory (F-HARN-07, F-DUR-13) |
| `workspaceId`, `sessionId` | obavezni; personal scope = eksplicitna vrednost, ne `null` default | `external-tool-runs.ts:964-977` i još 3 mesta danas pišu u personal bez eksplicitnog scope-a (F-HM-05) |
| `requestFingerprint` | hash (user, workspace, normalizovan intent, izvorni kanal, occurrence id ako je rutina) | sprečava duplo kreiranje run-a pri retry-ju klijenta; **nije** ključ deduplikacije spoljnih radnji (to je `actionId`, §2.4) |
| `interaction` | `'conversation' \| 'work'` | DIR-03 |
| `mode` | `'normal' \| 'strict' \| 'benchmark'` | nikad ne proširuje dozvole (brief §6.1) |
| `status` | kanonski (§4.1) | mapa na `CollaborationRunStatus` u §2.12 |
| `recipeId`, `recipeVersion` | referenca na `HarnessRecipeVersion` (§2.11) | postojeći `harnessId` (`builtin-harnesses.ts`) je šablon, ne verzija |
| `modelRef`, `runtimeRef` | `{ provider, modelId, quant?, runtimeVersion? }` zapisan pri kreiranju; pinovan za život run-a | AT-04 „postojeći run ostaje na pinned verziji” |
| `budget` | `{ limit: { tokens?, usd?, wallClockMs? }, spent: { tokens, usd, wallClockMs } }` | `spent` se čuva u svakom Checkpoint-u (A10, F-DUR-07: danas per-run metrics ulaze u registry tek na kraju, `fleet-run-executor.ts:746-766`) |
| `permissionEnvelope` | snapshot preseka ograničenja (§6.2) pri kreiranju + verzija | ponovo se izračunava posle grant-a (§3 korak 6) |
| `contextRef` | `{ packageId, version, hash }` → `ContextPackage` (§2.7) | jedina trajna referenca konteksta danas je `briefHash` u `attribution` (F-HM-18) |
| `cursor` | `{ phaseId, attemptNo, lastCheckpointId }` | `HarnessRunState.currentPhase` (`workflow-harness.ts:110-128`) je postojeći oblik |
| `interruptReason` | `string \| null` — obavezno kad status uđe u `FAILED_RETRYABLE`/legacy `interrupted` | danas samo `result.error = 'Waggle restarted before this run finished'` (F-DUR-01) |
| `createdAt`, `updatedAt`, `completedAt` | ISO 8601 UTC | — |
| `schemaVersion` | integer | `agent-runs.json` ima `version: 1` i tiho ispušta store pri mismatch-u (F-DUR-02 → migracija §14) |

### FRD-02.2 — `PhaseAttempt` — PREDLOG

`{ runId, phaseId, attemptNo, inputRefs[], startedAt, endedAt, observedToolCalls[] (server ledger), artifactRefs[], gateResults[], verdict?, endReason: 'gates_passed' | 'gates_failed' | 'aborted' | 'budget_stop' | 'cancelled' | 'crashed' | 'skipped_by_policy' }`.
- `observedToolCalls` se pune **isključivo** iz server ledger-a (`chat-agent-run.ts:214-225 onToolResult`, `TurnToolActivity`), ne iz `phase_output.tool_calls` (F-HARN-08, DIR-07). Prelazno: postojeći `PhaseOutput.toolCalls` označiti `selfReported: true`; u `strict` režimu gate odbija self-reported dokaz.
- `skipped_by_policy` mora nositi razlog i **ne sme** proizvesti `COMPLETED` bez oznake u ProofReceipt-u (F-HARN-01: danas `getRunSummary` piše `**Status:** Completed` uz `| Verify | SKIP |`).
- Mapa na postojeći `PhaseStatus` (`workflow-harness.ts:23`): `pending|active|validating|passed|failed|skipped` → `PhaseAttempt` je instanca pokušaja; `skipped` postaje `endReason: 'skipped_by_policy'` + `verdict: null`.

### FRD-02.3 — `Checkpoint` — PREDLOG

`{ checkpointId, runId, phaseId, attemptNo, boundary: 'phase_confirmed', phaseResultRef, artifactRefs[] (sa sha256), evidenceRefs[], contextRef (packageId+version+hash), budgetSpent, nextCursor, schemaVersion, createdAt }`.
- Granica oporavka je **faza** (DIR-05, A6). Postojeći `CheckpointStepState` (`long-task/checkpoint.ts:63-97`, `schema_version`, `cost_usd`, `run_id`, `step_index`) je step-granularnost; dozvoljeno ga je zadržati **ispod** fazne granice kao interni detalj (F-DUR-04: `CheckpointStore`/`RecoveryRunner` imaju 0 produkcionih pozivalaca osim opcionog `retrieval-agent-loop.ts:153`; asset za ADAPT).
- Hash artefakta potvrđuje sadržaj, ne poslovnu tačnost (brief §6.3).
- Atomicity važi za potvrđenu transakciju u run store-u; za spoljne granice (mejl, filesystem, `.mind`) planirati idempotentno povezivanje/outbox (brief §6.3). Status: PREDLOG.

### FRD-02.4 — `ToolAction` i `ToolAttempt` — PREDLOG (DIR-06, ispravka S1 A7)

| Objekat | Polja | Pravilo |
|---|---|---|
| `ToolAction` | `actionId` (server-persistiran, stabilan kroz retry), `runId`, `phaseId`, `toolName`, `argsFingerprint`, `sideEffectClass: 'none' \| 'local_write' \| 'external_send' \| 'install' \| 'payment'`, `grantRef`, `status`, `providerIdempotencyKey?`, `occurrenceId?` (rutine), `createdAt` | `actionId ≠ attemptId ≠ providerIdempotencyKey`. Novi `actionId` **ne sme** biti prečica oko nerešenog prethodnog pokušaja iste radnje. Isti argumenti nisu dovoljan razlog za dedup: dve odobrene occurrence rutine legitimno šalju dva slična izveštaja (brief §6.5). |
| `ToolAttempt` | `attemptId`, `actionId`, `attemptNo`, `startedAt`, `endedAt`, `observed: { ok, exitCode?, durationMs, resultDigest }`, `receipt?` | jedan pokušaj izvršenja; `observed` iz server ledger-a |
| `ToolAction.status` | `planned → approved → dispatching → succeeded \| failed \| unknown_outcome` | `dispatching` se upisuje **pre** `tool.execute`; `unknown_outcome` kad proces padne posle provider uspeha a pre lokalnog ack-a → prvo provider state/receipt ili korisnička provera; **bez blind retry-ja** za ne-idempotentan servis (AT-08) |

- Postojeći `PendingActionStatus` (`cron-store.ts:88`: `held|approved|denied|executed|failed|expired`) i atomic claim `held→approved` (`held-action-executor.ts:154-160` → `cron-store.ts:551-556`) su **BORROW** polazna tačka (F-DUR-05 HOLDS): bliži DIR-06 nego S1 predlog `runId+phaseId+attempt+callIndex`. Nedostaje: `dispatching`, `unknown_outcome`, odvojen `attemptId`, `providerIdempotencyKey` (grep 0). Crash između `tool.execute` (`:233`) i `updatePendingActionResult` (`:235`) ostavlja red `approved` zauvek — POTVRĐENO NA REVIZIJI.
- Mapa: `held→planned`, `approved→approved`, `denied→(terminal, nema ToolAttempt)`, `executed→succeeded`, `failed→failed`, `expired→(terminal)`. Širenje union-a: proveriti `switch` bez `default` (refute F-DUR-05: nema ih u ne-test kodu; `ApprovalsApp.tsx:182,301` filtrira po `source`, ne statusu).

### FRD-02.5 — `RunEvent` — PREDLOG (A9, A11)

`{ runId, seq (monotono po run-u), phaseId?, attemptNo?, type, label (user-facing), status: 'running' | 'done' | 'failed' | 'blocked' | 'cancelled', evidenceRefs[], at }`. Bez tajni u payload-u.
- Reconnect: `GET .../stream?sinceSeq=` ili kompatibilan ekvivalent; replay ne duplira tekst/kartice/radnje (AT-10). Postojeći `GET /api/agent-runs/events?since=` sa `resetRequired` (`routes/agent-runs.ts:20-22,73-84`, `agent-run-registry.ts:243-257`) je kompatibilan ekvivalent **za run-status**, ne za chat tekst; chat SSE nema `sinceSeq`/`Last-Event-ID` (grep 0 u `packages/server/src`) — POTVRĐENO NA REVIZIJI (F-DUR-06).
- Per-run bus: `harnessEvents` je process-global `EventEmitter` bez `runId` u payload-ima (`workflow-harness.ts:132,169-207`) — POTVRĐENO NA REVIZIJI (F-HARN-07, F-DUR-08). Minimalna G1 promena: aditivno `runId` (+`workspaceId`,`sessionId`) u sva tri payload tipa; bridge test koristi `toContain`, pa aditivno polje ne lomi (refute F-DUR-08).
- Web `StepContentBlock` (`apps/web/src/lib/types.ts:575-586`: `status: 'running' | 'done'`, `provenance?`) se aditivno širi: `runId`, `phaseId`, `status` + `failed|blocked`, `evidenceRefs` (F-UXM-11).

### FRD-02.6 — `ProofReceipt` — PREDLOG (brief §7.2, tri nivoa)

```
ProofReceipt {
  receiptId, runId, subject: { kind: 'artifact'|'phase'|'run', ref },
  level: 'structural' | 'defined_elements' | 'content_review',
  verifierVersions: { validators: Record<name, version>, grader?: { model, version, promptHash } },
  observedEvidence: EvidenceRef[],           // iz server ledger-a / validatora
  mandatoryGates: GateOutcome[], optionalGates: GateOutcome[],
  verdict: 'PASS' | 'CONDITIONAL' | 'FAIL' | 'NOT_RUN',
  warnings[], unresolved[],
  qualification: 'qualified' | 'legacy_unqualified',
  createdAt
}
```
- **Nije opšti pečat istinitosti.** Nivo 1 potvrđuje da DOCX postoji/parsira/ima sekcije, alat završen sa opaženim statusom — ne da su zaključci ispravni. Nivo 2 potvrđuje iznose/datume/citate/reference prema označenim izvorima. Nivo 3 je rubrika za potpunost/vernost — ne matematička garancija (brief §7.2).
- `COMPLETED` u `strict` režimu zahteva receipt sa `mandatoryGates` svi PASS ili recipe-definisanu CONDITIONAL politiku (§5.5).
- Mapa na `TraceOutcome` (`execution-traces.ts:20`: `success|corrected|abandoned|verified|pending`): `verified` danas piše samo `HarnessTraceBridge` za **svaku** završenu fazu (`harness-trace-bridge.ts:91`) — POTVRĐENO NA REVIZIJI (F-HARN-06, F-EVO-12). v1.2: završena faza = `gate_passed` (strukturno), `verified` rezervisano za receipt nivoa ≥2. **Upozorenje iz refute-a:** `outcome` ima SQL `CHECK` na dva mesta (`execution-traces.ts:150-151`, `mind/schema.ts:242-243`) → dodavanje `gate_passed` je table-rebuild migracija (§14), ne type-edit; alternativa bez šeme = `tags[]` + eval filter — PREDLOG, odluka pisaca ADR-a.

### FRD-02.7 — `ContextPackage` — PREDLOG (brief §8.1, DIR-09)

`{ packageId, version, runId, workspaceId, sessionId, query, taskShape, sources: [{ frameId|fileRef, revision|hash, scope: 'personal'|'workspace:<id>'|'file', provenance: FrameSource, trust: 'user_stated'|'tool_verified'|'agent_inferred'|'import'|'system', taint: 'none'|'external'|'harvested' }], tokenBudget, priorityOrder[], executorPayload: { mode: 'references'|'inline', text? }, omitted: [{ ref, reason }], hash }`.
- Omotač nad postojećim `recallMemory` (`orchestrator.ts:582-978`, 7 lane-ova + RAWDETAIL, 4 pozivaoca) — engine se ne menja (D-12, F-HM-09).
- Precedent za `hash` i redakciju: `ExecutorBrief` (`executor-brief.ts:29-36`: `briefHash`, `blocked`, cap 8000 znakova/6 stavki, `redactSecrets`, injection scan) — POTVRĐENO NA REVIZIJI (F-HM-11). Koristi se samo na route-proposal putu; `/api/tools/run` i interaktivni launch ne prilažu brief (DELIMIČNO/NEPOVEZANO).
- `trust` je iz `FrameSource` (`frames.ts:28`); danas se ne renderuje u recall bloku (`orchestrator.ts:843,854` = `[date, importance] content`) — POTVRĐENO NA REVIZIJI (F-HM-06); dodavanje menja bajtove recall bloka → zahteva LoCoMo same-judge kontrolu (W2 rizik), ne quick fix.
- `tokenBudget`: danas assembler-level `FRAME_LIMITS` small 3/mid 6/frontier 10 (`prompt-assembler.ts:165-169`) i `DEFAULT_MAX_CHARS = 32_000`; multi-lane blok je jedna sekcija pa se limiti po tier-u ne primenjuju na lane-ove (F-HM-07, DELIMIČNO/NEPOVEZANO).
- **Snapshot ≠ override brisanja:** pri resume-u se svaka `sources[]` referenca ponovo razrešava; obrisana/revokovana/rescoped → `omitted` + `RunEvent(status:'blocked')` + zahtev za novo razrešenje (AT-15). Danas ne postoji veza checkpoint↔kontekst pa ni invalidacija (F-HM-18).

### FRD-02.8 — `CapabilityRequest` — PREDLOG (brief §9.3, C14 novi ADR)

`{ requestId, runId, workspaceId, sessionId, proposedCapability: { kind: 'skill'|'connector'|'mcp'|'marketplace', id, authType?: 'api_key'|'bearer'|'oauth'|'none' }, scope[], reason (šta nedostaje, zašto, posledica), state: 'proposed'|'awaiting_user'|'setup_in_progress'|'granted'|'declined'|'expired', expiresAt, oauthState?: { nonce, callbackOrigin, pkce?: true }, createdAt }`.
- Trajno; preživljava restart. Postojeći `CapabilityProposalStore` (`capability-proposals.ts:19-35`: `Map` u memoriji, TTL 10 min, max 256, `workspaceId+sessionId`, `state: pending|confirming|used|expired`) je polazna tačka, ali nema pojam run-a i ne preživljava restart — POTVRĐENO NA REVIZIJI (F-CAP-02). Kartica renderuje samo `starter-pack`/`marketplace`; connector/mcp → `return null` (`CapabilityRequestCard.tsx:94-99`).
- OAuth: `pendingStates` je in-memory `Map<state,{provider,createdAt}>` bez run vezivanja; nema PKCE (grep 0) (`oauth.ts:64-65,138-139,200-209`) — POTVRĐENO NA REVIZIJI. v1.2: state/nonce vezan za `requestId`, callback origin proveren server-side, PKCE gde je primenljivo, zatvoren prozor/istekao grant/callback za drugi request ≠ uspešna autorizacija (AT-11). `SetupCompleted` događaj vezan za `requestId`; **model ne vidi token**.
- MCP binarne/remote marketplace instalacije: predlog inline, instalacija u Settings uz SecurityGate (R11) — već važi na reviziji (F-CAP-06: `installer.ts:392` refuse bez `forceInsecure`; `forceInsecure` dolazi iz klijentskog body-ja uz audit) — POTVRĐENO NA REVIZIJI; `THREAT_MODEL.md` postoji u korenu repoa (POTVRĐENO NA REVIZIJI; ne pokriva inline install granicu, MCP binary install, egress profile ni PostHog → nedostaje dopuna, ADR-10-P6); „no secrets in prompts/traces” test: NEPOZNATO/nije nađen.

### FRD-02.9 — `WorkItem` — PREDLOG (brief §11.4, DIR-18)

`{ workItemId, type: 'Action'|'Commitment'|'Decision'|'Signal', status: 'new'|'seen'|'snoozed'|'dismissed'|'converted'|'linked', provenance: { channel, sourceId, threadId?, fetchedAt, taint: 'harvested' }, sourceTime, workspaceId?, confidence, priorityReason, userCorrection?: { originalType, correctedType, at }, mergedFrom[] (reverzibilno), dueAt?, createdAt }`.
- Grep `convert.?to.?work|WorkItem|toWorkItem` u `packages/server/src` i `apps/web/src` = 0 → feature ne postoji (F-CAP-05c; W7 net-new) — POTVRĐENO NA REVIZIJI.
- WorkItem **nije** nalog agentu; convert-to-work kreira `DurableRun` sa `taint` u `permissionEnvelope` — nijedan spoljni efekat bez odobrenja (AT-19).
- Dedup/spajanje samo uz dovoljno dokaza; pogrešno spajanje reverzibilno (`mergedFrom`). Precision/false-positive pragovi se zaključavaju pre finalnog scoring-a (AT-24) — NEPOZNATO do labeled skupa.

### FRD-02.10 — `RoutineOccurrence` — PREDLOG (brief §11.5, DIR-19)

`{ occurrenceId, scheduleId, scheduledFor (ISO UTC), timezone, firedAt, policyApplied: 'on_time'|'catch_up_one'|'skipped_misfire', runId?, budgetRef, resultChannel }`.
- Executor danas prima samo `schedule` (`cron.ts:19`), bez occurrence id — POTVRĐENO NA REVIZIJI (F-DUR-10). Kandidat za `occurrenceId` = `cron_execution_history.id` ili `lease.id`.
- Vidi §9 za misfire/DST/fencing i za NALAZ AUDITA o formatu `next_run_at`.

### FRD-02.11 — `HarnessRecipeVersion` — PREDLOG (DIR-14, A18)

`{ recipeId, version, parentVersion?, target: 'persona-system-prompt'|'behavioral-spec-section'|'skill-body'|'recipe-variant', mutations[], invariants: { scope, egressDenylist, approvals, budgetCap, mandatoryGates, contaminationBoundary, successDefinition } (nepromenljivi), evalMetrics: { train, validation }, holdoutMetrics: { n, metric, ci, holdoutViews }, promotionPolicyRef, promotionState: 'proposed'|'accepted'|'rejected'|'deployed'|'rolled_back'|'failed'|'written_not_active', activeFrom?, activeUntil?, rollbackTarget?, executorManifest: { executorModel, judgeModel, runtime }, createdAt }`.
- Postojeći `EvolutionRunStatus` (`evolution-runs.ts:23-28`: `proposed|accepted|rejected|deployed|failed`) sa SQL `CHECK` (`:95-96`) — nema `rolled_back` (F-EVO-02) → table-rebuild migracija (§14). `deployed` se postavlja čim `deploy` callback ne baci (`evolution-runs.ts:192-201`), bez provere aktivacije (F-EVO-10) → novo stanje `written_not_active`.
- `recipe-variant` target ne postoji u kodu (`EvolutionTarget`, `iterative-optimizer.ts:88-93`) — ograničeni registry iz DIR-14 je net-new (§8.5).

### FRD-02.12 — Mapa kompatibilnosti: postojeći tipovi ↔ kanonski ugovori

| Postojeći simbol (`2af0904d`) | Kanonski ugovor v1.2 | Mapa / pravilo | Status |
|---|---|---|---|
| `COLLABORATION_RUN_STATUSES` (`packages/shared/src/types.ts:398-402`): `queued, starting, running, waiting_for_approval, paused, cancelling, completed, failed, cancelled, interrupted` | `DurableRun.status` (§4.1) | `queued→QUEUED`; `starting\|running→RUNNING`; `waiting_for_approval→BLOCKED_APPROVAL`; `cancelling→` prelazno (zadržati, nije kanonsko stanje); `completed→COMPLETED`; `cancelled→CANCELLED`; `failed→FAILED_FINAL` dok ne postoji klasifikacija retryable/final; `interrupted→` legacy: čuva `interruptReason`, resume samo kroz eksplicitan API koji validira checkpoint (ne postaje ni COMPLETED ni bezuslovno RUNNING); `paused→ODLOŽENO` (nema suspension primitiva: `capabilities.pause/resume = true` 0 settera; fleet `pause` je `AbortController.abort`, ne suspenzija — refute F-DUR-03). **Ne brisati vrednosti iz enum-a**: zod enum `routes/agent-runs.ts:15`, `RoomApp.tsx:51-66`, `routes/agents.ts:149-160` zavise od njih. | POTVRĐENO NA REVIZIJI + PREDLOG |
| `AGENT_RUN_STATES` (`types.ts:381-384`) | — | lifecycle sačuvanog Agent blueprint-a; **ne mapira se** na run status (komentar `:376-380`) | POTVRĐENO NA REVIZIJI |
| `HarnessRunState` (`workflow-harness.ts:110-128`) + `PhaseStatus` (`:23`) | `DurableRun.cursor` + `PhaseAttempt` | serijalizabilan oblik već postoji; dodati `runId`; `skipped` → `endReason:'skipped_by_policy'` sa razlogom | POTVRĐENO NA REVIZIJI + PREDLOG |
| `PhaseOutput.toolCalls` (`workflow-harness.ts:76`: `{tool,args,result}`) | `PhaseAttempt.observedToolCalls` | prelazno `selfReported:true`; u strict odbijeno; dugoročno server ledger | PREDLOG |
| `CheckpointStepState` (`long-task/checkpoint.ts:63-97`) | `Checkpoint` (fazna granica) | step-granularnost ostaje interna ispod faze; `cost_usd` → `budgetSpent` | DELIMIČNO/NEPOVEZANO (0 prod. pozivalaca) + PREDLOG |
| `PendingActionRow`/`PendingActionStatus` (`cron-store.ts:88-100`) | `ToolAction`/`ToolAttempt` | vidi §2.4 | POTVRĐENO NA REVIZIJI + PREDLOG |
| `TraceOutcome` (`execution-traces.ts:20`) | `ProofReceipt.level` + `qualification` | `verified` (harness) → `gate_passed`/legacy_unqualified; `success` ostaje; migracija zbog `CHECK` | POTVRĐENO NA REVIZIJI + PREDLOG |
| `CapabilityProposal` (`capability-proposals.ts:19-26`) | `CapabilityRequest` | + `runId`, `kind:'connector'`, `authType`, persistencija | POTVRĐENO NA REVIZIJI + PREDLOG |
| `CapabilityCandidate` (`capability-acquisition.ts:27-36`: `availability`, `source`, `matchScore`, `trust?`) | ostaje | resolver facade vraća `CapabilityCandidate[]`; `trust` danas ne utiče na rang (test `capability-acquisition-trust.test.ts:126` to zaključava) | POTVRĐENO NA REVIZIJI |
| `ExecutorBrief` (`executor-brief.ts:29-36`) | `ContextPackage.executorPayload` + `hash` | `briefHash` = precedent za `contextRef.hash` | POTVRĐENO NA REVIZIJI + PREDLOG |
| `FrameSource` (`frames.ts:28`) | `ContextPackage.sources[].trust` | 1:1 | POTVRĐENO NA REVIZIJI |
| `EvolutionRunStatus` (`evolution-runs.ts:23-28`) | `HarnessRecipeVersion.promotionState` | + `rolled_back`, `written_not_active` (migracija) | POTVRĐENO NA REVIZIJI + PREDLOG |
| `StepContentBlock` (`apps/web/src/lib/types.ts:575-586`) | `RunEvent` (klijentska projekcija) | aditivno `runId/phaseId/status failed\|blocked/evidenceRefs` | POTVRĐENO NA REVIZIJI + PREDLOG |
| `Automation.status` (`types.ts:777`: `active\|paused\|running\|failed`) | Routine block state (§9) | backend emituje samo `active\|paused` (`automations.ts:128-148`); `running`/`failed` grane mrtve; dodati izvedeni `blocked` | POTVRĐENO NA REVIZIJI (refute F-DUR-11) + PREDLOG |
| `TaskShape` (`task-shape.ts:34-44`: `complexity: simple\|moderate\|complex`) | `DurableRun.interaction` ulaz | heuristički klasifikator; **ne bira** recipe danas | POTVRĐENO NA REVIZIJI |

---

## 3. Redosled nastanka run-a (brief §6.2, DIR-04)

**FRD-03.0 — Pravilo:** run postoji pre side effect-a, blokiranja i trajnog konteksta. Za lagani chat (`interaction:'conversation'`) ostaje postojeća session putanja bez `DurableRun`. Status: PREDLOG — SMER BRIEFA (DIR-04) + PREDLOG (koraci).

| Korak | Ugovor v1.2 | Stanje na `2af0904d` | Status |
|---|---|---|---|
| FRD-03.1 | Razreši korisnika/Workspace; sačuvaj intent sa stabilnim `requestFingerprint`. | Workspace/session postoje (`chat-turn-preparation.ts`); nema request fingerprint-a za work run. | PREDLOG |
| FRD-03.2 | Klasifikuj `interaction` i `taskShape`; izaberi početni `recipeId/version`. Pogrešna klasifikacija vidljiva i popravljiva; bez tihog pokretanja skupog rada (DIR-03). | `detectTaskShape` postoji i ima 9 pozivalaca, ali izbor harness-a je model-invoked tekst (`compose_workflow` samo ispisuje mode, `workflow-tools.ts:84-119`) (F-HARN-09). | POTVRĐENO NA REVIZIJI + PREDLOG |
| FRD-03.3 | Kreiraj `DurableRun` sa scope-om, `mode`, `budget.limit`, inicijalnim `permissionEnvelope`. | `AgentRunRegistry.record()` kreira room/worker zapis **pre** izvršenja za fleet (`fleet-run-executor.ts:480-496`) — najbliži postojeći kandidat za ADAPT (F-DUR-12); harness `run_id` nastaje tek na prvom `run_harness` pozivu (F-HARN-07). | DELIMIČNO/NEPOVEZANO + PREDLOG |
| FRD-03.4 | Sastavi i trajno poveži `ContextPackage` (`contextRef` sa hash-om). Paket sme biti pripremljen u memoriji pre koraka 3, ali nijedna trajna referenca ne sme zavisiti od paketa koji nije vezan za run. | `recallMemory` se poziva u `chat-turn-preparation.ts:237`; nema trajne reference osim `briefHash` na route-proposal putu (F-HM-11/18). | PREDLOG |
| FRD-03.5 | Razreši capabilities kroz envelope (§6); ako nedostaju → run u trajni `BLOCKED_CAPABILITY` sa `CapabilityRequest`. | `BLOCKED_CAPABILITY\|BLOCKED_APPROVAL` grep = 0; danas turn završava, korisnik ide u Hub, nema signala nazad (F-CAP-02). | POTVRĐENO NA REVIZIJI + PREDLOG |
| FRD-03.6 | Posle grant-a ponovo izračunaj envelope i svežu dostupnost, pa nastavi **isti** run. Callback za drugi request / istekao grant ne pokreće posao. | ne postoji (F-CAP-02, F-CAP-08: jedinica održivosti je held tool call, ne run). | PREDLOG |
| FRD-03.7 | Izvrši fazu; gates čitaju server-observed dnevnik; checkpoint na potvrđenoj granici; `budget.spent` u checkpoint-u. | gates čitaju model-supplied `phase_output` (F-HARN-08); nema checkpoint-a u produkciji (F-DUR-04/13). | POTVRĐENO NA REVIZIJI + PREDLOG |
| FRD-03.8 | Završetak proizvodi rezultat + `ProofReceipt`; tek tada `COMPLETED`. Memorijska konsolidacija je posebno evidentirana, idempotentna operacija (ključ `(runId, outputHash)`). | `chat-turn-completion.ts:371-375` uvek `outcome:'success'`; content-hash dedup postoji (`frames.ts:109-111,289-294`), ali nema `(runId, outputHash)` ključa — drugačiji tekst istog run-a se duplira (F-HM-16). | POTVRĐENO NA REVIZIJI + PREDLOG |

**FRD-03.9 — Restart:** ne rekonstruisati neprimetno „isti” kontekst iz novih izvora; koristiti `contextRef` + re-validaciju (§2.7). Status: PREDLOG — SMER BRIEFA (brief §6.2) + PREDLOG.

---

## 4. State machine, lease i fencing

### FRD-04.1 — Kanonska stanja — PREDLOG (brief §6.4)

`QUEUED → RUNNING → { BLOCKED_CAPABILITY | BLOCKED_APPROVAL } → RUNNING → COMPLETED`; iz `RUNNING`: `FAILED_RETRYABLE` (→ `QUEUED` kroz eksplicitan resume ili politiku) ili `FAILED_FINAL`; iz bilo kog ne-terminalnog: `CANCELLED`. Terminalna: `COMPLETED`, `FAILED_FINAL`, `CANCELLED`. `PAUSED` — **ODLOŽENO** (C12; čekanje odobrenja ≠ korisnička pauza; nema semantike u kodu, refute F-DUR-03).

- Postojeći `ALLOWED_TRANSITIONS` (`agent-run-registry.ts:31-42`) je izvor istine za legacy stanja; `interrupted: new Set()` znači da je legacy `interrupted` terminalno — POTVRĐENO NA REVIZIJI (F-DUR-01). Test `agent-run-registry.test.ts:195-218` pinuje `interrupted` kao **željeno**; test `:84-94` odbija terminal→running. Zato resume ide kroz **eksplicitan API** (validira checkpoint), ne kroz izmenu tabele tranzicija (refute F-DUR-01). Harvest M-08 resume pattern (`routes/harvest.ts:128`, `adapter.ts:4018`) je BORROW kandidat.
- Migracija legacy `interrupted`: čuvati razlog; proveriti mogućnost bezbednog nastavka; **nikad** automatski `COMPLETED` ni bezuslovno `RUNNING` (brief §6.4). Status: PREDLOG — SMER BRIEFA (DIR-05) + PREDLOG.

### FRD-04.2 — Faza je jedinica oporavka — PREDLOG — SMER BRIEFA (DIR-05, A6)

Nedovršena faza kreće od početka iz poslednjeg validnog `Checkpoint`-a sa već potvrđenim izlazima; već izvršene sporedne radnje (`ToolAction.status ∈ {succeeded, unknown_outcome}`) se **ne ponavljaju naslepo**. Nema resume-a usred agent loop-a. Restart ne resetuje `budget.spent` (A10). Status: PREDLOG — SMER BRIEFA + PREDLOG (implementacija).

### FRD-04.3 — Lease i fencing — PREDLOG (AT-09)

- Jedan run ima samo jednog ovlašćenog aktivnog izvršioca po fazi. `RunLease { runId, ownerId (pid+instance nonce), fencingToken (monotono), expiresAt, heartbeatAt }`. Svaka mutacija run stanja i svaki `ToolAction` prelaz `approved→dispatching` nose `fencingToken`; store odbija stariji token.
- Danas: cron `acquireRunLease` je čist `INSERT` bez `UNIQUE` (`cron-store.ts:442-447`, schema `:155-161`) → nije fencing; dva procesa nad istim `dataDir` mogu izvršiti isti job; single-flight je samo `this.ticking` po procesu (F-DUR-10) — POTVRĐENO NA REVIZIJI. Minimalno: uslovni `INSERT … WHERE NOT EXISTS` ili `UNIQUE(schedule_id)` + expiry.
- `RecoveryRunner` (`long-task/recovery.ts:250-344`: fresh/resume_clean/resume_from_error, retry/backoff) postoji sa 0 produkcionih pozivalaca — asset za ADAPT (F-DUR-04).

### FRD-04.4 — Detach, cancel, gubitak veze — PREDLOG — SMER BRIEFA (brief §6.4) + POTVRĐENO NA REVIZIJI (stanje)

- Detach = UI se odvaja, odobreni background posao nastavlja. Cancel = nema novih radnji, kontrolisano zaustavljanje, terminalni zapis sa razlogom, zadržani artefakti/checkpoints. Gubitak SSE veze **nije** korisnički cancel.
- Stanje: `chat.ts:1604-1612` `raw.once('close') → abortController.abort()` (R3-008, namerno; poreklo `docs/audits/2026-05-29-prod-readiness/REPORT.md:103`); Stop i unmount abortuju (`useChat.ts:463-487`); child subagenti nasleđuju prekid (`chat-collaboration.ts:110-128 linkParentCancellation`). Postojeća copy „Stop generating” (`ChatApp.tsx:2428-2432`) ne kaže da se child runovi gube niti da zatvaranje taba prekida posao (refute F-DUR-06 WEAKENED).
- v1.2: foreground conversation putanja može zadržati R3-008 **uz eksplicitnu UX poruku**; durable work putanja (`interaction:'work'`) ima poseban ugovor: socket close → `RunEvent(detached)`, run nastavlja pod lease-om; fleet spawn (`POST /api/fleet/spawn`, 202) je najbliži postojeći interni tok koji nastavlja bez socket-a, ali ne preživljava restart; external-tool runovi (`/api/tools/launch`, `/api/tools/run`) nastavljaju bez socket-a i preživljavaju restart kroz pid-reconcile (`agent-run-registry.ts:381-395,510-520`; `tools-routes-launch.test.ts:1148-1170`) — BORROW presedan (F-DUR-12, refute). ADR (3) iz brief §20.2. Status: PREDLOG.

### FRD-04.5 — Budžet i restart — PREDLOG (A10)

`Checkpoint.budgetSpent` obavezno; dnevni spend već preživljava restart (`local-mode.test.ts:1067-1075`), per-run ne (F-DUR-07). Do W1 store-a: progresivno patch-ovati `metrics` u registry na granici turna (`fleet-run-executor.ts`), da `interrupted` run bar nosi potrošnju. Status: DELIMIČNO/NEPOVEZANO + PREDLOG.

---

## 5. Harness engine

### FRD-05.1 — Verify nikad tiho preskočen — PREDLOG (DIR-03/07; F-HARN-01)

- Stanje: `workflow-harness.ts:313` `if (nextPhase.id.includes('verify') && shouldSkipVerify())`; `:474-482` `return env !== 'true' && env !== '1'` → unset ili `'0'` = skip; `catch { return true }` fail-open; nijedna konfiguracija u repou ne postavlja `WAGGLE_AUTO_VERIFY` (grep `app/`, `sidecar/`, `scripts/`, `.env.example`, `package.json`, docker/render = 0) → **production default = skip**; commit `93ff7813` ga je svesno zadržao; `FEATURE_FLAGS.VERIFIER_AUTO_RUN` (`feature-flags.ts:26`) je mrtav (0 konzumenata). Repro `docs/plans/v1.2-evidence/phaseA/repro-harness.mjs` 25/25. — POTVRĐENO NA REVIZIJI.
- Ugovor: u `work` režimu (`normal` i `strict`) verify faza nikad nije tiho preskočena; opt-out je eksplicitna recipe/run opcija zabeležena kao `endReason:'skipped_by_policy'` + `ProofReceipt.verdict:'NOT_RUN'`; `getRunSummary` prikazuje „Completed (verify skipped)”; emituje se `harness:phase:skipped`. `catch → false`. Unificirati sa `VERIFIER_AUTO_RUN` ili ukloniti flag.
- Test koji **pocrveni** uz fix (očekivano): `workflow-tools-harness.test.ts:135-179` (oslanja se na auto-skip). Redosled: F-HARN-01 pre F-HARN-02/03, jer je u production default-u VERDICT gate nedostižan (refute cross-cutting 2).

### FRD-05.2 — Tipovi gate-ova — PREDLOG (FRD v1.1 §5 precizirano)

| Gate | Šta čita | Šta ne dokazuje | Stanje |
|---|---|---|---|
| tool-call evidence | `PhaseAttempt.observedToolCalls` (server ledger: ime, `ok`, `exitCode`, `durationMs`) | da je alat uradio pravu stvar | danas model-supplied (F-HARN-08); `hasToolCalls` substring match (`builtin-harnesses.ts:13-24`) hvata i `my_bash_like_tool` |
| test/build result | tačna imena alata + obrazac komande (`/(npm\|pnpm\|yarn)\s+(test\|run\s+test)\|vitest\|jest\|tsc\|pytest\|cargo test/`) + `exitCode === 0` | pokrivenost testova | `echo hi` prolazi kao test (`builtin-harnesses.ts:181`); exit code se opaža u `system-tools-helpers.ts:732-734` pa odbacuje u `system-tools.ts:682-693` kad postoji izlaz (`Error:` prefiks samo na prazan izlaz); `tool-executor.ts:285-287,298` ne vidi neuspeh — POTVRĐENO NA REVIZIJI (F-HARN-03) |
| artifact existence/validation | fajl postoji, parsira se, ima obavezne sekcije, sha256 | tačnost sadržaja | `hasMinSections`, `hasMinLength` postoje (`builtin-harnesses.ts:43-89`) |
| structured-output check | schema validacija izlaza | semantika | postoji delimično (`hasPattern`) |
| citation/reference resolution | reference se razrešavaju u `ContextPackage.sources` ili fajl/URL; citat se poklapa sa izvorom | sve interpretacije izvora | ne postoji (R07: univerzalni entailment kasnije; ciljane provere ne odlagati) |
| numeric/date fidelity | brojevi/datumi u artefaktu poklapaju označene izvore | poslovna preporuka | ne postoji (AT-21) |
| contradiction check | eksplicitne kontradikcije unutar artefakta / sa potvrđenim odlukama | — | `contradiction-detector.ts` postoji (pozivaoci: NEPOZNATO u ovom prolazu) |
| verdict gate | **vrednost** `VERDICT` (capture group), ne prisustvo | — | `builtin-harnesses.ts:128` regex prolazi `FAIL` i `CONDITIONAL` kao PASS — POTVRĐENO NA REVIZIJI (F-HARN-02) |
| custom domain validator | recipe-specifičan | — | — |

Source count sam po sebi nije kvalitet; nema proizvoljne kvote izvora (brief §7.2). Status: PREDLOG — SMER BRIEFA (DIR-07) + PREDLOG (implementacija).

### FRD-05.3 — Server-observed evidence — PREDLOG — SMER BRIEFA (DIR-07, A5)

- Model može predložiti tvrdnju/plan/fazni izlaz; ne može proizvesti autoritativan zapis da je alat pozvan, fajl nastao, test prošao ili dozvola dobijena.
- Implementacija (PREDLOG): `WorkflowToolsConfig` dobija `observedToolCalls(sinceMarker)` provider koji server puni iz `onToolResult` (`chat-agent-run.ts:214-225`); `run_harness` ignoriše `phase_output.tool_calls`; `system-tools.ts:684-691` uvek uključuje `Exit code: N` (ili strukturisan `{ok:false, exitCode}`); `tool-executor.ts` postavlja `succeeded=false` na nenulti exit; `verification-gate.ts:33` uklanja `'run_harness'` iz `VERIFICATION_TOOL_EXACT` (F-HARN-04: poreklo `9fce1d2f`, bez dokumentovane odluke; nije D-01..D-18); gate prima `{name, succeeded}` parove umesto golih imena (`agent-loop.ts:1826` gura ime i kad `executionSucceeded === false`).
- Testovi koji pocrvene: `workflow-tools-harness.test.ts:82-106,135-179` (Gather gate prolazi na self-reported `search_memory`/`recall_memory`) — ažurirati ili injektovati `observedToolCalls` u `makeConfig()` (refute F-HARN-08).
- `HarnessTraceBridge`: `ok: true / durationMs: 0` hardkodovano (`harness-trace-bridge.ts:139-148`), `context` nije prosleđen na boot-u (`local/index.ts:612-616`), pa `workspaceId:null` u trace-u; drugo hardkodovano `ok:true` u `trace-recorder.ts:281,288` (chat turn) — POTVRĐENO NA REVIZIJI (F-HARN-06). v1.2: `ok: tc.ok ?? null`, bez fabrikovanog `durationMs`, resolver iz run→context mape kad events dobiju `runId`.

### FRD-05.4 — Tri nivoa provere umesto jednog `verified` — PREDLOG — SMER BRIEFA (brief §7.2) + PREDLOG

Vidi `ProofReceipt.level` (§2.6). Dashboard/eval ne sme sabirati `gate_passed` kao sadržinski potvrđeno (brief §7.3). Postojeći `verified` harness redovi → `qualification:'legacy_unqualified'` bez brisanja istorije (§14). `EvalDatasetBuilder.positiveOutcomes` je konfigurabilan (`eval-dataset.ts:66,208`, default `['success','verified']`) → omogućava isključenje bez promene šeme (F-HARN §2 red 12).

### FRD-05.5 — CONDITIONAL politika — PREDLOG (brief §7.2)

- `GateResult.verdict?: 'PASS'|'CONDITIONAL'|'FAIL'`; samo `PASS` prolazi bezuslovno; `FAIL` → retry (`maxRetries`) → `FAILED_RETRYABLE`/`BLOCKED_APPROVAL` po recipe-u.
- `CONDITIONAL` → recipe polje `conditionalPolicy: 'require_supplement' | 'require_user_review' | 'complete_with_limitation'`; default `require_supplement` (`passed:false` + `reason`). `complete_with_limitation` proizvodi `COMPLETED` **samo** sa `ProofReceipt.verdict:'CONDITIONAL'` i vidljivim `unresolved[]`. U `strict` režimu obavezni gate koji nije PASS blokira `COMPLETED`; delimičan artefakt ostaje dostupan bez oznake potpune potvrde.
- Stanje: `CONDITIONAL` = 2 pojavljivanja u celom `packages/`, oba u `builtin-harnesses.ts:125,128`; `code-review-fix` verify faza nema VERDICT gate uopšte (`:177-184`) — POTVRĐENO NA REVIZIJI (F-HARN-02).

### FRD-05.6 — Budget stop ne stvara uspeh — PREDLOG — SMER BRIEFA (DIR-08) + PREDLOG

- Stanje: `agent-loop.ts:1507-1550` grana `maxTokenBudget` iscrpljen; `:1523-1534` `maybeFireCompletionGate({ enableVerification:false, enableSkillDistillation:false })`; `loop-gates.ts:903` prvi uslov `enableVerification &&` isključuje i disclosure putanju (`:907-920`, `VERIFICATION_NO_TOOL_DISCLOSURE`) koja ne zahteva novi turn; `budgetStopResponse` (`agent-loop.ts:895-920`) nema partial/unverified oznake kad postoji `usableAnswer`; integrity gate (`rejectIncompleteReason`, `:1535-1540`) ostaje ali hvata strukturnu nepotpunost, ne neproverene tvrdnje — POTVRĐENO NA REVIZIJI (F-HARN-05). Ceo loop sa realnim budžetom nije izvršen (granica provere).
- Ugovor: budget stop → `PhaseAttempt.endReason:'budget_stop'`, `ProofReceipt.verdict:'NOT_RUN'` za obavezni verify, `RunEvent(status:'blocked', label:'Budget exhausted before verification')`, sačuvan `budget.spent`; korisnik može odobriti dodatni budžet (novi `attemptNo`, isti `actionId`-evi) ili prihvatiti označen nacrt; sistem ne briše obavezni gate retroaktivno. Minimalno: D3 u `disclose-only` modu (`verificationMode:'disclose-only'` ili direktan `assertsUnverifiedCompletion` + sufiks) pre `budgetStopResponse`; `budgetStop:true` u `AgentResponse` (aditivno; `toMatchObject` asserti tolerišu).

### FRD-05.7 — Harness router (server-side) — PREDLOG (W3)

- Server razdvaja `conversation`/`work`, bira `recipeId/version`, `mode`; klasifikacija vidljiva (RunEvent) i popravljiva (korisnik može degradirati na conversation ili promeniti recipe pre prvog side effect-a).
- Postojeći input: `detectTaskShape` (heuristički, `task-shape.ts:145`), `composeWorkflow.selectExecutionMode` (`workflow-composer.ts:99-104`, `'harnessed'` kad `FEATURE_FLAGS.ADVANCED_WORKFLOWS` default ON i `matchHarness` regex), `CapabilityRouter` (confidence sort, ne permission filter, `capability-router.ts:170`) — svi DELIMIČNO/NEPOVEZANO za ulogu routera (F-HARN-09).
- Početni recipe skup (DIR-02, W3): **dve** varijante — `research-brief` i `document-production`; analiza ulazi u njih, bez zasebnog „analysis engine”. Postojeći ugrađeni harnessi (`research-verify`, `code-review-fix`, `document-draft` u `builtin-harnesses.ts:94-238`) su polazni materijal, ne finalni recipe-i.
- Advisory polja `allowedTools/requiresApproval/timeoutMs` (`workflow-harness.ts:47-68`) postaju **enforced** u server executor-u (danas nisu, dokumentovano u `93ff7813`).

### FRD-05.8 — Work Progress labele — PREDLOG — SMER BRIEFA (brief §11.1) + PREDLOG

Labela = namera faze (Understanding / Gathering context / Researching / Checking / Writing / Verifying), stvarni status, blokada, trošak/budžet kad je relevantno, rezultat, „View work”. Bez procenta i preostalog vremena. Bez privatnog reasoning-a. Failure/partial/blocked/cancelled imaju isti „View work” (A22). Stanje: `rg "View work"` = 0; labele rasute (F-UXM-07) — POTVRĐENO NA REVIZIJI.

---

## 6. Capability resolver i permission envelope

### FRD-06.1 — Jedan resolver ugovor — PREDLOG — SMER BRIEFA (DIR-11) + PREDLOG

`resolveCapabilities(need, envelope, taskShape): CapabilityCandidate[]` — tanka fasada nad postojećim engine-ima: `searchCapabilities` (`capability-acquisition.ts:187`), `CapabilityRouter.resolve` (`capability-router.ts:58`, danas unknown-tool fallback iz `tool-executor.ts:143-151`), `scoreConnectors` (`routes/agent-search.ts:56`), marketplace FTS (`agent-search.ts:132`, `skill-tools.ts:446-448`) + `find_connector`/SkillRecommender (F-CAP-11). Bez fizičkog spajanja dok se ne dokaže potreba.

### FRD-06.2 — Permissions first; lane red = tie-breaker — PREDLOG — SMER BRIEFA (§17 C13 „PRECIZIRATI”, brief §9.1) + PREDLOG

1. `filterCandidates(envelope)`: dozvole, egress, readonly, raspoloživost, trust, KVARK policy kad je povezan.
2. Rangiranje: task fit, pouzdanost, setup i runtime trošak.
3. Lane preferenca `native → active skill → inactive skill → curated installable → connector → MCP → marketplace` samo među **upotrebljivim** kandidatima sa bliskim skorom.
- Stanje: tri različita ponašanja, nijedno „permissions first” (`searchCapabilities` sort po `matchScore` pa `availabilityOrder` pri razlici ≤0.05, `:299-311`; `CapabilityRouter` fiksni per-lane confidence = strogi red pod maskom skora; `agent-search` merge po skoru) — POTVRĐENO NA REVIZIJI (F-CAP-01). Read-only persona može dobiti write kandidata kroz `acquire_capability` jer resolver ne zna za persona filter (F-CAP-04).

### FRD-06.3 — `PermissionEnvelope` = presek — PREDLOG — SMER BRIEFA (brief §9.2, §18 A12 „IZMENITI TIER DEO”) + PREDLOG

`envelope = ∩ { systemSecurityAndEgress, kvarkPolicy? (samo kad je konekcija živa), userGrants (ApprovalGrantStore) i denials, workspaceRules, personaAllowlist/isReadOnly, toolCapabilities }`. Resolver **nikada ne proširuje** dozvole. **Tier nije individualna granica** (A12 „IZMENITI TIER DEO”; D-01).
- Postojeći slojevi (redosled u chat putu): persona `applyPersonaToolFilter`/`filterMcpToolsForPersona` (`persona-tool-filter.ts:98-153`, pozvano `chat-turn-preparation.ts:454,530,553`); governance `blockedTools` samo kad `wsConfig.teamId` (`chat-turn-preparation.ts:694-738`, `chat-governance.ts:87-89` → Solo nema governance sloj); executor floor (`tool-executor.ts:129,160-226`); `ApprovalGrantStore` (`approval-grants.ts:172-304`, non-grantable `bash/run_code/cli_execute/install_capability` `:20-25`); autonomy level (`confirmation.ts:337-358`). Nijedan nije jedan tipizovan objekat; resolver ih ne čita — DELIMIČNO/NEPOVEZANO (F-CAP-04). `requireTier` gate-uje rute, ne alate; `requiredTier` u `ACTION_REGISTRY` je mrtav (0 deskriptora), `hasCapability` 0 pozivalaca (F-TK-17).
- Minimalna promena: `PermissionEnvelope` izračunat jednom u `chat-turn-preparation.ts` i prosleđen resolveru i executor-u (isti izvor istine); bez novog policy engine-a (R13).

### FRD-06.4 — Inline setup = kontinuitet rada — ODLUKA (D-10) + PREDLOG — SMER BRIEFA (brief §9.3) + PREDLOG

Kartica objašnjava šta nedostaje/zašto/scope/posledicu; tajna u zaštićeno polje (`POST /api/connectors/:id/connect`, `connectors.ts:118-142`) ili OAuth u sistemskom browser-u; run ostaje `BLOCKED_CAPABILITY`; posle validnog callback-a `SetupCompleted{requestId}` → re-evaluacija envelope-a → nastavak istog run-a. „Inline” ne znači da OAuth/tajne idu kroz LLM tekst. Stanje i minimalna promena: §2.8; superseding ADR za `held-action-executor.ts:6-10` („never mid-run suspend/resume”) i za PR4 D3 (`routes/agent-search.ts:79`, ne `apps/web/src/lib/agent-search.ts:81` kako S1 navodi — korekcija F-CAP §0). Status: PREDLOG (ADR (4)).

### FRD-06.5 — MCP install via Settings — PREDLOG — SMER BRIEFA (§19 R11) + POTVRĐENO NA REVIZIJI

Inline samo predlog; instalacija u Settings uz SecurityGate i korisnika; bez silent binary install-a. Već važi (F-CAP-06). v1.2 dodaje: dopunu postojećeg `THREAT_MODEL.md` (postoji — POTVRĐENO NA REVIZIJI; ne pokriva inline install granicu, MCP binary install, egress profile ni PostHog; ADR-10-P6) + test da `buildSystemPrompt`/trace ne sadrže vault vrednosti (A14) — PREDLOG.

### FRD-06.6 — Approvals su core za pojedinca — ODLUKA (D-01) + PREDLOG — SMER BRIEFA (§18 A15) + POTVRĐENO NA REVIZIJI (stanje)

- Gate je **samo navigaciono sakrivanje**: `dock-tiers.ts:82` `minBillingTier:'TEAMS'`, `AppShell.tsx:727-728`, `command-catalog.ts:89`; `/approvals` ruta i `routes/approval.ts` nisu tier-gated (F-TK-02, F-CAP-07). Solo korisnik: inline kartica radi, inbox nevidljiv osim direktnog URL-a/notifikacije.
- v1.2: ukloniti tri UI gate-a; `BLOCKED_APPROVAL` kao stanje run-a (danas jedinica održivosti je held tool call, `chat-approval-hook.ts:95-105` 24h TTL; posle odobrenja `executeHeldAction` izvršava samo taj alat bez nastavka run-a — F-CAP-08); decline sa opcionim trajanjem kao negativni grant u `ApprovalGrantStore` (danas deny je one-shot, F-CAP-09); expiry held akcije postoji i testiran je (`held-action-executor.test.ts:187`) (VEĆ ZATVORENO delimično — samo expiry); revoke postoji u kodu (`approval-grants.ts:286`, `routes/approval.ts:120`), test **NIJE nađen** na `2af0904d` (samo UI mockovi `ApprovalsApp.test.tsx:17`, `p7-b1-approvals-error.test.tsx:16`) — RED test nedostaje (§15 AT-12). Model, hook ni IM poruka ne mogu poništiti decline/revoke (AT-12).

### FRD-06.7 — Shared actions — PREDLOG — SMER BRIEFA (DIR-12) + DELIMIČNO/NEPOVEZANO

Ista poslovna radnja kroz UI/agent/rutinu deli: ulaznu šemu, scope, side-effect klasu, validaciju, approval, rezultat, audit, idempotency. Stanje: `ACTION_REGISTRY` (`command-registry.ts:108-181`, 4 akcije, samo NL command bar); agent tool + held action već dele `ToolDefinition` (`held-action-executor.ts:213-233`); UI klikovi idu direktno na REST bez registry-ja (F-CAP-13). v1.2: proširiti `ActionDescriptor` kao izvor istine za side-effect endpointe koje UI već koristi; agent ne potvrđuje sopstveno odobrenje; browser automatizacija spoljnih aplikacija ostaje odvojena sposobnost. BuilderIO/agent-native = pattern reference only — PREDLOG — SMER BRIEFA (§19 R20; external.md §2.1 „PREDLOG: pattern reference only”), u skladu sa ODLUKA D-17 (redosled Borrow→Adapt→Build; D-17 ne propisuje ovu presudu). Licencne činjenice i sposobnosti (EXT-5: root `license: ISC`, GitHub `license: null`, paketi MIT bez LICENSE teksta; durable/replay garancije nedokazane) — NALAZ AUDITA — ZA PROVERU (live 27.09.2026, izvor: external.md §2.1, §8).

### FRD-06.8 — Skills i učenje — PREDLOG — SMER BRIEFA (brief §9.5)

Sačuvati create/distill/audit/hygiene/retire/recommend gde su aktivni (pozivaoci: NEPOZNATO u fazi A za svaki pojedinačno). Self-evolving skill ne može promenom instrukcije dodati mrežni scope, novi binary ili zaobići approval. Uvoz paketa ≠ upotreba na Qwen-u (dependencies, tool nazivlje, model-specifične instrukcije proveriti). Status: PREDLOG — SMER BRIEFA + NEPOZNATO (stanje pojedinačnih putanja).

---

## 7. Hive Mind kontekstna petlja

### FRD-07.1 — Preserve retrieval first — ODLUKA (D-12) + PREDLOG — SMER BRIEFA (DIR-09) + POTVRĐENO NA REVIZIJI

`recallMemory` (`orchestrator.ts:582-978`): importance K5, semantic personal, semantic workspace, date-window, profiles, facts 60, events 40, RAWDETAIL K=6 (`:858-894`), catch-up grana, empty-mind fast path, read-side injection scan (`:923-933`), temporal anchor. Pozivaoci: `chat-turn-preparation.ts:237`, `chat.ts:390`, `command.ts:266`, `commands.ts:74`. Pin testovi: `orchestrator-recall-hardening`, `w41-temporal-recall`, `r2-recall-closure`, `w46-rawdetail-recall`, `orchestrator-memory-boundary-pins` (nisu izvršeni u fazi A). Engine se **ne menja**; `ContextPackage` je omotač (§2.7).

### FRD-07.2 — Tri skladišne odgovornosti — PREDLOG — SMER BRIEFA (brief §8.2)

| Sloj | Uloga | Stanje |
|---|---|---|
| RAWDETAIL / izvorni materijal | verbatim dokaz za retrieval i tačno citiranje; **nije** naučena činjenica | lane aktivan po defaultu (reranker default ON, `orchestrator.ts:564`; komentar `:106-109` zastareo); korpus pune **samo** harvest putevi (`routes/harvest.ts:661`, `memory-mcp/src/tools/harvest.ts:316`, `hive-mind-mcp-server/src/tools/harvest.ts:318`) → živi chat nije pokriven; reranker model (~22 MB ONNX) se ne bundluje u installer → na svežem offline desktopu lane verovatno neaktivan do prvog online recall-a — POTVRĐENO NA REVIZIJI + NALAZ AUDITA — ZA PROVERU (F-HM-01, refute) |
| Izvedena memorija | činjenice/odluke/preference/veze/sažeci/potvrđeni ishodi/korekcije sa poreklom | postoji (frames, KG, lanes) |
| Execution state | runovi, checkpoints, retries, grants, leases, budžeti — **nije** memory frame | Loop `loop:<id>` state je u Awareness sloju i **ulazi u recall** (`awareness.ts:142-168 toContext()` bez filtera → `context-loader.ts:111-120` → `orchestrator.ts:315-316`) kao red „- Loop: <name>” pod „Pending Items” — POTVRĐENO NA REVIZIJI (refute F-DUR-09 HOLDS+) → premestiti u run store (§1.5) |

Hook `temporary` frejmovi: svaki UserPromptSubmit se čuva kao `importance:'temporary'` (`handlers-core.ts:148`, `user-prompt-submit.ts:50`); TTL 30 dana **postoji i ima server cron** `memory_compact` (`packages/server/src/local/index.ts:2033-2058`, seed `setup-crons.ts:35` `30 3 * * *`) — refute F-HM-02 WEAKENED: mehanizam postoji; da li cron zaista radi na desktopu = DELIMIČNO/NEPOVEZANO (E2E neprovereno).

### FRD-07.3 — Retrieval exclusion `temporary` — PREDLOG (F-HM-03, F-CAP-05d)

Waggle recall isključuje `temporary`/`deprecated` (`orchestrator.ts:728-737`, `context-loader.ts:77-88`, `executor-brief.ts:66`) — POTVRĐENO. Hook recall **ne** isključuje: `hook-runtime.ts:237` `WHERE importance != 'deprecated'`; MCP `recall_memory` tretira importance kao skor (`search.ts:37-43`) — POTVRĐENO NA REVIZIJI. v1.2: `NOT IN ('deprecated','temporary')` + post-filter identičan `isAuthoritativeForRecall` za MCP; ne lomi `hook-runtime.test.ts:126-137` (limit 2).

### FRD-07.4 — Izolacija minds — ODLUKA (D-12) + ISTORIJSKA FOUNDER ODLUKA (memorija, 2026-06-12) — usklađena sa D-12 (AT-13) + POTVRĐENO NA REVIZIJI (leak)

- Leak nije jedno mesto nego **četiri**: `external-tool-runs.ts:964-977`, `chat-collaboration.ts:802-814`, `fleet-run-executor.ts:924-936` (default `memoryScopes = ['personal','workspace']`, `:729`), `agent-groups.ts:719-729` — svaki upisuje `Summary` (do 1000 znakova) u personal mind sa `importance:'normal'`, `source:'agent_inferred'`; `recallMemory` pretražuje personal na svakom upitu; MCP default scope `personal` (F-HM-05).
- Ugovor: run sažetak ostaje u workspace mind-u; personal dobija najviše content-free pointer (`Run/Workspace/Status`, `importance:'temporary'`). Izvedena činjenica nasleđuje ograničenja izvora; klasifikator/evolution je ne mogu proglasiti javnom (brief §8.3).
- **Upozorenje iz refute-a (F-HM-05 WEAKENED):** fleet policy gate (`fleet-run-executor.ts:101-106`) tretira saved-agent **bez** `personal` u `memoryScopes` kao UNSUPPORTED (fail-closed), pinovano `fleet-isolation.test.ts:203`; pozitivan test `:496-525` pinuje personal kao obavezan → promena zahteva redefiniciju policy gate-a, ne samo default-a. Testovi koji se lome: najmanje `agent-groups.test.ts:362`, `external-tool-runs.test.ts:259`, `fleet-isolation.test.ts:203,519-522`, `external-tool-runs.test.ts:245-260,319-335`. Sentinel izolacioni test ne postoji (AT-13). Status: NALAZ AUDITA — ZA PROVERU (runtime repro Workspace A → chat u Workspace B).

### FRD-07.5 — `WAGGLE_CONTEXT_INJECTED` je koordinacija, ne autorizacija — PREDLOG — SMER BRIEFA (brief §8.3) + PREDLOG

- Marker uparen sa `runId` + `contextRef.hash` + očekivanim izvršnim putem; hook ne prihvata nepoverljiv sadržaj koji tvrdi „već verifikovan kontekst” i **ne preskače** scope/taint proveru.
- Stanje: 0 pojavljivanja; dupla injekcija moguća (route-proposal prependuje brief `route-proposals.ts:205-207` **i** SessionStart hook ubrizgava sopstveni recall `session-start.ts:80`); `WAGGLE_ENV_ALLOWLIST` (`external-process-env.ts:29-35`) nema marker; hookovi ne čitaju `WAGGLE_RUN_ID` (F-HM-08, F-HM-12). NEPOZNATO: da li Claude Code `--safe-mode` suzbija SessionStart hookove (refute F-HM-08). Minimalno: env marker u allowlist uz `WAGGLE_RUN_ID`; SessionStart skraćuje/preskače recall kad marker + run id postoje; `frame-encoder.ts` dodaje `run:<id>` token.

### FRD-07.6 — Eksterni izvršioci — ODLUKA (D-11) + PREDLOG — SMER BRIEFA (DIR-10) + DELIMIČNO/NEPOVEZANO

- Isti Workspace, eksplicitan izvršilac; native agent ostaje glavna individualna putanja. Rezultat = status, izlaz, artefakti, poznata ograničenja; `toolsUsed` iz stream-a alata označen `tool-reported`, ne server-provereno (F-HM-14: `external-tool-runner.ts:519,531` → `external-tool-runs.ts:922-932` bez oznake porekla).
- Predaja konteksta: samo route-proposal put ima `buildExecutorBrief` (F-HM-11); `/api/tools/run` i interaktivni launch ne. v1.2: `ContextPackage.executorPayload` za svaki put (opt-in do W2). Key leakage: env allowlist fail-closed i redakcija `/(KEY|TOKEN|SECRET)$/` u event tekstu postoje (`external-process-env.ts:8-35`, `external-tool-runner.ts:588-595`); **rupa**: hook SessionStart inject ne rediguje tajne iz recalled sadržaja (`session-start.ts:46-60`, `handlers-core.ts:77-90`); `redactSecrets` živi u `@waggle/agent` (`eval-dataset.ts:133`), hook paketi ga ne mogu uvesti bez nove zavisnosti → primeniti u `hook-runtime.ts` (refute F-HM-13). Read-side scan u hook putu ne postoji (F-HM-04).
- Kvalifikacija po harness-u (Claude Code/Codex/Hermes): detekcija, autorizacija, predaja konteksta, radni dir, dozvole alata, timeout/cancel, povrat rezultata, capture sa `workspace/run` identitetom — workspace capture POTVRĐENO (`cli-bridge.ts:240,404-408` → `hook-runtime.ts:121-187 resolveMind`), run id NIJE POVEZANO (F-HM-12). E2E tok nije pokrenut u fazi A → NEPOZNATO. U KVARK režimu izvršilac koji zahteva neodobren cloud endpoint nije raspoloživ (D-03).

### FRD-07.7 — Idempotentna konsolidacija — PREDLOG (brief §8.2, AT-14)

Ključ `(runId, outputHash)` u metadata run zapisa; provera `createPFrame` dedup-a (`cognify.ts:64-70`, nije proveren). Content-hash dedup (`frames.ts:109-111,289-294`), lane dedup (`extract-memory-lanes.ts:284`), distill replace-on-update (`weaver/src/consolidation.ts:226-236`) postoje — POTVRĐENO NA REVIZIJI (F-HM-16).

### FRD-07.8 — LoCoMo regression gate pre merge-a — PREDLOG (A26)

Nema CI gate-a (grep `locomo` u `.github/workflows/` = 0); ručni same-judge run + `benchmarks/results/locomo-sota-2026-06/recount.mjs` postoje (F-HM-15). v1.2: procesni gate za svaku promenu render bajtova recall bloka (ne nužno CI za G1). Kanonski broj: **86.49%** (MEMORY.md SOTA index; 87.66 povučen). Status: DELIMIČNO/NEPOVEZANO.

### FRD-07.9 — Dva MCP servera — ODLOŽENO (R23) + POTVRĐENO NA REVIZIJI

`waggle-memory-mcp` (ima `erase`) vs `@waggle/hive-mind-mcp-server` (nema `erase`); 15 različitih fajlova; hook put dozvoljava samo `save_memory/recall_memory` (`hook-call.ts:29-30`) pa hook lanac ne može zvati erase; rizik za korisnika koji direktno koristi hive-mind CLI/MCP (F-HM-17). Bez spajanja u ovom obimu; divergencija `erase` evidentirana za AT-15.

---

## 8. Evolution pipeline

### FRD-08.1 — Mapa „ko poziva → šta proizvodi → gde se čuva → aktivna verzija → naredni run” — PREDLOG — SMER BRIEFA (DIR-13) + POTVRĐENO NA REVIZIJI (F-EVO §0)

| Modul | Pozivaoci | Naredni run koristi? |
|---|---|---|
| `AgentLearning` (`agent-learning.ts:43`) | 0 (samo barrel `index.ts:231`) | **Ne** — mrtav kod; `recordPersonaTask` bez producenta → PRD tvrdnja o persona effectiveness nema producenta |
| `processInteractionForImprovement` (`improvement-wiring.ts:97`) | 0 | **Ne** |
| `analyzeAndRecordCorrection` (`chat-turn-completion.ts:253-261` → `improvement-detector.ts:81-98`) | svaki turn kad `allowDerivedPersistence` | **Da** — tekstualne korekcije **već** proizvode `improvement_signals('correction')` i ulaze u `# User Corrections` (`chat.ts:1485-1496`) (refute F-EVO-09: S1/faza A pod-tvrdnja „samo thumbs-down” je REFUTED) |
| `markCorrected` (`execution-traces.ts:473`, `trace-recorder.ts:234-236`) | 0 | **Ne** — trag prethodnog turna nikad ne postaje `corrected`; `chat-turn-completion.ts:371-375` uvek `success`, komentar netačan |
| `markSurfaced` | NEPOZNATO (grep: samo `improvement-detector.ts:206-208`) | ako nema pozivaoca, signali ostaju `surfaced=0` i akumuliraju se u promptu |
| `EvolveSchema` Stage 1 (`compose-evolution.ts:174-184`) | `runOnce` ← `POST /api/evolution/run`, `EvolutionService` | **Ne** — `frozenSchema` ne ide u Stage 2 (`:191-196`), deploy je ignoriše (`routes/evolution.ts:51-82`), UI ne renderuje (F-EVO-05); troši 5×3×32 + anchor 100 LLM poziva (`evolve-schema.ts:830-835`) |
| GEPA winner → persona override (`{dataDir}/personas/<id>.json`) | isto | **Ne** — `listPersonas()` = `[...PERSONAS, ...custom]` (`personas.ts:67-70`), `resolvePersona = find()` (`chat.ts:439-440`) vraća ugrađenu; isti obrazac `fleet-run-executor.ts:127,590`, `agent-groups.ts:87`, `fleet.ts:354`; repro `docs/plans/v1.2-evidence/phaseA/repro-shadow.mjs` (F-EVO-01) |
| GEPA winner → behavioral-spec override | isto | **Da** (`index.ts:626-635`, `chat.ts:1441-1444`) — VEĆ ZATVORENO / radi (F-EVO-11); `systemPromptCache` nije vezan za event, ali `historyLength` u ključu čini sledeći turn cache miss-om |

**Odluka wire-vs-remove za `AgentLearning`/`improvement-wiring`:** otvorena (R18: funkcionalni cilj ostaje; mrtav kod nije feature, brisanje nije „rešeno učenje”). Ispravan minimalChange (refute): **ne** duplirati `analyzeAndRecordCorrection`; dodati `markCorrected` na trag prethodnog turna kad `detectCorrection` pogodi, `recordPersonaTask` iz `finalizeOnce`, i odluku za `formatLearningPrompt` kao drugi kanal. Status: PREDLOG.

### FRD-08.2 — Active-version pointer i rollback — PREDLOG (AT-04)

- `resolvePersona` mora vratiti aktivnu verziju (custom sa istim `id` zamenjuje ugrađenu: `Map` po `id`, custom poslednji) — ne lomi `personas.test.ts:43-47` ni `personas-routes.test.ts:121-140` (refute F-EVO-01).
- Baseline endpoint (`routes/evolution.ts:259` → `getPersona` built-in only; `evolution-service.ts:277`) koristi isti resolver.
- `POST /api/evolution/runs/:uuid/rollback` poziva postojeće `rollbackPersonaOverride`/`rollbackBehavioralSpecOverride` (`evolution-deploy.ts:119-135,220-235`, **0 pozivalaca** van testova) + status `rolled_back` (migracija `CHECK`). Backup je jednonivovski `.bak` (`:79-82`) → višekoračni rollback zahteva registry, ne fajl.
- `persona:reloaded` nema konzumenta (jedini `on` je `behavioral-spec:reloaded`, `index.ts:630`); WS relej (`index.ts:3189`) ne prenosi evolution evente; docs `05d-subsystem-evolution.md:94` tvrdi invalidaciju cache-a koja ne postoji (F-EVO-10).
- Postojeći run ostaje na pinned verziji (`DurableRun.modelRef` + `recipeVersion`); precedent `fleet-run-executor.ts:589-591` persona snapshot.
- **Redosled:** F-EVO-01 → F-EVO-10 (activation check pre `markDeployed`; ako se uvede pre popravke shadowing-a, `evolution-routes.test.ts:169-188` pada).

### FRD-08.3 — Kandidat se izvršava pre ocenjivanja — VEĆ ZATVORENO (produkcione putanje) + NEPOZNATO (route-level test)

`makeRunningJudge` (`evolution-llm-wiring.ts:415-452`) + guard `iterative-optimizer.ts:173-184` (baca za bare judge bez `allowBareJudge`) + brend kroz `filterJudgeFeedback` (`compose-evolution.ts:142-149`); testovi `iterative-optimizer.test.ts:424-445`, `evolution-llm-wiring.test.ts:266-330` (F-EVO-03). Komentar `iterative-optimizer.ts:393-397` zastareo. Nedostaje route test da `complete()` = 2 poziva po primeru (execute + judge); stub sa `callCount()` postoji u `evolution-run-route.test.ts:37-58`. AT-05.

### FRD-08.4 — Executor ≠ judge poželjno, ne obavezno; lokalni judge default — PREDLOG — SMER BRIEFA (§18 A19 „IZMENITI APSOLUTNI USLOV”, brief §10.4) + POTVRĐENO NA REVIZIJI (stanje)

- Stanje: jedan `llm` za baseJudge, runningJudge, schemaExecute, mutate (`routes/evolution.ts:365,376-379`); `createAnthropicEvolutionLLM` hard-kodira `anthropic` + Haiku (`evolution-llm-wiring.ts:214-260`); `buildRunPrompt` = kandidat + „USER INPUT” u jednom user turnu bez `composePersonaPrompt`/alata/korisnikovog modela (`:454-461`); nema modela ni per-example izlaza u `artifacts` (`evolution-orchestrator.ts:230-235`); 422 bez Anthropic ključa (`routes/evolution.ts:355-363`); nema KVARK/offline guard-a; `EvolutionTab.tsx:1296` statični disclaimer „costs a few cents” nije procena/cap/consent i ne kaže da tragovi odlaze Anthropic-u (F-EVO-04, F-EVO-08).
- Ugovor: `EvolutionLLM` adapter nad provider router-om / izabranim lokalnim modelom (ugovor `complete(prompt)` zadržan → testovi ne pucaju); izvršenje kroz `composePersonaPrompt(core, {systemPrompt: candidate})`; `executorManifest` + per-example izlazi (redigovani) u `artifacts`; jedan lokalni model sme biti generator i rubric evaluator u odvojenim ulogama uz **eksplicitno označen rizik pristrasnosti**; druga familija = poželjna nezavisna kontrola. Cloud/BYOK judge: eksplicitan `consent` flag, minimizacija, redakcija (`EvalDatasetBuilder.build()` secret scan), pre-run procena, hard cap (`maxJudgeCalls`), abort (plumbing već postoji: `IterativeGEPAOptions.signal`, `runOnce(signal)`; SSE close namerno ne prekida run `routes/evolution.ts:458-462`). U KVARK režimu cloud judge nije dozvoljen (D-03). Status: PREDLOG.

### FRD-08.5 — Bounded recipe registry — PREDLOG — SMER BRIEFA (DIR-14) + PREDLOG (net-new; obim zavisi od founder odobrenja obima ODB-02, Delivery plan §6.1, W3e-PR9a..e)

- Mali registry odobrenih varijanti za research/document posao (npr. osnovni postupak vs + kontradikciona provera vs dozvoljena retrieval/review varijanta). Kandidati menjaju instrukcije, raspored odobrenih opcionalnih faza i budžete **unutar limita**.
- Invariants nepromenljivi: scope, egress zabrane, approvals, budget cap, obavezni gates, kontaminaciona granica, značenje uspeha (`HarnessRecipeVersion.invariants`). Recipe koji dobija bolji score preskakanjem bezbednosne provere **nije kandidat** za promociju.
- Stanje: `EvolutionTarget` nema recipe target (`iterative-optimizer.ts:88-93`) — net-new; nije sadržan u S1 W3e (koji isključuje recipe evolution). Planer posebno procenjuje; ako se odloži, prikazati koji korisnički ishod i javna tvrdnja otpadaju (brief §10.3). Status: PREDLOG (obim predlaže Delivery plan; otvoreno → ODB-02, Delivery plan §6.1).

### FRD-08.6 — Promotion policy — PREDLOG — SMER BRIEFA (DIR-15) + POTVRĐENO NA REVIZIJI (greške)

- Baseline i kandidat ponovo ocenjeni na **istim primerima i budžetu**; metric-appropriate CI; minimalna praktična razlika; regresija po task shape-u; latency/compute cap; postupak za grader grešku; `null` scorer ne ispada iz imenitelja; razdvojiti neuspeh modela/alata/infra/budžeta/evaluatora.
- Stanje: baseline ocenjen samo na `microSample` (`iterative-optimizer.ts:205-211`); anchor ocenjuje samo `survivors` (`:302-311`); `delta = winner.overall − baseline.overall` iz različitih faza kad je baseline dominiran ranije (`:315-325`; `evolution-orchestrator.ts:184-190` komentar netačan uslovno); `combinedDelta = GEPA overall − schema accuracy` (dve metrike, `compose-evolution.ts:198-200`); `scoreOne` `null` → filtrirano (`:398-416`) dok running-judge greška → score 0 **ulazi** u prosek (`evolution-llm-wiring.ts:439-447`, `judge.ts:141-151`). Repro `docs/plans/v1.2-evidence/phaseA/repro-gepa-delta.mjs`: `n=50` vs `n=400`, delta 0.2660 vs 0.2500 na istom uzorku (F-EVO-06).
- **Upozorenje:** uklanjanje/preimenovanje `combinedDelta` lomi `compose-evolution.test.ts:342-371` (refute).
- Dataset governance (A17, F-EVO-07): orkestrator zaobilazi `build()` (`evolution-orchestrator.ts:311-326` → `sourceFromTraces(['success','verified'], true, …)`); nema secret scan-a (repro: `sk-ant-…` stigao do judge-a), splita/holdout-a, dedup-a; `corrected` → `expected_output = correctionFeedback` (korekcija kao gold); `traceFilter = {}` → tragovi svih persona i workspace-a ulaze u kandidata jedne persone (scope leak, AT-13). v1.2: `build({ traceFilter: { personaId, workspaceId }, includeCorrections:false, seed })`; GEPA na train+val; finalni upareni score na holdout; `holdoutViews` evidentiran; „≥30” nije univerzalna dovoljnost. Korekcija = signal, ne gold. Status: PREDLOG.

### FRD-08.7 — UX istinitost — PREDLOG — SMER BRIEFA (DIR-13 „ukloniti lažne UX tvrdnje”) + POTVRĐENO NA REVIZIJI

`EvolutionTab.tsx:759,771,883,237-249`: „Accept & Deploy”, „hot-reloads the spec” (prikazano za oba target kind-a; tačno samo za behavioral-spec), „deployed lift”, „score-verified”. v1.2: status odražava aktivaciju (`written_not_active`), copy zavisi od target kind-a, „score-verified” tek uz upareni holdout (F-EVO-10).

---

## 9. Attention / WorkItem i Routines

### FRD-09.1 — Attention normalizacija — PREDLOG — SMER BRIEFA (DIR-18) + PREDLOG

WorkItem (§2.9) iz Gmail/GCal/Outlook/Slack konektora koji već postoje (`packages/agent/src/connectors/*`; E2E nije proveravan — NEPOZNATO). **Jedan** početni scenario i stvarna putanja autorizacije se imenuje u Delivery planu/decision queue (brief §20.3), ne ovde. Zahtevi: background incremental sync ≠ health probe ≠ ručni fetch; cursor/delta persistence (`historyId`/`syncToken`/delta), izgubljen cursor, dedup, revoked credentials, retention, labeled eval skup za precision/false-positives (AT-24). Kanal profili po EXT-11 (pravila kanala/ToS: NALAZ AUDITA — ZA PROVERU (live 27.09.2026, izvor: external.md §5, §8); repo stanje adaptera — `whatsapp-adapter.ts:2,5`, nema Viber adaptera — POTVRĐENO NA REVIZIJI): WhatsApp = export/import (+roadmap; live personal NE; `whatsapp-adapter.ts:2-5` sam kaže da Baileys krši ToS), Viber = bot/forward ili drop, Discord = bot/forward, Telegram = Bot API (user API roadmap uz ADR), Slack = user token uz ToS ograničenja skladištenja (pravno ZA PROVERU), Gmail = restricted scopes → OAuth verifikacija + CASA (izuzeće za local-only desktop ZA PROVERU), MS Graph = delegated bez admin consent-a (najpovoljniji; MSA nalozi ZA PROVERU). Bez blanket „nema API” tvrdnji.

### FRD-09.2 — Injection iz harvestovanog sadržaja — PREDLOG — SMER BRIEFA (§18 A13 „PRIHVATITI UZ OGRANIČENJE”) + POTVRĐENO NA REVIZIJI

Scan na ingestion **VEĆ ZATVORENO** (`harvest/pipeline.ts:108-142` Pass 0 `evaluateExternalMemoryIngress`; `connector-harvest.ts:189-191`; `extract-memory-lanes.ts:298`). Taint kao tipizovano polje **ne postoji** (grep `taint` samo komentari) → `ContextPackage.sources[].taint` (§2.7). Scanner je regex-only (`injection-scanner.ts:22-56`) = defense-in-depth; zaštita policy/vault/send zavisi od approval floor-a (`tool-executor.ts:184-226`) i `ALWAYS_CONFIRM` (`confirmation.ts:16-29`) — ispravno; AT-19 test „put bez ključne reči” ne postoji (F-CAP-05).

### FRD-09.3 — Routines = trigger, ne nova inteligencija — PREDLOG — SMER BRIEFA (DIR-19) + POTVRĐENO NA REVIZIJI (stanje)

- Rutina = schedule/event trigger za dozvoljeni work recipe sa `occurrenceId`, budžetom, Workspace-om, policy-em i kanalom rezultata; bez zasebne „routine harness family” (R05). Reuse: `CronStore` + `LocalScheduler` (`cron-store.ts`, `cron.ts`, 8 `job_type`-ova `index.ts:1913-2706`) + `AutomationCenterApp` (next run, pause/run-now, history, L2 approvals — F-DUR-11).
- Odobrenje za dnevni nacrt ≠ odobrenje za slanje. Pause/disable rutine ≠ mid-phase pause izvršioca.

### FRD-09.4 — Misfire, DST, timezone, occurrence, fencing — PREDLOG (AT-23) + NALAZ AUDITA — ZA PROVERU

- Ugovor: `timezone` polje po rutini; misfire politika eksplicitna po rutini: `skip` | `catch_up_one` | ograničeno pravilo; DST prelaz definisan; restart/dupli događaj ne proizvodi duplu occurrence radnju; budžet occurrence-a se ne resetuje; `occurrenceId` u executor potpisu; lease fencing (§4.3).
- Stanje (F-DUR-10, POTVRĐENO): `getDue()` = `enabled=1 AND next_run_at <= datetime('now')` (`cron-store.ts:367-371`); `markRun` samo posle uspeha (`cron.ts:276`) → neuspeh re-fire svakog tick-a do 5-strike auto-disable (`cron.ts:55,307-311`); `computeNextRun` bez `tz` (`cron-store.ts:203-206`, cron-parser 4.9.0 → lokalna zona procesa); `sweepInterruptedRuns` ne dira `next_run_at` → ista occurrence se ponovo izvršava posle crash-a (za `ai_task` sa `proposeHeld` = dva held reda za isti intent, F-DUR-14 grana aktivna); nema `timezone` polja; DST ponašanje netestirano (NEPOZNATO).
- **Novi nalaz iz refute-a (F-DUR-10):** `computeNextRun` upisuje ISO sa `'T'` (`next().toISOString()`), a `getDue` poredi sa `datetime('now')` (`YYYY-MM-DD HH:MM:SS`, razmak); BINARY kolacija `'T'(0x54) > ' '(0x20)` → `next_run_at` istog UTC datuma je **uvek veći** od now → sub-dnevna rutina radi najviše jednom po UTC danu, dnevna `0 9 * * *` kasni do 00:00 UTC narednog dana. SQL probe nad `:memory:` better-sqlite3 izvršen; `CronStore` nije → **NALAZ AUDITA — ZA PROVERU**; predloženi repro: `store.create({cronExpr:'* * * * *'})` pa posle >60 s `store.getDue()` (očekivano 1, hipoteza 0). Nijedan test ne vežba realnu putanju `create()→getDue()` (`cron-ai-task.test.ts:230,280` upisuje sqlite format direktno; hardening testovi mockuju `getDue`). Ovo je G1 kandidat (istinitost rutina), pre bilo kog Routines UX rada.

### FRD-09.5 — TOOLLESS carve-out — ISTORIJSKA FOUNDER ODLUKA (memorija, 2026-06-29: „L2 assist stays TOOLLESS”) — usklađena sa brief §11.5/C15 + PREDLOG — SMER BRIEFA (§17 C15 „CARVE-OUT”) + POTVRĐENO NA REVIZIJI

Loops L2 maker ostaje toolless (`loop-executor.ts:254-262` `chat()` bez alata; jedna predložena radnja → held queue `index.ts:2632-2645`). Odobrena **rutina** može pokrenuti tool-using work run kroz isti permission/durable sloj pod **drugim ugovorom** (superseding ADR (7), brief §20.2), bez silent acquisition. Loop cross-tick state seli u run store (§7.2). Status: ISTORIJSKA FOUNDER ODLUKA (memorija, 2026-06-29: L2 toolless; usklađena sa brief §11.5/C15) + PREDLOG — SMER BRIEFA (C15: odobrena rutina pod drugim ugovorom) + PREDLOG (ADR-07).

---

## 10. Model readiness i hardware ladder

### FRD-10.1 — Readiness je live dokaz — PREDLOG — SMER BRIEFA (DIR-17, §18 A20) + POTVRĐENO NA REVIZIJI (false positives)

- `useHasWorkingModel.ts:171-174` `transient` → `ready` kad je sidecar offline ili probe `verified:false` bez odbijanja; `:129-136` treći false positive (default-model probe `configured && !verified && !rejected` → `ready:true`); `:244-245` `localReady = localModelCount > 0` (count-based iz `/api/tags`). Ponašanje je namerno i regresiono zaključano (`5e2de2b8`; testovi `useHasWorkingModel.test.ts:271-281,301-307,486-495` postaju RED uz fix). `ModelGate.tsx:257-261` ista logika inline (F-UXM-02).
- Probe: `probeConfiguredModel` (`settings.ts:103-164`) `max_tokens: isQwen ? 32 : 1`, `verified = content.length > 0` (ne proverava `WAGGLE_OK`); timeout/cold start/mreža/HTTP ≠401/403 → identičan `{configured:true, verified:false}`; nema tool/structured-output round-trip-a (F-UXM-03). Router readiness `probeReadyOllamaModel` (`anthropic-proxy.ts:848-917`) je format-only (`/api/show` capabilities).
- Ugovor: `ModelReadiness { modelRef, generation: { ok, sampleHash, latencyMs }, toolRoundTrip?: { ok, protocol } (obavezan za work profil), reason: 'ok'|'timeout'|'unreachable'|'cold_start'|'http_error'|'empty_content'|'auth_rejected'|'model_not_found'|'tool_format_incompatible', probedAt }`; `ready` **samo** posle stvarne generacije; različite poruke po `reason`; format-only provera nije „verified”. Status: PREDLOG.

### FRD-10.2 — Hardware ladder polja — PREDLOG — SMER BRIEFA (brief §11.3, §18 A21) + PREDLOG

`HardwareLadderRow { modelRef: { id, hfRevision, license }, weightFormat, quant, diskDownloadGb, diskCacheGb, ramGb, vramGb | unifiedMemoryGb, contextTokens, kvCacheGb, cpuOffload: bool, concurrency, measuredLatency: { taskShape, p50Ms, p95Ms, hardwareProfile }, runtime: { name, versionPin, archTag }, supportedProfile: 'managed_windows' | 'existing_ollama' | 'openai_compatible_endpoint' | 'byok' | 'offline_bundle' }`.
- „Model koji staje na disk nije model koji upotrebljivo radi”; **ne** pretpostavljati „24 GB GPU” iz jedne procene (brief §11.3). Zvanični VRAM/RAM po quantu **ne postoji** na HF/Ollama (EXT-3) → meriti.
- Stanje: `hardware-detect.ts:7-19` NVIDIA + Apple + CPU only; AMD/Intel/WMI namerno nije izgrađeno (`:330`) → AMD/Intel Windows laptop pada na `cpu_only` (F-UXM-05); pull `stream:false` + 45 min timeout, bez progresa/resume oglašavanja (`local-inference.ts:313-332`), dok managed runtime download **jeste** resumable sa sha256 (`managed-ollama-runtime.ts:1109-1204`) (F-UXM-04); post-pull digest + live generation probe postoji (`local-inference.ts:338-377`) — kvalitetan deo.

### FRD-10.3 — Referentni model: Qwen 3.8 27B-klasa — ODLUKA (D-15) + PREDLOG — SMER BRIEFA (§17 C19 „RE-BASELINE”) + NALAZ AUDITA — ZA PROVERU (identitet: live 27.09.2026, HF/Ollama, izvor `docs/plans/v1.2-evidence/phaseA/external.md` §1, §8 — nije svojstvo revizije) + NALAZ AUDITA — ZA PROVERU (runtime)

- Identitet (EXT-1): `Qwen/Qwen3.8-27B`, HF sha `1d4bf0f2ff6012fd82039f2fa52739d0dd7c60c0`, 2026-08-14, Apache-2.0, **dense** 27B VL, `model_type: qwen3_5`, 262k ctx, thinking default-on + `reasoning_effort`, chat template ima `<tool_call>`/`<function=` markere (E2E sa Waggle tool loop-om ZA PROVERU; zvanični parser za 3.8 NEPOZNAT). Zvanični quant `Qwen/Qwen3.8-27B-FP8`; GGUF `unsloth/Qwen3.8-27B-GGUF` UD-Q4_K_M 16.5 GB / Q8_0 29 GB / BF16 54.7 GB.
- Ollama: `qwen3.8:27b` 18 GB (Q4_K_M klasa), ušao u **v0.32.12 (14.08.2026; godina izvedena — release notes „14 Aug”, external §7)**; Waggle pinuje `OLLAMA_TARGET_VERSION = '0.32.3'` / rollback `'0.32.0'` (`managed-ollama-runtime.ts:28-29`) → **pinovani runtime je stariji od prvog Qwen 3.8 release-a** (EXT-2) → repin (≥0.32.12; razumno ≥0.32.15 zbog system-message normalizacije) + pull/generate/tool test na Windows GGML + nova router/installer receipt. Status: NALAZ AUDITA — ZA PROVERU.
- Katalog: `cookbook/catalog.ts:44-51` nema Qwen 3.5/3.6/3.8; `model-fit.ts:207-214` nema pravilo za `qwen3.8` (pao bi na `qwen3`=4); sertifikovani managed model je `qwen2.5:0.5b` (`certify-windows-installer.ps1:2099`) → receipt dokazuje smoke model, ne referentni cilj (F-UXM-06). v1.2: `certificateModel` vs `recommendedModel` eksplicitno u receipt-u.
- Kontrolni baseline `Qwen/Qwen3.6-35B-A3B` (MoE 35B/3B aktivnih, sha `995ad96e…`) je **druga konfiguracija**; u produkcionom routeru ruta je cloud DashScope (`litellm-config.yaml:211-215`, EXT-4), dok benchmark harness ima lokalni vLLM unos `qwen3.6-35b-a3b-local` (`benchmarks/harness/config/models.json:61-67`) i runbook `benchmarks/gaia2/PILLAR1-QWEN-LOCAL-RUNBOOK.md` (POTVRĐENO NA REVIZIJI) → ne prenositi score/hardver; da li su stari rezultati lokalni ili cloud = ZA PROVERU.

### FRD-10.4 — Instalacioni putevi — PREDLOG — SMER BRIEFA (brief §11.3) + PREDLOG

Managed lokalni runtime na podržanom Windows profilu; opciono postojeći Ollama; validiran OpenAI-compatible endpoint (llama.cpp/LM Studio kao preseti, R17); BYOK. vLLM = self-host/server put ili endpoint, ne obavezna one-click Windows instalacija. Fajlski `path` ≠ API `base_url`. Resumable download, checksum, slobodan disk, prekinuta instalacija, rollback, health check pripadaju kvalitetu instalacije; offline paket = zaseban supported profil.

### FRD-10.5 — Onboarding — PREDLOG — SMER BRIEFA (brief §11.2) + POTVRĐENO NA REVIZIJI (stanje)

`OnboardingWizard.tsx:97` 6 koraka, resumable (`useOnboarding.ts:27`), ModelGate hard gate (`ModelGateStep.tsx:63-65`), deterministički pre modela (dobro); prvi zadatak je `'Hello! What can you help me with?'` (`OnboardingWizard.tsx:107` `DEFAULT_FIRST_MESSAGE`) → ne proizvodi artefakt; `ALL_ONBOARDING_PERSONAS`/`getPersonasForTemplate` exists-but-unwired; onboarding **ne** traži izbor persone (F-UXM-10/12). v1.2: prvi zadatak template-specifičan sa artefaktom; opciona mail/calendar veza; bez persona/harness/MCP pitanja; višegigabajtni download nije „deset minuta” kriterijum.

---

## 11. Površine

### FRD-11.1 — Desktop je autoritativni lokalni host — ODLUKA (D-04) + POTVRĐENO NA REVIZIJI

Windows/Tauri primaran; sidecar loopback-only (`net-config.ts:24` po S1 C4); ugašen laptop ne izvršava lokalne rutine ni ne odgovara telefonu (D-14). CLI i web/self-host = podržani odvojeni instalacioni putevi sa istim backend ugovorima. Verzija instalera `0.2.0` (`tauri.conf.json:4`, `Cargo.toml:3`) vs `app/package.json:4` `0.1.0` (drift, F-UXM-01); verzija spec dokumenta ≠ verzija aplikacije (C1).

### FRD-11.2 — IM companion minimum — PREDLOG (R02, brief §11.6) + POTVRĐENO NA REVIZIJI (stanje)

Postojeći kanali (`channels/{manager,pairing,chat-client,routes}.ts`; deny-by-default, `/pair` single-use kod 10 min TTL in-memory, dedup 24h in-memory, rate limit 10/min) daju status/rezultat/forward; **approve/deny preko IM je namerno isključeno u v1** (`manager.ts:30-31 APPROVAL_NEEDED_REPLY`, `chat-client.ts:11-13`, `docs/plans/CHANNELS-ARC-2026-07-09.md:23`) (F-CAP-10). v1.2 (G3): potvrda vezana za `pending_action.id`/`actionId` kroz kratkotrajni one-time token, payload fingerprint, expiry; replay/forward tuđe potvrde ne daje grant; `senderId` sam nije dovoljan (AT-25). Bez izlaganja loopback sidecar-a javnom internetu; LAN/VPN/relay/PWA su eksplicitne alternative; Waggle relay = kasnija usluga.

### FRD-11.3 — Worker granica (C20) — PREDLOG — SMER BRIEFA (§17 C20 „EXPLICIT BOUNDARY”) + POTVRĐENO NA REVIZIJI

`packages/worker` (BullMQ/Redis/Postgres) ima sopstvene `chat/task/waggle/group/cron` handler-e; `chat-handler.ts:11-24` zove `runAgentLoop` direktno sa LiteLLM default modelom; **nula** referenci na `recallMemory|buildSystemPrompt|Orchestrator|PERSONAS|MultiMind|FrameStore` (F-TK-10). Lokalni core ima jedinstvene ugovore; worker se izoluje ili vezuje za KVARK, bez novog Solo dupliranja; ADR (9). Teams server startuje samo uz `DATABASE_URL` + `CLERK_SECRET_KEY` (`local/index.ts:3585-3614`) (F-TK-08). Sudbina po komponenti (KVARK adapter / izdvojiti / legacy / ukloniti uz test) = Delivery plan, ne ovaj FRD.

### FRD-11.4 — KVARK connect — PREDLOG — SMER BRIEFA (DIR-20, §18 A27) + PREDLOG

`KvarkConnection { baseUrl, identity, tokenRef (vault), validatedAt, allowedOrgCapabilities[], sharingPolicy: 'none' (default) , revokedAt? }`. Connect = validacija konekcije+identiteta; gate na **živu konekciju** (`getKvarkConfig(vault) !== null` + health), ne na `tier === 'ENTERPRISE'` (`settings.ts:1051`, `marketplace.ts:190`); registracija `createKvarkTools({ client: new KvarkClient(getKvarkConfig(vault)) })` na mestu sastavljanja alata; Settings polja (`SettingsApp.tsx:1332-1343`, „Test Connection” `disabled`) povezati ili ukloniti; disconnect/revoke ukida dalji pristup uključujući cached org kontekst po politici; nedostupan on-prem KVARK **ne** prebacuje na personal BYOK/cloud (D-03; `handleKvarkError` već nema fallback); personal mind se ne kopira (R14). RED test za AT-26 (ADR-08-T3): server + vault `kvark:connection` + fake KVARK server health OK → tool registry ima 4 KVARK alata; bez entry-ja ili uz health fail → 0 (F-TK-11/12). Tier gate-ovi koji zaista blokiraju Solo (F-TK-19): `embeddingProviders` (FREE nema `litellm`), sesije 10/workspace, rute cost/cloud-sync/admin/team/enterprise-packs/governance, UI Approvals/Team, skill promotion — svaka dobija odluku u WB inventaru (Delivery plan), a G/PR dodelu po ADR-08 O2: G1 samo approvals, per-workspace cost i lokalni audit export (W0-PR12); session cap, `embeddingProviders` i mrtav tier kod G3 (WB-PR4); in-app „Upgrade to Team” copy G3 (WB-PR5, posle DQ-03); skill promotion G3 (WB-PR3); ovaj FRD ugovara samo: approvals (§6.6), per-workspace cost i lokalni audit export nisu iza paywall-a (brief §12.2; `cost.ts:210,272`, `settings.ts:1192`).

---

## 12. Bezbednost, privatnost, egress

| ID | Ugovor | Stanje | Status |
|---|---|---|---|
| FRD-12.1 | **Taint/provenance:** svaki `ContextPackage.source` nosi `trust` (FrameSource) i `taint`; harvestovani sadržaj = `taint:'harvested'`; tekst u njemu ne može promeniti policy, tražiti vault ili odobriti slanje (brief §11.4). | taint polje ne postoji; approval floor je stvarna zaštita (F-CAP-05). | PREDLOG — SMER BRIEFA (§18 A13) + PREDLOG |
| FRD-12.2 | **Injection defense-in-depth:** `scanForInjection` na ingest i read putu; nikad kao dokaz da sadržaj nije maliciozan. | write-side guard postoji (`hook-runtime.ts:191`; `harvest/pipeline.ts:108-142`); read-side u hook putu ne (F-HM-04); Waggle recall skenira (`orchestrator.ts:923-933`). | POTVRĐENO NA REVIZIJI + PREDLOG |
| FRD-12.3 | **Tajne nikad u promptu/trace-u/eventu:** resolver/hook/brief/evolution rediguju; test asertuje da `buildSystemPrompt`/trace/`RunEvent` ne sadrže vault vrednosti. | env allowlist fail-closed, runner redakcija, brief redakcija postoje; hook SessionStart ne rediguje (F-HM-13); evolution šalje tragove sa tajnama Anthropic-u (F-EVO-07 repro); dedicated test NEPOZNATO (F-CAP-06). | POTVRĐENO NA REVIZIJI + PREDLOG |
| FRD-12.4 | **Vault-only secrets** (CLAUDE.md §7); `kvark:connection` token u vault-u. | vault upsert generički (`vault.ts:153-171`). | POTVRĐENO NA REVIZIJI (važeće projektno pravilo `CLAUDE.md` §7 „Non-Negotiable”; nije D-nn) + PREDLOG (`kvark:connection` u vault-u) |
| FRD-12.5 | **Egress merenje po profilu:** čisto lokalni/offline profil → merenje **neodobrenog** egress-a (očekivano 0 odredišta van allowlist-e); BYOK/live-channel profil → potvrda dozvoljenih odredišta i minimizacije (ne „nula saobraćaja”); KVARK profil → zasebna on-prem model/evaluator granica. | ne postoji kao test; reranker/embedding model download (`~/.waggle/models/*`) je legitiman egress koji mora u allowlist-u offline profila ili u offline bundle (F-HM-01). | PREDLOG (brief §16 posle AT-30) |
| FRD-12.6 | **Approvals/revocation ne zavise od modelovog iskaza;** IM potvrda samo uz sigurno vezivanje. | §6.6, §11.2. | PREDLOG — SMER BRIEFA (§18 A15) |
| FRD-12.7 | **Threat model instalacija:** MCP binary/marketplace bounded (`installer.ts:392`; `forceInsecure` iz klijentskog body-ja uz audit `marketplace.ts:482-503`); `THREAT_MODEL.md` postoji (175 linija, `c520bfb0` 2026-08-24; Controls + Known Gaps) — ne pokriva inline install granicu (starter-pack/proposal, `forceInsecure`, SecurityGate), MCP binary install, egress profile ni PostHog (grep nad `git show 2af0904d:THREAT_MODEL.md` = 0) → nedostaje dopuna (ADR-10-P6). | POTVRĐENO NA REVIZIJI (mehanizam, F-CAP-06) + NALAZ AUDITA — ZA PROVERU (dokument i praznina: sopstvena read-only provera van phase-A, v. ADR-10 „Provenijencija anchora“) | PREDLOG (A14: dopuna) |
| FRD-12.8 | **Erasure/export pokrivaju nove store-ove** (run store, checkpoints, artefakti, WorkItems) kroz postojeće `erased_subjects`/`stableHarvestId`; tehnički test nije pravna sertifikacija. | `erase` postoji u `waggle-memory-mcp`, ne u hive-mind MCP (F-HM-17); checkpoint-referenced kontekst nema invalidaciju (F-HM-18). | PREDLOG — SMER BRIEFA (§18 A3) + PREDLOG |
| FRD-12.9 | **Rollback ≠ vraćanje obrisanih prava** (DIR-21): rollback koda ne oživljava obrisane podatke/opozvanu saglasnost/credentials; poslati mejl se ne rollback-uje vraćanjem baze. Mehanizam: `erased_subjects` export u snapshot manifestu (GDPR-H-04) i revocation ledger `revocations.json` (GDPR-H-05, `WAGGLE-MIGRATIONS-v1.2.md`; FRD-14.16; W1-PR15, G2) sa Klasa B restore testom koji ponovo primenjuje erasure i opozive (MIG-00.6); dokaz = AT-27. | nema ledgera opoziva: `VaultStore.delete` i `ApprovalGrantStore.revoke` brišu bez traga (GDPR-H-05: grant `revoke` POTVRĐENO NA REVIZIJI [F-CAP-09], ostalo NALAZ AUDITA — ZA PROVERU); snapshot/restore ne postoji u kodu (GDPR-H-04). | PREDLOG — SMER BRIEFA (DIR-21) + PREDLOG (ledger) |
| FRD-12.10 | **Licence/NOTICE konzistentnost** (C5): `packages/optimizer/LICENSE`, `packages/weaver/LICENSE` „proprietary and confidential” uz `"license":"MIT"` u package.json; 3 hive-mind NOTICE fajla proglašavaju agent/evolution/vault/tiers/Tauri/WaggleDance vlasničkim i referišu nepostojeći `EXTRACTION.md`; 9 manifesta bez `license`; repo je **javan** (live GitHub 27.09.2026) dok CLAUDE.md/AGENTS.md/README kažu „remains private” (F-TK-13, F-REL-08). | POTVRĐENO NA REVIZIJI (fajlovi) / NALAZ AUDITA — ZA PROVERU (odluka) | NEPOZNATO — otvoreno: DQ-02 (licencna realizacija, brief §20.3); ne otvara D-01 |
| FRD-12.11 | **Jedan telemetry prekidač + disclosure** (PRD-02-12; ADR-10 O4; zamenjuje FRD v1.1 §12 „any future cloud telemetry is opt-in”): Settings „anonymous telemetry” prekidač upravlja lokalnim telemetry store-om **i** PostHog-om iz istog handler-a (`optOutPostHog`/`optInPostHog` uz `adapter.toggleTelemetry`) ili PostHog radi sa `opt_out_capturing_by_default: true` dok korisnik ne uključi; onboarding disclosure (šta se šalje, kome) **pre** prvog `onboarding_complete` capture-a; release checklist stavka „`VITE_POSTHOG_KEY` upečen u kandidat?”. Test (ADR-10-T2): toggle OFF → `localStorage['waggle:telemetry-opt-out']==='true'` i `posthog.capture` nije pozvan; ON → oba sistema uz prikazan disclosure. | PostHog capture postoji i default je opted-in kad je ključ upečen; Settings prekidač ga ne gasi (`apps/web/src/lib/posthog.ts:39,42,49-60,114-127,133-166`; `SettingsApp.tsx:722-731`; `OnboardingWizard.tsx:463`; 0 pozivalaca `optOutPostHog`/`optInPostHog`); `grep POSTHOG` u `.github/workflows/*.yml` i `app/package.json` = 0 → da li je ključ u kandidatu NEPOZNATO (ADR-10-K3). | NALAZ AUDITA — ZA PROVERU (ADR-10-K3, sopstvena provera writera van phase-A) + PREDLOG (G1: Delivery plan W0-PR17, TM-25) |

---

## 13. Observability i benchmark manifest

### FRD-13.1 — Per-run zapis — PREDLOG (FRD v1.1 §13 precizirano)

`RunRecord { runId, recipeId/version, modelRef, runtimeRef, taskShape, interaction, mode, phases: [{ phaseId, attempts, durationMs, tokens, observedToolCalls, gateResults, verdict }], checkpoints[], retries, budget, proofReceipts[], finalStatus, qualification }`. Bez tajni; kontekst kao reference (`contextRef`), ne kopije.

### FRD-13.2 — Trace qualification — PREDLOG — SMER BRIEFA (brief §7.3) + PREDLOG

Svaki `execution_traces` red dobija `qualification: 'qualified' | 'legacy_unqualified'` (kolona ili tag) + `verifierVersion` + poreklo statusa. Samo `qualified` ulaze u eval kandidaturu, i ni tada nisu automatski gold. Migracija: `task_shape LIKE 'harness:%' AND outcome='verified'` → `legacy_unqualified` (§14). Dashboard test: `gate_passed` se ne sabira kao sadržinski potvrđeno.

### FRD-13.3 — Metrike — PREDLOG (C21 operacionalizacija)

completion rate (po `mode`), gate failure rate po gate tipu, resume success (AT-07), unknown_outcome rate (AT-08), human intervention count (approvals + korekcije), latency p50/p95 po task shape-u, tokens/compute/usd, quality score (samo iz `ProofReceipt.level ≥ 2` ili nezavisnog scoring-a), memory contribution (ablation delta, ne broj frejmova). Pragovi: NEPOZNATO do baseline-a (brief §16: pre zaključanog testa, ne posle).

### FRD-13.4 — Benchmark manifest (brief §13.6) — PREDLOG — SMER BRIEFA (DIR-22/23) + PREDLOG

```
BenchmarkManifest {
  codeSha, installerSha256?, model: { id, hfRevision, quant, runtime, version }, hardware: { gpu, vram, ram, cpu, os },
  dataset: { name, version, hash, split }, scorer: { name, version, hash, judgeModel?, judgeVersion?, promptHash? },
  toolVersions, skillVersions, contextLimits, tokenLimits, attempts, seeds, timeouts, pauseRecoveryMode,
  profile: 'raw_model' | 'raw_model_min_tool_adapter' | '+skills' | '+memory' | '+harness' | '+memory+harness' | '+evolved',
  ablationFlags: { memory, skills, harness, evolution }, // ne mogu isključiti strict verify (A25)
  outputs: { completeOutputsRef, graderOutputsRef, recountScript },
  cost: { modelInference, evaluator, toolApi, gpuTimeHours, energyAssumption?, humanReview? },  // odvojeno
  contaminationFirewall: { mindReset: true, cachesReset: true, artifactsReset: true, goldExcludedFromMemory: true },
  holdoutViews
}
```
- Production putanja obavezna (DIR-22): benchmark adapter prevodi ulaz i pokreće izolovan run kroz **isti** sidecar `/api/chat`/work put; ne sme potajno koristiti bolji harness. Raw model na tool benchmarku dobija minimalan dovoljan tool adapter (brief §13.2). Baseline se ocenjuje istim nezavisnim scorerom.
- Stanje: `benchmarks/gaia2/adapter.ts` = narrow-proxy (cost-projection, ne puna evaluacija); τ² adapter **nije nađen** na HEAD (git grep samo docs), postoji na `origin/feature/harness-sota-bench` (66 komita ispred, 2022 iza; cherry-pick inventar F-REL-12; **ne** prenositi `fe7804bf` cost-tracker i pilot „beats” rezultate) (EXT-10, F-REL-12). Da li `waggle-bridge-server.ts` koristi production `/api/chat` = NEPROVERENO.
- Primarni professional-work test: **PREDLOG** (nije odobreno) APEX-Agents 1.1 (CC-BY-4.0, 240 taskova, Harbor 0.20.0, judge DeepSeek-v4-Flash-0731, objavljen frontier baseline Claude Fable 5.1 68.6% pass@1 — licenca/taskovi/runner/judge/baseline: NALAZ AUDITA — ZA PROVERU (live 27.09.2026, izvor: external.md §4.4, §8)) uz uslove iz EXT §4.7 (cloud judge trošak; lokalni judge = odvojen profil; Docker/WSL2 samo na bench mašini; rubrike/`solution` ne ulaze u `.mind`). Evidence card i odluka pripadaju Benchmark protokolu (brief §20.1).
- Statistika (DIR-23): paired analiza za uparene taskove; McNemar samo za binarne ishode; CI za score; ekvivalencija/neinferiornost samo uz unapred zadatu marginu. „Nije detektovana razlika” ≠ „isti su” (N=114, p=0.11 „matches” je upozorenje, ne dokaz). Dozvoljene poruke zavise od rezultata (brief §13.5).
- Cene: `cost-tracker.ts:28-30` Opus 4.6/4.7/4.8 $15/$75 (zvanično **$5/$25**), `:32` Sonnet 5 $3/$15 (zvanično **$2/$10**), `:39-40` Haiku 3.5 pogrešno + retired ID-evi, fallback `:66` 3×; tabela ulazi u `ModelSpendBudget` rezervacije → **product impact** (prevremeni `BudgetExceededError` za BYOK Opus korisnika), ne samo manifest (F-REL-06, EXT-12). Test `cost-tracker.test.ts:54-55` zaključava pogrešnu vrednost. Status: POTVRĐENO NA REVIZIJI (repo: `cost-tracker.ts` linije, test, `models.json`) + NALAZ AUDITA — ZA PROVERU (zvanične cene $5/$25, $2/$10, Haiku 3.5 $0.80/$4 i retired ID-evi: live 27.09.2026, platform.claude.com; izvor: external.md §6, §8), isto kao PRD-14-09; ispravka (isti obim kao Delivery plan W0-PR13) = 4 precenjena reda + Haiku 3.5 `:39-40` (→ $0.80/$4 ili oznaka retired) + fallback `:66` + komentar `:24-25` sa URL/datum provenance + test + `benchmarks/harness/config/models.json`.

### FRD-13.5 — Release evidence — PREDLOG — SMER BRIEFA (§17 C22 „PRIHVATITI”, brief §15.4) + POTVRĐENO NA REVIZIJI

`main 2af0904d` je 618 komita od `c4e6a515` i 560 od `e4bf403e`; 355 fajlova promenjeno, 116 non-test runtime izvora, 41 na pokrivenim receipt površinama → **nijedan receipt ne pokriva `2af0904d`**; bounded no-impact attestation nije moguća (F-REL-02). Doc drift: `b07a6173` je PR test-merge sa istim tree-jem kao `e4bf403e`; PR #83 **jeste** merge-ovan (`44baa77d`, 2026-09-09) dok 09-LAUNCH/README kažu suprotno (F-REL-01). Receipt alati: installer certify povezan; router (`qualify-smart-router.ts`) i auth canary (`test-windows-official-auth-canaries.ps1`) nemaju npm/CI pozivaoca; **crash-injection receipt nad packaged installer-om ne postoji** (F-REL-03) → obavezan za AT-07/AT-30. Live GitHub (27.09.2026): `WINDOWS_PUBLIC_RELEASE_AUTHORIZED` nedefinisan (publish fail-closed ✓), `production` env bez protection rules, `main` bez branch protection, secret scanning isključen na javnom repou (F-REL-09) — operativne odluke vlasnika, ne PR. SBOM/THIRD_PARTY_NOTICES ne postoje; `onnxruntime-node` i `sqlite-vec-windows-x64` npm paketi nemaju LICENSE fajl → notices se generišu iz upstream-a; `npm audit` `continue-on-error: true`; license CI ne postoji (F-REL-04/05). Sve → G3 gate lista u Delivery planu; ovde samo ugovor da AT-30 zahteva notices+SBOM+fresh receipts za tačan kandidat SHA.

---

## 14. Migracije (pokazivač)

Kompletna migraciona mapa je u `docs/plans/WAGGLE-MIGRATIONS-v1.2.md` (brief §20.1; može biti FRD prilog). Ovde samo registar obaveznih migracija koje ovaj FRD implicira, sa uslovom „rollback ne vraća obrisana prava” (DIR-21). Sve PREDLOG.

| ID | Predmet | Zahtev | Poreklo |
|---|---|---|---|
| FRD-14.1 | `agent-runs.json` v1 → run store | `schemaVersion`, dry-run, snapshot, statusi 1:1 po §2.12; legacy `interrupted` čuva razlog; ne ponavlja nepoznate sporedne radnje; retention/GC; corrupt-load i overflow (`MAX_EVENTS=2_000`) testovi ne postoje (refute F-DUR-02) | F-DUR-01/02, A2, A8 |
| FRD-14.2 | `execution_traces.outcome` `CHECK` | table-rebuild za `gate_passed` (ili tag-based alternativa); `verified` harness redovi → `legacy_unqualified`; `mind/schema.ts:235-253` je deo OSS substrata → drift baseline update (NEPOZNATO da li pokriven) | F-HARN-06, refute |
| FRD-14.3 | `evolution_runs.status` `CHECK` | table-rebuild za `rolled_back`, `written_not_active`; `active_from/active_until` | F-EVO-02/10 |
| FRD-14.4 | `pending_actions.status` | + `dispatching`, `unknown_outcome`; `attemptId`; `providerIdempotencyKey?` | F-DUR-05 |
| FRD-14.5 | Cron: `timezone`, `occurrenceId`, lease `UNIQUE`/uslovni claim, `next_run_at` format | razdvojiti raspored od execution state-a; bez duplog catch-up-a; format fix zavisi od potvrde NALAZA (§9.4) | F-DUR-10 |
| FRD-14.6 | Loop `loop:<id>` Awareness state → run store | + retrieval exclusion do migracije (u `hive-mind-core` substratu → OSS forward-port trošak) | F-DUR-09 |
| FRD-14.7 | Persona/spec/skill override → active-version pointer | pinned verzija za započet run; rollback; `listPersonas` dedupe | F-EVO-01/02 |
| FRD-14.8 | Kontekst i scope | `contextRef` u checkpoint-u; revocation/erasure važe za checkpoint/reference kopije | F-HM-18 |
| FRD-14.9 | Personal-mind run sažeci (4 pisca) | zaustaviti upis sadržaja (W0-PR11, G1); postojeći (legacy) frejmovi: MIG-05(i) — oznaka `metadata.recallExcluded` uz nepromenjen `importance='normal'`, bez brisanja, poštovana na svim recall putevima (ne `importance='temporary'`: `FrameStore.compact()` kroz cron `memory_compact` briše `temporary` starije od 30 d — MIG-05 Napomena kritike); W0-PR18 (G1), merge posle W0-PR11, na kopiji po DP-0.09 (Klasa A nad golden fixture-om W0-PR19); izbor (i)/(ii) = MDQ-07 (Memory owner); erasure pravila važe; fleet policy gate redefinisan | F-HM-05; MIG-05(i) |
| FRD-14.10 | Tier/billing/team-sync | read-compatible kroz `LEGACY_TIER_MAP`/`parseTier` (PRO→FREE precedent `09b199aa`); stvarni inventar pretplatnika pre promene (NEPOZNATO; nije dozvoljen eksterni poziv); nema finansijskih side effect-a bez odobrenja | F-TK-06/07/16 |
| FRD-14.11 | Hook `temporary` recall exclusion + read-side scan/redakcija | bez promene skladištenja | F-HM-03/04/13 |
| FRD-14.12 | `cost-tracker.ts` cene | 4 precenjena reda + Haiku 3.5 `:39-40` (ispravka ili oznaka retired) + fallback `:66` + komentar `:24-25` + test + `models.json` (= Delivery plan W0-PR13) | F-REL-06 |
| FRD-14.13 | Ugovor za nove trajne store-ove (MIG-06): WorkItem, RunEvent journal, `ToolAction`/`ToolAttempt`, Checkpoint, ProofReceipt, artifact manifest, capability request/proposal, OAuth state, negativni grantovi | od prvog dana: `schemaVersion`, scope (`workspace_id`), provenance `(source, source_ref)` gde postoji spoljni subject, retention klasa + GC pravilo (GC uz `--dry-run` listu kandidata; `executed` radnje se ne brišu GC-om pre isteka run retention-a), export i erase mapiranje (FRD-14.14); retention brojevi = MDQ-08 (za potvrdu, ne odluka); jedinice rada: W1-PR2/PR6/PR7 (G2), W4-PR3/PR5/PR6 (G2), W7-PR2 (G3) | MIG-06; S1 A3, A7, A8; F-CAP-02, F-CAP-05(c) |
| FRD-14.14 | Export/erasure pokrivenost store-ova (MIG-08), uključujući run store i W4 store-ove | `POST /api/export` dobija sekcije i `manifest.json` (`schemaVersion`, code SHA, sekcije, hash-evi): runovi/checkpoint-i/journal i held akcije bez `args_json` sadržaja (W1-PR14), tragovi redigovani (W1-PR7), rutine/occurrence (W1-PR11), evolution runovi i override verzije (W3e-PR1), grantovi bez fingerprint tajni (W4-PR6), proposal store i OAuth state bez state vrednosti (W4-PR3/PR5), pairing allowlist bez tokena (W8-PR3), WorkItems (W7-PR2); subject erase dobija `ExecutionErasure` sa istim `(source, source_ref)` ključem i upisom u isti `erased_subjects` ledger (W1-PR14); test „nema tajni” nad ZIP-om; PR koji uvodi ili menja store iz ove liste bez export/erase mapiranja ne prolazi | MIG-08; S1 A3; FRD-12.8 |
| FRD-14.15 | Versionovani migracioni ledger i runner (MIG-09) | `<dataDir>/migrations/ledger.json` append-only (tmp+rename), unos `{migId, fromVersion, toVersion, codeSha, startedAt, finishedAt, mode: dry-run\|apply\|rollback, receiptPath, outcome}`; registar migracija `{id, version, dryRun, snapshot, apply, verify, rollbackClass}`; boot korak **pre** otvaranja store-ova; fail-closed read-only kad su podaci noviji od koda; `--dry-run-all`; ledger se nikad ne restore-uje iz snapshot-a; u packaged sidecar bundle-u (AT-30); W1-PR13 (G2), merge pre MIG-01 apply-a | MIG-09; MIG INV-21; brief §12.4 |
| FRD-14.16 | Revocation ledger `revocations.json` (GDPR-H-05) | append-only `{kind, key, revokedAt, reason}` pod `dataDir`, van fajlova koji se restore-uju (MIG §4 invarijanta 4); kuke u `VaultStore.delete`, `ApprovalGrantStore.revoke` i registry credential revoke (KVARK disconnect dopisuje WB-PR3); MIG-00.6 Klasa B restore ponovo primenjuje sve opozive posle snapshot-a; W1-PR15 (G2), pre prvog G2 apply-a; G1 mutacije su Klasa A i ne zavise od njega (DP-0.09) | MIG GDPR-H-05, MIG-00.6; DIR-21; F-CAP-09 |

---

## 15. Acceptance testovi AT-01..AT-30

Sve ispod su **predloženi kriterijumi** (brief §16), ne izvedeni testovi. Kolona „fixture / env / owner / milestone”: owner = **uloga** iz Delivery plana §2 „Owner/uloga” i DP-0.14 (kanonska lista Delivery plan DP-0.14: Harness, Chat, Durable, Memory, Server, Boundary, Capability, Security, External-executor, Evolution, Model/Runtime, UX, Attention, Channels, Benchmark, Release, OSS/License owner — uloge, ne imena; dodela = PREDLOG); `fixture: <TBD>` ostaje samo gde fixture zaista nije definisan (AT-24 labeled skup); `milestone: G1|G2|G3 (PREDLOG)`. Kolona „Wave (autoritativan za dokaz završetka)”: talas/PR čiji RED→GREEN test **zatvara** AT (ili navedeni deo AT-a); ostali talasi koji AT navode u „Exit testovi” listi Delivery plana su regresija ili eksplicitno označen „deo” — izvor: `WAGGLE-DELIVERY-PLAN-v1.2.md` §2 exit liste + §7 TM redovi (POTVRĐENO NA REVIZIJI paketa, ponovljeno grep-om nad 13 „Exit testovi” redova Delivery plan §2 28.09.2026: svih 30 AT-ova se pojavljuje u ≥1 exit listi; AT-06/12/18/19/23/28/30 u 3–4 talasa, AT-13 u pet (W0, W2, W3e, W7, WB), zato je autoritativan talas naveden eksplicitno; Napomena kritike: raniji navod „AT-01/06/13/19/22/23/28/30 u 3–4 talasa” nije važio — posle OD-10 AT-22 je samo u W3 exit listi, AT-01 u dve (W0, W3), a AT-12/AT-18 su bili izostavljeni). Kad je AT razdeljen po G tačkama, milestone kolona nosi split oblik „G1 deo / G2 (PR) autoritativan”; **preduslov** (alat, fixture ili RED test koji ne zatvara nijedan deo AT-a — npr. W0-PR19, W8-PR1, WB-PR2) je označen kao takav i ne ulazi u G kolone PRD-04-01. Numerički pragovi se zaključavaju pre finalnog testa na osnovu baseline-a. **Lokacija testa (brief §16 „lokacija”)** = PR iz kolone „Wave” koji test piše, u test suite-u paketa koji taj PR menja; gde kolona „Postojeći RED/GREEN oslonac” imenuje fajl, to je fajl koji se proširuje ili prepisuje; tačno ime novog test fajla imenuje PR (PREDLOG; dopuna završne provere kompletnosti 29.09.2026).

| AT | Scenario i merljiv ishod | FRD | Postojeći RED/GREEN oslonac (`2af0904d`) | fixture / env / owner (uloga) / milestone | Wave (autoritativan za dokaz završetka) |
|---|---|---|---|---|---|
| AT-01 | `VERDICT: FAIL`, nevalidan verdict, izostao dokaz → strict run **nije** COMPLETED; CONDITIONAL prati recipe politiku | FRD-05.1, 05.5, 02.6 | repro `docs/plans/v1.2-evidence/phaseA/repro-harness.mjs` 02a–d; testovi koji pocrvene: `workflow-tools-harness.test.ts:135-179` | fixture: `research-verify` sa FAIL/CONDITIONAL/no-VERDICT · env: vitest, bez providera · owner: Harness owner · G1 (W0-PR1/PR2) autoritativan / G2 deo (W3-PR6) | W0-PR1/PR2 (G1: verify default fail-closed + `VERDICT` vrednost, CONDITIONAL politika) · W3-PR6 (G2 deo: strict ne završava bez `ProofReceipt`) |
| AT-02 | `bash echo` nije položen test; nenulti exit ≠ success; gate čita observed journal | FRD-05.2, 05.3 | repro 03a–c, 08a; `system-tools.test.ts:365-370` toleriše `Exit code:` prefiks | fixture: fake bash sa exit 1 + izlazom · env: vitest · owner: Harness owner · G1 | W0-PR3/PR4 (G1; jedini talas) |
| AT-03 | Budget stop pre verify → partial/blocked, sačuvan `budget.spent`, nema „potpuno provereno” | FRD-05.6, 04.5 | repro 05a–c (gate nivo); ceo loop sa realnim budžetom **nije** izvršen | fixture: `maxTokenBudget` mali + „All tests pass” sadržaj · env: vitest + fake provider · owner: Harness owner (W0) → Durable owner (W1) · G1 deo / G2 (W1-PR4) autoritativan | W0-PR5 (G1 deo: disclose-only, `budgetStop` meta) · W1-PR4 (G2 autoritativan: `Checkpoint.spent` preživljava restart; uz W0-PR5 zatvara AT-03 u celini) |
| AT-04 | Aktiviran override ulazi u sledeći stvarni prompt; rollback menja sledeći run; postojeći run pinned | FRD-08.2 | repro `docs/plans/v1.2-evidence/phaseA/repro-shadow.mjs`; RED mora ići kroz `resolvePersona`/`buildSystemPrompt`, ne `listPersonas().find(id && includes)`; redosled F-EVO-01 → F-EVO-10 | fixture: deploy `coder` override + `POST /api/chat` · env: server test · owner: Evolution owner · G1 deo (W0-PR9 minimum) / G2 (W3e-PR1) autoritativan | W0-PR9 (G1 minimum: override u sledećem stvarnom promptu, `written_not_active`) · W3e-PR1 (G2 autoritativan: rollback ruta + pinned verzija započetog run-a; uz W0-PR9 zatvara AT-04 u celini) |
| AT-05 | Evolved schema se koristi u target izvršenju; kandidat se izvršava pre ocenjivanja; prepoznaje prompt-as-output | FRD-08.1 (red `EvolveSchema` Stage 1: wire-or-drop, R19), 08.3 | guard testovi postoje; route test `complete()` = 2/primer nedostaje (`evolution-run-route.test.ts:37-58` stub) | fixture: stub LLM sa `callCount()` · env: server test · owner: Evolution owner · G2 | W3e-PR6 (schema u Stage 2 ili uklonjena) + W3e-PR8 (route test `complete()` = 2/primer) (G2; jedini talas) |
| AT-06 | Dva istovremena Workspace run-a: različiti runId; events/kontekst/trace se ne mešaju | FRD-02.5, 05.3 | repro 07a–b, 08b (oba `harnessId='document-draft'` nerazlučiva); nije iz dva HTTP run-a | fixture: 2 workspace-a, isti harness · env: server + fake provider · owner: Harness owner (W0-PR7) → Durable owner (W1-PR8) · G1 deo (W0-PR7) / G2 (W1-PR8 + W2-PR1) autoritativan | W0-PR7 (G1 deo: različit `runId` u sva tri payload-a) · W1-PR8 (G2 deo: per-run bus/trace) · W2-PR1 (G2 deo: kontekst se ne meša) — **G2 autoritativan = W1-PR8 + W2-PR1 zajedno**: AT-06 u celini se zatvara testom iz dva HTTP run-a u exit-u onog od talasa W1/W2 koji se poslednji zatvori (W2-PR1 ne zavisi od W1-PR8, graf §3, pa redosled nije unapred poznat); W3 exit = regresija, ne novi dokaz |
| AT-07 | Crash posle potvrđene faze → restart nastavlja sledeću fazu sa istim referencama; potrošnja nije izgubljena | FRD-04.2, 02.3, 04.5 | `long-task-loop-integration.test.ts:221-330` (step-level, unwired); crash-injection nad packaged buildom **ne postoji** (F-REL-03) | fixture: kill posle checkpoint-a · env: vitest + packaged Windows kandidat · owner: Durable owner · G2 (unit + packaged receipt C na F2) / G3 (C ponovljen na F3 kandidatu) | W1-PR4/PR5/PR12 (G2: dev crash-injection, restart nastavlja sledeću fazu) · W8-PR2 (G2 deo, merge pre F2: packaged build, receipt **C** na F2; ponovljen na F3) |
| AT-08 | Crash posle provider uspeha pre ack-a → isti `actionId` reconciled; bez blind resend; `unknown_outcome` vidljiv | FRD-02.4 | `held-action-executor.test.ts:120-128` (idempotent claim); crash-after-success test ne postoji | fixture: fake provider sa receipt-om · env: vitest · owner: Durable owner · G2 | W1-PR6 + W1-PR12 (G2; jedini talas) |
| AT-09 | Dva procesa preuzimaju isti run → samo jedan sme novu sporednu radnju | FRD-04.3 | nema; cron lease nije fencing (`cron-store.ts:442-447`) | fixture: dva `CronStore`/run store handle-a nad istim `dataDir` · env: vitest · owner: Durable owner · G2 | W1-PR5 + W1-PR12 (G2; jedini talas) |
| AT-10 | SSE reconnect/replay ne duplira kartice ni akcije; detach ≠ cancel; cancel sprečava nove radnje | FRD-02.5, 04.4 | `agent-run-registry.test.ts:104-105` (`resetRequired=false`); chat `sinceSeq` ne postoji; R3-008 pin `agent-loop.test.ts:1981-2010` | fixture: SSE klijent sa reconnect · env: server test · owner: Durable owner · Chat owner (`chat.ts` detach/`sinceSeq`) · G2 | W1-PR8/PR9 (G2: `sinceSeq` replay, detach ≠ cancel, ADR-03) · W5-PR1 (G2 UI deo: reconnect ne duplira kartice) |
| AT-11 | Nedostajući connector blokira **već kreiran** run; validan setup vraća isti run; callback za drugi request/istekao grant ne pokreće posao | FRD-02.8, FRD-03.5, FRD-03.6, FRD-06.4 | `agent-search.test.ts:44` zaključava trenutno open-in; `capability-proposals.test.ts:100,114,171` scope/expiry/replay; api_key konektor kao tehnički dokaz (R12) | fixture: api_key konektor (npr. Notion/Linear) · env: server test · owner: Capability owner · G2 | W4-PR3/PR4/PR5 (G2); W7 exit = regresija na mail konektoru, ne novi dokaz |
| AT-12 | Decline/expiry/revoke preživi restart; model/hook/IM ne mogu poništiti | FRD-06.6 | expiry: `held-action-executor.test.ts:187` („refuses to run a held action past its expiry”); re-validacija pri izvršenju: `:198,292`; deny: `approval-flow.test.ts:75` (one-shot, ništa trajno); revoke (`ApprovalGrantStore.revoke` `approval-grants.ts:286`; `DELETE /api/approval/grants/:id` `routes/approval.ts:120`): test **nije nađen** na `2af0904d` (`git grep "\.revoke("` nad `*.test.ts` = 0) → RED test nedostaje. Napomena kritike (28.09.2026): raniji navod `approval-held.test.ts:302,313` kao expiry/revoke test bio je netačan — `:302` = approve idempotentnost (409 `already_decided`), `:313` = legacy critical grants | fixture: deny + restart · env: server test · owner: Capability owner · Boundary owner (G1 deo) · G1 (nav deo) / G2 (autoritativan) | W0-PR12 (G1 deo: Approvals dostupan Solo korisniku) · W1-PR6 (G2 deo: `BLOCKED_APPROVAL` trajno) · W4-PR6 (G2 autoritativan: decline/expiry/revoke preživi restart; model/hook/IM ne poništavaju) |
| AT-13 | Sentinel iz Workspace A ne pojavljuje se u personal ni Workspace B retrieval-u | FRD-07.4 | 4 pisca + ≥5 testova pinuju leak kao poželjno; sentinel test ne postoji; NALAZ — ZA PROVERU runtime | fixture: sentinel string u run sažetku · env: server + 2 workspace mind-a · owner: Memory owner · G1 (W0-PR11/PR18) autoritativan / G2 deo (W2-PR1/PR2) | W0-PR11 (G1: sentinel Workspace A → nije u personal recall-u; novi upisi) + W0-PR18 (G1: legacy leak frejmovi 4 pisca reklasifikovani na kopiji oznakom isključenja iz recall-a, bez promene `importance` i bez brisanja; test: frejm stariji od 30 d preživi `compact()`; MIG-05(i), DP-0.09; Delivery plan G1 (c), W0 exit) · W2-PR1/PR2 (G2 deo: proširen na Workspace B); W3e-PR4, W7-PR2, WB exit = regresija |
| AT-14 | RAWDETAIL citat dostupan u scope-u; hook `temporary` nije dugotrajna činjenica; re-run extraction ne duplira | FRD-07.2, 07.3, 07.7 | `w46-rawdetail-recall.test.ts`, `r2-recall-closure.test.ts:27-40`; hook exclusion test nedostaje; `(runId, outputHash)` dedup nedostaje | fixture: raw-turn frejmovi + temporary hook frame · env: vitest (reranker OFF u `vitest.setup.ts:25-26` → RAWDETAIL lane test mora ga uključiti) · owner: Memory owner · G1 deo (W0-PR10) / G2 (W2-PR7/PR9) autoritativan | W0-PR10 (G1 deo: `temporary` isključen iz hook recall-a) · W2-PR7/PR9 (G2 autoritativan: RAWDETAIL dostupan u scope-u, `(runId, outputHash)` dedup) |
| AT-15 | Revokovan/obrisan izvor iz checkpoint konteksta nije upotrebljen posle resume-a | FRD-02.7, 12.8 | erasure testovi postoje (`erasure.test.ts`); checkpoint↔kontekst veza ne | fixture: brief frame obrisan pa resume · env: server test · owner: Memory owner · G2 (W2-PR2) autoritativan / G3 deo (W7-PR2) | W2-PR2 (G2; autoritativan) · W7-PR2 (G3 deo: WorkItem erasure/export) |
| AT-16 | External executor dobija pravi `ContextPackage` i vraća rezultat istom Workspace-u; nema key leakage; `toolsUsed` = tool-reported | FRD-07.6 | `executor-brief.test.ts` (6), `external-tool-runner.test.ts`; hook redakcija/scan nedostaje; E2E sa Claude Code/Codex/Hermes **nije** pokrenut | fixture: fake external tool binar · env: server + hook runtime · owner: External-executor owner · Memory owner · G2 (fake; prvi A receipt na F2) / G3 (A receipt za tačan kandidat na F3) | W2-PR6/PR8 (G2: fake external tool, paket + `tool-reported`) · W8-PR1 (G1 **preduslov**, ne deo dokaza AT-16: router/canary entry-point + receipt manifest, pre F1 — zato ga PRD-04-01 G1 kolona ne navodi) · A receipt na realnim nalozima (Claude Code/Codex/Hermes canary) na F2/F3 (Delivery plan §5; TM-09) |
| AT-17 | Postojeći skill se nađe i koristi bez kataloga; nedostajuća binarna sposobnost se ne instalira bez trust/approval | FRD-06.1, FRD-06.2, FRD-06.5 | `capability-acquisition.test.ts:131`; `installer-security.test.ts` (40); „read-only persona ne dobija write kandidata” test nedostaje | fixture: read-only persona + write skill · env: vitest · owner: Capability owner · G2 | W4-PR2 (G2: envelope test „read-only persona ne dobija write kandidata”); W5 exit = posredno |
| AT-18 | UI, agent i rutina pozivaju istu akciju kroz isti permission/validation ugovor | FRD-06.7 | `held-action-executor.test.ts:140,158`; `command-registry*.test.ts` (nisu otvarani) | fixture: `install_mcp` iz 3 ulaza · env: server test · owner: Capability owner · G1 deo (W0-PR12) / G3 (W4-PR8) autoritativan | W4-PR8 (G3: `ActionDescriptor` izvor istine za UI/agent/rutinu); W0-PR12 i WB exit = deo (Approvals dostupan), ne autoritativan |
| AT-19 | Injection u mejlu/izvoru ne menja policy, ne izvlači vault, ne autorizuje slanje — i **bez** detektovane ključne reči | FRD-09.2, FRD-12.1, FRD-12.2 | `injection-scanner.test.ts`; approval floor testovi; kombinovani test bez ključne reči nedostaje | fixture: harvestovan mejl sa parafraziranom instrukcijom · env: server test · owner: Security owner · Memory owner (W0-PR10 deo) · G1 deo (W0-PR10) / G2 (W4-PR6/PR7) autoritativan / G3 deo (W7-PR3/PR6) | W0-PR10 (G1 deo: hook read scan/redakcija) · W4-PR6/PR7 (G2 autoritativan: approval floor bez ključne reči, vault nije u promptu/trace-u) · W7-PR3/PR6 (G3 deo: harvestovan mejl fixture sa parafraziranom instrukcijom); W3e-PR4 = tajne u eval skupu |
| AT-20 | Ključ prisutan ali generacija ne radi → onboarding nije ready; lokalni model prolazi generation + tool round-trip; prekinut pull oporavljiv | FRD-10.1, 10.2 | `useHasWorkingModel.test.ts:271-281,301-307,486-495` pinuju **pogrešno** (RED posle fixa); post-pull probe `local-inference.ts:355-377` GREEN oslonac | fixture: mock probe timeout/offline · env: web vitest + server test + realan Windows hardver · owner: Model/Runtime owner · G2 | W6-PR1/PR2/PR3/PR4 (G2; jedini talas; realan Windows hardver za ladder = W6-PR7) |
| AT-21 | Research/document fixture → fajl koji se otvara, sekcije, razrešivi izvori; namerno pogrešan broj/citat hvata validator ili ostaje eksplicitno nepotvrđen | FRD-05.2, 05.4, 05.7 | validatori ne postoje; `hasMinSections` postoji | fixture: 2 recipe-a × fixture set sa ubačenom greškom · env: server + lokalni model · owner: Harness owner · G2 | W3-PR4/PR5 (G2: research-brief + document-production validatori); W6 exit = posredno |
| AT-22 | Novi dokument menja zaključak u nastavku istog Workspace-a; navodi novu source verziju; ne gubi potvrđene odluke | FRD-02.7, 03.4 | nema | fixture: v1 izvor → v2 izvor · env: server + lokalni model · owner: Harness owner (recipe) · Memory owner (source verzija) · G2 | W3-PR4/PR5 (G2; autoritativan za AT-22 **kako je ovde definisan**: nova source verzija, sačuvane odluke). Napomena kritike: raniji „AT-22 (failure UX)” u Delivery plan W1/W5 exit listama, TM-06/TM-14, Disposition A22/C12, MIG-01 i ADR-03-T6 zamenjen je imenovanim FRD-05.8 View-work/Stop-copy testom bez AT ID-a (brief §16 nema AT za failure UX — Disposition OD-10); AT-22 ostaje samo change-input test (W3-PR4/PR5, TM-20, PRD-05-05, R08) — rešeno u trećem kritičkom prolazu |
| AT-23 | Rutina posle sleep/restart/DST prati misfire politiku; nema duple occurrence radnje; budžet ne resetuje | FRD-09.4, 02.10 | `cron-scheduler-hardening.test.ts:227-250` (sweep); re-fire/catch-up/DST/2-procesa testovi ne postoje; **prvo** repro `create()→getDue()` format NALAZA | fixture: fake clock + `CronStore` realan · env: vitest · owner: Durable owner · UX owner (W5 deo) · G1 deo (W0-PR14, format NALAZ) / G2 (W1-PR11, politika) autoritativan / G3 deo (W5-PR3) | W0-PR14 (G1 deo: `create()→getDue()` format NALAZ) · W1-PR11 (G2 autoritativan: occurrence id, misfire/DST politika, 2 procesa) · W5-PR3 (G3 deo: sledeći termin / blokada / pause-disable u Home bloku) |
| AT-24 | Attention classifier/dedup na labeled holdout-u; precision/FP/merge greške; threshold zaključan pre scoring-a | FRD-09.1, 02.9 | ne postoji (WorkItem net-new) | fixture: labeled mail skup `<TBD>` · env: offline · owner: Attention owner · G3 | W7-PR4 (G3; jedini talas) |
| AT-25 | Upareni IM korisnik dobija dozvoljen status; potvrđuje samo odgovarajući neistekli zahtev; replay/forward ne daje grant | FRD-11.2 | `channels-manager.test.ts:143,159,256`, `channels-pairing.test.ts` (13); approval-over-IM ne postoji (Not in v1) | fixture: fake Telegram adapter · env: server test · owner: Channels owner · G3 | W8-PR3/PR4 (G3; jedini talas) |
| AT-26 | KVARK connect aktivira samo dozvoljene org capabilities; nedostupan on-prem model ne pokreće cloud fallback; personal mind se ne kopira | FRD-11.4 | `kvark-wiring.test.ts:46-52` „simulates the if(kvarkConfig) guard” (factory, ne registracija); RED (ADR-08-T3): server + vault entry + fake KVARK health OK → 4 alata; bez entry-ja ili health fail → 0 | fixture: vault `kvark:connection` + fake KVARK server · env: server test · owner: Boundary owner · G1 (samo RED test, preduslov) / G2 deo (W3e-PR2) / G3 (WB-PR3) autoritativan | WB-PR2 (G1 preduslov: samo RED test kao `it.fails`, bez registracije i gate-a; ne zatvara deo AT-26, pa ga PRD-04-01 G1 kolona ne navodi) · W3e-PR2 (G2 deo: KVARK režim bez cloud judge-a; Delivery plan W3e exit, TM-04) · WB-PR3 (G3 autoritativan: registracija + gate `getKvarkConfig(vault)!==null && health.ok` + connect/validate/disconnect/revoke, no-sharing default) |
| AT-27 | Migracija stare config/run šeme ponovljiva; rollback ne duplira radnje i ne vraća erased/opozvano | FRD-14.*, 12.9 | `webhook.test.ts:137-147` (PRO→FREE precedent), `d11-datadir-tier.test.ts`; run store migracija ne postoji; revocation ledger ne postoji (GDPR-H-05) | fixture: `agent-runs.json` v1 + `config.json` legacy + golden legacy-datadir tar + SHA-256 iz W0-PR19 (`tests/fixtures/legacy-datadir/`, putanja PREDLOG; MIG §6 t.2, MIG-00.7) · env: vitest · owner: Boundary owner (config/tier) · Durable owner (run store, `execution_traces`, revocation ledger) · Evolution owner (`evolution_runs`) · Capability owner (W4 store-ovi) · G1 deo (config; MIG-04(A)/MIG-05(i) Klasa A) / G2 deo (run store, revocation ledger + Klasa B restore, W4 store-ovi) / G3 (WB-PR5, W7-PR2) autoritativan | po migraciji (MIG; usklađeno sa Delivery plan TM-16 i G1 (j)): W0-PR19 (G1 preduslov: golden fixture nad kojim rade testovi svih migracija; merge pre W0-PR6/PR18) · W0-PR12 (G1 config deo, `tier-enforcement-matrix.test.ts` tripwire; MIG-07.1) · W0-PR6 (MIG-04(A)) + W0-PR18 (MIG-05(i), legacy frejmovi) · W1-PR13 (MIG-09 ledger/runner, merge pre W1-PR2 apply-a) · W1-PR15 (G2 deo: revocation ledger `revocations.json` + Klasa B restore test sa ponovnom primenom erasure-a i opoziva nad golden fixture-om — MIG-00.6, GDPR-H-05, FRD-14.16; jedini PR koji dokazuje „rollback ne vraća … opozvane dozvole”; merge pre prvog G2 apply-a) · W1-PR2 (MIG-01 run store) · W1-PR6/PR10/PR11 (MIG-02) · W1-PR7 (MIG-04(B) `execution_traces` CHECK rebuild) · W1-PR14 (MIG-08 export/erase run store-a) · W1-PR7/PR11, W3e-PR1, W4-PR6, W8-PR3 (MIG-08 export/erase sekcije store-ova koje ti PR-ovi menjaju ili uvode, FRD-14.14) · W2-PR2 (MIG-05 `context_refs`) · W3e-PR1 (MIG-03 `evolution_runs` CHECK rebuild) · W4-PR3/PR5/PR6 (G2 deo: MIG-06/08 — proposal store, OAuth `pendingStates`, negativni grantovi) · WB-PR4 (G3 deo: MIG-07.2 dedup `config.json` čitača, bez promene podataka) · WB-PR5 (G3 autoritativan za tier deo: MIG-07 tier config, posle DQ-03) · W7-PR2 (G3 autoritativan za WorkItem deo: MIG-06/08); AT-27 u celini zatvoren tek posle WB-PR5 i W7-PR2 (G3); rollback ≠ vraćanje erased/revoked važi za svaku |
| AT-28 | Benchmark koristi production putanju; memorija/gold iz X ne utiče na Y; manifest + offline recount odgovaraju output-ima | FRD-13.4 | `recount.mjs` postoji (LoCoMo); production-path adapter ne; contamination reset ne | fixture: 2 nezavisna taska sa sentinel gold-om · env: bench mašina · owner: Benchmark owner · Memory owner (LoCoMo deo) · G2 (dev A/B) / G3 (zaključana) | W2-PR3 (G2 deo: LoCoMo same-judge bez regresije, `recount.mjs` offline — FRD-07.8) · W3-PR7 + B2-PR1/PR2 (G2 autoritativan: production adapter, izolacija X/Y, manifest, razvojni A/B) · B3-PR1/PR2 (G3: zaključana studija) |
| AT-29 | Baseline i kandidat ocenjeni na istim primerima; regresija/cap → nije promovisan; holdout access evidentiran | FRD-08.6, 02.11, 08.5 (samo recipe deo, uz ODB-02) | repro `repro-gepa-delta.mjs`; `compose-evolution.test.ts:342-371` lomi se na uklanjanje `combinedDelta` | fixture: deterministički running judge N=400 · env: vitest · owner: Evolution owner · Benchmark owner (holdout access log) · G2 / G3 deo (recipe, samo uz ODB-02 = da) | W3e-PR3/PR4 (G2: paired anchor score, holdout hash + access log) · W3e-PR9e (G3 deo, **samo uz ODB-02 = da**: AT-29 za recipe target + invariants; W3e-PR9a..d preduslov; ako ODB-02 = ne, recipe deo AT-29 ne važi — Delivery plan §6.1); B3 exit = ponovna upotreba istog testa |
| AT-30 | Čist Windows profil pokreće isporučeni proizvod bez developer Node/Python/Docker; uninstall/repair, notices, signed artifact, fresh receipts za tačan SHA | FRD-11.1, 13.5, 12.10, 12.11 | `certify-windows-installer.ps1` (installer receipt); notices/SBOM/crash-injection/router/canary entry-pointi nedostaju; Authenticode/Deep Security spoljne kapije (NEPOZNATO) | fixture: čist VM profil · env: release chain · owner: Release owner · G1 (telemetry deo) / G3 | W8-PR2/PR5/PR6 + F3 receipt ciklus (G3 autoritativan: receipts za tačan SHA, notices/SBOM, čist profil, egress deo po TM-24; W8-PR1 entry-pointi su G1, pre F1) · W6-PR6 (deo: managed model receipt) · OSS-PR3 (deo: notices u paketu) · W0-PR17 (G1 deo: jedan telemetry prekidač pokriva lokalni store i PostHog, ADR-10-T2); Authenticode/Deep Security = spoljne kapije, NEPOZNATO |

Dopuna (brief §16): za offline profil merenje neodobrenog egress-a; za BYOK/live-channel dozvoljena odredišta i minimizacija; KVARK testovi zasebna on-prem granica (FRD-12.5).

---

## 16. Traceability PRD → FRD

Dve mape. **§16.1** vezuje stabilne ID-eve iz `docs/Waggle_PRD_v1.2_DRAFT.md` (šema `PRD-SS-NN`, ista revizija `2af0904d`) na FRD ugovore i AT-ove — ovo je matrica iz brief §20.1 (D/DIR ili C/A/R → PRD → FRD → wave → AT → dokaz; autoritativan wave po AT-u je kolona u §15, PR slicing i dokaz završetka nosi Delivery plan §2/§7). **§16.2** zadržava mapu na PRD **v1.1** sekcije radi nasleđa. Cela §16.1 je **PREDLOG** planera: oba nacrta su pisana paralelno, pa je reconcile pri finalizaciji obavezan (svaki PRD ID mora imati ≥1 FRD ugovor ili eksplicitan „van FRD-a” razlog; svaki FRD ugovor ≥1 PRD ID).

### FRD-16.1 — PRD v1.2 `PRD-SS-NN` → FRD → AT — PREDLOG

| PRD v1.2 ID(-evi) | Tema | FRD v1.2 | AT |
|---|---|---|---|
| PRD-01-01, 01-02, 01-06 | besplatan/OSS/desktop/local-first; nema Team/Enterprise SKU; cloud ≠ later layer | FRD-01.6, 11.1, 11.4, 12.4 | AT-26, AT-30 |
| PRD-01-03 | kod još sprovodi 4-tier | FRD-06.3 (tier nije granica), 14.10 | AT-27 |
| PRD-01-04, 01-05 | tri broja verzije razdvojena; installer broj netaknut do §17 | FRD-13.5 | AT-30 |
| PRD-01-07 | repo javan vs „remains private” | FRD-12.10 | — (decision queue) |
| PRD-02-01, 02-02, 02-04, 02-08 | složenost unutra; Workspace-first; sistemska inteligencija; progresivno otkrivanje | FRD-01.1, 01.9, 10.4 | — (principi) |
| PRD-02-03 | local-first; granica egress-a po profilu (offline / BYOK-live / KVARK) — usklađeno sa Delivery plan TM-24 | FRD-01.1, 10.4, 12.5, 12.3 | AT-30 (egress deo), AT-26 |
| PRD-02-05 | server je autoritet dokaza | FRD-05.3, 02.2, 02.6, 01.7 (presečni slojevi: provenance/observability na svakoj radnji) | AT-01, AT-02 |
| PRD-02-06 | execution state ≠ kognitivna memorija | FRD-01.5, 07.2, 14.6 | AT-13, AT-23 |
| PRD-02-07 | nijedan režim ne proširuje ovlašćenja | FRD-01.8, 02.1 (`mode`), 06.3 | AT-28 |
| PRD-02-09 | Preserve → Borrow → Adapt → Build | FRD-01.5 (store ADR), 04.3 (`RecoveryRunner` ADAPT), 06.7 (agent-native pattern only) | — |
| PRD-02-10 | istiniti statusi | FRD-08.7, 10.1, 13.2, 01.7 (learning/evolution kao predlagač proverenih izmena) | AT-04, AT-20 |
| PRD-02-11 | model-agnostic (smer briefa §10.4; usklađen sa D-05): BYOK + OpenAI-compatible ostaju; nijedan sloj ne uvodi skrivenu zavisnost od jednog provajdera | FRD-10.1, 10.4, 08.4 (Anthropic-key zavisnost Evolution-a, F-EVO-08) | AT-20, AT-05 (executor kroz target runtime) |
| PRD-02-12 | istinita telemetrija: jedan prekidač (lokalni store + PostHog) + disclosure pre prvog capture-a (smer D-05 „prikazati gde podaci odlaze”; ADR-10 O4) | FRD-12.11 | AT-30 (telemetry deo) |
| PRD-03-01, 03-02 | Home 4 bloka; stanje `HomeCockpit` | FRD-01.1, 09.1, 02.9 | AT-24 |
| PRD-03-03, 03-04 | Workspace centralni objekat; Memory Center tabovi | FRD-01.1, 07.2 | — |
| PRD-03-05 | persone = opciona rola/mode (C16) | FRD-06.3 (`personaAllowlist/isReadOnly` u envelope-u), 08.2 (active-version) | AT-04, AT-17 |
| PRD-03-06 | dvoslojna navigacija; „New Agent”/⌘K nisu tier-gated | FRD-01.1, 06.6 | — |
| PRD-03-07 | Work Progress / View work | FRD-05.8, 02.5 | AT-06, AT-10 |
| PRD-03-08 | tri značenja „Harvest” (C7): memory import / attention feed / Build-vs-Borrow | FRD-09.1 (Attention → `WorkItem`), 02.9 (`WorkItem` ugovor), 07.2 (Harvest = memory import, RAWDETAIL korpus); Build-vs-Borrow proces = van FRD-a (terminologija, PRD §15) | — (terminologija; dispozicija C7) |
| PRD-03-09 | mobile = IM companion | FRD-11.2 | AT-25 |
| PRD-03-10 | Routines u mentalnom modelu (D-07, D-14): sledeći termin / poslednji rezultat / blokada / pause-disable rutine ≠ mid-phase pauza; Home blok nad postojećim `CronStore`/`/api/automations` | FRD-09.3, 02.10, 01.1 | AT-23 |
| PRD-04-01..04-05 | G1/G2/G3, kritična putanja, receipts stanje | FRD-13.5; milestone kolona u §15; Delivery plan | AT-30 |
| PRD-05-01, 05-02 | jedan kompletan posao; dve recipe varijante | FRD-05.7 | AT-21 |
| PRD-05-03 | postojeći harnessi kao polazište | FRD-05.2, 05.7 | AT-01 |
| PRD-05-04 | server-side router | FRD-05.7, 03.2 | AT-06 |
| PRD-05-05 | acceptance vertikale | FRD-05.2, 05.4 | AT-21, AT-22 |
| PRD-06-01, 06-02 | interaction × mode; default conversation | FRD-01.8, 02.1, 03.0, 03.2 | AT-06 |
| PRD-06-03 | tri nivoa provere + CONDITIONAL | FRD-02.6, 05.4, 05.5 | AT-01 |
| PRD-06-04, 06-09 | budget stop ne stvara uspeh (DIR-08; F-HARN-05) | FRD-05.6, 04.5 | AT-03 |
| PRD-06-05 | F-HARN-01 verify skip default | FRD-05.1 | AT-01 |
| PRD-06-06 | F-HARN-02 VERDICT regex | FRD-05.2 (verdict gate), 05.5 | AT-01 |
| PRD-06-07 | F-HARN-03 bash-as-test; exit code odbačen | FRD-05.2 (test gate), 05.3 | AT-02 |
| PRD-06-08 | F-HARN-04 `run_harness` kao verification tool | FRD-05.3 | AT-02 |
| PRD-06-10 | F-HARN-06 bridge fabrikuje `verified`/`ok:true` | FRD-05.3, 02.6 (`TraceOutcome` mapa), 13.2, 14.2 | AT-06 |
| PRD-06-11 | F-HARN-08 model-supplied dokaz | FRD-02.2 (`observedToolCalls`), 05.3 | AT-02 |
| PRD-07-01 | run pre side effect-a (DIR-04) | FRD-03.0–03.9 | AT-06, AT-07 |
| PRD-07-02 | minimalni data ugovori | FRD-02.1–02.6, FRD-02.12, FRD-13.1 (per-run `RunRecord` kao observability projekcija istih ugovora) | AT-07, AT-08 |
| PRD-07-03 | faza = jedinica oporavka (DIR-05) | FRD-04.2, 02.3 | AT-07 |
| PRD-07-04 | `actionId ≠ attemptId ≠ providerIdempotencyKey` (DIR-06) | FRD-02.4, 14.4 | AT-08 |
| PRD-07-05, 07-09 | detach/cancel; R3-008 socket close | FRD-04.4 | AT-10 |
| PRD-07-06, 07-15 | F-DUR-01 restart → `interrupted`; F-DUR-02 `agent-runs.json` | FRD-04.1, 02.12, 14.1 | AT-07, AT-27 |
| PRD-07-07 | F-DUR-04 `CheckpointStore`/`RecoveryRunner` 0 pozivalaca | FRD-02.3, 04.3 | AT-07 |
| PRD-07-08 | F-DUR-05 held-action BORROW | FRD-02.4, 06.6 | AT-08, AT-12 |
| PRD-07-10 | F-DUR-03/C12 mapa stanja, `PAUSED` odloženo | FRD-04.1, 02.12 | AT-27 |
| PRD-07-11, 07-19 | F-DUR-10 cron format/lease/tz; misfire i vreme | FRD-09.4, 02.10, 04.3, 14.5 | AT-09, AT-23 |
| PRD-07-12, 07-18 | F-DUR-09 Loop state u recall-u; TOOLLESS carve-out | FRD-09.5, 07.2, 14.6 | AT-13, AT-23 |
| PRD-07-13 | F-DUR-08/F-HARN-07 globalni `harnessEvents` | FRD-02.5 | AT-06 |
| PRD-07-14 | F-DUR-07 per-run budžet ne preživljava | FRD-04.5, 02.3 (`budgetSpent`) | AT-03, AT-07 |
| PRD-07-16 | F-DUR-13 nema server-driven phase executor-a | FRD-01.2, 03.3, 03.7 | AT-06, AT-07 |
| PRD-07-17 | rutina = trigger recipe-a (DIR-19) | FRD-09.3, 02.10 | AT-23 |
| PRD-08-01, 08-02 | jedan resolver ugovor; 4 engine-a (DIR-11) | FRD-06.1, 06.2, 01.3 (sloj sposobnosti: fasada, ne fizičko spajanje) | AT-17 |
| PRD-08-03, 08-04 | envelope = presek; slojevi nepovezani | FRD-06.3 | AT-17 |
| PRD-08-05, 08-06, 08-07 | inline setup (D-10, C14); OAuth stanje; API-key safe scenario | FRD-06.4, 02.8, 03.5, 03.6 | AT-11 |
| PRD-08-08 | MCP install via Settings (R11) | FRD-06.5, 12.7 | AT-17 |
| PRD-08-09, 08-10 | shared actions (DIR-12); `ACTION_REGISTRY` samo NL bar | FRD-06.7 | AT-18 |
| PRD-08-11 | approvals nisu paywall (D-01) | FRD-06.6 | AT-12 |
| PRD-08-12 | skill putanje se čuvaju; bez širenja scope-a | FRD-06.8 | AT-17 |
| PRD-09-01 | `recallMemory` ostaje (D-12, DIR-09) | FRD-07.1, 01.4 (memorijski sloj: omotač bez novog engine-a) | AT-14 |
| PRD-09-02, 09-09 | `ContextPackage` omotač; trust/tokenBudget nepovezani; svaka promena bajtova recall bloka traži LoCoMo same-judge kontrolu (F-HM-15) | FRD-02.7, 03.4, 07.8 (LoCoMo regression gate) | AT-14, AT-16, AT-28 (deo: `recount.mjs` offline, bez regresije) |
| PRD-09-03 | snapshot ≠ nadjačavanje brisanja; rollback ≠ vraćanje obrisanog (DIR-21) | FRD-02.7, 12.8, 14.8, 12.9 | AT-15, AT-27 (rollback deo) |
| PRD-09-04 | tri skladišne odgovornosti; RAWDETAIL stanje | FRD-07.2 | AT-14 |
| PRD-09-05 | hookovi: `temporary`, read-side scan | FRD-07.3, 12.2, 14.11 | AT-14, AT-19 |
| PRD-09-06, 09-07 | izolacija minds; leak na 4 mesta | FRD-07.4, 14.9 | AT-13 |
| PRD-09-08 | `WAGGLE_CONTEXT_INJECTED` = koordinacija | FRD-07.5 | AT-16 |
| PRD-09-10, 09-11 | eksterni izvršioci opcioni (D-11); brief samo na route-proposal putu | FRD-07.6, 12.3 | AT-16 |
| PRD-09-12 | dva MCP servera (R23) | FRD-07.9 | — |
| PRD-09-13 | idempotentna konsolidacija | FRD-07.7, 03.8 | AT-14 |
| PRD-10-01 | evolution = deo teze (D-13) | FRD-08.1 | AT-04 |
| PRD-10-02, 10-03 | F-EVO-01 shadowed override; F-EVO-02 nema active pointer-a (`rolled_back` = `evolution_runs` CHECK table-rebuild) | FRD-08.2, 14.7, 14.3 | AT-04, AT-27 (`evolution_runs` migracija) |
| PRD-10-04, 10-06 | F-EVO-03 zatvoreno; F-EVO-05 `EvolveSchema` ne ulazi u Stage | FRD-08.3, 08.1 (red `EvolveSchema` Stage 1: wire-or-drop, R19, W3e-PR6; usklađeno sa dispozicijom R19/C10 i Delivery plan TM-03) | AT-05 |
| PRD-10-05, 10-09 | F-EVO-04 executor == judge; F-EVO-08 Anthropic ključ obavezan | FRD-08.4 | AT-05, AT-29 |
| PRD-10-07, 10-12 | F-EVO-06 delta poredi različite skupove; promotion tok | FRD-08.6, 02.11 | AT-29 |
| PRD-10-08 | F-EVO-07 tragovi sa tajnama zaobilaze `EvalDatasetBuilder` | FRD-08.6, 12.3 | AT-13, AT-19, AT-29 |
| PRD-10-10 | F-EVO-10 lažne UX tvrdnje | FRD-08.7, 02.11 (`written_not_active`) | AT-04 |
| PRD-10-11 | F-EVO-09 `AgentLearning` mrtav; zamena postoji (C10) | FRD-08.1 | — |
| PRD-10-13 | bounded recipe registry (DIR-14) | FRD-08.5, 02.11 | AT-29 (varijanta se promoviše samo na istim primerima/budžetu; usklađeno sa Delivery plan TM-21 i dispozicijom R03) |
| PRD-11-01, 11-02, 11-03 | Qwen 3.8 27B-klasa; identitet; Ollama pin stariji od release-a | FRD-10.3 | AT-20 |
| PRD-11-04, 11-05, 11-07 | hardware ladder; detekcija NVIDIA/Apple only; pull bez resume | FRD-10.2 | AT-20 |
| PRD-11-06 | instalacioni putevi | FRD-10.4 | AT-20 |
| PRD-11-08 | F-UXM-02/03 readiness false positives | FRD-10.1 | AT-20 |
| PRD-11-09 | onboarding 6 koraka | FRD-10.5 | — |
| PRD-11-10 | a11y + labele (funkcionalni deo): WCAG 2.2 AA kao acceptance cilj za **nove** površine; `?forceWizard=true` rute u axe listi (`tests/e2e/runtime-a11y.spec.ts:10-60` ih danas ne pokriva, F-UXM-09); nove Work Progress labele centralizovane — usklađeno sa Delivery plan TM-14 i dispozicijom A24 | FRD-05.8 (labele + a11y test nove površine) | — (nema zasebnog AT-a; a11y exit test W5-PR7; i18n/English-only deo = decision queue, brief §20.3, bez FRD ugovora) |
| PRD-12-01, 12-02 | jedan WorkItem (DIR-18); jedan mail/calendar scenario | FRD-02.9, 09.1 | AT-24 |
| PRD-12-03 | profil po kanalu (C6) | FRD-09.1, 11.2 | AT-19, AT-24, AT-25 |
| PRD-12-04 | injection = defense-in-depth; taint (A13) | FRD-09.2, 12.1, 12.2 | AT-19 |
| PRD-12-05 | odobrenje preko IM vezano za run/action | FRD-11.2, 12.6 | AT-25 |
| PRD-13-01, 13-02, 13-03 | KVARK connect ugovor; `createKvarkTools` 0 pozivalaca; bez re-pisanja org funkcija | FRD-11.4, 01.6 | AT-26 |
| PRD-13-04 | G1 de-gate: Approvals nav (3 mesta), `cost.ts:210,272`, `settings.ts:1192` audit-export → dostupno Solo korisniku (D-01; F-TK-02/03/04, F-CAP-07); `/api/admin/overview` placeholder = kandidat za uklanjanje | FRD-06.6, 11.4 (org-only ostaje iza KVARK konekcije, ne iza tier-a) | AT-12 (deo: Approvals dostupan Solo), AT-18 (deo) |
| PRD-13-05, 13-06 | tier inventar (24 fajla); migracija tier-a; pretplatnici NEPOZNATO; rollback migracije ne vraća erased/opozvano (A2, DIR-21) | FRD-14.10, FRD-14.13, FRD-14.14, FRD-14.15, FRD-14.16, FRD-06.3, FRD-12.9 | AT-27 |
| PRD-13-07 | worker granica (C20) | FRD-11.3 | — |
| PRD-13-08 | licencne oznake nekonzistentne | FRD-12.10 | — (decision queue) |
| PRD-13-09 | release chain kod vs live | FRD-13.5 | AT-30 |
| PRD-14-01, 14-02, 14-03 | benchmark = dokaz (D-18); production putanja (DIR-22); dva poređenja (DIR-23) | FRD-13.4 | AT-28 |
| PRD-14-04 | primarni test kandidat — NIJE ODOBRENO | FRD-13.4 (APEX-Agents red) | AT-28 |
| PRD-14-05 | `harness-sota-bench` grana | FRD-13.4 | — |
| PRD-14-06, 14-08 | dozvoljene poruke (C18); zaključana studija i kontaminacija | FRD-13.4 (statistika, `contaminationFirewall`) | AT-28 |
| PRD-14-07 | razvojni A/B kao G2 exit dokaz (greške i trošak, ne javni naslov); zamrzavanje hipoteze/metrike/uzorka/budžeta/stop kriterijuma pre B3 | FRD-13.4 (B2 razvojni A/B; `WAGGLE-BENCHMARK-PROTOCOL-DRAFT.md` BP-CMP) | AT-28 (dev A/B deo, G2) |
| PRD-14-09 | `cost-tracker.ts` cene (A29) | FRD-13.4 (cene), 14.12 | AT-28 (manifest `cost` polja), AT-03 (budžet: `ModelSpendBudget` ne baca prevremeni `BudgetExceededError`) — usklađeno sa dispozicijom A29; AT-29 (promotion) ne čita cene |
| PRD-15-01, 15-02 | Build-vs-Borrow (D-17, DIR-24); kandidati | FRD-01.5, 04.3, 06.7 | — |
| PRD-15-03, 15-05, 15-06 | OSS inventar; SBOM/NOTICES; shipping gate | FRD-13.5, 12.10; FR-OSS-01..12 (FRD v1.1 §18) ostaju važeći | AT-30 |
| PRD-15-04 | OSS drift stanje | FRD-14.2 (drift baseline), 07.9 | — |
| PRD-16-01..16-20 | van obima | FRD-01.9; pojedinačno: 16-06 → 08.5; 16-10 → 04.1 (`PAUSED`); 16-11 → 06.5; 16-12 → 06.3; 16-13 → 11.4; 16-14 → 05.2; 16-15 → 09.3; 16-16 → 07.9; 16-18 → 10.4 | — |
| PRD-17 (otvorene odluke) | decision queue | FRD-12.10 (licence), 10.3 (model konfiguracija), 14.10 (pretplatnici), 13.4 (benchmark budžet), 09.1 (mail scenario), 11.2 (mobile), 01.8 + 13.3 (pragovi) | — |

**Pokrivenost (mehanička provera `docs/plans/v1.2-evidence/tools/check_trace.mjs` nad ovom tabelom — POTVRĐENO NA REVIZIJI paketa, ponovljeno 28.09.2026):** svih **166** definisanih `PRD-SS-NN` ID-eva ima ≥1 red iznad (prethodni nacrt je propuštao PRD-02-11, PRD-03-10, PRD-13-04, PRD-14-07 — dopunjeno; PRD-02-12 → FRD-12.11 dodat u trećem kritičkom prolazu); svih **114** FRD ugovora iz §1–§14 ima ≥1 PRD ID — **114/114** (116 definisanih `FRD-nn.m` minus mape FRD-16.1/16.2; pravilo brojanja: `### FRD-…`, `| FRD-…` i bold `**FRD-…` definicije se broje, pa i FRD-01.9, FRD-03.0 i FRD-03.9; prethodni nacrt je propuštao FRD-01.3, 01.4, 01.7, 07.8, 12.5, 12.9, 13.1, 14.3 — dopunjeno; §16.1/§16.2 su same mape, ne ugovori). Napomena kritike (28.09.2026): raniji navod „110/110 (112 definisanih)” bio je netačan — prethodio je dodavanju FRD-14.15/14.16, a raniji alat nije razvijao opseg bez prefiksa `14.13–14.16` u redu PRD-13-05/13-06 (pa je javljao FRD-14.13..14.16 kao nepokrivene); red sada nosi eksplicitnu listu. Stavke bez **funkcionalnog** FRD ugovora (namerno, decision queue brief §20.3): PRD-01-07 i PRD-13-08 (licencna odluka → FRD-12.10 samo kao pokazivač) i i18n/English-only deo PRD-11-10 (a11y/labele deo je FRD-05.8). Uskladjeno sa Delivery plan §7: TM-24 (`PRD-02-03` → FRD-12.5) i TM-14 (`PRD-11-10` → FRD-05.8) sada imaju isti FRD ugovor u oba dokumenta. Reconcile pri finalizaciji ostaje obavezan za tekst redova (ne za pokrivenost): PREDLOG.

### FRD-16.2 — Nasleđe: PRD v1.1 sekcije + D/DIR/C/A/R → FRD → AT

| PRD v1.1 sekcija / izvor | FRD v1.2 | AT |
|---|---|---|
| §1-2 Product definition, principles; D-01, D-02, D-04, D-05, D-06 | FRD-01.*, 11.1, 11.4, 12.4 | AT-26, AT-30 |
| §3 User-facing model (Home, Attention, Workspace, Memory); D-07, D-08 | FRD-01.1, 09.1, 02.9 | AT-24 |
| §4 UX changes (Work Progress, View work, Routines block); DIR-16, A22, A23 | FRD-05.8, 02.5, 09.3, 10.5 | AT-06, AT-10 |
| §5 Harness and work execution; DIR-03, DIR-07, DIR-08, A4, A5, C17 | FRD-01.8, 05.* | AT-01, AT-02, AT-03, AT-21 |
| §6 Durable long tasks; DIR-04, DIR-05, DIR-06, A6-A11, C8, C12 | FRD-02.1-02.5, 03.*, 04.* | AT-06..AT-10, AT-27 |
| §7 Skills, connectors, capability acquisition; D-10, DIR-11, DIR-12, C13, C14, A12-A15, R11-R13 | FRD-06.*, 02.8 | AT-11, AT-12, AT-17, AT-18 |
| §8 Hive Mind; D-12, DIR-09, DIR-10, C11, A26, R14 | FRD-07.*, 02.7 | AT-13..AT-16, AT-22 |
| §9 Learning and self-evolution; D-13, DIR-13, DIR-14, DIR-15, C10, A16-A19, R03, R04, R18, R19 | FRD-08.*, 02.11 | AT-04, AT-05, AT-29 |
| §10 Models and onboarding; D-15, DIR-17, C19, A20, A21, R16, R17 | FRD-10.* | AT-20 |
| §11 Deployment and KVARK; D-02, D-03, D-04, DIR-20, C4, C20, A27, R02, R15 | FRD-11.* | AT-25, AT-26 |
| §12 Benchmark and product proof; D-18, DIR-22, DIR-23, C18, A25, A29, R08, R09 | FRD-13.4, 13.5 | AT-28 |
| §13 Release priorities → G1/G2/G3 (brief §5.1, §15; C9, C22, A1) | FRD-13.5 + Delivery plan | AT-30 |
| §14-15 OSS-first, Build-vs-Borrow; D-17, DIR-24, A28, R20-R24 | FRD-06.7 (agent-native), 01.5 (durable engine), 12.10, 13.5; FR-OSS-01..12 iz FRD v1.1 §18 ostaju važeći | AT-30 |
| Routines / TOOLLESS; D-14, DIR-19, C15, R05, R10 | FRD-09.3-09.5, 02.10 | AT-23 |
| Privacy/erasure; A2, A3, DIR-21 | FRD-12.*, 14.* | AT-15, AT-19, AT-27 |

**Nasleđe iz FRD v1.1 koje v1.2 menja eksplicitno:** §3 redosled koraka (run pre blokiranja i konteksta, C8); §4 `PAUSED` odloženo (C12); §6 lane red = tie-breaker, ne prioritet (C13); §7 „injection before native or external execution” zadržano, ali sa `WAGGLE_CONTEXT_INJECTED` kao koordinacijom (A26); §8 „executor ≠ judge” postaje poželjno, ne obavezno (A19); §15 gate „evolved recipe” sužen na prompt/persona/spec promotion + posebno procenjen bounded recipe registry (R04, DIR-14); §11 mobile = IM companion minimum (R02); §14 „preserve AgentLearning/EvolveSchema” → „wire or replace, ne no-op” (C10).

---

## Izvori

- **D** — odluke korisnika 27.09.2026 (brief §3): D-01..D-18 nisu ponovo otvarane.
- **DIR** — direktive iz briefa: DIR-01..DIR-25 (citirane po sekcijama); oznaka **PREDLOG — SMER BRIEFA**, nikad ODLUKA (brief §1, §2.1 red P); isto važi za razrešenja C/A/R iz brief §17–§19. ODLUKA u ovom dokumentu = samo D-01..D-18; dve founder odluke iz memorije nose ISTORIJSKA FOUNDER ODLUKA (memorija, datum) (Konvencija statusa).
- **C/A/R** — S1 nalazi C1–C22 (S1 §1, L26–L47), A1–A29 (S1 §2, L53–L126), rezovi R01–R24 (brief §19 numeracija nad S1 §3); razrešenja po brief §17–§19.
- **S1** — `procitaj-d-projects-waggle-os-docs-waggl-rustling-milner-agent-ac748482c5af17ddf.md`, SHA-256 `b7f03ff7…da8b08` (brief §22); kopija `docs/plans/v1.2-evidence/inputs/S1-audit-2026-09-27.md`.
- **S4/S5** — PRD/FRD v1.1 (`Waggle_PRD_v1.1_2026-09-27.docx`, `Waggle_FRD_v1.1_2026-09-27.docx`; ekstrakti `docs/plans/v1.2-evidence/inputs/Waggle_PRD_v1.1_2026-09-27.md`, `docs/plans/v1.2-evidence/inputs/Waggle_FRD_v1.1_2026-09-27.md`).
- **PRD v1.2 DRAFT** — `docs/Waggle_PRD_v1.2_DRAFT.md` (ista revizija `2af0904d`; ID šema `PRD-SS-NN`), izvor za §16.1; pisan paralelno sa ovim FRD-om, reconcile obavezan pri finalizaciji.
- **Provera pokrivenosti §16.1** — `docs/plans/v1.2-evidence/tools/check_trace.mjs` (priložen uz paket; `node docs/plans/v1.2-evidence/tools/check_trace.mjs` iz korena repoa; mehanički: definisani `PRD-SS-NN` iz PRD-a i `FRD-nn.m` iz ovog dokumenta ↔ tokeni §16.1, sa razvijanjem opsega; rezultat 28.09.2026: 166/166 PRD, 114/114 FRD ugovora — 116 definisanih minus mape FRD-16.1/16.2; isto kao §16.1). **Delivery plan v1.2** — `docs/plans/WAGGLE-DELIVERY-PLAN-v1.2.md` §2 „Owner/uloga” + „Exit testovi” po talasu, DP-0.14, §7 TM-01..TM-25: izvor za owner uloge i kolonu „Wave (autoritativan za dokaz završetka)” u §15. **Dispozicija** — `docs/plans/WAGGLE-AUDIT-DISPOSITION-v1.2.md` (C17/R06 coding put, A24 a11y/i18n).
- **ADR paket (brief §20.2, svih deset napisano kao DRAFT / PREDLOG; POTVRĐENO NA REVIZIJI paketa 27.09.2026)** — `docs/decisions/2026-09-27-ADR-01..10` + `ADR-INDEX.md`: ADR-01 conversation/work režimi (§2.1, §5) · ADR-02 durable store/phase resume/action idempotency (§2.2–2.4, §4) · ADR-03 detach/cancel vs R3-008 (§4.4, FRD-04.4) · ADR-04 inline capability/OAuth vs held-action/D3 (§2.8, §6) · ADR-05 RAWDETAIL/context/hook precedence (§7) · ADR-06 active override/promotion/rollback (§8) · **ADR-07 Routines vs TOOLLESS Loops** (§9.3–9.5, §2.10) · **ADR-08 individualni tiers i KVARK boundary** (§11.3–11.4, §6.6) · **ADR-09 secondary worker** (§11) · **ADR-10 release/privacy profili** (§12–§13). Nijedan ADR nije odobren ni implementiran.
- **Faza A (validirani nalazi, override nad S1 gde se razlikuju):** `docs/plans/v1.2-evidence/phaseA/harness.md` + `harness.refute.md` (7/7 HOLDS; putanje ispravljene), `durable.md` + `durable.refute.md` (F-DUR-10 novi NALAZ format `next_run_at`; F-DUR-09 HOLDS+), `evolution.md` + `evolution.refute.md` (F-EVO-09 WEAKENED: korekcije već produkuju signale), `hivemind.md` + `hivemind.refute.md` (F-HM-02 WEAKENED: `memory_compact` cron postoji; F-HM-05 policy gate), `capability.md`, `ux-model.md`, `tiers-kvark.md`, `release-oss.md`, `external.md` (EXT-1..12), `oss-drift-check-output.txt`, repro skripte `repro-harness.mjs`, `repro-shadow.mjs`, `repro-gepa-delta.mjs`.
- **Repo** — `D:/Projects/waggle-os` @ `2af0904df01ca3d374cc78ba95b60dc579dd6a7a`, read-only; tipovi direktno pročitani za §2.12: `packages/shared/src/types.ts:376-452,770-790`, `packages/agent/src/workflow-harness.ts:20-210`, `packages/agent/src/long-task/checkpoint.ts:25-120`, `packages/core/src/cron-store.ts:80-165`, `packages/hive-mind-core/src/mind/execution-traces.ts:14-62`, `packages/hive-mind-core/src/mind/frames.ts:20-40`, `packages/hive-mind-core/src/mind/evolution-runs.ts:20-100`, `packages/agent/src/capability-acquisition.ts:19-36`, `packages/agent/src/task-shape.ts:10-44`, `packages/server/src/local/routes/capability-proposals.ts:1-60`, `packages/server/src/local/approval-grants.ts:1-60`, `packages/server/src/local/executor-brief.ts:1-60`, `packages/server/src/local/agent-run-registry.ts:20-60`, `apps/web/src/lib/types.ts:570-590`, `packages/agent/src/agent-loop.ts:48,106,895`.
- **Ograničenja ovog nacrta:** nijedan vitest nije pokrenut za potrebe ovog dokumenta; svi „test postoji” navodi znače „pinuje ponašanje”, ne „izvršen”. Live GitHub/HF/Ollama podaci su stanje 27.09.2026 (external.md), ne svojstvo revizije. Procene i wave slicing su **PREDLOG** Delivery plana; owner uloge i „autoritativan talas” u §15 su preuzeti iz Delivery plana §2/§7 kao PREDLOG (uloge, ne imena), a G-milestone dodele ostaju PREDLOG.
