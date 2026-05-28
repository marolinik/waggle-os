# Onboarding Guide: Waggle OS
> Scannable quick-start. The authoritative deep contract is `CLAUDE.md` at repo root — read that before writing code. This guide is the 2-minute orientation layer on top.

## Overview
Waggle OS is a workspace-native AI agent platform with persistent memory. It ships as a Tauri 2 desktop binary (Win/macOS) wrapping a Vite/React 19 web UI and a Node.js Fastify sidecar. Strategically it's the demand-gen funnel for KVARK (Egzakta's sovereign enterprise AI).

## Tech Stack (verified 2026-05-28)
| Layer | Technology |
|-------|-----------|
| Language | TypeScript 5.8, Node ≥20 |
| Frontend | React 19.1 + Vite + Tailwind 4 + @base-ui/react |
| Desktop | Tauri 2.10 (Rust shell, `app/src-tauri/`) |
| Backend | Fastify sidecar (Node), runs via `tsx` |
| LLM routing | LiteLLM (`litellm-config.yaml`) |
| DB / Memory | SQLite (better-sqlite3) + sqlite-vec; mind substrate in `packages/core/src/mind/` |
| Billing | Stripe 21 |
| Tests | Vitest (unit) + Playwright (E2E/visual) |
| Pkg manager | npm workspaces (`apps/*`, `packages/*`) |

## Architecture
Monorepo, full-stack. Frontend (`apps/web`) talks to a local sidecar (`packages/server`) over HTTP/WS at `127.0.0.1:3333`. The sidecar owns the SQLite "mind" per workspace. Tauri wraps both for desktop; the same web UI also runs standalone in a browser against the sidecar.

```
Browser / Tauri WebView
   └─ apps/web (React)  ── lib/adapter.ts (RPC) ──▶ Fastify sidecar :3333
                                                      packages/server/src/local/
                                                        index.ts  (registers routes + decorators)
                                                        routes/*.ts
                                                          └─▶ @waggle/core mind substrate
                                                                FrameStore / SessionStore /
                                                                KnowledgeGraph / HybridSearch
                                                        chat.ts ──▶ @waggle/agent agent-loop ──▶ LiteLLM
```

## Key Entry Points
- **Sidecar bootstrap**: `packages/server/src/local/start.ts` → `index.ts` (route registration ~line 1916+, server decorators: `multiMind`, `workspaceManager`, `agentState`, `vault`, `scheduler`)
- **Frontend root**: `apps/web/src/pages/Index.tsx` → `components/os/Desktop.tsx` (the desktop-OS shell + Dock)
- **RPC layer**: `apps/web/src/lib/adapter.ts` (every backend call goes through here)
- **Agent loop**: `packages/agent/src/agent-loop.ts`
- **Memory substrate**: `packages/core/src/mind/` (db, frames, search, knowledge, sessions)
- **Config**: `litellm-config.yaml` (LLM routing), `packages/shared/src/tiers.ts` (5-tier system)

## Directory Map
```
apps/web/        MAIN UI — desktop-OS metaphor (Dock, AppWindow, 25 apps, overlays)
apps/www/        Marketing landing page (waggle-os.ai)
apps/browser-ext/ Chrome MV3 companion extension (FR-1, 2026-05-28)
app/             Tauri desktop shell (Rust + minimal React cockpit)
packages/        27 workspaces (see below)
sidecar/         Node bundle target for Tauri packaging
docs/            Architecture, plans, audits, this guide
external/        meta-agents-research-environments (GAIA2 benchmark harness)
benchmarks/      Harness + benchmark runners
```
**packages/ (27):** 15 core — agent (94+ files, agent-loop/personas/evolution), core (mind+harvest), server (Fastify sidecar), shared (types/tiers/mcp-catalog), sdk, cli, worker, marketplace, optimizer, weaver, waggle-dance, wiki-compiler, launcher, admin-web, memory-mcp — plus **12 `hive-mind-*` OSS-split packages** (core, cli, shim-core, mcp-server, wiki-compiler + 7 hooks: claude-code, claude-desktop, codex, codex-desktop, cursor, hermes, openclaw). (No `packages/ui` — it has no package.json.)

