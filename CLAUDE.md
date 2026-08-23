# CLAUDE.md — Waggle OS
### Claude operational companion

> Read `AGENTS.md` in full before touching code. `AGENTS.md` is the canonical operating
> contract for all agents and wins on conflict. This file is a Claude-oriented companion;
> keep shared guidance aligned, but never treat it as a second source of truth.

---

## 0. How to Use This File

This file has two parts: **what the project is** (Sections 1-2) and **how to work on it** (Sections 3-9).
If you're about to write code, **Section 3** is the most important thing you'll read.

---

## 1. What Waggle OS Actually Is

**Waggle OS** is a workspace-native AI agent platform with persistent memory. Its current desktop
release scope is Windows-first: a Tauri 2.0 app with a Vite-bundled web UI and bundled Node.js
sidecar. macOS packaging, signing, notarization, and runtime certification are roadmap work.

**Strategic function:** Waggle is the demand-creation and qualification engine for KVARK —
Egzakta Group's sovereign enterprise AI platform.

### Tiers (verified from `packages/shared/src/tiers.ts` — 4-tier: TRIAL/FREE(Solo)/TEAMS/ENTERPRISE, Solo-vs-Team collapse 2026-07-05)

| Tier | Price | Purpose |
|---|---|---|
| TRIAL | $0 / 15 days | TEAM preview — 15 days of Team, then Solo |
| FREE (Solo) | $0 forever | Everything personal: unlimited workspaces+connectors, marketplace/custom skills, cloud embeddings, PDF/JSON export, basic audit — free forever |
| TEAMS | $49/mo per seat | Shared workspaces, WaggleDance, governance |
| ENTERPRISE | Consultative | KVARK sovereign on-prem (www.kvark.ai) |

> PRO ($19/mo) was removed in the Solo-vs-Team collapse (2026-07-05); its
> capabilities folded into FREE (Solo). `TIER_LABELS` displays FREE as "Solo".

**Moat strategy:** Memory + Harvest is free forever (lock-in moat). Agents, skills,
and connectors are all free (they generate memory). Team collaboration (shared memory,
WaggleDance, governance) is the upgrade trigger.

### Current Release Qualification Contract (2026-08-22)

- Launch gate: **Windows Solo only**.
- In-scope external-agent release cohort: **Claude Code, Codex, and Hermes**. Each integration
  uses the user's own installed client and its official user authentication.
- **Cursor and OpenClaw are roadmap-only**: detection metadata may remain, but production launch,
  hooks, Fleet/task dispatch, and direct run routes must fail closed for them.
- Claude Desktop, Codex Desktop, and Hermes Desktop may remain as detected convenience launch
  surfaces; they are not separate memory-hook or agent-acceptance targets in this release gate.
- ChatGPT/OpenAI is a model/provider and memory-import surface, not a separate launcher target.
- The Windows Solo launch contract requires an exact-revision Windows installer qualification receipt to
  prove its bundled Node sidecar, no-Python OpenAI-compatible proxy, Waggle-managed local runtime/model, default
  in-process embedding path, and freedom from developer Node, Docker, Python, external LiteLLM, or a
  separately installed Ollama. A separate revision-bound router receipt must prove the smart-router primary,
  compact-tool-context, budget, and fallback paths. A user-installed Ollama remains optional.
- Every receipt is valid first for the exact source revision and artifact SHA-256 it names. An older
  router, persona, or authentication receipt is historical unless the current launch recommendation
  explicitly carries it forward through a bounded no-impact attestation.
- Bounded carry-forward is allowed only when an exhaustive intervening-diff review proves that no
  covered runtime surface changed, independent review approves that classification, and focused tests
  and lint cover the intervening changes. Any affected persona, chat, provider, authentication, memory,
  routing, or tool-context behavior requires a fresh receipt. Installer, public signing, and sealed
  security artifacts remain revision-bound and must name the exact candidate they cover.
- A release-record-only Markdown descendant does not change the frozen runtime revision or installer
  SHA-256. The eventual public hosted artifact and managed Deep Scan must instead be regenerated for
  and name the exact approved release-tag commit.
