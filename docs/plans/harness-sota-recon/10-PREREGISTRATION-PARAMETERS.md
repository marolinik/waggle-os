# Pre-Registration Parameter Sheet — Harness-SOTA Benchmark

**Date:** 2026-06-16 · **Status:** DRAFT for founder ratification → then OSF pre-registration + manifest freeze.
**Purpose:** Pin every decision the design/plans left open, BEFORE any priced run. Source of truth for the OSF
pre-registration and the harness manifest (`preregistration.ts` hash anchor). Consumes `01`–`03` + plans `04`–`09`.

**Status legend per parameter:**
- **[REC]** — recommended value, ratify as-is unless you disagree.
- **[CONFIRM]** — recommended, but a real-world fact that MUST be verified before freeze (fictional-timeline model
  facts, external licenses, published reference numbers).
- **[PILOT]** — pin a starting value now; finalize from the ruler/smoke pilot before the priced run.

> Founder ratification = check each section. Anything you change, I update here; then we freeze at a git SHA and emit
> the manifest hash. **No parameter may change after freeze** (deviation ⇒ halt-and-restart, per `03`/manifest §10).

---

## 1. Hypotheses (restated, with primary/secondary split)

| ID | Claim | Type | Tier |
|---|---|---|---|
| **H1** | `Waggle-harness(M) > raw(M)` (fixed model) | superiority, 1-sided | confirmatory |
| **H2** | `harness+memory(M) > harness(M)` — **efficiency** primary, accuracy secondary | superiority/non-inferiority | confirmatory |
| **H3** | `Qwen+stack ≈ Opus+stack` — **efficiency + pass^k** primary; accuracy-TOST(±5pp) secondary, divergent cells only | equivalence | confirmatory (efficiency) / secondary (accuracy) |
| H3′ | same for GPT-5.5, Gemini ceilings | equivalence | secondary |
| H-supp | `Qwen+stack > {Opus,GPT,Gemini} raw` (B>C) | superiority | supporting row |
| H4 | `Waggle+memory > {Claude Code, Hermes, OpenClaw}` (iso-model) | superiority | **Phase 2** |

**Headline framing (locked v2, `03` A2):** efficiency + reliability-led; accuracy-equivalence only where raw models
diverge and headroom exists. Never "small beats frontier raw" as the lead; never LoCoMo as headline.

---

## 2. Models & the arm matrix

### 2.1 Subject (Step 1)
| Param | Value | Status |
|---|---|---|
| Subject model | **Qwen3.6-35B-A3B** (35B total / 3B active MoE, Apache-2.0) | [REC] |
| Serving route | **local vLLM, pinned weight hash** (headline) — `vllm serve Qwen/Qwen3.6-35B-A3B`; DashScope-intl-direct as secondary | [REC] (`03` E1) |
| NEVER use | the `-via-openrouter` alias (silently serves Qwen **3.5**) | [REC] |
| Price (cost accounting) | $0.20 / $0.80 per M (in/out) | [CONFIRM] |
| Public framing | "35B-A3B (**3B active** — ~3B-dense compute footprint)" — never "27B" | [REC] |

### 2.2 Frontier baselines (Step 1)
| Model | API id | Price in/out $/M | Ctx | Status |
|---|---|---|---|---|
| Claude **Opus 4.8** | `claude-opus-4-8` (anthropic_immutable) | 5 / 25 | 1M | [CONFIRM] price/id vs Anthropic docs |
| **GPT-5.5** | `gpt-5.5` (snapshot `gpt-5.5-2026-04-23`) | 5 / 30 (0.50 cached) | [CONFIRM ctx] | [CONFIRM] id/snapshot/price |
| **Gemini 3.5 Pro** | `gemini-3.5-pro-preview` → **fallback `gemini-3.1-pro`** until GA | ~2-4 / 12-18 | — | [CONFIRM] GA id + price |

Decoding: Opus 4.8 = adaptive-thinking only (rejects temperature; set `effort` — see §5.3); GPT-5.5 = `reasoning_effort`
(pin per §5.3); Qwen = temperature-controllable (pin per §5.3).

### 2.3 Step-2 OSS roster (deferred — Phase 3 generalization)
gpt-oss-120b (Apache), DeepSeek V3.x (MIT), gpt-oss-20b (laptop-floor). Add when the Step-1 result lands. [REC]

### 2.4 The arm matrix (per substrate; `01` §3 / `03`)
A = Opus+harness+memory · B = **Qwen+harness+memory (protagonist)** · C = Opus raw · D = Qwen raw · E = Opus native
agentic mode. Plus B′/A′ = GPT-5.5 / Gemini in arms B/A-style. **Arm-A neutrality check** (`03` D5): pre-register that the
harness/prompt-assembler/tool-pool were NOT tuned per-model; verify arm A ≥ arm E on ≥1 cell, else report arm E
co-primary for the Opus ceiling. [REC]

