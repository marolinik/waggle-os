# AI-OS Architecture Exploration — WaggleDance Evolution + Unified Memory Launcher

**Date:** 2026-05-19 · **Mode:** exploration / pre-spec · **Code:** none yet.
**Mandate:** "Explore first, don't code yet. ULTRATHINK."

---

## 0. Executive summary (read this first)

1. **WaggleDance today is small and well-scoped:** ~120-LOC dispatcher + 10-subtype protocol, team-scoped, used for *internal* multi-agent coordination. Underused. The UI surface (`WaggleDanceApp.tsx`) renders signals as a feed but nothing outside the team workspace feeds it.

2. **The "OS for AI" substrate is already ~70% built — this is the headline finding.** The monorepo now contains **7 dedicated hook-installer packages** (`claude-code`, `claude-desktop`, `cursor`, `codex`, `codex-desktop`, `hermes`, `openclaw`), a `hive-mind-shim-core` foundation layer, a canonical `hive-mind-mcp-server`, a `hive-mind-cli`, and `hive-mind-wiki-compiler` — wired through `hive-mind-core` (the extracted `mind/`+`harvest/` substrate). The integration ethics are production-grade: byte-identical uninstall, fail-open hooks, SHA-256-verified round-trips.

3. **The remaining 30% is UI + connective tissue,** not new substrate. To deliver the "real OS feel" we need (a) a launcher / dock that detects installed AI tools and offers one-click hook install + workspace-scoped launch, (b) WaggleDance promoted from internal-team-bus to **cross-tool live nervous system** (every captured event becomes a signal), (c) cross-tool task dispatch from the Waggle UI. We **do not** need to embed Cursor/VS Code; that's the wrong shape.

The thesis we can ship: **"Waggle is the OS for AI work. Every tool you already use — Claude Code, Cursor, Codex, Claude Desktop, Hermes — silently feeds one unified memory, and Waggle's launcher + activity bus is how you see and steer it."**

---

## 1. WaggleDance — what it actually does today

**Code surface (verified):**
- `packages/waggle-dance/src/protocol.ts` — type/subtype combo validation. Three types × ten subtypes total. ~17 LOC.
- `packages/waggle-dance/src/dispatcher.ts` — `WaggleDanceDispatcher` class. Routes 4 of 10 subtypes today: `task_delegation`, `knowledge_check`, `skill_request`, `skill_share`. Takes 3 deps: `searchMemory`, `resolveCapability`, `spawnWorker`. ~120 LOC.
- `packages/waggle-dance/src/hive-query.ts` — pure types for hive queries. ~25 LOC.

**Message shape (`packages/shared/src/types.ts:92-102`):**
```ts
interface WaggleMessage {
  id: string;
  teamId: string;          // currently team-scoped only
  senderId: string;
  type: MessageType;       // 'broadcast' | 'request' | 'response'
  subtype: MessageSubtype; // 10 distinct subtypes
  content: Record<string, unknown>;
  referenceId: string | null;
  routing: Array<{userId: string; reason: string}> | null;
  createdAt: Date;
}
```

**Currently wired:**
- `packages/worker/src/handlers/waggle-handler.ts` routes protocol messages through the dispatcher; legacy non-protocol calls fall back to a topic-based hive query.
- `packages/server/src/services/message-service.ts` + `routes/messages.ts` — server-side persistence + REST surface.
- `apps/web/src/components/os/apps/WaggleDanceApp.tsx` — UI activity feed with filters: discovery / handoff / insight / alert / coordination. Pulls from `useWaggleDance()` hook.
- WebSocket inbound: `{type: 'send_message', ...}` and `{type: 'waggle_message', message}` types are in the WS protocol.

**What's underused:**
- `model_recommendation`, `knowledge_match`, `task_claim`, `discovery`, `routed_share`, `model_recipe` — defined in the type union, no dispatcher branches yet. The protocol over-commits to coordination primitives the runtime doesn't yet exercise.
- `resolveCapability` is stubbed in `waggle-handler.ts` (returns canned response — comment says "full capability router wiring needs agent package context").
- `spawnWorker` is a stub that returns a string ("Worker spawned for..."). Real BullMQ enqueue is commented out as TODO.
- TEAMS-tier feature today; no path to per-user signal volume.

