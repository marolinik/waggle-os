# Phase A — "The Room" · Execution Plan

**Parent:** [docs/WAGGLE-CORNERSTONE.md](../WAGGLE-CORNERSTONE.md)
**Date:** 2026-04-11
**Status:** Ready to execute pending user approval on this plan.
**Owner:** (to be assigned)

> **Goal:** In 30 seconds of use, the user can open two windows on the same workspace, each running a different persona, chatting simultaneously, and watching sub-agents work in a shared Room canvas. This is the killer demo — the 30-second "wait, this is different" moment.

---

## 0. Locked decisions (from cornerstone §6)

- **D1** — Concurrency cap tier-gated: 3 Solo / 5 Basic / 10 Teams / ∞ Enterprise
- **D2** — Room is a dedicated `RoomApp` launched from the Dock with `Cmd+R`
- **D3** — Cross-workspace read consent via per-pair approval modal (applies in Phase B, noted here for design consistency)
- **D4** — Phase D (Parity) shipped as a single sprint at the end
- **D5** — Voice in Phase C
- **D6** — WaggleDance stays dormant until Teams tier

---

## 1. Pre-flight verification (R1 retired)

The cornerstone said `activateWorkspaceMind` is referenced by "more than just chat.ts". Verified.

### Real call sites of `activateWorkspaceMind`

| Route file | Line(s) | What it does | Migration priority |
|---|---:|---|---|
| `routes/chat.ts` | 195, 432, 525 | Main chat SSE path — **the critical one** | **P0 — must migrate in A.1** |
| `routes/commands.ts` | 24, 30, 54 | Slash commands (`/research`, `/draft`, etc.) — piggybacks on chat flow | **P0 — must migrate in A.1** |
| `routes/workspace-context.ts` | 173, 177, 185, 192 | Builds the "Workspace Now" briefing block | P1 — can stay on legacy path short-term; used read-only |
| `routes/workspaces.ts` | 328, 497 | Workspace CRUD — activates on create/open | P2 — legacy path is safer for CRUD until A.1 is validated |
| `routes/ingest.ts` | 440 | Bulk ingest — runs in isolation, long-running | P3 — leave alone, not user-facing |
| `routes/weaver.ts` | 90 | Memory consolidation jobs — background | P3 — leave alone, not user-facing |

### Also found

- `WorkspaceSessionManager` is **already instantiated** at `packages/server/src/local/index.ts:757` with `new WorkspaceSessionManager(3)`.
- It's **already used by `routes/fleet.ts`** (lines 19, 57, 74, 85, 96) for pause / resume / close operations — so the session manager's API is proven.
- `workspaceMindCache` at `index.ts:762` is already a `Map<string, MindDB>` — multiple workspace DBs can be open at once. The singleton is only at the *orchestrator-mind-is-current* layer, not the DB layer.
- The orchestrator is shared: `chat.ts:537` calls `orchestrator.recallMemory()` and that orchestrator holds ONE workspace mind set by the last `setWorkspaceMind()` call. **This is the actual singleton blocker, not `activeWorkspaceId` itself.**

### Updated scope estimate

Original cornerstone estimate: **8 working days for Phase A total, 2 days for A.1.**
Revised after audit: **10–12 working days for Phase A total, 4 days for A.1.**

The +2 days on A.1 come from:
- Migrating `commands.ts` alongside `chat.ts` (they share flow)
- Fixing the orchestrator singleton (either per-session instances or stateless `recallMemory(mind, query)` signature)
- Writing the concurrency test with real simulation of two SSE streams

---

## 2. Sub-phase A.1 — Backend session manager wiring (4 days)

### Objective

Replace the `activateWorkspaceMind` + shared-orchestrator pattern in `chat.ts` and `commands.ts` with the existing `WorkspaceSessionManager`. Each chat request is served by its session's own mind handle and tool pool. Two concurrent chat calls on different workspaces cannot corrupt each other.

### Key technical decision: orchestrator refactor shape

The orchestrator (`packages/agent/src/orchestrator.ts`) currently holds `workspaceMind` as instance state and `recallMemory(query)` reads from it. Two viable shapes:

