/**
 * Sub-agent Orchestrator — supervisor/worker pattern for multi-step workflows.
 *
 * Builds ON TOP of the existing sub-agent spawning (subagent-tools.ts).
 * Adds: dependency-ordered execution, status tracking, context injection,
 * result aggregation, and event emission for UI.
 */

import { EventEmitter } from 'events';
import type { ToolDefinition } from './tools.js';
import type { AgentLoopConfig, AgentResponse } from './agent-loop.js';
import { selectAgentRunBudget } from './agent-run-budget.js';
import type { HookRegistry } from './hooks.js';
import { filterSpawnToolNames, type SpawnSecurityContext } from './subagent-tools.js';
import { detectTaskShape } from './task-shape.js';
import { filterAvailableTools, selectToolsForTurn } from './tool-filter.js';

export type WorkerStatus = 'pending' | 'running' | 'done' | 'failed';

export interface WorkerState {
  id: string;
  name: string;
  role: string;
  status: WorkerStatus;
  task: string;
  startedAt?: number;
  completedAt?: number;
  result?: string;
  error?: string;
  toolsUsed: string[];
  usage: { inputTokens: number; outputTokens: number };
  model?: string;
}

export interface WorkflowStep {
  name: string;
  role: string;
  task: string;
  /** Tools to give this worker (if empty, uses role preset) */
  tools?: string[];
  /** If set, this step waits for specified step names to complete first */
  dependsOn?: string[];
  /** Context from previous steps to include (step names) */
  contextFrom?: string[];
  /** Max turns for this worker */
  maxTurns?: number;
  /** Optional per-member model override. */
  model?: string;
}

export interface WorkflowTemplate {
  name: string;
  description: string;
  steps: WorkflowStep[];
  /** How to aggregate results: 'concatenate' | 'last' | 'synthesize' */
  aggregation: 'concatenate' | 'last' | 'synthesize';
}

export interface OrchestratorConfig {
  availableTools: ToolDefinition[];
  runLoop: (config: AgentLoopConfig) => Promise<AgentResponse>;
  litellmUrl: string;
  litellmApiKey: string;
  defaultModel?: string;
  /** Abort all workers when the owning async job is cancelled. */
  signal?: AbortSignal;
  /** Approval-gate hooks forwarded into each worker loop (fallback when no request context). */
  hooks?: HookRegistry;
  /**
   * Request-scoped security context accessor (same contract as the sub-agent
   * spawn tool). When present, each worker loop inherits the request's approval
   * gate + governance blockedTools, and its tool subset is intersected with the
   * request's persona allowlist — so a workflow cannot escape the spawning
   * request's restrictions.
   */
  getSpawnSecurityContext?: () => SpawnSecurityContext | undefined;
}

export class SubagentOrchestrator extends EventEmitter {
  private config: OrchestratorConfig;
  private workers: Map<string, WorkerState>;
  private workflowCounter: number;
  private parentContext: string = '';

  /** Role presets (same as subagent-tools for consistency, plus synthesizer/summarizer) */
  static ROLE_TOOL_PRESETS: Record<string, string[]> = {
    researcher: ['web_search', 'web_fetch', 'search_memory', 'save_memory', 'read_file', 'search_files', 'search_content'],
    writer: ['read_file', 'write_file', 'edit_file', 'search_files', 'search_memory', 'save_memory', 'generate_docx'],
    coder: ['bash', 'read_file', 'write_file', 'edit_file', 'search_files', 'search_content', 'git_status', 'git_diff', 'git_log', 'git_commit'],
    analyst: ['bash', 'read_file', 'write_file', 'search_files', 'search_content', 'web_search', 'web_fetch', 'search_memory'],
    reviewer: ['read_file', 'search_files', 'search_content', 'git_status', 'git_diff', 'git_log', 'search_memory'],
    planner: ['create_plan', 'add_plan_step', 'execute_step', 'show_plan', 'search_memory', 'save_memory', 'read_file', 'search_files'],
    synthesizer: ['read_file', 'write_file', 'search_memory', 'save_memory'],
    summarizer: ['read_file', 'search_memory', 'save_memory'],
  };

  constructor(config: OrchestratorConfig) {
    super();
    this.config = config;
    this.workers = new Map();
    this.workflowCounter = 0;
  }

  /** Set parent agent context to inject into all worker prompts */
  setParentContext(ctx: { userName?: string; userRole?: string; workspaceName?: string; workspaceDomain?: string }): void {
    const parts: string[] = ['# Context from Parent Agent'];
    if (ctx.userName) parts.push(`User: ${ctx.userName}${ctx.userRole ? `, ${ctx.userRole}` : ''}`);
    if (ctx.workspaceName) parts.push(`Workspace: ${ctx.workspaceName}${ctx.workspaceDomain ? ` (${ctx.workspaceDomain})` : ''}`);
    parts.push('', '## Key Rules');
    parts.push('- Search memory before claiming you don\'t know something');
    parts.push('- Be grounded in facts — if unsure, say so');
    parts.push('- Save important findings to memory for future reference');
    this.parentContext = parts.join('\n');
  }

