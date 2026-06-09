# Gap Card — S20 Automation Builder

> UX-refactor planning artifact. Execution model: **in-place incremental refactor** of
> `apps/web` + targeted backend extensions. Mockups are directional (PRD §24); PRD acceptance
> criteria win. Every claim is grounded in a real file path below.
>
> Sources: PRD §12.10 + §16.10 (`docs/Waggle_OS_UX_Refactor_Master_Handoff_Package/Waggle_OS_UX_Refactor_PRD.md`),
> Blueprint screen 20 (`_blueprint_extracted.txt:423-429`), mockup
> `Waggle_OS_Handoff_Assets/screens_18_21_builders_and_marketplace.png`, baseline inventories under
> `docs/ux-refactor/_inventory/`, backend-map `docs/backend-map/sections/03f-api-realtime-ops.md`.

---

## 1. Screen & purpose

A 4-step **stepper** builder that lets a user create a scheduled or event-driven workflow
("automation"). PRD §12.10 / Blueprint screen 20: *"Create scheduled or event-driven workflow.
Choose trigger/condition/actions/agent/notification, test, activate."*

PRD §12.10 fields (line 605): `name, trigger, condition, actions, agent, notification, schedule,
workspace, status`. Builder steps (PRD line 604): **Trigger → Condition → Actions → Review &
Activate**. This is the *create/edit* surface; the *list/run/pause/logs* surface is the sibling
**Automation Center** (screen 11, PRD §12.10 tabs Overview/Running/Scheduled/Triggers/History/Logs)
— scoped in its own card, but they share the same backend (cron) and types.

Mockup (directional, panel labelled "20. Automation Builder", top-right of
`screens_18_21_builders_and_marketplace.png`): left rail = step list (Trigger/Condition/Actions/
Review); center = config form with a **Trigger** block (schedule vs event), a **Condition** block,
an **Actions** list, an **Agent** selector and a **Notification** target; footer = Test +
Activate buttons.

---

## 2. Required states (PRD/Blueprint)

PRD §14.6 automation lifecycle states: `Draft, Scheduled, Running, Success, Failed, Paused,
Awaiting approval, Disabled`. Blueprint screen-20 states (`_blueprint_extracted.txt:428-429`):
**Draft; test fail; active; scheduled; approval needed.**

Builder-screen states (the create flow itself), composed with PRD §14.1 global states:
- **Draft / editing** — stepper in progress, per-step validation (e.g. invalid cron expr, no action chosen).
- **Test running / test pass / test fail** — dry-run a draft before activating (PRD line 604 "test").
- **Activating → Scheduled/Active** — on save the automation appears in Automation Center + Home overnight summary (PRD line 607, 611).
- **Approval required** — an automation whose actions touch an elevated/risky capability must surface an approval prompt (PRD §17.3 "Automations can only run actions allowed by the user/team role"; PRD line 607 "risky automations surface in Home").
- **Loading / Error / Offline / Permission-denied** — global states (PRD §14.1). Offline: degrade gracefully, keep draft local.

---

## 3. Current state in repo

**Disposition: `rework`** (promote the existing cron surface into the Trigger/Actions skeleton;
the Condition step + event-triggers + test/approval are net-new but build on cron — no new store).

Current implementation is the **cron** surface, not an "Automation Builder":

