# Statistical & Publication Rigor for the Harness-SOTA Benchmark

> External research deliverable. Focus: **EQUIVALENCE testing** for the "small model ≈ premium" claim,
> plus paired/stratified design, multiple-comparison correction, LLM-as-judge validity, pre-registration,
> and power/sample-size. Produced 2026-06-16 for the harness-SOTA recon arc.
>
> **Why this matters:** the core publishable claim ("a small model under the Waggle harness is *statistically
> equivalent* to a premium model") CANNOT be supported by a non-significant difference test (p>0.05). That is
> the single most common — and most fatal — statistical error reviewers will catch. This doc spells out the
> correct test (TOST), how to pre-register the margin, the N you need, and the exact reporting language.

---

## 0. TL;DR — the rigor checklist (one page)

For the equivalence claim ("small ≈ premium within ±δ"):

1. **Use TOST (two one-sided tests)** — NOT a non-significant t-test/z-test. A non-significant difference test
   only fails to reject "no difference"; it never *proves* equivalence. (Lakens 2017/2018)
2. **Pre-register the equivalence margin δ BEFORE seeing data.** Justify it (cost/benefit, anchor, or
   "smallest difference a user would notice/pay for"). Recommended for accuracy-on-a-benchmark: **δ = ±3 to ±5
   percentage points (pp)**. State the justification in the pre-registration.
3. **Decision rule:** reject non-equivalence (i.e. *declare* equivalence) iff the **90% CI** for the
   difference (premium − small) lies **entirely inside [−δ, +δ]**. 90%, not 95%, because TOST is two one-sided
   α=0.05 tests. (Lakens; equivalent to two TOST p-values both < 0.05.)
4. **Pair the design.** Same questions, same judge, same scenarios → analyze paired differences. Pairing
   "for free" removes the positive cross-model covariance from the variance, shrinking the CI substantially.
   (Miller 2024)
5. **Use clustered standard errors / cluster-bootstrap** because questions nest in conversations/documents.
   Naive (unclustered) SEs can be **>3× too small**. (Miller 2024) You already have cluster-bootstrap — keep it.
6. **Correct for multiplicity** across the many model×condition cells: **Holm** for the small confirmatory
   family (FWER control), **Benjamini–Hochberg (BH/FDR)** for the larger exploratory grid.
7. **Judge = jury, not a single LLM.** Use a Panel of LLM judges (PoLL) from **disjoint model families**;
   never let a model judge its own outputs (self-preference bias). Report inter-judge **Fleiss' κ** and
   judge-vs-human **Cohen's κ**. (Verga et al. 2024; Zhang/Wataoka 2024)
8. **Report N (questions AND clusters), the margin, the 90% CI, both TOST p-values, and the verbatim
   conclusion sentence.** Pre-register on OSF/AsPredicted; freeze the analysis script; decontaminate the set.
9. **Sample size:** for a paired equivalence test of accuracy with δ=±5pp at 90% power, plan **N ≈ 200–400
   paired items** if the true gap is ~0; tighten to δ=±3pp pushes you toward **N ≈ 600–1000**. The harness
   *superiority* effect (~5–15pp) is detectable at much smaller N (≈60–150 paired). The equivalence claim is
   the binding constraint — budget for it. (Miller 2024; Chow/Liu; Bowyer et al. 2025)
10. **At small N (< a few hundred) do NOT trust CLT error bars** — they dramatically underestimate
    uncertainty. Use Wilson / Clopper–Pearson / Beta-Bernoulli Bayesian intervals instead. (Bowyer et al.,
    ICML 2025 spotlight)

---

## 1. EQUIVALENCE / NON-INFERIORITY TESTING (the core stat)

### 1.1 The fundamental error this fixes

> "A non-significant result in itself only tells us that we cannot reject the null hypothesis." — Lakens,
> *Improving Your Statistical Inferences*, ch. 9.

p > 0.05 on a difference test is **not** evidence of equivalence. It is consistent with (a) a true zero
difference, (b) a real difference the study was underpowered to detect, or (c) noise. Reviewers will reject
"the models were comparable (p = 0.42)" on sight. The correct framing inverts the hypotheses:

- **H0 (to reject):** the two systems differ by **at least** the margin δ (|μ_A − μ_B| ≥ δ) — "non-equivalence".
- **H1 (to support):** the difference is **smaller** than δ (|μ_A − μ_B| < δ) — "equivalence".

You design the study to **reject the presence of an effect large enough to matter**, and the burden of proof
flips correctly onto the equivalence claim.

### 1.2 TOST — Two One-Sided Tests (Schuirmann 1987; Lakens 2017)

Two one-sided tests against the lower (−δ) and upper (+δ) bounds:

```
t_lower = (Δ − (−δ)) / SE(Δ)      tested H0: Δ ≤ −δ   (one-sided, α=0.05)
t_upper = (Δ − (+δ)) / SE(Δ)      tested H0: Δ ≥ +δ   (one-sided, α=0.05)
```
where Δ = observed difference (e.g. premium% − small%) and SE(Δ) is its (paired, clustered) standard error.

**Decision rule:** declare equivalence iff **BOTH** one-sided tests are significant at α=0.05 (both p < 0.05).
This is an intersection–union test, so **no multiplicity correction is needed for the two sub-tests** (Lakens).

### 1.3 The 90%-CI rule (the reporting-friendly equivalent)

The TOST decision is identical to: **declare equivalence iff the 100·(1−2α)% = 90% CI for Δ lies entirely
within [−δ, +δ].**

- Use **90%**, not 95%, precisely because TOST runs two *one-sided* α=0.05 tests. (Lakens; real-statistics.com)
- Example (Lakens / Wellek): with bounds (−5, 5), a 90% CI of (−4, 2) or (2.9, 4.9) → equivalence; a 90% CI
  of (−6, 1) → cannot declare equivalence (it crosses the lower bound).

This is the cleanest thing to publish: a forest plot of the paired difference with the [−δ, +δ] band drawn,
and the 90% CI inside it.

### 1.4 Choosing and PRE-REGISTERING the margin δ (the SESOI)

This is the most attackable decision. **The margin must be set independent of the data and pre-registered**,
or the whole claim is post-hoc. Lakens lists principled ways to set the smallest effect size of interest
(SESOI); for an agent benchmark the defensible ones are:

- **Cost/benefit / decision-relevance (strongest here):** "δ = the accuracy gap at which a user would switch
  to / pay for the premium model." If a 3pp accuracy gain doesn't change the product decision, δ = 3pp is the
  SESOI. Tie it to the Waggle tier story (premium model = paid; small model = free/local).
- **Anchor-based:** δ = the gap that moves a category up one Landis-Koch / human-meaningful tier.
- **Field convention:** clinical non-inferiority commonly preserves ≥50% of the active-control effect and
  uses a margin smaller than the historical effect M1 (FDA 2016; EMA non-inferiority-margin guideline). The
  agent-benchmark analogue: **δ should be a fraction (e.g. ≤½) of the harness effect you also claim.** If you
  claim the harness adds ~10pp, an equivalence margin of ±5pp on *model swap* is internally consistent and
  defensible; ±3pp is more conservative/impressive but costs N.

**Recommendation:** pre-register **δ = ±5pp as primary, ±3pp as a secondary sensitivity bound**, with the
cost/benefit justification written out. Report both; if equivalence holds at ±3pp, lead with it.

> Pitfall Lakens flags explicitly: setting bounds after seeing the data, or choosing wide bounds to
> "guarantee" equivalence, is the equivalence-testing equivalent of p-hacking. Pre-registration is the defense.

### 1.5 Reporting language (verbatim templates)

- **Equivalence established:** *"Based on a pre-registered TOST equivalence test with bounds of ±5 pp
  (90% CI for the premium−small difference = [−2.1, +3.4] pp, both one-sided p < .01), we reject the presence
  of a difference larger than 5 pp and conclude the small model under the Waggle harness is statistically
  equivalent to the premium model within ±5 pp."*
- **Equivalence NOT established (inconclusive):** *"The 90% CI [−1.0, +6.2] pp extends beyond the +5 pp bound;
  we can neither reject a meaningful difference nor establish equivalence (inconclusive at the registered
  margin)."* Never write "the models are equivalent" off a non-significant difference test.
- **Combine difference + equivalence (the rigorous quadrant, Lakens):** report BOTH the NHST difference test
  and the equivalence test. Four outcomes: (significant diff + equivalent) = "trivially small but non-zero";
  (n.s. diff + equivalent) = "statistically equivalent"; (significant diff + not equivalent) = "meaningfully
  different"; (n.s. diff + not equivalent) = **"inconclusive — underpowered."**

---

## 2. PAIRED / STRATIFIED DESIGN, BOOTSTRAP CIs, MULTIPLICITY

### 2.1 Pair everything (Miller 2024, "Adding Error Bars to Evals", arXiv:2411.00640)

Same questions × same judge × same scenarios for both models → analyze the **paired** difference. The paired
SE is:

```
SE(A−B, paired) = sqrt( SE_A² + SE_B² − 2·SE_A·SE_B·Corr(s_A, s_B) )
```

Equivalently `Var(μ̂_{A−B,paired}) = Var(μ̂_{A−B,unpaired}) − 2·Cov(x_A,x_B)/n`. Because "eval question scores
are likely to be positively correlated, even across unrelated models," the covariance term is positive and
pairing is a **free variance reduction** — a strictly tighter CI for the same N. This directly helps the
equivalence claim (narrower 90% CI is easier to fit inside [−δ,+δ]).

For paired **binary** PASS/FAIL outcomes, **McNemar's test** is the textbook significance test (it conditions
on the discordant pairs — the questions where exactly one model passed). Use **mid-p or asymptotic McNemar**,
not the over-conservative exact-conditional version (Fagerland et al.). McNemar is the *difference* test; TOST
on the paired difference is the *equivalence* test — report both.

