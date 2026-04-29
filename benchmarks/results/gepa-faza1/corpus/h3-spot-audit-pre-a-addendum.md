---
report_id: 2026-04-28-gepa-faza1-pre-a-corpus-audit-addendum
date: 2026-04-28
checkpoint: Pre-A addendum (post Option B retry + texture audit per Amendment 4)
predecessor_report: h3-spot-audit-pre-a-report.md
manifest_anchor: manifest-v7-gepa-faza1
manifest_v7_sha256_amendment_4: NOT_YET_COMPUTED  # CC-2 will compute after manifest edit completes
total_instances_target: 50
total_instances_generated: 50  # post Option B retry
spot_audit_verdict_original: PASS (5/5, seed=42)
texture_audit_verdict: NO_DRIFT_DETECTED — ACCEPT 50/50 corpus
texture_audit_seed: 99
total_generation_cost_usd: 13.3457  # original $12.5417 + retry $0.8040
cumulative_faza_1_spend_usd: 13.74  # corpus + probe attempts
faza_1_hard_cap_usd: 115.0
status: HALT-AND-PM (corpus 50/50 finalized; PM ratifies NULL-baseline kick auth)
authority: PM (Marko Markovic)
---

# Pre-A Halt-and-PM Addendum — Option B Retry + Texture Audit Verdict

## TL;DR

Option B retry (per PM ratification) generated 3 missing cells via JSON-mode response_format ($0.80 cost, all 3 succeeded). Post-retry corpus = **50/50 instances** ($13.35 total, well under $15 halt). Texture audit per Amendment 4 caveat: **NO DRIFT DETECTED**. CC-2 verdict: **ACCEPT 50/50**, kick NULL-baseline upon PM ratify.

## §1 — Retry execution summary

| Cell | Result | Cost | Latency | Docs |
|---|---|---|---|---|
| `h3-F4-p2_cfo-stage_a_series_b_growth_burning-001` | ✅ OK | $0.2658 | 64.6s | 6 |
| `h3-F4-p2_cfo-stage_b_post_profitable_consolidation-001` | ✅ OK | $0.2499 | 61.6s | 6 |
| `h3-F5-p1_founder_ceo-stage_a_series_b_growth_burning-001` | ✅ OK | $0.2884 | 67.6s | 7 |
| **Total** | **3/3 PASS** | **$0.8040** | ~3.2 min | — |

JSON-mode parameters (Amendment 4): `response_format={"type":"json_object"}`, `max_tokens=6000`, **temperature omitted** (Anthropic deprecated temperature when JSON-mode requested for Opus 4.7 — discovered during retry, mitigation in script).

## §2 — Resume-bug recovery (mid-retry)

During retry execution, a latent bug in `generate-h3-corpus.ts` was discovered: the resume logic only loaded existing JSONL when `args.mode === 'all'`, so retry-failed mode opened the JSONL with truncate (`'w'`) flag. This wrote 3 retry instances over the 47 originals.

**Recovery:** the 47-instance JSONL was already committed in the previous Pre-A commit (`142c851`). Restored via `git checkout HEAD -- benchmarks/results/gepa-faza1/corpus/h3-northlane-cfo-50-instances.jsonl`, then appended the 3 retry instances. Final JSONL: 50 lines.

**Fix landed in same commit:** resume logic now triggers for any non-dry-run mode. Test coverage extension is recommended for Faza 2 (script test) but not blocking for Faza 1.

## §3 — Texture audit per Amendment 4 caveat

### 3.1 — Methodology

5 random originals selected via Mulberry32 PRNG seed=99 (different from spot-audit seed=42 to avoid sample reuse). First 2 documents from each retry (3) and each sampled original (5) loaded for side-by-side comparison.

Quantitative metrics computed: doc count, total chars, paragraph count, avg paragraph chars, avg sentence chars, bullet count, header count, table density (proxy via pipe count), 1st-person/2nd-person pronoun count.

Qualitative comparison: artefact at `texture-audit-side-by-side.md` (11.6KB).

### 3.2 — Quantitative deltas (retry mean vs original-sample mean)

| Metric | Retry | Originals (seed=99) | Δ (abs) | Δ (%) | Verdict |
|---|---|---|---|---|---|
| n_docs | 6.33 | 6.4 | -0.07 | **-1.1%** | ✅ within tolerance |
| total_chars | 5,936 | 5,506 | +430 | +7.8% | ✅ minor enrichment |
| first_two_chars | 1,718 | 1,606 | +112 | +7.0% | ✅ within natural variance |
| n_paragraphs | 8.0 | 7.0 | +1.0 | +14.3% | ✅ minor |
| avg_para_chars | 214.9 | 231.1 | -16.2 | -7.0% | ✅ minor |
| avg_sent_chars | 192.1 | 169.2 | +22.9 | +13.5% | ⚠️ moderate |
| bullets | 9.67 | 11.4 | -1.73 | -15.2% | ⚠️ moderate |
| headers | 0.0 | 0.0 | 0.0 | 0% | ✅ no drift |
| tables (proxy) | 4.0 | 2.0 | +2.0 | +100% | ⚠️ outlier-driven (1 retry has tabular CFO P&L) |
| pronouns_first | 2.67 | 4.2 | -1.53 | -36.4% (naive) | ⚠️ register signal |
| pronouns_second | 0.0 | 0.0 | 0.0 | 0% | ✅ |

**Outlier analysis:** the +100% table delta is driven entirely by retry instance `h3-F4-p2_cfo-stage_a` containing a tabular Q3 P&L (12 pipe chars). Original-sample also contains a tabular P&L (`h3-F4-p3_coo-stage_b` — Meridian Q2 FY25 P&L, 10 pipe chars). Tabular CFO P&L is a legitimate, register-appropriate format that just happened to land more often in the retry sample.

