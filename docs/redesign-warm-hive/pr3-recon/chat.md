# PR3 Recon — SCREEN 02 · Chat (ship Variation B "Split work canvas")

Branch: `feature/warm-hive-redesign`. Maps the **current Chat/agent-runtime** implementation
in `apps/web` against `docs/design_handoff_waggle_app/SCREENS.md` §02 + `design-files/screens/chat.html`.

**Headline:** the conversation surface, activity stream (steps), tool cards, approval card, model
pill, persona pill, composer, artifact card, and provenance primitive **all already exist** and are
functional. The **right work-canvas (Variation B's ~42% live-drafting side panel) does NOT exist** —
it must be built. There is also **no provenance pill inside the activity stream**, and the agent's
streamed "thinking" steps render as a **flat inline list, not the design's collapsible Activity
card with `⬡ provenance` pills**. The visual styling is current "Hive DS" (primary/secondary/muted,
emerald/amber/sky/violet) — it needs the warm-token migration but the structure is mostly there.

---

## 1. Current structure (with line refs)

### Component tree
```
ChatHost.tsx                      keep-alive portal host: 1 ChatWindowInstance per visited workspace
  └ ChatHostInstance              portals into per-workspace container; composes title bar
      └ ChatWindowInstance.tsx    data wiring: useChat + useSessions + model/team fetch
          └ ChatApp.tsx           ALL of the chat UI (793 lines) — single big component
              ├ <header> (chat-header)       persona pill · Memory chip · storage/team chips · autonomy · model pill
              ├ Agent Profile panel (collapsible)
              ├ Pins bar
              ├ <div scrollRef> thread        messages.map → bubbles
              │   └ BlockRenderer (per assistant msg with blocks)
              │       ├ TextBlock / StepBlock / ToolUseBlock / ArtifactBlock / ModelSwitchBlock
              │   └ ToolCard (legacy tools[] path)
              │   └ FeedbackButtons · suggested-action chips
              │   └ ApprovalGate (pendingApproval)
              └ composer (textarea + slash menu + attach + send)
```

### Key file:line anchors
- **ChatHost.tsx** — keep-alive via React portals. `ChatSlot` (`:85`) is the seam node
  `WorkspaceRoute` passes into `WorkspaceDesktopApp`'s `chatSlot` prop. `ChatHostInstance` (`:96`)
  portals `<ChatWindowInstance>` into a stable per-workspace `<div>` (`getChatContainer` `:57`), kept
  alive (hidden, not unmounted) so in-flight SSE survives navigation. **The split canvas must live
  INSIDE this kept-alive subtree** (either in ChatApp or a wrapper it renders), or the canvas state
  is lost on navigation. ChatHost itself only does title + keep-alive; it is NOT the place to add a
  sibling canvas pane.
- **ChatWindowInstance.tsx** — thin data layer. `FALLBACK_MODELS` (`:14`); calls `useChat` (`:98`)
  and `useSessions` (`:97`); fetches model list/current-model with a 20s retry loop (`:126–211`);
  `handleModelChange` (`:213`). Passes ~20 props straight into `ChatApp` (`:221`).
- **ChatApp.tsx** — the entire rendered surface:
  - Header bar: `:746` (`data-testid="chat-header"`). Persona picker `:765`; **Memory chip** `:815`
    (always-visible trust signal, `Brain` icon); storage badge `:829`; team presence `:843`;
    overflow `⋯` menu in compact mode `:867`; **AutonomyToggle** `:920`; **model picker** `:931`.
  - `ToolCard` (`:99`) — legacy `msg.tools[]` render path (only used when a msg has no `blocks`).
  - `ApprovalGate` (`:223`) — the inline approval card with RiskBadge + Allow once / Always allow /
    Deny / Show details.
  - `AutonomyToggle` (`:339`) — Ask first / Trusted / Autopilot chip + TTL dropdown.
  - Thread render `:1050–1191`; per-message bubble `:1093`; `BlockRenderer` invocation `:1115`;
    plain-content fallback `:1121`; suggested-action chips `:1160`.
  - Composer `:1194–1236`; slash menu `:1195`; textarea `:1219` ("Message Waggle... (/ for commands)").
  - `WorkspaceBriefing` empty-state `:1051` (renders when `messages.length === 0`).
- **chat-blocks/** (the progressive-disclosure renderers):
  - `BlockRenderer.tsx` — switch over block.type; routes completed file-writes to `ArtifactBlock`
    (`:34`), else `ToolUseBlock`.
  - `StepBlock.tsx` — a single agent "thinking" step: spinner/check + description. **Flat inline
    row — NOT wrapped in a collapsible Activity card and has NO provenance pill.**
  - `ToolUseBlock.tsx` — collapsible tool row (status icon + name + input summary + duration + raw
    JSON on expand).
  - `ArtifactBlock.tsx` — the Cowork "artifact card": icon + filename + "Created/Updated by the
    agent" + **Open in Files** (stashes deep-link + fires `waggle:open-app`). `isArtifactBlock` (`:21`).
  - `ModelSwitchBlock.tsx` — fallback-model banner.
- **chat-header-layout.ts** — pure `shouldCollapseChatHeader(width)` decision (threshold 480px,
  `:16`); `CHAT_HEADER_OVERFLOW_CONTROLS` / `CHAT_HEADER_PRIMARY_CONTROLS` classify which chips fold.

### Container / layout the canvas must slot into
`WorkspaceDesktopApp.tsx:841` — `{/* Body: main canvas + right context panel */}` is a
`flex-1 flex overflow-hidden` row. The chat tab renders `chatSlot ?? <placeholder>` at `:882–902`
inside `<main className="flex-1 min-w-0 overflow-auto">`. The chat slot is given the full main
column. **The split canvas should be implemented as a horizontal flex INSIDE ChatApp's own root
`<div className="flex h-full relative">` (`:697`)** — append the canvas `<aside>` as a sibling of
the existing chat `<div className="flex flex-col flex-1 min-w-0">` (`:744`). That keeps it within
the kept-alive portal subtree and reuses ChatApp's existing flex root.

---

## 2. Data contract — how streamed turns / activity / artifacts arrive

### Source of truth: `useChat.ts` (apps/web/src/hooks/useChat.ts)
- Returns `{ messages, isLoading, sendMessage, clearHistory, pendingApproval, approveAction }` (`:325`).
- `sendMessage` (`:93`) appends a user `ChatMessage` then an empty assistant `ChatMessage`
  (`blocks: []`), then **iterates `adapter.sendMessage(...)` as an async generator of `StreamEvent`**
  (`:125`), reducing each event into the LAST assistant message's `blocks[]` immutably (`:130–262`).
- **StreamEvent types** (`lib/types.ts:616`): `'token' | 'step' | 'tool_start' | 'tool_end' | 'done'
  | 'error' | 'approval_request' | 'approval_required' | 'model_switch' | 'notification'`.
  Adapter maps SSE event names to these in `adapter.ts:722–731` (`tool`→`tool_start`,
  `tool_result`→`tool_end`, etc.).
- **Event → block reduction** (`useChat.ts`):
  - `token` (`:141`) → appends/extends the trailing `TextContentBlock`.
  - `step` (`:152`) → marks prior running steps done, pushes a new `StepContentBlock{status:'running'}`.
    **This is the "activity/thinking" stream — currently a flat sequence of StepBlocks, not grouped.**
  - `tool_start` (`:167`) → pushes a `ToolUseContentBlock{status:'running'}` AND mirrors into legacy
    `tools[]`.
  - `tool_end` (`:183`) → flips the matching tool block to `done` with `result`/`duration`.
  - `model_switch` (`:214`) → `ModelSwitchContentBlock`.
  - `error` (`:225`) → `ErrorContentBlock`.
  - `done` (`:231`) → marks all running blocks done; appends final text if none present.
  - `approval_request` / `approval_required` (`:248`) → `setPendingApproval(data)` — does NOT mutate
    blocks; surfaced as a single `pendingApproval` slot (one at a time).
- `content` is kept in sync via `flattenBlocks` (`:45`) for copy/pins/search.
- **History load**: `getHistory(workspaceId, sessionId)` → `ensureBlocks` backfills `blocks[]` for
  legacy messages (`:14`, `:83–91`).
- **Adapter wire**: `adapter.sendMessage` (`adapter.ts:686`) POSTs `/api/chat` with
  `{workspaceId, message, sessionId, persona, autonomy, shape}` and parses SSE lines into StreamEvents.

### ContentBlock shapes (`lib/types.ts:461–503`)
`TextContentBlock{type,blockId,content}` · `StepContentBlock{type,blockId,description,status}` ·
`ToolUseContentBlock{type,id,name,input?,status,result?,duration?}` ·
`ModelSwitchContentBlock{type,blockId,from,to,reason}` · `ErrorContentBlock{type,blockId,message}`.
`ChatMessage{id,role,content,blocks?,timestamp,tools?,feedback?,pinned?,persona?}` (`:366`).
`ApprovalRequest{requestId,toolName,description,input,riskLevel?,approvalClass?,trustSource?,
explanation?,...}` (`:387`).

### Artifacts — how they arrive
There is **no dedicated artifact/canvas stream channel.** An "artifact" today is derived purely from
a completed `write_file`/`edit_file`/`file_write` tool block (`ArtifactBlock.isArtifactBlock` `:21`)
and rendered as an inline card. The design's **live-drafting `teardown.md` canvas has no backing
data source** — the streamed events carry no document body, only the tool's `input.path` + opaque
`result` string. **Building the canvas means either** (a) deriving its content from the most recent
file-write tool block's `input.content`/`result`, or (b) adding a new stream channel /
artifact-fetch. This is the single biggest data gap (see §5).

### Provenance data
The activity steps from the server are plain text descriptions — **the SSE `step` payload carries no
structured `source`/`provenance` field.** The design's `⬡ mem://hive · provenance kept` pill has no
backing data today; it would need either a richer `step` payload or a client-side heuristic. A reusable
provenance UI primitive already exists: `components/ui/evidence-chip.tsx` (`EvidenceChip`).

