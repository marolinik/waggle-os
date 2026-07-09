/**
 * Telegram channel adapter — long-polling getUpdates.
 *
 * NAT-friendly by construction: the desktop reaches OUT to api.telegram.org
 * with a 50s long-poll; no webhook, no public endpoint, no tunnel. The API
 * host is hard-coded (token interpolated into the path of a fixed host), so
 * there is no SSRF surface — same posture as routes/telegram.ts, whose
 * one-way digest push this adapter complements (and shares the vault token
 * with).
 */

import type {
  ChannelAdapter, ChannelAdapterStatus, ChannelMessage, InboundHandler,
} from './types.js';
import { chunkText } from './types.js';

const TELEGRAM_API_HOST = 'https://api.telegram.org';
export const TELEGRAM_MAX_TEXT = 4096;
const POLL_TIMEOUT_S = 50;
const BACKOFF_START_MS = 1_000;
const BACKOFF_CAP_MS = 30_000;

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    text?: string;
    chat: { id: number };
    from?: { id: number; username?: string; first_name?: string };
  };
}

interface TelegramApiResponse<T> {
  ok: boolean;
  description?: string;
  result?: T;
}

export interface TelegramAdapterOptions {
  botToken: string;
  onMessage: InboundHandler;
  log: { info: (msg: string) => void; warn: (msg: string) => void };
  /** Test seam — overrides global fetch. */
  fetchImpl?: typeof fetch;
}

export class TelegramAdapter implements ChannelAdapter {
  readonly platform = 'telegram' as const;

  private readonly token: string;
  private readonly onMessage: InboundHandler;
  private readonly log: TelegramAdapterOptions['log'];
  private readonly fetchImpl: typeof fetch;

  private running = false;
  private connected = false;
  private lastError: string | undefined;
  private lastActivityAt: number | undefined;
  private offset = 0;
  private abort: AbortController | null = null;
  private loopPromise: Promise<void> | null = null;

  constructor(opts: TelegramAdapterOptions) {
    this.token = opts.botToken;
    this.onMessage = opts.onMessage;
    this.log = opts.log;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.lastError = undefined;
    this.loopPromise = this.pollLoop();
  }

  async stop(): Promise<void> {
    this.running = false;
    this.abort?.abort();
    // Wait for the in-flight poll to unwind so stop() → start() can't race
    // two loops onto one getUpdates offset.
    await this.loopPromise?.catch(() => undefined);
    this.loopPromise = null;
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
    for (const chunk of chunkText(text, TELEGRAM_MAX_TEXT)) {
      const res = await this.api<{ message_id: number }>('sendMessage', {
        chat_id: chatId,
        text: chunk,
      });
      if (!res.ok) {
        throw new Error(`Telegram sendMessage failed: ${res.description ?? 'unknown error'}`);
      }
    }
  }

  private async pollLoop(): Promise<void> {
    let backoff = BACKOFF_START_MS;
    while (this.running) {
      try {
        this.abort = new AbortController();
        const res = await this.api<TelegramUpdate[]>('getUpdates', {
          timeout: POLL_TIMEOUT_S,
          offset: this.offset,
          allowed_updates: ['message'],
        }, this.abort.signal, (POLL_TIMEOUT_S + 10) * 1000);

        if (!res.ok) throw new Error(res.description ?? 'getUpdates failed');
        this.connected = true;
        this.lastError = undefined;
        this.lastActivityAt = Date.now();
        backoff = BACKOFF_START_MS;

        for (const update of res.result ?? []) {
          this.offset = Math.max(this.offset, update.update_id + 1);
          const msg = this.normalize(update);
          if (!msg) continue;
          // Inbound handling must never kill the poll loop.
          await this.onMessage(msg).catch(e => {
            this.log.warn(`[telegram] inbound handler failed: ${e instanceof Error ? e.message : e}`);
          });
        }
      } catch (e: unknown) {
        if (!this.running) break; // stop() aborted the in-flight poll
        this.connected = false;
        this.lastError = e instanceof Error ? e.message : String(e);
        this.log.warn(`[telegram] poll error, backing off ${backoff}ms: ${this.lastError}`);
        await new Promise(r => setTimeout(r, backoff));
        backoff = Math.min(backoff * 2, BACKOFF_CAP_MS);
      }
    }
    this.connected = false;
  }

  private normalize(update: TelegramUpdate): ChannelMessage | null {
    const m = update.message;
    if (!m?.text || !m.from) return null;
    return {
      platform: 'telegram',
      chatId: String(m.chat.id),
      senderId: String(m.from.id),
      senderName: m.from.username ?? m.from.first_name,
      text: m.text,
      messageId: String(m.message_id),
    };
  }

  private async api<T>(
    method: string,
    body: Record<string, unknown>,
    signal?: AbortSignal,
    timeoutMs = 30_000,
  ): Promise<TelegramApiResponse<T>> {
    const url = `${TELEGRAM_API_HOST}/bot${encodeURIComponent(this.token)}/${method}`;
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const r = await this.fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal,
    });
    return await r.json() as TelegramApiResponse<T>;
  }
}
