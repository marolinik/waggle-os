# CC-1 Brief Amendment v2 — Agentic Knowledge Work Pilot
## (binding for Cells C/D restart + Tasks 2/3 execution; supplements amendment v1)

**Date authored:** 2026-04-26 (post-smoke audit)
**Authority:** PM-RATIFY-AUDIT-OPTION-B-AND-AMENDMENT-V2 (this date)
**Predecessor (audit-immutable):** [`cc1-brief.md`](cc1-brief.md) — unchanged
**Sibling (audit-immutable):** [`cc1-brief-amendment-2026-04-26.md`](cc1-brief-amendment-2026-04-26.md) — amendment v1, unchanged
**Manifest anchor:** `pilot-2026-04-26-v1` — **UNCHANGED** (no v2 manifest anchor; both amendments share v1 anchor)
**Pilot ID:** `agentic-knowledge-work-pilot-2026-04-26` — UNCHANGED
**Wall-clock budget:** **7-10 hours** (inherited from amendment v1 §6)

---

## §1 — Trigger

Smoke audit (Task 1, all 4 cells, executed 2026-04-26T00:43:55Z → 00:50:44Z) revealed two methodology gaps in amendment v1 §1:

**Gap 1 — alias bridge regression to Qwen 3.5:** Amendment v1 §1 named `qwen3.6-35b-a3b-via-openrouter` as the primary Qwen alias. Per `litellm-config.yaml` comment block (verbatim): *"OpenRouter bridge — failover when DashScope rate-limits or is unavailable, caller-side retry should fall back to qwen3.6-35b-a3b-via-openrouter (bridge route, **one-minor regress to 3.5 until OR carries 3.6**)"*. The bridge alias actually routes to `openrouter/qwen/qwen3.5-35b-a3b` — Qwen 3.5, not 3.6. Smoke Cells C/D ran on Qwen 3.5, NOT the Qwen 3.6 the brief intended.

**Gap 2 — wrapper default `max_tokens=4096`:** Amendment v1 did not specify a Qwen `max_tokens` ceiling. Wrapper default was 4096. This is well below the Sprint 10 LOCK lower bound (16000) and the Sprint 11 OVERRIDE (64000). Stage 3 v6 LoCoMo apples-to-apples 74% result was generated with `max_tokens=64000`. While smoke Cell C/D responses completed naturally (no truncation observed), reasoning headroom may have been silently constrained.

**Inheritance gap source:** Amendment v1 §1 named the OR-bridge alias likely by copy-paste from Stage 3 v6 §5.1 fallback list (where the OR-bridge IS the failover entry), not from v6 primary route which is `qwen3.6-35b-a3b-via-dashscope-direct` + thinking=on + max_tokens=64000. PM brief authoring did not cross-reference the actual config that produced the v6 published result.

**Effect on smoke H3/H4 directional reading:** Cell C trio_mean=4.167 vs Cell D trio_mean=3.944 (H3 Δ=−0.222) and Cell D vs Cell A (H4 Δ=−0.555) cannot be cleanly attributed. Confounds: (a) wrong model class (3.5 vs 3.6), (b) potentially constrained reasoning (4096 vs 16000-64000 cap), (c) residual real signal that harness hurts Qwen on synthesis. Re-run with corrected config required to disambiguate.

---

## §2 — Explicit Qwen config (verbatim, audit-verified)

The following config supersedes amendment v1 §1 / §3 specifications for ALL Qwen calls in this pilot from amendment v2 ratification forward (Cells C/D Task 1 restart + Cells C/D Tasks 2 + 3):

```
alias:        qwen3.6-35b-a3b-via-dashscope-direct
              (verified at litellm-config.yaml lines 410-415; routes to
               openai/qwen3.6-35b-a3b via DashScope intl tenant)
thinking:     ON   (explicit parameter — wrapper MUST pass enable_thinking
                    decision intentionally; do NOT rely on Qwen default
                    behavior since defaults vary across providers and
                    model versions)
max_tokens:   16000
temperature:  0.3
```

**Rationale (PM-stated, verbatim from ratification):** *"Stage 3 v6 LoCoMo apples-to-apples 74% result was generated with this exact config (Sprint 11 OVERRIDE ratified 2026-04-22). Synthesis tasks require equivalent reasoning headroom; Sprint 10 LoCoMo factoid LOCK (thinking=off, 16000) does NOT generalize to synthesis class."*

