# Evolution Hypothesis — v2 Scaling Plan

**Status:** DRAFT — not yet executed.
**Parent:** `docs/evolution-hypothesis-report-2026-04-14T09-42-53.md` (v1 result: Arm C = 108.8 % of Arm A).
**Purpose:** Replicate the v1 finding at scale with rigor sufficient to publish externally, ruling out the three known objections: small-n, single-domain, and straw-man baseline.

---

## 1. What v1 proved — and what it didn't

### v1 proved
- On 10 curated **coder** questions judged by 4 independent blind judges, Gemma 4 31B with a Waggle-evolved prompt beat raw Opus 4.6 at a per-judge mean ratio of **108.8 %**.
- The Opus judge itself rated the evolved-Gemma output higher than raw Opus — the opposite of a self-preservation bias.
- The evolved prompt added only **91 tokens** over baseline.

### v1 didn't prove
| Objection | Why it matters | Resolution in v2 |
|---|---|---|
| **Small n (10)** | Insufficient power to rule out variance | Scale to 60 examples (§3) |
| **Single domain** | Gemma may have coder strength that disappears elsewhere | 3 domains — writer/analyst/researcher (§3) |
| **Straw-man baseline** | "Answer clearly" is trivially beatable; evolution may just be "any prompt engineering at all" | 3 baselines graded weak → engineered (§4) |
| **Eval = train set** | GEPA and judges saw the same examples → ~2pp leakage | Hard 50 / 50 train / test split (§5) |
| **Self-bias caveat (Opus)** | Opus is both Arm A model AND a judge | Drop Opus-as-judge; add Haiku + Sonnet (§6) |
| **No CI / significance** | Point estimates can't defend the claim | Bootstrap CI + permutation test (§7) |

---

## 2. Hypothesis — v2 form

**H₁ (primary):** On the held-out test set, across all 3 domains, Gemma 4 31B + Waggle-evolved prompt achieves mean per-judge C / A ratio ≥ 0.95 for at least 2 of 3 baselines.

**H₂ (stronger, secondary):** Same, but ratio ≥ 1.00 for at least 1 baseline (replicates the v1 "small model beats flagship" headline).

**H₃ (falsifiable):** If C / A < 0.90 for 2+ baselines, the v1 result does not generalize; publish a negative-result report.

---

## 3. Eval dataset — 60 examples across 3 domains

Per-domain: 10 train + 10 test = 20 examples. Total: 60.

### 3a. Why writer / analyst / researcher
- Cover the three most-used Waggle personas (insights data) outside coder.
- Represent qualitatively different task shapes: generative text editing, structured reasoning, open-ended synthesis.
- Each admits a gold reference answer, enabling rubric-based judging.

### 3b. Stratified split
- Train (30): seen by GEPA during evolution, used to score candidates.
- Test (30): **never** seen until final A/B/C evaluation. No leak.
- Both strata balanced per-domain (10 each).
- Split seed fixed in source code; reproducible.

### 3c. Example rubric (per item)
- `id` — slug
- `domain` — writer | analyst | researcher
- `input` — question shown to all arms verbatim
- `expected` — reference answer, used by judges
- `task_type` — sub-shape tag (e.g. "tone-rewrite", "pivot-calc", "multi-hop-qa") for optional per-type breakdown

### 3d. Candidate questions — see Appendix A
First-cut bank of 60+ candidate questions pre-drafted in Appendix A. These need review (the next session should pick 60, tweak wording, lock references) before the run.

---

## 4. Baselines — graded weak → engineered

Three baseline prompts. Each gets its own independent GEPA evolution and its own Arm C result.

| ID | Label | Prompt shape | Length | Why |
|---|---|---|---|---|
| B₀ | Minimal | "You are an assistant. Answer the question." | ~10 tokens | Absolute floor — matches v1 baseline style, proves evolution starts with ~nothing |
| B₁ | Typical | Short helper-AI prompt with accuracy + concise + examples-when-helpful clauses | ~50 tokens | What a casual user writes on day one |
| B₂ | Engineered | 150-250 token hand-authored prompt with role, audience, formatting, brevity, failure modes, examples | ~200 tokens | What a thoughtful engineer writes before ever trying evolution — the strongest non-evolution straw man |

If evolution beats B₂, the result is defensible: evolution isn't "just more prompt engineering."

---

## 5. Train / test split — no leakage

- Train set (30 examples): input to GEPA. Fitness = judge score on train examples. This is where the evolved prompt is produced.
- Test set (30 examples): held out. Used once, at the end, to score all arms.
- Validation guard: if any test-set `id` appears in the GEPA trace export, abort the run and fix the split.
- Persist train/test IDs as `docs/.evolution-hypothesis-v2/split.json` alongside the checkpoint dir.

