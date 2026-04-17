# Consolidated Backlog — MILESTONE 2026-04-17

**Purpose:** Single source of truth for everything remaining. Merges the 124-item master backlog (2026-04-16), the 21 PDF deferred items (2026-04-17), the installer cluster, and the agent-harness items.

**State:** main @ `ac586f7`, tree clean, 5193 unit tests pass (144 skipped), 89/89 E2E, tsc clean on all 5 projects. 13/13 LLM providers green.

---

## ✅ DONE — PromptAssembler v4 PoC (2026-04-17 session)

**Commits:** `7467e11` · `9d424cc` · `3a055f2` on top of `ac586f7`. Eval ran 60.2 min, 342 LLM calls, zero cleanup failures.

**Outcome: primary hypothesis FAILED** (gap closure −21.5% vs ≥40% target) with nuanced findings:
- F > E on 5/6 scenarios (Opus 4.6 GAINS from PA — sign inverted)
- Qwen3-30B-A3B +26.7pp on compare (reasoning-tuned small models benefit)
- Gemma 4 31B specifically hurt by PA structure
- Opus 4.7 beats Opus 4.6 by 22.46pp on Waggle reasoning (separate useful datapoint)

**Artifacts:** `docs/specs/PROMPT-ASSEMBLER-V4.md`, `EVAL-RESULTS.md`, `tmp_bench_results.json` (gitignored), `project_session_handoff_0417_prompt_assembler.md` memory.

**Feature flag default OFF confirmed correct.** Shipped as landed; not default on.

---

## 🔜 NEXT SESSION — EXPLORING MILESTONE (TBD — briefed at fresh-context start)

Marko has one more exploring milestone queued before we return to the P0/P1/P2 backlog continuation. The brief will be provided in a fresh context window. This section is a placeholder so the backlog stays the single source of truth.

**What to expect when fresh context starts:**
1. Read this milestone file + the latest handoff
2. Read Marko's brief for the exploring milestone
3. Execute per that brief (code + eval/verification as applicable)
4. Commit + handoff
5. THEN return to the P0 critical path below

**Constraint:** The exploring milestone is additive. It does not replace or de-prioritize any of the P0/P1/P2/P3 items below. When complete, the main plan continues.

---

## 📋 MAIN PLAN CONTINUATION (after exploring milestone)

Everything below is the unchanged consolidated backlog. Resume here once the exploring milestone is shipped.

---

## Legend

- ✅ DONE (shipped between 2026-04-16 master snapshot and now)
- 🟢 PENDING (actively doable this week)
- 🟠 DEFERRED (needs design or bigger chunk)
- 🔴 BLOCKED (waits on Stripe / cert / Marko / external)
- ⏳ MARKO ACTION (not engineering)

---

## Snapshot: What shifted since 2026-04-16

Since the mega-polish session closed at `2442d8f`, these blocks moved forward:

| Block | Movement |
|-------|----------|
| Block 1b E2E gate | ✅ 298/298 E2E green (0416 S2), 89/89 current |
| CR-2 Light mode | 🟡 Partial — 6 token swaps + boot screen still ugly (P40/P41) |
| OW-7 Stripe webhooks audit | Still 🔴 — waits on M7 |
| Task 6 (vault-first, onboarding tiers) | ✅ Full (6A-6E); 6F → INST-1/2/3 |
| PDF E2E triage | ✅ 20 items; 🟠 21 deferred |
| Marketplace seed | ✅ 10 E2E green, 148 pkgs |

The 3 P0s from the 2026-04-12 backlog (light mode / upgrade UX / trial timestamp) are mostly resolved:
- Light mode: partial (boot screen + a few tokens still TODO — P40/P41)
- Upgrade UX: shipped as trial expiry modal + tier cards
- Trial timestamp: shipped in 0412 S2 (trial modal + budget cap)

---

## P0 — Launch Blockers (must-have)

These are on the critical path to ship. Most are test execution + external deps, not code.

