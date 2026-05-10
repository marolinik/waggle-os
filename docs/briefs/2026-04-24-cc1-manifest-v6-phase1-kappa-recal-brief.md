# CC-1 Brief — Manifest v6 Phase 1: Emission + Config Amendment + κ Re-Calibration

**Date**: 2026-04-24
**Status**: §2.0 v6 emission + §2.1 κ re-cal (Phase 1 of 2; Phase 2 = N=400 execution, emitted post-PM-RATIFY-V6-KAPPA)
**Authorized by**: Marko Marković ("prihvatam tvoje preporuke, idemo dalje")
**Predecessors**: Full §1.3g + §1.3h + §1.3h-C validation sequence CLOSED; MiniMax M2.7 primary + Kimi K2.6 backup selection ratified
**PM**: claude-opus-4-7 (Cowork)

---

## §0 Overview

Manifest v6 supersedes v5 (`fc16925`) as authoritative pre-registration for Stage 3 N=400 re-kick. Three deliverables in Phase 1:

1. **v6 emission** — MD + YAML with full delta log from v5, new trio declaration, swap rationale, supersession of §11 frozen paths
2. **Config amendment** — `litellm-config.yaml` editing to add MiniMax + Kimi aliases under v6 authority (explicit supersession of v5 §11 freeze per PM ratification)
3. **κ re-calibration** — full 100-instance three-way κ on new trio (Opus + GPT + MiniMax), success criterion ≥ 0.70 substantial agreement

Phase 2 (N=400 execution) gated on PM-RATIFY-V6-KAPPA. CC-1 HALTS after Phase 1 completion, does NOT self-advance to N=400.

---

## §1 Manifest v6 emission specification

### §1.1 Structure

MD + YAML twin with SHA-pinned cross-reference (same pattern as v4→v5 transition). Emit to:
- `benchmarks/preregistration/manifest-v6-preregistration.md`
- `benchmarks/preregistration/manifest-v6-preregistration.yaml`

### §1.2 Required sections

Copy v5 structure with these substantive changes:

**§0.1 Anchor**: v6 anchor = this commit SHA (set at commit time).

**§0.2 Parent**: v5 anchor `fc16925`. Full parent chain documented.

**§0.5 Delta log** (expand from v5):
- Judge ensemble swap rationale (Google preview quota block → Chinese GA flagship evaluation → correctness-driven selection)
- §1.3f-§1.3h-C sub-gate summary with anchor SHAs
- MiniMax primary selection rationale (86% correctness on splits + operational profile)
- Kimi backup selection rationale (80% correctness + per-instance failover)
- Abandoned candidate documentation: Gemini 3.1 Pro Preview (quota 250 RPD infeasible), Zhipu GLM-5.1 (100% GPT-echo), DeepSeek V4 Pro (GPT-alignment escalates at higher reasoning budget)
- §11 supersession note: v5 §11 freeze on `litellm-config.yaml` supersedes here; new §11 in v6 pins post-amendment state

**§1 Ensemble declaration** (new from v5):
- Primary judges: Opus 4.7 + GPT-5.4 + MiniMax M2.7 (openrouter routing)
- Backup judge: Kimi K2.6 (direct routing, per-instance failover)
- Backup activation policy: per-instance failover on MiniMax failure (API error / parse failure / timeout); if Kimi also fails → `judge_ensemble_fail` marker, instance excluded from final analysis
- Disqualified candidates documented with verdict rationale

**§5.2 Consistency constraint** (updated from v5):
- One judge call per instance per primary; backup activated only on primary failure
- No prompt-level batching (preserves judge protocol)
- Identical prompt template per `failure-mode-judge.ts:245-258` verbatim

**§6 κ re-calibration methodology** (new from v5):
- Sample: full 100-instance calibration set from v5 (same instances used for original κ=0.7458)
- Three-way measurement: Opus vs GPT, Opus vs MiniMax, GPT vs MiniMax; take minimum for conservative trio κ
- Success criterion: conservative trio κ ≥ 0.70 substantial agreement
- If κ < 0.70: trio validity compromised, v6 re-evaluates (PM decision required)
- If κ ≥ 0.70: PM-RATIFY-V6-KAPPA → Phase 2 authorization

**§7 Throttle + concurrency** (amended from v5):
- concurrency: 1 (preserved)
- rpm per alias: `MINIMAX_M27` per OpenRouter tier (verify at probe time), `KIMI_K26` per Moonshot tier (verify), Gemini `rpm:20` retained but unused (orphan declaration OK, not routed)

