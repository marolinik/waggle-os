# Browser Companion T19 Analysis - 2026-07-08

Status: implementation supplement. T19 is narrowed, not fully closed.

Purpose: deepen T19 evidence for `apps/browser-ext`, the Chrome MV3 Browser Companion that saves pages and selections into Waggle memory.

## Sources Inspected

- `apps/browser-ext/manifest.json`
- `apps/browser-ext/popup.html`
- `apps/browser-ext/popup.js`
- `apps/browser-ext/background.js`
- `apps/browser-ext/content.js`
- `apps/browser-ext/README.md`
- `packages/server/src/local/routes/browser-ext.ts`
- `packages/server/src/local/routes/memory.ts`
- `packages/server/src/local/cors-config.ts`
- `apps/web/src/components/os/settings/CoverageCompassCard.tsx`

Guideline baseline: Vercel Web Interface Guidelines, fetched 2026-07-08 from `https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md`.

## Commands Run

```powershell
node --check apps/browser-ext/popup.js
node --check apps/browser-ext/background.js
node --check apps/browser-ext/content.js
node -e "<parse manifest and print required permissions/hosts>"
npx tsc --noEmit --project packages/server/tsconfig.json
Test-NetConnection 127.0.0.1 -Port 3333
<one-off Playwright persistent Chromium load with --load-extension=apps/browser-ext>
<fresh sidecar on 127.0.0.1:3333; direct /api/browser-ext and /api/memory/frames save-flow checks>
<Playwright persistent Chromium unpacked extension background save with no allowlisted extension ID>
<Playwright persistent Chromium unpacked extension background save with WAGGLE_BROWSER_EXT_IDS set to the extension ID>
<Memory UI render check after Browser Companion save>
node output/playwright/browser-companion-toolbar-3333/run-toolbar-popup-smoke.mjs
npx tsx -e "<check WAGGLE_DEV_ALLOW_ANY_EXTENSION against concrete chrome-extension origin>"
npx vitest run packages/server/tests/local/browser-ext-auth.test.ts packages/server/tests/local/network-auth.test.ts tests/browser-companion-background.test.ts
npx eslint apps/browser-ext/background.js apps/browser-ext/popup.js apps/browser-ext/content.js packages/server/src/local/cors-config.ts packages/server/src/local/security-middleware.ts packages/server/src/local/routes/browser-ext.ts packages/server/tests/local/browser-ext-auth.test.ts packages/server/tests/local/network-auth.test.ts tests/browser-companion-background.test.ts --no-warn-ignored
git diff --check
node output/playwright/browser-companion-toolbar-3333/run-secure-default-live-smoke.mjs
WAGGLE_T19_WEB_URL=http://127.0.0.1:34613 node output/playwright/browser-companion-toolbar-3333/run-popup-button-click-live-smoke.mjs
npx tsx output/playwright/browser-companion-toolbar-3333/run-packaged-id-pairing-smoke.mjs
```

## Command Results

