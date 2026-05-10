# Substrate Integrity Audit Brief (Korak 12, light scope)

**Date:** 2026-04-27
**Author:** PM
**Status:** Authored awaiting Marko ratification + CC-3 (or CC-2 post sibling workflow) executor assignment
**Scope corollary:** Korak 12 iz 14-step launch plan (substrate claim integrity audit)
**Light scope rationale:** Memory Sync Repair Step 1+2 empirically verified substrate parity (zero bugs surfaced, zero API drift, all 591 mind/ tests pass against waggle-os). Korak 12 audit therefore reduces from full independent audit to standard reproducibility verification.

---

## §1 — Goal

Pre-launch verification da paper claim 74% self-judge oracle / 33.5% trio-strict oracle (Stage 3 v6 N=400) ostaje reproducibility-anchored kroz post-pilot agent fix sprint + V2 retrieval work. **Substrate claim integrity audit je critical-path pre arxiv submission + Day 0 launch.**

Light scope: 4 deliverables pre arxiv submission (estimated 1 day CC work + ~$0.50 cost).

---

## §2 — Light scope rationale (post 2026-04-27 Memory Sync Repair)

**Originalni Korak 12 scope** (pre-Memory-Sync-Repair):
- Manifest v6 reproducibility verification (SHA256 compare canonical)
- Audit chain SHA verification
- Trio judge ensemble κ recalibration
- Apples-to-apples re-eval external verifiability
- Mock-fallback events absence verification
- V2 reproducibility check pre arxiv submission

**Reduced scope** (post-Step 1+2 evidence):
- Empirijski signal: zero bugs surfaced through 14 hive-mind test ports + 591 tests pass
- Zero API drift detected on critical files (frames/search/knowledge — sve 32 cases pass)
- Substrate parity verified through 3 lenses (empirical + structural + procedural per Memory Sync Repair closure memo §3)
- 14 test files added → production code (Tauri desktop) sad ima coverage koje nije imao za Stage 3 v6

**Implikacija:** substrate claim 74%/33.5% nije confounded by hidden bugs. Independent audit nepotreban; standard reproducibility verification dovoljan kao pre-launch prerequisite.

---

## §3 — Four deliverables (light scope)

### 3.1 — Manifest v6 reproducibility verification

**Goal:** verify pre-registered manifest v6 still anchors all paper claims at byte-identical hash.

**Steps:**
1. Compute SHA256 of `D:\Projects\waggle-os\benchmarks\preregistration\manifest-v6-preregistration.yaml`
2. Compare to canonical SHA256 from Stage 3 v6 5-cell summary memo (`5d5c1023421cd1a79f4913bb4c0a59415e21f50797255bff7dfec8e16b68e3ed`)
3. If MATCH: manifest reproducibility intact, paper claims pinned to known config
4. If MISMATCH: investigate which lines changed, why, ratify with Marko whether legitimate post-stage-3 amendment or accidental drift

**Expected outcome:** MATCH (manifest is in v6 §11 frozen path list, untouched by agent fix sprint).

**Acceptance:** SHA256 verification documented + result recorded in Korak 12 results memo.

**Cost:** $0 (local SHA computation).

### 3.2 — Audit chain SHA verification

**Goal:** verify Stage 3 v6 audit chain (amendment v2 + amendment v1 + cc1_brief + judge_rubric + HEAD) preserved + reachable.

**Steps:**
1. Read `decisions/2026-04-26-pilot-verdict-FAIL.md` audit chain block
2. Verify each SHA still accessible:
   - amendment_v2_doc_sha256: `1ab5082ff773538a26b3c3294f7fbee4e30063a8d994bdb3753bdc9dd6d6cd99`
   - amendment_v1_doc_sha256: `3946d3e00fbb1996fb7e63096ecef51abf1e209e5ff166fd0d8758e9a3a14aad`
   - cc1_brief_sha256: `9805adae478333178d36d71b88795afc37f8fb543c2ebccaecb7b01faf06afee`
   - judge_rubric_sha256: `2e24826eb75e92ef1e64055bb2c632eec64ded8fedf7d5b6897ccaec9ffff2eb`
   - head_sha: `b7e19c557fdbc42f2d0a3c3213176aa4d790f7a2`
