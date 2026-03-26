import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { TeamService } from '../services/team-service.js';
import { users } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { createTeamSchema, inviteMemberSchema, updateMemberSchema } from '@waggle/shared';

const ROLE_HIERARCHY: Record<string, number> = { member: 1, admin: 2, owner: 3 };

async function requireTeamRole(
  server: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
  slug: string,
  minRole: 'member' | 'admin' | 'owner',
) {
  const teamService = new TeamService(server.db);
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

  const userLevel = ROLE_HIERARCHY[membership.role] ?? 0;
  const requiredLevel = ROLE_HIERARCHY[minRole] ?? 0;
  if (userLevel < requiredLevel) {
    reply.code(403).send({ error: 'Insufficient permissions' });
    return null;
  }

  return { team, membership };
}

export async function teamRoutes(fastify: FastifyInstance) {
  const teamService = new TeamService(fastify.db);

  // POST /api/teams — create team
  fastify.post('/api/teams', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const parsed = createTeamSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Validation failed', details: parsed.error.flatten() });
    }

    // Check slug uniqueness
    const existing = await teamService.getBySlug(parsed.data.slug);
    if (existing) {
      return reply.code(409).send({ error: 'Team slug already exists' });
    }

    const team = await teamService.create(request.userId, parsed.data);
    return reply.code(201).send(team);
  });

  // GET /api/teams — list user's teams
  fastify.get('/api/teams', { preHandler: [fastify.authenticate] }, async (request) => {
    return teamService.listForUser(request.userId);
  });

  // GET /api/teams/:slug — get team details with members
  fastify.get('/api/teams/:slug', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const result = await requireTeamRole(fastify, request, reply, slug, 'member');
    if (!result) return;

    const members = await teamService.getMembers(result.team.id);
    return { ...result.team, members };
  });

  // PATCH /api/teams/:slug — update team (admin+)
  fastify.patch('/api/teams/:slug', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const result = await requireTeamRole(fastify, request, reply, slug, 'admin');
    if (!result) return;

    const body = request.body as { name?: string };
    if (!body.name || typeof body.name !== 'string' || body.name.length < 1 || body.name.length > 100) {
      return reply.code(400).send({ error: 'Invalid name' });
    }

    const updated = await teamService.update(result.team.id, { name: body.name });
    return updated;
  });

  // POST /api/teams/:slug/members — invite member (admin+)
  fastify.post('/api/teams/:slug/members', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const result = await requireTeamRole(fastify, request, reply, slug, 'admin');
    if (!result) return;

    const parsed = inviteMemberSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Validation failed', details: parsed.error.flatten() });
    }

    // Look up user by email
    const [targetUser] = await fastify.db
      .select()
      .from(users)
      .where(eq(users.email, parsed.data.email))
      .limit(1);

    if (!targetUser) {
      return reply.code(404).send({ error: 'User not found with that email' });
    }

    // Check if already a member
    const existingMembership = await teamService.getMembership(result.team.id, targetUser.id);
    if (existingMembership) {
      return reply.code(409).send({ error: 'User is already a member of this team' });
    }

    const member = await teamService.addMember(result.team.id, targetUser.id, parsed.data.role);
    return reply.code(201).send(member);
  });

  // DELETE /api/teams/:slug/members/:userId — remove member (admin+)
  fastify.delete('/api/teams/:slug/members/:userId', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { slug, userId } = request.params as { slug: string; userId: string };
    const result = await requireTeamRole(fastify, request, reply, slug, 'admin');
    if (!result) return;

    try {
      const removed = await teamService.removeMember(result.team.id, userId);
      if (!removed) {
        return reply.code(404).send({ error: 'Member not found' });
      }
      return reply.code(204).send();
    } catch (err: any) {
      if (err.message === 'Cannot remove the team owner') {
        return reply.code(403).send({ error: err.message });
      }
      throw err;
    }
  });

  // PATCH /api/teams/:slug/members/:userId — update member
  fastify.patch('/api/teams/:slug/members/:userId', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { slug, userId: targetUserId } = request.params as { slug: string; userId: string };

    const parsed = updateMemberSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Validation failed', details: parsed.error.flatten() });
    }

    // Determine required role: role changes need admin+, self-updates for roleDescription/interests are ok
    const isSelfUpdate = request.userId === targetUserId;
    const isRoleChange = parsed.data.role !== undefined;

    if (isRoleChange || !isSelfUpdate) {
      // Need admin+ for role changes or updating other members
      const result = await requireTeamRole(fastify, request, reply, slug, 'admin');
      if (!result) return;

      const updated = await teamService.updateMember(result.team.id, targetUserId, parsed.data);
      if (!updated) {
        return reply.code(404).send({ error: 'Member not found' });
      }
      return updated;
    } else {
      // Self-update: only roleDescription and interests (no role field)
      const result = await requireTeamRole(fastify, request, reply, slug, 'member');
      if (!result) return;

      const { role: _discard, ...safeData } = parsed.data;
      const updated = await teamService.updateMember(result.team.id, targetUserId, safeData);
      if (!updated) {
        return reply.code(404).send({ error: 'Member not found' });
      }
      return updated;
    }
  });
}
