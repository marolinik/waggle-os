import { describe, expect, it, vi } from 'vitest';
import type { Job } from 'bullmq';
import type { Db } from '../../../server/src/db/connection.js';
import type { JobData } from '../../src/job-processor.js';
import { createWaggleHandler } from '../../src/handlers/waggle-handler.js';

function makeJob(input: Record<string, unknown>): Job<JobData> {
  return {
    data: {
      jobId: 'waggle-job-1',
      teamId: 'team-1',
      userId: 'user-1',
      jobType: 'waggle',
      input,
    },
  } as unknown as Job<JobData>;
}

describe('Waggle worker handler', () => {
  const db = {} as Db;

  it('queues a real child chat job for task delegation', async () => {
    const enqueueWorker = vi.fn(async () => 'child-job-1');
    const handler = createWaggleHandler({ enqueueWorker });

    const result = await handler(makeJob({
      type: 'request',
      subtype: 'task_delegation',
      content: { task: 'Analyze Q4 data', role: 'analyst', context: 'Use the latest report' },
    }), db);

    expect(enqueueWorker).toHaveBeenCalledWith({
      teamId: 'team-1',
      userId: 'user-1',
      task: 'Analyze Q4 data',
      role: 'analyst',
      context: 'Use the latest report',
    });
    expect(result.response).toContain('child-job-1');
    expect(result.handled).toBe(true);
  });

  it('reports missing capabilities as unavailable instead of fabricating success', async () => {
    const handler = createWaggleHandler();

    const result = await handler(makeJob({
      type: 'request',
      subtype: 'skill_request',
      content: { query: 'something-that-does-not-exist' },
    }), db);

    expect(result.response).toContain('available):');
    expect(result.response).toContain('not available');
  });

  it('returns a concrete legacy knowledge gap instead of a stub marker', async () => {
    const mockDb = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => []),
          })),
        })),
      })),
    } as unknown as Db;
    const handler = createWaggleHandler();

    const result = await handler(makeJob({ topic: 'Q4 planning' }), mockDb);

    expect(result.gaps).toEqual([
      'No team knowledge matched "Q4 planning".',
      'No team tasks matched "Q4 planning".',
    ]);
    expect(result.recommendation).toContain('Create a knowledge entry or task');
    expect(JSON.stringify(result)).not.toContain('[Stub]');
  });
});