| Check | Result | UX meaning |
|---|---:|---|
| Extension JS syntax | Pass | `popup.js`, `background.js`, and `content.js` parse. |
| Manifest parse | Pass | MV3 manifest has `activeTab`, `storage`, `contextMenus`, localhost host permissions, `popup.html`, `background.js`, and one content script. |
| Server typecheck | Pass | `packages/server` typechecks with the browser extension route and CORS code. |
| `127.0.0.1:3333` listener | Not running | Disconnected popup state is the expected smoke state in this environment. |
| Playwright unpacked-extension load | Partial pass | Chromium loaded the extension and rendered `popup.html`; screenshot captured at `output/playwright/browser-companion-disconnected-state.png`. |
| Direct sidecar save contract | Pass | `POST /api/memory/frames?extract=false` with Browser Companion-shaped content saves frames, duplicate detection works, invalid source returns 400, and Memory UI renders the saved frames. |
| Unallowlisted unpacked extension background save | Fail | With default env, `chrome.runtime.sendMessage({ type: 'save-memory' })` returns `{ saved: false, error: 'HTTP 500' }`; server logs `CORS: origin not allowed`. |
| Prior allowlisted unpacked extension background save | Historical pass with caveat | Earlier artifact with `WAGGLE_BROWSER_EXT_IDS=ebcejdmgclnmaaghmhhcfelbpcmfebfm` returned `{ saved: true, frameId: 1 }`, duplicate returned `{ duplicate: true }`, and Memory UI rendered the imported frame; the current default-auth toolbar probe below shows CORS allowlisting alone is not sufficient under the bearer-token security model. |
| Historical search provenance mismatch | Fixed | Earlier `GET /api/memory/frames` showed `source: import` while `/api/memory/search` reported the same frame as `source: user_stated`. The route now rehydrates frame provenance after `MultiMind` replaces `source` with the mind label, and the popup button-click live smoke confirms both selection/page search results return `source: import`. |
| Toolbar popup open over normal page | Evidence blocker | The probe loaded the extension, selected text in a normal HTTP page, and `chrome.action.openPopup()` returned success, but Playwright never observed a `chrome-extension://<id>/popup.html` page. Real toolbar-click evidence still needs a different automation path or a manual/recorded protocol. |
| Pre-fix paired extension save under default auth | Fail | With `WAGGLE_BROWSER_EXT_IDS=<extension id>` and default auth, the content script extracted the selected text and page body, but extension-origin save returned `401 MISSING_TOKEN`; artifact: `output/playwright/browser-companion-toolbar-3333/toolbar-popup-summary-allowlisted-current-auth.json`. |
| Legacy localhost-trust extraction/save | Pass with caveat | With `WAGGLE_TRUST_LOCALHOST=1`, the same content-script extraction saved an imported frame with `source: import`; artifact: `output/playwright/browser-companion-toolbar-3333/toolbar-popup-summary-trust-localhost.json`. This proves extraction/save mechanics, not the secure default UX. |
| Pre-fix dev allow-any extension CORS check | Fail | `WAGGLE_DEV_ALLOW_ANY_EXTENSION=1` added `chrome-extension://` to allowed origins, but exact-match CORS returned `false` for a concrete `chrome-extension://ebcejdmgclnmaaghmhhcfelbpcmfebfm` origin. |
| Focused extension auth bootstrap regression tests | Pass | `packages/server/tests/local/browser-ext-auth.test.ts`, `packages/server/tests/local/network-auth.test.ts`, and `tests/browser-companion-background.test.ts` now pass 39/39, including the explicit `activeWorkspaceId` health contract. |
| Extension syntax after pairing patch | Pass | `node --check` passes for `background.js`, `popup.js`, and `content.js`. |
| Focused lint and diff hygiene | Pass | Focused ESLint is clean; `git diff --check` exits 0, with only existing CRLF warnings from Git. |
| Secure-default loaded-extension smoke | Pass with known gaps | Fresh sidecar, default bearer auth, `WAGGLE_BROWSER_EXT_IDS=ebcejdmgclnmaaghmhhcfelbpcmfebfm`, and unpacked extension pass `output/playwright/browser-companion-toolbar-3333/run-secure-default-live-smoke.mjs`. The extension service worker omits `Origin` and sends `sec-fetch-site: none`; `background.js` sends `X-Waggle-Extension-Id`, token bootstrap succeeds, the token is stored during save, content-script selection is saved through `chrome.runtime.sendMessage({ type: 'save-memory' })`, and `/api/memory/frames` returns the imported frame. Toolbar-popup page exposure remains a known gap. |
| Direct popup keyboard/click/restricted-state smoke | Pass with caveat | `output/playwright/browser-companion-toolbar-3333/run-popup-button-click-live-smoke.mjs` opens the popup document with a test shim for the target tab that Chrome normally supplies to a toolbar popup, tabs through Save selection, Save page, and Open Waggle, captures a visible focus ring, presses Enter on Save selection, clicks Save page, receives saved toasts, confirms both frames through `/api/memory/frames`, confirms `/api/memory/search` returns both captures as `source: import`, and, when `WAGGLE_T19_WEB_URL` is set, confirms the rendered `/memory` app shows both saved captures with the `imported` provenance chip and no Clerk/CSP/page errors. The same smoke now opens a restricted `chrome://` tab and proves the popup stays connected, labels the destination as `Personal memory`, disables both save buttons with non-primary styling, and shows the persistent "normal webpage" recovery copy. This proves popup keyboard/focus basics, disabled/restricted-page UX, popup save wiring, secure save effects, Memory search provenance, and rendered Memory UI visibility, not native toolbar-bubble exposure. |
| Stable packaged-ID pairing smoke | Pass with caveat | `output/playwright/browser-companion-toolbar-3333/run-packaged-id-pairing-smoke.mjs` creates a temporary extension copy with a generated manifest public key, derives the Chrome extension ID, starts an isolated sidecar with `WAGGLE_BROWSER_EXT_IDS=<derived-id>`, proves the loaded service worker URL uses the same stable ID, fetches `/api/browser-ext/session-token` from `chrome-extension://<id>`, saves selected page text through the background pairing path, stores the token in `chrome.storage.local`, confirms `/api/memory/frames`, and confirms `/api/memory/search` preserves `source: import`. This proves production-shaped stable-ID pairing semantics, not a signed Web Store or installer-distributed package. |
| Agent catch-up recall provenance regression | Pass | `packages/agent/tests/orchestrator-recall-hardening.test.ts` now proves an imported workspace memory returned through `Orchestrator.recallMemory('catch me up')` carries `recalledFrames[].source === 'import'` and does not degrade to `unknown`. This covers the existing chat `auto_recall` catch-up provenance shape; future recall result shapes still need their own evidence if added to judging. |

