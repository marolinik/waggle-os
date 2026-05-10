# Stage 2 Full (H-42a/b) Kickoff Memo — DRAFT (pending C3 PASS)

**Status:** **DRAFT — pending C3 PASS exit ping.** This memo is structurally complete; the sections marked `<TBD-from-C3>` get populated within minutes of C3 exit ping landing in `PM-Waggle-OS/sessions/`. After population, this file is renamed to `2026-04-22-stage-2-full-kickoff-memo.md` and committed as final B4 deliverable.

**Datum (final):** 2026-04-22 (or actual date of finalization if C3 lands later)
**Sprint:** 11 · Track B · Task B4
**Authority:** PM (Marko Marković)
**Pre-req gates:** A3 ✅ RATIFIED · C3 ✅ PASS (with κ <TBD>, tier <TBD>) · Budget envelope verified

---

## 1. Authorization

H-42a/b Stage 2 full run is **AUTHORIZED to kick off** following C3 PASS readiness signal and PM ratification of this memo. CC-1 owns kickoff and execution; PM reads exit ping and renders the tier verdict per A3 LOCK §2.

This memo binds the run to:

- A3 LOCK v<TBD-v1-or-v2> per `PM-Waggle-OS/decisions/2026-04-22-bench-spec-locked.md` (or v2 supersession doc if C3 surfaced material change requiring v2 issuance).
- C3 readiness signal per `PM-Waggle-OS/sessions/2026-04-22-sprint-11-c3-stage2-mini-exit.md`.
- B1 Stage 2 primary config + B2 tie-break + B3 Surface A/B naming (full LOCK chain inherited).

## 2. C3 readiness assessment

Populated from C3 exit ping after PASS:

- **Verdict:** <TBD: PASS / PASS-WITH-FLAG>
- **κ value:** <TBD> vs Sprint 10 baseline 0.7458 (drop pp: <TBD>)
- **Per-cell tier signal (mini is exploratory, no formal tier — but informational):** <TBD per-cell point + Wilson + bootstrap CI table>
- **Failure distribution:** <TBD F1–F6 + F-other counts; F-other rationale sample if rate >10%>
- **B2 tie-break live-verification:** <TBD: fires count + sample event line>
- **Shape distribution:** <TBD: DashScope native vs OpenRouter unified ratio; consistency with C2 finding>
- **Manifest hash:** <TBD: confirmed match between emit and committed YAML>
- **Budget actual:** <TBD>$ of $250 cap
- **Material change surfaced?** <TBD: YES → A3 v2 required before B4 final / NO → A3 v1 carries forward into H-42a/b>

**PM readiness verdict (rendered after population):** <TBD: GO / HOLD>

## 3. H-42a/b run parameters (binding)

Inherits from A3 LOCK v<TBD>; per-run manifest emitted at kickoff per A3 §7.

**Target arm (H-42a — Qwen primary):**

- Model: `qwen3.6-35b-a3b-stage2` resolved to Surface B dated snapshot at kickoff.
- Mode: `thinking=on`, 64K reasoning budget per B1.
- Dataset: LoCoMo full eval set, N=1540.
- Runs: 3 independent seeded runs (seeds 42, 142, 242).
- Total Qwen evaluations: 4620.

**Control arm (H-42b — Opus 4.6 probe):**