### 2.2 Clustered SEs / cluster-bootstrap (you already have this)

Questions nest in conversations/documents/scenarios → independence is violated. Miller's clustered SE adds the
within-cluster cross-covariance:

```
SE_clustered² = SE_CLT² + (1/n²)·Σ_c Σ_{i} Σ_{j≠i} (s_{i,c}−s̄)(s_{j,c}−s̄)
```

Miller reports real cases where clustered SEs are **>3× the naive SE**. **Resample whole clusters
(conversations/scenarios), not individual questions.** Your existing cluster-bootstrap is the right tool —
keep it, and use it to build the **90% CI** for the equivalence test too (bootstrap percentile or BCa). For
the *paired* equivalence test, bootstrap the paired per-cluster difference.

### 2.3 Small-N warning (Bowyer, Aitchison, Ivanova — ICML 2025 spotlight, arXiv:2503.01747)

> "In small-data settings, CLT-based methods perform very poorly, usually dramatically underestimating
> uncertainty (i.e. producing error bars that are too small)."

Below "a few hundred datapoints," **do not use CLT/Wald error bars.** Use:
- **Wilson score interval** (good from ~n=10; far better coverage than Wald near 0/1) — for single-proportion CIs.
- **Clopper–Pearson exact** for very rare/common events (>99% or <1%).
- **Beta-Bernoulli Bayesian** credible intervals (closed-form Beta posterior; library `bayes_evals`) — the
  paper's recommended small-N method.

