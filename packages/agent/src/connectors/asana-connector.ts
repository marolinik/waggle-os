/**
 * Asana Connector — manage tasks and projects via REST API.
 * Auth: Bearer (Personal Access Token)
 */

import { BaseConnector, type ConnectorAction, type ConnectorResult } from '../connector-sdk.js';
import type { VaultStore } from '@waggle/core';
import type { ConnectorHealth } from '@waggle/shared';

const API_BASE = 'https://app.asana.com/api/1.0';

export class AsanaConnector extends BaseConnector {
  readonly id = 'asana';
  readonly name = 'Asana';
  readonly description = 'Manage tasks and projects in Asana';
  readonly service = 'asana.com';
  readonly authType = 'bearer' as const;
  readonly substrate = 'waggle' as const;

  readonly actions: ConnectorAction[] = [
    {
      name: 'list_tasks',
      description: 'List tasks in a project or assigned to a user',
      inputSchema: {
        properties: {
          project: { type: 'string', description: 'Project GID to list tasks from' },
          assignee: { type: 'string', description: 'User GID or "me" for current user' },
          workspace: { type: 'string', description: 'Workspace GID (required with assignee)' },
          completed_since: { type: 'string', description: 'ISO date — only tasks completed after this date' },
          limit: { type: 'number', description: 'Results per page (max 100, default 50)' },
        },
      },
      riskLevel: 'low',
    },
    {
      name: 'create_task',
      description: 'Create a new task in Asana',
      inputSchema: {
        properties: {
          name: { type: 'string', description: 'Task name' },
          notes: { type: 'string', description: 'Task description / notes' },
          projects: { type: 'array', items: { type: 'string' }, description: 'Project GIDs to add task to' },
          assignee: { type: 'string', description: 'Assignee user GID or "me"' },
          due_on: { type: 'string', description: 'Due date (YYYY-MM-DD)' },
          workspace: { type: 'string', description: 'Workspace GID (required if no project)' },
          tags: { type: 'array', items: { type: 'string' }, description: 'Tag GIDs' },
        },
        required: ['name'],
      },
      riskLevel: 'medium',
    },
    {
      name: 'update_task',
      description: 'Update an existing Asana task',
      inputSchema: {
        properties: {
          taskId: { type: 'string', description: 'Task GID to update' },
          name: { type: 'string', description: 'New task name' },
          notes: { type: 'string', description: 'New description' },
          completed: { type: 'boolean', description: 'Mark as completed (true/false)' },
          assignee: { type: 'string', description: 'New assignee user GID' },
          due_on: { type: 'string', description: 'New due date (YYYY-MM-DD)' },
        },
        required: ['taskId'],
      },
      riskLevel: 'medium',
    },
    {
      name: 'list_projects',
      description: 'List projects in a workspace',
      inputSchema: {
        properties: {
          workspace: { type: 'string', description: 'Workspace GID' },
          archived: { type: 'boolean', description: 'Include archived projects (default false)' },
          limit: { type: 'number', description: 'Results per page (max 100, default 50)' },
        },
        required: ['workspace'],
      },
      riskLevel: 'low',
    },
    {
      name: 'search_tasks',
      description: 'Search tasks in a workspace using text',
      inputSchema: {
        properties: {
          workspace: { type: 'string', description: 'Workspace GID to search in' },
          text: { type: 'string', description: 'Search query text' },
          completed: { type: 'boolean', description: 'Filter by completion (true/false)' },
          assignee: { type: 'string', description: 'Filter by assignee GID' },
          limit: { type: 'number', description: 'Max results (default 25)' },
        },
        required: ['workspace', 'text'],
      },
      riskLevel: 'low',
    },
  ];

  private token: string | null = null;

  async connect(vault: VaultStore): Promise<void> {
    const cred = vault.getConnectorCredential(this.id);
    this.token = cred?.value ?? null;
  }

  async healthCheck(): Promise<ConnectorHealth> {
    const health: ConnectorHealth = {
      id: this.id,
      name: this.name,
      status: this.token ? 'connected' : 'disconnected',
      lastChecked: new Date().toISOString(),
    };

    if (this.token) {
      try {
        const res = await fetch(`${API_BASE}/users/me`, {
          headers: this.headers(),
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) {
          health.status = 'error';
          health.error = `Asana API returned ${res.status}`;
        }
      } catch (err: unknown) {
        health.status = 'error';
        health.error = err instanceof Error ? err.message : String(err);
      }
    }

    return health;
  }

  async execute(action: string, params: Record<string, unknown>): Promise<ConnectorResult> {
    if (!this.token) return { success: false, error: 'Not connected — add Asana access token in vault' };

    switch (action) {
      case 'list_tasks': return this.listTasks(params);
      case 'create_task': return this.createTask(params);
      case 'update_task': return this.updateTask(params);
      case 'list_projects': return this.listProjects(params);
      case 'search_tasks': return this.searchTasks(params);
      default: return { success: false, error: `Unknown action: ${action}` };
    }
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };
  }

