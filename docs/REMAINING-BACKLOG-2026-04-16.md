# Remaining Backlog — 2026-04-16 Post-Mega-Session

**State:** 348/348 tests, 5338/5338 pass, tsc clean, all code review findings resolved.
**Head:** `8b84f8d` on main, 55 commits since Apr 15.

---

## DONE (this session + prior)

| Phase | Item | Status |
|-------|------|--------|
| Phase 0 | All code review criticals (22 commits) | DONE |
| Phase 0 | All code review majors (7 remaining → fixed) | DONE |
| Phase 0 | All code review minors (60+ items) | DONE |
| Phase 0 | All code review LOW findings | DONE |
| Phase 0 | Persona denylist + isReadOnly enforcement | DONE |
| Phase 0 | Dead/duplicate code cleanup | DONE |
| Phase 0 | Repo restructuring (.workspace/) | DONE |
| Phase 0 | Landing page update (tiers, crown jewels) | DONE |
| Phase 0 | UX assessment document | DONE |
| Phase 0 | Harvest UX polish (privacy headline, dedup summary) | DONE |
| Phase 0 | Wiki markdown export | DONE |
| Phase 0 | AI Act compliance proof document | DONE |
| Phase 0 | 8 interactive system visuals | DONE |
| Phase 0 | Strategic launch sequence visual | DONE |
| Phase 0 | 3 test plan documents (docx) | DONE |
| Phase 0 | hive-mind OSS repo scaffold | DONE |
| Prior | Self-evolution Phases 1-9 (357 tests) | DONE |
| Prior | Skills 2.0 (all 10 gaps) | DONE |
| Prior | 7 research reports | DONE |
| Prior | Harvest export manual | DONE |

---

## REMAINING — Execution Sequence

### Block 1: Marko's External Actions (parallel, start NOW)

| # | Action | Blocks | Time |
|---|--------|--------|------|
| M1 | Export ChatGPT conversations | Phase 1 harvest | 5 min |
| M2 | Export Claude conversations (claude.ai) | Phase 1 harvest | 5 min |
| M3 | Export Gemini (Google Takeout) | Phase 1 harvest | 10 min |
| M4 | Export Perplexity threads | Phase 1 harvest | 5 min |
| M5 | Top up API credits (Anthropic, OpenAI, Google) | Phase 4+5 judging | 15 min |
| M6 | Confirm judge models (Opus 4.6, GPT-5.4, Gemini 2.5 Pro, Haiku 4.5) | Phase 5 | Decision |
| M7 | Create Stripe products (Pro $19, Teams $49/seat) | Phase 7 launch | 1 hour |
| M8 | Buy Windows EV code signing cert ($300-500/yr) | Phase 7 launch | 1-3 days |
| M9 | Contact ML peer reviewer for papers | Phase 6 | 1 day |
| M10 | Greenlight launch date | Everything | Decision |

### Block 1b: E2E Test Fix Sprint (do FIRST next session)

| # | Task | Status |
|---|------|--------|
| E2E-1 | Delete stale .mind test data so server creates fresh DBs with full schema (ai_interactions table) | TODO |
| E2E-2 | Fix 23 failing E2E tests: schema migration (compliance tables) + UI selector drift | TODO |
| E2E-3 | Verify all E2E specs use canonical tier names (FREE/PRO/TEAMS/ENTERPRISE) — 5 files fixed, check remaining | DONE (5 files fixed in 5ccb96e) |
| E2E-4 | Run full E2E suite → 101/101 green | TODO |
| **GATE** | All E2E pass before any new feature work | |

### Block 2: Phase 1 — Harvest Marko's Real Data (~3 days, ~$50)

| # | Task | Depends on |
|---|------|-----------|
| 1.1 | Import ChatGPT conversations → harvest | M1 |
| 1.2 | Import Claude conversations → harvest | M2 |
| 1.3 | Re-harvest Claude Code (fresh, all sessions/projects) | — |
| 1.4 | Import Gemini conversations → harvest | M3 |
| 1.5 | Import Perplexity threads → harvest | M4 |
| 1.6 | BUILD Cursor adapter (~0.5-1 day) → harvest | — |
| 1.7 | Post-harvest cognify on all imported frames | 1.1-1.6 |
| 1.8 | Identity auto-populate from harvest | 1.7 |
| 1.9 | Wiki compile from real data | 1.7 |
| **GATE** | 10K-50K frames, dedup verified, KG populated | |

### Block 3: Phase 2 — Wiki Compiler v2 (~1 week)

| # | Task | Status |
|---|------|--------|
| 2.1 | Markdown export | DONE (exportToMarkdown + exportToDirectory) |
| 2.2 | Incremental recompilation after harvest batch | Engine supports it (watermarks exist) |
| 2.3 | Obsidian vault adapter | TODO |
| 2.4 | Notion structured export adapter | TODO |
| 2.5 | Wiki health report dashboard UI | TODO (types exist, UI missing) |

