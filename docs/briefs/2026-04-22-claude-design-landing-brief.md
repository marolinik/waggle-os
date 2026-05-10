---
date: 2026-04-22
type: brief
status: LOCKED — pending Marko submission u Claude Design web session
workspace: claude.ai/design
purpose: Landing page visual + copy finalization u postojećem Claude Design prototype workspace-u
dependencies:
  - strategy/landing/landing-wireframe-spec-v1.1-LOCKED-2026-04-22.md (14/14 decisions ratified)
  - briefs/2026-04-20-claude-design-setup-submission.md (DS already generated, bee assets loaded)
  - decisions/2026-04-22-landing-personas-ia-locked.md (3 IA decisions)
  - decisions/2026-04-22-personas-card-copy-locked.md (13 JTBD locked)
---

# Claude.ai/design — Waggle Landing Iteration Brief

## PM metadata (ne-paste u Claude Design)

**Authority chain:** Marko ratification (2026-04-22) → wireframe v1.1 LOCKED (14 Path A decisions) → ovaj brief.

**What this brief is:** paste-ready prompt za claude.ai/design web session čiji je zadatak da iterira postojeći DS-generated prototype u landing page koji implementira wireframe v1.1 LOCKED IA (7 sekcija + Footer) sa LOCKED copy stringovima i LOCKED visual tokens.

**What this brief is NOT:** Next.js production port. Production port ide kao zaseban CC milestone **posle** (a) landing finalizacije u Claude Design + (b) SOTA benchmark claim. Ovaj brief proizvodi vizuelno-copy prototip koji live-a iz Claude Design output-a kao beta signup funnel u međuvremenu i kao reference spec za kasniji CC port.

**Success criteria za Marko-side review u Claude Design:**
1. 7 sekcija + Footer renderovani po LOCKED redosledu.
2. Sve 188 copy keys vidljive i equal LOCKED EN fallback stringovima (ne inline-rewritten).
3. Dark-first dominantno, honey amber emphasis samo na CTAs + proof accent-ima.
4. Personas grid 6+6+1 geometry sa Night Shift solo centered na `xl`.
5. Dual CTA hierarchy (Primary-Download + Primary-Checkout) konzistentna kroz Hero i Final CTA.
6. Hero MPEG-4 loop slot prisutan sa static poster fallback-om (MPEG-4 asset ne mora biti finalizovan u ovoj sesiji — placeholder video ili looping still je OK).
7. Responsive collapse radi na sm/md/lg/xl breakpoint-ima.

**Post-Claude-Design gates:**
- **Gate 1 (Marko-side):** Screenshot review po sekciji + dual-axis "Does this render the v1.1 LOCK?" check.
- **Gate 2 (PM-side):** v1.1 wireframe parity audit protiv Claude Design iteration-output-a — PM proizvodi signoff dokument `sessions/2026-04-22-claude-design-landing-signoff.md` sa delta report-om.
- **Gate 3 (Legal, pre publish):** `landing.trust.sovereign.paragraph` cloud-promise review.
- **Gate 4 (SOTA claim):** go-live gated na LoCoMo 91.6% benchmark verdict — Claude Design prototype može live-ovati kao beta signup funnel pre SOTA proof-a ako Marko odluči, ali headline copy ne sme deklarirati "verified" pre nego što bude verified.

---

---

## PROMPT ZA CLAUDE DESIGN (od ovde nadole — paste kao input u Claude Design web session)

# Waggle Landing Iteration — v1.1 LOCKED Implementation

## Context

You already have the Waggle Design System loaded in this workspace from the 2026-04-20 setup. The design system includes:

- **Dark-first palette:** hive navy/blue-gray scale (950 `#08090c`, 900 `#0c0e14`, 800 `#171b26`, 700 `#1f2433`, 500 `#3d4560`, 100 `#dce0eb`, 50 `#f0f2f7`) + honey amber accent (400 `#f5b731`, 500 `#e5a000`, 600 `#b87a00`) + status accents (`#a78bfa` AI, `#34d399` healthy).
- **Typography:** Inter, sentence case, tight kerning, em dashes (—) not hyphens, Oxford comma.
- **Bee mascot illustrations:** 13 variants loaded from `apps/www/public/brand/` (hunter, researcher, analyst, connector, architect, builder, writer, orchestrator, marketer, team, celebrating, confused, sleeping).
- **Button hierarchy:** primary = honey amber, secondary = hive outline, tertiary = text link.
- **Background texture:** `hex-texture-dark.png` subtle honeycomb, background only.
- **Voice:** calm-confident, technical precision, zero marketing hype. No "revolutionary" / "transform" / "game-changing". Information density over whitespace minimalism.

Your task is to iterate the landing prototype to implement the following **LOCKED wireframe** (v1.1, ratified 2026-04-22). Everything below is locked copy and structure — do not rewrite strings, do not reorder sections, do not substitute alternatives unless explicitly noted.

---

## Section order (LOCKED)

```
1. Hero                  (hook + OS-detected download + MPEG-4 loop slot)
2. Proof / SOTA          (5 proof cards — skeptic-first order)
3. How it works          (5-step mechanism)
4. Personas              (13-bee grid 6+6+1 xl — narrative heart)
5. Pricing               (Solo free / Pro $19 / Teams $49 + annual toggle)
6. Trust                 (3 panels: Sovereign → Compliance → OSS)
7. Final CTA             (Download + Pro checkout + "Talk to a sovereign architect")
+ Footer                 (nav, legal, social, hive-mind GitHub link)
```

---

## Section 1 — Hero

**Layout:** full-width, honey-950 ground, max content width ~1280px centered. Two-column on `lg+`: copy block left (60% width), visual slot right (40%). Single column stack on `md` and below, copy above, visual below.

**Eyebrow:** `The cognitive layer for any AI`

**Headline (default, M3):** `Better Opus. Free Qwen. Same cognitive layer.`

**Subhead:** `Waggle gives your AI memory that compounds — locally, sovereignly, across every model you use. Thirteen specialists, one cognitive layer, zero cloud required.`

**Primary CTA:** `Download for macOS` *(OS-detected; variants: Windows, Linux)* · sub-label: `Solo — free forever`

**Secondary CTA:** `See the benchmarks` · sub-label: `Pre-registered LoCoMo run`

**Visual slot (right column):** MPEG-4 loop — brand hero animation, ≤800KB, 6-8s duration, autoplay + muted + playsinline + loop. Respects `prefers-reduced-motion: reduce` → poster static only. Use a placeholder video or looping still in this iteration if the final MPEG-4 asset is not yet available; mark the slot explicitly as `[HERO MPEG-4 SLOT — placeholder]`.

**Responsive:**
- `sm`: eyebrow + headline + subhead + CTAs stacked vertically, visual slot below collapsed to full-width static poster.
- `md`: same single-column stack, visual slot full-width but can be larger.
- `lg`+: two-column as above, visual slot right.
- `xl`: same as `lg` but with more generous horizontal padding.

---

## Section 2 — Proof / SOTA (5 cards)

**Layout:** full-width band, honey-900 ground (one step lighter than Hero). Centered section header. 5 proof cards in horizontal strip on `lg+`, 3+2 grid on `md`, vertical stack on `sm`.

**Section eyebrow:** `Not a promise — a posture`

**Section headline:** `Five claims, each one checkable.`

**Section subhead:** `We don't ask you to trust us. We ask you to audit us.`

**Card order (LOCKED skeptic-first):**

1. **LoCoMo benchmark card.** Badge: `Pre-registered`. Heading: `Matches Mem0 at 91.6% on LoCoMo.` Body: `Pre-registered evaluation on the full 1,540-instance LoCoMo test set. Three judges, Wilson 95% CI, conversation-level cluster-bootstrap. No private leaderboard — the manifest hash is public.` Link: `See the pre-registration →` *(proof_state: "pre_registered" until SOTA verdict flips to "verified")*

