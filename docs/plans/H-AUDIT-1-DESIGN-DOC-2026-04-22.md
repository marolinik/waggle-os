# H-AUDIT-1 Design Doc — turnId Propagation + Stage 2 reasoning_content

**Datum:** 2026-04-22
**Sprint:** 11 · Track A · Task A1
**Authority chain:** `briefs/2026-04-22-cc-sprint-11-kickoff.md` §3 Track A A1 + `decisions/2026-04-22-stage-2-primary-config-locked.md` §5 (reasoning_content handling extension)
**Author:** CC-1
**Status:** DRAFT — awaiting PM ratification before A2 implementation
**Supersedes memory claim:** `project_h_audit_1_not_implemented.md` — stale. Production chat stack turnId propagation was landed in a prior sprint; see §1 state audit below.

---

## 0. Executive summary

Production-chat turnId propagation, the `grep ≥6` acceptance target, the full-turn-graph reconstruction test, and the regression guard for the six target files are **already landed and green** on `origin/main` as of e1ae0a4. The live surface is 7 files in `packages/agent/src` + 2 files in `packages/server/src` = 9 files with `turnId` references. The existing Vitest suite `packages/agent/tests/turn-context.test.ts` asserts all four brief acceptance items in isolated test cases.

**A2 net-new scope is therefore narrowed to one concern:** `reasoning_content` handling for Stage 2 `thinking=on, max_tokens=64000` on `qwen3.6-35b-a3b-via-openrouter`, per decision doc §5. The Stage 2 batch path runs through `benchmarks/harness/src/llm.ts` (not the production chat stack), so reasoning_content capture + turnId correlation lands in the harness + its JSONL records, with an explicit rule on production-chat behavior documented below.

---

## 1. Current state audit (as of 2026-04-22, HEAD = e1ae0a4)

### 1.1 turnId generator

**File:** `packages/agent/src/turn-context.ts:29`
**Contract:** `export function generateTurnId(): string { return randomUUID(); }` — `node:crypto.randomUUID()` which is **UUID v4 by spec** (verified by `turn-context.test.ts:30-36` regex `^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`).

This satisfies brief §3 Task A1 "generation point: orchestrator turn entry, `crypto.randomUUID()` v4, ne v7, ne custom."

### 1.2 Propagation surface (verified grep + read)

| File | turnId role | Lines of interest |
|---|---|---|
| `packages/agent/src/turn-context.ts` | generator + `logTurnEvent(turnId, payload)` helper | 29, 45-51 |
| `packages/server/src/local/routes/chat.ts` | generation site (POST /api/chat entry) | 318-325 |
| `packages/agent/src/agent-loop.ts` | optional `turnId?: string` in config; logs `agent-loop.enter` / `.exit` / `.tool.enter` / `.tool.exit` | 75-80, 100, 103, 384, 477-484 |
| `packages/agent/src/orchestrator.ts` | optional `turnId?: string` in `recallMemory` opts; logs `.enter`/`.exit` + injection-block branch | 94-95, 589, 681, 702, 712 |
| `packages/agent/src/prompt-assembler.ts` | optional `turnId?: string`; logs `prompt-assembler.assemble` | 86-87, 414 |
| `packages/agent/src/combined-retrieval.ts` | optional `turnId?: string` in `CombinedSearchOptions`; logs `retrieval.enter`/`.exit` (+ KVARK branch) | 60-61, 215, 230-254 |
| `packages/agent/src/cognify.ts` | optional `turnId?: string` in `cognify`/`cognifyFrame`/`cognifyBatch`; logs enter/exit for each | 48-55, 106-139 |
| `packages/agent/src/index.ts` | barrel export of `generateTurnId` | 3 |
| `packages/server/src/benchmarks/aggregate.ts` | turnId carried in benchmark aggregate records | (via grep) |

The six target files from brief §3 are all covered; the list is **9 files total** when counting the generator, barrel, benchmark aggregate, and server route.

### 1.3 Persistence format in chat.ts

