import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { FrameStore, SessionStore, WaggleConfig } from '@waggle/core';
import {
  TraceRecorder,
  detectTaskShape,
  filterAvailableTools,
  isEnabled,
  listPersonas,
  runAgentLoop,
  selectAgentRunBudget,
  type AgentResponse,
} from '@waggle/agent';
import type {
  CollaborationRunMemoryRefs,
  CollaborationWorkerRun,
  GoalAncestry,
  WaggleMessage,
} from '@waggle/shared';
import { applyPersonaToolFilter, selectToolsForTurn } from './persona-tool-filter.js';
import { resolveWorkspaceExecutionRoot } from './workspace-execution-root.js';
import { persistMessage } from './routes/chat-persistence.js';
import { emitWaggleSignal } from './routes/waggle-signals.js';
import type { AgentRunner } from './routes/chat.js';
import {
  isExactConfiguredKeylessCompatibleModel,
  listOllamaChatModelIds,
  OllamaModelNotLocalError,
  resolveUsableModel,
} from './model-availability.js';
import type { WorkspaceTurnScope } from './workspace-turn-coordinator.js';
import { isOfflineOllamaModelReference } from './routes/chat-helpers.js';
import {
  bindModelSpendBudget,
  createModelSpendMeter,
  type ModelSpendMeter,
} from './model-spend-meter.js';

const ACTIVE = new Set(['queued', 'starting', 'running', 'waiting_for_approval', 'paused', 'cancelling']);

async function resolveExplicitFleetModel(
  server: FastifyInstance,
  selectedModel: string,
): Promise<string | null> {
  const model = selectedModel.trim();
  const separator = model.indexOf('/');
  if (separator <= 0) return null;
  const provider = model.slice(0, separator).toLowerCase();
  if (provider === 'ollama') {
    return (await listOllamaChatModelIds()).includes(model) ? model : null;
  }
  if (provider === 'openai-compatible') {
    const configured = new WaggleConfig(server.localConfig.dataDir).getProviders()[provider];
    if (!configured?.baseUrl) return null;
    return configured.models?.some((candidate) => (
      (candidate.startsWith(`${provider}/`) ? candidate : `${provider}/${candidate}`) === model
    )) ? model : null;
  }
  if (!server.vault?.get(provider)) return null;

  const baseUrl = server.localConfig.litellmUrl.replace(/\/+$/, '');
  if (!baseUrl) return null;
  const response = await fetch(`${baseUrl}/models`, {
    headers: { Authorization: `Bearer ${server.agentState.litellmApiKey}` },
  });
  if (!response.ok) return null;
  const payload = await response.json() as { data?: Array<{ id?: string }> };
  return payload.data?.some((entry) => entry.id === model) ? model : null;
}

export interface FleetSpawnInput {
  task: string;
  persona?: string;
  model?: string;
  parentWorkspaceId?: string;
  goal?: string;
  agentId?: string;
}

export interface FleetSpawnResult {
  statusCode: number;
  body: Record<string, unknown>;
}

type FleetResultRecorder = (input: {
  run: CollaborationWorkerRun;
  prompt: string;
  result: AgentResponse;
  workspaceMind: Parameters<FastifyInstance['agentState']['createSessionOrchestrator']>[0];
}) => Promise<CollaborationRunMemoryRefs>;

declare module 'fastify' {
  interface FastifyInstance {
    fleetResultRecorder?: FleetResultRecorder;
  }
}

export function buildFleetAncestry(
  workspaceName: string | undefined,
  goal: string | undefined,
): GoalAncestry {
  return {
    ...(workspaceName ? { project: workspaceName } : {}),
    ...(goal ? { goal } : {}),
  };
}

