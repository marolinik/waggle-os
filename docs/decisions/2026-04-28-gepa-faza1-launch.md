---
decision_id: 2026-04-28-gepa-faza1-launch
date: 2026-04-28
authority: PM (Marko Markovic) — RATIFIED via Amendment 1
session: CC-2 (filename retains cc4 historical naming; CC-2 is operational executor)
mission: GEPA Tier 2 Prompt-Shapes Evolution Faza 1 (proof-of-concept pilot)
status: LOCKED upon authoring
chain:
  - briefs/2026-04-28-cc4-gepa-tier2-evolution-faza1-brief.md (PM brief, 266 lines)
  - briefs/2026-04-28-cc4-faza1-preflight-report.md (CC-2 pre-flight, 239 lines)
  - briefs/2026-04-28-cc4-faza1-amendment-1.md (PM Amendment 1, 252 lines)
  - briefs/2026-04-28-cc4-faza1-amendment-2.md (PM Amendment 2 — Phase 4.5 retrieval-engagement signal)
  - "PM Amendment 3 (oral ratification embedded in CC-2 session 2026-04-28T00:45:00Z) — cost cap raise + Pre-Gen-1 re-projection rule"
  - "PM Amendment 4 (oral ratification embedded in CC-2 session 2026-04-28T01:00:00Z) — Option B retry of 3 failed cells via JSON-mode + binding texture-audit caveat"
  - "PM Amendment 5 (oral ratification at Checkpoint A 2026-04-28T11:00:00Z) — judge metric parallel-report (raw agreement primary) + F-saturated-baseline rule [PARTIALLY REVOKED by Amendment 6: F-saturated rule PAUSED pending real NULL data]"
  - "PM Amendment 6 (oral ratification post Checkpoint A bug discovery 2026-04-28T15:30:00Z) — NULL-baseline shape-override bug fix + re-run authorization + reversal of original Checkpoint A per-shape findings (artifactual)"
  - decisions/2026-04-28-phase-4-3-rescore-delta-report.md (Phase 4.3 verdict — GEPA motivation; Amendment 6 REVOKED prior PM-clarification-note proposal)
  - decisions/2026-04-28-phase-4-5-tools-audit-results.md (Phase 4.5 — Amendment 2 trigger)
manifest: benchmarks/preregistration/manifest-v7-gepa-faza1.yaml (in waggle-os-faza1-wt; 5 SHA pins in §B for initial LOCK + Amendments 2/3/4/5)
substrate: feature/c3-v3-wrapper @ c9bda3d (Phase 4.7) via isolated git worktree
cost_cap: $115 hard / $90 internal halt / $109.08 expected (raised from $100/$80/$100.50 by Amendment 3 — inherited estimate correction, not scope creep)
expected_wall_clock: 3-5 days CC time, 2-3 days wall-clock (no rate-limit blockers)
verdict: LOCKED (no further halts beyond 4 mandatory checkpoints unless sub-rule trigger fires)
---

# Faza 1 Launch Decision — LOCK

This decision LOCKS Faza 1 scope, methodology, cost ceiling, and acceptance criteria. All Faza 1 work executes against this LOCK + manifest v7 audit chain. Deviation from §A inherited rules, §B audit chain, §C substrate anchor, §D cost discipline, §E checkpoint protocol, or §F acceptance criteria triggers immediate halt-and-PM per brief §10 deviation policy (inherited from manifest v6).

The contents of this decision are self-contained binding contract — Faza 1 audit references that would have cited an external `feedback_config_inheritance_audit.md` instead cite "**Faza 1 launch decision §A**" per Amendment 1 Ask E alternative resolution.

---

## §A — Inherited Pre-flight Rules (binding for entire Faza 1)

The 8 sub-rules below are PM's brief §6.1-§6.8 verbatim. Each sub-rule has a binding-checklist line for CC-2 operational compliance. Sub-rule violation triggers halt-and-PM per brief §5 halt protocol.

### A.1 — Config inheritance audit (brief §6.1 verbatim)

> Eksplicitno specify Qwen + Opus + GPT + MiniMax model strings + reasoning_effort + max_tokens u manifest v7. Ne nasleduj iz manifest v6 implicitly. Naročito: Qwen reasoning mode (thinking vs non-thinking) MUST match per-shape configuration (qwen-thinking shape → reasoning enabled, qwen-non-thinking → disabled).

