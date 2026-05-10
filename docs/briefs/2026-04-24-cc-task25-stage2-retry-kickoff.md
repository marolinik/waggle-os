# CC-1 Brief — Task 2.5 Stage 2-Retry Kickoff

**Date:** 2026-04-24
**Sprint:** 12 · Task 2.5 · Stage 2-Retry
**Branch:** `feature/c3-v3-wrapper` (continuation; HEAD = `990012e`)
**Rebase base:** unchanged (Stage 1 + Stage 1.5 commits retained)
**Primary artefact on completion:** `D:\Projects\PM-Waggle-OS\sessions\2026-04-24-task25-stage2-retry-complete.md`
**Authority:** PM (Marko Marković) — combo-plan ratified 2026-04-24 on
Stage 2 N=20 VALIDATION FAIL exit report (2026-04-23).

---

## 0. Root cause recap (mandatory read before scope)

Stage 2 N=20 validation run on 2026-04-23 FAILED 3/4 criteria with judge-
accuracy raw=0.55, full-context=0.50, retrieval=0.20, agentic=0.30. The
inversion is NOT a retrieval quality problem and NOT a pipeline bug. Root
cause per CC-1 §6.1 and PM-ratified: Sprint 9 cell taxonomy `raw` means
"no memory injection" on a workload where no injection means no context —
LoCoMo's `instance.context` is oracle-selected evidence, so on LoCoMo the
Sprint-9 `raw` prompt `"Context: ${instance.context}\n\nQuestion: ${instance.question}"`
is effectively oracle-context-fed, not zero-context. Full-context inherits
the same oracle plus a SYSTEM_EVOLVED strict-abstain penalty (3 unknowns).
Retrieval top-K=10 over 5880 frames delivers ~58% recall of the 1-3
relevant turns vs oracle 100% — structurally disadvantaged at whole-corpus
scope.

Stage 2-retry redesigns cell semantics so the baseline is a true no-memory
comparator and retrieval operates at conversation scope that matches QA
pair locality.

**Exit report full text:** `D:\Projects\PM-Waggle-OS\sessions\2026-04-23-task25-stage2-n20-complete.md`

---

## 1. Scope — five deliverables

### 1.1 Cell-semantics redesign (cells.ts + V3_TO_V1_CELLS)

Introduce a fifth cell identifier **`no-context`** whose prompt is the
question only, with zero `instance.context`, zero memory injection, zero
system-side retrieval. This is the true no-memory baseline.

Rename the existing `raw` cell to **`oracle-context`** in `cells.ts`
exports and in V3_TO_V1_CELLS. Keep its implementation (oracle-fed prompt)
unchanged — it now serves as an upper-bound diagnostic, not a pass/fail
comparator. Do not delete it; the Sprint 9 test suite depends on it.

`full-context` remains as-is (oracle-fed + SYSTEM_EVOLVED abstain). Same
diagnostic role as `oracle-context`, retained to measure the abstain-
penalty delta.

`retrieval` and `agentic` remain with current implementations but consume
a conversation-scoped substrate per §1.2.

### 1.2 Conversation-scoped corpus pre-filter

LoCoMo QA pairs are authored within a single conversation boundary. Whole-
corpus substrate (5880 frames across all conversations) gives retrieval
and agentic a signal-to-noise problem that does not reflect how a
memory-backed agent is used in production.

Modify `benchmarks/harness/src/ingest.ts` (or add a sibling module) so
that for each QA instance the retrieval and agentic cells operate against
a substrate scoped to that instance's `conversation_id` only. Two
acceptable implementations — you pick:

- **Per-instance ephemeral substrate**: build a fresh MindDB `:memory:`
  substrate per QA instance, containing only that conversation's turns
  (≈50-400 frames typical). Reuse the existing ingestLoCoMoCorpus plumbing
  with a `conversationFilter` option.
- **Single substrate + per-call filter**: keep the 5880-frame substrate
  but pass `{ conversationId }` as a HybridSearch filter + agent-loop
  search_memory tool param, so retrieval.search and search_memory both
  scope results to the instance's conversation.

Go with whichever approach tests cleanly with the existing HybridSearch
API surface. Document the choice in the completion report.

Top-K moves from 10 to **20** for retrieval and agentic.

### 1.3 SYSTEM_AGENTIC softening