---

## 3. Substrates, splits, divergence gate

| Param | Value | Status |
|---|---|---|
| Primary substrate | **τ²-bench** (Sierra) — native `pass^k`, local OSS, no Docker | [REC] |
| τ² domains | **retail + airline**; **DROP telecom** (saturated ~99%, non-discriminative) | [REC] (`03` A1) |
| τ² commit pin | from `vendor.sh` probe (Plan 07) → paste into `TAU2_PINNED_COMMIT` | [CONFIRM] SHA |
| τ² license | verify `sierra-research/tau2-bench` SPDX before redistribution | [CONFIRM] |
| Secondary substrate | **GAIA2 / ARE**, ≥2 splits: **search + adaptability** (adaptability rewards re-planning) | [REC] |
| Credibility arm (optional) | SWE-bench Verified slice (N≈100) or SWE-bench-Pro-private for contamination | [REC] |
| **Headline model-comparison** | runs on the **native unmodified distribution** (`03` D1); the continual protocol is the **memory mechanism** demo | [REC] |
| **Divergence gate** | run accuracy-TOST ONLY on cells where raw `A−D` (or `C−D`) gap ≥ **2δ = 10pp**; exclude saturated cells; report **headroom (1−ceiling)** per cell | [REC] (`03` A1) |
| Falsifiable prediction | "if convergence holds on the frozen-mind cell but the gap REOPENS on the native distribution, the convergence is protocol-induced — we report that" | [REC] (`03` D1) |

---

## 4. Continual-memory protocol parameters (`02` + `03`)

| Param | Value | Status |
|---|---|---|
| Experience-stream size `N_exp` | **200** tasks/domain (gate: must populate the mind to the §4-minimums below) | [PILOT] |
| Held-out test size `N_test` | **see §6.1** (powered N; pooled target ≈ **1500** across substrates) | [PILOT] |
| `testFraction` / `phaseBRandomFraction` | 0.5 / 0.15 of the pooled task pool | [REC] |
| A/B split rule | **mechanical** difficulty-stratified partition, **SHA-frozen** (no hand-curation); report A-vs-B raw-model-pass-rate distributions (must match) | [REC] (`03` B6) |
| Cluster unit (the stat cluster id) | **procedure-family-id** (primary); recurring-user-id where M4 dominates | [REC] (`03` B2) |
| Mode-1 (shared frozen mind) builder | **deterministic non-LLM extraction** of M2 facts + M4 personalization; **EXCLUDE LLM-authored M1 skill prose from the Mode-1 mind** (cleanest substrate≫subject isolation; sidesteps the builder-neutrality confound `03` C3) | [REC] |
| Independently-seeded minds | **≥3** (mind-id as a crossed random factor; a single mind is N=1 at the substrate level) | [REC] (`03` B2) |
| Mode-2 (self-built mind) | **co-primary** for the product claim; report the residual honestly (the Ensue move) | [REC] (`03` D2) |
| Transfer mechanisms | M1 skills / M2 facts / M3 corrections / M4 personalization + the M1–M4 attribution ablation (attribution only, NOT a leakage defense, `03` C6) | [REC] |
| Divergence-stress cell | Phase-B tasks with **partial/ambiguous** recall; per-task label "answer mechanically present" vs "novel composition"; lead convergence on the novel-composition subset | [REC] (`03` D3) |
| Negative-control family | LOW structure-overlap tasks where the design **predicts no lift** — lift there ⇒ split leaks ⇒ result void | [REC] (`03` C7) |
| Mind-population minimums (Phase-A gate) | ≥ **30** skills, **100** facts, **20** corrections, **10** recurring users before Phase B | [PILOT] |

---

## 5. Metrics & endpoints

### 5.1 Primary (the headline)
- **Efficiency:** tokens/task & turns/task & tool-calls/task — **TOTAL incl. recall + injection-scan + embedding**
  (memory tax counted against itself). Direction + min effect: **≥20% token reduction at non-inferior accuracy**. [REC] (`03` B3)
- **Reliability:** **pass^k** (native τ²). [REC]
- $/task & wall-clock = **descriptive only** (infra-dependent; tokens/turns are the comparable metric). [REC]

### 5.2 Secondary (supporting)
- **Accuracy** (task-completion oracle: τ² DB-state / GAIA2 oracle events / AppWorld unit tests — NOT substring).
  Accuracy-equivalence (TOST) on divergent cells only, on the **re-derivable subset** only. [REC]

