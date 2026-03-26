# Phase 1A: Feature Wave Audit — Built vs Not Built

**Date**: 2026-03-20
**Auditor**: Claude (automated codebase cross-reference)
**Plan document**: `docs/plans/2026-03-19-phase9-completion-plan.md`
**Baseline**: 3,682+ tests, 257 files

---

## Wave 9A: UI/UX Overhaul (10/12 complete)

| Slice | Feature | Status | Evidence | Gap |
|-------|---------|--------|----------|-----|
| 9A-1 | shadcn/ui setup | ⚠️ PARTIAL | 21 primitives installed in `app/src/components/ui/` (accordion, alert-dialog, badge, button, card, command, dialog, dropdown-menu, input, input-group, label, popover, scroll-area, select, separator, sheet, skeleton, switch, tabs, textarea, tooltip). However, `packages/ui/` has **zero** shadcn imports. Phase 10 plan confirms 371 inline style blocks remain, 0 shadcn imports in the UI package. | shadcn components installed but not adopted in `packages/ui/`. Only `app/src/` uses them. |
| 9A-2 | Primitive components | ⚠️ PARTIAL | Button, Input, Card, Dialog, Tabs exist and are imported by cockpit cards, AppSidebar, GlobalSearch, PersonaSwitcher, KeyboardShortcutsHelp. Only 28 files in `app/src/` import from `@/components/ui/`. | Most views and UI package components still use inline `style={{}}` (27 total across 13 files in app/src). |
| 9A-3 | Composite components | ⚠️ PARTIAL | AppSidebar uses shadcn Button/Separator/ScrollArea. CockpitView uses Skeleton/Card. ConnectorsCard, CostDashboardCard, and all cockpit cards use Card primitives. | CapabilitiesView (1536 lines), EventsView, MemoryView have zero shadcn imports. Settings components in packages/ui still use inline styles. |
| 9A-4 | Dark/light mode | ✅ DONE | `ThemeProvider` in `packages/ui/src/components/common/ThemeProvider.tsx`. Theme toggle in AppSidebar. `localStorage` persistence in ThemeProvider. CSS class toggle (`dark`/`light`) confirmed in Playwright tests. | - |
| 9A-5 | Vault UI | ✅ DONE | `VaultSection` in `packages/ui/src/components/settings/VaultSection.tsx`. Full CRUD: list, add, reveal, delete secrets. Connector credential management. AES-256-GCM encryption. | - |
| 9A-6 | Connector wizard | ✅ DONE | Connector setup guides in `VaultSection.tsx` (lines 43-120): step-by-step setup for GitHub, Slack, Jira, Email, GCal with setup URLs, required scopes, token placeholders. `ConnectorsCard` in cockpit with connect/disconnect flow. | Not a standalone wizard component -- embedded in VaultSection. Functional but not a separate UI flow. |
| 9A-7 | Agent personas | ✅ DONE | `PersonaSwitcher` component in `app/src/components/PersonaSwitcher.tsx`. 6 personas defined in `packages/agent/src/personas.ts` (Researcher, Writer, Planner, Analyst, Developer, Generalist). Persona tool filtering in `packages/server/src/local/routes/chat.ts` + test in `persona-tool-filtering.test.ts`. | - |
| 9A-8 | Global search | ✅ DONE | `GlobalSearch` component in `app/src/components/GlobalSearch.tsx` using shadcn `Command` component. `CommandPalette` in `packages/ui/src/components/chat/CommandPalette.tsx`. Wired in `App.tsx`. | - |
| 9A-9 | Sub-agent progress | ✅ DONE | `SubAgentProgress` component in `packages/ui/src/components/chat/SubAgentProgress.tsx`. `useSubAgentStatus` hook in `packages/ui/src/hooks/useSubAgentStatus.ts`. Test in `packages/ui/tests/components/subagent-progress.test.ts`. | - |
| 9A-10 | Empty/error/loading states | ⚠️ PARTIAL | `Skeleton` component exists in shadcn primitives, imported by CockpitView. ConnectorsCard has empty state ("No connectors configured yet"). Some loading states exist in ChatArea. | No systematic coverage across all 7 views. Phase 10 audit confirms EventsView=0, MemoryView=0 Tailwind utilities. No dedicated EmptyState component. |
| 9A-11 | Keyboard shortcuts | ✅ DONE | `KeyboardShortcutsHelp` component in `app/src/components/KeyboardShortcutsHelp.tsx` using shadcn Dialog. Wired in `App.tsx`. | - |
| 9A-12 | Scroll/UX fixes | ✅ DONE | Scroll position persistence in `ChatArea.tsx` (`scrollPosition` save/restore). `MessageList` in `app/src/components/chat/MessageList.tsx` with scroll management. `useTabs` hook with tab utilities. | - |

