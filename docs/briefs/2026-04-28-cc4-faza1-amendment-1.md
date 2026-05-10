# CC-2 Faza 1 — Amendment 1 (PM ratification of pre-flight asks)

**Date:** 2026-04-28
**Author:** PM
**Status:** RATIFIED, binding upon paste-into-CC-2
**Predecessor brief:** `briefs/2026-04-28-cc4-gepa-tier2-evolution-faza1-brief.md` (266 lines)
**Predecessor pre-flight:** `briefs/2026-04-28-cc4-faza1-preflight-report.md` (239 lines)
**Sesija executor:** CC-2 (filename retains `cc4` historical naming; CC-2 is operational executor)
**Amendment scope:** resolve 5 ratification asks (A-E) + 2 discovery items (max_tokens reconciliation, substrate HEAD pin)

---

## §1 — Acknowledgment

Pre-flight rightly halt-ed at §6.3 ambiguity. Brief inherited Phase 4.3 hypothesis labels without verifying source corpus shape — this is exactly the failure class that feedback rule 6.1 (config inheritance audit) was created to surface. The catch saved $20 NULL-baseline burn on the wrong corpus + propagated downstream cost in Gen 1 + held-out validation that would have referenced inadequate-N source data.

Pre-flight report finding §3.4 (mutation validator anchored on `MULTI_STEP_ACTION_CONTRACT` in `types.ts` as the cell-semantic boundary linchpin) is also a strong design choice that goes beyond brief §3.4 specification. Ratify and adopt as standard.

---

## §2 — Ratifications (asks A-E)

### Ask A — H3 cell semantics disambiguation

**RATIFIED: Option C (generate ≥40 net-new synthesis instances mirroring pilot NorthLane/CFO task family).**

Rationale: only Option C preserves Phase 4.3 verdict anchor (which motivates entire GEPA work) **and** satisfies brief §6.3 ≥40 instances scope verification. Option A (3 instances) FAIL on statistical viability. Option B (LoCoMo agentic 400) disconnects from Phase 4.3 verdict — would force brief addendum reframing GEPA rationale away from agentic synthesis failure mode that empirically motivated the work. Option C is the only path that maintains methodological integrity.

**Sub-asks (per pre-flight report §6 footer):**

1. **Target N for new H3 corpus = 50** — RATIFIED. Comfortable margin over §6.3 ≥40 threshold (8 NULL + 24 Gen 1 + 5 held-out + 13 buffer).

2. **Subject model for instance generation = Opus 4.7** — RATIFIED. Consistent with mutation oracle (§3.3 of original brief), single-model anchor for entire pre-work + GEPA pipeline minimizes confounders.

3. **Stratification axes** — DEFER to CC-2 design judgment. Pre-flight report recommended "5 task families × 10 instances each, mirroring pilot's task-1/task-2/task-3 structure". Pilot had 3 task families; expansion to 5 requires authoring 2 net-new task families. PM does not specify which 5 axes — CC-2 designs stratification (with warm context on pilot artifact structure) and reports stratification design as part of manifest v7 LOCK §corpus_design block. Constraints:
   - 5 task families minimum, all in NorthLane CFO synthesis domain (preserves anchor)
   - Each task family yields 10 instances via persona/scenario/document-set variation
   - Total stratification = 50 instances, deterministic-stratified via seed=42 for sampling
   - Each instance must have ≥6 source documents (matching pilot ~5300-token CFO memo complexity)
   - Each instance must have 6-dim Likert rubric (completeness, accuracy, synthesis, judgment, actionability, structure) per pilot pattern

4. **Instance generation methodology** — Opus 4.7 generates **task scaffold** (persona + scenario + 6-7 source document specs); PM does NOT review each instance pre-NULL-baseline (would balloon wall-clock). Instead: CC-2 spot-audits 5 random instances pre NULL-baseline kick (3% sample), reports any quality drift to PM in Checkpoint A halt. Trust mutation-oracle-as-task-generator pattern but with explicit spot-audit gate.

### Ask B — Likert `trio_strict_pass` operationalization

**RATIFIED: Operationalization (ii) — trio_mean ≥ T=4.0.**

Rationale: pilot 2026-04-26 artifact already contains `trio_strict_pass` field with sample value `true` for `trio_mean=4.583` and `judge_minimax=failed`. This empirically confirms (ii) operationalization with T probably = 4.0 as already-deployed pattern. Faza 1 reuses existing methodology rather than introducing new metric definition — preserves audit trail with pilot work and eventually with paper §5.4 conditional findings framing.

