# Claude Code Source — Deep Architecture Analysis for Waggle OS

**Date:** 2026-04-01
**Analyst:** Cowork Session (CxO Advisory)
**Source:** Full source tree at `D:\Projects\Claude Code Source\src\src` (~600+ files)
**Purpose:** Extract production-grade architectural patterns for Waggle OS maturation

---

## 1. AGENT ORCHESTRATION — The Complete Picture

### 1.1 Agent Definition Schema

Every agent in Claude Code — built-in or custom — follows a single schema defined in `loadAgentsDir.ts`. This is the most immediately adoptable pattern for Waggle.

**BaseAgentDefinition fields:**

```
agentType        — unique identifier (e.g., "Explore", "Plan", "general-purpose")
whenToUse        — natural language description used in the tool prompt
tools?           — allowlist of tool names this agent can use
disallowedTools? — denylist of tool names (complementary to allowlist)
skills?          — skill names to preload when agent starts
mcpServers?      — MCP servers specific to this agent (by name reference or inline config)
hooks?           — session-scoped hook settings (pre/post tool execution)
color?           — display color for UI identification
model?           — model override ("sonnet", "opus", "haiku", or "inherit")
effort?          — reasoning effort level
permissionMode?  — "default", "plan", etc.
maxTurns?        — hard cap on agentic turns before forced stop
memory?          — persistent memory scope: "user" | "project" | "local"
background?      — always run as background task
isolation?       — "worktree" (git worktree) or "remote" (sandbox)
initialPrompt?   — prepended to first user turn
omitClaudeMd?    — skip CLAUDE.md injection for lightweight agents
```
**Three agent sources with priority override:**

1. **Built-in** (code-defined): `generalPurposeAgent`, `exploreAgent`, `planAgent`, `verificationAgent`, `claudeCodeGuideAgent`, `statuslineSetup`
2. **Custom** (markdown files with YAML frontmatter): loaded from `.claude/agents/` directories across user, project, and policy settings
3. **Plugin** (external packages): loaded via plugin system with plugin metadata

Priority resolution: `managed > flag > project > user > plugin > built-in`. Later sources override earlier ones by `agentType` name.

**Waggle implication:** Your 13 agent personas should be formalized into this exact schema. The separation between built-in (your core agents), custom (user-defined in workspace), and plugin (marketplace agents) maps directly to your three-tier user model: simple users get built-in, power users define custom, admins manage plugins.

### 1.2 Agent Tool Pool Assembly

Each agent gets a custom-assembled tool set via `assembleToolPool()`:

- Start with ALL available tools
- If agent has `tools` allowlist → filter to only those tools
- If agent has `disallowedTools` denylist → remove those tools
- If agent has `memory` enabled → inject FileWrite, FileEdit, FileRead tools automatically
- If agent has `mcpServers` → connect those MCP servers and inject their tools
- If agent has `skills` → preload those skill invocations
- Apply permission mode restrictions on top

This is compositional security — an "Explore" agent literally cannot write files because `FileWrite` is not in its tool pool. Not enforced by prompt instructions, but by schema.
### 1.3 Coordinator Mode (Feature-Gated)

The coordinator is the most strategically valuable pattern for Waggle's Mission Control.

**How it works:**
- Activated via `CLAUDE_CODE_COORDINATOR_MODE=1`
- Coordinator gets ONLY: `Agent`, `SendMessage`, `TaskStop`, `SyntheticOutput` tools
- Cannot directly read files, write code, or execute commands
- ALL execution is delegated to "worker" subagents
- Workers report back via `<task-notification>` XML messages

**Coordinator workflow:**
1. User request arrives
2. Coordinator spawns research workers in parallel (fan-out)
3. Workers report findings as task notifications
4. Coordinator SYNTHESIZES findings (this is the key insight — the coordinator must understand before delegating implementation)
5. Coordinator spawns implementation workers with precise specs
6. Implementation workers self-verify (first QA layer)
7. Coordinator spawns verification workers (second QA layer)
8. Coordinator reports results to user

