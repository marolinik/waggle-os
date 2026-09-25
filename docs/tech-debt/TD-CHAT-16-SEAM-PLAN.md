# TD-CHAT-16 — narrowing the `agentRunner` test seam to the LLM call

Status: plan written and Phase 1 done 2026-09-24 on `chore/td-chat-16-seam` (base `main` = `b455db18`,
PR #166). Founder rulings recorded in §7; phases 2–4 on `chore/td-chat-16-seam-p2` (PR #167); retry clock,
turn-trace and phases 5–6 on `chore/td-chat-16-seam-p3`.
The founder ruled "take it now" on 2026-09-24. The ratified direction: the test seam replaces only
the model call (fetch-spy style, the real `runAgentLoop` against a stubbed OpenAI-compatible
provider), no strategy class. The end state has **zero** `hasCustomRunner` reads.

## 1. The problem, measured at `b455db18`

`POST /api/chat` computes `hasCustomRunner = !!server.agentRunner` (`routes/chat.ts:1716`). An
injected runner replaces the agent loop and also turns off every branch below. That is 55 grep lines
across six modules. The brief listed five modules; `chat-turn-session-runtime.ts` is the sixth.

| Module | Lines | Branch the flag skips (line) | What the branch needs to run in a test |
|---|---|---|---|
| `chat.ts` | 7 | forked hook registry, so no approval hook and no child hooks (1720); the rest pass the flag down (1716 decl, 1728, 1753, 1798, 1856, 1872) | nothing extra |
| `chat-turn-session-runtime.ts` | 5 | named-workspace runtime: mind DB, chat runtime, session tools, activity lease (75); request mind pin and session orchestrator (127); workspace turn scope (147) | a real workspace (`workspaceManager.create` with a `directory`), the tmp `dataDir` minds. `sessionManager` caps live workspace sessions at the tier limit (FREE = 10), so suites with many workspaces close sessions per turn, as the approval pins do |
| `chat-turn-model-routing.ts` | 4 | model-health gate: an injected runner is trusted (97); otherwise the tracked provider health or an HTTP probe (98) | a vault key and `llmProvider = anthropic-proxy/healthy` (`markFakeProviderHealthy`), or the fake answering `/health/*`. **Without it the route streams the canned setup-required reply, which also ends in `done`**, so every port asserts that the fake was called |
| `chat-turn-preparation.ts` | 24 | budget warning (214), mind activation (230), auto-recall (238), GEPA (319), ambiguity prefix (358), template welcome (372), prompt assembler (396), default system prompt (407), runtime-unavailable throw (433), empty tool pool (436), persona tool filter (471), workspace catch-up context (479), availability and MCP retrieval (525), compaction-summary persistence (670), governance tool blocking (752), collaboration tool binding (874), iteration budget and tool selection (917), prompt packaging (`shouldPackageSystemPromptForTurn`, 52/56/1029), capability router (1132); the rest are types and destructuring | recall runs against the local mind. GEPA needs the vault `anthropic` key and then calls `api.anthropic.com` through `@ax-llm/ax`; the fake answers 404 and GEPA fails soft (or mock `optimizer-service`, as 3 characterization files already do). No MCP servers run in tests. Governance needs a team config, which only the governance block sets up |
| `chat-turn-completion.ts` | 12 | **route-side** cost accounting, which runs only *for* an injected runner (181); surfaced-signal commit (202), skill distillation (212), KG entity writes (235), correction detection (272), auto skill capture (291), schedule suffix (341), grounding hedge (356), auto-save (507) | local minds only. These write into state that later tests on a shared server can observe |
| `chat-turn-failure.ts` | 3 | route-side failure accounting, again only for an injected runner (130) | nothing extra |

The retry, model-fallback and credential-rotation chain (`chat-attempt-chain.ts`) is not flag-gated.
The runner is still a substitute for the loop, though, so an injected runner that throws drives the
chain with errors the real loop never raises in that form.

A third seam also exists: `vi.mock('@waggle/agent')` replacing `runAgentLoop` (8 characterization
files). It does not set the flag, so every route branch runs, and it is out of scope here.

## 2. Inventory of injection sites

`server.agentRunner` is also read, with no flag, by three non-chat routes:
`fleet-run-executor.ts:598`, `routes/agent-groups.ts:421` and `routes/fleet.ts:392`. Injections that
serve only those routes are class **X** (out of scope).

The class definitions:

- **A** — the fake only returns canned text, tokens or usage. This is a mechanical port.
- **B** — the assertions rely on a skipped branch staying skipped. This needs judgment.
- **C** — the test inspects `AgentLoopConfig`, drives callbacks by hand, or throws to steer the
  retry chain. It needs a richer fake.

C+B tests are counted as C.

| File | Install sites | A | B | C | X | Notes |
|---|---|---|---|---|---|---|
| `packages/server/tests/chat-api.test.ts` | 44 (+35 restores) | 9 | 2 | 38 | 0 | counted per test (50). Suite default runner `beforeAll` L181 ("Hello "+"world", usage 10/5), helper `runOverlappingTurns` L121, key-routing `beforeAll` L4196. B: L1647 (`contextMetrics` reflect the custom path: `packageMode:'custom'`, prompt chars, tool counts 0), L2614 (`gpt-4o` relies on `modelAvailable=true`). Hardest C: L2681 forged `onToolUse`/`onToolResult` receipt pairs |
| `packages/server/tests/smart-router-chat.test.ts` | 20 | 0 | 1 | 19 | 0 | counted per site. The suite fetch stub answers 503 to every `/chat/completions`. B: L567 (`completionRequests` must be `[]`). C+B: L356, 670, 721, 909 (route-side `addUsage`). Templates already on the real loop: L1177, L1470 |
| `packages/server/tests/local/chat-*.test.ts` (20 files) | 29 | 43 | 8 | 36 | 0 | counted per test declaration (87). 7 of the A tests need a healthy provider added. B: turn-failure L73 (cost), turn-trace L101 (exact stage list), regulated-disclaimer ×5 (hedge and schedule suffix), history-write-failure L90 (persist call order) |
| `packages/server/tests/local-mode.test.ts` | 7 | 1 | 0 | 0 | 6 | **ported in Phase 1** (the A site) |
| `packages/server/tests/workspace-api.test.ts` | 1 | 1 | 0 | 0 | 0 | **ported in Phase 1** |
| `packages/server/tests/backup-restore.test.ts` | 1 | 1 | 0 | 0 | 0 | **ported in Phase 1** |
| `packages/server/tests/local/team-integration.test.ts` | 2 | 0 | 0 | 2 | 0 | `onToolResult('save_memory')` by hand; the suite `vi.stubGlobal('fetch')` must compose with the fake |
| `tests/behaviors/chat-pipeline.test.ts` | 6 | 3 | 0 | 3 | 0 | counted per site. L417 A/B: exact `Hello from Waggle!` could gain a suffix |
| `app/tests/e2e/chat.test.ts` | 4 | 1 | 0 | 3 | 0 | root vitest config runs it; `startService`, not `buildLocalServer` |
| `packages/server/tests/local/fleet-isolation.test.ts` | 12 | 0 | 0 | 0 | 12 | `/api/fleet/spawn` only |
| `packages/server/tests/local/agent-groups.test.ts` | 11 | 0 | 0 | 0 | 11 | `/api/agent-groups/:id/run` only |
| **Total** | **137** | **59** | **11** | **101** | **29** | the units are mixed (per test in chat-api and characterization, per site elsewhere), so read A/B/C as a scale, not an exact count |

The ledger's "38 files / 150 injections" counted lines that mention `agentRunner`, restores included.
Install sites that serve `/api/chat` number **108**, in 28 files.

### What class C needs from the fake

| Need | Covered by the Phase 1 helper |
|---|---|
| record URL, auth header, model, stream flag, tools, messages, tool_choice | yes (`requests`) |
| per-model or per-credential answers (fallback, rotation) | yes (function responder) |
| 401 / 429 / 5xx with a body, ECONNREFUSED | yes (`http_error`, `network_error`) |
| stream cut before `[DONE]`, with usage (INCOMPLETE_COMPLETION) | yes (`truncated_stream`) |
| hold a turn open, hang until abort | yes (async responder, `hang`) |
| scripted tool calls, streamed or JSON | yes (`tool_calls`) |
| exact usage numbers, multi-chunk streams | yes |
| compose with a suite's own egress stub | yes (`otherRequest: 'previous'`) |
| `AgentLoopConfig` fields that never reach the wire: `maxTurns`, `skillDistillationGate`, `modelSpendBudget` identity, `traceRecording`, `modelSpendTraceId`, `governancePolicies`, `maxTokenBudget`, `modelOperationTimeoutMs` | **no — pass-through spy (ruling 2)** |
| failures a provider cannot produce: forged tool-result pairs (chat-api L2681), SQLITE_BUSY (execution-trace L273), a non-matching INCOMPLETE_COMPLETION message (retry-chain L126), a non-Error throw (turn-failure L53), an unclassified error message (chat-route L616) | **no — pass-through spy (ruling 2)** |

## 3. Design

**Seam: `globalThis.fetch`, through one helper, `packages/server/tests/helpers/fake-llm-provider.ts`.**
Before writing it we searched for an existing helper. There was none to extend: five files each
carried a private copy (`openAiSseResponse`, `sseBody`, `toolCallResponse`, `stubProvider`), which
later phases replace with the helper.

- `installFakeLlmProvider({ respond, ollamaModels?, otherRequest? })` answers every path ending in
  `/chat/completions` from a script. The script is one reply, a list consumed in order, or an async
  function. A JSON or SSE encoding is picked from the request's `stream` flag. `/api/tags` and
  `/health/*` are answered, and anything else is answered 404 and recorded in `unexpectedRequests`,
  so a test can prove the turn stayed hermetic. `restore()` puts back the previous fetch.
- `markFakeProviderHealthy(server)` sets the vault key and a healthy built-in proxy, which is how
  production passes the model-health gate. It returns an undo for shared-server suites.

Why the global and not `server.llmFetch`: the route already hands the loop `server.llmFetch`, the
circuit-breaker wrapper (`chat-agent-run.ts:125`), and that wrapper resolves `globalThis.fetch` on
every call. Replacing only `llmFetch` would be narrower, but GEPA (`@ax-llm/ax`), the Ollama
listing and the health probe do not go through it, so they would reach the real network. Stubbing
the global catches all of them and makes each one visible.

**Production end state.** The chat route calls `runAgentLoop` directly, and `hasCustomRunner` is
deleted from all six modules along with every branch it guards. The inverted branches go with it:
route-side cost accounting in completion and failure (production already charges inside the loop,
TD-CHAT-8), `trust injected runners` in model routing, and the custom `'You are a helpful AI
assistant.'` prompt. `shouldPackageSystemPromptForTurn` loses its first parameter, and its pin in
`chat-prompt-packaging.test.ts` changes with it. `server.agentRunner` stays declared only if open
question 1 keeps it for fleet and agent groups; either way the chat route stops reading it.

## 4. Phases (at most 5 files each)

| # | Files | Content |
|---|---|---|
| 1 ✅ | helper, helper test, `local-mode`, `workspace-api`, `backup-restore` | helper + 3 A sites (below) |
| 2 | `chat-route`, `chat-request-resolution`, `chat-viewer-rejection`, `chat-history-load`, `chat-turn-notification` (characterization) | A: rejections become "fake never called". route L510/L616 are C and move to phase 4 if they resist |
| 3 | `chat-post-commit`, `chat-history-write-failure`, `chat-turn-trace`, `chat-reroute`, `chat-regulated-disclaimer` | B-heavy: decide per test whether the new observable is the truth, and write it down here before changing an assertion |
| 4 | `chat-attempt-chain`, `chat-retry-chain`, `chat-attempt-policy`, `chat-turn-usage-ledger`, `chat-turn-failure` | C: scripted 429/401/truncation per credential and per model. Watch the circuit breaker (below) |
| 5 | `chat-keyless-billing`, `chat-agent-run`, `chat-turn-execution-trace`, `chat-teamsync-push`, `chat-sse-backpressure` | C: keyless base URL `127.0.0.1:1`, give-up via repeated failing tools, egress composition |
| 6–9 | `chat-api.test.ts` in four slices: suite default runner + A tests; failure/memory tests; retry, overlap and context-window tests; persona, "default" workspace and key-routing tests | the largest file. Each slice deletes its local `openAi*Response` copies as they fall out of use |
| 10–11 | `smart-router-chat.test.ts` in two slices | the suite stub's 503 answer becomes the fake. The B at L567 needs a ruling |
| 12 | `team-integration`, `tests/behaviors/chat-pipeline`, `app/tests/e2e/chat.test.ts` | the last chat injections |
| 13 | `chat.ts` | set the runner to `runAgentLoop` and the flag to `false` at the source: one behavior switch, then the full server suite |
| 14 | `chat-turn-preparation.ts`, `chat-turn-session-runtime.ts`, `chat-turn-model-routing.ts`, `chat.ts`, `chat-prompt-packaging.test.ts` | delete the dead branches and the input field |
| 15 | `chat-turn-completion.ts`, `chat-turn-failure.ts`, `docs/TESTING.md`, `docs/TECH-DEBT.md`, the two comment references (`held-action-executor.ts:120`, `persona-tool-filter.ts:6`) | delete the remaining branches, rewrite the Seam caveat, close the row |

Phase 13 could come before phase 12 if the remaining injections are converted first. Order within
phases 2–12 is free, so long as no phase mixes a B ruling with a mechanical port.

**Exit criterion for closing TD-CHAT-16:**
- `grep -rn hasCustomRunner packages/server/src` returns 0.
- No test that posts to `/api/chat` assigns `server.agentRunner`. Enforce it with a grep in the
  final phase.
- The full server suite and `npm run typecheck:server-tests` are green.
- TESTING.md names the fake provider as the route seam.
- The fleet/agent-groups decision (ruling 1) is recorded.

## 5. Risks

- **Vacuous passes.** The setup-required reply also streams `token`/`done`. Every port asserts
  `provider.requests.length`.
- **B fallout.** Once the branches run, a test can see new `auto_recall` step/tool events, a
  schedule or grounding suffix on exact content, auto-saved frames and KG entities in minds it
  inspects, and in-loop rather than route-side spend. The rule is that the assertion is not loosened:
  the change is written down here and ruled on.
- **Circuit breaker.** `llmFetch` counts scripted 5xx and network errors per origin, on a
  server-lifetime breaker. Many failure pins on one server can open it, and every later test then
  gets `503 circuit_open`. Use a fresh server per failure block, or check the breaker threshold first.
- **Time.** A real turn took about 1.8 s in Phase 1, where an injected runner took milliseconds.
  Retry backoff is real time (about 2 s per retry), so the retry-heavy files need fake timers or a
  budget.
- **GEPA and the embedder.** These are the only outbound paths seen so far. Assert
  `unexpectedRequests` once per file in phases 2–5 to find any others.
- **Shared servers.** Session caps and auto-saved memory leak between tests on one server. The
  approval pins use one workspace per pin and close sessions (TD-CHAT-32).

## 6. Phase 1 result

- The helper, plus 16 unit tests that drive the real `runAgentLoop` through every reply type.
- `local-mode` "returns SSE stream…": the assertions are unchanged, with one added check that the
  fake was called (the vacuous-pass guard). The test title named the old seam and now names the
  behavior.
- `workspace-api` "rejects session deletion while a real chat turn is active" and `backup-restore`
  "rejects restore before writing while a chat turn is active": the hold-open moved from the runner
  into the provider call, and the assertions are unchanged.
- No production code was touched, and no observable result changed.

## 6a. Phases 2–3 result

**Helper fix before phase 2 (`b0428d10`).** Once `markFakeProviderHealthy` sets the vault key, the
GEPA optimizer calls `api.anthropic.com` directly through `@ax-llm/ax`. Behind chat-route's
governance stub, which answers 503 to every unknown host, the optimizer kept retrying for more than
200 s and each turn hung. The fake now answers that host itself with a 404 and records the call as
unexpected, whatever stub sits behind it, so GEPA fails soft at once. This is the GEPA risk in §5
coming true.

**Phase 2 (`000e44ac`).** Ported chat-route, chat-request-resolution, chat-viewer-rejection,
chat-history-load and chat-turn-notification.
- Runner call counters became provider request counts. The "must not reach the runner" sentinels
  became zero-request assertions.
- chat-route's governance block uses the ruling-2 pass-through spy. Two pins need it:
  - L510 reads `governancePolicies`, which never goes on the wire.
  - L616 needs an unclassified thrown message, which no provider reply produces. It is added to the
    §2 "cannot produce" list under ruling 2.
- No assertion changed.

**Phase 3.** Ported chat-post-commit, chat-history-write-failure, chat-reroute and
chat-regulated-disclaimer.
- All four passed unchanged on the real path. The B risks did not materialise:
  - The disclaimer replies trigger neither the schedule nudge nor the grounding hedge.
  - `persistMessage` call 2 is still the assistant's answer.
  - The reroute message is still the last message the model receives.
  - `listWorkspaces` is not read before commit.
- post-commit's private SSE stub was replaced by the helper.

**Stopped: chat-turn-trace, "emits the same single stage on a turn that succeeds" (L101).** On the
real path, the turn id carries `["chat.turn.start","agent-loop.enter","agent-loop.exit"]`. The pin
asserts exactly `["chat.turn.start"]`, and its own comment says the injected runner is why the
list has one element.
- The route still emits only `chat.turn.start`. The two extra stages come from the loop, and the
  pin's comment already predicted them for "a real agent path".
- Proposed re-pin: filter the stages to `chat.*` and assert `['chat.turn.start']`, which keeps the
  route-level claim. Also pin that the loop stages follow on success and are absent on the
  injection-rejected turn. That absence is the TD-CHAT-43 signal the comment describes.
- This changes an assertion, so the file is left on `agentRunner` until the founder rules. Its
  other two pins are rejections that would port mechanically.

## 6b. Phase 4 result

Ported chat-retry-chain, chat-attempt-chain, chat-attempt-policy, chat-turn-usage-ledger and
chat-turn-failure. Each file records the route's attempts and their configs through the ruling-2
pass-through spy. Every failure a provider can produce now comes from the fake:

| Failure | Scripted reply |
|---|---|
| stream interruption | `truncated_stream` with usage; the loop's own INCOMPLETE_COMPLETION matches the replay predicate |
| rate limit | 429 with `retry-after: 0` on the first key, until the loop's own retries run out |
| invalid key | 401 on every non-fallback model |
| endpoint down | `network_error` |
| a tool ran, then an empty answer | a real `search_memory` call, then `' '` |
| the budget-exhausting interruption | `truncated_stream` whose usage equals the attempt's own `maxTokenBudget` |

**Inputs changed, assertions kept.** Two pins now send a message that asks for the tool they need:

- attempt-chain "reports tools a failed attempt used" asks for `list_skills`.
- attempt-policy "empty answer after a tool ran" asks for a memory search.

On the real path a conversational question transmits no tools, so a scripted call to an unoffered
tool is never counted as used.

attempt-chain "keeps a failed attempt's streamed tokens out" still streams the discarded tokens. The
cut stream is what discards them now: a provider cannot stream and then answer 429.

**Moved to the spy (ruling 2). No provider reply produces these:**

- Plain INCOMPLETE_COMPLETION with a non-matching message (retry-chain). This was already listed in §2.
- A 429 whose error carries `toolsUsed` (attempt-chain).
- An interruption flagged `usageEstimated`: the loop sets that flag only on initial-activity
  timeouts (usage-ledger).
- A zero-usage interruption (usage-ledger). When a cut stream reports 0/0, the loop substitutes an
  estimate; this probe observed 2435/10.
- turn-failure's eight message-mapping rows. They classify the raw thrown value, and a provider
  error always reaches the route wrapped as `LLM error (<status>): <body>`.

**Re-pinned under ruling 3 (production equivalent).**

- turn-failure L73 was "charges an injected runner the usage its failed attempt reported" and is now
  "charges the usage a failed turn's provider responses reported". Two cut streams report 1000/500
  each, and the daily total rises through the loop's own spend accounting.
- turn-failure "forwards a daily-budget refusal code" now runs a real hard cap, on its own server
  with `dailyBudget: 0.000001`. The code and the verbatim forwarding are unchanged. The forwarded
  message is the cap's own `Daily budget exceeded: $0.0000 / $0.00 (hard cap)` instead of the
  synthetic `Daily model budget reached`, and the pin now also asserts that no model call was made.
  **This literal changed and needs review.**

**Real-time backoff.**

- attempt-policy's fallback contrast pin now takes about 22 s, because the loop's own network
  retries wait 2 + 4 + 8 s. The file took 0.3 s before.
- attempt-chain's first pin takes about 15–17 s. Most of that is cold start: the file builds a
  server per test, and the whole file took 13.6 s before.
- A later phase could inject a retry clock. That is production code, so it is not done here.

**Pre-existing flake, not caused by this branch (ledgered as TD-TEST-20).** chat-api "translates a validated OpenAI forced
tool choice for the native Anthropic route" (L1639) expects `fetch` to be called exactly 3 times
and sometimes sees 4. It failed in 1 of 2 isolated runs of the untouched file on this branch, and in
the phase 3 wide run.

## 7. Founder rulings (2026-09-24)

All three recommendations were accepted.

1. **Fleet and agent groups: keep `server.agentRunner` there.** The 29 X injections stay out of
   TD-CHAT-16. The final phase adds a guard: no test that posts to `/api/chat` may set it.
2. **Pins the HTTP boundary cannot express: a pass-through spy is allowed, for those pins only.**
   `vi.mock('@waggle/agent')` wraps `runAgentLoop`, records the `AgentLoopConfig`, and calls the real
   loop. It may throw a scripted error only where §2 lists the failure as unreproducible through a
   provider. Every other pin goes through the fake provider.
3. **The three B tests are re-pinned to the production-path equivalent, not deleted.** They are
   chat-api L1647 (`contextMetrics`), smart-router L567 (paid compressor blocked) and turn-failure
   L73 (failure accounting). Each port pins what the real path does, and the port commit records
   what changed.

### Second round (2026-09-24, after PR #167)

4. **chat-turn-trace L101: port it.** The existing assertion is kept, filtered to the `chat.*`
   stages (still exactly `['chat.turn.start']`). A new assertion checks that `agent-loop.enter` and
   `agent-loop.exit` follow on the success turn.
5. **Budget-refusal re-pin against the real cap's own message: accepted.**
6. **Injectable retry clock: yes, as its own phase, before any further ports.** It is a minimal
   production seam, a backoff delay function passed through the loop config or retry policy, with
   no abstraction beyond a function parameter. It is pinned first, then used by the fake-provider
   tests so they stop waiting in real time.
7. **chat-api L1639 flake:** find out whether it is pre-existing. If it is, record it without
   fixing it blindly.

## 6c. Retry clock (ruling 6)

No sleep or delay seam existed in the loop or in `retry-policy.ts`; `waitForRetry` called
`setTimeout` directly.

**Seam.** `AgentLoopConfig.retryBackoffMs?: (waitMs) => number` maps the policy's backoff to the wait
actually taken. When it is unset, the loop waits exactly what the policy decided. The chat route
passes `server.llmRetryBackoffMs`, an optional decoration that is never set in production. Abort
and deadline checks are unchanged.

**Pins.** The agent pin was written first and failed before the field existed. It checks three things:
- the policy's schedule of 2 s, 4 s and 8 s reaches the seam, and the seam's answer is the wait taken;
- with the seam unset, a 2 s backoff still waits 2 s (fake timers);
- an abort still ends a shortened wait.

A route pin in chat-retry-chain checks that the decoration reaches every attempt's loop config.

**Effect.** Four files set `server.llmRetryBackoffMs = () => 0`:

| File | Before | After |
|---|---|---|
| attempt-policy | 16.9 s | 1.0 s |
| turn-failure | 12.9 s | 2.5 s |
| attempt-chain | 31.4 s | 18.1 s |
| usage-ledger | 2.6 s | 1.1 s |

attempt-chain's remainder is first-test cold start; the whole file took 13.6 s before any port.
Later ports that script failures should set the decoration as well.

**Flake (ruling 7).** TD-TEST-20 is pre-existing by construction. `chore/td-chat-16-seam-p2` has no
diff from `main` in production source, in `chat-api.test.ts`, in its test utilities or in the
vitest config, and the failure appeared there. The likely cause is a background fetch from the fresh
server landing inside the test's global `fetch` spy. It is recorded, not fixed.

## 6d. Turn-trace and phase 5 result

**Turn-trace (ruling 4), ported.**
- The success pin filters the turn's stages to `chat.*` and still asserts exactly
  `['chat.turn.start']`.
- It now also asserts that `agent-loop.enter` precedes `agent-loop.exit`.
- The rejected turn asserts that no model call was made.

**Phase 5: two of five ported.**
- **chat-keyless-billing: ported, all assertions unchanged.** A pass-through spy records the billing
  model and class for each attempt. Costs match to the digit on the real path, including 0.000078
  for the priced 11/3 turn, which the loop's own spend accounting now charges. The fake answers the
  keyless base URL `127.0.0.1:1`.
- **chat-agent-run: ported.**
  - The give-up pin scripts nine failing `read_file` calls, with paths outside the workspace, and
    the real loop guard aborts. **The asserted literal is now the guard's own copy**, "I wasn't able
    to complete this — the read_file tool failed repeatedly. Try rephrasing …", instead of the
    synthetic "I stopped after repeated tool failures." The same class of change as the accepted
    budget message; please review.
  - The tool-signal pin scripts a real `list_skills {filter:'launch'}` call; its assertion is
    unchanged.
  - Both turns now send a message that asks for the tool, because a conversational message
    transmits no tools.

**Stopped: an observable result changes, so these three files stay on `agentRunner`.**

| File | What changes on the real path | Proposed re-pin |
|---|---|---|
| chat-turn-execution-trace L163 ("cost read back … raised to spend already recorded") | The runner recorded 0.125 on the trace itself. The real loop charges its own spend onto the same trace, so `done.cost` is 0.125 plus the loop's cost. The other ten pins in the file port mechanically, but the file is held whole. | The spy records 0.125 before calling the real loop. Assert that `done.cost` equals the row's `cost_usd` and exceeds 0.125. |
| chat-teamsync-push | (a) The pushed content is the real tool result, "Memory saved to workspace mind (…)", not "Saved 1 memory.". (b) The real `save_memory` accepts an empty save, so the failed-save pin cannot be driven by arguments. | (a) Pin the real result text. (b) Fault-inject the mind write, for example a `vi.spyOn` on the frame store that throws. |
| chat-sse-backpressure | The socket stays open. With a real loop streaming about 3× `SSE_MAX_BUFFERED_BYTES` in 256 KB deltas, the backlog never passes the cap. Cause not confirmed; the likely suspect is that the loop caps or reshapes a multi-MB answer before the route's final write. | Needs investigation before a ruling. |

## 6e. Phase 6 (chat-api slice 1): attempted, stopped

**What I tried.** I replaced the suite's default runner in `beforeAll` with a suite-wide fake
provider. It streams `Hello ` and `world` with usage 10/5, and the suite was set to
`markFakeProviderHealthy` and a zero retry backoff.

**Result: 93 of 98 tests pass.**
- Four tests that still inject their own runner now time out: "publishes safe model activity",
  "streams retry status before backoff settles", "suppresses late reasoning … after a live client
  disconnect" and "keeps the authorized implicit workspace request-scoped".
- One of them never restores its runner, so the next test, "sends done event" (L1647), received
  that test's `Safe answer`.
- The healthy provider state or the vault key changes something these hold-open tests depend on.
  The cause is not isolated yet.

**Decision.** This is not a mechanical port, so chat-api is reverted. The slice needs:
1. Diagnose the four timeouts with the new suite state applied one change at a time: the vault
   key, `llmProvider`, the fake fetch, then the backoff seam.
2. Then do the L1647 re-pin (ruling 3). On the production path, `finalSystemPromptChars` equals the
   system prompt the fake received, `packageMode` is the real mode rather than `custom`, and the
   tool counts match the request's `toolNames`.

The slice should probably install the fake per test group rather than suite-wide.

### Third round (2026-09-25)

8. **agent-run give-up pin with the loop guard's real text: accepted.**
9. **Re-pin execution-trace and teamsync-push as proposed.**
   - execution-trace: `done.cost` is 0.125 plus the loop's own spend.
   - teamsync-push: the pushed content is the real tool result, and the failed-save case uses fault
     injection.
   - **sse-backpressure: the socket that never closes may be a real bug.** Root-cause it first:
     reproduce it, find where the close should happen, and compare the injected path with the real
     path. If it is a production bug, stop and report the evidence. Do not fix it silently.
10. **chat-api: follow the §6e diagnosis order.** Fix the runner leak and the four timeouts first,
    then port the file in 2–3 slices, including the L1647 re-pin. No suite-wide switch in one go.

## 6f. Re-pins (ruling 9)

**execution-trace: ported. The L163 assertion is unchanged, `done.cost === 0.125`, and my §6d
claim was wrong.**
- The spy's pre-loop hook records 0.125 on the trace the route hands the loop. The real loop then
  runs against the fake provider.
- The loop does not write its own spend to the trace row. Trace-owned spend is recorded by the
  built-in proxy when it serves the call, and the fake answers `/chat/completions` in the proxy's
  place.
- So the read-back is still exactly 0.125, which is also what the row holds. The "0.125 plus the
  loop's spend" premise in §6d was an unverified guess, and no assertion changed.
- The other ten pins ported mechanically:
  - scripted provider replies where possible;
  - the ruling-2 spy for unclassified messages and SQLITE_BUSY.

**teamsync-push: ported.**
- The success pin asserts that the pushed content equals the real `save_memory` result the turn
  reported, which starts with `Memory saved to workspace mind (`.
- The failure pin fault-injects the mind write (`CognifyPipeline.prototype.cognify` rejects), so the
  real tool result is an error, and asserts zero entity pushes.
- The failing save uses distinct content. The first pin's frame would otherwise dedup it into a
  successful "already exists" result.

## 6g. sse-backpressure investigation (ruling 9): not a production bug

**Reproduction.** A probe ran the real loop against a fake provider streaming 96 × 256 KB, about
3× the 8 MB `SSE_MAX_BUFFERED_BYTES`.
- The server made one model request.
- The response body was 475 bytes and ended with
  `error: LLM stream exceeded the total SSE size limit; partial content was not accepted.`
- The HTTP response therefore ends normally. The client in the pin never reads it, so the
  keep-alive socket stays open, which is exactly the "still open" the pin saw.

**Where the close should happen.** `writeSseEvent` (`routes/chat-sse.ts:24-34`) destroys the stream
once `writableLength` passes 8 MB. On the injected path the runner pushed 24 MB of tokens straight
into the route, so the cap fired. On the real path the agent's own SSE parser fails closed first,
at `MAX_TOTAL_SSE_CHARS = 2_097_152` (`packages/agent/src/sse-parser.ts:46,383`). That is 2 MiB,
below the route's 8 MB cap.

**Conclusion.** Both limits behave as designed, so there is no bug. One provider answer can never
fill the route's backlog to its cap. The TD-REL-1 cap still guards the cumulative backlog of a long
turn: tool events, many steps, and the answer.

**Pin decision needed.** The pin as written describes a state that one real answer cannot produce.
Options:
- (a) Keep it at the `writeSseEvent` unit level, which already exists.
- (b) Drive the cumulative backlog through many tool rounds with a paused reader. This is possible
  but slow and fragile.
- (c) Keep this one pin on a ruling-2-style spy that drives `onToken` directly. That goes beyond
  ruling 2, which only allows recording and throwing.

The file stays on `agentRunner` until a ruling. Recommendation: (a) plus one real-path pin showing
that an oversized provider answer ends in the parser's fail-closed error and that the socket is
released once the response ends.

## 6h. chat-api: the four timeouts diagnosed (ruling 10, step 1)

I re-applied the §6e suite state one change at a time, with the injected default runner kept in
place. Two independent causes, and no runner leak of its own.
1. **The vault key hangs L3125 through GEPA.** `markFakeProviderHealthy` sets the vault `anthropic`
   key, which enables GEPA. L3125 already runs the real loop behind its own `fetch` stub, which
   answers 503 to every host but `/api/tags`. GEPA's direct Anthropic calls then retry for longer
   than the test timeout.
   - Fix: the suite marks the built-in proxy healthy *without* a vault key. Model availability
     needs only the provider health.
2. **The fake answers the tests' own loopback HTTP with a 404.** Three hold-open tests ("safe model
   activity", "retry status before backoff", "late output after disconnect") call the suite's
   server over real HTTP with the global `fetch`. The fake answered those requests 404, so the
   route was never reached.
   - Fix: the suite installs the fake with `otherRequest: 'previous'`. Model calls and the Anthropic
     API go to the fake; everything else uses the real `fetch`, as before.
3. **The "runner leak" into L1647 (`Safe answer`) was a side effect** of the "safe model activity"
   timeout, not a separate defect.

With both fixes and the default runner still injected, chat-api passes 98/98. The next slice
removes the default runner.

**Slice 1: the default runner is removed.** Every chat-api turn without its own injected runner now
runs the real loop against the suite's fake.
- 97 of 98 passed unchanged, including the exact two-token stream, L2614 (`gpt-4o` provenance and
  exact persisted content) and the trace counters.
- L1647 was re-pinned per ruling 3. The metrics now describe the real package:
  - `packageMode: 'compact'`;
  - a positive tool catalog, with 0 tools eligible, selected or transmitted, matching the request's
    empty `tools`;
  - `finalSystemPromptChars` equal to the system prompt the fake received, with the token estimate
    derived from it;
  - provider tokens still 10/5.

The injected-runner C tests in chat-api are the next slices.

### Fourth round (2026-09-25)

11. **sse-backpressure: option (a).** The cap stays pinned at the `writeSseEvent` unit level, plus
    one real-path pin: an oversized answer fails closed through the 2 MiB parser and the socket is
    released.
12. **Suite time: split `chat-api.test.ts` into 3–4 files by area** so vitest runs them on parallel
    workers. This is a pure move with no assertion changes. The test count must be identical before
    and after (98 equals the sum of the parts), and wall time is measured. The split comes before
    chat-api slices 2–3.

## 6i. sse-backpressure re-pin and the chat-api split (rulings 11, 12)

**sse-backpressure.** The cap stays pinned by the `writeSseEvent` unit pins in `chat-sse.test.ts`.
The route file is now the real-path pin, and it asserts four things:
- a fake answer of about 3× the cap fails closed in the 2 MiB parser;
- the turn ends in `error` with no `done`;
- none of the answer reaches the client;
- a `connection: close` socket is released.

**chat-api split.** This is a pure move with no assertion changes. `describe('Chat Streaming API')`'s
setup is repeated in each part, and the trailing describes stay in the first file.

| File | Area | Tests |
|---|---|---|
| `chat-api.test.ts` | streaming, attempts, tool choice, plus key routing, context window, tool filtering | 47 |
| `chat-api-workspace-failures.test.ts` | done event, linked workspaces, failures, traces, tool events | 30 |
| `chat-api-history-isolation.test.ts` | history, overlapping turns, windowing, implicit workspace | 12 |
| `chat-api-default-workspace.test.ts` | the "default" workspace, legacy migration | 9 |

The count is 98 before and after. The four parts together took about 78 s wall time, against
107–135 s for the single file.

Line references to chat-api elsewhere in this plan (L1647, L2681, …) refer to the pre-split file.

## 6j. chat-api slice 2: `chat-api-default-workspace.test.ts`

Four echo-style injections now run the real loop. They are the pre-split tests at L3552, L3636,
L3725 and L3835 (the last on its own `migrationServer`).
- The suite's fake is switched per test with `provider.respondWith`. It echoes
  `reply:<last non-system message>` and records the conversation that reached the model.
- It goes back to `DEFAULT_REPLY` in each `finally`.
- All assertions are unchanged, including the exact persisted history and the absence of cross-scope
  messages. 9/9 pass.

**Left on `agentRunner` in this file:**
- **L3390 / personal-server.** Class C+B: an exact-argument `costTracker.addUsage` spy, which is
  route-side accounting, plus a hand-driven `onSkillDistillationFire`. This needs a ruling-3-style
  re-pin, or the ruling-2 spy for the distillation callback.
- The `runOverlappingTurns` helper copied into the prologue. It is unused in this file and goes
  with the history-isolation slice.

## 6k. chat-api slice 3a: `chat-api-workspace-failures.test.ts`

17 of the file's 19 injection sites are gone (16 tests and the unused overlap-helper copy); 27 of its 30
tests no longer inject a runner.

**Ported with every assertion unchanged:**
- Provider failures come from the fake: a 400 for the failed-turn memory pins, the error-turn pin
  and the abandoned-trace pin (a 4xx never counts against the circuit breaker), and a hold-open
  responder for the mid-request workspace switch.
- The two endpoint-outage cases script the real transport failures: `network_error` with
  `connect ECONNREFUSED …`, and a 502 whose retry cap the loop's own policy reaches. Each case
  builds its own server, because four failed attempts per case would open the shared server's
  breaker for every later pin (§5).
- Runner call counts became provider request counts: the structured retry calls the model once,
  a stale retry target or an unknown workspace never calls it. The echo pins and the
  history-denied retry read the conversation the model received.
- The Ollama pin now asserts the real wire call: URL `…:11434/v1/chat/completions`, model
  `llama3.2:latest`.
- The two titles that named the runner now name the model.

**Ruling 2 spy:** the two pins that assert the generic "Something went wrong" sentence need an
unclassified thrown message, already on the §2 list.

**Session cap.** A real named-workspace turn holds a workspace session, and the tier caps live
sessions at 10. The first full run failed from the tenth workspace on with `Workspace "…" is not
ready for chat.`. The pins that run a workspace turn now close that session in `finally`, as the
approval pins do (TD-CHAT-32).

**Stopped: an observable result changes, so these two stay on `agentRunner`.**

| Test | What changes on the real path | Proposed re-pin |
|---|---|---|
| "rejects a blank successful agent response" (×2) | The loop rejects a blank no-tool answer itself, before the route's own blank check. The error and the persisted turn read `LLM returned an empty assistant response with no tool calls` instead of `Model returned an empty response`. The synthetic `unsafe provisional` token has no real counterpart: a blank answer streams only blank deltas. The route's check stays reachable only when an explicit read-only tool rewrite leaves blank content. | Pin the loop's message (`EMPTY_MODEL_RESPONSE`), with no token and no done event, as with the budget and loop-guard literals. chat-api "terminates truthfully when both … are blank" is the same case. |
| "streams tool use events" | The route's auto-recall streams its own `auto_recall` tool event before the model's `web_search`, so there are two tool events, not one. Token, input and `toolsUsed` assertions pass unchanged when the model calls a real `web_search` (message "Search the web for …", the search host answered in-test). | Assert the exact ordered tool events `['auto_recall', 'web_search']`, the ruling-4 pattern. |

**Verification.** The file passes 30/30 (75 s). Wide run: 2782/2784. The two failures were
`local-inference-route` hardware and model probes, a 30 s hook timeout under full parallel load.
That file does not touch chat, and it passed 21/21 when run alone. Two earlier wide attempts died
of a worker out-of-memory crash, not a test failure.

## 6l. chat-api slice 3b: history-isolation, and the personal-server re-pin

**history-isolation: 7 of 8 injected tests ported, all assertions unchanged.**
- `runOverlappingTurns` now holds each turn's model call open in the fake and records the
  conversation that call received. The two overlap pins pass unchanged.
- The helper was not moved to `tests/helpers`. history-isolation is its only caller. The other
  three chat-api files carried unused copies: the workspace-failures and default-workspace copies
  are deleted here, and chat-api.test.ts drops its copy in its own slice.
- The active-clear pin holds the real model call open. The implicit-session pin echoes the turn.
- The windowing pin reads the windowed conversation off the wire, after the loop's system prompt.
  The request-scoped pin had already run the real loop and only lost its `agentRunner = undefined`.
- The abort-signal pin reads the `AbortSignal` on the real model request.
- The persona and model policy pin reads the wire system prompt and model.
- The verifier pin reads messages, tools and the system prompt off the wire. A ruling-2 spy records
  `maxTurns` and `skillDistillationGate`, which never reach it.
- Titles that named the runner or "an injected runner" now name the model.
- Real workspace turns close their sessions (the tier cap, §6k).
- **Held:** "persists only completed acquire_capability receipts". It drives forged, unpaired and
  mismatched `onToolResult` calls that a real loop cannot emit. This is the §2 "forged tool-result
  pairs" case, and ruling 2 allows the spy to record or throw only. It needs a ruling. One
  option: a real `acquire_capability` call for the positive receipt, with the forgery cases moved
  to a unit test of the receipt filter.

**default-workspace pre-split L3390 (personal server): re-pinned under ruling 3, no spy.**
- *Accounting.* The old pin asserted that the route called `costTracker.addUsage(personalModel,
  1, 1, 'personal::default', {billingClass:'free'})`. That is route-side accounting, which runs
  only for an injected runner. On the real path the route never calls `addUsage`, and the pin now
  asserts that. The loop's spend meter records one usage entry per model call, each with the same
  model, tokens, scope and billing class the old call carried.
- *Distillation.* The old pin called `onSkillDistillationFire` by hand. Now the turn asks for a
  memory search, the fake scripts five `search_memory` calls and then an answer, and the loop's own
  D1 gate fires the route's callback. The final `skill_share` assertion (`personal::default` and
  `default`) is unchanged and passes on the real trigger.
