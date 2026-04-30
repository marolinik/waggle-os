# Onboarding Flow Investigation — 2026-04-30

**Status:** Research only. No code changed. PM friction reports FR #23-32 stay parked pending Marko's ratification on remediation path.

**Question:** Is the multi-step onboarding flow regressed, behind a flag, or routing to a skip-path? Where did the full flow go?

**Answer (one sentence):** The 8-step flow is healthy on `main`, fully implemented, and is the documented canonical UX — PM didn't see it because the fresh-state reset preserved the workspace shell directory, and `useOnboarding.ts` auto-completes the wizard whenever `/api/workspaces` returns ≥ 1 workspace.

---

## 1. The full flow exists and is documented

**Step files (all present in `apps/web/src/components/os/overlays/onboarding/`):**

```
WelcomeStep.tsx       ApiKeyStep.tsx
WhyWaggleStep.tsx     ModelTierStep.tsx
TierStep.tsx          TierStep.tsx
ImportStep.tsx        ReadyStep.tsx
TemplateStep.tsx      PersonaStep.tsx
```

**Step order** — `OnboardingWizard.tsx:34`:
```ts
const STEP_NAMES = ['welcome', 'why-waggle', 'tier', 'memory-import',
                    'template', 'persona', 'api-key', 'ready'];
```

