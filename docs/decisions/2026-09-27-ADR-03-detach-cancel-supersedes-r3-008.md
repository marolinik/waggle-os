# ADR-03 — Detach ≠ cancel: nastavak odobrenog background posla, `sinceSeq` reconnect i granica R3-008

**Revizija dokumenta:** 1.2 DRAFT · 27.09.2026 · pregledana revizija koda `2af0904df01ca3d374cc78ba95b60dc579dd6a7a`
**Datum:** 2026-09-27
**Status:** DRAFT — predlog ugovora; ne menja R3-008 za foreground chat pre W1
**Autor:** planer (Fable 5.1)
**Ratifikuje:** founder — čeka
**Zamenjuje / precizira:** R3-008 („socket close aborts in-flight run”, `docs/audits/2026-05-29-prod-readiness/REPORT.md:103,157`; `packages/agent/src/agent-loop.ts:1090-1108,1458-1468`; `packages/server/src/local/routes/chat.ts:1604-1612`) — **ne ukida se**, sužava se na foreground `conversation` putanju; `MAX_EVENTS`/`resetRequired` model registry stream-a kao jedini replay mehanizam; S1 A9
**Obavezuje:** W1 (per-run event bus, detach API), W5 (Work Progress + UX copy), ADR-02 (RunEvent `seq`)
**Cross-references:** ADR-01, ADR-02, ADR-07 (rutine su uvek detached), ADR-09 (worker nema SSE ugovor); brief §6.4; AT-10, AT-06; FRD-05.8 (Stop/View-work copy test, bez AT ID-a — AT-22 je change-input test, Disposition OD-10)

---

## §1 — Kontekst

**ADR-03-K1 (POTVRĐENO NA REVIZIJI — namerno ponašanje).** Zatvaranje SSE socket-a prekida turn: `chat.ts:1604-1612` `raw.once('close', () => { if (!raw.writableEnded) abortController.abort(); })` (komentar: „must abort the provider/tool run immediately”); signal se prosleđuje u fetch i proverava između turnova i u read petlji (`agent-loop.ts:973-975,1090-1108,1147,1458-1468,1663,1827,1872`). Isti obrazac na proxy putanji (`anthropic-proxy.ts:817,1114`). Poreklo: R3-008 (2026-05-29 prod-readiness), test `packages/agent/tests/agent-loop.test.ts:1981-2010`. [durable.md F-DUR-06; refute WEAKENED samo za UX copy tvrdnju]

**ADR-03-K2 (POTVRĐENO NA REVIZIJI).** Klijent: Stop (`apps/web/src/hooks/useChat.ts:463-469`) i unmount (`:473-487`) zovu `controller.abort()` + `adapter.abortAgent()` (`adapter.ts:1184-1208`). Deca nasleđuju prekid: `chat-collaboration.ts:110-128` `linkParentCancellation` → `registry.control(runId,'cancel')`. Nema opcije „nastavi u pozadini” (grep `background|detach` u `useChat.ts`/`adapter.ts`: 0 relevantnih; `adapter.ts:3490` `detached` je external-tool launch). Postojeća copy „Stop generating” (`ChatApp.tsx:2428-2432`) i „Stop response and start a new session” (`:2030`) **ne kaže** da se otkazuju child subagent runovi niti da zatvaranje taba prekida posao — to je stvarni gap prema brief §6.4. [F-DUR-06 + refute]

**ADR-03-K3 (POTVRĐENO NA REVIZIJI).** Replay: `GET /api/agent-runs/events?since=` postoji za registry upsert događaje (`routes/agent-runs.ts:20-22,73-84`; `agent-run-registry.ts:243-257` `resetRequired`), ali chat SSE nema `sinceSeq`/`Last-Event-ID` (grep `packages/server/src` = 0); `/api/events/stream` (`routes/events.ts:328-359`) je live-only. `step` SSE payload nema `runId/phaseId/status/evidenceRefs` (`chat-agent-run.ts:155-199`; `lib/types.ts:575-586`). [F-DUR-06, F-UXM-11]

