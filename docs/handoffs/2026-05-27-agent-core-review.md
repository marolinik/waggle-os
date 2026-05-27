# Agent Core Review — `packages/agent/src/`
**Date:** 2026-05-27 · **Scope:** Core agent runtime · **Compared against:** Claude Code (tool-result-injection + composable middleware) and Hermes (minimal-state ReAct, conversation-as-state)
**HEAD:** `819571d`

> **TL;DR.** The agent runtime is functionally rich and well-instrumented but carries two god-shapes that hide an otherwise clean loop: `runAgentLoop` (540 lines in a single function) and `Orchestrator.autoSaveFromExchange` (277 lines of regex pattern-matching). Extracting four focused modules — SSE parser, tool executor, loop gates, pattern write-back — drops the core to a Claude-Code-shaped ~250-line loop and a Hermes-shaped ~500-line facade, with zero behavior change. **Highest-leverage single PR: extract `autoSaveFromExchange` (PR-A, ~1 day, ~277 lines moved verbatim).**

---

## 0. Systemic findings — leverage-ordered

These 15 patterns account for ~90% of the simplification opportunity. Each one can be addressed with a focused PR; most are pure extractions with no behavior change.

| # | Pattern | Where | Effect |
|---|---|---|---|
| **A-1** | God function — `runAgentLoop` is 540L inside one function body | `agent-loop.ts:142-681` | Hides a clean ~200L conversation loop under 340L of mixed concerns (SSE, retry, gates, governance, hooks, sanitize, callbacks) |
| **A-2** | God method — `Orchestrator.autoSaveFromExchange` is 277L of regex intent inference | `orchestrator.ts:753-1029` | Single largest extraction target; behavior is coherent enough to lift verbatim |
| **A-3** | Inline SSE parsing (~90L of stream reader + buffer + chunk decode + tool-call assembly) | `agent-loop.ts:333-420` | Reusable, table-testable in isolation; should be `lib/sse-parser.ts` |
| **A-4** | Inline tool execution sub-loop (~130L mixing governance, pre-hook, memory-hook, guard, execute, sanitize, callbacks, post-hooks) | `agent-loop.ts:539-669` | Should be `lib/tool-executor.ts` with explicit middleware chain (Claude Code shape) |
| **A-5** | D1 + D3 gates inlined in the no-tool-calls branch | `agent-loop.ts:459-507` | Each gate has the shape `(state) => correction \| null`; should be `lib/loop-gates.ts` |
| **A-6** | Inline retry policy split across 3 sites — rate-limit (429), server error (5xx), parse error | `agent-loop.ts:296-323, 423-432, 543-550` | Duplicated logic; should be `lib/retry-policy.ts` returning typed RetryDecision |
| **A-7** | 12 catch-up regex patterns + 11 preference patterns + 7 decision patterns + 6 style signals defined inline mid-function | `orchestrator.ts:593-598, 835-846, 894-902, 861-867` | Should be a module-level constants block (or eventually replaced by an LLM-based extractor — see A-15) |
| **A-8** | Implicit state machine — 8 scattered `let` vars juggling loop invariants (turn, retries × 2, accumulated content, tools used, gates × 2, preserved answer) | `agent-loop.ts:242-263` | Typed `LoopState` object would make invariants explicit and aid debugging |
| **A-9** | `Orchestrator` class mixes 6 responsibilities — workspace lifecycle / memory stats / context loading / prompt building / recall / autoSave / tool facade / 7 getters | `orchestrator.ts:112-1048` | Should be a thin facade delegating to focused modules (Hermes shape) |
| **A-10** | Comment archaeology — `// Review #6`, `// M8`, `// F29c`, `// E4`, `// R2`, `// B2 fix`, `// CR-#` etc. scattered through both files | Throughout | Useful breadcrumbs but pollute reading. Replace with single-line `// Why:` notes per CLAUDE.md §3.7; drop outdated |
| **A-11** | `any` types in stream parsing + non-streaming response handling | `agent-loop.ts:362, 423` | Should narrow to `unknown` + Zod schema OR a strict `ChatCompletionChunk` interface |
| **A-12** | Magic numbers — `MAX_RETRIES = 3`, `60_000`, `30_000`, `MIN_CONTENT_LENGTH = 30` etc. are extracted in `orchestrator.ts` (M16) but scattered raw in `agent-loop.ts` | `agent-loop.ts:250, 302, 319` | Apply M16 pattern: lift to top-of-file constants block |
| **A-13** | Verbose JSDoc on private helpers + over-justified rationale comments (8-12 line explanations for 1-line code) | `orchestrator.ts:822-833 (Review #20), 885-893 (Review C2)` | Public API needs JSDoc; private helpers don't. Distill rationale to 1-2 lines |
| **A-14** | Inconsistent error pathways — some throws, some return error-as-string, some warn-and-continue, some silently swallow | `agent-loop.ts:299, 323, 547, 616, 736-744` | Standardize via typed `Result<T, AgentLoopError>` or consistent throw + caller catch |
| **A-15** | Regex-based intent inference (preferences / decisions / corrections / structured findings) | `orchestrator.ts:835-1027` | SOTA pattern (Claude Code, Hermes): LLM-based extraction via small "memory writer" call with structured-output schema. Real engineering, post-launch. See PR-H |

