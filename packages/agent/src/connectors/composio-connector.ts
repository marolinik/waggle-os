/**
 * Composio Connector — meta-connector bridging Waggle to Composio's 250+ integrations.
 * Auth: API Key (X-API-KEY header)
 *
 * Composio provides a single API to access 250+ services. This connector acts as
 * a bridge — it exposes Composio's action discovery and execution as Waggle tools.
 * All execute_action calls go through approval gates (risk level: high).
 */

import { BaseConnector, type ConnectorAction, type ConnectorResult } from '../connector-sdk.js';
import type { VaultStore } from '@waggle/core';
import type { ConnectorHealth } from '@waggle/shared';

const API_BASE = 'https://backend.composio.dev/api/v1';

export class ComposioConnector extends BaseConnector {
  readonly id = 'composio';
  readonly name = 'Composio (250+ services)';
  readonly description = 'Meta-connector bridging to Composio for 250+ external integrations';
  readonly service = 'composio.dev';
  readonly authType = 'api_key' as const;
  readonly substrate = 'waggle' as const;

  readonly actions: ConnectorAction[] = [
    {
      name: 'list_integrations',
      description: 'List all available integrations the user has connected in Composio',
      inputSchema: {
        properties: {
          page: { type: 'number', description: 'Page number (default: 1)' },
          pageSize: { type: 'number', description: 'Results per page (default: 20)' },
        },
      },
      riskLevel: 'low',
    },
    {
      name: 'list_actions',
      description: 'List available actions for a specific integration/app',
      inputSchema: {
        properties: {
          appName: { type: 'string', description: 'The app/integration name (e.g., "github", "slack", "gmail")' },
          page: { type: 'number', description: 'Page number (default: 1)' },
          pageSize: { type: 'number', description: 'Results per page (default: 20)' },
        },
        required: ['appName'],
      },
      riskLevel: 'low',
    },
    {
      name: 'execute_action',
      description: 'Execute a specific Composio action with parameters (goes through approval gate)',
      inputSchema: {
        properties: {
          actionId: { type: 'string', description: 'The action ID to execute (from list_actions)' },
          params: { type: 'object', description: 'Parameters for the action' },
          connectedAccountId: { type: 'string', description: 'The connected account to use (from list_connected_accounts)' },
        },
        required: ['actionId'],
      },
      riskLevel: 'high',
    },
    {
      name: 'list_connected_accounts',
      description: 'List which external services the user has connected in Composio',
      inputSchema: {
        properties: {
          page: { type: 'number', description: 'Page number (default: 1)' },
          pageSize: { type: 'number', description: 'Results per page (default: 20)' },
        },
      },
      riskLevel: 'low',
    },
    {
      name: 'search_actions',
      description: 'Search across all available Composio actions by keyword',
      inputSchema: {
        properties: {
          searchQuery: { type: 'string', description: 'Search query to find relevant actions' },
          page: { type: 'number', description: 'Page number (default: 1)' },
          pageSize: { type: 'number', description: 'Results per page (default: 20)' },
        },
        required: ['searchQuery'],
      },
      riskLevel: 'low',
    },
  ];

  private apiKey: string | null = null;

  async connect(vault: VaultStore): Promise<void> {
    const cred = vault.getConnectorCredential(this.id);
    this.apiKey = cred?.value ?? null;
  }

