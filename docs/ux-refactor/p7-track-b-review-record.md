# P7/D15 Track B — Adversarial Review Record

> Multi-agent review of the Track B error-state diff (`e797926..cce3ef0`): **5 per-screen
> reviewers → 3-lens adversarial verification** (correctness / state-machine-races /
> reproduction; confirmed if ≥2 of 3 vote real). 38 agents, ~2.3M subagent tokens.
> Fixes in `9f3cf2a`.

## Tally

**11 findings → 2 confirmed / 9 refuted.** Both confirmed were in B4 (Files), one root cause.

| # | Sev | Votes | Screen | Finding | Disposition |
|---|-----|-------|--------|---------|-------------|
| 1 | MED | 2/2 | files | Cross-directory nav failure: stale entries from the prior dir keep `files.length>0`, so the `offline && files.length===0` error gate is skipped → a failed `/sub` load renders "Empty directory" + a contradictory "showing cached files" banner | **FIXED** — `loadedPath` (set only on success); cold-error gate = `offline && !haveCurrentData` where `haveCurrentData = loadedPath===currentPath`. Regression test: nav into a failing subdir → error, not empty. |
| 2 | LOW | 2/2 | files | A known-empty dir (`[]` loaded OK) then a failed refresh → `files.length===0` → false "Couldn't load files" for a dir we proved empty | **FIXED** — same `loadedPath` signal: a failed refresh keeps `haveCurrentData` true → falls through to "Empty directory", not the cold error. Regression test: context-menu Refresh → reject → stays empty. |

Both fixed together by replacing `files.length` inference with an explicit `loadedPath`
load-outcome signal, making error / empty / cached-banner mutually exclusive regardless of
stale cross-directory data. `loading` initial state flipped to `true` so the first paint
isn't a false empty.

## Refuted (9, all 0–1/3)

The panel correctly dismissed every other finding, several with detailed traces:

- **Room "error UI dead in production" (HIGH, 1/3)** — claimed real SSE failures (401/drop)
  never set `error`. Refuted: the adapter's reconnecting EventSource handles `onerror`
  internally (close→backoff→token-refresh→reopen) and surfaces nothing to the hook *by
  design* (D3 SSE-revival contract). `error` correctly fires only on a synchronous
  subscribe throw; the async path is the adapter's job, not a Track B regression.
- **Approvals partial-success / poll-flash (HIGH+MED, 0/3)** — the single `error` does not
  defeat partial success: `allSettled` still renders the fulfilled source; a transient poll
  failure resolving to error-then-heal is the intended 5s-cadence behavior.
- **Room `connecting` sync-flip, error∧tiles coexistence (MED+LOW, 0/3)** — when `error` is
  truthy the event callback never ran, so `workspaceMap` is empty and the ungated tile
  blocks are unreachable; no state combo renders tiles beside the error.
- **Command Center boundary/portal, searchDegraded race (0/3)**, **B5 filter-masking /
  gate-coverage (0/3)** — traced and dismissed.

## Gate (post-fix)

FE 897/897 · tsc 0 (apps/web) · lint 0. `9f3cf2a`.

> Note: several verifier agents hit a weekly model limit mid-run; both confirmed findings
> reached a clean 2/2 and the load-bearing refutals completed, so the verdict is sound.