---

## 6. Judge set — reduce self-bias

Drop **Opus-as-judge** (still Arm A) to eliminate the self-bias caveat v1 carried.

| Judge | Role | Temperature | max_tokens |
|---|---|---|---|
| openai/gpt-5.4 | generalist | 0.0 | 2000 |
| google/gemini-2.5-pro | strong-reasoning generalist | 0.0 | 2500 (reasoning-token budget) |
| x-ai/grok-4.20 | independent-lineage generalist | 0.0 | 2000 |
| anthropic/claude-sonnet-4.6 | mid-tier check | 0.0 | 2000 |
| anthropic/claude-haiku-4.5 | cheap-judge consistency check | 0.0 | 1500 |

Rubric unchanged from v1 (correctness 0.5 / procedure 0.3 / conciseness 0.2, length penalty). Per-judge ratios aggregated; judges that parse-fail on >10 % of items get flagged and excluded from the headline metric.

---

## 7. Analysis — rigor upgrade

- **Per-judge ratios**, as v1 — unchanged.
- **Bootstrap 95 % CI** for mean ratio: resample test-set items with replacement 10 000 times, compute ratio each resample, take 2.5 / 97.5 percentiles. Publish with every headline number.
- **Permutation test**: shuffle arm labels within-example, compute p-value for "C > A". Report alongside CI.
- **Per-domain breakdown** — writer / analyst / researcher as separate rows in the results table. Look for domain where evolution fails.
- **Per-baseline breakdown** — B₀ / B₁ / B₂ as separate columns. Look for "evolution doesn't help beyond B₂" case.
- **Parse-failure audit** — count judge calls that returned unparseable output, per-judge. If any judge >10 %, tune `max_tokens` and rerun that judge.

---

## 8. Cost + wall-time estimate

Back-of-envelope, using OpenRouter published prices (2026-04-15 snapshot):

| Phase | Calls | Notes |
|---|---|---|
| GEPA evolution × 3 baselines | ~3 × (30 train × pop=3 × gens=2 × judge-running) = **~540 judge calls** + **~180 Gemma generations** | Running-judge doubles calls — Haiku judge keeps cost low |
| Arm outputs on test set | A (Opus): 30. B × 3 baselines: 90. C × 3: 90. = **210 generations** | — |
| Final judging on test set | 210 outputs × 5 judges = **1 050 judge calls** | Biggest line item |
| **Total** | ~1 590 judge calls + ~390 generations | |

Rough cost estimate (generous): **USD 80-150** depending on reasoning-mode multipliers. Wall time: **3-5 hours** with concurrency = 4 (matches v1 post-parallelism pace). Reserve **6 hours** to absorb retries + judge parse-failures.

Live-run gate: dry run must report plan + cost before any real calls (existing `--dry-run` flag pattern).

---

## 9. Implementation plan

Work is staged in a v2 script so the v1 artifacts stay intact for reference.

| Step | File | Est. LOC | Notes |
|---|---|---|---|
| 1 | `scripts/evolution-hypothesis-v2.mjs` | 600-800 | Fork of v1, parameterized by domain + baseline + split |
| 2 | `scripts/fixtures/eval-v2.json` | — | 60 curated examples, locked ids, train/test flag per item |
| 3 | `scripts/evolution-hypothesis-v2-resume.mjs` | 200 | Port v1's checkpoint-resume pattern |
| 4 | `docs/evolution-hypothesis-v2-split.json` | — | Generated by step 1, committed for reproducibility |
| 5 | `docs/evolution-hypothesis-v2-report.md` | — | Generated by step 1 at run end |
| 6 | Unit tests for the split-guard (assert no train id in test) | `scripts/__tests__/split-guard.test.ts` | 50 | Prevents regression |
| 7 | Blog post + demo video (post-run) | `docs/posts/` + `docs/videos/` | — | Only after positive result |

### Order of execution
1. Review + finalize eval-v2.json (Appendix A → locked set)
2. Implement v2 script + split guard + unit test
3. Dry-run → confirm plan + cost
4. Live run with checkpoints
5. Analyze results, write report
6. Publish blog + video

Each step commits separately; checkpointable across sessions.

---

## 10. Risk + mitigation

| Risk | Likelihood | Mitigation |
|---|---|---|
| Rate limits on Gemma 4 (hit in v1) | High | Exponential backoff ported from v1; 4x concurrency cap |
| Judge parse failures (Gemini hit in v1) | Medium | Higher max_tokens defaults for reasoning-mode models; unit test on judge output shape |
| Cost overrun | Medium | Dry-run gate + live cost monitor; kill-switch at $200 |
| Negative result (H₁ fails) | Unknown | Publish anyway as honest replication; methodology still valuable |
| OpenRouter model IDs drift | Low | Pin model IDs in fixtures; `--auto-model` only with explicit flag |
| Split leak bug | Low | Unit test on the split guard |

