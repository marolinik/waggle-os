# CLAUDE.md — Waggle OS
### Authoritative Operating Contract · All Agents · All Contributors · All Sessions

> Read this file in full before touching a single line of code.
> It is the single source of truth for architecture, strategic intent, and mechanical operating rules.
> If this file conflicts with any other document, **this file wins.**

---

## 0. How to Use This File

This file has two parts: **what the project is** (Sections 1-2) and **how to work on it** (Sections 3-9).
If you're about to write code, **Section 3** is the most important thing you'll read.

---

## 1. What Waggle OS Actually Is

**Waggle OS** is a workspace-native AI agent platform with persistent memory. It ships as a
Tauri 2.0 desktop binary for Windows and macOS, with a Vite-bundled web app and a Node.js sidecar.

**Strategic function:** Waggle is the demand-creation and qualification engine for KVARK —
Egzakta Group's sovereign enterprise AI platform.

### Tiers (verified from `packages/shared/src/tiers.ts`, April 2026)

| Tier | Price | Purpose |
|---|---|---|
| TRIAL | $0 / 15 days | All features unlocked; falls back to FREE after 15 days |
| FREE | $0 forever | 5 workspaces, agents, built-in skills only |
| PRO | $19/mo | Unlimited, marketplace, all connectors |
| TEAMS | $49/mo per seat | Shared workspaces, WaggleDance, governance |
| ENTERPRISE | Consultative | KVARK sovereign on-prem (www.kvark.ai) |

**Moat strategy:** Memory + Harvest is free forever (lock-in moat). Agents are free
(they generate memory). Skills and connectors are the upgrade trigger.

### Key Technology Facts (Verified April 2026)

| Layer | Stack |
|---|---|
| Frontend | React **19** + TypeScript + Vite + Tailwind 4 + base-ui/react |
| Desktop | Tauri 2.0 (Rust shell) |
| Backend | Fastify sidecar (Node.js, bundled into Tauri) |
| LLM routing | LiteLLM (see `litellm-config.yaml`) |
| Database | SQLite via @waggle/core (better-sqlite3 + sqlite-vec-windows-x64) |
| Memory | FrameStore + HybridSearch + KnowledgeGraph + IdentityLayer + AwarenessLayer |
| Agent runtime | `packages/agent/src/agent-loop.ts` |
| Billing | Stripe (installed; `stripe@^21.0.1`) |
| Design | Hive DS — honey #e5a000 / hive-950 #08090c / accent #a78bfa |
| Tests | Vitest (unit) + Playwright (E2E) |
| Deploy | Dockerfile + docker-compose.production.yml + render.yaml |

Package manager: npm (root) with `bun.lock` also present. Node >= 20.

---

## 2. Repository Structure (Verified)

### Top level
```
waggle-os/
├── app/                 # Tauri desktop shell (minimal React surface)
├── apps/
│   ├── web/             # <-- MAIN web app UI (this is where most components live)
│   └── www/             # Landing page (waggle-os.ai)
├── packages/            # 16 workspace packages (see below)
├── sidecar/             # Node.js sidecar bundled into Tauri
├── scripts/             # build-sidecar, bundle-native-deps, bundle-node
├── tests/               # Cross-cutting integration tests
├── docs/                # ARCHITECTURE.md and others
├── cowork/              # Scratchpad / planning / handoff docs (historical; CLAUDE.md promoted to root)
├── .planning/ .scratch/ .mind/  # Working notes
├── docker-compose.yml + .production.yml + Dockerfile + render.yaml
├── litellm-config.yaml  # LLM router config
├── playwright.config.ts + playwright-e2e.config.ts
├── vitest.config.ts + vitest.setup.ts
└── package.json (workspaces: apps/*, packages/*)
```

### Packages (`packages/`, 16 workspaces)
```
admin-web       cli             launcher        marketplace
agent           core            memory-mcp      optimizer
sdk             server          shared          ui
waggle-dance    weaver          wiki-compiler   worker
```

### `packages/agent/src/` — MOST ACTIVE (94 .ts files + 4 subdirs)

