/**
 * WhatsAppAdapter — QR surfacing, message normalization (DM + group,
 * fromMe/status filtering), logged-out auth wipe vs transient reconnect,
 * chunked send (CHANNELS-ARC P3). Fake Baileys socket; no network, no
 * real Baileys import.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { BufferJSON, initAuthCreds } from '@whiskeysockets/baileys';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  WhatsAppAdapter,
  WHATSAPP_AUTH_VAULT_KEY,
  WHATSAPP_MAX_TEXT,
  disconnectStatusCode,
  useVaultWhatsAppAuthState,
} from '../src/local/channels/whatsapp-adapter.js';
import type { WaSocketLike } from '../src/local/channels/whatsapp-adapter.js';
import type { ChannelMessage } from '../src/local/channels/types.js';

const noopLog = { info: () => undefined, warn: () => undefined };

class FakeAuthVault {
  readonly entries = new Map<string, string>();
  get(key: string) {
    const value = this.entries.get(key);
    return value === undefined ? null : { value };
  }
  has(key: string): boolean { return this.entries.has(key); }
  set(key: string, value: string): void { this.entries.set(key, value); }
  delete(key: string): boolean { return this.entries.delete(key); }
}

type Handler = (arg: unknown) => void;

class FakeWaSocket implements WaSocketLike {
  sends: Array<{ jid: string; text: string }> = [];
  ended = false;
  private handlers = new Map<string, Handler[]>();

  ev = {
    on: (event: string, cb: Handler): void => {
      this.handlers.set(event, [...(this.handlers.get(event) ?? []), cb]);
    },
  } as WaSocketLike['ev'];

  async sendMessage(jid: string, content: { text: string }): Promise<unknown> {
    this.sends.push({ jid, text: content.text });
    return {};
  }

  end(): void {
    this.ended = true;
  }

  emit(event: string, arg: unknown): void {
    for (const cb of this.handlers.get(event) ?? []) cb(arg);
  }
}

function loggedOutError(code: number): { error: unknown } {
  return { error: { output: { statusCode: code } } };
}

let dir: string;
let adapter: WhatsAppAdapter | null = null;

function makeAdapter() {
  const sockets: FakeWaSocket[] = [];
  const received: ChannelMessage[] = [];
  const vault = new FakeAuthVault();
  const a = new WhatsAppAdapter({
    dataDir: dir,
    vault,
    onMessage: async m => { received.push(m); },
    log: noopLog,
    socketFactory: async () => {
      const s = new FakeWaSocket();
      sockets.push(s);
      return s;
    },
    backoffCapMs: 10,
  });
  return { a, sockets, received, vault };
}

async function tick(ms = 30): Promise<void> {
  await new Promise(r => setTimeout(r, ms));
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-wa-'));
});

afterEach(async () => {
  await adapter?.stop();
  adapter = null;
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('WhatsAppAdapter pairing + status', () => {
  it('surfaces the QR through status and clears it once connected', async () => {
    const ctx = makeAdapter();
    adapter = ctx.a;
    await adapter.start();
    ctx.sockets[0].emit('connection.update', { qr: 'QR-DATA-1' });
    expect(adapter.getStatus().qr).toBe('QR-DATA-1');
    expect(adapter.getStatus().connected).toBe(false);

    ctx.sockets[0].emit('connection.update', { connection: 'open' });
    expect(adapter.getStatus().connected).toBe(true);
    expect(adapter.getStatus().qr).toBeUndefined();
  });

  it('reports paired=true when creds.json exists on disk', async () => {
    const ctx = makeAdapter();
    adapter = ctx.a;
    await adapter.start();
    expect(adapter.getStatus().paired).toBe(false);
    fs.mkdirSync(path.join(dir, 'channels', 'whatsapp-auth'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'channels', 'whatsapp-auth', 'creds.json'), '{}', 'utf8');
    expect(adapter.getStatus().paired).toBe(true);
  });

  it('reports paired=true from registered encrypted Vault credentials', async () => {
    const ctx = makeAdapter();
    ctx.vault.set(WHATSAPP_AUTH_VAULT_KEY, JSON.stringify({
      version: 1,
      creds: { registered: true },
      keys: [],
    }));
    adapter = ctx.a;
    await adapter.start();
    expect(adapter.getStatus().paired).toBe(true);
  });
});

describe('WhatsApp encrypted auth state', () => {
  it('persists and reloads credentials and signal keys without plaintext files', async () => {
    const vault = new FakeAuthVault();
    const legacyDir = path.join(dir, 'channels', 'whatsapp-auth');
    const first = await useVaultWhatsAppAuthState(vault, legacyDir);
    first.state.creds.registered = true;
    await first.state.keys.set({
      'pre-key': {
        '7': { private: Buffer.from([1, 2]), public: Buffer.from([3, 4]) },
      },
    });
    first.saveCreds();

    expect(vault.entries.has(WHATSAPP_AUTH_VAULT_KEY)).toBe(true);
    expect(fs.existsSync(legacyDir)).toBe(false);

    const reloaded = await useVaultWhatsAppAuthState(vault, legacyDir);
    const keys = await reloaded.state.keys.get('pre-key', ['7']);
    expect(reloaded.state.creds.registered).toBe(true);
    expect(Buffer.from(keys['7'].private)).toEqual(Buffer.from([1, 2]));
    expect(Buffer.from(keys['7'].public)).toEqual(Buffer.from([3, 4]));
  });

  it('migrates a legacy multi-file pairing before deleting plaintext', async () => {
    const vault = new FakeAuthVault();
    const legacyDir = path.join(dir, 'channels', 'whatsapp-auth');
    fs.mkdirSync(legacyDir, { recursive: true });
    const creds = initAuthCreds();
    creds.registered = true;
    fs.writeFileSync(
      path.join(legacyDir, 'creds.json'),
      JSON.stringify(creds, BufferJSON.replacer),
      'utf8',
    );
    fs.writeFileSync(
      path.join(legacyDir, 'pre-key-9.json'),
      JSON.stringify({ private: Buffer.from([5]), public: Buffer.from([6]) }, BufferJSON.replacer),
      'utf8',
    );

    const migrated = await useVaultWhatsAppAuthState(vault, legacyDir);
    const keys = await migrated.state.keys.get('pre-key', ['9']);

    expect(migrated.state.creds.registered).toBe(true);
    expect(Buffer.from(keys['9'].private)).toEqual(Buffer.from([5]));
    expect(vault.entries.has(WHATSAPP_AUTH_VAULT_KEY)).toBe(true);
    expect(fs.existsSync(legacyDir)).toBe(false);
  });

  it('fails closed and preserves unreadable encrypted state', async () => {
    const vault = new FakeAuthVault();
    const legacyDir = path.join(dir, 'channels', 'whatsapp-auth');
    vault.set(WHATSAPP_AUTH_VAULT_KEY, '{broken');

    await expect(useVaultWhatsAppAuthState(vault, legacyDir)).rejects.toThrow(/unreadable/i);

    expect(vault.entries.get(WHATSAPP_AUTH_VAULT_KEY)).toBe('{broken');
  });

  it('fails closed and preserves legacy files when migration cannot parse them', async () => {
    const vault = new FakeAuthVault();
    const legacyDir = path.join(dir, 'channels', 'whatsapp-auth');
    fs.mkdirSync(legacyDir, { recursive: true });
    fs.writeFileSync(path.join(legacyDir, 'creds.json'), '{broken', 'utf8');

    await expect(useVaultWhatsAppAuthState(vault, legacyDir)).rejects.toThrow(/could not be migrated/i);

    expect(fs.existsSync(path.join(legacyDir, 'creds.json'))).toBe(true);
    expect(vault.entries.has(WHATSAPP_AUTH_VAULT_KEY)).toBe(false);
  });
});

describe('WhatsAppAdapter inbound', () => {
  it('normalizes a DM: sender = chat jid', async () => {
    const ctx = makeAdapter();
    adapter = ctx.a;
    await adapter.start();
    ctx.sockets[0].emit('messages.upsert', {
      type: 'notify',
      messages: [{
        key: { remoteJid: '3816x@s.whatsapp.net', fromMe: false, id: 'm1' },
        pushName: 'Marko',
        message: { conversation: 'zdravo' },
      }],
    });
    await tick(5);
    expect(ctx.received[0]).toEqual({
      platform: 'whatsapp',
      chatId: '3816x@s.whatsapp.net',
      senderId: '3816x@s.whatsapp.net',
      senderName: 'Marko',
      text: 'zdravo',
      messageId: 'm1',
    });
  });

  it('normalizes a group message: sender = participant', async () => {
    const ctx = makeAdapter();
    adapter = ctx.a;
    await adapter.start();
    ctx.sockets[0].emit('messages.upsert', {
      type: 'notify',
      messages: [{
        key: { remoteJid: 'grp@g.us', fromMe: false, id: 'm2', participant: 'u9@s.whatsapp.net' },
        message: { extendedTextMessage: { text: 'group hi' } },
      }],
    });
    await tick(5);
    expect(ctx.received[0]?.senderId).toBe('u9@s.whatsapp.net');
    expect(ctx.received[0]?.chatId).toBe('grp@g.us');
    expect(ctx.received[0]?.text).toBe('group hi');
  });

  it('filters own messages, status broadcasts, non-notify batches, and non-text', async () => {
    const ctx = makeAdapter();
    adapter = ctx.a;
    await adapter.start();
    const s = ctx.sockets[0];
    s.emit('messages.upsert', {
      type: 'notify',
      messages: [
        { key: { remoteJid: 'a@s.whatsapp.net', fromMe: true, id: '1' }, message: { conversation: 'me' } },
        { key: { remoteJid: 'status@broadcast', fromMe: false, id: '2' }, message: { conversation: 's' } },
        { key: { remoteJid: 'b@s.whatsapp.net', fromMe: false, id: '3' }, message: {} },
      ],
    });
    s.emit('messages.upsert', {
      type: 'append',
      messages: [{ key: { remoteJid: 'c@s.whatsapp.net', fromMe: false, id: '4' }, message: { conversation: 'history' } }],
    });
    await tick(5);
    expect(ctx.received).toEqual([]);
  });
});

describe('WhatsAppAdapter disconnects', () => {
  it('reconnects on transient close codes', async () => {
    const ctx = makeAdapter();
    adapter = ctx.a;
    await adapter.start();
    ctx.sockets[0].emit('connection.update', { connection: 'open' });
    ctx.sockets[0].emit('connection.update', {
      connection: 'close',
      lastDisconnect: loggedOutError(408), // timeout — transient
    });
    await tick(50);
    expect(ctx.sockets.length).toBeGreaterThanOrEqual(2);
  });

  it('wipes auth state and does NOT reconnect on loggedOut (401)', async () => {
    const ctx = makeAdapter();
    adapter = ctx.a;
    await adapter.start();
    const authDir = path.join(dir, 'channels', 'whatsapp-auth');
    fs.mkdirSync(authDir, { recursive: true });
    fs.writeFileSync(path.join(authDir, 'creds.json'), '{}', 'utf8');
    ctx.vault.set(WHATSAPP_AUTH_VAULT_KEY, JSON.stringify({
      version: 1,
      creds: { registered: true },
      keys: [],
    }));

    ctx.sockets[0].emit('connection.update', { connection: 'open' });
    ctx.sockets[0].emit('connection.update', {
      connection: 'close',
      lastDisconnect: loggedOutError(401),
    });
    await tick(50);
    expect(ctx.sockets.length).toBe(1); // no reconnect
    expect(fs.existsSync(path.join(authDir, 'creds.json'))).toBe(false);
    expect(ctx.vault.entries.has(WHATSAPP_AUTH_VAULT_KEY)).toBe(false);
    expect(adapter.getStatus().lastError).toMatch(/re-pair/i);
  });

  it('stop() ends the socket and halts reconnection', async () => {
    const ctx = makeAdapter();
    adapter = ctx.a;
    await adapter.start();
    ctx.sockets[0].emit('connection.update', { connection: 'open' });
    await adapter.stop();
    expect(ctx.sockets[0].ended).toBe(true);
    ctx.sockets[0].emit('connection.update', { connection: 'close', lastDisconnect: loggedOutError(408) });
    await tick(50);
    expect(ctx.sockets.length).toBe(1);
    adapter = null;
  });
});

describe('WhatsAppAdapter send', () => {
  it('chunks long text and targets the jid', async () => {
    const ctx = makeAdapter();
    adapter = ctx.a;
    await adapter.start();
    await adapter.send('x@s.whatsapp.net', 'w'.repeat(WHATSAPP_MAX_TEXT + 50));
    expect(ctx.sockets[0].sends.length).toBe(2);
    expect(ctx.sockets[0].sends[0].jid).toBe('x@s.whatsapp.net');
  });

  it('throws when not connected', async () => {
    const ctx = makeAdapter();
    adapter = ctx.a;
    await expect(adapter.send('x@s.whatsapp.net', 'hi')).rejects.toThrow(/not connected/);
  });
});

describe('disconnectStatusCode', () => {
  it('extracts boom-style status codes and tolerates garbage', () => {
    expect(disconnectStatusCode(loggedOutError(401))).toBe(401);
    expect(disconnectStatusCode({ error: new Error('plain') })).toBeUndefined();
    expect(disconnectStatusCode(undefined)).toBeUndefined();
  });
});