**§11 Frozen paths** (supersession):
- Supersedes v5 §11
- Pins `litellm-config.yaml` state after MiniMax + Kimi additions (this commit's tree state)
- All other frozen paths retained from v5: `runner.ts`, `judge-runner.ts`, `failure-mode-judge.ts`, `health-check.ts`

Other v5 sections (Gate D parameters, budget envelope, Fisher one-sided test specification, halt criteria, output schema) — preserve verbatim unless substantively changed.

### §1.3 Budget envelope update

- v5 envelope: $30 cap / $28 halt / ~$23 expected (Gemini preview-model premium)
- v6 envelope: $60 cap / $55 halt / ~$50 expected (κ re-cal $25 + N=400 $25, no preview premium)

---

## §2 LiteLLM config amendment

### §2.1 Scope

Edit `litellm-config.yaml` under manifest v6 authority to add:

1. **MiniMax M2.7 alias** via OpenRouter:
```yaml
- model_name: minimax-m27-via-openrouter
  litellm_params:
    model: openrouter/minimax/minimax-m2.7
    api_key: os.environ/OPENROUTER_API_KEY
    rpm: <verify at probe time; default 60 if unspecified>
```

2. **Kimi K2.6 alias** via Moonshot direct:
```yaml
- model_name: kimi-k26-direct
  litellm_params:
    model: moonshot/kimi-k2.6
    api_key: os.environ/MOONSHOT_API_KEY
    api_base: https://api.moonshot.ai/v1
    rpm: <verify at probe time>
```

Verify exact model identifiers via OpenRouter + Moonshot catalog discovery before writing config (use §1.3g artefact memo as starting reference; confirm not deprecated).

### §2.2 Retention

- All existing v5 aliases (Opus 4.7, GPT-5.4, Gemini 3.1 Pro Preview) retained in config — do NOT delete Gemini alias even though unused (preserves audit trail; v6 §11 pins this state)
- Existing rpm:20 on `gemini-3.1-pro` alias from Fold-in 3.5a/3.5b retained (orphan OK)

### §2.3 Commit

Single commit under v6 authority. Message format:
`[v6] litellm-config amendment: add minimax-m27 + kimi-k26 aliases per judge swap ratification`

Anchor = v6 commit. CC-1 verifies post-amendment config is the exact state v6 §11 pins.

---

## §3 κ re-calibration execution

### §3.1 Sample

**Full 100-instance κ calibration set** from v5 (identifier in `benchmarks/results/locomo-mini-n20-retry-2026-04-24T00-02-12Z.jsonl` — same authoritative source used for §1.3h split analysis).

Do NOT introduce new instances. Reproducibility-critical that new trio κ is measured on the same instances as original κ=0.7458 three-way measurement.

### §3.2 Judge verdicts

- **Opus 4.7**: reuse existing verdicts from v5 κ set (no new calls; 100 instances already have Opus verdicts)
- **GPT-5.4**: reuse existing verdicts (no new calls)
- **MiniMax M2.7**: NEW execution, 100 calls via v6 alias `minimax-m27-via-openrouter`, verbatim judge prompt from `failure-mode-judge.ts:245-258`, temperature=0.0, matched max_tokens

Total new API calls for κ re-cal: 100 (MiniMax only).

### §3.3 Computation

Three pairwise Cohen's κ:
- κ(Opus, GPT): should match historical κ baseline (~0.74-0.82)
- κ(Opus, MiniMax): new measurement
- κ(GPT, MiniMax): new measurement

Conservative trio κ = min(three pairwise κ values).

Also compute:
- Raw agreement % per pair
- Confusion matrix per pair
- Per-cell breakdown (no-context / retrieval / full-context / oracle-context / agentic)

### §3.4 Success criteria

- κ_conservative_trio ≥ 0.70 → PASS, halt with PM-RATIFY-V6-KAPPA request
- 0.60 ≤ κ_conservative_trio < 0.70 → BORDERLINE, halt with PM adjudication request
- κ_conservative_trio < 0.60 → FAIL, halt with swap-path-re-evaluation request (may require Kimi promoted to primary or backup-judge strategy rework)

### §3.5 Operational hedge — per-instance failover check

During κ re-cal execution (100 MiniMax calls), log:
- Parse success rate (target ≥95/100; lower = concern)
- Latency p50 + p95 (target p50 ≤ 25s)
- Any openrouter routing errors → document; if rate > 5%, raise PM flag before proceeding to κ compute

If MiniMax parse rate < 90/100, PM adjudicates whether to (a) proceed with κ on valid sample or (b) halt and investigate parse issue before commit.

---

## §4 Scope guards

- **HEAD parent** = `005a19a` (§1.3h-C anchor). Any drift → halt with "HEAD_DRIFTED".
- **Manifest v5 immutable** — v5 anchor `fc16925` remains audit-immutable; v6 is supersession, not amendment.
- **§11 frozen paths** per v5 are active UNTIL v6 emission commits; v6 emission itself edits `litellm-config.yaml` as explicit supersession authorized by PM.
- **Other §11 files** (runner.ts, judge-runner.ts, failure-mode-judge.ts, health-check.ts) remain frozen in v6. Do NOT edit.
- **No N=400 execution** in Phase 1. That is Phase 2 post-PM-RATIFY-V6-KAPPA.
- **No Opus/GPT re-verdict generation**. Reuse v5 κ set verdicts for those two judges.

---

## §5 Deliverables (commit to `feature/c3-v3-wrapper`)

Phase 1 artefacts:

1. `benchmarks/preregistration/manifest-v6-preregistration.md` (new pre-reg)
2. `benchmarks/preregistration/manifest-v6-preregistration.yaml` (new pre-reg twin)
3. `litellm-config.yaml` (amended with MiniMax + Kimi aliases)
4. `benchmarks/calibration/v6-kappa-recal/minimax-kappa-responses.jsonl` (100 MiniMax verdicts)
5. `benchmarks/calibration/v6-kappa-recal/kappa-v6-analysis.md` (three pairwise κ + conservative trio κ + per-cell breakdown)
6. `benchmarks/calibration/v6-kappa-recal/v6-kappa-memo.md` (≤250 words: κ values, verdict PASS/BORDERLINE/FAIL, MiniMax operational metrics, cost, wall-clock)

Three sequential commits:
- Commit 1: v6 emission (manifest MD + YAML only, no config edit yet) — this establishes v6 anchor
- Commit 2: litellm-config amendment under v6 authority — references v6 anchor in message
- Commit 3: κ re-calibration artefacts — references v6 anchor

---

## §6 Halt ping format

Emit after Phase 1 completion:

- `phase1_verdict: PASS | BORDERLINE | FAIL | INCONCLUSIVE`
- `v6_anchor: <full sha>` (commit 1)
- `config_amendment_anchor: <full sha>` (commit 2)
- `kappa_recal_anchor: <full sha>` (commit 3)
- `v6_manifest_md_sha: <sha>`
- `v6_manifest_yaml_sha: <sha>`
- `minimax_identifier_used: <string>` (exact from catalog)
- `kimi_identifier_used: <string>` (exact, for future backup activation)
- `kappa_opus_gpt: <float>` (should be consistent with historical baseline)
- `kappa_opus_minimax: <float>`
- `kappa_gpt_minimax: <float>`
- `kappa_conservative_trio: <float>`
- `minimax_parse_success_kappa_set: <int>/100`
- `minimax_latency_p50_kappa_set: <int>s`
- `minimax_latency_p95_kappa_set: <int>s`
- `minimax_routing_errors_count: <int>/100`
- `budget_spent_phase1: $<actual>` (vs $30 Phase 1 cap)
- `wall_clock_phase1: <duration>`
- `next_step_request: PM-RATIFY-V6-KAPPA`
- `cc1_state: HALTED`

CC-1 does NOT self-advance to Phase 2 N=400. Awaits PM ratification.

---

## §7 Budget (Phase 1 only)

- **Phase 1 cap**: $30 (κ re-cal ~$25 expected + overhead)
- **Phase 1 halt**: $35 (full escalation if exceeded)
- **Per-call timeout**: 60s (MiniMax historical 16s p50; 2-min timeout safe)
- **Phase 1 wall-clock cap**: 90 min

Phase 2 (N=400) budget is separate envelope (~$25) and activates post-ratification.

---

## §8 Task #29 trace update (post-Phase 1)

- §2.0 v6 emission: <status>
- §2.1 κ re-calibration: <verdict>
- PM-RATIFY-V6-KAPPA: <pending/ratified>
- Phase 2 authorization: <blocked/authorized>

If PM-RATIFY-V6-KAPPA PASS → PM emits Phase 2 (N=400 execution) brief.
If BORDERLINE → PM adjudicates with borderline-κ path decision.
If FAIL → PM re-evaluates swap path (Kimi promotion, or return to Google waiting, or Branch B reduced coverage).

---

## §9 Authorized by

PM Marko Marković, 2026-04-24 evening. Ratified three-point PM proposal: (1) per-instance backup activation, (2) v6 supersedes v5 §11 freeze, (3) full 100-instance κ re-calibration.

CC-1 may begin immediately. All prereqs in place (keys live, GroupId added, gcloud tooling retained, existing κ set artefacts on disk).