This is a live tension with Miller (who endorses CLT). **Resolution for publication:** use CLT/clustered SEs
only if N (clusters) is comfortably in the hundreds; otherwise report Wilson or Bayesian intervals and say so.
A skeptical reviewer WILL cite Bowyer if you slap CLT error bars on a 50-question split.

### 2.4 Multiple comparisons across the matrix

The matrix is {models}×{conditions}×{splits}×{metrics} — dozens of tests. Uncorrected, the family-wise false
positive rate explodes.

- **Confirmatory family (the few pre-registered headline claims, e.g. the one equivalence test + the one
  harness-superiority test): use Holm–Bonferroni.** Controls FWER, uniformly more powerful than plain
  Bonferroni, valid under arbitrary dependence.
- **Exploratory grid (all the secondary cells you report for completeness): use Benjamini–Hochberg (FDR).**
  Far more power when there are many tests; controls the expected proportion of false discoveries.
- **State the split in the pre-registration** ("these 2 tests are confirmatory; the rest are exploratory").
  Mixing them post-hoc is a red flag. Note: equivalence-test sub-tests (the two TOST one-sided tests) are NOT
  corrected among themselves (intersection-union), but EACH equivalence claim counts as one test in the family.

---

## 3. LLM-AS-JUDGE VALIDITY

### 3.1 Jury, not a single judge — PoLL (Verga et al., Cohere, 2024, arXiv:2404.18796)

- **Method:** a Panel of LLM evaluators (PoLL) of three smaller models from **disjoint families** —
  **Command R, GPT-3.5, and Haiku** — aggregated by **max-voting (binary) / average-pooling (graded)**.
- **Finding:** a panel of smaller models **outperforms a single large judge (GPT-4)**, "exhibits less
  intra-model bias due to its composition of disjoint model families," and is **"over seven times less
  expensive."** Across **three judge settings and six datasets**.
