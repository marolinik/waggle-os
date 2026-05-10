# Stage 2 Full (H-42a/b) Methodology Intent Memo — B4 FINAL

**Status:** **FINAL — Sprint 11 close artifact.** This memo declares H-42a/b run methodology, parameters, budget envelope, exit criteria, abort criteria, and risk register. **It does NOT authorize execution.** H-42a/b execution is gated on Sprint 12 Task 2 (C3 Stage 2 mini PASS) per Path C ratification 2026-04-22 PM.

**Datum:** 2026-04-22
**Sprint:** 11 · Track B · Task B4
**Authority:** PM (Marko Marković) — finalizovan kao Sprint 11 close deliverable
**Pre-req gate (B4 → execution-ready transition):** Sprint 12 Task 2 C3 PASS sa κ ≥ 0.65 i tier signal compatible sa A3 LOCK §2 (mini je exploratory, ali signal mora biti coherent)

---

## 1. Purpose and binding scope

Ovaj memo definiše **šta** će se desiti kada se H-42a/b autorizuje za izvršenje, **ne kada**. Sprint 11 ga finalizuje kao methodology declaration; Sprint 12 ga aktivira kao execution authority posle C3 PASS gate-a.

Memo binds future H-42a/b kickoff to:

- A3 LOCK v1 per `PM-Waggle-OS/decisions/2026-04-22-bench-spec-locked.md` (intact, ne issuujemo v2 u Sprint 11; ako Sprint 12 C3 surface-uje material change, A3 v2 se issuuje kao separate decision doc i ovaj memo se amend-uje pre execution-a).
- B1 Stage 2 primary config + B2 tie-break + B3 Surface A/B naming + B3 §5 DashScope addendum (full LOCK chain inherited).
- Sprint 12 Task 1 infra-build PASS (svih 6 substrate gapova zatvoreno, runtime spreman za pre-registration-conformant execution).
- Sprint 12 Task 2 C3 readiness signal (PASS ili PASS-WITH-FLAG sa PM review).

## 2. Why C3-execution-gated, not C3-PASS-pending

Original B4 draft 2026-04-22 PM bio je strukturisan sa `<TBD-from-C3>` slotovima koji bi se popunili posle C3 exit ping-a u Sprint 11 Day 3. CC-1 pre-kick verification 2026-04-22 PM razotkrio je 6 substrate gapova (LoCoMo dataset absent, cell enum mismatch, pre-registration flagovi unbuilt, judge-ensemble literal invalid, judge models unregistered, DashScope Surface B ambiguity per B3 §5). Path C ratifikovan: C3 izvršenje defer-ovano u Sprint 12 Task 2 posle Task 1 infra-build-a.

Kao posledica: B4 ne može biti "final, pending C3 PASS" jer C3 exit ping ne postoji u Sprint 11 close window-u. Reframing rezultat: B4 finalizuje methodology intent (binding parameters, budget, exit/abort criteria, risk register) bez popunjavanja C3-derived polja. Ta polja se materializuju u Sprint 12 Task 3 (B4 execution authorization addendum) posle Task 2 C3 PASS exit ping-a.

## 3. H-42a/b run parameters (binding)

Parametri su locked u A3 LOCK v1; per-run manifest emit-uje se na kickoff-u per A3 §7. Ovaj memo ih reproduktovno citira radi single-source-of-truth navigacije.

**Target arm (H-42a — Qwen primary):**

- Model: `qwen3.6-35b-a3b-stage2` resolved to Surface B identifier at kickoff. Per B3 LOCK §5 addendum (datum 2026-04-22), za DashScope-routed Qwen target Surface B može biti Surface A floating alias sa documented carve-out u manifest-u (DashScope ne expose-uje Anthropic-style dated snapshots) ili OpenRouter revision hash ako je dostupan kroz bridge route.
- Mode: `thinking=on`, 64K reasoning budget per B1.
- Dataset: LoCoMo full eval set, N=1540 (per A3 §3 instance count + dataset_version hash u manifest-u).
- Runs: 3 independent seeded runs (seeds 42, 142, 242).
- Total Qwen evaluations: 4620.

**Control arm (H-42b — Opus 4.6 probe):**

