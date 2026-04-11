# Waggle OS — Cornerstone

**Date:** 2026-04-11
**Status:** LIVING DOCUMENT — the single source of truth for what Waggle OS is today and what we're building next.
**Reading time:** 25 minutes. Written for a non-coder product owner and any engineer who joins the project.

> If this document conflicts with `CLAUDE.md`, `CLAUDE.md` wins for operating rules.
> This document wins for *product state* and *build plan*.

---

## 0. How to read this

1. **Part 1** — what Waggle OS is, in one page, for anyone.
2. **Part 2** — the architecture, four layers, non-coder language.
3. **Part 3** — what we found during the audit: current state per subsystem.
4. **Part 4** — the gap between today and the killer story.
5. **Part 5** — the four-phase build plan.
6. **Part 6** — decision gates.
7. **Appendix** — file references, for the engineer executing the plan.

Non-coders: read Parts 1, 2, 4, 5, 6. Skip Parts 3 and Appendix unless curious.

---

## 1. What Waggle OS is

**Waggle OS is a desktop-native AI workspace with persistent memory and multi-agent parallelism.** It ships as a single Tauri binary for Windows and macOS. Inside that binary lives a full React-based "desktop OS" — draggable windows, a dock, a status bar, and eighteen apps you can launch.

**The product thesis** is that knowledge workers don't need a better chatbot. They need a **place to work alongside AI** — a space where the AI remembers every decision across sessions, where multiple specialist personas can work in parallel on the same material, and where the user's own files and workspaces are treated as first-class citizens, not abstractions.

**The business** is a 4-tier SaaS funnel — Solo (free) → Basic ($15/mo) → Teams ($79/mo) → **KVARK Enterprise** (sovereign on-prem, €1.2M already contracted) — where Waggle generates demand and KVARK monetizes it.

**The existing moat** is memory. Every other AI product is about to claim memory in the next 12 months, so the new moat has to be something structurally harder to copy: **"workspace-native multi-agent with persistent memory."**

---

## 2. Architecture map

Four layers, stacked:

```
┌─────────────────────────────────────────────────────────────────┐
│                    1. DESKTOP SHELL (Tauri)                     │
│              single native window, ~120 MB binary               │
└─────────────────────────────────────────────────────────────────┘
                              │ hosts
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│             2. REACT "DESKTOP OS" (apps/web)                    │
│  window manager + dock + 18 apps (chat, memory, cockpit, ...)   │
└─────────────────────────────────────────────────────────────────┘
                              │ talks to localhost:3333 via HTTP + SSE
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│            3. SIDECAR (Node.js + Fastify)                       │
│           122 routes · agent runtime · tool execution           │
└─────────────────────────────────────────────────────────────────┘
                              │ uses
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│            4. CORE (packages/core — TypeScript)                 │
│  MultiMind · FrameStore · KnowledgeGraph · FileStore · Harvest  │
│        each workspace = its own SQLite .mind file               │
└─────────────────────────────────────────────────────────────────┘
```

### What runs where

- **Tauri shell** is the binary. Its only job is to open a single native window and launch the sidecar.
- **React desktop OS** runs inside that window. It's a full SPA with a simulated desktop — drag, resize, snap, minimize, dock, status bar, 18 apps. To the user, it *feels* like macOS inside a single window.
- **Sidecar** is a Node.js Fastify server running on `localhost:3333`, bundled into the Tauri resources. It exposes 122 HTTP routes plus SSE streams for chat, notifications, and events. The React app only ever talks to this sidecar.
- **Core** is a TypeScript library package used by the sidecar. It handles SQLite, vector search, knowledge graph, file storage, memory harvest, compliance, and audit. No HTTP — pure functions and classes.

### What's in each package

```
packages/
├── core/            the memory + file + compliance engine
├── agent/           agent loop, personas, tools, sub-agents, behavioral-spec
├── server/          the Fastify sidecar (routes, SSE, session management)
├── shared/          types + constants + MCP catalog (148 connectors)
├── waggle-dance/    multi-agent protocol (team-scoped, not wired locally — see §3.6)
├── sdk/             client SDK scaffolding
└── ui/              (probably) shared UI primitives

apps/
├── web/             the React desktop OS
└── www/             the public landing page

app/
└── src-tauri/       the Tauri shell (Rust)
```

