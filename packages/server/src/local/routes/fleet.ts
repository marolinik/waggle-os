/**
 * Fleet routes — agent fleet status and controls for Mission Control.
 * Exposes workspace session state, pause/resume/kill controls.
 */

import type { FastifyInstance } from 'fastify';
import { parseTier, type GoalAncestry } from '@waggle/shared';
import { requireTier } from '../../middleware/assert-tier.js';
import {
  TraceRecorder,
  runAgentLoop,
  isEnabled,
  detectTaskShape,
  listPersonas,
  type TraceHandle,
} from '@waggle/agent';
import { emitWaggleSignal } from './waggle-signals.js';
import { persistMessage } from './chat-persistence.js';
import { createLogger } from '../logger.js';
import { maxWorkspaceSessionsForTier } from '../tier-session-cap.js';
import {
  spawnIsolatedFleetRun,
  type FleetExecutionLifecycle,
} from '../fleet-run-executor.js';
import { resolveUsableModel } from '../model-availability.js';
import type { WorkspaceSessionActivityLease } from '../workspace-sessions.js';
import { getAgent } from '../agents-store.js';

/**
 * AI-OS #6 fast-follow — durable "why" for an agent spawn: project ← workspace
 * name, goal ← the agent's declared goal. Empty levels are omitted so the
 * prompt section self-suppresses when there is nothing to say.
 */
export function buildSpawnAncestry(
  workspaceName: string | undefined,
  goal: string | undefined,
): GoalAncestry {
  return {
    ...(workspaceName ? { project: workspaceName } : {}),
    ...(goal ? { goal } : {}),
  };
}

const log = createLogger('fleet');
const ACTIVE_FLEET_RUN_STATUSES = new Set([
  'queued',
  'starting',
  'running',
  'waiting_for_approval',
  'paused',
  'cancelling',
]);

interface TrackedFleetExecution {
  execution: Promise<void>;
  abort: () => void;
  cancel: () => Promise<void>;
}