- **Agreement numbers (Cohen's κ vs human, KILT NQ):** PoLL **0.763** > Haiku 0.749 > Command R 0.734 >
  GPT-3.5 0.726 > **GPT-4 0.627**. The jury beats every individual member *and* the big single judge.

**Your roster already aligns** (M6: Opus 4.7 / GPT-5.4 / Gemini 2.5 Pro / Haiku 4.5 — disjoint families,
trio-strict). That is exactly the PoLL principle. Keep "trio-strict" (unanimous-pass) as the conservative
headline, and also report majority-vote as a sensitivity.

### 3.2 Self-preference bias — the contamination killer

- **Wataoka et al. 2024 (arXiv:2410.21819):** "GPT-4 exhibits a significant degree of self-preference bias";
  the root cause is **perplexity** — "LLMs assign significantly higher evaluations to outputs with lower
  perplexity than human evaluators, regardless of whether the outputs were self-generated." Implication: a
  judge favors text that *looks like its own*, even on others' outputs.
- **Hard rule for the benchmark:** a model must **never judge its own (or same-family) outputs.** If Sonnet
  drives the agent, Sonnet/Claude must not be the (sole) judge of that run. This is the Tier-1 blocker already
  flagged in `HARNESS-BENCHMARK-PLAN-2026-05-22.md` (§"Judge contamination"). A diverse PoLL with the agent's
  own family **excluded or outvoted** is the mitigation.

### 3.3 Position & verbosity bias (Justice-or-Prejudice; Judging-the-Judges, 2024–26)

- **Position bias:** judges favor a fixed slot (A vs B). **Mitigation: swap positions and average over both
  orderings.** Mandatory for any pairwise judging.
- **Verbosity bias:** judges favor longer answers. **Mitigation: length-controlled win rates** (post-hoc) or
  hold answer length roughly constant. Relevant because harness differences can change answer length.
- For the GAIA-2 setup these are reduced (pointwise PASS/FAIL against gold, not pairwise A/B), but if any
  pairwise/graded judging is used, apply order-swapping + length control.

### 3.4 Inter-rater reliability — report it (Landis & Koch 1977)

- **Between judges (≥3 raters): Fleiss' κ.** **Judge-vs-human (2 raters): Cohen's κ.**
- **Landis-Koch bands:** <0 poor; 0.00–0.20 slight; 0.21–0.40 fair; 0.41–0.60 moderate; 0.61–0.80
  substantial; 0.81–1.00 almost perfect. **Aim for κ ≥ 0.61 ("substantial")** between the jury and a human
  spot-check sample; report it. (Caveat: these bands are conventional, not laws — state which scale you use.)
- **Validate the jury against humans on a held-out sample** (e.g. 50–100 items dual-coded) and report
  judge↔human κ. Without a human anchor, "the jury agrees with itself" is circular.

---

## 4. PRE-REGISTRATION & REPRODUCIBILITY (what reviewers expect)

1. **Pre-register on OSF or AsPredicted BEFORE running the priced matrix.** Lock: hypotheses (incl. the
   equivalence margin δ and which tests are confirmatory vs exploratory), the dataset/split list and N, the
   judge roster + aggregation rule, the SE method (clustered/bootstrap), the multiplicity correction, and the
   exact analysis script (commit hash). This is the single biggest credibility lever and it's nearly free.
   The repo already practices this (`HERMES-40-PREREG-2026-05-19.md`, `LPV2-PREREG-2026-05-19.md`,
   `LIVE-PREMIUM-VALIDATION-PREREG`) — extend that habit to the equivalence claim with the margin written down.
2. **Decontamination.** Document that the eval items are not in any model's training data (or use a private/
   held-out split). Data leakage "is considered by many experts as one of the biggest problems in machine
   learning and a primary culprit for irreproducibility." State the decontamination check in the pre-reg.
3. **Reproducibility artifacts (NeurIPS/ICML checklist norms):** release seeds, prompts, judge configs, raw
   `events.jsonl`, the offline re-judge harness, and aggregation code. Report **N questions AND N clusters**
   per cell. Hermetic re-run should reproduce aggregates within CI.
