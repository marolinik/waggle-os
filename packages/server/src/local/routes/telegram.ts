/**
 * Telegram outbound digest (FR-2) — /api/telegram
 *
 * MVP scope: one-way push from Waggle to the user's Telegram. No webhook
 * receiver (would need a public HTTPS endpoint), no bot/menu flow, no
 * pairing handshake. User-side setup is the standard Telegram bot path:
 *
 *   1. DM @BotFather, run /newbot, save the bot token
 *   2. DM the new bot any message; visit
 *      https://api.telegram.org/bot<TOKEN>/getUpdates to read the chat_id
 *   3. POST /api/telegram/config with {botToken, chatId}
 *   4. POST /api/telegram/test → user receives "Waggle is connected ✓"
 *
 * Endpoints
 *   GET  /api/telegram/status                  → { configured, hasToken, hasChatId }
 *   POST /api/telegram/config  { botToken?, chatId? }  → { ok }
 *   POST /api/telegram/test                    → { ok, response? }
 *   POST /api/telegram/send  { text, parseMode? }      → { ok, response? }
 *
 * The send endpoint is the integration point ScheduledJobs will call once
 * it grows an output-channel selector (separate work; FR-2 §UI is TODO).
 *
 * Security: bot token + chat_id stored in vault. The route URL is
 * hard-coded to api.telegram.org (no SSRF surface — token is interpolated
 * into the path of a fixed host). Text payloads are capped at 4096 chars
 * (Telegram's own limit, but we reject before hitting their API).
 */

import type { FastifyInstance } from 'fastify';

const TELEGRAM_API_HOST = 'https://api.telegram.org';
const TELEGRAM_MAX_TEXT = 4096;
const VAULT_TOKEN_KEY = 'telegram_bot_token';
const VAULT_CHAT_ID_KEY = 'telegram_chat_id';

// Telegram bot token format: <numeric-id>:<35-char-secret>. Pattern match
// before any network call so a malformed token surfaces a 400, not an
// upstream HTTPS error the operator has to parse. Exported for unit tests.
export const BOT_TOKEN_PATTERN = /^\d{6,12}:[A-Za-z0-9_-]{30,}$/;
// chat_id: a signed integer string (negative for groups). Sanity-check
// before storage so a typo doesn't get saved permanently. Exported for tests.
export const CHAT_ID_PATTERN = /^-?\d{4,18}$/;

interface TelegramSendResponse {
  ok: boolean;
  description?: string;
  result?: { message_id?: number };
}

function getStoredCreds(server: FastifyInstance): {
  token: string | null;
  chatId: string | null;
} {
  let token: string | null = null;
  let chatId: string | null = null;
  try {
    const t = server.vault?.get(VAULT_TOKEN_KEY);
    if (t?.value) token = t.value;
  } catch { /* vault not ready — leave null */ }
  try {
    const c = server.vault?.get(VAULT_CHAT_ID_KEY);
    if (c?.value) chatId = c.value;
  } catch { /* same */ }
  return { token, chatId };
}

async function sendToTelegram(
  token: string,
  chatId: string,
  text: string,
  parseMode?: string,
): Promise<TelegramSendResponse> {
  const url = `${TELEGRAM_API_HOST}/bot${encodeURIComponent(token)}/sendMessage`;
  const body: Record<string, unknown> = { chat_id: chatId, text };
  if (parseMode) body.parse_mode = parseMode;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  return (await r.json()) as TelegramSendResponse;
}

/**
 * Push a message from anywhere in the sidecar — used by the cron-job
 * completion callback when a schedule's jobConfig sets outputChannel:
 * 'telegram'. Returns a result describing what happened so callers can
 * log it without throwing — cron callbacks must not crash the scheduler.
 */
export async function pushTelegramMessage(
  server: FastifyInstance,
  text: string,
): Promise<{ ok: boolean; reason?: string; messageId?: number }> {
  if (!text) return { ok: false, reason: 'empty text' };
  const { token, chatId } = getStoredCreds(server);
  if (!token || !chatId) return { ok: false, reason: 'telegram not configured' };
  const capped = text.length > TELEGRAM_MAX_TEXT ? `${text.slice(0, TELEGRAM_MAX_TEXT - 3)}...` : text;
  try {
    const res = await sendToTelegram(token, chatId, capped);
    if (!res.ok) return { ok: false, reason: res.description ?? 'telegram api rejected' };
    return { ok: true, messageId: res.result?.message_id };
  } catch (err) {
    return { ok: false, reason: String(err) };
  }
}

export async function telegramRoutes(server: FastifyInstance) {
  // ── Status ──────────────────────────────────────────────────────
  server.get('/api/telegram/status', async () => {
    const { token, chatId } = getStoredCreds(server);
    return {
      configured: Boolean(token && chatId),
      hasToken: Boolean(token),
      hasChatId: Boolean(chatId),
    };
  });

  // ── Configure ───────────────────────────────────────────────────
  server.post<{ Body: { botToken?: string; chatId?: string } }>(
    '/api/telegram/config',
    async (request, reply) => {
      const { botToken, chatId } = request.body ?? {};
      if (botToken !== undefined) {
        if (!BOT_TOKEN_PATTERN.test(botToken)) {
          return reply.status(400).send({
            error: 'botToken must look like "<id>:<secret>" from @BotFather',
          });
        }
        server.vault.set(VAULT_TOKEN_KEY, botToken, { credentialType: 'api_key' });
      }
      if (chatId !== undefined) {
        if (!CHAT_ID_PATTERN.test(chatId)) {
          return reply.status(400).send({
            error: 'chatId must be a signed integer string (e.g. 123456789 or -1001234567890)',
          });
        }
        server.vault.set(VAULT_CHAT_ID_KEY, chatId, { credentialType: 'api_key' });
      }
      return { ok: true };
    },
  );

  // ── Test ────────────────────────────────────────────────────────
  server.post('/api/telegram/test', async (_request, reply) => {
    const { token, chatId } = getStoredCreds(server);
    if (!token || !chatId) {
      return reply.status(400).send({
        error: 'Telegram not configured — POST /api/telegram/config first',
      });
    }
    try {
      const res = await sendToTelegram(
        token,
        chatId,
        '✓ Waggle is connected to this chat. Scheduled digests will appear here.',
      );
      if (!res.ok) return reply.status(502).send({ ok: false, error: res.description });
      return { ok: true, messageId: res.result?.message_id };
    } catch (err) {
      return reply.status(502).send({ ok: false, error: String(err) });
    }
  });

  // ── Send (called by ScheduledJobs once UI is wired) ─────────────
  server.post<{ Body: { text?: string; parseMode?: string } }>(
    '/api/telegram/send',
    async (request, reply) => {
      const { text, parseMode } = request.body ?? {};
      if (!text || typeof text !== 'string') {
        return reply.status(400).send({ error: 'text is required' });
      }
      if (text.length > TELEGRAM_MAX_TEXT) {
        return reply.status(400).send({
          error: `text exceeds Telegram's ${TELEGRAM_MAX_TEXT}-char limit (was ${text.length})`,
        });
      }
      const { token, chatId } = getStoredCreds(server);
      if (!token || !chatId) {
        return reply.status(400).send({
          error: 'Telegram not configured — POST /api/telegram/config first',
        });
      }
      try {
        const res = await sendToTelegram(token, chatId, text, parseMode);
        if (!res.ok) return reply.status(502).send({ ok: false, error: res.description });
        return { ok: true, messageId: res.result?.message_id };
      } catch (err) {
        return reply.status(502).send({ ok: false, error: String(err) });
      }
    },
  );
}
