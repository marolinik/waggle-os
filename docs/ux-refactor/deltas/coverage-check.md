# Coverage Check — Waggle OS UX Refactor (Adversarial Completeness Audit)

> **Role:** Coverage Critic. This document is a skeptical, traceability audit of whether the
> UX-refactor analysis (22 gap cards `S00–S21` + 3 deltas) is **complete** against the PRD's three
> contract axes: **§12 screens (1–21)**, **§16 API endpoints (65)**, and **§26 Definition of Done (11)**.
> It also flags PRD surfaces that fall **outside** the §12 numbered-screen list (§9.2/§11 objects,
> §13 journeys, §17 RBAC, §10.4 Extend nodes) that no card owns.
>
> **Method:** every row is grounded in the PRD, the gap cards, `backend-api-delta.md`, and the
> source-grounded `_inventory/backend-routes.md` §16 cross-reference (which the delta draws from).
> "COVERED" = some card/delta explicitly owns the requirement with a build target. "GAP" = skipped,
> implicit-only, or owned by no artifact.
>
> **Sources read:** PRD `docs/Waggle_OS_UX_Refactor_Master_Handoff_Package/Waggle_OS_UX_Refactor_PRD.md`
> (§9, §10, §11, §12 lines 371–662, §13 lines 666–832, §14, §16 lines 1060–1158, §17, §19, §26 lines
> 1485–1500); all `docs/ux-refactor/gap-cards/S00–S21.md`; `docs/ux-refactor/deltas/{backend-api-delta,
> design-system-delta,shared-types-delta}.md`; `docs/ux-refactor/_inventory/{backend-routes,frontend,
> substrate-types}.md`.

---

## Table 1 — PRD Screens (the 21 numbered screens + AppShell)

The 21 numbered screens are the blueprint deck expansion of PRD §12.1–§12.13. AppShell (S00) is the
chrome the PRD §1 spine mounts inside (not a §12 screen, but required by §19.1 + §20.3). **Verdict: all
21 numbered screens + the shell are COVERED by a gap card.** No numbered screen is missing.

| # | PRD screen (§ ref) | Status | Gap card |
|---|---|---|---|
| — | AppShell / IA / Navigation (§1, §19.1, §20.3) | COVERED | **S00** appshell-ia |
| 1 | Home Cockpit (§12.1) | COVERED | **S01** home-cockpit |
| 2 | Workspace Desktop (§12.2) | COVERED (with sub-gaps, see notes) | **S02** workspace-desktop |
| 3 | Command Center (Ctrl+K) (§12.3) | COVERED | **S03** command-center |
| 4 | Memory Center (§12.4) | COVERED | **S04** memory-center |
| 5 | Artifact Center (§12.5) | COVERED | **S05** artifact-center |
| 6 | Skills Hub + Skill Builder (§12.6) | COVERED | **S06** skills-hub (+ **S19** skill-builder) |
| 7 | Connector Hub (§12.7) | COVERED | **S07** connector-hub |
| 8 | MCP Hub (§12.8) | COVERED | **S08** mcp-hub |
| 9 | Agent Center + Agent Builder (§12.9) | COVERED | **S09** agent-center (+ **S18** agent-builder) |
| 10 | Automation Center + Builder (§12.10) | COVERED | **S11** automation-center (+ **S20** automation-builder) |
| 11 | Team Workspace (§12.11) | COVERED | **S10** team-workspace |
| 12 | Onboarding · First Launch (§12.12 step 1) | COVERED | **S12** first-launch |
| 13 | Onboarding · Who Are You (§12.12 step 2) | COVERED | **S13** who-are-you |
| 14 | Onboarding · Tool Discovery (§12.12 step 3) | COVERED | **S14** tool-discovery |
| 15 | Onboarding · Memory Import (§12.12 step 4) | COVERED | **S15** memory-import |
| 16 | Onboarding · Memory Review (§12.12 step 5) | COVERED | **S16** memory-review |
| 17 | Onboarding · Workspace Creation (§12.12 step 6) | COVERED | **S17** workspace-creation |
| 18 | Agent Builder (§12.9 stepper) | COVERED | **S18** agent-builder |
| 19 | Skill Builder (§12.6 stepper) | COVERED | **S19** skill-builder |
| 20 | Automation Builder (§12.10 stepper) | COVERED | **S20** automation-builder |
| 21 | Marketplace / Extend Waggle (§12.13) | COVERED | **S21** marketplace-extend |

