/**
 * Fleet routes — agent fleet status and controls for Mission Control.
 * Exposes workspace session state, pause/resume/kill controls.
 */

import type { FastifyInstance } from 'fastify';
import { parseTier, getCapabilities } from '@waggle/shared';
import { requireTier } from '../../middleware/assert-tier.js';
import { runAgentLoop } from '@waggle/agent';
import { emitWaggleSignal } from './waggle-signals.js';
import { persistMessage } from './chat-persistence.js';
import { createLogger } from '../logger.js';

const log = createLogger('fleet');

export async function fleetRoutes(fastify: FastifyInstance) {
  // GET /api/fleet — list all active workspace sessions
  fastify.get('/api/fleet', async () => {
    const sessionManager = (fastify as any).sessionManager;
    if (!sessionManager) {
      return { sessions: [], count: 0 };
    }

    const costTracker = fastify.agentState?.costTracker;
    const sessions = sessionManager.getActive().map((s: any) => {
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

    // Tier-based maxSessions: FREE=3, PRO=10, TEAMS=25, ENTERPRISE/TRIAL=100
    const tierRaw = (fastify as any).localConfig?.tier ?? '';
    const tier = parseTier(String(tierRaw)) ?? 'FREE';
    const caps = getCapabilities(tier);
    const maxSessions = tier === 'FREE' ? 3 : tier === 'PRO' ? 10 : tier === 'TEAMS' ? 25 : 100;

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
    Body: { task: string; persona?: string; model?: string; parentWorkspaceId?: string };
  }>('/api/fleet/spawn', async (request, reply) => {
    const { task, persona, model, parentWorkspaceId } = request.body;
    if (!task) return reply.code(400).send({ error: 'task is required' });

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
    // signal payload reflect the real model the agent will use.
    const resolvedModel = model
      ?? fastify.workspaceManager?.get(wsId)?.model
      ?? fastify.agentState?.currentModel
      ?? 'default';

    let session;
    try {
      session = sessionManager.getOrCreate(
        wsId,
        () => mind,
        (m) => fastify.agentState.createSessionOrchestrator(m),
        (m, o) => fastify.agentState.buildToolsForSession(o, wsId, wsId),
        persona ?? fastify.workspaceManager?.get(wsId)?.personaId ?? undefined,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.code(409).send({ error: 'spawn_failed', message });
    }

    // Synchronously emit the spawn signal so Waggle Dance shows the new
    // entry within the same response cycle.
    emitWaggleSignal({
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

    void (async () => {
      try {
        emitWaggleSignal({
          type: 'agent:started',
          workspaceId: wsId,
          content: task.length > 200 ? `${task.slice(0, 197)}…` : task,
          metadata: { sessionId: spawnSessionId, model: resolvedModel },
        });

        const systemPrompt = session.orchestrator.buildSystemPrompt();
        const result = await runAgentLoop({
          litellmUrl: fastify.localConfig.litellmUrl,
          litellmApiKey: fastify.agentState.litellmApiKey,
          model: resolvedModel,
          systemPrompt,
          tools: session.tools,
          messages: [userMessage],
          maxTurns: 10,
          signal: session.abortController.signal,
          onToolUse: (name, input) => {
            emitWaggleSignal({
              type: 'tool:called',
              workspaceId: wsId,
              content: `${name}(${JSON.stringify(input).slice(0, 100)})`,
              metadata: { sessionId: spawnSessionId },
            });
          },
        });

        try {
          persistMessage(fastify.localConfig.dataDir, wsId, spawnSessionId, {
            role: 'assistant',
            content: result.content,
          });
        } catch (err) {
          log.warn(`[fleet/spawn] persist assistant response failed: ${(err as Error).message}`);
        }

        const totalTokens = (result.usage?.inputTokens ?? 0) + (result.usage?.outputTokens ?? 0);
        if (totalTokens > 0) fastify.sessionManager.addTokens(wsId, totalTokens);
        fastify.sessionManager.touch(wsId);

        emitWaggleSignal({
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
        try {
          persistMessage(fastify.localConfig.dataDir, wsId, spawnSessionId, {
            role: 'assistant',
            content: `[spawn failed] ${msg}`,
          });
        } catch { /* persist best-effort */ }
        emitWaggleSignal({
          type: 'agent:error',
          workspaceId: wsId,
          content: `Failed: ${msg.length > 200 ? `${msg.slice(0, 197)}…` : msg}`,
          metadata: { sessionId: spawnSessionId, model: resolvedModel },
        });
      }
    })();

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
    const sessionManager = (fastify as any).sessionManager;
    if (!sessionManager) return reply.code(503).send({ error: 'Session manager not available' });

    const paused = sessionManager.pause(workspaceId);
    if (!paused) return reply.code(404).send({ error: 'Session not found or already paused' });
    return { paused: true, workspaceId };
  });

  // POST /api/fleet/:workspaceId/resume — resume a paused session
  fastify.post('/api/fleet/:workspaceId/resume', async (request, reply) => {
    const { workspaceId } = request.params as { workspaceId: string };
    const sessionManager = (fastify as any).sessionManager;
    if (!sessionManager) return reply.code(503).send({ error: 'Session manager not available' });

    const resumed = sessionManager.resume(workspaceId);
    if (!resumed) return reply.code(404).send({ error: 'Session not found or not paused' });
    return { resumed: true, workspaceId };
  });

  // POST /api/fleet/:workspaceId/kill — abort and close a session
  fastify.post('/api/fleet/:workspaceId/kill', async (request, reply) => {
    const { workspaceId } = request.params as { workspaceId: string };
    const sessionManager = (fastify as any).sessionManager;
    if (!sessionManager) return reply.code(503).send({ error: 'Session manager not available' });

    const killed = sessionManager.close(workspaceId);
    if (!killed) return reply.code(404).send({ error: 'Session not found' });
    return { killed: true, workspaceId };
  });
}
