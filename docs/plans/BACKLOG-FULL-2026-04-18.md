# FULL BACKLOG — 2026-04-18

**Purpose:** Single surface of every open item across the polish sprint, consolidated backlog, PDF triage deferred items, Marko-side non-coding work, strategic decisions, and the newly identified GEPA wiring gaps. Merges `POLISH-SPRINT-2026-04-18.md`, `BACKLOG-CONSOLIDATED-2026-04-17.md`, and `PDF-E2E-ISSUES-2026-04-17.md`.

**State at write-time:** main @ `1c304cd`, tree clean, 200 commits ahead of origin. Phase A of the polish sprint is 5/6 done; QW-3 remains.

**Legend:**
- ✅ DONE
- 🟢 PENDING (doable now)
- 🟠 DEFERRED (needs design / bigger chunk)
- 🔴 BLOCKED (external — Stripe / cert / Marko)
- ⏳ MARKO ACTION (non-engineering)

---

## 1. Polish Sprint 2026-04-18 — phased plan (this week)

### Phase A — Quick Wins

| # | Item | Status | Commit |
|---|---|---|---|
| QW-1 | Prefill chat after onboarding | ✅ | `9d1c858` |
| QW-2 | Memory tab labels | ✅ | `bb6ab50` |
| QW-3 | Skip boot on return visits (verify `BOOT_KEY` in `Index.tsx:16`) | 🟢 | — |
| QW-4 | Back button onboarding 2-6 | ✅ | `47539ac` |
| QW-5 | Dock tier rename + billing clarity | ✅ | `70c8d84` |
| CR-7 | CLAUDE.md §10 refresh | ✅ | `1c304cd` |

### Phase B — Core bugs + light mode finish (~1 day)

| # | Item | Status |
|---|---|---|
| P35 | Spawn-agent "no models available" — wire `SpawnAgentPanel` to live provider list (13 green) | 🟢 |
| P36 | Dock spawn-agent icon click — verify, wire TaskCreate | 🟢 |
| P40 | BootScreen logo/animation renders in light mode | 🟢 |
| P41 | "Waggle AI" header text restyled for light theme | 🟢 |
| CR-2 | Remaining `hive-950` → semantic token sweep | 🟢 |

### Phase C — OW-6 PersonaSwitcher two-tier (0.5 day)

| # | Item | Status |
|---|---|---|
| OW-6 | UNIVERSAL MODES (8) + WORKSPACE SPECIALISTS split; hover tooltip with tagline / bestFor / wontDo. File: `apps/web/src/components/os/overlays/PersonaSwitcher.tsx`. Requires `AgentPersona` interface extensions per CLAUDE.md §5 (already shipped in `personas.ts`). | 🟢 |

### Phase D — Feature polish (~10 days)

**Compliance UX (3.5d) — Block 3b**

| # | Task |
|---|---|
| 3b.1 | POST /api/compliance/export-pdf → pdfmake buffer download |
| 3b.2 | Template system (sections, logo, branding, footer as JSON) |
| 3b.3 | Full-page ComplianceReport viewer + date picker + PDF button |
| 3b.4 | Custom branding (logo upload, org name, risk class override) |
| 3b.5 | KVARK template (IAM audit, data residency, department breakdown) |

**Harvest UX (5d) — Block 4**

| # | Task | Status |
|---|---|---|
| 3.1 | Privacy headline | ✅ |
| 3.2 | Dedup summary | ✅ |
| 3.3 | SSE live progress streaming | 🟢 |
| 3.4 | Resumable harvests (checkpoint every 100 frames) | 🟢 |
| 3.5 | Identity auto-populate screen | 🟢 |
| 3.6 | Harvest-first onboarding tile | 🟢 |

**Wiki v2 (5d) — Block 3**

| # | Task | Status |
|---|---|---|
| 2.1 | Markdown export | ✅ |
| 2.2 | Incremental recompile after harvest | 🟢 |
| 2.3 | Obsidian vault adapter | 🟢 |
| 2.4 | Notion structured export adapter | 🟢 |
| 2.5 | Wiki health report dashboard UI | 🟢 |

**Medium UX fixes (1-4h each)**

| # | Fix | Status |
|---|---|---|
| UX-1 | Reduce onboarding decisions (default Blank + General Purpose → Ready) | 🟢 |
| UX-3 | Memory tab bar labels | ✅ (QW-2) |
| UX-4 | Dock text labels first 7d / 20 sessions | 🟢 |
| UX-5 | Hide token/cost behind dev mode | 🟢 |
| UX-6 | Chat header overflow menu | 🟢 |
| UX-7 | Tier-step copy clarify dock tier ≠ billing | ✅ (QW-5) |

