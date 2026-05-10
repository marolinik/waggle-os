# CC-1 Brief — Agentic Knowledge Work Pilot Execution

**Date authored:** 2026-04-26
**Execution authorization:** Pending Marko ratification
**Pilot ID:** `agentic-knowledge-work-pilot-2026-04-26`
**Manifest anchor:** `pilot-2026-04-26-v1`
**Estimated wall-clock:** 4-6 hours
**Cost ceiling:** $5.00 hard cap, $4.00 halt

---

## §0 — Substrate readiness gate

Before kickoff, confirm with grep evidence:

- [ ] hive-mind retrieval pipeline operational (must support multi-doc ingest + chunked retrieval)
- [ ] GEPA agent harness operational at HEAD (verify on commit `<HEAD_SHA>`)
- [ ] LiteLLM gateway reachable for both candidate models (Claude Opus 4.7 + Qwen 3.6 35B-A3B)
- [ ] LiteLLM gateway reachable for trio judge (Opus 4.7 + GPT-5.4 + MiniMax M2.7)
- [ ] HEAD commit clean working tree (no uncommitted changes that would invalidate reproducibility)
- [ ] Pilot folder readable from execution env: `D:\Projects\PM-Waggle-OS\briefs\2026-04-26-agentic-knowledge-work-pilot\`

If any of the above fails, halt and ping PM with specifics. Do not proceed with workarounds.

---

## §1 — Goal & rationale

This pilot validates the **agentic knowledge work multiplier thesis** with a small directional sample (N=3 tasks × 4 cells = 12 candidate runs) before authorizing a full N=400 multiplier benchmark.

The Stage 3 v6 N=400 LoCoMo benchmark proved memory substrate quality (oracle 74% > Mem0 66.9%). That is paper claim #1 — architectural pattern.

This pilot tests paper claim #2 — **does adding hive-mind memory + GEPA self-evolve harness lift candidate model performance on real-world knowledge work** (CEO synthesis, consultant coordination, executive decision support)?

**If pilot PASSES**, full N=400 multiplier benchmark is authorized for paper claim #2.
**If pilot FAILS**, expansion halts; resources redirect to retrieval V2 work before retry.

---

## §2 — Hypotheses (pre-registered, not modifiable post-results)

- **H2 — Opus multiplier**: Cell B (Opus + memory + harness) trio mean > Cell A (Opus solo) trio mean by ≥ 0.30 Likert points, on ≥ 2 of 3 tasks
- **H3 — Qwen multiplier**: Cell D (Qwen + memory + harness) trio mean > Cell C (Qwen solo) trio mean by ≥ 0.30 Likert points, on ≥ 2 of 3 tasks
- **H4 — Sovereignty bridge**: Cell D trio mean ≥ Cell A trio mean (Qwen + harness reaches Opus solo) on ≥ 2 of 3 tasks

**PILOT PASS** = H2 + H3 + H4 each show directional sign on ≥ 2 of 3 tasks AND no critical failures (no cell scoring < 2.0 on majority of judges)
**PILOT FAIL** = otherwise

Anti-pattern reminder: thresholds do not shift post-hoc. Sample size is small; trust the directional sign, not absolute magnitudes.

---

## §3 — Cell specification

| Cell | Model | Memory layer | GEPA harness | Operating mode |
|---|---|---|---|---|
| A | claude-opus-4-7 | OFF | OFF | Single-shot; full materials in context |
| B | claude-opus-4-7 | ON (hive-mind retrieval) | ON | Multi-step agent; materials ingested → retrieval → synthesize |
| C | qwen3.6-35b-a3b | OFF | OFF | Single-shot; full materials in context |
| D | qwen3.6-35b-a3b | ON (hive-mind retrieval) | ON | Multi-step agent; materials ingested → retrieval → synthesize |

**Important configuration notes:**

- **Cell A and C (solo)**: All materials concatenated into a single user prompt. Single API call. No agent steps. No memory injection.
- **Cell B and D (memory + harness)**: Materials are first ingested into hive-mind as a session corpus. GEPA agent harness then operates with retrieval over this corpus, can re-prompt itself, and produces final response after multi-step process.
- **Same final question** is asked across all four cells per task (verbatim from task file).
- **Same temperature settings**: candidate models at `temperature=0.3, top_p=0.9`. Judge models at `temperature=0` for determinism.
- **Qwen primary route**: `qwen3.6-35b-a3b-via-openrouter` (DashScope direct) per LOCKED 2026-04-21 routing policy.

---

## §4 — Tasks

Three tasks live in this folder:

| File | Task type | Question to answer |
|---|---|---|
| `task-1-strategic-synthesis.md` | Multi-document strategic synthesis | "Identify 3 most critical risks for NorthLane Q2-Q4 2026 and propose action plan" |
| `task-2-cross-thread-coordination.md` | Cross-thread project coordination | "Prepare me for tomorrow's emergency check-in with Diane Mercer" |
| `task-3-decision-support.md` | Decision support under conflict | "Formulate my CEO decision for next 6 months given three conflicting C-level memos" |

Each task file contains:
- Persona + scenario header
- Question to answer (verbatim)
- All materials (documents/threads/memos)
- Quality expectations note (NOT shown to candidate models or judges — for PM reference only)

**Materials extraction for candidate prompts:**
- Strip the `## End of materials` block and everything after it (quality expectations note must NOT leak to candidate)
- Concatenate persona + scenario + materials + question into final prompt
- For Cells A/C: pass entire concatenation as single user message
- For Cells B/D: chunk materials into hive-mind session per natural document boundary, then pass persona + question to agent

