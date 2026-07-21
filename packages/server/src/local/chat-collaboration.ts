import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { evaluateExternalMemoryIngress, FrameStore, SessionStore } from '@waggle/core';
import {
  createSubAgentTools,
  createWorkflowTools,
  type AgentLoopConfig,
  type AgentResponse,
  type HookRegistry,
  type ToolDefinition,
} from '@waggle/agent';
import type {
  CollaborationRoomRun,
  CollaborationRun,
  CollaborationRunMemoryRefs,
  CollaborationWorkerRun,
  WaggleMessage,
} from '@waggle/shared';
import { emitSubagentStatus } from './routes/notifications.js';

const COLLABORATION_TOOL_NAMES = new Set([
  'spawn_agent', 'list_agents', 'get_agent_result',
  'compose_workflow', 'orchestrate_workflow', 'list_harnesses', 'run_harness',
]);
const TERMINAL = new Set(['completed', 'failed', 'cancelled', 'interrupted']);
const QUARANTINED_AGENT_INPUT = '[Quarantined agent input: unsafe external content]';
const QUARANTINED_AGENT_RESULT = '[Quarantined agent result: unsafe external content]';
const QUARANTINED_AGENT_ERROR = '[Quarantined agent error: unsafe external content]';

type CollaborationTextKind = 'input' | 'result' | 'error';

function guardCollaborationText(text: string, kind: CollaborationTextKind): string {
  if (evaluateExternalMemoryIngress({ content: text }).action === 'allow') return text;
  if (kind === 'result') return QUARANTINED_AGENT_RESULT;
  if (kind === 'error') return QUARANTINED_AGENT_ERROR;
  return QUARANTINED_AGENT_INPUT;
}

function guardOptionalText(text: string | undefined, kind: CollaborationTextKind): string | undefined {
  return text === undefined ? undefined : guardCollaborationText(text, kind);
}

function guardTextList(values: string[]): string[] {
  return values.map((value) => guardCollaborationText(value, 'input'));
}

export interface ChatCollaborationSecurityContext {
  hooks?: HookRegistry;
  blockedTools?: readonly string[];
  allowedToolNames?: ReadonlySet<string> | null;
}

export interface BindChatCollaborationOptions {
  server: FastifyInstance;
  /** Tools visible to this parent turn after persona/availability/intent filtering. */
  visibleTools: ToolDefinition[];
  /** Broader persona + availability-filtered pool for the explicit child task. */
  workerTools: ToolDefinition[];
  workspaceId: string;
  parentSessionId: string;
  parentTask: string;
  model: string;
  runLoop: (config: AgentLoopConfig) => Promise<AgentResponse>;
  securityContext: ChatCollaborationSecurityContext;
}

interface WorkflowContext {
  room: CollaborationRoomRun;
  controller: AbortController;
  workers: Map<string, CollaborationWorkerRun>;
  assignments: Map<string, string | undefined>;
  unregister: () => void;
}

/**
 * Replace only collaboration tools that survived the parent turn's policy
 * filters. Every replacement captures one concrete workspace + chat session;
 * no lifecycle callback consults `agentState.activeWorkspaceId`.
 */
