---
decision_id: 2026-04-26-pilot-verdict-FAIL
date: 2026-04-26
authority: PM (Marko Marković) — ratified
type: pilot close-out + halt expansion
predecessors:
  - briefs/2026-04-26-agentic-knowledge-work-pilot/cc1-brief.md
  - briefs/2026-04-26-agentic-knowledge-work-pilot/cc1-brief-amendment-2026-04-26.md
  - briefs/2026-04-26-agentic-knowledge-work-pilot/cc1-brief-amendment-v2-2026-04-26.md
manifest_anchor: pilot-2026-04-26-v1
---

# Pilot 2026-04-26 — Final Verdict: FAIL

**Pilot:** `agentic-knowledge-work-pilot-2026-04-26`
**Hypotheses tested:** H2 (Opus multiplier), H3 (Qwen multiplier), H4 (sovereignty bridge)
**Sample:** N=3 tasks × 4 cells = 12 candidate runs + 36 judge calls
**Outcome:** **🔴 FAIL** — H2 1/3, H3 0/3, H4 0/3, critical_failures 0
**Total cost:** $5.5806 / $20 cap (28%) · **Total wall:** ~80 min over 3 sessions

---

## 1. Result table (binding)

| Task | A (Opus solo) | B (Opus + harness) | C (Qwen solo) | D (Qwen + harness) | H2 (B−A) | H3 (D−C) | H4 (D vs A) |
|------|---------------|---------------------|----------------|---------------------|----------|----------|--------------|
| task-1 strategic synthesis (7 docs) | 4.611 | 4.944 | 4.583 | 4.389 | **+0.333 PASS** | −0.194 ✗ | −0.222 ✗ |
| task-2 cross-thread coord (4 threads) | 4.944 | 5.000 | 4.667 | 3.944 | +0.056 ✗ | −0.722 ✗ | **−1.000 ✗** |
| task-3 decision support (3 memos) | 4.944 | 4.889 | 4.889 | 4.556 | −0.056 ✗ | −0.333 ✗ | −0.389 ✗ |
| **TOTALS** | — | — | — | — | **1/3** | **0/3** | **0/3** |

Pre-registered PASS criteria (cc1-brief §2): each hypothesis directional sign on ≥ 2 of 3 tasks. **All three hypotheses fail this criterion.**

---

## 2. What this pilot did and did not test

**Tested:**
- Multi-step agent loop with retrieval-augmented self-prompting (amendment v1 §1, renamed in amendment v2 §1)
- HybridSearch (FTS5 + vec0 RRF) over per-task SessionStore corpus
- Trio judge ensemble (Opus + GPT + MiniMax M2.7, κ=0.7878 from Stage 3 v6 calibration)
- Two model classes (Claude Opus 4.7, Qwen 3.6 35B-A3B via DashScope direct)
- Three task types (strategic synthesis, cross-thread coordination, decision support)

**Did NOT test:**
- True GEPA self-evolve (deferred — no labeled training corpus exists for open-ended N=1 synthesis tasks)
- Long-task scenarios (multi-hour runs, checkpoint/recovery, context window exhaustion)
- Skills/tools layer (only retrieval was exercised; agent had no tool-use beyond search)
- Across-model-variance bound (H5, not pre-registered for this pilot)

**Implication:** the FAIL verdict is on the multi-step harness pattern as currently implemented. GEPA self-evolve as a separate thesis remains untested and could be evaluated separately if a labeled corpus is authored.

---

## 3. Methodology audit findings (binding for future work)

### 3.1 Original smoke had 2 confounds — addressed via amendment v2

- **Wrong Qwen model:** original brief specified `qwen3.6-35b-a3b-via-openrouter` which bridges to Qwen 3.5 (`openrouter/qwen/qwen3.5-35b-a3b`) per litellm-config.yaml comment "one-minor regress to 3.5 until OR carries 3.6". Cells C/D Task 1 originally ran on Qwen 3.5.
- **Wrong max_tokens for synthesis:** wrapper default 4096 vs Stage 3 v6 lineage 16000-64000. Reasoning headroom may have been silently constrained.

Amendment v2 §2 corrected both: `qwen3.6-35b-a3b-via-dashscope-direct` + thinking=on + max_tokens=16000. Cells C/D Task 1 restarted under corrected config. Restart shifted Cell C 4.167 → 4.583 (+0.42), Cell D 3.944 → 4.389 (+0.45). H4 reversal magnitude fell from −0.555 → −0.111 — but did not cross zero.

