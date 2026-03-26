/**
 * GitLab Connector — access projects, issues, merge requests, and code.
 * Auth: Bearer (Personal Access Token)
 * Supports self-hosted GitLab via vault metadata.
 */

import { BaseConnector, type ConnectorAction, type ConnectorResult } from '../connector-sdk.js';
import type { VaultStore } from '@waggle/core';
import type { ConnectorHealth } from '@waggle/shared';

const DEFAULT_API_BASE = 'https://gitlab.com/api/v4';

export class GitLabConnector extends BaseConnector {
  readonly id = 'gitlab';
  readonly name = 'GitLab';
  readonly description = 'Access projects, issues, merge requests, and code';
  readonly service = 'gitlab.com';
  readonly authType = 'bearer' as const;
  readonly substrate = 'waggle' as const;

  readonly actions: ConnectorAction[] = [
    {
      name: 'list_projects',
      description: 'List your projects',
      inputSchema: {
        properties: {
          membership: { type: 'boolean', description: 'Only projects you are a member of (default true)' },
          order_by: { type: 'string', enum: ['id', 'name', 'created_at', 'updated_at', 'last_activity_at'], description: 'Sort field' },
          per_page: { type: 'number', description: 'Results per page (max 100)' },
        },
      },
      riskLevel: 'low',
    },
    {
      name: 'list_issues',
      description: 'List issues for a project',
      inputSchema: {
        properties: {
          project_id: { type: 'string', description: 'Project ID or URL-encoded path (e.g., "user/repo")' },
          state: { type: 'string', enum: ['opened', 'closed', 'all'], description: 'Issue state filter' },
          labels: { type: 'string', description: 'Comma-separated label names' },
          per_page: { type: 'number', description: 'Results per page (max 100)' },
        },
        required: ['project_id'],
      },
      riskLevel: 'low',
    },
    {
      name: 'create_issue',
      description: 'Create a new issue in a project',
      inputSchema: {
        properties: {
          project_id: { type: 'string', description: 'Project ID or URL-encoded path' },
          title: { type: 'string', description: 'Issue title' },
          description: { type: 'string', description: 'Issue description (markdown)' },
          labels: { type: 'string', description: 'Comma-separated label names' },
          assignee_ids: { type: 'array', items: { type: 'number' }, description: 'Assignee user IDs' },
        },
        required: ['project_id', 'title'],
      },
      riskLevel: 'medium',
    },
    {
      name: 'list_merge_requests',
      description: 'List merge requests for a project',
      inputSchema: {
        properties: {
          project_id: { type: 'string', description: 'Project ID or URL-encoded path' },
          state: { type: 'string', enum: ['opened', 'closed', 'merged', 'all'], description: 'MR state filter' },
          per_page: { type: 'number', description: 'Results per page (max 100)' },
        },
        required: ['project_id'],
      },
      riskLevel: 'low',
    },
    {
      name: 'get_file',
      description: 'Get file contents from a repository',
      inputSchema: {
        properties: {
          project_id: { type: 'string', description: 'Project ID or URL-encoded path' },
          file_path: { type: 'string', description: 'Path to the file in the repository' },
          ref: { type: 'string', description: 'Branch, tag, or commit (default: main)' },
        },
        required: ['project_id', 'file_path'],
      },
      riskLevel: 'low',
    },
    {
      name: 'search_code',
      description: 'Search code across projects',
      inputSchema: {
        properties: {
          search: { type: 'string', description: 'Search query' },
          project_id: { type: 'string', description: 'Limit search to a specific project (optional)' },
          per_page: { type: 'number', description: 'Results per page (max 100)' },
        },
        required: ['search'],
      },
      riskLevel: 'low',
    },
  ];

  private token: string | null = null;
  private baseUrl = DEFAULT_API_BASE;

  async connect(vault: VaultStore): Promise<void> {
    const cred = vault.getConnectorCredential(this.id);
    this.token = cred?.value ?? null;

    // Support self-hosted GitLab via connector config
    const configEntry = vault.get(`connector:${this.id}:base_url`);
    if (configEntry) this.baseUrl = configEntry.value;
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
        const res = await fetch(`${this.baseUrl}/user`, {
          headers: this.headers(),
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) {
          health.status = 'error';
          health.error = `GitLab API returned ${res.status}`;
        }
      } catch (err: unknown) {
        health.status = 'error';
        health.error = err instanceof Error ? err.message : String(err);
      }
    }

    return health;
  }

  async execute(action: string, params: Record<string, unknown>): Promise<ConnectorResult> {
    if (!this.token) return { success: false, error: 'Not connected — add GitLab access token in vault' };

    switch (action) {
      case 'list_projects': return this.apiGet('/projects', { membership: true, ...params });
      case 'list_issues': return this.apiGet(`/projects/${this.encodeProject(params.project_id)}/issues`, params, ['project_id']);
      case 'create_issue': return this.apiPost(`/projects/${this.encodeProject(params.project_id)}/issues`, params, ['project_id']);
      case 'list_merge_requests': return this.apiGet(`/projects/${this.encodeProject(params.project_id)}/merge_requests`, params, ['project_id']);
      case 'get_file': return this.getFile(params);
      case 'search_code': return this.searchCode(params);
      default: return { success: false, error: `Unknown action: ${action}` };
    }
  }

  private encodeProject(projectId: unknown): string {
    return encodeURIComponent(String(projectId));
  }

  private headers(): Record<string, string> {
    return {
      'PRIVATE-TOKEN': this.token!,
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
      const url = `${this.baseUrl}${path}${qs ? `?${qs}` : ''}`;
      const res = await fetch(url, { headers: this.headers(), signal: AbortSignal.timeout(10000) });
      if (!res.ok) return { success: false, error: await this.safeErrorText(res, 'GitLab API') };
      return { success: true, data: await res.json() };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async apiPost(path: string, params: Record<string, unknown>, stripKeys: string[] = []): Promise<ConnectorResult> {
    try {
      const body: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(params)) {
        if (!stripKeys.includes(k) && v !== undefined) body[k] = v;
      }
      const res = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return { success: false, error: await this.safeErrorText(res, 'GitLab API') };
      return { success: true, data: await res.json() };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async getFile(params: Record<string, unknown>): Promise<ConnectorResult> {
    try {
      const projectId = this.encodeProject(params.project_id);
      const filePath = encodeURIComponent(String(params.file_path));
      const ref = params.ref ? `?ref=${encodeURIComponent(String(params.ref))}` : '';
      const url = `${this.baseUrl}/projects/${projectId}/repository/files/${filePath}${ref}`;
      const res = await fetch(url, { headers: this.headers(), signal: AbortSignal.timeout(10000) });
      if (!res.ok) return { success: false, error: await this.safeErrorText(res, 'GitLab API') };
      return { success: true, data: await res.json() };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async searchCode(params: Record<string, unknown>): Promise<ConnectorResult> {
    try {
      const query = new URLSearchParams();
      query.set('scope', 'blobs');
      query.set('search', String(params.search));
      if (params.per_page !== undefined) query.set('per_page', String(params.per_page));

      // Project-scoped or global search
      const basePath = params.project_id
        ? `/projects/${this.encodeProject(params.project_id)}/search`
        : '/search';

      const url = `${this.baseUrl}${basePath}?${query.toString()}`;
      const res = await fetch(url, { headers: this.headers(), signal: AbortSignal.timeout(10000) });
      if (!res.ok) return { success: false, error: await this.safeErrorText(res, 'GitLab API') };
      return { success: true, data: await res.json() };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}
