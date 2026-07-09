# Forensics: BEAM-1M P2P vs mem0 — the three losing abilities

**Files compared**
- OURS: `beam-1m-FULL700-gpt5-retv2.backup.jsonl` (stable snapshot; 1020 raw rows -> 700 unique after dedupe by first `instance_id` occurrence). Note: the live `retv2.jsonl` was being rewritten by the empty-answer heal job during this analysis; all numbers below are from the backup snapshot.
- THEIRS: `mem0-memory-benchmarks/results/platform/beam_1m_results.json` -> `evaluations` (700 records), `cutoff_results.top_200` (their published 0.641 configuration).

**Scope:** summarization (ours 0.357 vs theirs 0.635), event_ordering (0.416 vs 0.536), multi_session_reasoning (0.565 vs 0.652). 70 questions each.

---

## 1. Question matching

| ability | ours | theirs | exact-text matches | fallback needed | match rate |
|---|---|---|---|---|---|
| summarization | 70 | 70 | 70 | 0 | 100% |
| event_ordering | 70 | 70 | 70 | 0 | 100% |
| multi_session_reasoning | 70 | 70 | 70 | 0 | 100% |

- Conversation-index mapping verified: our `conv = N` corresponds to their `conversation_idx = N-1` on **all 210** matched questions.
- Nugget alignment: **100% identical rubrics** — 451 (summ) + 598 (evord) + 262 (msr) = 1311 nuggets align by exact normalized text, **0 mismatches**. Both runs were judged against the same nugget set (both judges emit {0, 0.5, 1} per nugget).

## 2. The EMPTY-answer bug (excluded from failure-mode analysis)

Our run contains answers that are literally empty strings (reasoning-budget bug; every one scores 0.0). mem0 has zero empty answers.

| ability | empty questions (ours) | they-win nuggets attributable to empties | their mean score on the empty subset |
|---|---|---|---|
| summarization | 29 / 70 (41%) | 149 / 216 (69%) | 0.564 |
| event_ordering | 11 / 70 (16%) | 65 / 185 (35%) | 0.520 |
| multi_session_reasoning | 8 / 70 (11%) | 25 / 69 (36%) | 0.582 |

Everything below excludes those questions to isolate the residual, post-heal gap.

## 3. Per-nugget contingency

All matched questions:

| ability | aligned nuggets | both win | we win / they lose | they win / we lose | both lose |
|---|---|---|---|---|---|
| summarization | 451 | 82 | 35 | **216** | 118 |
| event_ordering | 598 | 124 | 86 | **185** | 203 |
| multi_session_reasoning | 262 | 99 | 29 | **69** | 65 |

Restricted to questions where OUR answer is non-empty:

| ability | aligned nuggets | both win | we win | they win | both lose |
|---|---|---|---|---|---|
| summarization | 248 | 82 | 35 | **67** | 64 |
| event_ordering | 497 | 124 | 86 | **120** | 167 |
| multi_session_reasoning | 227 | 99 | 29 | **44** | 55 |

Paired question-level scores on the same non-empty subsets:

| ability | n (non-empty) | ours | theirs | residual diff | we-win / tie / we-lose (questions) |
|---|---|---|---|---|---|
| summarization | 41 | 0.609 | 0.686 | **-0.077** | 10 / 5 / 26 |
| event_ordering | 59 | 0.494 | 0.539 | **-0.045** | 20 / 8 / 31 |
| multi_session_reasoning | 62 | 0.638 | 0.662 | **-0.024** | 15 / 23 / 24 |

So the headline gaps of -0.278 / -0.120 / -0.087 decompose into an empty-answer component (-0.201 / -0.075 / -0.063) and a residual answer-quality component (-0.077 / -0.045 / -0.024 on the shared non-empty subset).

## 4. Failure modes on THEY-WIN / WE-LOSE nuggets (our answer non-empty)

Heuristic classification (judge-reason regex + nugget-term coverage), validated by manually reading 48 nuggets across four stratified samples. Classifier iterated twice after manual reads exposed misfires (negated-presence phrases, compound-nugget partials).