2. **PA v5 card.** Badge: `Published delta`. Heading: `+5.2pp lift on Opus 4.6.` Body: `In our PA v5 evaluation, Waggle's cognitive layer lifted Opus 4.6 by 5.2 percentage points on closed-domain reasoning. Publishable delta with full methodology disclosed.` Link: `Read the PA v5 write-up →`

3. **Apache 2.0 card.** Badge: `Apache 2.0`. Heading: `The memory engine is yours.` Body: `Our memory substrate, MCP server, and harvest adapters are Apache 2.0 open source. Fork them, audit them, ship them inside your own product. You don't owe us a dime.` Link: `View on GitHub →`

4. **Local-first card.** Badge: `Zero cloud default`. Heading: `Nothing leaves your machine.` Body: `Waggle runs locally. On-device storage, on-device retrieval. Works offline. Your data is never ingested, never used for training, never phoned home.` Link: `See the architecture →`

5. **Compliance card.** Badge: `Audit-first`. Heading: `EU AI Act-ready out of the box.` Body: `Bitemporal knowledge graph with audit triggers. Every decision your AI makes leaves a timestamped trace mapped to the version of memory that informed it. When regulation shows up, you export.` Link: `See the audit model →`

**Card visual treatment:** each card has a subtle honey-400 border accent on hover, dark hive-800 background, honey-400 badge pill, sentence-case heading. No stock icons — use the existing icon language from the design system if any card needs a glyph.

---

## Section 3 — How it works (5 steps)

**Layout:** full-width band, honey-950 ground (rhythm break back to deepest dark). Centered section header. 5-step mechanism visualization — horizontal numbered stepper on `lg+`, 2+2+1 grid on `md`, vertical stack on `sm`. Each step has: step number + icon glyph + step title + 1-2 sentence description.

**Section eyebrow:** `The mechanism, not the magic`

**Section headline:** `Five moves turn any AI into an AI with memory.`

**Section subhead:** `No black box. Every step is inspectable, every step has a name.`

**Steps (LOCKED order):**

1. **Capture.** `Every conversation, every decision, every tool call — captured with timestamped provenance. Your AI stops forgetting.`
2. **Encode.** `MPEG-4 compression into a bitemporal knowledge graph. Semantic density without semantic drift.`
3. **Retrieve.** `Structured retrieval over structured memory. Not vector-soup RAG — surgical recall with explainable paths.`
4. **Reason.** `The cognitive layer composes memory + retrieval + current context into the prompt. Model-agnostic. Works with Opus, works with Qwen, works with tomorrow's model.`
5. **Audit.** `Every inference is a traced event. Every trace maps to the memory state that informed it. Compliance is a side effect, not a feature.`

**CTA below steps:** Secondary-Learn link — `Read the architecture one-pager →`

---

## Section 4 — Personas (13-bee grid)

**Layout:** full-width band, honey-900 ground (return to mid-dark). Centered section header. Grid geometry (LOCKED):
- `xl`: 6 + 6 + 1 centered (Night Shift solo on the bottom row, horizontally centered).
- `lg`: 5 + 5 + 3 wrapping OK, but Night Shift MUST NOT be first or last in its row — center it.
- `md`: 3 × ~4-5 rows, Night Shift on its own row centered.
- `sm`: 2 × 6-7 rows or 1 × 13 stack, Night Shift last.

**Section eyebrow:** `Thirteen bees, one hive`

**Section headline:** `The specialists your workflow has been missing.`

**Section subhead:** `Each bee is a reusable cognitive pattern. They compose, they coordinate, and they never forget a thing.`

**Personas (canonical order, use existing bee mascot assets):**

