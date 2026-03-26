/**
 * Google Docs Connector — create, read, and update Google Docs.
 * Auth: Bearer (OAuth2 access token in vault)
 */

import { BaseConnector, type ConnectorAction, type ConnectorResult } from '../connector-sdk.js';
import type { VaultStore } from '@waggle/core';
import type { ConnectorHealth } from '@waggle/shared';

const DOCS_API = 'https://docs.googleapis.com/v1';
const DRIVE_API = 'https://www.googleapis.com/drive/v3';

export class GoogleDocsConnector extends BaseConnector {
  readonly id = 'gdocs';
  readonly name = 'Google Docs';
  readonly description = 'Create, read, and update Google Docs documents';
  readonly service = 'docs.google.com';
  readonly authType = 'bearer' as const;
  readonly substrate = 'waggle' as const;

  readonly actions: ConnectorAction[] = [
    {
      name: 'get_document',
      description: 'Get the full content of a Google Doc',
      inputSchema: {
        properties: {
          documentId: { type: 'string', description: 'The Google Doc ID' },
        },
        required: ['documentId'],
      },
      riskLevel: 'low',
    },
    {
      name: 'create_document',
      description: 'Create a new Google Doc',
      inputSchema: {
        properties: {
          title: { type: 'string', description: 'Document title' },
        },
        required: ['title'],
      },
      riskLevel: 'medium',
    },
    {
      name: 'update_document',
      description: 'Update a Google Doc using batchUpdate requests',
      inputSchema: {
        properties: {
          documentId: { type: 'string', description: 'The Google Doc ID' },
          requests: { type: 'array', description: 'Array of batchUpdate request objects (insertText, deleteContentRange, etc.)' },
        },
        required: ['documentId', 'requests'],
      },
      riskLevel: 'medium',
    },
    {
      name: 'list_comments',
      description: 'List comments on a Google Doc (via Drive API)',
      inputSchema: {
        properties: {
          documentId: { type: 'string', description: 'The Google Doc ID' },
          pageSize: { type: 'number', description: 'Max comments to return (default 20)' },
          pageToken: { type: 'string', description: 'Token for next page' },
        },
        required: ['documentId'],
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
        // Use Drive API about endpoint as a lightweight health check
        const res = await fetch(`${DRIVE_API}/about?fields=user`, {
          headers: this.headers(),
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) {
          health.status = 'error';
          health.error = `Google Docs API returned ${res.status}`;
        }
      } catch (err: unknown) {
        health.status = 'error';
        health.error = err instanceof Error ? err.message : String(err);
      }
    }

    return health;
  }

  async execute(action: string, params: Record<string, unknown>): Promise<ConnectorResult> {
    if (!this.token) return { success: false, error: 'Not connected — add Google Docs token in Settings' };

    switch (action) {
      case 'get_document': return this.getDocument(params);
      case 'create_document': return this.createDocument(params);
      case 'update_document': return this.updateDocument(params);
      case 'list_comments': return this.listComments(params);
      default: return { success: false, error: `Unknown action: ${action}` };
    }
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
      'Content-Type': 'application/json',
    };
  }

  private async getDocument(params: Record<string, unknown>): Promise<ConnectorResult> {
    try {
      const documentId = params.documentId as string;
      const res = await fetch(`${DOCS_API}/documents/${encodeURIComponent(documentId)}`, {
        headers: this.headers(),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return { success: false, error: await this.safeErrorText(res, 'Google Docs API') };
      return { success: true, data: await res.json() };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async createDocument(params: Record<string, unknown>): Promise<ConnectorResult> {
    try {
      const title = params.title as string;
      const res = await fetch(`${DOCS_API}/documents`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({ title }),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return { success: false, error: await this.safeErrorText(res, 'Google Docs API') };
      return { success: true, data: await res.json() };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async updateDocument(params: Record<string, unknown>): Promise<ConnectorResult> {
    try {
      const documentId = params.documentId as string;
      const requests = params.requests as unknown[];
      const res = await fetch(`${DOCS_API}/documents/${encodeURIComponent(documentId)}:batchUpdate`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({ requests }),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return { success: false, error: await this.safeErrorText(res, 'Google Docs API') };
      return { success: true, data: await res.json() };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async listComments(params: Record<string, unknown>): Promise<ConnectorResult> {
    try {
      const documentId = params.documentId as string;
      const pageSize = (params.pageSize as number) || 20;
      const query = new URLSearchParams({
        pageSize: String(pageSize),
        fields: 'comments(id,content,author,createdTime,resolved),nextPageToken',
      });
      if (params.pageToken) query.set('pageToken', String(params.pageToken));

      const res = await fetch(`${DRIVE_API}/files/${encodeURIComponent(documentId)}/comments?${query}`, {
        headers: this.headers(),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return { success: false, error: await this.safeErrorText(res, 'Google Drive API') };
      return { success: true, data: await res.json() };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}