---

## 3. Current state — what we found

> This section captures the result of a full-codebase audit on 2026-04-11, running four parallel exploration agents. Everything in this section is anchored to a real file and verified. Claims that *surprised* us get flagged with 💡.

### 3.1 The React desktop OS is much more capable than we thought 💡

- There is a **full synthetic window manager** already built: `apps/web/src/hooks/useWindowManager.ts`. It supports drag, resize, 8-directional resize handles, snap-to-edge (left/right/top) with a preview overlay, cascade positioning, z-order management, minimize/maximize/restore, and keyboard shortcuts (`Ctrl+\`` to cycle, `Escape` to close focused). Window positions are persisted to `localStorage` per appId.
- **Multiple chat windows on the same workspace already work.** `useWindowManager.openChatForWorkspace()` can be called repeatedly and each call creates a new window with a unique `instanceId`.
- **Eighteen apps already exist** in `apps/web/src/components/os/apps/`: Chat, Dashboard, Settings, Vault, UserProfile, Files, Memory, Events, Agents, Cockpit, MissionControl, Capabilities, WaggleDance, ScheduledJobs, Marketplace, Connectors, Voice, BootScreen.
- The app's top-level state lives in plain React hooks — `useWorkspaces`, `useSessions`, `useWindowManager`, `useChat`, `useOnboarding`. No Redux, no Zustand.
- The Tauri shell is **single-window**. All the desktop-OS feel is React DOM inside that one Tauri webview. Tauri multi-window is NOT used today.

**What this means for Phase A (The Room):** we do NOT need to build a window manager. We already have one, and it's good. The real work is at the state layer — persona is currently scoped to the workspace, not to the window. We have to move it.

### 3.2 The backend has a single-workspace blocker 🔴

- `packages/server/src/local/index.ts` declares a Fastify decorator with a field `activeWorkspaceId: string | null`. **Only one workspace can be "active" at a time.**
- When a chat call arrives for workspace B while workspace A is mid-flight, A gets deactivated and its orchestrator state is replaced with B's. Any in-progress agent loop for A will silently corrupt.
- There is no mutex, queue, or per-workspace execution context guarding against this.
- A better class called `WorkspaceSessionManager` exists at `packages/server/src/local/workspace-sessions.ts`. It holds a per-workspace mind + tools + abort controller, up to 3 concurrent sessions. **It is fully written and never used.** The chat route (`routes/chat.ts`) still uses the old `activeWorkspaceId` pattern.

**This is the #1 blocker for Phase A.** Everything else in Phase A is downstream of this refactor.

### 3.3 Write approvals already exist 💡

- `packages/agent/src/confirmation.ts` has a function `needsConfirmation(toolName, args)` that gates the following tools: `write_file`, `edit_file`, `generate_docx`, `git_commit`, `git_push`, `git_pr`, `git_merge`, `install_capability`.
- Bash commands are analyzed for destructive patterns (`rm -rf`, `del`, `taskkill`, force pushes, etc.).
- Connector actions matching `_(create|update|delete|send|post|...)_` are gated.
- The chat route emits a `'pre:tool-use'` hook event that creates a pending approval record and blocks execution until the user responds via `/api/approval/{requestId}`.
- **There is no dedicated UI for approval requests today.** The chat view handles inline approvals when they arrive, but there is no approvals inbox, no "always allow" learning, no per-workspace autonomy setting.

**What this means for Phase B:** we don't have to invent a trust model. We have to **surface and extend** the one that exists.

### 3.4 Sub-agent status flows over a separate SSE stream

- `packages/agent/src/subagent-orchestrator.ts` implements a dependency-ordered workflow runner with `'worker:status'` events.
- These events are relayed through the server's EventEmitter into `/api/notifications/stream` by the `emitSubagentStatus` helper in `packages/server/src/local/index.ts` (around line 780).
- The frontend `ChatApp` does consume `/api/notifications/stream` for notification badges, but there is **no "Room view"** — no canvas of visible sub-agent tiles showing what each specialist is working on.