**Engagement features (half-day each)**

| # | Feature |
|---|---|
| ENG-1 | "I just remembered" toast after 5th message |
| ENG-2 | WorkspaceBriefing collapsible sidebar |
| ENG-3 | Progressive dock unlock nudge at 10/50 sessions |
| ENG-4 | LoginBriefing on every launch (per-session + don't-show-again) |
| ENG-5 | Harvest-first onboarding — move import pitch to step 2 |
| ENG-6 | Memory Score / Brain Health metric |
| ENG-7 | Suggested next actions after assistant response |

**Responsive gaps**

| # | Component | Issue |
|---|---|---|
| R-1 | Dock | Power tier (14 items) overflows < 768px |
| R-2 | StatusBar | 10+ items — hide non-essential < 900px |
| R-3 | ChatApp | Session sidebar 192px — collapse narrow |
| R-4 | OnboardingWizard | Template grid responsive columns |
| R-5 | AppWindow | Default sizes exceed mobile viewport |

### Phase E — Infra polish (~6 days)

| # | Item |
|---|---|
| CR-8 | Tauri binary verification on clean Windows VM |
| INST-1 | Ollama bundled installer (Install Ollama + pull Gemma 4) |
| INST-2 | Hardware scan (RAM/GPU → model fit recommendation) |
| INST-3 | Ollama daemon auto-start (Windows service / macOS launchd) |
| CR-6 | hive-mind actual source extraction (scaffold exists, copy TODO) |
| CR-1 | MS Graph OAuth connector — email / calendar / files harvest |

### Phase F — Content polish (~1 day)

| # | Item |
|---|---|
| CR-4 | Demo video script (90s + 5min) |
| CR-5 | LinkedIn launch posts (3-post sequence) |
| — | Peer-reviewer outreach email (agent drafts, Marko sends) |

---

## 2. Marko — non-coding items

| # | Action | Status | Blocks |
|---|---|---|---|
| M1 | ChatGPT export (OpenAI email) | ⏳ chase | Phase 1 harvest |
| M2 | Claude / Anthropic export | ✅ | — |
| M3 | Google / Gemini export | ✅ | — |
| M4 | Perplexity threads — manual-only, skipped | — | — |
| M5 | API credit top-ups | ✅ | — |
| M6 | Judge-model list revision (after w4/w25 proofs) | ⏳ later | Phase 5 |
| M7 | Stripe products (Pro $19, Teams $49/seat) | ⏳ today | Phase 7 |
| M8 | Windows EV code signing cert ($300-500/yr) | ⏳ Monday | Phase 7 |
| M9 | Apple Dev + Mac notarization | ⏳ Monday | Phase 7 |
| M10 | Greenlight launch date | ⏳ after proofs | Launch |

### Strategic decisions pending

| # | Decision | Unlocks |
|---|---|---|
| C1 | hive-mind OSS timing — ship-with or ship-before Waggle? | Launch sequence |
| C5 | Harvest-first onboarding — replace step 2 vs parallel opt-in? | UX-1 / ENG-5 |
| C8 | Warm list 5-10 names to pre-email T-72h | Launch credibility |
| C9 | Papers — single-author or dual-author? | Paper attribution |
| C11 | Marketplace model — free / freemium / enterprise? | Skills monetization |
| ES | EvolveSchema attribution — Mikhail vs ACE (Zhang et al.) | Paper 2 framing |

---

## 3. P0 Launch Blockers (beyond polish)

### Block 2 — Phase 1 Harvest Marko's real data (🔴 blocked on M1)

| # | Task |
|---|---|
| 1.1 | Import ChatGPT conversations → harvest |
| 1.2 | Import Claude conversations → harvest |
| 1.3 | Re-harvest Claude Code (fresh, all sessions) |
| 1.4 | Import Gemini conversations → harvest |
| 1.5 | Import Perplexity threads → harvest |
| 1.6 | Build Cursor adapter (0.5-1 day) |
| 1.7 | Post-harvest cognify on imported frames |
| 1.8 | Identity auto-populate from harvest |
| 1.9 | Wiki compile from real data |
| **GATE** | 10K-50K frames, dedup verified, KG populated | |

Budget ~$50.

### Block 5-8 — proofs + papers

| Block | Name | Time | Budget |
|---|---|---|---|
| 5 | Phase 4 Memory Proof (`MEMORY-HARVEST-TEST-PLAN.docx`) | 10d | $300-500 |
| 6 | Phase 5 GEPA Full-System Proof (`GEPA-EVOLUTION-TEST-PLAN.docx`) | 18d | $1.5-2.5k |
| 7 | Phase 5b Combined Effect (`COMBINED-EFFECT-TEST-PLAN.docx`) | 6d | ~$500 |
| 8 | Phase 6 Write papers (2 arXiv) + Marko peer review | 5d | — |

### Block 9 — Launch Prep

| # | Task | Status |
|---|---|---|
| 9.1 | Stripe dashboard + smoke test | 🔴 M7 |
| 9.2 | Code signing cert + updater keypair | 🔴 M8 |
| 9.3 | hive-mind source extraction (Apache 2.0) | 🟢 (scaffold done) |
| 9.4 | Binary build + clean Windows VM smoke | 🟢 |
| 9.5 | Clerk auth integration | 🔴 after 9.1 |
| 9.6 | Onboarding finalized (harvest-first) | 🟢 needs Block 4 |
| 9.7 | Mac notarization | ⏳ M9 |
| 9.8 | Landing page final polish | 🟢 |

### Block 10 — Launch Day 🔴 (gated)

Simultaneous: Waggle binary · hive-mind OSS · 2 arXiv papers · LinkedIn sequence · Pro/Teams live.

---

## 4. PDF E2E — deferred 21 items (🟠)

Source: `docs/plans/PDF-E2E-ISSUES-2026-04-17.md`.

| # | Item | Effort |
|---|---|---|
| P4 | Permissions → Mutation Gates merge with 3-level tool approval | 🟠 big UX |
| P6 | Room feature — verify 2 parallel agents visualization | 🟠 |
| P8 | Agents vs Personas unify naming | 🟡 partial |
| P10 | Bee-style per-agent icons (dark + light) | 🟠 design-heavy |
| P14 | Local browser only drive D — multi-drive (C: required) | 🟠 |
| P15 | Create Template modal overlaps Dashboard — can't drag | 🟠 |
| P16 | Files app local-folder create + explorer-style browse | 🟠 big |
| P17 | App-wide tooltips on badges/options | 🟠 broad |
| P18 | Waggle Dance — display real discovery/handoff signals | 🟠 |
| P21 | Timeline always empty — wire to event stream | 🟠 |
| P25 | Scheduled Jobs toggle stays off after trigger | 🟠 |
| P26 | New scheduled-job creation unclear | 🟠 |
| P28 | Marketplace empty | ✅ (fixed, 10 E2E green, 148 pkgs) |
| P29 | Skills & Apps cards not clickable — no detail card | 🟠 |
| P30 | MCP install CLI flow unclear | 🟠 |
| P34 | Approvals app — move to Ops or delete | 🟠 |
| P35 | Spawn Agent "no models available" | 🟠 — Phase B above |
| P36 | Dock spawn-agent icon wiring | 🟠 — Phase B above |
| P39 | Status bar left shows static — should be dynamic | 🟡 |
| P40 | Light-mode boot screen | 🟠 — Phase B above |
| P41 | Light-mode "Waggle AI" header text | 🟠 — Phase B above |

---

## 5. GEPA Wiring Closure — NEW (4 items)

Context: Self-evolution library code is 100% present (357 evolution tests, full orchestrator, deploy callbacks, gates, compose, trace store, eval-dataset builder, makeRunningJudge, etc.). But four wiring gaps explain why a published evolution run hasn't produced a real agent-behavior improvement to date. Each is small but load-bearing.

### G1 — No autonomous evolution service / scheduler 🟢

**Claim:** The server has `optimizer-service.ts` (the one-shot `@waggle/optimizer` wrapper) but no `evolution-service.ts`. There is no route that instantiates `EvolutionOrchestrator` on a schedule, no cron job that calls `runOnce()`, no daemon that mines traces into eval datasets. The full closed loop exists as library code that nothing automatically calls.

**Evidence:**
- `packages/server/src/local/services/` — contains `optimizer-service.ts`, no `evolution-service.ts`.
- `packages/server/src/local/routes/evolution.ts` — has `/api/evolution/run` (manual POST) that instantiates the orchestrator with a base judge + running judge, but it is only triggered by HTTP. The only cron reference is a comment on line 439: `"backwards compat for tests + cron"` — no code.
- `cron-service.ts` exists in services but has no evolution-run registration.

**Fix:**
1. Create `packages/server/src/local/services/evolution-service.ts` that owns a daemon loop and an auto-trigger policy.
2. Register an evolution cron in `cron-service.ts` (configurable cadence, default daily at low-traffic hour) that calls `runOnce()` with baseline auto-detection from the trace store.
3. Add a minimum-dataset gate so the scheduler skips runs when the trace table has fewer than N eligible examples (avoids burning API spend on no-op runs).
4. Wire an on-demand trigger in the UI (Evolution tab → Run now button already exists from Phase 8.5 — ensure it reuses the same service).

**Effort:** 0.5-1 day.

### G2 — `loadSystemPrompt` ignores overrides 🟢

**Claim:** `prompt-loader.ts` is a static file reader that reads `{waggleDir}/system-prompt.md` only. It does not integrate with `loadBehavioralSpecOverrides` or `loadCustomPersonas`. A deployed evolution writes overrides correctly via `evolution-deploy.ts`, but any consumer that reads the disk system prompt directly would not see those overrides.

**Evidence:**
- `packages/agent/src/prompt-loader.ts` — 26 lines total, only `readFileSync` of `system-prompt.md`. No override imports.
- Override loaders live in `behavioral-spec.ts` + `custom-personas.ts`, called by `server.activeBehavioralSpec` decorator (Phase 7.5) — that chat path does work.
- Gap: any other consumer (CLI, tests, future runtime integrations) that reads via `loadSystemPrompt` receives the raw file without overrides.

**Fix:**
1. Add `loadSystemPromptWithOverrides(waggleDir)` that composes: base spec → behavioral-spec overrides (via `buildActiveBehavioralSpec`) → persona system prompt (via `getPersona` + custom persona overrides) → disk system-prompt.md append.
2. Migrate any remaining callers of `loadSystemPrompt` to the override-aware loader.
3. Deprecate the bare `loadSystemPrompt` (keep export for test isolation only).
4. Add an assertion in agent-loop startup that logs a warning if overrides exist on disk but the active spec doesn't include them (catches wiring regressions).

**Effort:** 2-4 hours.

### G3 — Running judge not end-to-end on all eval paths 🟢

**Claim:** Without `makeRunningJudge`, the judge compares prompt TEXT to expected output, turning GEPA into a prompt-text-similarity optimizer — a meaningless gradient. The wrapper exists in `evolution-llm-wiring.ts` but not every runtime path assembles it.

**Evidence:**
- `/api/evolution/run` (evolution.ts:377) — CORRECTLY wraps `baseJudge` with `makeRunningJudge` for GEPA instruction stage. This path is fine.
- `iterative-optimizer.ts` — no matches for `makeRunningJudge` or `runningJudge` inside the file. If anything uses this optimizer directly (not via the /run endpoint), it scores text similarity.
- `scripts/evolution-hypothesis.mjs` — referenced in the grep as another consumer; needs audit.

**Fix:**
1. Audit every consumer of `IterativeGEPA.run()` (grep `IterativeGEPA`, inspect each caller).
2. For any caller that passes a bare judge for instruction evolution, wrap with `makeRunningJudge(base, llm)`.
3. Add a type guard / runtime check in `IterativeGEPA.run()` that rejects judges which haven't been marked as running-capable (add a brand/phantom property to `makeRunningJudge`'s return so `IterativeGEPA` can assert it).
4. Update `evolution-hypothesis.mjs` + any other standalone harnesses to use the running judge.

