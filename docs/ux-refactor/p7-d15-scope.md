# P7 — D15 Launch Integrity · Scope (per-screen state grid + approval/audit taxonomy)

> **Phase sequence** (`docs/ux-refactor/deltas/open-questions.md:574`): P1=D3 ✅ ·
> P2=verify+J08 ✅ · P3=D2 ✅ · P4=D11/D12 ✅ · P5=D4 ✅ (2026-06-12, 7 commits
> 73f2ed5→48292ef) · **P7=D15 ← here. This is the LAST launch-blocker.**
>
> **Decision text:** `open-questions.md` §D15 (line 563) — *"Launch-blocking from
> prior-plan P6: per-screen state grid (brief rule 10) + approval/audit taxonomy
> consolidation (brief rule 7, includes D4-ii alignment). Post-launch: connector `/sync`
> real implementation (stub stands), MCP logs."* Plus §D4(ii) (line 539) — *"Align the
> card's risk display with the `ui/approval-modal.tsx` taxonomy (D15 work)."*
>
> **Scoping pass only.** Everything below is grounded in a read-only audit of
> `apps/web/src` (routes in `routes/*Route.tsx`, components in `components/os/apps/`) plus
> the backend taxonomy modules. No code was modified. Every claim cites `file:line`.

D15 has two structurally independent halves. **HALF 1** (brief rule 10) makes every screen
declare its loading / empty / error / populated states. **HALF 2** (brief rule 7) unifies
the risk/approval/audit vocabulary across five backend taxonomies and three frontend
approval surfaces — and closes the deferred **D4(ii)** in-chat-card↔modal alignment.

---

# HALF 1 — Per-Screen State Grid (brief rule 10)

Legend: **full** = all four states distinct and correct · **partial** = state exists but
is degraded/conflated · **missing** = no such state (the failure mode renders as a
*different* state, usually empty) · **n/a** = categorically inapplicable (static screen /
no data path).

The dominant defect class is **error-rendered-as-empty**: a fetch failure is swallowed
into `[]` so the user sees "No X yet" when the backend is actually down. On a trust /
monetization / activity surface this is a correctness defect, not cosmetics.

## State grid (all 30 screens)

