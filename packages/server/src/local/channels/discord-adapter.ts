/**
 * Discord channel adapter — raw gateway WebSocket, no discord.js.
 *
 * NAT-friendly: the bot dials OUT to Discord's gateway; no public endpoint.
 * We implement the minimal gateway contract (HELLO → IDENTIFY → heartbeat →
 * MESSAGE_CREATE dispatches) and reconnect-with-re-IDENTIFY on any drop —
 * resume (op 6) is deliberately skipped: a desktop assistant tolerates the
 * occasional replayed-gap far better than it tolerates resume-state bugs.
 *
 * Fixed API host (discord.com) — no SSRF surface. Bot needs the
 * MESSAGE CONTENT privileged intent enabled in the developer portal.
 */

import WebSocket from 'ws';
import type {
  ChannelAdapter, ChannelAdapterStatus, ChannelMessage, InboundHandler, WsFactory, WsLike,
} from './types.js';
import { chunkText } from './types.js';

const DISCORD_API = 'https://discord.com/api/v10';
export const DISCORD_MAX_TEXT = 2000;
// GUILDS + GUILD_MESSAGES + DIRECT_MESSAGES + MESSAGE_CONTENT
export const DISCORD_INTENTS = 1 | (1 << 9) | (1 << 12) | (1 << 15);
const BACKOFF_START_MS = 1_000;
const BACKOFF_CAP_MS = 60_000;

// Gateway opcodes we handle.
const OP_DISPATCH = 0;
const OP_HEARTBEAT = 1;
const OP_IDENTIFY = 2;
const OP_RECONNECT = 7;
const OP_INVALID_SESSION = 9;
const OP_HELLO = 10;
const OP_HEARTBEAT_ACK = 11;

interface GatewayFrame {
  op: number;
  d?: unknown;
  s?: number | null;
  t?: string | null;
}

interface DiscordAuthor {
  id: string;
  username?: string;
  bot?: boolean;
}

interface DiscordMessageCreate {
  id: string;
  channel_id: string;
  content?: string;
  author?: DiscordAuthor;
}

export interface DiscordAdapterOptions {
  botToken: string;
  onMessage: InboundHandler;
  log: { info: (msg: string) => void; warn: (msg: string) => void };
  /** Test seams. */
  fetchImpl?: typeof fetch;
  wsFactory?: WsFactory;
  /** Test seam — collapses reconnect backoff waits. */
  backoffCapMs?: number;
}

export class DiscordAdapter implements ChannelAdapter {
  readonly platform = 'discord' as const;

  private readonly token: string;
  private readonly onMessage: InboundHandler;
  private readonly log: DiscordAdapterOptions['log'];
  private readonly fetchImpl: typeof fetch;
  private readonly wsFactory: WsFactory;
  private readonly backoffCap: number;

  private running = false;
  private connected = false;
  private lastError: string | undefined;
  private lastActivityAt: number | undefined;
  private ws: WsLike | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private backoff: number;
  private seq: number | null = null;
  private botUserId: string | null = null;

  constructor(opts: DiscordAdapterOptions) {
    this.token = opts.botToken;
    this.onMessage = opts.onMessage;
    this.log = opts.log;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.wsFactory = opts.wsFactory ?? ((url: string) => new WebSocket(url) as unknown as WsLike);
    this.backoffCap = opts.backoffCapMs ?? BACKOFF_CAP_MS;
    this.backoff = Math.min(BACKOFF_START_MS, this.backoffCap);
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.lastError = undefined;
    await this.connect();
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.teardownSocket();
    this.connected = false;
  }

  getStatus(): ChannelAdapterStatus {
    return {
      platform: this.platform,
      running: this.running,
      connected: this.connected,
      lastError: this.lastError,
      lastActivityAt: this.lastActivityAt,
    };
  }

