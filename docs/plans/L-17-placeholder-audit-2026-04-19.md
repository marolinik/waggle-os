# L-17 · MOCK / TODO / FIXME audit — 2026-04-19

Scope: `apps/web/src`, `packages/*/src` (excludes test directories and
HTML `placeholder="..."` attributes).

Grep pattern: `// (MOCK|TODO|FIXME|XXX):` or the `/* … */` equivalent.

Current count: **14** lines across 5 files. Zero new production code
may introduce a marker without updating `tests/placeholder-audit.test.ts`
and this document in the same commit.

## Category A — Intentional mock code, correctly labelled (9 hits)

**`packages/agent/src/connectors/mock-channel-connectors.ts`** — the file
name declares itself as mock. `MOCK:` labels on each method are correct
and load-bearing: they tell reviewers not to mistake the fake behaviour
for real connector logic. No action.

## Category B — Tracked follow-ups (5 hits)

| File | Line | Note | Follow-up |
|---|---|---|---|
| `packages/server/src/ws/gateway.ts` | 91 | Replace with full Clerk verification once `CLERK_SECRET_KEY` is always configured | H-36 (Clerk auth integration) |
| `packages/core/src/compliance/report-generator.ts` | 52 | `riskClassifiedAt: null` — track classification date in workspace config | M2 compliance UX block |
| `packages/server/src/local/routes/fleet.ts` | 32 | `tokensUsed: 0` — track per-session tokens | Telemetry completeness, post-launch |
| `apps/web/src/hooks/useMemory.ts` | 54 | Ideally needs a dedicated `PATCH /api/memory/frames/:id/access` endpoint | Non-blocking; current path works |
| `apps/web/src/components/os/apps/CapabilitiesApp.tsx` | 252 | Marketplace duplicate data fix — backend should serve distinct catalog | M1-adjacent marketplace polish |

No action in this commit beyond pinning the count.

## Regression guard

`tests/placeholder-audit.test.ts` runs on CI and fails if the
production-path marker count diverges from the pinned value. A
contributor adding a new TODO in production code must:
  1. Categorise it here (mock / follow-up / remove).
  2. Bump the pinned count in the test.

Making a ticket easy is better than making the rule loud.
