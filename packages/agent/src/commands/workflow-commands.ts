/**
 * 12 workflow-native commands — high-level actions that delegate to context methods.
 *
 * Each command validates its args, formats markdown output, and delegates
 * the real work to the CommandContext (workflow runner, memory, skills, etc.).
 *
 * B1-B7: When workflow runner or spawn agent are unavailable, commands now
 * return AGENT_LOOP_REROUTE:: prefix to tell the chat route to re-process
 * the request through the full agent loop as a natural language message.
 */

import type { CommandRegistry, CommandDefinition } from './command-registry.js';
import { AGENT_LOOP_REROUTE_PREFIX } from './command-registry.js';

// ── Individual command factories ────────────────────────────────────────

function catchupCommand(): CommandDefinition {
  return {
    name: 'catchup',
    aliases: ['catch-up', 'recap'],
    description: 'Workspace restart summary — get up to speed instantly',
    usage: '/catchup',
    handler: async (_args, ctx) => {
      // Try workspace state first
      if (ctx.getWorkspaceState) {
        const state = await ctx.getWorkspaceState();
        if (state && state !== 'No workspace state available.') {
          return `## Catch-Up Briefing\n\nHere's what's been happening in this workspace:\n\n${state}`;
        }
      }

      // B5: Fallback — search memory for recent activity when workspace state is empty
      if (ctx.searchMemory) {
        const memories = await ctx.searchMemory('recent activity decisions progress updates');
        if (memories && memories !== 'No relevant memories found.' && memories !== 'Memory search unavailable.') {
          return `## Catch-Up Briefing\n\nHere's what I found in workspace memory:\n\n${memories}\n\n_Based on stored memories. Start a conversation to build richer context._`;
        }
      }

      return `## Catch-Up Briefing\n\nThis workspace is fresh — no activity yet.\n\nTry:\n- Send a message to start a conversation\n- Use \`/memory <topic>\` to search for saved knowledge\n- Save an insight with the chat: "Remember that..."`;
    },
  };
}

function nowCommand(): CommandDefinition {
  return {
    name: 'now',
    aliases: ['current', 'where'],
    description: 'Current workspace state — what\'s happening right now',
    usage: '/now',
    handler: async (_args, ctx) => {
      if (ctx.getWorkspaceState) {
        const state = await ctx.getWorkspaceState();
        if (state && state !== 'No workspace state available.') {
          return `## Right Now\n\n${state}`;
        }
      }

      // Fallback with memory search
      if (ctx.searchMemory) {
        const memories = await ctx.searchMemory('current status tasks in progress');
        if (memories && memories !== 'No relevant memories found.' && memories !== 'Memory search unavailable.') {
          return `## Right Now\n\n${memories}`;
        }
      }

      return `## Right Now\n\nNo active context in this workspace yet. Send a message to get started.`;
    },
  };
}

function researchCommand(): CommandDefinition {
  return {
    name: 'research',
    aliases: ['investigate'],
    description: 'Launch multi-agent research on a topic',
    usage: '/research <topic>',
    handler: async (args, ctx) => {
      if (!args.trim()) {
        return 'Missing topic. Usage: `/research <topic>`\n\nExample: `/research quantum computing applications`';
      }
      if (ctx.runWorkflow) {
        return ctx.runWorkflow('research-team', args.trim());
      }
      // B2: Re-route through agent loop — the agent has web_search, search_memory tools
      return `${AGENT_LOOP_REROUTE_PREFIX}I'll research this using the Research Team workflow:\n1. Researcher agent searches web + memory (5+ sources)\n2. Synthesizer agent combines findings into a report\n3. Reviewer agent validates accuracy and completeness\n\nTopic: ${args.trim()}\n\nStarting now...\n\nResearch the following topic thoroughly. Use web_search for current information and search_memory for existing knowledge. Provide a comprehensive summary with key findings, sources, and implications:\n\n${args.trim()}`;
    },
  };
}

