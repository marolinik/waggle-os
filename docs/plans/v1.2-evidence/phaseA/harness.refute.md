# Refute pass — grupa "harness" @ 2af0904df01ca3d374cc78ba95b60dc579dd6a7a

**Recenzent:** skeptični pregled (Fable 5.1), 2026-09-27
**Revizija:** `git rev-parse HEAD` = `2af0904df01ca3d374cc78ba95b60dc579dd6a7a`; `git status --porcelain` → samo dva untracked `.docx` u `docs/` → working tree == HEAD za sve citirane `.ts` fajlove. Repo READ-ONLY; nijedan test nije pokretan, nijedan fajl u repou nije menjan.
**Metod:** za svaki nalaz sa statusom POTVRĐENO NA REVIZIJI pročitan citirani kod + pozivaoci + testovi; tražen guard drugde, test koji zaključava suprotno, ili production default koji menja ponašanje. Za `minimalChange` grep-ovani testovi koji bi pukli. `git grep` (tracked fajlovi) umesto repo-wide grep-a jer `.scratch/` sadrži tri stare kopije repoa koje bi zagadile rezultate.

**Zbirni ishod:** 7/7 POTVRĐENIH nalaza HOLDS. Nijedan REFUTED. Dva WEAKENED samo na nivou `minimalChange`/citiranih putanja (F-HARN-03 putanje fajlova; F-HARN-06 migracija zbog SQL CHECK). Dva DELIMIČNO nalaza (F-HARN-07, F-HARN-09) van opsega refute-a, spot-check konzistentan.

---

## F-HARN-01 — verify faza se preskače po defaultu

```
verdict: HOLDS
```

**Zašto (POTVRĐENO NA REVIZIJI):**
- `packages/agent/src/workflow-harness.ts:313` `if (nextPhase.id.includes('verify') && shouldSkipVerify())` → `:314` status `'skipped'`; `:317-319` ako je verify poslednja faza → `completed = true` bez ikakvog događaja za preskočenu fazu (emituje se samo `harness:phase:start` za fazu POSLE skipa, `:322-326`).
- `packages/agent/src/workflow-harness.ts:474-482` `shouldSkipVerify()`: `return env !== 'true' && env !== '1'` → unset ili `'0'` = skip. `catch { return true; }` (`:480`) — mrtav kod jer `process.env` ne baca, ali smer je fail-open; slažem se sa nalazom.
- `packages/agent/src/workflow-harness.ts:424` `getRunSummary` piše `**Status:** Completed` kad `state.completed`, bez oznake da je verify preskočen.
- **Production default provera:** `git grep -n WAGGLE_AUTO_VERIFY` po svim tracked fajlovima → samo `packages/agent/src/feature-flags.ts:26`, `packages/agent/src/workflow-harness.ts:477`, komentar u `packages/agent/tests/workflow-tools-harness.test.ts:137`, i `waggle-cowork/waggle-prompt-improvement-plan.md:466`. Ciljani grep u `app/`, `sidecar/`, `scripts/`, `.env.example`, `package.json`, `apps/web`, docker/render fajlovima → 0 pogodaka. Nijedan `vitest.setup.ts`/config ga ne postavlja. **Zaključak: production default = skip. Nema guard-a drugde.**
- `FEATURE_FLAGS.VERIFIER_AUTO_RUN` (`feature-flags.ts:26`) nema nijednog konzumenta u `packages/` ni `apps/` (`git grep VERIFIER_AUTO_RUN` → samo definicija) → tvrdnja "harness je ne koristi" tačna; flag je mrtav.
- Commit `93ff7813` (2026-04-15) poruka doslovno: *"Behavior kept: harness event emissions, gate validation, retry logic, auto-skip of 'verify' phases when WAGGLE_AUTO_VERIFY is unset."* → preskakanje je svesno zadržano, ne slučajno.

