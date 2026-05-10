# CC-1 Brief — C3 Stage 2 Mini (4-cell) Kickoff Authorization

**Datum:** 2026-04-22
**Sprint:** 11 · Track C · Task C3
**Authority:** PM (Marko Marković), 2026-04-22 PM Cowork ratification (A3 LOCK ratifikovan, C2 PASS pročitan i verifikovan)
**Pre-req gates:** A3 ✅ RATIFIED · C2 ✅ CLOSED · B1 ✅ CLOSED · B2 ✅ CLOSED · B3 ✅ CLOSED (+ cleanup `da9b3c5`) · LiteLLM container UP (verified at kickoff)
**Budget:** $120–200 expected · Cap $250 hard
**Hard abort @ 130% of cap:** $325

---

## 1. Authorization

C3 Stage 2 mini (4-cell, N=100 per cell, 400 evaluations total) is **AUTHORIZED to kick off** as soon as §2 pre-req is satisfied. CC-1 owns the kick; PM reads exit ping. This brief inherits from:

- `PM-Waggle-OS/decisions/2026-04-22-bench-spec-locked.md` — A3 LOCK v1 (7 axes + 16-field manifest + retention + CI sync guard). **C3 is the first invocation bound to A3 v1 manifest.**
- `PM-Waggle-OS/decisions/2026-04-22-stage-2-primary-config-locked.md` — B1 Stage 2 primary config (thinking=on, 4 cells).
- `PM-Waggle-OS/decisions/2026-04-22-tie-break-policy-locked.md` — B2 quadri-vendor tie-break + PM-escalation defensive path. **C2 did not exercise this at runtime (`--judge-ensemble` omitted per brief §4.3); C3 MUST exercise it — this is the B2 live-verification gate on 3-primary ensemble paths.**
- `PM-Waggle-OS/decisions/2026-04-22-model-route-naming-locked.md` — B3 Surface A/B convention. **C3 per-run manifest pins Surface B dated snapshots at kickoff time to prevent the intra-campaign shape drift surfaced in C2.**

## 2. Pre-req: Docker / LiteLLM health-check

Mandatory step zero. Same procedure as C2 brief §2. Docker Desktop went down between B1 smoke and B2 smoke attempt (2026-04-21); same risk applies to C3.

```bash
docker ps --filter "name=waggle-os-litellm-1" --format "{{.Names}} {{.Status}}"
```

Expected: `waggle-os-litellm-1 Up <duration>`. If not Up, follow C2 brief §2 restart procedure (Marko handles Docker Desktop UI restart → wait for daemon → bring up LiteLLM stack → `/health` smoke → re-verify container Up). Only proceed once container is green.

Abort C3 kickoff with `sessions/2026-04-22-c3-blocked-litellm-unhealthy.md` if `/health` returns unhealthy or 5xx.

## 3. Manifest generation — step one of kickoff

Before `runner.ts` is invoked, CC-1 must emit the **C3 per-run manifest** that inherits from A3 LOCK v1.

**Per-run manifest path:** `PM-Waggle-OS/decisions/2026-04-22-stage2-mini-manifest.md` + `.manifest.yaml`

**Manifest content requirements (16 fields from A3 §7):**

1. `manifest_version: v1.0.0` (inherits parent)
2. `manifest_hash` — SHA-256 of this per-run YAML, computed pre-freeze, recorded before emitting `bench.preregistration.manifest_hash` event
3. `run_id` — ULID/UUID from harness
4. `run_stage: mini`
5. `target_model` — **Surface B dated snapshot** resolved at kickoff (not floating alias; this is the C2 drift mitigation)
6. `target_model_thinking_mode: on`
7. `judge_primary` — array of 3 Surface B dated snapshots (Opus 4.7, GPT-5.4, Gemini 3.1) resolved at kickoff
8. `judge_tiebreak` — Surface B dated snapshot for `xai/grok-4.20` resolved at kickoff
9. `judge_rubric_path` — path to judge prompt file including F1–F6 + F-other taxonomy
10. `dataset: locomo`, `dataset_version: <LoCoMo release hash>`
11. `instance_count: {per_cell: 100, total: 400}`
12. `cells: [raw, filtered, compressed, full_context]` with per-cell parameter blocks
13. `ci_method: wilson_95 + cluster_bootstrap_95` (seed 42, iterations 10000, cluster_unit conversation_id)
14. `failure_taxonomy_version: F1-F6+other v1`
15. `budget_cap: 250`
16. `retention_policy: A2-Q5-tier-2-full-preserved`

**Markdown twin** in same directory with structured "Fields" section mirroring the YAML content (CI sync guard per A3 §8 — interim manual verification acceptable until `scripts/check-manifest-sync.mjs` lands).

