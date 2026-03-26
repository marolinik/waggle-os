/**
 * Salesforce Connector — access records, contacts, and opportunities via REST API.
 * Auth: Bearer (OAuth2 access token or session token)
 * Requires instance URL stored in vault metadata.
 */

import { BaseConnector, type ConnectorAction, type ConnectorResult } from '../connector-sdk.js';
import type { VaultStore } from '@waggle/core';
import type { ConnectorHealth } from '@waggle/shared';

const API_VERSION = 'v59.0';

export class SalesforceConnector extends BaseConnector {
  readonly id = 'salesforce';
  readonly name = 'Salesforce';
  readonly description = 'Access records, contacts, and opportunities in Salesforce CRM';
  readonly service = 'salesforce.com';
  readonly authType = 'bearer' as const;
  readonly substrate = 'waggle' as const;

  readonly actions: ConnectorAction[] = [
    {
      name: 'search',
      description: 'Search records using a SOQL query',
      inputSchema: {
        properties: {
          query: { type: 'string', description: 'SOQL query (e.g., "SELECT Id, Name FROM Account LIMIT 10")' },
        },
        required: ['query'],
      },
      riskLevel: 'low',
    },
    {
      name: 'list_contacts',
      description: 'List contacts with optional limit',
      inputSchema: {
        properties: {
          limit: { type: 'number', description: 'Max results (default 25)' },
          fields: { type: 'string', description: 'Comma-separated field names (default: Id,Name,Email,Phone)' },
        },
      },
      riskLevel: 'low',
    },
    {
      name: 'get_record',
      description: 'Get a single record by object type and ID',
      inputSchema: {
        properties: {
          objectType: { type: 'string', description: 'Salesforce object type (e.g., "Contact", "Account", "Lead")' },
          recordId: { type: 'string', description: 'Salesforce record ID (18-char)' },
          fields: { type: 'string', description: 'Comma-separated field names to retrieve' },
        },
        required: ['objectType', 'recordId'],
      },
      riskLevel: 'low',
    },
    {
      name: 'create_record',
      description: 'Create a new record of any object type',
      inputSchema: {
        properties: {
          objectType: { type: 'string', description: 'Salesforce object type (e.g., "Contact", "Lead")' },
          fields: { type: 'object', description: 'Field name/value pairs for the new record' },
        },
        required: ['objectType', 'fields'],
      },
      riskLevel: 'medium',
    },
    {
      name: 'update_record',
      description: 'Update an existing record',
      inputSchema: {
        properties: {
          objectType: { type: 'string', description: 'Salesforce object type' },
          recordId: { type: 'string', description: 'Salesforce record ID' },
          fields: { type: 'object', description: 'Field name/value pairs to update' },
        },
        required: ['objectType', 'recordId', 'fields'],
      },
      riskLevel: 'medium',
    },
    {
      name: 'list_opportunities',
      description: 'List opportunities with optional limit',
      inputSchema: {
        properties: {
          limit: { type: 'number', description: 'Max results (default 25)' },
          fields: { type: 'string', description: 'Comma-separated field names (default: Id,Name,StageName,Amount,CloseDate)' },
        },
      },
      riskLevel: 'low',
    },
  ];

  private token: string | null = null;
  private instanceUrl: string | null = null;

  async connect(vault: VaultStore): Promise<void> {
    const cred = vault.getConnectorCredential(this.id);
    this.token = cred?.value ?? null;

    // Instance URL from vault metadata (e.g., "https://mycompany.salesforce.com")
    const urlEntry = vault.get(`connector:${this.id}:instance_url`);
    this.instanceUrl = urlEntry?.value ?? null;
  }