| Order | Slug | Title | JTBD (1-line, always visible) | Asset |
|---|---|---|---|---|
| 1 | hunter | The Hunter | Finds the exact thing in the exact place. | `bee-hunter-dark.png` |
| 2 | researcher | The Researcher | Goes deep and brings back a verdict. | `bee-researcher-dark.png` |
| 3 | analyst | The Analyst | Sees the shape of what keeps repeating. | `bee-analyst-dark.png` |
| 4 | connector | The Connector | Links yesterday's thought to tomorrow's decision. | `bee-connector-dark.png` |
| 5 | architect | The Architect | Gives chaos a structure you can reason about. | `bee-architect-dark.png` |
| 6 | builder | The Builder | Turns a spec into something that ships. | `bee-builder-dark.png` |
| 7 | writer | The Writer | Shapes the story the memory wants to tell. | `bee-writer-dark.png` |
| 8 | orchestrator | The Orchestrator | Coordinates the agents, tools, and memory. | `bee-orchestrator-dark.png` |
| 9 | marketer | The Marketer | Translates what you do into what matters to them. | `bee-marketer-dark.png` |
| 10 | team | The Team | Many hands, one hive. | `bee-team-dark.png` |
| 11 | celebrating | The Milestone | Marks the moment when the work compounds. | `bee-celebrating-dark.png` |
| 12 | confused | The Signal | Raises a flag when memory and reality disagree. | `bee-confused-dark.png` |
| 13 | sleeping | The Night Shift | Consolidates while you rest — the hive never closes. | `bee-sleeping-dark.png` |

**Tile visual:** square-ish card (roughly 1:1 aspect), bee mascot centered upper 60%, title below mascot (honey-400 weight 600), JTBD subtitle one line below title (hive-100 weight 400). Dark hive-800 card background, honey-400 border accent on hover.

**Hover behavior (LOCKED `accent_and_boost`):** border accent honey-400 + color lift on title (hive-50 → honey-300) + slight transform (scale 1.02 or translate-y -2px) + JTBD subtitle always-visible (not hover-only), with brightness boost on hover. **NO inline expansion** (deferred to v1.5 opt-in prop flip).

**Section-level CTA below grid:** Primary-Download — label `All thirteen work in Solo. Free, forever.` · sub-label `Download to meet the hive →`

---

## Section 5 — Pricing

**Layout:** full-width band, honey-900 ground. Centered section header. **Annual/monthly billing toggle below subhead, above tier grid** — default monthly, toggle flip switches price displays across all tiers simultaneously. 3-tier card grid below toggle: Solo, Pro, Teams — 3-in-a-row on `lg+`, 2+1 or stack on `md`, vertical stack on `sm` (Solo first).

**Section eyebrow:** `Three tiers. One cognitive layer.`

**Section headline:** `Start free. Pay when it compounds.`

**Section subhead:** `Every tier runs the same substrate. You choose what the hive coordinates.`

**Billing toggle labels:** `Monthly` / `Annual (save ~17%)`

### Tier cards (no feature checklists — persona-role based)

**Solo** *(default-accent)*
- Price monthly: `$0 · forever`
- Price annual: `$0 · forever`
- Personas line: `The Hunter, The Researcher, The Analyst, The Connector, The Architect, The Builder, The Writer, The Milestone, The Signal, The Night Shift.`
- Anchor: `Your machine, your memory, all thirteen bees — no credit card, no trial clock.`
- CTA: `Download for {OS}` · sub: `Local, sovereign, free.`

**Pro** *(default-accent)*
- Price monthly: `$19 · per month`
- Price annual: `$190 · per year · save $38`
- Personas line: `Everything in Solo, plus The Orchestrator and The Marketer — the roles that coordinate agents, tools, and outbound context.`
- Anchor: `Priority adapters, faster retrieval, the bees that scale your solo work.`
- CTA: `Start with Pro` · sub: `14-day refund window.`

**Teams** *(recommended-accent — subtle honey-400 eyebrow pill "Most capable", not loud border)*
- Price monthly: `$49 · per seat, per month`
- Price annual: `$490 · per seat, per year · save $98`
- Personas line: `Everything in Pro, plus The Team — shared context across your workspace. The hive you build together.`
- Anchor: `Shared memory, team-wide wiki, shared audit surface.`
- CTA: `Start a team` · sub: `Minimum 3 seats.`

**Footnote (below tier grid, muted hive-500 color):** `All tiers include MCP server, harvest adapters, wiki compiler, and the Apache 2.0 substrate. KVARK enterprise deployment is a separate conversation — see the bridge below.`

