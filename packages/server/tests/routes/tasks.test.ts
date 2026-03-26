import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../../src/index.js';
import { users, teams, teamMembers, tasks } from '../../src/db/schema.js';
import { sql } from 'drizzle-orm';

describe('Task Board API', () => {
  let server: Awaited<ReturnType<typeof buildServer>>;
  let ownerId: string;
  let memberId: string;
  let outsiderId: string;
  let teamSlug: string;
  let teamId: string;
  let createdTaskId: string;

  beforeAll(async () => {
    server = await buildServer();

    // Clean up any leftover test data
    await server.db.execute(sql`DELETE FROM tasks WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE 'tstest-%')`);
    await server.db.execute(sql`DELETE FROM team_members WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE 'tstest-%')`);
    await server.db.execute(sql`DELETE FROM team_capability_requests WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE 'tstest-%')`);
    await server.db.execute(sql`DELETE FROM team_capability_overrides WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE 'tstest-%')`);
    await server.db.execute(sql`DELETE FROM team_capability_policies WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE 'tstest-%')`);
    await server.db.execute(sql`DELETE FROM teams WHERE slug LIKE 'tstest-%'`);
    await server.db.execute(sql`DELETE FROM users WHERE clerk_id LIKE 'tstest_%'`);

    // Create test users
    const [owner] = await server.db.insert(users).values({
      clerkId: 'tstest_owner',
      displayName: 'Task Owner',
      email: 'tstest_owner@test.com',
    }).returning();
    ownerId = owner.id;

    const [member] = await server.db.insert(users).values({
      clerkId: 'tstest_member',
      displayName: 'Task Member',
      email: 'tstest_member@test.com',
    }).returning();
    memberId = member.id;

    const [outsider] = await server.db.insert(users).values({
      clerkId: 'tstest_outsider',
      displayName: 'Task Outsider',
      email: 'tstest_outsider@test.com',
    }).returning();
    outsiderId = outsider.id;

    // Create a team with owner + member
    const [team] = await server.db.insert(teams).values({
      name: 'Task Test Team',
      slug: 'tstest-tasks',
      ownerId,
    }).returning();
    teamId = team.id;
    teamSlug = team.slug;

    await server.db.insert(teamMembers).values([
      { teamId, userId: ownerId, role: 'owner' },
      { teamId, userId: memberId, role: 'member' },
    ]);

    // Override auth handler
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
    await server.db.execute(sql`DELETE FROM tasks WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE 'tstest-%')`);
    await server.db.execute(sql`DELETE FROM team_members WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE 'tstest-%')`);
    await server.db.execute(sql`DELETE FROM team_capability_requests WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE 'tstest-%')`);
    await server.db.execute(sql`DELETE FROM team_capability_overrides WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE 'tstest-%')`);
    await server.db.execute(sql`DELETE FROM team_capability_policies WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE 'tstest-%')`);
    await server.db.execute(sql`DELETE FROM teams WHERE slug LIKE 'tstest-%'`);
    await server.db.execute(sql`DELETE FROM users WHERE clerk_id LIKE 'tstest_%'`);
    await server.close();
  });

  it('creates a task on team board', async () => {
    const response = await server.inject({
      method: 'POST',
      url: `/api/teams/${teamSlug}/tasks`,
      headers: { 'x-test-user-id': ownerId },
      payload: { title: 'Research competitors', description: 'Analyze top 5 competitors', priority: 'high' },
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    expect(body.title).toBe('Research competitors');
    expect(body.description).toBe('Analyze top 5 competitors');
    expect(body.priority).toBe('high');
    expect(body.status).toBe('open');
    expect(body.createdBy).toBe(ownerId);
    expect(body.teamId).toBe(teamId);
    createdTaskId = body.id;
  });

  it('lists tasks on team board', async () => {
    const response = await server.inject({
      method: 'GET',
      url: `/api/teams/${teamSlug}/tasks`,
      headers: { 'x-test-user-id': memberId },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThanOrEqual(1);
    expect(body.some((t: any) => t.id === createdTaskId)).toBe(true);
  });

  it('lists tasks with status filter', async () => {
    // Create a second task and mark it done
    const createRes = await server.inject({
      method: 'POST',
      url: `/api/teams/${teamSlug}/tasks`,
      headers: { 'x-test-user-id': ownerId },
      payload: { title: 'Done task' },
    });
    const doneTask = JSON.parse(createRes.body);

    await server.inject({
      method: 'PATCH',
      url: `/api/teams/${teamSlug}/tasks/${doneTask.id}`,
      headers: { 'x-test-user-id': ownerId },
      payload: { status: 'done' },
    });

    // Filter by status=open
    const response = await server.inject({
      method: 'GET',
      url: `/api/teams/${teamSlug}/tasks?status=open`,
      headers: { 'x-test-user-id': memberId },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.every((t: any) => t.status === 'open')).toBe(true);
    expect(body.some((t: any) => t.id === doneTask.id)).toBe(false);
  });

  it('claims a task — sets assignedTo and status to claimed', async () => {
    const response = await server.inject({
      method: 'POST',
      url: `/api/teams/${teamSlug}/tasks/${createdTaskId}/claim`,
      headers: { 'x-test-user-id': memberId },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.assignedTo).toBe(memberId);
    expect(body.status).toBe('claimed');
  });

  it('completes a task — status changes to done', async () => {
    const response = await server.inject({
      method: 'PATCH',
      url: `/api/teams/${teamSlug}/tasks/${createdTaskId}`,
      headers: { 'x-test-user-id': memberId },
      payload: { status: 'done' },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.status).toBe('done');
  });

  it('creates a subtask with parentTaskId', async () => {
    const response = await server.inject({
      method: 'POST',
      url: `/api/teams/${teamSlug}/tasks`,
      headers: { 'x-test-user-id': ownerId },
      payload: { title: 'Sub-research item', parentTaskId: createdTaskId },
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    expect(body.parentTaskId).toBe(createdTaskId);
    expect(body.priority).toBe('normal');
  });

  it('non-team-member gets 403', async () => {
    const response = await server.inject({
      method: 'GET',
      url: `/api/teams/${teamSlug}/tasks`,
      headers: { 'x-test-user-id': outsiderId },
    });

    expect(response.statusCode).toBe(403);
  });

  it('gets a single task by id', async () => {
    const response = await server.inject({
      method: 'GET',
      url: `/api/teams/${teamSlug}/tasks/${createdTaskId}`,
      headers: { 'x-test-user-id': ownerId },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.id).toBe(createdTaskId);
    expect(body.title).toBe('Research competitors');
  });
});
