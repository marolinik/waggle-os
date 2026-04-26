# task-1 cell B — multi-step trace

## SYSTEM

```
Persona: You are the CFO of NorthLane, a Series B B2B SaaS company providing supply-chain visibility software to mid-market manufacturers. The company has $14.2M ARR, 84 full-time employees, 18 months of runway. Today is April 26, 2026.

Scenario: Q1 2026 just closed. Your CEO has asked you to prepare a 1-page memo for next week's board meeting identifying the **3 most critical risks** for Q2-Q4 2026, with a recommended action plan for each.

You have access to a private corpus of materials about this scenario via a retrieval tool.
You CANNOT see the materials directly. You must request retrievals to get information.

On EACH turn, output exactly ONE JSON object on its own line, no prose, no code fences:
  - To retrieve information, output: {"action": "retrieve", "query": "<your search query>"}
  - To finalize your answer, output: {"action": "finalize", "response": "<your full final answer>"}

You have a maximum of 5 turns. Plan accordingly.
Each retrieval returns up to 8 most relevant document chunks.
Be focused: a good retrieval query is 5-15 words and targets specific information.

QUESTION:
Based on all materials provided, identify the 3 most critical risks for NorthLane in Q2-Q4 2026 and propose a specific, prioritized action plan for each. Justify why these 3 (and not others) are the most critical, and address how they interact.
```

## STEP 1 — model call

_response_:
```
{"action": "retrieve", "query": "Q1 2026 financial performance ARR churn pipeline risks"}
```

_parsed_: retrieve

## STEP 1 — retrieval (7 results)

_query_: Q1 2026 financial performance ARR churn pipeline risks

_top result preview_:
```
## DOC 5 — Marketing Efficiency Dashboard (CMO, April 10, 2026)

**Q1 funnel metrics:**
- Marketing-sourced pipeline: $1.8M (vs. $2.4M Q1 2025, -25%)
- MQL → SQL conversion: 18% (vs. 24% Q1 2025, -6pp)
- SQL → Won conversion: 22% (vs. 28% Q1 2025, -6pp)
- CAC (blended): $24,500 (vs. $19,800 Q1 2025, +24%)
- LTV (current cohort): $148K (vs. $172K Q1 2025, -14%)
- LTV:CAC ratio: 6.0x (vs. 8.7x Q1 2025) — still healthy but eroding
- Payback period: 14 months (vs. 11 months Q1 2025)

**Channel perfo
```

## STEP 2 — model call

_response_:
```
{"action": "retrieve", "query": "AI roadmap timeline product strategy differentiation plan"}
```

_parsed_: retrieve

## STEP 2 — retrieval (6 results)

_query_: AI roadmap timeline product strategy differentiation plan

_top result preview_:
```
## DOC 6 — Board Feedback Notes (post-March 28, 2026 board meeting)

**Attendees:** 2 VC partners (Sequoia, Bessemer), 2 independent directors, founder/CEO, CFO

**Key themes from board discussion (CFO summary):**

1. **Burn rate concern (Sequoia partner, primary):** "Operating loss doubling YoY with revenue slowing is the single biggest red flag. We need to see a 30%+ reduction in burn by end of Q3 or this becomes a path-to-default conversation. Profitability discipline is non-negotiable."

2. 
```

## STEP 3 — model call