  /** Run a workflow from a template, executing steps in dependency order */
  async runWorkflow(template: WorkflowTemplate): Promise<{ results: Map<string, WorkerState>; aggregated: string }> {
    if (template.steps.length === 0) {
      return { results: new Map(), aggregated: '' };
    }

    // Reset workers for this workflow run
    this.workers = new Map();
    const contextResults = new Map<string, string>();

    // Pre-create all workers as 'pending' so UI can show the full workflow plan
    const stepWorkerIds = new Map<string, string>();
    for (const step of template.steps) {
      const id = this.makeWorkerId(step.name);
      stepWorkerIds.set(step.name, id);
      const pendingState: WorkerState = {
        id,
        name: step.name,
        role: step.role,
        status: 'pending',
        task: step.task,
        toolsUsed: [],
        usage: { inputTokens: 0, outputTokens: 0 },
        model: step.model ?? this.config.defaultModel,
      };
      this.workers.set(id, pendingState);
      this.emit('worker:status', { workerId: id, status: 'pending', workerState: pendingState });
    }

    // Build dependency graph and execute in order
    const completed = new Set<string>();
    const steps = [...template.steps];

    // Process dependency-ready waves concurrently. Dependency chains still
    // produce one worker per wave; parallel templates start all ready members.
    while (completed.size < steps.length) {
      const ready = steps.filter((step) => {
        // A context source is also an execution dependency: starting the
        // consumer before that source finishes would silently omit context.
        const prerequisites = new Set([...(step.dependsOn ?? []), ...(step.contextFrom ?? [])]);
        return !completed.has(step.name)
          && [...prerequisites].every((dependency) => completed.has(dependency));
      });

      // Safety: if no progress was made, we have a circular dependency — break
      if (ready.length === 0) {
        const remaining = steps.filter(s => !completed.has(s.name));
        for (const step of remaining) {
          const name = step.name;
          // Reuse the pre-created pending worker id — minting a new id here
          // would orphan the pending entry as a permanent ghost.
          const id = stepWorkerIds.get(name) ?? this.makeWorkerId(name);
          const existing = this.workers.get(id);
          const failedState: WorkerState = {
            ...(existing ?? { name, role: step.role, task: step.task, toolsUsed: [], usage: { inputTokens: 0, outputTokens: 0 } }),
            id,
            status: 'failed',
            error: `Circular dependency detected — unresolvable deps for: ${name}`,
          };
          this.workers.set(id, failedState);
          this.emit('worker:status', { workerId: id, status: 'failed', workerState: failedState });
          completed.add(name);
        }
        break;
      }

      const wave = await Promise.all(
        ready.map((step) => this.runWorker(step, contextResults, stepWorkerIds.get(step.name))),
      );
      for (let index = 0; index < ready.length; index++) {
        const step = ready[index];
        const workerState = wave[index];
        if (workerState.status === 'done' && workerState.result) {
          contextResults.set(step.name, workerState.result);
        }
        completed.add(step.name);
      }
    }

    // Aggregate results
    const aggregated = await this.aggregateResults(this.workers, template.aggregation, contextResults);

    return { results: new Map(this.workers), aggregated };
  }

  /** Get all workers and their current status */
  getWorkers(): WorkerState[] {
    return Array.from(this.workers.values());
  }

  /** Get active (running) workers only */
  getActiveWorkers(): WorkerState[] {
    return Array.from(this.workers.values()).filter(w => w.status === 'running');
  }

  // ── Private helpers ──────────────────────────────────────────────────

  private makeWorkerId(name: string): string {
    this.workflowCounter++;
    return `worker-${this.workflowCounter}-${Date.now()}`;
  }

