/**
 * Notion Connector — search, read, and manage Notion pages and databases.
 * Auth: Bearer (Integration Token)
 */

import { BaseConnector, type ConnectorAction, type ConnectorResult } from '../connector-sdk.js';
import type { VaultStore } from '@waggle/core';
import type { ConnectorHealth } from '@waggle/shared';

const API_BASE = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';

export class NotionConnector extends BaseConnector {
  readonly id = 'notion';
  readonly name = 'Notion';
  readonly description = 'Search, read, and manage Notion pages and databases';
  readonly service = 'notion.so';
  readonly authType = 'bearer' as const;
  readonly substrate = 'waggle' as const;

  readonly actions: ConnectorAction[] = [
    {
      name: 'search_pages',
      description: 'Search across all pages and databases in Notion',
      inputSchema: {
        properties: {
          query: { type: 'string', description: 'Search query text' },
          filter: { type: 'string', enum: ['page', 'database'], description: 'Filter by object type' },
          page_size: { type: 'number', description: 'Number of results (max 100)' },
        },
      },
      riskLevel: 'low',
    },
    {
      name: 'get_page',
      description: 'Get a Notion page by ID',
      inputSchema: {
        properties: {
          page_id: { type: 'string', description: 'Page ID (UUID)' },
        },
        required: ['page_id'],
      },
      riskLevel: 'low',
    },
    {
      name: 'list_databases',
      description: 'List all databases the integration has access to',
      inputSchema: {
        properties: {
          page_size: { type: 'number', description: 'Number of results (max 100)' },
        },
      },
      riskLevel: 'low',
    },
    {
      name: 'query_database',
      description: 'Query a Notion database with optional filters and sorts',
      inputSchema: {
        properties: {
          database_id: { type: 'string', description: 'Database ID (UUID)' },
          filter: { type: 'object', description: 'Notion filter object' },
          sorts: { type: 'array', description: 'Array of sort objects' },
          page_size: { type: 'number', description: 'Number of results (max 100)' },
        },
        required: ['database_id'],
      },
      riskLevel: 'low',
    },
    {
      name: 'create_page',
      description: 'Create a new Notion page in a parent page or database',
      inputSchema: {
        properties: {
          parent_id: { type: 'string', description: 'Parent page or database ID' },
          parent_type: { type: 'string', enum: ['page_id', 'database_id'], description: 'Type of parent (default: page_id)' },
          title: { type: 'string', description: 'Page title' },
          content: { type: 'string', description: 'Page content as plain text (converted to paragraph blocks)' },
          properties: { type: 'object', description: 'Additional database properties (when parent is a database)' },
        },
        required: ['parent_id', 'title'],
      },
      riskLevel: 'medium',
    },
    {
      name: 'update_page',
      description: 'Update properties of an existing Notion page',
      inputSchema: {
        properties: {
          page_id: { type: 'string', description: 'Page ID (UUID)' },
          properties: { type: 'object', description: 'Properties to update' },
          archived: { type: 'boolean', description: 'Set to true to archive the page' },
        },
        required: ['page_id'],
      },
      riskLevel: 'medium',
    },
    {
      name: 'get_block_children',
      description: 'Get the content blocks of a page or block',
      inputSchema: {
        properties: {
          block_id: { type: 'string', description: 'Block or page ID (UUID)' },
          page_size: { type: 'number', description: 'Number of results (max 100)' },
        },
        required: ['block_id'],
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
        const res = await fetch(`${API_BASE}/users/me`, {
          headers: this.headers(),
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) {
          health.status = 'error';
          health.error = `Notion API returned ${res.status}`;
        }
      } catch (err: unknown) {
        health.status = 'error';
        health.error = err instanceof Error ? err.message : String(err);
      }
    }

    return health;
  }

  async execute(action: string, params: Record<string, unknown>): Promise<ConnectorResult> {
    if (!this.token) return { success: false, error: 'Not connected — add Notion integration token in vault' };

    switch (action) {
      case 'search_pages': return this.searchPages(params);
      case 'get_page': return this.apiGet(`/pages/${params.page_id}`);
      case 'list_databases': return this.searchPages({ ...params, filter: 'database' });
      case 'query_database': return this.queryDatabase(params);
      case 'create_page': return this.createPage(params);
      case 'update_page': return this.updatePage(params);
      case 'get_block_children': return this.apiGet(`/blocks/${params.block_id}/children`, params, ['block_id']);
      default: return { success: false, error: `Unknown action: ${action}` };
    }
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
    };
  }

  private async apiGet(path: string, params: Record<string, unknown> = {}, stripKeys: string[] = []): Promise<ConnectorResult> {
    try {
      const query = new URLSearchParams();
      for (const [k, v] of Object.entries(params)) {
        if (!stripKeys.includes(k) && v !== undefined && typeof v === 'string') query.set(k, v);
        if (!stripKeys.includes(k) && v !== undefined && typeof v === 'number') query.set(k, String(v));
      }
      const qs = query.toString();
      const url = `${API_BASE}${path}${qs ? `?${qs}` : ''}`;
      const res = await fetch(url, { headers: this.headers(), signal: AbortSignal.timeout(10000) });
      if (!res.ok) return { success: false, error: await this.safeErrorText(res, 'Notion API') };
      return { success: true, data: await res.json() };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async searchPages(params: Record<string, unknown>): Promise<ConnectorResult> {
    try {
      const body: Record<string, unknown> = {};
      if (params.query) body.query = params.query;
      if (params.filter) body.filter = { value: params.filter, property: 'object' };
      if (params.page_size) body.page_size = params.page_size;

      const res = await fetch(`${API_BASE}/search`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return { success: false, error: await this.safeErrorText(res, 'Notion API') };
      return { success: true, data: await res.json() };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async queryDatabase(params: Record<string, unknown>): Promise<ConnectorResult> {
    try {
      const body: Record<string, unknown> = {};
      if (params.filter) body.filter = params.filter;
      if (params.sorts) body.sorts = params.sorts;
      if (params.page_size) body.page_size = params.page_size;

      const res = await fetch(`${API_BASE}/databases/${params.database_id}/query`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return { success: false, error: await this.safeErrorText(res, 'Notion API') };
      return { success: true, data: await res.json() };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async createPage(params: Record<string, unknown>): Promise<ConnectorResult> {
    try {
      const parentType = (params.parent_type as string) ?? 'page_id';
      const body: Record<string, unknown> = {
        parent: { [parentType]: params.parent_id },
        properties: {
          title: {
            title: [{ text: { content: params.title as string } }],
          },
          ...(params.properties as Record<string, unknown> ?? {}),
        },
      };

      // Add content as paragraph blocks if provided
      if (params.content) {
        body.children = [
          {
            object: 'block',
            type: 'paragraph',
            paragraph: {
              rich_text: [{ type: 'text', text: { content: params.content as string } }],
            },
          },
        ];
      }

      const res = await fetch(`${API_BASE}/pages`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return { success: false, error: await this.safeErrorText(res, 'Notion API') };
      return { success: true, data: await res.json() };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async updatePage(params: Record<string, unknown>): Promise<ConnectorResult> {
    try {
      const body: Record<string, unknown> = {};
      if (params.properties) body.properties = params.properties;
      if (params.archived !== undefined) body.archived = params.archived;

      const res = await fetch(`${API_BASE}/pages/${params.page_id}`, {
        method: 'PATCH',
        headers: this.headers(),
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return { success: false, error: await this.safeErrorText(res, 'Notion API') };
      return { success: true, data: await res.json() };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}
