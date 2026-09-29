# ADR-03 — Detach ≠ cancel: continuation of approved background work, `sinceSeq` reconnect and the R3-008 boundary

> **English translation** of [2026-09-27-ADR-03-detach-cancel-supersedes-r3-008.md](2026-09-27-ADR-03-detach-cancel-supersedes-r3-008.md) (Serbian original, same folder). The Serbian original is authoritative; report any discrepancy. Dates are written DD.MM.YYYY; "wd" means working days.

**Document revision:** 1.2 DRAFT · 27.09.2026 · reviewed code revision `2af0904df01ca3d374cc78ba95b60dc579dd6a7a`
**Date:** 2026-09-27
**Status:** DRAFT — contract proposal; does not change R3-008 for foreground chat before W1
**Author:** planner (Fable 5.1)
**Ratified by:** founder — pending
**Supersedes / refines:** R3-008 ("socket close aborts in-flight run", `docs/audits/2026-05-29-prod-readiness/REPORT.md:103,157`; `packages/agent/src/agent-loop.ts:1090-1108,1458-1468`; `packages/server/src/local/routes/chat.ts:1604-1612`) — **is not abolished**, it is narrowed to the foreground `conversation` path; the registry stream's `MAX_EVENTS`/`resetRequired` model as the sole replay mechanism; S1 A9
**Binds:** W1 (per-run event bus, detach API), W5 (Work Progress + UX copy), ADR-02 (RunEvent `seq`)
**Cross-references:** ADR-01, ADR-02, ADR-07 (routines are always detached), ADR-09 (worker has no SSE contract); brief §6.4; AT-10, AT-06; FRD-05.8 (Stop/View-work copy test, without an AT ID — AT-22 is a change-input test, Disposition OD-10)

---

## §1 — Context

**ADR-03-K1 (CONFIRMED AT REVISION — intended behavior).** Closing the SSE socket aborts the turn: `chat.ts:1604-1612` `raw.once('close', () => { if (!raw.writableEnded) abortController.abort(); })` (comment: "must abort the provider/tool run immediately"); the signal is passed into fetch and checked between turns and in the read loop (`agent-loop.ts:973-975,1090-1108,1147,1458-1468,1663,1827,1872`). The same pattern exists on the proxy path (`anthropic-proxy.ts:817,1114`). Origin: R3-008 (2026-05-29 prod-readiness), test `packages/agent/tests/agent-loop.test.ts:1981-2010`. [durable.md F-DUR-06; refute WEAKENED only for the UX copy claim]

**ADR-03-K2 (CONFIRMED AT REVISION).** Client: Stop (`apps/web/src/hooks/useChat.ts:463-469`) and unmount (`:473-487`) call `controller.abort()` + `adapter.abortAgent()` (`adapter.ts:1184-1208`). Children inherit the abort: `chat-collaboration.ts:110-128` `linkParentCancellation` → `registry.control(runId,'cancel')`. There is no "continue in the background" option (grep `background|detach` in `useChat.ts`/`adapter.ts`: 0 relevant; `adapter.ts:3490` `detached` is an external-tool launch). The existing copy "Stop generating" (`ChatApp.tsx:2428-2432`) and "Stop response and start a new session" (`:2030`) **does not say** that child subagent runs are cancelled, nor that closing the tab aborts the work — this is a real gap against brief §6.4. [F-DUR-06 + refute]

**ADR-03-K3 (CONFIRMED AT REVISION).** Replay: `GET /api/agent-runs/events?since=` exists for registry upsert events (`routes/agent-runs.ts:20-22,73-84`; `agent-run-registry.ts:243-257` `resetRequired`), but chat SSE has no `sinceSeq`/`Last-Event-ID` (grep `packages/server/src` = 0); `/api/events/stream` (`routes/events.ts:328-359`) is live-only. The `step` SSE payload has no `runId/phaseId/status/evidenceRefs` (`chat-agent-run.ts:155-199`; `lib/types.ts:575-586`). [F-DUR-06, F-UXM-11]

**ADR-03-K4 (CONFIRMED AT REVISION).** Subagent/workflow "background" is tied to the lifetime of the parent HTTP turn (`subagent-orchestrator.ts:93,119-124,439-458`); fleet spawn (`POST /api/fleet/spawn`, 202) is the closest internal flow that continues without an open client socket, but it does not survive a restart (F-DUR-01). External-tool runs (`POST /api/tools/launch`, `POST /api/tools/run`) also continue without a socket and survive a sidecar restart through pid-reconcile while the pid is alive (`agent-run-registry.ts:381-395,510-520`; test `packages/server/tests/tools-routes-launch.test.ts:1148-1170`; CONFIRMED AT REVISION per refuter F-DUR-12) — a BORROW precedent alongside fleet spawn (see ADR-02-P3). `lifecycle.isShuttingDown()` guards (`fleet-run-executor.ts:379-478`) reject new spawns; they do not preserve ongoing ones. [F-DUR-12; refute WEAKENED only the test citation: `packages/server/tests/tools-routes-launch.test.ts:1148-1170`]

