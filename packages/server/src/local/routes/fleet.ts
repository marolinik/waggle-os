/**
 * Fleet routes — agent fleet status and controls for Mission Control.
 * Exposes workspace session state, pause/resume/kill controls.
 */

import type { FastifyInstance } from 'fastify';
import { parseTier, getCapabilities } from '@waggle/shared';
import { requireTier } from '../../middleware/assert-tier.js';
import { emitWaggleSignal } from './waggle-signals.js';

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
    // entry within the same response cycle. Phase B will add :running and
    // :completed signals from the agent loop itself.
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

    return {
      id: session.workspaceId,
      workspaceId: wsId,
      sessionId: session.workspaceId,
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
