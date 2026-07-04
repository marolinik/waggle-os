# UX Wave 2 Plan — 2026-07-04

Source audits: `ux-audit-2026-07-04.md` (F1–F12) + `ux-audit-2026-07-04-part2.md` (F13–F32).
Wave 1 (F1–F5, F8–F11) shipped in working tree; this wave targets the
trust-critical consistency cluster + part-1 leftovers.

## Clusters

### W2-A — Workspace context stability (F13, P1)
Visiting `/` or `/workspaces` must NEVER silently switch the active workspace.
Find what mutates active-workspace state on those routes (likely a "most recent"
auto-select effect in Home/grid mount) and make selection explicit-only (click).
Breadcrumb/switcher must agree with the workspace the user last chose.

### W2-B — One truth for workspace counts + switcher (F14 partial, P1)
Home "4 workspaces waiting", switcher ~14, grid "All 55", notification "54".
Diagnose each source (endpoint/filter). Likely: grid counts ALL incl. dev-noise
+ archived; home counts a "recent" subset; switcher caps at N without saying so.
Fix: single selector/source-of-truth for workspace counts; switcher gets
current-workspace checkmark + overflow indicator ("14 of 55 — view all").
Card metadata "—" placeholder rows (F21): hide missing metadata instead of "—";
filters that can never match (Virtual/Local/Team all 0 while All=55) either get
real predicates or are removed; drop the "Table — soon" chip.

### W2-C — One truth for the current model (F15, P1)
Top-bar chip `claude-sonnet-4-6` vs Settings Model Pilot "Claude Opus 4.6" vs
raw IDs in New Agent. Diagnose: chip probably shows per-chat model; Model Pilot
shows global default; New Agent lists raw router IDs. Fix: consistent display
names via one formatting util (grep for existing model-name formatter); Model
Pilot fallback must not default to == primary; New Agent model list uses same
labels as everywhere else.

### W2-D — Memory numbers agree (F16, P1)
Timeline "617 entities · 9420 relations" vs Graph tab "No knowledge graph data";
top-bar brain 543 vs Trust "452 memories"; Trust "0 high confidence & fresh"
above rows labeled "fresh". Diagnose each pair: different endpoints? stale
cache? per-workspace vs global scope? Graph-tab emptiness while KG has data is
the highest-value bug (feature looks broken). Fix root causes, not copy.

### W2-E — Onboarding polish batch (F6, P2)
(a) "English (US)" disabled-button pill → plain text badge (or working picker if
one exists); (b) remove duplicate footer "Back" (keep header ← Back);
(c) "help with" chips: default NONE selected (placeholder greeting preview until
≥1 chosen); (d) template picker: rank/badge "Recommended" from who-are-you
role/work-type (pure mapping + test); (e) final step: restore Back + step
counter; (f) final-step suggestion chips filtered to the chosen template.

### W2-F — IA naming + empty states (F7, F12, F19 partial, P2)
Align: sidebar "Agents & tasks" ↔ page "Agent Center" → both "Agents"; sidebar
"Library" ↔ page "Artifacts" → page header "Library" (artifacts remain the
content type); "EVERYTHING ELSE" section label → "Workspace-independent" intent,
pick something plain ("General"). Agent Center sparse state (1 row + honeycomb
void): add template suggestion cards under the row. Files tab empty state gets
an Upload action; Artifacts empty-state "Browse in Library" becomes a real link.

### W2-G — Briefing modal a11y + chat error history parity (F27 + wave-1 residual)
Login-briefing modal: Escape closes; ✕ gets aria-label; "Start Working" disabled
until content ready; drop duplicated greeting (visible identically on Home
behind it). Chat: persisted failed assistant turns ("Generation failed: …")
re-render as ErrorBlock on reload (reuse isAuthShapedError), and the
server-persisted failed pair must not duplicate after a local Retry + reload.

## Deferred to wave 3 (product decisions or heavier)
- F17 Erase-all placement, F18 Never-ask friction (safety UX — quick but opinion-laden)
- F20 marketplace triplicates (needs catalog-merge design)
- F22 dedup, F23 wiki quality floor, F24 weaver explainer
- F25 notifications rework, F26 team invite moment, F28 responsive top bar
- F29 locale, F30 copy nits, F31 tier naming (Solo vs Free), F32 stale drawer/breadcrumb