- *Inputs changed.* The personal and managed messages now ask for a memory search, because a
  conversational message transmits no tools. The `/settings` command prompt and the model pins read
  the wire requests.
- 9/9 in the file; history-isolation 12/12.

Verification: typecheck:server-tests and lint are clean. Wide run 2784/2784 (191 files), 630 s.

### Fifth round (2026-09-25)

13. **Blank-answer pins:** covers workspace-failures ×2 and the chat-api double-blank test. Pin
    the loop's real rejection, `LLM returned an empty assistant response with no tool calls`.
14. **"streams tool use events":** assert the ordered tool events `['auto_recall', 'web_search']`.
15. **Forged acquire_capability receipt:**
    - The positive receipt comes from a real, scripted `acquire_capability` call.
    - The forgery cases move to a unit test of the receipt check.

## 6m. Held tests ported (rulings 13–15)

**workspace-failures: no injected runner remains; 30/30.**
- The blank-answer pins run the real loop with a blank provider answer. They now assert the loop's
  exact error message, `LLM returned an empty assistant response with no tool calls`, in the
  error event and in the persisted turn. There is still no token and no done event.
- "streams tool use events" makes a real scripted `web_search` call, with the search host answered
  in-test. It asserts the ordered events `['auto_recall', 'web_search']`; the input, token and
  `toolsUsed` assertions are unchanged.

