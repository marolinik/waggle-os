# Gap Card — S10 · Team Workspace

> Screen S10 of the Waggle OS UX-refactor. Execution model is the LOCKED **in-place
> incremental refactor** of `apps/web` + targeted backend extensions. Mockups are
> directional; PRD acceptance criteria win. Every claim below is grounded in real files.
>
> Sources: PRD §12.11 (lines 613-626), §16.11 (1152-1158), §17 RBAC (1162-1187),
> §10.5 (329-338), §18 (1191-1218); blueprint `_blueprint_extracted.txt` lines 346-349,
> 470-473, 509, 514, 531-540, 542-545, J18/J19/J20/J21 (227-242); mockup
> `screen_10_team_workspace.png`.

---

## 1. Screen & purpose

**Purpose (PRD §12.11):** "Shared intelligence for teams." Team mode must feel like
**shared knowledge and shared outcomes**, not just a member list + chat (explicit
acceptance criterion, PRD line 626). It is the surface for the **Team layer** of the IA
(PRD §10.5): team workspace, members, roles/permissions, shared memory, shared artifacts,
shared skills, shared MCPs, and activity/audit.

This is a **Teams/Enterprise-tier** surface (PRD tier table; current placeholder gates it
to "Teams ($49/mo per seat) and Enterprise"). It is the UI home for RBAC (PRD §17) and the
team-governance API contract (PRD §16.11).

The mockup shows: workspace header with a team switcher + Invite/+ buttons; a metrics strip
(memory frames, agents, automations, tasks); a "Team Activity" feed; "Pinned" items;
"Team Members" panel with avatars/roles; a "Team Intelligence" summary card; "Upcoming"
events; and a "Team Goals" progress section. Treat as visual direction only.

---

## 2. Required states (PRD / Blueprint)

**Tabs (PRD §12.11, line 619):** Overview · Shared Memory · Shared Artifacts · Skills ·
Agents · MCPs · Automations · Settings.

**Overview content (PRD line 620):** team spaces, metrics, members, activity, pinned items,
team goals, upcoming events, team intelligence summary.

**Sharing (PRD line 621):** share memory / artifact / skill / MCP / automation **into team
scope subject to role**. Journeys: J19 share memory → choose scope → audit → appears in team
memory; J20 share artifact → team/workspace/member → permissions → activity feed (blueprint
234-239).

**Member management + RBAC (PRD line 622):** invite/member management (J18: invite → role
selected → accept → permissions applied, blueprint 227-228).

**RBAC roles (conflict to resolve — see §6):**
- PRD §17.2 table: **Owner / Admin / Contributor / Viewer**.
- Blueprint §RBAC model + role table: **Owner / Admin / Member / Viewer / Guest** (lines 156,
  536-540, 603).
- Live substrate (`teams.db`): **owner / admin / member / viewer** (no contributor, no guest).

**Empty / loading / permission states (blueprint 470-473):** Loading, empty, populated,
**permission denied**; Invite pending, role conflict, shared/private, audit event. Member
actions: request access, change role, resend invite, export audit. J21: permission denied →
permission message → request access (**no silent failures or data leakage**, blueprint 240-242).

**Cache invalidation triggers (blueprint 514):** memory import, artifact update, agent run
completion, connector sync, automation completion, **RBAC change** — the Team Workspace must
re-fetch on any of these.

**Solo/offline behavior:** RBAC must be enforced at **both API and UI layers** (blueprint 162).
Local team CRUD already works in solo mode with a local userId (see §3).

---

## 3. Current state in repo (disposition: **rework**)

**Frontend — `apps/web/src/components/os/apps/TeamGovernanceApp.tsx` (45 lines):** a pure
**static placeholder**. It renders three hardcoded info cards (Role-Based Access / Tool
Governance / Audit Trail) + a tier-gate banner. **Zero data fetching, zero adapter calls, no
tabs, no members, no activity.** Registered as appId `governance` in `Desktop.tsx`/`Dock.tsx`
(see frontend inventory §a, line 47). The mockup's entire surface is unbuilt.