- **Option X: stateless orchestrator** — change `recallMemory` signature to `recallMemory(mind: MindDB, query: string)`. Every call site passes the session's mind. Cleanest long-term; touches more call sites.
- **Option Y: per-session orchestrator instances** — each `WorkspaceSession` gets its own lightweight `Orchestrator` instance. Session creates it at `create()`, destroys it at `close()`. Smaller blast radius; more memory per session.

**Default: Option X.** It's closer to the right long-term model and unblocks Phase C's context rail, which also wants mind-as-parameter. If Option X turns out to touch too many call sites, fall back to Option Y — note this in the task list and re-estimate if hit.

### Task list

- [ ] **A1.1 — Read `packages/agent/src/orchestrator.ts` in full.** Count call sites of `workspaceMind` and `setWorkspaceMind`. Decide Option X vs Option Y based on surface area. Document the decision in this plan's "Decisions made during execution" section before coding.
- [ ] **A1.2 — Add a tier-gated concurrency cap to `WorkspaceSessionManager`.**
  - New method: `setMaxSessions(n: number)` (so the cap can change mid-session if the user upgrades).
  - Default unchanged (3). Read the user's tier from workspace config or subscription state and set accordingly at sidecar startup: Solo=3, Basic=5, Teams=10, Enterprise=∞ (use `Number.MAX_SAFE_INTEGER`).
  - For now, Solo is the only tier wired; the other three branches can be TODO placeholders until Stripe lands.
- [ ] **A1.3 — Refactor `orchestrator.ts`** per chosen option.
  - If Option X: `recallMemory`, `searchMemory`, `saveMemory`, and any other mind-using method gain an explicit `mind: MindDB` first parameter. Update every call site across `packages/server`, `packages/agent`, and `apps/web/src/lib/adapter.ts` (if any).
  - Add deprecation shim: old `orchestrator.recallMemory(query)` still works but logs `[DEPRECATED]` and uses the legacy `workspaceMind` singleton if set. Remove shim after all call sites migrated.
  - Run `npx tsc --noEmit -p packages/agent/tsconfig.json` and `npx tsc --noEmit -p packages/server/tsconfig.json` — both must be clean before A1.4.
- [ ] **A1.4 — Migrate `chat.ts` to sessionManager.**
  - At the top of the POST `/api/chat` handler, after workspace path resolution, call `server.agentState.sessionManager.getOrCreate(workspaceId, mindFactory, toolsFactory, personaId)`.
  - `mindFactory` opens/returns the workspace's MindDB via the existing cache logic.
  - `toolsFactory` returns the tool list for that session — tools can be captured from the closure over the session's mind.
  - Replace `server.agentState.activateWorkspaceMind(effectiveWorkspace)` at line 525 with `sessionManager.touch(effectiveWorkspace)`.
  - Replace the `orchestrator.recallMemory(agentMessage)` at line 537 with `orchestrator.recallMemory(session.mind, agentMessage)` (Option X) or `session.orchestrator.recallMemory(agentMessage)` (Option Y).
  - Pass `session.abortController.signal` to `runAgentLoop` so the loop can be aborted by `sessionManager.pause()`.
- [ ] **A1.5 — Migrate `commands.ts` to sessionManager.** Same pattern as chat.ts. Slash commands run through the same agent loop, so the changes are analogous.
- [ ] **A1.6 — Add deprecation warnings to `activateWorkspaceMind`.**
  - The legacy function in `index.ts` still exists. Mark it `@deprecated` in JSDoc and log a `[DEPRECATED activateWorkspaceMind called from X]` warning with the call site.
  - This surfaces any remaining P1/P2/P3 routes that still hit it during normal usage.
- [ ] **A1.7 — Write the concurrency test.**
  - New test file: `packages/server/tests/concurrent-chat.test.ts`.
  - Spins up the sidecar in a test harness, sends two POST `/api/chat` requests in parallel to different workspaces, verifies:
    - Both return non-empty responses
    - Neither response contains content or memory references from the other workspace
    - `sessionManager.size === 2` during the call
    - Both sessions close cleanly after
  - Bonus: a third test where both calls target the SAME workspace with DIFFERENT `sessionId` values and verifies they don't interfere.
- [ ] **A1.8 — Verification.**
  - `npx tsc --noEmit` clean on `packages/agent`, `packages/server`, `apps/web`
  - `npm run test -- --run` clean on `packages/server`
  - Manual: start the sidecar, send two curl POSTs to different workspaces, watch logs for `[DEPRECATED]` warnings. Any warning is a bug to file and migrate in a follow-up (P1/P2 routes).

