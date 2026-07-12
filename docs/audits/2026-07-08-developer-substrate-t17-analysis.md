# T17 Developer API, Background Worker, and Substrate UX Analysis

Date: 2026-07-08
Scope: SDK, server API tests, worker jobs, WaggleDance protocol, agent/core/shared/optimizer/weaver, hive-mind substrate, shim core, and wiki compiler verification lanes.
Mode: analysis plus focused tooling fix.

## Bottom Line

T17 is broadly tested, but not yet a clean 9/10 developer or release-review experience.

The good news: all 13 scoped workspaces pass direct `tsc --noEmit`, the major root-run test lanes pass, the agent suite passes 195 files / 3097 tests, the server-owned release lane passes 185 files / 2128 tests with one worker, the isolated performance lane passes 13/13, the focused Playwright `webServer` startup blocker is fixed, all scoped package-local test lanes now have working commands, the worker's scheduled-job wrapper now delegates to real allowlisted handlers instead of returning a placeholder, Waggle worker delegation now queues child chat jobs while capability and legacy knowledge responses report concrete availability and gaps, and `/cli allow|deny` now persists and hot-applies the governed CLI allowlist. The remaining problem is command trust outside those named lanes: the fast parallel server invocation can starve startup hooks, warning output remains noisy, and developer recovery journeys are not yet end to end.

## User Jobs

- Use `@waggle/sdk` to validate, install, and run skills/plugins.
- Trust local server APIs for chat, workspaces, memory, marketplace, billing, backup, compliance, hooks, and startup recovery.
- Trust background worker jobs for dispatch and job processing.
- Trust WaggleDance protocol behavior and signal handling.
- Trust memory substrate, shim core, wiki compiler, optimizer, shared contracts, and agent runtime behavior that power the UI.
- Run documented root and package-local verification commands without false failures, skipped tests, or unreadable logs.

## Scope Inventory

Scoped packages:

- `packages/agent`
- `packages/core`
- `packages/hive-mind-core`
- `packages/hive-mind-shim-core`
- `packages/hive-mind-wiki-compiler`
- `packages/optimizer`
- `packages/sdk`
- `packages/server`
- `packages/shared`
- `packages/waggle-dance`
- `packages/weaver`
- `packages/wiki-compiler`
- `packages/worker`

Source inventory found 512 test/spec files under these scoped packages and roughly 8389 `describe`/`test`/`it` declarations by simple source scan. This is a broad test surface, not an absence-of-tests problem.

## Command Evidence

