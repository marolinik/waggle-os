# CC-1 Brief Amendment — Agentic Knowledge Work Pilot
## (binding for execution; supersedes original cc1-brief.md where in conflict)

**Date authored:** 2026-04-26
**Authority:** PM-RATIFY (this date) — 4 decisions on §0.1 / §10.4 / §0.5 / §10.5
**Predecessor (audit-immutable):** [`cc1-brief.md`](cc1-brief.md) — unmodified
**Manifest anchor:** `pilot-2026-04-26-v1` — UNCHANGED (no v2 mid-flight)
**Pilot ID:** `agentic-knowledge-work-pilot-2026-04-26` — UNCHANGED
**Wall-clock budget:** **7-10 hours** (was 4-6h; +3-4h absorbs orchestrator scaffolding)
**Cost ceiling:** **$7.00 hard cap, $6.00 halt** (was $5/$4 — see §6 below for rationale)

---

## §1 — Cell B/D renamed definition

**Original (cc1-brief.md §3):** "candidate model + hive-mind retrieval + GEPA self-evolve harness"

**Amended (binding):** **"candidate model + hive-mind session corpus + multi-step agent loop with retrieval-augmented self-prompting"**

True GEPA self-evolve (iterative prompt optimization on a labeled training corpus) is **deferred to the full N=400 multiplier benchmark**. For this pilot, "self-evolve" = the agent loop's ability to propose its own intermediate questions and integrate retrieved context across steps before producing a final response.

| Cell | Model | Memory layer | Operating mode |
|---|---|---|---|
| A | claude-opus-4-7 | OFF | Single-shot; full materials in user prompt; one API call |
| B | claude-opus-4-7 | ON (per-task in-tree session) | **Multi-step agent loop** (see §2) over a per-task `SessionStore` corpus |
| C | qwen3.6-35b-a3b-via-openrouter | OFF | Single-shot; full materials in user prompt; one API call |
| D | qwen3.6-35b-a3b-via-openrouter | ON (per-task in-tree session) | **Multi-step agent loop** (see §2) over a per-task `SessionStore` corpus |

Same final question across all 4 cells per task (verbatim from task file). Same temperature settings (candidates 0.3, judges 0). PM-only quality-notes block stripped from materials before passing to candidates and judges.

---

## §2 — Per-task agent loop specification (Cells B/D)

The orchestrator implements a fixed-budget retrieval-augmented loop:

```
For each (task, cell ∈ {B, D}):
    1. Create a fresh per-task SessionStore (isolation: prevents task-1 corpus contaminating task-2)
    2. Ingest task materials as MemoryFrames into that session
       (one frame per natural document boundary; chunk only if a single doc > 16KB)
    3. Initialize agent loop with: persona + scenario + question (NOT the materials)
    4. Loop up to MAX_STEPS = 5:
        a. Candidate proposes either:
           - intermediate retrieval question (signaled by structured output) OR
           - final response (signaled by structured output)
        b. If retrieval question:
           - Call HybridSearch on the task's SessionStore (top-K = 8)
           - Inject retrieved frames into next-turn context
           - Continue loop
        c. If final response:
           - Capture as candidate_response
           - Exit loop
    5. If loop exhausts MAX_STEPS without final response:
           - Force-finalize on step 5 with all accumulated context
           - Tag record with `loop_exhausted: true` for diagnostic
    6. Per-cell halt: if cumulative cell spend > $0.50, halt cell, ping PM
```

**Hard limits per cell** (Cells B/D only; Cells A/C are single-shot):
- `MAX_STEPS = 5` (model proposes ≤5 intermediate-or-final outputs)
- `MAX_RETRIEVALS_PER_STEP = 8` (HybridSearch top-K bound)
- `PER_CELL_HARD_HALT = $0.50` (per cc1-brief §7; reaffirmed)
- `loop_exhausted` flag in JSONL record if step 5 ran without natural finalization

---

## §3 — Wrapper script location and structure

**File:** `D:/Projects/waggle-os/scripts/run-pilot-2026-04-26.ts`

**Reuse pattern:** Follows the same wrapper-around-runner shape as `scripts/run-mini-locomo.ts` for consistency, but is a SEPARATE script (no shared mutable state; the LoCoMo wrapper is unchanged and remains §11-frozen for any future LoCoMo work).