function draftCommand(): CommandDefinition {
  return {
    name: 'draft',
    aliases: ['write'],
    description: 'Start a drafting workflow with review cycle',
    usage: '/draft <type> [topic]',
    handler: async (args, ctx) => {
      if (!args.trim()) {
        return 'Missing draft type. Usage: `/draft <type> [topic]`\n\nExamples:\n- `/draft blog post about AI safety`\n- `/draft report quarterly metrics`\n- `/draft email to client about delays`';
      }
      if (ctx.runWorkflow) {
        return ctx.runWorkflow('review-pair', args.trim());
      }
      // B1: Re-route through agent loop — the agent can draft with memory context
      return `${AGENT_LOOP_REROUTE_PREFIX}I'll use the Review Pair workflow:\n1. Writer agent creates initial draft\n2. Reviewer agent critiques for accuracy and style\n3. Reviser agent incorporates feedback\n\nTask: ${args.trim()}\n\nDraft the following. Search memory first for relevant context, then produce a complete, well-structured draft. If appropriate, generate a DOCX file:\n\n${args.trim()}`;
    },
  };
}

function decideCommand(): CommandDefinition {
  return {
    name: 'decide',
    aliases: ['decision', 'weigh'],
    description: 'Create a structured decision matrix',
    usage: '/decide <question>',
    handler: async (args, ctx) => {
      if (!args.trim()) {
        return 'Missing question. Usage: `/decide <question>`\n\nExample: `/decide Should we use PostgreSQL or MongoDB?`';
      }
      if (ctx.runWorkflow) {
        return ctx.runWorkflow('decision-analysis', args.trim());
      }
      // B7: Re-route through agent loop to fill in the decision matrix with real analysis
      return `${AGENT_LOOP_REROUTE_PREFIX}Analyze this decision and provide a filled-in decision matrix with specific pros, cons, risks, effort estimates, and a clear recommendation. Search memory for any prior context on this topic:\n\n${args.trim()}`;
    },
  };
}

function reviewCommand(): CommandDefinition {
  return {
    name: 'review',
    aliases: ['critique', 'check'],
    description: 'Review the last output with a critic agent',
    usage: '/review',
    handler: async (_args, ctx) => {
      if (ctx.runWorkflow) {
        return ctx.runWorkflow('review-pair', 'Review the last output for accuracy, completeness, and quality.');
      }
      // Re-route through agent loop
      return `${AGENT_LOOP_REROUTE_PREFIX}Review your last response for accuracy, completeness, and quality. Identify any issues, gaps, or improvements. Be critical and specific.`;
    },
  };
}

function spawnCommand(): CommandDefinition {
  return {
    name: 'spawn',
    aliases: ['agent', 'summon'],
    description: 'Spawn a specialist sub-agent',
    usage: '/spawn <role> [task]',
    handler: async (args, ctx) => {
      if (!args.trim()) {
        return 'Missing role. Usage: `/spawn <role> [task]`\n\nAvailable roles: `researcher`, `writer`, `coder`, `analyst`, `reviewer`, `planner`\n\nExample: `/spawn researcher Find recent papers on transformer architectures`';
      }
      if (ctx.spawnAgent) {
        const parts = args.trim().split(/\s+/);
        const role = parts[0];
        const task = parts.slice(1).join(' ') || `Act as a ${role} and assist with the current workspace task.`;
        return ctx.spawnAgent(role, task);
      }
      // B4: Re-route through agent loop — the agent can act in the requested role directly
      const parts = args.trim().split(/\s+/);
      const role = parts[0];
      const task = parts.slice(1).join(' ') || 'assist with the current workspace task';
      return `${AGENT_LOOP_REROUTE_PREFIX}Act as a specialist ${role}. ${task}. Use all available tools (web_search, search_memory, bash, read_file, etc.) to deliver thorough results.`;
    },
  };
}

function skillsCommand(): CommandDefinition {
  return {
    name: 'skills',
    aliases: ['abilities', 'tools'],
    description: 'Show active skills in this workspace',
    usage: '/skills',
    handler: async (_args, ctx) => {
      if (!ctx.listSkills) {
        return 'Skill listing is not available in this context.';
      }
      const skills = ctx.listSkills();
      if (skills.length === 0) {
        return '## Active Skills\n\nNo skills are currently active in this workspace.';
      }
      const list = skills.map(s => `- \`${s}\``).join('\n');
      return `## Active Skills\n\n${list}\n\n_${skills.length} skill(s) loaded._`;
    },
  };
}

