# Waggle OS — Technical Team Handoff
**Date:** 2026-05-26 · **From:** Marko Marković (Founder/PM, Egzakta Group) · **HEAD:** `9902906` · **Branch:** `main`

> **Purpose.** Onboard a senior engineer (or team) to Waggle OS in one focused session. After reading this you can find anything in 30 minutes, understand the moat, know the operating contract, and pick up real work the same day.

> **Status.** Engineering critical path is closed. Launch is overwhelmingly gated on Marko's external actions (M5/M8/M9/M10). AI-OS arc fully shipped end-to-end. Two co-equal benchmark pillars hit publishable numbers.

> **How to use this doc.** Sections 1-2 are required reading. Section 3 is required if you'll touch code (the operating contract is load-bearing). Sections 4-5 are pick-list / priority. Sections 6-11 are reference.

---

## Table of contents

1. Mission & strategic frame
2. **ARCHITECTURE** — stack, topology, subsystems, data flows, security
3. **DEVELOPMENT** — build/deploy, testing, OSS sync, operating contract, code patterns, eval stack
4. **BACKLOG** — P0 blockers → in-session engineering → verification → Marko-gated → multi-week → deferred
5. **UX IMPROVEMENTS** — detailed by surface
6. Risks, known issues, tech debt
7. Strategic decisions pending (Marko)
8. Onboarding checklist (Day 1 / Week 1 / Week 2)
9. Canonical file index
10. Rollback safety
11. Glossary

---

## 1. Mission & strategic frame

**Waggle OS** is a workspace-native AI agent platform with persistent memory. Tauri 2.0 desktop binary (Windows + macOS), Vite-bundled web app, Node.js Fastify sidecar.

**Strategic role:** Waggle is the **demand-generation + qualification engine** for **KVARK** — Egzakta Group's sovereign enterprise AI platform (~EUR 1.2M contracted ARR). Free Waggle users with the right harvest signature become qualified KVARK enterprise leads.

### Tiers (canonical in `packages/shared/src/tiers.ts`)

| Tier | Price | Purpose |
|---|---|---|
| TRIAL | $0 / 15 days | All features unlocked; falls back to FREE |
| FREE | $0 forever | 5 workspaces, agents, built-in skills only |
| PRO | $19/mo | Unlimited, marketplace, all connectors |
| TEAMS | $49/mo per seat | Shared workspaces, WaggleDance, governance |
| ENTERPRISE | Consultative | KVARK sovereign on-prem (www.kvark.ai) |

### Moat strategy (memorize this)

1. **Memory + Harvest = free forever.** Lock-in moat. Users won't leave their memory.
2. **Agents = free.** They *generate* memory.
3. **Skills + connectors = upgrade trigger.** Marketplace + 30+ connectors gate at PRO.
4. **Shared workspaces + WaggleDance + governance = TEAMS.**
5. **Sovereign on-prem = KVARK.** Same product, customer infra, governance + audit trail.

### Substrate claims (publicly published, verified, peer-reviewable)

- **C-1 LoCoMo memory benchmark:** **67.8% strict / 70.0% majority trio-strict**, vs Mem0 paper baseline. Published at `marolinik/hive-mind` v0.3.0 → `benchmarks/locomo/RESULTS.md`.
- **C-2 substrate claim:** Stage 3 v6 N=400, **Fisher one-sided p = 8.07 × 10⁻¹⁸**, +19.25pp retrieval-vs-no-context. See `waggle-os-gaia2-wt/benchmarks/results/stage3-n400-v6-final-analysis.md`.
- **C-3 GAIA 2 harness benchmark (ARE-native):** **N=160 = 83.8% strict / 86.5% judged-only** — on par with Hermes 89.2% trio-strict at N=40. See `waggle-os-gaia2-wt/benchmarks/gaia2/PHASE-4-P4.5-RESULTS-N160-2026-05-22.md`.
- **Pillar 2 LongMemEval (current):** Blend-tuned **75.2% trio-strict N=100**, above LoCoMo 67.8%. N=500 scale-up pending.

**Translation:** Waggle's memory substrate beats the published memory SOTA, and its agent harness sits on the SOTA frontier. Both numbers are defensible under matched protocols.

---

## 2. ARCHITECTURE

### 2.1 Tech stack (verified 2026-05-26)

| Layer | Stack | Notes |
|---|---|---|
| Desktop shell | Tauri 2.0 (Rust) | `app/src-tauri/`, capabilities allowlist explicit |
| Web app (UI) | React 19 + TypeScript + Vite + Tailwind 4 + base-ui/react | Lives in `apps/web/`, NOT `app/` |
| Landing page | Same React stack | `apps/www/` (waggle-os.ai) |
| Backend | Fastify sidecar (Node ≥20) | Bundled into Tauri; also runs standalone for dev |
| LLM routing | LiteLLM | Config at `litellm-config.yaml`. 3-layer routing: built-in proxy → LiteLLM → echo |
| Database | SQLite via `better-sqlite3` + `sqlite-vec-windows-x64` | Per-workspace `*.mind` files |
| Memory | FrameStore + HybridSearch (FTS5 + vec0 fused via RRF) + KnowledgeGraph + IdentityLayer + AwarenessLayer | All in `packages/hive-mind-core` |
| Agent runtime | `packages/agent/src/agent-loop.ts` | Persona-aware tool filtering, cost tracking, injection scanning |
| Billing | Stripe `^21.0.1` | Webhook tier enforcement live, 4-var price contract |
| Auth | Clerk (apps/www) + local-only (Waggle desktop) | Desktop has no remote login |
| Design system | Hive DS — honey `#e5a000`, hive-950 `#08090c`, accent `#a78bfa` | Tokens in `apps/web/src/waggle-theme.css` |
| Tests | Vitest (unit) + Playwright (E2E + visual) | 6610/6611 pass with Docker stack up |
| Deploy | Dockerfile + docker-compose.production.yml + render.yaml | For sidecar; binary ships standalone |

**Package manager:** npm (root) with `bun.lock` also present. Workspaces in root `package.json`.

### 2.2 Repository topology

**Top level:**
```
waggle-os/
├── app/                 # Tauri desktop shell (minimal React surface, cockpit only)
├── apps/
│   ├── web/             # MAIN web app UI — desktop OS feel, all 21 OS apps
│   └── www/             # Landing page (waggle-os.ai)
├── packages/            # 27 workspace packages (see 2.4)
├── sidecar/             # Node.js sidecar bundled into Tauri
├── scripts/             # build-sidecar, bundle-native-deps, bundle-node
├── tests/               # Cross-cutting integration tests
├── docs/                # ARCHITECTURE.md, WAGGLE-CORNERSTONE.md, plans/, handoffs/
├── docker-compose.yml + .production.yml + Dockerfile + render.yaml
├── litellm-config.yaml
└── package.json (workspaces: apps/*, packages/*)
```

**Where the UI lives:**
- `app/src/` — **minimal**, Tauri shell cockpit components only
- `apps/web/src/components/os/` — **the real UI**. Desktop OS metaphor: dock, windows, apps, overlays
- `apps/web/src/components/os/apps/` — 21 OS apps (MemoryApp, ChatApp, DashboardApp, WaggleDanceApp, LauncherApp, etc.)
- `apps/web/src/components/os/overlays/` — OnboardingWizard, PersonaSwitcher, Spawn Agent dialog
- `apps/web/src/components/ui/` — shared primitives

