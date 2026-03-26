# Getting Started with Waggle

This guide walks you through installing Waggle, configuring your API key, creating your first workspace, having your first conversation, and understanding how memory works.

## Prerequisites

- **Node.js 20+** (for local server and CLI)
- **An LLM API key** (Anthropic recommended; OpenAI, Google, and 100+ others supported)
- **Rust toolchain** (only if building the desktop app from source)

## Installation

### Option 1: Desktop App (Recommended)

Download the latest release for your platform from [GitHub Releases](https://github.com/marolinik/waggle/releases).

**Windows**: Run the `.msi` installer. Waggle appears in your Start menu.

**macOS**: Open the `.dmg` and drag Waggle to Applications.

The desktop app bundles a Node.js sidecar that runs the local server automatically.

### Option 2: CLI / Web

If you prefer a browser-based interface or want to run Waggle without the desktop shell:

```bash
# Clone the repository
git clone https://github.com/marolinik/waggle.git
cd waggle
npm install

# Start the local server
cd packages/server
npx tsx src/local/start.ts
```

The server starts on http://localhost:3333. Open it in any browser.

### Option 3: CLI REPL

For a terminal-native experience:

```bash
cd packages/cli
npx tsx src/index.ts
```

## Step 1: Add Your API Key

Waggle needs at least one LLM provider key to function. Anthropic (Claude) is recommended.

### Desktop / Web UI

1. Open **Settings** (gear icon in the sidebar or press `Ctrl+,`)
2. Go to the **Models** tab
3. Click **Add Provider**
4. Select **Anthropic** and paste your API key (starts with `sk-ant-`)
5. Click **Save**

Your key is stored in the local vault (AES-256-GCM encrypted), never sent to Waggle's servers.

### CLI / Config File

Edit `~/.waggle/config.json`:

```json
{
  "defaultModel": "claude-sonnet-4-6",
  "providers": {
    "anthropic": {
      "apiKey": "sk-ant-your-key-here",
      "models": ["claude-sonnet-4-6", "claude-haiku-3"]
    }
  }
}
```

### Verify Your Key

In Settings > Models, click **Test Key**. A green checkmark means you are ready.

## Step 2: Create Your First Workspace

Workspaces are the core organizational unit in Waggle. Each workspace has its own memory, sessions, files, and context. Think of a workspace as a dedicated brain for a project or topic.

1. Press **Ctrl+N** or click **New Workspace** in the sidebar
2. Enter a name (e.g., "Product Research" or "Q1 Planning")
3. Choose a group (e.g., "Work", "Personal", "Learning")
4. Optionally select a persona (Researcher, Writer, Coder, etc.)
5. Optionally link a directory on disk for file-aware operations
6. Click **Create**

You land on the **Workspace Home** screen. It shows a summary, suggested prompts, and recent threads.

## Step 3: Your First Conversation

Type a message in the input area. Here are good first messages:

- "Tell me about this project so I can remember it"
- "Help me think through what to work on first"
- "What can you do in this workspace?"

The agent responds with streaming output. You will see:

- **Tool calls** shown as collapsible cards (file reads, web searches, memory saves)
- **Memory saves** happening automatically when the agent learns something important
- **Approval gates** for sensitive operations (the agent asks before executing risky actions)

### Try a Slash Command

Type `/catchup` to get a workspace restart summary. Type `/help` to see all 14 commands.

### Upload a File

Click the paperclip icon or drag a file into the chat. Waggle supports:

- **Documents**: PDF, DOCX, PPTX
- **Spreadsheets**: XLSX, CSV
- **Images**: PNG, JPG, GIF, WebP, SVG
- **Code**: Any text-based source file
- **Archives**: ZIP (lists contents)

Files are ingested into workspace memory and available to the agent.

## Step 4: Understanding Memory

Memory is a core product primitive, not a side feature. Two memory layers work together:

### Personal Mind (`~/.waggle/default.mind`)

Your personal knowledge base. Facts about you, your preferences, recurring context. Shared across all workspaces.

### Workspace Mind (`~/.waggle/workspaces/{id}/workspace.mind`)

Project-specific memory. Decisions, research findings, architectural choices, meeting notes. Scoped to one workspace.

### How Memory Works

1. **Auto-save**: The agent automatically saves important information during conversations -- decisions, facts, preferences, and findings.
2. **Explicit save**: You can say "Remember that we decided to use PostgreSQL" and the agent writes it to the appropriate mind.
3. **Memory search**: The agent searches memory before responding, giving you continuity across sessions.
4. **Memory browser**: Open the Memory tab in any workspace to browse, search, and manage stored frames.

### Memory Frames

Each memory unit is a "frame" with:
- **Content**: The actual information
- **Importance**: critical, important, normal, temporary
- **Frame type**: Information (I), Decision (D), Preference (P), etc.
- **Timestamp**: When it was created
- **Access count**: How often it has been retrieved

## Step 5: Return Tomorrow

When you come back to a workspace, Waggle gives you an instant catch-up:

1. **Workspace Home** shows a summary of what happened, recent decisions, and suggested next prompts
2. **Type `/catchup`** for a detailed briefing
3. **Resume a thread** by clicking any recent session in the sidebar
4. **Context is automatic** -- the agent loads relevant memory before its first response

This is the core daily-use loop:

> Open workspace -> instant context -> real work help -> memory-first response -> visible progress -> return later without losing thread

## Next Steps

- **[Workspaces Guide](workspaces.md)** -- Workspace types, switching, home screen, personas
- **[Capabilities Guide](capabilities.md)** -- Install skill packs and browse the marketplace
- **[Connectors Guide](connectors.md)** -- Connect GitHub, Slack, Google, and 26 other services
- **[Commands Reference](../reference/commands.md)** -- All 14 slash commands with examples
- **[Team Mode Guide](team-mode.md)** -- Set up shared workspaces for your team

## File Locations

| Item | Path |
|------|------|
| Config | `~/.waggle/config.json` |
| Personal mind | `~/.waggle/default.mind` |
| Workspace minds | `~/.waggle/workspaces/{id}/workspace.mind` |
| Session logs | `~/.waggle/workspaces/{id}/sessions/*.jsonl` |
| Installed skills | `~/.waggle/skills/*.md` |
| Installed plugins | `~/.waggle/plugins/` |
| Marketplace DB | `~/.waggle/marketplace.db` |
| Vault (encrypted) | `~/.waggle/vault.db` |
| Server logs | Console output (stdout) |

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+N` | New workspace |
| `Ctrl+,` | Settings |
| `Ctrl+K` | Quick switch workspace |
| `Ctrl+Shift+M` | Toggle memory browser |
| `Enter` | Send message |
| `Shift+Enter` | Newline in message |
| `/` | Start slash command |
