# Manifest v4 — §7.4 Lock Semantics Clarification

**Date:** 2026-04-24 · **Branch:** `feature/c3-v3-wrapper` · **Target:** PM-RATIFY-LOCK-SEMANTICS gate.

## PM interpretation — CONFIRMED with code evidence

`concurrent_runners: FORBIDDEN` (manifest v4 §8) covers **cross-process**
threats only — two independent `npx tsx scripts/run-mini-locomo.ts` calls.
Intra-wrapper spawning via `--parallel-concurrency N` IS allowed.

**Code evidence at HEAD `373516c`:**

- `runner.ts:852` hardcodes a single global sentinel
  `benchmarks/results/.benchmark-runner`, with comment _"any two runner
  invocations contend regardless of their --output paths"_ — cross-process rail.
- `runner-lock.ts:77–112` is check-then-write (`readExistingLock → throw
  if age<60 s → fs.writeFileSync`). Two intra-wrapper children each pass
  the check before either writes (TOCTOU race); overwrite-semantics →
  last-writer wins. Both heartbeat; first unlinks, second ENOENTs silently.
- Gate D halt log: pids 4984 + 65668 both logged `[bench:lock] acquired`
  within 3 s; file retained pid=65668 (overwriter).

Net: intra-wrapper parallel coexists via fail-open race. A third
independent invocation sees a fresh mtime and refuses. Cross-process
threat model intact.

## Path L-1 (preferred) — ratify, no code change

Observed semantics match PM intent. Manifest v4 anchor `dedd698` stays
valid. **Recommended PM waiver text:**

> §7.4 applies only to cross-process invocations. Intra-wrapper parallel
> spawns under `--parallel-concurrency N` are exempt. HEAD `373516c`
> behaviour satisfies the intent.

**Path L-2 (rejected):** per-cell sentinel naming edits `runner.ts` /
`runner-lock.ts` — both frozen per §11. Triggers manifest v5. Not
warranted when L-1 waiver is defensible.

## Task 2.6 carry-over

Ticket `bench-lock-exclusive-create` (defensive, Stage-3-independent):
swap `fs.writeFileSync` for `fs.openSync(path, 'wx')` (O_EXCL) in
`runner-lock.ts`; per-cell sentinel in `runner.ts:852`; parallel-acquire
unit test (exactly one succeeds).