  private async apiGet(path: string, params: Record<string, unknown>, stripKeys: string[] = []): Promise<ConnectorResult> {
    try {
      const query = new URLSearchParams();
      for (const [k, v] of Object.entries(params)) {
        if (!stripKeys.includes(k) && v !== undefined) query.set(k, String(v));
      }
      const qs = query.toString();
      const url = `${API_BASE}${path}${qs ? `?${qs}` : ''}`;
      const res = await fetch(url, { headers: this.headers(), signal: AbortSignal.timeout(10000) });
      if (!res.ok) return { success: false, error: await this.safeErrorText(res, 'Asana API') };
      return { success: true, data: await res.json() };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async apiPost(path: string, body: Record<string, unknown>): Promise<ConnectorResult> {
    try {
      const res = await fetch(`${API_BASE}${path}`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({ data: body }),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return { success: false, error: await this.safeErrorText(res, 'Asana API') };
      return { success: true, data: await res.json() };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async apiPut(path: string, body: Record<string, unknown>): Promise<ConnectorResult> {
    try {
      const res = await fetch(`${API_BASE}${path}`, {
        method: 'PUT',
        headers: this.headers(),
        body: JSON.stringify({ data: body }),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return { success: false, error: await this.safeErrorText(res, 'Asana API') };
      return { success: true, data: await res.json() };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async listTasks(params: Record<string, unknown>): Promise<ConnectorResult> {
    const queryParams: Record<string, unknown> = {};
    if (params.project) queryParams.project = params.project;
    if (params.assignee) queryParams.assignee = params.assignee;
    if (params.workspace) queryParams.workspace = params.workspace;
    if (params.completed_since) queryParams.completed_since = params.completed_since;
    queryParams.limit = (params.limit as number) ?? 50;
    queryParams.opt_fields = 'name,completed,due_on,assignee.name,projects.name';
    return this.apiGet('/tasks', queryParams);
  }

  private async createTask(params: Record<string, unknown>): Promise<ConnectorResult> {
    const body: Record<string, unknown> = { name: params.name };
    if (params.notes) body.notes = params.notes;
    if (params.projects) body.projects = params.projects;
    if (params.assignee) body.assignee = params.assignee;
    if (params.due_on) body.due_on = params.due_on;
    if (params.workspace) body.workspace = params.workspace;
    if (params.tags) body.tags = params.tags;
    return this.apiPost('/tasks', body);
  }

  private async updateTask(params: Record<string, unknown>): Promise<ConnectorResult> {
    const { taskId, ...updates } = params;
    const body: Record<string, unknown> = {};
    if (updates.name) body.name = updates.name;
    if (updates.notes) body.notes = updates.notes;
    if (updates.completed !== undefined) body.completed = updates.completed;
    if (updates.assignee) body.assignee = updates.assignee;
    if (updates.due_on) body.due_on = updates.due_on;
    return this.apiPut(`/tasks/${encodeURIComponent(String(taskId))}`, body);
  }

  private async listProjects(params: Record<string, unknown>): Promise<ConnectorResult> {
    const queryParams: Record<string, unknown> = {
      workspace: params.workspace,
      limit: (params.limit as number) ?? 50,
      opt_fields: 'name,archived,color,created_at,modified_at',
    };
    if (params.archived !== undefined) queryParams.archived = params.archived;
    return this.apiGet('/projects', queryParams, ['workspace']);
  }

  private async searchTasks(params: Record<string, unknown>): Promise<ConnectorResult> {
    const queryParams: Record<string, unknown> = {
      text: params.text,
    };
    if (params.completed !== undefined) queryParams['completed'] = params.completed;
    if (params.assignee) queryParams['assignee.any'] = params.assignee;
    queryParams.limit = (params.limit as number) ?? 25;
    return this.apiGet(`/workspaces/${encodeURIComponent(String(params.workspace))}/tasks/search`, queryParams, ['workspace']);
  }
}
