import { describe, expect, it, vi } from 'vitest';
import type { Job } from 'bullmq';
import type { Db } from '../../../server/src/db/connection.js';
import type { JobData } from '../../src/job-processor.js';
import { createCronHandler } from '../../src/handlers/cron-handler.js';

function makeJob(input: Record<string, unknown>): Job<JobData> {
  return {
    data: {
      jobId: 'cron-job-1',
      teamId: 'team-1',
      userId: 'user-1',
      jobType: 'cron',
      input,
    },
  } as unknown as Job<JobData>;
}

describe('Cron handler', () => {
  const db = {} as Db;

  it('delegates a scheduled job to a real worker handler', async () => {
    const dispatch = vi.fn(async (job: Job<JobData>) => ({
      response: `ran ${job.data.jobType}`,
      input: job.data.input,
    }));
    const handler = createCronHandler(dispatch);

    const result = await handler(makeJob({
      jobType: 'chat',
      jobConfig: { message: 'send the daily brief' },
    }), db);

    expect(dispatch).toHaveBeenCalledOnce();
    const delegatedJob = dispatch.mock.calls[0][0];
    expect(delegatedJob.data.jobType).toBe('chat');
    expect(delegatedJob.data.input).toEqual({ message: 'send the daily brief' });
    expect(result).toEqual({
      response: 'ran chat',
      input: { message: 'send the daily brief' },
      cron: { delegatedJobType: 'chat' },
    });
  });

  it('accepts input as the delegated payload for queue clients', async () => {
    const dispatch = vi.fn(async () => ({ ok: true }));
    const handler = createCronHandler(dispatch);

    await handler(makeJob({
      jobType: 'task',
      input: { taskId: 'task-1' },
    }), db);

    expect(dispatch.mock.calls[0][0].data.input).toEqual({ taskId: 'task-1' });
  });

  it('rejects missing, unsupported, and malformed delegation targets', async () => {
    const handler = createCronHandler(vi.fn(async () => ({ ok: true })));

    await expect(handler(makeJob({}), db)).rejects.toThrow('requires input.jobType');
    await expect(handler(makeJob({ jobType: 'cron', jobConfig: {} }), db))
      .rejects.toThrow('cannot delegate to "cron"');
    await expect(handler(makeJob({ jobType: 'chat' }), db))
      .rejects.toThrow('requires input.jobConfig or input.input');
  });
});
