# Wave T — R13-V1 convergent fixes: interaction hygiene + the missing motion layer

R13-V1 (video-regime baseline): design 7.0 · kw 7.1 · competitor 7.0 · a11y 7.0 ·
brand 7.3 (min 7.0, avg 7.08). Five systemic gaps named by 4-5 of 5 judges — this
wave ships all five. Evidence: scratchpad/video-r13/evidence (sheets + keyframes).
Same vocabulary + honesty contract as waves P-S. Surgical; both themes; testids/aria
survive. NO cross-lane files. Per-lane gate: related vitest green + eslint on touched
files. Orchestrator runs full gates + re-capture + R14-V2 after merge.

Judges' shared bar: "one perceivable hover/focus tier on every interactive element,
answered within ~100-160ms; zero wrong-state flashes; zero loading lies."

## Lane A — boot choreography + briefing bloom (all 5 judges)
Files: `os/AppShell.tsx`, `hooks/useOnboarding.ts`, `os/overlays/LoginBriefing.tsx`,
the BootScreen component (locate via AppShell render path), `index.html`, tests.
1. **Wizard flash for returning users** (s01 t≈4.0-4.5s): localStorage empty until the
   async `/api/onboarding/status` P4 branch resolves → wizard mounts ~1s before home.
   Hold the BootScreen until onboarding status is KNOWN (sync localStorage hit OR the
   status fetch settles; cap the hold ~1.5s then fall through so a dead endpoint can't
   brick boot). The wizard must never paint for a user the server knows is onboarded.
