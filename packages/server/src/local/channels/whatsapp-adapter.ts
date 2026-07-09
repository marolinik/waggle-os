/**
 * WhatsApp channel adapter — Baileys (unofficial multi-device WebSocket).
 *
 * FOUNDER-ACCEPTED RISK (2026-07-09, docs/plans/CHANNELS-ARC-2026-07-09.md):
 * Baileys is an UNOFFICIAL client that violates WhatsApp's ToS; accounts can
 * be banned. The Settings UI must show a prominent ban-risk disclosure and
 * recommend a secondary number. Do not soften or remove that copy.
 *
 * NAT-friendly: Baileys dials OUT to WhatsApp's multi-device WS. Pairing is
 * QR-scan (like WhatsApp Web): the latest QR string is held in memory and
 * surfaced through getStatus().qr → /api/channels for the UI to render.
 * Credentials persist under <dataDir>/channels/whatsapp-auth/ so pairing
 * survives restarts; DisconnectReason.loggedOut wipes them (re-pair needed).
 *
 * Baileys is loaded via dynamic import so the sidecar boots without paying
 * its (heavy: libsignal/protobuf) module cost until WhatsApp is enabled.
 */

import fs from 'node:fs';
import path from 'node:path';
import type {
  ChannelAdapter, ChannelAdapterStatus, ChannelMessage, InboundHandler,
} from './types.js';
import { chunkText } from './types.js';

/** WhatsApp accepts ~65k; 4000 keeps replies phone-readable. */
export const WHATSAPP_MAX_TEXT = 4000;
const BACKOFF_START_MS = 2_000;
const BACKOFF_CAP_MS = 60_000;

/** Status payload extended with the pairing QR (rendered by Settings UI). */
export interface WhatsAppStatus extends ChannelAdapterStatus {
  qr?: string;
  /** True when auth credentials exist on disk (paired at least once). */
  paired?: boolean;
}

// ── Minimal structural contracts over Baileys (test seam) ──────────────

interface BaileysEventMap {
  'connection.update': {
    connection?: 'close' | 'connecting' | 'open';
    qr?: string;
    lastDisconnect?: { error?: unknown };
  };
  'messages.upsert': {
    type: string;
    messages: Array<{
      key: { remoteJid?: string | null; fromMe?: boolean | null; id?: string | null; participant?: string | null };
      pushName?: string | null;
      message?: {
        conversation?: string | null;
        extendedTextMessage?: { text?: string | null } | null;
      } | null;
    }>;
  };
  'creds.update': unknown;
}

export interface WaSocketLike {
  ev: {
    on<E extends keyof BaileysEventMap>(event: E, cb: (arg: BaileysEventMap[E]) => void): void;
  };
  sendMessage(jid: string, content: { text: string }): Promise<unknown>;
  end?(err?: Error): void;
}

export type WaSocketFactory = (authDir: string, onCredsSave: () => void) => Promise<WaSocketLike>;

/** Production factory — real Baileys, dynamically imported. */
async function defaultWaSocketFactory(authDir: string): Promise<WaSocketLike> {
  const baileys = await import('@whiskeysockets/baileys');
  const { state, saveCreds } = await baileys.useMultiFileAuthState(authDir);
  const sock = baileys.makeWASocket({
    auth: state,
    // No terminal QR — the Settings UI renders it from getStatus().qr.
    printQRInTerminal: false,
    syncFullHistory: false,
  });
  sock.ev.on('creds.update', saveCreds);
  return sock as unknown as WaSocketLike;
}

/** Extract the Baileys disconnect status code (boom-style error). */
export function disconnectStatusCode(lastDisconnect?: { error?: unknown }): number | undefined {
  const err = lastDisconnect?.error as { output?: { statusCode?: number } } | undefined;
  return err?.output?.statusCode;
}

const LOGGED_OUT = 401; // DisconnectReason.loggedOut

export interface WhatsAppAdapterOptions {
  /** Channels data dir — auth state lives at <dataDir>/channels/whatsapp-auth. */
  dataDir: string;
  onMessage: InboundHandler;
  log: { info: (msg: string) => void; warn: (msg: string) => void };
  /** Test seam. */
  socketFactory?: WaSocketFactory;
  backoffCapMs?: number;
}

export class WhatsAppAdapter implements ChannelAdapter {
  readonly platform = 'whatsapp' as const;

  private readonly authDir: string;
  private readonly onMessage: InboundHandler;
  private readonly log: WhatsAppAdapterOptions['log'];
  private readonly socketFactory: WaSocketFactory;
  private readonly backoffCap: number;

