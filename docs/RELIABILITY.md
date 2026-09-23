# RELIABILITY.md

Phase 7 (`release-it`) of the `/remove-technical-debt` journey. Opened 2026-09-18.

Companion documents: [`TESTING.md`](TESTING.md) (safety net), [`TECH-DEBT.md`](TECH-DEBT.md)
(ledger and policy), [`ARCHITECTURE.md`](ARCHITECTURE.md) (layers), and
[`REMOVE-TECHNICAL-DEBT-PLAN.md`](REMOVE-TECHNICAL-DEBT-PLAN.md) (the tracker).

## Scope note — this is a desktop app, and two rows do not transfer

Release It! is written for multi-tenant services. Waggle's shipping surface is **Windows Solo**:
a Tauri shell with a bundled Node sidecar, one user, one machine. Two of the eight diagnostic
rows were assessed and deliberately **not** pursued, because satisfying them mechanically would
produce ceremony rather than resilience:

- **Bulkheads / isolated pools.** Their purpose is stopping one tenant's failing dependency from
  draining a pool shared with others. A single-user sidecar has no such contention. The one
  property worth having — a wedged local Ollama not affecting Anthropic — is obtained instead by
  keying the circuit breaker on endpoint origin (R-2), at no structural cost.
- **Load test to 2-3x peak.** Waggle's load variable is not request volume. It is **the user's own
  accumulated memory**, growing on one machine for months. The meaningful test is a soak against a
  large `.mind` database, which is R-6 below — not a throughput ramp.

The other six rows transfer unchanged and are scored honestly.

## Scorecard

**3/8 at `bda6c191` (entry), 5/8 after this phase's fixes, 6/8 once R-6 landed (2026-09-19).**

| # | Diagnostic | Entry | Now | Evidence |
|---|---|---|---|---|
| 1 | Every outbound call has a timeout | ✗ | **✓** | 159/183 carried a signal; the remaining 24 fixed in R-1. Verified by balancing each `fetch(...)` call's own arguments, not a line window |
| 2 | Circuit breakers on critical dependencies | ✗ | **✓** | R-2 — `packages/agent/src/circuit-breaker.ts`, wired at the composition root as `server.llmFetch` |
| 3 | Pools isolated per dependency | ✗ | n/a | Does not transfer — see scope note. Origin-keyed breaker supplies the property that matters |
| 4 | Deploy without downtime | ✗ | ✗ | No Tauri updater configured; a fix requires a manual reinstall. **R-5**, release-engineering arc |
| 5 | Health checks verify dependencies | ✓ | ✓ | Local `/health` validates the Anthropic key live, checks the DB, and degrades honestly instead of reporting `ok`. Server-mode `/health` is liveness by design; its readiness is `/health/ready` (R-4, closed) |
| 6 | Logs, metrics and traces correlated | ✓ | ✓ | `logTurnEvent` stamps `turnId` on every line; `execution_traces` carries outcome, model, tokens and cost per turn |
| 7 | Load-tested beyond peak | ✗ | **✓** | Does not transfer as written; its real form is a soak against a grown `.mind`, and R-6 built it — `npm run test:soak`, measured at 20k/100k/500k frames. Findings under Query & Resource Findings |
| 8 | Failure injection practised | ✓ | ✓ | Systematic fault-injection suites: runtime failure, retry chain, post-commit, approval timeout, viewer rejection |

## Integration-Point Audit

| Dependency | Timeout | Circuit breaker | Retry | Status |
|---|---|---|---|---|
| Model endpoints (Anthropic proxy, LiteLLM, OpenAI-compatible, Ollama) | ✓ per call; 120s for completions | **✓ R-2**, origin-keyed | ✓ `retry-policy.ts` — exponential backoff, `Retry-After` honoured | done |
| External search (Perplexity, Tavily, Brave) | ✓ 30s (R-1) | ✗ — not on the critical path; a failed search degrades one tool call | tool-level | acceptable |
| DuckDuckGo HTML | ✓ 10s (R-1) | ✗ | none | acceptable |
| Marketplace API | ✓ 10s (R-1) | ✗ | none | acceptable |
| Telegram | ✓ 10s (R-1) | ✗ | none | acceptable |
| Local sidecar self-calls (`/api/cron`, liveness) | ✓ 5–10s (R-1) | ✗ — in-process; a breaker would add nothing | none | acceptable |
| SQLite (`better-sqlite3`) | n/a — synchronous, in-process | n/a | n/a | bounded reads are **R-3** |

