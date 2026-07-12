# Desktop Wrapper T14 Analysis - 2026-07-08

Status: analysis supplement plus focused release-workflow, tray, packaged-startup, and sidecar hardening.

Purpose: deepen T14 evidence for the Tauri desktop wrapper, installer/update path, tray behavior, sidecar startup, and native-to-web UX bridge.

## Sources Inspected

- `app/src-tauri/tauri.conf.json`
- `app/src-tauri/capabilities/default.json`
- `app/src-tauri/src/lib.rs`
- `app/src-tauri/src/tray.rs`
- `app/src-tauri/src/service.rs`
- `app/src-tauri/Cargo.toml`
- `app/package.json`
- `app/tests/auto-update.test.ts`
- `app/scripts/*.test.ts`
- `apps/web/src/App.tsx`
- `apps/web/src/lib/tauri-bindings.ts`
- `apps/web/src/providers/ServiceProvider.tsx`
- `.github/workflows/release.yml`
- `scripts/check-sidecar-resources.mjs`
- `scripts/build-sidecar.mjs`
- `scripts/bundle-node.mjs`
- `scripts/bundle-native-deps.mjs`
- `scripts/stage-sidecar-deps.mjs`

Guideline baseline: Vercel Web Interface Guidelines, fetched 2026-07-08 from `https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md`.

## Commands Run

```powershell
npx tsc --noEmit --project app/tsconfig.json
npx vitest run app/tests/auto-update.test.ts app/scripts/signing-config.test.ts app/scripts/installer-config.test.ts app/scripts/bundle-runtimes.test.ts --reporter=dot
node scripts/check-sidecar-resources.mjs
cargo check --manifest-path app/src-tauri/Cargo.toml
npm run test -- tauri-bindings.test.ts adapter.tauri-branch.test.ts --reporter=dot
npx vitest run app/tests/e2e/startup.test.ts app/tests/e2e/chat.test.ts app/tests/e2e/workspaces.test.ts --reporter=dot
node -e "<parse tauri config/capability JSON files>"
app/src-tauri/resources/node.exe --version
npx vitest run packages/server/tests/tauri-config.test.ts --reporter=dot
npm run test -w apps/web -- src/lib/tauri-bindings.test.ts --reporter=dot
npx tsc --noEmit --project apps/web/tsconfig.json
npm run build:packages
npm run tauri:build:local
npx vitest run packages/server/tests/tauri-config.test.ts app/tests/auto-update.test.ts --reporter=dot
cargo test --manifest-path app/src-tauri/Cargo.toml service_script -- --nocapture
npx vitest run packages/server/tests/local/network-auth.test.ts --reporter=dot
node scripts/bundle-node.mjs
npx tauri build --debug --no-bundle
Start-Process app/src-tauri/target/debug/waggle.exe with isolated WAGGLE_DATA_DIR; poll http://127.0.0.1:3333/health
```

## Command Results