**history-isolation receipt pin: no injected runner remains; 12/12.**
- The model makes two real `acquire_capability` calls. Each need names a marketplace skill, with
  its words in a different order, and the real tool answers both with an installable marketplace
  proposal.
- Both proposals are issued. The persisted receipt is the second call's, live and cold, and the
  forged final answer is persisted as text only.
- The assertion that the streamed result differs from the raw tool result was dropped: no fixed
  raw result exists any more. `proposalId` and `expiresAt` in the issued output still show that the
  route rewrote it.
- The forgery cases now pin `createPersistedCapabilityReceipt` directly, in
  `local/chat-persistence.test.ts`: mismatched route, missing package identity, over-long need,
  ordinary result, marker not at the end, error result, missing need, and non-object input. That
  file also adds the positive marketplace and starter-pack cases.

Verification: typecheck:server-tests and lint are clean. Wide run 2794/2794 (191 files), 365 s.

## 6n. chat-api slice 3c: `chat-api.test.ts`, first part

Six tests no longer inject a runner, and the unused `runOverlappingTurns` copy is gone.
`agentRunner = ` sites in the file went from 19 to 9.
- **Blank no-tool fallback.** Primary answers `' \n'`, fallback answers `fallback ok`. This used
  to be an injected `runAgentLoop` with its own fetch and gates off; the route's own gates now run.
  Assertions are unchanged, and the models are read off the wire.
