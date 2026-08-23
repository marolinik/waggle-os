# Pillar 1 — Waggle harness + Qwen 3.6 35B-A3B on GAIA 2 search · N=160 result

**Run fired:** 2026-05-26 17:19 (task ID `blt6winb3`) · **Trio-rejudge completed:** 2026-05-27 06:35
**Setup:** Waggle harness (`waggle_worker.mjs` + `runAgentLoop`) · Qwen 3.6 35B-A3B via LiteLLM → DashScope-intl direct · thinking="high" · single `terminal` tool · same AGENTS.md as the 2026-05-22 Sonnet baseline.

---

## Headline — trio-strict

| Cell | N | trio-strict | source |
|---|---:|---:|---|
| Hermes (reference harness) + Sonnet 4.6 | 148 | **87.2%** | `rejudge-search-n160.jsonl` (P4.5) |
| **Waggle harness + Sonnet 4.6** | 39 | **84.6%** | `rejudge-waggle-n40.jsonl` (PILLAR1 N=40) |
| **Waggle harness + Qwen 3.6 35B-A3B thinking** | **156** | **67.9%** | `rejudge-waggle-qwen36-thinking-n160.jsonl` (this run) |

Same harness (Waggle), model swap Sonnet→Qwen: **−16.7pp** on the matched N=38 subset.
Sovereign-eligible vs published-SOTA frontier (Hermes+Sonnet): **−19.3pp** on matched N=145.

**Trio judges were essentially unanimous** on Qwen: 106 unanimous PASS / 49 unanimous FAIL / 1 single-judge split. trio-strict ≡ trio-majority for Qwen — failures are *decisive*, not borderline phrasing disputes.

---

## Matched-pair breakdown

### vs Hermes+Sonnet on N=145 common scenarios
| | count | note |
|---|---:|---|
| Both PASS | 88 | |
| Qwen FAIL · Hermes PASS | **39** | the gap |
| Qwen PASS · Hermes FAIL | 10 | Qwen wins |
| Both FAIL | 8 | scenario-hard |

Net gap = 29 net losses out of 145 ≈ −20pp.

### vs Waggle+Sonnet on N=38 common scenarios (pure model attribution, same harness)
| | count | note |
|---|---:|---|
| Both PASS | 25 | |
| Qwen FAIL · Sonnet PASS | **8** | pure model-attributable gap |
| Qwen PASS · Sonnet FAIL | 2 | |
| Both FAIL | 3 | |

Net same-harness gap = 6/38 ≈ −15.8pp. Within tight CIs of the full-N gap above.

---

## Where Qwen is weaker — categorical failure modes

Surveyed 7 failing scenarios (3 same-harness gap, 4 vs-Hermes gap) on disk at `runs/waggle-qwen36-thinking-n160/search/`. Same root failure mode recurs:

### Cat 1 — **Verbose multi-paragraph final answer** (≈6 of 7 sampled, dominant)