### Rollback plan

All changes are additive + an additional dispatch layer. If concurrency test fails:
1. Revert the `chat.ts` and `commands.ts` changes.
2. Leave the orchestrator refactor in place — it's a pure signature extension, backwards-compatible via the deprecation shim.
3. Leave the sessionManager instantiated and used by fleet.ts.
4. File an issue documenting the failure mode for follow-up.

### Acceptance criteria (A.1)

1. Two parallel POST `/api/chat` requests to different workspaces complete successfully without cross-contamination.
2. Two parallel POST `/api/chat` requests to the same workspace with different sessionIds complete successfully.
3. `sessionManager.getActive()` returns 2 entries during concurrent calls.
4. No `[DEPRECATED]` warnings for `activateWorkspaceMind` in the chat or slash-command flow.
5. TypeScript strict + all existing tests still pass.
6. A new concurrency test passes reliably (10 runs in a row).

---

## 3. Sub-phase A.2 — Per-window persona state (2 days)

### Objective

Move the `persona` field from `Workspace` record to the frontend's `WindowState` object. A user can open four chat windows on the same workspace and each one runs a different persona.

### Task list

- [ ] **A2.1 — Add `personaId` field to `WindowState`** in `apps/web/src/hooks/useWindowManager.ts`.
  - Default: inherit from workspace's current persona at window creation time (so existing behavior is preserved on first open).
  - New method: `setWindowPersona(instanceId, personaId)`.
- [ ] **A2.2 — Update `openChatForWorkspace`** to accept an optional `personaId` parameter. If none provided, inherits from workspace.
- [ ] **A2.3 — Update `ChatWindowInstance.tsx`** to read persona from its own window state, not from the workspace record.
  - The `currentPersona` local state can stay as a UI helper but must be initialized and synced with `WindowState.personaId`.
  - When the user picks a persona in the PersonaSwitcher, call `setWindowPersona(instanceId, newPersona)` — do NOT call `patchWorkspace`.
- [ ] **A2.4 — Update `PersonaSwitcher.tsx`** to operate on the focused window, not the active workspace.
  - `onSelect(personaId)` should receive the focused window's instanceId from `useWindowManager`.
  - The "current persona" highlight reads from window state.
- [ ] **A2.5 — Update window title bar + dock** to show `{workspace_name} · {persona_label}` when the persona is non-default. Keeps users oriented when they have four windows open.
- [ ] **A2.6 — Thread persona through the backend call.**
  - The `/api/chat` body already accepts workspace and session. Add an optional `persona` field to the body schema.
  - In chat.ts, if `persona` is present, it overrides the workspace default for that session.
  - Session state (via `WorkspaceSessionManager`) carries `personaId` per session, not per workspace — already supported in the session schema.
- [ ] **A2.7 — Backwards compatibility.**
  - Workspace records still carry a `persona` field as a DEFAULT. When the user opens a brand-new chat window, we use it.
  - Existing single-window users never see a change — persona per workspace keeps working.

### Acceptance criteria (A.2)

1. Open chat window 1 on workspace "Product", pick "Researcher" persona.
2. Open chat window 2 on workspace "Product", pick "Writer" persona.
3. Both windows show the correct persona in the title bar.
4. Sending a message in window 1 uses Researcher's prompt; sending in window 2 uses Writer's.
5. Memories saved in each window land in the same Workspace Mind but tagged with the right persona.
6. Workspace's default persona unchanged when you only change it in a window.

---

## 4. Sub-phase A.3 — The Room canvas (3 days)

### Objective

A new desktop app showing a live canvas of every running agent and sub-agent for the current workspace. Tiles for each, with persona icon, current tool call, status, mini-transcript. The user literally watches their specialists work.

### Task list

- [ ] **A3.1 — Backend event shape.**
  - Review `emitSubagentStatus` in `packages/server/src/local/index.ts` (~line 602, 749, 602). Verify payload includes: parent session ID, persona, current tool, current tool arg summary, status (idle/running/waiting/done/error), start time, last update time, transcript tail (last 3 messages or 500 chars).
  - If any of those are missing, extend the event emitter. (Most likely missing: current tool arg summary and transcript tail.)