**Honest assessment:** WaggleDance is a *protocol-shaped scaffold* with a small live core (3 working subtypes against stubbed deps) and a UI that consumes whatever signals exist. It is **not yet** the "live nervous system" the name evokes.

---

## 2. WaggleDance — evolution options (no code, just shape)

### 2a. Status quo — keep as team-internal
Finish wiring `resolveCapability` + `spawnWorker` to real implementations. Add dispatcher branches for the remaining 6 subtypes. Leaves WaggleDance as a TEAMS feature only. **Verdict:** correct, but doesn't unlock new value.

### 2b. Promote to **cross-tool nervous system** ★ recommended
The hook packages already capture conversation episodes from every external tool. Today they write frames directly. Add a new emission path: every interesting hook event (significant `Stop` summary, `compact_memory` event, sign-gated frame, learning loop fire from D1) **also emits a WaggleMessage** to a per-user `personal` team (not just real Teams). The Waggle Dance app becomes the unified live activity feed for ALL your AI work across ALL tools.

Concretely:
- Drop the `teamId NOT NULL` constraint, or introduce a synthetic `personal::<userId>` team. Personal users get WaggleDance for free; the TEAMS tier upgrade adds shared-team visibility on top.
- Hook packages gain a `--emit-signal` flag that POSTs a `broadcast/discovery` message when a `Stop` summary exceeds an importance threshold.
- D1's mechanically-closed learning loop emits a `broadcast/skill_share` when a new skill is distilled — and other tools can recall it via MCP.
- The `WaggleDanceApp` filter list (`discovery|handoff|insight|alert|coordination`) already matches this perfectly.

### 2c. Add provenance + trust
Extend `WaggleMessage` with optional `provenance: { tool, sessionId, workspaceId, frameId }` and `trust: number ∈ [0,1]`. Lets the UI render "Cursor saw this in workspace X with trust 0.82" — and lets downstream consumers (KVARK governance, EU AI Act audit) filter on origin/confidence.

### 2d. Topology-aware routing (deferred)
`routing: Array<{userId, reason}>` is already in the message shape. Hop-limited fan-out for big teams; not needed pre-launch but the field is reserved.

**Recommendation:** ship 2b + 2c together as **"WaggleDance v2 — cross-tool activity bus"** roughly 1 to 1.5 weeks of work. Skip 2d until TEAMS scale demands it.

---

## 3. "OS for AI" — the **surprise finding**

The user's ask reads like greenfield architecture. It is not. The substrate is mostly here.

### 3a. What's already in `packages/` (verified by `find`)

| Package | Role |
|---|---|
| `hive-mind-core` | The extracted `mind/`+`harvest/` substrate — single source of memory truth, shared with the open-source release at `marolinik/hive-mind`. |
| `hive-mind-shim-core` | Foundation layer used by every tool hook. Exposes: `cli-bridge`, `frame-encoder`, `hook-event-types`, `importance-classifier`, `prompt-summarizer`, `retry-bridge`, `workspace-resolver`, `logger`. |
| `hive-mind-mcp-server` | Canonical MCP server. Any MCP-aware tool can read/write hive-mind via stdio. |
| `hive-mind-cli` | Programmatic + interactive CLI surface; the bridge hooks shell out to it. |
| `hive-mind-wiki-compiler` | Compiles harvested frames into navigable wiki pages. |
| `hive-mind-hooks-claude-code` | SessionStart / UserPromptSubmit / Stop / PreCompact hooks for Claude Code, with reversible byte-identical install. |
| `hive-mind-hooks-claude-desktop` | Same pattern for Anthropic Claude Desktop. |
| `hive-mind-hooks-cursor` | Same pattern for Cursor. |
| `hive-mind-hooks-codex` | Same for OpenAI Codex CLI. |
| `hive-mind-hooks-codex-desktop` | Same for the Codex Desktop variant. |
| `hive-mind-hooks-hermes` | Same for Hermes agent. |
| `hive-mind-hooks-openclaw` | Same for OpenClaw. |

### 3b. The integration pattern — already production-grade

From `hive-mind-hooks-claude-code/README.md`:

