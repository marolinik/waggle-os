/**
 * Gmail Connector — read, search, and send emails via Gmail API.
 * Auth: Bearer (OAuth2 access token in vault)
 */

import { BaseConnector, type ConnectorAction, type ConnectorResult } from '../connector-sdk.js';
import type { VaultStore } from '@waggle/core';
import type { ConnectorHealth } from '@waggle/shared';

const API_BASE = 'https://gmail.googleapis.com/gmail/v1';

export class GmailConnector extends BaseConnector {
  readonly id = 'gmail';
  readonly name = 'Gmail';
  readonly description = 'Read, search, and send emails via Gmail';
  readonly service = 'gmail.com';
  readonly authType = 'bearer' as const;
  readonly substrate = 'waggle' as const;

  readonly actions: ConnectorAction[] = [
    {
      name: 'list_messages',
      description: 'List recent email messages',
      inputSchema: {
        properties: {
          maxResults: { type: 'number', description: 'Max messages to return (default 20)' },
          labelIds: { type: 'array', items: { type: 'string' }, description: 'Filter by label IDs (e.g. INBOX, UNREAD)' },
          pageToken: { type: 'string', description: 'Token for next page of results' },
        },
      },
      riskLevel: 'low',
    },
    {
      name: 'get_message',
      description: 'Get a single email message with full content',
      inputSchema: {
        properties: {
          id: { type: 'string', description: 'Message ID' },
        },
        required: ['id'],
      },
      riskLevel: 'low',
    },
    {
      name: 'send_message',
      description: 'Send an email message',
      inputSchema: {
        properties: {
          to: { type: 'string', description: 'Recipient email address' },
          subject: { type: 'string', description: 'Email subject' },
          body: { type: 'string', description: 'Email body (plain text)' },
          cc: { type: 'string', description: 'CC email address' },
          bcc: { type: 'string', description: 'BCC email address' },
        },
        required: ['to', 'subject', 'body'],
      },
      riskLevel: 'medium',
    },
    {
      name: 'search_messages',
      description: 'Search emails using Gmail search syntax',
      inputSchema: {
        properties: {
          query: { type: 'string', description: 'Gmail search query (e.g. "from:user@example.com subject:report")' },
          maxResults: { type: 'number', description: 'Max results (default 20)' },
          pageToken: { type: 'string', description: 'Token for next page' },
        },
        required: ['query'],
      },
      riskLevel: 'low',
    },
    {
      name: 'list_labels',
      description: 'List all Gmail labels',
      inputSchema: {
        properties: {},
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
        const res = await fetch(`${API_BASE}/users/me/profile`, {
          headers: this.headers(),
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) {
          health.status = 'error';
          health.error = `Gmail API returned ${res.status}`;
        }
      } catch (err: unknown) {
        health.status = 'error';
        health.error = err instanceof Error ? err.message : String(err);
      }
    }

    return health;
  }

  async execute(action: string, params: Record<string, unknown>): Promise<ConnectorResult> {
    if (!this.token) return { success: false, error: 'Not connected — add Gmail token in Settings' };

    switch (action) {
      case 'list_messages': return this.listMessages(params);
      case 'get_message': return this.getMessage(params);
      case 'send_message': return this.sendMessage(params);
      case 'search_messages': return this.searchMessages(params);
      case 'list_labels': return this.listLabels();
      default: return { success: false, error: `Unknown action: ${action}` };
    }
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
      'Content-Type': 'application/json',
    };
  }

  private async listMessages(params: Record<string, unknown>): Promise<ConnectorResult> {
    try {
      const maxResults = (params.maxResults as number) || 20;
      const query = new URLSearchParams({ maxResults: String(maxResults) });
      if (params.labelIds) {
        for (const label of params.labelIds as string[]) {
          query.append('labelIds', label);
        }
      }
      if (params.pageToken) query.set('pageToken', String(params.pageToken));

      const res = await fetch(`${API_BASE}/users/me/messages?${query}`, {
        headers: this.headers(),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return { success: false, error: await this.safeErrorText(res, 'Gmail API') };
      return { success: true, data: await res.json() };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async getMessage(params: Record<string, unknown>): Promise<ConnectorResult> {
    try {
      const id = params.id as string;
      const res = await fetch(`${API_BASE}/users/me/messages/${encodeURIComponent(id)}?format=full`, {
        headers: this.headers(),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return { success: false, error: await this.safeErrorText(res, 'Gmail API') };
      return { success: true, data: await res.json() };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async sendMessage(params: Record<string, unknown>): Promise<ConnectorResult> {
    try {
      const to = params.to as string;
      const subject = params.subject as string;
      const body = params.body as string;
      const cc = params.cc as string | undefined;
      const bcc = params.bcc as string | undefined;

      // Build RFC 2822 formatted email
      let rawEmail = `To: ${to}\r\n`;
      if (cc) rawEmail += `Cc: ${cc}\r\n`;
      if (bcc) rawEmail += `Bcc: ${bcc}\r\n`;
      rawEmail += `Subject: ${subject}\r\n`;
      rawEmail += `Content-Type: text/plain; charset="UTF-8"\r\n\r\n`;
      rawEmail += body;

      // Base64url encode the email
      const encoded = Buffer.from(rawEmail).toString('base64url');

      const res = await fetch(`${API_BASE}/users/me/messages/send`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({ raw: encoded }),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return { success: false, error: await this.safeErrorText(res, 'Gmail API') };
      return { success: true, data: await res.json() };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async searchMessages(params: Record<string, unknown>): Promise<ConnectorResult> {
    try {
      const q = params.query as string;
      const maxResults = (params.maxResults as number) || 20;
      const query = new URLSearchParams({ q, maxResults: String(maxResults) });
      if (params.pageToken) query.set('pageToken', String(params.pageToken));

      const res = await fetch(`${API_BASE}/users/me/messages?${query}`, {
        headers: this.headers(),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return { success: false, error: await this.safeErrorText(res, 'Gmail API') };
      return { success: true, data: await res.json() };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async listLabels(): Promise<ConnectorResult> {
    try {
      const res = await fetch(`${API_BASE}/users/me/labels`, {
        headers: this.headers(),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return { success: false, error: await this.safeErrorText(res, 'Gmail API') };
      return { success: true, data: await res.json() };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}