---

## 1. Per-file findings (top 3 files; remaining 108 are healthy or out-of-scope for polish)

### `agent-loop.ts` (681 LOC)

```
agent-loop.ts:142  runAgentLoop is 540 lines — should be ~250 after A-3..A-6 extractions
agent-loop.ts:178  console.warn for allowedSources policy gap — typescript rule violation; route through logger
agent-loop.ts:242-263  8 scattered let vars (A-8) — typed LoopState would make invariants explicit
agent-loop.ts:265  outer for-loop body is 416 lines (turn loop); should be 80-100 once SSE + tool-exec + gates extract
agent-loop.ts:287-294  fetch call inline — extract to llmCall(litellmUrl, body, fetchFn) for testability
agent-loop.ts:296-323  retry policy inline + duplicated across 429 and 5xx branches (A-6)
agent-loop.ts:333-420  ~90L of SSE parsing (A-3) — lib/sse-parser.ts as standalone module
agent-loop.ts:362     let chunk: any — narrow via shared ChatCompletionChunk type
agent-loop.ts:423     const data: any — same; introduce ChatCompletionResponse type
agent-loop.ts:459-507  D1 + D3 gates inline in no-tool-calls branch (A-5) — extract to loop-gates.ts
agent-loop.ts:539-669  ~130L tool-exec sub-loop (A-4) — extract to tool-executor.ts as middleware chain:
                       pre:tool hook → governance → pre:memory-write → guard → execute → sanitize →
                       onToolResult → post:memory-write → post:tool
agent-loop.ts:573      result init to '' "defends against future refactors that slip in an early continue" —
                       the kind of defensive code that signals A-4 is overdue
agent-loop.ts:608      LoopGuard called via positional check(name, args) — fine, but the result/error
                       branches at 609-631 are a small ladder that belongs in tool-executor.ts
agent-loop.ts:632-641  scanForInjection ordering rationale (Review C2) is sound but the 8-line comment
                       block exceeds the 2-line CLAUDE.md §3.7 budget — distill (A-13)
```

### `orchestrator.ts` (1048 LOC)

```
orchestrator.ts:112-181  Orchestrator constructor + 6-layer initialization — fine, but the class
                         is then 900L of mixed responsibilities (A-9)
orchestrator.ts:223-247  getMemoryStats does 6 COUNT(*) queries — comment defends not caching ("once
                         per user turn, not once per LLM iteration"). Reasonable today; revisit if
                         personal mind exceeds ~500k frames
orchestrator.ts:254-278  fetchRecentFrames (M17) extracted — GOOD example of the pattern to apply
                         elsewhere in the class
orchestrator.ts:284-364  loadRecentContext returns string; extract to context-loader.ts (~80L)
orchestrator.ts:380-445  loadRecentContextFrames returns typed data; same extraction (~65L)
orchestrator.ts:451-465  cachedSection / uncachedSection helpers — fine, keep
orchestrator.ts:467-507  buildSystemPrompt — already clean after the section-caching refactor (good)
orchestrator.ts:517-561  buildAssembledPrompt — async, calls PromptAssembler; clean
orchestrator.ts:583-745  recallMemory is 162 lines — has 2 branches (catch-up SQL vs semantic),
                         filtering (R2 sign gate + score floor), formatting, injection scan,
                         turnId logging. Split the catch-up branch into its own private method;
                         drop recallMemory to ~80L
orchestrator.ts:593-598  12 catch-up regex patterns inline (A-7) — lift to module-level RECALL_PATTERNS
orchestrator.ts:753-1029 autoSaveFromExchange is 277 lines (A-2) — THE PRIORITY EXTRACTION.
                         Lift verbatim to pattern-write-back.ts as runAutoSavePatterns(orchestrator, userMsg, assistantMsg)
                         The function is structurally coherent: 4 pattern groups (preference,
                         style, decision-with-bilateral-consent, correction) + structured extraction (F29 a/b/c/d).
orchestrator.ts:835-846  prefPatterns array inline (A-7)
orchestrator.ts:894-902  decisionPatterns array inline (A-7)
orchestrator.ts:861-867  styleSignals array inline (A-7)
orchestrator.ts:822-833  Review #20 multi-line rationale (A-13) — distill
orchestrator.ts:885-893  Review C2 multi-line rationale (A-13) — distill
orchestrator.ts:944-962  hasStructuredFindings detection — fragile string-matching ("##" + URL pattern).
                         When the user gets to PR-H (LLM-based extractor), this is the strongest
                         candidate to lift out first because the rules are most ambiguous
```

### `behavioral-spec.ts` (449 LOC)
```
behavioral-spec.ts:18-449  v3.0, 5 named sections, COMPACTION_PROMPT export — CLEAN.
                            No polish opportunity. Recently refactored per CLAUDE.md §10 sprint status.
```

---

## 2. Suggested PR breakdown (Claude-Code/Hermes-shaped target)