### 5.3 pass^k & decoding
| Param | Value | Status |
|---|---|---|
| `k` | **4** (τ² leaderboard reports pass^1..4) | [REC] |
| Trial stochasticity | Qwen: **temperature 0.7**; Opus 4.8 / GPT-5.5 (no temp): use native sampling at a **fixed reasoning effort** (§ below) — report **observed inter-trial trajectory diversity for BOTH arms** so reliability isn't "won" by variance collapse | [REC] (`03` B5) |
| Reasoning/thinking effort | pin a single level per model (Opus `effort=high`, GPT-5.5 `reasoning_effort=medium`, Qwen thinking=on) **AND sweep it** (publish the curve — HAL: more effort often hurts) | [REC] (`03` D5) |
| Turn/latency budget | **maxTurns = 30** (pinned constant) + a **sensitivity run at maxTurns = 20** | [PILOT] (`03` B3) |

---

## 6. Statistics

### 6.1 Powered sample size (the binding constraint — `03` B1, computed via Plan-04 `computeTostSampleSizePaired`)
Formula: `N = ceil( ((z₀.₉₅ + z_power)·sdDiff / (δ − |gap|))² ) × DEFF`, with `z₀.₉₅=1.645`, `z₀.₈₀=0.842`,
`sdDiff ≈ √discordance` for paired pass/fail.

Planning: **δ = 0.05, gap = 0.01, power = 0.80, DEFF ≈ 2.4** (ICC 0.1, mean cluster size 15). N at varying discordance:

| discordance | sdDiff | N (unclustered) | **N × DEFF** |
|---|---|---|---|
| 0.15 | 0.387 | 579 | **~1,390** |
| 0.25 | 0.500 | 966 | **~2,320** |
| 0.35 | 0.592 | 1,354 | **~3,250** |

**Implication & rule:** a *binary* accuracy-TOST verdict at δ=±5pp needs ~1,400–3,250 paired items — likely beyond a
single substrate (τ² ~360 after dropping telecom; GAIA2 ~400/2 splits). Therefore:
- **Target a POOLED `N_test` ≈ 1,500** across τ² + GAIA2 (+ optional AppWorld) for the binary δ=±5pp TOST. [PILOT]
- Per-cell where N < powered: report the **descriptive 90% paired-difference CI with the ±δ band drawn (NO binary
  verdict)** — the pre-registered downgrade. [REC] (`03` B1)
- **Lead with efficiency + pass^k** — superiority/non-inferiority there is detectable at **N ≈ 150–300/cell**, so the
  headline does not depend on the huge accuracy-equivalence N. [REC]
- **Pilot-measure discordance + ICC** in the ruler/smoke phase (Plan 09) → recompute N → finalize in the manifest.

### 6.2 Tests
| Endpoint | Test | Status |
|---|---|---|
| H1/H2 superiority | paired, **cluster-bootstrap** CI (Plan 04) + **McNemar (mid-p)** on paired pass/fail, 1-sided | [REC] |
| H3 equivalence | **TOST** — 90% CI of paired diff ⊆ [−δ,+δ] (Plan 04 `tostEquivalence`) | [REC] |
| δ (margin) | **±5pp primary, ±3pp secondary** (decision-relevance: gap at which a buyer would pay for premium) | [REC] |
| CI engine | paired cluster-bootstrap, n_bootstrap 10,000, seed 42 | [REC] |
| Small N (<~300 clusters) | Wilson / Bayesian, not CLT | [REC] (`03` minor) |

### 6.3 Multiplicity — the EXACT confirmatory family (Holm); everything else BH/FDR
Confirmatory (Holm across these): **(1)** H2 efficiency-lift on τ²; **(2)** H2 efficiency-lift on GAIA2; **(3)** H3
Qwen-vs-Opus efficiency+pass^k non-inferiority on pooled divergent cells; **(4)** H1 harness>raw on τ². Exploratory
(BH): per-domain cells, δ=±3pp, GPT-5.5/Gemini TOSTs, per-cell accuracy-TOST, M1–M4 attribution. Per-substrate
consistency = a pre-registered robustness rule ("lift positive in ≥k of m cells"), not per-cell tests. [REC] (`03` B4)

---