**Note — Home Cockpit (§12.12 step 7 "Home Cockpit").** The 7th onboarding step is "land in Home
Cockpit," which is S01 (not a separate screen). Correctly folded. ✔

**Screen-level sub-gaps (not whole-screen misses, but skipped requirements inside a covered screen):**

- **G1 — Workspace Desktop tab parity (S02).** PRD §12.2 (line 426 + 436) names **8 tabs**: Overview,
  Chat, Research/Notes, Artifacts, Memory, Tasks, Timeline, **Settings**. The S02 card's tab bar (line
  20) lists **7** and omits a **Settings** tab; the card later maps "Settings → existing component" (line
  86) but never lists Settings in the §12.2 tab enumeration it reproduces. Minor, but the per-workspace
  Settings tab (needed by Journey 19 "Archive workspace" → "opens workspace settings") should be an
  explicit S02 tab, not implied.
- **G2 — Sessions as a first-class navigable object.** PRD §9.2 + §11 glossary list **Session** as a
  primary product object ("Should be navigable and related to memory/artifacts"). No gap card surfaces a
  Sessions list/navigation view; S02 collapses sessions into the **Timeline** tab + Chat. The session
  substrate is rich and unused at the screen level (`GET /api/workspaces/:id/sessions`,
  `/sessions/search`, `/sessions/:id/timeline`, `/sessions/:id/export` all EXIST per
  `_inventory/backend-routes.md:42–46`). Ctrl+K (S03) does federate session search, so sessions are
  *findable* but not *browsable as an object class*. PRD §13 Journey 3 ("user reviews… sessions") and the
  object hierarchy §9.2 imply a Sessions surface. **Decide:** explicit Sessions tab/sub-view in S02, or
  document that Timeline+Ctrl+K is the intended session UX and amend the §11 "navigable" claim.

---

## Table 2 — PRD §16 Endpoints (all 65) — addressed in `backend-api-delta.md`?

`backend-api-delta.md` deliberately lists **only NET-NEW + EXTEND** backend work (49 of 65) and
**excludes the 16 EXISTS endpoints** (they need FE wiring only). For audit completeness, "addressed"
below = **either** carried in the delta's master table **or** explicitly enumerated as EXISTS-and-excluded
in the delta's de-dup note (lines 46–48) / counts cross-reference (line 372). Counts reconcile to the
`_inventory/backend-routes.md` §16 table (16 EXISTS / 30 PARTIAL / 19 MISSING = 65).

