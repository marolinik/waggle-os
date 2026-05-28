import { describe, it, expect, vi, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  telegramRoutes,
  pushTelegramMessage,
  BOT_TOKEN_PATTERN,
  CHAT_ID_PATTERN,
} from '../../src/local/routes/telegram.js';

describe('telegram route exports', () => {
  it('exports telegramRoutes + pushTelegramMessage', () => {
    expect(typeof telegramRoutes).toBe('function');
    expect(typeof pushTelegramMessage).toBe('function');
  });
});

describe('BOT_TOKEN_PATTERN', () => {
  it('accepts a well-formed BotFather token', () => {
    expect(BOT_TOKEN_PATTERN.test('123456789:AAH-abcDEF_ghiJKLmnoPQRstuVWXyz01234')).toBe(true);
  });
  it('rejects a token with no colon', () => {
    expect(BOT_TOKEN_PATTERN.test('123456789AAHabcdefghi')).toBe(false);
  });
  it('rejects a too-short secret half', () => {
    expect(BOT_TOKEN_PATTERN.test('123456789:short')).toBe(false);
  });
  it('rejects free text', () => {
    expect(BOT_TOKEN_PATTERN.test('not-a-real-token')).toBe(false);
  });
  it('rejects a secret with disallowed chars (spaces)', () => {
    expect(BOT_TOKEN_PATTERN.test('123456789:AAH abcDEF ghiJKLmnoPQRstuVWXyz0')).toBe(false);
  });
});

describe('CHAT_ID_PATTERN', () => {
  it('accepts a positive user chat id', () => {
    expect(CHAT_ID_PATTERN.test('123456789')).toBe(true);
  });
  it('accepts a negative group/supergroup chat id', () => {
    expect(CHAT_ID_PATTERN.test('-1001234567890')).toBe(true);
  });
  it('rejects non-numeric', () => {
    expect(CHAT_ID_PATTERN.test('abc123')).toBe(false);
  });
  it('rejects too-short ids', () => {
    expect(CHAT_ID_PATTERN.test('12')).toBe(false);
  });
});

// Minimal fake FastifyInstance carrying just a vault stub — pushTelegramMessage
// only reads server.vault.get(). Cast through unknown to avoid stubbing the
// entire Fastify surface.
function fakeServer(creds: { token?: string; chatId?: string }): FastifyInstance {
  return {
    vault: {
      get: (key: string) => {
        if (key === 'telegram_bot_token' && creds.token) return { value: creds.token };
        if (key === 'telegram_chat_id' && creds.chatId) return { value: creds.chatId };
        return null;
      },
    },
  } as unknown as FastifyInstance;
}

describe('pushTelegramMessage', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('returns ok:false for empty text without touching the network', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const res = await pushTelegramMessage(fakeServer({ token: 't', chatId: 'c' }), '');
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('empty text');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns ok:false when telegram is not configured', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const res = await pushTelegramMessage(fakeServer({}), 'hello');
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('telegram not configured');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('posts to the Telegram API and returns ok:true on success', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      json: async () => ({ ok: true, result: { message_id: 42 } }),
    });
    vi.stubGlobal('fetch', fetchSpy);

    const res = await pushTelegramMessage(
      fakeServer({ token: '123456789:AAH-abcDEF_ghiJKLmnoPQRstuVWXyz01234', chatId: '123456789' }),
      'digest line',
    );

    expect(res.ok).toBe(true);
    expect(res.messageId).toBe(42);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    // Host is hard-coded — token only interpolates into the path (no SSRF).
    expect(String(url)).toContain('https://api.telegram.org/bot');
    expect(String(url)).toContain('/sendMessage');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body);
    expect(body.chat_id).toBe('123456789');
    expect(body.text).toBe('digest line');
  });

  it('returns ok:false when the Telegram API rejects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: async () => ({ ok: false, description: 'chat not found' }),
    }));
    const res = await pushTelegramMessage(
      fakeServer({ token: '123456789:AAH-abcDEF_ghiJKLmnoPQRstuVWXyz01234', chatId: '999999' }),
      'hi',
    );
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('chat not found');
  });

  it('never throws when fetch rejects (cron-safe)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    const res = await pushTelegramMessage(
      fakeServer({ token: '123456789:AAH-abcDEF_ghiJKLmnoPQRstuVWXyz01234', chatId: '123456789' }),
      'hi',
    );
    expect(res.ok).toBe(false);
    expect(res.reason).toContain('network down');
  });

  it('caps text at Telegram\'s 4096-char limit before sending', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ json: async () => ({ ok: true, result: {} }) });
    vi.stubGlobal('fetch', fetchSpy);
    await pushTelegramMessage(
      fakeServer({ token: '123456789:AAH-abcDEF_ghiJKLmnoPQRstuVWXyz01234', chatId: '1234' }),
      'x'.repeat(5000),
    );
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.text.length).toBeLessThanOrEqual(4096);
  });
});
