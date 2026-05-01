# 02 — Daily Brief Notification

**Author:** CC (Block B design pass)
**Date:** 2026-05-01
**Status:** AWAITING_RATIFICATION
**Estimate:** ~280 LOC + ~5-6h wall-clock
**Touches:** apps/web (2 files), packages/server (1 route + 1 cron job), packages/core (1 generator), Tauri capabilities (notification permission)

---

## User story

As a user, every morning I want a 1-2 sentence brief summarising what I discussed yesterday, what I decided, and what's worth revisiting today, delivered as either an in-app banner or a system notification — so I never lose track of work I did 24 hours ago.

## Acceptance criteria

1. At a configurable hour (default 09:00 local), a "Daily Brief" notification fires for the user.
2. Brief content: 1-line summary of yesterday's activity (+ count of frames saved + decisions made), 1-line "today suggestion" derived from open tasks / pending follow-ups in workspace state.
3. Two delivery channels:
   - **In-app banner**: top-right toast on first desktop mount of the day, dismissible.
   - **System notification** (Tauri): native Win/Mac notification with click-to-focus action. Opt-in per-platform.
4. Configurable in Settings → Notifications: on/off toggle, hour-of-day picker, channel selection.
5. Skips when user has no qualifying activity (yesterday frame count = 0); brief replaced with weekly digest pointer or suppressed entirely.
6. One brief per day max — server-side dedupe on `(user_id, date)` so reopening the app doesn't re-fire.

## UI sketch

```
In-app banner (top-right, 8s fade-out unless hovered):
  [Brain icon] Yesterday's brief
  You discussed: API rate limiting, Q3 roadmap. Decided: ship migrations
  Wednesday. Today's suggestion: review the auth-rewrite blocker.
                                                    [Read more]  [✕]

System notification (Tauri):
  Title: Waggle — Daily Brief
  Body:  Yesterday: 12 memories, 3 decisions. Today: review auth blocker.
  Action: Open app → focuses Chat / Memory tab
```

## Data model

New table `daily_briefs`:
```
id INTEGER PRIMARY KEY,
brief_date TEXT NOT NULL UNIQUE,    -- 'YYYY-MM-DD'
content TEXT NOT NULL,              -- 1-2 sentence summary
yesterday_frame_count INTEGER,
yesterday_decision_count INTEGER,
today_suggestions TEXT,             -- JSON array
delivered_at TEXT,                  -- ISO timestamp; null until shown
delivered_via TEXT,                 -- 'banner' | 'system' | both
created_at TEXT NOT NULL
```

Settings additions (existing `settings.json`):
```
dailyBrief: {
  enabled: boolean,                 // default true
  hour: number,                     // default 9
  channels: { banner: bool, system: bool }   // default { banner: true, system: false }
}
```

## Server-side generator

Cron job runs daily at configured hour (per-user; v1 single global hour) — generates brief by:
1. Querying yesterday's frames (`created_at >= startOfYesterday AND < startOfToday`).
2. Extracting decisions (importance=critical OR content matches "Decision X").
3. Pulling open progress items / blockers from workspace-state.
4. Sending to LLM with prompt: "Summarise in 1-2 sentences. Be terse. List top decision."
5. Storing in `daily_briefs` table with `delivered_at=null`.

Client polls `/api/daily-brief/today` on desktop mount. If row exists with `delivered_at=null`, render banner + (if Tauri & user opted in) fire system notification, then `POST /api/daily-brief/today/ack` to set `delivered_at`.

## Implementation notes

- Cron infrastructure already exists (`cronStore` + `CronScheduleLike` in workspace-context.ts).
- LLM cost: 1 call/day × ~500 tokens output ≈ $0.005/day on Sonnet. Acceptable.
- Dedupe: server enforces `UNIQUE(brief_date)`. Client never generates locally.
- System notification: Tauri `notification` capability — already requestable; needs `tauri.conf.json` allowlist update.
- Skip for fresh users: cron job pre-checks `yesterday_frame_count > 0`; if 0 and totalFrames=0 (cold start), skips entire brief.

## Estimate

- Server route (`/api/daily-brief/today`) + ack endpoint: ~60 LOC
- Cron job + LLM generator: ~80 LOC
- Settings tab additions: ~50 LOC
- DailyBriefBanner component: ~60 LOC
- Tauri notification wiring: ~30 LOC
- Tests (cron logic, brief generation, dedupe): ~50 LOC
- **Total ~330 LOC including tests, ~5-6h with verification.**

## Risks + open questions

1. **Hour-picker timezone** — server cron runs in server-local TZ; users on other timezones see briefs at wrong hour. v1: keep server-local; document. v2: per-user TZ.
2. **LLM cost** — $0.005/day × N users = $0.15/user/month. Negligible for now but tracks.
3. **Empty days** — first 7 days of new user have no yesterday. Either skip silently or use "Welcome" copy. Open question.
4. **System notification permission** — Tauri requires explicit allowlist + user permission grant. v1 fallback to banner-only when permission denied.
5. **Generator failure** — LLM down → no brief that day. Acceptable; user just sees yesterday's content next day. Don't retry within a day.
6. **Cross-device** — user has multiple devices; brief generated server-side once, both devices show it. Already handled by server-side dedupe.

## Out of scope (v1)

- Multiple briefs per day (morning + evening) — wait for usage data.
- Personalised tone / persona-flavored briefs — just a plain factual summary v1.
- "Snooze brief" controls — just dismiss or off.
- Email delivery — Slack-style integrations later.
- Per-workspace briefs — global personal brief v1.

## PM decisions needed

- [ ] GO / MODIFY / SKIP
- [ ] Default delivery channel(s) — banner, system, or both
- [ ] Default hour (09:00 local? user-configurable on first run?)
- [ ] Empty-day behavior (skip / welcome copy / encourage activity)
- [ ] Brief tone (factual / encouraging / persona-flavored)
- [ ] Generator model (Sonnet for cost / Haiku for speed)