---

## 11. Success criteria

- **Methodological:** All analysis items in §7 present in the report. Split guard test passing.
- **Reproducibility:** Full replay from checkpoints; eval + split committed.
- **Result:** H₁ confirmed, partially confirmed, or refuted — all three outcomes shippable.
- **Publishing:** Blog post + README badge with the headline number + CI. Demo video if H₁ holds.

---

## Appendix A — candidate questions (first cut, 20 per domain)

> This is a draft bank; a separate session should prune to exactly 10 train + 10 test per domain, verify reference answers, and lock to `scripts/fixtures/eval-v2.json`.

### Writer (20 candidates)

1. **tone-formal-to-casual:** Rewrite this for a Slack message to a peer: "We regret to inform you that the scheduled maintenance window has been extended by two hours due to unforeseen vendor issues."
2. **tone-casual-to-executive:** Rewrite for a board update: "We kinda hit a snag but we'll probably be fine by EOW."
3. **headline-rewrite:** Turn this paragraph into a 70-char headline: [insert 2-sentence product-launch paragraph].
4. **cut-by-half:** Cut this 120-word paragraph to 60 words without losing key information.
5. **passive-to-active:** Rewrite as active voice: "The decision was made by the committee, and the policy was approved by the CEO."
6. **add-CTA:** Add a one-line call-to-action to this paragraph.
7. **email-subject-line:** Write 3 subject lines for this body copy, one neutral, one urgent, one curiosity-gap.
8. **tighten-jargon:** Rewrite removing jargon: "We leveraged synergies to achieve market-disrupting 10x efficiency gains through our proprietary AI-first methodology."
9. **fix-confusing-pronouns:** Fix ambiguous pronouns in: "When Maria met Sarah, she told her she was going to be promoted."
10. **strengthen-verbs:** Replace weak verbs with strong ones in: "The report shows a decrease in sales and talks about reasons."
11. **rewrite-for-audience:** Rewrite this engineer-facing spec for a marketing audience: [3 sentences of API spec].
12. **fix-the-hook:** This opening line is too soft: "Today we want to talk about something important." Make it arresting in one sentence.
13. **factual-correction:** Rewrite this sentence correcting the factual error: "The human heart has three chambers that pump blood through the body."
14. **list-to-prose:** Convert this bullet list to one flowing paragraph.
15. **prose-to-list:** Convert this prose paragraph into a scannable 5-bullet list.
16. **add-transition:** Add a one-sentence transition between these two paragraphs.
17. **fix-the-ending:** The ending trails off — rewrite this closing sentence to land definitively.
18. **brand-voice-apply:** Rewrite in Waggle's voice (direct, punchy, no corporate hedging): "We believe that our new feature may represent a meaningful step forward for users."
19. **caption-for-chart:** Write a one-sentence caption for a chart showing Q3 revenue up 8 % vs Q3 last year.
20. **executive-summary-from-deck:** Given these 5 slide titles, write a 3-sentence executive summary.

### Analyst (20 candidates)

1. **segment-attribution:** Sales grew 12 % but only segment B grew individually (A flat, C down 4 %). What does this tell you?
2. **spot-the-outlier:** Given these 10 weekly revenue numbers [...list...], identify the outlier and give one likely business reason.
3. **causation-vs-correlation:** Site visits and ice cream sales both spike in July. Does one cause the other? Explain.
4. **ratio-interpretation:** LTV / CAC went from 3.1 to 2.4 over 6 months. What are two plausible causes and what would you look at first?
5. **mix-shift:** Gross margin dropped 200 bps but all product margins are flat. How?
6. **survivorship-bias-spot:** "Users who completed onboarding retain at 85 %" — what's the problem with citing this as a retention strategy?
7. **simpsons-paradox:** Overall conversion went up but dropped within every segment. Explain how and give one real-world example.
8. **denominator-watch:** Active-users metric jumped 40 %. Name 3 ways this could be a measurement artifact.
9. **funnel-diagnosis:** Step 2→3 drop-off is 60 %. What 3 hypotheses would you test first and in what order?
10. **cohort-vs-crosssection:** When would you use cohort analysis instead of a cross-sectional snapshot?
11. **reverse-a-kpi:** "Avg session time up 20 %." When is this bad news, not good?
12. **small-n-warning:** 4 out of 5 surveyed users said they'd pay more. What do you tell the team?
13. **CAC-payback-calc:** CAC = $800, ARPU = $60/mo, retention = 90 % / mo. What's the payback period?
14. **price-elasticity-reading:** A 10 % price cut produced a 5 % volume increase. Was it a good move on revenue? On margin?
15. **margin-vs-volume:** Would you rather launch Variant A (high margin, low volume) or B (low margin, high volume)? What info do you need?
16. **AB-test-interpretation:** p-value = 0.04, lift = 0.8 %, sample = 50 k. Is this worth shipping?
17. **confidence-vs-effect-size:** "Statistically significant" doesn't mean "meaningful." Explain with an example.
18. **retention-curve:** D1 retention 60 %, D7 40 %, D30 20 %. Is this flat, decaying, or stabilizing? What would you measure next?
19. **multi-variable-change:** Three things changed last quarter (price, feature X, Black-Friday timing). Sales up 18 %. How do you attribute?
20. **dashboard-redesign:** A stakeholder dashboard has 32 KPIs. Pick 5 and defend your choice.