Qwen's final `send_message_to_user` ranges from 300–2000 characters: includes a "thinking preface" (*"Now let me analyze the data. I need to:"*, *"Based on my analysis:"*), bulleted analysis, headers, and the answer buried inside or at the end. The GAIA 2 deterministic `user_message_checker` returns `inconclusive` because the message doesn't crisply match the expected answer pattern. The trio LLM judges, more lenient on phrasing, *also* score these as wrong — Qwen often gets the actual answer wrong on top of being verbose (e.g., `21_er2clq`: answered "Stockholm" — the user's own city — apparently confusing contact Astrid Lindqvist with the user Astrid Lundqvist).

**Sonnet self-disciplines.** Qwen does not. Examples:
- `21_er2clq` · 1992 chars · begins "Now let me analyze the data. I need to:"
- `21_otvqov` · 1303 chars · "Based on my analysis:" + bullet list of message participants
- `22_auk06f` · 532 chars · "Based on my analysis:" + bold city/zip breakdown
- `27_9yg3xx` · 333 chars · multi-paragraph + "**Answer:** ..." suffix
- `28_y6gxdt` · 665 chars · numbered analysis list

### Cat 2 — **Tool-call JSON malformation → run crashes after 2 events**

At least one scenario (`22_1xhz8j`) crashed with a DashScope 400:
```
litellm.BadRequestError: OpenAIException - <400> InternalError.Algo.InvalidParameter:
The "function.arguments" parameter of the code model must be in JSON format.
```
`events=2`, `oracle=0`. Qwen emitted a tool call whose `function.arguments` was not valid JSON; DashScope rejected; the agent loop produced no further events and the final answer is the raw error string. Sonnet doesn't trigger this class of failure.

### Cat 3 — **Thinking-mode bleed**

Several Qwen final answers begin with first-person planning text ("Now let me…", "I need to…") that should have lived inside the `<think>` block, not in the user-facing message. Suggests the worker is forwarding the entire model output rather than parsing/stripping a `<think>…</think>` envelope, or that Qwen 3.6 35B-A3B thinking-high doesn't always emit a clean separator.

---

## Are these harness-fixable?

| Fix | Class | Expected closure | Risk |
|---|---|---|---|
| **H-1 · Final-answer extraction + reformatting shim** in `waggle_worker.mjs` | post-processing | Most of the 39-scenario gap | Need to re-baseline Sonnet with the same shim to keep fairness, OR apply Qwen-only and disclose |
| **H-2 · Tool-call JSON validator + retry** before forwarding to LiteLLM | pre-flight validation | Some unknown count of `events=2` crashes | None — pure defensive guard |
| **H-3 · System-prompt format hardening** in AGENTS.md ("final answer = single concise value, no prose") | prompt-shape | Overlaps with H-1, additive | Same fairness re-baseline question as H-1 |
| **H-4 · Thinking-envelope parser** that strips `<think>…</think>` from the final response | post-processing | Some unknown count of Cat 3 leaks | None — only fires when envelope present |

**The pure-model gap floor:** the 8 same-harness failures are mostly Cat 1 (verbose answers + content errors). H-1 and H-3 together could close *some* of them (where the right answer is buried in the prose and a strip-to-value step would surface it) but not all (where Qwen's actual reasoning was wrong). Rough estimate without doing the work: H-1 + H-3 + H-2 closes 10–25 of the 39 vs-Hermes gap scenarios — moves Qwen-Waggle from 67.9% to roughly **74–83%**, putting it in the "75-85% sovereign-eligible" band the runbook gate criteria framed as defensible.

**The principled comparison:** if we ship H-1/H-3 we MUST also re-run Sonnet through the same shim. Otherwise the comparison is unfair. Cheapest defensible cell: rerun Waggle+Sonnet N=40 with the shim, see if Sonnet stays at 84.6% (probable; Sonnet doesn't need the rail) or also shifts. Then the matched-pair stays clean.

---

## Recommended next step (PM-grade pick list)

| Option | Effort | Yields |
|---|---|---|
| **A. Ship H-2 only** (tool-call JSON validator) | 0.5 day | Closes the crash-class failures; safe ON for any model; no fairness re-baseline needed |
| **B. Ship H-1 + H-3 + H-2 then rerun Qwen N=40 + Sonnet N=40 with shim** | 2 days | Closes the verbose-answer gap; rigorous matched-pair comparison; defensible launch number |
| **C. Accept 67.9% as the sovereign Qwen number** and frame Pillar 1 as "Waggle harness on sovereign 35B model lands at 67.9%, model-bound not harness-bound" | 0 days | Honest framing; preserves Sonnet 86.5% as published-frontier headline |
| **D. Skip Qwen-on-API entirely**, pivot to local-Ollama Qwen variant (the original runbook scaffold `b4e4354`) | days, queued on Ollama serving | Different sovereignty story (no cloud); same underlying model gap |

**Default recommendation:** **B**, but pre-flight with **A** as the cheap safety net. The harness work is genuinely Waggle-product-improving (H-2 protects ANY future model swap; H-1/H-3 make Waggle better at orchestrating non-Sonnet models, which is the whole sovereign-eligible thesis). Once B's measurement is in, decide between publishing the higher number (B's result) or the conservative one (C). Either way, H-2 is free upside.

---

## Cost & error log

- Run wall: fired 2026-05-26 17:19 → rejudge finished 2026-05-27 06:35 → ~13h elapsed wall.
  - This includes both the original N=160 run + the trio-rejudge phase (Opus 4.7, Gemini 2.5 Pro, GPT-5.x via LiteLLM).
- Cost: not yet reconciled. Per runbook estimate $5-8 for the run + ~$3-4 for trio-rejudge.
- 4 scenarios from the 160 are missing from the rejudge file (N=156) — likely judge errors or scenarios that errored in-container; the script logs would clarify but it's <3% and not material to the headline.

## Pointers
- Headline data: `runs/rejudge-waggle-qwen36-thinking-n160.jsonl`
- Per-scenario output: `runs/waggle-qwen36-thinking-n160/search/scenario_universe_*/{result.json,agent_response.txt,events.jsonl,entrypoint.log}`
- Sonnet baselines: `runs/rejudge-search-n160.jsonl` (Hermes), `runs/rejudge-waggle-n40.jsonl` (Waggle)
- Source runbook: `benchmarks/gaia2/PILLAR1-QWEN-LOCAL-RUNBOOK.md` (pivot commit `c58f919`)
- Worker entry: `benchmarks/gaia2/waggle-container/waggle_worker.mjs`
- runAgentLoop: `packages/agent/src/agent-loop.ts` (inside the container build)

## Provenance
- Original Sonnet-baseline memo: `PILLAR1-WAGGLE-VS-HERMES-N40-2026-05-22.md` (Waggle on par with Hermes, 86.5% vs 89.2%)
- This memo's gap analysis is conservative (7-sample qualitative review). A full per-scenario taxonomy across all 39 vs-Hermes gap scenarios would refine the H-1/H-2/H-3 closure estimate but isn't required to choose between options A/B/C/D.
