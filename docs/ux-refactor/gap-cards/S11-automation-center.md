# Gap Card — S11 Automation Center

> UX-refactor implementation planning. Screen 11 of the 21-screen inventory.
> Execution model is LOCKED: in-place incremental refactor of `apps/web` + targeted
> backend extensions. The mockup is DIRECTIONAL; PRD acceptance criteria win over pixels.
> Every claim below is grounded in a real file (path + line where load-bearing).
>
> PRD: `docs/Waggle_OS_UX_Refactor_Master_Handoff_Package/Waggle_OS_UX_Refactor_PRD.md`
> §12.10 (lines 597-611), §16.10 (lines 1143-1150). Blueprint screen spec: `_blueprint_extracted.txt:354-359`.

---

## 1. Screen & purpose

**Automation Center + Automation Builder** — manage scheduled and event-driven work so
overnight/background runs are visible, reviewable, and stoppable (PRD §12.10; Definition of
Done #7 "automations… have coherent IA"; principle #9 "Automation with trust").

The PRD object is **Automation** (§11 glossary): "Scheduled/event-driven workflow using
triggers/actions/agents. Must be visible/stoppable." In the live repo this is **cron**:
`packages/core/src/cron-store.ts` (`CronStore`) + `packages/server/src/local/cron.ts`
(`LocalScheduler`) + `packages/server/src/local/routes/cron.ts` (`/api/cron/*`). The backend-map
is explicit: "Automations = a rename/extension of cron" (`_inventory/backend-routes.md:531`).

Two intelligence-layer surfaces overlap here and must NOT be double-built:
- **`ScheduledJobsApp.tsx`** (dock id `scheduled-jobs`) — the existing cron CRUD UI; this IS the
  Automation Center seed.
- **`EventsApp.tsx`** (dock id `events`) — agent event/step stream + agent tree; this is the
  closest existing analog for the Builder's "actions = agent task" and for History/Logs detail,
  but it streams live `AgentStep`s, NOT cron execution rows. Different data source.

---

## 2. Required states (PRD / Blueprint)

**PRD §12.10 tabs:** Overview, Running, Scheduled, Triggers, History, Logs.
**Automation Builder steps:** Trigger → Condition → Actions → Review & Activate.
**Automation fields:** name, trigger, condition, actions, agent, notification, schedule, workspace, status.
**Actions:** run now, pause, edit, view logs, retry, disable.
**Cross-screen:** "Failed or risky automations surface in Home Cockpit attention required" (§12.10,
also Journey 16 / J17 `_blueprint_extracted.txt:224-226`, S01 Home Cockpit gap card dependency).

**States** (PRD §12.10 + §14.6 Automation states, lines 895-904; blueprint `:356-357`):
Draft, Scheduled, Running, Success, Failed, Paused, Awaiting approval, Disabled — plus the §14.1
global mandatory states: Loading, Empty, Populated, Error, Offline/local-only, Permission denied.

**Acceptance:** "Overnight work is visible, reviewable and stoppable" (PRD line 610; blueprint `:358-359`).

**Mockup (directional only):** header stat tiles (Active 8 / Scheduled 24 / Triggers 12 / Success
Rate 98.6% / Hours Saved 156h), an "Automation Health" donut (Healthy/Warning/Failed/Paused), a
"Running Automations" list with progress bars, a "Scheduled Automations" table (name / schedule /
next-run / workspace / status), a "Recent Activity" feed, and a "Popular Templates" rail. These map
to existing substrate (see §5) EXCEPT the analytics tiles (success-rate / hours-saved) and live
progress bars, which have no backing today — treat as derived/aspirational, not v1 blockers.

---

## 3. Current state in repo

**Disposition: `rework`** (promote + extend `ScheduledJobsApp` into Automation Center; the cron
substrate is solid and reused wholesale — this is the textbook in-place refactor case).

### Frontend (exists)
- **`apps/web/src/components/os/apps/ScheduledJobsApp.tsx`** — full cron CRUD UI. Single flat list +
  inline create form. Calls `adapter.getCronJobs / createCronJob / updateCronJob / deleteCronJob /
  triggerCronJob`. Create form already collects `jobType` (6 types via `CRON_JOB_TYPES`), schedule
  (presets + custom cron via `CRON_SCHEDULE_PRESETS`), and an output channel (log/telegram). Per-row:
  toggle enable/disable, Run-now (`triggerCronJob`, auto-enable handled), delete. **No tabs, no
  history/logs view, no "Builder" stepper, no triggers concept.**
- **`apps/web/src/lib/cron-presets.ts`** — `CRON_JOB_TYPES` (6 job types w/ labels+descriptions),
  `CRON_SCHEDULE_PRESETS` (6 cadences), `describeCronExpr`, `isPlausibleCronExpr`. Reuse as-is for
  the Builder's schedule step.
- **`apps/web/src/components/os/apps/EventsApp.tsx`** — agent step stream (live/tree/replay tabs),
  `buildAgentTree`. NOT cron-backed; relevant only as a visual pattern for History/Logs, not a data
  source.
- **`apps/web/src/lib/types.ts:230-238`** — `CronJob { id, name, schedule, workspaceId, enabled,
  lastRun?, nextRun? }`. Lossy projection (drops `jobType`, `jobConfig`, `nextRun` exists but
  `lastRunAt`/`nextRunAt` are remapped to `lastRun`/`nextRun` by `normalizeCronJob` in `adapter.ts`).
- **`apps/web/src/lib/adapter.ts:811-851`** — cron methods. **Two defects to fix in the rework:**
  1. `updateCronJob` (`:836`) issues **`PUT /api/cron/:id`**, but the server registers ONLY
     `PATCH /api/cron/:id` (`routes/cron.ts:115-124`) — there is **no PUT cron route**
     (grep-confirmed). The toggle in `ScheduledJobsApp.handleToggle` goes through this and would
     404. Change to PATCH.
  2. **No `getCronHistory` adapter method** exists, even though the route does (`/api/cron/:id/history`,
     `notifications.ts:198-210`). History/Logs tabs need it added.

### Backend (exists, reused wholesale)
- **`packages/server/src/local/routes/cron.ts`** — POST/GET(list)/GET(:id)/PATCH/DELETE/POST(:id/trigger).
  Trigger calls `server.scheduler.executeJob` and auto-enables disabled jobs (`:188-191`), emits a
  `cron`-category notification (`:197-202`).
- **`packages/server/src/local/routes/notifications.ts:198-210`** — `GET /api/cron/:id/history`
  → `cronStore.getExecutionHistory(id, limit)` → `{ history, count }`.
- **`packages/core/src/cron-store.ts`** — `CronStore`: schedules table (`cron_schedules`), execution
  history (`cron_execution_history` w/ `success`, `duration_ms`, `result_summary`, `error` — `:88-101`),
  notifications. `recordExecution` (`:281`), `getExecutionHistory` (`:294`). 6 `CronJobType`s (`:15`):
  `agent_task | memory_consolidation | workspace_health | proactive | prompt_optimization | monthly_assessment`.
- **`packages/server/src/local/cron.ts`** — `LocalScheduler`: tick loop, concurrency guard,
  per-job failure tracking, **auto-disable after 5 consecutive failures** (`MAX_CONSECUTIVE_FAILURES`,
  `:23,138-141`) — this maps directly to the §14.6 "Failed"/"Disabled" states.
- **`packages/server/src/local/setup-crons.ts`** + `executeJob` wiring (job-type dispatch) — confirm
  which job types actually execute when planning the Builder's "Actions" step.

### What's MISSING entirely (net-new frontend, no backend store needed)
- **Trigger concept.** Cron is time-only (`cronExpr`). PRD §12.10 "Triggers" tab + Builder "Trigger"
  step imply event-driven triggers (not just schedules). No event-trigger substrate exists; v1 should
  scope Trigger = schedule-only, with event-trigger as an open question (see §9).
- **Condition concept.** No `condition` field on `CronSchedule`. Builder "Condition" step is net-new
  (model as optional `jobConfig.condition`, no schema change).
- **Analytics** (success-rate %, hours-saved, health donut) — derivable from `cron_execution_history`
  but no aggregation endpoint/UI today.

---

## 4. Frontend work

### Components to create / rework
| Component | Action | Notes |
|---|---|---|
| `ScheduledJobsApp.tsx` → **`AutomationCenterApp.tsx`** | **rework/rename** | Promote to tabbed shell: Overview / Running / Scheduled / Triggers / History / Logs (PRD §12.10). Keep the proven cron CRUD wiring; lift the existing flat list into the "Scheduled" tab. Add an Automation Health summary (counts by enabled/disabled/failed from existing data). Keep dock id `scheduled-jobs` OR add an alias (don't break `dock-tiers.ts` `AppId` union + `Desktop.renderAppContent` switch — `frontend.md:142-151`). Update `appConfig` title/icon in `Desktop.tsx`. |
| `AutomationBuilder.tsx` (overlay) | **create-new** | 4-step stepper (Trigger → Condition → Actions → Review & Activate) per PRD §12.10. Reuse the existing create-form fields (jobType, schedule presets, output channel) from `ScheduledJobsApp` + `cron-presets.ts`. Use the shadcn stepper-style pattern (PRD §19 "Builder stepper"); align with sibling builders (Agent/Skill builders, other S-cards). |
| `AutomationCard.tsx` | **create-new (small)** | Per-automation row: name, schedule summary (`describeCronExpr`), next-run, workspace, status badge (Running/Scheduled/Paused/Failed/Disabled), actions (run-now/pause/edit/logs/delete). Extract from current inline `ScheduledJobsApp` row JSX. |
| History/Logs tab content | **create-new** | List `cron_execution_history` rows (executed_at, duration, success/error, result_summary). Visual pattern can borrow `EventsApp` StepCard expand/collapse, but data = cron history, not `AgentStep`. |

### Reuse targets
- `cron-presets.ts` (schedule presets + job-type catalog + `describeCronExpr`) — as-is.
- `HintTooltip`, shadcn `tabs`/`table`/`badge`/`skeleton`/`dialog` (`components/ui/*`, `frontend.md:336-342`).
- Status-badge + skeleton/empty/error patterns already used across apps.
- `EventsApp` StepCard pattern (visual only) for the Logs detail rows.

### Adapter methods / hooks
- **Fix** `adapter.updateCronJob` → `PATCH` (currently `PUT`, 404s — `adapter.ts:837`).
- **Add** `adapter.getCronHistory(id, limit?)` → `GET /api/cron/:id/history` (route exists,
  `notifications.ts:202`).
- **Add** `adapter.pauseCronJob(id)` thin helper → `PATCH /api/cron/:id { enabled:false }`
  (PRD calls it "pause"; backend models it as `enabled:false` — `backend-routes.md:540`).
- **(Optional) Add** an `automations` alias namespace in the adapter so the new components read
  PRD vocabulary while pointing at `/api/cron/*` — keeps the rename cosmetic, zero backend churn.
- **New hook `useAutomations`** (mirror `useWaggleDance`/`useNotifications` shape): wraps
  list/create/update/delete/trigger/pause/history; optionally subscribes to the existing
  `/api/notifications/stream` (`cron`-category events) for live status. No new SSE channel needed.
- Cross-screen: emit failed-automation count into the S01 Home Cockpit "attention required" feed
  (PRD §12.10; consumes `cron_execution_history.success=0` + scheduler auto-disable signal).

### Props / state
- `AutomationCenterApp`: `activeTab`, `jobs: CronJob[]`, `loading`, `creating`, per-row `triggering`.
- `AutomationBuilder`: `step`, `{name, jobType, scheduleExpr, workspaceId, condition?, outputChannel}`,
  `testing?` (Review step "test" before activate, per PRD §12.10 / Journey 12 step 5).
- Extend `CronJob` FE type with `jobType` + `jobConfig` (currently dropped by `normalizeCronJob`) so
  the Builder can round-trip edits without re-deriving.

---

## 5. Backend work (PRD §16.10 endpoint-by-endpoint)

> Verdict for the whole section: **the cron substrate is complete; §16.10 is a rename/alias job, NOT
> net-new backend.** Backend-routes inventory: §16.10 = 0 EXISTS / 6 PARTIAL / 0 MISSING
> (`backend-routes.md:595`). All six "Automation" endpoints map onto existing `/api/cron/*` in
> `routes/cron.ts` + the history route in `notifications.ts`. Substrate touched: `cron_schedules` +
> `cron_execution_history` (in the personal/workspace `.mind` DB via `CronStore`). **No `.mind`
> migration required** (both tables already exist with lazy creation, `cron-store.ts:135-157`).

| PRD §16.10 endpoint | Status | EXTEND vs NET-NEW · substrate |
|---|---|---|
| `GET /api/automations` | **PARTIAL** | EXTEND: alias of `GET /api/cron` (`cron.ts:94`). Either register an `/api/automations` alias plugin that re-exports the cron handlers, or just point the new UI at `/api/cron`. Substrate: `cron_schedules`. |
| `POST /api/automations` | **PARTIAL** | EXTEND: alias of `POST /api/cron` (`cron.ts:67`). To support PRD `condition`, stash it in `jobConfig.condition` (no schema change — `job_config TEXT`). |
| `PATCH /api/automations/:id` | **PARTIAL** | EXTEND: alias of `PATCH /api/cron/:id` (`cron.ts:115`). |
| `POST /api/automations/:id/run` | **PARTIAL** | EXTEND: alias of `POST /api/cron/:id/trigger` (`cron.ts:172`; auto-enables + executes + emits notification). |
| `POST /api/automations/:id/pause` | **PARTIAL** | EXTEND: no dedicated `/pause`; equivalent is `PATCH /api/cron/:id { enabled:false }`. Add a thin `/pause` route OR have the adapter call PATCH (`backend-routes.md:540`). |
| `GET /api/automations/:id/logs` | **PARTIAL** | EXTEND: alias of `GET /api/cron/:id/history` (`notifications.ts:202` → `cronStore.getExecutionHistory`). Substrate: `cron_execution_history`. |

**Implied additions NOT in §16.10 (flag for plan):**
- **Overview/analytics aggregation** (mockup tiles: active/scheduled/success-rate/hours-saved + health
  donut). No endpoint sums `cron_execution_history` today. Either compute client-side from per-job
  history (cheap for small N) OR add a thin `GET /api/automations/summary`. Hours-saved has no source —
  drop or stub. **Not a v1 blocker.**
- **Builder "test" before activate** (PRD §12.10 / Journey 12). `POST /api/cron/:id/trigger` runs a
  real (auto-enabling) execution; there is no dry-run. Either reuse trigger as the "test run" (accepting
  it really runs) OR scope test-run as an open question.

**.mind migration flag:** NONE. `cron_schedules` + `cron_execution_history` + `notifications` all
self-create (`cron-store.ts:135-157`). The only schema-adjacent change is storing `condition` inside
the existing `job_config` JSON blob.

---

## 6. Shared types needed (PRD §15 vs `lib/types.ts`)

PRD §15 has **no dedicated Automation type** (the §15.2 unions cover Workspace/Memory/Artifact/Agent
but not Automation). So the type work is FE-local:

- **Extend `CronJob`** (`lib/types.ts:230-238`) with `jobType: CronJobType` and `jobConfig?:
  Record<string, unknown>` (both currently dropped on the FE side by `normalizeCronJob` —
  `adapter.ts:818`). Keep the legacy `schedule`/`lastRun`/`nextRun` remap for back-compat.
- **Add `CronExecutionRow`** FE mirror of the server type (`cron-store.ts:48-57`:
  `id, schedule_id, schedule_name, executed_at, duration_ms, success, result_summary, error`) for the
  History/Logs tab — camelCased in the adapter.
- **Add an `AutomationStatus` union** for badge rendering: derived (not stored) from
  `enabled` + last-history-row success + scheduler disabled-set: `'scheduled' | 'running' | 'paused' |
  'failed' | 'disabled'`. Maps to PRD §14.6.
- The 6-member `CronJobType` union is **duplicated** in two places (`cron-presets.ts:15` and
  `core/cron-store.ts:15`) — reuse `cron-presets.ts`'s for FE; do NOT add a third copy.
- No PRD §15.2 union (`AutonomyLevel`, `ExtensionType`, etc.) is required for this screen.

---

## 7. Dependencies (screens / phases first)

- **Phase 3 — Intelligence layer** (PRD §8 / Roadmap Sprint 6, lines 236-240, 1344-1351). Same sprint
  as Agent Center/Builder + Skills Hub/Builder; the Automation Builder's "Actions = run an agent task"
  step benefits from Agent Center existing first, but cron's `agent_task` job type already works
  standalone, so it is **not a hard block**.
- **S01 Home Cockpit** (downstream consumer): failed/risky automations must surface in Home "attention
  required" (PRD §12.10, §12.1). Coordinate the failed-count signal contract with the S01 gap card.
- **AppShell / dock IA** (Phase 0): the rename/relocation of `scheduled-jobs` into the Intelligence
  bucket touches `dock-tiers.ts` `AppId` + `Desktop.tsx` `appConfig`/`renderAppContent`
  (`frontend.md:142-151`). Sequence after the Phase-0 IA freeze.
- Builder stepper pattern should be shared across Agent/Skill/Automation builders — coordinate the
  common stepper primitive (PRD §19.1 "Builder stepper") rather than three bespoke steppers.

---

## 8. Effort

**M.** The backend is essentially free (6 PARTIAL endpoints = thin aliases over existing cron routes +
two real adapter fixes). Frontend is a moderate rework: promote the existing single-list
`ScheduledJobsApp` to a 6-tab Center, build a 4-step Builder overlay, add a History/Logs tab over an
existing route, and wire the Home-Cockpit failed-automation signal. No new data store, no `.mind`
migration. Pushes toward L only if event-driven Triggers (vs schedule-only) are pulled into v1.

---

## 9. Open questions

1. **Triggers tab scope.** PRD §12.10 lists "Triggers" as a tab and a Builder step, but cron is
   schedule-only. Is v1 schedule-only (Trigger = cron cadence), or must event-driven triggers (e.g.
   "on harvest complete", "on memory conflict") ship? No event-trigger substrate exists today.
2. **Condition step.** Is a real condition engine required, or is storing an advisory
   `jobConfig.condition` string (no evaluation) acceptable for v1?
3. **Builder "test run".** Only `POST /api/cron/:id/trigger` exists and it really executes (and
   auto-enables). Is reusing trigger as "test" acceptable, or do we need a dry-run path?
4. **Rename vs alias.** Register a true `/api/automations/*` alias plugin (PRD vocabulary in the
   network tab) or keep `/api/cron/*` and rename only in the UI/adapter? (Affects the backend-map
   contract surface.)
5. **Dock relocation.** Move `scheduled-jobs` into a new Intelligence dock zone, or keep its current
   dock slot and just retitle? Confirm against the Phase-0 IA freeze.
6. **Analytics tiles.** Mockup shows success-rate % and "Hours Saved 156h". Success-rate is derivable
   from `cron_execution_history`; hours-saved has no source. Drop hours-saved, or define a heuristic?
7. **Scope of automation = workspace vs global.** Cron supports `workspaceId:'global'` → `'*'`
   (`cron.ts:73-74`). Does the Center show all-workspace automations, or filter to the active workspace?