| §16 group | PRD endpoint | In delta? | Disposition / where |
|---|---|:--:|---|
| 16.1 Home | `GET /api/home/briefing` | YES | NET-NEW `home.ts` (delta 1a) |
| 16.1 | `POST /api/quick-capture` | YES | EXTEND → memory write (delta 1a) |
| 16.1 | `GET /api/home/overnight` | YES | NET-NEW `home.ts` (delta 1a) |
| 16.2 Workspaces | `GET /api/workspaces` | YES (EXISTS-excluded) | exists; FE wiring only (delta line 46) |
| 16.2 | `POST /api/workspaces` | YES | EXTEND richer body (delta 2c) |
| 16.2 | `GET /api/workspaces/:id` | YES (EXISTS-excluded) | exists; FE wiring only |
| 16.2 | `PATCH /api/workspaces/:id` | YES (EXISTS-excluded) | exists (also PUT); FE wiring only |
| 16.2 | `GET /api/workspaces/:id/state` | YES | EXTEND thin route (delta 1b) |
| 16.2 | `GET /api/workspaces/:id/context` | YES (EXISTS-excluded) | exists; the Home/Workspace seed |
| 16.2 | `GET /api/workspaces/:id/activity` | YES | EXTEND thin alias (delta 1b) |
| 16.3 Command | `GET /api/command/search?q=` | YES | NET-NEW `command.ts` (delta 1c) |
| 16.3 | `POST /api/command/execute` | YES | EXTEND over `/commands/execute` (delta 1c) |
| 16.3 | `GET /api/command/recent` | YES | NET-NEW / client-derive (delta 1c) |
| 16.3 | `GET /api/command/suggestions` | YES | NET-NEW (delta 1c) |
| 16.4 Memory | `GET /api/memory` | YES | EXTEND alias (delta 2a) |
| 16.4 | `GET /api/memory/:id` | YES | NET-NEW thin read (delta 2a) |
| 16.4 | `POST /api/memory` | YES | EXTEND alias (delta 2a) |
| 16.4 | `PATCH /api/memory/:id` | YES | EXTEND (PATCH+bare id) (delta 2a) |
| 16.4 | `POST /api/memory/:id/archive` | YES | NET-NEW thin (delta 2a) |
| 16.4 | `DELETE /api/memory/:id` | YES | EXTEND alias (delta 2a) |
| 16.4 | `POST /api/memory/merge` | YES | NET-NEW (delta 2a) |
| 16.4 | `GET /api/memory/graph` | YES (EXISTS-excluded) | exists (`knowledge.ts`); FE wiring only (delta line 47) |
| 16.5 Harvest | `POST /api/harvest/preview` | YES | EXTEND (confidence+items) (delta 2a) |
| 16.5 | `POST /api/harvest/commit` | YES | EXTEND (`selectedIds`) (delta 2a) |
| 16.5 | `GET /api/harvest/sources` | YES (EXISTS-excluded) | exists; FE wiring only |
| 16.5 | `POST /api/harvest/sources/:id/sync` | YES | NET-NEW thin (delta 2d) |
| 16.6 Artifacts | `GET /api/artifacts` | YES | NET-NEW `artifacts.ts` (delta 2b) |
| 16.6 | `POST /api/artifacts` | YES | NET-NEW (delta 2b) |
| 16.6 | `GET /api/artifacts/:id` | YES | NET-NEW (delta 2b) |
| 16.6 | `PATCH /api/artifacts/:id` | YES | NET-NEW (delta 2b) |
| 16.6 | `DELETE /api/artifacts/:id` | YES | NET-NEW (delta 2b) |
| 16.6 | `GET /api/artifacts/search-related?q=` | YES | NET-NEW (delta 2b) |
| 16.7 Agents | `GET /api/agents` | YES | NET-NEW `agents.ts` (delta 3a) |
| 16.7 | `POST /api/agents` | YES | NET-NEW (delta 3a) |
| 16.7 | `GET /api/agents/:id` | YES | NET-NEW (delta 3a) |
| 16.7 | `PATCH /api/agents/:id` | YES | NET-NEW (delta 3a) |
| 16.7 | `POST /api/agents/:id/run` | YES | EXTEND → fleet/spawn (delta 3a) |
| 16.7 | `POST /api/agents/:id/pause` | YES | EXTEND → fleet pause (delta 3a) |
| 16.7 | `GET /api/agents/:id/traces` | YES | NET-NEW over `execution_traces` (delta 3a) |
| 16.8 Skills | `GET /api/skills` | YES (EXISTS-excluded) | exists; FE wiring only |
| 16.8 | `POST /api/skills` | YES (EXISTS-excluded) | exists (+ `/skills/create`); Builder target |
| 16.8 | `PATCH /api/skills/:id` | YES | EXTEND (PATCH+id alias) (delta 3b) |
| 16.8 | `POST /api/skills/:id/test` | YES | EXTEND (:id variant) (delta 3b) |
| 16.8 | `POST /api/skills/:id/install` | YES | NET-NEW dispatcher (delta 3b) |
| 16.9 Conn/MCP/Mkt | `GET /api/connectors` | YES | EXISTS + optional payload EXTEND (delta 4a) |
| 16.9 | `POST /api/connectors/:id/connect` | YES | EXISTS + audit EXTEND (delta 4a) |
| 16.9 | `POST /api/connectors/:id/sync` | YES | NET-NEW (delta 4a) |
| 16.9 | `POST /api/connectors/:id/revoke` | YES | EXTEND alias → disconnect (delta 4a) |
| 16.9 | `GET /api/mcps` | YES | NET-NEW `mcps.ts` (delta 4b) |
| 16.9 | `POST /api/mcps/install` | YES | EXTEND via marketplace installer (delta 4b) |
| 16.9 | `POST /api/mcps/:id/test` | YES | NET-NEW (delta 4b) |
| 16.9 | `POST /api/mcps/:id/revoke` | YES | NET-NEW (delta 4b) |
| 16.9 | `GET /api/marketplace` | YES | EXTEND bare-path alias (delta 4c) |
| 16.9 | `POST /api/marketplace/install` | YES (EXISTS-excluded) | exists (PRO, SecurityGate); FE wiring |
| 16.10 Automations | `GET /api/automations` | YES | EXTEND alias → cron (delta 3c) |
| 16.10 | `POST /api/automations` | YES | EXTEND alias → cron (delta 3c) |
| 16.10 | `PATCH /api/automations/:id` | YES | EXTEND alias (+ FE PUT/PATCH bug fix) (delta 3c) |
| 16.10 | `POST /api/automations/:id/run` | YES | EXTEND alias → cron trigger (delta 3c) |
| 16.10 | `POST /api/automations/:id/pause` | YES | NET-NEW thin / EXTEND (delta 3c) |
| 16.10 | `GET /api/automations/:id/logs` | YES | EXTEND alias → cron history (delta 3c) |
| 16.11 Team/RBAC | `GET /api/teams/:id` | YES (EXISTS-excluded) | exists; FE wiring only |
| 16.11 | `POST /api/teams/:id/invite` | YES | EXTEND alias → `/members` (delta 5) |
| 16.11 | `PATCH /api/teams/:id/members/:memberId` | YES | EXTEND (role-gate bug fix) (delta 5) |
| 16.11 | `GET /api/teams/:id/audit` | YES | EXTEND alias → `/activity` (delta 5) |
| 16.11 | `POST /api/share` | YES | NET-NEW (delta 5) |