## 2026-07-09 Implementation Update

Implemented:

- Added `GET /api/browser-ext/session-token`, auth-exempt only for bootstrap and gated by a valid allowlisted Browser Companion extension origin.
- Fixed Browser Companion CORS matching so `WAGGLE_BROWSER_EXT_IDS=<id>` and `WAGGLE_DEV_ALLOW_ANY_EXTENSION=1` work with concrete `chrome-extension://<id>` origins.
- Fixed the MV3 service-worker no-`Origin` case: `background.js` now sends `X-Waggle-Extension-Id`, and the token route accepts it only with `sec-fetch-site: none` and an allowlisted extension ID.
- Updated `background.js` to fetch and store the session token before health/save requests, and retry once after a 401.
- Mapped missing/expired/not-allowlisted pairing failures to actionable extension copy instead of raw `HTTP 401` / `MISSING_TOKEN`.
- Added popup `role="status"` / `aria-live="polite"`, sticky recovery messages, and a visible restricted-page explanation when the content script cannot run.
- Made disabled primary actions visibly inactive, and changed the popup destination label to `Memory destination` with honest id/fallback copy instead of presenting an id as a workspace name.
- Added context-menu handler regression coverage for registration, selected-text save payload, and success badge feedback.
- Fixed `/api/memory/search` provenance for imported frames by rehydrating the DB frame source after `MultiMind` replaces `source` with the mind label.
- Added a stable packaged-ID pairing smoke that generates a temporary manifest key, derives the Chrome extension ID, starts the sidecar with that ID allowlisted, and proves token bootstrap/save/search provenance through the production-shaped extension-ID pairing path.
- Fixed agent catch-up recall provenance by selecting and carrying `frame.source` through `fetchRecentFrames()` and the workspace catch-up branch in `Orchestrator.recallMemory()`.

Focused verification:

- `npx vitest run packages/server/tests/local/browser-ext-auth.test.ts packages/server/tests/local/network-auth.test.ts tests/browser-companion-background.test.ts` -> pass, 39/39, including the explicit `activeWorkspaceId` health contract.
- `npx vitest run packages/server/tests/local-mode.test.ts` -> pass, 21/21, including the imported-frame search provenance regression.
- `node --check apps/browser-ext/background.js; node --check apps/browser-ext/popup.js; node --check apps/browser-ext/content.js` -> pass.
- `npx tsc --noEmit --project packages/server/tsconfig.json` -> pass.
- Focused ESLint for touched extension/server/test files -> pass.
- `git diff --check` -> pass.
- `node output/playwright/browser-companion-toolbar-3333/run-secure-default-live-smoke.mjs` -> pass for extension load, content extraction, token bootstrap during save, token storage, background save, and `/api/memory/frames` imported-frame confirmation.
- `node output/playwright/browser-companion-toolbar-3333/run-popup-button-click-live-smoke.mjs` -> pass for extension load, normal-page selection, popup Tab order (`save-selection`, `save-page`, `open-waggle`), visible Save selection focus ring, Enter-to-save selection, Save page click, saved toasts, token route, `/api/memory/frames` confirmation, and `/api/memory/search` `source: import` confirmation for both captures.
- `WAGGLE_T19_WEB_URL=http://127.0.0.1:34613 node output/playwright/browser-companion-toolbar-3333/run-popup-button-click-live-smoke.mjs` -> pass for secure popup keyboard Save selection and Save page click, `/api/memory/frames`, `/api/memory/search` `source: import`, rendered `/memory` confirmation that both markers and the `imported` provenance chip are visible with no Clerk/CSP/page errors, and a restricted-page popup state with both save buttons disabled, non-primary disabled styling, `Personal memory` destination copy, and persistent normal-webpage recovery text.
- `npx tsx output/playwright/browser-companion-toolbar-3333/run-packaged-id-pairing-smoke.mjs` -> pass for generated stable extension ID, isolated sidecar allowlisting, loaded service worker ID match, `chrome-extension://<id>` token bootstrap, content-script extraction, background save, token storage, `/api/memory/frames` confirmation, and `/api/memory/search` `source: import`.
- `npx vitest run packages/agent/tests/orchestrator-recall-hardening.test.ts` -> pass, 15/15, including imported workspace provenance in catch-up `recalledFrames`.

Remaining T19 scope:

- Native toolbar-bubble exposure proof while a normal page remains active; Playwright still does not expose the popup as a page after `chrome.action.openPopup()`. Direct popup-document keyboard/click behavior is now proven with an active-tab shim.
- Actual native context-menu click proof, or explicit deferral. The registration and click handler are now regression-covered.
- Any future recall result shape outside `/api/memory/search` and the existing chat `auto_recall`/catch-up `recalledFrames` path, if it is included in judge scoring.
- Signed Web Store/installer-distributed extension evidence, if release packaging itself enters the score. Stable extension-ID pairing against the sidecar is now proven.

Playwright disconnected-state data:

```json
{
  "status": "Not connected",
  "workspace": "-",
  "toast": "Start Waggle desktop on this machine, then re-open this popup.",
  "toastClass": "err",
  "saveSelectionDisabled": true,
  "savePageDisabled": true
}
```

Important limitation: opening `chrome-extension://<id>/popup.html` as a tab is not identical to clicking the toolbar popup over a normal web page. The new popup-button smoke patches only the active-tab lookup so the popup reads the target tab that the native toolbar bubble would receive from Chrome. This is strong evidence for popup button wiring and save effects, but still not proof that Playwright can observe the native toolbar bubble itself.

Additional live save-flow artifacts:

- `output/playwright/browser-companion-save-3333/summary.json`: direct sidecar health/save/duplicate/search checks and Memory UI screenshot after direct save.
- `output/playwright/browser-companion-save-3333/extension-background-summary.json`: unpacked extension background save without extension ID allowlist; save fails with `HTTP 500`.
- `output/playwright/browser-companion-save-3333/extension-background-allowlisted-summary.json`: unpacked extension background save with the detected extension ID allowlisted; save and duplicate pass.
- `output/playwright/browser-companion-save-3333/allowlisted-memory-ui-summary.json`: `GET /api/memory/frames`, `/api/memory/search`, and rendered Memory UI after the allowlisted extension save.
- `output/playwright/browser-companion-toolbar-3333/run-toolbar-popup-smoke.mjs`: one-off current toolbar/extraction probe script.
- `output/playwright/browser-companion-toolbar-3333/toolbar-popup-summary-allowlisted-current-auth.json`: pre-fix paired extension attempt; content extraction succeeds, save fails with `401 MISSING_TOKEN`.
- `output/playwright/browser-companion-toolbar-3333/toolbar-popup-summary-trust-localhost.json`: legacy-trust attempt; content extraction succeeds and saves an imported frame.
- `output/playwright/browser-companion-toolbar-3333/run-secure-default-live-smoke.mjs`: post-fix secure-default loaded-extension smoke.
- `output/playwright/browser-companion-toolbar-3333/secure-default-live-summary.json`: post-fix evidence; extension load, content extraction, MV3 no-Origin header probe, token bootstrap during save, background save, and `/api/memory/frames` imported-frame confirmation pass. Toolbar popup exposure and `/api/memory/search` are recorded as known gaps.
- `output/playwright/browser-companion-toolbar-3333/run-popup-button-click-live-smoke.mjs`: direct popup-document keyboard/click smoke with active-tab shim.
- `output/playwright/browser-companion-toolbar-3333/popup-button-click-live-summary.json`: post-fix evidence; Tab order reaches Save selection, Save page, and Open Waggle, Save selection has a visible focus ring and saves via Enter, Save page clicks through, both flows show saved toasts, create frames through the secure sidecar path, return from `/api/memory/search` as `source: import`, and, in the latest run with `WAGGLE_T19_WEB_URL`, render both captures in `/memory` with `imported` provenance and no Clerk/CSP/page errors. The same run proves a restricted-page popup state with both save buttons disabled, non-primary disabled styling, `Personal memory` destination copy, and persistent normal-webpage recovery text.
- `output/playwright/browser-companion-toolbar-3333/run-packaged-id-pairing-smoke.mjs`: generated-key stable extension-ID pairing smoke.
- `output/playwright/browser-companion-toolbar-3333/packaged-id-pairing-summary.json`: post-fix evidence; generated stable ID `bcbhhonimhnecnfoacokibkbedoigbpc`, service worker URL ID match, sidecar allowlisting, token bootstrap, background save, token storage, `/api/memory/frames`, and `/api/memory/search` `source: import` all pass.
- Screenshots:
  - `output/playwright/browser-companion-save-3333/extension-popup-connected-tab.png`
  - `output/playwright/browser-companion-save-3333/extension-popup-allowlisted-connected-tab.png`
  - `output/playwright/browser-companion-save-3333/memory-after-extension-save.png`
  - `output/playwright/browser-companion-save-3333/memory-after-allowlisted-extension-save.png`
  - `output/playwright/browser-companion-toolbar-3333/toolbar-active-page-selection.png`
  - `output/playwright/browser-companion-toolbar-3333/popup-button-click-keyboard-focus.png`
  - `output/playwright/browser-companion-toolbar-3333/popup-button-click-target-selection.png`
  - `output/playwright/browser-companion-toolbar-3333/popup-button-click-save-selection.png`
  - `output/playwright/browser-companion-toolbar-3333/popup-button-click-save-page.png`
  - `output/playwright/browser-companion-toolbar-3333/popup-button-click-memory-ui.png`
  - `output/playwright/browser-companion-toolbar-3333/popup-restricted-disabled-state.png`

## What Is Proven Now

