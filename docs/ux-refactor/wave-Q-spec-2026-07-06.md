# Wave Q — R9 convergent fixes (2026-07-06 S2, goal 5×9/10)

R9: design 7.7 · kw 7.4 · competitor 7.5 · a11y 7.6 · brand 7.4 (min 7.4 avg 7.52).
Full verdicts: task output w1vqm327y. R9 shots:
`C:/Users/MARKOM~1/AppData/Local/Temp/claude/D--Projects-waggle-os/a6467fd9-181f-4689-a4ee-1d6dedbbfb17/scratchpad/shots/judge-round9/`
Same shared vocabulary + honesty contract as wave-P spec. Surgical edits; both themes; testids/aria survive.

## Lane A — home interruption stack (5/5 judges, ALL high) — worst surface 6.5
Evidence: `131-home-dark.png` — triple stack: NoModelBanner + home error state (red
triangle + ghosted Retry) + "Catching you up / Briefing unavailable" modal with its
OWN Retry. Judges: "never boot into a blocking modal stacked over two other warnings —
collapse to one problem, one voice."
Files: `overlays/LoginBriefing.tsx`, `model-gate/NoModelBanner.tsx`,
`apps/HomeCockpit.tsx`, + wherever LoginBriefing auto-open is decided (grep its mount).
1. **Briefing fetch failed ⇒ NO modal.** LoginBriefing must not auto-open in its
   error/empty state — home renders normally with ONE slim inline dismissible row
   ("Briefing unavailable — Retry", quiet secondary-button Retry, honey-family glyph
   NOT a red triangle; brand judge: make it a calm branded moment).
2. **One problem, one voice:** when the same root cause (sidecar unreachable) makes
   both the NoModelBanner and the briefing error fire, suppress the second symptom —
   the connection problem is announced once. (NoModelBanner already has its own
   conditions — add the guard where home decides what to show, don't gut the banner.)
3. **Modal composition (for when it opens WITH content):** one alignment grid
   (left-align header/body/footer), close X on the header baseline, no duplicated
   Retry, light-mode surface = real elevated ivory token (currently muddy warm-gray).
4. Home error state (behind the modal today): keep, but honey-family tone + real
   secondary-button Retry (a11y judge).

## Lane B — settings provider-grid state semantics (4/5 high)
Evidence: `137-settings-models-dark/light.png`, `141`. Judges: twelve honey-filled
keyed cards read as wallpaper — "reserve amber for the SELECTED card only, red only
for the erroring one"; Show control "reads as stray unstyled text"; light API-key/
Local-model segment unbalanced; "Validate & save looks permanently disabled".
Files: `model-gate/ModelGate.tsx`, `apps/SettingsApp.tsx`, their tests.
1. Tile rest state: neutral (`border-[var(--line-soft)]`, surface bg, NO honey wash).
   Keyed signal = the small honey Check + "Key in Vault" meta only. Honey border/ring
   is EXCLUSIVELY the selected tile. Failing tile keeps risk wash + glyph.
2. Show control at rail foot → real labeled segmented control (match the Essential/
   Standard/Everything pill grammar used elsewhere: one bordered track, filled active
   cell, 11px caption "Show" above). Keep aria + tier mechanics.
3. Light theme: the API key / Local model tablist — unselected tab must render as a
   visible cell (quiet border or track bg), not ghost text on nothing.
4. Validate & save: empty-input state = quiet outline button + disabled cursor (not
   gray-filled "broken"); enabled = full primary. Transition must be obvious.

## Lane C — memory truth & titles (4/5)
Evidence: `134-memory-dark/light.png`. Judges: raw "session handoff 2026 06 24 s2
warm hive pr8…" titles "puncture the memory-you-can-trust promise"; number story
552 vs 448 vs 445 vs 399 confusing; violet M-id/aging accent = unmanaged third hue;
"0 fresh" reads disabled.
Files: `lib/memory-text-normalize.ts` (+test), `apps/memory/*` (MemoryTrustManage,
MemoryTrust, MemoryCard…). The humanizer EXISTS — extend it, don't fork it.
1. Title humanization at render: strip leading date/slug/handoff tokens into the meta
   row (e.g. "session handoff 2026 06 24 s2 warm hive pr8 landing shipped roadmap
   complete" → title "Warm hive PR8 — landing shipped, roadmap complete" + meta
   "session handoff · 2026-06-24"). Deterministic string transforms only — never
   invent content not present in the string. Add cases to the existing test file.
2. Number story: ONE headline count; the overlapping-view chips (fresh/high-conf/
   stale/to-review) visually subordinate (smaller, quieter) + keep the existing
   "overlapping views" disclaimer adjacent to the chips it explains.
3. Zero-state chip: "0 fresh" → quiet zero styling (dim text, no wash) so it reads
   "count is zero", not "disabled".
4. Violet M-id / aging accent → fold into the warm family (--text-dim / --attention);
   no third hue on this surface.

## Lane D — small truths (kw high + competitor/brand mediums)
Files: `os/StatusBar.tsx`, chat composer strip + message bubbles (grep the Wave-N
"composer agent strip" in chat components), NOT LoginBriefing/NoModelBanner (Lane A's).
1. **Model truth (kw HIGH):** top bar says "Default: Claude Haiku 4.6" while the
   thread + Model Pilot say Claude Opus 4.6 — two contradictory truths at once.
   Fix by SCOPING the status-bar chip label (it is the new-chat default, e.g.
   "New chats: Claude Haiku 4.6" — pick the shortest honest label) — do not fake
   agreement; verify what each source actually reads before relabeling.
2. Composer chip grammar: group left = agent context (persona chip + Memory chip +
   the anonymous 'Y' avatar — find out what 'Y' IS and label/tooltip or remove),
   right = execution (Ask-first + model chip + layers). Visible gap between groups.
3. Light theme user bubble: pale green-grey → warm ivory-honey token (competitor low).
4. Trial chip: "Trial ended · Solo" amber pill screams on every screen — demote to
   quiet neutral text-chip (keep click-through to plans). Notifications 9+ badge: leave.

## Per-lane gate
Related vitest files green + eslint on touched files. NO cross-lane file edits.
Orchestrator runs full web tsc + vitest after merge.
