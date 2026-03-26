import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../../src/index.js';
import { users, teams, teamMembers } from '../../src/db/schema.js';
import { sql } from 'drizzle-orm';

describe('Team API', () => {
  let server: Awaited<ReturnType<typeof buildServer>>;
  let ownerId: string;
  let memberId: string;
  let adminId: string;

  beforeAll(async () => {
    server = await buildServer();

    // Clean up any leftover test data (use unique prefix to avoid collision with auth tests)
    await server.db.execute(sql`DELETE FROM team_members WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE 'test-%')`);
    await server.db.execute(sql`DELETE FROM team_capability_requests WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE 'test-%')`);
    await server.db.execute(sql`DELETE FROM team_capability_overrides WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE 'test-%')`);
    await server.db.execute(sql`DELETE FROM team_capability_policies WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE 'test-%')`);
    await server.db.execute(sql`DELETE FROM teams WHERE slug LIKE 'test-%'`);
    await server.db.execute(sql`DELETE FROM users WHERE clerk_id LIKE 'tmtest_%'`);

    // Create test users directly in DB (clerk IDs use 'tmtest_' prefix to avoid auth test cleanup)
    const [owner] = await server.db.insert(users).values({
      clerkId: 'tmtest_owner',
      displayName: 'Team Owner',
      email: 'teamowner@test.com',
    }).returning();
    ownerId = owner.id;

    const [member] = await server.db.insert(users).values({
      clerkId: 'tmtest_member',
      displayName: 'Team Member',
      email: 'teammember@test.com',
    }).returning();
    memberId = member.id;

    const [admin] = await server.db.insert(users).values({
      clerkId: 'tmtest_admin',
      displayName: 'Team Admin',
      email: 'teamadmin@test.com',
    }).returning();
    adminId = admin.id;

    // Override auth handler to use x-test-user-id header (via indirection object)
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
    await server.db.execute(sql`DELETE FROM team_members WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE 'test-%')`);
    await server.db.execute(sql`DELETE FROM team_capability_requests WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE 'test-%')`);
    await server.db.execute(sql`DELETE FROM team_capability_overrides WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE 'test-%')`);
    await server.db.execute(sql`DELETE FROM team_capability_policies WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE 'test-%')`);
    await server.db.execute(sql`DELETE FROM teams WHERE slug LIKE 'test-%'`);
    await server.db.execute(sql`DELETE FROM users WHERE clerk_id LIKE 'tmtest_%'`);
    await server.close();
  });

  it('creates a team and auto-adds owner as member with role owner', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/api/teams',
      headers: { 'x-test-user-id': ownerId },
      payload: { name: 'Test Team', slug: 'test-team-crud' },
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    expect(body.name).toBe('Test Team');
    expect(body.slug).toBe('test-team-crud');
    expect(body.ownerId).toBe(ownerId);

    // Verify owner membership
    const [membership] = await server.db
      .select()
      .from(teamMembers)
      .where(sql`team_id = ${body.id} AND user_id = ${ownerId}`);
    expect(membership).toBeDefined();
    expect(membership.role).toBe('owner');
  });

  it('returns 409 on duplicate slug', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/api/teams',
      headers: { 'x-test-user-id': ownerId },
      payload: { name: 'Another Team', slug: 'test-team-crud' },
    });

    expect(response.statusCode).toBe(409);
  });

  it('lists only teams the user belongs to', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/api/teams',
      headers: { 'x-test-user-id': ownerId },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(Array.isArray(body)).toBe(true);
    const slugs = body.map((t: any) => t.slug);
    expect(slugs).toContain('test-team-crud');
  });

  it('non-member gets empty list', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/api/teams',
      headers: { 'x-test-user-id': memberId },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    // memberId is not a member of any team with test- slug yet
    const testTeams = body.filter((t: any) => t.slug.startsWith('test-'));
    expect(testTeams).toHaveLength(0);
  });

  it('gets team by slug with members', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/api/teams/test-team-crud',
      headers: { 'x-test-user-id': ownerId },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.slug).toBe('test-team-crud');
    expect(body.members).toBeDefined();
    expect(body.members.length).toBeGreaterThanOrEqual(1);
    expect(body.members[0].displayName).toBe('Team Owner');
  });

  it('non-member gets 403 when accessing team', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/api/teams/test-team-crud',
      headers: { 'x-test-user-id': memberId },
    });

    expect(response.statusCode).toBe(403);
  });

  it('adds a member via invite (admin+)', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/api/teams/test-team-crud/members',
      headers: { 'x-test-user-id': ownerId },
      payload: { email: 'teammember@test.com', role: 'member' },
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    expect(body.userId).toBe(memberId);
    expect(body.role).toBe('member');
  });

  it('returns 409 when inviting existing member', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/api/teams/test-team-crud/members',
      headers: { 'x-test-user-id': ownerId },
      payload: { email: 'teammember@test.com', role: 'member' },
    });

    expect(response.statusCode).toBe(409);
  });

  it('adds an admin member', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/api/teams/test-team-crud/members',
      headers: { 'x-test-user-id': ownerId },
      payload: { email: 'teamadmin@test.com', role: 'admin' },
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    expect(body.role).toBe('admin');
  });

  it('member can update own roleDescription and interests', async () => {
    const response = await server.inject({
      method: 'PATCH',
      url: `/api/teams/test-team-crud/members/${memberId}`,
      headers: { 'x-test-user-id': memberId },
      payload: {
        roleDescription: 'Frontend developer',
        interests: ['React', 'TypeScript'],
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.roleDescription).toBe('Frontend developer');
    expect(body.interests).toEqual(['React', 'TypeScript']);
  });

  it('member cannot change own role', async () => {
    // Attempting to change role requires admin, but member is only 'member'
    const response = await server.inject({
      method: 'PATCH',
      url: `/api/teams/test-team-crud/members/${memberId}`,
      headers: { 'x-test-user-id': memberId },
      payload: { role: 'admin' },
    });

    expect(response.statusCode).toBe(403);
  });

  it('admin can update team name', async () => {
    const response = await server.inject({
      method: 'PATCH',
      url: '/api/teams/test-team-crud',
      headers: { 'x-test-user-id': adminId },
      payload: { name: 'Updated Team Name' },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.name).toBe('Updated Team Name');
  });

  it('member cannot update team name', async () => {
    const response = await server.inject({
      method: 'PATCH',
      url: '/api/teams/test-team-crud',
      headers: { 'x-test-user-id': memberId },
      payload: { name: 'Should Fail' },
    });

    expect(response.statusCode).toBe(403);
  });

  it('cannot remove the team owner', async () => {
    const response = await server.inject({
      method: 'DELETE',
      url: `/api/teams/test-team-crud/members/${ownerId}`,
      headers: { 'x-test-user-id': ownerId },
    });

    expect(response.statusCode).toBe(403);
  });

  it('admin can remove a member', async () => {
    const response = await server.inject({
      method: 'DELETE',
      url: `/api/teams/test-team-crud/members/${memberId}`,
      headers: { 'x-test-user-id': adminId },
    });

    expect(response.statusCode).toBe(204);

    // Verify member is gone
    const checkResponse = await server.inject({
      method: 'GET',
      url: '/api/teams/test-team-crud',
      headers: { 'x-test-user-id': ownerId },
    });
    const body = JSON.parse(checkResponse.body);
    const memberIds = body.members.map((m: any) => m.userId);
    expect(memberIds).not.toContain(memberId);
  });

  it('returns 401 without auth header', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/api/teams',
    });

    expect(response.statusCode).toBe(401);
  });
});
