/**
 * SlackAdapter — Socket Mode connect, envelope acking, message
 * normalization + subtype/bot filtering, disconnect-refresh reconnect,
 * chat.postMessage send (CHANNELS-ARC P2). Fake ws + fetch; no network.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { SlackAdapter, SLACK_MAX_TEXT } from '../src/local/channels/slack-adapter.js';
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

  serverSend(envelope: unknown): void {
    this.emit('message', JSON.stringify(envelope));
  }
}

function makeAdapter() {
  const sockets: FakeWs[] = [];
  const restCalls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl = (async (url: RequestInfo | URL, init?: RequestInit) => {
    restCalls.push({ url: String(url), init });
    if (String(url).endsWith('/apps.connections.open')) {
      return new Response(JSON.stringify({ ok: true, url: 'wss://wss.slack.com/link' }));
    }
    return new Response(JSON.stringify({ ok: true }));
  }) as typeof fetch;
  const received: ChannelMessage[] = [];
  const adapter = new SlackAdapter({
    appToken: 'xapp-1',
    botToken: 'xoxb-1',
    onMessage: async m => { received.push(m); },
    log: noopLog,
    fetchImpl,
    wsFactory: () => {
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

let adapter: SlackAdapter | null = null;

afterEach(async () => {
  await adapter?.stop();
  adapter = null;
  vi.restoreAllMocks();
});

describe('SlackAdapter socket mode', () => {
  it('opens a connection with the app token and reports connected on hello', async () => {
    const ctx = makeAdapter();
    adapter = ctx.adapter;
    await adapter.start();
    await tick();
    const open = ctx.restCalls.find(c => c.url.endsWith('/apps.connections.open'));
    expect((open?.init?.headers as Record<string, string>).Authorization).toBe('Bearer xapp-1');
    ctx.sockets[0].serverSend({ type: 'hello' });
    expect(adapter.getStatus().connected).toBe(true);
  });

  it('acks every enveloped event by envelope_id BEFORE processing', async () => {
    const ctx = makeAdapter();
    adapter = ctx.adapter;
    await adapter.start();
    await tick();
    const ws = ctx.sockets[0];
    ws.serverSend({ type: 'hello' });
    ws.serverSend({
      envelope_id: 'env-1',
      type: 'events_api',
      payload: { event: { type: 'message', user: 'U1', channel: 'C1', text: 'hi', ts: '1.1' } },
    });
    expect(ws.sent).toContainEqual({ envelope_id: 'env-1' });
    await tick();
    expect(ctx.received[0]).toEqual({
      platform: 'slack', chatId: 'C1', senderId: 'U1', text: 'hi', messageId: '1.1',
    });
  });

  it('filters subtypes, bot messages, and channel-less events', async () => {
    const ctx = makeAdapter();
    adapter = ctx.adapter;
    await adapter.start();
    await tick();
    const ws = ctx.sockets[0];
    ws.serverSend({ type: 'hello' });
    ws.serverSend({
      envelope_id: 'e1', type: 'events_api',
      payload: { event: { type: 'message', subtype: 'message_changed', user: 'U1', channel: 'C1', text: 'edited' } },
    });
    ws.serverSend({
      envelope_id: 'e2', type: 'events_api',
      payload: { event: { type: 'message', bot_id: 'B9', channel: 'C1', text: 'bot echo' } },
    });
    ws.serverSend({
      envelope_id: 'e3', type: 'events_api',
      payload: { event: { type: 'reaction_added', user: 'U1' } },
    });
    await tick();
    expect(ctx.received).toEqual([]);
    // Still acked all three — unacked envelopes get redelivered.
    expect(ws.sent).toEqual(expect.arrayContaining([
      { envelope_id: 'e1' }, { envelope_id: 'e2' }, { envelope_id: 'e3' },
    ]));
  });

  it('reconnects on the routine disconnect envelope', async () => {
    const ctx = makeAdapter();
    adapter = ctx.adapter;
    await adapter.start();
    await tick();
    ctx.sockets[0].serverSend({ type: 'hello' });
    ctx.sockets[0].serverSend({ type: 'disconnect', reason: 'refresh_requested' });
    await tick(50);
    expect(ctx.sockets.length).toBeGreaterThanOrEqual(2);
    ctx.sockets[1].serverSend({ type: 'hello' });
    expect(adapter.getStatus().connected).toBe(true);
  });

  it('reports a clear error when apps.connections.open is rejected', async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ ok: false, error: 'invalid_auth' }))
    ) as typeof fetch;
    adapter = new SlackAdapter({
      appToken: 'bad', botToken: 'xoxb', onMessage: async () => undefined,
      log: noopLog, fetchImpl, wsFactory: () => new FakeWs(), backoffCapMs: 10,
    });
    await adapter.start();
    await tick();
    expect(adapter.getStatus().connected).toBe(false);
    expect(adapter.getStatus().lastError).toMatch(/invalid_auth/);
  });

  it('stop() halts reconnection', async () => {
    const ctx = makeAdapter();
    adapter = ctx.adapter;
    await adapter.start();
    await tick();
    ctx.sockets[0].serverSend({ type: 'hello' });
    await adapter.stop();
    ctx.sockets[0].emit('close');
    await tick(50);
    expect(ctx.sockets.length).toBe(1);
    adapter = null;
  });
});

describe('SlackAdapter send', () => {
  it('posts with the bot token and chunks long text', async () => {
    const ctx = makeAdapter();
    adapter = ctx.adapter;
    await adapter.send('C42', 'z'.repeat(SLACK_MAX_TEXT + 100));
    const sends = ctx.restCalls.filter(c => c.url.endsWith('/chat.postMessage'));
    expect(sends.length).toBe(2);
    expect((sends[0].init?.headers as Record<string, string>).Authorization).toBe('Bearer xoxb-1');
    expect(JSON.parse(String(sends[0].init?.body)).channel).toBe('C42');
  });

  it('surfaces Slack API errors (ok:false)', async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ ok: false, error: 'channel_not_found' }))
    ) as typeof fetch;
    adapter = new SlackAdapter({
      appToken: 'xapp', botToken: 'xoxb', onMessage: async () => undefined,
      log: noopLog, fetchImpl, wsFactory: () => new FakeWs(),
    });
    await expect(adapter.send('C0', 'hi')).rejects.toThrow(/channel_not_found/);
  });
});
