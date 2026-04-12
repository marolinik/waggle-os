# Waggle OS — Consolidated Improvement Plan

**Date:** 2026-04-01
**Author:** Cowork Advisory Session
**Source:** Deep architecture analysis of Claude Code production source (~600+ files), cross-referenced with open-multi-agent, claw-code, and Waggle OS current state
**Scope:** Strategic + tactical improvement roadmap for production readiness

---

## EXECUTIVE SUMMARY

Waggle OS is architecturally sound and directionally correct. The core infrastructure — Tauri desktop shell, Fastify backend, React frontend, SQLite + graph memory, 13 agent personas, MCP connector framework — provides a foundation that is structurally superior to Claude Code in several dimensions (graph memory, visual orchestration, multi-workspace isolation, three-tier user model, encrypted vault).

However, the gap between Waggle's current state and production quality is not in features — it is in **engineering discipline at the subsystem level.** Claude Code's production source reveals that maturity comes from schema validation on every boundary, compositional security via tool pools, intelligent context management, and memory retrieval optimization. These are the patterns this plan targets.

This plan consolidates all findings into a single prioritized roadmap across six workstreams.

---

## WORKSTREAM 1: AGENT DEFINITION & ORCHESTRATION

### Problem
Waggle has 13 agent personas, but they lack a formalized definition schema. Agent capabilities are implicitly defined rather than explicitly bounded. There is no compositional security — agents are not restricted to specific tool sets by schema enforcement.

### What Claude Code Proves Works
Every agent follows a single `BaseAgentDefinition` schema:
```
agentType         — unique identifier
whenToUse         — natural language trigger description
tools             — allowlist of permitted tools
disallowedTools   — denylist of excluded tools
model             — model override (sonnet/opus/haiku/inherit)
maxTurns          — hard cap on agentic turns
memory            — persistent memory scope (user/project/local)
skills            — preloaded skill names
mcpServers        — agent-specific MCP servers
hooks             — pre/post tool execution hooks
isolation          — worktree or sandbox
permissionMode    — default/plan/bypass
```

Each agent gets a custom-assembled tool pool via `assembleToolPool()` — allowlist/denylist filtering, auto-injection of memory tools, MCP tool binding. An Explore agent literally cannot write files because FileWrite is not in its pool. Security by schema, not by prompt.

### Actions

| # | Action | Priority | Effort |
|---|--------|----------|--------|
| 1.1 | Formalize all 13 agent personas into `BaseAgentDefinition` YAML/markdown files with the schema above | P0 | Medium |
| 1.2 | Implement `assembleToolPool()` — per-agent tool filtering based on allowlist/denylist | P0 | Medium |
| 1.3 | Implement **Coordinator Mode** for Mission Control: restricted tool set (Agent + SendMessage + TaskStop only), all execution delegated to workers, "never delegate understanding" principle | P1 | High |
| 1.4 | Implement **Fork Subagent Pattern** for Waggle Dance: context-inheriting spawns for research phases, parent context stays clean, fork returns summary only | P1 | High |
| 1.5 | Adopt **Task Notification Protocol** (`<task-notification>` XML) for agent→orchestrator communication, wire into Events view | P1 | Medium |
| 1.6 | Map agent tiers to user tiers: simple users see built-in agents only, power users define custom agents, admins manage plugin agents from marketplace | P2 | Medium |

### Success Criteria
- Every agent has a validated definition file with explicit tool boundaries
- No agent can access tools outside its defined pool
- Mission Control operates as a pure coordinator — delegates everything, executes nothing
- Waggle Dance research workflows use forks; implementation workflows use fresh spawns
---

## WORKSTREAM 2: MEMORY SYSTEM OPTIMIZATION

### Current State (Waggle's Advantage)
Waggle's SQLite + frames + graph architecture is **structurally superior** to Claude Code's flat-file approach. Frames as graph nodes with relational edges enable relationship queries, temporal reasoning, cross-agent knowledge sharing, and importance-based pruning. The `auto_recall` tool provides automatic context injection. This is the correct architecture for an enterprise product.

