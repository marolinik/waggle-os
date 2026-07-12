# Source Inventory Consistency Audit - 2026-07-08

Status: analysis supplement. No product code was changed.

Purpose: compare the UX audit packet against the current source inventory so the final "complete UX" claim does not silently miss reachable routes, command destinations, apps, packages, or non-main user surfaces.

Deeper T19 follow-up: `docs/audits/2026-07-08-browser-companion-t19-analysis.md`.

## Commands

```powershell
Get-Content apps/web/src/App.tsx
Get-Content apps/web/src/lib/routes.ts
Get-Content apps/web/src/lib/dock-tiers.ts
Get-Content apps/web/src/lib/command-catalog.ts
Get-ChildItem apps -Directory
Get-ChildItem packages -Directory
Get-ChildItem apps/www/app -Recurse -File
Get-ChildItem apps/browser-ext -Recurse -File
rg -n "browser-ext|WAGGLE_BROWSER_EXT|WAGGLE_DEV_ALLOW_ANY_EXTENSION|chrome-extension" packages apps tests docs --glob '!docs/audits/2026-07-08-*.md'
node --check apps/browser-ext/popup.js
node --check apps/browser-ext/background.js
node --check apps/browser-ext/content.js
npx tsc --noEmit --project packages/server/tsconfig.json
Test-NetConnection 127.0.0.1 -Port 3333
```

## In-App Route Registry Check

Source: `apps/web/src/App.tsx`.

Result: every production shell route is represented in `docs/audits/2026-07-08-ux-route-scenario-manifest.md`.

Routes verified:

```text
/auth
/ -> /home
/home
/workspaces
/workspaces/:workspaceId/:tab?
/memory/:mindScope?
/artifacts
/files
/agents
/automations
/skills
/room
/waggle-dance
/approvals
/connectors
/mcps
/marketplace
/launcher
/team
/settings
/settings/vault
/settings/profile
/settings/mission-control
/settings/timeline
/settings/events
/settings/usage
/benchmarks
/platform
/payment-success
/payment-cancelled
*
```

Notes:

- `/motion-spec` is registered only under `import.meta.env.DEV`, outside the AppShell subtree. It is a development reference surface, not part of the production five-persona score, unless the user explicitly asks to judge developer-only visual tooling.
- The index route is represented in the manifest as `/ -> /home`; the automated string check did not count the separate index element because it has no `path` string.

## Dock And Command Destination Check

Sources:

- `apps/web/src/lib/routes.ts`
- `apps/web/src/lib/dock-tiers.ts`
- `apps/web/src/lib/command-catalog.ts`

Result: dock/app route destinations are represented in the manifest. Two command-query destinations need explicit evidence ownership because they are real user-facing command outcomes:

```text
apps/web/src/lib/command-catalog.ts:75 - /launcher?watch=1
apps/web/src/lib/command-catalog.ts:78 - /settings?tab=billing
```

Correction owner: T11 route evidence. These are not new top-level routes, but the final judge packet should prove the watch-mode Launcher state and billing-tab deep link, or explicitly defer them.

The same source check also reinforces T3:

```text
apps/web/src/lib/command-catalog.ts:113 - heading "Pinned - Pro" is active Command Center copy
apps/web/src/lib/dock-tiers.ts:81 - stale Pro comment in approvals copy context
```

## Apps Inventory

Current `apps/` inventory:

```text
apps/browser-ext - no package.json; Chrome MV3 extension
apps/web - package.json; main installed cockpit UI
apps/www - package.json; public launch funnel
```

Audit consequence:

- `apps/web` is the main installed product surface.
- `apps/www` is already T13.
- `apps/browser-ext` was underrepresented in the July UX packet and should be a separate non-main gate because it is a real user-facing capture surface.

## Package Inventory

Current `packages/` inventory contains 28 package workspaces:

```text
admin-web
agent
cli
core
hive-mind-cli
hive-mind-core
hive-mind-hooks-claude-code
hive-mind-hooks-claude-desktop
hive-mind-hooks-codex
hive-mind-hooks-codex-desktop
hive-mind-hooks-core
hive-mind-hooks-cursor
hive-mind-hooks-hermes
hive-mind-hooks-openclaw
hive-mind-mcp-server
hive-mind-shim-core
hive-mind-wiki-compiler
launcher
marketplace
memory-mcp
optimizer
sdk
server
shared
waggle-dance
weaver
wiki-compiler
worker
```

Audit consequence:

- The July packet's T15/T16/T17 grouping covers these packages by role, but future AGENTS/docs language that says "27 packages" is stale against current source.
- `hive-mind-hooks-core` is a package workspace and should stay in T16/T17 verification command scope, even though it is not a launchable AI-tool adapter.

## Public Site Inventory

Current `apps/www/app` route/API files:

```text
/
/account
/sign-in/[[...sign-in]]
/sign-up/[[...sign-up]]
/docs/methodology
/design/personas
/privacy
/terms
/cookies
/eu-ai-act
/api/stripe/checkout
/api/webhooks/stripe
```

Audit consequence:

- T13 already covers homepage, account/auth, methodology, legal pages, checkout, and webhook/deploy shape.
- `/design/personas` should be treated as a public/supporting route if public-site route evidence is expanded. It does not affect Phase 1.

## Browser Companion Inventory

Current files:

```text
apps/browser-ext/manifest.json
apps/browser-ext/popup.html
apps/browser-ext/popup.js
apps/browser-ext/background.js
apps/browser-ext/content.js
apps/browser-ext/README.md
```

Source contract:

- `apps/browser-ext/README.md` presents the surface as "Waggle Companion", a Chrome MV3 extension for saving pages/selections to workspace memory.
- `packages/server/src/local/routes/browser-ext.ts` exposes `GET /api/browser-ext/session-token` and `GET /api/browser-ext/health`.
- `packages/server/src/local/cors-config.ts` gates extension origins through `WAGGLE_BROWSER_EXT_IDS` or the dev-only `WAGGLE_DEV_ALLOW_ANY_EXTENSION=1`.
- `apps/browser-ext/background.js` calls `/api/browser-ext/session-token`, `/api/browser-ext/health`, and `/api/memory/frames`.

Current evidence gap:

- The T19 follow-up loaded the unpacked extension in Chromium and captured a disconnected popup screenshot at `output/playwright/browser-companion-disconnected-state.png`.
- JS syntax, manifest parse, and `packages/server` typecheck pass.
- The secure-default live smoke proves content-script extraction from a normal page, MV3 service-worker no-Origin header handling, token bootstrap during save, background save through `chrome.runtime.sendMessage`, and `/api/memory/frames` imported-frame confirmation. The popup keyboard/click smoke proves Tab order across popup actions, visible Save selection focus, Enter-to-save selection, Save page UI click, frame creation, `/api/memory/search` `source: import` provenance for both captures, and restricted-page disabled-state/recovery behavior.
- Remaining evidence gaps: native toolbar-bubble proof, native context-menu click flow, CORS-denied screenshot with a real extension origin, signed release-package proof if scored, and any future scored recall result shape. Stable packaged-ID sidecar pairing is now covered by `output/playwright/browser-companion-toolbar-3333/packaged-id-pairing-summary.json`, and existing chat `auto_recall`/catch-up imported provenance is covered by `packages/agent/tests/orchestrator-recall-hardening.test.ts`.

Recommended ticket: T19, Browser Companion Extension UX Gate.

Suggested acceptance:

- Load unpacked extension in Chromium with a fresh sidecar and extension origin allowlist.
- Verify connected and disconnected popup states.
- Verify save selected text and save whole page produce visible extension feedback and a memory frame in Waggle.
- Verify CORS-denied state tells the user how to start or configure Waggle.
- Verify popup accessibility basics beyond the proven keyboard/focus path if screen-reader announcement behavior enters scoring.
- Either add automated smoke evidence or explicitly defer the extension from the five-persona score.

## Phase Impact

This supplement does not change Phase 1. It adds T19 as a final-product gate after the in-app P0 blockers are cleared.
