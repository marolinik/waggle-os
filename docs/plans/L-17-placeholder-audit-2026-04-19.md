# L-17 · MOCK / TODO / FIXME audit — 2026-04-19 (rev 2026-04-20)

Scope: `apps/web/src`, `packages/*/src` (excludes test directories and
HTML `placeholder="..."` attributes).

Grep pattern: `// (MOCK|TODO|FIXME|XXX):` or the `/* … */` equivalent.

Current count: **10** lines across 2 files. Down from 14 on 2026-04-19
after C2/C3/C4/C5 cleanup this session. Zero new production code may
introduce a marker without updating `tests/placeholder-audit.test.ts`
and this document in the same commit.

## Category A — Intentional mock code, correctly labelled (9 hits)

**`packages/agent/src/connectors/mock-channel-connectors.ts`** — the file
name declares itself as mock. `MOCK:` labels on each method are correct
and load-bearing: they tell reviewers not to mistake the fake behaviour
for real connector logic.

**2026-04-20 decision (Marko):** keep as "(Demo)" connectors until real
OAuth integrations land. That work is parked in *AFTER Benchmarks*
bucket (real OAuth follows M-29 MS Graph OAuth, which is v2). No action
pre-launch.

## Category B — Tracked follow-ups (1 hit)

| File | Line | Note | Follow-up |
|---|---|---|---|
| `packages/server/src/ws/gateway.ts` | 91 | Replace with full Clerk verification once `CLERK_SECRET_KEY` is always configured | H-36 (Clerk auth integration) — moved to *AFTER Benchmarks* bucket on 2026-04-20 |

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
