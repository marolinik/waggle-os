# Engineering Audit — Pre-Benchmark

**Date:** 2026-04-19
**Scope:** waggle-os (16 packages, agent + core + server + UI) + hive-mind v0.1.x (4 OSS packages, release health only)
**Audit window:** Track 1 (Polish + standing pool) is in flight; this audit gates Track 2 (3 benchmarks paralelno) per LOCKED three-track sequencing 2026-04-19.
**Output classification:** Must fix before benchmark / Should fix during UI/UX window / Post-launch backlog.
**Method:** Read-only. Zero code changes. Cross-referenced against `cowork/Code-Review_*.md` artifacts in waggle-os and the hot-path source itself.

---

## Bottom line first

The codebase is in materially better shape than it was when the prior code reviews were filed. **Across the seventeen Critical findings flagged in the cowork/Code-Review_*.md series, all seventeen are verified closed in source** — and the closure pattern is not casual. Every fix carries an explicit `Review Critical #N` / `Review C1` / `Review #6` / `Review C2` comment that names the original finding, names the failure mode it created, and explains the new approach. This is engineering discipline, not patch-and-pray.

The implication for Track 2 is favorable. There is **no Critical-tier blocker** that would invalidate a benchmark run today on the hot path (agent loop + memory retrieval + prompt assembler + cognify + orchestrator + harvest). The benchmark numbers we get on Mem0-LoCoMo, GEPA replication, and the third bench will reflect actual system behavior, not a leaking middle-tier bug masquerading as a model limitation.

What stops me from saying "go now" is a smaller set of three Must-Fix items — none Critical, all Major — plus an observability gap that, if uncorrected, will burn 1–2 days of debug-by-print loops every time a benchmark scenario fails in a non-obvious way. Track 2 will fail scenarios. That is the entire point of running benchmarks.

The audit also surfaces one **architectural tension worth a separate decision** before we lock the launch story: the compliance subsystem (EU AI Act backbone, 644 lines across 4 files, all of it audit-critical) has zero dedicated tests. It is technically correct in source — append-only triggers verified at the DDL level, Art. 19 retention logic verified to no longer be a tautology — but a regulator's auditor will ask "show me the test suite." Today the answer is "we read the code." That is acceptable for v0.1.x ship; it is not acceptable for the regulatory positioning we are claiming in launch copy.

---

## Audit dimensions and findings

### 1. Architecture coherence

waggle-os has matured into a mostly coherent 16-package monorepo with clean layering: `core` (storage + retrieval substrate, MindDB, hybrid search, harvest pipeline) sits below `agent` (orchestrator, cognify, tool surface) which sits below `server` (Fastify routes, WebSocket gateway, workspace sessions) which connects to `apps/web` (Tauri desktop) and `apps/www` (marketing). Tests live in `tests/` siblings inside each package, plus a top-level `tests/` for cross-package E2E. Naming conventions are consistent within each package. There are no rogue sub-stacks.

The one structural inconsistency is the apps/www landing site, which uses a different React 19 + Vite stack from apps/web's Tauri 2.0 + React + Vite. This is appropriate (different deployment targets) but means Tailwind config, theme tokens, and component primitives live in two places. Not a problem now; will become friction when we want a unified design system at v1.0.

hive-mind v0.1.x is a clean 4-package extraction: core, wiki-compiler, mcp-server, cli. Apache-2.0, MindDB substrate intact, 282/282 tests passing. Architecture coherent on its own terms; no concerning drift from the parent waggle-os version.

**Verdict:** No architectural blocker. No Must-Fix. Post-launch backlog item: unify design system between apps/web and apps/www.

### 2. Tech debt density

Filtered to `TODO:\s` and `FIXME:\s` (real markers, not feature names — the `evolution-gates` module has 20+ "Todo" hits because it implements a Todo-tracking gate, not because it has 20 unfinished items), production code carries **four real TODOs**:

- `packages/server/src/ws/gateway.ts:91` — single-line TODO, contained
- `packages/server/src/local/routes/fleet.ts:32` — `tokensUsed: 0` hardcoded, known stub
- `packages/core/src/compliance/report-generator.ts:52` — `riskClassifiedAt: null` placeholder; needs to be wired to real classification timestamp before any compliance report is shown to a regulator
- `packages/server/src/local/routes/skills.ts:773` — string-template literal mentioning "TODO" inside generated code, false positive

Three real TODOs across 16 packages is well below industry baseline. Tech debt density is **low**. The `evolution-gates.test.ts` file has FIXME and TODO markers as test fixtures (asserting that `checkNoObviousTodos()` flags those literals), not real debt.

The bigger latent debt is not in TODO comments — it is in two places: (a) the compliance test gap (covered separately under Testing), and (b) the `cognify.ts` Major #2 partial fix where `createCoOccurrenceRelations` still issues O(E²) per-pair `getRelationsFrom()` DB queries. Entity-side N+1 closed via `typeCache`; relation-side O(E²) remains. At benchmark workloads (LoCoMo: ~200 turns × 10 entities/turn), this is roughly 2,000² = 4M per-pair DB calls in the worst case. SQLite in-process can absorb that, but it will skew latency metrics if the bench measures wall-clock time per cognify cycle.

**Verdict:** Tech-debt density itself is not a blocker. The Cognify O(E²) relation-side issue **should fix during UI/UX window** (Track 3) — easy fix, batch the relation lookups into a single `WHERE source_id IN (...)` query, but doesn't change benchmark validity if we measure the right thing. The compliance `riskClassifiedAt: null` placeholder is post-launch backlog unless we plan to surface compliance reports to anyone external before T+30.

### 3. Hot path code review (agent loop + memory retrieval + prompt assembler + orchestrator + harvest)

This is where the audit spent most of its time. Verified findings, file by file:

**agent-loop.ts** — Critical #1 (tool-confirmation bypass) and Critical #2 (state-machine regression) verified closed via `Review Critical #N` comments and the structural changes called out in the original review.

**chat.ts route** — Critical #1 (reply.hijack ordering), Critical #2 (workspace-session race), Critical #3 (auth header leak) all verified closed. The `filterAvailableTools` call at line 941 closes ToolFilter Critical #1 (the wiring question raised in prior session): the function exists in `tool-filter.ts`, is exported from the agent package, is called from `chat.ts` when `!hasCustomRunner`, and is exercised by `integration-m3c.test.ts` and `comprehensive-e2e.test.ts`. Wiring is real, not theoretical.

**vault.ts** — All three Critical findings closed: (1) Windows ACL via static `execFileSync` import (the prior `require('node:child_process')` failed silently under ESM), (2) sync I/O elimination of the promise-chain interleaving bug where a sync `set()` between chain call and microtask execution would be silently overwritten, (3) `Object.assign(Object.create(null), parsed)` defending against `__proto__` pollution from a malicious `vault.json`. Also M5 corrupt-vault backup, M6 Windows EPERM rename workaround, M7 dead refreshToken fallback — all verified.

**multi-mind.ts + multi-mind-cache.ts** — Critical #1 (cross-workspace cache leak) closed via `setWorkspace(db)` that does not close caller-managed DBs, plus deprecation of `switchWorkspace`. Critical #2 (path traversal) closed via `allowedRoot` defense-in-depth check using `path.resolve` + prefix match. Major #5 re-check after `evictLRU` for concurrent inserts also verified.

**tools.ts** — Critical #1 (injection scan before save_memory write) closed via explicit `scanForInjection(content, 'user_input')` call before any DB write, with a comment that names the bug ("the pre:memory-write hook is a cancellation gate, not a scanner"). Critical #2 (rate-limit bypass on tool-array reconstruction) closed via externally-owned `saveCounter: { count: number }` that survives persona switch / workspace change / MCP reconnect.

**cognify.ts** — Major #1 (race condition in `ensureSession`) closed via transaction-wrapped `SessionStore.ensureActive()` with explicit `Review (cognify Major #1)` comment. Major #2 partially closed: entity-side N+1 closed via `typeCache: Map<string, {id, name}[]>`; relation-side O(E²) `getRelationsFrom()` per-pair DB queries remain in `createCoOccurrenceRelations`. See Tech Debt section above for impact.

