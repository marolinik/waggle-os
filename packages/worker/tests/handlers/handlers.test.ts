import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Db } from '../../../server/src/db/connection.js';

// ── Mock @waggle/agent before importing handlers ────────────────────────
vi.mock('@waggle/agent', () => ({
  runAgentLoop: vi.fn(async () => ({
    content: 'Task completed successfully',
    toolsUsed: ['bash', 'read_file'],
    usage: { inputTokens: 200, outputTokens: 100 },
  })),
  createSystemTools: vi.fn(() => [
    { name: 'bash', description: 'Run shell commands', parameters: { type: 'object', properties: {} }, execute: async () => 'ok' },
    { name: 'read_file', description: 'Read a file', parameters: { type: 'object', properties: {} }, execute: async () => 'ok' },
  ]),
}));

// ── Mock drizzle-orm ────────────────────────────────────────────────────
vi.mock('drizzle-orm', () => ({
  eq: vi.fn((col: any, val: any) => ({ column: col, value: val })),
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

// ── Helper: mock DB ─────────────────────────────────────────────────────

function createMockDb(overrides?: {
  selectResult?: any[];
  selectResultSecond?: any[];
}): Db {
  const selectResult = overrides?.selectResult ?? [];
  const hasSecondResult = overrides?.selectResultSecond !== undefined;
  const selectResultSecond = overrides?.selectResultSecond ?? [];
  let selectCallCount = 0;

  const mockChain = (results: any[]) => ({
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
    const mockJob = {
      data: {
        jobId: 'j1',
        teamId: 'team-1',
        userId: 'user-1',
        jobType: 'task',
        input: { taskId: 'task-1' },
      },
    } as any;

    const result = await taskHandler(mockJob, mockDb);

    expect(result.taskId).toBe('task-1');
    expect(result.taskTitle).toBe('Fix login bug');
    expect(result.status).toBe('completed');
    expect(result.result).toBe('Task completed successfully');
    expect(result.toolsUsed).toEqual(['bash', 'read_file']);
    expect(result.tokensUsed).toBe(300); // 200 + 100
    expect(result.userId).toBe('user-1');

    // Verify runAgentLoop was called
    expect(runAgentLoop).toHaveBeenCalledOnce();

    // Verify DB was updated (in-progress then completed)
    expect(mockDb.update).toHaveBeenCalledTimes(2);
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

    const mockJob = {
      data: {
        jobId: 'j2',
        teamId: 'team-1',
        userId: 'user-1',
        jobType: 'task',
        input: { taskId: 'task-2' },
      },
    } as any;

    await expect(taskHandler(mockJob, mockDb)).rejects.toThrow('LLM API timeout');

    // Verify DB was updated: first to in_progress, then back to open on error
    expect(mockDb.update).toHaveBeenCalledTimes(2);
  });

  it('throws if taskId is missing from input', async () => {
    const mockDb = createMockDb();
    const mockJob = {
      data: {
        jobId: 'j3',
        teamId: 'team-1',
        userId: 'user-1',
        jobType: 'task',
        input: {}, // no taskId
      },
    } as any;

    await expect(taskHandler(mockJob, mockDb)).rejects.toThrow('taskHandler requires input.taskId');
  });

  it('throws if task is not found in DB', async () => {
    const mockDb = createMockDb({ selectResult: [] }); // no task found
    const mockJob = {
      data: {
        jobId: 'j4',
        teamId: 'team-1',
        userId: 'user-1',
        jobType: 'task',
        input: { taskId: 'nonexistent-task' },
      },
    } as any;

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
    const mockJob = {
      data: {
        jobId: 'j5',
        teamId: 'team-1', // requesting team doesn't match
        userId: 'user-1',
        jobType: 'task',
        input: { taskId: 'task-5' },
      },
    } as any;

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
    const mockJob = {
      data: {
        jobId: 'j1',
        teamId: 'team-1',
        userId: 'user-1',
        jobType: 'group',
        input: {}, // no groupId
      },
    } as any;

    await expect(groupHandler(mockJob, mockDb)).rejects.toThrow('groupHandler requires input.groupId');
  });

  it('throws if group is not found in DB', async () => {
    const mockDb = createMockDb({ selectResult: [] });
    const mockJob = {
      data: {
        jobId: 'j2',
        teamId: 'team-1',
        userId: 'user-1',
        jobType: 'group',
        input: { groupId: 'nonexistent-group' },
      },
    } as any;

    await expect(groupHandler(mockJob, mockDb)).rejects.toThrow('Agent group not found: nonexistent-group');
  });

  it('throws if group has no members', async () => {
    const mockGroup = { id: 'group-1', strategy: 'parallel', name: 'Test Group' };
    // First select returns the group, second returns empty members
    const mockDb = createMockDb({ selectResult: [mockGroup], selectResultSecond: [] });
    const mockJob = {
      data: {
        jobId: 'j3',
        teamId: 'team-1',
        userId: 'user-1',
        jobType: 'group',
        input: { groupId: 'group-1' },
      },
    } as any;

    await expect(groupHandler(mockJob, mockDb)).rejects.toThrow('Agent group group-1 has no members');
  });

  it('dispatches parallel strategy correctly', async () => {
    const mockGroup = { id: 'group-1', strategy: 'parallel', name: 'Parallel Group' };
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
    const mockJob = {
      data: {
        jobId: 'j4',
        teamId: 'team-1',
        userId: 'user-1',
        jobType: 'group',
        input: { groupId: 'group-1', taskInput: { task: 'analyze data' } },
      },
    } as any;

    const result = await groupHandler(mockJob, mockDb);

    expect(result.strategy).toBe('parallel');
    expect(result.agentCount).toBe(2);
    // runAgentLoop called once per member
    expect(runAgentLoop).toHaveBeenCalledTimes(2);
  });

  it('dispatches sequential strategy correctly', async () => {
    const mockGroup = { id: 'group-2', strategy: 'sequential', name: 'Sequential Group' };
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
    const mockJob = {
      data: {
        jobId: 'j5',
        teamId: 'team-1',
        userId: 'user-1',
        jobType: 'group',
        input: { groupId: 'group-2', taskInput: { task: 'research and draft' } },
      },
    } as any;

    const result = await groupHandler(mockJob, mockDb);

    expect(result.strategy).toBe('sequential');
    expect(result.agentCount).toBe(2);
    expect(runAgentLoop).toHaveBeenCalledTimes(2);
  });

  it('throws for unknown execution strategy', async () => {
    const mockGroup = { id: 'group-3', strategy: 'unknown_strategy', name: 'Bad Group' };
    const mockMembers = [
      {
        member: { roleInGroup: 'worker', executionOrder: 0, groupId: 'group-3', agentId: 'a1' },
        agent: { id: 'a1', name: 'Agent', model: 'claude-sonnet', systemPrompt: null, tools: [] },
      },
    ];

    const mockDb = createMockDb({ selectResult: [mockGroup], selectResultSecond: mockMembers });
    const mockJob = {
      data: {
        jobId: 'j6',
        teamId: 'team-1',
        userId: 'user-1',
        jobType: 'group',
        input: { groupId: 'group-3', taskInput: {} },
      },
    } as any;

    await expect(groupHandler(mockJob, mockDb)).rejects.toThrow('Unknown execution strategy: unknown_strategy');
  });
});