| Layer | File | What it does today |
|---|---|---|
| Frontend app | `apps/web/src/components/os/apps/ScheduledJobsApp.tsx` | Single-screen "Scheduled Jobs" manager (NOT a stepper). Inline create form with 4 fields: name, **jobType** (`<select>` over `CRON_JOB_TYPES`), **schedule** (preset `<select>` + custom cron), **outputChannel** (`log`/`telegram`). List rows: enable/disable toggle, run-now (`Play`), delete. `:55` create, `:93` toggle, `:102` delete, `:112` trigger. No condition, no agent picker, no test, no review step. |
| Form helpers | `apps/web/src/lib/cron-presets.ts` | `CRON_SCHEDULE_PRESETS` (6 cadences), `CRON_JOB_TYPES` (6 types), `describeCronExpr` / `isPlausibleCronExpr` cron→English. Reusable as-is for the Trigger step. |
| Adapter | `apps/web/src/lib/adapter.ts:815-845` | `getCronJobs`, `createCronJob`, `updateCronJob`, `deleteCronJob`, `triggerCronJob` → `/api/cron*`. |
| FE type | `apps/web/src/lib/types.ts:230-238` | `CronJob { id, name, schedule, workspaceId, enabled, lastRun?, nextRun? }` — **lossy**: drops `jobType`, `jobConfig`, `createdAt`; renames `cronExpr`→`schedule`, `nextRunAt`→`nextRun`. No `trigger`/`condition`/`actions`/`agent`/`notification`/`status` (the PRD §15/§12.10 automation shape). |
| Route | `packages/server/src/local/routes/cron.ts` | Full CRUD + `POST /api/cron/:id/trigger` (auto-enables on run, `:188`). |
| Store | `packages/core/src/cron-store.ts` | `CronStore` over `.mind`: `cron_schedules` (`:71`), `cron_execution_history` (`:88`), `notifications` (`:104`). Schedule row: `name, cron_expr, job_type, job_config, workspace_id, enabled, last_run_at, next_run_at`. **No trigger-type, condition, or actions columns** — `job_config` is a free JSON blob. |
| Scheduler | `packages/server/src/local/cron.ts` | `LocalScheduler` — 60 s tick, `getDue()` poll, `executeJob()` for manual trigger, auto-disable after 5 consecutive failures (`MAX_CONSECUTIVE_FAILURES`), `onJobComplete` notify callback. **Time-driven only.** |
| Executor (the real "actions") | `packages/server/src/local/index.ts:1379-1751` | `new LocalScheduler(cronStore, async (schedule) => switch(schedule.job_type){…})`. Cases: `memory_consolidation` (`:1381`, incl. `action:'index_reconcile'` marketplace sync), `workspace_health` (`:1504`), `proactive` (`:1525`, sub-actions morning_briefing/stale_workspace_check/task_reminder/capability_suggestion `:1561-1582`), `prompt_optimization` (`:1590`), `agent_task` (`:1722`, runs a `jobConfig.prompt` in a workspace), `monthly_assessment`. |
| History route | registered in `notifications.ts` | `GET /api/cron/:id/history` (backend-map `03f:147`) → execution rows. |

**Grep confirmation:** no `Automation`/`AutomationBuilder` component, no event-trigger code, no
`condition` field. The 13 frontend hits for "Automation|trigger|condition" are the word "trigger"
used in unrelated contexts (`triggerCronJob`, MCP triggers, marketplace) — confirmed none is an
automation builder. (`ScheduledJobsApp.tsx` is the only real match.)

**Mental model match:** what the user calls "trigger" today is **only a cron schedule** (time).
What the user calls "actions" today is **a single `jobType`** chosen from a fixed catalog (one
action per job). There is **no condition, no multi-action sequence, no per-automation agent
binding (except via `agent_task` prompt), and no event triggers.**

---

## 4. Frontend work

**New components (`apps/web/src/components/os/apps/automations/`):**

- `AutomationBuilder.tsx` — 4-step stepper (reuse the **Builder stepper** DS pattern from Agent/Skill
  builders — PRD §19.1; align with `CreateAgentForm.tsx` in `apps/web/src/components/os/apps/agents/`).
  Owns draft state `{ name, trigger, condition, actions[], agentId?, notification, schedule,
  workspaceId, status:'draft' }`; submits via adapter (see §5).