**Critical design principle:** "Never delegate understanding." The coordinator's prompt explicitly forbids phrases like "based on your findings, fix the bug" — it must synthesize findings into specific instructions with file paths, line numbers, and exact changes.

**Scratchpad pattern:** Workers share durable cross-worker knowledge via a `scratchpadDir` — a designated directory where workers can read/write without permission prompts. This enables coordination through shared state on the filesystem.

**Waggle implication:** This is exactly what Mission Control should become. The Cockpit view shows agent status; Mission Control orchestrates. The scratchpad pattern maps to your existing workspace file system. The worker notification pattern (`<task-notification>` XML) should be adopted for your event stream.
### 1.4 Fork Subagent Pattern

Forks solve a specific problem: context pollution during research.

**Without forks:** Agent researches a question → all intermediate tool calls (file reads, greps, etc.) fill context → context is now cluttered with noise that isn't needed for the next task.

**With forks:** Agent spawns a fork → fork inherits the FULL parent conversation context → fork does research → fork returns a summary → parent's context stays clean.

**Key rules:**
- Forks share the parent's prompt cache (cheap to spawn)
- Don't set a different `model` on a fork (breaks cache sharing)
- Don't "peek" at fork output files — wait for the completion notification
- Fork prompts are directives, not full context briefs (context is inherited)
- For fresh agents (`subagent_type` specified), write full context briefs

**Continue vs. Spawn decision matrix:**

| Situation | Action | Why |
|---|---|---|
| Research found exactly the files to edit | Continue (SendMessage) | Worker has files in context |
| Research was broad, implementation is narrow | Spawn fresh | Avoid dragging exploration noise |
| Correcting a failure | Continue | Worker has error context |
| Verifying another worker's code | Spawn fresh | Fresh eyes, no implementation assumptions |
| Wrong approach entirely | Spawn fresh | Avoid anchoring on failed path |

**Waggle implication:** This directly solves the "13 agents generating output" context management problem. Waggle Dance workflows should use the fork pattern for research phases and fresh spawns for implementation phases.
### 1.5 Agent Memory (Per-Agent Persistent State)

Each agent can have its own persistent memory, separate from the main conversation memory.

**Three scopes:**
- **user** (`~/.claude/agent-memory/<agentType>/`): persists across all projects
- **project** (`.claude/agent-memory/<agentType>/`): project-specific, version-controlled
- **local** (`.claude/agent-memory-local/<agentType>/`): project-specific, NOT version-controlled

**Memory snapshots:** Teams can share agent memory via project-level snapshots. On first run, if a project snapshot exists but no local memory, the snapshot is copied to local. If a newer snapshot exists, the agent is notified to consider updating.

When memory is enabled for an agent, FileWrite/FileEdit/FileRead tools are automatically injected even if the agent has a restricted tool allowlist.

**Waggle implication:** Your graph database memory should support per-agent memory scopes. An "Analysis Agent" should remember different things than a "Writing Agent." The snapshot/sync pattern is essential for team workspaces.

---

## 2. MEMORY SYSTEM — Production-Grade Patterns

### 2.1 Four-Type Taxonomy (Enforced)

Types: `user`, `feedback`, `project`, `reference`

Each type has structured guidance:
- **user**: role, goals, preferences. Always private scope. Saved when learning about who the user is.
- **feedback**: behavioral corrections AND confirmations. "Record from failure AND success" — only saving corrections makes the system overly cautious. Structure: rule → Why → How to apply.
- **project**: ongoing work context not derivable from code/git. Convert relative dates to absolute. Decay fast, so include "why" for judging staleness.
- **reference**: pointers to external systems (Linear project, Grafana dashboard, Slack channel).
**Explicit exclusions (even on user request):**
- Code patterns, architecture, file paths — derivable from current project state
- Git history — `git log`/`git blame` are authoritative
- Debugging solutions — the fix is in the code
- Anything in CLAUDE.md files
- Ephemeral task details

If the user asks to save a PR list, the system asks "what was surprising or non-obvious about it?" — only that part gets saved.

### 2.2 Side-Query Relevance (The Key Innovation)

`findRelevantMemories.ts` uses a lightweight Sonnet call to pre-filter memories.

