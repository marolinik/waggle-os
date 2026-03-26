/**
 * Linear Connector — manage issues, projects, and teams via GraphQL API.
 * Auth: Bearer (API key)
 */

import { BaseConnector, type ConnectorAction, type ConnectorResult } from '../connector-sdk.js';
import type { VaultStore } from '@waggle/core';
import type { ConnectorHealth } from '@waggle/shared';

const API_URL = 'https://api.linear.app/graphql';

export class LinearConnector extends BaseConnector {
  readonly id = 'linear';
  readonly name = 'Linear';
  readonly description = 'Manage issues, projects, and teams in Linear';
  readonly service = 'linear.app';
  readonly authType = 'bearer' as const;
  readonly substrate = 'waggle' as const;

  readonly actions: ConnectorAction[] = [
    {
      name: 'list_issues',
      description: 'List issues with optional filters',
      inputSchema: {
        properties: {
          teamId: { type: 'string', description: 'Filter by team ID' },
          first: { type: 'number', description: 'Number of issues to return (default 50)' },
          state: { type: 'string', description: 'Filter by state name (e.g., "In Progress", "Done")' },
        },
      },
      riskLevel: 'low',
    },
    {
      name: 'create_issue',
      description: 'Create a new issue in Linear',
      inputSchema: {
        properties: {
          title: { type: 'string', description: 'Issue title' },
          description: { type: 'string', description: 'Issue description (markdown)' },
          teamId: { type: 'string', description: 'Team ID to create issue in' },
          priority: { type: 'number', description: 'Priority (0=none, 1=urgent, 2=high, 3=medium, 4=low)' },
          assigneeId: { type: 'string', description: 'User ID to assign to' },
          labelIds: { type: 'array', items: { type: 'string' }, description: 'Label IDs to add' },
        },
        required: ['title', 'teamId'],
      },
      riskLevel: 'medium',
    },
    {
      name: 'update_issue',
      description: 'Update an existing Linear issue',
      inputSchema: {
        properties: {
          issueId: { type: 'string', description: 'Issue ID to update' },
          title: { type: 'string', description: 'New title' },
          description: { type: 'string', description: 'New description' },
          priority: { type: 'number', description: 'New priority (0-4)' },
          stateId: { type: 'string', description: 'New state ID' },
          assigneeId: { type: 'string', description: 'New assignee user ID' },
        },
        required: ['issueId'],
      },
      riskLevel: 'medium',
    },
    {
      name: 'search_issues',
      description: 'Search issues by text query',
      inputSchema: {
        properties: {
          query: { type: 'string', description: 'Search query text' },
          first: { type: 'number', description: 'Number of results (default 25)' },
        },
        required: ['query'],
      },
      riskLevel: 'low',
    },
    {
      name: 'list_projects',
      description: 'List projects in the workspace',
      inputSchema: {
        properties: {
          first: { type: 'number', description: 'Number of projects to return (default 50)' },
        },
      },
      riskLevel: 'low',
    },
    {
      name: 'list_teams',
      description: 'List teams in the workspace',
      inputSchema: {
        properties: {
          first: { type: 'number', description: 'Number of teams to return (default 50)' },
        },
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
        const res = await fetch(API_URL, {
          method: 'POST',
          headers: this.headers(),
          body: JSON.stringify({ query: '{ viewer { id name } }' }),
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) {
          health.status = 'error';
          health.error = `Linear API returned ${res.status}`;
        }
      } catch (err: unknown) {
        health.status = 'error';
        health.error = err instanceof Error ? err.message : String(err);
      }
    }

    return health;
  }

  async execute(action: string, params: Record<string, unknown>): Promise<ConnectorResult> {
    if (!this.token) return { success: false, error: 'Not connected — add Linear API key in vault' };

    switch (action) {
      case 'list_issues': return this.listIssues(params);
      case 'create_issue': return this.createIssue(params);
      case 'update_issue': return this.updateIssue(params);
      case 'search_issues': return this.searchIssues(params);
      case 'list_projects': return this.listProjects(params);
      case 'list_teams': return this.listTeams(params);
      default: return { success: false, error: `Unknown action: ${action}` };
    }
  }

  private headers(): Record<string, string> {
    return {
      Authorization: this.token!,
      'Content-Type': 'application/json',
    };
  }

  private async graphql(query: string, variables?: Record<string, unknown>): Promise<ConnectorResult> {
    try {
      const body: Record<string, unknown> = { query };
      if (variables) body.variables = variables;
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return { success: false, error: await this.safeErrorText(res, 'Linear API') };
      const json = await res.json() as { data?: unknown; errors?: Array<{ message: string }> };
      if (json.errors?.length) {
        return { success: false, error: `Linear GraphQL: ${json.errors.map(e => e.message).join('; ')}` };
      }
      return { success: true, data: json.data };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async listIssues(params: Record<string, unknown>): Promise<ConnectorResult> {
    const first = (params.first as number) ?? 50;
    const filter: string[] = [];
    if (params.teamId) filter.push(`team: { id: { eq: "${params.teamId}" } }`);
    if (params.state) filter.push(`state: { name: { eq: "${params.state}" } }`);
    const filterClause = filter.length ? `(filter: { ${filter.join(', ')} }, first: ${first})` : `(first: ${first})`;
    return this.graphql(`{ issues${filterClause} { nodes { id identifier title state { name } priority assignee { name } createdAt } } }`);
  }

  private async createIssue(params: Record<string, unknown>): Promise<ConnectorResult> {
    const input: Record<string, unknown> = {
      title: params.title,
      teamId: params.teamId,
    };
    if (params.description) input.description = params.description;
    if (params.priority !== undefined) input.priority = params.priority;
    if (params.assigneeId) input.assigneeId = params.assigneeId;
    if (params.labelIds) input.labelIds = params.labelIds;

    return this.graphql(
      `mutation($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { id identifier title url } } }`,
      { input },
    );
  }

  private async updateIssue(params: Record<string, unknown>): Promise<ConnectorResult> {
    const { issueId, ...updates } = params;
    const input: Record<string, unknown> = {};
    if (updates.title) input.title = updates.title;
    if (updates.description) input.description = updates.description;
    if (updates.priority !== undefined) input.priority = updates.priority;
    if (updates.stateId) input.stateId = updates.stateId;
    if (updates.assigneeId) input.assigneeId = updates.assigneeId;

    return this.graphql(
      `mutation($id: String!, $input: IssueUpdateInput!) { issueUpdate(id: $id, input: $input) { success issue { id identifier title state { name } } } }`,
      { id: issueId, input },
    );
  }

  private async searchIssues(params: Record<string, unknown>): Promise<ConnectorResult> {
    const first = (params.first as number) ?? 25;
    return this.graphql(
      `query($query: String!, $first: Int) { searchIssues(query: $query, first: $first) { nodes { id identifier title state { name } priority assignee { name } } } }`,
      { query: params.query, first },
    );
  }

  private async listProjects(params: Record<string, unknown>): Promise<ConnectorResult> {
    const first = (params.first as number) ?? 50;
    return this.graphql(`{ projects(first: ${first}) { nodes { id name state startDate targetDate } } }`);
  }

  private async listTeams(params: Record<string, unknown>): Promise<ConnectorResult> {
    const first = (params.first as number) ?? 50;
    return this.graphql(`{ teams(first: ${first}) { nodes { id name key description } } }`);
  }
}