**Verdict: 65/65 PRD §16 endpoints are addressed** — 49 with explicit build targets, 16 acknowledged as
EXISTS-and-excluded (FE-wiring-only). **No §16 endpoint is silently dropped.** The delta additionally
adds ~16 blueprint-implied endpoints beyond the §16 literal set (MCP start/stop/logs/permissions/custom,
connector health/activity, automations/test, team governance, artifact-share, extend/audit) — over-, not
under-, coverage.

**Audit caveats on Table 2 (skeptical reads — these are scope decisions hidden as "addressed"):**

- **C1 — `POST /api/connectors/:id/sync` is "phased to a stub" (delta 4a, line 214).** Marked NET-NEW but
  the MVP is explicitly only `healthCheck()` + a `lastSyncAt` stamp; "full data re-pull is a larger
  connector-SDK addition." So the headline §12.7 acceptance ("**whether data is flowing**") is met only
  cosmetically in v1. This is the load-bearing S07 gap and the delta admits it does not truly close it.
- **C2 — `GET /api/mcps/:id/logs` deferred (delta 4b, line 238).** No log-capture infra exists; PRD §12.8
  lists "view logs" as a functional requirement and §16 implies logs visibility. Deferred to "a later
  phase." So MCP "auditable" (§12.8 acceptance) is partially unmet at the route level for v1.
- **C3 — `POST /api/mcps/:id/test` open question unresolved (delta 4b, line 233).** "live spawn-and-
  handshake vs static manifest validation" is undecided. The endpoint is listed but its semantics are not.
- **C4 — Boot-time `mcpRuntime` population (delta 4b, line 240).** This is flagged as "the foundational
  non-route work item that unblocks all of [MCP]" — but it is **not an endpoint and not phased into a
  sprint**. It is the single biggest hidden-effort item in the Extend layer and should be an explicit
  Phase-4 task, not a footnote.

---

## Table 3 — PRD §26 Definition of Done (all 11) — addressed by a phase/card?

**Headline finding (CRITICAL): no gap card or delta references the Definition of Done by name.** A
grep for "Definition of Done" / "DoD" across all 22 cards + 3 deltas returns **0 matches**. The DoD is
the PRD's release-acceptance contract; the analysis satisfies most items *implicitly* but ships **no
DoD→phase/card traceability artifact**. The next planner must not assume DoD is closed just because the
screens are covered. Per-item mapping below.