### Block 3b: Compliance Report UX + Template System (~3-4 days)

| # | Task | Status |
|---|------|--------|
| 3b.1 | PDF generation route: POST /api/compliance/export-pdf → pdfmake → buffer → download | TODO — buildComplianceDocDefinition exists, needs pdfmake render + route |
| 3b.2 | Template system: report templates stored as JSON (sections, logo, branding, footer text) | TODO — currently hardcoded in compliance-pdf.ts |
| 3b.3 | Full-page ComplianceReport viewer (not just dashboard card) — date range picker, section toggles, PDF download button | TODO — ComplianceDashboard is a 324-line card, needs standalone page |
| 3b.4 | Custom branding: company logo upload, org name, risk classification override | TODO — template field |
| 3b.5 | KVARK template: enterprise-grade report with IAM audit section, data residency proof, department breakdown | TODO — KVARK-specific template variant |

**Why template-based:** Different orgs need different branding, different sections emphasized, different compliance frameworks (AI Act vs SOC 2 vs ISO 27001). A template system lets the same engine produce tailored reports for each context — critical for the KVARK enterprise pitch.

### Block 4: Phase 3 — Harvest UX Full Polish (~1 week)

| # | Task | Status |
|---|------|--------|
| 3.1 | Privacy headline | DONE |
| 3.2 | Dedup summary | DONE |
| 3.3 | Live progress streaming (SSE from pipeline) | TODO — needs server-side SSE events during harvest |
| 3.4 | Resumable harvests (checkpoint every 100 frames) | TODO — needs pipeline checkpoint logic |
| 3.5 | Identity auto-populate screen | TODO — needs UI showing "here's what I learned about you" |
| 3.6 | Harvest-first onboarding tile UI | TODO — "Where does your AI life live?" |

### Block 5: Phase 4 — Memory Proof Test (~10 days, ~$300-500)

Per `docs/test-plans/MEMORY-HARVEST-TEST-PLAN.docx`:
| Step | What | Budget |
|------|------|--------|
| 4.1 | Harvest all platforms (uses Block 2 data) | ~$50 |
| 4.2 | Retrieval benchmarks (precision@k, MRR, recall) | ~$100 |
| 4.3 | Baseline comparisons (mem0, Letta, raw) | ~$100 |
| 4.4 | Performance benchmarks (latency at scale) | ~$20 |
| 4.5 | Write-path correctness (dedup, contradiction, KG) | ~$20 |
| 4.6 | Wiki quality eval (LLM-judged) | ~$50 |
| 4.7 | Compliance completeness check | $0 |
| **GATE** | Numbers defend Paper 1 claims | |

### Block 6: Phase 5 — GEPA Full-System Proof (~15-21 days, ~$1,500-2,500)

Per `docs/test-plans/GEPA-EVOLUTION-TEST-PLAN.docx`:
| Step | What | Budget |
|------|------|--------|
| 5.1 | Task suite curation (500-1000 tasks, 5 domains) | $0 |
| 5.2 | Baseline runs (Opus + GPT-5 + Gemma raw) | ~$300 |
| 5.3 | Multi-gen evolution (gen 1→2→3) | ~$500 |
| 5.4 | Ablation runs (8 arms) | ~$400 |
| 5.5 | 4-judge evaluation | ~$800 |
| 5.6 | Statistical analysis | $0 |
| **GATE** | Results publishable (positive or negative) | |

### Block 7: Phase 5b — Combined Effect Proof (~5-7 days, ~$500)

Per `docs/test-plans/COMBINED-EFFECT-TEST-PLAN.docx`:
| Step | What | Depends on |
|------|------|-----------|
| 7.1 | 200-task synergy test (6 arms) | Phase 4 + Phase 5 |
| 7.2 | Synergy score calculation | 7.1 |
| 7.3 | 10-task flywheel demonstration | 7.1 |
| **GATE** | Synergy score > 0 (p < 0.05) | |

### Block 8: Phase 6 — Write Papers (~1 week)

| # | Task | Depends on |
|---|------|-----------|
| 8.1 | Paper 1 (Memory): fill Phase 4 data into concept skeleton | Phase 4 gate |
| 8.2 | Paper 2 (GEPA/Evolution): fill Phase 5+7 data into concept skeleton | Phase 5+7 gates |
| 8.3 | External ML peer review | M9 |
| 8.4 | Publish to arXiv + waggle-os.ai/research/ | 8.3 |

### Block 9: Phase 7 — Launch Prep (~1 week)

