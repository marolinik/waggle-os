/**
 * Jira Connector — manage issues, search, and transition workflows.
 * Auth: Basic (email:apiToken) — Jira Cloud uses email + API token.
 */

import { BaseConnector, type ConnectorAction, type ConnectorResult } from '../connector-sdk.js';
import type { VaultStore } from '@waggle/core';
import type { ConnectorHealth } from '@waggle/shared';

export class JiraConnector extends BaseConnector {
  readonly id = 'jira';
  readonly name = 'Jira';
  readonly description = 'Manage issues, search, and transition workflows';
  readonly service = 'atlassian.net';
  readonly authType = 'bearer' as const; // Presents as bearer in UI, uses basic internally
  readonly substrate = 'waggle' as const;

  readonly actions: ConnectorAction[] = [
    {
      name: 'list_issues',
      description: 'List issues with optional JQL filter',
      inputSchema: {
        properties: {
          jql: { type: 'string', description: 'JQL query (default: all open issues)' },
          maxResults: { type: 'number', description: 'Max results (default 50)' },
          fields: { type: 'string', description: 'Comma-separated field names to return' },
        },
      },
      riskLevel: 'low',
    },
    {
      name: 'search',
      description: 'Search issues using JQL',
      inputSchema: {
        properties: {
          jql: { type: 'string', description: 'JQL query (e.g., "project = PROJ AND status = Open")' },
          maxResults: { type: 'number', description: 'Max results (default 50)' },
        },
        required: ['jql'],
      },
      riskLevel: 'low',
    },
    {
      name: 'create_issue',
      description: 'Create a new Jira issue',
      inputSchema: {
        properties: {
          project: { type: 'string', description: 'Project key (e.g., "PROJ")' },
          summary: { type: 'string', description: 'Issue summary/title' },
          description: { type: 'string', description: 'Issue description' },
          issuetype: { type: 'string', description: 'Issue type (e.g., "Bug", "Task", "Story")' },
          priority: { type: 'string', description: 'Priority name (e.g., "High", "Medium")' },
          labels: { type: 'array', items: { type: 'string' }, description: 'Labels to add' },
        },
        required: ['project', 'summary', 'issuetype'],
      },
      riskLevel: 'medium',
    },
    {
      name: 'update_issue',
      description: 'Update an existing Jira issue',
      inputSchema: {
        properties: {
          issueKey: { type: 'string', description: 'Issue key (e.g., "PROJ-123")' },
          summary: { type: 'string', description: 'New summary' },
          description: { type: 'string', description: 'New description' },
          priority: { type: 'string', description: 'New priority' },
          labels: { type: 'array', items: { type: 'string' }, description: 'New labels' },
        },
        required: ['issueKey'],
      },
      riskLevel: 'medium',
    },
    {
      name: 'transition_issue',
      description: 'Transition an issue to a new status (e.g., In Progress, Done)',
      inputSchema: {
        properties: {
          issueKey: { type: 'string', description: 'Issue key (e.g., "PROJ-123")' },
          transitionName: { type: 'string', description: 'Transition name (e.g., "Start Progress", "Done")' },
        },
        required: ['issueKey', 'transitionName'],
      },
      riskLevel: 'medium',
    },
  ];

  private authHeader: string | null = null;
  private baseUrl: string | null = null;

  async connect(vault: VaultStore): Promise<void> {
    const cred = vault.getConnectorCredential(this.id);
    if (!cred) {
      this.authHeader = null;
      this.baseUrl = null;
      return;
    }

    const emailEntry = vault.get(`connector:${this.id}:email`);
    const email = emailEntry?.value ?? '';
    const apiToken = cred.value;

    // Jira Cloud uses email:apiToken as basic auth
    this.authHeader = `Basic ${Buffer.from(`${email}:${apiToken}`).toString('base64')}`;

    // Base URL from vault or default
    const urlEntry = vault.get(`connector:${this.id}:base_url`);
    this.baseUrl = urlEntry?.value ?? null;
  }

