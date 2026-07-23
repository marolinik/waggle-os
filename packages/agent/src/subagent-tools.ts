/**
 * Sub-agent spawning tools for the local desktop agent.
 *
 * Lets the main agent spawn specialist sub-agents with specific roles,
 * skills, and tool subsets. Sub-agents run in the same process via
 * the shared runAgentLoop, keeping things simple for local mode.
 */

import type { ToolDefinition } from './tools.js';
import type { AgentLoopConfig, AgentResponse } from './agent-loop.js';
import { evaluateExternalMemoryIngress } from '@waggle/core';
import { selectAgentRunBudget } from './agent-run-budget.js';
import type { HookRegistry } from './hooks.js';
import { detectTaskShape } from './task-shape.js';
import { filterAvailableTools, selectToolsForTurn } from './tool-filter.js';

/**
 * Request-scoped security context threaded into a spawned sub-agent / workflow
 * worker so it inherits the SAME restrictions as the chat request that spawned
 * it. Without this, sub-agents ran with the full tool pool and no approval gate
 * (the sub-agent confirmation-bypass). Request-bound hosts capture this context
 * directly; `getSpawnSecurityContext` remains for legacy/static embedders.
 */
export interface SpawnSecurityContext {
  /** Approval-gate hooks — the shared registry carrying the request's pre:tool confirmation gate. */
  hooks?: HookRegistry;
  /** Team governance denylist — tool names blocked for this request. */
  blockedTools?: readonly string[];
  /**
   * Tool names the spawning request is permitted to use (persona allowlist ∩
   * availability). A spawned agent's tool subset is intersected with this so a
   * persona's tool restriction cannot be escaped by spawning. `null`/undefined
   * ⇒ no persona narrowing (e.g. the general-purpose persona).
   */
  allowedToolNames?: ReadonlySet<string> | null;
}

/**
 * Narrow candidate tool names to what the spawning request permits: intersect
 * with the persona allowlist and drop governance-blocked tools. Pure — returns
 * a new array; a missing context is a no-op (legacy behaviour).
 */
export function filterSpawnToolNames(
  toolNames: readonly string[],
  ctx: SpawnSecurityContext | undefined,
): string[] {
  if (!ctx) return [...toolNames];
  let out = [...toolNames];
  if (ctx.allowedToolNames) {
    const allowed = ctx.allowedToolNames;
    out = out.filter(n => allowed.has(n));
  }
  if (ctx.blockedTools?.length) {
    const blocked = new Set(ctx.blockedTools);
    out = out.filter(n => !blocked.has(n));
  }
  return out;
}

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
  /** Present when the run terminated without a usable result. */
  error?: string;
  status?: 'completed' | 'failed' | 'cancelled';
}

export interface SubAgentStatusEvent {
  agentId: string;
  name: string;
  role: string;
  status: 'running' | 'done' | 'error';
  task: string;
  toolsUsed: string[];
  startedAt: number;
  completedAt?: number;
}

export interface SubAgentRunView {
  id: string;
  name: string;
  role: string;
  task: string;
  status: 'queued' | 'starting' | 'running' | 'waiting_for_approval' | 'paused'
    | 'cancelling' | 'completed' | 'failed' | 'cancelled' | 'interrupted';
  result?: string;
  error?: string;
  toolsUsed?: string[];
  usage?: { inputTokens: number; outputTokens: number };
  startedAt?: number;
  completedAt?: number;
}

export interface SubAgentRunHandle {
  /** Canonical public run id (for example, the durable AgentRunRegistry id). */
  runId: string;
  signal?: AbortSignal;
  dispose?: () => void;
}

/**
 * Optional host adapter for durable, workspace-scoped run lifecycle state.
 * The agent package stays storage-agnostic; local/server mode maps this onto
 * AgentRunRegistry + Room + memory + WaggleDance.
 */
