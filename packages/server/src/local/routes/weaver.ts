/**
 * Weaver REST API Routes — memory consolidation management.
 *
 * Endpoints:
 *   GET  /api/weaver/status  — check weaver state and last-run times
 *   POST /api/weaver/trigger — manually trigger a consolidation cycle
 */

import type { FastifyPluginAsync } from 'fastify';
import { FrameStore, SessionStore } from '@waggle/core';
import { MemoryWeaver } from '@waggle/weaver';

export const weaverRoutes: FastifyPluginAsync = async (server) => {
  // F2: GET /api/weaver/status — check weaver state
  server.get('/api/weaver/status', async () => {
    const weaverState = (server.agentState as any).weaverState ?? {};
    const workspaceWeavers = (server.agentState as any).workspaceWeaverStatus ?? {};

    return {
      personalMind: {
        lastConsolidation: weaverState.lastPersonalConsolidation ?? null,
        lastDecay: weaverState.lastPersonalDecay ?? null,
        timerActive: true,
      },
      workspaces: Object.entries(workspaceWeavers).map(([id, state]: [string, any]) => ({
        id,
        lastConsolidation: state?.lastConsolidation ?? null,
        timerActive: true,
      })),
      checkedAt: new Date().toISOString(),
    };
  });

  // POST /api/weaver/trigger — manually trigger a consolidation cycle
  server.post<{
    Body?: {
      workspaceId?: string;
      workspace?: string;
    };
  }>('/api/weaver/trigger', async (request, reply) => {
    // P0-4: Accept both 'workspaceId' and 'workspace'
    const body = request.body as { workspaceId?: string; workspace?: string } | undefined;
    const workspaceId = body?.workspaceId ?? body?.workspace;

    const results: {
      target: string;
      framesConsolidated: number;
      framesDecayed: number;
      framesStrengthened: number;
    }[] = [];

    // If no workspaceId, consolidate the personal mind
    if (!workspaceId) {
      try {
        const personalDb = server.multiMind.personal;
        const frames = new FrameStore(personalDb);
        const sessions = new SessionStore(personalDb);
        const weaver = new MemoryWeaver(personalDb, frames, sessions);

        let consolidated = 0;
        const active = sessions.getActive();
        for (const s of active) {
          const result = weaver.consolidateGop(s.gop_id);
          if (result) consolidated++;
        }

        const decayed = weaver.decayFrames();
        const strengthened = weaver.strengthenFrames();

        results.push({
          target: 'personal',
          framesConsolidated: consolidated,
          framesDecayed: decayed,
          framesStrengthened: strengthened,
        });
      } catch (err) {
        return reply.status(500).send({
          error: `Personal mind consolidation failed: ${(err as Error).message}`,
        });
      }
    } else {
      // Consolidate a specific workspace mind
      const ws = server.workspaceManager.get(workspaceId);
      if (!ws) {
        return reply.status(404).send({ error: 'Workspace not found' });
      }

      try {
        // Activate workspace mind to ensure it's loaded
        server.agentState.activateWorkspaceMind(workspaceId);

        const wsDb = server.agentState.getWorkspaceMindDb(workspaceId);
        if (!wsDb) {
          return reply.status(500).send({ error: 'Could not open workspace mind database' });
        }

        const frames = new FrameStore(wsDb);
        const sessions = new SessionStore(wsDb);
        const weaver = new MemoryWeaver(wsDb, frames, sessions);

        let consolidated = 0;
        const active = sessions.getActive();
        for (const s of active) {
          const result = weaver.consolidateGop(s.gop_id);
          if (result) consolidated++;
        }

        const decayed = weaver.decayFrames();
        const strengthened = weaver.strengthenFrames();

        results.push({
          target: `workspace:${ws.name}`,
          framesConsolidated: consolidated,
          framesDecayed: decayed,
          framesStrengthened: strengthened,
        });
      } catch (err) {
        return reply.status(500).send({
          error: `Workspace consolidation failed: ${(err as Error).message}`,
        });
      }
    }

    return {
      ok: true,
      results,
      triggeredAt: new Date().toISOString(),
    };
  });
};
