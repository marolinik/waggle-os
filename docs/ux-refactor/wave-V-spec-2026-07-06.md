# Wave V — R15-V3 convergent fixes: memory parity, single-truth banners, motion tier 2

R15-V3: design 7.5 · kw 7.8 · competitor 7.6 · a11y 7.3 · brand 7.4 (min 7.3, avg
7.52; regime trajectory 7.08 → 7.38 → 7.52). Same vocabulary + honesty contract as
waves P-U. Surgical; both themes; testids/aria survive. NO cross-lane files.
Per-lane gate: related vitest green + eslint on touched files.

Already fixed inline (do NOT redo): s03 empty-flash root cause — ShellContext now
forwards `workspacesLoading`; the shelf gates its empty state on it (`32507dd9`).

## Lane A — memory surface to hero parity (5/5 judges)
Files: `apps/memory/*` (MemoryTrustManage.tsx, MemoryCenterTab.tsx, memory-list-cache.ts), tests.
1. Hero count NEVER paints 0 mid-load, including tab RETURNS: gate on cache — show
   the cached last-known count (or skeleton digit when truly unknown), never a
   transient 0. The count-up animation runs ONCE per app session (module-level
   flag, mirrors shelfSessionResolved), then settles instantly on later mounts.
2. Memories tab to Trust-hero standard: a designed container (result-count header
   row "448 memories · filtered by X", aligned filter chips, consistent row grid) —
   kill the "one card floating in a black void" composition. While the list loads:
   skeleton rows (existing pattern), or when a filter pins results, an explicit
   state label ("Showing 1 pinned result — loading the rest…").
3. Keep all existing behavior (cache, erase flows, testids) intact.

## Lane B — settings verdict single-truth (kw + competitor HIGH)
Files: `apps/SettingsApp.tsx`, `model-gate/ModelGate.tsx` (verdict/banner logic only), tests.
1. The status banner currently flips "No working model" → "you're ready to go" →
   provider error within ~1s as async probes land. Introduce ONE resolution phase:
   while any provider probe is in flight show a neutral "Checking your models…"
   banner (BeeLoader mark optional), then render EXACTLY ONE final verdict. No
   intermediate verdict may paint.
2. Do not slow the happy path: if all probes resolve <300ms, skip the checking
   state entirely (verdict paints once, immediately).

## Lane C — motion tier 2: cards answer with lift + bloom (design + brand)
Files: `apps/AllWorkspacesApp.tsx`, `apps/agents/SuggestedAgentCards.tsx`,
`apps/extend/ExtensionCard.tsx`, tests.
1. Hover/focus-visible on workspace cards, bee cards, marketplace rows adds a
   subtle translate lift (2-4px) + a honey glow bloom (shadow token step) ON TOP of
   the existing ring/border tier. 150-200ms ease-out, motion-safe gated (reduced
   motion keeps the color tier). Use existing --shadow-honey / timing tokens; if a
   token is missing, note it — don't invent values inline.
2. Specialists strip: show the → arrow at rest (dim), brighten on hover (a11y
   rest-hint ask). Audit these three files for other hover-only reveals; give each
   a rest-state hint or focus-visible parity.

## Lane D — signature theme crossfade + route settle (brand HIGH)
Files: `providers/ThemeProvider.tsx` (or wherever the theme stamp lives — verify),
`index.css` (transition rules only), tests.
1. Theme switch: a 300-400ms warm crossfade ("sunset over the hive") instead of an
   instant token swap — CSS transition on background/color tokens at the root, NOT
   a JS animation; guard against transitioning layout properties (colors/opacity
   only, no width/position). motion-safe gated; reduced-motion keeps the instant swap.
2. Verify the s02 Settings→Home gap: the route lands on Home whose shelf section
   skeletons paint inside the FULL page scaffold (sidebar+header persist — they
   should already; if a blank frame exists outside the shelf, find and close it).
3. Do NOT add route-level shared-element transitions (out of scope).

## Lane E — loading vocabulary close-out (design + kw)
Files: `os/WorkspaceDesktopApp.tsx` (entry loader only), `apps/MarketplaceApp.tsx` +
`apps/extend/AgentSearchBox.tsx` (debounce presentation only), tests.
1. Chat/workspace cold entry: replace the bare centered "Loading workspace…" text
   with a layout-preserving skeleton (sidebar/header persist; thread-shaped
   placeholders in the content area — reuse the WorkspaceBriefing skeleton idiom).
2. Marketplace: during the search debounce, keep prior results visible at reduced
   opacity (dimmed, aria-busy) instead of collapsing the list between keystrokes;
   stabilize the MATCHES section so it doesn't mount/unmount across adjacent
   debounce ticks (reserve its container once shown until the query clears).

## Lane F — a11y utility-text sweep + chip semantics (a11y HIGH)
Files: `os/StatusBar.tsx`, `os/Sidebar.tsx`, `overlays/onboarding/WelcomeStep.tsx` +
the wizard step shell (mascot carry + step transition), `apps/ChatApp.tsx`
(aria/tooltips ONLY — no visual changes), tests.
1. AA sweep at 11-12px in BOTH themes (compute, don't eyeball; math in lane notes):
   "Skip setup", "Don't show again", statusbar plan/search/date chrome, sidebar
   section labels (PINNED · POWER TOOLS / GENERAL), marketplace suggestion pills
   (if that token lives in a shared tier, fix the token, else note it).
2. Composer chips + message-action icons: aria-label + title tooltips on every
   control (several have neither); no visual changes in this lane.
3. Onboarding: keep the (breathing) mascot as the persistent step header across
   wizard steps (it currently swaps to a generic glyph after Welcome); ease the
   step transition (slide/fade ~200ms, motion-safe). Replace the native OS
   <select> for Industry with the app's themed select primitive (grep for an
   existing themed select/dropdown — one exists in settings; reuse, don't build).

## Deferred
Briefing-modal row streaming (prefetch already covers the common path); route
shared-element transitions; marketplace row typography tier-up; s06 panel-swap
choreography (surface already at 8.5).

## Per-lane gate
Related vitest green + eslint on touched files; contrast math where demanded.
Orchestrator: web tsc + apps/web vitest suite + browser smoke + R16-V4 capture/judge.