**Why 16000 and not 64000:** PM explicitly chose 16000 to keep per-cell spend safely under the per-cell hard halt (raised to $1.00 in §4 below). 64000 is technically higher-fidelity (matches Stage 3 v6 verbatim) but the marginal reasoning depth gain is judged not worth the per-cell halt risk. 16000 is the Sprint 10 LOCK lower bound that achieved 5/5-safe convergence on all 5 LoCoMo prompt shapes — sufficient headroom for synthesis.

**Implementation requirement (orchestrator):** the wrapper must pass `extra_body.enable_thinking: true` (NOT omit it) and `max_tokens: 16000` (NOT the default 4096) on every Qwen subject call (Cells C and D). Judge calls remain unchanged (judges run thinking=off per amendment v1 §3, max_tokens=1024).

---

## §3 — Retroactive scope note

**Original smoke Task 1 — partial invalidation:**

| Cell | Original status | Disposition under amendment v2 |
|------|-----------------|--------------------------------|
| A — Opus solo | Wrote `pilot-task-1-A.jsonl` (trio_mean=4.50, 2-judge fallback after MiniMax JSON-parse failure) | **RETAIN candidate response.** Surgical MiniMax judge retry authorized in §3.1 below; if retry succeeds, JSONL record updated to full-trio. |
| B — Opus + memory + harness | Wrote `pilot-task-1-B.jsonl` (trio_mean=4.94, full trio) | **RETAIN.** Opus model unaffected by Qwen alias bug; max_tokens=4096 was sufficient (response completed naturally). |
| C — Qwen solo | Wrote `pilot-task-1-C.jsonl` (trio_mean=4.17, full trio, on Qwen 3.5 via OR bridge) | **INVALIDATED.** Discard from final pilot summary. Restart with §2 config. |
| D — Qwen + memory + harness | Wrote `pilot-task-1-D.jsonl` (trio_mean=3.94, full trio, on Qwen 3.5 via OR bridge) | **INVALIDATED.** Discard from final pilot summary. Restart with §2 config. |

**Original JSONL files preserved on disk** for audit (not deleted). Final `pilot-summary.json` will reference only the binding records: A (potentially with MiniMax retry merged), B (original), C (restarted), D (restarted), then Tasks 2 + 3 cells (all 8 with §2 config).

**§3.1 — Cell A MiniMax surgical retry:**

The Opus candidate response for Cell A is correct (Opus model not affected by alias bug). Only the MiniMax judge call returned malformed JSON on all 3 retries. Authorized action: re-run JUST the MiniMax judge call against the existing Cell A `candidate_response`, no candidate re-call.

- If retry succeeds: update `pilot-task-1-A.jsonl` `judge_minimax` field with new verdict; recompute `trio_mean`, `trio_strict_pass`, `trio_critical_fail` accordingly. Append a `judge_minimax_retried_at` timestamp field.
- If retry fails again (3 more retries malformed): retain 2-judge fallback as the binding record. Add explicit note to `pilot-summary.json` aggregate explaining the partial-trio cell.
- Estimated cost: ~$0.07 (one MiniMax call against ~6KB candidate response + materials context).

---

## §4 — Cost ceiling (REVISED per PM update 2026-04-26)

| Item | Original (v1) | Revised (v2) |
|------|---------------|---------------|
| Hard cap | $7.00 | **$20.00** |
| Halt threshold | $6.00 | **$17.00** |
| Per-cell hard halt | $0.50 | **$1.00** |
| Per-call sanity (single judge or candidate) | $0.50 (sanity ping) | **$0.40 (hard halt + ping)** |
| Estimated cumulative through pilot completion | — | **$5.50-6.50 (unchanged from prior estimate; raised cap is buffer not target)** |

**Halt-and-ping rules (binding):**
- Any single API call > $0.40 → halt + ping PM (was $0.50 sanity ping; now hard halt at lower threshold)
- Any cell cumulative > $1.00 → halt + ping PM (was $0.50)
- Cumulative > $17.00 → halt + emit partial summary + ping PM (was $6.00)
- Any cell exceeds 90 wall-clock minutes → halt + ping PM (unchanged)
- Any judge returns malformed JSON 3+ times in row → halt + ping PM (unchanged from amendment v1 §7)
- Any candidate model returns refusal / safety-block → halt + ping PM (unchanged)

**Rationale (PM-stated, verbatim from ratification):** *"methodology correctness (Qwen DashScope direct + thinking=on + 16000 tokens) takes priority over cost tightness; original $7 cap was authored before audit revealed config inheritance gap; raised cap removes pressure to optimize for cost over reasoning headroom."*