4. **Report negative/inconclusive results honestly.** If equivalence is inconclusive at ±3pp but holds at
   ±5pp, say exactly that. (Matches the repo's "never hide failures" handoff discipline.)
5. **Kill apples-to-oranges baselines.** Every number from the same matrix/judge/denominator (the plan
   already flags dropping the Mem0 cross-paper baseline). Cross-paper numbers invite instant dismissal.

---

## 5. POWER / SAMPLE SIZE (the recommended N, justified)

Two distinct power questions — the **equivalence** test is the binding one.

### 5.1 Harness *superiority* (expected effect ~5–15pp) — the easy one

Detecting a 5–15pp difference between two paired conditions at 80–90% power needs relatively little data. From
Miller's planning formula `n = (z_{α/2}+z_β)²·(ω² + σ²_A/K_A + σ²_B/K_B)/δ²` and standard paired-proportion
power, an expected **10pp** harness lift is detectable at **N ≈ 60–120 paired items** (and pairing + clustering
shifts this); a conservative **5pp** lift wants **N ≈ 250–400** paired. So the superiority claim is cheap.

### 5.2 Equivalence ("small ≈ premium within ±δ") — the binding constraint

Equivalence power depends on (a) the margin δ, (b) the *assumed true* gap (must be < δ; closer to δ ⇒ much
larger N), and (c) the SE (paired+clustered helps). Anchors:

- **Lakens (standardized, true effect 0, ±0.5 SD bounds, 90% power): n = 88/group.** Narrower bounds or a
  non-zero assumed effect inflate this (n = 109 when assumed δ_true = 0.1).
- **Two-proportion TOST (PASS/FAIL), margin = 5pp, 80% power, baseline ~0.85, assumed true gap ≈ 0:**
  published worked examples land around **n ≈ 100–200 per arm** (PASS, NCSS; n=98–196 examples). With a
  **paired** design (positive cross-model correlation, which is typical), the *effective* required N is
  meaningfully smaller for the same power.

**Concrete recommendation for this benchmark:**

| Goal | Margin δ | Assumed true gap | Design | Recommended N (paired items / clusters) |
|---|---|---|---|---|
| Detect harness lift (superiority) | n/a (effect ~5–15pp) | — | paired, clustered | **~60–150** |
| Equivalence, primary | **±5 pp** | ~0–2 pp | paired, clustered, 90% power | **~200–400** |
| Equivalence, conservative | **±3 pp** | ~0–1 pp | paired, clustered, 90% power | **~600–1000** |

- **Plan the matrix at the equivalence N, not the superiority N.** Miller's own rule of thumb: "new evals
  should contain at least 1,000 questions in order to have good signaling ability" — that comfortably covers
  even the ±3pp equivalence claim and clears the Bowyer small-N CLT trap.
- **If budget caps N below a few hundred per cell:** (a) use Wilson/Bayesian intervals (not CLT), (b) lead
  with δ=±5pp, (c) pool across splits where pre-registered to gain N, and (d) exploit pairing aggressively.
- **Verify with software, don't hand-wave:** run the final number through TOSTER (R), PASS, `statsmodels`
  `tt_ind_solve_power`/proportion power, or `bayes_evals`, and put the power curve in the appendix. The
  numbers above are planning anchors from the literature, not a substitute for the registered calculation.

---

## 6. KEY REFERENCES (citable)

- **Lakens, D. (2017).** Equivalence Tests: A Practical Primer for t-Tests, Correlations, and Meta-Analyses.
  *Soc. Psych. & Personality Sci.* https://journals.sagepub.com/doi/full/10.1177/1948550617697177
- **Lakens, Scheel, Isager (2018).** Equivalence Testing for Psychological Research: A Tutorial. *AMPPS.*
  https://journals.sagepub.com/doi/10.1177/2515245918770963
- **Lakens — Improving Your Statistical Inferences, ch. 9 (open):**
  https://lakens.github.io/statistical_inferences/09-equivalencetest.html  (TOST procedure, 90%-CI rule,
  SESOI justification, power n=88, "p>.05 ≠ equivalence")
- **Schuirmann (1987)** — original TOST (via NCSS/SigmaXL secondary sources below).
- **Miller, E. (2024).** Adding Error Bars to Evals: A Statistical Approach to LM Evaluations.
  arXiv:2411.00640. https://arxiv.org/abs/2411.00640 (paired diff SE, clustered SE >3×, power formula,
  "≥1,000 questions")
