# Wave S — R11 convergent fixes: craft parity on the boring surfaces (goal 5×9/10)

R11: design 7.5 · kw 7.8 · competitor 7.8 · a11y 7.8 · brand 7.8 (avg 7.74 best-yet).
Design director: "the gap to 9 is craft parity on the boring surfaces."
Shots: `C:/Users/MARKOM~1/AppData/Local/Temp/claude/D--Projects-waggle-os/a6467fd9-181f-4689-a4ee-1d6dedbbfb17/scratchpad/shots/judge-round11/`
Same vocabulary + honesty contract as waves P/Q/R. Surgical; both themes; testids/aria survive.

## Lane A — settings provider selector, third pass (design 6.5)
Files: `model-gate/ModelGate.tsx`, `apps/SettingsApp.tsx`, tests. Evidence: 137 pair + 141.
1. **Provider logomarks**: the marketplace already renders brand logo tiles (see
   `apps/extend/ExtensionCard.tsx` / its logo asset pattern — REUSE that asset/technique).
   Each provider tile gets its brand mark (Anthropic, OpenAI, Google…) left of the name;
   fall back to the existing letter-hex when no mark exists. Compress tile padding one step.
2. **API key / Local model control**: rebuild as a CONTENT-SIZED 2-segment control (inline-flex,
   auto width, filled active cell reading as a tab) — kill the full-width band with phantom
   trailing cells/hex dividers (a11y: "empty trailing cells after 'Local model'").
3. Error banner: put the action IN the banner — "Fix it now" button (focuses the failing
   tile's key input) instead of prose-only.
4. Show control: dock it INTO the section header row it modifies (flush right of the
   "MODEL CONFIGURATION" SectionLabel line) — judges still read it as floating.
5. kw: when Fallback === Primary, the existing warning row stays but add a one-click
   "Use a cheaper fallback" suggestion ONLY if a strictly cheaper model exists in the
   catalog (real data, no invention).

## Lane B — workspace card v3.1: fixed-slot contract (5/5, floor surface 6.8)
Files: `apps/AllWorkspacesApp.tsx` (+test). Evidence: 132 pair + 140.
1. **Fixed slots, every card identical rows**: (1) identity row: hex avatar + name +
   storage badge; (2) tag row ALWAYS present (group chip + 'Personal' scope; slug moves to
   a hover/tooltip detail — kw+a11y both want raw slugs out of the resting card; when two
   names collide show a subtle "duplicate name" pill instead of the slug); (3) preview
   line: real summary/description or last-session title — WITHOUT the "Last:" prefix
   (judges: debris) — quote-style it instead: '"What matters here now?" · 2w ago';
   suppress the preview when the newest session title is the canned assistant greeting
   ("Hello! What can you help me with?" — template text, not user data; omit, never
   paraphrase); (4) metrics footer: ⬡ memories · sessions · Open →.
2. **One live signal per card**: derive a stable per-workspace accent hue from the name
   hash (same technique HexAvatar already uses — reuse its hue derivation) and paint a
   2px top border band on the card in that hue at 40% opacity. Deterministic, data-free,
   differentiates cards without fabrication.
3. Keep: persistent Open →, dark border step, min-h 132, whole-card click.
4. a11y: remove the duplicated affordance objection by keeping ONE visible Open → (footer)
   — do not add more.

## Lane C — one chip grammar, app-wide (design HIGH + a11y + kw)
Files: `apps/extend/ExtensionCard.tsx`, `apps/MarketplaceApp.tsx`,
`apps/memory/MemoryTrustManage.tsx`, `apps/AgentsApp.tsx` (status chips).
1. Codify TWO chip species and apply everywhere in these files:
   FILLED chip = category/type (surface-2 bg, text-muted, 11px);
   OUTLINE chip = status (transparent bg, tone border+text: healthy/attention/risk/neutral).
2. NO sentence chips: "Works as connector, MCP server & skill" → three glyph+word chips
   ("connector" / "MCP" / "skill") sharing one tooltip. Style orphan plain-text tokens
   ("local registry") as the filled species.
3. Memory mono metadata row (M-382 · session handoff · 2026-06-24 · s2 · source: imported):
   compress to icon+short label with tooltip carrying the full provenance (brand judge:
   "transparency without terminal dump") — keep M-id visible (it is the correction handle).
4. Agents status chips: dot+label pattern with semantic tones (idle=neutral dot,
   running=healthy, error=risk) + one contrast step (a11y).

## Lane D — light-mode mood + status-chrome tokens (brand HIGH + a11y HIGH)
Files: `index.css` (ONLY this lane), `os/StatusBar.tsx`, `os/AppShell.tsx` (wallpaper layer
if that's where the light hex opacity lives — verify), light logo asset wiring in StatusBar.
1. LIGHT hex-pattern presence up (~2 steps opacity) on large canvases + a faint warm honey
   radial wash behind hero zones — light must stop reading as a faded copy (brand).
2. Light logo tile: the top-left logo is a dark square in light — use the light logo asset
   (waggle-logo.png already imported for light in StatusBar — verify it actually renders;
   the DESIGN judge sees a dark tile, so something is off) or wrap in a themed tile.
3. Light muted-text audit (a11y HIGH): agents taglines / memory mono meta / chat meta line —
   darken the light --text-dim/--text-muted one step to clear 4.5:1 at 11-12px; verify with
   contrast math in the lane notes (compute, don't eyeball).
4. Light status-bar chrome ('Solo plan', Ctrl K chip, breadcrumbs) one contrast step.
5. StatusBar model chip label: "New chats:" → "Default model:" (kw R11: self-evident beats
   clever; tooltip already disambiguates the open thread).

## Lane E — mascot/asset consistency + chat composition (brand HIGH ×2, design MEDI)
Files: `apps/ChatApp.tsx` + chat message components (turn avatar), `apps/agents/*` (Editorial
Critic row emoji), `overlays/onboarding/WelcomeStep.tsx`, `overlays/LoginBriefing.tsx`.
1. **Purge platform emoji**: chat turn header bee (currently a low-res emoji/raster at
   ~20px) → the persona's flat-geometric PNG from assets/personas at 36-40px (crisp,
   transparent); agents' Editorial Critic 🤖 → the persona bee (it's a custom agent —
   use its persona avatar via getPersonaAvatar, fallback general-purpose).
2. Onboarding mascot: kill the square tile seam — render the transparent PNG bare
   (no tile bg/border; keep the glow as drop-shadow); verify against ivory in light.
3. Chat opening composition: collapse the dead band above the first message (competitor:
   pull the thread start up under the header) — check the thread container's top spacing.
4. LoginBriefing: suppress boilerplate workspace rows — a row whose summary is the CANNED
   template line ("Everything you discuss in X stays in context…") carries no information;
   omit those rows (template copy ≠ data; never omit rows with real content).

## Per-lane gate
Related vitest green + eslint; NO cross-lane files. Orchestrator: full web tsc + vitest after merge.