T=4.0 is also methodologically defensible: 4.0 on 1-5 Likert = "strong" rather than "passing", which is the threshold needed for fitness signal differentiation between GEPA candidates. T=3.5 would be too permissive (most candidates pass, low signal), T=4.5 too strict (most fail, low signal).

**Manifest v7 must explicitly declare:**
```yaml
metric_operationalization:
  trio_strict_pass:
    method: aggregate_trio_mean_threshold
    threshold: 4.0
    citation: pilot_2026_04_26_artifact_pattern
```

### Ask C — canonical κ=0.7878 source citation

**RATIFIED: cite `benchmarks/calibration/2026-04-24-trio-strict-recal.json`, ratified by Stage 3 v6 Phase 1 trio judge ensemble pass commits `60d061e` → `38a830e` → `01f7ead` (2026-04-24).**

Manifest v6 §5.4 specifies the policy floor (κ ≥ 0.70 pass / [0.60, 0.70] borderline / <0.60 fail). The specific value 0.7878 is the empirically measured Phase 1 result.

**Sub-ask CC-2 must verify:**
- Confirm `benchmarks/calibration/2026-04-24-trio-strict-recal.json` exists in waggle-os repo at HEAD (per memory entry `project_task25_stage3_v6_phase1_pass.md`)
- Compute SHA256 of file, pin in manifest v7 §canonical_kappa_anchor block
- If file is absent at HEAD: halt-and-PM (signal of repo state divergence — escalation)

Manifest v7 entry format:
```yaml
canonical_kappa_anchor:
  value: 0.7878
  source_file: benchmarks/calibration/2026-04-24-trio-strict-recal.json
  source_sha256: <CC-2 computes>
  ratified_commits:
    - 60d061e
    - 38a830e
    - 01f7ead
  ratified_date: 2026-04-24
  drift_threshold: 0.05  # per brief §4 condition 3
```

### Ask D — path correction `packages/core/` → `packages/agent/`

**RATIFIED. Typo correction, no scope change.** All future references in Faza 1 manifests, decision memos, GEPA outputs, and tests use `packages/agent/src/prompt-shapes/` per pre-flight report §2.1 verified inventory.

### Ask E — `feedback_config_inheritance_audit.md` reconstruction

**NOT RATIFIED as proposed. Alternative path:**

Original file lives at `/sessions/inspiring-festive-lamport/mnt/.auto-memory/feedback_config_inheritance_audit.md` (PM session memory, persists cross-sessions). It is NOT a waggle-os repo artifact and CC-2 cannot reach the path. Reconstructing in waggle-os would create a duplicate-but-stale copy that may drift from PM-side authoritative version.

**Instead:** embed 8 sub-rules **inline** in Faza 1 launch decision memo `decisions/2026-04-28-gepa-faza1-launch.md` under section **§A — Inherited Pre-flight Rules**. Source: brief §6.1-§6.8 verbatim. All Faza 1 audit references that would cite "feedback_config_inheritance_audit.md" instead cite "Faza 1 launch decision §A inherited pre-flight rules from PM brief §6".

This is cleaner: launch decision becomes self-contained binding contract for entire Faza 1 work, no external dependencies, reproducibility-ready for paper submission.

---

## §3 — Discovery resolutions

### Discovery 3.1 — judge max_tokens reconciliation

Brief §3.1 mandated `max_tokens=3000` per judge "per Stage 3 v6 fix". This is a **partial mis-citation in the brief**. The Stage 3 v6 fix raised max_tokens specifically for Likert synthesis judging (judges need room to articulate per-dimension rationale across 6 dimensions), not for binary LoCoMo factoid judging (which does fine with 1024).

Manifest v6 §5.2 + §5.4 values (1024 / 1024 / 4096 for Opus / GPT / MiniMax) reflect **LoCoMo factoid baseline**, NOT synthesis Likert. Faza 1 is synthesis Likert (per Ask A Option C corpus type), so LoCoMo values are wrong inheritance.

**RESOLUTION:** CC-2 reads pilot 2026-04-26 judge config artifact (likely in `benchmarks/results/pilot-2026-04-26/` or judge config YAML), extracts the actually-deployed max_tokens per judge for synthesis Likert. Pin those values in manifest v7 §judges block with explicit `inherited_from: pilot_2026_04_26` cite.

If pilot artifact is missing or ambiguous on judge max_tokens, CC-2 halts pre manifest v7 LOCK and reports config archeology findings — PM ratifies values explicitly.