- [ ] **A3.2 — Frontend subscription hook.**
  - New hook: `apps/web/src/hooks/useRoomState.ts`.
  - Subscribes to `/api/notifications/stream`, filters for `event: subagent_status`, groups events by `parentSessionId`, maintains a Map of running sub-agents.
  - Cleans up entries after the parent session ends or after 10 minutes idle.
- [ ] **A3.3 — `RoomApp.tsx` component.**
  - New file in `apps/web/src/components/os/apps/RoomApp.tsx`.
  - Top bar: filter by workspace, filter by session, "close all done" button.
  - Grid of sub-agent cards (use Hive DS). Each card:
    - Persona icon (large, colored by layer)
    - Role label and task one-liner
    - Status dot (idle/running/waiting/done/error) with color
    - Current tool call (e.g., "web_search('...')")
    - Last 3 transcript lines (collapsed by default, click to expand)
    - "focus" button that switches the main chat view to that sub-agent's parent session
  - Empty state: "No agents running. When you ask a complex question, sub-agents spawn here."
- [ ] **A3.4 — Wire into the Dock.**
  - Add a new icon to the Dock for the Room.
  - Register `Cmd+R` (and `Ctrl+R` on Windows) as the shortcut.
  - If the Room has any running agents, show a count badge on the dock icon.
- [ ] **A3.5 — Register in `Desktop.tsx`.**
  - Add `'room'` case to the `win.appId` switch in the window dispatcher.
  - The Room opens as a normal resizable window — honors all the existing window manager features (drag, tile, snap).
- [ ] **A3.6 — Graceful handling of no running agents.**
  - Empty state shows the 3 last recently-finished agents from the last 15 minutes with their final result, then the empty-state copy.
- [ ] **A3.7 — Auto-surface on spawn (optional but recommended).**
  - When a sub-agent spawns and the Room app is NOT open, show a toast "Room: 2 agents running — open Room (⌘R)".
  - Settings toggle to disable this if users find it noisy.

### Acceptance criteria (A.3)