function statusCommand(): CommandDefinition {
  return {
    name: 'status',
    aliases: ['report', 'progress'],
    description: 'Project status summary',
    usage: '/status',
    handler: async (_args, ctx) => {
      // B6: /status returns METRICS (distinct from /catchup which returns narrative)
      const sections: string[] = ['## Status Report'];

      // Workspace state (includes memory count, sessions, etc.)
      if (ctx.getWorkspaceState) {
        const state = await ctx.getWorkspaceState();
        if (state && state !== 'No workspace state available.') {
          sections.push(state);
        }
      }

      // Skills count
      if (ctx.listSkills) {
        const skills = ctx.listSkills();
        sections.push(`**Skills loaded:** ${skills.length}`);
      }

      if (sections.length === 1) {
        // Only header — no data available
        if (ctx.searchMemory) {
          const memories = await ctx.searchMemory('status progress milestones');
          if (memories && memories !== 'No relevant memories found.' && memories !== 'Memory search unavailable.') {
            sections.push(memories);
          }
        }
      }

      if (sections.length === 1) {
        sections.push('No workspace data available yet. Start a conversation to build context.');
      }

      return sections.join('\n\n');
    },
  };
}

function memoryCommand(): CommandDefinition {
  return {
    name: 'memory',
    aliases: ['remember', 'recall'],
    description: 'Search or browse workspace memory',
    usage: '/memory [query]',
    handler: async (args, ctx) => {
      if (!ctx.searchMemory) {
        return 'Memory search is not available in this context.';
      }
      if (!args.trim()) {
        return '## Memory\n\nUsage: `/memory <query>` to search workspace memory.\n\nExamples:\n- `/memory architecture decisions`\n- `/memory last meeting notes`\n- `/memory project goals`';
      }
      const results = await ctx.searchMemory(args.trim());
      return `## Memory Search: "${args.trim()}"\n\n${results}`;
    },
  };
}

function planCommand(): CommandDefinition {
  return {
    name: 'plan',
    aliases: ['decompose', 'break-down'],
    description: 'Break a goal into an actionable task list',
    usage: '/plan <goal>',
    handler: async (args, ctx) => {
      if (!args.trim()) {
        return 'Missing goal. Usage: `/plan <goal>`\n\nExample: `/plan Build a user dashboard with analytics`';
      }
      if (ctx.runWorkflow) {
        return ctx.runWorkflow('plan-execute', args.trim());
      }
      // B3: Re-route through agent loop — the agent can create structured plans
      return `${AGENT_LOOP_REROUTE_PREFIX}I'll use the Plan & Execute workflow:\n1. Planner decomposes into sub-tasks\n2. Executor works through each step\n3. Summarizer consolidates results\n\nGoal: ${args.trim()}\n\nCreate a detailed, actionable plan for the following goal. Break it into phases, each with specific tasks, dependencies, and deliverables. Search memory for any existing context:\n\n${args.trim()}`;
    },
  };
}

function focusCommand(): CommandDefinition {
  return {
    name: 'focus',
    aliases: ['narrow', 'scope'],
    description: 'Narrow agent focus to a specific topic',
    usage: '/focus <topic>',
    handler: async (args, _ctx) => {
      if (!args.trim()) {
        return 'Missing topic. Usage: `/focus <topic>`\n\nExample: `/focus database performance optimization`';
      }
      const topic = args.trim();
      return [
        `## Focus: ${topic}`,
        ``,
        `Context narrowed to **${topic}**. Subsequent responses will prioritize this topic.`,
        ``,
        `> Tip: Use /focus again to change, or just ask about anything else to broaden context.`,
      ].join('\n');
    },
  };
}

