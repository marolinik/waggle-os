# PM Sync — Pre-Day-0 Two-Repo Survey

**Date:** 2026-05-05
**Scope:** `D:\Projects\waggle-os` (proprietary monorepo, branch `main`) + `D:\Projects\hive-mind` (Apache 2.0 OSS, branch `master`)
**Author:** CC inventory pass, no mutations to either repo
**Purpose:** Sync PM-Claude (working pre-launch sprint outside repos) to current code-side state

---

## §1 — waggle-os repo state

```
Branch:    main ... origin/main (in sync, no ahead/behind)
HEAD:      ceeb601 fix(www): explicit element overrides for Clerk dark theme (apps/www has no Tailwind)
Untracked: .agents/skills/, benchmarks/gaia2/, external/  (all pre-existing, ignored at gitignore level)
Tracked:   CLEAN — no modified, no staged
```

`git fetch` pulled new branches and tags from origin during this survey:

| New branch from fetch | Likely owner |
|---|---|
| `faza-1-audit-recompute` | Faza 1 closure work |
| `feature/c3-v3-wrapper` | Sprint 12 Task 2.5 Stage 3 |
| `gepa-faza-1` | GEPA Faza 1 |
| `phase-5-deployment-v2` | Phase 5 (canary semantika dropped 2026-04-30 per memory) |
| `sprint-10/task-1.2-sonnet-route-repair` | Sprint 10 Task 1.2 |

| New tag from fetch | What it pins |
|---|---|
| `checkpoint/pre-self-evolution-2026-04-14` | Durable rollback before Phase 1-7 self-evolution mission |
| `v0.1.0-faza1-closure` | Faza 1 closure point |
| `v0.1.0-phase-5-day-0` | Phase 5 Day-0 cut (likely the originally-intended Day-0 reference) |
| `v0.1.0-pre-monorepo-migration` | Snapshot before Sesija B monorepo migration |

### Recent local commit chain (last 15)

```
ceeb601  fix(www): explicit element overrides for Clerk dark theme (apps/www has no Tailwind)
73886f8  fix(www): wire Clerk dark baseTheme so /sign-in and /sign-up text is legible
9ce62c5  docs(www): fix Next.js dev command in §5.3 manifest (npm workspace flag, not Next flag)
6d430d1  docs(www): Sesija E §5.3 manifest with smoke test + production webhook plan
a087cf6  feat(www): connect Stripe Customer to Clerk user metadata (test mode, lazy-create pattern)
0147d6c  chore(www): provision Stripe test-mode prices via CLI (Sesija E §5.3 Phase A)
d281a86  feat(www): wire Clerk auth UI in navbar + account page
4365897  feat(www): scaffold Clerk integration
87b1637  docs(methodology): strip Draft header + correct OSS distribution refs (hive-mind canonical)
04745b7  feat(www): /docs/methodology Next.js route + sitemap.xml (Sesija D §4.1)
c353e49  docs(www): Sesija D manifest + verification artifacts (§4 final)
8ecddff  feat(www): Path D landing decoupling — arxiv → methodology in Trust + Footer (Sesija D §3.4)
7d1e0fc  docs: add methodology documentation (Day 0 Trust Band link target, Path D landing decoupling)
b716b04  feat(www): Lighthouse audit pass — Performance 96 / Accessibility 96 / SEO 100 (Sesija D §3.3)
9d7f5c9  feat(www): next-intl + full i18n extraction (Sesija D §3.2)
```

### Local branches with drift vs origin

| Branch | Local sha | Tracking | Notes |
|---|---|---|---|
| `main` | `ceeb601` | `[origin/main]` ✅ in sync | This session's HEAD |
| `feature/hive-mind-monorepo-migration` | `a10867c` | `[origin/feature/hive-mind-monorepo-migration]` | Phase 5 Sesija B closing trio §2.5+§2.6+§2.7 logged |
| `feature/apps-web-integration` | `447f5ac` | (worktree at `D:/Projects/waggle-os-sesija-A`) | Sidecar bundle refresh |
| `feature/gaia2-are-setup` | `104aa5a` | (worktree at `D:/Projects/waggle-os-gaia2-wt`) | Gaia2 Phase 3 closure |
| `faza-1-audit-recompute` | `639752e` | local-only on this clone, fetched today | Faza 1 final κ_trio recompute |
| **12 oss-export branches** | (see §8a SHA terminus table) | local-only export sources | Subtree-split sources for hive-mind sync |

---

## §2 — waggle-os CLAUDE.md audit

`CLAUDE.md` is 11 sections, 491 lines, dated April 2026 (last verified Sprint Status timestamp).

### Section structure

1. How to use this file
2. What Waggle OS actually is (incl. tier table, key tech facts)
3. Behavioral rules (3.1-3.8: think before coding, simplicity, surgical changes, goal-driven, context discipline, check before create, output discipline, **handoff discipline**)
4. Pre-work protocol
5. Persona architecture (current 13 → target 17, AgentPersona interface)
6. Onboarding & PersonaSwitcher (correct paths)
7. Security constraints (non-negotiable: vault-only secrets, injection scanner, no eval, Tauri IPC allowlist, parameterized queries, KVARK contact data via own API)
8. Already built — do not recreate (file inventory)
9. KVARK integration (canonical copy + URLs)
10. **Sprint status (April 2026)** — what landed, open work
11. Glossary