**What this means for Phase A:** the plumbing is there. The Room view is a new frontend component, not a server refactor.

### 3.5 Memory is strictly partitioned per workspace 🔴

- `packages/core/src/multi-mind.ts` holds exactly **one personal mind + one workspace mind at a time**. To read a second workspace, you have to call `switchWorkspace()` which closes the first.
- There is **no `searchAllWorkspaces` API**. Full stop. The knowledge graph, frame store, file store — all are strictly workspace-local.
- Workspaces live on disk at `~/.waggle/workspaces/{id}/` with `workspace.json`, `workspace.mind` (SQLite), `sessions/`, and `files/` subdirectories. **The structure is enumerable** — we can list all workspaces from the filesystem.
- FileStore (`packages/core/src/file-store.ts`) has three implementations: `LocalFileStore` (virtual, under `~/.waggle/workspaces/{id}/files/`), `LinkedDirStore` (reads/writes an external directory), and `S3FileStore` (team deployments). All are workspace-scoped. All have path-traversal protection.

**What this means for Phase B:** cross-workspace read access is a **core-layer refactor**, not just a UI change. We need either (a) a `MultiMindCache` that holds open handles to multiple workspaces simultaneously, or (b) a "read-only browse" API that opens and closes minds on demand without closing the active one.

### 3.6 WaggleDance is NOT alive in local mode 🔴

- `packages/waggle-dance/` contains a protocol validator and a dispatcher with handlers for task delegation, knowledge check, skill share, skill request. It is **pure protocol + dispatch**, no LLM, no external calls.
- It is imported by `packages/server/src/routes/messages.ts` (the cloud server, not the local sidecar) and `packages/worker/src/handlers/waggle-handler.ts`. **The local sidecar does not import it.**
- The `WaggleDanceApp.tsx` frontend app that exists is a signaling placeholder — it does not talk to the local sidecar because there's nothing to talk to.

**What this means:** when we said "agents talking to each other as agreed with WaggleDance", the protocol exists on paper but the local runtime doesn't use it. For Phase A we will build direct multi-agent support in the sidecar first, and bring WaggleDance online later as the team-tier upgrade (it was always meant to be team-scoped anyway).

### 3.7 Backend/frontend parity — two thirds of the backend has no UI 🔴

The audit counted **122 backend routes**, **80+ agent tools**, and **18 frontend apps**. Of the 122 routes, **about 66% have no user-visible surface**. This is the single biggest reason the product feels half-finished.

**Important correction to the audit:** three of the gaps the audit flagged are actually fixed already (Harvest UI, Compliance dashboard, Knowledge Graph viewer) — we polished them yesterday. The exploration agent didn't find them because they live in sub-folders (`apps/web/src/components/os/apps/memory/HarvestTab.tsx`, `apps/web/src/components/os/apps/cockpit/ComplianceDashboard.tsx`). So the real gap list is slightly smaller.

**The top 10 genuine backend-only features that users can't reach today:**

| # | Feature | What it does | User impact |
|---|---|---|---|
| 1 | **Backup / restore** | Point-in-time snapshots of workspaces, scheduled backups | Disaster recovery, enterprise trust |
| 2 | **Telemetry dashboard** | Token burn, cost trajectory, tool utilization heatmap | Cost optimization, enterprise sale |
| 3 | **Install / plugin audit trail** | Who installed what, when, outcome | Compliance, security troubleshooting |
| 4 | **Offline queue** | Queued actions when offline, auto-sync | Mobile + unreliable network scenarios |
| 5 | **Weaver status** | Memory consolidation progress, health score | Debug poor recall, tune distillation |
| 6 | **Import / export / harvest** | Bulk migration between workspaces and servers | Onboarding, migration, backup-to-file |
| 7 | **Team governance permissions** | Fine-grained per-member RBAC | Enterprise / Teams tier |
| 8 | **LiteLLM dashboard** | Model router, provider switching, price table | Cost optimization |
| 9 | **Knowledge graph visual (global)** | Graph UI spanning all workspaces | Understanding what Waggle knows |
| 10 | **Approval inbox** | List all pending approvals across sessions | Trust gate for autonomous use |