- **Double blank.** Re-pinned per ruling 13: the persisted turn is the loop's exact rejection.
  The synthetic `unsafe provisional` token is gone.
- **Tool then blank.** The injected `mutate_state` tool cannot exist on the real path. The model now
  makes a real `search_memory` call (the message asks for a memory search) and then answers blank.
  The pin still asserts one model tool event and one result, no replay and no fallback. It filters
  out the route's own `auto_recall` events, the way ruling 4 filters to `chat.*` stages.
  **Please review this filter:** it is the one assertion adaptation in this slice.
- **Trusted full-history path.** Reads the first wire request.
- **LiteLLM key routing ×2.** The describe installs its own fake, and the pins read the bearer
  header each model request carried. The master key and the pool key are asserted unchanged.

**Left: 9 sites in 5 tests.** These are "safe model activity", "safe reasoning activity",
"retry status before backoff", "late output after disconnect" (2 sites) and "failed-attempt
output out of the fallback stream". Each drives `onModelActivity`, `onReasoningActivity`,
`onRetry` or a provisional `<think>` token mid-turn. The helper cannot yet stream a partial
answer that holds open, or send reasoning deltas. The next slice extends the helper (a gated
chunked stream plus a reasoning delta), with helper unit tests, and then ports these.

Verification: typecheck:server-tests and lint are clean. Wide run 2794/2794, 400 s.