| Hook | Semantic effect |
|---|---|
| `SessionStart` | Resolve workspace → switch context → recall top-N frames → inject as additional context. |
| `UserPromptSubmit` | Save prompt as `temporary` frame, session-scoped. |
| `Stop` | Deterministically summarize the completed turn → save as `important` frame parented to the prompt. |
| `PreCompact` | Run `compact_memory` so superseded P/B frames merge before the tool truncates context. |

**Ethics that are already enforced:** byte-identical uninstall via SHA-256 round-trip, fail-open on any error (tool never sees a hook failure), workspace-pinned via small pointer file. This is the trust posture you need for "install Waggle and let it observe everything."

### 3c. What this means

The "unified memory across all your AI tools" promise is **already deliverable today** via a documented install path (`npx @hive-mind/<tool>-hooks install`). It just isn't packaged as an OS-shaped product surface yet. The remaining work is **product**, not **research** — which is the cheaper kind.

---

## 4. Gap analysis — what's missing for "real OS feel"

These are the deltas between "the substrate exists" and "Waggle feels like an OS for AI."

### Tier 0 — must-have for the OS metaphor to land

| Gap | What | Effort |
|---|---|---|
| **G1. Tool launcher / dock** | Detect installed AI tools on the user's machine; show them in a Waggle dock; one-click "Open in workspace X". Spawn the native binary (Tauri `Command::new` or web-app deep-link). | M |
| **G2. Hook auto-installer** | "I see Cursor 0.42 installed and uninstrumented. Want to wire it to hive-mind? [Install][Skip]." Wraps the `npx @hive-mind/<tool>-hooks install` flow in a Tauri-side action with consent UI. | S |
| **G3. WaggleDance v2 — cross-tool bus** | (See §2b/§2c.) Every captured event from any tool becomes a WD signal. Single live activity feed. | M |
| **G4. Cross-tool workspace context** | When the user launches Claude Code "in workspace KVARK," the hook chain picks up that workspace at SessionStart. Today `workspace-resolver.ts` exists; we need the launcher side to set the env/marker the resolver reads. | S |

### Tier 1 — strongly increases OS feel

| Gap | What | Effort |
|---|---|---|
| **G5. Tool inventory + status** | Mission Control / Dashboard tile: "5 tools installed, 3 instrumented, 2 running, last capture 14s ago." | S |
| **G6. Cross-tool task dispatch** | "Spawn agent in Claude Code with this prompt + workspace context" from inside Waggle. Uses the existing process-spawn + MCP-config-injection path. | M |
| **G7. Provenance UI on memory** | Every frame already records source. Surface it: "This came from Cursor (workspace KVARK, 2 hours ago)." Memory app gets a `source-of-truth` column. | S |
| **G8. Skill diffusion loop** | D1's mechanically-closed learning loop (shipped last session) emits skills locally. Promote skills via WD `skill_share` broadcast so other tools (via MCP) can adopt them. | M |

### Tier 2 — nice-to-have, not launch-blocking

| Gap | What | Effort |
|---|---|---|
| **G9. Embedded shell panes** | Tauri webview-embeds a terminal running `claude-code` or `cursor` *inside* the Waggle window. Maximal OS feel but legal/effort cost is high. | L+ |
| **G10. Cross-tool replay** | "Show me the chain: Cursor question → Claude Code edit → Codex test → Hermes review." Already possible from frame data; needs UI. | M |
| **G11. Tool-aware governance hooks** | EU AI Act audit + KVARK governance — filter on tool/provenance. Already permitted by hive-mind schema; needs UI + reports. | M |

---

## 5. Three architectural paths

### Path A — "Memory bus only"
Waggle is just the memory + UI substrate. Other tools run independently; users install hooks themselves via CLI. No launcher, no dock, no signal bus.
- **Pros:** lowest friction; we're already 95% here.
- **Cons:** doesn't deliver the "OS for AI" feel the user is asking for.
- **Verdict:** under-shoots the ask.

### Path B — "Hub launcher"
Waggle detects + launches external tools; injects workspace context + ensures hooks are installed. Tools run in their own windows; Waggle is the launcher + memory cockpit.
- **Pros:** Real OS feel without taking on embedding risk. Native window management means the user keeps muscle memory.
- **Cons:** Process management complexity; cross-platform installer detection; Tauri permissions/capabilities work.
- **Verdict:** the realistic landing zone.