The raised cap is BUFFER not TARGET. Expected cumulative remains $5.50-6.50. The raise exists so the orchestrator does not silently constrain Qwen reasoning depth to stay under a tight budget. If the methodology requires it, spending the buffer is correct; if methodology does not require it, expected spend stays well under raise.

---

## §5 — Manifest scope note appended

**INHERITED_CONFIGS_REQUIRE_TASK_TYPE_AUDIT** (binding rule, future PM brief authoring):

Any future benchmark inheriting alias / thinking-mode / max_tokens / temperature config from a prior sprint LOCK MUST verify task-type taxonomy match between the source LOCK context and the target benchmark. Specifically:

- **LoCoMo factoid task** (single-fact recall, multi-anchor enumeration, chain-of-anchor, temporal-scope, null-result-tolerant) ≠ **synthesis / agentic knowledge work** (cross-document strategic memo, multi-thread coordination, multi-stakeholder decision support).
- LoCoMo factoid LOCKs (e.g., Sprint 10 Task 1.1 `thinking=off, max_tokens=16000`) **DO NOT generalize** to synthesis class.
- Brief author MUST either (a) explicitly justify config inheritance per task-type-match argument, OR (b) specify config from scratch with task-type-appropriate rationale.

This rule binds:
- Future PM brief authoring for any benchmark touching Qwen (and by extension, any reasoning-class model with mode toggles)
- The full N=400 multiplier benchmark (post-pilot, if PASS)
- Any v3 or successor amendments to existing benchmarks

**Anti-pattern this rule addresses:** copy-paste of model alias from a fallback-route list in a different sprint's manifest, without verifying the alias resolves to the intended model class.

---

## §6 — Anchor unchanged

`pilot-2026-04-26-v1` remains the manifest anchor. Amendment v2 SUPPLEMENTS amendment v1 without superseding the anchor. Both amendments + the original `cc1-brief.md` form the binding execution document set. The orchestrator records all three SHA-256s in the run log preamble and the pilot result commit body.

In conflict resolution: v2 binds over v1 binds over original cc1-brief.md (specific overrides general; latest binds). Where v2 is silent, v1 governs. Where v1 is silent, original brief governs.

---

## §7 — Restart sequence (binding on PM amendment-v2 verification)

1. **PM verifies amendment v2 text + §2 config block** (this step in flight).
2. **CC-1 updates orchestrator** to support §2 config:
   - New CLI flag `--qwen-alias <alias>` defaulting to `qwen3.6-35b-a3b-via-dashscope-direct`
   - New CLI flag `--qwen-max-tokens <int>` defaulting to `16000`
   - Explicit `extra_body.enable_thinking: true` for Qwen subject calls (NOT relying on default)
   - New CLI flag `--retry-cell-a-minimax` for Cell A MiniMax surgical retry
   - New CLI flag `--restart-cells` accepting cell IDs to re-run (e.g., `--restart-cells C,D`)
3. **CC-1 runs:**
   - Cell A MiniMax surgical retry
   - Cell C Task 1 restart (Qwen 3.6 DashScope direct, thinking=on, max_tokens=16000)
   - Cell D Task 1 restart (same config)
4. **CC-1 emits second smoke verification ping** with: 4 Task 1 records (A retained-with-or-without-MiniMax-update, B retained, C fresh, D fresh), Cell A MiniMax retry outcome, cumulative cost.
5. **PM verifies second smoke** per same 10-item criteria as first smoke + H3/H4 directional reading on corrected config.
6. **PM authorizes Tasks 2 + 3** (8 remaining cells, all under §2 Qwen config for cells C/D).
7. **CC-1 emits final pilot summary** + pilot result commit + halt ping.

PM does not need to re-verify amendment v2 text after CC-1 emits restart results; v2 text is locked by this round of verification.

---

## §8 — Audit SHA capture in pilot result commit body

The orchestrator MUST record in run log preamble AND pilot result commit body:

```
amendment_v2_doc_sha256 = <sha of cc1-brief-amendment-v2-2026-04-26.md>
amendment_v1_doc_sha256 = <sha of cc1-brief-amendment-2026-04-26.md>
cc1_brief_sha256        = <sha of cc1-brief.md>
judge_rubric_sha256     = <sha of judge-rubric.md>
head_sha                = <git HEAD at restart kick>
```

All five SHAs together form the binding execution document tamper-evident chain.

---

**End of amendment v2. PM verification of v2 SHA requested before Cells C/D Task 1 restart.**