### Mentions audit (deferred / TODO / post-launch / Day-2 / TBD)

| Phrase | Where | Context |
|---|---|---|
| "PromptAssembler v5 PoC complete" | §10 What Landed | H1 replicates under 4-judge no-Claude ensemble; PA enabled for Claude, optional for Gemma, experimental for Qwen-thinking |
| "Stripe webhooks / server side" — open | §10 Open Work #2 | "Wire Stripe to tier enforcement — blocked on Marko creating Stripe products (M7 in consolidated backlog)." **Status: now partially done — checkout + webhook routes shipped this session in Sesija E §5.3, but tier-enforcement gating in app code is separate from M7 dashboard products** |
| "Spawn Agent + Dock wiring" — open | §10 Open Work #3 | "P35/P36 core bugs from PDF triage — 'no models available' in SpawnAgentPanel + dock spawn-agent icon click. Polish-sprint Phase B." |
| "Light mode finish" — open | §10 Open Work #4 | "P40/P41 + CR-2 — BootScreen logo/animation in light mode, header text styling, remaining hive-950 → semantic tokens. Polish-sprint Phase B." |
| "Day-2 polish backlog" reference | §10 footer | Points at `docs/plans/POLISH-SPRINT-2026-04-18.md` for sprint sequencing and `docs/plans/BACKLOG-CONSOLIDATED-2026-04-17.md` (~145 items) for full backlog |

### Benchmark gate / pricing / OSS extraction / branch architecture references

- **Benchmark gate**: NO explicit "Day 0 benchmark gate" named in CLAUDE.md. The Sprint 12 / Stage 3 work in `feature/c3-v3-wrapper` has its own gates documented externally (e.g. `docs/plans/SPRINT-10-CLOSEOUT-2026-04-22.md`). MEMORY.md references several pilot/halt gates but no Day-0-specific one.
- **Pricing**: §1 tier table is canonical (TRIAL/FREE/PRO/TEAMS/ENTERPRISE). §10 notes that Stripe is installed (`stripe@^21.0.1`). Sesija E §5.3 (this session) provisioned the actual test-mode prices in Stripe + wired the checkout/webhook routes. Production live keys + Dashboard webhook endpoint are flagged for Marko-side ponedeljak 14:00.
- **OSS extraction**: §1 mentions hive-mind exists at `https://github.com/marolinik/hive-mind` and is the open-source memory engine. CLAUDE.md does NOT have a section dedicated to OSS extraction status — that's in EXTRACTION.md (hive-mind side) and the `feature/hive-mind-monorepo-migration` branch (waggle-os side).
- **Branch architecture**: NOT documented in CLAUDE.md. The 12 oss-export branches + the migration feature branch + worktrees pattern is implicit in the repo, not codified.

### Stale items in CLAUDE.md §10

Per `docs/REMAINING-BACKLOG-2026-04-16.md` item **CR-7**: "CLAUDE.md update — Section 10 'Open Work' is stale, shows items as TODO that are DONE". Confirmed during this audit — the 4 open items (PersonaSwitcher, Stripe, Spawn, Light mode) are all from mid-April; some have moved since.

---

## §3 — waggle-os backlog docs inventory (`docs/`)

26 files matching BACKLOG / DAY-2 / ROADMAP / PLAN / MILESTONE / INVESTIGATION:

