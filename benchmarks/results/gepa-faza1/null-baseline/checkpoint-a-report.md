---
report_id: 2026-04-28-gepa-faza1-checkpoint-a-v2
date: 2026-04-28
checkpoint: A v2 (post NULL-baseline re-run with shape-override fix per Amendment 6)
manifest_anchor: manifest-v7-gepa-faza1
manifest_v7_sha256_amendment_6: 0b55d8e353299594254e1a4a76f26f53014d726315dc6a0e5d6dc1a3a44a368a
predecessor_artifactual: checkpoint-a-report-artifactual-bug-superseded.md
status: PRE-REGISTRATION LOCKED — awaiting re-run completion to fill §A + §B + §D + §E + §F + §G
authority: PM (Marko Markovic)
---

# Checkpoint A v2 Halt-and-PM Report — NULL-baseline (Amendment 6 fix)

## §A — Run metadata

To be filled post re-run completion (background task `bhe0zwi91`):
- Job ID: `bhe0zwi91`
- Wall clock: TBD
- Total cost: TBD (probe target ~$5)
- Cumulative Faza 1 spend: TBD (target ~$25.13)
- Manifest v7 SHA at run time: `0b55d8e353299594254e1a4a76f26f53014d726315dc6a0e5d6dc1a3a44a368a`
- Bug fix commit: see Amendment 6 / launch decision §A.14

## §B — Per-shape results

To be filled post re-run completion. Table format:

| Shape | n | trio_strict_pass_II (≥4.0) | trio_strict_pass_I (≥2 judges ≥3.5) | mean_trio | mean_retr | mean_eval_cost | loop_exhausted | mean_steps |
|---|---|---|---|---|---|---|---|---|

Plus raw agreement matrix (per Amendment 5 §judge_metric_design — primary metric):
- Opus ↔ GPT raw agreement: TBD
- Opus ↔ MiniMax raw agreement: TBD
- GPT ↔ MiniMax raw agreement: TBD
- Min raw agreement: TBD (PASS threshold ≥65%)

Plus κ as audit reference (Cohen-1960 high-base-rate paradox annotation):
- κ_opus_gpt: TBD
- κ_opus_minimax: TBD
- κ_gpt_minimax: TBD
- κ_conservative_trio: TBD

## §B.1 — Mutation oracle invariance proof (NEW per PM brief Step 0.5)

**LOCKED PRE-RUN-OUTPUT.** Verifies cell-semantic anchors are byte-identical to Amendment 6 pinned values. The bug fix affects shape ROUTING (which shape selected at runtime via `promptShapeOverride`), NOT cell semantics (prompt-shape file contents, types.ts boundary, MULTI_STEP_ACTION_CONTRACT bytes).

### Cell-semantic anchor verification (all PASS)

| Anchor | Expected SHA-256 (Amendment 6 pin) | Actual SHA-256 (post-fix) | Match |
|---|---|---|---|
| `packages/agent/src/prompt-shapes/types.ts` (whole file) | `1a9fa329e4b66ed9f0abe8bc22cbbf0124e0c879e1e78ec806d557cab25bc94d` | `1a9fa329e4b66ed9f0abe8bc22cbbf0124e0c879e1e78ec806d557cab25bc94d` | ✅ |
| `MULTI_STEP_ACTION_CONTRACT` constant body (252 bytes) | `70a1701dfa126f8dc1df9c116f0a8469da005821ecadc59d9b8f348568e755ba` | `70a1701dfa126f8dc1df9c116f0a8469da005821ecadc59d9b8f348568e755ba` | ✅ |
| Baseline `claude.ts` | `cbaf0c37b067b025a1fe97f2feeec11fae4070a8b3fcfaad1da8775dda451cc0` | `cbaf0c37b067b025a1fe97f2feeec11fae4070a8b3fcfaad1da8775dda451cc0` | ✅ |
| Baseline `qwen-thinking.ts` | `848a4e4917baa5c7bbcc3bb35fb8cb4b4ac8f0ab537243f14cbef3a99197aacb` | `848a4e4917baa5c7bbcc3bb35fb8cb4b4ac8f0ab537243f14cbef3a99197aacb` | ✅ |
| Baseline `qwen-non-thinking.ts` | `35be379be9a8caafc2c419e32da5f63f92fc83f6f6d70d9df76029c1e8584572` | `35be379be9a8caafc2c419e32da5f63f92fc83f6f6d70d9df76029c1e8584572` | ✅ |
| Baseline `gpt.ts` | `5dc6d750d52a68feb9d37ad8384b2bcd59d70962066122ff086b0e5888413576` | `5dc6d750d52a68feb9d37ad8384b2bcd59d70962066122ff086b0e5888413576` | ✅ |
| Baseline `generic-simple.ts` | `81189817f560e26a69394248d8bd9089cae72c7d40825323e2b7407e36026172` | `81189817f560e26a69394248d8bd9089cae72c7d40825323e2b7407e36026172` | ✅ |

