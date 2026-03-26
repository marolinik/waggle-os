/**
 * Dropbox Connector — access files, folders, and search.
 * Auth: Bearer (OAuth2 access token)
 * Note: Dropbox uses POST for all endpoints. Content API for file transfer, RPC API for metadata.
 */

import { BaseConnector, type ConnectorAction, type ConnectorResult } from '../connector-sdk.js';
import type { VaultStore } from '@waggle/core';
import type { ConnectorHealth } from '@waggle/shared';

const RPC_BASE = 'https://api.dropboxapi.com/2';
const CONTENT_BASE = 'https://content.dropboxapi.com/2';

export class DropboxConnector extends BaseConnector {
  readonly id = 'dropbox';
  readonly name = 'Dropbox';
  readonly description = 'Access files, folders, and search in Dropbox';
  readonly service = 'dropbox.com';
  readonly authType = 'bearer' as const;
  readonly substrate = 'waggle' as const;

  readonly actions: ConnectorAction[] = [
    {
      name: 'list_folder',
      description: 'List files and folders in a directory',
      inputSchema: {
        properties: {
          path: { type: 'string', description: 'Folder path (e.g., "" for root, "/Documents")' },
          recursive: { type: 'boolean', description: 'Include subfolders (default false)' },
          limit: { type: 'number', description: 'Max results (default 100)' },
        },
        required: ['path'],
      },
      riskLevel: 'low',
    },
    {
      name: 'get_file_metadata',
      description: 'Get metadata for a file or folder',
      inputSchema: {
        properties: {
          path: { type: 'string', description: 'File or folder path' },
        },
        required: ['path'],
      },
      riskLevel: 'low',
    },
    {
      name: 'search_files',
      description: 'Search for files and folders by name or content',
      inputSchema: {
        properties: {
          query: { type: 'string', description: 'Search query' },
          path: { type: 'string', description: 'Limit search to this folder path (optional)' },
          max_results: { type: 'number', description: 'Max results (default 100)' },
        },
        required: ['query'],
      },
      riskLevel: 'low',
    },
    {
      name: 'download_file',
      description: 'Download file content (text files only, max 10MB)',
      inputSchema: {
        properties: {
          path: { type: 'string', description: 'File path to download' },
        },
        required: ['path'],
      },
      riskLevel: 'low',
    },
    {
      name: 'upload_file',
      description: 'Upload a text file to Dropbox',
      inputSchema: {
        properties: {
          path: { type: 'string', description: 'Destination path (e.g., "/Documents/notes.txt")' },
          content: { type: 'string', description: 'File content to upload (text only)' },
          mode: { type: 'string', enum: ['add', 'overwrite'], description: 'Write mode (default "add" — fails if exists)' },
        },
        required: ['path', 'content'],
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
        const res = await fetch(`${RPC_BASE}/users/get_current_account`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.token}`,
            'Content-Type': 'application/json',
          },
          body: 'null',
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) {
          health.status = 'error';
          health.error = `Dropbox API returned ${res.status}`;
        }
      } catch (err: unknown) {
        health.status = 'error';
        health.error = err instanceof Error ? err.message : String(err);
      }
    }

    return health;
  }

  async execute(action: string, params: Record<string, unknown>): Promise<ConnectorResult> {
    if (!this.token) return { success: false, error: 'Not connected — add Dropbox access token in vault' };

    switch (action) {
      case 'list_folder': return this.listFolder(params);
      case 'get_file_metadata': return this.getMetadata(params);
      case 'search_files': return this.searchFiles(params);
      case 'download_file': return this.downloadFile(params);
      case 'upload_file': return this.uploadFile(params);
      default: return { success: false, error: `Unknown action: ${action}` };
    }
  }

  private rpcHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
      'Content-Type': 'application/json',
    };
  }

  private async listFolder(params: Record<string, unknown>): Promise<ConnectorResult> {
    try {
      const res = await fetch(`${RPC_BASE}/files/list_folder`, {
        method: 'POST',
        headers: this.rpcHeaders(),
        body: JSON.stringify({
          path: params.path === '' ? '' : params.path,
          recursive: params.recursive ?? false,
          limit: params.limit ?? 100,
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return { success: false, error: await this.safeErrorText(res, 'Dropbox API') };
      return { success: true, data: await res.json() };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async getMetadata(params: Record<string, unknown>): Promise<ConnectorResult> {
    try {
      const res = await fetch(`${RPC_BASE}/files/get_metadata`, {
        method: 'POST',
        headers: this.rpcHeaders(),
        body: JSON.stringify({ path: params.path }),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return { success: false, error: await this.safeErrorText(res, 'Dropbox API') };
      return { success: true, data: await res.json() };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async searchFiles(params: Record<string, unknown>): Promise<ConnectorResult> {
    try {
      const body: Record<string, unknown> = {
        query: params.query,
        options: {
          max_results: params.max_results ?? 100,
        },
      };
      if (params.path) {
        (body.options as Record<string, unknown>).path_scope = params.path;
      }
      const res = await fetch(`${RPC_BASE}/files/search_v2`, {
        method: 'POST',
        headers: this.rpcHeaders(),
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return { success: false, error: await this.safeErrorText(res, 'Dropbox API') };
      return { success: true, data: await res.json() };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async downloadFile(params: Record<string, unknown>): Promise<ConnectorResult> {
    try {
      const res = await fetch(`${CONTENT_BASE}/files/download`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Dropbox-API-Arg': JSON.stringify({ path: params.path }),
        },
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) return { success: false, error: await this.safeErrorText(res, 'Dropbox API') };

      // Read as text (safe for text files; binary files should use a different approach)
      const content = await res.text();
      if (content.length > 10 * 1024 * 1024) {
        return { success: false, error: 'File too large (>10MB) — use Dropbox directly for large files' };
      }
      const metadata = res.headers.get('Dropbox-API-Result');
      return {
        success: true,
        data: {
          content,
          metadata: metadata ? JSON.parse(metadata) : null,
        },
      };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async uploadFile(params: Record<string, unknown>): Promise<ConnectorResult> {
    try {
      const mode = params.mode === 'overwrite' ? { '.tag': 'overwrite' } : { '.tag': 'add' };
      const res = await fetch(`${CONTENT_BASE}/files/upload`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/octet-stream',
          'Dropbox-API-Arg': JSON.stringify({
            path: params.path,
            mode,
            autorename: false,
            mute: false,
          }),
        },
        body: String(params.content),
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) return { success: false, error: await this.safeErrorText(res, 'Dropbox API') };
      return { success: true, data: await res.json() };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}
