import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../../src/index.js';
import { users, agents, agentGroups, agentGroupMembers, agentJobs, teams, teamMembers } from '../../src/db/schema.js';
import { sql, eq } from 'drizzle-orm';

describe('Agent API', () => {
  let server: Awaited<ReturnType<typeof buildServer>>;
  let user1Id: string;
  let user2Id: string;
  let teamId: string;
  let team2Id: string;
  let agent1Id: string;
  let agent2Id: string;
  let foreignAgentId: string;
  let group1Id: string;

  beforeAll(async () => {
    server = await buildServer();

    // Clean up leftover test data
    await server.db.execute(sql`DELETE FROM agent_group_members WHERE group_id IN (SELECT id FROM agent_groups WHERE user_id IN (SELECT id FROM users WHERE clerk_id LIKE 'agtest_%'))`);
    await server.db.execute(sql`DELETE FROM agent_jobs WHERE user_id IN (SELECT id FROM users WHERE clerk_id LIKE 'agtest_%')`);
    await server.db.execute(sql`DELETE FROM agent_groups WHERE user_id IN (SELECT id FROM users WHERE clerk_id LIKE 'agtest_%')`);
    await server.db.execute(sql`DELETE FROM agents WHERE user_id IN (SELECT id FROM users WHERE clerk_id LIKE 'agtest_%')`);
    await server.db.execute(sql`DELETE FROM team_members WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE 'agtest-%')`);
    await server.db.execute(sql`DELETE FROM team_capability_requests WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE 'agtest-%')`);
    await server.db.execute(sql`DELETE FROM team_capability_overrides WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE 'agtest-%')`);
    await server.db.execute(sql`DELETE FROM team_capability_policies WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE 'agtest-%')`);
    await server.db.execute(sql`DELETE FROM teams WHERE slug LIKE 'agtest-%'`);
    await server.db.execute(sql`DELETE FROM users WHERE clerk_id LIKE 'agtest_%'`);

    // Create test users
    const [u1] = await server.db.insert(users).values({
      clerkId: 'agtest_user1',
      displayName: 'Agent User 1',
      email: 'agentuser1@test.com',
    }).returning();
    user1Id = u1.id;

    const [u2] = await server.db.insert(users).values({
      clerkId: 'agtest_user2',
      displayName: 'Agent User 2',
      email: 'agentuser2@test.com',
    }).returning();
    user2Id = u2.id;

    // Create a team for job tests
    const [team] = await server.db.insert(teams).values({
      name: 'Agent Test Team',
      slug: 'agtest-team',
      ownerId: user1Id,
    }).returning();
    teamId = team.id;

    await server.db.insert(teamMembers).values({ teamId, userId: user1Id, role: 'owner' });

    const [team2] = await server.db.insert(teams).values({
      name: 'Agent Test Team 2',
      slug: 'agtest-team-2',
      ownerId: user2Id,
    }).returning();
    team2Id = team2.id;

    await server.db.insert(teamMembers).values({ teamId: team2Id, userId: user2Id, role: 'owner' });

    // Override auth handler for tests
    server._authHandler.fn = async function (request, reply) {
      const testUserId = request.headers['x-test-user-id'] as string;
      if (!testUserId) {
        return reply.code(401).send({ error: 'Missing x-test-user-id header' });
      }
      request.userId = testUserId;
      request.clerkId = 'test';
    };
  });

  afterAll(async () => {
    await server.db.execute(sql`DELETE FROM agent_group_members WHERE group_id IN (SELECT id FROM agent_groups WHERE user_id IN (SELECT id FROM users WHERE clerk_id LIKE 'agtest_%'))`);
    await server.db.execute(sql`DELETE FROM agent_jobs WHERE user_id IN (SELECT id FROM users WHERE clerk_id LIKE 'agtest_%')`);
    await server.db.execute(sql`DELETE FROM agent_groups WHERE user_id IN (SELECT id FROM users WHERE clerk_id LIKE 'agtest_%')`);
    await server.db.execute(sql`DELETE FROM agents WHERE user_id IN (SELECT id FROM users WHERE clerk_id LIKE 'agtest_%')`);
    await server.db.execute(sql`DELETE FROM team_members WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE 'agtest-%')`);
    await server.db.execute(sql`DELETE FROM team_capability_requests WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE 'agtest-%')`);
    await server.db.execute(sql`DELETE FROM team_capability_overrides WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE 'agtest-%')`);
    await server.db.execute(sql`DELETE FROM team_capability_policies WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE 'agtest-%')`);
    await server.db.execute(sql`DELETE FROM teams WHERE slug LIKE 'agtest-%'`);
    await server.db.execute(sql`DELETE FROM users WHERE clerk_id LIKE 'agtest_%'`);
    await server.close();
  });

  it('creates an agent with custom model, tools, and system prompt', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/api/agents',
      headers: { 'x-test-user-id': user1Id },
      payload: {
        name: 'Research Agent',
        role: 'researcher',
        systemPrompt: 'You are a research agent.',
        model: 'claude-sonnet-4-20250514',
        tools: ['web_search', 'read_file'],
        config: { maxTokens: 4096 },
      },
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    expect(body.name).toBe('Research Agent');
    expect(body.role).toBe('researcher');
    expect(body.systemPrompt).toBe('You are a research agent.');
    expect(body.model).toBe('claude-sonnet-4-20250514');
    expect(body.tools).toEqual(['web_search', 'read_file']);
    expect(body.config).toEqual({ maxTokens: 4096 });
    expect(body.userId).toBe(user1Id);
    agent1Id = body.id;
  });

  it('creates a second agent for user1', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/api/agents',
      headers: { 'x-test-user-id': user1Id },
      payload: {
        name: 'Coding Agent',
        model: 'claude-haiku-4-5',
        tools: ['execute_code'],
      },
    });

    expect(response.statusCode).toBe(201);
    agent2Id = JSON.parse(response.body).id;
  });

  it('lists agents returns only the user\'s agents', async () => {
    // Create an agent for user2
    const foreignAgentResponse = await server.inject({
      method: 'POST',
      url: '/api/agents',
      headers: { 'x-test-user-id': user2Id },
      payload: { name: 'User2 Agent' },
    });
    expect(foreignAgentResponse.statusCode).toBe(201);
    foreignAgentId = JSON.parse(foreignAgentResponse.body).id;

    const response = await server.inject({
      method: 'GET',
      url: '/api/agents',
      headers: { 'x-test-user-id': user1Id },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(2);
    expect(body.every((a: { userId: string }) => a.userId === user1Id)).toBe(true);
  });

  it('updates agent model and config', async () => {
    const response = await server.inject({
      method: 'PATCH',
      url: `/api/agents/${agent1Id}`,
      headers: { 'x-test-user-id': user1Id },
      payload: {
        model: 'claude-haiku-4-5',
        config: { maxTokens: 2048, temperature: 0.7 },
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.model).toBe('claude-haiku-4-5');
    expect(body.config).toEqual({ maxTokens: 2048, temperature: 0.7 });
  });

  it('user cannot update another user\'s agent', async () => {
    const response = await server.inject({
      method: 'PATCH',
      url: `/api/agents/${agent1Id}`,
      headers: { 'x-test-user-id': user2Id },
      payload: { model: 'hacked-model' },
    });

    expect(response.statusCode).toBe(403);
  });

  it('user cannot delete another user\'s agent', async () => {
    const response = await server.inject({
      method: 'DELETE',
      url: `/api/agents/${agent1Id}`,
      headers: { 'x-test-user-id': user2Id },
    });

    expect(response.statusCode).toBe(403);
  });

  it('creates an agent group with parallel strategy and 2 members', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/api/agent-groups',
      headers: { 'x-test-user-id': user1Id },
      payload: {
        name: 'Research Squad',
        description: 'Parallel research team',
        strategy: 'parallel',
        members: [
          { agentId: agent1Id, roleInGroup: 'worker', executionOrder: 0 },
          { agentId: agent2Id, roleInGroup: 'worker', executionOrder: 0 },
        ],
      },
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    expect(body.name).toBe('Research Squad');
    expect(body.strategy).toBe('parallel');
    expect(body.members).toHaveLength(2);
    group1Id = body.id;
  });

  it('rejects foreign and missing agents identically when creating a group', async () => {
    const payload = {
      name: 'Cross-tenant group',
      strategy: 'parallel',
      members: [
        { agentId: agent1Id, roleInGroup: 'worker', executionOrder: 0 },
        { agentId: foreignAgentId, roleInGroup: 'worker', executionOrder: 1 },
      ],
    };
    const foreignResponse = await server.inject({
      method: 'POST',
      url: '/api/agent-groups',
      headers: { 'x-test-user-id': user1Id },
      payload,
    });
    const missingResponse = await server.inject({
      method: 'POST',
      url: '/api/agent-groups',
      headers: { 'x-test-user-id': user1Id },
      payload: {
        ...payload,
        members: [
          payload.members[0],
          { ...payload.members[1], agentId: '00000000-0000-4000-8000-000000000001' },
        ],
      },
    });

    expect(foreignResponse.statusCode).toBe(404);
    expect(missingResponse.statusCode).toBe(404);
    expect(JSON.parse(foreignResponse.body)).toEqual({ error: 'Agent not found' });
    expect(missingResponse.body).toBe(foreignResponse.body);

    const groups = await server.db
      .select()
      .from(agentGroups)
      .where(eq(agentGroups.userId, user1Id));
    expect(groups.some((group) => group.name === payload.name)).toBe(false);
  });

  it('rejects foreign replacement members without altering the owned group', async () => {
    const foreignResponse = await server.inject({
      method: 'PATCH',
      url: `/api/agent-groups/${group1Id}`,
      headers: { 'x-test-user-id': user1Id },
      payload: {
        members: [
          { agentId: agent1Id, roleInGroup: 'worker', executionOrder: 0 },
          { agentId: foreignAgentId, roleInGroup: 'worker', executionOrder: 1 },
        ],
      },
    });
    const missingResponse = await server.inject({
      method: 'PATCH',
      url: `/api/agent-groups/${group1Id}`,
      headers: { 'x-test-user-id': user1Id },
      payload: {
        members: [
          { agentId: agent1Id, roleInGroup: 'worker', executionOrder: 0 },
          {
            agentId: '00000000-0000-4000-8000-000000000001',
            roleInGroup: 'worker',
            executionOrder: 1,
          },
        ],
      },
    });

    expect(foreignResponse.statusCode).toBe(404);
    expect(missingResponse.statusCode).toBe(404);
    expect(JSON.parse(foreignResponse.body)).toEqual({ error: 'Agent not found' });
    expect(missingResponse.body).toBe(foreignResponse.body);

    const groupResponse = await server.inject({
      method: 'GET',
      url: `/api/agent-groups/${group1Id}`,
      headers: { 'x-test-user-id': user1Id },
    });
    expect(groupResponse.statusCode).toBe(200);
    const group = JSON.parse(groupResponse.body);
    expect(group.members.map((member: { agentId: string }) => member.agentId).sort())
      .toEqual([agent1Id, agent2Id].sort());
  });

  it('replaces group membership when every agent belongs to the caller', async () => {
    const response = await server.inject({
      method: 'PATCH',
      url: `/api/agent-groups/${group1Id}`,
      headers: { 'x-test-user-id': user1Id },
      payload: {
        members: [
          { agentId: agent1Id, roleInGroup: 'lead', executionOrder: 0 },
          { agentId: agent2Id, roleInGroup: 'worker', executionOrder: 1 },
        ],
      },
    });

    expect(response.statusCode).toBe(200);
    const group = JSON.parse(response.body);
    expect(group.members.map((member: { agentId: string }) => member.agentId).sort())
      .toEqual([agent1Id, agent2Id].sort());
  });

  it('creates a group with coordinator strategy and a lead agent', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/api/agent-groups',
      headers: { 'x-test-user-id': user1Id },
      payload: {
        name: 'Coordinated Team',
        strategy: 'coordinator',
        members: [
          { agentId: agent1Id, roleInGroup: 'lead', executionOrder: 0 },
          { agentId: agent2Id, roleInGroup: 'worker', executionOrder: 1 },
        ],
      },
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    expect(body.strategy).toBe('coordinator');
    const lead = body.members.find((m: { roleInGroup: string; agentId: string }) => m.roleInGroup === 'lead');
    expect(lead).toBeDefined();
    expect(lead.agentId).toBe(agent1Id);
  });

  it('gets group with members', async () => {
    // List groups to get an ID
    const listResponse = await server.inject({
      method: 'GET',
      url: '/api/agent-groups',
      headers: { 'x-test-user-id': user1Id },
    });

    expect(listResponse.statusCode).toBe(200);
    const groups = JSON.parse(listResponse.body);
    expect(groups.length).toBeGreaterThanOrEqual(2);

    const groupId = groups[0].id;
    const response = await server.inject({
      method: 'GET',
      url: `/api/agent-groups/${groupId}`,
      headers: { 'x-test-user-id': user1Id },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.id).toBe(groupId);
    expect(body.members).toBeDefined();
    expect(Array.isArray(body.members)).toBe(true);
  });

  it('executes group run — queues a job and returns 202 with jobId', async () => {
    const listResponse = await server.inject({
      method: 'GET',
      url: '/api/agent-groups',
      headers: { 'x-test-user-id': user1Id },
    });
    const groups = JSON.parse(listResponse.body);
    const groupId = groups[0].id;

    const response = await server.inject({
      method: 'POST',
      url: `/api/agent-groups/${groupId}/run`,
      headers: { 'x-test-user-id': user1Id },
      payload: {
        task: 'Research the latest AI papers',
        teamId,
      },
    });

    expect(response.statusCode).toBe(202);
    const body = JSON.parse(response.body);
    expect(body.jobId).toBeDefined();
    expect(typeof body.jobId).toBe('string');

    // Verify the job was created in the database
    const [job] = await server.db
      .select()
      .from(agentJobs)
      .where(eq(agentJobs.id, body.jobId))
      .limit(1);
    expect(job).toBeDefined();
    expect(job.status).toBe('queued');
    expect(job.jobType).toBe('group');
    expect(job.userId).toBe(user1Id);
  });

  it('rejects an owned group run attributed to a foreign team', async () => {
    const response = await server.inject({
      method: 'POST',
      url: `/api/agent-groups/${group1Id}/run`,
      headers: { 'x-test-user-id': user1Id },
      payload: { task: 'Cross-tenant run', teamId: team2Id },
    });

    expect(response.statusCode).toBe(404);
    expect(JSON.parse(response.body)).toEqual({ error: 'Team not found' });
  });

  it('rejects generic job submission for a foreign team', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/api/jobs',
      headers: { 'x-test-user-id': user1Id },
      payload: { jobType: 'chat', teamId: team2Id, input: { message: 'Cross-tenant job' } },
    });

    expect(response.statusCode).toBe(404);
    expect(JSON.parse(response.body)).toEqual({ error: 'Team not found' });
  });

  it('rejects a generic group job that references another user\'s group', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/api/jobs',
      headers: { 'x-test-user-id': user2Id },
      payload: {
        jobType: 'group',
        teamId: team2Id,
        input: { groupId: group1Id, taskInput: { task: 'Run foreign group' } },
      },
    });

    expect(response.statusCode).toBe(404);
    expect(JSON.parse(response.body)).toEqual({ error: 'Agent group not found' });
  });

  it('hides job status from users outside the job team while preserving member access', async () => {
    const createResponse = await server.inject({
      method: 'POST',
      url: '/api/jobs',
      headers: { 'x-test-user-id': user1Id },
      payload: { jobType: 'chat', teamId, input: { message: 'Private job' } },
    });
    expect(createResponse.statusCode).toBe(202);
    const { jobId } = JSON.parse(createResponse.body);

    const foreignResponse = await server.inject({
      method: 'GET',
      url: `/api/jobs/${jobId}`,
      headers: { 'x-test-user-id': user2Id },
    });
    expect(foreignResponse.statusCode).toBe(404);
    expect(JSON.parse(foreignResponse.body)).toEqual({ error: 'Job not found' });

    const memberResponse = await server.inject({
      method: 'GET',
      url: `/api/jobs/${jobId}`,
      headers: { 'x-test-user-id': user1Id },
    });
    expect(memberResponse.statusCode).toBe(200);
    expect(JSON.parse(memberResponse.body).id).toBe(jobId);
  });

  it('prevents users outside the job team from cancelling it', async () => {
    const createResponse = await server.inject({
      method: 'POST',
      url: '/api/jobs',
      headers: { 'x-test-user-id': user1Id },
      payload: { jobType: 'chat', teamId, input: { message: 'Do not cancel' } },
    });
    expect(createResponse.statusCode).toBe(202);
    const { jobId } = JSON.parse(createResponse.body);

    const foreignResponse = await server.inject({
      method: 'POST',
      url: `/api/jobs/${jobId}/cancel`,
      headers: { 'x-test-user-id': user2Id },
    });
    expect(foreignResponse.statusCode).toBe(404);
    expect(JSON.parse(foreignResponse.body)).toEqual({ error: 'Job not found' });

    const [unchanged] = await server.db
      .select()
      .from(agentJobs)
      .where(eq(agentJobs.id, jobId))
      .limit(1);
    expect(unchanged.status).toBe('queued');

    const memberResponse = await server.inject({
      method: 'POST',
      url: `/api/jobs/${jobId}/cancel`,
      headers: { 'x-test-user-id': user1Id },
    });
    expect(memberResponse.statusCode).toBe(200);
  });

  it('fails closed when a legacy group contains a foreign-owned agent', async () => {
    const [legacyGroup] = await server.db.insert(agentGroups).values({
      userId: user1Id,
      name: 'Legacy compromised group',
      strategy: 'parallel',
    }).returning();
    await server.db.insert(agentGroupMembers).values({
      groupId: legacyGroup.id,
      agentId: foreignAgentId,
      roleInGroup: 'worker',
      executionOrder: 0,
    });

    const getResponse = await server.inject({
      method: 'GET',
      url: `/api/agent-groups/${legacyGroup.id}`,
      headers: { 'x-test-user-id': user1Id },
    });
    const patchResponse = await server.inject({
      method: 'PATCH',
      url: `/api/agent-groups/${legacyGroup.id}`,
      headers: { 'x-test-user-id': user1Id },
      payload: { name: 'Preserved compromise' },
    });
    const runResponse = await server.inject({
      method: 'POST',
      url: `/api/agent-groups/${legacyGroup.id}/run`,
      headers: { 'x-test-user-id': user1Id },
      payload: { task: 'Run foreign configuration', teamId },
    });
    const jobResponse = await server.inject({
      method: 'POST',
      url: '/api/jobs',
      headers: { 'x-test-user-id': user1Id },
      payload: {
        jobType: 'group',
        teamId,
        input: { groupId: legacyGroup.id, taskInput: { task: 'Run foreign configuration' } },
      },
    });

    for (const response of [getResponse, patchResponse, runResponse, jobResponse]) {
      expect(response.statusCode).toBe(404);
      expect(JSON.parse(response.body)).toEqual({ error: 'Agent group not found' });
    }

    const [unchanged] = await server.db
      .select()
      .from(agentGroups)
      .where(eq(agentGroups.id, legacyGroup.id))
      .limit(1);
    expect(unchanged.name).toBe('Legacy compromised group');
  });

  it('deletes an agent', async () => {
    const response = await server.inject({
      method: 'DELETE',
      url: `/api/agents/${agent2Id}`,
      headers: { 'x-test-user-id': user1Id },
    });

    expect(response.statusCode).toBe(204);

    // Verify it's gone
    const listResponse = await server.inject({
      method: 'GET',
      url: '/api/agents',
      headers: { 'x-test-user-id': user1Id },
    });
    const remaining = JSON.parse(listResponse.body);
    const ids = remaining.map((a: { id: string }) => a.id);
    expect(ids).not.toContain(agent2Id);
  });
});
