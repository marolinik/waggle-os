# Server ↔ Client Contracts

## Pattern overview

Server routes in `packages/server/src/local/routes/` and the frontend client in `apps/web/` are written independently. When a field is renamed on one side without updating the other, the runtime crash is typically silent until a UI path exercises the field — usually in production.

**The fix is always the same:** normalise at the adapter boundary.

`apps/web/src/lib/adapter.ts` is the **sole HTTP client** for the frontend. Every server response flows through it. When a server and client disagree on a field name or shape, the adapter method for that route is the right place to accept both shapes and produce the declared TypeScript type. Callers never see the server's raw payload.

```
server (packages/server/.../routes/*.ts)
    ↓  raw JSON
adapter.ts  ← normalise here
    ↓  declared TypeScript type (types.ts)
component / hook
```

## Testing convention

For each route where normalisation is needed, add a test file under:

```
apps/web/src/lib/contracts/<route-slug>.contract.test.ts
```

Each test must:
1. Define a **fixture** that matches the server's *current* emit shape (verify by reading the route handler source).
2. Pass the fixture through the **adapter method** via a mocked `fetch`.
3. Assert the **declared client type** is satisfied — every field, correct type, no undefined where a number/string is expected.
4. Include at least one **negative / edge case**: unknown enum value, missing optional field, legacy alternate field name.

This keeps the two sides pinned: if someone renames a field on the server, the corresponding contract test breaks at CI time rather than at customer time.

---

## Incidents (2026-04-30 E2E session)

The pattern produced four P0/P1 crashes in a single session. Each was patched with adapter normalisation and is now pinned by a contract test.

### FR #2 — WaggleDanceApp crashed on unknown signal types
**Commit:** `ea04110`  
**Route:** `GET /api/waggle/signals` (SSE)  
**Problem:** `fleet.ts` emits signals with `type` values like `agent:started`, `tool:called`, `agent:completed`. The frontend `typeConfig` record only knew `discovery | handoff | insight | alert | coordination`. Accessing `typeConfig['agent:started']` returned `undefined`; destructuring it crashed at render time.  
**Fix:** Added `getTypeConfig(type: string)` with `FALLBACK_TYPE_CONFIG` fallback. Extracted to `apps/web/src/lib/waggle-signal-types.ts` to enable unit testing.  
**Contract test:** `apps/web/src/lib/contracts/waggle-signals.contract.test.ts`

### FR #3 — Chat model dropdown fell through to stale default
**Commit:** `2b6ffe1`  
**Route:** `GET /api/agent/model`  
**Problem:** Server returns `{ model: "claude-sonnet-4-6" }`. The declared return type of `adapter.getModel()` is `string`. The method was returning the raw object, so callers received `[object Object]` instead of the model string. The Chat dropdown compared this against `settings.defaultModel` and always fell through to the stale fallback.  
**Fix:** `adapter.getModel()` now unwraps `{ model }` objects and passes bare strings through unchanged.  
**Contract test:** `apps/web/src/lib/contracts/agent-model.contract.test.ts`

### FR #14 — SpawnAgentDialog confirm step crashed on `.toFixed` of undefined
**Commit:** `55671b6`  
**Route:** `GET /api/litellm/pricing`  
**Problem:** Route handler (`packages/server/src/local/routes/litellm.ts`) emits `{ inputPer1k, outputPer1k }`. Frontend `ModelPricing` type declares `{ inputCostPer1k, outputCostPer1k }`. SpawnAgentDialog formatted the confirm step with `inputCostPer1k.toFixed(4)` — `undefined.toFixed` threw.  
**Fix:** `adapter.getModelPricing()` normalises both field-name variants; missing fields fall back to `0`.  
**Contract test:** `apps/web/src/lib/contracts/litellm-pricing.contract.test.ts`

### FR #16 — MissionControlApp crashed on `.toLocaleString` of undefined
**Commit:** `aef42a9`  
**Route:** `GET /api/fleet`  
**Problem:** Route handler emits `{ durationMs, tokensUsed }`. Frontend `FleetSession` type declares `{ duration, tokenUsage }`. MissionControlApp rendered `session.tokenUsage.toLocaleString()` — `undefined.toLocaleString` threw.  
**Fix:** `adapter.getFleet()` normalises both field-name variants; missing fields fall back to `0`.  
**Contract test:** `apps/web/src/lib/contracts/fleet.contract.test.ts`

---

## When adding a new route

1. Implement the route in `packages/server/src/local/routes/`.
2. Add the adapter method in `apps/web/src/lib/adapter.ts`. If the server shape might diverge from the client type, normalise in the adapter method.
3. Add a contract test in `apps/web/src/lib/contracts/<slug>.contract.test.ts`.
4. Run `cd apps/web && npm test` to confirm the new test passes alongside the rest.

If you discover a drift bug without a corresponding contract test, fix the adapter and add the test in the same PR. A fix without a test will drift again.
