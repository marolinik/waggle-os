# Commands Reference

Waggle provides 14 slash commands for quick actions. Type `/` in any workspace to see autocomplete suggestions.

## Command List

| Command | Aliases | Args | Description |
|---------|---------|------|-------------|
| `/catchup` | `/catch-up`, `/recap` | -- | Workspace restart summary. Shows recent activity, memories, and state so you can get up to speed instantly. |
| `/now` | `/current`, `/where` | -- | Current workspace state. What is happening right now -- active threads, recent changes, open items. |
| `/research` | `/investigate` | `<topic>` | Launch multi-agent research. Spawns the `research-team` workflow with multiple agents investigating the topic in parallel. |
| `/draft` | `/write` | `<type> [topic]` | Start a drafting workflow. Supports any document type: blog, report, email, proposal, memo. Uses the `review-pair` workflow for drafts with review. |
| `/decide` | `/decision`, `/weigh` | `<question>` | Create a structured decision matrix with options, pros/cons, risk, and effort columns. Provides an evaluation framework for systematic decision-making. |
| `/review` | `/critique`, `/check` | -- | Review the last output with a critic agent. Spawns the `review-pair` workflow to analyze the most recent response for accuracy and completeness. |
| `/spawn` | `/agent`, `/summon` | `<role> [task]` | Spawn a specialist sub-agent. Available roles: `researcher`, `writer`, `coder`, `analyst`, `reviewer`, `planner`. |
| `/skills` | `/abilities`, `/tools` | -- | Show active skills in this workspace. Lists all loaded skill files with their names. |
| `/status` | `/report`, `/progress` | -- | Project status summary. Shows workspace state including tasks, progress, blockers, and recent activity. |
| `/memory` | `/remember`, `/recall` | `[query]` | Search workspace memory. Without arguments, shows usage help. With a query, searches both personal and workspace minds. |
| `/plan` | `/decompose`, `/break-down` | `<goal>` | Break a goal into actionable tasks. Uses the `plan-execute` workflow to create a structured task list with dependencies. |
| `/focus` | `/narrow`, `/scope` | `<topic>` | Narrow agent focus to a specific topic. Subsequent responses prioritize this context. Use again to change focus. |
| `/marketplace` | `/mp`, `/market` | `<subcommand> [args]` | Marketplace operations. Sub-commands: `search`, `install`, `packs`, `installed`, `sync`. See details below. |
| `/help` | `/commands`, `/?` | -- | List all available commands with descriptions. |

## Detailed Examples

### /catchup

```
/catchup
```

Output: A structured briefing with what this workspace is about, recent sessions, decisions, memory count, and suggested next steps. Use this every time you return to a workspace after a break.

### /research

```
/research quantum computing applications in drug discovery
```

Spawns the `research-team` multi-agent workflow:
1. A researcher agent investigates the topic
2. Findings are synthesized and cross-referenced
3. Results are presented with citations and confidence levels

### /draft

```
/draft blog post about AI safety best practices
/draft report quarterly metrics for Q1 2026
/draft email to client about project timeline changes
```

The agent determines the document type from the first word and adapts its formatting accordingly. If the `review-pair` workflow is available, the draft goes through a review cycle.

### /decide

```
/decide Should we use PostgreSQL or MongoDB for the new project?
```

Produces a decision matrix template:

| Option | Pros | Cons | Risk | Effort |
|--------|------|------|------|--------|
| PostgreSQL | | | | |
| MongoDB | | | | |

Ask the agent to fill it in: "Please analyze this decision for me."

### /spawn

```
/spawn researcher Find recent papers on transformer architectures
/spawn coder Implement a rate limiter middleware
/spawn analyst Compare our metrics against industry benchmarks
```

The sub-agent runs with the specified role and task, then returns its results to the main conversation.

### /memory

```
/memory architecture decisions
/memory last meeting notes
/memory project goals
```

Searches both personal and workspace memory using FTS5 full-text search. Results include content, importance level, and dates.

### /plan

```
/plan Build a user dashboard with analytics
/plan Migrate the database to PostgreSQL
```

Creates a structured plan with ordered steps, dependencies, and success criteria. The agent can then execute steps sequentially.

### /marketplace

```
/marketplace search research
/marketplace install deep-research
/marketplace packs
/marketplace installed
/marketplace sync
```

| Sub-command | Description |
|-------------|-------------|
| `search <query>` | Search the marketplace catalog by keyword. Returns up to 10 results with name, type, category, and description. |
| `install <name>` | Install a package by name. Searches for the best match, runs SecurityGate scan, and installs. |
| `packs` | List all capability packs grouped by priority tier. |
| `installed` | Show all currently installed packages with status and install date. |
| `sync` | Trigger a manual sync from all configured marketplace sources. Reports added/updated counts. |

## Command Parsing

Commands follow the format `/commandName arg1 arg2 ...`. The parser:

1. Strips the leading `/`
2. Splits on the first space to get the command name and arguments
3. Resolves aliases (e.g., `/mp` resolves to `/marketplace`)
4. Executes the handler with the argument string and workspace context

Partial matching is supported for autocomplete but not for execution. You must type the full command name or alias.

## Adding Custom Commands

Commands are registered in the `CommandRegistry`. To add a custom command, create a `CommandDefinition` with:

- `name` -- the primary command name (lowercase)
- `aliases` -- alternative names
- `description` -- shown in `/help` output
- `usage` -- usage string with argument placeholders
- `handler` -- async function receiving `(args: string, context: CommandContext)`

See `packages/agent/src/commands/` for implementation examples.
