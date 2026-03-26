import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTeamTools, createLocalTeamTools, type TeamToolDeps, type LocalTeamToolDeps } from '../src/team-tools.js';
import type { ToolDefinition } from '../src/tools.js';

function makeDeps(fetchMock: ReturnType<typeof vi.fn>): TeamToolDeps {
  return {
    serverUrl: 'http://localhost:3000',
    authToken: 'test-token-123',
    teamSlug: 'alpha-team',
    fetch: fetchMock as unknown as typeof globalThis.fetch,
  };
}

function okResponse(data: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => data,
    text: async () => JSON.stringify(data),
  } as unknown as Response;
}

function errorResponse(status: number, message: string): Response {
  return {
    ok: false,
    status,
    statusText: message,
    text: async () => message,
  } as unknown as Response;
}

describe('createTeamTools', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let deps: TeamToolDeps;
  let tools: ToolDefinition[];

  beforeEach(() => {
    fetchMock = vi.fn();
    deps = makeDeps(fetchMock);
    tools = createTeamTools(deps);
  });

  function getTool(name: string): ToolDefinition {
    const tool = tools.find((t) => t.name === name);
    if (!tool) throw new Error(`Tool "${name}" not found`);
    return tool;
  }

  it('creates all 5 team tools', () => {
    const names = tools.map((t) => t.name);
    expect(names).toContain('check_hive');
    expect(names).toContain('share_to_team');
    expect(names).toContain('create_team_task');
    expect(names).toContain('claim_team_task');
    expect(names).toContain('send_waggle_message');
    expect(names).toContain('request_team_capability');
    expect(tools).toHaveLength(6);
  });

  describe('check_hive', () => {
    it('calls knowledge search API with topic', async () => {
      fetchMock.mockResolvedValueOnce(okResponse([
        { id: '1', name: 'React patterns', type: 'concept' },
        { id: '2', name: 'React hooks', type: 'concept' },
      ]));

      const tool = getTool('check_hive');
      const result = await tool.execute({ topic: 'React' });

      expect(fetchMock).toHaveBeenCalledOnce();
      const [url, opts] = fetchMock.mock.calls[0];
      expect(url).toBe('http://localhost:3000/api/teams/alpha-team/knowledge?search=React');
      expect(opts.method).toBe('GET');
      expect(opts.headers['Authorization']).toBe('Bearer test-token-123');
      expect(result).toContain('React patterns');
    });

    it('returns message when no knowledge found', async () => {
      fetchMock.mockResolvedValueOnce(okResponse([]));

      const tool = getTool('check_hive');
      const result = await tool.execute({ topic: 'quantum computing' });
      expect(result).toContain('No existing team knowledge found');
    });
  });

  describe('share_to_team', () => {
    it('posts to knowledge API', async () => {
      fetchMock.mockResolvedValueOnce(okResponse({ id: 'entity-1' }));

      const tool = getTool('share_to_team');
      const result = await tool.execute({ content: 'Found a great pattern for error handling', type: 'discovery' });

      expect(fetchMock).toHaveBeenCalledOnce();
      const [url, opts] = fetchMock.mock.calls[0];
      expect(url).toBe('http://localhost:3000/api/teams/alpha-team/knowledge/entities');
      expect(opts.method).toBe('POST');
      const body = JSON.parse(opts.body);
      expect(body.name).toBe('Found a great pattern for error handling');
      expect(body.type).toBe('discovery');
      expect(result).toContain('Shared');
    });

    it('truncates name to 100 chars', async () => {
      fetchMock.mockResolvedValueOnce(okResponse({ id: 'entity-2' }));

      const longContent = 'A'.repeat(200);
      const tool = getTool('share_to_team');
      await tool.execute({ content: longContent, type: 'insight' });

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.name.length).toBe(100);
    });
  });

  describe('create_team_task', () => {
    it('posts to tasks API', async () => {
      fetchMock.mockResolvedValueOnce(okResponse({ id: 'task-1', title: 'Fix bug' }));

      const tool = getTool('create_team_task');
      const result = await tool.execute({ title: 'Fix bug', description: 'There is a bug', priority: 'high' });

      expect(fetchMock).toHaveBeenCalledOnce();
      const [url, opts] = fetchMock.mock.calls[0];
      expect(url).toBe('http://localhost:3000/api/teams/alpha-team/tasks');
      expect(opts.method).toBe('POST');
      const body = JSON.parse(opts.body);
      expect(body.title).toBe('Fix bug');
      expect(body.description).toBe('There is a bug');
      expect(body.priority).toBe('high');
      expect(result).toContain('task');
    });
  });

  describe('claim_team_task', () => {
    it('patches task status to in_progress', async () => {
      fetchMock.mockResolvedValueOnce(okResponse({ id: 'task-1', status: 'in_progress' }));

      const tool = getTool('claim_team_task');
      const result = await tool.execute({ task_id: 'task-42' });

      expect(fetchMock).toHaveBeenCalledOnce();
      const [url, opts] = fetchMock.mock.calls[0];
      expect(url).toBe('http://localhost:3000/api/teams/alpha-team/tasks/task-42');
      expect(opts.method).toBe('PATCH');
      const body = JSON.parse(opts.body);
      expect(body.status).toBe('in_progress');
      expect(result).toContain('Claimed');
    });
  });

  describe('send_waggle_message', () => {
    it('sends valid Waggle Dance protocol message', async () => {
      fetchMock.mockResolvedValueOnce(okResponse({ id: 'msg-1' }));

      const tool = getTool('send_waggle_message');
      const result = await tool.execute({ message: 'Found relevant docs', type: 'broadcast', subtype: 'routed_share' });

      expect(fetchMock).toHaveBeenCalledOnce();
      const [url, opts] = fetchMock.mock.calls[0];
      expect(url).toBe('http://localhost:3000/api/teams/alpha-team/messages');
      expect(opts.method).toBe('POST');
      const body = JSON.parse(opts.body);
      expect(body.type).toBe('broadcast');
      expect(body.subtype).toBe('routed_share');
      expect(body.content).toEqual({ text: 'Found relevant docs' });
      expect(result).toContain('broadcast/routed_share');
    });

    it('defaults to broadcast/discovery when type/subtype omitted', async () => {
      fetchMock.mockResolvedValueOnce(okResponse({ id: 'msg-2' }));

      const tool = getTool('send_waggle_message');
      await tool.execute({ message: 'Hello team' });

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.type).toBe('broadcast');
      expect(body.subtype).toBe('discovery');
    });
  });

  describe('error handling', () => {
    it('throws on API error', async () => {
      fetchMock.mockResolvedValueOnce(errorResponse(403, 'Forbidden'));

      const tool = getTool('check_hive');
      await expect(tool.execute({ topic: 'test' })).rejects.toThrow('403');
    });

    it('throws on network failure', async () => {
      fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      const tool = getTool('share_to_team');
      await expect(tool.execute({ content: 'test', type: 'note' })).rejects.toThrow('ECONNREFUSED');
    });
  });
});

