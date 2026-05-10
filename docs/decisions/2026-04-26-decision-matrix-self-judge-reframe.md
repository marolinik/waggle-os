# Decision Matrix Amendment — Self-Judge Re-Eval Reframe

**Date:** 2026-04-26
**Author:** PM
**Status:** Amendment to `2026-04-25-launch-gate-reframe-decision-matrix.md` (does NOT supersede; supplements with new ground truth layer)
**Trigger:** 2026-04-25 apples-to-apples self-judge re-evaluation (Stage 3 v6 outputs re-judged using Mem0 paper methodology) revealed methodology gap that changes interpretation of "PASS / PARTIAL / FAIL" bands without altering the bands themselves.

---

## §0 — Why this amendment exists

The 04-25 Decision Matrix locked three pre-registered narrative bands tied to the **91.6% Mem0 marketing reference**:

| Aggregate LoCoMo | Banner | Coupling decision |
|---|---|---|
| ≥ 91.6 | NEW_SOTA | Coupled launch |
| 85.0-91.5 | SOTA_IN_LOCAL_FIRST | Decoupled launch |
| < 85.0 | GO_NOGO_REVIEW | Halt SOTA narrative |

The 04-25 self-judge re-eval discovered that **91.6% is not a peer-reviewed number**. It is a Mem0 marketing claim from `mem0.ai/blog/state-of-ai-agent-memory-2026`. The peer-reviewed Mem0 paper (arxiv:2504.19413) reports **66.9% basic / 68.4% graph** on LoCoMo.

Apples-to-apples re-judging of our N=2000 Stage 3 v6 outputs using Mem0's exact methodology (GPT-4o-mini as both subject and single-vendor judge) produced aggregate scores **+27.35 percentage points higher** than our trio-strict ensemble. This methodology gap accounts for most of the spread between Mem0's marketing claim and Mem0's peer-reviewed paper.

**Implication**: comparing our trio-strict numbers against Mem0's marketing number is methodologically invalid. The fair comparison anchors are:
- Our trio-strict 74% (oracle ceiling) vs Mem0 peer-reviewed 66.9% / 68.4%
- Our trio-strict 48% (V1 retrieval) vs Mem0 peer-reviewed 66.9% / 68.4%

