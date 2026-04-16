# Hive-Mind Integration Design — How It Actually Works in the Wild

**Date:** 2026-04-16
**Context:** hive-mind is an MCP server. MCP servers are passive — they respond to tool calls. They don't inject themselves into the host agent's behavior. This document addresses the gap between "21 tools available" and "the agent actually uses memory silently."

---

## The Problem

In Waggle OS, memory is deeply wired:

| Behavior | How Waggle does it |
|----------|-------------------|
| Auto-recall on every message | `orchestrator.recallMemory()` runs before every LLM call, results injected into system prompt |
| Auto-save after every exchange | `autoSaveFromExchange()` scans user+assistant messages, extracts save-worthy facts |
| Background cognify | Entity extraction, KG updates, relation linking run post-harvest |
| Session tracking | `SessionStore.ensureActive()` groups conversations |
| Identity context | `IdentityLayer.toContext()` pasted into system prompt |
| Awareness | Active tasks/goals injected into system prompt |
| Compaction | Old frames consolidated on schedule |
| Wiki | Compiled periodically from accumulated frames |

**In a standalone MCP server, NONE of this happens automatically.** The host agent (Claude Code, Cursor, Codex) sees 21 tools and has to choose to call them. Without instruction, it won't.

---

## The Solution: Three Integration Layers

### Layer 1: MCP Resources (Silent, Automatic)

MCP resources are read by the host agent at session start — they inject context without requiring a tool call. This is the "silent" layer.

**Current resources (already built):**
- `memory://personal/stats` — frame count, entity count
- `memory://identity` — who the user is
- `memory://awareness` — active tasks/goals
- `memory://workspace/{id}` — workspace context

**New resources needed for silent integration:**

| Resource URI | What it returns | When host reads it |
|---|---|---|
| `memory://context/recent` | Last 5-10 most important memories (auto-summarized) | Session start — gives the agent "I remember..." context |
| `memory://context/project/{path}` | Memories relevant to the current working directory | When the agent opens a project — gives project-specific recall |
| `memory://identity/summary` | One-paragraph identity context ("You're working with Marko, a...") | Session start — personalizes the agent immediately |
| `memory://skills/active` | User's custom skills extracted from past sessions | Session start — agent knows what patterns work |

**Why this matters:** Claude Code, Cursor, and Codex all read MCP resources automatically. No tool call needed. No user action needed. The agent opens a session, reads the resources, and already knows who you are, what you're working on, and what you've done before.

### Layer 2: CLAUDE.md / .cursorrules Instructions (Guided, Consistent)

The MCP server ships with a ready-to-paste instruction block that tells the host agent HOW to use memory:

```markdown
## Memory Integration (hive-mind)

You have persistent memory via the hive-mind MCP server. Follow these rules:

### On every conversation start:
- Call `recall_memory` with a summary of what the user is asking about
- Use recalled memories to ground your response — cite them naturally

### After every meaningful exchange:
- Call `save_memory` to store: decisions made, preferences expressed,
  facts learned, corrections received
- Set importance: "critical" for decisions, "important" for preferences,
  "normal" for facts, "temporary" for session-specific context

### Periodically (every ~10 exchanges):
- Call `cleanup_frames` to run maintenance (compaction, dedup)

### When the user mentions people, projects, or tools:
- Call `save_entity` to record them in the knowledge graph
- Call `create_relation` to link related entities

### Never:
- Pretend to remember something you don't have in memory
- Present memory content as your own reasoning — attribute it
```

**This ships as:**
- `~/.hive-mind/CLAUDE.md` (auto-generated on install for Claude Code)
- `~/.hive-mind/.cursorrules` (for Cursor)
- `~/.hive-mind/AGENTS.md` (for Codex)
- `~/.hive-mind/instructions.md` (generic, for any agent)

**The installer asks:** "Add memory instructions to your active agent? [Y/n]" and appends to the appropriate config file.

### Layer 3: CLI Hooks (Active, Event-Driven)

For hosts that support hooks (Claude Code), we wire event-driven memory:

```jsonc
// In ~/.claude/settings.json
{
  "hooks": {
    "SessionStart": [{
      "command": "hive-mind-cli recall-context",
      "description": "Load relevant memories at session start"
    }],
    "Stop": [{
      "command": "hive-mind-cli save-session",
      "description": "Save session learnings to memory"
    }]
  }
}
```

**`hive-mind-cli` commands:**
- `recall-context` — queries memory for recent/relevant context, outputs to stdout (injected into session)
- `save-session` — reads the session transcript, extracts save-worthy content, calls save_memory
- `harvest-local` — scans local AI tool history (Claude Code sessions, Cursor projects) and imports
- `cognify` — runs entity extraction + KG updates on recent frames
- `compile-wiki` — runs wiki compilation
- `maintenance` — compaction + dedup + reconciliation