---

## 3. Test contract (must not break)

### `apps/web/src/test/chat-artifact-block.test.tsx`
- `BlockRenderer` renders `chat-artifact-block` for a completed `write_file` with a path; shows the
  basename and "Created by the agent".
- `edit_file` → "Updated by the agent".
- running/error file-writes keep the generic tool row (NOT an artifact card).
- `isArtifactBlock`: false for non-file tools / missing path; true for a done write_file.
- **Open in Files** stashes the path deep-link and fires `waggle:open-app` with `appId:'files'`.
- **Contract for PR3:** keep `data-testid="chat-artifact-block"` + `chat-artifact-open`, the
  Created/Updated copy, and the `isArtifactBlock` routing predicate intact. The canvas is ADDITIVE —
  the inline artifact card stays.

### `apps/web/src/test/p1a-chat-state.test.tsx`
- `useChatWidgetState` persistence (persona, autonomy TTL + 10s auto-revert, P4 defaultAutonomy
  inheritance) under `waggle-chat-state-v1`.
- `seedChat`/`takeChatSeed` one-shot semantics; `composeChatTitle` formatting.
- **WorkspaceDesktopApp two-seam edit (§5.2):** seam (a) controlled `activeTab` + `onTabChange`
  (test IDs `ws-tab-chat`, `ws-tab-tasks`, `ws-tasks-tab`); **seam (b) the chat tab renders the
  provided `chatSlot` instead of the placeholder** (test IDs `chat-slot-stub`, and asserts
  `ws-chat-tab-open` is absent when a slot is given).