Replace the current SYSTEM_AGENTIC prompt (ratified in commit `c80a4a3`)
with the version below. Changes are concentrated in §1 (MUST→SHOULD),
§4 (cap semantics relaxed), §6 (unknown threshold softened), and a new §7
addressing tool-exhaustion fallback.

```
You are a memory-grounded answering agent. Your job: answer a short
factoid question using content returned by the search_memory tool and
your reasoning over it.

Protocol (you SHOULD follow):
1. First turn: call search_memory with a focused query derived from the
   question, UNLESS the question is a simple factual lookup you can
   answer with high confidence from general knowledge and the answer
   does not require conversation-specific context. When uncertain,
   prefer the search_memory call.
2. After the tool returns, read the retrieved memories carefully.
3. If the retrieved memories contain the answer, respond with the
   shortest possible answer span — no sentences, no hedging, no preamble.
4. If the retrieved memories are ambiguous or incomplete, you MAY call
   search_memory ONE more time with a refined query (different wording,
   different entity, different time window). Then answer.
5. You have a hard cap of 3 total turns. Use your turns wisely.
6. If after reasonable search you believe the memory does not contain a
   supported answer, reply with exactly: unknown
7. If turn 3 arrives without a clear answer, commit to your best
   supported answer span using the context you have gathered across
   search calls. Do NOT leave the response empty.

Output format: plain answer span only. No JSON, no markdown, no
explanation. Never invent facts. Ground every factual claim in retrieved
context or clearly-established general knowledge.
```

Update `benchmarks/harness/src/cells.ts` SYSTEM_AGENTIC constant verbatim,
and keep the existing substrate test assertion that agentic uses the
exact prompt string (update the expected value).

### 1.4 Agent-loop tool-exhaustion fallback