| File | Bytes | Last modified | Inferred status |
|---|---:|---|---|
| `docs/DAY-2-BACKLOG-2026-05-01.md` | 13586 | 2026-05-01 03:21 | OPEN — most recent Day-2 backlog (5 days old) |
| `docs/MILESTONE-LAUNCH-STORY-VALIDATED-2026-04-30.md` | 8704 | 2026-04-30 19:36 | LIKELY OPEN — pre-launch milestone validation |
| `docs/ONBOARDING-DAY-2-BACKLOG-2026-04-30.md` | 9017 | 2026-05-01 00:50 | OPEN — onboarding-specific Day-2 carry-over |
| `docs/ONBOARDING-INVESTIGATION-2026-04-30.md` | 13196 | 2026-04-30 20:02 | LIKELY CLOSED — produced the Day-2 backlog above |
| `docs/REMAINING-BACKLOG-2026-04-16.md` | 16552 | 2026-04-17 01:59 | PARTIALLY SUPERSEDED — many items rolled into newer files; still useful as historical baseline |
| `docs/addiction-features/05-milestone-cards.md` | 5833 | 2026-05-01 02:20 | OPEN — milestone cards UI feature spec |
| `docs/plans/APP-DIR-AUDIT-2026-04-19.md` | 6755 | 2026-04-20 00:24 | LIKELY CLOSED |
| `docs/plans/BACKLOG-CONSOLIDATED-2026-04-17.md` | 16353 | 2026-04-17 14:39 | SUPERSEDED by BACKLOG-MASTER-2026-04-18 |
| `docs/plans/BACKLOG-FULL-2026-04-18.md` | 19625 | 2026-04-18 10:12 | SUPERSEDED by BACKLOG-MASTER-2026-04-18 |
| `docs/plans/BACKLOG-MASTER-2026-04-18.md` | 56118 | 2026-04-18 15:30 | LIKELY CANONICAL — largest, most recent April backlog |
| `docs/plans/BACKLOG-RECONCILIATION-2026-04-19.md` | 6734 | 2026-04-19 21:15 | LIKELY CLOSED |
| `docs/plans/COMPLIANCE-AUDIT-2026-04-20.md` | 3699 | 2026-04-20 05:02 | LIKELY CLOSED |
| `docs/plans/FILE-TOOLS-AUDIT-2026-04-20.md` | 4415 | 2026-04-20 05:08 | LIKELY CLOSED |
| `docs/plans/H-AUDIT-1-DESIGN-DOC-2026-04-22.md` | 20067 | 2026-04-21 18:48 | LIKELY OPEN — Sprint 11 H-AUDIT design |
| `docs/plans/HARVEST-AUDIT-2026-04-20.md` | 8186 | 2026-04-20 03:23 | LIKELY CLOSED |
| `docs/plans/L-17-placeholder-audit-2026-04-19.md` | 2977 | 2026-04-20 00:50 | CLOSED — "shipped concrete fixes in 2026-04-20 cleanup pass" |
| `docs/plans/M-13-NOTION-DECISION-2026-04-20.md` | 5374 | 2026-04-20 04:46 | LIKELY CLOSED |
| `docs/plans/MOCK-STUB-AUDIT-2026-04-19.md` | 6515 | 2026-04-19 23:07 | LIKELY CLOSED — categorizes TODOs into spurious vs genuine |
| `docs/plans/OPUS-4-6-ROUTE-AUDIT.md` | 5654 | 2026-04-21 11:20 | LIKELY CLOSED |
| `docs/plans/PDF-AUDIT-2026-04-20.md` | 8456 | 2026-04-20 03:07 | LIKELY CLOSED |
| `docs/plans/PDF-DEFERRED-DECISIONS-2026-04-19.md` | 12161 | 2026-04-19 21:50 | DEFERRED items captured |
| `docs/plans/PDF-E2E-ISSUES-2026-04-17.md` | 3595 | 2026-04-17 04:18 | LIKELY CLOSED |
| `docs/plans/PLAN-2026-04-19-TO-DO.md` | 4954 | 2026-04-20 03:04 | LIKELY CLOSED — daily plan pattern |
| `docs/plans/POLISH-SPRINT-2026-04-18.md` | 5290 | 2026-04-18 00:46 | LIKELY OPEN per CLAUDE.md §10 reference |
| `docs/plans/SPRINT-10-CLOSEOUT-2026-04-22.md` | 11268 | 2026-04-21 17:44 | CLOSED |
| `docs/plans/STAGE-2-PREP-BACKLOG.md` | 6749 | 2026-04-21 04:04 | SUPERSEDED — Stage 2 retry already executed |
| `docs/plans/WIKI-V2-AUDIT-2026-04-20.md` | 9377 | 2026-04-20 04:37 | LIKELY CLOSED |

**Pattern observed:** docs/plans/ has 21 plan/audit files, mostly mid-to-late April. Two clusters: (a) audits that produced concrete fixes already shipped (L-17, MOCK-STUB, PDF, etc.); (b) live backlogs (BACKLOG-MASTER-2026-04-18, POLISH-SPRINT, DAY-2-BACKLOG-2026-05-01). Status fields in headers were not consistently parsed for this inventory — content reads required for definitive state.

---

## §4 — waggle-os open work signals (grep)

Top hits for `TODO|FIXME|XXX|HACK|DEFERRED|POST-LAUNCH` across `*.ts`, `*.tsx`, `*.md`:

### Concentrated in three doc files

- **`docs/REMAINING-BACKLOG-2026-04-16.md`** — 18 TODOs identified in inventory, most around: Obsidian/Notion adapter, wiki UI dashboard, PDF generation route + branding, harvest streaming/resumability, identity auto-populate, persona switcher two-tier redesign (OW-6), hive-mind source extraction (Block 9.3 — "scaffold DONE, extraction TODO" with CR-6 noting 2-3 day estimate).
- **`docs/HIVE-MIND-INTEGRATION-DESIGN.md`** — TODOs for connector adapters: Cursor (filesystem scan), Windsurf (filesystem scan), Codex (TBD on OpenAI export API), Antigravity (TBD on session format), VS Code + Continue (filesystem scan).
- **`docs/plans/MOCK-STUB-AUDIT-2026-04-19.md`** — categorizes existing TODO markers. Genuine TODOs called out: Clerk verification once `CLERK_SECRET_KEY` is always configured (resolved as of Sesija E §5.0), `riskClassifiedAt` tracking in workspace config, `tokensUsed` per-session tracking.

### Source-code TODOs

Genuine code-level TODOs from the audit:
- **`packages/agent/src/evolution-gates.ts:17` and `:261`** — TODO is *in a regex / doc comment* describing a feature that detects placeholder TODO markers in evolved prompts. NOT a real TODO; it's the feature's content itself.
- **`packages/server/src/local/routes/skills.ts:773`** — `TODO: implement` is a *template string returned to the user* when they create a new tool. User-facing scaffold, not Waggle's TODO.
- **`packages/agent/src/cognify.ts`** (per audit) — workspace risk classification date not tracked yet.