### Mutation candidate file SHAs (10 candidates from $1.43 oracle run, audit chain pin)

| File | SHA-256 | Bytes |
|---|---|---|
| `claude-gen1-v1.ts` | `8681125b6e2c5c5176392fe0be4dfdb4c7712dda5de0bbf2e8ccb0a8ed88073e` | 6611 |
| `claude-gen1-v2.ts` | `763f48378ccef15b3eca154683c5b7402b92ba6b3f190f70aed88cf5d44639e7` | 6392 |
| `qwen-thinking-gen1-v1.ts` | `6e98703986b033e424c901bad2fc3d39dca6c5ecbc5915977ee2703798259131` | 4976 |
| `qwen-thinking-gen1-v2.ts` | `4356d2f529e2dd7829f389ade08f9f761623f24933b24f3b8c239ca9abba358e` | 4501 |
| `qwen-non-thinking-gen1-v1.ts` | `09fcc4c07fa046c1c9289b1180403d42c19ad2a1d38787a028e9c3723704ef72` | 4656 |
| `qwen-non-thinking-gen1-v2.ts` | `47a9bdfe8d110183b80f0b4180d18581369ec2101a85af22abe9c23afc5615cb` | 5213 |
| `gpt-gen1-v1.ts` | `f101747d1da7c29d1bdff20bfcb226ab08a723a8c9163b6003c8f12733b6222e` | 3412 |
| `gpt-gen1-v2.ts` | `b8f3a613e94bc42997c437c8f1a931f348b79aaf9a1ba3d44390d2dd33c5f733` | 4113 |
| `generic-simple-gen1-v1.ts` | `c7f95bfecba04c38ad8d8b6667fe7b421fabbdabc6058016cc22500a195b8f23` | 3871 |
| `generic-simple-gen1-v2.ts` | `cb2a94e2f73f2b345b039e00221a09c7d06181d167d8847fa874dfbc858f91cb` | 4765 |

### Invariance verdict

**PASS.** All cell-semantic anchor SHAs (types.ts whole file, MULTI_STEP_ACTION_CONTRACT bytes, 5 baseline shape files) byte-identical to Amendment 6 pinned values. Mutation candidate files exist + are byte-stable (oracle-generated, then SHA-pinned).

The bug fix is exclusively a shape-routing change at runtime: previously `selectShape(modelAlias)` resolved to the model-default shape regardless of intended evaluation; post-fix `selectShape(modelAlias, {override: shape.name})` honors the per-evaluation shape parameter. No cell-semantic file changed; no shape-content mutation.

This makes the per-shape comparison interpretation in §B (post re-run) load-bearing exclusively on routing-correctness, not on file mutation. Mutation oracle outputs from $1.43 run carry forward into Gen 1 unchanged.

## §C — Pre-registered threshold band classification (LOCKED PRE-RUN-OUTPUT)

Per PM brief: thresholds locked HERE before reading re-run results to prevent post-hoc rationalization.

### EXPECTED band

Re-run lands in EXPECTED band if EITHER:

1. **Per-shape NULL pass rate within ±15pp of artifactual run**, treating each shape as approximately the same single-shape variance estimate plus shape-specific signal — i.e. real per-shape rates lie in:
   - claude: [35%, 65%] (artifactual 50% ± 15pp)
   - qwen-thinking: [85%, 100%] (artifactual 100%, capped above)
   - qwen-non-thinking: [60%, 90%] (artifactual 75% ± 15pp)
   - gpt: [73%, 100%] (artifactual 87.5% ± 15pp; capped)
   - generic-simple: [73%, 100%] (artifactual 87.5% ± 15pp; capped)

