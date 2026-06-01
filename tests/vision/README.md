# Vision-Based E2E Harness

A **vision** gate for the Waggle desktop-OS UI: a model judges screenshots for
*meaning* ("does this actually look and work right?"), not pixels. It catches
what the pixel-diff suite (`tests/visual/views.spec.ts`, `toHaveScreenshot`)
structurally cannot — e.g. a baseline that is the *wrong content* but pixel-
stable. Design + rationale: [`docs/audits/2026-06-01-vision-e2e-harness-design.md`](../../docs/audits/2026-06-01-vision-e2e-harness-design.md).

Architecture: **Option C (hybrid)** — deterministic Playwright capture → a
multi-agent Workflow grades meaning → a reducer cross-checks the vision verdict
against objective console signals (a vision-PASS with a real console error is
downgraded to FAIL — the "objective floor").

## Two phases

### 1. Capture — `capture.spec.ts`
Drives the real shell deterministically (`?skipOnboarding=true&tier=power`,
`openAppViaDock` with Ops/Extend zone trays, `data-theme` for light/dark) across
17 surfaces × {dark,light} + memory + 2 overlays + 4 flows (42 captures). Per
surface it writes `artifacts/<surface>-<theme>.png` + `<surface>-<theme>.json`
(`{expectation, consoleErrors[], networkFailures[]}`).

Chat round-trip is graded on **Path 2 (real LLM)** per the product decision, so
the capture server must run **without** `--skip-litellm` (a real provider key in
the vault → the anthropic-proxy returns real replies):

```bash
# 1. build (packages + web) and start a real-LLM server on :3333
npm run build:all
WAGGLE_TRUST_LOCALHOST=1 node --env-file=.env \
  node_modules/tsx/dist/cli.mjs packages/server/src/local/start.ts   # NO --skip-litellm
# 2. capture (reuses the running :3333 server)
npx playwright test tests/vision/capture.spec.ts
```

### 2. Judge — `judge-workflow.mjs` (run via the Workflow tool)
One independent vision-judge subagent per screenshot (each **Reads** the PNG —
that is the vision step) grades the 5-dimension rubric; the reducer applies the
objective floor and an agent writes `artifacts/vision-report.md`.

```js
// assemble the manifest from the capture sidecars, then:
Workflow({
  scriptPath: "tests/vision/judge-workflow.mjs",
  args: { captures: [ { surface, png, expectation, consoleErrors } /* … */ ] }
})
```

The manifest is the `artifacts/*.json` sidecars merged with their PNG paths
(one `{surface, png, expectation, consoleErrors}` per capture). `args` may be a
JSON object or string — the script accepts both.

## Rubric (per surface)
`renders_correctly` · `no_error_state` · `flow_completes` · `theme_legible`
(vision-graded) + `no_console_errors` (objective, from the capture driver).
FAIL if any vision dimension fails at confidence ≥ 0.7 **or** a real console
error is present; WARN at 0.4–0.7 (human spot-check, never auto-blocks).

## Status
- **Capture layer**: structurally verified (`playwright --list` → 42 tests).
- **Judge workflow + reducer + report**: **proven end-to-end** against real
  Waggle screenshots (6 agents, accurate verdicts, report written).
- **First-run finding**: the `Visual-Regression — Dark Mode` baselines under
  `tests/visual/baselines/` are **404 error pages**, not Waggle UI (verified) —
  the pixel-diff visual suite has been comparing against garbage. Re-baseline
  once the app serves correctly. The one genuine UI tested (`settings-light`)
  graded PASS at 0.95.
- **Pending**: the full live capture→judge run (local sidecar is blocked by a
  tsx/esbuild version skew on this Windows box — runs in CI Linux / a clean env).

## Caveats
- `tests/vision/` is **not** wired into any CI gate (it's outside the e2e/visual
  lanes), so it's inert until invoked explicitly.
- `artifacts/` is gitignored (regenerated per run).
