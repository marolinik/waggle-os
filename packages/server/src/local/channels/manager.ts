/**
 * ChannelManager — owns adapter lifecycle and the inbound message pipeline.
 *
 * Pipeline (every inbound message, all platforms):
 *   1. per-sender rate limit (token bucket, RATE_LIMIT_MAX/min)
 *   2. `/pair <code>` — the ONLY verb an unpaired sender can use
 *   3. deny-by-default: unpaired senders get silence (no bot-presence oracle)
 *   4. commands: /workspace [id], /status
 *   5. plain text → loopback /api/chat turn (injection scan, persona,
 *      governance, memory all inherited) → chunked reply
 *
 * Secrets stay in the vault (read-only here — routes write them);
 * allowlist/overrides/config live in PairingStore (channels.json).
 */

import { Buffer } from 'node:buffer';
import { PairingStore } from './pairing.js';
import { runChannelChatTurn } from './chat-client.js';
import { TelegramAdapter } from './telegram-adapter.js';
import { DiscordAdapter } from './discord-adapter.js';
import { SlackAdapter } from './slack-adapter.js';
import { WhatsAppAdapter } from './whatsapp-adapter.js';
import type { ChannelAdapter, ChannelAdapterStatus, ChannelMessage, ChannelPlatform } from './types.js';

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 10;
const MESSAGE_DEDUP_TTL_MS = 24 * 60 * 60 * 1000;
const MESSAGE_DEDUP_MAX = 2_000;

export const APPROVAL_NEEDED_REPLY =
  'This request needs a tool approval — open the Waggle app to review and approve it.';
export const PAIR_OK_REPLY = 'Paired ✓ — this device can now talk to Waggle. Try /status or just say hi.';
export const PAIR_FAIL_REPLY = 'Invalid or expired pairing code. Generate a fresh one in Waggle → Settings → Channels.';

/** Vault keys per platform (telegram reuses the FR-2 digest key on purpose). */
export const CHANNEL_VAULT_KEYS: Record<ChannelPlatform, string[]> = {
  telegram: ['telegram_bot_token'],
  discord: ['discord_bot_token'],
  slack: ['slack_app_token', 'slack_bot_token'],
  whatsapp: [], // No user-entered token; Baileys state uses an encrypted Vault entry.
};

interface ChannelVault {
  get(key: string): { value: string } | null | undefined;
  has(key: string): boolean;
  set(key: string, value: string, metadata?: Record<string, unknown>): void;
  delete(key: string): boolean;
}

interface ManagerLog {
  info: (msg: string) => void;
  warn: (msg: string) => void;
}

export interface ChannelManagerOptions {
  dataDir: string;
  /** Sidecar HTTP port for loopback /api/chat calls. */
  port: number;
  /** Sidecar bearer token for protected loopback /api/chat calls. */
  sessionToken: string;
  vault: ChannelVault;
  log: ManagerLog;
  /** For /workspace validation; absent → any id accepted. */
  listWorkspaceIds?: () => string[];
  /** Human-friendly workspace names for /workspace name-or-id resolution. */
  listWorkspaces?: () => Array<{ id: string; name: string }>;
  /** Audit sink (pair/unpair events — names match AuditEventType). */
  onAudit?: (event: {
    type: 'channel_pair' | 'channel_pair_failed' | 'channel_unpair';
    platform: ChannelPlatform;
    detail?: string;
  }) => void;
  /** Test seam — replaces the loopback chat call. */
  chatTurnImpl?: typeof runChannelChatTurn;
  /** Test seam — replaces adapter construction. */
  adapterFactory?: (platform: ChannelPlatform, manager: ChannelManager) => ChannelAdapter | null;
}

export class ChannelManager {
  readonly pairing: PairingStore;

  private readonly opts: ChannelManagerOptions;
  private readonly adapters = new Map<ChannelPlatform, ChannelAdapter>();
  private readonly rateBuckets = new Map<string, number[]>();
  private readonly inboundQueues = new Map<string, Promise<void>>();
  private readonly seenMessageIds = new Map<string, number>();
  private readonly chatTurn: typeof runChannelChatTurn;

  constructor(opts: ChannelManagerOptions) {
    this.opts = opts;
    this.pairing = new PairingStore(opts.dataDir);
    this.chatTurn = opts.chatTurnImpl ?? runChannelChatTurn;
  }

  // ── Lifecycle ────────────────────────────────────────────────────────

  /** Start every platform whose persisted config says enabled. */
  async startEnabled(): Promise<void> {
    for (const platform of ['telegram', 'discord', 'slack', 'whatsapp'] as ChannelPlatform[]) {
      if (this.pairing.getConfig(platform).enabled) {
        await this.start(platform).catch(e => {
          this.opts.log.warn(`[channels] ${platform} failed to start: ${e instanceof Error ? e.message : e}`);
        });
      }
    }
  }

