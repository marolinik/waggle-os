---
report_id: 2026-04-28-gepa-faza1-pre-a-corpus-audit
date: 2026-04-28
checkpoint: Pre-A (corpus quality + NULL kick auth)
manifest_anchor: manifest-v7-gepa-faza1
manifest_v7_sha256_amendment_3: e43d13793535077c92a0e2c24f948ebb9d6e04000293690fdf38c4ba957aa972
manifest_v7_sha256_amendment_2: 583712dde139ffc87fb1ab21643f68d52c56469ded9e8090a624980b05969beb
manifest_v7_sha256_initial_lock: 1d592a6113c918b7a07fc9aba748c8bdd12a6ce1c6943943c0492678299fa700
total_instances_target: 50
total_instances_generated: 47
total_instances_failed: 3
spot_audit_sample_size: 5
spot_audit_seed: 42
spot_audit_verdict: PASS
total_generation_cost_usd: 12.5417
total_generation_cost_halt_usd: 15.0
generation_cost_pre_amendment_3_halt: 7.0  # historical
cumulative_faza_1_spend_usd: 12.94  # corpus $12.54 + ~$0.40 probe attempts
faza_1_hard_cap_usd: 115.0  # Amendment 3
faza_1_internal_halt_usd: 90.0  # Amendment 3
status: HALT-AND-PM (corpus generated; PM ratifies accept-47 vs retry-3 vs other)
authority: PM (Marko Markovic)
note: "This file replaces the auto-generated Pre-A report (which had stale Amendment-2 SHA + pre-Amendment-3 cost references). The auto-generated content is preserved in generation-run.log timestamps."
---

# Pre-A Halt-and-PM Report — H3 Corpus Quality Audit

## TL;DR

Generated **47/50 instances** at total cost **$12.54** (vs $13.58 expected post-Amendment-3, well under $15 halt). Spot-audit sample of 5 random instances (seed=42) **PASSED**. 3 cells failed during generation due to JSON parse errors in long doc bodies (Opus emitted unescaped quotes deep inside JSON strings).

Brief §6.3 ≥40 H3 instances threshold **SATISFIED** with 47/50 (7-instance buffer above floor). Stratification has minor F4/F5 + p2_cfo/p1_founder_ceo underrepresentation gaps.

## §1 — Generation summary

| Metric | Value |
|---|---|
| Target instances | 50 |
| Generated successfully | **47** |
| Failed (JSON parse) | 3 |
| Spot-audit sampled | 5 (deterministic seed=42) |
| Spot-audit PASSED | 5/5 |
| Total cost (corpus only) | **$12.5417** |
| Halt threshold (Amendment 3) | $15.00 |
| Cumulative Faza 1 spend | ~$12.94 (corpus + probe attempts) |
| Wall clock | ~52 minutes (50 attempted × ~62s each) |

## §2 — Failed cells (3)

| Cell | Failure mode |
|---|---|
| `h3-F4-p2_cfo-stage_a_series_b_growth_burning-001` | JSON parse error at position 7821 (mid-doc body) |
| `h3-F4-p2_cfo-stage_b_post_profitable_consolidation-001` | JSON parse error at position 8823 (mid-doc body) |
| `h3-F5-p1_founder_ceo-stage_a_series_b_growth_burning-001` | JSON parse error at position 7042 (mid-doc body) |