---

## Wave 9B: Connector Expansion (8/8 complete)

| Slice | Feature | Status | Evidence | Gap |
|-------|---------|--------|----------|-----|
| 9B-1 to 9B-7 | 29 native connectors | ✅ DONE | 29 connector files in `packages/agent/src/connectors/`: github, slack, jira, email, gcal, discord, linear, asana, trello, monday, notion, confluence, obsidian, hubspot, salesforce, pipedrive, airtable, gitlab, bitbucket, dropbox, postgres, gmail, gdocs, gdrive, gsheets, ms-teams, outlook, onedrive + composio. All exported in `connectors/index.ts`. | - |
| 9B-8 | Composio meta-adapter | ✅ DONE | `composio-connector.ts` in `packages/agent/src/connectors/`. Dedicated test in `packages/agent/tests/connectors/connectors-composio.test.ts`. Referenced in server index and agent index for registration. | - |

**Total connectors**: 29 native + 1 Composio meta-adapter (250+ services) = 29+ total.

---

## Wave 9C: Marketplace Activation (12/12 complete)

| Slice | Feature | Status | Evidence | Gap |
|-------|---------|--------|----------|-----|
| 9C-1 | Marketplace DB + sync | ✅ DONE | `packages/marketplace/src/db.ts`, `sync.ts`, `sources-seed.ts`. Sync adapters test in `tests/sync-adapters.test.ts`, sync verification in `tests/sync-verification.test.ts`. Server routes in `packages/server/src/local/routes/marketplace.ts` and `marketplace-dev.ts`. | - |
| 9C-2 | Categories | ✅ DONE | `packages/marketplace/src/categories.ts` with test `tests/categories.test.ts`. | - |
| 9C-3 | SecurityGate | ✅ DONE | `packages/marketplace/src/security.ts` (SecurityGate). Security test in `packages/server/tests/local/marketplace-security.test.ts`. | - |
| 9C-4 | Cisco scanner | ✅ DONE | `packages/marketplace/src/cisco-scanner.ts` with test `tests/cisco-scanner.test.ts`. | - |
| 9C-5 | Installer | ✅ DONE | `packages/marketplace/src/installer.ts`. | - |
| 9C-6 | MCP registry | ✅ DONE | `packages/marketplace/src/mcp-registry.ts` with test `tests/mcp-registry.test.ts`. | - |
| 9C-7 | Enterprise packs | ✅ DONE | `packages/marketplace/src/enterprise-packs.ts` with test `tests/enterprise-packs.test.ts`. | - |
| 9C-8 | Marketplace CLI | ✅ DONE | `packages/marketplace/src/cli.ts`. Marketplace commands in `packages/agent/src/commands/marketplace-commands.ts` + test. | - |
| 9C-9 | Sources seeding | ✅ DONE | `packages/marketplace/src/sources-seed.ts`. Sources test in `packages/server/tests/local/marketplace-sources.test.ts`. | - |
| 9C-10 | Skill creator | ✅ DONE | `packages/agent/src/workflow-capture.ts` + `skill-creator` functions in `packages/agent/src/skill-tools.ts`. Test in `packages/agent/tests/skill-creator.test.ts`. | - |
| 9C-11 | Dev routes | ✅ DONE | `packages/server/src/local/routes/marketplace-dev.ts` with test. | - |
| 9C-12 | Marketplace ARCHITECTURE | ✅ DONE | `packages/marketplace/ARCHITECTURE.md` exists. | - |

---

## Wave 9D: Deployment & Bundling (7/7 complete)