/** Queue one genuinely isolated internal run and return immediately. */
export async function spawnIsolatedFleetRun(
  server: FastifyInstance,
  input: FleetSpawnInput,
): Promise<FleetSpawnResult> {
  const task = input.task?.trim();
  if (!task) return { statusCode: 400, body: { error: 'task is required' } };
  const workspaceId = input.parentWorkspaceId
    || server.workspaceManager.getDefault()
    || server.workspaceManager.list()[0]?.id;
  if (!workspaceId) return { statusCode: 404, body: { error: 'workspace_not_found' } };
  const workspace = server.workspaceManager.get(workspaceId);
  if (!workspace) return { statusCode: 404, body: { error: 'workspace_not_found', message: `Workspace ${workspaceId} does not exist` } };

  let cwd: string;
  try { cwd = resolveWorkspaceExecutionRoot(server.localConfig.dataDir, workspace); }
  catch (err) {
    return { statusCode: 409, body: { error: 'workspace_root_invalid', message: err instanceof Error ? err.message : String(err) } };
  }

  const activeRuns = server.agentRunRegistry.list({ source: 'fleet', limit: 1_000 })
    .filter((run) => run.kind === 'worker' && ACTIVE.has(run.status)).length;
  const maxRuns = server.sessionManager?.getMaxSessions?.() ?? 10;
  const liveWorkspaceSessions = server.sessionManager?.size ?? 0;
  if (activeRuns + liveWorkspaceSessions >= maxRuns) {
    return { statusCode: 409, body: { error: 'fleet_capacity_reached', message: `Max concurrent sessions reached (${maxRuns})` } };
  }

  const sentinel = (model?: string | null) => !model || model.trim() === 'auto' || model.trim() === 'default';
  const explicitModel = !sentinel(input.model) ? input.model!.trim() : undefined;
  const workspaceModel = workspace.model;
  const implicitWorkspaceModel = !sentinel(workspaceModel) ? workspaceModel : undefined;
  const selectedModel = explicitModel
    ?? implicitWorkspaceModel
    ?? server.agentState.currentModel;
  if (!selectedModel || sentinel(selectedModel)) {
    return { statusCode: 503, body: { error: 'model_unavailable', message: 'No executable model is configured' } };
  }
  let model: string;
  if (explicitModel) {
    try {
      const routable = await resolveExplicitFleetModel(server, explicitModel);
      if (!routable) {
        return {
          statusCode: 409,
          body: {
            error: 'model_unavailable',
            message: `Selected model "${explicitModel}" is not currently routable. Configure its provider or choose an available model.`,
          },
        };
      }
      model = routable;
    } catch (err) {
      return {
        statusCode: 503,
        body: {
          error: 'model_validation_failed',
          message: `Could not validate selected model "${explicitModel}": ${err instanceof Error ? err.message : String(err)}`,
        },
      };
    }
  } else {
    try {
      model = await resolveUsableModel(server, selectedModel);
    } catch (err) {
      const currentModel = server.agentState.currentModel?.trim();
      const canRetryCurrentLocal = err instanceof OllamaModelNotLocalError
        && selectedModel === implicitWorkspaceModel
        && currentModel
        && currentModel !== selectedModel
        && isOfflineOllamaModelReference(currentModel);
      if (!canRetryCurrentLocal) throw err;
      model = await resolveUsableModel(server, currentModel);
    }
  }
  const persona = input.persona ?? workspace.personaId ?? 'general-purpose';
  const room = server.agentRunRegistry.createRoom({
    workspaceIds: [workspaceId],
    source: 'fleet',
    executor: { kind: 'coordinator', agentId: input.agentId },
    title: input.agentId ? `Agent ${input.agentId}` : 'Spawned agent',
    task,
    capabilities: { cancel: true },
  });
  const run = server.agentRunRegistry.createWorker({
    parentRunId: room.id,
    workspaceId,
    source: 'fleet',
    executor: { kind: 'waggle_agent', agentId: input.agentId, personaId: persona, model },
    title: `${listPersonas().find((item) => item.id === persona)?.name ?? persona} · ${workspace.name}`,
    task,
    capabilities: { cancel: true },
  });
  const sessionId = `spawn-${run.id}`;
  const assignmentId = publishFleetDance(server, run, 'request', 'task_delegation', {
    task, phase: 'queued', model, persona,
  })?.id;
  void executeFleetRun(server, run, sessionId, cwd, model, persona, task, input.goal, assignmentId);

  return {
    statusCode: 202,
    body: {
      id: run.id,
      runId: run.id,
      roomId: room.id,
      workspaceId,
      sessionId,
      status: run.status,
      statusUrl: `/api/agent-runs/${run.id}`,
      resumable: false,
      task,
      persona,
      model,
    },
  };
}