### 2.3 System diagram (text)

```
                ┌────────────────────────────────────────────────┐
                │             USER (desktop binary)              │
                └───────┬────────────────────────────┬───────────┘
                        │ React 19 events            │ OS dock launches
                        ▼                            ▼
        ┌───────────────────────┐         ┌────────────────────────────┐
        │  apps/web (Vite SPA)  │         │  External AI tools:         │
        │  21 OS apps, dock,    │         │  Claude Code · Cursor       │
        │  overlays, wiki UI    │         │  Claude Desktop · Codex …   │
        └──────┬────────────────┘         └──────────┬─────────────────┘
               │ fetch / SSE                          │ SessionStart / Stop / etc.
               ▼                                      ▼
        ┌───────────────────────────────────────────────────────────┐
        │           FASTIFY SIDECAR (packages/server)               │
        │  /api/chat · /api/tools/* · /api/waggle-dance/* ·         │
        │  /api/memory/* · /api/stripe/webhook · /api/agents/* …    │
        └──┬────────────────┬─────────────────┬──────────────┬──────┘
           │                │                 │              │
           ▼                ▼                 ▼              ▼
    ┌──────────────┐ ┌─────────────┐  ┌──────────────┐ ┌──────────┐
    │ AGENT LOOP   │ │ HARVEST     │  │ HIVE-MIND-   │ │ STRIPE   │
    │ (packages/   │ │ pipeline    │  │ CORE         │ │ Vault    │
    │ agent)       │ │ + adapters  │  │ (mind/)      │ │ Tiers    │
    └──┬───────────┘ └──┬──────────┘  └──┬───────────┘ └──────────┘
       │                │                 │
       │ LiteLLM        │ frames          │ Persistent SQLite
       ▼                ▼                 ▼
    ┌──────────────────────────────────────────────────────────────┐
    │           Per-workspace *.mind files (SQLite)                │
    │  frames · entities · concepts · sessions · vec0 embeddings   │
    └──────────────────────────────────────────────────────────────┘
```

Plus the **AI-OS arc** (cross-tool bus):
```
External tool Stop hook → shim-core emitter → POST /api/waggle-dance/signal
  → SignalBus (500-entry ring buffer) → WaggleDanceDispatcher
  → bridge re-emits via existing /api/waggle/signals SSE stream
  → WaggleDanceApp UI surfaces cross-tool activity in real time
```

### 2.4 Subsystem map — what each package does

**27 packages, grouped by concern:**

#### Memory + harvest (the moat)
| Package | Role |
|---|---|
| `hive-mind-core` | Extracted `mind/` + `harvest/` substrate. Shared with OSS at `marolinik/hive-mind` v0.3.0. **Touch with care — parity gate enforced.** |
| `hive-mind-shim-core` | Foundation layer used by every tool hook. Exposes `cli-bridge`, `frame-encoder`, `importance-classifier`, `prompt-summarizer`, `workspace-resolver`, `signal-emitter` (Phase 1D) |
| `hive-mind-cli` | Programmatic + interactive CLI. Hooks shell out to this |
| `hive-mind-mcp-server` | Canonical MCP server. Any MCP-aware tool can read/write hive-mind via stdio |
| `hive-mind-wiki-compiler` | Compiles harvested frames → entity / concept / synthesis wiki pages |
| `memory-mcp` | Standalone MCP server (predecessor; check overlap with hive-mind-mcp-server before extending) |

#### Hook packages (7 × tools — reversible byte-identical install)
| Package | Tool | Status |
|---|---|---|
| `hive-mind-hooks-claude-code` | Claude Code | **Wave 1 shipped** — full SessionStart + UserPromptSubmit + Stop + PreCompact + Phase 1E signal emit |
| `hive-mind-hooks-claude-desktop` | Claude Desktop | **Stub (`export {}`)** — Wave 2 deferred |
| `hive-mind-hooks-cursor` | Cursor | **Stub** — Wave 2 deferred |
| `hive-mind-hooks-codex` | Codex CLI | **Stub** — Wave 2 deferred |
| `hive-mind-hooks-codex-desktop` | Codex Desktop | **Stub** — Wave 2 deferred |
| `hive-mind-hooks-hermes` | Hermes | **Stub** — Wave 3 deferred |
| `hive-mind-hooks-openclaw` | OpenClaw | **Stub** — Wave 3 deferred |

**Important asymmetry:** all 7 tools *launch* and *install hooks* via LauncherApp; only `claude-code` *captures*. This is deliberate — wait for Wave 1 usage feedback before committing to 6 more multi-day implementations.

#### Agent runtime
| Package | Role |
|---|---|
| `agent` | **94+ .ts files**. Agent loop, orchestrator, personas, tools, evolution, capability/trust, cost tracking. Most active package. See 2.5.3 |
| `waggle-dance` | Cross-tool / multi-agent coordination protocol. 10 subtypes, dispatcher routes broadcasts. Phase 1A wired all 6 v2 subtypes |
| `worker` | BullMQ workers + dispatch handlers (waggle-handler, etc.) |

#### Plumbing
| Package | Role |
|---|---|
| `server` | Fastify sidecar. Routes, services, decorators (signalBus, traceStore, evolutionStore, activeBehavioralSpec) |
| `core` | Legacy bridge package. **Has `mind/` + `harvest/` here too** — being phased out as content moves to `hive-mind-core`. Check both before editing |
| `shared` | Types, constants, Zod schemas, `tiers.ts`, `mcp-catalog.ts`, `tool-detection.ts` |
| `sdk` | TypeScript SDK for Waggle API |
| `ui` | Shared UI primitives package |

#### Surfaces
| Package | Role |
|---|---|
| `admin-web` | Admin dashboard (separate from main `apps/web`) |
| `cli` | `npx waggle` user-facing CLI launcher |
| `launcher` | Currently: thin CLI launcher only (the AI-OS LauncherApp lives in `apps/web/src/components/os/apps/LauncherApp.tsx`) |
| `marketplace` | Skill marketplace package |
| `optimizer` | Optimization / GEPA tooling |
| `weaver` | Workflow weaving (check source for current role) |
| `wiki-compiler` | Older wiki compiler (overlap with `hive-mind-wiki-compiler` — check) |

### 2.5 Critical subsystems — deep dive

#### 2.5.1 Memory substrate (`hive-mind-core/src/mind/`)

The single most load-bearing subsystem. **It IS the moat.** Read `docs/memory-architecture.md` before changing anything here.

**Layers:**
- **FrameStore** (`frames.ts`) — I/P/B frame model (Immediate / Persistent / Background) with compaction + dedup
- **SessionStore** (`sessions.ts`) — session lifecycle; `ensureActive()` is the entrypoint
- **HybridSearch** (`search.ts`) — FTS5 keyword search + sqlite-vec vector search **fused via Reciprocal Rank Fusion**
- **KnowledgeGraph** (`knowledge.ts`) — entities + relations with **bitemporal validity**
- **IdentityLayer** (`identity.ts`) — persistent user identity, populated from harvest
- **AwarenessLayer** (`awareness.ts`) — active task / state tracking
- **ConceptTracker** + **EntityNormalizer** — dedup the KG
- **Embedding providers** — `embedding-provider.ts` + `*-embedder.ts` (API / inprocess / litellm / ollama)
- **Scoring profiles** (`scoring.ts`) — `balanced` / `recent` / `important` / `connected`

