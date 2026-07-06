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