- Model: `anthropic/claude-opus-4-6` resolved to Surface B dated snapshot at kickoff (subject to B3 LOCK §3 verification — must be valid against Anthropic's published snapshot list at PR review time).
- Dataset: LoCoMo stratified subsample N=500.
- Runs: 3 independent seeded runs (seeds 42, 142, 242).
- Total Opus evaluations: 1500.

**Judge ensemble (both arms):**

- Primary 3: `claude-opus-4-7` + `gpt-5.4` + `gemini-3.1` (Surface B dated snapshots resolved at kickoff and pinned in per-run manifest per A3 §4 consistency constraint).
- Tie-break: `xai/grok-4.20` (Surface B dated snapshot resolved at kickoff). Auto-fires na 1-1-1 split per B2 LOCK; 2-2 split escalates u PM_ESCALATION surface per B2 §3.
- Same physical judges across H-42a and H-42b (A3 §4 consistency constraint).

**Aggregate evaluations:** 6120 (4620 Qwen + 1500 Opus).

## 4. Budget envelope (binding)

Per A3 §3 manifest budget breakdown:

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

H-42a/b je CLOSED sa jednim od četiri tier verdict-a per A3 LOCK §2, primenjeno na **H-42a (Qwen) aggregate across 3 runs (4620 evaluations)**:

- **STRONG-PUBLISHABLE** — point ≥ 91.6% **and** Wilson lower ≥ 91.6% **and** bootstrap lower ≥ 91.6%. Launch claim ready.
- **PUBLISHABLE** — point ≥ 91.6% **and** Wilson lower ≥ 89.0%. Claim with appropriate CI disclosure.
- **WEAK** — point in [89.0%, 91.5%]. Do NOT claim SOTA. Triggers PM-review-gate before any external use.
- **FAIL** — point < 89.0%. Do NOT publish. Triggers post-mortem.

**H-42b (Opus probe) tier:** secondary descriptive read; not subject to confirmatory hypothesis. Result feeds the multiplier thesis dual-axis narrative as "Opus 4.6 directional comparison vs Mem0 reference" but does NOT gate the Qwen launch claim.

**Conservative rule:** ako Wilson i cluster-bootstrap CI nisu saglasni o tier-u za H-42a, prevladava konzervativniji tier per A3 §2.

**Required exit ping fields** at `PM-Waggle-OS/sessions/2026-XX-XX-h-42a-b-exit.md`:

- Tier verdict (jedan od četiri).
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
- κ < 0.60 OR drop > 10pp from Sprint 10 0.7458 baseline (i.e., κ < 0.6458) on any run's mid-checkpoint (every 500 evaluations).
- LiteLLM `/health` flips unhealthy and does not recover within 5 minutes of restart attempt.
- Persistent NETWORK_ERROR for >5 consecutive calls on same target model.
- `reasoning_content_shape_unknown` drift event fires more than 3x per run.
- Manifest hash mismatch between emit and committed YAML.
- Provider rotation event mid-run on any judge or target model floating alias (would invalidate per-run manifest pinning).

On abort: write `sessions/<DATE>-h42-aborted-<reason>.md` with captured state; preserve partial JSONL; notify PM immediately.

## 7. Risk register (full-run specific)

Tri rizika elevated above C3 thresholds because full-run scale magnifies impact:

**R1 — Provider rotation mid-campaign.** Full run takes ~24-72h wall-clock depending on rate limits. Probability that any of 5 model floating aliases (4 judges + 1 target) gets a snapshot rotation by provider during that window is non-trivial. Mitigation: per-run manifest pins all 5 Surface B identifiers at kickoff. Detection: pino events log resolved snapshot per call; CC-1 monitors for unexpected snapshot diversity in event stream and HALTs if seen. Recovery: ako se rotacija detektuje mid-run, HALT i odluka između (a) restart sa novim snapshot-om pinnovanim (full re-run), (b) restart sa starim snapshot-om ako je još accessible (preferred), (c) defer to next snapshot stability window.

**R2 — Judge κ drift over 24-72h window.** Sprint 10 κ=0.7458 izračunat na single sitting-u; 24-72h continuous evaluation može razotkriti degradation patterns invisible at small N. Mitigation: κ se računa per run (ne samo per campaign) tako da 3 runs daju 3 κ values. Ako bilo koji run individually drop-uje ispod threshold-a, taj run aborts; preostali runs continue ako issue ne generalizuje. PM reviews κ trend across the 3 runs before tier verdict.

**R3 — Network volatility cumulative effect.** C2 had 1 timeout in 10 instances. At 6120 evaluations, even a 5% transient error rate yields ~300 retries, which strains rate limits and inflates wall-clock. Mitigation: harness retry budget per-instance is honored; persistent errors trigger §6 abort threshold. Ako wall-clock pređe 96h, PM reviews da li continue ili restart sa adjusted concurrency.

**R4 (NEW, identified post-C3-block) — Substrate regression after Sprint 12 Task 1 completion.** H-42a/b se kick-uje tek posle Sprint 12 Task 1 PASS-a. Postoji rizik da između Task 1 commit-a i H-42a/b kickoff-a (Sprint 12 days 1-7) downstream PR-ovi inadvertently regress neku od substrate komponenti (dataset loader path, CLI flagovi, event emitter, model registry). Mitigation: pre H-42a/b kickoff-a, CC-1 ponavlja substrate readiness §0 grep evidence pass identičan onome što je proizveo C3 BLOCKED report; ako bilo šta drift-uje, HALT pre kickoff-a, fix u Task 1 retroaktivno, restart §0 check.

## 8. Post-PASS communication and artifacts

Upon H-42a tier verdict ∈ {STRONG-PUBLISHABLE, PUBLISHABLE}:

- Tier 2 archive bundle created at `waggle-os/benchmarks/archive/2026-XX-XX-stage2-full.tar.gz` per A3 §9 layout. Full JSONL with reasoning_content preserved.
- Audit log entry initialized at `PM-Waggle-OS/audit-log/2026-XX-XX-stage2-full-archive-created.md` with SHA-256 of bundle + retention horizon timer start.
- Tier verdict + Wilson + bootstrap CIs become input to launch claim copy on Waggle/KVARK landing per multiplier thesis dual-axis framing. PMM owns derivation; engineering does not.
- B4 execution authorization addendum committed (Sprint 12 deliverable, populates kontekst za Sprint 13 launch sequencing).
- Sprint 12 retrospective triggered.
- Sprint 13 planning anchored on H-42a/b results + launch sequencing.

Upon H-42a tier ∈ {WEAK, FAIL}:

- WEAK: PM-review-gate pre any external claim. Possible paths: (a) accept WEAK and frame launch as "approaching SOTA with explicit caveats", (b) iterate on harness or model config and rerun, (c) defer launch claim. Decision via dedicated PM doc within 7 days of exit.
- FAIL: post-mortem triggered. Investigation scope: harness defect vs model capability vs LoCoMo subset bias vs judge calibration. Multi-day cycle expected. Launch sequencing reconsidered.

H-42b Opus probe result attached as secondary input to multiplier thesis narrative regardless of H-42a tier.

## 9. Sprint 11 close

Upon B4 memo finalization (this doc, kao Sprint 11 deliverable), Sprint 11 reaches **9/10 exit criteria CLOSED**:

- A1 ✅ Design doc ratified
- A2 ✅ reasoning_content wire LIVE
- A3 ✅ Bench-spec LOCKED v1 (intact)
- B1 ✅ Stage 2 primary config LOCKED
- B2 ✅ Tie-break policy LOCKED + LIVE u judge-runner
- B3 ✅ Opus 4.6 audit + cleanup + B3 §5 DashScope addendum
- B4 ✅ Stage 2 methodology intent memo (this doc, finalizovan)
- C1 ✅ Stage 0 baseline
- C2 ✅ Stage 1 mikro-eval PASS
- C3 ⏸️ **DEFERRED → Sprint 12 Task 2** (per Path C ratifikacija 2026-04-22 PM, blocked na 6 substrate gapova koji se rešavaju u Sprint 12 Task 1)

Cumulative Sprint 11 spend at 9/10: ~$0.019 of ~$150 soft ceiling (0.013%). H-42a/b remains gated on Sprint 12 Task 1 + Task 2 PASS.

## 10. What this memo does NOT do

- Does NOT autorizovati H-42a/b execution. Autorizacija zahteva (a) Sprint 12 Task 1 PASS (substrate ready), (b) Sprint 12 Task 2 PASS (C3 mini exit verdict compatible sa A3 LOCK §2), (c) PM review + ratification addendum koji popunjava prethodne `<TBD>` polja.
- Does NOT commit budget for Sprint 12. Sprint 12 budget je separate planning artifact.
- Does NOT specify launch copy ili PMM derivation rules. Downstream PMM work consuming H-42a/b exit ping.
- Does NOT amend A3 LOCK. Ako Sprint 12 C3 surface-uje material change, A3 v2 je separate PM-ratified doc that supersedes A3 v1 — ovaj memo se tada amend-uje pre execution-a.
- Does NOT presume C3 has executed. C3 execution je Sprint 12 Task 2 prerequisite za H-42a/b authorization.

## 11. Related

- `PM-Waggle-OS/decisions/2026-04-22-bench-spec-locked.md` — A3 LOCK v1 (parent manifest, intact)
- `PM-Waggle-OS/decisions/2026-04-22-bench-spec-locked.manifest.yaml` — A3 YAML twin
- `PM-Waggle-OS/decisions/2026-04-22-stage-2-primary-config-locked.md` — B1
- `PM-Waggle-OS/decisions/2026-04-22-tie-break-policy-locked.md` — B2
- `PM-Waggle-OS/decisions/2026-04-22-model-route-naming-locked.md` — B3
- `PM-Waggle-OS/decisions/2026-04-22-b3-lock-dashscope-addendum.md` — B3 §5 addendum (this PM tranche)
- `PM-Waggle-OS/briefs/2026-04-22-cc-c3-stage2-mini-kickoff.md` — C3 brief (Sprint 12 reference artifact)
- `PM-Waggle-OS/sessions/2026-04-22-c3-blocked-substrate-gap.md` — CC-1 pre-kick verification
- `PM-Waggle-OS/sessions/2026-04-22-c3-standdown-path-c-ratified.md` — Path C ratification + standdown
- `PM-Waggle-OS/briefs/2026-04-22-sprint-12-scope-draft.md` — Sprint 12 scope skica (this PM tranche)
- `PM-Waggle-OS/sessions/2026-04-22-sprint-11-c2-stage1-mikroeval-exit.md` — C2 exit ping (forensic input + R3 baseline)

---

**B4 FINAL — Sprint 11 close artifact. Methodology intent declared, execution C3-gated to Sprint 12. Sprint 11 9/10 CLOSED.**
