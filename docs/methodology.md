# Waggle Methodology Documentation

**Date:** 2026-06-01 (v2)
**Subject of this document:** how Waggle's published LoCoMo memory-substrate numbers are produced, what they mean, and how to reproduce them offline.

> **v2 honesty note.** This revision aligns the public methodology page to the canonical run record in the hive-mind repository (`benchmarks/locomo/RESULTS.md`, run v5, 2026-05-21). The previous v1 of this document led with an oracle-ceiling number framed as a retrieval headline, claimed a clean win over Mem0, and carried a "+27.35-point methodology gap" brand that the canonical v5 run revised down. Those claims are corrected below. Every number on this page is traceable to a committed artifact and re-derivable offline.

---

## Summary

We measured Waggle's memory substrate on the LoCoMo long-term conversational memory benchmark (N=320 stratified) under multiple evaluation protocols. The defensible, reproducible headline is the **trio-strict** result: under a 3-vendor judge ensemble (Anthropic Opus 4.7 + OpenAI GPT-5.5 + MiniMax M2.7, scored as a logical AND of all three), the substrate scores **67.8% (217/320)**. This number is cross-vendor, conservative by design, and re-derivable offline from committed judgments with zero API calls.

The load-bearing scientific finding is **substrate ≈ subject**: two very different SOTA subject models — Anthropic Opus 4.7 and a ~35B open-weights local model (Qwen3.6-35B-A3B) — converge to within **0.3 percentage points** on the *same* retrieval substrate under self-judge (73.1% vs 73.4%). The binding constraint on accuracy is the memory layer, not the model. *The layer, not the model.*

The strongest category is fully reliable across vendors: **single-hop trio-strict 87.5%** exactly matches its self-judge score (0pp inflation). The hardest cell is disclosed honestly: **multi-hop trio-strict 61.3%**, where one judge most often dissents.

This document covers (1) the LoCoMo evaluation protocol, (2) the trio-strict judge-ensemble rationale and inter-judge agreement, (3) the self-judge bias quantification (+5.3pp on this system), (4) the Mem0 matched-protocol comparison, (5) offline reproducibility instructions, and (6) limitations including a documented negative result.

---

## 1. LoCoMo Evaluation Protocol

### 1.1 Dataset and provenance

We evaluate on the LoCoMo benchmark (`snap-research/locomo`, file `locomo10.json`), pinned by SHA-256 `79fa87e9…ea698ff4` (2,805,274 bytes), sourced from the upstream public release. LoCoMo provides multi-session conversations with question-answer pairs designed to test memory retrieval at conversational distance.

### 1.2 Sample size and stratification

Primary results are reported on **N=320**, stratified **80 per category** across four question categories: multi-hop, temporal, open-ended, single-hop. The LoCoMo "adversarial" category (category 5) is excluded from the 4-way split. Sampling is deterministic and reconstructible: `xorshift32(seed=42)` + Fisher-Yates per bucket, bucket order [1,2,3,4], sorted by `instance_id` ascending. The sample, dataset SHA, and seed are committed so the test set itself is reconstructible.

### 1.3 Subject model and substrate

The headline subject model is `claude-opus-4-7` (Anthropic Messages API). The retrieval substrate is the **v5 frozen architecture**: distilled-dense facts (~53 per conversation) + K=5 importance retrieval + K=10 semantic retrieval + cross-encoder reranker + a synthesis-encouraging system prompt.

### 1.4 Headline result

**Under the trio-strict 3-vendor judge ensemble, Waggle's substrate scores 67.8% (217/320) on LoCoMo (N=320 stratified).** This is the conservative, cross-vendor, offline-reproducible number and the one we lead with. The same answers under a less strict majority rule (≥2 of 3 judges) score 70.0% (224/320). The self-judge reference (Opus judging Opus) is 73.1% (234/320) and is disclosed as inflated — never the headline.