**Top-level structure:**
1. `parseArgs(argv)` — flags: `--task <id>`, `--cell <A|B|C|D>`, `--all-cells`, `--smoke`, `--dry-run`, `--manifest-anchor`
2. `loadTaskMaterials(taskFile)` — reads task-N.md from pilot folder, strips `## End of materials` block
3. `runCellSolo(cell, taskMaterials, model)` — single-shot path for A/C
4. `runCellMultiStep(cell, taskMaterials, model)` — agent loop path for B/D per §2
5. `judgeWithTrio(cellResponse, taskContext, judgeRubric)` — emits 3 judge calls + computes trio_mean / strict_pass / critical_fail
6. `writeJsonlRecord(...)` — emits the §6/judge-rubric.md schema record
7. Cost accumulator + halt-rule enforcement

**Atomic JSONL writes** (per-cell): each cell completes → record flushed to `pilot-{task}-{cell}.jsonl` before moving to next cell. Comp-restart-resilient at the cell granularity (per-task agent loop is NOT restart-resilient mid-loop; if a comp restart happens mid-Cell-B/D, that cell is re-run from scratch).

**Reusability for full N=400 multiplier benchmark:** the orchestrator is parameterized on `(model, cell, task)` and accepts a task-list config — running 400 instances becomes a config change, not a rewrite. PM treats this scaffolding as investment not sunk cost (per ratification).

---

## §4 — Hive-mind in-tree import path (precise)

The pilot uses the **in-tree** memory substrate from `D:/Projects/waggle-os/packages/core/`. No `@hive-mind/*` npm install required for this pilot. The extracted `D:/Projects/hive-mind/` (HEAD `c363257`, tag `v0.1.0`) shares lineage with these files but is NOT consumed at pilot runtime.

**Imports the wrapper script will use:**

```typescript
// from packages/core/src/index.ts (verified exports as of HEAD b7e19c5):
import {
  MindDB,         // packages/core/src/mind/db.ts        — SQLite + sqlite-vec backing store
  FrameStore,     // packages/core/src/mind/frames.ts:35 — class FrameStore (ingest)
  SessionStore,   // packages/core/src/mind/sessions.ts:13 — class SessionStore (per-task scoping)
  HybridSearch,   // packages/core/src/mind/search.ts:36 — class HybridSearch (FTS5 + vec0 RRF retrieval)
  type MemoryFrame,    // frames.ts:8
  type FrameType,      // frames.ts:4 — 'I' | 'P' | 'B'
  type Session,        // sessions.ts:3
  type SearchResult,   // search.ts:23
  createLiteLLMEmbedder, // packages/core/src/mind/litellm-embedder.ts — for the embedding side
} from '@waggle/core';

// from packages/agent/src/index.ts:
import {
  runAgentLoop,   // packages/agent/src/agent-loop.ts:83 — generic agent loop entry
  // ...other agent imports as needed by the orchestrator (tool-filter, etc.)
} from '@waggle/agent';
```

**Per-task isolation pattern:** create a fresh `SessionStore` rooted on a tmp `MindDB` per task → ingest materials → instantiate `HybridSearch` against that store → use as the retrieval backend for the agent loop. After task completes, drop the session (next task gets a fresh DB; no cross-contamination).

**Scratch-DB location:** `tmp/pilot-2026-04-26/per-task-{task-id}.sqlite` (deleted after each task once results are persisted; gitignored under existing `tmp/` rule).

**Documentation requirement (per PM ratification):** the final pilot report MUST state: *"Pilot used the in-tree memory substrate at `packages/core/src/mind/` (HEAD `b7e19c5`). Production = extracted `@hive-mind/core@0.1.0` (same lineage)."*

---

## §5 — Manifest anchor scope notes

`pilot-2026-04-26-v1` declares the following items **frozen and pilot-irrelevant**:

```
INERT_UNTRACKED_AT_KICK:
  - preflight-results/b2-grok-smoke-2026-04-21T23-01-41-021Z.json
  - scripts/smoke-binary.py
  - tmp/

These items pre-exist across S2/Phase C/today's commits, are not pilot-related,
and are NOT staged. The pilot orchestrator must NOT write to any of these paths.
If the orchestrator writes to any of these paths, halt + ping PM (would invalidate
the reproducibility claim).

PILOT-WRITES-ALLOWED (sandboxed):
  - benchmarks/results/pilot-2026-04-26/             ← pilot output dir
  - benchmarks/results/pilot-2026-04-26/prompts-archive/ ← per-cell prompts
  - tmp/pilot-2026-04-26/                            ← scratch SessionStore SQLite per task
  - tmp/pilot-2026-04-26/run.log                     ← run log mirror

PILOT-WRITES-FORBIDDEN:
  - any path outside the two roots above
  - any file in §11-frozen path list (LoCoMo wrapper, runner.ts, etc.)
```