### Timeout values and where they come from

R-1 did not invent numbers. The 159 already-bounded sites use four tiers, and the 24 new ones
were placed in the matching tier:

| Tier | Used for | Prior uses |
|---|---|---|
| 5s | liveness / readiness probes | 38 |
| 10s | normal remote or localhost API call | 96 |
| 30s | external search provider | 7 |
| 120s | LLM completion — must stay generous, or a slow-but-legitimate generation is cut off | 2 |

## Circuit Breaker Design (R-2)

`packages/agent/src/circuit-breaker.ts`. Owned by the composition root
(`local/index.ts` → `server.llmFetch`), because breaker state has to outlive a single turn —
that is the entire point of it. The chat route passes it into `AgentLoopConfig.fetch`.

| Parameter | Value | Why |
|---|---|---|
| Failure threshold | 5 consecutive | Below the point where normal transient noise trips it; `retry-policy.ts` already absorbs single failures |
| Open duration | 30s | One probe per 30s is enough to notice recovery without hammering |
| Half-open | exactly 1 probe | A second caller is refused while a probe is in flight |
| Probe failure | re-opens immediately | Does not spend the whole threshold again on a provider still down |
| Key | endpoint **origin** | A wedged local Ollama cannot stop Anthropic — the bulkhead property, free |

**What counts as a failure — and what deliberately does not.** Network errors, our own
`AbortSignal` deadline firing, 5xx, and 429. **A 4xx other than 429 never trips it.** A 400 or a
401 will not heal by waiting, and fast-failing them behind a generic "temporarily unavailable"
would hide the one error the user can act on: an expired API key has to keep saying it expired.

**An open breaker returns a synthetic 503, it does not throw.** Every existing non-ok path —
`retry-policy.ts` among them — therefore keeps working unchanged, and `Retry-After: 30` lets the
existing parser use the real cooldown instead of guessing.

**A trip is expected output, not an incident.** `onStateChange` logs every transition at `warn`.
The thing worth alerting on is a breaker that *stays* open, not one that opens.

## Query & Resource Findings

**65 unbounded multi-row reads** — a `.all()` over a `SELECT` with no `LIMIT`. Measured by what
the code does with the rows, not by the SQL text: a first textual pass said 229, but most of those
were single-row `.get()` lookups, bounded by construction.

| File | Count |
|---|---|
| `hive-mind-core/src/mind/frames.ts` | 9 |
| `hive-mind-core/src/mind/erasure.ts` | 6 |
| `hive-mind-core/src/mind/knowledge.ts` | 5 |
| `hive-mind-core/src/mind/reconcile.ts` | 4 |
| `hive-mind-core/src/mind/search.ts` | 4 |
| `core/src/cron-store.ts` | 4 |
| others | 33 |

The clustering is the finding, not the count. These sit in the memory substrate, where row counts
grow with **how long the user has had Waggle installed** — the Steady State risk, and the one that
actually bites a long-lived desktop install. Tracked as **R-3**.

Note for whoever takes R-3: `packages/hive-mind-core` is the OSS-mirrored substrate. Changes there
follow the curated forward-port discipline in `CLAUDE.md` §7.5, and each changed query needs a pin
first.

### What R-6 measured, and how it narrows R-3 (2026-09-19)

A re-count puts the number at **64**, and classifying them matters more than the total. Roughly 20
are full-scan **by contract** — an erasure that stops at a `LIMIT` is a compliance bug, and so is a
half-swept `reconcile` or a partial migration backfill. Another 8 are aggregates bounded by group
cardinality, and ~19 are key-bounded (`getGopFrames(gopId)`, `getRelationsFrom(id)`). Bounding
those would be a correctness regression dressed as a fix.

