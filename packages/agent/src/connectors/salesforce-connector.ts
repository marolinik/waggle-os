/**
 * Salesforce Connector — access records, contacts, and opportunities via REST API.
 * Auth: Bearer (OAuth2 access token or session token)
 * Requires instance URL stored in vault metadata.
 */

import { BaseConnector, type ConnectorAction, type ConnectorResult } from '../connector-sdk.js';
import { safeFetch } from '../url-egress-guard.js';
import type { VaultStore } from '@waggle/core';
import type { ConnectorDefinition, ConnectorHealth, ConnectorStatus } from '@waggle/shared';

const API_VERSION = 'v59.0';
const MAX_LIST_LIMIT = 2_000;
const MAX_SOQL_LENGTH = 20_000;
const MAX_FIELD_LIST_LENGTH = 2_048;
const MAX_FIELDS = 200;
const SALESFORCE_IDENTIFIER = /^[A-Za-z][A-Za-z0-9_]{0,79}$/;

function requireIdentifier(value: unknown, label: string): string {
  if (typeof value !== 'string' || !SALESFORCE_IDENTIFIER.test(value)) {
    throw new TypeError(`Invalid Salesforce ${label}`);
  }
  return value;
}

function requireRecordId(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9]{15}(?:[A-Za-z0-9]{3})?$/.test(value)) {
    throw new TypeError('Invalid Salesforce record ID');
  }
  return value;
}

function requireFieldList(value: unknown, defaultFields?: string): string {
  const candidate = value === undefined ? defaultFields : value;
  if (typeof candidate !== 'string' || candidate.length === 0 || candidate.length > MAX_FIELD_LIST_LENGTH) {
    throw new TypeError('Invalid Salesforce field list');
  }

  const fields = candidate.split(',').map(field => field.trim());
  if (
    fields.length === 0
    || fields.length > MAX_FIELDS
    || fields.some(field => {
      const segments = field.split('.');
      return segments.length > 6 || segments.some(segment => !SALESFORCE_IDENTIFIER.test(segment));
    })
  ) {
    throw new TypeError('Invalid Salesforce field list');
  }
  return fields.join(',');
}

function requireFieldMap(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError('Invalid Salesforce fields');
  }
  const prototype = Object.getPrototypeOf(value);
  const fields = value as Record<string, unknown>;
  const names = Object.keys(fields);
  if (
    (prototype !== Object.prototype && prototype !== null)
    || names.length === 0
    || names.length > MAX_FIELDS
    || names.some(name => !SALESFORCE_IDENTIFIER.test(name))
  ) {
    throw new TypeError('Invalid Salesforce fields');
  }
  return fields;
}

function requireListLimit(value: unknown): number {
  const limit = value === undefined ? 25 : value;
  if (typeof limit !== 'number' || !Number.isSafeInteger(limit) || limit < 1 || limit > MAX_LIST_LIMIT) {
    throw new TypeError(`Salesforce limit must be an integer from 1 to ${MAX_LIST_LIMIT}`);
  }
  return limit;
}

function requireSoqlQuery(value: unknown): string {
  if (typeof value !== 'string') throw new TypeError('Invalid Salesforce SOQL query');
  const query = value.trim();
  if (query.length === 0 || query.length > MAX_SOQL_LENGTH) {
    throw new TypeError('Invalid Salesforce SOQL query');
  }
  return query;
}