**Flow:**
1. `scanMemoryFiles()` reads YAML frontmatter from all `.md` files in the memory directory (max 200 files, first 30 lines per file — no full content loaded)
2. Headers are formatted as a manifest: `- [type] filename (ISO timestamp): description`
3. A Sonnet side-query gets: the user's current query + the manifest + list of recently-used tools
4. Sonnet returns up to 5 filenames that are clearly relevant
5. Only those 5 files are fully loaded into context

**Anti-noise feature:** If tools are currently in use (e.g., MCP spawn tool), their reference docs are excluded — the system is already exercising them, reference docs are noise. But warnings/gotchas about those tools ARE included.

**Prefetch pattern:** Memory relevance is prefetched at query start (`startRelevantMemoryPrefetch`), runs during model streaming, and is consumed after tools execute. Never blocks the main path.

### 2.3 Memory Freshness and Staleness

`memoryAge.ts` computes human-readable age ("47 days ago") and injects staleness warnings:

> "This memory is 47 days old. Memories are point-in-time observations, not live state — claims about code behavior or file:line citations may be outdated. Verify against current code before asserting as fact."
The "Before recommending from memory" section enforces verification:
- Memory names a file path → check file exists
- Memory names a function → grep for it
- User about to act on recommendation → verify first
- "The memory says X exists" ≠ "X exists now"

### 2.4 Team Memory

Shared memory across team members with enterprise-grade security:
- Symlink traversal protection (realpath resolution)
- Null byte injection prevention
- URL-encoded traversal detection
- Unicode normalization attack prevention
- Backslash injection rejection
- Path containment verification against real filesystem paths

**Waggle implication:** Your enterprise air-gapped deployment requires this level of path security for shared memory. The team memory pattern directly maps to your multi-workspace isolation — each workspace gets its own team memory directory.

---

## 3. QUERY ENGINE — The Brain

### 3.1 Architecture

`QueryEngine` class: one instance per conversation, persists across turns.

**Per-turn lifecycle:**
1. **Context assembly**: system prompt + userContext + systemContext (composable sections)
2. **Memory prefetch**: starts async Sonnet side-query for relevant memories
3. **Skill prefetch**: starts async skill discovery for potentially relevant skills
4. **Snip compact**: removes old context if history is too long
5. **Microcompact**: fine-grained compaction of tool results
6. **Context collapse**: coarser compaction via staged collapses
7. **Autocompact**: full conversation summarization when context is critically full8. **Tool result budget**: enforces per-message size limits on aggregate tool results
9. **API call**: streams model response
10. **Streaming tool execution**: tools begin executing as soon as their parameters stream in (not after full response)
11. **Post-sampling hooks**: execute after model completes
12. **Token budget check**: decide whether to continue or stop the agentic loop

### 3.2 Multi-Layer Compaction Strategy

This is critical for long sessions. Claude Code uses FOUR layers:

1. **Snip compact**: removes oldest messages, preserving a "protected tail" of recent context
2. **Microcompact**: replaces individual tool results with summaries when they exceed size limits. Cached variant edits the API cache directly.
3. **Context collapse**: groups related messages into collapsible summaries. Projection-based — the REPL keeps full history, collapse is a read-time view.
4. **Autocompact**: full conversation summary when nearing context limit. Triggered by token count threshold. Uses a side-query to generate the summary.

Each layer runs independently. Snip runs before microcompact. Microcompact before autocompact. Context collapse can prevent autocompact from firing.

### 3.3 Token Budget Management

`tokenBudget.ts` implements a continuation system:

- Tracks `continuationCount`, `lastDeltaTokens`, `lastGlobalTurnTokens`
- Continues if under 90% of budget AND not showing diminishing returns
- Diminishing returns detected: 3+ continuations with <500 token delta
- Agents don't get continuation — only the main loop
- Blocking limit: hard stop when token count reaches critical threshold (reserves space for manual `/compact`)

### 3.4 Streaming Tool Execution

`StreamingToolExecutor`: tools begin executing while the model is still generating.

