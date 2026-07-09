/**
 * DiscordAdapter — gateway handshake (HELLO→IDENTIFY→READY), heartbeats,
 * MESSAGE_CREATE normalization, bot-echo filtering, reconnect, chunked REST
 * send (CHANNELS-ARC P2). Fake ws + fetch; no network.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { DiscordAdapter, DISCORD_INTENTS, DISCORD_MAX_TEXT } from '../src/local/channels/discord-adapter.js';
import type { ChannelMessage, WsLike } from '../src/local/channels/types.js';

const noopLog = { info: () => undefined, warn: () => undefined };

class FakeWs implements WsLike {
  sent: Array<Record<string, unknown>> = [];
  closed = false;
  private handlers = new Map<string, Array<(...args: unknown[]) => void>>();

  on(event: string, cb: (...args: unknown[]) => void): void {
    this.handlers.set(event, [...(this.handlers.get(event) ?? []), cb]);
  }

  send(data: string): void {
    this.sent.push(JSON.parse(data) as Record<string, unknown>);
  }

  close(): void {
    this.closed = true;
  }

  emit(event: string, ...args: unknown[]): void {
    for (const cb of this.handlers.get(event) ?? []) cb(...args);
  }

  serverSend(frame: unknown): void {
    this.emit('message', JSON.stringify(frame));
  }
}

function makeAdapter(overrides: { onMessage?: (m: ChannelMessage) => Promise<void> } = {}) {
  const sockets: FakeWs[] = [];
  const restCalls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl = (async (url: RequestInfo | URL, init?: RequestInit) => {
    restCalls.push({ url: String(url), init });
    if (String(url).endsWith('/gateway/bot')) {
      return new Response(JSON.stringify({ url: 'wss://gateway.discord.gg' }));
    }
    return new Response(JSON.stringify({ id: 'sent' }), { status: 200 });
  }) as typeof fetch;
  const received: ChannelMessage[] = [];
  const adapter = new DiscordAdapter({
    botToken: 'bot-token',
    onMessage: overrides.onMessage ?? (async m => { received.push(m); }),
    log: noopLog,
    fetchImpl,
    wsFactory: url => {
      void url;
      const ws = new FakeWs();
      sockets.push(ws);
      return ws;
    },
    backoffCapMs: 10,
  });
  return { adapter, sockets, restCalls, received };
}

async function tick(ms = 10): Promise<void> {
  await new Promise(r => setTimeout(r, ms));
}

/** Drive HELLO → IDENTIFY → READY on the given socket. */
function handshake(ws: FakeWs, botUserId = 'bot-1'): void {
  ws.serverSend({ op: 10, d: { heartbeat_interval: 100_000 } });
  ws.serverSend({ op: 0, t: 'READY', s: 1, d: { user: { id: botUserId } } });
}

let adapter: DiscordAdapter | null = null;

afterEach(async () => {
  await adapter?.stop();
  adapter = null;
  vi.restoreAllMocks();
});

