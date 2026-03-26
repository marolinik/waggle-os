/**
 * Confluence Connector — search, read, and manage Confluence pages and spaces.
 * Auth: Basic (email:apiToken) — Confluence Cloud uses email + API token, same as Jira.
 */

import { BaseConnector, type ConnectorAction, type ConnectorResult } from '../connector-sdk.js';
import type { VaultStore } from '@waggle/core';
import type { ConnectorHealth } from '@waggle/shared';

export class ConfluenceConnector extends BaseConnector {
  readonly id = 'confluence';
  readonly name = 'Confluence';
  readonly description = 'Search, read, and manage Confluence pages and spaces';
  readonly service = 'atlassian.net';
  readonly authType = 'basic' as const;
  readonly substrate = 'waggle' as const;

  readonly actions: ConnectorAction[] = [
    {
      name: 'search_content',
      description: 'Search Confluence content using CQL (Confluence Query Language)',
      inputSchema: {
        properties: {
          cql: { type: 'string', description: 'CQL query (e.g., "type=page AND text~\\"project plan\\"")' },
          limit: { type: 'number', description: 'Max results (default 25)' },
        },
        required: ['cql'],
      },
      riskLevel: 'low',
    },
    {
      name: 'get_page',
      description: 'Get a Confluence page by ID',
      inputSchema: {
        properties: {
          page_id: { type: 'string', description: 'Page ID' },
          body_format: { type: 'string', enum: ['storage', 'atlas_doc_format', 'view'], description: 'Body format (default: storage)' },
        },
        required: ['page_id'],
      },
      riskLevel: 'low',
    },
    {
      name: 'list_spaces',
      description: 'List all Confluence spaces',
      inputSchema: {
        properties: {
          limit: { type: 'number', description: 'Max results (default 25)' },
          type: { type: 'string', enum: ['global', 'personal'], description: 'Filter by space type' },
        },
      },
      riskLevel: 'low',
    },
    {
      name: 'create_page',
      description: 'Create a new Confluence page in a space',
      inputSchema: {
        properties: {
          spaceId: { type: 'string', description: 'Space ID to create the page in' },
          title: { type: 'string', description: 'Page title' },
          body: { type: 'string', description: 'Page body in storage format (XHTML)' },
          parentId: { type: 'string', description: 'Parent page ID (optional — creates as child page)' },
          status: { type: 'string', enum: ['current', 'draft'], description: 'Page status (default: current)' },
        },
        required: ['spaceId', 'title', 'body'],
      },
      riskLevel: 'medium',
    },
    {
      name: 'update_page',
      description: 'Update an existing Confluence page',
      inputSchema: {
        properties: {
          page_id: { type: 'string', description: 'Page ID to update' },
          title: { type: 'string', description: 'New page title' },
          body: { type: 'string', description: 'New page body in storage format (XHTML)' },
          version_number: { type: 'number', description: 'Current version number (required for updates)' },
          status: { type: 'string', enum: ['current', 'draft'], description: 'Page status (default: current)' },
        },
        required: ['page_id', 'title', 'body', 'version_number'],
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

    // Confluence Cloud uses email:apiToken as basic auth (same pattern as Jira)
    this.authHeader = `Basic ${Buffer.from(`${email}:${apiToken}`).toString('base64')}`;

    // Domain from vault — constructs the wiki API v2 base URL
    const domainEntry = vault.get(`connector:${this.id}:domain`);
    const domain = domainEntry?.value ?? null;
    if (domain) {
      this.baseUrl = `https://${domain}.atlassian.net/wiki/api/v2`;
    }
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
        const res = await fetch(`${this.baseUrl}/spaces?limit=1`, {
          headers: this.headers(),
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) {
          health.status = 'error';
          health.error = `Confluence API returned ${res.status}`;
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
      return { success: false, error: 'Not connected — add Confluence API token, email, and domain in vault' };
    }

    switch (action) {
      case 'search_content': return this.searchContent(params);
      case 'get_page': return this.getPage(params);
      case 'list_spaces': return this.listSpaces(params);
      case 'create_page': return this.createPage(params);
      case 'update_page': return this.updatePage(params);
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

  private async searchContent(params: Record<string, unknown>): Promise<ConnectorResult> {
    try {
      const query = new URLSearchParams();
      query.set('cql', params.cql as string);
      if (params.limit) query.set('limit', String(params.limit));

      const res = await fetch(`${this.baseUrl}/search?${query.toString()}`, {
        headers: this.headers(),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return { success: false, error: await this.safeErrorText(res, 'Confluence API') };
      return { success: true, data: await res.json() };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async getPage(params: Record<string, unknown>): Promise<ConnectorResult> {
    try {
      const query = new URLSearchParams();
      if (params.body_format) query.set('body-format', params.body_format as string);

      const qs = query.toString();
      const url = `${this.baseUrl}/pages/${params.page_id}${qs ? `?${qs}` : ''}`;
      const res = await fetch(url, {
        headers: this.headers(),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return { success: false, error: await this.safeErrorText(res, 'Confluence API') };
      return { success: true, data: await res.json() };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async listSpaces(params: Record<string, unknown>): Promise<ConnectorResult> {
    try {
      const query = new URLSearchParams();
      if (params.limit) query.set('limit', String(params.limit));
      if (params.type) query.set('type', params.type as string);

      const qs = query.toString();
      const url = `${this.baseUrl}/spaces${qs ? `?${qs}` : ''}`;
      const res = await fetch(url, {
        headers: this.headers(),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return { success: false, error: await this.safeErrorText(res, 'Confluence API') };
      return { success: true, data: await res.json() };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async createPage(params: Record<string, unknown>): Promise<ConnectorResult> {
    try {
      const body: Record<string, unknown> = {
        spaceId: params.spaceId,
        title: params.title,
        status: (params.status as string) ?? 'current',
        body: {
          representation: 'storage',
          value: params.body,
        },
      };
      if (params.parentId) body.parentId = params.parentId;

      const res = await fetch(`${this.baseUrl}/pages`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return { success: false, error: await this.safeErrorText(res, 'Confluence API') };
      return { success: true, data: await res.json() };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async updatePage(params: Record<string, unknown>): Promise<ConnectorResult> {
    try {
      const body: Record<string, unknown> = {
        id: params.page_id,
        title: params.title,
        status: (params.status as string) ?? 'current',
        body: {
          representation: 'storage',
          value: params.body,
        },
        version: {
          number: params.version_number,
          message: 'Updated via Waggle',
        },
      };

      const res = await fetch(`${this.baseUrl}/pages/${params.page_id}`, {
        method: 'PUT',
        headers: this.headers(),
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return { success: false, error: await this.safeErrorText(res, 'Confluence API') };
      return { success: true, data: await res.json() };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}