3. Spot-check: compute SHA256 of each referenced file, verify match
4. Note: HEAD SHA is at execution time of Stage 3 v6 N=400 + pilot 2026-04-26; current main HEAD will differ (post agent fix commits) — that's expected. Audit chain pinning is to historical HEAD, not current.

**Acceptance:** all 5 SHAs traceable + spot-check verified for amendment v1+v2 + cc1_brief + judge_rubric.

**Cost:** $0 (local SHA computation).

### 3.3 — Trio judge ensemble κ recalibration spot-check

**Goal:** verify trio-strict κ=0.7878 (ensemble agreement on 14-instance PM-labeled subset) reproduces under current model versions.

**Why needed:** Opus 4.7 / GPT-5.4 / MiniMax M2.7 may have model-version updates between Stage 3 v6 (2026-04-24) and arxiv submission. If versions changed and κ drifts substantially (>0.05 Fleiss κ), paper claim methodology bias quantification (+27.35pp self-judge bias) needs re-anchoring.

**Steps:**
1. Pull 14-instance PM-labeled subset from `benchmarks/calibration/2026-04-24-trio-strict-recal.json`
2. Re-run trio judges (Opus 4.7 + GPT-5.4 + MiniMax M2.7 with judge max_tokens=3000 per Stage 3 v6 fix)
3. Compute Fleiss κ on new ensemble verdicts
4. Compare to canonical 0.7878
5. If within ±0.05: κ stable, paper methodology bias claim intact
6. If drift > ±0.05: investigate which judge changed behavior, ratify with Marko whether re-recalibration of larger set needed

**Acceptance:** κ spot-check within ±0.05 of canonical 0.7878 OR documented drift + remediation plan.

**Cost:** ~$0.20 (14 instances × 3 judges × judge cost ~$0.005).

### 3.4 — V2 reproducibility check pre arxiv submission (lightweight)

**Goal:** ensure V2 retrieval results (when Phase C completes) can be reproduced byte-identical from V2 manifest + dataset + seed.

**Steps:**
1. Wait for V2 Phase C completion (ETA 2-3 weeks post Korak 1 + 1.5 done — per V2 brief)
2. Verify V2 manifest SHA + V2 results JSONL SHAs documented in V2 phase memo
3. Smoke replay: re-issue 5 random V2 predictions using `verifyDeterministicReplay` from Phase 1.3 run-meta.ts, verify byte-identical raw responses
4. If 5/5 byte-identical match → V2 reproducibility confirmed
5. If < 5/5 match → investigate non-determinism source (temperature drift, model version change, randomness in retrieval ranking)

**Acceptance:** V2 reproducibility verified pre arxiv submission OR documented gap + remediation.

**Cost:** ~$0.30 (5 prediction replay × subject + judge cost).

**Sequencing note:** 3.4 cannot start until V2 Phase C completes. 3.1 + 3.2 + 3.3 can run any time.

---

## §4 — Out-of-scope (what NOT in this audit)

**Per light scope rationale, the following are explicitly NOT in Korak 12:**

1. **Independent re-run of Stage 3 v6 N=400 trio-strict** — costly (~$30) and unnecessary; Memory Sync Repair Step 1+2 empirical verification + audit chain SHA verification are sufficient signal.

2. **Apples-to-apples re-eval external verifiability** — original Apples-to-Apples self-judge re-eval anchor is already audit-ready (manifest + dataset SHA + judge prompt + raw outputs all in repo); external verifiability is community responsibility post arxiv release, not pre-launch PM scope.

3. **Mock-fallback events historical absence verification** — mock-fallback would have caused massive Stage 3 v6 anomaly (deterministic-mock embedder is semantically meaningless per embedding-provider.ts:131); 74% / 33.5% oracle results impossible if mock was active; absence is implicit.

