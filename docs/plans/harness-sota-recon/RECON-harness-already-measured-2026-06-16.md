# Harness-SOTA Recon — What Has Already Been Measured

**Date:** 2026-06-16
**Scope:** Inventory of ALL already-measured agentic-harness benchmark results in
`D:/Projects/waggle-os-gaia2-wt/benchmarks/gaia2/` toward the founder's three-part hypothesis:
1. **harness > raw** (an agent harness beats a bare model)
2. **harness + memory > harness** (adding the memory substrate helps)
3. **Qwen 3.6 + harness ≈ premium** (a sovereign 35B model in the harness reaches frontier)
**Author:** recon agent. All numbers re-verified from raw JSONL where possible (see §8).

> **TOP-LINE FINDING.** The corpus measures **Pillar 1 = agent-harness quality on GAIA 2 search**.
> It does NOT measure two of the three hypothesis legs:
> - **harness vs raw (no harness)** — *never run.* There is no bare-model-no-harness GAIA 2 cell. The
>   "FULL vs BARE" doc compares **bare-Waggle-harness vs feature-enhanced-Waggle-harness** — both are
>   the harness; "bare" means *harness with product features OFF*, not *no harness*.
> - **harness + memory vs harness** — *never run on GAIA 2.* Memory (hive-mind) was deliberately held
>   OUT of every GAIA 2 cell (see §6, contamination/fairness). The founder's GOAL doc explicitly states
>   "GAIA 2 measures the harness, not hive-mind memory. Keep the lanes separate."
> - **Qwen 3.6 + harness ≈ premium** — *measured and FALSIFIED.* Qwen 3.6 lands 67.9% vs Sonnet 84.6%
>   / Hermes-Sonnet 87.2% — a ~19-20pp gap that **none of three harness levers closed at scale**.

---

## 0. The runs, at a glance (provenance map)

| Doc | Date | Cell | N | Headline |
|---|---|---|---:|---|
| `smoke-evidence.md` | 04-30 | ARE install + mock smoke | 1 | Plumbing PASS; Windows SIGALRM blocker → Docker |
| `dry-run-results-memo.md` | 04-30 | narrow-proxy probe (pre-Docker) | 4 invocations | **HALT** — $4.09/invocation, 9-31x over estimate |
| `PHASE-4-P4.2-PROGRESS` §8 | 05-21 | Hermes+Sonnet probe | 10 | 8/10 strict, 8/8 judged-only ($5.50) |
| `PHASE-4-P4.5-RESULTS` | 05-22 | **Hermes+Sonnet full** | 160 | 83.8% strict / 86.5% judged-only (self-judge) |
| `JUDGE-DELTA` | 05-22 | trio re-judge of P4.5 | 148 | **87.2% trio-strict**; self-judge NOT inflated |
| `WAGGLE-HARNESS-PROBE-N10` | 05-22 | Waggle+Sonnet probe | 10 | 70% (placeholder; noisy) |
| `PILLAR1-WAGGLE-VS-HERMES-N40` | 05-22 | **Waggle vs Hermes, Sonnet** | 40 | Waggle 84.6% trio ≈ Hermes 89.2% trio (on par) |
| `PILLAR1-QWEN-LOCAL-RUNBOOK` | 05-26 | runbook for Qwen cell | — | Method only |
| `PILLAR1-QWEN36-N160-RESULT` | 05-27 | **Waggle+Qwen 3.6 bare** | 156 | **67.9% trio-strict** (−19.3pp vs frontier) |
| `PILLAR1-WAGGLE-FULL-VS-BARE` | 05-27→28 | Waggle feature ladder (F1/F2/F3) on Qwen | 20→160 | F3 +10.5pp at N=20 → **−3.2pp at N=160 (FALSE POSITIVE)** |

**Dataset for ALL Pillar-1 cells:** HuggingFace `meta-agents-research-environments/gaia2`
(`gaia2-cli` dataset), **`search` split only**, scenarios drawn in dataset order (universe_21→30).
ARE upstream pinned SHA `0330191ffef8581e3c0620b78df9c7408bcb98b0` (2026-04-20).
Note: the 04-30 *smoke* used the `mini`/`validation` config (160 examples); all real Pillar-1 runs use
the `search` split.

---

## 1. The agent-harness SOTA cells (Pillar 1) — verified numbers

All trio-strict numbers below were **recomputed from the raw rejudge JSONL** (see §8), not just quoted.