**Adapter — `apps/web/src/lib/adapter.ts`** has only the **remote-proxy** team methods:
`teamConnect` (`:1226`), `teamDisconnect`, `getTeamStatus` (`:1234`), `getTeamMembers`
(`:1239`), `getTeamActivity` (`:1247`), `getTeamMessages` (`:1255`), `searchTeamMemory`
(`:489`). **There are NO adapter methods for the local `/api/teams/*` CRUD** (create team,
get team detail, invite/add member, change role, remove member, team activity/audit). This is
the single biggest frontend wiring gap.

**Backend — substrate is strong and already live.** `packages/server/src/local/routes/team.ts`
exposes two prefixes:
- `/api/team/*` = **remote team-server proxy** with local fallbacks (connect/disconnect/status/
  teams/members/presence/activity/messages/governance/memory-search). `/api/team/connect` is
  `requireTier('TEAMS')` (`:110`); `/api/team/governance/permissions` is `requireTier('ENTERPRISE')`
  (`:418`).
- `/api/teams/*` = **local SQLite CRUD on `teams.db`** (`teams` + `team_members` tables, DDL at
  `team.ts:51-72`), works in **solo mode** via `getLocalUserId(dataDir)` (`:457`). Full CRUD:
  `POST /api/teams` (`:460`, auto-adds creator as `owner`), `GET /api/teams` (`:492`),
  `GET /api/teams/:id` (`:505`, returns team + members), `PUT /api/teams/:id` (`:523`),
  `DELETE /api/teams/:id` (`:553`, owner-only), `POST /api/teams/:id/members` (`:581`,
  owner/admin only — **this is invite/add**), `PUT`+`PATCH /api/teams/:id/members/:userId`
  (`:615`/`:642`, role change), `DELETE /api/teams/:id/members/:userId` (`:665`),
  `GET /api/teams/:id/activity` (`:690`, reads `audit_events` via `getAuditDb` from `events.js`,
  `:713-722`).

**RBAC is already enforced server-side** with per-action checks: owner/admin gate add-member
(`:591`), owner-only gate role change in PUT (`:624`) but owner/admin in PATCH (`:649` — a
real inconsistency to fix, see §9), owner-only delete-team (`:558`), can't remove the owner
(`:682`), member self-removal allowed (`:677`). The local `team_members.role` CHECK constraint
is `('owner','admin','member','viewer')` (`team.ts:64`) — **no contributor, no guest**.

**Remote/cloud governance substrate (backend-map §02b):** the Postgres team layer
(`packages/server/src/db/schema.ts`, 20 tables) has `teams`, `team_members` (composite PK
`(team_id,user_id)`, role default `'member'`, 02b:93-101), `team_entities`/`team_relations`/
`team_resources` (shared KG + assets, 02b:181-228), and the three **team-capability governance**
tables added in migration `0001`: `team_capability_policies` (standing policy per role, 02b:232),
`team_capability_overrides` (one-off allow/deny, 02b:247), `team_capability_requests`
(request→decision queue, 02b:262). These back the per-role tool allow/deny + approval surfaces
the mockup/PRD imply, **but only on the cloud server** — the local `/api/team/governance/permissions`
proxy (`:418`) is the only sidecar window into them. **Note (02b:44): Postgres FKs are all
`ON DELETE no action` — no cascades; deleting a team/user is blocked if children reference it.**

**Disposition rationale — rework (not create-new):** the `governance` app slot, the dock entry,
the tier-gate, and (critically) the **entire local team CRUD + RBAC enforcement substrate already
exist**. The screen needs the placeholder component replaced with a real tabbed surface wired to
existing routes + new adapter methods — not a new app and not a new backend data store.

---

## 4. Frontend work