### Path C — "Embedded shells"
Tauri embeds Cursor/VS Code/terminals as webview panels inside the Waggle window.
- **Pros:** Maximum OS feel.
- **Cons:** Cursor isn't designed to embed; VS Code remote requires the Server extension; legal questions on Cursor; massive effort. The user's existing UI muscle memory in Cursor would break.
- **Verdict:** wrong shape for the value delivered. Skip.

### **Path D — recommended: B + WaggleDance v2 as the unifying bus**
Path B for processes + UI launcher; promote WaggleDance from team-internal to cross-tool live activity bus (§2b/§2c). The "OS feel" comes from four converging primitives:

1. **Unified memory** (already there — hive-mind-core + 7 hook packages).
2. **One-click launcher with workspace context injection** (G1 + G4).
3. **Live unified activity feed across all tools** (G3 = WaggleDance v2).
4. **Cross-tool task dispatch** (G6).

This is the smallest set of new code that delivers the maximum amount of "OS for AI." No embedding. No greenfield substrate. Mostly product surface + bus rewiring + Tauri spawn wiring.

---

## 6. Suggested phasing (no code yet — for ratification)

**Phase 0 — Tool detection PoC** (~3 days)
- Single Tauri command: scan known install paths for Claude Code, Cursor, Codex CLI, Claude Desktop, Hermes on win32/darwin/linux.
- Returns `{tool, installedPath, version, hooksInstalled}`.
- Foundation for G1 + G2 + G5.

**Phase 1 — WaggleDance v2 cross-tool bus** (~5 days)
- Schema migration: allow `personal::<userId>` synthetic team.
- Hook packages gain optional signal-emit path on `Stop` when importance > threshold.
- Drop dispatcher fall-throughs to fully wire the 6 unwired subtypes (even as stubs).
- `WaggleDanceApp` filter expanded to include `tool` column.
- Locks: end-to-end test that a Claude Code stop emits a `discovery` signal visible in `WaggleDanceApp`.

**Phase 2 — Launcher dock + hook-installer UX** (~5 days)
- Dock surface in Tauri shell + on `apps/web/src/components/os/`.
- Per-tool: "Launch in workspace X" + "Install hooks" + "Verify" + "Uninstall."
- Workspace context injection via env or pointer file picked up by `workspace-resolver.ts`.
- Locks: spawn-test for each of the 7 tool integrations.

**Phase 3 — Cross-tool task dispatch + skill diffusion** (~7 days)
- "Spawn agent in Claude Code with prompt P" from Waggle UI → spawns + injects context.
- D1's distilled skills broadcast via WD `skill_share`; MCP-consuming tools can recall.
- Locks: round-trip test (Waggle UI → spawn Claude Code → execute → memory frame visible in Waggle within N seconds).

**Phase 4 — Polish / governance / launch comms** (~5 days)
- Provenance UI in Memory app (G7).
- Mission Control tile (G5).
- Cross-tool replay (G10) if time permits.
- Pre-launch comms: this is the OS-for-AI story.

Total: ~25 working days, all incremental on existing substrate, zero new research dependencies.

---

## 7. Open questions for you (PM-level decisions)

1. **Scope: which tools first?** Claude Code + Cursor + Claude Desktop are the highest-frequency for your persona. Codex/Hermes/OpenClaw fill out the catalog but their hook packages already exist. Recommend all 7 by Phase 4 because the cost-per-additional-tool is small.
2. **Personal-tier vs TEAMS-only for WaggleDance v2?** Recommend personal-tier (free) for visibility-only; TEAMS keeps the shared/collaborative-team value. The free version drives the lock-in moat (Memory + Harvest is free forever per `feedback_silent_recommendations_dont_ask` lineage).
3. **Embedded shells: revisit later or never?** I'd argue *never for Cursor/VS Code* (effort/legal), *yes for `claude-code` CLI* (terminal embed via xterm.js is straightforward and ships big OS feel for the CLI users). Defer to Phase 5+.
4. **Naming.** "Waggle is the OS for AI" is a positioning claim, not a feature name. The dock probably wants a name — `Hive Dock`? `The Launcher`? `Studio`? Worth a separate brainstorm.
5. **Pre-launch sequencing.** Polish-sprint backlog (CLAUDE.md §10) has PersonaSwitcher, Stripe, light-mode finish still open. AI-OS work is additive, not blocking — but it's a bigger story than any single polish item. Do we slip launch to lead with the AI-OS narrative, or ship current scope and lead the post-launch arc with AI-OS?