| Metric | Value |
|---|---:|
| **Trio-strict (AND of 3) — headline** | **217 / 320 = 67.8%** |
| Trio-majority (≥2 of 3) | 224 / 320 = 70.0% |
| Self-judge (Opus alone, reference only) | 234 / 320 = 73.1% |
| Self-judge inflation | **+5.3 pp** |
| Parse failures | 4 / 320 = 1.25% (irrecoverable noise) |

---

## 2. The "Layer, Not the Model" Finding (Substrate ≈ Subject)

The central scientific result is that the **substrate is the binding constraint, not the subject LLM**. We ran the same v5 retrieval substrate under two very different SOTA subject models and scored both under the identical self-judge protocol:

| Subject model | multi | temporal | open-ended | single | **TOTAL** |
|---|---:|---:|---:|---:|---:|
| Opus 4.7 (frontier cloud) | 75.0% | 67.5% | 62.5% | 87.5% | **73.1%** |
| Qwen3.6-35B-A3B (~35B open-weights, local) | 78.8% | 67.1% | 58.8% | 88.8% | **73.4%** |
| **Δ (Opus − Qwen)** | −3.8 | +0.4 | +3.8 | −1.3 | **−0.3 pp** |

The two models land **within 0.3 percentage points** of each other on identical retrieval. Opus trades ~5pp on lookup-style questions for +3.8pp on the synthesis-heavy open-ended category — a different failure mode, the same envelope. A frontier cloud model and a ~35B model you can run on-premises reach the same accuracy on the same memory layer.

This is the architectural basis for sovereign / regulated deployment: organizations that cannot run frontier-cloud models for compliance, data-residency, or sovereignty reasons can pair a local ~35B model with the Waggle substrate and reach comparable accuracy on these conditions. The driver of quality is the memory layer.

> Note on scope: this convergence is measured under the **self-judge** protocol (73.1% / 73.4%) because both subject runs were scored that way; the cross-vendor trio-strict ensemble was run on the Opus answer set. The ~0.3pp convergence is the verified claim; it should be cited as a self-judge result, not as a trio-strict result.

---

## 3. Judge Ensemble Methodology

### 3.1 Why a trio-strict ensemble

A persistent issue in long-term-memory benchmark evaluation is **self-judging bias** — the same LLM family acts as both the answer generator and the answer evaluator, which inflates scores relative to held-out-judge protocols. To control for single-family bias, Waggle uses a three-judge ensemble drawn from independent model vendors and scores a response **correct only when all three judges agree** (logical AND, "trio-strict"). This is conservative by design — it is the harder bar, not the easier one.

The three judges (each polled with the Mem0 verbatim "be generous" accuracy prompt):

| Role | Model |
|---|---|
| Anthropic | `claude-opus-4-7` |
| OpenAI | `gpt-5.5-2026-04-23` |
| MiniMax | `MiniMax-M2.7` |

A row where any judge fails to parse is excluded — counted as not-correct, with the denominator held at 320. Four rows (1.25%) were irrecoverable parse noise.

### 3.2 Inter-judge agreement

For the canonical v5 run we report **pairwise agreement** between judges (the fraction of co-parsed rows on which two judges return the same verdict):

| Pair | Agreement |
|---|---:|
| Opus ↔ GPT | 98.3% (286/291) |
| Opus ↔ MiniMax | 93.5% (260/278) |
| GPT ↔ MiniMax | 95.1% (250/263) |

The three judges also land within ~4pp of one another on overall correctness (Opus 230/320, GPT 223/320, MiniMax 236/320), so the ensemble agrees on aggregate quality even where individual rows are disputed. Disagreement is concentrated in the multi-hop and open-ended categories, where a binary "correct" verdict is genuinely fuzzy.

