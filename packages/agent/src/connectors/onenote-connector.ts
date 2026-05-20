/**
 * OneNote Connector — notebooks, sections, and pages via Microsoft Graph API.
 *
 * E-6 — final Graph API harvest surface. Email + calendar live in
 * OutlookConnector, personal files in OneDriveConnector, Teams chat in
 * MSTeamsConnector. OneNote is the missing piece: it's where Microsoft
 * 365 knowledge workers keep their notes, meeting agendas, and shared
 * documentation — first-class harvest material.
 *
 * Auth: Bearer (Microsoft Graph token, same as Outlook/OneDrive/Teams).
 *       Scopes required: Notes.Read or Notes.Read.All.
 */

import { BaseConnector, type ConnectorAction, type ConnectorResult } from '../connector-sdk.js';
import type { VaultStore } from '@waggle/core';
import type { ConnectorHealth } from '@waggle/shared';

const API_BASE = 'https://graph.microsoft.com/v1.0';

export class OneNoteConnector extends BaseConnector {
  readonly id = 'onenote';
  readonly name = 'Microsoft OneNote';
  readonly description =
    'Read OneNote notebooks, sections, and pages. Harvest meeting notes, knowledge bases, and shared documentation from Microsoft 365.';
  readonly service = 'onenote.com';
  readonly authType = 'bearer' as const;
  readonly substrate = 'waggle' as const;
  readonly logoUrl =
    'https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/microsoftonenote.svg';
  readonly category = 'productivity' as const;
  readonly setupGuide =
    'Register an app in Azure AD with Notes.Read (or Notes.Read.All for shared notebooks) permissions and use OAuth2 flow.';