**Da li `minimalChange` lomi postojeći test (POTVRĐENO NA REVIZIJI):**
- **DA — `packages/agent/tests/workflow-tools-harness.test.ts:135-179`** (`'captures real duration_ms and tokens when provided in phase_output'`): komentar `:136-138` eksplicitno kaže da se oslanja na auto-skip; test posle Synthesize faze očekuje `finalOutput` da sadrži `'Tokens:'`, `'300 input'`, `'170 output'` (`:176-178`), što daje samo `getRunSummary` po završetku. Sa invertovanim default-om treći poziv bi vratio instrukciju Verify faze → test pada. Nalaz ovo već navodi; potvrđujem.
- **NE** — `workflow-tools-harness.test.ts:182-230` (`'advancing past the final phase deletes the tracked run'`): prolazi u oba režima (treći poziv sa `VERDICT: PASS` nema assert; četvrti očekuje `Unknown run_id`, što važi u oba slučaja).
- **NE** — `packages/agent/tests/harness-trace-bridge.test.ts:290-331`: koristi custom harness `test-hn` sa fazom `id: 'only'` → `includes('verify')` false → neosetljiv na promenu.
- Nijedan drugi test ne pokreće `research-verify`/`code-review-fix` verify fazu (`git grep` po `packages/*/tests`).

**Dodatna napomena (NALAZ AUDITA — ZA PROVERU):** pošto je verify u `research-verify` poslednja faza, u production default-u ceo run se završava sa `completed=true` odmah po Synthesize gate-u — nalaz F-HARN-02 (VERDICT gate) je u production-u dostupan tek kad se F-HARN-01 popravi ili kad je `WAGGLE_AUTO_VERIFY=1`.

---

## F-HARN-02 — VERDICT gate prihvata FAIL i CONDITIONAL

```
verdict: HOLDS
```

**Zašto (POTVRĐENO NA REVIZIJI):**
- `packages/agent/src/builtin-harnesses.ts:128` `hasPattern(output, /VERDICT:\s*(PASS|CONDITIONAL|FAIL)/i, 'VERDICT: assessment')`; `hasPattern` `:43-51` vraća `passed: pattern.test(content)` — capture group se ne čita. Instrukcija `:125` traži VERDICT liniju, ne definiše ishod.
- `code-review-fix` verify faza (`:177-184`) nema VERDICT gate uopšte, pa politika CONDITIONAL/FAIL ne postoji ni tamo.
- **Guard drugde?** `git grep CONDITIONAL -- packages/agent/src packages/server/src` → samo `:125` i `:128` (ostalo `UNCONDITIONAL` u komentarima). `advancePhase` (`workflow-harness.ts:213+`) čita samo `gateResults[].passed`. Nema.
- **Test koji zaključava suprotno?** Ne. `packages/agent/tests/verification-gate.test.ts:74` sadrži `'**VERDICT: FAIL** - Production readiness is not established.'` ali to je fixture za D3 `SUCCESS_ASSERTION` klasifikator, ne za harness gate.

**Da li `minimalChange` lomi test:** NE po grep-u. Jedini test koji hrani verify fazu je `workflow-tools-harness.test.ts:226` sa `'VERDICT: PASS'` (i pod trenutnim default-om ta faza se ni ne dostiže). `harness-trace-bridge.test.ts:54` koristi `harnessId: 'code-review-fix'` samo kao string u event fixture-u.

**Nijansa (DELIMIČNO/NEPOVEZANO):** u production default-u gate je nedostižan (vidi F-HARN-01) — ozbiljnost zavisi od redosleda popravki, validnost nalaza ne.

---

## F-HARN-03 — bash gate prolazi na bilo koji bash poziv; exit code se gubi

```
verdict: HOLDS (WEAKENED samo za citirane putanje fajlova)
```

**Korekcija putanja (POTVRĐENO NA REVIZIJI):** nalaz citira `system-tools.ts`, `system-tools-helpers.ts` i `tool-executor.ts` kao `packages/server/src/local/...`. **Stvarne lokacije na HEAD-u** (`git ls-files`): `packages/agent/src/system-tools.ts`, `packages/agent/src/system-tools-helpers.ts`, `packages/agent/src/tool-executor.ts`. `chat-bounded-read-tools.ts` je u `packages/server/src/local/routes/`. Brojevi linija u nalazu su TAČNI na tim putanjama — samo direktorijum pogrešan. Writer treba da ispravi pre citiranja.