- **Contract for PR3:** the `chatSlot` seam + `activeTab`/`onTabChange` props are load-bearing — the
  split canvas must NOT change `WorkspaceDesktopApp`'s public chatSlot contract; it lives inside the
  slot's subtree (ChatApp), not as a new prop on the desktop.

### Other related tests (grep before editing)
`chat-blocks/TextBlock.test.tsx`; `context-rail-fetch.test.ts` (the `onContextRail` double-click path
in ChatApp `:1095`); header-layout behavior is pinned via `chat-header-layout.ts` consumers.

---

## 4. Design spec — Variation B, with exact copy

### Context header (replaces current `chat-header` styling)
- `wmark` hex "C" (honey gradient) + workspace name **"Competitive Intelligence"** + mono sub
  **"workspace · 142 memories · 9 sources"**.
- **Model pill** (right): pill, `--surface` bg, `--line` border, healthy live dot, title
  "Waggle picked the model — click to override", text **"Model: auto · Claude Sonnet"** (`b` on
  "auto"). → maps to current model picker (`ChatApp.tsx:931`) but restyled as a pill with a live dot
  and the "auto ·" prefix.
- **Memory icon button** (right) — `iconbtn`, brain glyph, title "Memory & context". → current Memory
  chip (`:815`) becomes this icon button.