  readonly actions: ConnectorAction[] = [
    {
      name: 'list_notebooks',
      description: 'List all notebooks the user has access to',
      inputSchema: {
        properties: {
          $top: { type: 'number', description: 'Max notebooks to return (default 25)' },
          $select: {
            type: 'string',
            description: 'Fields to select (e.g., "id,displayName,createdDateTime")',
          },
          $orderby: {
            type: 'string',
            description: 'Order by field (default "lastModifiedDateTime desc")',
          },
        },
      },
      riskLevel: 'low',
    },
    {
      name: 'list_sections',
      description: 'List sections in a notebook',
      inputSchema: {
        properties: {
          notebook_id: { type: 'string', description: 'Notebook ID (from list_notebooks)' },
          $top: { type: 'number', description: 'Max sections to return (default 25)' },
        },
        required: ['notebook_id'],
      },
      riskLevel: 'low',
    },
    {
      name: 'list_pages',
      description: 'List pages in a section, or across the whole user',
      inputSchema: {
        properties: {
          section_id: {
            type: 'string',
            description: 'Section ID (optional — omit to list all pages user-wide)',
          },
          $top: { type: 'number', description: 'Max pages to return (default 25)' },
          $select: {
            type: 'string',
            description: 'Fields to select (e.g., "id,title,createdDateTime,lastModifiedDateTime")',
          },
          $orderby: {
            type: 'string',
            description: 'Order by field (default "lastModifiedDateTime desc")',
          },
          $filter: {
            type: 'string',
            description:
              'OData filter (e.g., "lastModifiedDateTime ge 2026-01-01T00:00:00Z")',
          },
        },
      },
      riskLevel: 'low',
    },
    {
      name: 'get_page',
      description: 'Get a page’s HTML content (for harvest ingestion)',
      inputSchema: {
        properties: {
          page_id: { type: 'string', description: 'Page ID (from list_pages)' },
          includeIDs: {
            type: 'boolean',
            description:
              'Include data-id attributes in the HTML for element-level edits (default false)',
          },
        },
        required: ['page_id'],
      },
      riskLevel: 'low',
    },
    {
      name: 'search_pages',
      description: 'Search pages by keyword across the user’s OneNote',
      inputSchema: {
        properties: {
          query: {
            type: 'string',
            description: 'Free-text query (matches title + body)',
          },
          $top: { type: 'number', description: 'Max results (default 25)' },
        },
        required: ['query'],
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
        // Probing /me/onenote/notebooks?$top=1 is the cheapest endpoint
        // that exercises the OneNote scope specifically — /me alone
        // doesn't tell us the token has Notes.Read.
        const res = await fetch(`${API_BASE}/me/onenote/notebooks?$top=1`, {
          headers: this.headers(),
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) {
          health.status = 'error';
          health.error = `Graph API returned ${res.status}`;
        }
      } catch (err: unknown) {
        health.status = 'error';
        health.error = err instanceof Error ? err.message : String(err);
      }
    }

    return health;
  }

  async execute(action: string, params: Record<string, unknown>): Promise<ConnectorResult> {
    if (!this.token) {
      return {
        success: false,
        error: 'Not connected — add Microsoft Graph token (with Notes.Read scope) in vault',
      };
    }

    switch (action) {
      case 'list_notebooks':
        return this.apiGet('/me/onenote/notebooks', params);
      case 'list_sections':
        return this.listSections(params);
      case 'list_pages':
        return this.listPages(params);
      case 'get_page':
        return this.getPage(params);
      case 'search_pages':
        return this.searchPages(params);
      default:
        return { success: false, error: `Unknown action: ${action}` };
    }
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Build an OData query string from the action params. `stripKeys` are
   * path-binding params (e.g. notebook_id) that should NOT propagate to
   * the query string — they're already consumed by the URL builder.
   */
  private buildQuery(
    params: Record<string, unknown>,
    stripKeys: string[] = [],
  ): string {
    const query = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (stripKeys.includes(k)) continue;
      if (v === undefined || v === null) continue;
      query.set(k, String(v));
    }
    const qs = query.toString();
    return qs ? `?${qs}` : '';
  }

  private async apiGet(
    path: string,
    params: Record<string, unknown>,
    stripKeys: string[] = [],
  ): Promise<ConnectorResult> {
    try {
      const url = `${API_BASE}${path}${this.buildQuery(params, stripKeys)}`;
      const res = await fetch(url, {
        headers: this.headers(),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return { success: false, error: await this.safeErrorText(res, 'Graph API') };
      return { success: true, data: await res.json() };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async listSections(params: Record<string, unknown>): Promise<ConnectorResult> {
    const id = String(params.notebook_id ?? '');
    if (!id) return { success: false, error: 'notebook_id is required' };
    return this.apiGet(`/me/onenote/notebooks/${encodeURIComponent(id)}/sections`, params, [
      'notebook_id',
    ]);
  }

  private async listPages(params: Record<string, unknown>): Promise<ConnectorResult> {
    const section = params.section_id;
    if (typeof section === 'string' && section.length > 0) {
      return this.apiGet(
        `/me/onenote/sections/${encodeURIComponent(section)}/pages`,
        params,
        ['section_id'],
      );
    }
    // User-wide page listing — useful for "most recently modified
    // across all notebooks" harvest queries.
    return this.apiGet('/me/onenote/pages', params);
  }

  private async getPage(params: Record<string, unknown>): Promise<ConnectorResult> {
    const id = String(params.page_id ?? '');
    if (!id) return { success: false, error: 'page_id is required' };
    try {
      const includeIDs = params.includeIDs === true ? '?includeIDs=true' : '';
      const url = `${API_BASE}/me/onenote/pages/${encodeURIComponent(id)}/content${includeIDs}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${this.token}` },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return { success: false, error: await this.safeErrorText(res, 'Graph API') };
      // Page content is HTML, not JSON — return as text for the harvest
      // pipeline to parse/render.
      const html = await res.text();
      return { success: true, data: { html, contentType: res.headers.get('content-type') } };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async searchPages(params: Record<string, unknown>): Promise<ConnectorResult> {
    // OneNote's search is via $search on /me/onenote/pages — same shape
    // as Outlook's search_emails (quoted to allow phrase search).
    const query = String(params.query ?? '');
    if (!query) return { success: false, error: 'query is required' };
    try {
      const qs = new URLSearchParams();
      qs.set('$search', `"${query}"`);
      if (params.$top !== undefined) qs.set('$top', String(params.$top));
      const url = `${API_BASE}/me/onenote/pages?${qs.toString()}`;
      const res = await fetch(url, {
        headers: this.headers(),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return { success: false, error: await this.safeErrorText(res, 'Graph API') };
      return { success: true, data: await res.json() };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}