### Block 1: Marko External Actions ⏳

| # | Action | Blocks | Time |
|---|--------|--------|------|
| M1 | Export ChatGPT conversations | Phase 1 harvest | 5 min |
| M2 | Export Claude conversations (claude.ai) | Phase 1 harvest | 5 min |
| M3 | Export Gemini (Google Takeout) | Phase 1 harvest | 10 min |
| M4 | Export Perplexity threads | Phase 1 harvest | 5 min |
| M5 | Top up API credits (Anthropic/OpenAI/Google) | Phase 4+5 judging | 15 min |
| M6 | Confirm judge models (Opus 4.6, GPT-5.4, Gemini 2.5 Pro, Haiku 4.5) | Phase 5 | Decision |
| M7 | Create Stripe products (Pro $19, Teams $49/seat) | Phase 7 launch | 1 hour |
| M8 | Buy Windows EV code signing cert ($300-500/yr) | Phase 7 launch | 1-3 days |
| M9 | Contact ML peer reviewer for papers | Phase 6 | 1 day |
| M10 | Greenlight launch date | Everything | Decision |

### Block 2: Phase 1 — Harvest Marko's Real Data 🟢 (blocked on M1-M4)

| # | Task | Depends on | Status |
|---|------|-----------|--------|
| 1.1 | Import ChatGPT conversations → harvest | M1 | 🟢 |
| 1.2 | Import Claude conversations → harvest | M2 | 🟢 |
| 1.3 | Re-harvest Claude Code (fresh, all sessions) | — | 🟢 |
| 1.4 | Import Gemini conversations → harvest | M3 | 🟢 |
| 1.5 | Import Perplexity threads → harvest | M4 | 🟢 |
| 1.6 | BUILD Cursor adapter (0.5-1 day) | — | 🟢 |
| 1.7 | Post-harvest cognify on imported frames | 1.1-1.6 | 🟢 |
| 1.8 | Identity auto-populate from harvest | 1.7 | 🟢 |
| 1.9 | Wiki compile from real data | 1.7 | 🟢 |
| **GATE** | 10K-50K frames, dedup verified, KG populated | — | |

Budget: ~$50.

### Block 5: Phase 4 — Memory Proof Test 🟢

From `docs/test-plans/MEMORY-HARVEST-TEST-PLAN.docx`. 10 days · ~$300-500.

### Block 6: Phase 5 — GEPA Full-System Proof 🟢

From `docs/test-plans/GEPA-EVOLUTION-TEST-PLAN.docx`. 18 days · ~$1,500-2,500. Critical path.

### Block 7: Phase 5b — Combined Effect Proof 🟢

From `docs/test-plans/COMBINED-EFFECT-TEST-PLAN.docx`. 6 days · ~$500.

### Block 8: Phase 6 — Write Papers 🟢

5 days writing + Marko peer review.

### Block 9: Phase 7 — Launch Prep

| # | Task | Status |
|---|------|--------|
| 9.1 | Stripe dashboard setup + smoke test | 🔴 blocked M7 |
| 9.2 | Code signing cert + updater keypair | 🔴 blocked M8 |
| 9.3 | hive-mind source extraction (Apache 2.0 cut) | 🟢 (scaffold DONE, extraction TODO) |
| 9.4 | Binary build + smoke test on clean Windows VM | 🟢 |
| 9.5 | Clerk auth integration | 🔴 after 9.1 |
| 9.6 | Onboarding flow finalized (harvest-first) | 🟢 (needs Block 4) |
| 9.7 | Mac notarization | ⏳ Marko |
| 9.8 | Landing page final polish | 🟢 |

### Block 10: Launch Day 🔴 (gated)

Simultaneous: Waggle binary + hive-mind OSS + 2 arXiv papers + LinkedIn sequence + Pro/Teams live.

---

## P1 — Ship Quality (do before launch)

### Block 3c Quick Wins 🟢 (<1 hr each, ~5 hr total)