**Also: six cases where the frontend calls a backend route that does not exist** (silent failures at runtime). The adapter calls `/api/skills/create`, `/api/notifications/history`, `/api/fleet/spawn`, `/api/chat/history?session=X` — none exist. `renameSession` uses the wrong path. These are small bugs to mop up in Phase D.

---

## 4. The gap between today and the killer story

**Killer story restated:** *Waggle OS is the first AI workspace where agents actually live. You don't chat with one assistant — you run a room of specialists, watch them work on your real files, and keep the memory forever.*

The audit shows we already have **most of the infrastructure**. The gaps are smaller than expected. In priority order:

### Gap 1 — "Run a room of specialists" is blocked by one backend variable

We have a window manager. We have multiple chat instances per workspace. We have a sub-agent orchestrator. We have a fully-written `WorkspaceSessionManager` sitting unused. **The only thing preventing Phase A is wiring that class into the chat route and moving persona from workspace-scope to window-scope.** This is a 2-day refactor, not a 3-week rewrite.

### Gap 2 — "On your real files" is blocked by workspace isolation

Every workspace is a sealed SQLite file + its own directory. There is no global file tree view. There is no cross-workspace read. `LinkedDirStore` already exists so mapping workspaces to real filesystem folders is straightforward, but the *global tree* is new work.

### Gap 3 — Write approvals exist but have no interface

The gate fires, creates a pending record, and blocks the tool. Today's UX is "hope the chat panel picks it up." There is no inbox, no per-path "always allow," no autonomy-level setting. **This is a quick UX win — maybe 3 days including the settings UI.**

### Gap 4 — Sub-agents are invisible

`/api/notifications/stream` emits sub-agent status events. No component renders them as a canvas. The Room view is new, but it consumes existing events.

### Gap 5 — The hidden two-thirds

Most of the top 10 hidden features in §3.7 are a single component each. Phase D is basically a sprint of quick wins, each adding a card or a panel to an existing app.

---

## 5. The four-phase build plan

Decisions from the user: all four phases in scope, in order A → B → C → D. Sequenced so each phase produces a **shippable user-visible win** without blocking the next.

### Phase A — **"The Room"** (multi-window multi-persona + sub-agent visibility)

**Goal:** In 30 seconds of use, the user can open two windows on the same workspace, each running a different persona, chatting simultaneously, and watching sub-agents work in a shared room canvas. This is the killer demo.

**Sub-phase A.1 — Backend session manager wiring** *(~2 days)*
- Replace the `activeWorkspaceId` singleton in `routes/chat.ts` with the existing `WorkspaceSessionManager`.
- Every chat call resolves to a session held in the manager, keyed by `(workspaceId, sessionId)`.
- Each session owns its own `MindDB` handle, tool pool, and abort controller.
- Concurrency cap: 3 sessions per workspace by default (tier-gated later).
- Write a concurrency test: two simultaneous chat calls on the same workspace must not corrupt each other's state.
- Deliverable: **the backend stops being the blocker.**

**Sub-phase A.2 — Per-window persona state** *(~2 days)*
- Move `persona` out of the workspace object and into `WindowState` (the thing `useWindowManager` tracks per open window).
- Update `PersonaSwitcher` to operate on the focused window, not the active workspace.
- Update `ChatWindowInstance` to read its persona from its own window state.
- Update the title bar + dock to show `{workspace}:{persona}` for every open chat window so the user can see at a glance what's what.
- Deliverable: **open 4 chat windows on one workspace, each a different persona.**

**Sub-phase A.3 — The Room canvas** *(~3 days)*
- New app: `RoomApp.tsx` — a canvas view of every spawned sub-agent in the current workspace session.
- Each sub-agent renders as a tile with persona icon, current tool call, status, mini-transcript.
- Consumes `/api/notifications/stream`, filters for `subagent_status` events, groups by parent session.
- Tiles are draggable, collapsible, clickable-to-focus.
- Dock button + keyboard shortcut (`Cmd+R`) to open the Room.
- Deliverable: **the user literally watches their team of specialists work.**

**Sub-phase A.4 — Window restoration** *(~1 day)*
- Persist the full window list (not just positions) to `localStorage` or a sidecar endpoint.
- On app start, recreate every open window with its last persona, workspace, session, and position.
- Deliverable: **relaunching Waggle feels like resuming work, not rebooting.**