**Commit** manifest pair before kickoff. Commit message format:
```
chore(bench): C3 Stage 2 mini manifest v1 — hash <sha256>

Inherits from A3 LOCK parent manifest 2026-04-22-bench-spec-locked.md.
Manifest sync verified manually — CI guard pending script landing.
```

## 4. Invocation

Per A3 LOCK §3 (mini) + B1 invocation template, extended for C3:

```bash
node benchmarks/harness/src/runner.ts \
  --model <target_model_surface_b_from_manifest> \
  --cell raw,filtered,compressed,full-context \
  --dataset locomo \
  --limit 100 \
  --per-cell \
  --seed 42 \
  --live \
  --budget 250 \
  --judge-ensemble primary \
  --judge-tiebreak grok-4.20 \
  --manifest-hash <sha256_from_step_3> \
  --emit-preregistration-event
```

Notes on flags:

- `--cell raw,filtered,compressed,full-context` — four-cell run per B1 LOCK.
- `--per-cell --limit 100` — 100 instances per cell, 400 total.
- `--seed 42` — consistent with A3 LOCK cluster-bootstrap seed.
- `--judge-ensemble primary` — **this is the flag C2 omitted.** C3 MUST pass this to activate 3-primary judge path and the B2 tie-break wiring from `80896f1`.
- `--judge-tiebreak grok-4.20` — explicit tie-break reserve per A3 §4 + B2 LOCK.
- `--manifest-hash <sha256>` + `--emit-preregistration-event` — together these wire the `bench.preregistration.manifest_hash` event per A3 §7 / H-AUDIT-2 integration. CC-1 verifies the event fires in pino output at run start; if event does not fire, HALT and fix before consuming budget.

Output JSONL goes to `benchmarks/runs/2026-04-22-c3-stage2-mini/<cell>.jsonl` (4 files, one per cell). Aggregate JSON goes to `benchmarks/runs/2026-04-22-c3-stage2-mini/aggregate.json`.

## 5. Exit criteria

C3 is CLOSED when ALL of:

1. **400 instances evaluated end-to-end** (100 per cell × 4). Partial runs do not count as PASS.
2. **A2 wire preserved.** Every JSONL row carries `reasoning_content` + `_chars` + `_shape ∈ {message.reasoning_content, message.reasoning, body.reasoning_content}`. Zero `unknown` shape events (drift alarm would fire on >1 per A3 §5 §10).
3. **B2 wire live-verified.** At least one 1-1-1 three-way split MUST occur in 400 instances (expected rate ~2–5% → ~8–20 fires). For each fire: pino event shows `path: quadri-vendor`, `fourth_vendor_slug: xai/grok-4.20`, and `resolveTieBreak` invocation. If zero fires in 400 instances that is an anomaly — report as forensic signal (likely means primary triple consensus rate is higher than Sprint 10 baseline, which is informative for full-run κ planning but not a blocker).
4. **Per-cell Wilson + cluster-bootstrap 95% CIs reported** for each of the 4 cells. Aggregate report in `aggregate.json` must populate the `ci { wilson: {lower, upper}, bootstrap: {lower, upper} }` slot per cell plus overall.
5. **Fleiss' κ computed and reported** across primary triple, per run overall. Pass thresholds per A3 §4:
   - κ ≥ 0.65 → PASS no flag.
   - 0.60 ≤ κ < 0.65 → PASS-WITH-FLAG; exit ping notes the drop.
   - κ < 0.60 OR drop >10pp from Sprint 10 κ=0.7458 (i.e., κ < 0.6458) → HALT mid-run (abort per §6).
6. **Failure distribution reported.** Aggregate must include `failure_codes: { F1: n, F2: n, F3: n, F4: n, F5: n, F6: n, F_other: n, null: n }`. If `F_other` rate > 10% of total failures, exit ping must surface this as a taxonomy-review trigger per A3 §6.
7. **Manifest hash match.** Run-start `bench.preregistration.manifest_hash` event equals SHA-256 of committed per-run YAML. Any mismatch is HALT-worthy.
8. **Budget ≤ $250.** Exit ping reports actual spend with breakdown by call class (target model, primary judge triple, tie-break grok, overhead). Expected $120–200.
9. **Zero NETWORK_ERROR tail.** Transient single-call retries within runner's own retry budget are OK; >3 consecutive NETWORK_ERROR on same target model is abort (§6).
10. **Exit ping written** to `PM-Waggle-OS/sessions/2026-04-22-sprint-11-c3-stage2-mini-exit.md` following C2 template, extended with:
    - Manifest hash + match verification line.
    - Per-cell CI table (Wilson + bootstrap).
    - κ value + tier classification.
    - Failure code distribution + F-other rationale sample (pick 3 at random if F_other occurred).
    - B2 tie-break fire count + sample pino event line.
    - Shape distribution (re-verify C2 finding — DashScope native vs OpenRouter unified proportions).