| PR | Title | Files | LOC moved | Risk | Order |
|---|---|---|---|---|---|
| **PR-A** | `refactor(agent): extract autoSaveFromExchange → pattern-write-back.ts` | new `pattern-write-back.ts`, slim `orchestrator.ts` to ~770L | ~280 | Low (verbatim lift; same Orchestrator entry-point keeps it as `this.autoSaveFromExchange = (u, a) => runPatternWriteBack(this, u, a)`) | **First — highest leverage** |
| PR-B | `refactor(agent): extract SSE parser → lib/sse-parser.ts` | new `lib/sse-parser.ts`, slim agent-loop by ~90L | ~90 | Low (pure function, table-testable) | Second |
| PR-C | `refactor(agent): extract tool-call executor → lib/tool-executor.ts (middleware chain)` | new `lib/tool-executor.ts`, slim agent-loop by ~130L | ~150 | Medium (touches hook ordering — Review C2 invariant must be preserved + asserted via test) | Third |
| PR-D | `refactor(agent): extract D1/D3 gates → lib/loop-gates.ts` | new `lib/loop-gates.ts`, slim agent-loop by ~50L | ~80 | Low (gates are already isolated logic blocks) | Fourth |
| PR-E | `refactor(agent): typed LoopState + retry policy module` | new `lib/loop-state.ts`, new `lib/retry-policy.ts`, slim agent-loop by ~40L | ~120 | Low (mechanical) | Fifth |
| PR-F | `refactor(agent): extract context loaders → context-loader.ts` | new `context-loader.ts`, slim orchestrator by ~150L | ~155 | Low (the two `loadRecentContext*` methods are coherent units) | Sixth |
| PR-G | `chore(agent): collapse comment archaeology + remove `any` types` | both files | -200 LOC noise, +5 types | Low | Seventh |
| PR-H | `feat(agent): replace regex pattern extraction with LLM-based memory writer` | `pattern-write-back.ts`, new `memory-writer.ts` | ~-100, +200 | **High — real engineering**, post-launch | Deferred |

**End state (after PR-A..PR-G, ~5-7 working days):**
- `agent-loop.ts` ~ 250 LOC (vs 681 today)
- `orchestrator.ts` ~ 600 LOC (vs 1048 today)
- 6 new focused modules each ~80-280 LOC, individually testable
- Zero behavior change through PR-G (mechanical refactor)
- PR-H is a behavior change and gates on Marko's post-launch greenlight

---

## 3. Recommended Phase 1 — start here

**PR-A: Extract `autoSaveFromExchange` → `pattern-write-back.ts`.**

Why this first:
1. **Largest single extraction** — 277 LOC out of Orchestrator in one focused commit
2. **Lowest risk** — the function takes `(userMsg, assistantMsg)` and returns `string[]`; pure transform of two strings against the orchestrator's frame stores
3. **Coherent boundary** — the function already operates as a unit with a `save()` closure; lift the closure as a parameter
4. **Zero behavior change** — Orchestrator keeps its public API; the method body becomes a 1-line delegation
5. **Sets the pattern** — establishes the simplification model the rest of the PR sequence follows

**Verification gate before claiming done:**
```bash
npx tsc --noEmit --project packages/agent/tsconfig.json
npm run test -- --run packages/agent
npm run lint
```

All three must be green. Any test that imported `Orchestrator.autoSaveFromExchange` directly continues to work because the method is preserved as a thin delegation.

---

## 4. Risk + rollback

**Risk profile:**
- PR-A through PR-G are mechanical refactors. They preserve the function call shapes that external callers (server routes, tests) depend on.
- The single non-trivial invariant is **PR-C's hook ordering** (`pre:tool → governance → pre:memory-write → guard → execute → sanitize → post:memory-write → post:tool`). Review C2 documents why: sanitize must happen BEFORE post-hooks and `onToolResult` callback. Encode this as an assertion test before merging PR-C.
- PR-H is the only PR that changes behavior. It must run side-by-side against the regex extractor for at least 2 weeks of real harvest data before swapping, with an explicit comparison report.

**Rollback:**
```bash
# Per-PR — each PR is one atomic commit. Revert by SHA.
git revert <PR-A-sha>

# Whole-arc — checkpoint tag before PR-A:
git tag checkpoint/pre-agent-core-polish-2026-05-27
git push --tags
```

---

## 5. Out-of-scope for this review

- **`retrieval-agent-loop.ts` (973L)** — separate loop pattern for structured-action retrieval; its own polish review when needed
- **`system-tools.ts` (992L)** — tool definitions are necessarily long; not god-function territory
- **`persona-data.ts` (965L)** — declarative persona array; data, not logic
- **`evolve-schema.ts` (852L)** — self-evolution subsystem; its own audit when the polish here lands
- **The 100 other files** — most are 50-450 LOC focused modules. They look healthy on size scan.

---

Generated by manual review against HEAD `819571d` on 2026-05-27. Comparison references: Claude Code's tool-result-injection + auto-compact loop; Hermes' minimal-state ReAct (Pillar-1 benchmark target).