- The extension files exist at `apps/browser-ext/*`; there is no `apps/browser-ext/src` directory.
- The manifest is structurally valid and requests the expected MV3 capabilities.
- The extension can be loaded unpacked by Chromium in this environment.
- The disconnected status can render with an error toast and disabled save buttons.
- The server-side route/CORS code typechecks.
- The direct write API exists at `POST /api/memory/frames` and accepts `content`, optional `workspace`/`workspaceId`, `importance`, and `source`; it sanitizes content, validates `source`, deduplicates, and stores a frame.
- The direct write API can persist Browser Companion-shaped selection/page content, and the Memory UI can render the result.
- The content script can extract selected text and page body from a normal HTTP page.
- Focused tests prove the secure default token-bootstrap path: an allowlisted extension origin can fetch the session token, `background.js` stores it, and subsequent save calls send `Authorization: Bearer <token>`.
- Chromium MV3 service-worker fetches to localhost omit `Origin` and send `sec-fetch-site: none`; this is now covered by tests and the live smoke.
- With an allowlisted extension ID and default auth, the loaded extension now extracts selected page content, bootstraps/stores a token during save, saves via `background.js`, and `/api/memory/frames` returns the imported frame.
- The popup Tab order reaches Save selection, Save page, and Open Waggle; Save selection has a visible focus ring and saves by keyboard Enter; Save page clicks through the popup UI, shows a saved toast, and creates a frame when the active tab is supplied by the live smoke shim.
- Restricted-page/content-script-unavailable state now keeps the popup connected, labels the destination honestly as `Personal memory`, disables both save buttons, uses non-primary disabled styling, and shows persistent recovery copy.
- Browser Companion selection/page captures now preserve `source: import` in `/api/memory/search`, matching `/api/memory/frames`.
- The rendered `/memory` app now shows the secure popup-saved selection/page captures and the `imported` provenance chip in the same live smoke run.
- The context-menu registration and selected-text handler are covered in `tests/browser-companion-background.test.ts`.
- Stable extension-ID pairing is proven with a temporary generated manifest key: the derived ID matches Chromium's loaded service worker ID, the sidecar accepts that ID via `WAGGLE_BROWSER_EXT_IDS`, the extension stores the token, saves selected content, and search provenance remains `source: import`.
- Agent catch-up `auto_recall` now preserves imported workspace provenance in `recalledFrames`, allowing the server chat stream to emit honest provenance instead of suppressing it as `unknown`.
- With an allowlisted extension ID but default auth, the pre-fix toolbar probe failed as `401 MISSING_TOKEN`; the code path is now fixed in focused server/background tests, the secure-default loaded-extension smoke, and the direct popup keyboard/click smoke.

## Still Not Proven

- Native toolbar-bubble behavior while a normal web page is the active tab. Playwright still needs a reliable toolbar-popup protocol or manual/recorded release evidence.
- Context-menu save via an actual browser context-menu click. Registration and handler behavior are covered, but the native browser menu item itself has not been clicked in an automated browser.
- Signed Web Store/installer-distributed extension behavior, if release packaging itself enters scoring. Stable extension-ID pairing is covered by `packaged-id-pairing-summary.json`.
- Live dev escape hatch behavior. Focused CORS tests cover concrete `chrome-extension://<id>` origins; the live smoke used the production-shaped extension-ID allowlist.
- CORS/auth-denied recovery UX screenshot with a real extension origin and sidecar, if this state enters judge scoring.
- Screen-reader announcement of status/toast changes.
- Packaged desktop/sidecar port behavior.

## Line-Level Findings

