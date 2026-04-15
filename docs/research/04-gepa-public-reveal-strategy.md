# GEPA + ACE Self-Improvement Proof — Public Reveal Strategy

**Author:** Waggle OS research series (4 of 7)
**Drafted:** 2026-04-15 (overnight batch)
**Context:** Waggle's v1 evolution hypothesis produced a 108.8% C/A ratio (Gemma 4 31B + Waggle-evolved prompt vs raw Opus 4.6 on 10 coder questions, 4 blind judges). V2 scales to 60 examples × 3 domains × 3 baselines with a hard train/test split. Q1-Q5 decisions are captured in `docs/hypothesis-v2-decisions.md`; execution runbook in `docs/hypothesis-v2-execution-plan.md`. This document is the **public-communication strategy** for that result — how to reveal it without it getting pattern-matched as hype.

---

## ⚠ Critical corrections from research-agent returns (post-draft)

- **GEPA stands for "Genetic-Pareto"**, not "Goal-driven Evolution of Prompts Algorithm." Paper: Agrawal et al., arXiv:2507.19457, ICLR 2026 Oral. Core algorithm is reflective prompt evolution with Pareto frontier of candidates across objectives, beats RL (GRPO) by +6 % avg / +20 % max with ≤35× fewer rollouts, and beats MIPROv2 by >10 %. Integrated into DSPy 3.0 as `dspy.GEPA` and into MLflow prompt-opt APIs. Repo: github.com/gepa-ai/gepa.
- **"EvolveSchema" by Mikhail" could not be pinned down.** Best candidate as a public analog: **ACE — Agentic Context Engineering** (Zhang et al., Stanford/SambaNova, arXiv:2510.04618). No Mikhail on author list. Recommend dropping the Mikhail attribution in public publication unless the original internal source is located.
- **Gemma 4 31B** was released by Google on April 2, 2026 under Apache 2.0 and currently sits at Arena #3 open model (1452 Elo). Our v1 headline rides a very recent wave rather than fighting against it.
- **Reflection 70B (Matt Shumer, Sept 2024)** is the canonical cautionary tale — any "small beats big" claim is pattern-matched against it. Lesson applied in §5.1 below: publish reproducibility first, headline second.

---

## TL;DR

This is a **high-beta** moment for Waggle. A public "small model beats flagship" claim either compounds into a year of inbound enterprise leads, research credibility, and technical-brand equity — or gets shredded by a hostile HN thread and hurts Waggle's standing for 12 months afterward.

The difference is **almost entirely about credibility signals.** The result itself is defensible (multi-vendor judges, no Opus self-bias, train/test split committed, negative-result publication pre-committed per Q5). The failure mode is sloppy framing, premature victory-lap tone, or skipping the rigor narrative to front-load the "mind-blown" headline.

**Strategy:** ship a full arXiv-style research note *first*, then a Twitter thread + LinkedIn long-form + HN post *second* pointing at the note. The note earns the trust; the short-form captures the virality.

**Non-negotiable:** reproducibility repo live on day one. Split seed, eval dataset, evolved prompt, judge prompts, raw results JSON. The first skeptic who can re-run and see the same numbers does more marketing than any post.

---

## 1. The claim space

### 1.1 What v1 proved

- **On 10 curated coder questions judged by 4 independent blind judges, Gemma 4 31B with a Waggle-evolved prompt beat raw Opus 4.6 at per-judge mean C/A ratio of 108.8%.**
- The Opus judge itself ranked evolved-Gemma above raw-Opus — the opposite of self-preservation bias.
- The evolved prompt added only +91 tokens over baseline.

### 1.2 What v1 didn't prove

Per `docs/evolution-hypothesis-v2-plan.md`:
- n=10 is underpowered
- one-domain (coder) coverage
- weak baselines ("Answer clearly.")
- eval = train (GEPA and judges saw same examples)
- Opus-as-judge caveat (Opus is also Arm A)
- no confidence interval or significance test

### 1.3 What v2 will prove

- n=60 (30 train + 30 test), stratified 3 domains × 2 strata
- Hard train/test split, reproducible seed
- 3 graded baselines: weak prompt / human-engineered prompt / GEPA-evolved prompt
- 4-judge multi-vendor pool (Anthropic Sonnet + Anthropic Haiku + OpenAI GPT-5 + Google Gemini 2.5 Pro) — Opus dropped entirely
- Bootstrap 95% CI + permutation test at α=0.05
- **H₁:** C/A ≥ 0.95 for 2+ of 3 domains
- **H₂:** C/A ≥ 1.00 for 1+ domain (replicates v1 headline)
- **H₃:** C/A < 0.90 for 2+ domains → publish negative (pre-committed per Q5)

