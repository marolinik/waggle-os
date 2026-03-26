# Workspaces

Workspaces are the core organizational unit in Waggle. Each workspace is a dedicated brain for a project, topic, or area of work. It has its own memory, sessions, files, tasks, and optionally a linked directory on disk.

## Creating a Workspace

Press **Ctrl+N** or click **New Workspace** in the sidebar.

| Field | Required | Description |
|-------|----------|-------------|
| Name | Yes | Display name (e.g., "Q1 Planning", "Product Research") |
| Group | Yes | Category for sidebar grouping (e.g., "Work", "Personal") |
| Icon | No | Emoji or character for visual identification |
| Model | No | Override the default LLM model for this workspace |
| Persona | No | Assign a specialized agent persona |
| Directory | No | Link a folder on disk for file-aware operations |

When you create your first workspace, Waggle auto-installs the starter skills (draft-memo, research-synthesis, extract-actions, etc.) if they are not already present.

## Workspace Types

### Personal Workspaces

Created locally, stored on your machine. Memory lives in `~/.waggle/workspaces/{id}/workspace.mind`. Only you can access them.

### Team Workspaces

Linked to a team server. Created from the Team panel after connecting to a team server. Team workspaces support:

- Shared memory that syncs between team members
- Task boards visible to the whole team
- Real-time presence (who is online, who is typing)
- Admin-governed capability policies

A workspace's team status is indicated by a team badge in the sidebar.

## Workspace Home Screen

When you open a workspace, you see the Home screen with:

1. **Summary** -- a narrative description of what this workspace is about, how many memories and sessions it has, and when it was last active.
2. **Recent Decisions** -- key decisions extracted from your conversation history.
3. **Recent Threads** -- your last 5 sessions, clickable to resume.
4. **Suggested Prompts** -- contextual suggestions based on workspace state:
   - New workspace: "Tell me about this project", "What can you do?"
   - Returning workspace: "Catch me up", "Continue: [last thread]", "What should I do next?"
5. **Progress Items** -- tasks, completions, and blockers extracted from sessions.
6. **Stats** -- memory count, session count, file count.

The Home screen is never a blank chat. It always gives you a reason to engage.

## Sessions

Each conversation thread is a **session**. Sessions are stored as `.jsonl` files in `~/.waggle/workspaces/{id}/sessions/`.

### Creating Sessions

- Click the **+** button in the sidebar to start a new session
- Or just start typing -- a session is created automatically

### Session Metadata

Each session has:
- **Title** -- derived from the first user message, or set manually
- **Summary** -- auto-generated after 4+ messages (heuristic, no LLM needed)
- **Outcome** -- what changed, open items, next step (extracted at session end)

### Renaming Sessions

Click the session title in the sidebar and type a new name, or use the `PATCH /api/sessions/:id` endpoint.

### Searching Across Sessions

Use the search bar in the sidebar to find messages across all sessions in the current workspace. Matches show snippets with context.

### Exporting Sessions

Right-click a session and choose **Export as Markdown** to get a clean document with timestamps and formatted messages.

## Switching Workspaces

- Click any workspace in the left sidebar
- Press **Ctrl+K** for the quick-switch dialog
- Workspaces are grouped by their category (Work, Personal, etc.)

Each workspace in the sidebar shows a hue-colored dot for visual differentiation.

## Personas

Personas are specialized agent configurations. Assigning a persona to a workspace tunes the agent's behavior without changing the core capabilities.

| Persona | Focus | Default Workflow |
|---------|-------|-----------------|
| Researcher | Deep investigation, multi-source synthesis | research-team |
| Writer | Document drafting, editing, tone adaptation | -- |
| Coder | Software development, debugging, code review | -- |
| Analyst | Data analysis, decision matrices, pattern recognition | -- |
| Project Manager | Task tracking, status reports, planning | plan-execute |
| Executive Assistant | Email drafting, meeting prep, correspondence | -- |
| Sales Rep | Lead research, outreach, pipeline management | research-team |
| Marketer | Content creation, campaign planning, SEO | -- |

### Changing Persona

Open workspace settings (gear icon on the workspace home) and select a different persona. The change takes effect on the next message.

### Persona Tool Presets

Each persona has a curated tool set. The Coder persona enables git tools; the Researcher enables web search; the Executive Assistant enables document generation. All tools remain available -- the persona just adjusts defaults and suggestions.

## Directory Association

Linking a workspace to a directory on disk enables:

- `read_file`, `write_file`, `edit_file` operate relative to the linked directory
- `search_files` and `search_content` scan the directory tree
- `git_status`, `git_diff`, `git_log`, `git_commit` work on the repo in that directory
- File listings appear in the workspace context

To link a directory, set it during workspace creation or update it in workspace settings.

## Workspace Memory

Each workspace has its own `.mind` database separate from your personal mind.

- **Workspace mind** stores project-specific context: decisions, research, architecture choices
- **Personal mind** stores cross-workspace knowledge: your preferences, name, recurring facts

When the agent searches memory, it queries both minds and merges results, prioritizing workspace-specific memories when relevant.

### Memory Browser

Click the **Memory** tab in the right panel to browse all frames in the current workspace. You can:

- Search by keyword (FTS5 full-text search)
- Filter by importance level
- View the knowledge graph of entities and relationships
- Delete outdated or incorrect frames

## Deleting a Workspace

Right-click a workspace in the sidebar and choose **Delete**. This removes:

- The workspace entry from the workspace list
- Session files
- The workspace `.mind` file
- Task and file registry data

Personal mind memories are not affected.
