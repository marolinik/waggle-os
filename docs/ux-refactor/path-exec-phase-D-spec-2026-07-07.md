# Path-to-9 execution · PHASE D — the motion system (Pillar 1) + home scroll-reveal
### Contract: docs/ux-refactor/path-to-9-2026-07-07.md v3 §Pillar 1 (5/5 endorsed, incl. the
### PATH-2 conditions: default route tier + hero morphs, focus/AT spec IN the component,
### interruptibility as acceptance criteria, commissioned waggle-settle prototype-first).
### The unanimous R19 #1 gap. Highest regression risk → scoped, feature-flagged, staged.
### All motion uses lib/motion/tokens.ts. Both themes. Reduced-motion per REDUCED map.

Recon (verified): router = react-router `<Routes>` in App.tsx; the layout route `/`
= AppShell whose single `<Outlet/>` (AppShell.tsx:449) renders the active route inside
`<main class="relative z-10 flex-1 overflow-hidden">`. `location`, `useNavigate`,
`AnimatePresence` already imported. ChatHost keep-alive portal is SEPARATE from the
Outlet (must not be wrapped — it protects in-flight SSE). Phase-0 spring family +
`--mo-*` tokens + REDUCED map exist. Hover tier = the shipped `hive-interactive`-style
classes on cards (Wave T/U/V). AmbientHiveGlow shipped Phase C (home breath).

## STAGE 1 (parallel; the two heavy motion lanes are independent)

### Lane RT — route-transition system (Pillar 1.1; PATH-2 design blocking)
Files: NEW `components/os/RouteTransition.tsx` (+ test), `components/os/AppShell.tsx`
(wrap the Outlet only), `lib/feature-flags.ts` or a local flag (verify the flag pattern),
tests.
1. **DEFAULT tier — fade-through crossfade + persistent chrome** on ALL top-level route
   changes: wrap `<Outlet/>` in `<AnimatePresence mode="popLayout">` keyed by a ROUTE-GROUP
   key (NOT the full pathname — a workspace tab change within /workspaces/:id must not
   crossfade the whole surface; derive the key from the top segment: home/workspaces/
   memory/agents/marketplace/settings/…). Enter/exit = opacity fade-through (150–200ms,
   `--mo-base` + `EASE_OUT`); the sidebar + StatusBar are OUTSIDE the animated subtree
   (persistent chrome — they never fade). NOT a global router rewrite.
2. **Interruptibility + input-primacy** (PATH-2 design blocking — ACCEPTANCE, tested):
   a route change mid-transition redirects immediately (AnimatePresence popLayout allows
   the new child in without waiting for exit); navigation/input NEVER waits on an exit
   animation. Add a test: fire two navigations in quick succession → the final route wins,
   no lock. Keep `mode="popLayout"` (not "wait") precisely so exits don't block enters.
3. **Focus + assistive-tech spec IN the component** (PATH-2 a11y blocking): on route
   commit, move focus to the destination surface's primary heading / `<main>` landmark
   (focus a `tabIndex={-1}` ref); set the EXITING subtree `inert`+`aria-hidden` for its
   exit duration (focus/SR cursor can never land in it); announce the route via a polite
   live region (route label). Ship these INSIDE RouteTransition, not as a follow-up.
4. **Reduced-motion**: crossfade → instant swap (REDUCED.routeTransition = 'crossfade-only'
   means: under reduce, no opacity animation — instant), focus + announce still fire.
5. **Feature-flag** the whole thing (default ON in dev, but a kill switch) so a regression
   is one flag flip. Verify the ChatHost keep-alive still works (SSE survives a route
   change — do not wrap ChatHost).

### Lane HM — hero shared-element morphs (Pillar 1.1 hero cases)
Files: `apps/AllWorkspacesApp.tsx` + the workspace route/surface (`layoutId` on the card→
surface), `apps/memory/*` (Trust↔Memories tab morph), tests. Depends on Lane RT's
RouteTransition existing (Stage 1 both start; HM reads RT's exports — if RT isn't merged
yet, HM implements the layoutId pairs and notes the integration point).
1. **card→workspace-open**: the workspace card's hex avatar + name share a `layoutId` with
   the destination workspace header, so opening a card GROWS it into the surface (framer
   `layoutId` + `LayoutGroup`). Scope to this ONE pair; fall back to the default crossfade
   if the destination header isn't mounted.