**ADR-03-K5 (DECISION — D-14 · PROPOSAL — BRIEF DIRECTION — DIR-05, brief §6.4).** DECISION: long-running work and routines are part of the product (D-14). PROPOSAL — BRIEF DIRECTION (planner direction, not user approval): "Detach means the UI detaches, while approved background work continues. Cancel means a request that no new actions start, a controlled stop and a terminal record. Loss of the SSE connection by itself is not a user decision to cancel." (brief §6.4)

## §2 — Decision (contract proposal)

**ADR-03-O1 (PROPOSAL) — two paths, one meaning per term.**
- **Foreground `conversation`** (`/api/chat` without a DurableRun): R3-008 **remains** — closing the socket/Stop aborts the turn and its children. The UX must state this explicitly (O5). This is the cheap, safe, existing semantics for short answers.
- **Durable `work`** (a DurableRun exists, ADR-02): closing the socket is a **detach**, not a cancel. The run continues under a lease; the `Stop` button in Work Progress sends an explicit `POST /api/runs/:id/control {action:'cancel'}`; only that is a cancel.

**ADR-03-O2 (PROPOSAL) — cancel semantics.** Cancel = (1) `cancelling` (transitional, persisted), (2) prohibition of new `ToolAction.dispatching` (ADR-02 O5) — actions already in `dispatching` are not forcibly aborted but are brought to `succeeded|failed|unknown_outcome`, (3) a cooperative `AbortSignal` for model calls/reading (existing mechanism), (4) a terminal `CANCELLED` with a reason, persisted checkpoints and artifacts (FRD §4 "retains completed artifacts/checkpoints").

**ADR-03-O3 (PROPOSAL) — run-scoped event bus and reconnect.** Every `RunEvent` has a `runId` + a monotonic `seq` (ADR-02 O1). `GET /api/runs/:id/stream?sinceSeq=N` returns events > N and then continues live; a `sinceSeq` older than the oldest retained event → `resetRequired` + snapshot (BORROW from `agent-run-registry.ts:243-257`). Replay and duplicate events must not duplicate text, cards or side effects: the client dedupes by `(runId, seq)`, cards carry an `actionId`. The global `harnessEvents`/`harnessId` is not sufficient for two concurrent Workspaces (ADR-01 K6) → a `harnessEvents → RunEvent` bridge per `runId`.

**ADR-03-O4 (PROPOSAL) — detach is explicit, not hidden.** When the user leaves the Workspace/tab during a `work` run, the UI shows "Work continues in the background · View work"; when the user returns, Work Progress is reconstructed from `sinceSeq=0` or from a snapshot. Detached work is visible from Home (What Needs Me / My Work, D-07) and from Approvals when it is `BLOCKED_*`.

**ADR-03-O5 (PROPOSAL) — UX copy for the foreground path (smallest change, W0/W5).** "Stop generating" gets a tooltip/aria: "Stops the response and all helper agents started from it. Closing the tab has the same effect." No hiding of safety-relevant information for the sake of cleaner copy (brief §11.1).

**ADR-03-O6 (PROPOSAL) — routines and channel turns are always detached.** They have no client socket (ADR-07); their "cancel" is exclusively the `control` API or disabling the routine; an IM client disconnect is not a cancel (AT-25 does not give IM a cancel without a bound token).

## §3 — What it supersedes and why

| Previous | Where | Why |
|---|---|---|
| R3-008: socket close → abort, universally | `chat.ts:1604-1612`; `agent-loop.ts:1090-1108`; REPORT.md:103 | Correct for foreground chat (stops cost), wrong as the sole model for long-running work (D-14). **Narrowed**, not abolished; test `agent-loop.test.ts:1981-2010` remains |
| "Stop" = closing the socket; cancellation of children implicit | `useChat.ts:463-487`; `chat-collaboration.ts:110-128` | The user does not know they are losing children/work (CONFIRMED that the copy does not say so) |
| Registry `since` as the sole replay (upsert events, global `MAX_EVENTS`) | `routes/agent-runs.ts:73-84` | A compatible equivalent for run status, not for text/cards; per-run `seq` is missing |
| S1 A9 "Stop means cancel, not socket close" | S1 A9 | Accepted with refinement: applies to durable `work`; foreground keeps R3-008 with clear copy (brief §6.4) |