### 1.1 Reference harness — Hermes + Sonnet 4.6 (the "frontier" comparator)

| Metric | Value | Source |
|---|---:|---|
| Strict pass (errors count against) | **134/160 = 83.8%** | `PHASE-4-P4.5-RESULTS` |
| Judged-only (self-judge, Sonnet) | 134/155 = 86.5% | same |
| **Trio-strict (n=148 answerable)** | **129/148 = 87.2%** ✅ recomputed | `rejudge-search-n160.jsonl` |
| Trio-strict mapped to N=160 denom | ~80.6% (129/160) | `JUDGE-DELTA` §"Mapping" |
| Self-judge inflation vs trio | **only −3.3pp** (90.5%→87.2% on n=148) | `JUDGE-DELTA` |

- **Model:** Claude Sonnet 4.6, thinking=high, via Anthropic direct.
- **Harness:** Hermes ARE-native reference agent (`localhost/gaia2-hermes:latest`). **NOT Waggle.**
- **Tooling:** single `terminal` tool → `gaia2-exec` → GAIA 2 app APIs (targeted calls, not bulk retrieval).
- **Judge protocol:** GAIA 2's OWN `user_message_checker` (semantic equivalence of final answer vs oracle);
  only the judge MODEL varies. In-container judge = Sonnet 4.6 (self-judge). Trio = Opus 4.7 + Gemini 2.5 Pro
  + GPT-5.x (raw JSONL keys: `opus-4.7`, `gemini-2.5-pro`, `gpt-5.x`). Trio-strict = unanimous 3/3 PASS.
- **Cost:** ~$91 extrapolated (~165 executions × ~$0.55), under the $100 cap.
- **Errors:** 5-scenario "no turn boundary detected" floor (~3%); re-running swaps *which* scenarios error,
  count stable → runner artifact, not agent failure.

### 1.2 Waggle harness + Sonnet 4.6 — the "on par" cell (Pillar 1 keystone)

| Metric | Value | Source |
|---|---:|---|
| Self-judged (matched 40) | 33/40 = 82.5% | `PILLAR1-WAGGLE-VS-HERMES-N40` |
| **Trio-strict** | **33/39 = 84.6%** ✅ recomputed | `rejudge-waggle-n40.jsonl` |
| Hermes trio-strict (same protocol) | 89.2% (matched N=40) | same memo |
| Gap | **−2.7pp, CIs overlap heavily → not statistically distinguishable** | same memo |