---

## Section 6 — Trust (3 panels, LOCKED Sovereign → Compliance → OSS order)

**Layout:** full-width band, honey-950 ground (deepest dark as anchor before final CTA). Centered section header. 3 trust panels side-by-side on `lg+`, stacked on `md` and below. Each panel is asymmetric: 40% visual proof (badge pill + icon glyph or hex-texture detail) on left, 60% copy on right.

**Section eyebrow:** `The substrate you can defend`

**Section headline:** `Sovereignty, auditability, and open source — not as checkboxes, as defaults.`

**Section subhead:** `Three things your compliance officer, your CTO, and your future self should not have to argue about.`

### Panel 1 — Sovereign (LOCKED position 1)
- Badge: `Zero cloud default`
- Heading: `Your memory never leaves your machine.`
- Paragraph: `Waggle runs locally. Not "local with optional cloud sync." Not "local by default, cloud for enterprise." Local. Your data is never ingested, never used for training, never phoned home. If we ever add a cloud feature, it will be opt-in, inspectable, and never default.`
- Bullets: `On-device storage, on-device retrieval` · `Works offline — the hive never needs permission`
- Link: `See the architecture →`

### Panel 2 — Compliance (LOCKED position 2)
- Badge: `Audit-first`
- Heading: `Compliance-grade audit, built in.`
- Paragraph: `Every decision your AI makes leaves a trace. Every trace has a timestamp. Every timestamp maps to the version of memory that informed it. When regulation shows up, you don't scramble — you export.`
- Bullets: `Bitemporal knowledge graph with audit triggers` · `EU AI Act-ready export surface`
- Link: `See the audit model →`

### Panel 3 — OSS (LOCKED position 3)
- Badge: `Apache 2.0`
- Heading: `Open source where it matters most.`
- Paragraph: `The memory engine, MCP server, and harvest adapters are Apache 2.0. You can fork them, audit them, run them on your own hardware, ship them inside your own product — and you don't owe us a dime for any of it.`
- Bullets: `Memory substrate, MCP server, 11 harvest adapters` · `Hive-mind foundation — the OSS parent project`
- Link: `View on GitHub →`

---

## Section 7 — Final CTA

**Layout:** full-width band, honey-600 → honey-500 gradient ground (brightest section on the page — visual peak before footer). Centered layout.

**Eyebrow:** `The hive opens when you arrive.`

**Headline:** `Give your AI memory that compounds.`

**Body:** `Thirteen specialists, one queue. One cognitive layer. Zero cloud. Free on your machine. Better on every model you try. The hive has been waiting — step inside.`

**Primary CTA:** `Download for {OS}` · sub: `Solo — free forever`
**Secondary CTA (also primary-tier visual weight):** `Start with Pro — $19/mo` · sub: `14-day refund window`

**KVARK bridge (single line below CTAs, muted):** `Deploying at scale? KVARK is the sovereign enterprise deployment of the same stack.` · link: `Talk to a sovereign architect →`

**Responsive `sm`:** CTAs stack vertically, KVARK bridge becomes single line below CTAs (not adjacent).

---

## Footer

Standard structure — four columns on `lg+`, stacked on `sm`:

- **Product:** Download · Pricing · Changelog · Status
- **Developers:** Docs · API reference · GitHub (hive-mind) · MCP server
- **Company:** About · Blog · Careers · Contact
- **Legal:** Privacy · Terms · Sovereign data policy · Security

Bottom line: copyright + "Built by Egzakta. Powered by hive-mind." + social icons (GitHub, X/Twitter, LinkedIn).

---

## Global visual/UX constraints

**Dark-first immutable.** No light-mode toggle in this iteration. Light variants exist but are out-of-scope for v1 landing.

**Dual-axis messaging never collapses.** Hero + Proof + Trust all carry the "sovereign + performance" thesis. Never position Waggle as only "privacy-safe" (understates the performance claim) or only "makes Opus better" (understates the sovereignty claim).

