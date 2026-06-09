# Waggle OS UX Refactor — Analysis & Plan Index

> This folder is the **product-interpretation layer** between the UX-Refactor PRD (the source of
> truth) and the code. It exists so an implementing agent can build the refactor screen-by-screen
> without re-deriving product decisions. Everything here is **source-grounded** against live code
> under `apps/web/src`, `packages/server/src`, and `packages/hive-mind-core/src` — every claim cites
> a real file (and line where load-bearing).

---

## Executive summary (one paragraph)

Waggle OS today is a **single-route windowed desktop OS** (`apps/web/src/components/os/Desktop.tsx`
+ `Dock.tsx`, 27 `AppId` window types, no react-router navigation) with a deep, mostly-built backend
substrate (workspace-manager, workspace-state builder, `.mind` schema, harvest pipeline, install-audit,
approval/trust runtime). The refactor turns it into a **workspace-first Agent Desktop** whose spine is
**Home Cockpit + Workspace Desktop + Win+K Command Center + visible Memory + Artifacts + Agents/Skills/
Automations + a governed Extend layer + Team**. The locked execution model is an **in-place incremental
refactor** of `apps/web` plus **targeted local-sidecar (Fastify) backend extensions** — not a rebuild —
because most PRD §16 endpoints either exist or can be aliased/extended over existing handlers; the master
list resolves to **53 endpoints of real backend work** (35 net-new + 18 extend), **5 new sidecar route
files**, **2 new JSON-file stores**, and **at most one conditional SQLite migration**. All 21 numbered
screens + the AppShell are covered by a gap card; the highest residual risks are cross-cutting
(per-screen state coverage, approval/audit ownership, RBAC role unification, MCP runtime population).

**The master plan is [`IMPLEMENTATION-PLAN.md`](./IMPLEMENTATION-PLAN.md).** Start there once you have
read the locked decisions below.

---

## Locked decisions (do not relitigate)

1. **Execution model = in-place INCREMENTAL REFACTOR** of `apps/web` + targeted backend extensions.
   NOT a from-scratch / Lovable rebuild. Reuse the existing substrate (workspace-manager,
   workspace-state builder, `.mind` schema, install-audit, `ai_interactions`).
2. **Scope = FULL-STACK.** The plan covers net-new/extended **backend** APIs *and* **frontend**, because
   many PRD §16 endpoints do not exist yet.
3. **Mockups are DIRECTIONAL** visual reference (PRD §24), not pixel-perfect targets. **PRD acceptance
   criteria win over pixels.**
4. **Local-first by default** (PRD §6.7). The desktop frontend talks ONLY to the local sidecar
   (`packages/server/src/local/index.ts`, loopback `:3333`); the Clerk-gated cloud server is out of scope.
5. **Backend-map is the contract reference** (`docs/backend-map/README.md` + `sections/` + `DIAGRAMS/`,
   audited ~96%). Ground every backend claim there or in live source.

---

## Recommended reading order

1. **This README** — orientation + locked decisions.
2. **PRD** (source of truth) — `../Waggle_OS_UX_Refactor_Master_Handoff_Package/Waggle_OS_UX_Refactor_PRD.md`.
3. **[`IMPLEMENTATION-PLAN.md`](./IMPLEMENTATION-PLAN.md)** — the phased full-stack master plan (Phase 0..6).
4. **Inventories** (current state) — read the three `_inventory/*.md` before touching code.
5. **Deltas** (what changes) — `deltas/*.md`, especially `backend-api-delta.md` and `open-questions.md`.
6. **Gap cards** (per-screen build specs) — `gap-cards/S00..S21.md`, pulled in by the phase that owns them.
7. **`deltas/coverage-check.md`** — the adversarial completeness audit; read its "Concrete gaps to fix"
   list and confirm the plan addresses each.

---

## Inventories — current state (`_inventory/`)

| Doc | What it maps |
|---|---|
| [`_inventory/frontend.md`](./_inventory/frontend.md) | Every `apps/web/src` surface: 26 apps, 14 overlays, the window-manager/dock shell, the `adapter.ts` HTTP/SSE gateway (~150 methods), domain hooks, `lib/types.ts`, the `ui/*` DS primitives, and current-apps → new-IA bucket mapping. |
| [`_inventory/backend-routes.md`](./_inventory/backend-routes.md) | Every existing local-sidecar endpoint by domain + a PRD §16 cross-reference (65 endpoints: **16 EXIST / 30 PARTIAL / 19 MISSING**). |
| [`_inventory/substrate-types.md`](./_inventory/substrate-types.md) | WorkspaceConfig vs §15.3, workspace-state outputs, `.mind` schema, memory frames, install-audit, and FE↔BE type drift. |

## Deltas — what the refactor adds/changes (`deltas/`)

