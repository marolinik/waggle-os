# Path-to-9 execution · PHASE A — motion vocabulary (Phase-0) + AA/affordance floor (Pillar 4)
### Contract: docs/ux-refactor/path-to-9-2026-07-07.md (v3, 5/5 panel-endorsed). Same honesty
### rules as waves P–X: surgical, both themes, testids/aria survive, reduced-motion gated.

Two sequential stages (stage 2 depends on stage 1's exports). Per-lane gate: related
vitest green + eslint 0 errors on touched files. NO benchmarks/**, NO packages/hive-mind-*.

## STAGE 1 (parallel lanes)

### Lane M — motion tokens + spring family + spec page (Phase-0 items 1,2,3,5,7)
NEW files only + index.css additions. Files: `apps/web/src/lib/motion/tokens.ts` (new),
`apps/web/src/lib/motion/tokens.test.ts` (new), `apps/web/src/pages/MotionSpec.tsx`
(new, DEV-only route), route wiring (find the router config; gate the route on
`import.meta.env.DEV`), `apps/web/src/index.css` (append motion custom props ONLY).

1. **The exported vocabulary** (`lib/motion/tokens.ts`) — THE single motion source:
   ```ts
   export const SPRING = {
     micro:      { type: 'spring', stiffness: 550, damping: 35 },  // chips, presses, ≤150ms feel
     standard:   { type: 'spring', stiffness: 380, damping: 30 },  // hovers, panel/route fades
     expressive: { type: 'spring', stiffness: 260, damping: 24 },  // hero morphs, settle gesture
   } as const;
   export const DUR = { fast: 0.15, base: 0.2, slow: 0.32, settle: 0.4 } as const; // seconds
   export const EASE_OUT = [0.22, 1, 0.36, 1] as const; // cubic-bezier for non-spring CSS
   export const STAGGER = { list: 0.04, brief: 0.08 } as const;    // Wave W's 40ms / briefing 80ms
   /** Signature-moment frequency taxonomy (Phase-0.7): FULL settle only on rare
    *  accrual milestones; MICRO for high-frequency actions; per-session cooldown. */
   export const SIGNATURE = {
     full:  { moments: ['memory-saved-first-of-session', 'install-success', 'agent-spawned'], durS: DUR.settle, perSessionCooldownMs: 60_000 },
     micro: { moments: ['send-arm', 'selection'], durS: DUR.fast },
   } as const;
   /** Reduced-motion mapping per tier (Phase-0.3) — documented AND consumed. */
   export const REDUCED = {
     routeTransition: 'crossfade-only', hover: 'color-shadow-only-no-transform',
     settle: 'instant-state-color-pulse', streamingCaret: 'static',
     countUp: 'instant-set', ambient: 'off',
   } as const;
   ```
   Tune values to FEEL right (the numbers above are starting points — validate on the
   spec page); all three springs must share one physical character (same "material").
2. **CSS custom props** appended to index.css `:root` (both themes inherit — motion is
   theme-invariant): `--mo-fast: 150ms; --mo-base: 200ms; --mo-slow: 320ms;
   --mo-settle: 400ms; --mo-ease: cubic-bezier(0.22,1,0.36,1);` Nothing else in this file.
3. **Motion-spec page** (`/motion-spec`, DEV-only): sections demonstrating each spring
   variant (click-to-replay), hover tier on a sample card, entrance stagger, exit
   choreography (AnimatePresence in/out samples), the reduced-motion mapping table, and
   an INVENTORY table of already-shipped motion (see Lane R's list) with its migration
   status. This page is the arc's reviewable single source of motion truth.
4. Tests: token invariants (all springs share type, DUR ascending, SIGNATURE moments
   disjoint, REDUCED covers every tier key).

### Lane T — text-tertiary + focus-ring token tiers + offender migration (Pillar 4 items 1 + 3)
Files: `apps/web/src/index.css` (token definitions ONLY — coordinate with Lane M: Lane M
appends motion props, Lane T appends color tokens; both are pure additions in different
blocks, no shared lines), `os/StatusBar.tsx`, `overlays/onboarding/WelcomeStep.tsx`,
`overlays/LoginBriefing.tsx` ("Don't show again"), plus the specific offender usages
listed below. Tests updated where classes are asserted.

1. **`--text-tertiary`**: a tier that is ≥4.5:1 on EVERY surface it appears over
   (--bg, --bg-2, --surface, --surface-2) in BOTH themes. Compute (WCAG relative
   luminance) and document the math in a comment next to the token. Dark: needs
   ≥ #a3987f-level; light: ≤ #6e6552-level. Verify per pair; show ratios.
2. **`--focus-ring` + `--line-affordance`** (Pillar 4.3, WCAG 1.4.11): non-text tier
   ≥3:1 against adjacent effective background BOTH themes — the light-theme honey ring
   is the known risk (honey-on-ivory); compute and pick the light value accordingly
   (e.g. a darker honey/ochre for light). Document ratios in-comment.
3. **Migrate the recurring offender families** onto --text-tertiary (verify each is
   still a REAL failure first — several were fixed in Waves V/X; do not churn
   compliant code): top utility bar (StatusBar plan/search/date cluster), onboarding
   subtitle + privacy footnote ("Skip setup" was fixed — verify), "Don't show again",
   unselected onboarding chips (raise rest contrast), card timestamps if any remain
   sub-AA. Compute before/after ratios in the lane report.

### Lane G — the CI gates (Pillar 4 item 2 + verification plumbing)
NEW files: `scripts/ux-gates/contrast-tokens.mjs`, `scripts/ux-gates/text-color-guard.mjs`,
`scripts/ux-gates/contrast-runtime.mjs`, `scripts/ux-gates/README.md`; `package.json`
(root): three npm scripts (`ux:contrast`, `ux:color-guard`, `ux:contrast-runtime`).
Do NOT touch .github/workflows (wiring into CI is a follow-up once scripts are proven).

1. **contrast-tokens.mjs**: parse index.css (+ waggle-theme.css if it defines text
   tokens), compute WCAG ratios for every (text-token × surface-token) pair in both
   themes, assert the documented floors (--text/--text-2/--text-muted/--text-tertiary
   ≥4.5:1 on their allowed surfaces; --focus-ring/--line-affordance ≥3:1). Exit 1 on
   failure with a table. Must run green against Lane T's final tokens.
2. **text-color-guard.mjs** (the generation-vector ban): scan apps/web/src (app
   surfaces; exclude tests, the tokens file, MotionSpec) for NEW non-token text
   colors: `text-[#`, raw hex in inline `style` color/background of text elements,
   `text-hive-*` palette classes, and opacity-modified text tokens BELOW the safe
   floor (`text-[var(--text-dim)]/40` style patterns; allow ≥/60 with a warning
   list). Baseline file (`scripts/ux-gates/color-guard-baseline.json`) freezes
   today's grandfathered instances; the gate fails only on NEW instances — a
   ratchet, not a big-bang.
3. **contrast-runtime.mjs** (composition-aware, Playwright): against the dev server,
   for each judged surface (/home, /workspaces, /memory, /agents, /marketplace,
   /settings, chat), walk visible text nodes, compute EFFECTIVE fg/bg (composite
   opacity up the tree; sample wallpaper/gradient via screenshot pixel at element
   center when bg is an image), report all <4.5:1 (text) and <3:1 (focus indicators
   — tab to 10 interactive elements per surface and measure the ring). Output a
   JSON + human table; exit 1 on NEW failures vs a baseline. Seed localStorage
   onboarding like the capture kit; run both themes.

## STAGE 2 (parallel lanes; imports from Lane M's tokens — stage 1 merged first)

### Lane R1 — retrofit: cards + entrances (Phase-0.6)
Files: `apps/AllWorkspacesApp.tsx`, `apps/agents/SuggestedAgentCards.tsx`,
`apps/extend/ExtensionCard.tsx`, their tests.
Migrate every duration/easing to the vocabulary: hover transitions → `--mo-fast/--mo-base`
+ `--mo-ease` (or SPRING.standard where framer-motion), entrance stagger → STAGGER.list
+ DUR.slow, lift/bloom timings → tokens. Acceptance: `grep -E "duration-(75|100|150|200|300|500)|duration: '?0\.[0-9]|ease-(linear|in-out|out)\b"` on these files returns
ONLY token-backed or justified-in-comment instances; zero raw magic numbers.

### Lane R2 — retrofit: memory + briefing + boot + theme (Phase-0.6)
Files: `apps/memory/MemoryTrustManage.tsx`, `apps/memory/MemoryCenterTab.tsx`,
`os/overlays/LoginBriefing.tsx`, `os/BootScreen.tsx`, `providers/ThemeProvider.tsx`
(+ index.css `.theme-transition` duration → var), tests.
Same acceptance as R1. The 600ms count-up, 360ms crossfade, briefing staggers, boot
phase timings all move onto DUR/STAGGER/custom props (keep the VALUES if they feel
right — tokenize, don't retune; note any value you deliberately change).

### Lane R3 — retrofit: chat + status chrome + keyframe sweep (Phase-0.6)
Files: `apps/ChatApp.tsx`, `os/StatusBar.tsx` (transition durations only — Lane T owns
its colors), `apps/WorkspaceDesktopApp.tsx`, index.css @keyframes durations where
referenced with magic numbers in components, tests.
Same acceptance. Also produce THE INVENTORY: a table (append to the motion-spec page's
inventory section — coordinate: R3 owns the final inventory content) of every motion
in the judged surfaces: name, file, tier, duration token, reduced-motion behavior.

## VERIFY STAGE (after stage 2; parallel)
- **Reviewer V1 (motion)**: adversarially verify Phase-0 acceptance — grep the judged
  surfaces for non-token durations/easings (list any survivor with justification
  status), confirm the spec page renders every tier, confirm reduced-motion mappings
  are implemented not just documented (inspect the code paths).
- **Reviewer V2 (floor)**: run `node scripts/ux-gates/contrast-tokens.mjs` and
  `node scripts/ux-gates/text-color-guard.mjs`; start dev servers if needed and run
  `contrast-runtime.mjs` on at least /home + /settings both themes; report the tables.
  Verify Lane T's in-comment math independently (recompute 3 spot pairs).

## Orchestrator after verify
Full tsc (web), full apps/web vitest, eslint on all touched files, browser smoke
(motion-spec page renders; one hover; theme flip), commit per stage or as one Phase-A
commit. Then Phase B (Pillar 2) spec.

## Deferred in Phase A (explicitly)
Competitive teardown side-by-sides (needs founder's Claude/ChatGPT sessions — flagged,
not skipped silently); .github/workflows wiring (after scripts prove stable); the
waggle-settle prototype (Pillar 1.3 — its own commissioned mini-arc later).
