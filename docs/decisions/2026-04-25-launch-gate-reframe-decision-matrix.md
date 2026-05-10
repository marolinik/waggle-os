# Launch Gate Reframe Decision Matrix — Task #28

**Date**: 2026-04-25
**Author**: claude-opus-4-7 (PM Cowork)
**Status**: Decision document, pending Marko ratification post-Stage 3 verdict
**Trigger**: Phase 2 N=400 will deliver Fisher H1 verdict + per-cell pass rates within hours; this matrix prepares Marko's launch posture decisions in advance so the decision moment after results don't require multi-hour brainstorm

---

## §0 What this document does

When Phase 2 N=400 finishes (agentic cell + 5-cell aggregate analysis), Marko gets a verdict:
- **PASS**: Fisher one-sided p < 0.10 + LoCoMo aggregate ≥ 91.6 baseline
- **PARTIAL**: Fisher PASS but LoCoMo 85-91 (clean win in local-first quadrant only)
- **FAIL**: Fisher FAIL or LoCoMo < 85 (no SOTA narrative defensible)

This document pre-records Marko-ova posture for each scenario across **8 decision dimensions** (claim narrative, launch coupling, pricing, audience, press/PR, hires, investor, KVARK timing), so when results land Marko makes a 30-minute ratification call, not a multi-hour planning call.

---

## §1 Pre-registered narrative bands (LOCKED, do not shift post-hoc)

Per Sprint 10 Task 2.2 close-out (LOCKED 2026-04-19):

| Aggregate LoCoMo | Banner | Narrative scope | Honest description |
|---|---|---|---|
| ≥ 91.6 | **NEW_SOTA** | "Beat Mem0 published number" | Headline-driven, comparable-to-SOTA, full launch coupling |
| 85.0-91.5 | **SOTA_IN_LOCAL_FIRST** | "Clean win in local-first quadrant" | Acknowledged honest framing — best Apache 2.0 + local-first + graph result published |
| < 85.0 | **GO_NOGO_REVIEW** | reframe required | Halt SOTA narrative; pivot to ergonomics / infrastructure narrative |

**Pre-registration honor**: do NOT shift bands post-result. If aggregate hits 89.7, banner is `SOTA_IN_LOCAL_FIRST`, not "we hit SOTA-adjacent" creative reframe. Honesty is the moat.

---

## §2 Decision dimension #1 — Claim narrative

### Scenario PASS

**Lead claim**: "Waggle hit [LOCOMO_SCORE]% on LoCoMo, beating Mem0's [BASELINE_REF]% reference. Built on hive-mind, the local-first Apache-2.0 cognitive substrate."

**Supporting**: pre-registered methodology, judge ensemble Fleiss κ, MiniMax M2.7 + Opus 4.7 + GPT-5.4 trio, full audit trail.

**Honest caveats** (always include): agentic cell weaker κ, Qwen 35B subject (single-model evaluation), n=400 not n=1540, Chinese judge ensemble jurisdiction note.

### Scenario PARTIAL

**Lead claim**: "Waggle hit [LOCOMO_SCORE]% on LoCoMo. The first **local-first, Apache-2.0** memory substrate to publish a comparable LoCoMo result. No cloud dependency."

**Supporting**: same methodology + judge ensemble + audit trail. Add explicit framing: "we're 2-7 points behind cloud-shaped Mem0; that gap is the price of local-first sovereignty."

**Defensive note**: acknowledge Mem0 is ahead on aggregate but ours wins on (a) local-first compliance, (b) Apache 2.0 fully, (c) bitemporal graph + I/P/B + harvest breadth.

### Scenario FAIL

**Lead claim**: NOT a benchmark claim. Pivot to: "hive-mind is the Apache-2.0 cognitive substrate that follows you across Claude Code, Cursor, Hermes, Codex, OpenCode, and OpenClaw. One memory file. Zero cloud."

**Supporting**: shim portfolio per Universal Silent Capture brief is the launch substance. Benchmark numbers go in a methodology blog post separate from launch announcement, framed as "honest results from our pre-registered evaluation."