| # | Fix | Effort |
|---|-----|--------|
| QW-1 | Auto-open chat window after onboarding | 15 min |
| QW-2 | Text labels to Memory app tabs (Timeline/Graph/Harvest/Weaver/Wiki/Evolution) | 30 min |
| QW-3 | Skip boot screen on return visits | 15 min |
| QW-4 | Back button in onboarding wizard steps 2-6 | 20 min |
| QW-5 | Rename dock tiers (Simple→Essential, Pro→Standard, Full→Everything) + clarify vs billing | 15 min |

### Block 3d: CLAUDE.md Open Work

| # | Item | Status |
|---|------|--------|
| OW-6 | **PersonaSwitcher two-tier redesign** — UNIVERSAL MODES (8) + WORKSPACE SPECIALISTS (template-scoped); hover tooltip with tagline/bestFor/wontDo | 🟢 0.5 day |
| OW-7 | Stripe webhooks smoke test against real Stripe | 🔴 blocked M7 |

### Block 3b: Compliance Report UX + Template System 🟢 (3.5 days)

| # | Task | Notes |
|---|------|-------|
| 3b.1 | PDF generation route: POST /api/compliance/export-pdf → pdfmake → buffer → download | `buildComplianceDocDefinition` exists, needs pdfmake render + route |
| 3b.2 | Template system: report templates as JSON (sections, logo, branding, footer) | Currently hardcoded |
| 3b.3 | Full-page ComplianceReport viewer + date range picker + section toggles + PDF download button | Currently 324-line card |
| 3b.4 | Custom branding: company logo upload, org name, risk classification override | Template field |
| 3b.5 | KVARK template: IAM audit section, data residency proof, department breakdown | Enterprise variant |

### Block 3e: Cross-Reference Items

| # | Item | Status |
|---|------|--------|
| CR-1 | **MS Graph OAuth connector** — harvest email, calendar, files | 🟢 2-3 days |
| CR-2 | **Light mode full audit** — only partial; boot screen + tokens | 🟡 0.5 day |
| CR-3 | **KG Viewer top-5 demo gaps** — loading, error, export-PNG, touch | 🟢 4-6 hr |
| CR-4 | **Demo video script** — 90-s harvest→wiki→insight + 5-min deep dive | 🟢 1 day content |
| CR-5 | **LinkedIn launch posts** (3-post sequence over 10 days) | 🟢 content |
| CR-6 | **hive-mind actual source extraction** — scaffold done, code copy TODO | 🟢 2-3 days |
| CR-7 | **CLAUDE.md update** — Section 10 Open Work is stale | 🟢 15 min |
| CR-8 | **Tauri binary build verification** — haven't built since mega code changes | 🟢 1 day |
| CR-9 | **Mac notarization setup** | ⏳ Marko |

### Block 3da: Installer Flow (deferred from Task 6)

| # | Item | Effort |
|---|------|--------|
| INST-1 | **Ollama bundled installer** — "Install Ollama + pull Gemma 4" step | 🟢 1 day |
| INST-2 | **Hardware scan** — RAM/GPU read, recommend which models fit locally | 🟢 4-6 hr |
| INST-3 | **Ollama daemon auto-start** — Windows service / macOS launchd | 🟢 4-6 hr |

---

## P2 — Polish (can ship without, do soon after)

### Block 3c Medium UX Fixes 🟢 (1-4 hr each)

| # | Fix | Effort |
|---|-----|--------|
| UX-1 | Reduce onboarding decisions: default Blank + General Purpose, skip to Ready | 2 hr |
| UX-3 | Memory app: labeled tab bar replacing 6 unlabeled icons | 1 hr |
| UX-4 | Dock: show text labels for first 7 days / 20 sessions | 2 hr |
| UX-5 | Status bar: hide token count + cost behind developer mode toggle | 1 hr |
| UX-6 | Chat header: collapse secondary controls into overflow menu | 2 hr |
| UX-7 | Onboarding tier step: clarify dock tier ≠ billing tier | 30 min |

