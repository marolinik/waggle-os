/**
 * Microsoft Teams Connector — list teams, channels, messages, and chats via Microsoft Graph API.
 * Auth: Bearer (Microsoft Graph API access token)
 */

import { BaseConnector, type ConnectorAction, type ConnectorResult } from '../connector-sdk.js';
import type { VaultStore } from '@waggle/core';
import type { ConnectorHealth } from '@waggle/shared';

const API_BASE = 'https://graph.microsoft.com/v1.0';

export class MSTeamsConnector extends BaseConnector {
  readonly id = 'ms-teams';
  readonly name = 'Microsoft Teams';
  readonly description = 'List teams, channels, messages, and chats via Microsoft Graph';
  readonly service = 'teams.microsoft.com';
  readonly authType = 'bearer' as const;
  readonly substrate = 'waggle' as const;

  readonly actions: ConnectorAction[] = [
    {
      name: 'list_teams',
      description: 'List teams the user has joined',
      inputSchema: {
        properties: {
          $top: { type: 'number', description: 'Max teams to return (default 50)' },
        },
      },
      riskLevel: 'low',
    },
    {
      name: 'list_channels',
      description: 'List channels in a team',
      inputSchema: {
        properties: {
          team_id: { type: 'string', description: 'Team ID' },
        },
        required: ['team_id'],
      },
      riskLevel: 'low',
    },
    {
      name: 'get_messages',
      description: 'Get messages from a team channel',
      inputSchema: {
        properties: {
          team_id: { type: 'string', description: 'Team ID' },
          channel_id: { type: 'string', description: 'Channel ID' },
          $top: { type: 'number', description: 'Max messages to return (default 20)' },
        },
        required: ['team_id', 'channel_id'],
      },
      riskLevel: 'low',
    },
    {
      name: 'send_message',
      description: 'Send a message to a team channel',
      inputSchema: {
        properties: {
          team_id: { type: 'string', description: 'Team ID' },
          channel_id: { type: 'string', description: 'Channel ID' },
          content: { type: 'string', description: 'Message content (HTML supported)' },
        },
        required: ['team_id', 'channel_id', 'content'],
      },
      riskLevel: 'medium',
    },
    {
      name: 'list_chats',
      description: 'List 1:1 and group chats for the current user',
      inputSchema: {
        properties: {
          $top: { type: 'number', description: 'Max chats to return (default 50)' },
        },
      },
      riskLevel: 'low',
    },
    {
      name: 'send_chat_message',
      description: 'Send a message in a 1:1 or group chat',
      inputSchema: {
        properties: {
          chat_id: { type: 'string', description: 'Chat ID' },
          content: { type: 'string', description: 'Message content (HTML supported)' },
        },
        required: ['chat_id', 'content'],
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
        const res = await fetch(`${API_BASE}/me`, {
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
      case 'list_teams': return this.apiGet('/me/joinedTeams', params);
      case 'list_channels': return this.apiGet(`/teams/${params.team_id}/channels`, params, ['team_id']);
      case 'get_messages': return this.apiGet(`/teams/${params.team_id}/channels/${params.channel_id}/messages`, params, ['team_id', 'channel_id']);
      case 'send_message': return this.sendChannelMessage(params);
      case 'list_chats': return this.apiGet('/me/chats', params);
      case 'send_chat_message': return this.sendChatMessage(params);
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

  private async sendChannelMessage(params: Record<string, unknown>): Promise<ConnectorResult> {
    try {
      const res = await fetch(`${API_BASE}/teams/${params.team_id}/channels/${params.channel_id}/messages`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({
          body: { contentType: 'html', content: String(params.content) },
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return { success: false, error: await this.safeErrorText(res, 'Graph API') };
      return { success: true, data: await res.json() };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async sendChatMessage(params: Record<string, unknown>): Promise<ConnectorResult> {
    try {
      const res = await fetch(`${API_BASE}/chats/${params.chat_id}/messages`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({
          body: { contentType: 'html', content: String(params.content) },
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return { success: false, error: await this.safeErrorText(res, 'Graph API') };
      return { success: true, data: await res.json() };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}