As soon as a `tool_use` block's parameters are complete in the stream, execution begins. Multiple tools can execute concurrently. Results are yielded as they complete, not in order. This dramatically reduces latency for multi-tool turns.

**Waggle implication:** This is a significant UX advantage. When an agent spawns three research sub-tasks, all three should begin immediately, not sequentially.
---

## 4. TOOL HARNESS — The Execution Layer

### 4.1 buildTool() Factory

Every tool in the system is created via `buildTool<InputSchema, OutputSchema, Progress>()`:

```typescript
type ToolDef = {
  name: string
  description: string | (() => string | Promise<string>)
  inputSchema: z.ZodType | (() => z.ZodType)  // Zod schema, can be lazy
  outputSchema?: z.ZodType | (() => z.ZodType)
  isEnabled: () => boolean                      // Dynamic enable/disable
  isReadOnly: () => boolean                     // Read-only tools skip permission checks
  maxResultSizeChars?: number                   // Tool result truncation limit
  userFacingName?: () => string                 // Display name for UI

  call: (input, context) => AsyncGenerator<Progress, Output>

  // React rendering
  renderToolUseMessage: (input) => ReactNode
  renderToolResultMessage: (output) => ReactNode
  renderToolUseRejectedMessage: (input) => ReactNode
  renderToolUseErrorMessage: (error) => ReactNode
  renderToolUseProgressMessage: (progress) => ReactNode

  // Validation
  validateInput?: (input) => ValidationResult
  backfillObservableInput?: (input) => void     // Enrich input for SDK/transcript
}
```

**ToolUseContext** provides rich execution context:
- `options.tools`: full tool pool available
- `options.mcpClients`: connected MCP servers
- `options.agentDefinitions`: all agent definitions
- `abortController`: cancellation signal
- `readFileState`: file content cache
- `getAppState() / setAppState()`: application state access
- `messages`: conversation history
- `queryTracking`: chain ID and depth for analytics
### 4.2 Permission System

Multi-layer permission model:
- **Permission mode**: "default", "plan", "bypass"
- **Per-tool rules by source**: `alwaysAllowRules`, `alwaysDenyRules`, `alwaysAskRules`
- **Sources**: user settings, project settings, policy settings (enterprise)
- **Background agents**: `shouldAvoidPermissionPrompts` — auto-deny when no UI available
- **Coordinator workers**: `awaitAutomatedChecksBeforeDialog` — run classifier checks before showing prompt
- **Denial tracking**: prevents repeated prompts for the same tool/input combination

### 4.3 Deferred Tool Loading (ToolSearch)

Tools are registered by name only. Full schema (description, inputSchema, outputSchema) is fetched on demand via `ToolSearchTool`. This keeps the system prompt compact when many MCP servers are connected.

**Waggle implication:** As your connector count grows past 32, this becomes essential. Each connected MCP server adds tool schemas to the prompt. Deferred loading keeps the base prompt stable and cache-friendly.

---

## 5. SKILLS FRAMEWORK

### 5.1 Skill Definition (Markdown with Frontmatter)

Skills are markdown files loaded from directories:

```yaml
---
name: commit
description: Create a git commit with conventional commit message
tools: Agent, Bash, FileRead, FileEdit     # Tool allowlist when invoked
model: sonnet                              # Optional model override
effort: high                               # Reasoning effort
paths: src/**, tests/**                    # File path relevance patterns
hooks:                                     # Lifecycle hooks
  pre_tool_call: ...
  post_tool_call: ...
allowed_tools: Read, Edit                  # Tools the skill itself uses
args: message                              # Named arguments ($message substitution)
---

[Skill prompt content in markdown]
```
### 5.2 Skill Sources and Priority

1. **Bundled** (shipped with Claude Code)
2. **MCP-generated** (via `mcpSkillBuilders.ts` — MCP servers can register skill builders)
3. **User** (`~/.claude/skills/`)
4. **Project** (`.claude/skills/`)
5. **Managed** (enterprise policy)
6. **Plugin** (external packages)

Deduplication by canonical file path (resolves symlinks). Priority: managed > project > user > plugin > bundled.

### 5.3 Skill Discovery and Prefetch

