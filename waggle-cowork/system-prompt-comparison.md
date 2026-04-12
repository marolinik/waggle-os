# System Prompt Comparison: Waggle OS vs Claude Code

**Date:** 2026-04-01
**Analyst:** Cowork Advisory Session
**Source:** Waggle OS `packages/agent/src/` + Claude Code `src/src/constants/` and subsystem prompts

---

## EXECUTIVE VERDICT

Waggle's system prompt architecture is **more sophisticated in design** but **less disciplined in execution** than Claude Code's. Waggle has features Claude Code lacks entirely (dual-mind memory, identity layer, self-awareness injection, workspace tone adaptation, cognify pipeline, knowledge graph queries). But Claude Code's prompt engineering is tighter — more modular, more cacheable, more defensively written. The gap is not in what Waggle says, but in how precisely it says it.

---

## ARCHITECTURE COMPARISON

### Waggle OS Prompt Assembly

```
buildSystemPrompt()
├── # Identity (from personal mind — IdentityLayer)
├── # Self-Awareness (runtime: tools, skills, model, memory stats, improvement signals)
├── # Context From Your Memory (auto-loaded recent frames, ranked by importance)
│   ├── Recent Workspace Memory (importance-first, then recency)
│   ├── Active Tasks & State (from AwarenessLayer)
│   ├── Key Knowledge (top 10 entities from KnowledgeGraph by relationship count)
│   └── Personal Preferences (cross-workspace, from personal mind)
├── BEHAVIORAL_SPEC.rules (static — core loop, quality rules, behavioral rules, tool descriptions)
├── composePersonaPrompt()
│   ├── Core prompt
│   ├── DOCX hint
│   ├── Workspace tone instruction (professional/casual/technical/legal/marketing)
│   └── Persona-specific systemPrompt (e.g., Researcher, Writer, Analyst...)
└── recallMemory() → injected per-turn as recalled context
    ├── Workspace Memory (semantic search or importance-based for catch-up queries)
    └── Personal Memory (cross-workspace)
```
### Claude Code Prompt Assembly

```
resolveSystemPromptSections()
├── getSimpleIntroSection() — base identity
├── getSimpleSystemSection() — interactive agent instructions
├── getSimpleDoingTasksSection() — software engineering guidance
├── getActionsSection() — safety and execution caution
├── getUsingYourToolsSection() — tool usage patterns
├── getSimpleToneAndStyleSection() — communication style
├── getOutputEfficiencySection() — response efficiency
├── [Dynamic sections — cached until /clear or /compact]
│   ├── session_guidance
│   ├── memory (from MEMORY.md + side-query selected files)
│   ├── env_info_simple (OS, git status, date)
│   ├── language (locale)
│   ├── output_style
│   ├── mcp_instructions (per connected MCP server)
│   ├── scratchpad (coordinator shared state dir)
│   ├── token_budget (when enabled)
│   └── brief (when KAIROS enabled)
├── [Agent-specific override — replaces or extends base]
│   ├── Coordinator Mode (complete replacement — 4000+ word prompt)
│   ├── Explore Agent (read-only, file search specialist)
│   ├── Plan Agent (read-only, software architect)
│   ├── Verification Agent (try-to-break-it specialist)
│   └── General Purpose Agent (default subagent)
└── [Per-turn injections]
    ├── findRelevantMemories() → Sonnet side-query selects top-5 memory files
    ├── Skill prefetch (relevant skills discovered from query)
    └── getUserContext() → CLAUDE.md files, git context
```

---

## HEAD-TO-HEAD: WHAT EACH DOES BETTER

### Where Waggle Is Ahead

**1. Dual-Mind Architecture (Personal + Workspace)**
Waggle separates memory into a personal mind (preferences, style, identity — carries across all workspaces) and a workspace mind (project context, decisions, domain knowledge — scoped to workspace). Claude Code has a single memory directory per project. It cannot carry personal preferences across projects without manual duplication.

This is a genuine architectural advantage. When a user moves between a "Marketing" workspace and a "Engineering" workspace, their communication style preferences follow them. Their project context does not bleed across.

