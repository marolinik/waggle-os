# Gap Card — S03 · Win+K Command Center

> Execution model is the LOCKED **in-place incremental refactor** of `apps/web` + targeted
> backend extensions. Mockup (`Waggle_OS_Handoff_Assets/screen_03_win_k_command_center.png`) is
> DIRECTIONAL only; PRD §12.3 acceptance criteria win. Every claim below is grounded in a real file.

---

## 1. Screen & purpose

The universal command layer — opens from anywhere with Win+K / Cmd+K — for **search, launch,
create, run, navigate, and extend** across every major object type. PRD §12.3 (lines 449-482),
blueprint screen 3 (`_blueprint_extracted.txt:284-290, 633, 679`). It is the product's "primary
interaction" per blueprint line 19 ("Primary interaction: Win+K") and the IA spine item #3
(PRD line 19). Goal: "No user needs to know where a feature lives to use it" (PRD line 482).

The mockup shows a centered modal titled "What do you want to do?" with: a search input
("Search anything…"), pill tabs (Show my tasks / Open … STM Strategy / Find market analysis /
Summarize…), five category columns — **Launch · Create · Run · Navigate** plus a Search bucket —
each listing object/action rows, a "Suggested for you" card strip (review reports, draft proposals),
and a footer "Type a natural-language command…". A second "Open in new window" affordance is top-right.

---

## 2. Required states (PRD/Blueprint)

PRD §12.3 functional requirements (lines 461-467):
- Opens from anywhere via Win+K / Cmd+K.
- Searches across **workspaces, memory, artifacts, sessions, people, agents, skills, commands, connectors, MCPs**.
- Category sections: **Search, Launch, Create, Run, Navigate, Extend**.
- Supports **natural-language command input**.
- Displays **recent and suggested** actions.
- **Permission-gated actions show an approval prompt before execution.**
- Reachable by both mouse and keyboard.

PRD §12.3 states (lines 469-477) + blueprint (`:289-290`):
Idle · Query active · Grouped results · No results · Permission prompt · Command success · Command failure.

Acceptance (lines 479-482): every major object and action is reachable; no user needs to know where a feature lives.

---

## 3. Current state in repo

**Disposition: `rework`** (keep the proven overlay shell + keyboard nav + adapter calls; restructure
categories to Search/Launch/Create/Run/Navigate/Extend; add execute + permission-prompt + recent/suggested;
back it with the net-new `/api/command/*` provider).

- **`apps/web/src/components/os/overlays/GlobalSearch.tsx`** (362 lines) — the existing Win+K/Cmd+K
  overlay. Today it does **client-side federated search only** across 5 categories
  (`SearchCategory = 'command' | 'workspace' | 'memory' | 'session' | 'skill'`, line 15):
  - `command` = a **hardcoded static `COMMANDS` array** of 23 app ids (lines 40-64) that must be
    hand-kept in sync with `appConfig` in `Desktop.tsx` (the file's own comment flags this drift as
    "the cause of FR #13", lines 33-39).
  - `workspace`/`session`/`skill` pre-fetched on open via `adapter.getWorkspaces()`,
    `adapter.getSessions(ws.id)` (first 5 ws × 3 sessions, lines 98-127), `adapter.getSkills()` (lines 129-138).
  - `memory` = debounced (300 ms, min 2 chars) server call `adapter.searchMemory(query, globalScope?'global')`
    (lines 142-168) — the **only** server-backed category.
  - Matching is client-side `fuzzyMatch` (`lib/fuzzy-match`, line 11/177-187); keyboard nav (↑/↓/Enter/Esc),
    selection clamp, scroll-into-view all already work (lines 224-239).
  - There is **no execute path** — every Enter calls `onNavigate(category, id)` (lines 231-235, 320),
    i.e. it only *opens a window*. No Create/Run/Extend, no recent, no suggested, no permission prompt.
- **`Desktop.tsx` wiring** — `<GlobalSearch open onClose onNavigate={handleSearchNavigate} />` (`:464`),
  toggled by `ov.toggleGlobalSearch` (Ctrl/Cmd+K via `useKeyboardShortcuts`, `:207`) and the StatusBar
  search button (`:424`). `handleSearchNavigate` (`Desktop.tsx:217-225`) handles only `command`→`wm.openApp`,
  `workspace`→`selectWorkspace`+`openChatForWorkspace`, `memory`→`openApp('memory')`. **No `session`/`skill`
  navigation, no execute.**
- **`apps/web/src/components/os/overlays/KeyboardShortcutsHelp.tsx`** (92 lines) — static cheat-sheet
  modal (`shortcuts` array, lines 9-32). Lists "⌘K → Global Search" (line 21). **Disposition `keep`** —
  it is the separate `Cmd+?` help overlay, not the command center; only update its label if Win+K is
  rebranded "Command Center".