### 3.2 Confounds NOT eliminated by amendment v2

- **Cell B Opus loop_exhausted on Tasks 2 + 3:** the 5-step `MAX_STEPS` ceiling was binding. Task-2/B `loop_exhausted=true` (steps=3, retr=2 — but step budget reached without natural finalization). Task-3/B `loop_exhausted=true` (steps=4, retr=3). Opus multi-step was force-finalized on those tasks. May have degraded Cell B output → contributed to H2 reading negative on Tasks 2 + 3.
- **Cell A judge ceiling:** Opus solo scored 4.611 / 4.944 / 4.944. With Cell A near 5.0 on Tasks 2 + 3, there is almost no Likert headroom for Cell B to "improve" within the 1-5 scale. Multiplier hypotheses (H2) become hard to test on tasks where the solo baseline is already near judge ceiling.
- **MiniMax max_tokens=1024 (initial config)** caused 3 of 12 judge calls to fail mid-JSON. Bumping 1024 → 3000 (PM-ratified post-second-smoke) yielded 11/12 success across the rest of the pilot. **Recommendation:** keep max_tokens=3000 for any successor MiniMax-judge benchmark.

### 3.3 What the FAIL verdict means

The harness as currently implemented does not deliver the multiplier we need on synthesis-class tasks. **Possible causes** (not yet disambiguated):

1. **5-step MAX_STEPS too tight** for Opus on longer-context tasks (Tasks 2 + 3). Raising to 8-10 steps could change H2 reading.
2. **Retrieval fragmentation hurts Qwen** — passing retrieved chunks back to the model splits the context vs. a single full-materials prompt. Qwen may reason better over coherent full context than over RAG-fragmented context.
3. **Judge ceiling on solo cells** — when solo scores ~4.94, multiplier is bounded by ~0.06 max. H2 reading on Tasks 2 + 3 is dominated by ceiling effect, not real harness capability.
4. **Single-shot prompts already include all materials** — for tasks with 3-7 documents fitting comfortably in context window (all 3 pilot tasks did), retrieval-augmented multi-step adds latency + token overhead without information gain.

These causes are testable in a re-pilot after the harness is fixed.

---

## 4. Operational findings (binding for successor benchmarks)

| Finding | Disposition |
|---------|-------------|
| MiniMax `max_tokens` = 1024 too tight for dense memo responses | Bump to **3000** for any future MiniMax-judge benchmark |
| Loop_exhausted on Cell B/D for longer-context tasks | Raise `MAX_STEPS` to 8-10 (testable via re-pilot) |
| Cell A judge ceiling on compact tasks | Use longer / more complex tasks for multiplier benchmarks; or use absolute-difficulty calibration |
| Qwen 3.6 via DashScope direct + thinking=on + 16000 tokens = correct synthesis-class config | Inherit for any successor benchmark; binding via amendment v2 §5 |
| OR-bridge `qwen3.6-35b-a3b-via-openrouter` regresses to Qwen 3.5 | Use only as documented failover; never as primary route |
| `INHERITED_CONFIGS_REQUIRE_TASK_TYPE_AUDIT` rule | New binding rule per amendment v2 §5; PM commits to honor in future brief authoring |

---

## 5. Halt expansion — full N=400 multiplier benchmark NOT authorized

Per cc1-brief §11 + amendment v2 §7, PM action on FAIL is one of three branches:

- **Branch A — full benchmark NOT authorized:** Expansion would be expensive evidence collection on a known-negative direction. ✓ **PM SELECTION**
- **Branch B — full benchmark conditionally authorized after harness fix.** Folded into Branch A logic — re-pilot N=12-20 is the prerequisite (see §6).
- **Branch C — pivot to retrieval V2 work.** Folded into the agent-fix sprint (see §6) since retrieval improvements would be evaluated in the same re-pilot as harness improvements.

**PM selection: Branch A + agent-fix sprint** (per memorandum 2026-04-26 ratification).

---

## 6. Successor work — agent-fix sprint authorized

PM has authorized a 1-2 week sprint covering:

**PRIMARY (multi-step harness pattern fix in `packages/agent/`):**
1. Output normalization layer (`packages/agent/src/output-normalize.ts` — new)
2. Model-aware prompt shapes (`packages/agent/src/prompt-shapes/` — new directory)
3. Multi-step agent loop unification (consolidate `scripts/run-pilot-2026-04-26.ts` + `benchmarks/harness/src/cells.ts` proxy → `packages/agent/src/agent-loop.ts` as single source of truth)
4. Long-task persistence + recovery (`packages/agent/src/long-task/{checkpoint,recovery,context-manager}.ts` — new)
5. Skills + tools audit (`packages/agent/src/*-tools.ts` — refactor to model-aware)
6. Failure taxonomy + per-cell + per-model reports (`packages/agent/src/failure-classify.ts` — new)
7. Run artifacts + reproducibility (`packages/agent/src/run-meta.ts` — new)

**SECONDARY (after PRIMARY confirmed PASS via re-pilot):**
8. GEPA evaluation with proper labeled corpus (per-model + multi-model objective) — extends existing `packages/agent/src/{iterative-optimizer,evolution-gates,eval-dataset}.ts`

**VALIDATION:** Mini re-pilot N=12-20 — same 4-cell structure, plus H5 (across-model variance < 0.15 Likert) + H6 (long-task scenario completes). Cost cap $30, halt $25.

**Acceptance gates:**
- Stage 3 v6 oracle ceiling reproduces 74% (no substrate regression)
- Re-pilot H2/H3/H4 PASS on ≥ 2/3 tasks
- Cross-model variance bounded
- Long-task scenario completes on all 3 models without data loss
- Zero `thinking_leakage` failures in Qwen output post-normalization
- `benchmarks/harness/cells.ts` no longer proxy — uses `packages/agent/src/agent-loop.ts`
- Pilot wrapper consolidated into `packages/agent/`
- Robustness gate blocks candidates that improve one model but degrade another > 2pp

---

## 7. Substrate claim — paper claim #1 STANDS

This pilot does NOT invalidate paper claim #1 (memory substrate quality). Stage 3 v6 LoCoMo apples-to-apples 74% (oracle ceiling) vs Mem0 published 66.9% remains the binding evidence for memory substrate. See `benchmarks/results/v6-self-judge-rebench/apples-to-apples-memo.md` and commit `b7e19c5`.

The pilot was specifically scoped to paper claim #2 (multiplier on agentic knowledge work). That claim requires further work before it can be made.

---

## 8. Artefacts (binding evidence)

| Path | Description |
|------|-------------|
| `benchmarks/results/pilot-2026-04-26/pilot-task-{1,2,3}-{A,B,C,D}.jsonl` | 12 binding cell records |
| `benchmarks/results/pilot-2026-04-26/pilot-summary.json` | Re-emitted aggregate (covers all 12 cells) |
| `benchmarks/results/pilot-2026-04-26/pilot-run.log` | Continuous log: smoke → restart → final chain |
| `benchmarks/results/pilot-2026-04-26/invalidated/` | Original smoke C/D records preserved for audit |
| `benchmarks/results/pilot-2026-04-26/prompts-archive/` | Per-cell prompts + multi-step traces |
| `briefs/2026-04-26-agentic-knowledge-work-pilot/cc1-brief.md` | Original brief (audit-immutable) |
| `briefs/2026-04-26-agentic-knowledge-work-pilot/cc1-brief-amendment-2026-04-26.md` | Amendment v1 |
| `briefs/2026-04-26-agentic-knowledge-work-pilot/cc1-brief-amendment-v2-2026-04-26.md` | Amendment v2 |
| `scripts/run-pilot-2026-04-26.ts` | Pilot orchestrator (to be unified into `packages/agent/`) |

---

## 9. Audit chain (per amendment v2 §8)

```
amendment_v2_doc_sha256 = 1ab5082ff773538a26b3c3294f7fbee4e30063a8d994bdb3753bdc9dd6d6cd99
amendment_v1_doc_sha256 = 3946d3e00fbb1996fb7e63096ecef51abf1e209e5ff166fd0d8758e9a3a14aad
cc1_brief_sha256        = 9805adae478333178d36d71b88795afc37f8fb543c2ebccaecb7b01faf06afee
judge_rubric_sha256     = 2e24826eb75e92ef1e64055bb2c632eec64ded8fedf7d5b6897ccaec9ffff2eb
head_sha (at pilot run) = b7e19c557fdbc42f2d0a3c3213176aa4d790f7a2
manifest_anchor         = pilot-2026-04-26-v1
```

---

**End of verdict. Pilot CLOSED. Successor work scope = agent-fix sprint (PRIMARY → re-pilot → SECONDARY).**