**Honest framing**: "Our LoCoMo result was [LOCOMO_SCORE]%. We don't lead with that number because it's not a SOTA claim. We lead with what hive-mind actually delivers — portable memory across IDEs."

---

## §3 Decision dimension #2 — Launch coupling sequence

### Scenario PASS

**Coupled simultaneous launch — Day 0 ship everything.**
- hive-mind core public (GitHub Apache 2.0, npm + PyPI release)
- hive-mind-clients monorepo public (3 MVP shims: Claude Code + Cursor + Hermes)
- Waggle landing live (waggle-os.ai), Free tier downloadable, Pro/Teams Stripe checkout active
- Technical blog post + LinkedIn long-form + Twitter thread + HN/Reddit submissions synchronized within 30-min window
- Email broadcast to waitlist 24h later

**Why coupled**: SOTA claim is the hook; shims are the adoption multiplier; Waggle is the commercial product. Don't fragment the moment.

### Scenario PARTIAL

**Decoupled launch — hive-mind first (week 0), Waggle second (week 2-4).**
- Day 0: hive-mind core + 3 MVP shims public; "the local-first memory infrastructure for AI IDEs"
- Day 0 narrative: developer-led, infrastructure-led, "we have a clean win in the local-first quadrant"
- Week 2-4: Waggle landing live posle developer adoption signals; "the fully featured cousin that includes everything you can't OSS — agent runtime, GEPA self-evolution, compliance vault"
- Risk: split attention; reward: separate news cycles, easier per-event amplification

### Scenario FAIL

**Pivot launch — hive-mind shims as primary product, Waggle delayed 4-8 weeks.**
- Day 0: hive-mind + 3 shims; pure infrastructure narrative; benchmark numbers buried in methodology post
- Don't launch Waggle simultaneously — without SOTA claim Waggle is "another agent IDE", crowded space, weak differentiator
- Re-evaluate Waggle launch posture in 4-8 weeks: maybe enterprise-first KVARK pilots; maybe wait for second benchmark (LongMemEval); maybe pivot to "the memory infra for AI agent IDEs that wants compliance built-in"

---

## §4 Decision dimension #3 — Pricing posture

### Scenario PASS

**Hold ratified pricing**: Free / Pro $19/mo / Teams $49/seat/mo (LOCKED 2026-04-18 per `project_locked_decisions.md`).

**SOTA premium justified**: $19 for Pro is below Mem0 Starter $19 sa weaker local-first story, $249 Mem0 Pro for graph memory which Waggle has Free. Pricing power is real.

### Scenario PARTIAL

**Hold pricing, but soften messaging**: emphasize Free tier value above Pro/Teams initially. Pro/Teams targeted at users for whom local-first is mandate (compliance-driven), not for whom benchmark is the buy reason.

### Scenario FAIL

**Pricing pivot signal**: consider extending Free tier (e.g., 10 workspaces vs 5, all skills marketplace tiers free) to drive raw adoption. Pro tier becomes "early supporter" at $9/mo introductory price for first 1000 users. Teams tier holds at $49 since enterprise sale doesn't depend on benchmark.

**Subtle narrative**: "Pricing reflects what we think you'll pay; we welcome feedback." Open posture for first 30 days.

---

## §5 Decision dimension #4 — Audience targeting

### Scenario PASS

**Three primary audiences day 0:**
1. **AI/ML researchers + tool builders** — landing page deep-link to methodology + pre-reg manifest
2. **Compliance-conscious enterprises** (banks, healthcare, EU regulated) — KVARK lead capture
3. **Privacy-conscious power-users devs** — Cursor + Claude Code + Hermes + Codex audiences via shim distribution

### Scenario PARTIAL

**Two primary audiences, narrower:**
1. **Privacy-conscious devs** (most receptive to local-first message)
2. **Compliance-mandated enterprises** (KVARK targeted outreach)

ML research audience deferred to second blog post 2-4 weeks later focused on methodology + benchmark interpretation.

### Scenario FAIL

**One primary audience day 0**: developers using AI IDE tooling. Lead with cross-IDE shim portfolio, lead with "your memory follows you", deprioritize ML research audience until later (sequel benchmark or different paper).