function helpCommand(): CommandDefinition {
  return {
    name: 'help',
    aliases: ['commands', '?'],
    description: 'List all available commands',
    usage: '/help',
    handler: async (_args, _ctx) => {
      const lines = [
        `## Available Commands`,
        ``,
        `| Command | Description |`,
        `|---------|-------------|`,
        `| \`/catchup\` | Workspace restart summary — get up to speed instantly |`,
        `| \`/now\` | Current workspace state — what's happening right now |`,
        `| \`/research <topic>\` | Research a topic using web search and memory |`,
        `| \`/draft <type> [topic]\` | Draft content with workspace context |`,
        `| \`/decide <question>\` | Analyze a decision with pros, cons, and recommendation |`,
        `| \`/review\` | Review the last output for quality |`,
        `| \`/spawn <role> [task]\` | Act as a specialist (researcher, writer, coder, etc.) |`,
        `| \`/skills\` | Show active skills in this workspace |`,
        `| \`/status\` | Project status summary with metrics |`,
        `| \`/memory [query]\` | Search or browse workspace memory |`,
        `| \`/plan <goal>\` | Break a goal into an actionable plan |`,
        `| \`/focus <topic>\` | Narrow agent focus to a specific topic |`,
        `| \`/plugins\` | List installed plugins and capabilities |`,
        `| \`/export [type]\` | Export workspace data (memories, sessions, all, workspace) |`,
        `| \`/import <source>\` | Import data into workspace memory |`,
        `| \`/settings\` | Show workspace and agent settings |`,
        `| \`/connectors\` | List connected services and their status |`,
        `| \`/cli [action]\` | Manage CLI tool access — view, allow, or deny programs |`,
        `| \`/search-all <query>\` | Search across all workspaces and personal memory |`,
        `| \`/workflow <sub> [args]\` | Create, list, or run custom workflows |`,
        `| \`/pr <title>\` | Create a pull request from the current branch |`,
        `| \`/help\` | List all available commands |`,
      ];
      return lines.join('\n');
    },
  };
}

// ── Additional Commands ─────────────────────────────────────────────────

function pluginsCommand(): CommandDefinition {
  return {
    name: 'plugins',
    aliases: [],
    description: 'List installed plugins and capabilities',
    usage: '/plugins',
    handler: async (_args, context) => {
      const skills = context.listSkills?.() ?? [];
      return [
        '## Installed Plugins & Capabilities',
        '',
        `**${skills.length} skills active** in this workspace.`,
        '',
        'Use `/marketplace` to browse and install capability packs.',
        'Use `/skills` for a detailed list of loaded skills.',
      ].join('\n');
    },
  };
}

function exportCommand(): CommandDefinition {
  return {
    name: 'export',
    aliases: [],
    description: 'Export workspace data (memories, sessions, settings)',
    usage: '/export [memories|sessions|all|workspace]',
    handler: async (_args, context) => {
      const what = _args.trim().toLowerCase();

      // No args — show structured help
      if (!what) {
        return [
          '## Export Workspace Data',
          '',
          'Usage: `/export <type>`',
          '',
          '| Type | Description |',
          '|------|-------------|',
          '| `memories` | Export all workspace memories as JSON/Markdown |',
          '| `sessions` | Export conversation sessions and history |',
          '| `all` | Export everything (memories + sessions + settings) |',
          '| `workspace` | Export workspace configuration and metadata |',
          '',
          'Example: `/export memories`',
        ].join('\n');
      }

      // Specific export types with targeted agent instructions
      if (what === 'memories') {
        return `${AGENT_LOOP_REROUTE_PREFIX}Export all workspace memories for workspace "${context.workspaceId}". Use search_memory to retrieve all memories, then format them as a comprehensive Markdown document with categories, dates, and importance levels. Offer to save as a file.`;
      }

      if (what === 'sessions') {
        return `${AGENT_LOOP_REROUTE_PREFIX}Export conversation sessions for workspace "${context.workspaceId}". List all sessions with their titles, dates, and message counts. Offer to export as JSON or summarized Markdown.`;
      }

      if (what === 'all') {
        return `${AGENT_LOOP_REROUTE_PREFIX}Export all data for workspace "${context.workspaceId}": memories, sessions, and settings. Create a comprehensive export package. List what's available (memory count, session count) and export as organized files.`;
      }

      if (what === 'workspace') {
        return `${AGENT_LOOP_REROUTE_PREFIX}Export workspace configuration and metadata for workspace "${context.workspaceId}". Include workspace name, group, model, persona, linked directory, and any custom settings.`;
      }

      // Unknown type — show help
      return `Unknown export type: "${what}". Run \`/export\` without arguments to see available types.`;
    },
  };
}

