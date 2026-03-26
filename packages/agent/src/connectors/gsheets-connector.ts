/**
 * Google Sheets Connector — read, write, and manage spreadsheets.
 * Auth: Bearer (OAuth2 access token in vault)
 */

import { BaseConnector, type ConnectorAction, type ConnectorResult } from '../connector-sdk.js';
import type { VaultStore } from '@waggle/core';
import type { ConnectorHealth } from '@waggle/shared';

const API_BASE = 'https://sheets.googleapis.com/v4';

export class GoogleSheetsConnector extends BaseConnector {
  readonly id = 'gsheets';
  readonly name = 'Google Sheets';
  readonly description = 'Read, write, and manage Google Sheets spreadsheets';
  readonly service = 'sheets.google.com';
  readonly authType = 'bearer' as const;
  readonly substrate = 'waggle' as const;

  readonly actions: ConnectorAction[] = [
    {
      name: 'get_spreadsheet',
      description: 'Get spreadsheet metadata and sheet names',
      inputSchema: {
        properties: {
          spreadsheetId: { type: 'string', description: 'The spreadsheet ID' },
        },
        required: ['spreadsheetId'],
      },
      riskLevel: 'low',
    },
    {
      name: 'get_values',
      description: 'Read cell values from a range',
      inputSchema: {
        properties: {
          spreadsheetId: { type: 'string', description: 'The spreadsheet ID' },
          range: { type: 'string', description: 'A1 notation range (e.g. "Sheet1!A1:D10")' },
          majorDimension: { type: 'string', enum: ['ROWS', 'COLUMNS'], description: 'Major dimension (default ROWS)' },
        },
        required: ['spreadsheetId', 'range'],
      },
      riskLevel: 'low',
    },
    {
      name: 'update_values',
      description: 'Write values to a cell range',
      inputSchema: {
        properties: {
          spreadsheetId: { type: 'string', description: 'The spreadsheet ID' },
          range: { type: 'string', description: 'A1 notation range (e.g. "Sheet1!A1:D10")' },
          values: { type: 'array', items: { type: 'array' }, description: 'Array of rows, each row is an array of cell values' },
          valueInputOption: { type: 'string', enum: ['RAW', 'USER_ENTERED'], description: 'How to interpret input (default USER_ENTERED)' },
        },
        required: ['spreadsheetId', 'range', 'values'],
      },
      riskLevel: 'medium',
    },
    {
      name: 'append_values',
      description: 'Append rows to a sheet',
      inputSchema: {
        properties: {
          spreadsheetId: { type: 'string', description: 'The spreadsheet ID' },
          range: { type: 'string', description: 'A1 notation range to append after (e.g. "Sheet1!A:D")' },
          values: { type: 'array', items: { type: 'array' }, description: 'Array of rows to append' },
          valueInputOption: { type: 'string', enum: ['RAW', 'USER_ENTERED'], description: 'How to interpret input (default USER_ENTERED)' },
        },
        required: ['spreadsheetId', 'range', 'values'],
      },
      riskLevel: 'medium',
    },
    {
      name: 'create_spreadsheet',
      description: 'Create a new spreadsheet',
      inputSchema: {
        properties: {
          title: { type: 'string', description: 'Spreadsheet title' },
          sheetTitles: { type: 'array', items: { type: 'string' }, description: 'Sheet names to create (default: ["Sheet1"])' },
        },
        required: ['title'],
      },
      riskLevel: 'medium',
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
        // Use Drive API about endpoint as a lightweight health check
        const res = await fetch('https://www.googleapis.com/drive/v3/about?fields=user', {
          headers: this.headers(),
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) {
          health.status = 'error';
          health.error = `Google Sheets API returned ${res.status}`;
        }
      } catch (err: unknown) {
        health.status = 'error';
        health.error = err instanceof Error ? err.message : String(err);
      }
    }

    return health;
  }

  async execute(action: string, params: Record<string, unknown>): Promise<ConnectorResult> {
    if (!this.token) return { success: false, error: 'Not connected — add Google Sheets token in Settings' };

    switch (action) {
      case 'get_spreadsheet': return this.getSpreadsheet(params);
      case 'get_values': return this.getValues(params);
      case 'update_values': return this.updateValues(params);
      case 'append_values': return this.appendValues(params);
      case 'create_spreadsheet': return this.createSpreadsheet(params);
      default: return { success: false, error: `Unknown action: ${action}` };
    }
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
      'Content-Type': 'application/json',
    };
  }

  private async getSpreadsheet(params: Record<string, unknown>): Promise<ConnectorResult> {
    try {
      const spreadsheetId = params.spreadsheetId as string;
      const res = await fetch(`${API_BASE}/spreadsheets/${encodeURIComponent(spreadsheetId)}`, {
        headers: this.headers(),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return { success: false, error: await this.safeErrorText(res, 'Google Sheets API') };
      return { success: true, data: await res.json() };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async getValues(params: Record<string, unknown>): Promise<ConnectorResult> {
    try {
      const spreadsheetId = params.spreadsheetId as string;
      const range = params.range as string;
      const query = new URLSearchParams();
      if (params.majorDimension) query.set('majorDimension', String(params.majorDimension));

      const qs = query.toString();
      const url = `${API_BASE}/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}${qs ? `?${qs}` : ''}`;
      const res = await fetch(url, {
        headers: this.headers(),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return { success: false, error: await this.safeErrorText(res, 'Google Sheets API') };
      return { success: true, data: await res.json() };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async updateValues(params: Record<string, unknown>): Promise<ConnectorResult> {
    try {
      const spreadsheetId = params.spreadsheetId as string;
      const range = params.range as string;
      const values = params.values as unknown[][];
      const valueInputOption = (params.valueInputOption as string) || 'USER_ENTERED';

      const query = new URLSearchParams({ valueInputOption });
      const url = `${API_BASE}/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}?${query}`;

      const res = await fetch(url, {
        method: 'PUT',
        headers: this.headers(),
        body: JSON.stringify({ range, majorDimension: 'ROWS', values }),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return { success: false, error: await this.safeErrorText(res, 'Google Sheets API') };
      return { success: true, data: await res.json() };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async appendValues(params: Record<string, unknown>): Promise<ConnectorResult> {
    try {
      const spreadsheetId = params.spreadsheetId as string;
      const range = params.range as string;
      const values = params.values as unknown[][];
      const valueInputOption = (params.valueInputOption as string) || 'USER_ENTERED';

      const query = new URLSearchParams({ valueInputOption });
      const url = `${API_BASE}/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}:append?${query}`;

      const res = await fetch(url, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({ range, majorDimension: 'ROWS', values }),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return { success: false, error: await this.safeErrorText(res, 'Google Sheets API') };
      return { success: true, data: await res.json() };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async createSpreadsheet(params: Record<string, unknown>): Promise<ConnectorResult> {
    try {
      const title = params.title as string;
      const sheetTitles = (params.sheetTitles as string[]) || ['Sheet1'];

      const body = {
        properties: { title },
        sheets: sheetTitles.map(sheetTitle => ({
          properties: { title: sheetTitle },
        })),
      };

      const res = await fetch(`${API_BASE}/spreadsheets`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return { success: false, error: await this.safeErrorText(res, 'Google Sheets API') };
      return { success: true, data: await res.json() };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}
