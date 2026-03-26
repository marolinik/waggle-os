/**
 * Airtable Connector — access bases, records, and search.
 * Auth: Bearer (Personal Access Token)
 */

import { BaseConnector, type ConnectorAction, type ConnectorResult } from '../connector-sdk.js';
import type { VaultStore } from '@waggle/core';
import type { ConnectorHealth } from '@waggle/shared';

const API_BASE = 'https://api.airtable.com/v0';

export class AirtableConnector extends BaseConnector {
  readonly id = 'airtable';
  readonly name = 'Airtable';
  readonly description = 'Access bases, records, and search in Airtable';
  readonly service = 'airtable.com';
  readonly authType = 'bearer' as const;
  readonly substrate = 'waggle' as const;

  readonly actions: ConnectorAction[] = [
    {
      name: 'list_bases',
      description: 'List all accessible bases',
      inputSchema: {
        properties: {
          offset: { type: 'string', description: 'Pagination offset' },
        },
      },
      riskLevel: 'low',
    },
    {
      name: 'list_records',
      description: 'List records from a table in a base',
      inputSchema: {
        properties: {
          baseId: { type: 'string', description: 'Airtable base ID (e.g., "appXXXXXXXXXX")' },
          tableIdOrName: { type: 'string', description: 'Table ID or name' },
          maxRecords: { type: 'number', description: 'Max records to return (default 100)' },
          view: { type: 'string', description: 'View name or ID to filter by' },
          filterByFormula: { type: 'string', description: 'Airtable formula to filter records' },
          sort: { type: 'string', description: 'Sort field name' },
          sortDirection: { type: 'string', enum: ['asc', 'desc'], description: 'Sort direction' },
        },
        required: ['baseId', 'tableIdOrName'],
      },
      riskLevel: 'low',
    },
    {
      name: 'get_record',
      description: 'Get a single record by ID',
      inputSchema: {
        properties: {
          baseId: { type: 'string', description: 'Airtable base ID' },
          tableIdOrName: { type: 'string', description: 'Table ID or name' },
          recordId: { type: 'string', description: 'Record ID (e.g., "recXXXXXXXXXX")' },
        },
        required: ['baseId', 'tableIdOrName', 'recordId'],
      },
      riskLevel: 'low',
    },
    {
      name: 'create_record',
      description: 'Create a new record in a table',
      inputSchema: {
        properties: {
          baseId: { type: 'string', description: 'Airtable base ID' },
          tableIdOrName: { type: 'string', description: 'Table ID or name' },
          fields: { type: 'object', description: 'Field name/value pairs for the new record' },
        },
        required: ['baseId', 'tableIdOrName', 'fields'],
      },
      riskLevel: 'medium',
    },
    {
      name: 'update_record',
      description: 'Update an existing record',
      inputSchema: {
        properties: {
          baseId: { type: 'string', description: 'Airtable base ID' },
          tableIdOrName: { type: 'string', description: 'Table ID or name' },
          recordId: { type: 'string', description: 'Record ID to update' },
          fields: { type: 'object', description: 'Field name/value pairs to update' },
        },
        required: ['baseId', 'tableIdOrName', 'recordId', 'fields'],
      },
      riskLevel: 'medium',
    },
    {
      name: 'search_records',
      description: 'Search records using a formula filter',
      inputSchema: {
        properties: {
          baseId: { type: 'string', description: 'Airtable base ID' },
          tableIdOrName: { type: 'string', description: 'Table ID or name' },
          filterByFormula: { type: 'string', description: 'Airtable formula (e.g., "FIND(\'search\', {Name})")' },
          maxRecords: { type: 'number', description: 'Max records to return (default 100)' },
        },
        required: ['baseId', 'tableIdOrName', 'filterByFormula'],
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
        // List bases as health check (meta API)
        const res = await fetch('https://api.airtable.com/v0/meta/bases', {
          headers: this.headers(),
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) {
          health.status = 'error';
          health.error = `Airtable API returned ${res.status}`;
        }
      } catch (err: unknown) {
        health.status = 'error';
        health.error = err instanceof Error ? err.message : String(err);
      }
    }

    return health;
  }

  async execute(action: string, params: Record<string, unknown>): Promise<ConnectorResult> {
    if (!this.token) return { success: false, error: 'Not connected — add Airtable access token in vault' };

    switch (action) {
      case 'list_bases': return this.listBases(params);
      case 'list_records': return this.listRecords(params);
      case 'get_record': return this.getRecord(params);
      case 'create_record': return this.createRecord(params);
      case 'update_record': return this.updateRecord(params);
      case 'search_records': return this.searchRecords(params);
      default: return { success: false, error: `Unknown action: ${action}` };
    }
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
      'Content-Type': 'application/json',
    };
  }