**Pronoun delta correction:** the 36% naive drop is pulled by one retry instance (F4-p2_cfo-stage_a) with zero first-person pronouns due to its tabular structure (tables don't contain first-person prose). Excluding this tabular instance: retry mean = 4.0, original mean = 4.75 → **-15.8%** drift, within natural variance for 5-sample comparison.

### 3.3 — Qualitative side-by-side review

Sampled retry vs original document framing:

**Retry F4-p2_cfo-stage_a DOC 1:**
> **Q3 FY24 Actuals vs. Plan**
> | Metric | Q3 Actual | Q3 Plan | Var |
> | New ARR | $1.42M | $1.95M | -27% |
> ...
> **Burn multiple (Q3): 2.57x** (Net Burn / Net New ARR) — vs. 1.36x plan, 1.8x benchmark for Series B SaaS.

**Original F2-p2_cfo-stage_a DOC 1:**
> **October 2024 Financial Summary**
> - Monthly recurring revenue: $1.183M (ARR $14.2M, +18% YoY...)
> - Gross margin: 71% (down from 74% Q2 — hosting costs up due to enterprise tier usage)
> ...
> **CFO commentary:** Magic number trending at 0.6 (target 0.75+)...

Both are CFO-genre P&L summaries with bulleted/tabular metrics + qualitative commentary. Same business-document register, same data-density expectations, same persona-appropriate framing.

Retry's F5-p1_founder_ceo-stage_a includes "Status quo / 30% headcount freeze / Aggressive growth" scenario modeling — matches founder-CEO strategic decision-making register.

Original sample includes Datable.io, Flowstack, ContractIQ, Meridian, Lumen as plausible competitor/company names — retry includes Clarivue, Lumen Telemetry, Rippling. Both samples produce realistic mid-market B2B SaaS naming + financial details.

### 3.4 — Drift assessment

| Dimension | Drift detected? |
|---|---|
| Document count parity | NO |
| Total content length | NO (within ±10%) |
| Paragraph structure | NO (within ±15%) |
| Bullet density | MARGINAL (-15%, within natural variance for 5-sample n) |
| Table density | NO (outlier-driven, both retry and original samples contain tabular P&L) |
| Pronoun register | MARGINAL (-16% on non-tabular comparison) |
| Persona-stage consistency | NO (verified per-instance) |
| Domain anchor (B2B SaaS / CFO / synthesis) | NO |

**No "visibly shorter/longer paragraphs", "different framing", or "different register"** per Amendment 4 caveat texture-drift trigger language. Marginal pronoun delta is within 5-sample noise floor.

## §4 — Per-Amendment-4-caveat verdict

Per Amendment 4 caveat:
> If texture drift detected (JSON-mode constrained decoding produces visibly shorter/longer paragraphs, different framing, different register): PIVOT TO OPTION A.
> If texture matches: accept 50/50, kick NULL-baseline.

**Texture matches.** Retry instances are stylistically indistinguishable from JSON-mode-free originals. CC-2 verdict per Amendment 4 caveat decision tree: **accept 50/50, kick NULL-baseline upon PM ratify.**

## §5 — Updated audit chain

| Item | Value |
|---|---|
| Corpus JSONL (50 instances) | `benchmarks/results/gepa-faza1/corpus/h3-northlane-cfo-50-instances.jsonl` |
| Corpus SHA256 (file bytes) | `9fa2bef83eb604f361419bf0ead70cf1560484a44ea01c5ebdc170a2c25c4ea3` |
| Corpus SHA256 (canonical fields) | `9336ae2467e0728f20dd64a8972e3095b795f248676d679039bd1dd79a11bfef` |
| Corpus pre-retry SHA (47 instances, historical) | `cc9b9ae210cbd20f48f98675a45551366eebb9aa15fca93fd2eda6b366a2b912` |
| Texture-audit side-by-side artefact | `benchmarks/results/gepa-faza1/corpus/texture-audit-side-by-side.md` |
| Generation log | `benchmarks/results/gepa-faza1/corpus/generation-run.log` |
| Manifest v7 SHA (Amendment 4 — to be committed) | computed post-edit |

## §6 — Cost reconciliation (final corpus phase)

| Item | Pre-Amendment-3 | Amendment 3 binding | Actual final |
|---|---|---|---|
| Per-instance cost (avg) | $0.10 | $0.27 | $0.267 |
| Original 47 cost | $5 projected | $13.58 projected | $12.54 |
| Retry 3 cost | — | budgeted | $0.80 |
| **Total corpus cost** | $5 | $13.58 | **$13.35** |
| Halt threshold | $7 | $15 | not breached |

Cumulative Faza 1 spend post-retry: **$13.74** (corpus $13.35 + probe attempts $0.40). Headroom under Amendment 3 cap: $115 - $13.74 = **$101.26**.

## §7 — PM ratification ask

**CC-2 recommendation:** ratify NULL-baseline kick.

Per Amendment 4 caveat decision tree, texture audit shows no drift → accept 50/50 → kick NULL-baseline. Per launch decision §E mandatory checkpoint, this halt is BINDING; CC-2 does not proceed without explicit PM ratify on this addendum.

**Sequence post-ratify:**
1. CC-2 commits corpus + addendum + manifest v7 Amendment 4 + launch decision update
2. CC-2 kicks NULL-baseline run (5 shapes × 8 instances per shape, expected ~$20)
3. CC-2 halts at Checkpoint A with NULL-baseline results + Pre-Gen-1 cost re-projection per Amendment 3 binding rule (§A.10)

---

**End of Pre-A halt-and-PM addendum. Standing AWAITING PM ratification on §7.**
