# Capabilities

Capabilities are the extensions that make Waggle powerful: skills, plugins, MCP servers, workflow templates, hooks, and commands. This guide covers how to discover, install, and manage them.

## Capability Types

| Type | What It Is | Storage |
|------|-----------|---------|
| **Skill** | Markdown file that extends the agent's system prompt with domain knowledge and instructions | `~/.waggle/skills/*.md` |
| **Plugin** | Structured package with a manifest that adds tools and behaviors | `~/.waggle/plugins/` |
| **MCP Server** | Model Context Protocol server that provides external tools | Configured in settings |
| **Workflow Template** | Multi-step agent orchestration (e.g., research-team, review-pair, plan-execute) | Built into `@waggle/agent` |
| **Hook** | Event-driven callback (before/after tool calls, session start/end, etc.) | Registered in agent state |
| **Command** | Slash command (`/research`, `/draft`, etc.) | Built into `@waggle/agent` |

## Built-in Capability Packs

Waggle ships with 5 curated packs. Each pack bundles several skills that work together.

### Research Workflow

Skills for investigation and synthesis. Includes `research-synthesis`, `explain-concept`, and the `research-team` multi-agent workflow.

### Writing Suite

Skills for document creation and editing. Includes `draft-memo`, `compare-docs`, and `extract-actions`.

### Planning Master

Skills for task decomposition and execution. Includes `daily-plan`, `task-breakdown`, and the `plan-execute` workflow.

### Team Collaboration

Skills for coordination and communication. Includes `catch-up`, `status-update`, and `meeting-prep`.

### Decision Framework

Skills for structured decision-making. Includes `decision-matrix`, `risk-assessment`, and `retrospective`.

## Installing Packs

### From the UI

1. Navigate to **Capabilities** in the sidebar (or click the grid icon)
2. Click **Browse Packs**
3. Each pack shows its skills, install state (available / incomplete / complete), and description
4. Click **Install** to install all skills in the pack at once
5. Already-installed skills are skipped

### From the API

```bash
# Install the Research Workflow pack
curl -X POST http://localhost:3333/api/skills/capability-packs/research-workflow

# Install a single skill from the starter pack
curl -X POST http://localhost:3333/api/skills/starter-pack/draft-memo
```

## Installing Individual Skills

### From the Starter Catalog

1. Go to **Capabilities** > **Skills**
2. Browse by family: Writing & Docs, Research & Analysis, Decision Support, Planning & Organization, Communication, Code & Engineering, Creative & Ideation
3. Click **Install** on any skill
4. The skill is copied to `~/.waggle/skills/` and loaded immediately

### Creating Custom Skills

Skills are markdown files. Create a file in `~/.waggle/skills/`:

```markdown
# My Custom Skill

Instructions for the agent when this skill is active.

## When to Use
- Trigger conditions

## How to Respond
- Response format guidelines
- Quality standards
```

Or use the API:

```bash
curl -X POST http://localhost:3333/api/skills \
  -H "Content-Type: application/json" \
  -d '{"name": "my-skill", "content": "# My Skill\n\nInstructions here."}'
```

## Marketplace

The marketplace catalog contains 120+ packages across skills, plugins, and MCP servers from curated sources.

### Searching

```bash
# Search by keyword
curl "http://localhost:3333/api/marketplace/search?query=research&limit=10"

# Filter by type
curl "http://localhost:3333/api/marketplace/search?type=skill&category=analysis"
```

Or use the `/marketplace search <query>` slash command in any workspace.

### Installing from Marketplace

```bash
# Install by package ID
curl -X POST http://localhost:3333/api/marketplace/install \
  -H "Content-Type: application/json" \
  -d '{"packageId": 42}'
```

Or use `/marketplace install <name>`.

### Security Scanning

Every marketplace install goes through the **SecurityGate** scanner. Results determine whether the install proceeds:

| Severity | Action |
|----------|--------|
| CLEAN | Install proceeds immediately |
| LOW | Install proceeds, logged to audit trail |
| MEDIUM | Install proceeds with warnings in response |
| HIGH | Blocked unless `force=true` (override logged to audit) |
| CRITICAL | Always blocked, cannot override |

### Syncing the Catalog

```bash
# Sync from all configured sources
curl -X POST http://localhost:3333/api/marketplace/sync
```

Or use `/marketplace sync`.

## Trust Model

Waggle uses a multi-layer trust model:

1. **Source trust** -- starter-pack skills are trusted by default; marketplace and user-created skills get assessed
2. **Content analysis** -- heuristic scan for dangerous patterns (credential access, network calls, file system mutations)
3. **Risk level** -- low, medium, high, critical based on what the capability does
4. **Approval class** -- standard (auto-approve), review (log), force-override (user acknowledged risk), blocked
5. **Content hash** -- SHA-256 hash of each skill file, checked at startup to detect unauthorized modifications

### Audit Trail

Every install, uninstall, and security decision is recorded in the audit store. View it:

- **UI**: Capabilities > Cockpit > Trust Audit section
- **API**: `GET /api/audit/installs`

### Hash Verification

At startup, Waggle checks each installed skill's content hash against the stored hash. If a skill file was modified outside of Waggle, it is flagged in the hash status:

```bash
curl http://localhost:3333/api/skills/hash-status
```

## Plugins

Plugins are structured packages with manifests that can add tools and extend agent behavior.

### Installing a Plugin

```bash
curl -X POST http://localhost:3333/api/plugins/install \
  -H "Content-Type: application/json" \
  -d '{"sourceDir": "/path/to/my-plugin"}'
```

### Enabling / Disabling

```bash
# Enable
curl -X POST http://localhost:3333/api/capabilities/plugins/my-plugin/enable

# Disable
curl -X POST http://localhost:3333/api/capabilities/plugins/my-plugin/disable
```

### Uninstalling

```bash
curl -X DELETE http://localhost:3333/api/plugins/my-plugin
```

## Viewing Capability Status

The **Cockpit** (accessible from the sidebar) shows a live dashboard of all capabilities:

- **Plugins**: name, state, tool count, skill count
- **MCP Servers**: name, state, healthy status, tool count
- **Skills**: name, content length
- **Tools**: total count (native + plugin + MCP)
- **Commands**: all registered slash commands
- **Hooks**: registered count, recent activity log
- **Workflows**: available templates with step counts

API equivalent:

```bash
curl http://localhost:3333/api/capabilities/status
```
