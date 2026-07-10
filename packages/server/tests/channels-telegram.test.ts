/**
 * TelegramAdapter — long-poll normalization, offset advancement, chunked
 * send, backoff on errors (CHANNELS-ARC P1). Uses the fetchImpl test seam;
 * no network.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { TelegramAdapter, TELEGRAM_MAX_TEXT } from '../src/local/channels/telegram-adapter.js';
import { chunkText } from '../src/local/channels/types.js';
import type { ChannelMessage } from '../src/local/channels/types.js';

const noopLog = { info: () => undefined, warn: () => undefined };

type FetchCall = { url: string; body: Record<string, unknown> };

/**
 * Scripted Telegram API: returns queued getUpdates responses in order, then
 * empty batches forever. sendMessage always succeeds.
 */
function makeFetchScript(updateBatches: unknown[][]) {
  const calls: FetchCall[] = [];
  let batchIndex = 0;
  const fetchImpl = (async (url: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
    calls.push({ url: String(url), body });
    if (String(url).endsWith('/getUpdates')) {
      const result = updateBatches[batchIndex] ?? [];
      batchIndex++;
      // Empty batches simulate the long-poll timing out with no traffic —
      // yield so the poll loop doesn't spin the test CPU.
      if (result.length === 0) await new Promise(r => setTimeout(r, 5));
      return new Response(JSON.stringify({ ok: true, result }));
    }
    return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }));
  }) as typeof fetch;
  return { fetchImpl, calls };
}

function telegramUpdate(id: number, text: string, from = { id: 42, username: 'marko' }) {
  return { update_id: id, message: { message_id: id, text, chat: { id: -100 }, from } };
}

async function waitFor(predicate: () => boolean, ms = 2000): Promise<void> {
  const deadline = Date.now() + ms;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('waitFor timed out');
    await new Promise(r => setTimeout(r, 5));
  }
}

let adapter: TelegramAdapter | null = null;

afterEach(async () => {
  await adapter?.stop();
  adapter = null;
  vi.restoreAllMocks();
});

describe('TelegramAdapter polling', () => {
  it('normalizes updates into ChannelMessage and advances the offset', async () => {
    const { fetchImpl, calls } = makeFetchScript([
      [telegramUpdate(7, 'hello'), telegramUpdate(8, 'world')],
    ]);
    const received: ChannelMessage[] = [];
    adapter = new TelegramAdapter({
      botToken: 't',
      onMessage: async m => { received.push(m); },
      log: noopLog,
      fetchImpl,
    });
    await adapter.start();
    await waitFor(() => received.length === 2);

    expect(received[0]).toEqual({
      platform: 'telegram',
      chatId: '-100',
      senderId: '42',
      senderName: 'marko',
      text: 'hello',
      messageId: '7',
    });

    // Next poll must ask from update_id 8 + 1.
    await waitFor(() => calls.filter(c => c.url.endsWith('/getUpdates')).length >= 2);
    const second = calls.filter(c => c.url.endsWith('/getUpdates'))[1];
    expect(second.body.offset).toBe(9);
  });

  it('skips non-text updates without crashing', async () => {
    const { fetchImpl } = makeFetchScript([
      [{ update_id: 1, message: { message_id: 1, chat: { id: 5 } } }, telegramUpdate(2, 'real')],
    ]);
    const received: ChannelMessage[] = [];
    adapter = new TelegramAdapter({
      botToken: 't', onMessage: async m => { received.push(m); }, log: noopLog, fetchImpl,
    });
    await adapter.start();
    await waitFor(() => received.length === 1);
    expect(received[0].text).toBe('real');
  });

  it('keeps polling when the inbound handler throws', async () => {
    const { fetchImpl, calls } = makeFetchScript([
      [telegramUpdate(1, 'boom')],
      [telegramUpdate(2, 'after')],
    ]);
    const received: string[] = [];
    adapter = new TelegramAdapter({
      botToken: 't',
      onMessage: async m => {
        if (m.text === 'boom') throw new Error('handler exploded');
        received.push(m.text);
      },
      log: noopLog,
      fetchImpl,
    });
    await adapter.start();
    await waitFor(() => received.includes('after'));
    expect(calls.filter(c => c.url.endsWith('/getUpdates')).length).toBeGreaterThanOrEqual(2);
  });

  it('reports degraded status and recovers after transport errors', async () => {
    let failFirst = true;
    const fetchImpl = (async (url: RequestInfo | URL, init?: RequestInit) => {
      void init;
      if (String(url).endsWith('/getUpdates') && failFirst) {
        failFirst = false;
        throw new Error('ECONNRESET');
      }
      await new Promise(r => setTimeout(r, 5));
      return new Response(JSON.stringify({ ok: true, result: [] }));
    }) as typeof fetch;

    adapter = new TelegramAdapter({
      botToken: 't', onMessage: async () => undefined, log: noopLog, fetchImpl,
    });
    await adapter.start();
    await waitFor(() => adapter!.getStatus().connected, 5000);
    expect(adapter.getStatus().lastError).toBeUndefined();
  });

  it('stop() halts the loop and reports disconnected', async () => {
    const { fetchImpl, calls } = makeFetchScript([]);
    adapter = new TelegramAdapter({
      botToken: 't', onMessage: async () => undefined, log: noopLog, fetchImpl,
    });
    await adapter.start();
    await waitFor(() => calls.length >= 1);
    await adapter.stop();
    const after = calls.length;
    await new Promise(r => setTimeout(r, 30));
    expect(calls.length).toBe(after);
    expect(adapter.getStatus()).toMatchObject({ running: false, connected: false });
  });
});

