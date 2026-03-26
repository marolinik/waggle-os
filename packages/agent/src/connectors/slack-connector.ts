/**
 * Slack Connector — list channels, read messages, search, and send messages.
 * Auth: Bearer (Bot User OAuth Token)
 */

import { BaseConnector, type ConnectorAction, type ConnectorResult } from '../connector-sdk.js';
import type { VaultStore } from '@waggle/core';
import type { ConnectorHealth } from '@waggle/shared';

const API_BASE = 'https://slack.com/api';

export class SlackConnector extends BaseConnector {
  readonly id = 'slack';
  readonly name = 'Slack';
  readonly description = 'Send messages, search conversations, and manage channels';
  readonly service = 'slack.com';
  readonly authType = 'bearer' as const;
  readonly substrate = 'waggle' as const;

  readonly actions: ConnectorAction[] = [
    {
      name: 'list_channels',
      description: 'List Slack channels the bot has access to',
      inputSchema: {
        properties: {
          limit: { type: 'number', description: 'Max channels to return (default 100)' },
          types: { type: 'string', description: 'Channel types: public_channel,private_channel' },
        },
      },
      riskLevel: 'low',
    },
    {
      name: 'read_channel',
      description: 'Read recent messages from a channel',
      inputSchema: {
        properties: {
          channel: { type: 'string', description: 'Channel ID' },
          limit: { type: 'number', description: 'Max messages to return (default 20)' },
        },
        required: ['channel'],
      },
      riskLevel: 'low',
    },
    {
      name: 'search_messages',
      description: 'Search Slack messages across all channels',
      inputSchema: {
        properties: {
          query: { type: 'string', description: 'Search query' },
          count: { type: 'number', description: 'Number of results (default 20)' },
        },
        required: ['query'],
      },
      riskLevel: 'low',
    },
    {
      name: 'send_message',
      description: 'Send a message to a Slack channel',
      inputSchema: {
        properties: {
          channel: { type: 'string', description: 'Channel ID or name' },
          text: { type: 'string', description: 'Message text (markdown supported)' },
        },
        required: ['channel', 'text'],
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
        const res = await fetch(`${API_BASE}/auth.test`, {
          method: 'POST',
          headers: this.headers(),
          signal: AbortSignal.timeout(5000),
        });
        const data = await res.json() as { ok: boolean; error?: string };
        if (!data.ok) {
          health.status = 'error';
          health.error = data.error ?? 'Auth test failed';
        }
      } catch (err: unknown) {
        health.status = 'error';
        health.error = err instanceof Error ? err.message : String(err);
      }
    }

    return health;
  }

  async execute(action: string, params: Record<string, unknown>): Promise<ConnectorResult> {
    if (!this.token) return { success: false, error: 'Not connected — add Slack bot token in vault' };

    switch (action) {
      case 'list_channels': return this.slackGet('conversations.list', params);
      case 'read_channel': return this.slackGet('conversations.history', params);
      case 'search_messages': return this.slackGet('search.messages', params);
      case 'send_message': return this.slackPost('chat.postMessage', params);
      default: return { success: false, error: `Unknown action: ${action}` };
    }
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
      'Content-Type': 'application/json; charset=utf-8',
    };
  }

  private async slackGet(method: string, params: Record<string, unknown>): Promise<ConnectorResult> {
    try {
      const query = new URLSearchParams();
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined) query.set(k, String(v));
      }
      const qs = query.toString();
      const res = await fetch(`${API_BASE}/${method}${qs ? `?${qs}` : ''}`, {
        headers: this.headers(),
        signal: AbortSignal.timeout(10000),
      });
      const data = await res.json() as { ok: boolean; error?: string };
      if (!data.ok) return { success: false, error: data.error ?? `Slack API error: ${method}` };
      return { success: true, data };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async slackPost(method: string, params: Record<string, unknown>): Promise<ConnectorResult> {
    try {
      const res = await fetch(`${API_BASE}/${method}`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(params),
        signal: AbortSignal.timeout(10000),
      });
      const data = await res.json() as { ok: boolean; error?: string };
      if (!data.ok) return { success: false, error: data.error ?? `Slack API error: ${method}` };
      return { success: true, data };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}