  private async listBases(params: Record<string, unknown>): Promise<ConnectorResult> {
    try {
      const query = new URLSearchParams();
      if (params.offset) query.set('offset', String(params.offset));
      const qs = query.toString();
      const url = `https://api.airtable.com/v0/meta/bases${qs ? `?${qs}` : ''}`;
      const res = await fetch(url, { headers: this.headers(), signal: AbortSignal.timeout(10000) });
      if (!res.ok) return { success: false, error: await this.safeErrorText(res, 'Airtable API') };
      return { success: true, data: await res.json() };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async listRecords(params: Record<string, unknown>): Promise<ConnectorResult> {
    try {
      const baseId = String(params.baseId);
      const tableIdOrName = String(params.tableIdOrName);
      const query = new URLSearchParams();
      if (params.maxRecords !== undefined) query.set('maxRecords', String(params.maxRecords));
      if (params.view) query.set('view', String(params.view));
      if (params.filterByFormula) query.set('filterByFormula', String(params.filterByFormula));
      if (params.sort) {
        query.set('sort[0][field]', String(params.sort));
        if (params.sortDirection) query.set('sort[0][direction]', String(params.sortDirection));
      }
      const qs = query.toString();
      const url = `${API_BASE}/${baseId}/${encodeURIComponent(tableIdOrName)}${qs ? `?${qs}` : ''}`;
      const res = await fetch(url, { headers: this.headers(), signal: AbortSignal.timeout(10000) });
      if (!res.ok) return { success: false, error: await this.safeErrorText(res, 'Airtable API') };
      return { success: true, data: await res.json() };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async getRecord(params: Record<string, unknown>): Promise<ConnectorResult> {
    try {
      const baseId = String(params.baseId);
      const tableIdOrName = String(params.tableIdOrName);
      const recordId = String(params.recordId);
      const url = `${API_BASE}/${baseId}/${encodeURIComponent(tableIdOrName)}/${recordId}`;
      const res = await fetch(url, { headers: this.headers(), signal: AbortSignal.timeout(10000) });
      if (!res.ok) return { success: false, error: await this.safeErrorText(res, 'Airtable API') };
      return { success: true, data: await res.json() };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async createRecord(params: Record<string, unknown>): Promise<ConnectorResult> {
    try {
      const baseId = String(params.baseId);
      const tableIdOrName = String(params.tableIdOrName);
      const url = `${API_BASE}/${baseId}/${encodeURIComponent(tableIdOrName)}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({ fields: params.fields }),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return { success: false, error: await this.safeErrorText(res, 'Airtable API') };
      return { success: true, data: await res.json() };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async updateRecord(params: Record<string, unknown>): Promise<ConnectorResult> {
    try {
      const baseId = String(params.baseId);
      const tableIdOrName = String(params.tableIdOrName);
      const recordId = String(params.recordId);
      const url = `${API_BASE}/${baseId}/${encodeURIComponent(tableIdOrName)}/${recordId}`;
      const res = await fetch(url, {
        method: 'PATCH',
        headers: this.headers(),
        body: JSON.stringify({ fields: params.fields }),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return { success: false, error: await this.safeErrorText(res, 'Airtable API') };
      return { success: true, data: await res.json() };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async searchRecords(params: Record<string, unknown>): Promise<ConnectorResult> {
    // Airtable search is done via filterByFormula on list_records
    return this.listRecords({
      baseId: params.baseId,
      tableIdOrName: params.tableIdOrName,
      filterByFormula: params.filterByFormula,
      maxRecords: params.maxRecords ?? 100,
    });
  }
}