  async healthCheck(): Promise<ConnectorHealth> {
    const health: ConnectorHealth = {
      id: this.id,
      name: this.name,
      status: this.token && this.instanceUrl ? 'connected' : 'disconnected',
      lastChecked: new Date().toISOString(),
    };

    if (this.token && this.instanceUrl) {
      try {
        const res = await fetch(`${this.instanceUrl}/services/data/${API_VERSION}/limits`, {
          headers: this.headers(),
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) {
          health.status = 'error';
          health.error = `Salesforce API returned ${res.status}`;
        }
      } catch (err: unknown) {
        health.status = 'error';
        health.error = err instanceof Error ? err.message : String(err);
      }
    }

    return health;
  }

  async execute(action: string, params: Record<string, unknown>): Promise<ConnectorResult> {
    if (!this.token || !this.instanceUrl) {
      return { success: false, error: 'Not connected — add Salesforce access token and instance URL in vault' };
    }

    switch (action) {
      case 'search': return this.soqlQuery(params);
      case 'list_contacts': return this.listObjects('Contact', params, 'Id,Name,Email,Phone');
      case 'get_record': return this.getRecord(params);
      case 'create_record': return this.createRecord(params);
      case 'update_record': return this.updateRecord(params);
      case 'list_opportunities': return this.listObjects('Opportunity', params, 'Id,Name,StageName,Amount,CloseDate');
      default: return { success: false, error: `Unknown action: ${action}` };
    }
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
      'Content-Type': 'application/json',
    };
  }

  private get apiBase(): string {
    return `${this.instanceUrl}/services/data/${API_VERSION}`;
  }

  private async soqlQuery(params: Record<string, unknown>): Promise<ConnectorResult> {
    try {
      const query = encodeURIComponent(String(params.query));
      const res = await fetch(`${this.apiBase}/query?q=${query}`, {
        headers: this.headers(),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return { success: false, error: await this.safeErrorText(res, 'Salesforce API') };
      return { success: true, data: await res.json() };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async listObjects(objectType: string, params: Record<string, unknown>, defaultFields: string): Promise<ConnectorResult> {
    try {
      const limit = (params.limit as number) ?? 25;
      const fields = (params.fields as string) ?? defaultFields;
      const soql = `SELECT ${fields} FROM ${objectType} ORDER BY CreatedDate DESC LIMIT ${limit}`;
      const res = await fetch(`${this.apiBase}/query?q=${encodeURIComponent(soql)}`, {
        headers: this.headers(),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return { success: false, error: await this.safeErrorText(res, 'Salesforce API') };
      return { success: true, data: await res.json() };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async getRecord(params: Record<string, unknown>): Promise<ConnectorResult> {
    try {
      const objectType = String(params.objectType);
      const recordId = String(params.recordId);
      let url = `${this.apiBase}/sobjects/${objectType}/${recordId}`;
      if (params.fields) url += `?fields=${encodeURIComponent(String(params.fields))}`;
      const res = await fetch(url, {
        headers: this.headers(),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return { success: false, error: await this.safeErrorText(res, 'Salesforce API') };
      return { success: true, data: await res.json() };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async createRecord(params: Record<string, unknown>): Promise<ConnectorResult> {
    try {
      const objectType = String(params.objectType);
      const fields = params.fields as Record<string, unknown>;
      const res = await fetch(`${this.apiBase}/sobjects/${objectType}`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(fields),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return { success: false, error: await this.safeErrorText(res, 'Salesforce API') };
      return { success: true, data: await res.json() };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async updateRecord(params: Record<string, unknown>): Promise<ConnectorResult> {
    try {
      const objectType = String(params.objectType);
      const recordId = String(params.recordId);
      const fields = params.fields as Record<string, unknown>;
      const res = await fetch(`${this.apiBase}/sobjects/${objectType}/${recordId}`, {
        method: 'PATCH',
        headers: this.headers(),
        body: JSON.stringify(fields),
        signal: AbortSignal.timeout(10000),
      });
      // Salesforce returns 204 No Content on successful update
      if (res.status !== 204 && !res.ok) {
        return { success: false, error: await this.safeErrorText(res, 'Salesforce API') };
      }
      return { success: true, data: { id: recordId, updated: true } };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}
