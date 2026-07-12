# T5 Visual Snapshot Classification

Status: verified fixed for the tracked visual lane. The original classification below is retained for history; the current worktree includes canonical baseline updates plus a stabilization-only visual-spec change for volatile Home text. No product UI rollback was required.

## Command

Fresh-port run from `D:\Projects\waggle-os`:

```powershell
$env:WAGGLE_E2E_PORT='3463'
$env:WAGGLE_E2E_BASE_URL='http://127.0.0.1:3463'
$env:WAGGLE_E2E_DATA_DIR=(Join-Path $pwd 'output/playwright/visual-t5-3463/data')
$env:WAGGLE_TRUST_LOCALHOST='1'
$env:WAGGLE_DISABLE_MARKETPLACE_SYNC='1'
$env:EMBEDDING_PROVIDER='mock'
$env:VITE_CLERK_PUBLISHABLE_KEY=''
$env:CLERK_SECRET_KEY=''
node node_modules/playwright/cli.js test tests/visual/views.spec.ts --project=chromium --reporter=list --output=output/playwright/visual-t5-3463/test-results
```

Historical result: failed as expected; all 14 snapshot comparisons were red before the approved baseline/spec update.

## Current Verification

Fresh-port verification from `D:\Projects\waggle-os`:

```powershell
$env:WAGGLE_E2E_PORT='34199'
$env:WAGGLE_E2E_BASE_URL='http://localhost:34199'
node node_modules/playwright/cli.js test tests/visual/views.spec.ts --project=chromium --reporter=line
```

Result: passed, 14/14 visual snapshot comparisons.

Current implementation notes:

- The runner still covers the same seven desktop views: chat, memory, events, capabilities, cockpit/Home, mission-control, and settings.
- `tests/visual/views.spec.ts` now masks volatile Home cockpit facts/workspace text so snapshots compare stable layout and presentation instead of live workspace copy.
- The active expected paths remain the ASCII-hyphen `tests/visual/baselines/Visual-Regression---...` family.
- Duplicate historical baseline families remain present but documented below; they are not the family used by the current runner.

Artifacts:

- `output/playwright/visual-t5-3463/test-results/`
- Actual and diff PNGs are stored below per-test folders.
- The generated sidecar data directory was disposable and should not be kept as product evidence.

## Summary

The visual suite is not failing because snapshots are missing. The active expected paths resolve under the ASCII-hyphen `tests/visual/baselines/Visual-Regression---...` family.

The current screenshots are generally coherent in desktop dark and light mode. The diffs mostly reflect stale baselines after intentional surface changes: Home continuity now has a Start Here card, Chat has the newer workspace setup/composer state, Memory has the newer trust/correct/forget presentation, Settings has the newer provider-card and Model Pilot layout, and Skills Hub has the newer list/action treatment.

Do not update baselines before Phase 1 approval and the other Phase 1 UI changes land. Rebaseline only after screenshots are reviewed again.

## Failure Table

| Snapshot | Pixels | Ratio | Classification | Decision |
|---|---:|---:|---|---|
| `chat-dark.png` | 21,258 | 0.03 | Intentional drift | Keep current workspace chat direction; rebaseline after Phase 1 approval unless T4 changes the route/composer state. |
| `chat-light.png` | 18,337 | 0.02 | Intentional drift | Same as dark. |
| `memory-dark.png` | 48,585 | 0.06 | Intentional drift, plus T10/T12 follow-up | Current Memory actual is coherent; update baseline only after Memory mobile/tab/accessibility follow-ups are either fixed or explicitly deferred. |
| `memory-light.png` | 44,402 | 0.05 | Intentional drift, plus T10/T12 follow-up | Same as dark. |
| `events-dark.png` | 9,088 | 0.01 | Low-risk drift | Rebaseline after approval; no immediate UI fix found in the inspected actual. |
| `events-light.png` | 3,297 | 0.01 | Low-risk drift | Rebaseline after approval; no immediate UI fix found in the inspected actual. |
| `capabilities-dark.png` | 12,221 | 0.02 | Intentional drift, plus T10 follow-up | Current Skills Hub actual is coherent; keep T10 coverage for icon/action accessible names and long-row truncation. |
| `capabilities-light.png` | 9,325 | 0.02 | Intentional drift, plus T10 follow-up | Same as dark. |
| `cockpit-dark.png` | 27,356 | 0.03 | Intentional drift | Preserve the current Home Start Here continuity surface; rebaseline after approval. |
| `cockpit-light.png` | 22,423 | 0.03 | Intentional drift | Same as dark. |
| `mission-control-dark.png` | 8,036 | 0.01 | Low-risk drift, plus layout review | Current cockpit actual is coherent, but the connector list reaches the viewport edge in the cropped capture; keep a scroll/affordance check before final scoring. |
| `mission-control-light.png` | 3,304 | 0.01 | Low-risk drift, plus layout review | Same as dark. |
| `settings-dark.png` | 42,572 | 0.05 | Intentional drift, plus Phase 1 dependency | Current Settings actual is coherent, but T2/T3 may alter Settings; rebaseline only after mobile Settings and Solo/Teams copy fixes. |
| `settings-light.png` | 34,466 | 0.04 | Intentional drift, plus Phase 1 dependency | Same as dark. |

## Baseline Ownership Finding

`tests/visual/baselines/` currently contains three naming families:

- `Visual-Regression---...` - active family used by the current run.
- `Visual-Regression-...` with Unicode dash characters - duplicate historical family.
- `Visual-baselines-...` with title-case snapshot names - older duplicate historical family.

Correction after approval:

1. Keep a single canonical baseline family.
2. Remove or archive duplicate historical baseline folders only as part of an explicit test-readiness change.
3. Re-run the suite with `--update-snapshots` only after the current actual screenshots are approved.

## T5 Decision

T5 is verified fixed for the tracked visual lane:

- Product UI did not need to be rolled back to old baselines.
- The current canonical baselines represent the approved Phase 1 desktop screenshots.
- The visual suite passes 14/14 on port `34199`.
- A later test-readiness cleanup can remove or archive duplicate historical baseline folders, but they no longer block this P0 because the active runner family is documented and green.