This is the right rigor level for a credible publication.

---

## 2. Audiences and what each needs

### 2.1 AI researchers (for trust / credibility)

**What they need to believe it:**
- Methods section written like an arXiv paper (methods / results / limitations / related work)
- Reproducibility repo (dataset, split seed, judge prompts, raw scores)
- Pre-committed negative-result publication
- Named judges (specific model versions + dates)
- Inter-judge agreement statistics

**Channel:** arXiv preprint + Twitter thread by a named author + HN post that links to the preprint *not* to the Waggle product

**Outcome if they nod:** retweets, podcast invites, academic citations in Q3-Q4 2026 follow-ups

### 2.2 Technical buyers — CTOs, VPs of Engineering, AI platform leads (for sales)

**What they need to believe it:**
- The same rigor above, *and* an answer to "can this run on my infrastructure with my data?"
- A cost comparison: inference cost of Gemma 4 31B at $X/Mtok vs Opus 4.6 at $Y/Mtok with the implicit "self-host and you save ~90%"
- A deployment story that matches their constraints (on-prem, private-VPC, etc.)

**Channel:** LinkedIn long-form post by Marko as founder; case-study PDF one-pager; direct outreach to 20-30 named targets with a personalized version

**Outcome if they nod:** KVARK enterprise conversations → EUR 1.2M+ pipeline expansion

### 2.3 Prompt engineers + applied ML engineers (for virality)

**What they need to believe it:**
- Side-by-side output examples (concrete, not abstract)
- The evolved prompt visible in full (they want to copy it)
- A reproducibility-to-the-minute guide
- A clear "this is not magic, here's how" explanation of GEPA + ACE mechanics

**Channel:** Twitter thread with screenshots; explainer blog post; YouTube walkthrough if we're ambitious

**Outcome if they nod:** tens of thousands of impressions, ecosystem amplification, some try Waggle themselves

### 2.4 The skeptic class (to survive)

Every rigorous result gets three kinds of pushback on HN/Twitter:
- **"They cherry-picked the questions"** → rebut with: train/test split, domain stratification, reproducibility repo with exact dataset
- **"The judges are biased"** → rebut with: 4-vendor pool, published judge prompts, inter-judge agreement statistics
- **"It's just prompt engineering, any tech-savvy person could do this"** → rebut with: compare against the human-engineered baseline (which is in the v2 arm list) and show that automated evolution *beats* human-engineered
- **"Won't replicate"** → rebut with: reproducibility repo + one-line docker command to re-run
- **"The 108.8% is within measurement noise"** → rebut with: bootstrap CI + permutation test p-value

Pre-emptively address all five in the methods + limitations section. Don't wait for them to be raised; lead with them.

---

## 3. The research note — structure

Target: ~15 pages, arXiv-style. Saves to `docs/research/evolution-hypothesis-v2-note-<date>.md` in the repo + mirror public URL at `waggle-os.ai/research/v2`.

### 3.1 Abstract (200 words)

> We report on a replication of Waggle OS's v1 evolution result at a 6× larger scale. In our v1 experiment (n=10, coder domain, 4 judges), Gemma 4 31B with a prompt evolved by Waggle's GEPA + ACE loop scored 108.8% of raw Claude Opus 4.6 per blind judge. To test whether this generalizes, we ran a v2 evaluation on 60 examples across 3 domains (writer, analyst, researcher), with a held-out 30-example test set, 3 graded baselines (weak / human-engineered / GEPA-evolved), and a 4-vendor judge pool (Anthropic Sonnet, Anthropic Haiku, OpenAI GPT-5, Google Gemini 2.5 Pro). We report C/A ratio of [RESULT] on the test set, 95% bootstrap CI [LO, HI], permutation test p=[P]. [H₁ / H₂ / H₃ verdict.] Full dataset, split seed, evolved prompts, judge prompts, and raw scores are available at [reproducibility repo URL].

### 3.2 Introduction (1 page)

- The problem: can a general-purpose evolution loop take an open-weight model to flagship quality on a user's task distribution?
- What we built: GEPA + ACE integrated, closed-loop on execution traces
- What we tested: v1 result replication at scale with a much tighter methodology
- Why it matters: local-first AI systems can achieve competitive quality without customer data crossing the training-loop boundary

### 3.3 Methods (3 pages)