  private running = false;
  private connected = false;
  private lastError: string | undefined;
  private lastActivityAt: number | undefined;
  private qr: string | undefined;
  private sock: WaSocketLike | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private backoff: number;

  constructor(opts: WhatsAppAdapterOptions) {
    this.authDir = path.join(opts.dataDir, 'channels', 'whatsapp-auth');
    this.onMessage = opts.onMessage;
    this.log = opts.log;
    this.socketFactory = opts.socketFactory ?? (dir => defaultWaSocketFactory(dir));
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
    this.qr = undefined;
  }

  getStatus(): WhatsAppStatus {
    return {
      platform: this.platform,
      running: this.running,
      connected: this.connected,
      lastError: this.lastError,
      lastActivityAt: this.lastActivityAt,
      qr: this.qr,
      paired: fs.existsSync(path.join(this.authDir, 'creds.json')),
    };
  }

  async send(chatId: string, text: string): Promise<void> {
    if (!this.sock) throw new Error('WhatsApp is not connected');
    for (const chunk of chunkText(text, WHATSAPP_MAX_TEXT)) {
      await this.sock.sendMessage(chatId, { text: chunk });
    }
  }

  // ── Connection lifecycle ─────────────────────────────────────────────

  private async connect(): Promise<void> {
    try {
      fs.mkdirSync(this.authDir, { recursive: true });
      const sock = await this.socketFactory(this.authDir, () => undefined);
      this.sock = sock;

      sock.ev.on('connection.update', update => {
        if (update.qr) {
          this.qr = update.qr;
          this.log.info('[whatsapp] pairing QR refreshed — scan it from Settings → Channels');
        }
        if (update.connection === 'open') {
          this.connected = true;
          this.qr = undefined;
          this.lastError = undefined;
          this.backoff = Math.min(BACKOFF_START_MS, this.backoffCap);
          this.lastActivityAt = Date.now();
          this.log.info('[whatsapp] connected');
        }
        if (update.connection === 'close') {
          const code = disconnectStatusCode(update.lastDisconnect);
          if (code === LOGGED_OUT) {
            // Device unlinked from the phone — credentials are dead. Wipe so
            // the next start shows a fresh QR instead of a reconnect loop.
            this.wipeAuthState();
            this.handleDrop('logged out — re-pair via QR', false);
          } else {
            this.handleDrop(`connection closed (code ${code ?? 'unknown'})`, true);
          }
        }
      });

      sock.ev.on('messages.upsert', upsert => {
        if (upsert.type !== 'notify') return;
        for (const raw of upsert.messages) {
          const msg = this.normalize(raw);
          if (!msg) continue;
          this.lastActivityAt = Date.now();
          void this.onMessage(msg).catch(e => {
            this.log.warn(`[whatsapp] inbound handler failed: ${e instanceof Error ? e.message : e}`);
          });
        }
      });
    } catch (e: unknown) {
      this.handleDrop(e instanceof Error ? e.message : String(e), true);
    }
  }

  private normalize(raw: BaileysEventMap['messages.upsert']['messages'][number]): ChannelMessage | null {
    const jid = raw.key.remoteJid;
    if (!jid || raw.key.fromMe) return null;
    if (jid === 'status@broadcast') return null;
    const text = raw.message?.conversation ?? raw.message?.extendedTextMessage?.text;
    if (!text) return null;
    // In groups the author is key.participant; in DMs it's the chat jid.
    const senderId = raw.key.participant ?? jid;
    return {
      platform: 'whatsapp',
      chatId: jid,
      senderId,
      senderName: raw.pushName ?? undefined,
      text,
      messageId: raw.key.id ?? undefined,
    };
  }

  private handleDrop(reason: string, reconnect: boolean): void {
    this.teardownSocket();
    this.connected = false;
    if (!this.running) return;
    this.lastError = reason;
    if (!reconnect) {
      this.log.warn(`[whatsapp] ${reason}`);
      return;
    }
    this.log.warn(`[whatsapp] dropped (${reason}) — reconnecting in ${this.backoff}ms`);
    this.reconnectTimer = setTimeout(() => {
      void this.connect();
    }, this.backoff);
    this.reconnectTimer.unref?.();
    this.backoff = Math.min(this.backoff * 2, this.backoffCap);
  }

  private wipeAuthState(): void {
    try {
      fs.rmSync(this.authDir, { recursive: true, force: true });
    } catch (e: unknown) {
      this.log.warn(`[whatsapp] failed to clear auth state: ${e instanceof Error ? e.message : e}`);
    }
  }

  private teardownSocket(): void {
    try {
      this.sock?.end?.(undefined);
    } catch { /* already closed */ }
    this.sock = null;
  }
}