**Schema:** `schema.ts` exports `SCHEMA_SQL` + `VEC_TABLE_SQL`. Migrations live in `packages/core/src/migration.ts`.

**Database files:** Per-workspace `.mind` files under `~/.waggle/workspaces/<ws-id>/`. Personal mind at `~/.waggle/personal.mind`. The `personal::<userId>` synthetic team unlocks WaggleDance v2 for free-tier users.

**Don't touch without reading:** `docs/memory-architecture.md`, `.github/sync.md` (OSS parity gate).

#### 2.5.2 Harvest pipeline (`hive-mind-core/src/harvest/`)

**Adapters** in `harvest/`:
- `chatgpt-adapter.ts`, `claude-adapter.ts`, `claude-code-adapter.ts`, `gemini-adapter.ts`, `perplexity-adapter.ts`
- `pdf-adapter.ts`, `plaintext-adapter.ts`, `markdown-adapter.ts`, `url-adapter.ts`, `universal-adapter.ts`

**Pipeline** (`pipeline.ts`): adapter → frame normalization → dedup → write to `*.mind`.

**Dedup** (`dedup.ts`): content-hash gate prevents the "rogue `personal` workspace" class of bug (saw one frame leak in May 2026 — fixed).

**Identity auto-populate:** Harvest can populate `IdentityLayer` from extracted user facts. Wired but needs corpus to test against (M2 + M3 in hand).

#### 2.5.3 Agent runtime (`packages/agent/src/`)

**The agent loop** (`agent-loop.ts`):
- Builds system prompt via `orchestrator.ts` (`buildSystemPrompt`, `recallMemory`) — cached per section
- Filters tools via `tool-filter.ts` (`filterToolsForContext` — allowlist/denylist per persona)
- Scans for injection via `injection-scanner.ts` (`scanForInjection` — 3 pattern sets)
- Tracks cost via `cost-tracker.ts` (`CostTracker` + model pricing table)
- Records execution traces (Phase 5 of self-evolution)
- Optional `onSkillDistillationFire` callback (Phase 3 of AI-OS — broadcasts `skill_share`)

**Personas** (17 total):
- Data in `persona-data.ts` (pure declarative array)
- Logic in `personas.ts` (`AgentPersona` interface)
- Custom personas from disk via `custom-personas.ts`
- 13 work-personas (researcher / writer / coder / sales / etc.) + 4 meta-personas (general-purpose / planner / verifier / coordinator)

**Capability + trust:**
- `capability-acquisition.ts`, `capability-router.ts`, `trust-model.ts`, `permissions.ts`, `credential-pool.ts`, `confirmation.ts`
- Tier-aware (KVARK tools at TEAMS+)

**Quality + self-correction:**
- `quality-controller.ts`, `contradiction-detector.ts`, `correction-detector.ts`, `improvement-detector.ts`, `improvement-wiring.ts`
- `loop-guard.ts` (infinite loop prevention), `iteration-budget.ts`

**Sub-systems:** `commands/`, `connectors/` (31 — 30 + OneNote), `mcp/`, `providers/`.

#### 2.5.4 Evolution closed loop

**The full pipeline** (10+ files in `agent/src/`):
1. **TraceRecorder** records every chat turn → ExecutionTraceStore
2. **eval-dataset.ts** builds eval datasets from traces
3. **judge.ts** scores candidates (LLM-as-judge)
4. **iterative-optimizer.ts** runs GEPA-style optimization
5. **evolve-schema.ts** + **compose-evolution.ts** run schema evolution with feedback separation
6. **evolution-gates.ts** enforces constraint gates
7. **EvolutionRunStore** persists candidates + status
8. **evolution-orchestrator.ts** loops the whole thing
9. **evolution-deploy.ts** writes accepted candidates as persona/behavioral-spec overrides
10. **evolution-llm-wiring.ts** runs `/api/evolution/run` with real judging

**State of evolution:** End-to-end closed loop verified. Gemma 4 + Waggle-evolved prompt **outranked raw Opus 4.6** in 4-judge blind eval (C/A ratio 108.8%) — see `project_session_handoff_0414_s11.md`.

#### 2.5.5 AI-OS arc (Path D — shipped 2026-05-20)

**4 converging primitives** that deliver the OS feel:
1. **Unified memory** (already there — hive-mind-core + 7 hook packages)
2. **One-click launcher with workspace context injection** (LauncherApp + `WAGGLE_WORKSPACE_ID` env)
3. **Live unified activity feed** (WaggleDance v2 bus → bridge → existing UI)
4. **Cross-tool task dispatch + skill diffusion** (launch with prompt + `skill_share` broadcasts)

**End-to-end flow that works today:**
```
dock → AI Tools (Extend zone) → GET /api/tools/detect
  → POST /api/tools/hooks {action:install} (npx, byte-identical reversible)
  → POST /api/tools/launch (child_process.spawn detached + WAGGLE_WORKSPACE_ID env)
  → tool's SessionStart hook picks up workspace
  → Stop hook → maybeEmitDiscovery (shim-core)
  → POST /api/waggle-dance/signal
  → SignalBus.record → installWaggleDanceBridge re-emits
  → /api/waggle/signals SSE → WaggleDanceApp UI
```

**Plus D1 skill diffusion:** when agent loop fires D1 (≥5-tool successful turn), `onSkillDistillationFire` broadcasts a `skill_share` signal on the same bus.

**Canonical reference:** `docs/plans/AI-OS-EXPLORATION-2026-05-19.md` for D1-D6 ratified decisions.

#### 2.5.6 Tier / billing / trust

- `packages/shared/src/tiers.ts` — canonical 5-tier system + `TierCapabilities`
- `packages/server/src/stripe/webhook.ts` — signature + idempotency + 3 event handlers
- `packages/server/src/stripe/index.ts:tierFromPriceId()` — resolves 4-var price contract:
  - `STRIPE_PRICE_PRO_MONTHLY` / `STRIPE_PRICE_PRO_ANNUAL`
  - `STRIPE_PRICE_TEAMS_MONTHLY` / `STRIPE_PRICE_TEAMS_ANNUAL`
  - Legacy `STRIPE_PRICE_PRO` / `STRIPE_PRICE_TEAMS` / `STRIPE_PRICE_BASIC` also resolved
- Tier writes land in `config.json` and are read by the agent loop at chat-time
- 17/17 webhook tests green

**KVARK gating:** `packages/agent/src/kvark-tools.ts` exposes `kvark_search` + `kvark_ask_document`, both tier-gated to TEAMS/ENTERPRISE. Do not recreate or expose outside gating.

### 2.6 Data flows (end-to-end traces)