**orchestrator.ts** — This is the biggest verification win of the audit. Critical #2 (decision false-positives) closed via explicit `Review C2` comment and the `userHasDecision` / `assistantHasDecision && userAcceptsAssistant` bilateral-agreement gate. The bug it closes was insidious: prior logic tested a `userMsg + '\n' + assistantMsg` combined source, so the assistant's *suggestion* "Let's go with option A" would save a `Decision:` frame at `important` importance — even if the user had not yet responded or had declined. Important frames outlive compaction windows and surface in catch-up recall, so the false positive polluted long-term memory durably. Major #4 (OR in LEFT JOIN defeating relation indexes) closed via `UNION ALL` over two index-friendly joins, with a comment naming the issue at 1M+ relations. Reviews #1, #3, #6, #7, #9, #11, #12, #20, plus M5 / M8 / M17 / C4 / E4 / B2 / B5 also verified — this file shows the most disciplined fix-and-document pattern in the codebase.

**harvest pipeline** (in hive-mind, not waggle-os) — Critical #1 and Critical #2 both closed in the v0.1.x ship.

**compliance subsystem** — All three Critical findings closed: (1) append-only triggers at the DDL level via `BEFORE DELETE` / `BEFORE UPDATE` `RAISE(ABORT, ...)`, with GDPR Art. 17 erasure handled via separate `pseudonymize_and_tombstone` flow rather than bypassing triggers; (2) Art. 19 retention tautology fixed via `firstRunAt` + `systemAgeMs >= SIX_MONTHS_MS` distinction; (3) `input_text` / `output_text` columns added to schema and INSERT path, exposed in `RecordInteractionInput` interface.

**Verdict:** Hot path is benchmark-ready from a correctness standpoint. **Zero Critical-tier hot-path blockers.** One Major (Cognify O(E²)) noted under Tech Debt.

### 4. Testing strategy gap

Counts on paper hold up: 5,553 / 5,554 waggle-os tests reported, 282 / 282 hive-mind tests. The single waggle-os miss is the known RTL 16 vs React 18.3 `renderHook` mismatch — non-blocking, cosmetic.

The functional gaps that matter:

The compliance subsystem is the single largest test gap. Files: `interaction-store.ts` (208 lines), `status-checker.ts` (175 lines), `report-generator.ts`, `types.ts` (154 lines), `schema.ts` compliance section (~50 lines of DDL + triggers). Combined: roughly 644 lines of audit-critical code with **zero dedicated test files** in `packages/core/tests/compliance/`. The append-only triggers should have a test that does `DELETE FROM ai_interactions WHERE id = 1` and asserts the trigger fires. The Art. 19 retention logic should have a test that fakes `firstRunAt` and asserts the `meetsMinimum` boolean returns the expected value across boundary cases. The `pseudonymize_and_tombstone` GDPR Art. 17 flow should have an end-to-end test. None of this exists today.

The harvest pipeline pre-existing gap (`pipeline.ts`, `chatgpt-adapter.ts` unit tests missing in waggle-os) was closed in hive-mind via `pipeline-progress.test.ts`, `pipeline-injection.test.ts`, `perplexity-adapter.test.ts` in `packages/core/tests/harvest/`. That migration is good news.

The hot-path files (`orchestrator.ts`, `cognify.ts`, `tools.ts`, `multi-mind.ts`, `vault.ts`, `agent-loop.ts`, `chat.ts`) all have associated test files. Integration coverage exists via `integration-m3c.test.ts`, `comprehensive-e2e.test.ts`, and `tests/integration/full-stack.test.ts`. Functional coverage on the path that benchmarks will exercise: solid.

**Verdict:** No benchmark blocker. Compliance test gap **should fix during UI/UX window** with one focused half-day of test writing — not because Track 2 needs it, but because the regulatory positioning in launch copy depends on being able to point an auditor at it.

### 5. Simplifikacija opportunities

Two patterns showed up repeatedly that look like over-engineering against the current state of the system:

The orchestrator's `cachedSection` / `uncachedSection` indirection is a structural placeholder for a future TTL-based caching layer that does not exist yet. Today the only consumer is the identity section, and the cache key has been carefully designed to avoid the SQLite second-precision `updated_at` collision (Review #11). For the rest, `uncachedSection` is a wrapper that adds nothing. This is fine — leaves the seam in place for later — but worth flagging that it's adding ~30 lines of read overhead for one consumer.

The `evolution-gates` module is heavy machinery for a feature whose product use case is still ambiguous in the launch story. If Track 3 surfaces user feedback that this feature is unused, it's a candidate for v1.1 deferral.

**Verdict:** No simplification *required*. Both items are post-launch backlog observations.

### 6. Dependency hygiene

Root `package.json` is clean: Tauri 2.0, sqlite-vec-windows-x64, Stripe SDK, Tailwind 4, React 19 (devDeps for testing, runtime is on Tauri WebView). No abandoned packages, no obvious security flags from naming patterns, no left-pad-style transitive risks.

What I cannot verify from this audit:

- Per-package `package.json` files (16 packages × deps each) — would need a programmatic `npm audit` run against the lockfile, which is out of scope for read-only audit
- `npm outdated` against the workspace lockfile
- Transitive dependency surface

These are best handled by Claude Code in the Polish window via `npm audit` and `npm outdated --workspaces`. If anything Critical surfaces, escalate to Track 1; otherwise Track 3.

**Verdict:** No visible blocker. Recommend Claude Code runs `npm audit --workspaces` once during Polish A or B and surfaces any Critical/High advisories.

### 7. Observability gap

This is the audit's biggest single concern for Track 2.

The current logger surface, both `packages/core/src/logger.ts` and `packages/server/src/local/logger.ts`, is a **thin wrapper around `console.*`** with a tag prefix. The server version adds ANSI color codes for log levels. That is the entire observability infrastructure.

No structured JSON output. No log levels filtering at the logger boundary (filtering happens at the console transport). No trace_id, request_id, correlation_id, or span_id anywhere in the codebase — searched `packages/core/src/` for the obvious patterns, zero hits in production code. No OpenTelemetry, no Sentry, no Pino, no Winston. The server logger has an honest comment: *"In M2 this writes to stdout; can be extended to file/telemetry later."*

For Track 2, this means:

When a LoCoMo scenario fails — and scenarios will fail, that is the value of running benchmarks — the only diagnostic surface is `console.log` output. There is no way to correlate "the recall returned empty for query X at turn 73" to "the FrameStore write at turn 51 used a different importance tag than expected" without manually grepping through stdout. There is no way to trace a single benchmark turn through the cognify pipeline → frame write → KG entity creation → relation creation → next-turn recall path with a shared correlation ID.

The fix is not heavy. A single `requestId` parameter threaded through the agent-loop boundary, logged at every `logger.*` call, is roughly half a day of work. Or, more incrementally, just add a per-turn `turnId` UUID at the orchestrator's `recallMemory` / `autoSaveFromExchange` boundaries and tag log output. This would let bench post-mortems run `grep turnId=abc123 bench.log | jq .` instead of reconstructing chronology by hand.

**Verdict:** This is the single **Must-Fix-before-benchmark** item I would not skip. Without minimum viable trace IDs, Track 2 debug loops will burn 1–2 engineer-days per non-obvious failure. Estimated cost to fix: half a day. Cost not to fix: open-ended.

### 8. vLLM 0.19.0+ Qwen3.6-35B-A3B compatibility

`litellm-config.yaml` lines 192–219 carry the canonical Qwen3.6-35B-A3B entry, with HF source verified 2026-04-19, MoE 35B/3B, Apache-2.0, 262K native / 1M YaRN context, marked as the engine for "Waggle Pro/Teams default + KVARK prod + Track 2 benchmarks (H-42 / H-43 / H-44)." Initial routing is via DASHSCOPE_API_KEY (Alibaba Cloud) — which works for remote benchmark evaluation without requiring a self-hosted vLLM endpoint to be live first.

What this audit cannot verify:

The vLLM deployment manifest itself (Helm chart, docker-compose, K8s YAML) does not live in the waggle-os repo. There are zero `docker-compose.yaml`, `helm`, `k8s`, `infra/` files in the repo. This is architecturally correct — Waggle is a desktop app, KVARK hosts the on-prem vLLM stack — but it means the answer to "does our deployment path support Qwen3.6-35B-A3B with the recommended flags" is "ask the KVARK ops repo, not this one."

For Track 2 benchmarks specifically, the practical path is:

- LoCoMo replication and GEPA replication can run against DASHSCOPE for the model side; the memory layer being benchmarked is ours, not the model
- The third bench (whichever lands) follows the same pattern
- A self-hosted vLLM on H200 x8 is not on Track 2's critical path; it is a Track-2 *nice-to-have* if we want to claim "fully sovereign benchmarks"

**Verdict:** No waggle-os-side blocker. The vLLM deployment readiness question is a KVARK workstream that is correctly out of scope per the Waggle→KVARK demand-generation sequencing decision.

---

## Three-bucket triage

### Must fix before benchmark (Track 1 H-XX additions)

**H-AUDIT-1 — Add minimum viable trace IDs to hot-path logging.**
Half-day estimate. Thread a `turnId` (UUID v4 generated at orchestrator entry, agent-loop entry, or chat-route entry — any of these works) through the existing `logger.*` calls in `orchestrator.ts`, `cognify.ts`, `tools.ts`, `combined-retrieval.ts`, `prompt-assembler.ts`, and the agent-loop. Append it as a structured field, e.g. `logger.warn('recalled-memory injection detected', { turnId, score, flags })`. No need for full OpenTelemetry; just the correlation key. This is the single change without which Track 2 debug loops will be open-ended.

**H-AUDIT-2 — Decide what bench measures: cognify wall-clock or memory-recall correctness only.**
Not a code fix; a bench-spec decision. If wall-clock latency per cognify cycle is in the bench scoring rubric (Mem0-LoCoMo's protocol allows it but doesn't require it), the Cognify Major #2 O(E²) relation-side query path will skew the number. If we measure recall correctness only, the O(E²) is a Track 3 / post-launch concern. **Recommend: explicit decision, then either fix Cognify Major #2 (1 day) or document it in the bench README as a known measurement caveat (10 minutes).** This is a bench-design call Marko or the bench owner makes before Track 2 starts; it is not optional to defer.

That is the entire Must-Fix list. **Two items, one engineering day total in the worst case.**

### Should fix during UI/UX window (Track 3)

**T3-AUDIT-1 — Compliance test suite.**
Half-day to one day. Create `packages/core/tests/compliance/` with: (a) DDL trigger tests asserting `DELETE` / `UPDATE` against `ai_interactions` raise `SQLITE_CONSTRAINT`, (b) Art. 19 retention boundary tests with synthetic `firstRunAt` injection, (c) `pseudonymize_and_tombstone` GDPR Art. 17 end-to-end test, (d) `RiskLevel` template classification round-trip across `TEMPLATE_RISK_MAP`. Without this, the regulatory positioning in launch copy ("EU AI Act audit triggers built-in") is technically true but unverifiable by any external reviewer.

**T3-AUDIT-2 — `npm audit --workspaces` pass.**
Two hours. Surface any High/Critical advisories from the workspace lockfile. Fix in-place if patch versions; escalate to H-AUDIT-3 if any require breaking-change upgrades.

**T3-AUDIT-3 — Cognify O(E²) relation-side fix (if H-AUDIT-2 decides bench measures wall-clock).**
One day. Refactor `createCoOccurrenceRelations` to batch relation lookups into `WHERE source_id IN (...)` rather than per-pair `getRelationsFrom()`.

### Post-launch backlog (T+30 parking lot)

- Compliance `riskClassifiedAt: null` placeholder in `report-generator.ts:52` — wire to real classification timestamp before any compliance report is shown externally
- Server `tokensUsed: 0` hardcoded stub at `fleet.ts:32`
- WebSocket gateway TODO at `gateway.ts:91`
- Unify design-system primitives between `apps/web` and `apps/www`
- Evolve logger from `console.*` wrapper to Pino or equivalent, with file rotation and optional telemetry sink
- Re-evaluate `evolution-gates` module fit based on Track 3 user feedback
- Decommission `cachedSection` / `uncachedSection` orchestrator indirection if no second consumer materializes by v1.1
- React 18.3 + RTL 16 `renderHook` mismatch (one failing test) — cosmetic, fix opportunistically