export async function fleetRoutes(fastify: FastifyInstance) {
  let shuttingDown = false;
  let legacyExecutionSequence = 0;
  const shutdownController = new AbortController();
  const activeExecutions = new Map<string, TrackedFleetExecution>();

  const trackExecution = (
    executionId: string,
    execution: Promise<void>,
    abort: () => void,
    cancel: () => Promise<void>,
  ): void => {
    const tracked = { execution, abort, cancel };
    activeExecutions.set(executionId, tracked);
    void execution.then(
      () => {
        if (activeExecutions.get(executionId) === tracked) activeExecutions.delete(executionId);
      },
      (error: unknown) => {
        if (activeExecutions.get(executionId) === tracked) activeExecutions.delete(executionId);
        log.error(`[fleet/shutdown] execution ${executionId} failed: ${error instanceof Error ? error.message : String(error)}`);
      },
    );
  };

  const durableLifecycle: FleetExecutionLifecycle = {
    shutdownSignal: shutdownController.signal,
    isShuttingDown: () => shuttingDown,
    trackExecution: (runId, execution, abort) => {
      trackExecution(
        `durable:${runId}`,
        execution,
        abort,
        async () => {
          const current = fastify.agentRunRegistry?.get(runId);
          if (
            !current
            || current.kind !== 'worker'
            || current.source !== 'fleet'
            || !ACTIVE_FLEET_RUN_STATUSES.has(current.status)
          ) return;
          try {
            await fastify.agentRunRegistry.control(runId, 'cancel');
          } catch (error) {
            const after = fastify.agentRunRegistry.get(runId);
            if (!after || !ACTIVE_FLEET_RUN_STATUSES.has(after.status)) return;
            throw error;
          }
        },
      );
    },
  };

  fastify.addHook('preClose', async () => {
    shuttingDown = true;
    shutdownController.abort();
    const executions = [...activeExecutions.entries()];
    if (executions.length === 0) return;

    const diagnosticTimer = setTimeout(() => {
      log.warn(`[fleet/shutdown] still draining ${executions.length} Fleet execution(s)`);
    }, 10_000);
    diagnosticTimer.unref();
    // Never time out into onClose: closing a mind DB while its Fleet run is
    // still unwinding is unsafe. The desktop supervisor owns the hard-kill bound.
    const failures: unknown[] = [];
    try {
      for (const [, tracked] of executions) {
        try { tracked.abort(); } catch (error) { failures.push(error); }
      }
      const cancellationResults = await Promise.allSettled(
        executions.map(([, tracked]) => tracked.cancel()),
      );
      for (const result of cancellationResults) {
        if (result.status === 'rejected') failures.push(result.reason);
      }
      const executionResults = await Promise.allSettled(
        executions.map(([, tracked]) => tracked.execution),
      );
      for (const result of executionResults) {
        if (result.status === 'rejected') failures.push(result.reason);
      }
      if (failures.length > 0) {
        throw new AggregateError(failures, 'Fleet execution cleanup failed during shutdown');
      }
    } finally {
      clearTimeout(diagnosticTimer);
    }
  });

  // GET /api/fleet — list all active workspace sessions
  fastify.get('/api/fleet', async () => {
    const sessionManager = fastify.sessionManager;
    if (!sessionManager) {
      return { sessions: [], count: 0 };
    }

    const costTracker = fastify.agentState?.costTracker;
    const sessions = sessionManager.getActive().map((s) => {
      // Enrich with workspace config (model, budget)
      const wsConfig = fastify.workspaceManager?.get(s.workspaceId);
      const wsCost = costTracker?.getWorkspaceCost(s.workspaceId) ?? 0;
      return {
        workspaceId: s.workspaceId,
        workspaceName: wsConfig?.name ?? s.workspaceId,
        personaId: s.personaId ?? wsConfig?.personaId ?? null,
        model: wsConfig?.model ?? fastify.agentState?.currentModel ?? 'default',
        status: s.status,
        lastActivity: s.lastActivity,
        durationMs: Date.now() - s.lastActivity,
        toolCount: s.tools?.length ?? 0,
        tokensUsed: s.tokensUsed ?? 0,
        costEstimate: Math.round(wsCost * 10000) / 10000,
      };
    });

    // Tier-based maxSessions: FREE=10, TEAMS=25, ENTERPRISE/TRIAL=100
    const tierRaw = fastify.localConfig?.tier ?? '';
    const tier = parseTier(String(tierRaw)) ?? 'FREE';
    const maxSessions = maxWorkspaceSessionsForTier(tier);

    return { sessions, count: sessions.length, maxSessions };
  });

  // POST /api/fleet/spawn — spawn a new agent session (free for all tiers — agents generate memory)
  //
  // FR #15 Phase A: properly create the workspace session via getOrCreate so
  // Room/Mission Control register it as live, and emit an `agent:spawned`
  // Waggle Dance signal so the cross-workspace feed reflects the spawn.
  // The previous implementation called sessionManager.create() with a
  // (wsId, {persona, model}) signature that mismatched the real
  // (wsId, mind, orchestrator, tools, personaId) signature — every spawn
  // threw silently inside the route handler and returned a 500 that the
  // adapter parsed as a successful FleetSession-shaped response.
  //
  // Phase B (followup) wires runAgentLoop fire-and-forget so the agent
  // actually executes the task; this Phase A delivers the visible-state
  // halves of PM acceptance: live session count + Waggle Dance signal.
  fastify.post<{
    Body: { task: string; persona?: string; model?: string; parentWorkspaceId?: string; goal?: string; agentId?: string; savedAgentId?: string };
  }>('/api/fleet/spawn', async (request, reply) => {
    if (shuttingDown) return reply.code(503).send({ error: 'server_shutting_down' });
    const { task, persona, model, parentWorkspaceId, goal, agentId, savedAgentId } = request.body;
    if (!task) return reply.code(400).send({ error: 'task is required' });

    const persistedLegacyAgent = agentId
      ? getAgent(fastify.localConfig.dataDir, agentId)
      : undefined;
    if (!fastify.agentRunRegistry && (savedAgentId || persistedLegacyAgent)) {
      return reply.code(503).send({
        error: 'saved_agent_runtime_unavailable',
        message: 'Saved agents require the durable policy executor. Restart Waggle and try again.',
      });
    }

    // The durable registry is present in every production sidecar. Keep the
    // legacy workspace-session path below only for lightweight route tests and
    // old embedders that register fleetRoutes in isolation.
    if (fastify.agentRunRegistry) {
      const spawned = await spawnIsolatedFleetRun(fastify, {
        task, persona, model, parentWorkspaceId, goal, agentId, savedAgentId,
      }, durableLifecycle);
      return reply.code(spawned.statusCode).send(spawned.body);
    }

    const wsId = parentWorkspaceId || fastify.workspaceManager.getDefault() || fastify.workspaceManager.list()[0]?.id || 'default-workspace';
    const sessionManager = fastify.sessionManager;
    if (!sessionManager) return reply.code(503).send({ error: 'Session manager not available' });

    // Acquire the workspace mind. Without it we cannot construct a session
    // orchestrator, so the spawn would be a no-op against the runtime.
    const mind = fastify.agentState.getWorkspaceMindDb(wsId);
    if (!mind) {
      return reply.code(404).send({
        error: 'workspace_not_found',
        message: `Workspace ${wsId} has no mind on disk; cannot spawn`,
      });
    }

    // Resolve the model up front so the persisted session metadata + the
    // signal payload reflect the real model the agent will use. 'auto' /
    // 'default' are sentinels ("use the runtime model"), NOT model ids —
    // passing them through verbatim 404'd at the provider (agent records
    // default to model:'auto').
    const isSentinel = (m?: string | null): boolean => !m || m === 'auto' || m === 'default';
    const wsModel = fastify.workspaceManager?.get(wsId)?.model;
    const selectedModel = (!isSentinel(model) ? model : undefined)
      ?? (!isSentinel(wsModel) ? wsModel : undefined)
      ?? fastify.agentState?.currentModel
      ?? 'default';
    const resolvedModel = await resolveUsableModel(fastify, selectedModel);
    if (shuttingDown) return reply.code(503).send({ error: 'server_shutting_down' });

    let session;
    let sessionActivity: WorkspaceSessionActivityLease;
    try {
      const candidateSession = sessionManager.getOrCreate(
        wsId,
        // Pin the shared cache handle for this session's lifetime so an LRU
        // eviction elsewhere cannot close this spawn's mind out from under it.
        () => fastify.mindCache.acquire(wsId),
        (m) => fastify.agentState.createSessionOrchestrator(m),
        (m, o) => fastify.agentState.buildToolsForSession(o, wsId, wsId),
        persona ?? fastify.workspaceManager?.get(wsId)?.personaId ?? undefined,
        () => fastify.mindCache.release(wsId),
      );
      const acquiredActivity = sessionManager.acquireActivity(wsId);
      if (!acquiredActivity) {
        throw new Error(`Workspace session is ${candidateSession.status}`);
      }
      sessionActivity = acquiredActivity;
      session = acquiredActivity.session;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.code(409).send({ error: 'spawn_failed', message });
    }

    const emitSignalBestEffort = (signal: Parameters<typeof emitWaggleSignal>[0]): void => {
      try {
        emitWaggleSignal(signal);
      } catch (err) {
        log.warn(`[fleet/spawn] activity projection failed: ${(err as Error).message}`);
      }
    };

    // Synchronously project the spawn so Waggle Dance can show the new entry.
    emitSignalBestEffort({
      type: 'agent:spawned',
      workspaceId: wsId,
      content: task.length > 200 ? `${task.slice(0, 197)}…` : task,
      metadata: {
        persona: persona ?? null,
        model: resolvedModel,
        sessionId: session.workspaceId,
      },
    });

    // FR #15 Phase B: fire-and-forget runAgentLoop dispatch. The route
    // returns immediately with the synthetic spawn session id; the agent
    // executes in the background, emits agent:started / tool:called /
    // agent:completed signals as it runs, and persists the user task +
    // assistant response under sessions/spawn-{ts}.jsonl so the user can
    // open Chat for the parent workspace and pick the spawn session from
    // the session list to view the result.
    //
    // Scoped out vs chat parity (separate followup): credential pool +
    // provider fallback chain, trace recorder for evolution substrate,
    // file_created events, TeamSync push, governance.allowedSources
    // enforcement, custom user-system-prompt + profile injection. Spawn
    // uses the orchestrator's bare buildSystemPrompt() — enough for
    // autonomous tool-use, not as personalized as chat.
    const spawnSessionId = `spawn-${Date.now()}`;
    const userMessage = { role: 'user' as const, content: task };
    try {
      persistMessage(fastify.localConfig.dataDir, wsId, spawnSessionId, userMessage);
    } catch (err) {
      log.warn(`[fleet/spawn] persist user message failed: ${(err as Error).message}`);
    }

    const runSignal = session.abortController.signal;
    const accountSessionTokens = (totalTokens: number): void => {
      if (
        totalTokens > 0
        && fastify.sessionManager.get(wsId) === session
      ) {
        fastify.sessionManager.addTokens(wsId, totalTokens);
      }
    };
    const execution = (async () => {
      let traceRecorder: TraceRecorder | undefined;
      let traceHandle: TraceHandle | undefined;
      const observedTools = new Set<string>();
      try {
        emitSignalBestEffort({
          type: 'agent:started',
          workspaceId: wsId,
          content: task.length > 200 ? `${task.slice(0, 197)}…` : task,
          metadata: { sessionId: spawnSessionId, model: resolvedModel },
        });

        // FR #4: when PROMPT_ASSEMBLER is on, use the structured assembler
        // path so spawn benefits from the same task-shape scaffolding +
        // tier-adaptive section trimming chat does. Falls back gracefully
        // to the bare orchestrator prompt if the assembler errors.
        // AI-OS #6 fast-follow — supply the durable "why" (project ← workspace,
        // goal ← agent goal) before the orchestrator renders its system prompt.
        session.orchestrator.setGoalAncestry(
          buildSpawnAncestry(fastify.workspaceManager?.get(wsId)?.name, goal),
        );
        let systemPrompt: string;
        if (isEnabled('PROMPT_ASSEMBLER')) {
          try {
            const taskShape = detectTaskShape(task);
            const personaForAssembler = session.personaId
              ? (listPersonas().find(p => p.id === session.personaId) ?? null)
              : null;
            const assembled = await session.orchestrator.buildAssembledPrompt(
              task,
              personaForAssembler,
              { taskShape },
            );
            systemPrompt = assembled.system;
            if (assembled.responseScaffold) {
              systemPrompt += '\n\n## Response shape\n' + assembled.responseScaffold;
            }
            log.info(
              `[fleet/spawn] prompt-assembler applied session=${spawnSessionId} `
              + `shape=${taskShape.type ?? 'none'} conf=${taskShape.confidence.toFixed(2)} `
              + `tier=${assembled.debug.tier} sections=${assembled.debug.sectionsIncluded.length} `
              + `frames=${assembled.debug.framesUsed} chars=${assembled.debug.totalChars}`
            );
          } catch (err) {
            log.warn(`[fleet/spawn] prompt-assembler failed, falling back: ${(err as Error).message}`);
            systemPrompt = session.orchestrator.buildSystemPrompt();
          }
        } else {
          systemPrompt = session.orchestrator.buildSystemPrompt();
        }

        if (fastify.traceStore) {
          // The composition root's shared recorder (CA-5b); an embedder that
          // registers these routes alone has none, so it gets its own.
          traceRecorder = fastify.traceRecorder ?? new TraceRecorder(fastify.traceStore);
          traceHandle = traceRecorder.start({
            sessionId: spawnSessionId,
            personaId: session.personaId ?? persona ?? null,
            workspaceId: wsId,
            model: resolvedModel,
            input: task,
            tags: ['fleet:legacy'],
          });
        }
        const runner = fastify.agentRunner ?? runAgentLoop;
        const result = await runner({
          litellmUrl: fastify.localConfig.litellmUrl,
          litellmApiKey: fastify.agentState.litellmApiKey,
          model: resolvedModel,
          systemPrompt,
          tools: session.tools,
          messages: [userMessage],
          maxTurns: 10,
          signal: runSignal,
          ...(traceRecorder && traceHandle ? {
            traceRecording: {
              recorder: traceRecorder,
              handle: traceHandle,
            },
          } : {}),
          onToolUse: (name) => {
            observedTools.add(name);
            emitSignalBestEffort({
              type: 'tool:called',
              workspaceId: wsId,
              content: `${name} called`,
              metadata: { sessionId: spawnSessionId },
            });
          },
        });
        if (runSignal.aborted) {
          throw Object.assign(new Error('Agent loop aborted (workspace paused).'), {
            name: 'AgentLoopAbortError',
            code: 'AGENT_LOOP_ABORTED',
            toolsUsed: result.toolsUsed,
            usage: result.usage,
          });
        }

        try {
          persistMessage(fastify.localConfig.dataDir, wsId, spawnSessionId, {
            role: 'assistant',
            content: result.content,
          });
        } catch (err) {
          log.warn(`[fleet/spawn] persist assistant response failed: ${(err as Error).message}`);
        }

        const totalTokens = (result.usage?.inputTokens ?? 0) + (result.usage?.outputTokens ?? 0);
        accountSessionTokens(totalTokens);

        if (traceRecorder && traceHandle) {
          try {
            traceRecorder.finalize(traceHandle, {
              outcome: 'success',
              output: result.content,
              tokens: {
                input: result.usage?.inputTokens ?? 0,
                output: result.usage?.outputTokens ?? 0,
              },
            });
          } catch { /* best-effort trace projection */ }
        }

        emitSignalBestEffort({
          type: 'agent:completed',
          workspaceId: wsId,
          content: `Completed: ${result.toolsUsed.length} tool${result.toolsUsed.length === 1 ? '' : 's'} used, ${totalTokens.toLocaleString()} tokens`,
          metadata: {
            sessionId: spawnSessionId,
            model: resolvedModel,
            toolsUsed: result.toolsUsed,
            inputTokens: result.usage?.inputTokens ?? 0,
            outputTokens: result.usage?.outputTokens ?? 0,
          },
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log.error(`[fleet/spawn] agent loop failed for ${wsId}/${spawnSessionId}: ${msg}`);
        const abortPayload = err && typeof err === 'object'
          && 'code' in err && err.code === 'AGENT_LOOP_ABORTED'
          ? err as {
              usage?: { inputTokens?: unknown; outputTokens?: unknown };
              toolsUsed?: unknown;
            }
          : undefined;
        if (runSignal.aborted && abortPayload) {
          const normalizeTokenCount = (value: unknown): number => (
            typeof value === 'number' && Number.isFinite(value) && value >= 0
              ? Math.floor(value)
              : 0
          );
          const abortTools = Array.isArray(abortPayload.toolsUsed)
            ? abortPayload.toolsUsed
              .filter((name): name is string => typeof name === 'string' && name.trim().length > 0)
              .map(name => name.trim())
            : [];
          const toolsUsed = [...new Set([...observedTools, ...abortTools])];
          const inputTokens = normalizeTokenCount(abortPayload.usage?.inputTokens);
          const outputTokens = normalizeTokenCount(abortPayload.usage?.outputTokens);
          const totalTokens = inputTokens + outputTokens;
          const summary = toolsUsed.length > 0
            ? `This run was stopped after Waggle recorded tool activity: ${toolsUsed.join(', ')}. Review completed or in-flight activity before retrying so actions are not duplicated.`
            : 'This run was stopped. An external action may have been in flight. Review activity before retrying so actions are not duplicated.';

          accountSessionTokens(totalTokens);
          try {
            persistMessage(fastify.localConfig.dataDir, wsId, spawnSessionId, {
              role: 'assistant',
              content: summary,
            });
          } catch { /* persist best-effort */ }
          if (traceRecorder && traceHandle) {
            try {
              traceRecorder.finalize(traceHandle, {
                outcome: 'abandoned',
                output: summary,
                tokens: { input: inputTokens, output: outputTokens },
              });
            } catch { /* best-effort trace projection */ }
          }
          emitSignalBestEffort({
            type: 'agent:cancelled',
            workspaceId: wsId,
            content: summary.slice(0, 200),
            metadata: {
              sessionId: spawnSessionId,
              model: resolvedModel,
              toolsUsed,
              inputTokens,
              outputTokens,
            },
          });
          return;
        }
        const failedTools = [...new Set(
          [...observedTools]
            .filter(name => name.trim().length > 0)
            .map(name => name.trim()),
        )];
        const failureSummary = failedTools.length > 0
          ? `This run failed after Waggle recorded tool activity: ${failedTools.join(', ')}. Review completed or in-flight activity before retrying so actions are not duplicated.`
          : `I couldn't finish this run — the model didn't respond. Nothing was changed. You can retry from the Agent Center, or pick a different model in the chat header. (Details are in Events & Logs.)`;
        try {
          // The raw provider/tool error remains in the local log above. Durable
          // user-facing projections keep only safe retry guidance.
          persistMessage(fastify.localConfig.dataDir, wsId, spawnSessionId, {
            role: 'assistant',
            content: failureSummary,
          });
        } catch { /* persist best-effort */ }
        if (traceRecorder && traceHandle) {
          try {
            traceRecorder.finalize(traceHandle, {
              outcome: 'abandoned',
              output: failureSummary,
            });
          } catch { /* best-effort trace projection */ }
        }
        emitSignalBestEffort({
          type: 'agent:error',
          workspaceId: wsId,
          content: failureSummary.slice(0, 200),
          metadata: {
            sessionId: spawnSessionId,
            model: resolvedModel,
            toolsUsed: failedTools,
          },
        });
      } finally {
        sessionActivity.release();
      }
    })();
    const executionId = `legacy:${spawnSessionId}:${++legacyExecutionSequence}`;
    trackExecution(
      executionId,
      execution,
      () => {
        if (sessionManager.get(wsId) === session) sessionManager.close(wsId);
        else session.abortController.abort();
      },
      async () => {},
    );

    return {
      id: session.workspaceId,
      workspaceId: wsId,
      sessionId: spawnSessionId,
      status: session.status,
      startedAt: new Date(session.lastActivity).toISOString(),
      task,
      persona: persona ?? session.personaId ?? null,
      model: resolvedModel,
    };
  });

  // POST /api/fleet/:workspaceId/pause — pause a workspace session
  fastify.post('/api/fleet/:workspaceId/pause', async (request, reply) => {
    const { workspaceId } = request.params as { workspaceId: string };
    const sessionManager = fastify.sessionManager;
    if (!sessionManager) return reply.code(503).send({ error: 'Session manager not available' });

    const paused = sessionManager.pause(workspaceId);
    if (!paused) return reply.code(404).send({ error: 'Session not found or already paused' });
    return { paused: true, workspaceId };
  });

  // POST /api/fleet/:workspaceId/resume — resume a paused session
  fastify.post('/api/fleet/:workspaceId/resume', async (request, reply) => {
    const { workspaceId } = request.params as { workspaceId: string };
    const sessionManager = fastify.sessionManager;
    if (!sessionManager) return reply.code(503).send({ error: 'Session manager not available' });

    const resumed = sessionManager.resume(workspaceId);
    if (!resumed) return reply.code(404).send({ error: 'Session not found or not paused' });
    return { resumed: true, workspaceId };
  });

  // POST /api/fleet/:workspaceId/kill — abort and close a session
  fastify.post('/api/fleet/:workspaceId/kill', async (request, reply) => {
    const { workspaceId } = request.params as { workspaceId: string };
    const sessionManager = fastify.sessionManager;
    if (!sessionManager) return reply.code(503).send({ error: 'Session manager not available' });

    const killed = sessionManager.close(workspaceId);
    if (!killed) return reply.code(404).send({ error: 'Session not found' });
    return { killed: true, workspaceId };
  });
}