Claude Code uses flat markdown files with YAML frontmatter. It works for a CLI tool. It cannot do relationship queries, has no concurrent access support, and scales poorly beyond a few hundred files.

### What Waggle Should Adopt (Intelligence Layer, Not Storage Replacement)

**Side-Query Relevance Filter (highest-value single improvement):**
Claude Code uses a lightweight Sonnet call to pre-filter which memories to inject. Flow: scan all frame metadata (not content) → send manifest + user query to Sonnet → get back top 5 relevant frames → load only those into context. With 49+ frames and growing, injecting everything is token waste. This filter is the difference between surgical context injection and flooding.

**Four-Type Taxonomy Overlay:**
Classify frames as `user` (role/preferences), `feedback` (behavioral corrections AND confirmations), `project` (ongoing work context), `reference` (pointers to external systems). This is a schema layer on top of the graph — not a replacement. It provides consistent retrieval patterns and enables explicit exclusion rules (refuse to store code patterns, git history, debugging solutions as frames).

**Staleness & Verification:**
Inject freshness warnings for frames older than a configurable threshold. Enforce "verify before recommending" — when a frame references a file path or function, check it still exists before surfacing.

### Implementation Bugs to Fix

| # | Bug | Priority |
|---|-----|----------|
| 2.1 | `accessCount` never increments on frame view — breaks importance scoring and pruning | P2 |
| 2.2 | Memory count discrepancy (49 vs 37 in different UI views) — stale cache or query bug | P2 |
| 2.3 | Markdown not rendered in frame display — raw `**bold**` visible | P3 |

### Enhancement Actions

| # | Action | Priority | Effort |
|---|--------|----------|--------|
| 2.4 | Implement side-query relevance filter: scan frame metadata, select top-5 per query, inject only those | P1 | High |
| 2.5 | Add four-type taxonomy as frame classification (`user`/`feedback`/`project`/`reference`) | P2 | Medium |
| 2.6 | Implement staleness warnings for frames older than configurable threshold | P2 | Low |
| 2.7 | Add "verify before recommending" enforcement — check referenced paths/functions exist | P2 | Medium |
| 2.8 | Implement per-agent memory scopes — Analysis Agent remembers different things than Writing Agent | P2 | Medium |
| 2.9 | Add explicit exclusion rules — refuse to store code patterns, git history, ephemeral task details | P2 | Low |
| 2.10 | Implement memory snapshots for team workspaces — new team members get bootstrapped memory | P4 | High |

### Success Criteria
- Context injection uses ≤5 frames per query (not all 49+)
- Every frame has a type classification
- Frames older than threshold display staleness caveat
- accessCount accurately tracks frame usage
---

## WORKSTREAM 3: CONTEXT & TOKEN MANAGEMENT

### Problem
Long agent sessions will hit context limits. With 13 agents generating output, context fills fast. Without compaction, conversations degrade or fail. Without budget tracking, there is no way to detect diminishing returns or prevent runaway token spend.

### What Claude Code Implements

**Four-layer compaction:**
1. **Snip compact** — removes oldest messages, preserves recent "protected tail"
2. **Microcompact** — replaces individual tool results with summaries when they exceed size limits
3. **Context collapse** — groups related messages into collapsible summaries (read-time view, full history preserved)
4. **Autocompact** — full conversation summary when nearing context limit, triggered by token threshold

**Token budget management:**
- Tracks `continuationCount`, `lastDeltaTokens`, `lastGlobalTurnTokens`
- Continues if under 90% of budget AND not showing diminishing returns
- Diminishing returns: 3+ continuations with <500 token delta
- Hard stop reserves space for manual compaction

**Streaming tool execution:**
- Tools begin executing as parameters stream in (not after full response)
- Multiple tools execute concurrently
- Results yielded as they complete, not in order
- Cuts perceived latency 30-50% for multi-tool turns

### Actions