### Document-level DEFERRED

- `docs/DAY-2-BACKLOG-2026-05-01.md` — explicit "Block B Phases 2-6: ALL DEFERRED TO DAY-2"
- `docs/plans/BACKLOG-CONSOLIDATED-2026-04-17.md` and `BACKLOG-FULL-2026-04-18.md` — 🟠 DEFERRED status markers
- `docs/plans/BACKLOG-CONSOLIDATED-2026-04-17.md` — "Light mode: partial (boot screen + a few tokens still TODO — P40/P41)"
- `docs/plans/BACKLOG-CONSOLIDATED-2026-04-17.md` and `BACKLOG-FULL-2026-04-18.md` — "9.3 hive-mind source extraction (Apache 2.0 cut) — scaffold DONE, extraction TODO"; CR-6 entry "hive-mind actual source extraction — scaffold done, code copy TODO" with 2-3 day estimate

**Net read on §4:** code itself is largely TODO-free per the L-17 / MOCK-STUB audit results. Real outstanding TODOs are in the doc layer and primarily reflect deferred backlog items, not unfinished code paths.

---

## §5 — hive-mind repo state

```
Branch:    master ... origin/master (in sync, no ahead/behind)
HEAD:      edfa5d7 docs: extraction notes update
Untracked: (none reported)
Tracked:   CLEAN
Tag:       v0.1.0  (single tag, points at sha 7825c20)
```

### Local + remote branches

| Branch | Local sha | Remote tracking | Notes |
|---|---|---|---|
| `master` | `edfa5d7` | `[origin/master]` ✅ | Default branch (not `main`) |
| `feat/sync-to-waggle-os-workflow` | `c77a5f5` | `[origin/feat/sync-to-waggle-os-workflow]` | CI sync workflow scaffold |
| `hive-mind-pre-migration-archive` | `edfa5d7` | local-only | Archive snapshot |
| `ship/v0.1.0-ci` | `aef1a53` | local-only | v0.1.0 ship-prep branch |

### Remote branches (origin)

```
origin/HEAD -> origin/master
origin/master
origin/feat/sync-to-waggle-os-workflow
origin/hive-mind-pre-migration-archive
origin/ship/v0.1.0-ci
```

### NO oss-export branches in hive-mind

The 12 `oss-hive-mind-*-export` branches that exist in waggle-os are NOT present in hive-mind as separate branches. They were intended to be subtree-split sources that get merged INTO `hive-mind/master`, but per the §8a comparison below, the most recent oss-export work in waggle-os has not yet landed in hive-mind master.

### Recent commits on hive-mind master (last 15)

```
edfa5d7  docs: extraction notes update                                                  (HEAD)
2306e6b  ci(sync): add sync-to-waggle-os workflow + .github/sync.md (#1)
c363257  feat(harvest): ClaudeAdapter covers 2026-04-22 export streams (memories, design_chats) + privacy gitignore
b3348fb  docs(backlog): P1 entry for Harvest Claude artifacts adapter
0bbdf7a  fix(harvest-local): raise content preview cap 2000 → 10000 chars (Stage 0 Task 0.5)
9ec75e6  fix(harvest-local): persist item.timestamp to memory_frames.created_at (Stage 0 root cause)
b1e009d  docs(scripts): exercise new CLI persona commands in first-run smoke
f04434d  feat(cli): add `mcp start` and `mcp call <tool>` subcommands
6c0752c  feat(cli): add `init` and `status` persona-facing commands
471a840  ci: Node 22→24 + cross-platform matrix + first-run smoke job
9d681d4  fix(release): drop incompatible typecheck script (composite projects require emit)
2db2f5f  fix(release): remove aspirational lint script (no eslint configured)
b66c151  fix(release): refresh package-lock.json to match workspace graph
aef1a53  chore(release): point repository URLs at marolinik/hive-mind
d85f290  chore(release): v0.1.0 ship-prep — CI, package metadata, READMEs, CHANGELOG, smoke script
```

`v0.1.0` tag points at `7825c20` (a "fix(release): drop incompatible typecheck script" commit). The same commit message appears at `9d681d4` post-tag, which suggests history was refined after tagging — the v0.1.0 npm publish happened from a now-orphaned sha relative to current master. **Not blocking, but `v0.1.0` tag does NOT point at current master HEAD or any current ancestor.**

---

## §6 — hive-mind README + EXTRACTION.md

### README.md (307 lines)

**Packages declared (all 4 with npm badges):**

| Package | Badge | Status per badge URL |
|---|---|---|
| `@hive-mind/core` | npm v0.1.0 | Published |
| `@hive-mind/wiki-compiler` | npm v0.1.0 | Published |
| `@hive-mind/mcp-server` | npm v0.1.0 | Published |
| `@hive-mind/cli` | npm v0.1.0 | Published — listed in package table but NOT on the README's "Packages" section structure subhead (mentioned in CLI table only) |

**"What Stays in Waggle OS" exclusions** (proprietary-stays-with-waggle):

