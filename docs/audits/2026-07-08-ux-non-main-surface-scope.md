# Non-Main UX Surface Scope

Status: analysis only. No product code was changed.

Purpose: the main audit already covers the installed cockpit experience in `apps/web`. This note prevents "complete UX" from silently excluding the public launch funnel, Browser Companion extension, Tauri desktop wrapper, installer/update path, active local service startup path, admin web surface, CLI launchers, marketplace CLI, memory MCP utilities, AI-tool hooks, developer APIs, background jobs, substrate package verification, deployment/ops configuration, CI, benchmarks, and judging artifacts.

## Scope Decision

The five-persona 9/10 judge gate should primarily score the installed product experience: `apps/web` rendered through the local service, because the requested personas are operating the product.

The final "complete UX" claim still needs one of these explicit decisions:

1. Fix and verify the non-main launch/desktop/utility/hook/developer/ops gates before final scoring.
2. Approve a written deferral that scopes the five-persona gate to the installed app only.

Without one of those decisions, public download, checkout, legal trust, browser capture, installer, tray, update, sidecar-startup, admin, CLI, MCP utility, hook lifecycle, SDK, server API, worker, substrate verification, deployment, CI, benchmark, and judging failures could remain outside the score while still affecting real users.

## Public Launch Funnel: `apps/www`

User jobs:

- Understand what Waggle is.
- Download the desktop app.
- Sign in or sign up.
- Start Team checkout.
- Recover from cancelled checkout.
- Read methodology, legal, privacy, cookies, and EU AI Act trust pages.
- Reach KVARK for Enterprise.

Current strengths:

- Homepage is structured as a coherent launch narrative: hero, problem, how it works, memory, proof, features, trust, personas, open source, pricing, final CTA.
- Landing page has a skip link, semantic sections, absolute nav anchors, mobile menu semantics, and OS-aware download CTA.
- Pricing is mostly aligned to Solo, Team, Enterprise.
- Historical Lighthouse note reports 96 performance, 96 accessibility, and 100 SEO on a local prod build.
- `BrandPersonasCard` has useful component coverage, including keyboard activation and image-failure fallback.

Current command evidence, 2026-07-08 continuation:

| Check | Result | Interpretation |
|---|---:|---|
| `npm run test -w apps/www` | Pass, 1 file / 10 tests | The existing component coverage is healthy, but still narrow. |
| `npm run build:www` | Pass | Next build succeeds and reports dynamic routes for account, Clerk auth, Stripe checkout, and Stripe webhook. |
| `npx tsc --noEmit --project apps/www/tsconfig.json` | Pass | Direct TypeScript check passes for the public site. |
| `Test-Path apps/www/dist`, `Test-Path apps/www/.next`, `Test-Path apps/www/out` | `False`, `True`, `False` | The build output is `.next`, not the `apps/www/dist` artifact uploaded by the current GitHub Pages workflow. |
| Env-shape check for Clerk/Stripe keys | Mixed | `apps/www/.env.local` has Clerk test keys that differ from the root Clerk pair, and a live-shaped Stripe secret. Values were not printed. |
| `next start` bound to `127.0.0.1` + bounded route/API smoke | Invalid harness / fail | Next middleware attempted to proxy to `localhost:<port>` and returned timeouts/500s. Re-running against `--hostname localhost` showed the core public routes can render, so the `127.0.0.1` result is a Windows host-binding trap, not by itself product behavior. |
| `next start` bound to `localhost` + status/browser smoke | Mixed | `/`, `/#pricing`, `/privacy`, `/terms`, `/cookies`, `/eu-ai-act`, `/sign-in`, `/sign-up`, `/docs/methodology`, and unauthenticated `/account` redirect render; `/pricing?checkout=cancelled` is 404; signed-out `Get Team` leaves a small inline `Sign in required` error; browser console/server log still show Clerk development-key and session-loop warnings. |
| Focused T13 continuation smoke | Mixed | Fresh localhost route/API smoke confirms core pages and signed-out GET checkout redirect work; `/pricing?checkout=cancelled` and `/methodology` return 404; signed-out POST checkout returns `401` with a `signInUrl` the pricing UI does not use. |
| Live canonical-domain smoke | Fail | Current external refresh on 2026-07-08 could not resolve `waggle-os.ai`; `nslookup waggle-os.ai` returned non-existent domain from the audit environment. |
| GitHub Releases latest target | Fail | The public download CTA points to GitHub Releases latest, but GitHub currently reports no releases for the repo; API refresh returned an empty releases list. |

Open UX risks:

| ID | Risk | Evidence | Why it matters |
|---|---|---|---|
| WWW-0 | The standard launch-funnel smoke is host-sensitive and Clerk-noisy. | Binding `next start` to `127.0.0.1` caused Next middleware proxy failures to `localhost:<port>` on Windows; binding to `localhost` rendered core routes, but the browser/server still emitted Clerk development-key and session-loop warnings. | A release gate needs a stable, documented smoke command and zero auth-loop noise before buyers or reviewers use the public site. |
| WWW-0A | The canonical public domain does not currently resolve. | Current external refresh could not resolve `waggle-os.ai`; the app metadata, sitemap, robots, and methodology page declare `https://waggle-os.ai` as canonical. | The acquisition, pricing, legal, auth, account, and download funnel is unreachable at the URL the app declares canonical. |
| WWW-1 | Signed-out Team checkout can dead-end as a JSON error. | `Pricing.tsx` calls `POST /api/stripe/checkout`; the route returns `401 { message: "Sign in required", signInUrl }`; the component only shows the message and ignores `signInUrl`. | A buyer clicking "Get Team" before signing in should be guided into sign-in/sign-up and then checkout, not shown an implementation-shaped error. |
| WWW-2 | Stripe cancel recovery points to a likely dead route. | Checkout route uses `cancel_url: ${origin}/pricing?checkout=cancelled`; the site has a pricing section on `/`, not an `app/pricing/page.tsx` route. | Cancelled checkout should return to pricing with clear recovery, not a 404 or unrelated page. |
| WWW-3 | GitHub Pages deployment workflow likely cannot publish this Next app as written. | `deploy-www.yml` uploads `apps/www/dist`; `npm run build:www` produced `.next`, not `dist` or `out`, and the app includes dynamic Clerk and Stripe API routes. | A strong local landing page still fails the launch funnel if the deploy target cannot serve it. |
| WWW-4 | Legal trust pages are visibly unfinished and contain stale tier copy. | Terms/privacy/cookies/EU AI Act pages say "Day-0 placeholder"; privacy says "upgrade to Pro or Teams"; launch-date/address placeholders remain. | Legal/trust copy is part of UX for founders, admins, and enterprise reviewers. |
| WWW-5 | Coverage is thin for funnel flows. | Only `BrandPersonasCard.test.tsx` was found under `apps/www/__tests__`; no route E2E, checkout recovery, account, mobile nav, or fresh Lighthouse evidence was collected in this packet. | One component test cannot justify a complete launch UX claim. |
| WWW-6 | Public download currently leads to no installable artifact. | `DownloadCTA` targets GitHub Releases latest, but the repository currently has no releases; OS detection can also label iPhone/iPad as macOS and unsupported desktops as Linux while public copy says Windows and macOS. | Download is the first conversion path for Solo founders and mobile evaluators; an empty target makes the product look unavailable. |

