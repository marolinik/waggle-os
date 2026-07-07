# Wave R — R10 convergent fixes (2026-07-06 S2, goal 5×9/10)

R10: design 7.8 · kw 7.7 · competitor 7.6 · a11y 7.6 · brand 7.5 (min 7.5 avg 7.64 —
new min high; loop moving again). Shots:
`C:/Users/MARKOM~1/AppData/Local/Temp/claude/D--Projects-waggle-os/a6467fd9-181f-4689-a4ee-1d6dedbbfb17/scratchpad/shots/judge-round10/`
Same vocabulary + honesty contract as waves P/Q. Surgical; both themes; testids/aria survive.

## Lane A — settings selection grammar + Show re-home (5/5 flagged the blue ring) — 6.6 worst
Evidence: `137-settings-models-dark/light.png`, `141-settings-provider-selected-dark.png`.
Files: `model-gate/ModelGate.tsx`, `apps/SettingsApp.tsx`, `os/ModelPilotCard.tsx`, tests.
1. **Kill the blue ring** (all 5 judges): shot 141 shows Anthropic with a browser/Tailwind
   DEFAULT BLUE focus/ring while OpenAI wears the honey selected border — find every `ring`
   utility in the tile grid missing an explicit ring color + the focus-visible outline, and
   tokenize: honey ring = selected/focus, risk tint = error; never two ring languages at once.
   An error tile that is ALSO selected shows risk ring only.
2. Dark segmented control (API key / Local model): real active state — filled cell
   (bg-card + shadow-sm is too subtle in dark; add honey underline or stronger fill) to match
   light's clarity.
3. **Re-home the Show control** (3/5): out of the rail foot → the CONTENT side: a compact
   labeled control in the settings content header row (right-aligned, caption "Show"),
   so it sits visually above the sections it gates. Keep aria + tier mechanics + tests.
4. ModelPilotCard: replace bare `$$$` glyphs with explicit cost text (e.g. "$$$ · ~$0.05/msg"
   already exists as a legend at card foot — surface the per-row cost inline, or tooltip +
   aria-label; judges called the glyphs cryptic).

## Lane B — workspace card living identity (5/5 HIGH, third round) — 7.0
Evidence: `132-workspaces-dark/light.png`, `140`. The card body still reads as reserved-but-empty;
Open is hover-only; two "Research Hub"s differ only by slug chip; dark cards near-vanish.
Files: `packages/server/src/**` (workspace list route), `apps/web/src/lib/types.ts`,
`apps/web/src/lib/adapter.ts`, `apps/AllWorkspacesApp.tsx` (+test).
1. **Server enrichment (the real unlock):** find GET /api/workspaces list route; the workspace
   summary/description cache and per-workspace session/memory stores exist server-side. Extend
   each list row with REAL fields where cheaply available: `memoryCount` (frame count for that
   workspace mind) and `lastSessionTitle` or the cached summary line. NO N+1 explosion: batch
   or reuse existing counts; if a count is expensive, skip it — never estimate. Typecheck
   packages/server with its own tsconfig (it is NOT covered by npm run build).
2. Card render: body = description OR cached summary OR lastSessionTitle-composed line
   ("Last: <title> · 2w ago") — real strings only; memory count joins the meta footer (⬡ N).
3. `Open →` becomes a PERSISTENT quiet affordance (text-dim at rest, honey on hover) — no
   more hover-only reveal; keep the whole-card click.
4. Duplicate names: promote the disambiguator — slug chip moves up beside the title at
   readable weight (11.5px), not a whisper below it.
5. Dark theme: card border one token step up (line-soft → line) so cards stop vanishing
   (a11y ask); keep light as is.

## Lane C — marketplace craft pass (4/5) — 7.3
Evidence: `136-marketplace-dark/light.png`.
Files: `apps/MarketplaceApp.tsx`, `apps/extend/*` (ExtensionCard, AgentSearchBox…).
1. One chip grammar: tag lozenges (mcp / Security / local registry…) restyle to the app-wide
   quiet chip (11px, line-soft border, text-muted) — no third grammar.