| Check | Result | UX meaning |
|---|---:|---|
| `app` TypeScript | Pass | Desktop build/signing/installer scripts typecheck. Refreshed in continuation run. |
| Tauri helper/static tests | Pass, 4 files / 85 tests | Auto-update config, signing config, installer config, and runtime-bundling helpers are covered. |
| Sidecar resource preflight | Pass | Local resources include Node runtime, native deps, and staged `node_modules`; `service.js` exists. Refreshed in continuation run. |
| Rust `cargo check` | Pass | Tauri Rust shell compiles in dev profile, including the tray native quit/settings changes. Refreshed after tray hardening. |
| Web-side Tauri binding tests from `apps/web` | Pass, focused binding 17/17 and prior binding/adapter bundle 19/19 | IPC command wrappers, adapter Tauri branches, the desktop navigation bridge, and native service/update notice mapping are covered when run through the web package. Output includes `punycode` deprecation warnings. Refreshed after service/update event surfacing. |
| Root Vitest command for web-side Tauri tests | Fails by command shape | Root Vitest excludes `apps/**`; this is a verification-documentation gap, not a product runtime failure. |
| App service E2E | Pass, 3 files / 11 tests | Service startup, health, settings persistence, chat SSE, workspace/session, and memory-scope API flows work in the Vitest harness. Output is noisy with mock-embedding and unknown-model cost warnings. |
| JSON parse | Pass | Tauri config, build/dev overrides, and capability JSON parse. |
| Bundled Node runtime | Pass | `app/src-tauri/resources/node.exe -p "process.version + ' abi=' + process.versions.modules"` returns `v22.22.2 abi=127` on this local build, matching the Node ABI that staged native deps. `bundle-node.mjs` now defaults to the current staging Node version, with `WAGGLE_BUNDLED_NODE_VERSION` available for an intentional pin. |
| Release workflow/tray/static desktop bridge guard | Pass, 1 file / 25 tests | `packages/server/tests/tauri-config.test.ts` now requires release builds to run `npm run build:packages` before each desktop sidecar bundle point, guards the tray menu against unsupported Pause/About/Quit-event actions, requires the web app to mount both desktop navigation and shell-event listeners, and guards updater-disabled startup plus Node ABI preflight behavior. |
| Web app TypeScript | Pass | `npm run typecheck:web` confirms the App-level desktop event bridge and Tauri binding types compile. |
| Updater-disabled static contract | Pass, 2 files / 35 tests | `tauri.conf.json` has updater config absent, updater capability is not exposed, and Rust no longer initializes `tauri_plugin_updater` while signed updater artifacts are missing. |
| Packaged debug binary build without installer | Pass | `npx tauri build --debug --no-bundle` builds `app/src-tauri/target/debug/waggle.exe` after sidecar/web resource preflight. |
| Full local debug bundle/MSI/NSIS | Pass locally | `npm run tauri:build:local --prefix app` completed and produced `Waggle_0.2.0_x64_en-US.msi` (150,135,110 bytes, 2026-07-10 18:59) and `Waggle_0.2.0_x64-setup.exe` (97,806,701 bytes, 2026-07-10 19:08). Both local debug artifacts are currently unsigned. |
| Packaged debug startup smoke | Pass | Launching `target/debug/waggle.exe` with an isolated `WAGGLE_DATA_DIR` reaches `/health` with `status: ok`, `mode: local`, `database.healthy: true`, `serviceHealth.watchdogRunning: true`; captured stderr contains no `CORS: origin not allowed`, `ERR_MODULE_NOT_FOUND`, or `NODE_MODULE_VERSION` errors. |

## Native Event Consumer Matrix

The tray-specific false affordances found in the first T14 pass are now narrowed:
Pause Agents and About Waggle are no longer offered from the tray, Settings has a
web bridge to the shipped `/settings` route, and Quit uses Tauri's native
`app.exit(0)` path. The updater is intentionally disabled until signed updater
artifacts exist, so update availability is future-ready in the web mapper but
not emitted by the native shell in the current build. Remaining active native
events are service-watchdog signals, not tray menu actions.

```text
waggle://navigate
waggle://service-restart-needed
waggle://service-status
```

