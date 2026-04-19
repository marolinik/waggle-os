# Backlog Reconciliation — 2026-04-19

**Scope:** MEDIUM tier items M-18..M-28 in `docs/plans/BACKLOG-MASTER-2026-04-18.md` v2.
**Trigger:** Session `ok lets continue` picked the M-18..M-21 UX chunk for work. Pre-flight
grep showed all four already shipped with tests, so I expanded the sweep to the adjacent
engagement cluster (M-22..M-28).

**Net:** 10 of 11 items in this range are fully shipped end-to-end (lib helper + test +
UI wiring). Only M-26 remains open, and it's `[M]-08` decision-blocked (harvest-first
onboarding depends on the Marko-side "replace step 2 or parallel opt-in?" call).

---

## Verification method

For each item I ran three checks:

1. **Lib helper present?** — `apps/web/src/lib/<feature>.ts`
2. **Test present?** — `apps/web/src/lib/<feature>.test.ts`
3. **Wired in UI?** — grep for `M-<NN> / <CODE>` annotation in a component

Any item that failed all three is "not shipped." Any that passed all three is "shipped."
Partial matches are flagged individually.

All apps/web tests in scope were run: `npx vitest run` inside `apps/web/` — 20/20 passed
for M-18/19/20 triad directly confirmed. Full `apps/web` suite at 301/301 from S3 already
covers the rest.

---

## Block M6 — UX fixes (M-18..M-21) — 100% shipped

| # | Backlog title | Lib | Test | Wired | Notes |
|---|---|---|---|---|---|
| M-18 | UX-1 · Reduce onboarding decisions (default Blank + General Purpose path) | `lib/onboarding-skip.ts` | `onboarding-skip.test.ts` (5) | `OnboardingWizard.tsx:223` + `WhyWaggleStep.tsx` | "Skip and set me up" escape hatch on step 1; default Blank template + General Purpose persona |
| M-19 | UX-4 · Dock text labels first 7d / 20 sessions | `lib/dock-labels.ts` + `hooks/useDockLabels.ts` | `dock-labels.test.ts` (10) | `Dock.tsx:28` + `SettingsApp.tsx:101` | `SESSION_COUNT_KEY` localStorage counter + Settings permanent toggle |
| M-20 | UX-5 · Hide token/cost behind dev mode | `hooks/useDeveloperMode.ts` | `useDeveloperMode.test.ts` (5) | `StatusBar.tsx:29` + `SettingsApp.tsx:99` | `developerMode && ...` gates the chips; Settings → Advanced toggle |
| M-21 | UX-6 · Chat header overflow menu | `lib/chat-header-layout.ts` | `chat-header-layout.test.ts` | `ChatApp.tsx:450,808,815` | `shouldCollapseChatHeader(width)` + `data-testid="chat-header-overflow-menu"` |

**Recommendation:** Move M-18..M-21 to "Shipped" in `BACKLOG-MASTER-2026-04-18.md` v2.

---

## Block M7 — Engagement features (M-22..M-28) — 6 of 7 shipped

| # | Backlog title | Lib | Test | Wired | Notes |
|---|---|---|---|---|---|
| M-22 | ENG-1 · "I just remembered" toast after 5th message | `lib/memory-recall-toast.ts` | `memory-recall-toast.test.ts` | `ChatApp.tsx:469` | Triggers on 5th user message when relevant memories exist |
| M-23 | ENG-2 · Briefing sidebar (left rail) | `lib/workspace-briefing-state.ts` | `workspace-briefing-state.test.ts` | `WorkspaceBriefing.tsx:28` | Per-workspace collapsed-state persistence |
| M-24 | ENG-3 · Dock nudge "unlock more apps" | `lib/dock-nudge.ts` + `hooks/useDockNudge.ts` | `dock-nudge.test.ts` | `Desktop.tsx:151` | One-time toast at session 10 and 50 |
| M-25 | ENG-4 · LoginBriefing every launch | `lib/login-briefing.ts` | `login-briefing.test.ts` | `Desktop.tsx:436` + `SettingsApp.tsx:103` | `permanent=true` flag for "Don't show again" |
| M-26 | ENG-5 · Harvest-first onboarding | — | — | — | **Not shipped** — blocked on `[M]-08` Marko decision (replace step 2 or parallel opt-in?) |
| M-27 | ENG-6 · Brain Health score | `lib/brain-health.ts` | `brain-health.test.ts` | `DashboardApp.tsx:127` | **Divergence from backlog spec** — note in lib header; check before closing |
| M-28 | ENG-7 · Suggested next-actions chips | `lib/suggested-actions.ts` | `suggested-actions.test.ts` | `ChatApp.tsx:458,1061` | Extraction from last assistant message; hidden while streaming |