- Persona evidence requires a complete 30-result collection across 10 personas at >=95/100 after
  any explicitly documented independent semantic adjudication, plus either a fresh release-revision
  run or an approved bounded no-impact attestation. Never relabel a non-gating collection as a
  canonical deterministic seal. Claude Code/Codex/Hermes official user-auth canaries follow the
  same carry-forward rule. GO also requires zero unresolved Critical/High findings.
- Do not claim release approval, production readiness, an overall 9.5/10, or competitor superiority
  unless the current launch recommendation says GO for that same release.

### Evidence authority

Exact candidate revisions, installer and receipt hashes, carry-forward boundaries, open
checks, and the current verdict live only in
`docs/production-readiness/09-LAUNCH_RECOMMENDATION.md`. Do not duplicate an old
candidate table here or infer that an ancestor's installer certifies a later HEAD. The
repository remains private until an explicit open-source and licensing decision is made.
Public GO remains blocked until a publicly trusted Authenticode artifact and an exact-candidate
sealed managed Deep Security report close with no unresolved Critical/High findings.

### Key Technology Facts (Verified August 2026)

| Layer | Stack |
|---|---|
| Frontend | React **19** + TypeScript + Vite + Tailwind 4 + base-ui/react |
| Desktop | Tauri 2.0 (Rust shell) |
| Backend | Fastify sidecar (Node.js, bundled into Tauri) |
| LLM routing | Windows Solo release contract: bundled no-Python OpenAI-compatible proxy and smart router; optional LiteLLM deployment config |
| Database | SQLite via @waggle/core (better-sqlite3 + sqlite-vec-windows-x64) |
| Memory | FrameStore + HybridSearch + KnowledgeGraph + IdentityLayer + AwarenessLayer |
| Agent runtime | `packages/agent/src/agent-loop.ts` |
| Billing | Stripe (installed; `stripe@^21.0.1`) |
| Design | Hive DS — honey #e5a000 / hive-950 #08090c / accent #a78bfa |
| Tests | Vitest (unit) + Playwright (E2E) |
| Deploy | Windows Tauri installer release contract; optional Dockerfile + docker-compose.production.yml + render.yaml for server/team deployment |

Package manager: npm with the root `package-lock.json`. Source development requires Node
`^20.19.0 || >=22.12.0`; the packaged Windows desktop runtime is pinned to Node `22.23.2`.

---

## 2. Repository Structure (Verified)

### Top level
```
waggle-os/
├── app/                 # Tauri desktop shell (minimal React surface)
├── apps/
│   ├── web/             # <-- MAIN web app UI (this is where most components live)
│   └── www/             # Landing page (waggle-os.ai)
├── packages/            # 28 workspace packages (see below)
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

### Packages (`packages/`, 28 workspaces — verified 2026-08-02)
```
Core (15):
admin-web       cli             launcher        marketplace
agent           core            memory-mcp      optimizer
sdk             server          shared          waggle-dance
weaver          wiki-compiler   worker

hive-mind OSS source set (13 — curated forward-port target is marolinik/hive-mind; see §7.5):
hive-mind-core   hive-mind-cli   hive-mind-shim-core   hive-mind-mcp-server
hive-mind-wiki-compiler   hive-mind-hooks-core
hive-mind-hooks-{claude-code, claude-desktop, codex, codex-desktop,
                 cursor, hermes, openclaw}
```
> Note: the prior list said "16" and included `ui`, which has no `package.json`
> (not a workspace). The live count is 28: 15 product packages and 13
> `hive-mind-*` packages.

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

MOVED (2026-04-30 monorepo migration): the memory substrate `mind/` (db/schema/
  identity/awareness/frames/sessions/search/knowledge/scoring/reconcile/ontology/
  concept-tracker/entity-normalizer/evolution-runs/execution-traces/
  improvement-signals/embedding-provider/*-embedder) and `harvest/` (chatgpt/claude/
  claude-code/gemini/perplexity/pdf/plaintext/markdown/url/universal adapters +
  pipeline.ts + dedup.ts) now live at **packages/hive-mind-core/src/{mind,harvest}/**,
  NOT under packages/core/. The OSS mirror is curated from there through a maintainer-reviewed
  forward-port (§7.5); raw subtree branches are never publish sources.
```

For the deep-dive on what the mind/ substrate does, see [`docs/memory-architecture.md`](docs/memory-architecture.md).