describe('DiscordAdapter gateway', () => {
  it('identifies with the required intents after HELLO and reports connected after READY', async () => {
    const ctx = makeAdapter();
    adapter = ctx.adapter;
    await adapter.start();
    await tick();
    const ws = ctx.sockets[0];
    handshake(ws);

    const identify = ws.sent.find(f => f.op === 2);
    expect(identify).toBeDefined();
    expect((identify?.d as { token: string; intents: number }).token).toBe('bot-token');
    expect((identify?.d as { intents: number }).intents).toBe(DISCORD_INTENTS);
    expect(adapter.getStatus().connected).toBe(true);
  });

  it('normalizes MESSAGE_CREATE into ChannelMessage', async () => {
    const ctx = makeAdapter();
    adapter = ctx.adapter;
    await adapter.start();
    await tick();
    const ws = ctx.sockets[0];
    handshake(ws);
    ws.serverSend({
      op: 0, t: 'MESSAGE_CREATE', s: 2,
      d: { id: 'm1', channel_id: 'c1', content: 'hello', author: { id: 'u1', username: 'marko' } },
    });
    await tick();
    expect(ctx.received[0]).toEqual({
      platform: 'discord', chatId: 'c1', senderId: 'u1',
      senderName: 'marko', text: 'hello', messageId: 'm1',
    });
  });

  it('ignores its own messages and other bots', async () => {
    const ctx = makeAdapter();
    adapter = ctx.adapter;
    await adapter.start();
    await tick();
    const ws = ctx.sockets[0];
    handshake(ws, 'bot-1');
    ws.serverSend({
      op: 0, t: 'MESSAGE_CREATE', s: 2,
      d: { id: 'm1', channel_id: 'c1', content: 'echo', author: { id: 'bot-1' } },
    });
    ws.serverSend({
      op: 0, t: 'MESSAGE_CREATE', s: 3,
      d: { id: 'm2', channel_id: 'c1', content: 'bot msg', author: { id: 'u9', bot: true } },
    });
    await tick();
    expect(ctx.received).toEqual([]);
  });

  it('answers a server heartbeat request with the last seq', async () => {
    const ctx = makeAdapter();
    adapter = ctx.adapter;
    await adapter.start();
    await tick();
    const ws = ctx.sockets[0];
    handshake(ws);
    ws.serverSend({ op: 0, t: 'MESSAGE_CREATE', s: 7, d: { id: 'x', channel_id: 'c', content: 'q', author: { id: 'u' } } });
    ws.serverSend({ op: 1 });
    const hb = ws.sent.filter(f => f.op === 1).pop();
    expect(hb?.d).toBe(7);
  });

  it('reconnects with a fresh IDENTIFY on op 7 RECONNECT', async () => {
    const ctx = makeAdapter();
    adapter = ctx.adapter;
    await adapter.start();
    await tick();
    handshake(ctx.sockets[0]);
    ctx.sockets[0].serverSend({ op: 7 });
    await tick(50);
    expect(ctx.sockets.length).toBeGreaterThanOrEqual(2);
    expect(ctx.sockets[0].closed).toBe(true);
    handshake(ctx.sockets[1]);
    expect(ctx.sockets[1].sent.some(f => f.op === 2)).toBe(true);
    expect(adapter.getStatus().connected).toBe(true);
  });

  it('reconnects when the socket closes unexpectedly', async () => {
    const ctx = makeAdapter();
    adapter = ctx.adapter;
    await adapter.start();
    await tick();
    handshake(ctx.sockets[0]);
    ctx.sockets[0].emit('close');
    await tick(50);
    expect(ctx.sockets.length).toBeGreaterThanOrEqual(2);
  });

  it('stop() halts reconnection and closes the socket', async () => {
    const ctx = makeAdapter();
    adapter = ctx.adapter;
    await adapter.start();
    await tick();
    handshake(ctx.sockets[0]);
    await adapter.stop();
    ctx.sockets[0].emit('close');
    await tick(50);
    expect(ctx.sockets.length).toBe(1);
    expect(adapter.getStatus()).toMatchObject({ running: false, connected: false });
    adapter = null;
  });
});

describe('DiscordAdapter send', () => {
  it('POSTs to the channel messages endpoint with the bot token', async () => {
    const ctx = makeAdapter();
    adapter = ctx.adapter;
    await adapter.send('chan-5', 'hi there');
    const call = ctx.restCalls.find(c => c.url.includes('/channels/chan-5/messages'));
    expect(call).toBeDefined();
    expect((call?.init?.headers as Record<string, string>).Authorization).toBe('Bot bot-token');
    expect(JSON.parse(String(call?.init?.body))).toEqual({ content: 'hi there' });
  });

  it('chunks above the 2000-char Discord limit', async () => {
    const ctx = makeAdapter();
    adapter = ctx.adapter;
    await adapter.send('chan-5', 'y'.repeat(DISCORD_MAX_TEXT * 2 + 5));
    const sends = ctx.restCalls.filter(c => c.url.includes('/messages'));
    expect(sends.length).toBeGreaterThanOrEqual(3);
  });

  it('surfaces REST failures', async () => {
    const fetchImpl = (async () => new Response('missing access', { status: 403 })) as typeof fetch;
    adapter = new DiscordAdapter({
      botToken: 't', onMessage: async () => undefined, log: noopLog,
      fetchImpl, wsFactory: () => new FakeWs(),
    });
    await expect(adapter.send('c', 'hi')).rejects.toThrow(/HTTP 403/);
  });
});
