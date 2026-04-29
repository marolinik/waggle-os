# Faza 1 closed — quarantined tests

**Quarantine date:** 2026-04-29 (Phase 5 §0 preflight)
**Authority:** PM ratification — Phase 5 deployment §0 preflight 3-ask response, Ask #1 Option 1
**Branch:** `phase-5-deployment-v2`
**Quarantine commit:** see git log this directory
**Vitest exclude:** `**/__faza1-closed/**` added to `vitest.config.ts` exclude list — these files are skipped from collection (no longer load-bearing for current verification).

---

## Quarantined files

| File | Reason |
|---|---|
| `mutation-validator.test.ts` | Pins baseline shape SHAs at Faza 1 substrate freeze `c9bda3d`; `phase-5-deployment-v2` Opcija C inheritance chain doesn't reach `c9bda3d`. PM Ask #1 Option 1 ratified 2026-04-29. |
| `registry-injection.test.ts` | Asserts Amendment 8 H1 failure mode (deep-relative-path REGISTRY ≠ package REGISTRY) reproduces under Node 22.19.0; current Node ESM resolver deduplicates the paths so the assertion fails. CC extended quarantine 2026-04-29 same session — flagged in §0 preflight evidence + commit message; PM advised. |

## Why these tests live here

Tests in this directory pin substrate SHAs against the Faza 1 substrate freeze head `c9bda3d` (Phase 4.7 HEAD on `feature/c3-v3-wrapper`, per `benchmarks/preregistration/manifest-v7-gepa-faza1.yaml` `substrate_freeze_head`). They were load-bearing during Faza 1 GEPA evolution runs (executed inside isolated worktree `D:/Projects/waggle-os-faza1-wt` rooted at `c9bda3d`) to enforce the cell-semantic boundary invariant — the mutation oracle must not modify baseline shape file content during Gen 1+ candidate generation.

`registry-injection.test.ts` documents a SECOND class of Faza 1 closed-work artifact: tests that intentionally assert a buggy state reproduces (so the bug stays detectable if someone "fixes" the canonical path back). Once Amendment 8 fixed H1 via the canonical `registerShape` API + Node ESM resolver dedup behavior changed in subsequent versions, these documentation tests can no longer pass — but their failure carries no Phase 5 substrate signal. The H1 fix is verified independently via `selectShape` + `registerShape` integration tests in the agent suite.

After Faza 1 closure (`6bc2089` — Checkpoint C closure decision `decisions/2026-04-29-gepa-faza1-results.md`), the branch architecture decision **Opcija C** (`decisions/2026-04-30-branch-architecture-opcija-c.md`) determined that:

- `phase-5-deployment-v2` inherits `gepa-faza-1` baseline (= `6bc2089`)
- `gepa-faza-1` parent chain reaches `origin/main` (`5ec069e`), NOT `c9bda3d`
- `c9bda3d` is on the divergent `feature/c3-v3-wrapper` branch (CC-1 Phase 4 work)
- Therefore the SHAs of baseline shape files on `phase-5-deployment-v2` reflect `origin/main` content, not the `c9bda3d` content these tests pin

Running these tests on `phase-5-deployment-v2` produces 14 failures with no Phase 5 substrate signal — the failures are a scope-leakage artifact of post-closure test continuation under Opcija C inheritance, not a bug in either Phase 5 substrate or Faza 1 evolution invariants.

Faza 1 closure verdict §F.4 already documents `105/105 anchor invariance checks PASS` during in-worktree execution + `15/15 held-out anchor checks PASS` during Checkpoint C — the cell-semantic boundary discipline was verified and binding throughout Faza 1.

## What this quarantine does and does NOT mean

- **Does NOT mean** Faza 1 substrate discipline was wrong or the test was buggy.
- **Does NOT mean** baseline shape files have been modified.
- **Does mean** the SHAs the test pins to (`c9bda3d` substrate snapshot) are not reachable from `phase-5-deployment-v2` HEAD without integration sprint work.
- **Does mean** the test is no longer load-bearing for Phase 5 deployment substrate verification (REGISTRY API + registerShape canonical path + gen1-v1 shape definitions are verified independently via Phase 5 §0.1 substrate readiness grep).

## Reactivation conditions

These tests should be re-activated (moved back out of `__faza1-closed/`) when ANY of the following holds:

1. **Post-Phase-5 production-stable integration sprint** (per Opcija C §5) merges `feature/c3-v3-wrapper` into the deployment lineage. Re-pin the test SHAs to the integrated substrate snapshot before re-activating.
2. **Future Faza N evolution sprints** that re-establish substrate freeze inside an isolated worktree. Re-activate the tests inside that worktree's branch context, not on the deployment branch.
3. **Substrate boundary regression suspected** — re-pin SHAs to the current deployment branch HEAD content and re-activate as a drift detector for that specific branch.

Forbidden: simply blanking the SHA pins to silence the test. Replacement pins must be anchored to a documented substrate snapshot with audit-traceable origin.

## Audit trail

| Anchor | Path |
|---|---|
| Faza 1 closure decision | `D:/Projects/PM-Waggle-OS/decisions/2026-04-29-gepa-faza1-results.md` |
| Branch architecture (Opcija C) | `D:/Projects/PM-Waggle-OS/decisions/2026-04-30-branch-architecture-opcija-c.md` |
| Phase 5 brief LOCKED | `D:/Projects/PM-Waggle-OS/briefs/2026-04-29-phase-5-deployment-brief-v1.md` |
| §0 preflight evidence | `D:/Projects/waggle-os/gepa-phase-5/preflight-evidence.md` |
| Quarantine ratification | PM 3-ask response 2026-04-29, Ask #1 Option 1 |