#### Chat turn flow
```
UI sends POST /api/chat → server route
  → loads workspace mind + persona + tier
  → orchestrator.buildSystemPrompt() (cached per section)
  → tool-filter.filterToolsForContext(persona, tier)
  → injection-scanner.scanForInjection(userMsg)
  → runAgentLoop(...):
      - LLM call via LiteLLM
      - Tool execution loop with loop-guard
      - CostTracker accumulates per turn
      - TraceRecorder records execution trace
      - onSkillDistillationFire if D1 condition met
  → response streams back via SSE
  → frames written to *.mind (immediate frame from user msg, important frame from response summary on Stop)
```

#### Harvest ingestion flow
```
User drops file / pastes URL / connects connector
  → /api/harvest/ingest with adapter hint
  → adapter parses to canonical frames
  → dedup.ts content-hash check
  → write to per-workspace *.mind (auto-attach to workspace based on CWD or explicit ws_id)
  → optional: cognify (entity extraction + KG update + identity auto-populate)
  → optional: wiki-compiler (entity / concept / synthesis pages)
```

#### Cross-tool signal flow
```
External tool's Stop hook fires
  → @waggle/hive-mind-shim-core maybeEmitDiscovery(importance, summary)
  → POST /api/waggle-dance/signal (fetch, 2s timeout, fail-open)
  → SignalBus.record (500-entry ring buffer + subscriber emitter)
  → WaggleDanceDispatcher.handleBroadcastSignal (v2 branches)
  → installWaggleDanceBridge re-emits via emitWaggleSignal
  → SSE stream /api/waggle/signals (existing)
  → WaggleDanceApp UI renders with UX category mapping (10→5)
```

#### Skill diffusion flow
```
Agent loop completes turn with ≥5 distinct tools used + success
  → D1 condition met → onSkillDistillationFire callback
  → chat route extracts skill candidate from turn
  → emits skill_share signal on v2 bus
  → MCP-consuming tools can recall the skill via standard memory APIs
```

#### Evolution closed loop
```
TraceRecorder captures every chat turn
  → ExecutionTraceStore
  → /api/evolution/run kicks off run:
      eval-dataset (from traces)
      → judge (LLM-as-judge scoring)
      → iterative-optimizer (GEPA)
      → evolve-schema (with feedback separation)
      → evolution-gates (constraint checks)
      → EvolutionRunStore (status: pending → accepted/rejected)
  → User accepts → evolution-deploy writes persona/behavioral-spec override
  → server.activeBehavioralSpec hot-reloads via 'behavioral-spec:reloaded' event
  → next chat turn uses evolved prompt
```

### 2.7 External boundaries

| Boundary | Where | Notes |
|---|---|---|
| LLM | `litellm-config.yaml` | 3-layer routing. Local Ollama supported via env-driven MODEL/BASE_URL |
| Stripe | `packages/server/src/stripe/` | Webhook + checkout + tier resolution |
| KVARK | `packages/agent/src/kvark-tools.ts` | TEAMS+ only. Tools `kvark_search`, `kvark_ask_document` |
| OSS sync | `marolinik/hive-mind` | **Bidirectional. See `.github/sync.md`** |
| MCP catalog | `packages/shared/src/mcp-catalog.ts` | 148 entries with dedup guard |
| Connectors | `packages/agent/src/connectors/` | 31 (added OneNote 2026-05-20) |
| Tauri IPC | `app/src-tauri/capabilities/` | **Explicit allowlist. Never `allowlist: all: true`** |

### 2.8 Security model

**Non-negotiable:**
1. **Vault-only secrets.** API keys in `packages/core/src/mind/vault.ts` or `.env`. Never committed.
2. **Injection defense.** `scanForInjection()` MUST run on all connector / external input.
3. **No `eval`, no dynamic `require`.** Tauri WebView is restricted.
4. **Tauri IPC allowlist explicit** in `app/src-tauri/capabilities/`.
5. **Parameterized SQL only.** Never string-interpolate. `better-sqlite3` supports parameters.
6. **KVARK contact data** submits to your own API only — no third-party form services.
7. **Reversible install ethics** for hook packages — byte-identical uninstall via SHA-256 round-trip, fail-open on any error.

**AI Act compliance:** documented in `docs/AI-ACT-AUDIT-2026-04-10.md` + `docs/AI-ACT-COMPLIANCE-PROOF-2026-04-16.md`. Aug 2 2026 deadline. EU AI Act "compliance by default" is a dual-hook with the memory moat strategy.

---

## 3. DEVELOPMENT

### 3.1 Build & deploy

**Build commands (verified in `package.json`):**
```bash
npm run dev             # Vite dev server (apps/web)
npm run build           # Vite build to /dist (apps/web)
npm run build:packages  # tsc --build: shared → core → agent → server (order matters)
npm run build:all       # Packages then web
npm run lint            # ESLint repo-wide
npm run test            # Vitest unit tests
npm run test:e2e        # Playwright API tests
npm run test:visual     # Playwright visual regression
npm run test:all        # Full Playwright
```