| Native event / behavior | Source | Current consumer evidence | UX reading |
|---|---|---|---|
| Tray icon click / Open Waggle | `app/src-tauri/src/tray.rs` | Native show/focus; no React consumer needed | Source-wired, still needs packaged smoke. |
| Close window to tray | `app/src-tauri/src/lib.rs:135-140` | Native hide on close; no React consumer needed | Source-wired, still needs packaged smoke. |
| `Ctrl+Shift+W` global shortcut | `app/src-tauri/src/lib.rs` | Native toggle visibility; no React consumer needed | Source-wired, still needs target-OS smoke. |
| Tray Settings | `app/src-tauri/src/tray.rs`, `apps/web/src/App.tsx`, `apps/web/src/lib/tauri-bindings.ts` | Rust shows/focuses the main window, emits `waggle://navigate` to `/settings`, and the web app mounts `TauriDesktopEventBridge` to route only shipped desktop destinations. | Source-wired, still needs packaged smoke. |
| Tray Quit | `app/src-tauri/src/tray.rs` | Native `app.exit(0)` path; no React consumer needed. | Source-wired to Tauri `RunEvent::Exit`, still needs packaged smoke. |
| Pause Agents tray action | `app/src-tauri/src/tray.rs` | Menu item and emitter removed. | Hidden until there is real pause/resume behavior. |
| About Waggle tray action | `app/src-tauri/src/tray.rs`, `apps/web/src/App.tsx` | Menu item and `/about` emitter removed; no missing-route target remains. | Hidden until there is a real About destination. |
| `waggle://update-available` | `apps/web/src/lib/tauri-bindings.ts`, `apps/web/src/App.tsx` | `listenDesktopShellEvents()` keeps a future `Update available` toast mapper, but Rust updater registration/emission is disabled while updater signing is not provisioned. | Future-ready web mapping only; signed-update release-channel proof remains deferred. |
| `waggle://service-status` | `app/src-tauri/src/service.rs`, `apps/web/src/lib/tauri-bindings.ts`, `apps/web/src/App.tsx` | `restarting` maps to a reconnecting toast; `failed` maps to a destructive stopped-service recovery toast. | Source/unit-wired to visible UI, still needs packaged watchdog smoke. |
| `waggle://service-restart-needed` | `app/src-tauri/src/service.rs`, `apps/web/src/lib/tauri-bindings.ts`, `apps/web/src/App.tsx` | `listenDesktopShellEvents()` maps restart-needed events to a visible local-service restart toast. | Source/unit-wired to visible UI, still needs packaged watchdog smoke. |

Continuation refresh:

```text
rg -n -F "waggle://pause-agents" app/src-tauri apps/web/src -> no product emitter/listener
rg -n -F "waggle://navigate" app/src-tauri apps/web/src -> tray emitter + web bridge
rg -n -F "waggle://quit" app/src-tauri apps/web/src -> no product emitter/listener; tray uses app.exit(0)
rg -n -F "waggle://update-available" app/src-tauri apps/web/src -> web shell-event listener only; native updater emission disabled
rg -n -F "waggle://service-status" app/src-tauri apps/web/src -> Rust emitters + web shell-event listener
rg -n -F "waggle://service-restart-needed" app/src-tauri apps/web/src -> Rust emitter + web shell-event listener
```

Inference: Settings now has the frontend listener required for its delegated route
behavior, Quit no longer delegates to React, service-watchdog signals now surface
as visible toasts through the same desktop bridge, and update availability has a
future-ready web mapper while native updater emission remains disabled. The
packaged startup/smoke layer is now proven for app boot and sidecar health; tray,
close-to-tray, shortcut, and forced watchdog-restart interactions still need
targeted packaged interaction evidence.

## What Is Proven Now

- Static desktop TypeScript, Rust compilation, config JSON, resource staging, and service-level API flows are in good shape.
- The active installed sidecar path is `packages/server/src/local/service.ts` -> `scripts/build-sidecar.mjs` -> `app/src-tauri/resources/service.js` -> `app/src-tauri/src/service.rs`.
- `scripts/check-sidecar-resources.mjs` correctly prevents a raw Tauri build from silently omitting staged runtime resources.
- `ServiceProvider` has a generic boot/reconnect path with three retries and broadcasts connect-settled state; several routed surfaces show "service unreachable" states.
- Release workflow builds workspace packages, then stages Node, native deps, sidecar deps, and frontend before Tauri action builds Windows/macOS draft release artifacts.
- Native tray click/Open, close-to-tray, and the global shortcut are implemented in Rust rather than delegated to missing web listeners.
- Tray Settings is source-wired through a Tauri desktop navigation bridge to `/settings`; unsupported `/about` navigation is no longer emitted.
- Tray Quit is source-wired through Tauri `app.exit(0)`, so the existing `RunEvent::Exit` sidecar cleanup path is reachable from the menu.
- Pause Agents and About Waggle are no longer exposed as tray actions until there is real product behavior behind them.
- Native service-watchdog events now have React consumers, and the future update event mapper is ready: `waggle://update-available`, `waggle://service-status`, and `waggle://service-restart-needed` map to concise toasts, guarded by `tauri-bindings.test.ts` and the static desktop bridge test.
- Packaged debug startup now works locally: the Tauri shell creates the tray icon, starts the bundled sidecar from `target/debug/resources/service.js`, reaches `/health`, and reports healthy database plus running watchdog.
- Startup blockers found and fixed by packaged smoke: invalid `plugins.dialog` config, updater plugin initialization without updater config, debug-sidecar source path resolution, bundled Node/native ABI mismatch, and Tauri webview `http://tauri.localhost` CORS rejection.