| Check | Result | Notes |
|---|---:|---|
| Direct `npx tsc --noEmit --project packages/<target>/tsconfig.json` for all 13 scoped packages | Pass, 13/13 | `agent`, `core`, `hive-mind-core`, `hive-mind-shim-core`, `hive-mind-wiki-compiler`, `optimizer`, `sdk`, `server`, `shared`, `waggle-dance`, `weaver`, `wiki-compiler`, and `worker` all typecheck. |
| `npm run test -w @waggle/agent -- --reporter=dot` | Pass, 195 files / 3097 tests | Broad agent runtime, orchestration, memory recall, personas, security, tools, and workflow coverage. Output includes reranker loading/status logs. |
| `npm run test -w @waggle/core -- --reporter=dot` | Pass, 19 files / 296 tests | Core config, vault, compliance, quota, team sync, and storage tests pass. Output includes embedding provider probes, vault permission warnings, and intentional failure logs. |
| `npm run test -w @waggle/optimizer -- --reporter=dot` | Pass, 1 file / 21 tests | Optimizer tests pass through the package script. |
| `npm run test -w @waggle/weaver -- --reporter=dot` | Pass, 3 files / 31 tests | Weaver consolidation tests pass through the package script. |
| `npx vitest run packages/hive-mind-core/tests packages/hive-mind-shim-core/tests packages/wiki-compiler/tests --config vitest.config.ts --reporter=dot` | Pass, 71 files / 875 tests | Substrate, shim core, and wiki compiler tests pass through the root runner. Output is very noisy with embedding fallback banners and intentional error-path logs. |
| `npx vitest run packages/sdk/tests --config vitest.config.ts --reporter=dot` | Pass, 5 files / 89 tests | SDK tests pass from root, including the filesystem-safe plugin-id regression. |
| `npm run test -w @waggle/shared -- --reporter=dot` | Pass, 5 files / 40 tests | Shared contract tests now have a package-owned root-config command. |
| `npm run test -w @waggle/waggle-dance -- --reporter=dot` | Pass, 3 files / 42 tests | WaggleDance protocol tests now have a package-owned root-config command. |
| `npm run test -w @waggle/worker -- --reporter=dot` | Pass, 4 files / 46 tests | Worker execution and handler tests now have a package-owned root-config command. |
| `npm run test -w @waggle/hive-mind-wiki-compiler -- --reporter=dot` | Pass, 3 files / 26 tests | Colocated `src/*.test.ts` files are now included explicitly in root discovery; resolver tests isolate provider selection from Vitest CJS/ESM interop. |
| `npm run test:perf -- --reporter=dot` | Pass, 1 file / 13 tests | Dedicated wall-clock benchmark lane; the default Vitest gate excludes `packages/server/tests/performance/**`. |
| `npm run test -w @waggle/server -- --reporter=dot` | Pass, 185 files passed / 1 skipped; 2128 tests passed / 1 skipped | Server-owned deterministic release lane uses one worker and silent console output; duration 349.32s. A faster parallel invocation remains useful feedback but is not the release gate because server boot hooks can contend for resources. |
| Focused Playwright marketplace slice, port 34203 | Pass, 4/4 | The old ports `34201` and `34202` failed before assertions because transitive `tsx@4.22.3` used `esbuild` host `0.28.0` while resolving the root Windows binary `0.21.5`. Pinning the repo's direct `tsx` dependency to `4.21.0` dedupes it to root `esbuild@0.27.7`; `npx tsx -e` succeeds and Playwright `webServer` starts the sidecar before assertions. |
| `npm run test -w @waggle/hive-mind-core -- --reporter=dot` | Pass, 59 files / 745 tests | Package script now delegates to the root Vitest config, which owns the workspace aliases and shared setup. |
| `npm run test -w @waggle/hive-mind-shim-core -- --reporter=dot` | Pass, 10 files / 105 tests | Package-local script now runs the root Vitest config against the shim-core tests. The integration lane also verifies the CLI ESM resolver path for the MCP server entry. |
| `npm run test -w @waggle/wiki-compiler -- --reporter=dot` | Pass, 2 files / 25 tests | Package script now delegates to the root Vitest config and shared setup. |
| `npm run test -w @waggle/sdk -- --reporter=dot` | Pass, 5 files / 89 tests | Package script now delegates to the root Vitest config, avoiding the incomplete workspace-local dependency tree. |

## Source Findings

| ID | Severity | Finding | Evidence | Correction Needed |
|---|---:|---|---|---|
| T17-1 | Resolved | Package-local test scripts failed for packages whose root-run tests passed. | `hive-mind-core` now passes 59 files / 745 tests, `wiki-compiler` passes 2 / 25, and `sdk` passes 5 / 89 through their workspace commands; `hive-mind-shim-core` already owned the same root-config pattern. | Keep the package scripts on the root-config delegation pattern and guard them in the T17 verification lane. |
| T17-2 | Resolved for the named server lane | The standard server lane needed stable release semantics. | `npm run test -w @waggle/server -- --reporter=dot` passes 185 files / 2128 tests with one worker; `npm run test:perf -- --reporter=dot` passes 13/13 separately. The prior parallel run had four startup-hook timeouts, so it remains fast feedback rather than the release gate. | Keep the package-owned single-worker lane and isolated perf command documented. |
| T17-3 | Resolved for the standard server lane | Marketplace sync behavior leaked into normal server verification. | `packages/server/tests/local/marketplace-sync.test.ts` now stubs fetch and console output through a hermetic helper; the focused lane passes 13/13 without external sync logs. | Keep external catalog adapter coverage in a separately named live/integration lane. |
| T17-4 | Partially resolved | Passing backend/substrate runs were too noisy for reviewer use. | Root Vitest now runs with `silent: true`; the mock-provider degradation banner is suppressed only in test setup via `WAGGLE_SUPPRESS_EMBEDDING_WARNING=1`, while production runs remain loud. Direct subprocess diagnostics and selected live/integration logs still need cleanup. | Keep the quiet default and finish warning categorization for live/integration lanes. |
| T17-5 | Resolved | Some packages had no local test script even though their behavior was covered from root. | `@waggle/worker` passes 4 files / 46 tests, `@waggle/waggle-dance` passes 3 / 42, `@waggle/shared` passes 5 / 40, and `@waggle/hive-mind-wiki-compiler` passes 3 / 26 through package-owned root-config scripts. | Keep these package commands in the verification lane. |
| T17-6 | P2 | Developer-facing happy paths are tested, but coherent recovery journeys are not fully sampled. | Unit/API tests cover many pieces, the worker's scheduled `cron` wrapper now has explicit validation plus real-handler delegation coverage, Waggle worker tests cover real child-job enqueue, honest missing-capability reporting, and concrete legacy knowledge gaps, and command-route tests cover persisted `/cli allow|deny` updates with live tool permission changes. This packet still does not prove SDK docs/examples, bad config setup, worker failure UI copy, or server API consumer ergonomics as end-to-end developer journeys. | Add developer-journey smoke docs/tests or explicitly defer these from the five-persona score. |
| T17-7 | Resolved | Playwright webServer startup could fail before product assertions because `tsx` and esbuild binaries were misaligned. | Old focused marketplace Playwright runs on ports 34201 and 34202 failed before tests with `Host version "0.28.0" does not match binary version "0.21.5"`. Current package tree pins direct `tsx@4.21.0`, dedupes to `esbuild@0.27.7`, passes `npx tsx -e`, and the focused marketplace Playwright slice passes 4/4 on port `34203`. | Keep the direct `tsx` pin or equivalent matching host/binary invariant. |