**Phase A total:** roughly 8 working days for one engineer. Ship as a single polished release.

**Phase A acceptance test** — the 30-second moment:
1. Launch Waggle.
2. Open workspace "Product".
3. Press `Cmd+Shift+N`. Pick "Researcher". Ask it to research competitors for the launch.
4. While it runs, press `Cmd+Shift+N` again. Pick "Writer". Ask it to start drafting the launch email.
5. Press `Cmd+R` to open the Room. See both personas live + any sub-agents they spawn.
6. Arrange windows side by side with `Cmd+Shift+3`.
7. Both agents finish. Memories from both are in the same Workspace Mind.

**If all seven steps work end to end, Phase A is done.**

---

### Phase B — **"Real Filesystem"** (global tree + cross-workspace read + write approvals UI)

**Goal:** Waggle feels native, not abstracted. The user sees every workspace as a folder, can drag files between them, and agents need explicit permission before writing anything for the first time on a new path.

**Sub-phase B.1 — Global workspace tree** *(~3 days)*
- New left-rail component in `FilesApp`: a tree view of every workspace on disk, each workspace expandable into its file list.
- Backed by a new sidecar route `GET /api/fs/tree` that enumerates `~/.waggle/workspaces/{id}/files/` for every workspace and returns a normalized tree.
- Drag-drop a file between workspace folders = file copy + import into the target workspace.
- Active workspace highlighted, others browsable.
- Deliverable: **one glance, all workspaces, all files.**

**Sub-phase B.2 — Cross-workspace read access** *(~4 days)*
- Core-layer: add `MultiMindCache` that holds up to N open workspace mind handles simultaneously without closing the active one.
- New agent tool: `read_other_workspace(workspace_id, query)` — searches memory in another workspace, returns summaries + frame references.
- New agent tool: `list_workspace_files(workspace_id, path?)` — read-only file listing for another workspace.
- Permission gate: when tool is first called on a new target workspace, raise a user approval ("Workspace Product agent wants to read Workspace Marketing. Allow / Always / Deny").
- Deliverable: **agents can discover what they know in other workspaces, with the user's explicit consent.**

**Sub-phase B.3 — Approvals inbox** *(~3 days)*
- New app: `ApprovalsApp.tsx` — a list of all pending approval requests, grouped by session.
- Each request shows: tool, target, reason, diff preview (for write/edit), buttons: **Allow once / Always for this path / Always for this tool / Deny**.
- "Always" decisions persisted to `personal.mind` as per-workspace or per-path rules.
- New per-persona setting in Cockpit: *Paranoid / Normal / Trusted* — controls how chatty the gate is.
- Audit log of every approval decision surfaced in Cockpit.
- Deliverable: **trust builds silently as the user works.**

**Sub-phase B.4 — Surface the existing approval events in chat** *(~1 day)*
- Today the chat panel consumes pre-tool-use events but the UX is basic. Polish it.
- Inline approval cards with clear action buttons, collapsible, keyboard-accessible.
- Deliverable: **approvals feel smooth in chat, not jarring.**

**Phase B total:** roughly 11 working days.

**Phase B acceptance test:**
1. Open the Files app. See every workspace as a folder, expandable.
2. Drag `project-spec.md` from workspace A into workspace B. Confirm. File lands in B.
3. In workspace A chat, ask "what did we decide in workspace B about pricing?"
4. Agent calls `read_other_workspace('B', 'pricing')` → approval modal.
5. Click "Always allow A → B". Result flows back inline with a citation.
6. Ask agent to write a new file. Approval card appears in chat. Click "Always for this path". Write succeeds.
7. Open the Approvals app. See the entire history of decisions, filterable by session, tool, target.

---

### Phase C — **"Presence"** (context rail + global Cmd+K + time travel)

**Goal:** The user *feels* that Waggle is present with them — not a chatbot they visit, but an ambient layer that anticipates and remembers.

