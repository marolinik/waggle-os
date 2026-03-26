/**
 * Google Drive Connector — list, search, download, and upload files.
 * Auth: Bearer (OAuth2 access token in vault)
 */

import { BaseConnector, type ConnectorAction, type ConnectorResult } from '../connector-sdk.js';
import type { VaultStore } from '@waggle/core';
import type { ConnectorHealth } from '@waggle/shared';

const API_BASE = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';

export class GoogleDriveConnector extends BaseConnector {
  readonly id = 'gdrive';
  readonly name = 'Google Drive';
  readonly description = 'List, search, download, and upload files in Google Drive';
  readonly service = 'drive.google.com';
  readonly authType = 'bearer' as const;
  readonly substrate = 'waggle' as const;

  readonly actions: ConnectorAction[] = [
    {
      name: 'list_files',
      description: 'List files in Google Drive',
      inputSchema: {
        properties: {
          pageSize: { type: 'number', description: 'Max files to return (default 20)' },
          orderBy: { type: 'string', description: 'Sort order (e.g. "modifiedTime desc")' },
          pageToken: { type: 'string', description: 'Token for next page' },
          fields: { type: 'string', description: 'Fields to include (default: id,name,mimeType,modifiedTime,size)' },
        },
      },
      riskLevel: 'low',
    },
    {
      name: 'search_files',
      description: 'Search for files using Drive query syntax',
      inputSchema: {
        properties: {
          query: { type: 'string', description: 'Drive search query (e.g. "name contains \'report\'" or "mimeType=\'application/pdf\'")' },
          pageSize: { type: 'number', description: 'Max results (default 20)' },
          pageToken: { type: 'string', description: 'Token for next page' },
        },
        required: ['query'],
      },
      riskLevel: 'low',
    },
    {
      name: 'get_file_metadata',
      description: 'Get metadata for a specific file',
      inputSchema: {
        properties: {
          fileId: { type: 'string', description: 'The file ID' },
          fields: { type: 'string', description: 'Fields to include (default: id,name,mimeType,modifiedTime,size,parents,webViewLink)' },
        },
        required: ['fileId'],
      },
      riskLevel: 'low',
    },
    {
      name: 'download_file',
      description: 'Download a file\'s content (returns text for text-based files)',
      inputSchema: {
        properties: {
          fileId: { type: 'string', description: 'The file ID' },
        },
        required: ['fileId'],
      },
      riskLevel: 'low',
    },
    {
      name: 'upload_file',
      description: 'Upload a file to Google Drive',
      inputSchema: {
        properties: {
          name: { type: 'string', description: 'File name' },
          content: { type: 'string', description: 'File content (text)' },
          mimeType: { type: 'string', description: 'MIME type (default: text/plain)' },
          parentId: { type: 'string', description: 'Parent folder ID (optional)' },
        },
        required: ['name', 'content'],
      },
      riskLevel: 'medium',
    },
    {
      name: 'create_folder',
      description: 'Create a new folder in Google Drive',
      inputSchema: {
        properties: {
          name: { type: 'string', description: 'Folder name' },
          parentId: { type: 'string', description: 'Parent folder ID (optional)' },
        },
        required: ['name'],
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
        const res = await fetch(`${API_BASE}/about?fields=user`, {
          headers: this.headers(),
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) {
          health.status = 'error';
          health.error = `Google Drive API returned ${res.status}`;
        }
      } catch (err: unknown) {
        health.status = 'error';
        health.error = err instanceof Error ? err.message : String(err);
      }
    }

    return health;
  }

  async execute(action: string, params: Record<string, unknown>): Promise<ConnectorResult> {
    if (!this.token) return { success: false, error: 'Not connected — add Google Drive token in Settings' };

    switch (action) {
      case 'list_files': return this.listFiles(params);
      case 'search_files': return this.searchFiles(params);
      case 'get_file_metadata': return this.getFileMetadata(params);
      case 'download_file': return this.downloadFile(params);
      case 'upload_file': return this.uploadFile(params);
      case 'create_folder': return this.createFolder(params);
      default: return { success: false, error: `Unknown action: ${action}` };
    }
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
      'Content-Type': 'application/json',
    };
  }