Key files (not exhaustive — grep before creating anything new):
```
agent-loop.ts                Core execution loop
orchestrator.ts              buildSystemPrompt(), recallMemory()
personas.ts                  AgentPersona interface + logic (data split out)
persona-data.ts              Pure PERSONAS declarative data array
custom-personas.ts           loadCustomPersonas() from disk
behavioral-spec.ts           BEHAVIORAL_SPEC rules
tool-filter.ts               filterToolsForContext()
injection-scanner.ts         scanForInjection() — 3 pattern sets
cost-tracker.ts              CostTracker + model pricing
skill-frontmatter.ts         parseSkillFrontmatter()
kvark-tools.ts               kvark_search, kvark_ask_document (tier-gated)
feature-flags.ts             EXISTS — don't recreate
subagent-orchestrator.ts     Subagent spawn/coord
workflow-composer.ts
workflow-harness.ts
workflow-templates.ts

Evolution subsystem:
  evolution-orchestrator.ts  evolution-deploy.ts  evolution-gates.ts
  evolution-llm-wiring.ts    evolve-schema.ts     iterative-optimizer.ts
  judge.ts                   eval-dataset.ts      compose-evolution.ts

Capability & trust:
  capability-acquisition.ts  capability-router.ts  trust-model.ts
  permissions.ts             credential-pool.ts    confirmation.ts

Quality & correction:
  quality-controller.ts      contradiction-detector.ts
  correction-detector.ts     improvement-detector.ts  improvement-wiring.ts
  loop-guard.ts              iteration-budget.ts

Subdirs:
  commands/   connectors/   mcp/   providers/
```

### `packages/core/src/`
```
Top-level: config.ts, cron-store.ts, file-store.ts, install-audit.ts,
           logger.ts (createCoreLogger), memory-import.ts, migration.ts,
           multi-mind.ts, multi-mind-cache.ts, optimization-log.ts,
           skill-hashes.ts, team-sync.ts, telemetry.ts, vault.ts,
           workspace-config.ts, index.ts

Subdirs:
  compliance/  — compliance reporting, interaction-store, status-checker
  harvest/     — adapters for chatgpt, claude, claude-code, gemini,
                 perplexity, pdf, plaintext, markdown, url, universal;
                 pipeline.ts; dedup.ts
  mind/        — memory substrate layers. db.ts (MindDB + sqlite-vec),
                 schema.ts (SCHEMA_SQL + VEC_TABLE_SQL), identity.ts,
                 awareness.ts, frames.ts (I/P/B + compaction + dedup),
                 sessions.ts (SessionStore + ensureActive),
                 search.ts (HybridSearch — FTS5 + vec0 fused via RRF),
                 knowledge.ts (KnowledgeGraph + bitemporal validity),
                 scoring.ts (scoring profiles), reconcile.ts, ontology.ts,
                 concept-tracker.ts, entity-normalizer.ts,
                 evolution-runs.ts, execution-traces.ts,
                 improvement-signals.ts, embedding-provider.ts,
                 *-embedder.ts (api/inprocess/litellm/ollama)
```

For the deep-dive on what the mind/ substrate does, see [`docs/memory-architecture.md`](docs/memory-architecture.md).

### `packages/shared/src/`
```
types.ts         User, Team, AgentDef, Task, WaggleMessage
constants.ts     Team roles, job statuses
schemas.ts       Zod schemas
tiers.ts         TIERS + TierCapabilities (canonical 5-tier system)
mcp-catalog.ts   MCP server catalog
index.ts         Barrel
```

### `app/` (Tauri desktop shell)
```
app/src/
  └── components/cockpit/     # Only UI that ships with Tauri shell
app/src-tauri/                # Rust shell + capabilities/ + tauri.conf.json
```

**Note:** `app/src/` is minimal. Almost all UI code lives in `apps/web/src/`.

### `apps/web/src/` (MAIN UI)
```
apps/web/src/
├── assets/      components/    hooks/       lib/
├── pages/       providers/     test/

components/
├── os/
│   ├── apps/        # Per-app UI shells
│   └── overlays/    # OnboardingWizard.tsx, PersonaSwitcher.tsx live HERE
└── ui/              # Shared UI primitives
```

### Build Commands (verified from `package.json`)
```bash
npm run dev             # Vite dev server (apps/web)
npm run build           # Vite build to /dist (apps/web)
npm run build:packages  # tsc --build: shared -> core -> agent -> server (order matters)
npm run build:all       # Packages then web
npm run lint            # ESLint repo-wide
npm run test            # Vitest unit tests
npm run test:e2e        # Playwright API tests
npm run test:visual     # Playwright visual regression
npm run test:all        # Full Playwright
```