**Root cause:** Opus 4.7 occasionally emits unescaped quotation marks or control characters inside long doc-body strings, breaking the JSON envelope. The probe (cell #1, simple persona, F1 family) succeeded but later cells with denser doc content failed.

**Mitigation options for retry path:**
- Reduce `max_tokens` (forces shorter output, less prone to escaping issues)
- Switch to JSON-mode `response_format` (LiteLLM supports this for some models)
- Retry with lower temperature (1.0 → 0.3) for more deterministic JSON formatting
- Tolerant JSON parser (e.g., JSON5 / json-repair) as fallback

## §3 — Per-family / per-persona coverage

### Per task family
| Family | Instances | Coverage |
|---|---|---|
| F1 strategic_synthesis | 10/10 | 100% |
| F2 cross_thread_coordination | 10/10 | 100% |
| F3 decision_support | 10/10 | 100% |
| F4 investor_communications | **8/10** | 80% |
| F5 scenario_planning | **9/10** | 90% |
| **Total** | **47/50** | **94%** |

### Per persona
| Persona | Instances | Coverage |
|---|---|---|
| p1_founder_ceo | **9/10** | 90% (lost F5-stage_a) |
| p2_cfo | **8/10** | 80% (lost both F4 cells) |
| p3_coo | 10/10 | 100% |
| p4_vp_finance | 10/10 | 100% |
| p5_independent_director | 10/10 | 100% |

### Per company stage
| Stage | Instances |
|---|---|
| stage_a_series_b_growth_burning | 23/25 (92%) |
| stage_b_post_profitable_consolidation | 24/25 (96%) |

**Stratification bias:** F4 underrepresented 20%, p2_cfo underrepresented 20%. Sampling for NULL-baseline + Gen 1 (deterministic-stratified, seed=42) will draw differently than from 50; may slightly over-weight F1-F3 + non-CFO personas.

## §4 — Spot-audit results

5 random instances selected via deterministic Mulberry32 PRNG (seed=42). All passed validateInstance per manifest v7 §corpus_design.per_instance_quality_floor.

| Instance ID | Result | Violations |
|---|---|---|
| `h3-F3-p5_independent_director-stage_a_series_b_growth_burning-001` | ✓ PASS | — |
| `h3-F3-p1_founder_ceo-stage_b_post_profitable_consolidation-001` | ✓ PASS | — |
| `h3-F5-p2_cfo-stage_b_post_profitable_consolidation-001` | ✓ PASS | — |
| `h3-F4-p3_coo-stage_a_series_b_growth_burning-001` | ✓ PASS | — |
| `h3-F2-p1_founder_ceo-stage_b_post_profitable_consolidation-001` | ✓ PASS | — |

All 5 audit dimensions per manifest v7 §corpus_design.spot_audit.audit_dimensions: ≥6 source docs, persona/scenario coherent, question answerable from materials, rubric dimensions applicable, NorthLane CFO domain anchor preserved.

Sampled cells span F2/F3/F4/F5 families and 4 of 5 personas — diverse coverage in the audit sample itself.

## §5 — Cost reconciliation (Amendment 3 binding)

| Item | Pre-Amendment-3 | Amendment 3 binding | Actual |
|---|---|---|---|
| Per-instance cost | $0.10 | $0.27 | $0.2668 avg |
| Corpus subtotal | $5.00 | $13.58 | **$12.54** |
| Generation halt | $7.00 | $15.00 | not breached |
| Faza 1 hard cap | $100.00 | $115.00 | $12.94 cumulative |

Actual per-instance cost (avg): $12.5417 ÷ 47 = $0.2668 (very close to $0.2716 probe estimate; Amendment 3 projection accurate within 2%).

## §6 — Audit chain

| Item | Value |
|---|---|
| Corpus JSONL | `benchmarks/results/gepa-faza1/corpus/h3-northlane-cfo-50-instances.jsonl` |
| Corpus SHA256 | `cc9b9ae210cbd20f48f98675a45551366eebb9aa15fca93fd2eda6b366a2b912` (47 instances) |
| Generation log | `benchmarks/results/gepa-faza1/corpus/generation-run.log` |
| Manifest v7 SHA (Amendment 3, BINDING) | `e43d13793535077c92a0e2c24f948ebb9d6e04000293690fdf38c4ba957aa972` |
| Substrate | `c9bda3d` (Phase 4.7) via worktree `D:/Projects/waggle-os-faza1-wt` |
| Generation oracle | `claude-opus-4-7` (LiteLLM via http://localhost:4000) |
| Generation max_tokens | 8000, temperature 1.0, thinking enabled |

## §7 — PM ratification ask

Three options for PM:

**Option A — ACCEPT 47/50, proceed to NULL-baseline (PM rec from CC-2 perspective):**
- Brief §6.3 ≥40 satisfied; spot-audit PASSED; cost discipline preserved
- Stratification bias is small (3 missing cells out of 50)
- Corpus deterministic-stratified sampling for downstream phases (NULL/Gen1/held-out) will draw 8+24+5=37 instances per shape from the 47 available; ample margin
- **Cost to proceed:** $0 additional pre-NULL; NULL-baseline will spend ~$20

**Option B — RETRY 3 failed cells with mitigation, then proceed:**
- Add tolerant JSON parser (JSON5 / json-repair) OR retry with `temperature=0.3` + `max_tokens=6000`
- Cost: ~$0.60-0.80 additional ($0.27/cell × 3 with retry overhead)
- Brings corpus to 50/50; eliminates stratification bias
- Adds ~5-10 minutes wall-clock + ~30 min implementation + re-test
- Risk: retry could fail again if Opus cells consistently produce escaping issues; mitigation effectiveness uncertain

**Option C — HALT, escalate, decide path:**
- E.g., if PM wants to investigate the JSON-parse failure mode more deeply, switch oracle, or change scope

**CC-2 recommendation:** Option A. The 47/50 corpus is methodologically sufficient for Faza 1's proof-of-concept N=8 evaluation per shape; the 3-cell stratification bias is well below the σ-aware acceptance noise floor (±17pp at 95% per §A.5). Retrying for cosmetic completeness costs $0.80 + delay; the marginal stratification correction is unlikely to change Faza 1 verdict.

If PM ratifies Option A, NULL-baseline kick auth granted → CC-2 proceeds to Checkpoint A.
If PM ratifies Option B, CC-2 implements mitigation + re-runs 3 cells.

---

**End of Pre-A halt-and-PM report. Standing AWAITING PM ratification on §7 options A/B/C.**