**Binding compliance:** Manifest v7 §judges + §subject blocks declare model strings + max_tokens + thinking flags explicitly with `inherited_from: pilot_2026_04_26_runner_sha256_8a6251e2_line_626`. Per-shape thinking flag enforcement is via existing `prompt-shapes/{qwen-thinking,qwen-non-thinking}.ts` baselines (verified at substrate anchor SHA per §B).

### A.2 — Mixed-methodology baseline (brief §6.2 verbatim)

> NULL-baseline mora prijavljivati trio-strict + self-judge razdvojeno (ne shared aggregate). Phase 4.3 koristi trio-strict; pisanje "GEPA delta" mora citirati trio-strict numbers, ne self-judge.

**Binding compliance:** All Faza 1 reports — Pre-A through Checkpoint C — report trio-strict + self-judge as separate columns. Acceptance §F applies to trio-strict only. Self-judge is supplementary diagnostic.

### A.3 — Scope verification (brief §6.3 verbatim)

> Pre run, CC-4 verifikuje da H3 cell ima ≥40 instanci u source corpus (potrebno za 8 NULL + 24 GEPA + 5 held-out = 37 instances + buffer). Ako H3 ima <40 instanci, halt-and-PM (signal da scope estimate pogrešan).

**Binding compliance:** Per Amendment 1 Ask A Option C, H3 source corpus = 50 net-new NorthLane CFO synthesis instances (corpus_design.total_instances=50 in manifest v7 §corpus_design). This satisfies ≥40 with comfortable margin (8 NULL + 24 Gen 1 + 5 held-out + 13 buffer). **Pre-A halt-and-PM verifies corpus existence + spot-audit before NULL-baseline kick.**

### A.4 — Cell semantics prompt strictness preservation (brief §6.4 verbatim)

> Audit step pre commit Faza 1 results: za svaki GEPA candidate prompt, diff vs baseline. Diff mora biti samo unutar prompt-shape template body (between defined boundaries u shape file). Diff koji touch-uje cell.system_prompt ili cell.scoring_rubric = automatic INVALID, candidate dropped, mutation oracle re-prompted.

**Binding compliance:** Manifest v7 §gepa.mutation_validator specifies allowed/invalid diff targets. Boundary anchor = `MULTI_STEP_ACTION_CONTRACT` constant in `packages/agent/src/prompt-shapes/types.ts` (byte-level SHA pinned in §B). Validator runs as automated check before any GEPA candidate enters evaluation queue. INVALID candidate triggers oracle re-prompt; 2 consecutive INVALID per shape triggers halt (brief §5).

### A.5 — σ-aware acceptance range (brief §6.5 verbatim)

> N=8 per cell daje cca CI ± 17pp at 95% (binomial), što je široko. **+5pp acceptance threshold je ne-statistički-rigorozan na N=8** — uzima se kao **fitness signal indicator**, ne kao publishable claim. To je razlog zašto Faza 1 = proof-of-concept, ne paper-ready evidence. Faza 2 scale-up je tek tu za publishable σ-bounded delta.

**Binding compliance:** All Faza 1 reports include σ-aware acceptance disclaimer verbatim. Manifest v7 §faza_1_acceptance.condition_1_updated.signal_disclaimer encodes this. Public-facing language post-Faza-1 is "fitness signal indicator", never "statistically significant".

### A.6 — Mixed-methodology variant (brief §6.6 verbatim)

> Trio-strict je primary; self-judge je supplementary diagnostic only. Faza 1 acceptance rule (§4) bazira se na trio-strict, ne self-judge.

**Binding compliance:** §F acceptance criteria conditions all reference trio-strict. Self-judge appears only in supplementary diagnostic columns, never in PASS/FAIL determination.

### A.7 — Cost super-linear input growth (brief §6.7 verbatim)

> GEPA candidates have variable token length (mutations may grow prompts). Cost calculation must use **worst-case 1.5× baseline token count** per candidate (encodes mutation overhead). If actual mid-run cost exceeds projection by >30%, halt.

**Binding compliance:** Manifest v7 §cost_governance.super_linear_buffer encodes 1.5× projection multiplier + 30% mid-run halt threshold + every-20-evaluations audit frequency. Pre-A through Checkpoint C reports include cost-projection-vs-actual delta tracking.

### A.8 — Source data structure (brief §6.8 verbatim)

> Verify H3 source data is **agentic knowledge work format** (not factoid LoCoMo). Phase 4.3 categorization confirms H3 = agentic. CC-4 spot-check 3 random H3 instances pre run, confirm task structure matches pilot 2026-04-26 corpus.

