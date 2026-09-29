# Revalidacija audit grupe „harness" — revizija `2af0904df01ca3d374cc78ba95b60dc579dd6a7a`

**Datum:** 2026-09-27 · **Pregledani commit:** `2af0904d` (main; `git status` čist osim dva untracked `.docx` u `docs/`, radno stablo == HEAD) · **Repo tretiran kao READ-ONLY** (samo `git show/log`, čitanje fajlova; repro pokrenut iz planerskog radnog prostora (sada `docs/plans/v1.2-evidence/`) nad već izgrađenim `packages/agent/dist/`, verifikovano da dist odgovara `src` na svakoj citiranoj liniji).

**Opseg:** S1 spot-checks L5–L10, C8 (deo o run identitetu), C12 (samo harness statusi), A4–A6, A11, W0, W1 (harness deo); brief §6, §7, AT-01..03, AT-06.

**Statusna legenda:** POTVRĐENO NA REVIZIJI · DELIMIČNO/NEPOVEZANO · NIJE POTVRĐENO · VEĆ ZATVORENO · NEPOZNATO. „Modul postoji" nigde nije korišćen kao dokaz E2E funkcije.

---

## 0. Sažetak

| ID | S1 tvrdnja | Status | Ključni dokaz |
|---|---|---|---|
| F-HARN-01 | verify preskočen po defaultu i u `catch` (L5) | **POTVRĐENO NA REVIZIJI** | `workflow-harness.ts:313`, `:474-481`; repro 01a–d |
| F-HARN-02 | `VERDICT: FAIL` prolazi regex (L7); CONDITIONAL bez politike | **POTVRĐENO NA REVIZIJI** | `builtin-harnesses.ts:128`; repro 02a–d; `CONDITIONAL` = 2 pojavljivanja u celom `packages/`, oba u tom fajlu |
| F-HARN-03 | bilo koji bash prolazi kao test; exit code ignorisan (L8, AT-02) | **POTVRĐENO NA REVIZIJI** (+ prošireno: exit code se opaža pa odbacuje u `system-tools.ts:691`) | `builtin-harnesses.ts:181`; `system-tools-helpers.ts:732-734` vs `system-tools.ts:682-693`; repro 03a–c, 08a |
| F-HARN-04 | `run_harness` = verification tool (L9) | **POTVRĐENO NA REVIZIJI** | `verification-gate.ts:33`; repro 04a–c |
| F-HARN-05 | budget stop `enableVerification:false` (L10, AT-03) | **POTVRĐENO NA REVIZIJI** | `agent-loop.ts:1531`; `loop-gates.ts:697,902-935`; repro 05a–c (mehanizam) |
| F-HARN-06 | bridge: završena faza → `'verified'`, tool zapis `ok:true/durationMs:0`, kontekst null | **POTVRĐENO NA REVIZIJI** | `harness-trace-bridge.ts:91,139-148`; `local/index.ts:612-616`; `eval-dataset.ts:6-7,208`; repro 06a–d |
| F-HARN-07 | globalni `harnessEvents` bez runId (A11, AT-06) | **DELIMIČNO/NEPOVEZANO** — state izolovan po `run_id` od `93ff7813`, events/traces i dalje ne | `workflow-harness.ts:132,169-207`; `workflow-tools.ts:374,440-457`; repro 07a–b, 08b |
| F-HARN-08 | gates čitaju model-supplied `phase_output.tool_calls`, ne server journal (A5) | **POTVRĐENO NA REVIZIJI** | `workflow-tools.ts:330-358,412-422`; `grep phase_output packages/server/src` = 0 |
| F-HARN-09 | mapa harness routera: `task-shape` / `workflow-composer` / `capability-router` (W3) | **DELIMIČNO/NEPOVEZANO** — klasifikator postoji, ali harness biranje je model-invoked tekst, ne server router | `workflow-composer.ts:99-104`; `workflow-tools.ts:84,86-119`; `chat-turn-preparation.ts:381,1101-1117` |