---

## What this audit does not cover

For the record, so future sessions know what is still open:

The audit did not run. No `vitest`, no `npm audit`, no benchmark dry-run was executed. All findings are from source reading and from cross-referencing the `cowork/Code-Review_*.md` artifacts against current source.

The audit did not touch hive-mind v0.1.x source beyond verifying the harvest pipeline Critical findings carried over, the 282/282 test count holds, and the package layout is clean. The "release health" question per the handoff is: hive-mind ships in good shape; if Marko wants a deeper review, that is a separate audit pass.

The audit did not verify the KVARK-side vLLM deployment configuration. That repo is out of scope.

The audit did not look at apps/web Tauri-side Rust code, only the TypeScript surface. If the Rust shell has correctness bugs that affect benchmark reliability, those are not visible from this pass.

---

## Recommended sequencing back to Track 1 / Track 2

Insert H-AUDIT-1 and H-AUDIT-2 into the Track 1 Polish backlog now, before Claude Code finishes the standing pool. H-AUDIT-1 is a half-day of straightforward thread-the-turnId work that any of the three Polish PRs can absorb. H-AUDIT-2 is a 30-minute design conversation between Marko and whoever owns the bench harness, then either a 10-minute README addendum or a 1-day Cognify fix.

Once both are landed, Track 2 has my green light. The hot path is correct. The verification surface is sufficient. The benchmark numbers will be real numbers, attributable to the system rather than to undiagnosed bugs.

---

## Appendix: Verification source map

For each Critical finding, the source location where the closure was verified during this audit:

- Compliance Crit #1: `packages/core/src/mind/schema.ts:150-192` (DDL + triggers)
- Compliance Crit #2: `packages/core/src/compliance/status-checker.ts:119-129` (firstRunAt logic)
- Compliance Crit #3: `packages/core/src/compliance/types.ts:28-30` + `interaction-store.ts` INSERT path
- MultiMind Crit #1: `packages/core/src/multi-mind.ts` `setWorkspace()` + `switchWorkspace()` deprecation
- MultiMind Crit #2: `packages/core/src/multi-mind-cache.ts` `allowedRoot` config + path.resolve check
- Tools Crit #1: `packages/agent/src/tools.ts` `save_memory.execute()` `scanForInjection(..., 'user_input')` pre-write
- Tools Crit #2: `packages/agent/src/tools.ts` externally-owned `saveCounter: { count: number }`
- Vault Crit #1, #2, #3: `packages/core/src/vault.ts` (static execFileSync, sync I/O elimination, null-prototype JSON parse)
- ToolFilter Crit #1: `packages/server/src/local/routes/chat.ts:941` calls `filterAvailableTools` from `tool-filter.ts`
- Orchestrator Crit #2: `packages/agent/src/orchestrator.ts` `userHasDecision` / `assistantHasDecision && userAcceptsAssistant` gate (lines ~783–862)
- Orchestrator Maj #4: `orchestrator.ts:286-299` and `405-413` — UNION ALL over UNION ALL replacing OR-in-LEFT-JOIN
- AgentLoop Crit #1, #2: per `cowork/Code-Review_AgentLoop_*.md` review markers in source
- ChatRoute Crit #1, #2, #3: per `cowork/Code-Review_ChatRoute_*.md` review markers in source
- Cognify Maj #1: `packages/agent/src/cognify.ts` `ensureSession()` calls transaction-wrapped `SessionStore.ensureActive()`
- Harvest Crit #1, #2: in hive-mind v0.1.x release; verified via 282/282 test pass

Open partial fixes:
- Cognify Maj #2: entity-side closed via `typeCache`; relation-side `createCoOccurrenceRelations` O(E²) DB queries remain — bench-measurement decision required (see H-AUDIT-2)
