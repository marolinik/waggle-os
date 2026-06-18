# 14 — Banking C2 Gate + Discordance/ICC → N (pilot analysis, verified)

**Date:** 2026-06-18 · **Status:** Construct check PASSED; re-derivability + final N deferred to study-time per the pre-registered rule. All numbers independently re-verified by an adversarial statistics agent (recomputed from raw `results.json`; all claims CONFIRMED, one correction on n0).

**Scope caveat (load-bearing):** the pilot runs are **single-arm ruler reproductions** (stock `llm_agent`, NO Waggle memory). So ICC + construct + re-derivability are real; **true paired (Opus-vs-Qwen) discordance is NOT measurable here** — it comes from the first priced A-vs-B cell. The pilot's job was to measure the *inputs* to the N formula, which it now has.

## 1. Banking C2 construct check — PASS (banking stays in)

`banking_knowledge` is graded on DB-state/actions, **not** answer text:
- reward_basis over 97 tasks: **DB-only 87, ACTION-only 9, DB+NL_ASSERTION 1** (96/97 DB/ACTION-anchored).
- **communicate_info non-empty in 0/97 tasks.**

→ Confirms the §11 ruling: banking is **agentic, not memory-QA**. It does **not** confound with the LoCoMo memory claim. **Banking remains the accuracy-TOST/divergence cell.**

## 2. Re-derivability (C2 part ii) — DEFERRED to study-time (cannot finalize from pilot)

Under the strong memory-OFF ruler agent (gpt-5.5-high, 4 trials), banking per-task solve: **53 never-solved / 25 always / 19 partial** (all 97 have ≥1 valid trial). The 53 never-solved **cannot be split** into "genuinely needs memory" (a C2 violation if memory supplies it) vs "just hard for the model" without the founder-ratified **4×-budget unbounded memory-OFF probe**. That probe is a **study-time gate**, not pilot-resolvable. **Action:** run the 4×-budget re-derivability probe per banking task at study time; exclude+count tasks unbounded-OFF cannot reach; only the re-derivable subset enters the accuracy headline (`03` C2). Retail for contrast: only 4/114 never-solved.

## 3. ICC + cluster structure — a pre-reg assumption is OVERTURNED

| Level | Banking | Retail | Implication |
|---|---|---|---|
| **ICC(1) trials-within-task** | **0.674** | **0.239** | the binding cluster |
| ICC task-within-procedure-family | ≈ −0.01 | ≈ −0.04 | **family clustering is negligible** |

**§6.1 assumed cluster = procedure-family, ICC≈0.1, DEFF≈2.40. The pilot REFUTES that** — family-ICC ≈ 0 (DEFF≈1 at family level). The real correlation is **trials-within-task**. So the cluster unit must change.

**Verifier correction — use REALIZED n0, not nominal k=4.** Infra-error attrition cut banking to **2.62** valid trials/task (35 tasks at n=2, one at n=1); retail 3.82. Task-as-cluster DEFF = 1+(n0−1)·ICC:
- **Banking: realistic DEFF ≈ 2.09** (n0=2.62, ICC=0.674) — *not* 3.02 from nominal n0=4.
- **Retail: realistic DEFF ≈ 1.67** (n0=3.82, ICC=0.239).

**Design escape hatch:** running **1 trial/task** forces DEFF→1 (removes trial-clustering entirely) — cleanest if pass^k (which needs k>1) isn't required on the accuracy cell.

## 4. Discordance proxy + provisional N (LOWER BOUND)

Within-task trial-pair disagreement (a **conservative lower bound** on cross-arm paired discordance, under per-task arm-independence — `disc_cross = mean 2p(1−p) + (pA−pB)² ≥ floor`):
- biased 2p(1−p): banking **0.091**, retail **0.191**; unbiased n/(n−1): banking **0.156**, retail **0.256**.

**Provisional powered N** (§6.1 formula, δ=±5pp, gap=1pp, power .80) is therefore a **lower bound** — true cross-arm discordance (two different models) will exceed the within-trial floor, so real N ≥ these:
- banking ≳ **400–500**, retail ≳ **740** (order-of-magnitude; depends on cluster framing).

These are NOT a freeze number. **The pilot delivered the measured inputs; N finalizes from the first priced A-vs-B cell** (exactly the §6.1 "pilot-measure → recompute → finalize" rule).

## 5. Mandatory pre-reg disclosures (into the OSF freeze)

1. **Cluster = TASK** (trials-within-task), ICC measured 0.67 banking / 0.24 retail; **DEFF computed on REALIZED valid-trials/task, not nominal k**. State the formula + commit to recompute on realized counts. (Or adopt 1-trial/task → DEFF=1.)
2. **Banking infra-error rate 34.5%** (vs retail 4.6%) — the largest risk: 35 banking tasks fell to n=2. Pre-register a **minimum-valid-trials inclusion rule** (e.g. ≥3 of 4) + a **re-run plan for infra-failed cells**, else banking's per-task estimates (and its 0.67 ICC) rest on thin samples. *(Root cause: gpt-5.2 user-sim RPM throttle — mitigated by lower concurrency + the now-restored quota.)*
3. **Discordance floor is conditional on per-task arm independence**; positive Opus/Qwen pass-correlation could push true discordance below the floor. State the assumption; it's a deliberately conservative proxy, not realized discordance.
4. **Family proxy is crude** — banking's `call_discoverable_agent_tool` swallows 58/97 tasks, so "family ICC≈0" is partly proxy-driven (conservative). If family-clustering is ever needed, define family on a finer key (full sorted golden-write tuple) and re-confirm.

## 6. §6.1 edits (applied)
- Replace "cluster = procedure-family, ICC 0.1, DEFF 2.4" with the measured task-level structure + realized-n0 DEFF rule.
- Add the minimum-valid-trials inclusion rule + infra-failed-cell re-run plan.
- Keep N provisional; finalize from the first paired cell.
