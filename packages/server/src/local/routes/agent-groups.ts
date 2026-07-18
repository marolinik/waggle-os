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
import { FrameStore, SessionStore } from '@waggle/core';
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
import { resolveWorkspaceExecutionRoot } from '../workspace-execution-root.js';

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
    const groups = loadGroups(dataDir);
    const group = groups.find(g => g.id === request.params.id);
    if (!group) return reply.code(404).send({ error: 'Group not found' });

    const { task } = request.body;
    if (!task || typeof task !== 'string' || !task.trim()) return reply.code(400).send({ error: 'task is required' });
    if (group.members.length < 2) return reply.code(400).send({ error: 'Group must have at least two members' });

    const missingPersona = group.members.find((member) => !resolvePersona(member.agentId));
    if (missingPersona) return reply.code(409).send({ error: `Persona no longer exists: ${missingPersona.agentId}` });

    let runContext: GroupRunContext | undefined;
    if (server.agentRunRegistry && server.workspaceManager) {
      const workspaceId = request.body.workspaceId
        || server.workspaceManager.getDefault()
        || server.workspaceManager.list()[0]?.id;
      if (!workspaceId) return reply.code(404).send({ error: 'workspace_not_found' });
      const workspace = server.workspaceManager.get(workspaceId);
      if (!workspace) return reply.code(404).send({ error: 'workspace_not_found' });
      let cwd: string;
      try { cwd = resolveWorkspaceExecutionRoot(dataDir, workspace); }
      catch (err) {
        return reply.code(409).send({ error: 'workspace_root_invalid', message: err instanceof Error ? err.message : String(err) });
      }
      const room = server.agentRunRegistry.createRoom({
        workspaceIds: [workspaceId],
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
          workspaceId,
          source: 'agent_group',
          executor: {
            kind: 'waggle_agent', agentId: member.agentId,
            personaId: persona.id, model: persona.modelPreference,
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
      runContext = { roomId: room.id, workspaceId, cwd, runs, assignmentIds };
    }

    const job = server.localJobStore.create('group', {
      groupId: group.id,
      task: task.trim(),
      ...(runContext ? { roomId: runContext.roomId, workspaceId: runContext.workspaceId, cwd: runContext.cwd } : {}),
    });
    void executeGroup(server, group, task.trim(), job.id, runContext);

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
): Promise<void> {
  const signal = server.localJobStore.signal(jobId);
  if (!signal) return;
  server.localJobStore.update(jobId, { status: 'running', startedAt: new Date().toISOString() });
  const unregisterControls: Array<() => void> = [];
  let acquired = false;

  try {
    if (runContext) {
      unregisterControls.push(server.agentRunRegistry.registerControls(runContext.roomId, {
        cancel: () => { server.localJobStore.cancel(jobId); },
      }));
      signal.addEventListener('abort', () => {
        for (const run of runContext.runs.values()) {
          const current = server.agentRunRegistry.get(run.id);
          if (current && !['completed', 'failed', 'cancelled', 'interrupted'].includes(current.status)) {
            server.agentRunRegistry.update(run.id, { status: 'cancelled', result: { summary: 'Group run cancelled' } });
          }
        }
      }, { once: true });
    }

    const runLoop: AgentRunner = server.agentRunner ?? runAgentLoop;
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
        model: persona.modelPreference,
        tools: applyPersonaToolFilter(availableTools, persona)
          .map((tool) => tool.name),
      };
    });
    const workflow: WorkflowTemplate = buildWorkflowFromGroup({ ...group, members }, task);
    const orchestrator = new SubagentOrchestrator({
      availableTools,
      runLoop,
      litellmUrl: server.localConfig.litellmUrl,
      litellmApiKey: server.agentState.litellmApiKey,
      defaultModel: server.agentState.currentModel,
      hooks: server.agentState.hookRegistry,
      signal,
      getSpawnSecurityContext: () => server.agentState.spawnSecurityContext ?? undefined,
    });
    orchestrator.on('worker:status', (event: { workerState: import('@waggle/agent').WorkerState }) => {
      server.localJobStore.update(jobId, { output: { workers: snapshotWorkers(orchestrator) } });
      if (!runContext) return;
      const run = runContext.runs.get(event.workerState.name);
      if (!run) return;
      const current = server.agentRunRegistry.get(run.id);
      if (!current || ['completed', 'failed', 'cancelled', 'interrupted'].includes(current.status)) return;
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

    const { results, aggregated } = await orchestrator.runWorkflow(workflow);
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
    if (runContext) {
      for (const run of runContext.runs.values()) {
        const current = server.agentRunRegistry.get(run.id);
        if (current && !['completed', 'failed', 'cancelled', 'interrupted'].includes(current.status)) {
          server.agentRunRegistry.update(run.id, {
            status: signal.aborted ? 'cancelled' : 'failed',
            result: { error: error instanceof Error ? error.message : String(error) },
          });
        }
      }
    }
    if (server.localJobStore.get(jobId)?.status !== 'cancelled') {
      server.localJobStore.update(jobId, {
        status: 'failed',
        completedAt: new Date().toISOString(),
        output: { error: error instanceof Error ? error.message : String(error) },
      });
    }
  } finally {
    for (const unregister of unregisterControls) unregister();
    if (acquired && runContext) server.mindCache.release(runContext.workspaceId);
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