async function executeFleetRun(
  server: FastifyInstance,
  run: CollaborationWorkerRun,
  sessionId: string,
  cwd: string,
  model: string,
  personaId: string,
  task: string,
  goal: string | undefined,
  assignmentId: string | undefined,
): Promise<void> {
  const controller = new AbortController();
  let settleExecution!: () => void;
  const executionSettled = new Promise<void>((resolve) => { settleExecution = resolve; });
  let completionCommitted = false;
  const unregister = server.agentRunRegistry.registerControls(run.id, {
    cancel: async () => {
      if (completionCommitted) {
        const current = server.agentRunRegistry.get(run.id);
        if (current?.status === 'cancelling') {
          server.agentRunRegistry.update(run.id, { status: 'running' });
        }
        await executionSettled;
        return;
      }
      controller.abort();
      await executionSettled;
    },
  });
  let acquired = false;
  let workspaceTurnScope: WorkspaceTurnScope | undefined;
  let traceId: number | undefined;
  let fleetSpendMeter: ModelSpendMeter | undefined;
  try {
    const mind = server.mindCache.acquire(run.workspaceId);
    acquired = true;
    const orchestrator = server.agentState.createSessionOrchestrator(mind);
    const persona = listPersonas().find((item) => item.id === personaId) ?? null;
    fleetSpendMeter = server.agentState.costTracker
      ? createModelSpendMeter(server.agentState.costTracker, (costUsd) => {
          if (traceId === undefined) return;
          server.traceStore?.recordCost(traceId, costUsd);
        })
      : undefined;
    const underlyingRunner: AgentRunner = server.agentRunner ?? runAgentLoop;
    const runner = fleetSpendMeter
      ? bindModelSpendBudget(
          underlyingRunner,
          fleetSpendMeter,
          run.workspaceId,
          listOllamaChatModelIds,
          () => traceId,
          (model) => isExactConfiguredKeylessCompatibleModel(server, model),
        )
      : underlyingRunner;
    let workerTools = server.agentState.buildToolsForSession(orchestrator, cwd, run.workspaceId);
    if (persona) workerTools = applyPersonaToolFilter(workerTools, persona);
    workerTools = filterAvailableTools(workerTools);
    const workspaceTurnCoordinator = server.agentState.workspaceTurnCoordinator;
    if (workspaceTurnCoordinator) {
      workspaceTurnScope = workspaceTurnCoordinator.createScope(cwd, controller.signal);
      workerTools = workspaceTurnScope.wrapTools(workerTools);
    }
    let tools = selectToolsForTurn(workerTools, {
      message: task,
      preferredToolNames: persona?.tools ?? [],
    }).tools;
    if (workspaceTurnScope) {
      const workspaceAccess = workspaceTurnScope.classify(tools);
      if (workspaceAccess !== 'none') await workspaceTurnScope.acquire(workspaceAccess);
      const activeScope = workspaceTurnScope;
      tools = server.agentState.bindWorkspaceCollaborationTools({
        visibleTools: tools,
        workerTools,
        runLoop: runner,
        signal: controller.signal,
        runChildTransaction: (childTools, operation) => (
          activeScope.runChildTransaction(childTools, operation)
        ),
        defaultModel: model,
      });
    }
    const taskShape = detectTaskShape(task);
    const runBudget = selectAgentRunBudget({
      taskShape: taskShape.type,
      complexity: taskShape.complexity,
      selectedToolNames: tools.map(tool => tool.name),
    });
    orchestrator.setGoalAncestry(buildFleetAncestry(server.workspaceManager.get(run.workspaceId)?.name, goal));
    let systemPrompt: string;
    if (isEnabled('PROMPT_ASSEMBLER')) {
      const assembled = await orchestrator.buildAssembledPrompt(task, persona, { taskShape });
      systemPrompt = assembled.system + (assembled.responseScaffold ? `\n\n## Response shape\n${assembled.responseScaffold}` : '');
    } else {
      systemPrompt = orchestrator.buildSystemPrompt();
      if (persona?.systemPrompt) systemPrompt += `\n\n## Active persona\n${persona.systemPrompt}`;
    }

    persistMessage(server.localConfig.dataDir, run.workspaceId, sessionId, { role: 'user', content: task });
    traceId = server.traceStore?.start({
      sessionId,
      personaId,
      workspaceId: run.workspaceId,
      model,
      input: task,
      tags: [`room:${run.roomId}`, `run:${run.id}`, ...(run.executor.agentId ? [`agent:${run.executor.agentId}`] : [])],
    });
    const traceRecorder = traceId !== undefined && server.traceStore ? new TraceRecorder(server.traceStore) : undefined;
    server.agentRunRegistry.update(run.id, {
      status: 'running',
      result: { sessionId, ...(traceId !== undefined ? { traceId: String(traceId) } : {}) },
      progress: { message: 'Agent started', phase: 'running' },
    });
    emitWaggleSignal({
      type: 'agent:started', workspaceId: run.workspaceId, content: task.slice(0, 200),
      metadata: { runId: run.id, roomId: run.roomId, sessionId, model, persona: personaId },
    });
    publishFleetDance(server, run, 'response', 'task_claim', { phase: 'running', task: 'claimed' }, assignmentId);

    const result = await runner({
      litellmUrl: server.localConfig.litellmUrl,
      litellmApiKey: server.agentState.litellmApiKey,
      model,
      systemPrompt,
      tools,
      messages: [{ role: 'user', content: task }],
      ...runBudget,
      signal: controller.signal,
      ...(traceRecorder && traceId !== undefined ? {
        traceRecording: { recorder: traceRecorder, handle: { id: traceId, startedAt: Date.now() } },
      } : {}),
      onToolUse: (name, input) => {
        const current = server.agentRunRegistry.get(run.id);
        const toolsUsed = [...new Set([...(current?.metrics?.toolsUsed ?? []), name])];
        server.agentRunRegistry.update(run.id, {
          progress: { message: name, phase: 'tool' }, metrics: { toolsUsed },
        });
        emitWaggleSignal({
          type: 'tool:called', workspaceId: run.workspaceId,
          content: `${name}(${JSON.stringify(input).slice(0, 100)})`,
          metadata: { runId: run.id, roomId: run.roomId, sessionId },
        });
        publishFleetDance(server, run, 'broadcast', 'discovery', { phase: 'tool', tool: name }, assignmentId);
      },
    });
    if (controller.signal.aborted) {
      throw Object.assign(new Error('Agent loop aborted (client disconnected).'), {
        name: 'AgentLoopAbortError',
        code: 'AGENT_LOOP_ABORTED',
        toolsUsed: result.toolsUsed,
        usage: result.usage,
      });
    }
    // Runner completion is the atomic Fleet commit boundary. A later Stop may
    // arrive while durable result recording drains, but it must not relabel a
    // successfully persisted response and memory as cancelled/abandoned.
    completionCommitted = true;
    const postCommitWarnings: string[] = [];
    try {
      persistMessage(server.localConfig.dataDir, run.workspaceId, sessionId, {
        role: 'assistant', content: result.content,
      });
    } catch (error) {
      postCommitWarnings.push(`Assistant history could not be persisted: ${error instanceof Error ? error.message : String(error)}`);
    }
    let memoryRefs: CollaborationRunMemoryRefs;
    try {
      memoryRefs = server.fleetResultRecorder
        ? await server.fleetResultRecorder({ run, prompt: task, result, workspaceMind: mind })
        : await recordFleetResult(server, run, task, result, mind);
    } catch (error) {
      postCommitWarnings.push(`Result memory could not be recorded: ${error instanceof Error ? error.message : String(error)}`);
      memoryRefs = { status: 'failed', personalFrameIds: [], workspaceFrameIds: {} };
    }
    const totalTokens = result.usage.inputTokens + result.usage.outputTokens;
    server.agentRunRegistry.update(run.id, {
      status: 'completed',
      result: {
        summary: result.content,
        sessionId,
        ...(postCommitWarnings.length > 0 ? { error: postCommitWarnings.join(' ') } : {}),
      },
      metrics: {
        toolsUsed: result.toolsUsed,
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
      },
      memoryRefs,
      progress: null,
    });
    try {
      server.agentRunRegistry.update(run.roomId, {
        result: { summary: result.content, sessionId },
        memoryRefs,
      });
    } catch { /* best-effort room projection */ }
    if (traceId !== undefined) {
      try {
        server.traceStore?.finalize(traceId, {
          outcome: 'success',
          output: result.content,
          tokens: { input: result.usage.inputTokens, output: result.usage.outputTokens },
          costUsd: fleetSpendMeter?.totalCostUsd(),
        });
      } catch { /* best-effort trace projection */ }
    }
    try {
      emitWaggleSignal({
        type: 'agent:completed',
        workspaceId: run.workspaceId,
        content: `Completed · ${totalTokens.toLocaleString()} tokens`,
        metadata: { runId: run.id, roomId: run.roomId, sessionId, toolsUsed: result.toolsUsed },
      });
    } catch { /* best-effort activity projection */ }
    try {
      publishFleetDance(server, run, 'broadcast', 'routed_share', {
        phase: 'completed', result: result.content,
      }, assignmentId);
    } catch { /* best-effort collaboration projection */ }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const current = server.agentRunRegistry.get(run.id);
    if (controller.signal.aborted && !completionCommitted) {
      const abortPayload = err && typeof err === 'object'
        && 'code' in err && err.code === 'AGENT_LOOP_ABORTED'
        ? err as {
            usage?: { inputTokens?: unknown; outputTokens?: unknown };
            toolsUsed?: unknown;
          }
        : undefined;
      const normalizeTokenCount = (...values: unknown[]): number => {
        const value = values.find(candidate => (
          typeof candidate === 'number' && Number.isFinite(candidate) && candidate >= 0
        ));
        return typeof value === 'number' ? Math.floor(value) : 0;
      };
      const abortTools = Array.isArray(abortPayload?.toolsUsed)
        ? abortPayload.toolsUsed
          .filter((name): name is string => typeof name === 'string' && name.trim().length > 0)
          .map(name => name.trim())
        : [];
      const toolsUsed = [...new Set([
        ...(current?.metrics?.toolsUsed ?? []),
        ...abortTools,
      ])];
      const inputTokens = normalizeTokenCount(
        abortPayload?.usage?.inputTokens,
        current?.metrics?.inputTokens,
      );
      const outputTokens = normalizeTokenCount(
        abortPayload?.usage?.outputTokens,
        current?.metrics?.outputTokens,
      );
      const summary = toolsUsed.length > 0
        ? `This run was stopped after Waggle recorded tool activity: ${toolsUsed.join(', ')}. Review completed or in-flight activity before retrying so actions are not duplicated.`
        : 'This run was stopped. An external action may have been in flight. Review activity before retrying so actions are not duplicated.';

      if (current && !['completed', 'failed', 'cancelled', 'interrupted'].includes(current.status)) {
        server.agentRunRegistry.update(run.id, {
          status: 'cancelling',
          result: { summary, sessionId },
          metrics: { toolsUsed, inputTokens, outputTokens },
          progress: null,
        });
      }
      try {
        persistMessage(server.localConfig.dataDir, run.workspaceId, sessionId, {
          role: 'assistant', content: summary,
        });
      } catch { /* best effort */ }
      if (traceId !== undefined) {
        try {
          server.traceStore?.finalize(traceId, {
            outcome: 'abandoned',
            output: summary,
            tokens: { input: inputTokens, output: outputTokens },
            costUsd: fleetSpendMeter?.totalCostUsd(),
          });
        } catch { /* best-effort trace projection */ }
      }
      try {
        emitWaggleSignal({
          type: 'agent:cancelled',
          workspaceId: run.workspaceId,
          content: summary.slice(0, 200),
          metadata: {
            runId: run.id,
            roomId: run.roomId,
            sessionId,
            toolsUsed,
            inputTokens,
            outputTokens,
          },
        });
      } catch { /* best-effort activity projection */ }
      try {
        publishFleetDance(server, run, 'broadcast', 'routed_share', {
          phase: 'cancelled', result: summary,
        }, assignmentId);
      } catch { /* best-effort collaboration projection */ }
      return;
    }
    if (current && !['completed', 'failed', 'cancelled', 'interrupted'].includes(current.status)) {
      server.agentRunRegistry.update(run.id, {
        status: 'failed',
        result: { summary: message, error: message, sessionId },
        progress: null,
      });
    }
    try {
      persistMessage(server.localConfig.dataDir, run.workspaceId, sessionId, {
        role: 'assistant', content: `I couldn't finish this run. ${message}`,
      });
    } catch { /* best effort */ }
    if (traceId !== undefined) {
      try {
        server.traceStore?.finalize(traceId, {
          outcome: 'abandoned',
          output: message,
          costUsd: fleetSpendMeter?.totalCostUsd(),
        });
      } catch { /* best-effort trace projection */ }
    }
    try {
      emitWaggleSignal({
        type: 'agent:error',
        workspaceId: run.workspaceId, content: message.slice(0, 200),
        metadata: { runId: run.id, roomId: run.roomId, sessionId },
      });
    } catch { /* best-effort activity projection */ }
    try {
      publishFleetDance(server, run, 'broadcast', 'routed_share', {
        phase: 'failed', error: message,
      }, assignmentId);
    } catch { /* best-effort collaboration projection */ }
  } finally {
    try {
      if (workspaceTurnScope) await workspaceTurnScope.release();
    } finally {
      try {
        if (acquired) server.mindCache.release(run.workspaceId);
      } finally {
        settleExecution();
        unregister();
      }
    }
  }
}

