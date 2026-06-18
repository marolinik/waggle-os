# Warm-Hive PR6c — All-workspaces (04) + Habit (15) — Build + Review + Live Smoke (2026-06-18)

> **Verdict: PASS.** C1 (AllWorkspacesApp) is built, reviewed (PASS, 2 LOW fixed), and live-verified. C2 (Habit streak) is verified correctly gated — no change is the honest outcome (no real streak field exists; flipping would fabricate). Gates green. **0 console errors.** Final sub-PR of the PR6 line.

## Scope (PR6 sub-PR c — the data surfaces)
- **C1 — All workspaces (04):** new `AllWorkspacesApp` — the full workspace shelf (Home stays the day view; this is "every workspace"). Grid (D14, Table = disabled "soon" toggle), name search, storage-type filter pills, per-card `WorkspaceActionsMenu`, click→open, empty state (D16, reuses `CreateWorkspaceDialog`). Replaces the `/workspaces`→`/home` redirect (D15) + adds a ⌘K Jump entry.
- **C2 — Habit (15):** backend-blocked — verification only (see below).

## C1 build + wiring
- **New:** `apps/web/src/components/os/apps/AllWorkspacesApp.tsx` (+ test, 8/8), `apps/web/src/routes/WorkspacesRoute.tsx`.
- **Wired (main):** routes barrel; `App.tsx` — replaced `<Route path="workspaces" element={<Navigate to="/home"/>}>` with `<WorkspacesRoute/>` (and dropped the now-unused `Navigate` import); `command-catalog.ts` — "All workspaces · every workspace · grid" Jump entry (LayoutGrid icon), ⌘K-only (D15).
- Reuses `useShell()`'s single `useWorkspaces` instance (no duplicate fetch), `WorkspaceActionsMenu`, `CreateWorkspaceDialog`, warm primitives.

## Gates
| Gate | Result |
|---|---|
| `tsc -p apps/web/tsconfig.app.json` | **0 errors** |
| FE vitest (AllWorkspacesApp + p7-b3-command-center) | **green** (AllWorkspacesApp 8/8) |
| eslint (changed files) | **0 errors** |

## Adversarial review — PASS (0 HIGH/MEDIUM; 2 LOW fixed)
- **No-fabrication: clean.** Every stat gated on a real optional `Workspace` field — `memoryCount`→`—` when absent (never a digit), `sessionCount`/`lastActive`/`storageType` badge omitted when absent. The design's "N to review" pending chip is correctly **omitted** (no `pendingCount` field exists — showing it would fabricate).
- **Correctness / design-fidelity / warm-token / a11y: clean.**
- **LOW-1 fixed (honesty):** the green dot was labeled "agent live" but derived from `health === 'healthy'` (no real per-workspace agent-activity field exists) → **relabeled to "healthy"** (honest meaning), variable renamed `isHealthy`.
- **LOW-2 fixed (a11y):** filter pills container `role="group"` → **`role="radiogroup"`** for the `aria-checked` radios.

## Live smoke (real sidecar :3333) — 0 console errors
- `/workspaces` **renders the shelf** (no longer redirects to Home): "Workspaces" heading + New-workspace, search, storage pills (All 4 / Virtual·Local·Team with live counts), "Table — soon" disabled (D14), 4 cards each with `WorkspaceActionsMenu` and **"—" for absent memoryCount (no fabrication)**. (`01`)
- **Search** "Research" → narrows to "1 WORKSPACE" (Research Hub). **Open** → navigates to `/workspaces/research-hub`. **⌘K** "All workspaces" present in the Jump group (Home → All workspaces → Chat), routes to `/workspaces`.

## C2 — Habit streak (15): verified correctly gated, no change (D17)
- `HomeCockpit.tsx`: `SHOW_STREAK = false`; the chip is `{SHOW_STREAK && <StreakChip/>}` with `TODO(backend): expose a real streak on HomeBriefing, then flip this to true`.
- `HomeBriefing` (types.ts) carries **no `streak` field** — the dependency is genuinely absent.
- Per D17, the honest state is to **leave it gated** (a hardcoded/invented streak violates the no-fabrication contract — the PR3 streak precedent). OvernightHero already correct. Depth/nudges deferred (D18). **No code change.**

## Open / not blocking
- Minor systemic cosmetic: the header breadcrumb label for the 3 ⌘K-only PR6 routes (benchmarks/platform/workspaces) shows a fuzzy `matchNavRoute` fallback (e.g. "Chat" on /workspaces) — these routes aren't in the nav `labelEntries`. Out of scope to fix here (shared AppShell label logic affecting all routes); documented for a polish follow-up.
- PR6 line is now complete (PR6a + PR6b + PR6c). Next per roadmap: PR7 (Auth/Billing), PR8 (landing).
