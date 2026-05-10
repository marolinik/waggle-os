# Brand-Bee Personas Card — Scaffold Spec

**Author:** PM
**For:** Landing design workstream (claude.ai/design output integration + Claude Code component author)
**Date:** 2026-04-22
**Scope:** Overview card that renders all 13 bee persona archetypes in one canonical reference, used for (a) design system documentation page `apps/www/src/app/design/personas/`, (b) internal brand reference, (c) future marketing materials.

---

## Purpose

Single-surface canon of Waggle bee archetypes with consistent visual presentation and one-line role definitions. Serves two audiences: internal team aligning on mascot vocabulary, and external reader (landing visitor, partner, prospect) gaining persona-anchored intuition for Waggle's workflow metaphor.

---

## Layout

**Grid:** 4×4 with 13 tiles + 3 blank hex-texture filler cells in corners, OR 5×3 with 13 tiles + 2 filler cells right-bottom. Preferred: **4×4 sa 3 filler tiles** jer hexagonal honeycomb pattern se vizuelno prirodnije rešava sa square-root-sna densitom.

**Tile anatomy (each):**

```
┌───────────────────────┐
│                       │
│     [bee-*-dark       │
│      asset 256×256]   │
│                       │
│   Role Title          │  ← Inter 16/600 honey-400 #f5b731
│   One-line role       │  ← Inter 13/400 neutral-300 #a0a3ad
│                       │
└───────────────────────┘
```

- Tile background: hive-gradient from `#0f1218` top → `#080a0f` bottom, 1px border `#1a1e27`
- Hover: border transitions to honey-500 `#e5a000`, slight scale 1.02, 200ms ease-out
- Persona asset: 256×256 render area, centered, object-fit contain
- Corner filler tiles: `hex-texture-dark.png` tiled at 40% opacity, no copy

**Container:**
- Max width 1200px
- Gap between tiles: 16px
- Page background: `#08090c` (hive-950)
- Heading above grid: "The Waggle Hive" (Inter 32/700 neutral-50) + subtitle "Thirteen personas for the work your AI does while you sleep." (Inter 18/400 neutral-300)

---

## 13 Persona Definitions (role title + one-line JTBD)

Canon ordering optimized for reading left-to-right, top-to-bottom by workflow logic (input → process → output → meta).

**Ratified copy (2026-04-22, post-second-pass brand voice review — see `decisions/2026-04-22-personas-card-copy-locked.md`):**

| # | Slug | Role Title | One-line role |
|---|---|---|---|
| 1 | hunter | **The Hunter** | Finds the source you forgot you saved. |
| 2 | researcher | **The Researcher** | Goes deep and brings back a verdict. |
| 3 | analyst | **The Analyst** | Sees the shape of what keeps repeating. |
| 4 | connector | **The Connector** | Links yesterday's thought to tomorrow's decision. |
| 5 | architect | **The Architect** | Gives chaos a structure you can reason about. |
| 6 | builder | **The Builder** | Turns a spec into something that ships. |
| 7 | writer | **The Writer** | Shapes the story the memory wants to tell. |
| 8 | orchestrator | **The Orchestrator** | Coordinates the agents, tools, and memory. |
| 9 | marketer | **The Marketer** | Translates what you do into what matters to them. |
| 10 | team | **The Team** | Many hands, one hive. |
| 11 | celebrating | **The Milestone** | Marks the moment when the work compounds. |
| 12 | confused | **The Signal** | Raises a flag when memory and reality disagree. |
| 13 | sleeping | **The Night Shift** | Consolidates while you rest — the hive never closes. |

**Copy anti-patterns avoided:**
- No jargon: "cognitive layer", "bitemporal knowledge graph", "MPEG-4 encoding" — stripped out for this card
- No feature claims: "Waggle's Hunter uses FTS5 retrieval..." — no. This card is metaphor-first
- No superlatives: "The best", "The ultimate" — no. Quiet competence tone

**Tone lock:** Matches `docs/BRAND-VOICE.md` (2026-04-15 ratification) — declarative, warm, minimal adjective density. Writer voice is "smart colleague explains the team" not "copywriter sells the product".

---

## Accessibility

- All tile asset files must have `alt="Waggle {Role Title} bee mascot"` — accessible name tied to role not filename
- Tile is `<figure>` element with `<img>` + `<figcaption>` semantically
- Grid is `<ul role="list">` of `<li>` tiles — card order is navigation-relevant
- Hover state is complemented by `:focus-visible` outline honey-500 2px for keyboard users
- Color contrast: honey-400 #f5b731 on hive-gradient dark bg passes WCAG AA large text; neutral-300 passes AA body text
- Reduced-motion respects `prefers-reduced-motion: reduce` by disabling scale transition

---

## Component contract (for Claude Code implementation)

**File:** `apps/www/src/components/BrandPersonasCard.tsx`
**Props:**
```tsx
interface BrandPersonasCardProps {
  heading?: string;  // default "The Waggle Hive"
  subtitle?: string; // default "Thirteen personas for the work your AI does while you sleep."
  showFillerTiles?: boolean;  // default true
  onPersonaClick?: (slug: string) => void;  // optional analytics hook
}
```

**Data source:** Inline const array of 13 persona objects (slug, title, role, imagePath) — NOT fetched, NOT dynamic. This is canon data, ships in bundle.

**Styling:** Tailwind utility classes referencing Hive DS tokens (already in `apps/www/src/styles/globals.css` per 2026-04-20 setup memory). No new tokens needed.

**Dependencies:** None beyond existing apps/www React + Tailwind + next/image stack.

---

## Deployment dependencies

1. **Task #24 (writer + sleeping regen) must CLOSE** before this card publishes — otherwise 2 of 13 tiles render white-dominant and break visual canon
2. Asset path lock: `/brand/bee-{slug}-dark.png` (public folder served at site root)
3. `hex-texture-dark.png` must be in same folder for filler tile background

---

## Exit criteria

1. Component built and renders all 13 tiles with correct asset + correct role title + correct one-line role
2. Grid responsive: 4×4 on ≥1024px viewport, 3×4+1 on 768-1023px, 2×7 on <768px
3. Hover + focus states work, reduced-motion honored
4. Contact sheet screenshot at 1024px viewport shared with Marko for vizuelni go/no-go
5. PM ratifies copy against BRAND-VOICE.md
6. Deploy to `/design/personas/` preview route in staging before merge

---

## Related

- `.auto-memory/project_bee_assets_regen.md` — source of canon style
- `briefs/2026-04-22-bee-writer-sleeping-regen-brief.md` — Task #24 blocking dependency
- `briefs/2026-04-20-claude-design-setup-submission.md` — blurb/copy source that informed this card's heading/subtitle
- `docs/BRAND-VOICE.md` — tone contract ratified 2026-04-15

---

**End of spec.**
