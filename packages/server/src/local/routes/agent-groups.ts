/**
 * Agent Groups routes — CRUD for multi-agent group configurations.
 *
 * Groups are stored in {dataDir}/agent-groups.json.
 * Each group defines a strategy (parallel/sequential/coordinator)
 * and a list of member agents with roles and execution order.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { evaluateExternalMemoryIngress, FrameStore, SessionStore } from '@waggle/core';
import type { CollaborationRunMemoryRefs, CollaborationWorkerRun, WaggleMessage } from '@waggle/shared';
import {
  SubagentOrchestrator,
  listPersonas,
  runAgentLoop,
  type AgentPersona,
  type WorkflowTemplate,
} from '@waggle/agent';
import type { AgentRunner } from './chat.js';
import { buildWorkflowFromGroup } from '../../services/agent-group-executor.js';
import { applyPersonaToolFilter } from '../persona-tool-filter.js';
import { resolveUsableModel } from '../model-availability.js';
import { resolveWorkspaceExecutionRoot } from '../workspace-execution-root.js';
import { isOfflineOllamaModelReference } from './chat-helpers.js';

interface AgentGroupMember {
  agentId: string;
  roleInGroup: 'lead' | 'worker' | string;
  executionOrder: number;
}

interface AgentGroup {
  id: string;
  name: string;
  description?: string;
  strategy: 'parallel' | 'sequential' | 'coordinator';
  members: AgentGroupMember[];
  createdAt: string;
}

interface GroupRunContext {
  roomId: string;
  workspaceId: string;
  cwd: string;
  runs: Map<string, CollaborationWorkerRun>;
  assignmentIds: Map<string, string>;
}

const STRATEGIES = ['parallel', 'sequential', 'coordinator'] as const;
type GroupStrategy = typeof STRATEGIES[number];
const QUARANTINED_AGENT_RESULT = '[Quarantined agent result: unsafe external content]';
const QUARANTINED_AGENT_ERROR = '[Quarantined agent error: unsafe external content]';

function isStrategy(value: string): value is GroupStrategy {
  return STRATEGIES.includes(value as GroupStrategy);
}

function normalizeMembers(members: AgentGroupMember[] | undefined): AgentGroupMember[] | null {
  if (!Array.isArray(members) || members.length < 2) return null;
  const ids = new Set<string>();
  const normalized = members.map((member, index) => {
    if (!member || typeof member.agentId !== 'string' || !member.agentId.trim() || ids.has(member.agentId)) return null;
    ids.add(member.agentId);
    return {
      agentId: member.agentId,
      roleInGroup: member.roleInGroup || 'worker',
      executionOrder: Number.isFinite(member.executionOrder) ? member.executionOrder : index,
    } satisfies AgentGroupMember;
  });
  return normalized.every(Boolean) ? normalized as AgentGroupMember[] : null;
}

function resolvePersona(id: string): AgentPersona | undefined {
  return listPersonas().find((persona) => persona.id === id);
}

function snapshotWorkers(orchestrator: SubagentOrchestrator): Record<string, unknown>[] {
  return orchestrator.getWorkers().map((worker) => ({
    id: worker.id,
    name: worker.name,
    role: worker.role,
    status: worker.status,
    result: worker.result,
    error: worker.error,
    startedAt: worker.startedAt,
    completedAt: worker.completedAt,
    toolsUsed: worker.toolsUsed,
    usage: worker.usage,
    model: worker.model,
  }));
}

function guardAgentOutput(text: string, kind: 'result' | 'error'): string {
  if (evaluateExternalMemoryIngress({ content: text }).action === 'allow') return text;
  return kind === 'result' ? QUARANTINED_AGENT_RESULT : QUARANTINED_AGENT_ERROR;
}

function guardAgentRunner(runLoop: AgentRunner): AgentRunner {
  return async (config) => {
    try {
      const response = await runLoop(config);
      const content = guardAgentOutput(response.content, 'result');
      return content === response.content ? response : { ...response, content };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const durableMessage = guardAgentOutput(message, 'error');
      if (durableMessage === message) throw error;
      throw new Error(durableMessage);
    }
  };
}

function getGroupsPath(dataDir: string): string {
  return path.join(dataDir, 'agent-groups.json');
}

function loadGroups(dataDir: string): AgentGroup[] {
  const filePath = getGroupsPath(dataDir);
  if (!fs.existsSync(filePath)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function saveGroups(dataDir: string, groups: AgentGroup[]): void {
  fs.writeFileSync(getGroupsPath(dataDir), JSON.stringify(groups, null, 2), 'utf-8');
}

export const agentGroupRoutes: FastifyPluginAsync = async (server) => {
  const dataDir = server.localConfig.dataDir;
  const activeExecutions = new Map<string, Promise<void>>();
  let shuttingDown = false;

  server.addHook('preClose', async () => {
    shuttingDown = true;
    const executions = [...activeExecutions.entries()];
    for (const [jobId] of executions) server.localJobStore.cancel(jobId);
    const results = await Promise.allSettled(executions.map(([, execution]) => execution));
    const failures = results.flatMap((result, index) => (
      result.status === 'rejected'
        ? [{ jobId: executions[index][0], reason: result.reason }]
        : []
    ));
    if (failures.length > 0) {
      throw new AggregateError(
        failures.map(({ jobId, reason }) => (
          `${jobId}: ${reason instanceof Error ? reason.message : String(reason)}`
        )),
        'Agent group execution cleanup failed during shutdown',
      );
    }
  });

  // GET /api/agent-groups
  server.get('/api/agent-groups', async () => {
    return loadGroups(dataDir);
  });

  // POST /api/agent-groups
  server.post<{
    Body: { name: string; description?: string; strategy: string; members: AgentGroupMember[] };
  }>('/api/agent-groups', async (request, reply) => {
    const { name, description, strategy, members } = request.body ?? {};
    if (typeof name !== 'string' || !name.trim()) return reply.code(400).send({ error: 'name is required' });
    if (!isStrategy(strategy)) return reply.code(400).send({ error: `strategy must be one of: ${STRATEGIES.join(', ')}` });
    const normalizedMembers = normalizeMembers(members);
    if (!normalizedMembers) return reply.code(400).send({ error: 'members must contain at least two unique agents' });
    const missingPersona = normalizedMembers.find((member) => !resolvePersona(member.agentId));
    if (missingPersona) return reply.code(400).send({ error: `Unknown persona: ${missingPersona.agentId}` });

    const groups = loadGroups(dataDir);
    const group: AgentGroup = {
      id: crypto.randomUUID(),
      name: name.trim(),
      description,
      strategy,
      members: normalizedMembers,
      createdAt: new Date().toISOString(),
    };
    groups.push(group);
    saveGroups(dataDir, groups);
    return reply.code(201).send(group);
  });

  // PATCH /api/agent-groups/:id
  server.patch<{
    Params: { id: string };
    Body: Partial<{ name: string; description: string; strategy: string; members: AgentGroupMember[] }>;
  }>('/api/agent-groups/:id', async (request, reply) => {
    const groups = loadGroups(dataDir);
    const idx = groups.findIndex(g => g.id === request.params.id);
    if (idx === -1) return reply.code(404).send({ error: 'Group not found' });

    const { name, description, strategy, members } = request.body ?? {};
    if (name !== undefined && (typeof name !== 'string' || !name.trim())) {
      return reply.code(400).send({ error: 'name cannot be blank' });
    }
    if (name !== undefined) groups[idx].name = name;
    if (description !== undefined) groups[idx].description = description;
    if (strategy !== undefined) {
      if (!isStrategy(strategy)) return reply.code(400).send({ error: `strategy must be one of: ${STRATEGIES.join(', ')}` });
      groups[idx].strategy = strategy;
    }
    if (members !== undefined) {
      const normalizedMembers = normalizeMembers(members);
      if (!normalizedMembers) return reply.code(400).send({ error: 'members must contain at least two unique agents' });
      const missingPersona = normalizedMembers.find((member) => !resolvePersona(member.agentId));
      if (missingPersona) return reply.code(400).send({ error: `Unknown persona: ${missingPersona.agentId}` });
      groups[idx].members = normalizedMembers;
    }
    saveGroups(dataDir, groups);
    return groups[idx];
  });

  // DELETE /api/agent-groups/:id
  server.delete<{
    Params: { id: string };
  }>('/api/agent-groups/:id', async (request, reply) => {
    const groups = loadGroups(dataDir);
    const idx = groups.findIndex(g => g.id === request.params.id);
    if (idx === -1) return reply.code(404).send({ error: 'Group not found' });

    groups.splice(idx, 1);
    saveGroups(dataDir, groups);
    return { deleted: true };
  });

  // POST /api/agent-groups/:id/run — execute a group asynchronously in the local sidecar.
  server.post<{
    Params: { id: string };
    Body: { task: string; workspaceId?: string; teamId?: string };
  }>('/api/agent-groups/:id/run', async (request, reply) => {
    if (shuttingDown) return reply.code(503).send({ error: 'server_shutting_down' });
    const groups = loadGroups(dataDir);
    const group = groups.find(g => g.id === request.params.id);
    if (!group) return reply.code(404).send({ error: 'Group not found' });

    const { task } = request.body;
    if (!task || typeof task !== 'string' || !task.trim()) return reply.code(400).send({ error: 'task is required' });
    if (group.members.length < 2) return reply.code(400).send({ error: 'Group must have at least two members' });

    const missingPersona = group.members.find((member) => !resolvePersona(member.agentId));
    if (missingPersona) return reply.code(409).send({ error: `Persona no longer exists: ${missingPersona.agentId}` });

    const workspaceId = server.agentRunRegistry && server.workspaceManager
      ? request.body.workspaceId
        || server.workspaceManager.getDefault()
        || server.workspaceManager.list()[0]?.id
      : undefined;
    const workspace = workspaceId ? server.workspaceManager.get(workspaceId) : undefined;
    if (server.agentRunRegistry && server.workspaceManager) {
      if (!workspaceId) return reply.code(404).send({ error: 'workspace_not_found' });
      if (!workspace) return reply.code(404).send({ error: 'workspace_not_found' });
    }

    let localExecutionModel: string | undefined;
    const workspaceModel = workspace?.model?.trim();
    const currentModel = server.agentState.currentModel?.trim();
    const configuredModel = workspaceModel && isOfflineOllamaModelReference(workspaceModel)
      ? workspaceModel
      : currentModel;
    if (configuredModel && isOfflineOllamaModelReference(configuredModel)) {
      try {
        localExecutionModel = await resolveUsableModel(server, configuredModel);
        if (shuttingDown) return reply.code(503).send({ error: 'server_shutting_down' });
      } catch (error) {
        return reply.code(409).send({
          error: 'model_unavailable',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    let runContext: GroupRunContext | undefined;
    if (server.agentRunRegistry && server.workspaceManager) {
      const resolvedWorkspaceId = workspaceId!;
      const resolvedWorkspace = workspace!;
      let cwd: string;
      try { cwd = resolveWorkspaceExecutionRoot(dataDir, resolvedWorkspace); }
      catch (err) {
        return reply.code(409).send({ error: 'workspace_root_invalid', message: err instanceof Error ? err.message : String(err) });
      }
      const room = server.agentRunRegistry.createRoom({
        workspaceIds: [resolvedWorkspaceId],
        source: 'agent_group',
        executor: { kind: 'coordinator', agentId: group.id },
        title: group.name,
        task: task.trim(),
        capabilities: { cancel: true },
      });
      const runs = new Map<string, CollaborationWorkerRun>();
      const assignmentIds = new Map<string, string>();
      for (const member of [...group.members].sort((a, b) => a.executionOrder - b.executionOrder)) {
        const persona = resolvePersona(member.agentId)!;
        const run = server.agentRunRegistry.createWorker({
          parentRunId: room.id,
          workspaceId: resolvedWorkspaceId,
          source: 'agent_group',
          executor: {
            kind: 'waggle_agent', agentId: member.agentId,
            personaId: persona.id, model: localExecutionModel ?? persona.modelPreference,
          },
          title: persona.name,
          task: task.trim(),
          // A group shares one workflow controller. Individual workers cannot
          // be stopped independently without corrupting dependency semantics;
          // cancellation is therefore truthfully exposed at Room level only.
          capabilities: { cancel: false },
        });
        runs.set(persona.name, run);
        const assignment = publishGroupDance(server, run, 'request', 'task_delegation', {
          task: task.trim(), groupId: group.id, strategy: group.strategy, phase: 'queued',
        });
        if (assignment) assignmentIds.set(persona.name, assignment.id);
      }
      runContext = { roomId: room.id, workspaceId: resolvedWorkspaceId, cwd, runs, assignmentIds };
    }

    const job = server.localJobStore.create('group', {
      groupId: group.id,
      task: task.trim(),
      ...(runContext ? { roomId: runContext.roomId, workspaceId: runContext.workspaceId, cwd: runContext.cwd } : {}),
    });
    const execution = executeGroup(server, group, task.trim(), job.id, runContext, localExecutionModel);
    activeExecutions.set(job.id, execution);
    void execution.then(
      () => { activeExecutions.delete(job.id); },
      (error: unknown) => {
        activeExecutions.delete(job.id);
        server.log.error({ err: error, jobId: job.id }, 'Agent group execution failed');
      },
    );

    return reply.code(202).send({
      jobId: job.id,
      groupId: group.id,
      groupName: group.name,
      strategy: group.strategy,
      memberCount: group.members.length,
      task: task.trim(),
      status: job.status,
      ...(runContext ? {
        roomId: runContext.roomId,
        workspaceId: runContext.workspaceId,
        runIds: [...runContext.runs.values()].map((run) => run.id),
      } : {}),
    });
  });
};

async function executeGroup(
  server: FastifyInstance,
  group: AgentGroup,
  task: string,
  jobId: string,
  runContext?: GroupRunContext,
  localExecutionModel?: string,
): Promise<void> {
  const signal = server.localJobStore.signal(jobId);
  if (!signal) return;
  server.localJobStore.update(jobId, { status: 'running', startedAt: new Date().toISOString() });
  const unregisterControls: Array<() => void> = [];
  let settleExecution!: () => void;
  const executionSettled = new Promise<void>((resolve) => { settleExecution = resolve; });
  let acquired = false;

  try {
    if (runContext) {
      unregisterControls.push(server.agentRunRegistry.registerControls(runContext.roomId, {
        cancel: async () => {
          server.localJobStore.cancel(jobId);
          await executionSettled;
        },
      }));
      signal.addEventListener('abort', () => {
        const room = server.agentRunRegistry.get(runContext.roomId);
        if (room && !['completed', 'failed', 'cancelled', 'interrupted'].includes(room.status)) {
          server.agentRunRegistry.update(runContext.roomId, { status: 'cancelling' });
        }
        for (const run of runContext.runs.values()) {
          const current = server.agentRunRegistry.get(run.id);
          if (current && !['completed', 'failed', 'cancelled', 'interrupted'].includes(current.status)) {
            server.agentRunRegistry.update(run.id, { status: 'cancelling', result: { summary: 'Group run cancelled' } });
          }
        }
      }, { once: true });
    }

    const baseRunLoop = guardAgentRunner(server.agentRunner ?? runAgentLoop);
    let availableTools = server.agentState.allTools;
    let sessionOrchestrator: ReturnType<FastifyInstance['agentState']['createSessionOrchestrator']> | undefined;
    let workspaceMind: Parameters<FastifyInstance['agentState']['createSessionOrchestrator']>[0] | undefined;
    if (runContext) {
      workspaceMind = server.mindCache.acquire(runContext.workspaceId);
      acquired = true;
      sessionOrchestrator = server.agentState.createSessionOrchestrator(workspaceMind);
      availableTools = server.agentState.buildToolsForSession(
        sessionOrchestrator,
        runContext.cwd,
        runContext.workspaceId,
      );
    }
    const members = group.members.map((member) => {
      const persona = resolvePersona(member.agentId)!;
      return {
        ...member,
        name: persona.name,
        role: member.roleInGroup,
        systemPrompt: persona.systemPrompt,
        model: localExecutionModel ?? persona.modelPreference,
        tools: applyPersonaToolFilter(availableTools, persona)
          .map((tool) => tool.name),
      };
    });
    const workspaceTurnCoordinator = runContext
      ? server.agentState.workspaceTurnCoordinator
      : undefined;
    const updateJobWorkerSnapshot = (activeOrchestrator: SubagentOrchestrator) => {
      let workers = snapshotWorkers(activeOrchestrator);
      if (workspaceTurnCoordinator && runContext) {
        workers = workers.map((worker) => {
          const workerName = typeof worker.name === 'string' ? worker.name : undefined;
          const run = workerName ? runContext.runs.get(workerName) : undefined;
          const status = run ? server.agentRunRegistry.get(run.id)?.status : undefined;
          if (status === 'queued') return { ...worker, status: 'pending' };
          if (status === 'running') return { ...worker, status: 'running' };
          return worker;
        });
      }
      server.localJobStore.update(jobId, { output: { workers } });
    };
    const runLoop = workspaceTurnCoordinator && runContext
      ? async (config: Parameters<AgentRunner>[0]) => {
          const workerName = /^# Sub-Agent: ([^\r\n]+)$/m.exec(config.systemPrompt)?.[1]?.trim();
          const run = workerName ? runContext.runs.get(workerName) : undefined;
          const markWaiting = () => {
            if (!run) return;
            const current = server.agentRunRegistry.get(run.id);
            if (!current || ['completed', 'failed', 'cancelled', 'interrupted'].includes(current.status)) return;
            server.agentRunRegistry.update(run.id, {
              status: 'queued',
              executor: { model: config.model },
              progress: { message: 'Waiting for workspace', phase: 'workspace_queue' },
            });
            updateJobWorkerSnapshot(orchestrator);
          };
          const markRunning = () => {
            if (!run) return;
            const current = server.agentRunRegistry.get(run.id);
            if (!current || ['completed', 'failed', 'cancelled', 'interrupted'].includes(current.status)) return;
            server.agentRunRegistry.update(run.id, {
              status: 'running',
              executor: { model: config.model },
              progress: { message: 'Working', phase: 'running' },
            });
            publishGroupDance(
              server,
              run,
              'response',
              'task_claim',
              { phase: 'running', result: null, error: null },
              runContext.assignmentIds.get(workerName!),
            );
            updateJobWorkerSnapshot(orchestrator);
          };
          const workerScope = workspaceTurnCoordinator.createScope(runContext.cwd, signal);
          let tools = workerScope.wrapTools(config.tools);
          const workspaceAccess = workerScope.classify(tools);
          try {
            if (workspaceAccess !== 'none') await workerScope.acquire(workspaceAccess, markWaiting);
            markRunning();
            tools = server.agentState.bindWorkspaceCollaborationTools({
              visibleTools: tools,
              workerTools: tools,
              runLoop: baseRunLoop,
              signal,
              runChildTransaction: (childTools, operation) => (
                workerScope.runChildTransaction(childTools, operation)
              ),
              defaultModel: config.model,
            });
            return await baseRunLoop({ ...config, tools });
          } finally {
            await workerScope.release();
          }
        }
      : baseRunLoop;
    const workflow: WorkflowTemplate = buildWorkflowFromGroup({ ...group, members }, task);
    const orchestrator = new SubagentOrchestrator({
      availableTools,
      runLoop,
      litellmUrl: server.localConfig.litellmUrl,
      litellmApiKey: server.agentState.litellmApiKey,
      defaultModel: server.agentState.currentModel,
      hooks: server.agentState.hookRegistry,
      signal,
    });
    orchestrator.on('worker:status', (event: { workerState: import('@waggle/agent').WorkerState }) => {
      updateJobWorkerSnapshot(orchestrator);
      if (!runContext) return;
      const run = runContext.runs.get(event.workerState.name);
      if (!run) return;
      const current = server.agentRunRegistry.get(run.id);
      if (!current || ['completed', 'failed', 'cancelled', 'interrupted'].includes(current.status)) return;
      if (signal.aborted) return;
      if (workspaceTurnCoordinator && event.workerState.status === 'running') return;
      const status = event.workerState.status === 'done'
        ? 'completed'
        : event.workerState.status === 'failed'
          ? 'failed'
          : event.workerState.status === 'running'
            ? 'running'
            : 'queued';
      server.agentRunRegistry.update(run.id, {
        status,
        executor: { model: event.workerState.model },
        ...(event.workerState.result ? { result: { summary: event.workerState.result } } : {}),
        ...(event.workerState.error ? { result: { error: event.workerState.error } } : {}),
        metrics: { toolsUsed: event.workerState.toolsUsed },
        progress: status === 'running' ? { message: 'Working', phase: 'running' } : null,
      });
      updateJobWorkerSnapshot(orchestrator);
      const messageType: WaggleMessage['type'] = status === 'running' ? 'response' : 'broadcast';
      const subtype: WaggleMessage['subtype'] = status === 'running' ? 'task_claim' : status === 'queued' ? 'discovery' : 'routed_share';
      publishGroupDance(
        server,
        run,
        messageType,
        subtype,
        { phase: status, result: event.workerState.result ?? null, error: event.workerState.error ?? null },
        runContext.assignmentIds.get(event.workerState.name),
      );
    });

    const { results, aggregated: rawAggregated } = await orchestrator.runWorkflow(workflow);
    const aggregated = guardAgentOutput(rawAggregated, 'result');
    const workers = snapshotWorkers(orchestrator);
    const failed = Array.from(results.values()).some((worker) => worker.status === 'failed');
    if (runContext && workspaceMind) {
      for (const run of runContext.runs.values()) {
        const current = server.agentRunRegistry.get(run.id);
        if (current?.kind !== 'worker' || !['completed', 'failed', 'cancelled', 'interrupted'].includes(current.status)) continue;
        const memoryRefs = recordGroupWorkerResult(server, workspaceMind, runContext, group, current);
        server.agentRunRegistry.update(current.id, { memoryRefs });
      }
      const roomMemoryRefs = recordGroupAggregate(server, workspaceMind, runContext, group, task, aggregated);
      server.agentRunRegistry.update(runContext.roomId, {
        result: { summary: aggregated },
        memoryRefs: roomMemoryRefs,
      });
      try { await sessionOrchestrator?.autoSaveFromExchange(task, aggregated); } catch { /* explicit frames above are authoritative */ }
    }
    if (server.localJobStore.get(jobId)?.status !== 'cancelled') {
      server.localJobStore.update(jobId, {
        status: failed ? 'failed' : 'completed',
        completedAt: new Date().toISOString(),
        output: { aggregated, workers, ...(runContext ? { roomId: runContext.roomId } : {}) },
      });
    }
  } catch (error) {
    const durableError = guardAgentOutput(error instanceof Error ? error.message : String(error), 'error');
    if (runContext) {
      for (const run of runContext.runs.values()) {
        const current = server.agentRunRegistry.get(run.id);
        if (current && !['completed', 'failed', 'cancelled', 'interrupted'].includes(current.status)) {
          server.agentRunRegistry.update(run.id, {
            status: signal.aborted ? 'cancelling' : 'failed',
            result: { error: durableError },
          });
        }
      }
    }
    if (server.localJobStore.get(jobId)?.status !== 'cancelled') {
      server.localJobStore.update(jobId, {
        status: 'failed',
        completedAt: new Date().toISOString(),
        output: { error: durableError },
      });
    }
  } finally {
    for (const unregister of unregisterControls) unregister();
    try {
      if (acquired && runContext) server.mindCache.release(runContext.workspaceId);
    } finally {
      try {
        if (runContext && signal.aborted) {
          const room = server.agentRunRegistry.get(runContext.roomId);
          if (room?.status === 'cancelling') {
            server.agentRunRegistry.finalizeRoomCancellation(runContext.roomId);
          }
        }
      } finally {
        settleExecution();
      }
    }
  }
}