export function bindChatCollaborationTools(options: BindChatCollaborationOptions): ToolDefinition[] {
  const {
    server, visibleTools, workspaceId, parentSessionId, parentTask,
    model, runLoop, securityContext,
  } = options;
  const enabledNames = new Set(visibleTools.map((tool) => tool.name));
  const workerTools = options.workerTools.filter((tool) => !COLLABORATION_TOOL_NAMES.has(tool.name));
  const subagentAssignments = new Map<string, string | undefined>();
  const workflowContexts = new Map<string, WorkflowContext>();
  let subagentRoom: CollaborationRoomRun | undefined;

  const subagentAdapter = {
    start(input: {
      provisionalAgentId: string;
      name: string;
      role: string;
      task: string;
      model: string;
    }) {
      const durableName = guardCollaborationText(input.name, 'input');
      const durableRole = guardCollaborationText(input.role, 'input');
      const durableTask = guardCollaborationText(input.task, 'input');
      const durableModel = guardCollaborationText(input.model, 'input');
      const priorRoom = subagentRoom ? server.agentRunRegistry.get(subagentRoom.id) : undefined;
      if (!subagentRoom || !priorRoom || TERMINAL.has(priorRoom.status)) {
        subagentRoom = server.agentRunRegistry.createRoom({
          workspaceIds: [workspaceId],
          source: 'chat_subagent',
          title: `Chat collaboration - ${parentSessionId}`,
          task: parentTask,
          executor: { kind: 'coordinator' },
          capabilities: { cancel: true },
        });
      }
      const controller = new AbortController();
      const run = server.agentRunRegistry.createWorker({
        parentRunId: subagentRoom.id,
        workspaceId,
        source: 'chat_subagent',
        executor: {
          kind: 'waggle_agent',
          agentId: input.provisionalAgentId,
          personaId: durableRole,
          model: durableModel,
        },
        title: durableName,
        task: durableTask,
        capabilities: { cancel: true },
      });
      const unregister = server.agentRunRegistry.registerControls(run.id, {
        cancel: () => controller.abort(),
      });
      const assignment = publishDance(server, run, 'request', 'task_delegation', {
        task: durableTask, phase: 'queued', role: durableRole, model: durableModel,
        parentSessionId,
      });
      subagentAssignments.set(run.id, assignment?.id);
      server.agentRunRegistry.update(run.id, {
        status: 'running',
        result: { sessionId: parentSessionId },
        progress: { message: 'Sub-agent started', phase: 'running' },
      });
      publishDance(server, run, 'response', 'task_claim', {
        phase: 'running', role: durableRole, parentSessionId,
      }, assignment?.id);
      emitSubagentStatus(server, workspaceId, [{
        id: run.id, name: durableName, role: durableRole, status: 'running',
        task: durableTask, toolsUsed: [], startedAt: Date.now(),
      }]);
      return { runId: run.id, signal: controller.signal, dispose: unregister };
    },
    complete(handle: { runId: string; signal?: AbortSignal }, result: {
      response: string;
      toolsUsed: string[];
      usage: { inputTokens: number; outputTokens: number };
      agentName: string;
      role: string;
      completedAt: number;
    }) {
      const current = workerRun(server.agentRunRegistry.get(handle.runId));
      if (!current || TERMINAL.has(current.status)) return;
      const durableResult = guardCollaborationText(result.response, 'result');
      const durableTools = guardTextList(result.toolsUsed);
      const memoryRefs = recordResult(server, current, workspaceId, current.task, durableResult, 'Chat sub-agent');
      server.agentRunRegistry.update(current.id, {
        status: 'completed',
        result: { summary: durableResult, sessionId: parentSessionId },
        metrics: {
          toolsUsed: durableTools,
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
        },
        memoryRefs,
        progress: null,
      });
      emitSubagentStatus(server, workspaceId, [{
        id: current.id, name: current.title,
        role: current.executor.personaId ?? 'agent', status: 'done',
        task: current.task, toolsUsed: durableTools,
        startedAt: current.startedAt ? Date.parse(current.startedAt) : undefined,
        completedAt: result.completedAt,
      }]);
      publishDance(server, current, 'broadcast', 'routed_share', {
        phase: 'completed', result: durableResult, parentSessionId,
      }, subagentAssignments.get(current.id));
    },
    fail(handle: { runId: string; signal?: AbortSignal }, input: {
      name: string;
      role: string;
      task: string;
      error: string;
      completedAt: number;
      cancelled: boolean;
    }) {
      const current = workerRun(server.agentRunRegistry.get(handle.runId));
      if (!current || TERMINAL.has(current.status)) return;
      const status = input.cancelled || handle.signal?.aborted ? 'cancelled' : 'failed';
      const durableError = guardCollaborationText(input.error, 'error');
      server.agentRunRegistry.update(current.id, {
        status,
        result: { error: durableError, summary: durableError, sessionId: parentSessionId },
        progress: null,
      });
      emitSubagentStatus(server, workspaceId, [{
        id: current.id, name: current.title,
        role: current.executor.personaId ?? 'agent', status: 'failed',
        task: current.task, toolsUsed: [],
        startedAt: current.startedAt ? Date.parse(current.startedAt) : undefined,
        completedAt: input.completedAt,
      }]);
      publishDance(server, current, 'broadcast', 'routed_share', {
        phase: status, error: durableError, parentSessionId,
      }, subagentAssignments.get(current.id));
    },
    list() {
      return listChatSubagentRuns(server, workspaceId, parentSessionId).map(runView);
    },
    get(idOrName: string) {
      const run = listChatSubagentRuns(server, workspaceId, parentSessionId)
        .find((candidate) => candidate.id === idOrName || candidate.title === idOrName);
      return run ? runView(run) : undefined;
    },
  };

  const workflowAdapter = {
    start(input: { workflowName: string; task: string; template: {
      steps: Array<{ name: string; role: string; task: string; model?: string }>;
    } }) {
      const durableWorkflowName = guardCollaborationText(input.workflowName, 'input');
      const durableWorkflowTask = guardCollaborationText(input.task, 'input');
      const room = server.agentRunRegistry.createRoom({
        workspaceIds: [workspaceId],
        source: 'workflow',
        title: durableWorkflowName,
        task: durableWorkflowTask,
        executor: { kind: 'coordinator' },
        capabilities: { cancel: true },
      });
      const controller = new AbortController();
      const workers = new Map<string, CollaborationWorkerRun>();
      const assignments = new Map<string, string | undefined>();
      for (const step of input.template.steps) {
        const durableName = guardCollaborationText(step.name, 'input');
        const durableRole = guardCollaborationText(step.role, 'input');
        const durableTask = guardCollaborationText(step.task, 'input');
        const durableModel = guardCollaborationText(step.model ?? model, 'input');
        const run = server.agentRunRegistry.createWorker({
          parentRunId: room.id,
          workspaceId,
          source: 'workflow',
          executor: {
            kind: 'waggle_agent', personaId: durableRole,
            agentId: `workflow:${durableName}`, model: durableModel,
          },
          title: durableName,
          task: durableTask,
          // The current orchestrator has one shared AbortSignal. Individual
          // cancellation would falsely imply isolation, so only the Room can cancel.
          capabilities: { cancel: false },
        });
        server.agentRunRegistry.update(run.id, { result: { sessionId: parentSessionId } });
        workers.set(step.name, run);
        const assignment = publishDance(server, run, 'request', 'task_delegation', {
          task: durableTask, phase: 'queued', role: durableRole,
          model: durableModel, parentSessionId,
        });
        assignments.set(step.name, assignment?.id);
      }
      const context: WorkflowContext = {
        room, controller, workers, assignments,
        unregister: () => undefined,
      };
      context.unregister = server.agentRunRegistry.registerControls(room.id, {
        cancel: () => {
          controller.abort();
          for (const [name, worker] of workers) {
            const current = server.agentRunRegistry.get(worker.id);
            if (current && !TERMINAL.has(current.status)) {
              server.agentRunRegistry.update(worker.id, {
                status: 'cancelled', result: { summary: 'Workflow cancelled', sessionId: parentSessionId },
              });
              emitSubagentStatus(server, workspaceId, [{
                id: worker.id, name: worker.title,
                role: worker.executor.personaId ?? 'agent', status: 'failed',
                task: worker.task, toolsUsed: current.metrics?.toolsUsed ?? [],
                startedAt: current.startedAt ? Date.parse(current.startedAt) : undefined,
                completedAt: Date.now(),
              }]);
              publishDance(server, worker, 'broadcast', 'routed_share', {
                phase: 'cancelled', error: 'Workflow cancelled', parentSessionId,
              }, assignments.get(name));
            }
          }
        },
      });
      workflowContexts.set(room.id, context);
      return {
        runId: room.id,
        signal: controller.signal,
        dispose: () => {
          context.unregister();
          workflowContexts.delete(room.id);
        },
      };
    },
    worker(handle: { runId: string }, event: { workerState: {
      name: string;
      role: string;
      status: 'pending' | 'running' | 'done' | 'failed';
      task: string;
      result?: string;
      error?: string;
      toolsUsed: string[];
      usage: { inputTokens: number; outputTokens: number };
      startedAt?: number;
      completedAt?: number;
      model?: string;
    } }) {
      const context = workflowContexts.get(handle.runId);
      const known = context?.workers.get(event.workerState.name);
      const current = known ? workerRun(server.agentRunRegistry.get(known.id)) : undefined;
      if (!context || !current || TERMINAL.has(current.status)) return;
      const status = context.controller.signal.aborted
        ? 'cancelled'
        : event.workerState.status === 'done'
          ? 'completed'
          : event.workerState.status === 'failed'
            ? 'failed'
            : event.workerState.status === 'running' ? 'running' : 'queued';
      const durableResult = guardOptionalText(event.workerState.result, 'result');
      const durableError = guardOptionalText(event.workerState.error, 'error');
      const durableModel = guardOptionalText(event.workerState.model, 'input');
      const durableTools = guardTextList(event.workerState.toolsUsed);
      const memoryRefs = status === 'completed' && durableResult
        ? recordResult(server, current, workspaceId, current.task, durableResult, 'Workflow worker')
        : undefined;
      server.agentRunRegistry.update(current.id, {
        status,
        executor: { model: durableModel },
        ...(durableResult ? { result: { summary: durableResult, sessionId: parentSessionId } } : {}),
        ...(durableError ? { result: { error: durableError, sessionId: parentSessionId } } : {}),
        metrics: {
          toolsUsed: durableTools,
          inputTokens: event.workerState.usage.inputTokens,
          outputTokens: event.workerState.usage.outputTokens,
        },
        ...(memoryRefs ? { memoryRefs } : {}),
        progress: status === 'running' ? { message: 'Workflow worker running', phase: 'running' } : null,
      });
      emitSubagentStatus(server, workspaceId, [{
        id: current.id, name: current.title, role: current.executor.personaId ?? 'agent',
        status: status === 'completed'
          ? 'done'
          : status === 'failed' || status === 'cancelled'
            ? 'failed'
            : status === 'running' ? 'running' : 'pending',
        task: current.task, toolsUsed: durableTools,
        startedAt: event.workerState.startedAt, completedAt: event.workerState.completedAt,
      }]);
      if (status === 'running') {
        publishDance(server, current, 'response', 'task_claim', {
          phase: status, role: current.executor.personaId ?? 'agent', parentSessionId,
        }, context.assignments.get(event.workerState.name));
      } else if (TERMINAL.has(status)) {
        publishDance(server, current, 'broadcast', 'routed_share', {
          phase: status, result: durableResult ?? null,
          error: durableError ?? null, parentSessionId,
        }, context.assignments.get(event.workerState.name));
      }
    },
    complete(handle: { runId: string }, output: { aggregated: string }) {
      const context = workflowContexts.get(handle.runId);
      const current = context ? server.agentRunRegistry.get(context.room.id) : undefined;
      if (!context || !current || current.status === 'cancelled') return;
      const durableAggregate = guardCollaborationText(output.aggregated, 'result');
      const memoryRefs = durableAggregate
        ? recordResult(server, context.room, workspaceId, context.room.task, durableAggregate, 'Workflow aggregate')
        : { status: 'failed' as const, personalFrameIds: [], workspaceFrameIds: {} };
      server.agentRunRegistry.update(context.room.id, {
        result: { summary: durableAggregate, sessionId: parentSessionId },
        memoryRefs,
        progress: null,
      });
    },
    fail(handle: { runId: string }, error: Error) {
      const context = workflowContexts.get(handle.runId);
      if (!context) return;
      const durableError = guardCollaborationText(error.message, 'error');
      for (const worker of context.workers.values()) {
        const current = server.agentRunRegistry.get(worker.id);
        if (current && !TERMINAL.has(current.status)) {
          server.agentRunRegistry.update(worker.id, {
            status: context.controller.signal.aborted ? 'cancelled' : 'failed',
            result: { error: durableError, sessionId: parentSessionId },
          });
        }
      }
      server.agentRunRegistry.update(context.room.id, { result: { error: durableError, sessionId: parentSessionId } });
    },
  };

  const replacements = [
    ...createSubAgentTools({
      availableTools: workerTools,
      runLoop,
      litellmUrl: server.localConfig.litellmUrl,
      litellmApiKey: server.agentState.litellmApiKey,
      defaultModel: model,
      hooks: securityContext.hooks,
      getSpawnSecurityContext: () => securityContext,
      runAdapter: subagentAdapter,
      onSubAgentTool: (runId, name) => {
        const current = workerRun(server.agentRunRegistry.get(runId));
        if (!current || TERMINAL.has(current.status)) return;
        const durableName = guardCollaborationText(name, 'input');
        const toolsUsed = [...new Set([...(current.metrics?.toolsUsed ?? []), durableName])];
        server.agentRunRegistry.update(runId, {
          progress: { message: durableName, phase: 'tool' }, metrics: { toolsUsed },
        });
        publishDance(server, current, 'broadcast', 'discovery', {
          phase: 'tool', tool: durableName, parentSessionId,
        }, subagentAssignments.get(runId));
      },
    }),
    ...createWorkflowTools({
      availableTools: workerTools,
      runLoop,
      litellmUrl: server.localConfig.litellmUrl,
      litellmApiKey: server.agentState.litellmApiKey,
      defaultModel: model,
      hooks: securityContext.hooks,
      getSpawnSecurityContext: () => securityContext,
      skills: server.agentState.skills,
      subAgentsAvailable: enabledNames.has('spawn_agent') || enabledNames.has('orchestrate_workflow'),
      runAdapter: workflowAdapter,
    }),
  ].filter((tool) => enabledNames.has(tool.name));

  return [
    ...visibleTools.filter((tool) => !COLLABORATION_TOOL_NAMES.has(tool.name)),
    ...replacements,
  ];
}