**For hosts WITHOUT hooks (Cursor, Codex, Windsurf):**
- OS-level cron job runs `hive-mind-cli maintenance` daily
- `hive-mind-cli save-session` runs as a post-session script if the host supports it
- Otherwise, the Layer 2 instructions guide the agent to call tools explicitly

---

## The Installation Experience

### Scenario: User installs hive-mind for Claude Code

```
$ npm install -g @hive-mind/mcp-server

✓ Installed hive-mind v0.1.0

Setting up your memory...
  ✓ Created ~/.hive-mind/personal.mind (SQLite database)
  ✓ Initialized schema (frames, entities, knowledge graph)

Detecting AI tools on this machine...
  ✓ Claude Code found (12 projects, ~340 sessions)
  ✓ Cursor found (3 workspaces)
  ✗ Windsurf not found
  ✗ Codex not found

Would you like to harvest your existing AI history? [Y/n]
> Y

Harvesting Claude Code sessions...
  ████████████████████ 340/340 sessions
  → 2,847 frames created
  → 156 entities extracted
  → 43 knowledge relations linked
  → 12 identity signals detected

Harvesting Cursor projects...
  ████████████████████ 3/3 workspaces
  → 234 frames created

Your AI now remembers 3,081 things about your work.

Configure Claude Code integration? [Y/n]
> Y

  ✓ Added hive-mind to ~/.claude/settings.json (MCP server)
  ✓ Added memory instructions to project CLAUDE.md
  ✓ Added SessionStart hook (auto-recall)
  ✓ Added Stop hook (auto-save)

Done! Start a new Claude Code session — your AI will remember you.
```

### What happens on the next Claude Code session:

1. **Session starts** → `SessionStart` hook fires → `hive-mind-cli recall-context` runs → recent memories loaded
2. **MCP resources read** → Claude Code reads `memory://identity` + `memory://context/recent` → agent knows who you are and what you've been working on
3. **User asks a question** → Agent sees CLAUDE.md instructions → calls `recall_memory` with the query → gets relevant past context → grounds its response
4. **Agent responds** → CLAUDE.md instructions say to save → agent calls `save_memory` with key facts from the exchange
5. **Session ends** → `Stop` hook fires → `hive-mind-cli save-session` extracts and saves session summary
6. **Background** → OS cron runs `hive-mind-cli maintenance` nightly → cognify, compaction, wiki compilation

---

## How It Feels for Each Host

### Claude Code (deepest integration)
- **Silent recall at session start** via hook + resources
- **Auto-save at session end** via hook
- **Mid-session memory** via tool calls guided by CLAUDE.md instructions
- **Harvest on install** scans all Claude Code sessions automatically
- **Wiki compilation** via cron or manual `hive-mind-cli compile-wiki`
- **Feels like:** "This AI remembers everything across sessions. I never told it twice."

### Cursor
- **No hooks** — relies on .cursorrules instructions
- **MCP resources** provide identity + recent context at session start
- **Agent calls tools** based on instructions (less reliable than hooks)
- **Harvest on install** scans Cursor workspace history
- **Feels like:** "The AI usually remembers, especially when I ask about past work."

### Codex (OpenAI)
- **AGENTS.md** provides instructions
- **MCP tools** available but Codex may be less consistent about calling them
- **Harvest** limited to what Codex exposes (depends on their session export API)
- **Feels like:** "I can tell the AI to remember things and it does."

### Windsurf / Antigravity / Others
- **Generic instructions.md** shipped
- **MCP tools** available if the host supports MCP
- **Manual harvest** via file upload or paste
- **Feels like:** "It's a tool I can call when I need memory."

---

## The Daemon Question

**Waggle has a daemon.** It runs background processes continuously:
- Post-conversation cognify
- Session compaction (merge old sessions)
- Frame reconciliation
- Wiki compilation
- Improvement signal processing

**hive-mind doesn't have a daemon.** MCP servers are request-response. They start when a tool is called and stop when it returns.

**Three approaches to solve this:**

### Option A: Lazy Processing (simplest)
- Cognify runs inside `save_memory` — when you save a frame, entity extraction happens inline
- Compaction runs inside `recall_memory` — when you search, old frames get consolidated
- Wiki compiles inside `compile_wiki` tool call
- **Tradeoff:** each tool call is slower (adds 100-500ms), but no external process needed

### Option B: CLI Cron (recommended for production)
```cron
# Run nightly at 2 AM
0 2 * * * hive-mind-cli maintenance --cognify --compact --wiki
```
- Cognify, compaction, and wiki run as a batch job
- No impact on interactive tool call latency
- Works on every OS
- **Tradeoff:** memory isn't updated in real-time; there's a delay until the cron fires

