/**
 * HubSpot Connector — access contacts, deals, and companies.
 * Auth: Bearer (Private App access token)
 */

import { BaseConnector, type ConnectorAction, type ConnectorResult } from '../connector-sdk.js';
import type { VaultStore } from '@waggle/core';
import type { ConnectorHealth } from '@waggle/shared';

const API_BASE = 'https://api.hubapi.com';

export class HubSpotConnector extends BaseConnector {
  readonly id = 'hubspot';
  readonly name = 'HubSpot';
  readonly description = 'Access contacts, deals, and companies in HubSpot CRM';
  readonly service = 'hubspot.com';
  readonly authType = 'bearer' as const;
  readonly substrate = 'waggle' as const;

  readonly actions: ConnectorAction[] = [
    {
      name: 'list_contacts',
      description: 'List contacts with optional limit',
      inputSchema: {
        properties: {
          limit: { type: 'number', description: 'Max results (default 10, max 100)' },
          after: { type: 'string', description: 'Pagination cursor' },
          properties: { type: 'string', description: 'Comma-separated property names to include' },
        },
      },
      riskLevel: 'low',
    },
    {
      name: 'get_contact',
      description: 'Get a single contact by ID',
      inputSchema: {
        properties: {
          contactId: { type: 'string', description: 'HubSpot contact ID' },
          properties: { type: 'string', description: 'Comma-separated property names to include' },
        },
        required: ['contactId'],
      },
      riskLevel: 'low',
    },
    {
      name: 'create_contact',
      description: 'Create a new contact',
      inputSchema: {
        properties: {
          email: { type: 'string', description: 'Contact email address' },
          firstname: { type: 'string', description: 'First name' },
          lastname: { type: 'string', description: 'Last name' },
          phone: { type: 'string', description: 'Phone number' },
          company: { type: 'string', description: 'Company name' },
        },
        required: ['email'],
      },
      riskLevel: 'medium',
    },
    {
      name: 'search_contacts',
      description: 'Search contacts by query',
      inputSchema: {
        properties: {
          query: { type: 'string', description: 'Search query string' },
          limit: { type: 'number', description: 'Max results (default 10)' },
        },
        required: ['query'],
      },
      riskLevel: 'low',
    },
    {
      name: 'list_deals',
      description: 'List deals with optional limit',
      inputSchema: {
        properties: {
          limit: { type: 'number', description: 'Max results (default 10, max 100)' },
          after: { type: 'string', description: 'Pagination cursor' },
          properties: { type: 'string', description: 'Comma-separated property names to include' },
        },
      },
      riskLevel: 'low',
    },
    {
      name: 'create_deal',
      description: 'Create a new deal',
      inputSchema: {
        properties: {
          dealname: { type: 'string', description: 'Deal name' },
          amount: { type: 'string', description: 'Deal amount' },
          dealstage: { type: 'string', description: 'Deal stage (e.g., "appointmentscheduled")' },
          pipeline: { type: 'string', description: 'Pipeline ID (default: "default")' },
          closedate: { type: 'string', description: 'Expected close date (ISO 8601)' },
        },
        required: ['dealname'],
      },
      riskLevel: 'medium',
    },
    {
      name: 'list_companies',
      description: 'List companies with optional limit',
      inputSchema: {
        properties: {
          limit: { type: 'number', description: 'Max results (default 10, max 100)' },
          after: { type: 'string', description: 'Pagination cursor' },
          properties: { type: 'string', description: 'Comma-separated property names to include' },
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
        const res = await fetch(`${API_BASE}/crm/v3/objects/contacts?limit=1`, {
          headers: this.headers(),
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) {
          health.status = 'error';
          health.error = `HubSpot API returned ${res.status}`;
        }
      } catch (err: unknown) {
        health.status = 'error';
        health.error = err instanceof Error ? err.message : String(err);
      }
    }

    return health;
  }

  async execute(action: string, params: Record<string, unknown>): Promise<ConnectorResult> {
    if (!this.token) return { success: false, error: 'Not connected — add HubSpot access token in vault' };

    switch (action) {
      case 'list_contacts': return this.listObjects('contacts', params);
      case 'get_contact': return this.getContact(params);
      case 'create_contact': return this.createObject('contacts', params);
      case 'search_contacts': return this.searchContacts(params);
      case 'list_deals': return this.listObjects('deals', params);
      case 'create_deal': return this.createObject('deals', params);
      case 'list_companies': return this.listObjects('companies', params);
      default: return { success: false, error: `Unknown action: ${action}` };
    }
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
      'Content-Type': 'application/json',
    };
  }

  private async listObjects(objectType: string, params: Record<string, unknown>): Promise<ConnectorResult> {
    try {
      const query = new URLSearchParams();
      if (params.limit !== undefined) query.set('limit', String(params.limit));
      if (params.after) query.set('after', String(params.after));
      if (params.properties) {
        for (const prop of String(params.properties).split(',')) {
          query.append('properties', prop.trim());
        }
      }
      const qs = query.toString();
      const url = `${API_BASE}/crm/v3/objects/${objectType}${qs ? `?${qs}` : ''}`;
      const res = await fetch(url, { headers: this.headers(), signal: AbortSignal.timeout(10000) });
      if (!res.ok) return { success: false, error: await this.safeErrorText(res, 'HubSpot API') };
      return { success: true, data: await res.json() };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async getContact(params: Record<string, unknown>): Promise<ConnectorResult> {
    try {
      const query = new URLSearchParams();
      if (params.properties) {
        for (const prop of String(params.properties).split(',')) {
          query.append('properties', prop.trim());
        }
      }
      const qs = query.toString();
      const url = `${API_BASE}/crm/v3/objects/contacts/${encodeURIComponent(String(params.contactId))}${qs ? `?${qs}` : ''}`;
      const res = await fetch(url, { headers: this.headers(), signal: AbortSignal.timeout(10000) });
      if (!res.ok) return { success: false, error: await this.safeErrorText(res, 'HubSpot API') };
      return { success: true, data: await res.json() };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async createObject(objectType: string, params: Record<string, unknown>): Promise<ConnectorResult> {
    try {
      const properties: Record<string, unknown> = { ...params };
      const res = await fetch(`${API_BASE}/crm/v3/objects/${objectType}`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({ properties }),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return { success: false, error: await this.safeErrorText(res, 'HubSpot API') };
      return { success: true, data: await res.json() };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async searchContacts(params: Record<string, unknown>): Promise<ConnectorResult> {
    try {
      const res = await fetch(`${API_BASE}/crm/v3/objects/contacts/search`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({
          query: params.query,
          limit: params.limit ?? 10,
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return { success: false, error: await this.safeErrorText(res, 'HubSpot API') };
      return { success: true, data: await res.json() };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}