**ADR-03-K4 (POTVRĐENO NA REVIZIJI).** Subagent/workflow „background” je vezan za životni vek roditeljskog HTTP turna (`subagent-orchestrator.ts:93,119-124,439-458`); fleet spawn (`POST /api/fleet/spawn`, 202) je najbliži interni tok koji nastavlja bez otvorenog klijentskog socket-a, ali ne preživljava restart (F-DUR-01). External-tool runovi (`POST /api/tools/launch`, `POST /api/tools/run`) takođe nastavljaju bez socket-a i preživljavaju restart sidecar-a kroz pid-reconcile dok je pid živ (`agent-run-registry.ts:381-395,510-520`; test `packages/server/tests/tools-routes-launch.test.ts:1148-1170`; POTVRĐENO NA REVIZIJI po refuteru F-DUR-12) — BORROW presedan uz fleet spawn (v. ADR-02-P3). `lifecycle.isShuttingDown()` guardovi (`fleet-run-executor.ts:379-478`) odbijaju nove spawn-ove, ne čuvaju tekuće. [F-DUR-12; refute WEAKENED samo citat testa: `packages/server/tests/tools-routes-launch.test.ts:1148-1170`]

**ADR-03-K5 (ODLUKA — D-14 · PREDLOG — SMER BRIEFA — DIR-05, brief §6.4).** ODLUKA: dug rad i rutine su deo proizvoda (D-14). PREDLOG — SMER BRIEFA (planerski smer, ne korisnikovo odobrenje): „Detach znači da se UI odvaja, a odobreni background posao nastavlja. Cancel znači zahtev da ne počinju nove radnje, kontrolisano zaustavljanje i terminalni zapis. Gubitak SSE veze sam po sebi nije korisnička odluka za cancel.” (brief §6.4)

## §2 — Odluka (predlog ugovora)

**ADR-03-O1 (PREDLOG) — dve putanje, jedna semantika reči.**
- **Foreground `conversation`** (`/api/chat` bez DurableRun-a): R3-008 **ostaje** — zatvaranje socket-a/Stop prekida turn i decu. UX mora to reći eksplicitno (O5). Ovo je jeftina, sigurna, postojeća semantika za kratke odgovore.
- **Durable `work`** (DurableRun postoji, ADR-02): zatvaranje socket-a je **detach**, ne cancel. Run nastavlja pod lease-om; `Stop` dugme u Work Progress-u šalje eksplicitan `POST /api/runs/:id/control {action:'cancel'}`; tek to je cancel.

**ADR-03-O2 (PREDLOG) — cancel semantika.** Cancel = (1) `cancelling` (prelazno, čuva se), (2) zabrana novih `ToolAction.dispatching` (ADR-02 O5) — radnje već u `dispatching` se ne prekidaju nasilno nego dovode do `succeeded|failed|unknown_outcome`, (3) kooperativni `AbortSignal` za model pozive/čitanje (postojeći mehanizam), (4) terminalni `CANCELLED` sa razlogom, sačuvanim checkpoint-ima i artefaktima (FRD §4 „retains completed artifacts/checkpoints”).

**ADR-03-O3 (PREDLOG) — run-scoped event bus i reconnect.** Svaki `RunEvent` ima `runId` + monotoni `seq` (ADR-02 O1). `GET /api/runs/:id/stream?sinceSeq=N` vraća događaje > N pa nastavlja live; `sinceSeq` stariji od najstarijeg zadržanog → `resetRequired` + snapshot (BORROW iz `agent-run-registry.ts:243-257`). Replay i dupli događaji ne smeju duplirati tekst, kartice ni sporedne radnje: klijent dedupuje po `(runId, seq)`, kartice nose `actionId`. Globalni `harnessEvents`/`harnessId` nije dovoljan za dva istovremena Workspace-a (ADR-01 K6) → most `harnessEvents → RunEvent` po `runId`.