2. **Briefing opens as a ~4s bare spinner, then content pops unstaged** (design: "it
   deserves a progressive reveal, not a spinner-then-dump"): prefetch the briefing
   payload during BootScreen (boot already runs ~4s — fire loadBriefing's fetch at boot
   start, cache at adapter/module level). Where prefetch hasn't landed, render 2 skeleton
   highlight cards + 2 skeleton workspace rows (correct heights, shimmer) — never a
   centered spinner in an empty box. When data arrives, stagger the recall cards in
   (the existing per-card motion delays already do this — verify they fire on data
   arrival, not only on mount). Keep the errored slim-row path exactly as-is.
3. **Boot pre-paint white frame**: set a dark background on `<html>` in `index.html`
   (inline early style) so pre-hydration frames are hive-dark, not white.
4. **BootScreen ignores theme** (a11y/brand): when stored theme is light, boot in the
   light palette — no dark→light whiplash at home mount.
5. **Light "Start Working" CTA parity** (a11y HIGH): in light theme the primary CTA
   renders washed pale-honey with light text (<4.5:1). Same emphasis tier both themes:
   saturated honey fill + dark text. Compute contrast in lane notes.

## Lane B — marketplace: NL promise bridge + metadata budget + row hover (4 judges)
Files: `apps/MarketplaceApp.tsx`, `apps/extend/ExtensionCard.tsx`, tests.
1. **NL dead-end** (brand HIGH: "the exact moment the brand should feel magical says
   no"): when live keyword filtering finds nothing AND the query looks like natural
   language (≥3 words), the empty state must bridge to the promised semantic search:
   "Press Enter — Waggle matches skills to this job" + run it on Enter (the semantic
   path already exists behind the Search button — wire, don't invent). Also stop the
   first-keystroke full-list flash (debounce the filter ~150ms).
2. Metadata budget (R12): dedupe the repeated connector chip; cap visible tags at
   3 + "+N" overflow chip (tooltip lists the rest). Two chip species only (Wave S
   grammar — verify, don't rebuild).
3. Row hover tier: rest flat → hover/focus-visible = one elevation step (existing
   shadow token) + primary action gains full contrast. 120-160ms ease-out.

## Lane C — workspace cards: grammar close-out (judged 8.0/7.5 — small lane)
Files: `apps/AllWorkspacesApp.tsx`, tests.
1. One-slot-order grammar audit: every card renders identical slot order/alignment
   (identity → tags → preview → metrics); reserve, don't collapse, missing slots.
2. Duplicate-name chip → keep the pill but move the slug disambiguation into its
   tooltip (R12: raw slug = data debris).
3. Kebab menu: drop the full-page dim/blur when the card actions menu opens —
   modal-grade dimming is for modal-grade interruptions (design, low).

## Lane D — memory: loading truth + tab cache + count landing (all 5 judges)
Files: `apps/memory/*` (its surfaces/nav/hooks only), tests.
1. **Kill the false zero** (a11y: "a trust surface must not display wrong data even
   for 3 seconds"): the hero stat renders skeleton/em-dash until the real count
   arrives — `0` is a VALUE, never a loading state. Audit every count on the surface.
2. **Cache tab state**: Trust ↔ Memories switches must not re-fetch + re-spin; keep
   fetched lists in state/cache keyed by tab for the session (staleness fine — the
   surface has explicit refresh affordances elsewhere).
3. **Count-up landing** (brand): when the hero count first arrives, land it with a
   ~600ms count-up + settle; confidence rings draw in staggered. Honor
   prefers-reduced-motion (instant set, no animation).
4. Triple-nav collapse (R12): fold the weakest of the three stacked nav tiers into a
   compact control row. Do NOT remove destinations — only chrome.

## Lane E — chat: the daily surface answers the cursor (all 5 judges)
Files: `apps/ChatApp.tsx` + chat message components, tests.
1. **Message hover actions visible**: the two ~2:1 ghost icons under assistant
   messages → a proper action row (copy/retry, 3:1 rest, 4.5:1 hover, slide/fade
   reveal 120-160ms) that ALSO reveals on :focus-within (keyboard parity). Persistent
   low-opacity hint at rest so the affordance is discoverable without hover.
2. **Composer chip hover/press states**: each chip (persona/memory/mode/model) gets a
   visible hover step + pressed state; the existing send-ignition stays.
3. Entry loading: replace the bare "Loading workspace…" text with the thread skeleton
   (message-shaped placeholders, correct rhythm).

## Lane F — agents surface + the signature motion (all 5 judges; brand HIGH ×2)
Files: `apps/AgentsApp.tsx`, `apps/agents/*`,
NEW shared `components/ui/BeeLoader.tsx` (+ its test) — the ONLY new file this wave.
1. **Hover tier on bee cards + "Browse all 22" strip** (design: "65 seconds of
   hovering, pixel-identical frames"): workspace-card grammar (elevation step + honey
   top hairline + affordance strengthen), 120-160ms, focus-visible parity.
2. **The bees respond** (brand: "the product's soul never moves"): on card hover the
   bee avatar gets a ~200ms character response — a 2-3° tilt + 2px lift of the PNG
   (transform only, no layout shift), settle on leave. Honor prefers-reduced-motion.
3. **BeeLoader — one signature loader**: a small waggle-dance loader (the bee mark
   tracing a figure-eight waggle path, CSS/SVG only, ~1.2s loop, honey on transparent)
   as a drop-in replacement for generic arc spinners. Ship the component + use it for
   the agents surface's own loading states. (Other surfaces adopt it next wave — no
   cross-lane files.)
4. Dark agents search-input border (R12): visible `--line` border + focus ring,
   consistent with marketplace's labeled search.

## Deferred (do not touch this wave)
Settings Show-containment + light input tokens (R12; settings judged 8.5 best-in-app),
www landing diagram (not in the judged journeys), memory row-action focus parity beyond
chat's pattern (ride next wave), theme-switch "atomicity" work beyond Lane A items 3-5
(the reload/white-flash/mixed-state evidence was a capture artifact — kit v2 fixed).

## Per-lane gate
Related vitest green + eslint; NO cross-lane files; lane notes list files touched +
contrast math where required. Orchestrator after merge: web tsc, server tsc, full
vitest, browser QA pass, then R14-V2 capture (kit v2) + judge.