| # | Action | Priority | Effort |
|---|--------|----------|--------|
| 3.1 | Build token budget tracker for chat view — track continuation count, delta tokens, 90% threshold | P0 | Medium |
| 3.2 | Implement microcompact — per-tool-result summarization when results exceed size limits | P1 | High |
| 3.3 | Implement autocompact — full conversation summary when context nears limit | P1 | High |
| 3.4 | Implement streaming tool execution — begin execution as parameters stream in, concurrent multi-tool | P2 | High |
| 3.5 | Add diminishing-returns detection — auto-stop after 3+ continuations with <500 token delta | P2 | Low |
| 3.6 | Implement tool result budget — enforce per-message aggregate size limits on tool results | P2 | Medium |

### Success Criteria
- Conversations survive 50+ turns without degradation
- Token usage visible to user in Cockpit view
- Multi-tool turns execute concurrently, not sequentially
- System auto-compacts before hitting hard context limits
---

## WORKSTREAM 4: TOOL HARNESS & MCP MATURATION

### Problem
Waggle has tool execution and MCP connectors, but lacks the standardized tool factory pattern and deferred loading that Claude Code uses to keep the system scalable and cache-friendly.

### What Claude Code Implements

**`buildTool()` factory** — every tool created via standardized factory with:
- Zod input/output schema validation
- Dynamic `isEnabled()` / `isReadOnly()` checks
- `maxResultSizeChars` truncation limits
- React rendering hooks for each tool state (progress, result, error, rejected)
- `validateInput()` pre-execution validation

**Deferred tool loading (ToolSearch)** — tools registered by name only. Full schema fetched on demand. Keeps system prompt compact as MCP server count grows. Each connected MCP server adds tool schemas to the prompt; deferral prevents prompt bloat.

**Permission model** — multi-layer: per-tool, per-agent, per-source rules. Enterprise policy overrides project overrides user. Background agents auto-deny permission prompts.

### Actions

| # | Action | Priority | Effort |
|---|--------|----------|--------|
| 4.1 | Standardize tool creation via factory pattern with schema validation on every boundary | P1 | High |
| 4.2 | Implement deferred tool loading — register connector tools by name, fetch schemas on demand | P2 | Medium |
| 4.3 | Add per-tool result size limits and truncation | P2 | Low |
| 4.4 | Implement per-agent, per-source permission rules with enterprise policy override chain | P4 | High |
| 4.5 | Add background agent auto-deny — skip permission prompts when no UI available | P3 | Low |

### Success Criteria
- Every tool has validated input/output schemas
- Adding a new MCP server does not increase base prompt size
- Enterprise admins can set tool-level permission policies that override user/project settings
---

## WORKSTREAM 5: SKILLS FRAMEWORK

### Problem
Waggle has a "Skills & Apps" dock view, but the skill definition format and discovery mechanism may not be standardized for extensibility and marketplace distribution.

### What Claude Code Implements

Skills are markdown files with YAML frontmatter:
```yaml
---
name: commit
description: Create a git commit with conventional commit message
tools: Agent, Bash, FileRead, FileEdit
model: sonnet
effort: high
paths: src/**, tests/**
hooks:
  pre_tool_call: ...
  post_tool_call: ...
args: message
---
[Skill prompt content]
```

**Six sources with priority:** bundled < MCP-generated < user < project < managed < plugin. Deduplication by canonical file path. Discovery and prefetch run alongside model streaming — skill relevance assessed before the model explicitly requests them.

### Actions

| # | Action | Priority | Effort |
|---|--------|----------|--------|
| 5.1 | Standardize skill definition format with YAML frontmatter schema (name, description, tools, model, effort, paths, hooks, args) | P2 | Medium |
| 5.2 | Implement skill source priority chain: built-in < user < workspace < marketplace < enterprise policy | P2 | Medium |
| 5.3 | Add skill discovery prefetch — identify relevant skills from user query before model requests them | P3 | Medium |
| 5.4 | Enable MCP servers to register skill builders — skills generated dynamically from connected services | P3 | High |
| 5.5 | Implement skill deduplication by canonical path — prevent duplicates across sources | P3 | Low |

### Success Criteria
- Every skill has a validated frontmatter definition
- Skills from marketplace can override built-in skills by name
- Relevant skills surfaced proactively before explicit invocation
---

## WORKSTREAM 6: TASK SYSTEM & SESSION MANAGEMENT