  async healthCheck(): Promise<ConnectorHealth> {
    const health: ConnectorHealth = {
      id: this.id,
      name: this.name,
      status: this.apiKey ? 'connected' : 'disconnected',
      lastChecked: new Date().toISOString(),
    };

    if (this.apiKey) {
      try {
        const res = await fetch(`${API_BASE}/connectedAccounts`, {
          headers: this.headers(),
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) {
          health.status = 'error';
          health.error = `Composio API returned ${res.status}`;
        }
      } catch (err: unknown) {
        health.status = 'error';
        health.error = err instanceof Error ? err.message : String(err);
      }
    }

    return health;
  }

  async execute(action: string, params: Record<string, unknown>): Promise<ConnectorResult> {
    if (!this.apiKey) return { success: false, error: 'Not connected — add Composio API key in vault' };

    switch (action) {
      case 'list_integrations': return this.listIntegrations(params);
      case 'list_actions': return this.listActions(params);
      case 'execute_action': return this.executeAction(params);
      case 'list_connected_accounts': return this.listConnectedAccounts(params);
      case 'search_actions': return this.searchActions(params);
      default: return { success: false, error: `Unknown action: ${action}` };
    }
  }

  private headers(): Record<string, string> {
    return {
      'X-API-KEY': this.apiKey!,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
  }

  private async listIntegrations(params: Record<string, unknown>): Promise<ConnectorResult> {
    try {
      const query = new URLSearchParams();
      if (params.page !== undefined) query.set('page', String(params.page));
      if (params.pageSize !== undefined) query.set('pageSize', String(params.pageSize));
      const qs = query.toString();
      const url = `${API_BASE}/integrations${qs ? `?${qs}` : ''}`;

      const res = await fetch(url, { headers: this.headers(), signal: AbortSignal.timeout(10000) });
      if (!res.ok) return { success: false, error: await this.safeErrorText(res, 'Composio API') };
      return { success: true, data: await res.json() };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async listActions(params: Record<string, unknown>): Promise<ConnectorResult> {
    try {
      const query = new URLSearchParams();
      if (params.appName !== undefined) query.set('appName', String(params.appName));
      if (params.page !== undefined) query.set('page', String(params.page));
      if (params.pageSize !== undefined) query.set('pageSize', String(params.pageSize));
      const qs = query.toString();
      const url = `${API_BASE}/actions${qs ? `?${qs}` : ''}`;

      const res = await fetch(url, { headers: this.headers(), signal: AbortSignal.timeout(10000) });
      if (!res.ok) return { success: false, error: await this.safeErrorText(res, 'Composio API') };
      return { success: true, data: await res.json() };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async executeAction(params: Record<string, unknown>): Promise<ConnectorResult> {
    try {
      const { actionId, params: actionParams, connectedAccountId } = params;
      if (!actionId) return { success: false, error: 'actionId is required' };

      const body: Record<string, unknown> = {};
      if (actionParams !== undefined) body.input = actionParams;
      if (connectedAccountId !== undefined) body.connectedAccountId = connectedAccountId;

      const res = await fetch(`${API_BASE}/actions/${encodeURIComponent(String(actionId))}/execute`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) return { success: false, error: await this.safeErrorText(res, 'Composio API') };

      const data = await res.json();
      // Annotate result with action/service for transparency
      return {
        success: true,
        data: {
          actionId,
          service: 'composio',
          result: data,
        },
      };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async listConnectedAccounts(params: Record<string, unknown>): Promise<ConnectorResult> {
    try {
      const query = new URLSearchParams();
      if (params.page !== undefined) query.set('page', String(params.page));
      if (params.pageSize !== undefined) query.set('pageSize', String(params.pageSize));
      const qs = query.toString();
      const url = `${API_BASE}/connectedAccounts${qs ? `?${qs}` : ''}`;

      const res = await fetch(url, { headers: this.headers(), signal: AbortSignal.timeout(10000) });
      if (!res.ok) return { success: false, error: await this.safeErrorText(res, 'Composio API') };
      return { success: true, data: await res.json() };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async searchActions(params: Record<string, unknown>): Promise<ConnectorResult> {
    try {
      const query = new URLSearchParams();
      if (params.searchQuery !== undefined) query.set('searchQuery', String(params.searchQuery));
      if (params.page !== undefined) query.set('page', String(params.page));
      if (params.pageSize !== undefined) query.set('pageSize', String(params.pageSize));
      const qs = query.toString();
      const url = `${API_BASE}/actions${qs ? `?${qs}` : ''}`;

      const res = await fetch(url, { headers: this.headers(), signal: AbortSignal.timeout(10000) });
      if (!res.ok) return { success: false, error: await this.safeErrorText(res, 'Composio API') };
      return { success: true, data: await res.json() };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}
