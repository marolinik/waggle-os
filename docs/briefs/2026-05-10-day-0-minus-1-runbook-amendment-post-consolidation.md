# Day-0 minus 1 Runbook — §3 Amendment (post-consolidation)

**Brief ID:** `cc-day-0-minus-1-runbook-amendment-2026-05-10`
**Date:** 2026-05-10
**Author:** CC (Phase 2 Step 4)
**Status:** RUNBOOK AMENDMENT — ratify on next Marko read
**Stream:** Solo CC sesija (sequential)
**Wall-clock impact:** Net zero (replaces an existing §3 step, no new operations)
**Cost cap:** $0 — pure git ops

**Authority chain:**
- `docs/briefs/2026-05-05-day-0-minus-1-runbook.md` v2 — original runbook (this amendment supersedes §3 only; §0–§2.5, §4–§10 remain authoritative)
- `.planning/phases/02-day-0-launch/02-CONTEXT.md` D-01 — Phase 2 consolidation decision (dual-branch architecture dissolved)
- `.planning/phases/02-day-0-launch/02-MERGE-LOG.md` — both consolidation merges (`9417abb` + `bb5883f`) with verification gates
- Memory entry `project_session_handoff_0510_s1.md` — pre/post tags + cleanup record
- Saved feedback rule "Decision integrity catch — Plan A scope amendment" — when Track A asymmetry surfaced (cherry-pick scramble), the corrective action was consolidation, not perpetual cherry-pick discipline

---

## §0 — Why this amendment

The original runbook v2 §3 instructs the operator to:

> ```powershell
> git checkout feature/apps-web-integration
> git tag -a v0.1.0-track-a-rc1 -m "Track A apps/web shipping-ready release candidate 1 ..."
> git push origin v0.1.0-track-a-rc1
> ```

Both prerequisites of that block no longer hold:

1. **`feature/apps-web-integration` does not exist as a branch.** It was merged into `main` (merge commit `bb5883f`, second-parent walk reaches its history at `f7c6c1c`) and the local + remote branches were deleted as part of Phase 2 Step 3 cleanup. `git checkout feature/apps-web-integration` returns "pathspec did not match any file(s) known to git."
2. **The "Track A" SHA `447f5ac` is no longer the binary source.** The Tauri Win + Mac binaries that ship at Day 0 are now built from unified main HEAD, which post-consolidation tag is `bb5883f` (annotated `v1.0-post-consolidation-2026-05-10`) and which has advanced further with subsequent Step 4 commits.

The semantic intent of the `v0.1.0-track-a-rc1` tag — "this is the SHA the public Day-0 binary ships from" — still applies. Only the SHA and the way to reach it change.

## §1 — Replacement procedure

Replace runbook v2 §3 in full with the following block. The §3 wall-clock budget (5 min) and halt-and-PM rule (tag conflict) are unchanged.

```powershell
cd D:\Projects\waggle-os
git checkout main
git fetch origin
git status --short  # must be clean — halt-and-PM otherwise

# Sync to origin (push gate §1 + §2 must already be done; main itself
# may not have advanced from origin since this runbook fires on Day-0
# minus 1 which is after Step 4 close).
$local  = git rev-parse main
$remote = git rev-parse origin/main
if ($local -ne $remote) {
    Write-Output "main and origin/main diverge — local=$local remote=$remote"
    Write-Output "halt-and-PM: do not tag a divergent main"
    exit 1
}

$sha = git rev-parse HEAD
Write-Output "Tag target SHA (unified main HEAD): $sha"

# Verify post-consolidation tag is reachable from HEAD (sanity check that
# we're tagging on top of the consolidation chain, not on a stray branch).
git merge-base --is-ancestor v1.0-post-consolidation-2026-05-10 HEAD
if ($LASTEXITCODE -ne 0) {
    Write-Output "v1.0-post-consolidation-2026-05-10 is not an ancestor of HEAD — halt-and-PM"
    exit 1
}

git tag -a v0.1.0-track-a-rc1 -m "Track A apps/web shipping-ready release candidate 1

Pass 7 PASS 9/9 (FR #23-#47) + Block C state restore.
Production backend live with WAGGLE_PROMPT_ASSEMBLER=1 runtime.
Tour/Wizard Replay + Pending Imports Reminder.

POST-CONSOLIDATION (2026-05-10): tag now lands on unified main HEAD,
not on the deleted feature/apps-web-integration branch. Track A
history is preserved as the second-parent of merge commit bb5883f.

Three P2/P3 friction notes deferred Day-2 backlog
(per project_pass7_block_c_closed_2026_05_01).

Predecessor closure memo: decisions/2026-05-05-pass-7-block-c-close.md
Sprint reference:         project_pre_launch_sprint_2026_04_30.md Track A
Consolidation reference:  .planning/phases/02-day-0-launch/02-MERGE-LOG.md
                          + tag v1.0-post-consolidation-2026-05-10 on bb5883f
"

git push origin v0.1.0-track-a-rc1
git tag --list "v0.1.0-track-a-*"
git ls-remote origin | Select-String "v0.1.0-track-a-rc1"
```

