import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createWorker } from '../src/index.js';
import { JobService } from '../../server/src/services/job-service.js';
import { createDb } from '../../server/src/db/connection.js';
import { users, teams, teamMembers, agentJobs } from '../../server/src/db/schema.js';
import { eq, sql } from 'drizzle-orm';

const REDIS_URL = 'redis://localhost:6381';
const DATABASE_URL = 'postgres://waggle:waggle_dev@localhost:5434/waggle';
const QUEUE_NAME = `waggle-jobs-test-${Date.now()}`;

/** Poll for job status until it reaches target or timeout. */
async function waitForJobStatus(
  jobService: JobService,
  jobId: string,
  target: string,
  timeoutMs = 10_000,
  intervalMs = 200,
): Promise<any> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const job = await jobService.getJob(jobId);
    if (job?.status === target || job?.status === 'failed') return job;
    await new Promise(r => setTimeout(r, intervalMs));
  }
  // Return last state even on timeout
  return jobService.getJob(jobId);
}

describe('BullMQ Worker', () => {
  let db: ReturnType<typeof createDb>;
  let jobService: JobService;
  let workerInstance: ReturnType<typeof createWorker>;
  let testUserId: string;
  let testTeamId: string;

  beforeAll(async () => {
    db = createDb(DATABASE_URL);
    jobService = new JobService(db, REDIS_URL, QUEUE_NAME);
    workerInstance = createWorker(REDIS_URL, DATABASE_URL, QUEUE_NAME);

    // Override handlers with fast mocks (real handlers call LiteLLM which isn't running in tests)
    workerInstance.processor.register('chat', async (job) => ({
      response: `Mock response for: ${(job.data.input as any).message}`,
      model: 'mock',
    }));
    workerInstance.processor.register('task', async (job) => ({
      result: `Mock task result`,
      input: job.data.input,
    }));

    // Create test data
    const [user] = await db.insert(users).values({
      clerkId: 'worker_test_user_' + Date.now(),
      displayName: 'Worker Test',
      email: `worker_${Date.now()}@test.com`,
    }).returning();
    testUserId = user.id;

    const [team] = await db.insert(teams).values({
      name: 'Worker Team',
      slug: 'worker-test-' + Date.now(),
      ownerId: testUserId,
    }).returning();
    testTeamId = team.id;

    await db.insert(teamMembers).values({
      teamId: testTeamId,
      userId: testUserId,
      role: 'owner',
    });
  }, 15_000);

  afterAll(async () => {
    try { await workerInstance.worker.close(); } catch { /* ignore */ }
    try { await jobService.close(); } catch { /* ignore */ }
    await db.execute(sql`DELETE FROM agent_jobs WHERE team_id = ${testTeamId}`);
    await db.execute(sql`DELETE FROM team_members WHERE user_id = ${testUserId}`);
    await db.execute(sql`DELETE FROM teams WHERE id = ${testTeamId}`);
    await db.execute(sql`DELETE FROM users WHERE id = ${testUserId}`);
  }, 15_000);

  it('queues job and worker picks it up', async () => {
    const job = await jobService.createJob(testTeamId, testUserId, 'chat', { message: 'hello' });
    expect(job.status).toBe('queued');

    const updated = await waitForJobStatus(jobService, job.id, 'completed');
    expect(updated?.status).toBe('completed');
    expect(updated?.output).toBeDefined();
  }, 15_000);

  it('tracks job status transitions', async () => {
    const job = await jobService.createJob(testTeamId, testUserId, 'chat', { message: 'status test' });

    const completed = await waitForJobStatus(jobService, job.id, 'completed');
    expect(completed?.startedAt).toBeDefined();
    expect(completed?.completedAt).toBeDefined();
    expect(completed?.status).toBe('completed');
  }, 15_000);

  it('marks failed jobs', async () => {
    // Register a failing handler
    workerInstance.processor.register('fail_test', async () => {
      throw new Error('Intentional failure');
    });

    const job = await jobService.createJob(testTeamId, testUserId, 'fail_test', {});

    const failed = await waitForJobStatus(jobService, job.id, 'failed');
    expect(failed?.status).toBe('failed');
    expect((failed?.output as Record<string, unknown>)?.error).toContain('Intentional failure');
  }, 15_000);
});