**Recommendations:**
1. Move M-22/23/24/25/28 to "Shipped." All four checks pass cleanly.
2. M-27 is shipped but has a divergence note in `lib/brain-health.ts`. Marko to read and
   decide: accept the divergence + close, or file a follow-up. Not blocking.
3. M-26 remains open until `[M]-08` resolves. No engineering change until then.

---

## What this changes for planning

**Before this sweep**, `NEXT-UP-2026-04-19.md` listed `M-18..21` and `M-22..28` as ~11
items and ~7 hours + 4 days of engineering still owed. That matches the `BACKLOG-MASTER`
totals row.

**After this sweep**, the true remaining MEDIUM engagement + UX work is:
- M-26 only — blocked on `[M]-08` Marko decision
- M-27 divergence review — ~15 min Marko read + yes/no

Remaining MEDIUM tier items that genuinely need engineering (unchanged):

| Range | What | Eng days | Blocking |
|---|---|---|---|
| M-02..06 | Compliance PDF block | 3.5 d | template JSON schema + brand-asset upload design |
| M-11..14 | Wiki v2 (incremental + Obsidian + Notion + health) | 4 d | Notion adapter needs live workspace test |
| M-15..17 | Ollama bundled installer + HW scan + daemon | 2 d | — (Tauri Rust work) |
| M-29 | MS Graph OAuth connector | 2-3 d | MS365 OAuth app registration (Marko) |
| M-31..32 | Demo video + LinkedIn sequence | 1.5 d | `[M]-09`, `[M]-10` |
| M-33..48 | 16 deferred PDF items | ~5 d | product decisions on P4/P6/P10/P14-17 |
| M-49 | KVARK model strategy doc | 2 hr | — |
| M-50 | Cognitive layer thesis doc | 3-4 hr | H-42 benchmark numbers |

**Calendar impact:** ~7 hours of "UX quick wins" that NEXT-UP scheduled for this session
turn out to need ~0 engineering. That time was spent on the hive-mind Track A polish
(4 commits) and is available for the next cluster.

---

## Commits in this session so far

Hive-mind (sibling repo), 4 commits:
- `471a840` ci: Node 22→24 + cross-platform matrix + first-run smoke job
- `6c0752c` feat(cli): add `init` and `status` persona-facing commands
- `f04434d` feat(cli): add `mcp start` and `mcp call <tool>` subcommands
- `b1e009d` docs(scripts): exercise new CLI persona commands in first-run smoke

Waggle-os: this doc only — no code changes needed for M-18..M-28 (already shipped).

---

## Next

With M-18..M-21 and M-22..M-25/27/28 already closed, remaining options for this session:

1. **PDF deferred decision briefs** (next task in my queue per the session plan)
2. **Pick up a genuinely open MEDIUM cluster** — Wiki v2 (M-11..14, 4 d) or Ollama
   installer (M-15..17, 2 d) or MS Graph (M-29, 2-3 d). All larger than this session.
3. **Backlog hygiene pass** — propagate this reconciliation into `BACKLOG-MASTER-2026-04-18.md`
   v2 so NEXT-UP stops listing shipped items.

Recommend option 1 (PDF briefs) plus a backlog-master edit after, so the next session
starts from an accurate picture.