| Doc | What it specifies |
|---|---|
| [`deltas/backend-api-delta.md`](./deltas/backend-api-delta.md) | **The build contract.** Consolidated, de-duplicated, phase-ordered master list of every endpoint to build/extend (53 with backend work) + schema migrations (§M). New route files + JSON stores + counts. |
| [`deltas/shared-types-delta.md`](./deltas/shared-types-delta.md) | PRD §15.2 unions + entity shapes (Memory, Artifact, Agent, Skill, Automation, McpInstance, Command) — NEW vs MODIFY, and where each lives (`@waggle/shared` vs FE `lib/types.ts`). |
| [`deltas/design-system-delta.md`](./deltas/design-system-delta.md) | PRD §19 component list mapped to the live Hive DS: EXISTS vs BUILD-NEW (~13 new DS components), the `--sem-*` color-semantic alias layer, dark-default/light-variant, a11y obligations. |
| [`deltas/rbac-security-delta.md`](./deltas/rbac-security-delta.md) | PRD §17/§18: the two divergent RBAC planes, the approval/consent runtime (strong, reuse it), the three audit stores, and the security build order. |
| [`deltas/open-questions.md`](./deltas/open-questions.md) | The founder-ratification list: the 8 PRD §23 questions (§A), cross-cutting decisions blocking ≥2 screens (§B), screen-local questions (§C), each with a RECOMMENDED answer + the phase it blocks. |
| [`deltas/coverage-check.md`](./deltas/coverage-check.md) | Adversarial completeness audit: 21/21 screens + 65/65 §16 endpoints + 11/11 DoD items traced; surfaces the cross-cutting gaps (screen×state grid, approval/audit owner, RBAC matrix, sessions-as-object, connector-sync stub, MCP runtime). |

## Gap cards — per-screen build specs (`gap-cards/`)

Each card carries: screen & purpose · required states · current-state-in-repo disposition · frontend
work (keep-promote / rework / create, real paths) · backend work (PRD §16 mapping) · shared types ·
dependencies · effort · open questions.

| Card | Screen | PRD § | Phase (this plan) |
|---|---|---|---|
| [S00](./gap-cards/S00-appshell-ia.md) | AppShell + IA + Navigation | §1, §19.1, §20.3 | **0** |
| [S01](./gap-cards/S01-home-cockpit.md) | Home Cockpit | §12.1 | **1** |
| [S02](./gap-cards/S02-workspace-desktop.md) | Workspace Desktop | §12.2 | **1** |
| [S03](./gap-cards/S03-command-center.md) | Win+K Command Center | §12.3 | **1** |
| [S04](./gap-cards/S04-memory-center.md) | Memory Center | §12.4 | **2** |
| [S05](./gap-cards/S05-artifact-center.md) | Artifact Center | §12.5 | **2** |
| [S06](./gap-cards/S06-skills-hub.md) | Skills Hub | §12.6 | **3** |
| [S07](./gap-cards/S07-connector-hub.md) | Connector Hub | §12.7 | **4** |
| [S08](./gap-cards/S08-mcp-hub.md) | MCP Hub | §12.8 | **4** |
| [S09](./gap-cards/S09-agent-center.md) | Agent Center | §12.9 | **3** |
| [S10](./gap-cards/S10-team-workspace.md) | Team Workspace | §12.11 | **5** |
| [S11](./gap-cards/S11-automation-center.md) | Automation Center | §12.10 | **3** |
| [S12](./gap-cards/S12-first-launch.md) | Onboarding · First Launch | §12.12 | **2** |
| [S13](./gap-cards/S13-who-are-you.md) | Onboarding · Who Are You | §12.12 | **2** |
| [S14](./gap-cards/S14-tool-discovery.md) | Onboarding · Tool Discovery | §12.12 | **2** |
| [S15](./gap-cards/S15-memory-import.md) | Onboarding · Memory Import | §12.12 | **2** |
| [S16](./gap-cards/S16-memory-review.md) | Onboarding · Memory Review | §12.12 | **2** |
| [S17](./gap-cards/S17-workspace-creation.md) | Workspace Creation | §12.12 | **2** |
| [S18](./gap-cards/S18-agent-builder.md) | Agent Builder | §12.9 | **3** |
| [S19](./gap-cards/S19-skill-builder.md) | Skill Builder | §12.6 | **3** |
| [S20](./gap-cards/S20-automation-builder.md) | Automation Builder | §12.10 | **3** |
| [S21](./gap-cards/S21-marketplace-extend.md) | Marketplace / Extend Waggle | §12.13 | **4** |

---

## How this set was assembled

The 3 inventories were read out of live source; the 22 gap cards were written one-per-screen against
PRD §12 + the blueprint screen specs; the 6 deltas consolidate the cross-screen contracts (API, types,
DS, RBAC) and the founder decisions; the coverage-check is an adversarial audit proving completeness
against PRD §12 (screens), §16 (endpoints), and §26 (Definition of Done). The `IMPLEMENTATION-PLAN.md`
sequences all of it into one phased Phase 0..6 program under the locked in-place refactor model.

Maintained alongside `docs/backend-map/` (the source-grounded backend contract) and `CLAUDE.md` (the
operating contract — verification commands in §2, file-org rules in §3).
