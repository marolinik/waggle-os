# CC-1 Brief — Manifest v6 Phase 2: N=400 Execution

**Date**: 2026-04-24
**Status**: §2.2 N=400 execution (Phase 2 of 2; Phase 1 PASS ratified)
**Authorized by**: Marko Marković (2026-04-24, pending final GO)
**Predecessors**: Phase 1 PASS (κ_conservative_trio=0.7878, MiniMax 100/100 parse, $0.075 cost); PM-RATIFY-V6-KAPPA ratified
**PM**: claude-opus-4-7 (Cowork)

---

## §0 Context

Manifest v6 judge ensemble swap validated in Phase 1. Conservative trio κ=0.7878 exceeds 0.70 substantial threshold with healthy margin. Operational metrics exemplary (parse 100%, latency 11.9s p50, 0 routing errors). GATE-D-REKICK-GO authorized for Phase 2 N=400 execution with new trio.

Ensemble configuration:
- **Opus 4.7**: anchor judge (existing v5 alias retained)
- **GPT-5.4**: contrast judge (existing v5 alias retained)
- **MiniMax M2.7** via openrouter: primary third judge (v6 alias `minimax-m27-via-openrouter`)
- **Kimi K2.6** via Moonshot direct: backup third judge (v6 alias `kimi-k26-direct`), per-instance failover activation

Phase 2 is pure execution — no config changes, no manifest emission, no pre-registration modification.

---

## §1 Pre-flight checks (halt on any failure)

### §1.1 Code state

- HEAD = `01f7ead` (Phase 1 Commit 3 anchor). Any drift → halt with `HEAD_DRIFTED`.
- Three Phase 1 commits intact on `feature/c3-v3-wrapper`:
  - `60d061e` v6 manifest emission
  - `38a830e` litellm-config amendment
  - `01f7ead` κ re-cal artefacts
- Manifest v6 files present:
  - `benchmarks/preregistration/manifest-v6-preregistration.md` (SHA `31ecb1a9...`)
  - `benchmarks/preregistration/manifest-v6-preregistration.yaml` (SHA `9250f74b...`)

### §1.2 Config state

