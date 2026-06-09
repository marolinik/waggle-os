# RBAC / Security / Audit Delta — Waggle OS UX Refactor

**Scope:** PRD §17 (RBAC & Permissions) + §18 (Security, Privacy, Compliance) + Blueprint "Architecture Package 8: Security Model".
**Execution model:** in-place incremental refactor of `apps/web` + targeted backend extensions (locked). Reuse `install-audit`, `ai_interactions`, `audit_events`, `teams.db`, `confirmation.ts`, `trust-model.ts`, `capability-governance`.
**Grounding:** every claim cites a real file/line. Backend-map sections 03c (workspace/team) and 03e (evolution/governance) are the contract reference.

---

## 0. TL;DR for the planner

The security substrate is **substantially built on the agent/runtime side and the local sidecar**, but the RBAC story is **split across two incompatible planes** and the UI surfaces barely exist.

| Capability | Built? | Where |
|---|---|---|
| Tool approval gate (write/destructive/connector) | ✅ Strong | `packages/agent/src/confirmation.ts` |
| Tiered autonomy (normal/trusted/yolo) | ✅ | `confirmation.ts` `needsConfirmationWithAutonomy` |
| Approval inbox + persistent grants | ✅ | `chat.ts` + `/api/approval/*` (03e §8) |
| Risk/trust classification for installs | ✅ | `packages/agent/src/trust-model.ts` |
| Install audit trail (append-only-ish) | ⚠️ Real table, **NOT** trigger-protected | `packages/core/src/install-audit.ts` |
| AI interaction audit (append-only, EU AI Act) | ✅ Trigger-protected | `compliance/interaction-store.ts` + schema triggers |
| Generic action audit (`audit_events`) | ⚠️ Real, **NOT** trigger-protected | `local/routes/events.ts` |
| RBAC role model (Owner/Admin/Member/Viewer) | ⚠️ **Two** divergent impls | `local/routes/team.ts` vs `routes/capability-governance.ts` |
| RBAC role **Guest** | ❌ Not in any schema | — |
| RBAC enforced at API layer | ⚠️ Local: ad-hoc per route; Cloud: `fastify.authenticate` | — |
| RBAC UI (member mgmt, role matrix, audit views) | ❌ Effectively none | — |
| Memory-import consent (preview → commit) | ✅ Backend; UI partial | `local/routes/harvest.ts` |

**Biggest risk:** the PRD's 5-role table (Owner/Admin/Contributor/Viewer + Blueprint's Guest) must be unified onto **one** role enum and **one** enforcement path. Today the local sidecar (`teams.db`) and the cloud Teams server (`capability-governance`) have separate role enums, separate role hierarchies, and separate enforcement primitives. Picking one is a §17 prerequisite, not a UI detail.

---

## 1. RBAC — current vs. required

### 1.1 PRD/Blueprint target

PRD §17.2 defines **Owner / Admin / Contributor / Viewer**. The Blueprint security model (line 156) and acceptance criteria (line 603) instead say **Owner / Admin / Member / Viewer / Guest**. These two source documents **disagree on role names** ("Contributor" vs "Member") and on whether "Guest" exists. PRD §24 (mockups directional) plus "PRD acceptance criteria win" means: the implementation must reconcile to a single enum. Recommendation: adopt the Blueprint 5-role set **Owner/Admin/Member/Viewer/Guest** because it is the superset and is already partly encoded in the local schema; map PRD "Contributor" → "Member".

PRD §17.3 permission principles (must hold):
- Agents inherit **minimum** permissions of assigned scope.
- MCPs require explicit scope (personal/workspace/team).
- Connectors require consent + revocation path.
- Automations only run actions allowed by the user/team role.
- Shared memories/artifacts display scope + access.
- **Elevated actions require human approval.**

### 1.2 What exists — TWO RBAC planes

**Plane A — Local sidecar (`teams.db`), the one the desktop frontend actually hits.**
`packages/server/src/local/routes/team.ts`:
- Schema (lines 61–73): `team_members.role CHECK (role IN ('owner','admin','member','viewer'))`. **No `guest`.**
- Enforcement is **ad-hoc, inline, per-route** (not middleware):
  - Update team → owner/admin (line 532)
  - Delete team → **owner only** (line 558)
  - Add member → owner/admin (line 591)
  - Change role → **owner only** on `PUT` (line 624); owner/admin on `PATCH` (line 650) — *PRD note: PUT/PATCH divergence is a real inconsistency*
  - Remove member → owner/admin (anyone) or self; **never the owner** (lines 677–684)
