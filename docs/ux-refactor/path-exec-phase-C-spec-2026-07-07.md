# Path-to-9 execution · PHASE C — the aliveness loop (Pillar 3) + R20 cleanup
### Contract: docs/ux-refactor/path-to-9-2026-07-07.md v3 §Pillar 3 (5/5 endorsed) + R20
### convergent residuals. R20 = min 7.6 avg 7.78; the #1 gap (4/5 HIGH) is streaming cadence.
### All new motion uses lib/motion/tokens.ts. Both themes. Reduced-motion per REDUCED map.
### Per-lane gate: related vitest green + eslint 0 errors + text-color-guard clean on touched files.

## Lane S1 — streaming cadence + honey caret (Pillar 3.1; THE headline, 4/5 HIGH)
Files: NEW `hooks/useStreamCadence.ts` (+ test), `components/os/apps/chat-blocks/TextBlock.tsx`,
`hooks/useChat.ts` (feed the cadence buffer only — do not change the SSE path), tests.
Root cause (verified): the SSE delivers chunks; TextBlock re-renders whole markdown per
chunk → judges read "line/chunk reveal" not "per-token fade." Fix = a render-side cadence
buffer (the v3-sanctioned option: "smooth chunks into a steady visible rhythm with ZERO
added latency to first token").
1. **useStreamCadence(rawText, isStreaming)** → `{ shown, caretVisible }`: keeps a target
   string (the accumulated raw stream) and a `shown` length that advances on rAF toward
   the target at a cadence that SCALES with backlog (reveal ~ max(minCharsPerFrame,
   ceil(backlog / catchupFrames))) so it NEVER lags more than a small window and drains
   fully within ~1 frame of stream end. FIRST characters reveal immediately (no buffering
   delay before first paint). When !isStreaming, snap `shown` to full. Guard: rawText only
   grows during a stream (never reveal past target; handle target shrink on reset).
2. **TextBlock consumes it**: render `renderChatMarkdown(shown)` (the smoothed prefix) with
   a trailing honey caret (`--honey-text`, a soft blink via a token'd keyframe — NOT
   animate-pulse; ~1s) at the reveal head. Reduced-motion: snap to full text, static caret
   (REDUCED.streamingCaret). The existing capability-segment logic + markdown escaping stay.
3. **Hard-case markdown forms without popping** (v3 competitor acceptance): a code block +
   a list must render progressively as the smoothed text crosses their boundaries — no
   whole-block pop. renderChatMarkdown already escapes+emits; verify partial markdown
   (unterminated ``` / partial list) degrades gracefully (renders as forming text, not raw
   noise). Add a test with a chunked code-block+list input asserting monotonic reveal.
4. Zero added latency: unit-test that the first chunk's first chars are shown within one
   rAF, and total reveal completes ≤1 frame after the last chunk.

## Lane S2 — streaming interaction contract (Pillar 3.1 cont'd; v3 competitor blocking)
Files: `components/os/apps/ChatApp.tsx` (scroll container + stop control), the chat scroll
hook if one exists (grep), tests.
1. **Auto-follow scroll that breaks INSTANTLY on user scroll** (input-primacy applied to
   the stream): while streaming, keep the viewport pinned to the newest content; the moment
   the user scrolls up, STOP auto-following and show a "Jump to latest ↓" affordance
   (honey pill, bottom-right of the thread); clicking it re-pins. Re-pin automatically when
   the user scrolls back to the bottom.
2. **Visible stop control**: a Stop button (replaces/augments send while streaming) that
   halts output immediately mid-stream (wire to the existing SSE cancel — grep useChat for
   the abort/cancel path; Lane C added streaming-by-id). The partial answer stays; the
   composer returns to send.
3. Tests: auto-follow pins during stream; a simulated user scroll-up sets not-following +
   shows the jump affordance; stop calls the cancel path and re-enables send.

## Lane AL — surprise-recall bloom · investment celebration · first-60s wow · home ambient
Files: `components/os/apps/chat-blocks/StepBlock.tsx` or the Auto-Recall chip component
(grep "Auto Recall"/recall chip), `apps/HomeCockpit.tsx` (briefing accrual line + ambient),
`overlays/onboarding/*` (first-task wiring — verify), NEW `components/os/warm/AmbientHiveGlow.tsx`
(+ test), tests.
1. **Surprise-recall bloom** (Pillar 3.2, rubric dim-6 — the product's unique dopamine):
   when the Auto-Recall chip appears mid-chat (memory pulled into context), it blooms
   honey for ~600ms (SPRING.micro scale + a honey glow that fades), drawing the eye to the
   "it remembered" moment. Reduced-motion: instant, no bloom.
2. **Investment celebration** (Pillar 3.3): the home briefing states what ACCRUED since
   last visit ("12 new memories · 2 decisions since Tuesday") sourced from real data
   (briefing-source counts — honesty gate: bind to the exact number, no estimate). The
   Phase-B DeltaNumber pulse already exists — reuse it on the accrual figure. If the
   accrual delta isn't available from the current briefing payload, render nothing (never
   fabricate) and note the data gap.
3. **First-60s wow** (Pillar 3.4): verify the first chat message after onboarding
   demonstrably uses the just-entered profile ("As a consultant, you'll want…"). If the
   wiring exists, ensure it's visible; if not, a minimal profile-aware opener. Verify the
   onboarding→first-task handoff in code before adding anything.
4. **Home ambient hive life** (brand HIGH — AmbientHiveGlow.tsx): a slow honey radial
   "breath" (very low amplitude opacity/scale, ~6s cycle) + optional faint hex-cell
   shimmer behind the home hero zone, BELOW attention threshold (must not compete with
   content — brand's "respectful, no gratuitous movement" WIN must survive). Reduced-motion:
   static (REDUCED.ambient → off). Gate the whole thing behind a prop so it's home-only.

## Lane CL — R20 cleanup (verified residuals; several are a11y-HIGH double-yield)
Files: `os/BootScreen.tsx` (reduced-motion glow), `os/apps/AllWorkspacesApp.tsx` +
`apps/memory/MemoryTrustManage.tsx` (card/row overflow keyboard reach), the SectionLabel/
eyebrow usages flagged, the capture kit seed (scratchpad — orchestrator owns), tests.
1. **Reduced-motion boot glow freeze** (s11, 2 judges): the boot radial "breath" ramp must
   be static under prefers-reduced-motion — audit BootScreen for any remaining ungated
   glow (the logo loop was gated in A2; this is the background radial `bg-primary/5 blur`
   if animated, + the progress area). Zero lingering animation under reduce.
2. **Card/row overflow ('…') keyboard reachability** (a11y+design HIGH): the workspace-card
   kebab and memory-row actions must be reachable by Tab with a visible --focus-ring on the
   ACTION itself (roving tabindex if they're in a menu; focus-visible reveal if hover-gated).
   The s10 acceptance ("reach card actions without a mouse") must be provable — add a
   keyboard test that tabs to a card, opens its menu via keyboard, and reaches Delete.
3. **Tertiary-text stragglers** (a11y): the eyebrow labels the runtime pass / judges still
   flag (RESEARCH HUB, START HERE card eyebrows, onboarding subhead + on-device footnote)
   → --text-tertiary (verify each is a real sub-AA case with computed ratio; the SectionLabel
   primitive was raised in Phase A — these may be one-off usages not on the primitive).
4. **Light-theme focus-ring visibility** (a11y): confirm --focus-ring reads on cream —
   contrast-tokens already proves ≥4.03:1; add ONE light-theme focus-ring assertion to the
   keyboard test or a spot check, and note the result (all R20 confirmed rings were dark).
5. Dense-surface rhythm (medium, if time): marketplace results + models grid + memories
   list row vertical rhythm one step looser toward hero-surface craft. Scope-guard: only
   spacing, no structural change; if it risks the busy lanes, defer with a note.

## Kit v7 (orchestrator, not a lane)
- Capture seed: add `waggle-booted: 'true'` + `waggle_onboarding_complete: 'true'` +
  `waggle:login-briefing-dismissed: 'true'` to the returning-user addInitScript so s01
  models the REAL returning user (boot skipped, cache-first ~459ms) — the R20 "2s boot
  wall" was this seed gap (product truth is boot-skipped; gate-verified). KEEP one
  first-launch boot showcase (s09 onboarding already covers first-run warmth; optionally a
  dedicated s12_first_launch to preserve the praised boot choreography as its own journey).
- s04 stream window stays 12fps (judge the new per-char cadence there).

## VERIFY STAGE (adversarial, after lanes)
- **V1-streaming**: from the 12fps s04 stream window + code read — does the reveal read
  per-character/word (not chunk)? Is the honey caret present + reduced-motion static? Does
  a code-block+list form without popping (inspect useStreamCadence + a hard-case test)?
  Does autoscroll break on user scroll + jump-to-latest appear + stop halt immediately?
- **V2-aliveness**: recall bloom fires on the Auto-Recall chip (reduced-motion instant);
  briefing accrual binds to a real number (no fabrication); ambient glow is below
  attention threshold + reduced-motion static; first-60s wiring verified.
- **V3-keyboard**: re-run the s10 acceptance — tab to a workspace card, open its overflow
  menu by keyboard, reach Delete with a visible focus ring; confirm light-theme ring.

## Orchestrator after verify
tsc web + full apps/web vitest + all gates (contrast-tokens/text-color-guard/warm-gate) +
the runtime pass on /home,/settings both themes → commit → kit-v7 capture → R21 judge
(gate: min ≥ 8.5 per v3 §3 after Pillar 3) → Phase D (Pillar 1 motion system).