2. Search submit: the honey up-arrow orb reads as scroll-to-top — swap to a labeled affordance
   (e.g. ⏎ "Search" chip or magnifier-forward) — pick the least-chrome honest option.
3. 'Connected' pill: teal/green → the warm healthy token already used app-wide (--healthy is
   sage — fine) BUT brand judge flags it as off-palette teal: verify which token it uses and
   align to --healthy + healthy-wash grammar used on agents/home chips.
4. "Not scanned" shield-warning → neutral quiet chip "Safety scan pending" (kw), tooltip intact.
5. START HERE re-curation: lead with memory-feeding connectors (Gmail / Google Drive / Notion /
   Slack — whichever of those exist in the catalog), demote 1Password; tighten row vertical
   padding one step (density).
6. Listing identity: bump logo tile size one step so brand marks carry the row.

## Lane D — chrome truth + token passes (kw HIGH numbers + a11y tokens)
Files: `os/StatusBar.tsx`, `apps/ChatApp.tsx` (+ chat composer/empty files it imports),
`index.css` (ONLY this lane touches it).
1. **Numbers scope** (kw #1): status bar "552 memories" counts ALL minds; memory page counts
   the personal mind (448). Make the scope visible in the chip itself — shortest honest label
   (e.g. "552 memories · all minds"); do NOT change what is counted, label it.
2. Composer control family: persona chip, Memory chip, Ask-first, model chip → ONE species
   (same height, radius, border/fill logic); the bare '>' collapse toggle gets an aria-label
   + tooltip ("Collapse agent strip") or a clearer icon.
3. Message attribution line (Waggle · Verifier · model): one size/contrast step up (a11y —
   it is the only provenance signal on a turn).
4. index.css token pass:
   - LIGHT: card elevation one step (slightly stronger --shadow-card + --line-soft on ivory);
     light --attention #b57d12 → #9a6408 (matches --honey-text light, 4.64:1 AA — fixes
     "aging — added 2w ago" micro-text) — verify attention-WASH stays as-is.
   - DARK: muted chip legibility one token step (inactive filter chips sit below comfort —
     bump the chip text token used there, NOT global --text-dim which was already tuned).
   - Hex wallpaper: add a radial falloff/vignette so the pattern fades toward the content
     column (design+brand: "wallpaper → compositional") — CSS mask/radial-gradient on the
     wallpaper layer, both themes, subtle.
5. Chat empty state: place one flat-geometric bee mascot (assets/personas set) with a short
   warm line — brand judge: "free the mascots". Only if ChatApp owns an empty-state block;
   do not invent a new empty state.

## Lane E — brand moments + memory stats + landing stat (brand HIGH)
Files: `overlays/onboarding/WelcomeStep.tsx`, `overlays/LoginBriefing.tsx`,
`apps/memory/MemoryTrust*.tsx`, `apps/www/app/**` (landing hero stat only).
1. Onboarding welcome: one bee mascot moment (flat-geometric set — e.g. general-purpose bee)
   beside/above the headline — placed calmly, not clip-art; both themes.
2. LoginBriefing (content state): mascot in the header ("Catching you up" + small bee);
   differentiate I-REMEMBER sparkle cards from workspace cards (distinct container tint —
   honey-wash vs surface); label the brain/chat micro-counts (aria + visible tooltip);
   bottom scroll affordance (edge fade) when the list overflows.
3. Memory stat row: never lead with a zero — order chips by value desc (zero chips last,
   already quiet-styled); keep the disclaimer.
4. Landing hero (apps/www): the 86.49% LoCoMo line gets flagship-stat weight — a stat chip /
   larger mono treatment near the CTAs (competitor+design). Canonical number 86.49 ONLY.
   Gate: `cd apps/www && npx next build` must pass (honest gate for www).

## Per-lane gate
Related vitest green + eslint on touched files; Lane B ALSO: npx tsc --noEmit -p packages/server/tsconfig.json.
NO cross-lane file edits. Orchestrator: full web tsc + vitest + www build after merge.