### Thread (max-width 760px; **narrows to ~620px when canvas open**)
- **User message:** `--surface` bubble, **asymmetric radius `4px 14px 14px 14px`**, 15.5px/1.55.
  (Current user bubble is `bg-primary rounded-xl` `:1108` — needs warm surface + asymmetric radius.)
- **Bot message:** hex "W" avatar (honey gradient); meta line **"Waggle · Analyst · Claude Sonnet"**
  (`who` `b` on "Waggle"). Prose 15.5px/1.62; bullet lists use honey `◆` markers.
- **Activity stream card (the "magic"):** collapsible, `--bg-2` bg, `--line-soft` border, radius
  `--r`. Header: violet **spark** icon + **"Worked across memory, web & files · 6 steps · 38s"**
  + chevron (rotates 90° when open). **Default-open on the active turn.** Each step row (`.astep`):
  colored dot + text + optional **provenance pill** — mono, `--intel` color, `--intel-wash` bg,
  format **`⬡ mem://hive · provenance kept`**. Exact step copy from chat.html:
  - (intel dot) "Recalled **6 memories** from your hive — last quarter's landscape, the Mem0
    teardown, your pricing notes." → prov `⬡ mem://hive · provenance kept`
  - (web/cyan dot) "Searched **9 competitor sites** for pricing & positioning `(mem0, letta,
    langmem, notion…)`"
  - (work/blue dot) "Compared against your **last teardown** — flagged 3 changes since March."
  - (healthy dot) "Drafted **teardown.md** — exec summary, landscape table, opening."
- **Bot prose after activity:** "Done. Here's the shape of it — full draft is in **teardown.md**."
  + 3 honey-bullet items + "Want me to turn the opening into a one-page brief for the board, or
  export the table to the pricing sheet?"
- **Approval card** (`--honey-wash` bg, `--attention` border, warning icon):
  - Title: **"Approve before I leave your machine"**
  - Body: "This step writes to an external system — `Salesforce › Q2 Pricing` (mono). Everything
    else stayed local. I'll export the 9-row table and nothing else."
  - Actions: **"Approve & export"** (honey) / **"Not now"** (ghost).
  - → maps to current `ApprovalGate` (`:223`) — restyle to honey-wash; keep RiskBadge + the
    Always-allow gating logic.

### Composer
- Rounded box, `--surface`, `:focus-within` → `--honey-line` + `--honey-glow`. Textarea placeholder
  **"Reply, or ask Waggle to take the next step…"**. Tool chips row: **Attach** / **Persona: Analyst**
  / **Tools**; spacer; mono hint **"⏎ send · ⌘K commands"**; honey send button (`↑`, 40px).
  → current composer (`:1194`) restyle; placeholder + hint copy change; persona/tools become chips.

### Variation B — right work canvas (~42% width)
- `<aside class="canvas">` `--bg-2`, `--line-soft` left border, `width:42%` (transition .25s).
- Canvas head: title **"teardown.md"** + healthy mono tag **"● live draft"** + an "Open in
  Artifacts" icon button (external-link glyph).
- Canvas body = `.doc`: H1 **"Q2 Competitive Teardown"**; mono docsub **"draft · 9 competitors ·
  updated just now by Waggle"**; honey mono H2 section labels ("Executive summary", "Landscape");
  a landscape `<table>` (Player / Memory / Local-first: Mem0 Cloud No · Letta Agent-centric Partial
  · LangMem Toy-tier No · Notion AI Doc-scoped No); a trailing paragraph with a **blinking honey
  type-cursor** (`▍`, `@keyframes bl` 1s steps(2)).
- Responsive: `@media (max-width:820px)` hides the canvas (chat goes full width).

### Interactions
- Clicking an activity header toggles its steps (current StepBlocks have no grouping/toggle — new).
- Canvas type-cursor blinks on the live draft.

---

## 5. Gap table (current → design)

| # | Area | Current | Design (Variation B) | Gap / action |
|---|------|---------|----------------------|--------------|
| 1 | **Right work canvas** | **Does not exist** anywhere (`grep canvas` → only WorkspaceDesktopApp layout comments + an unrelated KG viz). Chat is single-pane. | ~42% live-drafting `teardown.md` aside with header, doc body, blinking honey cursor; thread narrows to 620px when open. | **BUILD NEW.** New `<ChatWorkCanvas>` aside as sibling of ChatApp's chat column (`:744`). Needs open/close state + a data source for the doc body (none exists — see #2). |
| 2 | **Canvas content source** | No artifact body in the stream — only tool `input.path` + opaque `result`. | Live document with sections/table that updates as the agent drafts. | **DATA GAP.** Derive from latest file-write tool block's `input.content`/`result`, OR add a stream channel / artifact fetch. Simplest PR3: show the last completed artifact's rendered content; "live drafting" cursor is cosmetic. |
| 3 | **Activity stream grouping** | Flat `StepBlock` rows inline (`StepBlock.tsx`), no card, no toggle, no header summary. | Collapsible Activity card with violet spark + "Worked across … · N steps · Ns" header + chevron; default-open on active turn. | **BUILD.** New `ActivityCard` that groups consecutive `step` (and tool) blocks; BlockRenderer must collapse a run of steps into one card. Derive "N steps · Ns" from the grouped blocks. |
| 4 | **Provenance pill in steps** | None (SSE `step` carries no source field). `EvidenceChip` primitive exists but unused in chat. | `⬡ mem://hive · provenance kept` mono `--intel` pill per step. | **DATA + UI GAP.** No backing data. PR3 can render the pill only when a step/tool exposes a source; otherwise omit (don't fabricate). Reuse `EvidenceChip` styled to `--intel`/`--intel-wash`. |
| 5 | **Model pill** | Picker button: `Cpu` icon + raw model string + chevron (`:931`). | Pill w/ healthy live dot + "Model: auto · Claude Sonnet"; honey-line hover. | **RESTYLE.** No "auto" sentinel surfaced today; show "auto ·" when model is the default/unset, plus a live dot. |
| 6 | **User bubble radius/color** | `bg-primary text-primary-foreground rounded-xl` (`:1108`). | `--surface` bubble, asymmetric `4px 14px 14px 14px`. | **RESTYLE** to warm surface + asymmetric radius. |
| 7 | **Bot meta line** | Avatar + Sparkles prefix; no "Waggle · Analyst · Claude Sonnet" meta row. | hex W avatar + meta "Waggle · Analyst · Claude Sonnet". | **ADD** meta row above bot prose (persona name + model). |
| 8 | **Approval card** | `ApprovalGate` honey/amber-ish, RiskBadge, Allow once/Always allow/Deny/Show details (`:223`). | honey-wash card, "Approve before I leave your machine", "Approve & export"/"Not now". | **RESTYLE + copy.** Keep RiskBadge + Always-allow gating; warm tokens; external-write framing copy. |
| 9 | **Composer copy + chips** | placeholder "Message Waggle... (/ for commands)"; Paperclip + Send only; no persona/tools chips, no "⏎ send · ⌘K" hint. | placeholder "Reply, or ask Waggle…"; Attach/Persona/Tools chips + mono "⏎ send · ⌘K commands" hint; honey ↑ send. | **RESTYLE + ADD** chips row + hint; new copy. |
| 10 | **Header sub / context** | persona pill + Memory chip + storage/team chips + autonomy + model (no "142 memories · 9 sources" sub, no workspace hex). | hex avatar + name + mono "workspace · 142 memories · 9 sources" + model pill + memory icon. | **RESTYLE.** Add hex avatar + memory/sources sub (data from workspace context). Autonomy/storage/team chips not in design header — relocate or drop into ⌘K/overflow. |
| 11 | **Warm tokens** | Hive DS classes (`bg-primary`, `text-emerald-400`, `bg-secondary`, `border-border`, etc.). | Warm graphite/paper tokens (`--surface`, `--honey`, `--intel`, `--bg-2`, `--line-soft`). | **MIGRATE** color classes to the PR1 warm tokens (already in `index.css`). |
| 12 | **Activity default-open on active turn** | StepBlocks always visible (no collapse). | Activity card default-open on the active turn, collapsed on prior turns. | **BEHAVIOR.** Track which turn is active; collapse historical activity cards. |

