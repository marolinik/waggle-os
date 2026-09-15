# Technical Debt

Single queue for all code-health journeys. Created in Phase 1 of the
`/remove-technical-debt` journey (tracker: `docs/REMOVE-TECHNICAL-DEBT-PLAN.md`).
Extended by Phases 2, 3, 4, 6.

## Debt Ledger

| Item | Location | Type | Risk | Effort | Priority | Status |
|---|---|---|---|---|---|---|
| TD-CHAT-1 `/status` renders the "Persisted workspace state is disabled for this turn." sentinel as a report section because `statusCommand` only filters the `No workspace state available.` sentinel | `packages/agent/src/commands/workflow-commands.ts:199-206`, `packages/server/src/local/routes/chat.ts:3057-3060` | quirk (pinned) | low — cosmetic, memory-deny turns only | S | P3 | pinned in `chat-route-characterization.test.ts`; fix as a separate behavior commit |
| TD-CHAT-2 `/memory <query>` echoes the policy directive suffix back as part of the query heading | `packages/agent/src/commands/workflow-commands.ts:246-247` | quirk (pinned) | low | S | P3 | pinned; open |
| TD-CHAT-3 `POST /api/chat` handler is 3652 lines in one closure with ~30 hoisted mutable turn variables, 44 `try` blocks, 18 loops; nested closures (`buildSystemPrompt`, `acquireChatRuntime`, pre-tool approval hook) reachable only through HTTP | `packages/server/src/local/routes/chat.ts:2166-5818` | monster method | high — every chat change lands here; 179 commits in 6 months | XL | P1 | characterized (86.5% lines); Phase 2 target: Break Out Method Object along the phase table in `docs/TESTING.md` |
| TD-CHAT-4 Business rules (turn-mutation policy, tool narrowing, persona filtering, disclaimer rules, approval gating) live inline in the Fastify handler, not in framework-free use cases | `routes/chat.ts`, `routes/chat-helpers.ts` | architecture (Dependency Rule) | high | L | P1 | open; Phase 5 |
| TD-ENV-1 Repo needs Node 22.23.2 but the workstation fnm default is Node 24; no `.nvmrc`/`.node-version`, so a fresh shell runs the suite against an incompatible `better-sqlite3` ABI and reports 668 false failures | repo root (missing `.node-version`), `packages/server/package.json#engines` | environment / broken window | medium — masks real failures, wastes sessions | S | P2 | done 2026-09-15 — `.node-version` pins 22.23.2 (`chore:` commit on the Phase 1 branch); the fnm-default trap remains for shells outside the repo |
| TD-TEST-1 `chat.ts` has no direct unit harness; all pins go through `buildLocalServer` (≈1–1.5 s per file setup). Acceptable now; becomes the bottleneck once Phase 2 extracts phases | `packages/server/tests/*` | test infrastructure | medium | M | P2 | open; revisit after the first Break Out Method Object |
| TD-TEST-2 Coverage not enforced in CI; `chat.ts` gaps only visible via ad-hoc runs | `.github/workflows/ci.yml` | process | medium | S | P2 | open |
| TD-CHAT-5 `WAGGLE_MAX_MESSAGE_LENGTH` is `parseInt`-ed with no numeric guard; a non-numeric value yields `NaN`, every length comparison is false, and the message-length limit silently disappears (fail-open) | `routes/chat.ts:2249` | bug (confirmed by reading) | medium — input-validation boundary | S | P2 | open; pin current behavior first, then fix with a guard + default |
| TD-CHAT-6 `dismissedCaptureSuggestions` is read at the capture-suggestion gate but never written anywhere in the sidecar, so the dismissal guard is permanently inert | `routes/chat.ts:1728,5368` | dead guard (confirmed by grep) | low | S | P3 | open |
| TD-CHAT-7 Per-turn `IterationBudget` of 90 is constructed and ticked exactly once, so its pressure message can never be meaningful | `routes/chat.ts:4320,5199` | vestigial code (suspected) | low | S | P3 | open; verify then remove in a structure-only commit |
| TD-CHAT-8 `costTracker.addUsage` runs only when a custom `agentRunner` is installed; production accounting goes through `modelSpendBudget` inside the loop, so the only accounting path tests reach is one production never uses | `routes/chat.ts:5222-5243` | test-integrity gap (suspected) | medium | M | P2 | open; confirm and align accounting path |
| TD-CHAT-9 Viewer RBAC is checked twice against two different workspace configs (body-supplied vs resolved authorization); if they disagree the first failing check wins, making the effective policy order-dependent | `routes/chat.ts:2429-2443,2568-2573` | duplicated knowledge / order-dependent rule (suspected) | medium — authorization | M | P2 | open; Phase 6 DRY candidate |
| TD-CHAT-10 `runAgentAttempt` resets token buffer and capability receipts between attempts but leaves `explicitReadOnlyToolWasUsed`, `explicitReadOnlyToolResult`, `requiredToolSequence*Order` stale, so a fallback-model replay can satisfy the ran-exactly-once gate with the previous attempt's result. Possibly deliberate; unguarded by any test | `routes/chat.ts:4806-4820,4920` | hidden coupling (suspected) | medium | M | P1 | open; characterize via fetch-spy harness before any Phase 2 extraction touches the attempt loop |
| TD-CHAT-11 `WAGGLE_AUTO_APPROVE` is captured at module load while the adjacent approval-timeout policy is read per plugin registration; two security switches with inconsistent read timing (also defeats env stubbing in tests) | `routes/chat.ts:1402,1412-1416` | inconsistent config seam (confirmed) | low–medium | S | P2 | open |
| TD-CHAT-12 Desktop notification fires on every successful turn, including ordinary interactive chat | `routes/chat.ts:5537` | UX / suspected | low | S | P3 | open; verify guard condition first |
| TD-CHAT-13 Single-flight rejection returns before entering the `try`, so none of the `finally` cleanup applies; correct today, fragile to any edit that moves state acquisition above the guard | `routes/chat.ts:2731-2736` | fragile ordering | low | S | P3 | open; pin with a test in Phase 2 before restructuring |
| TD-REL-1 SSE `raw.write` return value is ignored — no backpressure; a slow consumer buffers unboundedly | `routes/chat.ts:2624-2628` | reliability | medium | M | P2 | open; Phase 7 |
| TD-REL-2 LLM health probe issues a `fetch` per turn on the critical path whenever the tracked provider is not marked healthy | `routes/chat.ts:3024` | reliability / latency | medium | M | P2 | open; Phase 7 (timeout + cache) |
| TD-TEST-3 `isClosedDbError`, `resolveRealPath`, `onRestored`, `isBusy`, `managedSessionStateKey`, `isSessionActive`, `evictSession` in `chat.ts` never execute under any server test | `routes/chat.ts:149,995,1786-1839` | untested code | medium | S–M | P2 | open; see Characterization Backlog |

## Smell Inventory

| Smell | Location | Refactoring | Status |
|---|---|---|---|
| (Phase 2 fills this table) | | | |

## Sprout / Wrap Register

None yet. Phase 1 added no production code; all changes are tests and docs.

## Debt Budget & Broken-Windows Policy

(Phase 6 fills this section.)

## Adopted Conventions

- Characterization tests live in `*-characterization.test.ts`, pin observed behavior, and mark
  quirks with `// QUIRK (docs/TECH-DEBT.md TD-…)`. They are never edited to make a behavior
  change pass; the behavior change gets its own commit that updates the pin deliberately.
- Structure-only and behavior-only changes never share a commit. A red test mid-refactor means
  revert, not debug.
- Run the suite under Node 22.23.2 before believing a red run.
