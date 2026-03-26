import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../../src/index.js';
import { users, teams, teamMembers, teamEntities, teamRelations } from '../../src/db/schema.js';
import { sql } from 'drizzle-orm';

describe('Team Knowledge Graph API', () => {
  let server: Awaited<ReturnType<typeof buildServer>>;
  let ownerId: string;
  let memberId: string;
  let outsiderId: string;
  let teamSlug: string;
  let teamId: string;

  beforeAll(async () => {
    server = await buildServer();

    // Clean up any leftover test data
    await server.db.execute(sql`DELETE FROM team_relations WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE 'kgtest-%')`);
    await server.db.execute(sql`DELETE FROM team_entities WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE 'kgtest-%')`);
    await server.db.execute(sql`DELETE FROM team_members WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE 'kgtest-%')`);
    await server.db.execute(sql`DELETE FROM team_capability_requests WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE 'kgtest-%')`);
    await server.db.execute(sql`DELETE FROM team_capability_overrides WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE 'kgtest-%')`);
    await server.db.execute(sql`DELETE FROM team_capability_policies WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE 'kgtest-%')`);
    await server.db.execute(sql`DELETE FROM teams WHERE slug LIKE 'kgtest-%'`);
    await server.db.execute(sql`DELETE FROM users WHERE clerk_id LIKE 'kgtest_%'`);

    // Create test users
    const [owner] = await server.db.insert(users).values({
      clerkId: 'kgtest_owner',
      displayName: 'KG Owner',
      email: 'kgtest_owner@test.com',
    }).returning();
    ownerId = owner.id;

    const [member] = await server.db.insert(users).values({
      clerkId: 'kgtest_member',
      displayName: 'KG Member',
      email: 'kgtest_member@test.com',
    }).returning();
    memberId = member.id;

    const [outsider] = await server.db.insert(users).values({
      clerkId: 'kgtest_outsider',
      displayName: 'KG Outsider',
      email: 'kgtest_outsider@test.com',
    }).returning();
    outsiderId = outsider.id;

    // Create a team with owner + member
    const [team] = await server.db.insert(teams).values({
      name: 'KG Test Team',
      slug: 'kgtest-knowledge',
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
    await server.db.execute(sql`DELETE FROM team_relations WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE 'kgtest-%')`);
    await server.db.execute(sql`DELETE FROM team_entities WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE 'kgtest-%')`);
    await server.db.execute(sql`DELETE FROM team_members WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE 'kgtest-%')`);
    await server.db.execute(sql`DELETE FROM team_capability_requests WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE 'kgtest-%')`);
    await server.db.execute(sql`DELETE FROM team_capability_overrides WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE 'kgtest-%')`);
    await server.db.execute(sql`DELETE FROM team_capability_policies WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE 'kgtest-%')`);
    await server.db.execute(sql`DELETE FROM teams WHERE slug LIKE 'kgtest-%'`);
    await server.db.execute(sql`DELETE FROM users WHERE clerk_id LIKE 'kgtest_%'`);
    await server.close();
  });

  it('creates an entity with properties and valid_from/valid_to', async () => {
    const response = await server.inject({
      method: 'POST',
      url: `/api/teams/${teamSlug}/entities`,
      headers: { 'x-test-user-id': ownerId },
      payload: {
        entityType: 'concept',
        name: 'Machine Learning',
        properties: { domain: 'AI', level: 'advanced' },
        validFrom: '2026-01-01T00:00:00.000Z',
        validTo: '2027-01-01T00:00:00.000Z',
      },
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    expect(body.entityType).toBe('concept');
    expect(body.name).toBe('Machine Learning');
    expect(body.properties).toEqual({ domain: 'AI', level: 'advanced' });
    expect(body.sharedBy).toBe(ownerId);
    expect(body.teamId).toBe(teamId);
    expect(body.validFrom).toBeTruthy();
    expect(body.validTo).toBeTruthy();
  });

  it('searches entities by type', async () => {
    // Create entities of different types
    await server.inject({
      method: 'POST',
      url: `/api/teams/${teamSlug}/entities`,
      headers: { 'x-test-user-id': ownerId },
      payload: { entityType: 'person', name: 'Alice' },
    });
    await server.inject({
      method: 'POST',
      url: `/api/teams/${teamSlug}/entities`,
      headers: { 'x-test-user-id': ownerId },
      payload: { entityType: 'person', name: 'Bob' },
    });

    const response = await server.inject({
      method: 'GET',
      url: `/api/teams/${teamSlug}/entities?type=person`,
      headers: { 'x-test-user-id': memberId },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThanOrEqual(2);
    expect(body.every((e: any) => e.entityType === 'person')).toBe(true);
  });

  it('searches entities by name (ILIKE)', async () => {
    const response = await server.inject({
      method: 'GET',
      url: `/api/teams/${teamSlug}/entities?search=machine`,
      headers: { 'x-test-user-id': memberId },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.length).toBeGreaterThanOrEqual(1);
    expect(body.some((e: any) => e.name === 'Machine Learning')).toBe(true);
  });

  it('creates a relation with confidence score', async () => {
    // Create two entities to relate
    const res1 = await server.inject({
      method: 'POST',
      url: `/api/teams/${teamSlug}/entities`,
      headers: { 'x-test-user-id': ownerId },
      payload: { entityType: 'tool', name: 'TensorFlow' },
    });
    const entity1 = JSON.parse(res1.body);

    const res2 = await server.inject({
      method: 'POST',
      url: `/api/teams/${teamSlug}/entities`,
      headers: { 'x-test-user-id': ownerId },
      payload: { entityType: 'concept', name: 'Deep Learning' },
    });
    const entity2 = JSON.parse(res2.body);

    const response = await server.inject({
      method: 'POST',
      url: `/api/teams/${teamSlug}/relations`,
      headers: { 'x-test-user-id': ownerId },
      payload: {
        sourceId: entity1.id,
        targetId: entity2.id,
        relationType: 'implements',
        confidence: 0.95,
        properties: { since: '2015' },
      },
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    expect(body.sourceId).toBe(entity1.id);
    expect(body.targetId).toBe(entity2.id);
    expect(body.relationType).toBe('implements');
    expect(body.confidence).toBeCloseTo(0.95);
    expect(body.teamId).toBe(teamId);
  });

  it('graph traversal returns connected entities up to depth N', async () => {
    // Create a chain: A -> B -> C
    const resA = await server.inject({
      method: 'POST',
      url: `/api/teams/${teamSlug}/entities`,
      headers: { 'x-test-user-id': ownerId },
      payload: { entityType: 'node', name: 'Node-A' },
    });
    const nodeA = JSON.parse(resA.body);

    const resB = await server.inject({
      method: 'POST',
      url: `/api/teams/${teamSlug}/entities`,
      headers: { 'x-test-user-id': ownerId },
      payload: { entityType: 'node', name: 'Node-B' },
    });
    const nodeB = JSON.parse(resB.body);

    const resC = await server.inject({
      method: 'POST',
      url: `/api/teams/${teamSlug}/entities`,
      headers: { 'x-test-user-id': ownerId },
      payload: { entityType: 'node', name: 'Node-C' },
    });
    const nodeC = JSON.parse(resC.body);

    // A -> B
    await server.inject({
      method: 'POST',
      url: `/api/teams/${teamSlug}/relations`,
      headers: { 'x-test-user-id': ownerId },
      payload: { sourceId: nodeA.id, targetId: nodeB.id, relationType: 'links_to' },
    });

    // B -> C
    await server.inject({
      method: 'POST',
      url: `/api/teams/${teamSlug}/relations`,
      headers: { 'x-test-user-id': ownerId },
      payload: { sourceId: nodeB.id, targetId: nodeC.id, relationType: 'links_to' },
    });

    // Depth 1: should find A and B only
    const res1 = await server.inject({
      method: 'GET',
      url: `/api/teams/${teamSlug}/graph?startId=${nodeA.id}&depth=1`,
      headers: { 'x-test-user-id': ownerId },
    });
    expect(res1.statusCode).toBe(200);
    const graph1 = JSON.parse(res1.body);
    const entityIds1 = graph1.entities.map((e: any) => e.id);
    expect(entityIds1).toContain(nodeA.id);
    expect(entityIds1).toContain(nodeB.id);
    expect(entityIds1).not.toContain(nodeC.id);

    // Depth 2: should find A, B, and C
    const res2 = await server.inject({
      method: 'GET',
      url: `/api/teams/${teamSlug}/graph?startId=${nodeA.id}&depth=2`,
      headers: { 'x-test-user-id': ownerId },
    });
    expect(res2.statusCode).toBe(200);
    const graph2 = JSON.parse(res2.body);
    const entityIds2 = graph2.entities.map((e: any) => e.id);
    expect(entityIds2).toContain(nodeA.id);
    expect(entityIds2).toContain(nodeB.id);
    expect(entityIds2).toContain(nodeC.id);
    expect(graph2.relations.length).toBeGreaterThanOrEqual(2);
  });

  it('shared_by tracks who contributed', async () => {
    // Owner creates entity
    const res1 = await server.inject({
      method: 'POST',
      url: `/api/teams/${teamSlug}/entities`,
      headers: { 'x-test-user-id': ownerId },
      payload: { entityType: 'doc', name: 'Owner Doc' },
    });
    expect(JSON.parse(res1.body).sharedBy).toBe(ownerId);

    // Member creates entity
    const res2 = await server.inject({
      method: 'POST',
      url: `/api/teams/${teamSlug}/entities`,
      headers: { 'x-test-user-id': memberId },
      payload: { entityType: 'doc', name: 'Member Doc' },
    });
    expect(JSON.parse(res2.body).sharedBy).toBe(memberId);
  });

  it('non-member gets 403', async () => {
    const response = await server.inject({
      method: 'GET',
      url: `/api/teams/${teamSlug}/entities`,
      headers: { 'x-test-user-id': outsiderId },
    });

    expect(response.statusCode).toBe(403);
  });
});