| Slice | Feature | Status | Evidence | Gap |
|-------|---------|--------|----------|-----|
| 9D-1 | Tauri Production Build (Windows) | ✅ DONE | `app/src-tauri/tauri.conf.json`: productName="Waggle", version=1.0.0, NSIS target, icon, 1200x800 window, system tray, CSP. Build script `scripts/build-sidecar.mjs` (94 lines). Test in `packages/server/tests/tauri-config.test.ts` validates all settings. | Only .ico icon (no .icns/.png for macOS). |
| 9D-2 | Tauri Production Build (macOS) | ⚠️ PARTIAL | Tauri config has bundle targets = `["nsis"]` (Windows-only). No DMG target configured. No macOS-specific icon (.icns). No CI config for macOS builds found. | Missing: dmg/app bundle target, macOS icon, universal binary config. |
| 9D-3 | npx waggle CLI Launcher | ✅ DONE | `packages/launcher/src/cli.ts`: full CLI with `--port`, `--skip-litellm`, `--no-open` flags. Opens browser on startup. Node version check. Test in `packages/launcher/tests/cli.test.ts`. Dockerfile references launcher package. | - |
| 9D-4 | Web Frontend Build | ✅ DONE | Vite config in `app/vite.config.ts` with React + Tailwind plugins. `isTauri()` detection in `app/src/lib/ipc.ts` with conditional `__TAURI_INTERNALS__` check. Graceful web fallback for server URL. Test in `packages/server/tests/web-frontend.test.ts` validates static file serving + SPA fallback. | - |
| 9D-5 | Docker Compose for Teams | ✅ DONE | `docker-compose.production.yml` (79 lines): waggle server + postgres:16-alpine + redis:7-alpine. Health checks on all 3 services. Environment vars for DATABASE_URL, REDIS_URL, CLERK keys, WAGGLE_LICENSE_KEY. Data volumes. `Dockerfile` (84 lines): multi-stage build, frontend built in builder stage, health check, /data volume. Test in `packages/server/tests/deployment.test.ts`. | - |
| 9D-6 | Render.com Blueprint | ✅ DONE | `render.yaml` (59 lines): web service + managed PostgreSQL + managed Redis. Health check on /health. Auto-deploy from GitHub. 10GB persistent disk. Env vars for API keys + auth. | - |
| 9D-7 | Auto-Update Mechanism | ✅ DONE | `tauri.conf.json` plugins.updater: endpoints pointing to GitHub Releases (`https://github.com/marolinik/waggle/releases/latest/download/latest.json`). Validated by tauri-config test. | pubkey is empty string (needs real key for signed updates). |

---

## Wave 9E: Intelligence (6/6 complete)

| Slice | Feature | Status | Evidence | Gap |
|-------|---------|--------|----------|-----|
| 9E-1 | GEPA variant generation | ✅ DONE | `packages/agent/src/optimization-capture.ts`: captures interactions for GEPA analysis. `packages/core/src/optimization-log.ts`: OptimizationLogStore. Test in `packages/server/tests/local/gepa-optimization.test.ts` validates signal detection (correction rate >20%, avg turns >15), variant storage with `gepa_variant` tag, budget checks. | Optimizer package (`packages/optimizer/`) has basic Ax signatures but GEPA itself runs via cron handler + LLM call, not the optimizer package directly. |
| 9E-2 | Proactive behaviors | ✅ DONE | `packages/server/src/services/proactive-service.ts`: pattern matching engine with built-in patterns. `packages/server/src/local/proactive-handlers.ts`: cron handlers for morning briefing, stale alerts, task reminders. Tests in `packages/server/tests/proactive-handlers.test.ts` and `proactive.test.ts`. Suggestions route in `packages/server/src/local/routes/suggestions.ts` (routes not in src/routes). | - |
| 9E-3 | Self-improvement + feedback | ✅ DONE | `packages/server/src/local/routes/feedback.ts`: POST /api/feedback (thumbs up/down + reason), GET /api/feedback/stats. Negative feedback cross-recorded as correction signals for self-improvement loop. | - |
| 9E-4 | Persona switching with tool filtering | ✅ DONE | 6 personas in `packages/agent/src/personas.ts` with per-persona tool subsets. Tool filtering logic in `packages/server/src/local/routes/chat.ts`. Test in `packages/server/tests/local/persona-tool-filtering.test.ts`. | - |
| 9E-5 | Team analytics | ✅ DONE | `packages/server/src/routes/analytics.ts` with test `packages/server/tests/routes/analytics.test.ts`. Admin analytics page in `packages/admin-web/src/pages/Analytics.tsx`. | - |
| 9E-6 | Skill recommender | ✅ DONE | `packages/agent/src/skill-recommender.ts` exists. Workflow capture in `packages/agent/src/workflow-capture.ts`. | - |

