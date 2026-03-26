import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../../packages/server/src/index.js';
import {
  users, teams, teamMembers, tasks, messages,
  teamEntities, teamResources, agentAuditLog,
} from '../../packages/server/src/db/schema.js';
import { sql } from 'drizzle-orm';

describe('M3 Full Stack Integration', () => {
  let server: Awaited<ReturnType<typeof buildServer>>;
  let ownerId: string;
  let memberId: string;
  let teamId: string;
  const teamSlug = 'integ-team';

  beforeAll(async () => {
    server = await buildServer();

    // Clean up leftover test data from previous runs (reverse dependency order)
    await server.db.execute(sql`DELETE FROM agent_audit_log WHERE user_id IN (SELECT id FROM users WHERE clerk_id LIKE 'integ_%')`);
    await server.db.execute(sql`DELETE FROM team_resources WHERE team_id IN (SELECT id FROM teams WHERE slug = 'integ-team')`);
    await server.db.execute(sql`DELETE FROM team_relations WHERE team_id IN (SELECT id FROM teams WHERE slug = 'integ-team')`);
    await server.db.execute(sql`DELETE FROM team_entities WHERE team_id IN (SELECT id FROM teams WHERE slug = 'integ-team')`);
    await server.db.execute(sql`DELETE FROM messages WHERE team_id IN (SELECT id FROM teams WHERE slug = 'integ-team')`);
    await server.db.execute(sql`DELETE FROM tasks WHERE team_id IN (SELECT id FROM teams WHERE slug = 'integ-team')`);
    await server.db.execute(sql`DELETE FROM agent_jobs WHERE team_id IN (SELECT id FROM teams WHERE slug = 'integ-team')`);
    await server.db.execute(sql`DELETE FROM cron_schedules WHERE team_id IN (SELECT id FROM teams WHERE slug = 'integ-team')`);
    await server.db.execute(sql`DELETE FROM team_members WHERE team_id IN (SELECT id FROM teams WHERE slug = 'integ-team')`);
    await server.db.execute(sql`DELETE FROM team_capability_requests WHERE team_id IN (SELECT id FROM teams WHERE slug = 'integ-team')`);
    await server.db.execute(sql`DELETE FROM team_capability_overrides WHERE team_id IN (SELECT id FROM teams WHERE slug = 'integ-team')`);
    await server.db.execute(sql`DELETE FROM team_capability_policies WHERE team_id IN (SELECT id FROM teams WHERE slug = 'integ-team')`);
    await server.db.execute(sql`DELETE FROM teams WHERE slug = 'integ-team'`);
    await server.db.execute(sql`DELETE FROM users WHERE clerk_id LIKE 'integ_%'`);

    // Override auth handler for testing
    server._authHandler.fn = async function (request: any, reply: any) {
      const testUserId = request.headers['x-test-user-id'] as string;
      if (!testUserId) {
        return reply.code(401).send({ error: 'Missing x-test-user-id header' });
      }
      request.userId = testUserId;
      request.clerkId = 'test';
    };
  });

  afterAll(async () => {
    // Clean up all test data
    await server.db.execute(sql`DELETE FROM agent_audit_log WHERE user_id IN (SELECT id FROM users WHERE clerk_id LIKE 'integ_%')`);
    await server.db.execute(sql`DELETE FROM team_resources WHERE team_id IN (SELECT id FROM teams WHERE slug = 'integ-team')`);
    await server.db.execute(sql`DELETE FROM team_relations WHERE team_id IN (SELECT id FROM teams WHERE slug = 'integ-team')`);
    await server.db.execute(sql`DELETE FROM team_entities WHERE team_id IN (SELECT id FROM teams WHERE slug = 'integ-team')`);
    await server.db.execute(sql`DELETE FROM messages WHERE team_id IN (SELECT id FROM teams WHERE slug = 'integ-team')`);
    await server.db.execute(sql`DELETE FROM tasks WHERE team_id IN (SELECT id FROM teams WHERE slug = 'integ-team')`);
    await server.db.execute(sql`DELETE FROM agent_jobs WHERE team_id IN (SELECT id FROM teams WHERE slug = 'integ-team')`);
    await server.db.execute(sql`DELETE FROM cron_schedules WHERE team_id IN (SELECT id FROM teams WHERE slug = 'integ-team')`);
    await server.db.execute(sql`DELETE FROM team_members WHERE team_id IN (SELECT id FROM teams WHERE slug = 'integ-team')`);
    await server.db.execute(sql`DELETE FROM team_capability_requests WHERE team_id IN (SELECT id FROM teams WHERE slug = 'integ-team')`);
    await server.db.execute(sql`DELETE FROM team_capability_overrides WHERE team_id IN (SELECT id FROM teams WHERE slug = 'integ-team')`);
    await server.db.execute(sql`DELETE FROM team_capability_policies WHERE team_id IN (SELECT id FROM teams WHERE slug = 'integ-team')`);
    await server.db.execute(sql`DELETE FROM teams WHERE slug = 'integ-team'`);
    await server.db.execute(sql`DELETE FROM users WHERE clerk_id LIKE 'integ_%'`);
    await server.close();
  });

  it('Step 1: Creates users via webhook', async () => {
    // Create owner
    let res = await server.inject({
      method: 'POST',
      url: '/api/webhooks/clerk',
      payload: {
        type: 'user.created',
        data: {
          id: 'integ_owner',
          first_name: 'Owner',
          last_name: 'User',
          email_addresses: [{ email_address: 'integ_owner@test.com' }],
        },
      },
    });
    expect(res.statusCode).toBe(200);

    // Create member
    res = await server.inject({
      method: 'POST',
      url: '/api/webhooks/clerk',
      payload: {
        type: 'user.created',
        data: {
          id: 'integ_member',
          first_name: 'Member',
          last_name: 'User',
          email_addresses: [{ email_address: 'integ_member@test.com' }],
        },
      },
    });
    expect(res.statusCode).toBe(200);

    // Get user IDs
    const [owner] = await server.db.select().from(users).where(sql`clerk_id = 'integ_owner'`);
    const [member] = await server.db.select().from(users).where(sql`clerk_id = 'integ_member'`);
    expect(owner).toBeDefined();
    expect(member).toBeDefined();
    ownerId = owner.id;
    memberId = member.id;
  });

  it('Step 2: Creates team and invites member', async () => {
    let res = await server.inject({
      method: 'POST',
      url: '/api/teams',
      headers: { 'x-test-user-id': ownerId },
      payload: { name: 'Integration Team', slug: teamSlug },
    });
    expect(res.statusCode).toBe(201);
    teamId = JSON.parse(res.body).id;

    // Add member
    res = await server.inject({
      method: 'POST',
      url: `/api/teams/${teamSlug}/members`,
      headers: { 'x-test-user-id': ownerId },
      payload: { email: 'integ_member@test.com', role: 'member' },
    });
    expect(res.statusCode).toBe(201);
  });

  it('Step 3: Creates task on team board', async () => {
    const res = await server.inject({
      method: 'POST',
      url: `/api/teams/${teamSlug}/tasks`,
      headers: { 'x-test-user-id': ownerId },
      payload: { title: 'Research competitor pricing', priority: 'high' },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.title).toBe('Research competitor pricing');
    expect(body.priority).toBe('high');
    expect(body.status).toBe('open');
  });

  it('Step 4: Sends Waggle Dance message', async () => {
    const res = await server.inject({
      method: 'POST',
      url: `/api/teams/${teamSlug}/messages`,
      headers: { 'x-test-user-id': ownerId },
      payload: {
        type: 'request',
        subtype: 'knowledge_check',
        content: { topic: 'competitor pricing' },
      },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.type).toBe('request');
    expect(body.subtype).toBe('knowledge_check');
  });

  it('Step 5: Shares knowledge entity to team graph', async () => {
    const res = await server.inject({
      method: 'POST',
      url: `/api/teams/${teamSlug}/entities`,
      headers: { 'x-test-user-id': ownerId },
      payload: { entityType: 'competitor', name: 'Acme Corp', properties: { pricing: '$99/mo' } },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.entityType).toBe('competitor');
    expect(body.name).toBe('Acme Corp');
  });

  it('Step 6: Shares team resource', async () => {
    const res = await server.inject({
      method: 'POST',
      url: `/api/teams/${teamSlug}/resources`,
      headers: { 'x-test-user-id': ownerId },
      payload: {
        resourceType: 'model_recipe',
        name: 'Fast Research Config',
        config: { model: 'claude-haiku-4-5', temperature: 0.3 },
      },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.resourceType).toBe('model_recipe');
    expect(body.name).toBe('Fast Research Config');
  });

  it('Step 7: Creates audit trail entry', async () => {
    const { AuditService } = await import('../../packages/server/src/services/audit-service.js');
    const auditService = new AuditService(server.db);
    const entry = await auditService.log({
      userId: ownerId,
      teamId,
      agentName: 'memory-weaver',
      actionType: 'consolidation',
      description: 'Consolidated meeting notes',
    });
    expect(entry.agentName).toBe('memory-weaver');

    // Verify via admin API
    // First promote owner to admin role (owner already has admin+ perms)
    const res = await server.inject({
      method: 'GET',
      url: `/api/admin/teams/${teamSlug}/audit`,
      headers: { 'x-test-user-id': ownerId },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.length).toBeGreaterThanOrEqual(1);
  });

  it('Step 8: Member cannot access admin audit endpoint', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/api/admin/teams/${teamSlug}/audit`,
      headers: { 'x-test-user-id': memberId },
    });
    expect(res.statusCode).toBe(403);
  });

  it('Step 9: Lists tasks, messages, entities for the team', async () => {
    // Tasks
    const tasksRes = await server.inject({
      method: 'GET',
      url: `/api/teams/${teamSlug}/tasks`,
      headers: { 'x-test-user-id': memberId },
    });
    expect(tasksRes.statusCode).toBe(200);
    expect(JSON.parse(tasksRes.body).length).toBeGreaterThanOrEqual(1);

    // Messages
    const msgsRes = await server.inject({
      method: 'GET',
      url: `/api/teams/${teamSlug}/messages`,
      headers: { 'x-test-user-id': memberId },
    });
    expect(msgsRes.statusCode).toBe(200);
    expect(JSON.parse(msgsRes.body).length).toBeGreaterThanOrEqual(1);

    // Entities
    const entRes = await server.inject({
      method: 'GET',
      url: `/api/teams/${teamSlug}/entities`,
      headers: { 'x-test-user-id': memberId },
    });
    expect(entRes.statusCode).toBe(200);
    expect(JSON.parse(entRes.body).length).toBeGreaterThanOrEqual(1);
  });

  it('Step 10: Health check passes', async () => {
    const res = await server.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).status).toBe('ok');
  });
});