## Still Not Proven

- Packaged debug app launch and sidecar health on Windows are proven locally; clean installed MSI/NSIS launch on Windows/macOS remains unproven.
- Published release artifact availability and signed-installer trust are still not proved; the local debug MSI/NSIS artifacts are present but `Get-AuthenticodeSignature` reports `NotSigned` for both.
- Actual packaged tray menu behavior for Open, Settings, and Quit.
- Close-to-tray behavior in the installed binary.
- `Ctrl+Shift+W` global shortcut behavior on target OS.
- Packaged-app proof that forced watchdog events produce the expected visible toasts.
- Port-conflict recovery in the installed app.
- Installer warning/trust experience for unsigned, self-signed, or properly signed channels.
- Auto-update user experience. The updater config, capability, and Rust runtime registration are intentionally disabled for v1 until signed updater artifacts exist; the web mapper remains future-ready.

## Line-Level Findings

| ID | Finding | Evidence | Correction |
|---|---|---|---|
| T14-1 | Service app-level events previously had no React consumers, and update mapping was not future-ready. | Current `tauri-bindings.ts` maps `waggle://update-available`, `waggle://service-status`, and `waggle://service-restart-needed` to toast notices, and `App.tsx` mounts `listenDesktopShellEvents()` through `TauriDesktopEventBridge`; guarded by focused binding tests and `tauri-config.test.ts`. Native update emission remains disabled until signed updater artifacts exist. | Focused fixed locally for service events and future update mapping; packaged smoke still needs to prove real service-watchdog events produce visible toasts. |
| T14-2 | About tray action previously targeted a route that does not exist. | Current `tray.rs` no longer includes `About Waggle` or `/about`; guarded by `tauri-config.test.ts`. | Focused fixed locally by removing the unsupported tray action. |
| T14-3 | Quit tray action previously delegated to an unconsumed web event. | Current `tray.rs` uses `app.exit(0)`; guarded by `tauri-config.test.ts` and `cargo check`. | Focused fixed locally; packaged smoke still needs to prove sidecar cleanup through the real menu. |
| T14-4 | Update UX is intentionally disabled and must not break startup. | `app/tests/auto-update.test.ts` and `packages/server/tests/tauri-config.test.ts` require updater config absent, updater capability not exposed, no `UpdaterExt` import, no updater plugin registration, and no startup `.updater()` check. Packaged smoke originally panicked on `plugins.updater: null`; the current binary no longer does. | Keep update UI hidden/deferred, or re-enable signed updater artifacts and visible update handling end to end. |
| T14-5 | Generic service reconnect exists, and native watchdog events now surface through the desktop bridge. | `ServiceProvider.tsx` still owns generic reconnect, while `listenDesktopShellEvents()` turns native watchdog status/restart events into visible recovery toasts. | Focused fixed locally; installed-app watchdog failure/restart proof remains. |
| T14-6 | Web-side Tauri tests are not discoverable from the root Vitest command. | Root command exits "No test files found" because root config excludes `apps/**`; running from `apps/web` passes 2 files / 19 tests. | Document the correct web-package command in the final verification lane or align root test discovery. |
| T14-7 | Installed-app UX still lacks real rendered evidence. | Current command evidence is source/static/API-level only. | Capture packaged app startup, tray, close-to-tray, shortcut, service recovery, and installer trust evidence before a full 9/10 claim. |
| T14-8 | Release packaging previously skipped the package build step used by the PR Tauri verification lane. | Historical `.github/workflows/release.yml` went from `npm install` directly to sidecar bundling; current workflow runs `npm run build:packages` before both Windows and macOS sidecar bundle steps, guarded by `tauri-config.test.ts`. | Focused fixed locally; full release closure still needs signed/public artifacts and installed-app smoke. |
| T14-9 | Settings tray action previously emitted an unconsumed route event. | Current `App.tsx` mounts `TauriDesktopEventBridge`; `tauri-bindings.ts` listens for `waggle://navigate` and accepts only `/settings`; focused web binding tests pass 15/15. | Focused fixed locally; packaged smoke still needs to prove the real tray menu reaches Settings. |
| T14-10 | Packaged startup previously panicked before the UI could load. | Direct debug-exe smoke exposed `plugins.dialog` object deserialization and updater `null` deserialization panics. Current config removes `plugins.dialog`; current Rust does not register updater while config is absent; static tests guard both. | Fixed for debug packaged startup; installer artifact smoke remains. |
| T14-11 | Packaged sidecar previously launched the dev `service.ts` path from the wrong root. | Smoke exposed `ERR_MODULE_NOT_FOUND` for `D:\packages\server\src\local\service.ts`. `service.rs` now prefers bundled `resources/service.js` when present, falls back to ancestor-searched dev source only when needed, and has Rust unit tests for both paths. | Fixed; packaged startup smoke reaches `/health`. |
| T14-12 | Bundled Node and staged native deps could silently have incompatible ABIs. | Smoke exposed `better_sqlite3.node` built for ABI 127 running under bundled Node ABI 115. `bundle-node.mjs` now defaults to the current staging Node version; `check-sidecar-resources.mjs` fails on ABI mismatch before packaging. | Fixed locally; CI remains aligned because CI stages under Node 20 unless intentionally changed. |
| T14-13 | Tauri webview health calls could be rejected by local CORS. | Packaged logs showed `CORS: origin not allowed` before allowing `http://tauri.localhost`; `network-auth.test.ts` now covers Tauri webview localhost origins. | Fixed; current packaged smoke has no CORS rejection in stderr. |