## Request Lifecycle (a chat message)
1. User types in `ChatApp.tsx` → `adapter.sendMessage()` POSTs to `/api/chat`
2. `routes/chat.ts` resolves workspace mind DB via `server.agentState.getWorkspaceMindDb()`
3. Recall: `HybridSearch` (FTS5 + vec0 fused via RRF) pulls relevant frames
4. `agent-loop.ts` builds the system prompt (`orchestrator.ts buildSystemPrompt`), runs the LLM via LiteLLM, executes tools (tool-filter gates per persona)
5. Response streams back over SSE/WS; new memory written via `FrameStore.createIFrame()`; `TraceRecorder` logs the turn

## Conventions
- **Files**: kebab-case (`sample-workspaces.ts`); React components PascalCase (`LoginBriefing.tsx`)
- **Routes**: `export async function xxxRoutes(server: FastifyInstance)`, then `await server.register(xxxRoutes)` in `index.ts`. Reuse existing endpoints before adding new ones (see `docs/addictiveness-audit-2026-05-28/REDUNDANCY-AUDIT.md` for why).
- **Secrets**: `server.vault.get(key)` / `.set()` — never hardcode (CLAUDE.md §7)
- **SQL**: parameterized only (better-sqlite3 `?` params)
- **Errors**: `try/catch` → `reply.status(n).send({ error })`
- **Tests**: unit = `*.test.ts` (Vitest, co-located/per-package); E2E+visual = `*.spec.ts` under `tests/` (Playwright)
- **Commits**: Conventional (`feat(scope): …`, `fix:`, `refactor:`, `docs:`, `revert:`). No AI attribution (disabled globally).

## Common Tasks
- **Dev UI**: `npm run dev` (Vite, apps/web)
- **Run sidecar standalone**: `npx tsx packages/server/src/local/start.ts --skip-litellm` (serves built `dist/` at :3333)
- **Build web**: `npm run build` (→ `dist/`)
- **Build packages**: `npm run build:packages` (order: shared → core → agent → server)
- **Unit tests**: `npm test` (Vitest)
- **E2E**: `npm run test:e2e` · **Visual**: `npm run test:visual`
- **Lint**: `npm run lint`

## Verification before claiming done
> ⚠️ `npm run build` typechecks **only `apps/web`**. The sidecar runs via `tsx` (transpile-only). Server-side type errors slip through unless you run the server tsconfig explicitly. CLAUDE.md §2's verification block omits this — add it:
```bash
npx tsc --noEmit --project packages/server/tsconfig.json   # ← the missing one
npx tsc --noEmit --project packages/agent/tsconfig.json
npx tsc --noEmit --project app/tsconfig.json
npm run test -- --run
npm run lint
```

## Where to Look
| I want to... | Look at... |
|--------------|-----------|
| Add a backend endpoint | `packages/server/src/local/routes/` + register in `index.ts` |
| Add/edit a desktop app | `apps/web/src/components/os/apps/` |
| Add an overlay/dialog | `apps/web/src/components/os/overlays/` |
| Change memory behavior | `packages/core/src/mind/` |
| Change agent reasoning | `packages/agent/src/` (agent-loop, orchestrator, personas) |
| Add a persona | `packages/agent/src/persona-data.ts` |
| Add a workspace template | `packages/server/src/local/routes/workspace-templates.ts` (`BUILT_IN_TEMPLATES`) |
| Change LLM routing | `litellm-config.yaml` |
| Change tiers/pricing | `packages/shared/src/tiers.ts` |
| Browse MCP/skills catalog | `packages/shared/src/mcp-catalog.ts` + `MarketplaceApp.tsx` |

## Flags for maintainers (found during onboarding recon)
1. **CLAUDE.md §2 says "16 workspace packages" — actual count is 27.** The 11 `hive-mind-*` packages (OSS split, synced to `marolinik/hive-mind` per §7.5) were added since the April verification. Worth a CLAUDE.md refresh.
2. **Verification block in CLAUDE.md omits `packages/server` tsc** (see above) — server routes can ship type errors undetected.
