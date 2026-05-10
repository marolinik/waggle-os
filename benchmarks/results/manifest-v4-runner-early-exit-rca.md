# Manifest v4 — Runner Early-Exit RCA

**Date:** 2026-04-24 · **Branch:** `feature/c3-v3-wrapper` · **Target:** PM-RATIFY-RCA gate.

## Finding 1 — No runner-code early-exit path for ANY judge mode

`judgeEnsemble` at `failure-mode-judge.ts:245-258` is SEQUENTIAL `for
await`, not `Promise.all`. First failed judge throws → `runJudge`
catches at `judge-runner.ts:386-400` → returns `{model_answer,
judge_error}` → runner at `runner.ts:463, 476` **continues**.

Observed early-exit was **external**: bash `Terminated` + simultaneous
PID 4984 / 65668 death + harness reporting "failed exit 1" on the
kickoff Bash → process-tree cleanup by Claude Code harness, NOT runner
code.

## Finding 2 — All seven judge modes propagate identically

Throw sites: HTTP 429 (observed, `judge-client.ts:107, 171-173`);
network timeout / AbortError (`:82`); token-budget 400, auth 401/403,
context-length 400, 5xx post-retry (all `:107`); malformed JSON
(`judgeAnswer` → `JudgeParseError`). All seven caught at
`judge-runner.ts:386-400` → `judge_error` payload → runner continues.
No uncaught rejection. Streak-halt §7.2 is subject-side only
(`streak-tracker.ts:28-30`).

## Finding 3 — Recommendation: Task 2.6 tech-debt, no manifest v5

Early-exit was external harness cleanup, not any judge mode. Manifest
v4 anchor `dedd698` valid under Option A + clean foreground re-kick.

## Finding 4 — Separate audit-trail bug (non-blocking)

`runner.ts:493-511` spreads judge fields but **omits `judge_error`** —
failed-ensemble rows carry only `model_answer`, explaining the 32
"neither" rows at Gate D.

## Task 2.6 tickets (Stage-3-independent)

- `judge-ensemble-defensive-error-handling` — `Promise.allSettled` + 2-of-3 quorum at `failure-mode-judge.ts:245-258`.
- `runner-judge-error-persistence` — add `judge_error` to `runner.ts:493-511` spread.