### Verification Commands (run these, don't claim "it compiles")
```bash
npx tsc --noEmit --project packages/agent/tsconfig.json
npx tsc --noEmit --project app/tsconfig.json
npm run test -- --run
npm run lint
```

---

## 3. Behavioral Rules — How You Must Work

These rules apply to every code change. They exist because violations have cost real debugging time.

### 3.1 Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing anything:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

=== CRITICAL ===
The single most expensive LLM failure mode is making wrong assumptions and building
100+ lines on top of them. The fix costs 10x what the question would have cost.
Stop. Ask. Then build.
=== END CRITICAL ===

### 3.2 Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Test: **"Would a senior engineer say this is overcomplicated?"** If yes, simplify.

### 3.3 Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, **mention it** — don't delete it.

When your changes create orphans:
- Remove imports/variables/functions YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

Test: **Every changed line should trace directly to the request.**

### 3.4 Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform vague tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] -> verify: [check]
2. [Step] -> verify: [check]
3. [Step] -> verify: [check]
```

A task is not done until verification passes. "I think this works" is not verification.

### 3.5 Context Discipline

- **Context decay:** After 10+ messages, re-read any file before editing. Do not trust memory.
- **File read budget:** Files >500 LOC require chunked reads. Never assume complete view.
- **Truncation:** Tool results >50k chars are silently truncated. If sparse, re-run narrower.
- **Re-read before edit. Re-read after edit.** Max 3 edits per file before verification read.
- **Exhaustive grep on rename:** Direct refs, type-level, string literals, dynamic imports,
  re-exports/barrel entries, test files. **One grep is never enough.**

### 3.6 Check Before Create

Before adding a new file, **grep first.** The repo has ~94 files in `packages/agent/src`
alone. If you're about to write something that might already exist, it probably does.
See Section 8 for known utilities.

### 3.7 Output Discipline

- **Chat reply budget.** Long specs, handoffs, audit reports, and multi-phase plans MUST
  be written to files (memory/, docs/, or via `/handoff`), not rendered inline. The chat
  is a pointer; the file is the deliverable.
- **Chunk long work.** Multi-phase roadmaps and >1k-line specs: implement in phases,
  commit per phase, give a 3-line status, then stop and await the next instruction. Do
  not stream an exhaustive summary that blows the output budget.
- **Rationale:** 13+ prior sessions were lost mid-response to the 500-output-token cap.
  Surface shortly, persist richly.

### 3.8 Handoff Discipline

- **Use the skill.** End-of-session handoffs invoke `~/.claude/skills/handoff/`, which
  enforces verification (`git status`, tests N/M, `npx tsc --noEmit` on touched packages)
  BEFORE writing the doc. Do not hand-write handoffs that skip the gate.
- **Canonical location.** Handoffs live at
  `C:/Users/MarkoMarkovic/.claude/projects/D--Projects-waggle-os/memory/project_session_handoff_<MMDD>_s<N>.md`,
  with the memory-dir MEMORY.md "START HERE" pointer updated. That is the single source
  of truth for what shipped / what's left / how to roll back.
- **Never hide failures.** Failing tests, unverified MCP reconnects, wrong build dir —
  surface under "What's still open" in the handoff. Clean-looking handoffs that hide rot
  cost the next session hours.

---

## 4. Pre-Work Protocol

Before any structural refactor on a file >300 LOC:
1. Remove dead props, unused exports, unused imports, `console.log`.
2. Commit separately: `chore(scope): dead code removal — [filename]`

**Phased execution:** Max 5 files per phase. Complete → verify → await approval → next phase.

**Senior dev override:** If architecture is flawed, state is duplicated, or patterns
are inconsistent — state it and propose a fix. Standard: *"What would a senior engineer
reject in review?"*

---

## 5. Persona Architecture

### Current (13 personas — data in `persona-data.ts`, logic in `personas.ts`)
researcher, writer, analyst, coder, project-manager, executive-assistant,
sales-rep, marketer, product-manager-senior, hr-manager, legal-professional,
finance-owner, consultant

**Split is already done:** `persona-data.ts` holds the pure `PERSONAS` array;
`personas.ts` exports the `AgentPersona` interface and logic only.

### Target (17 personas — add 4)
- **general-purpose** — versatile default, full tool access
- **planner** — read-only strategic planning, no file writes
- **verifier** — adversarial QA, read-only, VERDICT output format
- **coordinator** — pure orchestrator, 3 tools only (spawn/list/get_agent_result)

### AgentPersona Interface — Current Fields
```typescript
interface AgentPersona {
  id, name, description, icon, systemPrompt, modelPreference,
  tools, workspaceAffinity, suggestedCommands, defaultWorkflow
}
```

### AgentPersona Interface — Proposed Additions
```typescript
disallowedTools?: string[]   // denylist — enforced at pool level
failurePatterns?: string[]   // documented failure modes (min 3 per persona)
isReadOnly?: boolean         // true = no write tools ever
tagline?: string             // one sentence for picker hover
bestFor?: string[]           // 3 example tasks
wontDo?: string              // hard boundary statement
```

---

## 6. Onboarding & PersonaSwitcher (correct paths)

### OnboardingWizard
**Path:** `apps/web/src/components/os/overlays/OnboardingWizard.tsx`
(NOT `app/src/components/onboarding/` — that path doesn't exist.)

Current: 7-step wizard with hardcoded TEMPLATES and PERSONAS arrays not wired to the
real `PERSONAS` from `persona-data.ts`.

Target: Expand TEMPLATES to 15, connect to canonical `PERSONAS` array,
update TEMPLATE_PERSONA mapping for 15 → 17 combinations.

### PersonaSwitcher
**Path:** `apps/web/src/components/os/overlays/PersonaSwitcher.tsx`

Current: Flat 2-column grid. "Create Custom Persona" inline form POSTs to `/api/personas`.

Target: Two-tier layout — "UNIVERSAL MODES" (8) + "YOUR WORKSPACE SPECIALISTS"
(template-scoped). Hover tooltip shows tagline + bestFor + wontDo.

---

## 7. Security Constraints (Non-Negotiable)

1. **Vault-only secrets.** API keys in Vault or `.env` (never committed). `.env.example` has key names only.
2. **Injection defense.** `scanForInjection()` from `injection-scanner.ts` MUST be called on all connector/external input.
3. **No eval, no dynamic require.** Tauri WebView is restricted.
4. **Tauri IPC allowlist.** Explicit in `app/src-tauri/capabilities/`. Never `allowlist: all: true`.
5. **Parameterized queries.** No string interpolation in SQL. Ever. better-sqlite3 supports parameters.
6. **KVARK contact data.** Submits to your API only — no third-party form services.
7. **Secrets in `packages/core/src/mind/vault.ts`** — use it; don't build parallel secret stores.

---

## 7.5. Memory Substrate Sync (waggle-os ↔ hive-mind)

`packages/core/src/mind/` and `packages/core/src/harvest/` are SHARED with the OSS release artifact at
[`marolinik/hive-mind`](https://github.com/marolinik/hive-mind). Two GitHub Actions workflows enforce parity:

- **`mind-parity-check.yml`** — runs hive-mind's tests against waggle-os on every PR/push touching shared paths. Failure blocks merge unless allowlisted in `.parity-allowlist`.
- **`sync-mind.yml`** — on push to main touching shared paths, opens a filtered auto-PR on `marolinik/hive-mind` (excludes NOT-extracted files: `vault.ts`, `evolution-runs.ts`, `execution-traces.ts`, `improvement-signals.ts`, `compliance/**`).

**Before modifying `packages/core/src/mind/` or `packages/core/src/harvest/`:** read [`.github/sync.md`](./.github/sync.md) for the full operating manual — when to allowlist, how to handle bidirectional bug fixes, and what the EXTRACTION.md filter list covers.

**If you add a new "stays in waggle-os only" file under those paths,** update BOTH the `excluded_paths` array in `sync-mind.yml` AND the "NOT Extracted" section of [`hive-mind/EXTRACTION.md`](https://github.com/marolinik/hive-mind/blob/master/EXTRACTION.md) in the same PR — otherwise the file leaks on the next sync.

---

## 8. Already Built — Do Not Recreate

Grep before creating. These exist and are functional:

| File | What it does |
|---|---|
| `packages/agent/src/injection-scanner.ts` | `scanForInjection()` — 3 pattern sets |
| `packages/agent/src/cost-tracker.ts` | `CostTracker` + model pricing table |
| `packages/agent/src/tool-filter.ts` | `filterToolsForContext()` — allowlist/denylist |
| `packages/agent/src/skill-frontmatter.ts` | `parseSkillFrontmatter()`, `ParsedSkill` |
| `packages/agent/src/kvark-tools.ts` | `kvark_search`, `kvark_ask_document` (tier-gated) |
| `packages/agent/src/feature-flags.ts` | **EXISTS** — don't create |
| `packages/agent/src/persona-data.ts` | Canonical `PERSONAS` array (pure data) |
| `packages/agent/src/custom-personas.ts` | `loadCustomPersonas()` from disk |
| `packages/agent/src/judge.ts` | Evolution judging |
| `packages/agent/src/iterative-optimizer.ts` | Self-improvement loop |
| `packages/agent/src/capability-router.ts` | Per-capability routing |
| `packages/agent/src/loop-guard.ts` | Infinite loop prevention |
| `packages/agent/src/contradiction-detector.ts` | Memory conflict detection |
| `packages/shared/src/tiers.ts` | `TIERS`, `TierCapabilities` — canonical tier system |
| `packages/shared/src/mcp-catalog.ts` | MCP server catalog |
| `packages/core/src/mind/vault.ts` | Secret storage |
| `packages/core/src/mind/telemetry.ts` | Telemetry pipeline |
| `packages/core/src/harvest/pipeline.ts` | Harvest adapters + dedup |
| `packages/core/src/compliance/` | Compliance + audit |
| `app/src/components/cockpit/` | Tauri cockpit UI |

---

## 9. KVARK Integration

**Canonical copy:**
> "Everything Waggle does — on your infrastructure, connected to all your internal systems.
> Full data pipeline injection, your permissions, complete audit trail, governance.
> Your data never leaves your perimeter."

**URLs (hardcoded only in `kvark-tools.ts` and `KvarkNudge` component):**
- Product site: https://www.kvark.ai
- License server: https://license.waggle-os.ai/validate
- SaaS cloud: https://cloud.waggle-os.ai

`kvark-tools.ts` gates `kvark_search` and `kvark_ask_document` to TEAMS/ENTERPRISE tiers.
Do not recreate or expose outside gating.

---

## 10. Sprint Status (May 2026)

### What Landed
**April 2026 baseline:**
- `tiers.ts` shipped with 5-tier system (TRIAL/FREE/PRO/TEAMS/ENTERPRISE).
- `feature-flags.ts` shipped.
- Persona data/logic split (`persona-data.ts` ↔ `personas.ts`).
- **All 4 new personas shipped** (general-purpose, planner, verifier, coordinator) — `persona-data.ts` verified.
- **AgentPersona interface extended** with disallowedTools / failurePatterns / isReadOnly / tagline / bestFor / wontDo — verified in `personas.ts`.
- **`behavioral-spec.ts` split** into named sections with `=== CRITICAL ===` markers; `COMPACTION_PROMPT` exported.
- **Orchestrator section caching** shipped in `buildSystemPrompt()`.
- **OnboardingWizard TEMPLATES expanded to 15**, all wired to `PERSONAS`.
- Stripe installed (`stripe@^21.0.1`) in root deps.
- Evolution subsystem fully present (10+ files, closed loop end-to-end).
- **PromptAssembler v5 PoC complete** — see `docs/plans/POLISH-SPRINT-2026-04-18.md`.
- **Premium harness reached HONEST 21/21** (May 2026 S1) — every pillar regression-locked + composing. Full agent suite 2657/2657. See `memory/project_session_handoff_0519_s1.md`.

**AI-OS arc (May 2026 S1/S2, 14 commits on origin):**
- Phase 0 — Tool detection PoC (`packages/agent/src/tool-detection.ts`) for all 7 supported AI tools, hermetic + cross-platform.
- Phase 1A — WaggleDance v2 dispatcher branches wired (discovery/routed_share/model_recipe/knowledge_match/task_claim/model_recommendation).
- Phase 1B — Local sidecar surface (`/api/waggle-dance/signal` + `/signals`), SignalBus ring buffer, personal-tier-eligible.
- Phase 1C — Bridge: v2 bus → existing `/api/waggle/signals` UI stream (zero frontend changes).
- Phase 1D — Shim-core signal emitter library (`@waggle/hive-mind-shim-core` `maybeEmitDiscovery`).
- Phase 1E — claude-code Stop hook wired to `maybeEmitDiscovery` (opt-in via `WAGGLE_SIGNAL_EMIT`).
- Phase 2A — Launcher backend (`/api/tools/launch`, `/api/tools/hooks`).
- Phase 2B — LauncherApp dock surface (`apps/web/src/components/os/apps/LauncherApp.tsx`).
- Phase 3 — Skill diffusion (D1 fire → `skill_share` broadcast via `onSkillDistillationFire` callback).
- Phase 4 — Full 7-tool launch cohort + Mission Control inventory tile + Memory provenance badge + launch-with-prompt textarea + process tracker / 'Running' badge.

End-to-end: detect → install hooks (reversible) → launch with `WAGGLE_WORKSPACE_ID` env → hook captures → shim emitter → bus → bridge → UI. Rollback tag: `checkpoint/pre-ai-os-2026-05-20`. AI-OS exploration doc: `docs/plans/AI-OS-EXPLORATION-2026-05-19.md`.

### Open Work
| # | File | What |
|---|---|---|
| 1 | Spawn Agent + Dock wiring | P36 already wired in `Dock.tsx`+`Desktop.tsx`; P35 third-tier fallback (LiteLLM → runtime model → provider catalogs) landed `14942be`. Residual: runtime verification on a clean install. |
| 2 | Light mode finish | P40/P41 + CR-2 — semantic-token migration is done (no hive-950 references except a comment); remaining issues are render-time fine-tuning (BootScreen visual polish + a few header-styling judgments) that need a binary build to validate. |
| 3 | Wave 2/3 hook implementations | 6 hive-mind-hooks-* packages remain Wave 2/3 stubs (`export {}`): cursor / claude-desktop / codex / codex-desktop / hermes / openclaw. Per-package effort: SessionStart + UserPromptSubmit + Stop + PreCompact handlers + install/uninstall/verify CLI. Defer until claude-code-only ship gets real usage feedback. |

**Closed during May 2026 backlog sweep:**
- ✅ OW-6 PersonaSwitcher two-tier — shipped via M-01 (`PersonaSwitcher.tsx` + `lib/persona-tier.ts` + `lib/persona-tooltip.ts`); 26/26 tests passing
- ✅ CR-7 CLAUDE.md §10 update (this entry)
- ✅ P35 Spawn Agent "no models available" (`14942be`)
- ✅ QW-1..QW-5 quick wins (all already shipped per `grep` verification)
- ✅ CR-2 hive-950 → semantic tokens (only comment-level refs remain)
- ✅ M7 Stripe products — both test (`acct_1SzHlbC0mmjh4oEM`) and live (`CNCrMQy1f7`) accounts hold the full 2 products × 2 prices (monthly + annual) with `pro_monthly` / `pro_annual` / `teams_monthly` / `teams_annual` lookup keys. Verified via `stripe products list` + `stripe prices list`. Live price IDs documented in `docs/launch/drafts/2026-05-12-apps-www-deployment-readiness.md`.
- ✅ E-10 Stripe tier-enforcement wiring — webhook handler was already complete (signature + idempotency + 3 event handlers in `packages/server/src/stripe/webhook.ts`); session closed the residual gap by extending `tierFromPriceId()` in `packages/server/src/stripe/index.ts` to resolve the full 4-var contract (`STRIPE_PRICE_PRO_MONTHLY` / `_ANNUAL` / `STRIPE_PRICE_TEAMS_MONTHLY` / `_ANNUAL`) alongside legacy single-vars + `STRIPE_PRICE_BASIC`. 17/17 webhook tests green; annual subscriptions now resolve through the webhook.
- ✅ M2 Claude export — `data-ffbb9f0b-…batch-0000.zip` (30 MB) on Desktop\MEMORIES\Claude\, dated 2026-04-17. Ready for E-11 ingestion.
- ✅ M3 Gemini export — `takeout-20260416T224803Z-3-001.zip` (437 MB) on Desktop\MEMORIES\Google\, dated 2026-04-17. Ready for E-11 ingestion.
- ⏭️ M1 ChatGPT export — skipped by Marko 2026-05-21 (export emails never arrived after multiple requests).
- ⏭️ M4 Perplexity export — skipped by Marko 2026-05-21 (research-burst usage; marginal corpus contribution).
- ✅ M6 judge roster — Opus 4.7 / GPT-5.4 / Gemini 2.5 Pro / Haiku 4.5 locked 2026-05-21.
- ✅ C-1 LOCOMO v5 Memory Proof — substantively done 2026-05-11: 73.1% Opus 4.7 / 73.4% Qwen3.6, N=320 stratified, +4.6pp over Mem0 paper. Trio-strict ensemble re-judge (~$30, ~2h) is the only remaining step. See `D:/Projects/hive-mind-test/scripts/locomo/data/reports/RESULT-v5-2026-05-11.md`.
- ✅ C-2 Substrate Claim — done 2026-04-25: Stage 3 v6 N=400, Fisher one-sided p = 8.07 × 10⁻¹⁸, +19.25pp retrieval-vs-no-context lift. "GEPA Full-System canary" expansion explicitly DROPPED 2026-04-30 per PM strategic reset. See `D:/Projects/waggle-os-gaia2-wt/benchmarks/results/stage3-n400-v6-final-analysis.md`.

### New open work surfaced 2026-05-21

| # | Item | What |
|---|---|---|
| E-14 | `hive-mind` v0.3.0 promotion finish | Per `PROMOTE-TO-UPSTREAM-2026-05-12.md`: claude-code-hooks + enrichment + plugin manifest already merged into `D:/Projects/hive-mind`; still missing wiki-web (source at `hive-mind-test/packages/wiki-web/`), `benchmarks/locomo/` scripts + RESULTS.md, README "Claude Code plugin" section + benchmark badge, CHANGELOG entry, version bumps + v0.3.0 tag. 1-2 days. Launch-critical — without this the substrate-claim evidence isn't visible in the public repo. |
| C-3 (reframed) | Full GAIA 2 Phase 4 benchmark | Phase 3 closed in HALT 2026-04-30 (commit `104aa5a` in `waggle-os-gaia2-wt`). Probe showed $4.09/invocation (9-31× over original estimate), narrow-proxy adapter approach economically non-viable. Phase 4 needs Docker + ARE proper agentic execution environment + new adapter strategy. Real engineering arc — scope + budget recalibrate pending Phase 4 design. |

For the full polish+launch backlog see `docs/plans/BACKLOG-CONSOLIDATED-2026-04-17.md` (~145 items; ~50% are stale-but-done per the May 2026 verification sweep) and the AI-OS arc in `docs/plans/AI-OS-EXPLORATION-2026-05-19.md`.

---

## 11. Glossary

| Term | Definition |
|---|---|
| Hive DS | Waggle design system — honey/hive-950/accent tokens in `waggle-theme.css` |
| FrameStore | SQLite-backed memory frame storage (`packages/core/src/frames.ts`) |
| HybridSearch | Vector + keyword search (`packages/core/src/search.ts`) |
| KnowledgeGraph | Entity-relation graph (`packages/core/src/knowledge.ts`) |
| IdentityLayer | Personal identity persistence (`packages/core/src/identity.ts`) |
| AwarenessLayer | Active task/state tracking (`packages/core/src/awareness.ts`) |
| Cognify | Memory extraction pipeline (`packages/agent/src/cognify.ts`) |
| Harvest | Conversation/file ingestion (`packages/core/src/harvest/`) |
| Mind | Per-workspace persistence layer (`packages/core/src/mind/`) |
| BEHAVIORAL_SPEC | Core agent rules (`packages/agent/src/behavioral-spec.ts`) |
| Sidecar | Node.js Fastify server bundled into Tauri (`/sidecar`) |
| KVARK | Egzakta sovereign enterprise AI — top of the Waggle funnel |
| LiteLLM | LLM routing layer (`litellm-config.yaml`) |
| WaggleDance | Multi-agent coordination package (`packages/waggle-dance`) |
| Weaver | `packages/weaver` — (check source for current role) |
| Evolution | Self-improvement subsystem (`evolution-*.ts`, `judge.ts`, `iterative-optimizer.ts`) |
| assembleToolPool | Per-persona tool filtering from allowlist + denylist (to implement) |

---

Maintained by Marko Markovic · Egzakta Group · April 2026
waggle-os.ai · www.kvark.ai