PM rec: expect values in 3000-4096 range for synthesis Likert (per intuitive scale of 6-dim rationale generation).

### Discovery 4.5 — substrate HEAD pin (race condition guard)

Brief §3.5: "GEPA radi nad post-Phase 4.6 HEAD." Phase 4.7 commit `c9bda3d` is the actual post-Phase-4.6 anchor (commit `be8f702` is Phase 4.6).

**RESOLUTION:** CC-2 pins manifest v7 substrate anchor on **specific commit SHA `c9bda3d` (Phase 4.7 HEAD on feature/c3-v3-wrapper)**, NOT live HEAD. Race condition guard: CC-1 may commit Phase 4.4/4.5 work to feature/c3-v3-wrapper in parallel; CC-2 must operate on frozen Phase 4.7 anchor for entire Faza 1 to preserve reproducibility + apples-to-apples vs Phase 4.3 verdict.

CC-2 workflow:
1. `git fetch origin feature/c3-v3-wrapper`
2. Verify `c9bda3d` is ancestor of branch HEAD (otherwise repo state divergence)
3. `git worktree add /tmp/faza1-worktree c9bda3d` (isolated worktree on Phase 4.7 anchor)
4. All Faza 1 reads + GEPA evaluations use this worktree
5. Final Faza 1 commits land back on feature/c3-v3-wrapper at HEAD via merge or cherry-pick (CC-2 designs final integration sequence and reports in Checkpoint C)

If `c9bda3d` is not ancestor (CC-1 force-pushed or branch rebased): halt-and-PM, escalation.

Manifest v7 entry:
```yaml
substrate_anchor:
  branch: feature/c3-v3-wrapper
  commit_sha: c9bda3d
  phase_label: Phase 4.7 (compression-engaged assertion test post-fold-in)
  pin_method: git_worktree_isolated
  rationale: race_condition_guard_vs_CC1_Phase_4_4_4_5_parallel_work
```

---

## §4 — Updated cost projection (post Option C ratification)

Faza 1 LOCKED scope ($100 hard cap, $80 internal halt):

| Phase | Cost calc | Subtotal |
|---|---|---|
| Corpus generation (50 instances × Opus 4.7 generation oracle, ~$0.10/instance worst case) | 50 × $0.10 | **$5.00** |
| NULL-baseline (5 shapes × 8 instances × $0.50 subject + judge cost per run) | 5 × 8 × $0.50 | **$20.00** |
| GEPA Gen 1 (5 shapes × 3 candidates × 8 instances × $0.50) | 5 × 3 × 8 × $0.50 | **$60.00** |
| Held-out validation (top-1 per shape × 5 instances × $0.50) | 5 × 1 × 5 × $0.50 | **$12.50** |
| Mutation oracle (5 shapes × 2 mutations × 2 generations × $0.15 per mutation gen) | 5 × 2 × 2 × $0.15 | **$3.00** |
| **Total expected** | | **~$100.50** |

**Tight against $100 cap.** $80 internal halt remains. If actual mid-run cost exceeds projection by >30% (per brief §6.7 cost super-linear sub-rule), halt.

