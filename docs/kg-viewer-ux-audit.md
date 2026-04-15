# KnowledgeGraphViewer — UX Audit (Skills 2.0 Tier 3c)

**Audited:** 2026-04-15
**File:** `apps/web/src/components/os/apps/memory/KnowledgeGraphViewer.tsx` (677 LOC)
**Consumer:** `apps/web/src/components/os/apps/MemoryApp.tsx:218`
**Data hook:** `apps/web/src/hooks/useKnowledgeGraph.ts` (31 LOC)

**Verdict:** The component is feature-rich and ships. Gaps are polish/UX, not functionality. Rating: **B+** — ready for private demos, needs the five items below before a KVARK sales-pitch video.

## What's solid

- Interactive d3-force layout with pan / zoom / drag, batched ticks (`TICK_RENDER_EVERY = 2`) to keep React cheap at hundreds of nodes
- Smart node-limit default (≤100 → all; ≤300 → 200; >300 → 200) with top-by-centrality selection (`connectionCounts`) so the filtered subgraph still reflects real graph structure
- Empty state with `Network` icon + nudge copy (line 358-368)
- Interactive type legend — click a chip to hide/show
- Scope selector (current workspace / personal / all workspaces)
- Selected-node detail panel with up to 8 relationships
- Search dims non-matches rather than hiding them (preserves context)
- Fullscreen via native `requestFullscreen` API + cleanup listener
- Hive DS color tokens through `var(--kg-person, #4A90D9)` etc. — respects theme CSS

## Top 5 gaps for demo-video readiness

| # | Gap | File/Line | Fix scope |
|---|---|---|---|
| 1 | **No loading state** — `useKnowledgeGraph` exposes `loading` but the viewer never renders a spinner. Cold-load shows empty state + nudge copy until data arrives, which reads as "no data" instead of "fetching." | `MemoryApp.tsx:218` doesn't pass `loading`; viewer has no prop for it | Add `loading?: boolean` prop, render a skeleton/spinner. ~30 min |
| 2 | **No error surface** — hook captures `error` but viewer never displays it. A failed graph load is indistinguishable from an empty graph. | same as #1 | Add `error?: string \| null` prop + inline error banner. ~30 min |
| 3 | **Hardcoded label colors** — `hsl(40, 20%, 85%)` (line 571, 513) doesn't respond to light mode. Matches the P0 light-mode polish item. | Lines 513, 571, 491 | Replace with `var(--foreground)` or a theme token. ~15 min per occurrence |
| 4 | **No export / share affordance** — KVARK pitch needs "download this graph as PNG/SVG" or "share link." Currently the graph is captive to the window. | Toolbar, next to fullscreen button | Add `download svg`/`copy svg` button. SVG serialization is ~20 LOC. ~1 hour |
| 5 | **Touch events missing** — `onMouseDown/Move/Up` only. Pan and drag don't work on tablet/touch. Safe to assume at least one stakeholder in the pitch will be on an iPad. | Lines 268-327 | Add `onTouchStart/Move/End` that normalize to the same handlers. ~1-2 hours |

## Tier 2 polish (nice-to-have)

- **No keyboard shortcuts** — `+/-` for zoom, `0` for reset, `/` to focus search, `Esc` to deselect. 30 min. Would also document as hover tooltip on the search input.
- **Node labels truncate silently** — 18 chars + ellipsis with no tooltip. Hovering a truncated node should show the full label. 15 min.
- **"Center on node" action missing** — selected-node panel has no "focus this node in the viewport" button. For very large graphs, the user can't find their way back to the focus after panning. 30 min.
- **"Navigate to memory" action** — from selected node, jump to the frame that mentioned the entity. Cross-link into the existing memory search flow. ~1-2 hours.
- **Animation pause** — d3 simulation never stops re-ticking. A "freeze layout" toggle would help screenshots / reduce CPU during idle. 15 min.
- **Graph density warning** — `nodeLimit === 'all'` on a 500-node graph can chug. A one-time toast "Large graph — enabling top-200 for performance" on first encounter. 30 min.

## Accessibility gaps

- SVG has no `role="img"` or `aria-label`
- Buttons use `title` only (shows on hover) — no `aria-label` for screen readers
- No keyboard navigation between nodes (focus rings, arrow-key traversal) — d3-force viewers are inherently pointer-first, but the toolbar is keyboard-hostile today
- Node labels are pure SVG text, not wired to a proper landmark/heading structure
- Would fail WCAG AA audit on focus indicators alone

Not blockers for the sales pitch, but should be addressed before a public-facing enterprise release (EU accessibility act aligns with the AI Act timeline).

## Demo-video readiness checklist

For a ≤60s KVARK pitch clip, aim for this sequence:
1. Open MemoryApp → Knowledge Graph tab (pre-loaded with a seeded corporate dataset — ~150 nodes, 4-5 types, rich relationships)
2. Scope-filter to "All workspaces" — camera zooms in on the newly-appearing nodes
3. Click a high-connectivity node (e.g., a person or a flagship product) — selected-node panel slides in, reveals 8 relationships
4. Search for a specific entity — the graph fades non-matches, the target glows
5. Toggle a type filter off in the legend — see the graph re-balance
6. End on fullscreen mode with the entire company's knowledge visible

**What's missing for that sequence today:**
- Loading state so the opening transition isn't awkward (gap #1)
- A seeded demo workspace with enough density (product task, not this audit's)
- Graph-freeze toggle so the camera can linger on a still frame (polish item)
- Export-as-PNG so the still can be used in the deck outside the app (gap #4)

## Recommendation

**Do not rebuild.** The component is good — it's 677 LOC of working d3 code with sensible performance primitives. Spend ~4-6 hours on the top 5 gaps above + populate a demo workspace. That delivers the "wow" moment for the sales pitch without touching the simulation logic.

## Related backlog items

- P0 light-mode polish (gap #3 overlaps with the broader light-mode issue in `waggle-theme.css`)
- P1 WeaverPanel (`/api/weaver/status`) — similar "demo centerpiece" posture, would pair well with this in a Memory-app tour
- P3 ContextRail deeper integration — the KG-click → chat flow is a natural next integration point (gap #2 mentions this)