**Binding compliance:** Pre-flight report §3.8 verified pilot artifact format = agentic synthesis (NorthLane CFO 6-document knowledge work, not LoCoMo factoid Q&A). Amendment 1 Ask A Option C corpus extends this format via task families F1-F5 (manifest v7 §corpus_design). Pre-A spot-audit (5 random instances) verifies new corpus matches the pattern. Note: Pre-A audit is 5 instances rather than 3 per brief §6.8 minimum — buffer for 50-instance scale.

### A.9 — Phase 4.5 retrieval-engagement signal (Amendment 2 binding addition)

> Pilot empirical signal: Qwen retrieves 1.33×/task vs Opus 2.33×/task on byte-identical MULTI_STEP_ACTION_CONTRACT surface (your `70a1701d...` hash); H4 score gap mechanistically traces to under-engagement, NOT tool format. GEPA fitness for Qwen-targeted shapes weights retrieval-engagement bonus per Amendment 2 §3; mutation oracle for Qwen-shapes emphasizes anti-premature-finalization scaffolding per Amendment 2 §4.

**Binding compliance:**

1. **Per-shape fitness function fork** (manifest v7 §metric_operationalization.per_shape_fitness_formula): Qwen-targeted shapes (qwen-thinking, qwen-non-thinking) compute `fitness = trio_strict_pass_rate + retrieval_engagement_bonus − cost_penalty`; non-Qwen shapes (claude, gpt, generic-simple) compute `fitness = trio_strict_pass_rate − cost_penalty` (no retrieval engagement weighting — these shapes don't have the gap).

2. **Retrieval engagement bonus bands** (manifest v7 §metric_operationalization.retrieval_engagement_bonus.bands):
   - `+0.05` (5pp) if mean retrieval_calls per task `≥ 2.0` (Opus parity proxy)
   - `0.00` if mean retrieval_calls per task in `[1.5, 2.0)`
   - `−0.05` (5pp) if mean retrieval_calls per task `< 1.5` (Qwen baseline behavior penalty)

3. **Mutation oracle fork** (manifest v7 §mutation_oracle_design): two prompt template paths — `mutation-prompt-template-qwen.md` (anti-premature-finalization scaffolding) and `mutation-prompt-template-non-qwen.md` (standard guidance). Forking is by shape class string match (qwen-thinking, qwen-non-thinking → Qwen branch; claude, gpt, generic-simple → non-Qwen branch).

4. **Acceptance criteria update — see §F condition 1 (third update) + §F.5 (NEW FAIL).**

5. **Telemetry source:** `retrieval_calls` counter is existing agent harness telemetry (per pilot 2026-04-26 trace data) — no new API calls; fitness function reads existing telemetry.

6. **Test coverage requirements** (manifest v7 §amendment_2_integration.scaffold_test_coverage_NEW_requirements): 5 retrieval_engagement boundary tests (1.49/1.50/1.99/2.00/2.50) + 5 shape-routing tests (claude/gpt/generic-simple excluded; qwen-thinking/qwen-non-thinking included) + §4.5 FAIL test + §4.5 PASS-path test. ≥80% coverage on per-shape fitness function module.

7. **Phase 5 forward record (NOT Faza 1):** CC-2 must NOT optimize Faza 1 selection for Phase 5 GEPA-evolved variant criteria (engagement parity ≥ Opus + score parity narrowed by ≥0.30 H4 trio_mean delta). Faza 1 selection per §F only.

### A.10 — Pre-phase-boundary cost re-projection (Amendment 3 binding rule)

> After NULL-baseline run completes (Checkpoint A), BEFORE Gen 1 kick, CC-GEPA must:
> 1. Compute actual cost-per-evaluation from NULL-baseline telemetry (5 shapes × 8 instances × actual subject + judge cost)
> 2. Project Gen 1 cost = 5 shapes × 3 candidates × 8 instances × actual per-eval cost
> 3. If projected Gen 1 > $78 (30% over $60 manifest projection), halt-and-PM with options:
>    - (a) raise Gen 1 cap proportionally (Amendment 3-style correction for inherited estimate)
>    - (b) reduce Gen 1 scope (3 candidates × 6 instances OR 2 candidates × 8 instances)
>    - (c) pause Faza 1 + PM decides path

**Binding compliance:** Manifest v7 §cost_governance.pre_phase_boundary_reprojection encodes the rule. Phase-boundary re-projection catches projection errors that continuous monitoring misses — re-baselines against fresh telemetry rather than original projection. This rule is codified in response to the corpus-generation cost surprise (Amendment 3) where inherited $0.10/instance estimate was 170% off vs actual $0.27/instance Opus 4.7 cost.

The rule applies to **Pre-Gen-1** boundary as the canonical instance. PM may extend to other phase boundaries via future amendment.

### A.14 — NULL-baseline shape-override bug fix (Amendment 6 binding)

> **Bug discovered post-Checkpoint-A:** original `run-null-baseline.ts:runOneEval(shape, ...)` received PromptShape but did NOT forward it to `runRetrievalAgentLoop` as `promptShapeOverride`. All 40 evals used the model-alias-default shape (`qwen-thinking` for Qwen subject). The "per-shape pass rates" were 5×8 replicates of qwen-thinking, NOT shape-vs-shape comparison.
>
> **Fix:** added `promptShapeOverride: shape.name` to `runRetrievalAgentLoop` call. Regression test at `benchmarks/gepa/tests/faza-1/null-baseline-shape-override.test.ts` (4 tests, all passing) verifies source-text invariant.
>
> **Re-run:** NULL-baseline rerun with the fix; 5 sunk artifacts preserved as `*-artifactual-bug-superseded.{ext}` for audit trail; new artifacts written to canonical paths.
>
> **Reversals:**
> - Amendment 5 §F-saturated-baseline-rule **PAUSED** until real per-shape NULL data confirms qwen-thinking ≥ 0.88 (saturated threshold per N=8 binomial CI). Re-instate if condition met; revoke entirely otherwise.
> - PM-proposed Phase 4.3 clarification note **REVOKED** — original "qwen-thinking outperforms claude" finding was artifactual; Phase 4.3 verdict (72.2% T2 reasoning failure) remains binding as authored.
> - Amendment 5 §judge_metric_design **STAYS** — judge ensemble metrics computed on actual response content; methodology valid regardless of artifactual shape labels.
>
> **Cost impact:** $4.95 sunk + $5 re-run new = ~$10 total NULL-baseline. Cumulative Faza 1 spend post re-run: ~$25.13. Headroom under $115 cap: ~$90.
>
> **Unaffected:** mutation oracle 10 candidates ($1.43, valid); corpus 50/50; manifest v7 Amendments 1-5 conceptually correct; Pre-Gen-1 cost projection $14.86 still valid (cost is shape-independent in practice).

### A.12 — F-saturated-baseline rule (Amendment 5 — PAUSED per Amendment 6)

> For shapes at saturated NULL-baseline (`trio_strict_pass_rate (op ii) = 1.0` = 100% all evals pass), §F condition 1 ≥+5pp delta is **structurally inapplicable** (cannot improve beyond 100%). Reformulated acceptance:
> - **(a) No-regression:** Best GEPA candidate maintains `trio_strict_pass_rate = 100%` (i.e., all 8 Gen 1 instances pass)
> - **(b) Mechanistic improvement (Qwen-targeted):** `mean retrieval_calls per task ≥ 1.5` (escape Amendment 2 penalty zone)
> - **(b') Mechanistic improvement (non-Qwen):** `mean retrieval_calls per task ≥ NULL-baseline retrieval mean` (no regression on engagement)
>
> For non-saturated shapes (NULL pass rate < 100%): original §F condition 1 ≥+5pp criterion applies unchanged.

**Binding compliance:** Manifest v7 §F_saturated_baseline_rule encodes per-shape rule selection. Initial classification at Checkpoint A:
- **Saturated (1 shape):** qwen-thinking (8/8 = 100% NULL → saturated rule applies)
- **Non-saturated (4 shapes):** claude (50%), qwen-non-thinking (75%), gpt (88%), generic-simple (88%) → original ≥+5pp rule

If a non-saturated shape reaches 100% on Gen 1, the saturated rule retroactively applies (documented at Checkpoint C).

### A.13 — Judge metric parallel-report binding rule (Amendment 5)

> For synthesis Likert evaluations (Faza 1 + downstream where pass-rate base rate may exceed 80%), the judge ensemble health metric is **raw agreement rate** (primary) **+ Cohen's κ** (audit reference).
>
> 1. **Compute pairwise raw agreement** at trio_strict_threshold (default 4.0): `agree_pct = count(pair agrees pass-vs-fail) / n`
> 2. **Compute pairwise Cohen's κ** at the same threshold for audit reference
> 3. **Drift verdict (primary):** `min(raw agreement across pairs) ≥ 65%` → **PASS**
> 4. **Drift signal (secondary):** flag if ≥ 2 pairs simultaneously go below 50% raw agreement (genuine ensemble drift)
> 5. **PM verdict primary per checkpoint** with full context; no automatic verdict from κ alone
> 6. **Canonical κ=0.7878 retained as audit reference** with Cohen-1960 high-base-rate paradox annotation; explicitly noted as measured on LoCoMo factoid binary (~50% base rate), NOT directly comparable to synthesis Likert (~88% base rate)

**Binding compliance:** Manifest v7 §judge_metric_design encodes the rule. NULL-baseline at Checkpoint A reported:
- Raw agreement (PRIMARY): Opus↔GPT 75%, Opus↔MiniMax 80%, GPT↔MiniMax 70% → **min 70% ≥ 65% PASS**
- κ literal (audit): Opus↔GPT +0.342, Opus↔MiniMax −0.111, GPT↔MiniMax +0.211 → low due to Cohen paradox, NOT genuine drift

Per-judge mean distributions (N=40 evals): Opus mean 4.317 stdev 0.360; GPT mean 3.917 stdev 0.311; MiniMax mean 4.521 stdev 0.458 — internally consistent.

### A.11 — JSON-mode retry texture-audit binding rule (Amendment 4)

> Whenever JSON-mode `response_format` is used to retry corpus instances (or any prompt-controlled generation):
> 1. Spot-audit retry instances against same quality criteria as original spot-audit (same `validateInstance` rules per manifest v7 §corpus_design.per_instance_quality_floor)
> 2. Side-by-side narrative texture comparison: pick 5 random instances from originals using **a different seed than the original spot-audit** (e.g., spot-audit uses seed=42, texture audit uses seed=99); read first 2 documents from each retry + each sampled original
> 3. Score texture match qualitatively (paragraph length, sentence length, bullet density, table density, pronoun register, persona-stage consistency, framing) AND quantitatively (per-metric mean delta vs original-sample mean)
> 4. If texture drift detected (visibly shorter/longer paragraphs, different framing, different register): PIVOT TO previous-corpus path (e.g., accept partial corpus); document drift as caveat in checkpoint addendum + manifest amendment
> 5. If texture matches: accept retried-corpus version, kick downstream phase

**Binding compliance:** Manifest v7 §amendment_4_integration.texture_audit_binding_rule encodes the rule. Rationale per Amendment 4: JSON-mode response_format changes generation control flow (constrained decoding); subtle narrative texture shift possible that non-side-by-side spot-audit doesn't catch. Insurance value > 5-10 min audit cost.

This rule was first invoked in the Pre-A halt-and-PM addendum (`benchmarks/results/gepa-faza1/corpus/h3-spot-audit-pre-a-addendum.md`) for the 3-cell JSON-mode retry; verdict was NO_DRIFT_DETECTED, accept 50/50.

PM may extend scope to future JSON-mode retries within Faza 1, Faza 2 expansion, or Phase 5 GEPA-evolved variant.

---

## §B — Manifest v7 audit chain (SHA pins at LOCK time)

| Item | SHA-256 | Path |
|---|---|---|
| **Manifest v7 (Amendment 6 supplemented — CURRENT BINDING)** | `0b55d8e353299594254e1a4a76f26f53014d726315dc6a0e5d6dc1a3a44a368a` | `benchmarks/preregistration/manifest-v7-gepa-faza1.yaml` (in worktree) — supplemented at 2026-04-28T15:30:00Z; NULL-baseline shape-override bug fix + Amendment 5 §F-saturated PAUSED + Phase 4.3 clarification REVOKED |
| Manifest v7 (Amendment 5 — superseded by Amendment 6) | `062dfc4935aaa89f0b25595c5dc3ce4af06c95c4c261075a1f0226d8af3f3dee` | same path — historical SHA at 2026-04-28T11:00:00Z; judge metric parallel-report (STAYS) + F-saturated-baseline rule (PAUSED) |
| Manifest v7 (Amendment 4 — superseded twice) | `1f7a6d6fa01403f6c8d6855893adbfa5e82898a81b7583cfa55628e5eba60196` | same path — historical SHA at 2026-04-28T01:00:00Z; corpus retry methodology + texture-audit binding rule |
| Manifest v7 (Amendment 3 — superseded twice) | `e43d13793535077c92a0e2c24f948ebb9d6e04000293690fdf38c4ba957aa972` | same path — historical SHA at 2026-04-28T00:45:00Z; cost cap raise + Pre-Gen-1 re-projection rule |
| Manifest v7 (Amendment 2 — superseded twice) | `583712dde139ffc87fb1ab21643f68d52c56469ded9e8090a624980b05969beb` | same path — historical SHA at 2026-04-28T00:30:00Z |
| Manifest v7 (initial LOCK — superseded thrice) | `1d592a6113c918b7a07fc9aba748c8bdd12a6ce1c6943943c0492678299fa700` | same path — historical SHA at 2026-04-28T00:00:00Z initial lock |
| **H3 corpus JSONL (50 instances, BINDING)** | file: `9fa2bef83eb604f361419bf0ead70cf1560484a44ea01c5ebdc170a2c25c4ea3` / canonical fields: `9336ae2467e0728f20dd64a8972e3095b795f248676d679039bd1dd79a11bfef` | `benchmarks/results/gepa-faza1/corpus/h3-northlane-cfo-50-instances.jsonl` |
| H3 corpus pre-retry (47 instances, historical) | `cc9b9ae210cbd20f48f98675a45551366eebb9aa15fca93fd2eda6b366a2b912` | same path — superseded by 50-instance version post Option B retry |
| Manifest v6 (parent inheritance) | `5d5c1023421cd1a79f4913bb4c0a59415e21f50797255bff7dfec8e16b68e3ed` | `benchmarks/preregistration/manifest-v6-preregistration.yaml` |
| κ anchor file | `657d4490bab28d35cf8a9c3ccea8a6b79e92835d700155184e51f3900836684c` | `benchmarks/calibration/v6-kappa-recal/_summary-v6-kappa.json` |
| κ memo | `24b18112f7648ea3aa235281af19970ff4712925124301a0e60a8fd05bf5bb33` | `benchmarks/calibration/v6-kappa-recal/v6-kappa-memo.md` |
| κ analysis | `457357db1ad7f5941c045c3ef6724b653d2050ba8a4b61bf3f02a751adae5d47` | `benchmarks/calibration/v6-kappa-recal/kappa-v6-analysis.md` |
| Pilot runner (judge config archeology source) | `8a6251e2fc4e3c44ba2f23bfe7a452c316cd58f2d30a5ae45928238d72e01104` | `scripts/run-pilot-2026-04-26.ts` |
| **Cell-semantic boundary anchor (whole file)** | `1a9fa329e4b66ed9f0abe8bc22cbbf0124e0c879e1e78ec806d557cab25bc94d` | `packages/agent/src/prompt-shapes/types.ts` |
| **MULTI_STEP_ACTION_CONTRACT (linchpin string)** | `70a1701dfa126f8dc1df9c116f0a8469da005821ecadc59d9b8f348568e755ba` | byte-level SHA of constant body (252 bytes) |
| Baseline shape: claude.ts | `cbaf0c37b067b025a1fe97f2feeec11fae4070a8b3fcfaad1da8775dda451cc0` | `packages/agent/src/prompt-shapes/claude.ts` |
| Baseline shape: qwen-thinking.ts | `848a4e4917baa5c7bbcc3bb35fb8cb4b4ac8f0ab537243f14cbef3a99197aacb` | `packages/agent/src/prompt-shapes/qwen-thinking.ts` |
| Baseline shape: qwen-non-thinking.ts | `35be379be9a8caafc2c419e32da5f63f92fc83f6f6d70d9df76029c1e8584572` | `packages/agent/src/prompt-shapes/qwen-non-thinking.ts` |
| Baseline shape: gpt.ts | `5dc6d750d52a68feb9d37ad8384b2bcd59d70962066122ff086b0e5888413576` | `packages/agent/src/prompt-shapes/gpt.ts` |
| Baseline shape: generic-simple.ts | `81189817f560e26a69394248d8bd9089cae72c7d40825323e2b7407e36026172` | `packages/agent/src/prompt-shapes/generic-simple.ts` |
| κ canonical value | `0.7877758913412564` | constant — drift band [0.7378, 0.8378] (±0.05) |

The 5 baseline shape SHAs serve as the **delta-zero reference** for the GEPA mutation validator. Each Gen 0 NULL-baseline candidate must match its baseline SHA exactly (zero diff). Each Gen 1 mutation candidate must produce a non-zero diff in shape body but zero diff in types.ts/selector.ts/index.ts/metadata-except-evidence_link.

---

## §C — Substrate anchor + isolated worktree (Discovery 4.5)

- **Branch:** `feature/c3-v3-wrapper`
- **Anchor commit:** `c9bda3d6dd4c0a4f715e09f3757a96d01ff01cd7` (Phase 4.7 — compression-engaged-end-to-end assertion test post-fold-in)
- **Anchor verified ancestor of HEAD:** PASS (verified 2026-04-28 via `git merge-base --is-ancestor c9bda3d HEAD`)
- **Isolation method:** `git worktree add D:/Projects/waggle-os-faza1-wt c9bda3d` — detached HEAD, race-condition-guarded against CC-1 parallel Phase 4.4/4.5 work
- **All Faza 1 reads/writes go through the worktree.** Main repo D:/Projects/waggle-os receives only the final integration commits at Checkpoint C (cherry-pick or merge; CC-2 designs integration sequence).

**Note on remote:** `git fetch origin feature/c3-v3-wrapper` returned `fatal: couldn't find remote ref` — repo has no origin remote configured for this branch. Substrate freshness verified locally only via `git rev-parse` + ancestry check. This does NOT affect Faza 1 (work is local; integration-back-to-branch is local; no fetch dependency).

---

## §D — Cost discipline (per brief §5 + Amendment 1 §4 + Amendment 3 cap raise)

| Phase | Subtotal (Amendment 3) | Running cumulative | Pre-Amendment 3 |
|---|---|---|---|
| Corpus generation (50 × Opus 4.7 @ $0.27/inst) | **$13.58** | $13.58 | $5.00 |
| NULL-baseline (5 shapes × 8 instances) | $20.00 | $33.58 | $25.00 |
| GEPA Gen 1 (5 × 3 × 8) | $60.00 | $93.58 | $85.00 |
| Held-out validation (5 × 1 × 5) | $12.50 | $106.08 | $97.50 |
| Mutation oracle (5 × 2 × 2) | $3.00 | **$109.08** | $100.50 |

- **Hard cap:** $115.00 (raised from $100 by Amendment 3)
- **Internal halt:** $90.00 (raised from $80 by Amendment 3)
- **Corpus generation halt:** $15.00 (raised from $7 by Amendment 3 — 40% buffer over $13.58 expected)
- **Super-linear sub-rule (§A.7):** if mid-run actual exceeds projection by >30%, halt
- **Pre-phase-boundary re-projection (§A.10, Amendment 3 NEW BINDING RULE):** Pre-Gen-1 halt if projected Gen 1 cost (from actual NULL-baseline per-eval telemetry × 5×3×8) exceeds $78
- **Audit cadence:** every 20 evaluations

**Amendment 3 rationale (binding):** Inherited $0.10/instance generic LLM cost estimate was 170% off vs actual Opus 4.7 cost of $0.27/instance. Cost correction is for inherited error, NOT scope expansion. Quality dimension parity with pilot 2026-04-26 baseline preserved (~6700c materials matches pilot ~5300c) for apples-to-apples Phase 5 comparison. This precedent does NOT apply to scope expansion requests.

---

## §E — 4 mandatory halt-and-PM checkpoints (per Amendment 1 §5)

| # | Checkpoint | Cumulative | Trigger | PM action |
|---|---|---|---|---|
| 1 | **Pre-A** (NEW) | ~$5 | Post 50-instance corpus generation + 5-instance random spot-audit | Ratify corpus quality + NULL-baseline kick authorization |
| 2 | A | ~$25 | Post NULL-baseline 5 shapes × 8 instances | Ratify NULL trio-strict in 18-24% range + κ stability + Gen 1 kick |
| 3 | B | ~$50-65 | Mid-Gen 1 (after 30 evaluations) | Ratify intermediate κ + cell-semantic violations review + complete Gen 1 |
| 4 | C | ~$100 | Post held-out validation (5 shapes × top-1 × 5 instances) | Acceptance verdict per §F + Faza 2 expansion or PHF fallback |

Between checkpoints, CC-2 proceeds **without further PM interaction unless any sub-rule trigger fires** (per Amendment 1 closing line). Sub-rule triggers per brief §5: cost breach, κ drift > 0.05, cell semantic violation, 2 consecutive invalid mutations, API blocker.

---

## §F — Faza 1 acceptance criteria (binding — 4 must-hold conditions + 1 false-positive guard)

Per brief §4 with Amendment 1 §6 + Amendment 2 §5 updates on condition 1 + new §F.5 false-positive guard:

1. **Best GEPA candidate per shape beats NULL-baseline by ≥+5pp on `trio_strict_pass` rate** (where `trio_strict_pass = trio_mean ≥ 4.0` per Ask B ratification — primary operationalization (ii)).
   - **For Qwen-targeted shapes (qwen-thinking, qwen-non-thinking) ADDITIONALLY:** best candidate must have `mean retrieval_calls per task ≥ 1.7` (engagement gap closed by ≥50% relative to Qwen baseline 1.33 → Opus parity 2.33). Per Amendment 2 §5.
   - Reported with σ-aware disclaimer per §A.5: +5pp is fitness signal, NOT statistical claim.
   - Supplementary report: operationalization (i) per pilot runner line 657 (judge-mean ≥ 3.5 quorum) reported in parallel column for cross-validation.
2. **At least 3/5 shapes show positive delta** (avoids cherry-picking single shape that lucked out).
3. **Trio judge κ remains within ±0.05 of canonical 0.7878** (drift band [0.7378, 0.8378]).
4. **Zero cell semantic violations detected** per §A.4 mutation validator audit.

**§F.5 (NEW per Amendment 2 — false-positive evolution guard):**

If best Qwen-shape candidate achieves `+5pp trio_strict delta WITHOUT closing retrieval engagement gap (mean retrieval_calls per task < 1.5)`, this signals false-positive evolution (improvement via mutation-noise rather than mechanistic fix). Result: candidate **REJECTED**, shape marked **FAIL** even if other criteria pass. PM ratifies whether to re-run mutation generation with stronger anti-premature-finalization scaffolding or escalate.

**On PASS (all 4 conditions hold AND no §F.5 trigger):** Faza 2 expansion brief authoring authorized; CC-1 Phase 5 NULL-baseline run gated on Faza 1 PASS.

**On FAIL (any single condition fails OR §F.5 triggers):** fallback PHF per `decisions/2026-04-26-decision-matrix-self-judge-reframe.md`; GEPA work parked; paper claim #2 multiplier teza reframes academically.

---

## §G — Operational sequencing (Faza 1 task ordering)

Per Amendment 1 §7, with Pre-A and progress checkpoints:

1. ✅ Manifest v7 authored (this LOCK references SHA `1d592a6113c918b7a07fc9aba748c8bdd12a6ce1c6943943c0492678299fa700`)
2. ✅ Launch decision LOCK authored (this file)
3. **NEXT:** Build GEPA harness scaffold + tests (≥80% coverage):
   - Selection logic (top-1 per shape selection)
   - Mutation validator (cell semantic preservation)
   - κ audit utility (per-batch κ computation against canonical anchor)
   - Cost governance + super-linear projection tracker
   - Output: `benchmarks/gepa/faza-1/` directory + tests
4. **NEXT:** Generate 50-instance H3 corpus via Opus 4.7 oracle:
   - 5 task families × 5 personas × 2 company stages = 50 cells
   - Each instance ≥6 source documents + 6-dim Likert rubric
   - Output: `benchmarks/results/gepa-faza1/corpus/h3-northlane-cfo-50-instances.jsonl`
5. **NEXT:** Spot-audit 5 random instances per §A.8; author Pre-A checkpoint report
6. **HALT:** Pre-A → PM ratify corpus + NULL kick auth
7. NULL-baseline run → Checkpoint A halt
8. Gen 1 → Checkpoint B halt → completion of Gen 1
9. Held-out validation → Checkpoint C → Faza 1 verdict

---

## §H — LOCK semantics + amendment policy

This decision is LOCKED upon authoring (timestamp 2026-04-28). Subsequent amendments require:
- New file: `decisions/2026-04-28-gepa-faza1-launch-amendment-N.md` (where N = sequential integer)
- New manifest: `benchmarks/preregistration/manifest-v7-gepa-faza1-amendment-N.yaml` if methodology changes
- PM ratification recorded in amendment file header
- This LOCK file remains immutable except for its `chain` frontmatter list (which appends new amendments)

CC-2 may NOT modify this file mid-run except via the chain extension. Any deviation discovered mid-run triggers halt-and-PM per brief §10.

---

**End of Faza 1 Launch Decision LOCK. Standing READY for §G step 3 (GEPA harness scaffold + tests).**