- `litellm-config.yaml` contains both new aliases:
  - `minimax-m27-via-openrouter` (model: openrouter/minimax/minimax-m2.7)
  - `kimi-k26-direct` (model: moonshot/kimi-k2.6, api_base: https://api.moonshot.ai/v1)
- v5 legacy aliases (opus, gpt, gemini) retained unchanged.

### §1.3 API connectivity

Execute cold pre-flight probes on **both MiniMax and Kimi** to verify production-readiness:

**MiniMax cold check**: 3 calls via `minimax-m27-via-openrouter` alias with judge prompt template from κ re-cal. Target: 3/3 HTTP 200, parseable output, latency p50 consistent with Phase 1 (~12-17s).

**Kimi cold check**: 3 calls via `kimi-k26-direct` alias with same judge prompt. Target: 3/3 HTTP 200, parseable output. This is the first production-class Kimi test under v6 authority — previous §1.3g-h Kimi tests had 5/7 parse rate concern; if cold-check parse <3/3, halt with `KIMI_BACKUP_UNREADY` and request PM adjudication on backup policy.

Total pre-flight cost: ~$0.10. Wall-clock: ~3-5 min.

### §1.4 Scope guards

- §11 frozen paths per v6: `runner.ts`, `judge-runner.ts`, `failure-mode-judge.ts`, `health-check.ts`, `litellm-config.yaml` (new state pinned in v6). All untouched.
- Pre-registration artefacts (v6 MD + YAML) immutable.
- No new Opus/GPT verdicts generated outside N=400 scope.

---

## §2 N=400 execution

### §2.1 Sample

**Full N=400 canonical fixture** from v5 pre-registration. Identifier: authoritative LoCoMo-mini N=400 frozen fixture (same reference used in v5 pre-reg §N). CC-1 verifies fixture SHA matches v6 §N declaration before kickoff.

Cell distribution (as declared in v6 §5):
- no-context: 80 instances
- retrieval: 80 instances
- oracle-context: 80 instances
- full-context: 80 instances
- agentic: 80 instances

### §2.2 Execution parameters

Preserved from v5 (unchanged in v6):
- `concurrency: 1`
- `temperature: 0.0`
- `max_tokens` per-model per existing judge-runner defaults
- Retry policy: up to 3 transient-error retries per instance
- Timeout: 60s per judge call

Amended in v6 (judge ensemble):
- Subject model: Qwen 3.5 35B-A3B (unchanged; authoritative LOCKED per `project_target_model_qwen_35b.md`)
- Judge ensemble primary: Opus 4.7 + GPT-5.4 + MiniMax M2.7
- Judge backup: Kimi K2.6 (per-instance failover per §2.3 below)

### §2.3 Per-instance failover (v6 backup policy)

For each of 400 instances, ensemble execution sequence:

1. Subject call (Qwen 3.5 35B-A3B per cell-specific configuration)
2. Parallel judge calls: Opus 4.7 + GPT-5.4 + MiniMax M2.7 (primary trio)
3. **Backup activation check per instance**:
   - If MiniMax returns parseable verdict → use MiniMax verdict, no Kimi call
   - If MiniMax returns API error (5xx, timeout >60s, routing failure) OR parse failure → trigger Kimi fallback
   - Kimi called with identical prompt + context as MiniMax would have received
   - If Kimi returns parseable verdict → use Kimi verdict, mark instance `backup_activated: true` in output
   - If Kimi also fails → mark instance `judge_ensemble_fail: true`, exclude from primary hypothesis analysis, retain in dataset for reporting transparency

4. Verdict aggregation: standard manifest v5/v6 §5.2 majority voting protocol (2-of-3 quorum on primary cells, tie-break policy on splits per existing runner logic)

### §2.4 Logging requirements per instance

Record in output JSONL:
- `instance_id`, `cell`, `subject_response`, `subject_latency_ms`
- Per judge: `<judge>_verdict`, `<judge>_raw_response`, `<judge>_latency_ms`, `<judge>_tokens_in`, `<judge>_tokens_out`
- `minimax_backup_triggered: true|false` (backup activation flag per instance)
- If triggered: `minimax_failure_reason` (api_error|parse_fail|timeout), `kimi_verdict`, `kimi_raw_response`, `kimi_latency_ms`, `kimi_tokens`
- `judge_ensemble_fail: true|false` (terminal failure flag)
- `ensemble_majority_verdict`, `ensemble_vote_pattern` (e.g., `opus=correct,gpt=incorrect,minimax=correct,majority=correct`)

### §2.5 Operational hedge + halt triggers

During execution, log cumulative metrics. Halt conditions:

- **Budget halt**: spend > $28 → pause + request PM adjudication (cap $30, halt 93%)
- **Backup activation rate**: if >10% of completed instances trigger backup (i.e., >40 backup activations in first 400) → pause + PM flag (signals MiniMax production reliability issue)
- **Ensemble fail rate**: if >2% of completed instances return `judge_ensemble_fail: true` (>8 failures) → pause + PM adjudication
- **Parse rate per-judge watch**: if MiniMax parse <90% OR Kimi parse <85% on triggered instances → log watch status; >95% cumulative errors = halt

Do NOT auto-retry beyond the 3-retry per-instance policy. Systematic failure requires PM adjudication, not quiet auto-recovery.

---

## §3 Deliverables (commit to `feature/c3-v3-wrapper`)

Phase 2 artefacts:

1. `benchmarks/results/stage3-n400-v6-results.jsonl` — 400 instances with full ensemble verdicts, backup activation flags, judge-level metrics
2. `benchmarks/results/stage3-n400-v6-analysis.md` — aggregate statistics, per-cell accuracy, Fisher one-sided test on primary hypothesis (H1: retrieval > no-context), confidence intervals, ensemble voting pattern breakdown
3. `benchmarks/results/stage3-n400-v6-operational-report.md` — execution metrics: per-judge parse rate, latency distribution (p50/p95/p99), backup activation rate, ensemble failure rate, cost breakdown per judge, wall-clock
4. `benchmarks/results/stage3-n400-v6-memo.md` (≤300 words) — verdict on primary hypothesis, key findings, any operational anomalies, recommended Gate D exit path

Single commit after all artefacts ready. Commit message:
`[v6] stage 3 n=400 execution complete: H1=<PASS|FAIL>, ensemble=<summary>, cost=$<actual>`

---

## §4 Halt ping format

Emit at completion:

- `execution_verdict: COMPLETE | PARTIAL | ABORTED`
- `n400_anchor: <full sha>`
- `artefact_shas: { results_jsonl, analysis_md, operational_report_md, memo_md }`

**Primary hypothesis (H1)**:
- `h1_subject_pass_rate_retrieval: <float>` (% correct on retrieval cell)
- `h1_subject_pass_rate_no_context: <float>` (% correct on no-context cell)
- `h1_difference_pct_points: <float>`
- `h1_fisher_one_sided_p_value: <float>`
- `h1_verdict: PASS (p<0.10) | FAIL`

**Secondary cells (descriptive)**:
- `pass_rate_oracle_context, pass_rate_full_context, pass_rate_agentic` per cell

**Ensemble operational**:
- `minimax_backup_triggered_count: <int>/400`
- `kimi_backup_success_count: <int>/<triggered>`
- `judge_ensemble_fail_count: <int>/400`
- `minimax_parse_rate: <float>`
- `kimi_parse_rate: <float>` (only on triggered instances)
- `minimax_latency_p50, p95`
- `kimi_latency_p50, p95` (only on triggered)

**Budget & timing**:
- `budget_spent_phase2: $<actual>` (vs $30 cap)
- `wall_clock_phase2: <duration>` (vs 180-min cap)

**Next step**:
- `next_step_request: PM-RATIFY-V6-N400-COMPLETE` (if COMPLETE)
- `next_step_request: PM-ADJUDICATE-V6-N400-<issue>` (if PARTIAL or ABORTED)
- `cc1_state: HALTED`

CC-1 does NOT self-advance to Gate D exit. PM ratifies completion + authorizes Gate D exit artefact generation (separate brief if required).

---

## §5 Budget + timing

- **Phase 2 cap**: $30 (pre-flight $0.10 + N=400 execution ~$25-28)
- **Phase 2 halt**: $28 (budget soft halt; PM adjudication before resume)
- **Phase 2 hard halt**: $30 (emergency stop)
- **Wall-clock cap**: 180 min (includes pre-flight + execution + artefact generation)

Realistic wall-clock estimate:
- Pre-flight (§1.3): 5 min
- N=400 execution: 90-150 min (concurrency=1 bottlenecked by MiniMax p50 ~12-17s per instance + Opus/GPT parallel; 400 × 15s avg = 100 min execution baseline + overhead)
- Analysis + commits: 20 min
- Total: 2-3h

---

## §6 Agentic cell PM-flag (acknowledged, non-blocking)

Per Phase 1 finding: agentic cell κ(GPT, MiniMax) = 0.6875 is the only sub-0.70 pair at cell level. Aggregate trio κ=0.7878 passes, primary hypothesis H1 is on retrieval + no-context (κ=0.8936 + 1.0000), so this does NOT gate Phase 2 execution.

Phase 2 artefacts must include **agentic-cell diagnostic section** in `stage3-n400-v6-analysis.md`:
- Per-instance ensemble vote pattern specifically for agentic cell (80 instances)
- Any observed anomalies (high split-vote rate, backup activation clustering, unusual latency patterns)
- This is descriptive-only; no gating on agentic metrics

Post-Phase 2, agentic cell findings feed into Task 2.6 backlog (Stratified κ calibration re-design for future benchmarks).

---

## §7 Task #29 trace update (post-Phase 2)

- §2.2 N=400 execution: <verdict>
- PM-RATIFY-V6-N400-COMPLETE: <pending/ratified>
- Gate D exit: <blocked/authorized>

If H1 PASS (Fisher p < 0.10): SOTA claim path enabled → PM evaluates claim framing (primary target 91.6% LoCoMo baseline achieved or exceeded?)
If H1 FAIL: separate discussion on claim scope adjustment; benchmark result stands as honest-null for thesis

---

## §8 Authorized by

PM Marko Marković, 2026-04-24, PM-RATIFY-V6-KAPPA ratification. Pending Phase 2 GO signal.

CC-1 may begin immediately upon receipt of this brief. All prereqs verified via Phase 1 execution. Pre-flight probes (§1.3) are the new-code-path before full N=400 kick.