## 6o. chat-api slice 3d: the last five `chat-api.test.ts` tests

**Helper.** The fake gains a `stream` reply, scripted part by part:
- `{ content }` and `{ reasoning }` deltas, the second sent as `reasoning_content`;
- `{ pause }`, a callback run when the reader reaches that point, which holds the stream open until
  its result settles;
- `truncated: true`, which ends it the way `truncated_stream` does.

One frame goes out per pull, so a pause runs only after the reader has taken every frame before it.
After a cancel the remaining parts still run, pauses included, but nothing more reaches the reader:
that is a provider which ignores the disconnect. Four new helper tests drive it through
`runAgentLoop`, 20/20.

A body read that fails mid-stream was tried as a part and dropped. The parser reports it as
`LLM stream ended unexpectedly before data: [DONE]`, which is neither the route's replay message
nor retryable, so the turn ends in that error with no replay and no fallback. That is the current
production behavior of a dropped connection mid-answer; it is noted here, not changed.

**Ported, no injected runner remains in `chat-api.test.ts` (0 sites, was 9).** Every assertion is
unchanged except the runner's own flags, which became their provider equivalents.
- *Safe model activity.* The model's first delta is private reasoning, then the stream pauses.
  The pin reads `model_active` while the pause holds. "The runner has not settled" became "the model
  has not resumed", and the pin also asserts one model request. `PRIVATE_REASONING` has now
  really reached the server before the check, where it used to be sent only after it.
