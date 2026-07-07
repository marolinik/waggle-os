# Wave U — R14-V2 convergent fixes: state honesty round 2 + felt interaction

R14-V2: design 7.5 · kw 7.4 · competitor 7.3 · a11y 7.2 · brand 7.5 (min 7.2, avg
7.38; V1 was 7.0/7.08 — the regime responds to fixes). This wave ships the seven
convergent asks. Same vocabulary + honesty contract as waves P-T. Surgical; both
themes; testids/aria survive. NO cross-lane files. Per-lane gate: related vitest
green + eslint on touched files. Orchestrator: full gates + kit-v3 capture + R15-V3.

Verification context (read before "re-fixing" anything): the agents hover tier, bee
response, chat action-row reveal, and marketplace NL bridge ALL work in the live
product — R13/R14 capture scripts missed them (now fixed in kit v3). Wave U items
below are the judges' ESCALATIONS, not regressions. Do not rebuild what Wave T built
— strengthen exactly what each item names.

## Lane A — workspace shelf loading truth (5/5 judges, HIGH)
Files: `apps/AllWorkspacesApp.tsx` (+test).
1. The shelf renders "No workspaces yet — Create your first workspace" for ~0.5s
   before data lands. Loading, empty, and error are THREE distinct states: while the
   workspace query is unresolved, render 3 skeleton cards matching the fixed-slot
   card geometry (min-h 132, identity/tag/preview/metrics slot shimmer); the empty
   state (with its Create CTA) may render ONLY after a resolved, genuinely-empty
   answer. Follow the memory surface's cache pattern (memory-list-cache.ts): seed
   from session cache so a revisit shows last-known cards instantly.
2. Card kebab + row affordances: visible at rest at low opacity (the chat action-row
   pattern from Wave T Lane E: rest ~0.6 → hover/focus-within 1.0) — hover-only
   reveal excludes keyboard/touch (a11y). Keep the existing hover tier as-is.

## Lane B — briefing interruption discipline (4/5 judges, HIGH)
Files: `os/AppShell.tsx` (briefing gating only), `os/overlays/LoginBriefing.tsx`
(numbers reconciliation only), tests.
1. The "Catching you up" modal must fire ONLY on true session start AND only when
   Home is the landing surface. In-session navigation to Home (s02: Settings→Home)
   must never pop it. Gate on both (a) once per app session (in-memory flag, not
   localStorage — a new session should show it again) and (b) the first mounted
   surface being Home. When suppressed by (b), do NOT drop the content — the home
   hero already tells the story (judges call the modal+hero a "double catch-up").
2. Numbers reconciliation: the modal says "2 workspaces" while the home hero says
   "6 workspaces waiting" — the modal filters test/canned workspaces, the hero
   doesn't (or vice versa). Find both sources, make them share ONE filtered count.
   Never present two different truths about the same store in the same viewport.

## Lane C — marketplace NL: run the promise (4/5 judges)
Files: `apps/MarketplaceApp.tsx`, tests (+ the search box component if it lives in
a marketplace-owned file — verify with grep; if the search box is shared outside
marketplace, wire from MarketplaceApp side only).
1. When the debounced query is natural-language (≥3 words) and name-filtering finds
   nothing: AUTO-RUN the semantic skill-match (the Search-button path) after a
   ~600ms settle, rendering ranked results inline under a quiet "Matched to your
   request" section label. No dead-end frame: while matching, show the BeeLoader
   (components/ui/BeeLoader.tsx) + "Matching skills to this job…".
2. Restyle the no-match composition: kill the gray "No job matches … by name" line
   as the lead voice. If semantic matching also finds nothing, show 2-3 nearest
   catalog entries ("Closest in the catalog") + the Free Zone escape as a real
   button, not a text link.
3. Keep the existing filter behavior for 1-2 word queries exactly as-is.

## Lane D — boot warm-start (competitor HIGH)
Files: `os/AppShell.tsx` (boot hold logic), BootScreen component, tests.
1. Returning users wait ~3.5s of branded boot before every session vs ~1s
   time-to-content on Claude/ChatGPT. The boot screen's minimum display time should
   be perceptual, not fixed: when the shell's data dependencies (onboarding known +
   briefing prefetch fired + workspace store warm) resolve early, exit boot at
   ~800ms-1s (enough for the brand moment, no dead air). Keep the current longer
   hold ONLY while dependencies are genuinely unresolved. Do NOT remove the boot
   screen or its choreography — shorten its floor.
2. Verify the exit is choreographed (existing fade), not a hard cut, at the shorter
   floor. Reduced-motion: instant swap stays.

## Lane E — a11y text floor + micro-motion tier (a11y HIGH + competitor)
Files: `apps/agents/SuggestedAgentCards.tsx` (text tokens only), `apps/SettingsApp.tsx`
/ `model-gate/ModelGate.tsx` (light amber tier labels only), `apps/memory/MemoryCenterTab.tsx`
+ `apps/memory/MemoryTrustManage.tsx` (tab-swap motion + loading skeleton only), tests.
NOTE: this lane touches settings + memory files that no other Wave U lane touches —
verify with git status before editing that no other lane claimed them.
1. Agent-card second lines (the whisper tier) probe ~2.3:1 in dark — lift informative
   text to ≥4.5:1 both themes (token step, not new colors). Compute in lane notes.
2. Light-theme amber tier labels in Model Pilot ("Primary/Fallback/Budget Saver")
   probe ~3.1:1 — one token step darker in light. Compute in lane notes.
3. Memory "Loading memories…" generic spinner → skeleton rows (the surface's own row
   heights) with BeeLoader only if a full-surface wait is unavoidable.
4. One micro-motion tier on panel swaps: Memory Trust↔Memories tab change gets a
   ~150ms fade-slide (motion-safe gated); same token timing as the Wave T hover tier.
   Do NOT add route-level transitions (out of scope).

## Lane F — chat action row: Claude-level presence (4/5 judges, medium but daily)
Files: `apps/ChatApp.tsx` + the message action-row component, tests.
1. The Wave T reveal works (verified) but under-reads: raise rest opacity one step
   (0.6 → 0.75), bump icon size 14→16px and row height accordingly, and give the
   revealed state a surface (subtle --surface-2 pill behind the icons) so the row
   reads as a toolbar, not floating glyphs. Keep the 150ms reveal + focus-within
   parity exactly as shipped.
2. Send-button micro-pulse when it fills honey (brand ask): one ~200ms scale pulse
   on the empty→ready transition, motion-safe gated, once per transition (no loop).

## Deferred
Memories-tab composition depth (needs product thought, not polish); route-level
shared-element transitions; onboarding chip-style unification (design minor);
BeeLoader adoption beyond marketplace/memory loading states.

## Per-lane gate
Related vitest green + eslint; NO cross-lane files; contrast math in lane notes
where demanded. Orchestrator after merge: web tsc + full vitest + browser QA +
kit-v3 capture + R15-V3 judge round.