---

## 8. Risks / non-goals

- **Non-goal:** rewriting any external AI tool's UI. We respect their surfaces; we observe + coordinate + remember.
- **Non-goal:** building proprietary hooks for tools that don't already have one. The 7-tool catalog is the catalog.
- **Risk:** cross-platform process spawning is fiddly. Tauri 2's `Command` API helps but each tool has its own quirks (especially Windows CLI shims — already burnt time on `hive-mind-cli` `.cmd` shim, hence the `--cli-path` flag in claude-code hook README).
- **Risk:** capturing-everything posture demands the trust posture is airtight. The existing reversible-install ethics (byte-identical uninstall, fail-open) is the right baseline; do not regress it.
- **Risk:** signal volume on WaggleDance bus. Importance-classifier already exists (`hive-mind-shim-core/src/importance-classifier.ts`); thresholds need product tuning.

---

## 9. What I'd ratify before any code

| # | Decision | My recommendation |
|---|---|---|
| D1 | Path D over A/B/C | **Path D.** B alone undersells the activity-bus value. |
| D2 | WaggleDance v2 personal-tier eligibility | **Yes** — drives moat. TEAMS keeps team-shared visibility. |
| D3 | Tool launch-list for Phase 1 | **Claude Code + Cursor + Claude Desktop** first; rest by Phase 4. |
| D4 | Embedded shells | **Never for IDEs; consider xterm.js for `claude-code` CLI** in a later phase. |
| D5 | Phasing | **Phase 0→4 as above (~25 days)**; or compressed to ~15 days if we cut governance polish to v1.5. |
| D6 | Launch sequencing | **Open.** Two viable paths: (a) launch current scope, then lead the post-launch story with AI-OS; (b) compress remaining polish, fold AI-OS Phase 1+2 into the launch story. Recommend (a). |

---

## 10. Appendix — surface map (verified file inventory)

```
packages/
├── waggle-dance/                              # protocol + dispatcher (120 LOC core)
├── hive-mind-core/                            # extracted mind/+harvest/
│   └── src/{mind,harvest}/                    # the substrate
├── hive-mind-shim-core/                       # foundation for all hooks
│   └── src/{cli-bridge,frame-encoder,
│            hook-event-types,importance-
│            classifier,prompt-summarizer,
│            retry-bridge,workspace-resolver,
│            logger}.ts
├── hive-mind-cli/                             # programmatic CLI
├── hive-mind-mcp-server/                      # canonical MCP surface
├── hive-mind-wiki-compiler/                   # frame→wiki pages
├── hive-mind-hooks-claude-code/               # ★ shipped, reversible install
├── hive-mind-hooks-claude-desktop/            # ★
├── hive-mind-hooks-cursor/                    # ★
├── hive-mind-hooks-codex/                     # ★
├── hive-mind-hooks-codex-desktop/             # ★
├── hive-mind-hooks-hermes/                    # ★
├── hive-mind-hooks-openclaw/                  # ★
├── launcher/                                  # currently: `npx waggle` CLI launcher only
└── memory-mcp/                                # standalone MCP server (predecessor; check overlap with hive-mind-mcp-server)
```

```
apps/web/src/components/os/apps/
├── WaggleDanceApp.tsx                        # ready to consume cross-tool signals
├── AgentsApp.tsx                              # local agents UI
├── ConnectorsApp.tsx                          # external services (30 connectors)
└── ...                                        # 21 OS-app surfaces total
```

```
app/src-tauri/
└── src/commands/agent.rs                      # process-spawn pattern already proven for
                                               # in-process agent loop streaming
                                               # — extend to external tool spawn
```

---

**END.** Awaiting decisions D1–D6 in §9 before any code.