| failure mode | summarization (N=67) | event_ordering (N=120) | multi_session_reasoning (N=44) |
|---|---|---|---|
| a. CONTENT-MISSING (fact absent -> retrieval/selection miss) | 15 (22.4%) | 57 (47.5%) | 16 (36.4%) |
| b. PARTIAL/VAGUE (topic present, specific detail missing) | 52 (77.6%) | 63 (52.5%) | 21 (47.7%) |
| c. ORDERING (events present, wrong order) | 0 | 0 | — |
| d. WRONGFUL-IDK ("I don't have enough information") | 0 | 0 | 3 (6.8%) |
| e. FORMAT/FRAMING (content present, judge scored 0) | 0 | 0 | 4 (9.1%) |
| f. OTHER | 0 | 0 | 0 |

Notes from manual validation:
- **PARTIAL/VAGUE dominates** because BEAM nuggets are compound ("should contain X **and** Y with detail Z"). We routinely hit the topic but drop one clause: e.g., "resume updates with professional feedback" present, "cover-letter keyword strategies" absent -> 0.5 vs their 1.0. Score-transition composition of they-win nuggets: summ 40/67 are our-0.5 -> their-1.0 upgrades; evord 43/120; msr 15/44. The rest are 0 -> 0.5/1.0.
- **ORDERING is essentially nonexistent as a failure mode.** Only 17 of 1311 nuggets are even phrased about order; 684 are "LLM response should mention/contain X". BEAM "event_ordering" is scored as *coverage of the N listed events*, not sequence correctness.
- **FORMAT/FRAMING (msr):** a real micro-pattern — contradiction-hedging. Our answer surfaces conflicting memories and refuses to commit ("mentions 10 vector-field problems as a possible total but does not clearly assert it"), the judge wants an assertion.
- **WRONGFUL-IDK** is nearly gone once empties are excluded (3 cases, all msr).

## 5. Their winning answers: length and breadth

Per-ability (our stats on non-empty answers; theirs on all 70):

| ability | our words mean/med | their words mean/med | our bullets med | their bullets med | our distinct dates med | their dates med | words/item ours vs theirs |
|---|---|---|---|---|---|---|---|
| summarization | 600 / 588 | **1067 / 1072** | 29 | **48** | 9 | 6 | 19.5 vs 24.3 |
| event_ordering | 162 / 166 | **224 / 224** | 8 | 8 | 6 | 3 | 20.4 vs **28.5** |
| multi_session_reasoning | 245 / 134 | 330 / 136 | 6 | 6 | 2 | 0 | 19.9 vs 21.9 |

Top-10 gap questions per ability (largest their-score minus our-score, non-empty ours):

| ability | our words (mean) | their words | our bullets | their bullets |
|---|---|---|---|---|
| summarization | 572 | **930** | 33.2 | **44.1** |
| event_ordering | 171 | **258** | 9.7 | 9.7 |
| multi_session_reasoning | 172 | **262** | 9.5 | 10.6 |

- **Summarization:** their answers are ~1.8x longer and carry ~1.7x more bullet items. They enumerate whole-conversation topic inventories (family-member-by-family-member preference lists, month-by-month timelines). More enumerated surface = more compound-nugget clauses matched. Their length is not free ambition — corr(their_words, their_score) = **-0.38** on summarization (their longest answers are on the hardest questions) — but on head-to-head questions the breadth wins nuggets.
- **Event ordering:** the questions force the item count ("Mention ONLY and ONLY N items"), and both sides emit exactly N bullets (9.7 vs 9.7 on top-10 gap). The difference is **density per item**: 28.5 vs 20.4 words/item. Their items are compound (event + subtopics + outcome), so a single item can satisfy 2-3 coverage nuggets; ours are terse date+event lines.
- **We actually anchor dates more than they do** (median distinct dates: 9 vs 6, 6 vs 3, 2 vs 0). Dates are not what the nuggets pay for — nuggets pay for content keywords.

## 6. Nuggets per question

| ability | mean | median | min | max | histogram |
|---|---|---|---|---|---|
| summarization | 6.4 | 6 | 3 | 12 | 3:1, 4:7, 5:22, 6:9, 7:9, 8:12, 9:6, 10:2, 11:1, 12:1 |
| event_ordering | 8.5 | 9 | 5 | 12 | 5:4, 6:5, 7:10, 8:14, 9:7, 10:28, 11:1, 12:1 |
| multi_session_reasoning | 3.7 | 4 | 1 | 8 | 1:7, 2:6, 3:17, 4:24, 5:7, 6:4, 7:3, 8:2 |

