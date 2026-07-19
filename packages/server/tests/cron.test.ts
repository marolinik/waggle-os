import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { buildServer } from '../src/index.js';
import { users, teams, teamMembers, cronSchedules, agentJobs } from '../src/db/schema.js';
import { sql, eq } from 'drizzle-orm';
import { CronRunner } from '../src/scheduler/cron-runner.js';
import { CronService } from '../src/services/cron-service.js';

async function waitFor(
  predicate: () => Promise<boolean>,
  message: string,
  timeoutMs = 1_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error(message);
}

describe('Cron Scheduler (Task 3.16)', () => {
  let server: Awaited<ReturnType<typeof buildServer>>;
  let ownerId: string;
  let memberId: string;
  let attackerId: string;
  let teamSlug: string;
  let teamId: string;
  let attackerTeamSlug: string;

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

    const [attacker] = await server.db.insert(users).values({
      clerkId: 'crontest_attacker',
      displayName: 'Cron Attacker',
      email: 'crontest_attacker@test.com',
    }).returning();
    attackerId = attacker.id;

    // Create team
    const [team] = await server.db.insert(teams).values({
      name: 'Cron Test Team',
      slug: 'crontest-cron',
      ownerId,
    }).returning();
    teamId = team.id;
    teamSlug = team.slug;

    const [attackerTeam] = await server.db.insert(teams).values({
      name: 'Cron Attacker Team',
      slug: 'crontest-attacker',
      ownerId: attackerId,
    }).returning();
    attackerTeamSlug = attackerTeam.slug;

    await server.db.insert(teamMembers).values([
      { teamId, userId: ownerId, role: 'owner' },
      { teamId, userId: memberId, role: 'member' },
      { teamId: attackerTeam.id, userId: attackerId, role: 'owner' },
    ]);

    // Override auth handler for testing
    server._authHandler.fn = async function (request: FastifyRequest, reply: FastifyReply) {
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

  it('returns the same not-found response for missing and foreign-team schedule ids without mutation', async () => {
    const createRes = await server.inject({
      method: 'POST',
      url: `/api/teams/${teamSlug}/cron`,
      headers: { 'x-test-user-id': ownerId },
      payload: {
        name: 'Victim Schedule',
        cronExpr: '15 * * * *',
        jobType: 'task',
      },
    });
    const schedule = JSON.parse(createRes.body);

    const foreignRes = await server.inject({
      method: 'PATCH',
      url: `/api/teams/${attackerTeamSlug}/cron/${schedule.id}`,
      headers: { 'x-test-user-id': attackerId },
      payload: { name: 'Hijacked Schedule', enabled: false },
    });
    const missingRes = await server.inject({
      method: 'PATCH',
      url: `/api/teams/${attackerTeamSlug}/cron/00000000-0000-4000-8000-000000000001`,
      headers: { 'x-test-user-id': attackerId },
      payload: { enabled: false },
    });

    expect(foreignRes.statusCode).toBe(404);
    expect(foreignRes.json()).toEqual({ error: 'Schedule not found' });
    expect(missingRes.statusCode).toBe(404);
    expect(missingRes.json()).toEqual(foreignRes.json());

    const [persisted] = await server.db.select().from(cronSchedules)
      .where(eq(cronSchedules.id, schedule.id));
    expect(persisted.name).toBe('Victim Schedule');
    expect(persisted.enabled).toBe(true);
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

  it.each(['cron', 'shell'])('rejects unsupported scheduled job type %s before persistence', async (jobType) => {
    const name = `Unsupported ${jobType}`;
    const response = await server.inject({
      method: 'POST',
      url: `/api/teams/${teamSlug}/cron`,
      headers: { 'x-test-user-id': ownerId },
      payload: {
        name,
        cronExpr: '0 4 * * *',
        jobType,
      },
    });

    expect(response.statusCode).toBe(400);
    const schedules = await server.db.select().from(cronSchedules)
      .where(eq(cronSchedules.teamId, teamId));
    expect(schedules.some(schedule => schedule.name === name)).toBe(false);
  });

  it('CronService refuses unsupported job types outside route validation', async () => {
    const cronService = new CronService(server.db);

    await expect(cronService.create(teamId, ownerId, {
      name: 'Direct Unsafe Schedule',
      cronExpr: '0 5 * * *',
      jobType: 'shell',
    })).rejects.toThrow('Unsupported scheduled job type: shell');

    const schedules = await server.db.select().from(cronSchedules)
      .where(eq(cronSchedules.teamId, teamId));
    expect(schedules.some(schedule => schedule.name === 'Direct Unsafe Schedule')).toBe(false);
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
    const cronJob = jobsAfter.find(j => (j.input as { prompt?: string }).prompt === 'Cron runner test');
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

  it('runs due schedules through the Fastify lifecycle without a manual tick', async () => {
    const lifecycleConfig = { port: 0 };
    const lifecycleServer = await buildServer(lifecycleConfig);
    const marker = `lifecycle-${Date.now()}`;
    let scheduleId: string | undefined;

    try {
      const [schedule] = await lifecycleServer.db.insert(cronSchedules).values({
        teamId,
        createdBy: ownerId,
        name: 'Lifecycle Due Schedule',
        cronExpr: '* * * * *',
        jobType: 'task',
        jobConfig: { marker, prompt: 'Lifecycle cron test' },
        enabled: true,
        nextRunAt: new Date(Date.now() - 60_000),
      }).returning();
      scheduleId = schedule.id;
      expect(schedule.lastRunAt).toBeNull();

      await lifecycleServer.ready();
      await waitFor(async () => {
        const [persisted] = await lifecycleServer.db.select().from(cronSchedules)
          .where(eq(cronSchedules.id, schedule.id));
        return persisted?.lastRunAt !== null;
      }, 'Fastify lifecycle did not advance the due cron schedule');

      const [advanced] = await lifecycleServer.db.select().from(cronSchedules)
        .where(eq(cronSchedules.id, schedule.id));
      expect(advanced.nextRunAt?.getTime()).toBeGreaterThan(Date.now());

      const jobs = await lifecycleServer.db.select().from(agentJobs)
        .where(eq(agentJobs.teamId, teamId));
      expect(jobs.some(job => (job.input as { marker?: string }).marker === marker)).toBe(true);
    } finally {
      const jobs = await lifecycleServer.db.select().from(agentJobs)
        .where(eq(agentJobs.teamId, teamId));
      for (const job of jobs.filter(item => (item.input as { marker?: string }).marker === marker)) {
        await lifecycleServer.jobService.cancelJob(job.id);
      }
      if (scheduleId) {
        await lifecycleServer.db.delete(cronSchedules)
          .where(eq(cronSchedules.id, scheduleId));
      }
      await lifecycleServer.close();
    }
  });

  it('skips a legacy invalid cron expression before queueing and continues later schedules', async () => {
    const pastDate = new Date(Date.now() - 60_000);
    const invalidMarker = `invalid-cron-${Date.now()}`;
    const validMarker = `valid-after-invalid-${Date.now()}`;
    const [invalidSchedule] = await server.db.insert(cronSchedules).values({
      teamId,
      createdBy: ownerId,
      name: 'Legacy Invalid Cron',
      cronExpr: 'not a cron expression',
      jobType: 'task',
      jobConfig: { marker: invalidMarker },
      enabled: true,
      nextRunAt: pastDate,
    }).returning();
    await server.db.insert(cronSchedules).values({
      teamId,
      createdBy: ownerId,
      name: 'Valid After Invalid Cron',
      cronExpr: '* * * * *',
      jobType: 'task',
      jobConfig: { marker: validMarker },
      enabled: true,
      nextRunAt: pastDate,
    });
    const errors: unknown[] = [];
    const runner = new CronRunner(server.db, server.jobService, error => errors.push(error));
    let validJob: typeof agentJobs.$inferSelect | undefined;

    try {
      await expect(runner.tick()).resolves.toBe(1);
      const jobs = await server.db.select().from(agentJobs)
        .where(eq(agentJobs.teamId, teamId));
      expect(jobs.some(job => (job.input as { marker?: string }).marker === invalidMarker)).toBe(false);
      validJob = jobs.find(job => (job.input as { marker?: string }).marker === validMarker);
      expect(validJob?.status).toBe('queued');
      expect(errors).toHaveLength(1);

      const [persistedInvalid] = await server.db.select().from(cronSchedules)
        .where(eq(cronSchedules.id, invalidSchedule.id));
      expect(persistedInvalid.lastRunAt).toBeNull();
      expect(persistedInvalid.nextRunAt?.getTime()).toBe(pastDate.getTime());
    } finally {
      if (validJob) await server.jobService.cancelJob(validJob.id);
    }
  });

  it('skips an unsafe legacy schedule while queueing an allowed due schedule', async () => {
    const pastDate = new Date(Date.now() - 60_000);
    const [unsafeSchedule, validSchedule] = await server.db.insert(cronSchedules).values([
      {
        teamId,
        createdBy: ownerId,
        name: 'Legacy Recursive Cron',
        cronExpr: '* * * * *',
        jobType: 'cron',
        jobConfig: { marker: 'blocked-recursive-cron' },
        enabled: true,
        nextRunAt: pastDate,
      },
      {
        teamId,
        createdBy: ownerId,
        name: 'Allowed Due Chat',
        cronExpr: '* * * * *',
        jobType: 'chat',
        jobConfig: { marker: 'allowed-due-chat', message: 'Scheduled read-only check' },
        enabled: true,
        nextRunAt: pastDate,
      },
    ]).returning();

    const runner = new CronRunner(server.db, server.jobService);
    let unsafeJob: typeof agentJobs.$inferSelect | undefined;
    let validJob: typeof agentJobs.$inferSelect | undefined;

    try {
      const count = await runner.tick();
      const jobs = await server.db.select().from(agentJobs)
        .where(eq(agentJobs.teamId, teamId));
      unsafeJob = jobs.find(job => (job.input as { marker?: string }).marker === 'blocked-recursive-cron');
      validJob = jobs.find(job => (job.input as { marker?: string }).marker === 'allowed-due-chat');

      expect(count).toBe(1);
      expect(unsafeJob).toBeUndefined();
      expect(validJob?.jobType).toBe('chat');

      const [persistedUnsafe] = await server.db.select().from(cronSchedules)
        .where(eq(cronSchedules.id, unsafeSchedule.id));
      const [persistedValid] = await server.db.select().from(cronSchedules)
        .where(eq(cronSchedules.id, validSchedule.id));
      expect(persistedUnsafe.lastRunAt).toBeNull();
      expect(persistedUnsafe.nextRunAt?.getTime()).toBe(pastDate.getTime());
      expect(persistedValid.lastRunAt).toBeTruthy();
      expect(persistedValid.nextRunAt!.getTime()).toBeGreaterThan(Date.now());
    } finally {
      if (unsafeJob) await server.jobService.cancelJob(unsafeJob.id);
      if (validJob) await server.jobService.cancelJob(validJob.id);
    }
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
