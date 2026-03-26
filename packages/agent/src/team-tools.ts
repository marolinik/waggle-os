import type { ToolDefinition } from './tools.js';

export interface TeamToolDeps {
  serverUrl: string;
  authToken: string;
  teamSlug: string;
  fetch?: typeof globalThis.fetch;
}

export interface LocalTeamToolDeps {
  localServerUrl: string;
  workspaceId: string;
  teamId: string;
  fetch?: typeof globalThis.fetch;
}

async function apiCall(
  deps: TeamToolDeps,
  method: string,
  path: string,
  body?: unknown
): Promise<unknown> {
  const fetchFn = deps.fetch ?? globalThis.fetch;
  const url = `${deps.serverUrl}${path}`;
  const opts: RequestInit = {
    method,
    headers: {
      'Authorization': `Bearer ${deps.authToken}`,
      'Content-Type': 'application/json',
    },
  };
  if (body !== undefined) {
    opts.body = JSON.stringify(body);
  }
  const res = await fetchFn(url, opts);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API error ${res.status}: ${text}`);
  }
  return res.json();
}

export function createTeamTools(deps: TeamToolDeps): ToolDefinition[] {
  const base = `/api/teams/${deps.teamSlug}`;

  return [
    {
      name: 'check_hive',
      description: 'Search team knowledge graph for existing knowledge on a topic before starting work',
      parameters: {
        type: 'object',
        properties: {
          topic: { type: 'string', description: 'Topic to search for in team knowledge' },
        },
        required: ['topic'],
      },
      execute: async (args) => {
        const topic = args.topic as string;
        const results = await apiCall(deps, 'GET', `${base}/knowledge?search=${encodeURIComponent(topic)}`) as unknown[];
        if (!results || results.length === 0) {
          return 'No existing team knowledge found.';
        }
        return JSON.stringify(results, null, 2);
      },
    },

    {
      name: 'share_to_team',
      description: 'Share a discovery or insight to the team knowledge graph',
      parameters: {
        type: 'object',
        properties: {
          content: { type: 'string', description: 'Content to share with the team' },
          type: { type: 'string', description: 'Type of knowledge (e.g., discovery, insight, pattern)' },
        },
        required: ['content', 'type'],
      },
      execute: async (args) => {
        const content = args.content as string;
        const type = args.type as string;
        const name = content.slice(0, 100);
        await apiCall(deps, 'POST', `${base}/knowledge/entities`, {
          name,
          type,
          properties: { content },
        });
        return `Shared to team: "${name}"`;
      },
    },

    {
      name: 'create_team_task',
      description: 'Create a new task on the team task board',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Task title' },
          description: { type: 'string', description: 'Task description' },
          priority: {
            type: 'string',
            enum: ['low', 'medium', 'high', 'urgent'],
            description: 'Task priority',
          },
        },
        required: ['title'],
      },
      execute: async (args) => {
        const body: Record<string, unknown> = { title: args.title };
        if (args.description) body.description = args.description;
        if (args.priority) body.priority = args.priority;
        const result = await apiCall(deps, 'POST', `${base}/tasks`, body) as Record<string, unknown>;
        return `Created team task: "${args.title}" (id: ${result.id})`;
      },
    },

    {
      name: 'claim_team_task',
      description: 'Pick up an existing task from the team board and mark it as in progress',
      parameters: {
        type: 'object',
        properties: {
          task_id: { type: 'string', description: 'ID of the task to claim' },
        },
        required: ['task_id'],
      },
      execute: async (args) => {
        const taskId = args.task_id as string;
        await apiCall(deps, 'PATCH', `${base}/tasks/${taskId}`, { status: 'in_progress' });
        return `Claimed task ${taskId} — now in progress.`;
      },
    },

    {
      name: 'send_waggle_message',
      description: 'Send a Waggle Dance protocol message to the team channel',
      parameters: {
        type: 'object',
        properties: {
          message: { type: 'string', description: 'Message content' },
          type: {
            type: 'string',
            enum: ['broadcast', 'request', 'response'],
            description: 'Message type (default: broadcast)',
          },
          subtype: {
            type: 'string',
            enum: ['discovery', 'routed_share', 'skill_share', 'task_delegation', 'knowledge_check', 'skill_request'],
            description: 'Message subtype (default: discovery)',
          },
        },
        required: ['message'],
      },
      execute: async (args) => {
        const message = args.message as string;
        const type = (args.type as string) ?? 'broadcast';
        const subtype = (args.subtype as string) ?? 'discovery';
        await apiCall(deps, 'POST', `${base}/messages`, {
          type,
          subtype,
          content: { text: message },
        });
        return `Message sent to team (${type}/${subtype}).`;
      },
    },

    {
      name: 'request_team_capability',
      description: 'Request team admin approval for a restricted capability. Use when a capability is blocked by team policy and the user wants to request access.',
      parameters: {
        type: 'object',
        properties: {
          capability_name: { type: 'string', description: 'Name of the blocked capability (e.g., "bash", "custom-plugin")' },
          capability_type: { type: 'string', enum: ['native', 'skill', 'plugin', 'mcp'], description: 'Type of capability' },
          justification: { type: 'string', description: 'Why the user needs this capability — use their own words' },
        },
        required: ['capability_name', 'capability_type', 'justification'],
      },
      execute: async (args) => {
        const name = args.capability_name as string;
        const type = args.capability_type as string;
        const justification = args.justification as string;

        try {
          const result = await apiCall(deps, 'POST', `${base}/capability-requests`, {
            capabilityName: name,
            capabilityType: type,
            justification,
          });
          const res = result as any;
          if (res.error?.includes('pending')) {
            return `A request for "${name}" is already pending. Your team admin will review it.`;
          }
          return `Request submitted for "${name}" (${type}). Your team admin will be notified and can approve or reject this request. You'll receive a notification when they decide.`;
        } catch (err: any) {
          if (err.message?.includes('409')) {
            return `A request for "${name}" is already pending. Your team admin will review it.`;
          }
          return `Could not submit request: ${err.message}`;
        }
      },
    },
  ];
}

