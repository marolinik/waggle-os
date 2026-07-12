# Waggle Companion · Chrome MV3 extension

The browser-side hook for Waggle OS. Lets the user save any page or selection
to their workspace memory from anywhere on the web, without leaving the tab.

This implements **FR-1** from the 2026-05-28 addictiveness audit — closes the
"external trigger surface" rubric gap (dim 1) for the non-coder personas
whose real workflow lives in browser tabs (researcher, journalist, marketer,
writer, retired teacher).

## What it does (v0.1.0)

- **Popup** — shows connection status + the active workspace memory is saving to + two buttons (save selection / save page).
- **Right-click context menu** — "Save to Waggle memory" appears on any text selection.
- **Reuses existing sidecar endpoints** — `/api/browser-ext/session-token` for local token bootstrap, `/api/browser-ext/health` for status, and `/api/memory/frames` for ingest. No new ingest logic.

## How to load (developer mode, local install)

1. Start the Waggle sidecar with one of these env vars set so its CORS layer accepts the dev extension origin:
   - **Quickest (dev only):** `WAGGLE_DEV_ALLOW_ANY_EXTENSION=1` — accepts any `chrome-extension://*` origin. Never set this in production.
   - **Production-shaped:** `WAGGLE_BROWSER_EXT_IDS=<your-extension-id>` (comma-separated for multiple IDs). Pin once you have the loaded extension's ID from `chrome://extensions`.
2. Open `chrome://extensions` in Chrome (or Edge, or any Chromium browser).
3. Toggle **Developer mode** on (top right).
4. Click **Load unpacked** and pick this folder (`apps/browser-ext`).
5. Copy the extension ID shown on the card.
6. Restart the sidecar with `WAGGLE_BROWSER_EXT_IDS=<that-id>` for the production-shaped path, or skip this if you used the dev escape hatch in step 1.
7. Pin the extension to the toolbar.
8. Open the popup — you should see a green dot + "Connected" + the memory destination.

Without either env var set, the sidecar rejects Browser Companion token bootstrap and the popup shows setup recovery copy. The extension stores the sidecar session token in `chrome.storage.local.sessionToken` after a successful bootstrap and sends it as a bearer token on save/status calls.

## What's deliberately NOT in v0.1.0

- **Side panel chat** — the Chrome side panel for asking questions about the current page. Designed for v0.2; would call `/api/chat`.
- **One-time-code pairing UX** — v0.1.0 bootstraps the local session token for an env-allowlisted extension ID. A more explicit desktop Settings pairing flow with a one-time code is future hardening.
- **Cross-browser packaging** — manifest is MV3, works on Chrome/Edge/Brave. Firefox needs a parallel manifest shape.
- **Article extraction** — page text capture is `document.body.innerText` capped at 12k chars. Reader-mode style extraction belongs server-side.
- **Icons** — using browser default. Wire in real icons when we have the brand asset.
- **Build step** — vanilla JS, no bundler. Simpler MVP; if we add typescript/react for the side panel later, add Vite then.

## Files

| File | Role |
|---|---|
| `manifest.json` | MV3 manifest — permissions, action, content script, background |
| `popup.html` | Popup UI shell (dark Hive theme inline) |
| `popup.js` | Popup logic — health refresh, selection read, save dispatch |
| `content.js` | Per-page content script — extracts selection + body text on demand |
| `background.js` | Service worker — fetch wrapper to the Waggle sidecar |

## Sidecar contract

- `GET /api/browser-ext/session-token` -> `{ token }` for allowlisted extension origins / MV3 service-worker requests.
- `GET /api/browser-ext/health` -> `{ ok: true, version, activeWorkspaceId, activeWorkspace }` (defined in `packages/server/src/local/routes/browser-ext.ts`; `activeWorkspace` is legacy compatibility)
- `POST /api/memory/frames` — existing endpoint, body `{ content, source: 'import', importance: 'normal' | 'low' }`. Dedup runs server-side.

## Verification

After loading the unpacked extension:
1. Click the extension icon on any web page → status should read "Connected" with a green dot.
2. Select some text → "Save selection to memory" enables → click it → toast reads "Saved to Waggle memory ✓".
3. Open the Waggle desktop → Memory app → confirm the new frame appears with source `import`.

## Roadmap (post-MVP)

- v0.2 — side panel with chat about the current page (calls `/api/chat`).
- v0.3 — pre-load Waggle's "Ask about this page" agent on important pages (configurable).
- v0.4 — Firefox MV2 parallel manifest.
- v0.5 — explicit auth pairing UX (one-time code from desktop Settings).