**ADR-03-Z1 (DECISION — not reopened · PROPOSAL — BRIEF DIRECTION — DIR-05, brief §6.4).** DECISION: D-14 (long-running work and routines are part of the product) is implemented, not decided; D-01..D-18 are not the subject of this ADR. PROPOSAL — BRIEF DIRECTION: detach ≠ cancel (DIR-05, brief §6.4) is the working basis this ADR implements; R3-008 is narrowed, not abolished.

## §4 — Consequences

**ADR-03-P1 (PROPOSAL).** No change to R3-008 code before W1; W0 delivers only the O5 copy. Fleet spawn and channel/cron turns are the first candidates for the O1 durable path (ADR-02 P4).

**ADR-03-P2 (PROPOSAL).** The `step` SSE payload (`chat-agent-run.ts:155-199`) and `StepContentBlock` (`lib/types.ts:575-586`) are **additively** extended (`runId`, `phaseId`, `seq`, `status: running|done|failed|blocked`, `evidenceRefs`); `ActivityStream` (`warm/ActivityStream.tsx:58,71`, already `aria-live`) remains the render surface (DIR-16 without a rewrite).

**ADR-03-P3 (PROPOSAL).** The client gets reconnect logic with `sinceSeq` only for the run stream; the chat `conversation` stream stays as it is.

**ADR-03-P4 (PROPOSAL).** Tests: `agent-loop.test.ts:1981-2010` (R3-008) stays green; the `chat-collaboration.test.ts` link-parent-cancel tests remain for foreground; new tests in §6.

## §5 — Risk

| ID | Risk | L/I | Mitigation |
|---|---|---|---|
| ADR-03-R1 | A detached run spends budget without the user on screen | medium / medium | per-run budget cap (ADR-02 O7); notification on BLOCKED/FAILED; Home visibility |
| ADR-03-R2 | Replay duplicates cards/actions | medium / high | `(runId,seq)` dedup; cards by `actionId`; AT-10 |
| ADR-03-R3 | The user thinks Stop cancelled the durable work, but it did not | medium / medium | O1 explicit control API + "Cancelled" confirmation only on `CANCELLED` |
| ADR-03-R4 | The proxy path (`anthropic-proxy.ts`) keeps close→abort for work as well | low | the proxy is not a durable path; document it |

## §6 — Migration test

| ID | Test | Expectation | AT |
|---|---|---|---|
| ADR-03-T1 | Durable run; the client closes SSE → the run stays `RUNNING`, the next phase executes; `GET …/stream?sinceSeq=k` returns the missed events without duplicates | RED today (turn aborted) | AT-10 |
| ADR-03-T2 | `control cancel` during a `dispatching` action → the action ends `succeeded/unknown_outcome`, no new action starts, the run is `CANCELLED` with persisted checkpoints | new | AT-10 |
| ADR-03-T3 | Foreground `conversation`: socket close → abort (R3-008 remains) | green today (`agent-loop.test.ts:1981-2010`) | — |
| ADR-03-T4 | Replay of the same `seq` twice → one card, one text block (client test, `apps/web/src/test/`) | new | AT-10 |
| ADR-03-T5 | Two concurrent runs → two streams, events do not mix | RED today (global `harnessEvents`) | AT-06 |
| ADR-03-T6 | UI copy test: the Stop tooltip contains the information about helper agents/closing the tab | new (vitest DOM) | — (FRD-05.8 copy test, Delivery plan W0-PR16; brief §16 has no AT for this UX — Disposition OD-10) |

## §7 — Sources

- **D:** D-14 · **DIR:** DIR-05 (brief §6.4) · **C/A/R:** C12; A9, A11; R10 · **AT:** AT-06, AT-10, AT-25 (T6 = FRD-05.8 test without an AT ID)
- **Phase A:** `docs/plans/v1.2-evidence/phaseA/durable.md` F-DUR-06, F-DUR-08, F-DUR-12; `docs/plans/v1.2-evidence/phaseA/durable.refute.md`; `docs/plans/v1.2-evidence/phaseA/ux-model.md` F-UXM-11
- **S1:** A9, A11 · **Code (at `2af0904d`):** `packages/server/src/local/routes/chat.ts:1604-1612`; `packages/agent/src/agent-loop.ts:973-975,1090-1108,1458-1468`; `apps/web/src/hooks/useChat.ts:463-487`; `apps/web/src/lib/adapter.ts:1184-1208`; `apps/web/src/components/os/apps/ChatApp.tsx:2030,2428-2432`; `packages/server/src/local/chat-collaboration.ts:110-128`; `routes/agent-runs.ts:20-22,73-84`; `routes/events.ts:328-359`; `routes/chat-agent-run.ts:155-199`; `packages/agent/src/subagent-orchestrator.ts:93,119-124`; `docs/audits/2026-05-29-prod-readiness/REPORT.md:103,157`