## Persona Impact

| Persona | Current T17 cap | Why |
|---|---:|---|
| Engineer / power user | 8/10 | Package-local lanes and a stable server release command now work, but warning hygiene and developer recovery journeys remain open. |
| Team admin / security reviewer | 8/10 | Server, worker, compliance, vault, and backup APIs pass tests, but noisy failure-looking logs and unclear command lanes reduce release confidence. |
| Solo founder | 8/10 | Less direct, but the visible product depends on these APIs and background jobs. |
| Researcher | 8/10 | Memory substrate tests are broad, but embedding-noise and command-shape failures undercut provenance confidence. |
| Mobile executive | 8/10 | Indirect impact through stability and release confidence. |

## Acceptance For Closing T17

- Package-local scripts either pass or clearly delegate to the correct root/project-reference lane.
- Root verification discovers all intended package tests, or every intentional separate lane is documented.
- Full server tests and server performance tests have stable release semantics: default deterministic lane plus isolated perf/live-integration lanes where needed.
- Marketplace sync tests in the standard lane are hermetic and quiet, or are moved to a live-integration lane.
- Playwright `webServer` startup uses a matching `tsx`/esbuild host/binary pair and can start the sidecar before assertions. Current focused evidence passes 4/4 on port `34203`.
- Expected warning noise is suppressed, filtered, or explicitly summarized so real failures stand out.
- SDK/server/worker/WaggleDance/substrate developer journeys have happy-path and recovery/error-path evidence, or are explicitly deferred from the five-persona score.

## Packet Decision

Keep T17 as `Phase 2 Pending` / tooling-release-confidence gate. Package-local test-script failures, perf-lane separation, and standard-server marketplace leakage are fixed. Warning hygiene and developer journey evidence still block the final "complete UX, all parts functional, five judges at 9/10" claim unless the user explicitly defers developer API, background worker, and substrate verification from the score.

### 2026-07-10 follow-up: group execution recovery

The agent-group surface had a concrete end-user dead end that was not covered by the prior worker evidence: local `/api/agent-groups/:id/run` returned a synthetic job ID, while local `/api/jobs/:id` did not exist. The local sidecar now persists bounded in-memory job state, runs persona-backed groups through `SubagentOrchestrator`, reports worker progress/output, supports cancellation through the agent-loop abort signal, validates group members/strategies, and exposes local job status/cancel routes. The cloud route now queues the worker-supported `group` job shape instead of inserting an unsupported `group_execution` row. Focused route/orchestrator coverage passes 19/19; package builds, server/agent/shared typechecks, and the web production build pass.

This closes the named group-run recovery gap. T17 remains pending for the separate warning-hygiene and SDK/server consumer recovery journeys listed above.
