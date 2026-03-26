import type { FastifyInstance } from 'fastify';
import { TeamService } from '../services/team-service.js';
import { TeamCapabilityGovernance } from '../services/team-capability-governance.js';
import { MessageService } from '../services/message-service.js';

const ROLE_HIERARCHY: Record<string, number> = {
  member: 1,
  admin: 2,
  owner: 3,
};

const VALID_ROLES = ['owner', 'admin', 'member'];
const VALID_SOURCES = ['native', 'skill', 'plugin', 'mcp', 'subagent'];
const VALID_THRESHOLDS = ['low', 'medium', 'high', 'none'];

export async function capabilityGovernanceRoutes(fastify: FastifyInstance) {
  const teamService = new TeamService(fastify.db);
  const governance = new TeamCapabilityGovernance(fastify.db);

  async function resolveTeam(request: any, reply: any, slug: string) {
    const team = await teamService.getBySlug(slug);
    if (!team) {
      reply.code(404).send({ error: 'Team not found' });
      return null;
    }

    const membership = await teamService.getMembership(team.id, request.userId);
    if (!membership) {
      reply.code(403).send({ error: 'Not a member of this team' });
      return null;
    }

    return { team, membership };
  }

  function requireAdmin(membership: { role: string }, reply: any): boolean {
    const level = ROLE_HIERARCHY[membership.role] ?? 0;
    if (level < ROLE_HIERARCHY.admin) {
      reply.code(403).send({ error: 'Admin or owner role required' });
      return false;
    }
    return true;
  }

  // --- Policies ---

  // GET /api/teams/:slug/capability-policies — list all policies
  fastify.get('/api/teams/:slug/capability-policies', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const ctx = await resolveTeam(request, reply, slug);
    if (!ctx) return;

    const policies = await governance.listPolicies(ctx.team.id);
    return policies;
  });

  // PUT /api/teams/:slug/capability-policies/:role — update policy
  fastify.put('/api/teams/:slug/capability-policies/:role', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { slug, role } = request.params as { slug: string; role: string };
    const ctx = await resolveTeam(request, reply, slug);
    if (!ctx) return;
    if (!requireAdmin(ctx.membership, reply)) return;

    if (!VALID_ROLES.includes(role)) {
      return reply.code(400).send({ error: `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}` });
    }

    const body = request.body as {
      allowedSources?: string[];
      blockedTools?: string[];
      approvalThreshold?: string;
    };

    if (body.allowedSources) {
      for (const s of body.allowedSources) {
        if (!VALID_SOURCES.includes(s)) {
          return reply.code(400).send({ error: `Invalid source: ${s}. Must be one of: ${VALID_SOURCES.join(', ')}` });
        }
      }
    }

    if (body.approvalThreshold && !VALID_THRESHOLDS.includes(body.approvalThreshold)) {
      return reply.code(400).send({ error: `Invalid threshold. Must be one of: ${VALID_THRESHOLDS.join(', ')}` });
    }

    const policy = await governance.upsertPolicy(ctx.team.id, role, body, request.userId);
    return policy;
  });

  // --- Overrides ---

  // GET /api/teams/:slug/capability-overrides — list all overrides
  fastify.get('/api/teams/:slug/capability-overrides', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const ctx = await resolveTeam(request, reply, slug);
    if (!ctx) return;

    const overrides = await governance.listOverrides(ctx.team.id);
    return overrides;
  });

  // POST /api/teams/:slug/capability-overrides — create override
  fastify.post('/api/teams/:slug/capability-overrides', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const ctx = await resolveTeam(request, reply, slug);
    if (!ctx) return;
    if (!requireAdmin(ctx.membership, reply)) return;

    const body = request.body as {
      capabilityName?: string;
      capabilityType?: string;
      decision?: string;
      reason?: string;
    };

    if (!body.capabilityName || !body.capabilityType || !body.decision) {
      return reply.code(400).send({ error: 'capabilityName, capabilityType, and decision are required' });
    }

    if (body.decision !== 'approved' && body.decision !== 'blocked') {
      return reply.code(400).send({ error: 'decision must be approved or blocked' });
    }

    try {
      const override = await governance.createOverride(
        ctx.team.id,
        {
          capabilityName: body.capabilityName,
          capabilityType: body.capabilityType,
          decision: body.decision as 'approved' | 'blocked',
          reason: body.reason,
        },
        request.userId,
      );
      return reply.code(201).send(override);
    } catch (err: any) {
      if (err.message?.includes('unique') || err.message?.includes('UNIQUE') || err.code === '23505') {
        return reply.code(409).send({ error: 'Override already exists for this capability' });
      }
      throw err;
    }
  });

  // DELETE /api/teams/:slug/capability-overrides/:id — delete override
  fastify.delete('/api/teams/:slug/capability-overrides/:id', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { slug, id } = request.params as { slug: string; id: string };
    const ctx = await resolveTeam(request, reply, slug);
    if (!ctx) return;
    if (!requireAdmin(ctx.membership, reply)) return;

    const deleted = await governance.deleteOverride(id);
    if (!deleted) {
      return reply.code(404).send({ error: 'Override not found' });
    }

    return reply.code(204).send();
  });

  // --- Requests ---

  // POST /api/teams/:slug/capability-requests — submit request
  fastify.post('/api/teams/:slug/capability-requests', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const ctx = await resolveTeam(request, reply, slug);
    if (!ctx) return;

    const body = request.body as {
      capabilityName?: string;
      capabilityType?: string;
      justification?: string;
    };

    if (!body.capabilityName || !body.capabilityType || !body.justification) {
      return reply.code(400).send({ error: 'capabilityName, capabilityType, and justification are required' });
    }

    const result = await governance.submitRequest(ctx.team.id, request.userId, {
      capabilityName: body.capabilityName,
      capabilityType: body.capabilityType,
      justification: body.justification,
    });

    if ('duplicate' in result && result.duplicate) {
      return reply.code(409).send({ error: 'A pending request for this capability already exists' });
    }

    return reply.code(201).send((result as any).request);
  });

  // GET /api/teams/:slug/capability-requests — list requests
  fastify.get('/api/teams/:slug/capability-requests', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const ctx = await resolveTeam(request, reply, slug);
    if (!ctx) return;

    const query = request.query as { status?: string };
    const allRequests = await governance.listRequests(ctx.team.id, query.status);

    // Non-admin users only see their own requests
    const level = ROLE_HIERARCHY[ctx.membership.role] ?? 0;
    if (level < ROLE_HIERARCHY.admin) {
      return allRequests.filter((r) => r.requestedBy === request.userId);
    }

    return allRequests;
  });

  // PATCH /api/teams/:slug/capability-requests/:id — decide request
  fastify.patch('/api/teams/:slug/capability-requests/:id', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { slug, id } = request.params as { slug: string; id: string };
    const ctx = await resolveTeam(request, reply, slug);
    if (!ctx) return;
    if (!requireAdmin(ctx.membership, reply)) return;

    const body = request.body as { status?: string; reason?: string };

    if (!body.status || (body.status !== 'approved' && body.status !== 'rejected')) {
      return reply.code(400).send({ error: 'status must be approved or rejected' });
    }

    const capRequest = await governance.getRequest(id);
    if (!capRequest) {
      return reply.code(404).send({ error: 'Request not found' });
    }

    if (capRequest.status !== 'pending') {
      return reply.code(400).send({ error: 'Request has already been decided' });
    }

    const decided = await governance.decideRequest(id, request.userId, body.status as 'approved' | 'rejected', body.reason);

    // On approve: auto-create override
    if (body.status === 'approved') {
      try {
        await governance.createOverride(
          ctx.team.id,
          {
            capabilityName: capRequest.capabilityName,
            capabilityType: capRequest.capabilityType,
            decision: 'approved',
            reason: body.reason,
          },
          request.userId,
        );
      } catch (_err) {
        // Override may already exist — ignore conflict
      }
    }

    // Send Waggle Dance notification (non-critical)
    try {
      const messageService = new MessageService(fastify.db);
      await messageService.send(ctx.team.id, request.userId, {
        type: 'response',
        subtype: 'capability_decision',
        content: { capabilityName: capRequest.capabilityName, decision: body.status, reason: body.reason ?? '' },
        routing: [{ userId: capRequest.requestedBy, reason: 'capability_request_decision' }],
      });
    } catch (_err) {
      // Non-critical — don't fail the request
    }

    return decided;
  });
}
