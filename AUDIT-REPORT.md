# Waggle OS — Audit Report
**Date:** 2026-04-01
**Scope:** Type safety, tier enforcement, embedding providers, dead code, KVARK surface
**Mode:** Read-only. No code was modified.

---

## Phase 1 — Type Safety

### Error Summary by Package

| Package | tsc Errors | Status |
|---------|-----------|--------|
| packages/shared | **0** | Clean |
| packages/core | **0** | Clean |
| packages/agent | **0** | Clean |
| packages/server | **0** | Clean |
| app (frontend) | **35** | Broken |
| **Total** | **35** | |

### app/ Error Breakdown

| Count | Error Code | Category | Description |
|-------|-----------|----------|-------------|
| 15 | TS2307 | Missing modules | `@base-ui/react/*` not installed (shadcn migration) |
| 3 | TS7006 | Implicit any | `isOpen` callback param in Dialog `onOpenChange` |
| 3 | TS6133 | Unused declarations | `OnboardingTooltips`, `handleOnboardingComplete`, `serverUrl` |
| 2 | TS2352 | Unsafe cast | `HealthData` to `Record<string, unknown>` in CockpitView |
| 2 | TS2322 | Type mismatch | `WorkspaceMicroStatus` vs `DashboardMicroStatus`, optional vs required fields in useChat |
| 1 | TS2719 | Duplicate type name | Two unrelated `AppView` types |
| 1 | TS2345 | Arg type mismatch | String passed to `SetStateAction<"agent_task">` in CronSchedulesCard |
| 1 | TS2307 | Missing module | `@tauri-apps/api/core` (Tauri SDK) |
| 1 | TS2307 | Missing module | `tailwind-merge` |

### 10 Most Critical Errors (Runtime Risk)

1. **`app/src/App.tsx:1079`** — `WorkspaceMicroStatus` not assignable to `DashboardMicroStatus`. Dashboard data will be wrong shape at runtime. **P1**
2. **`app/src/App.tsx:1194`** — Two unrelated `AppView` types. Navigation may route to wrong view. **P1**
3. **`app/src/App.tsx:1317`** — Missing `@tauri-apps/api/core`. Tauri IPC calls will crash at runtime in desktop builds. **P1**
4. **`packages/ui/src/hooks/useChat.ts:227`** — Optional `cost`/`tokens` fields where required type expected. Chat cost display will break. **P2**
5. **`app/src/components/cockpit/CronSchedulesCard.tsx:149`** — String assigned to union literal state. Cron type dropdown may not work. **P2**
6. **`app/src/views/CockpitView.tsx:307`** (x2) — Unsafe cast `HealthData` → `Record<string, unknown>`. Enterprise health check may lose type safety. **P2**
7-9. **`GlobalSearch.tsx:88`, `KeyboardShortcutsHelp.tsx:111`, `PersonaSwitcher.tsx:134`** — `isOpen` implicit any. Dialog behavior undefined on type level. **P3**
10. **15x `@base-ui/react/*` missing** — shadcn component library not installed. All UI components referencing base-ui will fail to render. **P1** (but likely a `npm install` issue, not a code issue)

### packages/shared — CLEAN
Zero errors. No cascading type issues from the shared package.

---

## Phase 2 — Tier Enforcement Gap Analysis

### Current Tier System

The Tier type is defined **inline** in `packages/server/src/local/routes/settings.ts:219`:
```typescript
type Tier = 'solo' | 'teams' | 'business' | 'enterprise';
```
**Not exported. Not in `@waggle/shared`. No reusable middleware.**

### Backend Tier Logic (Step B)

| File | What it does | Enforcement method |
|------|-------------|-------------------|
| `settings.ts:221-232` | `getTierLimits()` — returns limits per tier | Inline function, not middleware |
| `settings.ts:250-252` | `GET /api/tier` — reads tier from config.json | Returns data only, no gating |
| `settings.ts:259-278` | `PATCH /api/tier` — changes tier (MOCK) | Testing endpoint, no auth |
| `workspaces.ts:143-157` | Workspace creation limit check | Inline try/catch, reads config.json |
| `fleet.ts:36-38` | Max concurrent sessions by tier | Inline lookup map |

### Tier-Gated Features in Backend

| Feature | Tier Gate | How enforced |
|---------|----------|-------------|
| Workspace count limit | solo=5, teams=25, business=100 | Inline check in workspace POST |
| Concurrent sessions | solo=3, teams=10, business=25 | Inline check in fleet route |
| Teams feature | solo=NO | settings.ts `getTierLimits()` response only |
| Marketplace access | solo=NO | settings.ts `getTierLimits()` response only |
| Budget controls | business+ | settings.ts `getTierLimits()` response only |
| KVARK integration | enterprise only | settings.ts `getTierLimits()` response only |
| Governance | enterprise only | settings.ts `getTierLimits()` response only |
| Custom models | teams+ | settings.ts `getTierLimits()` response only |

### Frontend Tier Logic (Step A)

