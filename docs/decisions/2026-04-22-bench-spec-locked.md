# Bench-Spec LOCK — Stage 2 Mini + Full (H-42a/b)

**Datum:** 2026-04-22
**Sprint:** 11 · Track A · Task A3
**Authority:** PM (Marko Marković) — 7/7 A3 interview zatvoren 2026-04-22 PM via Cowork ratification
**Sources:**
- Sprint 11 backlog: A3 "Benchmark spec LOCK" exit criterion
- A1 ratification `PM-Waggle-OS/decisions/2026-04-22-h-audit-1-design-ratified.md` (scope inheritance §Q1–Q5)
- B1 LOCK `PM-Waggle-OS/decisions/2026-04-22-stage-2-primary-config-locked.md` (Stage 2 primary config referenced by §4)
- B2 LOCK `PM-Waggle-OS/decisions/2026-04-22-tie-break-policy-locked.md` (quadri-vendor + PM-escalation referenced by §4)
- B3 LOCK `PM-Waggle-OS/decisions/2026-04-22-model-route-naming-locked.md` (Surface A/B naming referenced throughout)
- Sprint 10 κ=0.7458 baseline (referenced by §4)

**Status:** LOCKED — binding for Stage 2 mini (C3) and Stage 2 full (H-42a/b). Revision allowed only via explicit PM ratification that supersedes this doc.

**Scope:** Benchmark protocol for Stage 2 evaluation of `qwen3.6-35b-a3b-stage2` on LoCoMo, including four-cell mini (C3) and full H-42a/b run with Opus 4.6 probe control arm.

---

## 1. Decision summary

Seven bench-spec axes LOCKED:

1. **Threshold tiering with dual CI.** Point estimate threshold ≥ 91.6% (Mem0 LoCoMo SOTA reper); Wilson score 95% CI (primary) + conversation-level cluster-bootstrap 95% CI (secondary, 10 000 iterations, seed 42). Four verdict tiers: STRONG-PUBLISHABLE / PUBLISHABLE / WEAK / FAIL, defined in §2.
2. **Instance counts and budget envelope.** Stage 2 mini: N=100 per cell × 4 cells = 400 evaluations. Stage 2 full: Qwen N=1540 × 3 runs + Opus probe N=500 × 3 runs = 6120 evaluations (H-42a) + 4620 primary evaluations on Qwen (H-42b dedup frame). Budget ceiling $2600 hard; expected $1300–2300, defined in §3.
3. **Multiple comparisons via tiered framing.** Mini (C3) is declared exploratory — all metrics reported with descriptive CIs, no family-wise correction, no pass/fail gating of downstream work on a single mini metric. Full (H-42a/b) declares one single primary confirmatory hypothesis H1: Qwen3.6-35B-A3B-Thinking ≥ 91.6% point estimate on LoCoMo with Wilson lower bound ≥ 89.0%. All other reported metrics on full run are secondary descriptive. No Bonferroni / BH correction needed because only H1 is confirmatory. Defined in §5.
4. **Judge ensemble composition and quality monitoring.** Status quo 3+1: Opus 4.7 + GPT-5.4 + Gemini 3.1 primary + xai/grok-4.20 tie-break reserve. Consistency constraint: same physical judge models on mini and full. κ monitoring rules: Fleiss' κ computed per Stage 2 run; <0.65 flag PM review; drop >0.10 from Sprint 10 baseline (κ=0.7458) HALT run. Defined in §4.
5. **Failure mode taxonomy — hybrid F1–F6 + F-other.** Six LOCKED categorical failure modes: F1 contradicts-ground-truth, F2 partial-answer, F3 off-topic, F4 refusal, F5 tool-use-error, F6 format-violation, plus null (correct) and F-other (requires mandatory `rationale` field with ≥10-word free text). Judge rubric updated per §6.
6. **Reproducibility manifest — hybrid markdown + YAML with 16 required fields.** Canonical manifest lives as markdown (this doc's §7 embedded template + per-run copy at `PM-Waggle-OS/decisions/<DATE>-stage2-<mini|full>-manifest.md`) with parallel machine-readable YAML twin at same basename `.manifest.yaml`. CI sync guard in §8 freezes drift between the two surfaces. Storage path and versioning protocol defined in §7.
7. **Reasoning_content retention for Stage 2.** Tier 2 of A2 §Q5 applies verbatim to Stage 2 mini and full runs: full JSONL with `reasoning_content` preserved (unpruned) goes to gzipped archive. Bundle layout + tiered access policy + retention horizon defined in §9.

## 2. Threshold tiering and confidence intervals

Primary reference: Mem0 LoCoMo 91.6% single-run SOTA. All Stage 2 numbers compare against this reference.

**Verdict tiers (evaluated on full H-42a/b aggregate across 3 runs):**

- **STRONG-PUBLISHABLE** — Point estimate ≥ 91.6% **and** Wilson 95% lower bound ≥ 91.6% **and** cluster-bootstrap 95% lower bound ≥ 91.6%. Launch-ready claim.
- **PUBLISHABLE** — Point estimate ≥ 91.6% **and** Wilson 95% lower bound ≥ 89.0%. Claim supportable with appropriate CI disclosure.
- **WEAK** — Point estimate in [89.0%, 91.5%]. Do NOT claim SOTA. May publish as "approaching SOTA" with explicit caveats. Triggers PM-review-gate before any external-facing use.
- **FAIL** — Point estimate < 89.0%. Do NOT publish. Triggers post-mortem.

**Why Wilson primary + cluster-bootstrap secondary.** Wilson score interval is the correct frequentist CI for Bernoulli proportion on instance-level binary verdicts; it is tighter than Wald at boundaries and does not require normal approximation. Cluster-bootstrap is the correct non-parametric approach for LoCoMo's structural dependence: each conversation (~300 per cell) contributes multiple instances, violating Wilson's independence assumption. Reporting both hedges against the case where intra-cluster correlation is higher than expected and Wilson would underestimate uncertainty. If Wilson and bootstrap disagree on which tier the run lands in, the more conservative tier prevails.

**Cluster-bootstrap parameters LOCKED:** 10 000 iterations, seed 42 (matches A1 seed convention), cluster unit = conversation_id, resample with replacement at cluster level, compute percentile 2.5/97.5 for CI.

**Per-cell mini (C3) reporting:** Same Wilson + cluster-bootstrap CIs, but no tier assignment. Mini is exploratory; numbers are informational inputs to A3 v2 pre-registration refinement (§5).

## 3. Instance counts and budget envelope

**Stage 2 mini (C3) — exploratory four-cell.** N=100 per cell × 4 cells = 400 evaluations. Cells per B1 LOCK: raw / filtered / compressed / full-context. Cost model: Qwen3.6-35B-A3B-Thinking via OpenRouter bridge ~$0.15/1K output tokens × ~2K output × 400 = ~$120 target; judge triple ~$0.05/instance × 400 = ~$20; tie-break sparse; aggregate target $120–200, hard cap $250 per C3 exit-criterion budget.

**Stage 2 full — H-42a/b.** Primary run: Qwen3.6-35B-A3B-Thinking, N=1540 (LoCoMo full), 3 independent seeded runs for stability. Opus 4.6 probe control arm: N=500 (LoCoMo stratified subsample matching H-42b hypothesis), 3 runs. Total target: 4620 Qwen evaluations + 1500 Opus evaluations = 6120 primary evaluations. Judge triple runs on every primary evaluation; tie-break fires on ~2–5% of evaluations per ensemble-tiebreak module expected split rate.

**Budget envelope LOCKED:**

| Component | Expected | Ceiling |
|---|---|---|
| Qwen3.6-35B-A3B primary (4620 evals) | $600–1100 | $1400 |
| Opus 4.6 probe (1500 evals) | $200–350 | $450 |
| Judge triple (6120 × 3 judges) | $450–750 | $900 |
| Tie-break grok-4.20 (~200 fires) | $5–15 | $40 |
| Buffer / retries | $45–85 | $110 |
| **Total** | **$1300–2300** | **$2600** |

Hard abort if cumulative spend crosses $2600 at any mid-run checkpoint.

**N=1540 justification.** LoCoMo official eval set has 1540 instances per dataset card. Running full rather than stratified subsample eliminates stratification-bias concerns that would otherwise need to be addressed in publication methods section. Running 3 seeded repeats provides a 4620-evaluation aggregate that gives Wilson 95% half-width of ~0.85pp at p̂=91.6%, which is tight enough to resolve PUBLISHABLE vs WEAK boundary with statistical confidence.

**Opus 4.6 probe (N=500) justification.** Not a full confirmatory run; designed as a control to answer "is H-42b's claim directionally correct — does Opus 4.6 approach or exceed Mem0's 91.6% on LoCoMo under our harness?" N=500 at p̂≈0.90 yields Wilson 95% half-width of ~2.6pp, sufficient to distinguish "meaningfully above Mem0" from "meaningfully below" but not to make a STRONG-PUBLISHABLE claim for Opus. If Opus probe lands in PUBLISHABLE tier, that is a secondary dual-axis narrative input (Marko's multiplier thesis dual-axis framing) but not a launch-blocker.

## 4. Judge ensemble and consistency constraints

**Primary ensemble LOCKED (status quo from Sprint 10 Task 2.2):**
- `anthropic/claude-opus-4-7` (Surface A floating alias per B3 LOCK §1; dated snapshot per Stage 2 run resolved and pinned in that run's manifest per §7).
- `openai/gpt-5.4`
- `google/gemini-3.1`

**Tie-break reserve LOCKED (B2 §1):** `xai/grok-4.20`. Fires on 1-1-1 three-way split per `resolveTieBreak(votes, {path: 'quadri-vendor'})`. 2-2 defensive tie yields `pm-escalation` path (never silent coin-flip).

**Consistency constraint.** The same three physical primary judges + same tie-break must run across mini and full. If any judge model has a provider rotation (floating alias resolves to a new dated snapshot mid-campaign), the rotation is flagged in the manifest (§7 field `judge_dated_snapshots`) and the mini is rerun before accepting the full. This prevents the mini from calibrating to one set of snapshots and the full to another.

**κ monitoring.** Fleiss' κ computed across primary triple on every Stage 2 run (mini and full) over the pre-tie-break vote matrix (i.e., before `resolveTieBreak` fires). Baseline: κ=0.7458 from Sprint 10 Task 2.2 LIVE calibration.

- κ ≥ 0.65 — pass, no flag.
- 0.60 ≤ κ < 0.65 — PASS-WITH-FLAG, run completes, but exit ping must note the drop and PM reviews before advancing to next stage.
- κ < 0.60 OR κ drops >0.10 from Sprint 10 baseline (i.e., κ < 0.6458) — HALT mid-run. Do NOT clean up partial JSONL. Write `sessions/<DATE>-stage2-halted-kappa-drop.md` with captured state and notify PM.

κ drop of this magnitude signals judge-prompt drift or provider-schema drift affecting judge reliability. Investigation precedes any reuse of the harness.

## 5. Multiple comparisons — tiered framing

The multiple-comparisons problem would arise if we treated every reported metric as a separate hypothesis requiring significance. We avoid it by explicitly declaring which metrics are confirmatory vs exploratory/descriptive.

**Mini (C3) declaration.** All mini metrics are **exploratory / descriptive**. No pass/fail gating. No family-wise correction. Output serves two purposes: (a) harness readiness check, (b) input to the A3 v2 pre-registration refinement for the full run. If mini discovers an unexpected failure pattern (e.g., F3 off-topic rate >20% in one cell), that finding informs v2 — it does not constitute a publishable claim.

**Full (H-42a/b) declaration.** Exactly one confirmatory hypothesis:

> **H1 (primary confirmatory):** Qwen3.6-35B-A3B-Thinking achieves ≥ 91.6% point estimate on LoCoMo with Wilson 95% lower bound ≥ 89.0% (PUBLISHABLE tier per §2).

All other full-run numbers (per-cell rates, failure mode distributions, latency quantiles, reasoning-shape distribution, Opus 4.6 probe result, etc.) are **secondary descriptive**. They are reported with appropriate CIs but are not subject to significance testing and do not require multiple-comparisons correction.

**Pre-registration protocol LOCKED — tiered v1/v2/vN+1:**

- **v1** is frozen at A3 LOCK (this doc). v1 manifest = §7 template + parallel YAML. Any run executed against v1 is bound to v1 parameters.
- **v2** may be issued at mini (C3) exit if mini surfaces a material harness or methodology refinement. v2 must explicitly cite what changed vs v1 and why. v2 requires PM ratification in a new decision doc.
- **vN+1** protocol: any subsequent change to manifest parameters after full run kicks off requires HALT of in-flight run, new decision doc, and new manifest hash. No mid-run amendments without HALT-and-restart.

**H-AUDIT-2 integration.** Per A1 ratification §Q3, the harness logger emits `bench.preregistration.manifest_hash` event on run start carrying the SHA-256 of the frozen YAML manifest. This event is the audit anchor: any subsequent claim that a run conformed to v1 must demonstrate that event's hash matches v1 YAML hash at the run's commit.

## 6. Failure mode taxonomy — hybrid F1–F6 + F-other

Categorical failure modes LOCKED for all Stage 2 runs:

- **F1 — contradicts-ground-truth.** Model output asserts a fact that directly contradicts the LoCoMo reference answer. Most severe failure class.
- **F2 — partial-answer.** Model output contains correct information but is incomplete against the reference's required components.
- **F3 — off-topic.** Model output is tangentially related or addresses a different question than asked.
- **F4 — refusal.** Model declines to answer (safety response, capability disclaimer, "I don't know").
- **F5 — tool-use-error.** Model attempted a tool call but the harness returned an error, a malformed response, or an infinite loop; applies only in cells where tool use is permitted.
- **F6 — format-violation.** Model output is correct in content but violates the required output format (JSON schema mismatch, wrong key names, escape errors).

Plus:

- **null (correct)** — judge triple majority verdict is "correct" per rubric. No F-code assigned.
- **F-other** — judge identifies a failure that does not fit F1–F6. Mandatory `rationale` field with ≥ 10-word free-text explanation. F-other rate on any run > 10% triggers taxonomy review and potential v2 amendment (§5 protocol).

**Judge rubric update.** Rubric prompt includes the F1–F6 taxonomy verbatim, with a single-line instruction "If no category fits, select F-other and provide ≥10-word rationale explaining the failure." Rubric path cited in manifest (§7 field `judge_rubric_path`).

**Per-instance output schema (JSONL row extension):**

```json
{
  "verdict": "correct" | "incorrect",
  "failure_code": null | "F1" | "F2" | "F3" | "F4" | "F5" | "F6" | "F_other",
  "failure_rationale": string | null
}
```

`failure_rationale` is non-null iff `failure_code == "F_other"`.

## 7. Reproducibility manifest — hybrid format, 16 required fields

**Canonical surface:** markdown decision doc (human-readable primary). Parallel surface: YAML twin (machine-readable, CI-checkable).

**Per-run manifest path convention:**

- Mini (C3): `PM-Waggle-OS/decisions/2026-XX-XX-stage2-mini-manifest.md` + `.manifest.yaml`
- Full (H-42a/b): `PM-Waggle-OS/decisions/2026-XX-XX-stage2-full-manifest.md` + `.manifest.yaml`

The manifest is emitted once per run kickoff and frozen. Any mid-run change requires HALT per §5 vN+1 protocol.

**16 required fields LOCKED:**

1. `manifest_version` — semver-like, e.g. `v1.0.0` for A3 LOCK v1.
2. `manifest_hash` — SHA-256 of the YAML file content, computed pre-freeze. Emitted as `bench.preregistration.manifest_hash` event on run start.
3. `run_id` — ULID or UUID assigned by harness at kickoff.
4. `run_stage` — `mini` | `full`.
5. `target_model` — Surface B dated snapshot per B3 LOCK (e.g., `qwen3.6-35b-a3b-stage2-20260422`).
6. `target_model_thinking_mode` — `on` | `off`. Stage 2 LOCKED `on` per B1.
7. `judge_primary` — array of 3 Surface B dated snapshots for Opus + GPT + Gemini, resolved at run kickoff.
8. `judge_tiebreak` — Surface B dated snapshot for grok-4.20.
9. `judge_rubric_path` — path to judge prompt file (expected under `benchmarks/harness/prompts/`).
10. `dataset` — `locomo` fixed; `dataset_version` field carries the LoCoMo release hash.
11. `instance_count` — per-cell and aggregate counts.
12. `cells` — array of cell configs (raw / filtered / compressed / full-context) with per-cell parameters.
13. `ci_method` — fixed `wilson_95 + cluster_bootstrap_95` with bootstrap seed 42 and iterations 10 000.
14. `failure_taxonomy_version` — fixed `F1-F6+other v1` (this doc §6).
15. `budget_cap` — hard USD ceiling (§3 values).
16. `retention_policy` — fixed `A2-Q5-tier-2-full-preserved` with pointer to §9.

**Versioning protocol.**

- v1 (frozen at A3 LOCK): this doc + accompanying `2026-04-22-bench-spec-locked.manifest.yaml`.
- v2 issued at mini (C3) exit iff mini surfaces material change. PM ratification required via new decision doc.
- Manifest hash changes on any YAML byte change. The hash is the audit anchor.

## 8. CI sync guard — freeze markdown/YAML drift

**Problem:** Hybrid format risks drift between the human-readable markdown and the machine-readable YAML. Drift silently undermines the audit trail.

**Guard mechanism LOCKED:**

A new CI script `scripts/check-manifest-sync.mjs` (to be added to waggle-os repo; authorization granted below) performs the following on every PR touching `PM-Waggle-OS/decisions/**-manifest.md` or `**.manifest.yaml`:

1. Enumerate all `*-manifest.md` files in `PM-Waggle-OS/decisions/`.
2. For each, require a sibling `*.manifest.yaml`.
3. Parse the markdown, extract the 16 required fields from the structured "Fields" section (convention: a fenced YAML block in the markdown mirrors the YAML file content).
4. Parse the YAML file.
5. Assert byte-level equality of the parsed field set.
6. On any mismatch: fail CI with a diff output showing which fields diverged.

**Authorization for CC-1 to implement:** PM authorizes the script addition as a waggle-os repo change, scoped as a low-priority ticket for inclusion in the Sprint 11 close commit or first Day-3 commit (alongside B3 LOW cleanup items). Budget: $0 (read-only CI check). Validation gates: the script must produce a known-good pass on this doc's v1 manifest pair, and a known-fail on an intentionally divergent test fixture.

**Pre-CI adoption (interim):** Until the script lands, the manifest author (PM for v1) manually verifies synchronization at the time of commit. Commit message should state "Manifest sync verified manually — CI guard pending script landing."

## 9. Reasoning_content retention for Stage 2

**LOCK.** A2 §Q5 Tier 2 retention applies verbatim to Stage 2 mini and Stage 2 full H-42a/b runs.

**What goes to archive.** Full JSONL with `reasoning_content` preserved (unpruned). No runtime-style `includeReasoning: false` filter applied to the archived copy. Storage cost is negligible against audit-trail value; unpruned is LOCKED.

**Bundle layout LOCKED:**

```
waggle-os/benchmarks/archive/2026-XX-XX-stage2-<mini|full>.tar.gz
├── runs/
│   ├── qwen-run-1.jsonl       (full reasoning_content preserved)
│   ├── qwen-run-2.jsonl
│   ├── qwen-run-3.jsonl
│   ├── opus-probe-run-1.jsonl  (full only; mini omits this)
│   ├── opus-probe-run-2.jsonl
│   └── opus-probe-run-3.jsonl
├── aggregates/
│   ├── qwen-aggregate.json     (Wilson + bootstrap CI, F-distributions, κ)
│   └── opus-aggregate.json     (full only)
├── manifest.yaml               (frozen vN, matches §7 §8)
├── manifest.md                 (markdown twin)
├── exit-ping.md                (from PM-Waggle-OS/sessions/<DATE>-stage2-<mini|full>-exit.md)
├── git-state.txt               (commit hash + dirty flag + branch at kickoff)
├── docker-state.txt            (`docker images --digests` + `docker ps` snapshots)
└── README.md                   (1-page index for archive auditor)
```

**Access policy — tiered.**

- **Internal (Egzakta team / repo write access):** open. Direct download and unpack. Low friction for engineering / research iteration.
- **External (regulator / partner audit / due diligence):** PM signoff required. Access log entry recorded in `PM-Waggle-OS/audit-log/<DATE>-<requester>-<purpose>.md`. Chain-of-custody preserved for EU AI Act audit triggers and equivalent regulator requests.
- **Hybrid cases** (e.g., external consultant operating under Egzakta MSA): default to external tier; PM may grant ad-hoc internal-equivalent access with written rationale in the same audit log.

**Retention horizon LOCKED.**

- Minimum 12 months from run completion (inherits A2 §Q5 floor).
- Indefinite while the run supports an active launch claim (H-42a/b backs the SOTA narrative on Waggle/KVARK landing and any external collateral — retention lasts while that claim is live).
- Plus 24 months post-decommissioning of the launch claim. Decommissioning event = explicit PM decision doc superseding the SOTA claim OR product line retirement.

**Cost envelope.** Gzipped full run ~30–100MB × 6 runs × ~$0.02/GB/mo S3 standard ≈ ~$0.30/year for the entire set. Negligible against audit-trail value.

## 10. Validation gates

Before C3 (Stage 2 mini) kickoff is authorized to run against this LOCK:

1. Parallel YAML manifest `2026-04-22-bench-spec-locked.manifest.yaml` committed to `PM-Waggle-OS/decisions/` alongside this doc. SHA-256 hash recorded in commit message.
2. `scripts/check-manifest-sync.mjs` spec documented (§8). Implementation may follow; interim manual sync verification is acceptable.
3. H-AUDIT-2 logger emits `bench.preregistration.manifest_hash` event with the v1 hash on first Stage 2 invocation. Spot-verified in mini exit ping.
4. Mini (C3) kickoff brief cites this LOCK by path.
5. Mini exit ping reports: κ per run, Wilson + bootstrap CI per cell, failure-code distribution including F-other rationale sample, manifest hash match, budget actual vs expected.

Before H-42a/b (Stage 2 full) kickoff:

1. Mini (C3) exit completed and PASS-with-or-without-flag reviewed by PM.
2. v2 manifest issued if mini surfaced material change; otherwise v1 carries forward with explicit "v1 carried forward" note in full kickoff brief.
3. Dated snapshots for all 3 primary judges + 1 tie-break + target model re-resolved and pinned at run kickoff time (prevents mini-vs-full snapshot drift per §4 consistency constraint).
4. Budget guard in harness configured to hard-abort at $2600 cumulative.

## 11. Out of scope

- **Provider rotation policy** for floating alias → dated snapshot resolution timing (owned by B3 LOCK §6 + harness maintainer).
- **Judge rubric evolution** beyond the F-taxonomy update in §6. Any substantive rubric change requires separate ratification.
- **Tertiary metrics beyond F1–F6** (e.g., fine-grained reasoning-chain analysis) — not blocked by this LOCK but not in scope for H-42a/b primary confirmatory claim.
- **Third-party replication by external researchers** — out of scope; LOCK governs our internal run. If external replication is pursued later, a separate replication protocol doc handles it.
- **Landing copy / marketing narrative derivation** from H-42a/b results — separate PMM decision per multiplier thesis dual-axis framing.

## 12. Related

- `PM-Waggle-OS/decisions/2026-04-22-bench-spec-locked.manifest.yaml` — v1 YAML twin, machine-readable surface per §7.
- `PM-Waggle-OS/decisions/2026-04-22-h-audit-1-design-ratified.md` — A1 ratification (reasoning_content, retention Tier 1/2, turnId plumbing inheritance).
- `PM-Waggle-OS/decisions/2026-04-22-stage-2-primary-config-locked.md` — B1 Stage 2 primary config (thinking mode, cells).
- `PM-Waggle-OS/decisions/2026-04-22-tie-break-policy-locked.md` — B2 quadri-vendor tie-break + PM-escalation defensive path.
- `PM-Waggle-OS/decisions/2026-04-22-model-route-naming-locked.md` — B3 Surface A/B naming convention.
- `PM-Waggle-OS/sessions/2026-04-22-sprint-11-h-audit-1-exit.md` — A2 implementation exit ping.
- `PM-Waggle-OS/sessions/2026-04-22-sprint-11-b1-stage2-config-exit.md` — B1 exit ping.
- `PM-Waggle-OS/sessions/2026-04-22-sprint-11-b2-tiebreak-exit.md` — B2 exit ping.
- `PM-Waggle-OS/sessions/2026-04-22-sprint-11-b3-opus46-audit-exit.md` — B3 audit exit ping.
- `PM-Waggle-OS/briefs/2026-04-22-cc-c2-stage1-mikroeval-kickoff.md` — C2 Stage 1 mikro-eval brief (upstream of C3).
- Sprint 11 master status: `PM-Waggle-OS/sessions/2026-04-23-sprint-11-day-2-am-status.md`.

---

**LOCKED. A3 CLOSED 7/10 → 7/10 Sprint 11 exit criteria. C3 unblocked. H-42a/b cleared for kickoff pending C3 PASS and v1/v2 manifest carry-forward. CC-1 authorized to implement §8 CI sync guard in Sprint 11 close commit or Day-3. Any manifest parameter change post-LOCK requires explicit PM ratification via new decision doc.**
