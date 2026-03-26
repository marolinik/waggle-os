/**
 * Sub-agent spawning tools for the local desktop agent.
 *
 * Lets the main agent spawn specialist sub-agents with specific roles,
 * skills, and tool subsets. Sub-agents run in the same process via
 * the shared runAgentLoop, keeping things simple for local mode.
 */

import type { ToolDefinition } from './tools.js';
import type { AgentLoopConfig, AgentResponse } from './agent-loop.js';
import type { HookRegistry } from './hooks.js';

export interface SubAgentDef {
  id: string;
  name: string;
  role: string;
  systemPrompt: string;
  tools: ToolDefinition[];
  model?: string;
  maxTurns?: number;
  /** Timestamp of creation */
  createdAt: number;
}

export interface SubAgentResult {
  agentId: string;
  agentName: string;
  role: string;
  response: string;
  usage: { inputTokens: number; outputTokens: number };
  toolsUsed: string[];
  duration: number;
  /** Timestamp when the result was stored */
  completedAt: number;
}

export interface SubAgentToolsDeps {
  /** All available tools the main agent has (sub-agents get a filtered subset) */
  availableTools: ToolDefinition[];
  /** Function to run an agent loop (injected for testability) */
  runLoop: (config: AgentLoopConfig) => Promise<AgentResponse>;
  /** LiteLLM URL */
  litellmUrl: string;
  /** LiteLLM API key */
  litellmApiKey: string;
  /** Default model for sub-agents */
  defaultModel?: string;
  /** Optional callback for streaming sub-agent progress */
  onSubAgentToken?: (agentId: string, token: string) => void;
  onSubAgentTool?: (agentId: string, name: string, input: Record<string, unknown>) => void;
  /** Hook registry — passed to sub-agent loops so approval gates and memory validation apply */
  hooks?: HookRegistry;
}

// In-memory registry of spawned sub-agents and their results
const activeAgents = new Map<string, SubAgentDef>();
const agentResults = new Map<string, SubAgentResult>();
let agentCounter = 0;

/** Maximum number of entries to retain in agentResults before evicting oldest */
const MAX_AGENT_RESULTS = 100;

/** Maximum age (ms) for stale entries — 30 minutes */
const STALE_THRESHOLD_MS = 30 * 60 * 1000;

/**
 * Evict the oldest entry from agentResults when the map exceeds MAX_AGENT_RESULTS.
 * "Oldest" is determined by the lowest completedAt timestamp.
 */
function evictOldestResult(): void {
  if (agentResults.size <= MAX_AGENT_RESULTS) return;
  let oldestKey: string | null = null;
  let oldestTime = Infinity;
  for (const [key, result] of agentResults) {
    if (result.completedAt < oldestTime) {
      oldestTime = result.completedAt;
      oldestKey = key;
    }
  }
  if (oldestKey) {
    agentResults.delete(oldestKey);
  }
}

/**
 * Remove entries older than STALE_THRESHOLD_MS from agentResults.
 */
export function cleanupStaleEntries(): number {
  const cutoff = Date.now() - STALE_THRESHOLD_MS;
  let removed = 0;
  for (const [key, result] of agentResults) {
    if (result.completedAt < cutoff) {
      agentResults.delete(key);
      removed++;
    }
  }
  return removed;
}

/** Role → tool name filter mapping for common specialist roles */
export const ROLE_TOOL_PRESETS: Record<string, string[]> = {
  researcher: ['web_search', 'web_fetch', 'search_memory', 'save_memory', 'read_file', 'search_files', 'search_content'],
  writer: ['read_file', 'write_file', 'edit_file', 'search_files', 'search_memory', 'save_memory', 'generate_docx'],
  coder: ['bash', 'read_file', 'write_file', 'edit_file', 'search_files', 'search_content', 'git_status', 'git_diff', 'git_log', 'git_commit'],
  analyst: ['bash', 'read_file', 'write_file', 'search_files', 'search_content', 'web_search', 'web_fetch', 'search_memory'],
  reviewer: ['read_file', 'search_files', 'search_content', 'git_status', 'git_diff', 'git_log', 'search_memory'],
  planner: ['create_plan', 'add_plan_step', 'execute_step', 'show_plan', 'search_memory', 'save_memory', 'read_file', 'search_files'],
};