**Minimal tier gating found in frontend.** Only one reference:
- `packages/ui/src/components/settings/utils.ts:164` — Provider list includes `{ id: 'kvark', label: 'Enterprise' }`

No `LockedFeature`, `TIER_`, `userTier`, or tier comparison operators found in `app/src/` or `packages/ui/src/`.

### UNPROTECTED Features (P1 Bugs)

The `getTierLimits()` function returns feature flags (`teams`, `marketplace`, `budgetControls`, `kvark`, `governance`, `customModels`) but these are **advisory only** — the API routes serving these features have **no tier enforcement middleware**.

| Feature | Route | Tier check? | Status |
|---------|-------|------------|--------|
| Team creation | `POST /api/teams` | **NONE** | **UNPROTECTED** |
| Marketplace browse/install | `/api/marketplace/*` | **NONE** | **UNPROTECTED** |
| Budget controls | `/api/cost/*` | **NONE** | **UNPROTECTED** |
| KVARK tools | kvark-tools.ts mentions tier gating | Comment only | **UNPROTECTED** |
| Custom persona creation | `POST /api/personas` | **NONE** | **UNPROTECTED** |
| Sub-agent spawning | Via agent loop | **NONE** | **UNPROTECTED** |
| Workspace creation | `POST /api/workspaces` | Inline check | **PARTIALLY PROTECTED** |
| Concurrent sessions | fleet.ts | Inline check | **PARTIALLY PROTECTED** |

### Assessment

**No `requireTier()` or `assertTier()` middleware exists anywhere in the codebase.** All tier enforcement is either:
1. Advisory (frontend reads `getTierLimits()` and shows/hides UI — easily bypassed)
2. Inline and inconsistent (workspace count, session count)
3. Completely absent (teams, marketplace, budget, KVARK, governance)

**This is the single largest security/monetization gap in Waggle OS.**

---

## Phase 3 — Stale Tier Names

### Canonical Names (from CLAUDE.md)
`SOLO`, `BASIC`, `TEAMS`, `ENTERPRISE`

### Stale Names Found

| File | Line | Stale Name | Context |
|------|------|-----------|---------|
| `apps/www/src/components/Pricing.tsx` | 6 | `'Solo'` | Landing page pricing card |
| `apps/www/src/components/Pricing.tsx` | 11 | `'Teams'` | Landing page pricing card |
| `apps/www/src/components/Pricing.tsx` | 16 | `'Business'` | Landing page pricing card |

### Inconsistencies in Backend

The backend uses lowercase `'solo' | 'teams' | 'business' | 'enterprise'` in:
- `settings.ts` (6 references)
- `workspaces.ts` (3 references)
- `fleet.ts` (1 reference)

The canonical CLAUDE.md names are `SOLO, BASIC, TEAMS, ENTERPRISE` — note `BASIC` replaces what was previously `'Teams'` at $15/mo, and `TEAMS` replaces what was `'Business'` at $79/mo. **The entire tier name mapping needs reconciliation.**

### Current (stale) vs Canonical

| Backend (current) | Landing page (current) | Canonical (CLAUDE.md) | Price |
|---|---|---|---|
| `solo` | `Solo` | `SOLO` | Free |
| — | — | `BASIC` | $15/mo |
| `teams` | `Teams` | `TEAMS` | $79/mo |
| `business` | `Business` | — (removed?) | — |
| `enterprise` | — | `ENTERPRISE` | Consultative |

**There is no `BASIC` tier anywhere in the code.** The tier system needs a migration.

---

## Phase 4 — Embedding Provider Audit

### File: `packages/core/src/mind/embedding-provider.ts` (280 LOC)

### Providers

| ID | Model Default | Key Source | Probe Method |
|----|-------------|-----------|-------------|
| `inprocess` | `Xenova/all-MiniLM-L6-v2` | None (local) | ONNX in-process |
| `ollama` | `nomic-embed-text` | None (local) | HTTP to localhost |
| `voyage` | `voyage-3-lite` | `config.voyage.apiKey` | API call |
| `openai` | `text-embedding-3-small` | `config.openai.apiKey` | API call |
| `litellm` | `text-embedding` | `config.litellm.apiKey` | Proxy call |
| `mock` | `deterministic-mock` | None | Hash-based |

### Fallback Chain (auto mode)
`inprocess → ollama → voyage → openai → [litellm not in auto chain] → mock`

### Audit Findings

| Check | Status | Details |
|-------|--------|---------|
| Tier validation on selection | **MISSING** | Any tier can use any provider. No gating. |
| Per-provider usage quotas | **MISSING** | No rate limiting or token counting per provider. |
| API keys from Vault exclusively | **PARTIAL** | Keys come from `EmbeddingProviderConfig` object passed by caller. The server reads keys from Vault, but the provider itself accepts raw keys — no Vault enforcement at this layer. |
| Output normalized to 1024 dims | **YES** | `targetDimensions` defaults to 1024 (line 147). Every provider probe verifies `test.length !== dims` and throws if mismatch. Mock uses same dims. `normalizeDimensions` imported from inprocess-embedder. |
| Graceful fallback | **YES** | On embed failure, falls back to mock with warning log. |
| LiteLLM in auto chain | **NO** | LiteLLM is only used when explicitly requested. Not in auto-probe chain. |

