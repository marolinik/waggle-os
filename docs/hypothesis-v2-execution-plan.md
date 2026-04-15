# Hypothesis v2 — Execution Plan

**Drafted:** 2026-04-15
**Depends on:** `docs/evolution-hypothesis-v2-plan.md` (design), `docs/hypothesis-v2-decisions.md` (Q1-Q5 decisions).

**Status:** READY TO RUN. All gating questions resolved. This doc is the operational runbook.

---

## Pre-flight checklist (~30 min, zero spend)

Before the first paid token:

- [ ] **Vault keys present:**
  - [ ] `ANTHROPIC_API_KEY` (Sonnet + Haiku judges)
  - [ ] `OPENAI_API_KEY` (GPT-5 judge)
  - [ ] `GOOGLE_API_KEY` (Gemini 2.5 Pro judge)
  - [ ] Gemma 4 31B endpoint (LiteLLM config or self-host)
- [ ] **Smoke-test each judge** with one fake example (< $0.01 total) — verifies keys resolve through the existing CostTracker + LLM wiring
- [ ] **Eval dataset populated:** 60 examples per v2 plan §3d Appendix A. Split seed committed. Train 30 / Test 30, 10 per domain per stratum.
- [ ] **CostTracker baseline:** note the current total-spend for this session so we can compute v2-only cost at the end
- [ ] **Budget alarm wired:** set a hard stop in the orchestrator at $200 cumulative. Abort mid-run rather than silently overspend.
- [ ] **Write-up skeleton:** abstract + methods + results (empty) + limitations outline drafted BEFORE results come in. Templates at `docs/research/v2-writeup-skeleton.md` (create in step A below).

## Step A — Write-up skeleton (pre-result, ~2 hours)

Draft sections that don't depend on results:

- **Abstract placeholder** — insert-the-number template ("On a 30-example held-out test set across 3 domains, Gemma 4 31B with a Waggle-evolved global prompt achieved a mean per-judge C/A ratio of [X.X%] against raw Opus 4.6.")
- **Methods** — full description, citation of v1, description of the 60-example dataset, train/test split rationale, judge pool, baseline progression (weak → engineered), statistical tests (bootstrap 95% CI + permutation test at α=0.05)
- **Limitations** — framework in place for both outcomes:
  - If H₁ passes: "per-domain breakdown," "judge-disagreement analysis," "generalization caveats"
  - If H₁ fails: "what broke," "what we learned," "what we'd try next"
- **Related work** — GEPA paper, EvolveSchema paper (Mikhail's 2026), comparison to Dust.tt / mem0 / Letta
- **Reproducibility** — split seed, GEPA config, judge prompts verbatim, dataset repo URL

Prose review by one external reader before kickoff. Goal: minimize post-hoc result-tilting.

## Step B — Training run (GEPA global prompt, ~2-4 hours, ~$80)

Execute `packages/agent/src/evolution-orchestrator.ts` with:

- **Train set:** 30 examples (10 writer + 10 analyst + 10 researcher)
- **Target model:** Gemma 4 31B
- **Baseline arms (for training signal only):**
  - Arm A: raw Opus 4.6 (flagship reference)
  - Arm B₁: Gemma + weak prompt ("Answer the question.")
  - Arm B₂: Gemma + engineered prompt (hand-crafted, task-aware ~100-token prompt written by a human)
  - Arm B₃: Gemma + iterative-GEPA-engineered prompt (the one we're producing)
- **Iteration cap:** 500 total iterations OR $80 spend, whichever fires first
- **Early-abort trigger:** if mean training-set score plateaus below 0.85 for 50 consecutive iterations → global prompt is not converging, switch fallback (Step B') per Q4 decision

### Output

- Final evolved prompt (Arm C = Gemma + evolved-prompt) — checkpointed to `~/.waggle/evolution/<run-id>/final-prompt.md`
- Training curve artifacts (score per iteration, cost per iteration)
- Prompt length delta from baseline (v1 was +91 tokens — track if this grows)

## Step B' — Fallback: per-domain prompts (only if global plateaus)

If Step B aborts early per the plateau trigger:

- Three independent GEPA runs, one per domain, each with its own 10 train examples
- Cost cap: $20 per domain ($60 total, keeps us under the $200 ceiling)
- Limitations-section pivot: "Global evolution did not converge on our 30-example train set; per-domain prompts recovered the signal. This is consistent with the hypothesis that evolution is task-family-specific, not task-universal."

## Step C — Test-set evaluation (~2-3 hours, ~$80)

For each of the 30 test examples × 3 arms × 4 judges = 360 judge calls:

- **Arm A:** raw Opus 4.6 answer
- **Arm B:** best baseline (engineered prompt — Arm B₂ from training)
- **Arm C:** Gemma + evolved prompt (from Step B output)

Each judge receives: the test input, the reference expected answer, and the three arm outputs (labeled A/B/C but with randomized letter-to-arm assignment per example to prevent positional bias). Judge returns a 1-5 rating per arm.

### Statistical analysis

- **Primary metric:** mean per-judge C/A ratio, aggregated as median across judges
- **Secondary metric:** per-arm mean rating (raw 1-5)
- **Tests:**
  - 10 000-iteration bootstrap 95 % CI on the C/A ratio
  - Permutation test (H₀: C and A drawn from the same distribution) at α=0.05

## Step D — Verdict + write-up (~3 days)

- **Verdict logic:**
  - C/A ≥ 1.00 across all 3 domains → H₂ confirmed (replicates v1 headline at scale) → publish positive
  - C/A ≥ 0.95 for ≥ 2 of 3 domains → H₁ confirmed → publish positive with limitations
  - C/A < 0.90 for ≥ 2 domains → H₃ (negative result) → publish negative per Q5 commitment
  - Anything in between → nuanced conclusion, published honestly
- Fill in the pre-drafted skeleton with the Results section numbers
- External reviewer pass (same person who reviewed skeleton)
- Publish to `docs/research/evolution-hypothesis-v2-<iso-date>.md` + mirror to public URL

## Total timeline + spend

| Stage | Time | Spend |
|---|---|---|
| Pre-flight + smoke tests | 30 min | < $1 |
| Write-up skeleton | 2 hr | $0 |
| Step B — GEPA training | 2-4 hr | ~$80 |
| Step C — Test evaluation | 2-3 hr | ~$80 |
| Contingency re-run budget | — | ~$40 |
| Write-up Results + review | 3 days | $0 |
| **Total** | **~4 days wall** | **~$200** |

## Abort triggers (no more sunk-cost-ing)

Stop and write a candid partial report if:

- Any judge key fails to resolve and we can't get a replacement within 4 hours → execute with 3-judge pool + caveat
- GEPA training spends $80 without hitting 0.85 training score → Step B' fallback, OR abort if Step B' also fails
- Test-set evaluation finds C/A < 0.80 on the first 10 examples → stop, don't burn the rest of the $80 on a known-negative result
- Cumulative spend hits $200 at any point → hard stop, write up partial

## Kickoff signal

When Marko gives the green light on the Q1-Q5 decisions (or amends them), the order is:

1. Run pre-flight checklist. Stop if anything is missing.
2. Draft the write-up skeleton end-to-end. Commit BEFORE any paid run.
3. Smoke-test all 4 judges with a throwaway example. Confirm cost < $1.
4. Start Step B — GEPA training. Watch the early iterations live for 10 minutes to confirm the loop is healthy; then let it run.
5. Step C as soon as B produces a final prompt.
6. Step D in parallel with any post-hoc sanity checks.

This plan is self-contained — a future session can pick it up without reloading the full context.
