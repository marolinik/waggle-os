# Phase 9: V1 Ship — Completion Plan

**Date**: 2026-03-19
**Baseline**: 3,682+ tests, 257 files, 15,238+ marketplace packages, 29 connectors
**Branch**: `phase8-wave-8f-ui-ux`

---

## What's DONE (this session)

| Wave | Status | Key Deliverables |
|------|--------|------------------|
| 9A UI/UX | COMPLETE (12/12) | shadcn 21 components, token migrations, vault CRUD, keyboard shortcuts, empty states, persona selector, sub-agent panel, connector wizard |
| 9B Connectors | COMPLETE (8/8) | 24 new connectors (29 total) + Composio meta-adapter (250+ services) |
| 9C Marketplace | COMPLETE (12/12) | 61 sources, 15K+ packages, 4 new adapters, resumable sync, categories, user sources, skill creator, Cisco scanner, premium API auth |
| 9E Intelligence | COMPLETE (6/6) | GEPA variant generation, proactive behaviors, self-improvement + feedback, persona switching with tool filtering, team analytics |
| 9F Documentation | COMPLETE (4/4) | README, 6 guides, 2 reference docs, ARCHITECTURE.md, CONTRIBUTING.md |
| 9G Hardening | COMPLETE (4/5) | Accessibility audit, security headers + rate limiter, performance benchmarks, cross-platform tests |
| Partial wiring | COMPLETE (7/7) | Sub-agent SSE, workflow suggestion card, GEPA LLM calls, persona tool filtering, cockpit intelligence card, monthly assessment, session timeout |

---

## What REMAINS

### Wave 9D: Deployment & Bundling (7 slices)

**9D-1: Tauri Production Build — Windows**
- Configure `tauri.conf.json`: app name "Waggle", version 1.0.0, icon, window 1200x800, system tray
- Bundle Node.js sidecar via esbuild (single-file Fastify server)
- Include `marketplace.db` in resources/
- Build MSI installer: `npm run tauri build`
- Test: fresh Windows 11 install → MSI → runs → health check OK

**9D-2: Tauri Production Build — macOS**
- CI build for macOS (universal arm64 + x86_64)
- DMG packaging with drag-to-Applications
- Unsigned for V1 (Gatekeeper warning documented)
- Test on macOS or document known issues

**9D-3: npx waggle CLI Launcher**
- New `packages/launcher/` package → published as `waggle` on npm
- `npx waggle`: checks Node ≥18, starts Fastify server, serves React frontend, opens browser
- `npx waggle --port 4000` for custom port
- Frontend served as static files from server dist/

**9D-4: Web Frontend Build**
- Vite production build of React app
- Conditional Tauri API imports (`window.__TAURI__` check)
- Graceful fallback: no OS notifications → in-app toasts, no tray → web nav, no native file dialogs → HTML5 input

**9D-5: Docker Compose for Teams**
- Production `docker-compose.yml` (waggle server + postgres + redis)
- Dockerfile for waggle server image
- Health check wired
- Env vars: DATABASE_URL, REDIS_URL, CLERK_SECRET_KEY, WAGGLE_LICENSE_KEY

**9D-6: Render.com Blueprint**
- `render.yaml` for one-click deploy
- Managed PostgreSQL + Redis as add-ons
- Auto-deploy from GitHub on push to main
- License key validation on startup (env var `WAGGLE_LICENSE_KEY` + max user count)

**9D-7: Auto-Update Mechanism**
- Tauri updater plugin → GitHub Releases endpoint
- Check once per day on app startup
- Notification: "Waggle 1.1.0 available — Update now?"
- For npx: `npx waggle@latest` always gets newest
- For Docker: `docker pull waggle/server:latest`

---

### Wave 9G-4: Visual Regression (1 remaining slice)

**9G-4: Playwright Visual Regression**
- Install Playwright: `npx playwright install`
- Screenshot baselines for all 7 views × 2 modes (dark + light) = 14 baselines
- Pixel diff threshold: 0.1%
- Include: empty states, loaded states, error states
- CI integration: run on every PR
- Script: `npx vitest run --project=visual`

---

### PM Additions (6 features)

**PM-1: Workspace Templates**
- Pre-configured workspace setups with persona + connectors + starter memory
- Templates: "Sales Pipeline", "Research Project", "Code Review", "Marketing Campaign", "Product Launch", "Legal Review"
- Template = { persona, connectors[], suggestedCommands[], starterMemory[] }
- CreateWorkspaceDialog: "Start blank" or "Use template" toggle
- Templates seeded on first run, user can create custom templates
- API: GET /api/workspace-templates, POST /api/workspace-templates