**ADR-03-O4 (PREDLOG) — detach je eksplicitan, ne skriven.** Kad korisnik napusti Workspace/tab tokom `work` run-a, UI prikazuje „Posao nastavlja u pozadini · View work”; kad se vrati, Work Progress se rekonstruiše iz `sinceSeq=0` ili snapshot-a. Detached posao je vidljiv iz Home-a (What Needs Me / My Work, D-07) i iz Approvals kad je `BLOCKED_*`.

**ADR-03-O5 (PREDLOG) — UX copy za foreground putanju (najmanja promena, W0/W5).** „Stop generating” dobija tooltip/aria: „Zaustavlja odgovor i sve pomoćne agente pokrenute iz njega. Zatvaranje kartice ima isti efekat.” Bez skrivanja bezbednosno relevantne informacije radi čistijeg copy-ja (brief §11.1).

**ADR-03-O6 (PREDLOG) — rutine i channel turnovi su uvek detached.** Nemaju klijentski socket (ADR-07); njihov „cancel” je isključivo `control` API ili disable rutine; disconnect IM klijenta nije cancel (AT-25 ne daje IM-u cancel bez vezanog tokena).

## §3 — Šta zamenjuje i zašto

| Prethodno | Gde | Zašto |
|---|---|---|
| R3-008: socket close → abort, univerzalno | `chat.ts:1604-1612`; `agent-loop.ts:1090-1108`; REPORT.md:103 | Ispravno za foreground chat (zaustavlja trošak), pogrešno kao jedini model za dug rad (D-14). **Sužava se**, ne ukida; test `agent-loop.test.ts:1981-2010` ostaje |
| „Stop” = zatvaranje socket-a; cancel dece implicitan | `useChat.ts:463-487`; `chat-collaboration.ts:110-128` | Korisnik ne zna da gubi decu/posao (POTVRĐENO da copy to ne kaže) |
| Registry `since` kao jedini replay (upsert događaji, globalni `MAX_EVENTS`) | `routes/agent-runs.ts:73-84` | Kompatibilan ekvivalent za run-status, ne za tekst/kartice; per-run `seq` nedostaje |
| S1 A9 „Stop means cancel, not socket close” | S1 A9 | Prihvaćeno uz preciziranje: važi za durable `work`; foreground zadržava R3-008 uz jasan copy (brief §6.4) |

**ADR-03-Z1 (ODLUKA — ne otvara se · PREDLOG — SMER BRIEFA — DIR-05, brief §6.4).** ODLUKA: D-14 (dug rad i rutine su deo proizvoda) se sprovodi, ne odlučuje; D-01..D-18 nisu predmet ovog ADR-a. PREDLOG — SMER BRIEFA: detach ≠ cancel (DIR-05, brief §6.4) je radna osnova koju ovaj ADR sprovodi; R3-008 se sužava, ne ukida.

## §4 — Posledice

**ADR-03-P1 (PREDLOG).** Nema promene R3-008 koda pre W1; W0 isporučuje samo O5 copy. Fleet spawn i channel/cron turnovi su prvi kandidati za O1 durable putanju (ADR-02 P4).

**ADR-03-P2 (PREDLOG).** `step` SSE payload (`chat-agent-run.ts:155-199`) i `StepContentBlock` (`lib/types.ts:575-586`) se **aditivno** proširuju (`runId`, `phaseId`, `seq`, `status: running|done|failed|blocked`, `evidenceRefs`); `ActivityStream` (`warm/ActivityStream.tsx:58,71`, već `aria-live`) ostaje render površina (DIR-16 bez rewrite-a).

**ADR-03-P3 (PREDLOG).** Klijent dobija reconnect logiku sa `sinceSeq` samo za run stream; chat `conversation` stream ostaje kakav jeste.