**Zašto HOLDS:**
- `packages/agent/src/builtin-harnesses.ts:181` `hasToolCalls(output, ['bash','Bash','run_command'], 1)`; `:13-24` substring match na `tc.tool.toLowerCase().includes(name)`, broji imena, ne čita `args.command` ni `result`.
- `packages/agent/src/workflow-harness.ts:76` `toolCalls: Array<{ tool; args; result: string }>` — nema `ok`/`exitCode`.
- Exit code se opaža: `packages/agent/src/system-tools-helpers.ts:732-735` (`code !== 0` → `finish(errorCode, 'Process exited with code N')`), tip `TimedProcessResult.errorCode/errorMessage` `:208-215`.
- Exit code se odbacuje: `packages/agent/src/system-tools.ts:681-691` — na `result.errorMessage` vraća `truncateOutput(stderr + stdout)`; `:691` `return output || \`Error: ${result.errorMessage}\`` → `Error:` prefiks (i time exit code) postoji **samo kad je izlaz prazan**. Test runner koji pada uvek nešto ispiše → neuspeh nevidljiv nizvodno.
- Nizvodno: `packages/agent/src/tool-executor.ts:285-287` `executionSucceeded = trimmedResult.length > 0 && !/^(?:error|failed|failure|denied|blocked)\b/i.test(...)`; `:298` `countedAsUsed = true` bezuslovno. Server `packages/server/src/local/routes/chat-agent-run.ts:214-225` `isError = isReportedToolFailure(result)`; `chat-bounded-read-tools.ts:13-34` matchuje samo `^(error|failed|denied|blocked)`, `[BLOCKED]`, `Tool "x" not found`, ili JSON `{ok:false|success:false|error}`. **Nema guard-a koji bi video nenulti exit sa nepraznim izlazom.**
- Background putanja `packages/agent/src/system-tools.ts:1261-1262` `parts.push(\`Exit code: ${task.exitCode}\`)` — asimetrija potvrđena.
- Bash tool ime je tačno `'bash'` (`system-tools.ts:598`), tako da `hasToolCalls` substring match hvata i `my_bash_like_tool` (repro F-HARN-03c).

**Da li `minimalChange` lomi test:**
- (a) `Exit code: N` u foreground izlazu: `packages/agent/tests/system-tools.test.ts:365-370` `'returns stderr on failure'` očekuje samo `toContain('err')` → prefiks ga NE lomi. `packages/agent/tests/background-bash.test.ts:129` `toContain('Exit code: 0')` je background putanja → netaknuta. Nema testa koji zaključava tačan format foreground izlaza na nenulti exit (`git grep -i "exit 1|non-zero|exited with"` po `system-tools*.test.ts`, `tool-executor*.test.ts` → 0).
- (b) `tool-executor` ne vidi exit code (samo string) — promena zahteva marker/strukturu iz (a); `tool-executor-critical-floor.test.ts:42-51` koristi fake `bash` koji vraća `'BASH_RAN'` → netaknut.
- (d) gate na test/typecheck obrazac: nijedan test ne hrani `code-review-fix` verify fazu bash pozivima → bezbedno.

---

## F-HARN-04 — `run_harness` računa se kao verifikacioni alat

```
verdict: HOLDS
```

**Zašto (POTVRĐENO NA REVIZIJI):**
- `packages/agent/src/verification-gate.ts:33` `'run_harness'` u `VERIFICATION_TOOL_EXACT` (`:25-39`); `assertsUnverifiedCompletion` `:220-239`, linija `:227` `if (toolsUsed.some(isVerificationToolName)) return false;`.
- `toolsUsed` su gola imena: `packages/agent/src/agent-loop.ts:1826` `if (r.countedAsUsed) toolsUsed.push(r.toolName)`; `tool-executor.ts:298` `countedAsUsed = true` i kad `executionSucceeded === false`.
- **Poreklo (tražena namera):** `git log -S"'run_harness',"` → `9fce1d2f` (2026-07-20, *"fix(agent): align verification gates with exposed tools"*). Diff pokazuje da je prethodni regex `/test|build|\brun\b|run_|verif|.../i` VEĆ hvatao `run_harness` preko `run_`, pa je pri prelasku na eksplicitni Set ime samo preneseno. Commit body je prazan — **nema dokumentovane odluke** da je `run_harness` verifikacija. Nije founder odluka D-01..D-18 (proverena lista u BRIEF §3 ne pominje ovo).
- **Test koji zaključava suprotno?** Ne. `packages/agent/tests/verification-gate-loop.test.ts:104-114` tabela `isVerificationToolName` sadrži `run_tests`, `bash`, `lsp_diagnostics`, `inspect_file`, `execute_action`, `create_plan` — bez `run_harness`. `git grep run_harness -- packages/agent/tests` → 0. Pogoci u `packages/server/tests/local/chat-helpers.test.ts:1526-1579` i `chat-collaboration.test.ts:31` se tiču tool-policy skupova, ne gate-a.