| # | DoD item (§26) | Status | Where addressed / GAP |
|---|---|---|---|
| 1 | Home Cockpit replaces blank-chat launch behavior | COVERED (implicit) | S01 builds Home Cockpit; but **no card/delta states the launch-default flip** (today launch = workspace/chat per `frontend.md`). The *behavioral replacement* (boot route → Home) is an **S00 AppShell routing change** that S00 does not explicitly own. **GAP-D1:** name the default-route change. |
| 2 | Workspace Desktop is default runtime for workspace work | COVERED | S02 (`create-new` tabbed runtime); S00 routes to it. |
| 3 | Ctrl+K can search/launch/create/run/navigate/extend | COVERED | S03 + S00 (global provider); `CommandResult.kind` enum covers all 6 verbs (S03 line 136). |
| 4 | Memory Center exposes source/confidence/evidence/scope/edit/delete | COVERED (1 conditional dep) | S04 + S16; ConfidenceBadge/EvidenceChip/EvidencePanel in design-delta; **depends on M1 `memory_frames.metadata` migration** if confidence/scope become real filter axes (delta §M1). If M1 is skipped, "confidence/scope" is in-app-only — verify against §12.4 AC. |
| 5 | Artifact Center supports outcome search + related objects | COVERED | S05 + `GET /api/artifacts/search-related` (delta 2b). |
| 6 | Onboarding leads profile→tool-discovery→import→review→first workspace | COVERED | S12–S17 chain; S00/onboarding shell. |
| 7 | Agents, skills, automations, connectors, MCPs, marketplace have coherent IA | COVERED | S06–S11, S18–S21 all map to the Work/Intelligence/Extend IA (S00 §IA). |
| 8 | Team workspace supports shared intelligence + roles | COVERED (RBAC UI partial) | S10; **but RBAC UI is an open question** — `GET /api/teams/:id/governance` is "optional/NET-NEW" (delta 5) and PRD §17 role matrix has **no dedicated card** (see GAP-D2). |
| 9 | Sensitive actions are approval-gated and audited | COVERED (cross-cutting, no owner card) | ApprovalModal in design-delta; S03/S08/S18/S19/S20 reference approval; `/extend/audit` (delta 4c). **GAP-D3:** the approval+audit *pattern* is cross-cutting but **owned by no single card** — risk of inconsistent per-screen implementation. |
| 10 | All screens have required states (§14) | PARTIAL — **the weakest-traced DoD item** | design-delta builds EmptyState/ErrorState/Skeleton/StatusBadge (the *primitives*), but **no card carries a per-screen §14 state matrix**. State-keyword density is uneven across cards (S02, S18, S20, S21 are thin; S00/S12 are rich). §14.1 mandates 9 global states (Loading/Empty/Populated/Error/Offline/Syncing/Permission-denied/Partial/Approval) on *every* major screen. **GAP-D4:** no screen×state coverage grid exists. |
| 11 | Claude Code can continue from PRD without product interpretation | COVERED (this artifact set is the evidence) | The 22 cards + 3 deltas + this check are the interpretation layer; this is met by the existence of the analysis itself, modulo the open questions below. |

---

## Concrete gaps to fix (prioritized)

**CRITICAL (close before the impl plan is "done"):**

1. **GAP-D4 — No screen × §14-state coverage matrix.** DoD #10 requires *every* major screen to
   implement the 9 global states (§14.1) plus its screen-specific states (§14.2–§14.7). The design-delta
   ships the state *primitives* but no artifact proves each of S01–S21 wires Loading/Empty/Error/Offline/
   Permission-denied/Approval. Cards S02, S18, S20, S21 are visibly thin on state enumeration. **Fix:**
   add a 21×9 state-coverage grid (per-screen) to the impl plan; it is the single most under-traced DoD
   item.