Skills can be discovered at query time via a prefetch mechanism that runs alongside model streaming. The system identifies potentially relevant skills based on the user's query before the model requests them.

**Waggle implication:** Your "Skills & Apps" dock view should adopt this exact structure. Skills as markdown files is simple, composable, and human-editable. The frontmatter schema provides everything needed for display, filtering, and execution.

---

## 6. TASK SYSTEM

### 6.1 Seven Task Types

```
LocalAgentTask       — foreground subagent (sync or backgroundable)
RemoteAgentTask      — remote sandbox execution (always background)
InProcessTeammateTask — tmux-spawned teammate process
LocalShellTask       — background shell commands
LocalWorkflowTask    — multi-step workflow execution
MonitorMcpTask       — MCP server monitoring
DreamTask            — background "dreaming" (speculative processing)
```
### 6.2 Task Lifecycle

States: `pending` → `running` → `completed|failed|killed`

Background task indicator: shown when `status === 'running' | 'pending'` AND `isBackgrounded === true`.

Progress tracking: agents report via `AgentToolProgress` events with `description`, `tokenCount`, `toolUseCount`, `lastToolName`.

**Auto-background:** After 120 seconds, foreground agents can be automatically moved to background (feature-gated via `CLAUDE_AUTO_BACKGROUND_TASKS`).

### 6.3 Notification Pattern

Workers → coordinator communication uses structured XML:

```xml
<task-notification>
  <task-id>{agentId}</task-id>
  <status>completed|failed|killed</status>
  <summary>{human-readable status}</summary>
  <result>{agent's final text response}</result>
  <usage>
    <total_tokens>N</total_tokens>
    <tool_uses>N</tool_uses>
    <duration_ms>N</duration_ms>
  </usage>
</task-notification>
```

**Waggle implication:** This notification format should be adopted for your event stream. The structured XML enables parsing, display, and routing in your Cockpit and Events views.
---

## 7. ARCHITECTURE BLUEPRINT FOR WAGGLE

Based on the complete deep-dive, here is the prioritized implementation roadmap:

### P0 — Foundation (Blocks Everything Else)

**A. Agent Definition Schema**
Formalize the 13 agent personas into the `BaseAgentDefinition` format. Every agent gets: `agentType`, `whenToUse`, `tools` allowlist, `disallowedTools`, `model`, `maxTurns`, `memory` scope. Store these as markdown files with YAML frontmatter in the workspace.

**B. Tool Pool Assembly**
Implement `assembleToolPool()` — per-agent tool filtering based on allowlist/denylist. This is the single most important security boundary in the system.

**C. Token Budget Management**
Build a budget tracker for the chat view. Track continuation count, delta tokens, and implement the 90% threshold with diminishing-returns detection.

### P1 — Orchestration (Enables Workflows)

**D. Coordinator Mode for Mission Control**
Implement the coordinator pattern: restricted tool set (only Agent + SendMessage + TaskStop), worker spawn/track/notify lifecycle, and scratchpad for cross-worker state.

**E. Task Notification Protocol**
Adopt the `<task-notification>` XML format for agent→orchestrator communication. Wire this into the Events view for real-time workflow visualization.

**F. Fork Subagent for Waggle Dance**
Implement context-inheriting agent spawns for research phases. The fork's context stays clean, the parent gets only the summary.
### P2 — Memory Maturation

**G. Four-Type Memory Taxonomy**
Implement on top of your graph DB. Each memory node gets: `type` (user/feedback/project/reference), `description`, `timestamp`. Enforce the "what NOT to save" rules.

**H. Side-Query Relevance Filter**
Use a lightweight model call to pre-filter which memory frames to inject per query. Scan frontmatter/descriptions only, select up to 5, load full content for only those.

**I. Memory Freshness Warnings**
Compute age, inject staleness caveats for memories >1 day old, enforce "verify before recommending."

**J. Per-Agent Memory Scopes**
Each agent type gets its own memory directory/subgraph. Analysis Agent remembers analysis patterns. Writing Agent remembers style preferences. Separate from conversation memory.

### P3 — Context Management