function recordGroupWorkerResult(
  server: FastifyInstance,
  workspaceMind: Parameters<FastifyInstance['agentState']['createSessionOrchestrator']>[0],
  context: GroupRunContext,
  group: AgentGroup,
  run: CollaborationWorkerRun,
): CollaborationRunMemoryRefs {
  const output = run.result?.summary ?? run.result?.error ?? `Worker finished with status ${run.status}.`;
  return persistGroupMemory(
    server,
    workspaceMind,
    context,
    {
      kind: 'worker', roomId: context.roomId, runId: run.id,
      groupId: group.id, workspaceId: context.workspaceId,
      personaId: run.executor.personaId ?? null, status: run.status,
    },
    `[Agent group worker]\nRoom: ${context.roomId}\nRun: ${run.id}\nGroup: ${group.name}\nWorker: ${run.title}\nWorkspace: ${context.workspaceId}\nStatus: ${run.status}\nSummary: ${output.slice(0, 1_000)}`,
    `[Agent group worker result]\nRoom: ${context.roomId}\nRun: ${run.id}\nGroup: ${group.name}\nWorker: ${run.title}\nStatus: ${run.status}\nTask:\n${run.task}\n\nResult:\n${output.slice(0, 100_000)}`,
  );
}

function recordGroupAggregate(
  server: FastifyInstance,
  workspaceMind: Parameters<FastifyInstance['agentState']['createSessionOrchestrator']>[0],
  context: GroupRunContext,
  group: AgentGroup,
  task: string,
  aggregated: string,
): CollaborationRunMemoryRefs {
  return persistGroupMemory(
    server,
    workspaceMind,
    context,
    { kind: 'aggregate', roomId: context.roomId, groupId: group.id, workspaceId: context.workspaceId },
    `[Agent group]\nRoom: ${context.roomId}\nGroup: ${group.name}\nWorkspace: ${context.workspaceId}\nSummary: ${aggregated.slice(0, 1_000)}`,
    `[Agent group result]\nRoom: ${context.roomId}\nGroup: ${group.name}\nTask:\n${task}\n\nResult:\n${aggregated.slice(0, 100_000)}`,
  );
}