- *Safe reasoning activity.* Two reasoning deltas, the second shaped like the old
  `[TOOL_CALL]{"secret":"EXFIL"}`, then the answer. The provisional private text now travels as
  provider reasoning, not as a `<think>` token: on a non-Qwen model the loop does not strip literal
  `<think>` content, so a real `<think>` delta would be part of the answer.
- *Retry status before backoff.* The first model request fails in transport, and the loop's own
  retry policy emits the notice, `Connection to the model failed — retrying in 2s (retry 1/3)...`,
  the same text the runner forged. The retried request is held open. It runs on its own server,
  as before.
- *Late output after disconnect.* The stream sends reasoning, pauses, and after the client aborts
  goes on with late reasoning and content. The aborted signal is read off the model request. The
  post-abort probe reads the conversation off the wire, without the system prompt.
- *Failed-attempt output out of the fallback stream.* The primary streams reasoning and provisional
  content and is cut before `[DONE]`. The route's same-model replay then cannot reach the endpoint
  (four transport failures), and the turn falls back. The model list is read off the wire with
  consecutive retries collapsed, as `modelsSince` already does. The pin now builds its own server,
  because those failures count against the endpoint's circuit breaker (§5).

`AgentLoopConfig` and `AgentResponse` are no longer imported by the file.

Verification: typecheck:server-tests and lint are clean; chat-api.test.ts 47/47 in three isolated runs.
Wide run 2797/2798 (191 files), 445 s. The one failure is TD-TEST-20, the known forced-tool-choice
fetch-count flake (4 calls where 3 are expected), which passed in all three isolated runs.

## 6p. smart-router slice A: the suite default and the first half

**Suite setup.** The suite's default runner and its fetch stub are gone. Each test installs the fake
provider: every `/chat/completions` request is recorded in `completionRequests` (the variable the
pins already read) and answered by a per-test `reply`, `ok` with usage 1/1 by default. The Ollama
listing and the 503 for any other URL are unchanged. A ruling-2 pass-through spy records every
attempt's `AgentLoopConfig`, because many pins read fields that never reach the wire
(`billingModel`, `modelSpendBudget` identity, `modelSpendBillingClass`, `spendWorkspaceId`).
`capturedModel` is now the last attempt's model.