| # | Screen | Route | loading | empty | error | populated | Worst gap |
|---|--------|-------|---------|-------|-------|-----------|-----------|
| 1 | Home Cockpit (S01) | `/home` | full | full | full | full | Overnight tile hidden when offline (`HomeCockpit.tsx:626`) instead of degraded placeholder; header pill only signal (149) |
| 2 | Workspace Desktop (S02) | `/workspaces/:id/:tab?` | full | full | full | full | research/timeline/settings tabs are static `TabPlaceholder` stubs (`WorkspaceDesktopApp.tsx:955-961,992-998,1000-1006`); best-effort feeds render partial-failure as empty (712-735) |
| 3 | Command Center (Win+K) | overlay (`AppShell.tsx:312`) | partial | full | **missing** | full | No in-surface error at all; search failure → silent fuzzy fallback (`CommandCenter.tsx:253-268`); **overlay outside any error boundary** (312 vs SurfaceBoundary-wrapped Outlet) — a render throw blanks the shell |
| 4 | Memory Center | `/memory/:mindScope?` | full | full | **partial** | full | Timeline sub-tab error-blind: `useMemory` captures `error` (`useMemory.ts:36`) but `MemoryRoute.tsx:103` never threads it → fetch failure shows "No memories found" (`TimelineTab.tsx:197-202`). Memories+Graph tabs are full. |
| 5 | Artifact Center | `/artifacts` | full | full | full | full | **Gold standard** — cold-load error (full-pane, `ArtifactCenterApp.tsx:242`) vs transient refetch error (inline banner, 258-263). No material gap. |
| 6 | Files | `/files` | partial | full | **missing** | full | All failures collapsed to `offline=true` (`FilesApp.tsx:157-158`) → cold load error shows "showing cached files" with NO cache; no loading branch in list pane (469-549) → in-flight looks empty; silent mutation catches (228,284,289) |
| 7 | Room | `/room` | **missing** | full | **missing** | full | SSE subscribe failure swallowed to `console.error` (`useRoomState.ts:39-41`), hook exposes no `error`/`connecting` → connecting, idle, and broken all render "No agents running" (`RoomApp.tsx:179-187`) |
| 8 | Agents — Center | `/agents` | full | full | full | full | No material gap; load gated on `connecting` (`AgentsApp.tsx:74-77`); stale-refresh banner (240-247) |
| 9 | Agents — Templates | `/agents` (toggle) | partial | full | **partial** | full | No `connecting` gate (`TemplatesView.tsx:76`) → 401 race; error only as banner AFTER loading clears (240-249); `getPersonas()` rejection silently falls back to local PERSONAS (52-56, `setError` NOT called) — backend failure invisible |
| 10 | Agents — Builder (S18) | `/agents` (New/template) | n/a | full | **partial** | full | Catalog failure → empty picker + single `catalogNote` (`AgentBuilder.tsx:146-148`) that doesn't say WHICH catalog failed |
| 11 | Skills (Capabilities Hub) | `/skills` | partial | full | **partial** | full | Packs-tab catalog failure leaves `error` null → "No catalog packs found" empty stands in for error (`CapabilitiesApp.tsx:533-538`); skills-tab error only when list empty (472) — stale list masks reload failure |
| 12 | Automations — Center | `/automations` | full | full | full | full | **Reference implementation** — loading + empty + error + stale-banner + partial-degradation notice all distinct (`AutomationCenterApp.tsx:262-290`) |
| 13 | Automations — Builder (S20) | `/automations` (New/Edit) | full | n/a | full | full | No gap — hydration race handled (`configPending`/`configUnavailable`, `AutomationBuilder.tsx:138-139`); C26 check fallback (223-224); approval fails closed (237-249) |
| 14 | Automations — Log list | `/automations` (Logs) | full | full | full | full | Leaf component fully covers 4 states (`AutomationLogList.tsx:24-37`); parent prefetches so loading/error props unreached (dead-but-correct) |
| 15 | Connector Hub | `/connectors` | full | full | full | full | `handleDisconnect` failure is console-only, no toast (`ConnectorsApp.tsx:170-175`) — inconsistent with connect/revoke; "Recommended" empty copy reused for "registry not loaded" (329) |
| 16 | MCP Hub | `/mcps` | full | full | full | full | `remote` (`MCPHubApp.tsx:359`)/`activity` (385) tabs render un-gated by the items-fetch `error` → server-down on those tabs shows no banner; catalog silently drops Install buttons when registry unreachable (`McpCatalog.tsx:85-86`) |
| 17 | Marketplace | `/marketplace` | full | full | full | full | Audit tab delegates to `InstallAuditPanel` (own states) → can disagree with marketplace health (`MarketplaceApp.tsx:335`); partial facet rejection silently drops sources (170-172); only all-rejected surfaces error (177) |
| 18 | Tool Launcher | `/launcher` | full | **missing** | full | full | Successful detection with `tools:[]` → blank scroll area, no "no tools detected" (`LauncherApp.tsx:366-371` loading-gated empty); no `connecting` gate (130-132) → cold-load 401 race |
| 19 | Install Audit Panel | embedded (`/connectors`,`/mcps`,`/marketplace`) | partial | full | full | full | Loading is an unconditional early-return (`InstallAuditPanel.tsx:92-98`) → every type-filter change/reload blanks the whole feed to a spinner (hosts explicitly avoid this); no `connecting` gate (90) |
| 20 | Team Governance | `/team` | n/a | n/a | partial | n/a | Static tier-upsell card, no data path (`TeamGovernanceApp.tsx:3-44`); only error coverage is the render-crash boundary. By design (D5 reserves Team work). |
| 21 | Approvals | `/approvals` | full | full | **missing** | full | Both fetches `.catch(() => ({pending:[],count:0}))` (`ApprovalsApp.tsx:77-78`) → server-down shows "No pending approvals" on a TEAMS trust surface; no error branch anywhere |
| 22 | Waggle Dance | `/waggle-dance` | full | full | **missing** | full | Hook tracks+returns `error` (`useWaggleDance.ts:58`) but `WaggleDanceApp.tsx:34` omits it from the destructure → load failure renders "No waggle dance signals yet" (86-91). Dead error state. |
| 23 | Settings | `/settings` | partial | n/a | **partial** | full | No top-level loading (defaults render immediately); `getSettings`/`getPermissions`/`getTeamStatus` swallow errors (`SettingsApp.tsx:156,163,165`); `getTelemetryStatus` has NO `.catch` (168-171) — unhandled rejection. Billing tab is gold standard (500-543). |
| 24 | Vault | `/settings/vault` | full | full | **missing** | full | `loadData` Promise.allSettled wrapped in `try{}catch{/*ignore*/}` (`VaultApp.tsx:104-120`) → vault-read failure shows "No secrets stored yet" (300); `handleReveal` failure silently ignored (182) |
| 25 | My Profile | `/settings/profile` | full | **missing** | **missing** | full | `getProfile().catch(() => {})` (`UserProfileApp.tsx:102`) + form always renders from `''` defaults (65-83) → never-configured, load-failed, and populated are indistinguishable; no empty, no error |
| 26 | Mission Control (Cockpit) | `/settings/mission-control` | partial | partial | full | full | **Error is the reference impl** — `offline` banner + Retry on all-rejected (`CockpitApp.tsx:82-93`). Gap: no body skeleton (header icon only, 77-78) → first paint shows "Unknown"/$0.0000; empty is per-tile not screen-level |
| 27 | Timeline | `/settings/timeline` | full | full | **missing** | full | `getTimeline` `.catch` only clears loading (`TimelineApp.tsx:84-86`), events stay `[]` → backend error shows "No activity in this period" (168-172). No-workspace guard (109-115) is well handled. |
| 28 | Events | `/settings/events` | **missing** | full | **missing** | full | No loading concept (only per-step spinners); `useEvents` exposes `error` (`useEvents.ts:35`) but `EventsRoute.tsx:16-20` discards it → both load-pending and load-failed show "No events yet" (`EventsApp.tsx:411-417`) |
| 29 | Usage & Telemetry | `/settings/usage` | full | partial | **missing** | full | Per-fetch `.catch(() => [])` (`TelemetryApp.tsx:29-30`) coerces failure into a zeroed populated dashboard (3 cards reading 0/$0.0000); `!data` empty (56-63) nearly unreachable; no error, no retry |