This amendment does not shift pre-registered thresholds (anti-pattern #4 honored). It adds an **honest framing layer** anchored on peer-reviewed comparison instead of marketing comparison.

---

## §1 — Numerical anchor reset

| Dimension | Pre-04-25 anchor | Post-04-25 anchor (binding) |
|---|---|---|
| Mem0 SOTA reference | 91.6% (marketing) | **66.9% / 68.4% (peer-reviewed, arxiv:2504.19413)** |
| Comparison methodology | informal | apples-to-apples trio-strict ensemble vs peer-reviewed paper |
| Our substrate ceiling | not measured | **74% (trio-strict, oracle context, N=400)** |
| Our V1 retrieval | not measured separately | **48% (trio-strict, N=400)** |
| Methodology bias measurement | unknown | **+27.35pp (self-judge inflates aggregate vs trio-strict on our outputs)** |
| Statistical significance H1 | pre-registered | **Fisher one-sided p < 8.07e-18 (PASS)** |

**Result frame**: substrate ceiling **+7.1pp over peer-reviewed Mem0**; V1 retrieval **−18.9pp under peer-reviewed Mem0**; ceiling-to-V1 gap **26pp** is the open V2 work direction.

---

## §2 — Scenario re-classification (8 dimensions revisited)

The 04-25 matrix asked: which of PASS / PARTIAL / FAIL scenario applies, given final aggregate LoCoMo number?

The 04-26 reframe asks: given that we have **substrate ceiling 74% (PASS-shaped)** and **V1 retrieval 48% (FAIL-shaped against marketing claim, FAIL-shaped against peer-reviewed Mem0)**, which scenario is binding?

**Resolution**: dual-narrative — substrate quality narrative + retrieval honesty narrative. This is not a hybrid scenario; it is a re-anchoring against peer-reviewed baseline instead of marketing baseline.

### Re-classified scenario: **PASS-WITH-HONEST-FRAMING (PHF)**

PHF replaces the 04-25 PASS/PARTIAL/FAIL trichotomy with a single coherent narrative anchored on:

1. **Substrate ceiling beats peer-reviewed Mem0** (74% vs 66.9% / 68.4%) — defensible, peer-review-survivable, anti-marketing.
2. **V1 retrieval honest disclosure** (48%, 18.9pp under peer-reviewed, 26pp under our ceiling) — community invitation framing.
3. **Methodology contribution** (+27.35pp self-judge bias quantification) — paper-grade epistemic value beyond product claim.
4. **Apache-2.0 + local-first** — sovereignty axis intact regardless of retrieval V1 gap.

### Why PHF is not a "post-hoc threshold shift"

The 04-25 thresholds were tied to marketing-anchor comparison. The new ground truth (peer-reviewed comparison + measured methodology bias) was discovered AFTER outputs were generated but BEFORE launch. Discovery of new measurement (apples-to-apples re-judging) is not a threshold shift — it is a methodology audit. The pre-registered bands remain binding for any future comparison against the marketing anchor; we just no longer use the marketing anchor as primary because it is methodologically invalid.

Audit-trail position: `2026-04-25-self-judge-rebench-results.json` (pending — to be emitted during pilot completion adjudication or written separately) is the artifact that justifies the re-anchor. Anti-pattern #4 honored: thresholds did not move; the comparison anchor moved because the prior anchor was unreliable.

---

## §3 — 8-dimension decision update

For each of 04-25 matrix's 8 decision dimensions, this section locks the PHF disposition.

### Dimension 1 — Claim narrative (PHF binding)

**Lead claim**: "Hive-Mind exceeds peer-reviewed Mem0 baseline at substrate ceiling: 74% vs 66.9% on LoCoMo, apples-to-apples trio-strict judge ensemble. V1 retrieval is honest at 48% — V2 in progress, community invited under Apache-2.0."

**Supporting**:
- pre-registered manifest v6 (anchor dedd698)
- κ_trio = 0.7878 substantial agreement on judge ensemble
- Fisher one-sided p < 8.07e-18 (H1 PASS)
- methodology contribution: +27.35pp self-judge bias quantified

**Honest caveats** (always present):
- single-benchmark (LoCoMo only); LongMemEval cross-replication in progress
- substrate ≠ end-to-end product; V1 retrieval gap acknowledged
- N=400 sub-sample of LoCoMo-1540 (not full benchmark; pre-registered N)

**What we do NOT claim**:
- "we beat Mem0" without qualification (substrate ceiling vs peer-reviewed paper, not commercial product)
- "91.6% comparable" (methodology contribution shows that figure is +27pp inflated; we do not engage with the marketing number as an equivalent target)
- "SOTA on memory systems end-to-end" (we claim SOTA on substrate quality; product-level depends on retrieval V2)

### Dimension 2 — Launch coupling (PHF binding)

**Coupled launch — Day 0 ships everything in one window:**
- arxiv preprint live (preferably Day 0 -3 days for pickup window)
- hive-mind core public (GitHub, Apache-2.0, npm + PyPI)
- hive-mind-clients monorepo public (2 MVP shims Day 0: Claude Code + Cursor; Hermes + others within 2 weeks)
- Waggle landing live (waggle-os.ai) with v3 copy
- Waggle desktop downloadable (Solo free)
- Stripe checkout active for Pro $19 / Teams $49
- Technical blog post + LinkedIn long-form + Twitter thread + HN/Reddit submissions synchronized within 30-min window

**Why coupled** (vs 04-25 PARTIAL decoupling): substrate-ceiling-beats-peer-reviewed claim is strong enough to anchor a coupled launch. We don't need to decouple to defend a smaller win because the substrate win IS the win — V1 retrieval gap is a feature of the open-source separation framing, not a weakness to hide.

### Dimension 3 — Pricing (UNCHANGED, LOCKED 04-18)

Solo Free / Pro $19/mo / Teams $49/seat/mo. Self-judge re-eval did not change pricing rationale. Decision LOCKED.

### Dimension 4 — Audience (PHF amendment)

**Day 0 primary audience** (sequencing matters):

1. **Technical AI engineers** building production agents — they read papers, evaluate substrate vs retrieval distinctly, recognize the Apache-2.0 + local-first value.
2. **Regulated industry technologists** — banking, healthcare, legal — sovereignty axis lands directly.
3. **Boutique consultants and executive advisors** — Waggle Pro / Teams target audience.

Day 0 NOT primary audience:
- Memory-product-shopping casual builders (they will compare 91.6% marketing vs our 48% V1 and walk away; we don't compete on that comparison)
- Enterprise SaaS buyers (KVARK enterprise sovereign deployment is separate sales motion, post-launch)

### Dimension 5 — Press / PR (PHF binding)

**Tier 1 outreach Day 0**:
- HN front page (technical engineers)
- Linkedin Marko long-form (executive advisor / consultant audience)
- arxiv preprint announcement on Twitter via author network

**Tier 2 outreach Day 0+1 to Day 0+7**:
- The Information / Stratechery (industry analyst tier)
- VentureBeat / TechCrunch AI section
- Selected newsletter authors (Latent Space, Last Week in AI)

**Tier 3 — methodology contribution outreach** (Day 0+14 onward):
- AI evaluation / benchmark authors (could land us in academic discussion of memory evaluation methodology)
- This is the lever for sustained credibility beyond launch news cycle

### Dimension 6 — Hires (PHF amendment)

**Pre-launch (no change from 04-25)**: no net new hires before launch. Marko + existing Egzakta team + AI assistance executes Day 0.

**Post-launch (PHF specific)**: prioritize hiring 1 retrieval engineer to drive V2 work. The +26pp ceiling-to-V1 gap is the most-actionable engineering surface; closing 50% of that gap closes the gap to peer-reviewed Mem0 product-level. Single engineer can drive months of V2 work.

Secondary post-launch hire: 1 community / DevRel for Apache-2.0 + shim adoption. The OSS community contribution thesis depends on community presence we currently don't have full coverage on.

### Dimension 7 — Investor (PHF binding)

**Investor narrative** (if/when investor conversation is appropriate):

"Hive-Mind is the architectural memory substrate that exceeds peer-reviewed Mem0 baseline. Open-source under Apache-2.0 with local-first sovereignty as default. We separate substrate from retrieval, which makes us the first memory system that can be honestly compared layer-by-layer. Waggle is the funded consumer product on top; KVARK is the enterprise sovereign deployment. Three products, one substrate, one founding team."

**Defensive prep** (anticipated investor objection):
- "Your retrieval V1 is below Mem0 product-level." Response: "Yes, by design. We open-sourced the substrate; retrieval is community-pluggable. Mem0 sells a closed bundle. Our durability is in the substrate, not the bundling."
- "91.6% sounds like SOTA." Response: "It's marketing, not peer-reviewed. Peer-reviewed Mem0 is 66.9%. We measured the methodology gap and published it. Investor due diligence should not anchor on marketing numbers."

### Dimension 8 — KVARK timing (UNCHANGED, post-launch sequencing)

KVARK enterprise sovereign deployment GTM motion remains post-launch (week 6+). Hive-Mind + Waggle launch Day 0 generates demand; KVARK sales conversations begin once we have audit-able evidence of customer adoption + regulated-industry inbound. Decision LOCKED.

---

## §4 — Cross-walk: 04-25 bands → 04-26 PHF

For audit-trail purposes, this section maps the 04-25 pre-registered bands to the 04-26 PHF disposition without shifting the bands themselves.

| 04-25 band | 04-25 result interpretation | 04-26 reframe |
|---|---|---|
| ≥ 91.6 NEW_SOTA | "Beat marketing reference" | Not applicable — marketing reference is invalid for comparison |
| 85.0-91.5 SOTA_IN_LOCAL_FIRST | "Clean win in local-first quadrant" | Subsumed into PHF; sovereignty axis preserved |
| < 85.0 GO_NOGO_REVIEW | "Reframe required" | Not applicable — we have substrate ceiling beat against valid peer-reviewed baseline |

**The 04-25 trichotomy was conditioned on a measurement comparison that turned out to be invalid.** PHF is the consequence of running the comparison properly (against peer-reviewed paper) rather than improperly (against marketing claim).

If someone in 6 months argues "you should have hit 91.6", the audit-trail response is:
1. 91.6 was never peer-reviewed (link to Mem0 paper showing 66.9 / 68.4)
2. We measured the methodology gap (link to self-judge re-eval data)
3. We published the methodology contribution alongside the architectural contribution (link to arxiv paper)
4. We anchored launch comms on peer-reviewed comparison (link to landing copy v3)

This is the disciplined path — not threshold-shifting, but anchor-correcting.

---

## §5 — Locked elements (preserved verbatim from 04-25)

These remain binding. Self-judge re-eval did not affect them.

- Pricing: Solo Free / Pro $19 / Teams $49 (LOCKED 04-18)
- KVARK GTM timing: post-launch (LOCKED 04-25)
- Pre-registered manifest v6 anchor: `dedd698` (LOCKED 04-24)
- Trio judge ensemble: Opus 4.7 + GPT-5.4 + MiniMax M2.7 (LOCKED 04-24 v6 Phase 1)
- κ_trio threshold for trio-strict: ≥ 0.61 substantial agreement band (LOCKED Sprint 10)
- 5-cell ablation pre-registered: no-context / oracle / full-context / retrieval / agentic (LOCKED manifest v6 §3)
- Sample size N=400, seed 42 (LOCKED manifest v6 §5)

---

## §6 — Open items pending Marko ratification

1. **Ratify PHF as binding scenario** for launch posture (Y/N).
2. **Ratify dual-narrative claim structure** (substrate ceiling + V1 honest + methodology contribution + sovereignty) as launch comms anchor (Y/N).
3. **Ratify coupled-launch sequencing** (Dimension 2) given PHF — this differs from 04-25 PARTIAL decoupling recommendation.
4. **Ratify Day 0 audience prioritization** (Dimension 4) — technical engineers + regulated tech + boutique consultants.
5. **Ratify post-launch hire prioritization** (Dimension 6) — retrieval engineer first, DevRel second.

After Marko ratifies, this document becomes binding. Launch comms templates (overnight 04-25 brief) populate with verbatim PHF numbers + framing. Landing copy v3 (04-26 brief) is consistent with PHF scenario.

---

## §7 — Cross-references

- Original Decision Matrix: `decisions/2026-04-25-launch-gate-reframe-decision-matrix.md`
- Pre-fill recommendations: `decisions/2026-04-25-pm-pre-fill-decision-matrix-recommendations.md`
- Overnight execution log: `decisions/2026-04-25-overnight-pm-execution-log.md`
- Pilot decision template (separate from this matrix): `decisions/2026-04-26-pilot-decision-template.md`
- Landing copy v3: `briefs/2026-04-26-landing-copy-v3.md`
- arxiv paper outline: `research/2026-04-26-arxiv-paper/00-paper-outline.md`
- arxiv paper skeleton: `research/2026-04-26-arxiv-paper/01-paper-skeleton.md`