## §2 — Cross-references that also need adjusting

These references in the original runbook point at the deleted branch or its tip SHAs and must be read with this amendment in mind. They do not need a separate edit since this amendment supersedes them, but the operator must not let them mislead:

| Original reference | Reality post-consolidation |
|---|---|
| §0.1 SHA reference table — `feature/apps-web-integration` = `447f5ac` | Branch deleted. Its commit chain reaches `f7c6c1c` (DAY0V cherry-pick HEAD) and is now part of unified main as the second-parent of `bb5883f`. SHA `447f5ac` and `f7c6c1c` are still resolvable as commits but cannot be checked out as branches. |
| §0.1 — `git rev-parse feature/apps-web-integration` | Returns error "unknown revision". Skip this verification step. |
| §0.3 — "Working tree čistoća" check on `D:\Projects\waggle-os` | Still applies; nothing in this amendment changes Working Tree state expectations. |
| §3 — "`feature/apps-web-integration` na SHA `447f5ac` je shipping-ready desktop binary izvor" | Replace with: "Unified main HEAD is the shipping-ready desktop binary source." |
| §6.3 Rollback Faza C — `git push origin --delete v0.1.0-track-a-rc1` + `git tag -d v0.1.0-track-a-rc1` | Unchanged. Tag deletion is independent of where the tag was applied. |

## §3 — Verification expectations after §3 (amended)

The §5 verification battery is unchanged but its expected output for Track A tag inspection updates:

```powershell
# Verify the tag is on a SHA that is descended from the consolidation tag
git tag --list "v0.1.0-track-a-rc1"
git log --oneline v0.1.0-track-a-rc1 -1
git merge-base --is-ancestor v1.0-post-consolidation-2026-05-10 v0.1.0-track-a-rc1
```

`PASS criteria`: Tag exists, points to a commit reachable from `origin/main`, and has `v1.0-post-consolidation-2026-05-10` as an ancestor.

## §4 — Decision log

1. **Tag name `v0.1.0-track-a-rc1` retained, not renamed.** The historical name carries semantic value in marketing and runbook references; renaming to `v0.1.0-main-rc1` would orphan those references and force a marketing-side rewrite. The brief tag-message text now contains the post-consolidation note so future readers see the meaning evolution without losing the name.
2. **`v1.0-post-consolidation-2026-05-10` is NOT replaced by `v0.1.0-track-a-rc1`.** They serve different purposes: the former marks the consolidation closure; the latter marks the freeze for Day-0 binary build. The freeze tag may move forward (rare cherry-pick onto unified main between consolidation tag and Day 0) — the consolidation tag never moves.
3. **No amendment to §1 / §2 / §2.5 / §4 / §6 / §9 / §10.** Push-gate Faza A (hive-mind monorepo branch already on origin) is unaffected. §2 OSS export branches were always destined for the public hive-mind repo, not waggle-os main; consolidation does not change their target. §2.5 NPM republish is unchanged. §4 hive-mind Day-0 tag is on the public repo, unaffected. §6 rollback procedures are independent. §9 handoff and §10 decision log are PM-side and need no surgery here.
4. **Halt-and-PM rule extended.** If the post-consolidation tag is NOT an ancestor of HEAD when this section fires, that is a structural state divergence and the operator must halt-and-PM. It would mean either (a) someone reset main past the consolidation, or (b) the Day-0 build is from an orphan branch — both require Marko ratification before proceeding.

---

**END AMENDMENT.** Operator runs §3 (amended) then §4 (unchanged) per original runbook flow.
