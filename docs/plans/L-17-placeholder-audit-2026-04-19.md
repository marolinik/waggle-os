# L-17 · MOCK / TODO / FIXME audit — 2026-04-19 (rev 2026-05-08)

Scope: `apps/web/src`, `packages/*/src` (excludes test directories and
HTML `placeholder="..."` attributes).

Grep pattern: `// (MOCK|TODO|FIXME|XXX):` or the `/* … */` equivalent.

Current count: **0** lines. Down from 10 on 2026-04-20 after the
2026-05-08 DAY0V-01 + DAY0V-02 cleanup pass (Phase 1 of v1.0
milestone): WS gateway TODO replaced with cryptographic-or-fail logic
and `mock-channel-connectors.ts` deleted. Zero new production code may
introduce a marker without updating `tests/placeholder-audit.test.ts`
and this document in the same commit.

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
| `packages/server/src/ws/gateway.ts` | 91 | Replace with full Clerk verification once `CLERK_SECRET_KEY` is always configured | DAY0V-01 / commit `8ec8419` (2026-05-08) — replaced unsigned-JWT-decode fallback with hard-fail in production + connection-time reject in dev/desktop. `decodeJwtPayload()` deleted. |

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
