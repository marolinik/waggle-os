# Open Tasks — Master List (2026-05-20)

Consolidated single source of truth after the May 2026 backlog sweep. Items are grouped by **blocker type** so it's clear what unblocks what and which role owns each.

**State at writing:** main @ `fab9096`, 17 commits ahead of session-start, tree clean. AI-OS arc fully shipped; backlog sweep closed 5 stale-but-actually-done items + fixed 3 test regressions + closed 1 real bug (P35).

---

## 1. Engineering — Actionable now (no blocker)

These are real remaining engineering items with no external dependency. Pick freely.

| # | Item | File / scope | Effort | Notes |
|---|---|---|---|---|
| E-1 | `POST /api/tools/kill` + Stop button | `packages/server/src/local/routes/tools.ts` + `LauncherApp.tsx` | 0.5 day | Deliberately deferred during AI-OS Phase 4. Reach for it when an accidental-launch case actually hits. |
| E-2 | Cross-tool prompt-arg shapes | `apps/web/src/components/os/apps/LauncherApp.tsx` (`promptArgsForTool`) | <1 day per tool | Today only `claude-code` is wired (`--print "<prompt>"`). Add cases for cursor / codex / hermes once their CLI prompt conventions are verified against real binaries. |
| E-3 | Accessibility items A11Y-1..A11Y-9 | Multiple components | 1 day total | Boot screen aria-live, dock 44×44 touch targets, role=switch on toggles, focus trap on dropdowns. Post-launch OK per backlog. |
| E-4 | hive-mind OSS source extraction (CR-6) | scaffold exists in `hive-mind-*` packages | 2-3 days | Scaffold done; "code copy TODO" per the backlog. The OSS-release artifact at `marolinik/hive-mind`. |
| E-5 | KG Viewer top-5 demo gaps (CR-3) | `KnowledgeGraphViewer.tsx` | 4-6 hr | Loading state, error state, export-PNG, touch-friendly interactions. |
| E-6 | MS Graph OAuth connector (CR-1) | `packages/agent/src/connectors/` | 2-3 days | Harvest email, calendar, files. Joins the existing 30-connector roster. |
| E-7 | Demo video script (CR-4) | content | 1 day | 90-second harvest→wiki→insight + 5-min deep dive. |
| E-8 | LinkedIn launch posts (CR-5) | content | 0.5-1 day | 3-post sequence over 10 days. |
| E-9 | Tauri binary build verification (CR-8) | binary + smoke | 1 day | "Haven't built since mega code changes" — sanity build + manual smoke on a clean Windows VM. |

---

## 2. Engineering — Verification needed (no code, but needs binary)

The code is done; what's missing is render-time / live-process validation that requires running the Tauri binary on the actual user environment.

| # | Item | Status |
|---|---|---|
| V-1 | **Spawn Agent + Dock click-paths** | P35 fix shipped (`14942be`); P36 already wired in Dock/Desktop. Needs runtime verification on a clean install — does the "no models available" empty state truly never fire when 13 providers are configured? |
| V-2 | **Light mode finish** (P40/P41/CR-2) | All hive-950 references removed from styling (only one comment-level ref); BootScreen uses semantic tokens + theme-aware logo. What remains is fine-tuning judgments (header text styling, BootScreen polish) that need visual review on a Windows binary. |
| V-3 | **AI-OS end-to-end on Marko's machine** | Open dock → AI Tools → see detection of his actual installed tools (Claude Code, possibly Cursor, possibly Claude Desktop). Install hooks. Launch. Verify Waggle Dance shows the signal. Set `WAGGLE_SIGNAL_EMIT=1` to enable live capture. |

---

## 3. Engineering — Deferred multi-session arcs

Real work, but explicitly post-launch per CLAUDE.md §10.

