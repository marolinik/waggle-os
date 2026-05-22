# Benchmark Landscape Research — "What most strongly shows Waggle capability?"

**Date:** 2026-05-22 · research before committing to GAIA 2 full
**Question (Marko):** before we fly into GAIA 2 full, what benchmark would be *even stronger* for showing Waggle's capability?

## The reframe that matters

There are **two different capability stories**, and the strongest benchmark is different for each. GAIA 2 may be the **weaker choice on both**.

| Story | What it proves | Where Waggle stands | Strongest benchmark |
|---|---|---|---|
| **A — Sovereign knowledge-work harness** (Reading B) | "Run real knowledge work locally, audited, zero egress" | Waggle = the arena; it runs off-the-shelf harnesses → can claim *parity + sovereignty*, not superiority | **TheAgentCompany** ≫ GAIA 2 |
| **B — The memory moat** (Waggle's actual differentiation) | "Remembers across sessions better than frontier long-context" | Waggle's hive-mind substrate can **WIN**, not just match | **BEAM** (cutting-edge) or **LongMemEval** (established) ≫ LoCoMo |

**Key strategic insight:** GAIA 2 (and any agentic benchmark) measures the *harness*, where Waggle uses other people's loops and can only claim "runs them safely." The **one place Waggle can claim a genuine WIN is memory** — because a structured memory substrate provably beats raw long-context. That is a far stronger hero claim than "our harness scored X% on GAIA 2."

---

## Candidate benchmarks (2026 state)

### Story A — agentic / knowledge-work

**TheAgentCompany (TAC)** — NeurIPS 2025, the strongest fit for Waggle's *audience + sovereignty*:
- **175 tasks** = literal knowledge work: SWE (69), HR (29), PM (28), Admin (15), Data Science (14), Finance (12).
- **Natively self-hosted Docker**: GitLab + OwnCloud + Plane + RocketChat. Only external dep = the LLM. → the **zero-egress / sovereign story is inherent**, not bolted on (huge vs GAIA 2).
- **Grading: 71% deterministic** checkpoint (Python state checks), only **29% LLM-judge** → far less judge-contamination than GAIA 2 *search* (which we just found is ~100% LLM-judged).
- **SOTA only ~30%** (Gemini 2.5 Pro 30.3% full / 39.3% partial) → hard, big headroom to differentiate.
- **Cost: ~$4.20/task × 175 ≈ $735 per harness** full run; ~27 LLM calls/task. Expensive at scale → probe a subset first.
- **Catch:** OpenHands-centric (CodeAct + Browsing); other harnesses integrate via standard bash/jupyter/browser interfaces but it's a real adapter effort per harness.

**GAIA 2** (in progress, Hermes cell done 83.8%): dynamic/async environment, but — search split is ~100% LLM-judged (contamination risk we're mitigating in Phase 1), and it's *generic* agent capability, not knowledge-work-shaped. **Weaker audience-fit + weaker grading rigor than TAC.**

**GDPval** (OpenAI): 1,320 real economically-valuable tasks (legal briefs, engineering, nursing, support) by 14yr+ professionals. **Hero-page gold** ("Waggle does work people get paid for") but **expert-graded → hard to self-run.** Aspirational, not near-term.

**tau2-bench** (Sierra): tool-agent-user enterprise domains (retail/airline/+voice/+knowledge-retrieval), 38 models. Strong, narrower (customer-service shaped).

### Story B — memory (the moat)

**BEAM** (2026, ICLR) — **most discriminating**: 100 convs up to **10M tokens**, 2,000 questions, 10 capabilities (fact-tracking, contradiction resolution, multi-hop, temporal…). Two tracks (1M/10M). **Intentionally unsaturated** (SOTA 64.1 / 48.6). Headline finding: **structured memory beats long-context alone by 3.5–12.7%** — i.e. it is *designed* to show exactly what Waggle's substrate does. This is the strongest "Waggle wins" stage.

**LongMemEval** (2024, established) — 500 questions, 5 abilities incl **knowledge-updates + abstention** (LoCoMo lacks these). Multi-session reasoning still hard (~70.7% Mem0). GPT-4o judge. The credible, citable upgrade from LoCoMo (which we already did in C-1).

**LoCoMo** (done, C-1): modest by 2026 standards; useful baseline, not sufficient alone.

---

## Recommendation

1. **For the moat (highest-leverage, cheapest, winnable):** run a **memory benchmark where structured memory beats long-context** — **LongMemEval** (credible, ~LoCoMo cost) as the near-term move, **BEAM** as the flagship (unsaturated → headroom to show a real edge). Memory benchmarks are *cheap* (LoCoMo was ~$26) AND the only place Waggle claims a **win**. Best ROI by far.
2. **The killer sovereign demo:** run the memory benchmark with a **local model (Ollama) on Waggle's substrate, beating cloud frontier long-context.** That fuses moat (memory) + sovereignty (local/zero-egress) + a winnable claim → the single strongest hero statement for "knowledge workers + sovereign AI."
3. **If we spend on an agentic benchmark, prefer TheAgentCompany over GAIA 2 full** — better audience-fit (knowledge work), native sovereignty (self-hosted stack), and better grading rigor (71% deterministic). GAIA 2's Hermes cell is a fine *first* data point; don't over-invest in the full 5-split × 3-harness matrix before validating TAC fit.

## Implication for the in-flight plan
- **GAIA 2 full matrix → DEMOTE from "next big spend."** Keep the Hermes/OpenClaw/Oracle cells as a modest, already-mostly-built data point; finish Phase 1 judge-delta to make the one cell defensible; then **pivot the agentic spend toward TheAgentCompany** and the **memory benchmark toward LongMemEval/BEAM.**
- This keeps "lower-N first" (Marko's decision 3) and avoids ~$1k on the GAIA 2 spine that proves less than a ~$26 memory run.

## Sources
- TheAgentCompany: arxiv.org/abs/2412.14161 · the-agent-company.com · github.com/TheAgentCompany/TheAgentCompany
- Memory benchmarks 2026: mem0.ai/blog/ai-memory-benchmarks-in-2026 · LongMemEval (emergentmind) · LoCoMo (snap-research.github.io/locomo) · BEAM (ICLR 2026)
- GDPval (OpenAI), tau2-bench (Sierra), GAIA2 (arxiv 2602.11964)
