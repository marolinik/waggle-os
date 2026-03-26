import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../../src/index.js';
import { users, teams, teamMembers, teamEntities, tasks, messages } from '../../src/db/schema.js';
import { sql } from 'drizzle-orm';

describe('Waggle Dance Messages API', () => {
  let server: Awaited<ReturnType<typeof buildServer>>;
  let ownerId: string;
  let memberId: string;
  let outsiderId: string;
  let teamSlug: string;
  let teamId: string;

  const SLUG_PREFIX = 'msgtest-';

  beforeAll(async () => {
    server = await buildServer();

    // Clean up any leftover test data (order matters for FK constraints)
    await server.db.execute(sql`DELETE FROM messages WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE ${SLUG_PREFIX + '%'})`);
    await server.db.execute(sql`DELETE FROM team_entities WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE ${SLUG_PREFIX + '%'})`);
    await server.db.execute(sql`DELETE FROM tasks WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE ${SLUG_PREFIX + '%'})`);
    await server.db.execute(sql`DELETE FROM team_members WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE ${SLUG_PREFIX + '%'})`);
    await server.db.execute(sql`DELETE FROM team_capability_requests WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE ${SLUG_PREFIX + '%'})`);
    await server.db.execute(sql`DELETE FROM team_capability_overrides WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE ${SLUG_PREFIX + '%'})`);
    await server.db.execute(sql`DELETE FROM team_capability_policies WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE ${SLUG_PREFIX + '%'})`);
    await server.db.execute(sql`DELETE FROM teams WHERE slug LIKE ${SLUG_PREFIX + '%'}`);
    await server.db.execute(sql`DELETE FROM users WHERE clerk_id LIKE 'msgtest_%'`);

    // Create test users
    const [owner] = await server.db.insert(users).values({
      clerkId: 'msgtest_owner',
      displayName: 'Msg Owner',
      email: 'msgtest_owner@test.com',
    }).returning();
    ownerId = owner.id;

    const [member] = await server.db.insert(users).values({
      clerkId: 'msgtest_member',
      displayName: 'Msg Member',
      email: 'msgtest_member@test.com',
    }).returning();
    memberId = member.id;

    const [outsider] = await server.db.insert(users).values({
      clerkId: 'msgtest_outsider',
      displayName: 'Msg Outsider',
      email: 'msgtest_outsider@test.com',
    }).returning();
    outsiderId = outsider.id;

    // Create a team with owner + member
    const [team] = await server.db.insert(teams).values({
      name: 'Msg Test Team',
      slug: `${SLUG_PREFIX}waggle`,
      ownerId,
    }).returning();
    teamId = team.id;
    teamSlug = team.slug;

    await server.db.insert(teamMembers).values([
      { teamId, userId: ownerId, role: 'owner' },
      { teamId, userId: memberId, role: 'member' },
    ]);

    // Seed some team_entities and tasks for hive-check tests
    await server.db.insert(teamEntities).values([
      { teamId, entityType: 'concept', name: 'Machine Learning', properties: { domain: 'AI' }, sharedBy: ownerId },
      { teamId, entityType: 'tool', name: 'TensorFlow', properties: { lang: 'python' }, sharedBy: memberId },
      { teamId, entityType: 'concept', name: 'Database Design', properties: { domain: 'engineering' }, sharedBy: ownerId },
    ]);

    await server.db.insert(tasks).values([
      { teamId, title: 'Implement ML pipeline', description: 'Build a machine learning pipeline', status: 'open', createdBy: ownerId },
      { teamId, title: 'Fix login bug', description: 'Login page crashes on mobile', status: 'done', createdBy: memberId },
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
    await server.db.execute(sql`DELETE FROM messages WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE ${SLUG_PREFIX + '%'})`);
    await server.db.execute(sql`DELETE FROM team_entities WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE ${SLUG_PREFIX + '%'})`);
    await server.db.execute(sql`DELETE FROM tasks WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE ${SLUG_PREFIX + '%'})`);
    await server.db.execute(sql`DELETE FROM team_members WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE ${SLUG_PREFIX + '%'})`);
    await server.db.execute(sql`DELETE FROM team_capability_requests WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE ${SLUG_PREFIX + '%'})`);
    await server.db.execute(sql`DELETE FROM team_capability_overrides WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE ${SLUG_PREFIX + '%'})`);
    await server.db.execute(sql`DELETE FROM team_capability_policies WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE ${SLUG_PREFIX + '%'})`);
    await server.db.execute(sql`DELETE FROM teams WHERE slug LIKE ${SLUG_PREFIX + '%'}`);
    await server.db.execute(sql`DELETE FROM users WHERE clerk_id LIKE 'msgtest_%'`);
    await server.close();
  });

  it('sends a broadcast message and returns 201', async () => {
    const response = await server.inject({
      method: 'POST',
      url: `/api/teams/${teamSlug}/messages`,
      headers: { 'x-test-user-id': ownerId },
      payload: {
        type: 'broadcast',
        subtype: 'discovery',
        content: { topic: 'New skill available', details: 'web-scraper v2' },
      },
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    expect(body.type).toBe('broadcast');
    expect(body.subtype).toBe('discovery');
    expect(body.content).toEqual({ topic: 'New skill available', details: 'web-scraper v2' });
    expect(body.senderId).toBe(ownerId);
    expect(body.teamId).toBe(teamId);
    expect(body.id).toBeDefined();
  });

  it('sends a request message with valid type-subtype combo', async () => {
    const response = await server.inject({
      method: 'POST',
      url: `/api/teams/${teamSlug}/messages`,
      headers: { 'x-test-user-id': memberId },
      payload: {
        type: 'request',
        subtype: 'knowledge_check',
        content: { query: 'Who knows about React?' },
      },
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    expect(body.type).toBe('request');
    expect(body.subtype).toBe('knowledge_check');
  });

  it('rejects invalid type-subtype combination with 400', async () => {
    const response = await server.inject({
      method: 'POST',
      url: `/api/teams/${teamSlug}/messages`,
      headers: { 'x-test-user-id': ownerId },
      payload: {
        type: 'request',
        subtype: 'discovery', // discovery is a broadcast subtype, not request
        content: { query: 'test' },
      },
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.error).toContain('Invalid type-subtype combination');
  });

  it('stores routing field when provided', async () => {
    const routing = [
      { userId: memberId, reason: 'Expert in ML' },
    ];

    const response = await server.inject({
      method: 'POST',
      url: `/api/teams/${teamSlug}/messages`,
      headers: { 'x-test-user-id': ownerId },
      payload: {
        type: 'broadcast',
        subtype: 'routed_share',
        content: { data: 'ML model results' },
        routing,
      },
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    expect(body.routing).toEqual(routing);
  });

  it('stores referenceId when provided', async () => {
    // First create a message to reference
    const firstRes = await server.inject({
      method: 'POST',
      url: `/api/teams/${teamSlug}/messages`,
      headers: { 'x-test-user-id': memberId },
      payload: {
        type: 'request',
        subtype: 'task_delegation',
        content: { task: 'Review PR #42' },
      },
    });
    const firstMsg = JSON.parse(firstRes.body);

    // Send a response referencing the first message
    const response = await server.inject({
      method: 'POST',
      url: `/api/teams/${teamSlug}/messages`,
      headers: { 'x-test-user-id': ownerId },
      payload: {
        type: 'response',
        subtype: 'task_claim',
        content: { accepted: true },
        referenceId: firstMsg.id,
      },
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    expect(body.referenceId).toBe(firstMsg.id);
  });

  it('lists messages for the team', async () => {
    const response = await server.inject({
      method: 'GET',
      url: `/api/teams/${teamSlug}/messages`,
      headers: { 'x-test-user-id': memberId },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThanOrEqual(1);
  });

  it('filters messages by type', async () => {
    const response = await server.inject({
      method: 'GET',
      url: `/api/teams/${teamSlug}/messages?type=broadcast`,
      headers: { 'x-test-user-id': memberId },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(Array.isArray(body)).toBe(true);
    expect(body.every((m: any) => m.type === 'broadcast')).toBe(true);
    expect(body.length).toBeGreaterThanOrEqual(1);
  });

  it('filters messages by subtype', async () => {
    const response = await server.inject({
      method: 'GET',
      url: `/api/teams/${teamSlug}/messages?subtype=discovery`,
      headers: { 'x-test-user-id': memberId },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(Array.isArray(body)).toBe(true);
    expect(body.every((m: any) => m.subtype === 'discovery')).toBe(true);
  });

  it('publishes message to Redis channel on send', async () => {
    // Subscribe to the team channel before sending
    const receivedMessages: string[] = [];
    await server.redisSub.subscribe(`team:${teamId}:waggle`);
    server.redisSub.on('message', (_channel: string, message: string) => {
      receivedMessages.push(message);
    });

    const response = await server.inject({
      method: 'POST',
      url: `/api/teams/${teamSlug}/messages`,
      headers: { 'x-test-user-id': ownerId },
      payload: {
        type: 'broadcast',
        subtype: 'skill_share',
        content: { skill: 'data-analysis', version: '1.0' },
      },
    });

    expect(response.statusCode).toBe(201);

    // Give Redis a moment to deliver
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(receivedMessages.length).toBeGreaterThanOrEqual(1);
    const published = JSON.parse(receivedMessages[receivedMessages.length - 1]);
    expect(published.subtype).toBe('skill_share');
    expect(published.content).toEqual({ skill: 'data-analysis', version: '1.0' });

    // Cleanup subscription
    await server.redisSub.unsubscribe(`team:${teamId}:waggle`);
    server.redisSub.removeAllListeners('message');
  });

  it('non-member gets 403 when sending messages', async () => {
    const response = await server.inject({
      method: 'POST',
      url: `/api/teams/${teamSlug}/messages`,
      headers: { 'x-test-user-id': outsiderId },
      payload: {
        type: 'broadcast',
        subtype: 'discovery',
        content: { test: true },
      },
    });

    expect(response.statusCode).toBe(403);
  });

  it('non-member gets 403 when listing messages', async () => {
    const response = await server.inject({
      method: 'GET',
      url: `/api/teams/${teamSlug}/messages`,
      headers: { 'x-test-user-id': outsiderId },
    });

    expect(response.statusCode).toBe(403);
  });

  describe('hive-check', () => {
    it('finds matching entities by topic', async () => {
      const response = await server.inject({
        method: 'POST',
        url: `/api/teams/${teamSlug}/messages/hive-check`,
        headers: { 'x-test-user-id': ownerId },
        payload: { topic: 'Machine Learning' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.entities.length).toBeGreaterThanOrEqual(1);
      expect(body.entities.some((e: any) => e.name === 'Machine Learning')).toBe(true);
    });

    it('finds matching tasks by topic', async () => {
      const response = await server.inject({
        method: 'POST',
        url: `/api/teams/${teamSlug}/messages/hive-check`,
        headers: { 'x-test-user-id': memberId },
        payload: { topic: 'ML pipeline' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.relatedTasks.length).toBeGreaterThanOrEqual(1);
      expect(body.relatedTasks.some((t: any) => t.title.includes('ML pipeline'))).toBe(true);
    });

    it('finds matching broadcast messages', async () => {
      // We already sent broadcast messages earlier in the test suite
      const response = await server.inject({
        method: 'POST',
        url: `/api/teams/${teamSlug}/messages/hive-check`,
        headers: { 'x-test-user-id': ownerId },
        payload: { topic: 'anything' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.relatedMessages).toBeDefined();
      expect(Array.isArray(body.relatedMessages)).toBe(true);
    });

    it('returns empty results for non-matching topic', async () => {
      const response = await server.inject({
        method: 'POST',
        url: `/api/teams/${teamSlug}/messages/hive-check`,
        headers: { 'x-test-user-id': ownerId },
        payload: { topic: 'xyzzy_nonexistent_topic_12345' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.entities).toHaveLength(0);
      expect(body.relatedTasks).toHaveLength(0);
    });

    it('non-member gets 403 on hive-check', async () => {
      const response = await server.inject({
        method: 'POST',
        url: `/api/teams/${teamSlug}/messages/hive-check`,
        headers: { 'x-test-user-id': outsiderId },
        payload: { topic: 'test' },
      });

      expect(response.statusCode).toBe(403);
    });

    it('validates hive-check input', async () => {
      const response = await server.inject({
        method: 'POST',
        url: `/api/teams/${teamSlug}/messages/hive-check`,
        headers: { 'x-test-user-id': ownerId },
        payload: {}, // missing topic
      });

      expect(response.statusCode).toBe(400);
    });
  });
});
