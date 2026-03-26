/**
 * Pipedrive Connector — manage deals, persons, and activities.
 * Auth: API Key (passed as query parameter)
 */

import { BaseConnector, type ConnectorAction, type ConnectorResult } from '../connector-sdk.js';
import type { VaultStore } from '@waggle/core';
import type { ConnectorHealth } from '@waggle/shared';

const API_BASE = 'https://api.pipedrive.com/v1';

export class PipedriveConnector extends BaseConnector {
  readonly id = 'pipedrive';
  readonly name = 'Pipedrive';
  readonly description = 'Manage deals, persons, and activities in Pipedrive CRM';
  readonly service = 'pipedrive.com';
  readonly authType = 'api_key' as const;
  readonly substrate = 'waggle' as const;

  readonly actions: ConnectorAction[] = [
    {
      name: 'list_deals',
      description: 'List deals with optional filters',
      inputSchema: {
        properties: {
          status: { type: 'string', enum: ['open', 'won', 'lost', 'deleted', 'all_not_deleted'], description: 'Deal status filter' },
          start: { type: 'number', description: 'Pagination start (default 0)' },
          limit: { type: 'number', description: 'Results per page (default 100)' },
          sort: { type: 'string', description: 'Sort field and order (e.g., "add_time DESC")' },
        },
      },
      riskLevel: 'low',
    },
    {
      name: 'get_deal',
      description: 'Get a single deal by ID',
      inputSchema: {
        properties: {
          id: { type: 'number', description: 'Pipedrive deal ID' },
        },
        required: ['id'],
      },
      riskLevel: 'low',
    },
    {
      name: 'create_deal',
      description: 'Create a new deal',
      inputSchema: {
        properties: {
          title: { type: 'string', description: 'Deal title' },
          value: { type: 'number', description: 'Deal value' },
          currency: { type: 'string', description: 'Currency code (e.g., "USD", "EUR")' },
          person_id: { type: 'number', description: 'Associated person ID' },
          org_id: { type: 'number', description: 'Associated organization ID' },
          stage_id: { type: 'number', description: 'Pipeline stage ID' },
          expected_close_date: { type: 'string', description: 'Expected close date (YYYY-MM-DD)' },
        },
        required: ['title'],
      },
      riskLevel: 'medium',
    },
    {
      name: 'search_deals',
      description: 'Search deals by term',
      inputSchema: {
        properties: {
          term: { type: 'string', description: 'Search term' },
          limit: { type: 'number', description: 'Max results (default 100)' },
        },
        required: ['term'],
      },
      riskLevel: 'low',
    },
    {
      name: 'list_persons',
      description: 'List persons (contacts)',
      inputSchema: {
        properties: {
          start: { type: 'number', description: 'Pagination start (default 0)' },
          limit: { type: 'number', description: 'Results per page (default 100)' },
          sort: { type: 'string', description: 'Sort field and order' },
        },
      },
      riskLevel: 'low',
    },
    {
      name: 'create_person',
      description: 'Create a new person (contact)',
      inputSchema: {
        properties: {
          name: { type: 'string', description: 'Person full name' },
          email: { type: 'string', description: 'Email address' },
          phone: { type: 'string', description: 'Phone number' },
          org_id: { type: 'number', description: 'Associated organization ID' },
        },
        required: ['name'],
      },
      riskLevel: 'medium',
    },
    {
      name: 'list_activities',
      description: 'List activities (calls, meetings, tasks)',
      inputSchema: {
        properties: {
          start: { type: 'number', description: 'Pagination start (default 0)' },
          limit: { type: 'number', description: 'Results per page (default 100)' },
          type: { type: 'string', description: 'Activity type filter (e.g., "call", "meeting", "task")' },
          done: { type: 'number', enum: [0, 1], description: '0 = undone, 1 = done' },
        },
      },
      riskLevel: 'low',
    },
  ];

  private apiToken: string | null = null;

  async connect(vault: VaultStore): Promise<void> {
    const cred = vault.getConnectorCredential(this.id);
    this.apiToken = cred?.value ?? null;
  }

  async healthCheck(): Promise<ConnectorHealth> {
    const health: ConnectorHealth = {
      id: this.id,
      name: this.name,
      status: this.apiToken ? 'connected' : 'disconnected',
      lastChecked: new Date().toISOString(),
    };

    if (this.apiToken) {
      try {
        const res = await fetch(`${API_BASE}/users/me?api_token=${this.apiToken}`, {
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) {
          health.status = 'error';
          health.error = `Pipedrive API returned ${res.status}`;
        }
      } catch (err: unknown) {
        health.status = 'error';
        health.error = err instanceof Error ? err.message : String(err);
      }
    }

    return health;
  }

  async execute(action: string, params: Record<string, unknown>): Promise<ConnectorResult> {
    if (!this.apiToken) return { success: false, error: 'Not connected — add Pipedrive API token in vault' };

    switch (action) {
      case 'list_deals': return this.apiGet('/deals', params);
      case 'get_deal': return this.apiGet(`/deals/${params.id}`, params, ['id']);
      case 'create_deal': return this.apiPost('/deals', params);
      case 'search_deals': return this.apiGet('/deals/search', params);
      case 'list_persons': return this.apiGet('/persons', params);
      case 'create_person': return this.apiPost('/persons', params);
      case 'list_activities': return this.apiGet('/activities', params);
      default: return { success: false, error: `Unknown action: ${action}` };
    }
  }

  private buildUrl(path: string, params: Record<string, unknown>, stripKeys: string[] = []): string {
    const query = new URLSearchParams();
    query.set('api_token', this.apiToken!);
    for (const [k, v] of Object.entries(params)) {
      if (!stripKeys.includes(k) && v !== undefined) query.set(k, String(v));
    }
    return `${API_BASE}${path}?${query.toString()}`;
  }

  private async apiGet(path: string, params: Record<string, unknown>, stripKeys: string[] = []): Promise<ConnectorResult> {
    try {
      const url = this.buildUrl(path, params, stripKeys);
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) return { success: false, error: await this.safeErrorText(res, 'Pipedrive API') };
      return { success: true, data: await res.json() };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async apiPost(path: string, params: Record<string, unknown>): Promise<ConnectorResult> {
    try {
      const url = `${API_BASE}${path}?api_token=${this.apiToken}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return { success: false, error: await this.safeErrorText(res, 'Pipedrive API') };
      return { success: true, data: await res.json() };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}