**PM-2: Data Export (GDPR)**
- One-click "Download my data" button in Settings → Advanced tab
- Exports: memory frames, sessions, workspace configs, settings, telemetry, vault metadata (NOT secrets)
- Format: ZIP containing JSON files + markdown session transcripts
- API: POST /api/export → returns ZIP download stream
- Privacy: vault secret VALUES are excluded, only names/types included

**PM-3: Session Replay**
- Events view enhancement: clickable session timeline
- Each event shows: timestamp, tool name, duration, status (success/fail)
- Click a tool event → expand to see full input/output JSON
- Collapsible tree view for nested sub-agent calls
- Uses existing session .jsonl files — no new data storage needed
- Component: `SessionTimeline` in @waggle/ui

**PM-4: Agent Cost Dashboard**
- Cockpit card: real-time token usage + estimated cost
- Per-workspace breakdown table
- Daily/weekly/monthly trend chart (simple CSS bars like Analytics)
- Budget alert: configurable daily limit, notification when 80% reached
- Data source: agent loop already tracks input/output tokens per turn
- API: GET /api/cost/summary, GET /api/cost/by-workspace

**PM-5: Backup/Restore**
- Settings → Advanced: "Backup" and "Restore" buttons
- Backup: ~/.waggle/ → encrypted ZIP (AES-256 using vault master key)
- Excludes: node_modules, .git, temp files, marketplace.db (re-syncs)
- Restore: ZIP → decrypt → extract to ~/.waggle/ (with conflict resolution)
- API: POST /api/backup → ZIP download, POST /api/restore (multipart upload)
- Use case: migrating between machines

**PM-6: Offline Mode**
- Health check detects LLM API unreachable → sets global `offline: true` state
- UI: amber "Offline" indicator in StatusBar
- Local tools still work: read_file, search_files, search_memory, git tools
- LLM-dependent tools show: "Offline — this tool needs an LLM connection"
- Message queue: user messages queued locally, sent when connection restores
- Periodic retry (every 30s) to detect reconnection
- SSE notification when back online

---

## Execution Order

```
Phase 9D (Deployment)     ← requires manual build tooling + testing
  9D-4 Web Frontend Build   ← FIRST (enables 9D-3 and 9D-5)
  9D-3 npx Launcher         ← depends on 9D-4
  9D-1 Tauri Windows         ← depends on 9D-4
  9D-2 Tauri macOS           ← depends on 9D-1 (same config)
  9D-5 Docker Compose        ← independent
  9D-6 Render Blueprint      ← depends on 9D-5
  9D-7 Auto-Update           ← depends on 9D-1/9D-2

9G-4 Playwright             ← needs 9D-4 (running dev server)

PM Features (parallel):
  PM-1 Workspace Templates   ← quick, extends CreateWorkspaceDialog
  PM-2 Data Export            ← independent
  PM-3 Session Replay         ← extends Events view
  PM-4 Cost Dashboard         ← extends Cockpit
  PM-5 Backup/Restore         ← independent
  PM-6 Offline Mode           ← independent
```

---

## Estimated Effort

| Item | Slices | Est. Tests | Complexity |
|------|--------|------------|------------|
| 9D Deployment | 7 | ~20 | HIGH (build tooling, CI, cross-platform) |
| 9G-4 Playwright | 1 | 14 baselines | MEDIUM (browser automation) |
| PM-1 Templates | 1 | ~8 | LOW |
| PM-2 Data Export | 1 | ~6 | LOW |
| PM-3 Session Replay | 1 | ~10 | MEDIUM |
| PM-4 Cost Dashboard | 1 | ~8 | LOW |
| PM-5 Backup/Restore | 1 | ~10 | MEDIUM (encryption) |
| PM-6 Offline Mode | 1 | ~12 | MEDIUM (queue, retry) |
| **Total** | **14** | **~88** | |

**Test target after Phase 9**: 3,682 + 88 = ~3,770 tests

---

## Pre-Flight: Docker Desktop Test Environment

Before running the full test suite or testing deployment modes, ensure Docker Desktop is running with all services healthy.

### Required Containers (waggle-poc docker-compose.dev.yml)

| Container | Image | Port | Purpose |
|-----------|-------|------|---------|
| postgres-1 | postgres:16 | 5434:5432 | Team mode database (Drizzle ORM) |
| redis-1 | redis:7-alpine | 6381:6379 | BullMQ job queue, session state, pub/sub |
| litellm-1 | berriai/litellm | 4000:4000 | LLM proxy (routes to Anthropic/OpenAI/etc.) |

### Setup Commands