**Not gaps (already correct / reusable):** SSE streaming + block reduction (`useChat`), tool cards,
artifact card + Open-in-Files, feedback buttons, slash menu, pins, persona picker, autonomy toggle,
keep-alive across navigation, the `chatSlot` seam, `EvidenceChip` provenance primitive, warm tokens
in `index.css`.

---

## 6. Reuse + build

### Reuse as-is
- **`useChat.ts`** — the entire stream/reduction contract is design-compatible. The Activity card +
  canvas are pure RENDER concerns over the existing `blocks[]`; no hook change required for a basic
  build (canvas content derivation may want a small selector helper).
- **`ChatHost.tsx` keep-alive + `ChatSlot` seam** — unchanged. Canvas state lives inside the
  kept-alive ChatApp subtree, so it survives navigation for free.
- **`ArtifactBlock.tsx`** — keep the inline card AND reuse its `iconFor`/`isArtifactBlock`/path logic
  to feed the canvas (open the latest artifact in the canvas instead of/in addition to "Open in Files").
- **`EvidenceChip`** (`components/ui/evidence-chip.tsx`) — base for the `⬡ provenance` pill (restyle
  to `--intel`).
- **`ApprovalGate`** + `RiskBadge` + `canAlwaysAllow` — keep logic, restyle to honey-wash.
- **`AutonomyToggle`**, slash menu, pins, `FeedbackButtons`, `WorkspaceBriefing` — keep.
- **`chat-header-layout.ts`** — keep the overflow decision (chips not in the design header fold here).