- **`adapter.executeCommand(command, workspaceId)`** (`lib/adapter.ts:1345-1350`) → `POST /api/commands/execute`
  (note **plural** `commands`). Runs **slash commands only** (`/catchup`, `/status`, `/memory`, `/skills`);
  workflow/spawn commands return "not available" (`packages/server/src/local/routes/commands.ts:1-87`).
  Exists but is **not** the generic palette execute.
- **`adapter.searchSessions`** (`adapter.ts:424-427`), `adapter.searchMemory` (`:476-487`) exist and are
  reusable as federation inputs. `lib/suggested-actions.ts` is **chat-message-scoped** (extracts follow-up
  chips from the last assistant message) — NOT command-palette suggestions; do not reuse for §12.3 "suggested".

---

## 4. Frontend work

**Rework `GlobalSearch.tsx` → `CommandCenter.tsx`** (rename or keep filename; founder-directional).
Reuse 100% of the modal chrome, framer-motion animation, debounce, keyboard-nav, selection/scroll logic.

Concrete changes:
- **Expand `SearchCategory`** to the PRD §12.3 verbs: add `'create'`, `'run'`, `'navigate'`, `'extend'`
  alongside `'search'` (today's `command/workspace/memory/session/skill` become **Search/Navigate** result
  feeds). Category headers + ordering (`CATEGORY_LABELS`/`CATEGORY_ORDER`, lines 67-75) extend accordingly —
  this matches the mockup's Launch/Create/Run/Navigate columns.
