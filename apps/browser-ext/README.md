# Waggle Companion - Chrome MV3 extension

Browser-side capture for Waggle OS. It saves a page selection or the current
page to personal Waggle memory without leaving the tab.

## What it does

- The popup shows connection status and the active memory destination.
- Save Selection and Save Page send personal imported-memory captures.
- The context menu can save selected text.
- Pairing is explicit: generate a one-time code in Waggle Settings, then enter
  it in the popup. The code is single-use and expires after ten minutes.

The popup never makes network requests. The MV3 background worker redeems the
code and stores only the resulting scoped credential in
`chrome.storage.local.companionToken`. Legacy `sessionToken` values are deleted
and never trusted. A rejected credential is removed; captures are never replayed
or automatically re-paired.

## Load locally

1. Start Waggle with an extension allowlist:
   - Development only: `WAGGLE_DEV_ALLOW_ANY_EXTENSION=1`
   - Production-shaped: `WAGGLE_BROWSER_EXT_IDS=<extension-id>`
2. Open `chrome://extensions`, enable Developer mode, and choose Load unpacked.
3. Select this `apps/browser-ext` directory.
4. If using the production-shaped allowlist, copy the installed extension ID
   into `WAGGLE_BROWSER_EXT_IDS` and restart Waggle.
5. In Waggle Settings -> Advanced, generate a Browser Companion code.
6. Enter that code in the extension popup.

Never enable `WAGGLE_DEV_ALLOW_ANY_EXTENSION` in a production build.

## Files

| File | Role |
|---|---|
| `manifest.json` | MV3 permissions, popup, content script, background worker |
| `popup.html` | Popup UI |
| `popup.js` | Pairing, health, and capture UI logic |
| `content.js` | On-demand selection and page extraction |
| `background.js` | Pairing and authenticated loopback requests |

## Sidecar contract

- `POST /api/browser-ext/pair` redeems an allowlisted extension's valid code.
- `GET /api/browser-ext/health` reports local connection and workspace state.
- `POST /api/memory/frames` accepts only `source: "import"`, personal scope,
  and normal/low importance for the paired credential.

The global desktop session token is never exposed to the extension.

## Manual smoke test

1. Open the popup before pairing: it must show the code form and disable
   authenticated capture.
2. Pair with a fresh Settings code: the popup must show Connected.
3. Save a selection and confirm a personal frame with source `import` appears.
4. Revoke in Settings: the next health/save request must require a new code and
   must not retry the previous capture.

## Deferred

- Side-panel chat about the current page.
- Firefox-specific packaging.
- Reader-mode extraction and branded icons.