## Correction Decision

Do not treat all tray items equally:

1. Keep Rust-native handling for Open, close-to-tray, and `Ctrl+Shift+W`, then verify them in a packaged smoke.
2. Keep Settings as the only delegated tray route and route it through the tested desktop navigation bridge.
3. Keep Quit native through `app.exit(0)` so sidecar cleanup is reachable.
4. Keep Pause Agents and About Waggle hidden until they have real product behavior.
5. Keep service watchdog events surfaced through accessible toasts, keep update mapping future-ready while updater is disabled, then prove watchdog behavior in a packaged smoke.

## T14 Acceptance

T14 remains open until either:

1. Desktop wrapper/release UX is explicitly deferred from the five-persona score, or
2. Evidence proves all of the following:

- Packaged app launches and reaches Home or a clear service-recovery screen. Current debug smoke proves sidecar `/health`; rendered Home still needs packaged visual proof.
- Tray Open, Settings, and Quit actions are proved in a packaged smoke; Pause and About remain intentionally removed until implemented.
- Close-to-tray and `Ctrl+Shift+W` are verified on a target OS lane.
- Sidecar startup, port conflict, crash/restart, and restart-needed states are visible and recoverable.
- Installer/signing expectations are documented for the actual release channel.
- Update UX is either fully signed and user-visible or intentionally disabled without misleading UI.

## Phase Impact

This does not change Phase 1. T14 remains a Phase 2/Launch final-product gate after in-app P0 blockers are cleared, unless a Phase 1 verification command directly requires a small supporting fix.