Current behavior (chat.ts:324): turnId is generated and **logged** via `logTurnEvent(turnId, { stage: 'chat.turn.start', ... })`. Logs use the shared pino logger with `turnId` as a structured field. There is **no dedicated per-turn trace-store row for chat turnId persistence** — reconstruction is log-scrape (pino) + the test-only `startTurnCapture()` buffer from `turn-context.ts:61-76`.

The broader `packages/core/src/mind/execution-traces.ts` store exists (for the evolution subsystem) but is **not** currently keyed on turnId — it uses `traceId` + `runId` for evaluation datasets. This is intentional: trace-store was scoped to evolution evals, while turnId is the lightweight correlation key for one POST /api/chat cycle.

### 1.4 Tests already in place

**`packages/agent/tests/turn-context.test.ts`** — three describe blocks:

1. `turn-context helpers` (5 tests): UUID v4 shape, silent no-op when undefined, capture buffer semantics, concurrent-turn isolation, stopTurnCapture reverts mode.
2. `H-AUDIT-1 stage threading (end-to-end trace assertion)` (1 test, line 80): simulates chat.ts → agent-loop → orchestrator.recallMemory → retrieval → prompt-assembler → tool-call → cognify → agent-loop.exit with a **single turnId**, asserts `new Set(buf.map(e => e.turnId)).size === 1`. **This is the "reconstruct full turn graph from a single turnId" acceptance test the brief asks for.**
3. `H-AUDIT-1 source-tree regression guard` (1 test, line 121): reads each of the six required files from disk and asserts every one contains `turnId`. Fails if any future edit accidentally drops trace plumbing.

### 1.5 Acceptance gate already satisfied

| Brief acceptance item | Current state | Evidence |
|---|---|---|
| `grep -n "turnId" packages/**/*.ts` ≥ 6 hits | ≥50 hits across 9 files | Sprint 11 Day-1 grep output, §1.2 table |
| Unique files with match ≥ 5 | 9 files | §1.2 table |
| Unit test reconstructs full turn graph from single turnId | exists | `turn-context.test.ts:80-117` |
| Zero regressions on existing suites | green pre-sprint (S4 handoff: 4974/4975) | will re-verify post-any-change in A2 |
| `tsc --noEmit` clean | green pre-sprint | same |

**The A2 "turnId implementation" acceptance is met on HEAD.** A2 becomes a narrow, reasoning_content-only task; see §2.

---

## 2. Net-new scope for Stage 2 on/64K — reasoning_content handling

Stage 2 batch runs on `qwen3.6-35b-a3b-via-openrouter` with `thinking=on, max_tokens=64000` (LOCKED 2026-04-22, decision doc §1). Qwen3.6 with thinking enabled emits a `reasoning_content` field on the response object, separate from the finalized answer. Per decision doc §5, design must cover three rules: persistence, retention, exclusion.

### 2.1 Execution surface that sees reasoning_content

Stage 2 **does not run the production chat stack** (orchestrator + cognify + tools + prompt-assembler). It runs through `benchmarks/harness/src/llm.ts` → LiteLLM → OpenRouter → Qwen. The four cells in `benchmarks/harness/src/cells.ts` are pure-LLM prompts (no memory tool, no evolution wiring in the harness scaffold as of HEAD).

