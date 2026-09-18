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

**3/8 at `bda6c191` (entry), 5/8 after this phase's fixes.**

| # | Diagnostic | Entry | Now | Evidence |
|---|---|---|---|---|
| 1 | Every outbound call has a timeout | ✗ | **✓** | 159/183 carried a signal; the remaining 24 fixed in R-1. Verified by balancing each `fetch(...)` call's own arguments, not a line window |
| 2 | Circuit breakers on critical dependencies | ✗ | **✓** | R-2 — `packages/agent/src/circuit-breaker.ts`, wired at the composition root as `server.llmFetch` |
| 3 | Pools isolated per dependency | ✗ | n/a | Does not transfer — see scope note. Origin-keyed breaker supplies the property that matters |
| 4 | Deploy without downtime | ✗ | ✗ | No Tauri updater configured; a fix requires a manual reinstall. **R-5**, release-engineering arc |
| 5 | Health checks verify dependencies | ✓ | ✓ | Local `/health` validates the Anthropic key live, checks the DB, and degrades honestly instead of reporting `ok`. Server-mode `/health` is shallow — **R-4** |
| 6 | Logs, metrics and traces correlated | ✓ | ✓ | `logTurnEvent` stamps `turnId` on every line; `execution_traces` carries outcome, model, tokens and cost per turn |
| 7 | Load-tested beyond peak | ✗ | ✗ | Does not transfer as written; the real form is **R-6**, a soak against a grown memory DB |
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

## Health Checks & Metrics

- **Local sidecar `/health`** (`local/index.ts`) is a genuine deep check: it validates the
  Anthropic key against the provider, checks database health, reports the real listening port, and
  **degrades** (`health: 'degraded'` with an actionable detail string) rather than reporting `ok`
  while broken. This is the shipping surface and it is correct.
- **Server-mode `/health`** (`packages/server/src/index.ts:84`) returns `{ status: 'ok' }` — the
  classic anti-pattern, proving only that the process is breathing. Not on the Windows Solo path.
  Tracked as **R-4**.
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
| R-3 | Bound the 65 unbounded `.all()` reads; paginate the list surfaces | P2 | agent | Touches OSS-mirrored `hive-mind-core` — §7.5 forward-port applies; pin each query first |
| R-4 | Make server-mode `/health` deep, or document it as liveness-only | P3 | agent | Not on the Windows Solo path |
| R-5 | Updater + fast rollback for the desktop artifact | P2 | founder | Entangled with signing gates; release-engineering arc |
| R-6 | Soak test against a large, aged `.mind` database | P2 | agent | The desktop-shaped replacement for "load test to 3x peak". Nothing exercises this today |
| R-7 | 9 sites bound themselves with hand-rolled `setTimeout`+abort instead of `AbortSignal.timeout` | P3 | agent | Consistency only — they *are* bounded. A Phase 6 DRY finding surfaced during R-1 |

## Chaos / Failure Injection

Already practised at the component level, which is more than the diagnostic asks for: the
characterization suites inject runner throws, unavailable workspace minds, closed database
handles, stream interruptions, credential-rotating failures and approval timeouts, and assert the
turn still terminates correctly.

What is **not** practised, and is the honest gap: no experiment runs against the assembled desktop
artifact. R-6 is the first one worth building, because it has a measurable steady state (turn
latency at a given memory size) and a hypothesis that can fail.