**Rework `TeamGovernanceApp.tsx`** (rename concept to "Team Workspace"; keep appId `governance`
to avoid touching `Desktop`/`Dock`/`dock-tiers` routing) into a tabbed shell. Reuse the existing
tabbed-app pattern (`MemoryApp.tsx` 6-tab model, `SettingsApp.tsx` 8-tab model, `ui/tabs.tsx`).

**Components to create** (keep files small, 200-400 LOC per CLAUDE.md §coding-style):
- `apps/team/TeamWorkspaceApp.tsx` (or in-place rework of `TeamGovernanceApp.tsx`) — tab shell:
  Overview · Shared Memory · Shared Artifacts · Skills · Agents · MCPs · Automations · Settings.
  Tier-gate stays (Teams/Enterprise) via existing `LockedFeature.tsx` / `useFeatureGate`.
- `apps/team/TeamOverviewTab.tsx` — metrics strip + activity feed + pinned + team goals +
  upcoming + team-intelligence summary (mockup Overview).
- `apps/team/TeamMembersPanel.tsx` — member list with avatars + role badges + role-change
  dropdown + remove (gated by current-user role). Reuse `ui/avatar`, `ui/badge`,
  `ui/dropdown-menu`.
- `overlays/InviteMemberDialog.tsx` — invite by email/userId + role select (J18). Reuse
  `ui/dialog`, `ui/select`. POSTs to `/api/teams/:id/members`.
- `apps/team/TeamActivityFeed.tsx` — audit/activity list (reuse `TimelineApp`/`EventsApp` row
  styling). Export audit action (blueprint 472).
- `apps/team/ShareToTeamDialog.tsx` — scope picker (team/workspace/member) for sharing a
  memory/artifact/skill/MCP/automation into team scope with role check (J19/J20). Surfaced
  from Memory/Artifact screens too; lives here as the canonical component.
- `components/os/PermissionDenied.tsx` — shared "permission denied + request access" state
  (J21) — reusable across Team tabs and elsewhere.

**Reuse targets:** `MemoryApp`'s frame list for the Shared Memory tab (filtered to team scope
via `searchTeamMemory`); `CapabilitiesApp`/`AgentsApp`/`ScheduledJobsApp` list rows for the
Skills/Agents/MCPs/Automations tabs (read-only team-scoped views first). `ContextMenu` for
row-level "Share to team".

**New hook — `hooks/useTeam.ts`** (mirror `useWorkspaces` shape): returns `{ team, members,
activity, currentUserRole, createTeam, invite, changeRole, removeMember, refresh }`. Drives
RBAC at the UI layer (blueprint 162): compute `currentUserRole` from `GET /api/teams/:id`
members + local userId, then hide/disable actions per PRD §17.2 capability matrix.

**New adapter methods** (add to `lib/adapter.ts` `LocalAdapter`, local `/api/teams/*` family —
this is where new PRD §16 endpoints land per frontend inventory §c): `getTeams`,
`getTeam(id)`, `createTeam`, `updateTeam`, `deleteTeam`, `inviteMember(id, {userId?, email?,
displayName?, role?})`, `changeMemberRole(id, userId, role)`, `removeMember(id, userId)`,
`getTeamAudit(id)`, and (for §16.11) `shareToTeam(...)`.

**State management (blueprint 511-514):** Team Workspace re-fetches on the RBAC-change cache
trigger + memory-import/artifact-update/automation-completion triggers. Use the existing
`QueryClient` invalidation pattern.

---

## 5. Backend work (PRD §16.11)

