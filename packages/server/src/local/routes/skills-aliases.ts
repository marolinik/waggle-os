import type { FastifyPluginAsync } from 'fastify';
import { authHeaders } from './validate.js';

/**
 * UX-Refactor Phase 3 — Skills `:id` aliases (S06/S19), split out of skills.ts
 * (which sits over the 800-LOC cap). Register AFTER skillRoutes — every alias
 * delegates to a handler that plugin owns.
 *
 * A skill's NAME IS ITS ID (flat markdown files — there is no numeric id), so
 * the `:id`↔`:name` mapping is identity. These thin aliases delegate to the
 * existing handlers via internal inject so the write path (redactSkillContent +
 * traversal guard + hash + hot-reload) is never bypassed. The caller's bearer
 * token is forwarded so the global security middleware sees an authed request.
 */
export const skillsAliasRoutes: FastifyPluginAsync = async (server) => {
  // PATCH /api/skills/:id — alias over PUT /api/skills/:name (content update).
  server.patch<{
    Params: { id: string };
    Body: { content?: string };
  }>('/api/skills/:id', async (request, reply) => {
    const { content } = request.body ?? {};
    if (!content) {
      // content is the only patchable field of a markdown skill — an empty
      // PATCH has nothing to do, so fail loudly instead of no-op "ok".
      return reply.status(400).send({ error: 'content is required' });
    }
    const res = await server.inject({
      method: 'PUT',
      url: `/api/skills/${encodeURIComponent(request.params.id)}`,
      headers: authHeaders(request),
      payload: { content },
    });
    return reply.status(res.statusCode).send(res.json());
  });

  // POST /api/skills/:id/test — :id variant of the body-driven POST /api/skills/test.
  // C37: preview-only — injected-prompt preview + parsed metadata; NO execution,
  // NO LLM call (live dry-run deferred).
  server.post<{
    Params: { id: string };
    Body: { testInput?: string };
  }>('/api/skills/:id/test', async (request, reply) => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/skills/test',
      headers: authHeaders(request),
      payload: { skillName: request.params.id, testInput: request.body?.testInput },
    });
    return reply.status(res.statusCode).send(res.json());
  });

  // POST /api/skills/:id/install — thin dispatcher resolving the install source
  // to the existing installer. All writes flow through those installers, so
  // install_audit + trust assessment + (for marketplace) SecurityGate ride
  // along unchanged. The `:id` means a DIFFERENT thing per
  // source: 'starter' = a starter-skill id; 'pack' = a CAPABILITY-PACK id (the
  // pack's skills install, not a skill named :id); 'marketplace' IGNORES :id —
  // the numeric `packageId` in the body rules.
  server.post<{
    Params: { id: string };
    Body: { source?: string; packageId?: number };
  }>('/api/skills/:id/install', async (request, reply) => {
    const { source, packageId } = request.body ?? {};
    const id = request.params.id;
    if (id.includes('..') || id.includes('/') || id.includes('\\')) {
      return reply.status(400).send({ error: 'Invalid skill ID' });
    }

    let target: { method: 'POST'; url: string; payload?: Record<string, unknown> };
    switch (source) {
      case 'starter':
        target = { method: 'POST', url: `/api/skills/starter-pack/${encodeURIComponent(id)}` };
        break;
      case 'pack':
        target = { method: 'POST', url: `/api/skills/capability-packs/${encodeURIComponent(id)}` };
        break;
      case 'marketplace':
        if (typeof packageId !== 'number') {
          return reply.status(400).send({ error: 'packageId is required for a marketplace install' });
        }
        target = { method: 'POST', url: '/api/marketplace/install', payload: { packageId } };
        break;
      default:
        return reply.status(400).send({ error: 'source must be one of: starter, pack, marketplace' });
    }

    const res = await server.inject({ ...target, headers: authHeaders(request) });
    const body = res.json();
    if (res.statusCode >= 400) return reply.status(res.statusCode).send(body);
    // The capability-pack installer reports per-skill failures as HTTP 200 +
    // ok:false ({ installed/skipped/errors }) — surface that honestly instead
    // of a blanket installed:true.
    if (source === 'pack' && (body as { ok?: boolean }).ok === false) {
      return reply.status(422).send({ installed: false, source, result: body });
    }
    return { installed: true, source, result: body };
  });
};