**Sub-phase C.1 — Context rail** *(~3 days)*
- A new right-rail panel that any app can trigger via a shared `<ContextRail>` component.
- When the user clicks a file, a memory frame, a knowledge graph entity, or a chat message, the rail opens and shows **every memory, decision, and prior conversation touching that item** — pulled from the active workspace's knowledge graph and frame store.
- Zero keystrokes. One click = full context.
- Deliverable: **the "how did you know that?" moment where memory becomes colleague.**

**Sub-phase C.2 — Global Cmd+K** *(~2 days)*
- Replace the existing search boxes with a single command palette bound to `Cmd+K` (or `Ctrl+K` on Windows).
- Searches across: all workspaces, personal mind, knowledge graph entities, open sessions, file paths, installed skills, installed connectors.
- Each hit shows a workspace-colored badge so source is obvious.
- Filter pills to narrow, but the default is global.
- Deliverable: **"where did I put that" stops being a question.**

**Sub-phase C.3 — Time travel** *(~3 days)*
- Per-workspace view: "What changed since ___". Selector: last session / last week / since project start.
- Shows a git-log-style timeline of decisions, files created/modified, agents run, memories saved.
- Enterprise buyers will cite this in procurement.
- Deliverable: **auditable work history without needing a logs UI.**

**Phase C total:** roughly 8 working days.

---

### Phase D — **"Parity"** (surface the hidden two-thirds)

**Goal:** No more "we built it but nobody can find it." Close the frontend gap on the highest-impact hidden features.

**Sub-phase D.1 — High-priority feature surfaces** *(~8 days, parallelizable)*

For each, a single card or small app that wires to the existing backend:

1. **BackupApp** — backup history, restore selector, auto-backup toggle. *(~1 day)*
2. **TelemetryApp** — token burn, cost trajectory, tool utilization heatmap. *(~1.5 days)*
3. **OfflineIndicator** — status bar badge + expandable "pending sync" panel. *(~0.5 day)*
4. **WeaverPanel** — add to Memory app: distillation progress, next run, memory health score. *(~0.5 day)*
5. **Harvest source manager** — the Harvest UI already exists; extend it to show all registered sources with pause/resume/remove actions. *(~1 day)*
6. **LiteLLM panel** — model router + price table in Settings. *(~1 day)*
7. **Install audit trail** — add to Skills app: install history with trust source and outcome. *(~0.5 day)*
8. **Approvals inbox** — already built in Phase B.3. *(already done)*
9. **Global knowledge graph** — extend KG viewer with workspace filter + cross-workspace mode. *(~1 day)*
10. **Team governance matrix** — placeholder card for Teams tier; full build in a later milestone. *(~0.5 day)*

**Sub-phase D.2 — Fix the dead frontend calls** *(~1 day)*
- `createSkill`, `getNotificationHistory`, `spawnAgent`, `clearHistory`, `renameSession`: either add the missing routes or remove the dead adapter calls. No silent failures in the adapter.

**Phase D total:** roughly 9 working days.

**Phase D acceptance test:** every high-value backend capability has at least a read-only UI surface. The product stops feeling half-finished.

---

### Total timeline

| Phase | Days | What ships |
|---|---|---|
| A — The Room | ~8 | Multi-window multi-persona + sub-agent canvas. The signature feature. |
| B — Real Filesystem | ~11 | Global tree, cross-workspace read, approval inbox. Native-app feel + trust. |
| C — Presence | ~8 | Context rail, global Cmd+K, time travel. Emotional hit. |
| D — Parity | ~9 | 10 hidden features surfaced, 6 dead calls fixed. Product feels finished. |
| **Total** | **~36 working days** | **Full killer-story implementation.** |

At one engineer, 36 working days is roughly **7 weeks**. At two engineers working in parallel where possible, roughly **4-5 weeks**. If Stripe billing runs on the same track and the M2 compliance work finishes concurrently, **late May 2026** is a realistic ship target for a "this is different" public demo.

---

## 6. Decision gates

The user has pre-approved: run the audit, build A → B → C → D, all in scope. These are the decisions still open:

### D1 — Phase A concurrency cap

`WorkspaceSessionManager` currently defaults to 3 concurrent sessions per workspace. Do we keep that, raise it, or tier-gate it?