High nugget counts amplify the per-clause coverage game: with 8-10 coverage nuggets per event_ordering question, every dropped subtopic costs ~0.05-0.12 of question score.

---

## 7. Illustrative examples

### Example 1 — summarization / CONTENT_MISSING  (our nugget 0.0 vs their 1.0; question score 0.20 vs 0.40)

**Q:** Can you give me a summary of how my approach to managing nutrition and fitness has developed over our conversations?

**Nugget:** LLM response should contain: you incorporated tools like MyFitnessPal to log daily intake, monitor progress, and adjust macronutrient goals weekly, integrating this with your workout routine to balance calorie needs

**Our answer:** Here’s how your approach to fitness and nutrition has evolved across our conversations, in chronological order: - 2024-03-03 (Foundations and structure) - Framed your fitness through your clinical-psych lens: intrinsic motivation, SMART goals, habit-building, resilience, and social support. - Booked [...]

**Their answer:** Here’s a concise, chronological summary of how your approach to managing nutrition and fitness has evolved across our conversations, with key dates, names, and metrics you’ve tracked: Early 2024: Baselines, structure, and tracking - You scheduled a health screening for March 15, 2024 and used baseli [...]

**Our judge reason:** The response does not mention using a tool like MyFitnessPal to log daily intake, monitor progress, or make weekly macro adjustments integrated with workouts to balance calorie needs.

**Their judge reason:** The response explicitly mentions using MyFitnessPal for macro tracking with weekly summaries, adjusting macro ratios based on performance, and integrating nutrition with training to support workload and monitor progress, satisfying the criterion.

### Example 2 — summarization / PARTIAL_VAGUE  (our nugget 0.5 vs their 1.0; question score 0.56 vs 0.56)

**Q:** Can you give me a thorough summary of everything we've covered about managing and growing my cryptocurrency investments, including the strategies, tools, risks, and community engagement involved?

**Nugget:** LLM response should contain: Security measures were thoroughly covered, including hardware wallet usage, firmware updates, two-factor authentication, and vigilance against phishing attacks

**Our answer:** Here’s a consolidated summary of everything we’ve covered on managing and growing your crypto investments — strategies, tools, risks, and community engagement — pulled from all prior discussions. Core goals and plans we set - Initial plan and targets - Invest $500 by March 1, 2024, aiming for ~15% R [...]

**Their answer:** Here’s a consolidated summary of what we’ve covered about managing and growing your cryptocurrency investments, organized by strategy, tools, risks, and community engagement, with the key details, dates, and numbers we discussed. Your goals, budget, and review cadence - Targets and ROI: You set a ta [...]

**Our judge reason:** The response covers hardware wallet usage, two-factor authentication, and phishing awareness, but does not explicitly mention firmware updates.

**Their judge reason:** The response explicitly details security measures, including hardware wallet use (Ledger Nano S), firmware/software updates, enabling 2FA, and vigilance against phishing, meeting all specified elements.

### Example 3 — summarization / PARTIAL_VAGUE  (our nugget 0.5 vs their 1.0; question score 0.50 vs 0.44)

**Q:** Can you give me a thorough summary that captures all the important aspects and developments related to my travel planning and experiences, weaving together the budgeting, health precautions, physical activities, cultural learning, and insur [...]

**Nugget:** LLM response should contain: I provided guidance on effective expense categorization, real-time tracking, and budget adjustments based on spending patterns

**Our answer:** Here’s a consolidated, chronological-and-thematic summary of your trip planning and experiences, tying together budgeting, health precautions, physical activity, cultural learning, and insurance decisions. Timeframe and core plan - March 1, 2024: You kicked off planning a budget backpacking trip acr [...]

**Their answer:** Here’s a consolidated, end‑to‑end summary of what you planned, verified, and adjusted across your trip, tying together budget management, health precautions, physical activity, cultural learning, and travel‑insurance decisions, with key dates and specifics you discussed. Big‑picture plan and timelin [...]

**Our judge reason:** It mentions categorized daily spend guidelines and the use of Trail Wallet for ongoing expense tracking, but it does not describe making budget adjustments based on spending patterns.

**Their judge reason:** The response describes expense categorization (e.g., accommodation, transport, insurance), real-time tracking via apps like Trail Wallet and keeping receipts, and budget adjustments by reallocating funds between categories as needed.

### Example 4 — event_ordering / CONTENT_MISSING  (our nugget 0.0 vs their 1.0; question score 0.60 vs 0.60)

