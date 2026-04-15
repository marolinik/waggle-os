# Hypothesis v2 — Executive Decisions on Q1-Q5

**Drafted:** 2026-04-15
**Authority:** Made under Marko's "your call" mandate from this session. Each decision has a rationale you can override.

**Context:** v1 (10 coder questions, 4 blind judges) produced a 108.8% C/A ratio (Gemma 4 + Waggle-evolved prompt vs raw Opus 4.6). v2 scales to 60 examples × 3 domains × 3 baselines with a hard train/test split. The scale plan (`docs/evolution-hypothesis-v2-plan.md`) is complete but execution was blocked on these five decisions.

---

## Q1 — Publish commitment level: blog + badge OR full research note?

### Decision: **FULL RESEARCH NOTE.**

### Rationale

- The v1 number (108.8% C/A) is Waggle's strongest single marketing claim. Shipping it as a casual blog post undersells the rigor we actually applied (4 blind judges, Opus-as-judge caveat addressed, reproducible split seed).
- Enterprise KVARK pitches get much easier with a citable research artifact. "Read our methodology" is a stronger sales signal than "Read our blog."
- A full note forces us to articulate the falsifiability criteria (H₃) clearly — which is itself a trust-building exercise.
- Format: ≤ 15 pages, arXiv-style — abstract, methods, results, limitations, related work. Can live at `docs/research/evolution-hypothesis-v2-<date>.md` in the repo and mirror to a public URL (waggle-os.ai/research/).

### Costs

- +2-3 days of writing after execution completes (abstract, methods, prose results, limitations section)
- Requires one external reviewer pass (proofread + sanity-check the statistics section) — can be a trusted ML peer rather than a formal reviewer

### Downside if we go cheaper (blog + badge)

- The 108.8% number circulates without context; critics will (correctly) ask about n and domain coverage
- Harder to update — a blog post is a point-in-time statement; a research note can have v2.1, v2.2 revisions
- Anthropic, OpenAI, and Google all publish research notes; going blog-only signals we punch below their weight

---

## Q2 — Judge tier: keep Sonnet 4.6 or swap for independent lineage?

### Decision: **MIXED POOL — Sonnet 4.6 + Haiku 4.5 + GPT-5 + Gemini 2.5 Pro.**

### Rationale

- v1 had the Opus-as-judge self-bias caveat (Opus was both the Arm A model and one of the judges). v2 already drops Opus-as-judge per the plan. Keeping Sonnet is fine — Sonnet is not an arm in v2.
- Adding one non-Anthropic judge (GPT-5 or Claude-neutral model like Llama 3.3 405B if budget is tight) kills the "all judges are Anthropic-aligned" objection entirely.
- Two-vendor pool (Anthropic + one competitor) is more defensible than four-vendor — diminishing returns on judge diversity after 3-4 judges.
- Actually adding two non-Anthropic judges (GPT-5 + Gemini 2.5 Pro) triples the defensibility at ~$20 extra cost. Worth it.

### Final judge pool

1. **Sonnet 4.6** — Anthropic, not an arm in v2, medium-cost baseline judge
2. **Haiku 4.5** — Anthropic, not an arm, lower-cost for per-example coverage
3. **GPT-5** (or GPT-4o if 5 not generally available at execution time) — OpenAI lineage
4. **Gemini 2.5 Pro** — Google lineage

Rotation: each of the 30 test examples is judged by all 4, median C/A ratio is the headline. Outlier judges (a single judge whose median diverges from the pack by more than 1.5× IQR) get called out in the limitations section rather than dropped silently.

### Cost impact

- Non-Anthropic API keys need to be pulled from vault — confirm both keys present before kickoff
- Estimated judge-call cost: ~$40 (30 examples × 3 arms × 4 judges × ~$0.01-0.04 per judge call depending on model + prompt length)

---

## Q3 — Cost ceiling: $150 hard OR $300?

### Decision: **$200 HARD CAP.**

### Rationale

- $150 is tight once the 4-judge pool is locked in (Q2 adds ~$20 in non-Anthropic calls). Any re-run cost wipes the buffer.
- $300 invites scope creep — "since we have budget, add a 4th domain" — which would extend timeline and muddy the result.
- $200 gives:
  - ~$80 for GEPA training runs (60 train questions × iterations × ~$0.15 per iteration, or ~500 iterations at ~$0.15)
  - ~$80 for 30 test examples × 3 arms × 4 judges final scoring
  - ~$40 buffer for one full re-run if something breaks mid-execution (~27% contingency is healthy)