  async start(platform: ChannelPlatform): Promise<ChannelAdapterStatus> {
    let adapter = this.adapters.get(platform);
    if (!adapter) {
      const created = this.createAdapter(platform);
      if (!created) {
        throw new Error(`${platform} is not configured (missing credentials or unsupported in this build)`);
      }
      adapter = created;
      this.adapters.set(platform, adapter);
    }
    await adapter.start();
    this.opts.log.info(`[channels] ${platform} started`);
    return adapter.getStatus();
  }

  async stop(platform: ChannelPlatform): Promise<void> {
    const adapter = this.adapters.get(platform);
    if (!adapter) return;
    await adapter.stop();
    this.adapters.delete(platform);
    this.opts.log.info(`[channels] ${platform} stopped`);
  }

  async stopAll(): Promise<void> {
    for (const platform of [...this.adapters.keys()]) {
      await this.stop(platform).catch(() => undefined);
    }
  }

  /** Restart a running platform so config changes take effect. */
  async restartIfRunning(platform: ChannelPlatform): Promise<void> {
    if (this.adapters.has(platform)) {
      await this.stop(platform);
      await this.start(platform);
    }
  }

  getStatuses(): ChannelAdapterStatus[] {
    return (['telegram', 'discord', 'slack', 'whatsapp'] as ChannelPlatform[]).map(platform =>
      this.adapters.get(platform)?.getStatus()
      ?? { platform, running: false, connected: false },
    );
  }

  private createAdapter(platform: ChannelPlatform): ChannelAdapter | null {
    if (this.opts.adapterFactory) return this.opts.adapterFactory(platform, this);
    const onMessage = (msg: ChannelMessage) => this.handleInbound(msg);
    if (platform === 'telegram') {
      const token = this.readVault('telegram_bot_token');
      if (!token) return null;
      return new TelegramAdapter({ botToken: token, onMessage, log: this.opts.log });
    }
    if (platform === 'discord') {
      const token = this.readVault('discord_bot_token');
      if (!token) return null;
      return new DiscordAdapter({ botToken: token, onMessage, log: this.opts.log });
    }
    if (platform === 'slack') {
      const appToken = this.readVault('slack_app_token');
      const botToken = this.readVault('slack_bot_token');
      if (!appToken || !botToken) return null;
      return new SlackAdapter({ appToken, botToken, onMessage, log: this.opts.log });
    }
    if (platform === 'whatsapp') {
      // No user-entered credential: Baileys pairs via QR and persists all
      // resulting session state through the encrypted Vault adapter.
      return new WhatsAppAdapter({
        dataDir: this.opts.dataDir,
        vault: this.opts.vault,
        onMessage,
        log: this.opts.log,
      });
    }
    return null;
  }

  private readVault(key: string): string | null {
    try {
      return this.opts.vault.get(key)?.value ?? null;
    } catch {
      return null;
    }
  }

  // ── Inbound pipeline ─────────────────────────────────────────────────

  async handleInbound(msg: ChannelMessage): Promise<void> {
    const queueKey = `${msg.platform}:${msg.chatId}`;
    const previous = this.inboundQueues.get(queueKey) ?? Promise.resolve();
    const queued = previous
      .catch(() => undefined)
      .then(() => this.processInbound(msg));
    this.inboundQueues.set(queueKey, queued);
    try {
      await queued;
    } finally {
      if (this.inboundQueues.get(queueKey) === queued) this.inboundQueues.delete(queueKey);
    }
  }

  private async processInbound(msg: ChannelMessage): Promise<void> {
    if (this.isDuplicate(msg)) return;
    if (!this.allowRate(`${msg.platform}:${msg.senderId}`)) return;

    const text = msg.text.trim();
    const adapter = this.adapters.get(msg.platform);
    const reply = async (t: string) => {
      await adapter?.send(msg.chatId, t).catch(e => {
        this.opts.log.warn(`[channels] ${msg.platform} reply failed: ${e instanceof Error ? e.message : e}`);
      });
    };

    // 1. Pairing — the only path open to unknown senders.
    if (/^\/pair\b/i.test(text)) {
      const code = text.replace(/^\/pair\b/i, '').trim();
      const ok = this.pairing.consumeCode(msg.platform, code, msg.senderId, msg.senderName);
      this.opts.onAudit?.({
        type: ok ? 'channel_pair' : 'channel_pair_failed',
        platform: msg.platform,
        detail: ok ? `sender ${msg.senderId} paired` : `bad code from ${msg.senderId}`,
      });
      await reply(ok ? PAIR_OK_REPLY : PAIR_FAIL_REPLY);
      return;
    }

    // 2. Deny-by-default: silence toward unpaired senders.
    if (!this.pairing.isPaired(msg.platform, msg.senderId)) {
      this.opts.log.info(`[channels] ignored message from unpaired ${msg.platform} sender ${msg.senderId}`);
      return;
    }

    // 3. Commands.
    if (/^\/workspace\b/i.test(text)) {
      await reply(this.handleWorkspaceCommand(msg, text));
      return;
    }
    if (/^\/status\b/i.test(text)) {
      const status = adapter?.getStatus();
      const ws = this.resolveWorkspace(msg);
      await reply(`Waggle connected ✓\nWorkspace: ${this.workspaceLabel(ws)}\nTransport: ${status?.connected ? 'healthy' : 'degraded'}`);
      return;
    }

    // 4. Agent turn via loopback chat.
    const result = await this.chatTurn({
      port: this.opts.port,
      sessionToken: this.opts.sessionToken,
      message: msg.text,
      workspace: this.resolveWorkspace(msg),
      session: sessionIdFor(msg),
      proposeHeld: true,
    });

    if (result.approvalRequired && !result.content) {
      await reply(APPROVAL_NEEDED_REPLY);
      return;
    }
    if (result.error && !result.content) {
      await reply(`Something went wrong: ${result.error}`);
      return;
    }
    if (result.content) {
      await reply(result.content + (result.approvalRequired ? `\n\n${APPROVAL_NEEDED_REPLY}` : ''));
    }
  }