The soak (`npm run test:soak`) measured what actually degrades:

| read | 20k frames | 100k | 500k |
|---|---|---|---|
| `frames.getStats()` | 7.0 ms | 67.6 ms | **245.4 ms** |
| `frames.compact()` | 4.3 ms | 71.7 ms | 231.4 ms |
| `sessions.getActive()` | 0.1 ms / 100 rows | 0.6 ms / 500 | 1.3 ms / **2500 rows** |
| `frames.getRecent(50)` | 0.5 ms | 0.3 ms | **0.2 ms** |
| `frames.getGopFrames(gopId)` | 0.6 ms | 1.5 ms | 2.1 ms |
| `knowledge.getEntities()` | 0.3 ms | 0.4 ms | 0.3 ms |

**Correction (2026-09-19).** The row above first attributed those `getStats` timings to
`orchestrator.getMemoryStats()`. They are not the same method. `FrameStore.getStats()` runs three
`GROUP BY` aggregates and is called by `hive-mind-mcp-server` resources and tools — **not** on the
chat-turn path. `getMemoryStats()` ran three plain `COUNT(*)` queries per mind, which is what runs
every turn. Measured separately, against the exact three queries:

| per user turn | 100k frames | 500k |
|---|---|---|
| three `COUNT(*)` scans (before) | 2.2 ms | 14.6 ms |
| `MindDB.memoryCounts()` (after) | 0.1 ms | 0.2 ms |

So the per-turn cost was **2–15 ms, not 68–245 ms**. The direction was right and the fix is real —
a scan that grows with the database replaced by an O(1) read — but an order of magnitude smaller
than first written. `FrameStore.getStats()`'s own cost was real and is now also addressed — splitting it into its
three queries said exactly where it lived:

| `FrameStore.getStats()` at 500k frames | before | after |
|---|---|---|
| `COUNT(*)` for `total` | 18 ms | reads `row_counts` |
| `GROUP BY frame_type` | 61 ms | 74 ms (unchanged; variance) |
| `GROUP BY importance` | **219 ms** | **34 ms** |
| whole call | **375 ms** | **107 ms** |

`importance` had no index, so grouping on it read every row — 58% of the call. It has five distinct
values, so the index is small. The remaining 74 ms is the `frame_type` grouping, which already rides
`idx_frames_type (frame_type, gop_id)`; a dedicated single-column index would shave it further at the
cost of a second overlapping index on every write, and was judged not worth it.

SQLite has no O(1) row count, so each `COUNT(*)` walks the table; the soak asserts that
structurally with `EXPLAIN QUERY PLAN` rather than relying on a wall-clock number.

`compact()` is linear and that is correct — it must see every row. `sessions.getActive()` is the
one row count that grows without limit; 2500 rows is cheap today, but nothing stops it.

So R-3 is not "add `LIMIT` to 64 queries". It is: **a write-counter for the per-turn counts**, then
a bound on the handful of list reads that genuinely grow (`sessions.getActive`, `install-audit`,
`cron-store`, `file-indexer`), each pinned first.

## Health Checks & Metrics

- **Local sidecar `/health`** (`local/index.ts`) is a genuine deep check: it validates the
  Anthropic key against the provider, checks database health, reports the real listening port, and
  **degrades** (`health: 'degraded'` with an actionable detail string) rather than reporting `ok`
  while broken. This is the shipping surface and it is correct.
- **Server-mode `/health`** (`packages/server/src/index.ts`) stays a shallow liveness check on purpose: Render's `healthCheckPath` points at it and a failing check restarts the service. **Readiness** is `/health/ready` (`src/readiness.ts`, R-4, closed 2026-09-23): Postgres `select 1` and Redis `PING`, each under a 2 s deadline, 200 or 503 with a coarse reason per dependency; errors are logged, never returned.
  Tracked as **R-4** (closed).
  classic anti-pattern, proving only that the process is breathing. Not on the Windows Solo path.
