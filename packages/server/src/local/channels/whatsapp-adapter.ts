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
 * Credentials persist as one encrypted Vault entry so pairing survives
 * restarts without leaving Baileys session keys as plaintext JSON. Existing
 * <dataDir>/channels/whatsapp-auth data is migrated once and then removed.
 * DisconnectReason.loggedOut wipes the Vault entry (re-pair needed).
 *
 * Baileys is loaded via dynamic import so the sidecar boots without paying
 * its (heavy: libsignal/protobuf) module cost until WhatsApp is enabled.
 */

import fs from 'node:fs';
import path from 'node:path';
import type {
  AuthenticationState, SignalDataSet, SignalDataTypeMap,
} from '@whiskeysockets/baileys';
import type {
  ChannelAdapter, ChannelAdapterStatus, ChannelMessage, InboundHandler,
} from './types.js';
import { chunkText } from './types.js';

/** WhatsApp accepts ~65k; 4000 keeps replies phone-readable. */
export const WHATSAPP_MAX_TEXT = 4000;
export const WHATSAPP_AUTH_VAULT_KEY = 'channel:whatsapp:auth-state';
const BACKOFF_START_MS = 2_000;
const BACKOFF_CAP_MS = 60_000;

export interface WhatsAppAuthVault {
  get(key: string): { value: string } | null | undefined;
  has(key: string): boolean;
  set(key: string, value: string, metadata?: Record<string, unknown>): void;
  delete(key: string): boolean;
}

interface StoredWhatsAppAuth {
  version: 1;
  creds: AuthenticationState['creds'];
  keys: Array<[string, unknown]>;
}

type BaileysModule = typeof import('@whiskeysockets/baileys');

const SIGNAL_KEY_TYPES: Array<keyof SignalDataTypeMap> = [
  'app-state-sync-version',
  'app-state-sync-key',
  'sender-key-memory',
  'sender-key',
  'identity-key',
  'lid-mapping',
  'device-list',
  'pre-key',
  'session',
  'tctoken',
];

