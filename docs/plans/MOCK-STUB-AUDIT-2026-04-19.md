# MOCK / STUB / PLACEHOLDER Audit — 2026-04-19 (L-17)

Full-tree grep for `TODO` / `FIXME` / `XXX` / `HACK` / `STUB` / `PLACEHOLDER`
/ `MOCK` markers across `packages/*/src`, `apps/web/src`, and
`app/src-tauri` (excluding `.test.ts` / `.spec.ts` / `node_modules` /
`dist/`). Result: **19 real hits**, split by category below.

Most are low-risk (self-documenting design markers or marked-demo
connectors). Two genuine TODOs tie to HIGH-tier work already in the
plan. One dead export was cleaned up in this commit.

## Category A — Safe (design markers, not gaps)

| Hit | What it is |
|---|---|
| `packages/agent/src/evolution-gates.ts:17` | Doc comment — explaining the gate's detection of placeholder-like patterns in generated prompts. Marker appears INSIDE a regex description, not as a real TODO. |
| `packages/agent/src/evolution-gates.ts:261` | Doc comment — the `toDoFixMe` gate rejects evolved prompts containing `TODO:` / `FIXME:` headers. Marker is part of the feature. |
| `packages/agent/src/evolution-gates.ts` (regex body) | Actual regex string — `^\s*(?:TODO|FIXME|XXX)\s*:` — same feature as above. |
| `packages/server/src/local/routes/skills.ts:773` | Template string returned to the USER when they create a new tool: `'TODO: implement'`. User's responsibility to complete; not a Waggle TODO. |

**Action:** None. These are intentional and part of shipping features.

## Category B — Marked-demo connectors (Marko-aware)

`packages/agent/src/connectors/mock-channel-connectors.ts` — 9 `MOCK:`
comments across 3 demo connectors:
  - `MockSlackConnector`
  - `MockTeamsConnector`
  - `MockDiscordConnector`

File-header comment is explicit:
> "DEMO: Mock channel connectors for testing and demo mode.
> Remove when real OAuth integration is ready."

Exported through `packages/agent/src/connectors/index.ts` and
`packages/agent/src/index.ts` as `MockSlackConnector` etc. Appear in
Settings → Connectors with "(Demo)" badge in their display names.

**Action needed (your call):**
1. **Keep for launch** — they're useful as demo surfaces for evaluators
   who don't want to wire up real OAuth. Label stays "(Demo)".
2. **Gate to development-only** — tier-check them out of production
   connector catalogs. Keep the code for dev-mode tests.
3. **Delete** — ship without these 3 entries. Requires replacement with
   real OAuth (tied to M-29 MS Graph effort) before they can reappear.

**Recommendation:** option 1 until real integrations land. Users see
"(Demo)" affordance, know what they're getting, no production risk.

## Category C — Genuine TODOs (feature gaps)

### C1. `packages/server/src/ws/gateway.ts:91` — Clerk JWT fallback

```
// TODO: Replace with full Clerk verification once CLERK_SECRET_KEY is always configured
const payload = decodeJwtPayload(token);
```

The WebSocket gateway currently decodes JWT payload without signature
verification when `CLERK_SECRET_KEY` isn't set. **Blocks H-36** (Clerk
auth integration — already on the TO-DO list). When H-36 lands this
TODO goes away.

**Action:** Tracked by H-36. No separate fix.

### C2. `packages/core/src/compliance/report-generator.ts:52` — classification date

```ts
riskClassifiedAt: null, // TODO: track classification date in workspace config
```

Compliance report emits `riskClassifiedAt: null` because the workspace
config doesn't currently persist the timestamp. EU AI Act Article 14
expects "last risk classification date" in the provenance chain.

**Action:** add `riskClassifiedAt?: string` to `WorkspaceConfig` + set
it when the Risk Level dropdown changes. ~1 hr. Fold into M-02..06
Compliance PDF block.

### C3. `packages/server/src/local/routes/fleet.ts:32` — per-session tokens

```ts
tokensUsed: 0, // TODO: track per-session tokens
```

Fleet cost report shows `tokensUsed: 0` for every session because the
orchestrator doesn't currently aggregate per-session token usage.

**Action:** add token accumulator to `SessionStore` schema + increment
on each LLM response. ~3 hr. Priority: medium (cost visibility is a
selling point, not launch-blocking).

### C4. `apps/web/src/components/os/apps/CapabilitiesApp.tsx:352` — marketplace dupes

```jsx
{/* TODO: Marketplace tab may show duplicate data if getMarketplacePacks()
     returns same content as getSkills() — needs backend fix to serve
     distinct catalog */}
```

The Capabilities app's Marketplace tab may show duplicate rows because
the two APIs return overlapping catalogs.

**Action:** verify backend returns disjoint catalogs, or de-dupe client-
side by id. ~2 hr. Priority: medium (UX confusion).

### C5. `apps/web/src/hooks/useMemory.ts:54` — missing PATCH endpoint

```ts
// TODO: Ideally needs a dedicated PATCH /api/memory/frames/:id/access endpoint
// that atomically increments accessCount on the server. For now, we use PUT with
```

Memory access tracking uses `PUT` + full-field overwrite instead of an
atomic increment. Race condition risk on concurrent frame access.

**Action:** add `PATCH /api/memory/frames/:id/access` that increments
`access_count` atomically. ~1 hr. Priority: low — race condition is
theoretical (access is per-user).

## Category D — Cleanup shipped this commit

### D1. Dead `MOCK_FILES` export (fixed)

`apps/web/src/components/os/apps/files/file-utils.ts:40` — `MOCK_FILES`
was a pre-adapter demo-seed array with 6 fake entries. Grep confirmed
no consumers anywhere in `apps/web/src` or `tests/`.

**Action taken:** removed. FilesApp reads from `adapter.getDocuments()`
and similar real paths; the mock array was unused since the adapter
refactor.

## Summary

| Category | Count | Action |
|---|---|---|
| A. Safe design markers | 4 | No action |
| B. Marked-demo connectors | 9 | Your call (recommend option 1 — keep as "(Demo)") |
| C. Genuine TODOs | 5 | 3 are ≤3hr fixes; 2 tie to existing H-36 / M-02..06 |
| D. Cleanup | 1 | ✅ Shipped (MOCK_FILES removed) |

**Net after this commit:**
- Category A: unchanged (intentional)
- Category B: decision-blocked on Marko option 1/2/3
- Category C: 3 new backlog items (C2, C3, C4, C5 — though C1 folds into H-36)
- Category D: dead code removed

**Backlog surfaces:** C2 (classification date, folds into M-02..06),
C3 (per-session tokens, new M-item), C4 (marketplace dedupe, new M-item),
C5 (PATCH access endpoint, new L-item).

L-17 was scoped 4 hr; actual work was ~1 hr (scope turned out smaller
than the HIGH-tier estimate — codebase is clean). Rest of the budget
rolls back into the TO-DO list.
