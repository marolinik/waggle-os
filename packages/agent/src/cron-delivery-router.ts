/**
 * CronDeliveryRouter — routes cron job output to user-preferred channels.
 *
 * When a cron job produces a result (morning briefing, task reminder, etc.),
 * this router delivers it via the configured channel(s):
 *   - in_app (default) — desktop notification toast
 *   - email — via email/gmail/outlook connector
 *   - slack — via slack connector
 *   - discord — via discord connector
 *   - teams — via MS Teams connector
 *
 * Falls back to in_app if the preferred channel's connector is unavailable.
 * Supports multi-channel delivery (e.g., both in_app + email).
 */

// ── Types ────────────────────────────────────────────────────────────────

export type DeliveryChannel = 'in_app' | 'email' | 'slack' | 'discord' | 'teams';

export interface DeliveryPreferences {
  /** Default channels for all cron jobs (default: ['in_app']) */
  defaultChannels: DeliveryChannel[];
  /** Per-job-type overrides */
  overrides: Record<string, DeliveryChannel[]>;
  /** Email address for email delivery (required if email channel is used) */
  emailTo?: string;
  /** Slack channel ID for slack delivery */
  slackChannel?: string;
  /** Discord channel ID for discord delivery */
  discordChannel?: string;
  /** Teams channel ID for teams delivery */
  teamsChannel?: string;
}

export interface DeliveryMessage {
  title: string;
  body: string;
  jobType: string;
  workspaceId?: string;
  priority?: 'low' | 'medium' | 'high';
}

export interface DeliveryResult {
  channel: DeliveryChannel;
  success: boolean;
  error?: string;
}

/** Minimal connector interface for sending messages */
export interface DeliveryConnector {
  execute(action: string, params: Record<string, unknown>): Promise<{ success: boolean; error?: string }>;
}

/** Minimal connector registry interface */
export interface DeliveryConnectorRegistry {
  get(id: string): DeliveryConnector | undefined;
  getConnected(): Array<{ id: string }>;
}

/** In-app notification emitter */
export type InAppEmitter = (msg: { title: string; body: string; category: string; actionUrl?: string }) => void;

// ── Channel → Connector mapping ──────────────────────────────────────────

/** Map delivery channels to connector IDs and their send action */
const CHANNEL_CONNECTORS: Record<Exclude<DeliveryChannel, 'in_app'>, {
  connectorIds: string[];
  action: string;
}> = {
  email: { connectorIds: ['gmail', 'email', 'outlook'], action: 'send_email' },
  slack: { connectorIds: ['slack', 'slack-mock'], action: 'send_message' },
  discord: { connectorIds: ['discord', 'discord-mock'], action: 'send_message' },
  teams: { connectorIds: ['ms-teams', 'teams-mock'], action: 'send_message' },
};

// ── Router ───────────────────────────────────────────────────────────────

/**
 * Route a cron job's output to the configured delivery channels.
 *
 * @returns Array of delivery results (one per attempted channel)
 */
export async function deliverCronResult(
  message: DeliveryMessage,
  preferences: DeliveryPreferences,
  connectorRegistry: DeliveryConnectorRegistry,
  emitInApp: InAppEmitter,
): Promise<DeliveryResult[]> {
  // Resolve channels: per-job override → default → ['in_app']
  const channels = preferences.overrides[message.jobType]
    ?? preferences.defaultChannels
    ?? ['in_app'];

  const results: DeliveryResult[] = [];

  for (const channel of channels) {
    if (channel === 'in_app') {
      emitInApp({
        title: message.title,
        body: message.body,
        category: 'cron',
        actionUrl: message.workspaceId ? `/workspace/${message.workspaceId}` : undefined,
      });
      results.push({ channel: 'in_app', success: true });
      continue;
    }

    // Find a connected connector for this channel
    const channelConfig = CHANNEL_CONNECTORS[channel];
    if (!channelConfig) {
      results.push({ channel, success: false, error: `Unknown channel: ${channel}` });
      continue;
    }

    const connectedIds = new Set(connectorRegistry.getConnected().map(c => c.id));
    const connectorId = channelConfig.connectorIds.find(id => connectedIds.has(id));

    if (!connectorId) {
      // Fallback to in-app if connector not available
      emitInApp({
        title: message.title,
        body: message.body,
        category: 'cron',
      });
      results.push({ channel, success: false, error: `No ${channel} connector connected — fell back to in_app` });
      continue;
    }

    const connector = connectorRegistry.get(connectorId);
    if (!connector) {
      results.push({ channel, success: false, error: `Connector ${connectorId} not found` });
      continue;
    }

    try {
      const params = buildChannelParams(channel, message, preferences);
      const result = await connector.execute(channelConfig.action, params);
      results.push({ channel, success: result.success, error: result.error });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      results.push({ channel, success: false, error: errorMsg });
      // Fallback to in-app on send failure
      emitInApp({
        title: message.title,
        body: message.body,
        category: 'cron',
      });
    }
  }

  return results;
}

/**
 * Build channel-specific parameters for the connector's send action.
 */
function buildChannelParams(
  channel: DeliveryChannel,
  message: DeliveryMessage,
  preferences: DeliveryPreferences,
): Record<string, unknown> {
  const formatted = `**${message.title}**\n\n${message.body}`;

  switch (channel) {
    case 'email':
      return {
        to: preferences.emailTo ?? '',
        subject: `[Waggle] ${message.title}`,
        body: message.body,
        html: `<h3>${message.title}</h3><p>${message.body.replace(/\n/g, '<br>')}</p>`,
      };
    case 'slack':
      return {
        channel: preferences.slackChannel ?? 'general',
        text: formatted,
      };
    case 'discord':
      return {
        channel_id: preferences.discordChannel ?? '',
        content: formatted,
      };
    case 'teams':
      return {
        channel_id: preferences.teamsChannel ?? '',
        content: formatted,
      };
    default:
      return { content: formatted };
  }
}

// ── Default Preferences ──────────────────────────────────────────────────

/** Sensible defaults — everything goes to in-app only */
export function createDefaultDeliveryPreferences(
  overrides?: Partial<DeliveryPreferences>,
): DeliveryPreferences {
  return {
    defaultChannels: ['in_app'],
    overrides: {},
    ...overrides,
  };
}