function listChatSubagentRuns(
  server: FastifyInstance,
  workspaceId: string,
  parentSessionId: string,
): CollaborationWorkerRun[] {
  return server.agentRunRegistry.list({ source: 'chat_subagent', workspaceId, limit: 1_000 })
    .filter((run): run is CollaborationWorkerRun => run.kind === 'worker')
    .filter((run) => run.result?.sessionId === parentSessionId);
}

function runView(run: CollaborationWorkerRun) {
  return {
    id: run.id,
    name: run.title,
    role: run.executor.personaId ?? 'agent',
    task: run.task,
    status: run.status,
    result: run.status === 'completed' ? run.result?.summary : undefined,
    error: run.result?.error,
    toolsUsed: run.metrics?.toolsUsed,
    usage: {
      inputTokens: run.metrics?.inputTokens ?? 0,
      outputTokens: run.metrics?.outputTokens ?? 0,
    },
    startedAt: run.startedAt ? Date.parse(run.startedAt) : undefined,
    completedAt: run.completedAt ? Date.parse(run.completedAt) : undefined,
  };
}

function workerRun(run: CollaborationRun | undefined): CollaborationWorkerRun | undefined {
  return run?.kind === 'worker' ? run : undefined;
}

function recordResult(
  server: FastifyInstance,
  run: CollaborationRun,
  workspaceId: string,
  task: string,
  result: string,
  label: string,
): CollaborationRunMemoryRefs {
  const personalFrameIds: number[] = [];
  const workspaceFrameIds: Record<string, number[]> = {};
  const metadata = JSON.stringify({
    runId: run.id, roomId: run.roomId, workspaceId,
    source: run.source, parent: 'chat',
  });
  try {
    const personal = server.multiMind.personal;
    new SessionStore(personal).ensure('agent-runs', 'agent-runs', 'Agent collaboration index');
    const frames = new FrameStore(personal);
    const personalContent = `[${label}]\nRun: ${run.id}\nWorkspace: ${workspaceId}\nSummary: ${result.slice(0, 1_000)}`;
    const frame = frames.createIFrame(
      'agent-runs',
      guardCollaborationText(personalContent, 'result'),
      'normal', 'agent_inferred',
    );
    frames.setMetadata(frame.id, metadata);
    personalFrameIds.push(frame.id);
  } catch { /* workspace result remains authoritative */ }

  let acquired = false;
  try {
    const workspaceMind = server.mindCache.acquire(workspaceId);
    acquired = true;
    new SessionStore(workspaceMind).ensure('agent-runs', 'agent-runs', 'Agent collaboration results');
    const frames = new FrameStore(workspaceMind);
    const workspaceContent = `[${label} result]\nRun: ${run.id}\nTask:\n${task}\n\nResult:\n${result.slice(0, 100_000)}`;
    const frame = frames.createIFrame(
      'agent-runs',
      guardCollaborationText(workspaceContent, 'result'),
      'normal', 'agent_inferred',
    );
    frames.setMetadata(frame.id, metadata);
    workspaceFrameIds[workspaceId] = [frame.id];
  } catch { /* reflected in memoryRefs status */ }
  finally {
    if (acquired) server.mindCache.release(workspaceId);
  }

  const personalOk = personalFrameIds.length > 0;
  const workspaceOk = (workspaceFrameIds[workspaceId]?.length ?? 0) > 0;
  return {
    status: personalOk && workspaceOk ? 'complete' : personalOk || workspaceOk ? 'partial' : 'failed',
    personalFrameIds,
    workspaceFrameIds,
  };
}