| PRD §16.11 endpoint | Status | Action |
|---|---|---|
| `GET /api/teams/:id` | **EXISTS** | `team.ts:505` — returns team + members. Wire adapter `getTeam`. No backend change. |
| `POST /api/teams/:id/invite` | **PARTIAL → EXTEND** | Invite is implemented as `POST /api/teams/:id/members` (`team.ts:581`, owner/admin gated). **Add a thin `/invite` alias** that forwards to the members handler (PRD uses `/invite`; substrate is `team_members` in `teams.db`). No new substrate. |
| `PATCH /api/teams/:id/members/:memberId` | **EXISTS** | `team.ts:642` (`:userId` == PRD `:memberId`); `PUT` variant at `:615`. **Fix the PUT/PATCH role-gate inconsistency** (PUT owner-only vs PATCH owner/admin — §9). Wire adapter `changeMemberRole`. |
| `GET /api/teams/:id/audit` | **PARTIAL → ALIAS** | Closest is `GET /api/teams/:id/activity` (`team.ts:690`, reads `audit_events` via `events.js` `getAuditDb`). **Alias `/audit` → the activity handler** (or add the audit-export shape). Substrate: `audit_events` table (events.ts). No new store. |
| `POST /api/share` | **MISSING → NET-NEW** | No `/api/share` route anywhere (grep-confirmed across `local/routes`). Sharing into team scope today is **implicit** (workspace `teamId` linkage at create + remote team-server frame sync). Net-new route accepting `{ kind: memory\|artifact\|skill\|mcp\|automation, id, scope: team\|workspace\|member, targetId }`, **role-checked** (PRD §17.2 "Can share"), writing into the team scope and emitting an audit event (reuse `emitAuditEvent`, already used in `team.ts:484`). Touches: `team_entities`/`team_resources` (cloud, 02b) for the synced object, `audit_events` (local) for the trail. For solo/local mode, share = tag the frame/artifact with team scope (note the FE/DB scope is implicit per-`.mind` today — see §6 + substrate-types §c). |

**Implied additional route (not in §16.11, flag for plan):** an **install-audit / governance read
route** for the Skills/Agents/MCPs tabs. `InstallAuditStore.getRecent/getByCapability` exist in
`packages/core/src/install-audit.ts` but **have no HTTP endpoint** (substrate-types §d). The
Team Workspace governance view (who installed what / risk / trust / approval) needs e.g.
`GET /api/extend/audit` or `GET /api/teams/:id/governance` surfacing `team_capability_policies/
overrides/requests`. The Enterprise proxy `GET /api/team/governance/permissions` (`team.ts:418`)
is the only existing window and is read-only + ENTERPRISE-gated.

**.mind migration:** **None required for the team CRUD/RBAC core** — `teams.db` is a standalone
SQLite file with its own DDL (created on demand). The Postgres `team_capability_*` tables already
exist (migration `0001`). The only schema-adjacent work is if team-scope sharing needs a
structured `scope`/`teamId` on `memory_frames` (currently implicit per-`.mind`; substrate-types
§c flags `teamId`/`scope` as MISSING columns) — that would be a metadata-column migration on
`memory_frames`, deferrable behind the implicit-scope approach for v1.

---

## 6. Shared types needed (PRD §15 vs `lib/types.ts`)

- **No `Team` / `TeamMember` / `TeamRole` types exist in `apps/web/src/lib/types.ts`.** Add
  them (frontend inventory §d confirms the types.ts export list has no team entities). Source of
  truth for the server shapes: `team.ts` `TeamRole = 'owner'|'admin'|'member'|'viewer'` (`:21`),
  `MemberRow` (`team.ts:799-810` mapper).
- **RBAC role-union conflict — MUST be resolved before coding (decision needed, §9):**
  - PRD §17.2 → `Owner | Admin | Contributor | Viewer`
  - Blueprint → `Owner | Admin | Member | Viewer | Guest`
  - Live `teams.db` CHECK → `owner | admin | member | viewer`
  Recommendation: keep the live 4-role union (`owner/admin/member/viewer`) for v1 to avoid a DB
  CHECK migration + RBAC-logic rewrite; treat PRD "Contributor" == "Member" and defer "Guest" as
  a follow-up (it needs a new role + new deny-by-default capability rules). Surface this to the
  founder per CLAUDE.md §3.1.
- **`Scope` union** (`personal/workspace/team/organization`) — MISSING in FE types
  (substrate-types §e). Needed for `ShareToTeamDialog`. Add to `lib/types.ts` (PRD §15.2).