### If we blow $200

Stop and write up what we have. The plan has a "publish negative result" commitment (Q5) — a partial-coverage report is legitimate if we hit the cap before completing. Track spend via the existing CostTracker in `packages/agent/src/cost-tracker.ts`.

### What we're explicitly NOT doing at $200

- 4th domain (scope frozen at writer/analyst/researcher)
- 5th judge (judge pool frozen at 4)
- Per-domain-evolved prompts as a second arm (Q4 says global-only)
- Fine-tuning comparison (Gemma evolved-prompt vs Gemma fine-tuned — different experiment)

---

## Q4 — Evolve per-domain OR global prompt?

### Decision: **GLOBAL ONE PROMPT.**

### Rationale

- The v1 headline was specifically "one prompt evolved, applied to one model, beats raw flagship." Per-domain dilutes that to "three prompts, one per domain, each applied to a subset of questions" — which is a weaker claim and harder for a reader to internalize.
- A global prompt that's competitive across writer/analyst/researcher is the stronger demonstration of Waggle's thesis (emergent general capability from evolution, not domain-specific prompt hacking).
- GEPA's training loop is designed for this — the optimizer sees all 30 train examples (10 per domain) and produces one prompt that maximizes joint score.
- Per-domain prompts are the fallback for the limitations section if the global prompt fails on any one domain. The limitation write-up becomes: "global prompt works for 2/3 domains at ratio ≥ 1.0; per-domain needed to recover the 3rd."

### Risk

- If the writer / analyst / researcher tasks pull GEPA in conflicting directions (e.g., "be concise" for analyst tasks, "be thorough" for researcher), the global prompt might degenerate to mediocrity across all three instead of excelling at any.
- Mitigation: if early-iteration global scores stagnate below 0.85 in training, abort global run and pivot to per-domain as a fallback with a note in the final write-up explaining the pivot.

---

## Q5 — Publish negative result if H₁ fails?

### Decision: **YES. COMMIT NOW.**

### Rationale

- Pre-committing to publish negative results is a signal of research integrity. Buyers (enterprise + technical) spot cherry-picking. Committing now de-risks the temptation to tilt methodology toward "H₁ must pass" late in the run.
- Even a negative result becomes content: "We tried to replicate our v1 finding at scale. Here's what we learned about when evolution helps and when it doesn't." That's a genuinely useful artifact that positions Waggle as a mature research-driven product, not just a marketing-driven one.
- The downside scenario (H₁ fails, we have nothing) is strictly worse than (H₁ fails, we publish a candid post-mortem). The former damages trust through silence; the latter builds it through honesty.

### Operational commitments that make this binding

- The publication target date is set BEFORE execution starts. Missing it triggers review regardless of outcome.
- The write-up outline (abstract, methods, results, limitations) is drafted BEFORE results come in — the only thing that changes post-result is the "Results" section prose and the verdict in the abstract.
- Dry-run the first 5 examples end-to-end before full execution — if the plumbing breaks, we catch it before we're $100 deep.

---

## Summary table

| Q | Decision | Cost impact | Timeline impact |
|---|---|---|---|
| Q1 Publish level | Full research note | +$0 execution; +2-3 days writing | +3 days |
| Q2 Judge pool | Sonnet + Haiku + GPT-5 + Gemini 2.5 Pro | +~$40 | +0.5 day (key resolution + smoke-test per judge) |
| Q3 Cost ceiling | $200 hard cap | N/A | N/A |
| Q4 Per-domain vs global | Global one prompt | -0 (same as per-domain plan) | -1 day (one evolution run vs three) |
| Q5 Negative-result commit | Yes, pre-committed | +0 | +0 |

**Net:** ~$200 total spend, ~8 days from kickoff to publication (3 days exec + 3 days writing + 2 days review).

**Execution readiness:** Unblocked. The v2 plan + these decisions cover every live question. `packages/agent/src/evolution-orchestrator.ts` plus the existing harness can drive the run as-is; only the eval dataset needs populating (see v2 plan §3d Appendix A) and the non-Anthropic judge wiring needs a smoke test.

## Override checklist

If Marko disagrees with any decision:

- [ ] Q1: ...
- [ ] Q2: ...
- [ ] Q3: ...
- [ ] Q4: ...
- [ ] Q5: ...

If all five are accepted, move to execution. The execution plan lives in task #20 — a companion doc will stage the run timeline and fallback protocols before spending a dollar.
