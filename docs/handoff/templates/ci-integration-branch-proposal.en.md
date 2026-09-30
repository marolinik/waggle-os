# PROPOSAL — CI filters for the integration branch (W0-PR0)

> **English translation** of [ci-integration-branch-proposal.md](ci-integration-branch-proposal.md) (Serbian original, same folder). The Serbian original is authoritative; report any discrepancy. Dates are written DD.MM.YYYY; "wd" means working days.

**Document revision: 1.2 DRAFT · 29.09.2026 · reviewed code revision `2af0904df01ca3d374cc78ba95b60dc579dd6a7a`**
**Document revision: 1.2.1 DRAFT · 30.09.2026 · final closure (H-01..H-12)**

Changes 1.2.1: H-09 — the path to a tag is controlled step K after F3a (§3); alignment with H-01 (CI runs on the branch in `<ODOBRENI_TIMSKI_REMOTE>`, §0 and §4) and H-04 TSA-08 (re-run, §4).

**Status: PROPOSAL.** Nothing in this document has been applied to `.github/` and no workflow has been run. This is a draft of the contents of PR **W0-PR0** ("`integration/**` in the `ci.yml` and `tauri-build-pr.yml` filters", [Delivery plan §2 W0](../../plans/WAGGLE-DELIVERY-PLAN-v1.2.en.md); DP-0.07). The PR is opened only once the founder approves the delivery plan and `integration/waggle-next` exists. The PR's target is `integration/waggle-next`, not `main`. The branch and the PR live only on `<ODOBRENI_TIMSKI_REMOTE>` (H-01; [01 §3.2](../01-ONBOARDING-DEV-ENV.en.md)), so the CI from this diff also runs there; the public `origin` is not a destination.

## 1. Why

- `.github/workflows/ci.yml:3-6` triggers only for `main`: `push.branches: [main]`, `pull_request.branches: [main]`. CONFIRMED AT REVISION (F-REL-10).
- `.github/workflows/tauri-build-pr.yml:17-40` triggers on `pull_request` and `push` only for `main` (with a `paths` filter), and it also has `workflow_dispatch` (`:41`). CONFIRMED AT REVISION.
- Without this change, `integration/waggle-next` and the PRs targeting it **have no CI** (DP-0.07). Until W0-PR0 is merged, gates are run locally and the output is pasted into the PR ([02-WORKING-AGREEMENT.md §14](../02-WORKING-AGREEMENT.en.md)).

## 2. Exact diff

Checked with `git apply --check` against a worktree at `2af0904d` (29.09.2026; not applied). The glob `integration/**` covers `integration/waggle-next`. Parsing the modified YAML yields `on.push.branches` = `on.pull_request.branches` = `["main","integration/**"]` for both files.

```diff
--- a/.github/workflows/ci.yml
+++ b/.github/workflows/ci.yml
@@ -1,7 +1,7 @@
 name: CI
 on:
   push:
-    branches: [main]
+    branches: [main, 'integration/**']
   pull_request:
-    branches: [main]
+    branches: [main, 'integration/**']
 
--- a/.github/workflows/tauri-build-pr.yml
+++ b/.github/workflows/tauri-build-pr.yml
@@ -16,8 +16,9 @@
 on:
   pull_request:
     branches:
       - main
+      - 'integration/**'
     paths:
       - 'app/**'
       - 'apps/web/**'
       - 'packages/**'
@@ -29,7 +30,8 @@
   push:
     branches:
       - main
+      - 'integration/**'
     paths:
       - 'app/**'
       - 'apps/web/**'
       - 'packages/**'
```

What the PR intentionally does **not** change (surgical, `AGENTS.md` §3.3):
- the `paths` filters, jobs, steps, runners and `workflow_dispatch` in `tauri-build-pr.yml`;
- the header comment in `tauri-build-pr.yml` ("per-PR + main pushes"). It remains inaccurate in detail, so it is recorded as a finding per §10 of the working agreement, and it is not fixed in passing;
- `.github/PULL_REQUEST_TEMPLATE.md`.

## 3. `release.yml` stays tag-only and is not touched