function persistGroupMemory(
  server: FastifyInstance,
  workspaceMind: Parameters<FastifyInstance['agentState']['createSessionOrchestrator']>[0],
  context: GroupRunContext,
  metadata: Record<string, unknown>,
  personalContent: string,
  workspaceContent: string,
): CollaborationRunMemoryRefs {
  const personalFrameIds: number[] = [];
  const workspaceFrameIds: Record<string, number[]> = {};
  const meta = JSON.stringify(metadata);
  try {
    const personal = server.multiMind.personal;
    new SessionStore(personal).ensure('agent-runs', 'agent-runs', 'Agent collaboration index');
    const store = new FrameStore(personal);
    const frame = store.createIFrame(
      'agent-runs',
      personalContent,
      'normal', 'agent_inferred',
    );
    store.setMetadata(frame.id, meta);
    personalFrameIds.push(frame.id);
  } catch { /* workspace result remains authoritative */ }
  try {
    new SessionStore(workspaceMind).ensure('agent-runs', 'agent-runs', 'Agent collaboration results');
    const store = new FrameStore(workspaceMind);
    const frame = store.createIFrame(
      'agent-runs',
      workspaceContent,
      'normal', 'agent_inferred',
    );
    store.setMetadata(frame.id, meta);
    workspaceFrameIds[context.workspaceId] = [frame.id];
  } catch { /* reflected below */ }
  const personalOk = personalFrameIds.length > 0;
  const workspaceOk = (workspaceFrameIds[context.workspaceId]?.length ?? 0) > 0;
  return {
    status: personalOk && workspaceOk ? 'complete' : (personalOk || workspaceOk ? 'partial' : 'failed'),
    personalFrameIds,
    workspaceFrameIds,
  };
}

function publishGroupDance(
  server: FastifyInstance,
  run: CollaborationWorkerRun,
  type: WaggleMessage['type'],
  subtype: WaggleMessage['subtype'],
  content: Record<string, unknown>,
  referenceId?: string,
): WaggleMessage | undefined {
  if (!server.signalBus) return undefined;
  return server.signalBus.record({
    id: crypto.randomUUID(),
    teamId: `room::${run.roomId}`,
    senderId: type === 'request' ? 'user' : `run::${run.id}`,
    type,
    subtype,
    content: {
      kind: 'agent_group_run', roomId: run.roomId, runId: run.id,
      workspaceId: run.workspaceId, persona: run.executor.personaId, ...content,
    },
    referenceId: referenceId ?? null,
    routing: null,
    createdAt: new Date(),
  });
}
