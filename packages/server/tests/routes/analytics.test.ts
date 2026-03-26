import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../../src/index.js';
import { users, teams, teamMembers, agentAuditLog, agentJobs, teamCapabilityRequests } from '../../src/db/schema.js';
import { sql } from 'drizzle-orm';

describe('Analytics API', () => {
  let server: Awaited<ReturnType<typeof buildServer>>;
  let ownerId: string;
  let memberId: string;
  let teamId: string;

  beforeAll(async () => {
    server = await buildServer();

    // Clean up any leftover test data
    await server.db.execute(sql`DELETE FROM agent_audit_log WHERE agent_name = 'analytics-test'`);
    await server.db.execute(sql`DELETE FROM agent_jobs WHERE job_type = 'analytics-test'`);
    await server.db.execute(sql`DELETE FROM team_capability_requests WHERE justification = 'analytics-test'`);
    await server.db.execute(sql`DELETE FROM team_members WHERE team_id IN (SELECT id FROM teams WHERE slug = 'test-analytics')`);
    await server.db.execute(sql`DELETE FROM team_capability_policies WHERE team_id IN (SELECT id FROM teams WHERE slug = 'test-analytics')`);
    await server.db.execute(sql`DELETE FROM teams WHERE slug = 'test-analytics'`);
    await server.db.execute(sql`DELETE FROM users WHERE clerk_id LIKE 'antest_%'`);

    // Create test users
    const [owner] = await server.db.insert(users).values({
      clerkId: 'antest_owner',
      displayName: 'Analytics Owner',
      email: 'analytics-owner@test.com',
    }).returning();
    ownerId = owner.id;

    const [member] = await server.db.insert(users).values({
      clerkId: 'antest_member',
      displayName: 'Analytics Member',
      email: 'analytics-member@test.com',
    }).returning();
    memberId = member.id;

    // Create team
    const [team] = await server.db.insert(teams).values({
      name: 'Analytics Test Team',
      slug: 'test-analytics',
      ownerId,
    }).returning();
    teamId = team.id;

    // Add members
    await server.db.insert(teamMembers).values([
      { teamId, userId: ownerId, role: 'owner' },
      { teamId, userId: memberId, role: 'member' },
    ]);

    // Override auth handler for tests
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
    await server.db.execute(sql`DELETE FROM agent_audit_log WHERE agent_name = 'analytics-test'`);
    await server.db.execute(sql`DELETE FROM agent_jobs WHERE job_type = 'analytics-test'`);
    await server.db.execute(sql`DELETE FROM team_capability_requests WHERE justification = 'analytics-test'`);
    await server.db.execute(sql`DELETE FROM team_members WHERE team_id IN (SELECT id FROM teams WHERE slug = 'test-analytics')`);
    await server.db.execute(sql`DELETE FROM team_capability_policies WHERE team_id IN (SELECT id FROM teams WHERE slug = 'test-analytics')`);
    await server.db.execute(sql`DELETE FROM teams WHERE slug = 'test-analytics'`);
    await server.db.execute(sql`DELETE FROM users WHERE clerk_id LIKE 'antest_%'`);
    await server.close();
  });

  it('GET /api/admin/teams/:slug/analytics returns correct shape with zeroes for empty data', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/api/admin/teams/test-analytics/analytics',
      headers: { 'x-test-user-id': ownerId },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);

    // Verify top-level shape
    expect(body).toHaveProperty('activeUsers');
    expect(body).toHaveProperty('tokenUsage');
    expect(body).toHaveProperty('topTools');
    expect(body).toHaveProperty('topCommands');
    expect(body).toHaveProperty('capabilityGaps');
    expect(body).toHaveProperty('performanceTrends');

    // activeUsers shape
    expect(body.activeUsers).toHaveProperty('daily');
    expect(body.activeUsers).toHaveProperty('weekly');
    expect(body.activeUsers).toHaveProperty('monthly');
    expect(typeof body.activeUsers.daily).toBe('number');
    expect(typeof body.activeUsers.weekly).toBe('number');
    expect(typeof body.activeUsers.monthly).toBe('number');

    // tokenUsage shape
    expect(typeof body.tokenUsage.total).toBe('number');
    expect(Array.isArray(body.tokenUsage.byUser)).toBe(true);

    // topTools and topCommands are arrays
    expect(Array.isArray(body.topTools)).toBe(true);
    expect(Array.isArray(body.topCommands)).toBe(true);
    expect(Array.isArray(body.capabilityGaps)).toBe(true);

    // performanceTrends shape
    expect(typeof body.performanceTrends.correctionRate).toBe('number');
    expect(typeof body.performanceTrends.correctionTrend).toBe('number');
    expect(typeof body.performanceTrends.avgResponseTime).toBe('number');

    // With no activity, everything should be zeroes
    expect(body.activeUsers.daily).toBe(0);
    expect(body.activeUsers.weekly).toBe(0);
    expect(body.activeUsers.monthly).toBe(0);
    expect(body.tokenUsage.total).toBe(0);
    expect(body.topTools).toHaveLength(0);
    expect(body.topCommands).toHaveLength(0);
    expect(body.capabilityGaps).toHaveLength(0);
    expect(body.performanceTrends.correctionRate).toBe(0);
    expect(body.performanceTrends.avgResponseTime).toBe(0);
  });

  it('returns 401 without auth header', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/api/admin/teams/test-analytics/analytics',
    });

    expect(response.statusCode).toBe(401);
  });

  it('returns 403 for non-admin member', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/api/admin/teams/test-analytics/analytics',
      headers: { 'x-test-user-id': memberId },
    });

    expect(response.statusCode).toBe(403);
  });

  it('returns 404 for non-existent team', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/api/admin/teams/nonexistent-team/analytics',
      headers: { 'x-test-user-id': ownerId },
    });

    expect(response.statusCode).toBe(404);
  });

  it('returns data when audit log entries exist', async () => {
    // Insert some audit log entries
    await server.db.insert(agentAuditLog).values([
      {
        userId: ownerId,
        teamId,
        agentName: 'analytics-test',
        actionType: 'web_search',
        description: 'test search 1',
      },
      {
        userId: ownerId,
        teamId,
        agentName: 'analytics-test',
        actionType: 'web_search',
        description: 'test search 2',
      },
      {
        userId: ownerId,
        teamId,
        agentName: 'analytics-test',
        actionType: 'save_memory',
        description: 'test memory save',
      },
      {
        userId: ownerId,
        teamId,
        agentName: 'analytics-test',
        actionType: 'command:/research',
        description: 'test command',
      },
    ]);

    const response = await server.inject({
      method: 'GET',
      url: '/api/admin/teams/test-analytics/analytics',
      headers: { 'x-test-user-id': ownerId },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);

    // Should detect the active user
    expect(body.activeUsers.daily).toBeGreaterThanOrEqual(1);
    expect(body.activeUsers.weekly).toBeGreaterThanOrEqual(1);
    expect(body.activeUsers.monthly).toBeGreaterThanOrEqual(1);

    // Should show top tools
    expect(body.topTools.length).toBeGreaterThanOrEqual(1);
    const webSearch = body.topTools.find((t: any) => t.name === 'web_search');
    expect(webSearch).toBeDefined();
    expect(webSearch.invocations).toBeGreaterThanOrEqual(2);

    // Should show top commands
    expect(body.topCommands.length).toBeGreaterThanOrEqual(1);
    const research = body.topCommands.find((c: any) => c.name === '/research');
    expect(research).toBeDefined();
    expect(research.count).toBeGreaterThanOrEqual(1);
  });

  it('returns capability gaps from pending requests', async () => {
    // Insert a pending capability request
    await server.db.insert(teamCapabilityRequests).values({
      teamId,
      requestedBy: memberId,
      capabilityName: 'email_send',
      capabilityType: 'tool',
      justification: 'analytics-test',
      status: 'pending',
    });

    const response = await server.inject({
      method: 'GET',
      url: '/api/admin/teams/test-analytics/analytics',
      headers: { 'x-test-user-id': ownerId },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);

    expect(body.capabilityGaps.length).toBeGreaterThanOrEqual(1);
    const emailGap = body.capabilityGaps.find((g: any) => g.tool === 'email_send');
    expect(emailGap).toBeDefined();
    expect(emailGap.requestCount).toBeGreaterThanOrEqual(1);
    expect(emailGap.suggestion).toContain('email_send');
  });

  it('includes byUser token estimates in tokenUsage', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/api/admin/teams/test-analytics/analytics',
      headers: { 'x-test-user-id': ownerId },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);

    // byUser should include team members
    expect(body.tokenUsage.byUser.length).toBeGreaterThanOrEqual(1);
    const ownerEntry = body.tokenUsage.byUser.find((u: any) => u.userId === ownerId);
    expect(ownerEntry).toBeDefined();
    expect(ownerEntry.name).toBe('Analytics Owner');
    expect(typeof ownerEntry.tokens).toBe('number');
    expect(typeof ownerEntry.cost).toBe('number');
  });
});