## 7. Judge (Panel-of-LLM-judges)
| Param | Value | Status |
|---|---|---|
| Roster | 3 disjoint vendors: **Opus 4.x + GPT-5.x + Gemini 3.x**; **Grok** tie-break (1-1-1); PM-escalate→skip (1-1-1-1) | [REC] |
| Self-family rule | the subject's own family NEVER (solely) judges its outputs (when Opus is subject, exclude/outvote Anthropic) | [REC] |
| Aggregation | report **majority AND trio-strict (AND-of-3)**; **lead with trio-strict** | [REC] |
| κ gate | Fleiss κ on pre-tie-break matrix: PASS ≥0.65, flag 0.60–0.65, HALT ≤0.60 | [REC] |
| Human anchor | dual-coded **300 items** (a 50–100 sample's agreement-CI is wider than ±3pp and cannot certify the margin) | [REC] (`03` E10) |
| Judge decoding | T=0 (or omitted for temp-rejecting judges); position-swap + length-control if any pairwise judging | [REC] |

---

## 8. Leakage-firewall thresholds (Plan 06 / `03` C)
| Param | Value | Status |
|---|---|---|
| Gold-substring gate | exact + normalized (lowercase/NFKC/whitespace+punct-fold), over **ALL** artifacts incl. **skill bodies**, write-back, identity, user turns | [REC] |
| Embedding near-dup cutoff | **cosine ≥ 0.85** (local MiniLM) flags+excludes a headline task; **calibrate on the negative-control + near-dup-control sets during smoke**, then pin the calibrated value | [PILOT] (`03` C5) |
| Goal-overlap (n-gram) | flag any Phase-B gold sharing an **8-gram** with a Phase-A artifact; report distribution | [REC] |
| Re-derivability gate | per-task: memory-OFF probe at **4× budget**; only tasks unbounded-OFF solves enter the **accuracy** headline; exclude+count the rest | [REC] (`03` C2) |
| Mind freeze | read-only in Phase B; **hash the DB + reranker ONNX + embedder weights**, recorded per row | [REC] (`03` E2) |
| Audit | every assertion's pass/fail emitted to `events.jsonl` per row; assertions **implemented + code-frozen at a SHA before pre-registration** | [REC] (`03` C8) |
| min gold length | ignore golds < **12 chars** in substring gate (avoid trivial-token false flags) | [PILOT] |

---

## 9. Pre-registration & reproducibility process
- **OSF/AsPredicted registration BEFORE the priced run**; this sheet (frozen) is the content. [REC]
- **Code frozen at a git SHA**; emit the manifest hash (`preregistration.ts`). [REC]
- **No interim looks**; halt only on budget/streak/health/lock/deviation. [REC]
- **Post-hoc exclusion = NONE**; `evaluator_loss` reported separately; the re-derivability/near-dup exclusions are
  **pre-registered ex-ante gates** (not post-hoc). [REC]
- **Decontamination:** held-out/private/recent splits; **Qwen contamination probe** (training cutoff vs bench release). [REC]
- **Ruler-validation (Plan 09):** reproduce a published τ²/SWE number within tolerance before claiming any delta —
  reference value + tolerance: **τ²-retail ≈ [CONFIRM] ± 1pp** (pin from the Sierra leaderboard for the exact
  pinned commit). FAIL ⇒ block the priced run. [CONFIRM]
- **Cost denominator** includes ingestion + any best-of-N; report the **measured** ratio, never "~1/N". [REC]
- **Artifacts released:** seeds, prompts, judge configs, raw `events.jsonl`, offline re-judge harness, aggregation code;
  report N (items AND clusters) per cell. [REC]

---

## 10. Budget
Open (founder). Estimates: memory-efficient OSS arms local ≈ $0 agent-side; Opus on the agentic grid is the driver
(~$1/scenario). Keep the existing **per-track $50 halt guards** as safety rails even with no cap. Pilot first, then the
full priced run. [REC]

---

## 11. CONFIRM-BEFORE-FREEZE checklist (the real-world facts to verify)
1. ☐ Opus 4.8 id `claude-opus-4-8` + $5/$25 + 1M ctx (Anthropic docs / `claude-api` skill).
2. ☐ GPT-5.5 id + snapshot `gpt-5.5-2026-04-23` + $5/$30 + ctx window (OpenAI docs).
3. ☐ Gemini 3.5 Pro GA id + price (else keep `gemini-3.1-pro` fallback + disclose).
4. ☐ τ²-bench license (redistribution) + the exact commit SHA to pin.
5. ☐ Published τ²/SWE reference numbers + tolerance for ruler-validation.
6. ☐ Pilot-measured discordance + ICC → recompute powered `N_test` (§6.1).
7. ☐ Embedding near-dup cutoff calibrated on control sets (§8).
8. ☐ Firewall assertions implemented (Plan 06) + green + code-frozen at a SHA.
9. ☐ Decision: AppWorld credibility arm in Phase 1, yes/no.
10. ☐ Decision: δ=±3pp pursued (needs the larger pooled N) or ±5pp only for the binary verdict.

---

## 12. One-line summary
Lead with **efficiency + pass^k** (saturation/leakage-immune, small N); run **accuracy-TOST at ±5pp** only on
**divergent, non-saturated, re-derivable** cells, pooled to a powered N (~1,500) or downgraded to a descriptive paired-CI;
isolate the model with a **non-LLM-built shared frozen mind** (skills excluded from Mode-1); judge with a **3-vendor jury
(no self-family)**; gate everything behind a **pre-registered, SHA-frozen, OSF-registered** manifest with an enforced
leakage firewall and a ruler-validation pass.
