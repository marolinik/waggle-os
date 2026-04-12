/**
 * Fleet routes — agent fleet status and controls for Mission Control.
 * Exposes workspace session state, pause/resume/kill controls.
 */

import type { FastifyInstance } from 'fastify';
import { parseTier, getCapabilities } from '@waggle/shared';
import { requireTier } from '../../middleware/assert-tier.js';

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

    // Tier-based maxSessions: FREE=3, PRO=10, TEAMS=25, ENTERPRISE/TRIAL=100
    const tierRaw = (fastify as any).localConfig?.tier ?? '';
    const tier = parseTier(String(tierRaw)) ?? 'FREE';
    const caps = getCapabilities(tier);
    const maxSessions = tier === 'FREE' ? 3 : tier === 'PRO' ? 10 : tier === 'TEAMS' ? 25 : 100;

    return { sessions, count: sessions.length, maxSessions };
  });

  // POST /api/fleet/spawn — spawn a new agent session (free for all tiers — agents generate memory)
  fastify.post<{
    Body: { task: string; persona?: string; model?: string; parentWorkspaceId?: string };
  }>('/api/fleet/spawn', async (request, reply) => {
    const { task, persona, model, parentWorkspaceId } = request.body;
    if (!task) return reply.code(400).send({ error: 'task is required' });

    const wsId = parentWorkspaceId || 'local-default';
    const sessionManager = (fastify as any).sessionManager;
    if (!sessionManager) return reply.code(503).send({ error: 'Session manager not available' });

    const session = sessionManager.create(wsId, { persona, model });
    return {
      workspaceId: wsId,
      sessionId: session?.id ?? `session-${Date.now()}`,
      status: 'active',
      task,
      persona: persona ?? null,
      model: model ?? fastify.agentState?.currentModel ?? 'default',
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