- **Option A:** 3 for Solo, 5 for Basic, 10 for Teams, unlimited for Enterprise. *(Recommended — mirrors the tier value story.)*
- **Option B:** Flat 5 for everyone, tier-gating can come later.

### D2 — Where Room view lives

The Room canvas — is it a dedicated app launched from the Dock, a split-panel inside Chat, or an optional overlay anywhere?

- **Option A:** Dedicated `RoomApp` launched from the Dock with `Cmd+R`. *(Recommended — most discoverable.)*
- **Option B:** Split-panel inside Chat that the user toggles.
- **Option C:** Overlay anywhere (like Cmd+K) — too invisible, not recommended.

### D3 — Cross-workspace read consent model

How should the user consent to agent-A reading workspace-B for the first time?

- **Option A:** One-time approval modal, choices are `Always / Once / Deny`. *(Recommended — matches existing approval gate style.)*
- **Option B:** Global toggle in Settings: "Allow cross-workspace reads."
- **Option C:** Explicit pairing: the user goes to Settings, manually lists which workspaces can read which. Most secure, highest friction.

### D4 — Parity sprint ordering

Phase D has 10 feature surfaces. Do we ship them all as one sprint, or drip them into Phases A/B/C where they're thematically adjacent (e.g. Approvals inbox goes in B, Telemetry goes in D)?

- **Option A:** Keep D as a single sprint at the end. Predictable, clean. *(Recommended.)*
- **Option B:** Drip them. Harder to track, but each earlier phase feels more complete.

### D5 — Voice

`VoiceApp.tsx` is a 403-byte stub. Do we build it in Phase C (Presence) or defer to a later milestone?

- **Option A:** Build basic voice input in Phase C. Dictation while looking elsewhere is a big knowledge-worker win. *(Recommended — low effort, high emotional return.)*
- **Option B:** Defer until after the killer story ships.

### D6 — WaggleDance revival

The WaggleDance protocol exists but is team-scoped and not wired locally. Do we revive it as an optional "multi-agent messaging" feature in Phase A, or leave it dormant until Teams tier is live?

- **Option A:** Leave dormant. Phase A uses direct sub-agent orchestration. WaggleDance wakes up when Teams ships. *(Recommended — avoids scope creep.)*
- **Option B:** Wire a minimal version in Phase A so the `WaggleDanceApp` stops being a placeholder.

---

## 7. Risks and open questions

**R1 — The WorkspaceSessionManager refactor could cascade.** The `activeWorkspaceId` singleton might be referenced by more than just the chat route. Any route that assumes "there is a current workspace" needs to be audited and migrated. Estimated scope: low, but needs verification before starting Phase A.1.

**R2 — Persona-on-window breaks some backend assumptions.** The agent loop currently gets persona from the workspace record. When persona moves to window state, the loop needs to receive it as a request parameter. Minor change, but the backend assumes one persona per workspace in a few places.

**R3 — Cross-workspace reads are a privacy surface.** Even with approval gates, the UX has to clearly show which workspaces have been granted access and make revocation trivial. Otherwise Teams and Enterprise buyers will block on it.

**R4 — The Room canvas can get noisy.** If a user has 3 chat windows each with 4 sub-agents, that's 12 tiles. We need collapse/group-by-parent behavior from day one.

**R5 — We haven't touched the M2 Stripe work yet.** Phase A ships autonomously but can't become a paid upgrade without Stripe. The two tracks need to finish in the same release window.

**R6 — Tauri multi-window is unused.** All of Phase A lives inside a single Tauri window. That's fine for the demo but means no "float window on secondary monitor" for now. Tauri multi-window is a future upgrade, out of scope.

**R7 — Tests.** The polish items we shipped in the prior session had minimal test coverage. Phase A's concurrency refactor *must* land with tests or it will regress silently. CLAUDE.md §7.2 demands tsc-clean + tests passing before completion — we hold the line.

---

## Appendix — key file references