**Effort:** 2-4 hours including audit.

### G4 — Traces rarely finalized with `success`/`verified`/`corrected` 🟢

**Claim:** `EvalDatasetBuilder` mines examples from `execution_traces`. If outcomes aren't consistently set to a terminal success value, `buildExamplesFromTraces` returns zero examples and the orchestrator skips with "no eligible traces". GEPA doesn't fail — it just never runs.

**Evidence:**
- `packages/server/src/local/routes/chat.ts:1146` — `traceRecorder.start()` is called correctly at the start of each chat turn.
- `packages/server/src/local/routes/chat.ts:1231` — `traceRecorder.finalize(traceHandle, {...})` is called. Need to verify the outcome argument always resolves to `'success'` / `'verified'` / `'corrected'` for turns that should be eligible, and audit what happens on tool-error / abort paths.
- `harness-trace-bridge.ts:123` — only explicit `'verified' | 'abandoned'` literal found in agent src. Outcome coverage is thin in production code paths.

**Fix:**
1. Audit `chat.ts` finalize paths — what outcome do we emit on (a) successful final assistant message, (b) tool error mid-turn, (c) user abort / SSE disconnect, (d) rate-limit failure, (e) inner monologue / empty text? Document the matrix.
2. Ensure `'success'` is emitted for turns that produced a valid final assistant message without fatal errors.
3. Backfill outcome on traces that have a valid final message but no explicit outcome (one-time migration script).
4. Add a health metric in the Evolution dashboard: "Eligible traces available for next run: N" — so the user sees the dataset pool size before kicking off a run.
5. When `EvalDatasetBuilder` returns fewer than `minExamples`, emit a structured error to the /run response body explaining WHY (current wording "no eligible traces to form dataset" is opaque to end users).