Recommended ticket: T13, Launch Funnel UX Gate. Focused supplement: `docs/audits/2026-07-08-launch-funnel-t13-analysis.md`.

Suggested acceptance:

- `apps/www` build/deploy target is valid for the actual app shape, or deployment is moved to an appropriate Next host.
- Canonical `https://waggle-os.ai/` resolves and serves the selected public-site deployment.
- Download CTA leads to valid Windows/macOS artifacts or a controlled download/status page; mobile and unsupported OS labels are honest.
- Local production route smoke uses the correct host binding and serves `/`, `/#pricing`, `/docs/methodology`, `/privacy`, `/terms`, `/cookies`, `/eu-ai-act`, `/sign-in`, `/sign-up`, unauthenticated `/account` redirect, and checkout recovery without 500s, timeouts, 404s, or Clerk redirect-loop spam.
- Homepage route smoke passes on desktop and mobile with no critical console errors.
- Mobile nav, download CTA, billing toggle, signed-out Team checkout, signed-in Team checkout stub/live lane, checkout cancel recovery, account redirect, sign-in, and sign-up are exercised.
- Legal pages have no placeholder launch dates/addresses and no active Pro copy except explicit legacy billing context.
- Fresh Lighthouse or equivalent accessibility/performance/SEO evidence is attached.

## Browser Companion Extension: `apps/browser-ext`

User jobs:

- Save selected text from any web page into Waggle memory.
- Save the current page into Waggle memory.
- See whether Waggle desktop is reachable.
- Understand which workspace or personal memory receives the save.
- Recover from CORS/sidecar disconnected states.

Current strengths:

- The folder is intentionally documented as "Waggle Companion", a Chrome MV3 extension.
- Manifest is simple and local-first: popup, background service worker, content script, context menu, active tab, storage.
- Popup has connected/disconnected status, workspace label, save-selection/save-page actions, and an Open Waggle button.
- Background script talks to the local sidecar; popup code uses `textContent` for workspace names rather than `innerHTML`.
- Server has dedicated `GET /api/browser-ext/session-token` and `GET /api/browser-ext/health` endpoints, plus CORS/config checks for extension IDs.

Current source evidence, 2026-07-08 continuation:

| Check | Result | Interpretation |
|---|---:|---|
| `Get-ChildItem apps/browser-ext -Recurse -File` | Pass | Extension files are present: `manifest.json`, `popup.html`, `popup.js`, `background.js`, `content.js`, `README.md`. |
| Source search for `browser-ext` and extension env vars | Pass | README, server route, CORS config, backend docs, and settings coverage card all reference the extension. |
| `packages/server/src/local/routes/browser-ext.ts` inspection | Pass | Token endpoint bootstraps allowlisted Browser Companion requests; health endpoint returns `{ ok, version, activeWorkspaceId, activeWorkspace }` with `activeWorkspace` kept for legacy extension builds; save flows reuse `/api/memory/frames`. |
| Extension JS syntax, manifest parse, and server typecheck | Pass | Root extension files parse and the server side of the contract typechecks. |
| Playwright disconnected-state smoke | Partial | Unpacked extension loads and disconnected popup renders; screenshot at `output/playwright/browser-companion-disconnected-state.png`. This does not prove toolbar-popup-over-page behavior or save success. |
| Secure-default loaded-extension save smoke | Pass with known gaps | `output/playwright/browser-companion-toolbar-3333/run-secure-default-live-smoke.mjs` proves content-script extraction, MV3 service-worker no-Origin handling, token bootstrap during save, background save through `chrome.runtime.sendMessage`, and `/api/memory/frames` imported-frame confirmation. `run-popup-button-click-live-smoke.mjs` proves popup Tab order, visible Save selection focus, Enter-to-save selection, Save page click, frame creation through the secure sidecar path with an active-tab shim, `/api/memory/search` `source: import`, rendered `/memory` visibility with the `imported` provenance chip when `WAGGLE_T19_WEB_URL` is supplied, and a restricted-page popup state with non-primary disabled styling plus normal-webpage recovery copy. `run-packaged-id-pairing-smoke.mjs` proves stable extension-ID sidecar pairing. `orchestrator-recall-hardening.test.ts` proves existing chat `auto_recall`/catch-up imported provenance. Native toolbar-bubble exposure, native context-menu click proof, signed release-package proof if scored, and any future scored recall result shape remain open. |

Open UX risks:

| ID | Risk | Evidence | Why it matters |
|---|---|---|---|
| EXT-1 | Browser Companion is user-facing and must stay in the judge/evidence packet. | `apps/browser-ext/README.md` presents it as a workflow surface for researcher/journalist/marketer/writer users. T19 now records loaded-extension and popup save evidence, but native toolbar/context proof remains open. | A complete UX claim should not omit a capture surface that feeds the memory moat. |
| EXT-2 | Connected/disconnected/CORS-denied states are only partly visually proved. | Disconnected and connected-tab screenshots exist; focused code maps setup denial to recovery copy. Live CORS-denied screenshot is still optional evidence. | The first user experience is likely "why is this not connected?" if the sidecar or extension ID is not configured. |
| EXT-3 | Save-to-memory success is end-to-end verified for the background path and direct popup keyboard/click path, but not the native toolbar bubble. | Secure-default smoke saves extracted selected text and confirms `/api/memory/frames`; popup smoke tabs through the action order, saves selection via Enter, clicks Save page, and confirms both frames. Playwright still cannot observe the native toolbar popup as a page. | The extension's core promise is a memory ingestion path, but final release evidence still needs native toolbar-bubble proof or a deliberate deferral. |
| EXT-4 | Popup accessibility and polish are partly fixed but not fully reviewed. | Toast now has `role="status"`/`aria-live`; restricted-page and setup errors are sticky; keyboard Tab order, focus ring, Enter-to-save behavior, and restricted-page disabled styling have live evidence. | A small popup can still fail status announcement if that behavior is scored without a screen-reader proof pass. |
| EXT-5 | Coverage Compass claimed browser extensions were covered before native toolbar/context behavior was proved. | `CoverageCompassCard.tsx` now marks Browser AI extensions as `partial` and names the popup/capture coverage plus the pending native entry points; secure save-flow smoke exists, but native toolbar-bubble and native context-menu evidence remain open. | Fixed 2026-07-10; keep the partial state until native entry-point proof or an explicit score deferral exists. |
| EXT-6 | Disconnected/restricted-page states needed stronger copy and accessibility. | T19 now has sticky setup/restricted recovery, explicit normal-webpage copy, non-primary disabled styling, and honest memory-destination copy. Live CORS-denied screenshot remains optional if scored. | First-run extension failure should feel recoverable and accessible, not like a dead popup. |