  private async runWorker(step: WorkflowStep, contextResults: Map<string, string>, existingId?: string): Promise<WorkerState> {
    const id = existingId ?? this.makeWorkerId(step.name);
    // Reuse pre-created pending worker or create fresh
    const workerState: WorkerState = this.workers.get(id) ?? {
      id,
      name: step.name,
      role: step.role,
      status: 'pending',
      task: step.task,
      toolsUsed: [],
      usage: { inputTokens: 0, outputTokens: 0 },
      model: step.model ?? this.config.defaultModel,
    };
    workerState.status = 'running';
    workerState.startedAt = Date.now();
    this.workers.set(id, workerState);
    this.emit('worker:status', { workerId: id, status: 'running', workerState });

    // Resolve tools
    const baseToolNames = step.tools ?? SubagentOrchestrator.ROLE_TOOL_PRESETS[step.role] ?? SubagentOrchestrator.ROLE_TOOL_PRESETS.analyst!;
    // SEC: inherit the spawning request's governance denylist + persona allowlist
    // so a workflow worker cannot escape the request's tool restrictions.
    const secCtx = this.config.getSpawnSecurityContext?.();
    const toolNames = filterSpawnToolNames(baseToolNames, secCtx);
    const eligibleTools = filterAvailableTools(
      this.config.availableTools.filter(t => toolNames.includes(t.name)),
    );
    const tools = selectToolsForTurn(eligibleTools, {
      message: step.task,
      preferredToolNames: toolNames,
      fallbackToEligible: true,
    }).tools;
    const taskShape = detectTaskShape(step.task);
    const runBudget = selectAgentRunBudget({
      taskShape: taskShape.type,
      complexity: taskShape.complexity,
      selectedToolNames: tools.map(tool => tool.name),
    });
    const normalizedMaxTurns = Math.floor(step.maxTurns ?? 0);
    const requestedMaxTurns = Number.isFinite(normalizedMaxTurns) && normalizedMaxTurns >= 1
      ? normalizedMaxTurns
      : runBudget.maxTurns;
    const maxTurns = Math.min(requestedMaxTurns, runBudget.maxTurns);

    // Build system prompt with optional context from previous steps
    const systemPrompt = this.buildWorkerContext(step, contextResults);

    try {
      const result = await this.config.runLoop({
        litellmUrl: this.config.litellmUrl,
        litellmApiKey: this.config.litellmApiKey,
        model: step.model ?? this.config.defaultModel ?? 'claude-sonnet-4-6',
        systemPrompt,
        tools,
        messages: [{ role: 'user', content: step.task }],
        ...runBudget,
        maxTurns,
        maxToolRounds: Math.min(runBudget.maxToolRounds, Math.max(0, maxTurns - 1)),
        stream: false,
        signal: this.config.signal,
        // SEC: worker loops respect the request's approval gate + governance
        // denylist. The executeToolCall critical floor still fail-closes
        // destructive ops even when no gate is wired.
        hooks: secCtx?.hooks ?? this.config.hooks,
        governancePolicies: secCtx?.blockedTools?.length
          ? { blockedTools: [...secCtx.blockedTools] }
          : undefined,
      });

      workerState.status = 'done';
      workerState.completedAt = Date.now();
      workerState.result = result.content;
      workerState.toolsUsed = result.toolsUsed;
      workerState.usage = { inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens };

      this.emit('worker:status', { workerId: id, status: 'done', workerState });
    } catch (err) {
      workerState.status = 'failed';
      workerState.completedAt = Date.now();
      workerState.error = err instanceof Error ? err.message : String(err);

      this.emit('worker:status', { workerId: id, status: 'failed', workerState });
    }

    return workerState;
  }

  private buildWorkerContext(step: WorkflowStep, contextResults: Map<string, string>): string {
    let prompt = '';
    if (this.parentContext) {
      prompt += this.parentContext + '\n\n';
    }
    prompt += `# Sub-Agent: ${step.name}\nRole: ${step.role}\nTask: Complete the following task and return a comprehensive result.\n\n## Your Task\n${step.task}\n`;

    // Inject context from previous steps
    const contextFrom = step.contextFrom ?? [];
    if (contextFrom.length > 0) {
      const contextParts: string[] = [];
      for (const sourceName of contextFrom) {
        const sourceResult = contextResults.get(sourceName);
        if (sourceResult) {
          contextParts.push(`### ${sourceName}\n${sourceResult}`);
        }
      }
      if (contextParts.length > 0) {
        prompt += `\n## Previous Results\n${contextParts.join('\n\n')}\n`;
      }
    }

    prompt += `\n## Guidelines\n- Focus exclusively on your assigned task.\n- Use your tools efficiently.\n- Be thorough but concise in your final response.\n- When done, provide a clear summary of your findings/results.`;

    return prompt;
  }

  private async aggregateResults(
    workers: Map<string, WorkerState>,
    mode: WorkflowTemplate['aggregation'],
    contextResults: Map<string, string>,
  ): Promise<string> {
    const workerList = Array.from(workers.values());
    const doneWorkers = workerList.filter(w => w.status === 'done' && w.result);

    if (doneWorkers.length === 0) return '';

    switch (mode) {
      case 'concatenate': {
        return doneWorkers
          .map(w => `## ${w.name}\n${w.result}`)
          .join('\n\n');
      }

      case 'last': {
        return doneWorkers[doneWorkers.length - 1].result!;
      }

      case 'synthesize': {
        // Spawn a synthesizer worker to combine all results
        const allResults = doneWorkers
          .map(w => `### ${w.name}\n${w.result}`)
          .join('\n\n');

        const synthesizeStep: WorkflowStep = {
          name: 'Synthesizer',
          role: 'synthesizer',
          task: `Synthesize the following results from multiple workers into a cohesive response:\n\n${allResults}`,
        };

        const synthState = await this.runWorker(synthesizeStep, contextResults);
        return synthState.result ?? '';
      }

      default:
        return doneWorkers.map(w => w.result).join('\n\n');
    }
  }
}
