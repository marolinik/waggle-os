# Iteration 4 Results — 2026-05-28 (FR-2 Settings UI)

## Shipped this iteration

### FR-2 §UI · Telegram Settings tile
**Files:**
- `apps/web/src/components/os/settings/TelegramDigestCard.tsx` (new, ~165 lines)
- `apps/web/src/components/os/apps/SettingsApp.tsx` — import + render inside the Advanced tab

**What the user sees** (verified live via Chrome DevTools probe):
- Card in Settings → Advanced labelled "Telegram digest" with a status badge (Connected/Not configured)
- Bot Token input (password, with show/hide eye toggle, says "saved" if already in vault)
- Chat ID input (says "saved" if already in vault)
- "Save" button → POST `/api/telegram/config`
- "Send test message" button → POST `/api/telegram/test` (disabled until configured)
- BotFather link + getUpdates URL hint for self-service onboarding

**Live verification:**
```json
{"settingsClicked":true,"advancedClicked":true,"cardFound":true,"badgeText":"Not configured"}
```

## Honest scope call: what's NOT shipped this iter

### ScheduledJobs output-channel integration (deferred)
Originally scoped two pieces:
1. Settings tile ✓ (shipped this iter)
2. ScheduledJobsApp create-form dropdown + scheduler runtime branch ✗ (deferred)

Why deferred:
- `cron-runner.ts:36` calls `this.jobService.createJob(...)` fire-and-forget — there's no completion callback exposed today.
- Wiring "after job completes, POST result to /api/telegram/send" requires either:
  - A new event hook in `JobService` (touches another service abstraction)
  - A post-job worker that reads `job_executions` rows and dispatches outputs based on a stored `jobConfig.outputChannel`
- Either path is its own commit (~1-2 hours focused work + tests for the path branching).
- Per CLAUDE.md §3.2 "no half-finished implementations" — I'd rather ship a clean Settings tile + the existing `/api/telegram/send` endpoint (callable today) than a UI dropdown that silently does nothing because the runtime branch isn't there.

**What this means in practice:**
- A power user can already `curl POST /api/telegram/send` from any script or workflow today (e.g., manual recurring shell cron, n8n, a Zap).
- ScheduledJobsApp doesn't surface "send to Telegram" as a job output option yet.
- The persona uplift for P10 Tomás (cron→Telegram is his hook) requires the ScheduledJobs wiring — earmarked for iter-5.

## Score movement (still 5.9/10 honest)
The Settings tile makes Telegram self-serviceable but doesn't itself complete a persona's daily-driver loop. The endpoint exists. The cron-wiring is what flips persona scores. No score movement claimed for this iter — the rubric is honest about evidence of completed loops, not capability.

## Iter-5 candidates
- **FR-2 §Cron runtime** (~1-2 hr) — hook into JobService completion, branch on `jobConfig.outputChannel === 'telegram'`, post the rendered output. Lifts P10 5→7, P6 6→7, P8 8→9. **This is what moves the score.**
- **FR-5 sample workspace import** (~1 day) — different cell-impact path, lifts P1/P2/P3/P5/P7.

## Files touched (uncommitted)
- `apps/web/src/components/os/settings/TelegramDigestCard.tsx` (new)
- `apps/web/src/components/os/apps/SettingsApp.tsx` (import + 1-line render)
