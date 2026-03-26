import { Worker } from 'bullmq';
import { createDb } from '../../server/src/db/connection.js';
import { agentJobs } from '../../server/src/db/schema.js';
import { eq } from 'drizzle-orm';
import { JobProcessor, type JobData } from './job-processor.js';
import Redis from 'ioredis';
import { chatHandler } from './handlers/chat-handler.js';
import { taskHandler } from './handlers/task-handler.js';
import { waggleHandler } from './handlers/waggle-handler.js';
import { groupHandler } from './handlers/group-handler.js';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6381';

function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL environment variable is required');
  return url;
}

export function createWorker(redisUrl = REDIS_URL, databaseUrl?: string, queueName = 'waggle-jobs') {
  const resolvedDbUrl = databaseUrl ?? requireDatabaseUrl();
  const db = createDb(resolvedDbUrl);
  const processor = new JobProcessor();
  const redisPub = new Redis(redisUrl);

  // Register job handlers
  processor.register('chat', chatHandler);
  processor.register('task', taskHandler);
  processor.register('waggle', waggleHandler);
  processor.register('group', groupHandler);
  // Cron handler placeholder (real implementation in Task 3.16)
  processor.register('cron', async (job) => ({ result: 'cron handler placeholder', input: job.data.input }));

  const url = new URL(redisUrl);
  const worker = new Worker<JobData>(queueName, async (job) => {
    // Update status to running
    await db.update(agentJobs)
      .set({ status: 'running', startedAt: new Date() })
      .where(eq(agentJobs.id, job.data.jobId));

    try {
      const result = await processor.process(job, db);

      // Update status to completed
      await db.update(agentJobs)
        .set({ status: 'completed', completedAt: new Date(), output: result })
        .where(eq(agentJobs.id, job.data.jobId));

      // Publish progress to Redis (includes teamId for gateway routing)
      await redisPub.publish(`job:${job.data.jobId}:progress`, JSON.stringify({
        status: 'completed',
        output: result,
        userId: job.data.userId,
        teamId: job.data.teamId,
      }));

      return result;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      await db.update(agentJobs)
        .set({ status: 'failed', completedAt: new Date(), output: { error: message } })
        .where(eq(agentJobs.id, job.data.jobId));
      throw error;
    }
  }, {
    connection: {
      host: url.hostname,
      port: parseInt(url.port || '6379'),
    },
    concurrency: 5,
  });

  // Clean up shared Redis publisher when worker closes
  worker.on('closed', () => {
    redisPub.quit().catch(() => {});
  });

  return { worker, processor, db, redisPub };
}

// Start if run directly
const isDirectRun = process.argv[1]?.replace(/\\/g, '/').includes('worker/src/index');
if (isDirectRun) {
  const { worker } = createWorker();
  console.log('Waggle agent worker started, waiting for jobs...');

  worker.on('completed', (job) => {
    console.log(`Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`Job ${job?.id} failed:`, err.message);
  });
}
