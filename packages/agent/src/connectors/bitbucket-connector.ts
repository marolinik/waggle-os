/**
 * Bitbucket Connector — access repositories, pull requests, issues, and files.
 * Auth: Bearer (App password or OAuth2 token)
 */

import { BaseConnector, type ConnectorAction, type ConnectorResult } from '../connector-sdk.js';
import type { VaultStore } from '@waggle/core';
import type { ConnectorHealth } from '@waggle/shared';

const API_BASE = 'https://api.bitbucket.org/2.0';

export class BitbucketConnector extends BaseConnector {
  readonly id = 'bitbucket';
  readonly name = 'Bitbucket';
  readonly description = 'Access repositories, pull requests, issues, and files';
  readonly service = 'bitbucket.org';
  readonly authType = 'bearer' as const;
  readonly substrate = 'waggle' as const;

  readonly actions: ConnectorAction[] = [
    {
      name: 'list_repos',
      description: 'List your repositories',
      inputSchema: {
        properties: {
          workspace: { type: 'string', description: 'Workspace slug (defaults to authenticated user)' },
          sort: { type: 'string', description: 'Sort field (e.g., "-updated_on" for most recently updated)' },
          pagelen: { type: 'number', description: 'Results per page (max 100)' },
        },
      },
      riskLevel: 'low',
    },
    {
      name: 'list_pull_requests',
      description: 'List pull requests for a repository',
      inputSchema: {
        properties: {
          workspace: { type: 'string', description: 'Workspace slug' },
          repo_slug: { type: 'string', description: 'Repository slug' },
          state: { type: 'string', enum: ['OPEN', 'MERGED', 'DECLINED', 'SUPERSEDED'], description: 'PR state filter' },
          pagelen: { type: 'number', description: 'Results per page (max 50)' },
        },
        required: ['workspace', 'repo_slug'],
      },
      riskLevel: 'low',
    },
    {
      name: 'get_file',
      description: 'Get file contents from a repository',
      inputSchema: {
        properties: {
          workspace: { type: 'string', description: 'Workspace slug' },
          repo_slug: { type: 'string', description: 'Repository slug' },
          path: { type: 'string', description: 'File path in the repository' },
          commit: { type: 'string', description: 'Branch, tag, or commit hash (default: main)' },
        },
        required: ['workspace', 'repo_slug', 'path'],
      },
      riskLevel: 'low',
    },
    {
      name: 'create_pull_request',
      description: 'Create a new pull request',
      inputSchema: {
        properties: {
          workspace: { type: 'string', description: 'Workspace slug' },
          repo_slug: { type: 'string', description: 'Repository slug' },
          title: { type: 'string', description: 'PR title' },
          description: { type: 'string', description: 'PR description (markdown)' },
          source_branch: { type: 'string', description: 'Source branch name' },
          destination_branch: { type: 'string', description: 'Destination branch (default: main)' },
        },
        required: ['workspace', 'repo_slug', 'title', 'source_branch'],
      },
      riskLevel: 'medium',
    },
    {
      name: 'list_issues',
      description: 'List issues for a repository (requires issue tracker enabled)',
      inputSchema: {
        properties: {
          workspace: { type: 'string', description: 'Workspace slug' },
          repo_slug: { type: 'string', description: 'Repository slug' },
          state: { type: 'string', enum: ['new', 'open', 'resolved', 'on hold', 'invalid', 'duplicate', 'wontfix', 'closed'], description: 'Issue state filter' },
          pagelen: { type: 'number', description: 'Results per page (max 50)' },
        },
        required: ['workspace', 'repo_slug'],
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
        const res = await fetch(`${API_BASE}/user`, {
          headers: this.headers(),
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) {
          health.status = 'error';
          health.error = `Bitbucket API returned ${res.status}`;
        }
      } catch (err: unknown) {
        health.status = 'error';
        health.error = err instanceof Error ? err.message : String(err);
      }
    }

    return health;
  }

  async execute(action: string, params: Record<string, unknown>): Promise<ConnectorResult> {
    if (!this.token) return { success: false, error: 'Not connected — add Bitbucket access token in vault' };

    switch (action) {
      case 'list_repos': return this.listRepos(params);
      case 'list_pull_requests': return this.apiGet(`/repositories/${params.workspace}/${params.repo_slug}/pullrequests`, params, ['workspace', 'repo_slug']);
      case 'get_file': return this.getFile(params);
      case 'create_pull_request': return this.createPR(params);
      case 'list_issues': return this.apiGet(`/repositories/${params.workspace}/${params.repo_slug}/issues`, params, ['workspace', 'repo_slug']);
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

  private async listRepos(params: Record<string, unknown>): Promise<ConnectorResult> {
    try {
      const workspace = params.workspace ?? (await this.getUsername());
      if (!workspace) return { success: false, error: 'Could not determine workspace — provide workspace parameter' };
      return this.apiGet(`/repositories/${workspace}`, params, ['workspace']);
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async getUsername(): Promise<string | null> {
    try {
      const res = await fetch(`${API_BASE}/user`, {
        headers: this.headers(),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return null;
      const user = await res.json() as { username: string };
      return user.username;
    } catch {
      return null;
    }
  }

  private async getFile(params: Record<string, unknown>): Promise<ConnectorResult> {
    try {
      const commit = params.commit ?? 'main';
      const url = `${API_BASE}/repositories/${params.workspace}/${params.repo_slug}/src/${encodeURIComponent(String(commit))}/${encodeURIComponent(String(params.path))}`;
      const res = await fetch(url, { headers: this.headers(), signal: AbortSignal.timeout(10000) });
      if (!res.ok) return { success: false, error: await this.safeErrorText(res, 'Bitbucket API') };
      // Bitbucket returns raw file content, not JSON
      const content = await res.text();
      return { success: true, data: { content, path: params.path } };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async createPR(params: Record<string, unknown>): Promise<ConnectorResult> {
    try {
      const body = {
        title: params.title,
        description: params.description ?? '',
        source: { branch: { name: params.source_branch } },
        destination: { branch: { name: params.destination_branch ?? 'main' } },
      };
      const url = `${API_BASE}/repositories/${params.workspace}/${params.repo_slug}/pullrequests`;
      const res = await fetch(url, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return { success: false, error: await this.safeErrorText(res, 'Bitbucket API') };
      return { success: true, data: await res.json() };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
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
      if (!res.ok) return { success: false, error: await this.safeErrorText(res, 'Bitbucket API') };
      return { success: true, data: await res.json() };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}
