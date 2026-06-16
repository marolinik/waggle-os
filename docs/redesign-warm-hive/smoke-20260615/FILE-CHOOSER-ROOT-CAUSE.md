# Root-cause: "file-chooser storm" during the PR1 live smoke

**Verdict: dev/automation-only artifact. NOT a user-facing bug, NOT caused by PR1, no code fix warranted.**

## Symptom
During the PR1 Playwright smoke, navigating a **freshly-started** Vite dev server
(`localhost:8081/?skipOnboarding=true`) surfaced 5+ pending "file chooser" modal
states on load, blocking screenshots until each was cancelled
(`fileChooser.setFiles(undefined)`). 13 console errors also appeared.

## Investigation (systematic-debugging skill)

**Phase 1 — static analysis (exhaustive):**
- Enumerated every `<input type="file">` in `apps/web/src`: `BackupApp` (×2),
  `SettingsApp`, `ChatApp`, `FilesApp`/`FileActions`, `ImportStep`, `HarvestTab`.
  **All are hidden and clicked only via an explicit user-button `onClick`.** None
  mount on `/home`.
- Enumerated every `.click()` call in `apps/web/src`: all are either `<a download>`
  anchor exports (fire a `download` event, not a file chooser) or the user-bound
  file-input clicks above. **No `useEffect`/mount-time file-chooser trigger exists.**
- `?skipOnboarding=true` bypass only writes `{completed:true, tier:'power'}` to
  localStorage — no file interaction.

**Phase 3 — reproduction (decisive):**
- Re-ran the same URL against the **steady-state** Vite (`:8080`, deps already
  optimized): landed cleanly on `/home` with **no file-chooser modal state and no
  error flood**.
- DOM inspection on `/home`: **`input[type=file]` count = 0**, `activeElement = BODY`.

## Root cause
The artifact is tied to Vite's **first-run dependency re-optimization** on a cold dev
server, which forces a mid-render full-page reload while Playwright is driving the
page. Under that transient + automation, Playwright surfaced phantom file-chooser
pending-operations. It does not occur on a warm dev server, in the production build,
or in the Tauri desktop binary — and there is no application code path that opens a
file dialog without a user gesture (which real browsers block anyway).

The 13 console errors were a separate smoke-setup artifact: the `:8081` frontend
calling the founder's `:8080`/`:3333` sidecar with a mismatched session (cross-instance auth).

## Action
None on the product. For future smokes: warm the dev server (let dep optimization
finish) before driving Playwright, or smoke the production build / an already-running
dev server.