**Q:** How did my discussions about population and oscillator models progress in order? Mention ONLY and ONLY five items.

**Nugget:** LLM response should mention: Forced oscillators and resonance

**Our answer:** - 2024-01-10: Introduced core population ODEs — exponential growth, logistic growth, and exponential decay — with solutions, parameters, and interpretations. - 2024-03-20: Advanced to numerical methods (RK4) across population models and linearized the Lotka–Volterra predator–prey system to show osci [...]

**Their answer:** - You first asked about exponential population growth using dP/dt = kP with k = 0.03 and P(0) = 1000, seeking to predict P(10). - You then explored Lotka–Volterra predator–prey oscillations and limit cycles with parameters α = 0.1, β = 0.02, δ = 0.01, γ = 0.3, learning that trajectories form closed  [...]

**Our judge reason:** The response never mentions forced (driven) oscillators or resonance; it only discusses general oscillations and time-varying parameters.

**Their judge reason:** The response explicitly discusses forced oscillators with cosine forcing and focuses on resonance and how forcing frequency affects the solution.

### Example 5 — event_ordering / CONTENT_MISSING  (our nugget 0.0 vs their 1.0; question score 0.25 vs 0.35)

**Q:** Can you reconstruct the sequence in which I brought up different aspects of my recommendation engine development and optimization in order? Mention ONLY and ONLY ten items.

**Nugget:** LLM response should mention: Debugging error messages

**Our answer:** 1. 2024-01-10 — BERT-based relevance ranker with dynamic query updates 2. 2024-01-10 — Improving relevance scoring (pooling strategy, cosine similarity, efficient embeddings) 3. 2024-02-05 — Cache pre-warming of frequently accessed data to speed responses 4. 2024-02-05 — Choosing cosine-similarity t [...]

**Their answer:** 1) You reported an initial collaborative filtering implementation that incorrectly used the dot product of the user‑item matrix with its transpose, producing wrong recommendations. 2) You began implementing an implicit‑feedback approach with over 1,000 interactions and noted performance issues becau [...]

**Our judge reason:** The response does not mention debugging error messages or any equivalent concept.

**Their judge reason:** The response explicitly mentions a specific debugging error message ('TypeError: Cannot read property "length" of undefined').

### Example 6 — event_ordering / PARTIAL_VAGUE  (our nugget 0.5 vs their 1.0; question score 0.25 vs 0.35)

**Q:** Can you reconstruct the sequence in which I brought up different aspects of my recommendation engine development and optimization in order? Mention ONLY and ONLY ten items.

**Nugget:** LLM response should mention: Collaborative filtering implementation and debugging

**Our answer:** 1. 2024-01-10 — BERT-based relevance ranker with dynamic query updates 2. 2024-01-10 — Improving relevance scoring (pooling strategy, cosine similarity, efficient embeddings) 3. 2024-02-05 — Cache pre-warming of frequently accessed data to speed responses 4. 2024-02-05 — Choosing cosine-similarity t [...]

**Their answer:** 1) You reported an initial collaborative filtering implementation that incorrectly used the dot product of the user‑item matrix with its transpose, producing wrong recommendations. 2) You began implementing an implicit‑feedback approach with over 1,000 interactions and noted performance issues becau [...]

**Our judge reason:** The response mentions implementing collaborative filtering but does not mention any debugging related to it.

**Their judge reason:** The response explicitly mentions a collaborative filtering implementation and describes debugging (e.g., a TypeError) related to that implementation, fully satisfying the criterion.

### Example 7 — multi_session_reasoning / CONTENT_MISSING  (our nugget 0.0 vs their 0.5; question score 0.50 vs 0.75)

**Q:** How many different stock symbols have I mentioned wanting to fetch prices for across my sessions?

**Nugget:** LLM response should state: GOOG

**Our answer:** 2 — AAPL and MSFT (you mentioned fetching 1-minute prices for these on 2024-03-01).

**Their answer:** 3 symbols: AAPL, MSFT, and GOOG.

**Our judge reason:** The response does not mention GOOG at all, instead naming AAPL and MSFT, so it fails the positive requirement.

**Their judge reason:** It includes 'GOOG' as required but adds extra symbols and information, so it only partially meets the criterion.

### Example 8 — multi_session_reasoning / PARTIAL_VAGUE  (our nugget 0.5 vs their 1.0; question score 0.62 vs 0.81)

