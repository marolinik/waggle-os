/**
 * Fleet routes — agent fleet status and controls for Mission Control.
 * Exposes workspace session state, pause/resume/kill controls.
 */

import type { FastifyInstance } from 'fastify';

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
        tokensUsed: 0, // TODO: track per-session tokens
        costEstimate: Math.round(wsCost * 10000) / 10000,
      };
    });

    // Tier-based maxSessions: Solo=3, Teams=10, Business=25, Enterprise=unlimited
    const tier = (fastify as any).localConfig?.tier ?? 'solo';
    const maxByTier: Record<string, number> = { solo: 3, teams: 10, business: 25, enterprise: 100 };
    const maxSessions = maxByTier[tier] ?? 3;

    return { sessions, count: sessions.length, maxSessions };
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