function fixLegacyFileName(value: string): string {
  return value.replace(/\//g, '__').replace(/:/g, '-');
}

function signalStoreKey(type: keyof SignalDataTypeMap, id: string): string {
  return `${type}:${fixLegacyFileName(id)}`;
}

function parseStoredAuth(raw: string, baileys: BaileysModule): StoredWhatsAppAuth | null {
  try {
    const parsed = JSON.parse(raw, baileys.BufferJSON.reviver) as Partial<StoredWhatsAppAuth>;
    if (parsed.version !== 1 || !parsed.creds || !Array.isArray(parsed.keys)) return null;
    const keys = parsed.keys.filter((entry): entry is [string, unknown] => (
      Array.isArray(entry) && entry.length === 2 && typeof entry[0] === 'string'
    ));
    return { version: 1, creds: parsed.creds, keys };
  } catch {
    return null;
  }
}

function readLegacyAuth(authDir: string, baileys: BaileysModule): StoredWhatsAppAuth | null {
  const credsPath = path.join(authDir, 'creds.json');
  if (!fs.existsSync(credsPath)) return null;
  try {
    const creds = JSON.parse(
      fs.readFileSync(credsPath, 'utf8'),
      baileys.BufferJSON.reviver,
    ) as AuthenticationState['creds'];
    const keys: Array<[string, unknown]> = [];
    for (const file of fs.readdirSync(authDir)) {
      if (file === 'creds.json' || !file.endsWith('.json')) continue;
      const base = file.slice(0, -'.json'.length);
      const type = SIGNAL_KEY_TYPES.find(candidate => base.startsWith(`${candidate}-`));
      if (!type) continue;
      const id = base.slice(type.length + 1);
      const value = JSON.parse(
        fs.readFileSync(path.join(authDir, file), 'utf8'),
        baileys.BufferJSON.reviver,
      ) as unknown;
      keys.push([`${type}:${id}`, value]);
    }
    return { version: 1, creds, keys };
  } catch {
    return null;
  }
}

/** Baileys AuthenticationState backed entirely by Waggle's encrypted Vault. */
export async function useVaultWhatsAppAuthState(
  vault: WhatsAppAuthVault,
  legacyAuthDir: string,
): Promise<{ state: AuthenticationState; saveCreds: () => void }> {
  const baileys = await import('@whiskeysockets/baileys');
  const storedExists = vault.has(WHATSAPP_AUTH_VAULT_KEY);
  const storedEntry = vault.get(WHATSAPP_AUTH_VAULT_KEY);
  const stored = storedEntry ? parseStoredAuth(storedEntry.value, baileys) : null;
  if (storedExists && !stored) {
    throw new Error('Encrypted WhatsApp auth state is unreadable; pairing state was left untouched');
  }
  const legacyExists = fs.existsSync(path.join(legacyAuthDir, 'creds.json'));
  const legacy = stored ? null : readLegacyAuth(legacyAuthDir, baileys);
  if (!stored && legacyExists && !legacy) {
    throw new Error('Legacy WhatsApp auth state could not be migrated; plaintext state was left untouched');
  }
  const creds = stored?.creds ?? legacy?.creds ?? baileys.initAuthCreds();
  const keyStore = new Map<string, unknown>(stored?.keys ?? legacy?.keys ?? []);

  const persist = (): void => {
    const payload: StoredWhatsAppAuth = {
      version: 1,
      creds,
      keys: [...keyStore.entries()],
    };
    vault.set(
      WHATSAPP_AUTH_VAULT_KEY,
      JSON.stringify(payload, baileys.BufferJSON.replacer),
      { kind: 'whatsapp-auth-state', encryptedAtRest: true },
    );
  };

  if (legacy) {
    // Delete plaintext only after the encrypted write succeeds.
    persist();
    fs.rmSync(legacyAuthDir, { recursive: true, force: true });
  } else if (stored && fs.existsSync(legacyAuthDir)) {
    // Vault is authoritative; remove any stale plaintext residue.
    fs.rmSync(legacyAuthDir, { recursive: true, force: true });
  }

  const state: AuthenticationState = {
    creds,
    keys: {
      get: async <T extends keyof SignalDataTypeMap>(type: T, ids: string[]) => {
        const result = {} as Record<string, SignalDataTypeMap[T]>;
        for (const id of ids) {
          let value = keyStore.get(signalStoreKey(type, id));
          if (type === 'app-state-sync-key' && value) {
            value = baileys.proto.Message.AppStateSyncKeyData.fromObject(value as object);
          }
          result[id] = value as SignalDataTypeMap[T];
        }
        return result;
      },
      set: async (data: SignalDataSet) => {
        const categories = data as Record<string, Record<string, unknown | null> | undefined>;
        for (const [category, values] of Object.entries(categories)) {
          if (!values) continue;
          for (const [id, value] of Object.entries(values)) {
            const key = signalStoreKey(category as keyof SignalDataTypeMap, id);
            if (value === null) keyStore.delete(key);
            else keyStore.set(key, value);
          }
        }
        persist();
      },
    },
  };

  return { state, saveCreds: persist };
}

/** Status payload extended with the pairing QR (rendered by Settings UI). */
export interface WhatsAppStatus extends ChannelAdapterStatus {
  qr?: string;
  /** True when registered auth credentials exist in the encrypted Vault. */
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

export type WaSocketFactory = (
  vault: WhatsAppAuthVault,
  legacyAuthDir: string,
  onAuthError: (error: unknown) => void,
) => Promise<WaSocketLike>;

interface BaileysLogger {
  level: string;
  child(fields: Record<string, unknown>): BaileysLogger;
  trace(value: unknown, message?: string): void;
  debug(value: unknown, message?: string): void;
  info(value: unknown, message?: string): void;
  warn(value: unknown, message?: string): void;
  error(value: unknown, message?: string): void;
}

const silentBaileysLogger: BaileysLogger = {
  level: 'silent',
  child: () => silentBaileysLogger,
  trace: () => undefined,
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

/** Production factory — real Baileys, dynamically imported. */
async function defaultWaSocketFactory(
  vault: WhatsAppAuthVault,
  legacyAuthDir: string,
  onAuthError: (error: unknown) => void,
): Promise<WaSocketLike> {
  const baileys = await import('@whiskeysockets/baileys');
  const { state, saveCreds } = await useVaultWhatsAppAuthState(vault, legacyAuthDir);
  const sock = baileys.makeWASocket({
    auth: state,
    logger: silentBaileysLogger,
    // No terminal QR — the Settings UI renders it from getStatus().qr.
    printQRInTerminal: false,
    syncFullHistory: false,
  });
  sock.ev.on('creds.update', () => {
    try {
      saveCreds();
    } catch (error) {
      onAuthError(error);
    }
  });
  return sock as unknown as WaSocketLike;
}

/** Extract the Baileys disconnect status code (boom-style error). */
export function disconnectStatusCode(lastDisconnect?: { error?: unknown }): number | undefined {
  const err = lastDisconnect?.error as { output?: { statusCode?: number } } | undefined;
  return err?.output?.statusCode;
}

const LOGGED_OUT = 401; // DisconnectReason.loggedOut

export interface WhatsAppAdapterOptions {
  /** Channels data dir, used only to migrate/remove legacy plaintext state. */
  dataDir: string;
  /** Encrypted store for all Baileys credentials and signal keys. */
  vault: WhatsAppAuthVault;
  onMessage: InboundHandler;
  log: { info: (msg: string) => void; warn: (msg: string) => void };
  /** Test seam. */
  socketFactory?: WaSocketFactory;
  backoffCapMs?: number;
}

export class WhatsAppAdapter implements ChannelAdapter {
  readonly platform = 'whatsapp' as const;

  private readonly legacyAuthDir: string;
  private readonly vault: WhatsAppAuthVault;
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
    this.legacyAuthDir = path.join(opts.dataDir, 'channels', 'whatsapp-auth');
    this.vault = opts.vault;
    this.onMessage = opts.onMessage;
    this.log = opts.log;
    this.socketFactory = opts.socketFactory ?? defaultWaSocketFactory;
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
      paired: this.hasPersistedAuth(),
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
      const sock = await this.socketFactory(this.vault, this.legacyAuthDir, error => {
        const message = error instanceof Error ? error.message : String(error);
        this.lastError = `Could not save encrypted WhatsApp session: ${message}`;
        this.log.warn(`[whatsapp] ${this.lastError}`);
      });
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
      this.vault.delete(WHATSAPP_AUTH_VAULT_KEY);
      fs.rmSync(this.legacyAuthDir, { recursive: true, force: true });
    } catch (e: unknown) {
      this.log.warn(`[whatsapp] failed to clear auth state: ${e instanceof Error ? e.message : e}`);
    }
  }

  private hasPersistedAuth(): boolean {
    const entry = this.vault.get(WHATSAPP_AUTH_VAULT_KEY);
    if (entry) {
      try {
        const parsed = JSON.parse(entry.value) as { creds?: { registered?: boolean } };
        return parsed.creds?.registered === true;
      } catch {
        return false;
      }
    }
    // Compatibility during the one-time migration window.
    return fs.existsSync(path.join(this.legacyAuthDir, 'creds.json'));
  }

  private teardownSocket(): void {
    try {
      this.sock?.end?.(undefined);
    } catch { /* already closed */ }
    this.sock = null;
  }
}