**Da li `minimalChange` lomi test:** NE (nijedan test ne koristi `run_harness` u `toolsUsed`). Napomena: posle uklanjanja, D3 bi mogao da se okine na turnu koji je pozvao samo `run_harness` i tvrdi "tests pass" — to je željeno ponašanje po DIR-07.

---

## F-HARN-05 — budget stop isključuje D3 verifikaciju

```
verdict: HOLDS (jedna korekcija putanje)
```

**Korekcija:** nalaz kaže "budgetStopResponse :895-920" pod `loop-gates.ts`; `budgetStopResponse` je u **`packages/agent/src/agent-loop.ts:895-920`** (`git grep budgetStopResponse` → samo agent-loop.ts `:895`, `:1039`, `:1542`). `loop-gates.ts:895-935` je D3 blok, što nalaz takođe ispravno citira.

**Zašto HOLDS (POTVRĐENO NA REVIZIJI):**
- `packages/agent/src/agent-loop.ts:1507-1550`: grana `maxTokenBudget` iscrpljen; `:1523-1534` `maybeFireCompletionGate({..., enableVerification: false, enableSkillDistillation: false, ...})`.
- `packages/agent/src/loop-gates.ts:697` default `enableVerification = true`; `:902-935` D3: `:907-920` disclosure putanja (bez alata → `contentSuffix += VERIFICATION_NO_TOOL_DISCLOSURE`, bez novog turna) — **i ona je isključena** flagom jer je `enableVerification &&` prvi uslov `:903`.
- `agent-loop.ts:899-904` `budgetStopResponse` bira `preservedContent ?? usableAnswer ?? 'Token budget exhausted...'` + `appendFetchedSourceFooter` — nema `partial/unverified` oznake kad postoji usableAnswer.
- **Guard drugde?** Integrity gate (`rejectIncompleteReason`, `:1535-1540`) radi i na budget stopu, ali on hvata strukturno nepotpun sadržaj, ne neproverene tvrdnje uspeha. Nema.
- **Test koji zaključava suprotno?** `packages/agent/tests/verification-gate-loop.test.ts:1718-1737` `'fails closed when the abandoned scaffold exhausts the hard token budget'` očekuje `INCOMPLETE_COMPLETION` — potvrđuje da integrity gate ostaje, ne zaključava odsustvo D3. `packages/agent/tests/agent-loop-budget.test.ts` ima exact-content asserte na budget stop (`:962`, `:994`, `:1023`, `:1393-1440`) ali nijedan sadržaj ne matchuje `SUCCESS_ASSERTION` (grep `tests pass|verified|it works` → samo `'Verified source: URL'` `:705/:733` u web_fetch citation testovima; obrazac `\bverified\s+(that\s+)?(everything|it|the)\b` ga ne hvata).

**Da li `minimalChange` lomi test:** NE po grep-u — disclose-only sufiks se dodaje samo kad `assertsUnverifiedCompletion` okine, a nijedan budget-stop test ne šalje takav sadržaj. `budgetStop: true` u `AgentResponse` metapodacima je aditivan (`toMatchObject` asserti ga tolerišu). GRANICA ostaje kao u nalazu: puni loop sa realnim provider-om nije izvršen.

---

## F-HARN-06 — bridge mapira završenu fazu na `verified`, tool zapise na `ok:true/durationMs:0`

```
verdict: HOLDS (WEAKENED na nivou minimalChange: nije type-edit, već SQLite migracija)
```