**No stock photography. No abstract 3D renders.** Bee mascots are the only illustrated elements. Hex-texture subtle background only. All other visuals are typography, geometry, and honey-amber accents.

**CTA hierarchy consistent across sections:**
- Primary-Download: honey-500 background, hive-950 text, "Download for {OS}" + sub-label
- Primary-Checkout: honey-500 background, hive-950 text, "Start with Pro" / "Start a team" + sub-label
- Secondary-Learn: transparent background, honey-400 text, honey-400 underline on hover, always uses `→` arrow suffix

**Anti-patterns (must not appear):**
- No "Contact sales" for Teams (self-service pricing only)
- No "trusted by" logos
- No FOMO / countdown / scarcity tactics
- No newsletter/beta signup form (Download is the primary conversion)
- No feature-count pricing checklists
- No bee names used as UI command aliases (bee metaphor is decorative + narrative, not functional)
- No inline persona expansion in v1 hover state (accent + boost only; inline expansion deferred to v1.5)
- No gradient-heavy hero compositions (single subtle gradient in Final CTA band is the only exception)

**Accessibility:**
- WCAG AA color contrast minimum (honey-500 on hive-950 = verify ≥4.5:1 for any text overlap)
- All CTAs have descriptive aria-labels combining label + sub-label
- Bee mascots have meaningful alt text (not "bee illustration")
- Keyboard nav: Tab order follows visual reading order, focus ring 2px honey-400
- MPEG-4 loop respects `prefers-reduced-motion: reduce` → static poster only
- Billing toggle has `role="group"` + `aria-label`, individual toggle buttons have `aria-pressed` state

**Performance (aspirational, may iterate later):**
- LCP budget 2.5s mobile 4G
- MPEG-4 loop ≤800KB, H.264 Main profile, lazy-loaded after LCP
- First 6 persona bee mascots `fetchpriority="high"`, remaining 7 lazy
- WebP format with PNG fallback for bee assets, 2× retina variants

---

## Deliverable expectations

Produce an iterated version of the current landing prototype that implements all seven sections + Footer above, using:
- LOCKED copy strings verbatim (do not rewrite, do not substitute — if a string sounds off, flag it as a comment in the iteration but keep the LOCKED version in the rendered output).
- LOCKED visual tokens (the design system already loaded in this workspace).
- LOCKED structural decisions (section order, personas 6+6+1 geometry, trust panel order, dual CTA hierarchy).

The iteration output should be reviewable as a full-page prototype (desktop `xl` + mobile `sm` at minimum; ideally also `lg` and `md` breakpoints). Code export from Claude Design will later be used as a reference spec for a separate Next.js production port in the `apps/www` repo — the Claude Design output itself does not need to be production-ready code, only visually faithful and copy-accurate.

If you encounter ambiguity in the wireframe (layout edge case, responsive collapse not specified, token missing) — **flag it as a comment in the iteration**, do not improvise a decision. The PM will adjudicate flagged items in a follow-up review pass.

---

## What NOT to do in this iteration

- Do not add analytics event wiring (will be added during Next.js port).
- Do not implement auth flows (Clerk/Stripe/svix) — those are separate CC backend work.
- Do not add a light-mode variant.
- Do not propose alternative copy to LOCKED strings.
- Do not reorder sections.
- Do not add sections (PersonaSegments, Differentiators, KvarkBridge-as-section, BetaSignup — all absorbed/dropped in v1.1).
- Do not add subpages (`/bees`, `/architecture`, `/kvark`) — out of scope for this iteration. Links should render as anchor hrefs but destination pages are separate.
- Do not expand personas into inline cards on hover (LOCKED to `accent_and_boost` in v1).
- Do not substitute SOTA card copy from "Pre-registered" to "Verified" — that flip only happens when the LoCoMo 91.6% benchmark verdict lands (currently pre-registered, not verified).

---

**Status:** v1.1 LOCKED, ratified 2026-04-22. Ready for Claude Design iteration. PM awaits screenshot review post-iteration for v1.1 parity audit.
