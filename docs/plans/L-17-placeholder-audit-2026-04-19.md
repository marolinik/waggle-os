# L-17 · MOCK / TODO / FIXME audit — 2026-04-19 (rev 2026-05-10)

Scope: `apps/web/src`, `packages/*/src` (excludes test directories and
HTML `placeholder="..."` attributes).

Grep pattern: `// (MOCK|TODO|FIXME|XXX):` or the `/* … */` equivalent.

Current count: **6** lines (revision history below). All 6 are intentional
subtree-split STUB markers in the `hive-mind-hooks-*` packages introduced
by the Phase 2 consolidation merge of `feature/hive-mind-monorepo-migration`
(2026-05-10). They flag hook implementations awaiting Wave 2/3 work; they
are load-bearing for both waggle-os main and the public hive-mind repo
subtree-split. Zero new production code may introduce a marker without
updating `tests/placeholder-audit.test.ts` and this document in the same
commit.

**Revision history:**
- 2026-04-19: 14 → 10 (initial L-17 audit + C2/C3/C4/C5 cleanup)
- 2026-05-08: 10 → 0 (DAY0V-01 WS gateway hard-fail replaces TODO + DAY0V-02
  deletes `mock-channel-connectors.ts`)
- 2026-05-10: 0 → 6 (Phase 2 consolidation merge introduces `hive-mind-hooks-*`
  subtree-split stubs; see Category D below)

## Category A — RESOLVED 2026-05-08 (was 9 hits, now 0)

**`packages/agent/src/connectors/mock-channel-connectors.ts`** — DELETED
in DAY0V-02 (2026-05-08). The file's 9 `// MOCK:` markers are gone with
the file. Real connectors (`slack-connector.ts`, `discord-connector.ts`,
`ms-teams-connector.ts`) are unaffected — they were never the same
classes. No tests referenced the mocks (verified via grep), and the
mocks were already gated behind `NODE_ENV !== 'production'` in
`setup-connectors.ts`, so no production user ever saw them registered.

**2026-04-20 decision was:** keep as "(Demo)" connectors until real
OAuth integrations land. **2026-05-08 supersedes:** PM master Day-0 ETA
is 2026-05-08..12, and the mock-vs-real conflation surface is itself a
launch risk per CONCERNS.md §4. Drop the mocks now; reintroduce only
when real OAuth ships under different class names.

## Category B — RESOLVED 2026-05-08 (was 1 hit, now 0)

| File | Line | Original note | Resolution |
|---|---|---|---|
| `packages/server/src/ws/gateway.ts` | 91 | Replace with full Clerk verification once `CLERK_SECRET_KEY` is always configured | DAY0V-01 / commit `d6971f6` (2026-05-08, rebased from `8ec8419`) — replaced unsigned-JWT-decode fallback with hard-fail in production + connection-time reject in dev/desktop. `decodeJwtPayload()` deleted. |

## Category D — INTENTIONAL STUBS introduced 2026-05-10 (6 hits)

Phase 2 consolidation merge of `feature/hive-mind-monorepo-migration` brought
in 11 new `hive-mind-*` packages, of which 6 are subtree-split hook stubs
awaiting Wave 2/3 implementation. The `// TODO: Wave 2/3 implementation`
markers are load-bearing — they signal to developers (in both waggle-os main
and the public hive-mind repo) that these hooks aren't implemented yet.

| File | Line | Marker | Status |
|---|---|---|---|
| `packages/hive-mind-hooks-claude-desktop/src/index.ts` | 10 | `// TODO: Wave 2/3 implementation` | OPEN — implements Wave 2/3 |
| `packages/hive-mind-hooks-codex-desktop/src/index.ts` | 10 | `// TODO: Wave 2/3 implementation` | OPEN — implements Wave 2/3 |
| `packages/hive-mind-hooks-codex/src/index.ts` | 10 | `// TODO: Wave 2/3 implementation` | OPEN — implements Wave 2/3 |
| `packages/hive-mind-hooks-cursor/src/index.ts` | 10 | `// TODO: Wave 2/3 implementation` | OPEN — implements Wave 2/3 |
| `packages/hive-mind-hooks-hermes/src/index.ts` | 10 | `// TODO: Wave 2/3 implementation` | OPEN — implements Wave 2/3 |
| `packages/hive-mind-hooks-openclaw/src/index.ts` | 10 | `// TODO: Wave 2/3 implementation` | OPEN — implements Wave 2/3 |

**Note:** The `hive-mind-hooks-claude-code` package does NOT carry a stub
marker — it has Wave 1 implementation complete. Wave 2/3 covers the
remaining 6 client integrations.

**Resolution path:** when each Wave 2/3 hook gets real implementation, drop
its marker AND bump `EXPECTED_MARKER_COUNT` down by 1 in the same commit.
Once all 6 are implemented, count returns to 0 and Category D collapses.

## Category C — Closed 2026-04-20 (4 hits resolved)

These TODOs shipped concrete fixes in the 2026-04-20 cleanup pass and
no longer appear in the codebase:

| Commit | File | Original TODO | Resolution |
|---|---|---|---|
| `a748f8f` | `apps/web/src/hooks/useMemory.ts:54` | Dedicated `PATCH /api/memory/frames/:id/access` endpoint for atomic increment | Added the PATCH route + `LocalAdapter.incrementFrameAccess`. `FrameStore.touch()` now returns the new count via SQL RETURNING. |
| `2367426` | `packages/core/src/compliance/report-generator.ts:52` | Track classification date in workspace config | Added `riskLevel` + `riskClassifiedAt` to `WorkspaceConfig`; `WorkspaceManager` auto-stamps on change; `ReportGenerator` reads via `getWorkspaceRiskClassifiedAt` dep. |
| `b8dab3d` | `apps/web/src/components/os/apps/CapabilitiesApp.tsx:352` | Marketplace tab may show duplicate catalog data | Added pure `dedupePacks()` helper; applied client-side on both merged `packs` and `marketplacePacks`. |
| `49b8e6d` | `packages/server/src/local/routes/fleet.ts:32` | Track per-session tokens | `WorkspaceSession.tokensUsed` + `WorkspaceSessionManager.addTokens()`; chat route hooks after `costTracker.addUsage`. Fleet reads the real value. |

## Regression guard

`tests/placeholder-audit.test.ts` runs on CI and fails if the
production-path marker count diverges from the pinned value
(`EXPECTED_MARKER_COUNT`). A contributor adding a new TODO in
production code must:
  1. Categorise it here (mock / follow-up / closed).
  2. Bump the pinned count in the test.

Making a ticket easy is better than making the rule loud.
