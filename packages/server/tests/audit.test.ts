import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../src/index.js';
import { users, teams, teamMembers, agentAuditLog } from '../src/db/schema.js';
import { sql } from 'drizzle-orm';
import { AuditService } from '../src/services/audit-service.js';

describe('Audit & Traceability (Task 3.23)', () => {
  let server: Awaited<ReturnType<typeof buildServer>>;
  let ownerId: string;
  let memberId: string;
  let teamSlug: string;
  let teamId: string;

  beforeAll(async () => {
    server = await buildServer();

    // Clean up leftover test data
    await server.db.execute(sql`DELETE FROM agent_audit_log WHERE user_id IN (SELECT id FROM users WHERE clerk_id LIKE 'audit_%')`);
    await server.db.execute(sql`DELETE FROM team_members WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE 'audit-%')`);
    await server.db.execute(sql`DELETE FROM team_capability_requests WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE 'audit-%')`);
    await server.db.execute(sql`DELETE FROM team_capability_overrides WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE 'audit-%')`);
    await server.db.execute(sql`DELETE FROM team_capability_policies WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE 'audit-%')`);
    await server.db.execute(sql`DELETE FROM teams WHERE slug LIKE 'audit-%'`);
    await server.db.execute(sql`DELETE FROM users WHERE clerk_id LIKE 'audit_%'`);

    // Create test users
    const [owner] = await server.db.insert(users).values({
      clerkId: 'audit_owner',
      displayName: 'Audit Owner',
      email: 'audit_owner@test.com',
    }).returning();
    ownerId = owner.id;

    const [member] = await server.db.insert(users).values({
      clerkId: 'audit_member',
      displayName: 'Audit Member',
      email: 'audit_member@test.com',
    }).returning();
    memberId = member.id;

    // Create team
    const [team] = await server.db.insert(teams).values({
      name: 'Audit Test Team',
      slug: 'audit-test',
      ownerId,
    }).returning();
    teamId = team.id;
    teamSlug = team.slug;

    await server.db.insert(teamMembers).values([
      { teamId, userId: ownerId, role: 'owner' },
      { teamId, userId: memberId, role: 'member' },
    ]);

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
    await server.db.execute(sql`DELETE FROM agent_audit_log WHERE user_id IN (SELECT id FROM users WHERE clerk_id LIKE 'audit_%')`);
    await server.db.execute(sql`DELETE FROM team_members WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE 'audit-%')`);
    await server.db.execute(sql`DELETE FROM team_capability_requests WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE 'audit-%')`);
    await server.db.execute(sql`DELETE FROM team_capability_overrides WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE 'audit-%')`);
    await server.db.execute(sql`DELETE FROM team_capability_policies WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE 'audit-%')`);
    await server.db.execute(sql`DELETE FROM teams WHERE slug LIKE 'audit-%'`);
    await server.db.execute(sql`DELETE FROM users WHERE clerk_id LIKE 'audit_%'`);
    await server.close();
  });

  it('logs an audit entry via AuditService', async () => {
    const auditService = new AuditService(server.db);
    const entry = await auditService.log({
      userId: ownerId,
      teamId,
      agentName: 'memory-weaver',
      actionType: 'consolidation',
      description: 'Consolidated 5 memory fragments into 1 summary',
      beforeState: { fragmentCount: 5 },
      afterState: { summaryId: 'abc123' },
    });

    expect(entry).toBeDefined();
    expect(entry.agentName).toBe('memory-weaver');
    expect(entry.actionType).toBe('consolidation');
    expect(entry.description).toBe('Consolidated 5 memory fragments into 1 summary');
    expect(entry.beforeState).toEqual({ fragmentCount: 5 });
    expect(entry.afterState).toEqual({ summaryId: 'abc123' });
    expect(entry.requiresApproval).toBe(false);
    expect(entry.approved).toBeNull();
  });

  it('lists audit entries for team', async () => {
    const response = await server.inject({
      method: 'GET',
      url: `/api/admin/teams/${teamSlug}/audit`,
      headers: { 'x-test-user-id': ownerId },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThanOrEqual(1);
    expect(body[0].agentName).toBe('memory-weaver');
  });

  it('filters by actionType', async () => {
    // Add another entry with different actionType
    const auditService = new AuditService(server.db);
    await auditService.log({
      userId: ownerId,
      teamId,
      agentName: 'scout',
      actionType: 'discovery',
      description: 'Found new relevant paper',
    });

    const response = await server.inject({
      method: 'GET',
      url: `/api/admin/teams/${teamSlug}/audit?actionType=discovery`,
      headers: { 'x-test-user-id': ownerId },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.length).toBe(1);
    expect(body[0].actionType).toBe('discovery');
    expect(body[0].agentName).toBe('scout');
  });

  it('approves a pending entry', async () => {
    const auditService = new AuditService(server.db);
    const pending = await auditService.log({
      userId: ownerId,
      teamId,
      agentName: 'hive-mind',
      actionType: 'share_knowledge',
      description: 'Share pricing analysis with team graph',
      requiresApproval: true,
    });

    const response = await server.inject({
      method: 'POST',
      url: `/api/admin/teams/${teamSlug}/audit/${pending.id}/approve`,
      headers: { 'x-test-user-id': ownerId },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.approved).toBe(true);
    expect(body.approvedBy).toBe(ownerId);
  });

  it('rejects a pending entry', async () => {
    const auditService = new AuditService(server.db);
    const pending = await auditService.log({
      userId: ownerId,
      teamId,
      agentName: 'subconscious',
      actionType: 'auto_task',
      description: 'Create follow-up task from meeting notes',
      requiresApproval: true,
    });

    const response = await server.inject({
      method: 'POST',
      url: `/api/admin/teams/${teamSlug}/audit/${pending.id}/reject`,
      headers: { 'x-test-user-id': ownerId },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.approved).toBe(false);
    expect(body.approvedBy).toBe(ownerId);
  });

  it('only team admins can access audit endpoints (non-admin gets 403)', async () => {
    const response = await server.inject({
      method: 'GET',
      url: `/api/admin/teams/${teamSlug}/audit`,
      headers: { 'x-test-user-id': memberId },
    });

    expect(response.statusCode).toBe(403);
    const body = JSON.parse(response.body);
    expect(body.error).toBe('Admin access required');
  });

  it('returns 404 for non-existent audit entry on approve', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const response = await server.inject({
      method: 'POST',
      url: `/api/admin/teams/${teamSlug}/audit/${fakeId}/approve`,
      headers: { 'x-test-user-id': ownerId },
    });

    expect(response.statusCode).toBe(404);
  });

  it('lists pending approvals', async () => {
    const auditService = new AuditService(server.db);
    // Create a new pending entry
    await auditService.log({
      userId: ownerId,
      teamId,
      agentName: 'hive-mind',
      actionType: 'bulk_share',
      description: 'Share 10 entities with team',
      requiresApproval: true,
    });

    const response = await server.inject({
      method: 'GET',
      url: `/api/admin/teams/${teamSlug}/audit/pending`,
      headers: { 'x-test-user-id': ownerId },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(Array.isArray(body)).toBe(true);
    // All returned entries should require approval and have null approved
    for (const entry of body) {
      expect(entry.requiresApproval).toBe(true);
      expect(entry.approved).toBeNull();
    }
  });
});
