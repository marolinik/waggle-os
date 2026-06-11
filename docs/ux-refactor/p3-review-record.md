# P3 — D2 Two-Mind Memory Center: adversarial review record (2026-06-11)

**Workflow:** 6 dimension finders (races / contract / security / parity / tests / ux) → per-finding
adversarial refuter. 36 agents. **19 confirmed / 11 refuted.** First run was VOID (all finders hit
the session limit and returned nothing — recorded here because an empty "confirmed" list from a
dead run is indistinguishable from a clean one unless you check the failures block).

## The HIGH (confirmed independently by 5 of 6 dimensions)

**Cross-mind fall-through on mutations** — `candidateStores` pushed the personal store
unconditionally after the workspace store, and PATCH/archive/DELETE/merge acted on the first store
resolving the id. Frame ids collide across the per-mind SQLite DBs (observed on real data: id 36 in
both minds), so a stale workspace row whose id had vanished from the workspace store would resolve
to — and hard-delete/patch/merge-archive — an unrelated PERSONAL memory, returning 200. The path
became reachable for the first time in this phase (pre-P3, the UI never sent `workspace` on these
mutations). Verifier note: the "two concurrent surfaces" trigger is weak in the single-window app,
but background deletion lanes (W4.3 replace-on-update, compaction, cleanup_frames MCP) + open stale
lists make it ordinary anyway.

**Fix:** mind-strict resolution. `candidateStores(workspace, mind?)` — when the caller declares
`mind`, exactly that store is consulted, no fallback; `parseMind` 400s on invalid values. All five
single-memory routes + merge accept `mind`; the adapter threads it; MemoryCenterTab (the only
caller) always declares it. Legacy no-mind fall-through preserved and PINNED as back-compat.
Server pins: workspace-mind PATCH/archive/DELETE succeed; personal-only id + `mind=workspace` →
404 with the personal frame intact; merge never resolves its id set in personal; 400 contracts.

## Other confirmed findings → dispositions

| # | Sev | Finding | Disposition |
|---|-----|---------|-------------|
| 2 | MED | `mutate()`'s closured `await load()` beats the loadSeq guard — old-mind/old-filter rows can win after a mid-mutation mind/filter switch | FIXED: post-mutation refetch rides a `reloadTick` state through the load effect (always current props); pinned with a deferred-archive + mid-flight switch test |
| 3,15 | LOW/MED | In-flight old-mind response can commit into the reset→next-load window | FIXED: mind-switch reset effect bumps `loadSeq` (invalidates in-flight commits) |
| 5 | LOW | Reset/load keyed on raw `workspaceId` — personal-mind instances wiped on workspace churn | FIXED: keyed on effective `wsParam` |
| 18 | LOW | Misleading "No memories match these filters." during the 250ms debounce window after a switch | FIXED: reset effect sets `loading=true` |
| 7 | MED | Audit events stamped the REQUEST's workspaceId, not the resolved mind | FIXED: all five audit sites attribute `c.mind === 'workspace' ? workspace : 'personal'` (incl. POST-create unknown-workspace fallback) |
| 4,19 | LOW | `?filter=` stash strands when landing on a legacy tab; replays later | FIXED: route stashes only when the landing view is Memories |
| 10 | LOW | URL keeps advertising `?filter=` after the one-shot stash is consumed | FIXED: route strips the param post-consumption (`replace`); refresh/share can't re-seed a stale filter |
| 12 | MED | J08 cold-load route stash unpinned | FIXED: route-level pins (stash + strip; legacy-tab drop) |
| 13 | MED | No server test exercised ANY workspace-mind mutation | FIXED: mutation suite added (see HIGH pins) |
| 14 | MED | Cross-mind fall-through unpinned | FIXED: HIGH pin above |
| 11,17 | LOW | Workspace pill could announce pressed+disabled simultaneously; pills lacked group semantics | FIXED: `aria-pressed` only when enabled; `role="group"` labeled |
| 16 | LOW | Tab bar lacked tablist semantics | FIXED: `role="tablist"`/`role="tab"`/`aria-selected` |

## Refuted (11) — examples

XSS via the moved `dangerouslySetInnerHTML` (renderSimpleMarkdown's two defenses hold); path
traversal via the workspace param (getWorkspaceMindDb resolves from an allowlisted map);
mind+filter interaction double-counting (per-store getRecent precedes the merge slice exactly as
before); WorkspaceDesktopApp uncontrolled-mode regression (import is side-effect-free); StrictMode
double-stash (ref-latched); several parity claims (banner gating, context-rail wiring, KG scope
selector all carried over).

## Behavior change vs the pre-review build (review happened before anything was committed)

`?filter=` no longer survives in the URL after consumption, and a mind switch no longer carries it
(one-shot intent semantics) — the original "filter survives the switch" route pin was replaced
accordingly.