- Model: `anthropic/claude-opus-4-6` resolved to Surface B dated snapshot at kickoff (subject to B3 LOCK §3 verification — must be valid against Anthropic's published snapshot list at PR review time).
- Dataset: LoCoMo stratified subsample N=500 matching H-42b methodology.
- Runs: 3 independent seeded runs (seeds 42, 142, 242).
- Total Opus evaluations: 1500.

**Judge ensemble (both arms):**

- Primary 3: Opus 4.7 + GPT-5.4 + Gemini 3.1 (Surface B dated snapshots resolved at kickoff and pinned in per-run manifest per A3 §4 consistency constraint).
- Tie-break: `xai/grok-4.20` (Surface B dated snapshot resolved at kickoff).
- Same physical judges across H-42a and H-42b.

**Aggregate evaluations:** 6120 (4620 Qwen + 1500 Opus).

## 4. Budget envelope (binding)

Per A3 §3:

| Component | Expected | Ceiling |
|---|---|---|
| Qwen primary (4620 evals) | $600–1100 | $1400 |
| Opus probe (1500 evals) | $200–350 | $450 |
| Judge triple (6120 × 3) | $450–750 | $900 |
| Tie-break grok (~200 fires) | $5–15 | $40 |
| Buffer / retries | $45–85 | $110 |
| **Total** | **$1300–2300** | **$2600 hard** |

Hard abort if cumulative spend crosses $2600 at any mid-run checkpoint.

## 5. Exit criteria — tier verdict

H-42a/b is CLOSED with one of four tier verdicts per A3 LOCK §2, applied to the **H-42a (Qwen) aggregate across 3 runs (4620 evaluations)**:

- **STRONG-PUBLISHABLE** — point ≥ 91.6% **and** Wilson lower ≥ 91.6% **and** bootstrap lower ≥ 91.6%. Launch claim ready.
- **PUBLISHABLE** — point ≥ 91.6% **and** Wilson lower ≥ 89.0%. Claim with appropriate CI disclosure.
- **WEAK** — point in [89.0%, 91.5%]. Do NOT claim SOTA. Triggers PM-review-gate before any external use.
- **FAIL** — point < 89.0%. Do NOT publish. Triggers post-mortem.

**H-42b (Opus probe) tier:** secondary descriptive read; not subject to confirmatory hypothesis. Result feeds the multiplier thesis dual-axis narrative as "Opus 4.6 directional comparison vs Mem0 reference" but does NOT gate the Qwen launch claim.

**Conservative rule:** if Wilson and cluster-bootstrap CIs disagree on tier for H-42a, the more conservative tier prevails per A3 §2.

**Required exit ping fields** at `PM-Waggle-OS/sessions/2026-XX-XX-h-42a-b-exit.md`:

- Tier verdict (one of four).
- Per-arm aggregate: point estimate, Wilson 95% CI, cluster-bootstrap 95% CI.
- Per-run breakdown for both arms (3 runs × 2 arms = 6 sub-tables).
- κ per run + drop-from-baseline per run.
- Failure code distribution per arm.
- F-other rationale sample (3 random if rate >10%).
- Tie-break fire count + breakdown (1-1-1 vs 2-2 escalation).
- Shape distribution per arm.
- Manifest hash match verification.
- Budget actual breakdown by call class.
- Tier 2 archive bundle pointer.

## 6. Abort criteria

Mid-run abort if ANY:

- Budget burn > $2600 cumulative at any partial-run checkpoint.
- κ < 0.60 OR drop >10pp from Sprint 10 0.7458 baseline (i.e., κ < 0.6458) on any run's mid-checkpoint (every 500 evaluations).
- LiteLLM `/health` flips unhealthy and does not recover within 5 minutes of restart attempt.
- Persistent NETWORK_ERROR for >5 consecutive calls on same target model (full run threshold higher than C3's 3 because absolute volume is larger).
- `reasoning_content_shape_unknown` drift event fires more than 3x per run (full run threshold higher than C3's 1 because volume is larger; >3 still signals provider schema drift requiring HALT).
- Manifest hash mismatch between emit and committed YAML.
- Provider rotation event mid-run on any judge or target model floating alias (would invalidate per-run manifest pinning).

On abort: write `sessions/<DATE>-h42-aborted-<reason>.md` with captured state; preserve partial JSONL; notify PM immediately.

## 7. Risk register (full-run specific)

Three risks elevated above C3 thresholds because full-run scale magnifies impact:

**R1 — Provider rotation mid-campaign.** Full run takes ~24-72h wall-clock depending on rate limits. Probability that any of 5 model floating aliases (4 judges + 1 target) gets a snapshot rotation by provider during that window is non-trivial. Mitigation: per-run manifest pins all 5 Surface B dated snapshots at kickoff. Detection: pino events log resolved snapshot per call; CC-1 monitors for unexpected snapshot diversity in event stream and HALTs if seen. Recovery: if rotation detected mid-run, HALT and decide between (a) restart with new snapshot pinned (full re-run), (b) restart with old snapshot if still accessible (preferred), (c) defer to next snapshot stability window.

**R2 — Judge κ drift over 24-72h window.** Sprint 10 κ=0.7458 was computed on a single sitting; 24-72h continuous evaluation may reveal degradation patterns invisible at small N. Mitigation: κ computed per run (not just per campaign) so 3 runs give 3 κ values. If any run individually drops below threshold, that run aborts; remaining runs continue if the issue does not generalize. PM reviews κ trend across the 3 runs before tier verdict.

**R3 — Network volatility cumulative effect.** C2 had 1 timeout in 10 instances. At 6120 evaluations, even a 5% transient error rate yields ~300 retries, which strains rate limits and inflates wall-clock. Mitigation: harness retry budget per-instance is honored; persistent errors trigger §6 abort threshold. If wall-clock exceeds 96h, PM reviews whether to continue or restart with adjusted concurrency.

## 8. Post-PASS communication and artifacts

Upon H-42a tier verdict ∈ {STRONG-PUBLISHABLE, PUBLISHABLE}:

- Tier 2 archive bundle created at `waggle-os/benchmarks/archive/2026-XX-XX-stage2-full.tar.gz` per A3 §9 layout. Full JSONL with reasoning_content preserved.
- Audit log entry initialized at `PM-Waggle-OS/audit-log/2026-XX-XX-stage2-full-archive-created.md` with SHA-256 of bundle + retention horizon timer start.
- Tier verdict + Wilson + bootstrap CIs become input to launch claim copy on Waggle/KVARK landing per multiplier thesis dual-axis framing. PMM owns derivation; engineering does not.
- B4 memo (this doc) finalized and committed.
- Sprint 11 retrospective triggered.
- Sprint 12 planning anchored on H-42a/b results + launch sequencing.

Upon H-42a tier ∈ {WEAK, FAIL}:

- WEAK: PM-review-gate before any external claim. Possible paths: (a) accept WEAK and frame launch as "approaching SOTA with explicit caveats", (b) iterate on harness or model config and rerun, (c) defer launch claim. Decision via dedicated PM doc within 7 days of exit.
- FAIL: post-mortem triggered. Investigation scope: harness defect vs model capability vs LoCoMo subset bias vs judge calibration. Multi-day cycle expected. Launch sequencing reconsidered.

H-42b Opus probe result attached as secondary input to multiplier thesis narrative regardless of H-42a tier.

## 9. Sprint 11 close

Upon B4 memo finalization (this doc renamed and committed final), Sprint 11 reaches **10/10 exit criteria CLOSED**:

- A1 ✅ Design doc ratified
- A2 ✅ reasoning_content wire LIVE
- A3 ✅ Bench-spec LOCKED
- B1 ✅ Stage 2 primary config LOCKED
- B2 ✅ Tie-break policy LOCKED + LIVE
- B3 ✅ Opus 4.6 audit + cleanup
- B4 ✅ Stage 2 kickoff memo (this doc, finalized)
- C1 ✅ Stage 0 baseline
- C2 ✅ Stage 1 mikro-eval PASS
- C3 ✅ Stage 2 mini PASS

Cumulative Sprint 11 spend at 10/10: <TBD-from-C3-exit-plus-prior>$ of ~$150 soft ceiling. H-42a/b is unblocked technically; actual H-42a/b kickoff is the first Sprint 12 task.

## 10. What this memo does NOT do

- Does NOT kick off H-42a/b automatically. Kickoff requires PM authorization signal post-finalization (separate PM act).
- Does NOT commit budget for Sprint 12. Sprint 12 budget is a separate planning artifact.
- Does NOT specify launch copy or PMM derivation rules. That is downstream PMM work consuming H-42a/b exit ping.
- Does NOT amend A3 LOCK. If C3 surfaced material change, A3 v2 is a separate PM-ratified doc that supersedes A3 v1 — this memo then binds to v2.

## 11. Related

- `PM-Waggle-OS/decisions/2026-04-22-bench-spec-locked.md` — A3 LOCK v1 (parent manifest)
- `PM-Waggle-OS/decisions/2026-04-22-bench-spec-locked.manifest.yaml` — A3 YAML twin
- `PM-Waggle-OS/decisions/2026-04-22-stage-2-primary-config-locked.md` — B1
- `PM-Waggle-OS/decisions/2026-04-22-tie-break-policy-locked.md` — B2
- `PM-Waggle-OS/decisions/2026-04-22-model-route-naming-locked.md` — B3
- `PM-Waggle-OS/briefs/2026-04-22-cc-c3-stage2-mini-kickoff.md` — C3 brief
- `PM-Waggle-OS/sessions/2026-04-22-sprint-11-c3-stage2-mini-exit.md` — C3 exit (TBD pending PASS)
- `PM-Waggle-OS/sessions/2026-04-22-sprint-11-c2-stage1-mikroeval-exit.md` — C2 exit ping (forensic input)

---

**DRAFT memo. Populate <TBD> slots from C3 exit ping; rename to `2026-04-22-stage-2-full-kickoff-memo.md`; commit final. Sprint 11 reaches 10/10 on this finalization.**
