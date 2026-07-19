import { Queue } from 'bullmq';
import { eq, desc } from 'drizzle-orm';
import { agentJobs } from '../db/schema.js';
import type { Db } from '../db/connection.js';

export class JobService {
  private queue: Queue;

  constructor(private db: Db, redisUrl: string, queueName = 'waggle-jobs') {
    const url = new URL(redisUrl);
    this.queue = new Queue(queueName, {
      connection: {
        host: url.hostname,
        port: parseInt(url.port || '6379'),
      },
    });
  }

  async createJob(
    teamId: string,
    userId: string,
    jobType: string,
    input: Record<string, unknown>,
    jobId?: string,
  ) {
    const [created] = await this.db.insert(agentJobs).values({
      ...(jobId ? { id: jobId } : {}),
      teamId,
      userId,
      jobType,
      status: 'queued',
      input,
    }).onConflictDoNothing({ target: agentJobs.id }).returning();

    const job = created ?? (jobId ? await this.getJob(jobId) : null);
    if (!job) throw new Error('Failed to create job');
    if (job.teamId !== teamId || job.userId !== userId || job.jobType !== jobType) {
      throw new Error('Job idempotency key collision');
    }

    await this.queue.add(job.jobType, {
      jobId: job.id,
      teamId: job.teamId,
      userId: job.userId,
      jobType: job.jobType,
      input: job.input,
    }, { jobId: job.id });

    return job;
  }

  async getJob(jobId: string) {
    const [job] = await this.db.select().from(agentJobs).where(eq(agentJobs.id, jobId));
    return job ?? null;
  }

  async listByTeam(teamId: string, limit = 50) {
    return this.db.select().from(agentJobs)
      .where(eq(agentJobs.teamId, teamId))
      .orderBy(desc(agentJobs.createdAt))
      .limit(Math.min(limit, 100));
  }

  async updateJobStatus(jobId: string, status: string, output?: Record<string, unknown>) {
    const updates: Record<string, unknown> = { status };
    if (status === 'running') updates.startedAt = new Date();
    if (status === 'completed' || status === 'failed') {
      updates.completedAt = new Date();
      if (output) updates.output = output;
    }
    const [updated] = await this.db.update(agentJobs)
      .set(updates)
      .where(eq(agentJobs.id, jobId))
      .returning();
    return updated;
  }

  async cancelJob(jobId: string) {
    // Update DB status
    const updated = await this.updateJobStatus(jobId, 'cancelled');

    // Try to remove from BullMQ queue
    try {
      const bullJob = await this.queue.getJob(jobId);
      if (bullJob) {
        const state = await bullJob.getState();
        if (state === 'waiting' || state === 'delayed') {
          await bullJob.remove();
        } else if (state === 'active') {
          await bullJob.moveToFailed(new Error('Cancelled by user'), 'cancelled', true);
        }
      }
    } catch {
      // Queue removal failed — DB status is still updated
    }

    return updated;
  }

  async close() {
    await this.queue.close();
  }
}
