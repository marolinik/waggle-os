import type { Job } from 'bullmq';
import type { Db } from '../../server/src/db/connection.js';

export interface JobData {
  jobId: string;
  teamId: string;
  userId: string;
  jobType: string;
  input: Record<string, unknown>;
}

export type JobHandler = (job: Job<JobData>, db: Db) => Promise<Record<string, unknown>>;

export class JobProcessor {
  private handlers = new Map<string, JobHandler>();

  register(jobType: string, handler: JobHandler): void {
    this.handlers.set(jobType, handler);
  }

  async process(job: Job<JobData>, db: Db): Promise<Record<string, unknown>> {
    const handler = this.handlers.get(job.data.jobType);
    if (!handler) {
      throw new Error(`No handler registered for job type: ${job.data.jobType}`);
    }
    return handler(job, db);
  }
}