- **Replace client federation with a server provider.** Swap the multi-call client logic (lines 91-168)
  for a single debounced `adapter.commandSearch(q, { scope })` → `GET /api/command/search?q=` (net-new
  adapter method on `lib/adapter.ts`, the one contract surface). Keep the existing per-category calls only
  as offline/fallback. Eliminates the hardcoded `COMMANDS`-vs-`appConfig` drift (FR #13).
- **Add an execute path.** New `onExecute(commandId|nlInput)` → `adapter.commandExecute()` →
  `POST /api/command/execute`. On Enter for a Run/Create/Extend item (vs Navigate items which keep calling
  `onNavigate`). Render the §12.3 **permission prompt** state inline before executing gated actions
  (reuse the approvals pattern — `useChat().pendingApproval`/`approveAction` and `ApprovalRequest` type,
  `lib/types.ts`), plus **command success / command failure** toasts (`hooks/use-toast`).
- **Recent + Suggested.** On idle (empty query), render two strips matching the mockup: "Recent" from
  `adapter.commandRecent()` → `GET /api/command/recent`, and "Suggested for you" from
  `adapter.commandSuggestions()` → `GET /api/command/suggestions`.
- **Natural-language input** (PRD line 464): when the query doesn't match a structured result, surface a
  "Run as command: '<query>'" row that posts the raw string to execute.
- **New adapter methods** (4): `commandSearch`, `commandExecute`, `commandRecent`, `commandSuggestions`.
- **State**: keep local `query/selected/sections`; add `recent`, `suggested`, `pendingPermission`,
  `executing` states. Props: extend `GlobalSearchProps` (line 27) with `onExecute` and a workspace-id
  for execute scoping. New optional hook `useCommandCenter()` (wraps the 4 adapter calls + debounce) is the
  clean home for the provider, mirroring the existing domain-hook pattern.

---

## 5. Backend work (PRD §16.3)

All four are MISSING from the sidecar (grep-confirmed in `backend-routes.md:448-451`; `/api/command/*` =
0 matches in `packages/server/src/local/routes/*.ts`). None needs a new data store — all federate over
existing substrate, consistent with the in-place model.

| PRD §16.3 endpoint | Status | Plan |
|---|---|---|
| `GET /api/command/search?q=` | **MISSING** | **NET-NEW** route file `packages/server/src/local/routes/command.ts`. Federates over existing reads: workspaces (`WorkspaceManager.list()`), memory (`MindDB` full-text, reuse `memory.ts` search), sessions (reuse `sessions.ts` `/sessions/search`), skills (`skills.ts`), connectors (`connectors.ts`), MCPs (from `capabilities/status` `mcpServers[]` + `@waggle/shared` `mcp-catalog.ts`), agents/personas (`personas.ts`+`agent-groups.ts`), and the app/command catalog (extract from a shared catalog to kill the `COMMANDS` drift). Substrate touched: read-only across `memory_frames`, sessions JSONL, install-audit/marketplace, workspace configs. **No `.mind` migration.** |
| `POST /api/command/execute` | **PARTIAL** | EXTEND, do **not** duplicate. `POST /api/commands/execute` (plural, `commands.ts`) already runs slash commands with a real `CommandContext`. Either (a) add a singular `/api/command/execute` alias that broadens the context to also dispatch Navigate/Create/Run/Extend intents (open app, create object, fleet-spawn, install), or (b) widen the existing plural route. Reuses `commandRegistry.execute`, `fleet/spawn`, `marketplace/install`. Substrate: same as the underlying action; add an **install-audit** write for gated executes (`InstallAuditStore.record`, `core/install-audit.ts`). **No migration.** |
| `GET /api/command/recent` | **MISSING** | **NET-NEW** (or derive client-side). Cheapest server path: record executed commands to `ai_interactions` / a small recents list and read back; or derive from session/event history (`events.ts`). Substrate: `ai_interactions` table (read) — no schema change required. |
| `GET /api/command/suggestions` | **MISSING** | **NET-NEW**. Reuse the **workspace-state next-actions** seed: `deriveNextActions` in `packages/server/src/local/workspace-state.ts:182-218` + `buildWorkspaceNowBlock` (`workspace-context.ts`) give cross-workspace suggestion candidates; `skills.ts` `/skills/suggestions` is the skill-domain analog to fold in. Substrate: read-only over memory/awareness/cron. **No migration.** |

Permission gating: the execute route should run gated actions through the existing approval/SecurityGate
path so the FE permission-prompt state has a real backend (reuse `approval.ts` + marketplace SecurityGate).

---

## 6. Shared types needed (PRD §15 vs lib/types.ts)

PRD §15 defines no dedicated Command type, but the palette needs a result/command union. Add to
`apps/web/src/lib/types.ts` (and mirror server-side in the route):
- `CommandResult { id; kind: 'search'|'launch'|'create'|'run'|'navigate'|'extend'; objectType: 'workspace'|'memory'|'artifact'|'session'|'person'|'agent'|'skill'|'connector'|'mcp'|'command'|'app'; title; subtitle?; icon?; score; requiresApproval?: boolean; payload? }` — supersedes the local `SearchResult` interface (`GlobalSearch.tsx:17-25`).
- `CommandExecuteRequest`/`CommandExecuteResult` (success/failure + optional permission descriptor).
- Reuse existing `ApprovalRequest` (`lib/types.ts`) for the permission-prompt state rather than inventing a new one.
- The `objectType` union overlaps PRD §15.2's missing unions (`ArtifactKind`, `AgentType`) and the absent
  Artifact entity (substrate-types §e) — Artifact/Agent results are blocked until those screens land (see §7).

---

## 7. Dependencies (screens/phases first)

- **PRD Sprint 3 = Command Center** (PRD lines 1321-1326: indexed search provider, result groups,
  command execution, recent/suggested) — this card IS Sprint 3. Depends on **Sprint 1 (Shell + Win+K**,
  blueprint `:582`) being the home of the command provider.
- **Search breadth is gated by other screens' substrate.** "artifacts" and "agents/people" facets need:
  Artifacts (S05, PRD §16.6 — entirely net-new, substrate-types §e: no Artifact entity exists) and
  Agents (S09, PRD §16.7 — sidecar agent CRUD MISSING). Ship Command Center with the **available** facets
  (workspaces/memory/sessions/skills/commands/connectors/MCPs) and add artifact/agent facets when those
  screens land. Do not block the whole screen on them.
- Execute's Create/Run/Extend intents lean on existing fleet-spawn / marketplace-install / cron — already present.

---

## 8. Effort

**L.** The FE overlay is largely reusable (shell, keyboard nav, debounce all done — that caps it below XL),
but the work spans: 4 net-new/extended backend routes federating across ~8 substrates, an execute +
permission-prompt path with audit writes, recent/suggested providers, a shared `CommandResult` type, and
killing the `COMMANDS`/`appConfig` drift — full-stack across multiple existing route files.

---

## 9. Open questions

1. **Route naming:** add singular `/api/command/*` (PRD-literal) as the new surface, or rename the existing
   plural `/api/commands/execute`? Plural is already referenced by `adapter.executeCommand` + `commands.ts`.
   Recommend: new singular `command.ts` + alias execute to the existing registry to avoid a breaking rename.
2. **"Open in new window"** affordance in the mockup (top-right) — is the Command Center expected to also
   open as a persistent windowed app (an `AppId`), or is it modal-only? Affects whether it needs an
   `appConfig`/dock entry vs staying an overlay.
3. **Suggested/recent scope:** cross-workspace blended, or scoped to the active workspace? PRD says
   "recent and suggested" without scope; `deriveNextActions` is per-workspace today.
4. **Natural-language commands** (PRD line 464): heuristic intent-parse (cheap, deterministic) vs an LLM
   round-trip? The existing `commands.ts` is registry-keyed; NL needs an intent resolver — confirm budget.
5. **Permission prompt reuse:** is the chat approvals pipeline (`approval.ts` + `useChat.pendingApproval`)
   the intended mechanism for palette-initiated gated actions, or a lighter inline confirm?
6. The `COMMANDS`-vs-`appConfig` drift (FR #13) — confirm the shared app-catalog refactor is in-scope here
   vs a separate cleanup (it is the right place to consolidate `AppId` and retire stale `AppView`).