**2. Identity Layer**
Waggle has `IdentityLayer` — a persistent identity that loads into every system prompt. Claude Code has no equivalent. The model re-derives its identity from the system prompt text every session.

**3. Knowledge Graph Integration**
Waggle loads top-10 entities by relationship count from `KnowledgeGraph` into context. This provides structured domain knowledge beyond free-text memory. Claude Code's memory is pure free-text markdown.

**4. Self-Awareness Injection**
`buildSelfAwareness()` injects runtime capabilities (tools available, skills loaded, model name, memory stats, improvement signals) into the system prompt. The agent knows what it can do. Claude Code agents know their tools from the tool schemas, but don't have a synthesized self-awareness section.

**5. Improvement Signal Surfacing**
`ImprovementSignalStore` + `buildAwarenessSummary()` detects behavioral patterns that need correction and surfaces them in the system prompt. Once surfaced, they're marked so they don't repeat. Claude Code has no equivalent self-correction mechanism at the prompt level.

**6. Workspace Tone Adaptation**
`composePersonaPrompt()` accepts a `workspaceTone` parameter (professional/casual/technical/legal/marketing) that appends tone instructions. Tone varies by workspace. Claude Code has a fixed tone section.
**7. Cognify Pipeline**
`CognifyPipeline` processes raw content into structured memory (frames, entities, relationships) before storage. Claude Code stores memories as-is — no processing pipeline between input and persistence.

**8. Catch-Up Query Detection**
`recallMemory()` detects "catch me up" / "where were we" patterns and switches from semantic search to importance-based recall. Claude Code uses the same side-query relevance filter regardless of query intent.

**9. 13 Personas with Tool Boundaries**
Waggle has 13 distinct personas, each with explicit tool arrays, workspace affinity, suggested commands, and default workflows. Claude Code has 5 built-in agents (general-purpose, explore, plan, verification, claude-code-guide) — functional but role-limited.

**10. Custom Persona System**
Users can create custom personas as JSON files in `~/.waggle/personas/`. These are loaded and merged with built-in personas at startup. Claude Code supports custom agents via markdown files, but Waggle's JSON format carries more metadata (icon, workspace affinity, suggested commands, default workflow).

---

### Where Claude Code Is Ahead

**1. Section Caching Architecture**
`systemPromptSection()` memoizes each section. `DANGEROUS_uncachedSystemPromptSection()` is explicitly marked as cache-breaking, with a required reason parameter. This means Claude Code's system prompt is prompt-cache-friendly by design — sections don't recompute unless they must.

Waggle's `buildSystemPrompt()` recomputes everything every time. With API prompt caching, this means Waggle pays full token cost on every turn for sections that haven't changed. At scale, this is a significant cost and latency penalty.

**2. Side-Query Relevance Filter**
Claude Code's `findRelevantMemories()` uses a lightweight Sonnet call to scan memory file headers and select only the top-5 relevant files before loading them into context. This is token-efficient and semantically precise.

Waggle's `recallMemory()` does a full semantic search (embedding-based) which is good, but then injects ALL results (up to limit) into context. There's no secondary LLM-based relevance filter to eliminate noise.

**3. Agent Prompt Discipline**
Claude Code's agent prompts are defensively written:
- Explore Agent: "=== CRITICAL: READ-ONLY MODE - NO FILE MODIFICATIONS ===" with explicit lists of prohibited operations
- Verification Agent: "Your job is not to confirm the implementation works — it's to try to break it" with documented failure patterns
- Coordinator: "Never delegate understanding" with explicit anti-patterns

Waggle's persona prompts are guidance-oriented ("You specialize in...") rather than boundary-enforced. There are no explicit prohibitions, no critical safety blocks, no documented failure patterns. A Researcher persona could theoretically write files even though its intent is read-only research.

**4. Verification Agent (No Waggle Equivalent)**
Claude Code has a dedicated verification agent whose entire purpose is adversarial — it tries to break implementations. It has a required output format (VERDICT: PASS/FAIL/PARTIAL), a universal baseline checklist, and documented self-deception patterns to avoid.