**Zašto HOLDS (POTVRĐENO NA REVIZIJI):**
- `packages/agent/src/harness-trace-bridge.ts:11` dokumentovano mapiranje `complete → 'verified'`; `:91` `this.completeListener = (ev) => this.writeTrace(ev, 'verified')`; `:139-148` `recordToolCall({..., ok: true, durationMs: 0, ...})` bez čitanja `ev.output.durationMs`; `:125` `const ctx = this.resolveContext(ev) ?? {}` → `:127-130` sve `null` bez resolvera.
- Boot: `packages/server/src/local/index.ts:612-616` `new HarnessTraceBridge({ recorder: traceRecorder })` — BEZ `context`. Jedina konstrukcija u produkciji (`git grep "new HarnessTraceBridge"` → samo ova + testovi).
- Nizvodno REALNO: `packages/agent/src/eval-dataset.ts:208` `positiveOutcomes ?? ['success', 'verified']`; `EvalDatasetBuilder` se koristi u `packages/agent/src/evolution-orchestrator.ts:319` → harness faza sa preskočenim verify-jem (F-HARN-01) ili FAIL verdiktom (F-HARN-02) ulazi kao pozitivan eval primer. Potvrđeno.
- Drugo hardkodovano `ok:true`: `packages/agent/src/trace-recorder.ts:281-282` (fallback `recordToolCall`) i `:288` (`completeToolCall(handle, callId, result, true)`); ovo je aktivno u chat turnu jer `agent-loop.ts:488-489` `wireAgentLoopCallbacks` i server `chat-agent-run.ts:320` prosleđuje `traceRecording`.
- `packages/hive-mind-core/src/mind/execution-traces.ts:20` `TraceOutcome = 'success' | 'corrected' | 'abandoned' | 'verified' | 'pending'` — nema `gate_passed`.
- **Test koji zaključava suprotno?** Da, ali zaključava TRENUTNO ponašanje, ne ispravnost: `packages/agent/tests/harness-trace-bridge.test.ts:82-92` (`expect(traces[0].outcome).toBe('verified')`) i `:327`. Nema testa koji pinuje `ok: true`/`durationMs: 0` (grep u test fajlu → `ok` samo kao string sadržaja `:299/:317`).

**Zašto WEAKENED za `minimalChange` (NALAZ AUDITA — ZA PROVERU):**
- `outcome` kolona ima **SQL CHECK constraint** na dva mesta: `packages/hive-mind-core/src/mind/execution-traces.ts:150-151` i `packages/hive-mind-core/src/mind/schema.ts:242-243` `CHECK (outcome IN ('success','corrected','abandoned','verified','pending'))`. SQLite ne dozvoljava `ALTER` CHECK constraint-a → dodavanje `gate_passed` zahteva table-rebuild migraciju (nova tabela, copy, drop, rename) + indeksi `:159-160`/`schema.ts:250-253`. Postojeći `execution_traces` u korisničkim bazama bi odbile INSERT sa novim outcome-om bez migracije. **Nije "minimalna" promena; treba je planirati kao migraciju u G1.**
- Alternativa koja ostaje minimalna: mapirati `complete → 'success'` umesto novog enum-a? NE — `'success'` je takođe u default `positiveOutcomes`, pa ne rešava eval kontaminaciju. Ili: bridge upisuje `'pending'`/tag `gate_passed` u `tags[]` (`:134`) i eval-dataset filtrira po tagu — bez shema promene. **PREDLOG za writera, ne odluka.**
- OSS napomena (POTVRĐENO NA REVIZIJI iz CLAUDE.md §7.5): `execution-traces.ts` je OSS-EXCLUDED → promena nema obavezu porta na mirror; ali `schema.ts:235-253` (deo `mind/schema.ts`) JE deo substrata koji se portuje → drift-check baseline bi trebalo ažurirati. NEPOZNATO da li `oss-drift-check.mjs` baseline trenutno pokriva ovaj blok (nije proveravano).

---

## F-HARN-07 — globalni emitter bez run ID-a (status: DELIMIČNO/NEPOVEZANO — van opsega refute-a)

```
verdict: HOLDS (spot-check, nije pun refute pass)
```

- `packages/agent/src/workflow-harness.ts:132` `export const harnessEvents = new EventEmitter()`; `:135` `createHarnessRun(harness: WorkflowHarness)` jedan parametar; `HarnessRunState` `:110-128` bez `runId`/`workspaceId`/`sessionId`; payload interfejsi `:169-207` samo `harnessId, phaseId, phaseName, ...`.
- `packages/agent/src/workflow-tools.ts:374` `generateHarnessRunId` → `:447` `activeHarnessRuns` (process-global Map); run_id se NE prosleđuje u `createHarnessRun` ni `advancePhase` (`:374`, `:425`).
- `WorkflowToolsConfig` `:39-51` nema session/workspace polja → bridge resolver ne može da mapira.
- Testovi `workflow-tools-harness.test.ts:71-106` dokazuju samo state izolaciju, kako nalaz kaže. Konzistentno.

---

## F-HARN-08 — gates čitaju model-supplied `phase_output.tool_calls`

```
verdict: HOLDS
```

