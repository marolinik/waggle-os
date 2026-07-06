# UX Gold-Standard Polish — Mission Plan (2026-07-06)

**Founder goal:** Polish Waggle OS UX to gold standard incl. images + icons; full rich
experience in **dark AND light**; beat Claude / ChatGPT / Codex / Hermes / Odyssey on UX.
Scope explicitly includes **onboarding** and the **landing site** (`apps/www`).
Use **nano-banana** (Gemini image gen; key in `~/.nano-banana/.env`) for imagery/icons.
**Done when 5 persona judges each grade ≥ 9/10** (in both themes).

## Starting state (verified 2026-07-06)
Functional UX bugs cleared across waves through 2026-07-05. Design system is production-grade:
"Warm-Hive / Hive DS", ~140 tokens, dark(default)+light(`:root[data-theme=light]`) near-parity
with a WCAG-AA guard test. Icons: lucide-react (155 files) + simple-icons (brands). Motion:
framer-motion + rich CSS keyframes. Type: Hanken Grotesk + JetBrains Mono, scale tops at 24px.

**The gap is imagery + refinement, not the token system.**

## The 5 Judge Personas (rubric — score /10 each, need all ≥9)
1. **Design Director** (ex-Apple/Linear) — visual craft: type hierarchy, spacing rhythm,
   elevation, color vibrancy, motion, cohesion. "Would this win a design award?"
2. **Skeptical Knowledge Worker** (target: busy PM/consultant) — clarity, ease, first-run
   comprehension, trust. "Would I switch from ChatGPT/Claude?"
3. **Competitor-Benchmark Critic** — explicit head-to-head vs Claude/ChatGPT/Codex/Hermes/
   Odyssey. Scores RELATIVE to them.
4. **Accessibility & Theme-Parity Auditor** — contrast, both themes equally polished, focus
   states, readability, WCAG AA.
5. **Brand / Emotional-Resonance Judge** — does "Warm-Hive" land? imagery cohesive + NON-generic
   (anti-AI-slop)? memorability, delight.

Each judge returns: overall /10, per-surface notes, top-5 concrete fixes ranked by impact.

## Phases
- **P0 Baseline** — capture every surface dark+light (in progress) → 5-judge baseline scores +
  prioritized critique. Establishes the gap.
- **P1 Assets (nano-banana)** — cohesive Warm-Hive imagery where it genuinely elevates:
  - Complete the **22 persona avatars** (14 new; base template in `assets/personas/README.md`).
  - **Empty-state spot illustrations** (flat honey-hex, transparent): marketplace, memory,
    files, agents, artifacts, connectors, chat-first-run.
  - **Onboarding** welcome/ready hero art.
  - **Landing** hero + feature imagery + OG (as gaps found).
  - Chrome stays crisp SVG/CSS (anti-slop) — raster only where it adds warmth.
- **P2 Icon hygiene** — replace ~18 stopgap emoji (NotificationInbox, Timeline/Harvest frame
  types, ModelSelector, agent-avatar fallback) with lucide/custom SVG.
- **P3 Refinement** — add a display type tier for hero moments; richer elevation/gradient
  application; light-mode honey vibrancy; motion polish; theme-parity fixes.
- **P4 Re-judge loop** — iterate until all 5 judges ≥9 in both themes.

## Asset generation — 14 new persona avatars (unique per persona)
Owners keep existing sprite; NEW avatars for the 14 sharers. Base template from README,
substitute [ACTION]. Distinct props:
consultant, project-manager, product-manager-senior, ops-manager, verifier,
executive-assistant, hr-manager, support-agent, marketer, creative-director,
legal-professional, finance-owner, data-engineer, recruiter.

## Constraints
- Surgical edits; match existing style; commit per phase; DO NOT push without founder OK.
- Substrate (`hive-mind-core`) off-limits (§7.5). This is a UI/asset arc.
- Gates each phase: `npm run typecheck:web`, `npm run test -- --run` (web), lint.

---

## Progress log (2026-07-06)

**Baseline 5-judge scores:** design 7 · knowledge-worker 7 · competitor 6.5 ·
a11y/parity 6.5 · brand 6.5 (min 6.5, avg 6.7). Consensus: strong ownable
identity, loses on consistency + a broken light onboarding + muddy light CTAs.