Waggle has no adversarial verification persona. Adding one would immediately improve quality assurance for generated outputs.

**5. Coordinator Mode (Pure Orchestrator)**
Claude Code's coordinator gets ONLY Agent + SendMessage + TaskStop tools. It cannot execute anything directly. Workers report via structured `<task-notification>` XML. The coordinator must synthesize before delegating.

Waggle's orchestrator exists (`orchestrator.ts`) but operates as a memory/context manager, not as a delegation-only coordinator. There is no mode where the orchestrator is restricted to pure delegation.

**6. Compact/Summarization Prompt**
Claude Code has a dedicated summarization prompt with strict formatting (9 required sections) and a critical preamble: "CRITICAL: Respond with TEXT ONLY. Do NOT call any tools." This ensures context compaction is predictable and tool-free.

Waggle has no equivalent compaction prompt. Long sessions will eventually hit context limits without a structured way to compress history.
**7. Modular Section Independence**
Each Claude Code section is independently computable and cacheable. Sections can be added, removed, or reordered without affecting others. Waggle's `BEHAVIORAL_SPEC.rules` is a single 280-line monolithic string — any change invalidates the entire section.

**8. Feature-Gated Progressive Enhancement**
Claude Code gates advanced features (`CLAUDE_CODE_COORDINATOR_MODE`, `CLAUDE_FORK_SUBAGENT`, `CLAUDE_AUTO_BACKGROUND_TASKS`) behind environment flags. This allows gradual rollout and A/B testing. Waggle's BEHAVIORAL_SPEC notes "future A/B testing" in comments but has no gating mechanism implemented.

---

## BEHAVIORAL SPEC DEEP COMPARISON

### Waggle's BEHAVIORAL_SPEC.rules (280 lines)

**Structure:**
1. HOW YOU THINK — Core Loop (RECALL → ASSESS → ACT → LEARN → RESPOND)
2. RESPONSE QUALITY RULES (anti-hallucination, structured output, context grounding, disclaimers)
3. BEHAVIORAL RULES (memory-first, tool intelligence, narration heuristics, error recovery, planning)
4. HIGH-VALUE WORK PATTERNS (drafting from context, decision compression, research in context)
5. TOOLS (full tool catalog with descriptions and usage guidance)
6. Intelligence Defaults (skill check, workflow routing, sub-agent delegation, command awareness, capability discovery)

**Strengths:**
- The 5-step core loop (RECALL → ASSESS → ACT → LEARN → RESPOND) is well-designed and covers the full reasoning cycle
- Anti-hallucination discipline is explicit and enforced ("ALWAYS distinguish what you KNOW from what you're REASONING")
- Memory correction handling is sophisticated ("If you find a prior memory that says X but the user now claims Y, surface the conflict")
- Drafting patterns are detailed with type-specific guidance
- Capability acquisition flow is well-specified (acquire_capability → install_capability → apply)

**Weaknesses:**
- Monolithic — 280 lines in a single template literal, not decomposable
- Tool descriptions are inline rather than pulled from tool definitions
- No explicit safety boundaries — no "NEVER do X" blocks for destructive operations
- No documented failure patterns — doesn't tell the model what mistakes to avoid
- Disclaimer contamination — the test report shows disclaimers bleeding into all responses despite the contextual rules

### Claude Code's System Prompt Sections (~500 lines across 7+ sections)

**Structure:**
- Intro (identity)
- System (interactive agent role)
- Doing Tasks (software engineering focus)
- Actions (safety and caution)
- Using Your Tools (tool patterns)
- Tone and Style (communication)
- Output Efficiency (response format)
- Dynamic sections (memory, MCP, environment, etc.)

**Strengths:**
- Each section is independently cacheable
- Actions section has explicit safety rules ("consider whether there is a safer alternative")
- Agent-specific prompts have hard boundaries ("=== CRITICAL: READ-ONLY MODE ===")
- Verification agent has documented self-deception patterns
- Coordinator has anti-pattern examples ("Avoid lazy delegation phrases")