**K. Multi-Layer Compaction**
Implement at least two layers: microcompact (per-tool-result summarization) and autocompact (full conversation summary). This is non-negotiable for production quality with long agent sessions.

**L. Streaming Tool Execution**
Begin tool execution as soon as parameters stream in. This alone can cut perceived latency by 30-50% for multi-tool turns.

**M. Deferred Tool Loading**
Register connector tools by name only. Fetch full schemas on demand via a ToolSearch equivalent. Critical as connector count scales.

### P4 — Enterprise

**N. Team Memory with Security**
Shared memory across workspace users. Symlink protection, path traversal prevention, scope isolation between private and team.

**O. Agent Memory Snapshots**
Allow teams to share agent memory configurations via project-level snapshots. New team members get bootstrapped agent memory automatically.

**P. Permission Model**
Per-tool, per-agent, per-source permission rules. Enterprise policy settings override project settings override user settings. Background agents auto-deny permission prompts.
---

## 8. WHAT WAGGLE HAS THAT CLAUDE CODE DOESN'T

Do not lose sight of these advantages:

1. **Graph-based memory** — relationships between memory nodes enable queries that flat files cannot. "What does this user know about X and how does it relate to Y?" is a graph query, not a file scan.

2. **Visual orchestration** — the Cockpit, Waggle Dance, and Events views provide visibility into agent workflows that a terminal fundamentally cannot deliver. This is the enterprise sales differentiator.

3. **Multi-workspace isolation** — Claude Code is one project per session. Waggle can run multiple isolated workspaces simultaneously with independent agent pools and memory spaces.

4. **Desktop-first distribution** — one-click install via Tauri, not `npm install -g`. Dramatically lower barrier to entry for non-technical users.

5. **Three-tier user model** — Claude Code has one mode. Waggle can surface progressive complexity. Simple users see a chat interface. Power users see agent configuration. Admins see the full orchestration layer.

6. **Encrypted vault** — AES-256-GCM for credentials. Claude Code stores secrets in plaintext config files.

These are not incremental features — they are structural advantages that justify Waggle's existence as a distinct product.
---

## CORRECTION: Section 2 Memory Assessment (Updated)

The original Section 2 incorrectly positioned Claude Code's flat-file memory as a benchmark that Waggle's graph DB should aspire to. The corrected assessment:

**Waggle's SQLite + frames + graph architecture is the more mature design.** It is enterprise-appropriate for a product with multi-workspace isolation, team memory, per-agent scopes, and importance-based pruning. Claude Code's flat markdown files are a pragmatic CLI choice, not a superior one.

### What Waggle Has That Claude Code Cannot Match

| Capability | Waggle (Graph DB) | Claude Code (Flat Files) |
|---|---|---|
| Relationship queries | Native graph traversal | Impossible |
| Concurrent access | Database-level locking | Filesystem conflicts |
| Importance scoring | accessCount + metadata | Not available |
| Per-agent memory scopes | Graph partitions | Directory convention |
| Cross-agent knowledge sharing | Shared nodes with edges | Shared files (no relationships) |
| Multimedia frame origins | Frames from any source type | Text-only markdown |
| Team memory security | DB-level + API auth | Filesystem symlink protection |

### Patterns to Adopt FROM Claude Code (as graph-layer enhancements)

1. **Side-query relevance filter** — Use a lightweight model call against frame metadata to select top-5 frames per query. Highest-value single improvement.
2. **Staleness warnings** — Surface frame age in context injection. "This frame is 47 days old — verify before acting on it."
3. **Verify-before-recommend** — When a frame references a file path or function name, check existence before surfacing.
4. **Four-type taxonomy overlay** — Classify frames as user/feedback/project/reference for consistent retrieval patterns.
5. **Explicit exclusion rules** — Prevent memory bloat by refusing to store code patterns, git history, or debugging solutions as frames.

### Implementation Fixes Required (Bugs, Not Architecture)

- **P2:** Unify memory counting (49 vs 37 discrepancy across UI views)
- **P3:** Fix `accessCount` incrementing on frame access
- **P3:** Render markdown content in frame display
- **New:** Add side-query relevance pre-filtering before context injection