### `packages/shared/src/`
```
types.ts         User, Team, AgentDef, Task, WaggleMessage
constants.ts     Team roles, job statuses
schemas.ts       Zod schemas
tiers.ts         TIERS + TierCapabilities (canonical 4-tier: TRIAL/FREE(Solo)/TEAMS/ENTERPRISE) + TIER_LABELS/tierLabel
mcp-catalog.ts   MCP server catalog
index.ts         Barrel
```

### `app/` (Tauri desktop shell)
```
app/src-tauri/                # Rust shell + capabilities/ + tauri.conf.json
app/scripts/                  # build/installer/signing TS tooling (tauri-tsc gate target)
```

**Note:** `app/` is now the Tauri Rust shell only — there is no `app/src/`. The
React cockpit UI moved to `apps/web` long ago; the desktop binary loads the
`apps/web` dist. All React UI lives in `apps/web/src/`.

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
npx tsc --noEmit --project packages/server/tsconfig.json   # sidecar — runs via tsx (transpile-only), so NOT typechecked by `npm run build`
npx tsc --noEmit --project app/tsconfig.json
npm run test -- --run
npm run lint
```
> `npm run build` typechecks **only `apps/web`**. The Fastify sidecar runs via
> `tsx` (transpile-only) — server-route type errors ship undetected unless you
> run the `packages/server` tsc above. (A real type error slipped through this
> way on 2026-05-28; see `docs/addictiveness-audit-2026-05-28/REDUNDANCY-AUDIT.md`.)

### Windows Solo release commands (PowerShell 7; final frozen clean checkout)

```powershell
# Local build-host preparation (the installed desktop has none of these prerequisites).
npm ci
npm ci --prefix app --ignore-scripts
npm run build:packages

# Local unsigned build only; this verifies packaging/runtime, not public trust.
npm --prefix app run tauri:build:win

# Optional internal-pilot build. Its private test root is not public trust.
npm --prefix app run tauri:build:win:pilot-signed

# Internal clean-profile certification. Omit public-signature requirements for a pilot.
pwsh -NoProfile -File scripts/certify-windows-installer.ps1 `
  -InstallerPath "<absolute-path-to-Waggle-setup.exe>" `
  -ExpectedSourceRevision "<40-character-final-HEAD>" `
  -VerifyManagedModel
```

Production signing is hosted-only. Do not run `new-windows-signing-handoff.ps1`,
`sign-windows-artifact.ps1`, or a local thumbprint-signing substitute to create a
release artifact. `.github/workflows/release.yml` is authoritative and must run from
an approved exact release tag. Its Windows chain is `build-windows-prebuilt` ->
`prepare-windows-signing` -> `sign-windows` -> `certify-windows` ->
`attest-windows` -> `publish-windows`.
`sign-windows` requires Azure Artifact Signing OIDC variables, a federated credential
scoped to the exact approved tag ref, and the least-privilege certificate-profile signer
role. Before Azure authentication, it must bind the push event, repository, tag,
workflow ref/SHA, clean checkout, and fresh `origin/main` ancestry. Signing may produce
private Actions artifacts, but public attestation and `publish-windows` remain disabled
while the repository is private; publication additionally requires
`WINDOWS_PUBLIC_RELEASE_AUTHORIZED` to be explicitly `true`. The existing `production`
environment isolates public-attestation OIDC claims from the exact-tag Azure signer.
Private repositories require GitHub Enterprise Cloud for GitHub artifact attestations,
so the sealed certified artifact is the terminal private-repository output. The approved
signer subject and timestamp must still pass before credential-free certification.
Never treat the local certification command as signed or change repository visibility
without an explicit OSS/licensing decision.
The certified installed desktop must not depend on developer Node.js, Python,
Docker, external LiteLLM, or a separately installed Ollama.

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

### Shipped (22 personas — data in `persona-data.ts`, logic in `personas.ts`)
The original 13 + 4 universal/orchestration + 5 domain personas all shipped.
The PersonaSwitcher groups them into **two tiers** (`apps/web/src/lib/persona-tier.ts`):

**Universal Modes (8 — always available in every workspace):**
general-purpose, planner, verifier, coordinator, researcher, writer, analyst, coder
- **general-purpose** — versatile default, full tool access
- **planner** — read-only strategic planning, no file writes (`isReadOnly`)
- **verifier** — adversarial QA, read-only, VERDICT output format (`isReadOnly`)
- **coordinator** — pure orchestrator, spawn/list/get_agent_result only (gated by `FEATURE_FLAGS.COORDINATOR_MODE`)

