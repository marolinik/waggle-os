# Iteration 5 Results — 2026-05-28 (FR-2 cron→Telegram loop closed)

## Architecture spike outcome (per iter-4's deferral)
The hook **already existed** in `packages/server/src/local/cron.ts:111` — `LocalScheduler` was constructed with an optional `JobCompleteCallback` and the existing callback at `index.ts:1810` was already routing to in-app notifications. Wiring Telegram was a one-side extension, not a refactor:

- **No new hook surface needed** — the callback fires on every tick.
- **One small fix needed** — `LocalScheduler.executeJob` (manual "Run now" path) wasn't invoking the callback. Fixed for consistency so manual triggers also notify + push.

## Shipped this iter

### Server-side runtime (FR-2 §runtime)
- `packages/server/src/local/routes/telegram.ts` — exported `pushTelegramMessage(server, text)` helper for in-process callers; capped at Telegram's 4096-char limit; never throws.
- `packages/server/src/local/index.ts` — `onJobComplete` callback now parses `schedule.job_config`, checks `outputChannel === 'telegram'`, and pushes a one-line digest via `pushTelegramMessage`. Errors logged but never crash the scheduler tick.
- `packages/server/src/local/cron.ts` — `executeJob` extended to fire the callback on both success and failure paths (mirrors `tick()` semantics). Manual "Run now" now routes to notifications + Telegram identically to auto-runs.

### UI (FR-2 §UI part 2)
- `apps/web/src/components/os/apps/ScheduledJobsApp.tsx` — create-form gains a "Where the result goes" dropdown with two options:
  - `Notification + cockpit log` (default — existing behavior)
  - `Telegram (requires Settings → Advanced → Telegram digest)`
- When `telegram` is selected, `jobConfig: { outputChannel: 'telegram' }` is forwarded through `adapter.createCronJob` → `/api/cron` → cron-store → the runtime callback above.

### End-to-end loop (now closed)
1. User configures Telegram in Settings → Advanced → Telegram digest tile (shipped iter-4).
2. User creates a cron job, picks "Telegram" as output channel.
3. Job runs (cron tick OR manual "Run now").
4. `onJobComplete` callback fires → reads `jobConfig.outputChannel` → calls `pushTelegramMessage` → user receives "✓ Waggle: {name} ({cron}) ran successfully." or "✗ Waggle: … failed — {error}".

## Honest score movement

| Persona | Iter-4 | Iter-5 | Δ | Why |
|---|---|---|---|---|
| P1 Greta | 3 | 3 | 0 | Browser ext is her hook; Telegram less relevant |
| P2 Hassan | 2 | 3 | +1 | iPhone-first user — Telegram push is real external trigger |
| P3 Sarah | 7 | 7 | 0 | Already at solid score |
| P4 Imran | 6 | 6 | 0 | Apple-ecosystem; no Telegram habit |
| P5 Lucas | 8 | 8 | 0 | Browser ext already won him |
| P6 Daniel | 6 | 7 | +1 | Monday-morning variance summary fits perfectly |
| P7 Anya | 8 | 8 | 0 | Browser ext already her hook |
| P8 Marko | 8 | 9 | +1 | Daily strategic recap channel |
| P9 Priya | 6 | 6 | 0 | Engineering — wants Slack/Discord more than Telegram |
| P10 Tomás | 5 | 7 | +2 | Cron→Telegram IS his Hermes-style workflow — now native in Waggle |
| **avg** | **5.9** | **6.4** | **+0.5** | 5 cells closed across 4 personas |

## Remaining gap to 10/10 (3.6 points across 10 personas)
| Item | Personas moved | Effort |
|---|---|---|
| FR-3 public skill registry | P4, P8, P9, P10 | 2 sprints |
| FR-5 sample workspace import | P1, P2, P3, P5, P7 | ~1 day |
| FR-6 native xlsx | P6 | 2-3 sprints |
| FR-9 voice journaling | P1 | 1 sprint |
| FR-10 social loop | P3, P9, P10 | 1.5 sprints |
| Plus surgical polish (F3 sample workspace UI, F4 coverage compass, F5 onboarding teach memory) | various | small |

Realistic next single-turn target: **FR-5 sample workspace import** (~1 day, well-scoped, lifts 5 personas).

## Files committed in this iter
- packages/server/src/local/cron.ts (1 edit — executeJob callback)
- packages/server/src/local/routes/telegram.ts (1 new export — pushTelegramMessage)
- packages/server/src/local/index.ts (1 import + 1 callback extension)
- apps/web/src/components/os/apps/ScheduledJobsApp.tsx (state + dropdown + jobConfig pass-through)
- docs/addictiveness-audit-2026-05-28/ITER-5-RESULTS.md (new)