async function recordFleetResult(
  server: FastifyInstance,
  run: CollaborationWorkerRun,
  prompt: string,
  result: AgentResponse,
  workspaceMind: Parameters<FastifyInstance['agentState']['createSessionOrchestrator']>[0],
): Promise<CollaborationRunMemoryRefs> {
  const personalFrameIds: number[] = [];
  const workspaceFrameIds: Record<string, number[]> = {};
  const meta = JSON.stringify({ runId: run.id, roomId: run.roomId, workspaceId: run.workspaceId, source: 'fleet' });
  try {
    const personal = server.multiMind.personal;
    new SessionStore(personal).ensure('agent-runs', 'agent-runs', 'Agent collaboration index');
    const frames = new FrameStore(personal);
    const frame = frames.createIFrame(
      'agent-runs',
      `[Agent run]\nRun: ${run.id}\nWorkspace: ${run.workspaceId}\nPersona: ${run.executor.personaId}\nSummary: ${result.content.slice(0, 1_000)}`,
      'normal', 'agent_inferred',
    );
    frames.setMetadata(frame.id, meta);
    personalFrameIds.push(frame.id);
  } catch { /* workspace result remains authoritative */ }
  try {
    new SessionStore(workspaceMind).ensure('agent-runs', 'agent-runs', 'Agent collaboration results');
    const frames = new FrameStore(workspaceMind);
    const frame = frames.createIFrame(
      'agent-runs',
      `[Agent run result]\nRun: ${run.id}\nTask:\n${prompt}\n\nResult:\n${result.content.slice(0, 100_000)}`,
      'normal', 'agent_inferred',
    );
    frames.setMetadata(frame.id, meta);
    workspaceFrameIds[run.workspaceId] = [frame.id];
  } catch { /* reflected in status below */ }
  const personalOk = personalFrameIds.length > 0;
  const workspaceOk = (workspaceFrameIds[run.workspaceId]?.length ?? 0) > 0;
  return {
    status: personalOk && workspaceOk ? 'complete' : (personalOk || workspaceOk ? 'partial' : 'failed'),
    personalFrameIds,
    workspaceFrameIds,
  };
}

function publishFleetDance(
  server: FastifyInstance,
  run: CollaborationWorkerRun,
  type: WaggleMessage['type'],
  subtype: WaggleMessage['subtype'],
  content: Record<string, unknown>,
  referenceId?: string,
): WaggleMessage | undefined {
  if (!server.signalBus) return undefined;
  return server.signalBus.record({
    id: randomUUID(),
    teamId: `room::${run.roomId}`,
    senderId: type === 'request' ? 'user' : `run::${run.id}`,
    type,
    subtype,
    content: {
      kind: 'waggle_agent_run', roomId: run.roomId, runId: run.id,
      workspaceId: run.workspaceId, persona: run.executor.personaId, ...content,
    },
    referenceId: referenceId ?? null,
    routing: null,
    createdAt: new Date(),
  });
}