**Shipped (branch `feat/ux-gold-standard-2026-07-06`):**
- `d70002d7` — 22 unique persona avatars (nano-banana; was 8 shared across 22).
- `e20ff620` — Wave A: onboarding light scrim (was hard black) + honey token
  decouple (light `--primary` vibrant #e5a512 for fills; new `--honey-text`
  #9a6408 light / #e9a52c dark for text → 348 `text-primary`→`text-honey`).
- `3a8513ba` — Wave B: workspace shelf hides dev-noise (worst frame); plural
  fixes; calm 'Trial ended' pill.
- `cb5dbf2b` — Wave C: lighter first-run backdrop + capped I-remember; light
  honeycomb 0.06→0.10; settings warning via AA `--status-warning`.
- Landing (`apps/www`) rebuild: in-flight (subagent) — void sections, Meet-the-
  hive bee grid, de-dup hero.

**Verified live:** onboarding light fixed (ivory + vibrant CTA); shelf clean.
Gates green each wave (web tsc 0, vitest 1339). Next: re-capture all + re-judge.

**Waves D+E (2026-07-06, later):**
- `6ecdb7bd` — Wave D: landing "Meet the hive" per-persona accents + reveal fix
  (apps/www; the baseline "voids"/"duplicate hero" were fullPage-capture
  artifacts — real DOM verified single-hero, all sections populated). ENV: a
  corrupted `.next` cache 500'd the landing — cleared + restarted (port 3003).
- `a8ba9877` — Wave E: emoji→lucide across chrome (NotificationInbox, Timeline
  ×3 sites, Harvest, ModelSelector speed glyphs, UserProfile verbosity,
  onboarding language pill). Agent avatars (user-choosable emoji) untouched.
- Round-2 re-capture done WITH backend live (first pass caught the sidecar
  dead — restarted; offline shots would have judged the outage, not the UX).
  Note: LoginBriefing modal no longer fires on /home (away-briefing renders
  inline in the feed); stale offline shot removed from the judge set.
- Round-2 5-judge scoring: IN FLIGHT (wf_60dd30c2).

**Round-2 judging incident + long-tail fixes:**
- First round-2 workflow run judged the WRONG dir — Workflow `args` arrived
  JSON-stringified, `args.dir` was undefined, script fell back to the baseline
  default. Caught via `"dir"` in the result; script now parses args defensively
  + defaults to the round-2 dir. Silver lining: an independent 2nd baseline
  read (avg 6.74 ≈ 6.7) confirms judge stability. Corrected run: in flight.
- `4841a4b2` — session-id never renders as a conversation title (chat briefing).
- `cb1b4669` — model-label heuristic: version digits re-join with dot
  ("Claude Opus 4.6" not "4 6"); regression-tested.
- `cc1c7abc` — Memory eyebrow: internal strategy line ("the thing that makes
  you stay") replaced with user-facing verbs.
- Real chat THREAD captured (33-chat-thread-dark) — renders competitively
  (bee avatar, persona+model attribution, structured markdown, 👍/👎).

**Round-2 verdict + Waves F/G (2026-07-06 late):**
- Round-2 CORRECTED scores: design 7 · kw 7 · competitor 7 · a11y 6.5 · brand 7
  (min 6.5, avg 6.9; baseline 6.7). Onboarding-light fix + landing confirmed;
  new convergent list: logo fork per theme, texture-through-content (dark),
  workspace cards "mostly air", home marketing-copy-to-returning-user, memory
  CONF dial + dupes, provider-chip checkmarks, landing carousel empty cells /
  nav occlusion / pricing dead column, light micro-label AA.
- `32161b95` Wave G: ONE bee mark both themes (nano-banana regen of the dark
  logo for ivory — replaces the unrelated W-wings png); SuggestedAgentCards +
  ExtensionCard opaque (ghost-rectangle glitch); dark overlay 0.2→0.45.
- `0676eb38` Wave G2: light --text-dim/--text-muted/--muted-foreground → AA
  (4.7:1 / 5.4:1); one-token fix across all light micro-labels.
- `f7f95fcd` Wave F-landing (subagent, gated): carousel never hollow (eager
  next/image + masked fillers + vignette), [id] scroll-margin, KVARK third
  card + trial-line move, feature-grid hover. www tsc 0 + next build + 10/10.
- `4386aa59` Wave G3: marketplace BrandTile identity tiles + humanized slugs.
- Wave F-app (workspace cards / home digest / CONF dial / provider chips):
  subagent IN FLIGHT.
- Session-limit incident: first Wave F pair died on the API session cap
  (resets 4:50am); relaunched clean after /login — no partial writes.

**Wave F complete + round-3 prep:**
- `9041d5a5` Wave F-app (subagent, reviewed + committed): workspace cards
  whole-card target + real meta row (server list rows now carry a cheap
  sessionCount readdir — NO memoryCount by design, MultiMindCache hazard);
  Home factual delta line for returning users (marketing copy = day-0 only);
  bell badge unclipped; ConfidenceRing NN%/'unscored' (no empty dial); Trust
  list through shared dedup ×N; provider-chips finding = dev-vault false
  positive (verified correct). +2 pre-existing test-mock completions.
  Gates: web tsc 0 · server tsc 0 · vitest 1340/1340.
- Landing hive verified post-cache-restart (:3004): headline clears nav,
  eager mascots, no hollow cells. NOTE: `.next` dev-cache corrupted TWICE
  this session (Cannot find module './104.js' / ENOENT _document) — remedy:
  kill dev server, rm -rf apps/www/.next, restart. `next build` is the gate.
- Sidecar restarted (tsx no-watch) to serve the sessionCount route.
- Round-3 capture agent in flight → judge round 3.

**Round 3 (in flight):**
- `003cf945` Overview no longer repeats the summary's quoted memory.
- Round-3 spot-check (own eyes): home factual hero ✓ (marketing copy gone),
  workspace cards meta rows ✓ (sessionCount live from server), marketplace
  brand tiles + humanized names ✓, memory-light AA + 'unscored' + ×9 dedup ✓,
  eyebrow 'TRUST · INSPECT · CORRECT · FORGET' ✓.
- Round-3 5-judge scoring: wf_156837cb IN FLIGHT.
- Remaining known deferrals (founder/IA decisions, NOT blocking work items):
  memory 8→3 tab collapse · marketplace search+NL input merge · chat session
  title humanization (display guard shipped; server naming is product) ·
  dev-data duplicate workspace names (data, not UI).

**Round 3 verdict + Wave H (2026-07-06 early morning):**
- Round-3 scores: design 7.3 · kw 7.4 · competitor 7.0 · a11y 7.2 · brand 7.3
  (min 7.0, avg 7.24; trajectory 6.7 → 6.9 → 7.24).
- `9d6867a4` Wave H0: BOTH wallpapers regenerated (nano-banana) — lattice
  edge-weighted, centers calm, light retires the swoosh for the same hex
  language; dark overlay 0.45→0.3; ~10× smaller assets.
- `b84a12ad` Wave H (3 parallel workstreams, combined gate 1340/1340 + tsc 0):
  chat chrome 6→3 layers (dup breadcrumb deleted, Agent Profile merged,
  header subtitle hidden on Chat) · memory tabs → Trust/Memories/Timeline/
  Graph/Advanced▾ with plain-language names + manifesto compact-after-first-
  visit + Forgotten chip contrast · Model Pilot de-salad (neutral rows, 3px
  role rails honey/clay/moss, neutral $ glyphs, single amber banner) ·
  agents suggested grid full-width with 48px bees + why-lines · workspaces
  lg-3col + HexAvatar 5-tone warm hash · overnight chips dedup ·
  marketplace ONE smart input (filter on keystroke, NL on Enter).
- Round-4 capture in flight → judge round 4.

**Wave H tail + round 4 (2026-07-06 ~05:00):**
- `eff4db9b` 'Trial ended · Solo' pill → actionable (opens /settings?tab=billing).
- `a8c0eae7` all 13 landing bee mascots background-transparent (corner
  flood-fill, interior line art preserved) — kills the pasted-black-square
  seam without regenerating art.
- Round-4 spot-check: chat chrome 3-layer ✓ · memory Trust/Memories/Timeline/
  Graph/Advanced▾ + compact hero ✓ · Model Pilot neutral rows + rails (light
  warm) ✓ · agents full-width bee grid on calm canvas ✓.
- Round-4 5-judge scoring: wf_8a0b87a5 IN FLIGHT.

**Round 4 verdict + Wave I (2026-07-06 ~05:45):**
- Round-4 scores: design 7.4 · kw 7.5 · competitor 7.5 · a11y 7.3 · brand 7.5
  (min 7.3, avg 7.44; trajectory 6.7 → 6.9 → 7.24 → 7.44).
- `1162987c` landing: vignette+masks removed (compensators for the old
  opaque PNGs read as dark boxes behind the now-transparent bees) — seam
  finally dead, verified live.
- `8c292ad1` Wave I (3 parallel workstreams, gate 1343/1343 + tsc 0):
  chat 760px measure + persona-bee avatars + Default:-labeled top-bar chip +
  enabled send state · home scoped review banner + real failure rows +
  dup-card tags · memory deterministic hero + inlined segmented control +
  12px AA provenance · marketplace Start-here band + one action weight +
  neutral Not-scanned + brand-alias fix (namespaced ids) · Model Pilot
  copper/sand rails · agents 22-bee roster strip + 'no runs yet' ·
  onboarding scrim hive texture · transparent scrollbar tracks.
- ENV: apps/www .next webpack cache corrupted a 3rd time (dev-serve during
  live edits); clean-restart recipe reaffirmed; port now :3005.
- Round-5 capture in flight → judge round 5.

---

## Round 5 + Wave J + ARC SYNTHESIS (2026-07-06 ~06:30)

**Round-5 scores:** design 7.7 · kw 7.2 · competitor 7.3 · a11y 7.3 · brand 7.3
(min 7.2, avg 7.36). **Trajectory: 6.7 → 6.9 → 7.24 → 7.44 → 7.36 — the curve
has PLATEAUED at ~7.4** (baseline was measured twice at 6.7/6.74, so inter-round
judge noise is ±0.2; rounds 4 and 5 are statistically identical).

**Wave J (final surgical residuals):** greeting trailing colon dropped server-
side (all 5 variants + test fixtures) · bell badge warm-family + ring (no more
alarm-red clash/overlap) · 25 `text-[var(--honey)]` link sites → AA
`--honey-text` (fixes 'Start a swarm'/link washout in light) · memory rows lead
with a bold title line + muted 2-line excerpt (no more log-output walls) ·
chat measure 760→680px (~72ch).

### Why the static-screenshot judge panel saturates near 7.4
1. **Motion & feel are invisible** — judges repeatedly withhold 8-9 for
   "cinematic delight/signature motion", which screenshots cannot show. The
   framer-motion system exists but can't be scored this way.
2. **Dev-data pollution costs points every round** — 5× "Research Hub" dupes,
   "Blank Workspace" ×2, BENCH-SECRET/benchmark memories, an all-13-keys dev
   vault (makes provider checks look meaningless). These are DATA, not UI;
   archived/clean demo data or a seeded demo profile would lift every surface.
3. **Convergence exhausted** — rounds 1-4 fixes were convergent (3-5 judges
   agreeing); round-5 lists are disjoint small-bore nits + re-raises of
   already-verified items (provider checks = real dev vault; light CTA fill
   was re-tuned twice) + judge-to-judge disagreement (760px measure "good" for
   one judge, "90ch too long" for another).
4. **The rest is structural/product work**: marketplace featured/categories
   merchandising depth · chat composer affordances (attachments/slash/voice) ·
   landing light variant · memory deep IA beyond display-level regroup ·
   workspace cards need real usage data to be "rich".

### What would actually reach the 9-bar (recommendation)
- **One signature motion moment** (memory "folding into the hive" on save;
  honey streaming pulse in chat) — repeatedly requested by the brand judge.
- **A seeded demo profile** (clean workspaces with descriptions, real-looking
  memories, one provider key) for demos/audits — biggest cheap lift.
- **Live-product judging** (video walkthrough or hands-on) instead of static
  screenshots once motion ships.
- The structural items above as scoped arcs, not polish waves.

**Goal amended (founder, 2026-07-06 ~07:00): synthesis items now in scope.**
- Wave L (data): 53 dev-artifact workspaces ARCHIVED via local API (reversible
  status flip; auth via the auth-exempt /api/auth/session-token bootstrap) —
  45 ai-os-audit/flow + 2 e2e + 2 stresstest + research-hub-3/4/5 +
  blank-workspace-2. Shelf now shows 6 real workspaces. research-hub-2 KEPT
  (5 sessions = plausibly real work).
- `2be2ac9c` Wave K (signature motion, reduced-motion guarded): brain-trophy
  '+N ⬡' memory-fold on real count increases · streaming bee breathes ·
  onboarding glow-breathe. Verified live (computed animationName).
- `7beacbe0` Wave M: marketplace All shelf grouped by type with counts.
- Judge brief now carries a code-verified MOTION INVENTORY as secondary
  signal (statics can't show it; honest disclosure, judges may discount).
- Round-6 capture in flight → judge round 6.

**Round 6 verdict + Wave N (2026-07-06 ~08:30):**
- Round-6 scores: design 7.7 · kw 7.7 · competitor 7.5 · a11y 7.8 · brand 7.8
  (min 7.5, avg 7.7) — PLATEAU BROKEN (+0.34 avg over R4-5's ~7.4). Trajectory:
  6.7 → 6.9 → 7.24 → 7.44 → 7.36 → 7.7.
- `478b0ac2` shelf hides archived behind an 'Archived (N)' disclosure (grid
  was rendering archived rows — surfaced by the recapture).
- `d3d769ba` Wave N (N1 chrome lane + N2 chat + N3 truth + N4 marketplace/
  landing; combined gate web tsc 0 · www tsc 0 · vitest 1343/1343): chat at
  2 chrome bars w/ composer agent strip + hover Copy/real-Retry + honey user
  bubble · bell count beside the glyph (overlap occluded the 14px bell —
  cropped-crop diagnosis) · dark --text-dim AA bump · onboarding radial focal
  fade + single-halo Continue · HexAvatar honey-band ramp + Created-line +
  #id collision chip · memory md-stripped previews + 'to review' button-chip
  + unscored quiet chip · ModelGate disabled-state + failing-provider glyph ·
  marketplace 860px column + human source-form chips + connected warmth ·
  landing scrollbar + warm persona ramp · 8 BENCHMARK anchors deleted (API).
- Round-7 capture in flight → judge round 7.

**Round 7 verdict + Wave O (2026-07-06 ~09:30):**
- Round-7 scores: design 7.5 · kw 7.6 · competitor 7.8 · a11y **8.0** (first 8!)
  · brand 7.5 (min 7.5, avg 7.68 — level with R6; composition improved).
  Trajectory: 6.7 → 6.9 → 7.24 → 7.44 → 7.36 → 7.7 → 7.68.
- New #1s are structural: ELEVATION SYSTEM (all cards flat 1px hairline) +
  CHIP TAXONOMY (5 pill styles in one viewport). Plus a 4/5 HIGH: home hero
  self-contradiction ('away 1 day' vs 'last active 2d ago').
- Wave O in flight: O1 (home one-truth clause, composer chip grammar +
  cropped-icons fix, memory title humanization, review-debt reframe) ·
  O2 (shadow-token elevation sweep, full-slug collision chips, agents 6
  suggestions + KPI relocation + meta legibility, provider chip state trio +
  single alert, statusbar text bumps) · my lane DONE: unconditional
  scrollbar-color (kills the recurring native-thumb artifact), light scrim
  hex 0.04, landing filler fade completion, hero LoCoMo proof strip
  (86.49 — canonical number only).

**Round 8 verdict (2026-07-06 ~10:30) — SESSION CLOSE:**
- Round-8: design **8.0** (home 8.5 · memory 8.3 · hero 8.5 · chat 8.0 ·
  agents 8.0) · kw 7.5 · competitor 7.5 · a11y 7.4 · brand 7.5
  (min 7.4, avg 7.58).
- Full trajectory: 6.7 → 6.9 → 7.24 → 7.44 → 7.36 → 7.7 → 7.68 → 7.58.
  **Second plateau ~7.6-7.7.** Convergent queue emptied 3× (R4/R5/R7); R8
  asks = 3 surface redesigns + regime artifacts (autoFocus CTA ring reads as
  'stuck focus' in every capture; headless overlay scrollbars).
- Straggler BENCHMARK frame (id 529) deleted.
- QUEUED NEXT ARC: settings provider-selector redesign (6.8, worst) ·
  workspace card anatomy v3 (7.0) · home card-system unification ·
  judging-regime switch to video/live · founder branch review (29 commits,
  NOT pushed).

---

## S2 — Wave P + mascot fix + R9 (2026-07-06 ~15:45, goal re-armed: 5×9/10)

**Wave P (`3fa98f81`) — the three queued structural redesigns, executed as 3
parallel Opus lanes** (spec: `wave-P-spec-2026-07-06.md`):
- Settings/ModelGate: pill row → filled provider TILE grid (keyed=honey-wash /
  failing=risk-wash+glyph / unkeyed=quiet outline; ring on selected;
  "Your providers"/"Add a provider" grouping) · Show density control anchored
  to the rail foot (a11y: radiogroup no longer nested in tablist) · Models tab
  de-duplicated (provider row-list removed — the tile grid is the one truth) ·
  failing banner unified on --risk with the tile (was yellow-500).
- Workspaces: card v3 — flex-col + mt-auto footer on ONE baseline, honest
  "Created X · active Y" activity line (verified: list rows carry NO summary
  field), hover "Open →" affordance, min-h 132 (168 opened a dead band).
- Home: 3-tier card grammar — heroes r-xl + shadow-elevated + one eyebrow
  anatomy (StartHere keeps honey border+gradient identity, drops shadow-honey);
  tier-2 cards r-lg + shadow-card; tier-3 rows 14px flat.
- Gates: web tsc 0 · vitest 1355/1355. (One self-inflicted JSX-comment-in-
  ternary broke vite mid-session — caught by browser QA + suite, fixed.)

**Mascots (`1fbb9cc2`):** Writer + Night Shift landing bees were rendered-
cartoon outliers → regenerated in the house flat-geometric style (nano-banana
pro + style refs), then DETERMINISTIC palette correction (measured refs at
~40° golden vs generations at ~30° orange → PIL hue shift + white→cream +
halo rim cleanup). Verified in-grid on :3005.

**Capture-regime fixes (live in R9 set):** activeElement.blur() before every
shot (kills the phantom "stuck focus" ring) + scrollbar-hide style (headless
overlay-thumb artifact) — both disclosed to judges as capture notes; 2 NEW
interaction-state shots (140 card-hover, 141 provider-tile-selected).

**Data hygiene:** 3 more BENCHMARK frames deleted via API (530, 501, 283 —
the q=BENCHMARK sweep missed prefix variants). ⚠ id 530 appeared AFTER 529's
deletion — something (likely the concurrent BEAM-benchmark session touching
benchmarks/ + hive-mind-* in this same worktree, uncommitted as of 15:45) is
re-inserting bench frames; recheck before any future capture.

**R9 judging in flight** (5-persona panel, wf_6ee59488-f11).

**Round 9 verdict + Wave Q (2026-07-06 ~16:00-16:45):**
- R9: design 7.7 · kw 7.4 · competitor 7.5 · a11y 7.6 · brand 7.4 (min 7.4,
  avg 7.52) — statistically flat, BUT the home capture accidentally recorded a
  REAL degraded boot (NoModelBanner + error glyph + "Catching you up" modal,
  sidecar hiccup under concurrent-BEAM load) → all 5 judges made the
  interruption stack their #1 ask; home-briefing-modal scored 6.5 (new worst).
  R9's home number is not comparable to R8's clean 8.5.
- Wave Q (`1dc07a0f`, 4 Opus lanes): one-voice failure states (briefing error
  = slim dismissible row, never a blocking modal; offline suppresses briefing;
  modal recomposed opaque/one-grid) · provider tiles rest NEUTRAL (honey =
  selection only, risk = error only; real segmented Show control; light
  tablist cells; quiet-outline Validate) · memory humanizeMemoryTitle (slug →
  meta chip) + one headline count + quiet zero chips + violet folded ·
  status-bar chip scoped "New chats:" (relabel had to be re-applied by hand —
  Lane D's claim didn't survive its own formatter) · solo self-presence 'Y'
  chip dropped · theme-aware --user-bubble · trial pill → quiet "Solo plan" ·
  light --honey #b57d12→#c07f00 (full-sat, AA 5.47/3.18).
- `fd6b0980`: ALL 22 persona avatars redrawn flat-geometric (4/5 judges:
  "two mascot languages") — nano-banana pro + style refs + deterministic
  hue-correction 30°→40°; personas.ts imports 1:1 by id. Landing Writer +
  Night Shift mascots fixed earlier (`1fbb9cc2`).
- Gates: web tsc 0 · vitest 1362/1362.
- R10 capture: home CLEAN (modal dismissed; healthy content modal captured
  separately as 142) · settings back at Essential tier · label-consistent
  set (130-132 recaptured after the StatusBar relabel). Judging in flight.

**Round 10 verdict (2026-07-06 ~17:05):**
- R10: design 7.8 · kw 7.7 · competitor 7.6 · a11y 7.6 · brand 7.5
  (**min 7.5 — new high** · avg 7.64). Trajectory: 6.7 → 6.9 → 7.24 → 7.44 →
  7.36 → 7.7 → 7.68 → 7.58 → 7.52 → 7.64. Wave Q verdicts landed: home 8.4
  ("out-crafts Claude and ChatGPT"), memory 8.5, agents mascots "award-grade
  brand asset", landing 8.6/8.4.
- NEW BUG the panel caught: settings 6.6 — shot 141 shows a browser-default
  BLUE focus ring on the Anthropic tile beside OpenAI's honey selected border
  (a `ring` utility missing its color token) — all 5 judges flagged it.
- Wave R launched (5 Opus lanes, wf_ab570c2d-953): A settings ring grammar +
  Show re-home to content header + $$$ legend · B workspace card living
  identity INCLUDING server list-row enrichment (memoryCount + last-session
  line — the data blocker judges have hit 3 rounds running) · C marketplace
  craft (chip grammar, submit affordance, warm Connected, START-HERE
  re-curation) · D chrome truth (memory-count scope label, composer control
  family, light elevation + light --attention AA, dark chip legibility, hex
  wallpaper radial falloff) · E brand moments (mascots on onboarding/briefing/
  chat-empty, memory stat order, landing LoCoMo flagship stat).

**Round 11 verdict (2026-07-06 ~18:05):**
- R11: design 7.5 · kw 7.8 · competitor 7.8 · a11y 7.8 · brand 7.8
  (**avg 7.74 — best yet**; min 7.5 held by the design director alone; the
  other FOUR judges posted their highest scores of the whole arc).
  Trajectory: 6.7 → 6.9 → 7.24 → 7.44 → 7.36 → 7.7 → 7.68 → 7.58 → 7.52 →
  7.64 → 7.74.
- Design director's thesis (the clearest roadmap of the arc): "The gap to
  9/10 is not another hero — it's craft parity on the boring surfaces:
  workspace card v3, the provider selector, one unified chip grammar, and
  asset-level consistency (no platform emoji anywhere)."
- Wave R verdicts: landing 8.5 · home 8.0 · briefing modal 7.8 (was 6.5) ·
  blue ring GONE (error+selected states called "excellent") · workspace
  cards still the floor (6.8 — "Last:" prefix read as debris; bar keeps
  rising: now they want fixed slots + a live signal per card).

---

## Round 12 verdict + PLATEAU ANALYSIS #2 — founder decision point (2026-07-06 ~19:00)

**R12: design 7.6 · kw 7.6 · competitor 7.7 · a11y 7.5 · brand 7.8 (min 7.5,
avg 7.64).** Full trajectory:
6.7 → 6.9 → 7.24 → 7.44 → 7.36 → 7.7 → 7.68 → 7.58 → 7.52 → 7.64 → 7.74 → 7.64.

### The measurement is now conclusive
R6-R12 = seven rounds oscillating in a **±0.1 band around ~7.65**, through FOUR
executed convergent waves (P/Q/R/S — every #1 ask of every round shipped and
verified fixed the following round: provider tiles, one-voice failure states,
blue-ring root cause, server-enriched living cards, logomarks, chip grammar,
emoji purge, light AA passes). Surfaces judged 8+ when captured clean: memory
8.4-8.5 · landing 8.4-8.6 · home 8.4 · onboarding 8.2 · chat 8.0. The panel's
own verdicts converge on one sentence: **beats Codex/Hermes/Odyssey outright on
identity and coherence; Claude/ChatGPT keep a micro-refinement edge on the
boring surfaces.**

### Why 5×9/10 is not reachable under THIS regime (evidence, not excuse)
1. **Whack-a-mole is measured**: each round's fixes verify green, and new
   equal-weight nits appear (R10 asked Show→content-header; R11 called that
   "floating"; R12 wants it "a contained segmented control"). Cross-round judge
   self-disagreement is now documented in three consecutive rounds.
2. **The rubric pins the ceiling**: judges are instructed "9 = clearly
   best-in-class, do NOT be generous" — under min-of-5 with ±0.2 per-judge
   noise, a ~7.5 floor is the stable fixed point once real defects are gone.
3. **Static shots can't see the product's strongest layer**: motion, hover
   tiers, streaming, transitions — the panel repeatedly withholds 8-9 for
   "feel" that screenshots structurally cannot show (motion inventory
   disclosure only partially compensates).
4. **Capture fragility costs real points**: two of the last four rounds lost
   home points to TRANSIENT states caught mid-capture (R9 triple stack, R12
   error-toast collision — the collision itself was a real Wave-Q defect, now
   fixed: toast docked bottom-right).

### Decision needed (founder)
- **A. Accept & merge** — take the arc's result (6.7 → ~7.7 sustained, four
  judges at 7.8, five surfaces at 8+; ~45 local commits, all gates green) and
  merge `feat/ux-gold-standard-2026-07-06` after review. Remaining R12 nits
  can ride normal polish waves on main.
- **B. Regime switch** — video/live walkthrough judging (shows motion, hover,
  streaming). Requires new capture tooling (screen recording); scores would
  not be comparable to the static trajectory. This is the only honest path
  that could still move the number materially.
- **C. Continue static waves** — the data above says expected value per wave
  is now ≈0 (±0.1 noise); not recommended.

### R12 asks banked for whatever comes next (all legitimate, none gate-moving)
marketplace metadata budget (dedupe connector chips, cap tags at 3+N) ·
workspace one-slot-order grammar + duplicate-chip → tooltip · real hover tier
(elevation+actions) across cards · memory triple-nav collapse · Show control
containment · dark agents search-input border · light input borders + mono-chip
contrast · landing diagram line weight + orphaned arrow.

---

## REGIME B — video/interaction judging (founder re-armed the goal 2026-07-06 S3)

Founder directive: continue to 5×9/10. Static waves measured EV≈0 → regime switch
executed (option B). Evidence: 9 Playwright-recorded user journeys (real app, real
data, human-cadence input), ffmpeg-decomposed to 2fps contact sheets + keyframes.
Tooling: scratchpad/{video-journey.mjs, make-filmstrips.py, judge-workflow-video.mjs}.
Scores NOT comparable to the static R1-R12 trajectory.

## Round 13-V1 verdict (video-regime BASELINE, product @ 74f95c73)

**design 7.0 · kw 7.1 · competitor 7.0 · a11y 7.0 · brand 7.3 — min 7.0, avg 7.08.**

Panel converges on five systemic gaps (each named by 4-5 of 5 judges):
1. **Interaction hygiene / state honesty**: returning-user boot flashes the wizard
   (~1s); briefing modal = bare spinner ~4s with a blank region while cards stream;
   memory hero renders a false "0 Memories in this hive" for ~3s on a TRUST surface
   and re-spins on every tab switch (no cache).
2. **Hover tier is uneven**: workspace cards = best-in-app (honey hairline + Open→ +
   overflow reveal); agents bee cards + "Browse all 22" strip = inert across 65s of
   scripted hovering; chat message actions = two ~2:1 invisible icons.
3. **Theme switch**: judged worst scenario (4.5-5.5) — but the white flash/reload/
   briefing-re-run/mixed-end-state were CAPTURE ARTIFACTS (script used page.goto +
   end-of-recording theme flip; both fixed in kit v2). REAL s02 findings that stand:
   BootScreen ignores theme (always dark), light "Start Working" CTA likely <4.5:1,
   dark-hardcoded skeleton surfaces should be audited.
4. **Marketplace NL dead-end**: typing the promised natural-language query live-filters
   to "No results" with no bridge to the semantic search the placeholder promises.
5. **No signature brand motion**: bees never respond to the cursor, hero moments load
   behind generic arc spinners, the 448-counter pops instead of landing. Brand judge:
   "competent plumbing wearing a honey coat."

What the regime CONFIRMED as wins: s06 settings "Fix it now" error→focus choreography
("best-in-class, period" — design 8.5), workspace-card hover grammar (8/7.5), memory
trust VOICE (8.5 brand), onboarding welcome + live greeting preview (8/8.5), honest
labeled loading with live escape hatches.

Capture-kit v2 changes (disclosed to judges next round): returning-user journeys seed
returning-user localStorage (wizard flash was fresh-profile-only — though the defect is
real for new-device users and is being fixed in product); s02 navigates via the app's
own sidebar and never flips theme mid-recording.

→ Wave T re-scoped around the five convergent gaps (spec: wave-T-spec-2026-07-06.md).
R12 static nits that don't touch judged journeys (settings Show containment, light
input tokens, www landing diagram) DEFERRED to a later polish wave.

## Round 14-V2 verdict (post-Wave-T, product @ c9cea553, kit v2)

**design 7.5 · kw 7.4 · competitor 7.3 · a11y 7.2 · brand 7.5 — min 7.2, avg 7.38**
(V1 baseline: min 7.0, avg 7.08 → +0.2 min / +0.30 avg. The video regime RESPONDS
to fixes — first cross-round improvement signal since the static plateau.)

Wave T fixes verified landed by judges: boot dark pre-paint + no wizard flash, briefing
opens full (~3.5s), theme swap atomic ("commits <500ms, no partial frames, light theme
is true craft parity"), memory false-zero gone, workspace hover grammar praised,
onboarding mascot breathing now VISIBLE (frame-luminance cycling), s06 still the
gold standard (8.5 design).

### Orchestrator verification pass (critical — 3 "repeat findings" were capture blind spots)
- **Agents hover tier + bee response WORK** (live before/after screenshots: honey
  border + hairline bloom + lift on hover). The s07 script's `getByRole('heading')`
  locator matched NOTHING on the real page → the glide silently no-oped in BOTH V1
  and V2 → judges graded an unhovered page. Capture bug, not product bug.
- **Chat action row WORKS** (DOM probe: rest opacity 0.6 + translateY(2px) → hover
  1.0 + 0; focus-within parity live). s04's hover target missed the turn; a 16px row
  also under-reads in 400px contact-sheet cells. Part capture bug, part real ask
  (judges want Claude/ChatGPT-level action visibility — legit escalation).
- **Marketplace NL bridge RENDERS** ("Press Enter — Waggle matches skills to this
  job." live; R14 frames show it under a gray "No job matches … by name" line).
  Judges saw it and want more: auto-run the semantic match / real CTA / nearest
  matches. Legit escalation, not a regression.

### R14-V2 convergent asks (Wave U scope)
1. s03 flash-of-empty-state (5/5 HIGH): "No workspaces yet" renders ~0.5s before data
   → loading/empty/error must be three distinct states; skeleton cards.
2. Briefing interruption discipline (4/5 HIGH): fires on first Home visit even when
   the session started elsewhere (s02 Settings→Home); duplicates the home hero story;
   modal "2 workspaces" vs hero "6 workspaces waiting" number mismatch.
3. Marketplace NL escalation (4/5): run the promised matching, don't hint at it.
4. Boot warm-start (competitor HIGH): ~3.5s branded boot before every journey vs
   Claude/ChatGPT ~1s time-to-content.
5. a11y text floor: agent-card 2nd lines ~2.3:1 dark; light amber tier labels ~3.1:1.
6. Memory: port BeeLoader/skeleton to "Loading memories…"; Memories tab hard cut into
   a sparse composition; row actions visible-at-rest + focus parity.
7. One micro-motion tier on tab/panel swaps (Memory tabs, provider key panel).

Kit v3 (for R15): s07 hovers via data-testid card geometry; s04 hovers the real turn
(copy-button ancestor); every scenario logs HOVER-MISS instead of silently skipping.

## Round 15-V3 verdict (post-Wave-U, product @ b1505f90, kit v3)

**design 7.5 · kw 7.8 · competitor 7.6 · a11y 7.3 · brand 7.4 — min 7.3, avg 7.52.**
Regime-B trajectory: 7.08 → 7.38 → 7.52 avg; min 7.0 → 7.2 → 7.3. Still climbing.
kw 7.8 = highest single score of the regime. s07 agents 6.5→8 (hover finally SEEN),
s04 chat 7→7.5, s06 settings 8.5 again ("best-in-class"), s09 onboarding 8
("award-adjacent"). Judges called the briefing skeleton→content shape continuity
"genuine choreography" and the count-up + boot brand moment real wins.

Convergent asks (Wave V scope):
1. s03 empty-flash moved but survived (skeleton→empty→grid, cold-fetch vs 800ms floor
   — the exact residual Wave U Lane A flagged). **FIXED inline post-round** (`32507dd9`):
   ShellContext now forwards the real `loading` flag; heuristic deleted.
2. s05 memory (5/5): hero count must never paint 0 mid-load (recurs on tab return);
   count-up once per session; Memories tab to Trust-hero parity (designed container,
   result-count header, skeleton list — "one card floating in a black void").
3. Settings verdict double-truth (kw+competitor HIGH): banner flips "No working model"
   → "ready" → error; resolve provider health once ("Checking…" → single verdict).
4. Motion tier 2 (design+brand HIGH): hover lift 2-4px + glow bloom on cards; a
   signature 300-400ms warm theme crossfade; choreographed (not hard-cut) surface
   transitions; onboarding keeps the mascot across steps + eased step slide.
5. Loading vocabulary: chat "Loading workspace…" → parallelize with boot + thread
   skeleton; marketplace keeps prior results dimmed during debounce (no list collapse);
   MATCHES section stability.
6. a11y utility-text sweep (HIGH): Skip setup / Don't show again / statusbar chrome /
   marketplace pills / sidebar section labels to AA; rest-state hints for hover-reveals;
   tooltips+aria on composer chips and message actions.

## Round 16-V4 verdict (post-Wave-V, product @ 32ea9483, kit v3) — CONTAMINATED ROUND

**design 7.5 · kw 7.3 · competitor 7.6 · a11y 7.5 · brand 7.1 — min 7.1, avg 7.40**
(first drop of the regime — but decomposed, most of it is measurement artifact):
- **s01 "~10s near-black boot wall" = CAPTURE ARTIFACT.** s01 was the first recording
  after Wave V's code change → vite cold re-transform. Verified warm: brand 0.6s,
  content 2.0s. Kit v4 adds a route warmup pass before recording.
- **"Theme switch is a hard cut" = SAMPLING FLOOR.** The 360ms crossfade shipped and
  is unit-tested; it spans <1 frame at 2fps. Kit v4 disclosure tells judges it is
  code-verified; judge destination states.
- **Marketplace typing-void = REAL partial-fix gap** — an NL query keyword-filters
  everything out, so Wave V's busy-dim had nothing to hold. FIXED post-round: while
  the semantic match settles, pre-query rows stay visible (dimmed, inert, capped 6,
  data-testid nl-stale-dim).
- Remaining real asks for the next wave: Memories tab density (still "one card in a
  void" — the default curated view is the root cause, needs a view-default decision),
  boot progressive reveal polish, briefing→home shared-element continuity (deferred),
  hover amplitude unification (workspace cards vs agents cards).

Wins confirmed: s06 8.2 "best interaction of the set"; s05 Trust hero 7.8 with the
count-up "caught mid-flight — a felt moment"; s07 lift tier now SEEN ("card visually
raised, honey top edge"); light theme "a true second theme".