Recommended ticket: T19, Browser Companion Extension UX Gate.

Suggested acceptance:

- Load the unpacked extension in Chromium/Chrome with a fresh sidecar and extension origin allowlist.
- Verify popup connected and disconnected states.
- Verify save selected text and save whole page popup interactions show visible extension feedback and create Memory frames in Waggle; native toolbar-bubble proof can be manual if Playwright cannot expose it.
- Verify native context-menu save, or explicitly defer it. The handler itself is regression-covered.
- Verify CORS-denied recovery copy tells the user how to configure `WAGGLE_BROWSER_EXT_IDS` or the dev escape hatch.
- Verify status copy and screen-reader announcement behavior if scored separately; popup keyboard/focus basics now have live evidence.
- Verify `CoverageCompassCard` does not claim browser-extension coverage beyond current evidence.
- Add automated smoke evidence or explicitly defer the extension from the five-persona score.

## Desktop Wrapper, Installer, Tray, Update: `app/`

User jobs:

- Install the app.
- Launch the app and see the web cockpit with the local service ready.
- Close to tray and re-open.
- Use tray actions for open, pause agents, settings, about, and quit.
- Use global shortcut behavior.
- Recover if the sidecar is unhealthy or port 3333 is occupied.
- Receive updates when the update channel is intentionally supported.

Current strengths:

- Tauri config points the desktop binary at `apps/web/dist` and includes bundle resources, NSIS configuration, window sizing, CSP, and tray metadata.
- Release and PR workflows stage sidecar dependencies, native dependencies, and Node runtime before Tauri build.
- Static tests cover updater config, signing helpers, installer config helpers, runtime bundling helpers, and API-level startup/chat/workspace flows.
- `scripts/check-sidecar-resources.mjs` fails loudly if packaged sidecar runtime artifacts are missing.

Current command evidence, 2026-07-08 continuation:

| Check | Result | Interpretation |
|---|---:|---|
| `npx tsc --noEmit --project app/tsconfig.json` | Pass | Desktop wrapper TypeScript scripts/config compile. |
| `npx vitest run app/tests/auto-update.test.ts app/scripts/installer-config.test.ts app/scripts/signing-config.test.ts app/scripts/bundle-runtimes.test.ts` | Pass, 4 files / 85 tests | Static updater, installer, signing, and runtime-bundling helper checks are healthy. |
| `npx vitest run packages/server/tests/tauri-config.test.ts app/tests/auto-update.test.ts` | Pass, 2 files / 30 tests | Static Tauri config and update-emitter expectations are healthy. |
| `node scripts/check-sidecar-resources.mjs` | Pass | Staged Node runtime, native deps, and sidecar `node_modules` are present locally. |
| `cargo check --manifest-path app/src-tauri/Cargo.toml` | Pass | Tauri Rust shell compiles in dev profile. |
| `npm run test -- tauri-bindings.test.ts adapter.tauri-branch.test.ts --reporter=dot` from `apps/web` | Pass, 2 files / 19 tests | Web-side Tauri command bindings and adapter Tauri branch tests pass through the correct package-local command. |
| `npm run test -w apps/web -- src/lib/tauri-bindings.test.ts --reporter=dot` | Pass, 1 file / 15 tests | Focused desktop navigation binding test covers `/settings` allowlist and unsupported payload filtering. |
| `npx vitest run app/tests/e2e/startup.test.ts app/tests/e2e/chat.test.ts app/tests/e2e/workspaces.test.ts` | Pass, 3 files / 11 tests | Local service startup, health, settings persistence, chat SSE, workspace/session, and memory-scope API flows work in the Vitest harness. |

Native event consumer matrix:

| Native event / behavior | Source | Current React consumer evidence | UX reading |
|---|---|---|---|
| Tray icon click / Open Waggle | `tray.rs` handles show/focus directly | Native-handled; no React consumer needed | Source-wired, but still needs packaged smoke evidence. |
| Close window to tray | `lib.rs` prevents close and hides the window | Native-handled; no React consumer needed | Source-wired, but still needs target-OS smoke evidence. |
| `Ctrl+Shift+W` global shortcut | `lib.rs` toggles window visibility directly | Native-handled; no React consumer needed | Source-wired, but still needs target-OS smoke evidence. |
| Tray Settings | `tray.rs` emits `waggle://navigate` to `/settings` after show/focus | `App.tsx` mounts `TauriDesktopEventBridge`; `tauri-bindings.ts` accepts only `/settings` | Source-wired, but still needs packaged smoke evidence. |
| Pause Agents tray action | `tray.rs` | Menu item and emitter removed | Hidden until pause/resume has real product behavior. |
| About Waggle tray action | `tray.rs` | Menu item and `/about` emitter removed | Hidden until there is a real About destination. |
| Tray Quit | `tray.rs` calls `app.exit(0)` | Native-handled; no React consumer needed | Source-wired to Tauri exit cleanup, but still needs packaged smoke evidence. |
| `waggle://update-available` | `lib.rs` emit | 0 matching `apps/web/src` listeners; covered only as future-emitter static test | Update availability is not user-visible. |
| `waggle://service-status` | `service.rs` emit | 0 matching `apps/web/src` listeners | Failed/restarting service state may not be visible. |
| `waggle://service-restart-needed` | `service.rs` emit | 0 matching `apps/web/src` listeners | Restart-needed state may not guide the user. |

Open UX risks:

| ID | Risk | Evidence | Why it matters |
|---|---|---|---|
| DESK-1 | Update/service events still have emitters but no current frontend consumers. | Tray route false affordances are narrowed: Settings has a `/settings` bridge, Quit is native, and Pause/About are hidden. Remaining unconsumed events are `waggle://update-available`, `waggle://service-status`, and `waggle://service-restart-needed`. | Update availability and service recovery may not be visible enough in the installed app. |
| DESK-2 | Auto-update UX is intentionally disabled/unfinished for v1. | `auto-update.test.ts` says updater plugin config is intentionally disabled; `release.yml` says former update manifest published empty signatures; Rust still checks and emits `waggle://update-available` for future consumers. | Users need either a working update flow or no misleading update UX surface. |
| DESK-3 | Installed-app interaction evidence is missing. | Current app tests start the Fastify service through Vitest, inspect static config, and now pass sidecar resource preflight. Open/focus, close-to-tray, and `Ctrl+Shift+W` are source-wired natively, but this packet did not run a packaged Tauri app, tray menu, global hotkey, installer, or close-to-tray smoke. | API tests and source inspection do not prove install, launch, tray, window, or WebView recovery UX. |
| DESK-4 | Sidecar failure and port-conflict recovery are not proven visually. | `startService()` has port-availability errors and watchdog events, but no current packet evidence shows the user-facing UI for service failure/restart-needed states. | A failed local service is a first-run blocker; the app should tell the user what happened and how to recover. |
| DESK-5 | Signing/notarization and update-channel trust are release gates, not product-screen tests. | Code-signing docs still describe pilot self-sign vs public cert procurement; release workflow builds draft assets but does not prove trusted install/update UX in this audit packet. | Installer warnings and untrusted binaries are UX for real first-time users. |
| DESK-6 | Web-side Tauri binding tests are package-local, not root-discoverable. | Root Vitest excludes `apps/**`; the correct command from `apps/web` passes. | Final verification docs must use the right command, or root verification will look falsely missing. |

Recommended ticket: T14, Desktop Wrapper and Release UX Gate.

Suggested acceptance:

- Packaged app launches on a clean data dir and reaches a healthy Home or clear service-recovery screen.
- Tray open/settings/about/quit/pause actions are verified or disabled until wired.
- Close-to-tray and global shortcut behavior are verified on the target OS lane.
- Sidecar port-conflict and sidecar-crash recovery have user-facing evidence.
- Update UX is either wired end to end with signed updater artifacts or explicitly hidden/deferred.
- Installer/signing warnings are documented for the target release channel.

## Active Local Service Path

The active installed-app sidecar path is not `sidecar/src/main.ts`. The Tauri wrapper builds `packages/server/src/local/service.ts` into `app/src-tauri/resources/service.js` through `scripts/build-sidecar.mjs`, stages external dependencies with `scripts/stage-sidecar-deps.mjs`, and launches that service from `app/src-tauri/src/service.rs`.

Implication:

- Judge the `packages/server/src/local/service.ts` startup path for installed desktop UX.
- Treat the top-level `sidecar/` JSON-RPC code as legacy or separate tooling unless a current launch path imports it.

Open service UX requirements:

- Startup progress should be visible or the first rendered app should clearly recover while the service comes up.
- Port conflict should produce a user-facing recovery path.
- Pending data erasure should surface a receipt/instruction after restart.
- Health should distinguish `ok`, `degraded`, and `unavailable` in user language.

## Admin Web, CLI, Marketplace CLI, and MCP Utilities

User jobs:

- Use `packages/admin-web` to review team dashboard, analytics, members, capability policies, jobs, audit, and team settings.
- Use `packages/launcher` as the `npx waggle` entry point.
- Use `packages/cli` for command-line Waggle workflows.
- Use `packages/marketplace` CLI for package search, install, sync, scan, and audit jobs.
- Use `packages/memory-mcp`, `packages/hive-mind-mcp-server`, and `packages/hive-mind-cli` for memory/MCP setup, recall, harvest, maintenance, and machine-readable JSON output.

Dedicated supplement: `docs/audits/2026-07-08-admin-cli-utility-t15-analysis.md`.

Current command evidence, 2026-07-08 continuation:

| Check | Result | Interpretation |
|---|---:|---|
| Targeted root/package Vitest slices | Mixed | Admin-web, launcher package-local tests, `@waggle/cli` package-local tests, memory MCP package-local tests, hive-mind MCP, marketplace targeted tests, and hive-mind CLI package-local tests pass. Remaining mixed status is from rendered/admin and deeper state evidence, not this test command lane. |
| No-emit TypeScript | Pass | Admin web, Waggle CLI, marketplace, memory MCP, hive-mind MCP, and hive-mind CLI compile. `packages/launcher` has no local `tsconfig.json` and relies on `tsup`. |
| Package builds | Pass | Admin web, launcher, Waggle CLI, marketplace, memory MCP, hive-mind MCP, and hive-mind CLI build scripts completed. |
| Source help smokes | Pass | Launcher, Waggle CLI, hive-mind CLI, and marketplace help paths work through `tsx`. |
| Built help/runtime smokes | Mixed | Built marketplace help works with no DB side effect; built `@waggle/cli` help and bin-wrapper help work with no `.waggle` side effect; built launcher help works without a service banner or `.waggle` creation. |
| MCP protocol smoke | Improved mixed | Built hive-mind MCP server and built legacy `waggle-memory-mcp` both complete official MCP client handshakes and write-scope save/recall roundtrips from temp data dirs. Package-publish proof remains open. |
| Negative-path smokes | Improved mixed | Marketplace unknown commands now print help, exit 1, and avoid DB creation; hive-mind CLI sampled subcommand help now prints focused help and avoids `personal.mind` creation. Broader package/publish and every-subcommand sampling remain open. |

Open utility UX risks:

| ID | Risk | Evidence | Why it matters |
|---|---|---|---|
| UTIL-1 | Admin web is a separate Vite UI with shallow rendered UX evidence. | `packages/admin-web/src/App.tsx` uses its own inline-styled sidebar, token/slug setup, and pages. Component tests pass but emit repeated `act(...)` warnings; no current screenshot, mobile, keyboard, or visual-guideline evidence is attached. | Team admins can hit this outside the cockpit; it needs either a judge pass or explicit deferral. |
| UTIL-2 | Built/published-style CLI/MCP entries are locally healthier but still not publish-proved. | Built marketplace help/invalid-command paths, built launcher help, built `@waggle/cli` help, built legacy `waggle-memory-mcp` read/write handshakes, and built hive-mind MCP write roundtrip are locally fixed; clean npm tarball/`npx` invocation remains unproved for the locally fixed CLIs/MCP packages. | A source-mode dev smoke can pass while the command a user installs or runs via `npx` is unusable. |
| UTIL-3 | Hive-mind CLI tests are present outside the root Vitest include pattern, with a package-owned test lane now added. | Root-focused commands against `packages/hive-mind-cli/src/*.test.ts` returned "No test files found"; `npm run test --workspace @waggle/hive-mind-cli -- --reporter=dot` now runs 5 files / 45 tests through the package-local config. | Root verification can still miss this package unless the documented package command is included. |
| UTIL-4 | Launcher CLI has clean help smoke and argument tests, but no no-emit TypeScript path and no full startup/failure UX smoke in this packet. | `packages/launcher` has `tsup.config.ts` but no `tsconfig.json`; launcher tests copy argument parsing shape and do not start the service; built help no longer logs service data-dir information before help. | First-run `npx waggle` is a real acquisition path; port conflict, service failure, and browser-open behavior need evidence or deferral. |
| UTIL-5 | Utility negative paths need broader sampling, though marketplace and sampled hive-mind CLI paths are now guarded. | Marketplace unknown commands now exit 1 without DB construction; sampled hive-mind CLI source/built subcommand help exits 0 without `personal.mind` creation. Other utility invalid-input, JSON, missing-env, and publish-style paths are not fully sampled. | Help and invalid-input paths should be safe, obvious, and scriptable. |
| UTIL-6 | CLI/MCP utility UX remains incomplete beyond the successful MCP protocol smokes. | Memory MCP and hive-mind MCP read/write protocol smokes pass, but JSON output, invalid args, missing env, bad data dir, auth failure states, and clean npm tarball behavior are not fully sampled. | Engineer and admin personas may rely on these tools when desktop UI is unavailable or during setup. |

Recommended ticket: T15, Admin and CLI Utility UX Gate.

Suggested acceptance:

- Admin web has screenshot/keyboard/mobile evidence or is explicitly deferred from the product UX score.
- Root test discovery includes or deliberately excludes hive-mind CLI colocated tests, with the passing package-local command kept in the verification lane.
- Launcher CLI has startup, invalid port, port conflict, `--no-open`, and failure copy evidence, or is deferred.
- Marketplace/memory MCP/hive-mind CLI commands have help, invalid input, JSON output, and missing-env/error-state evidence for the supported user paths.

## AI-Tool Hook Lifecycle: `packages/hive-mind-hooks-*` and Launcher

User jobs:

- Detect a supported AI tool.
- Install memory hooks without corrupting the tool's existing configuration.
- Verify installed hooks and understand failures.
- Uninstall hooks byte-identically or remove only Waggle-managed config.
- Understand that Claude Desktop is launchable but not hook-capable.
- Trust hook events to fail open when hive-mind CLI or the sidecar is unavailable.

Current command evidence, 2026-07-08 continuation:

| Check | Result | Interpretation |
|---|---:|---|
| Shared/agent/server T16 route-contract plus package-runtime slice | Pass, original 7 files / 96 tests plus focused registry slice 5 files / 108 tests | Manifest, third-party loader, hook-capable cohort, backend hook route, launch, process, detection route contracts, packed local hook-package lifecycle, and registry-aware third-party launch agree. |
| Launcher/prompt/adapter slice | Pass, 3 files / 28 tests | Launcher A/B toggle, one non-Claude hook action exposure, live output pane wiring, prompt args, and adapter methods pass. Node emits `punycode` warnings. |
| Root-run hook and shim package tests | Pass, 60 files / 573 tests, 1 skipped | Hook install/verify/uninstall, config merge/unmerge, adapters, lifecycle handlers, fail-open behavior, Codex Desktop parity, hook core, and shim core are well-covered at unit/package level. Output includes expected fail-open warnings and sidecar-unreachable signal drops. |
| Official hook/shim package typechecks | Pass, 8/8 | `hive-mind-shim-core`, `hive-mind-hooks-core`, and the six real hook packages pass their `tsc --build && tsc --noEmit -p tsconfig.test.json` lanes. |
| `npm run build --workspace @waggle/hive-mind-hooks-claude-desktop` | Pass | The intentional Claude Desktop no-bin stub still builds. |
| Compiled hook-bin help smokes | Pass, 6/6 | `claude-code-hooks`, `codex-hooks`, `codex-desktop-hooks`, `cursor-hooks`, `hermes-hooks`, and `openclaw-hooks` boot locally and show usage. This does not prove published `npx` resolution. |
| Rendered Launcher Browser smoke | Pass, partial | Fresh `npm run build` plus in-app Browser evidence under `output/playwright/launcher-t16-54147/` covers mixed installed/not-installed/hooks-active/running/Phase 4 states, prompt summary, install success, verify failure, and running output against a mock local API. |
| Rendered Launcher Playwright states | Pass, 1 file / 4 tests | Production-build Playwright coverage proves sidecar-offline Retry recovery, long hook stderr summarization with `More output`, hidden-line count, and recovery guidance, standard install output with `Changed file`, `Install pointer`, `Backup`, and `Recovery` labels, and non-built-in adapter launch-only/prompt behavior. |
| Package-local hook/shim `npm run test --workspace ...` scripts | Pass, 60 files / 574 tests | Hook core, all six hook-capable packages, and shim core now run package-local scripts against the intended root Vitest config/package paths. The shim lane also verifies the CLI ESM resolver fix for the MCP server entry. |
| Focused Launcher/web regressions | Pass, 5 files / 72 tests | Observed output closes after exit, covered install output shows Backup/Recovery labels without raw `stdout:`, Verify `[FAIL]` output becomes Check-failed/manual-approval rows without raw `[FAIL]`, uninstall output labels restore/cleanup rows without implying install state, long hook output is capped behind a `More output` summary, hook stdout/stderr details are preserved, structured hook failures are not replaced with `HTTP 400`, empty-output Verify failures show retry/uninstall/reinstall recovery copy, installed Claude Desktop is explicitly launch-only with no hook actions, and a detected launchable third-party adapter gets Launch plus prompt routing. |

Open hook UX risks:

| ID | Risk | Evidence | Why it matters |
|---|---|---|---|
| HOOK-1 | Real hook-management lifecycle is now proved for all six hook-capable route paths and rendered UI transitions; packaged-desktop evidence remains open. | The gated real-tool smoke now proves a detected OpenClaw CLI can render in Launcher and launch safely through `/api/tools/launch` with observed output, exit 0, and process cleanup. A broadened gated route smoke drives `/api/tools/hooks` through real install, verify, and uninstall for `claude-code`, `codex`, `codex-desktop`, `cursor`, `hermes`, and `openclaw` against an isolated `USERPROFILE/HOME`, proving config/pointer creation and cleanup without touching the user's real profile. A codified rendered Playwright spec covers all six hook-capable cards through install, verify, uninstall, and refreshed hooks-active UI transitions. No current evidence proves packaged desktop hook-status transitions. | Hook install modifies user tool config, so reversibility and status copy are trust-critical. |
| HOOK-2 | Rendered Launcher hook-management states are codified across the all-tool matrix; screenshot breadth remains partial. | The Browser smokes cover detected, not detected, hooks active, install success, verify failure, mocked uninstall cleanup, running output, and Phase 4/unsupported states. Codified Playwright coverage now covers sidecar offline Retry, long-stderr summarization, standard install changed-file/pointer/backup/recovery labels, all six hook-capable tool cards rendering install/verify/uninstall transitions, non-built-in adapter launch-only/prompt behavior, one real detected CLI observed-launch lifecycle, and real route lifecycle for all six hook-capable tools. | Engineer and Solo founder judges need to understand what happened without reading logs. |
| HOOK-3 | Focused fixed: Claude Desktop is a deliberate unsupported hook case. | `BUILTIN_TOOL_MANIFESTS` marks `claude-desktop` as non-hook-capable; `packages/hive-mind-hooks-claude-desktop` is a stub/no-bin package. The Launcher now shows installed Claude Desktop as `Launch only`, explains hooks are not supported yet, and hides hook actions; component coverage owns the regression and a Browser-rendered mocked state confirmed the visible layout. | Keep the copy in the rendered state matrix; no hook package/bin should be exposed for Claude Desktop until the MCP-bridge category ships. |
| HOOK-4 | Local fixed: production-shaped `npx` hook package resolution is proved for the local package closure. | `hook-packages-runtime.test.ts` packs and installs the local hook package closure into a clean temp project, then runs `npx --yes @waggle/hive-mind-hooks-<id> install/verify/uninstall` for all six hook-capable tools. Registry-only proof remains a publication/release check. | A user click in Launcher depends on `npx --yes @waggle/hive-mind-hooks-<id>`. |
| HOOK-5 | Rendered fixed; release residual: hook success/failure copy preserves stdout/stderr/structured-failure details, shows Backup/Recovery labels for covered install output, turns Verify `[FAIL]` output into Check-failed/manual-approval rows, labels uninstall restore/cleanup rows, caps long output behind `More output`, gives empty-output recovery copy, exposes offline retry, and has real route plus rendered lifecycle proof for all six hook-capable tools. | Component tests now prove install success shows a Backup label and backup path without raw `stdout:`, verify failure shows stderr even when the route returns a generic error, Verify check failure shows manual-approval detail without raw `[FAIL]`, uninstall output shows `Changed file`, `Restored from`, `Created file removed`, `Backup removed`, and `Pointer removed` without `Install pointer`, long stderr hides later noisy lines behind a count while preserving `Recovery`, and empty-output Verify failure shows retry/uninstall/reinstall guidance. Adapter tests now prove a structured hook failure with no stderr/error is not replaced with `HTTP 400`. Browser evidence shows mocked Codex Verify manual-approval and Uninstall cleanup results plus a real `/launcher` smoke renders `verify failed (exit 1)` with recovery guidance instead of `HTTP 400`. Playwright rendered evidence covers standard install changed-file/pointer/backup/recovery labels, sidecar-offline Retry, long-output summarization, all six hook-capable rendered install/verify/uninstall transitions, real OpenClaw observed launch/output/exit/process cleanup, and real route install/verify/uninstall for all six hook-capable tools against an isolated profile. | Users still need packaged desktop hook-status proof and quieter release output for config-editing flows. |
| HOOK-11 | Focused fixed: Windows hook route commands now resolve `npx` correctly. | The first gated route smoke reproduced `/api/tools/hooks` returning HTTP 400 with empty stdout/stderr because Windows `execFile('npx')` could not resolve the npm shim. `runHookCommand()` now prefers the `npx.cmd` beside `process.execPath`, and default exec capture uses the shared `.cmd` resolver. The broadened isolated route lifecycle now passes for all six hook-capable tools. | Keep the gated route smoke in the release lane. |
| HOOK-10 | Focused fixed: Windows npm shims can launch, and restricted Codex WindowsApps aliases show recovery instead of a failing launch path. | Detection now prefers spawnable Windows PATH hits such as `.cmd` over extensionless POSIX npm shims. Standard npm `.cmd` shims resolve to their Node module target so prompt args stay literal; unknown `.cmd`/`.bat` files use a quoted fallback. The real smoke passed against OpenClaw. Built detection now reports this host's Codex WindowsApps `codex.exe` as installed but `launchable: false` with recovery copy, and Launcher hides the Launch button for that state. | Windows users should not see a launchable tool that crashes the sidecar. Keep the regression and require a real PATH CLI or proven desktop bridge for future direct Codex launch. |
| HOOK-6 | Focused/rendered fixed for launchable third-party adapters. | Detection merges `~/.waggle/adapters/*.json`; `/api/tools/launch` now validates against the runtime registry and applies adapter prompt templates, while `/api/tools/hooks` stays built-in-only until a safe hook policy exists. Rendered Playwright coverage proves a non-built-in adapter shows launch-only/no-hook copy, routes the prompt, and sends the expected launch payload. | Advanced adapter users can launch a detected launchable adapter; third-party hook management remains intentionally disabled until a safe hook policy exists. |
| HOOK-7 | Standard output is noisy during successful hook tests. | Passing test output includes fail-open warnings, sidecar-unreachable signal drops, package logs, and server embedding warnings. | Noise can hide real failures and reduce confidence in release checks. |
| HOOK-8 | Local fixed: package-local hook test commands now run their intended lanes. | Package-local hook/shim `npm run test --workspace ...` scripts pass for hook core, all six hook-capable packages, and shim core. | Keep these scripts in the release lane; remaining package-local command-shape gaps are tracked under DEV-1. |
| HOOK-9 | Focused fixed: observed live output does not reconnect and replay after exit. | `streamToolOutput()` now closes its EventSource on a valid `exit` event. The focused web Launcher/adapter suite proves no reconnect/replay after exit. | Keep the regression; refresh rendered Browser evidence when the full Launcher state matrix is rerun. |

Recommended ticket: T16, AI-Tool Hook Lifecycle UX Gate.

Suggested acceptance:

- Rendered Launcher screenshots or Browser/Playwright evidence cover hook install/verify/uninstall states across all six hook-capable tools, duplicate-free running output, and unsupported Claude Desktop copy.
- Command-level lifecycle evidence covers all six hook-capable tools.
- Real detected CLI launch has at least one observed safe smoke; hook install/verify/uninstall has isolated route lifecycle evidence for all six hook-capable tools.
- Packaged desktop hook-status transitions are proved or explicitly deferred.
- Production-like `npx` or package-pack resolution is verified for every hook package Launcher can invoke.
- Third-party adapter launch has focused route/UI proof and rendered non-built-in adapter proof; third-party hook management stays out of scope until a safe hook policy exists.
- Hook test/log output is quiet enough that real failures stand out, or expected warning noise is explicitly filtered/documented.
- Typecheck/build commands for project-reference hook packages are documented and pass in the approved verification lane.

Focused supplement: `docs/audits/2026-07-08-ai-tool-hook-t16-analysis.md`.

## Developer APIs, Background Jobs, and Substrate Packages

Dedicated supplement: `docs/audits/2026-07-08-developer-substrate-t17-analysis.md`.

User jobs:

- Use `@waggle/sdk` to validate, install, and run skills/plugins.
- Rely on local server APIs for chat, workspaces, marketplace, billing, backup, compliance, hooks, and startup recovery.
- Trust background worker jobs for dispatch, chat handling, and job processing.
- Trust WaggleDance protocol behavior and signal handling.
- Trust memory substrate, wiki compiler, optimizer, and shared package behavior that powers the UI.
- Run documented package-local and root verification commands without false failures or hidden skipped tests.

Current command evidence, 2026-07-08 continuation:

| Check | Result | Interpretation |
|---|---:|---|
| `npx tsc --noEmit --project packages/<target>/tsconfig.json` for `agent`, `core`, `hive-mind-core`, `hive-mind-shim-core`, `hive-mind-wiki-compiler`, `optimizer`, `sdk`, `server`, `shared`, `waggle-dance`, `weaver`, `wiki-compiler`, and `worker` | Pass, 13/13 workspaces | Remaining developer/backend/substrate workspaces compile under direct no-emit TypeScript. |
| `npm run test -w @waggle/agent` | Pass, 194 files / 3079 tests | Agent runtime, connectors, tool launcher, orchestration, memory recall, personas, security, and workflow behavior are broadly covered. |
| `npm run test -w @waggle/core -- --reporter=dot` | Pass, 19 files / 295 tests | Core config, cron/file stores, compliance, vault-adjacent helpers, and quota behavior pass; output includes embedding provider probing noise. |
| `npm run test -w @waggle/optimizer -- --reporter=dot` and `npm run test -w @waggle/weaver -- --reporter=dot` | Pass, 4 files / 52 tests | Optimizer and Weaver unit behavior pass through package scripts. |
| `npx vitest run packages/hive-mind-core/tests packages/hive-mind-shim-core/tests packages/wiki-compiler/tests --config vitest.config.ts --reporter=dot` | Pass, 71 files / 875 tests | Memory substrate, shim core, and wiki compiler tests pass through the root runner. |
| `npx vitest run packages/sdk/tests --config vitest.config.ts --reporter=dot` | Pass, 5 files / 88 tests | SDK behavior tests pass through the root runner. |
| `npx vitest run packages/shared/tests packages/waggle-dance/tests packages/worker/tests packages/hive-mind-wiki-compiler/src --config vitest.config.ts --reporter=dot` | Pass, 12 files / 128 tests | Shared contracts, WaggleDance protocol, worker jobs, and hive-mind wiki compiler tests pass through the root runner. |
| `npx vitest run packages/server/tests --config vitest.config.ts --reporter=dot` | Pass, 184 files passed / 1 skipped; 2117 tests passed / 1 skipped | Current full server run passed, but took 98.34s and emitted very large marketplace/embedding/startup logs. Earlier packet evidence saw one performance-budget failure under full-suite load. |
| `npx vitest run packages/server/tests/performance/benchmarks.test.ts --config vitest.config.ts --reporter=default` | Pass, 13 tests | The same benchmark passes in isolation, so the risk is full-suite stability/contention and audit determinism, not a consistently broken endpoint. |
| `npm run test -w @waggle/hive-mind-core` and `@waggle/wiki-compiler` | Fail | Package-local Vitest tries to load `vitest.setup.ts` relative to the package cwd; root-run tests pass. `@waggle/hive-mind-shim-core` now passes package-local tests. |
| `npm run test -w @waggle/sdk` | Fail | Workspace-local Vitest resolves into `packages/sdk/node_modules` and cannot find `convert-source-map`; root-run SDK tests pass. |

Open developer/substrate UX risks:

| ID | Risk | Evidence | Why it matters |
|---|---|---|---|
| DEV-1 | Several package-local `npm test` scripts fail even when the same tests pass from the root runner. | `hive-mind-core` and `wiki-compiler` fail on missing package-local `vitest.setup.ts`; SDK fails on missing local `convert-source-map`. `hive-mind-shim-core` is now fixed. | Engineers following package scripts hit false failures, slowing fixes and reducing trust in the verification lane. |
| DEV-2 | The full server route suite is green in the current run but not release-clean. | Current full server run passed, but took 98.34s and emitted very large logs; earlier packet evidence saw one perf-budget failure at 841ms vs 500ms while isolated benchmark passed. | A release-quality UX gate needs deterministic, quiet command evidence with perf checks in a stable lane. |
| DEV-2a | Marketplace sync behavior leaks into the normal server lane. | `marketplace-sync.test.ts` logs many source sync attempts, add counts, and error counts during the full server run. | The default release lane should be hermetic and quiet; live/external catalog behavior belongs in a named integration lane. |
| DEV-3 | Server and substrate verification output is very noisy. | Passing runs emit repeated embedding fallback warnings, marketplace sync logs, sidecar-unreachable-style warnings, and route startup logs. | Noise makes real failures harder to spot and weakens confidence in "all tested." |
| DEV-4 | Developer-facing SDK/server/worker happy paths are tested, but user-facing recovery/error copy is not fully sampled. | Unit/API tests pass; no current packet evidence covers SDK docs/examples, server API consumer ergonomics, worker job failure UI copy, or bad config paths as a coherent user journey. | Engineer and admin personas depend on these APIs when integrating, debugging, or recovering from failed jobs. |

Recommended ticket: T17, Developer API, Background Worker, and Substrate Verification UX Gate.

Suggested acceptance:

- Package-local scripts either pass or clearly delegate to the correct root/project-reference verification command.
- Root verification discovers all intended package tests or explicitly documents separate lanes.
- Full server route/performance gate is deterministic, with realistic budgets or isolated perf lanes.
- Noisy logs are reduced, filtered, or documented so real failures stand out.
- SDK/server/worker developer journeys have happy-path and error-path evidence, or are explicitly deferred from the five-persona score.

## Ops, Deployment, CI, Benchmarks, and Judging

Dedicated supplement: `docs/audits/2026-07-08-ops-deploy-ci-judging-t18-analysis.md`.

User jobs:

- Release reviewers trust GitHub Actions, Docker, Render, and local Compose as honest shipping gates.
- Operators can validate deployment configuration without leaking local secrets into logs.
- Hosted deploy target is coherent: local sidecar demo versus team Postgres server is an explicit decision.
- Infra-dependent suites have a known, runnable lane.
- Benchmark and judge harnesses used for product claims compile and test through documented commands.
- Historical judging screenshots/reports are not mistaken for current five-persona score evidence.

Current command evidence, 2026-07-08 continuation:

| Check | Result | Interpretation |
|---|---:|---|
| YAML parse for `docker-compose.yml`, `docker-compose.production.yml`, `render.yaml`, `litellm-config.yaml`, and all 7 `.github/workflows/*.yml` | Pass | The deployment, LiteLLM, and workflow YAML files are syntactically valid. |
| `docker --version` | Pass | Docker is available in this environment for config-level checks. |
| `docker compose ps --format json` | Fail | Docker CLI is installed, but the Docker Desktop Linux engine pipe is not reachable, so live Compose services and `npm run test:infra` could not be run here. |
| `docker compose -f docker-compose.yml config` and `docker compose -f docker-compose.production.yml config` | Pass with secret-log caveat | Compose can expand both files, but raw expansion reads local env values and can print secret values. Use `--no-interpolate` or a sanitized env for shareable logs. |
| `docker compose -f docker-compose*.yml config --no-interpolate` targeted scan | Pass | The non-interpolated command is safer for evidence because it keeps variable references instead of local secret values. |
| `git ls-files` / `git check-ignore` for `.env`, `env.local`, `AI API KEYS.txt`, and `apps/www/.env.local` | Pass for tracking hygiene | Only `.env.example` files are tracked; local secret-bearing files checked here are ignored. |
| `npx tsc --noEmit --project benchmarks/harness/tsconfig.json` | Pass | Benchmark harness TypeScript compiles. |
| `npm run test --prefix benchmarks/harness` | Fail | Package-local Vitest tries to load `benchmarks/harness/vitest.setup.ts`; root-run tests pass. |
| `npx vitest run benchmarks/harness/tests --config vitest.config.ts --reporter=dot` | Pass, 29 files / 325 tests | Benchmark harness unit/smoke/stats/judge tests pass through the root runner, with noisy turn/bench logs. |
| `judging/` inventory | Historical only | Current files are prior June 2026 rounds/screenshots, not the requested July five-persona scorecards. |

Open ops/judging risks:

| ID | Risk | Evidence | Why it matters |
|---|---|---|---|
| OPS-1 | Shareable Compose validation can leak local secrets if run in the obvious way. | `docker compose config` expands local ignored `.env` values; ignored-file checks show those values are not tracked, but command output can still expose them. | Release/ops evidence must be secret-safe; logs are part of the UX of operating the system. |
| OPS-2 | Render deployment target is still ambiguous. | `render.yaml` provisions Postgres and Redis but starts `packages/server/src/local/start.ts --skip-litellm`, the local SQLite sidecar path, not the team Postgres server. | A hosted deploy should either be a local-sidecar demo or a team server; mixed infra confuses operators and can hide broken team workflows. |
| OPS-3 | CI E2E remains advisory and infra tests are not in CI; local live infra could not be run in this environment. | `ci.yml` marks the E2E job `continue-on-error: true`; no workflow starts Postgres/Redis or runs `npm run test:infra`; `vitest.infra-suites.ts` lists 19 suites that require live infra; local `docker compose ps` failed because the Docker Desktop engine pipe was missing. | Green CI can still miss route, browser, and Postgres/Redis regressions, and this packet only proves config-level Docker validity. |
| OPS-4 | Production Compose uses development-style default credentials unless explicitly overridden. | `docker-compose.production.yml` has fallback values for Postgres and MinIO credentials. | Defaults are convenient locally, but production operators need fail-closed secret requirements or prominent warning evidence. |
| OPS-5 | Benchmark harness package-local test script fails even though root-run tests pass. | `npm run test --prefix benchmarks/harness` fails on missing local setup file; root-run benchmark tests pass. | Benchmark/judge credibility depends on commands that future reviewers can run without knowing hidden root-run shape. |
| OPS-6 | Existing `judging/` artifacts are stale for the current goal. | `judging/round2`, `round3`, `screenshots`, and crops are June 2026 artifacts; current scorecards are not filled. | The requested 9/10 result must be generated from current source after fixes, not inherited from older screenshots. |

Recommended ticket: T18, Ops, Deployment, CI, Benchmark, and Judging Evidence Gate.

Suggested acceptance:

- Secret-safe ops validation commands are documented and used for shareable evidence.
- Render target is decided and verified: hosted local-sidecar demo or team Postgres server.
- Docker/Compose production path is built or explicitly deferred, with fail-closed secret expectations.
- CI has a blocking smoke lane or the advisory E2E/infra gap is explicitly accepted before scoring.
- `npm run test:infra` has a documented Docker/migration lane and evidence, or is deferred.
- Benchmark harness package-local command shape is fixed or documented; root-run benchmark evidence remains green.
- Five-persona judging artifacts are generated from current post-fix source and replace historical screenshots for scoring.

## Phase Placement

Phase 1 remains unchanged and should stay focused on the installed app P0s:

- T1 auth/CSP/accountless console health.
- T2 mobile Settings.
- T3 Solo/Teams/Enterprise copy in active app UI.
- T4 shortcut and Workspace Switcher route contract.
- T5 visual snapshot triage.
- T11 route evidence for thin in-app routes.

T13, T14, T15, T16, T17, T18, and T19 are not part of Phase 1 unless a Phase 1 verification command directly forces a tiny supporting fix. They are final-product gates after the in-app blockers are cleared.

## Final Goal Rule

Do not claim "complete UX" until:

- T13, T14, T15, T16, T17, T18, and T19 are fixed and verified, or
- the user explicitly approves deferring launch/extension/desktop/utility/hook/developer/ops gates from the five-persona score.

The approval brief can still request Phase 1 implementation now, because Phase 1 removes known P0s in the main installed cockpit and is the fastest path to a credible judge dry run.
