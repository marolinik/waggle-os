# Design — Hermes opportunistic time-gated compact-on-Stop (OQ-4)

**Date:** 2026-06-01
**Status:** Approved (brainstorming → spec)
**Scope:** `packages/hive-mind-hooks-hermes` only. `@waggle/hive-mind-hooks-core` is **not** modified.
**Closes:** OQ-4 (handoff `project_session_handoff_0601_s1.md` §"What's still open" → P2) and the
CLAUDE.md §10 residual "hermes has no PreCompact" gap.

---

## 1. Problem

Hermes (NousResearch) ships **no PreCompact lifecycle event** — confirmed absent in source
(`adapter.ts` sets `HERMES_EVENT_NAME['pre-compact'] = undefined`; `paths.ts` omits the basename).
Every other built hook package binds PreCompact to `bridge.cleanupFrames()` (the
`cleanup_frames` MCP tool, `mode:'compact'`) so that, before the host truncates context, the
mind runs a maintenance pass: prune expired **temporary** frames + reconcile superseded ones.

Consequence for a hermes CLI user: **that maintenance never runs.** Temporary capture frames
(every UserPromptSubmit saves one) accumulate unbounded in their `.mind`. The Wave-2/3 hermes
package shipped this as a documented gap (`adapter.ts`: *"the gap is documented, never
approximated"*). OQ-4 is the optional follow-up that closes it.

## 2. Goal / non-goals

**Goal:** give hermes a faithful, low-cost approximation of "occasional before-compaction
maintenance" by running `cleanupFrames()` opportunistically from the per-turn Stop hook —
**opt-in, default off**, so OSS consumers see zero behavior change unless they ask for it.

**Non-goals:** changing the shared `runStopBody`; touching any other tool package; adding a new
upstream MCP tool; per-workspace gating (hermes hooks target the personal mind — a single global
gate is correct); reconstructing a true PreCompact signal (Hermes has none — this is an
approximation, labelled as such).

## 3. Core constraint — statelessness

Hermes' Stop is `post_llm_call`, delivered to a **fresh Node subprocess every turn**
(stdin-JSON / exit-0 via `runHook`). Nothing survives between turns in memory, so an
"every N turns" counter is impossible without persistence. PreCompact means "occasionally";
the only per-turn signal we have is Stop. We bridge the two with a **persisted timestamp gate**:
compact at most once per time window, tracking the last-compact instant in a small file.

(Decision record: alternatives considered were *every-Stop* — simplest but runs a maintenance
pass far more often than its intent, one extra CLI spawn per turn — and *probabilistic 1/N* —
stateless but non-deterministic cadence, can fire twice in a row or never in a short session.
Time-gate chosen: faithful to "occasional", bounded cost, deterministic + testable via an
injectable clock. Window default **10 min**.)

## 4. Placement

**Hermes-package-only.** The shared `runStopBody` / `makeStopHandler` in `hooks-core` — run by
codex, cursor, and (via `makeOpenclawHandler`) openclaw — stay **byte-untouched**. Hermes is the
only built tool lacking PreCompact, and the gate needs a hermes-specific state path
(`~/.hermes/`). Pushing file-IO + a clock + a tool-specific path into the generic core would add
blast radius across four packages for zero reuse. (CLAUDE.md §3.3 surgical changes; §3.2 no
speculative flexibility.)

## 5. Design

### 5.1 New module: `src/compact-on-stop.ts`

Small, pure, high-cohesion (CLAUDE.md "many small files"). Exports:

```text
compactStatePath(home?): string
    → join(resolvePaths({home}).hermesDir, '.hive-mind-last-compact')

isCompactEnabled(env = process.env): boolean
    → truthy WAGGLE_HERMES_COMPACT_ON_STOP, parsed exactly like WAGGLE_SIGNAL_EMIT:
      flag != null && flag !== '' && flag !== '0' && flag.toLowerCase() !== 'false'

resolveWindowMs(env = process.env, overrideMs?): number
    → overrideMs (test) wins; else parseFloat(WAGGLE_HERMES_COMPACT_WINDOW_MIN) * 60000
      when finite and > 0; else DEFAULT_WINDOW_MS (600_000 = 10 min)

readLastCompactTs(path): Promise<number | undefined>
    → read file, parseInt; missing / garbage / NaN → undefined (= "never"); fail-open

writeLastCompactTs(path, ts): Promise<void>
    → mkdir(dirname(path), {recursive:true}) then writeFile(path, String(ts)); errors
      caught + swallowed by caller. (The mkdir matters: if the flag is set on a host where
      ~/.hermes/ doesn't exist yet — e.g. hermes never installed — a bare writeFile would
      ENOENT every turn and the throttle would silently degrade to every-turn. mkdir-recursive
      is idempotent and cheap; in a real install the dir already exists.)

maybeCompactOnStop(ctx: HookContext, opts?: {
    now?: () => number; home?: string; windowMs?: number;
}): Promise<void>
```

`maybeCompactOnStop` body (all wrapped in one try/catch that logs+swallows — never throws,
never rejects):

1. `if (!isCompactEnabled()) return;`  — default-off fast path, no IO.
2. `const now = opts.now?.() ?? Date.now();`
3. `const path = compactStatePath(opts.home);`
4. `const last = await readLastCompactTs(path);`
5. `const windowMs = resolveWindowMs(process.env, opts.windowMs);`
6. `if (last !== undefined && now - last < windowMs) return;`  — inside window, skip.
7. `await ctx.bridge.cleanupFrames();`  — default `mode:'compact'`.
8. `await writeLastCompactTs(path, now);`  — **on success only** (a failed compact at step 7
   throws → caught → swallowed → timestamp NOT written → eligible to retry next turn, rather
   than being locked out for a whole window).

Turns are sequential subprocesses (process N exits before N+1 starts) → no read/write race.

### 5.2 Compose into `src/hooks/stop.ts` (save-first)

`runStop` keeps its current contract but composes the shared handler with the compact step.
The base handler is reused as-is; we only wrap its `run`:

```ts
export interface HermesStopOptions extends Partial<HookRunOptions> {
  now?: () => number;          // test clock
  home?: string;               // test $HOME override for the state file
  compactWindowMs?: number;    // test window override
}

export async function runStop(opts: HermesStopOptions = {}): Promise<void> {
  const { now, home, compactWindowMs, ...runOpts } = opts;
  const base = makeStopHandler(hermesAdapter);
  const handler: typeof base = {
    parse: base.parse,
    async run(payload, ctx) {
      await base.run(payload, ctx);                 // primary save — unchanged
      await maybeCompactOnStop(ctx, { now, home, windowMs: compactWindowMs });
      return undefined;
    },
  };
  return runHook(handler, { name: 'stop', loggerPrefix: 'hermes-hooks', ...runOpts });
}
```

Ordering + fail-open guarantees:
- **Save before compact.** If `base.run` throws (save failed), `maybeCompactOnStop` is skipped
  and the throw lands in `runHook`'s existing try/catch → `exit(0)`. The capture is the priority;
  compaction is best-effort maintenance layered after it.
- `maybeCompactOnStop` itself never throws, so a compact/file error cannot affect the exit code
  or the already-completed save.
- Use `typeof base` for the handler type to avoid importing the `StopParsed` named type (it may
  not be re-exported from the `hooks-core` barrel; `ReturnType`-style typing sidesteps that).

### 5.3 No changes to install / verify / yaml-merger / paths basenames

This is a **runtime capture** behavior only. Hermes still binds 3 lifecycle events; the gate is
not a registered hook. `paths.ts` `HOOK_BASENAMES` stays 3 (no `pre-compact`). `resolvePaths`
already exposes `hermesDir` + a `home` override → reused for the state path; no new path API.

## 6. Tests (TDD — write first, watch fail, then implement)

### 6.1 Unit — `tests/compact-on-stop.test.ts` (new)

Drive `maybeCompactOnStop` directly with `makeMockBridge()`, a tmp `home` dir, and an injected
`now`. Stub env with `vi.stubEnv` / `vi.unstubAllEnvs` (afterEach), matching the existing stop test.

1. flag off → `bridge.cleanupFrames` NOT called; no state file written.
2. flag on, no prior timestamp file → `cleanupFrames` called once; state file now holds `now`.
3. flag on, last = `now - 1min`, window 10min → NOT called (inside window).
4. flag on, last = `now - 11min`, window 10min → called; timestamp updated to `now`.
5. flag on, `cleanupFrames` rejects → `maybeCompactOnStop` resolves (no throw); state file NOT
   updated (retry-next-turn).
6. flag on, state-file write fails (point `home` at an existing **file**, so `mkdir(~/.hermes)`
   throws ENOTDIR/EEXIST) → `maybeCompactOnStop` resolves, no throw; `cleanupFrames` was still
   attempted (compaction is best-effort regardless of whether the timestamp persisted).
7. `WAGGLE_HERMES_COMPACT_WINDOW_MIN=5` honored; `compactWindowMs` opt overrides env.
8. `isCompactEnabled` truth table: unset/''/'0'/'false'/'FALSE' → false; '1'/'true'/'yes' → true.

### 6.2 Integration — extend `tests/hooks/stop.test.ts`

Through `runStop` with the mock bridge + captures + tmp `home` + injected `now`:

9. **Default-off regression lock:** flag unset → existing behavior intact AND
   `bridge.cleanupFrames` NOT called (locks "documented-gap default").
10. flag on, eligible → save happens AND `cleanupFrames` called; assert **call order**
    (`saveMemory` invoked before `cleanupFrames`).
11. flag on, eligible, `cleanupFrames` rejects → `exits === [0]`, `saveMemory` still called once.
12. flag on, but **no `assistant_response`** (no save) → `cleanupFrames` still gate-eligible and
    may run (compaction is independent of whether this turn had a response) — assert it runs and
    exits 0. *(Confirms compaction isn't accidentally coupled to the save path.)*

All existing hermes stop tests must stay green unchanged.

## 7. Docs to correct (same PR)

- `src/adapter.ts` — the block comment "There is NO PreCompact event … the gap is documented,
  **never approximated**." → "…no PreCompact event; the maintenance pass is **approximated
  opt-in** from Stop (`WAGGLE_HERMES_COMPACT_ON_STOP`, default off) — see `compact-on-stop.ts`."
  (`eventName['pre-compact']` stays `undefined` — we are NOT registering a hook.)
- `src/index.ts` header — note the opt-in approximation; export `maybeCompactOnStop` +
  `compactStatePath` if useful for consumers (optional).
- `README.md` — capture-fidelity hermes row: add the opt-in compact line + the two env vars.
- `src/bin/hermes-hooks.ts` — `printInstallSummary` capture-fidelity blurb: one line noting the
  opt-in flag (so installers learn it exists).
- Handoff / CLAUDE.md §10 — move OQ-4 from open (P2) to closed in the next handoff.

## 8. Risk / rollback

Additive + opt-in: with the flag unset (default) the only change is one extra `await base.run`
indirection that is behavior-identical to today (test #9 locks this). Rollback = revert the
hermes commit; no other package is touched. No new dependency. No upstream/CLI surface change
(`cleanup_frames` already exists and is exercised by 4 other packages).

## 9. Success criteria

- New unit + integration tests pass (12 cases above); full hermes package suite stays green
  (was 89/89).
- `npx tsc --noEmit` clean on `hive-mind-hooks-hermes` (+ `hooks-core`/`shim-core` unaffected).
- Default-off behavior byte-identical to pre-change (regression-locked by test #9).
- Docs no longer claim "never approximated".