**Effort:** 0.5 day.

### GEPA closure totals

**4 items, ~2 engineering days, all unblocked.** Ship order: G4 (makes runs possible) → G2 (makes deploys consumable) → G3 (audits correctness) → G1 (autonomy).

After closure, the claim "Waggle self-evolves its agent behavior in production" becomes defensible — today it is defensible only for library-level tests.

---

## 6. hive-mind OSS Integration 🟢 (7 days)

From `docs/HIVE-MIND-INTEGRATION-DESIGN.md`. 8 items across MCP resources, CLI, hooks, installer. Blocks C1 decision.

---

## 7. Accessibility (🟢 1 day, post-launch OK)

| # | Fix | WCAG |
|---|---|---|
| A11Y-1 | Boot screen: screen-reader skip announce | 2.1.1 |
| A11Y-2 | Dock: 44x44px touch targets | 2.5.8 |
| A11Y-3 | Window title bar: icons on min/max buttons | 1.4.1 |
| A11Y-4 | PersonaSwitcher: aria-disabled on locked cards | 4.1.2 |
| A11Y-5 | Settings: role="switch" + aria-checked on toggles | 4.1.2 |
| A11Y-6 | Dashboard: health-dot shape differentiation | 1.4.1 |
| A11Y-7 | Chat feedback dropdown: focus trap + arrow keys | 2.1.1 |
| A11Y-8 | Global Search: role="dialog" | 1.3.1 |
| A11Y-9 | Memory: aria-label on importance slider | 1.3.1 |