---

## §6 Decision dimension #5 — Press / PR strategy

### Scenario PASS

**Synchronized launch with press embargo:**
- Pre-brief: TechCrunch, The Verge, Ars Technica, IEEE Spectrum, AI newsletters (TLDR, Ben's Bites, AI Tidbits)
- Embargo 48h before public; sa NDA on numbers
- Day 0: simultaneous press + community + product release
- Hacker News + Reddit submissions by Marko personally (community gravity > paid PR)

### Scenario PARTIAL

**Soft press strategy:**
- No paid PR
- Community-first (HN, Reddit, Twitter, Discord) — let it bubble up
- Reach out to specific researchers/orgs (DAIR, Anthropic researchers, Nous Research, EU AI Act offices) post-launch

### Scenario FAIL

**No press push at all initially.**
- Quiet launch via GitHub + Twitter
- Let dev community discover organically
- Methodology blog post (separate from launch) targets researchers a few weeks later

---

## §7 Decision dimension #6 — Hires plan

### Scenario PASS

**Aggressive hire signal day 0**: jobs.egzakta.com active sa 3-5 roles (DevRel, Senior eng OSS maintenance, GTM lead, enterprise sales)
**Plus**: prominent "We're hiring" CTAs in blog post + LinkedIn

### Scenario PARTIAL

**Moderate hire signal**: 1-2 roles posted (OSS maintainer, DevRel). Hold enterprise sales hire until adoption metrics inform.

### Scenario FAIL

**No hiring announcements at launch**: hold until 4-8 weeks of adoption metrics validate org capacity needed.

---

## §8 Decision dimension #7 — Investor narrative

### Scenario PASS

**Open conversations with seed/A funds aktivno:**
- Pitch deck v1: "First Apache 2.0 local-first cognitive substrate that beat cloud SOTA on LoCoMo"
- Targets: Initialized, BoxGroup, Founders Fund, NEA (memory-tech adjacent), DCVC, Acrew
- Use Egzakta cash flow signal as bootstrap credential
- Aim: $5-10M seed at $20-40M post-money

### Scenario PARTIAL

**Silent investor conversations only**: pitch deck v1.5 emphasizes "best local-first published result" + commercial trajectory + Egzakta financials. More targeted (5-10 funds), no broad outreach. Aim: $3-7M seed at $15-25M post-money.

### Scenario FAIL

**Defer fundraise 6-12 months**: continue bootstrap from Egzakta; revisit benchmark methodology + ship LongMemEval and BEAM 1M results before next pitch. Use this period to build adoption + revenue signal.

---

## §9 Decision dimension #8 — KVARK enterprise pivot timing

### Scenario PASS

**KVARK pilots active immediately**: 5-10 named enterprise prospects from Egzakta network, EU compliance-driven, sovereign on-prem deployment value prop. Pricing custom per deployment.

### Scenario PARTIAL

**KVARK pilots active 4-8 weeks later**: build case from Waggle adoption metrics first; pilot conversations are "our local-first stack you've heard about, now sovereign-deployed for your hardware."

### Scenario FAIL

**KVARK becomes the lead commercial track**: with Waggle launch deferred, enterprise compliance-mandated deployment is the highest-confidence revenue path. Build sa Egzakta consulting context (already 4.5M EBITDA), bundle KVARK + advisory + LM TEK hardware. Aim for 3-5 paid pilots in 90 days.

---

## §10 Cross-cutting decisions (scenario-independent)

These are decisions Marko makes regardless of scenario:

### 10.1 Honest framing always
Pre-registration honored, banners not shifted, caveats always included (agentic κ, Qwen subject, n=400, Chinese judge jurisdictional note). Honesty is the strategic moat — public benchmark wars (Zep ↔ Mem0) demonstrate that overstated claims unwind.

### 10.2 Apache 2.0 commitment locked
Even if shims are weak adoption signal, OSS commitment doesn't yo-yo. Apache 2.0 stays.

### 10.3 hive-mind core scope locked
Per `research/2026-04-22-hive-mind-positioning/01-architecture.md`: hive-mind = local-first memory substrate; agent runtime + GEPA + compliance + tiers stay in Waggle. This boundary doesn't move regardless of scenario.

### 10.4 EU AI Act + GDPR positioning preserved
Audit triggers, bitemporal graph, local-first storage are uniform features regardless of scenario. Compliance narrative stable across all 3 paths.

### 10.5 Domain locked
waggle-os.ai stays primary; egzakta.com / kvark.com / hive-mind related domains continue per existing setup.

---

## §11 Marko's decision protocol — when results land

When Phase 2 final halt ping arrives sa H1 verdict + LoCoMo aggregate, Marko ratifies:

**Step 1 (5 min)**: Read final halt ping + halt ping classification (PASS/PARTIAL/FAIL based on bands).

**Step 2 (10 min)**: Read this matrix's relevant scenario column across 8 dimensions (#2-#9) + cross-cutting (#10).

**Step 3 (10 min)**: Open `briefs/2026-04-25-launch-comms-templates.md` + decide which template variants apply (each template has scenario-specific reframe options pre-written).

**Step 4 (5 min)**: PM-RATIFY-V6-N400-COMPLETE + sign off on Gate D exit.

**Step 5 (variable)**: Trigger downstream actions per scenario:
- PASS: Marko paste-uje apps/www brief u CC-1 + populates launch comms placeholders + scheduled publish window
- PARTIAL: Marko populates softer comms variants + signals decoupled timing
- FAIL: Marko reviews pivot strategy + ratifies new sequencing for hive-mind shims first launch + 4-8 week Waggle deferral

Total decision time: **30-45 min** instead of multi-hour brainstorm.

---

## §12 Risk register — what could go wrong post-decision

### Risk: scenario classification ambiguity

If LoCoMo lands at exactly 91.4 (almost-SOTA), bands say PARTIAL but instinct may push PASS. **Mitigation**: pre-registration locked the bands. Honor PARTIAL framing.

### Risk: Fisher PASS but accuracy under 85

If H1 PASS (retrieval significantly > no-context) but absolute pass rates low: technically the architecture works (memory adds value) but absolute numbers don't support SOTA narrative. **Treatment**: PARTIAL classification with explicit "structural validation" framing.

### Risk: agentic cell completely fails (parse rate < 50%)

If MiniMax struggles on agentic specifically (κ=0.6875 caveat materializes badly), the cell may be unusable. **Treatment**: report 4-cell aggregate excluding agentic, full transparency about which cell was descriptive-only. Banner pre-reg honored on 4-cell.

### Risk: methodology re-litigation by Mem0 or Cognee

Public benchmark dispute (Zep ↔ Mem0 saga) precedent. Anyone can re-evaluate our pre-reg fixture. **Mitigation**: full open-source pre-reg, judge prompts, raw outputs public. Transparency is the defense.

### Risk: launch coupling stress

If Vercel deploy breaks on launch day, if Stripe webhook fails, if waitlist email gets caught in spam, if GitHub release notes have typos. **Mitigation**: launch comms templates have 24h delay between hive-mind public + Waggle public, giving deploy verification time. Pre-publish checklist enforced.

---

## §13 Output of this matrix — the Marko-readiness state

After Phase 2 final halt ping:

1. PM emits `decisions/2026-04-25-pm-ratify-v6-n400-final.md` sa scenario classification + this matrix referenced
2. Marko reads final halt ping + matrix scenario column + chooses
3. PM populates launch comms placeholders sa actual numbers
4. CC-1 receives apps/www brief in correct context
5. Hive-mind-clients monorepo creation triggered (if accepted in §11 of universal-silent-capture-strategy brief)
6. Launch publish window scheduled

This document's job is done at Step 2 — Marko's posture pre-decided across 8 dimensions × 3 scenarios = 24 cells of pre-thought reactions, freed from brainstorm pressure when results pressure arrives.

---

## §14 Authorized by

PM (claude-opus-4-7) authoring 2026-04-25 morning, parallel sa Phase 2 agentic cell execution. Marko ratifies after Phase 2 final halt ping arrives.
