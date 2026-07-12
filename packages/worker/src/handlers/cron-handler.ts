import type { Job } from 'bullmq';
import type { Db } from '../../../server/src/db/connection.js';
import type { JobData, JobHandler } from '../job-processor.js';

const DELEGATABLE_JOB_TYPES = new Set(['chat', 'task', 'waggle', 'group']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export type CronDispatch = (job: Job<JobData>, db: Db) => Promise<Record<string, unknown>>;

/**
 * Execute a scheduled wrapper job through one of the worker's real handlers.
 * The explicit allowlist prevents cron jobs from recursively dispatching cron
 * or reaching an unregistered handler by passing arbitrary job types.
 */
export function createCronHandler(dispatch: CronDispatch): JobHandler {
  return async (job, db) => {
    const input = job.data.input;
    const delegatedJobType = typeof input.jobType === 'string' ? input.jobType.trim() : '';

    if (!delegatedJobType) {
      throw new Error('cron job requires input.jobType (chat, task, waggle, or group)');
    }

    if (!DELEGATABLE_JOB_TYPES.has(delegatedJobType)) {
      throw new Error(
        `cron job cannot delegate to "${delegatedJobType}"; supported types: ${[...DELEGATABLE_JOB_TYPES].join(', ')}`,
      );
    }

    const delegatedInput = input.jobConfig ?? input.input;
    if (!isRecord(delegatedInput)) {
      throw new Error('cron job requires input.jobConfig or input.input as an object');
    }

    const delegatedJob = {
      ...job,
      data: {
        ...job.data,
        jobType: delegatedJobType,
        input: delegatedInput,
      },
    } as Job<JobData>;

    const result = await dispatch(delegatedJob, db);
    return {
      ...result,
      cron: { delegatedJobType },
    };
  };
}