> Cohen's κ for the canonical v5 judge set (Opus 4.7 + GPT-5.5 + MiniMax M2.7) is not published in the run record; only pairwise agreement percentages are. A prior, *different* judge set (Opus 4.6 + GPT-5 + MiniMax M2.7, a separate earlier run) reported κ_trio ≈ 0.7878 — that figure belongs to that earlier configuration and is **not** the inter-judge κ for the headline v5 run. **[UNVERIFIED — founder to confirm against RESULTS.md]** whether a Cohen's κ should be published for the v5 judge set; until then we report pairwise agreement only.

### 3.3 Parser-fix audit trail

We disclose the full audit trail of the trio re-judge. A first trio run (v1, 2026-05-21 morning) produced 184/320 = 57.5% because of a parser bug: MiniMax's `max_tokens` budget (800) was too small and its reasoning tokens consumed the budget before the verdict label was emitted, and the parser did not accept the natural-language "INCORRECT" as a WRONG synonym. This produced 63 parse failures (19.7%), which were (wrongly) treated as not-correct and inflated the apparent self-judge gap. The fix raised MiniMax to `max_tokens: 3000` (and Opus/GPT to 500), taught the parser to accept "INCORRECT", and re-judged only the 63 failed rows. After the fix, 59 of 63 resolved, leaving 4 irrecoverable. The canonical, post-fix result is **217/320 = 67.8%** (the v2 file). We keep the buggy v1 judgments committed as an audit trail.

---

## 4. Self-Judge Bias Quantification (+5.3pp on this system)

When the same answers are scored by Opus-alone (self-judge) versus the trio-strict ensemble, the self-judge score is **+5.3 percentage points higher** (73.1% → 67.8%). This is well within cross-LLM-benchmark norms and is the honest, measured inflation for this system.

> Earlier internal (PM-Waggle-OS) work carried a "+27.35pp methodology gap" estimate. The canonical v5 run **measured the inflation directly on this system at +5.3pp** — substantially less than that prior estimate. We do not carry the +27.35pp figure forward, and we have dropped the "+27.35-Point Methodology Gap" framing entirely. The honest number is +5.3pp.

### 4.1 Per-category inflation

The inflation is not uniform — it is concentrated exactly where binary correctness is fuzzy:

| Category | Trio-strict | Self-judge | Inflation |
|---|---:|---:|---:|
| single-hop | **87.5%** (70/80) | 87.5% | **0 pp** (exact match) |
| temporal | 65.0% (52/80) | 67.5% | +2.5 pp |
| open-ended | 57.5% (46/80) | 62.5% | +5.0 pp |
| multi-hop | **61.3%** (49/80) | 75.0% | +13.7 pp |

**Single-hop trio-strict (87.5%) exactly matches self-judge** — the substrate's strongest category is fully reliable across all three vendors with zero inflation. **Multi-hop is the hard cell** (61.3% trio-strict) and the most inflated (+13.7pp), because multi-hop reasoning is where one judge most frequently dissents. We disclose multi-hop as the honest weak point rather than averaging it away.

### 4.2 Implications

Single-judge LoCoMo scores reported elsewhere in the 80–95% range are not directly comparable to trio-strict scores in the 60–70% range. Cross-paper comparisons require judge-methodology disclosure. We offer trio-strict (or a comparable held-out-judge protocol) as a community-friendly bar, and we publish both our trio-strict headline and our self-judge reference so a reader can map onto whichever methodology a venue uses.

---

## 5. Mem0 Comparison (Matched Protocol)

We compare against Mem0's published LoCoMo number under a **matched protocol**, and we are explicit about what is and is not a clean win.

| Comparison | Waggle | Mem0 paper | Δ |
|---|---:|---:|---:|
| Same-protocol self-judge (same dataset, same protocol, same judge prompt) | 73.1% | 68.5% | **+4.6 pp (Waggle)** |
| Waggle **trio-strict** vs Mem0 **self-judge** | 67.8% | 68.5% | −0.7 pp (essentially tied) |

Two honest readings:

1. **Under matched self-judge methodology** (the apples-to-apples comparison — same dataset, same "be generous" prompt, same single-judge protocol Mem0 used), Waggle scores **+4.6pp over Mem0's published 68.5%**, cross-validated on two subject models (Opus 73.1%, Qwen 73.4%).
2. **When Waggle is held to the stricter trio-strict bar while Mem0 keeps its single permissive self-judge**, the two are **essentially tied** (−0.7pp). This comparison is deliberately in Waggle's disadvantage — a 3-vendor AND-of-3 ensemble vs a single permissive judge — so the "tied" reading is conservative.

**We do not claim a clean 7.1-point win over Mem0.** The previous "74% beats Mem0's 66.9% by 7.1 points" headline compared a Waggle oracle-ceiling number against a re-judged Mem0 figure and is withdrawn. The defensible statement is: under matched self-judge protocol Waggle is modestly ahead (+4.6pp); under the stricter trio-strict bar the substrates are roughly tied.

> On the "74%" number: that figure is a **full-context oracle ceiling** (the subject model is given the entire conversation history, not substrate-mediated retrieval), measured in an earlier Stage-3 run. It is a headroom indicator, **not** the substrate-retrieval accuracy, and it is **not** the headline on this page. The headline accuracy is the trio-strict 67.8%.

---

## 6. Reproducibility

### 6.1 Offline reproduction (zero API calls)

The headline number is re-derivable offline from committed judgments, with no network and no model calls:

```bash
git clone https://github.com/marolinik/hive-mind.git
cd hive-mind
node benchmarks/locomo/rescore.mjs
```

Expected output (exit 0):

```
  Trio-strict (AND of 3)   217/320 = 67.8%
  Trio-majority (>=2 of 3) 224/320 = 70.0%
  Parse failures           4/320
  single-hop   70/80   multi-hop 49/80   temporal 52/80   open-ended 46/80
  opus 230/320   gpt 223/320   mm 236/320
```

The rescore is adversarial about its own inputs: it (1) verifies each artifact's SHA-256 against `MANIFEST.json` (tamper-evidence), (2) independently recomputes every per-row verdict from the raw per-judge verdicts and cross-checks against the committed fields (0 mismatches expected), and (3) asserts the strict/majority/per-category/per-judge tallies match the MANIFEST exactly, exiting non-zero on any drift. This is the intended verification route, and it costs **$0**.

### 6.2 Committed artifacts

The committed reproducibility set (`benchmarks/locomo/artifacts/`):

| File | Role |
|---|---|
| `trio-judgments-v5-retrieval.v2.jsonl` | canonical per-row trio judgments (the rescore input, post parser-fix) |
| `cell-retrieval-v5-claude.jsonl` | the v5 retrieval answers that were judged |
| `sample-cells-23-N320.jsonl` | the N=320 stratified question sample (the test set) |
| `dataset-MANIFEST.json` | upstream LoCoMo dataset provenance (source URL + SHA + shape) |
| `sample-MANIFEST.json` | sampling provenance (seed=42 + algorithm + per-bucket SHAs) |
| `MANIFEST.json` | pins all artifact SHA-256s + dataset SHA + seed + the expected-results contract |

### 6.3 Full re-run from scratch

Regenerating the answers and judgments from the numbered `benchmarks/locomo/*.mjs` harness requires API keys and roughly **$23–26** of spend (v5 retrieval ~$5; trio judging, including the redo of parse-failures, ~$14–17; original self-judge ~$9). The offline `rescore.mjs` path needs neither network nor keys.

### 6.4 Code license

The hive-mind substrate (bitemporal knowledge graph retrieval, frame compression, reranker) and the evaluation harness are open source under Apache 2.0 at github.com/marolinik/hive-mind.

---

## 7. Limitations and Negative Results

### 7.1 What is not in this measurement