**Verification commands (run these, don't claim "it compiles"):**
```bash
npx tsc --noEmit --project packages/agent/tsconfig.json
npx tsc --noEmit --project app/tsconfig.json
npm run test -- --run
npm run lint
```

**Tauri binary build** (do periodically, NOT every change):
```bash
npm run build:all
# then in app/:
npm run tauri build      # produces signed bundle if cert installed (M8 — pending)
```

**Sidecar (standalone, for dev / SaaS deploy):**
```bash
npm run dev:sidecar      # starts Fastify on :8787
# or
docker compose up         # full stack (Postgres :5434, Redis :6381, LiteLLM :4000, MinIO :9000-9001)
```

### 3.2 Testing posture

**Current state (verified 2026-05-26):** `6610/6611 pass, 1 skipped, 0 failed` with Docker compose stack up.

**Test infrastructure setup (per-machine):**
1. `docker compose up` to bring up Postgres + Redis + LiteLLM + MinIO
2. Copy `~/.waggle/marketplace.db` to repo path (gitignored)
3. Set `CLERK_PUBLISHABLE_KEY` in test env for Clerk-dependent tests

**Frameworks:**
- **Vitest** for unit + integration (most tests)
- **Playwright** for E2E (`playwright.config.ts` + `playwright-e2e.config.ts`)
- **Playwright visual regression** for design-system stability

**Patterns:**
- **Hermetic dep injection** — every `fs` / `exec` / `spawn` / `fetch` call in agent + server modules is injected so tests run without touching the host. Caught the platform-path bug + the layering inversion + the cross-test pollution bug on first runs of AI-OS code.
- **Unit-test at the FUNCTION level, not the component level.** Testing UI rendering is expensive; testing pure helpers is free. Lesson from `lib/launcher-prompt-args.ts` extraction.

### 3.3 OSS sync contract (waggle-os ↔ hive-mind)

**Critical — read before touching `packages/hive-mind-core/src/mind/` or `packages/hive-mind-core/src/harvest/`.**

Two GitHub Actions workflows enforce parity with the OSS release at [`marolinik/hive-mind`](https://github.com/marolinik/hive-mind):

1. **`mind-parity-check.yml`** — runs hive-mind's tests against waggle-os on every PR/push touching shared paths. **Failure blocks merge unless allowlisted in `.parity-allowlist`.**
2. **`sync-mind.yml`** — on push to main, opens filtered auto-PR on `marolinik/hive-mind`. Excludes "NOT extracted" files (`vault.ts`, `evolution-runs.ts`, `execution-traces.ts`, `improvement-signals.ts`, `compliance/**`).

**If you add a new "stays in waggle-os only" file** under those paths, update **BOTH** the `excluded_paths` in `sync-mind.yml` AND the "NOT Extracted" section of `hive-mind/EXTRACTION.md` in the same PR — otherwise the file leaks on the next sync.

**Operating manual:** `.github/sync.md`.

### 3.4 Operating contract — distilled from CLAUDE.md §3

These are non-negotiable. Read CLAUDE.md §3 in full.

1. **Think before coding.** State assumptions. Surface tradeoffs. If unclear, stop and ask. The single most expensive failure mode is making wrong assumptions and building 100+ lines on top.
2. **Simplicity first.** Minimum code that solves the problem. No speculative abstractions. No "configurability" that wasn't requested.
3. **Surgical changes.** Touch only what you must. Don't refactor adjacent code "while you're there." Match existing style.
4. **Goal-driven execution.** Transform vague tasks into verifiable goals. A task is not done until verification passes.
5. **Context discipline.** Re-read files after 10+ messages. Files >500 LOC need chunked reads. Tool results >50k chars are silently truncated.
6. **Check before create.** `grep` before adding a new file. Section 8 of CLAUDE.md lists known utilities that exist.
7. **Output discipline.** Long specs / handoffs / audit reports MUST be written to files, not streamed inline. Chat is a pointer; file is the deliverable.
8. **Handoff discipline.** End-of-session handoffs invoke `~/.claude/skills/handoff/`, which enforces verification (`git status`, tests, tsc on touched packages) BEFORE writing the doc.

### 3.5 Code patterns to know — DON'T RECREATE

`grep` before creating. These exist and are functional (see CLAUDE.md §8 for the full list):

| File | What |
|---|---|
| `packages/agent/src/injection-scanner.ts` | `scanForInjection()` |
| `packages/agent/src/cost-tracker.ts` | `CostTracker` + model pricing |
| `packages/agent/src/tool-filter.ts` | `filterToolsForContext()` |
| `packages/agent/src/skill-frontmatter.ts` | `parseSkillFrontmatter()` |
| `packages/agent/src/kvark-tools.ts` | KVARK tools (tier-gated) |
| `packages/agent/src/feature-flags.ts` | Feature flags |
| `packages/agent/src/persona-data.ts` | Canonical PERSONAS array |
| `packages/agent/src/loop-guard.ts` | Infinite loop prevention |
| `packages/agent/src/contradiction-detector.ts` | Memory conflict detection |
| `packages/shared/src/tiers.ts` | TIERS + capabilities |
| `packages/shared/src/mcp-catalog.ts` | 148-entry MCP catalog |
| `packages/shared/src/tool-detection.ts` | 7-tool detection (AI-OS) |
| `packages/hive-mind-core/src/mind/vault.ts` | Secret storage |
| `packages/hive-mind-shim-core/src/signal-emitter.ts` | `maybeEmitDiscovery` for hook packages |
| `apps/web/src/lib/launcher-prompt-args.ts` | Per-tool CLI prompt-arg shapes |
| `apps/web/src/lib/kg-export.ts` | PNG + SVG export from KG viewer |

### 3.6 Eval & benchmark stack

**Two co-equal pillars** (locked 2026-05-22):

#### Pillar 1 — Agent harness (orchestration + governance)
- **Benchmark:** GAIA 2 ARE-native (Phase 4 in `waggle-os-gaia2-wt`)
- **Headline:** N=160 = 83.8% strict / 86.5% judged-only
- **Goal framing:** Reading B — Waggle as local-first orchestrator/governance arena, NOT a competing loop. Sovereignty triple is the protagonist metric.
- **Open:** Qwen-local follow-up (repeat with Qwen 3.6 35B local for sovereign full-local number). Queued on Qwen serving.

#### Pillar 2 — Memory substrate
- **Benchmark:** LongMemEval (planned), LoCoMo (canonical published)
- **Headline LoCoMo:** 67.8% strict / 70.0% majority (trio-strict v2, published at `marolinik/hive-mind` v0.3.0)
- **Headline LongMemEval:** Blend-tuned 75.2% trio-strict N=100, above LoCoMo 67.8%
- **Ablation breakdown:** broken 41.6% → thinking 52.5% → distillation 68.3% → blend 75.2%. Multi-session improvement 37 → 74%.
- **Honest trade:** single-session-assistant −2 Q (distillation is user-centric), knowledge-update −2 Q (all-facts vs latest-wins)
- **Open:** N=500 scale-up + Sonnet lane

#### Substrate claim (Stage 3 v6)
- N=400, Fisher one-sided p = 8.07 × 10⁻¹⁸, +19.25pp retrieval lift
- Published as standalone substrate claim, not bundled with GEPA narrative

**Production vs research cost discipline:** two regimes documented in `feedback_production_vs_research_cost_discipline.md`. Research = strict pre-reg no-revisit. Production = amendable projection w/ PM memo. Phase 5 amendment $25 → $75 set the precedent.

---

## 4. BACKLOG

> Source of truth: `docs/plans/OPEN-TASKS-2026-05-20.md` (canonical, fully cross-referenced) + `docs/plans/OPEN-WORK-SUMMARY-2026-05-26.md` (single-pager). This section is a working pick-list.

### 4.1 P0 — Marko external blockers (NOT engineering)

These gate launch. **No code work unblocks them.**

| # | Action | Time | Status |
|---|---|---|---|
| **M5** | Top up API credits (Anthropic / OpenAI / Google / OpenRouter) | 15 min | **Open** — gates Pillar-1 Qwen-local + Pillar-2 N=500 |
| **M8** | Buy Windows EV code-signing cert (~$300-500/yr) | 1-3 day shipping | **Open** — longest single blocker, START NOW |
| **M9** | Contact ML peer reviewer for papers | 1 day | **Open** — Phase 6 gate |
| **M10** | Greenlight launch date | Decision | **Open** — everything downstream |

**Already done:** M2 (Claude export ✅), M3 (Gemini ✅), M6 (judge models ✅ — Opus 4.7 / GPT-5.4 / Gemini 2.5 Pro / Haiku 4.5), M7 (Stripe products ✅ — Pro+Teams × monthly+annual live).
**Skipped:** M1 ChatGPT (emails never arrived), M4 Perplexity (research-burst, marginal).

### 4.2 In-session engineering — actionable now (no blocker)

| # | Item | File / scope | Effort |
|---|---|---|---|
| E-2 | Cross-tool prompt-arg shapes (cursor / codex / hermes / openclaw — verify against real binaries) | `apps/web/src/lib/launcher-prompt-args.ts` | <1 day per tool |
| E-7 | Demo video script (90-sec harvest→wiki→insight + 5-min deep dive) | content | 1 day |
| E-8 | LinkedIn launch posts (3-post sequence) | content | 0.5-1 day |
| E-9 | Tauri binary build + smoke on clean Windows VM | binary + smoke | 1 day |
| E-12 | Cursor harvest adapter (Marko uses Cursor) | `packages/hive-mind-core/src/harvest/` | 0.5-1 day |

**Note on E-4 (OSS source extraction):** largely closed by E-14 v0.3.0 promotion. Re-verify scope before scheduling.
**Note on E-6 (MS Graph):** OneNote landed 2026-05-20; Outlook + OneDrive + MSTeams already covered. Treat as done unless concrete gap surfaces.

### 4.3 Binary verification (needs runtime, no code)

| # | Item | Status |
|---|---|---|
| V-1 | Spawn Agent + Dock click-paths (P35 + P36 wired) | Needs clean-install check |
| V-2 | Light mode finish (header text styling, BootScreen polish) | Needs visual review on Windows binary |
| V-3 | AI-OS end-to-end with `WAGGLE_SIGNAL_EMIT=1` on Marko's machine | Detect → install → launch → signal → UI |

**All three roll into a single binary-build session.**

### 4.4 Marko-gated engineering

| # | Item | Depends on | Effort |
|---|---|---|---|
| E-11 | **Phase 1 Harvest ingestion** — ingest M2+M3 exports → production `personal.mind` + cognify + identity auto-populate + wiki compile | Unblocked | 3 days. **Highest-leverage in-flight engineering item.** |
| E-13 | Mac notarization | M8 cert + Marko-side | — |

### 4.5 Multi-week eval campaigns (mostly closed; two follow-ups open)

| # | Campaign | Status |
|---|---|---|
| ✅ C-1 | LoCoMo Memory Proof (trio-strict canonical v2 67.8%) | Done 2026-05-21 |
| ✅ C-2 | Substrate Claim (Stage 3 v6 Fisher p=8e-18) | Done 2026-04-25 |
| ✅ C-3 | GAIA 2 Phase 5b ARE-native (N=160 86.5%) | Done 2026-05-22 |
| 🟡 **Pillar 1 follow-up** | Qwen-local harness benchmark (env-driven, points worker MODEL/BASE_URL at local Ollama) | Queued on Qwen serving |
| 🟡 **Pillar 2 follow-up** | LongMemEval N=500 + Sonnet lane | Open |
| 🟡 C-4 | Phase 6 Write Papers (concept doc exists at `docs/research/PAPER-2-CONCEPT_gepa-evolution.md`) | Gates on Pillar-1 Qwen + Pillar-2 N=500 |
| 🟡 C-5 | Phase 7 Launch Prep | Gates on papers |
| 🟡 C-6 | Phase 7b Launch Day | Gates on M10 |

### 4.6 Deferred post-launch arcs

| # | Item | Scope | Days |
|---|---|---|---|
| D-1 | **Wave 2/3 hooks for 6 packages** (cursor / claude-desktop / codex / codex-desktop / hermes / openclaw) — each needs SessionStart + UserPromptSubmit + Stop + PreCompact + install/verify/uninstall CLI + settings-merger | per-package multi-day | Per-package |
| D-2 | Wiki Compiler v2 (markdown export, incremental, Obsidian+Notion adapters, health dashboard) | substantial | 5 |
| D-3 | Harvest UX Full Polish (live SSE progress, resumable harvests, identity auto-populate, harvest-first onboarding tile) | substantial | 5 |
| D-4 | Compliance Report UX + Templates (PDF generation route, template system, full-page viewer, custom branding, KVARK template variant) | medium | 3.5 |
| D-5 | Installer Flow (INST-1 Ollama bundled installer, INST-2 hardware scan, INST-3 daemon auto-start: Win service / macOS launchd) | small | 2 |
| D-6 | PDF E2E deferred items (21 from 2026-04-17 PDF triage; biggest: P10 agent icons bee-style, P16 Files-app local browse, P29 Skills detail card) | opportunistic | — |
| D-7 | Responsive gaps R-1..R-5 (dock overflow <768px, StatusBar collapse, chat sidebar narrow, OnboardingWizard cols, AppWindow mobile) | not launch-blocking | — |
| D-8 | Engagement features ENG-1..ENG-7 ("I just remembered" toast, WorkspaceBriefing sidebar, progressive dock unlock, LoginBriefing, harvest-first onboarding, Memory Score, suggested next actions) | growth tooling | 7 × half-day |
| D-9 | Medium UX fixes UX-1..UX-7 (reduce onboarding decisions, dev-mode toggle for cost, chat header overflow, etc.) | small | 5 × 1-4 hr |

---

## 5. UX IMPROVEMENTS — DETAILED BY SURFACE

Each item lists: surface · what's wrong · file pointer · effort.

### 5.1 Light mode finish (V-2)

**What's wrong:** Semantic-token migration is done (no hive-950 references except a comment). Remaining issues are render-time fine-tuning that needs a binary to validate:
- BootScreen visual polish (uses semantic tokens + theme-aware logo but render judgment pending)
- Header text styling judgment calls
- A few header / styling final tweaks

**Files:**
- `apps/web/src/waggle-theme.css` (token source)
- `apps/web/src/components/os/BootScreen.tsx`
- Various headers in `apps/web/src/components/os/apps/*App.tsx`

**Reference:** `docs/light-mode-audit-2026-05-07.md`.

**Effort:** half-day on a binary build with visual review.

### 5.2 Onboarding — decision reduction (UX-1)

**What's wrong:** Onboarding wizard has too many decision points before the user sees value. Should be silent-defaults-first, friction only where irreversible/destructive.

**Files:**
- `apps/web/src/components/os/overlays/OnboardingWizard.tsx`
- `apps/web/src/components/os/overlays/OnboardingWizard/steps/*.tsx`

**Principle (from memory):** silent recommendations — don't ask the user to ratify a default. Connector tile + skill chips ship silent default ordering; no "which tools?" step. See `feedback_silent_recommendations_dont_ask`.

**Reference:** `docs/ONBOARDING-INVESTIGATION-2026-04-30.md`, `docs/ux-disclosure-levels.md`.

**Effort:** 1 day.

### 5.3 Dock & launcher polish

**Already shipped (don't re-do):**
- ✅ QW-3 skip boot on return
- ✅ QW-5 dock tier rename + clarifier
- ✅ P36 dock spawn-agent wiring
- ✅ E-1 Stop button on running tools
- ✅ AI Tools dock entry (LauncherApp in Extend zone, power tier)

**Open:**
- **D-1 Wave 2/3 hooks** — each new capture-capable hook makes a *launchable* tool into a *memory-feeding* one. Multiplier on the moat.
- **E-2 prompt-arg shapes per tool** — small per-tool verification work
- Dock text labels first-week (UX-3)

**Files:**
- `apps/web/src/components/os/Dock.tsx`
- `apps/web/src/lib/dock-tiers.ts`
- `apps/web/src/components/os/apps/LauncherApp.tsx`

### 5.4 Memory app — provenance & filtering

**Already shipped:** Memory provenance badge (Phase 4 polish, 2026-05-20).

**Open:**
- **G7 cross-tool provenance** — full surfacing: "this came from Cursor (workspace KVARK, 2h ago)"
- **G10 cross-tool replay** — "Show me the chain: Cursor → Claude Code → Codex"
- Memory tab labels (✅ QW-2 done)

**Files:**
- `apps/web/src/components/os/apps/MemoryApp.tsx`
- `apps/web/src/components/os/apps/memory/KnowledgeGraphViewer.tsx`
- `apps/web/src/lib/kg-export.ts` (✅ E-5 PNG export shipped)

### 5.5 Spawn Agent

**Already shipped:**
- ✅ P35 "no models available" — third-tier fallback to provider catalogs
- ✅ P36 dock wiring

**Open:** V-1 runtime verification on clean install.

**Files:**
- `apps/web/src/components/os/overlays/SpawnAgentDialog.tsx`
- `apps/web/src/lib/adapter.ts`

### 5.6 Chat experience

**Open:**
- Chat header overflow (UX-5)
- ContextRail polish (mostly done, see `apps/web/src/components/os/apps/chat/`)
- Per-message feedback flow already wired with arrow-key navigation (✅ A11Y-7)

**Files:**
- `apps/web/src/components/os/apps/ChatApp.tsx`
- `apps/web/src/components/os/apps/chat/*.tsx`

### 5.7 Wiki UI

**Open (D-2 Wiki Compiler v2):**
- Markdown export
- Incremental recompilation UI
- Obsidian + Notion adapters
- Wiki health dashboard

**Files:**
- `apps/web/src/components/os/apps/WikiApp.tsx` (or similar)
- `packages/hive-mind-wiki-compiler/src/`

### 5.8 Settings & permissions

**Already shipped:** QW-5 dock tier clarifier, tier-aware onboarding template/persona filtering (Phase 4.1 unblock).

**Open:** Dev-mode toggle for cost display (UX-4).

**Files:**
- `apps/web/src/components/os/apps/SettingsApp.tsx`

### 5.9 Responsive gaps (R-1..R-5, D-7)

Not launch-blocking (desktop primary), but post-launch:
- R-1 Dock overflow <768px
- R-2 StatusBar collapse
- R-3 Chat sidebar narrow
- R-4 OnboardingWizard column layout
- R-5 AppWindow mobile

### 5.10 Engagement features (ENG-1..ENG-7, D-8)

Post-launch growth tooling. 7 items × ~half-day:
- ENG-1 "I just remembered" toast
- ENG-2 WorkspaceBriefing sidebar
- ENG-3 Progressive dock unlock
- ENG-4 LoginBriefing
- ENG-5 Harvest-first onboarding
- ENG-6 Memory Score
- ENG-7 Suggested next actions

### 5.11 A11Y (all 9 shipped — preservation only)

All 9 items closed per grep verification: boot aria-live, dock 44×44 touch targets, window-titlebar icons, PersonaSwitcher aria-disabled, Settings role=switch, dashboard healthShape, chat feedback arrow-keys, Global Search role=dialog, memory importance aria-label.

**Don't regress these.** New UI must preserve.

---

## 6. RISKS, KNOWN ISSUES, TECH DEBT

### Tech debt

| Item | Where | Severity |
|---|---|---|
| `mind/` + `harvest/` exist in BOTH `packages/core/` AND `packages/hive-mind-core/` | Two packages | **Medium.** Phase out `packages/core/` content; the OSS extraction is the canonical location |
| Wiki compiler duplication | `packages/wiki-compiler` vs `packages/hive-mind-wiki-compiler` | **Low.** Check overlap before extending either |
| MCP server overlap | `packages/memory-mcp` vs `packages/hive-mind-mcp-server` | **Low.** `hive-mind-mcp-server` is the canonical going forward |
| `WAGGLE_PHASE5_CANARY_PCT` env + emitters | Dropped 2026-04-30 but artifacts remain | **Low.** Do NOT flip; stay extended-e2e artifact only |
| 145-item `BACKLOG-CONSOLIDATED-2026-04-17.md` | ~50% stale-but-done | **Low documentation debt.** `OPEN-TASKS-2026-05-20.md` is canonical now |

### Known operational risks

| Risk | Mitigation |
|---|---|
| Cross-platform process spawn quirks (Windows `.cmd` shims especially) | `hive-mind-cli` README documents `--cli-path` flag; LauncherApp injects via env |
| Signal volume on WaggleDance v2 bus | `importance-classifier.ts` thresholds; SignalBus 500-entry ring buffer caps memory |
| Substrate (mind/) parity with OSS hive-mind | `.parity-allowlist` + `mind-parity-check.yml` CI gate |
| Wave 2/3 hooks not implemented | Asymmetric on purpose — 7 launch, 1 capture. Communicate this clearly in UX |
| 30 prior test failures (all infra-blocked, now fixed) | Docker compose stack required for full pass; per-machine `~/.waggle/marketplace.db` copy |

### Open architectural questions

1. Should the legacy `packages/core/{mind,harvest}` content be deleted, or kept as a bridge layer? (Currently both packages contain duplicate code.)
2. Embedded shells for `claude-code` CLI via xterm.js — yes/no/when? (D4 decision deferred to Phase 5+.)
3. Wave 2/3 hook implementation order — Cursor first (Marko uses it) or Claude Desktop first (highest user count)?

---

## 7. Strategic decisions pending (Marko)

| # | Decision | Unlocks |
|---|---|---|
| S-1 | hive-mind OSS launch timing (default: "before Waggle" since substrate evidence is already public at v0.3.0) | Launch sequencing |
| S-2 | Harvest-first onboarding — replace step 2 or parallel opt-in? | UX (D-3) |
| S-3 | Warm list — 5-10 names to pre-email 72h before launch | Launch credibility |
| S-4 | Single-author or dual-author on papers? | Paper attribution |
| S-5 | Marketplace model — free+attribution / freemium / enterprise-only? | Skills monetization |
| S-6 | EvolveSchema attribution — keep "Mikhail" or cite ACE (Zhang et al.)? | Paper 2 framing |

---

## 8. Onboarding checklist for a new engineer

### Day 1 (4 hours)

- [ ] Read this doc end-to-end
- [ ] Read `CLAUDE.md` (Sections 1-3 mandatory)
- [ ] Read `docs/ARCHITECTURE.md`
- [ ] Read `docs/memory-architecture.md`
- [ ] Read `docs/plans/AI-OS-EXPLORATION-2026-05-19.md`
- [ ] Read `docs/plans/OPEN-TASKS-2026-05-20.md`
- [ ] `npm install` + `npm run build:packages` + `npm run test -- --run` → confirm 6610/6611 green
- [ ] `docker compose up` to bring up service stack
- [ ] `npm run dev` + open `localhost:5173` → see the dock + onboarding
- [ ] Find one P0 backlog item and read the code surface for it

### Week 1

- [ ] Ship one E-* item (E-2 cross-tool prompt-arg shape OR E-12 Cursor harvest adapter — both low-blast-radius starter tasks)
- [ ] Pair on a binary build (E-9) — verify V-1/V-2/V-3 together
- [ ] Read `docs/WAGGLE-CORNERSTONE.md` for the durable Phase A/B context
- [ ] Read `packages/agent/src/agent-loop.ts` end-to-end
- [ ] Read `packages/hive-mind-core/src/mind/{db,frames,search,knowledge}.ts`
- [ ] Read `.github/sync.md` for the OSS parity contract
- [ ] Ship one UX item from §5 (light mode polish or onboarding decision reduction)

### Week 2

- [ ] Start one D-1 Wave 2 hook implementation (Cursor recommended — Marko uses it)
- [ ] Pick up E-11 Phase 1 Harvest ingestion (the highest-leverage marko-gated item; runs M2+M3 exports → production memory)
- [ ] Pair on one eval pillar follow-up (Pillar 1 Qwen-local OR Pillar 2 N=500)
- [ ] Read the evolution subsystem (10+ files in `packages/agent/src/evolution-*`)

---

## 9. Canonical file index

### Architecture
- `CLAUDE.md` (operating contract + verified state)
- `docs/ARCHITECTURE.md` (system architecture)
- `docs/memory-architecture.md` (mind/ deep dive)
- `docs/WAGGLE-CORNERSTONE.md` (durable Phase A/B context)
- `docs/WAGGLE-SYSTEM-MAP.md` (system map)
- `docs/HIVE-MIND-INTEGRATION-DESIGN.md`

### AI-OS arc
- `docs/plans/AI-OS-EXPLORATION-2026-05-19.md` (architectural reference + D1-D6 decisions)
- `docs/plans/E-4-OSS-EXTRACTION-VERIFIED-2026-05-20.md`
- Recent handoffs in `~/.claude/projects/D--Projects-waggle-os/memory/`:
  - `project_session_handoff_0520_s1.md` (Phases 0-4)
  - `project_session_handoff_0520_s2.md` (backlog closure + E-1..E-6)
  - `project_session_handoff_0522_s1.md` (both pillars landed)

### Backlog + open tasks
- `docs/plans/OPEN-TASKS-2026-05-20.md` (canonical structured list)
- `docs/plans/OPEN-WORK-SUMMARY-2026-05-26.md` (single-pager snapshot)
- `docs/REMAINING-BACKLOG-2026-04-16.md` (older, partially stale)
- `docs/plans/BACKLOG-CONSOLIDATED-2026-04-17.md` (~50% stale-but-done)

### Compliance + audits
- `docs/AI-ACT-AUDIT-2026-04-10.md` + `docs/AI-ACT-COMPLIANCE-PROOF-2026-04-16.md`
- `docs/AGENT-BEHAVIOR-AUDIT-2026-04-16.md`
- `docs/UX-ASSESSMENT-2026-04-16.md`
- `docs/light-mode-audit-2026-05-07.md`

### Eval / benchmark
- `docs/plans/HARNESS-BENCHMARK-PLAN-2026-05-22.md`
- `docs/plans/HARNESS-BENCHMARK-GOAL-2026-05-22.md`
- `docs/plans/PILLAR2-MEMORY-LONGMEMEVAL-PLAN-2026-05-22.md`
- `docs/plans/BENCHMARK-LANDSCAPE-RESEARCH-2026-05-22.md`
- `D:/Projects/waggle-os-gaia2-wt/benchmarks/` (Pillar 1 results)
- `D:/Projects/hive-mind/benchmarks/locomo/RESULTS.md` (Pillar 2 canonical)
- `D:/Projects/hive-mind-test/scripts/locomo/` (Pillar 2 working)

### Launch
- `docs/launch/drafts/2026-05-12-apps-www-deployment-readiness.md`
- `docs/code-signing-pilot-and-launch.md`
- `docs/kvark-http-api-requirements.md`

### Brand + content
- `docs/BRAND-VOICE.md`
- `docs/MILESTONE-LAUNCH-STORY-VALIDATED-2026-04-30.md`

---

## 10. Rollback safety

```bash
# Latest stable known-good before AI-OS arc:
git reset --hard checkpoint/pre-ai-os-2026-05-20

# Deeper rollback to pre-self-evolution point:
git reset --hard checkpoint/pre-self-evolution-2026-04-14

# Origin already has all 24 AI-OS commits + 14 post-arc commits — force-push needed for any rollback:
git push --force-with-lease origin main
```

**All 24 AI-OS commits + the 14 post-arc commits are additive.** Existing behavior unchanged except:
1. New OS app `LauncherApp` in Extend zone (power-tier dock only)
2. New routes `/api/tools/*` (`detect` / `launch` / `hooks` / `processes` / `kill`) + `/api/waggle-dance/*` (`signal` / `signals`)
3. New connector: OneNote (`@waggle/agent` registry grew 30 → 31)
4. claude-code Stop hook opt-in signal emission via `WAGGLE_SIGNAL_EMIT=1`
5. WaggleDance dispatcher gained 6 new subtype branches (backward-compatible)
6. `tierFromPriceId()` extended for 4-var price contract

**No existing test changed semantics. No existing UI changed shape. No existing route changed contract.**

---

## 11. Glossary

| Term | Definition |
|---|---|
| **Waggle DS** / **Hive DS** | Design system — honey/hive-950/accent tokens in `apps/web/src/waggle-theme.css` |
| **FrameStore** | SQLite-backed memory frame storage (`packages/hive-mind-core/src/mind/frames.ts`) |
| **HybridSearch** | Vector + keyword search fused via RRF (`packages/hive-mind-core/src/mind/search.ts`) |
| **KnowledgeGraph** | Entity-relation graph with bitemporal validity (`packages/hive-mind-core/src/mind/knowledge.ts`) |
| **IdentityLayer** | Personal identity persistence (`packages/hive-mind-core/src/mind/identity.ts`) |
| **AwarenessLayer** | Active task/state tracking (`packages/hive-mind-core/src/mind/awareness.ts`) |
| **Cognify** | Memory extraction pipeline (entity extraction + KG update) |
| **Harvest** | Conversation/file ingestion (`packages/hive-mind-core/src/harvest/`) |
| **Mind** | Per-workspace persistence layer (`*.mind` SQLite files) |
| **BEHAVIORAL_SPEC** | Core agent rules (`packages/agent/src/behavioral-spec.ts`) |
| **Sidecar** | Node.js Fastify server bundled into Tauri (`packages/server` + `sidecar/`) |
| **KVARK** | Egzakta sovereign enterprise AI — top of the Waggle funnel |
| **LiteLLM** | LLM routing layer (`litellm-config.yaml`) |
| **WaggleDance** | Multi-agent / cross-tool coordination package (`packages/waggle-dance`) |
| **WaggleDance v2** | Promoted to cross-tool activity bus (Phase 1A-E of AI-OS arc) |
| **Weaver** | `packages/weaver` — workflow weaving (check source for current role) |
| **Evolution** | Self-improvement subsystem (`evolution-*.ts`, `judge.ts`, `iterative-optimizer.ts`) |
| **GEPA** | Genetic Evolution of Prompts and Architectures — iterative optimization |
| **D1** | Skill distillation condition — ≥5 distinct tools used + success in one turn |
| **SignalBus** | 500-entry ring buffer for cross-tool signals (`packages/server/src/local/signal-bus.ts`) |
| **Shim-core** | Foundation layer for all hook packages (`packages/hive-mind-shim-core`) |
| **Hive-mind-core** | Extracted memory substrate — shared with OSS `marolinik/hive-mind` |
| **Workspace** | Isolated memory space (per-workspace `*.mind` file + dock context) |
| **Persona** | Agent role profile (tools, prompt, model preference) — 17 total |
| **Trust posture** | Reversible-install ethics: byte-identical uninstall, fail-open hooks |

---

**End of handoff.**

Maintained by Marko Markovic · Egzakta Group · 2026-05-26
waggle-os.ai · www.kvark.ai
