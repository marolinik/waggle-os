// CC Sesija A A1.1 follow-up — /api/identity sidecar route.
//
// Backs the get_identity Tauri command + adapter.getIdentity(). Returns the
// IdentityLayer record from packages/core/src/mind/identity.ts when configured,
// or a placeholder shape (configured: false, all fields null) when not.
//
// The placeholder path matches the shape returned by the Tauri command's
// identity_placeholder() and adapter.getIdentity()'s catch path, so the React
// UI sees a single consistent shape regardless of whether the user has
// completed the onboarding identity questionnaire yet.

import type { FastifyPluginAsync } from 'fastify';
import { IdentityLayer } from '@waggle/core';

interface IdentityResponseShape {
  configured: boolean;
  name: string | null;
  role: string | null;
  department: string | null;
  personality: string | null;
  capabilities: string | null;
  system_prompt: string | null;
  created_at: string | null;
  updated_at: string | null;
  _note?: string;
}

function placeholder(note?: string): IdentityResponseShape {
  return {
    configured: false,
    name: null,
    role: null,
    department: null,
    personality: null,
    capabilities: null,
    system_prompt: null,
    created_at: null,
    updated_at: null,
    ...(note ? { _note: note } : {}),
  };
}

export const identityRoutes: FastifyPluginAsync = async (server) => {
  /**
   * Resolve the MindDB to read the identity record from. Defaults to personal
   * mind; ?workspace=<id> selects a workspace-scoped identity (workspaces own
   * their own identity rows because the mind/identity.ts schema is per-DB).
   */
  function resolveDb(workspaceId: string | undefined): { db: ReturnType<typeof server.multiMind.personal.getDatabase> | null; whichMind: string } {
    if (workspaceId && workspaceId !== 'personal') {
      const wsMindDb = server.agentState?.getWorkspaceMindDb?.(workspaceId);
      if (wsMindDb) {
        return { db: wsMindDb.getDatabase(), whichMind: workspaceId };
      }
    }
    const personal = server.multiMind?.personal;
    if (!personal) return { db: null, whichMind: 'personal' };
    return { db: personal.getDatabase(), whichMind: 'personal' };
  }

  // GET /api/identity?workspace=<id> — read identity (defaults to personal mind)
  server.get<{ Querystring: { workspace?: string; workspaceId?: string } }>(
    '/api/identity',
    async (request, reply) => {
      const wsId = request.query.workspace ?? request.query.workspaceId;
      const personalMindDb = server.multiMind?.personal;

      if (!personalMindDb) {
        return reply.send(placeholder('multi-mind not initialized'));
      }

      // Use the workspace mind if requested + available; else personal.
      const targetMindDb =
        wsId && wsId !== 'personal'
          ? server.agentState?.getWorkspaceMindDb?.(wsId) ?? personalMindDb
          : personalMindDb;

      try {
        const layer = new IdentityLayer(targetMindDb);
        if (!layer.exists()) {
          return reply.send(placeholder('identity not configured for this mind'));
        }
        const id = layer.get();
        return reply.send({
          configured: true,
          name: id.name,
          role: id.role,
          department: id.department,
          personality: id.personality,
          capabilities: id.capabilities,
          system_prompt: id.system_prompt,
          created_at: id.created_at,
          updated_at: id.updated_at,
        } satisfies IdentityResponseShape);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'identity read failed';
        return reply.send(placeholder(msg));
      }
    },
  );

  // POST /api/identity — create or update the identity record. Single-row
  // table per MindDB (id = 1), so create + update collapse into upsert.
  server.post<{
    Body: {
      workspace?: string;
      workspaceId?: string;
      name?: string;
      role?: string;
      department?: string;
      personality?: string;
      capabilities?: string;
      system_prompt?: string;
    };
  }>('/api/identity', async (request, reply) => {
    const body = request.body ?? {};
    const wsId = body.workspace ?? body.workspaceId;
    const personalMindDb = server.multiMind?.personal;

    if (!personalMindDb) {
      return reply.status(503).send({ error: 'multi-mind not initialized' });
    }

    const targetMindDb =
      wsId && wsId !== 'personal'
        ? server.agentState?.getWorkspaceMindDb?.(wsId) ?? personalMindDb
        : personalMindDb;

    const layer = new IdentityLayer(targetMindDb);
    const fields = {
      name: body.name ?? '',
      role: body.role ?? '',
      department: body.department ?? '',
      personality: body.personality ?? '',
      capabilities: body.capabilities ?? '',
      system_prompt: body.system_prompt ?? '',
    };

    try {
      const id = layer.exists() ? layer.update(fields) : layer.create(fields);
      return reply.send({
        configured: true,
        name: id.name,
        role: id.role,
        department: id.department,
        personality: id.personality,
        capabilities: id.capabilities,
        system_prompt: id.system_prompt,
        created_at: id.created_at,
        updated_at: id.updated_at,
      } satisfies IdentityResponseShape);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'identity write failed';
      return reply.status(500).send({ error: msg });
    }
  });
};