_response_:
```
{"action": "finalize", "response": "# MEMO: Q2–Q4 2026 Critical Risks & Action Plan\n\n**To:** Board of Directors\n**From:** CFO, NorthLane\n**Date:** April 26, 2026\n**Re:** Top 3 Risks for Q2–Q4 2026 and Recommended Actions\n\n---\n\n## Framing\n\nNorthLane enters Q2 with $18.9M cash, 18 months of runway, and three converging pressures: a doubling YoY operating loss, a well-funded competitor (ChainSight, $80M Series C) defining the \"AI-native\" category we sell into, and the first quarter of declining customer health in 8 quarters (NRR 102%, NPS -16pp, logo churn at an all-time high). These are not independent issues — they are a single feedback loop. The three risks below are prioritized because each is both an existential threat *and* an accelerant of the others. Other concerns (marketing CAC inflation, SDR ROI, mobile rewrite, SSO scope) are real but downstream of these three.\n\n---\n\n## Risk 1 — Burn / Runway Compression (Highest Priority)\n\n**Why critical:** Q1 burn was $1.05M (vs. $0.55M Q1'25, +91%); operating loss doubled YoY while new ARR was 65% of plan. Sequoia has explicitly framed Q3 as a path-to-default test and ruled out flat bridge rounds. At current trajectory runway falls below 12 months by Q4, which collapses negotiating leverage on every other decision.\n\n**Action plan (own: CFO; milestone: end of Q2):**\n1. **Restructure to a 30%+ burn reduction by Q3 exit** (board ask). Target ~$0.7M/mo burn run-rate.\n2. **Reallocate, don't just cut.** Kill or pause: Events/sponsorships ($0.35M, 0.9x ROI), 2 of 3 SDR seats (0.6x ROI), the mobile rewrite, and enterprise SSO unless tied to a signed deal. Estimated savings: $2.8–3.4M annualized.\n3. **Redirect ~30% of savings** into the two highest-ROI areas: partner program (5.0x return, currently 1 person) and engineering retention/hiring for AI roadmap.\n4. **Institute monthly burn reviews** with board (already required) plus a tripwire: if Q2 net new ARR < $0.75M, trigger a deeper Q3 RIF plan pre-approved now.\n\n---\n\n## Risk 2 — Competitive Displacement by ChainSight (12–18 Month Window)\n\n**Why critical:** 7 of 9 Q1 losses went to ChainSight; \"AI roadmap credibility\" was the cited reason in 4 of 7. Win rate fell 6pp, sales cycle stretched 23 days, ACV down 8%, and one churned logo (AcmeMfg, $110K) explicitly switched to them. ChainSight's SAP/Ariba partnership and Copilot launch are creating category-defining gravity. Strategy lead's 12–18 month displacement window is consistent with the funnel data.\n\n**Action plan (own: CEO + VP Product; milestone: May 15 moat memo, Q3 ship):**\n1. **Narrow the AI roadmap to one defensible wedge** rather than \"predictive analytics + agent orchestration.\" Recommend: predictive analytics tied to mid-market manufacturer-specific data (our ICP advantage; ChainSight is moving upmarket via SAP). Ship a credible Q3 GA, not a demo.\n2. **Re-position around ICP, not platform parity.** Stop competing on \"AI-native\" generality; own \"the supply-chain visibility platform purpose-built for mid-market manufacturers.\" Refresh website, sales deck, and analyst briefings by end of Q2.\n3. **Double the partner channel** (currently 5.0x ROI, 1 FTE). Add 1–2 partner managers funded from the SDR/events cuts above; pursue 2 ERP/MRP integration partnerships as a counter to ChainSight–SAP.\n4. **Competitive deal SWAT:** named win-back program for the 9 Q1 losses; pricing flexibility approved up to -15% on multi-year deals where ChainSight is finalist.\n\n---\n\n## Risk 3 — Engineering Attrition + Customer Health Doom Loop\n\n**Why critical:** This is the hidden risk the board independent director flagged. Two senior engineers left in Q1; two more are looking. P0/P1 bugs +73%, MTTR nearly doubled, postmortem completion fell from 78% → 31%. Engineering bandwidth was *taken from CS integrations to fund the AI roadmap* — directly producing the implementation-quality complaints that drove ToolsmithIndustrial's churn and put $1.4M ARR of at-risk accounts in play. NRR fell from 118% → 102%. If this loop continues, we lose the AI ship date *and* the installed base that funds it — simultaneously undermining Risks 1 and 2.\n\n**Action plan (own: CEO + VP Eng + CS Director; milestone: stabilize by end of Q2):**\n1. **Retention package for top 6 engineers within 2 weeks:** refreshed equity grants (2-year cliff-extending), targeted comp adjustments to market, and explicit scope relief. Budget: ~$400–600K equity, modest cash. Cheaper than one senior backfill at 87-day time-to-fill.\n2. **Cut engineering scope to two tracks:** AI wedge (Risk 2) and customer integration/quality. Pause mobile rewrite and SSO. This also funds Risk 1.\n3. **Stand up a customer-save program for the $1.4M at-risk ARR:** executive sponsors on the 3 \"considering alternatives\" accounts, usage-recovery plays on the 6 declining accounts, re-engagement on the 11 dormant. Target: hold NRR ≥105% for Q2.\n4. **Re-establish quality bar:** postmortem completion back to >70%, P0/P1 backlog burned down by end of Q2 — these are leading indicators of the next churn cohort.\n\n---\n\n## How These Interact (and Why Sequencing Matters)\n\n- **Risk 3 feeds Risk 2:** without engineering stability we cannot ship the Q3 AI wedge that closes the competitive gap.\n- **Risk 2 feeds Risk 1:** without competitive differentiation, win rates and NRR keep eroding, and burn cuts alone won't extend runway because the numerator (revenue) keeps shrinking.\n- **Risk 1 constrains Risks 2 and 3:** we cannot hire or invest our way out; every dollar must be reallocated, not added.\n\n**The integrated bet:** Cut ~$3M of low-ROI spend (Risk 1), redeploy a portion into engineering retention and partner channel (Risks 2 & 3), and narrow product scope to one defensible AI wedge shipped by Q3. This is the only path that satisfies the board's Q3 go/no-go on both burn *and* competitive positioning.\n\n**Decisions requested from the board:** (1) approval of $400–600K retention equity pool; (2) endorsement of scope cuts (mobile, SSO, events, 2 SDRs); (3) confirmation of Q2 tripwire for deeper RIF if ARR <$0.75M."}
```

_parsed_: finalize

## STEP 3 — finalize

# MEMO: Q2–Q4 2026 Critical Risks & Action Plan

**To:** Board of Directors
**From:** CFO, NorthLane
**Date:** April 26, 2026
**Re:** Top 3 Risks for Q2–Q4 2026 and Recommended Actions

---

## Framing

NorthLane enters Q2 with $18.9M cash, 18 months of runway, and three converging pressures: a doubling YoY operating loss, a well-funded competitor (ChainSight, $80M Series C) defining the "AI-native" category we sell into, and the first quarter of declining customer health in 8 quarters (NRR 102%...