export class SalesforceConnector extends BaseConnector {
  static normalizeInstanceOrigin(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const candidate = value.trim();
    const originMatch = /^https:\/\/([^/?#]+)\/?$/i.exec(candidate);
    if (!originMatch || originMatch[1].includes('@') || originMatch[1].includes(':')) return null;

    let parsed: URL;
    try {
      parsed = new URL(candidate);
    } catch {
      return null;
    }

    const hostname = parsed.hostname.toLowerCase();
    const labels = hostname.split('.');
    if (
      parsed.protocol !== 'https:'
      || parsed.username !== ''
      || parsed.password !== ''
      || parsed.port !== ''
      || parsed.pathname !== '/'
      || parsed.search !== ''
      || parsed.hash !== ''
      || !hostname.endsWith('.salesforce.com')
      || labels.some(label => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))
    ) {
      return null;
    }

    return `https://${hostname}`;
  }

  readonly id = 'salesforce';
  readonly name = 'Salesforce';
  readonly description = "Query and manage Salesforce objects using SOQL. Access leads, contacts, opportunities, accounts, and custom objects with full CRM visibility.";
  readonly service = 'salesforce.com';
  readonly authType = 'bearer' as const;
  readonly substrate = 'waggle' as const;
  readonly logoUrl = 'https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/salesforce.svg';
  readonly category = 'crm' as const;
  readonly setupGuide = "Create a Connected App in Salesforce Setup and use OAuth2 flow to get an access token.";

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
      // Arbitrary SOQL can expose any object/field visible to the credential.
      riskLevel: 'high',
    },
    {
      name: 'list_contacts',
      description: 'List contacts with optional limit',
      inputSchema: {
        properties: {
          limit: { type: 'number', description: `Max results (default 25, max ${MAX_LIST_LIMIT})` },
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
          recordId: { type: 'string', description: 'Salesforce record ID (15 or 18 characters)' },
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
          limit: { type: 'number', description: `Max results (default 25, max ${MAX_LIST_LIMIT})` },
          fields: { type: 'string', description: 'Comma-separated field names (default: Id,Name,StageName,Amount,CloseDate)' },
        },
      },
      riskLevel: 'low',
    },
  ];

  private token: string | null = null;
  private instanceUrl: string | null = null;

  override toDefinition(status: ConnectorStatus): ConnectorDefinition {
    const effectiveStatus = status === 'connected' && (!this.token || !this.instanceUrl)
      ? 'disconnected'
      : status;
    return super.toDefinition(effectiveStatus);
  }

  async connect(vault: VaultStore): Promise<void> {
    const cred = vault.getConnectorCredential(this.id);
    this.token = cred?.value ?? null;

    // Instance URL from vault metadata (e.g., "https://mycompany.salesforce.com")
    const urlEntry = vault.get(`connector:${this.id}:instance_url`);
    this.instanceUrl = SalesforceConnector.normalizeInstanceOrigin(urlEntry?.value);
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
        const res = await safeFetch(`${this.instanceUrl}/services/data/${API_VERSION}/limits`, {
          headers: this.headers(),
          signal: AbortSignal.timeout(5000),
        }, { maxRedirects: 0 });
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
      const query = encodeURIComponent(requireSoqlQuery(params.query));
      const res = await safeFetch(`${this.apiBase}/query?q=${query}`, {
        headers: this.headers(),
        signal: AbortSignal.timeout(10000),
      }, { maxRedirects: 0 });
      if (!res.ok) return { success: false, error: await this.safeErrorText(res, 'Salesforce API') };
      return { success: true, data: await res.json() };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async listObjects(objectType: string, params: Record<string, unknown>, defaultFields: string): Promise<ConnectorResult> {
    try {
      const limit = requireListLimit(params.limit);
      const fields = requireFieldList(params.fields, defaultFields);
      const safeObjectType = requireIdentifier(objectType, 'object type');
      const soql = `SELECT ${fields} FROM ${safeObjectType} ORDER BY CreatedDate DESC LIMIT ${limit}`;
      const res = await safeFetch(`${this.apiBase}/query?q=${encodeURIComponent(soql)}`, {
        headers: this.headers(),
        signal: AbortSignal.timeout(10000),
      }, { maxRedirects: 0 });
      if (!res.ok) return { success: false, error: await this.safeErrorText(res, 'Salesforce API') };
      return { success: true, data: await res.json() };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async getRecord(params: Record<string, unknown>): Promise<ConnectorResult> {
    try {
      const objectType = requireIdentifier(params.objectType, 'object type');
      const recordId = requireRecordId(params.recordId);
      let url = `${this.apiBase}/sobjects/${encodeURIComponent(objectType)}/${encodeURIComponent(recordId)}`;
      if (params.fields !== undefined) url += `?fields=${encodeURIComponent(requireFieldList(params.fields))}`;
      const res = await safeFetch(url, {
        headers: this.headers(),
        signal: AbortSignal.timeout(10000),
      }, { maxRedirects: 0 });
      if (!res.ok) return { success: false, error: await this.safeErrorText(res, 'Salesforce API') };
      return { success: true, data: await res.json() };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async createRecord(params: Record<string, unknown>): Promise<ConnectorResult> {
    try {
      const objectType = requireIdentifier(params.objectType, 'object type');
      const fields = requireFieldMap(params.fields);
      const res = await safeFetch(`${this.apiBase}/sobjects/${encodeURIComponent(objectType)}`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(fields),
        signal: AbortSignal.timeout(10000),
      }, { maxRedirects: 0 });
      if (!res.ok) return { success: false, error: await this.safeErrorText(res, 'Salesforce API') };
      return { success: true, data: await res.json() };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async updateRecord(params: Record<string, unknown>): Promise<ConnectorResult> {
    try {
      const objectType = requireIdentifier(params.objectType, 'object type');
      const recordId = requireRecordId(params.recordId);
      const fields = requireFieldMap(params.fields);
      const res = await safeFetch(`${this.apiBase}/sobjects/${encodeURIComponent(objectType)}/${encodeURIComponent(recordId)}`, {
        method: 'PATCH',
        headers: this.headers(),
        body: JSON.stringify(fields),
        signal: AbortSignal.timeout(10000),
      }, { maxRedirects: 0 });
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