| ID | Finding | Evidence | Correction |
|---|---|---|---|
| T19-1 | Coverage Compass claimed browser extensions were `covered` without enough end-to-end behavior evidence. | `apps/web/src/components/os/settings/CoverageCompassCard.tsx:31` | Fixed 2026-07-10: Browser AI extensions now render as `partial` with explicit popup/capture coverage and native toolbar/context-menu work still pending; `CoverageCompassCard.test.tsx` guards the honest state. |
| T19-2 | Toast/status updates are visual only; no live region or alert role is present. | `apps/browser-ext/popup.html:69`, `apps/browser-ext/popup.html:84`, `apps/browser-ext/popup.js:19` | Fixed 2026-07-09: popup toast now has `role="status"` and `aria-live="polite"`. |
| T19-3 | Restricted-page/content-script-unavailable state disables save controls without a visible explanation. | `apps/browser-ext/popup.js:56` to `apps/browser-ext/popup.js:59` | Fixed 2026-07-09: content-script failures show persistent "normal webpage" recovery copy. |
| T19-4 | Disconnected recovery toast auto-clears after 3.5 seconds. | `apps/browser-ext/popup.js:23`, disconnected smoke | Fixed 2026-07-09: health/setup errors are sticky while the popup remains open. |
| T19-5 | Disabled primary action could still read as visually primary in the popup. | `apps/browser-ext/popup.html:46`, `apps/browser-ext/popup.html:73`, screenshot `output/playwright/browser-companion-disconnected-state.png`; latest evidence `output/playwright/browser-companion-toolbar-3333/popup-restricted-disabled-state.png` and `popup-button-click-live-summary.json` | Fixed 2026-07-09: disabled primary buttons use muted non-primary styling, opacity stays readable at `1`, and the restricted-page live smoke proves the style is not honey-primary. |
| T19-6 | Health endpoint returns an active workspace id, while popup labels it as the memory destination. | `packages/server/src/local/routes/browser-ext.ts`, `apps/browser-ext/popup.js`, `packages/server/tests/local/browser-ext-auth.test.ts`, `popup-button-click-live-summary.json` | Fixed 2026-07-09: health now exposes `activeWorkspaceId` explicitly while preserving legacy `activeWorkspace`, and the popup labels the value as `Workspace id: ...` or `Personal memory` instead of implying a friendly workspace name. |
| T19-7 | Full save result is now verified for the secure-default background path and direct popup keyboard/click path, including rendered Memory UI confirmation, but not for the native toolbar bubble itself. | `apps/browser-ext/background.js`, `packages/server/src/local/routes/memory.ts`, `output/playwright/browser-companion-toolbar-3333/secure-default-live-summary.json`, `output/playwright/browser-companion-toolbar-3333/popup-button-click-live-summary.json`, `output/playwright/browser-companion-toolbar-3333/popup-button-click-keyboard-focus.png`, `output/playwright/browser-companion-toolbar-3333/popup-button-click-memory-ui.png` | Add a reliable native toolbar-bubble protocol or manual release evidence for the browser-owned toolbar popup. |
| T19-8 | Unallowlisted extension origins previously failed as generic 500s, not a recoverable setup state. | `packages/server/src/local/index.ts:2197`, `packages/server/src/local/index.ts:2201`, `apps/browser-ext/background.js:45`, `output/playwright/browser-companion-save-3333/extension-background-summary.json` | Focused fixed 2026-07-09: token bootstrap returns an intentional setup denial and background maps it to sticky setup copy. Remaining: live unallowlisted-extension screenshot if this state enters judging. |
| T19-9 | Memory search provenance could disagree with direct frame provenance. | `output/playwright/browser-companion-save-3333/allowlisted-memory-ui-summary.json` showed `/api/memory/frames` as `import` while `/api/memory/search` reported `user_stated`; red regression reproduced the mismatch. | Fixed 2026-07-09: `/api/memory/search` rehydrates DB frame provenance, `local-mode.test.ts` covers imported-frame search provenance, and `popup-button-click-live-summary.json` confirms selection/page captures return as `source: import`. |
| T19-10 | Extension-ID CORS allowlisting was not enough under default bearer auth. | `packages/server/src/local/security-middleware.ts:312` to `packages/server/src/local/security-middleware.ts:387`; `apps/browser-ext/background.js:14` to `apps/browser-ext/background.js:15`; pre-fix artifact shows `401 MISSING_TOKEN`. | Fixed 2026-07-09 with `/api/browser-ext/session-token`, MV3 no-Origin header handling, background token storage, 39/39 focused tests, secure-default loaded-extension smoke, and direct popup keyboard/click smoke. Remaining: native toolbar-bubble exposure evidence. |
| T19-11 | README dev setup says `WAGGLE_DEV_ALLOW_ANY_EXTENSION=1` accepts any extension, but pre-fix CORS exact-match logic did not accept concrete extension origins. | `apps/browser-ext/README.md:19` to `apps/browser-ext/README.md:26`; `packages/server/src/local/cors-config.ts:38` to `packages/server/src/local/cors-config.ts:57`; pre-fix `npx tsx` check returned `concreteOriginAllowed: false`. | Fixed 2026-07-09 in `browserExtensionOriginAllowed()` and covered by focused CORS tests. |
| T19-12 | Toolbar-popup automation still cannot expose the native toolbar bubble over a normal page. | `output/playwright/browser-companion-toolbar-3333/toolbar-popup-summary-allowlisted-current-auth.json` shows `chrome.action.openPopup()` returned success but no popup page was exposed to Playwright; `popup-button-click-live-summary.json` proves the keyboard/click behavior through a direct popup-document fallback. | Add a reliable native toolbar-bubble test protocol, manual release checklist with screenshots/video, or an alternate browser automation route that keeps the normal page active without a shim. |
| T19-13 | Popup keyboard/focus basics lacked live evidence and an explicit focus ring. | `apps/browser-ext/popup.html`, `output/playwright/browser-companion-toolbar-3333/popup-button-click-keyboard-focus.png`, `output/playwright/browser-companion-toolbar-3333/popup-button-click-live-summary.json` | Fixed 2026-07-09: popup buttons now have a visible `:focus-visible` ring, and the live smoke proves Tab order, focused Save selection geometry/style, and Enter-to-save behavior. |
| T19-14 | Production-shaped packaged pairing lacked stable extension-ID evidence. | `apps/browser-ext/manifest.json` has no release key, and earlier smokes only used the unpacked extension ID from the source folder. | Fixed 2026-07-09: `run-packaged-id-pairing-smoke.mjs` generates a temporary manifest key, derives the stable Chrome extension ID, starts the sidecar with that ID allowlisted, verifies the loaded service worker ID matches, and proves token bootstrap/save/search provenance through the stable-ID path. |
| T19-15 | Agent catch-up recall could suppress provenance because workspace catch-up rows did not carry `source`, so imported captures surfaced as `unknown` in `recalledFrames`. | `packages/agent/src/orchestrator.ts`, `packages/agent/src/context-loader.ts`, `packages/server/src/local/routes/chat.ts`, red-to-green `packages/agent/tests/orchestrator-recall-hardening.test.ts` | Fixed 2026-07-09: catch-up recent/important frames now select and propagate `source`, and the regression proves imported workspace memories return `source: import` rather than `unknown`. |

