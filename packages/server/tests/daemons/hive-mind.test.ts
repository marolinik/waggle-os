import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../../src/index.js';
import { users, teams, teamMembers, teamResources, agentJobs, tasks, messages } from '../../src/db/schema.js';
import { sql, eq } from 'drizzle-orm';
import { HiveMindAgent } from '../../src/daemons/hive-mind.js';

describe('Hive Mind Agent (Task 3.20)', () => {
  let server: Awaited<ReturnType<typeof buildServer>>;
  let ownerId: string;
  let memberId: string;
  let teamId: string;
  let hiveMind: HiveMindAgent;

  beforeAll(async () => {
    server = await buildServer();

    // Clean up leftover test data
    await server.db.execute(sql`DELETE FROM messages WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE 'hivetest-%')`);
    await server.db.execute(sql`DELETE FROM agent_jobs WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE 'hivetest-%')`);
    await server.db.execute(sql`DELETE FROM tasks WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE 'hivetest-%')`);
    await server.db.execute(sql`DELETE FROM team_resources WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE 'hivetest-%')`);
    await server.db.execute(sql`DELETE FROM team_members WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE 'hivetest-%')`);
    await server.db.execute(sql`DELETE FROM team_capability_requests WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE 'hivetest-%')`);
    await server.db.execute(sql`DELETE FROM team_capability_overrides WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE 'hivetest-%')`);
    await server.db.execute(sql`DELETE FROM team_capability_policies WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE 'hivetest-%')`);
    await server.db.execute(sql`DELETE FROM teams WHERE slug LIKE 'hivetest-%'`);
    await server.db.execute(sql`DELETE FROM users WHERE clerk_id LIKE 'hive_%'`);

    // Create test users
    const [owner] = await server.db.insert(users).values({
      clerkId: 'hive_owner',
      displayName: 'Hive Owner',
      email: 'hive_owner@test.com',
    }).returning();
    ownerId = owner.id;

    const [member] = await server.db.insert(users).values({
      clerkId: 'hive_member',
      displayName: 'Hive Member',
      email: 'hive_member@test.com',
    }).returning();
    memberId = member.id;

    // Create team
    const [team] = await server.db.insert(teams).values({
      name: 'Hive Test Team',
      slug: 'hivetest-team',
      ownerId,
    }).returning();
    teamId = team.id;

    await server.db.insert(teamMembers).values([
      { teamId, userId: ownerId, role: 'owner' },
      { teamId, userId: memberId, role: 'member' },
    ]);

    // Seed data: completed jobs
    await server.db.insert(agentJobs).values(
      Array.from({ length: 5 }, (_, i) => ({
        teamId,
        userId: ownerId,
        jobType: 'chat',
        status: 'completed',
        input: { prompt: `job ${i}` },
        completedAt: new Date(),
      })),
    );

    // Seed data: tasks with similar titles by different users (duplicate work)
    await server.db.insert(tasks).values([
      { teamId, title: 'Setup CI/CD pipeline for backend', status: 'done', createdBy: ownerId },
      { teamId, title: 'Setup CI/CD pipeline for frontend', status: 'done', createdBy: memberId },
      { teamId, title: 'Write unit tests', status: 'done', createdBy: ownerId },
    ]);

    // Seed data: team resources with ratings
    await server.db.insert(teamResources).values([
      {
        teamId,
        resourceType: 'prompt_template',
        name: 'Best Code Review Prompt',
        description: 'A highly rated code review template',
        config: {},
        sharedBy: ownerId,
        rating: 4.5,
      },
      {
        teamId,
        resourceType: 'skill',
        name: 'Low Rated Skill',
        description: 'Not very useful',
        config: {},
        sharedBy: memberId,
        rating: 1.0,
      },
    ]);

    hiveMind = new HiveMindAgent(server.db);
  });

  afterAll(async () => {
    await server.db.execute(sql`DELETE FROM messages WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE 'hivetest-%')`);
    await server.db.execute(sql`DELETE FROM agent_jobs WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE 'hivetest-%')`);
    await server.db.execute(sql`DELETE FROM tasks WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE 'hivetest-%')`);
    await server.db.execute(sql`DELETE FROM team_resources WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE 'hivetest-%')`);
    await server.db.execute(sql`DELETE FROM team_members WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE 'hivetest-%')`);
    await server.db.execute(sql`DELETE FROM team_capability_requests WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE 'hivetest-%')`);
    await server.db.execute(sql`DELETE FROM team_capability_overrides WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE 'hivetest-%')`);
    await server.db.execute(sql`DELETE FROM team_capability_policies WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE 'hivetest-%')`);
    await server.db.execute(sql`DELETE FROM teams WHERE slug LIKE 'hivetest-%'`);
    await server.db.execute(sql`DELETE FROM users WHERE clerk_id LIKE 'hive_%'`);
    await server.close();
  });

  it('generates weekly digest with metrics', async () => {
    const { digest, messageId } = await hiveMind.generateWeeklyDigest(teamId);

    expect(digest).toBeTruthy();
    expect(digest.metrics.jobsCompleted).toBe(5);
    expect(digest.metrics.tasksCompleted).toBe(3);
    expect(digest.metrics.resourcesShared).toBe(2);
    expect(digest.period.from).toBeInstanceOf(Date);
    expect(digest.period.to).toBeInstanceOf(Date);
    expect(messageId).toBeTruthy();
  });

  it('detects duplicate work across team members', async () => {
    const { digest } = await hiveMind.generateWeeklyDigest(teamId);

    // "Setup CI/CD pipeline" tasks by different users should be detected
    expect(digest.duplicateWork.length).toBeGreaterThan(0);
    const duplicate = digest.duplicateWork[0];
    expect(duplicate.users.length).toBe(2);
    expect(duplicate.titles.length).toBe(2);
  });

  it('identifies best practices from high-rated resources', async () => {
    const { digest } = await hiveMind.generateWeeklyDigest(teamId);

    // Only the high-rated resource (4.5 >= 3.0) should appear
    expect(digest.bestPractices.length).toBe(1);
    expect(digest.bestPractices[0].name).toBe('Best Code Review Prompt');
    expect(digest.bestPractices[0].rating).toBe(4.5);
  });

  it('generates recommendations based on findings', async () => {
    const { digest } = await hiveMind.generateWeeklyDigest(teamId);

    // Should have duplicate work recommendation
    expect(digest.recommendations.length).toBeGreaterThan(0);
    expect(digest.recommendations.some(r => r.includes('duplicate'))).toBe(true);
    // Should have best practices recommendation
    expect(digest.recommendations.some(r => r.includes('highly-rated'))).toBe(true);
  });

  it('broadcasts digest as a waggle dance message', async () => {
    const { messageId } = await hiveMind.generateWeeklyDigest(teamId);

    // Verify the message was stored
    const [msg] = await server.db.select().from(messages)
      .where(eq(messages.id, messageId));

    expect(msg).toBeTruthy();
    expect(msg.type).toBe('broadcast');
    expect(msg.subtype).toBe('discovery');
    expect((msg.content as any).type).toBe('weekly_digest');
    expect((msg.content as any).digest).toBeTruthy();
  });
});