### Researcher (20 candidates)

1. **two-source-synthesis:** Summarize in 3 bullets: [Abstract A] + [Abstract B]. Note where they disagree.
2. **identify-load-bearing-claim:** In this argument, which single claim, if false, would collapse the conclusion?
3. **steel-man:** Steel-man the opposing view of: "Open-source models will close the capability gap with frontier labs within 2 years."
4. **find-the-methodology-flaw:** In this study of AI coding productivity, what's the most likely selection-bias flaw?
5. **extract-claims-from-paper:** Given this 2-paragraph abstract, list every falsifiable claim.
6. **provenance-scan:** Given these 5 quotes, which would you trust most for a board deck? Rank and justify briefly.
7. **write-a-hypothesis:** You notice that customers who import data in the first 48 hours retain 2x. Write a testable hypothesis and the experiment to verify.
8. **citation-check:** "It is well-known that 90 % of startups fail." Is this citable? What should the researcher do instead?
9. **compression-to-executive:** Compress this 2-page research report into a 5-line decision memo.
10. **domain-transfer-read:** A finding holds for retail e-commerce. What 3 conditions must be true for it to transfer to B2B SaaS?
11. **definitional-precision:** Given 3 definitions of "active user" from different sources, which is the strongest for investor reporting and why?
12. **scope-check:** A claim is made about "all users" but the dataset only covers paid users. Rewrite the claim to match its evidence.
13. **multi-hop:** If A implies B, B implies C, and we observe C, can we conclude A? Explain.
14. **identify-confound:** "Teams using our tool ship 30 % faster." Give 3 confounds and one way to control for each.
15. **summarize-contradiction:** Two interviews contradict on one point. Write a 2-sentence synthesis acknowledging the contradiction without resolving it.
16. **inference-gap:** Given [survey result], which of the following conclusions is directly supported, and which requires an extra inference step?
17. **weight-evidence:** Rank these 4 evidence types (anecdote / internal-data / peer-review / meta-analysis) for credibility in a GTM decision.
18. **interview-question-design:** Design 3 non-leading interview questions to probe why users churned after 30 days.
19. **literature-map:** Given these 5 paper titles, propose a 3-category taxonomy that groups them meaningfully.
20. **when-to-stop-researching:** At what point do you call a research question "answered enough" and ship? Give 2 criteria.

---

## Appendix B — example engineered baseline (B₂) scratch draft

> Not final — needs iteration with a human prompt engineer before the live run. Target length: 150-250 tokens.

```
You are a senior subject-matter assistant. For each question:
- Lead with the single most important fact or takeaway in one sentence.
- Back it with a short explanation (2-4 sentences) if — and only if — the question is open-ended.
- Use a specific example when a concrete case clarifies the answer better than prose.
- Prefer precise domain vocabulary over approximations; define the term once if it's likely unfamiliar.
- Match the question's register: casual if the asker is casual, formal if formal. Never ceremonious.
- If the question is ambiguous, state the most charitable interpretation and answer that; don't refuse.
- Length: aim for the shortest response that fully answers. Never pad. Never repeat.
```

---

## Appendix C — open questions for Marko

Before running v2, decide:

1. **Publish commitment level:** blog post + README badge, or full research note with methodology?
2. **Judge tier:** keep Sonnet 4.6 in the judge pool or swap for another independent-lineage model?
3. **Cost ceiling:** hard cap at $150 or willing to go $300 for higher-n?
4. **Evolve-per-domain or global?** Open question — current plan evolves one prompt per baseline across all 3 domains. Alternative: 3 prompts per baseline (one per domain). Decision affects cost + result interpretation.
5. **Publish negative result?** If H₁ fails, commit now to publishing the honest result.

Answer these, then implement §9.