| # | Task | Depends on |
|---|------|-----------|
| 9.1 | Stripe dashboard setup + smoke test | M7 |
| 9.2 | Code signing cert + updater keypair | M8 |
| 9.3 | hive-mind source extraction (Apache 2.0 boundary cut) | Scaffold DONE, extraction TODO |
| 9.4 | Binary build + smoke test on clean Windows VM | 9.2 |
| 9.5 | Clerk auth integration (after Stripe is live) | 9.1 |
| 9.6 | Onboarding flow finalized (harvest-first) | Block 4 |
| 9.7 | Mac notarization | M8 equivalent |
| 9.8 | Landing page final polish (Clerk login button, download links) | 9.5 |
| **GATE** | All 3 launch artifacts ready simultaneously | |

### Block 10: Launch Day

Simultaneous release:
1. Waggle OS free app (signed binary + auto-updater)
2. hive-mind OSS repo (Apache 2.0 — memory + harvest + wiki)
3. Two research notes (arXiv preprints)
4. LinkedIn 3-post sequence
5. Pro + Teams tiers active from day one

---

### Block 3c: UX Fixes from Assessment (~3-5 days)

From `docs/UX-ASSESSMENT-2026-04-16.md` — 10 ranked issues + 5 quick wins + engagement features.

**Quick wins (< 1 hour each, do first):**

| # | Fix | Effort |
|---|-----|--------|
| QW-1 | Auto-open chat window after onboarding (verify wm.openChatForWorkspace fires) | 15 min |
| QW-2 | Add text labels to Memory app feature tabs (Timeline/Graph/Harvest/Weaver/Wiki/Evolution) | 30 min |
| QW-3 | Skip boot screen on return visits (localStorage flag) | 15 min |
| QW-4 | Add "Back" button to onboarding wizard (steps 2-6) | 20 min |
| QW-5 | Rename dock tiers (Simple→Essential, Professional→Standard, Full Control→Everything) + clarify vs billing | 15 min |

**Medium fixes (1-4 hours each):**

| # | Fix | Effort |
|---|-----|--------|
| UX-1 | Reduce onboarding decisions: default to Blank template + General Purpose persona, skip to Ready | 2 hr |
| UX-3 | Memory app: replace 6 unlabeled icons with labeled tab bar | 1 hr |
| UX-4 | Dock: show text labels for first 7 days / first 20 sessions | 2 hr |
| UX-5 | Status bar: hide token count + cost behind developer mode toggle | 1 hr |
| UX-6 | Chat header: collapse secondary controls into overflow menu | 2 hr |
| UX-7 | Onboarding tier step: clarify dock tier ≠ billing tier | 30 min |

**Engagement features (half-day each):**

| # | Feature | Effort |
|---|---------|--------|
| ENG-1 | "I just remembered" toast after 5th message — surfaces memory aha moment | 4 hr |
| ENG-2 | WorkspaceBriefing as collapsible sidebar (not just empty-state) | 4 hr |
| ENG-3 | Progressive dock unlock nudge at 10/50 sessions | 2 hr |
| ENG-4 | LoginBriefing on every launch (reset per-session, "don't show again" option) | 2 hr |
| ENG-5 | Harvest-first onboarding: move import pitch to step 2 | 3 hr |
| ENG-6 | Memory Score / Brain Health metric in dashboard + status bar | 4 hr |
| ENG-7 | Suggested next actions after assistant response (2-3 contextual buttons) | 4 hr |

**Accessibility fixes (from appendix):**

| # | Fix | WCAG |
|---|-----|------|
| A11Y-1 | Boot screen: announce skip for screen readers | 2.1.1 |
| A11Y-2 | Dock: increase touch targets to 44x44px | 2.5.8 |
| A11Y-3 | Window title bar: add icons to min/max buttons (not color-only) | 1.4.1 |
| A11Y-4 | PersonaSwitcher: add aria-disabled to locked cards | 4.1.2 |
| A11Y-5 | Settings: add role="switch" + aria-checked to toggles | 4.1.2 |
| A11Y-6 | Dashboard: health dots shape differentiation (circle/triangle/X) | 1.4.1 |
| A11Y-7 | Chat feedback dropdown: focus trap + arrow keys | 2.1.1 |
| A11Y-8 | Global Search: add role="dialog" | 1.3.1 |
| A11Y-9 | Memory: add aria-label to importance slider | 1.3.1 |

**Responsive gaps (for web version):**

| # | Component | Issue |
|---|-----------|-------|
| R-1 | Dock | Power tier (14 items) overflows on < 768px — needs scroll or wrap |
| R-2 | StatusBar | 10+ items in flex row — hide non-essential below 900px |
| R-3 | ChatApp | Session sidebar 192px fixed — needs collapse on narrow windows |
| R-4 | OnboardingWizard | Template grid needs responsive column count |
| R-5 | AppWindow | Default sizes exceed mobile viewport — needs mobile layout |