  private handleWorkspaceCommand(msg: ChannelMessage, text: string): string {
    const arg = text.replace(/^\/workspace\b/i, '').trim();
    if (!arg) {
      const current = this.resolveWorkspace(msg);
      return `Current workspace: ${this.workspaceLabel(current)}\nUse "/workspace <name or id>" to switch this chat, "/workspace default" to clear.`;
    }
    if (arg === 'default') {
      this.pairing.setWorkspaceOverride(msg.platform, msg.chatId, null);
      const defaultWorkspace = this.pairing.getConfig(msg.platform).defaultWorkspace;
      return `This chat now uses the channel default workspace (${this.workspaceLabel(defaultWorkspace)}).`;
    }
    const workspaces = this.opts.listWorkspaces?.()
      ?? this.opts.listWorkspaceIds?.().map(id => ({ id, name: id }));
    const normalizedArg = arg.toLocaleLowerCase();
    const match = workspaces?.find(workspace => workspace.id === arg)
      ?? workspaces?.find(workspace => workspace.name.toLocaleLowerCase() === normalizedArg);
    if (workspaces && !match) {
      const available = workspaces.slice(0, 20).map(workspace => workspace.name).join(', ') || '(none)';
      return `Unknown workspace "${arg}". Available: ${available}`;
    }
    const workspaceId = match?.id ?? arg;
    this.pairing.setWorkspaceOverride(msg.platform, msg.chatId, workspaceId);
    return `This chat is now routed to workspace "${match?.name ?? workspaceId}".`;
  }

  private resolveWorkspace(msg: ChannelMessage): string {
    return this.pairing.getWorkspaceOverride(msg.platform, msg.chatId)
      ?? this.pairing.getConfig(msg.platform).defaultWorkspace;
  }

  private isDuplicate(msg: ChannelMessage): boolean {
    if (!msg.messageId) return false;
    const now = Date.now();
    const key = `${msg.platform}:${msg.chatId}:${msg.messageId}`;
    const seenAt = this.seenMessageIds.get(key);
    if (seenAt !== undefined && now - seenAt < MESSAGE_DEDUP_TTL_MS) return true;
    if (seenAt !== undefined) this.seenMessageIds.delete(key);

    if (this.seenMessageIds.size >= MESSAGE_DEDUP_MAX) {
      const cutoff = now - MESSAGE_DEDUP_TTL_MS;
      for (const [seenKey, seenAt] of this.seenMessageIds) {
        if (seenAt < cutoff) this.seenMessageIds.delete(seenKey);
      }
      while (this.seenMessageIds.size >= MESSAGE_DEDUP_MAX) {
        const oldest = this.seenMessageIds.keys().next().value as string | undefined;
        if (!oldest) break;
        this.seenMessageIds.delete(oldest);
      }
    }
    this.seenMessageIds.set(key, now);
    return false;
  }

  private workspaceLabel(workspaceId: string): string {
    const workspace = this.opts.listWorkspaces?.().find(item => item.id === workspaceId);
    return workspace ? `${workspace.name} (${workspace.id})` : workspaceId;
  }

  private allowRate(key: string): boolean {
    const now = Date.now();
    const recent = (this.rateBuckets.get(key) ?? []).filter(t => now - t < RATE_LIMIT_WINDOW_MS);
    if (recent.length >= RATE_LIMIT_MAX) {
      this.rateBuckets.set(key, recent);
      return false;
    }
    this.rateBuckets.set(key, [...recent, now]);
    return true;
  }
}

/**
 * Stable persisted-session id per IM conversation. Base64url keeps the full
 * transport id unique while staying inside assertSafeSegment's safe charset.
 */
export function sessionIdFor(msg: Pick<ChannelMessage, 'platform' | 'chatId'>): string {
  const encodedChat = Buffer.from(msg.chatId, 'utf8').toString('base64url') || 'empty';
  return `channel-v2-${msg.platform}-${encodedChat}`;
}