**HEAD at kick** will be re-verified in the orchestrator preamble; recorded in every JSONL record's `head_sha` field per `judge-rubric.md` schema.

---

## §6 — Cost ceiling update

**Original (cc1-brief.md §7):** $5.00 hard cap / $4.00 halt.

**Amended (binding):** **$7.00 hard cap / $6.00 halt.**

**Rationale (PM-ratified):**

| Bucket | Estimate | Notes |
|--------|----------|-------|
| Cell A/C (Opus + Qwen solo, 6 cells) | $0.90 | Single-shot, ~$0.10-0.20 per cell |
| Cell B/D (multi-step agent loop, 6 cells) | $2.40 | ~$0.30-0.50 per cell × 6 (within per-cell $0.50 hard halt) |
| Trio judge (36 calls × ~$0.07) | $2.52 | Same trio + per-call cost as Stage 3 v6 final |
| Buffer | $1.18 | For unexpected token bloat or retry cost |
| **Total cap** | **$7.00** | |
| **Halt threshold** | **$6.00** | Complete current cell + judges, then halt + emit partial summary |

**Per-call sanity check unchanged:** any single API call exceeding $0.50 → halt + ping PM (likely runaway agent loop).

**Per-cell hard halt unchanged:** $0.50 (Cells B/D specifically).

---

## §7 — Execution sequence (amended)

1. **Pre-flight** (§0 substrate gate per cc1-brief.md): re-verify just before kick (HEAD, LiteLLM, hive-mind in-tree, GEPA tests = 121/121 confirmed).
2. **Build orchestrator wrapper** at `scripts/run-pilot-2026-04-26.ts` (3-4h scaffolding).
3. **Smoke test on Task 1 only** — all 4 cells (A, B, C, D). Emit Task-1 JSONL records + a smoke-summary stub. **HALT + PM verification before continuing.**
4. **PM verifies smoke** — confirms (a) all 4 cells executed cleanly, (b) judge ensemble responses are well-formed, (c) cost trajectory is on track, (d) no unexpected halts.
5. **Run remaining 8 cells** (Tasks 2 + 3 × cells A-D) under PM go-ahead.
6. **Emit `pilot-summary.json`** per `judge-rubric.md` schema + final run log entry.
7. **Halt ping to PM** with: pilot verdict (PASS/FAIL per §2 of cc1-brief.md), total cost, wall-clock, link to summary file.

**No Gate D auto-advance.** PM drafts go/no-go for full N=400 multiplier benchmark; Marko ratifies.

---

## §8 — What is NOT changed by this amendment

The following sections of `cc1-brief.md` remain in force verbatim:

- §1 (Goal & rationale)
- §2 (Hypotheses — pre-registered, not modifiable post-results)
- §4 (Tasks — same task-1/2/3 files; same materials; same final questions)
- §5 (Judge ensemble — locked: Opus + GPT + MiniMax)
- §6 (Output schema — per `judge-rubric.md`)
- §7 (Halt-and-ping triggers — except cost cap raised to $7/$6 per §6 above)
- §8 (Reproducibility — recording HEAD SHA, manifest anchor, model versions, prompts archive)
- §11 (Post-execution PM actions)
- §12 (Pilot is direction validator only; full benchmark is publication-grade)

The `judge-rubric.md` document is **NOT modified** by this amendment.

---

## §9 — Audit trail

This amendment is the binding execution document. The unmodified `cc1-brief.md` is preserved as the audit-immutable predecessor. Every JSONL record produced by the pilot includes `manifest_anchor: "pilot-2026-04-26-v1"`; the orchestrator writes a top-of-log line:

```
[pilot] amendment_doc_sha256 = <sha of this file>
[pilot] cc1_brief_sha256 = <sha of cc1-brief.md>
[pilot] head_sha = <git HEAD at kick>
```

Both file SHAs are committed in the pilot result commit body for tamper-evident audit.

---

**End of amendment. PM verification requested before orchestrator scaffolding begins.**