**Weaknesses:**
- No equivalent of Waggle's 5-step core loop — reasoning process is less structured
- No anti-hallucination section — relies on model's baseline behavior
- No memory correction handling — doesn't tell the model how to handle conflicting memories
- No self-improvement mechanism — no equivalent of improvement signal surfacing
- Narrowly focused on software engineering — not a general-purpose assistant framework
---

## PERSONA COMPARISON

| Aspect | Waggle Personas | Claude Code Agents |
|--------|----------------|-------------------|
| Count | 13 built-in + custom JSON | 5 built-in + custom markdown |
| Schema | AgentPersona interface (id, name, description, icon, systemPrompt, modelPreference, tools[], workspaceAffinity[], suggestedCommands[], defaultWorkflow) | BaseAgentDefinition (agentType, whenToUse, tools, disallowedTools, skills, mcpServers, hooks, model, maxTurns, memory, isolation, permissionMode, background, initialPrompt) |
| Prompt style | Guidance-oriented ("You specialize in...") | Boundary-enforced ("=== CRITICAL: READ-ONLY ===") |
| Tool control | Allowlist only (tools[]) | Allowlist + denylist (tools + disallowedTools) |
| Safety boundaries | None explicit — personas suggest tools but don't prohibit | Hard prohibitions per agent type |
| Workflow integration | defaultWorkflow field links to workflow templates | No workflow concept — agents are stateless |
| Custom source | JSON files in ~/.waggle/personas/ | Markdown files in .claude/agents/ |
| Priority override | No explicit priority chain | managed > flag > project > user > plugin > built-in |

### Waggle Personas (13)
Researcher, Writer, Analyst, Coder, Project Manager, Executive Assistant, Sales Rep, Marketer, Senior PM, HR Manager, Legal Counsel, Business Finance, Strategy Consultant

### Claude Code Agents (5)
General Purpose, Explore (read-only), Plan (read-only architect), Verification (adversarial), Claude Code Guide

**Key observation:** Waggle has more role diversity (13 vs 5) but Claude Code's agents are more architecturally distinct. Waggle's personas are variations on a general-purpose agent with different tool sets and guidance. Claude Code's agents have fundamentally different operating modes — Explore literally cannot write, Verification tries to break things, Coordinator only delegates.

---

## SPECIFIC IMPROVEMENTS FOR WAGGLE

### P0: Prompt Caching (Immediate ROI)

Refactor `buildSystemPrompt()` to use a section-based architecture with memoization:
```
systemPromptSection('identity', () => identity.toContext())    // changes rarely
systemPromptSection('behavioral_spec', () => BEHAVIORAL_SPEC.rules) // changes on version bump
systemPromptSection('self_awareness', () => buildSelfAwareness(caps)) // changes per turn
systemPromptSection('recent_context', () => loadRecentContext()) // changes per turn
```
Mark sections that change per-turn as `uncached`. All others cache until explicitly cleared. This enables API prompt caching and reduces per-turn token costs significantly.

### P0: Break Up BEHAVIORAL_SPEC

Split the 280-line monolithic string into independent sections:
- Core loop (RECALL → ASSESS → ACT → LEARN → RESPOND) — stable, cacheable
- Quality rules — stable, cacheable
- Behavioral rules — stable, cacheable
- Tool descriptions — should be generated from tool definitions, not hardcoded
- Intelligence defaults — evolves with capabilities, semi-stable

### P1: Add Safety Boundaries to Personas

Each persona needs explicit prohibitions, not just guidance:
```
Researcher:
  === READ-ONLY PERSONA ===
  You are PROHIBITED from: write_file, edit_file, git_commit, bash (write operations)

Writer:
  === DOCUMENT CREATION PERSONA ===
  You may create/edit files in the workspace. You are PROHIBITED from: bash, git_*, any system commands
```

### P1: Add Verification Persona

Create a 14th persona: **Verifier** — adversarial quality assurance:
- Tries to break generated outputs
- Required output format: VERDICT: PASS / FAIL / PARTIAL
- Documents what was checked and how
- Universal baseline: re-read the brief, check facts against memory, verify formatting, check for hallucinated citations

