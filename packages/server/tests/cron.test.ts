import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../src/index.js';
import { users, teams, teamMembers, cronSchedules, agentJobs } from '../src/db/schema.js';
import { sql, eq } from 'drizzle-orm';
import { CronRunner } from '../src/scheduler/cron-runner.js';

describe('Cron Scheduler (Task 3.16)', () => {
  let server: Awaited<ReturnType<typeof buildServer>>;
  let ownerId: string;
  let memberId: string;
  let teamSlug: string;
  let teamId: string;

  beforeAll(async () => {
    server = await buildServer();

    // Clean up leftover test data
    await server.db.execute(sql`DELETE FROM agent_jobs WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE 'crontest-%')`);
    await server.db.execute(sql`DELETE FROM cron_schedules WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE 'crontest-%')`);
    await server.db.execute(sql`DELETE FROM team_members WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE 'crontest-%')`);
    await server.db.execute(sql`DELETE FROM team_capability_requests WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE 'crontest-%')`);
    await server.db.execute(sql`DELETE FROM team_capability_overrides WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE 'crontest-%')`);
    await server.db.execute(sql`DELETE FROM team_capability_policies WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE 'crontest-%')`);
    await server.db.execute(sql`DELETE FROM teams WHERE slug LIKE 'crontest-%'`);
    await server.db.execute(sql`DELETE FROM users WHERE clerk_id LIKE 'crontest_%'`);

    // Create test users
    const [owner] = await server.db.insert(users).values({
      clerkId: 'crontest_owner',
      displayName: 'Cron Owner',
      email: 'crontest_owner@test.com',
    }).returning();
    ownerId = owner.id;

    const [member] = await server.db.insert(users).values({
      clerkId: 'crontest_member',
      displayName: 'Cron Member',
      email: 'crontest_member@test.com',
    }).returning();
    memberId = member.id;

    // Create team
    const [team] = await server.db.insert(teams).values({
      name: 'Cron Test Team',
      slug: 'crontest-cron',
      ownerId,
    }).returning();
    teamId = team.id;
    teamSlug = team.slug;

    await server.db.insert(teamMembers).values([
      { teamId, userId: ownerId, role: 'owner' },
      { teamId, userId: memberId, role: 'member' },
    ]);

    // Override auth handler for testing
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
    await server.db.execute(sql`DELETE FROM agent_jobs WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE 'crontest-%')`);
    await server.db.execute(sql`DELETE FROM cron_schedules WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE 'crontest-%')`);
    await server.db.execute(sql`DELETE FROM team_members WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE 'crontest-%')`);
    await server.db.execute(sql`DELETE FROM team_capability_requests WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE 'crontest-%')`);
    await server.db.execute(sql`DELETE FROM team_capability_overrides WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE 'crontest-%')`);
    await server.db.execute(sql`DELETE FROM team_capability_policies WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE 'crontest-%')`);
    await server.db.execute(sql`DELETE FROM teams WHERE slug LIKE 'crontest-%'`);
    await server.db.execute(sql`DELETE FROM users WHERE clerk_id LIKE 'crontest_%'`);
    await server.close();
  });

  it('creates a cron schedule with computed next_run_at', async () => {
    const response = await server.inject({
      method: 'POST',
      url: `/api/teams/${teamSlug}/cron`,
      headers: { 'x-test-user-id': ownerId },
      payload: {
        name: 'Daily Report',
        cronExpr: '0 9 * * *',
        jobType: 'task',
        jobConfig: { prompt: 'Generate daily report' },
      },
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    expect(body.name).toBe('Daily Report');
    expect(body.cronExpr).toBe('0 9 * * *');
    expect(body.jobType).toBe('task');
    expect(body.enabled).toBe(true);
    expect(body.nextRunAt).toBeTruthy();
    expect(new Date(body.nextRunAt).getTime()).toBeGreaterThan(Date.now());
    expect(body.lastRunAt).toBeNull();
  });

  it('lists schedules for team', async () => {
    // Create another schedule
    await server.inject({
      method: 'POST',
      url: `/api/teams/${teamSlug}/cron`,
      headers: { 'x-test-user-id': memberId },
      payload: {
        name: 'Hourly Check',
        cronExpr: '0 * * * *',
        jobType: 'chat',
      },
    });

    const response = await server.inject({
      method: 'GET',
      url: `/api/teams/${teamSlug}/cron`,
      headers: { 'x-test-user-id': ownerId },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThanOrEqual(2);
  });

  it('disables a schedule via PATCH', async () => {
    // Create a schedule to disable
    const createRes = await server.inject({
      method: 'POST',
      url: `/api/teams/${teamSlug}/cron`,
      headers: { 'x-test-user-id': ownerId },
      payload: {
        name: 'To Disable',
        cronExpr: '*/30 * * * *',
        jobType: 'task',
      },
    });
    const schedule = JSON.parse(createRes.body);
    expect(schedule.enabled).toBe(true);

    const patchRes = await server.inject({
      method: 'PATCH',
      url: `/api/teams/${teamSlug}/cron/${schedule.id}`,
      headers: { 'x-test-user-id': ownerId },
      payload: { enabled: false },
    });

    expect(patchRes.statusCode).toBe(200);
    const updated = JSON.parse(patchRes.body);
    expect(updated.enabled).toBe(false);
  });

  it('CronRunner.tick() picks up due schedule and queues job', async () => {
    // Snapshot job count before tick
    const jobsBefore = await server.db.select().from(agentJobs)
      .where(eq(agentJobs.teamId, teamId));
    const beforeCount = jobsBefore.length;

    // Create a schedule with next_run_at in the past so it's immediately due
    const pastDate = new Date(Date.now() - 60_000);
    await server.db.insert(cronSchedules).values({
      teamId,
      createdBy: ownerId,
      name: 'Due Now',
      cronExpr: '* * * * *', // every minute
      jobType: 'task',
      jobConfig: { prompt: 'Cron runner test' },
      enabled: true,
      nextRunAt: pastDate,
    }).returning();

    const runner = new CronRunner(server.db, server.jobService);
    const count = await runner.tick();

    expect(count).toBeGreaterThanOrEqual(1);

    // Verify our specific job was created
    const jobsAfter = await server.db.select().from(agentJobs)
      .where(eq(agentJobs.teamId, teamId));
    const cronJob = jobsAfter.find(j => (j.input as any).prompt === 'Cron runner test');
    expect(cronJob).toBeTruthy();
    expect(cronJob!.jobType).toBe('task');
    expect(cronJob!.status).toBe('queued');
    expect(jobsAfter.length).toBeGreaterThan(beforeCount);
  });

  it('updates last_run_at and next_run_at after tick', async () => {
    // Create a due schedule
    const pastDate = new Date(Date.now() - 120_000);
    const [schedule] = await server.db.insert(cronSchedules).values({
      teamId,
      createdBy: ownerId,
      name: 'Check After Tick',
      cronExpr: '*/5 * * * *', // every 5 minutes
      jobType: 'chat',
      jobConfig: {},
      enabled: true,
      nextRunAt: pastDate,
    }).returning();

    const runner = new CronRunner(server.db, server.jobService);
    await runner.tick();

    // Re-read the schedule
    const [updated] = await server.db.select().from(cronSchedules)
      .where(eq(cronSchedules.id, schedule.id));

    expect(updated.lastRunAt).toBeTruthy();
    expect(new Date(updated.lastRunAt!).getTime()).toBeGreaterThan(pastDate.getTime());
    expect(updated.nextRunAt).toBeTruthy();
    expect(new Date(updated.nextRunAt!).getTime()).toBeGreaterThan(Date.now());
  });

  it('rejects invalid cron expression', async () => {
    const response = await server.inject({
      method: 'POST',
      url: `/api/teams/${teamSlug}/cron`,
      headers: { 'x-test-user-id': ownerId },
      payload: {
        name: 'Bad Cron',
        cronExpr: 'not a cron',
        jobType: 'task',
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it('non-member gets 403', async () => {
    // Create an outsider
    const [outsider] = await server.db.insert(users).values({
      clerkId: 'crontest_outsider',
      displayName: 'Cron Outsider',
      email: 'crontest_outsider@test.com',
    }).returning();

    const response = await server.inject({
      method: 'GET',
      url: `/api/teams/${teamSlug}/cron`,
      headers: { 'x-test-user-id': outsider.id },
    });

    expect(response.statusCode).toBe(403);
  });
});
