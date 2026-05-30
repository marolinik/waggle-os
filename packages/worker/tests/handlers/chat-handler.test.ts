import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Job } from 'bullmq';
import type { Db } from '../../../server/src/db/connection.js';
import type { JobData } from '../../src/job-processor.js';

/** Build a minimal Job<JobData> mock — only `.data` is exercised by handlers. */
function makeJob(data: JobData): Job<JobData> {
  return { data } as unknown as Job<JobData>;
}

vi.mock('@waggle/agent', () => ({
  runAgentLoop: vi.fn(async () => ({
    content: 'Agent response here',
    toolsUsed: ['search_memory'],
    usage: { inputTokens: 100, outputTokens: 50 },
  })),
  createSystemTools: vi.fn(() => []),
}));

import { chatHandler } from '../../src/handlers/chat-handler.js';
import { runAgentLoop, createSystemTools } from '@waggle/agent';

describe('Chat Handler', () => {
  const mockDb = {} as Db;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls runAgentLoop and returns response with correct shape', async () => {
    const mockJob = makeJob({
      jobId: 'j1',
      teamId: 't1',
      userId: 'u1',
      jobType: 'chat',
      input: { message: 'hello world' },
    });

    const result = await chatHandler(mockJob, mockDb);

    expect(result.response).toBe('Agent response here');
    expect(result.userId).toBe('u1');
    expect(result.model).toBe('claude-sonnet');
    expect(result.toolsUsed).toEqual(['search_memory']);
    expect(result.tokensUsed).toBe(150);
  });

  it('passes correct config to runAgentLoop', async () => {
    const mockJob = makeJob({
      jobId: 'j2',
      teamId: 't1',
      userId: 'u1',
      jobType: 'chat',
      input: { message: 'test message', model: 'gpt-4o' },
    });

    await chatHandler(mockJob, mockDb);

    expect(runAgentLoop).toHaveBeenCalledOnce();
    const callArgs = vi.mocked(runAgentLoop).mock.calls[0][0];
    expect(callArgs.model).toBe('gpt-4o');
    expect(callArgs.messages).toEqual([{ role: 'user', content: 'test message' }]);
    expect(callArgs.systemPrompt).toContain('Waggle AI agent');
    expect(callArgs.tools).toEqual([]);
  });

  it('creates system tools with workspaceDir from input', async () => {
    const mockJob = makeJob({
      jobId: 'j3',
      teamId: 't1',
      userId: 'u1',
      jobType: 'chat',
      input: { message: 'test', workspaceDir: '/custom/workspace' },
    });

    await chatHandler(mockJob, mockDb);

    expect(createSystemTools).toHaveBeenCalledWith('/custom/workspace');
  });

  it('uses default model when not specified in input', async () => {
    const mockJob = makeJob({
      jobId: 'j4',
      teamId: 't1',
      userId: 'u1',
      jobType: 'chat',
      input: { message: 'hi' },
    });

    await chatHandler(mockJob, mockDb);

    const callArgs = vi.mocked(runAgentLoop).mock.calls[0][0];
    expect(callArgs.model).toBe('claude-sonnet');
  });

  it('handles missing message gracefully', async () => {
    const mockJob = makeJob({
      jobId: 'j5',
      teamId: 't1',
      userId: 'u1',
      jobType: 'chat',
      input: {},
    });

    const result = await chatHandler(mockJob, mockDb);

    expect(result.response).toBe('Agent response here');
    expect(result.userId).toBe('u1');
    const callArgs = vi.mocked(runAgentLoop).mock.calls[0][0];
    expect(callArgs.messages).toEqual([{ role: 'user', content: '' }]);
  });

  it('includes userId in response', async () => {
    const mockJob = makeJob({
      jobId: 'j6',
      teamId: 't1',
      userId: 'user-abc',
      jobType: 'chat',
      input: { message: 'test' },
    });

    const result = await chatHandler(mockJob, mockDb);

    expect(result.userId).toBe('user-abc');
  });
});
