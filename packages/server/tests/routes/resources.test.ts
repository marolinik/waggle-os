import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../../src/index.js';
import { users, teams, teamMembers, teamResources } from '../../src/db/schema.js';
import { sql } from 'drizzle-orm';

describe('Team Resources API', () => {
  let server: Awaited<ReturnType<typeof buildServer>>;
  let ownerId: string;
  let memberId: string;
  let outsiderId: string;
  let teamSlug: string;
  let teamId: string;

  beforeAll(async () => {
    server = await buildServer();

    // Clean up any leftover test data
    await server.db.execute(sql`DELETE FROM team_resources WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE 'restest-%')`);
    await server.db.execute(sql`DELETE FROM team_members WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE 'restest-%')`);
    await server.db.execute(sql`DELETE FROM team_capability_requests WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE 'restest-%')`);
    await server.db.execute(sql`DELETE FROM team_capability_overrides WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE 'restest-%')`);
    await server.db.execute(sql`DELETE FROM team_capability_policies WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE 'restest-%')`);
    await server.db.execute(sql`DELETE FROM teams WHERE slug LIKE 'restest-%'`);
    await server.db.execute(sql`DELETE FROM users WHERE clerk_id LIKE 'restest_%'`);

    // Create test users
    const [owner] = await server.db.insert(users).values({
      clerkId: 'restest_owner',
      displayName: 'Res Owner',
      email: 'restest_owner@test.com',
    }).returning();
    ownerId = owner.id;

    const [member] = await server.db.insert(users).values({
      clerkId: 'restest_member',
      displayName: 'Res Member',
      email: 'restest_member@test.com',
    }).returning();
    memberId = member.id;

    const [outsider] = await server.db.insert(users).values({
      clerkId: 'restest_outsider',
      displayName: 'Res Outsider',
      email: 'restest_outsider@test.com',
    }).returning();
    outsiderId = outsider.id;

    // Create a team with owner + member
    const [team] = await server.db.insert(teams).values({
      name: 'Res Test Team',
      slug: 'restest-resources',
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
    await server.db.execute(sql`DELETE FROM team_resources WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE 'restest-%')`);
    await server.db.execute(sql`DELETE FROM team_members WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE 'restest-%')`);
    await server.db.execute(sql`DELETE FROM team_capability_requests WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE 'restest-%')`);
    await server.db.execute(sql`DELETE FROM team_capability_overrides WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE 'restest-%')`);
    await server.db.execute(sql`DELETE FROM team_capability_policies WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE 'restest-%')`);
    await server.db.execute(sql`DELETE FROM teams WHERE slug LIKE 'restest-%'`);
    await server.db.execute(sql`DELETE FROM users WHERE clerk_id LIKE 'restest_%'`);
    await server.close();
  });

  it('shares a model_recipe resource', async () => {
    const response = await server.inject({
      method: 'POST',
      url: `/api/teams/${teamSlug}/resources`,
      headers: { 'x-test-user-id': ownerId },
      payload: {
        resourceType: 'model_recipe',
        name: 'GPT-4 Coding Recipe',
        description: 'Optimized for code generation',
        config: { model: 'gpt-4', temperature: 0.2 },
      },
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    expect(body.resourceType).toBe('model_recipe');
    expect(body.name).toBe('GPT-4 Coding Recipe');
    expect(body.description).toBe('Optimized for code generation');
    expect(body.config).toEqual({ model: 'gpt-4', temperature: 0.2 });
    expect(body.sharedBy).toBe(ownerId);
    expect(body.rating).toBe(0);
    expect(body.useCount).toBe(0);
  });

  it('shares a skill resource', async () => {
    const response = await server.inject({
      method: 'POST',
      url: `/api/teams/${teamSlug}/resources`,
      headers: { 'x-test-user-id': memberId },
      payload: {
        resourceType: 'skill',
        name: 'Code Review Skill',
        description: 'Automated code review with best practices',
        config: { language: 'typescript', rules: ['no-any', 'strict-null'] },
      },
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    expect(body.resourceType).toBe('skill');
    expect(body.name).toBe('Code Review Skill');
    expect(body.sharedBy).toBe(memberId);
  });

  it('rates a resource and updates running average', async () => {
    // Create a resource first
    const createRes = await server.inject({
      method: 'POST',
      url: `/api/teams/${teamSlug}/resources`,
      headers: { 'x-test-user-id': ownerId },
      payload: {
        resourceType: 'prompt_template',
        name: 'Summarizer Prompt',
        config: { template: 'Summarize: {{input}}' },
      },
    });
    const resource = JSON.parse(createRes.body);

    // First rating: should be the rating itself (useCount was 0)
    const rate1 = await server.inject({
      method: 'PATCH',
      url: `/api/teams/${teamSlug}/resources/${resource.id}`,
      headers: { 'x-test-user-id': ownerId },
      payload: { rating: 4 },
    });
    expect(rate1.statusCode).toBe(200);
    const body1 = JSON.parse(rate1.body);
    // After first rate: rating was set to 4 (useCount was 0), then useCount incremented to 1
    expect(body1.useCount).toBe(1);

    // Second rating: running average = (4 * 1 + 2) / 2 = 3
    const rate2 = await server.inject({
      method: 'PATCH',
      url: `/api/teams/${teamSlug}/resources/${resource.id}`,
      headers: { 'x-test-user-id': memberId },
      payload: { rating: 2 },
    });
    expect(rate2.statusCode).toBe(200);
    const body2 = JSON.parse(rate2.body);
    expect(body2.useCount).toBe(2);
    // rating = (4 * 1 + 2) / 2 = 3
    expect(body2.rating).toBeCloseTo(3, 1);
  });

  it('increments use_count on rate', async () => {
    const createRes = await server.inject({
      method: 'POST',
      url: `/api/teams/${teamSlug}/resources`,
      headers: { 'x-test-user-id': ownerId },
      payload: {
        resourceType: 'tool_config',
        name: 'Linter Config',
        config: { tool: 'eslint', extends: 'recommended' },
      },
    });
    const resource = JSON.parse(createRes.body);
    expect(resource.useCount).toBe(0);

    // Rate it
    const rateRes = await server.inject({
      method: 'PATCH',
      url: `/api/teams/${teamSlug}/resources/${resource.id}`,
      headers: { 'x-test-user-id': memberId },
      payload: { rating: 5 },
    });
    const rated = JSON.parse(rateRes.body);
    expect(rated.useCount).toBe(1);

    // Rate again
    const rateRes2 = await server.inject({
      method: 'PATCH',
      url: `/api/teams/${teamSlug}/resources/${resource.id}`,
      headers: { 'x-test-user-id': ownerId },
      payload: { rating: 3 },
    });
    const rated2 = JSON.parse(rateRes2.body);
    expect(rated2.useCount).toBe(2);
  });

  it('filters resources by resource_type', async () => {
    const response = await server.inject({
      method: 'GET',
      url: `/api/teams/${teamSlug}/resources?type=skill`,
      headers: { 'x-test-user-id': ownerId },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThanOrEqual(1);
    expect(body.every((r: any) => r.resourceType === 'skill')).toBe(true);
  });

  it('non-member gets 403', async () => {
    const response = await server.inject({
      method: 'GET',
      url: `/api/teams/${teamSlug}/resources`,
      headers: { 'x-test-user-id': outsiderId },
    });

    expect(response.statusCode).toBe(403);
  });
});