export function createSubAgentTools(deps: SubAgentToolsDeps): ToolDefinition[] {
  const { availableTools, runLoop, litellmUrl, litellmApiKey, defaultModel } = deps;

  return [
    // 1. spawn_agent — Create and run a specialist sub-agent
    {
      name: 'spawn_agent',
      description: 'Spawn a specialist sub-agent to handle a specific task autonomously. The sub-agent runs with its own system prompt, tool subset, and context. Use for parallel or specialized work: research, code review, document writing, analysis. The sub-agent completes its task and returns the result.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Agent name (e.g., "Research Assistant", "Code Reviewer")' },
          role: {
            type: 'string',
            description: 'Role preset for tool selection: researcher, writer, coder, analyst, reviewer, planner. Or "custom" to specify tools manually.',
          },
          task: { type: 'string', description: 'The specific task or question for the sub-agent to handle' },
          context: { type: 'string', description: 'Additional context to include in the sub-agent\'s system prompt (e.g., project info, constraints)' },
          tools: {
            type: 'array',
            items: { type: 'string' },
            description: 'Tool names to give the sub-agent (only used with role="custom"). Defaults to role preset.',
          },
          model: { type: 'string', description: 'Model to use (default: same as parent)' },
          max_turns: { type: 'number', description: 'Max turns before stopping (default: 50)' },
        },
        required: ['name', 'role', 'task'],
      },
      execute: async (args) => {
        const name = args.name as string;
        const role = args.role as string;
        const task = args.task as string;
        const context = args.context as string ?? '';
        const model = args.model as string ?? defaultModel ?? 'claude-sonnet-4-6';
        const maxTurns = (args.max_turns as number) ?? 50;

        // Resolve tools for this sub-agent
        let toolNames: string[];
        if (role === 'custom' && Array.isArray(args.tools)) {
          toolNames = args.tools as string[];
        } else {
          toolNames = ROLE_TOOL_PRESETS[role] ?? ROLE_TOOL_PRESETS.analyst!;
        }
        const subTools = availableTools.filter(t => toolNames.includes(t.name));

        // Generate agent ID
        agentCounter++;
        const id = `agent-${agentCounter}-${Date.now()}`;

        // Build sub-agent system prompt
        const systemPrompt = `# Sub-Agent: ${name}
Role: ${role}
Task: Complete the following task and return a comprehensive result.

${context ? `## Context\n${context}\n\n` : ''}## Your Task
${task}

## Guidelines
- Focus exclusively on your assigned task.
- Use your tools efficiently — don't waste turns on unnecessary operations.
- Be thorough but concise in your final response.
- If you can't complete the task with the tools available, explain what you need.
- When done, provide a clear summary of your findings/results.`;

        const agentDef: SubAgentDef = {
          id,
          name,
          role,
          systemPrompt,
          tools: subTools,
          model,
          maxTurns,
          createdAt: Date.now(),
        };
        activeAgents.set(id, agentDef);

        // Run the sub-agent loop
        const startTime = Date.now();
        try {
          const result = await runLoop({
            litellmUrl,
            litellmApiKey,
            model,
            systemPrompt,
            tools: subTools,
            messages: [{ role: 'user', content: task }],
            maxTurns,
            stream: false, // Sub-agents don't stream to the user
            hooks: deps.hooks, // W2.9: sub-agents respect approval gates and memory validation hooks
            onToken: deps.onSubAgentToken
              ? (token: string) => deps.onSubAgentToken!(id, token)
              : undefined,
            onToolUse: deps.onSubAgentTool
              ? (name: string, input: Record<string, unknown>) => deps.onSubAgentTool!(id, name, input)
              : undefined,
          });

          const duration = Date.now() - startTime;
          const subResult: SubAgentResult = {
            agentId: id,
            agentName: name,
            role,
            response: result.content,
            usage: { inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens },
            toolsUsed: result.toolsUsed,
            duration,
            completedAt: Date.now(),
          };
          agentResults.set(id, subResult);
          evictOldestResult();
          activeAgents.delete(id);

          return `## Sub-Agent Result: ${name}\n**Role:** ${role}\n**Duration:** ${(duration / 1000).toFixed(1)}s\n**Tools used:** ${result.toolsUsed.join(', ') || 'none'}\n**Tokens:** ${result.usage.inputTokens + result.usage.outputTokens} total\n\n---\n\n${result.content}`;
        } catch (err) {
          const duration = Date.now() - startTime;
          activeAgents.delete(id);
          const errMsg = err instanceof Error ? err.message : String(err);
          return `## Sub-Agent Error: ${name}\n**Duration:** ${(duration / 1000).toFixed(1)}s\n**Error:** ${errMsg}`;
        }
      },
    },

    // 2. list_agents — Show spawned agents and their status
    {
      name: 'list_agents',
      description: 'List active and completed sub-agents. Shows status, role, and result summaries.',
      parameters: {
        type: 'object',
        properties: {},
      },
      execute: async () => {
        const active = Array.from(activeAgents.values());
        const completed = Array.from(agentResults.values());

        if (active.length === 0 && completed.length === 0) {
          return 'No sub-agents spawned yet. Use spawn_agent to create one.';
        }

        let output = '';
        if (active.length > 0) {
          output += `## Active Agents (${active.length})\n`;
          for (const a of active) {
            const elapsed = ((Date.now() - a.createdAt) / 1000).toFixed(0);
            output += `- **${a.name}** (${a.id}) — ${a.role}, running for ${elapsed}s\n`;
          }
          output += '\n';
        }
        if (completed.length > 0) {
          output += `## Completed Agents (${completed.length})\n`;
          for (const r of completed) {
            output += `- **${r.agentName}** (${r.agentId}) — ${r.role}, ${(r.duration / 1000).toFixed(1)}s, ${r.toolsUsed.length} tools used\n`;
            output += `  Preview: ${r.response.slice(0, 120)}...\n`;
          }
        }
        return output;
      },
    },

    // 3. get_agent_result — Get the full result of a completed sub-agent
    {
      name: 'get_agent_result',
      description: 'Get the full result of a completed sub-agent by ID.',
      parameters: {
        type: 'object',
        properties: {
          agent_id: { type: 'string', description: 'The agent ID to retrieve results for' },
        },
        required: ['agent_id'],
      },
      execute: async (args) => {
        const agentId = args.agent_id as string;
        // Support lookup by ID or by name
        let result = agentResults.get(agentId);
        if (!result) {
          // Try matching by name
          for (const r of agentResults.values()) {
            if (r.agentName === agentId) { result = r; break; }
          }
        }
        if (!result) {
          // Check if it's still running
          for (const a of activeAgents.values()) {
            if (a.id === agentId || a.name === agentId) {
              return `Agent "${agentId}" is still running. Wait for it to complete.`;
            }
          }
          return `No result found for agent "${agentId}". It may not exist. Use list_agents to see available agents.`;
        }
        return `## Result: ${result.agentName}\n**Role:** ${result.role}\n**Duration:** ${(result.duration / 1000).toFixed(1)}s\n**Tools used:** ${result.toolsUsed.join(', ')}\n**Tokens:** ${result.usage.inputTokens + result.usage.outputTokens}\n\n---\n\n${result.response}`;
      },
    },
  ];
}

/** Expose internal state for testing */
export { activeAgents, agentResults, agentCounter, MAX_AGENT_RESULTS, STALE_THRESHOLD_MS };