4. **Per-cell substrate behavior re-verification** — Phase 2 acceptance gate dual-methodology smoke (CC-1 sprint) is the operational verification; Korak 12 doesn't duplicate that work.

5. **Independent code review of mind/ substrate** — Memory Sync Repair Step 2 test ports already exercised every public API surface; coverage gap (reconcile crash-recovery, etc.) closed empirically.

---

## §5 — Acceptance criteria (binding)

Korak 12 audit ships when:

- [ ] 3.1 Manifest v6 SHA256 verification documented (MATCH expected)
- [ ] 3.2 Audit chain 5 SHAs spot-checked + recorded
- [ ] 3.3 Trio judge κ recalibration within ±0.05 (or documented drift)
- [ ] 3.4 V2 reproducibility replay 5/5 byte-identical (when V2 Phase C completes)
- [ ] Results memo: `decisions/2026-04-XX-substrate-integrity-audit-results.md` (XX = run date)
- [ ] PM ratification + sign-off pre arxiv submission

---

## §6 — Sequencing

**Independent of Korak 1 + 1.5 critical path:**
- 3.1 + 3.2 + 3.3 can run **anytime** post Memory Sync Repair Step 3 sibling workflow PR opened (so workflows are ratified before integrity audit)
- 3.4 sequenced post V2 Phase C completion

**Recommended timing:**
- 3.1 + 3.2 + 3.3 ide u Week 2-3 of remaining launch path (after agent fix Phase 5 completes — to avoid CC sesija conflict)
- 3.4 ide post V2 Phase C (Week 5-6)
- Korak 12 ratification kao final pre-launch gate (Week 6-9 wall-clock)

---

## §7 — Executor assignment

CC-3 (V2 work session) može da preuzme Korak 12 jer paralelno radi V2 ablations koji touch isti benchmark infrastructure. Plus CC-3 ima context warm na manifest + judge ensemble + V2 reproducibility patterns.

Alternative: CC-2 može da preuzme post sibling workflow PR completion (memory sync repair scope finished, contextually adjacent to substrate integrity work).

PM rec: **CC-3 in V2 work session** as natural fit. If CC-3 sesija scope > 16h, split: assign 3.1+3.2+3.3 to CC-3 early in V2 work, 3.4 post Phase C.

---

## §8 — Open questions for Marko

1. **Ratify light scope** (4 deliverables, ~$0.50 cost, 1 day work) over original deeper scope? PM rec yes — Memory Sync Repair empirical verification je strong substitute za independent audit.
2. **Executor assignment** — CC-3 (preferred per V2 context warm) ili CC-2 (if sibling workflow leaves CC-2 with capacity)? PM rec CC-3.
3. **Sequencing** — 3.1+3.2+3.3 anytime post Step 3 sibling, 3.4 post V2 Phase C? PM rec yes.

---

## §9 — Cross-references

- 14-step launch plan: `.auto-memory/project_launch_plan_14_step_2026_04_27.md`
- Memory Sync Repair closure memo: `decisions/2026-04-27-memory-sync-repair-CLOSED.md`
- Pilot verdict (audit chain anchor): `decisions/2026-04-26-pilot-verdict-FAIL.md`
- Stage 3 v6 5-cell summary (manifest SHA anchor): `D:\Projects\waggle-os\benchmarks\results\stage3-n400-v6-final-5cell-summary.md`
- V2 brief (3.4 prerequisite): `briefs/2026-04-26-retrieval-v2-embeddings-audit-brief.md`
- V2 pre-launch sequencing addendum: `decisions/2026-04-26-v2-pre-launch-sequencing-addendum.md`
- arxiv paper §5 (reproducibility): `research/2026-04-26-arxiv-paper/01-paper-skeleton.md`
- Trio judge calibration anchor: `benchmarks/calibration/2026-04-24-trio-strict-recal.json` (per project_task25_stage3_v6_phase1_pass.md memory)