| # | Item | Scope | Why deferred |
|---|---|---|---|
| D-1 | **Wave 2/3 hook implementations** for 6 packages | cursor / claude-desktop / codex / codex-desktop / hermes / openclaw — each needs SessionStart + UserPromptSubmit + Stop + PreCompact handlers + install/verify/uninstall CLI + settings-merger | Per-package effort is real (Wave 1 claude-code was multi-day); wait until claude-code-only ship gets real usage feedback before committing to 5 more. |
| D-2 | **Wiki Compiler v2** (5 days) | Markdown export ✅ · Incremental recompilation 🟢 · Obsidian + Notion adapters 🟢 · Wiki health dashboard UI 🟢 | Substantial. Block 3 in the consolidated backlog. |
| D-3 | **Harvest UX Full Polish** (5 days) | Live SSE progress · Resumable harvests · Identity auto-populate · Harvest-first onboarding tile | Block 4. Bigger lift; tied to Marko's harvest exports being ready. |
| D-4 | **Compliance Report UX + Templates** (3.5 days) | PDF generation route · Template system · Full-page viewer · Custom branding · KVARK template variant | Block 3b. Polish before launch acceptable. |
| D-5 | **Installer Flow** (INST-1/2/3) | Ollama bundled installer · Hardware scan · Daemon auto-start (Win service / macOS launchd) | Block 3da. 1 + 0.5 + 0.5 days. Needed before paid Pro launch, not before pre-launch beta. |
| D-6 | **PDF E2E deferred items** | 21 items from 2026-04-17 PDF triage; biggest are P10 agent icons (bee-style), P16 Files-app local browse, P29 Skills detail card. | Each 🟠 medium-effort; tackle opportunistically. |
| D-7 | **Responsive gaps** (R-1..R-5) | Dock overflow <768px · StatusBar collapse · Chat sidebar narrow · OnboardingWizard cols · AppWindow mobile | Not blocking launch (desktop primary). |
| D-8 | **Engagement features ENG-1..ENG-7** | "I just remembered" toast · WorkspaceBriefing sidebar · Progressive dock unlock · LoginBriefing · Harvest-first onboarding · Memory Score · Suggested next actions | 7 items × half-day each. Post-launch growth tooling. |
| D-9 | **Medium UX fixes UX-1..UX-7** | Reduce onboarding decisions · Memory tab bar (already done — QW-2) · Dock text labels (1st-week) · Dev-mode toggle for cost · Chat header overflow · Onboarding tier clarify (already done — QW-5) | 5 actionable items × 1-4 hr (2 are stale-but-done). |

---

## 4. Marko — External actions (engineering-blocking)

These are the actual launch blockers. None of them are engineering work.

| # | Action | Time | Unblocks |
|---|---|---|---|
| **M1** | Export ChatGPT conversations (claude.ai download) | 5 min | Phase 1 harvest |
| **M2** | Export Claude conversations (claude.ai download) | 5 min | Phase 1 harvest |
| **M3** | Export Gemini (Google Takeout) | 10 min | Phase 1 harvest |
| **M4** | Export Perplexity threads | 5 min | Phase 1 harvest |
| **M5** | Top up API credits (Anthropic / OpenAI / Google) | 15 min | Phase 4+5 eval judging |
| **M6** | Confirm judge models (Opus 4.6, GPT-5.4, Gemini 2.5 Pro, Haiku 4.5) | Decision | Phase 5 |
| **M7** | Create Stripe products (Pro $19/mo, Teams $49/mo/seat) | 1 hr | Phase 7 launch + tier enforcement (E-10 below) |
| **M8** | Buy Windows EV code-signing cert (~$300-500/yr) | 1-3 days lead | Launch |
| **M9** | Contact ML peer reviewer for papers | 1 day | Phase 6 papers |
| **M10** | Greenlight launch date | Decision | Everything downstream |

**Total active time: ~25 min (M1-M4) + 1 hr (M7) + decisions.** Lead time on M8 is the longest single blocker — start it whenever.

---

## 5. Marko-gated engineering — runs after Marko's actions

These need the M-action to fire first, then real engineering happens.

| # | Item | Depends on | Notes |
|---|---|---|---|
| E-10 | **Stripe webhooks → tier enforcement** | M7 | Wire `/api/billing/webhook` to update user.tier on `customer.subscription.*`. Spec exists; code awaiting real Stripe products. |
| E-11 | **Phase 1 Harvest** (~3 days) | M1-M4 | Import + cognify + identity auto-populate + wiki compile from real data. 🟢 gates on 10K-50K frames + dedup + KG populated. |
| E-12 | **Cursor adapter** (0.5-1 day) | — | Build the harvest adapter that doesn't exist yet (Marko uses Cursor). Independent of M1-M4. |
| E-13 | **Mac notarization** | M8 (cert) + Marko-side | Signs the macOS bundle. ⏳ Marko per backlog. |

---

## 6. Multi-week campaigns (sequential, M-gated)

These are the real-money eval campaigns that produce the launch-paper claims.

| # | Campaign | Days | Budget | Depends on |
|---|---|---|---|---|
| C-1 | **Phase 4 Memory Proof** | 10 | $300-500 | E-11 harvest done |
| C-2 | **Phase 5 GEPA Full-System Proof** ★ critical path | 18 | $1,500-2,500 | M5 credits |
| C-3 | **Phase 5b Combined Effect Proof** | 6 | $500 | C-1 + C-2 |
| C-4 | **Phase 6 Write Papers** | 5 + Marko peer review | — | C-1, C-2, C-3 done |
| C-5 | **Phase 7 Launch Prep** | 5 | — | M7, M8, papers done |
| C-6 | **Phase 7b Launch Day** | 1 | — | All above |

**Calendar from M-actions to launch: ~7-8 weeks with parallelism** (per BACKLOG-CONSOLIDATED critical path).