- Identity is a **single local user** (`getLocalUserId` → `'local-user'`, line 85–92). There is no real multi-user auth on this plane — it is loopback-trust (backend-map 03c §5: "No auth header").

**Plane B — Cloud Teams server (`fastify.db`, Postgres-style), reached only via team-server proxy.**
`packages/server/src/routes/capability-governance.ts`:
- `ROLE_HIERARCHY = { member:1, admin:2, owner:3 }` (lines 6–10) — **numeric hierarchy, no viewer, no guest.**
- Real auth: every route has `preHandler: [fastify.authenticate]` and uses `request.userId`.
- `resolveTeam` checks membership → 403 "Not a member" (line 27–31); `requireAdmin` gates writes (line 36–43).
- This is where **capability policies / overrides / requests** live (per-role `allowedSources`, `blockedTools`, `approvalThreshold`) — the actual "Admin can install within policy" mechanism from PRD §17.2. Surfaced to the local app **read-only** via `GET /api/team/governance/permissions` (tier-gated ENTERPRISE, `team.ts` line 418).

> **Delta:** the two planes have **three** different role vocabularies (`owner/admin/member/viewer`, `member/admin/owner`, and the PRD's `Owner/Admin/Contributor/Viewer`), none of which has `Guest`. None enforce at a shared middleware. The capability-policy engine (the richest RBAC primitive) is cloud-only and the local app can only *read* it.

### 1.3 What must be built

1. **Single role enum** in `@waggle/shared` (`type TeamRole = 'owner'|'admin'|'member'|'viewer'|'guest'`). Migrate the `teams.db` CHECK constraint to add `guest`; add an explicit role→capability matrix matching PRD §17.2 (view/create/share/manage-people/install/manage-security columns).
2. **Shared enforcement helper** (`requireRole(min)` / `can(action, role, scope)`) used by both `local/routes/team.ts` (replace inline checks) and the cloud routes. Resolve the PUT/PATCH role-change divergence to one rule.
3. **Viewer/Guest read-only enforcement** — today `READONLY_TOOLS` + `PermissionManager.sandbox()` (`packages/agent/src/permissions.ts` lines 4–27) exist to lock an *agent* to read-only; reuse this primitive so a Viewer/Guest **session** assembles a sandboxed tool pool. This is the cleanest reuse: `isReadOnly` persona flag + role-driven `PermissionManager` whitelist.
4. **RBAC UI** (PRD §11.x Team Workspace, §20.3 "RBAC/Audit components"): member list with role dropdown (POST/PUT/PATCH/DELETE `/api/teams/:id/members*` already exist — 03c §1.3), invite flow (J13), "request access" on permission-denied (Blueprint J21, line 240), and the **role→capability matrix** as a readable table. None of this UI exists today.

---

## 2. Approval / consent gating — current vs. required

This is the **strongest** existing area. PRD §17.3 "elevated actions require human approval" and §18.1 "approval class for elevated/critical capabilities" are largely satisfied at runtime; the gap is UI consistency and a couple of surface flows.

### 2.1 The runtime approval gate (built)

`packages/agent/src/confirmation.ts`:
- `needsConfirmation(toolName, args)` (line 73) — gates writes (`write_file`, `edit_file`, git push/commit/pr/merge, `install_capability`, cross-workspace reads — `ALWAYS_CONFIRM` line 13), connector **writes** (name-derived, never trusts LLM args — line 76), and destructive bash (`DESTRUCTIVE_BASH_PATTERNS` line 35 + chain-operator bypass defense line 66).
- `getApprovalClass()` (line 122) → `standard|elevated|critical`.
- `needsConfirmationWithAutonomy(tool, args, level)` (line 224) — tiered autonomy: `normal|trusted|yolo` with a **critical-never-autopass blacklist** (`isCriticalNeverAutopass`, line 192) that holds even at YOLO (`rm -rf /`, `sudo`, force-push to main, etc.).

### 2.2 How it hooks into the loop (built)

`packages/server/src/local/routes/chat.ts` registers a **per-request `pre:tool` hook** (line 881):
- Reads effective `autonomyLevel` from permission settings (with expired-grant fallback to `normal`, line 363).
- `needsConfirmationWithAutonomy` decides; auto-pass at trusted/yolo emits `approval_auto` audit (line 902).
- **Persistent grants:** `server.agentState.approvalGrantStore.has(tool, args, workspaceId)` (line 921) silently resolves previously "always allowed" `(tool, args, sourceWorkspaceId)` triples.
- Otherwise: computes a `trust` assessment, sends an `approval_required` SSE event (line 959) with `approvalClass`, parks the call in `server.agentState.pendingApprovals` (line 975), and **audits** `approval_requested` / `approval_granted` / `approval_denied` (lines 967, 994, 998).
- Inbox + grants API: `/api/approval/:requestId`, `/api/approval/pending`, `/api/approval/grants*` (backend-map 03e §8).

> The approval/consent flow for **agent elevated actions** (PRD Journey 15, Blueprint J21) is therefore **fully wired backend-side**. The reusable hook point for the new UI is the `approval_required` SSE event + `GET /api/approval/pending` on reconnect.

### 2.3 The three PRD consent flows — where each hooks

| PRD consent flow | Backend status | Hook point | UI delta |
|---|---|---|---|
| **Memory import** (no import without review/approval — §18.2, J01/J08) | ✅ Two-phase exists: `POST /api/harvest/preview` → `POST /api/harvest/commit` (`local/routes/harvest.ts` lines 1–9; preview cap line 49). Identity suggestions stage to profile awaiting review (`IdentitySuggestion`, 03c §2.10). | preview/commit split + `harvest_sources` provenance | **Memory Review screen** (PRD §12.12 step 5) must render preview diff + per-item approve/edit/reject before calling commit. Low-confidence review queue (J08) needs the confidence fields PRD §15.4 recommends adding. |
| **Connector / MCP install** (consent + revocation — §17.3, J10/J11) | ✅ Risk classified by `trust-model.ts` `assessTrust` (line 318) → `riskLevel/approvalClass/permissions`. Install writes audit via `server.auditStore.record(...)` (marketplace.ts lines 224–308; skills.ts 212/315/475). Approval routed through the §2.2 gate (`install_capability` is in `ALWAYS_CONFIRM`). | `auditStore.record` + approval gate + `getApprovalClass` | **Connector Hub / MCP Hub install modal** (PRD §12.7/§12.8) must show the `TrustAssessment` (risk badge, permission summary, source label via `formatTrustSummary` line 392) and a **revoke** action. Revoke endpoints exist (`/api/connectors/:id/revoke`, `/api/mcps/:id/revoke` — PRD §16.9) but the audit "revoked" action and UI are gaps. |
| **Agent elevated action** (permission prompt — §17.3, J15) | ✅ Fully wired (§2.2). | `approval_required` SSE + `/api/approval/*` | **ApprovalModal** component (Blueprint line 488) — render `approvalClass`, tool + args, [Approve][Deny][Always allow]. Inbox view for `/api/approval/pending`. Today the approval UX is minimal/inline. |

### 2.4 What must be built (approval)

- **Unified ApprovalModal + Approvals Inbox** components consuming the existing SSE event + `/api/approval/*` + `/api/approval/grants*`. (Design-system component "ApprovalModal" is named in Blueprint line 488 but not implemented in the new IA.)
- **Autonomy selector UI** wired to `GET/PUT /api/settings/permissions` (`defaultAutonomy: normal|trusted|yolo` — 03c §2.8) with per-workspace overrides surfaced.
- **Revoke + "revoked" audit action** for connectors/MCPs (close the audit verb gap — `AuditAction` already includes `rejected/blocked` but not an explicit `revoked`; either add it or record as `rejected` with a detail).

---

## 3. Audit surfaces — current vs. required

PRD §18.1: "Append-only audit for AI interactions and sensitive actions." §18.3: "Audit logs should be immutable or append-only where feasible." There are **three distinct audit stores** today, with **inconsistent append-only guarantees**.

### 3.1 The three stores (all real, all SQLite)

| Store | Table | File | Append-only? | Purpose |
|---|---|---|---|---|
| **AI Interaction log** | `ai_interactions` (personal `.mind`) | `packages/core/src/compliance/interaction-store.ts` | ✅ **Yes** — `BEFORE UPDATE`/`BEFORE DELETE` triggers `RAISE(ABORT,...)` (`hive-mind-core/src/mind/schema.ts` lines 187–195) | EU AI Act Art. 12: model/provider/tokens/cost/tools/**inputText/outputText**/humanAction/riskContext/persona. |
| **Install audit** | `install_audit` (personal `.mind`) | `packages/core/src/install-audit.ts` | ⚠️ **No triggers** — `record()` is insert-only by convention but DELETE/UPDATE are not blocked; `clear()` exists (line 153) | Capability install trust trail: type/source/risk/trust_source/approval_class/action/initiator. |
| **Action audit** | `audit_events` (`audit.db`) | `packages/server/src/local/routes/events.ts` | ⚠️ **No triggers** — `pruneAuditEvents` deletes by age (line ~168) | Generic events: `tool_call`, `memory_write/delete`, `workspace_*`, `session_*`, `approval_*`, `export`, `cron_trigger`, `data_erase_requested` (lines 21–37). |

### 3.2 Deltas vs PRD §18

1. **Append-only consistency.** PRD wants AI interactions **and** sensitive actions append-only. Only `ai_interactions` is trigger-protected. To honor §18.1, add `BEFORE UPDATE/BEFORE DELETE → RAISE(ABORT)` triggers (or a tombstone column) to `install_audit` and to the sensitive subset of `audit_events` (`approval_*`, `memory_delete`, `workspace_delete`, `export`, `data_erase_requested`). The `pruneAuditEvents` retention sweep must then be reconciled with "append-only" (retention vs immutability is a real tension — resolve per §18.3 "where feasible", likely a tombstone/archive rather than hard delete for the sensitive subset).
2. **`install_audit` risk-level drift (latent bug).** The TS type `AuditRiskLevel` allows `'critical'` (install-audit.ts line 16) but the table `CHECK (risk_level IN ('low','medium','high'))` (line 65) **rejects** `'critical'`. Recording a critical install would throw. The file's own comment (lines 59–61) warns CHECK lists must stay in sync. **Fix before exposing the install-audit UI** (PRD §12.13, Sprint 7 "Install audit UI").
3. **Audit-event `userId` is unpopulated** on the local plane (single-user model). For the team audit views (PRD §11.5, J13) the `user_id` column exists (events.ts line 43/72) but nothing fills it. Wiring real `userId` is blocked on the unified-auth decision (§1).

### 3.3 Audit read/export surfaces (built)

- `GET /api/admin/audit-export?format=json|csv&from=&to=` — **TEAMS-gated** (settings.ts line 484, 03c §1.5). Reads `auditStore` (install_audit).
- `GET /api/teams/:id/activity` — aggregates `audit_events` across a team's workspaces (team.ts line 690, 03c §1.3).
- `GET /api/compliance/status` + `POST /api/compliance/export[-pdf]` — EU AI Act per-article report from `ai_interactions` (03e §5; `interaction-store.ts` `getOversightLog` line 144, `getModelInventory` line 116).
- TeamSync **pushes** audit events to the cloud team server fire-and-forget (events.ts lines 132–143).

### 3.4 What must be built (audit UI)

- **Audit Views** (PRD §11.5/§20.3, Blueprint "export audit" J24 line 249): a unified activity/audit feed that merges the three stores by scope (workspace/team) with filters (event type, actor, date) and CSV/PDF export buttons calling the existing endpoints. The data is there; the read-model needs a thin normalizer because the three tables have different columns.
- **Compliance app** surface (PRD §18.3, EU AI Act) — already has full backend (03e §5) incl. PDF; needs the per-article status cards + report-template CRUD UI.
- **Right-to-delete UX** (§18.2 archive/delete memory; `data_erase_requested` event already defined) + telemetry clear (`DELETE /api/telemetry/events`, 03e §4).

---

## 4. Cross-cutting security deltas (PRD §18.1)

| §18.1 requirement | Status | Note |
|---|---|---|
| Local-first storage default | ✅ | All persistence local (SQLite/JSON), backend-map 03c §3. |
| User-controlled sync/sharing | ⚠️ | Cloud-sync toggle TEAMS-gated (03c §1.5); per-object share (`POST /api/share`, PRD §16.11) UI absent. |
| Workspace-level isolation | ✅ | Per-workspace `*.mind`; `crossWorkspaceHints` permanently disabled for privacy (03c §5). Cross-workspace tools are approval-gated (confirmation.ts line 17). |
| Team RBAC | ⚠️ | Split planes — see §1. |
| Connector/MCP install audit | ✅ | `install_audit` + `trust-model` (see §2.3, §3). |
| Agent permission declarations | ⚠️ | Persona `tools`/`disallowedTools`/`isReadOnly` exist (CLAUDE.md §5); PRD §15.5 agent `permissions`/`memoryScopes` fields not yet a first-class persisted object. Agent Builder (PRD §12.9) must render+persist these. |
| Append-only audit | ⚠️ | Only `ai_interactions` (see §3.2). |
| Approval class for elevated/critical | ✅ | `getApprovalClass` / `trust-model` (§2). |
| Clear revoke/delete/export | ⚠️ | Endpoints mostly exist; UI is the gap. |
| Injection defense on external input | ✅ (must preserve) | `scanForInjection()` (CLAUDE.md §7.2) — connector/harvest input must keep calling it. |
| Secrets vault-only, masked | ✅ | API keys → encrypted vault, masked on read (03c §2.7). |

---

## 5. Recommended build order (security slice of the refactor)

1. **Decide the auth/identity model** (single-user local vs. real multi-user). Everything in §1 and the `userId` audit gap blocks on this. Minimum-viable per PRD Open Question §23.7: keep loopback single-user locally; treat cloud Teams server as the multi-user authority; the local app **mirrors** roles from the cloud `capability-governance` policies (read path already exists).
2. **Unify the role enum** in `@waggle/shared` (add `guest`; map Contributor→Member) + **shared `requireRole`/`can()` helper**; refactor `team.ts` inline checks and cloud routes onto it. Migrate `teams.db` CHECK.
3. **Fix `install_audit` risk-level CHECK drift** (§3.2.2) before any install-audit UI.
4. **Add append-only triggers** to `install_audit` + sensitive `audit_events` subset (§3.2.1), reconcile with retention.
5. **Build shared security components** (Blueprint line 488): `ApprovalModal`, role→capability **matrix** table, `EvidencePanel`, audit-feed normalizer. Wire to existing endpoints.
6. **Wire the three consent flows' UIs** (§2.3): Memory Review, Connector/MCP install-with-trust-assessment, Approvals Inbox.
7. **Role-driven read-only sandbox** for Viewer/Guest sessions via the existing `PermissionManager.sandbox()` + `READONLY_TOOLS` primitive (§1.3.3).

---

## 6. Reuse map (don't rebuild)

| Need | Reuse | File |
|---|---|---|
| Tool approval decision | `needsConfirmation` / `needsConfirmationWithAutonomy` / `getApprovalClass` | `packages/agent/src/confirmation.ts` |
| Install risk + permission summary | `assessTrust` / `formatTrustSummary` / `resolveTrustSource` | `packages/agent/src/trust-model.ts` |
| Read-only lockdown | `PermissionManager.sandbox()` + `READONLY_TOOLS` | `packages/agent/src/permissions.ts` |
| Install audit trail | `InstallAuditStore` | `packages/core/src/install-audit.ts` |
| AI-interaction audit (append-only) | `InteractionStore` + schema triggers | `packages/core/src/compliance/interaction-store.ts`, `hive-mind-core/src/mind/schema.ts:187` |
| Generic action audit | `emitAuditEvent` / `getAuditDb` | `packages/server/src/local/routes/events.ts` |
| Local team RBAC CRUD | `teamRoutes` | `packages/server/src/local/routes/team.ts` |
| Cloud capability governance (policies/overrides/requests) | `capabilityGovernanceRoutes` + `TeamCapabilityGovernance` | `packages/server/src/routes/capability-governance.ts` |
| Approval inbox + grants | `pendingApprovals` map + `approvalGrantStore` + `/api/approval/*` | `packages/server/src/local/routes/chat.ts` + `approval.ts` |
| Memory-import consent | `harvest/preview` → `harvest/commit` | `packages/server/src/local/routes/harvest.ts` |
| EU AI Act compliance report | `ComplianceStatusChecker` / `ReportGenerator` | `packages/core/src/compliance/*` |

---

## 7. Open questions for the founder/PM

1. **Role name reconciliation:** confirm Owner/Admin/**Member**/Viewer/Guest (Blueprint superset) over PRD §17.2's "Contributor". (Recommended.)
2. **Identity model (§23.7):** single-user-local + cloud-authoritative-multi-user, or real local accounts? Gates the audit `userId` and §1 enforcement.
3. **Append-only vs retention (§18.3):** for the sensitive `audit_events` subset, hard append-only (no prune) or tombstone-on-prune? EU buyers will ask.
4. **Guest scope:** Blueprint says "limited shared artifacts/memory; no agents/MCP" — confirm Guest gets a `PermissionManager.sandbox()` read-only session.
5. **Capability-policy reach:** should the rich cloud policy engine (allowedSources/blockedTools/approvalThreshold per role) be brought down to the **local** plane, or stay cloud-only with the local app reading it (current state)?