- **Bowyer, Aitchison, Ivanova (2025, ICML spotlight).** Position: Don't Use the CLT in LLM Evals With Fewer
  Than a Few Hundred Datapoints. arXiv:2503.01747. https://arxiv.org/abs/2503.01747 (Bayesian/Wilson at small N)
- **Verga et al. (2024, Cohere).** Replacing Judges with Juries (PoLL). arXiv:2404.18796.
  https://arxiv.org/abs/2404.18796 (panel Command R/GPT-3.5/Haiku; κ 0.763 vs GPT-4 0.627; >7× cheaper)
- **Wataoka et al. (2024).** Self-Preference Bias in LLM-as-a-Judge. arXiv:2410.21819.
  https://arxiv.org/abs/2410.21819 (perplexity-driven self-preference; GPT-4 significant self-bias)
- **Justice or Prejudice? Quantifying Biases in LLM-as-a-Judge (2024).** arXiv:2410.02736 (position/verbosity).
- **Judging the Judges: Systematic Eval of Bias-Mitigation Strategies (2026).** arXiv:2604.23178
  (position-swap + averaging; length-controlled win rates).
- **Landis & Koch (1977)** κ bands — via NCBI table: https://www.ncbi.nlm.nih.gov/books/NBK92295/table/methods.t2/
- **Fleiss' κ (3+ raters):** https://en.wikipedia.org/wiki/Fleiss%27s_kappa
- **FDA (2016) Non-Inferiority Clinical Trials guidance** (margin must be pre-specified, preserve ≥50% effect);
  **EMA Guideline on the choice of the non-inferiority margin:**
  https://www.ema.europa.eu/en/documents/scientific-guideline/guideline-choice-non-inferiority-margin_en.pdf
- **Holm vs Bonferroni vs BH:** https://www.statsig.com/blog/controlling-type-i-errors-bonferroni-benjamini-hochberg ;
  R `p.adjust`: https://stat.ethz.ch/R-manual/R-devel/library/stats/html/p.adjust.html
- **McNemar (mid-p > exact) for paired binary:** Fagerland et al., PMC3716987
  https://www.ncbi.nlm.nih.gov/pmc/articles/PMC3716987/ ; ML usage: Raschka arXiv:1811.12808.
- **Wilson vs Clopper–Pearson vs Wald:** https://www.statskingdom.com/doc_confidence_interval.html
- **TOST exact power/sample size for proportions:** PLOS One, PMC5012670
  https://pmc.ncbi.nlm.nih.gov/articles/PMC5012670/ ; NCSS Equivalence Tests for Difference of Two Proportions.
- **Tools:** TOSTER (R), `bayes_evals` (https://github.com/sambowyer/bayes_evals), statsmodels power,
  PASS/SigmaXL.

---

## 7. RISKS / GAPS A SKEPTICAL REVIEWER WILL ATTACK

1. **"You proved equivalence with a non-significant difference test."** → Mitigated only by actually running
   TOST + pre-registering δ. This is the #1 failure mode for the "small ≈ premium" claim.
2. **Margin shopping.** If δ isn't pre-registered, any equivalence claim is post-hoc. Must lock δ on OSF first.
3. **Self-judging contamination.** If the agent's model family appears in the judge jury, the result is
   dismissible. Exclude/outvote it. (Already a flagged Tier-1 blocker.)
4. **CLT error bars at small N.** Putting normal-approx CIs on a 50–160-item split contradicts Bowyer 2025 —
   use Wilson/Bayesian and clustered/bootstrap there.
5. **Pseudoreplication.** Treating clustered questions as independent inflates significance; resample clusters.
6. **Underpowered "equivalence."** Declaring equivalence with too-wide a 90% CI that merely *happens* to sit
   inside [−δ,δ] at tiny N is weak; the power calc must show the CI is *expected* to be tight enough.
7. **Exact PoLL κ-per-dataset and the full self-preference magnitude** could only be read from the abstracts /
   secondary reviews (the arXiv PDFs returned binary to the fetch tool); the KILT-NQ κ values (PoLL 0.763 vs
   GPT-4 0.627) and the "7× cheaper" figure are from the abstract + a secondary review, not a line-verified
   read of the PDF body. Confirm against the PDF before quoting in a paper.
8. **Equivalence-test Type-I-error subtleties for proportions:** the asymptotic TOST for two proportions can
   be conservative/anti-conservative at small N (PLOS One PMC5012670). For the final claim, prefer the exact
   TOST / Newcombe-Wilson-based CI and verify coverage by simulation rather than trusting the normal approx.