Nijedan nalaz L5–L10 nije **VEĆ ZATVORENO**: S1 je pisan nad istom revizijom (S1 L18 navodi `main 2af0904d`), a jedini popravni commit nad harness fajlovima (`93ff7813`, 2026-04-15) eksplicitno *zadržava* auto-skip verify faze („Behavior kept: … auto-skip of 'verify' phases when WAGGLE_AUTO_VERIFY is unset") i zatvara samo cross-session state bleed u `run_harness` Map-i (deo A11).

Repro: `docs/plans/v1.2-evidence/phaseA/repro-harness.mjs` — **25/25 tvrdnji važi** (Node v22.23.2, uvoz iz `packages/agent/dist/*.js` izgrađenog 2026-09-27 05:27; `grep` potvrdio da dist sadrži identične linije za `env !== 'true' && env !== '1'`, `/VERDICT:\s*(PASS|CONDITIONAL|FAIL)/i`, `['bash', 'Bash', 'run_command']`, `'run_harness'`, `ok: true / durationMs: 0`, `enableVerification: false`).

---

## 1. Nalazi (format brief §1)

### F-HARN-01 — `shouldSkipVerify()` default + `catch` (S1 L5; brief §7.1; AT-01, AT-03; DIR-03/07)

- **Status:** POTVRĐENO NA REVIZIJI
- **Commit:** `2af0904d`; fajl poslednji put menjan u `93ff7813` (2026-04-15) koji je skip zadržao namerno.
- **Putanja/simbol:** `packages/agent/src/workflow-harness.ts:313` — `if (nextPhase.id.includes('verify') && shouldSkipVerify())`; `:474-482`:
  ```ts
  function shouldSkipVerify(): boolean {
    try {
      const env = process.env.WAGGLE_AUTO_VERIFY;
      return env !== 'true' && env !== '1';
    } catch {
      return true; // Skip by default if flag can't be read
    }
  }
  ```
  Srodno: `feature-flags.ts:26` `VERIFIER_AUTO_RUN: process.env['WAGGLE_AUTO_VERIFY'] === '1'` čita istu promenljivu ali drugom semantikom (`'true'` nije prihvaćeno) i harness je ne koristi.
- **Ulaz:** `research-verify` run; `gather` i `synthesize` prolaze gates; `WAGGLE_AUTO_VERIFY` nije postavljen. Grep nad `app/`, `sidecar/`, `scripts/`, `.env.example`, `package.json`, `docs/production-readiness/` → **nijedna konfiguracija u repou ne postavlja** `WAGGLE_AUTO_VERIFY`, dakle production default = skip.
- **Trenutni izlaz:** `phaseStatuses.get('verify') === 'skipped'`, `completed === true`, `currentPhase === 3`; `getRunSummary` vraća `**Status:** Completed` uz red `| 3 | Verify | SKIP | - | 0 |`. `WAGGLE_AUTO_VERIFY=0` → i dalje skip. `=1` → verify `active`, `completed=false`.
- **Repro / granica provere:** repro 01a–d (REPRO-OK ×4). Nema `harness:phase:*` događaja za skip → bridge ne vidi preskakanje; prethodna `synthesize` faza je već upisana kao `'verified'` trace. `catch` grana je mrtav kod (čitanje `process.env` ne baca), ali smer je fail-open. Postojeći test `packages/agent/tests/workflow-tools-harness.test.ts:135-179` **oslanja se na skip** da bi run završio posle `synthesize` (komentar `:136-138`) → mora se ažurirati uz fix.
- **Očekivano:** u work/strict režimu verify faza nikad nije tiho preskočena; eventualni opt-out je eksplicitan, zabeležen u state-u sa razlogom i nikada prikazan kao „Completed" bez oznake; default fail-closed.
- **Najmanja promena:** invertovati default (`skip` samo kad je `WAGGLE_AUTO_VERIFY === '0'` ili eksplicitna `harness`/run opcija), `catch` → `false`; `getRunSummary` status „Completed (verify skipped)" kad postoji `skipped`; emitovati `harness:phase:skipped` događaj; unificirati sa `FEATURE_FLAGS.VERIFIER_AUTO_RUN`; RED test: run bez env-a mora stići do `verify` faze.
- **AT:** AT-01, AT-03.

### F-HARN-02 — VERDICT regex prihvata FAIL; CONDITIONAL bez politike (S1 L7; brief §7.2; AT-01)

- **Status:** POTVRĐENO NA REVIZIJI
- **Commit:** `2af0904d`; fajl nepromenjen od `72551d6e` (2026-04-14).
- **Putanja/simbol:** `packages/agent/src/builtin-harnesses.ts:128` — `hasPattern(output, /VERDICT:\s*(PASS|CONDITIONAL|FAIL)/i, 'VERDICT: assessment')`; `hasPattern` `:43-51` vraća `passed: pattern.test(content)` bez čitanja vrednosti. Instrukcija `:125` traži PASS/CONDITIONAL/FAIL. `grep -rn CONDITIONAL packages --include=*.ts` → samo `:125` i `:128` (ostala dva pogotka su reč „UNCONDITIONAL" u komentarima). Nema politike za CONDITIONAL nigde.
- **Ulaz:** verify faza sa `content: 'VERDICT: FAIL — the synthesis contradicts both sources.'`; odvojeno `'VERDICT: CONDITIONAL …'`, `'VERDICT: PASS'`, i tekst bez VERDICT-a.
- **Trenutni izlaz:** FAIL → `passed: true` („Output contains VERDICT: assessment"); CONDITIONAL → identično PASS; bez VERDICT-a → `passed: false` (retry putanja radi). Ceo run sa `VERDICT: FAIL` → `completed=true, aborted=false, verify='passed'`.
- **Repro / granica:** repro 02a–d (REPRO-OK ×4).
- **Očekivano:** FAIL → gate ne prolazi → retry, pa abort/blocked; CONDITIONAL → recipe-definisana politika (dopuna / korisnički pregled / završetak sa eksplicitnom oznakom ograničenja), nikad tihi PASS; samo PASS prolazi bezuslovno (brief §7.2).
- **Najmanja promena:** capture group → `passed = verdict === 'PASS'`; `GateResult` dobija `verdict?: 'PASS'|'CONDITIONAL'|'FAIL'`; CONDITIONAL po difoltu `passed:false` sa `reason` koji traži dopunu, uz opcioni per-phase `conditionalPolicy`; verdict prenositi u checkpoint i `HarnessPhaseCompleteEvent` da bridge/trace mogu razlikovati. RED testovi: FAIL → phase fail; CONDITIONAL → ne-PASS ishod.
- **AT:** AT-01.

### F-HARN-03 — bash-as-test gate ignoriše komandu i exit code (S1 L8; A5; AT-02; DIR-07)

- **Status:** POTVRĐENO NA REVIZIJI (prošireno: exit code se opaža u supervizoru pa odbacuje na granici alata)
- **Commit:** `2af0904d`.
- **Putanja/simbol:**
  - `builtin-harnesses.ts:181` — `hasToolCalls(output, ['bash', 'Bash', 'run_command'], 1)`; `hasToolCalls` `:13-24` radi `tc.tool.toLowerCase().includes(name)` (substring), broji samo imena.
  - `workflow-harness.ts:76` — `toolCalls: Array<{ tool; args; result: string }>` — nema `ok`/`exitCode`.
  - Dokaz je model-supplied: `workflow-tools.ts:335-346` (`phase_output.tool_calls` u schema alata), `:415` `toolCalls: (phaseOutput.tool_calls as PhaseOutput['toolCalls']) ?? []`.
  - Exit code na granici alata: `system-tools-helpers.ts:732-734` opaža `code !== 0` → `TimedProcessResult.errorCode/errorMessage` (`:208-215`), ali `system-tools.ts:682-693`:
    ```ts
    if (result.errorMessage) {
      const output = truncateOutput((result.stderr || '') + (result.stdout || ''));
      …
      return output || `Error: ${result.errorMessage}`;
    }
    ```
    → kad neuspešan `npm test` išta ispiše, vraća se **samo izlaz bez `Error:` prefiksa i bez exit koda**. Posledično `tool-executor.ts:285-287` `executionSucceeded = true`, `:298 countedAsUsed = true`; server `isReportedToolFailure` (`chat-bounded-read-tools.ts:13-34`) takođe ne vidi neuspeh. Background putanja (`system-tools.ts:1261-1262`) ispisuje `Exit code: N`, foreground ne.
- **Ulaz:** verify faza `code-review-fix` sa `tool_calls: [{tool:'bash', args:{command:'echo hi'}, result:'hi'}]`; zatim `result:'Exit code: 1\nFAIL 12 tests failed'`; zatim alat `my_bash_like_tool`.
- **Trenutni izlaz:** sva tri `passed: true` („Found 1 matching tool call(s)"). Preko `run_harness` ceo `code-review-fix` završava `**Status:** Completed` isključivo na samo-prijavljenim `tool_calls` (repro 08a).
- **Repro / granica:** repro 03a–c, 08a (REPRO-OK ×4). Nije pokretan stvarni `bash` alat (host-wide egzekucija; repro je read-only).
- **Očekivano (AT-02):** gate čita server-observed journal faze (ime alata, komanda, exit code/ok); nenulti exit ≠ success; `echo` nije test; substring match zamenjen tačnim imenima i test/typecheck obrascem komande.
- **Najmanja promena:** (a) `system-tools.ts:684-691` — uvek uključiti `Exit code: N` (ili strukturisan `{ok:false, exitCode}`) pri nenultom izlazu; (b) `tool-executor.ts` `succeeded=false` pri nenultom exit-u; (c) `PhaseOutput.toolCalls[]` dobija `ok?: boolean; exitCode?: number` popunjeno **server-side** (vidi F-HARN-08); (d) gate: `tc.ok !== false` && `/(npm|pnpm|yarn)\s+(test|run\s+test)|vitest|jest|tsc|pytest|cargo test/`.
- **AT:** AT-02.

### F-HARN-04 — `run_harness` u `VERIFICATION_TOOL_EXACT` (S1 L9; DIR-07)

- **Status:** POTVRĐENO NA REVIZIJI
- **Commit:** `2af0904d`; fajl poslednji put menjan `9a0f1a17` (2026-09-07), stavka prisutna.
- **Putanja/simbol:** `packages/agent/src/verification-gate.ts:33` `'run_harness'` u `VERIFICATION_TOOL_EXACT` (`:25-39`); `assertsUnverifiedCompletion` `:220-239` — `if (toolsUsed.some(isVerificationToolName)) return false;`. `toolsUsed` su samo imena: `agent-loop.ts:1826` `if (r.countedAsUsed) toolsUsed.push(r.toolName)`, a `tool-executor.ts:298` postavlja `countedAsUsed = true` i kad `executionSucceeded === false`.
- **Ulaz:** `assertsUnverifiedCompletion('All tests pass and the build is green.', ['run_harness'])`; isto sa `['read_file']`; isto sa `['bash']`.
- **Trenutni izlaz:** `run_harness` → `false` (gate ne puca); `read_file` → `true`; `bash` → `false` bez obzira na ishod bash-a.
- **Repro / granica:** repro 04a–c (REPRO-OK ×3).
- **Očekivano:** `run_harness` je orkestracija, ne verifikacija; tvrdnju o uspehu utemeljuje samo alat čiji je **opaženi** rezultat uspešna provera.
- **Najmanja promena:** ukloniti `'run_harness'` iz seta + regresioni test u `verification-gate.test.ts`; sledeći korak: gate prima `{name, succeeded}` parove (agent-loop već ima `r.succeeded`) umesto golih imena.
- **AT:** AT-01, AT-02.

### F-HARN-05 — budget stop `enableVerification:false` (S1 L10; DIR-08; AT-03)

- **Status:** POTVRĐENO NA REVIZIJI
- **Commit:** `2af0904d`; `agent-loop.ts` poslednji put menjan `fc25e95f` (2026-09-25), linija prisutna.
- **Putanja/simbol:** `packages/agent/src/agent-loop.ts:1507-1550` (grana `maxTokenBudget` iscrpljen); `:1523-1534` `maybeFireCompletionGate({ …, enableVerification: false, enableSkillDistillation: false })`; `loop-gates.ts:697` default `true`; `:902-935` telo D3: putanja sa direktivom (`:921-933`) zahteva novi model turn, ali **disclosure putanja** (`:907-920`, `VERIFICATION_NO_TOOL_DISCLOSURE`) samo dodaje sufiks bez novog turn-a — i ona je isključena flagom. `budgetStopResponse` `:895-920` ne dodaje nikakvu „unverified/partial" oznaku.
- **Ulaz (mehanizam):** `maybeFireCompletionGate` sa `content:'Done. All tests pass and the build is green.'`, `toolsUsed:[]`, `availableToolNames:['bash']`, `enableVerification:false` vs default; i default sa `availableToolNames:[]`.
- **Trenutni izlaz:** `false` → `{fired:false}` bez sufiksa i bez reject-a (tiho); default → `fired:true`; default bez alata → `contentSuffix` „**Verification scope: EVIDENCE-ONLY**…" (dokaz da postoji put bez dodatnog turn-a).
- **Repro / granica:** repro 05a–c (REPRO-OK ×3) na nivou gate funkcije; **ceo agent loop sa realnim budžetom nije izvršen** (zahteva provider) — granica provere.
- **Očekivano (DIR-08):** budget stop ostavlja jasan partial/unverified ishod i sačuvan potrošeni budžet; nema oznake „potpuno provereno"; korisnik može odobriti dodatni budžet.
- **Najmanja promena:** na `:1523-1534` zadržati D3 u „disclose-only" modu (nova opcija `verificationMode: 'disclose-only'` u `MaybeFireCompletionGateArgs`, ili direktan poziv `assertsUnverifiedCompletion` + append `VERIFICATION_NO_TOOL_DISCLOSURE`) pre `budgetStopResponse`; dodati `budgetStop: true` u `AgentResponse` metapodatke; RED test u `verification-gate-loop.test.ts`.
- **AT:** AT-03.

### F-HARN-06 — `HarnessTraceBridge`: `'verified'`, `ok:true/durationMs:0`, null kontekst (brief §7.1 st. 2; A17; W0 „bridge context")

- **Status:** POTVRĐENO NA REVIZIJI
- **Commit:** `2af0904d`; fajl nepromenjen od `5a84c8c1` (2026-04-14).
- **Putanja/simbol:** `packages/agent/src/harness-trace-bridge.ts:11` (dokumentovano mapiranje), `:91` `this.writeTrace(ev, 'verified')`, `:139-148`:
  ```ts
  this.recorder.recordToolCall(handle, { tool: tc.tool, args: …, result: …, ok: true, durationMs: 0, timestamp: … });
  ```
  `:125` `const ctx = this.resolveContext(ev) ?? {}` → `:127-130` null polja. Boot: `packages/server/src/local/index.ts:612-616` `new HarnessTraceBridge({ recorder: traceRecorder })` **bez `context`**. Downstream: `eval-dataset.ts:6-7` i `:208` `positiveOutcomes ?? ['success', 'verified']` → harness faza (čiji je verify preskočen ili verdict FAIL) postaje pozitivan eval primer. `PhaseOutput.durationMs` se ne prosleđuje. Drugo hardkodovano `ok: true`: `trace-recorder.ts:281` i `:288` (`wireAgentLoopCallbacks` → `completeToolCall(handle, callId, result, true)`), koje koristi chat turn (`agent-loop.ts:489`) → ni per-turn trace nikad ne beleži `ok:false`. Test `harness-trace-bridge.test.ts:82-92` i `:327` **zaključavaju** mapiranje `'verified'`.
- **Ulaz:** `harness:phase:complete` sa `toolCalls:[{tool:'bash', result:'Exit code: 1\nFAIL'}]`, `output.durationMs: 9876`, bridge bez `context`.
- **Trenutni izlaz:** `finalize.outcome === 'verified'`; tool zapis `{ok:true, durationMs:0}`; `9876` nigde u trace-u; `start` payload `{sessionId:null, personaId:null, workspaceId:null, model:null, taskShape:'harness:research-verify'}`.
- **Repro / granica:** repro 06a–d (REPRO-OK ×4) sa fake recorder-om; nije pisano u realnu `execution_traces` tabelu.
- **Očekivano (§7.2/7.3):** završena faza = strukturni `gate_passed`, ne sadržinski `verified`; tool zapisi nose opažene `ok/duration` ili se izostavljaju; kontekst se razrešava iz run → session/workspace; postojeći `verified` harness redovi idu u quarantine/legacy.
- **Najmanja promena:** dodati `'gate_passed'` u `TraceOutcome` (`hive-mind-core/src/mind/execution-traces.ts:20`) i mapirati complete → `'gate_passed'`; `eval-dataset` default pozitivi ostaju `['success','verified']` (ne uključuju `gate_passed`) dok ne postoji ProofReceipt; u bridge-u `ok: tc.ok ?? null` i bez fabrikovanog `durationMs`; `index.ts:612` prosleđuje resolver kad events dobiju `runId` (F-HARN-07); migracija (A2): označiti postojeće `task_shape LIKE 'harness:%' AND outcome='verified'` kao unqualified. Ažurirati test `:82-92,:327`.
- **AT:** AT-01, AT-06.

### F-HARN-07 — globalni `harnessEvents`/`harnessId` bez `runId` (A11; AT-06; DIR-04/09)

- **Status:** DELIMIČNO/NEPOVEZANO — **state** izolacija zatvorena u `93ff7813` (run_id-keyed Map + 8 testova), **events/traces** i dalje nerazlučivi.
- **Commit:** `2af0904d`; `93ff7813` (2026-04-15) je predak HEAD-a.
- **Putanja/simbol:** `workflow-harness.ts:132` `export const harnessEvents = new EventEmitter()` (process singleton); payload tipovi `:169-207` imaju samo `harnessId, phaseId, phaseName, phaseInstruction, output, gateResults` — nema `runId/sessionId/workspaceId`; `createHarnessRun(harness)` `:135` i `advancePhase(state, harness, output)` `:213` ne primaju identitet run-a. `run_harness` generiše `run_id` (`workflow-tools.ts:374`, `generateHarnessRunId` `:453-457`) i drži ga u `activeHarnessRuns` (`:447`, in-memory, process-global, bez persistencije) ali ga **ne prosleđuje** u harness engine. `HarnessTraceContextResolver` (`harness-trace-bridge.ts:54-56`) dobija samo event → ne može mapirati na workspace.
- **Ulaz:** dva `createHarnessRun(document-draft)` + `advancePhase` oba; listener na `harness:phase:complete`.
- **Trenutni izlaz:** 2 događaja, ključevi `harnessId,phaseId,phaseName,phaseInstruction,output,gateResults`; oba `harnessId='document-draft', phaseId='context'` — nerazlučivi; sa default bridge-om oba trace-a `workspaceId:null`.
- **Repro / granica:** repro 07a–b, 08b (REPRO-OK ×3). Nije izvođeno iz dva stvarna workspace HTTP run-a (zahteva server).
- **Očekivano (AT-06):** svaki događaj nosi `runId` (+ `workspaceId/sessionId`); dva istovremena workspace run-a daju odvojene, ispravno scope-ovane trace-ove; run-scoped bus umesto globalnog.
- **Najmanja promena (G1 opseg):** `HarnessRunState.runId`, `createHarnessRun(harness, {runId, workspaceId?, sessionId?})`, `runId` u svim payload-ima; `run_harness` prosleđuje svoj `run_id`; `WorkflowToolsConfig` dobija session/workspace kontekst pa bridge resolver čita `ev.runId` iz male run→context mape. Puni per-run bus sa `seq` (brief §6.4) = W1.
- **AT:** AT-06.

### F-HARN-08 — `run_harness` prima model-supplied dokaz; server journal ne učestvuje (A5; DIR-07)

- **Status:** POTVRĐENO NA REVIZIJI (proširenje L8/L9)
- **Commit:** `2af0904d`; `workflow-tools.ts` poslednji put menjan `fb341aad` (2026-07-30).
- **Putanja/simbol:** `workflow-tools.ts:330-358` (schema `phase_output` sa `tool_calls/artifacts/duration_ms/tokens` koje popunjava model), `:412-422` gradi `PhaseOutput` doslovno iz argumenata; nema ukrštanja sa `toolsUsed` iz agent loop-a ni sa server `TurnToolActivity`. `grep -rn phase_output packages/server/src` → 0. Server **ima** opažene podatke: `chat-agent-run.ts:214-225` (`onToolResult` → `isError`, `duration`), `TurnExecutionTrace` (`chat-turn-execution-trace.ts:46`), ali ništa od toga ne stiže do `run_harness`.
- **Ulaz:** `run_harness` za `code-review-fix`, sve četiri faze sa izmišljenim `tool_calls` (`read_file`, `edit_file`, `bash echo ok`) bez ijednog stvarnog poziva alata.
- **Trenutni izlaz:** `**Status:** Completed`.
- **Repro / granica:** repro 08a (REPRO-OK).
- **Očekivano (DIR-07):** model sme da preda samo `content`; gates čitaju server-observed ledger.
- **Najmanja promena:** `WorkflowToolsConfig` dobija `observedToolCalls(sinceMarker)` provider (server ga puni iz `onToolResult`); `run_harness` ignoriše/preglašava `phase_output.tool_calls`; u prelaznom periodu označiti `PhaseOutput.toolCalls` kao `selfReported: true` i u strict modu gate odbija self-reported dokaz.
- **AT:** AT-01, AT-02.

### F-HARN-09 — mapa harness routera: `task-shape.ts` / `workflow-composer.ts` / `capability-router.ts` (W3; brief §6.1)

- **Status:** DELIMIČNO/NEPOVEZANO — klasifikator i composer postoje i imaju testove, ali **harness izbor nije server-side router**; to je model-invoked tekst.
- **Commit:** `2af0904d`.
- **Mapa (pozivaoci verifikovani grep-om):**
  - `detectTaskShape` (`task-shape.ts:145`, čist heuristički, bez LLM-a; tipovi `research|compare|draft|review|decide|plan-execute|mixed`, `complexity`) — chat putanja: `chat-turn-preparation.ts:381` (ulaz za prompt assembler i `selectAgentRunBudget` `:1119-1123`), `chat.ts:746` (samo `complexity === 'simple'` provera); ostali: `prompt-assembler.ts:375`, `subagent-orchestrator.ts:336`, `subagent-tools.ts:335`, `fleet-run-executor.ts:639`, `routes/fleet.ts:352`, `improvement-wiring.ts:175`, `workflow-tools.ts:76`. **Ne bira harness/recipe.**
  - `composeWorkflow` (`workflow-composer.ts:70`) — jedini pozivalac `workflow-tools.ts:84` u alatu `compose_workflow`. `selectExecutionMode` `:99-104` vraća `'harnessed'` kad `FEATURE_FLAGS.ADVANCED_WORKFLOWS` (default **ON**, `feature-flags.ts:14`) i `matchHarness(task)` (regex triggeri `builtin-harnesses.ts:97-100,140-143,193-196`). Ali `compose_workflow` samo **ispisuje** mode (`:86-119`); ne startuje harness i ne pominje `run_harness` (pominje samo `orchestrate_workflow` za template `:113-117`). Dakle „router" = model čita tekst → možda pozove `run_harness`.
  - `CapabilityRouter.resolve` (`capability-router.ts:58`) — konstruisan u `chat-turn-preparation.ts:1101-1117` (uslovno) i `worker/src/handlers/waggle-handler.ts:26`; jedini konzument `tool-executor.ts:299-309` za **nepoznato ime alata** (predlozi + `acquire_capability` hint). Ne učestvuje u izboru recipe-a; redosled native→connector→skill→plugin→mcp→subagent je confidence sort (`:170`), ne permission filter (brief §9.1 traži permissions prvo).
  - Izloženost `run_harness`: `tool-filter.ts:242-246` (samo kad poruka sadrži agent/workflow/orchestrate ključne reči), `chat-collaboration.ts:26-28` `COLLABORATION_TOOL_NAMES`, `chat-helpers.ts:1076/1086/1094` (mutation / code-exec / agent-launch skupovi), `workspace-turn-coordinator.ts:52` (checkout-touching set).
  - Advisory, neizvršena polja: `HarnessPhase.allowedTools/requiresApproval/timeoutMs` (`workflow-harness.ts:47-68`, dokumentovano u `93ff7813`).
- **Očekivano (§6.1, DIR-03):** server razdvaja conversation/work, bira recipe/version i režim; klasifikacija vidljiva i popravljiva.
- **Najmanja promena za G1:** nijedna (evidentirati kao asset i granicu); dizajn routera = W3, posao writera.
- **AT:** AT-06 (identitet run-a), AT-21 (indirektno).

---

## 2. Šta postoji i radi / postoji ali nije povezano (existingAssetsToPreserve)

| # | Šta | Putanja | Pozivaoci (grep) |
|---|---|---|---|
| 1 | `advancePhase` state machine: gates → checkpoint → retry (`maxRetries`) → abort sa `abortReason`; immutabilni state | `workflow-harness.ts:213-374` | `workflow-tools.ts:424`; test `harness-trace-bridge.test.ts:323` |
| 2 | Deterministički gate helperi (bez LLM-a): `hasToolCalls`, `hasMinSections`, `hasPattern`, `hasMinLength`, `hasSpecificImprovement` | `builtin-harnesses.ts:13-89` | 3 harness definicije `:94-238` |
| 3 | Tri ugrađena harnessa + `matchHarness`/`getHarnessById` | `builtin-harnesses.ts:94-259` | `workflow-composer.ts:19,82,102`; `workflow-tools.ts:10,307,366` |
| 4 | `run_harness` run_id scoping (state ne bleed-uje između sesija) | `workflow-tools.ts:371-390,440-465` | testovi `workflow-tools-harness.test.ts` (8) |
| 5 | D3 `assertsUnverifiedCompletion` sa planning/attributed/negated isključenjima + disclosure putanja bez novog turn-a | `verification-gate.ts:220-239`; `loop-gates.ts:907-920` | `loop-gates.ts:905`; `agent-loop.ts:1523-1534,1649-1662`; testovi `verification-gate.test.ts`, `verification-gate-loop.test.ts` |
| 6 | `HarnessTraceBridge` sa **postojećim** per-event `context` resolverom i scoped emitter-om | `harness-trace-bridge.ts:54-56,80-86` | `local/index.ts:612` (bez resolvera); testovi `:197-237` dokazuju da resolver radi |
| 7 | Server-observed ledger primitive: `TraceRecorder.completeToolCall` (realan `durationMs`, `ok` param), `TurnExecutionTrace`, `TurnToolActivity.recordResult`, `isReportedToolFailure` | `trace-recorder.ts:142-166`; `chat-turn-execution-trace.ts:46`; `chat-agent-run.ts:214-225`; `chat-bounded-read-tools.ts:13-34` | `agent-loop.ts:489`; `chat.ts:1653`; `ok` hardkodovan `true` u `trace-recorder.ts:281,288` |
| 8 | Supervizor procesa opaža exit code | `system-tools-helpers.ts:732-734` → `TimedProcessResult.errorCode` `:208-215` | `system-tools.ts:670-693` (odbacuje ga na `:691`) |
| 9 | `detectTaskShape` + `composeWorkflow`/`selectExecutionMode` + `FEATURE_FLAGS.ADVANCED_WORKFLOWS` | `task-shape.ts:145`; `workflow-composer.ts:70,99-139`; `feature-flags.ts:14` | vidi F-HARN-09; testovi `task-shape.test.ts`, `workflow-composer.test.ts` |
| 10 | `CapabilityRouter` (skills/plugins/mcp/connectors/subagent predlozi) | `capability-router.ts:51-186` | `chat-turn-preparation.ts:1101-1117`; `tool-executor.ts:299-309`; test `capability-router.test.ts` |
| 11 | Advisory polja `allowedTools/requiresApproval/timeoutMs` — deklarisana, neizvršena; čuvati semantiku za W1 executor | `workflow-harness.ts:47-68` | nema enforce pozivalaca (dokumentovano `93ff7813`) |
| 12 | `EvalDatasetBuilder.positiveOutcomes` je konfigurabilan | `eval-dataset.ts:66,208` | omogućava isključenje harness `verified` redova bez promene šeme |

---

## 3. Napomene i granice

- **Ograničenja provere:** repro je jedinična/mehanizamska provera nad `dist/`; nije izvršen realan chat turn sa provider-om ni realan `bash`; nisu pisani realni `execution_traces`. Nije pokretan repo test suite (repo READ-ONLY, nema `npm` komandi).
- **Testovi koji će pocrveneti uz fixove (očekivano, ažurirati):** `workflow-tools-harness.test.ts:135-179` (oslanja se na auto-skip verify), `harness-trace-bridge.test.ts:82-92,327` (zaključava `'verified'`).
- **TECH-DEBT.md:** nijedan red ne pokriva ove nalaze (`grep -i "harness|shouldSkipVerify|WAGGLE_AUTO_VERIFY" docs/TECH-DEBT.md` → samo TD-TEST-1/TD-CHAT-16/TD-CHAT-32 u smislu *test* harnessa).
- **C12 (harness deo):** `PhaseStatus` = `pending|active|validating|passed|failed|skipped` (`workflow-harness.ts:23`); `HarnessRunState` nije persistiran (`activeHarnessRuns` in-memory) → restart gubi run; nema mape na `CollaborationRunStatus`. Tiče se AT-07 (grupa durable), ovde samo evidentirano.
- **C8 (deo):** `run_id` nastaje tek pri prvom `run_harness` pozivu (`workflow-tools.ts:374`), posle klasifikacije i bez veze sa chat `sessionId/workspaceId` — u skladu sa brief §6.2 zahtevom da run postoji pre trajnog konteksta, trenutno ne postoji nikakav trajni run objekat za harness.
- Ništa iz ovog dokumenta nije preporuka arhitekture; „najmanja promena" je granica za RED test + minimalni GREEN, u skladu sa DIR-01.