## T19 Acceptance

T19 remains open until either:

1. Browser Companion is explicitly deferred from the five-persona score, or
2. Evidence proves all of the following:

- Unpacked or packaged extension loads.
- Connected and disconnected states render with persistent, accessible recovery.
- Save selection and save page succeed against a running sidecar under the default secure auth model, without relying on `WAGGLE_TRUST_LOCALHOST=1`.
- Extension pairing stores or supplies a valid bearer token, or a deliberate reviewed auth exemption exists for the extension route.
- Native context-menu save succeeds or is explicitly scoped out; registration and handler behavior are already covered.
- CORS/auth-denied, missing-token, and extension-ID-missing states are understandable and do not appear as generic `HTTP 500` or raw `MISSING_TOKEN`.
- Memory UI shows the captured frame with source/provenance that a Researcher can understand.
- Memory search preserves the same provenance shown by the frame list, and the existing chat `auto_recall`/catch-up `recalledFrames` path preserves imported workspace provenance; any future recall result shape must do the same if included in judging.
- Popup keyboard/focus basics pass; status/toast live-region markup exists, with screen-reader announcement proof still required if judged separately.

## Phase Impact

This does not change Phase 1. T19 remains a Phase 2/Launch final-product gate after in-app P0 blockers are cleared, unless the user explicitly asks to include Browser Companion work in Phase 1.
