# Wave W — R17-V5 convergent fixes: the motion identity wave

R17-V5: design 7.7 · kw 7.7 · competitor 7.6 · a11y 7.5 · brand 7.9 (min 7.5, avg
7.68 — regime high). Same vocabulary + honesty contract as waves P-V. Surgical;
both themes; testids/aria survive; ALL new animation motion-safe gated. NO
cross-lane files. Per-lane gate: related vitest green + eslint on touched files.

Design judge's thesis: "content lands as monolithic blocks after skeletons — a
staggered entrance (~40ms/card, 8px rise+fade, 300-500ms total) is the single
change that moves this from 'CSS transitions' to 'has a motion identity'."
The memory surface already ships a `card-enter` keyframe with 40ms stagger
(Wave V Lane A) — that is the house pattern; REUSE its keyframe/timing, don't
invent a second grammar.

## Lane A — entrance choreography: grids (design HIGH)
Files: `apps/AllWorkspacesApp.tsx`, `apps/agents/SuggestedAgentCards.tsx`, tests.
1. When the workspace grid resolves from skeleton→content, cards enter staggered:
   ~40ms apart, 8px rise + fade, ease-out, total ≤500ms. Reuse the memory
   surface's `card-enter` animation (grep index.css). Runs ONCE per surface visit
   (not on every filter keystroke — filtering re-sorts must NOT re-animate).
2. Same treatment for the six suggested-agent bee cards and the specialists strip
   (strip after the cards, one beat later).
3. Reduced motion: instant, no rise/fade. Existing hover tiers untouched.

## Lane B — briefing recall cards + actions menu craft (design HIGH+MEDIUM)
Files: `os/overlays/LoginBriefing.tsx`, `os/WorkspaceActionsMenu.tsx`, tests.
1. The briefing modal opens fully composed when prefetched (the per-card motion
   delays only fire on slow loads). Re-key the recall cards + workspace rows so
   the stagger runs on EVERY modal open (base delay after modal mount, ~80ms/item,
   8px rise+fade) — the product's hero moment deserves an entrance beat that
   survives 2fps.
2. Actions menu (workspace card '…'): icons per action, roomier padding (match
   the marketplace row density), destructive action visually separated, and a
   150ms scale(0.96→1)/fade entrance transform-originating from the trigger
   corner. KEEP the Escape-returns-focus behavior exactly (judges praised it).

## Lane C — marketplace matching skeletons + results density (design HIGH)
Files: `apps/MarketplaceApp.tsx`, `apps/extend/AgentSearchBox.tsx`, tests.
1. Replace the stale-dim block (data-testid nl-stale-dim) with 3 purpose-built
   result-row skeletons under the "Matching skills to this job…" status —
   row-shaped (icon square + two text lines + chip stubs), animate-pulse,
   motion-reduce:animate-none. Kill the dimmed wrong-content moment.
2. Results view density: when the semantic match returns ≤3 hits, append a quiet
   "More from the catalog" rail (nearestCatalog already exists — reuse) so a
   2-hit answer doesn't strand the user in dark space.

## Lane D — memory counter 0-frame + Memories tab landing (design+kw)
Files: `apps/memory/MemoryTrustManage.tsx`, `apps/memory/MemoryCenterTab.tsx`, tests.
1. The once-per-session count-up starts at 0 — a 2fps frame catches "0 Memories"
   above rendered rows ("reads as a data bug"). Start the animated display at
   ceil(15% of target) so no frame ever shows 0/near-0 with data present; keep
   the ~600ms ease and the once-per-session flag.
2. Memories tab lands on the full recent list (density), with the curated view as
   a labeled filter chip instead of the default — kill "one card in a dark
   field". Keep the result-count header from Wave V. If the curated default is
   load-bearing somewhere else, say so in notes instead of forcing it.

## Lane E — chat streaming proof + onboarding beats (design HIGH + low)
Files: `apps/ChatApp.tsx` (streaming visuals only — verify what exists first),
`overlays/onboarding/WelcomeStep.tsx` + wizard step shell (glow + slide), tests.
1. Verify the send→streaming→settle visual arc: streaming indicator (typing
   cursor / bee shimmer) while tokens arrive, settle beat when done. If it
   already exists, polish only what reads poorly on video (indicator too subtle
   → one visible tier); if absent, add a minimal honey typing-cursor pulse.
2. Onboarding: amplify the mascot glow breathing to a ~3s cycle with a visibly
   larger radius/opacity swing (still tasteful; motion-safe); directional slide
   (~200ms) welcome→step-1 for spatial continuity.

## Kit v5 (orchestrator, not a lane)
s04 gains a send→streaming→settle beat: type the question, SEND it, hold ~8s
while the (echo-provider) response streams, then settle. Dev-store side effect
accepted (research-hub already carries test messages).

## Deferred
Shared-element continuity briefing→home (needs route-transition infra);
hover-amplitude unification pass; s06 panel-swap choreography (8.2 already).

## Per-lane gate
Related vitest green + eslint; contrast math N/A this wave (no text tokens);
every new animation motion-safe gated. Orchestrator: tsc + suite + R18-V6.