The approval hook runs on the real path, and a turn whose model calls a generator has no operator
to answer the card: the two artifact pins hung until the test timeout. The suite builds its server
with the route's existing test-mode auto-approval (`WAGGLE_AUTO_APPROVE`, read once at
registration). The injected runner skipped the hook entirely, so no pin loses a check it had.

**Ported with every assertion unchanged:** the default-runner pins, including L567 (ruling 3).
- **L567, the paid compressor.** `completionRequests` is still `[]` on the real path. The
  priced primary's own turn is refused by the loop's hard cap (the daily total is mocked at the
  cap), so neither a compression call nor the turn's model call is made. The ruling's
  production-path equivalent is therefore the unchanged assertion.
- **Unscoped artifact index; Office and PDF index.** The model makes real `generate_docx`,
  `generate_pdf`, `generate_xlsx` and `generate_pptx` calls; the second brief is regenerated
  under the refreshed title; the failing PDF call omits `content`, so the real tool answers
  `Error: content is required` instead of the forged `Error generating PDF`. The Office message
  now says "Excel spreadsheet": with plain "Excel" the tool selector did not offer
  `generate_xlsx`, and the call came back "not found".
- **Restart carryover.** The restarted server's turns run the real loop; the model is read from
  the spy.
- **Failed budget run returns to the primary.** The budget model cannot be reached, and the loop's
  own transport retries run out.
- **Budget, then primary, then fallback.** Neither the budget model nor the primary can be reached;
  the fallback answers. The attempts and the three switch reasons are unchanged. The primary's
  `(timeout)` reason still holds: the loop's own "could not reach" error carries no status. The pin
  runs on its own server. On the shared one, its eight transport failures on the Ollama origin
  left the circuit breaker open: the next two Ollama pins in the file got `Server error 503`
  retries and no `done`.

**Re-pinned, please review.**
- **Terminal hard-budget rejection (ruling 5 pattern).** The loop's own cap never refuses a free
  model, so an Ollama primary cannot produce this refusal. The pin now uses a priced primary,
  `claude-sonnet-4-6`, with a real hard cap, on its own server. It asserts one attempt on
  `anthropic/claude-sonnet-4-6`, no model request, an `error` event and `Daily budget exceeded`.
  The attempted model literal changed from `primary-test-model`. The pin needs its own server
  because the route caches each provider's credential pool for the server's lifetime: a pool made
  here with one key starved the credential-exhaustion pin later in the file.
- **Router budget reads (2 pins).** `getDailyTotal` is read twice per turn on the real path: once
  by the router and once by the loop's own spend reservation. The pins now count the reads made
  before the first attempt enters the loop and assert exactly 1. A spy pre-loop hook records the
  count, as in §6f.
- **Incomplete budget run (ruling 3).** The budget model's stream is cut before `[DONE]` with
  usage 13 500 / 500. The route never calls `addUsage` on the real path, and the pin asserts that.
  The loop's spend meter records one usage entry with the same model, tokens, scope and billing
  class. `addTokens`, `calculateUsageCost` and the trace assertions are unchanged.
**Held for a ruling: "persists returned usage before completing a client-cancelled run" (L718).**
The runner returns a usage of 20 000 / 1 000 and marks the turn's signal aborted as it returns. The
real loop cannot produce that state. An abort during the stream rejects before the final usage
frame, so the loop throws a client abort with no usage. The one abort path that carries usage
(after the body is read, before the post-read work) cannot be hit deterministically. The pin's
route-side `addUsage` assertion is injected-runner-only accounting as well. Options:
- (a) re-pin to a real mid-stream client abort, asserting no `done` or `error`, an `abandoned`
  trace, and the loop's committed estimate instead of 20 000 / 1 000;
- (b) move the usage-on-abort accounting to a unit pin of the failure module;
- (c) keep this pin on a ruling-2 spy that returns a response after aborting. That goes beyond
  ruling 2.

Recommendation: (a) plus (b).

Verification: typecheck:server-tests and lint are clean; smart-router 66/66 (46 s). Wide run 2798/2798
(191 files), 337 s.

## 6q. smart-router slice B: the second half

The fake's text reply takes an optional `finishReason` (a new helper test, 21/21). The spy gains
`failures[n]`, thrown on attempt n, as in chat-attempt-chain.

**Ported with every assertion unchanged:**
- The four model-selection exits and the fallback provenance pin. An unreachable model is
  scripted as a transport failure until the loop's retries run out; attempts are read from the
  spy. "Primary unavailable, no fallback" also asserts that no model request is made.
- The 29-tool and fallback-prompt pins already ran the real loop; they lose only their
  `agentRunner = undefined` lines.
- **Credential exhaustion.** Each provider key gets a real 401, and the local fallback answers.
  The three keys and the fallback order are unchanged.
- **Interrupted no-tool answer.** The first stream is cut before `[DONE]` with usage 100 / 20, and
  the replay answers. The replay's token budget is still the first budget minus 120.
- **Ollama fallback transport.** Both attempts' `litellmUrl` come from the spy.
- **Incomplete completion rows.** "Content filter" is a real `finish_reason: content_filter`,
  and "exhausted token budget" a cut stream reporting 100 000 / 20. The loop never reports an
  "assistant refusal" or an "invalid response body" reason, so those two rows are thrown by the
  spy under ruling 2. They are added to the §2 "cannot produce" list.
- **Non-replayable tool.** The model really calls `write_file`, then its next stream is cut. The
  message now asks for the write ("Write the release notes to release.txt."), because a review
  request transmits no write tool. "One simulated mutation" is now one `write_file` tool event.

**Re-pinned (ruling 3):** "reports the model that answered and bills it after a fallback". The
route never calls `addUsage` on the real path, and the pin asserts that. The billed models are
read from the loop's spend entries, which include the fallback model and end with it.

**Left in the file:** the held client-cancelled pin (§6p), and the suite's
`server.agentRunner = undefined` reset in `beforeEach`, which goes when that pin is ruled on.

Verification: typecheck:server-tests and lint are clean; smart-router plus helpers 87/87 (47 s). Wide run
2799/2799 (191 files), 345 s.

## 6r. The small /api/chat files: team-integration, user-facing-error, chat-pipeline