- **Controlled-variable protocol:** same model (Sonnet 4.6), same single `terminal` tool, same rendered
  AGENTS.md, same in-container judge, same scenarios (Waggle's 40 = sorted-order subset of Hermes 160).
- **Waggle meta-features OFF** (`skillDistillationGate=false`, `verificationGate=false`) for fairness —
  Hermes has no such features. (This is the *original* sense of "bare," see §2.)
- **Harness = Waggle's own `runAgentLoop`** (`packages/agent/src/agent-loop.ts`) inside
  `waggle-container/waggle_worker.mjs`.

> ⚠️ **DOCUMENT DISCREPANCY (citable).** The N=40 memo's *headline table* lists Waggle trio-strict as
> **"86.5%"** — that figure is actually the **self-judge** (and equals Hermes's *self-judged* column). The
> real **trio-strict is 84.6%** (33/39, confirmed in raw JSONL AND in the later QWEN36 memo's comparator
> table line 13). The 86.5% trio claim in the N40 memo headline is an internal inconsistency; the runbook
> and the qwen memo both use 84.6%/86.5% inconsistently. **For any publication, the Waggle+Sonnet
> trio-strict number is 84.6% at N=39, NOT 86.5%.** A skeptical reviewer who pulls the JSONL will catch
> this immediately.

### 1.3 Waggle harness + Qwen 3.6 35B-A3B (bare) — the sovereign cell

| Metric | Value | Source |
|---|---:|---|
| **Trio-strict** | **106/156 = 67.9%** ✅ recomputed | `rejudge-waggle-qwen36-thinking-n160.jsonl` |
| vs Hermes+Sonnet (matched N=145) | **−19.3pp** | memo matched-pair |
| vs Waggle+Sonnet, same harness (matched N=38) | **−15.8pp** (6 net losses/38) | memo |
| Judge unanimity | 106 unanimous PASS / 49 unanimous FAIL / 1 split → failures **decisive** | memo |

- **Model:** Qwen 3.6 35B-A3B, thinking=high, via LiteLLM → **DashScope-intl direct** (NOT OpenRouter,
  which silently regresses to Qwen 3.5 per `models.json:43`).
- **Harness:** same Waggle `runAgentLoop`, same AGENTS.md, single `terminal` tool, **all product features OFF**
  ("bare") — for fairness with both the Sonnet baseline and Hermes.
- **Failure taxonomy (qualitative, 7 sampled):** Cat 1 verbose multi-paragraph final answers (≈6/7,
  dominant — Qwen doesn't self-discipline the final `send_message_to_user`); Cat 2 tool-call JSON
  malformation → DashScope 400 crash; Cat 3 thinking-mode bleed into user-facing text.
- **Cost:** not reconciled; ~$5-8 run + ~$3-4 trio-rejudge per runbook estimate; ~13h wall (run + rejudge).

---

## 2. What "FULL vs BARE" actually shows (the doc the task asked to scrutinize)

`PILLAR1-WAGGLE-FULL-VS-BARE-2026-05-27.md` is the most likely to be **misread**. Precise reading:

- **"BARE" = Waggle harness with all product-distinctive features turned OFF** (no gates, no persona,
  no prompt-shape). It is STILL the full Waggle harness/loop. Baseline = the 67.9% Qwen cell above.
- **"FULL" = Waggle harness with features turned ON.** Three independent levers were tested (env-var toggles
  in `waggle_worker.mjs`):
  - **F1** = `WAGGLE_VERIFICATION_GATE` + `WAGGLE_SKILL_DISTILLATION_GATE` (the "as-shipped" gates)
  - **F2** = `WAGGLE_PERSONA_ID=executive-assistant` (persona prompt composition)
  - **F3** = `WAGGLE_GAIA2_QWEN_SHAPE=1` (≈30-line output-discipline appendix to system prompt)
- **It is NOT "harness vs no-harness."** There is **no no-harness arm** anywhere in this corpus.
- **Memory was NOT a factor** in any cell. None of F1/F2/F3 is the hive-mind substrate. (F1's "skill
  distillation gate" is a skill-authoring feature, not memory recall.)

### The numbers and their significance

| Cell | What's on | N=20 trio-strict | **N=160 trio-strict (authoritative)** |
|---|---|---:|---:|
| Bare (control) | nothing | 73.7% (N=20 prefix) | **67.9%** (156) |
| F1 (gates) | verification + skill distillation | 70.0% (net 0pp) | **never scaled** |
| F2 (persona) | executive-assistant | 75.0% (+5.3pp) | **never scaled** |
| F3 (shape) | output-discipline appendix | **85.0% (+10.5pp)** | **65.6% (103/157) = −3.2pp → NULL** ✅ recomputed |
| F4 Sonnet+F3 ⚠️ | shape on Sonnet | — | 97.5% (39/40) **UNCONFIRMED, biased prefix** |

**What the doc concludes (and I confirm from JSONL):**
1. **F3 is a FALSE POSITIVE.** The N=20 "+10.5pp" did not survive stratified scale-up. At N=157,
   F3 = 65.6%, which is **statistically flat vs the 67.9% bare** (bare sits inside F3's 95% CI 57.9-72.6%);
   net −3.2pp on matched-pair (16 recover / 21 regress). **No statistical-significance test was run** (no
   p-value/CI-on-the-delta reported beyond "bare inside the CI").
2. **Root cause of the false positive = prefix-sampling bias + run nondeterminism.** GAIA scenarios are
   ordered by universe (21→30); `limit=N` reads in dataset order, so N=20 drew 17/20 from universe_21.
   Per-universe proof: bare-Qwen = 82.4% on universe_21 but 68.0% on universes 23-30; F3 = 70.6% vs bare
   82.4% on universe_21 (it HURTS the universe it claimed to help). Plus Qwen-thinking at temperature is
   nondeterministic; "recovered" scenarios regressed on rerun.
3. **F1/F2 never scaled.** F1 = net 0pp at N=20; F2 = +5.3pp at N=20 but N=20 is now known unreliable.
4. **The authoritative Pillar-1 Qwen number is UNCHANGED at 67.9%.** The Qwen→Sonnet gap is declared
   **"model-bound, not harness-bound — at least not closeable by any of the three levers tried."**
5. **F4 Sonnet+F3 = 97.5% is explicitly NOT a result** — same biased universe-21-23 prefix (N=40). The doc
   says "Do not cite 97.5% as a Pillar 1 number."

**Bottom line on "FULL vs BARE":** It is an internal feature-ablation on Qwen that came up **null/negative**.
It does NOT support "harness > raw" (no raw arm) and does NOT support "harness+memory > harness" (no memory).
It is honest, self-correcting (three in-session retractions documented), and methodologically a cautionary
tale about non-stratified N=20 gates.

---

## 3. The $4.09/invocation halt — quantified

`dry-run-results-memo.md` (2026-04-30) is the economic pivot of the whole arc.

- **Approach that halted:** the *narrow-proxy adapter* (pre-Docker) — `flattenAppStateToCorpus` dumped
  **all 12 simulated apps** (~50KB each ≈ 600KB raw) into a searchable corpus, then injected top-K matches
  per turn. This is the WRONG abstraction (forcing `runRetrievalAgentLoop` onto a multi-app tool-use sim).
- **Per-invocation cost breakdown (probe, N=4):**

| # | Shape | Model | Tokens in | Cost | Failure |
|---|---|---|---:|---:|---|
| 1 | claude | opus-4.7 | 1,629,091 | **$8.18** | loop_exhausted |
| 2 | claude-gen1-v1 | opus-4.7 | 1,630,522 | **$8.19** | loop_exhausted |
| 3 | qwen-thinking | qwen3-30b-thinking | 283 | $0.0005 | provider rejected (262K cap) |
| 4 | qwen-thinking-gen1-v1 | qwen3-30b-thinking | 458 | $0.0013 | provider rejected (262K cap) |

- **The $4.09 number:** per-Claude-CALL cost (each invocation = ~2 calls; step 2 reached ~1.6M cumulative
  input tokens). Cost basis: 1.6M × $15/M in + 1.5K × $75/M out ≈ $24.11 over 2 calls = $8.18/invocation =
  **$4.09/call**.
- **Magnitude of miss:** paper estimate $0.13-0.45/invocation → actual **$4.09/invocation = 9-31x over.**
  Projected full N=40 sweep: **$163.77** (vs $5.20-18.00 estimated), 11x the cost cap.
- **Root cause of the estimate miss:** anchored on LoCoMo per-task token sizes (~3-5K context); GAIA 2
  environment snapshots are ~150-500K (12 apps × full state) → **~100-200x larger per task**, not the
  assumed 2-4x premium.
- **The fix that un-halted it:** **ARE-native runtime in Docker** (Phase 4). Agent makes *targeted* app-API
  calls instead of bulk retrieval → ~$0.50/scenario (8x reduction confirmed in actuals;
  `PHASE-4-P4.2-PROGRESS` §2). Projected full N=160 search: ~$25-91 ARE-native vs $300-500+ narrow-proxy.
- The probe **halted correctly** (PM ratification γ: probe-first, halt if projection > $8 trigger). The
  $16.38 probe alone breached the original $15 hard cap (retroactively amended to $20). This is the origin
  of the CLAUDE.md §10 "C-3 … $4.09/invocation, 9-31x over … economically non-viable" entry — that line
  refers ONLY to the *abandoned narrow-proxy adapter*, NOT to the working ARE-native Docker path that
  produced all the N=40/N=160 numbers above.

---

## 4. Claim → evidence → N → gap-to-publishable

| Founder claim | Current evidence | N | Status / gap to publishable |
|---|---|---:|---|
| **harness > raw** (harness beats bare model) | **NONE.** No no-harness GAIA 2 arm exists. | 0 | **Entirely unmeasured.** Needs a bare-model (no agent loop, no tools or single-shot) GAIA 2 cell under identical judge. Big design gap. |
| **harness + memory > harness** | **NONE.** Memory deliberately OFF in all cells. | 0 | **Entirely unmeasured on GAIA 2.** GOAL doc forbids mixing lanes. Would need a memory-augmented GAIA 2 arm + matched no-memory arm. (Memory SOTA lives in the separate LoCoMo/LongMemEval lane.) |
| **Waggle harness ≈ reference harness** (Sonnet) | Waggle 84.6% trio vs Hermes 89.2% trio, overlapping CIs | 39-40 | **Closest to publishable, but underpowered.** Gaps: N=40 (CI ±12pp); single-run pass@1; gateway confound (Waggle→OpenRouter vs Hermes→Anthropic); search split only; the 86.5%-vs-84.6% headline error. Needs N=160 matched + pass@k + single proxy + multi-split. |
| **Qwen 3.6 + harness ≈ premium** | **FALSIFIED:** 67.9% vs 84.6-87.2%, −19.3pp | 156 | Well-powered NEGATIVE result. Levers F1/F2/F3 did not close it. Publishable as "model-bound gap," not as "≈ premium." |
| **Harness levers (persona/shape) lift weak models** | **FALSIFIED at scale** (F3 +10.5pp@20 → −3.2pp@160) | 20→160 | Negative. F1/F2 never scaled. Needs stratified N≥120 + pass@k before ANY lever claim. |
| **GAIA 2 self-judge is trustworthy** | YES — trio only −3.3pp below self; judges agree 97-99% | 148 | Strong, publishable as a methods result for the Hermes cell. |
| **Local-first / zero-egress / auditable (sovereignty triple)** | Asserted (Docker, events.jsonl traces) but **NOT proven** (no egress=0 proof harness) | — | GOAL §8 marks egress=0 proof as 🔲 not built. Protagonist metric of Reading B is unmeasured. |

---

## 5. Apples-to-oranges / contamination concerns a reviewer would raise

1. **Mem0 baseline is invalid as published.** The P4.5 and P4.2 docs cite "Mem0 paper baseline ~40-55%
   pass@1" and claim "+30-45pp over baseline." The GOAL doc §7 **explicitly forbids this**: "Do NOT publish
   'Waggle 83.8% vs Mem0 ~40-55%' — different judge/denominator/protocol." The +30-45pp claim is
   apples-to-oranges and must be dropped from any external artifact. (It survives inside the run memos.)

2. **Gateway confound.** Waggle+Sonnet ran via OpenRouter (OpenAI-compat); Hermes+Sonnet via Anthropic
   direct. "Same model, different gateway" — could shift behavior. Not yet controlled (single LiteLLM proxy
   recommended but not done for the N=40 comparison). The Qwen runbook fixed this for the Qwen cell (both
   through one proxy) but the keystone on-par comparison still has it.

3. **Non-stratified prefix sampling = selection bias.** This already produced ONE false positive (F3). Every
   `limit=N` run reads scenarios in universe order; later universes are harder (bare 82.4% univ_21 vs 68.0%
   univ_23-30). Any sub-N=160 cell is biased toward easy universes. The N=40 on-par comparison (84.6% vs
   89.2%) is itself a universe-21-23-heavy prefix — its absolute level is likely inflated vs the full split.

4. **Self-judge in the production runs.** P4.5's 83.8%/86.5% were Sonnet-judging-Sonnet. Mitigated for the
   Hermes cell by the trio re-judge (JUDGE-DELTA, −3.3pp). But the Waggle and Qwen cells' "self-judge"
   columns should never be the headline; trio-strict is the only fair number.

5. **Single-run pass@1, nondeterminism.** Qwen-thinking at temperature is nondeterministic; `21_1afh09`
   and `21_5bftlu` flipped between runs. No pass@k anywhere. Any matched-pair delta < ~10pp is inside the
   noise floor (the doc's own conclusion).

6. **Matched-pair denominators differ per comparison** (verified §8): Waggle-Sonnet N=39, ∩ Qwen=38,
   ∩ Hermes=37, Qwen∩Hermes=145. The headline "−16.7pp same-harness model swap" rests on N=38 — CI is wide.

7. **5-scenario error floor counted inconsistently.** Strict (83.8%) counts errors against; judged-only
   (86.5%) excludes. Both reported (good), but cross-cell comparisons must fix one convention. Trio-strict
   denominators (148, 39, 156, 157) differ from the 160 nominal — easy to misalign.

8. **Search split only.** Zero coverage of execution / adaptability / time / ambiguity / noise. GAIA 2's
   headline difficulty (Meta's own numbers) is much lower than search-only suggests; a single-split claim
   is fragile to "you cherry-picked the easy split."

9. **ARE upstream + runner patches are gitignored / off-tree.** The Windows Docker patches live only on disk
   (`WINDOWS-DOCKER-RUNNER-PATCHES.md` is the only tracked copy); a `docker prune` or `uv sync` wipes them.
   Reproducibility risk for a publication: the exact runner state isn't version-controlled.

---

## 6. Was memory ever a factor? (explicit answer)

**No — by design, in every GAIA 2 cell.**
- The runbook §"Known risks" #4 explicitly says the `qwen-thinking.ts` PromptShape "is a LoCoMo retrieval
  framework, NOT the GAIA 2 shape. Do not wire it in here — that would break fairness."
- The GOAL doc §7 non-goals: "Not a memory-substrate proof. GAIA 2 measures the harness, not hive-mind
  memory. Keep the lanes separate in every artifact."
- F1's "skill distillation gate" is the closest thing, and it is a skill-authoring/output feature, not
  memory recall — and it scored net 0pp.
- The memory-SOTA evidence is a **separate lane**: LoCoMo (C-1, 67.8-87.66% across the arc), LongMemEval
  (75.2% trio-strict N=100), BEAM (21.6% ipb). Those are in `benchmarks/` and `memory/`, not GAIA 2, and use
  different datasets/judges — they cannot be combined with GAIA 2 numbers.

---

## 7. The run shape (smoke-c2, for reproduction reference)

`benchmarks/gaia2/runs/smoke-c2-2026-04-30/` (in the MAIN repo) has two sub-runs:
- `smoke-A-oracle/` → `{output.jsonl, initial_state.jsonl, final_state.jsonl}`; oracle mode, built-in
  scenario, score 1.0.
- `smoke-B-gaia2-mock-thread/` → `{output.jsonl, benchmark_stats.json}`; `mini`/`validation` config, mock
  provider, 1 scenario × 3 runs (pass@3 default), 0% (mock returns fake) — every run failed on
  `signal.SIGALRM` (Windows). This is what forced the move to Docker.
- **Real run shape** (the N=160 cells) per `output_dir/search/scenario_universe_*/`:
  `{result.json, agent_response.txt, events.jsonl, entrypoint.log}`. `events.jsonl` is the audit trail /
  egress-proof substrate. Rejudge files are flat JSONL: `{scenario_id, self_judge, verdicts:{opus-4.7,
  gemini-2.5-pro, gpt-5.x}}`.

---

## 8. Verification log (numbers I re-derived from raw JSONL, not just quoted)

Run from `D:/Projects/waggle-os-gaia2-wt/benchmarks/gaia2/runs`, trio-strict = unanimous 3/3 PASS:

| File | Recomputed | Matches doc? |
|---|---|---|
| `rejudge-search-n160.jsonl` | 129/148 = 87.2% | ✅ (Hermes trio) |
| `rejudge-waggle-n40.jsonl` | **33/39 = 84.6%** | ✅ qwen memo / ❌ N40 memo headline (says 86.5%) |
| `rejudge-waggle-qwen36-thinking-n160.jsonl` | 106/156 = 67.9% | ✅ |
| `rejudge-waggle-qwen36-f4-shape-n160.jsonl` | 103/157 = 65.6% | ✅ |
| `rejudge-waggle-sonnet-f4-n40.jsonl` | 39/40 = 97.5% | ✅ (flagged unconfirmed) |

Matched-set overlaps (verified): Waggle-Sonnet=39; ∩Qwen=38; ∩Hermes=37; Qwen∩Hermes=145.
Judge keys identical across all three core files: `opus-4.7`, `gemini-2.5-pro`, `gpt-5.x`.

**Could NOT verify (no access / not on disk):** exact $-per-invocation reconciliation for the N=160 cells
(memos say "not reconciled"); the per-universe 82.4%/68.0% split (claimed in the FULL-vs-BARE doc, not
independently recomputed here); the Mem0 paper's actual numbers/protocol; egress=0 (no proof harness exists).

---

## 9. Net assessment for a publishable benchmark design

- **One genuinely strong, near-publishable cell exists:** Waggle harness ≈ Hermes reference on GAIA 2
  search at Sonnet 4.6 (84.6% vs 89.2% trio-strict, overlapping CIs). It needs N=160 matched + pass@k +
  gateway parity + the 86.5%/84.6% headline corrected + ≥2 splits before it survives review.
- **The Qwen ≈ premium leg is falsified** and should be reframed as an honest "sovereign-model gap is
  model-bound" finding, not buried.
- **Two of the three hypothesis legs (harness>raw, harness+memory>harness) have ZERO GAIA 2 evidence.**
  If the founder wants to claim either, new arms must be designed from scratch — and the memory arm
  collides with the GOAL doc's own "keep lanes separate" rule, so that needs a deliberate design decision.
- **The single biggest reviewer-kill risks** are: (a) the Mem0 apples-to-oranges baseline, (b) non-stratified
  prefix sampling (already burned the team once), (c) single split, (d) the self-vs-trio judge discipline
  must be airtight on every cell, not just Hermes.