- `.github/workflows/release.yml:12-15`: the only trigger is `push.tags: 'v*'`. CONFIRMED AT REVISION.
- W0-PR0 **does not touch `release.yml`** (DP-0.07). Since `release.yml` is in the `paths` list of `tauri-build-pr.yml`, the reviewer verifies that the diff contains no line in `release.yml`.
- **No `v*` tag is created or pushed** under this plan. `release.yml` triggers on **any** `v*` tag, and historically non-release tags have already triggered failed runs (DP-0.12; live state AUDIT FINDING — TO VERIFY). `WINDOWS_PUBLIC_RELEASE_AUTHORIZED` remains undefined. The only path to a tag is controlled step K after the F3a receipts: a founder-approved fast-forward `main` → `S` and tag `vX.Y.Z` → `S` (Delivery §5.1, DQ-01); the tag is pushed by the repo owner, not the team.
- The optional narrower trigger `v[0-9]+.[0-9]+.[0-9]+` and a ruleset for `refs/tags/v*` are GitHub operational settings made by the repo owner through W8 (Delivery §2 W8, ADR-10-O8). **They are not part of this PR.**

## 4. Open (not included in W0-PR0 without a decision)

| Item | Status | Who decides |
|---|---|---|
| Whether the W0-PR0 PR itself (base `integration/waggle-next`) runs CI before its own merge | UNKNOWN. Gates for W0-PR0 are therefore run locally and the output is pasted | — |
| Actions budget cost: a `push` to `integration/**` in `tauri-build-pr.yml` runs the Windows (`timeout-minutes: 45`) and macOS matrix (`timeout-minutes: 60`) on every merge that touches `paths` | UNKNOWN (budget not measured; the monthly limit is entered by the founder in TEAM-START-AUTHORIZATION TSA-08, and the account plan depends on `<ODOBRENI_TIMSKI_REMOTE>`) | Release owner → founder |
| `hive-mind-cli-cross-platform.yml` (`push`: `main`, `feature/**`; `pull_request`: `main`) and `mind-parity-check.yml`/`sync-mind.yml` (only `main`; `sync-mind` and `mind-parity-check` are deprecation anchors per `CLAUDE.md` §7.5) are not in DP-0.07 | out of scope for W0-PR0 | tech lead per §10 of the working agreement |
| Manual `workflow_dispatch` or re-run after the merge | **prohibited** without founder approval (checklist, absolute prohibitions). The only proposed exception: a re-run of failed `ci.yml`/`tauri-build-pr.yml` jobs with a recorded infrastructure cause, within budget (TSA-08, NOT APPROVED) | founder |

## 5. Post-merge verification (PROPOSAL)

1. The next PR to `integration/waggle-next` shows the `CI` check (`test`, `e2e-smoke`, `e2e`) and, when it touches `paths`, also `Tauri Build Verification`. No workflow is run manually.
2. The Actions list contains no `Release Build` run.
3. Rollback: revert W0-PR0 on the integration branch. There is no data or state that the revert affects.

## Sources

[Delivery plan](../../plans/WAGGLE-DELIVERY-PLAN-v1.2.en.md) DP-0.07, DP-0.11, DP-0.12, §2 W0 (W0-PR0) and W8, §5 F3, §5.1 (RP-01..RP-12), §6 DQ-01 · [TEAM-START-AUTHORIZATION](../TEAM-START-AUTHORIZATION.en.md) TSA-08, TSA-09 (PROPOSAL, NOT APPROVED) · [SAFE-IMPLEMENTATION-CHECKLIST.md](../../plans/SAFE-IMPLEMENTATION-CHECKLIST.en.md) (Baseline, absolute prohibitions) · repo at `2af0904d` (read-only): `.github/workflows/ci.yml:1-6`, `.github/workflows/tauri-build-pr.yml:16-41`, `.github/workflows/release.yml:12-15`, `.github/workflows/hive-mind-cli-cross-platform.yml`, `.github/workflows/mind-parity-check.yml`, `.github/workflows/sync-mind.yml` · [02-WORKING-AGREEMENT.md](../02-WORKING-AGREEMENT.en.md) §10, §14.