**Zašto (POTVRĐENO NA REVIZIJI):**
- `packages/agent/src/workflow-tools.ts:330-358` schema `phase_output` (model popunjava `tool_calls`, `artifacts`, `duration_ms`, `tokens`); `:412-422` `PhaseOutput` se gradi doslovno: `toolCalls: (phaseOutput.tool_calls as PhaseOutput['toolCalls']) ?? []`.
- `git grep phase_output -- packages/server/src` → 0. `git grep "activeHarnessRuns|harnessEvents" -- packages/server/src` → samo komentar `index.ts:595` i barrel `agent/src/index.ts:316`.
- Server IMA opažene podatke: `packages/server/src/local/routes/chat-agent-run.ts:214-225` `onToolResult` računa `isError` + `toolActivity.recordResult(name, result, isError)` (`TurnToolActivity`, `:36/:113`) — ali ništa od toga ne stiže u `createWorkflowTools` config (`:39-51`).
- **Refutacija pokušana — da li je `run_harness` uopšte dostižan modelu u produkciji?** DA: u `WORKSPACE_COLLABORATION_TOOL_NAMES` (`packages/server/src/local/index.ts:280-288`), keyword-gated u `packages/agent/src/tool-filter.ts:242-246` (regex `agent|delegate|workflow|orchestrate|synthesi[sz]e...`), i uskraćen samo kad `policy.denyAgentLaunch` (`chat-helpers.ts:1173` `broadDenial || agentLaunchDenial`, izvedeno iz teksta korisnika; filter `:1394`). Dakle u običnom chat turnu sa rečju "workflow" alat je vidljiv i self-reported dokaz prolazi.
- **Test koji zaključava suprotno?** Ne — svi harness testovi upravo hrane izmišljene `tool_calls` (`workflow-tools-harness.test.ts:86-91, :147-155`), što je i dokaz nalaza.

**Da li `minimalChange` lomi test:** DA, ako se strict mod uvede kao default — `workflow-tools-harness.test.ts:82-106` i `:135-179` prolaze Gather gate isključivo na self-reported `search_memory`/`recall_memory` pozivima. Prelazni predlog iz nalaza (`selfReported: true` + strict opt-in) to izbegava; potpuna zamena zahteva ažuriranje tih testova ili injektovanje `observedToolCalls` provider-a u `makeConfig()` (`:14-32`).

---

## F-HARN-09 — harness router mapa (status: DELIMIČNO/NEPOVEZANO — van opsega refute-a)

```
verdict: HOLDS (spot-check)
```

- `packages/agent/src/workflow-tools.ts:84-119` `compose_workflow.execute` samo formatira `plan.executionMode` u tekst; ne poziva `run_harness`, ne startuje harness (`:113-117` pominje samo `orchestrate_workflow`).
- `packages/agent/src/workflow-composer.ts:99-104` `selectExecutionMode` vraća `'harnessed'` kad `FEATURE_FLAGS.ADVANCED_WORKFLOWS && matchHarness(task)`; `matchHarness` pozivaoci: samo `workflow-composer.ts:82, :102`. `'harnessed'` konzumenti: samo unutar `workflow-composer.ts`. Nema server-side klasifikacije. Konzistentno sa nalazom.

---

## Cross-cutting napomene za writera

1. **Putanje (POTVRĐENO NA REVIZIJI):** `system-tools.ts`, `system-tools-helpers.ts`, `tool-executor.ts` → `packages/agent/src/`, ne `packages/server/src/local/`. `budgetStopResponse` → `agent-loop.ts:895`, ne `loop-gates.ts`. Brojevi linija su tačni.
2. **Redosled zavisnosti (NALAZ AUDITA — ZA PROVERU):** F-HARN-02 i F-HARN-03 gate popravke su u production-u nevidljive dok F-HARN-01 (skip default) i F-HARN-08 (self-reported dokaz) nisu rešeni — gate koji čita izmišljene podatke ne vredi ni kad je strog.
3. **Jedina prava "WEAKENED" tačka:** F-HARN-06 `gate_passed` = SQLite table-rebuild migracija zbog CHECK constraint-a (`execution-traces.ts:150-151`, `schema.ts:242-243`), ne type-edit. Predlog bez shema promene: tag-based razlikovanje u `tags[]` + eval-dataset filter — PREDLOG, ne odluka.
4. **Ništa nije REFUTED.** Nijedan guard drugde, nijedan production default koji menja ponašanje, nijedan test koji pinuje suprotno (testovi koji postoje pinuju TRENUTNO ponašanje: `workflow-tools-harness.test.ts:135-179`, `harness-trace-bridge.test.ts:82-92,:327`).
