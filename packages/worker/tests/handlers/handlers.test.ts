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

// ── Mock @waggle/agent before importing handlers ────────────────────────
vi.mock('@waggle/agent', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@waggle/agent')>();
  return {
    ...actual,
    runAgentLoop: vi.fn(async () => ({
      content: 'Task completed successfully',
      toolsUsed: ['read_file'],
      usage: { inputTokens: 200, outputTokens: 100 },
    })),
  };
});

// ── Mock drizzle-orm ────────────────────────────────────────────────────
vi.mock('drizzle-orm', () => ({
  eq: vi.fn((col: unknown, val: unknown) => ({ column: col, value: val })),
}));

// ── Mock server DB schema ───────────────────────────────────────────────
vi.mock('../../../server/src/db/schema.js', () => ({
  tasks: {
    id: 'tasks.id',
    teamId: 'tasks.teamId',
    status: 'tasks.status',
    assignedTo: 'tasks.assignedTo',
    updatedAt: 'tasks.updatedAt',
    title: 'tasks.title',
    description: 'tasks.description',
    priority: 'tasks.priority',
  },
  agentGroups: { id: 'agent_groups.id' },
  agentGroupMembers: {
    groupId: 'agent_group_members.groupId',
    agentId: 'agent_group_members.agentId',
    executionOrder: 'agent_group_members.executionOrder',
  },
  agents: { id: 'agents.id' },
}));

import { taskHandler } from '../../src/handlers/task-handler.js';
import { groupHandler } from '../../src/handlers/group-handler.js';
import { runAgentLoop } from '@waggle/agent';

let dataDir: string;

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-worker-handlers-'));
  vi.stubEnv('WAGGLE_DATA_DIR', dataDir);
});

afterEach(() => {
  vi.unstubAllEnvs();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

// ── Helper: mock DB ─────────────────────────────────────────────────────

function createMockDb(overrides?: {
  selectResult?: unknown[];
  selectResultSecond?: unknown[];
}): Db {
  const selectResult = overrides?.selectResult ?? [];
  const hasSecondResult = overrides?.selectResultSecond !== undefined;
  const selectResultSecond = overrides?.selectResultSecond ?? [];
  let selectCallCount = 0;

  const mockChain = (results: unknown[]) => ({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(results),
      innerJoin: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(results),
      }),
    }),
  });

  return {
    select: vi.fn(() => {
      selectCallCount++;
      if (selectCallCount === 1) return mockChain(selectResult);
      return mockChain(hasSecondResult ? selectResultSecond : selectResult);
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    }),
  } as unknown as Db;
}

// ═══════════════════════════════════════════════════════════════════════
// Task Handler Tests (11F-7)
// ═══════════════════════════════════════════════════════════════════════

