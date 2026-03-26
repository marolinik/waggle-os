/**
 * Mock Channel Connectors — Slack, Microsoft Teams, Discord
 *
 * MOCK: Remove when real OAuth integration is ready.
 *
 * These connectors appear in Settings → Connectors and expose tools that
 * return mock success responses. They require no credentials and are
 * available immediately for testing and demonstration purposes.
 */

import { BaseConnector, type ConnectorAction, type ConnectorResult } from '../connector-sdk.js';
import type { VaultStore } from '@waggle/core';
import type { ConnectorHealth } from '@waggle/shared';

// ── Mock Slack Connector ────────────────────────────────────────────

export class MockSlackConnector extends BaseConnector {
  readonly id = 'slack-mock';
  readonly name = 'Slack (Demo)';
  readonly description = 'Mock Slack connector — send messages and list channels without real credentials';
  readonly service = 'slack.com';
  readonly authType = 'bearer' as const;
  readonly substrate = 'waggle' as const;

  readonly actions: ConnectorAction[] = [
    {
      name: 'send_slack_message',
      description: 'Send a message to a Slack channel (MOCK — returns simulated success)',
      inputSchema: {
        type: 'object',
        properties: {
          channel: { type: 'string', description: 'Channel name or ID (e.g. #general)' },
          message: { type: 'string', description: 'Message text to send' },
        },
        required: ['channel', 'message'],
      },
      riskLevel: 'medium',
    },
    {
      name: 'list_slack_channels',
      description: 'List available Slack channels (MOCK — returns sample data)',
      inputSchema: { type: 'object', properties: {} },
      riskLevel: 'low',
    },
  ];

  // MOCK: No real connection needed
  async connect(_vault: VaultStore): Promise<void> {}

  async healthCheck(): Promise<ConnectorHealth> {
    return {
      id: this.id,
      name: this.name,
      // MOCK: Always reports healthy without real credential check
      status: 'connected',
      lastChecked: new Date().toISOString(),
    };
  }

  async execute(action: string, params: Record<string, unknown>): Promise<ConnectorResult> {
    // MOCK: Return simulated success responses
    if (action === 'send_slack_message') {
      return {
        success: true,
        data: {
          demo: true,
          mock: true,
          sent: true,
          channel: params.channel ?? '#general',
          message: `[DEMO] ${params.message ?? ''}`,
          ts: String(Date.now() / 1000),
          note: 'Demo mode — configure real credentials in Settings > Keys & Connections to use real integrations',
        },
      };
    }
    if (action === 'list_slack_channels') {
      return {
        success: true,
        data: {
          demo: true,
          mock: true,
          channels: [
            { id: 'C001', name: 'general', memberCount: 42 },
            { id: 'C002', name: 'engineering', memberCount: 18 },
            { id: 'C003', name: 'product', memberCount: 12 },
          ],
          note: 'Demo mode — configure real credentials in Settings > Keys & Connections to use real integrations',
        },
      };
    }
    return { success: false, error: `Unknown action: ${action}` };
  }
}

// ── Mock Microsoft Teams Connector ─────────────────────────────────

export class MockTeamsConnector extends BaseConnector {
  readonly id = 'ms-teams-mock';
  readonly name = 'Microsoft Teams (Demo)';
  readonly description = 'Mock Teams connector — send messages to channels without real credentials';
  readonly service = 'teams.microsoft.com';
  readonly authType = 'oauth2' as const;
  readonly substrate = 'waggle' as const;

  readonly actions: ConnectorAction[] = [
    {
      name: 'send_teams_message',
      description: 'Send a message to a Teams channel (MOCK — returns simulated success)',
      inputSchema: {
        type: 'object',
        properties: {
          channel: { type: 'string', description: 'Teams channel name or ID' },
          message: { type: 'string', description: 'Message text to send' },
        },
        required: ['channel', 'message'],
      },
      riskLevel: 'medium',
    },
    {
      name: 'list_teams_channels',
      description: 'List available Teams channels (MOCK — returns sample data)',
      inputSchema: { type: 'object', properties: {} },
      riskLevel: 'low',
    },
  ];

