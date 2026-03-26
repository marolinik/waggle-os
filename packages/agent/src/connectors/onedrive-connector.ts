/**
 * OneDrive Connector — access files, search, and upload via Microsoft Graph API.
 * Auth: Bearer (Microsoft Graph API access token)
 */

import { BaseConnector, type ConnectorAction, type ConnectorResult } from '../connector-sdk.js';
import type { VaultStore } from '@waggle/core';
import type { ConnectorHealth } from '@waggle/shared';

const API_BASE = 'https://graph.microsoft.com/v1.0';

export class OneDriveConnector extends BaseConnector {
  readonly id = 'onedrive';
  readonly name = 'OneDrive';
  readonly description = 'Access files, search, and upload via Microsoft Graph';
  readonly service = 'onedrive.live.com';
  readonly authType = 'bearer' as const;
  readonly substrate = 'waggle' as const;

  readonly actions: ConnectorAction[] = [
    {
      name: 'list_files',
      description: 'List files and folders in the root of OneDrive',
      inputSchema: {
        properties: {
          folder_path: { type: 'string', description: 'Folder path relative to root (e.g., "Documents/Work"). Omit for root.' },
          $top: { type: 'number', description: 'Max items to return (default 50)' },
          $orderby: { type: 'string', description: 'Order by field (e.g., "lastModifiedDateTime desc")' },
        },
      },
      riskLevel: 'low',
    },
    {
      name: 'get_file',
      description: 'Get file content by item ID (text files only, max 10MB)',
      inputSchema: {
        properties: {
          item_id: { type: 'string', description: 'OneDrive item ID' },
        },
        required: ['item_id'],
      },
      riskLevel: 'low',
    },
    {
      name: 'search_files',
      description: 'Search files and folders by name or content',
      inputSchema: {
        properties: {
          query: { type: 'string', description: 'Search query' },
          $top: { type: 'number', description: 'Max results to return (default 25)' },
        },
        required: ['query'],
      },
      riskLevel: 'low',
    },
    {
      name: 'upload_file',
      description: 'Upload a text file to OneDrive (max 4MB)',
      inputSchema: {
        properties: {
          path: { type: 'string', description: 'Destination path including filename (e.g., "Documents/notes.txt")' },
          content: { type: 'string', description: 'File content to upload (text only)' },
        },
        required: ['path', 'content'],
      },
      riskLevel: 'medium',
    },
    {
      name: 'list_recent',
      description: 'List recently accessed files',
      inputSchema: {
        properties: {
          $top: { type: 'number', description: 'Max items to return (default 25)' },
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
        const res = await fetch(`${API_BASE}/me/drive`, {
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
    if (!this.token) return { success: false, error: 'Not connected — add Microsoft Graph token in vault' };

    switch (action) {
      case 'list_files': return this.listFiles(params);
      case 'get_file': return this.getFile(params);
      case 'search_files': return this.searchFiles(params);
      case 'upload_file': return this.uploadFile(params);
      case 'list_recent': return this.apiGet('/me/drive/recent', params);
      default: return { success: false, error: `Unknown action: ${action}` };
    }
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
      'Content-Type': 'application/json',
    };
  }

  private async apiGet(path: string, params: Record<string, unknown>, stripKeys: string[] = []): Promise<ConnectorResult> {
    try {
      const query = new URLSearchParams();
      for (const [k, v] of Object.entries(params)) {
        if (!stripKeys.includes(k) && v !== undefined) query.set(k, String(v));
      }
      const qs = query.toString();
      const url = `${API_BASE}${path}${qs ? `?${qs}` : ''}`;
      const res = await fetch(url, { headers: this.headers(), signal: AbortSignal.timeout(10000) });
      if (!res.ok) return { success: false, error: await this.safeErrorText(res, 'Graph API') };
      return { success: true, data: await res.json() };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async listFiles(params: Record<string, unknown>): Promise<ConnectorResult> {
    const folderPath = params.folder_path as string | undefined;
    const path = folderPath
      ? `/me/drive/root:/${folderPath}:/children`
      : '/me/drive/root/children';
    return this.apiGet(path, params, ['folder_path']);
  }

  private async getFile(params: Record<string, unknown>): Promise<ConnectorResult> {
    try {
      const res = await fetch(`${API_BASE}/me/drive/items/${params.item_id}/content`, {
        headers: { Authorization: `Bearer ${this.token}` },
        redirect: 'follow',
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) return { success: false, error: await this.safeErrorText(res, 'Graph API') };

      const content = await res.text();
      if (content.length > 10 * 1024 * 1024) {
        return { success: false, error: 'File too large (>10MB) — use OneDrive directly for large files' };
      }
      return { success: true, data: { content } };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async searchFiles(params: Record<string, unknown>): Promise<ConnectorResult> {
    const query = String(params.query);
    const searchParams: Record<string, unknown> = {};
    if (params.$top !== undefined) searchParams.$top = params.$top;
    return this.apiGet(`/me/drive/root/search(q='${encodeURIComponent(query)}')`, searchParams);
  }

  private async uploadFile(params: Record<string, unknown>): Promise<ConnectorResult> {
    try {
      const filePath = String(params.path);
      const content = String(params.content);

      if (content.length > 4 * 1024 * 1024) {
        return { success: false, error: 'Content too large (>4MB) — use upload session for large files' };
      }

      const res = await fetch(`${API_BASE}/me/drive/root:/${filePath}:/content`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/octet-stream',
        },
        body: content,
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) return { success: false, error: await this.safeErrorText(res, 'Graph API') };
      return { success: true, data: await res.json() };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}