2. **OR uniformly higher/lower by ≤25pp across all shapes** (consistent with "shape override was missing → all shapes collapsed to default → fix exposes real shape variance"). I.e., if ALL 5 shapes shift by approximately the same delta in the same direction (e.g., all drop 15-20pp).

### ANOMALOUS band (HALT — file as INVESTIGATE, not PASS)

Re-run lands in ANOMALOUS band if ANY:

1. Any per-shape pass rate delta > 30pp vs artifactual (single-shape outlier)
2. Sign flip on > 2 shapes (e.g., shapes that passed artifactually now fail or vice versa, more than 2 such reversals)
3. Raw agreement collapse > 20pp (e.g., min raw agreement drops from 70% artifactual to <50% real — would suggest judge ensemble breakdown coincident with bug fix, requiring investigation)

### Anomaly action protocol

If ANOMALOUS:
- §F verdict = INVESTIGATE (not PASS, not GO)
- Author hypothesis tree (what other variables changed besides shape override)
- Do NOT proceed to §D (§F-saturated re-evaluation)
- Do NOT proceed to §E (Pre-Gen-1 cost re-projection beyond noting it)
- HALT pending PM ratify on investigation path

If EXPECTED:
- §F verdict = GO (Gen 1 kick auth requested)
- Proceed normally through §D, §E, §F

## §D — §F-saturated rule re-evaluation (per-shape table) — TBD post run

Per PM brief: render per-shape table with columns shape | NULL pass rate | N=8 binomial 95% CI lower bound | ≥0.88 threshold met (Y/N) | §F policy applied (re-instate / revoke).

Decision policy (pre-registered):
- All shapes ≥0.88 lower CI → re-instate §F-saturated globally
- All shapes <0.88 lower CI → revoke §F-saturated, apply original §F.1 (≥+5pp delta) to all
- Mixed → per-shape policy (§F-saturated for qualifying, §F.1 for rest); pre-authorized, no extra ratification needed

| Shape | Real NULL pass rate | N=8 binomial 95% CI lower bound | ≥0.88 met? | §F policy applied |
|---|---|---|---|---|
| claude | TBD | TBD | TBD | TBD |
| qwen-thinking | TBD | TBD | TBD | TBD |
| qwen-non-thinking | TBD | TBD | TBD | TBD |
| gpt | TBD | TBD | TBD | TBD |
| generic-simple | TBD | TBD | TBD | TBD |

## §E — Cost re-projection with sensitivity check — TBD post run

Per PM brief: confirm Pre-Gen-1 projection ($14.86 from artifactual data) holds with new per-call cost. If new per-call cost > 20% higher than projected, surface revised Gen 1 estimate.

| Item | Artifactual (sunk) | Real (post-fix) | Delta |
|---|---|---|---|
| Mean cost per eval | $0.124 | TBD | TBD |
| Pre-Gen-1 projection (5×3×8 × per-eval) | $14.86 | TBD | TBD |
| Sensitivity: > 20% higher than $14.86? | n/a | TBD | TBD |

If TBD > $17.83 (20% over $14.86): surface revised Gen 1 estimate before HALT.

## §F — Recommended next action — TBD post run

Decision tree:
- §C verdict = EXPECTED + §B raw agreement min ≥ 65% + §D table coherent + §E projection within 20% → **Gen 1 GO** (await PM ratify per Halt criteria)
- §C verdict = ANOMALOUS → **INVESTIGATE** (hypothesis tree below; no Gen 1)
- Other partial signals → call out specific concern + ask PM

## §G — Open questions for PM — TBD post run

To be filled with any items requiring explicit PM ratify beyond the standard "Gen 1 kick auth" ask.

---

## HALT criteria (no Gen 1 kick without all four — PM brief)

1. ✅ Checkpoint A v2 report committed (this file, will be updated post-run-completion)
2. ✅ Mutation oracle invariance proof committed (§B.1 above, LOCKED PRE-RUN-OUTPUT)
3. ⏳ Per-shape §F decision table committed (§D, post run)
4. ⏳ PM (Marko) ratifies in writing

---

**Standing by for re-run (`bhe0zwi91`) completion. Will fill §A + §B + §D + §E + §F + §G with real data when notification arrives.**

**90-min wall-clock flag:** if re-run exceeds 90 min from start (~10:55Z, so flag at ~12:25Z), surface as anomaly per PM brief standing-by behavior.
