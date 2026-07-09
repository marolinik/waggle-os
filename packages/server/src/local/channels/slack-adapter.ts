/**
 * Slack channel adapter — Socket Mode, no @slack/bolt.
 *
 * NAT-friendly: apps.connections.open (app-level xapp- token) hands us a
 * wss URL we dial OUT to; no public Request URL needed. Events arrive as
 * envelopes that MUST be acked by envelope_id or Slack redelivers; sends go
 * through chat.postMessage with the separate bot xoxb- token.
 *
 * Slack rotates socket connections routinely (`disconnect` envelope with
 * reason refresh_requested) — treat every drop as a normal reconnect, not
 * an error. Fixed API host (slack.com) — no SSRF surface.
 *
 * Setup requirements (surfaced in Settings UI copy): Socket Mode enabled,
 * app token with connections:write, bot token with chat:write, and the
 * message.im / message.channels event subscriptions.
 */

import WebSocket from 'ws';
import type {
  ChannelAdapter, ChannelAdapterStatus, ChannelMessage, InboundHandler, WsFactory, WsLike,
} from './types.js';
import { chunkText } from './types.js';

const SLACK_API = 'https://slack.com/api';
/** Slack truncates at 40k but recommends ≤4k for message text. */
export const SLACK_MAX_TEXT = 4000;
const BACKOFF_START_MS = 1_000;
const BACKOFF_CAP_MS = 60_000;

interface SlackEnvelope {
  envelope_id?: string;
  type?: string; // 'hello' | 'disconnect' | 'events_api' | …
  payload?: {
    event?: {
      type?: string;
      subtype?: string;
      bot_id?: string;
      user?: string;
      channel?: string;
      text?: string;
      ts?: string;
    };
  };
}

export interface SlackAdapterOptions {
  /** App-level token (xapp-…) — Socket Mode connections. */
  appToken: string;
  /** Bot token (xoxb-…) — chat.postMessage sends. */
  botToken: string;
  onMessage: InboundHandler;
  log: { info: (msg: string) => void; warn: (msg: string) => void };
  /** Test seams. */
  fetchImpl?: typeof fetch;
  wsFactory?: WsFactory;
  backoffCapMs?: number;
}

export class SlackAdapter implements ChannelAdapter {
  readonly platform = 'slack' as const;

  private readonly appToken: string;
  private readonly botToken: string;
  private readonly onMessage: InboundHandler;
  private readonly log: SlackAdapterOptions['log'];
  private readonly fetchImpl: typeof fetch;
  private readonly wsFactory: WsFactory;
  private readonly backoffCap: number;

  private running = false;
  private connected = false;
  private lastError: string | undefined;
  private lastActivityAt: number | undefined;
  private ws: WsLike | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private backoff: number;

  constructor(opts: SlackAdapterOptions) {
    this.appToken = opts.appToken;
    this.botToken = opts.botToken;
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
    for (const chunk of chunkText(text, SLACK_MAX_TEXT)) {
      const r = await this.fetchImpl(`${SLACK_API}/chat.postMessage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          Authorization: `Bearer ${this.botToken}`,
        },
        body: JSON.stringify({ channel: chatId, text: chunk }),
      });
      const body = await r.json() as { ok: boolean; error?: string };
      if (!body.ok) {
        throw new Error(`Slack send failed: ${body.error ?? `HTTP ${r.status}`}`);
      }
    }
  }

  // ── Socket Mode lifecycle ────────────────────────────────────────────

  private async connect(): Promise<void> {
    try {
      const r = await this.fetchImpl(`${SLACK_API}/apps.connections.open`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.appToken}` },
      });
      const body = await r.json() as { ok: boolean; url?: string; error?: string };
      if (!body.ok || !body.url) {
        throw new Error(`apps.connections.open failed: ${body.error ?? `HTTP ${r.status}`}`);
      }

      const ws = this.wsFactory(body.url);
      this.ws = ws;
      ws.on('message', (data: unknown) => this.handleEnvelope(String(data)));
      ws.on('close', () => this.handleDrop('socket closed'));
      ws.on('error', (err: unknown) => {
        this.lastError = err instanceof Error ? err.message : String(err);
      });
    } catch (e: unknown) {
      this.handleDrop(e instanceof Error ? e.message : String(e));
    }
  }

  private handleEnvelope(raw: string): void {
    let envelope: SlackEnvelope;
    try {
      envelope = JSON.parse(raw) as SlackEnvelope;
    } catch {
      return;
    }
    this.lastActivityAt = Date.now();

    // Ack FIRST — Slack redelivers unacked envelopes, which would double-run
    // agent turns. An ack for a turn we then fail is the safer failure mode.
    if (envelope.envelope_id) {
      this.sendRaw({ envelope_id: envelope.envelope_id });
    }

    switch (envelope.type) {
      case 'hello':
        this.connected = true;
        this.lastError = undefined;
        this.backoff = Math.min(BACKOFF_START_MS, this.backoffCap);
        this.log.info('[slack] socket mode connected');
        return;
      case 'disconnect':
        // Routine link refresh — reconnect quietly.
        this.handleDrop('slack requested reconnect');
        return;
      case 'events_api':
        break;
      default:
        return;
    }

    const event = envelope.payload?.event;
    if (event?.type !== 'message') return;
    // Skip edits/joins/etc. (subtype), bot echoes, and system messages.
    if (event.subtype || event.bot_id || !event.user || !event.channel || !event.text) return;

    const msg: ChannelMessage = {
      platform: 'slack',
      chatId: event.channel,
      senderId: event.user,
      text: event.text,
      messageId: event.ts,
    };
    void this.onMessage(msg).catch(e => {
      this.log.warn(`[slack] inbound handler failed: ${e instanceof Error ? e.message : e}`);
    });
  }

  private sendRaw(payload: unknown): void {
    try {
      this.ws?.send(JSON.stringify(payload));
    } catch (e: unknown) {
      this.lastError = e instanceof Error ? e.message : String(e);
    }
  }

  private handleDrop(reason: string): void {
    this.teardownSocket();
    this.connected = false;
    if (!this.running) return;
    this.lastError = reason;
    this.log.warn(`[slack] connection dropped (${reason}) — reconnecting in ${this.backoff}ms`);
    this.reconnectTimer = setTimeout(() => {
      void this.connect();
    }, this.backoff);
    this.reconnectTimer.unref?.();
    this.backoff = Math.min(this.backoff * 2, this.backoffCap);
  }

  private teardownSocket(): void {
    try {
      this.ws?.close();
    } catch { /* already closed */ }
    this.ws = null;
  }
}