- Dataset construction (60 examples × 3 domains × 2 strata, selection criteria)
- Split procedure (fixed seed, domain-balanced)
- Arms (A = raw Opus 4.6, B₁ = weak prompt, B₂ = human-engineered, B₃ = GEPA-evolved; all non-A arms run on Gemma 4 31B)
- GEPA iteration procedure (max 500 iterations or $80, early-abort on plateau)
- Judge pool, letter-to-arm randomization per example to prevent positional bias
- Scoring rubric (1-5 per arm per judge)
- Statistical tests (bootstrap CI, permutation test)

### 3.4 Results (3 pages)

- Primary: mean per-judge C/A ratio, aggregated median across judges
- Secondary: per-domain breakdown, per-arm raw rating distribution
- Inter-judge agreement statistics
- Cost / token-count per arm
- Evolution training curve (score-per-iteration)

### 3.5 Limitations (1 page)

- Sample size still modest (60)
- Domain coverage (3 out of potentially infinite task families)
- Judge model pool (4, all commercial; no open-weight judge)
- English-language only
- Gemma 4 31B specifically; we don't claim generalization to other 30B-class models without additional runs
- Time-bounded snapshot of model versions (Opus 4.6 as of April 2026)

### 3.6 Related work (1 page)

- GEPA original paper (cite; details from overnight research agent)
- EvolveSchema (Mikhail et al., cite)
- DSPy, TextGrad, OPRO, Promptbreeder, APE — positional context
- Orca 2 / Phi-3 / small-model-beats-flagship claims — prior art
- Multi-judge evaluation methodology papers

### 3.7 Conclusion (0.5 page)

- What we learned
- What we'd run next (per-domain evolution, longer context tasks, code generation with execution verification)
- Call to action: reproducibility repo is up, run it yourself

### 3.8 Appendices

- A: Full evolved prompt (B₃)
- B: Human-engineered baseline prompt (B₂)
- C: Judge rubric + prompts verbatim
- D: Example questions per domain (5 per domain sampled)
- E: Full results table (anonymized if needed)

---

## 4. The Twitter thread (12-18 tweets)

### Example draft — tweets 1-5

1. "Can a prompt-evolution loop take an open-weight 31B model past Claude Opus 4.6 on your tasks? We ran the test. (v1 replicated at 6× scale, rigorous methodology, multi-vendor judges, reproducibility repo public.) 🧵"

2. "v1 result: 108.8% C/A on 10 coder questions. 4 blind judges. No self-bias. Nice, but underpowered and single-domain. Critics would rightly call that."

3. "v2: 60 examples × 3 domains (writer/analyst/researcher) × 3 baselines (weak / human-engineered / GEPA-evolved). Train/test split with a fixed seed. 4-judge pool (Sonnet + Haiku + GPT-5 + Gemini 2.5). Opus *dropped* as a judge to kill the self-bias criticism dead."

4. "Result: [insert headline numbers + CI + p-value]. [Verdict on H₁/H₂/H₃.]"

5. "Reproducibility: [repo URL]. One command to re-run. Same seed → same result."

...continuing with domain-specific numbers, the evolved prompt, a side-by-side example, credits, call to action.

### Thread-writing rules

- Every claim has a number or a link
- No "mind-blowing" / "game-changing" / "insane" / any superlative that makes serious people bounce
- Thread author is Marko — personal account of the founder, not a corporate account
- Pin the thread
- Quote-retweet one thoughtful skeptic's objection with a calm response
- Engage with the thread for 48h minimum

---

## 5. The LinkedIn long-form (2000-3000 words)

Written in Marko's voice (see memory: `marko-markovic-style` skill). Executive / product-owner tone. Audience: CTOs, VPs Eng, enterprise buyers.

Outline:

1. **The problem** — "We kept running into the same thing at Egzakta. Our enterprise customers loved Claude Opus's quality, but couldn't use it on sensitive data. Self-hosted open-weight models were a step behind. We wanted to close that gap *without* asking customers to send data to the cloud."

2. **The hypothesis** — "What if prompt evolution — specifically an integrated GEPA + ACE loop — could take Gemma 4 31B running on a customer's infrastructure to the point where it beats raw Opus on the customer's actual tasks?"

3. **The v1 experiment** — tell the story of the 10-question test, the 108.8% result, the surprised-us-too moment

4. **Why we doubted it** — the 6 objections from the v2 plan

5. **The v2 experiment** — methodology, arms, judges, stats

6. **Results** — the numbers, with charts

7. **What this means for enterprise AI** — sovereignty is compatible with flagship quality if you have a working evolution loop. Your data stays inside; the prompts evolve against it. Your open-weight model gets smarter about *your* stack than any closed flagship can be.

8. **KVARK and Waggle** — this runs on your Kubernetes via KVARK; it runs on your laptop via Waggle. Same stack, different deployment.