---

## 8. Totals

| Category | Items | Eng days | Budget |
|---|---|---|---|
| Polish sprint Phases A-F | ~35 | ~20 | — |
| P0 launch blockers (tests, papers, launch prep) | 50 | 50 | $2.65-4k |
| P1 ship quality (QW, OW-6, CR-*, 3b, INST) | ~25 | 6.5 | — |
| P2 polish (Medium UX, ENG, wiki v2, harvest UX, responsive) | ~30 | 22 | — |
| P3 future (A11Y, notarization, LinkedIn) | ~15 | 6.5 | — |
| PDF deferred | 21 | ~7 | — |
| **GEPA wiring closure (NEW)** | **4** | **~2** | **—** |
| **Total everything** | **~150** | **~94** | **~$3-4k** |

Calendar with parallelism: ~7-8 weeks to launch.

---

## 9. Critical path

```
Marko exports (M1) ──► Phase 1 Harvest (3d) ──► Phase 4 Memory Proof (10d) ──► Paper 1
                       └─ parallel ─► Phase 2 Wiki v2 (7d)                         ↓
                       └─ parallel ─► Phase 3 Harvest UX (7d)       Phase 5b Combined (7d) ──► Paper 2
                                                                                    ↑
API credits (M5) ──► Phase 5 GEPA Proof (21d) ──────────────────────────────────────┘
                                  ↑
                        GEPA wiring closure (G1-G4, 2d) — must ship before Phase 5

Stripe (M7) + Signing (M8) ──► Phase 7 Launch Prep ──► LAUNCH DAY
hive-mind extraction (CR-6) ──────────────────────────► LAUNCH DAY
```

**GEPA closure (G1-G4) is now on the critical path for the Phase 5 GEPA proof** — without it, the proof would measure text similarity instead of real agent behavior.

---

## 10. Related docs

- `docs/plans/POLISH-SPRINT-2026-04-18.md` — phased polish plan
- `docs/plans/BACKLOG-CONSOLIDATED-2026-04-17.md` — prior consolidated backlog (pre-GEPA-wiring audit)
- `docs/plans/PDF-E2E-ISSUES-2026-04-17.md` — PDF triage
- `docs/HIVE-MIND-INTEGRATION-DESIGN.md` — OSS package design
- `docs/UX-ASSESSMENT-2026-04-16.md` — UX findings source
- `docs/test-plans/*.docx` — Phase 4/5/7 protocols
- `docs/REMAINING-BACKLOG-2026-04-16.md` — 2026-04-16 master snapshot
- `docs/TOTAL-WORK-ESTIMATE.md` — effort breakdown
