/**
 * Discord Connector — list guilds, channels, read messages, search, and send messages.
 * Auth: Bot token (Authorization: Bot {token})
 */

import { BaseConnector, type ConnectorAction, type ConnectorResult } from '../connector-sdk.js';
import type { VaultStore } from '@waggle/core';
import type { ConnectorHealth } from '@waggle/shared';

const API_BASE = 'https://discord.com/api/v10';

export class DiscordConnector extends BaseConnector {
  readonly id = 'discord';
  readonly name = 'Discord';
  readonly description = 'Send messages, list guilds and channels, and read Discord conversations';
  readonly service = 'discord.com';
  readonly authType = 'bearer' as const;
  readonly substrate = 'waggle' as const;

  readonly actions: ConnectorAction[] = [
    {
      name: 'list_guilds',
      description: 'List Discord guilds (servers) the bot has access to',
      inputSchema: {
        properties: {
          limit: { type: 'number', description: 'Max guilds to return (default 100)' },
        },
      },
      riskLevel: 'low',
    },
    {
      name: 'list_channels',
      description: 'List channels in a Discord guild',
      inputSchema: {
        properties: {
          guild_id: { type: 'string', description: 'Guild (server) ID' },
        },
        required: ['guild_id'],
      },
      riskLevel: 'low',
    },
    {
      name: 'get_messages',
      description: 'Get recent messages from a Discord channel',
      inputSchema: {
        properties: {
          channel_id: { type: 'string', description: 'Channel ID' },
          limit: { type: 'number', description: 'Max messages to return (default 50)' },
        },
        required: ['channel_id'],
      },
      riskLevel: 'low',
    },
    {
      name: 'send_message',
      description: 'Send a message to a Discord channel',
      inputSchema: {
        properties: {
          channel_id: { type: 'string', description: 'Channel ID' },
          content: { type: 'string', description: 'Message content (markdown supported)' },
        },
        required: ['channel_id', 'content'],
      },
      riskLevel: 'medium',
    },
    {
      name: 'search_messages',
      description: 'Search messages in a Discord guild (may not be available to all bots, falls back to listing messages)',
      inputSchema: {
        properties: {
          guild_id: { type: 'string', description: 'Guild (server) ID' },
          query: { type: 'string', description: 'Search query' },
        },
        required: ['guild_id', 'query'],
      },
      riskLevel: 'low',
    },
    {
      name: 'get_guild_info',
      description: 'Get detailed information about a Discord guild',
      inputSchema: {
        properties: {
          guild_id: { type: 'string', description: 'Guild (server) ID' },
        },
        required: ['guild_id'],
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
        const res = await fetch(`${API_BASE}/users/@me`, {
          headers: this.headers(),
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) {
          health.status = 'error';
          health.error = await this.safeErrorText(res, 'Discord API error');
        }
      } catch (err: unknown) {
        health.status = 'error';
        health.error = err instanceof Error ? err.message : String(err);
      }
    }

    return health;
  }

  async execute(action: string, params: Record<string, unknown>): Promise<ConnectorResult> {
    if (!this.token) return { success: false, error: 'Not connected — add Discord bot token in vault' };

    switch (action) {
      case 'list_guilds': return this.discordGet('/users/@me/guilds', params);
      case 'list_channels': return this.discordGet(`/guilds/${params.guild_id}/channels`, {});
      case 'get_messages': {
        const limit = params.limit ?? 50;
        return this.discordGet(`/channels/${params.channel_id}/messages`, { limit });
      }
      case 'send_message': return this.discordPost(`/channels/${params.channel_id}/messages`, { content: params.content });
      case 'search_messages': return this.discordGet(`/guilds/${params.guild_id}/messages/search`, { content: params.query });
      case 'get_guild_info': return this.discordGet(`/guilds/${params.guild_id}`, {});
      default: return { success: false, error: `Unknown action: ${action}` };
    }
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bot ${this.token}`,
      'Content-Type': 'application/json',
    };
  }

  private async discordGet(endpoint: string, params: Record<string, unknown>): Promise<ConnectorResult> {
    try {
      const query = new URLSearchParams();
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined) query.set(k, String(v));
      }
      const qs = query.toString();
      const res = await fetch(`${API_BASE}${endpoint}${qs ? `?${qs}` : ''}`, {
        headers: this.headers(),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) {
        const errText = await this.safeErrorText(res, 'Discord API error');
        return { success: false, error: errText };
      }
      const data = await res.json();
      return { success: true, data };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async discordPost(endpoint: string, body: Record<string, unknown>): Promise<ConnectorResult> {
    try {
      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) {
        const errText = await this.safeErrorText(res, 'Discord API error');
        return { success: false, error: errText };
      }
      const data = await res.json();
      return { success: true, data };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}
