# Wave X — R18-V6 verified-real defects (NOT a motion-chase wave)

R18-V6: design 7.8 · kw 7.7 · competitor 7.7 · a11y 7.5 · brand 7.8 (min 7.5, avg
7.70). Verdict: "clearly beats Claude, ChatGPT, Codex." Five surfaces at 8.2-8.3.

This wave ships ONLY defects verified live by the orchestrator — not another
motion-amplitude pass (three already shipped: hover tiers T/U, lift+bloom V,
entrance stagger W; a fourth is diminishing-returns whack-a-mole). The one HIGH ask
that is NOT a polish wave — shared-element route transitions — is escalated to the
founder decision point (plan doc §Plateau-2), not attempted here.

Same contract as P-W. Surgical; both themes; testids/aria survive; motion-safe gates.
NO cross-lane files. Per-lane gate: related vitest green + eslint on touched files.

## Lane A — memory hero count-up contradiction (self-inflicted W regression, HIGH)
Files: `apps/memory/MemoryTrustManage.tsx`, tests.
Root cause (verified live + in code, MemoryTrustManage HeroCount L153-177): Wave W
Lane D floored the count-up at `ceil(total*0.15)` (=68 for a 449 hive) to avoid a "0"
frame, but the sub-stat chips ("445 to review", "399 stale") render their true values
immediately — so for ~600ms the hero shows a number BELOW its own sub-stats. A judge
caught "68 Memories" over "445 to review" and read it as a data bug.
1. Keep the felt count-up, kill the contradiction: hold the sub-stat chips (to-review
   / stale / high-confidence / fresh) in their skeleton until the hero count-up
   SETTLES, then fade them in (a nice stagger — total lands, breakdown follows). The
   hero total must never be visibly less than a rendered sub-stat. Reduced motion:
   everything instant, no floor, no stagger.
2. Scope-label clarity: the hero says "N Memories in this hive" (449, current mind)
   while the topbar shows 553 "all minds" — legitimately different scopes but the
   delta reads as drift. Add a quiet scope qualifier so the two numbers are
   self-explaining (e.g. hero stays "in this hive"; if a cross-mind total shows
   anywhere on this surface, label it "across all minds"). Do not fabricate; use the
   real scope the data already carries.

## Lane B — dark-theme secondary-text AA sweep (a11y HIGH)
Files: `apps/memory/*` (M-id/tag/meta rows), `os/StatusBar.tsx` (metadata chips),
`apps/AllWorkspacesApp.tsx` (card "N memories · N sessions · timestamp"), tests.
NOTE: Lane A also touches MemoryTrustManage — Lane B takes memory ROW metadata
(MemoryCenterTab / memory row components), Lane A takes the HERO. Verify no overlap
in the same file region; if a memory file is contested, Lane A wins that file and
Lane B notes the deferred lines. Prefer touching MemoryCenterTab + the row component,
not MemoryTrustManage.
1. Raise dark-theme secondary/metadata text to ≥4.5:1: memory-row IDs/tags (M-531),
   provenance meta, workspace card meta line, statusbar chips. Compute each in lane
   notes (token step, not new colors — most are --text-dim/--text-muted usages that
   pass on --bg but fail on --bg-2/--surface-2; fix the USAGE, not the global token,
   to avoid cross-surface blast radius — same discipline as Wave V Lane F).
2. Do NOT touch light theme (it already nails this per judges) unless a shared token
   forces it — if so, note the light delta and re-verify light math.

## Lane C — micro-label legibility + unselected chip contrast (design MEDIUM + a11y HIGH)
Files: `components/os/warm/*` (SectionLabel / eyebrow primitive — grep for it),
`overlays/onboarding/*` (unselected work-type/team/help chips), tests.
1. The eyebrow micro-labels ("PINNED · POWER TOOLS" 9.5px/1.33px tracking, "WHILE YOU
   SLEPT", "TRUST · INSPECT · CORRECT · FORGET") read as garbled at real size. Bump
   the SectionLabel family to ≥10.5px and cut letter-spacing one step (heavy tracking
   at tiny size is the legibility killer); verify the eyebrow still reads as an
   eyebrow (uppercase, muted) not a heading. One primitive change propagates to all.
2. Unselected onboarding chips: raise their rest contrast so choices are legible
   BEFORE selection (selected honey chips are fine; the unselected state fails). AA
   math in lane notes.

## Lane D — hover overshoot + marketplace name humanization (competitor MEDIUM + low)
Files: `apps/AllWorkspacesApp.tsx` (hover timing only — coordinate w/ Lane B's
meta-text edit in the same file: Lane D owns the hover transition classes, Lane B owns
the meta-row text color; disjoint lines, but BOTH must land — orchestrator applies
Lane B first then Lane D rebases), `apps/agents/SuggestedAgentCards.tsx`,
`apps/extend/ExtensionCard.tsx` (hover), `lib/extension-catalog.ts` (name display), tests.
NOTE: AllWorkspacesApp is shared by Lanes A(no)/B/D — B=meta text color, D=hover
timing. If the executor can't guarantee disjoint regions, Lane D defers the
AllWorkspacesApp hover to notes and does agents+marketplace only. Flag it.
1. Give card/chip hover a crisper eased motion: 120-160ms with a slight scale
   overshoot (1.0→1.02→1.0 settle) on top of the existing lift+bloom. Motion-safe
   gated. This is the competitor's specific ask; keep it TASTEFUL (small overshoot,
   not bouncy).
2. Marketplace result-name humanization: auto-generated names like
   "awesome-claude-plugin-chatDeny-slides-creator" undercut the authored feel. Add a
   display-name humanizer (strip "awesome-"/"-plugin" noise, title-case, collapse
   dashes) applied at RENDER only (never mutate the id/install target). Pure function
   + unit test; leave the real id intact for install.

## Deferred to founder decision (NOT this wave)
- Shared-element / route-transition motion system (design+competitor HIGH) — a
  structural framer-motion arc across react-router route changes, not a polish wave.
- Streaming token-caret "premium feel" — the dev echo provider returns complete
  blocks, so real token streaming can't be shown without a live provider; this is a
  capture/infra limit, flagged not faked.
- Ambient idle micro-life on the home hex-glow (brand HIGH) — net-new motion system.

## Per-lane gate
Related vitest green + eslint; contrast math in lane notes where demanded; every new
animation motion-safe gated. Orchestrator: tsc + suite + R19-V7 + decision-point log.