### Frontend shell
- `apps/web/src/App.tsx` — top-level router
- `apps/web/src/components/os/Desktop.tsx` — desktop OS shell, window dispatcher
- `apps/web/src/hooks/useWindowManager.ts` — the synthetic window manager
- `apps/web/src/components/os/AppWindow.tsx` — drag/resize/snap window frame
- `apps/web/src/components/os/Dock.tsx` — bottom dock
- `apps/web/src/components/os/overlays/PersonaSwitcher.tsx` — persona picker (workspace-scoped today, will move to window-scoped)
- `apps/web/src/components/os/apps/ChatApp.tsx` / `ChatWindowInstance.tsx` — chat view + per-instance state
- `apps/web/src/components/os/apps/memory/HarvestTab.tsx` — exists, polished 2026-04-11
- `apps/web/src/components/os/apps/memory/KnowledgeGraphViewer.tsx` — exists, polished 2026-04-11
- `apps/web/src/components/os/apps/cockpit/ComplianceDashboard.tsx` — exists, polished 2026-04-11
- `apps/web/src/lib/adapter.ts` — the HTTP client hitting the sidecar
- `apps/web/src/hooks/useWorkspaces.ts` — `activeWorkspaceId` lives here (will need splitting)
- `apps/web/src/hooks/useSessions.ts` — per-workspace session list
- `apps/web/src/hooks/useChat.ts` — per-window chat state

### Tauri shell
- `app/src-tauri/tauri.conf.json` — single-window declaration
- `app/src-tauri/src/lib.rs` — single-instance plugin, tray handling

### Backend sidecar
- `packages/server/src/local/index.ts` — sidecar entry; `activeWorkspaceId` decorator around line 173
- `packages/server/src/local/routes/chat.ts` — chat route, still using legacy singleton
- `packages/server/src/local/workspace-sessions.ts` — **`WorkspaceSessionManager`**, written but unused, the key to Phase A.1
- `packages/server/src/local/routes/harvest.ts` — harvest route, fixed 2026-04-11
- `packages/server/src/local/routes/compliance.ts` — compliance route
- `packages/server/src/local/routes/notifications.ts` — SSE stream for sub-agent status

### Agent runtime
- `packages/agent/src/agent-loop.ts` — per-message agent runtime
- `packages/agent/src/subagent-orchestrator.ts` — `'worker:status'` events
- `packages/agent/src/confirmation.ts` — `needsConfirmation()` + `ALWAYS_CONFIRM` set; the existing approval gate
- `packages/agent/src/behavioral-spec.ts` — the rulebook (v3.0)
- `packages/agent/src/tool-filter.ts` — per-context tool allowlists
- `packages/agent/src/connector-search.ts` — `find_connector` tool (148 MCPs)
- `packages/agent/src/system-tools.ts` — `write_file`, `edit_file`, `bash`

### Core memory + file
- `packages/core/src/multi-mind.ts` — **`MultiMind`**, holds 1 personal + 1 workspace. Needs a `MultiMindCache` sibling for Phase B.2.
- `packages/core/src/mind/frames.ts` — frame store (findDuplicate fixed 2026-04-11)
- `packages/core/src/mind/sessions.ts` — `SessionStore.ensure()` (added 2026-04-11)
- `packages/core/src/mind/schema.ts` — the SQLite schema
- `packages/core/src/workspace-config.ts` — workspace directory layout, enumeration via `WorkspaceManager.list()`
- `packages/core/src/file-store.ts` — `FileStore`, `LocalFileStore`, `LinkedDirStore`, `S3FileStore` (all workspace-scoped)
- `packages/core/src/compliance/status-checker.ts` — `ComplianceStatusChecker`
- `packages/core/src/compliance/report-generator.ts` — `ReportGenerator`

### Shared
- `packages/shared/src/mcp-catalog.ts` — 148-entry MCP connector catalog (moved 2026-04-10)
- `packages/shared/src/types.ts` — `User`, `Team`, `AgentDef`, `Task`, `WaggleMessage`
- `packages/shared/src/constants.ts` — team/task constants

### WaggleDance (dormant locally)
- `packages/waggle-dance/src/protocol.ts` — message type-subtype validator
- `packages/waggle-dance/src/dispatcher.ts` — handler dispatch
- `packages/waggle-dance/src/hive-query.ts` — team-scoped query types

---

**End of cornerstone. Revisions to this document are as welcome as revisions to CLAUDE.md — if current state changes, update this doc before writing new code.**