/**
 * Create read-only tools that query the local server's team endpoints.
 * These tools let the agent be "team-aware" in team workspaces.
 */
export function createLocalTeamTools(deps: LocalTeamToolDeps): ToolDefinition[] {
  const fetchFn = deps.fetch ?? globalThis.fetch;
  const base = deps.localServerUrl;

  async function localGet<T = unknown>(path: string): Promise<T> {
    const res = await fetchFn(`${base}${path}`, { method: 'GET' });
    if (!res.ok) throw new Error(`Local API error ${res.status}`);
    return res.json() as Promise<T>;
  }

  return [
    {
      name: 'team_activity',
      description: 'Get recent team activity — what has the team been working on?',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Max items to return (default 10)' },
        },
      },
      execute: async (args) => {
        const limit = (args.limit as number) ?? 10;
        const data = await localGet<{ items: Array<{ authorName: string; summary: string; timestamp: string; type: string }> }>(
          `/api/team/activity?workspaceId=${deps.teamId}&limit=${limit}`,
        );
        if (!data.items || data.items.length === 0) {
          return 'No recent team activity found.';
        }
        return data.items.map(i => `[${i.type}] ${i.authorName}: ${i.summary}`).join('\n');
      },
    },

    {
      name: 'team_tasks',
      description: 'List current tasks on the workspace task board — see what needs doing.',
      parameters: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['open', 'in_progress', 'done'], description: 'Filter by status' },
        },
      },
      execute: async (args) => {
        const statusFilter = args.status ? `?status=${args.status}` : '';
        const data = await localGet<{ tasks: Array<{ id: string; title: string; status: string; assigneeName?: string }> }>(
          `/api/workspaces/${deps.workspaceId}/tasks${statusFilter}`,
        );
        if (!data.tasks || data.tasks.length === 0) {
          return args.status ? `No ${args.status} tasks found.` : 'No tasks on the board.';
        }
        return data.tasks.map(t => {
          const assignee = t.assigneeName ? ` (${t.assigneeName})` : '';
          return `[${t.status}] ${t.title}${assignee} — id: ${t.id}`;
        }).join('\n');
      },
    },

    {
      name: 'team_members',
      description: 'See who is on the team and their current status (online/away/offline).',
      parameters: { type: 'object', properties: {} },
      execute: async () => {
        const data = await localGet<{ members: Array<{ displayName: string; status: string; activitySummary?: string }> }>(
          `/api/team/presence?workspaceId=${deps.teamId}`,
        );
        if (!data.members || data.members.length === 0) {
          return 'No team members found (team server may be unavailable).';
        }
        return data.members.map(m => {
          const activity = m.activitySummary ? ` — ${m.activitySummary}` : '';
          return `${m.displayName} (${m.status})${activity}`;
        }).join('\n');
      },
    },

    {
      name: 'assign_task',
      description: 'Create a task and assign it to a team member. The assigned member will see it on their next catch-up.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Task title' },
          assigneeName: { type: 'string', description: 'Name of the team member to assign this to' },
          assigneeId: { type: 'string', description: 'User ID of the assignee (from team_members)' },
        },
        required: ['title', 'assigneeName'],
      },
      execute: async (args) => {
        const res = await fetchFn(`${base}/api/workspaces/${deps.workspaceId}/tasks`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: args.title,
            assigneeName: args.assigneeName,
            assigneeId: args.assigneeId,
            creatorName: 'Agent',
          }),
        });
        if (!res.ok) throw new Error(`Failed to create task: ${res.status}`);
        const task = await res.json() as { id: string };
        return `Task assigned to ${args.assigneeName}: "${args.title}" (id: ${task.id})`;
      },
    },

    {
      name: 'complete_task',
      description: 'Mark a task as done on the workspace task board.',
      parameters: {
        type: 'object',
        properties: {
          task_id: { type: 'string', description: 'ID of the task to complete' },
        },
        required: ['task_id'],
      },
      execute: async (args) => {
        const res = await fetchFn(`${base}/api/workspaces/${deps.workspaceId}/tasks/${args.task_id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'done' }),
        });
        if (!res.ok) throw new Error(`Failed to complete task: ${res.status}`);
        return `Task ${args.task_id} marked as done.`;
      },
    },
  ];
}