- **Correlation** is per turn and genuinely end to end: `generateTurnId` mints an id, `logTurnEvent`
  stamps it on every structured line, and `execution_traces` persists outcome, model, token counts
  and cost. There is no `chat.turn.end` event — the trace row is the terminal record (QUIRK,
  pinned in `chat-turn-trace-characterization.test.ts`).
- **No RED metrics surface.** `TelemetryStore` / `TelemetryCollector` exist and collect events, but
  nothing aggregates rate / errors / duration per endpoint. For a single-user desktop app this is
  low value; noted, not ledgered.

## Deploy vs Release

Decoupled **in code** and not at all **in distribution**:

- `packages/agent/src/feature-flags.ts` gates behavior by environment variable, so code can ship
  dark. That half works.
- There is **no Tauri updater configured**, so shipping a fix means a user downloads and reinstalls.
  Rollback is whatever installer they still have. Combined with hosted-only signing
  (`CLAUDE.md` §Windows Solo release commands), the realistic rollback window is hours, not the
  five minutes the diagnostic asks for.

This is a release-engineering decision, not a code-debt one, and it is entangled with the
Authenticode/signing gates in `docs/production-readiness/09-LAUNCH_RECOMMENDATION.md`. Tracked as
**R-5**, owner: founder.

## Open Items

| # | Item | Priority | Owner | Note |
|---|---|---|---|---|
| R-3 | **Narrowed by R-6; both count paths done.** Not 65 blanket `LIMIT`s: per-turn counts read a trigger-maintained `row_counts` table (14.6 ms → 0.2 ms at 500k), and `FrameStore.getStats()` went 375 ms → 107 ms by indexing `importance` and sourcing `total` from the counter. Left: the few genuinely growing list reads (`sessions.getActive`, `install-audit`, `cron-store`, `file-indexer`) | P2 | agent | Touches OSS-mirrored `hive-mind-core` — §7.5 forward-port applies; pin each query first. ~20 of the 64 are full-scan by contract and must NOT be bounded |
| R-4 | Make server-mode `/health` deep, or document it as liveness-only | P3 | agent | **Closed 2026-09-23** (`bd13c04f`): `/health/ready` checks Postgres and Redis; `/health` stays liveness because Render restarts on a failing check |
| R-5 | Updater + fast rollback for the desktop artifact | P2 | founder | Entangled with signing gates; release-engineering arc |
| R-6 | **done 2026-09-19** — `packages/hive-mind-core/tests/soak/`, `npm run test:soak`, sized by `WAGGLE_SOAK_FRAMES` | — | agent | Own lane (`vitest.soak.config.ts`); excluded from the default gate. Setup bulk-inserts because the subject is the read path, and one test proves a bulk row is indistinguishable from an API row |
| R-7 | 9 sites bound themselves with hand-rolled `setTimeout`+abort instead of `AbortSignal.timeout` | P3 | agent | **Won't fix 2026-09-23.** The count is 18, not 9, and the swap is not behavior-neutral: `AbortSignal.timeout` rejects with `TimeoutError` where three sites (`kvark-auth`, `kvark-client`, `channels/chat-client`) map `AbortError` to their timeout message; several sites clear the timer once headers arrive, so a timeout signal would newly abort a slow body read; and six sites are in OSS-mirrored `hive-mind-*` packages (CLAUDE.md §7.5). Every site is bounded, which was the reliability question |

## Chaos / Failure Injection

Already practised at the component level, which is more than the diagnostic asks for: the
characterization suites inject runner throws, unavailable workspace minds, closed database
handles, stream interruptions, credential-rotating failures and approval timeouts, and assert the
turn still terminates correctly.

What is **not** practised, and is the honest gap: no experiment runs against the assembled desktop
artifact. R-6 is the first one worth building, because it has a measurable steady state (turn
latency at a given memory size) and a hypothesis that can fail.