2. **Trust↔Memories tab morph**: the shared hero/container morphs between the two memory
   tabs (layout animation on the tab panel), not a hard cut.
3. Interruptibility + reduced-motion (instant) as Lane RT item 2/4. Both morphs motion-safe.

## STAGE 2 (parallel; after Stage 1)

### Lane HV — hover amplitude: "honey responds to touch" (Pillar 1.2; brand HIGH ×3 rounds)
Files: the shared hover-tier class/util (grep where cards define hover — likely inline
Tailwind on AllWorkspacesApp/SuggestedAgentCards/ExtensionCard; if there's a shared
`hive-interactive` class in index.css, edit there; else create ONE and adopt), tests.
1. Bump the hover tier amplitude to a felt "honey blooms under the cursor": on hover/
   focus-visible → lift (translate-y 2→4px), shadow step, honey border-warm, AND a soft
   honey glow bloom (box-shadow with `--shadow-honey`/`--honey-glow`), 120–160ms
   `--mo-fast` + spring feel. ONE implementation adopted by workspace cards, agent cards,
   marketplace rows, provider tiles. Reduced-motion: keep color/shadow, drop translate.
2. Keep the brand judge's WIN ("respectful, not gratuitous") — bloom is subtle, not neon.
   Light theme: verify the glow reads on ivory (Phase-A light --honey-glow / deeper honey).

### Lane SR — home day-story scroll-reveal (Pillar 1.1 entrance; R20 design HIGH)
Files: `apps/HomeCockpit.tsx` (+ the home section components), tests.
1. The home "day story" (I REMEMBER → START HERE → memory-review → WHILE YOU SLEPT →
   pick-up cards) reveals on scroll: each section rises 8px + fades in as it enters the
   viewport (IntersectionObserver + the `card-enter` / STAGGER grammar), once per section
   per visit. So the scripted scroll reads as designed motion, not a static page.
   Reduced-motion: all visible immediately, no rise/fade. Do not re-trigger on scroll-up.

## STAGE 3 (the signature gesture — prototype-first, PATH-2 brand blocking)

### Lane WS — the waggle-settle, commissioned + prototyped STANDALONE
Files: NEW `components/os/warm/WaggleSettle.tsx` (+ test) + a `/motion-spec` section
demonstrating it on exactly ONE moment (memory saved). Do NOT propagate to other moments
in this phase — the prototype is judged first (a mini standalone review), THEN rolled out
per the Phase-0 SIGNATURE frequency taxonomy in a later step.
1. A recognizably waggle-derived micro-choreography: a brief directional waggle-run
   (the bee's figure-eight dance DNA — a small side-to-side + forward settle) → settle,
   ~300–400ms (DUR.settle, SPRING.expressive), honey. Reduced-motion: instant state +
   color pulse (no path motion). It must read as "the waggle," not a generic scale-pop.
2. Wire it to ONE moment only: the memory-saved confirmation (find the save-memory
   success path — grep). Render it there behind the SIGNATURE.full taxonomy gate
   (per-session cooldown). Everything else waits for the standalone judge verdict.

## VERIFY STAGE (adversarial)
- **V1-motion-system**: RouteTransition — is the crossfade interruptible (the double-nav
  test), is the focus/AT spec implemented (focus moves to heading, exiting tree inert,
  route announced), does reduced-motion degrade to instant, does ChatHost SSE survive a
  route change? Hero morphs — do the layoutId pairs animate (code-read + the 12fps
  capture if available)?
- **V2-hover-scroll**: hover amplitude felt (inspect the class), light-theme glow reads,
  reduced-motion drops translate; scroll-reveal fires once per section, reduced-motion off.
- **V3-a11y-regression**: the highest risk — a keyboard-only pass through 3 route changes
  (focus lands on the destination heading each time, no focus trapped in an exiting tree,
  route announced); reduced-motion Playwright pass asserting no route-transition opacity
  animation under reduce.

## Orchestrator after verify
tsc web + full vitest + all ux-gates (contrast/text-guard/warm/runtime) + reduced-motion
gate + browser smoke (route changes crossfade, one card→workspace morph, hover bloom) →
commit → **standalone waggle-settle mini-judge** (is it "the waggle"? kitsch check) →
if approved, roll out per taxonomy → kit-v7 capture → **R22 judge (9-ATTEMPT: min ≥ 9.0)**.
If R22 min < 9 but ≥ 8.5, one convergent-fix round; if it plateaus, stop + re-analyze.
