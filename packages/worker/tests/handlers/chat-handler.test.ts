import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Job } from 'bullmq';
import type { Db } from '../../../server/src/db/connection.js';
import type { JobData } from '../../src/job-processor.js';

/** Build a minimal Job<JobData> mock — only `.data` is exercised by handlers. */
function makeJob(data: JobData): Job<JobData> {
  return { data } as unknown as Job<JobData>;
}

vi.mock('@waggle/agent', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@waggle/agent')>();
  return {
    ...actual,
    runAgentLoop: vi.fn(async () => ({
      content: 'Agent response here',
      toolsUsed: ['read_file'],
      usage: { inputTokens: 100, outputTokens: 50 },
    })),
  };
});

import { chatHandler } from '../../src/handlers/chat-handler.js';
import { runAgentLoop } from '@waggle/agent';

describe('Chat Handler', () => {
  const mockDb = {} as Db;
  let dataDir: string;

  beforeEach(() => {
    vi.clearAllMocks();
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-worker-chat-'));
    vi.stubEnv('WAGGLE_DATA_DIR', dataDir);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    fs.rmSync(dataDir, { recursive: true, force: true });
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
    expect(result.toolsUsed).toEqual(['read_file']);
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
    expect(callArgs.systemPrompt).toContain('read-only');
    expect(callArgs.systemPrompt).toContain('cannot run shell commands, execute code, or write, edit, or delete files');
    expect(callArgs.tools.map(tool => tool.name)).toEqual([
      'read_file',
      'search_files',
      'search_content',
      'web_search',
      'web_fetch',
    ]);
  });

  it('ignores caller workspaceDir and roots tools in the team data directory', async () => {
    const callerWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-attacker-root-'));
    const tenantRoot = path.join(dataDir, 'teams', 'team-1', 'files');
    fs.mkdirSync(tenantRoot, { recursive: true });
    fs.writeFileSync(path.join(tenantRoot, 'tenant.txt'), 'tenant-root-content');
    fs.writeFileSync(path.join(callerWorkspace, 'tenant.txt'), 'caller-root-content');

    const mockJob = makeJob({
      jobId: 'j3',
      teamId: 'team-1',
      userId: 'u1',
      jobType: 'chat',
      input: { message: 'test', workspaceDir: callerWorkspace },
    });

    try {
      await chatHandler(mockJob, mockDb);

      const callArgs = vi.mocked(runAgentLoop).mock.calls[0][0];
      const readFile = callArgs.tools.find(tool => tool.name === 'read_file');
      expect(readFile).toBeDefined();
      await expect(readFile!.execute({ path: 'tenant.txt' })).resolves.toContain('tenant-root-content');
    } finally {
      fs.rmSync(callerWorkspace, { recursive: true, force: true });
    }
  });

  it('fails closed when WAGGLE_DATA_DIR is unavailable', async () => {
    vi.stubEnv('WAGGLE_DATA_DIR', '');
    const mockJob = makeJob({
      jobId: 'j-no-root',
      teamId: 'team-1',
      userId: 'u1',
      jobType: 'chat',
      input: { message: 'test' },
    });

    await expect(chatHandler(mockJob, mockDb)).rejects.toThrow('WAGGLE_DATA_DIR');
    expect(runAgentLoop).not.toHaveBeenCalled();
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