Stage 2 showed 2/20 agentic instances reached turn 3 with empty
`resp.content` because the agent kept calling search_memory without
committing to an answer turn. SYSTEM_AGENTIC §7 above addresses this
prompt-side; back that with a runtime-side guarantee in
`@waggle/agent::runAgentLoop` (or the cell wrapper, whichever is cleaner):
if `maxTurns` is reached and the final turn has no text content, synthesize
one forced-answer turn with the accumulated search-result context and a
short system reminder ("You must commit to your best supported answer span
or reply `unknown`. Do not call tools."). That turn counts as a 4th turn
for internal bookkeeping but must not increment the PM-facing `turns_used`
metric beyond 3 (because the model effectively produced the answer under
cap — the fallback only rescues empty responses). Document in report §5.

Add `tests/agent-loop-exhaustion.test.ts` with at least 4 cases:
(a) normal 1-call-1-answer, (b) 2-call-1-answer, (c) 3-call-1-answer,
(d) forced-fallback after 3 empty-content calls. Target ≥4 new tests;
deliver more if coverage gaps emerge.

### 1.5 Runner wiring + --v3-cells alias

Close the `--all-cells` gap flagged in Stage 2 deviation 2. Add a
`--v3-cells` flag to `scripts/run-mini-locomo.ts` that expands to
`[no-context, oracle-context, full-context, retrieval, agentic]`. Keep
`--all-cells` as-is (Sprint 9 quartet) for backwards compatibility.

Update the runner dispatch so `no-context` cell is reachable. Keep JSONL
schema stable — only the `cell` field value space expands.

---

## 2. Non-scope — do not touch

- No changes to Stage 1.5 defensive-coding items (§7.1-§7.4). Those
  tests must stay green.
- No changes to judge-client.ts routing, judge ensemble composition, or
  the two-route subject roster (DashScope direct primary + OpenRouter
  fallback_1). Subject routing is load-bearing for Stage 2-retry to stay
  comparable to Stage 2.
- No changes to MindDB embedder choice (ollama + nomic-embed-text),
  batch chunking, or HybridSearch RRF semantics.
- No N=400 run. Stage 2-retry is a N=20 validation re-gate. N=400 is
  post-retry, gated on PM re-issue of a Stage 3 brief.
- Feature branch stays NOT merged to main.

---

## 3. Pre-flight — §0 grep evidence (mandatory before any scope declaration)

Per PM feedback memory (Substrate Readiness Gate, 2026-04-22): before you
commit a single LOC of Stage 2-retry scope, verify and record in the
completion report §0 a grep-backed evidence table for each item below.
If ANY item fails, halt and raise with PM before proceeding.

| Item to verify | Evidence expected |
|---|---|
| V3_TO_V1_CELLS export surface supports a 5th value | file:line of the export, current string set |
| HybridSearch.search supports a conversation-scope filter OR `createSubstrate` supports per-instance ingest | file:line of the API signature accepting `conversationId` or equivalent |
| agent-loop search_memory tool definition can accept a pass-through filter param | file:line of the tool schema |
| LoCoMo canonical instances carry a `conversation_id` (or a field that disambiguates which conversation a QA pair belongs to) | file:line of the schema + a row excerpt |
| Existing Sprint 9 test suite uses the string `raw` as a cell id in assertions | count of assertions that would break if we rename without an alias |

If the last item surfaces non-trivial breakage, add an `raw` → `oracle-
context` alias in V3_TO_V1_CELLS instead of renaming, and call it out in
the report.

---

## 4. Success criteria (revised 4-criterion set for N=20 re-gate)

1. **Pipeline**: 100/100 rows emitted (5 cells × N=20), 0 halts, 0 fetch-
   retry overflow.
2. **Memory lift signal**: `retrieval` judge-accuracy ≥ `no-context`
   judge-accuracy + 5pp at p<0.1 (Fisher exact, two-sided). This is
   the thesis-claim criterion.
3. **Agentic parity**: `agentic` judge-accuracy ≥ `retrieval` judge-
   accuracy (no 5pp floor — just monotonicity).
4. **Agentic behaviour**: (a) search_memory call rate ≥ 80% across the
   N=20 agentic cell, (b) median turns_used ≤ 2, (c) unknown rate ≤ 25%.

Diagnostic reporting (non-blocking):
- `oracle-context` and `full-context` accuracies as ceiling references.
- Abstain-penalty delta: oracle-context − full-context.
- Per-instance turns_used histogram for agentic.
- Search-recall histogram for retrieval (positions of relevant turn in
  top-20 when oracle knows the answer turn index).

---

## 5. Budget and halt rules

Budget cap: **$2.50** for the full N=20 re-gate execution (80 cell
invocations across 5 cells × N=20, plus judge calls). Stage 2 used
$1.32; +$0.50 buffer for the no-context cell and top-K=20 overhead;
+$0.68 cushion.

Scope LOC halt thresholds (code-only, JSDoc excluded):
- Cell-semantics redesign (§1.1): ≤60 LOC code-only
- Conversation-scope corpus (§1.2): ≤120 LOC code-only
- SYSTEM_AGENTIC update (§1.3): prompt bytes + any wiring, ≤40 LOC
- Agent-loop fallback (§1.4): ≤60 LOC code-only + tests
- Runner wiring (§1.5): ≤30 LOC code-only

If ANY item exceeds `estimate + 50` LOC code-only, halt and raise. If
halted, surface root cause in the exit ping and await PM adjudication.

Test count target: **≥25 new/updated tests** across §1 deliverables.
Suite must remain green (target 320/320 or higher) on vitest and clean on
`tsc --noEmit` for harness + @waggle/core + @waggle/agent.

---

## 6. PM gates (hard — do NOT self-advance)

- **Gate A — pre-flight §0 evidence report**: post to completion-report §0,
  halt, and await PM ratification before beginning §1 implementation.
  This is non-negotiable. The root cause of the Stage 2 FAIL was exactly
  a missing §0 check.
- **Gate B — post-implementation, pre-execution**: after §1.1-§1.5 are
  shipped and tests green, halt before kicking the N=20 re-gate run.
  Report will show: commit list, test delta, LOC accounting, pre-flight
  substrate dry-run demonstrating conversation-scope retrieval returns
  non-zero results on instance 0.
- **Gate C — post-N=20 exit**: exit ping per §7 below; do NOT proceed to
  manifest v4 or N=400 on strength of success criteria alone. PM ratifies
  or blocks.

---

## 7. Exit format (at Gate C)

Completion report at `D:\Projects\PM-Waggle-OS\sessions\2026-04-24-task25-
stage2-retry-complete.md`, sections parallel to the Stage 2 exit report:

- §0 Pre-flight evidence (grep table from §3 of this brief, with any
  ratification delta)
- §1 Verification (vitest, tsc, new-test delta)
- §2 Commits on feature/c3-v3-wrapper
- §3 Per-item delivery vs LOC estimate
- §4 Non-scope reassurances
- §5 Runtime execution report (N=20, per-cell judge-accuracy, budget
  used, turns_used histogram, search-recall diagnostic, deviations)
- §6 Root cause analysis IF any criterion FAILs
- §7 Option enumeration IF any criterion FAILs (2-4 retry directions)
- §8 Readiness assertion for N=400 OR halt rationale

Gate ping (bottom of report):

```
[GATE-S2-RETRY-COMPLETE] status: {pass|fail} — {headline}
artefact: sessions/2026-04-24-task25-stage2-retry-complete.md
commits: {SHA list} on feature/c3-v3-wrapper
head: {SHA}
suite: {n}/{n} vitest · tsc --noEmit clean on harness + core + agent
judge_acc: no-context={x}, oracle-context={x}, full-context={x}, retrieval={x}, agentic={x}
memory_lift: retrieval − no-context = {x}pp (target ≥5pp, p={p})
budget: ${x} / $2.50
next: PM decides {N=400 go | retry with further changes | escalate scope}
```

---

## 8. Paste-ready prompt for fresh CC-1 session

Copy everything between the fences into the new CC-1 session:

```
Task 2.5 Stage 2-Retry kickoff. Branch feature/c3-v3-wrapper at HEAD
990012e. Full brief is at
D:\Projects\PM-Waggle-OS\briefs\2026-04-24-cc-task25-stage2-retry-kickoff.md —
read it first and all the way through before writing a single LOC.

Context recap: Stage 2 N=20 on 2026-04-23 FAILED 3/4 criteria. Root cause
is that the Sprint 9 "raw" cell, when plugged into LoCoMo, is not a
zero-context baseline because LoCoMo's instance.context is oracle-
selected evidence. PM adjudicated a combo fix: add a true no-context
cell, rename raw → oracle-context (diagnostic only), pre-filter corpus
to conversation scope for retrieval + agentic, bump top-K to 20, soften
SYSTEM_AGENTIC (MUST→SHOULD, floor 95→80, new §7 tool-exhaustion
fallback), add agent-loop runtime forced-answer fallback, add
--v3-cells runner alias.

Stage 2-retry brief spec (summary):
- §0 pre-flight grep evidence table — mandatory halt at Gate A for PM
  ratification BEFORE any §1 LOC
- §1 five deliverables: cell-semantics redesign, conv-scope corpus
  pre-filter, SYSTEM_AGENTIC softening (new prompt verbatim in brief §1.3),
  agent-loop fallback, runner --v3-cells wiring
- §2 non-scope — Stage 1.5 defensive coding, judge-client, routing,
  embedder all untouchable
- §4 success criteria: retrieval ≥ no-context + 5pp p<0.1, agentic ≥
  retrieval, tool-use ≥ 80%, median turns ≤ 2, unknown ≤ 25%
- §5 budget $2.50, scope halt at estimate+50 LOC code-only, ≥25 new/
  updated tests
- §6 three PM gates (A pre-flight, B pre-execution, C post-N=20); do
  NOT self-advance across any of them
- §7 exit format + gate ping

Primary exit artefact on completion:
D:\Projects\PM-Waggle-OS\sessions\2026-04-24-task25-stage2-retry-complete.md

Start with Gate A: run the §0 grep evidence check from the brief,
populate the completion-report §0 table, and halt. Do not begin §1
implementation until PM ratifies §0.
```

---

## 9. PM closing notes

Two ratifications already recorded (carried from Stage 2 exit report,
this brief inherits them — CC-1 does not need to re-raise):

1. Commit `990012e` (health-check.ts temperature-guard + secondary-ping
   max_tokens 5→1024) accepted as immaterial and necessary. Stands on
   feature/c3-v3-wrapper.
2. `--all-cells` Sprint 9 quartet behaviour accepted as-is; `--v3-cells`
   alias added in §1.5 as the forward path.

The thesis signal we want at the end of Stage 2-retry is:
`retrieval − no-context ≥ 5pp at p<0.1` on N=20. If that lands we ratify
manifest v4 and escalate to N=400 on the same cells. If it doesn't land,
we get a far cleaner diagnostic at N=20 ($2.50 cost) than at N=400 ($28
cost) — the re-gate is cheap insurance against a repeated FAIL on broken
semantics.