// ── Local Team Tools ──────────────────────────────────────────────

describe('createLocalTeamTools', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let localDeps: LocalTeamToolDeps;
  let tools: ToolDefinition[];

  beforeEach(() => {
    fetchMock = vi.fn();
    localDeps = {
      localServerUrl: 'http://127.0.0.1:3333',
      workspaceId: 'ws-123',
      teamId: 'team-abc',
      fetch: fetchMock as unknown as typeof globalThis.fetch,
    };
    tools = createLocalTeamTools(localDeps);
  });

  function getTool(name: string): ToolDefinition {
    const tool = tools.find((t) => t.name === name);
    if (!tool) throw new Error(`Tool "${name}" not found`);
    return tool;
  }

  it('creates 5 local team tools', () => {
    const names = tools.map((t) => t.name);
    expect(names).toContain('team_activity');
    expect(names).toContain('team_tasks');
    expect(names).toContain('team_members');
    expect(names).toContain('assign_task');
    expect(names).toContain('complete_task');
    expect(tools).toHaveLength(5);
  });

  describe('team_activity', () => {
    it('returns formatted activity items', async () => {
      fetchMock.mockResolvedValueOnce(okResponse({
        items: [
          { authorName: 'Alice', summary: 'Added design docs', timestamp: '2026-01-01T00:00:00Z', type: 'memory' },
          { authorName: 'Bob', summary: 'Fixed auth bug', timestamp: '2026-01-01T01:00:00Z', type: 'session' },
        ],
      }));

      const tool = getTool('team_activity');
      const result = await tool.execute({});
      expect(result).toContain('Alice');
      expect(result).toContain('design docs');
      expect(result).toContain('Bob');
    });

    it('returns message when no activity', async () => {
      fetchMock.mockResolvedValueOnce(okResponse({ items: [] }));
      const tool = getTool('team_activity');
      const result = await tool.execute({});
      expect(result).toContain('No recent team activity');
    });
  });

  describe('team_tasks', () => {
    it('returns formatted task list', async () => {
      fetchMock.mockResolvedValueOnce(okResponse({
        tasks: [
          { id: 't1', title: 'Fix bug', status: 'open', assigneeName: 'Alice' },
          { id: 't2', title: 'Add tests', status: 'in_progress' },
        ],
      }));

      const tool = getTool('team_tasks');
      const result = await tool.execute({});
      expect(result).toContain('Fix bug');
      expect(result).toContain('Alice');
      expect(result).toContain('Add tests');
    });

    it('filters by status', async () => {
      fetchMock.mockResolvedValueOnce(okResponse({ tasks: [] }));
      const tool = getTool('team_tasks');
      const result = await tool.execute({ status: 'done' });

      const [url] = fetchMock.mock.calls[0];
      expect(url).toContain('?status=done');
      expect(result).toContain('No done tasks');
    });
  });

  describe('team_members', () => {
    it('returns formatted member list', async () => {
      fetchMock.mockResolvedValueOnce(okResponse({
        members: [
          { displayName: 'Alice', status: 'online', activitySummary: 'Editing docs' },
          { displayName: 'Bob', status: 'away' },
        ],
      }));

      const tool = getTool('team_members');
      const result = await tool.execute({});
      expect(result).toContain('Alice (online)');
      expect(result).toContain('Editing docs');
      expect(result).toContain('Bob (away)');
    });

    it('returns message when no members', async () => {
      fetchMock.mockResolvedValueOnce(okResponse({ members: [] }));
      const tool = getTool('team_members');
      const result = await tool.execute({});
      expect(result).toContain('No team members found');
    });
  });

  describe('assign_task', () => {
    it('creates a task with assignee and returns confirmation', async () => {
      fetchMock.mockResolvedValueOnce(okResponse({ id: 'task-new-1' }));

      const tool = getTool('assign_task');
      const result = await tool.execute({
        title: 'Review the PR',
        assigneeName: 'Alice',
        assigneeId: 'user-alice',
      });

      expect(fetchMock).toHaveBeenCalledOnce();
      const [url, opts] = fetchMock.mock.calls[0];
      expect(url).toBe('http://127.0.0.1:3333/api/workspaces/ws-123/tasks');
      expect(opts.method).toBe('POST');
      const body = JSON.parse(opts.body);
      expect(body.title).toBe('Review the PR');
      expect(body.assigneeName).toBe('Alice');
      expect(body.assigneeId).toBe('user-alice');
      expect(body.creatorName).toBe('Agent');
      expect(result).toContain('Alice');
      expect(result).toContain('Review the PR');
    });
  });

  describe('complete_task', () => {
    it('marks task as done', async () => {
      fetchMock.mockResolvedValueOnce(okResponse({ id: 'task-42', status: 'done' }));

      const tool = getTool('complete_task');
      const result = await tool.execute({ task_id: 'task-42' });

      expect(fetchMock).toHaveBeenCalledOnce();
      const [url, opts] = fetchMock.mock.calls[0];
      expect(url).toBe('http://127.0.0.1:3333/api/workspaces/ws-123/tasks/task-42');
      expect(opts.method).toBe('PATCH');
      const body = JSON.parse(opts.body);
      expect(body.status).toBe('done');
      expect(result).toContain('done');
    });
  });
});