### P1: Add Coordinator Persona

Create a 15th persona: **Coordinator** (Mission Control):
- Tools: ONLY spawn_agent, list_agents, get_agent_result
- Cannot execute tasks directly
- Must synthesize worker results before further delegation
- "Never delegate understanding" principle from Claude Code

### P2: Implement Compaction Prompt

Create a dedicated summarization prompt for long sessions:
- TEXT ONLY output (no tool calls)
- Required sections: primary request, key decisions, current state, pending work
- Triggered when context exceeds threshold
- Output replaces conversation history while preserving essential context
### P2: Fix Disclaimer Contamination

The test report documents P1-8: workspace-specific financial disclaimers appended to ALL responses including "What is 2+2?". The BEHAVIORAL_SPEC has contextual disclaimer rules, but they're being overridden by workspace profile injection.

Fix: Workspace profile content should be injected as context, not as mandatory behavioral rules. The BEHAVIORAL_SPEC already has the correct contextual logic — the workspace profile is circumventing it.

### P2: Add Memory Conflict Resolution to Core Loop

Waggle already has this in BEHAVIORAL_SPEC:
> "When corrected on FACTS that contradict a stored memory: DO NOT blindly accept. Search memory first. If you find a prior memory that says X but the user now claims Y, surface the conflict."

This is good. But it should be elevated to a CRITICAL rule with explicit enforcement, not buried in paragraph text. Claude Code doesn't have this at all — Waggle should lean into it as a differentiator.

### P3: Feature Gate Progressive Enhancement

Implement environment-based feature flags for:
- Coordinator mode (restrict orchestrator to delegation-only)
- Advanced workflows (compose_workflow, orchestrate_workflow)
- Auto-save aggressiveness
- Capability acquisition (auto-suggest vs. manual)

This enables A/B testing and gradual rollout as noted in the BEHAVIORAL_SPEC v2.0 comments.

---

## SUMMARY MATRIX

| Dimension | Waggle OS | Claude Code | Winner |
|-----------|-----------|-------------|--------|
| **Prompt architecture** | Monolithic buildSystemPrompt() | Section-based with caching | Claude Code |
| **Memory integration** | Dual-mind (personal + workspace) + knowledge graph | Single flat-file directory + side-query | Waggle |
| **Identity persistence** | IdentityLayer + personal mind | None (re-derived from prompt) | Waggle |
| **Persona diversity** | 13 personas + custom JSON | 5 agents + custom markdown | Waggle |
| **Safety boundaries** | Guidance-oriented (soft) | Prohibition-enforced (hard) | Claude Code |
| **Verification** | None | Dedicated adversarial agent | Claude Code |
| **Coordinator pattern** | Orchestrator as context manager | Pure delegation-only mode | Claude Code |
| **Reasoning loop** | Explicit 5-step (RECALL→RESPOND) | Implicit in sections | Waggle |
| **Anti-hallucination** | Explicit rules with memory conflict handling | Baseline model behavior | Waggle |
| **Self-improvement** | ImprovementSignalStore + awareness surfacing | None | Waggle |
| **Context compaction** | None | 4-layer compaction with dedicated prompt | Claude Code |
| **Tone adaptation** | Per-workspace tone presets | Fixed style section | Waggle |
| **Custom extensibility** | JSON personas + skill marketplace | Markdown agents + plugin system | Tie |
| **Catch-up intelligence** | Pattern detection → importance-based recall | Same relevance filter for all queries | Waggle |
| **Cache efficiency** | Full recompute per turn | Section-level memoization | Claude Code |
| **Tool descriptions** | Inline in behavioral spec (static) | Generated from tool definitions (dynamic) | Claude Code |

**Score: Waggle 8, Claude Code 6, Tie 1**

Waggle wins on intelligence and sophistication. Claude Code wins on discipline and engineering efficiency. The improvement plan bridges both: bring Claude Code's caching, safety boundaries, and compaction into Waggle's more capable architecture.

---

*This comparison should be read alongside the consolidated improvement plan (`waggle-os-improvement-plan.md`) which incorporates these findings into actionable workstreams.*