### Problem
Waggle's Cockpit tracks agent status, but structured task types, lifecycle management, and background execution with notifications are needed for production-grade workflow orchestration.

### What Claude Code Implements

**Seven task types:**
- `LocalAgentTask` — foreground subagent (sync or backgroundable)
- `RemoteAgentTask` — remote sandbox execution (always background)
- `InProcessTeammateTask` — multi-agent collaboration process
- `LocalShellTask` — background shell commands
- `LocalWorkflowTask` — multi-step workflow execution
- `MonitorMcpTask` — MCP server monitoring
- `DreamTask` — background speculative processing

**Lifecycle:** `pending` → `running` → `completed|failed|killed`
**Auto-background:** After 120 seconds, foreground agents move to background automatically.
**Progress reporting:** `AgentToolProgress` events with description, tokenCount, toolUseCount, lastToolName.

### Actions

| # | Action | Priority | Effort |
|---|--------|----------|--------|
| 6.1 | Define Waggle-specific task types (adapt from Claude Code's seven — drop tmux-specific, add Waggle-native types for graph queries, workspace operations) | P2 | Medium |
| 6.2 | Implement task lifecycle state machine: pending → running → completed/failed/killed | P2 | Medium |
| 6.3 | Add auto-background for long-running agents (configurable threshold, default 120s) | P3 | Low |
| 6.4 | Implement progress reporting in Cockpit — real-time token count, tool usage, duration per agent | P2 | Medium |
| 6.5 | Add session persistence and resume — transcripts recorded, sessions resumable across app restarts | P3 | High |
| 6.6 | Wire task notifications into Events view for real-time workflow visualization | P2 | Medium |

### Success Criteria
- Every running agent has a visible task type and lifecycle state in Cockpit
- Long-running agents auto-background without user intervention
- Sessions survive app restart and resume from last state
---

## PRIORITY MATRIX — ALL ACTIONS RANKED

### P0 — Foundation (Blocks Everything Else)

| ID | Action | Workstream |
|----|--------|------------|
| 1.1 | Formalize 13 agents into BaseAgentDefinition schema | Agent Orchestration |
| 1.2 | Implement assembleToolPool() per-agent tool filtering | Agent Orchestration |
| 3.1 | Build token budget tracker (90% threshold, diminishing returns) | Context Management |

### P1 — Core Quality (Production Readiness)

| ID | Action | Workstream |
|----|--------|------------|
| 1.3 | Implement Coordinator Mode for Mission Control | Agent Orchestration |
| 1.4 | Implement Fork Subagent Pattern for Waggle Dance | Agent Orchestration |
| 1.5 | Adopt Task Notification Protocol for Events view | Agent Orchestration |
| 2.4 | Implement side-query relevance filter (top-5 frame selection) | Memory |
| 3.2 | Implement microcompact (per-tool-result summarization) | Context Management |
| 3.3 | Implement autocompact (full conversation summary) | Context Management |
| 4.1 | Standardize tool factory with schema validation | Tool Harness |

### P2 — Maturation (Competitive Quality)

| ID | Action | Workstream |
|----|--------|------------|
| 1.6 | Map agent tiers to user tiers (simple/power/admin) | Agent Orchestration |
| 2.1 | Fix accessCount incrementing | Memory (Bug) |
| 2.2 | Fix memory count discrepancy (49 vs 37) | Memory (Bug) |
| 2.5 | Add four-type taxonomy as frame classification | Memory |
| 2.6 | Implement staleness warnings | Memory |
| 2.7 | Add verify-before-recommend enforcement | Memory |
| 2.8 | Implement per-agent memory scopes | Memory |
| 2.9 | Add explicit exclusion rules for memory | Memory |
| 3.4 | Implement streaming tool execution (concurrent) | Context Management |
| 3.5 | Add diminishing-returns detection | Context Management |
| 3.6 | Implement tool result budget | Context Management |
| 4.2 | Implement deferred tool loading | Tool Harness |
| 4.3 | Add per-tool result size limits | Tool Harness |
| 5.1 | Standardize skill definition format | Skills |
| 5.2 | Implement skill source priority chain | Skills |
| 6.1 | Define Waggle-specific task types | Task System |
| 6.2 | Implement task lifecycle state machine | Task System |
| 6.4 | Add progress reporting in Cockpit | Task System |
| 6.6 | Wire task notifications into Events view | Task System |

### P3 — Polish (Production Finish)

| ID | Action | Workstream |
|----|--------|------------|
| 2.3 | Render markdown in frame display | Memory (Bug) |
| 4.5 | Add background agent auto-deny | Tool Harness |
| 5.3 | Add skill discovery prefetch | Skills |
| 5.4 | Enable MCP skill builders | Skills |
| 5.5 | Implement skill deduplication | Skills |
| 6.3 | Add auto-background for long-running agents | Task System |
| 6.5 | Implement session persistence and resume | Task System |

### P4 — Enterprise

| ID | Action | Workstream |
|----|--------|------------|
| 2.10 | Implement memory snapshots for team workspaces | Memory |
| 4.4 | Implement enterprise permission policy chain | Tool Harness |
---

## WAGGLE'S STRUCTURAL ADVANTAGES — DO NOT LOSE THESE

These are not incremental features. They are architectural moats that justify Waggle as a distinct product category from Claude Code.

1. **Graph-based memory (SQLite + frames + graph)** — relationship queries, temporal reasoning, cross-agent knowledge sharing, importance-based pruning. Claude Code cannot do any of this with flat files. This is the intelligence foundation.

2. **Visual orchestration (Cockpit / Mission Control / Waggle Dance / Events)** — real-time visibility into agent workflows that a terminal fundamentally cannot deliver. This is the enterprise sales differentiator.

3. **Multi-workspace isolation** — independent agent pools, memory spaces, and security boundaries per workspace. Claude Code is one project per session.

4. **Desktop-first distribution via Tauri** — one-click install, not `npm install -g`. Dramatically lower barrier for non-technical users.

5. **Three-tier user model** — progressive complexity. Simple users see chat. Power users see agent configuration. Admins see the full orchestration layer. Claude Code has one mode for everyone.

6. **Encrypted vault (AES-256-GCM)** — Claude Code stores secrets in plaintext config files. Waggle's vault is enterprise-grade by default.

---

## WHAT NOT TO DO

- **Do NOT copy Claude Code source code.** IP risk is real. Extract patterns, not implementations.
- **Do NOT replace the graph DB with flat files.** The graph is the correct architecture. Add intelligence layers on top.
- **Do NOT adopt tmux-based multi-agent.** That is a CLI-specific workaround. Waggle's backend orchestrates agents natively.
- **Do NOT replicate the ink/ terminal rendering layer.** Waggle has a proper React UI framework.
- **Do NOT over-index on Claude Code's specific implementation choices.** Many are CLI constraints, not best practices. Adopt the design principles, not the code.

---

## EXECUTION SEQUENCE

**Phase 1 (P0 — 2-3 weeks):** Agent definition schema + tool pool assembly + token budget tracker. These three items unblock everything else. Without schema-enforced agent boundaries and token awareness, no subsequent workstream can be built correctly.

**Phase 2 (P1 — 4-6 weeks):** Coordinator mode + fork pattern + side-query relevance + compaction layers + tool factory. This is the production quality sprint. At the end of Phase 2, Waggle should be able to run multi-agent workflows that survive long sessions without context degradation.

**Phase 3 (P2 — 4-6 weeks):** Memory maturation (taxonomy, staleness, per-agent scopes) + streaming execution + deferred tool loading + task system + UI tier mapping. This is the competitive quality sprint. At the end of Phase 3, Waggle is demonstrably more capable than Claude Code for enterprise use cases.

**Phase 4 (P3-P4 — ongoing):** Polish, session persistence, enterprise permissions, team memory snapshots, skill marketplace. These are the features that justify enterprise pricing.

---

*Total actions: 37 across 6 workstreams. 3 P0, 7 P1, 19 P2, 6 P3, 2 P4.*
*Estimated total effort: 14-18 weeks for P0-P2, assuming dedicated engineering team.*