export interface SubAgentRunAdapter {
  start: (input: {
    provisionalAgentId: string;
    name: string;
    role: string;
    task: string;
    model: string;
    startedAt: number;
  }) => Promise<SubAgentRunHandle> | SubAgentRunHandle;
  complete?: (handle: SubAgentRunHandle, result: SubAgentResult) => Promise<void> | void;
  fail?: (handle: SubAgentRunHandle, input: {
    name: string;
    role: string;
    task: string;
    error: string;
    duration: number;
    completedAt: number;
    cancelled: boolean;
  }) => Promise<void> | void;
  list?: () => Promise<SubAgentRunView[]> | SubAgentRunView[];
  get?: (idOrName: string) => Promise<SubAgentRunView | undefined> | SubAgentRunView | undefined;
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
  /** Resolve an explicit child override before any durable run or model call. */
  resolveModel?: (model: string) => Promise<string>;
  /** Optional callback for streaming sub-agent progress */
  onSubAgentToken?: (agentId: string, token: string) => void;
  onSubAgentTool?: (agentId: string, name: string, input: Record<string, unknown>) => void;
  /**
   * Emitted on sub-agent lifecycle transitions (start / complete / error).
   * The server wires this to emitSubagentStatus so the Room canvas
   * (`/api/notifications/stream` → `subagent_status`) can render live tiles
   * for sub-agents spawned via spawn_agent, not just via orchestrate_workflow.
   * Bug #9.
   */
  onSubAgentStatus?: (event: SubAgentStatusEvent) => void;
  /**
   * Fired exactly once on successful sub-agent completion (not on error).
   * The server wires this to persist the result into the active mind so
   * specialist work survives beyond the 30-min in-memory eviction window
   * and the 100-entry MAX_AGENT_RESULTS cap. Gap L from the Skills 2.0
   * verification doc.
   *
   * Implementations MUST NOT throw — failures should be caught and logged;
   * the caller treats this as best-effort and always returns the result
   * string to the main agent regardless of persistence outcome.
   */
  onSubAgentComplete?: (result: SubAgentResult) => Promise<void> | void;
  /** Hook registry — passed to sub-agent loops so approval gates and memory validation apply */
  hooks?: HookRegistry;
  /**
   * Request-scoped security context accessor. Returns the approval-gate hooks,
   * governance blockedTools, and persona tool-allowlist that apply to the
   * CURRENT chat request. Called at spawn time so per-request restrictions
   * reach a sub-agent even though these tools are constructed once at startup.
   * When absent, sub-agents fall back to the static `hooks` above with no
   * governance/persona narrowing — but the executeToolCall critical floor still
   * fail-closes destructive ops.
   */
  getSpawnSecurityContext?: () => SpawnSecurityContext | undefined;
  /** Durable host lifecycle. Falls back to the legacy in-memory maps when absent. */
  runAdapter?: SubAgentRunAdapter;
}

const QUARANTINED_AGENT_RESULT = '[Quarantined agent result: unsafe external content]';
const QUARANTINED_AGENT_ERROR = '[Quarantined agent error: unsafe external content]';