**Documented in** (no ambiguity — Marko's mental model matches code):
- `docs/UX-ASSESSMENT-2026-04-16.md:36` — *"8-step full-screen wizard: Welcome (auto-advance 3s) → Why Waggle (value props) → Tier selection → Memory Import → Template selection (15 templates) → Persona selection (19 personas) → API Key entry → Ready (auto-advance 2s)."*
- `docs/product-analysis/FOUNDER-REVIEW.md:90` — *"Onboarding wizard: 8 steps. Best case (skip everything): ~5 seconds. Typical: 2-3 minutes."*
- `docs/product-analysis/FOUNDER-REVIEW.md:225` — recommends *"Reduce onboarding from 8 steps to 5"* (recommendation, not implemented).
- `docs/plans/HARVEST-AUDIT-2026-04-20.md:106` — references the wizard flow being amenable to "harvest-first onboarding" reordering.

**Each step covers what Marko remembered:**
- **WhyWaggleStep**: value props ("intermediate guidance messages")
- **ImportStep**: memory upload from ChatGPT / Claude / Gemini / Perplexity / Cursor / Claude Code (Marko's memory upload step)
- **TemplateStep**: workspace template selection (15 templates — sales-pipeline, research-project, code-review, etc.) — this is Marko's "workspace definition" with auto-naming from template name
- **PersonaStep**: persona picker (19 personas) — Marko's "user choice, not auto-Researcher"

---

## 2. Why PM didn't see it — the auto-complete branch

**Source:** `apps/web/src/hooks/useOnboarding.ts:77-106`

```ts
useEffect(() => {
  if (state.completed) return;
  let cancelled = false;
  (async () => {
    try {
      const workspaces = await adapter.getWorkspaces();
      if (cancelled) return;
      if (Array.isArray(workspaces) && workspaces.length > 0) {
        console.info(`[useOnboarding] returning user detected (${workspaces.length} workspaces on server) — auto-completing wizard`);
        const next: OnboardingState = {
          ...defaultState,
          completed: true,
          step: 7,
          tier: state.tier || 'power',
          tooltipsDismissed: true,
          apiKeySet: true,
        };
        saveState(next);
        setState(next);
      }
    } catch { /* sidecar unreachable — stay on wizard */ }
  })();
  return () => { cancelled = true; };
}, []);
```

**What this does:** on hook mount, if `state.completed === false`, calls `/api/workspaces`. If the response array has any length, flips `state.completed = true, step = 7` (final step) and persists to localStorage.

**Why it fired for PM's "fresh state":** the reset I executed (per Marko's ratified plan) preserved `~/.waggle/workspaces/default-workspace/workspace.json`. The backend's WorkspaceManager loads workspace metadata from that file on boot, so `/api/workspaces` returned 1 workspace. The hook auto-completed → `<OnboardingWizard>` was never rendered (gated by `!onboardingState.completed` in `Desktop.tsx:462`).

**What PM saw instead:**
1. **Boot** → service health probe + adapter.connect()
2. **Welcome modal "Default Workspace"** — this is `LoginBriefing.tsx`, not OnboardingWizard. LoginBriefing renders **after** onboarding completes; it's the "Welcome back, here's your memory" panel for returning users. Triggered by `Desktop.tsx:472` `{onboardingState.completed && ov.showLoginBriefing && (...)}`.
3. **Hero screen** — the bare desktop with dock + status bar + "Click an app in the dock" hint.
4. **Chat with starter prompts** — clicking the dock chat icon opens an empty chat window.

So PM correctly observed the post-completion experience — the wizard branch was bypassed entirely.

---

## 3. Git archaeology

### `04add13` — auto-complete behavior introduced

```
Author: Marko Markovic <marko.markovic@egzakta.com>
Date:   Sun Apr 12 00:15:01 2026 +0200
Subject: fix(onboarding): skip wizard for returning users + vault pre-check + name propagation

Bug #2 — Wizard re-shown for returning users.
  The wizard's gating was purely localStorage-based, so a fresh
  Tauri webview (or a browser-profile switch) always looked "new"
  even when the sidecar already had the user's memory, workspaces,
  and vault. useOnboarding now issues a one-shot query to
  /api/workspaces on mount; if any workspace is returned, the user
  is flagged completed with tier=power and tooltipsDismissed=true.
  Sidecar-unreachable keeps the wizard visible so genuine first-run
  still works.
```

**Verdict:** intentional fix authored by Marko. Not a regression. The behavior is correct for the documented use case (Tauri webview switch with real existing data on the sidecar).

### `bd1f1f1` — Tauri filesystem flag (NOT on main)

```
Author: Marko Markovic <marko.markovic@egzakta.com>
Date:   Wed Apr 29 23:19:46 2026 +0200
Subject: feat(sesija-a/A11): wire useOnboarding to Tauri first-launch flag
Branch:  feature/apps-web-integration  ← not merged to main
```

This commit added a complementary Tauri-side filesystem flag (`~/.waggle/first-launch.flag`) so onboarding state survives WebView profile resets in Tauri mode. Lives only on `feature/apps-web-integration`. **Irrelevant to PM's main-branch test** — the current main has only the workspaces-check.

### Other recent onboarding commits on main (Apr 12 - Apr 29)

```
1b40a51  feat(web): M-10 — onboarding tile expansion + Claude Code auto-detect
4031035  fix(web): P1 — forward personaId from onboarding finish to first chat window
792755f  feat(web): P17.4 — Overlays + onboarding title= → HintTooltip
cf1ec6e  feat(web): L-02 + L-04 — responsive StatusBar + onboarding template grid
304b231  feat(web): M-18 · UX-1 — "Skip and set me up" shortcut on WhyWaggle step
8782cab  feat(web): Phase A/B polish — spawn-agent empty states + theme-aware logo
70c8d84  feat(web): QW-5 — rename dock tiers + clarify vs billing
47539ac  feat(web): QW-4 — Back button on onboarding steps 2-6
9a4ddbe  feat(onboarding): custom OR model input + OpenRouter fallback routing
2dc8f93  feat(onboarding): 3-tier model picker with free-first default
9776109  fix(ux): explicit Continue button on WelcomeStep (WCAG 2.2.1)
a5f6968  fix(ux): WCAG 2.1 AA pass on PersonaSwitcher + OnboardingWizard shells
77c188e  feat(onboarding): expand to 15 templates, 22-persona system
7c45176  fix(web): show workspace creation error in onboarding instead of silent local fallback
```

All of these are **enhancements** to the existing 8-step flow. None remove steps or short-circuit the wizard. The flow has been actively maintained, not regressed.

---

## 4. Remediation options for PM walkthrough

The flow code is fine. The issue is purely "how do we get the wizard to render for testing".

### Option A — Deeper reset (recommended for PM walkthrough)

Add to the wipe step:
```bash
rm -rf ~/.waggle/workspaces/default-workspace
```

After this, `/api/workspaces` returns an empty array (or just a placeholder). The auto-complete branch's `workspaces.length > 0` evaluates false, the wizard renders. PM gets the true 8-step flow.

**Side effect:** the backend may regenerate `default-workspace` on first interaction (workspace creation is part of the wizard's `handleFinish` path). Walkthrough should still work end-to-end. The new workspace gets the user's chosen template + persona + name.

**Implementation:** when PM signals readiness, I can:
1. Stop backend.
2. `rm -rf ~/.waggle/workspaces/default-workspace`.
3. Restart backend with `WAGGLE_PROMPT_ASSEMBLER=1`.
4. Verify `/api/workspaces` returns empty / placeholder-only.
5. PM clears localStorage + reloads → wizard renders.

This preserves the rest of the prior reset (no memories, no other workspaces, vault keys intact).

### Option B — Force-render flag for testing (code change, scope creep)

Add a `?forceWizard=true` URL param to `useOnboarding.ts` that bypasses the workspaces check. Symmetric with the existing `?skipOnboarding=true` E2E bypass at line 27.

Cost: small code change (~10 LOC), needs typecheck + commit + push. Marginal benefit over Option A. **Not recommended unless PM repeats this fresh-state test often.**

### Option C — Ratify the current 4-surface flow as Day 0 UX

If Marko/PM decide the 8-step flow is too long for Day 0 launch (founder review explicitly recommended reducing to 5 steps), the current "Welcome modal + Hero + Chat" auto-advance path could be ratified as the intentional shipped UX. Then the wizard becomes a **secondary** flow accessed via a hypothetical "Reset onboarding" affordance in Settings.

This is a **product decision**, not a code question. Out of scope for this investigation.

---

## 5. Findings summary table

| Question | Answer |
|---|---|
| Does the multi-step flow exist in code? | **Yes** — 8 steps, fully implemented, enhanced as recently as 2026-04-26. |
| Does it cover Marko's remembered steps (workspace def + persona picker + memory upload + intermediate guidance)? | **Yes** — TemplateStep + PersonaStep + ImportStep + WhyWaggleStep cover all four. |
| Is it documented as the canonical Day 0 UX? | **Yes** — `UX-ASSESSMENT-2026-04-16.md` and `FOUNDER-REVIEW.md` both describe the 8-step flow as the current state. |
| Is it behind a feature flag? | **No** — no `WAGGLE_*` env var or feature flag gates it. |
| Why didn't PM see it on the fresh-state walkthrough? | **`useOnboarding.ts:77-106`** auto-completes the wizard whenever `/api/workspaces` returns ≥ 1 workspace. The reset preserved `default-workspace/workspace.json`, so the backend reported 1 workspace, auto-complete fired, wizard never rendered. |
| Is this a regression? | **No** — the auto-complete behavior is intentional (commit `04add13`, 2026-04-12, fixes Bug #2 "wizard re-shown for returning users on Tauri webview switch"). |
| Recommended remediation? | **Option A**: `rm -rf ~/.waggle/workspaces/default-workspace` and restart. Simplest, no code change, preserves the rest of the reset. |

---

## 6. PM friction reports FR #23-32 — what they're for

PM's friction reports were written against the **truncated 4-surface flow** PM actually saw. After Option A unblocks the full 8-step wizard, those friction reports may need re-triage:

- Some FR's may be valid for the post-onboarding state (LoginBriefing, Hero, dock, chat) regardless of which onboarding flow was used → still valid, ship-as-is.
- Some FR's may be specific to the truncated flow's UX gaps (e.g., "no persona picker offered") → moot once the wizard renders.
- Some FR's may surface NEW bugs in the wizard itself (Welcome → WhyWaggle → Tier → Import → ... transitions) → the **reason** to re-trigger the wizard for a proper test.

**Recommendation:** before fix-batching FR #23-32, run the deeper reset (Option A) and have PM re-walkthrough. Re-triage the friction reports against the 8-step flow.

---

## 7. Out-of-scope notes

- The `bd1f1f1` Tauri filesystem flag is on `feature/apps-web-integration`, not main. If/when that branch merges, the auto-complete logic gets a second trigger (Tauri-side flag) — same gating, more durable. Doesn't affect main.
- The founder review's "reduce to 5 steps" recommendation has not been implemented. If Marko wants to act on that for Day 0 launch, that's a separate scope.
- I did not modify any code or run any commands during this investigation — strictly research per the brief.

---

**File references:**
- `apps/web/src/hooks/useOnboarding.ts:77-106` — the auto-complete branch
- `apps/web/src/components/os/overlays/OnboardingWizard.tsx:34` — `STEP_NAMES`
- `apps/web/src/components/os/overlays/onboarding/*.tsx` — 9 step component files
- `apps/web/src/components/os/Desktop.tsx:462-464` — wizard mount conditional
- `apps/web/src/components/os/overlays/LoginBriefing.tsx` — what PM mistook for the welcome step
- `docs/UX-ASSESSMENT-2026-04-16.md:36` — canonical 8-step flow description
- `docs/product-analysis/FOUNDER-REVIEW.md:90, 225` — flow described + reduction recommendation
- Commit `04add13` (2026-04-12) — auto-complete-for-returning-users fix
- Commit `bd1f1f1` (2026-04-29, on `feature/apps-web-integration`) — Tauri flag addition (NOT on main)