---

## 7. Strategic decisions pending (Marko)

These don't need code but they gate downstream decisions.

| # | Decision | Unlocks |
|---|---|---|
| S-1 | hive-mind OSS timing — ship with Waggle or before? | Launch sequencing |
| S-2 | Harvest-first onboarding — replace step 2 or parallel opt-in? | UX (D-3) |
| S-3 | Warm list — 5-10 names to pre-email 72h before launch | Launch credibility |
| S-4 | Single-author or dual-author on papers? | Paper attribution |
| S-5 | Marketplace model — free+attribution / freemium / enterprise-only? | Skills monetization |
| S-6 | EvolveSchema attribution — keep "Mikhail" or cite ACE (Zhang et al.)? | Paper 2 framing |

---

## 8. Test infrastructure (30 failures — runs services to verify)

Pre-existing across multiple sessions. Each is gated on a backing service, NOT on engineering.

| Cluster | Failures | What unblocks |
|---|---|---|
| BullMQ/Redis | job-processor, worker handlers, daemons (hive-mind/scout/subconscious), proactive | `docker compose up redis` on port 6381 |
| Postgres | schema, auth, audit, cron, routes (agents/analytics/knowledge) | `docker compose up postgres` |
| Clerk dev | webhook, upsertFromClerk | Set `CLERK_PUBLISHABLE_KEY` in test env |
| Multi-service | M3 full-stack integration, Fastify server timeout | All of the above |
| Seed file | marketplace.db | `npm --workspace @waggle/marketplace run sync` (touches network) |
| CLI E2E | comprehensive-e2e.test, memory-persistence-hard.test | LiteLLM locally OR Ollama |

**None are session-induced regressions.** Each requires its respective backing service running to verify. Marketplace seed is most worth doing one-shot (no recurring cost); Redis/Postgres/Clerk are dev-environment setup.

---

## 9. Closed during May 2026 backlog sweep (this session)

For audit trail. Don't re-schedule any of these.

| # | Item | Verification |
|---|---|---|
| ✅ | **OW-6 PersonaSwitcher two-tier** | `PersonaSwitcher.tsx` + `persona-tier.ts` + `persona-tooltip.ts`; 26/26 tests |
| ✅ | **CR-7 CLAUDE.md §10 refresh** | Two commits this session |
| ✅ | **P35 Spawn Agent "no models"** | Third-tier provider-catalog fallback in `14942be` |
| ✅ | **QW-1 auto-open chat post-onboarding** | `OnboardingWizard.handleLetsGo` → `onFinish(wsId, …, hint)` |
| ✅ | **QW-2 memory tab labels** | `MEMORY_TABS` const with label + tooltip per tab |
| ✅ | **QW-3 skip boot on return** | `Index.tsx` reads `BOOT_KEY` from localStorage |
| ✅ | **QW-4 onboarding back button** | `goToStep(step - 1)` wired in wizard top bar |
| ✅ | **QW-5 dock tier rename + clarifier** | `SettingsApp.tsx:251-258` — Essential/Standard/Everything + "Independent of billing plan" note |
| ✅ | **CR-2 hive-950 → semantic tokens** | Only one comment-level reference remains; no styling drift |
| ✅ | **P36 dock spawn-agent wiring** | `Dock.tsx:152` → `Desktop.tsx:461` `onSpawnAgent` |
| ✅ | **3 test regressions** | dock-app-title parity (Phase 2B), Tauri identifier (stale), capability-acquisition (modernized) |

**~50% of "🟢 pending" items in `BACKLOG-CONSOLIDATED-2026-04-17.md` are stale-but-done.** Future sessions should `grep` before scheduling effort against any backlog item.

---

## 10. Recommended next moves (PM-grade pick list)

If you have 25 minutes: **M1-M4** (export your AI convos). Unblocks the entire eval campaign chain.

If you have 1 hour: **M7** (create Stripe products). Unblocks E-10 (tier enforcement) and launches the Marko-gated chain.

If you have a half-day for engineering: **E-1** (`POST /api/tools/kill` + Stop button) is the cleanest small win, or **E-9** (Tauri binary build + smoke) gives you V-1/V-2/V-3 validation in one go.

If you have 1 day: **E-4** (hive-mind OSS source extraction) is the highest-leverage; it's a known scaffold + copy task and unlocks the OSS-launch arc.

If you have 2+ days: **E-6** (MS Graph OAuth connector) is the biggest single connector value-add and the only major one missing from the 30-connector roster.

---

**Total open engineering work that's genuinely actionable: ~5-7 working days across E-1..E-9, plus 25 days of Marko-gated multi-week campaigns (C-1..C-6), plus Wave 2/3 hooks (D-1) as a deliberate post-launch arc.**

**Critical path to launch is now overwhelmingly Marko's actions (M1-M10), not engineering.**