**Q:** Considering Kathleen's artisan stalls, Steve's performance, vendor cancellations, and DJ Mert's payment increase, how should I optimally reallocate my budget and resources to ensure smooth festival operations without overspending?

**Nugget:** LLM response should state: secure additional sponsorships and crowdfunding

**Our answer:** I scanned all your past notes and found some contradictory budget details that affect “optimal reallocation.” Before I lock anything in, please confirm the correct figures: - Total budget: 75,000 TRY (multiple notes, 2024-04-20 to 2024-06-12) vs 100,000 TRY (examples on 2024-06-12/06-12). Which is c [...]

**Their answer:** Here’s a focused, numbers‑backed reallocation and staffing plan that ties together Kathleen’s artisan stalls, Steve’s performance, last‑minute vendor cancellations, and DJ Mert’s fee increase—so operations run smoothly without exceeding your 75,000 TRY festival budget. 1) Cover DJ Mert’s fee increas [...]

**Our judge reason:** The response proposes securing a sponsor top-up (additional sponsorships) but does not mention crowdfunding.

**Their judge reason:** The response explicitly recommends adding revenue via small sponsorships and mentions seeking small sponsorships/crowdfunding where needed, satisfying the criterion.

### Example 9 — multi_session_reasoning / WRONGFUL_IDK  (our nugget 0.0 vs their 0.5; question score 0.00 vs 0.67)

**Q:** How did my evolving collaboration with Alexander influence my volleyball training focus and workshop planning after our championship debrief?

**Nugget:** LLM response should state: Post-championship debrief insights directly shaped future workshops emphasizing mental preparation, stress management, and team dynamics, scheduled to support ongoing athlete development

**Our answer:** I don't have enough information to answer this question.

**Their answer:** After your November 18, 2024 championship debrief with Alexander, your collaboration shaped both your training priorities and your workshop roadmap in concrete ways: Volleyball training focus - You reset your technical emphasis around the weaknesses identified in the debrief—specifically serving acc [...]

**Our judge reason:** The response offers no mention of debrief-driven workshops, mental preparation, stress management, team dynamics, or scheduling for ongoing athlete development.

**Their judge reason:** The response connects the debrief to future workshops with mental preparation and season-timed scheduling for ongoing development, but it does not explicitly emphasize team dynamics and only implies stress management.

### Example 10 — multi_session_reasoning / FORMAT_FRAMING  (our nugget 0.5 vs their 1.0; question score 0.17 vs 0.33)

**Q:** How many problems I completed on partial derivates and vector field in total?

**Nugget:** LLM response should state: 10 problems on vector field

**Our answer:** There’s contradictory info in your memories about vector field problems, and a possible ambiguity about partial-derivative counts. Here’s what I have: - Partial derivatives - 2024-01-10: You solved 4 out of 5 partial-derivative problems. - 2024-01-10: You completed 6 practice problems on partial der [...]

**Their answer:** 15 in total — 5 partial derivative problems and 10 vector field problems.

**Our judge reason:** The response mentions 10 vector field problems as a reported count and as a possible total, but it does not clearly assert that the total is 10.

**Their judge reason:** The response explicitly states there were 10 vector field problems, fully satisfying the criterion.

---

## 8. Bottom line (evidence-backed)

1. **The single biggest driver of all three headline gaps is our empty-answer bug**, not memory quality: 29/11/8 empty answers account for -0.201 / -0.075 / -0.063 of the -0.278 / -0.120 / -0.087 deltas. Their score on those very questions is only ~0.52-0.58, i.e., they are ordinary questions we forfeited.
2. **The residual gap is a breadth/coverage gap, not an ordering, abstention, or judge-strictness gap.** True ORDERING errors: 0. WRONGFUL-IDK: 3. FORMAT/FRAMING: 5. Everything else (208/231 residual they-win nuggets) is content coverage: the fact family is absent (CONTENT-MISSING) or the topic is present minus the specific clause the compound nugget demands (PARTIAL/VAGUE).
3. **mem0's top-200 raw-fact context produces enumerative, clause-dense answers** (summarization: 1067 vs 600 words, 48 vs 29 bullets; event_ordering: 28.5 vs 20.4 words per item at the same forced item count) that mechanically harvest more 0.5->1.0 upgrades on BEAM's compound "should contain X and Y" nuggets.
