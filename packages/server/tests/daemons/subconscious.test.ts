import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../../src/index.js';
import { users, teams, teamMembers, agentJobs, agentAuditLog } from '../../src/db/schema.js';
import { sql } from 'drizzle-orm';
import { SubconsciousAgent } from '../../src/daemons/subconscious.js';

describe('Subconscious Agent (Task 3.19)', () => {
  let server: Awaited<ReturnType<typeof buildServer>>;
  let userId: string;
  let teamId: string;
  let subconscious: SubconsciousAgent;

  beforeAll(async () => {
    server = await buildServer();

    // Clean up leftover test data
    await server.db.execute(sql`DELETE FROM agent_audit_log WHERE user_id IN (SELECT id FROM users WHERE clerk_id LIKE 'subcon_%')`);
    await server.db.execute(sql`DELETE FROM agent_jobs WHERE user_id IN (SELECT id FROM users WHERE clerk_id LIKE 'subcon_%')`);
    await server.db.execute(sql`DELETE FROM team_members WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE 'subcontest-%')`);
    await server.db.execute(sql`DELETE FROM team_capability_requests WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE 'subcontest-%')`);
    await server.db.execute(sql`DELETE FROM team_capability_overrides WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE 'subcontest-%')`);
    await server.db.execute(sql`DELETE FROM team_capability_policies WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE 'subcontest-%')`);
    await server.db.execute(sql`DELETE FROM teams WHERE slug LIKE 'subcontest-%'`);
    await server.db.execute(sql`DELETE FROM users WHERE clerk_id LIKE 'subcon_%'`);

    // Create test user
    const [user] = await server.db.insert(users).values({
      clerkId: 'subcon_user1',
      displayName: 'Subconscious User',
      email: 'subcon_user1@test.com',
    }).returning();
    userId = user.id;

    // Create team
    const [team] = await server.db.insert(teams).values({
      name: 'Subconscious Test Team',
      slug: 'subcontest-team',
      ownerId: userId,
    }).returning();
    teamId = team.id;

    await server.db.insert(teamMembers).values({
      teamId,
      userId,
      role: 'owner',
    });

    subconscious = new SubconsciousAgent(server.db);
  });

  afterAll(async () => {
    await server.db.execute(sql`DELETE FROM agent_audit_log WHERE user_id IN (SELECT id FROM users WHERE clerk_id LIKE 'subcon_%')`);
    await server.db.execute(sql`DELETE FROM agent_jobs WHERE user_id IN (SELECT id FROM users WHERE clerk_id LIKE 'subcon_%')`);
    await server.db.execute(sql`DELETE FROM team_members WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE 'subcontest-%')`);
    await server.db.execute(sql`DELETE FROM team_capability_requests WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE 'subcontest-%')`);
    await server.db.execute(sql`DELETE FROM team_capability_overrides WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE 'subcontest-%')`);
    await server.db.execute(sql`DELETE FROM team_capability_policies WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE 'subcontest-%')`);
    await server.db.execute(sql`DELETE FROM teams WHERE slug LIKE 'subcontest-%'`);
    await server.db.execute(sql`DELETE FROM users WHERE clerk_id LIKE 'subcon_%'`);
    await server.close();
  });

  it('shouldReflect returns false when under threshold', async () => {
    // No completed jobs yet
    const result = await subconscious.shouldReflect(userId);
    expect(result).toBe(false);
  });

  it('shouldReflect returns true after N completed jobs', async () => {
    // Insert 10 completed jobs (SUBCONSCIOUS_INTERACTION_THRESHOLD = 10)
    const jobValues = Array.from({ length: 10 }, (_, i) => ({
      teamId,
      userId,
      jobType: 'chat',
      status: 'completed',
      input: { prompt: `test ${i}` },
      completedAt: new Date(),
    }));
    await server.db.insert(agentJobs).values(jobValues);

    const result = await subconscious.shouldReflect(userId);
    expect(result).toBe(true);
  });

  it('reflect creates audit entry', async () => {
    const { auditEntry, insights } = await subconscious.reflect(userId);

    expect(auditEntry).toBeTruthy();
    expect(auditEntry.agentName).toBe('subconscious');
    expect(auditEntry.actionType).toBe('subconscious_reflection');
    expect(auditEntry.description).toContain('Reflected on');
    expect(Array.isArray(insights)).toBe(true);
  });

  it('detects repeated job types pattern', async () => {
    // Insert 5 more jobs of same type to trigger pattern detection
    const repeatedJobs = Array.from({ length: 5 }, (_, i) => ({
      teamId,
      userId,
      jobType: 'task',
      status: 'completed',
      input: { prompt: `repeated ${i}` },
      completedAt: new Date(),
    }));
    await server.db.insert(agentJobs).values(repeatedJobs);

    const { insights } = await subconscious.reflect(userId);

    // Should find a prompt_change insight for the repeated 'chat' type (10 jobs)
    const promptInsight = insights.find(i => i.type === 'prompt_change');
    expect(promptInsight).toBeTruthy();
    expect(promptInsight!.description).toContain('executed');
    expect(promptInsight!.description).toContain('times recently');
  });

  it('prompt change insight requires approval in audit entry', async () => {
    // The previous reflect should have created an audit entry with requiresApproval
    const entries = await server.db.select().from(agentAuditLog)
      .where(sql`${agentAuditLog.userId} = ${userId} AND ${agentAuditLog.actionType} = 'subconscious_reflection'`);

    // Find one that has insights with prompt_change
    const withApproval = entries.find(e => {
      const state = e.afterState as any;
      return state?.insights?.some((i: any) => i.type === 'prompt_change');
    });

    expect(withApproval).toBeTruthy();
    expect(withApproval!.requiresApproval).toBe(true);
  });
});