function publishDance(
  server: FastifyInstance,
  run: CollaborationWorkerRun,
  type: WaggleMessage['type'],
  subtype: WaggleMessage['subtype'],
  content: Record<string, unknown>,
  referenceId?: string,
): WaggleMessage | undefined {
  if (!server.signalBus) return undefined;
  const guardedFields = Object.fromEntries(Object.entries(content).map(([key, value]) => {
    if (typeof value !== 'string') return [key, value];
    const kind = key === 'error' ? 'error' : key === 'result' ? 'result' : 'input';
    return [key, guardCollaborationText(value, kind)];
  }));
  const candidateContent: Record<string, unknown> = {
    kind: run.source === 'workflow' ? 'workflow_worker' : 'chat_subagent',
    roomId: run.roomId,
    runId: run.id,
    workspaceId: run.workspaceId,
    ...guardedFields,
  };
  const durableContent = evaluateExternalMemoryIngress({
    content: JSON.stringify(candidateContent),
  }).action === 'allow'
    ? candidateContent
    : {
        kind: candidateContent.kind,
        roomId: run.roomId,
        runId: run.id,
        workspaceId: run.workspaceId,
        ...(typeof guardedFields.phase === 'string' ? { phase: guardedFields.phase } : {}),
        ...('result' in guardedFields ? { result: QUARANTINED_AGENT_RESULT } : {}),
        ...('error' in guardedFields ? { error: QUARANTINED_AGENT_ERROR } : {}),
        detail: QUARANTINED_AGENT_INPUT,
      };
  return server.signalBus.record({
    id: randomUUID(),
    teamId: `room::${run.roomId}`,
    senderId: type === 'request' ? 'user' : `run::${run.id}`,
    type,
    subtype,
    content: durableContent,
    referenceId: referenceId ?? null,
    routing: null,
    createdAt: new Date(),
  });
}