- `TriggerStep.tsx` — radio: **Schedule** (reuse `cron-presets.ts` preset/custom `<select>` +
  `describeCronExpr` preview — lift the schedule block straight out of `ScheduledJobsApp.tsx:195-223`)
  vs **Event** (gated/"coming soon" if event triggers aren't built — see §5/§9). Workspace scope picker
  (reuse `useWorkspaces`).
- `ConditionStep.tsx` — optional predicate (e.g. "only if N+ new frames", "only on weekdays"). **Net-new
  concept** — no substrate; ship a minimal optional condition stored in `job_config.condition` (no DB
  migration; see §5). Keep simple — PRD §3.2/§19.2 ("not forced during onboarding").
- `ActionsStep.tsx` — choose one or more actions. v1 maps to the existing `CRON_JOB_TYPES` catalog
  (the only executable actions today, `index.ts` switch). For `agent_task`, surface an **Agent**
  selector (reuse `useWorkspaces` + persona/agent picker from `agents/`) and a prompt field; for
  `proactive`, surface the sub-action choice; plus a **Notification** target (reuse the
  `log`/`telegram` `outputChannel` selector already in `ScheduledJobsApp.tsx:225-242`).
- `ReviewStep.tsx` — summary + **Test** button (dry-run, see §5) + **Activate** button.
- `AutomationCenter.tsx` (sibling, may be its own card) — promote `ScheduledJobsApp.tsx` into the
  PRD §12.10 tabbed Center (Overview/Running/Scheduled/Triggers/History/Logs), wiring `GET
  /api/cron/:id/history` for the Logs tab.

**Reuse targets:** `cron-presets.ts` (whole module), the schedule + output-channel JSX blocks in
`ScheduledJobsApp.tsx`, the stepper chrome from `agents/CreateAgentForm.tsx`, `useToast`,
`useWorkspaces`, `ui/select`/`ui/input`/`ui/dialog`.

**Adapter methods/hooks:** extend `lib/adapter.ts` cron methods to round-trip `jobType` +
`jobConfig` (currently `createCronJob` already accepts `jobConfig` — `:821`; the lossy FE `CronJob`
type is what drops it on read). Add `testAutomation(draft)` and (if added) `pauseCronJob(id)`,
`getCronHistory(id)`. New `useAutomations()` hook wrapping these (mirrors existing domain-hook
pattern). **Register the new app** in `Desktop.tsx` `appConfig` + `renderAppContent` switch and
the dock (`lib/dock-tiers.ts`), under the **Intelligence** IA bucket (PRD §10.3) — the existing
`scheduled-jobs` AppId can be renamed/aliased to `automations`.

---

## 5. Backend work (PRD §16.10)

> **Substrate verdict (matches the backend-routes inventory):** all six §16.10 endpoints are
> **PARTIAL** — the cron surface (`/api/cron*`) already provides full CRUD + trigger + history. The
> refactor **aliases/extends cron as "automations"**; no new store. `trigger`/`condition`/`actions`
> ride in the existing `job_config` JSON blob → **no `.mind` migration** for v1.

| PRD §16.10 endpoint | Status | Extend (existing) vs net-new + substrate it touches |
|---|---|---|
| `GET /api/automations` | **PARTIAL** | **Extend** `GET /api/cron` (`cron.ts:94`). Alias path; reshape `toResponse` to expose `trigger/condition/actions/status` derived from `job_type` + `job_config`. Substrate: `cron_schedules`. |
| `POST /api/automations` | **PARTIAL** | **Extend** `POST /api/cron` (`cron.ts:67`). Accept the richer automation body; persist `trigger`/`condition`/`actions` into `job_config` (and `cron_expr` for schedule triggers). Substrate: `cron_schedules`. |
| `PATCH /api/automations/:id` | **PARTIAL** | **Extend** `PATCH /api/cron/:id` (`cron.ts:124`). Substrate: `cron_schedules`. |
| `POST /api/automations/:id/run` | **PARTIAL** | **Extend** `POST /api/cron/:id/trigger` (`cron.ts:174`, runs `scheduler.executeJob`, auto-enables). Substrate: `cron_schedules` + executor switch (`index.ts:1379`). |
| `POST /api/automations/:id/pause` | **PARTIAL** | No `/pause` route. **Net-new thin route OR reuse** `PATCH /api/cron/:id {enabled:false}`. Add `/pause` alias for the PRD contract. Substrate: `cron_schedules.enabled` + scheduler `resetFailure`. |
| `GET /api/automations/:id/logs` | **PARTIAL** | **Extend/alias** `GET /api/cron/:id/history` (in `notifications.ts`; backend-map `03f:147`). Substrate: `cron_execution_history` (`cron-store.ts:88`). |

**Net-new beyond §16.10 (PRD requires, backend lacks):**

1. **Test / dry-run** (PRD line 604 "test"). No route today. **Net-new** `POST /api/automations/test`
   that runs `scheduler.executeJob` against an unsaved draft (or a draft saved `enabled:false`) and
   returns the result without scheduling. Touches the executor switch (`index.ts:1379-1751`) — must
   make it callable with an ad-hoc schedule object, not only persisted rows.
2. **Condition evaluation** (PRD step 2). Net-new logic in the executor: before running actions, read
   `job_config.condition` and short-circuit. No new table — `condition` is a JSON sub-field of
   `job_config`. Keep predicate vocabulary minimal in v1.
3. **Event triggers** (PRD "event-driven", §14.6 "trigger fired", Blueprint "scheduled or
   event-driven"). **Major net-new substrate gap** — `LocalScheduler` is **time-poll only**
   (`cron.ts` `getDue()` on `next_run_at`). True event triggers need an event→automation dispatch
   path (could hang off `server.eventBus` audit/notification stream — `03f:321-347`). **Recommend
   deferring event triggers to a later phase**; ship schedule-triggers only in v1 and gate the
   "Event" option (see §9, §8).
4. **Approval gate for risky actions** (PRD §17.3, line 607). When an automation's actions touch an
   elevated capability, route through the existing approval/install-audit machinery
   (`/api/approval/*`, `install-audit.ts`). Wiring net-new; substrate exists.

**`.mind` migration flag:** **None required for v1** (trigger/condition/actions live in the existing
`job_config TEXT` blob — `cron-store.ts:77`). A later migration could promote `trigger_type` /
`status` to real columns (the migration runner already does idempotent additive `ADD COLUMN` on
`.mind` tables — see substrate-types `§(c)` precedent) **only if** they become query/filter axes for
Automation Center tabs (Running/Scheduled/Triggers).

---

## 6. Shared types needed (PRD §15 vs `lib/types.ts`)

PRD §15.2 unions `AutonomyLevel` / `AgentType` are **MISSING** from `apps/web/src/lib/types.ts`
(per substrate-types `§(e)`). Blueprint §17 names an **Automation** entity (`_blueprint_extracted.txt:553`):
`id, scope, trigger, condition, actions, agentId, schedule, notificationTargets, status, lastRunAt,
nextRunAt`. None of this exists in FE types today.

- **Add `Automation` interface** to `lib/types.ts` (Blueprint shape above) replacing the lossy
  `CronJob` (`types.ts:230`) — or layer it as a richer superset and have the adapter map cron rows
  into it. Add `AutomationTriggerType = 'schedule' | 'event'`, `AutomationStatus = 'draft' |
  'scheduled' | 'active' | 'running' | 'paused' | 'failed' | 'awaiting_approval' | 'disabled'`
  (PRD §14.6), and an `AutomationAction` discriminated union keyed on the existing `CronJobType`
  catalog (`cron-presets.ts:15`).
- Reconcile FE↔BE: the FE `CronJob` already mismatches the `/api/cron` response shape
  (`cronExpr`→`schedule`, drops `jobType`/`jobConfig`) — fix this drift as part of the type work.
- Keep the canonical `CronJobType` union single-sourced (currently duplicated in
  `cron-presets.ts:15` AND `packages/core/src/cron-store.ts:15` — flag the dup; do not add a third).

---

## 7. Dependencies (screens/phases first)

- **PRD Phase 3 (Intelligence layer)** — same phase as Agent/Skill builders; reuse their stepper.
- **Agent Builder (S18/agents)** must define the agent picker the `ActionsStep` agent selector binds
  to (PRD §12.9). Soft dependency — can fall back to persona/`useWorkspaces` until Agent entity lands.
- **Automation Center (screen 11)** is the list/run/logs sibling — share types + adapter; build the
  Center's Logs tab on the same `/api/cron/:id/history`.
- **Home Cockpit (S?)** — overnight summary + "attention required" must surface failed/risky
  automations (PRD line 607, 611). Soft consumer dependency (Home reads automation status).
- **Approval surface (`ApprovalsApp` / `/api/approval/*`)** — for the risky-action gate (§5.4).
- **DS:** Builder stepper + Approval prompt primitives (PRD §19.1) shared across all builders.

---

## 8. Effort: **L**

Rework + extend is cheap (the cron store/route/executor + `cron-presets` + output-channel UI all
exist and are reusable), but the gap between "cron job manager" and the PRD's
**Trigger/Condition/Actions/Agent/Notification stepper + Test + approval-gated activate** is wide:
net-new Condition step, dry-run test endpoint, FE type reconciliation, and an Agent binding. The
**Event-trigger half is XL on its own** (no event-dispatch substrate) and is recommended **out of
v1 scope** — if it stays in, this becomes XL.

---

## 9. Open questions

1. **Event triggers in v1 or schedule-only?** `LocalScheduler` is time-poll only; true event triggers
   need a new event→automation dispatch path off `server.eventBus`. Recommend defer + gate the "Event"
   radio option. (Ties to PRD §23 open-question spirit on scope.)
2. **Condition vocabulary** — what predicates does v1 support? (frame-count threshold, day-of-week,
   workspace-state flag?) PRD names "condition" but specifies no predicate set.
3. **One action or multiple per automation?** Today one `job_type` == one action. PRD says "actions"
   (plural). v1 = single action mapped to `CronJobType`, or true multi-action sequence (needs executor
   rework + ordering semantics in `job_config`)?
4. **Does `pause` get a dedicated route or reuse `PATCH …{enabled:false}`?** Affects the §16.10
   contract surface and Automation Center.
5. **Which `.mind`** do automations live in — personal vs per-workspace? `cron_schedules.workspace_id`
   is nullable + `'global'→'*'` normalized (`cron.ts:74`); confirm scope model for the §16.10 list.
6. **Risky-action approval class** — which actions are "elevated" (e.g. `agent_task` writing files,
   marketplace `index_reconcile`)? Needs an approval-class mapping before the §5.4 gate can ship.
7. **Naming/AppId** — rename `scheduled-jobs` AppId → `automations`, or keep both (alias)? Affects dock
   + window-manager + the dead-id cleanup already flagged in the frontend inventory.
