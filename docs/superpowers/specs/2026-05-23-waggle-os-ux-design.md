# Waggle OS — UX Design v1

**Date:** 2026-05-23
**Status:** Brainstorm output. Vision spec. Pick what to ship, defer the rest.
**Anchor metaphor:** Refined Desktop OS (A) with Honeycomb grafts (B) where signal-flow / cells / hive-amber tell the story better than a list or grid.
**Inputs:** existing UI surface (24 apps + 15 overlays in `apps/web/src/components/os/`), Hive DS tokens (`honey #e5a000` / `hive-950 #08090c` / `accent #a78bfa`), 8-cluster brainstorm + metaphor confirmation 2026-05-23.

> Effort tiers used below: **S** = ≤3 days, **M** = ≤2 weeks, **L** = multi-week. Tiers are best-guess and assume one focused engineer + Marko driving design review.

---

## 0. The anchor metaphor (and what it isn't)

Waggle stays a **desktop OS** in chrome: top status bar, bottom dock, free-floating `AppWindow` instances, overlays as modals/sheets. The familiar mental model is preserved (no learning curve) and the existing six months of `Desktop.tsx` / `Dock.tsx` / `AppWindow.tsx` investment is preserved.

The **honeycomb** is grafted in eight specific places — where the visual metaphor tells the story better than its alternative:

| # | Graft | Where it lives | Why hex beats the alternative |
|---|---|---|---|
| 1 | Dock items as hex tiles | `Dock.tsx` | A live "bee tile that glows when an agent is dancing" is the Waggle brand. Drop-in skin. |
| 2 | Status-bar crew presence | `StatusBar.tsx` | Tiny hex avatars showing who's working RIGHT NOW. Click → jump-to-window. |
| 3 | WaggleDance as literal honeycomb | `WaggleDanceApp.tsx` | Signal flow ON THE EDGES is the original honeybee dance — what was the metaphor *for* in the first place. |
| 4 | Mission Control hex grid | `MissionControlApp.tsx` | Agents-as-cells, glow=working, hover=status. Beats a list of "agent #3 / agent #7". |
| 5 | Spawn-agent persona tiles | `SpawnAgentDialog.tsx` / `PersonaSwitcher.tsx` | Persona = a "role-cell." Tile feel works. |
| 6 | MCP catalog as hex grid | `MarketplaceApp.tsx` / `connectors/BrandTile.tsx` | Connectors are nodes in a graph the user is building. Hex grid > rectangular tile grid. |
| 7 | Memory peripheral inspector | New right-rail in `ChatApp.tsx` | Hex mini-graph of what was recalled for this turn. "Why did I get this answer?" answerable at a glance. |
| 8 | Honey-amber "active" accent across the OS | `waggle-theme.css` | Universal: `honey` = live/working, `violet` = memory-touched, neutral = idle. Color semantics unified. |

**Stays as plain Desktop:** free-floating windows (parallelism preserved), `AppWindow` chrome, dialogs as dialogs, settings as a form. The OS does not force-cell everything — it cells the things **about agents and signal**, which is where the metaphor earns rent.

---

## 1. Spatial chrome & window choreography

**Today (in `components/os/`):** `Desktop.tsx` (551 LOC), `Dock.tsx` (170 LOC), `DockTray.tsx`, `AppWindow.tsx`, `BootScreen.tsx`, `StatusBar.tsx`, `WorkspaceBriefing.tsx`, `ContextMenu.tsx`. Free-floating windows with z-order management. Bottom dock with app icons. Top status bar.