### Build new
- **`ChatWorkCanvas` aside** — append as a sibling of ChatApp's chat column inside ChatApp root
  (`ChatApp.tsx:697` flex root; chat column `:744`). Props: `open`, `artifact` (path + body), `onClose`.
  Width 42%; thread column `max-width` drops to ~620px when open. Honor `@media (max-width:820px)` →
  hide canvas. This keeps it within the keep-alive portal subtree (do NOT add it as a `WorkspaceDesktopApp`
  pane — that breaks the `chatSlot` test contract and lives outside keep-alive).
- **`ActivityCard`** — a grouping wrapper in `chat-blocks`: BlockRenderer collapses a consecutive run
  of `step` (+ optionally tool) blocks into one collapsible card with the "Worked across … · N steps
  · Ns" header (derive count from grouped steps; duration from summed/last tool durations if present),
  violet spark icon, chevron toggle, default-open when `isStreaming`/active turn.
- **Canvas content selector** — derive the canvas doc from the most recent completed
  `write_file`/`edit_file` block (path + `input.content`/`result`); render markdown via the app's
  existing markdown path (TextBlock already renders prose — reuse its renderer for the doc body).
  The blinking type-cursor is cosmetic, shown while `isStreaming`.
- **Provenance data** — render the step provenance pill ONLY when the data exists; do not fabricate.
  Flag to backend owners that the SSE `step` payload needs a structured `source` field to fully match
  the design (`docs/redesign-warm-hive/pr3-recon` follow-up).

### Is there already an artifact-canvas / side panel? — NO.
Confirmed by grep across `apps/web/src` for `canvas` / `work canvas` / `artifact-canvas`: the only
matches are `WorkspaceDesktopApp.tsx` layout comments (an unrelated "right context panel" on the
Overview tab, NOT a chat canvas) and a knowledge-graph canvas in Memory. The chat surface
(`ChatApp.tsx`) is strictly single-pane (`flex h-full` with one `flex-col flex-1` column, `:697`/`:744`).
**The split work canvas must be built from scratch.**

### Risk notes
- Canvas MUST live inside the kept-alive subtree (ChatApp), else its state resets on every nav
  (`ChatHost.tsx` keep-alive only covers the portal subtree).
- Do not change `WorkspaceDesktopApp`'s `chatSlot`/`activeTab` props — `p1a-chat-state.test.tsx`
  seam (a)/(b) pins them.
- Keep `chat-artifact-block` / `chat-artifact-open` test IDs + Created/Updated copy + `isArtifactBlock`
  predicate — `chat-artifact-block.test.tsx` pins them; the canvas is additive.
