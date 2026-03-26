import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createDb, type Db } from '../../src/db/connection.js';
import { users, teams, teamMembers, tasks, messages, agents, agentGroups } from '../../src/db/schema.js';
import { sql } from 'drizzle-orm';

const SUFFIX = `_schema_${Date.now()}`;

describe('PostgreSQL schema', () => {
  let db: Db;
  let testUserId: string;
  let testTeamId: string;

  beforeAll(async () => {
    db = createDb(process.env.DATABASE_URL ?? 'postgres://waggle:waggle_dev@localhost:5434/waggle');

    // Clean up any leftovers from previous runs
    await db.execute(sql`DELETE FROM team_members WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE '%_schema_%')`);
    await db.execute(sql`DELETE FROM team_capability_requests WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE '%_schema_%')`);
    await db.execute(sql`DELETE FROM team_capability_overrides WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE '%_schema_%')`);
    await db.execute(sql`DELETE FROM team_capability_policies WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE '%_schema_%')`);
    await db.execute(sql`DELETE FROM teams WHERE slug LIKE '%_schema_%'`);
    await db.execute(sql`DELETE FROM users WHERE clerk_id LIKE '%_schema_%'`);
  });

  afterAll(async () => {
    // Clean up test data created by these tests
    if (testTeamId) {
      await db.execute(sql`DELETE FROM team_members WHERE team_id = ${testTeamId}`);
      await db.execute(sql`DELETE FROM team_capability_requests WHERE team_id = ${testTeamId}`);
      await db.execute(sql`DELETE FROM team_capability_overrides WHERE team_id = ${testTeamId}`);
      await db.execute(sql`DELETE FROM team_capability_policies WHERE team_id = ${testTeamId}`);
      await db.execute(sql`DELETE FROM teams WHERE id = ${testTeamId}`);
    }
    if (testUserId) {
      await db.execute(sql`DELETE FROM users WHERE id = ${testUserId}`);
    }
  });

  it('creates a user', async () => {
    const [user] = await db.insert(users).values({
      clerkId: `clerk${SUFFIX}`,
      displayName: 'Schema Test User',
      email: `schematest${SUFFIX}@test.com`,
    }).returning();
    testUserId = user.id;
    expect(user.id).toBeDefined();
    expect(user.displayName).toBe('Schema Test User');
  });

  it('creates a team with owner', async () => {
    // Depends on previous test having created user
    expect(testUserId).toBeTruthy();

    const [team] = await db.insert(teams).values({
      name: 'Marketing',
      slug: `marketing${SUFFIX}`,
      ownerId: testUserId,
    }).returning();
    testTeamId = team.id;
    expect(team.slug).toBe(`marketing${SUFFIX}`);

    await db.insert(teamMembers).values({
      teamId: team.id,
      userId: testUserId,
      role: 'owner',
    });
  });

  it('creates all 16 tables', async () => {
    const result = await db.execute(sql`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);
    const tableNames = (result as any[]).map((r: any) => r.table_name);
    expect(tableNames).toContain('users');
    expect(tableNames).toContain('teams');
    expect(tableNames).toContain('team_members');
    expect(tableNames).toContain('agents');
    expect(tableNames).toContain('agent_groups');
    expect(tableNames).toContain('tasks');
    expect(tableNames).toContain('messages');
    expect(tableNames).toContain('team_entities');
    expect(tableNames).toContain('team_relations');
    expect(tableNames).toContain('team_resources');
    expect(tableNames).toContain('agent_jobs');
    expect(tableNames).toContain('cron_schedules');
    expect(tableNames).toContain('scout_findings');
    expect(tableNames).toContain('proactive_patterns');
    expect(tableNames).toContain('suggestions_log');
    expect(tableNames).toContain('agent_audit_log');
  });
});