1. Ask a multi-part question (e.g. "research the top 5 competitors and draft a comparison") in a chat window.
2. Main agent spawns at least one sub-agent.
3. Open Room with `Cmd+R`. See the running agent(s) as tiles within 1 second of spawn.
4. Tiles update as each agent progresses through tool calls.
5. When agents finish, their tiles show the final state and move to a "completed" section (don't disappear immediately).
6. Clicking a tile focuses the main chat view on the parent session.

---

## 5. Sub-phase A.4 — Window restoration (1 day)

### Objective

Relaunching Waggle feels like resuming work, not rebooting. Every open window — including its workspace, persona, position, and size — comes back in place.

### Task list

- [ ] **A4.1 — Persist the full window list** (not just positions).
  - Extend `useWindowManager` to save the complete `WindowState[]` array to `localStorage` on every change.
  - Schema: `{ version: 1, windows: [{ instanceId, appId, workspaceId, personaId, position, size, minimized }] }`.
- [ ] **A4.2 — Restore on boot.**
  - At `Desktop.tsx` mount, read the saved state.
  - For each window: recreate it via `openChatForWorkspace` (or the appropriate open method per app).
  - Handle missing workspaces gracefully (e.g. workspace was deleted since last run) — drop that window, show a one-time toast.
- [ ] **A4.3 — Relaunch test.**
  - Manual: open 4 chat windows on 2 workspaces with different personas, plus the Room app. Quit Waggle. Relaunch. All 5 windows reappear in their last positions with the right personas.
- [ ] **A4.4 — Edge case: boot when the sidecar is still starting.**
  - The window manager can restore layout synchronously, but chat instances need the workspace to exist on the sidecar. If restoration runs before the sidecar is ready, show the windows as "loading" and backfill when the sidecar connects.

### Acceptance criteria (A.4)

1. Close Waggle with 4 windows open across 2 workspaces, each with a different persona.
2. Relaunch. All 4 windows reappear in the same positions, same personas, same workspaces.
3. Chat history is intact in each window (pulled from the session store on the sidecar).
4. If a workspace was deleted between runs, affected windows are dropped quietly with a one-time toast.

---

## 6. Phase A — overall acceptance test (the 30-second demo)

This is the one that ships:

1. Launch Waggle.
2. Open workspace "Product".
3. Press `Cmd+Shift+N`. Pick "Researcher". Ask it to research competitors for the launch.
4. While it runs, press `Cmd+Shift+N` again. Pick "Writer". Ask it to start drafting the launch email.
5. Press `Cmd+R` to open the Room. See both personas live + any sub-agents they spawn.
6. Arrange windows side by side with `Cmd+Shift+3`. (Note: `Cmd+Shift+3` is from the cornerstone's aspiration; if no tile shortcut exists yet, manual drag-to-snap-edge is acceptable for Phase A.)
7. Both agents finish. Memories from both are in the same Workspace Mind (verify in Memory app).
8. Quit Waggle. Relaunch. All windows come back in place, both sessions resumable.

**If all eight steps work, Phase A is done.**

---

## 7. Risks specific to Phase A

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| A-R1 | Orchestrator refactor touches more call sites than expected | Medium | High | Start with Option X; fall back to Option Y if surface >10 call sites. Budget a half-day for the switch. |
| A-R2 | Concurrent SSE streams hit a Fastify-level race (shared response buffer) | Low | High | Concurrency test specifically covers this. If it fails, use separate Fastify request instances (default) — should just work. |
| A-R3 | Tool pool shared between sessions has hidden state (e.g. the cost tracker) | Medium | Medium | Audit each tool for shared state during A1.1. Cost tracker IS shared today — that's probably fine, it's a global counter. Others TBD. |
| A-R4 | Sub-agent events use workspaceId as a grouping key but multiple sessions on one workspace share that | Medium | Medium | Extend the event shape to include `sessionId` as a secondary key. Room canvas filters by `(workspaceId, sessionId)`. |
| A-R5 | Window restoration races the sidecar startup | Medium | Low | Loading state + backfill, as in A4.4. |
| A-R6 | Persona change in one window triggers a re-render in other windows (shared state leak) | Low | Medium | Per-window persona keeps state local. Verify in A.2 acceptance. |
| A-R7 | Tier-gating without Stripe forces us to hard-code "Solo" for all users | High | Low | Fine for Phase A. Stripe integration will set tier later; the cap auto-adjusts. |

---

## 8. Phase A dependencies

```
A.1 (session manager)  ◄─────┐
       │                     │
       ▼                     │
A.2 (per-window persona)     │  (A.3 can start after A.1, in parallel with A.2)
       │                     │
       ├─────────────────────┤
       ▼                     ▼
A.3 (Room canvas)  ◄──── A.2 (persona lands in Room tiles)
       │
       ▼
A.4 (restoration) ◄──── A.2 + A.3 (restore everything, not just chat)
```

- **A.1 blocks everything.** Without per-session backend state, the rest is a UI layer over a broken model.
- **A.2 and A.3 can run in parallel** once A.1 is done — two engineers could pick them up simultaneously.
- **A.4 runs last** — it needs both per-window persona (A.2) and the Room window type (A.3).

---

## 9. Decisions made during execution

### 2026-04-11 — A1.1 complete: **Option Y chosen** (per-session orchestrator instances)

**Evidence gathered:**

Runtime call sites of orchestrator state-holding methods (from `packages/server` only, excluding tests + cli):

| Method | Call sites |
|---|---|
| `orchestrator.buildSystemPrompt()` | `chat.ts:112` |
| `orchestrator.recallMemory()` | `chat.ts:419`, `chat.ts:537`, `commands.ts:40` |
| `orchestrator.autoSaveFromExchange()` | `chat.ts:991`, `ingest.ts:447` |
| `orchestrator.setWorkspaceMind()` | `index.ts:805` |
| `orchestrator.clearWorkspaceMind()` | `index.ts:915` |

Plus: `createMindTools()` inside `Orchestrator` (line 90) captures `getWorkspaceLayers: () => this.workspaceLayers` as a closure. Every mind tool the agent can invoke resolves workspace state through this closure at execution time. This means Option X (stateless orchestrator) would also require refactoring `createMindTools` so each mind tool receives workspace context as an explicit parameter.

**Option X cost estimate:** 15-25 edits across 5-8 files, including an architectural refactor of the tool closure pattern. High blast radius.

**Option Y cost estimate:** ~8 edits across 3 files. Zero orchestrator.ts changes.

**Memory cost of Option Y:** Each extra `Orchestrator` instance holds thin wrappers around SQL prepared statements (IdentityLayer, AwarenessLayer, FrameStore, SessionStore, HybridSearch, KnowledgeGraph, ImprovementSignalStore, CognifyPipeline). Rough total: ~6 KB per instance. For the 3-10 concurrent sessions we're targeting, the memory overhead is 18-60 KB — negligible.

**Architectural fit:** Reading `orchestrator.ts` in full showed the class was designed as an isolated instance. The sharing at the server layer (one shared `orchestrator` passed to every request) was a pragmatic choice that turned into a singleton bug. Option Y reverts to the intended design: **one orchestrator per session**, each pointing at the same shared personal MindDB but holding its own `workspaceLayers`.

**Resolution:** All new `WorkspaceSession` instances get their own `Orchestrator` created via a factory provided at `create()` / `getOrCreate()` time. The shared `server.agentState.orchestrator` continues to exist for non-session call paths (CLI, background jobs, tests) and is marked `@deprecated` when used from new code.

### Revised A.1 task breakdown under Option Y

- [x] **A1.1** — orchestrator.ts read, decision Y recorded (this section).
- [ ] **A1.2** — `workspace-sessions.ts`: add `orchestrator: Orchestrator` field to `WorkspaceSession`, add `orchestratorFactory` parameter to `create()` and `getOrCreate()`, add `setMaxSessions(n)` method, update `close()` to clear the orchestrator reference.
- [ ] **A1.3** — `index.ts`: provide an `orchestratorFactory` helper that creates a new `Orchestrator` for a given workspace mind, wire it through `agentState`. Add `@deprecated` JSDoc + console warning to `activateWorkspaceMind`.
- [ ] **A1.4** — `chat.ts`: replace 4 call sites (`buildSystemPrompt`, `recallMemory` × 2, `autoSaveFromExchange`) with `session.orchestrator.X()`. Remove the `activateWorkspaceMind` call at line 525 (replaced by session creation).
- [ ] **A1.5** — `commands.ts`: replace 1 call site (`recallMemory`) with `session.orchestrator.recallMemory()`.
- [ ] **A1.6** — rolled into A1.3 (deprecation warning on `activateWorkspaceMind`).
- [ ] **A1.7** — `packages/server/tests/concurrent-chat.test.ts`: new concurrency test.
- [ ] **A1.8** — verification: tsc clean on agent + server + web, all tests pass.

**Revised time estimate:** 2-3 days for A.1 (down from 4). Phase A total: **8-10 days** (down from 10-12).

---

## 10. File manifest — what gets touched

### New files
- `apps/web/src/components/os/apps/RoomApp.tsx`
- `apps/web/src/hooks/useRoomState.ts`
- `packages/server/tests/concurrent-chat.test.ts`

### Modified files
- `packages/agent/src/orchestrator.ts` — mind-as-parameter
- `packages/server/src/local/index.ts` — tier-gated max sessions, deprecation warning
- `packages/server/src/local/routes/chat.ts` — sessionManager migration
- `packages/server/src/local/routes/commands.ts` — sessionManager migration
- `packages/server/src/local/workspace-sessions.ts` — `setMaxSessions` method
- `apps/web/src/hooks/useWindowManager.ts` — per-window persona, full state persistence
- `apps/web/src/components/os/apps/ChatWindowInstance.tsx` — read persona from window state
- `apps/web/src/components/os/overlays/PersonaSwitcher.tsx` — operate on focused window
- `apps/web/src/components/os/Desktop.tsx` — Room window dispatch, restoration on mount
- `apps/web/src/components/os/Dock.tsx` — Room icon + badge
- `apps/web/src/lib/adapter.ts` — add optional `persona` in chat body

Estimated LOC delta: **+1200 / -300**.

---

## 11. Out of scope for Phase A

Captured here so it doesn't leak:

- Global filesystem tree (Phase B.1)
- Cross-workspace read (Phase B.2)
- Approvals inbox (Phase B.3, though inline approvals already work)
- Context rail (Phase C.1)
- Global `Cmd+K` (Phase C.2)
- Time travel (Phase C.3)
- Voice (Phase C, optional)
- Parity fixes (Phase D)
- Tauri multi-window (future)
- WaggleDance revival (deferred to Teams tier)

---

**Plan status:** Ready to execute pending user approval. When approved, start at Task A1.1.