**Specialists (14 — template-scoped via `TEMPLATE_SPECIALISTS`):**
project-manager, executive-assistant, sales-rep, marketer, product-manager-senior,
hr-manager, legal-professional, finance-owner, consultant, support-agent,
ops-manager, data-engineer, recruiter, creative-director

> Note: the onboarding picker (`onboarding/constants.ts` → `ALL_ONBOARDING_PERSONAS`)
> intentionally surfaces only **19** of the 22 — it omits planner/verifier/coordinator
> (read-only/orchestration modes don't make sense as a workspace's *starting* brain) and
> uses its own 3-way grouping (universal/knowledge/domain). Same canonical personas, a
> different view for a different UI moment. `persona-data.ts` is the single source of truth.

**Split is done:** `persona-data.ts` holds the pure `PERSONAS` array;
`personas.ts` exports the `AgentPersona` interface and logic only.

### AgentPersona Interface — Shipped Fields (verified `personas.ts`)
```typescript
interface AgentPersona {
  // core
  id, name, description, icon, systemPrompt, modelPreference,
  tools: string[], workspaceAffinity: string[],
  suggestedCommands: string[], defaultWorkflow: string | null,
  // guardrails + picker metadata (all optional, all shipped)
  disallowedTools?: string[]      // denylist — overrides tools[] on conflict
  failurePatterns?: string[]      // documented failure modes — shown in hover tooltip
  isReadOnly?: boolean            // true = no write tools after applyPersonaToolFilter/filterMcpToolsForPersona
  tagline?: string                // one sentence for picker hover
  bestFor?: string[]              // 3 example tasks in user-facing language
  wontDo?: string                 // hard boundary statement
  suggestedSkills?: string[]      // installable from marketplace
  suggestedConnectors?: string[]  // connector IDs
  suggestedMcpServers?: string[]  // MCP server names from mcp-registry
}
```

---

## 6. Onboarding & PersonaSwitcher (correct paths)