2. **GAP-D3 — Approval-gating + audit is cross-cutting but owned by no card.** DoD #9 + PRD §17.3 +
   §18.1. ApprovalModal (design-delta #7) and `/extend/audit` (delta 4c) exist, but no card defines the
   canonical "which actions are sensitive, what the approval payload is, what gets audited" contract.
   Risk: each builder (S18/S19/S20) and S03/S08 re-implements approval differently. **Fix:** a dedicated
   cross-cutting "Approval & Audit" spec section (or an S00 sub-card) naming the gated-action taxonomy.
3. **C4 — MCP boot-time runtime population is a hidden foundational task, not a sprint item.** Without it
   none of the MCP routes function. **Fix:** elevate `mcpRuntime` population (`local/index.ts:911`) to an
   explicit Phase-4 task with its own estimate.

**HIGH:**

4. **GAP-D1 — The blank-chat→Home launch-default flip (DoD #1) is unowned.** S01 builds the screen; no
   card changes the boot route. **Fix:** assign the default-route change to S00 explicitly.
5. **GAP-D2 — PRD §17 RBAC role matrix (Owner/Admin/Contributor/Viewer × 6 capabilities) has no
   dedicated card.** S10 covers Team Workspace and mentions RBAC, but the role×permission enforcement UI
   + the `GET /api/teams/:id/governance` route are "optional." DoD #8 ("supports… roles") and §17.2 are
   only partially traced. PRD §20.3 lists `RBAC/Audit components` under Create. **Fix:** confirm S10 owns
   the §17.2 matrix UI, or add an RBAC/Audit card.
6. **G2 — Sessions has no first-class screen** despite being a §9.2/§11 primary object. Collapsed into
   S02 Timeline + Ctrl+K search. **Fix:** either add an explicit Sessions sub-view to S02 or document that
   Timeline+Ctrl+K is the intended UX and soften the §11 "navigable" claim.
7. **C1 — Connector `/sync` MVP is a cosmetic stub** that does not meet §12.7's "whether data is
   flowing" acceptance. **Fix:** flag in the plan that S07's headline AC is only partially met in v1;
   schedule the real connector-SDK data-pull.

**MEDIUM:**

8. **G1 — S02 omits the §12.2 Settings tab** from its tab enumeration (7 vs PRD's 8). Needed for
   Journey 19 (Archive workspace). **Fix:** add Settings to the S02 tab list.
9. **C2 — MCP `/:id/logs` deferred** vs §12.8 "view logs" functional requirement. **Fix:** confirm
   v1-acceptable, or schedule the stderr ring-buffer.
10. **C3 — MCP `/:id/test` semantics undecided** (live handshake vs static validation). **Fix:** resolve
    the open question before S08 build.
11. **Journeys §13 (20 journeys) are not cross-referenced to cards.** The analysis is screen-oriented;
    no artifact maps the 20 user journeys (esp. J15 agent-approval, J16 automation-failure→Home-attention,
    J19 archive, J20 delete-memory) to the screens that must implement each step. Most are implicitly
    covered, but **J16** (overnight failure surfacing in Home "attention required") spans S01+S11+S20 and
    is not explicitly owned end-to-end. **Fix:** a journey→screen trace table.

**LOW / acknowledged-by-design (not true gaps, listed so they are not re-litigated):**

12. **Models / External-tools Extend nodes (§10.4)** have no standalone Hub card — folded into S21
    (Models = marketplace category federated from Settings→Models; external_tool = `ExtensionType`).
    S21 line 132 raises the `ExtensionType` reconciliation open question (agent vs external_tool). This is
    a deliberate fold, not a miss — but the `ExtensionType` union must be resolved (shared-types-delta).
13. **§16 EXISTS endpoints (16) excluded from the delta** — correct by design (FE-wiring-only), and
    acknowledged in the delta de-dup note. Not a gap.
14. **Schema migrations** — at most M1 ships; M2 (install_audit CHECK) is a real latent bug the delta
    caught (good); M3 (agents table) correctly deferred. No gap.

---

## Bottom line

- **Screens:** 21/21 numbered screens + AppShell COVERED. 2 intra-screen sub-gaps (S02 Settings tab;
  Sessions-as-object).
- **§16 endpoints:** 65/65 addressed (49 build targets + 16 EXISTS-excluded). Coverage is complete; 4
  scope caveats (connector-sync stub, MCP logs/test/boot) are admitted-but-soft.
- **§26 DoD:** 11/11 items map to *some* artifact, but **DoD is never named** and **2 items are only
  partially traced** (#10 states matrix, #9 approval/audit owner) plus #1 (launch-flip) and #8 (RBAC
  matrix) have unowned slices. **The biggest completeness risk is not a missing screen — it is the
  absence of two cross-cutting traceability grids (screen×state, journey×screen) and an explicit
  approval/audit + RBAC owner.**