---

## §5 — Judge ensemble

Judge ensemble locked: **Opus 4.7 + GPT-5.4 + MiniMax M2.7**
- Same trio used in Stage 3 v6 (κ_trio = 0.7878 calibrated 2026-04-24)
- Each judge scores each cell response on 6 dimensions, Likert 1-5
- Judges are **blind** to cell configuration (do not include "this is Opus solo" in judge prompt)
- Judges have access to: persona + scenario + question + materials + response only

Full rubric and judge prompt template in `judge-rubric.md`. **Do not modify rubric for execution** — copy verbatim into judge calls.

**Total judge calls**: 12 cells × 3 judges = 36 calls.

---

## §6 — Output

### Per-cell JSONL records

One record per cell per task, written to:
`D:\Projects\waggle-os\benchmarks\results\pilot-2026-04-26\pilot-{task-id}-{cell-id}.jsonl`

Schema in `judge-rubric.md` §"Output JSONL schema". 12 records total.

### Aggregate summary

Single summary file:
`D:\Projects\waggle-os\benchmarks\results\pilot-2026-04-26\pilot-summary.json`

Schema in `judge-rubric.md` §"Aggregate summary file".

### Run log

Append-only log of execution events to:
`D:\Projects\waggle-os\benchmarks\results\pilot-2026-04-26\pilot-run.log`

Include: cell start/end timestamps, candidate model latency, judge call latency, cost accumulator, errors, halt events.

---

## §7 — Cost & halt rules

**Hard cap**: $5.00 cumulative spend (candidate + judge)
**Halt threshold**: $4.00 cumulative — at this threshold, complete current cell + judges, then halt and emit partial summary

**Per-call sanity check**: any single API call exceeding $0.50 → halt and ping PM (likely runaway agent loop in Cells B/D)

**Halt-and-ping triggers** (any of these → halt, do not continue without PM):
- Single candidate call >$0.50
- Single judge call >$0.20
- Cumulative spend >$4.00
- Any cell exceeds 90 wall-clock minutes (likely agent loop)
- Any judge returns malformed JSON 3+ times in a row (judge service degraded)
- Any candidate model returns refusal / safety-block (unexpected; investigate before retry)

---

## §8 — Reproducibility

Record at execution time:
- HEAD commit SHA of waggle-os repo
- HEAD commit SHA of hive-mind repo (if extracted by then)
- Manifest anchor string: `pilot-2026-04-26-v1`
- Model versions exact (e.g., `claude-opus-4-7@2026-03-15`)
- LiteLLM config snapshot
- Random seed: `seed=42` for any stochastic component
- Full prompt concatenations (per cell, per task) saved to `prompts-archive/` subdirectory

This pilot is small enough that exact reproducibility is feasible and required.

---

## §9 — Execution sequence

1. Pre-flight (§0 substrate gate) — confirm green
2. Record HEAD SHA + manifest anchor
3. For each task (1, 2, 3):
   - For each cell (A, B, C, D):
     - Build prompt per §4 extraction rules
     - Call candidate model, capture response + latency + cost
     - For each judge (Opus, GPT, MiniMax):
       - Build judge prompt per `judge-rubric.md` template
       - Call judge model, capture verdict + rationale + cost
     - Compute trio mean, strict-pass, critical-fail flags
     - Write per-cell JSONL record
     - Update cost accumulator; check halt rules
4. Compute aggregate summary per `judge-rubric.md` schema
5. Write summary file + final run log entry
6. Ping PM with: pilot verdict (PASS/FAIL), cost, wall-clock, link to summary file

---

## §10 — Open questions for PM ratification

Before CC-1 kicks off, PM should confirm:

1. **Manifest anchor freeze**: Lock `pilot-2026-04-26-v1` as anchor string for this pilot (no v2 mid-execution).
2. **Qwen route confirmation**: Is `qwen3.6-35b-a3b-via-openrouter` still the live primary route as of 2026-04-26? (Last LOCKED 2026-04-21.)
3. **GEPA harness state**: Is GEPA self-evolve currently passing tests at HEAD, or is there a known bug requiring workaround? (If broken, pilot blocks.)
4. **hive-mind ingest path**: Confirm session-scoped corpus ingest is the correct pattern for materials (vs. global memory write). Pilot must not contaminate other test data.
5. **Judge cost reality check**: Stage 3 v6 trio averaged ~$0.07 per judge call. 36 calls = ~$2.52. Plus 12 candidate calls (Opus dominates). Total estimated ~$3.50-4.50. Confirms $5 cap is realistic but tight; halt at $4 is correct buffer.

---

## §11 — Post-execution PM actions

After CC-1 emits pilot summary:

1. PM reads summary file, validates all 12 cells executed, no critical failures
2. PM drafts go/no-go memo for full N=400 multiplier benchmark:
   - If PASS → authorize full benchmark with cost cap, model roster, scope
   - If FAIL → halt expansion, draft retrieval V2 priority brief
3. Marko ratifies decision
4. Memory updated with pilot result + decision

---

## §12 — Notes

- This is a **direction validator**, not a paper claim. Sample size is too small for publication-grade evidence.
- Full N=400 multiplier benchmark (post-pilot, if PASS) will be the publication-grade evidence. That benchmark will use the same task design pattern but with N=400 task instances and broader model coverage (Opus + Qwen + GPT-5.4).
- Pilot results are internal-only. No external comms triggered by pilot pass/fail.
- Pilot folder lives in PM-Waggle-OS, results live in waggle-os/benchmarks/results — standard separation of brief vs. execution artifacts.