9. **Call to action** — read the research note, clone the repo, re-run the experiment. If you want this on your stack, [contact/demo link].

---

## 6. The HN post

Title draft: "Show HN: We evolved a 31B model prompt past Claude Opus 4.6 — methodology + reproducibility repo"

Why HN: HN is where a rigorous result either gets celebrated or destroyed. We need HN to celebrate, which requires:
- **Title is honest, not hype-y.** "We evolved" not "BREAKING" not "insane result"
- **First comment is by the author** (Marko), explaining the setup + linking the research note + acknowledging the v1 caveats openly
- **Engage every top-level reply within 30 minutes** for first 4 hours
- **Have named senior ML people read the note pre-publication** — not necessarily endorse, but no surprises (see §8)

---

## 7. Demo assets

Prepare BEFORE the research note drops:

| Asset | Purpose | Format |
|---|---|---|
| Research note PDF | arXiv-style, 15 pages | Markdown → Pandoc → PDF |
| Reproducibility repo | Clone-and-run | `waggle-os/evolution-hypothesis-v2` GitHub repo |
| Side-by-side example | Visceral impact | Screenshot or GIF comparing arm outputs |
| Evolution training curve | "Here's the learning happening" | Line chart, 2D axes (iteration, score) |
| Cost comparison | Business case | Table: arm → $/1k requests at scale |
| Inter-judge agreement heatmap | Rigor signal | Heatmap across 4 judges × 3 arms |
| 60-second explainer video | Social shareable | Loom or OBS screencast |
| Evolved prompt PDF | Download-and-try | 1-page PDF with the evolved prompt verbatim |
| Demo workspace | Try-it-yourself | Pre-seeded Waggle workspace users can import |

---

## 8. Pre-publication warm list

Email 5-10 named people 72 hours before public post. Not for endorsement — for **no surprises**. Give them a heads-up + PDF draft + link to repo. Ask only: "Any methodological issues I should address before this goes out? I want to catch issues privately before critics catch them publicly."

Suggested warm list (refined based on who owns the prompt-evolution narrative):

- **Omar Khattab** (Stanford / DSPy) — the academic center of gravity for this line of work; GEPA was contributed into DSPy 3.0
- **Lakshya Agrawal** — first author on the GEPA paper (arXiv:2507.19457, ICLR 2026 Oral); courtesy brief
- **Krista Opsahl-Ong** — MIPROv2 author; competitor but credible gatekeeper
- **Qizheng Zhang** / **James Zou** (Stanford/SambaNova) — ACE paper authors; relevant to the structural-evolution claim
- **Simon Willison** (simonwillison.net) — kingmaker blog; one post moves the narrative
- **Nathan Lambert** (Interconnects / AI2) — researcher-practitioner, high-credibility amplifier
- **Swyx** (Latent Space) — podcast distribution if they bite
- **Jim Fan** (NVIDIA) — high-reach amplifier for agent-world results
- 1-2 Egzakta-network enterprise AI leaders (not at Anthropic / OpenAI / Google to avoid awkwardness)
- 1 technical journalist who covers AI rigorously (Import AI, The Batch)

Marko to cross-check against his actual network and adjust.

The warm-list response often catches 1-2 non-obvious issues that would otherwise be HN-critique #1. Worth the 72 hours.

---

## 9. Handling criticism and follow-up

### 9.1 Likely objections and ready responses

(All to be drafted into an FAQ or pinned thread replies)

| Objection | Response |
|---|---|
| "Judges are hallucinating their scores" | Inter-judge agreement stats show α = [X]. Human spot-check confirms in appendix D. |
| "Judges are biased toward verbose answers" | B₁ (weak prompt) often produces terse answers; it did *not* win by brevity. Length not correlated with score per judge (see appendix). |
| "Opus 4.6 is getting worse over time / not the current frontier" | We tested in [specific model version, dated]. Anthropic has not announced deprecation. |
| "Gemma 4 31B has seen benchmark contamination" | Eval examples were hand-authored, not drawn from MMLU/HellaSwag/etc. Split seed shows this. |
| "108.8% → 0.5% is all noise" | Bootstrap 95% CI is [LO, HI]; excludes zero / doesn't cross 1.0 for [X of Y] domains. |
| "Why should I trust your evolution loop vs DSPy/TextGrad?" | We don't claim unique novelty in the core algorithm; we claim the *integration* (GEPA + ACE on live user traces) works at product scale. DSPy path comparison is future work. |
| "This only works because you cherry-picked task types" | 3 domains (writer, analyst, researcher) span different reasoning styles; per-domain breakdowns in §3.4 show [XYZ]. |