The grep for injection sites found one file the §2 inventory predates:
`local/chat-turn-user-facing-error.test.ts` (TD-CHAT-15, PR #168). It is handled here.

**chat-pipeline (tests/behaviors): no injected runner remains; 30/30.** The echo runner became the
fake's default answer, streamed as the same three chunks. The exact `Hello from Waggle!` did not
gain a suffix. The "runner never called" checks on the nine rejected requests became "no model
request". The slow-first-token pin holds the model call. The tool-events pin makes a real
`search_memory` call and filters out the route's own `auto_recall` events (the ruling-4 pattern).
It also asserts that the tool is `search_memory`. The provisional "I will inspect…" token has no
counterpart, because the fake's tool-call turn carries no content; the pin's "not in the answer"
check still holds. In the abort pin the model streams a provisional answer, then keeps working
until its request aborts; "work stops" is now the model request's abort. Every other assertion is
unchanged.

**user-facing-error: two of four ported.**
- The pricing refusal is the loop's own: a model the trusted catalog cannot price
  (`unpriced-test-model`), under a hard daily budget. The code and the verbatim message are
  unchanged apart from the model name, which was the synthetic `x`. No model request is made.
- The "assistant refusal" incomplete completion is thrown by a ruling-2 spy (§6q).
- **Held, two pins: the provider HTTP error and its persisted failure turn.** A real 502 is
  retried by the loop until its cap, and the user then sees "The model endpoint is not
  responding. It may be down or restarting. Check Settings > Models, then try again.", not
  "The model provider returned an error (HTTP 502). Try again or switch model." Only a status the
  loop does not retry reaches the route as `LLM error (<status>): <body>`. Proposed re-pin: a
  non-retried status such as 400, keeping the "status only, never the body" claim. The literal
  would then read `HTTP 400`. Alternatively, pin the 502 path's real sentence.

**team-integration: one of two ported.**
- The guarded-transport pin makes a real `save_memory` call. The push still goes to the guarded
  Team transport with the bound token, `redirect: 'manual'` and a dispatcher.
- **Held: "does not push save_memory with a Team token bound to another server".** On the real
  path the turn fails the team governance check before the model runs ("Team governance policies
  could not be reached for this workspace."), so the push guard is never reached. The pin's
  zero-push assertion still passes, but it would no longer test the guard. Proposed re-pin: keep
  this route pin as a governance fail-closed pin (the error, no model request), and move the push
  guard to a unit pin of the TeamSync token binding.

Verification: typecheck:server-tests and lint are clean. Wide run plus chat-pipeline 2829/2829
(192 files), 389 s.

## 6s. app e2e, the seam guard, and what blocks the production removal

**app/tests/e2e/chat.test.ts: two of four ported.**
- Scenario 4 streams `Hello ` + `world` from the fake, with every assertion unchanged, and also
  asserts one model request.
- Scenario 9 has the model really call `read_file` and then `write_file`. The route's own
  `auto_recall` tool event is filtered out (the ruling-4 pattern). The tool names, the read path
  and `toolsUsed` are unchanged. The message now also asks for the write, because a read request
  transmits no write tool. The service is built with the test-mode auto-approval, as in §6p.
- **Held: scenarios 10 and 10b, the "external mutation gate".** Their `gate:request` /
  `gate:response` exchange on the event bus exists only inside the injected runner. The real
  approval hook never emits either event: it sends `approval_required` and waits on the pending
  approval that `POST /api/approval/:id` answers. So there is no production path to port them
  onto. Proposed re-pin: drive the real hook. A `bash` call in a turn without auto-approval
  should show `approval_required` and finish once the approval is answered; a denial should show
  the refusal. `chat-approval-hook-characterization` already pins much of this.

**Guard (`chat-runner-seam-guard.test.ts`, ruling 1).** It scans every test file under
`packages`, `tests`, `app/tests` and `apps` that mentions `/api/chat`, and counts its runner
installs (`.agentRunner = …`, apart from `undefined` and saved-original restores, and
`decorate('agentRunner', …)`). The counts must equal an allowlist:
- `local-mode.test.ts`, 6 installs: fleet and agent-group runs (ruling 1);
- the held pins: smart-router 1, team-integration 1, user-facing-error 1, app e2e 2.

The list is a ratchet. When a held pin is ported, its count drops, and the guard fails until the
list is updated. `fleet-isolation` and `agent-groups` never post to `/api/chat`, so the guard
does not cover them.

**Phase 13+ (production removal) is not started.** Five injected-runner pins remain on
`/api/chat`, all waiting for a ruling. Removing `hasCustomRunner` now would break them.
`hasCustomRunner` still has 57 occurrences in 8 files under `packages/server/src`. The rulings
needed:

| Pin | Section | Recommendation |
|---|---|---|
| smart-router "persists returned usage before completing a client-cancelled run" | §6p | real mid-stream abort, plus a unit pin of usage-on-abort accounting |
| team-integration "does not push save_memory with a Team token bound to another server" | §6r | a governance fail-closed route pin, plus a unit pin of the token binding |
| user-facing-error "provider HTTP error" and "persists the text it showed" | §6r | a non-retried status (400), or pin the real 502 sentence |
| app e2e scenarios 10 and 10b | §6s | re-pin on the real approval hook |

Verification: typecheck:server-tests and lint are clean. Wide run plus chat-pipeline, app e2e and the
guard 2835/2835 (194 files), 464 s.

### Sixth round (2026-09-25)

16. **smart-router client-cancelled usage:** re-pin on a real mid-stream abort and assert what is
    actually recorded, plus a unit test for the accounting function.
17. **team-integration cross-server token:** pin the real governance refusal at route level, and
    move the push-guard assertion to a unit test of the push guard.
18. **user-facing-error provider pins: both.** Pin a non-retried status (400) for "The model
    provider returned an error (HTTP 400)…", and pin the real 502 path's final message.
19. **app e2e scenarios 10 and 10b:** re-pin on the real pre-tool approval hook.

Landed in p9. Ruling 16 pins that the unreported 20 000 / 1 000 usage is never costed, not that
`calculateUsageCost` is never called: the tracker's own budget sums call it over stored entries.
Ruling 19 gates `write_file`, not `bash`: `bash` is not in the default workspace tool set, and a bare
"Write …" message selects no tools, so the turn asks to create the file. With all five held pins
ported, the seam guard's allowlist is down to the fleet and agent-group runs in `local-mode.test.ts`.

Verification: lint is clean; typecheck:server-tests shows only two `ioredis` resolution errors from
the worktree's incomplete `node_modules`. Every changed file, chat-pipeline, app e2e and the guard
pass. Wide run 4265/4270 before the guard edit: the guard (fixed since) and four failures from
missing local packages (`ioredis`, `@vitejs/plugin-react-swc`, `better-sqlite3`), none in a touched file.

## 6t. Phase 13: the behavior switch

`chat.ts` now sets `hasCustomRunner = false` and `agentRunner = runAgentLoop` at the source, so
`POST /api/chat` never reads `server.agentRunner`. The branches the flag guards are dead but still
in place; phases 14 and 15 delete them. `server.agentRunner` stays for fleet and agent groups
(ruling 1).

Verification: lint is clean. `typecheck:server-tests` shows only the two `ioredis` resolution errors
(the package is absent from local `node_modules`, main checkout included). Full server suite plus
`tests/behaviors` and app e2e: 4347/4352, 378 s. The failures: four from missing local packages
(`entrypoint`, `start-trial`, two `tauri-config`), the same as before the switch. The fifth is one
`agents.test.ts` PATCH that returned 500 under load. That file never posts to `/api/chat`, and it
passes 33/33 in three isolated runs.

## 6u. Phase 14: the dead branches in preparation, session runtime and model routing

`hasCustomRunner` is gone from `chat-turn-preparation.ts`, `chat-turn-session-runtime.ts` and
`chat-turn-model-routing.ts`, along with their input fields. Each guarded branch now runs
unconditionally. The `if (!hasCustomRunner)` blocks (governance tool blocking, collaboration tool
binding, iteration budget and tool selection, and the workspace turn scope) are unwrapped with
their bodies unchanged. The injected-runner inversions are deleted: the empty tool pool, the
`'You are a helpful AI assistant.'` prompt, and "trust injected runners" in the model-health gate.
`shouldPackageSystemPromptForTurn` is deleted, not narrowed: with the flag false it always returns
`true`, so prompt packaging runs on every turn. Its re-export from `chat.ts` goes with it, and the
`chat-prompt-packaging` pin keeps only its assertions on the bounded package. `chat.ts` always forks
the hook registry. The flag remains only as the value handed to completion and failure accounting,
which phase 15 deletes: 18 occurrences, down from 57.

Verification: lint is clean; `typecheck:server-tests` shows only the known `ioredis` errors. Full
server suite plus `tests/behaviors` and app e2e: 4348/4352, 402 s. The only failures are the four from
missing local packages.

## 6v. Phase 15: completion and failure, and the close-out

`hasCustomRunner` is gone from `chat-turn-completion.ts`, `chat-turn-failure.ts` and `chat.ts`.
`packages/server/src` now reads it 0 times. The route-side cost accounting, which ran only for an
injected runner, is deleted from completion and failure. Spend is charged inside the loop
(TD-CHAT-8), as it already was for every production turn. The other completion branches (surfaced
signals, skill distillation, KG entity writes, correction detection, auto skill capture, schedule
suffix, grounding hedge, auto-save) run on every turn, still gated by retention. Deleting the flag
left three names unused, and they are removed: the `executionScopeId` destructure in
`completeTurnResponse`, and `activeExecutionWorkspaceId` and `PERSONAL_CHAT_SCOPE_ID` in failure. The
two comments that cited the flag (`held-action-executor.ts`, `persona-tool-filter.ts`) are rewritten.
The comments in ten characterization test files still mention the flag, as history of why each file
chose its harness; they describe the past accurately and stay. `docs/TESTING.md` names the fake
provider as the route seam, and TD-CHAT-16 is closed in `docs/TECH-DEBT.md`.

Exit criteria (§4): `grep -rn hasCustomRunner packages/server/src` returns 0. The seam guard keeps
`/api/chat` tests off the runner. The fleet and agent-groups decision is ruling 1. TESTING.md names
the fake provider. The suite is green apart from missing local packages.

Verification: lint is clean; `typecheck:server-tests` shows only the known `ioredis` errors. Full
server suite plus `tests/behaviors` and app e2e: 4348/4352, 455 s. The only failures are the four from
missing local packages.
