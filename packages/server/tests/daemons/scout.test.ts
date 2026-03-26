import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../../src/index.js';
import { users, teams, teamMembers, teamResources, agents, scoutFindings } from '../../src/db/schema.js';
import { sql, eq } from 'drizzle-orm';
import { ScoutAgent } from '../../src/daemons/scout.js';

describe('Scout Agent (Task 3.18)', () => {
  let server: Awaited<ReturnType<typeof buildServer>>;
  let userId: string;
  let teamId: string;
  let scout: ScoutAgent;

  beforeAll(async () => {
    server = await buildServer();

    // Clean up leftover test data
    await server.db.execute(sql`DELETE FROM scout_findings WHERE user_id IN (SELECT id FROM users WHERE clerk_id LIKE 'scout_%')`);
    await server.db.execute(sql`DELETE FROM agents WHERE user_id IN (SELECT id FROM users WHERE clerk_id LIKE 'scout_%')`);
    await server.db.execute(sql`DELETE FROM team_resources WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE 'scouttest-%')`);
    await server.db.execute(sql`DELETE FROM team_members WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE 'scouttest-%')`);
    await server.db.execute(sql`DELETE FROM team_capability_requests WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE 'scouttest-%')`);
    await server.db.execute(sql`DELETE FROM team_capability_overrides WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE 'scouttest-%')`);
    await server.db.execute(sql`DELETE FROM team_capability_policies WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE 'scouttest-%')`);
    await server.db.execute(sql`DELETE FROM teams WHERE slug LIKE 'scouttest-%'`);
    await server.db.execute(sql`DELETE FROM users WHERE clerk_id LIKE 'scout_%'`);

    // Create test user
    const [user] = await server.db.insert(users).values({
      clerkId: 'scout_user1',
      displayName: 'Scout User',
      email: 'scout_user1@test.com',
    }).returning();
    userId = user.id;

    // Create team
    const [team] = await server.db.insert(teams).values({
      name: 'Scout Test Team',
      slug: 'scouttest-team',
      ownerId: userId,
    }).returning();
    teamId = team.id;

    // Add membership with interests
    await server.db.insert(teamMembers).values({
      teamId,
      userId,
      role: 'owner',
      interests: ['python', 'data-science'],
    });

    // Create an agent with tools for the user
    await server.db.insert(agents).values({
      userId,
      teamId,
      name: 'TestAgent',
      tools: ['web_search', 'code_review'],
    });

    // Create team resources
    await server.db.insert(teamResources).values([
      {
        teamId,
        resourceType: 'skill',
        name: 'Python Data Analyzer',
        description: 'A skill for analyzing data with Python',
        config: {},
        sharedBy: userId,
      },
      {
        teamId,
        resourceType: 'prompt_template',
        name: 'Code Review Template',
        description: 'Template for code reviews',
        config: {},
        sharedBy: userId,
      },
    ]);

    scout = new ScoutAgent(server.db);

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
    await server.db.execute(sql`DELETE FROM scout_findings WHERE user_id IN (SELECT id FROM users WHERE clerk_id LIKE 'scout_%')`);
    await server.db.execute(sql`DELETE FROM agents WHERE user_id IN (SELECT id FROM users WHERE clerk_id LIKE 'scout_%')`);
    await server.db.execute(sql`DELETE FROM team_resources WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE 'scouttest-%')`);
    await server.db.execute(sql`DELETE FROM team_members WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE 'scouttest-%')`);
    await server.db.execute(sql`DELETE FROM team_capability_requests WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE 'scouttest-%')`);
    await server.db.execute(sql`DELETE FROM team_capability_overrides WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE 'scouttest-%')`);
    await server.db.execute(sql`DELETE FROM team_capability_policies WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE 'scouttest-%')`);
    await server.db.execute(sql`DELETE FROM teams WHERE slug LIKE 'scouttest-%'`);
    await server.db.execute(sql`DELETE FROM users WHERE clerk_id LIKE 'scout_%'`);
    await server.close();
  });

  it('scan creates findings from team resources', async () => {
    const findings = await scout.scan(userId, teamId);
    expect(findings.length).toBeGreaterThanOrEqual(2);
    expect(findings.every((f: any) => f.status === 'new')).toBe(true);
    expect(findings.some((f: any) => f.title.includes('Python Data Analyzer'))).toBe(true);
    expect(findings.some((f: any) => f.title.includes('Code Review Template'))).toBe(true);
  });

  it('relevance scoring boosts based on user interests', async () => {
    // The Python Data Analyzer should be boosted because user has 'python' interest
    const findings = await scout.listFindings(userId);
    const pythonFinding = findings.find((f: any) => f.title.includes('Python'));
    const templateFinding = findings.find((f: any) => f.title.includes('Code Review'));

    expect(pythonFinding).toBeTruthy();
    expect(templateFinding).toBeTruthy();
    // Python finding should have higher score (base 0.5 + 0.3 interest boost)
    expect(pythonFinding!.relevanceScore).toBeGreaterThan(templateFinding!.relevanceScore);
  });

  it('adopt updates status', async () => {
    const findings = await scout.listFindings(userId);
    const finding = findings[0];

    const updated = await scout.adopt(finding.id);
    expect(updated).toBeTruthy();
    expect(updated!.status).toBe('adopted');
  });

  it('dismiss updates status', async () => {
    const findings = await scout.listFindings(userId);
    const newFinding = findings.find((f: any) => f.status === 'new');
    expect(newFinding).toBeTruthy();

    const updated = await scout.dismiss(newFinding!.id);
    expect(updated).toBeTruthy();
    expect(updated!.status).toBe('dismissed');
  });

  it('dismissed finding not resurfaced in future scans', async () => {
    // Clear all non-dismissed findings
    const allFindings = await scout.listFindings(userId);
    const dismissed = allFindings.filter((f: any) => f.status === 'dismissed');
    expect(dismissed.length).toBeGreaterThan(0);

    // Run scan again — dismissed titles should not reappear as new
    const newFindings = await scout.scan(userId, teamId);
    const dismissedTitles = dismissed.map((f: any) => f.title);
    const resurfaced = newFindings.filter((f: any) => dismissedTitles.includes(f.title));
    expect(resurfaced.length).toBe(0);
  });

  it('GET /api/scout/findings returns findings for user', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/api/scout/findings',
      headers: { 'x-test-user-id': userId },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
  });

  it('PATCH /api/scout/findings/:id rejects invalid status', async () => {
    const findings = await scout.listFindings(userId);
    const finding = findings[0];

    const response = await server.inject({
      method: 'PATCH',
      url: `/api/scout/findings/${finding.id}`,
      headers: { 'x-test-user-id': userId },
      payload: { status: 'invalid' },
    });

    expect(response.statusCode).toBe(400);
  });
});