1. **Compliance layer** — EU AI Act compliance reporting and audit trails
2. **Agent runtime** — LLM agent loop, personas, behavioral specs
3. **Self-evolution** — GEPA iterative optimization and EvolveSchema
4. **Vault** — encrypted secret storage
5. **Tier/billing system** — Stripe integration, feature gating
6. **Desktop shell** — Tauri 2.0 application, workspace UI
7. **Multi-agent coordination** — WaggleDance, subagent orchestration

**Architecture diagram** — clean ASCII showing MCP clients → server → core/wiki-compiler → SQLite + embeddings.

### EXTRACTION.md (58 lines)

The whole file is a mapping table. Sections:

- **Extracted to `@hive-mind/core`**: 19 mind-substrate files + 16 harvest-pipeline files + 3 utilities
- **Extracted to `@hive-mind/wiki-compiler`**: 6 files (compiler, synthesizer, prompts, state, types, index)
- **Extracted to `@hive-mind/mcp-server`**: 12 files (entry, setup, 8 tool modules, resources)
- **NOT extracted (stays in Waggle OS)**: vault.ts, compliance/*, evolution-runs.ts, execution-traces.ts, improvement-signals.ts, packages/agent/*, tiers.ts, packages/server/*, app/*, apps/web/*
- **Shared types**: only memory-related (MemoryFrame, FrameType, SearchResult, KnowledgeEntity, etc.). Explicitly NOT extracted: User, Team, AgentDef, Task, WaggleMessage, TierCapabilities

**Extraction Checklist (11 items, ALL UNCHECKED in EXTRACTION.md):**

- [ ] Remove all `@waggle/` import paths, replace with `@hive-mind/`
- [ ] Remove vault.ts dependency (replace with env-var config)
- [ ] Remove tier-gating checks (everything is free in hive-mind)
- [ ] Remove telemetry calls (or make opt-in)
- [ ] Remove compliance hooks
- [ ] Update data directory from `~/.waggle/` to `~/.hive-mind/`
- [ ] Add standalone configuration (no Fastify server dependency)
- [ ] Ensure all SQLite operations use parameterized queries
- [ ] Replace Waggle-specific logger with standalone pino/winston
- [ ] Add comprehensive JSDoc for all public APIs
- [ ] Write tests for all extracted modules (target: 80% coverage)

**Caveat:** these checklist items are very likely partially-or-fully done in current hive-mind master code (the v0.1.0 packages couldn't have published without addressing items 1, 6, 7 at minimum), and probably done again differently in the waggle-os oss-export branches. **EXTRACTION.md is stale relative to actual extraction state on both sides.**

`@hive-mind/cli` is listed under "Packages" in README but is NOT mentioned anywhere in EXTRACTION.md — the CLI was likely added to the OSS scope after EXTRACTION.md was first written.

---

## §7 — hive-mind open work + npm publish state

### git grep TODO/FIXME/XXX/HACK/DEFERRED/UNDOCUMENTED across `*.ts`, `*.md`

**ZERO matches.**

This is genuinely clean for a v0.1.0 OSS release. The lack of any TODO markers in code or docs in current master is a strong signal that someone actively scrubbed these before publish.

### npm publish state (queried 2026-05-05)

| Package | npm version | First published | Last modified |
|---|---|---|---|
| `@hive-mind/core` | `0.1.0` | 2026-04-18T22:48:18Z | 2026-04-18T22:48:18Z |
| `@hive-mind/wiki-compiler` | `0.1.0` | 2026-04-18T22:48:36Z | 2026-04-18T22:48:36Z |
| `@hive-mind/mcp-server` | `0.1.0` | 2026-04-18T22:48:55Z | 2026-04-18T22:48:55Z |
| `@hive-mind/cli` | `0.1.0` | 2026-04-18T22:49:20Z | 2026-04-18T22:49:20Z |

All 4 packages published in a tight 62-second window on 2026-04-18 evening. Both `time.created` and `time.modified` are equal — no patch republish has happened since.

### Hive-mind master commits ahead of v0.1.0 publish (10 commits)

```
edfa5d7  docs: extraction notes update
2306e6b  ci(sync): add sync-to-waggle-os workflow + .github/sync.md  ← merged via PR #1
c363257  feat(harvest): ClaudeAdapter covers 2026-04-22 export streams (memories, design_chats)
b3348fb  docs(backlog): P1 entry for Harvest Claude artifacts adapter
0bbdf7a  fix(harvest-local): raise content preview cap 2000 → 10000 chars (Stage 0 Task 0.5)
9ec75e6  fix(harvest-local): persist item.timestamp to memory_frames.created_at (Stage 0 root cause)
b1e009d  docs(scripts): exercise new CLI persona commands in first-run smoke
f04434d  feat(cli): add `mcp start` and `mcp call <tool>` subcommands
6c0752c  feat(cli): add `init` and `status` persona-facing commands
471a840  ci: Node 22→24 + cross-platform matrix + first-run smoke job
```

**Net: hive-mind master has materially improved features (ClaudeAdapter for 2026-04-22 exports, new CLI subcommands, Stage 0 fixes for content cap + timestamp preservation, CI matrix expansion) that npm registry users can't access at v0.1.0.** A v0.1.1 patch or v0.2.0 minor release is the natural unblocker.

### Per-package last touch on hive-mind master

| Package | Last commit touching path | Date |
|---|---|---|
| `packages/core` | `c363257` ClaudeAdapter | 2026-04-21T15:57:36+02:00 |
| `packages/wiki-compiler` | `aef1a53` repo URLs | 2026-04-19T00:24:49+02:00 |
| `packages/mcp-server` | `f04434d` mcp start/call | 2026-04-19T21:11:29+02:00 |
| `packages/cli` | `0bbdf7a` content cap fix | 2026-04-21T03:45:10+02:00 |

---

## §8 — Cross-cutting sync + consistency analysis

### §8a — SHA terminus comparison (waggle-os oss-export branches ↔ hive-mind master)

**Waggle-os oss-export branch heads (12 branches, last touched 2026-04-29 to 2026-04-30):**

| Branch | Head sha | Last commit date | Subject |
|---|---|---|---|
| `oss-hive-mind-cli-export` | `42dfe08` | 2026-04-29 23:47 | Wave-1 §2.4 — postinstall + mcp-health-check + doctor + Windows Quirks doc |
| `oss-hive-mind-core-export` | `4f5f885` | 2026-04-29 23:30 | §2.3 B5 AMENDMENT 2a — relocate substrate tests to packages/hive-mind-core/tests/ |
| `oss-hive-mind-hooks-claude-code-export` | `149bc69` | 2026-04-29 23:47 | Wave-1 §2.4 (same as cli) |
| `oss-hive-mind-hooks-claude-desktop-export` | `12f5322` | 2026-04-30 00:45 | §2.5+§2.6+§2.7 — Apache 2.0/CONTRIBUTING + OSS subtree split + import sweep + smoke |
| `oss-hive-mind-hooks-codex-desktop-export` | `b45de70` | 2026-04-30 00:45 | §2.5+§2.6+§2.7 |
| `oss-hive-mind-hooks-codex-export` | `43e442c` | 2026-04-30 00:45 | §2.5+§2.6+§2.7 |
| `oss-hive-mind-hooks-cursor-export` | `11195cf` | 2026-04-30 00:45 | §2.5+§2.6+§2.7 |
| `oss-hive-mind-hooks-hermes-export` | `410f773` | 2026-04-30 00:45 | §2.5+§2.6+§2.7 |
| `oss-hive-mind-hooks-openclaw-export` | `5002736` | 2026-04-30 00:45 | §2.5+§2.6+§2.7 |
| `oss-hive-mind-mcp-server-export` | `d52ef97` | 2026-04-30 00:45 | §2.5+§2.6+§2.7 |
| `oss-hive-mind-shim-core-export` | `4eba6c2` | 2026-04-30 00:45 | §2.5+§2.6+§2.7 |
| `oss-hive-mind-wiki-compiler-export` | `c60dc11` | 2026-04-30 00:45 | §2.5+§2.6+§2.7 |

**Hive-mind master per-package last-touch dates (compare):**

| Package | Last commit on master | Date | Vs. waggle-os oss-export |
|---|---|---|---|
| `packages/core` | `c363257` | 2026-04-21 15:57 | **8 days behind** `oss-hive-mind-core-export` (2026-04-29) |
| `packages/wiki-compiler` | `aef1a53` | 2026-04-19 00:24 | **11 days behind** `oss-hive-mind-wiki-compiler-export` (2026-04-30) |
| `packages/mcp-server` | `f04434d` | 2026-04-19 21:11 | **10 days behind** `oss-hive-mind-mcp-server-export` (2026-04-30) |
| `packages/cli` | `0bbdf7a` | 2026-04-21 03:45 | **8 days behind** `oss-hive-mind-cli-export` (2026-04-29) |

**Verdict: SIGNIFICANT DRIFT.** All 12 oss-export branches in waggle-os are ahead of corresponding hive-mind master state. The most recent extraction work (Sesija B Phase 5 closing trio §2.5+§2.6+§2.7 — Apache 2.0/CONTRIBUTING, OSS subtree split, import sweep, smoke; Wave-1 §2.4 — postinstall scripts, mcp-health-check, doctor command, Windows Quirks doc; §2.3 B5 — substrate test relocation) lives in waggle-os oss-export branches but has NOT been merged into hive-mind master. The 12 oss-export branches share two cluster shas: 2026-04-29 (Wave-1 + test relocation) and 2026-04-30 00:45 (the §2.5+§2.6+§2.7 trio).

The waggle-os branch `feature/hive-mind-monorepo-migration` (HEAD `a10867c`) carries the umbrella commit "PHASE 5 SESIJA B COMPLETE — closing trio §2.5+§2.6+§2.7 logged" — that's the source-of-truth merge point in waggle-os. Pushing those changes onto hive-mind master is the missing step.

A `feat/sync-to-waggle-os-workflow` branch already exists in hive-mind (origin sha `c77a5f5`, with PR #1 already merged into master at `2306e6b` 2026-04-18) — this is a CI workflow that pushes from hive-mind → waggle-os, which is the OPPOSITE direction from what's needed for the current drift. The forward direction (waggle-os oss-export → hive-mind master) likely requires manual subtree-split-and-push.

### §8b — Production-ready for Day 0

| Asset | Status | Evidence |
|---|---|---|
| `apps/www` Next.js landing page | ✅ | Sesija D shipped (Lighthouse 96/96/100, 8 sections, i18n extraction, /docs/methodology route, 16/16 acceptance criteria PASS); Sesija E §5.0-§5.3 shipped (Clerk auth wired, Stripe checkout + webhook routes, lazy-create Customer linkage, dark theme fix); apps/www tsc clean as of HEAD |
| Stripe test-mode catalog | ✅ | 2 active products + 4 prices with proper lookup_keys + metadata; 2 stale duplicates archived; commit `0147d6c` |
| `hive-mind` v0.1.0 on npm | ✅ | All 4 packages published 2026-04-18; README + EXTRACTION + LICENSE + CONTRIBUTING in place; CI + cross-platform matrix; v0.1.0 tag |
| `hive-mind` GitHub repo | ✅ | Public at `marolinik/hive-mind`, master branch, PR/issue queues empty, badges live |
| Methodology doc | ✅ | `/docs/methodology` route serves 211-line `docs/methodology.md` at build via react-markdown + remark-gfm |
| Sesija E §5.3 webhook handler | ✅ shipped | Code committed at `a087cf6`; runtime requires `STRIPE_WEBHOOK_SECRET` paste — see §8c In-flight |

### §8c — In-flight pre-Day 0

| Item | Owner | Status |
|---|---|---|
| §5.3 Phase E smoke verdict | Marko | NOT YET CAPTURED — Marko confirmed Clerk modal legible after dark theme fix but didn't return with full Stripe Checkout end-to-end verdict |
| `STRIPE_WEBHOOK_SECRET` paste | Marko | Pending — `apps/www/.env.local` line 36 still `REPLACE_AFTER_WEBHOOK_REGISTERED`; webhook handler returns 503 until set |
| §5.4 Pricing CTAs gate (POST→GET migration in Pricing.tsx + SignUp modal `forceRedirectUrl`) | CC next session | POST shim left in checkout/route.ts pending §5.4 cleanup |
| §5.5 FR Pass8-A logo fix | CC next session OR Marko | Filename mismatch in HeroVisual asset reference per §5.0 brief |
| §5.6 Final visual verification vs. Sesija D baseline | CC next session OR Marko | Last verification step before Day-0 cut |
| 12 oss-export branches → hive-mind master sync | CC OR Marko | The dominant Day-0 launch comms blocker for OSS — see §8e |
| `@hive-mind/core` (and 3 siblings) v0.1.1 or v0.2.0 publish from current master | Marko | 10 commits ahead of npm publish; no patch republish since 2026-04-18 |
| Production webhook setup (Stripe Dashboard → Webhooks endpoint at production URL + paste prod whsec_) | Marko, ponedeljak 14:00 | Per §5.3 manifest |
| Live keys swap (`sk_test_*` → `sk_live_*`) | Marko, ponedeljak 14:00 | Same window as above |

### §8d — Consciously deferred to post Day 0

| Item | Source | Notes |
|---|---|---|
| 30 pre-existing test failures (`packages/agent/tests/*` + `packages/worker/tests/job-processor.test.ts`) | This session's vitest run | Redis :6381 unavailable in test env; not session-introduced; doesn't affect landing page launch |
| `npm audit` 5 vulnerabilities (4 moderate, 1 high) flagged after `@clerk/themes` install | Sesija E §5.3 install output | Pre-existing transitive deps; not caused by `@clerk/themes` itself |
| Stripe customer email sync via Clerk `user.updated` webhook | §5.3 manifest Day-2 backlog | `ensureStripeCustomer` sets email at first checkout; goes stale on Clerk email change |
| Subscription status `paused` collapsed to `canceled` in webhook `mapStatus` | §5.3 webhook route comment | UI doesn't yet distinguish; revisit if pausing UX added |
| `EXTRACTION.md` checklist update | EXTRACTION.md `[ ]` items | All 11 unchecked despite likely-done state — refresh after sync |
| CLAUDE.md §10 "Open Work" stale items | CR-7 in REMAINING-BACKLOG-2026-04-16.md | Marked DONE but listed as TODO in CLAUDE.md |
| PersonaSwitcher two-tier redesign (OW-6) | CLAUDE.md §10 | Polish-sprint Phase C |
| Spawn Agent + Dock wiring (P35/P36) | CLAUDE.md §10 | Polish-sprint Phase B |
| Light mode finish (P40/P41 + CR-2) | CLAUDE.md §10 | Polish-sprint Phase B |

### §8e — Dangling concerns (not raised by PM Claude)

The following are observations from code-side that PM-Claude wouldn't have visibility into. Each surfaces a real risk that should be tracked.

1. **OSS export sync drift is the #1 launch-comms risk.** Day 0 marketing will likely point at `https://github.com/marolinik/hive-mind` as the canonical OSS repo. That repo's master is **8-11 days behind** what waggle-os has prepared in the 12 oss-export branches (Wave-1 doctor command + Windows Quirks docs + postinstall + mcp-health-check; Apache 2.0 boundary + CONTRIBUTING; OSS subtree split + import sweep + smoke). External eyes landing on hive-mind master will see a less-polished extraction than the one PM-side comms might describe. Recommend: subtree-push the 12 oss-export branches into hive-mind master + bump to v0.2.0 + republish to npm BEFORE Day 0 comms go live.

2. **`v0.1.0` tag in hive-mind points at an orphaned sha (`7825c20`)** with same commit message as a current-history sha (`9d681d4`). Indicates history was force-rewritten after tagging. The npm packages were published from the orphaned sha. Not blocking, but a clean v0.2.0 tag should track current master HEAD properly.

3. **Clerk `sk_test_*` SECRET KEY still leaked in `apps/www/.env.local`.** Marko replied "Clerk rotated" mid-session but `.env.local` line 20 still contains the original leaked value (`sk_test_eML55Ggwwal5MRDBLNmlKJmnEMoBFztMeFgie7L3bT`). The file's own line 18-19 comment has flagged "rotate immediately after pasting" since §5.1 (2026-05-03) and rotation has not actually happened. The leaked value persists in transcript files at `C:\Users\MarkoMarkovic\.claude\projects\D--Projects-waggle-os\` and across earlier handoff context. **Real Clerk Dashboard rotate + paste is needed.**

4. **`STRIPE_WEBHOOK_SECRET` placeholder at runtime.** Webhook route at `/api/webhooks/stripe` 503s until Marko runs `stripe listen --print-secret` and pastes the resulting `whsec_*`. The §5.3 Phase E smoke test cannot complete until that paste happens. Production webhook secret will be different from local (Stripe Dashboard → Webhooks → endpoint signing secret) and must be set in production env separately.

5. **EXTRACTION.md is stale on two axes.** (a) The 11-item checklist has all boxes unchecked despite the v0.1.0 publish having addressed many of them. (b) The mapping table doesn't include `@hive-mind/cli` even though that's a published package. Likely needs full rewrite after the next sync, not patch updates.

6. **License header consistency** was NOT verified in this audit. Apache 2.0 LICENSE files exist in hive-mind, but per-source-file SPDX or Apache header consistency in OSS code (especially in the 12 oss-export branches that haven't synced) is unverified. Worth a `grep -L "Apache" packages/*/src/**/*.ts` sweep before v0.2.0 publish.

7. **CLAUDE.md §10 "Open Work" stale** per CR-7 — explicitly known but not yet refreshed. Items shown as TODO that are DONE. Future sessions may relitigate already-shipped work because of this.

8. **Pre-existing 30 test failures are Redis-port-only.** `packages/agent/tests/*` (22 of 30 failures) and `packages/worker/tests/job-processor.test.ts` (the 2 visible errors). Confirmed via `--reporter=basic` output: `ECONNREFUSED 127.0.0.1:6381`. These would block any Day-0 promise of "100% green CI" but have no impact on landing page or hive-mind OSS posture. If Day-0 comms claim test-suite cleanliness, this needs caveat.

9. **Supply-chain provenance for npm publishes.** All 4 hive-mind packages published 2026-04-18 from local machine (no provenance attestation visible in `npm view`). v0.2.0 republish is an opportunity to add `--provenance` for signed releases (requires CI publish flow with OIDC token).

10. **`feat/sync-to-waggle-os-workflow`** in hive-mind is a workflow that pushes hive-mind → waggle-os. The OPPOSITE direction (waggle-os oss-export → hive-mind master) is what's currently needed; that workflow doesn't help the current sync.

11. **Worktrees in waggle-os** (`feature/apps-web-integration` at `D:/Projects/waggle-os-sesija-A`, `feature/gaia2-are-setup` at `D:/Projects/waggle-os-gaia2-wt`) suggest parallel-session work patterns. Not raised by PM-side because not visible there. Worth listing as known active workspaces for context.

### §8f — PR + issue state

| Repo | Open PRs | Open issues |
|---|---:|---:|
| `marolinik/waggle-os` | **0** | **0** |
| `marolinik/hive-mind` | **0** | **0** |

Both queues are empty. Operationally clean. The implication: all open work is tracked in markdown docs / branches / CC briefs, not in GitHub's issue tracker. PM-side might reasonably want a curated set of public-facing issues on hive-mind for Day 0 (e.g., "good first issue" labels) to seed community engagement.

---

## Summary: Day 0 readiness one-liner

**`apps/www` landing + Stripe test catalog + Clerk auth + hive-mind v0.1.0 npm packages = ready.**
**Two ship-day blockers remain on Marko side:** (a) §5.3 Phase E smoke verdict + Clerk key rotation + Stripe webhook secret paste, (b) production live-keys swap + Stripe Dashboard webhook endpoint pointing at production URL (ponedeljak 14:00).
**One ship-day blocker on code side:** the 12 oss-export branches in waggle-os need to land in hive-mind master + a v0.2.0 republish to npm before launch comms point public eyes at the OSS repo.
**Ten dangling concerns** above; none individually fatal, several quick to address.

---

*Generated by CC PM-sync inventory pass, 2026-05-05. No file mutations to either repo apart from this doc itself. To update, re-run the same pass and overwrite.*