export function guardSubAgentOutput(text: string, kind: 'result' | 'error'): string {
  if (evaluateExternalMemoryIngress({ content: text }).action === 'allow') return text;
  return kind === 'result' ? QUARANTINED_AGENT_RESULT : QUARANTINED_AGENT_ERROR;
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
          max_turns: {
            type: 'integer',
            minimum: 1,
            description: 'Optional upper bound; the task-aware safety budget may lower it.',
          },
        },
        required: ['name', 'role', 'task'],
      },
      execute: async (args) => {
        const name = args.name as string;
        const role = args.role as string;
        const task = args.task as string;
        const context = args.context as string ?? '';
        const requestedModel = args.model as string | undefined;
        let model = requestedModel ?? defaultModel ?? 'claude-sonnet-4-6';
        if (requestedModel !== undefined && deps.resolveModel) {
          try {
            model = await deps.resolveModel(requestedModel);
          } catch (err) {
            const errMsg = guardSubAgentOutput(
              err instanceof Error ? err.message : String(err),
              'error',
            );
            return `## Sub-Agent Error: ${name}\n**Error:** Could not resolve the requested model: ${errMsg}`;
          }
        }

        // Resolve tools for this sub-agent
        let toolNames: string[];
        if (role === 'custom' && Array.isArray(args.tools)) {
          toolNames = args.tools as string[];
        } else {
          toolNames = ROLE_TOOL_PRESETS[role] ?? ROLE_TOOL_PRESETS.analyst!;
        }
        // SEC: inherit the spawning request's approval gate + governance denylist
        // + persona allowlist. The intersection here means a persona's tool
        // restriction (and team blockedTools) cannot be escaped by spawning a
        // sub-agent — the blocked/denied tools are simply absent from its pool.
        const secCtx = deps.getSpawnSecurityContext?.();
        toolNames = filterSpawnToolNames(toolNames, secCtx);
        const eligibleTools = filterAvailableTools(
          availableTools.filter(t => toolNames.includes(t.name)),
        );
        const subTools = selectToolsForTurn(eligibleTools, {
          message: task,
          preferredToolNames: toolNames,
          fallbackToEligible: true,
        }).tools;
        const taskShape = detectTaskShape(task);
        const runBudget = selectAgentRunBudget({
          taskShape: taskShape.type,
          complexity: taskShape.complexity,
          selectedToolNames: subTools.map(tool => tool.name),
        });
        const normalizedMaxTurns = Math.floor(Number(args.max_turns));
        const requestedMaxTurns = Number.isFinite(normalizedMaxTurns) && normalizedMaxTurns >= 1
          ? normalizedMaxTurns
          : runBudget.maxTurns;
        const maxTurns = Math.min(requestedMaxTurns, runBudget.maxTurns);

        // Generate a provisional ID. Hosts with a durable run registry replace
        // it with their canonical public run ID before execution starts.
        agentCounter++;
        const provisionalId = `agent-${agentCounter}-${Date.now()}`;

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

        const startTime = Date.now();
        let runHandle: SubAgentRunHandle | undefined;
        let id = provisionalId;
        try {
          runHandle = await deps.runAdapter?.start({
            provisionalAgentId: provisionalId,
            name,
            role,
            task,
            model,
            startedAt: startTime,
          });
          if (runHandle?.runId) id = runHandle.runId;
        } catch (err) {
          const errMsg = guardSubAgentOutput(
            err instanceof Error ? err.message : String(err),
            'error',
          );
          return `## Sub-Agent Error: ${name}\n**Error:** Could not start the run: ${errMsg}`;
        }

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
        if (!deps.runAdapter) activeAgents.set(id, agentDef);

        // Run the sub-agent loop. This deliberately remains delegate-and-wait:
        // the request-scoped approval gate must stay alive for the full child run.
        // Bug #9: emit running status so the Room canvas can render a live tile.
        deps.onSubAgentStatus?.({
          agentId: id,
          name,
          role,
          status: 'running',
          task,
          toolsUsed: [],
          startedAt: startTime,
        });
        try {
          const bufferedTokens: string[] = [];
          const result = await runLoop({
            litellmUrl,
            litellmApiKey,
            model,
            systemPrompt,
            tools: subTools,
            messages: [{ role: 'user', content: task }],
            ...runBudget,
            maxTurns,
            maxToolRounds: Math.min(runBudget.maxToolRounds, Math.max(0, maxTurns - 1)),
            stream: false, // Sub-agents don't stream to the user
            signal: runHandle?.signal,
            // W2.9 + SEC: sub-agents respect approval gates and memory validation
            // hooks. Prefer the request-scoped registry (carries this request's
            // pre:tool confirmation gate) over the static deps.hooks.
            hooks: secCtx?.hooks ?? deps.hooks,
            // SEC: enforce the request's team governance denylist inside the
            // sub-agent loop too (defense-in-depth alongside the tool-subset filter above).
            governancePolicies: secCtx?.blockedTools?.length
              ? { blockedTools: [...secCtx.blockedTools] }
              : undefined,
            onToken: deps.onSubAgentToken
              ? (token: string) => bufferedTokens.push(token)
              : undefined,
            onToolUse: deps.onSubAgentTool
              ? (name: string, input: Record<string, unknown>) => deps.onSubAgentTool!(id, name, input)
              : undefined,
          });

          if (runHandle?.signal?.aborted) {
            throw new Error('Sub-agent run was cancelled');
          }

          const response = guardSubAgentOutput(result.content, 'result');
          const emittedContent = bufferedTokens.join('');
          if (deps.onSubAgentToken
            && response === result.content
            && guardSubAgentOutput(emittedContent, 'result') === emittedContent) {
            for (const token of bufferedTokens) deps.onSubAgentToken(id, token);
          }

          const duration = Date.now() - startTime;
          const subResult: SubAgentResult = {
            agentId: id,
            agentName: name,
            role,
            response,
            usage: { inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens },
            toolsUsed: result.toolsUsed,
            duration,
            completedAt: Date.now(),
            status: 'completed',
          };
          if (!deps.runAdapter) {
            agentResults.set(id, subResult);
            evictOldestResult();
          }
          activeAgents.delete(id);

          // Gap L: persist completed sub-agent result into the active mind
          // so specialist work survives the 30-min in-memory eviction window.
          // Best-effort — persistence failure must not break the return path.
          if (deps.onSubAgentComplete) {
            try {
              await deps.onSubAgentComplete(subResult);
            } catch {
              // Swallow — persistence is best-effort. Caller should log on its side.
            }
          }
          if (runHandle && deps.runAdapter?.complete) {
            try {
              await deps.runAdapter.complete(runHandle, subResult);
            } catch {
              // Durable observability is best-effort; never hide the usable result.
            }
          }

          // Bug #9: emit done status so the Room canvas moves the tile to completed.
          deps.onSubAgentStatus?.({
            agentId: id,
            name,
            role,
            status: 'done',
            task,
            toolsUsed: result.toolsUsed,
            startedAt: startTime,
            completedAt: Date.now(),
          });

          return `## Sub-Agent Result: ${name}\n**Run ID:** ${id}\n**Role:** ${role}\n**Duration:** ${(duration / 1000).toFixed(1)}s\n**Tools used:** ${result.toolsUsed.join(', ') || 'none'}\n**Tokens:** ${result.usage.inputTokens + result.usage.outputTokens} total\n\n---\n\n${response}`;
        } catch (err) {
          const duration = Date.now() - startTime;
          activeAgents.delete(id);
          const errMsg = guardSubAgentOutput(
            err instanceof Error ? err.message : String(err),
            'error',
          );
          const completedAt = Date.now();
          const cancelled = runHandle?.signal?.aborted ?? false;
          const failedResult: SubAgentResult = {
            agentId: id,
            agentName: name,
            role,
            response: '',
            usage: { inputTokens: 0, outputTokens: 0 },
            toolsUsed: [],
            duration,
            completedAt,
            error: errMsg,
            status: cancelled ? 'cancelled' : 'failed',
          };
          if (!deps.runAdapter) {
            agentResults.set(id, failedResult);
            evictOldestResult();
          }

          if (runHandle && deps.runAdapter?.fail) {
            try {
              await deps.runAdapter.fail(runHandle, {
                name, role, task, error: errMsg, duration, completedAt, cancelled,
              });
            } catch {
              // Preserve the main-agent-visible error even if the host store failed.
            }
          }

          // Bug #9: emit error status so the Room canvas marks the tile failed.
          deps.onSubAgentStatus?.({
            agentId: id,
            name,
            role,
            status: 'error',
            task,
            toolsUsed: [],
            startedAt: startTime,
            completedAt,
          });

          return `## Sub-Agent Error: ${name}\n**Run ID:** ${id}\n**Duration:** ${(duration / 1000).toFixed(1)}s\n**Error:** ${errMsg}`;
        } finally {
          try { runHandle?.dispose?.(); } catch { /* already released */ }
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
        if (deps.runAdapter?.list) {
          const runs = await deps.runAdapter.list();
          if (runs.length === 0) {
            return 'No sub-agents spawned yet. Use spawn_agent to create one.';
          }
          let output = `## Agents (${runs.length})\n`;
          for (const run of runs) {
            const tokenCount = (run.usage?.inputTokens ?? 0) + (run.usage?.outputTokens ?? 0);
            output += `- **${run.name}** (${run.id}) — ${run.role}, ${run.status}`;
            if (tokenCount > 0) output += `, ${tokenCount} tokens`;
            output += '\n';
            const preview = run.result ?? run.error;
            if (preview) output += `  Preview: ${preview.slice(0, 120)}${preview.length > 120 ? '...' : ''}\n`;
          }
          return output;
        }

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
        if (deps.runAdapter?.get) {
          const run = await deps.runAdapter.get(agentId);
          if (!run) {
            return `No result found for agent "${agentId}". It may not exist. Use list_agents to see available agents.`;
          }
          if (!['completed', 'failed', 'cancelled', 'interrupted'].includes(run.status)) {
            return `Agent "${agentId}" is ${run.status}. Wait for it to complete.`;
          }
          if (run.status !== 'completed') {
            return `## Sub-Agent ${run.status}: ${run.name}\n**Role:** ${run.role}\n**Error:** ${run.error ?? 'The run did not produce a result.'}`;
          }
          const usage = run.usage ?? { inputTokens: 0, outputTokens: 0 };
          return `## Result: ${run.name}\n**Role:** ${run.role}\n**Tools used:** ${(run.toolsUsed ?? []).join(', ') || 'none'}\n**Tokens:** ${usage.inputTokens + usage.outputTokens}\n\n---\n\n${run.result ?? ''}`;
        }

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
        if (result.error) {
          return `## Sub-Agent ${result.status ?? 'failed'}: ${result.agentName}\n**Role:** ${result.role}\n**Error:** ${result.error}`;
        }
        return `## Result: ${result.agentName}\n**Role:** ${result.role}\n**Duration:** ${(result.duration / 1000).toFixed(1)}s\n**Tools used:** ${result.toolsUsed.join(', ')}\n**Tokens:** ${result.usage.inputTokens + result.usage.outputTokens}\n\n---\n\n${result.response}`;
      },
    },
  ];
}

/** Expose internal state for testing */
export { activeAgents, agentResults, agentCounter, MAX_AGENT_RESULTS, STALE_THRESHOLD_MS };