  // MOCK: No real connection needed
  async connect(_vault: VaultStore): Promise<void> {}

  async healthCheck(): Promise<ConnectorHealth> {
    return {
      id: this.id,
      name: this.name,
      // MOCK: Always reports healthy without real credential check
      status: 'connected',
      lastChecked: new Date().toISOString(),
    };
  }

  async execute(action: string, params: Record<string, unknown>): Promise<ConnectorResult> {
    // MOCK: Return simulated success responses
    if (action === 'send_teams_message') {
      return {
        success: true,
        data: {
          demo: true,
          mock: true,
          sent: true,
          channel: params.channel ?? 'General',
          message: `[DEMO] ${params.message ?? ''}`,
          messageId: `mock-${Date.now()}`,
          note: 'Demo mode — configure real credentials in Settings > Keys & Connections to use real integrations',
        },
      };
    }
    if (action === 'list_teams_channels') {
      return {
        success: true,
        data: {
          demo: true,
          mock: true,
          channels: [
            { id: 'T001', name: 'General', teamName: 'Engineering' },
            { id: 'T002', name: 'Announcements', teamName: 'Company' },
            { id: 'T003', name: 'Stand-ups', teamName: 'Engineering' },
          ],
          note: 'Demo mode — configure real credentials in Settings > Keys & Connections to use real integrations',
        },
      };
    }
    return { success: false, error: `Unknown action: ${action}` };
  }
}

// ── Mock Discord Connector ──────────────────────────────────────────

export class MockDiscordConnector extends BaseConnector {
  readonly id = 'discord-mock';
  readonly name = 'Discord (Demo)';
  readonly description = 'Mock Discord connector — send messages to channels without real credentials';
  readonly service = 'discord.com';
  readonly authType = 'bearer' as const;
  readonly substrate = 'waggle' as const;

  readonly actions: ConnectorAction[] = [
    {
      name: 'send_discord_message',
      description: 'Send a message to a Discord channel (MOCK — returns simulated success)',
      inputSchema: {
        type: 'object',
        properties: {
          channel: { type: 'string', description: 'Discord channel name or ID' },
          message: { type: 'string', description: 'Message text to send' },
        },
        required: ['channel', 'message'],
      },
      riskLevel: 'medium',
    },
    {
      name: 'list_discord_channels',
      description: 'List available Discord channels (MOCK — returns sample data)',
      inputSchema: { type: 'object', properties: {} },
      riskLevel: 'low',
    },
  ];

  // MOCK: No real connection needed
  async connect(_vault: VaultStore): Promise<void> {}

  async healthCheck(): Promise<ConnectorHealth> {
    return {
      id: this.id,
      name: this.name,
      // MOCK: Always reports healthy without real credential check
      status: 'connected',
      lastChecked: new Date().toISOString(),
    };
  }

  async execute(action: string, params: Record<string, unknown>): Promise<ConnectorResult> {
    // MOCK: Return simulated success responses
    if (action === 'send_discord_message') {
      return {
        success: true,
        data: {
          demo: true,
          mock: true,
          sent: true,
          channel: params.channel ?? 'general',
          message: `[DEMO] ${params.message ?? ''}`,
          messageId: `mock-${Date.now()}`,
          note: 'Demo mode — configure real credentials in Settings > Keys & Connections to use real integrations',
        },
      };
    }
    if (action === 'list_discord_channels') {
      return {
        success: true,
        data: {
          demo: true,
          mock: true,
          channels: [
            { id: 'D001', name: 'general', type: 'text' },
            { id: 'D002', name: 'announcements', type: 'text' },
            { id: 'D003', name: 'dev-talk', type: 'text' },
          ],
          note: 'Demo mode — configure real credentials in Settings > Keys & Connections to use real integrations',
        },
      };
    }
    return { success: false, error: `Unknown action: ${action}` };
  }
}