function importCommand(): CommandDefinition {
  return {
    name: 'import',
    aliases: [],
    description: 'Import data into workspace memory',
    usage: '/import <source>',
    handler: async (_args, context) => {
      const trimmed = _args.trim();

      // No args — show structured help
      if (!trimmed) {
        return [
          '## Import Data',
          '',
          'Usage: `/import <source>`',
          '',
          '**Supported sources:**',
          '- **Text**: `/import` then paste content in the next message',
          '- **File path**: `/import /path/to/file.md`',
          '- **URL**: `/import https://example.com/document`',
          '- **Clipboard**: `/import clipboard`',
          '',
          '**Supported formats:** Markdown, JSON, plain text, CSV',
          '',
          'Example: `/import ./notes/meeting-2026-03-25.md`',
        ].join('\n');
      }

      // With args — reroute with the source description
      return `${AGENT_LOOP_REROUTE_PREFIX}Help the user import data into workspace "${context.workspaceId}" from source: ${trimmed}. Read or fetch the content, then save relevant information as workspace memories. Confirm what was imported.`;
    },
  };
}

function settingsCommand(): CommandDefinition {
  return {
    name: 'settings',
    aliases: ['/config', '/preferences'],
    description: 'Show current workspace and agent settings',
    usage: '/settings',
    handler: async (_args, context) => {
      return `${AGENT_LOOP_REROUTE_PREFIX}Show the current settings for workspace "${context.workspaceId}": model, persona, linked directory, budget, and suggest what can be changed. Check memory for any stored preferences.`;
    },
  };
}

function searchAllCommand(): CommandDefinition {
  return {
    name: 'search-all',
    aliases: ['find-all'],
    description: 'Search across all workspaces and personal memory',
    usage: '/search-all <query>',
    handler: async (args, _ctx) => {
      if (!args.trim()) {
        return 'Missing query. Usage: `/search-all <query>`\n\nExample: `/search-all project deadlines`';
      }
      // Q23: Re-route through agent loop to use cross-workspace search tools
      return `${AGENT_LOOP_REROUTE_PREFIX}Search across all my workspaces for: ${args.trim()}. Use search_all_workspaces tool if available, otherwise search_memory with scope=all. Summarize results grouped by workspace.`;
    },
  };
}

function connectorsCommand(): CommandDefinition {
  return {
    name: 'connectors',
    aliases: ['integrations', 'connections'],
    description: 'List connected services and their status',
    usage: '/connectors',
    handler: async (_args, _ctx) => {
      return `${AGENT_LOOP_REROUTE_PREFIX}List all my connected services and their health status. Show which are connected, which need setup, and how to connect new ones.`;
    },
  };
}

function cliCommand(): CommandDefinition {
  return {
    name: 'cli',
    aliases: ['cli-tools'],
    description: 'Manage CLI tool access — view, allow, or deny CLI programs',
    usage: '/cli [allow|deny|discover] [name]',
    handler: async (args, _ctx) => {
      const trimmed = args.trim();

      // /cli (no args) — show current allowlist info
      if (!trimmed) {
        return 'No CLI tools explicitly allowed. The agent auto-discovers common CLIs (git, node, docker, etc.) on your PATH.\n\nUse `/cli allow <name>` to add a CLI to the allowlist.';
      }

      // /cli allow <name>
      if (trimmed.startsWith('allow ')) {
        const name = trimmed.slice(6).trim();
        if (!name) return 'Usage: `/cli allow <program-name>`';
        return `To allow "${name}", add it to your CLI allowlist in ~/.waggle/config.json under "cliAllowlist": ["${name}"].\n\nAutomatic config update coming soon.`;
      }

      // /cli deny <name>
      if (trimmed.startsWith('deny ')) {
        const name = trimmed.slice(5).trim();
        if (!name) return 'Usage: `/cli deny <program-name>`';
        return `To deny "${name}", remove it from "cliAllowlist" in ~/.waggle/config.json.\n\nAutomatic config update coming soon.`;
      }

      // /cli discover
      if (trimmed === 'discover') {
        return `${AGENT_LOOP_REROUTE_PREFIX}Run cli_discover to find all available CLI tools on the system PATH. List each found program with its version.`;
      }

      return 'Usage: `/cli` (show allowlist), `/cli allow <name>`, `/cli deny <name>`, `/cli discover`';
    },
  };
}