```bash
# Start all services (from waggle-poc root)
docker compose -f docker-compose.dev.yml up -d

# Verify all 3 are running
docker compose -f docker-compose.dev.yml ps

# Verify ports are reachable
# PowerShell:
Test-NetConnection -ComputerName localhost -Port 5434 -InformationLevel Quiet  # PostgreSQL
Test-NetConnection -ComputerName localhost -Port 6381 -InformationLevel Quiet  # Redis
Test-NetConnection -ComputerName localhost -Port 4000 -InformationLevel Quiet  # LiteLLM
```

### Environment Variables (.env at repo root)

```env
DATABASE_URL=postgres://waggle:waggle_dev@localhost:5434/waggle
REDIS_URL=redis://localhost:6381
LITELLM_URL=http://localhost:4000
```

### Database Migration

```bash
# Run Drizzle migrations (team-mode schema)
cd packages/server && npx drizzle-kit push
```

### Full Test Suite

```bash
# All tests (requires Docker services)
npx vitest run
# Expected: 3,682+ tests, 257+ files, ALL PASSING

# Non-Docker tests only (if Docker is down)
npx vitest run --exclude='**/m3-full-stack*' --exclude='**/audit.test*' \
  --exclude='**/auth.test*' --exclude='**/server.test.ts' \
  --exclude='**/cron.test.ts' --exclude='**/proactive.test.ts' \
  --exclude='**/analytics.test.ts' --exclude='**/hive-mind*' \
  --exclude='**/scout*' --exclude='**/job-processor*' \
  --exclude='**/subconscious*' --exclude='**/db/schema*' \
  --exclude='**/routes/agents*' --exclude='**/routes/knowledge*' \
  --exclude='**/routes/messages*' --exclude='**/daemons/*'
# Expected: 3,558+ tests, 0 failures
```

### Common Docker Issues

| Problem | Fix |
|---------|-----|
| Ports not reachable (containers show "running" but TCP fails) | Restart Docker Desktop from system tray → Restart |
| `dockerDesktopLinuxEngine` pipe not found | Docker Desktop VM not started — open Docker Desktop app, wait 30s |
| `taskkill //F //IM node.exe` kills port forwarding | Restart Docker Desktop after killing node processes |
| PostgreSQL connection refused after Docker restart | Wait 10s for postgres to finish startup, then retry |
| Redis `ECONNREFUSED` in test output | Ignored — these are stderr from tests that catch Redis errors gracefully |

### Testing Deployment Modes Locally

**Solo (desktop/web)**:
```bash
# Start the local server
cd packages/server && npx tsx src/local/start.ts
# → http://127.0.0.1:3333

# Start Tauri dev (desktop app)
cd app && npm run tauri dev
```

**Teams (Docker)**:
```bash
# Use the team docker-compose
docker compose -f docker-compose.dev.yml up -d
# Server auto-connects to PostgreSQL + Redis
# Admin dashboard: http://127.0.0.1:3333/admin
```

**npx (web mode — after 9D-3)**:
```bash
npx waggle
# → Opens http://localhost:3333 in browser
```

---

## Ship Gate Checklist

### Functional
- [ ] 3 deployment modes work (Tauri Win/Mac, npx, Docker)
- [ ] 29 native connectors + Composio (250+) all registered
- [ ] Marketplace: 15K+ packages, daily sync, search + filter + install
- [ ] GEPA optimization generates real prompt variants
- [ ] Proactive agent behavior (morning briefing, stale alerts, task reminders)
- [ ] All 7 views polished (dark + light mode, empty/error/loading states)
- [ ] Persona switching filters tools correctly
- [ ] Workspace templates available for common use cases
- [ ] Data export works for GDPR compliance
- [ ] Backup/restore enables machine migration

### Quality
- [ ] 3,770+ tests, ALL passing
- [ ] Zero critical security findings
- [ ] Accessibility: ARIA labels, focus rings, keyboard nav
- [ ] Performance: cold start < 3s, FTS5 < 100ms, no op > 500ms
- [ ] Playwright visual baselines for all views
- [ ] Session timeout enforced in team mode

### Product
- [ ] Getting Started guide: first conversation in < 5 minutes
- [ ] Non-technical admin: deploy Teams on Render in < 30 minutes
- [ ] Connector setup: < 2 minutes per service
- [ ] Agent self-improves (GEPA + correction learning + feedback loop)
- [ ] Skill Creator captures workflows proactively
- [ ] Cost dashboard shows real token usage with budget alerts

### Emotional Standard
- [ ] User never feels lost (Cmd+K, personas, guided setup, templates)
- [ ] User never manages the system to get value (proactive behavior, auto-routing)
- [ ] User sees what the system is doing (sub-agent panel, session replay, tool transparency)
- [ ] User trusts the system (SecurityGate, approval gates, vault, feedback loop)
- [ ] User can work offline (local tools, message queue, reconnection)