**Cost discipline:**
- Corpus generation completes BEFORE NULL-baseline kick (sequential, allows mid-checkpoint review)
- $5 corpus generation included in Checkpoint A scope (PM ratifies post corpus generation, pre NULL-baseline kick)
- Mutation oracle calls are cheaper than full evaluation calls (mutations don't run subject + judges, just produce candidate prompt)

If post-corpus-generation projection exceeds $100 cap: CC-2 halts, reports actual token costs, PM rerats to either reduce scope (e.g. drop generic-simple shape from Faza 1) or raise cap.

---

## §5 — Updated halt-and-PM checkpoints (3 mandatory + 1 new pre-NULL)

| Checkpoint | Cumulative | Trigger | PM action |
|---|---|---|---|
| **Pre-A (NEW)** | ~$5 | Post corpus generation (50 instances + spot-audit 5 random) | Ratify corpus quality + NULL-baseline kick authorization |
| Checkpoint A | ~$25 | Post NULL-baseline 5 shapes × 8 instances | Ratify NULL trio-strict in 18-24% range + κ stability + Gen 1 kick |
| Checkpoint B | ~$50-65 | Mid-Gen 1 (after 30 evaluations) | Ratify intermediate κ + cell semantic violations review + complete Gen 1 |
| Checkpoint C | ~$100 | Post held-out validation | Acceptance verdict per brief §4 + Faza 2 expansion or PHF fallback |

Pre-A checkpoint added because corpus generation is non-trivial new step that didn't exist in original brief. Spot-audit 5 random instances at Pre-A is binding — PM must see sample quality before authorizing $95 downstream LLM run on the corpus.

---

## §6 — Acceptance criteria update (post ratifications)

Brief §4 conditions remain binding except update §4 condition 1 prose:

**§4 condition 1 (UPDATED):** "Best GEPA candidate per shape beats NULL-baseline by ≥+5pp on **trio_strict_pass rate** (per H3 corpus, where trio_strict_pass = trio_mean ≥ 4.0 per Ask B ratification)"

Other conditions unchanged:
- §4.2: ≥3/5 shapes show positive delta
- §4.3: trio judge κ within ±0.05 of canonical 0.7878 (cite per Ask C)
- §4.4: zero cell semantic violations

---

## §7 — Path forward (sequencing)

CC-2 next moves upon paste of Amendment 1 ratifications into session:

1. **Reconstruct sub-rule audit:** ensure 8 sub-rules from brief §6 are accurately preserved in launch decision §A (per Ask E ratification)
2. **Read pilot judge config artifact:** resolve Discovery 3.1 max_tokens
3. **Verify substrate anchor:** `git fetch` + verify `c9bda3d` ancestry (per Discovery 4.5)
4. **Verify κ anchor file:** read `benchmarks/calibration/2026-04-24-trio-strict-recal.json`, compute SHA256 (per Ask C)
5. **Author manifest v7:** with all explicit declarations (no inheritance gaps), pin all 4 anchors (corpus, κ, substrate, max_tokens)
6. **Author launch decision LOCK:** `decisions/2026-04-28-gepa-faza1-launch.md` with §A inherited rules + manifest v7 SHA + cost projection
7. **Build GEPA harness scaffold + tests (≥80% coverage)**
8. **Generate 50-instance H3 corpus + spot-audit 5 random**
9. **Pre-A halt-and-PM:** corpus quality review + NULL-baseline kick auth
10. **NULL-baseline run** → Checkpoint A halt

No code authoring or LLM API calls outside this sequence.

---

## §8 — Out-of-scope clarifications (post Amendment 1)

Still NOT in Faza 1 scope:

- H2 + H4 cells (Faza 2 expansion)
- More than 2 GEPA generations
- Population > 3 candidates per shape
- N > 8 per evaluation in Gen 1
- System prompt / cell semantics evolution (locked by §2 brief scope, enforced by §3.4 mutation validator)
- mind/ substrate modifications (locked by Discovery 4.5 substrate anchor)
- Apples-to-apples re-eval against pilot 2026-04-26 with original 12 instances (separate Korak 12 work; Faza 1 corpus is net-new per Ask A)
- Paper §5.4 framing update (post Phase 5 GEPA-evolved variant complete)

**Newly in scope (Amendment 1):**

- 50-instance H3 corpus generation (Ask A Option C)
- Pre-A halt-and-PM checkpoint (corpus quality gate)
- Pilot judge config archeology (Discovery 3.1)
- Substrate anchor pin via git worktree (Discovery 4.5)
- κ anchor SHA256 verification (Ask C)
- Inline §A inherited rules in launch decision (Ask E alternative)

---

## §9 — Cross-references

- Predecessor brief: `briefs/2026-04-28-cc4-gepa-tier2-evolution-faza1-brief.md`
- Pre-flight report: `briefs/2026-04-28-cc4-faza1-preflight-report.md`
- Phase 4.3 verdict: `decisions/2026-04-28-phase-4-3-rescore-delta-report.md`
- Pilot artifact: `benchmarks/results/pilot-2026-04-26/pilot-task-{1,2,3}-C.jsonl`
- Manifest v6 anchor: `benchmarks/preregistration/manifest-v6-preregistration.yaml`
- κ anchor file: `benchmarks/calibration/2026-04-24-trio-strict-recal.json`
- κ ratification commits: 60d061e → 38a830e → 01f7ead
- Substrate anchor commit: `c9bda3d` (Phase 4.7 HEAD on feature/c3-v3-wrapper)
- Memory entry on Phase 1 κ ratification: `.auto-memory/project_task25_stage3_v6_phase1_pass.md` (PM-side)
- Feedback rules: brief §6 (canonical for Faza 1 work)

---

**End of Amendment 1. Binding upon paste-into-CC-2. Proceed to manifest v7 + launch decision LOCK + corpus generation.**