Consequence: reasoning_content capture lands in **the harness layer**, not the production chat stack. Production chat (which today doesn't ship with thinking=on by default on any route) gets the exclusion rule only; capture/persistence is explicitly out of this design doc's scope until a future brief.

### 2.2 Persistence rule

**Harness layer (primary):**
- Extend `LlmCallResult` (in `benchmarks/harness/src/llm.ts:12-22`) with an optional `reasoningContent?: string` field. Populated only when the provider response includes it; left `undefined` otherwise to preserve back-compat for models that don't emit reasoning.
- Parse from two canonical response shapes:
  - DashScope-intl native: `body.choices?.[0]?.message?.reasoning_content` (snake_case, top-level in message).
  - OpenRouter unified reasoning API: `body.choices?.[0]?.message?.reasoning` (note: different key; OR's unified API normalizes cross-provider).
- Fallback: if neither is present but response body has a top-level `body.reasoning_content` (older DashScope shape), read that too. Log one `reasoning_content_shape_unknown` warning if we see a response with thinking=on requested but no reasoning surface, so a future probe can catch provider schema drift.
- Extend `JsonlRecord` (in `benchmarks/harness/src/types.ts`) with an optional `reasoning_content?: string` and `reasoning_content_chars?: number` field. The record is keyed by `turnId` (already there as the first field), so reconstruction from a single turnId reads the JSONL row and gets both answer and reasoning.

**Production chat path (out-of-scope for A2, documented for future):**
- If/when a production request is issued against a thinking-enabled route, `reasoning_content` MUST NOT be persisted to frames, memory, or KnowledgeGraph. It flows through the response and is discarded after the stream completes. If operator logging of reasoning is ever required, a separate design doc and opt-in flag will scope it. No silent write-through.

### 2.3 Retention policy

**Harness JSONL artifacts:**
- The JSONL file under `benchmarks/results/*.jsonl` is the canonical persistence surface. Retention follows the existing benchmark artifact convention: committed to the repo when landing a benchmark report; otherwise lives in `benchmarks/results/` gitignored until the sprint that produced it is closed and a curated subset (summary + representative rows) is moved to `preflight-results/`. Full reasoning_content is **not** moved into `preflight-results/` — only a summary char-count aggregate, to keep report size manageable.
- Raw JSONL with reasoning_content stays in `benchmarks/results/` locally for the life of the sprint and is deleted/pruned when the sprint close-out report lands on `origin/main`. No long-term reasoning_content archival.
- Rotation: daily housekeeping is not automated in this design. If Stage 2 full-run produces ≥2GB of JSONL (estimated ceiling: ~1GB for 2000-call full-run at reasonable reasoning-token sizes), a manual prune step goes in the Sprint 12 close-out runbook. Not a Sprint 11 gate.

**Logs (pino):**
- `logTurnEvent(turnId, { stage: 'llm.response', reasoningChars: N })` emits the **character count only**, not the content itself. This gives observability (did reasoning happen? how big?) without polluting logs with possibly-sensitive chain-of-thought.

### 2.4 Exclusion rule

Reasoning_content MUST NOT appear in:

1. **User-facing output streams** — the SSE chat.ts path streams `text` only, not reasoning. (Already true; guarding against regressions when anyone wires a thinking-enabled route to production chat.)
2. **Judge inputs** — `benchmarks/harness/src/judge-runner.ts` passes only `modelAnswer` (the final text) to the judge. The judge never sees reasoning_content. This preserves judge neutrality and prevents the judge from being biased by reasoning artifacts that aren't part of the model's final answer.
3. **Public trace viewers / UI** — any future chat-UI trace inspector must project JSONL records with reasoning_content stripped unless the caller has an explicit `includeReasoning: true` permission. v1 guidance: don't add a UI trace inspector at all; reasoning_content lives in CLI-accessible JSONL only for the benchmark team.
4. **Frames / memory / KnowledgeGraph persistence** — production chat never writes reasoning_content downstream of the LLM call.
5. **MCP response payloads** — MCP tools return structured results; reasoning_content is not a tool-call product.
6. **Summary exports and aggregate reports** — `benchmarks/harness/src/metrics.ts` aggregates cost/latency/accuracy; it computes a `reasoning_content_chars` aggregate (sum, p50, p95) but does not copy the content into summary JSON. The summary stays <100KB so it fits in briefs.

**Permission surface for opt-in inclusion:** the optional `includeReasoning: boolean` parameter lives on JSONL-reader utilities only (not on harness writers). Writers always write reasoning; readers default to stripping it. This puts the gate on the read path, which is where the visibility decision belongs.

### 2.5 Invariant

`turnId` is a foreign key — given a JSONL row with turnId `T`, a consumer can reconstruct:
- The cell/control + model + instance that generated the row (existing fields)
- The final model answer (`text` / `model_answer`)
- The judge verdict if judging was enabled (`judge_verdict` + `judge_rationale`)
- **The reasoning trace that produced the answer** (`reasoning_content`, net-new)

The four of these together form the "full turn graph" for a Stage 2 batch turn. This is stronger than the production-chat graph (which today reconstructs via log events) because benchmark rows are structured JSONL by design.

---

## 3. Test scenario (sample code — not committed yet)

Two net-new test cases land in `benchmarks/harness/tests/reasoning-capture.test.ts`:

```typescript
// Test 1: reasoning_content round-trip — harness llm.ts captures, JSONL row persists
it('captures reasoning_content when provider returns it and persists to JSONL under turnId', async () => {
  const fakeLlm = createFakeLlmClient({
    responseBody: {
      choices: [{
        message: {
          content: 'Paris',
          reasoning_content: 'The user asked for capital of France. France capital is Paris.',
        },
      }],
      usage: { prompt_tokens: 10, completion_tokens: 2 },
    },
  });
  const result = await fakeLlm.call({ model: stage2Model, systemPrompt: 'sys', userPrompt: 'q' });
  expect(result.text).toBe('Paris');
  expect(result.reasoningContent).toMatch(/capital of France/);
  expect(result.reasoningContent?.length).toBeGreaterThan(0);
});

// Test 2: full turn-graph reconstruction from single turnId (JSONL round-trip)
it('reconstructs full turn graph (answer + reasoning + cost + latency) from single turnId', async () => {
  // Run one harness turn with a fake LLM emitting reasoning_content.
  // Read back the JSONL. Assert: filter by turnId yields exactly one row
  // containing answer, reasoning_content, cost, latency, judge payload (if judged).
  const turnId = await runOneHarnessTurn({ model: stage2Model, fakeLlm });
  const rows = readJsonl(outputPath).filter(r => r.turnId === turnId);
  expect(rows).toHaveLength(1);
  expect(rows[0].model_answer).toBeDefined();
  expect(rows[0].reasoning_content).toBeDefined();
  expect(rows[0].reasoning_content_chars).toBe(rows[0].reasoning_content!.length);
});
```

Non-goals for these tests: real API calls (smoke test for that lives in B1 apply), full-run timing (Stage 2 C3 covers that), judge-reasoning interaction (§2.4 exclusion rule covers by construction).

---

## 4. Acceptance criteria (updated against current state)

| # | Criterion | Status |
|---|---|---|
| 1 | `grep -n "turnId" packages/**/*.ts` returns ≥6 hits | ✅ already met (≥50 hits, 9 files) |
| 2 | Unique files with match ≥5 | ✅ already met (9 files) |
| 3 | Unit test reconstructs full turn graph from single turnId (production stack) | ✅ already met (`turn-context.test.ts:80-117`) |
| 4 | Unit test reconstructs full turn graph including reasoning_content (harness layer) | ⬜ A2 net-new — `benchmarks/harness/tests/reasoning-capture.test.ts` §3 |
| 5 | `LlmCallResult` + `JsonlRecord` extended with `reasoningContent` / `reasoning_content` | ⬜ A2 net-new |
| 6 | Harness captures reasoning_content from Qwen (two response shapes supported) | ⬜ A2 net-new |
| 7 | Reasoning_content never written to frames/memory/KG/UI/summary reports | ⬜ A2 net-new (assert via inspection + regression guard test) |
| 8 | `pnpm test` passes with zero regressions | ⬜ A2 gate |
| 9 | `tsc --noEmit` clean on touched packages | ⬜ A2 gate |
| 10 | Commit message: `feat(audit): H-AUDIT-1 reasoning_content capture per design doc 2026-04-22` | ⬜ A2 gate |

---

## 5. Open questions for PM ratification

1. **Confirm narrowed A2 scope.** Does PM accept that A2 implementation ships reasoning_content handling only, given that production-chat turnId propagation is already landed? If yes, exit ping filename is `sessions/2026-04-22-sprint-11-h-audit-1-exit.md` with the §4 criteria 4–7 closed.
2. **Memory note correction.** Authorize marking `project_h_audit_1_not_implemented.md` as **superseded** by this design doc in the memory index. The note was accurate at write time; Sprint 10 landed the plumbing. The correction prevents future sessions from re-doing completed work.
3. **Cross-cutting note on `reasoning`/`reasoning_content` parser.** OpenRouter's unified reasoning API uses key `reasoning` while DashScope native uses `reasoning_content`. The harness must parse both shapes. If PM prefers exclusive OR (one or the other, not both), flag here so CC-1 picks.
4. **Persistence slot under turnId.** Proposed: same JSONL row, net-new field `reasoning_content`. Alternative considered: separate `*.reasoning.jsonl` sibling file to keep the main JSONL compact. Stuck with same-row for simplicity unless PM prefers separation.
5. **Retention beyond sprint.** Current proposal is to keep raw reasoning_content JSONL local only, delete at sprint close. PM may want a long-term audit archive (compressed `.jsonl.gz` under `benchmarks/archive/`) for reproducibility of Stage 2 full-run — decision doc §5 retention rule implies this. Flagged for ratification.

---

## 6. Implementation plan for A2 (after ratification)

Surgical, non-speculative:

1. Add `reasoningContent?: string` to `LlmCallResult` in `benchmarks/harness/src/llm.ts`. Parse from `message.reasoning_content` OR `message.reasoning` OR top-level `body.reasoning_content` (in that order). Log one `reasoning_content_shape_unknown` warning on miss when thinking was requested.
2. Add `reasoning_content?: string` + `reasoning_content_chars?: number` to `JsonlRecord` in `benchmarks/harness/src/types.ts`. Populate in `runner.ts` from `result.reasoningContent`.
3. Update `metrics.ts` aggregate to compute `reasoningContentChars: { sum, p50, p95 }` when any row has it.
4. Ensure `judge-runner.ts` does not pass reasoning_content to the judge (verify; no change expected per current code).
5. Land two new tests per §3 in `benchmarks/harness/tests/reasoning-capture.test.ts`.
6. `pnpm test` + `tsc --noEmit --project benchmarks/harness/tsconfig.json`.
7. Exit ping: `sessions/2026-04-22-sprint-11-h-audit-1-exit.md` with grep output + test log + commit SHA.

**Budget:** $0 for unit tests (fake LLM client). Only real API cost is Task B1 smoke test, already accounted in that task's $0.05 cap.
**Wall-clock estimate:** 2-3h for the net-new slice (the big slice was landed in a prior sprint).

---

## 7. Anti-patterns

- **Do not re-implement turnId generator.** Use `generateTurnId()` from `@waggle/agent`. The harness already imports it in `runner.ts:32`.
- **Do not thread turnId through cells.** Cells are pure prompt-assembly; turnId is passed as a parameter (already) but only the *runner* needs to emit it into JSONL. Cells don't log.
- **Do not persist reasoning_content to production memory.** The §2.4 exclusion rule is a hard contract. If a future task wants this, it needs a separate design doc and PM lock.
- **Do not add reasoning_content to judge input.** §2.4 rule (2). Breaking this invalidates the judge-methodology axis that cleared Sprint 11 gate (Fleiss' κ=0.8784 on answer-only input).
- **Do not broaden scope beyond §6.** A2 is reasoning_content only. Anything else (tool-call schema extensions, MCP bridge, production thinking-on wiring) is a separate ticket.

---

## 8. Related

- `briefs/2026-04-22-cc-sprint-11-kickoff.md` §3 Track A A1 + A2
- `decisions/2026-04-22-stage-2-primary-config-locked.md` §5 (reasoning_content handling extension)
- `decisions/2026-04-22-sprint-11-scope-locked.md` §4.1–4.2 (gate criteria)
- `packages/agent/src/turn-context.ts` — generator + logging helpers
- `packages/agent/tests/turn-context.test.ts` — existing regression guards (6-file grep, full turn-graph reconstruction)
- `packages/server/src/local/routes/chat.ts:318-325` — generation site
- `benchmarks/harness/src/llm.ts` — A2 primary edit target
- `benchmarks/harness/src/runner.ts:32` — turnId already imported + threaded
- `benchmarks/harness/src/types.ts` — `JsonlRecord` extension target

---

**End of A1 design doc. Awaiting PM ratification on §5 open questions before CC-1 moves to A2 implementation.**