> **Reference implementations to copy from:** Artifact Center (#5, cold vs transient error
> split), Automations Center (#12, full 5-band grid incl. partial-degradation notice),
> Mission Control (#26, `offline`+Retry banner), and Memory Center's *Memories* tab
> (`MemoryCenterTab.tsx:298-329`, role=status/role=alert/Retry/context-empty). The fix
> pattern already exists in-repo on four screens — P7 propagates it, it does not invent it.

## Gaps to close — prioritized (rank = user-facing severity)

**Ranking rule (D15-aligned):** a **missing ERROR state on a core / trust / monetization
surface** ranks far above a missing EMPTY state on a settings sub-page. Error-rendered-as-
empty on a security surface is a *correctness* defect; a missing zero-tools message is
*polish*. The fix for the dominant class is mechanically identical everywhere (thread the
`error` the hook already captures + render an `role=alert` block with Retry).

### P0 — launch-blocking (missing ERROR on a core/trust/activity surface)

1. **Approvals — error→empty on a trust surface** (`ApprovalsApp.tsx:77-78`). A TEAMS
   trust-control inbox shows "No pending approvals" when the server is down. **Highest
   user trust cost.** Add an error branch + Retry; stop coercing fetch failure to `{pending:[]}`.
2. **Room — no loading AND no error** (`useRoomState.ts:39-41`, `RoomApp.tsx:179-187`).
   The exact SSE-channel failure D3 revived in prior sessions renders identically to
   "no agents." Add a `connecting`/`error` status flag to `useRoomState`; show connecting
   skeleton + error+reconnect affordance.
3. **Command Center — no error state + no error boundary** (`CommandCenter.tsx:253-268`,
   `AppShell.tsx:312`). The structural half is the real risk: the overlay sits **outside**
   the only `SurfaceBoundary` (`AppShell.tsx:300/306`) so a render throw blanks the whole
   shell. Wrap the overlay in an `AppErrorBoundary`; surface search/execute failures
   in-body, not just as a toast.
4. **Files — error collapsed into a misleading "offline/cached" state**
   (`FilesApp.tsx:157-158,385-389`). A cold-load 500/permission failure shows "showing
   cached files" with no cache. Distinguish a real load error from offline; add a loading
   branch to the list pane (469-549).
5. **Waggle Dance — dead error state** (`WaggleDanceApp.tsx:34` omits `error` the hook
   already returns at `useWaggleDance.ts:58`). One-line destructure fix + render. **Lowest
   effort in this tier** — the data is already there.
6. **Memory Center / Timeline sub-tab — error-blind** (`MemoryRoute.tsx:103` doesn't
   thread `useMemory.error`; `TimelineTab.tsx:43-57` has no `error` prop). Thread + render.
   Memory is the lock-in moat surface; a masked failure here is high cost.

### P1 — launch-blocking-adjacent (settings/secrets surfaces where error→empty hides failure)

7. **Vault — vault-read failure shows "No secrets stored yet"** (`VaultApp.tsx:104-120`).
   Secrets surface; an invisible read failure is a trust problem. Add error/offline UI;
   surface `handleReveal` failures (182).
8. **Settings — silent error swallows + one unhandled rejection**
   (`SettingsApp.tsx:156,163,165` empty catches; **168-171 `getTelemetryStatus` has NO
   `.catch`** — a real unhandled promise rejection). Add the missing catch (defect, not
   polish); add a settings-form loading affordance; propagate load errors. Billing tab
   (500-543) is the template to match.
9. **Timeline / Events / Usage&Telemetry — error→empty/zeroed** (`TimelineApp.tsx:84-86`;
   `EventsRoute.tsx:16-20` discards `useEvents.error`; `TelemetryApp.tsx:29-30` `.catch(() => [])`
   → zeroed dashboard). Settings sub-pages, but the pattern (down backend looks like "you've
   used nothing") is the same class. Thread `error` + render; add Events loading.

### P2 — nice-to-have (missing/partial states that don't mask a failure as success)

10. **Tool Launcher — missing empty state** (`LauncherApp.tsx:366-371`): zero-tools machine
    shows a blank pane. Add a "no supported tools detected" empty + a `connecting` gate (130-132).
11. **My Profile — no empty, no error** (`UserProfileApp.tsx:102`): blank form for
    never-configured AND load-failed. Add a distinct empty ("set up your profile") + error.
12. **Templates / Skills / MCP Hub / Connectors partial-error masking**: `connecting`
    gates (`TemplatesView.tsx:76`), packs-tab error (`CapabilitiesApp.tsx:533-538`),
    un-gated MCP `remote`/`activity` tabs (`MCPHubApp.tsx:359,385`), `handleDisconnect`
    toast (`ConnectorsApp.tsx:170-175`). Real but lower-blast-radius.
13. **Loading polish**: `InstallAuditPanel.tsx:92-98` content-blanking reload; Mission
    Control / Cockpit body skeletons (`CockpitApp.tsx:77-78`); Home offline overnight
    placeholder (`HomeCockpit.tsx:626`). Flicker, not failure-masking.
14. **Workspace Desktop tab stubs** (`WorkspaceDesktopApp.tsx:955-961,992-998,1000-1006`):
    research/timeline/settings are `TabPlaceholder`. These are *intentionally* deferred
    (P3/P7 tab embeds, see `open-questions.md:621-622`) — flag, don't build in P7 unless
    re-scoped.

---

# HALF 2 — Approval / Audit Taxonomy Consolidation (brief rule 7)

The risk/approval vocabulary is fragmented across **five backend taxonomies** with no
canonical source and **three frontend approval surfaces** that speak mutually-incompatible
dialects. The headline defect (and the named D4(ii) item): **the server already computes
the full trust taxonomy and emits it on the wire, but the frontend type drops it at the
boundary**, so the highest-risk approval (installing a third-party/unknown capability)
shows the user the *least* risk information.

## The fragmentation (five backend taxonomies, three FE surfaces)

| Source | Module | Risk enum | Approval enum | Notes |
|--------|--------|-----------|---------------|-------|
| Runtime gating | `agent/confirmation.ts:124` | `_riskLevel` string `low\|medium\|high` (139) | `ApprovalClass` `standard\|elevated\|critical` | own `getApprovalClass()` (126-143) hardcodes high→critical/medium→elevated (140-142) |
| Install assessment | `agent/trust-model.ts:17` | `RiskLevel` `low\|medium\|high` **(no critical)** | `ApprovalClass` `standard\|elevated\|critical` (27) | canonical `classifyRisk` (184) + `deriveApprovalClass` (196) — tops out at high→critical |
| Persisted audit | `core/install-audit.ts:19` | `AuditRiskLevel` `…\|critical` **(adds critical)** | `AuditApprovalClass` `…\|blocked` (23, **adds blocked**) | DDL CHECK (65-72), no `trust_source` CHECK; `AuditAction` 7-val incl. `uninstalled` |
| Audit DDL copy | `hive-mind-core/src/mind/schema.ts:148-149` | — | — | **hand-duplicated** CHECK lists (drift hazard, `install-audit.ts:62-64` admits it) |
| RBAC governance | `server/services/team-capability-governance.ts:23-28` | `RISK_LEVELS` keyed `none\|low\|medium\|high` **(adds none, no critical)** | `PermissionResult` `allowed\|blocked\|needs_approval\|source_not_allowed` | `riskExceedsThreshold` (34): a `critical` risk falls to `?? 0` → sorts *below* `low` |
| **FE in-chat card** | `apps/web/.../lib/types.ts:374-382` | **none** | **none** | `{requestId,toolName,description,input,rawJson,sourceWorkspaceId}` |
| **FE shared modal** | `components/ui/approval-modal.tsx:23-29` | `riskLevel` `low\|medium\|high` **only** | **none** | `{action,scope[],riskLevel}` — name-collides with the card's `ApprovalRequest`, different shape |
| **FE audit feed** | `extend/InstallAuditPanel.tsx:35-50` | free string (`String()`-coerced) | free string | the ONLY FE place that reads riskLevel+trustSource+approvalClass — post-hoc |

## Canonical target vocabulary (what P7 converges on)

Promote a single shared two-axis model to **`packages/shared/src/risk.ts`** (or a shared FE
type), imported everywhere instead of redeclared. Adopt the **widest** existing set as
canonical so no producer/store mismatch remains:

- **`RiskLevel = 'low' | 'medium' | 'high' | 'critical'`** — adopt the wider `AuditRiskLevel`
  (`install-audit.ts:19`). `trust-model.ts` must gain a path to `'critical'` (today `classifyRisk`
  tops out at high, `trust-model.ts:184-202`).
- **`ApprovalClass = 'standard' | 'elevated' | 'critical' | 'blocked'`** — adopt the wider
  `AuditApprovalClass` (`install-audit.ts:23`). `'blocked'` must become a **derivable** outcome,
  not a hand-written literal (today only `marketplace.ts:231` produces it).
- **`TrustSource`** — canonical at install-audit's **7-value** set incl. `'security-gate'`
  (`install-audit.ts:20-22`); `trust-model.ts` 6-value set (19-25) is the narrow one.
- **`AssessmentMode = 'declared' | 'heuristic' | 'mixed'`** + `RiskFactor[]` +
  `PermissionSummary` + human `explanation` — already in `trust-model.ts`, kept.
- **`AuditAction`** — canonical at the 7-value set incl. `'uninstalled'` (added in P5/D4).
- **Two axes, one rule:** `riskLevel` = how dangerous (severity color). `approvalClass` =
  how strongly to gate (standard/elevated/critical/blocked). `trust-model.ts` already
  separates them cleanly via `deriveApprovalClass`; the modal collapses to risk-only and
  must learn `approvalClass`.

## Divergence table (issue | files | severity)

| # | Issue | Files | Sev |
|---|-------|-------|-----|
| 1 | Two `ApprovalRequest` types share a name, structurally disjoint — card `{requestId,toolName,description,input,rawJson,sourceWorkspaceId}` vs modal `{action,scope[],riskLevel}`. Cannot unify by component reuse without reconciling the type first (root of "same taxonomy, not same component"). | `lib/types.ts:374-382` ↔ `ui/approval-modal.tsx:23-29` | **HIGH** |
| 2 | **D4(ii) concrete bug:** server emits full `trustMeta` (riskLevel/approvalClass/trustSource/assessmentMode/explanation/permissions) for `install_capability`, FE card type declares none → risk crosses the wire and is **silently dropped**. Highest-risk approval shows least info. | `server/.../chat.ts:937-970` ↔ `ChatApp.tsx:240-289` (+ `lib/types.ts:374-382`) | **HIGH** |
| 3 | Risk scales unaligned — `trust-model` has two orthogonal axes (riskLevel + approvalClass, `critical`= never-auto-pass), the shared modal collapses to riskLevel low/med/high with no `approvalClass` → a `critical` install and a `high` install render identically. | `trust-model.ts:184-202` ↔ `ui/approval-modal.tsx:40-45` | **HIGH** |
| 4 | FE modal cannot REPRESENT `critical` that the audit store + security gate routinely record → a CRITICAL MCP install is demoted to a plain text notice instead of the risk-leveled modal it uses for HIGH. | `ui/approval-modal.tsx:28` ↔ `install-audit.ts:19`, `MCPHubApp.tsx:191-195` | **HIGH** |
| 5 | Two parallel surfaces render the same approval concept with incompatible vocabularies (modal riskLevel-only vs card no-risk vs audit free-string) — three approval/audit UIs, three field sets. | `approval-modal.tsx:23` · `ChatApp.tsx:222-290` · `InstallAuditPanel.tsx:26-45` | **HIGH** |
| 6 | `'blocked'` (`AuditApprovalClass`) is never DERIVABLE — both derive fns (`getApprovalClass`, `deriveApprovalClass`) top out at `critical`; `'blocked'` written only by a route literal (`marketplace.ts:231`). Derive path and persist path use non-substitutable enums. | `confirmation.ts:126` + `trust-model.ts:196` ↔ `install-audit.ts:23,70`, `marketplace.ts:231` | **HIGH** |
| 7 | `RiskLevel` (trust-model, 3-val) can NEVER emit `critical`, but `AuditRiskLevel` (4-val) accepts it → a `risk_level:'critical'` row can only be hand-written; producer narrower than store. | `trust-model.ts:17,318` ↔ `install-audit.ts:19` | **HIGH** |
| 8 | Modal consumers manufacture `riskLevel` client-side from heuristics/hardcodes, NOT from server TrustAssessment — displayed risk ≠ policy-engine risk; same install labelled differently in two places. | `MarketplaceApp.tsx:55-91` (derives) vs `ConnectorsApp.tsx:92`/`AgentBuilder.tsx:196`/`AutomationBuilder.tsx:254`/`MCPHubApp.tsx:216,226` (hardcode) ↔ `trust-model.ts:151-202` | **MEDIUM** |
| 9 | Trust metadata enriched ONLY for `tool==='install_capability'` (`chat.ts:939`); every other gated tool (fs writes, shell, cross-workspace) emits approval with no risk class, though they carry execution risk (`PERMISSION_RISK_POINTS` codeExecution=2/secrets=2). "Same policy" can't hold without a server risk path for non-install tools. | `chat.ts:937-970` ↔ `trust-model.ts:160-168` | **MEDIUM** |
| 10 | Plain-language action field mismatch — card's `description` (`lib/types.ts:377`, rendered `ChatApp.tsx:246-248`) is NEVER sent by the server (`chat.ts:966-970`) → card's human line is always empty; modal leads with `action`. | `ChatApp.tsx:246-248` ↔ `chat.ts:966-970` | **MEDIUM** |
| 11 | `team-capability-governance` `RISK_LEVELS` (`none\|low\|medium\|high`) is a 4th vocabulary using `none` (no other has it) and lacking `critical` → `riskExceedsThreshold` sorts a `critical` risk via `?? 0` *below* `low`. Silent RBAC mis-ordering. | `team-capability-governance.ts:23-39` | **MEDIUM** |
| 12 | Naming-axis confusion — same 3 buckets called `riskLevel` on some surfaces, `approvalClass` on others; they are NOT the same axis. Two-axis model exists in code but is collapsed inconsistently per surface. | `trust-model.ts:196-202` vs `approval-modal.tsx`/audit/chat trustMeta | **MEDIUM** |
| 13 | `_riskLevel` passed as an untyped string in tool args; `confirmation.ts:140-142` hardcodes high→critical/medium→elevated, **duplicating** `deriveApprovalClass` (`trust-model.ts:196-202`) in a second drift-prone place. | `confirmation.ts:139-142` ↔ `trust-model.ts:196-202` | **MEDIUM** |
| 14 | `install_audit` CHECK-constraint lists hand-duplicated; in-code comment admits "MUST stay in sync … drift silently crashes `auditStore.record()`." Two copies = no single source of truth. | `install-audit.ts:62-72` ↔ `hive-mind-core/src/mind/schema.ts:148-149` | **MEDIUM** |
| 15 | `AuditTrustSource` has 7 values incl. `security-gate`; `trust-model` `TrustSource` has 6, `resolveTrustSource` can never return it; trust_source CHECK is ABSENT from the DDL (`install-audit.ts:71`) → unconstrained at DB while TS claims a closed set. | `install-audit.ts:20-22,71` ↔ `trust-model.ts:19-25,67` | **LOW** |
| 16 | Audit feed prints `risk: <raw>` from a `String()`-coerced unknown (`InstallAuditPanel.tsx:143,35-50`) with no label/color, while the modal applies RISK_LABELS/RISK_CLASSES → same risk, two visual languages; audit can't be wrong-typed (accepts any string). | `InstallAuditPanel.tsx:35-50,143` ↔ `approval-modal.tsx:40-45,70-73` | **LOW** |
| 17 | `trustSource` is a taxonomized backend field surfaced on `trustMeta` (`chat.ts:954`) but shown in NO approval surface except a hand-built MarketplaceApp scope line (`MarketplaceApp.tsx:82-88`); 4 of 5 install surfaces omit the dimension that JUSTIFIES the risk. | `install-audit.ts:20-22` + `chat.ts:954` ↔ all builder consumers | **LOW** |

## D4(ii) — the specific card↔modal alignment work

D4(ii) ratified: *the in-chat SSE card is canonical*; "same modal" = **same policy and risk
taxonomy, not same component**. The card (`ChatApp.tsx:222-290`, fed by `useChat.ts`
`pendingApproval` + `lib/types.ts:374-382`) and `ui/approval-modal.tsx` must read the same
risk vocabulary. Concretely:

1. **Widen the FE card type** (`lib/types.ts:374-382`) to carry the trust fields the server
   already emits — `riskLevel, approvalClass, trustSource, assessmentMode, explanation,
   permissions`. **No parsing change needed** — the fields are already on the wire for
   `install_capability` (`chat.ts:951-958`); `useChat.ts:252` casts straight to
   `ApprovalRequest`, so once the type is widened TS stops hiding them.
2. **Render them in `ApprovalGate`** (`ChatApp.tsx:240-289`) — at minimum a risk badge +
   trust-source line, using the **same RISK_LABELS/RISK_CLASSES** coloring as the modal
   (`approval-modal.tsx:40-45,70-73`) so identical risk renders identically in both surfaces.
3. **Modal learns `approvalClass`** (`critical` especially) so a critical install no longer
   renders identically to a high one, and so the modal can represent the `critical`/`blocked`
   level the audit trail records (today it cannot — divergence #4).
4. **Critical-tier UX contract, decided once:** `deriveApprovalClass` marks high→`critical`
   (full trust context + warning, never auto-pass). **The card today offers "Always allow"
   (`ChatApp.tsx:267-274`) with NO risk gating** — a critical/high install can be permanently
   granted in one click, which MCPHub's CRITICAL-non-overridable rule (`MCPHubApp.tsx:191-217`)
   explicitly forbids. Gate "Always allow" by `approvalClass` so both surfaces honor the same
   policy. **→ RATIFIED (founder, 2026-06-12): gate it.** A6 must hide/disable "Always allow"
   on `critical` (and `high`) approvals — no permanent grant for the riskiest actions.
5. **Reconcile the plain-language field** — card `description` (never sent) vs modal `action`;
   emit one agreed "what will happen" string server-side (or a shared `describeToolUse`
   formatter) feeding both.
6. **(broader, see P7 order)** Extend server risk classification beyond `install_capability`
   (`chat.ts:939` is the only enrichment branch) so the card has a risk class to show for
   fs/shell/cross-workspace approvals — otherwise the two surfaces can only ever agree on
   install events.

---

# PRIORITIZED P7 BUILD ORDER

TDD-friendly increments, commit-per-step, matching prior phase-plan cadence (complete →
verify → next). Each step states its verify gate. **`build:packages` first** (shared →
hive-mind-core → core → agent → server) on any cross-package change — the W4 stale-`dist/`
class (`open-questions.md:561`, D13). Run `tsc --noEmit` on touched packages; the server is
`tsx`-transpiled and NOT typechecked by `npm run build` (CLAUDE.md §2).

> **Sequencing RATIFIED (founder, 2026-06-12): Track B (P0 error states) FIRST, then Track A.**
> **A6 "Always allow" gate RATIFIED: gate by approvalClass (no permanent grant on critical/high).**

## STATUS — Track B DONE, Track A DONE (2026-06-12)

**Track B (P0 error states) — SHIPPED + reviewed + pushed.** B1–B5 + the 2 confirmed
review fixes (`548fbe8`→`9f3cf2a`); adversarial review 2 confirmed/9 refuted
(`p7-track-b-review-record.md`). FE 897/897.

**Track A (approval/audit taxonomy + D4(ii)) — SHIPPED + pushed (`7bbe5d8`→`7a8c374`):**
- A1 `7bbe5d8` — canonical `@waggle/shared/risk.ts` (widest-set enums + riskRank/sqlInList).
- A2a `7675802` — trust-model + confirmation re-pointed; classifyRisk +critical; deriveApprovalClass critical→critical + blocked-flag.
- A2b `d0b9aaa` — install-audit + team-governance; fixed critical-sorts-below-low RBAC defect.
- A3 `a412a8e` — install_audit CHECK single-sourced + OSS schema.ts parity test (no migration).
- A4 `239cc51` — server emits risk metadata for ALL gated tools (was install-only).
- A5 `dff44b8` — **D4(ii)**: card type widened + RiskBadge render via shared `risk-display`.
- A6 `3d9893f` — modal represents critical; **"Always allow" gated by approvalClass**.
- A7 `7a8c374` — shared `classifyInstallRisk` + audit-panel RISK_LABELS reuse.

**Post-launch divergences — ALL CLOSED (2026-06-12, founder "close them too"):**
- **#15** (`6fc8500`) — `install_audit.trust_source` DDL CHECK added (generated +
  OSS-mirror parity-locked) with a rebuild migration; the column is no longer
  unconstrained-at-DB while typed-closed in TS.
- **#8** (`c85c295`) — `actionRisk(kind)` in `risk-display` is now the single source
  for the non-install approval surfaces' risk; AgentBuilder/AutomationBuilder/
  ConnectorsApp/MCPHub/MarketplaceApp pull from it (0 scattered literals). The deeper
  "displayed ≠ policy-engine risk" for these non-install actions stays an honest
  action-kind default (no server TrustAssessment feed exists for non-install actions).
- **#17** (`3040a6a`) — `ApprovalModal` renders a structured `trustSource` line via
  shared `TRUST_SOURCE_LABELS`; MarketplaceApp populates it (was a hand-built scope
  string). Omitted when absent (no false provenance).

**D15 closure bar = Track A (A1–A7) + Track B P0 (B1–B5): MET. All 17 taxonomy
divergences now closed (HIGH #1–7 in A1–A6; MED/LOW #8/#14/#15/#16/#17 closed).**

## LAUNCH-BLOCKING (must ship for P7 to close D15)

**Track A — Approval/audit taxonomy + D4(ii) (HALF 2).** Order matters: the shared type is
the foundation everything else imports.

- **A1 — Shared risk module.** Create `packages/shared/src/risk.ts` exporting canonical
  `RiskLevel`(+critical), `ApprovalClass`(+blocked), `TrustSource`(7-val), `AssessmentMode`,
  `AuditAction`(7-val). *Verify:* unit tests assert each enum equals the widest existing set;
  `tsc` shared green. *Commit:* `feat(shared): canonical risk/approval taxonomy (D15)`.
- **A2 — Backend imports the shared enums.** Re-point `trust-model.ts`, `confirmation.ts`,
  `install-audit.ts`, `team-capability-governance.ts` at `@waggle/shared` risk types; give
  `trust-model.classifyRisk` a `critical` path; make `deriveApprovalClass` emit `blocked`;
  collapse the duplicate `getApprovalClass` mapping (`confirmation.ts:140-142`) onto the one
  mapper. Fix `RISK_LEVELS` so `critical` sorts above `low` (div #11). *Verify:* existing
  trust-model/confirmation tests stay green + new cases for critical/blocked; `tsc` agent+core+server.
  *Commit:* `refactor(agent,core,server): single risk taxonomy source (D15)`.
- **A3 — Single audit CHECK source.** Generate/import the `install_audit` CHECK lists from the
  canonical enums so `install-audit.ts` and `hive-mind-core/src/mind/schema.ts` cannot drift;
  add the missing `trust_source` CHECK (div #14,#15). *Verify:* schema-parity test asserts both
  CHECK strings derive from one constant; `auditStore.record()` round-trips a critical/blocked
  row. **§7.5 OSS drift-check** (`scripts/oss-drift-check.sh`) since `schema.ts` is mirrored.
  *Commit:* `fix(core,hive-mind-core): single-source install_audit CHECK constraints (D15)`.
- **A4 — Server risk path for ALL gated tools.** Extend the `chat.ts:939` enrichment branch so
  every gated tool (not just `install_capability`) carries `riskLevel/approvalClass/trustSource`
  on `approval_required`, derived from `PERMISSION_RISK_POINTS` (div #9). Emit a plain-language
  action string (div #10). *Verify:* chat-route tests assert trustMeta present for a non-install
  gated tool; server tsc. *Commit:* `feat(server): risk classification for all gated approvals (D15)`.
- **A5 — D4(ii): widen FE card type + render.** Widen `lib/types.ts:374-382` `ApprovalRequest`
  with the trust fields; render risk badge + trust-source + explanation in `ApprovalGate`
  (`ChatApp.tsx:240-289`) using shared RISK_LABELS/RISK_CLASSES. *Verify:* FE unit test —
  an SSE payload with trustMeta renders a risk badge; `tsc -p apps/web/tsconfig.app.json`.
  *Commit:* `feat(web): in-chat approval card renders server risk taxonomy — D4(ii) (D15)`.
- **A6 — Modal learns approvalClass + critical; gate "Always allow".** Add `approvalClass` to
  `ui/approval-modal.tsx` + a `critical` RISK_LABELS/RISK_CLASSES entry; gate the card's
  "Always allow" (`ChatApp.tsx:267-274`) by `approvalClass` (no permanent grant on critical).
  *Verify:* FE tests — critical renders distinctly from high; "Always allow" hidden/disabled
  on critical. *Commit:* `feat(web): approvalClass + critical tier in shared modal; gate Always-allow (D15)`.
- **A7 — Authoritative consumer risk.** Replace per-call-site `riskLevel` literals
  (`ConnectorsApp.tsx:92`, `AgentBuilder.tsx:196`, `AutomationBuilder.tsx:254`,
  `MCPHubApp.tsx:216,226`) with one shared classifier (generalize `installRiskFor`,
  `MarketplaceApp.tsx:57-62`) keyed on action-kind + trust/scan signal; surface `trustSource`
  in modal scope on all install surfaces (div #8,#17). Validate `InstallAuditPanel`
  normalizer against the enums + reuse RISK_LABELS (div #16). *Verify:* FE tests — same
  conceptual action yields same risk across surfaces. *Commit:* `refactor(web): authoritative shared risk classifier across approval surfaces (D15)`.

**Track B — State grid P0 errors (HALF 1).** Independent of Track A; parallelizable. Each is
the same mechanical fix (thread the `error` the hook already captures + `role=alert` + Retry).

- **B1 — Approvals error state.** `ApprovalsApp.tsx:77-78` — stop coercing to empty; add
  error branch + Retry. *Verify:* FE test — failed fetch shows error, not "No pending approvals".
- **B2 — Room loading+error.** Add `connecting`/`error` to `useRoomState` (`useRoomState.ts:39-41`);
  render connecting + error+reconnect in `RoomApp` (179-187). *Verify:* test — broken SSE ≠ empty.
- **B3 — Command Center error boundary + in-body error.** Wrap the overlay
  (`AppShell.tsx:312`) in `AppErrorBoundary`; surface search/execute failures in-body. *Verify:*
  test — a thrown ResultRow doesn't blank the shell.
- **B4 — Files real error vs offline.** Split cold-load error from `offline`
  (`FilesApp.tsx:157-158`); add list-pane loading branch (469-549). *Verify:* test — 500 shows
  error, not "cached files."
- **B5 — Waggle Dance + Memory/Timeline + Events + Settings catch.** One-line `error`
  re-wires (`WaggleDanceApp.tsx:34`; `MemoryRoute.tsx:103`+`TimelineTab` prop;
  `EventsRoute.tsx:16-20`) + the **`SettingsApp.tsx:168-171` missing `.catch`** (a real
  unhandled-rejection defect — do not skip). *Verify:* per-screen test — failure ≠ empty.

## NICE-TO-HAVE (P2 — do if time; not gating D15 closure)

- **B6 — Vault + Settings + Timeline/Usage error states** (P1 list items 7-9): trust/secrets
  matter but are lower-traffic; ship if A+B0 land with margin.
- **B7 — Tool Launcher empty, My Profile empty/error, Templates/Skills/MCP/Connectors partial
  fixes, loading-flicker polish** (P2 list items 10-13).
- **B8 — `connecting` gates** on `TemplatesView.tsx:76`, `LauncherApp.tsx:130-132`,
  `InstallAuditPanel.tsx:90` (cold-load 401 race; sibling apps already guard).

> **D15 closure bar:** Track A (A1–A7) **and** Track B P0 (B1–B5) are the launch-blocking
> minimum. B6–B8 are nice-to-have and may slip to a fast-follow without re-opening D15,
> provided no P0 error-as-empty remains on a core/trust surface.

---

# OUT OF SCOPE / POST-LAUNCH LEDGER

| Item | Why deferred | Anchor |
|------|--------------|--------|
| Connector `/sync` real implementation | D15 explicitly post-launch; stub stands | `open-questions.md:563` |
| MCP Hub "Logs" action | D15 explicitly post-launch; aria-disabled coming-soon today | `open-questions.md:563`, `InstalledMcpList.tsx:135-144` |
| Workspace Desktop research/timeline/settings tab bodies | Intentional `TabPlaceholder` stubs; tab embeds are P3/P7-tab-embed scope, deferred | `WorkspaceDesktopApp.tsx:955-1006`, `open-questions.md:621-622` |
| Team Governance real `/team` surface | D5 reserves Team work; static upsell card by design (RBAC Phase 5 founder-DEFERRED) | `TeamGovernanceApp.tsx:3-44`, `open-questions.md:547`, `project_rbac_phase5_deferred.md` |
| Marketplace partial-facet silent drop | Silent-by-design; only all-rejected surfaces error | `MarketplaceApp.tsx:170-179` |
| Workspace-scoped members (vs global roster) | Flagged Phase-5 gap in-code | `WorkspaceDesktopApp.tsx:722-724` |
| Builder catalog "which catalog failed" granularity | Partial-error nicety, not a masked-failure defect | `AgentBuilder.tsx:146-148` |
| `errorKind` auto-recover for `notfound`/`permission` mid-session | Intentionally non-revalidating; correct | `WorkspaceDesktopApp.tsx:662` |
| ChatWindowInstance FALLBACK_MODELS / status-bar chips / activeModels | P5→P7 ledgered residuals | `open-questions.md:594,621-622` |
| `memory-mcp` vs `hive-mind-mcp-server` canonical-package decision | Out of launch scope; mark dormant | `open-questions.md:568` |
| teams-server boot error (`Fastify instance is already listening`) | Solo boot path unaffected; classify post-launch | `open-questions.md:567` |

---

*Scope authored 2026-06-12. Read-only pass — no code modified, no tests/tsc run. Ground all
implementation against re-read source per CLAUDE.md §3.5 (context decay).*