### Block 3c Engagement Features 🟢 (half-day each)

| # | Feature | Effort |
|---|---------|--------|
| ENG-1 | "I just remembered" toast after 5th message | 4 hr |
| ENG-2 | WorkspaceBriefing as collapsible sidebar | 4 hr |
| ENG-3 | Progressive dock unlock nudge at 10/50 sessions | 2 hr |
| ENG-4 | LoginBriefing on every launch (per-session reset + "don't show again") | 2 hr |
| ENG-5 | Harvest-first onboarding: move import pitch to step 2 | 3 hr |
| ENG-6 | Memory Score / Brain Health metric in dashboard + status bar | 4 hr |
| ENG-7 | Suggested next actions after assistant response (2-3 buttons) | 4 hr |

### Block 3: Wiki Compiler v2 🟢 (5 days)

| # | Task | Status |
|---|------|--------|
| 2.1 | Markdown export | ✅ |
| 2.2 | Incremental recompilation after harvest | 🟢 (engine supports) |
| 2.3 | Obsidian vault adapter | 🟢 |
| 2.4 | Notion structured export adapter | 🟢 |
| 2.5 | Wiki health report dashboard UI | 🟢 (types exist) |

### Block 4: Phase 3 — Harvest UX Full Polish 🟢 (5 days)

| # | Task | Status |
|---|------|--------|
| 3.1 | Privacy headline | ✅ |
| 3.2 | Dedup summary | ✅ |
| 3.3 | Live progress streaming (SSE from pipeline) | 🟢 |
| 3.4 | Resumable harvests (checkpoint every 100 frames) | 🟢 |
| 3.5 | Identity auto-populate screen | 🟢 |
| 3.6 | Harvest-first onboarding tile ("Where does your AI life live?") | 🟢 |

### Block 3c-R: Responsive Gaps 🟢

| # | Component | Issue |
|---|-----------|-------|
| R-1 | Dock | Power tier (14 items) overflows < 768px |
| R-2 | StatusBar | 10+ items — hide non-essential < 900px |
| R-3 | ChatApp | Session sidebar 192px — collapse on narrow |
| R-4 | OnboardingWizard | Template grid responsive columns |
| R-5 | AppWindow | Default sizes exceed mobile viewport |

---

## PDF E2E — Deferred 21 items (🟠) from 2026-04-17

Full triage in `docs/plans/PDF-E2E-ISSUES-2026-04-17.md`.

| # | Item | Effort |
|---|------|--------|
| P4 | Mutation Gates vs 3-level tool approval — UX redesign | 🟠 big |
| P6 | Room feature functional verification (2 parallel agents viz) | 🟠 |
| P8 | Agents vs Personas unify naming | 🟡 partial |
| P10 | **Agent icons — bee-style per-agent, dark + light variants** | 🟠 design-heavy |
| P14 | Local browser only drive D, needs C (multi-drive) | 🟠 |
| P15 | Create Template modal overlaps Dashboard — can't drag | 🟠 |
| P16 | Files app local folder create + explorer-style browse | 🟠 big |
| P17 | **App-wide tooltips on badges/options** | 🟠 broad |
| P18 | Waggle Dance real signal display | 🟠 |
| P21 | Timeline always empty — wire to event stream | 🟠 |
| P25 | Scheduled Jobs toggle stays off after trigger | 🟠 |
| P26 | New scheduled job creation unclear | 🟠 |
| P28 | Marketplace empty — was ✅ this session (10 E2E green, 148 pkgs) | ✅ |
| P29 | Skills & Apps cards not clickable — no detail card | 🟠 |
| P30 | MCP install CLI simplification | 🟠 |
| P34 | Approvals app — move to Ops or delete | 🟠 |
| P35 | **Spawn Agent "no models available"** — wrong, 13 providers | 🟠 core bug |
| P36 | **Dock spawn-agent icon wiring** — clicking does nothing | 🟠 core bug |
| P39 | Status bar left — static, should be dynamic model + folder | 🟡 |
| P40 | **Light mode boot screen — no Waggle logo / animation** | 🟠 |
| P41 | **Light mode "Waggle AI" text styling ugly** | 🟠 |