11. **Tier 2 archive bundle created** per A3 §9 at `waggle-os/benchmarks/archive/2026-04-22-stage2-mini.tar.gz` with the §9 layout (runs/ + aggregates/ + manifest.yaml + manifest.md + exit-ping.md + git-state.txt + docker-state.txt + README.md). Full JSONL with reasoning_content preserved (unpruned).

## 6. Abort criteria

C3 should be ABORTED (mid-run) if ANY of:

- Budget burn > $325 (130% of cap) at any partial-run checkpoint.
- κ < 0.60 OR drop >10pp from Sprint 10 κ=0.7458 computed on first full cell (100 instances) — do not run remaining 3 cells.
- LiteLLM `/health` flips unhealthy mid-run.
- Persistent NETWORK_ERROR for >3 consecutive calls on same target model.
- `reasoning_content_shape_unknown` drift event fires more than once in the sample (A3 §5 signals provider schema drift; HALT and investigate).
- Manifest hash mismatch between emit and committed YAML.

On abort: write `sessions/2026-04-22-c3-aborted-<reason>.md` with captured state; do NOT clean up partial JSONL (forensic evidence); notify PM.

## 7. What C3 does NOT need

- Does NOT need B4 Stage 2 kickoff memo. B4 is PM-led and parallel — C3 is pure CC-1 execution.
- Does NOT need to rerun B1/B2/B3 smoke — those are closed.
- Does NOT need to invoke `scripts/check-manifest-sync.mjs` — script is authorized but not yet implemented; manual sync verification via commit message is sufficient for C3.
- Does NOT need to wait on C2 forensic signal investigation. The DashScope-vs-OpenRouter shape drift surfaced in C2 is already mitigated by this brief's §3 requirement that the manifest pins Surface B dated snapshot at kickoff. Shape distribution reporting in §5.10 closes the observability loop.

## 8. After C3 PASS

- **Sprint 11 reaches 9/10 exit criteria closed** (A1, A2, A3, B1, B2, B3, C1, C2, C3). Only B4 (PM-led memo) remains.
- B4 can land within hours of C3 PASS — it is a memo that consumes C3 exit ping as its readiness input.
- H-42a/b (Stage 2 full) is unblocked technically but gated procedurally on PM decision to authorize the full-run budget ($1300–2300 / cap $2600). That decision is a separate PM call downstream of C3 exit; not a CC-1 kick.
- If C3 surfaces a material methodology refinement, PM issues A3 **v2** decision doc per A3 §5 versioning protocol. CC-1 does NOT self-amend manifest — any change requires PM-ratified v2 and new manifest hash.

## 9. Sprint 11 close path after C3

If C3 PASSes and B4 memo lands, Sprint 11 reaches **10/10 CLOSED**. That is the cleanest sprint close in the Waggle/KVARK execution record so far (17/17 Critical + 10/10 Sprint 11 exit criteria, cumulative spend well under $150 soft ceiling).

C3 PASS → B4 memo → Sprint 11 retrospective → Sprint 12 planning with H-42a/b as the anchor task. This is the narrative path into the SOTA-gated launch window.

## 10. Related

- `PM-Waggle-OS/decisions/2026-04-22-bench-spec-locked.md` — A3 LOCK parent manifest (this brief is the first binding invocation)
- `PM-Waggle-OS/decisions/2026-04-22-bench-spec-locked.manifest.yaml` — YAML twin
- `PM-Waggle-OS/decisions/2026-04-22-stage-2-primary-config-locked.md` — B1
- `PM-Waggle-OS/decisions/2026-04-22-tie-break-policy-locked.md` — B2
- `PM-Waggle-OS/decisions/2026-04-22-model-route-naming-locked.md` — B3
- `PM-Waggle-OS/briefs/2026-04-22-cc-c2-stage1-mikroeval-kickoff.md` — C2 brief (template ancestor)
- `PM-Waggle-OS/sessions/2026-04-22-sprint-11-c2-stage1-mikroeval-exit.md` — C2 exit ping (shape drift forensic input to §3)
- `PM-Waggle-OS/sessions/2026-04-22-sprint-11-h-audit-1-exit.md` — A2 (reasoning_content wire reference)
- `PM-Waggle-OS/sessions/2026-04-22-sprint-11-b2-tiebreak-exit.md` — B2 fold-in exit

---

**C3 AUTHORIZED. Pre-req: Docker health-check (§2). Step one: emit per-run manifest v1 with SHA-256 hash (§3). Invocation: 4-cell × 100 instances × seed 42 with `--judge-ensemble primary` + `--judge-tiebreak grok-4.20` + `--emit-preregistration-event` (§4). Exit: 11 criteria including κ, Wilson+bootstrap CI, F-distribution, B2 tie-break live-verification, Tier 2 archive bundle. Abort: 6 triggers including κ HALT + manifest hash mismatch. After C3 PASS → Sprint 11 reaches 9/10, B4 memo closes to 10/10.**