**What's missing for "OS-feel":**
- No **snap zones / window tiling** — a real OS lets you halve, quadrant, full-screen via drag or keyboard.
- No **multi-monitor** support (Tauri supports it; the web shell doesn't address it).
- No **focus modes** — "agents working, leave me alone" / "I'm in a presentation" / "deep work" presets that dim/hide ambient surfaces.
- No **virtual desktops** that aren't workspaces — sometimes you want two views of the same workspace (chat + WaggleDance vs Files + Wiki) without swapping context.
- No **ambient "agent is running" peripheral indicator** — the dock bee icon doesn't pulse, the window edge doesn't honey-glow.
- No **OS-level transitions** between scenes (snap, slide, zoom-into-app).

**Recommended adds:**
1. **Hex dock skin** + active-cell honey glow + agent-progress ring around the active tile **[S]**. (Visible foundation for grafts 1+8 above.)
2. **Snap zones** (drag window to screen edge → halve/quadrant) using existing `AppWindow` resize handles **[S]**.
3. **Focus modes** — three presets in `StatusBar` ("Working / Focus / Presenting") that toggle right-rail visibility, dock animation, notification stream **[M]**.
4. **Pulse + glow when an agent in this window is doing work** — animated honey-amber border on `AppWindow`, decay-out when idle **[S]**.
5. **Virtual sub-views per workspace** (later, after cluster 5 — workspaces-as-scenes — lands) **[M]**.
6. **Multi-monitor support** via Tauri window-detach (open a window in a separate Tauri WebView on a second display) **[L]**.

---

## 2. The command surface — the omnibar

**Today:** `GlobalSearch.tsx` overlay + `LauncherApp.tsx`. Search is search-only. Launcher is a tool-launching surface. Neither is a true command palette.

**What's missing:** Marko's OS has 24+ apps, hundreds of memory frames, multiple agents, dozens of skills, and a marketplace. There is no single keystroke that gets you to anything. The most-used surface in any modern OS-of-AI (Raycast, Spotlight, Linear ⌘K) is the **fuzzy-routed omnibar**.

**Recommended:** ship **⌘K Omnibar** as the universal entry point:

| Verb prefix | What it does |
|---|---|
| (no prefix) | Fuzzy search across apps, recent windows, files, memory frames, skills |
| `>` | Run a command (open app, switch workspace, spawn agent, toggle focus mode) |
| `@` | Ask an agent — picks the right persona or routes to the active window's chat |
| `?` | Search memory ("what do I know about X") + inline answer card |
| `#` | Jump to skill / connector |
| `/` | Insert a slash-command into the active chat window |

Implementation moves:
1. **Build the omnibar shell** in `components/os/overlays/Omnibar.tsx`, hotkey `Ctrl/Cmd+K` (free up `GlobalSearch.tsx` for retirement or convert to the `?` namespace inside it) **[S]**.
2. **Wire the verb routers** — start with no-prefix + `>` + `?` (highest leverage), defer `@` / `#` / `/` to Phase 2 **[S]**.
3. **Persistent omnibar pill** in the status bar — always-visible `⌘K · ask anything` — beats a hidden shortcut for discoverability **[S]**.
4. **Fuzzy index** of (apps, workspaces, recent files, top-N memory frames, skills) refreshed on workspace-switch — sub-100ms response **[S/M]**.

---

## 3. Agent visibility & multi-agent choreography

**Today:** `AgentsApp.tsx`, `MissionControlApp.tsx`, `WaggleDanceApp.tsx`, `SpawnAgentDialog.tsx`. You can spawn, see, and run agents. You can observe WaggleDance signals.

**What's missing — the live picture:**
- **No status-bar presence layer.** When 3 agents are working you don't see it from the chrome.
- **No "is my agent stuck?" glance state.** You have to open MissionControl to know.
- **WaggleDance is a list, not a dance.** The literal honeycomb-with-signal-edges is the missing payoff.
- **No interrupt / hand-off / "stop and ask me" model** — agents either run autonomously or you cancel.
- **No agent-to-agent comm visualization.** When the orchestrator delegates to a sub-agent, you have to read logs.

**Recommended adds:**
1. **Status-bar crew presence row** — tiny hex avatars per running agent, honey-glow = working, violet-pulse = waiting on memory, red = stuck/errored. Click → jump-to-window. **[S]**
2. **Convert `MissionControlApp` to hex-grid view** — every running agent is a hex cell; cell color = state; hover = current tool; click = drill in. List view stays as a sub-tab. **[M]**
3. **Make `WaggleDanceApp` an actual honeycomb canvas** with signal-flow on edges (animated path when one agent broadcasts to another). This is where graft #3 finally pays. **[M]**
4. **Interrupt control on every running-agent window** — `Pause / Resume / Ask me / Cancel`. The "Ask me" puts the agent into the Approvals app and shows a notification. **[S]** (already partially wired via Approvals; surface the controls.)
5. **Hand-off UI in chat** — when persona A is wrong for a question, an inline card "Pass to persona B?" with a one-click migrate. **[M]**
6. **Agent-to-agent comm trace** — when a parent spawns a child, draw the edge in WaggleDance and link the windows; child window has a back-arrow to parent. **[S]**

---

## 4. Memory as first-class fabric

**Today:** `MemoryApp.tsx` with five tabs (Wiki / KnowledgeGraph / Harvest / Weaver / Evolution). Memory is **a destination** — you go to the Memory app to look at it.

**What's missing — memory as fabric:**
- **No peripheral memory inspector in chat.** Every chat turn fetches memory; the user can't see what was retrieved.
- **No "what does Waggle know about X" inspector** at the OS level — pin a noun, see the graph.
- **No provenance overlay** — when an agent answers, you can't see which frames backed each claim.
- **No time-travel** — "what did my memory look like last week?" is not a thing.
- **Memory isn't a verb** in the omnibar (cluster 2 fixes this).

**Recommended adds (this is your moat — bias toward shipping):**
1. **Right-rail memory peripheral inspector in `ChatApp`** — hex mini-graph showing which frames were recalled for the current turn, with hover-to-preview. Default-collapsed so it doesn't intrude. **[M]**
2. **Provenance citations in agent answers** — small `[1]` markers in the response, hover = the actual frame. Wire to the existing `KnowledgeGraphViewer`. **[M]**
3. **Memory inspector overlay** — pin a noun anywhere (selection menu → "What does Waggle know about this?") → mini-overlay with related frames + entity + concept. **[M]**
4. **Time-travel slider in MemoryApp** — a horizontal scrubber across the top: "show memory as of 2026-04-15". Backed by `bitemporal validity` already in `knowledge.ts`. **[M]**
5. **"Memory health" tile in Dashboard** — frames added today, stale clusters, dedup opportunities. Already partially in HarvestTab; promote to surface-level. **[S]**

---

## 5. Workspaces as scenes (not folders)

**Today:** `WorkspaceSwitcher.tsx` overlay + `WorkspaceRail.tsx` in `FilesApp`. Workspaces hold files and memory frames. They're filing cabinets.

**What's missing — workspaces as desktops:**
- **No persisted window layout per workspace** — switching workspaces resets the spatial arrangement.
- **No pinned dock per workspace** — same dock everywhere; you can't say "my Research workspace pins Wiki + Memory + Chat, my Founder workspace pins Cockpit + Compliance + Approvals."
- **No assigned crew per workspace** — same personas everywhere; no "this workspace's agents are X, Y, Z."
- **No memory scope per workspace** — you have to manually filter.
- **No autonomy tier per workspace** — Normal/Trusted/YOLO is global, but a "throwaway research" workspace wants YOLO while "production deploy" wants Trusted.

**Recommended adds (this is where workspaces become *scenes*):**
1. **Persist window-arrangement on workspace-switch** — when you leave a workspace, snapshot which apps were open + their positions; restore on return. **[S]**
2. **Per-workspace dock pinning** — workspace config stores `pinnedApps: string[]`; the dock renders the workspace's set first, then the global apps. **[S]**
3. **Workspace crew** — when you spawn an agent in a workspace, it sticks; the workspace stores `crew: AgentDef[]` and surfaces them in MissionControl + the status-bar presence row. **[M]**
4. **Per-workspace memory scope** as the default for in-workspace search (existing search likely supports it; promote to the UX). **[S]**
5. **Per-workspace autonomy tier** — `WorkspaceConfig.autonomy: Normal | Trusted | YOLO`; status-bar shows the active tier with a visible badge. **[S]**
6. **Workspace gallery overview** — when no workspace is active, show a hex grid of workspaces with thumbnails. New users see this; advanced users skip via `Cmd+1..9`. **[M]**

---

## 6. Input modalities & ambient capture

**Today:** `ChatApp` (text) + `VoiceApp` (voice). Both are destinations you go to.

**What's missing — ambient input:**
- **No always-listening hotkey** — hold `Cmd+Space` and talk, release to send. Doesn't require switching to VoiceApp.
- **No drag-anywhere file-routing** — drag a PDF onto the desktop; the OS asks "send to Files / ask agent about it / harvest into memory?"
- **No screenshot-to-agent** — `Cmd+Shift+4`, drag a region, the screenshot lands in the active chat or routes to an agent.
- **No QR pull-in from mobile** — Waggle doesn't have a real mobile companion, but a QR-scan-to-open-on-Waggle-OS pattern is achievable.
- **No "share my screen with my agent"** — for agents that benefit from visual context (UI debugging, design feedback).

**Recommended adds:**
1. **Push-to-talk hotkey** with floating overlay + waveform during capture + auto-route to active window's input or active chat. **[M]**
2. **Drag-to-desktop drop-target** with route picker (Files / Chat / Harvest / Skill). **[M]**
3. **Screenshot-to-agent** via Tauri global shortcut → image lands in active chat as attachment. **[M]**
4. **Mobile QR-handoff** — QR shown in StatusBar, mobile scans, message sent shows up in your active chat (no native app needed; web page + WebSocket). **[L]**
5. **Screen-share to agent** — Tauri can grab a screen region; pipe to a vision-capable model in the active window. Tier-gated (Pro+). **[L]**

---

## 7. Trust, autonomy & approval choreography

**Today:** `ApprovalsApp.tsx`, `VaultApp.tsx`, `CapabilitiesApp.tsx`, three-tier autonomy (`Normal / Trusted / YOLO`). Approvals open as modals. Audit trail is a list.

**What's missing — approvals as peripheral, not modal:**
- **Approvals interrupt your work** — modal blocks the active task instead of queueing peripherally.
- **No autonomy dial visible per agent** — the tier is global; the user can't see "this agent runs Trusted, this one Normal."
- **No "why is this agent doing this?" surface** — when an action surprises the user, there's no one-click "show me the chain of reasoning."
- **Audit trail is a flat log** — should be a scrubable replay (timeline of tool calls + memory hits + outputs).

**Recommended adds:**
1. **Approval inbox in the status bar** — pending approvals = a small honey-amber pip with a count; click expands a popover instead of a modal. Block-mode is opt-in per autonomy tier (YOLO never blocks, Normal blocks on critical only). **[S]**
2. **Autonomy dial visible per agent** in MissionControl + agent window header. Click to change scope (this run / this session / this workspace / global). **[S]**
3. **"Why?" button on every agent action** — opens a side-panel showing the prompt, the tool call, the memory frames retrieved, the reasoning trace. Wire to existing `ExecutionTraces`. **[M]**
4. **Audit replay** in `TimelineApp` — a video-scrubber-style timeline of agent actions; play/pause/seek. Pulls from existing trace store. **[M]**
5. **"This action is the kind of thing this agent does at Trusted tier" hint** — when an action triggers approval, show the autonomy threshold and a one-click "raise this agent to Trusted." **[S]**

---

## 8. Discoverability — the OS teaches you

**Today:** `OnboardingWizard.tsx` (one-shot, 8 steps) + `OnboardingTooltips.tsx` (post-onboarding hints). Both are first-run; they go silent after.

**What's missing — an OS keeps teaching:**
- **No tip-of-the-day surface** — users plateau at the 10 features they discovered week 1.
- **No "did you know your agent can…" prompts** — based on what the user just did.
- **No watching TUTOR persona** — surfaces a capability the user almost discovered but didn't.
- **No skill / connector recommendations** based on usage patterns.
- **No "you haven't tried X in 30 days, here's what's new" reactivation.**

**Recommended adds:**
1. **Tip-of-the-day in the status bar** — small honey-amber pip, click expands. One tip per day, dismissible permanently. Indexed by user action (don't show "spawn an agent" to a user who spawned one 5 minutes ago). **[S]**
2. **Capability recommender after every long-running task** — "this agent ran 12 tools — want me to distil it into a skill?" Already partially exists via D1 distillation; surface the prompt to the user. **[S]**
3. **TUTOR persona** as a 17th persona — read-only, watches recent user actions + memory + workspace state, periodically surfaces "I noticed you searched for X three times — here's a saved search." Off by default; opt-in. **[L]**
4. **Connector / skill recommender in the MarketplaceApp** — based on workspace topic + recent harvest, suggest 3 connectors. **[M]**
5. **Reactivation banner** for stale workspaces ("It's been 30 days since you opened 'Q1 Research' — here's what's changed: 12 new memory frames, 2 closed agents."). **[M]**

---

## 9. Cross-cutting design principles

These tie the 8 clusters together. They are the design language; everything new should obey them.

| Principle | Concrete rule |
|---|---|
| **Color semantics** | `honey #e5a000` = live/working/active; `accent #a78bfa` = memory-touched/recalled; neutral = idle. NO arbitrary color use. |
| **Peripheral-first** | Information about *agents working* / *memory in play* / *signals firing* lives in the right rail or status bar, not in modal interruptions. |
| **Motion = signal** | Animation is reserved for actual signal (agent active, memory hit, hand-off). Static UI = idle UI. No decorative motion. |
| **One omnibar, one entry** | `Cmd+K` is the universal entry point. Every app should be reachable through it. |
| **Hex where it's a signal-node, rectangle where it's content** | Cells of the OS (agents, dock items, personas, connectors) = hex. Content (text, files, dialogs) = rectangle. Never both for the same concept. |
| **Approvals are peripheral by default** | The OS interrupts only at YOLO-violations or user-explicit "approve me when..." rules. |
| **Memory is a verb everywhere** | `?` prefix in omnibar; `What do I know about X` from any selection; provenance on every agent answer. |
| **Workspaces are scenes, not folders** | Every workspace has its own dock, crew, autonomy tier, layout. |

---

## 10. Phased rollout suggestion

The 8 clusters compound. The right order is **the OS-feel pass first** (visible coherence + new omnibar + honeycomb grafts), **agent visibility + memory fabric second** (the differentiation moat), **scenes + ambient + tutor third** (the deepening).

### Phase 1 — The OS-feel pass (2–3 weeks)
Everything **S** that establishes the visual + interaction language:
- Hex dock skin + honey-active accent ⟶ §1.1
- Window snap zones ⟶ §1.2
- Agent-window honey-pulse on active work ⟶ §1.4
- ⌘K Omnibar with no-prefix + `>` + `?` verbs ⟶ §2.1–2.3
- Status-bar crew presence row ⟶ §3.1
- Memory health tile in Dashboard ⟶ §4.5
- Per-workspace dock pinning + autonomy tier ⟶ §5.2 + 5.5
- Tip-of-the-day in status bar ⟶ §8.1
- Approval inbox in status bar ⟶ §7.1
- Autonomy dial per agent ⟶ §7.2

**Outcome:** the OS *feels* like an OS. Differentiation is visible. No new agents, no new pipelines.

### Phase 2 — The differentiation moat (4–6 weeks)
The **M** items that lean into Waggle's unique surface (memory + multi-agent):
- WaggleDance as literal honeycomb canvas ⟶ §3.3
- Mission Control hex-grid view ⟶ §3.2
- Memory peripheral inspector in ChatApp ⟶ §4.1
- Provenance citations in agent answers ⟶ §4.2
- Memory inspector overlay (pin-a-noun) ⟶ §4.3
- Time-travel slider in MemoryApp ⟶ §4.4
- "Why?" button + audit replay ⟶ §7.3 + 7.4
- Hand-off UI in chat ⟶ §3.5
- Workspace crew + memory scope + scene restoration ⟶ §5.1, 5.3, 5.4
- Focus modes ⟶ §1.3

**Outcome:** the OS-of-AI moat is visible — memory as fabric, agents as a coordinated swarm, workspaces as scenes.

### Phase 3 — The deepening (multi-week, prioritize when Phase 2 is in users' hands)
The **L** items:
- Multi-monitor support ⟶ §1.6
- Push-to-talk + drag-to-desktop + screenshot-to-agent ⟶ §6.1–6.3
- Mobile QR-handoff ⟶ §6.4
- Screen-share to agent ⟶ §6.5
- TUTOR persona ⟶ §8.3
- Reactivation banners ⟶ §8.5

---

## 11. Open questions / decisions Marko owns

These are real decisions that affect the build; none have been settled in this brainstorm.

1. **TUTOR persona placement** — is it a 17th persona in `persona-data.ts`, a system service that any persona can speak through, or an explicit `tutor: true` flag on existing personas (so Research Researcher can have a tutor mode)?
2. **Always-listening privacy posture** — push-to-talk only (safe default), or always-listening behind a per-workspace opt-in? Audit/UI implications.
3. **Scene workspaces migration** — do existing workspaces become scenes automatically (lift their last window arrangement) or do users opt-in workspace-by-workspace?
4. **Approval inbox vs modal threshold** — what's the default for Normal tier? Currently inferred: modal on credential-touching + writes-outside-workspace, peripheral on everything else.
5. **Honey-amber agent-active glow intensity** — light pulse OK, but an agent that's been running for 30 minutes shouldn't strobe forever. Decay rule? (Suggestion: glow for first 30s, then steady-amber dot in the window header.)
6. **Free-floating windows vs forced tiling** — Phase 1 ships snap zones; does Phase 2 add a tile-everything mode for users who want it, or stay free-floating?
7. **Right-rail visibility default** — peripheral memory inspector default open or default closed? Opens-on-first-recall might be the right answer.
8. **Mobile companion form-factor** — is it a separate Tauri mobile build, a PWA, or just a web page with WebSocket? (Affects §6.4 effort.)

---

## 12. Implementation notes (deferred — for writing-plans)

Cross-references for the implementation plan author:

- **Dock skin** — `apps/web/src/components/os/Dock.tsx`, `apps/web/src/lib/persona-tier.ts` for tier styling already exists.
- **Omnibar** — net-new file `apps/web/src/components/os/overlays/Omnibar.tsx`; retire or namespace `GlobalSearch.tsx`.
- **Status-bar crew presence** — extend `StatusBar.tsx`; data source = WaggleDance signal bus + running-agent registry.
- **WaggleDance honeycomb** — `apps/web/src/components/os/apps/WaggleDanceApp.tsx`; signal-flow data already streams from the v2 bus (`packages/server/src/local/routes/waggle-dance.ts`).
- **Memory peripheral inspector** — `apps/web/src/components/os/apps/ChatApp.tsx` + memory recall events from `packages/agent/src/orchestrator.ts` `recallMemory()`.
- **Workspace scenes** — `packages/core/src/workspace-config.ts` extends with `pinnedApps`, `crew`, `autonomy`, `lastLayout`.
- **Time-travel slider** — `packages/core/src/mind/knowledge.ts` already has bitemporal validity (`valid_from` / `valid_to`); UI is the missing piece.

Each implementation plan will need its own tsconfig project verification (`packages/agent/tsconfig.json`, `apps/web/tsconfig.json`) and a Vitest pass.

---

## 13. What this design doesn't try to do

- It does not propose a redesign of the **landing page** (`apps/www/`) — explicitly out of scope per the brainstorm.
- It does not change **billing/tiers** — Stripe wiring is settled.
- It does not change **the agent loop** — that's the engine; this is the UI.
- It does not propose **a new design system** — Hive DS stays; honey/violet/hive-950 stay; we just *use them more consistently*.
- It does not propose **mobile-native ports** — §6.4 is a companion, not a port.
- It does not address **the KVARK on-prem enterprise surface** — that's a separate workstream.

---

*End of design doc. Awaiting review.*