  async send(chatId: string, text: string): Promise<void> {
    for (const chunk of chunkText(text, DISCORD_MAX_TEXT)) {
      const r = await this.fetchImpl(`${DISCORD_API}/channels/${encodeURIComponent(chatId)}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bot ${this.token}`,
        },
        body: JSON.stringify({ content: chunk }),
      });
      if (!r.ok) {
        const body = await r.text().catch(() => '');
        throw new Error(`Discord send failed (HTTP ${r.status}): ${body.slice(0, 200)}`);
      }
    }
  }

  // ── Gateway lifecycle ────────────────────────────────────────────────

  private async connect(): Promise<void> {
    try {
      const r = await this.fetchImpl(`${DISCORD_API}/gateway/bot`, {
        headers: { Authorization: `Bot ${this.token}` },
      });
      if (!r.ok) throw new Error(`gateway/bot HTTP ${r.status}`);
      const { url } = await r.json() as { url: string };

      const ws = this.wsFactory(`${url}?v=10&encoding=json`);
      this.ws = ws;
      ws.on('message', (data: unknown) => this.handleFrame(String(data)));
      ws.on('close', () => this.handleDrop('gateway closed'));
      ws.on('error', (err: unknown) => {
        this.lastError = err instanceof Error ? err.message : String(err);
      });
    } catch (e: unknown) {
      this.handleDrop(e instanceof Error ? e.message : String(e));
    }
  }

  private handleFrame(raw: string): void {
    let frame: GatewayFrame;
    try {
      frame = JSON.parse(raw) as GatewayFrame;
    } catch {
      return;
    }
    if (typeof frame.s === 'number') this.seq = frame.s;
    this.lastActivityAt = Date.now();

    switch (frame.op) {
      case OP_HELLO: {
        const interval = (frame.d as { heartbeat_interval?: number })?.heartbeat_interval ?? 41_250;
        this.startHeartbeat(interval);
        this.sendFrame({
          op: OP_IDENTIFY,
          d: {
            token: this.token,
            intents: DISCORD_INTENTS,
            properties: { os: process.platform, browser: 'waggle-os', device: 'waggle-os' },
          },
        });
        break;
      }
      case OP_HEARTBEAT:
        this.sendFrame({ op: OP_HEARTBEAT, d: this.seq });
        break;
      case OP_HEARTBEAT_ACK:
        break;
      case OP_RECONNECT:
      case OP_INVALID_SESSION:
        this.handleDrop(frame.op === OP_RECONNECT ? 'server requested reconnect' : 'invalid session');
        break;
      case OP_DISPATCH:
        this.handleDispatch(frame);
        break;
      default:
        break;
    }
  }

  private handleDispatch(frame: GatewayFrame): void {
    if (frame.t === 'READY') {
      this.botUserId = (frame.d as { user?: { id?: string } })?.user?.id ?? null;
      this.connected = true;
      this.lastError = undefined;
      this.backoff = Math.min(BACKOFF_START_MS, this.backoffCap);
      this.log.info('[discord] gateway ready');
      return;
    }
    if (frame.t !== 'MESSAGE_CREATE') return;
    const m = frame.d as DiscordMessageCreate;
    if (!m?.content || !m.author) return;
    if (m.author.bot || m.author.id === this.botUserId) return;
    const msg: ChannelMessage = {
      platform: 'discord',
      chatId: m.channel_id,
      senderId: m.author.id,
      senderName: m.author.username,
      text: m.content,
      messageId: m.id,
    };
    void this.onMessage(msg).catch(e => {
      this.log.warn(`[discord] inbound handler failed: ${e instanceof Error ? e.message : e}`);
    });
  }

  private startHeartbeat(intervalMs: number): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = setInterval(() => {
      this.sendFrame({ op: OP_HEARTBEAT, d: this.seq });
    }, intervalMs);
    // A desktop process must never be kept alive by a bot heartbeat.
    this.heartbeatTimer.unref?.();
  }

  private sendFrame(frame: GatewayFrame): void {
    try {
      this.ws?.send(JSON.stringify(frame));
    } catch (e: unknown) {
      this.lastError = e instanceof Error ? e.message : String(e);
    }
  }

  private handleDrop(reason: string): void {
    this.teardownSocket();
    this.connected = false;
    if (!this.running) return;
    this.lastError = reason;
    this.log.warn(`[discord] connection dropped (${reason}) — reconnecting in ${this.backoff}ms`);
    this.reconnectTimer = setTimeout(() => {
      void this.connect();
    }, this.backoff);
    this.reconnectTimer.unref?.();
    this.backoff = Math.min(this.backoff * 2, this.backoffCap);
  }

  private teardownSocket(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    try {
      this.ws?.close();
    } catch { /* already closed */ }
    this.ws = null;
  }
}