describe('Task Handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('executes a task job and returns results', async () => {
    const mockTask = {
      id: 'task-1',
      title: 'Fix login bug',
      description: 'Users cannot log in with SSO',
      teamId: 'team-1',
      priority: 'high',
      status: 'open',
    };

    const mockDb = createMockDb({ selectResult: [mockTask] });
    const mockJob = makeJob({
      jobId: 'j1',
      teamId: 'team-1',
      userId: 'user-1',
      jobType: 'task',
      input: { taskId: 'task-1' },
    });

    const result = await taskHandler(mockJob, mockDb);

    expect(result.taskId).toBe('task-1');
    expect(result.taskTitle).toBe('Fix login bug');
    expect(result.status).toBe('completed');
    expect(result.result).toBe('Task completed successfully');
    expect(result.toolsUsed).toEqual(['read_file']);
    expect(result.tokensUsed).toBe(300); // 200 + 100
    expect(result.userId).toBe('user-1');

    // Verify runAgentLoop was called
    expect(runAgentLoop).toHaveBeenCalledOnce();

    // Verify DB was updated (in-progress then completed)
    expect(mockDb.update).toHaveBeenCalledTimes(2);
  });

  it('uses the trusted team root, read-only tools, and truthful task prompt', async () => {
    const mockTask = {
      id: 'task-policy',
      title: 'Inspect login bug',
      description: 'Explain the likely cause without changing files',
      teamId: 'team-1',
      priority: 'high',
      status: 'open',
    };
    const tenantRoot = path.join(dataDir, 'teams', 'team-1', 'files');
    const callerWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-task-caller-'));
    fs.mkdirSync(tenantRoot, { recursive: true });
    fs.writeFileSync(path.join(tenantRoot, 'marker.txt'), 'tenant-root-content');
    fs.writeFileSync(path.join(callerWorkspace, 'marker.txt'), 'caller-root-content');

    const mockDb = createMockDb({ selectResult: [mockTask] });
    const mockJob = makeJob({
      jobId: 'j-policy',
      teamId: 'team-1',
      userId: 'user-1',
      jobType: 'task',
      input: { taskId: 'task-policy', model: 'gpt-4o', workspaceDir: callerWorkspace },
    });

    try {
      await taskHandler(mockJob, mockDb);

      const call = vi.mocked(runAgentLoop).mock.calls[0][0];
      expect(call.model).toBe('gpt-4o');
      expect(call.messages).toEqual([{
        role: 'user',
        content: 'Execute this task: Inspect login bug\n\nExplain the likely cause without changing files',
      }]);
      expect(call.systemPrompt).toContain('non-interactive read-only worker');
      expect(call.systemPrompt).toContain('cannot run shell commands, execute code, or write, edit, or delete files');
      expect(call.systemPrompt).toContain('Task: Inspect login bug');
      expect(call.tools.map(tool => tool.name)).toEqual([
        'read_file',
        'search_files',
        'search_content',
        'web_search',
        'web_fetch',
      ]);
      const readFile = call.tools.find(tool => tool.name === 'read_file');
      await expect(readFile!.execute({ path: 'marker.txt' })).resolves.toContain('tenant-root-content');
    } finally {
      fs.rmSync(callerWorkspace, { recursive: true, force: true });
    }
  });

  it('fails closed before agent execution when worker data configuration is missing', async () => {
    vi.stubEnv('WAGGLE_DATA_DIR', '');
    const mockTask = {
      id: 'task-no-root',
      title: 'Inspect task',
      description: null,
      teamId: 'team-1',
      priority: null,
      status: 'open',
    };
    const mockDb = createMockDb({ selectResult: [mockTask] });
    const mockJob = makeJob({
      jobId: 'j-no-root',
      teamId: 'team-1',
      userId: 'user-1',
      jobType: 'task',
      input: { taskId: 'task-no-root' },
    });

    await expect(taskHandler(mockJob, mockDb)).rejects.toThrow('WAGGLE_DATA_DIR');
    expect(runAgentLoop).not.toHaveBeenCalled();
  });

  it('fails closed before agent execution when the runtime teamId is unsafe', async () => {
    const mockTask = {
      id: 'task-bad-team',
      title: 'Inspect task',
      description: null,
      teamId: '../other',
      priority: null,
      status: 'open',
    };
    const mockDb = createMockDb({ selectResult: [mockTask] });
    const mockJob = makeJob({
      jobId: 'j-bad-team',
      teamId: '../other',
      userId: 'user-1',
      jobType: 'task',
      input: { taskId: 'task-bad-team' },
    });

    await expect(taskHandler(mockJob, mockDb)).rejects.toThrow('Invalid teamId');
    expect(runAgentLoop).not.toHaveBeenCalled();
  });

  it('throws error and resets task to open on agent failure', async () => {
    const mockTask = {
      id: 'task-2',
      title: 'Deploy service',
      description: null,
      teamId: 'team-1',
      priority: null,
      status: 'open',
    };

    const mockDb = createMockDb({ selectResult: [mockTask] });
    vi.mocked(runAgentLoop).mockRejectedValueOnce(new Error('LLM API timeout'));

    const mockJob = makeJob({
      jobId: 'j2',
      teamId: 'team-1',
      userId: 'user-1',
      jobType: 'task',
      input: { taskId: 'task-2' },
    });

    await expect(taskHandler(mockJob, mockDb)).rejects.toThrow('LLM API timeout');

    // Verify DB was updated: first to in_progress, then back to open on error
    expect(mockDb.update).toHaveBeenCalledTimes(2);
  });

  it('throws if taskId is missing from input', async () => {
    const mockDb = createMockDb();
    const mockJob = makeJob({
      jobId: 'j3',
      teamId: 'team-1',
      userId: 'user-1',
      jobType: 'task',
      input: {}, // no taskId
    });

    await expect(taskHandler(mockJob, mockDb)).rejects.toThrow('taskHandler requires input.taskId');
  });

  it('throws if task is not found in DB', async () => {
    const mockDb = createMockDb({ selectResult: [] }); // no task found
    const mockJob = makeJob({
      jobId: 'j4',
      teamId: 'team-1',
      userId: 'user-1',
      jobType: 'task',
      input: { taskId: 'nonexistent-task' },
    });

    await expect(taskHandler(mockJob, mockDb)).rejects.toThrow('Task not found: nonexistent-task');
  });

  it('throws if task belongs to a different team', async () => {
    const mockTask = {
      id: 'task-5',
      title: 'Other team task',
      description: null,
      teamId: 'team-other', // different team
      priority: null,
      status: 'open',
    };

    const mockDb = createMockDb({ selectResult: [mockTask] });
    const mockJob = makeJob({
      jobId: 'j5',
      teamId: 'team-1', // requesting team doesn't match
      userId: 'user-1',
      jobType: 'task',
      input: { taskId: 'task-5' },
    });

    await expect(taskHandler(mockJob, mockDb)).rejects.toThrow(
      'Task task-5 does not belong to team team-1',
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Group Handler Tests (11F-7)
// ═══════════════════════════════════════════════════════════════════════

describe('Group Handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws if groupId is missing from input', async () => {
    const mockDb = createMockDb();
    const mockJob = makeJob({
      jobId: 'j1',
      teamId: 'team-1',
      userId: 'user-1',
      jobType: 'group',
      input: {}, // no groupId
    });

    await expect(groupHandler(mockJob, mockDb)).rejects.toThrow('groupHandler requires input.groupId');
  });

  it('throws if group is not found in DB', async () => {
    const mockDb = createMockDb({ selectResult: [] });
    const mockJob = makeJob({
      jobId: 'j2',
      teamId: 'team-1',
      userId: 'user-1',
      jobType: 'group',
      input: { groupId: 'nonexistent-group' },
    });

    await expect(groupHandler(mockJob, mockDb)).rejects.toThrow('Agent group not found: nonexistent-group');
  });

  it('rejects a group owned by another user before policy or agent execution', async () => {
    const mockGroup = {
      id: 'group-foreign',
      strategy: 'parallel',
      name: 'Foreign Group',
      userId: 'other-user',
    };
    const mockMembers = [{
      member: { roleInGroup: 'worker', executionOrder: 0, groupId: 'group-foreign', agentId: 'a1' },
      agent: { id: 'a1', name: 'Reader', model: 'claude-sonnet', systemPrompt: null, tools: [] },
    }];
    const mockDb = createMockDb({ selectResult: [mockGroup], selectResultSecond: mockMembers });
    const mockJob = makeJob({
      jobId: 'j-foreign',
      teamId: 'team-1',
      userId: 'user-1',
      jobType: 'group',
      input: { groupId: 'group-foreign', taskInput: { task: 'inspect' } },
    });

    await expect(groupHandler(mockJob, mockDb)).rejects.toThrow('Agent group not found: group-foreign');
    expect(mockDb.select).toHaveBeenCalledTimes(1);
    expect(fs.existsSync(path.join(dataDir, 'teams'))).toBe(false);
    expect(runAgentLoop).not.toHaveBeenCalled();
  });

  it('throws if group has no members', async () => {
    const mockGroup = { id: 'group-1', strategy: 'parallel', name: 'Test Group', userId: 'user-1' };
    // First select returns the group, second returns empty members
    const mockDb = createMockDb({ selectResult: [mockGroup], selectResultSecond: [] });
    const mockJob = makeJob({
      jobId: 'j3',
      teamId: 'team-1',
      userId: 'user-1',
      jobType: 'group',
      input: { groupId: 'group-1' },
    });

    await expect(groupHandler(mockJob, mockDb)).rejects.toThrow('Agent group group-1 has no members');
  });

  it('dispatches parallel strategy correctly', async () => {
    const mockGroup = { id: 'group-1', strategy: 'parallel', name: 'Parallel Group', userId: 'user-1' };
    const mockMembers = [
      {
        member: { roleInGroup: 'worker', executionOrder: 0, groupId: 'group-1', agentId: 'a1' },
        agent: { id: 'a1', name: 'Agent Alpha', model: 'claude-sonnet', systemPrompt: 'You are Alpha', tools: [] },
      },
      {
        member: { roleInGroup: 'worker', executionOrder: 1, groupId: 'group-1', agentId: 'a2' },
        agent: { id: 'a2', name: 'Agent Beta', model: 'claude-haiku', systemPrompt: 'You are Beta', tools: [] },
      },
    ];

    const mockDb = createMockDb({ selectResult: [mockGroup], selectResultSecond: mockMembers });
    const mockJob = makeJob({
      jobId: 'j4',
      teamId: 'team-1',
      userId: 'user-1',
      jobType: 'group',
      input: { groupId: 'group-1', taskInput: { task: 'analyze data' } },
    });

    const result = await groupHandler(mockJob, mockDb);

    expect(result.strategy).toBe('parallel');
    expect(result.agentCount).toBe(2);
    // runAgentLoop called once per member
    expect(runAgentLoop).toHaveBeenCalledTimes(2);
    const calls = vi.mocked(runAgentLoop).mock.calls.map(([config]) => config);
    expect(calls[0].model).toBe('claude-sonnet');
    expect(calls[0].messages).toEqual([{ role: 'user', content: 'analyze data' }]);
    expect(calls[0].systemPrompt).toContain('non-interactive read-only worker');
    expect(calls[0].systemPrompt).toContain('You are Alpha');
    expect(calls[1].systemPrompt).toContain('You are Beta');
    for (const call of calls) {
      expect(call.tools.map(tool => tool.name)).toEqual([
        'read_file',
        'search_files',
        'search_content',
        'web_search',
        'web_fetch',
      ]);
    }
  });

  it('ignores taskInput.workspaceDir and filters requested mutating tools', async () => {
    const mockGroup = { id: 'group-policy', strategy: 'parallel', name: 'Policy Group', userId: 'user-1' };
    const mockMembers = [{
      member: { roleInGroup: 'worker', executionOrder: 0, groupId: 'group-policy', agentId: 'a1' },
      agent: {
        id: 'a1',
        name: 'Reader',
        model: 'claude-sonnet',
        systemPrompt: 'Inspect the workspace',
        tools: ['bash', 'write_file', 'read_file'],
      },
    }];
    const tenantRoot = path.join(dataDir, 'teams', 'team-1', 'files');
    const callerWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-group-caller-'));
    fs.mkdirSync(tenantRoot, { recursive: true });
    fs.writeFileSync(path.join(tenantRoot, 'marker.txt'), 'tenant-root-content');
    fs.writeFileSync(path.join(callerWorkspace, 'marker.txt'), 'caller-root-content');

    const mockDb = createMockDb({ selectResult: [mockGroup], selectResultSecond: mockMembers });
    const mockJob = makeJob({
      jobId: 'j-group-policy',
      teamId: 'team-1',
      userId: 'user-1',
      jobType: 'group',
      input: {
        groupId: 'group-policy',
        taskInput: { task: 'inspect', workspaceDir: callerWorkspace },
      },
    });

    try {
      await groupHandler(mockJob, mockDb);

      const call = vi.mocked(runAgentLoop).mock.calls[0][0];
      expect(call.tools.map(tool => tool.name)).toEqual(['read_file']);
      expect(call.systemPrompt).toContain('non-interactive read-only worker');
      expect(call.systemPrompt).toContain('Inspect the workspace');
      const readFile = call.tools.find(tool => tool.name === 'read_file');
      await expect(readFile!.execute({ path: 'marker.txt' })).resolves.toContain('tenant-root-content');
    } finally {
      fs.rmSync(callerWorkspace, { recursive: true, force: true });
    }
  });

  it('fails closed before group execution when worker data configuration is missing', async () => {
    vi.stubEnv('WAGGLE_DATA_DIR', '');
    const mockGroup = { id: 'group-no-root', strategy: 'parallel', name: 'Group', userId: 'user-1' };
    const mockMembers = [{
      member: { roleInGroup: 'worker', executionOrder: 0, groupId: 'group-no-root', agentId: 'a1' },
      agent: { id: 'a1', name: 'Reader', model: 'claude-sonnet', systemPrompt: null, tools: [] },
    }];
    const mockDb = createMockDb({ selectResult: [mockGroup], selectResultSecond: mockMembers });
    const mockJob = makeJob({
      jobId: 'j-group-no-root',
      teamId: 'team-1',
      userId: 'user-1',
      jobType: 'group',
      input: { groupId: 'group-no-root', taskInput: { task: 'inspect' } },
    });

    await expect(groupHandler(mockJob, mockDb)).rejects.toThrow('WAGGLE_DATA_DIR');
    expect(runAgentLoop).not.toHaveBeenCalled();
  });

  it('fails closed before group execution when the runtime teamId is unsafe', async () => {
    const mockGroup = { id: 'group-bad-team', strategy: 'parallel', name: 'Group', userId: 'user-1' };
    const mockMembers = [{
      member: { roleInGroup: 'worker', executionOrder: 0, groupId: 'group-bad-team', agentId: 'a1' },
      agent: { id: 'a1', name: 'Reader', model: 'claude-sonnet', systemPrompt: null, tools: [] },
    }];
    const mockDb = createMockDb({ selectResult: [mockGroup], selectResultSecond: mockMembers });
    const mockJob = makeJob({
      jobId: 'j-group-bad-team',
      teamId: '../other',
      userId: 'user-1',
      jobType: 'group',
      input: { groupId: 'group-bad-team', taskInput: { task: 'inspect' } },
    });

    await expect(groupHandler(mockJob, mockDb)).rejects.toThrow('Invalid teamId');
    expect(runAgentLoop).not.toHaveBeenCalled();
  });

  it('dispatches sequential strategy correctly', async () => {
    const mockGroup = { id: 'group-2', strategy: 'sequential', name: 'Sequential Group', userId: 'user-1' };
    const mockMembers = [
      {
        member: { roleInGroup: 'worker', executionOrder: 0, groupId: 'group-2', agentId: 'a1' },
        agent: { id: 'a1', name: 'Researcher', model: 'claude-sonnet', systemPrompt: 'Research first', tools: [] },
      },
      {
        member: { roleInGroup: 'worker', executionOrder: 1, groupId: 'group-2', agentId: 'a2' },
        agent: { id: 'a2', name: 'Writer', model: 'claude-haiku', systemPrompt: 'Write based on research', tools: [] },
      },
    ];

    const mockDb = createMockDb({ selectResult: [mockGroup], selectResultSecond: mockMembers });
    const mockJob = makeJob({
      jobId: 'j5',
      teamId: 'team-1',
      userId: 'user-1',
      jobType: 'group',
      input: { groupId: 'group-2', taskInput: { task: 'research and draft' } },
    });

    const result = await groupHandler(mockJob, mockDb);

    expect(result.strategy).toBe('sequential');
    expect(result.agentCount).toBe(2);
    expect(runAgentLoop).toHaveBeenCalledTimes(2);
  });

  it('throws for unknown execution strategy', async () => {
    const mockGroup = { id: 'group-3', strategy: 'unknown_strategy', name: 'Bad Group', userId: 'user-1' };
    const mockMembers = [
      {
        member: { roleInGroup: 'worker', executionOrder: 0, groupId: 'group-3', agentId: 'a1' },
        agent: { id: 'a1', name: 'Agent', model: 'claude-sonnet', systemPrompt: null, tools: [] },
      },
    ];

    const mockDb = createMockDb({ selectResult: [mockGroup], selectResultSecond: mockMembers });
    const mockJob = makeJob({
      jobId: 'j6',
      teamId: 'team-1',
      userId: 'user-1',
      jobType: 'group',
      input: { groupId: 'group-3', taskInput: {} },
    });

    await expect(groupHandler(mockJob, mockDb)).rejects.toThrow('Unknown execution strategy: unknown_strategy');
  });
});