### OnboardingWizard
**Path:** `apps/web/src/components/os/overlays/OnboardingWizard.tsx`
(NOT `app/src/components/onboarding/` — that path doesn't exist.)

Shipped: 6-step flow (`first-launch → who-are-you → model-gate → memory-import →
template → first-task`). The 15 TEMPLATES + the `TEMPLATE_PERSONA` mapping (template →
one default persona id) live in `overlays/onboarding/constants.ts`, wired to the
canonical persona ids from `persona-data.ts`. The wizard surfaces a **curated 6** of the
15 (`CURATED_ONBOARDING_TEMPLATES`) for the ≤2-min flow; the full 15 are reachable from
the workspace gallery later. (Picker persona roster = `ALL_ONBOARDING_PERSONAS`, the
19-of-22 view noted in §5.)

### PersonaSwitcher
**Path:** `apps/web/src/components/os/overlays/PersonaSwitcher.tsx`

Shipped (M-01): Two-tier layout — "UNIVERSAL MODES" (8, from `UNIVERSAL_MODE_IDS`) +
"YOUR WORKSPACE SPECIALISTS" (template-scoped via `getSpecialistsForTemplate` in
`lib/persona-tier.ts`). Hover tooltip (`buildPersonaTooltip`, `lib/persona-tooltip.ts`)
shows tagline + bestFor + wontDo. "Create Custom Persona" inline form POSTs to
`/api/personas`.

---

## 7. Security Constraints (Non-Negotiable)

1. **Vault-only secrets.** API keys belong in Vault or an untracked local `.env`, never in Git. `.env.example` may contain non-secret development defaults, but never usable credentials or secrets.
2. **Injection defense.** `scanForInjection()` from `injection-scanner.ts` MUST be called on all connector/external input.
3. **No eval, no dynamic require.** Tauri WebView is restricted.
4. **Tauri IPC allowlist.** Explicit in `app/src-tauri/capabilities/`. Never `allowlist: all: true`.
5. **Parameterized queries.** No string interpolation in SQL. Ever. better-sqlite3 supports parameters.
6. **KVARK contact data.** Submits to your API only — no third-party form services.
7. **Secrets in `packages/core/src/vault.ts`** — use it; don't build parallel secret stores.

---

## 7.5. Memory Substrate Sync (waggle-os → hive-mind, curated forward-port)

The memory substrate lives at **`packages/hive-mind-core/src/{mind,harvest}/`** (moved from
`packages/core/src/` in the 2026-04-30 monorepo migration). The public OSS mirror at
[`marolinik/hive-mind`](https://github.com/marolinik/hive-mind) is **generated FROM** this monorepo
via a **maintainer-curated forward-port** (NOT a mechanical `git subtree split` — see the
correction below). The mirror uses its own curated layout (`packages/core`, co-located tests,
rewritten imports) and **excludes** Waggle-proprietary content (see the exclusion list below).

=== CRITICAL — sync policy (founder-ratified 2026-06-11) ===
**The monorepo is the SOLE source of truth for the substrate. Never author substrate features
directly on the OSS mirror.** Parity is NOT automatic — it broke once: the cross-encoder reranker
(`inprocess-reranker.ts` + HybridSearch options) was written directly on `marolinik/hive-mind`
during the LoCoMo benchmark arc and existed ONLY there, discovered by the W4 recon and
reverse-ported in W4.2 (`f47ee8f`). Rules:
1. Substrate changes land in `packages/hive-mind-core/` here FIRST; the mirror is updated
   through a reviewed, maintainer-curated forward-port afterward.
2. Benchmark/experiment work in a `D:/Projects/hive-mind` checkout is throwaway unless
   reverse-ported here — port it the same arc, don't let it sit.
3. Run **`scripts/oss-drift-check.sh`** (file-level diff of the mapped src trees) before every
   OSS release push and after any arc that touched a hive-mind checkout.
4. External PRs on the OSS repo are fine — the maintainer intentionally ports accepted changes
   back here first, then prepares the next curated forward-port.
=== END CRITICAL ===

=== CORRECTION — how the sync ACTUALLY works (2026-06-12 drift analysis) ===
The prior text here claimed the mirror is produced by `scripts/oss-subtree-split.sh` and that a
"subtree-split filter" handles the must-not-export files. **Both were false** (verified
2026-06-12, `docs/ux-refactor/oss-sync-finding-2026-06-12.md`):
- `scripts/oss-subtree-split.sh` produces RAW per-package branches with the WRONG layout
  (`packages/hive-mind-core`, not the mirror's `packages/core`) and **no file filter ever
  existed**. A raw split + push would have **leaked proprietary IP**. The script now carries a
  hard ABORT guard (refuses to emit a branch containing the proprietary files) + a deprecation
  header; it is for inspection / as a curation starting point ONLY, never a direct push source.
- **The real sync is a hand-curated forward-port** onto a maintainer feature branch in the OSS
  clone (e.g. `feature/mono-parity-YYYY-MM-DD`): adapt the layout, rewrite imports, and STRIP the
  excluded content. That curation — not a filter — is what keeps proprietary content out.

**OSS-EXCLUDED (must NOT reach the public mirror):**
- Files: `vault.ts`, `evolution-runs.ts`, `execution-traces.ts`, `improvement-signals.ts`,
  `compliance/**` (vault/compliance live in `@waggle/core`; the other three are barrel-exported
  from `hive-mind-core` but stripped on export). Enforced by the script's abort guard.
- **Interleaved:** the `install_audit` table DDL + its rebuild migration inside
  `mind/{schema.ts,db.ts}` are ALSO excluded (capability-install trust trail / EU-AI-Act
  compliance — Waggle governance, not generic substrate). A file filter cannot catch this; only
  the curated edit strips it. **Consequence:** substrate changes confined to `install_audit`
  (e.g. P5/D4 `'uninstalled'`, #15 `trust_source` CHECK) have **nowhere to land on the mirror —
  do NOT treat them as a pending OSS port.**
=== END CORRECTION ===

**To work on the substrate or publish the OSS mirror:** see
[`packages/hive-mind-core/CONTRIBUTING.md`](./packages/hive-mind-core/CONTRIBUTING.md),
[`scripts/oss-subtree-split.sh`](./scripts/oss-subtree-split.sh) (inspection/guard only), and
[`scripts/oss-drift-check.sh`](./scripts/oss-drift-check.sh) (run before every release; its
snapshot-dependent `ONLY-IN-*`/`DIFFERS` results include expected layout, import, logger, and
branding adaptations, but every entry must still be classified before an OSS release).

**Deprecated (do not rely on; do not delete):** the old dual-repo bidirectional-sync workflows
`.github/workflows/{mind-parity-check,sync-mind}.yml` and the `.github/sync.md` manual are **preserved
as deprecation anchors** from when the substrate was duplicated across two repos. Their trigger paths
(`packages/core/src/{mind,harvest}/**`) no longer exist, so they never fire; each carries a DEPRECATED
header explaining the migration. Leave them in place for audit trail.

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
| `packages/core/src/vault.ts` | Secret storage |
| `packages/core/src/telemetry.ts` | Telemetry pipeline |
| `packages/hive-mind-core/src/harvest/pipeline.ts` | Harvest adapters + dedup |
| `packages/core/src/compliance/` | Compliance + audit |
| `apps/web/src/components/os/` | Main desktop cockpit UI loaded by Tauri |

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
- `tiers.ts` shipped with a 5-tier system (TRIAL/FREE/PRO/TEAMS/ENTERPRISE). _Superseded 2026-07-05: PRO removed, now 4-tier TRIAL/FREE(Solo)/TEAMS/ENTERPRISE — see §1._
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
- Phase 0 — Tool detection PoC (`packages/agent/src/tool-detection.ts`) for eight registered AI-tool surfaces, hermetic + cross-platform. Registration is broader than release support.
- Phase 1A — WaggleDance v2 dispatcher branches wired (discovery/routed_share/model_recipe/knowledge_match/task_claim/model_recommendation).
- Phase 1B — Local sidecar surface (`/api/waggle-dance/signal` + `/signals`), SignalBus ring buffer, personal-tier-eligible.
- Phase 1C — Bridge: v2 bus → existing `/api/waggle/signals` UI stream (zero frontend changes).
- Phase 1D — Shim-core signal emitter library (`@waggle/hive-mind-shim-core` `maybeEmitDiscovery`).
- Phase 1E — claude-code Stop hook wired to `maybeEmitDiscovery` (opt-in via `WAGGLE_SIGNAL_EMIT`).
- Phase 2A — Launcher backend (`/api/tools/launch`, `/api/tools/hooks`).
- Phase 2B — LauncherApp dock surface (`apps/web/src/components/os/apps/LauncherApp.tsx`).
- Phase 3 — Skill diffusion (D1 fire → `skill_share` broadcast via `onSkillDistillationFire` callback).
- Phase 4 — Eight-tool inventory/detection surface + Mission Control tile + Memory provenance badge + launch-with-prompt textarea + process tracker / 'Running' badge. The in-scope agent-integration release cohort is Claude Code, Codex, and Hermes; Cursor and OpenClaw are roadmap-only.

End-to-end: detect → install hooks (reversible) → launch with `WAGGLE_WORKSPACE_ID` env → hook captures → shim emitter → bus → bridge → UI. Rollback tag: `checkpoint/pre-ai-os-2026-05-20`. AI-OS exploration doc: `docs/plans/AI-OS-EXPLORATION-2026-05-19.md`.

### Open Work
| # | File | What |
|---|---|---|
| 1 | Spawn Agent + Dock wiring | P36 already wired in `Dock.tsx`+`Desktop.tsx`; P35 third-tier fallback (LiteLLM → runtime model → provider catalogs) landed `14942be`. Residual: runtime verification on a clean install. |
| 2 | Light mode finish | P40/P41 + CR-2 — semantic-token migration is done (no hive-950 references except a comment); remaining issues are render-time fine-tuning (BootScreen visual polish + a few header-styling judgments) that need a binary build to validate. |
| 3 | External-tool release cohort | **Windows Solo scope fixed 2026-08-02.** Claude Code, Codex, and Hermes are the in-scope agent-integration cohort. Cursor and OpenClaw implementations remain in-tree as roadmap work and are fail-closed in production surfaces. Claude Desktop, Codex Desktop, and Hermes Desktop are convenience launch surfaces, not separate agent-acceptance targets. |

**Closed during May 2026 backlog sweep:**
- ✅ OW-6 PersonaSwitcher two-tier — shipped via M-01 (`PersonaSwitcher.tsx` + `lib/persona-tier.ts` + `lib/persona-tooltip.ts`); 26/26 tests passing
- ✅ CR-7 CLAUDE.md §10 update (this entry)
- ✅ P35 Spawn Agent "no models available" (`14942be`)
- ✅ QW-1..QW-5 quick wins (all already shipped per `grep` verification)
- ✅ CR-2 hive-950 → semantic tokens (only comment-level refs remain)
- ✅ M7 Stripe products — both test (`acct_1SzHlbC0mmjh4oEM`) and live (`CNCrMQy1f7`) accounts hold the full 2 products × 2 prices (monthly + annual) with `pro_monthly` / `pro_annual` / `teams_monthly` / `teams_annual` lookup keys. Verified via `stripe products list` + `stripe prices list`. Live price IDs documented in `docs/launch/drafts/2026-05-12-apps-www-deployment-readiness.md`. _Note (Solo-vs-Team collapse 2026-07-05): the PRO products/prices are **retained in Stripe for legacy-sub servicing only** — no new PRO checkout is offered. Only TEAMS is an active checkout price._
- ✅ E-10 Stripe tier-enforcement wiring — webhook handler was already complete (signature + idempotency + 3 event handlers in `packages/server/src/stripe/webhook.ts`); session closed the residual gap by extending `tierFromPriceId()` in `packages/server/src/stripe/index.ts` to resolve the full 4-var contract (`STRIPE_PRICE_PRO_MONTHLY` / `_ANNUAL` / `STRIPE_PRICE_TEAMS_MONTHLY` / `_ANNUAL`) alongside legacy single-vars + `STRIPE_PRICE_BASIC`. 17/17 webhook tests green; annual subscriptions now resolve through the webhook. _Note (Solo-vs-Team collapse 2026-07-05): `tierFromPriceId()` still reads the legacy PRO/BASIC price envs, but now maps them → `'FREE'` (Solo) so a legacy PRO subscriber lands on Solo rather than a removed tier. Only TEAMS resolves to a paid tier._
- ✅ M2 Claude export — `data-ffbb9f0b-…batch-0000.zip` (30 MB) on Desktop\MEMORIES\Claude\, dated 2026-04-17. Ready for E-11 ingestion.
- ✅ M3 Gemini export — `takeout-20260416T224803Z-3-001.zip` (437 MB) on Desktop\MEMORIES\Google\, dated 2026-04-17. Ready for E-11 ingestion.
- ⏭️ M1 ChatGPT export — skipped by Marko 2026-05-21 (export emails never arrived after multiple requests).
- ⏭️ M4 Perplexity export — skipped by Marko 2026-05-21 (research-burst usage; marginal corpus contribution).
- ✅ M6 judge roster — Opus 4.7 / GPT-5.4 / Gemini 2.5 Pro / Haiku 4.5 locked 2026-05-21.
- ✅ C-1 LoCoMo Memory SOTA — **CURRENT CANONICAL: 86.49% overall** (7-lane W4, Memori *same-judge* protocol — GPT-4.1-mini answerer+judge, N=1540), **+4.54pp over Memori 81.95** (z=4.64, p<10⁻⁵), leading/tying every category. Mem0 re-run on our ruler = **73.96** overall (**temporal +30.8pp** landslide; write-time dating vs Mem0 ingestion-time). **CORRECTED 2026-07-01: the prior 87.66% did NOT reproduce on a fresh judge pass (stale-verdict-replay inflation; archived-substrate 85.19% / current 86.49%). 86.49% is the fresh reproducible number** — pinned + offline-verifiable at [`benchmarks/results/locomo-sota-2026-06/`](benchmarks/results/locomo-sota-2026-06/) (`node recount.mjs` → 1332/1540); record in `docs/analysis/locomo-87.66-vs-85.26-integrity-2026-06-30.md`. Paper/arXiv in [`docs/paper/`](docs/paper/); OSS `marolinik/hive-mind` @ `bc4eba1`, PR #14.
  - ~~_SUPERSEDED (v5 self-judge, N=320, 2026-05-11): 73.1% Opus 4.7 / 73.4% Qwen3.6, +4.6pp over Mem0 paper; trio-strict 67.8% AND-of-3. The 73.1/73.4 self-judge convergence + 67.8 trio-strict remain valid as the conservative v5-arc framing but are no longer the headline. See `D:/Projects/hive-mind-test/scripts/locomo/data/reports/RESULT-v5-2026-05-11.md`._~~
- ✅ C-2 Substrate Claim — done 2026-04-25: Stage 3 v6 N=400, Fisher one-sided p = 8.07 × 10⁻¹⁸, +19.25pp retrieval-vs-no-context lift. "GEPA Full-System canary" expansion explicitly DROPPED 2026-04-30 per PM strategic reset. See `D:/Projects/waggle-os-gaia2-wt/benchmarks/results/stage3-n400-v6-final-analysis.md`.

### Closed 2026-05-21 (E-14 + audit-trail surfacing)

- ✅ **E-14 hive-mind v0.3.0 promotion** — shipped on `marolinik/hive-mind` in 3 commits + 1 annotated tag (`b5c1e8f` wiki-web port, `842f390` benchmarks/locomo, `507e0cf` release commit, tag `v0.3.0`). README + CHANGELOG refreshed, 9 versions at 0.3.0, npm install + tsc build clean, vitest 308/312 (4 pre-existing dispatch.test.ts failures documented as v0.3.x followup — same on baseline `20bce16` so not session-induced). Substrate-claim evidence (LoCoMo 73.1% + Fisher p=8.07e-18) now publicly visible. Unblocks S-1 (OSS launch timing) — "before Waggle" is the default since the substrate claim is now public.

### New open work surfaced 2026-05-21

| # | Item | What |
|---|---|---|
| C-3 (reframed) | Full GAIA 2 Phase 4 benchmark | Phase 3 closed in HALT 2026-04-30 (commit `104aa5a` in `waggle-os-gaia2-wt`). Probe showed $4.09/invocation (9-31× over original estimate), narrow-proxy adapter approach economically non-viable. Phase 4 needs Docker + ARE proper agentic execution environment + new adapter strategy. Real engineering arc — scope + budget recalibrate pending Phase 4 design. |

For the full polish+launch backlog see `docs/plans/BACKLOG-CONSOLIDATED-2026-04-17.md` (~145 items; ~50% are stale-but-done per the May 2026 verification sweep) and the AI-OS arc in `docs/plans/AI-OS-EXPLORATION-2026-05-19.md`.

---

## 11. Glossary

| Term | Definition |
|---|---|
| Hive DS | Waggle design system — honey/hive-950/accent tokens in `waggle-theme.css` |
| FrameStore | SQLite-backed memory frame storage (`packages/hive-mind-core/src/mind/frames.ts`) |
| HybridSearch | Vector + keyword search (`packages/hive-mind-core/src/mind/search.ts`) |
| KnowledgeGraph | Entity-relation graph (`packages/hive-mind-core/src/mind/knowledge.ts`) |
| IdentityLayer | Personal identity persistence (`packages/hive-mind-core/src/mind/identity.ts`) |
| AwarenessLayer | Active task/state tracking (`packages/hive-mind-core/src/mind/awareness.ts`) |
| Cognify | Memory extraction pipeline (`packages/agent/src/cognify.ts`) |
| Harvest | Conversation/file ingestion (`packages/hive-mind-core/src/harvest/`) |
| Mind | Per-workspace persistence layer (`packages/hive-mind-core/src/mind/`) |
| BEHAVIORAL_SPEC | Core agent rules (`packages/agent/src/behavioral-spec.ts`) |
| Sidecar | Node.js Fastify server bundled into Tauri (`/sidecar`) |
| KVARK | Egzakta sovereign enterprise AI — top of the Waggle funnel |
| LiteLLM | Optional server/team deployment proxy config (`litellm-config.yaml`); Windows Solo uses the bundled no-Python proxy and smart router |
| WaggleDance | Multi-agent coordination package (`packages/waggle-dance`) |
| Weaver | Memory consolidation and session-skill extraction engine (`packages/weaver`) |
| Evolution | Self-improvement subsystem (`evolution-*.ts`, `judge.ts`, `iterative-optimizer.ts`) |
| applyPersonaToolFilter / filterMcpToolsForPersona | Enforced local and MCP per-persona allowlist/denylist filtering (`packages/server/src/local/persona-tool-filter.ts`) |

---

Maintained by Marko Markovic · Egzakta Group · April 2026
waggle-os.ai · www.kvark.ai