### 9.2 If H₃ fires (negative result)

Per Q5 commitment: publish anyway. Title adjusts to "Our v2 hypothesis test did not replicate v1 — here's what we learned."

Outline:
- What we hoped
- What we got
- What that tells us about when evolution helps and when it doesn't
- What we'd try next

**This is worth publishing because:**
- Research integrity → trust compounds
- "We tried and it didn't work" is a legitimate contribution
- Pre-committing to publish either way is itself a marketing signal (savvy buyers notice)

### 9.3 If H₁ passes weakly (within noise of 0.95)

Publish with the softer framing. H₂ becomes follow-up work. Set expectations honestly.

### 9.4 If H₂ passes strongly (>1.0 across domains)

This is the jackpot scenario. Execute the full Twitter + LinkedIn + HN triple cycle. Book a podcast circuit.

---

## 10. Timing and cadence

**Target publication window:** within 14 days of Marko approving Q1-Q5 decisions. Per execution plan: ~4 days run + ~3 days write + 2 days external review + 2 days final polish + 2-3 days for warm-list response and surgery = ~14 days.

**Rollout sequence:**

- **T-72h:** warm-list emails go out
- **T-48h:** warm-list feedback incorporated
- **T-24h:** final research note published to repo (but not announced)
- **T-0:** public reveal — Twitter thread + LinkedIn post + HN post all within 2-hour window
- **T+24h:** engage every substantive reply; write FAQ update if patterns emerge
- **T+48h:** reach out to podcast circuit / journalists who engaged
- **T+7d:** retrospective on response, patterns, leads generated

**Avoid:** publishing on Monday (HN dies by Tue) or Friday (dies over weekend). Target Tuesday or Wednesday morning US Pacific time.

---

## 11. Success criteria

- [ ] Research note publishes within 14 days of greenlight
- [ ] Reproducibility repo is live and has ≥1 public third-party reproduction within 14 days of publication
- [ ] Twitter thread ≥100k impressions
- [ ] LinkedIn post ≥20k impressions + ≥5 CTO-level comments
- [ ] HN post reaches front page (top 30)
- [ ] ≥2 inbound enterprise conversations within 30 days citing the note
- [ ] ≥1 podcast invitation
- [ ] Zero successful "methodology-busting" critiques — if there are real issues, we catch them in warm-list surgery first

---

## 12. Waggle's narrative after the reveal

The reveal is not the destination; it's a node in a longer narrative arc:

- **Q2 2026:** v2 reveal → "Waggle can make your open-weight model competitive with flagships."
- **Q3 2026:** case study with a named enterprise pilot deployment → "Here's how Egzakta's customer X did it on-prem."
- **Q4 2026:** follow-up paper or extended note with additional domains / models → "It keeps working at wider scope."
- **Q1 2027:** open-source the evolution stack portions as part of the `hive-mind` OSS push (see report 01) → "Now you can run this yourself."
- **Q2 2027:** reference-customer Anna-Ska-style testimonial + Gartner cover-quote → "Enterprise adoption is real."

Every node reinforces the others. The reveal is the flywheel's first hard push.

---

## 13. Open decisions for Marko

1. **Warm list** — draft it together before sending; I have suggestions in §8 but you have the actual relationships
2. **Author voice** — single-author (you as founder) or dual-byline (you + one researcher)? Single is simpler; dual adds perceived rigor
3. **Repo org** — `waggle-os/evolution-hypothesis-v2` on the existing org, or a research-specific org? I recommend the former unless a research org is planned for other papers
4. **Podcast strategy** — opportunistic or actively pitched? I recommend opportunistic for the first appearance; if there's interest, pitch 2-3 specific shows
5. **Localization** — publish first in English; do we also do Serbian/EU-regional spins for Egzakta's home market? Defer to you; if yes, this doubles the rollout effort

If those five get quick answers, the entire plan is executable end-to-end in 14 days from greenlight.

---

## Closing

This is Waggle's single highest-leverage moment until the next headline. The research is real; the rigor is there; the story is clear. What the reveal needs is **patience** (wait until the rigor is complete, don't front-run with v1-only framing) and **discipline** (publish the research note *first*, then short-form, not the other way around).

Get this right and it accelerates KVARK enterprise pipeline, OSS `hive-mind` launch momentum, and Waggle-product consumer adoption simultaneously. Get it wrong and we spend 12 months rebuilding technical credibility.

The execution plan is in `docs/hypothesis-v2-execution-plan.md`. The decisions are in `docs/hypothesis-v2-decisions.md`. This document is the publication plan.

**Ready to execute on Marko's greenlight.**
