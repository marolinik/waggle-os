# Phase A — skeptična revizija (refute pass) grupe „durable"

- **Revizija:** `main = 2af0904df01ca3d374cc78ba95b60dc579dd6a7a` (`git rev-parse HEAD` potvrđen; `git status --porcelain` = samo dva untracked `.docx` u `docs/`, dakle svi citirani izvorni fajlovi == HEAD).
- **Datum:** 2026-09-27. Repo read-only; ništa nije menjano. Jedini izvršeni kod: dva `node -e` probe-a nad `node_modules/better-sqlite3` (in-memory `:memory:` baza) i `node_modules/cron-parser` — bez dodira repo fajlova.
- **Metod:** za svaki nalaz sa statusom POTVRĐENO NA REVIZIJI pročitani citirani redovi + pozivaoci + testovi; grep po sposobnosti (resume/pause/reattach/idempotency/Last-Event-ID/timezone/getDue). Provereno i da li „minimalChange" lomi postojeći test.
- **Legenda verdikta:** HOLDS = nalaz stoji kako je napisan · WEAKENED = nalaz stoji, ali je neka tvrdnja/citat netačan ili postoji kontekst koji ga slabi · REFUTED = suštinska tvrdnja pogrešna.

```json
{
  "F-DUR-01": {
    "verdict": "HOLDS",
    "why": "Konstruktor bezuslovno zove interruptInFlightInternalRuns(); ALLOWED_TRANSITIONS.interrupted je prazan Set, control() odbija terminalne runove, jedini 'resume' setter je control('resume') koji radi samo iz paused (capability koju niko ne uključuje). Nema guard-a, config flag-a ni env promenljive koja menja ponašanje. Test :195-218 pinuje 'interrupted' kao ŽELJENO. KONTEKST (ne pobija): u kodu postoji odvojen resume pattern za HARVEST runove (M-08: routes/harvest.ts:128, HarvestTab.tsx:100-227, adapter.resumeHarvestRun :4018) — dokaz da je 'resume iz interrupted' već projektovan u drugom domenu, pa je za W1 to BORROW kandidat. Fleet 'pause/resume' (routes/fleet.ts:585-603, workspace-sessions.ts:241-259) NIJE suspend: pause() abortuje AbortController, tj. isto što i cancel uz zadržanu sesiju.",
    "minimalChangeBreaksTest": "DA ako se doda interrupted->queued u ALLOWED_TRANSITIONS bez zaštite: agent-run-registry.test.ts:84-94 ('rejects illegal terminal transitions') asertuje da terminalni run ne može nazad u 'running' (na completed; interrupted nije direktno testiran, ali TERMINAL_STATUSES semantika je zajednička). Zato eksplicitan resume API (ne izmena tabele tranzicija) je jedini bezbedan put — kako minimalChange i kaže.",
    "evidence": [
      "packages/server/src/local/agent-run-registry.ts:137 (konstruktor) , :510-520 (interruptInFlightInternalRuns), :41 (interrupted: new Set()), :282 (control() throws 'Run is already ...'), :330-331 (pause/resume setteri)",
      "packages/server/tests/local/agent-run-registry.test.ts:195-218",
      "packages/server/src/local/workspace-sessions.ts:241-259 (pause = abort)",
      "packages/server/src/local/routes/harvest.ts:128 ; apps/web/src/lib/adapter.ts:4018 (harvest resume pattern)"
    ]
  },
  "F-DUR-02": {
    "verdict": "WEAKENED",
    "why": "Sve tehničke tvrdnje stoje (MAX_EVENTS=2_000 :29,:505; load() tiho prazan store na version!==1/corrupt :522-535; nema GC nad runs[]). Netačna je jedna tvrdnja o testovima: 'grep resetRequired u tests: 0' — postoji packages/server/tests/local/agent-run-registry.test.ts:104-105 (`expect(replay.resetRequired).toBe(false)`) i eventsSince() se koristi u agent-groups.test.ts:1066 i chat-collaboration.test.ts:676-1181. Ono što ZAISTA nedostaje: test za resetRequired===true (overflow) i test za corrupt/version-mismatch load (grep 'corrupt|version|2_000' u agent-run-registry.test.ts: 0). Nalaz treba prepisati na tu preciznu formulaciju.",
    "minimalChangeBreaksTest": "NE (plan-only; atomic write :548-573 ostaje).",
    "evidence": [
      "packages/server/src/local/agent-run-registry.ts:29, :243-257, :497-508, :522-535, :539-574",
      "packages/server/tests/local/agent-run-registry.test.ts:104-105 (resetRequired false path)",
      "packages/server/tests/waggle-dance-routes.test.ts:225, :291 (čita agent-runs.json)"
    ]
  },
  "F-DUR-03": {
    "verdict": "HOLDS",
    "why": "Grep settera potvrđen: status:'waiting_for_approval' = 0, status:'starting' = 0, pause:true/resume:true = 0 u packages/server/src i packages/agent/src; svi producenti registruju samo capabilities:{cancel:true|false} (chat-collaboration.ts:244,268,461,490; fleet-run-executor.ts:486,495; agent-groups.ts:319,338; external-tool-runs.ts:311,329,358; routes/agent-runs.ts POST /api/rooms {cancel:true,message:true}). 'paused' nastaje samo iz control('pause') :330 koje zahteva capability pause=true koju niko ne daje, i iz derivedStatus :613. Pokušaj pobijanja preko fleet pause/resume rute: fleet.ts:585-603 pauzira WORKSPACE SESIJU (AbortController.abort + status='paused' u in-memory sessions Map), ne CollaborationRun — i to je abort, ne suspenzija (fleet.ts:419 'Agent loop aborted (workspace paused)'). Dakle 'PAUSED nema suspension primitiv' stoji čak i uz postojanje rute koja se zove pause.",
    "minimalChangeBreaksTest": "NE (tabela mapiranja u FRD; enum se ne menja). Napomena: brisanje bilo koje vrednosti iz COLLABORATION_RUN_STATUSES bi slomilo zod enum routes/agent-runs.ts:15 i RoomApp.tsx:51-66 — minimalChange to ispravno zabranjuje.",
    "evidence": [
      "packages/shared/src/types.ts:398-402, :404-405, :445-450, :381-384",
      "packages/server/src/local/agent-run-registry.ts:31-42, :46-51, :330-331, :613-622",
      "packages/server/src/local/routes/fleet.ts:419, :584-603 ; packages/server/src/local/workspace-sessions.ts:241-259",
      "packages/server/src/local/routes/agents.ts:149-160 ; apps/web/src/components/os/apps/RoomApp.tsx:51-66"
    ]
  },
  "F-DUR-04": {
    "verdict": "n/a (DELIMIČNO/NEPOVEZANO — nije predmet pobijanja)",
    "why": "Potvrđeno samo da createHarnessRun/advancePhase i CheckpointStore nemaju ne-test pozivaoce u packages/server/src (grep 'createHarnessRun|advancePhase|activeHarnessRuns' van workflow-*.ts = samo re-export packages/agent/src/index.ts:315).",
    "evidence": ["packages/agent/src/index.ts:315"]
  },
  "F-DUR-05": {
    "verdict": "HOLDS",
    "why": "ADR inline :6-10 i cron-store.ts:83-87 doslovno kažu 'never mid-run suspend/resume'. Atomic claim :157-158 -> cron-store.ts:551-556 (`UPDATE ... WHERE id=? AND status='held'`). Sekvenca :233-235 je execute() PA updatePendingActionResult — crash između ostavlja red 'approved' zauvek; PendingActionStatus (:88) nema prelazno/unknown stanje. Grep 'idempotency|unknown_outcome|dispatching' po server/core: jedini drugi idempotency pattern je services/job-service.ts:38 (team-mode job id kolizija, Postgres) — nije provider-idempotency i nije u Solo putanji. routes/approval.ts:66-68 dodatno vraća 409 za status!=='held', što ne menja crash analizu (red ostaje 'approved' -> UI 409 'already_decided' bez izvršenog rezultata).",
    "minimalChangeBreaksTest": "MOGUĆE: held-action-executor.test.ts:108-118 asertuje row.status==='executed' posle uspeha i :120-128 idempotenciju preko 'already decided' — dodavanje prelaznog statusa PRE execute ne lomi te asercije ako terminalni status ostaje 'executed'/'failed'; ali PendingActionStatus union se širi pa svaki `switch` bez default-a (grep: nema ih u ne-test kodu; ApprovalsApp.tsx:182,301 filtrira po source==='held', ne po statusu) treba proveriti pri implementaciji.",
    "evidence": [
      "packages/server/src/local/held-action-executor.ts:6-10, :29, :154-166, :233-235",
      "packages/core/src/cron-store.ts:83-88, :544-556, :558-571",
      "packages/server/src/local/routes/approval.ts:58-85",
      "packages/server/tests/local/held-action-executor.test.ts:108-131, :187-195",
      "packages/server/src/services/job-service.ts:38 (druga vrsta idempotencije, team-mode)"
    ]
  },
  "F-DUR-06": {
    "verdict": "WEAKENED",
    "why": "Mehanika stoji: chat.ts:1606-1612 `raw.once('close') -> abortController.abort()` bez ikakvog flag-a; useChat.ts:463-469 (Stop) i :473-487 (unmount) zovu abort + adapter.abortAgent; agent-loop.ts:1090-1108 prosleđuje signal u fetch. Grep 'background|detach|Last-Event-ID|lastEventId' u useChat/adapter/chat.ts/events.ts: 0 relevantnih (adapter.ts:3490 'detached' je external-tool launch, druga stvar). Slabljenje: tvrdnja 'UX copy koja to saopštava korisniku nije nađena' je preterana — postoji ChatApp.tsx:2428-2432 HintTooltip 'Stop generating' + aria-label 'Stop generating' i :2030 'Stop response and start a new session'. Ta copy kaže da se odgovor zaustavlja, ali NE kaže da se otkazuju i child subagent runovi niti da zatvaranje taba prekida posao — što je stvarni gap prema briefu §6.4. Preformulisati.",
    "minimalChangeBreaksTest": "NE ((a) tekst; (b) bez izmene; (c) dokumentacija). Za R3-008 postoji pin packages/agent/tests/agent-loop.test.ts:1981-2010 — minimalChange ga ne dira.",
    "evidence": [
      "packages/server/src/local/routes/chat.ts:1603-1612",
      "apps/web/src/hooks/useChat.ts:458-487 ; apps/web/src/lib/adapter.ts:1184-1208",
      "packages/agent/src/agent-loop.ts:1090-1108",
      "apps/web/src/components/os/apps/ChatApp.tsx:2030, :2428-2432 (postojeća Stop copy)",
      "packages/server/src/local/routes/anthropic-proxy.ts:817, :1114 (isti close->abort pattern i na proxy putanji)"
    ]
  },
  "F-DUR-07": {
    "verdict": "n/a (DELIMIČNO/NEPOVEZANO — nije predmet pobijanja)",
    "why": "Samo potvrđen ai_task cap: index.ts:2414-2418 koristi cronStore.countExecutionsToday (cron-store.ts:406-411, `executed_at >= date('now')`, UTC).",
    "evidence": ["packages/server/src/local/index.ts:2412-2418", "packages/core/src/cron-store.ts:406-411"]
  },
  "F-DUR-08": {
    "verdict": "HOLDS",
    "why": "harnessEvents je modul-globalni EventEmitter (workflow-harness.ts:132); sva tri payload tipa nose harnessId bez runId (grep 'runId|run_id' u workflow-harness.ts i harness-trace-bridge.ts: 0). Run identitet postoji samo u workflow-tools.ts (activeHarnessRuns Map :447, generateHarnessRunId :453-457) i ne prelazi u emitovane događaje. Bridge taguje `['harness', harnessId, phaseId, 'phase:<name>']` (:131-133). Komentar :440-443 eksplicitno kaže da je Map keyed po run_id zbog paralelnih sesija — ali događaji/trace-ovi to razlikovanje nemaju.",
    "minimalChangeBreaksTest": "NE: harness-trace-bridge.test.ts:146-156 koristi toContain na tags, ne toEqual, pa aditivan tag/polje prolazi. Grep 'toHaveBeenCalledWith({' / toEqual nad payload-ima u packages/agent/tests za 'harness:phase:*' : 0 — nema strogih asercija oblika payload-a.",
    "evidence": [
      "packages/agent/src/workflow-harness.ts:132, :134-160, :169-183, :243-256",
      "packages/agent/src/workflow-tools.ts:362-380, :440-457",
      "packages/agent/src/harness-trace-bridge.ts:22-24, :128-133, :155-162",
      "packages/agent/tests/harness-trace-bridge.test.ts:146-156"
    ]
  },
  "F-DUR-09": {
    "verdict": "HOLDS (i NEPOZNATO razrešeno u POTVRĐENO)",
    "why": "loop-executor.ts:212-214 stateKey 'loop:<id>' iz AwarenessLayer.getByStatus; :254 maker je toolless chat(); :311-322 awareness.add('pending', `Loop: <name>`, ...) / updateMetadata; index.ts:2596-2597 bira personal mind za workspace_id null/'*'; :2632-2645 enqueueHeldAction. Pitanje 'da li getByStatus stavke ulaze u recall' — ODGOVOR DA, delimično: AwarenessLayer.toContext() (awareness.ts:142-168) uzima getAll() bez filtera po metadata.status i renderuje sve stavke kategorije 'pending' kao '- Loop: <name>' pod 'Pending Items'; loadRecentContext (context-loader.ts:111-120) to ubacuje u kontekst, a orchestrator.ts:315-316 ga izlaže. Metadata (result/lastTickAt/score) se NE renderuje, samo content linija. Dakle execution state 'zagađuje' recall kontekst jednim redom po Loop-u (uvek, jer expires_at je null), ne punim rezultatom. Ovo POJAČAVA nalaz (brief §8.2).",
    "minimalChangeBreaksTest": "NIJE PROVERENO red-po-red: packages/server/tests/local/loop-executor.test.ts verovatno asertuje awareness state (granica — 283 linije nisu čitane). Premeštanje state-a je W1; 'retrieval exclusion' po prefiksu bi moralo u toContext()/getAll(), što je hive-mind-core substrat (OSS forward-port §7.5) — zabeležiti kao trošak.",
    "evidence": [
      "packages/server/src/local/loop-executor.ts:212-230, :254-262, :295-303, :311-322",
      "packages/server/src/local/index.ts:2596-2597, :2632-2645",
      "packages/hive-mind-core/src/mind/awareness.ts:91-106 (getByStatus), :142-168 (toContext bez filtera)",
      "packages/agent/src/context-loader.ts:111-120, :226-231 ; packages/agent/src/orchestrator.ts:315-316"
    ]
  },
  "F-DUR-10": {
    "verdict": "WEAKENED + NOVI NALAZ AUDITA — ZA PROVERU",
    "why": "Sve strukturne tvrdnje stoje: getDue :367-371; markRun :374-382 samo posle uspeha (cron.ts:276); computeNextRun :203-206 bez tz (cron-parser 4.9.0, expression.js:28 `_tz = options.tz`, nedefinisano => lokalna zona); acquireRunLease :442-447 čist INSERT bez UNIQUE (schema :155-161) => nije fencing; sweepInterruptedRuns cron.ts:366-389 ne dira next_run_at; grep timezone = 0. ALI izvedeni izlazi (1) 'jedan catch-up fire' i (2) 're-fire na svakom tick-u (60 s)' pretpostavljaju da getDue() vidi isti-dan dospelost. PROBE (better-sqlite3 :memory:, ne CronStore): `'2026-09-27T10:00:00.000Z' <= datetime('2026-09-27 10:05:00')` => 0; `<= datetime('2026-09-28 00:00:01')` => 1. computeNextRun upisuje ISO sa 'T' (`interval.next().toISOString()`, probe cron-parser => '2026-09-27T21:44:00.000Z'), a getDue poredi sa `datetime('now')` koji vraća 'YYYY-MM-DD HH:MM:SS' (razmak). BINARY kolacija: 'T'(0x54) > ' '(0x20), pa je next_run_at istog UTC datuma UVEK veći od now => schedule nije dospeo do UTC ponoći sledećeg dana. Posledice ako se potvrdi: (a) svaka sub-dnevna rutina efektivno radi najviše jednom po UTC danu (prvi tick posle ponoći); (b) dnevna rutina '0 9 * * *' kasni do 00:00 UTC narednog dana (~15 h); (c) posle neuspeha (markRun izostaje) re-fire svakog tick-a važi SAMO kad je next_run_at na ranijem UTC datumu; (d) 'jedan catch-up' posle spavanja postaje 'jedan fire po UTC danu'. Nijedan test ne vežba realnu putanju create()->getDue(): cron-ai-task.test.ts:230,280 upisuje `datetime('now','-1 minute')` (sqlite format) direktno, cron-error-handling/hardening mockuju getDue, phase5-cron-parse.test.ts:25 upisuje ručno; core cron-store.test.ts:38-47 proverava samo da je next_run_at u budućnosti. Loop throttle komentar loop-executor.ts:216-222 pokazuje da autor zna za sqlite-space vs ISO problem kod last_run_at, ali ne i kod next_run_at. STATUS: NALAZ AUDITA — ZA PROVERU (SQL probe izvršen, CronStore nije). Preporučeni repro: `store.create({cronExpr:'* * * * *',...})` pa posle >60 s `store.getDue()` => očekivano 1, hipoteza 0; ili raw `UPDATE cron_schedules SET next_run_at = strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 minute')` pa getDue().",
    "minimalChangeBreaksTest": "(b) pomeranje next_run_at u sweepInterruptedRuns: cron-scheduler-hardening.test.ts:227-250 asertuje history red + failCount + notifikaciju, ne next_run_at — ne lomi. (d) UNIQUE/uslovni INSERT: hardening :180 'releases the durable run lease when execution throws' i :227 sweep koriste jedan lease po schedule — ne lome, ali test koji bi uzeo dva lease-a za isti schedule ne postoji. Ispravka formata (ako se potvrdi) bi promenila ponašanje cron-ai-task.test.ts samo ako se getDue počne oslanjati na ISO parsiranje umesto string poređenja.",
    "evidence": [
      "packages/core/src/cron-store.ts:132-135 (schema next_run_at TEXT), :155-161 (leases bez UNIQUE), :203-206, :283, :330, :367-371, :374-382, :442-447",
      "packages/server/src/local/cron.ts:55-58, :219-243, :245-314, :366-389",
      "node_modules/cron-parser/package.json:3 (4.9.0) ; node_modules/cron-parser/lib/expression.js:26-29",
      "packages/server/tests/local/cron-ai-task.test.ts:230, :280, :296 ; packages/server/tests/local/cron-scheduler-hardening.test.ts:47,78,108,132,152 (getDue mock), :180, :227-250 ; packages/core/tests/cron-store.test.ts:38-47",
      "packages/server/src/local/loop-executor.ts:216-222 (poznat sqlite-space vs ISO problem za last_run_at)",
      "PROBE: node better-sqlite3 :memory: => {due_same_day:0, due_next_day:1}; cron-parser next().toISOString() => '2026-09-27T21:44:00.000Z'"
    ]
  },
  "F-DUR-11": {
    "verdict": "HOLDS",
    "why": "toAutomation (automations.ts:128-148) emituje samo `status: row.enabled ? 'active' : 'paused'`; shared Automation tip (types.ts:777) dozvoljava 'active'|'paused'|'running'|'failed', pa su i 'running' i 'failed' grane mrtve na backendu (grep 'running' u automations.ts/routes/cron.ts: 0 kao status; cron.ts:68,184-190 'running' je engine pill boolean, druga stvar). AutomationCenterApp.tsx:175,308,536,669 proverava `a.status === 'running'` — nikad true. Nema 'blocked' izvedenog statusa. phase3b test :177 'failed latest run' se izvodi iz lastLog(), ne iz status polja — potvrđuje da UI failure signal već ide preko history, ne statusa.",
    "minimalChangeBreaksTest": "NE za uklanjanje mrtve 'running' grane (phase3b-automation-center.test.tsx nema asercije na status 'running'; :64,85,93 'running' je engine status). Izvedeni 'blocked' je aditivan.",
    "evidence": [
      "packages/server/src/local/routes/automations.ts:128-148",
      "packages/shared/src/types.ts:777",
      "apps/web/src/components/os/apps/AutomationCenterApp.tsx:29-33, :175, :308, :536, :669",
      "apps/web/src/test/phase3b-automation-center.test.tsx:64, :85, :93, :177",
      "packages/server/src/local/cron.ts:62-75, :183-190 (engine 'running' boolean)"
    ]
  },
  "F-DUR-12": {
    "verdict": "WEAKENED (samo citat)",
    "why": "Suština stoji: subagent-orchestrator.ts:93 `signal?: AbortSignal` iz owning job-a, :119-124 in-memory workers Map; chat-collaboration.ts registruje decu sa cancel i linkParentCancellation; fleet-run-executor.ts:480-515 kreira room+worker pa `lifecycle.trackExecution(run.id, execution, () => controller.abort())` — nastavlja bez klijentskog socket-a, ali grep 'interrupt|restart|resume|reconcile' u fleet-run-executor.ts daje samo terminalne filtere :821,866 => nema restart oporavka (registry ga označi interrupted, F-DUR-01). lifecycle.isShuttingDown() guard-ovi (:379-478) samo odbijaju NOVE spawn-ove pri shutdown-u, ne čuvaju tekuće. Netačan citat: test je `packages/server/tests/tools-routes-launch.test.ts:1148-1170` (NE `tests/local/`); sadržaj potvrđen — external-tool run ostaje 'running' preko buildLocalServer restarta dok je pid živ (:1152) i može se cancel-ovati (:1166-1167).",
    "minimalChangeBreaksTest": "NE (plan-only).",
    "evidence": [
      "packages/agent/src/subagent-orchestrator.ts:88-126",
      "packages/server/src/local/fleet-run-executor.ts:341-342, :379-478 (isShuttingDown guards), :480-515, :821, :866",
      "packages/server/tests/tools-routes-launch.test.ts:1148-1170 (ispravna putanja)"
    ]
  },
  "F-DUR-13": {
    "verdict": "HOLDS",
    "why": "Grep 'createHarnessRun|advancePhase|activeHarnessRuns' van workflow-harness.ts/workflow-tools.ts: jedini pogodak packages/agent/src/index.ts:315 (re-export). Grep 'DurableRun|ProofReceipt|ToolCallJournal|runs.db' u packages+apps: jedini pogodak routes/agents.ts:106,153,490 `latestDurableRun()` — lokalna helper funkcija koja čita AgentRunRegistry, ne durable run sistem. activeHarnessRuns je modul-level Map (workflow-tools.ts:447) => restart briše stanje. Odsustvo potvrđeno.",
    "minimalChangeBreaksTest": "NE (nema promene).",
    "evidence": [
      "packages/agent/src/workflow-tools.ts:362-380, :440-457",
      "packages/agent/src/index.ts:315",
      "packages/server/src/local/routes/agents.ts:106, :153, :490 (latestDurableRun = helper, ne sistem)"
    ]
  },
  "F-DUR-14": {
    "verdict": "WEAKENED (ledger drift je manji nego što nalaz kaže)",
    "why": "Kod: chat-approval-hook.ts:290-323 potvrđeno — grana `if (proposeHeldTurn)` bez allowDerivedPersistence guarda, komentar :291-300 objašnjava TD-CHAT-46 fix. Ledger: docs/TECH-DEBT.md:65 red TD-CHAT-46 ZADRŽAVA originalni opis ('Pinned, not fixed', `routes/chat.ts:3611/3618`) ALI status ćelija istog reda EKSPLICITNO kaže '**CLOSED 2026-09-17** (`9f511ea6`; formal close moved to the front of the cell 2026-09-23)' i opisuje upravo ovo ponašanje ('proposal reaches ApprovalsApp as approval_required { held: true }'). Konvencija ledgera je da opis ostaje istorijski a status nosi istinu (isti obrazac TD-CHAT-41..45). Ostaje samo: line-anchor `chat.ts:3611/3618` nije označen sa 'numbers at <sha>' kao susedni redovi (chat.ts sada ima 1981 linija) i opis ne nosi napomenu da je grana sada dostižna. Dakle 'ledger drift' = kozmetički anchor, ne pogrešan status. Posledica za F-DUR-10 tačku 3 (dva held reda za isti intent posle crash-a) i dalje stoji jer kod jeste aktivan.",
    "minimalChangeBreaksTest": "NE (dokument).",
    "evidence": [
      "packages/server/src/local/routes/chat-approval-hook.ts:286-326",
      "packages/server/src/local/routes/chat.ts:578, :623, :682 (proposeHeld/isAutomatedTurn i dalje postoje; fajl = 1981 linija)",
      "docs/TECH-DEBT.md:65 (status ćelija: CLOSED 2026-09-17 9f511ea6)"
    ]
  }
}
```

## Sažetak

| ID | Verdikt | Ključna korekcija |
|---|---|---|
| F-DUR-01 | HOLDS | Dodati kontekst: harvest M-08 resume pattern (BORROW kandidat); fleet pause = abort, ne suspend |
| F-DUR-02 | WEAKENED | `resetRequired` JESTE testiran (false grana, registry.test.ts:105); nedostaju overflow + corrupt-load testovi |
| F-DUR-03 | HOLDS | Fleet pause ruta ne pobija: pauzira sesiju abortom, ne CollaborationRun |
| F-DUR-05 | HOLDS | job-service.ts:38 idempotencija je team-mode, ne provider-key |
| F-DUR-06 | WEAKENED | Stop copy postoji ('Stop generating'); gap je da ne kaže da se child runovi/posao gube |
| F-DUR-08 | HOLDS | Bridge test koristi toContain → aditivni runId ne lomi |
| F-DUR-09 | HOLDS+ | NEPOZNATO razrešeno: 'Loop: <name>' red ulazi u recall preko toContext()/loadRecentContext |
| F-DUR-10 | WEAKENED + NOVI NALAZ ZA PROVERU | getDue poredi ISO 'T' string sa `datetime('now')` (razmak) → isti-dan dospelost nikad; izvedeni izlazi (1)/(2) zavise od UTC datuma |
| F-DUR-11 | HOLDS | 'failed' status grana takođe mrtva (types.ts:777) |
| F-DUR-12 | WEAKENED (citat) | Test je `tests/tools-routes-launch.test.ts`, ne `tests/local/` |
| F-DUR-13 | HOLDS | `latestDurableRun` u agents.ts je helper, ne sistem |
| F-DUR-14 | WEAKENED | Ledger status ćelija već kaže CLOSED 9f511ea6; drift je samo neanotiran line-anchor |

**Granice ove revizije:** nijedan vitest nije izvršen (repo read-only); loop-executor.test.ts nije čitan red-po-red; SQL probe za F-DUR-10 rađen nad in-memory better-sqlite3, ne nad `CronStore` instancom — zato NALAZ AUDITA — ZA PROVERU, ne POTVRĐENO.
