/**
 * GitHub Connector — access repositories, issues, and pull requests.
 * Auth: Bearer (Personal Access Token)
 */

import { BaseConnector, type ConnectorAction, type ConnectorResult } from '../connector-sdk.js';
import type { VaultStore } from '@waggle/core';
import type { ConnectorHealth } from '@waggle/shared';

const API_BASE = 'https://api.github.com';

export class GitHubConnector extends BaseConnector {
  readonly id = 'github';
  readonly name = 'GitHub';
  readonly description = 'Access repositories, issues, and pull requests';
  readonly service = 'github.com';
  readonly authType = 'bearer' as const;
  readonly substrate = 'waggle' as const;

  readonly actions: ConnectorAction[] = [
    {
      name: 'list_repos',
      description: 'List your repositories',
      inputSchema: {
        properties: {
          sort: { type: 'string', enum: ['created', 'updated', 'pushed', 'full_name'], description: 'Sort field' },
          per_page: { type: 'number', description: 'Results per page (max 100)' },
        },
      },
      riskLevel: 'low',
    },
    {
      name: 'search_code',
      description: 'Search code across GitHub repositories',
      inputSchema: {
        properties: {
          q: { type: 'string', description: 'Search query (GitHub search syntax)' },
          per_page: { type: 'number', description: 'Results per page (max 100)' },
        },
        required: ['q'],
      },
      riskLevel: 'low',
    },
    {
      name: 'list_issues',
      description: 'List issues for a repository',
      inputSchema: {
        properties: {
          owner: { type: 'string', description: 'Repository owner' },
          repo: { type: 'string', description: 'Repository name' },
          state: { type: 'string', enum: ['open', 'closed', 'all'] },
          per_page: { type: 'number' },
        },
        required: ['owner', 'repo'],
      },
      riskLevel: 'low',
    },
    {
      name: 'get_file',
      description: 'Get file contents from a repository',
      inputSchema: {
        properties: {
          owner: { type: 'string', description: 'Repository owner' },
          repo: { type: 'string', description: 'Repository name' },
          path: { type: 'string', description: 'File path in the repository' },
          ref: { type: 'string', description: 'Branch or commit SHA (default: main)' },
        },
        required: ['owner', 'repo', 'path'],
      },
      riskLevel: 'low',
    },
    {
      name: 'create_issue',
      description: 'Create a new issue in a repository',
      inputSchema: {
        properties: {
          owner: { type: 'string', description: 'Repository owner' },
          repo: { type: 'string', description: 'Repository name' },
          title: { type: 'string', description: 'Issue title' },
          body: { type: 'string', description: 'Issue body (markdown)' },
          labels: { type: 'array', items: { type: 'string' }, description: 'Labels to add' },
        },
        required: ['owner', 'repo', 'title'],
      },
      riskLevel: 'medium',
    },
    {
      name: 'list_prs',
      description: 'List pull requests for a repository',
      inputSchema: {
        properties: {
          owner: { type: 'string', description: 'Repository owner' },
          repo: { type: 'string', description: 'Repository name' },
          state: { type: 'string', enum: ['open', 'closed', 'all'] },
          per_page: { type: 'number' },
        },
        required: ['owner', 'repo'],
      },
      riskLevel: 'low',
    },
    {
      name: 'create_pr',
      description: 'Create a new pull request',
      inputSchema: {
        properties: {
          owner: { type: 'string', description: 'Repository owner' },
          repo: { type: 'string', description: 'Repository name' },
          title: { type: 'string', description: 'PR title' },
          body: { type: 'string', description: 'PR description (markdown)' },
          head: { type: 'string', description: 'Branch containing changes' },
          base: { type: 'string', description: 'Branch to merge into (default: main)' },
        },
        required: ['owner', 'repo', 'title', 'head'],
      },
      riskLevel: 'medium',
    },
  ];

  private token: string | null = null;
  private baseUrl = API_BASE;

  async connect(vault: VaultStore): Promise<void> {
    const cred = vault.getConnectorCredential(this.id);
    this.token = cred?.value ?? null;
    // Support GitHub Enterprise via connector config
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
          health.error = `GitHub API returned ${res.status}`;
        }
      } catch (err: unknown) {
        health.status = 'error';
        health.error = err instanceof Error ? err.message : String(err);
      }
    }

    return health;
  }

  async execute(action: string, params: Record<string, unknown>): Promise<ConnectorResult> {
    if (!this.token) return { success: false, error: 'Not connected — add GitHub token in vault' };

    switch (action) {
      case 'list_repos': return this.apiGet('/user/repos', params);
      case 'search_code': return this.apiGet('/search/code', params);
      case 'list_issues': return this.apiGet(`/repos/${params.owner}/${params.repo}/issues`, params, ['owner', 'repo']);
      case 'get_file': return this.apiGet(`/repos/${params.owner}/${params.repo}/contents/${params.path}`, params, ['owner', 'repo', 'path']);
      case 'create_issue': return this.apiPost(`/repos/${params.owner}/${params.repo}/issues`, params, ['owner', 'repo']);
      case 'list_prs': return this.apiGet(`/repos/${params.owner}/${params.repo}/pulls`, params, ['owner', 'repo']);
      case 'create_pr': return this.apiPost(`/repos/${params.owner}/${params.repo}/pulls`, params, ['owner', 'repo']);
      default: return { success: false, error: `Unknown action: ${action}` };
    }
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'Waggle/1.0',
      'X-GitHub-Api-Version': '2022-11-28',
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
      if (!res.ok) return { success: false, error: await this.safeErrorText(res, 'GitHub API') };
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
        headers: { ...this.headers(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return { success: false, error: await this.safeErrorText(res, 'GitHub API') };
      return { success: true, data: await res.json() };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}