- **Single configuration, no ablation.** The full stack is on; we have not yet ablated the reranker / chunker / 8k embedder / distilled facts one at a time to attribute the contribution of each lever.
- **Confidence intervals are eyeballed.** Rough binomial spread is ~2pp at N=80 per cell, ~1pp at N=320 total. We have not computed formal CIs.
- **CLI library-mode only.** The MCP path is not yet benchmarked (its reranker wiring is incomplete); no MCP-path number is published.
- **κ not published for the v5 judge set** (see §3.2). We report pairwise agreement only for the headline run.

### 7.2 Multiplier pilot — negative result (disclosed honestly)

A separate "multiplier hypothesis" pilot — testing whether the Waggle memory layer would more than double downstream agentic task performance on real PM / research / engineering scenarios — produced negative results in an early small-N pilot and was **not** confirmed. We disclose this explicitly: honest negatives build credibility, and this negative does not affect the LoCoMo substrate measurement above.

> The specific pilot tallies (per-scenario success counts, N, and date) reported in the prior v1 of this document originated in PM-Waggle-OS planning notes and are **not** present in the hive-mind run record (`RESULTS.md`). **[UNVERIFIED — founder to confirm against RESULTS.md]** the exact multiplier-pilot numbers and re-test preconditions before restating them publicly. Until confirmed, we state only the directional finding (the multiplier hypothesis was not confirmed in an early pilot) and do not assert specific figures.

### 7.3 GEPA cross-family validation — not in the LoCoMo run record

The prior v1 of this document reported a GEPA (reflective prompt-evolution) cross-family table claiming a "+12.5pp Pass-II uplift" with a "0pp gap" between a Claude variant and a Qwen variant. Those specific GEPA uplift figures are **not** present in the LoCoMo run record (`RESULTS.md`).

> **[UNVERIFIED — founder to confirm against RESULTS.md]** the GEPA "+12.5pp uplift" and "0pp held-out gap" figures and their source run. We have removed them as a headline. Note that the *separate* and verified "substrate ≈ subject" convergence (Opus 73.1% vs Qwen 73.4%, Δ−0.3pp, §2) is the LoCoMo-grounded version of the "open model reaches frontier quality on the same layer" story and should be cited in place of the unverified GEPA uplift numbers.

### 7.4 Judge-ensemble cost

Trio-strict evaluation is roughly 3× the API cost of single-judge evaluation (triple the judge calls). For early-stage exploration a single judge is fine; trio-strict is reserved for publication-grade claims, where the higher-confidence cross-vendor bar is worth the cost.

---

## 8. References

- LoCoMo benchmark: Maharana et al., 2024 — dataset `snap-research/locomo`, `locomo10.json`.
- Mem0 (peer-reviewed): Mem0.ai/research, arXiv:2504.19413 — published LoCoMo self-judge figure 68.5%.
- GEPA (Genetic-Pareto reflective prompt optimization): Agrawal et al., 2025, arXiv:2507.19457.
- Canonical run record: `benchmarks/locomo/RESULTS.md` and `benchmarks/locomo/artifacts/MANIFEST.json` in github.com/marolinik/hive-mind.

For the most current evaluation results and reproducibility artifacts, consult the hive-mind research repository (canonical OSS substrate distribution). When the run record and any prose disagree, **the run record (`RESULTS.md` / `MANIFEST.json`, re-derivable by `rescore.mjs`) is canonical.**

---

**Document maintenance:** This document is versioned. v2 (2026-06-01) realigns the public methodology page to the canonical v5 LoCoMo run record and removes the withdrawn "+27.35-Point Methodology Gap" / "7.1-point Mem0 win" / GEPA-uplift framings. Subsequent versions will incorporate ablation results, formal confidence intervals, an MCP-path benchmark, and any additional benchmarks once they are reproduced in-repo.

License: This documentation is released under Creative Commons Attribution 4.0 International (CC BY 4.0). Code and evaluation artifacts referenced are Apache 2.0 licensed.