---

## hive-mind Integration 🟢 (7 days)

From `docs/HIVE-MIND-INTEGRATION-DESIGN.md`. 8 items across MCP resources, CLI, hooks, installer.

---

## Accessibility 🟢 (1 day — post-launch OK)

| # | Fix | WCAG |
|---|-----|------|
| A11Y-1 | Boot screen: announce skip for screen readers | 2.1.1 |
| A11Y-2 | Dock: 44x44px touch targets | 2.5.8 |
| A11Y-3 | Window title bar: icons on min/max buttons | 1.4.1 |
| A11Y-4 | PersonaSwitcher: aria-disabled on locked cards | 4.1.2 |
| A11Y-5 | Settings: role="switch" + aria-checked on toggles | 4.1.2 |
| A11Y-6 | Dashboard: health dots shape differentiation | 1.4.1 |
| A11Y-7 | Chat feedback dropdown: focus trap + arrow keys | 2.1.1 |
| A11Y-8 | Global Search: role="dialog" | 1.3.1 |
| A11Y-9 | Memory: aria-label on importance slider | 1.3.1 |

---

## Strategic Decisions Pending ⏳

| # | Decision | Unlocks |
|---|----------|---------|
| C1 | hive-mind OSS timing — ship with Waggle or before? | Launch sequencing |
| C5 | Harvest-first onboarding — replace step 2 or parallel opt-in? | Block 4 UX |
| C8 | Warm list — 5-10 names to pre-email 72h before launch | Launch credibility |
| C9 | Single-author or dual-author on papers? | Paper attribution |
| C11 | Marketplace model — free+attribution / freemium / enterprise-only? | Skills monetization |
| — | EvolveSchema attribution — keep "Mikhail" or cite ACE (Zhang et al.)? | Paper 2 framing |

---

## Totals

| Category | Items | Eng days | Budget |
|----------|-------|---------|--------|
| P0 launch blockers (tests, papers, launch prep) | 50 | 50 | $2,650-4,000 |
| P1 ship quality (QW, OW-6, CR-*, 3b, INST) | ~25 | 6.5 | — |
| P2 polish (medium UX, ENG, wiki v2, harvest UX, responsive) | ~30 | 22 | — |
| P3 future (a11y, Mac notarization, LinkedIn) | ~15 | 6.5 | — |
| **PDF deferred 21** | 21 | ~7 | — |
| **Total everything** | **~145** | **~92 days** | **~$3,000-4,000** |

Calendar with parallelism: **~7-8 weeks to launch.**

---

## Critical Path

```
Marko exports (M1-M4) ──► Phase 1 Harvest (3d) ──► Phase 4 Memory Proof (10d) ──► Paper 1
                           └─ parallel ─► Phase 2 Wiki v2 (7d)                     ↓
                           └─ parallel ─► Phase 3 Harvest UX (7d)      Phase 7b Combined (7d) ──► Paper 2
                                                                                    ↑
API credits (M5) ──► Phase 5 GEPA Proof (21d) ──────────────────────────────────────┘

Stripe (M7) + Signing (M8) ──► Phase 7 Launch Prep ──► LAUNCH DAY
hive-mind extraction ──────────────────────────────────► LAUNCH DAY
```

---

## Related docs

- `docs/REMAINING-BACKLOG-2026-04-16.md` — canonical source
- `docs/TOTAL-WORK-ESTIMATE.md` — effort breakdown
- `docs/plans/PDF-E2E-ISSUES-2026-04-17.md` — PDF triage
- `docs/HIVE-MIND-INTEGRATION-DESIGN.md` — OSS package design
- `docs/UX-ASSESSMENT-2026-04-16.md` — UX findings source
- `docs/test-plans/*.docx` — Phase 4/5/7 protocols