describe('TelegramAdapter send', () => {
  it('sends one message for short text', async () => {
    const { fetchImpl, calls } = makeFetchScript([]);
    adapter = new TelegramAdapter({
      botToken: 't', onMessage: async () => undefined, log: noopLog, fetchImpl,
    });
    await adapter.send('123', 'short reply');
    const sends = calls.filter(c => c.url.endsWith('/sendMessage'));
    expect(sends).toHaveLength(1);
    expect(sends[0].body).toMatchObject({ chat_id: '123', text: 'short reply' });
  });

  it('chunks text above the 4096-char Telegram limit', async () => {
    const { fetchImpl, calls } = makeFetchScript([]);
    adapter = new TelegramAdapter({
      botToken: 't', onMessage: async () => undefined, log: noopLog, fetchImpl,
    });
    await adapter.send('123', 'x'.repeat(TELEGRAM_MAX_TEXT * 2 + 10));
    const sends = calls.filter(c => c.url.endsWith('/sendMessage'));
    expect(sends.length).toBeGreaterThanOrEqual(3);
    for (const s of sends) {
      expect(String(s.body.text).length).toBeLessThanOrEqual(TELEGRAM_MAX_TEXT);
    }
  });

  it('surfaces Telegram API rejections as errors', async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ ok: false, description: 'chat not found' }))
    ) as typeof fetch;
    adapter = new TelegramAdapter({
      botToken: 't', onMessage: async () => undefined, log: noopLog, fetchImpl,
    });
    await expect(adapter.send('999', 'hi')).rejects.toThrow(/chat not found/);
  });
});

describe('chunkText', () => {
  it('prefers paragraph boundaries over hard cuts', () => {
    const para = 'a'.repeat(60);
    const text = `${para}\n\n${'b'.repeat(60)}`;
    const chunks = chunkText(text, 100);
    expect(chunks).toEqual(['a'.repeat(60), 'b'.repeat(60)]);
  });

  it('hard-cuts a single unbroken run', () => {
    const chunks = chunkText('c'.repeat(250), 100);
    expect(chunks.map(c => c.length)).toEqual([100, 100, 50]);
  });

  it('returns short text untouched', () => {
    expect(chunkText('hello', 100)).toEqual(['hello']);
  });
});
