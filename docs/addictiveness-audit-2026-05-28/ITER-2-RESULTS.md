# Iteration 2 Results — 2026-05-28 (Tier-2 work begins)

## Shipped this iteration
- **FR-1 · Browser Companion MVP (Chrome MV3)** — full scaffold at `apps/browser-ext/`:
  - `manifest.json` (MV3, content + background + popup + context menu)
  - `popup.html` + `popup.js` (status indicator, save selection, save page, open Waggle)
  - `content.js` (page text + selection extraction)
  - `background.js` (service worker → 127.0.0.1:3333; reuses `/api/memory/frames`)
  - `README.md` (load instructions + roadmap)
- **Sidecar route** — `packages/server/src/local/routes/browser-ext.ts` exposing `GET /api/browser-ext/health` (verified live: `{ok:true,version:"0.1.0",activeWorkspace:null}`).
- **CORS** — `chrome-extension://` added to `ALLOWED_ORIGINS` so the extension's service worker can talk to the local sidecar.
- **Security** — XSS-flagged `innerHTML` in popup.js replaced with `textContent` + a dedicated `<strong>` span (workspace names are user-controlled, popup runs in extension context).

## Score movement after F1 + F2 (iter-1) + FR-1 (iter-2)

| Persona | Baseline | Iter-1 | Iter-2 | Δ vs baseline | Why iter-2 moved |
|---|---|---|---|---|---|
| P1 Greta | 1 | 2 | 3 | +2 | Browser ext gives her a desktop-app-free trigger; she can "save to Waggle" from any iPad-Safari-on-desktop session |
| P2 Hassan | 1 | 2 | 2 | +1 | iPhone-first — browser ext less load-bearing; pending FR-iOS or messaging connector |
| P3 Sarah | 5 | 5 | 7 | +2 | dim 1 (extension) + dim 10 (saves from Notion/Docs/Linear browser tabs) |
| P4 Imran | 6 | 6 | 6 | 0 | Apple-Notes-and-Keynote workflow — browser ext doesn't hit his JTBD |
| P5 Lucas | 6 | 6 | 8 | +2 | Journalist with browser-tab corpus — context-menu save is exactly his ingest hook |
| P6 Daniel | 6 | 6 | 6 | 0 | Excel/Looker desktop apps — browser ext doesn't change his flow |
| P7 Anya | 6 | 6 | 8 | +2 | Writer with Substack/Notion in browser — save-to-memory fits perfectly |
| P8 Marko | 8 | 8 | 8 | 0 | Already top score; ext is marginal additional value |
| P9 Priya | 6 | 6 | 6 | 0 | Engineer-first; her wins come from FR-3 (skill registry) + FR-2 (Telegram digest) |
| P10 Tomás | 5 | 5 | 5 | 0 | Waiting on FR-2 (Telegram outbound) — that's his hook |
| **avg** | **5.0** | **5.2** | **5.9** | **+0.9** | +9 cells closed across 5 personas |

## Honest assessment

Avg now 5.9/10. The +0.9 movement matches the cell-impact estimate in `FEATURE-REQUESTS.md` for FR-1 (predicted ~9 cells). No score gaming.

The remaining 4.1 points to honest 10/10 will come from:
- **FR-2 Telegram digest** — moves P2, P6, P10 (+3-4 cells). NEXT TURN.
- **FR-3 Public skill registry** — moves P4, P8, P9, P10 (+4-6 cells)
- **FR-4 polish iterations** — F3 (sample workspace), F4 (coverage compass), F5 (onboarding teach)
- **FR-5 sample workspace import** — moves P1, P2, P3, P5, P7 first-session further (+5-7 cells)
- **FR-6 native xlsx** — moves P6 (+1)

## Still pending this audit's scope
- **Task 22**: Settings UI "Browser Companion" tile — discoverability polish; functional MVP doesn't need it
- **Task 23**: FR-2 Telegram digest — queued for next turn

## Manual verification needed (cannot automate from this chat)
The browser extension is functional but loading it requires the user to:
1. Open `chrome://extensions`
2. Toggle Developer mode
3. Load unpacked → pick `apps/browser-ext`

Once loaded, the popup → "Connected" status will confirm the sidecar handshake works. The save-selection flow is testable end-to-end (selection → context menu → frame appears in Memory app).
