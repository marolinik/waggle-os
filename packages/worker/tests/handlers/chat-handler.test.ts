import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Db } from '../../../server/src/db/connection.js';

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
    const mockJob = {
      data: {
        jobId: 'j1',
        teamId: 't1',
        userId: 'u1',
        jobType: 'chat',
        input: { message: 'hello world' },
      },
    } as any;

    const result = await chatHandler(mockJob, mockDb);

    expect(result.response).toBe('Agent response here');
    expect(result.userId).toBe('u1');
    expect(result.model).toBe('claude-sonnet');
    expect(result.toolsUsed).toEqual(['search_memory']);
    expect(result.tokensUsed).toBe(150);
  });

  it('passes correct config to runAgentLoop', async () => {
    const mockJob = {
      data: {
        jobId: 'j2',
        teamId: 't1',
        userId: 'u1',
        jobType: 'chat',
        input: { message: 'test message', model: 'gpt-4o' },
      },
    } as any;

    await chatHandler(mockJob, mockDb);

    expect(runAgentLoop).toHaveBeenCalledOnce();
    const callArgs = vi.mocked(runAgentLoop).mock.calls[0][0];
    expect(callArgs.model).toBe('gpt-4o');
    expect(callArgs.messages).toEqual([{ role: 'user', content: 'test message' }]);
    expect(callArgs.systemPrompt).toContain('Waggle AI agent');
    expect(callArgs.tools).toEqual([]);
  });

  it('creates system tools with workspaceDir from input', async () => {
    const mockJob = {
      data: {
        jobId: 'j3',
        teamId: 't1',
        userId: 'u1',
        jobType: 'chat',
        input: { message: 'test', workspaceDir: '/custom/workspace' },
      },
    } as any;

    await chatHandler(mockJob, mockDb);

    expect(createSystemTools).toHaveBeenCalledWith('/custom/workspace');
  });

  it('uses default model when not specified in input', async () => {
    const mockJob = {
      data: {
        jobId: 'j4',
        teamId: 't1',
        userId: 'u1',
        jobType: 'chat',
        input: { message: 'hi' },
      },
    } as any;

    await chatHandler(mockJob, mockDb);

    const callArgs = vi.mocked(runAgentLoop).mock.calls[0][0];
    expect(callArgs.model).toBe('claude-sonnet');
  });

  it('handles missing message gracefully', async () => {
    const mockJob = {
      data: {
        jobId: 'j5',
        teamId: 't1',
        userId: 'u1',
        jobType: 'chat',
        input: {},
      },
    } as any;

    const result = await chatHandler(mockJob, mockDb);

    expect(result.response).toBe('Agent response here');
    expect(result.userId).toBe('u1');
    const callArgs = vi.mocked(runAgentLoop).mock.calls[0][0];
    expect(callArgs.messages).toEqual([{ role: 'user', content: '' }]);
  });

  it('includes userId in response', async () => {
    const mockJob = {
      data: {
        jobId: 'j6',
        teamId: 't1',
        userId: 'user-abc',
        jobType: 'chat',
        input: { message: 'test' },
      },
    } as any;

    const result = await chatHandler(mockJob, mockDb);

    expect(result.userId).toBe('user-abc');
  });
});