### Option C: Background Service (full Waggle parity)
- `hive-mind-daemon` runs as a system service (systemd, Windows Service, launchd)
- Watches for new frames, runs cognify immediately
- Handles session lifecycle events
- Compiles wiki incrementally
- **Tradeoff:** heavier install, another process running, more things that can break

**Recommendation:** Ship with **Option A** (lazy) as default, **Option B** (cron) as documented setup for power users. Reserve **Option C** for when hive-mind has enough users to justify the complexity.

---

## Skills 2.0 + Learning: What Transfers

In Waggle, the agent:
- Detects repeated workflow patterns → auto-extracts SKILL.md files
- Tracks skill usage → retires idle skills after 90 days
- Records improvement signals (capability_gap, correction, workflow_pattern)
- Promotes skills through 4 tiers (personal → workspace → team → enterprise)

**What works in hive-mind standalone:**
- ✅ Skill extraction can happen inside `save_memory` (detect patterns in saved content)
- ✅ Skills stored as markdown files in `~/.hive-mind/skills/`
- ✅ MCP resource `memory://skills/active` surfaces them to the host agent
- ✅ CLAUDE.md instructions tell the agent to check skills before starting work

**What doesn't transfer without Waggle:**
- ❌ Real-time improvement signal detection (needs the agent loop)
- ❌ Skill promotion beyond personal scope (no team layer without Waggle Teams)
- ❌ Evolution (GEPA/EvolveSchema need the orchestrator + trace recorder)
- ❌ Behavioral spec overrides (host agent has its own behavioral rules)

**This is intentional.** hive-mind gives you memory. Waggle gives you intelligence. The upgrade path is clear: "Your AI remembers with hive-mind. With Waggle, it also learns and evolves."

---

## Harvest Targets — Complete List

| Platform | Method | Auto-detect | Status |
|----------|--------|-------------|--------|
| Claude Code | Filesystem scan (~/.claude/) | ✅ Yes | Built |
| Claude Desktop | GDPR export (claude.ai → Settings) | ❌ Manual | Built |
| ChatGPT | GDPR export (Settings → Data controls) | ❌ Manual | Built |
| Gemini | Google Takeout | ❌ Manual | Built |
| Perplexity | Settings → Export | ❌ Manual | Built |
| Cursor | Filesystem scan (~/.cursor/) | ✅ Yes | TODO |
| Windsurf | Filesystem scan | ✅ Possible | TODO |
| Codex | Depends on OpenAI export API | ❓ TBD | TODO |
| Antigravity | Depends on their session format | ❓ TBD | TODO |
| VS Code + Continue | Filesystem scan | ✅ Possible | TODO |
| Markdown files | Direct import | N/A | Built |
| PDF files | Direct import | N/A | Built |
| URLs | Fetch + parse | N/A | Built |
| Plain text | Direct import | N/A | Built |

**Auto-detect on install** is the key UX differentiator. The installer scans common paths for each tool and offers one-click harvest. No manual export needed for Claude Code and Cursor.

---

## What Ships in v1 vs v2

### v1 (launch)
- MCP server with 21 tools + 4 resources
- CLI with recall-context, save-session, harvest-local, maintenance
- Auto-detect + harvest for Claude Code + Cursor
- Manual harvest for ChatGPT, Claude, Gemini, Perplexity (via GDPR export)
- CLAUDE.md / .cursorrules instruction templates
- Lazy cognify (inline in save_memory)
- Cron setup docs for maintenance
- Wiki compilation via tool call

### v2 (post-launch)
- New MCP resources: `memory://context/project/{path}`, `memory://skills/active`
- Claude Code hooks integration (SessionStart auto-recall, Stop auto-save)
- Windsurf + Codex + Antigravity adapters
- Background daemon option
- Skill auto-extraction from saved patterns
- Cross-project memory linking
- Export to Obsidian vault format

---

## The Upgrade Funnel

```
hive-mind (free, OSS)
  "Your AI remembers across sessions"
  ↓ user hits limits ↓
Waggle Free
  "Full desktop OS with 22 personas, 60+ tools, KG viewer, wiki UI"
  ↓ needs more workspaces ↓
Waggle Pro ($19/mo)
  "Unlimited workspaces, marketplace, compliance reports"
  ↓ team needs shared memory ↓
Waggle Teams ($49/seat)
  "Shared memory, WaggleDance, governance"
  ↓ enterprise needs sovereign ↓
KVARK
  "Your infrastructure, your data, your rules"
```

hive-mind is the top of the funnel. It works great standalone. But the moment the user wants a GUI, or personas, or team memory, or compliance reports, or self-evolution — they upgrade to Waggle. The memory they've built in hive-mind carries over seamlessly (same SQLite format, same ~/.hive-mind/ directory).

---

*This is the integration design, not the implementation. Code changes needed are tracked in REMAINING-BACKLOG-2026-04-16.md.*