### Block 3d: Items From CLAUDE.md Open Work (missed in prior passes)

| # | Item | Status | Notes |
|---|------|--------|-------|
| OW-1 | 4 new personas (general-purpose, planner, verifier, coordinator) | DONE | 22 personas exist in persona-data.ts |
| OW-2 | Extend AgentPersona interface (disallowedTools, isReadOnly, etc.) | DONE | Enforced in chat.ts this session |
| OW-3 | behavioral-spec.ts: split + COMPACTION_PROMPT | DONE | COMPACTION_PROMPT exported at line 381 |
| OW-4 | Orchestrator section caching | DONE | cachedSection() + uncachedSection() at line 320 |
| OW-5 | OnboardingWizard: 15 templates + real PERSONAS | DONE | 15 templates wired |
| OW-6 | **PersonaSwitcher: two-tier redesign** | **TODO** | Still flat 2-column grid. Target: "UNIVERSAL MODES" (8) + "YOUR WORKSPACE SPECIALISTS" (template-scoped). Hover tooltip: tagline + bestFor + wontDo |
| OW-7 | **Stripe webhooks audit** | **PARTIAL** | 5 files exist in server/src/stripe/ (checkout, webhook, portal, sync, index — 130+ LOC webhook). Needs smoke test against real Stripe dashboard. Blocked on M7 |

### Block 3e: Items Found in Cross-Reference (not in any prior backlog)

| # | Item | Source | Effort |
|---|------|--------|--------|
| CR-1 | **MS Graph OAuth connector** — harvest email, calendar, files | Master plan Phase 1, GTM §3.1.1 | 2-3 days |
| CR-2 | **Light mode full audit** — only 6 token swaps done, full sweep needed | S3 handoff, UX assessment | 0.5 day |
| CR-3 | **KG Viewer top-5 demo gaps** — loading state, error surface, export-PNG, touch events | docs/kg-viewer-ux-audit.md | 4-6 hr |
| CR-4 | **Demo video script** — 90-second harvest→wiki→insight + 5-minute deep dive | GTM §3.1.2, 14-day sprint | 1 day |
| CR-5 | **LinkedIn launch posts** — 3-post sequence over 10 days | GTM §3.1.3 | Content, not code |
| CR-6 | **hive-mind actual source extraction** — scaffold done, code copy TODO | Launch plan, Block 9.3 | 2-3 days |
| CR-7 | **CLAUDE.md update** — Section 10 "Open Work" is stale, shows items as TODO that are DONE | Housekeeping | 15 min |
| CR-8 | **Tauri binary build verification** — haven't built since the mega code changes | Launch readiness | 1 day |
| CR-9 | **Mac notarization setup** — alongside Windows signing | Launch prep | Marko action |

---

## STRATEGIC DECISIONS STILL NEEDED

| # | Decision | Unlocks |
|---|----------|---------|
| C1 | hive-mind OSS timing — ship with Waggle or before? | Launch sequencing |
| C5 | Harvest-first onboarding — replace step 2 or parallel opt-in? | Block 4 UX |
| C8 | Warm list — 5-10 names to pre-email 72h before launch | Launch credibility |
| C9 | Single-author or dual-author on papers? | Paper attribution |
| C11 | Marketplace model — free+attribution / freemium / enterprise-only? | Skills monetization |
| -- | EvolveSchema attribution — keep "Mikhail" or cite ACE (Zhang et al.)? | Paper 2 framing |

---

## CRITICAL PATH

```
Marko exports (M1-M4) ──► Phase 1 Harvest (3d) ──► Phase 4 Memory Proof (10d) ──► Paper 1
                           └─ parallel ─► Phase 2 Wiki v2 (7d)                     ↓
                           └─ parallel ─► Phase 3 Harvest UX (7d)      Phase 7b Combined (7d) ──► Paper 2
                                                                                    ↑
API credits (M5) ──► Phase 5 GEPA Proof (21d) ──────────────────────────────────────┘

Stripe (M7) + Signing (M8) ──► Phase 7 Launch Prep ──► LAUNCH DAY
hive-mind extraction ──────────────────────────────────► LAUNCH DAY
```

**Earliest launch: ~4-5 weeks from when Marko delivers exports + API keys + Stripe + cert.**

---

## TOTAL REMAINING BUDGET

| Phase | Budget |
|-------|--------|
| Phase 1 (Harvest) | ~$50 |
| Phase 4 (Memory proof) | ~$300-500 |
| Phase 5 (GEPA proof) | ~$1,500-2,500 |
| Phase 7b (Combined) | ~$500 |
| Windows EV cert | ~$300-500 |
| **TOTAL** | **~$2,650-4,000** |