function workflowCommand(): CommandDefinition {
  return {
    name: 'workflow',
    aliases: ['wf'],
    description: 'Create, list, or run custom multi-agent workflows',
    usage: '/workflow <create|list|run> [args]',
    handler: async (args, _ctx) => {
      const trimmed = args.trim();

      // /workflow (no args) — show help
      if (!trimmed) {
        return [
          '## Workflow Manager',
          '',
          'Usage: `/workflow <subcommand> [args]`',
          '',
          '| Subcommand | Description |',
          '|------------|-------------|',
          '| `create <description>` | Create a custom multi-agent workflow from a description |',
          '| `list` | List all available workflows (built-in and custom) |',
          '| `run <name>` | Run a workflow by name |',
          '',
          'Examples:',
          '- `/workflow create Research a topic, then draft a report, then review it`',
          '- `/workflow list`',
          '- `/workflow run research-and-report`',
        ].join('\n');
      }

      // Parse subcommand
      const spaceIdx = trimmed.indexOf(' ');
      const sub = spaceIdx === -1 ? trimmed.toLowerCase() : trimmed.slice(0, spaceIdx).toLowerCase();
      const subArgs = spaceIdx === -1 ? '' : trimmed.slice(spaceIdx + 1).trim();

      if (sub === 'create') {
        if (!subArgs) {
          return 'Missing description. Usage: `/workflow create <description>`\n\nExample: `/workflow create Research competitors, summarize findings, and draft an executive brief`';
        }
        return `${AGENT_LOOP_REROUTE_PREFIX}Create a custom multi-agent workflow based on this description: ${subArgs}. Use the compose_workflow tool to analyze the task and create a reusable template. Save it using the skill creation tools.`;
      }

      if (sub === 'list') {
        return `${AGENT_LOOP_REROUTE_PREFIX}List all available workflows including built-in and custom ones. Check loaded skills for workflow-type skills, and list the built-in workflow templates (research-team, review-pair, plan-execute, decision-analysis).`;
      }

      if (sub === 'run') {
        if (!subArgs) {
          return 'Missing workflow name. Usage: `/workflow run <name>`\n\nExample: `/workflow run research-team`';
        }
        return `${AGENT_LOOP_REROUTE_PREFIX}Run the workflow named ${subArgs}. If it's a built-in workflow template, execute it. If it's a custom skill-based workflow, load and execute it.`;
      }

      return `Unknown subcommand: "${sub}". Available: \`create\`, \`list\`, \`run\`. Run \`/workflow\` for help.`;
    },
  };
}

function prCommand(): CommandDefinition {
  return {
    name: 'pr',
    aliases: ['pull-request', 'merge-request'],
    description: 'Create a pull request from the current branch',
    usage: '/pr <title>',
    handler: async (args, _ctx) => {
      const title = args.trim();
      if (!title) {
        return 'Missing title. Usage: `/pr <title>`\n\nExample: `/pr Add user authentication module`';
      }
      // Re-route through agent loop — the agent has git_pr, git_status, git_log tools
      return `${AGENT_LOOP_REROUTE_PREFIX}Create a pull request with title: "${title}". First run git_status and git_log to gather context, then use git_pr tool to create the PR. Include a summary of changes in the PR body.`;
    },
  };
}

// ── Registration ────────────────────────────────────────────────────────

export function registerWorkflowCommands(registry: CommandRegistry): void {
  const commands = [
    catchupCommand(),
    nowCommand(),
    researchCommand(),
    draftCommand(),
    decideCommand(),
    reviewCommand(),
    spawnCommand(),
    skillsCommand(),
    statusCommand(),
    memoryCommand(),
    planCommand(),
    focusCommand(),
    helpCommand(),
    pluginsCommand(),
    exportCommand(),
    importCommand(),
    settingsCommand(),
    connectorsCommand(),
    cliCommand(),
    searchAllCommand(),
    workflowCommand(),
    prCommand(),
  ];

  for (const cmd of commands) {
    registry.register(cmd);
  }
}