- **Capability/policy types** for the governance tabs (`team_capability_policies/overrides/
  requests` shapes from 02b) — add FE types when that read route lands.
- Reuse existing `TierCapabilities` from `@waggle/shared` (`tiers.ts`) for the tier-gate; do not
  invent a parallel gate.

---

## 7. Dependencies (screens / phases first)

- **RBAC role-model decision (§6/§9)** blocks the `TeamRole` type + all member-management UI —
  resolve first.
- **`ShareToTeamDialog`** is cross-screen: it is invoked from S-Memory (J19) and S-Artifacts
  (J20). Artifacts have **no backing entity at all** (substrate-types §e — the single largest
  entity gap), so artifact-sharing depends on the Artifacts screen/entity landing first; memory-
  sharing can ship independently against `memory_frames` + `searchTeamMemory`.
- **Permission-denied / request-access pattern (J21)** is shared with other screens — build the
  reusable `PermissionDenied` component here, reuse elsewhere.
- Tier gating depends on `useFeatureGate`/`LockedFeature` (exist) — no new dependency.
- The remote/cloud governance tabs (per-role capability policies) depend on the **install-audit
  read route** (§5 implied) which is itself a separate small backend task.

**Phase placement:** this is a **later-phase** screen. The foundational Work/Intelligence screens
(Home, Workspace Desktop, Memory, Agents) and the Artifacts entity should land first; Team
Workspace composes their list rows + shares into team scope.

---

## 8. Effort: **L**

The backend core is mostly EXISTS/PARTIAL (CRUD + RBAC enforcement + activity already live, only
`/invite` alias + `/audit` alias + the genuinely net-new `/api/share` + a governance read route),
but the **frontend is a from-zero rework of a 45-line placeholder into an 8-tab surface** with a
new hook, ~8 new components, ~10 new adapter methods, UI-layer RBAC gating, the shared
share/permission-denied components, and an unresolved role-model decision. Not XL because no new
data store and no `.mind` migration is required for v1; not M because of the tab/share/RBAC breadth
+ cross-screen coupling.

---

## 9. Open questions

1. **RBAC role model (blocking):** adopt PRD §17.2 (`Owner/Admin/Contributor/Viewer`), blueprint
   (`+Member +Guest`), or keep the live `teams.db` 4-role union (`owner/admin/member/viewer`)?
   Recommendation: keep live union for v1, map Contributor→Member, defer Guest. Needs founder sign-off.
2. **PUT vs PATCH role-gate inconsistency (real bug):** `PUT /api/teams/:id/members/:userId` is
   **owner-only** (`team.ts:624`) but `PATCH` on the same path is **owner/admin** (`:649`). The PRD
   uses PATCH. Which gate is correct — owner-only role changes, or owner+admin? Align both.
3. **`/api/share` scope semantics in solo/local mode:** memory frames have **no structured
   `scope`/`teamId` column** (implicit per-`.mind`, substrate-types §c). For v1, model team-share as
   (a) implicit via workspace `teamId` + remote sync, or (b) a `memory_frames` metadata migration?
   Recommendation: (a) for v1, defer (b).
4. **Local vs remote team source of truth on this screen:** `/api/teams/*` (local `teams.db`, always
   works) vs `/api/team/*` (remote proxy, TEAMS-gated). Does Team Workspace render local teams in solo
   mode and switch to remote when connected, or remote-only? (Affects whether members/activity come
   from `teams.db` or the team server.)
5. **Governance tabs depth for v1:** do the Skills/Agents/MCPs/Automations tabs render full
   per-role capability policies (`team_capability_*` cloud tables) now, or ship read-only shared-item
   lists first and defer the policy editor?
6. **Postgres no-cascade (02b:44):** deleting a team is blocked by FKs if `team_entities`/resources/
   members reference it. The local `DELETE /api/teams/:id` deletes members first (`team.ts:563`) — does
   the cloud delete path need an explicit child-cleanup order, and should the UI warn before delete?
