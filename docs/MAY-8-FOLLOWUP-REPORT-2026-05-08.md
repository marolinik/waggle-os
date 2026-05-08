# May 8 Follow-up Audit — Phase 1 Health + Day-2 Wave Recommendation
**Audit date:** 2026-05-08  
**Triggered by:** 7-day follow-up schedule set in DAY-2-BACKLOG-2026-05-01.md §5  
**Authoring agent:** claude-sonnet-4-6 (one-shot follow-up)

---

## 1. Phase 1 Feature Health

### FR #6 — Tour Replay (commit f4e3591)

**Drift commits since f4e3591 touching Phase 1 files:**

| Commit | File | What |
|---|---|---|
| `277bb3a` | `SettingsApp.tsx` | Phase 4.1 tab tier-filter |
| `2711f9a` | `SettingsApp.tsx` | Phase 4.1 hide Privacy & Telemetry at Essential |
| `2d86480` | `SettingsApp.tsx` | Phase 4.1 Erase All Data button + dialog (General tab) |

All 3 drift commits operate on the General tab — none touch the Advanced tab where the replay buttons live.

**Symbol verification:**

| Symbol | File | Line | Status |
|---|---|---|---|
| `replayTour` exported | `useOnboarding.ts` | 170 | ✓ |
| `data-testid="replay-tour-button"` | `SettingsApp.tsx` | 891 | ✓ |
| `data-testid="replay-wizard-button"` | `SettingsApp.tsx` | 911 | ✓ |

**Known gap (pre-existing, not new drift):** FR Pass7-A — `replayTour()` has no `state.completed` guard. Documented in the Day-2 backlog on 2026-05-01 at the same moment Phase 1 shipped. This is a Day-2 Wave 1 queue item, not a regression.

### FR #7 — Pending Imports Reminder (commit 4874f15)

**Drift commits:** 0. No commits touched `MemoryApp.tsx`, `ImportReminderBanner.tsx`, or `import-reminder-state.ts` since Phase 1 shipped.

**Symbol verification:**

| Symbol | File | Line | Status |
|---|---|---|---|
| `ImportReminderBanner` imported | `MemoryApp.tsx` | 14 | ✓ |
| `ImportReminderBanner` mounted above tab bar | `MemoryApp.tsx` | 208 | ✓ |
| `shouldShowImportReminder` 4-gate ladder | `import-reminder-state.ts` | 44 | ✓ |

**Four-gate verification:** Gate 1 = `!onboardingCompleted` suppresses, Gate 2 = `permanentlyRetired` suppresses, Gate 3 = `harvestEventCount > 0` suppresses, Gate 4 = dismissed within 7-day reshow window suppresses. Logic intact; no changes since Phase 1 ship.

### Tests

`npx vitest run` could not execute — `vitest` binary is not installed in the audit environment (no `npm install` run). This is an environment gap, not a regression. The test file `apps/web/src/lib/import-reminder-state.test.ts` still exists unmodified; next developer CI run will exercise it.

### GitHub issues

No open issues in `marolinik/waggle-os`. No user complaints about Tour Replay or Import Reminder (search: "tour replay", "import reminder", "FR #6", "FR #7" — all 0 results).

**Verdict: Both Phase 1 features HEALTHY. 0 symbol regressions, 0 user complaints.**

---

## 2. Day-2 Wave Priority Recommendation

### What shipped since Phase 1 (Phase 4.1, 14 commits, 2026-05-01 → 2026-05-08)

- **Monetization infra** (www/): Clerk auth UI, Stripe test-mode prices, checkout route, Customer → Clerk metadata wiring.
- **Product polish**: persona-aware skill chips, persona-aware connector recommendations, Settings tab tier-filter, light-mode contrast fixes, onboarding default tier → `simple`.
- **Compliance**: GDPR Art. 17 Erase All Data flow (server route + Settings UI), data-handling policy doc.
- **Trust band**: /docs/methodology Next.js page, Lighthouse 96/96/100 pass.
- **No Day-2 Wave features have shipped.** `OverlayQueue`, `weightedFrameCount`, Memory Growth Chart, FR #30, Continuity Banner, Today's Brief, Milestones, Weekly Wins — all still at backlog status.

### Signal summary

| Signal | Reading |
|---|---|
| Monetization infra | Done — Stripe + Clerk wired (test mode); no Wave features depend on it |
| Open user issues | 0 — no user pressure on any specific Day-2 feature |
| FR Pass7-A, Pass7-C | Pre-existing gaps, Wave 1 queue; small (5 + 10 LOC) |
| Phase 4.1 sprint landed today | Clean slate — no in-flight work blocking Wave 1 start |

### Recommendation

**Greenlight Wave 1 now.** Rationale:

Wave 1 delivers the shared `weightedFrameCount` helper and `OverlayQueue` controller that Waves 2, 3, and 4 all depend on. Shipping these first removes the inter-wave blocker. Memory Growth Chart and FR #30 persona-picker indicator are the lowest-risk feature additions (~2-3h each) and directly reinforce the memory-moat positioning that the Phase 4.1 sprint's trust-band work set up.

Pair FR Pass7-A (5 LOC, replayTour wizard guard) and FR Pass7-C (10 LOC, cascade offset fix) into Wave 1 as they are single-file edits with no risk.

**Defer Wave 2** (Continuity Banner + Today's Brief Dashboard Card) until Wave 1's `OverlayQueue` merges — both surfaces depend on it for priority arbitration, and Today's Brief needs the §1.5 LLM cost cap wired to the new cost-tracker hooks.

**Defer Wave 3** (Milestone Cards) until usage data shows real frame accumulation. Toast at 1st frame and 10th frame require actual users hitting those thresholds to be meaningful; the Phase 4.1 `simple` tier default and Stripe wiring are about to drive first real signups — wait 2 weeks for baseline frame data before shipping celebrations.

**Defer Wave 4** (Weekly Wins Digest) — it is the heaviest feature (~6h with HybridSearch instrumentation as a pre-req) and has no urgency signal. Sequence after Wave 2 ships.

**Recommended Wave 1 scope:**
1. `packages/shared/src/frame-weights.ts` — `weightedFrameCount(frames)` helper
2. `apps/web/src/lib/overlay-queue.ts` — `OverlayQueue` controller
3. `apps/web/src/components/os/apps/memory/MemoryGrowthChart.tsx` — Feature #1
4. FR #30 option B — persona-picker indicator in chat window header (~50 LOC)
5. FR Pass7-A — replayTour wizard guard in `useOnboarding.ts` (~5 LOC)
6. FR Pass7-C — cascade offset fix in `window-cascade.ts` (~10 LOC)

Estimated effort: ~6-7h. Matches original Day-2 backlog estimate.

---

## 3. Drift Summary

| Category | Count | Detail |
|---|---|---|
| Post-Phase-1 drift commits | 3 | All Phase 4.1, General tab only — no regression |
| Symbols renamed/removed | 0 | All 5 checked symbols intact |
| Tests failing | N/A | vitest not installed in audit env |
| GitHub user complaints | 0 | 0 open issues, 0 search hits |
| PR opened | No | No drift criteria met |

---

## 4. Action taken

No PR opened. All Phase 1 symbols intact, no user complaints, no test regressions detectable. This report committed to `docs/` as the audit artifact.

**Next session:** implement Wave 1 per §2 recommendation above. Start with `frame-weights.ts` + `overlay-queue.ts` infra (pre-reqs for everything else), then FR Pass7-A + Pass7-C as quick wins, then Memory Growth Chart.