  async healthCheck(): Promise<ConnectorHealth> {
    const health: ConnectorHealth = {
      id: this.id,
      name: this.name,
      status: this.authHeader && this.baseUrl ? 'connected' : 'disconnected',
      lastChecked: new Date().toISOString(),
    };

    if (this.authHeader && this.baseUrl) {
      try {
        const res = await fetch(`${this.baseUrl}/rest/api/3/myself`, {
          headers: this.headers(),
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) {
          health.status = 'error';
          health.error = `Jira API returned ${res.status}`;
        }
      } catch (err: unknown) {
        health.status = 'error';
        health.error = err instanceof Error ? err.message : String(err);
      }
    }

    return health;
  }

  async execute(action: string, params: Record<string, unknown>): Promise<ConnectorResult> {
    if (!this.authHeader || !this.baseUrl) {
      return { success: false, error: 'Not connected — add Jira API token and instance URL in vault' };
    }

    switch (action) {
      case 'list_issues': return this.search(params);
      case 'search': return this.search(params);
      case 'create_issue': return this.createIssue(params);
      case 'update_issue': return this.updateIssue(params);
      case 'transition_issue': return this.transitionIssue(params);
      default: return { success: false, error: `Unknown action: ${action}` };
    }
  }

  private headers(): Record<string, string> {
    return {
      Authorization: this.authHeader!,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };
  }

  private async search(params: Record<string, unknown>): Promise<ConnectorResult> {
    try {
      const jql = (params.jql as string) ?? 'order by created DESC';
      const maxResults = (params.maxResults as number) ?? 50;
      const fields = (params.fields as string) ?? 'summary,status,priority,assignee,created';
      const res = await fetch(`${this.baseUrl}/rest/api/3/search`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({ jql, maxResults, fields: fields.split(',').map(f => f.trim()) }),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return { success: false, error: await this.safeErrorText(res, 'Jira API') };
      return { success: true, data: await res.json() };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async createIssue(params: Record<string, unknown>): Promise<ConnectorResult> {
    try {
      const fields: Record<string, unknown> = {
        project: { key: params.project },
        summary: params.summary,
        issuetype: { name: params.issuetype },
      };
      if (params.description) fields.description = { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: params.description }] }] };
      if (params.priority) fields.priority = { name: params.priority };
      if (params.labels) fields.labels = params.labels;

      const res = await fetch(`${this.baseUrl!}/rest/api/3/issue`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({ fields }),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return { success: false, error: await this.safeErrorText(res, 'Jira API') };
      return { success: true, data: await res.json() };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async updateIssue(params: Record<string, unknown>): Promise<ConnectorResult> {
    try {
      const { issueKey, ...updates } = params;
      const fields: Record<string, unknown> = {};
      if (updates.summary) fields.summary = updates.summary;
      if (updates.description) fields.description = { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: updates.description }] }] };
      if (updates.priority) fields.priority = { name: updates.priority };
      if (updates.labels) fields.labels = updates.labels;

      const res = await fetch(`${this.baseUrl!}/rest/api/3/issue/${encodeURIComponent(String(issueKey))}`, {
        method: 'PUT',
        headers: this.headers(),
        body: JSON.stringify({ fields }),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return { success: false, error: await this.safeErrorText(res, 'Jira API') };
      return { success: true, data: { key: issueKey, updated: true } };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async transitionIssue(params: Record<string, unknown>): Promise<ConnectorResult> {
    try {
      const { issueKey, transitionName } = params;
      // First, get available transitions
      const transRes = await fetch(`${this.baseUrl!}/rest/api/3/issue/${encodeURIComponent(String(issueKey))}/transitions`, {
        headers: this.headers(),
        signal: AbortSignal.timeout(10000),
      });
      if (!transRes.ok) return { success: false, error: await this.safeErrorText(transRes, 'Jira API') };
      const { transitions } = await transRes.json() as { transitions: Array<{ id: string; name: string }> };

      const match = transitions.find(t => t.name.toLowerCase() === String(transitionName).toLowerCase());
      if (!match) {
        return { success: false, error: `Transition "${transitionName}" not available. Available: ${transitions.map(t => t.name).join(', ')}` };
      }

      const res = await fetch(`${this.baseUrl!}/rest/api/3/issue/${encodeURIComponent(String(issueKey))}/transitions`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({ transition: { id: match.id } }),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return { success: false, error: await this.safeErrorText(res, 'Jira API') };
      return { success: true, data: { key: issueKey, transitioned: transitionName } };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}