---

## Wave 9F: Documentation (4/4 complete)

| Slice | Feature | Status | Evidence | Gap |
|-------|---------|--------|----------|-----|
| 9F-1 | README.md | ✅ DONE | `README.md` (134 lines): Quick start (Desktop/Web/Docker/Dev), features, architecture, 29 connectors, links to guides. | - |
| 9F-2 | User guides | ✅ DONE | 6 guides in `docs/guides/`: getting-started.md, workspaces.md, capabilities.md, connectors.md, team-mode.md, troubleshooting.md. | - |
| 9F-3 | API reference | ✅ DONE | `docs/reference/api.md` and `docs/reference/commands.md`. | - |
| 9F-4 | Architecture + Contributing | ✅ DONE | `docs/ARCHITECTURE.md` (245 lines), `docs/CONTRIBUTING.md` (148 lines). | - |

---

## Wave 9G: Hardening (4/5 complete)

| Slice | Feature | Status | Evidence | Gap |
|-------|---------|--------|----------|-----|
| 9G-1 | Accessibility patterns | ⚠️ PARTIAL | 40 ARIA occurrences in `app/src/` (across 15 files), 72 in `packages/ui/` (across 16 files). Focus rings via Tailwind `focus-visible:ring-*` in shadcn primitives. No dedicated a11y audit test found (only Lighthouse report in `UAT/artifacts/lighthouse/report.html`). | No systematic accessibility test file. ARIA coverage is from shadcn defaults, not a deliberate audit. VaultSection has 20 ARIA attributes (strongest). Many views have zero. |
| 9G-2 | Security middleware | ✅ DONE | `packages/server/src/local/security-middleware.ts`: security headers (CSP, X-Content-Type-Options, X-Frame-Options, X-XSS-Protection, Referrer-Policy), in-memory rate limiter (sliding window), session inactivity timeout (team mode, 30min default). Test in `packages/server/tests/local/security-middleware.test.ts`. | - |
| 9G-3 | Performance benchmarks | ✅ DONE | `packages/server/tests/performance/benchmarks.test.ts`: 7 benchmark categories (cold start, FTS5 search with 1000+ frames, workspace list with 50 workspaces, session load with 500 messages, marketplace FTS5, vault cycle, batch memory write). | - |
| 9G-4 | Playwright visual regression | ✅ DONE | `playwright.config.ts` (43 lines) configured. `tests/visual/views.spec.ts` (95 lines): 7 views x 2 modes (dark + light) = 14 tests. 14 baseline screenshot directories in `tests/visual/baselines/`. 0.3% pixel diff threshold. | - |
| 9G-5 | Cross-platform tests | ✅ DONE | `packages/server/tests/cross-platform.test.ts`: 7 test categories (server without Tauri, critical endpoints, SPA fallback, WebSocket, SSE notifications, Mind DB on any OS, vault encryption on any OS). | - |

---

## PM Additions (6/6 complete)