  private async listFiles(params: Record<string, unknown>): Promise<ConnectorResult> {
    try {
      const pageSize = (params.pageSize as number) || 20;
      const fields = (params.fields as string) || 'files(id,name,mimeType,modifiedTime,size),nextPageToken';
      const query = new URLSearchParams({
        pageSize: String(pageSize),
        fields,
      });
      if (params.orderBy) query.set('orderBy', String(params.orderBy));
      if (params.pageToken) query.set('pageToken', String(params.pageToken));

      const res = await fetch(`${API_BASE}/files?${query}`, {
        headers: this.headers(),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return { success: false, error: await this.safeErrorText(res, 'Google Drive API') };
      return { success: true, data: await res.json() };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async searchFiles(params: Record<string, unknown>): Promise<ConnectorResult> {
    try {
      const q = params.query as string;
      const pageSize = (params.pageSize as number) || 20;
      const query = new URLSearchParams({
        q,
        pageSize: String(pageSize),
        fields: 'files(id,name,mimeType,modifiedTime,size,parents,webViewLink),nextPageToken',
      });
      if (params.pageToken) query.set('pageToken', String(params.pageToken));

      const res = await fetch(`${API_BASE}/files?${query}`, {
        headers: this.headers(),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return { success: false, error: await this.safeErrorText(res, 'Google Drive API') };
      return { success: true, data: await res.json() };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async getFileMetadata(params: Record<string, unknown>): Promise<ConnectorResult> {
    try {
      const fileId = params.fileId as string;
      const fields = (params.fields as string) || 'id,name,mimeType,modifiedTime,size,parents,webViewLink';
      const query = new URLSearchParams({ fields });

      const res = await fetch(`${API_BASE}/files/${encodeURIComponent(fileId)}?${query}`, {
        headers: this.headers(),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return { success: false, error: await this.safeErrorText(res, 'Google Drive API') };
      return { success: true, data: await res.json() };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async downloadFile(params: Record<string, unknown>): Promise<ConnectorResult> {
    try {
      const fileId = params.fileId as string;
      const res = await fetch(`${API_BASE}/files/${encodeURIComponent(fileId)}?alt=media`, {
        headers: { Authorization: `Bearer ${this.token}` },
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) return { success: false, error: await this.safeErrorText(res, 'Google Drive API') };

      // Return text content (binary files would need different handling)
      const text = await res.text();
      return { success: true, data: { content: text, fileId } };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async uploadFile(params: Record<string, unknown>): Promise<ConnectorResult> {
    try {
      const name = params.name as string;
      const content = params.content as string;
      const mimeType = (params.mimeType as string) || 'text/plain';
      const parentId = params.parentId as string | undefined;

      // Multipart upload: metadata + content
      const metadata: Record<string, unknown> = { name, mimeType };
      if (parentId) metadata.parents = [parentId];

      const boundary = 'waggle_upload_boundary';
      const body =
        `--${boundary}\r\n` +
        `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
        `${JSON.stringify(metadata)}\r\n` +
        `--${boundary}\r\n` +
        `Content-Type: ${mimeType}\r\n\r\n` +
        `${content}\r\n` +
        `--${boundary}--`;

      const res = await fetch(`${UPLOAD_API}/files?uploadType=multipart`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body,
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) return { success: false, error: await this.safeErrorText(res, 'Google Drive API') };
      return { success: true, data: await res.json() };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async createFolder(params: Record<string, unknown>): Promise<ConnectorResult> {
    try {
      const name = params.name as string;
      const parentId = params.parentId as string | undefined;

      const metadata: Record<string, unknown> = {
        name,
        mimeType: 'application/vnd.google-apps.folder',
      };
      if (parentId) metadata.parents = [parentId];

      const res = await fetch(`${API_BASE}/files`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(metadata),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return { success: false, error: await this.safeErrorText(res, 'Google Drive API') };
      return { success: true, data: await res.json() };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}
