# Iteration 3 Results — 2026-05-28 (FR-2 plumbing)

## Shipped this iteration

### FR-2 · Telegram outbound digest (server-side plumbing)
**Files:**
- `packages/server/src/local/routes/telegram.ts` (new) — 4 endpoints
- `packages/server/src/local/index.ts` — registered

**Endpoints (smoke-verified):**
| Method | Path | Purpose | Verified |
|---|---|---|---|
| `GET` | `/api/telegram/status` | reports `{configured, hasToken, hasChatId}` | `{"configured":false,"hasToken":false,"hasChatId":false}` ✓ |
| `POST` | `/api/telegram/config` | save `{botToken, chatId}` to vault | bad-token reject 400 with format hint ✓ |
| `POST` | `/api/telegram/test` | send "Waggle is connected ✓" | 400 "not configured" pre-config ✓ |
| `POST` | `/api/telegram/send` | push arbitrary text — the integration point for ScheduledJobs | shipped, not invoked from UI yet |

**Validation:**
- Bot token pattern: `/^\d{6,12}:[A-Za-z0-9_-]{30,}$/`
- Chat ID pattern: `/^-?\d{4,18}$/` (signed integer string, negative for groups)
- Text capped at 4096 chars (Telegram's own limit, rejected client-side before API hit)

**Security:**
- URL is `https://api.telegram.org/bot${token}/sendMessage` — host is hard-coded, token is interpolated into the path of a fixed host → no SSRF surface
- Token + chat_id stored in vault under `telegram_bot_token` + `telegram_chat_id` (credentialType: api_key)
- No webhook receiver — pure outbound — so no public-endpoint exposure

## What's NOT shipped (honest scope)
- **Settings UI tile** — user has to `curl POST /api/telegram/config` today. Self-serve UX requires a tile in SettingsApp.tsx.
- **ScheduledJobs output channel** — the `/api/telegram/send` endpoint exists but isn't called by any scheduled job. The persona-level "daily digest" workflow needs ScheduledJobs to grow a "send result to Telegram" dropdown.
- **No score movement until the above land.** Plumbing-only means a power user could wire it themselves; persona uplift requires the UI loop.

## Score movement (honest: zero this iter)
Same 5.9/10 average as iter-2. The wiring is in place; the score-move comes when ScheduledJobs uses it.

## Next iteration candidates
- **FR-2 §UI · Settings tile** (~30 min) — input fields, save button, test button, status pill. Closes the self-serve gap.
- **FR-2 §UI · ScheduledJobs output channel** (~1-2 hr) — dropdown on the job-create form, server-side branch in the scheduler runtime to POST results to `/api/telegram/send`. Closes the daily-digest loop. **This is what actually moves persona P10/P6/P8 scores.**
- **FR-5 sample workspace import** (parallel option) — different cell-impact path, lifts P1/P2/P3/P5/P7 first-session.

## Manual verification path (when user has a bot)
```bash
# 1. Set up bot via @BotFather, get token + chat_id
# 2. Configure
curl -X POST http://127.0.0.1:3333/api/telegram/config \
  -H 'Content-Type: application/json' \
  -d '{"botToken":"<TOKEN>","chatId":"<CHAT_ID>"}'

# 3. Test
curl -X POST http://127.0.0.1:3333/api/telegram/test

# Expected: Telegram DM "✓ Waggle is connected to this chat. Scheduled digests will appear here."
```