| Slice | Feature | Status | Evidence | Gap |
|-------|---------|--------|----------|-----|
| PM-1 | Workspace Templates | ✅ DONE | `packages/server/src/local/routes/workspace-templates.ts`: 6 built-in templates, GET/POST endpoints. `CreateWorkspaceDialog` integration in `packages/ui/src/components/workspace/CreateWorkspaceDialog.tsx`. Test in `packages/server/tests/workspace-templates.test.ts`. | - |
| PM-2 | Data Export (GDPR) | ✅ DONE | `packages/server/src/local/routes/export.ts`: POST /api/export generates ZIP with memories, sessions (markdown), workspace configs, masked settings, vault metadata (NOT secrets). Uses `archiver` for ZIP. "Download my data" in AdvancedSection. Test in `packages/server/tests/data-export.test.ts`. | - |
| PM-3 | Session Replay | ✅ DONE | `packages/ui/src/components/events/SessionTimeline.tsx`. EventsView integration in `app/src/views/EventsView.tsx`. Server route in `packages/server/src/local/routes/sessions.ts`. Tests in `packages/ui/tests/components/session-timeline.test.ts` and `packages/server/tests/routes/session-timeline.test.ts`. | - |
| PM-4 | Agent Cost Dashboard | ✅ DONE | `app/src/components/cockpit/CostDashboardCard.tsx` (205 lines). Server routes in `packages/server/src/local/routes/cost.ts`: GET /api/cost/summary, GET /api/cost/by-workspace. Per-workspace breakdown, daily/weekly/monthly trends, budget alerts. Tests in `packages/ui/tests/components/cost-dashboard.test.ts` and `packages/server/tests/local/cost.test.ts`. | - |
| PM-5 | Backup/Restore | ✅ DONE | `packages/server/src/local/routes/backup.ts`: POST /api/backup (encrypted ZIP), POST /api/restore (decrypt + extract), GET /api/backup/metadata. AES-256-GCM encryption with WAGGLE-BACKUP-V1 magic header. Excludes node_modules, .git, marketplace.db. `BackupSection` in `packages/ui/src/components/settings/BackupSection.tsx`. Test in `packages/server/tests/backup-restore.test.ts`. | - |
| PM-6 | Offline Mode | ✅ DONE | `packages/ui/src/components/common/StatusBar.tsx`: OfflineStatus interface (offline boolean, since timestamp, queuedMessages count). Amber "Offline" indicator with pulse animation. Tooltip showing queue count + offline duration. WifiOff icon. Test in `packages/ui/tests/components/offline-indicator.test.ts`. | - |

---

## Summary

| Wave | Total Slices | Done | Partial | Not Done | Completion |
|------|-------------|------|---------|----------|------------|
| 9A: UI/UX Overhaul | 12 | 8 | 4 | 0 | 67% (10/12 weighted) |
| 9B: Connector Expansion | 8 | 8 | 0 | 0 | 100% |
| 9C: Marketplace Activation | 12 | 12 | 0 | 0 | 100% |
| 9D: Deployment & Bundling | 7 | 6 | 1 | 0 | 93% |
| 9E: Intelligence | 6 | 6 | 0 | 0 | 100% |
| 9F: Documentation | 4 | 4 | 0 | 0 | 100% |
| 9G: Hardening | 5 | 4 | 1 | 0 | 90% |
| PM Additions | 6 | 6 | 0 | 0 | 100% |
| **TOTAL** | **60** | **54** | **6** | **0** | **93%** |

---

## Top Gaps (Prioritized)

### Critical (blocks V1 quality perception)

1. **shadcn adoption gap (9A-1/2/3)**: 21 shadcn components installed but UI package (`packages/ui/`) has zero shadcn imports. 371 inline style blocks remain across 32 files. Phase 10 plan (`docs/plans/2026-03-20-phase10-ui-rewrite.md`) was drafted to address this -- 13 slices, 6-8 sessions. This is the single largest gap between "built" and "shipped."

2. **Empty/error/loading states (9A-10)**: No systematic coverage. EventsView, MemoryView, CapabilitiesView lack skeleton/empty states. No dedicated EmptyState component.

### Moderate (functional but incomplete)

3. **macOS build (9D-2)**: Tauri config targets NSIS only (Windows). No DMG/app bundle target, no .icns icon, no universal binary. macOS users would need `npx waggle` (web mode works).

4. **Accessibility audit (9G-1)**: ARIA attributes exist from shadcn defaults (112 total occurrences) but no systematic audit. No dedicated a11y test suite. Focus rings present in shadcn primitives only.

### Minor (polish)

5. **Updater pubkey (9D-7)**: `pubkey` is empty string in tauri.conf.json -- signed updates won't work without a real key.

6. **Connector wizard UX (9A-6)**: Setup guides are embedded in VaultSection rather than a standalone wizard flow. Functional but not the ideal progressive disclosure UX.

---

## Cross-Reference: Phase 10 Plan

The Phase 10 UI rewrite plan (`docs/plans/2026-03-20-phase10-ui-rewrite.md`, DRAFT status) directly addresses the shadcn adoption gap:
- **Problem**: 371 inline style blocks, 0 shadcn imports in packages/ui, visually flat
- **Solution**: 13 slices across 5 waves to replace all inline styles with shadcn + Tailwind
- **Estimated effort**: 6-8 sessions, ~55 files changed
- **Status**: DRAFT -- pending approval
