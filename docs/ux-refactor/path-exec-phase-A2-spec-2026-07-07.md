# Path-to-9 execution · PHASE A2 — complete the retrofit (R2/R3 died mid-flight) + V1/V2 findings
### Continues docs/ux-refactor/path-exec-phase-A-spec-2026-07-07.md after checkpoint `f2ab5896`.
### V1-motion reviewer FAILED acceptance with exact findings — they are the contract below.
### Same house rules. Per-lane gate: related vitest + eslint 0 errors. NO benchmarks/**, NO hive-mind.

## STAGE 1 (parallel — disjoint files)

### Lane R2 (retry) — memory + briefing + boot + theme retrofit
Files: `os/BootScreen.tsx`, `apps/memory/MemoryTrustManage.tsx`, `apps/memory/MemoryCenterTab.tsx`,
`providers/ThemeProvider.tsx`, `os/overlays/LoginBriefing.tsx`, tests. Do NOT touch index.css
(Stage-2 Lane R3 owns it) — ThemeProvider's JS-side 420ms timer aligns to the token value via
a shared constant/var read, or a comment-justified literal if the CSS var isn't readable there.
V1's exact survivors to tokenize (verify each live, then migrate to --mo-*/DUR/SPRING/STAGGER):
- BootScreen.tsx L89/144/151/163/182/194 — raw 0.5/0.3/0.4/0.2s + easeIn/Out.
- MemoryTrustManage.tsx L257 'card-enter 0.32s ease-out' + L605 '0.15s'.
- MemoryCenterTab.tsx L399 '0.15s'.
- LoginBriefing.tsx L297 raw duration:0.2 + ease:'easeOut' + local ENTER_STAGGER=0.08 literal
  → STAGGER.brief / DUR.base / EASE_OUT imports from lib/motion/tokens.
Tokenize, don't retune (values stay; only the source of truth changes). Reduced-motion
behavior of every migrated site must match the REDUCED mapping (most already gate via
useReducedMotion — verify, don't assume).

### Lane F2 — floor residuals + runtime-gate hardening
Files: locate-and-fix the THREE real near-AA residuals (V2's list, verify each live with
computed ratios before/after in the report): dark "workspace" label 4.38:1 (--text-dim over
--surface — likely Sidebar workspace sublabel), light "Solo" tier label 4.47:1, light
"Models" section label 3.88:1 (/settings). Informative text → --text-tertiary (or the
correct existing AA token); decorative-only text may stay dim WITH a justifying comment.
Plus `scripts/ux-gates/contrast-runtime.mjs` hardening: detect no-opaque-ancestor /
animating-opacity subtrees (the TrialExpiredModal false-positive cluster at 1.15–2.09:1 and
the two 'Fallback' 1.0:1 rows) and screenshot-sample those instead of CSS compositing.
Do NOT seed the baseline (post-stage-2 job — the tree is still moving).

## STAGE 2 (parallel — disjoint files; stage 1 merged)

### Lane R3 (retry) — chat + status chrome + index.css + THE INVENTORY TRUTH
Files: `apps/ChatApp.tsx`, `os/StatusBar.tsx`, `apps/WorkspaceDesktopApp.tsx`,
`apps/web/src/index.css` (reduce block + .theme-transition), `pages/MotionSpec.tsx`, tests.
V1's exact findings to close:
1. index.css `.theme-transition` L698 raw 360ms → `var(--mo-slow)` (or a dedicated
   --mo-theme var if 360≠320 is deliberate — decide, justify in-comment; keep ThemeProvider's
   JS timer consistent, coordinate value with what R2 left there).
2. index.css reduce block gates only 5 classes: extend `@media (prefers-reduced-motion)`
   to cover EVERY in-use animated class per the REDUCED mapping — specifically honey-pulse
   (used by StatusBar L152 with NO guard) and float (ChatApp L1003, unconditional). Audit
   the rest of the @keyframes zoo: every class used in components either appears in the
   reduce block or its component gates via useReducedMotion.
3. Dead inventory claims: 'hex-cursor caret static' and 'send-flash instant' are table text
   with NO component applying those classes — either wire the real behavior or mark the
   rows honestly as N/A-dead-class (do not fabricate).
4. Tokenize remaining raw durations in ChatApp (finish the partial edit), StatusBar,
   WorkspaceDesktopApp.
5. **MotionSpec inventory TRUTH** (V1 blocking #3): the inventory currently claims '✓ R2'
   / 'ambient ✓' / 'signature ✓' for work that never landed and an honesty note stating
   rows are 'applied in THIS commit' falsely. Rebuild the table from the ACTUAL tree state
   after your own edits (grep, don't trust prior rows); every row's status must be
   verifiable. The inventory misrepresenting reality is worse than no inventory.

### Lane R4 — the sweep: zero unjustified raw motion on judged surfaces
Files: everything under `apps/web/src/components/os/**` NOT owned by another lane this
phase (EXCLUDED: BootScreen, MemoryTrustManage, MemoryCenterTab, LoginBriefing, ChatApp,
StatusBar, WorkspaceDesktopApp, AllWorkspacesApp, SuggestedAgentCards, ExtensionCard,
onboarding WelcomeStep/WhoAreYouStep) + their tests.
Method: grep the scope for raw durations/easings (duration-NNN, duration-[NNNms] non-var,
`duration: 0.N`, transition inline styles, ease-out/in literals where a token exists);
migrate each to --mo-*/DUR/EASE_OUT; a site that is deliberately non-standard keeps a
one-line justifying comment instead. Report the FULL before/after list. Acceptance =
V1's criterion: zero UNJUSTIFIED non-token durations/easings across os/**.

## VERIFY (after stage 2)
- **V1'-motion (adversarial re-run)**: the same acceptance V1 failed — grep os/** for
  unjustified raw motion (report every survivor), confirm the reduce block + component
  guards cover every in-use animated class, confirm the MotionSpec inventory now matches
  the tree (spot-verify 6 rows with grep), run the motion token tests.
- **V2'-runtime**: run contrast-tokens + text-color-guard (must stay green); run the
  HARDENED contrast-runtime on /home + /settings both themes against the dev server
  (vite 8080 — if down, start per handoff recipe or report inability); confirm the three
  residuals now pass and the TrialExpiredModal cluster no longer false-positives; then
  SEED contrast-runtime-baseline.json from this clean run (triage: the baseline must
  contain only verified-acceptable rows, listed in your report) and re-run to prove exit 0.

## Orchestrator after verify
tsc web + full apps/web vitest + all three ux-gates green → commit "Phase A complete" →
launch Phase B (docs/ux-refactor/path-exec-phase-B-spec-2026-07-07.md).