**ADR-03-P4 (PREDLOG).** Testovi: `agent-loop.test.ts:1981-2010` (R3-008) ostaje zelen; `chat-collaboration.test.ts` link-parent-cancel testovi ostaju za foreground; novi testovi §6.

## §5 — Rizik

| ID | Rizik | V/U | Mitigacija |
|---|---|---|---|
| ADR-03-R1 | Detached run troši budžet bez korisnika na ekranu | srednja / srednja | budžet cap po run-u (ADR-02 O7); notifikacija na BLOCKED/FAILED; Home vidljivost |
| ADR-03-R2 | Replay duplira kartice/akcije | srednja / visoka | `(runId,seq)` dedup; kartice po `actionId`; AT-10 |
| ADR-03-R3 | Korisnik misli da je Stop cancel-ovao durable posao a nije | srednja / srednja | O1 eksplicitan control API + potvrda „Otkazano” tek na `CANCELLED` |
| ADR-03-R4 | Proxy putanja (`anthropic-proxy.ts`) zadržava close→abort i za work | niska | proxy nije durable putanja; dokumentovati |

## §6 — Migration test

| ID | Test | Očekivanje | AT |
|---|---|---|---|
| ADR-03-T1 | Durable run; klijent zatvori SSE → run ostaje `RUNNING`, sledeća faza se izvršava; `GET …/stream?sinceSeq=k` vraća propuštene događaje bez duplikata | RED danas (turn prekinut) | AT-10 |
| ADR-03-T2 | `control cancel` tokom `dispatching` radnje → radnja završi `succeeded/unknown_outcome`, nova radnja ne počinje, run `CANCELLED` sa sačuvanim checkpoint-ima | novi | AT-10 |
| ADR-03-T3 | Foreground `conversation`: socket close → abort (R3-008 ostaje) | zeleno danas (`agent-loop.test.ts:1981-2010`) | — |
| ADR-03-T4 | Replay istog `seq` dvaput → jedna kartica, jedan text blok (klijentski test, `apps/web/src/test/`) | novi | AT-10 |
| ADR-03-T5 | Dva istovremena run-a → dva stream-a, događaji se ne mešaju | RED danas (globalni `harnessEvents`) | AT-06 |
| ADR-03-T6 | UI copy test: Stop tooltip sadrži informaciju o pomoćnim agentima/zatvaranju kartice | novi (vitest DOM) | — (FRD-05.8 copy test, Delivery plan W0-PR16; brief §16 nema AT za ovaj UX — Disposition OD-10) |

## §7 — Izvori

- **D:** D-14 · **DIR:** DIR-05 (brief §6.4) · **C/A/R:** C12; A9, A11; R10 · **AT:** AT-06, AT-10, AT-25 (T6 = FRD-05.8 test bez AT ID-a)
- **Phase A:** `docs/plans/v1.2-evidence/phaseA/durable.md` F-DUR-06, F-DUR-08, F-DUR-12; `docs/plans/v1.2-evidence/phaseA/durable.refute.md`; `docs/plans/v1.2-evidence/phaseA/ux-model.md` F-UXM-11
- **S1:** A9, A11 · **Kod (na `2af0904d`):** `packages/server/src/local/routes/chat.ts:1604-1612`; `packages/agent/src/agent-loop.ts:973-975,1090-1108,1458-1468`; `apps/web/src/hooks/useChat.ts:463-487`; `apps/web/src/lib/adapter.ts:1184-1208`; `apps/web/src/components/os/apps/ChatApp.tsx:2030,2428-2432`; `packages/server/src/local/chat-collaboration.ts:110-128`; `routes/agent-runs.ts:20-22,73-84`; `routes/events.ts:328-359`; `routes/chat-agent-run.ts:155-199`; `packages/agent/src/subagent-orchestrator.ts:93,119-124`; `docs/audits/2026-05-29-prod-readiness/REPORT.md:103,157`