---

## Phase 5 — Dead Code Scan

### console.log Statements

**Total: 244** (excluding tests and node_modules)

| Location | Count | Assessment |
|----------|-------|-----------|
| `app/scripts/bundle-runtimes.ts` | 22 | Build script — acceptable |
| `packages/cli/src/*` | 3 | CLI output — acceptable |
| `app/src/App.tsx` | 3 | `[waggle] Pause agents`, `Navigate via tray`, `Service status` — should be logger |
| `app/src/hooks/useAutoUpdate.ts` | 1 | `[updater] Update available` — should be logger |
| `packages/core/src/mind/embedding-provider.ts` | ~10 | `[waggle] Probing...` — should use structured logger |
| Other server/core files | ~205 | `[waggle]` prefixed logs throughout server — should use Fastify logger |

### TODO/FIXME Items (12 found)

| File | Line | Content |
|------|------|---------|
| `apps/web/src/components/os/apps/CapabilitiesApp.tsx` | 208 | TODO: Marketplace tab duplicate data |
| `apps/web/src/hooks/useMemory.ts` | 54 | TODO: needs dedicated PATCH endpoint |
| `packages/sdk/src/init-skill.ts` | 16 | `description: TODO` placeholder |
| `packages/server/src/local/routes/fleet.ts` | 30 | TODO: track per-session tokens |
| `packages/server/src/local/routes/settings.ts` | 215 | MOCK: Remove when real tier/billing integrated |
| `packages/server/src/local/routes/settings.ts` | 256 | MOCK: tier changes via billing system |
| `packages/server/src/local/storage/index.ts` | 33 | TODO: implement TeamStorageProvider with S3 |
| `packages/server/src/ws/gateway.ts` | 91 | TODO: Replace with full Clerk verification |

---

## Phase 6 — KVARK Surface Audit

### KvarkNudge Component
**Does NOT exist.** No `KvarkNudge` component found anywhere in the codebase.

### KvarkSection Component
**EXISTS** at `packages/ui/src/components/settings/KvarkSection.tsx`
- Props: `serverUrl`
- Used in: `packages/ui/src/components/settings/SettingsPanel.tsx:167`
- Purpose: KVARK/Enterprise connection settings (URL + token fields)

### Ad-hoc KVARK UI (needs migration to KvarkNudge system)

| File | Lines | What it shows |
|------|-------|-------------|
| `app/src/views/CapabilitiesView.tsx` | 810-818 | Enterprise section with KVARK badge, description, and CTA to configure in Settings |
| `app/src/views/CockpitView.tsx` | 306-307, 452-464 | KVARK Enterprise health indicator card (shown only when enterprise config present) |
| `apps/web/src/components/os/apps/SettingsApp.tsx` | 61-63, 479-489 | KVARK Server URL + Token input fields (web app duplicate of KvarkSection) |
| `apps/www/src/components/Enterprise.tsx` | 9-23 | Landing page sovereign AI section with mailto CTA |

### Backend KVARK Surface

| File | Purpose |
|------|---------|
| `packages/agent/src/kvark-tools.ts` | `kvark_search`, `kvark_ask_document` — gated to Business/Enterprise (comment only) |
| `packages/agent/src/combined-retrieval.ts` | Merges workspace + personal + KVARK results with conflict detection |

### Assessment

KVARK UI is scattered across 4 files with duplicate input fields (SettingsApp.tsx duplicates KvarkSection). No centralized `KvarkNudge` component exists for upsell CTAs. The CapabilitiesView and CockpitView both have inline KVARK sections that should be extracted into a reusable component.

---

## Priority Summary

| Priority | Finding | Impact |
|----------|---------|--------|
| **P0** | No tier enforcement middleware — all paid features accessible on Solo | Revenue loss, security |
| **P0** | `BASIC` tier doesn't exist in code — tier model mismatch with pricing | Billing system won't match code |
| **P1** | 15 `@base-ui/react` missing module errors — UI components broken in strict builds | Build failure in CI |
| **P1** | `@tauri-apps/api/core` missing — desktop IPC broken | Desktop build crash |
| **P1** | Two `AppView` types conflict — navigation bug | UX regression |
| **P2** | No KvarkNudge component — KVARK CTAs are ad-hoc | Inconsistent enterprise upsell |
| **P2** | 244 console.log statements in production code | Performance, log noise |
| **P2** | Embedding provider has no tier gating or usage quotas | Cost exposure |
| **P3** | 3 stale tier names on landing page | Brand inconsistency |
| **P3** | 8 TODO/FIXME items in production code | Tech debt tracking |

---

*Report generated by audit session. No code was modified.*
